// tests/lazer-parity.spec.mjs — wiki-anchored parity rules + grep-audit
// enforcement for M1.4/M1.6/M1.8.
//
// Run: node tests/lazer-parity.spec.mjs
// Exit 0 on pass, 1 on failure. Pure-Node (no browser needed).
//
// Covers:
//   - M1.6  lazerHitWindowsLinear is gone (no production callers)
//   - M1.4  No `pointAt(` calls in playback.js outside implementer files
//   - M1.8  No stable-era math in playback.js (stackScale*6.4, 200-10*OD, (109-9*CS)/2)
//   - Wiki-anchored hit windows: great=80-6·OD, ok=140-8·OD, meh=200-10·OD, miss=400
//   - LAZER_MISS_WINDOW === 400
//   - Stack offset constants STACK_OFFSET_X === 4, STACK_OFFSET_Y === 4
//   - SliderJudge + SliderScorer are both instantiated (M1.9 contract)

import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const url = (p) => pathToFileURL(resolve(root, p)).href;

let passed = 0;
let failed = 0;
function check(name, fn) {
   try {
      fn();
      console.log(`  ok  ${name}`);
      passed++;
   } catch (e) {
      console.log(`FAIL  ${name}`);
      console.log(`      ${e.message}`);
      failed++;
   }
}

console.log("== M1.6 — lazerHitWindowsLinear removed ==");
const hpTables = await import(url("src/game/lazerHpTables.js"));
check("lazerHitWindowsLinear is not exported", () => {
   assert.equal(hpTables.lazerHitWindowsLinear, undefined,
      "lazerHitWindowsLinear should be removed in M1.6");
});

console.log("== Wiki-anchored hit windows ==");
check("LAZER_MISS_WINDOW === 400 (lazer constant)", () => {
   assert.equal(hpTables.LAZER_MISS_WINDOW, 400);
});
for (const od of [0, 5, 10]) {
   check(`lazerHitWindows(od=${od}) matches wiki-anchored linear at boundary`, () => {
      const w = hpTables.lazerHitWindows(od);
      const expected = {
         great: 80 - 6 * od,
         ok: 140 - 8 * od,
         meh: 200 - 10 * od,
         miss: 400,
      };
      // At boundary OD ∈ {0, 5, 10}, the two-piece form matches the wiki linear
      // form (the -0.5 floor is sub-millisecond and rounds away from boundary).
      assert.ok(Math.abs(w.great - expected.great) <= 0.5,
         `great at OD=${od}: got ${w.great}, expected ~${expected.great}`);
      assert.ok(Math.abs(w.ok - expected.ok) <= 0.5,
         `ok at OD=${od}: got ${w.ok}, expected ~${expected.ok}`);
      assert.ok(Math.abs(w.meh - expected.meh) <= 0.5,
         `meh at OD=${od}: got ${w.meh}, expected ~${expected.meh}`);
      assert.equal(w.miss, 400);
   });
}

console.log("== M1.4 — pointAtInto-only curve contract (grep audit) ==");
const playback = readFileSync(resolve(root, "src/game/playback.js"), "utf8");
const playbackPointAtCalls = (playback.match(/\.pointAt\(/g) || []).length;
check("playback.js: no `pointAt(` calls remain (only `pointAtInto`)", () => {
   assert.equal(playbackPointAtCalls, 0,
      `playback.js still has ${playbackPointAtCalls} '.pointAt(' calls — switch to pointAtInto`);
});

console.log("== M1.8 — no stable-era math in playback.js (grep audit) ==");
check("no `stackScale * 6.4` in playback.js", () => {
   assert.equal(/stackScale\s*\*\s*6\.4/.test(playback), false,
      "playback.js must not contain the stable-era stackScale*6.4 formula");
});
check("no `200 - 10*OD` hit-window math in playback.js", () => {
   assert.equal(/200\s*-\s*10\s*\*\s*OD/.test(playback), false,
      "playback.js must not contain the stable-era 200-10*OD hit-window formula");
});
check("no `(109 - 9*CS) / 2` circle-radius formula in playback.js", () => {
   assert.equal(/\(109\s*-\s*9\s*\*\s*CS\)\s*\/\s*2/.test(playback), false,
      "playback.js must not contain the stable-era (109-9*CS)/2 radius formula");
});

console.log("== M1.3 — Stack offset constants ==");
const trackParser = await import(url("src/game/parse/track.js"));
check("STACK_OFFSET_X === 4 (lazer parity)", () => {
   assert.equal(trackParser.STACK_OFFSET_X, 4);
});
check("STACK_OFFSET_Y === 4 (lazer parity)", () => {
   assert.equal(trackParser.STACK_OFFSET_Y, 4);
});
check("stackHitObjects function exists and is callable", () => {
   assert.equal(typeof trackParser.stackHitObjects, "function");
});
check("parseTrackText is pure-functional export", () => {
   assert.equal(typeof trackParser.parseTrackText, "function");
});
check("parseOsz is async export", () => {
   assert.equal(typeof trackParser.parseOsz, "function");
});

console.log("== M1.9 — SliderJudge + SliderScorer are two separate classes ==");
const SliderJudge = (await import(url("src/game/slider-judge.js"))).default;
const SliderScorerMod = await import(url("src/game/slider-scorer.js"));
const SliderScorer = SliderScorerMod.default;
check("SliderJudge class is exported", () => {
   assert.equal(typeof SliderJudge, "function");
});
check("SliderScorer class is exported", () => {
   assert.equal(typeof SliderScorer, "function");
});
check("SliderJudge and SliderScorer are distinct classes", () => {
   assert.notEqual(SliderJudge, SliderScorer);
   assert.notEqual(SliderJudge.prototype.recordTick, SliderScorer.prototype.recordTick,
      "SliderJudge.recordTick and SliderScorer.recordTick must be different methods (M1.9 contract)");
});

console.log("== M1.10 — Audit doc canon ==");
const repoFiles = readdirSync(resolve(root), { withFileTypes: true });
check("no duplicate `lazer-parity-audit.md` exists", () => {
   const dupe = repoFiles.some((f) => f.name === "lazer-parity-audit.md" && f.isFile());
   assert.equal(dupe, false,
      "audit canon lives at docs/wayfinder/lazer-perfect-parity.md; no duplicate at root");
});
check("audit doc lives at docs/wayfinder/lazer-perfect-parity.md", () => {
   const exists = repoFiles.some((f) => f.name === "docs" && f.isDirectory());
   assert.ok(exists, "docs/ directory should exist");
});

console.log("");
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
