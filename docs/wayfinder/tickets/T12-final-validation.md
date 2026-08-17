# T12 — Final validation gates: all flags on, conformance green, latency published, doc audit

## Type
task (HITL)

## Question

The mega-change's `tasks.md` §8 has four validation gates. This ticket runs them all as the *final* check before declaring the destination reached. It's a pass/fail ticket — no new work, just verification. If anything fails, graduate a fix ticket and re-run.

### The four gates (from §8)

1. **8.1 Conformance harness green on all 4 reference skins at every phase flip** — re-run `npm run test:conformance` after T06's rollout. Must be zero diff.
2. **8.2 Property tests green: hit windows, slider thresholds, score V2, HP drain** — re-run `npm run test:lazer` (currently 87/87 per tasks.md 3.5). Must stay green.
3. **8.3 Latency probe shows ≥16.7 ms P50 improvement on mid-tier 60Hz profile after Track C optimization** — T07's before/after numbers must show this (or a cited reason it's not achievable on the floor device).
4. **8.4 Real-play smoke test on 3 reference beatmaps with all flags on** — T11's playtest verdict.

### Plus the map's own destination-level gate

5. **Destination gate**: every *reducible* delta is closed (Track A done + flags on + legacy deleted per T06), every *not-reducible* delta attacked by T08/T09 is either narrowed (with measured numbers in `docs/lazer-feel-deltas.md` per T10) or documented as "attacked, not pursuable because X." No "exactly like lazer" claims anywhere.

### Acceptance

- All 4 gates pass (or have a cited reason for falling short + a follow-up ticket).
- `docs/lazer-feel-deltas.md` (T10) is the single source of truth for deltas — no over-promises.
- `docs/wayfinder/STATUS.md` updated with a "Lazer perfect parity — destination reached" section pointing at the final commit + the deltas doc.
- The map is closed: all open tickets resolved, the Decisions-so-far is complete, Not-yet-specified is empty (or graduated to follow-up maps).
- The user signs off that the destination is reached.

## Blocks

(none — this is the terminal ticket)

## Blocked by

T06 (rollout done), T10 (deltas doc finalized), T11 (playtest verdict), T08 + T09 (the not-reducible attacks are decided), T04 (conformance green), T07 (latency numbers)