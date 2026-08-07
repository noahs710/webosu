// Convert initgame.js (require-style) and launchgame.js (plain classic script) to ESM.
const fs = require("fs");

// initgame.js: require([deps], function(Osu,_,sound,Playback){ BODY });
let c = fs.readFileSync("js/initgame.js", "utf8");
const reqRe = /require\(\s*\[[\s\S]*?\]\s*,\s*function\s*\(\s*Osu\s*,\s*_\s*,\s*sound\s*,\s*Playback\s*\)\s*\{/;
const m = c.match(reqRe);
if (!m) throw new Error("initgame require header not found");
let body = c.slice(m.index + m[0].length);
body = body.replace(/\n\s*\}\s*\)\s*;?\s*$/, ""); // strip closing });
fs.writeFileSync("src/game/initgame.js",
  'import Osu from "./osu.js";\nimport Playback from "./playback.js";\n' + body + "\n");

// launchgame.js: plain script with function launchOSU/launchReplay/launchGame.
c = fs.readFileSync("js/launchgame.js", "utf8");
c = c.replace(/^function launchOSU\(/m, "export function launchOSU(");
c = c.replace(/^function launchReplay\(/m, "export function launchReplay(");
c = c.replace(/^function launchGame\(/m, "export function launchGame(");
fs.writeFileSync("src/game/launchgame.js", 'import Osu from "./osu.js";\n' + c + "\n");
console.log("initgame + launchgame converted");
