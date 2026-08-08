const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5199","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5199/index-v2.html"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5199/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.PIXI==="object" && window.PIXI.Geometry, null, {timeout:15000}).catch(()=>{});
  // verify the v8 Geometry API the SliderMesh.destroy fix relies on
  const api = await p.evaluate(()=>{ try { const g = new PIXI.Geometry(); g.addAttribute("position", { data: new Float32Array([0,0,0, 1,0,0, 0,1,0]), size: 3 }); g.addIndex([0,1,2]); const r = { destroy: typeof g.destroy, dispose: typeof g.dispose }; g.destroy(); return r; } catch(e){ return {err:String(e)}; } });
  console.log("=== v8 Geometry API ==="); console.log("  ", JSON.stringify(api));
  const ok = api && api.destroy === "function" && api.dispose === "undefined";
  console.log("Geometry.destroy exists + dispose absent (fix correct):", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|api\/|500|network/i.test(e));
  console.log("fatal:", fatal.length);
  process.exit(ok && fatal.length===0 ? 0 : 1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
