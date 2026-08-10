// beatmap-worker.js — Web Worker for beatmap unzip + parse
// Moves the synchronous fflate unzip + Track.decode + calculateCurve + stackHitObjects
// off the main thread to eliminate the 100-500ms freeze during beatmap loading.
import { unzipSync } from "fflate";
// Import the existing Track + preallocateTiming + calculateCurve + stackHitObjects from osu.js
// These are worker-safe (no DOM references in the parsing path)

// We need to access the internal Track class from osu.js, but it's not exported.
// Instead, we duplicate the minimal parsing logic here, importing the curve classes directly.
import LinearBezier from "./curves/LinearBezier.js";
import CircumscribedCircle from "./curves/CircumscribedCircle.js";
import Curve from "./curves/Curve.js";
import Bezier2 from "./curves/Bezier2.js";
import EqualDistanceMultiCurve from "./curves/EqualDistanceMultiCurve.js";

const HIT_TYPE_CIRCLE = 1, HIT_TYPE_SLIDER = 2, HIT_TYPE_NEWCOMBO = 4, HIT_TYPE_SPINNER = 8;
const CURVE_POINTS_SEPERATION = 5;

function Track(track) {
   var self = this;
   this.general = {};
   this.metadata = {};
   this.difficulty = {};
   this.colors = [];
   this.events = [];
   this.timingPoints = [];
   this.hitObjects = [];
   this.decode = function() {
      var lines = track.replace(/\r/g, "").split("\n");
      var section = null, combo = 0, index = 0, forceNewCombo = false;
      for (var i = 0; i < lines.length; i++) {
         var line = lines[i].trim();
         if (line === "" || line.indexOf("//") === 0) continue;
         if (line.indexOf("[") === 0) { section = line; continue; }
         var parts, key, value;
         switch (section) {
            case "[General]":
               key = line.substr(0, line.indexOf(":"));
               value = line.substr(line.indexOf(":") + 1).trim();
               self.general[key] = isNaN(value) ? value : +value;
               break;
            case "[Metadata]":
               key = line.substr(0, line.indexOf(":"));
               value = line.substr(line.indexOf(":") + 1).trim();
               self.metadata[key] = value;
               break;
            case "[Difficulty]":
               key = line.substr(0, line.indexOf(":"));
               value = line.substr(line.indexOf(":") + 1).trim();
               self.difficulty[key] = +value;
               break;
            case "[Colours]":
               key = line.substr(0, line.indexOf(":"));
               value = line.substr(line.indexOf(":") + 1).trim();
               if (key.startsWith("Combo")) {
                  parts = value.split(",");
                  self.colors.push([+parts[0], +parts[1], +parts[2]]);
               } else if (key === "SliderTrackOverride") {
                  parts = value.split(",");
                  self.colors.SliderTrackOverride = [+parts[0], +parts[1], +parts[2]];
               } else if (key === "SliderBorder") {
                  parts = value.split(",");
                  self.colors.SliderBorder = [+parts[0], +parts[1], +parts[2]];
               } else if (key === "SpinnerBackground") {
                  parts = value.split(",");
                  self.colors.SpinnerBackground = [+parts[0], +parts[1], +parts[2]];
               } else if (key === "ApproachCircle") {
                  parts = value.split(",");
                  self.colors.ApproachCircle = [+parts[0], +parts[1], +parts[2]];
               }
               break;
            case "[Events]":
               self.events.push(line.split(","));
               break;
            case "[TimingPoints]":
               parts = line.split(",");
               if (parts.length >= 2) {
                  var tp = {
                     offset: +parts[0],
                     millisecondsPerBeat: +parts[1],
                     meter: +parts[2] || 4,
                     sampleSet: +parts[3] || 0,
                     sampleIndex: +parts[4] || 0,
                     volume: +parts[5] || 100,
                     uninherited: parts.length > 6 ? parts[6].trim() === "1" : true,
                  };
                  tp.kaiMode = tp.meter % 2 !== 0;
                  self.timingPoints.push(tp);
               }
               break;
            case "[HitObjects]":
               parts = line.split(",");
               if (parts.length < 4) continue;
               var typeFlag = parseInt(parts[3]);
               var hit = {
                  x: +parts[0], y: +parts[1], time: +parts[2],
                  type: (typeFlag & HIT_TYPE_SPINNER) ? "spinner" :
                        (typeFlag & HIT_TYPE_SLIDER) ? "slider" : "circle",
                  hitSound: +parts[4] || 0,
                  combo: combo, index: index,
               };
                if (typeFlag & HIT_TYPE_NEWCOMBO) { combo = 0; forceNewCombo = true; combo += (typeFlag >> 4) & 7; }
               if (hit.type === "slider") {
                  hit.sliderType = parts[5];
                  hit.keyframes = [];
                  var kp = parts[6].split("|");
                  for (var j = 0; j < kp.length; j++) {
                     var c = kp[j].split(":");
                     hit.keyframes.push({ x: +c[0], y: +c[1] });
                  }
                  hit.repeat = +parts[7] || 1;
                  hit.pixelLength = +parts[8] || 0;
                  hit.edgeHitsounds = parts[9] ? parts[9].split("|").map(function(s) { return +s || 0; }) : [];
                  hit.edgeSets = parts[10] ? parts[10].split("|").map(function(s) {
                     var sets = s.split(":");
                     return { normalSet: +sets[0] || 0, additionSet: +sets[1] || 0 };
                  }) : [];
                  hit.hitSample = parseSample(parts[11]);
               } else if (hit.type === "spinner") {
                  hit.endTime = +parts[5] || 0;
                  hit.hitSample = parseSample(parts[6]);
               } else {
                  hit.hitSample = parseSample(parts[5]);
               }
               combo++;
               index++;
               self.hitObjects.push(hit);
               if (forceNewCombo) forceNewCombo = false;
               break;
         }
      }
       if (self.difficulty.ApproachRate === undefined) {
          self.difficulty.ApproachRate = self.difficulty.OverallDifficulty !== undefined ? self.difficulty.OverallDifficulty : 5;
       }
       // default HPDrainRate and CircleSize from OverallDifficulty (osu.js does this)
       if (self.difficulty.HPDrainRate === undefined && self.difficulty.OverallDifficulty !== undefined)
          self.difficulty.HPDrainRate = self.difficulty.OverallDifficulty;
       if (self.difficulty.CircleSize === undefined) self.difficulty.CircleSize = 5;
       if (self.difficulty.HPDrainRate === undefined) self.difficulty.HPDrainRate = 5;
       // default combo colors if [Colours] section is empty
       if (self.colors.length === 0) {
          self.colors = [[255,128,64], [128,255,128], [64,192,255], [255,128,192], [192,128,255], [255,200,64], [128,255,192], [255,192,128]];
       }
       if (!self.general.StackLeniency) self.general.StackLeniency = 0.7;
       if (!self.general.Mode) self.general.Mode = 0;
       // guard: empty beatmaps
       if (self.hitObjects.length === 0) { self.length = 0; return; }
       if (self.timingPoints.length === 0) {
          // create a default timing point to avoid crashes
          self.timingPoints.push({ offset: 0, millisecondsPerBeat: 60000/120, meter: 4, sampleSet: 0, sampleIndex: 0, volume: 100, uninherited: true, trueMillisecondsPerBeat: 60000/120, kaiMode: false });
       }
       // convert inherited timing points (same as original osu.js:240-259)
       var last = self.timingPoints[0];
       for (var i = 0; i < self.timingPoints.length; i++) {
          var point = self.timingPoints[i];
          if (point.uninherited === false || point.uninherited === 0) {
             point.uninherited = 1;
             point.millisecondsPerBeat = Math.min(point.millisecondsPerBeat, -10);
             point.millisecondsPerBeat = Math.max(point.millisecondsPerBeat, -1000);
             point.millisecondsPerBeat *= -0.01 * last.millisecondsPerBeat;
             point.trueMillisecondsPerBeat = last.trueMillisecondsPerBeat;
          } else {
             last = point;
             point.trueMillisecondsPerBeat = point.millisecondsPerBeat;
          }
       }
       preallocateTiming(self);
       // calculate end time of each hit object (same as original osu.js:262-274)
       for (let i = 0; i < self.hitObjects.length; i++) {
          let hit = self.hitObjects[i];
          if (hit.type == "circle") hit.endTime = hit.time;
          if (hit.type == "slider") {
             hit.sliderTime = (hit.timing.millisecondsPerBeat * (hit.pixelLength / self.difficulty.SliderMultiplier)) / 100;
             hit.sliderTimeTotal = hit.sliderTime * hit.repeat;
             hit.endTime = hit.time + hit.sliderTimeTotal;
          }
       }
       self.length = Math.round(self.hitObjects[self.hitObjects.length - 1].endTime / 1000 + 1.5);
       calculateCurve(self);
       stackHitObjects(self);
   };
}

function parseSample(s) {
   if (!s) return { normalSet: 0, additionSet: 0, index: 0, volume: 100, filename: "" };
   var parts = s.split(":");
   return { normalSet: +parts[0] || 0, additionSet: +parts[1] || 0, index: +parts[2] || 0, volume: +parts[3] || 100, filename: parts[4] || "" };
}

function preallocateTiming(track) {
   let currentTimingIndex = 0;
   for (let i = 0; i < track.hitObjects.length; ++i) {
      while (currentTimingIndex + 1 < track.timingPoints.length &&
             track.timingPoints[currentTimingIndex + 1].offset <= track.hitObjects[i].time) {
         currentTimingIndex += 1;
      }
       track.hitObjects[i].timingIndex = currentTimingIndex;
       track.hitObjects[i].timing = track.timingPoints[currentTimingIndex];
   }
}

function calculateCurve(track) {
   for (let i = 0; i < track.hitObjects.length; ++i) {
      let hit = track.hitObjects[i];
      if (hit.type == "slider") {
         try {
            if (hit.sliderType === "P" && hit.keyframes.length == 2) {
               hit.curve = new CircumscribedCircle(hit);
               if (!hit.curve || (Array.isArray(hit.curve) && hit.curve.length == 0) || !hit.curve.curve || hit.curve.curve.length == 0)
                  hit.curve = new LinearBezier(hit, hit.sliderType === "L");
            } else {
               hit.curve = new LinearBezier(hit, hit.sliderType === "L");
            }
            // flatten to plain data for serialization
            if (hit.curve && hit.curve.curve && Array.isArray(hit.curve.curve)) {
               hit.curve = { curve: hit.curve.curve, ncurve: hit.curve.curve.length - 1 };
            } else if (hit.curve && Array.isArray(hit.curve) && hit.curve.length > 0) {
               hit.curve = { curve: hit.curve, ncurve: hit.curve.length - 1 };
            } else if (hit.curve && hit.curve.curve) {
               // CircumscribedCircle plain object: {curve, pointAt, totalDistance}
               hit.curve = { curve: hit.curve.curve, ncurve: hit.curve.curve.length - 1 };
            }
         } catch (e) {
            // fallback: create a simple 2-point linear curve
            hit.curve = { curve: [{x: hit.x, y: hit.y}, ...(hit.keyframes||[])], ncurve: (hit.keyframes||[]).length };
         }
      }
   }
}

function stackHitObjects(track) {
   const AR = track.difficulty.ApproachRate;
   const approachTime = AR < 5 ? 1800 - 120 * AR : 1950 - 150 * AR;
   const stackDistance = 3;
   const stackThreshold = approachTime * track.general.StackLeniency;

   function getintv(A, B) {
      let endTime = A.time;
      if (A.type == "slider") {
         endTime += (A.repeat * A.timing.millisecondsPerBeat * (A.pixelLength / track.difficulty.SliderMultiplier)) / 100;
      }
      return B.time - endTime;
   }
   function getdist(A, B) {
      let x = A.x, y = A.y;
      if (A.type == "slider" && A.repeat % 2 == 1 && A.curve && A.curve.curve) {
         x = A.curve.curve[A.curve.curve.length - 1].x;
         y = A.curve.curve[A.curve.curve.length - 1].y;
      }
      return Math.hypot(x - B.x, y - B.y);
   }

   // chain-based stacking (matches original osu.js:501-588)
   let chains = [];
   let stacked = new Array(track.hitObjects.length).fill(false);
   for (let i = 0; i < track.hitObjects.length; ++i) {
      if (stacked[i]) continue;
      let hitI = track.hitObjects[i];
      if (hitI.type == "spinner") continue;
      stacked[i] = true;
      let newchain = [hitI];
      for (let j = i + 1; j < track.hitObjects.length; ++j) {
         let hitJ = track.hitObjects[j];
         if (hitJ.type == "spinner") break;
         if (getintv(newchain[newchain.length - 1], hitJ) > stackThreshold) break;
         if (getdist(newchain[newchain.length - 1], hitJ) <= stackDistance) {
            if (stacked[j]) break;
            stacked[j] = true;
            newchain.push(hitJ);
         }
      }
      if (newchain.length > 1) chains.push(newchain);
   }
   const stackScale = (1.0 - (0.7 * (track.difficulty.CircleSize - 5)) / 5) / 2;
   const scaleX = stackScale * 6.4;
   const scaleY = stackScale * 6.4;
   function movehit(hit, dep) {
      hit.x += scaleX * dep;
      hit.y += scaleY * dep;
      if (hit.type == "slider") {
         for (let j = 0; j < hit.keyframes.length; ++j) {
            hit.keyframes[j].x += scaleX * dep;
            hit.keyframes[j].y += scaleY * dep;
         }
         for (let j = 0; j < hit.curve.curve.length; ++j) {
            hit.curve.curve[j].x += scaleX * dep;
            hit.curve.curve[j].y += scaleY * dep;
         }
      }
   }
   for (let i = 0; i < chains.length; ++i) {
      if (chains[i][0].type == "slider") {
         for (let j = 0, dep = 0; j < chains[i].length; ++j) {
            movehit(chains[i][j], dep);
            if (chains[i][j].type != "slider" || chains[i][j].repeat % 2 == 0) dep++;
         }
      } else {
         for (let j = 0, dep = 0; j < chains[i].length; ++j) {
            let cur = chains[i].length - 1 - j;
            if (j > 0 && chains[i][cur].type == "slider" && chains[i][cur].repeat % 2 == 1) dep--;
            movehit(chains[i][cur], -dep);
            dep++;
         }
      }
   }
}

self.onmessage = async function (e) {
   const { type, buffer } = e.data;
   if (type !== "parse") return;
   try {
      self.postMessage({ type: "progress", stage: "unzip" });
      const files = unzipSync(new Uint8Array(buffer));
      const lowerFiles = {};
      for (const key in files) lowerFiles[key.toLowerCase()] = files[key];

      const osuFiles = Object.keys(lowerFiles).filter(k => k.endsWith(".osu"));
      if (osuFiles.length === 0) { self.postMessage({ type: "error", message: "No .osu files found" }); return; }

      self.postMessage({ type: "progress", stage: "parse" });
      const tracks = [];
      for (const name of osuFiles) {
         const text = new TextDecoder().decode(lowerFiles[name]);
         const track = new Track(text);
         track.decode();
         tracks.push({
            general: track.general, metadata: track.metadata, difficulty: track.difficulty,
            colors: track.colors, events: track.events, timingPoints: track.timingPoints,
            hitObjects: track.hitObjects, length: track.length,
         });
      }

      const filtered = tracks.filter(t => t.general.Mode == 0);
      filtered.sort((a, b) => a.difficulty.OverallDifficulty - b.difficulty.OverallDifficulty);

      // find audio + bg files
      const files_out = {};
      if (filtered.length > 0) {
         const audioName = (filtered[0].general.AudioFilename || "").toLowerCase();
         if (audioName && lowerFiles[audioName]) files_out[audioName] = lowerFiles[audioName];
         for (const ev of filtered[0].events) {
            const fname = (ev[2] || "").replace(/^"|"$/g, "").toLowerCase();
            if (fname.endsWith(".jpg") || fname.endsWith(".jpeg") || fname.endsWith(".png") || fname.endsWith(".bmp")) {
               if (lowerFiles[fname]) { files_out[fname] = lowerFiles[fname]; break; }
            }
         }
      }

      const transfer = Object.values(files_out).map(u => u.buffer);
      self.postMessage({ type: "result", tracks: filtered, files: files_out }, transfer);
   } catch (err) {
      self.postMessage({ type: "error", message: err.message || String(err) });
   }
};