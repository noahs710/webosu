## Why

Skinned digits show correct values but remain too tight/overlapping; `charspacing 12 - ScoreOverlap` currently uses `tex.width` while `orig.width`/`source.width/resolution` and `ScoreOverlap` semantics are unverified, and `@2x` glyphs may report double/half width, making per-digit `knownwidth` wrong.

## What Changes

- Spike: log `score-1`, `score-0`, `score-dot`, `percent` `width` / `orig.width` / `source.width` / `resolution` / `valid` / `effSpacing` on default vs WhiteCat, `dpr 1` vs `2`, `ScoreOverlap 0/2/4/6`.
- Decide: use `orig.width` fallback vs `getBounds().width` vs `source.width/resolution`; keep `charspacing 12` vs `14` vs `+1` for `is2x`.
- No prod code change in this spike — outputs a table recommendation for `skinned-text-layout`.

## Capabilities

### New Capabilities
- `skinned-text-measure`: Spike to measure digit glyph metrics across skins and DPIs.

### Modified Capabilities
- `skinned-text-layout`: Will incorporate measurement decision in follow-up.

## Impact

- `src/game/overlay/score.js` (spike logging only, gated `import.meta.env.DEV`), `src/game/skin-loader.js` (`is2x`/`resolution`).
- No breaking API, spike only.
