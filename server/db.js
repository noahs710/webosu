"use strict";
const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, "..", "data", "webosu.db");

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  country TEXT,
  bio TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  beatmap_id INTEGER NOT NULL,
  beatmap_set_id INTEGER,
  title TEXT, artist TEXT, version TEXT,
  mods TEXT, mods_num INTEGER DEFAULT 0,
  score INTEGER NOT NULL,
  max_combo INTEGER DEFAULT 0,
  acc REAL DEFAULT 0,
  grade TEXT,
  count300 INTEGER DEFAULT 0, count100 INTEGER DEFAULT 0, count50 INTEGER DEFAULT 0, miss INTEGER DEFAULT 0,
  replay_id INTEGER,
  approved INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_beatmap ON scores(beatmap_id, mods_num);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);

CREATE TABLE IF NOT EXISTS replays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  score_id INTEGER REFERENCES scores(id),
  frames INTEGER DEFAULT 0,
  data BLOB,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  author TEXT,
  name TEXT NOT NULL,
  filename TEXT,
  size INTEGER,
  data BLOB,
  downloads INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  beatmap_set_id INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_set ON comments(beatmap_set_id);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  settings TEXT,
  favorites TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  host_id INTEGER REFERENCES users(id),
  beatmap_set_id INTEGER,
  state TEXT DEFAULT 'open',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host_id INTEGER REFERENCES users(id),
  beatmap_set_id INTEGER,
  beatmap_id INTEGER,
  state TEXT DEFAULT 'lobby',
  created_at INTEGER NOT NULL
);
`);

const now = () => Date.now();

module.exports = {
  db,
  // ---- users ----
  createUser(username, passHash) {
    db.prepare(
      "INSERT INTO users (username, pass_hash, created_at) VALUES (?, ?, ?)"
    ).run(username, passHash, now());
    return this.getUserByName(username);
  },
  getUserByName(username) {
    return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  },
  getUserById(id) {
    return db.prepare("SELECT id, username, country, bio, created_at FROM users WHERE id = ?").get(id);
  },
  setProfileField(userId, field, value) {
    // whitelist field to prevent SQL injection
    const allowed = ["settings", "favorites"];
    if (!allowed.includes(field)) throw new Error("invalid profile field");
    db.prepare(
      `INSERT INTO profiles (user_id, ${field}, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET ${field}=excluded.${field}, updated_at=excluded.updated_at`
    ).run(userId, value, now());
  },
  getProfile(userId) {
    return db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId);
  },

  // ---- scores + replays ----
  insertScore(s) {
    // node:sqlite cannot bind undefined; coerce optionals to null
    const n = (v) => (v == null ? null : v);
    const r = db.prepare(`INSERT INTO scores
      (user_id, beatmap_id, beatmap_set_id, title, artist, version, mods, mods_num,
       score, max_combo, acc, grade, count300, count100, count50, miss, replay_id, approved, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      s.user_id, s.beatmap_id, n(s.beatmap_set_id), n(s.title), n(s.artist), n(s.version),
      n(s.mods), s.mods_num || 0, s.score, s.max_combo || 0, s.acc || 0, n(s.grade),
      s.count300 || 0, s.count100 || 0, s.count50 || 0, s.miss || 0, s.replay_id || null,
      s.approved ? 1 : 0, now()
    );
    return r.lastInsertRowid;
  },
  insertReplay(scoreId, data, frames) {
    const r = db.prepare(
      "INSERT INTO replays (score_id, frames, data, created_at) VALUES (?, ?, ?, ?)"
    ).run(scoreId, frames, Buffer.from(data), now());
    db.prepare("UPDATE scores SET replay_id = ? WHERE id = ?").run(r.lastInsertRowid, scoreId);
    return r.lastInsertRowid;
  },
  getReplay(id) {
    return db.prepare("SELECT * FROM replays WHERE id = ?").get(id);
  },
  getScore(id) {
    return db.prepare(
      "SELECT sc.*, u.username FROM scores sc JOIN users u ON u.id = sc.user_id WHERE sc.id = ?"
    ).get(id);
  },
  leaderboard(beatmapId, modsNum, limit) {
    // best score per user on this beatmap (optionally filtered by mods)
    if (modsNum != null) {
      return db.prepare(`
        SELECT sc.id, sc.replay_id, sc.beatmap_id, sc.beatmap_set_id, sc.version, sc.score, sc.acc, sc.max_combo, sc.grade, sc.mods, sc.miss, u.username
        FROM scores sc JOIN users u ON u.id = sc.user_id
        WHERE sc.beatmap_id = ? AND sc.mods_num = ? AND sc.approved = 1
        GROUP BY sc.user_id HAVING MAX(sc.score)
        ORDER BY sc.score DESC LIMIT ?`).all(beatmapId, modsNum, limit);
    }
    return db.prepare(`
      SELECT sc.id, sc.replay_id, sc.beatmap_id, sc.beatmap_set_id, sc.version, sc.score, sc.acc, sc.max_combo, sc.grade, sc.mods, sc.miss, u.username
      FROM scores sc JOIN users u ON u.id = sc.user_id
      WHERE sc.beatmap_id = ? AND sc.approved = 1
      GROUP BY sc.user_id HAVING MAX(sc.score)
      ORDER BY sc.score DESC LIMIT ?`).all(beatmapId, limit);
  },
  userBest(userId, beatmapId) {
    return db.prepare(
      "SELECT * FROM scores WHERE user_id = ? AND beatmap_id = ? ORDER BY score DESC LIMIT 1"
    ).get(userId, beatmapId);
  },
  userStats(userId) {
    const row = db.prepare(`
      SELECT COUNT(*) plays, MAX(score) max_score, MAX(max_combo) max_combo,
             SUM(count300) c300, SUM(count100) c100, SUM(count50) c50, SUM(miss) miss,
             AVG(acc) avg_acc
      FROM scores WHERE user_id = ?`).get(userId);
    return row;
  },
  recentScores(limit) {
    return db.prepare(`
      SELECT sc.id, sc.beatmap_id, sc.title, sc.version, sc.score, sc.acc, sc.grade, sc.mods, u.username
      FROM scores sc JOIN users u ON u.id = sc.user_id
      ORDER BY sc.created_at DESC LIMIT ?`).all(limit);
  },

  // ---- skins ----
  insertSkin(s) {
    const r = db.prepare(
      "INSERT INTO skins (user_id, author, name, filename, size, data, created_at) VALUES (?,?,?,?,?,?,?)"
    ).run(s.user_id, s.author, s.name, s.filename, s.size, Buffer.from(s.data), now());
    return r.lastInsertRowid;
  },
  getSkin(id) {
    const s = db.prepare("SELECT * FROM skins WHERE id = ?").get(id);
    if (s) db.prepare("UPDATE skins SET downloads = downloads + 1 WHERE id = ?").run(id);
    return s;
  },
  listSkins(limit, offset) {
    return db.prepare(
      "SELECT id, author, name, filename, size, downloads, created_at FROM skins ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).all(limit, offset);
  },

  // ---- comments ----
  addComment(setId, userId, body) {
    const r = db.prepare(
      "INSERT INTO comments (beatmap_set_id, user_id, body, created_at) VALUES (?,?,?,?)"
    ).run(setId, userId, body, now());
    return r.lastInsertRowid;
  },
  commentsFor(setId) {
    return db.prepare(`
      SELECT c.id, c.body, c.created_at, u.username
      FROM comments c JOIN users u ON u.id = c.user_id
      WHERE c.beatmap_set_id = ? ORDER BY c.created_at DESC`).all(setId);
  },

  // ---- achievements ----
  award(userId, key) {
    try {
      db.prepare("INSERT INTO achievements (user_id, key, created_at) VALUES (?,?,?)").run(userId, key, now());
      return true;
    } catch (e) { return false; } // UNIQUE violation -> already has it
  },
  achievements(userId) {
    return db.prepare("SELECT key, created_at FROM achievements WHERE user_id = ?").all(userId);
  },

  // ---- tournaments ----
  createTournament(name, hostId) {
    const r = db.prepare("INSERT INTO tournaments (name, host_id, created_at) VALUES (?,?,?)").run(name, hostId, now());
    return r.lastInsertRowid;
  },
  listTournaments() {
    return db.prepare("SELECT * FROM tournaments ORDER BY created_at DESC").all();
  },

  // ---- rooms ----
  createRoom(id, name, hostId, setId, beatmapId) {
    db.prepare("INSERT INTO rooms (id, name, host_id, beatmap_set_id, beatmap_id, created_at) VALUES (?,?,?,?,?,?)")
      .run(id, name, hostId, setId, beatmapId, now());
  },
  getRoom(id) { return db.prepare("SELECT * FROM rooms WHERE id = ?").get(id); },
  deleteRoom(id) { db.prepare("DELETE FROM rooms WHERE id = ?").run(id); },
};
