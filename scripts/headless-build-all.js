// Headless smoke of EVERY v2 shell page on the built dist/ (vite preview, no
// backend). Confirms each page's primary lit custom element upgrades + the page
// loads with no fatal pageerrors. API-dependent pages (leaderboard/profile/skins
// /settings) will show empty/error states without a backend, but the component
// must still upgrade. Run: npm run build && node scripts/headless-build-all.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js","preview","--port","5301","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[preview]; let pe=""; preview.stderr.on("data",d=>pe+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
const pages = {
  "index-v2.html": "beatmap-list",
  "browse-v2.html": "beatmap-list",
  "search-v2.html": "beatmap-list",
  "hot-v2.html": "beatmap-list",
  "new-v2.html": "beatmap-list",
  "liked-v2.html": "beatmap-list",
  "history-v2.html": "beatmap-list",
  "leaderboard-v2.html": "leaderboard-board",
  "profile-v2.html": "profile-card",
  "skins-v2.html": "skin-list",
  "settings-v2.html": "settings-panel",
};
async function main(){
  if(!(await wait("http://localhost:5301/index-v2.html"))){console.log("vite preview not ready",pe);process.exit(1);}
  const b=await chromium.launch({headless:true});
  const ctx=await b.newContext({viewport:{width:1280,height:800}});
  let pass=0, fail=0;
  function check(n,c,x){c?pass++:fail++;console.log((c?"  ok   ":"  FAIL ")+n+(x?"  "+x:""));}
  for (const [file, tag] of Object.entries(pages)) {
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", e => errs.push(String(e)));
    p.on("console", m => { if (m.type()==="error" && !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404|assets\.ppy/i.test(m.text())) console.log("  ["+file+"] CONSOLE-ERR:", m.text().slice(0,120)); });
    await p.goto("http://localhost:5301/"+file, { waitUntil: "load", timeout: 30000 }).catch(()=>{});
    await p.waitForTimeout(1500);
    const st = await p.evaluate((t) => ({
      tagPresent: !!document.querySelector(t),
      defined: !!customElements.get(t),
      hasContent: (() => { const el = document.querySelector(t); if (!el) return false; if (el.shadowRoot) return el.shadowRoot.innerHTML.length > 0; return el.innerHTML.length > 0; })(),
      lazerPink: getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink").trim(),
    }), tag);
    const fatal = errs.filter(e => !/catboy|api\/|500|Failed to fetch|ERR_|net::|blocked|404|assets\.ppy/i.test(e));
    check(file + " <" + tag + "> upgrades", st.defined && st.tagPresent, "defined=" + st.defined + " content=" + st.hasContent);
    check(file + " 0 fatal", fatal.length === 0, "fatal=" + fatal.length + (fatal[0] ? " " + fatal[0].slice(0,80) : ""));
    if (fatal.length) fatal.slice(0,3).forEach(e=>console.log("      "+e.slice(0,140)));
    await p.close();
  }
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  console.log("\n"+pass+" passed, "+fail+" failed");
  process.exit(fail?1:0);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
