// Headless verify the ESM gamesettings -> backend sync (the wiring fixed in
// 296155c). A logged-in user changes a setting + gamesettings.save(); the
// debounced pushToServer calls api.saveMyProfile; the backend stores it; GET
// /api/profile/me returns the setting. Run: npm run build && node scripts/headless-settings-sync.js
const { spawn } = require("child_process");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8301;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-ss-"));
const srv = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_PATH: path.join(tmp, "ss.db"), JWT_SECRET: "ss" }, stdio: ["ignore","pipe","pipe"] });
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
  const reg = await j("POST", "/api/auth/register", { "content-type": "application/json" }, { username: "player", password: "pw123456" });
  const token = reg.json && reg.json.token, user = reg.json && reg.json.user;
  check("register", !!token && user && user.username === "player");
  const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--enable-webgl"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript("try{localStorage.setItem('webosu_token'," + JSON.stringify(token) + ");localStorage.setItem('webosu_user'," + JSON.stringify(JSON.stringify(user)) + ");}catch(e){}");
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto("http://localhost:" + PORT + "/index-v2.html", { waitUntil: "load", timeout: 30000 });
  const hasGs = await p.waitForFunction(() => !!(window.gamesettings && typeof window.gamesettings.save === "function" && window.WebosuAPI && WebosuAPI.isLoggedIn()), null, { timeout: 20000 }).catch(() => false);
  check("gamesettings + ESM api + logged in", hasGs, "hasGs=" + hasGs);
  // change a setting + save (triggers debounced pushToServer -> api.saveMyProfile)
  const setOk = await p.evaluate(() => { try { window.gamesettings.dim = 42; window.gamesettings.save(); return window.gamesettings.dim; } catch (e) { return "err:" + e.message; } });
  check("set dim=42 + gamesettings.save()", setOk === 42, String(setOk));
  // wait for the 800ms debounce + network round-trip
  await p.waitForTimeout(2000);
  const me = await j("GET", "/api/profile/me", { authorization: "Bearer " + token });
  console.log("=== /api/profile/me ==="); console.log("  ", JSON.stringify(me.json && me.json.settings ? { dim: me.json.settings.dim, keys: Object.keys(me.json.settings).length } : me.text));
  check("settings synced to backend (dim=42)", me.status === 200 && me.json && me.json.settings && me.json.settings.dim === 42, "status=" + me.status);
  // local persistence: saveToLocal wrote osugamesettings to localStorage
  const local = await p.evaluate(() => { try { return JSON.parse(localStorage.getItem("osugamesettings") || "{}").dim; } catch (e) { return null; } });
  check("settings persisted to localStorage (dim=42)", local === 42, "local=" + local);
  await b.close();
  const fatal = errs.filter(e => !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404/i.test(e));
  check("no fatal pageerrors", fatal.length === 0, "fatal=" + fatal.length);
  fatal.slice(0, 4).forEach(e => console.log("    " + e.slice(0, 160)));
  cleanup(fail ? 1 : 0);
}
function cleanup(code) {
  for (const k of kids) { try { k.kill("SIGTERM"); } catch (e) {} }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(code);
}
main().catch(e => { console.error("FATAL", e); cleanup(2); });
