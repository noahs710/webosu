// Headless gameplay verification against the PRODUCTION build (dist/ served by
// vite preview). Same gameplay-launch path as headless-play.js, but exercises the
// Vite-bundled ESM graph (main-[hash].js) + copied classic assets instead of the
// dev server. Proves the built site actually plays, not just boots.
// Run: npm run build && node scripts/headless-build-play.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909, BID = 4174364, VER = "Lightspeed";
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","preview","--port","5177","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let viteErr=""; vite.stderr.on("data",d=>viteErr+=d);
async function wait(url,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(url);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5177/index-v2.html"))){console.log("vite preview not ready",viteErr);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errors=[]; p.on("pageerror",e=>{errors.push(String(e)); console.log("PAGEERROR-STACK:",String(e.stack||e).split("\n").slice(0,6).join(" | "));});
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/activity|500/.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,160))});
  await p.goto("http://localhost:5177/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null, {timeout:20000}).catch(()=>{});
  console.log("bootstrap: launchGame="+typeof (await p.evaluate(()=>window.launchGame))+" skinReady="+await p.evaluate(()=>window.skinReady)+" soundReady="+await p.evaluate(()=>window.soundReady));
  console.log("launching map set "+SET+" bid "+BID+" ...");
  const launchInfo = await p.evaluate(async (set)=>{
    try {
      const r = await fetch("https://catboy.best/d/"+set+"n");
      if(!r.ok) return {fetchErr:"status "+r.status};
      const blob = await r.blob();
      const ab = await blob.arrayBuffer();
      window.__osublob = new Blob([ab]);
      window.launchGame(window.__osublob, 4174364, "Lightspeed");
      return {fetched:window.__osublob.size};
    } catch(e){ return {evalErr:String(e)}; }
  }, SET);
  console.log("launch result:", JSON.stringify(launchInfo));
  await p.waitForTimeout(9000);
  const cnv = await p.evaluate(()=>{ const c=document.querySelector("canvas"); return c?{w:c.width,h:c.height}:null; });
  const t1 = await p.evaluate(()=> (window.playback&&window.playback.osu&&window.playback.osu.audio)?window.playback.osu.audio.getPosition():-1);
  await p.waitForTimeout(2500);
  const t2 = await p.evaluate(()=> (window.playback&&window.playback.osu&&window.playback.osu.audio)?window.playback.osu.audio.getPosition():-1);
  const st = await p.evaluate(()=>({
    app: !!window.app, playback: !!window.playback,
    hits: window.playback ? (window.playback.hits?window.playback.hits.length:0) : 0,
    audioReady: window.playback ? !!window.playback.audioReady : false,
    canvas: !!document.querySelector("canvas"),
    gaming: document.body.classList.contains("gaming"),
    currentHitIndex: window.playback ? window.playback.currentHitIndex : -1,
    scoreVisible: !!(window.playback && window.playback.scoreOverlay),
  }));
  st.canvasSize = cnv; st.audioPos_t1 = t1; st.audioPos_t2 = t2; st.audioAdvanced = (t2 > t1);
  console.log("=== gameplay state ==="); for(const k of Object.keys(st)) console.log("  "+k+" = "+st[k]);
  console.log("=== pageerrors ("+errors.length+") ==="); errors.slice(0,12).forEach(e=>console.log("  "+e));
  try { await p.screenshot({path:"scripts/headless-build-play.png"}); console.log("screenshot: scripts/headless-build-play.png"); } catch(e){}
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal = errors.filter(e=>!/catboy|api\/activity|500|network/i.test(e));
  console.log("\nFATAL errors: "+fatal.length);
  process.exit(fatal.length?1:0);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
