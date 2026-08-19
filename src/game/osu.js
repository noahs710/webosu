// src/game/osu.js — Main-thread beatmap loader (M1 refactor).
//
// Public API (unchanged for compat): `new Osu(zip)`, `osu.load()`,
// `osu.ondecoded`, `osu.onready`, `osu.tracks`, `osu.getCoverSrc`,
// `osu.requestStar`, `osu.filterTracks`, `osu.sortTracks`, `osu.load_mp3`.
//
// The .osu parsing logic itself lives in src/game/parse/track.js (M1.1).
// This file is now only the legacy/preview entry point — the production
// launch path uses parseOsz via the Web Worker (beatmap-worker.js).
//
// Exposed on window.Osu for legacy `Osu &&` readiness checks (see app.js).
//
// Stack offset: 4/4 osu-pixels (lazer parity, M1.3). Applied inside
// parseTrackText; this file no longer carries stack math.

import OsuAudio from "./osu-audio.js";
import { parseTrackText } from "./parse/track.js";

function Osu(zip) {
   var self = this;
   this.zip = zip;
   this.song = null;
   this.ondecoded = null;
   this.onready = null;
   this.onerror = null;
   this.tracks = [];

   var count = 0;
   this.track_decoded = function () {
      count++;
      if (count == self.raw_tracks.length) {
         if (self.ondecoded !== null) {
            self.ondecoded(this);
         }
      }
   };

   this.load = function load() {
      self.raw_tracks = this.zip.children.filter(function (c) {
         return (
            c.name.length >= 4 &&
            c.name.indexOf(".osu") === c.name.length - 4
         );
      });

      if (self.raw_tracks.length === 0) {
         if (self.onerror) self.onerror("No .osu files found!");
      } else {
         self.raw_tracks.forEach(function (t) {
            t.getText(function (text) {
               var track = parseTrackText(text);
               // Mirror the legacy "track decoded" callback so callers relying
               // on the per-track callback still fire.
               self.tracks.push(track);
               self.track_decoded();
            });
         });
      }
   };

   this.getCoverSrc = function (img) {
      let fileentry = null;
      try {
         var file = this.tracks[0].events[0][2];
         if (this.tracks[0].events[0][0] === "Video") {
            file = this.tracks[0].events[1][2];
         }
         file = file.substr(1, file.length - 2);
         fileentry = this.zip.getChildByName(file);
      } catch (error) {
         console.error(error);
         fileentry = null;
      }
      if (fileentry) {
         fileentry.getBlob("image/jpeg", function (blob) {
            img.src = URL.createObjectURL(blob);
         });
      } else {
         img.src = "img/defaultbg.jpg";
      }
   };

   this.requestStar = function () {
      let xhr = new XMLHttpRequest();
      xhr.open(
         "GET",
         "https://api.sayobot.cn/beatmapinfo?1=" +
            this.tracks[0].metadata.BeatmapSetID
      );
      xhr.responseType = "text";
      let self = this;
      xhr.onload = function () {
         let info = JSON.parse(xhr.response);
         if (info.status == 0) {
            for (let i = 0; i < info.data.length; ++i) {
               for (let j = 0; j < self.tracks.length; ++j) {
                  if (
                     self.tracks[j].metadata.BeatmapID == info.data[i].bid
                  ) {
                     self.tracks[j].difficulty.star = info.data[i].star;
                     self.tracks[j].length = info.data[i].length;
                  }
               }
            }
         }
      };
      xhr.send();
   };

   this.filterTracks = function () {
      self.tracks = self.tracks.filter(function (t) {
         return t.general.Mode == 0;
      });
   };
   this.sortTracks = function () {
      self.tracks.sort(function (a, b) {
         return (
            a.difficulty.OverallDifficulty - b.difficulty.OverallDifficulty
         );
      });
   };

   this.load_mp3 = function load_mp3(track) {
      track = track || self.tracks[0];
      var mp3_raw = self.zip.children.find(function (c) {
         return (
            c.name.toLowerCase() ===
            track.general.AudioFilename.toLowerCase()
         );
      });
      mp3_raw.getBlob("audio/mpeg", function (blob) {
         var reader = new FileReader();
         reader.onload = function (e) {
            var buffer = e.target.result;
            self.audio = new OsuAudio(
               mp3_raw.name.toLowerCase(),
               buffer,
               function () {
                  if (self.onready) {
                     self.onready();
                  }
               }
            );
         };
         reader.readAsArrayBuffer(blob);
      });
   };
}

export default Osu;
