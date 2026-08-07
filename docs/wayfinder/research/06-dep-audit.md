# Research 06 — Dependency audit

Findings are codebase-grounded (actual usage verified by grep). "Current" versions/maintenance status are from the libraries' own latest releases as of the audit.

## Frontend — `js/lib/` (hand-vendored)

| Blob | Current upstream | Status | Used for (evidence) | Replace with | Effort | Risk |
|---|---|---|---|---|---|---|
| `pixi.min.js` 6.5.10 | Pixi 8.x | v6 = legacy/maintenance; v8 current | entire game renderer | npm `pixi.js`@8 (see ticket 04) | High | High (SliderMesh) |
| `require.js` | requirejs 2.3.x | alive but AMD is legacy | AMD module loading | ESM + Vite/esbuild (ticket 02) | Med | Low |
| `underscore.js` + `.min.js` + `.min.map` | underscore 1.13 | maintenance-only; lodash-era is over | only `_.each`, `_.filter`, `_.find`, `_.extend`, `_.bind` (~10 call sites in `osu.js`) | **drop** — native `for…of`/`.forEach`/`Object.assign`/`.bind`/`Array.find` | Low | Low |
| `localforage.min.js` | localforage 1.10 | maintained | favorites/history/skin storage (`localforage.getItem`) | keep, or wrap IndexedDB directly if cutting deps | Low (keep) / Med (DIY) | Low |
| `inflate.js` | (pako-derived) | n/a — internal to zip.js | not imported anywhere outside `js/lib/`; consumed by zip.js worker | removed by replacing zip.js | — | — |
| `zip.js` / `zip-fs.js` / `z-worker.js` | zip.js 2.x | slow-moving | `.osz` extraction (`zip.fs.FS`, `importBlob`) in `launchgame.js` | **`fflate`** (modern, ~8KB, no separate worker file) | Med | Med (must verify .osz unzip parity) |
| `mp3parse.min.js` | mp3-parser | unmaintained for years | **not** decoding — `osu-audio.js` reads ID3v2/Xing VBR tags to compute the audio **start offset** for sync | keep, or swap for maintained `music-metadata-browser`; **Web Audio `decodeAudioData` alone loses the offset logic** | Med | Med (offset-sync regression) |
| `sound.js` | (custom micro-lib, ~21KB) | unmaintained; ships an obsolete `AudioContextMonkeyPatch` (webkitAudioContext/createGainNode shims for browsers ≥8 years old) | hitsound playback (`sounds.load`, `sounds.whenLoaded`, `makeSound`) | native Web Audio, or `howler.js` (well-maintained, ~7KB gzip) | Med | Low–Med |

## npm — root `package.json`

| Dep | Note |
|---|---|
| `vercel` 35.2.1 | Only dep; appears unused by the app/server (deploy is Fly.io/Docker). **Verify and drop.** The only build it implies is Vercel's; confirm nothing references it. |

## npm — `server/package.json`

| Dep | Current | Status | Replace with | Effort | Risk |
|---|---|---|---|---|---|
| `express` ^4.19.2 | express 5.x | express 4 still maintained; v5 stable | express 5 (or `fastify`) | Med | Low (mostly drop-in) |
| `ws` ^8.18.0 | ws 8.x | maintained | keep | — | Low |
| `bcryptjs` ^2.4.3 | bcryptjs 3.x / `bcrypt` | maintained (pure JS) | keep, or native `bcrypt` if not Windows-deployed | Low | Low |
| `jsonwebtoken` ^9.0.2 | jwt 9.x | maintained; but Web Crypto is now standard | **`jose`** (Web Crypto-based, maintained, no nodecrypto quirks) | Med | Med (token re-signing = forced re-login) |

## Net effect on the critical path

Biggest wins for the floor device, in priority order:
1. **Pixi** — disable interaction (free), then decide 6-vs-8 by benchmark (ticket 01). Largest CPU savings.
2. **zip → fflate** + drop `inflate.js`/`z-worker.js` — removes ~3 lib files, smaller fetch/parse on first play.
3. **drop underscore** — ~3 vendored files deleted; trivial native swaps.
4. **require.js → ESM bundler** (ticket 02) — enables tree-shaking the above + proper hashing/caching instead of `urlArgs` cache-bust.
5. **sound.js → howler/native** — drops the dead monkey-patch; smaller, maintained.

Hold: `mp3parse` — the offset logic is load-bearing for audio sync; don't replace blindly. Hold: `localforage` is fine to keep.

## Keep / Replace / Drop summary

**Drop:** underscore (×3 files), `vercel` (root), inflate.js (via zip swap), `urlArgs` cache-bust.
**Replace:** zip.js→fflate, sound.js→howler/native, require.js→ESM (ticket 02), jsonwebtoken→jose (if backend in scope, ticket 08), express 4→5 (if backend in scope).
**Keep (verified maintained):** localforage, ws, bcryptjs.
**Keep but benchmark before touching:** pixi 6 (ticket 01), mp3parse (offset logic).
