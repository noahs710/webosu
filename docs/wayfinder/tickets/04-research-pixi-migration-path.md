# 04 — research: Pixi 6 -> 8 migration path

Type: `wayfinder:research`

## Question

What is the concrete Pixi 6.5.10 -> 8.x migration path for webosu's **actual** API surface? Catalog every breaking change affecting what the code uses and map it to file:line:

- `PIXI.Application` constructor options (`autoResize` -> `resizeTo`, `autoDensity`, `resolution`).
- Loader migration: `PIXI.Loader.shared` / `LoaderResource` -> the `Assets` async loader; `sprites.json` spritesheet loading.
- `InteractionManager` -> `EventSystem` / `eventMode` (used for cursor input in the game).
- `Mesh` / `SimpleMesh` -> `Mesh2D` / new Mesh API — directly affects `SliderMesh.js`.
- Filters: `AlphaFilter`, `BlurFilter` used for background dim/blur.
- `Sprite.bringToFront` monkeypatch and `Container` z-ordering assumptions.
- `renderer.render(stage)` vs `app.render()` and ticker usage.

Output a per-file change list with risk rating, plus a verdict on whether 8.x is the right target vs staying on 6 or jumping to a non-Pixi renderer (feeds `01-research-render-stack-fps.md`). Cite primary sources (Pixi v7 and v8 migration guides / changelogs).


## Resolution

Resolved (research). Findings: `research/04-pixi-migration-path.md`.

**Headline:** upgrading to Pixi 8 is **not** a version bump. `SliderMesh.js` reaches into v6 internal renderer APIs (`renderer.shader.bind`, `renderer.geometry.bind`, `PIXI.Shader.from`, custom `_render` overrides, GLSL ES 1.0 shaders) that were rewritten in v7/v8 — so the slider renderer is effectively a rewrite, and the highest frame-budget risk. The `PIXI.Loader` -> `Assets` migration (`initgame.js`, `playback.js` background) and `Application({autoResize})` -> `resizeTo` are the other required changes. **Free win available on v6 today, independent of migration:** disable Pixi's `InteractionManager` (the game reads input from window pointer events, not Pixi interaction) to cut per-frame hit-testing CPU. Recommendation feeds ticket 01: stay-on-6-with-wins vs upgrade-8-with-slider-rewrite, decided by benchmark.
