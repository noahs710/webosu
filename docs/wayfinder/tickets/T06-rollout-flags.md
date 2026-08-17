# T06 — Rollout: flip the 4 feature flags on, remove legacy code, ship

## Type
grilling (HITL)

## Question

The mega-change's Track A (judging/scoring/HP) and Track B (skin) are behind four runtime flags (`window.FEATURES.lazerSliderJudging`, `lazerScoreV2`, `lazerHpDrain`, `skinConformance`), all default off. The rollout plan (`tasks.md` §7) says: flip one at a time, re-run the suite, ship a stable release, then delete the legacy code paths.

This is a **grilling** ticket — the decision is *how* to flip, in what order, with what validation at each step, and when to delete. The flags have been off-by-default for the whole campaign; the user must drive the flip order because each flip changes gameplay feel for real players.

### Questions to grill the user on (one at a time, per the grilling skill)

1. **Flip order**: the mega-change suggests `skinConformance` → `lazerSliderJudging` → `lazerScoreV2` → `lazerHpDrain`. Does that order still hold? `skinConformance` is the safest (no gameplay feel change). `lazerSliderJudging` changes slider judgements (BREAKING per proposal). `lazerScoreV2` changes leaderboards (needs `ruleset_version` partition — already implemented per task 3.7). `lazerHpDrain` changes HP drain feel. Is there a safer order, or should two flip together?
2. **Validation at each flip**: re-run `test:all` + conformance + a manual playtest on a reference beatmap. What's the manual-playtest gate — a specific map + mod combo the user trusts? The mega-change mentions "FL feel, slider judgement, spinner difficulty, mod-select UI, combos >99, leaderboard per-mod rankings, slide/spin sounds, silver SS/S grades" — pick the 3-5 that must feel right before flipping the next flag.
3. **Legacy code deletion (task 7.8)**: after all flags are default-on for one stable release, delete the legacy branches. Specifically: `defaultScore = 50` hack, fixed-rate HP drain, −0.10 HP cap, hardcoded followpoint `% 10`. This is a real diff against `playback.js` + `score.js` — confirm the user wants it done in this campaign, not deferred.
4. **Score migration policy**: existing leaderboard rows are tagged `ruleset_version: "v2"` (the old campaign's tag) but scored under legacy formulas. When `lazerScoreV2` flips on, new scores use the lazer formula. Should old rows be (a) frozen as-is with a version partition (current `leaderboardV2` behavior — partitions by `ruleset_version`), (b) re-scored server-side (needs beatmap + mods at recompute time — may not be available), or (c) purged? This is the "PP recalculation" fog item — graduate it here.
5. **Stable release cadence**: the mega-change says "one stable release with all flags default-on" before deleting legacy. What's the release cadence for this repo? Is there a deploy to Fly.io step the user runs, or just a git tag? Confirm.
6. **`AGENTS.md` update (task 7.9)**: the repo has no `AGENTS.md`. The mega-change says update it "if it exists." Decision: create one with the new gameplay/skin pipeline overview, or skip? If creating, what should it contain — a pointer to `docs/wayfinder/STATUS.md` + the active map?

### Acceptance

- A written rollout plan (in the ticket's resolution comment, or appended to `docs/wayfinder/STATUS.md`) covering: flip order, validation gate at each flip, legacy-deletion diff, score migration policy, release cadence, `AGENTS.md` decision.
- The user has signed off on each of the 6 decisions above.
- This ticket does NOT itself flip any flags or delete any code — it produces the plan. Execution is a follow-up task ticket graduated from this one.

## Blocks

T09 (final gates can't be defined until the rollout plan exists), T12 (final validation)

## Blocked by

T01 (clean base), T13 (the 4 audit-parity bugs must be fixed before flags flip on), T03 (Track B done before `skinConformance` flip), T04 (conformance green before any flip)