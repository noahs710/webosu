// Headless-verify the home page (index-v2) shell lists on the built dist/: the 5
// lit <beatmap-list> elements render beatmap cards, the ESM game entry boots,
// and the beatmap-launch path is wired. Run: npm run build && node scripts/headless-home.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js","preview","--port","5183","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[preview]; let pe=""; preview.stderr.on("data",d=>pe+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5183/"))){console.log("vite preview not ready",pe);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:900}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/activity|500|assets\.ppy|Failed to fetch|ERR_|net::|blocked/i.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,160))});
  await p.goto("http://localhost:5183/",{waitUntil:"load",timeout:30000});
  // wait for the home lists to render beatmap cards (catboy.best fetch in-browser)
  let cards=0;
  try { await p.waitForFunction(()=>document.querySelectorAll(".beatmap-card").length>0, null, {timeout:20000}); cards=await p.evaluate(()=>document.querySelectorAll(".beatmap-card").length); } catch(e) {}
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady, null, {timeout:15000}).catch(()=>{});
  const st=await p.evaluate(()=>({
    scriptReady: !!window.scriptReady,
    pixi: typeof window.PIXI,
    launchGame: typeof window.launchGame,
    lists: document.querySelectorAll("beatmap-list").length,
    hotCards: document.querySelectorAll("#beatmap-list-hot .beatmap-card").length,
    newCards: document.querySelectorAll("#beatmap-list-new .beatmap-card").length,
    randomCards: document.querySelectorAll("#beatmap-list-random .beatmap-card").length,
    lazerPink: getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink").trim(),
  }));
  console.log("=== index-v2 home (built, lit lists) ===");
  for(const k of Object.keys(st)) console.log("  "+k+" = "+st[k]);
  console.log("  total beatmap-card:", cards, " pageerrors:", errs.length);
  errs.slice(0,6).forEach(e=>console.log("    "+e.slice(0,160)));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|assets\.ppy|ERR_|net::|Failed to fetch|api\/activity|blocked/i.test(e));
  console.log("FATAL:", fatal.length);
  const ok = st.lists===5 && cards>0 && st.launchGame==="function" && fatal.length===0;
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
