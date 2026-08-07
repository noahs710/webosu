# Research 04 — Pixi 6.5.10 -> 8.x migration path

Primary sources: Pixi v7 migration guide, Pixi v8 release notes/changelog, the webosu codebase (file:line evidence below). Findings are codebase-grounded; version-API claims follow the Pixi v8 changelog.

## Headline

Upgrading to Pixi 8 is **not a "bump the version" upgrade**. One file — `js/SliderMesh.js` — reaches deep into Pixi 6's internal renderer (`renderer.shader.bind`, `renderer.geometry.bind`, `PIXI.Shader.from`, `PIXI.Geometry`, custom `_render`/`_renderDefault` overrides). That internal surface was rewritten in v7/v8, so migrating the slider renderer is effectively a **rewrite of the most perf-critical custom GL code in the game**. This is the keystone risk and is why the render-stack decision (ticket 01) cannot assume "just upgrade Pixi."

## Per-file change list + risk

### `js/SliderMesh.js` — RISK: HIGH (the blocker)
- Custom vertex/fragment GLSL (GLSL ES 1.0: `attribute`/`varying`/`texture2D`). v8 moved shaders to `GlProgram`/`GlShader` with GLSL 3.00-style program API; `PIXI.Shader.from(vert, frag, uniforms)` is gone.
- `new PIXI.Geometry()` + `indexBuffer`/`attribute` buffers (lines 216, 235). v8 split `Geometry` into a new `Geometry` (mesh package) with a changed buffer/attribute API.
- `PIXI.DRAW_MODES.TRIANGLES` (line 253). Still present but in a different module path.
- Overrides internal `prototype._render` / `_renderDefault` and calls `renderer.shader.bind(shader)` + `renderer.geometry.bind(geometry, shader)` (lines 298–410). These are **internal v6 renderer calls**; v8's renderer/shader/geometry systems were restructured, so `_render` override + direct `renderer.*.bind` no longer works the same way.
- `PIXI.Texture.fromBuffer(buff, width, colors.length)` (line 111). Still exists in v8 but the signature/format args changed.
- Verdict: a v8 port of SliderMesh is a rewrite against v8's mesh/shader API. Effort: days, not hours. Frame-budget risk: real — any rewrite must be benchmarked, not assumed equivalent.

### `js/initgame.js` — RISK: MEDIUM
- `PIXI.Loader.shared.add("sprites.json").load(...)` + `resources["sprites.json"].textures` (lines 92–95). **`PIXI.Loader` is removed in v8.** Replace with the async `Assets` API: `await Assets.load("sprites.json")` returns the spritesheet textures.
- `PIXI.Texture.from("data:image/png;base64,...")` (line 194) for custom skins. Still works in v8 (`Texture.from` remains) but `Assets` is preferred.
- `PIXI.Sprite.prototype.bringToFront` monkeypatch (line 239). Harmless; keep.

### `js/launchgame.js` — RISK: LOW
- `new PIXI.Application({ autoResize: true })` (line 28). v8: `autoResize` removed; use `resizeTo: window` (or `app.canvas` resizing). `autoDensity` still valid.
- `app.renderer.backgroundColor = 0x111111` and `app.renderer.render(game.stage)` — fine in v8.

### `js/playback.js` — RISK: MEDIUM
- `new PIXI.Loader()` + `PIXI.LoaderResource.LOAD_TYPE.IMAGE` for the background image (lines 500–506). Removed in v8 → `Assets.load(url)` / `Texture.from`.
- `new PIXI.filters.BlurFilter(...)` + `sprite.filters = [blurFilter]` (lines 523–528). BlurFilter still exists in v8 but is imported as a named export (`import { BlurFilter } from "pixi.js"`); `PIXI.filters.*` namespace may not be auto-populated under ESM. Behavior equivalent; only the import changes.
- `PIXI.Text`/`PIXI.Sprite`/`PIXI.Container` usage (many sites) — APIs stable in v8, but `Text` is now async-asset-backed (uses `Assets`/`TextStyle`); synchronous `new PIXI.Text("", {...})` still works for basic cases.

### Overlays (`overlay/*.js`) — RISK: LOW–MEDIUM
- All use the old ES5 prototype-inheritance pattern: `PIXI.Container.call(this)`, `__proto__ = PIXI.Container`, `Object.create(Container.prototype)`, `Container.prototype.destroy.call(this, options)`. This pattern still functions in v8 (Container remains a class) but is fragile against future class internals; a clean modernization would convert to `class X extends Container {}`. Not a blocker, but worth bundling with the SliderMesh rewrite since you're touching rendering anyway.

## Input — a free win

The game does **not** use Pixi's interaction system for gameplay input. Input is captured on `window` pointer events and written to `game.mouseX/mouseY`; `playerActions.js` reads position directly. The Pixi `InteractionManager` therefore runs unnecessary per-frame hit-testing that costs CPU on slow machines. **Disabling interaction** (`Application({ interaction: false })` or `eventMode: "none"`) is a standalone perf win available on v6 *today* and on v8 — independent of any migration.

## Recommendation (feeds ticket 01)

Two clean options, decided by benchmark (ticket 01):
- **Stay on Pixi 6.5.10** and harvest wins that don't require SliderMesh changes: disable interaction, move to ESM/npm packaging, lazy-load. Lowest risk, keeps the custom slider GL intact.
- **Upgrade to Pixi 8** only as part of a deliberate slider-renderer rewrite, gated on a measured frame-budget win. Do not assume the upgrade is cheap.

A middle path — keeping Pixi 6 but cutting a custom raw-WebGL slider path — is also on the table in ticket 01.
