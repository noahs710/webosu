// Verify all 11 fun mods don't crash: launch a map with all fun mods active,
// confirm the game runs without pageerrors. (Per-mod individual tests are
// documented in tasks.md; this combined test is the crash-catch.)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5197","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5197/browse"))){process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--autoplay-policy=no-user-gesture-required","--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  // seed settings with all 12 fun mods via gamesettings flat flags
  await p.addInitScript((s)=>{ localStorage.setItem("osugamesettings", s); }, JSON.stringify({
    dim: 60, mastervolume: 50,
    flashlight: true,
    adaptiveSpeed: true,
    magnetised: true,
    wobble: true,
    windup: true,
    traceable: true,
    approachDifferent: true,
    bubbles: true,
    repel: true,
    depth: true,
    transform: true,
    noscope: true,
  }));
  await p.goto("http://localhost:5197/browse",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null, {timeout:20000}).catch(()=>{});
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
  await p.waitForFunction(()=>!!(window.playback && window.playback.hits && window.playback.hits.length), null, {timeout:10000}).catch(()=>{});
  const st = await p.evaluate(()=>({
    modActive: (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize() : null,
    hits: window.playback ? window.playback.hits.length : 0,
    flOverlay: !!(window.playback && window.playback.flOverlay),
    bubbles: window.playback ? window.playback._bubbles.length : -1,
    gameFlags: {
      magnetised: window.game.magnetised, wobble: window.game.wobble, windup: window.game.windup,
      traceable: window.game.traceable, approachDifferent: window.game.approachDifferent,
      bubbles: window.game.bubbles, repel: window.game.repel, depth: window.game.depth,
      transform: window.game.transform, noscope: window.game.noscope, adaptiveSpeed: window.game.adaptiveSpeed,
    },
  }));
  console.log("=== All Fun Mods ==="); console.log(JSON.stringify(st));
  console.log("pageerrors:", errs.length);
  if (errs.length) console.log("errors:", errs.slice(0,5));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = st.hits > 0 && errs.length===0 && st.gameFlags.magnetised && st.gameFlags.wobble && st.gameFlags.wobble && st.gameFlags.windup && st.gameFlags.traceable && st.gameFlags.approachDifferent && st.gameFlags.bubbles && st.gameFlags.repel && st.gameFlags.depth && st.gameFlags.transform && st.gameFlags.noscope && st.gameFlags.adaptiveSpeed;
  console.log("\nFUN MODS OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});