## Context

Current `ScoreOverlay` `setSpriteArrayText` uses `tex.width` if `valid` else `14` fallback and `charspacing 12 - ScoreOverlap`. `@2x` textures are loaded via `blob:` with `is2x` flag and `source.resolution` handling, but `tex.width` vs `tex.orig.width` vs `source.width/resolution` semantics are unclear, and `ScoreOverlap` is skin-driven. Skinned text shows correct values after `1012165` but remains a bit too tight/overlapping. `SliderMesh` was `Graphics` 3-stroke fallback (`w+4` shadow, `w+2` border, `w` fill) then `MeshRope` single rope (no border) then `Graphics` 2-stroke (`w+6` border + `w` fill) with dirty-flag — now sliders are see-through (no gradient/shader) with only dot/arrow/follow visible. Need to decide: keep Graphics 3-stroke (shadow+border+fill) for visible border, or reintroduce shader via `Filter`/`FillGradient`, and how to handle `@2x` padding.

## Goals / Non-Goals

**Goals:**
- Skinned digits not overlapping (enough padding) for both `score-*.png` and `numbers-`/`combos-` mapped, on `dpr 1` and `2`, respecting `ScoreOverlap`/`HitCircleOverlap`.
- Slider track visibly opaque with border/gradient (not see-through) on dimmed background, with dirty-flag batching, `cullable=false`.
- Keep `MAX 60/40` and `isGameplayTexture` cap, `blob: parser:"texture"`.

**Non-Goals:**
- True 3D or custom `GlProgram` shader for sliders (Graphics sufficient if opaque).
- Reintroducing `dev.catboy.best` or alphabet `score-a.png` beyond digits.

## Decisions

**D1: Text width uses `tex.orig.width` fallback to `source.width / resolution`** — `tex.width` is `orig.width / resolution` already, but when `!valid` it may be `0` or `1` (WHITE). Use `tex.orig?.width ?? tex.source.width ?? 14` to get unscaled glyph width, then `knownwidth = scale * (origWidth/resolution + effSpacing)`. Alternative was `getBounds().width` after scale, but needs container add.

**D2: Keep `charspacing 12` but make `effSpacing` = `charspacing - ScoreOverlap + (is2x?1:0)`** — adds 1px for `@2x` to compensate for sharper but tighter glyphs. Alternative `charspacing 14` was too wide for `ScoreOverlap 6` skins.

**D3: Slider keeps Graphics 3-stroke (shadow `w+4` black 0.35, border `w+6` white 0.95, fill `w` combo 0.9+1 inner `w-1` for crisp)** — matches `playback.js` fallback that was visible, adds shadow for opacity on dim. MeshRope remains optional (`PIXI.MeshRope` if available) but not primary; if used, two ropes (border `w+6`, fill `w`) as in last `SliderMesh.js`. Rationale: 3 strokes still dirty-flagged (only on `startt/endt`), 825→3/frame, vs shader 200 LOC. Alternative was single fill rope (see-through).

**D4: Slider gradient via `FillGradient` linear or `tint` + `alpha`** — not full shader; use `stroke` `color` as `fillCol` and `borderCol` from `SliderTrackOverride`/`SliderBorder`/combo. If gradient wanted later, use `new FillGradient({type:"linear", colorStops:[...]})`.

**D5: Follow lines & hit numbers `cullable=false`, `eventMode='none'`** — ensures visibility after `gamefield` cullable fix.

## Risks / Trade-offs

- [Graphics 3 strokes still 3× per slider when dirty] → Mitigation: dirty-flag, only snake changes, p95 <16.6ms.
- [`@2x` resolution handling wrong → double/half width] → Mitigation: store `is2x` per texture, set `source.resolution` correctly, measure `orig.width`.
- [Shadow adds overdraw] → Mitigation: shadow only `w+4` with low alpha 0.35, still 3 strokes.

## Migration Plan

1. Patch `score.js` width to `orig.width` + `charspacing 12` + `is2x` padding.
2. Patch `SliderMesh.js` to 3-stroke Graphics (shadow/border/fill) with `cullable=false`.
3. Verify `playback.js` fallback 3-stroke and `SliderMesh` 3-stroke match.
4. `npm run build` + `npm test` + manual default/WhiteCat check (no overlap, slider opaque).

## Open Questions

- Should `Followpoint` animation be 12fps vs 60fps?
- Use `FillGradient` for slider fill to mimic original `uSampler` gradient?
