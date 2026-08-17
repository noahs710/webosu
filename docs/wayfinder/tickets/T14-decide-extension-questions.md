# T14 — Decide the 5 webosu-extension-or-fix questions (D5–D9)

## Type
grilling (HITL)

## Claimed by
webosu-agent (2026-08-17 session)

## Status
done

## Question

The T02 audit found **5 more divergences** (D5–D9) that are NOT straightforward bugs — each is a judgement call: is the divergence a webosu extension worth keeping (and documenting), or a parity gap worth closing? The user must decide each one. This is a grilling ticket: one question at a time, per the grilling skill.

### The 5 questions (from `research/lazer-source-audit.md`)

#### D5 — `sliderStyle` is a webosu invention, not lazer
- **State**: `src/game/SliderMesh.js:48-52` branches on `skinConfig.sliderStyle` (1=gradient, 2=textured with `sliderb.png`). `sliderStyle` is NOT in lazer's `SkinConfiguration.LegacySetting` or `OsuSkinConfiguration` enums. Lazer's `LegacySliderBody` always renders a gradient body.
- **Question for the user**: keep `sliderStyle` as a webosu-specific extension (document it as such, drop the "lazer parity" claim in the mega-change), or remove it and always render gradient (true lazer parity)? Keeping it preserves the textured-slider work already done; removing it simplifies the code.
- **Recommendation**: keep as extension, document. The textured slider is a real feature players may want; lazer not having it doesn't mean webosu shouldn't.

#### D6 — `hitCircleOverlap` shift factor wrong
- **State**: `src/game/playback.js:1662-1663` uses `overlap * 0.3` per side (net 0.6·overlap per pair). Lazer's `LegacySpriteText` uses `Spacing = -overlap` (net 1.0·overlap per pair). Also: lazer's default `HitCircleOverlap` is −2 (slightly widened) when unset; webosu defaults to 0.
- **Question for the user**: fix to lazer's `1.0` semantics (changes multi-digit number spacing on every skin with non-zero overlap — player-visible), or keep webosu's `0.3` (looks more compact, webosu tradition)?
- **Recommendation**: fix to lazer's `1.0` — this is a named "lazer parity" campaign and the spacing is wrong. But verify the visual on the default skin + a community skin before flipping.

#### D7 — `@2x` whitelist is a subset of lazer's legal set
- **State**: `src/game/skin-filter.js:30+` whitelists ~50 texture base names for @2x. Lazer's `AllowHighResolutionSprites => true` allows @2x for ANY texture it looks up. Missing from webosu: animation frames (`hit0-0@2x`, `followpoint-0@2x`, `sliderb0@2x`), per-digit font @2x (`default-0@2x`, `score-0@2x`), `sliderpoint30@2x`/`sliderpoint10@2x`, `cursormiddle@2x`, `particle50/100/300@2x`, `sliderendcircle@2x`/`sliderendcircleoverlay@2x`, `sliderstartcircle@2x`/`sliderstartcircleoverlay@2x`.
- **Also**: beatmap skins must NOT use @2x (lazer `LegacyBeatmapSkin.AllowHighResolutionSprites => false`); verify webosu enforces this.
- **Question for the user**: extend the whitelist to the full lazer-legal set (the audit lists the missing names), or keep the curated subset (lower GPU memory, fewer pathological-skin risks)?
- **Recommendation**: extend to the full lazer-legal set — this is the Track B conformance work (T03), and partial @2x support is worse than either full or none. Also add the beatmap-skin @2x disable.

#### D8 — `[Colours] ApproachCircle` is NOT consumed by lazer
- **State**: the mega-change's task 5.12 wires beatmap `[Colours] ApproachCircle` as a fallback when the skin doesn't define it. The audit found lazer's `LegacyApproachCircle` uses the **combo colour only**; `CustomColours["ApproachCircle"]` is parsed by `LegacyDecoder.HandleColours` but never read by the osu! ruleset.
- **Question for the user**: drop mega task 5.12 (true lazer parity — approach circle uses combo colour, full stop), or implement it as a webosu extension that honours the wiki spec (skin → beatmap → combo precedence)?
- **Recommendation**: drop task 5.12. The mega-change proposed it under a "lazer parity" label that turns out to be wrong; implementing it would diverge from lazer, not match it. If a skin creator wants a specific approach-circle colour, they can use the combo colour.

#### D9 — `hit*-<n>.png` numbered variants ARE used by lazer
- **State**: `src/game/skin-loader.js:188-189` skips `hit{0,50,100,300}{,k}-N.png` with the comment "only need base hit0.png". Lazer's `LegacySkin.getJudgementAnimation` uses these frames for animated judgements via `GetAnimation("hit0", true, false)`. webosu's skip is a memory trade-off, not a parity match.
- **Question for the user**: implement animated judgement sprites (load the frames, play as `PIXI.AnimatedSprite` at `AnimationFramerate` default 60 FPS, or `1000/length` if not set), or keep the skip and document it as a known divergence (memory vs. parity trade-off)?
- **Recommendation**: this one is a real parity gap. Animated judgements are a visible feature in many skins (e.g. reowoTuna). Recommend implementing — but it's scope expansion beyond the mega-change, so confirm with the user. If keeping the skip, add it to `docs/lazer-feel-deltas.md` as a known divergence.

### Process

Walk the user through each of the 5 questions one at a time. For each:
1. State the divergence + the two options (keep/fix) + the recommendation.
2. Let the user decide.
3. Record the decision in the ticket's resolution.

### Decisions (recorded live during grilling)

- **D5 — `sliderStyle`: REMOVE (always gradient, true lazer parity).** User chose Option 2 over the recommended Option 1. Delete the `sliderStyle` branch in `SliderMesh.js` + the textured `MeshRope` code (~30 lines). Skins shipping `sliderStyle: 2` in skin.ini get the gradient body. Follow-up task: graduate a ticket to do the removal (update `SliderMesh._draw()` to always gradient, remove the `sliderStyle` read, remove the `MeshRope` textured body block, remove `sliderStyle` from `skin-loader.js` parse if no other consumer).

- **D6 — `hitCircleOverlap` shift factor: FIX to lazer 1.0 + default -2.** User chose Option 1 (recommended). Change `overlap * 0.3` per side to `overlap * 0.5` per side (net 1.0·overlap per pair, matching lazer's `Spacing = -overlap`). Change default from 0 to -2. Player-visible: multi-digit combo numbers on skins with non-zero overlap get wider spacing. Follow-up: graduate a ticket to make the code change in `playback.js:1663-1666` + the default in `skin-loader.js:34`.

- **D7 — `@2x` whitelist: EXTEND to full lazer-legal set.** User chose Option 1 (recommended). Add the ~12 missing texture names (animation frames, per-digit font, sliderpoint, cursormiddle, particle, sliderend/startcircle variants). Add the beatmap-skin @2x disable (`LegacyBeatmapSkin.AllowHighResolutionSprites => false` — webosu must distinguish beatmap skins from user skins for @2x). This is the bulk of T03's Track B work.

- **D8 — `[Colours] ApproachCircle`:** (pending)
- **D8 — `[Colours] ApproachCircle`: DROP mega task 5.12.** User chose Option 1 (recommended). Remove the beatmap ApproachCircle fallback from `playback.js:1594-1596`. Approach circle uses combo colour (skin `approachCircle` still wins if set, then combo colour). True lazer parity — lazer's `LegacyApproachCircle` uses combo colour only; `CustomColours["ApproachCircle"]` is parsed but never read by the osu! ruleset. Follow-up: graduate a ticket to remove the fallback branch + drop mega task 5.12 from tasks.md.

- **D9 — `hit*-N.png` animated judgements: IMPLEMENT.** User chose Option 1 (parity win). Load the `hit*-N.png` frames per judgement type and play them as a `PIXI.AnimatedSprite` at `AnimationFramerate` (default 60 FPS, or `1000/length` if the skin specifies). This is scope expansion beyond the mega-change — a new feature, not a wiring fix. Visible parity win for skins like reowoTuna (the project default) that ship animated judgement frames. Graduate a follow-up ticket to do the implementation (decides: `PIXI.AnimatedSprite` vs. per-frame `Texture.from` swap, `AnimationFramerate` default, memory budget / frame cap, whether to gate behind `skinConformance` flag, where to hook into the judgement spawn path). This also graduates the map's "`hit*-N.png` animated judgement implementation scope" fog item into a real ticket.

### Summary of decisions

| Decision | Choice | Action |
|----------|--------|--------|
| D5 `sliderStyle` | Remove (always gradient) | Delete sliderStyle branch + MeshRope textured code; update skin-loader parse |
| D6 `hitCircleOverlap` | Fix to lazer 1.0 + default -2 | Change `* 0.3` → `* 0.5` per side; default 0 → -2 |
| D7 `@2x` whitelist | Extend to full lazer-legal set | Add ~12 missing names; add beatmap-skin @2x disable (T03 scope) |
| D8 `[Colours] ApproachCircle` | Drop mega task 5.12 | Remove beatmap fallback branch; approach uses combo colour |
| D9 `hit*-N.png` animated judgements | Implement | Load frames, play as AnimatedSprite (new follow-up ticket) |

### Acceptance

- All 5 decisions recorded (D5 keep/fix, D6 keep/fix, D7 keep/extend, D8 drop/implement, D9 implement/skip-and-document).
- For each "fix" decision: a follow-up task ticket graduated from this one with the specific implementation scope.
- For each "keep" decision: a one-line entry in `docs/lazer-feel-deltas.md` (or a code comment) documenting the webosu extension.
- T03 (Track B skin conformance) is updated to reflect the D7 decision (extend whitelist or not) and the D8 decision (drop 5.12 or not).
- One-line Decisions-so-far entry on the map.

## Resolution

All 5 decisions recorded via grilling (see "Decisions" section above). Summary:

- **D5 `sliderStyle`**: REMOVE — delete the sliderStyle branch + textured MeshRope code, always render gradient (true lazer parity).
- **D6 `hitCircleOverlap`**: FIX — change `* 0.3` → `* 0.5` per side (net 1.0·overlap per pair, matching lazer's `Spacing = -overlap`); change default 0 → -2.
- **D7 `@2x` whitelist**: EXTEND — add ~12 missing texture names; add beatmap-skin @2x disable (`LegacyBeatmapSkin.AllowHighResolutionSprites => false`). This is T03's bulk work.
- **D8 `[Colours] ApproachCircle`**: DROP mega task 5.12 — remove the beatmap ApproachCircle fallback branch; approach circle uses combo colour (skin wins, then combo). True lazer parity.
- **D9 `hit*-N.png` animated judgements**: IMPLEMENT — load frames, play as `PIXI.AnimatedSprite` at `AnimationFramerate`. Scope expansion; graduates a new follow-up ticket (T15).

### Graduated follow-up tickets

- **T15 — Implement D5/D6/D8 removals + fixes** (task, HITL): delete the sliderStyle branch in `SliderMesh.js` + the textured MeshRope code; fix the hitCircleOverlap shift factor in `playback.js` + the default in `skin-loader.js`; remove the beatmap ApproachCircle fallback from `playback.js`. These are small, focused code changes with clear acceptance (conformance goldens may shift — regenerate).
- **T16 — Implement D9 animated judgements** (task, HITL): load `hit*-N.png` frames, play as `PIXI.AnimatedSprite` at `AnimationFramerate`, decide on memory cap + flag gating. Larger scope; new feature. Graduates the map's "`hit*-N.png` animated judgement implementation scope" fog item.
- **T03 updated**: D7 (`@2x` whitelist extend) is the bulk of T03's remaining work; D8's removal (dropping mega task 5.12) is now part of T15, not T03.

### What this means for the map

- T03 (Track B skin conformance) is unblocked — its scope is now D7 (@2x extend + beatmap-skin disable) + the remaining tasks.md §5 items (5.1, 5.2, 5.4, 5.8, 5.11, 5.13). D8 (ApproachCircle) is moved to T15. D9 (animated judgements) is T16.
- T06 (rollout) is unblocked on the D5/D6 front — those are T15's scope, which should land before T06 flips flags.
- The map's "Not yet specified" fog item "`hit*-N.png` animated judgement implementation scope" graduates into T16.

## Blocks

T03 (skin conformance scope depends on D7), T06 (rollout scope depends on D5/D6 via T15)

## Blocked by

T01 (clean base), T02 (the audit that found these — now closed)

## Question