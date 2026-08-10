## Tasks

- [x] Split `osu.js` into `osu-parser.js` (worker-safe: decode, preallocateTiming, calculateCurve, stackHitObjects, filterTracks, sortTracks) and `osu-runtime.js` (main thread: getCoverSrc, load_mp3, requestStar, track selection)
- [x] Add `hit.timingIndex` storage in `preallocateTiming` (replaces `hit.timing = track.timingPoints[i]`)
- [x] Create `src/game/beatmap-worker.js` — imports fflate + osu-parser + curves; receives ArrayBuffer, posts serialized tracks + files
- [x] Add curve rehydration function on main thread — attaches `pointAt`/`pointAtInto` closures to the precomputed `curve` array
- [x] Add `hit.timing` re-linking on main thread — `hit.timing = track.timingPoints[hit.timingIndex]`
- [x] Build minimal zip shim on main thread — `getChildByName`/`getBlob`/`getText` wrapping the transferred `Uint8Array` files
- [x] Update `launchgame.js` — replace `importBlob` + `osu.load()` with `worker.postMessage` + `onmessage` handler
- [x] Update `app.js` — wire worker progress messages to loading overlay text
- [x] Verify worker is created once and reused (not re-created per launch)
- [x] Verify retry does NOT re-invoke the worker
- [x] Verify: `npm run build` passes (Vite bundles worker correctly)
- [x] Verify: `npm run test:game` passes (1301 hits loaded, no pageerrors)
- [x] Verify: `npm run test:crash` passes (quit/retry/fail all work)
- [x] Verify: loading overlay shows granular progress ("Unzipping..." → "Parsing..." → "Decoding audio...")