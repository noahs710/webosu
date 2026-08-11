## Why

webosu! is a faithful web port of osu!, but osu! has continued to evolve. The current engine matches stable-era rules and predates the lazer ruleset rewrite that is now the reference implementation. Several deliberate deviations exist (spinner formula multiplied by 0.7 "to make it easier", combos >99 unsupported, clicks use the lagged cursor while sliders use a predicted one), ~30 lazer mods are missing (Flashlight, ScoreV2, true DT/HT, Relax, AutoPilot, Target Practice, Difficulty Adjust lazer scaling, Adaptive Speed, and the lazer "fun" mods), the mod UI is a flat checkbox list rather than the lazer mod-select panel, and the HP/scoring/slider-judgement paths have drifted from current lazer source. This change brings gameplay, mods, scoring, and the in-game + settings UI to parity with osu! lazer so the game feels identical to the reference.

## What Changes

### Judgement & scoring parity
- Add the lazer **OK judgement window** (`275 - 10*OD` ms, between Good and Meh) as an optional/Classic-gated window, matching lazer's three-tier-into-four-tier split
- Replace the spinner `spinRequiredPerSec *= 0.7` cheat with the **true lazer spinner formula** (spin required per second scales with OD, no 0.7x multiplier)
- Adopt lazer **slider judgement**: follow-circle-based with tick/edge scoring that matches lazer's `SliderJudgement` (tick=10, edge=30, completion bonus) rather than the "missing end → 50" special case
- Adopt lazer **HP drain** formulas (passive drain + per-judgement HP changes use the lazer `HpMultiplier`/`DrainRate` tables, not the stable `0.01 * (10.2 - HPdrain)` approximation)
- Fix **combo >99** to render multi-digit combo numbers (currently `osu.js:972` says "combos > 99 hits are unsupported")

### Mods parity
- Implement missing lazer mods as first-class game-logic mods (not just multipliers):
  - **Flashlight (FL)**: viewport circle that shrinks with combo, with lazer's `FlashlightSliderDim`/`FlashlightArea` curve
  - **ScoreV2 (SV2)**: standardized scoring with accuracy portion + bonus-combo portion (already partially present as the non-Classic path; finalize to match lazer's 1,000,000 split)
  - **Difficulty Adjust (DA)**: lazer uses per-attribute overrides with the lazer scaling formula (CS/AR/OD/HP as `Min(max, base + adj)`), not the current `if customX >= 0` zero-gated override
  - **Relax (RX)**: auto-click on cursor-over-hitobject, no keypress required
  - **AutoPilot (AP)**: auto-cursor to each hitobject, player only presses keys
  - **Target Practice (TP)**: accuracy-based scoring, hit objects appear at specific times
  - **Adaptive Speed**: dynamically adjusts audio playback rate to match player accuracy (newer lazer mod)
  - **Magnetised**: cursor snaps toward hit objects within a radius (lazer "fun" mod)
  - **Wobble / Wind Up / Traceable / Approach Different / Bubbles / Repel / Depth / Transform / No Scope**: the lazer "fun" mods that alter gameplay geometry
  - **Spun Out** is present; **Nightcore** is currently implemented as a 1.5x DT alias — separate it into **DoubleTime (DT, 1.5x)** and **Nightcore (NC, DT + pitch-shift + 1.5x)** as distinct mods with the correct multiplier and audio behavior
- Reconcile **mod multipliers** with lazer's `Mod.ScoreMultiplier` table (current multipliers are approximate: HR 1.06 vs lazer 1.06 ✓, HD 1.06 ✓, NC 1.12 vs lazer DT 1.12 / NC 1.12 ✓, but EZ 0.5 ✓, NF 0.5 ✓, SO 0.9 ✓ need verification; DA, FL, RX, AP, TP, and the fun mods all need their lazer multipliers)
- **BREAKING**: The nightcore flag in `game.nightcore` currently conflates DT and NC. Splitting them into `game.doubletime` + `game.nightcore` (NC implies DT) will require settings migration and replay-format changes

### Lazer mod-select UI (in-game + settings)
- Replace the flat checkbox mod list in the settings page with the **lazer mod-select panel**: a horizontal grid of mod badges grouped by type (Difficulty Increase / Difficulty Reduction / Automation / Conversion / Fun), each badge showing the mod icon + acronym + tooltip, with click-to-add and a "Customize" gear for mods with settings (DA, FL, NC, TP)
- Add the lazer **mod customization dialogs**: Difficulty Adjust per-attribute sliders, Flashlight size/decay sliders, Nightcore pitch/speed sliders, Target Practice target size
- Add the **Deselect Mod** + **Reset to Default** + **Mod Customization Panel** flows from lazer

### Latency & input consistency
- Fix the **click-vs-slider position inconsistency**: `checkClickdown` (`playerActions.js:2`) uses raw `game.mouseX/Y`, while slider following uses `game.mouse(t)` prediction. Standardize on the predicted position for both, matching lazer's single-cursor-position model
- Verify the **input prediction window** (currently 40ms history, 100ms prediction) against lazer's `FrameStabilityContainer` / latency compensation behavior

### Beatmap parsing fidelity
- Verify `stackHitObjects` against the lazer `OsuBeatmapProcessor` stacking algorithm (current implementation at `osu.js:467` uses a chain-based approach with `stackScale = (1 - 0.7*(CS-5)/5)/2`, `scaleX = stackScale * 6.4`; lazer uses `stackedOffset = stackLeniency * 4 * -stackIndex` with a 3ms-based threshold — confirm or align)
- Add support for **stacking combos >99** and multi-digit combo number rendering

### Performance verification
- Run the Phase 6 benchmark on the 2015 floor device (never completed per STATUS.md) to lock the p95 ≤16.6ms budget before finalizing the slider/FL shader work
- Add a Flashlight-specific perf budget: FL requires a per-frame radial-gradient mask which is GPU-expensive; profile and gate the shader complexity on the floor device

### Audio fidelity (gaps found during audit)
- Play the **continuous slider-slide sound** (`sliderslide`) while following a slider — the sound is loaded by `skin-loader.js:351` but never played; lazer loops it during slider following
- Play the **continuous spinner-spin sound** (`spinnerspin`) during spinning — lazer loops it while the spinner is active; webosu has no spinner sound

### Results screen & grade parity
- Implement lazer **silver SS/S grades** (SSH/SH): a Full Combo with Hidden or Flashlight active yields a silver-bordered SS/S, not the plain gold; the grade display + results screen must distinguish
- Drive `modstext`/`modsEnum` from the **ModRegistry** instead of the hardcoded 12-mod list (`score.js:438-470`) so new mods appear in the results screen, PP payload, and leaderboard query
- Align the **auto-calibrate audio offset** thresholds (`score.js:522-544`) with lazer's bounds

### PP calculation parity
- Switch `server/pp.js` from `rosu-pp` **stable mode** (`lazer: false`) to **lazer mode** (`lazer: true`) so PP reflects the lazer difficulty/performance model
- Pass the **full mod set** to rosu-pp (the current 6-mod bitmask in `pp.js:25-30` only covers EZ/HD/HR/DT/HT/NF; the 11+ new mods don't affect PP). rosu-pp supports lazer mods via the mod bitmask or a mod string — wire the ModRegistry's serialized set through

## Capabilities

### New Capabilities
- `flashlight-mod`: The Flashlight (FL) mod's darkening viewport that shrinks with combo and dims further during sliders, rendered as a GPU-efficient radial mask
- `lazer-mod-select-ui`: The lazer mod-select panel (mod badges grouped by type, customization dialogs, deselect/reset flows) replacing the flat checkbox list, for both in-game pause menu and the settings page
- `lazer-fun-mods`: The lazer "fun" mods that alter gameplay geometry (Magnetised, Wobble, Wind Up, Traceable, Approach Different, Bubbles, Repel, Depth, Transform, No Scope) with their lazer multipliers and behaviors
- `relax-autopilot-mods`: Relax (auto-click) and AutoPilot (auto-cursor) mods with their lazer input-replacement behaviors
- `target-practice-mod`: Target Practice mod with accuracy-based scoring and timed hit-object appearance
- `adaptive-speed-mod`: Adaptive Speed mod that dynamically adjusts audio playback rate to match player accuracy
- `lazer-spinner`: True lazer spinner judgement using the lazer spin-required formula (no 0.7x "make it easier" multiplier) with lazer spinner-scoring
- `lazer-hp-drain`: Lazer HP drain model (passive drain + per-judgement HP using lazer `HpMultiplier` tables, not the stable approximation)
- `lazer-slider-judgement`: Lazer slider judgement (follow-circle-based with tick=10/edge=30/completion-bonus scoring, replacing the "missing end → 50" special case)
- `ok-judgement-window`: The lazer OK judgement window (275-10*OD ms) between Good and Meh, optionally gated by the Classic mod
- `multi-digit-combo-numbers`: Combo number rendering supporting combos >99 (currently hardcoded to 2 digits max)
- `lazer-continuous-sounds`: Continuous slider-slide and spinner-spin sounds looped during their respective gameplay states, matching lazer audio
- `lazer-grade-display`: Silver SS/S (SSH/SH) grades for Full Combo with HD/FL, and ModRegistry-driven mod text/enum on the results screen

### Modified Capabilities
- `slider-rendering`: Slider body rendering must support the Flashlight dim mask and verify snaking timing against lazer
- `game-cursor`: Cursor position must use the predicted position consistently for clicks and slider following (currently inconsistent); may add CursorCentre/CursorExpand/CursorRotate already covered
- `skinned-text-layout`: Multi-digit combo number layout must be supported (currently capped at 99); ScoreOverlap/HitCircleOverlap already specified but the combo-number path is incomplete

## Impact

**Affected code:**
- `src/game/playback.js`: judgement windows, slider judgement, spinner formula, FL viewport, mod multipliers, the click-position fix, continuous slider-slide sound loop
- `src/game/playerActions.js`: standardize click position on predicted mouse, Relax/AutoPilot/Magnetised input replacement
- `src/game/osu.js`: stacking algorithm verification, combo-number decode for >99
- `src/game/osu-audio.js`: Adaptive Speed (dynamic playbackRate), DT/NC audio split, continuous sound playback support (looped sources)
- `src/game/overlay/score.js`: ScoreV2 finalization, lazer HP drain, OK judgement display, mod multiplier table, silver SS/S grades, ModRegistry-driven `modstext`/`modsEnum`, auto-calibrate threshold alignment
- `src/game/overlay/break.js`: lazer break overlay mascot flair (minor)
- `src/game/initgame.js`: new mod flags (flashlight, doubletime, relax, autopilot, targetpractice, adaptivespeed, magnetised, wobble, etc.)
- `src/shell/gamesettings.js`: settings migration for the DT/NC split + new mod flags
- `src/vue/components/` + `src/vue/pages/Settings.vue` (or equivalent): the lazer mod-select panel replacing the checkbox list
- `src/game/SliderMesh.js`: FL dim mask integration
- New `src/game/mods/`: a mod registry mirroring lazer's `Mod` class hierarchy (each mod = a class with `applyToDifficulty`, `applyToTrack`, `scoreMultiplier`, `settings`)
- `server/pp.js`: switch rosu-pp to `lazer: true`, pass full mod set
- `server/app.js`: lazer-scaled leaderboard query (per-mod-combination, v2-only ranked)
- `server/db.js`: schema migration (ruleset_version, mods_hash, ranked columns)
- `server/validate.js`: accept expanded mod set + v2 replay format

**Affected systems:**
- Replay format: the DT/NC split and new mod flags require a replay-version bump (anti-cheat validator in `server/validate.js` must accept the new format)
- Settings: localStorage `osugamesettings` needs migration (nightcore → doubletime + nightcore)
- Backend: `server/validate.js` replay validator + score submission must accept the expanded mod set; mod multipliers must match lazer for leaderboard fairness
- Build: the mod-select UI is a larger Vue component; ensure it's code-split so shell pages don't pay for it
- Performance: FL's radial mask and the fun-mod geometry transforms add per-frame GPU/CPU cost; must hit p95 ≤16.6ms on the 2015 floor device (Phase 6 benchmark, never completed)

**Dependencies:** No new runtime deps expected. The mod-select UI uses the existing Vue 3 + Tailwind stack. FL shader uses Pixi 8's existing filter/shader system.

**Breaking changes:**
- `game.nightcore` conflation with DT — settings + replay migration required
- Slider judgement change affects leaderboard scores (scores set before the change are not comparable to after) — requires a leaderboard reset or a score-version tag
- Spinner formula change (removing 0.7x) makes spinners harder — gameplay feel changes for existing players