// Headless end-to-end integration of the core loop: the Fastify backend serves
// the built dist/ + /api; a logged-in user autoplays a real map to completion; the
// game submits the score (WebosuAPI.submitScore -> POST /api/scores); the backend
// validates the replay + inserts it (approved=1); the score row is confirmed in
// the sqlite DB. Verifies play -> submit -> validate -> leaderboard-eligible.
// Run: npm run build && node scripts/headless-integration.js
const { spawn } = require("child_process");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8244;
const SET = 2006909, BID = 4174364, VER = "Lightspeed";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-int-"));
const srv = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_PATH: path.join(tmp, "int.db"), JWT_SECRET: "int" }, stdio: ["ignore","pipe","pipe"] });
const kids = [srv]; let se = ""; srv.stderr.on("data", d => se += d);
let pass = 0, fail = 0;
function check(n, c, x) { c ? pass++ : fail++; console.log((c ? "  ok   " : "  FAIL ") + n + (x ? "  " + x : "")); }
function j(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: PORT, method, path: url, headers: headers || {} }, res => { let b = ""; res.on("data", d => b += d); res.on("end", () => { try { resolve({ status: res.statusCode, json: b ? JSON.parse(b) : null, text: b }); } catch (e) { resolve({ status: res.statusCode, json: null, text: b }); } }); });
    req.on("error", reject); if (body != null) req.write(typeof body === "string" ? body : JSON.stringify(body)); req.end();
  });
}
async function wait(ms = 25000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const r = await j("GET", "/api/health"); if (r.status < 500) return true; } catch (e) {} await new Promise(r => setTimeout(r, 200)); } return false; }

async function main() {
  if (!(await wait())) { console.log("backend not ready", se); cleanup(1); return; }
  check("backend serves /api/health", true);
  const reg = await j("POST", "/api/auth/register", { "content-type": "application/json" }, { username: "player", password: "pw123456" });
  check("register player", reg.status === 200, reg.text);
  const token = reg.json && reg.json.token, user = reg.json && reg.json.user;
  check("got token + user", !!token && user && user.username === "player");

  const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl", "--autoplay-policy=no-user-gesture-required"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  // log the user in (ESM api reads localStorage webosu_token/webosu_user) before page scripts
  await ctx.addInitScript("try{localStorage.setItem('webosu_token'," + JSON.stringify(token) + ");localStorage.setItem('webosu_user'," + JSON.stringify(JSON.stringify(user)) + ");}catch(e){}");
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error" && !/catboy|api\/activity|500|Failed to fetch|ERR_|net::|blocked|404/i.test(m.text())) console.log("CONSOLE-ERR:", m.text().slice(0, 160)); });
  await p.goto("http://localhost:" + PORT + "/index-v2.html", { waitUntil: "load", timeout: 30000 });
  await p.waitForFunction(() => typeof window.launchGame === "function" && window.skinReady && window.soundReady, null, { timeout: 25000 }).catch(() => {});
  check("game bootstrap ready", await p.evaluate(() => window.skinReady), "skinReady=" + await p.evaluate(() => window.skinReady));
  await p.evaluate(() => { if (window.game) { window.game.autoplay = true; window.game.autofullscreen = false; } });
  const lr = await p.evaluate(async (set) => {
    try { const r = await fetch("https://catboy.best/d/" + set + "n"); const ab = await (await r.blob()).arrayBuffer(); window.__osublob = new Blob([ab]); window.launchGame(window.__osublob, 4174364, "Lightspeed"); return { fetched: window.__osublob.size }; }
    catch (e) { return { evalErr: String(e) }; }
  }, SET);
  check("launch map", lr && lr.fetched > 0, JSON.stringify(lr));
  await p.waitForFunction(() => !!window.playback && !!window.playback.osu && !!window.playback.osu.audio, null, { timeout: 20000 }).catch(() => {});
  await p.evaluate(() => { try { window.playback.osu.audio.audio.resume(); } catch (e) {} });
  const ended = await p.waitForFunction(() => !!(window.playback && window.playback.ended), null, { timeout: 45000 }).catch(() => false);
  const st = await p.evaluate(() => ({ ended: !!(window.playback && window.playback.ended), idx: window.playback ? window.playback.currentHitIndex : -1, hits: window.playback && window.playback.hits ? window.playback.hits.length : 0 }));
  console.log("=== autoplay run ==="); console.log("  ", JSON.stringify(st));
  check("autoplay reached end", ended && st.ended, "ended=" + ended);
  await p.waitForTimeout(2500); // let the async score submit land
  await b.close();

  // authoritative check: the score row in the sqlite DB (inserted + approved=1
  // => leaderboard-eligible). The HTTP leaderboard endpoint filters approved=1 +
  // mods_num and the game passes the correct mods, so the DB row is the robust check.
  let inserted = null, replayC = 0;
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(tmp, "int.db"));
    inserted = db.prepare("SELECT id, user_id, beatmap_id, score, max_combo, grade, mods_num, approved FROM scores WHERE beatmap_id=?").get(BID);
    replayC = db.prepare("SELECT count(*) c FROM replays").get().c;
    db.close();
  } catch (e) { console.log("DB diag failed:", e.message); }
  console.log("=== DB score ==="); console.log("  ", JSON.stringify(inserted), "replays:", replayC);
  check("score submitted + approved (leaderboard-eligible)", !!inserted && inserted.approved === 1 && inserted.user_id === user.id && inserted.beatmap_id === BID, JSON.stringify(inserted));
  check("replay stored", replayC >= 1, "replays=" + replayC);

  const fatal = errs.filter(e => !/catboy|api\/activity|500|Failed to fetch|ERR_|net::|blocked|404/i.test(e));
  check("no fatal pageerrors", fatal.length === 0, "fatal=" + fatal.length);
  fatal.slice(0, 6).forEach(e => console.log("    " + e.slice(0, 160)));
  console.log("pageerrors:", errs.length, "fatal:", fatal.length);
  cleanup(fail ? 1 : 0);
}
function cleanup(code) {
  for (const k of kids) { try { k.kill("SIGTERM"); } catch (e) {} }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(code);
}
main().catch(e => { console.error("FATAL", e); cleanup(2); });
