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
  ruleset_version TEXT DEFAULT 'v1',
  mods_hash TEXT,
  ranked INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_beatmap ON scores(beatmap_id, mods_num);
CREATE INDEX IF NOT EXISTS idx_scores_beatmap_v2 ON scores(beatmap_id, mods_hash, ranked);
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

// Migrate existing tables: add the new columns if they don't exist (idempotent via PRAGMA check)
try {
  const scoreCols = db.prepare("PRAGMA table_info(scores)").all().map(c => c.name);
  if (!scoreCols.includes("ruleset_version")) db.exec("ALTER TABLE scores ADD COLUMN ruleset_version TEXT DEFAULT 'v1'");
  if (!scoreCols.includes("mods_hash")) db.exec("ALTER TABLE scores ADD COLUMN mods_hash TEXT");
  if (!scoreCols.includes("ranked")) db.exec("ALTER TABLE scores ADD COLUMN ranked INTEGER DEFAULT 1");
  if (!scoreCols.includes("pp")) db.exec("ALTER TABLE scores ADD COLUMN pp REAL DEFAULT 0");
} catch (e) { /* columns already exist — safe to ignore */ }
try {
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes("pfp_url")) db.exec("ALTER TABLE users ADD COLUMN pfp_url TEXT");
  if (!userCols.includes("total_pp")) db.exec("ALTER TABLE users ADD COLUMN total_pp REAL DEFAULT 0");
} catch (e) { /* columns already exist — safe to ignore */ }
try { db.exec("CREATE INDEX IF NOT EXISTS idx_scores_beatmap_v2 ON scores(beatmap_id, mods_hash, ranked)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_scores_user_pp ON scores(user_id, pp DESC)"); } catch {}
try { db.exec("CREATE INDEX IF NOT EXISTS idx_users_total_pp ON users(total_pp DESC)"); } catch {}

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
    const n = (v) => (v == null ? null : v);
    const r = db.prepare(`INSERT INTO scores
      (user_id, beatmap_id, beatmap_set_id, title, artist, version, mods, mods_num,
       score, max_combo, acc, grade, count300, count100, count50, miss, replay_id, approved,
       ruleset_version, mods_hash, ranked, pp, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      s.user_id, s.beatmap_id, n(s.beatmap_set_id), n(s.title), n(s.artist), n(s.version),
      n(s.mods), s.mods_num || 0, s.score, s.max_combo || 0, s.acc || 0, n(s.grade),
      s.count300 || 0, s.count100 || 0, s.count50 || 0, s.miss || 0, s.replay_id || null,
      s.approved ? 1 : 0,
      n(s.ruleset_version) || "v1", n(s.mods_hash), s.ranked != null ? (s.ranked ? 1 : 0) : 1,
      s.pp || 0,
      now()
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
    // best score per user on this beatmap (optionally filtered by mods) — legacy v1 query
    if (modsNum != null) {
      return db.prepare(`
        SELECT sc.id, sc.replay_id, sc.beatmap_id, sc.beatmap_set_id, sc.version, sc.score, sc.acc, sc.max_combo, sc.grade, sc.mods, sc.miss, u.username
        FROM scores sc JOIN users u ON u.id = sc.user_id
        WHERE sc.beatmap_id = ? AND sc.mods_num = ? AND sc.approved = 1
          AND sc.score = (SELECT MAX(score) FROM scores WHERE user_id = sc.user_id AND beatmap_id = ? AND mods_num = ? AND approved = 1)
        ORDER BY sc.score DESC LIMIT ?`).all(beatmapId, modsNum, beatmapId, modsNum, limit);
    }
    return db.prepare(`
      SELECT sc.id, sc.replay_id, sc.beatmap_id, sc.beatmap_set_id, sc.version, sc.score, sc.acc, sc.max_combo, sc.grade, sc.mods, sc.miss, u.username
      FROM scores sc JOIN users u ON u.id = sc.user_id
      WHERE sc.beatmap_id = ? AND sc.approved = 1
        AND sc.score = (SELECT MAX(score) FROM scores WHERE user_id = sc.user_id AND beatmap_id = ? AND approved = 1)
      ORDER BY sc.score DESC LIMIT ?`).all(beatmapId, beatmapId, limit);
  },
  // Lazer-scaled leaderboard: v2-only ranked, per-mod-combination via mods_hash.
  // If modsHash is provided, filters to that exact mod combo; else returns the
  // "no mods" (mods_hash = NULL or empty) leaderboard by default.
  leaderboardV2(beatmapId, modsHash, limit, opts) {
    const versionFilter = (opts && opts.version) || "v2";
    const rankedOnly = (opts && opts.ranked === false) ? 0 : 1;
    if (modsHash != null) {
      // specific mod combination
      return db.prepare(`
        SELECT sc.id, sc.replay_id, sc.beatmap_id, sc.beatmap_set_id, sc.version, sc.score, sc.acc, sc.max_combo, sc.grade, sc.mods, sc.mods_hash, sc.miss, sc.ruleset_version, u.username
        FROM scores sc JOIN users u ON u.id = sc.user_id
        WHERE sc.beatmap_id = ? AND sc.mods_hash = ? AND sc.ruleset_version = ? AND sc.ranked = ? AND sc.approved = 1
          AND sc.score = (SELECT MAX(score) FROM scores WHERE user_id = sc.user_id AND beatmap_id = ? AND mods_hash = ? AND ruleset_version = ? AND ranked = ? AND approved = 1)
        ORDER BY sc.score DESC LIMIT ?`)
        .all(beatmapId, modsHash, versionFilter, rankedOnly, beatmapId, modsHash, versionFilter, rankedOnly, limit);
    }
    // no-mods (nomod) leaderboard: mods_hash is NULL or "nomod" or empty
    return db.prepare(`
      SELECT sc.id, sc.replay_id, sc.beatmap_id, sc.beatmap_set_id, sc.version, sc.score, sc.acc, sc.max_combo, sc.grade, sc.mods, sc.mods_hash, sc.miss, sc.ruleset_version, u.username
      FROM scores sc JOIN users u ON u.id = sc.user_id
      WHERE sc.beatmap_id = ? AND (sc.mods_hash IS NULL OR sc.mods_hash = '' OR sc.mods_hash = 'nomod')
        AND sc.ruleset_version = ? AND sc.ranked = ? AND sc.approved = 1
        AND sc.score = (SELECT MAX(score) FROM scores WHERE user_id = sc.user_id AND beatmap_id = ? AND (mods_hash IS NULL OR mods_hash = '' OR mods_hash = 'nomod') AND ruleset_version = ? AND ranked = ? AND approved = 1)
      ORDER BY sc.score DESC LIMIT ?`)
      .all(beatmapId, versionFilter, rankedOnly, beatmapId, versionFilter, rankedOnly, limit);
  },
  // List distinct mod combinations played on a beatmap (for the "View all mod combinations" selector)
  leaderboardModCombos(beatmapId) {
    return db.prepare(`
      SELECT mods_hash, COUNT(*) as count, MAX(score) as top_score
      FROM scores
      WHERE beatmap_id = ? AND ruleset_version = 'v2' AND ranked = 1 AND approved = 1 AND mods_hash IS NOT NULL AND mods_hash != ''
      GROUP BY mods_hash ORDER BY count DESC`).all(beatmapId);
  },
  userBest(userId, beatmapId) {
    return db.prepare(
      "SELECT * FROM scores WHERE user_id = ? AND beatmap_id = ? ORDER BY score DESC LIMIT 1"
    ).get(userId, beatmapId);
  },
  userStats(userId) {
    const row = db.prepare(`
      SELECT COUNT(*) plays, MAX(score) max_score, MAX(max_combo) max_combo,
             COALESCE(SUM(count300), 0) c300, COALESCE(SUM(count100), 0) c100, COALESCE(SUM(count50), 0) c50, COALESCE(SUM(miss), 0) miss,
             COALESCE(AVG(acc), 0) avg_acc
      FROM scores WHERE user_id = ?`).get(userId);
    return row;
  },
  recentScores(limit) {
    return db.prepare(`
      SELECT sc.id, sc.beatmap_id, sc.title, sc.version, sc.score, sc.acc, sc.grade, sc.mods, u.username
      FROM scores sc JOIN users u ON u.id = sc.user_id
      ORDER BY sc.created_at DESC LIMIT ?`).all(limit);
  },
  // Recalc a user's total PP using the osu! weighted-top-100 + bonus formula
  recalcTotalPP(userId) {
    const rows = db.prepare(
      "SELECT pp FROM scores WHERE user_id = ? AND ranked = 1 AND approved = 1 AND pp > 0 ORDER BY pp DESC LIMIT 100"
    ).all(userId);
    const countRow = db.prepare(
      "SELECT COUNT(*) as n FROM scores WHERE user_id = ? AND ranked = 1 AND approved = 1 AND pp > 0"
    ).get(userId);
    const n = countRow ? countRow.n : 0;
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
      total += rows[i].pp * Math.pow(0.95, i);
    }
    total += 4100 * (1 - Math.pow(0.9994, n));
    db.prepare("UPDATE users SET total_pp = ? WHERE id = ?").run(Math.round(total * 100) / 100, userId);
    return Math.round(total * 100) / 100;
  },
  // Recent scores for a specific user (with beatmap info stored on the score row)
  userScoresRecent(userId, limit) {
    return db.prepare(`
      SELECT id, beatmap_id, title, artist, version, score, acc, grade, mods, pp, miss, count300, count100, count50, max_combo, created_at
      FROM scores WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?`).all(userId, limit);
  },
  // Global rankings (sorted by total_pp desc)
  rankings(limit, offset) {
    return db.prepare(`
      SELECT id, username, pfp_url, total_pp, country
      FROM users WHERE total_pp > 0
      ORDER BY total_pp DESC LIMIT ? OFFSET ?`).all(limit, offset);
  },
  // Country rankings (filtered by country)
  rankingsByCountry(country, limit, offset) {
    return db.prepare(`
      SELECT id, username, pfp_url, total_pp, country
      FROM users WHERE total_pp > 0 AND country = ?
      ORDER BY total_pp DESC LIMIT ? OFFSET ?`).all(country, limit, offset);
  },
  // A user's rank (global)
  userRank(userId) {
    const row = db.prepare(`
      SELECT COUNT(*) + 1 as rank FROM users WHERE total_pp > (SELECT total_pp FROM users WHERE id = ?)
    `).get(userId);
    return row ? row.rank : 0;
  },
  // A user's country rank
  userCountryRank(userId) {
    const u = db.prepare("SELECT country, total_pp FROM users WHERE id = ?").get(userId);
    if (!u || !u.country || u.total_pp <= 0) return 0;
    const row = db.prepare(`
      SELECT COUNT(*) + 1 as rank FROM users WHERE country = ? AND total_pp > ?
    `).get(u.country, u.total_pp);
    return row ? row.rank : 0;
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
