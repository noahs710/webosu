// Headless: responsive field sizing + on-screen pause button. Launches the game,
// then resizes the viewport and checks the gamefield scale: capped at the
// recommended size on large screens, scaled down to fit small/touch screens.
// Also confirms the touch pause button is present. Run: node scripts/headless-touch.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const SET = 2006909;
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5188","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5188/index-v2.html"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl","--autoplay-policy=no-user-gesture-required"]});
  const ctx=await b.newContext({viewport:{width:1280,height:720}});
  const p=await ctx.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5188/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>window.skinReady && window.soundReady, null,{timeout:20000}).catch(()=>{});
  await p.evaluate(()=>{ if(window.game){ window.game.autoplay=true; window.game.autofullscreen=false; } });
  const lr = await p.evaluate(async (set)=>{ try { const r=await fetch("https://catboy.best/d/"+set+"n"); const ab=await (await r.blob()).arrayBuffer(); window.__osublob=new Blob([ab]); window.launchGame(window.__osublob,4174364,"Lightspeed"); return {fetched:window.__osublob.size}; } catch(e){ return {err:String(e)}; } }, SET);
  if (!lr.fetched) { console.log("launch failed", JSON.stringify(lr)); process.exit(1); }
  await p.waitForFunction(()=>!!window.playback && !!window.playback.gamefield, null,{timeout:20000}).catch(()=>{});
  const scale = () => p.evaluate(()=>({ s: window.playback && window.playback.gamefield ? window.playback.gamefield.scale.x : null, pauseBtn: !!document.querySelector("#game-area button[aria-label=Pause]") }));
  async function check(viewport, label, expectCap) {
    await p.setViewportSize({width:viewport[0],height:viewport[1]});
    await p.waitForTimeout(500); // let resize + calcSize settle
    const st = await scale();
    console.log("=== " + label + " (" + viewport[0] + "x" + viewport[1] + ") ===");
    console.log("  gamefield.scale.x =", st.s, " pauseBtn:", st.pauseBtn);
    return st;
  }
  let pass=0, fail=0;
  function ck(n,c,x){c?pass++:fail++;console.log((c?"  ok   ":"  FAIL ")+n+(x?"  "+x:""));}
  const laptop = await check([1280,720], "laptop"); ck("laptop scale ~1.5 (not capped, scales with screen)", Math.abs(laptop.s-1.5)<0.01, "s="+laptop.s);
  const big = await check([2560,1440], "large desktop"); ck("large screen capped at 2.25 (recommended, not blown up)", Math.abs(big.s-2.25)<0.01, "s="+big.s);
  const mobile = await check([400,800], "mobile/touch"); ck("small screen scales down (< 2.25)", mobile.s < 2.25 && mobile.s > 0, "s="+mobile.s);
  ck("touch pause button present", mobile.pauseBtn === true, "pauseBtn="+mobile.pauseBtn);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal = errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  ck("no fatal pageerrors", fatal.length===0, "fatal="+fatal.length);
  fatal.slice(0,5).forEach(e=>console.log("    "+e.slice(0,200)));
  console.log("\n"+pass+" passed, "+fail+" failed");
  process.exit(fail?1:0);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
