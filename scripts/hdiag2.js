const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5196","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5196/browse-v2.html"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  p.on("pageerror",e=>console.log("PAGEERROR:",String(e.stack||e).split("\n").slice(0,4).join(" | ")));
  await p.goto("http://localhost:5196/browse-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForTimeout(5000);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(2);});
