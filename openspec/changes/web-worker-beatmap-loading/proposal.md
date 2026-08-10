## Why

Beatmap loading freezes the main thread for 100-500ms. The chain is: `fflate.unzip` (partially sync for small .osu files) → `Track.decode()` (synchronous line parsing) → `calculateCurve` (curve subdivision, 40-250ms) → `stackHitObjects` (O(n²), 20-120ms). The loading overlay we added masks the freeze but doesn't prevent it. Moving unzip + parse to a Web Worker eliminates the main-thread hitch entirely, making beatmap loading truly smooth.

## What Changes

- **New `beatmap-worker.js`** — a Web Worker that imports `fflate` + `osu.js` (parse only) + all curve classes. Receives the osz `ArrayBuffer` (transferable, zero-copy), unzips + parses + calculates curves + stacks, and posts back serialized tracks + binary files (audio, bg image).
- **Split `Osu` class** — `OsuParser` (worker: decode + preallocateTiming + calculateCurve + stackHitObjects) and `OsuRuntime` (main thread: getCoverSrc + load_mp3 + requestStar + track filtering). The worker returns plain data; the main thread rehydrates.
- **Curve rehydration** — `pointAt`/`pointAtInto` are called every frame for active sliders. Structured clone strips prototype methods, so the main thread reattaches closures that index into the precomputed `curve` array. Zero re-computation.
- **`hit.timing` re-linking** — structured clone breaks shared references. Worker stores `hit.timingIndex` (number); main thread re-links `hit.timing = track.timingPoints[hit.timingIndex]`.
- **Minimal zip shim on main thread** — worker sends audio + bg image as `Uint8Array` (transferable); main thread wraps in a lightweight `getChildByName`/`getBlob`/`getText` shim for `getCoverSrc` and `load_mp3`.
- **Progress messages** — worker posts `{type:'progress', stage:'unzip'|'parse'|'curves'}` so the loading overlay can show granular status.
- **Reused across launches** — single worker instance handles both `launchGame` and `launchReplay`. Retry does NOT touch the worker (parsed data is already on the main thread).

## Capabilities

### New Capabilities
- `worker-beatmap-loading`: Web Worker-based beatmap unzip + parse pipeline

### Modified Capabilities
- `build-tooling`: Vite worker bundling (no config change needed — `new Worker(new URL(...))` is native)

## Impact

- `src/game/beatmap-worker.js` — new file (~60 LOC, imports fflate + osu.js + curves)
- `src/game/osu.js` — split into parser (worker-safe) and runtime (main thread); add `timingIndex` to hits; flatten curve objects for serialization (~50 edits)
- `src/game/launchgame.js` — replace `importBlob` + `osu.load()` with `worker.postMessage` + `onmessage` handler (~50 LOC)
- `src/vue/app.js` — update loading overlay text based on worker progress messages (~10 LOC)
- Main-thread freeze: 100-500ms → 0ms (all computation off-main-thread)