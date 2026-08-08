const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5201","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let ve=""; vite.stderr.on("data",d=>ve+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5201/index-v2.html"))){console.log("vite not ready",ve);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage();
  await p.goto("http://localhost:5201/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>typeof window.PIXI==="object", null, {timeout:15000}).catch(()=>{});
  const api = await p.evaluate(()=>({
    geomDestroy: typeof (PIXI.Geometry && PIXI.Geometry.prototype.destroy),
    geomDispose: typeof (PIXI.Geometry && PIXI.Geometry.prototype.dispose),
    progDestroy: typeof (PIXI.GlProgram && PIXI.GlProgram.prototype.destroy),
    shaderDestroy: typeof (PIXI.Shader && PIXI.Shader.prototype.destroy),
  }));
  console.log("=== v8 resource destroy API (SliderMesh.destroy deps) ==="); console.log("  ", JSON.stringify(api));
  const ok = api && api.geomDestroy==="function" && api.geomDispose==="undefined" && api.progDestroy==="function" && api.shaderDestroy==="function";
  console.log("Geometry/GlProgram/Shader .destroy exist + Geometry.dispose absent:", ok);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
