// Verify the Flashlight mod: launch a map with FL active, confirm the FL overlay
// is created and the game runs without pageerrors.
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5196","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5196/browse"))){process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--autoplay-policy=no-user-gesture-required","--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  // seed settings with FL active and custom sizes
  await p.addInitScript((s)=>{ localStorage.setItem("osugamesettings", s); }, JSON.stringify({ flashlight: true, flSize0: 500, flSize200: 200, dim: 60, mastervolume: 50 }));
  await p.goto("http://localhost:5196/browse",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null, {timeout:20000}).catch(()=>{});
  // fetch a real .osz from catboy.best
  const blob = await p.evaluate(async () => {
    const r = await fetch("https://catboy.best/d/2006909n");
    if(!r.ok) return null;
    const blob = await r.blob();
    window.__osublob = blob;
    return true;
  });
  if (!blob) { console.log("fetch failed"); process.exit(1); }
  await p.evaluate(() => { window.launchGame(window.__osublob, 4174364, "Lightspeed"); });
  await p.waitForFunction(()=>!!window.playback, null, {timeout:30000});
  // wait for the FL overlay to be created
  await p.waitForFunction(()=>!!(window.playback && window.playback.flOverlay), null, {timeout:10000}).catch(()=>{});
  const st = await p.evaluate(()=>({
    flActive: !!window.game.flashlight,
    flOverlay: !!(window.playback && window.playback.flOverlay),
    flSliderDim: !!(window.playback && window.playback.flSliderDim),
    flSettings: window.ModRegistry && window.ModRegistry.get("FL") ? window.ModRegistry.get("FL").settings : null,
    flRadiusCombo0: window.playback ? window.playback.flRadiusForCombo(0) : -1,
    flRadiusCombo200: window.playback ? window.playback.flRadiusForCombo(200) : -1,
    modActive: (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize() : null,
    hits: window.playback ? window.playback.hits.length : 0,
  }));
  console.log("=== Flashlight ==="); console.log(JSON.stringify(st));
  console.log("pageerrors:", errs.length);
  if (errs.length) console.log("errors:", errs.slice(0,5));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const radiusOk = st.flRadiusCombo0 === 500 && st.flRadiusCombo200 === 200;
  const ok = st.flActive && st.flOverlay && radiusOk && st.modActive && st.modActive.includes("FL") && errs.length===0;
  console.log("\nFLASHLIGHT OK:", ok, "radiusOk:", radiusOk);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});