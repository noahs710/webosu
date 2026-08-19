// tests/parser/golden-map.spec.mjs — Parser golden-map equivalence tests
// for M1.1, M1.2, M1.7. Verifies that parseTrackText is pure-functional
// (calling twice yields identical output) and that the parsed shape matches
// the worker's expected output for the bundled visualbench fixture.
//
// Run: node tests/parser/golden-map.spec.mjs
// Exit 0 on pass, 1 on failure. Pure-Node.

import { strict as assert, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
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

const { parseTrackText, parseOsz } = await import(url("src/game/parse/track.js"));
const fixturePath = resolve(root, "public/bench-bundle/visualbench.osu");
const text = readFileSync(fixturePath, "utf8");

console.log("== M1.1 — single-source parser ==");
check("parseTrackText is the canonical entry", () => {
   assert.equal(typeof parseTrackText, "function");
});
check("parseOsz is the worker-facing entry (returns Promise)", () => {
   assert.equal(typeof parseOsz, "function");
});

console.log("== M1.2 — pure-functional parser (no globals, no shared state) ==");
const track1 = parseTrackText(text);
const track2 = parseTrackText(text);
check("two calls on identical text yield deeply-equal output", () => {
   deepStrictEqual(track1, track2);
});
check("hits parsed identically across calls", () => {
   assert.equal(track1.hitObjects.length, track2.hitObjects.length);
   for (let i = 0; i < track1.hitObjects.length; i++) {
      const a = JSON.stringify(track1.hitObjects[i]);
      const b = JSON.stringify(track2.hitObjects[i]);
      assert.equal(a, b, `hit ${i} differs across calls`);
   }
});

console.log("== Shape: parsed TrackData has all expected fields ==");
check("TrackData fields present", () => {
   for (const f of ["general", "metadata", "difficulty", "colors", "events", "timingPoints", "hitObjects", "length"]) {
      assert.ok(f in track1, `missing field: ${f}`);
   }
});
check("general has AudioFilename, Mode, StackLeniency", () => {
   assert.equal(track1.general.AudioFilename, "audio.mp3");
   assert.equal(track1.general.Mode, 0);
   assert.equal(track1.general.StackLeniency, 0.7);
});
check("metadata has Title, Version, BeatmapID", () => {
   assert.equal(track1.metadata.Title, "VisualBench");
   assert.equal(track1.metadata.Version, "Insane");
   assert.equal(track1.metadata.BeatmapID, 99999);
});
check("difficulty has ApproachRate, HPDrainRate, CircleSize defaults", () => {
   assert.equal(track1.difficulty.ApproachRate, 5);
   assert.equal(track1.difficulty.HPDrainRate, 5);
   assert.equal(track1.difficulty.CircleSize, 5);
});
check("hitObjects array length matches fixture", () => {
   assert.equal(track1.hitObjects.length, 4);
});
check("all hits are circles in this fixture", () => {
   assert.ok(track1.hitObjects.every((h) => h.type === "circle"));
});
check("timingPoints populated", () => {
   assert.ok(track1.timingPoints.length > 0);
   assert.equal(track1.timingPoints[0].millisecondsPerBeat, 500);
});
check("length computed from last hit", () => {
   // 4 hits, last at time=1500ms → length ≈ round(1500/1000 + 1.5) = 3
   assert.equal(track1.length, 3);
});

console.log("== Stack offset (M1.3) — overlapping hits at 4-px offset ==");
// Construct a minimal fixture with two overlapping circles to verify stacking.
const overlapText = `osu file format v14
[General]
AudioFilename: a.mp3
Mode: 0
[Metadata]
Title:StackTest
Version:Insane
[Difficulty]
CircleSize: 5
OverallDifficulty: 5
ApproachRate: 5
HPDrainRate: 5
[TimingPoints]
0,500,4,1,0,100,1
[HitObjects]
256,192,0,1,0,0:0:0:0:
256,192,0,1,0,0:0:0:0:
`;
const stacked = parseTrackText(overlapText);
check("two overlapping hits stacked at 4-px offset", () => {
   assert.equal(stacked.hitObjects.length, 2);
   const a = stacked.hitObjects[0];
   const b = stacked.hitObjects[1];
   // Second hit is stacked below-right of the first by exactly 4 px each axis.
   assert.equal(b.x - a.x, 4, `b.x - a.x = ${b.x - a.x}, expected 4`);
   assert.equal(b.y - a.y, 4, `b.y - a.y = ${b.y - a.y}, expected 4`);
});

console.log("== parseOsz round-trip (worker-facing entry) ==");
const { readFileSync: rfs } = await import("node:fs");
const oszPath = resolve(root, "public/bench-bundle/visualbench.osz");
const oszBuf = rfs(oszPath);
const oszResult = await parseOsz(oszBuf.buffer.slice(oszBuf.byteOffset, oszBuf.byteOffset + oszBuf.byteLength));
check("parseOsz returns tracks array", () => {
   assert.ok(Array.isArray(oszResult.tracks));
   assert.ok(oszResult.tracks.length >= 1, "should find at least one .osu file in the osz");
});
check("parseOsz result has files dict for audio/bg extraction", () => {
   assert.equal(typeof oszResult.files, "object");
   // visualbench.osz ships audio.mp3 + bg.jpg
   assert.ok("audio.mp3" in oszResult.files, "audio.mp3 should be in extracted files");
});
check("parseOsz tracks are sorted by OD ascending (worker convention)", () => {
   for (let i = 1; i < oszResult.tracks.length; i++) {
      const a = oszResult.tracks[i - 1].difficulty.OverallDifficulty || 5;
      const b = oszResult.tracks[i].difficulty.OverallDifficulty || 5;
      assert.ok(a <= b, `tracks must be sorted by OD; saw ${a} before ${b}`);
   }
});

console.log("");
console.log(`passed: ${passed}`);
console.log(`failed: ${failed}`);
process.exit(failed > 0 ? 1 : 0);
