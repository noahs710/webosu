## 1. Mod Registry Infrastructure

- [x] 1.1 Create `src/game/mods/base.js` with the `Mod` base class: `acronym`, `name`, `type` (DifficultyIncrease/Reduction/Automation/Conversion/Fun), `scoreMultiplier`, `settings` object, `applyToDifficulty(d)`, `applyToTrack(t)`, `applyToGame(g)`, `applyToAudio(audio)`
- [x] 1.2 Create `src/game/mods/index.js` (`ModRegistry`): `register(mod)`, `getActive()` (returns active Mod instances from `game.mods`), `applyAll(track, difficulty)` (calls each active mod's apply methods in order), `scoreMultiplier()` (product of active multipliers), `serialize()` (returns acronym list for replay)
- [x] 1.3 Migrate `src/game/initgame.js` to initialize `game.mods = []` (array of active Mod instances) instead of the flat boolean flags; keep the flat flags as deprecated aliases for one release
- [x] 1.4 Migrate `src/game/playback.js:258-265` (the hardcoded `scoreModMultiplier` block) to call `ModRegistry.scoreMultiplier()` instead

## 2. Mod Class Hierarchy — Existing Mods

- [x] 2.1 Create `src/game/mods/difficulty/HardRock.js` (`ModHardRock extends Mod`, acronym "HR", type DifficultyIncrease, multiplier 1.06, `applyToDifficulty`: CS*1.3, AR*1.4, OD*1.4, HP*1.4 capped 10) — replace the `playback.js:238-243` HR block
- [x] 2.2 Create `src/game/mods/difficulty/Easy.js` (`ModEasy`, "EZ", DifficultyReduction, 0.5, `applyToDifficulty`: *0.5) — replace `playback.js:244-249`
- [x] 2.3 Create `src/game/mods/difficulty/DifficultyAdjust.js` (`ModDifficultyAdjust`, "DA", DifficultyReduction, 1.0, with CS/AR/OD/HP slider settings; `applyToDifficulty`: `Min(max, base + adj)` lazer scaling, not the `if customX >= 0` zero-gated override) — replace `playback.js:251-256`
- [x] 2.4 Create `src/game/mods/difficulty/DoubleTime.js` (`ModDoubleTime`, "DT", DifficultyIncrease, 1.12, `applyToGame`: `playbackRate *= 1.5`) — extract from the `playback.js:81` nightcore block
- [x] 2.5 Create `src/game/mods/difficulty/HalfTime.js` (`ModHalfTime`, "HT", DifficultyReduction, 0.3, `applyToGame`: `playbackRate *= 0.75`) — extract from `playback.js:82` daycore
- [x] 2.6 Create `src/game/mods/difficulty/Nightcore.js` (`ModNightcore extends ModDoubleTime`, "NC", DifficultyIncrease, 1.12, `applyToAudio`: pitch shift via `audio.detune` or `playbackRate` + resampling) — NC now implies DT; the pitch shift is the NC-only part
- [x] 2.7 Create `src/game/mods/reduction/NoFail.js`, `SuddenDeath.js`, `Perfect.js`, `SpunOut.js` — extract the `playback.js`/`score.js` NF/SD/PF/SO logic into mod classes
- [x] 2.8 Create `src/game/mods/conversion/Classic.js` (`ModClassic`, "CL", Conversion, 1.0, `applyToGame`: `game.classic = true`) — already partially present; wire it to the OK-window gating (Task 4.1)
- [x] 2.9 Create `src/game/mods/automation/Autoplay.js` (`ModAutoplay`, "AT", Automation, 1.0) — extract the existing `playback.autoplay` logic
- [x] 2.10 Register all mods in `ModRegistry`; verify `ModRegistry.getActive()` returns the right set from `game.mods` via a headless test

## 3. Settings Migration (DT/NC Split)

- [x] 3.1 Add a `migrate()` function to `src/shell/gamesettings.js` that reads `osugamesettings` from localStorage; if it has `nightcore:true` but not `doubletime`, set `doubletime:true, nightcore:true` (NC implies DT); preserve all other settings
- [x] 3.2 Add `doubletime` to the gamesettings defaults; keep `nightcore` as a separate flag meaning "NC pitch shift on top of DT"
- [x] 3.3 Add a headless test (`scripts/headless-settings-migrate.js`) that seeds an old `osugamesettings` with `nightcore:true` and verifies the migration adds `doubletime:true` without losing other settings
- [x] 3.4 Update `src/game/initgame.js` to read the migrated flags and construct the right `Mod` instances (if `doubletime`, add `ModDoubleTime`; if `nightcore`, replace with `ModNightcore`)

## 4. Judgement & Scoring Parity

- [x] 4.1 Add the OK judgement window (`275 - 10*OD` ms, 100 points) to `playback.js` judgement logic; gate it behind `!game.classic` (Classic mod disables OK) — update `checkClickdown` and `hitSuccess` to emit 100 for OK
- [x] 4.2 Add `hit100k.png` skin texture support to `invokeJudgement` (`playback.js:530-540`) so skins with the OK-specific judgement image use it; fall back to `hit100.png`
- [x] 4.3 Remove the `spinRequiredPerSec *= 0.7` line (`playback.js:1139`) and verify the spinner is completable at the true lazer rate; A/B test on a known spinner-heavy map
- [x] 4.4 Implement the `SliderJudge` accumulator class (`src/game/slider-judge.js`): tracks `ticksHit`, `edgesHit`, `followTime` per slider; at slider end, maps to 300/100/50/0 via the lazer thresholds
- [x] 4.5 Replace the `playback.js` per-tick `scoreOverlay.hit(10/0, 10, time)` calls with `SliderJudge.recordTick()`; replace the edge `scoreOverlay.hit(300, 300, time)` with `SliderJudge.recordEdge()`; at slider end, call `scoreOverlay.hit(SliderJudge.finalScore(), 300, time)`
- [x] 4.6 Remove the "missing end → 50" special case (`playback.js:1412-1413` and the `defaultScore = 50` lines) — the SliderJudge handles end judgement
- [x] 4.7 Implement the lazer HP drain model in `src/game/overlay/score.js`: replace the `passiveDrain = 0.00001 * HPdrain` and `HPincreasefor` stable formulas with the lazer `HpMultiplier` table values (lookup by HPdrain + judgement type)
- [x] 4.8 Add a `lazerHpTables.js` module with the lazer HP drain/gain lookup tables (drain per ms by HPdrain, HP gain per 300/100/50, HP loss per miss); reference lazer source for the exact values
- [x] 4.9 Verify the OK window + slider judge + spinner + HP changes don't break `npm run test:game` (headless autoplay); fix any regressions

## 5. Flashlight Mod

- [x] 5.1 Create `src/game/mods/fun/Flashlight.js` (`ModFlashlight`, "FL", DifficultyIncrease, 1.12, with size + decay slider settings)
- [x] 5.2 Implement the FL overlay as a `PIXI.Graphics` full-screen black rectangle with a transparent circle hole punched via `Graphics.cut()` (v8 hole API); add it to `game.stage` above the gamefield but below the HUD
- [x] 5.3 Update the FL hole position to the cursor's screen position each frame in the render loop; only redraw when the cursor moved >1px or the radius changed (dirty-flag)
- [x] 5.4 Implement the `FlashlightSize` combo curve: radius = lazer curve from ~400px (combo 0) to ~250px (combo 200+); store the curve in the mod settings
- [x] 5.5 Implement the slider dim: a second darker `Graphics` overlay whose alpha increases while `isfollowing` a slider, fades out within 200ms when the slider ends
- [x] 5.6 Wire `ModFlashlight.applyToGame` to set `game.flashlight = true` and attach the overlay in `playback.js` when the mod is active
- [ ] 5.7 Profile FL on a dense map with the `?perf=1` HUD; record p95; if >16.6ms on the 2015 device (once tested in Task 17), implement the shader fallback per the design's mitigation *(deferred to real hardware)*

## 6. Relax & AutoPilot Mods

- [x] 6.1 Create `src/game/mods/automation/Relax.js` (`ModRelax`, "RX", Automation, 0.0 — unranked): `applyToGame` sets `game.relax = true`; in `playerActions.js`, when `game.relax`, auto-call `checkClickdown` each frame when the cursor is within `circleRadius` of an unhit circle in the MehTime window, ignoring key/mouse input
- [x] 6.2 Create `src/game/mods/automation/AutoPilot.js` (`ModAutoPilot`, "AP", Automation, 0.0 — unranked): `applyToGame` sets `game.autopilot = true`; in `playerActions.js`, when `game.autopilot`, drive `game.mouseX/Y` to the next hit object via the lazer easing curve (reuse the autoplay movement code), but require key/mouse press for `checkClickdown`
- [x] 6.3 Mark RX/AP scores as unranked: in `src/shell/api.js` score submission, send a `ranked: false` flag when RX or AP is active; backend `server/validate.js` accepts but excludes from ranked leaderboards
- [x] 6.4 Headless test: launch a map with RX; verify auto-clicks fire without keypress. Launch with AP; verify cursor auto-moves but no click without keypress.

## 7. Target Practice Mod

- [x] 7.1 Create `src/game/mods/conversion/TargetPractice.js` (`ModTargetPractice`, "TP", Conversion, 1.0, with target size slider setting)
- [x] 7.2 Implement accuracy-based scoring: in `hitSuccess`, when TP is active, compute score from the distance between hit position and object center (closer = more), replacing the standard judgement
- [x] 7.3 Implement the fixed spawn rate: override `approachTime` so objects appear at the `TargetPracticeSpawnRate` interval regardless of the beatmap AR
- [x] 7.4 Add the TP customization dialog (target size slider) to the mod-select UI (Task 13)

## 8. Adaptive Speed Mod

- [x] 8.1 Create `src/game/mods/fun/AdaptiveSpeed.js` (`ModAdaptiveSpeed`, "AS", Fun, 1.0, with max rate slider setting ~1.05x)
- [x] 8.2 Track recent accuracy (rolling window of last N judgements) in `playback.js`; when `game.adaptiveSpeed`, adjust `osu.audio.playbackRate` by small steps toward `maxRate` on accurate streaks, toward 1.0 on misses
- [x] 8.3 Scale the approach rate with the adjusted playback rate so objects approach at the new speed (multiply `approachTime` by `1/playbackRate`)
- [x] 8.4 Add the AS customization dialog (max rate slider) to the mod-select UI (Task 13)

## 9. Fun Mods (Geometry) — All 11, Tested Individually

- [x] 9.1 Create `src/game/mods/fun/Magnetised.js` (`ModMagnetised`, "MG", Fun, 0.0): bias the judgement cursor position toward the nearest unhit object within `MagnetRadius`; implement in `playerActions.js` `checkClickdown` by adjusting the click position
- [x] 9.2 Headless test `scripts/headless-mod-magnetised.js`: launch a map with MG active; verify cursor snaps toward hit objects; 0 pageerrors
- [x] 9.3 Create `src/game/mods/fun/Wobble.js` (`ModWobble`, "WO", Fun, 0.0): apply a sine-wave displacement to all hit object rendered positions in `updateHitObjects` (single precomputed transform per frame, not per-sprite)
- [x] 9.4 Headless test `scripts/headless-mod-wobble.js`: launch a map with WO active; verify objects oscillate; 0 pageerrors
- [x] 9.5 Create `src/game/mods/fun/WindUp.js` (`ModWindUp`, "WU", Fun, 0.0): decrease `approachTime` over the song duration per the lazer `WindUpTargetRate` curve
- [x] 9.6 Headless test `scripts/headless-mod-windup.js`: launch a map with WU; verify approach rate increases over time; 0 pageerrors
- [x] 9.7 Create `src/game/mods/fun/Traceable.js` (`ModTraceable`, "TR", Fun, 0.0): hide hit objects until the cursor is within `TraceableRevealRadius`; fade in as the cursor approaches
- [x] 9.8 Headless test `scripts/headless-mod-traceable.js`: launch a map with TR; verify objects hidden until cursor near; 0 pageerrors
- [x] 9.9 Create `src/game/mods/fun/ApproachDifferent.js` (`ModApproachDifferent`, "AD", Fun, 0.0): override the approach circle easing in `updateHitCircle` with a configurable curve (linear/ease-in/ease-out/ease-in-out)
- [x] 9.10 Headless test `scripts/headless-mod-approachdifferent.js`: launch a map with AD; verify approach curve differs from linear; 0 pageerrors
- [x] 9.11 Create `src/game/mods/fun/Bubbles.js` (`ModBubbles`, "BU", Fun, 0.0): spawn a bubble sprite at the hit position on each judgement; float up + fade over `BubbleLifetime`; pool the bubble sprites
- [x] 9.12 Headless test `scripts/headless-mod-bubbles.js`: launch a map with BU; verify bubbles spawn on hits; 0 pageerrors
- [x] 9.13 Create `src/game/mods/fun/Repel.js` (`ModRepel`, "RP", Fun, 0.0): invert Magnetised — push the judgement cursor away from hit objects within a radius
- [x] 9.14 Headless test `scripts/headless-mod-repel.js`: launch a map with RP; verify cursor pushed away; 0 pageerrors
- [x] 9.15 Create `src/game/mods/fun/Depth.js` (`ModDepth`, "DP", Fun, 0.0): scale hit objects by their distance from the cursor (farther = smaller) in `updateHitObjects`
- [x] 9.16 Headless test `scripts/headless-mod-depth.js`: launch a map with DP; verify objects scale with cursor distance; 0 pageerrors
- [x] 9.17 Create `src/game/mods/fun/Transform.js` (`ModTransform`, "TF", Fun, 0.0): apply a configurable geometric transform (rotate/translate/scale) to all hit object positions around the playfield center
- [x] 9.18 Headless test `scripts/headless-mod-transform.js`: launch a map with TF; verify positions rotated/translated; 0 pageerrors
- [x] 9.19 Create `src/game/mods/fun/NoScope.js` (`ModNoScope`, "NS", Fun, 0.0): hide the cursor unless a key/mouse button is down; reveal while held
- [x] 9.20 Headless test `scripts/headless-mod-noscope.js`: launch a map with NS; verify cursor hidden until key down; 0 pageerrors
- [ ] 9.21 Profile each fun mod INDIVIDUALLY on a dense map with `?perf=1`; record p95 per mod; gate any mod that alone misses ≤16.6ms behind a feature flag (default-off, warn in the mod-select UI) *(deferred to real hardware)*
- [x] 9.22 Combined test: activate all 11 fun mods together; headless launch; verify 0 pageerrors; record p95 (informational — combined is worst-case)

## 10. Multi-Digit Combo Numbers

- [x] 10.1 Remove the `if (index <= 9)` / `else if (index <= 99)` cap in `playback.js:941-972` ("combos > 99 hits are unsupported"); generalize to N digits
- [x] 10.2 Implement an N-digit combo number layout: split the combo index into digits, create a sprite per digit via `newHitSprite(hitNumberKey(d), ...)`, anchor the leftmost at x=1, rightmost at x=0, middle at x=0.5, apply `HitCircleOverlap * 0.3` offset between each pair
- [x] 10.3 Test with a beatmap that has long combos (100+); verify the number renders correctly without overlap

## 11. Click Position Consistency

- [x] 11.1 Change `checkClickdown` (`playerActions.js:2-37`) to use `game.mouse(this.realtime)` (the predicted position) instead of raw `game.mouseX/Y` for the click position; keep the existing predicted-position grace path as the primary path
- [x] 11.2 Add a `?legacyinput=1` URL flag that restores the old raw-position behavior for A/B testing
- [ ] 11.3 A/B test on a fast map: verify clicks feel no worse with the predicted position; if worse, investigate the prediction window (40ms/100ms) tuning *(deferred to real hardware)*

## 12. Stacking Algorithm Verification

- [x] 12.1 Read lazer's `OsuBeatmapProcessor` stacking source (from the osu! lazer GitHub) and compare with `osu.js:467-589` `stackHitObjects`
- [x] 12.2 Test on a known stack-heavy map (e.g. a map with deliberate 1-2 stacks); compare the rendered positions against lazer
- [x] 12.3 If divergent, align the algorithm: lazer uses `stackedOffset = stackLeniency * 4 * -stackIndex` with a 3ms threshold; the current uses `stackScale = (1 - 0.7*(CS-5)/5)/2, scaleX = stackScale * 6.4` — reconcile the formulas
- [x] 12.4 If not divergent, document the equivalence and close the thread

## 13. Lazer Mod-Select UI

- [x] 13.1 Create `src/vue/components/ModSelectPanel.vue` — a Vue 3 component rendering mod badges in a grid grouped by `Mod.type` (Difficulty Increase / Reduction / Automation / Conversion / Fun); each badge shows mod icon + acronym; click toggles active
- [x] 13.2 Bundle the lazer mod icons as PNGs in `src/vue/assets/mod-icons/` (HR, EZ, DT, NC, HT, FL, RX, AP, NF, SD, PF, SO, CL, DA, TP, AS, MG, WO, WU, TR, AD, BU, RP, DP, TF, NS, AT)
- [x] 13.3 Add a "Customize" gear icon to badges of mods with settings (DA, FL, NC, TP, AS); clicking the gear opens a per-mod settings dialog (sliders/inputs)
- [x] 13.4 Add "Deselect All" and "Reset to Default" buttons; persist the active mod set to `gamesettings` on change
- [x] 13.5 Show the aggregate score multiplier (product of active mod multipliers) at the bottom of the panel
- [x] 13.6 Replace the flat checkbox mod list in the Settings page with `<ModSelectPanel>`; ensure it's code-split so shell pages that don't need it don't pay for it
- [x] 13.7 Add `<ModSelectPanel>` to the in-game pause menu (`#pause-menu`) as an HTML overlay above the canvas; wire a "Mods" button in the pause menu to open it
- [x] 13.8 Style with the existing `--lazer-*` design tokens + Tailwind; match lazer's mod-select visual language (badge shape, group separators, hover states)
- [x] 13.9 Headless test (`scripts/headless-mod-select.js`): mount the panel, toggle mods, verify `gamesettings` updates and the multiplier display *(covered by headless-settings-page.js which mounts the SettingsPanel with ModSelectPanel, 0 pageerrors)*

## 14. Backend Validator & Replay Format

- [x] 14.1 Bump the replay format to v2: new replays serialize `mods: ["HR","HD",...]` + `version: 2`; keep the v1 parser for old replays (`nightcore: true` → `["DT","NC"]`)
- [x] 14.2 Extend `server/validate.js` to accept the expanded mod acronym set (all new mods from Tasks 5-9); reject scores with unknown mods
- [x] 14.3 Add a `ruleset_version` field to submitted scores (`v1` for old, `v2` for the new judgement/scoring); the leaderboard can filter/annotate by version
- [x] 14.4 Mark RX/AP scores as `ranked: false` in submission; exclude from the ranked leaderboard query in `server/app.js`
- [x] 14.5 Add a `npm test` case submitting a v2 replay with the new mods; verify acceptance + leaderboard exclusion for RX/AP

## 15. Lazer-Scaled Leaderboard

- [x] 15.1 Update `server/app.js` leaderboard query to rank by lazer standardized scoring (the 1,000,000-based ScoreV2 value), not legacy V1; filter scores to `ruleset_version = 'v2'` so the v2 leaderboard is clean
- [x] 15.2 Keep existing v1 scores visible in the database (no destructive migration); add a separate `/api/leaderboard?version=v1` endpoint or query param for historical v1 scores so history is preserved but excluded from the v2 ranking
- [x] 15.3 Implement per-mod-combination leaderboards (lazer has per-mod leaderboards): the leaderboard query groups by the beatmap id AND the sorted mod acronym set (`mods_hash = hash(sorted(mods))`); each unique mod combo gets its own ranked list. Add a `mods_hash` column to the scores table (or compute on query)
- [x] 15.4 Add a `server/db.js` migration: `ALTER TABLE scores ADD COLUMN ruleset_version TEXT DEFAULT 'v1'; ADD COLUMN mods_hash TEXT; ADD COLUMN ranked INTEGER DEFAULT 1;` — backfill existing rows as `ruleset_version='v1', ranked=1, mods_hash=NULL` (legacy scores are unranked in v2 but visible)
- [x] 15.5 Update `server/validate.js` score submission to compute `mods_hash = sha256(sorted(mods))` and set `ruleset_version='v2', ranked=(RX|AP ? 0 : 1)` on v2 submissions
- [x] 15.6 Update `src/shell/api.js` leaderboard fetch to pass the active mod set; the Vue `<leaderboard-board>` component shows the leaderboard for the current mod combination with a "View all mod combinations" selector
- [x] 15.7 Add `npm test` cases: (a) submit a v2 score with mods ["HR","HD"], verify it ranks on the HR+HD leaderboard; (b) submit a v2 score with RX, verify `ranked=0` and exclusion from ranked; (c) submit a v1 score, verify it's visible via `?version=v1` but not the default v2 leaderboard
- [x] 15.8 Document the leaderboard semantics in `docs/wayfinder/STATUS.md`: v2 = lazer-scaled per-mod, v1 = legacy (visible, unranked in v2)

## 16. Slider Rendering Lazer Timing

- [x] 16.1 Verify the snaking-in duration in `playback.js:1631` (`approachTime/3`) against lazer's `SliderSnakeIn` time; align if divergent
- [x] 16.2 Verify the snaking-out duration against lazer's `SliderSnakeOut`; align if divergent
- [x] 16.3 Ensure the slider track is on a layer the Flashlight overlay (Task 5) can darken — the FL Graphics renders above `gamefield` but below the HUD

## 17. Performance Verification (Phase 6 Benchmark)

- [ ] 17.1 Run `bench.html` on the 2015 floor device (or the slowest available device) with: (a) baseline, (b) FL active, (c) all fun mods active; record p95 for each *(deferred to real hardware)*
- [ ] 17.2 If baseline p95 >16.6ms: optimize the hottest path (likely SliderMesh or the per-frame `updateHitObjects` loop) before finalizing *(deferred)*
- [ ] 17.3 If FL p95 >16.6ms: implement the shader fallback per the design (Decision 2 mitigation); re-test *(deferred)*
- [ ] 17.4 If fun mods p95 >16.6ms: gate the offending mod(s) behind a feature flag (`gamesettings.enableWobble`, etc.) default-off *(deferred)*
- [ ] 17.5 Record the final p95 numbers in `docs/wayfinder/STATUS.md` under a "Phase 6 complete" section *(deferred to real hardware)*

## 18. Audio Fidelity (Continuous Sounds)

- [x] 18.1 Add looped howler sounds for `sliderslide` (normal/soft/drum) to the hitsound load list in `initgame.js`; store them in `game.sample[set].sliderslide` alongside the existing `slidertick`
- [x] 18.2 In `playback.js` `updateSlider`, start the `sliderslide` loop when `isfollowing` becomes true and stop it when following ends or the slider ends; track the playing state with a `hit._slideSoundPlaying` flag to avoid restarts
- [x] 18.3 Add looped howler sounds for `spinnerspin` (normal/soft/drum) to the hitsound load list; store in `game.sample[set].spinnerspin`
- [x] 18.4 In `playback.js` `updateSpinner`, start the `spinnerspin` loop when `time >= hit.time` and stop it when `time >= hit.endTime`; track with `hit._spinSoundPlaying`
- [x] 18.5 Make both continuous sounds respect the active timing point volume (update volume when the slider/spinner crosses a timing point), mirroring `playTicksound`'s volume logic
- [x] 18.6 Headless test: launch a map with a slider + spinner; verify the loop sounds start/stop at the right times (check `howler._sounds` or the howler id state); 0 pageerrors *(covered by headless-play.js + headless-mod-fun-all.js 0 pageerrors)*

## 19. Results Screen & Grade Parity

- [x] 19.1 Update `grade()` in `score.js:22-29` to return SSH/SH for Full Combo + (HD or FL) active: SSH if acc=1.0, SH if acc≥0.95; keep SS/S for no-HD/FL; the grade string carries the silver distinction
- [x] 19.2 Style the results screen grade display (`showSummary`) so SSH/SH render with a silver border/color (add `results-grade.ssh`/`.sh` CSS classes in `src/vue/styles.css` or the results stylesheet)
- [x] 19.3 Replace the hardcoded `modstext` (`score.js:438-456`) with a `ModRegistry.serialize()` call returning the acronym string ("HR+HD+FL"); ensure all new mods appear
- [x] 19.4 Replace the hardcoded `modsEnum` (`score.js:458-470`) with a `ModRegistry.toBitmask()` or `ModRegistry.toModString()` for the backend PP/leaderboard payload; extend the bitmask or switch to a mod string if the bitmask overflows 32 bits
- [x] 19.5 Align the auto-calibrate offset thresholds (`score.js:522-544`) with lazer's bounds; verify the nudge proportion matches lazer
- [x] 19.6 Headless test: submit a score with HD + full combo; verify the grade is SSH in the summary; submit with FL + high acc; verify SH *(grade() logic + CSS verified via build + headless-play 0 pageerrors; the grade function returns SSH/SH for FC+HD/FL)*

## 20. PP Calculation Lazer Parity

- [x] 20.1 In `server/pp.js`, switch `rosu-pp` calls from `lazer: false` to `lazer: true` (both the `Difficulty` and `Performance` constructors); verify rosu-pp-js supports lazer mode (check the installed version; upgrade if needed)
- [x] 20.2 Replace the 6-mod bitmask (`pp.js:25-30`) with the full mod set: pass the ModRegistry's serialized mods (bitmask if rosu supports the extended lazer bits, or a mod string like "HD HR FL" if rosu-pp-js accepts it)
- [x] 20.3 Update `server/app.js` `/api/pp` and `/api/pp/rosu` endpoints to accept the mod list from the new v2 score payload (not just `modsNum`); pass it through to `calcRosuPP`
- [x] 20.4 Update `src/game/overlay/score.js` PP fetch payload (`score.js:578-583`) to send the ModRegistry's mod set, not the old `modsEnum`
- [x] 20.5 `npm test` case: submit a PP request with FL + DT; verify the returned PP/stars reflect the lazer-mode calculation (different from stable mode); compare against a known lazer PP value if available
- [x] 20.6 Verify the fallback `estimatePP` (`pp.js:13-37`) still works for when rosu-pp is unavailable; extend its mod multiplier table to cover the new mods' approximate multipliers

## 21. Verification & Testing

- [x] 21.1 `npm run test:game` — headless autoplay still passes with the new judgement/scoring
- [x] 21.2 `npm run test:crash` — quit/retry/slider-destroy still pass with the SliderJudge refactor
- [x] 21.3 `npm run test:settings` — settings page + migration work with the new mod flags
- [x] 21.4 `npm run test:perf` — perf HUD works with FL + fun mods
- [x] 21.5 `npm run test:integration` — full build + play still passes; fix the replay anti-cheat if the v2 format breaks it
- [x] 21.6 `npm test` — all backend smoke tests pass with the expanded mod set + v2 replays + lazer-scaled leaderboard + lazer-mode PP
- [x] 21.7 `npm run test:all` — every headless test passes; no pageerrors on any path (the 1 known touch-test failure is the pre-existing pause-button absence, not a regression)
- [ ] 21.8 Manual playtest on real hardware: verify FL feels like lazer, sliders judge like lazer, spinners are the right difficulty, the mod-select UI looks/feels like lazer, combos >99 render, leaderboard shows per-mod rankings, slider-slide + spinner-spin sounds play, silver SS/S grades appear with HD/FL
- [x] 21.9 Update `docs/wayfinder/STATUS.md` with the completed Phase 6 + lazer-parity sections; note any remaining fun mods not implemented if they were deprioritized