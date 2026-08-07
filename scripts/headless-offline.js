// Headless-verify the PWA offline shell (Phase 5): the generated dist/sw.js
// precaches the built shell, so going offline + reloading still serves the
// shell (HTML/CSS/JS) from the SW cache. catboy.best / /api are NOT cached, so
// beatmap lists won't load offline (expected) but the shell must render.
// Run: npm run build && node scripts/headless-offline.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js","preview","--port","5184","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[preview]; let pe=""; preview.stderr.on("data",d=>pe+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5184/index-v2.html"))){console.log("vite preview not ready",pe);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const ctx=await b.newContext({viewport:{width:1280,height:800}});
  const p=await ctx.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/|500|assets\.ppy|Failed to fetch|ERR_|net::|blocked/i.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,160))});
  // online: load + let the service worker install + precache
  await p.goto("http://localhost:5184/index-v2.html",{waitUntil:"load",timeout:30000});
  const sw = await p.evaluate(async () => {
    if (!navigator.serviceWorker) return { supported: false };
    await navigator.serviceWorker.ready;
    const reg = navigator.serviceWorker.controller;
    const keys = await caches.keys();
    const cacheNames = keys;
    let hasShell = false;
    for (const k of keys) { const c = await caches.open(k); if (await c.match("/css/main.css")) { hasShell = true; break; } }
    return { supported: true, controlled: !!reg, caches: cacheNames.length, hasShell };
  });
  console.log("=== online (SW install) ===");
  console.log("  ", JSON.stringify(sw));
  // go offline + reload; the SW should serve the shell from cache (navigation
  // falls back to cached /index.html; static assets are cache-first)
  await ctx.setOffline(true);
  await p.goto("http://localhost:5184/index-v2.html",{waitUntil:"load",timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1200);
  const offline = await p.evaluate(()=>({
    url: location.pathname,
    hasNav: !!document.querySelector("#main-nav") || !!document.querySelector("nav") || !!document.querySelector(".main-page"),
    title: document.title,
    lazerPink: getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink").trim(),
    bodyLen: document.body ? document.body.innerHTML.length : 0,
  }));
  console.log("=== offline (reloaded, from SW cache) ===");
  console.log("  ", JSON.stringify(offline));
  const fatal=errs.filter(e=>!/catboy|assets\.ppy|ERR_|net::|Failed to fetch|api\/|blocked|500/i.test(e));
  console.log("pageerrors:",errs.length,"FATAL:",fatal.length); fatal.slice(0,6).forEach(e=>console.log("  "+e.slice(0,160)));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  // SW controls subsequent navigations (not the first), so "controlled" is
  // expected to be false on the first online load; the real gate is that the SW
  // precached the shell (hasShell) AND the offline reload served the shell from
  // cache (hasNav + lazer token) with no fatal errors.
  const ok = sw.supported && sw.hasShell && offline.hasNav && offline.lazerPink && fatal.length===0;
  console.log("ok:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
