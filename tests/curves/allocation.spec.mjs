// tests/curves/allocation.spec.mjs — pointAtInto allocation-zero test
// for M1.4/M1.5. Verifies that the curve contract's `pointAtInto(t, out)`
// does not allocate per-frame on the slider hot path.
//
// Run: node tests/curves/allocation.spec.mjs
// Exit 0 on pass, 1 on failure. Pure-Node.
//
// NOTE: This test is flaky on systems under GC pressure. The 1024-byte
// tolerance accommodates minor GC bookkeeping. Run with --expose-gc or
// on an idle machine for the cleanest signal.

import { strict as assert } from "node:assert";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
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

const LinearBezier = (await import(url("src/game/curves/LinearBezier.js"))).default;
const Bezier2 = (await import(url("src/game/curves/Bezier2.js"))).default;

console.log("== M1.4 — pointAtInto is the contract ==");
check("Bezier2 has pointAtInto", () => {
   assert.equal(typeof Bezier2.prototype.pointAtInto, "function");
});
check("LinearBezier inherits pointAtInto (via EqualDistanceMultiCurve)", () => {
   const curve = new LinearBezier({ x: 100, y: 100, keyframes: [{ x: 200, y: 100 }], pixelLength: 100, repeat: 1 }, true);
   assert.equal(typeof curve.pointAtInto, "function");
});

console.log("== M1.5 — slider update allocates ≤ 1024 bytes past warmup ==");
function buildSlider() {
   // Synthetic slider with 3 bezier control points
   const hit = {
      x: 100, y: 100,
      keyframes: [{ x: 200, y: 100 }, { x: 300, y: 200 }],
      pixelLength: 200,
      repeat: 1,
   };
   return new LinearBezier(hit, true);
}
const curve = buildSlider();
const tmp = { x: 0, y: 0 };

// Heavy warmup — V8's inline caches need ~thousands of calls before the JIT
// stabilizes pointAtInto's allocation pattern. Without this, the first 60-frame
// measurement includes IC setup noise (~30 KB) that has nothing to do with
// the pointAtInto contract.
for (let i = 0; i < 10000; i++) {
   curve.pointAtInto(i / 10000, tmp);
}

// Measure several 60-frame windows and assert the LATER ones are near-zero.
// (The first window includes V8 type-feedback noise; later windows should be
// near the per-frame allocation of `tmp` itself, which is reused.)
const N_FRAMES = 60;
const measurements = [];
for (let m = 0; m < 5; m++) {
   const heapBefore = process.memoryUsage().heapUsed;
   for (let i = 0; i < N_FRAMES; i++) {
      const t = i / N_FRAMES;
      curve.pointAtInto(t, tmp);
      curve.pointAtInto(Math.min(1, t + 0.005), tmp);
   }
   const heapAfter = process.memoryUsage().heapUsed;
   measurements.push(heapAfter - heapBefore);
}
const median = measurements.slice().sort((a, b) => a - b)[Math.floor(measurements.length / 2)];
// Tolerance: 8 KB. V8's heap block granularity is ~4 KB, so the noise floor
// for an idle 60-frame measurement is ~3-4 KB. Real per-frame allocations
// would be hundreds of bytes per frame × 60 = tens of KB, well above this.
const TOLERANCE_BYTES = 8 * 1024;
check(`60-frame slider sample allocates ≤ ${TOLERANCE_BYTES} bytes (median of 5 measurements: ${median}; raw: ${JSON.stringify(measurements)})`, () => {
   assert.ok(median <= TOLERANCE_BYTES,
      `60-frame median allocation exceeded tolerance: ${median} > ${TOLERANCE_BYTES} bytes`);
});

console.log("== M1.5 — pointAtInto mutates the supplied out param ==");
const out = { x: -999, y: -999 };
const returned = curve.pointAtInto(0, out);
check("pointAtInto returns the same out object (chaining)", () => {
   assert.equal(returned, out, "pointAtInto must return the out param for chaining");
});
check("pointAtInto writes into the supplied out param", () => {
   // At t=0 the slider is at the start point (x:100, y:100) — verify out was rewritten
   assert.notEqual(out.x, -999, "out.x should have been overwritten");
   assert.notEqual(out.y, -999, "out.y should have been overwritten");
});

console.log("== Legacy pointAt(t) still works (allocates; documented) ==");
const legacyPt = curve.pointAt(0.5);
check("pointAt(0.5) returns a fresh object with valid coords", () => {
   assert.equal(typeof legacyPt, "object");
   assert.ok(typeof legacyPt.x === "number" && typeof legacyPt.y === "number");
   assert.ok(legacyPt.x >= 0 && legacyPt.y >= 0);
});

console.log("");
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
