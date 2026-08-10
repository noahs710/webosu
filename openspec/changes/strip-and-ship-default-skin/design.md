## Design

### Build-time skin stripping

`scripts/strip-skin.mjs` reads `skins/default.osk` as a zip, filters entries using the same `isGameplayTexture()` + `HITSOUND_NAMES` logic from `skin-loader.js`, and writes a stripped zip to `dist/skins/default.osk`.

```
┌─────────────────────┐     ┌──────────────────────┐     ┌───────────────────────┐
│ skins/default.osk   │────▶│ scripts/strip-skin   │────▶│ dist/skins/default.osk│
│ 40MB, 2,427 files   │     │ filter: gameplay only │     │ 0.45MB, 81 files      │
│ (gitignored)        │     │ + hitsounds + skin.ini│     │ (shipped to Fly.io)   │
└─────────────────────┘     └──────────────────────┘     └───────────────────────┘
```

The script uses `fflate.unzipSync` to read the .osk, applies the same `isGameplayTexture()` whitelist (imported from `skin-loader.js` or duplicated as a shared constant), keeps `skin.ini` + hitsound files matching `HITSOUND_NAMES`, and uses `fflate.zipSync` to write the stripped archive.

**Key decision: import vs duplicate the filter.** `isGameplayTexture` and `HITSOUND_NAMES` live in `skin-loader.js` which imports `pixi.js` (for `PIXI.Texture.WHITE` checks). A build script should not import the game bundle. Instead, extract the filter logic + constants into a shared `src/game/skin-filter.js` that has no PIXI dependency. Both `skin-loader.js` and `strip-skin.mjs` import from it.

### Docker build flow

```dockerfile
# builder stage
ARG DEFAULT_SKIN_URL=""
COPY . .
# Download default skin if not present in build context (local dev has it, CI doesn't)
RUN if [ -n "$DEFAULT_SKIN_URL" ] && [ ! -f skins/default.osk ]; then \
      mkdir -p skins && curl -fsSL "$DEFAULT_SKIN_URL" -o skins/default.osk; fi
# Strip the skin to gameplay-only before building
RUN if [ -f skins/default.osk ]; then node scripts/strip-skin.mjs; fi
# Fail build if skin still missing after strip attempt
RUN test -f skins/default.osk || (echo "ERROR: default skin missing — set DEFAULT_SKIN_URL build arg or place skins/default.osk" && false)
RUN npm run build
```

**fly.toml:**
```toml
[build]
  [build.args]
    DEFAULT_SKIN_URL = "https://github.com/noahs710/webosu/releases/download/skins/default.osk"
```

### GitHub Release

One-time manual upload:
```bash
# Run strip locally first
node scripts/strip-skin.mjs
# Upload the stripped file as a release asset
gh release create skins skins/default.osk --notes "Default reowoTuna skin (gameplay-only, 0.45MB)"
```

The release URL is stable and immutable. To re-skin: upload a new release, bump the URL in `fly.toml`.

### Trade-offs

- **Stripped .osk is not "real reowoTuna"** — if a user downloads it via the skins page and imports into desktop osu!, menus fall back to osu! default. Acceptable for a web client that doesn't render menu/ranking screens.
- **Build-time curl adds ~1s** to Docker builds (0.45MB download). Negligible.
- **Docker layer cache** — the curl layer is cached as long as `DEFAULT_SKIN_URL` doesn't change. Re-deploys without skin changes skip the download entirely.