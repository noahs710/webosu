"use strict";
const express = require("express");
const path = require("path");
const http = require("http");
const fs = require("fs");
const { WebSocketServer } = require("ws");
const D = require("./db");
const A = require("./auth");
const { estimatePP } = require("./pp");

const app = express();
const PORT = process.env.PORT || 8080;
const ROOT = path.join(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: "32mb" }));
app.use(express.raw({ type: "application/octet-stream", limit: "64mb" }));

// block private paths from static serving
app.use((req, res, next) => {
  const p = req.path;
  if (
    p.startsWith("/server") ||
    p.startsWith("/data") ||
    p.startsWith("/node_modules") ||
    p === "/package.json" ||
    p === "/package-lock.json" ||
    p.endsWith(".map") && p.startsWith("/js/lib")
  )
    return res.status(404).end();
  next();
});

// ---------- health ----------
app.get("/api/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now(), version: "1.0.0" })
);

// ---------- auth ----------
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "missing fields" });
  if (username.length < 3 || username.length > 20)
    return res.status(400).json({ error: "username must be 3-20 chars" });
  if (password.length < 6) return res.status(400).json({ error: "password too short" });
  if (D.getUserByName(username)) return res.status(409).json({ error: "username taken" });
  const user = D.createUser(username, A.hashPassword(password));
  res.json({ token: A.signToken(user), user: D.getUserById(user.id) });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = D.getUserByName(username);
  if (!user || !A.verifyPassword(password, user.pass_hash))
    return res.status(401).json({ error: "invalid credentials" });
  res.json({ token: A.signToken(user), user: D.getUserById(user.id) });
});

app.get("/api/auth/me", A.authRequired, (req, res) => {
  res.json({ user: D.getUserById(req.user.id) });
});

// ---------- pp estimate (additive, public) ----------
app.get("/api/pp", (req, res) => {
  const q = req.query;
  const pp = estimatePP({
    stars: parseFloat(q.stars) || 0,
    acc: q.acc != null ? parseFloat(q.acc) / 100 : undefined,
    c300: +q.c300 || 0, c100: +q.c100 || 0, c50: +q.c50 || 0, miss: +q.miss || 0,
    combo: +q.combo || 0, maxCombo: +q.maxCombo || 0, modsNum: +q.modsNum || 0,
  });
  res.json({ pp, estimate: true });
});

// ---------- scores + replays (webosu's own leaderboard, additive to catboy.best) ----------
app.post("/api/scores", A.authRequired, (req, res) => {
  const s = req.body || {};
  if (s.beatmap_id == null || s.score == null)
    return res.status(400).json({ error: "missing beatmap_id or score" });
  const scoreId = D.insertScore({
    user_id: req.user.id,
    beatmap_id: s.beatmap_id,
    beatmap_set_id: s.beatmap_set_id,
    title: s.title, artist: s.artist, version: s.version,
    mods: s.mods, mods_num: s.modsNum,
    score: s.score, max_combo: s.combo, acc: parseFloat(s.acc) || 0,
    grade: s.grade, count300: s.count300, count100: s.count100, count50: s.count50, miss: s.miss,
  });
  if (s.replay && Array.isArray(s.replay)) {
    D.insertReplay(scoreId, Buffer.from(JSON.stringify(s.replay)), s.replay.length);
  }
  // achievements (webosu-specific badges)
  if ((s.miss || 0) === 0) D.award(req.user.id, "first_fc");
  if ((s.count300 || 0) > 0 && (s.miss || 0) === 0 && (s.count100 || 0) === 0 && (s.count50 || 0) === 0) D.award(req.user.id, "perfect");
  if ((s.combo || 0) >= 500) D.award(req.user.id, "combo_500");
  // rank
  const lb = D.leaderboard(s.beatmap_id, s.modsNum || 0, 100000);
  const rank = lb.findIndex((r) => r.id === scoreId) + 1;
  const row = D.getScore(scoreId);
  feed.broadcast({
    type: "score", id: scoreId, beatmap_id: s.beatmap_id, title: s.title,
    version: s.version, score: s.score, acc: s.acc, grade: s.grade,
    mods: s.mods, username: req.user.username,
  });
  res.json({ ok: true, id: scoreId, rank: rank || null, score: row });
});

app.get("/api/leaderboards/:beatmapId", (req, res) => {
  const beatmapId = parseInt(req.params.beatmapId, 10);
  const modsNum = req.query.mods != null ? parseInt(req.query.mods, 10) : null;
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  res.json(D.leaderboard(beatmapId, modsNum, limit));
});

app.get("/api/scores/:id", (req, res) => {
  const row = D.getScore(parseInt(req.params.id, 10));
  if (!row) return res.status(404).json({ error: "not found" });
  res.json(row);
});

app.get("/api/replays/:id", (req, res) => {
  const r = D.getReplay(parseInt(req.params.id, 10));
  if (!r) return res.status(404).json({ error: "not found" });
  res.setHeader("Content-Type", "application/json");
  res.send(Buffer.from(r.data).toString("utf8"));
});

app.get("/api/activity/recent", (_req, res) => {
  res.json(D.recentScores(20));
});

// ---------- profiles + sync ----------
app.get("/api/profiles/:username", (req, res) => {
  const u = D.getUserByName(req.params.username);
  if (!u) return res.status(404).json({ error: "not found" });
  const stats = D.userStats(u.id);
  const achievements = D.achievements(u.id);
  res.json({ user: u, stats, achievements });
});

app.get("/api/profile/me", A.authRequired, (req, res) => {
  const prof = D.getProfile(req.user.id) || {};
  res.json({ settings: prof.settings ? JSON.parse(prof.settings) : null, favorites: prof.favorites ? JSON.parse(prof.favorites) : null });
});

app.put("/api/profile/me", A.authRequired, (req, res) => {
  const { settings, favorites } = req.body || {};
  if (settings != null) D.setProfileField(req.user.id, "settings", JSON.stringify(settings));
  if (favorites != null) D.setProfileField(req.user.id, "favorites", JSON.stringify(favorites));
  res.json({ ok: true });
});

// ---------- skins (webosu-specific sharing) ----------
app.get("/api/skins", (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  res.json(D.listSkins(limit, offset));
});

app.post("/api/skins", A.authRequired, (req, res) => {
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: "expected binary body" });
  if (req.body.length > 64 * 1024 * 1024) return res.status(413).json({ error: "too large" });
  const name = (req.headers["x-skin-name"] || "skin").toString().slice(0, 80);
  const filename = (req.headers["x-skin-filename"] || "skin.osk").toString().slice(0, 120);
  const id = D.insertSkin({
    user_id: req.user.id, author: req.user.username, name, filename,
    size: req.body.length, data: req.body,
  });
  res.json({ ok: true, id, name, filename, size: req.body.length });
});

app.get("/api/skins/:id", (req, res) => {
  const s = D.getSkin(parseInt(req.params.id, 10));
  if (!s) return res.status(404).json({ error: "not found" });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", 'attachment; filename="' + (s.filename || "skin.osk") + '"');
  res.send(Buffer.from(s.data));
});

// ---------- comments on beatmap sets ----------
app.get("/api/comments/:setId", (req, res) => {
  res.json(D.commentsFor(parseInt(req.params.setId, 10)));
});
app.post("/api/comments/:setId", A.authRequired, (req, res) => {
  const body = (req.body && req.body.body) || "";
  if (!body.trim()) return res.status(400).json({ error: "empty" });
  const id = D.addComment(parseInt(req.params.setId, 10), req.user.id, body.slice(0, 1000));
  res.json({ ok: true, id, username: req.user.username, body });
});

// ---------- achievements ----------
app.get("/api/achievements/me", A.authRequired, (req, res) => {
  res.json(D.achievements(req.user.id));
});

// ---------- tournaments (scaffold) ----------
app.get("/api/tournaments", (_req, res) => res.json(D.listTournaments()));
app.post("/api/tournaments", A.authRequired, (req, res) => {
  const name = (req.body && req.body.name) || "Untitled tournament";
  const id = D.createTournament(name, req.user.id);
  res.json({ ok: true, id, name });
});

// ---------- live activity feed (SSE) ----------
const feed = {
  clients: new Set(),
  add(res) { this.clients.add(res); res.on("close", () => this.clients.delete(res)); },
  broadcast(obj) {
    const line = "data: " + JSON.stringify(obj) + "\n\n";
    for (const c of this.clients) { try { c.write(line); } catch (e) {} }
  },
};
app.get("/api/activity", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(": connected\n\n");
  feed.add(res);
});

// ---------- static frontend ----------
app.use(
  express.static(ROOT, {
    extensions: ["html"],
    index: "index.html",
    setHeaders: (res, p) => {
      if (/\.(ogg|wav|png|jpg|jpeg|svg|woff2|ttf|cur)$/.test(p))
        res.setHeader("Cache-Control", "public, max-age=86400");
    },
  })
);

const server = http.createServer(app);

// ---------- multiplayer + spectate over websocket (minimal, real) ----------
const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new Map(); // roomId -> { name, host, clients: Map(ws -> {user, name}) }
wss.on("connection", (ws) => {
  let joinedRoom = null;
  let joinedName = null;
  ws.on("message", (msg) => {
    let m; try { m = JSON.parse(msg.toString()); } catch (e) { return; }
    if (m.type === "join") {
      const roomId = m.room || "lobby";
      joinedRoom = roomId;
      joinedName = (m.username || "guest").toString().slice(0, 20);
      if (!rooms.has(roomId))
        rooms.set(roomId, { name: roomId, host: joinedName, clients: new Map() });
      const room = rooms.get(roomId);
      room.clients.set(ws, { name: joinedName, ready: false });
      send(ws, { type: "room", room: roomId, host: room.host, users: usersIn(room) });
      broadcast(room, { type: "join", name: joinedName, users: usersIn(room) }, ws);
    } else if (m.type === "cursor" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room) broadcast(room, { type: "cursor", name: joinedName, x: m.x, y: m.y, t: m.t }, ws);
    } else if (m.type === "chat" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room) broadcast(room, { type: "chat", name: joinedName, text: String(m.text || "").slice(0, 300), t: Date.now() }, ws);
    } else if (m.type === "ready" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room) {
        const c = room.clients.get(ws); if (c) c.ready = !!m.ready;
        broadcast(room, { type: "ready", name: joinedName, ready: !!m.ready });
      }
    } else if (m.type === "start" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room && room.host === joinedName)
        broadcast(room, { type: "start", beatmap_id: m.beatmap_id });
    }
  });
  ws.on("close", () => {
    if (joinedRoom && rooms.has(joinedRoom)) {
      const room = rooms.get(joinedRoom);
      room.clients.delete(ws);
      broadcast(room, { type: "leave", name: joinedName, users: usersIn(room) });
      if (room.clients.size === 0) rooms.delete(joinedRoom);
    }
  });
});
function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
function usersIn(room) { return [...room.clients.values()].map((c) => ({ name: c.name, ready: c.ready })); }
function broadcast(room, obj, exceptWs) {
  const data = JSON.stringify(obj);
  for (const [c] of room.clients) if (c !== exceptWs) send(c, obj);
}

server.listen(PORT, () => console.log("webosu-server listening on :" + PORT));
