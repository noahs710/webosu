## Context

`ScoreOverlay` `setSpriteArrayText` computes `knownwidth = scale * (w + effSpacing)` where `w` currently falls back to `14` or `score-0` width when `!valid`, and `effSpacing = 12 - ScoreOverlap`. `@2x` uses `is2x` flag and `source.resolution 2/1` but `tex.width` vs `orig.width` vs `source.width` semantics unverified; WhiteCat `numbers-`→`score-` mapping shares `is2x`. Need ground truth to pick `orig.width` vs `getBounds()`.

## Goals / Non-Goals

**Goals:** Capture per-digit glyph metrics table on default vs WhiteCat, `dpr1`/`2`, `ScoreOverlap 0/2/4/6`, and recommend width source.

**Non-Goals:** Prod code change; keep as spike (DEV log only).

## Decisions

**D1: Log `tex.width`/`orig.width`/`source.width`/`resolution`/`valid`/`effSpacing` per digit** — `orig` is unscaled bitmap, `width` is `orig/resolution`, `source.width` is GPU. Log at `setSpriteArrayText` first frame.

**D2: Keep `is2x` flag from `bestName.includes("@2x")`** — share via `combos-`/`numbers-` mappings.

**D3: Spike gated `import.meta.env.DEV`** — no prod log.

## Risks / Trade-offs

- [Log spam] → Mitigation: log once per `prefix`/`overlap`.
- [Resolution not set yet] → Mitigation: log after `tex.source.resolution` assignment in `applySkin`.

## Migration Plan

1. Add DEV log, `npm run build`, manual check table.
2. Feed decision into `skinned-text-layout`.

## Open Questions

- `ScoreOverlap` in `skin.ini` is texture or screen pixels? Assume texture.
