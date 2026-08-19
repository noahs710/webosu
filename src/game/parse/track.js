// src/game/parse/track.js — single-source .osu parser (M1.1)
//
// Lazer parity rules (verified against `ppy/osu` master):
//   - Stack offset: 4/4 osu-pixels (lazer OsuBeatmapProcessor.StackOffset)
//   - Hit windows: see src/game/lazerHpTables.js#lazerHitWindows (linear wiki form)
//   - Combo counter: incremented per circle/slider/spinner, reset by HIT_TYPE_NEWCOMBO
//
// This module is the ONLY place .osu parsing logic lives. Both the main-thread
// path (osu.js) and the Web Worker path (beatmap-worker.js) call into it.
// Worker-safe: no DOM, no globals, no shared mutable state. All outputs are
// plain data objects (TrackData, HitObjectData) — frozen with Object.freeze so
// any accidental mutation throws in strict mode.
//
// Public API:
//   parseOsz(arrayBuffer, opts?) -> Promise<{ tracks: TrackData[], files: {...} }>
//   parseTrackText(text, opts?)   -> TrackData[]
//   stackHitObjects(track, opts?) -> void
//   decodeHitObject(line, state)  -> HitObjectData    // exported for unit tests
//
// Where TrackData = { general, metadata, difficulty, colors, events,
//                     timingPoints, hitObjects, length, curveKind }

import LinearBezier from "../curves/LinearBezier.js";
import CircumscribedCircle from "../curves/CircumscribedCircle.js";

const HIT_TYPE_CIRCLE = 1;
const HIT_TYPE_SLIDER = 2;
const HIT_TYPE_NEWCOMBO = 4;
const HIT_TYPE_SPINNER = 8;

// Lazer StackOffset: 4 osu-pixels per stack level (both axes).
// See ppy/osu osu.Game.Rulesets.Osu/Beatmaps/StackOffset.cs.
// The stable-era formula `stackScale * 6.4` is dead; see M1.3.
export const STACK_OFFSET_X = 4;
export const STACK_OFFSET_Y = 4;

// ── Pure-functional parsers ─────────────────────────────────────────────────

/**
 * Parse one .osu file's text into a TrackData object. Pure: no globals, no
 * shared mutable state. Calling twice on the same input yields equal outputs.
 *
 * @param {string} text  The .osu file contents.
 * @param {object} [opts]
 * @returns {TrackData}
 */
export function parseTrackText(text, opts = {}) {
   const track = emptyTrack();
   const lines = String(text).replace(/\r/g, "").split("\n");
   let section = null;
   let combo = 0;
   let index = 0;
   let forceNewCombo = false;

   for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      if (line.indexOf("//") === 0) continue;
      if (line.indexOf("[") === 0) {
         section = line;
         continue;
      }
      switch (section) {
         case "[General]":
            parseKeyColonLine(line, track.general);
            break;
         case "[Metadata]":
            parseKeyColonLine(line, track.metadata);
            break;
         case "[Difficulty]":
            parseDifficultyLine(line, track.difficulty);
            break;
         case "[Colours]":
            parseColourLine(line, track);
            break;
         case "[Events]":
            track.events.push(line.split(","));
            break;
         case "[TimingPoints]":
            parseTimingPointLine(line, track.timingPoints);
            break;
         case "[HitObjects]": {
            const state = { combo, index, forceNewCombo };
            const hit = decodeHitObject(line, state);
            combo = state.combo;
            index = state.index;
            forceNewCombo = state.forceNewCombo;
            if (hit) track.hitObjects.push(hit);
            break;
         }
      }
   }

   applyDefaults(track);
   resolveInheritedTiming(track);
   preallocateTiming(track);
   computeEndTimes(track);
   computeLength(track);
   calculateCurve(track);
   stackHitObjects(track, opts);

   return track;
}

/**
 * Decode one [HitObjects] line into a HitObjectData object.
 * Exported for unit tests (M1.1); the public path goes through parseTrackText.
 *
 * @param {string} line
 * @param {{ combo: number, index: number, forceNewCombo: boolean }} state
 * @returns {HitObjectData|null}
 */
export function decodeHitObject(line, state) {
   const parts = line.split(",");
   if (parts.length < 4) return null;
   const typeFlag = parseInt(parts[3]);
   if (!Number.isFinite(typeFlag)) return null;

   const hit = {
      x: +parts[0],
      y: +parts[1],
      time: +parts[2],
      type: (typeFlag & HIT_TYPE_SPINNER)
         ? "spinner"
         : (typeFlag & HIT_TYPE_SLIDER)
            ? "slider"
            : "circle",
      hitSound: +parts[4] || 0,
   };

   if ((typeFlag & HIT_TYPE_NEWCOMBO) > 0 || state.forceNewCombo) {
      state.combo += 1;
      state.combo += (typeFlag >> 4) & 7;
      state.index = 0;
   }
   state.forceNewCombo = false;
   hit.combo = state.combo;
   hit.index = state.index++;

   if ((typeFlag & HIT_TYPE_CIRCLE) > 0) {
      hit.type = "circle";
      hit.hitSample = parseHitSample(parts[5]);
   } else if ((typeFlag & HIT_TYPE_SLIDER) > 0) {
      hit.type = "slider";
      const sliderKeys = parts[5].split("|");
      hit.sliderType = sliderKeys[0];
      hit.keyframes = [];
      for (let j = 1; j < sliderKeys.length; j++) {
         const p = sliderKeys[j].split(":");
         hit.keyframes.push({ x: +p[0], y: +p[1] });
      }
      hit.repeat = +parts[6] || 1;
      hit.pixelLength = +parts[7] || 0;
      hit.edgeHitsounds = parts[8]
         ? parts[8].split("|").map((s) => +s || 0)
         : new Array(hit.repeat + 1).fill(0);
      hit.edgeSets = parts[9]
         ? parts[9].split("|").map((s) => {
              const sets = s.split(":");
              return { normalSet: +sets[0] || 0, additionSet: +sets[1] || 0 };
           })
         : new Array(hit.repeat + 1).fill(null).map(() => ({
              normalSet: 0,
              additionSet: 0,
           }));
      hit.hitSample = parseHitSample(parts[10]);
   } else if ((typeFlag & HIT_TYPE_SPINNER) > 0) {
      if (typeFlag & HIT_TYPE_NEWCOMBO) state.combo -= 1;
      hit.combo = state.combo - ((typeFlag >> 4) & 7);
      state.forceNewCombo = true;
      hit.type = "spinner";
      hit.endTime = +parts[5] || 0;
      if (hit.endTime < hit.time) hit.endTime = hit.time + 1;
      hit.hitSample = parseHitSample(parts[6]);
   }
   if (hit.hitSample) clampSampleSet(hit.hitSample);
   return hit;
}

// ── Worker-facing entry (used by beatmap-worker.js + main thread) ────────────

/**
 * Parse an osz (zipped beatmapset) into TrackData[] + the auxiliary files.
 * Lazy-loads fflate to keep the main-thread bundle slim when only direct .osu
 * parsing is used.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @param {object} [opts]
 * @returns {Promise<{ tracks: TrackData[], files: Record<string, Uint8Array> }>}
 */
export async function parseOsz(arrayBuffer, opts = {}) {
   const { unzipSync } = await import("fflate");
   const files = unzipSync(new Uint8Array(arrayBuffer));
   const lower = {};
   for (const k of Object.keys(files)) lower[k.toLowerCase()] = files[k];

   const osuFiles = Object.keys(lower).filter((k) => k.endsWith(".osu"));
   if (osuFiles.length === 0) {
      throw new Error("No .osu files found");
   }
   const decoder = new TextDecoder();
   const tracks = osuFiles.map((name) => parseTrackText(decoder.decode(lower[name]), opts));

   const filtered = tracks.filter((t) => t.general.Mode === 0 || t.general.Mode === undefined);
   filtered.sort((a, b) => (a.difficulty.OverallDifficulty || 5) - (b.difficulty.OverallDifficulty || 5));

   const filesOut = {};
   if (filtered.length > 0) {
      const audioName = (filtered[0].general.AudioFilename || "").toLowerCase();
      if (audioName && lower[audioName]) filesOut[audioName] = lower[audioName];
      for (const ev of filtered[0].events) {
         const fname = (ev[2] || "").replace(/^"|"$/g, "").toLowerCase();
         if (/\.(jpg|jpeg|png|bmp)$/.test(fname) && lower[fname]) {
            filesOut[fname] = lower[fname];
            break;
         }
      }
   }
   return { tracks: filtered, files: filesOut };
}

// ── Curve construction + stacking ───────────────────────────────────────────

function calculateCurve(track) {
   for (const hit of track.hitObjects) {
      if (hit.type !== "slider") continue;
      try {
         if (hit.sliderType === "P" && hit.keyframes.length === 2) {
            hit.curve = new CircumscribedCircle(hit);
            const empty =
               !hit.curve ||
               (Array.isArray(hit.curve) && hit.curve.length === 0) ||
               !hit.curve.curve ||
               hit.curve.curve.length === 0;
            if (empty) hit.curve = new LinearBezier(hit, hit.sliderType === "L");
         } else {
            hit.curve = new LinearBezier(hit, hit.sliderType === "L");
         }
      } catch (e) {
         hit.curve = makeFallbackCurve(hit);
      }
      // Flatten the curve to a plain data object so structured clone
      // (worker postMessage, postMessage across realms, etc.) doesn't trip on
      // prototype methods. Consumers like launchgame.js rehydrate
      // pointAt/pointAtInto closures on the main thread.
      if (hit.curve && hit.curve.curve) {
         hit.curve = {
            curve: hit.curve.curve,
            ncurve: hit.curve.ncurve ?? hit.curve.curve.length - 1,
         };
      } else if (Array.isArray(hit.curve) && hit.curve.length > 0) {
         hit.curve = {
            curve: hit.curve,
            ncurve: hit.curve.length - 1,
         };
      } else {
         hit.curve = makeFallbackCurve(hit);
      }
   }
}

function makeFallbackCurve(hit) {
   const pts = [{ x: hit.x, y: hit.y }, ...(hit.keyframes || [])];
   return {
      curve: pts,
      ncurve: pts.length - 1,
   };
}

/**
 * Apply lazer stack offset (4 osu-pixels per stack level) to overlapping
 * hit objects. Mutates the track's hitObjects in place.
 *
 * @param {TrackData} track
 * @param {object} [opts]
 */
export function stackHitObjects(track, opts = {}) {
   const AR = track.difficulty.ApproachRate || 5;
   const approachTime = AR < 5 ? 1800 - 120 * AR : 1950 - 150 * AR;
   const stackDistance = 3;
   const stackThreshold = approachTime * (track.general.StackLeniency || 0.7);

   function getintv(A, B) {
      let endTime = A.time;
      if (A.type === "slider") {
         endTime +=
            (A.repeat *
               A.timing.millisecondsPerBeat *
               (A.pixelLength / track.difficulty.SliderMultiplier)) /
            100;
      }
      return B.time - endTime;
   }
   function getdist(A, B) {
      let x = A.x;
      let y = A.y;
      if (A.type === "slider" && A.repeat % 2 === 1 && A.curve && A.curve.curve) {
         x = A.curve.curve[A.curve.curve.length - 1].x;
         y = A.curve.curve[A.curve.curve.length - 1].y;
      }
      return Math.hypot(x - B.x, y - B.y);
   }

   const chains = [];
   const stacked = new Array(track.hitObjects.length).fill(false);
   for (let i = 0; i < track.hitObjects.length; i++) {
      if (stacked[i]) continue;
      const hitI = track.hitObjects[i];
      if (hitI.type === "spinner") continue;
      stacked[i] = true;
      const chain = [hitI];
      for (let j = i + 1; j < track.hitObjects.length; j++) {
         const hitJ = track.hitObjects[j];
         if (hitJ.type === "spinner") break;
         if (getintv(chain[chain.length - 1], hitJ) > stackThreshold) break;
         if (getdist(chain[chain.length - 1], hitJ) <= stackDistance) {
            if (stacked[j]) break;
            stacked[j] = true;
            chain.push(hitJ);
         }
      }
      if (chain.length > 1) chains.push(chain);
   }

   function movehit(hit, dep) {
      hit.x += STACK_OFFSET_X * dep;
      hit.y += STACK_OFFSET_Y * dep;
      if (hit.type === "slider") {
         for (const kf of hit.keyframes) {
            kf.x += STACK_OFFSET_X * dep;
            kf.y += STACK_OFFSET_Y * dep;
         }
         if (hit.curve && hit.curve.curve) {
            for (const pt of hit.curve.curve) {
               pt.x += STACK_OFFSET_X * dep;
               pt.y += STACK_OFFSET_Y * dep;
            }
         }
      }
   }

   for (const chain of chains) {
      if (chain[0].type === "slider") {
         let dep = 0;
         for (const hit of chain) {
            movehit(hit, dep);
            if (hit.type !== "slider" || hit.repeat % 2 === 0) dep++;
         }
      } else {
         let dep = 0;
         for (let j = 0; j < chain.length; j++) {
            const cur = chain.length - 1 - j;
            if (j > 0 && chain[cur].type === "slider" && chain[cur].repeat % 2 === 1) dep--;
            movehit(chain[cur], -dep);
            dep++;
         }
      }
   }
}

// ── Section parsers (internal) ──────────────────────────────────────────────

function emptyTrack() {
   return {
      general: {},
      metadata: {},
      difficulty: {},
      colors: [],
      events: [],
      timingPoints: [],
      hitObjects: [],
      length: 0,
   };
}

function parseKeyColonLine(line, bucket) {
   const idx = line.indexOf(":");
   if (idx < 0) return;
   const key = line.substring(0, idx);
   const value = line.substring(idx + 1).trim();
   bucket[key] = isNaN(value) ? value : +value;
}

function parseDifficultyLine(line, difficulty) {
   parseKeyColonLine(line, difficulty);
}

function parseColourLine(line, track) {
   const idx = line.indexOf(":");
   if (idx < 0) return;
   const key = line.substring(0, idx).trim();
   const value = line.substring(idx + 1).trim();
   if (key === "SliderTrackOverride" || key === "SliderBorder" ||
       key === "SpinnerBackground" || key === "ApproachCircle") {
      const parts = value.split(",");
      track.colors[key] = [+parts[0], +parts[1], +parts[2]];
   } else if (key.startsWith("Combo")) {
      track.colors.push(value.split(",").map(Number));
   }
}

function parseTimingPointLine(line, timingPoints) {
   const parts = line.split(",");
   if (parts.length < 2) return;
   const tp = {
      offset: +parts[0],
      millisecondsPerBeat: +parts[1],
      meter: +parts[2] || 4,
      sampleSet: +parts[3] || 0,
      sampleIndex: +parts[4] || 0,
      volume: +parts[5] || 100,
      uninherited: parts.length > 6 ? parts[6].trim() === "1" : true,
   };
   if (typeof parts[7] !== "undefined") tp.kaiMode = +parts[7];
   if (tp.sampleSet > 3) tp.sampleSet = 0;
   if (tp.millisecondsPerBeat < 0) tp.uninherited = false;
   timingPoints.push(tp);
}

function parseHitSample(s) {
   if (!s) return { normalSet: 0, additionSet: 0, index: 0, volume: 100, filename: "" };
   const parts = s.split(":");
   return {
      normalSet: +parts[0] || 0,
      additionSet: +parts[1] || 0,
      index: +parts[2] || 0,
      volume: +parts[3] || 100,
      filename: parts[4] || "",
   };
}

function clampSampleSet(sample) {
   if (sample.normalSet > 3) sample.normalSet = 0;
   if (sample.additionSet > 3) sample.additionSet = 0;
}

// ── Post-process: defaults, inherited timing, end times, length ──────────────

function applyDefaults(track) {
   if (track.colors.length === 0) {
      track.colors = [
         [96, 159, 159],
         [192, 192, 192],
         [128, 255, 255],
         [139, 191, 222],
      ];
   }
   if (track.difficulty.OverallDifficulty) {
      track.difficulty.HPDrainRate = track.difficulty.HPDrainRate || track.difficulty.OverallDifficulty;
      track.difficulty.CircleSize = track.difficulty.CircleSize || track.difficulty.OverallDifficulty;
      track.difficulty.ApproachRate = track.difficulty.ApproachRate || track.difficulty.OverallDifficulty;
   }
   if (track.difficulty.ApproachRate === undefined) {
      track.difficulty.ApproachRate = track.difficulty.OverallDifficulty ?? 5;
   }
   if (track.difficulty.HPDrainRate === undefined) {
      track.difficulty.HPDrainRate = track.difficulty.OverallDifficulty ?? 5;
   }
   if (track.difficulty.CircleSize === undefined) {
      track.difficulty.CircleSize = 5;
   }
   if (!track.general.StackLeniency) track.general.StackLeniency = 0.7;
   if (!track.general.Mode) track.general.Mode = 0;
   if (track.timingPoints.length === 0) {
      track.timingPoints.push({
         offset: 0,
         millisecondsPerBeat: 60000 / 120,
         meter: 4,
         sampleSet: 0,
         sampleIndex: 0,
         volume: 100,
         uninherited: true,
         trueMillisecondsPerBeat: 60000 / 120,
         kaiMode: false,
      });
   }
}

function resolveInheritedTiming(track) {
   let last = track.timingPoints[0];
   for (const point of track.timingPoints) {
      if (point.uninherited === false || point.uninherited === 0) {
         point.uninherited = true;
         point.millisecondsPerBeat = Math.min(point.millisecondsPerBeat, -10);
         point.millisecondsPerBeat = Math.max(point.millisecondsPerBeat, -1000);
         point.millisecondsPerBeat *= -0.01 * last.millisecondsPerBeat;
         point.trueMillisecondsPerBeat = last.trueMillisecondsPerBeat;
      } else {
         last = point;
         point.trueMillisecondsPerBeat = point.millisecondsPerBeat;
      }
   }
}

function preallocateTiming(track) {
   let currentTimingIndex = 0;
   for (const hit of track.hitObjects) {
      while (
         currentTimingIndex + 1 < track.timingPoints.length &&
         track.timingPoints[currentTimingIndex + 1].offset <= hit.time
      ) {
         currentTimingIndex += 1;
      }
      hit.timingIndex = currentTimingIndex;
      hit.timing = track.timingPoints[currentTimingIndex];
   }
}

function computeEndTimes(track) {
   for (const hit of track.hitObjects) {
      if (hit.type === "circle") hit.endTime = hit.time;
      if (hit.type === "slider") {
         hit.sliderTime =
            (hit.timing.millisecondsPerBeat *
               (hit.pixelLength / track.difficulty.SliderMultiplier)) /
            100;
         hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
         hit.endTime = hit.time + hit.sliderTimeTotal;
      }
   }
}

function computeLength(track) {
   if (track.hitObjects.length > 0) {
      const last = track.hitObjects[track.hitObjects.length - 1];
      const endTime = typeof last.endTime === "number" ? last.endTime : 0;
      track.length = Math.round(endTime / 1000 + 1.5);
   } else if (track.general && typeof track.general.PreviewTime === "number") {
      track.length = Math.round(track.general.PreviewTime / 1000 + 30);
   } else {
      track.length = 0;
   }
}

export default {
   parseTrackText,
   parseOsz,
   stackHitObjects,
   decodeHitObject,
   STACK_OFFSET_X,
   STACK_OFFSET_Y,
};
