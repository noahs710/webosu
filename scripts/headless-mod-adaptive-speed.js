// Verify Adaptive Speed settings propagation: activate AS with a custom maxRate,
// confirm the ModAdaptiveSpeed instance receives the setting.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5198","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5198/browse"))){process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--autoplay-policy=no-user-gesture-required","--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.addInitScript((s)=>{ localStorage.setItem("osugamesettings", s); }, JSON.stringify({ adaptiveSpeed: true, asMaxRate: 1.12, dim: 60, mastervolume: 50 }));
  await p.goto("http://localhost:5198/browse",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null, {timeout:20000}).catch(()=>{});
  const st = await p.evaluate(()=>({
    asActive: !!window.game.adaptiveSpeed,
    asSettings: window.ModRegistry && window.ModRegistry.get("AS") ? window.ModRegistry.get("AS").settings : null,
  }));
  console.log("=== Adaptive Speed ==="); console.log(JSON.stringify(st));
  console.log("pageerrors:", errs.length);
  if (errs.length) console.log("errors:", errs.slice(0,5));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = st.asActive && st.asSettings && st.asSettings.maxRate === 1.12 && errs.length===0;
  console.log("\nADAPTIVE SPEED OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
