// Full dev-stack smoke: spawns Fastify backend + Vite dev as node child processes,
// waits for both, then fetches through the Vite proxy to verify the whole stack.
// Run: node scripts/devstack-smoke.js
const { spawn } = require("child_process");
const os = require("os"), path = require("path"), fs = require("fs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "webosu-dev-"));
const children = [];
let fail = 0, pass = 0;
function check(name, cond, extra) { cond ? pass++ : fail++; console.log((cond?"  ok   ":"  FAIL ")+name+(extra?"  "+extra:"")); }
function spawnServer(cmd, args, env) {
  const c = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore","pipe","pipe"] });
  children.push(c);
  c.stdout.on("data", d => process.stdout.write("["+args.join(" ")+"] "+d));
  c.stderr.on("data", d => process.stderr.write("["+args.join(" ")+"] ERR "+d));
  c.on("error", e => console.log("spawn error:", e.message));
  return c;
}
async function waitReady(url, ms=20000) {
  const t0 = Date.now();
  while (Date.now()-t0 < ms) { try { const r = await fetch(url); if (r.status < 500) return r; } catch(e) {} await new Promise(r=>setTimeout(r, 300)); }
  return null;
}
async function main() {
  spawnServer(process.execPath, ["server/index.js"], { PORT:"8080", DATA_DIR:tmp, DB_PATH:path.join(tmp,"dev.db"), JWT_SECRET:"dev" });
  spawnServer(process.execPath, ["node_modules/vite/bin/vite.js","--port","5173","--strictPort"], {});
  const br = await waitReady("http://127.0.0.1:8080/api/health");
  check("backend ready on :8080", !!br, br ? "status "+br.status : "no response");
  const vr = await waitReady("http://localhost:5173/index.html");
  check("vite dev serves index.html", !!vr, vr ? "status "+vr.status : "no response");
  if (vr) {
    const html = await vr.text();
    check("index.html is the webosu page", /webosu/i.test(html) && html.includes("game-area"), "len="+html.length);
    let r = await fetch("http://localhost:5173/js/api.js"); check("vite serves static /js/api.js", r.status===200, "status "+r.status);
    r = await fetch("http://localhost:5173/css/main.css"); check("vite serves static /css/main.css", r.status===200, "status "+r.status);
    r = await fetch("http://localhost:5173/api/health"); check("vite PROXIES /api/health -> backend", r.status===200, "status "+r.status);
    const j = await r.json(); check("proxied health returns ok", j.ok===true, JSON.stringify(j));
    r = await fetch("http://localhost:5173/api/pp?stars=6&acc=99"); check("proxied /api/pp works", r.status===200 && typeof (await r.json()).pp==="number", "status "+r.status);
    // game's own scripts must reach the browser through Vite (not bundled yet, served static)
    for (const p of ["/js/lib/pixi.min.js","/js/lib/require.js","/js/playback.js","/js/osu.js","/js/SliderMesh.js","/js/lib/localforage.min.js"]) {
      r = await fetch("http://localhost:5173"+p); check("serves "+p, r.status===200, "status "+r.status);
    }
  }
  for (const c of children) { try { c.kill("SIGTERM"); } catch(e){} }
  console.log("\n"+pass+" passed, "+fail+" failed");
  process.exit(fail?1:0);
}
main().catch(e=>{ console.error(e); for(const c of children) try{c.kill()}catch(_){}; process.exit(2); });


