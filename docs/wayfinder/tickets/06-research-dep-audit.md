# 06 — research: dependency audit

Type: `wayfinder:research`

## Question

Audit every vendored blob and npm dependency for current version, maintenance/security status, and replaceability with native APIs or modern packages. Output a keep / replace / drop table with effort and risk.

**`js/lib/` (hand-vendored):**
- `pixi.min.js` (v6.5.10) -> Pixi 8 (see `04`); could move to npm.
- `require.js` -> ESM + bundler (see `02`).
- `underscore.js` + `underscore.min.js` -> drop for native (map/each/reduce), or lodash-es.
- `localforage.min.js` -> maintained; or native IndexedDB wrapper.
- `inflate.js` -> native `DecompressionStream` (gzip/zlib).
- `zip.js` / `zip-fs.js` / `z-worker.js` -> modern zip (e.g. `fflate`, or native `CompressionStream` where possible) for `.osz` extraction.
- `mp3parse.min.js` -> Web Audio `decodeAudioData` / `AudioContext`.
- `sound.js` -> howler.js or native Web Audio.

**npm:**
- root `package.json`: only `vercel` 35.2.1 (unused? check).
- `server/package.json`: `express` 4 -> express 5 or fastify; `ws` 8 (fine); `bcryptjs` -> `bcrypt`/argon2; `jsonwebtoken` -> `jose` (Web Crypto).

For each, note whether replacement changes load/parse cost on the floor device. Cite primary sources.


## Resolution

Resolved (research). Findings: `research/06-dep-audit.md`.

**Keep/Replace/Drop:** Drop underscore (3 files, ~10 native-swappable call sites), drop `vercel` (unused, verify), drop `inflate.js`+`z-worker.js` (via zip swap), drop `urlArgs` cache-bust. Replace zip.js->fflate, sound.js->howler/native, require.js->ESM (ticket 02), and (only if backend in scope, ticket 08) jsonwebtoken->jose, express 4->5. Keep (verified maintained): localforage, ws, bcryptjs. **Hold/benchmark:** pixi 6 (ticket 01) and mp3parse — its ID3/Xing offset logic is load-bearing for audio sync, so don't replace it blindly with `decodeAudioData` alone. Biggest floor-device wins, in order: disable Pixi interaction, zip->fflate, drop underscore, require->ESM, sound.js->howler.


## Addendum (scope confirmed = full-stack, Fly.io-alone)

Backend swaps now IN scope (verified against current code):
- Express 4 → **Fastify** (modern, fast, single process, Fly.io-friendly). The 22 routes in `server/index.js` port over; `db.js`, `validate.js`, `pp.js` are framework-agnostic.
- **DB: keep `node:sqlite`** — `server/db.js` already uses Node 22's built-in `DatabaseSync` SQLite on the mounted volume. Already modern, already Fly.io-alone. **No external DB service; do not add better-sqlite3.**
- `jsonwebtoken` → **`jose`** (Web Crypto; optional/low-risk, forces a token re-sign = re-login once).
- Keep `ws` (multiplayer/SSE) and `bcryptjs`.
- Frontend drops/replaces unchanged from the audit above (underscore, zip→fflate, sound.js→howler/native, require.js→ESM).
