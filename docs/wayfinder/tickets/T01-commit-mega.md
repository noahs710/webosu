# T01 — Commit &amp; stabilize the in-flight lazer-parity-mega work

## Type
task (AFK)

## Claimed by
webosu-agent (2026-08-17 session)

## Status
in_progress

## Question

The `lazer-parity-mega` change is substantially landed but **uncommitted**: 10 modified files (`playback.js`, `SliderMesh.js`, `skin-loader.js`, `skin-filter.js`, `score.js`, `main.js`, `osu-audio.js`, `db.js`, `package.json`, `styles.css`) and ~15 untracked new files (`slider-scorer.js`, `score-math.js`, `features.js`, `scripts/test-lazer-parity.js`, `scripts/headless-skin-conformance.js`, `scripts/headless-latency-probe.js`, `scripts/conformance-golden/`, `scripts/conformance-skins/`, `docs/lazer-feel-deltas.md`, `openspec/changes/lazer-parity-mega/`, `openspec/specs/hit-judging/`, `public/skins/`, `src/game/features.js`). Typecheck is 121/121 green, backend tests 53/53 green — but nothing is committed, so every other ticket on this map builds on quicksand.

Before any new parity work, the in-flight change must be reviewed for correctness, committed cleanly (or split into a small number of focused commits), and verified to not regress. This is the one ticket that *does* rather than decides — it unblocks the rest of the map by giving every later ticket a stable base to diff against.

### Scope of this ticket

1. **Audit the uncommitted diff** for obvious bugs, dead code, half-wired paths. Known suspects from a quick read:
   - `playback.js` removed the burst-miss guard (`_scrubFrame`, `_missesThisFrame`, `MAX_MISSES_PER_FRAME`) — confirm this is intentional and doesn't regress the `fix-burst-miss-on-first-tap` archive's regression test (`scripts/headless-burst-miss.js`).
   - `playback.js:circleRadius` changed from `(109 - 9·CS)/2` to `32·(1 − 0.7·(CS−5)/5)` — the comment claims lazer parity. Verify against ppy/osu `OsuHitObject.cs` radius formula.
   - `playback.js` has a stray indentation change (`} else {` → `       } else {`) — whitespace-only, safe.
   - `SliderMesh.js` removed the `?gradient=`/`?slider=`/`?cull=` URL-param spikes and replaced with `skinConfig.sliderStyle` — confirm no dev tooling depends on the removed URL params.
   - `main.js` added `__loadOsk`/`__applySkin`/`__snapshotSkinTree` conformance hooks — confirm they're harness-only and don't leak into production bundle.
2. **Run the full headless suite** (`npm run test:all` or at least `test:game`, `test:mods`, `test:lazer`, `test:conformance`, `test:gamestate`, `test:error-popup`) and confirm 0 pageerrors across the board.
3. **Decide commit shape**: one mega-commit (matches the `lazer-parity-mega` change shape) or split into Track A / Track B / Track C / harness commits. The repo convention (per `git log --oneline -20`) is feature-scoped commits with a `Fix …` / `feat: …` prefix.
4. **Commit** with a message matching repo style. Do NOT push unless asked.
5. **Update `docs/wayfinder/STATUS.md`** with a one-line "lazer-parity-mega committed @ `<sha>`" entry under a new "Lazer perfect parity" section.

### Acceptance

- `git status` clean (or only intentionally-untracked files like `tmp-*`, `t_target`, `public/skins/` if those are runtime artifacts).
- `npm run typecheck` + `npm test` + the headless suite all green.
- `openspec/changes/lazer-parity-mega/` either committed as-is, or its tasks.md updated to reflect what actually landed vs. what's still open (the tasks.md currently mixes done and open checkboxes — reconcile with reality).
- The map's Decisions-so-far gets a one-line entry pointing at this ticket.

## Blocks

T03, T04, T05, T09, T10, T12 (everything that touches the same files needs a clean base)

## Blocked by

(none — this is the frontier entry point)