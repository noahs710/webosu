# T11 — Real-play validation panel: 3 reference beatmaps × all flags on

## Type
grilling (HITL)

## Question

The mega-change's `tasks.md` §8.4 says: "Real-play smoke test on 3 reference beatmaps (one easy, one hard, one spinner-heavy) with all flags on: no crashes, judgements match expected lazer output."

This is the human playtest gate — no agent can authoritatively judge "does this feel like lazer." It's a grilling ticket: the agent's job is to *prepare* the playtest (pick the beatmaps, write the expected-judgement table per beatmap, set up the flags), then the user plays and the agent records the verdict.

### Preparation (agent-driven)

1. **Pick 3 reference beatmaps** — propose from the conformance-skins or the user's known test maps:
   - Easy: a low-OD, low-CS map (e.g. an Easy diff from a popular set)
   - Hard: a high-OD stream map (e.g. a 9★ Lightspeed-mapped diff — the conformance harness already uses a Lightspeed map)
   - Spinner-heavy: a map with ≥5 spinners (the mega-change's harness map has 5; find a denser one)
2. **Write the expected-judgement table** per beatmap — for a perfect play (autoplay), what should the judgement breakdown be? Use `scripts/test-lazer-parity.js`'s property tests + the SliderScorer model. This gives the user something to diff against when they play.
3. **Set the flags on**: `?features=lazerSliderJudging,lazerScoreV2,lazerHpDrain,skinConformance` in the URL.
4. **Prepare a playtest checklist** the user follows — per map: play once with autoplay (verify judgements match expected), play once manually (verify *feel*), check the results screen, check the leaderboard row.

### Playtest (user-driven, HITL)

The user plays each map with the flags on and reports:
- Crashes? (should be zero)
- Judgements match the expected table? (autoplay)
- Feel: does the slider judgement feel right? HP drain? Score V2 number?
- Results screen: correct grade, mods, score?
- Leaderboard: row appears under the right `ruleset_version` partition?

### Grill the user on any divergence

If any judgement *doesn't* match the expected table, grill the user on: which hit, what was expected, what was seen, is it a SliderScorer bug or a lazer-model misunderstanding (feed back to T02)? This is where the lazer-perfect-parity claim gets its real-world check.

### Acceptance

- 3 reference beatmaps picked + expected-judgement tables written + committed to `docs/wayfinder/playtest-baselines/`.
- User has played all 3 with flags on and reported the verdict.
- Any divergence is either resolved (bug fix → follow-up task ticket) or documented as a known delta in `docs/lazer-feel-deltas.md`.
- One-line Decisions-so-far entry on the map (or a "known divergence" entry if something didn't match).

## Blocks

T12 (final validation includes the playtest verdict)

## Blocked by

T01 (clean base), T06 (rollout plan must say it's time to flip flags on), T13 (the 4 audit-parity bugs must be fixed before playtest validates "lazer feel"), T04 (conformance green first)