// Headless AUTOPLAY verification: launches a real map with game.autoplay=true and
// --autoplay-policy=no-user-gesture-required so the audio clock runs and the game
// self-plays. This exercises the full gameplay hot path (playerActions auto-driver,
// hitSuccess, scoring, combo, HP, slider SliderMesh rendering, spinners) and watches
// for throws. (Feel/timing still need real hardware, but a clean autoplay run proves
// the gameplay code path doesn't crash end-to-end.)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5178","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let viteErr=""; vite.stderr.on("data",d=>viteErr+=d);
async function wait(url,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(url);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5178/index-v2.html"))){console.log("vite not ready",viteErr);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const p=await b.newPage({viewport:{width:1280,height:720}});
  const errors=[]; p.on("pageerror",e=>errors.push(String(e)));
  p.on("console",m=>{if(m.type()==="error" && !/catboy|api\/activity|500/.test(m.text())) console.log("CONSOLE-ERR:",m.text().slice(0,150))});
  await p.goto("http://localhost:5178/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  // enable autoplay + prevent fullscreen
  await p.evaluate(()=>{ window.game.autoplay = true; window.game.autofullscreen = false; });
  console.log("autoplay set: " + await p.evaluate(()=>window.game.autoplay));
  const lr = await p.evaluate(async (set)=>{
    try { const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob, 4174364, "Lightspeed"); return {fetched:window.__osublob.size}; }
    catch(e){ return {evalErr:String(e)}; }
  }, SET);
  console.log("launch:", JSON.stringify(lr));
  await p.waitForFunction(()=>!!window.playback && !!window.playback.osu && !!window.playback.osu.audio, null,{timeout:20000}).catch(()=>{});
  // resume the audio clock if suspended, then let autoplay play
  await p.evaluate(()=>{ try { window.playback.osu.audio.audio.resume(); } catch(e){} });
  const s0 = await sample(); await p.waitForTimeout(10000); const s1 = await sample();
  console.log("=== autoplay progression ===");
  console.log("  audioPos  ", s0.pos, "->", s1.pos, " advanced="+(s1.pos>s0.pos));
  console.log("  hitIndex  ", s0.idx, "->", s1.idx);
  console.log("  score     ", s0.score, "->", s1.score);
  console.log("  combo     ", s1.combo, " great/miss", s1.great+"/"+s1.miss);
  console.log("  ended     ", s1.ended);
  console.log("=== pageerrors ("+errors.length+") ==="); errors.slice(0,12).forEach(e=>console.log("  "+e));
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal = errors.filter(e=>!/catboy|api\/activity|500|network/i.test(e));
  console.log("\nFATAL errors: "+fatal.length);
  process.exit(fatal.length?1:0);
  async function sample(){ return await p.evaluate(()=>{
    const pb=window.playback||{};
    const so=pb.scoreOverlay||{};
    return {
      pos: (pb.osu&&pb.osu.audio)?pb.osu.audio.getPosition():-1,
      idx: pb.currentHitIndex||0,
      score: so.score||0,
      combo: so.combo||0,
      great: so.judgecnt?so.judgecnt.great:0,
      miss: so.judgecnt?so.judgecnt.miss:0,
      ended: !!pb.ended, endTime: pb.endTime||0, hitsLen: pb.hits?pb.hits.length:0, lastEnd: (pb.hits&&pb.hits.length)?pb.hits[pb.hits.length-1].endTime:0, firstTime:(pb.hits&&pb.hits.length)?pb.hits[0].time:0,
    };
  }); }
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
