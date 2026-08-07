// Headless: shell pages render REAL backend data on the built dist/ (Fastify
// serves dist/ + /api). Seeds a user + a score + a skin via the API, then loads
// leaderboard-v2 / profile-v2 / skins-v2 and verifies each lit component renders
// the seeded data (pierces shadow DOM). Run: npm run build && node scripts/headless-shell-backend.js
const { spawn } = require("child_process");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8310;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-sb-"));
const srv = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_PATH: path.join(tmp, "sb.db"), JWT_SECRET: "sb" }, stdio: ["ignore","pipe","pipe"] });
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
  // seed: user + score + skin
  const reg = await j("POST", "/api/auth/register", { "content-type": "application/json" }, { username: "player", password: "pw123456" });
  const token = reg.json && reg.json.token;
  check("seed: register player", !!token, reg.text);
  const sc = await j("POST", "/api/scores", { "content-type": "application/json", authorization: "Bearer " + token }, { beatmap_id: 4174364, beatmap_set_id: 2006909, title: "Lightspeed", artist: "X", version: "Insane", score: 1000, combo: 10, acc: 99, grade: "S", count300: 10, count100: 0, count50: 0, miss: 0, replay: [] });
  check("seed: submit score", sc.status === 200 && sc.json && sc.json.ok, sc.text);
  const sk = await j("POST", "/api/skins", { "content-type": "application/octet-stream", authorization: "Bearer " + token, "x-skin-name": "myskin", "x-skin-filename": "myskin.osk" }, Buffer.from("pretend-osk-bytes"));
  check("seed: upload skin", sk.status === 200 && sk.json && sk.json.id != null, sk.text);

  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const base = "http://localhost:" + PORT + "/";

  async function loadAndCheck(file, sel, expect, label) {
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(String(e)));
    p.on("console", m => { if (m.type() === "error" && !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404|assets\.ppy/i.test(m.text())) console.log("  [" + file + "] CONSOLE-ERR:", m.text().slice(0, 120)); });
    await p.goto(base + file, { waitUntil: "load", timeout: 30000 });
    let found = false;
    try {
      await p.waitForFunction(({ sel, expect }) => { const el = document.querySelector(sel); const t = el && (el.shadowRoot ? el.shadowRoot.textContent : el.textContent); return !!t && t.indexOf(expect) !== -1; }, { sel, expect }, { timeout: 20000 });
      found = true;
    } catch (e) {}
    const fatal = errs.filter(e => !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404|assets\.ppy/i.test(e));
    check(label + " renders seeded data", found, "found=" + found);
    if (!found) { const dbg = await p.evaluate((sel) => { const el = document.querySelector(sel); return { shadow: el && el.shadowRoot ? el.shadowRoot.textContent.replace(/\s+/g," ").slice(0,180) : null, host: el ? el.textContent.replace(/\s+/g," ").slice(0,120) : null, attrs: el ? [...el.attributes].map(a=>a.name+"="+a.value).join(",") : null }; }, sel); console.log("      [" + label + "] shadow=", JSON.stringify(dbg.shadow), "attrs=" + dbg.attrs); }
    check(label + " 0 fatal", fatal.length === 0, "fatal=" + fatal.length + (fatal[0] ? " " + fatal[0].slice(0, 80) : ""));
    if (fatal.length) fatal.slice(0, 3).forEach(e => console.log("      " + e.slice(0, 140)));
    await p.close();
  }

  await loadAndCheck("leaderboard-v2.html?bid=4174364", "leaderboard-board", "player", "leaderboard-v2");
  await loadAndCheck("profile-v2.html?u=player", "profile-card", "player", "profile-v2");
  await loadAndCheck("skins-v2.html", "skin-list", "myskin", "skins-v2");

  await b.close();
  cleanup(fail ? 1 : 0);
}
function cleanup(code) {
  for (const k of kids) { try { k.kill("SIGTERM"); } catch (e) {} }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(code);
}
main().catch(e => { console.error("FATAL", e); cleanup(2); });
