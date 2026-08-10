## Why

The default reowoTuna skin (`skins/default.osk`, 40MB) is gitignored and never reaches the Fly.io Docker image. Every fresh deploy serves a 404 at `/skins/default.osk`, silently falling back to the legacy `sprites.json` spritesheet. Additionally, the 40MB file is 98.8% dead weight — only 63 gameplay PNGs (0.45MB) are ever loaded by the client; the rest (menu art, ranking screens, 360-frame skip animations) are filtered out at runtime but still shipped over the wire and inflate every Docker image pull.

## What Changes

- **Strip the default .osk at build time** — a new `scripts/strip-skin.mjs` reads `skins/default.osk`, keeps only entries that pass `isGameplayTexture()` + hitsounds from `HITSOUND_NAMES` + `skin.ini`, and writes the stripped file to `dist/skins/default.osk`. Reduces 40MB → ~0.45MB (84× smaller).
- **Ship via GitHub Release + Docker build arg** — upload the stripped .osk as a GitHub Release asset. The Dockerfile builder stage downloads it via `ARG DEFAULT_SKIN_URL` + `RUN curl` before `npm run build`. `fly.toml` gets a `[build.args]` section with the release URL.
- **Build-time guard** — the Dockerfile fails the build if `skins/default.osk` is missing after the curl step, so a misconfigured deploy fails at build time, not at first user visit.
- **Local dev** — `scripts/fetch-default-skin.mjs` stays for local development. The stripped file is what gets uploaded as the release asset.

## Capabilities

### New Capabilities
- `default-skin-deployment`: Build-time stripping and Docker-based shipping of the default .osk skin to production

### Modified Capabilities
- `osk-skin-loading`: The default skin is now the stripped reowoTuna .osk (gameplay-only), not the full 40MB file. The client fetch path (`/skins/default.osk`) is unchanged.

## Impact

- **Dockerfile** — new `ARG DEFAULT_SKIN_URL` + `RUN curl` + `RUN test -f` guard in builder stage
- **fly.toml** — new `[build.args]` section with the release asset URL
- **scripts/strip-skin.mjs** — new build-time script that filters the .osk
- **scripts/copy-static.mjs** — unchanged (already copies `skins/` to `dist/`)
- **.gitignore** — unchanged (`skins/default.osk` stays excluded from git)
- **Docker image size** — drops by ~40MB (the stripped .osk is 0.45MB)
- **First-visit download** — drops from 40MB to 0.45MB (fits in a single TCP segment)