const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5192","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function check(p, url){
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto(url,{waitUntil:"load",timeout:30000});
  await p.waitForFunction(()=>document.querySelectorAll(".beatmap-card").length>0, null,{timeout:20000});
  const n = await p.evaluate(()=>document.querySelectorAll(".beatmap-card").length);
  p.removeAllListeners("pageerror");
  return { n, errs: errs.filter(e=>!/catboy|api\/activity|500|fetch|ERR_/i.test(e)) };
}
async function main(){
  if(!(await wait("http://localhost:5192/hot-v2.html"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage({viewport:{width:1280,height:800}});
  const hot = await check(p, "http://localhost:5192/hot-v2.html");
  const ne = await check(p, "http://localhost:5192/new-v2.html");
  console.log("hot-v2 cards:", hot.n, "errors:", hot.errs.length);
  console.log("new-v2 cards:", ne.n, "errors:", ne.errs.length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  const ok = hot.n>0 && hot.errs.length===0 && ne.n>0 && ne.errs.length===0;
  console.log("\nHOT/NEW OK:", ok);
  process.exit(ok?0:1);
}
main().catch(async e=>{console.error(e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
