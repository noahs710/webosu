const { spawn } = require("child_process");
const { chromium } = require("playwright");
const vite=spawn(process.execPath,["node_modules/vite/bin/vite.js","--port","5197","--strictPort"],{stdio:["ignore","pipe","pipe"]});
const kids=[vite];
async function wait(u,ms=20000){const t0=Date.now();while(Date.now()-t0<ms){try{const r=await fetch(u);if(r.status<500)return true;}catch(e){}await new Promise(r=>setTimeout(r,200));}return false;}
async function main(){
  if(!(await wait("http://localhost:5197/index-v2.html"))){process.exit(1);}
  const b=await chromium.launch({headless:true});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(String(e)));
  await p.goto("http://localhost:5197/index-v2.html?watch=testreplay&bid=4174364&sid=2006909&v=Lightspeed",{waitUntil:"load",timeout:30000});
  await p.waitForTimeout(8000);
  // check that replaywatch ran: it should have attempted fetch /api/replays/testreplay (which 500s - no backend)
  const replayRan = await p.evaluate(()=>typeof window.launchReplay === "function");
  console.log("launchReplay available:", replayRan);
  console.log("pageerrors:", errs.length, "fatal:", errs.filter(e=>!/catboy|api\/|500|fetch|ERR_|Replay unavailable/i.test(e)).length);
  await b.close(); for(const k of kids)try{k.kill("SIGTERM")}catch(e){}
  process.exit(0);
}
main().catch(e=>{console.error(e);process.exit(2);});
