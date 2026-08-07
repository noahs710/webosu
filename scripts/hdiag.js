const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js","--port","5176","--strictPort"], { stdio:["ignore","pipe","pipe"] });
const kids=[vite]; let viteErr=""; vite.stderr.on("data",d=>viteErr+=d);
async function wait(url,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(url);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5176/index-v2.html"))){console.log("vite not ready",viteErr);process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  p.on("pageerror",e=>console.log("PAGEERROR:",e.message,"|||",String(e.stack||"").split("\n").slice(0,3).join(" / ")));
  p.on("console",m=>console.log("CONSOLE["+m.type()+"]:",m.text(),"@"+(m.location()&&m.location().url)));
  p.on("requestfailed",r=>console.log("REQFAIL:",r.url().replace("http://localhost:5176",""),r.failure()&&r.failure().errorText));
  await p.goto("http://localhost:5176/index-v2.html",{waitUntil:"load",timeout:30000});
  await p.waitForTimeout(5000);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  process.exit(0);
}
main().catch(async e=>{console.error("FATAL",e);for(const k of kids)try{k.kill()}catch(_){};process.exit(2);});
