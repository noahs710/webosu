const fs = require("fs");
const dir = "src/game/overlay";
const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
function mb(s, start) { let d=0,i=start; while(i<s.length){if(s[i]==="{")d++;else if(s[i]==="}"){d--;if(d===0)return i;}i++;}return -1; }
function convert(file) {
  let c = fs.readFileSync(file, "utf8");
  c = c.replace(/PIXI\.BLEND_MODES\.ADD/g, '"add"').replace(/PIXI\.BLEND_MODES\.NORMAL/g, '"normal"');
  c = c.replace(/new PIXI\.Text\(\s*("[^"]*")\s*,\s*\{([\s\S]*?)\n\s*\}\)/g, 'new PIXI.Text({ text: $1, style: {$2\n      } })');
  const fnRe = /function (\w+)\s*\(([^)]*)\)\s*\{/;
  const m = c.match(fnRe);
  if (!m) { console.log(file + ": skip"); return; }
  const name = m[1], params = m[2];
  const fnStart = c.indexOf(m[0]);
  const bodyStart = fnStart + m[0].length;
  const bodyEnd = mb(c, bodyStart - 1);
  if (bodyEnd < 0) { console.log(file + ": brace fail"); return; }
  let ctorBody = c.slice(bodyStart, bodyEnd).replace(/^[ \t]*PIXI\.Container\.call\(this\);\r?\n/m, "");
  let rest = c.slice(bodyEnd + 1);
  rest = rest.replace(/\s*if \(PIXI\.Container\)[\s\S]*?\}\s*/, "");
  rest = rest.replace(new RegExp("\\s*" + name + "\\.prototype\\s*=\\s*Object\\.create\\([\\s\\S]*?\\);\\s*" + name + "\\.prototype\\.constructor\\s*=\\s*" + name + ";\\s*"), "");
  // extract ALL prototype methods via matchAll (on original rest, no stale lastIndex)
  const protoRe = new RegExp(name + "\\.prototype\\.(\\w+)\\s*=\\s*function\\s*\\w*\\s*\\(([^)]*)\\)\\s*\\{", "g");
  const matches = [...rest.matchAll(protoRe)];
  const methods = [], ranges = [];
  for (const pm of matches) {
    const ms = pm.index, mbs = ms + pm[0].length, mbe = mb(rest, mbs - 1);
    if (mbe < 0) continue;
    methods.push("  " + pm[1] + "(" + pm[2] + ") {" + rest.slice(mbs, mbe) + "  }");
    ranges.push([ms, mbe + 2]);
  }
  ranges.sort((a, b) => b[0] - a[0]);
  for (const [s, e] of ranges) rest = rest.slice(0, s) + rest.slice(e);
  rest = rest.replace(new RegExp("\\s*" + name + "\\.prototype\\.[\\s\\S]*?;\\s*", "g"), "");
  let out = "class " + name + " extends PIXI.Container {\n  constructor(" + params + ") {\n    super();\n" + ctorBody + "\n  }\n" + methods.join("\n") + "\n}\nexport default " + name + ";\n";
  fs.writeFileSync(file, out);
  console.log(file + ": " + methods.length + " methods, " + out.split("\n").length + " lines");
}
for (const f of files) convert(dir + "/" + f);
