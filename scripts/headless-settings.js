// Verify the v2 game honors user settings: seed localStorage osugamesettings, load
// index-v2, confirm window.game reflects the settings (gamesettings.loadToGame applied).
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5194","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5194/settings"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  // seed settings before the page loads its modules
  await p.addInitScript((s)=>{ localStorage.setItem("osugamesettings", s); }, JSON.stringify({ dim: 25, cursorsize: 1.5, mastervolume: 10, hardrock: true }));
  await p.goto("http://localhost:5194/settings",{waitUntil:"load",timeout:30000});
await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(() => window.__ensureGame && window.__ensureGame()).catch(() => {});
  await p.waitForFunction(()=>!!window.game && !!window.gamesettings, null,{timeout:15000});
  const st = await p.evaluate(()=>({
    gsDim: window.gamesettings.dim,
    gsCursor: window.gamesettings.cursorsize,
    gameDim: window.game.backgroundDimRate,
    gameCursor: window.game.cursorSize,
    gameMaster: window.game.masterVolume,
    gameHardrock: window.game.hardrock,
  }));
  console.log("=== settings -> game ==="); console.log(JSON.stringify(st));
  console.log("pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = st.gsDim===25 && st.gameDim===0.25 && st.gameCursor===1.5 && st.gameMaster===0.1 && st.gameHardrock===true && errs.length===0;
  console.log("\nSETTINGS->GAME OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
