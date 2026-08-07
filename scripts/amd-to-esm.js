// AMD -> ESM codemod for webosu game modules.
// Inter-module deps become ESM imports with paths RELATIVE to each file's dir.
// External libs (underscore "sound") stay as classic-script globals (_, sounds, makeSound).
// Two modules (osu, curves/CircumscribedCircle) export via a mid-body `return X;`
// followed by hoisted function declarations; the EXPORT map handles those.
const fs = require("fs"), path = require("path");

const FILES = [
  "curves/Bezier2","curves/CircumscribedCircle","curves/Curve","curves/CurveType",
  "curves/EqualDistanceMultiCurve","curves/LinearBezier",
  "overlay/break","overlay/hiterrormeter","overlay/loading","overlay/progress",
  "overlay/score","overlay/volume",
  "osu-audio","osu","playback","playerActions","SliderMesh",
];
// modules whose export is a mid-body `return <Name>;` (not the trailing statement)
const EXPORT = { "osu": "Osu", "curves/CircumscribedCircle": "CircumscribedCircle" };

function convert(rel, srcPath, destPath) {
  let c = fs.readFileSync(srcPath, "utf8");
  const headerRe = /define\(\s*\[([\s\S]*?)\]\s*,\s*function\s*\(([^)]*)\)\s*\{/;
  const m = c.match(headerRe);
  if (!m) throw new Error("no define header in " + srcPath);
  const deps = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
  const params = m[2].split(",").map(s => s.trim()).filter(Boolean);
  const destDir = path.dirname(destPath);
  const imports = [];
  for (let i = 0; i < deps.length; i++) {
    const d = deps[i], p = params[i] || ("_dep" + i);
    if (d === "underscore" || d === "sound") continue; // globals via classic scripts
    const target = path.join("src/game", d + ".js");          // absolute-ish target
    let relPath = path.relative(destDir, target).replace(/\\/g, "/");
    if (!relPath.startsWith(".")) relPath = "./" + relPath;
    imports.push("import " + p + ' from "' + relPath + '";');
  }
  let after = c.slice(m.index + m[0].length);
  const tailRe = /(\n\s*)return\s+([A-Za-z_$][\w$]*)\s*;\s*\n\s*\}\s*\)\s*;?\s*$/;
  let body, exportLine;
  const tm = after.match(tailRe);
  if (tm) {                                       // trailing return export
    body = after.slice(0, tm.index);
    exportLine = tm[1] + "export default " + tm[2] + ";";
  } else if (EXPORT[rel]) {                       // mid-body return export
    const name = EXPORT[rel];
    const re = new RegExp("(\\n\\s*)return\\s+" + name + "\\s*;", "m");
    const em = after.match(re);
    if (!em) throw new Error("could not find mid-body return " + name + " in " + srcPath);
    body = after.slice(0, em.index) + em[1] + "export default " + name + ";" + after.slice(em.index + em[0].length);
    body = body.replace(/\n\s*\}\s*\)\s*;?\s*$/, ""); // strip trailing });
    exportLine = "";
  } else {                                        // no export (e.g. initgame) — strip wrapper
    body = after.replace(/\n\s*\}\s*\)\s*;?\s*$/, "");
    exportLine = "";
  }
  const out = (imports.length ? imports.join("\n") + "\n" : "") + body + exportLine + "\n";
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, out);
}

let ok = 0, bad = 0;
for (const f of FILES) {
  try { convert(f, "js/" + f + ".js", "src/game/" + f + ".js"); ok++; }
  catch (e) { bad++; console.log("FAILED " + f + ": " + e.message); }
}
console.log("converted " + ok + " files, " + bad + " failed");
