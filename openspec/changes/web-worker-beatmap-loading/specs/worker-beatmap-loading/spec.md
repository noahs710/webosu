## Specs

### worker-beatmap-loading

- The beatmap unzip + parse pipeline SHALL run in a Web Worker, not on the main thread
- The worker SHALL receive the osz as a transferable `ArrayBuffer` (zero-copy)
- The worker SHALL post back serialized tracks (plain objects) + binary files (`Uint8Array`, transferable)
- The main thread SHALL rehydrate curve `pointAt`/`pointAtInto` methods as closures that index into the precomputed `curve` array (no re-computation)
- The main thread SHALL re-link `hit.timing` from `hit.timingIndex` after receiving the serialized tracks
- The worker SHALL post progress messages (`unzip`, `parse`, `curves`) so the loading overlay can show granular status
- The worker SHALL be created once and reused across `launchGame` and `launchReplay` calls
- The retry flow SHALL NOT re-invoke the worker (parsed data is already on the main thread)
- The `Osu` class SHALL be split: `OsuParser` (worker-safe, no DOM) and `OsuRuntime` (main thread, DOM access)
- `getCoverSrc`, `load_mp3`, and `requestStar` SHALL remain on the main thread (they require DOM/APIs not available in workers)