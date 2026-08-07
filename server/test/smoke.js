"use strict";
// Smoke test for the Fastify port. Uses app.inject() so no port is bound — runs
// in any sandbox. Points DB_PATH/DATA_DIR at a temp dir so the real DB is untouched.
const os = require("os");
const path = require("path");
const fs = require("fs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-test-"));
process.env.DATA_DIR = tmp;
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.JWT_SECRET = "test-secret";

const { buildApp } = require("../app");
const app = buildApp();

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  " + extra : "")); }
}

async function main() {
  // health
  let r = await app.inject({ method: "GET", url: "/api/health" });
  check("GET /api/health 200", r.statusCode === 200, r.payload);
  check("health ok=true", r.json().ok === true);

  // register
  r = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: "pw123456" }) });
  check("POST /api/auth/register 200", r.statusCode === 200, r.payload);
  const token = r.json().token;
  const me = r.json().user;
  check("register returns token+user", !!token && me.username === "alice");

  // duplicate
  r = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: "pw123456" }) });
  check("duplicate register 409", r.statusCode === 409, r.payload);

  // validation
  r = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "ab", password: "pw123456" }) });
  check("short username 400", r.statusCode === 400, r.payload);

  // login
  r = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: "pw123456" }) });
  check("POST /api/auth/login 200", r.statusCode === 200 && !!r.json().token, r.payload);
  r = await app.inject({ method: "POST", url: "/api/auth/login", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "alice", password: "wrong" }) });
  check("login wrong pw 401", r.statusCode === 401, r.payload);

  // auth/me
  r = await app.inject({ method: "GET", url: "/api/auth/me" });
  check("GET /api/auth/me no token 401", r.statusCode === 401, r.payload);
  r = await app.inject({ method: "GET", url: "/api/auth/me", headers: { authorization: "Bearer " + token } });
  check("GET /api/auth/me 200", r.statusCode === 200 && r.json().user.username === "alice", r.payload);

  // pp
  r = await app.inject({ method: "GET", url: "/api/pp?stars=5&acc=98" });
  check("GET /api/pp 200", r.statusCode === 200 && typeof r.json().pp === "number", r.payload);

  // score submit (no beatmap -> validate approves; replay included)
  const replay = [{ t: 100, x: 100, y: 100, d: true }];
  r = await app.inject({ method: "POST", url: "/api/scores", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ beatmap_id: 123, score: 99999, combo: 600, acc: 99.5, grade: "S", count300: 100, miss: 0, replay }) });
  check("POST /api/scores 200", r.statusCode === 200 && r.json().ok === true, r.payload);
  const scoreId = r.json().id;
  check("score has rank", r.json().rank != null, "rank=" + r.json().rank);

  // leaderboard
  r = await app.inject({ method: "GET", url: "/api/leaderboards/123?limit=50" });
  check("GET /api/leaderboards/:id 200", r.statusCode === 200 && Array.isArray(r.json()), r.payload);
  check("leaderboard contains our score", r.json().some((s) => s.id === scoreId), "len=" + r.json().length);

  // score + replay fetch
  r = await app.inject({ method: "GET", url: "/api/scores/" + scoreId });
  check("GET /api/scores/:id 200", r.statusCode === 200 && r.json().username === "alice", r.payload);
  r = await app.inject({ method: "GET", url: "/api/replays/" + r.json().replay_id });
  check("GET /api/replays/:id 200", r.statusCode === 200, r.payload);

  // activity recent
  r = await app.inject({ method: "GET", url: "/api/activity/recent" });
  check("GET /api/activity/recent 200", r.statusCode === 200 && Array.isArray(r.json()), r.payload);

  // profiles
  r = await app.inject({ method: "GET", url: "/api/profiles/alice" });
  check("GET /api/profiles/:username 200", r.statusCode === 200 && r.json().user.username === "alice", r.payload);
  r = await app.inject({ method: "GET", url: "/api/profiles/nobody" });
  check("profile missing 404", r.statusCode === 404, r.payload);

  // profile sync
  r = await app.inject({ method: "GET", url: "/api/profile/me", headers: { authorization: "Bearer " + token } });
  check("GET /api/profile/me 200", r.statusCode === 200, r.payload);
  r = await app.inject({ method: "PUT", url: "/api/profile/me", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ settings: { volume: 0.7 }, favorites: [42] }) });
  check("PUT /api/profile/me 200", r.statusCode === 200, r.payload);
  r = await app.inject({ method: "GET", url: "/api/profile/me", headers: { authorization: "Bearer " + token } });
  check("profile round-trips settings", r.json().settings && r.json().settings.volume === 0.7, r.payload);

  // skins (octet-stream)
  r = await app.inject({ method: "GET", url: "/api/skins" });
  check("GET /api/skins 200", r.statusCode === 200 && Array.isArray(r.json()), r.payload);
  r = await app.inject({ method: "POST", url: "/api/skins", headers: { "content-type": "application/octet-stream", authorization: "Bearer " + token, "x-skin-name": "myskin", "x-skin-filename": "myskin.osk" }, body: Buffer.from("pretend-osk-bytes") });
  check("POST /api/skins 200", r.statusCode === 200 && r.json().id != null, r.payload);
  const skinId = r.json().id;
  r = await app.inject({ method: "GET", url: "/api/skins/" + skinId });
  check("GET /api/skins/:id 200 + binary", r.statusCode === 200 && r.payload.includes("pretend-osk-bytes"), "code=" + r.statusCode);

  // comments
  r = await app.inject({ method: "GET", url: "/api/comments/555" });
  check("GET /api/comments/:setId 200", r.statusCode === 200 && Array.isArray(r.json()), r.payload);
  r = await app.inject({ method: "POST", url: "/api/comments/555", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ body: "nice map" }) });
  check("POST /api/comments/:setId 200", r.statusCode === 200 && r.json().username === "alice", r.payload);

  // achievements
  r = await app.inject({ method: "GET", url: "/api/achievements/me", headers: { authorization: "Bearer " + token } });
  check("GET /api/achievements/me 200", r.statusCode === 200 && Array.isArray(r.json()), r.payload);
  check("got first_fc achievement", r.json().some((a) => a.key === "first_fc"), JSON.stringify(r.json()));

  // tournaments
  r = await app.inject({ method: "GET", url: "/api/tournaments" });
  check("GET /api/tournaments 200", r.statusCode === 200 && Array.isArray(r.json()), r.payload);
  r = await app.inject({ method: "POST", url: "/api/tournaments", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ name: "Cup" }) });
  check("POST /api/tournaments 200", r.statusCode === 200 && r.json().id != null, r.payload);

  // static + private-path blocking
  r = await app.inject({ method: "GET", url: "/" });
  check("GET / serves index.html", r.statusCode === 200 && /webosu/i.test(r.payload), "code=" + r.statusCode);
  r = await app.inject({ method: "GET", url: "/server/app.js" });
  check("GET /server/app.js blocked 404", r.statusCode === 404, "code=" + r.statusCode);
  r = await app.inject({ method: "GET", url: "/package.json" });
  check("GET /package.json blocked 404", r.statusCode === 404, "code=" + r.statusCode);

  // Phase 5: input validation
  r = await app.inject({ method: "POST", url: "/api/auth/register", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: 123, password: "pw123456" }) });
  check("register non-string username 400", r.statusCode === 400, "code=" + r.statusCode);
  r = await app.inject({ method: "POST", url: "/api/scores", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ beatmap_id: "x", score: "y" }) });
  check("score non-numeric 400", r.statusCode === 400, "code=" + r.statusCode);
  // Phase 5: per-IP rate limit (fresh app -> fresh limiter)
  const app2 = buildApp();
  let rl429 = 0, rl200 = 0;
  for (let i = 0; i < 14; i++) {
    const rr = await app2.inject({ method: "POST", url: "/api/auth/register", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "rluser" + i, password: "pw123456" }) });
    if (rr.statusCode === 429) rl429++; else if (rr.statusCode === 200) rl200++;
  }
  check("rate-limit returns 429 after limit", rl429 >= 1, "429=" + rl429 + " 200=" + rl200);
  check("rate-limit allowed the first batch (200)", rl200 >= 10, "200=" + rl200);
  await app2.close();
  await app.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
