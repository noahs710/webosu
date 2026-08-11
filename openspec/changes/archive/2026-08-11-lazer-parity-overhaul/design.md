## Context

webosu! is a mature Pixi 8 web port of osu! that matches the stable-era ruleset. Since then, osu! has evolved: lazer is now the reference client, with a rewritten ruleset, ~30 additional mods, standardized scoring (ScoreV2), a different HP drain model, a different slider judgement model, and a redesigned mod-select UI. The current engine has several deliberate deviations (spinner `*0.7`, combo >99 unsupported, click vs slider position inconsistency) and predates the lazer fun-mods, Flashlight, Relax/AutoPilot, Target Practice, and Adaptive Speed. The Phase 6 performance benchmark (p95 ≤16.6ms on a 2015 floor device) was planned but never run, so the perf budget is unverified before we add GPU-expensive features like the Flashlight mask.

The codebase is ESM, Vue 3 SPA shell, Pixi 8 game engine, Fastify backend, deployed to Fly.io. The game entry is dynamically imported (code-split) from the shell. There are 17 archived specs covering slider rendering, cursor, skin loading, skinned text, judgement animations, and asset lifecycle. The mod system today is a flat set of boolean flags on `window.game` (e.g. `game.hardrock`, `game.nightcore`) consumed in `playback.js` and `playerActions.js`, with multipliers hardcoded in `playback.js:258-265`.

## Goals / Non-Goals

**Goals:**
- Gameplay judgement (hit windows, slider, spinner, HP) matches lazer source
- All lazer mods are selectable and behave like lazer (including the "fun" mods)
- The mod-select UI is the lazer panel (badges grouped by type, customization dialogs), in both the settings page and the in-game pause menu
- Clicks and slider following use the same (predicted) cursor position
- Combos >99 render correctly
- Replay format and settings migrate cleanly; backend validator accepts new mods
- Performance stays within p95 ≤16.6ms on the 2015 floor device (Flashlight + fun mods gated by the benchmark)

**Non-Goals:**
- A full ruleset rewrite — we're aligning the existing engine to lazer, not reimplementing from scratch
- Multiplayer/spectator mod parity (lazer has per-player mods; webosu multiplayer is out of scope here)
- The lazer "accuracy" mod scoring nuance beyond ScoreV2 (lazer has standardized + classic modes; we keep both)
- Replacing the beatmap parser wholesale (we verify stacking, not rewrite parsing)
- 120+ FPS / variable-refresh-rate work (out of scope per the modernization plan)
- Touch-specific mod behaviors beyond what lazer specifies

## Decisions

### Decision 1: Introduce a `Mod` class hierarchy mirroring lazer

Replace the flat `game.hardrock`/`game.nightcore`/... boolean flags with a `Mod` class hierarchy in a new `src/game/mods/` directory:

```
src/game/mods/
  index.js          — ModRegistry: getActive(), applyAll(track, difficulty), scoreMultiplier()
  base.js           — Mod base class: acronym, name, type, scoreMultiplier, settings, applyToDifficulty(d), applyToTrack(t), applyToGame(g)
  difficulty/       — HardRock, Easy, DifficultyAdjust, DoubleTime, HalfTime, Nightcore, Easy variant
  reduction/        — NoFail, SuddenDeath, Perfect, SpunOut
  automation/       — Relax, AutoPilot, Autoplay (already exists)
  conversion/       — TargetPractice, Classic (already exists)
  fun/              — Flashlight, Magnetised, Wobble, WindUp, Traceable, ApproachDifferent, Bubbles, Repel, Depth, Transform, NoScope, AdaptiveSpeed
```

**Why over the flat flags:** lazer mods have settings (DA sliders, FL size, NC pitch, TP size), type-grouping (for the UI), and composable effects (NC implies DT, Classic changes scoring, HR/EZ scale difficulty). A class hierarchy models this cleanly; the flat flags can't express "NC implies DT" or "DA has 4 slider settings" without special-casing. The UI groups badges by `Mod.type` (DifficultyIncrease / DifficultyReduction / Automation / Conversion / Fun), which requires the type field.

**Alternative considered:** keep the flat flags and add a parallel settings object per mod. Rejected — the conflation bugs (the current `game.nightcore` means both DT and NC) prove the flat model doesn't scale, and the lazer UI needs type-grouping which the flags can't provide.

**Migration:** `gamesettings.js` reads the old booleans and constructs the equivalent `Mod` set on load. `playback.js` reads `game.mods = ModRegistry.getActive()` instead of `game.hardrock`. Old replays serialize the mod acronym list (`["HR", "HD"]`), which the validator already partially supports.

### Decision 2: Flashlight as a Pixi 8 Graphics mask, not a full-screen shader

Flashlight darkens everything outside a circular viewport around the cursor. The viewport shrinks with combo and dims further during sliders. Implementation:

- A full-screen black `Graphics` rectangle covering the playfield, with a **transparent circle hole** punched via `Graphics.cut()` (v8 supports holes), positioned at the cursor each frame
- The circle radius follows lazer's `FlashlightSize` curve: shrinks from ~400px (combo 0) to ~250px (combo 200+) with the lazer `FlashlightSliderDim` reduction during sliders
- A second darker `Graphics` overlays during sliders (the slider dim), alpha driven by "is cursor following a slider"

**Why over a custom shader:** a custom GLSL/WGSL shader is higher-risk (the slider-shader specs document the pain of custom shaders in v8), harder to debug, and the hole-punch Graphics approach is GPU-cheap (one draw call, no uniform updates beyond the circle position). Lazer itself uses a shader, but webosu's slider experience (the `SliderMesh` rewrite saga) shows shaders are the biggest source of bugs here.

**Alternative considered:** a `ColorMatrixFilter` + alpha mask. Rejected — alpha masks in v8 require a `RenderTexture` + mask sprite, which is more allocation and more cleanup than a hole-punch Graphics.

**Risk:** the per-frame `Graphics.clear()` + redraw of the hole is CPU work. Mitigation: only redraw when the cursor moves >1px or the radius changes; the lazer `FlashlightSize` changes are combo-gated (infrequent), so the redraw is mostly cursor-driven. Profile on the 2015 floor device; if it misses budget, fall back to a shader.

### Decision 3: Lazer slider judgement via a `SliderJudge` accumulator

Replace the `hitSuccess` special case ("missing end → 50") and the per-tick `scoreOverlay.hit(10/0)` calls with a `SliderJudge` object per slider that accumulates: ticks hit, edges hit, follow-circle time held. At slider end, the judge maps the accumulator to a judgement (300/100/50/0) using the lazer thresholds:

```
lazer slider judgement (approximate, from osu! ruleset OsuSliderJudgement):
  all ticks + all edges + completion → 300
  all ticks + most edges → 100
  some ticks → 50
  none → 0 (miss)
```

**Why over the current per-event scoring:** lazer scores sliders as a single judgement at the end, not as independent tick/edge judgements. The current code scores each tick immediately (`scoreOverlay.hit(activated ? 10 : 0, 10, time)`), which inflates combo and diverges from lazer's combo-weighting. This is a scoring-fairness issue for the leaderboard.

**Alternative considered:** keep per-tick scoring and just fix the end judgement. Rejected — the combo divergence means scores aren't comparable to lazer; a clean replacement is simpler than a patch.

### Decision 4: OK window gated by Classic, default to lazer's three-tier

Lazer has Great/Good/Meh/OK as a four-tier window where OK (`275-10*OD`) is the widest. Stable (and the current webosu) has only Great/Good/Meh. The OK window was added in lazer to make high-OD more forgiving on the wide end.

- Default (no Classic): add the OK window as the lazer default
- Classic mod: use the stable three-tier (no OK) for parity with old replays

**Why:** matches lazer. The Classic mod already exists to mean "stable scoring," so gating OK behind Classic-off is the lazer behavior.

### Decision 5: The mod-select UI is a Vue 3 component, not a Pixi overlay

The lazer mod-select panel lives in the settings page (Vue) and the in-game pause menu (currently a Pixi overlay). Decision: build it as a **Vue 3 component** (`<ModSelectPanel>`) used in the settings page, and for the in-game pause menu render it as an HTML overlay on top of the canvas (not inside Pixi). The pause menu is already an HTML overlay (`#pause-menu` div), so this is consistent.

**Why:** Pixi is for the game scene; UI is Vue's job. Building mod-select in Pixi would duplicate Vue's rendering, lose Tailwind styling, and fight the code-split invariant (shell pages don't load Pixi). The lazer mod icons can be bundled as PNGs in the Vue component.

**Alternative considered:** a Pixi-based mod panel for the in-game pause. Rejected — it duplicates the settings page work and breaks the isolation invariant.

### Decision 6: DT/NC split via a settings migration + replay version bump

The current `game.nightcore` means "1.5x speed + pitch shift." Lazer has **DoubleTime (DT, 1.5x speed, no pitch shift)** and **Nightcore (NC, 1.5x speed + pitch shift)** as two mods where NC implies DT. Split:

- `game.doubletime` = 1.5x speed (the DT base)
- `game.nightcore` = DT + pitch shift (NC is a DT subclass)
- `ModNightcore extends ModDoubleTime` with `applyToAudio(audio) { audio.detune = ... }`

**Migration:** `gamesettings.js` on load: if old `nightcore=true`, set `doubletime=true, nightcore=true`. Replay format bumps version to 2; the validator in `server/validate.js` accepts both v1 (nightcore flag) and v2 (mod list).

### Decision 7: Click position uses the predicted mouse for both clicks and sliders

`checkClickdown` currently uses raw `game.mouseX/Y`; slider following uses `game.mouse(t)` prediction. Change `checkClickdown` to use `game.mouse(this.realtime)` (the predicted position), matching lazer's single-position model.

**Why:** lazer uses one cursor position for everything. The current split means a fast-moving cursor can click a circle it's already past (using the lagged position) or miss a slider it's ahead of (using the predicted position). Unifying on prediction is the lazer behavior and removes the inconsistency.

**Risk:** the predicted position is 40ms ahead; clicks that are "on time" by the lagged position might become "early" by the predicted one. Mitigation: the MehTime window (200-10*OD ≈ 100-200ms) is much larger than the 40ms prediction, so the edge case is rare. A/B test against the current behavior via a `?legacyinput=1` flag during development.

## Risks / Trade-offs

- **[Leaderboard score comparability]** Slider judgement + spinner formula + OK window change scores. Existing leaderboard scores become incomparable. → Mitigation: bump the score version; tag new scores with `ruleset_v2`; don't reset the leaderboard but mark the cutoff. Alternatively reset if the community prefers.
- **[Flashlight perf]** The hole-punch Graphics redraws per frame on cursor movement. On the 2015 floor device this might miss p95 ≤16.6ms. → Mitigation: gate FL behind the Phase 6 benchmark; if it misses, fall back to a cheaper approximation (static dark vignette + smaller viewport) or a shader.
- **[Fun-mod geometry cost]** Wobble/Depth/Transform add per-frame vertex transforms to every hit object. → Mitigation: implement them in the `updateHitObjects` path with a single precomputed transform, not per-sprite; gate behind the benchmark.
- **[Settings migration failure]** If the DT/NC migration logic has a bug, users lose their mod preferences. → Mitigation: the migration is additive (old `nightcore=true` → new `dt+nc=true`); if migration fails, fall back to no mods, and log a warning. Test with a seeded old-settings localStorage.
- **[Replay validator breakage]** New mods + new mod-list format must be accepted by `server/validate.js`. → Mitigation: validator already accepts a mod list; extend the allowed set + version field. Keep v1 acceptance for old replays.
- **[Mod UI complexity]** The lazer mod panel is a large Vue component with customization dialogs. → Mitigation: build it incrementally (badges first, customization dialogs second); code-split so shell pages don't pay for it.
- **[Stacking drift]** If the stacking algorithm diverges from lazer, maps look wrong. → Mitigation: verify against lazer's `OsuBeatmapProcessor` with a known stack-heavy map (e.g. a test map with deliberate stacks); only change if divergence is confirmed.

## Migration Plan

1. **Settings migration (forward-only):** `gamesettings.js` reads `osugamesettings` from localStorage; if it has `nightcore` but not `doubletime`, add `doubletime=true`. No rollback (old builds won't read the new fields anyway).
2. **Replay format v2:** new replays serialize `mods: ["HR","HD",...]` + `version: 2`. Old replays (v1, `nightcore: true`) still parse via a v1 shim. The validator accepts both.
3. **Backend validator:** extend the allowed mod acronym set in `server/validate.js`; add a `ruleset_version` field to submitted scores; reject scores with unknown mods.
4. **Score comparability:** tag scores with `ruleset_v2` on submit; the leaderboard can filter or annotate. No forced reset.
5. **Rollback strategy:** if the slider judgement or spinner formula proves too disruptive, feature-flag them via `gamesettings` (e.g. `lazerSliderJudge: true`); default on, but disable-able for A/B testing.

## Resolved Decisions (from user direction)

- **Fun mods:** implement ALL 11 (Magnetised, Wobble, Wind Up, Traceable, Approach Different, Bubbles, Repel, Depth, Transform, No Scope, plus Adaptive Speed). No phased rollout — all ship, tested individually to reduce breakage.
- **OK window:** ON by default (lazer standard). Classic mod disables it (stable three-tier). This is the lazer behavior; webosu adheres to lazer standards.
- **Leaderboard:** set up for lazer scaling. The leaderboard SHALL rank by lazer standardized scoring (the 1,000,000-based ScoreV2), grouped per beatmap + mod combination (lazer has per-mod leaderboards). Existing v1 scores remain visible but are excluded from the v2 ranking — a clean v2 leaderboard without erasing history. Backend `server/app.js` leaderboard query filters by `ruleset_version = v2` and groups by the mod acronym set.
- **Testing strategy:** each mod is implemented and headless-tested INDIVIDUALLY before combining, to isolate breakage. One mod per task group, one headless test per mod, then a combined `test:all` pass at the end.
- **Lazer standards adherence:** strict parity. Hit windows, slider judgement, spinner formula, HP drain, mod multipliers, and mod behaviors match current lazer source, not stable. When in doubt, lazer wins.

## Open Questions

- **Stacking algorithm:** is the current `stackHitObjects` (`osu.js:467`) actually divergent from lazer, or just differently structured? Needs a side-by-side test on a stack-heavy map before deciding to change.
- **Flashlight shader fallback:** if the hole-punch Graphics misses p95 budget, what's the minimum-acceptable FL approximation? Lazer-accurate vs. a static vignette? (Per the testing strategy, FL is tested individually first; fallback only if it breaks p95.)