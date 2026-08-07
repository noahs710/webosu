// Headless: the account-widget register/login UI flow on the built dist/ with a
// real backend. Drives the shadow-DOM modal (click Log in -> fill username/
// password -> Register) and verifies the user is created (api.register), the
// widget shows the logged-in name, the token is in localStorage, and /api/auth/me
// returns the user. Run: npm run build && node scripts/headless-account-dist.js
const { spawn } = require("child_process");
const http = require("http");
const os = require("os"), path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8330;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-ad-"));
const srv = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_PATH: path.join(tmp, "ad.db"), JWT_SECRET: "ad" }, stdio: ["ignore","pipe","pipe"] });
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
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error" && !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404|assets\.ppy/i.test(m.text())) console.log("CONSOLE-ERR:", m.text().slice(0, 120)); });
  await p.goto("http://localhost:" + PORT + "/browse-v2.html", { waitUntil: "load", timeout: 30000 });
  // wait for the account-widget to upgrade (not logged in -> shows "Log in")
  await p.waitForFunction(() => { const el = document.querySelector("account-widget"); return !!el && !!el.shadowRoot; }, null, { timeout: 15000 });
  // drive the register flow inside the account-widget shadow DOM (lit
  // re-renders async after each click, so click -> wait for the next view -> act)
  await p.evaluate(() => { const el = document.querySelector("account-widget"); const sr = el.shadowRoot; const b = [...sr.querySelectorAll("button")].find(x => /log in/i.test(x.textContent)); if (b) b.click(); });
  const modalOpen = await p.waitForFunction(() => { const el = document.querySelector("account-widget"); return !!(el && el.shadowRoot && el.shadowRoot.querySelector(".u")); }, null, { timeout: 10000 }).catch(() => false);
  check("Log in modal opens", modalOpen, "modalOpen=" + modalOpen);
  if (modalOpen) {
    await p.evaluate(() => { const el = document.querySelector("account-widget"); const sr = el.shadowRoot; sr.querySelector(".u").value = "newuser"; sr.querySelector(".p").value = "pw123456"; const b = [...sr.querySelectorAll("button")].find(x => /register/i.test(x.textContent)); if (b) b.click(); });
  }
  console.log("drive: clicked Log in -> filled -> clicked Register");
  // wait for the widget to show the logged-in name (wa-name) + token in localStorage
  let loggedIn = false;
  try {
    await p.waitForFunction(() => { const el = document.querySelector("account-widget"); const sr = el && el.shadowRoot; const name = sr && sr.querySelector(".wa-name"); return !!name && name.textContent.length > 0; }, null, { timeout: 15000 });
    loggedIn = true;
  } catch (e) {}
  const st = await p.evaluate(() => { const el = document.querySelector("account-widget"); const sr = el && el.shadowRoot; return { name: sr && sr.querySelector(".wa-name") ? sr.querySelector(".wa-name").textContent : null, hasLogout: !!(sr && [...sr.querySelectorAll("button")].find(b => /log out/i.test(b.textContent))), token: localStorage.getItem("webosu_token"), user: localStorage.getItem("webosu_user") }; });
  console.log("=== account-widget after register ==="); console.log("  ", JSON.stringify(st));
  check("register flow logs in (wa-name shows)", loggedIn && st.name === "newuser", "name=" + st.name);
  check("token + user in localStorage", !!st.token && st.user && JSON.parse(st.user).username === "newuser", "token=" + !!st.token);
  // the token actually authenticates with the backend
  const me = await j("GET", "/api/auth/me", { authorization: "Bearer " + st.token });
  check("/api/auth/me authenticates", me.status === 200 && me.json && me.json.user && me.json.user.username === "newuser", "status=" + me.status);
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
