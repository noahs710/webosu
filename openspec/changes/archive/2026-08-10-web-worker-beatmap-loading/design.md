## Design

### Architecture

```
┌── Main Thread ────────────────────────────────────────────────────┐
│  app.js: beatmap-launch handler                                     │
│    showLoadingOverlay(title, artist)                                │
│    fetch(osz) → ArrayBuffer                                         │
│    overlay.setText("Unzipping...")                                   │
│                      │ (transfer ArrayBuffer)                       │
│                      ▼                                              │
│  ┌─ beatmap-worker.js ──────────────────────────────────────────┐ │
│  │  import {unzip} from 'fflate'                                  │ │
│  │  import {OsuParser} from './osu-parser.js'                     │ │
│  │  import './curves/*.js'  (all curve classes)                   │ │
│  │                                                                 │ │
│  │  onmessage({blob, bid, version}):                               │ │
│  │    1. unzip(buffer)  ← fflate (spawns sub-workers)              │ │
│  │       postMessage({type:'progress', stage:'parse'})             │ │
│  │    2. Track.decode() for each .osu file                         │ │
│  │    3. preallocateTiming() → store timingIndex on each hit      │ │
│  │    4. calculateCurve() → curve.curve[] precomputed              │ │
│  │       postMessage({type:'progress', stage:'curves'})            │ │
│  │    5. stackHitObjects()                                        │ │
│  │    6. Collect audio + bg Uint8Arrays                            │ │
│  │    7. postMessage({                                            │ │
│  │         type:'result',                                          │ │
│  │         tracks: [...serialized...],                             │ │
│  │         files: { "audio.mp3": Uint8Array, "bg.jpg": Uint8Array }│ │
│  │       }, [audio.buffer, bg.buffer])  ← transferable             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                      │ (structured clone + transfer)                │
│                      ▼                                              │
│  onmessage:                                                         │
│    rehydrateCurves(tracks)  ← attach pointAt/pointAtInto closures   │
│    relinkTiming(tracks)    ← hit.timing = track.timingPoints[idx]   │
│    buildZipShim(files)     ← getChildByName/getBlob/getText         │
│    overlay.setText("Decoding audio...")                             │
│    OsuAudio.decode(audio)  ← async, already off-main-thread         │
│    launchOSU(osu, bid, version) → PIXI                              │
│    overlay.remove()                                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Osu class split

**`osu-parser.js` (worker-safe, no DOM):**
- `Track.decode()` — line parsing
- `preallocateTiming()` — timing point indexing (adds `hit.timingIndex`)
- `calculateCurve()` — curve class instantiation (LinearBezier, CircumscribedCircle)
- `stackHitObjects()` — O(n²) stacking
- `filterTracks()`, `sortTracks()` — pure data

**`osu-runtime.js` (main thread, has DOM):**
- `getCoverSrc()` — `URL.createObjectURL` + `img.src`
- `load_mp3()` — `FileReader` + `new OsuAudio` (needs `AudioContext`)
- `requestStar()` — XHR (optional, could stay on main thread)
- Track selection by BeatmapID/Version
- Zip shim for file access

### Curve serialization + rehydration

Worker sends curve as plain data:
```js
hit.curve = { curve: [{x,y,t}, ...], ncurve: N }
```

Main thread rehydrates by attaching closures:
```js
function rehydrateCurve(hit) {
  const { curve, ncurve } = hit.curve;
  hit.curve.pointAt = (t) => {
    const indexF = t * ncurve;
    const index = Math.floor(indexF);
    if (index >= ncurve) return { x: curve[ncurve].x, y: curve[ncurve].y };
    const poi = curve[index], poi2 = curve[index + 1];
    const lt = indexF - index;
    return { x: poi.x + (poi2.x - poi.x) * lt, y: poi.y + (poi2.y - poi.y) * lt };
  };
  hit.curve.pointAtInto = (t, out) => {
    const indexF = t * ncurve;
    const index = Math.floor(indexF);
    if (index >= ncurve) { out.x = curve[ncurve].x; out.y = curve[ncurve].y; }
    else {
      const poi = curve[index], poi2 = curve[index + 1];
      const lt = indexF - index;
      out.x = poi.x + (poi2.x - poi.x) * lt;
      out.y = poi.y + (poi2.y - poi.y) * lt;
    }
    return out;
  };
}
```

### CircumscribedCircle special case

`CircumscribedCircle` returns a plain object `{curve, pointAt, totalDistance}` (not a class instance). Its `pointAt` closure captures `startAng`, `endAng`, `radius`, `circleCenter` via lexical scope — these DON'T survive structured clone. However, the worker already precomputes `curve` (the point array) via `pointAt(i/step)` at init time. So the main thread can use the same `EqualDistanceMultiCurve.pointAt` indexing approach — it just needs `ncurve = curve.length - 1`.

### `hit.timing` re-linking

Worker stores `hit.timingIndex = currentTimingIndex` instead of `hit.timing = track.timingPoints[i]`. Main thread:
```js
for (const hit of track.hitObjects) {
  if (hit.timingIndex != null) hit.timing = track.timingPoints[hit.timingIndex];
}
```

### Zip shim

Worker sends needed binary files as `Uint8Array`. Main thread builds:
```js
const zip = {
  _files: { "audio.mp3": uint8, "bg.jpg": uint8 },
  getChildByName(name) {
    const lower = name.toLowerCase();
    return this._files[lower] ? {
      name: lower,
      getBlob: (type, cb) => cb(new Blob([this._files[lower]], {type})),
      getText: (cb) => cb(new TextDecoder().decode(this._files[lower])),
    } : null;
  },
  children: Object.keys(this._files).map(n => ({name: n}))
};
```

### Worker lifecycle

- Created once, lazily, on first `launchGame`/`launchReplay` call
- Reused across launches (no re-creation)
- Retry does NOT touch the worker (parsed data is already on the main thread)
- No worker termination needed (dies with page unload)

### What stays on main thread

| Code | Why |
|------|-----|
| `getCoverSrc` | `URL.createObjectURL` + DOM `img.src` |
| `load_mp3` | `FileReader` + `AudioContext` (main-thread only) |
| `requestStar` | XHR (could move, but result is UI-only) |
| PIXI app init | WebGL context |
| Loading overlay | DOM manipulation |
| `OsuAudio.decode` | Already async via `AudioContext.decodeAudioData` |

### Worker-compatibility issues (all resolved)

| Issue | Resolution |
|-------|------------|
| `URL.createObjectURL` in `getCoverSrc` | Keep on main thread |
| `new FileReader` in `load_mp3` | Keep on main thread |
| `new AudioContext` in `OsuAudio` | Keep on main thread |
| `hit.timing` object reference | Store `timingIndex`, re-link on main thread |
| Curve prototype methods stripped by clone | Rehydrate with closures on main thread |
| `import.meta.env.DEV` in worker | Vite `define` handles it (works in workers) |
| `console.*` in worker | Works (surfaces in DevTools with worker origin) |
| `fflate` in worker | Pure JS, worker-safe |
| `TextDecoder` in worker | Available in workers |
| `new Blob([...])` in worker | Available in workers |
| `blob.arrayBuffer()` in worker | Available in workers |