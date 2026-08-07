// Headless-verify the Pixi 8 render benchmark (bench.html) served by vite preview
// (the production build). Confirms it runs on the v8 stack (PIXI.VERSION 8.x),
// the FPS HUD populates, the z-order/pool toggles flip without errors. The binding
// p95 numbers still need the 2015 floor device; this catches crashes/API drift.
// Run: npm run build && node scripts/headless-bench.js
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js","preview","--port","5182","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[preview]; let pe=""; preview.stderr.on("data",d=>pe+=d);
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5182/bench.html"))){console.log("vite preview not ready",pe);process.exit(1);}
  const b=await chromium.launch({headless:true, args:["--use-gl=swiftshader","--enable-webgl"]});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  p.on("console",m=>{if(m.type()==="error")console.log("CONSOLE-ERR:",m.text().slice(0,160))});
  await p.goto("http://localhost:5182/bench.html",{waitUntil:"load",timeout:30000});
  // let the ticker run a few frames so the HUD populates
  await p.waitForFunction(()=>{const f=document.getElementById("fps");return f&&f.textContent!=="--";},null,{timeout:15000}).catch(()=>{});
  const st=await p.evaluate(()=>({
    pixi: document.getElementById("ver").textContent,
    fps: document.getElementById("fps").textContent,
    p95: document.getElementById("p95").textContent,
    cnt: document.getElementById("cnt").textContent,
    mode: document.getElementById("mode").textContent,
    hasCanvas: !!document.querySelector("canvas"),
  }));
  console.log("=== bench.html (built, Pixi 8) ===");
  for(const k of Object.keys(st)) console.log("  "+k+" = "+st[k]);
  // toggle z-order off + pool off, ensure no crash + mode updates
  await p.evaluate(()=>{ document.getElementById("zorder").checked=false; document.getElementById("zorder").onchange(); });
  await p.waitForTimeout(500);
  await p.evaluate(()=>{ document.getElementById("pool").checked=false; document.getElementById("pool").onchange(); });
  await p.waitForTimeout(500);
  const mode2=await p.evaluate(()=>document.getElementById("mode").textContent);
  console.log("  after toggles mode = "+mode2);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const fatal=errs.filter(e=>!/catboy|assets\.ppy|ERR_|net::|Failed to fetch/i.test(e));
  console.log("\npageerrors:",errs.length,"FATAL:",fatal.length);
  const ok = /^8\./.test(st.pixi) && st.fps!=="--" && st.hasCanvas && fatal.length===0;
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
