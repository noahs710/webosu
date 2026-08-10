## Context

`SliderMesh` 2-stroke (`w+6` border + `w` fill) seen as see-through; fallback 3-stroke (`w+4` shadow) was visible. MeshRope single tint not tested. Need A/B to choose visible + high-perf.

## Goals / Non-Goals

**Goals:** Screenshot + p95 compare A/B/C on same map, default+WhiteCat.

**Non-Goals:** Final fix; spike only.

## Decisions

**D1: A=2-stroke, B=3-stroke (shadow w+4 black 0.35 + w+6 border 0.95 + w fill 0.9 + inner w-1), C=MeshRope 2 ropes (border w+6 + fill w, textureScale:0)** — B matches old fallback, C tests GPU batch.

**D2: Dirty-flag retained in all, measure draws/frame via `perf 1` HUD.**

**D3: Keep `cullable=false` for visibility.

## Risks / Trade-offs

- [MeshRope tint may not support border] → Mitigation: 2 ropes as border+fill.
- [Shadow overdraw] → Mitigation: low alpha 0.35.

## Migration Plan

1. Toggle `SliderMesh` impl, build, screenshot, perf.
2. Pick winner for `slider-shader`.

## Open Questions

- Gradient via `FillGradient` needed or flat sufficient?
