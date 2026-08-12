// scripts/typecheck.mjs - syntax check pass over every JS source in src/ scripts/ server/.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const ROOTS = ["src", "scripts", "server"];
const SKIP = new Set(["node_modules", "dist", ".empryo", ".git"]);
const DOT = String.fromCharCode(46);
const DLR = String.fromCharCode(36);
const RE_JS = new RegExp(DOT + "(c?js|mjs)" + DLR, "i");
const RE_MIN = new RegExp(DOT + "min" + DOT + "js" + DLR, "i");
function walk(d, o) {
  let e;
  try { e = readdirSync(d); } catch (_) { return; }
  for (const n of e) {
    if (SKIP.has(n)) continue;
    const p = join(d, n);
    let s;
    try { s = statSync(p); } catch (_) { continue; }
    if (s.isDirectory()) walk(p, o);
    else if (s.isFile() && RE_JS.test(n) && !RE_MIN.test(n)) o.push(p);
  }
}
const files = [];
for (const r of ROOTS) walk(r, files);
let pass = 0, fail = 0;
const errors = [];
for (const f of files) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf8" });
  if (r.status === 0) pass++;
  else { fail++; errors.push({ file: f, stderr: (r.stderr || r.stdout || "").trim().slice(0, 400) }); }
}
console.log("typecheck: " + pass + " passed, " + fail + " failed (" + files.length + " files)");
for (const e of errors) console.log("FAIL " + e.file + " :: " + e.stderr);
process.exit(fail ? 1 : 0);
