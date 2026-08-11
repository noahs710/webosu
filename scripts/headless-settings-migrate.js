// Verify the DT/NC settings migration: seed an OLD osugamesettings with
// nightcore:true (meaning 1.5x + pitch = NC) and no doubletime flag, then load
// the page and confirm the migration adds doubletime:true (NC implies DT)
// without losing the other settings (hardrock, dim, etc.).
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5195","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5195/settings"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  // seed OLD settings: nightcore=true (the pre-split flag), no doubletime, plus hardrock + dim to verify preservation
  const oldSettings = { nightcore: true, hardrock: true, dim: 40, cursorsize: 1.2, mastervolume: 50 };
  await p.addInitScript((s)=>{ localStorage.setItem("osugamesettings", s); }, JSON.stringify(oldSettings));
  await p.goto("http://localhost:5195/settings",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(() => window.__ensureGame && window.__ensureGame()).catch(() => {});
  await p.waitForFunction(()=>!!window.gamesettings, null,{timeout:15000});
  const st = await p.evaluate(()=>({
    gsNightcore: window.gamesettings.nightcore,
    gsDoubletime: window.gamesettings.doubletime,
    gsHardrock: window.gamesettings.hardrock,
    gsDim: window.gamesettings.dim,
    gsCursor: window.gamesettings.cursorsize,
    gsMaster: window.gamesettings.mastervolume,
    modActive: (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize() : null,
  }));
  console.log("=== DT/NC migration ==="); console.log(JSON.stringify(st));
  console.log("pageerrors:", errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  // migration should add doubletime=true (NC implies DT), keep nightcore=true, preserve hardrock/dim/cursor/master
  const ok = st.gsDoubletime===true && st.gsNightcore===true && st.gsHardrock===true && st.gsDim===40 && st.gsCursor===1.2 && st.gsMaster===50 && errs.length===0;
  console.log("\nSETTINGS MIGRATE OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});