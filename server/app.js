"use strict";
// Fastify app builder for webosu's backend. Exports buildApp() so the route
// layer can be tested with app.inject() (no port binding) and so server/index.js
// only owns listen + the WebSocket server. Behavior is a 1:1 port of the
// previous Express server (server/index.js pre-Fastify): same routes, same
// auth, same static-serve blocking, same SSE feed. db/auth/validate/pp carry
// over unchanged (framework-agnostic).
const path = require("path");
const fs = require("fs");
const Fastify = require("fastify");
const fastifyStatic = require("@fastify/static");
const D = require("./db");
const A = require("./auth");
const { estimatePP } = require("./pp");
const { validate: validateReplay } = require("./validate");
const apiCatalog = require("./routes/catalog");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist"); // vite build output (production)
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// live activity feed (SSE) — module-local so the score route can broadcast
const feed = {
  clients: new Set(),
  add(res) {
    this.clients.add(res);
    res.on("close", () => this.clients.delete(res));
  },
  broadcast(obj) {
    const line = "data: " + JSON.stringify(obj) + "\n\n";
    for (const c of this.clients) {
      try { c.write(line); } catch (e) {}
    }
  },
};

// Fastify preHandler that verifies the Bearer JWT and sets req.user, or 401.
async function authRequired(req, reply) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  const payload = token ? A.verifyToken(token) : null;
  if (!payload) {
    reply.code(401).send({ error: "unauthorized" });
    return;
  }
  req.user = payload;
}

function buildApp({ serveStatic = true } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 });

  // raw octet-stream bodies (skin uploads) -> Buffer
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  // block private paths from static serving (matches the old Express guard)
  app.addHook("onRequest", async (req, reply) => {
    const p = (req.url.split("?")[0]);
    if (
      p.startsWith("/server") ||
      p.startsWith("/data") ||
      p.startsWith("/node_modules") ||
      p === "/package.json" ||
      p === "/package-lock.json" ||
      (p.endsWith(".map") && p.startsWith("/js/lib"))
    ) {
      reply.code(404).send("");
      return;
    }
  });

  // per-IP in-memory rate limiter (Fly.io single process; no external store needed).
  // A Map of `ip -> { arr: number[], lastSeen: number }` and a single interval
  // that prunes idle IPs. Replaces the inline `for (const [...])` loop that
  // could grow unbounded under attack (one stale IP per incoming unique IP).
  function makeRateLimit(windowMs, max) {
    const hits = new Map();
    // sweep idle IPs every 60s (cap the map at 10k IPs)
    if (!makeRateLimit._sweepStarted) {
      makeRateLimit._sweepStarted = true;
      const sweep = () => {
        const now = Date.now();
        for (const [k, v] of hits) {
          if (!v || v.length === 0 || (v.lastSeen && now - v.lastSeen > windowMs * 2)) {
            hits.delete(k);
          }
        }
        if (hits.size > 10000) {
          // hard cap: drop oldest 25%
          const entries = Array.from(hits.entries()).sort((a, b) => (a[1].lastSeen || 0) - (b[1].lastSeen || 0));
          for (let i = 0; i < entries.length / 4; i++) hits.delete(entries[i][0]);
        }
      };
      setInterval(sweep, 60_000).unref();
    }
    return async (req, reply) => {
      const ip = req.ip || "unknown";
      const now = Date.now();
      let entry = hits.get(ip);
      if (!entry) { entry = { arr: [], lastSeen: now }; hits.set(ip, entry); }
      entry.arr = entry.arr.filter((t) => now - t < windowMs);
      entry.arr.push(now);
      entry.lastSeen = now;
      if (entry.arr.length > max) { reply.code(429).send({ error: "too many requests" }); return; }
    };
  }
  const authRateLimit = makeRateLimit(60000, 12);
  const scoreRateLimit = makeRateLimit(60000, 40);

  // ---------- health ----------
  app.get("/api/health", async (_req, reply) =>
    reply.send({ ok: true, ts: Date.now(), version: "1.0.0" })
  );
  // Version metadata — small payload, useful for the SPA to detect upgrades.
  app.get("/api/version", async (_req, reply) =>
    reply.send({
      name: "webosu-server",
      version: "1.0.0",
      node: process.version,
      uptime: Math.round(process.uptime()),
      features: {
        auth: true,
        scores: true,
        replays: true,
        pp: true,
        profiles: true,
        rankings: true,
        skins: true,
        comments: true,
        tournaments: true,
        sse: true,
        ws: true,
        ranked: true,
        lazer: true,
      },
    })
  );
  // HTTP CORS for /api/* — same-origin in prod, dev origin in dev (vite :5173).
  // (Lazer-pwa same-origin requests don't need this, but it unblocks mobile
  // apps and tools that hit the API from a different origin.)
  app.addHook("onSend", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
      reply.header("Access-Control-Max-Age", "86400");
    }
  });
  // Lightweight structured access log: one line per non-2xx request, with a
  // request-id header for correlating client errors with server output. Disabled
  // in the test harness (NODE_ENV=test) so headless output stays clean.
  if (process.env.NODE_ENV !== "test") {
    let reqCounter = 0;
    app.addHook("onRequest", async (req, _reply) => {
      req._logId = (++reqCounter).toString(36) + "-" + Date.now().toString(36);
      req._logStart = process.hrtime.bigint();
      try { req.raw && req.raw.headers && req.raw.headers["x-request-id"]; } catch {}
    });
    app.addHook("onResponse", async (req, reply) => {
      try {
        const startNs = req._logStart || process.hrtime.bigint();
        const ms = Number((process.hrtime.bigint() - startNs) / 1000000n);
        const url = (req.url || "").split("?")[0];
        const status = reply.statusCode;
        if (status >= 400) console.log("[webosu] " + req._logId + " " + req.method + " " + url + " -> " + status + " (" + ms + "ms)");
      } catch (e) {}
    });
  }
  apiCatalog.register(app);
app.options("/*", async (_req, reply) => reply.code(204).send(""));

  // ---------- auth ----------
  app.post("/api/auth/register", { preHandler: authRateLimit }, async (req, reply) => {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || typeof password !== "string") return reply.code(400).send({ error: "invalid fields" });
    if (!username || !password) return reply.code(400).send({ error: "missing fields" });
    if (username.length < 3 || username.length > 20)
      return reply.code(400).send({ error: "username must be 3-20 chars" });
    if (password.length < 6) return reply.code(400).send({ error: "password too short" });
    if (D.getUserByName(username)) return reply.code(409).send({ error: "username taken" });
    const user = D.createUser(username, A.hashPassword(password));
    reply.send({ token: A.signToken(user), user: D.getUserById(user.id) });
  });

  app.post("/api/auth/login", { preHandler: authRateLimit }, async (req, reply) => {
    const { username, password } = req.body || {};
    const user = D.getUserByName(username);
    if (!user || !A.verifyPassword(password, user.pass_hash))
      return reply.code(401).send({ error: "invalid credentials" });
    reply.send({ token: A.signToken(user), user: D.getUserById(user.id) });
  });

  app.get("/api/auth/me", { preHandler: authRequired }, async (req, reply) =>
    reply.send({ user: D.getUserById(req.user.id) })
  );

  // ---------- pp estimate (additive, public) ----------
  app.get("/api/pp", async (req, reply) => {
    const q = req.query;
    const pp = estimatePP({
      stars: parseFloat(q.stars) || 0,
      acc: q.acc != null ? parseFloat(q.acc) / 100 : undefined,
      c300: +q.c300 || 0, c100: +q.c100 || 0, c50: +q.c50 || 0, miss: +q.miss || 0,
      combo: +q.combo || 0, maxCombo: +q.maxCombo || 0, modsNum: +q.modsNum || 0,
    });
    reply.send({ pp, estimate: true });
  });

  // rosu-pp-js accurate PP (takes raw .osu text) — proxied via :8080
  // v2: lazer mode + full mod acronym list (opts.modsList)
  app.post("/api/pp/rosu", async (req, reply) => {
    const { osu, mods, modsNum, modsList, accuracy, acc, combo, n300, n100, n50, misses, miss, c300, c100, c50 } = req.body || {};
    const osuText = osu || req.body?.osuText || req.body?.beatmap;
    if (!osuText || typeof osuText !== "string" || osuText.length < 100) {
      return reply.code(400).send({ error: "missing osu text" });
    }
    const { calcRosuPP } = require("./pp");
    const m = mods != null ? mods : (modsNum != null ? modsNum : 0);
    const a = accuracy != null ? accuracy : (acc != null ? acc : undefined);
    const r = calcRosuPP(osuText, {
      mods: m, accuracy: a, lazer: true,
      modsList: Array.isArray(modsList) ? modsList : null,
      combo: combo != null ? combo : 0,
      n300: n300 != null ? n300 : c300, n100: n100 != null ? n100 : c100, n50: n50 != null ? n50 : c50,
      misses: misses != null ? misses : (miss != null ? miss : 0),
    });
    if (!r) return reply.code(422).send({ error: "rosu calc failed or suspicious map" });
    reply.send({ pp: r.pp, stars: r.stars, maxPP: r.maxPP, rosu: true, lazer: true });
  });

  // ---------- scores + replays (webosu leaderboard, additive to catboy.best) ----------
  app.post("/api/scores", { preHandler: [authRequired, scoreRateLimit] }, async (req, reply) => {
    const s = req.body || {};
    if (s.beatmap_id == null || s.score == null)
      return reply.code(400).send({ error: "missing beatmap_id or score" });
    if (typeof s.beatmap_id !== "number" || typeof s.score !== "number" || !isFinite(s.beatmap_id) || !isFinite(s.score))
      return reply.code(400).send({ error: "invalid beatmap_id or score" });
    if (s.beatmap_id <= 0 || s.score < 0)
      return reply.code(400).send({ error: "beatmap_id or score out of range" });
    // Cap input sizes so a malicious client can't cause OOM by sending a 5MB
    // replay or 1MB mods_hash. The replay is stored as a BLOB in sqlite.
    if (Array.isArray(s.replay) && s.replay.length > 300000)
      return reply.code(413).send({ error: "replay too large" });
    if (Array.isArray(s.mods_list) && s.mods_list.length > 32)
      return reply.code(413).send({ error: "mods_list too large" });
    const v = validateReplay(s, s.beatmap, s.replay);
    // Reject unknown mods (v2 validation)
    if (v.mods_error) return reply.code(400).send({ error: v.mods_error });
    // Compute PP via rosu-pp if raw .osu is available
    let pp = 0;
    if (s.beatmap && s.beatmap.hitObjects && typeof s.beatmap.track === "string" && s.beatmap.track.length > 100) {
      try {
        const { calcRosuPP } = require("./pp");
        const modsList = Array.isArray(s.mods_list) ? s.mods_list : null;
        const r = calcRosuPP(s.beatmap.track, {
          lazer: true, modsList,
          accuracy: parseFloat(s.acc) || 0,
          combo: s.combo || 0,
          n300: s.count300 || 0, n100: s.count100 || 0, n50: s.count50 || 0,
          misses: s.miss || 0,
        });
        if (r && r.pp) pp = r.pp;
      } catch (e) { /* PP calc failed — store 0 */ }
    }
    const scoreId = D.insertScore({
      user_id: req.user.id,
      beatmap_id: s.beatmap_id,
      beatmap_set_id: s.beatmap_set_id,
      title: s.title, artist: s.artist, version: s.version,
      mods: s.mods, mods_num: s.modsNum,
      score: s.score, max_combo: s.combo, acc: parseFloat(s.acc) || 0,
      grade: s.grade, count300: s.count300, count100: s.count100, count50: s.count50, miss: s.miss,
      approved: v.approved ? 1 : 0,
      ruleset_version: s.ruleset_version || "v2",
      mods_hash: v.mods_hash,
      ranked: v.ranked ? 1 : 0,
      pp,
    });
    // Recalc the user's total PP after the new score
    if (pp > 0 && v.ranked) D.recalcTotalPP(req.user.id);
    if (s.replay && Array.isArray(s.replay)) {
      D.insertReplay(scoreId, Buffer.from(JSON.stringify(s.replay)), s.replay.length);
    }
    if ((s.miss || 0) === 0) D.award(req.user.id, "first_fc");
    if ((s.count300 || 0) > 0 && (s.miss || 0) === 0 && (s.count100 || 0) === 0 && (s.count50 || 0) === 0)
      D.award(req.user.id, "perfect");
    if ((s.combo || 0) >= 500) D.award(req.user.id, "combo_500");
    const lb = D.leaderboard(s.beatmap_id, s.modsNum || 0, 100000);
    const rank = lb.findIndex((r) => r.id === scoreId) + 1;
    const row = D.getScore(scoreId);
    feed.broadcast({
      type: "score", id: scoreId, beatmap_id: s.beatmap_id, title: s.title,
      version: s.version, score: s.score, acc: s.acc, grade: s.grade,
      mods: s.mods, username: req.user.username,
    });
    // Discord webhook relay (if configured) — fire-and-forget, don't block response
    try {
      const hook = process.env.DISCORD_WEBHOOK_URL;
      if (hook) {
        const payload = {
          username: "webosu",
          embeds: [{
            title: `${s.artist || ""} - ${s.title || ""} [${s.version || ""}]`,
            description: `**${s.grade || "?"}** • ${s.score} • ${s.acc || "?"}% • ${s.combo || 0}x`,
            color: s.grade === "SS" || s.grade === "S" ? 0xFFD966 : s.grade === "A" ? 0x66CC66 : 0x4AA3E8,
            fields: [
              { name: "Player", value: String(req.user.username), inline: true },
              { name: "Mods", value: s.mods || "None", inline: true },
              { name: "Beatmap", value: `${s.beatmap_id} (set ${s.beatmap_set_id || "?"})`, inline: false },
            ],
            timestamp: new Date().toISOString(),
          }],
        };
        // don't await, just log errors
        fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
          .catch(e => console.warn("[discord] webhook failed", e.message));
      }
    } catch (e) { console.warn("[discord] hook error", e.message); }
    reply.send({ ok: true, id: scoreId, rank: rank || null, score: row, validation: v });
  });

  // Discord webhook-compatible score relay — proxied via Fly :8080 -> /api/webhook/score
  // Accepts either a Discord-style payload (content/embeds) or the legacy webosu summary.
  // If DISCORD_WEBHOOK_URL is set, forwards to Discord; always stores to local DB if auth'd.
  app.post("/api/webhook/score", { preHandler: makeRateLimit(60000, 20) }, async (req, reply) => {
    const body = req.body || {};
    // If body looks like a Discord payload with _webosu, extract summary
    const summary = body._webosu || body;
    const hook = process.env.DISCORD_WEBHOOK_URL;
    let forwarded = false;
    if (hook) {
      try {
        // If body already has Discord fields (content/embeds), forward as-is; else wrap summary
        const discordPayload = (body.content || body.embeds) ? body : {
          username: "webosu",
          content: `**${summary.player || summary.username || "Unknown"}** scored **${summary.score || 0}** on **${summary.artist || ""} - ${summary.title || ""} [${summary.version || ""}]**`,
          embeds: [{
            title: `${summary.artist || ""} - ${summary.title || ""} [${summary.version || ""}]`,
            description: `**${summary.grade || "?"}** • ${summary.score || 0} • ${summary.acc || "?"} • ${summary.combo || 0}x`,
            color: 0xFF66AA,
            fields: [
              { name: "Player", value: String(summary.player || summary.username || "Unknown"), inline: true },
              { name: "Mods", value: summary.mods || "None", inline: true },
              { name: "Score", value: String(summary.score || 0), inline: true },
            ],
            timestamp: new Date().toISOString(),
          }],
        };
        const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(discordPayload) });
        forwarded = r.ok;
        if (!r.ok) console.warn("[discord] webhook non-2xx", r.status, await r.text().catch(()=> ""));
      } catch (e) {
        console.warn("[discord] webhook error", e.message);
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.log("[discord] no webhook configured");
    }
    // also store to local DB if it's a valid webosu score and auth is present (optional)
    // For webhook-compatibility, we don't require auth — just acknowledge.
    reply.send({ ok: true, forwarded, webhook: !!hook });
  });

  app.get("/api/leaderboards/:beatmapId", async (req, reply) => {
    const beatmapId = parseInt(req.params.beatmapId, 10);
    if (!isFinite(beatmapId) || beatmapId <= 0) return reply.code(400).send({ error: "invalid beatmapId" });
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const version = req.query.version || "v2";  // v2 = lazer-scaled (default), v1 = legacy
    const modsHash = req.query.mods_hash != null ? req.query.mods_hash : null;
    if (version === "v1") {
      // legacy v1 leaderboard (by mods_num bitmask)
      const modsNum = req.query.mods != null ? parseInt(req.query.mods, 10) : null;
      reply.send(D.leaderboard(beatmapId, modsNum, limit));
    } else {
      // v2 lazer-scaled leaderboard (per-mod-combination via mods_hash)
      reply.send(D.leaderboardV2(beatmapId, modsHash, limit, { version: "v2", ranked: req.query.ranked === "false" ? false : true }));
    }
  });

  // List distinct mod combinations played on a beatmap (for the UI selector)
  app.get("/api/leaderboards/:beatmapId/mods", async (req, reply) => {
    const beatmapId = parseInt(req.params.beatmapId, 10);
    if (!isFinite(beatmapId) || beatmapId <= 0) return reply.code(400).send({ error: "invalid beatmapId" });
    reply.send(D.leaderboardModCombos(beatmapId));
  });

  app.get("/api/scores/:id", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid id" });
    const row = D.getScore(id);
    if (!row) return reply.code(404).send({ error: "not found" });
    reply.send(row);
  });

  app.get("/api/replays/:id", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!isFinite(id) || id <= 0) return reply.code(400).send({ error: "invalid id" });
    const r = D.getReplay(id);
    if (!r) return reply.code(404).send({ error: "not found" });
    reply.header("Content-Type", "application/json");
    reply.send(Buffer.from(r.data).toString("utf8"));
  });

  app.get("/api/activity/recent", async (_req, reply) => reply.send(D.recentScores(20)));

  // ---------- profiles + sync ----------
  app.get("/api/profiles/:username", async (req, reply) => {
    const u = D.getUserByName(req.params.username);
    if (!u) return reply.code(404).send({ error: "not found" });
    const stats = D.userStats(u.id);
    const achievements = D.achievements(u.id);
    const globalRank = D.userRank(u.id);
    const countryRank = D.userCountryRank(u.id);
    reply.send({ user: u, stats, achievements, globalRank, countryRank });
  });

  // Recent plays for a specific user (paginated)
  app.get("/api/profiles/:username/recent", async (req, reply) => {
    const u = D.getUserByName(req.params.username);
    if (!u) return reply.code(404).send({ error: "not found" });
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    // Cap total window at 500 to avoid OOM on huge pages
    const total = D.userScoresCount(u.id);
    const items = D.userScoresRecent(u.id, limit, offset);
    reply.send({ items, total, limit, offset });
  });

  // Look up a user by numeric id. Useful for client-side profile hydration when
  // you only know the id (e.g. from a /api/me or score row that includes user_id).
  app.get("/api/users/:id", async (req, reply) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "bad id" });
    const u = D.getUserById(id);
    if (!u) return reply.code(404).send({ error: "not found" });
    const stats = D.userStats(u.id);
    const globalRank = D.userRank(u.id);
    const countryRank = D.userCountryRank(u.id);
    reply.send({ user: u, stats, globalRank, countryRank });
  });

  // ---------- rankings ----------
  app.get("/api/rankings", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    reply.send(D.rankings(limit, offset));
  });

  app.get("/api/rankings/country/:country", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    reply.send(D.rankingsByCountry(req.params.country, limit, offset));
  });

  // Convenience: the logged-in user''s own row + ranking + nearby rivals.
  // Returns enough info for a profile page header without 4 round-trips.
  app.get("/api/me", { preHandler: authRequired }, async (req, reply) => {
    try {
      const u = D.getUserById(req.user.id);
      if (!u) return reply.code(404).send({ error: "user not found" });
      const stats = D.userStats(u.id);
      const achievements = D.achievements(u.id);
      const globalRank = D.userRank(u.id);
      const countryRank = D.userCountryRank(u.id);
      reply.send({ user: u, stats, achievements, globalRank, countryRank });
    } catch (e) {
      return reply.code(500).send({ error: "internal" });
    }
  });

  app.get("/api/profile/me", { preHandler: authRequired }, async (req, reply) => {
    const prof = D.getProfile(req.user.id) || {};
    reply.send({
      settings: prof.settings ? JSON.parse(prof.settings) : null,
      favorites: prof.favorites ? JSON.parse(prof.favorites) : null,
    });
  });

  // Current user's own scores (paginated, newest first)
  app.get("/api/me/scores", { preHandler: authRequired }, async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const total = D.userScoresCount(req.user.id);
    const items = D.userScoresRecent(req.user.id, limit, offset);
    reply.send({ items, total, limit, offset });
  });

  app.put("/api/profile/me", { preHandler: authRequired }, async (req, reply) => {
    const { settings, favorites, pfp_url } = req.body || {};
    if (settings != null) D.setProfileField(req.user.id, "settings", JSON.stringify(settings));
    if (favorites != null) D.setProfileField(req.user.id, "favorites", JSON.stringify(favorites));
    if (pfp_url != null) {
      // store pfp_url directly on the users table
      D.db.prepare("UPDATE users SET pfp_url = ? WHERE id = ?").run(pfp_url, req.user.id);
    }
    reply.send({ ok: true });
  });

  // ---------- skins (webosu-specific sharing) ----------
  app.get("/api/skins", { preHandler: makeRateLimit(60000, 30) }, async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    reply.send(D.listSkins(limit, offset));
  });

  app.post("/api/skins", { preHandler: [authRequired, makeRateLimit(60000, 5)] }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: "expected binary body" });
    if (req.body.length > 20 * 1024 * 1024) return reply.code(413).send({ error: "too large" });
    const sanitize = (s) => s.toString().replace(/[^a-zA-Z0-9._\- ]/g, "_").replace(/\.+/g, ".").slice(0, 80);
    const name = sanitize(req.headers["x-skin-name"] || "skin");
    const filename = sanitize(req.headers["x-skin-filename"] || "skin.osk").replace(/[^a-zA-Z0-9._\-]/g, "_").slice(0, 120);
    const id = D.insertSkin({
      user_id: req.user.id, author: req.user.username, name, filename,
      size: req.body.length, data: req.body,
    });
    reply.send({ ok: true, id, name, filename, size: req.body.length });
  });

  app.get("/api/skins/:id", async (req, reply) => {
    const sid = parseInt(req.params.id, 10); if (!isFinite(sid) || sid <= 0) return reply.code(400).send({ error: 'invalid id' }); const s = D.getSkin(sid);
    if (!s) return reply.code(404).send({ error: "not found" });
    reply.header("Content-Type", "application/octet-stream");
    const safe = (s.filename || "skin.osk").replace(/[^a-zA-Z0-9._\-]/g, "_");
    reply.header("Content-Disposition", 'attachment; filename="' + safe + '"; filename*=UTF-8\'\'' + encodeURIComponent(safe));
    reply.send(Buffer.from(s.data));
  });

  // ---------- comments on beatmap sets ----------
  // Validate setId as a finite positive integer (the DB layer assumes this).
  function parseSetId(raw) {
    const n = parseInt(raw, 10);
    if (!isFinite(n) || n <= 0) return null;
    return n;
  }
  app.get("/api/comments/:setId", async (req, reply) => {
    const setId = parseSetId(req.params.setId);
    if (setId == null) return reply.code(400).send({ error: "invalid setId" });
    return reply.send(D.commentsFor(setId));
  });
  app.post("/api/comments/:setId", { preHandler: authRequired }, async (req, reply) => {
    const setId = parseSetId(req.params.setId);
    if (setId == null) return reply.code(400).send({ error: "invalid setId" });
    const body = (req.body && req.body.body) || "";
    if (!body.trim()) return reply.code(400).send({ error: "empty" });
    if (body.length > 1000) return reply.code(413).send({ error: "body too long" });
    const id = D.addComment(setId, req.user.id, body.slice(0, 1000));
    reply.send({ ok: true, id, username: req.user.username, body: body.slice(0, 1000) });
  });

  // ---------- achievements ----------
  app.get("/api/achievements/me", { preHandler: authRequired }, async (req, reply) =>
    reply.send(D.achievements(req.user.id))
  );

  // ---------- tournaments (scaffold) ----------
  app.get("/api/tournaments", async (_req, reply) => reply.send(D.listTournaments()));
  app.post("/api/tournaments", { preHandler: authRequired }, async (req, reply) => {
    const name = (req.body && req.body.name) || "Untitled tournament";
    const id = D.createTournament(name, req.user.id);
    reply.send({ ok: true, id, name });
  });

  // ---------- live activity feed (SSE) ----------
  app.get("/api/activity", async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");
    // Detect client disconnect and remove from feed so a stalled client
    // doesn't block broadcasts for everyone else.
    const cleanup = () => { try { feed.clients.delete(res); } catch {} };
    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);
    feed.add(res);
  });

  // ---------- static frontend ----------
  // Production serves the Vite build (dist/) when present; dev falls back to
  // the source tree (Vite's own dev server is the frontend in dev, so this only
  // matters when hitting :8080 directly or in the Fly.io deploy).
  if (serveStatic) {
    const staticRoot = fs.existsSync(path.join(DIST, "index.html")) ? DIST : ROOT;
    app.register(fastifyStatic, {
      root: staticRoot,
      prefix: "/",
      index: "index.html",
      cacheControl: false,
      setHeaders: (res, p) => {
        const setHeader = (k, v) => {
          if (typeof res.setHeader === "function") res.setHeader(k, v);
          else if (typeof res.header === "function") res.header(k, v);
          else if (res.raw && typeof res.raw.setHeader === "function") res.raw.setHeader(k, v);
        };
        // content-hashed Vite assets (dist/assets/*-[hash].*) are immutable
        if (staticRoot === DIST && /[\\/]assets[\\/][^\\/]+-[A-Za-z0-9_]{6,}\.[A-Za-z0-9]+$/.test(p))
          setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else if (/\.(ogg|wav|png|jpg|jpeg|svg|woff2|ttf|cur|osk)$/.test(p))
          setHeader("Cache-Control", "public, max-age=86400");
      },
    });
  }

  // SPA fallback: serve index.html for any non-API, non-file route
  // (Vue Router handles client-side routing)
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      reply.code(404).send({ error: "not found" });
    } else if (serveStatic) {
      const staticRoot = fs.existsSync(path.join(DIST, "index.html")) ? DIST : ROOT;
      reply.sendFile("index.html");
    } else {
      reply.code(404).send("not found");
    }
  });

  return app;
}

module.exports = { buildApp, feed };
