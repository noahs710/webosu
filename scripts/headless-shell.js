const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5179","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5179/browse-v2.html"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/activity|500|assets\.ppy|Failed to fetch|ERR_/i.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,150))});
  await p.goto("http://localhost:5179/browse-v2.html",{waitUntil:"load",timeout:30000});
  // wait for beatmap cards to render (catboy.best fetch in-browser)
  let cards = 0;
  try { await p.waitForFunction(()=>document.querySelectorAll(".beatmap-card").length > 0, null, {timeout:20000}); cards = await p.evaluate(()=>document.querySelectorAll(".beatmap-card").length); } catch(e) { cards = -1; }
  const info = await p.evaluate(()=>{
    const first = document.querySelector(".beatmap-card");
    const diffs = document.querySelectorAll(".difficulty-item").length;
    return { cards: document.querySelectorAll(".beatmap-card").length, firstTitle: first ? first.querySelector(".beatmapcard-title")?.textContent : null, firstArtist: first ? first.querySelector(".beatmapcard-artist")?.textContent : null, difficulties: diffs, hasLazerToken: getComputedStyle(document.documentElement).getPropertyValue("--lazer-pink") };
  });
  console.log("=== browse-v2 lit shell ===");
  console.log("  cards rendered:", info.cards);
  console.log("  first card:", info.firstTitle, "-", info.firstArtist);
  console.log("  difficulty buttons:", info.difficulties);
  console.log("  --lazer-pink token:", info.hasLazerToken.trim());
  console.log("  pageerrors:", errs.length); errs.slice(0,6).forEach(e=>console.log("    "+e));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  console.log("\nFATAL:", errs.filter(e=>!/catboy|assets\.ppy|ERR_|Failed to fetch|api\/activity/i.test(e)).length);
  process.exit(info.cards > 0 && errs.length === 0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
