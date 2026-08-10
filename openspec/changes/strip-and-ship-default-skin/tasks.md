## Tasks

- [x] Extract `isGameplayTexture` + `HITSOUND_NAMES` + `OSK_NAME_MAP` + `OSK_EXTRA_TEXTURES` from `skin-loader.js` into a new `src/game/skin-filter.js` (no PIXI dependency)
- [x] Update `skin-loader.js` to import from `skin-filter.js` instead of defining locally
- [x] Create `scripts/strip-skin.mjs` — reads `skins/default.osk`, filters via `skin-filter.js`, writes stripped zip
- [x] Add `strip-skin` step to `package.json` build script
- [x] Update `Dockerfile` builder stage: add `ARG DEFAULT_SKIN_URL`, `RUN curl`, `RUN strip`, `RUN test -f` guard
- [x] Update `fly.toml`: add `[build.args]` with `DEFAULT_SKIN_URL`
- [x] Run `node scripts/strip-skin.mjs` locally to generate the stripped .osk (40MB → 460KB, 80 files)
- [x] Upload stripped .osk to GitHub Release: `gh release create skins skins/default.osk --notes "Default reowoTuna skin (gameplay-only)"` — uploaded via GitHub API, release ID 367686535, download URL: https://github.com/noahs710/webosu/releases/download/skins/default.osk
- [x] Verify: `npm run build` produces `dist/skins/default.osk` at ~460KB
- [x] Verify: `npm test` passes
- [x] Verify: `npm run test:game` passes (game loads with stripped skin)