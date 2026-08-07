// Headless: v2 settings page pulls cross-device settings from the server on the
// built dist/. Seeds a server setting (dim=37), loads settings-v2 logged in, and
// verifies the settings-panel syncs + renders it. Run: npm run build && node scripts/headless-settings-pull.js
const { spawn } = require("child_process");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8320;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-sp-"));
const srv = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_PATH: path.join(tmp, "sp.db"), JWT_SECRET: "sp" }, stdio: ["ignore","pipe","pipe"] });
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
  check("register", !!token);
  // seed a server-side setting: dim=37 (cross-device value)
  const put = await j("PUT", "/api/profile/me", { "content-type": "application/json", authorization: "Bearer " + token }, { settings: { dim: 37 } });
  check("seed server setting dim=37", put.status === 200, put.text);
  const me = await j("GET", "/api/profile/me", { authorization: "Bearer " + token });
  check("server stores dim=37", me.status === 200 && me.json && me.json.settings && me.json.settings.dim === 37, JSON.stringify(me.json && me.json.settings));

  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript("try{localStorage.setItem('webosu_token'," + JSON.stringify(token) + ");localStorage.setItem('webosu_user'," + JSON.stringify(JSON.stringify(user)) + ");}catch(e){}");
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto("http://localhost:" + PORT + "/settings-v2.html", { waitUntil: "load", timeout: 30000 });
  // wait for the settings-panel to syncFromServer + render the seeded dim (37%)
  let pulled = false;
  try {
    await p.waitForFunction(() => { const el = document.querySelector("settings-panel"); const t = el && el.shadowRoot && el.shadowRoot.textContent; return !!t && t.indexOf("37%") !== -1; }, null, { timeout: 15000 });
    pulled = true;
  } catch (e) {}
  const shadow = await p.evaluate(() => { const el = document.querySelector("settings-panel"); return el && el.shadowRoot ? el.shadowRoot.textContent.replace(/\s+/g, " ").slice(0, 160) : null; });
  console.log("=== settings-panel shadow ==="); console.log("  ", JSON.stringify(shadow));
  check("settings page pulls server dim=37", pulled, "pulled=" + pulled);
  const fatal = errs.filter(e => !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404|assets\.ppy/i.test(e));
  check("no fatal pageerrors", fatal.length === 0, "fatal=" + fatal.length);
  fatal.slice(0, 4).forEach(e => console.log("    " + e.slice(0, 160)));
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
