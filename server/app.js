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

const ROOT = path.join(__dirname, "..");
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

  // per-IP in-memory rate limiter (Fly.io single process; no external store needed)
  function makeRateLimit(windowMs, max) {
    const hits = new Map();
    return async (req, reply) => {
      const ip = req.ip || "unknown";
      const now = Date.now();
      let arr = (hits.get(ip) || []).filter((t) => now - t < windowMs);
      arr.push(now);
      hits.set(ip, arr);
      if (hits.size > 2000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      if (arr.length > max) { reply.code(429).send({ error: "too many requests" }); return; }
    };
  }
  const authRateLimit = makeRateLimit(60000, 12);
  const scoreRateLimit = makeRateLimit(60000, 40);

  // ---------- health ----------
  app.get("/api/health", async (_req, reply) =>
    reply.send({ ok: true, ts: Date.now(), version: "1.0.0" })
  );

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

  // ---------- scores + replays (webosu leaderboard, additive to catboy.best) ----------
  app.post("/api/scores", { preHandler: [authRequired, scoreRateLimit] }, async (req, reply) => {
    const s = req.body || {};
    if (s.beatmap_id == null || s.score == null)
      return reply.code(400).send({ error: "missing beatmap_id or score" });
    if (typeof s.beatmap_id !== "number" || typeof s.score !== "number" || !isFinite(s.beatmap_id) || !isFinite(s.score))
      return reply.code(400).send({ error: "invalid beatmap_id or score" });
    const v = validateReplay(s, s.beatmap, s.replay);
    const scoreId = D.insertScore({
      user_id: req.user.id,
      beatmap_id: s.beatmap_id,
      beatmap_set_id: s.beatmap_set_id,
      title: s.title, artist: s.artist, version: s.version,
      mods: s.mods, mods_num: s.modsNum,
      score: s.score, max_combo: s.combo, acc: parseFloat(s.acc) || 0,
      grade: s.grade, count300: s.count300, count100: s.count100, count50: s.count50, miss: s.miss,
      approved: v.approved ? 1 : 0,
    });
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
    reply.send({ ok: true, id: scoreId, rank: rank || null, score: row, validation: v });
  });

  app.get("/api/leaderboards/:beatmapId", async (req, reply) => {
    const beatmapId = parseInt(req.params.beatmapId, 10);
    const modsNum = req.query.mods != null ? parseInt(req.query.mods, 10) : null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    reply.send(D.leaderboard(beatmapId, modsNum, limit));
  });

  app.get("/api/scores/:id", async (req, reply) => {
    const row = D.getScore(parseInt(req.params.id, 10));
    if (!row) return reply.code(404).send({ error: "not found" });
    reply.send(row);
  });

  app.get("/api/replays/:id", async (req, reply) => {
    const r = D.getReplay(parseInt(req.params.id, 10));
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
    reply.send({ user: u, stats, achievements });
  });

  app.get("/api/profile/me", { preHandler: authRequired }, async (req, reply) => {
    const prof = D.getProfile(req.user.id) || {};
    reply.send({
      settings: prof.settings ? JSON.parse(prof.settings) : null,
      favorites: prof.favorites ? JSON.parse(prof.favorites) : null,
    });
  });

  app.put("/api/profile/me", { preHandler: authRequired }, async (req, reply) => {
    const { settings, favorites } = req.body || {};
    if (settings != null) D.setProfileField(req.user.id, "settings", JSON.stringify(settings));
    if (favorites != null) D.setProfileField(req.user.id, "favorites", JSON.stringify(favorites));
    reply.send({ ok: true });
  });

  // ---------- skins (webosu-specific sharing) ----------
  app.get("/api/skins", async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const offset = parseInt(req.query.offset, 10) || 0;
    reply.send(D.listSkins(limit, offset));
  });

  app.post("/api/skins", { preHandler: authRequired }, async (req, reply) => {
    if (!Buffer.isBuffer(req.body)) return reply.code(400).send({ error: "expected binary body" });
    if (req.body.length > 64 * 1024 * 1024) return reply.code(413).send({ error: "too large" });
    const name = (req.headers["x-skin-name"] || "skin").toString().slice(0, 80);
    const filename = (req.headers["x-skin-filename"] || "skin.osk").toString().slice(0, 120);
    const id = D.insertSkin({
      user_id: req.user.id, author: req.user.username, name, filename,
      size: req.body.length, data: req.body,
    });
    reply.send({ ok: true, id, name, filename, size: req.body.length });
  });

  app.get("/api/skins/:id", async (req, reply) => {
    const s = D.getSkin(parseInt(req.params.id, 10));
    if (!s) return reply.code(404).send({ error: "not found" });
    reply.header("Content-Type", "application/octet-stream");
    reply.header("Content-Disposition", 'attachment; filename="' + (s.filename || "skin.osk") + '"');
    reply.send(Buffer.from(s.data));
  });

  // ---------- comments on beatmap sets ----------
  app.get("/api/comments/:setId", async (req, reply) =>
    reply.send(D.commentsFor(parseInt(req.params.setId, 10)))
  );
  app.post("/api/comments/:setId", { preHandler: authRequired }, async (req, reply) => {
    const body = (req.body && req.body.body) || "";
    if (!body.trim()) return reply.code(400).send({ error: "empty" });
    const id = D.addComment(parseInt(req.params.setId, 10), req.user.id, body.slice(0, 1000));
    reply.send({ ok: true, id, username: req.user.username, body });
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
    });
    res.write(": connected\n\n");
    feed.add(res);
  });

  // ---------- static frontend ----------
  if (serveStatic) {
    app.register(fastifyStatic, {
      root: ROOT,
      prefix: "/",
      index: "index.html",
      cacheControl: false,
      setHeaders: (res, p) => {
        if (/\.(ogg|wav|png|jpg|jpeg|svg|woff2|ttf|cur)$/.test(p))
          res.setHeader("Cache-Control", "public, max-age=86400");
      },
    });
  }

  return app;
}

module.exports = { buildApp, feed };
