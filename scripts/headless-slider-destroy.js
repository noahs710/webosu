// Headless: directly construct + destroy a SliderMesh to exercise the
// SliderMesh.destroy() fix (geometry.dispose -> destroy). This catches the
// slider-despawn crash regression that headless:play missed (its sliders didn't
// despawn during the short run). Run: node scripts/headless-slider-destroy.js (dev)
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5202","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5202/browse"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5202/browse",{waitUntil:"load",timeout:30000});
await p.waitForFunction(()=>typeof window.__ensureGame==="function", null, {timeout:15000}).catch(()=>{});
  await p.evaluate(()=>window.__ensureGame && window.__ensureGame()).catch(()=>{});
  await p.waitForFunction(()=>typeof window.PIXI==="object" && window.PIXI.Geometry, null, {timeout:15000}).catch(()=>{});
  // import the SliderMesh class + construct (creates this.geometry) + destroy
  const r = await p.evaluate(async () => {
    try {
      const SM = (await import("/src/game/SliderMesh.js")).default;
      const curve = { curve: [{x:0,y:0,t:0},{x:100,y:50,t:1},{x:200,y:0,t:2}] };
      const sm = new SM(curve, 20, 0);
      const hadGeom = !!sm.geometry;
      sm.destroy();
      return { ok: true, hadGeom, geomAfter: sm.geometry };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  console.log("=== SliderMesh construct + destroy ==="); console.log("  ", JSON.stringify(r));
  const ok = r && r.ok && r.hadGeom && r.geomAfter === null;
  console.log("SliderMesh.destroy() works (no crash, geometry freed):", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  console.log("fatal:", fatal.length);
  process.exit(ok && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
