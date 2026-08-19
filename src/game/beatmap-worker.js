// src/game/beatmap-worker.js — Web Worker boundary (M1.7).
//
// All .osu parsing + stack-offset math + curve construction lives in
// src/game/parse/track.js. This file is a thin boundary that calls
// parseOsz and posts the result back to the main thread.
import { parseOsz } from "./parse/track.js";

self.onmessage = async function (e) {
   const { type, buffer } = e.data;
   if (type !== "parse") return;
   try {
      self.postMessage({ type: "progress", stage: "unzip" });
      const result = await parseOsz(buffer);
      self.postMessage({ type: "progress", stage: "parse" });

      const transfer = Object.values(result.files).map((u) => u.buffer);
      self.postMessage(
         { type: "result", tracks: result.tracks, files: result.files },
         transfer
      );
   } catch (err) {
      self.postMessage({ type: "error", message: err.message || String(err) });
   }
};
