# T10 — Finalize `docs/lazer-feel-deltas.md` with all measured deltas

## Type
task (AFK)

## Question

`docs/lazer-feel-deltas.md` exists with the structure (Browser-Constrained table, Reducible table, Measured Baselines section, Wording Policy) but the "Measured Baselines" section is empty placeholders (`P50 __ ms, P95 __ ms`) and the "Reducible" table has "—" in the After column for some rows.

Once T07 (reducible Track C), T08 (WebGPU/OffscreenCanvas), and T09 (AudioWorklet) land their decisions + numbers, this ticket finalizes the document. It's a writing ticket, not a research ticket — it aggregates the already-decided deltas into the canonical doc.

### Items

1. **Fill "Measured Baselines"** with T07's probe numbers per device profile (60Hz mid-tier, 120Hz high-end, 30Hz mobile — whichever the user ran).
2. **Fill the "Reducible" table's After column** with the post-T07-optimization numbers (judgement sprite spawn, hit error meter, SliderMesh dirty-flag — the STATUS.md already claims these are done, so the After column should be non-"—").
3. **Add a "Not-Reducible, Attacked" section** for the deltas T08/T09 attacked (WebGPU, OffscreenCanvas, AudioWorklet). For each: what was tried, the measured delta (before → after), and whether it's now in the "Reducible" or still "Not Reducible" column.
4. **Audit the "Browser-Constrained" table** against T05's research — are the magnitudes still right? RAF quantum, audio jitter, compositor vsync, JS event-loop variance. Update if T05 found different numbers.
5. **Wording audit (task 6.6)**: no "exactly like lazer" / "no deviation" claims. The "Wording Policy" section already says this — verify every section complies.
6. **Add a "Methodology" section** linking to `scripts/headless-latency-probe.js` and explaining how to regenerate the baselines.
7. **Commit** the finalized doc. Update the map's Decisions-so-far.

### Acceptance

- `docs/lazer-feel-deltas.md` has no `__` or `—` placeholders in the measured sections.
- "Not-Reducible, Attacked" section reflects T08/T09 decisions.
- Wording audited.
- Methodology section present.
- One-line Decisions-so-far entry on the map.

## Blocks

T12 (final validation re-reads this doc)

## Blocked by

T07 (reducible numbers), T08 (WebGPU/Offscreen decision), T09 (AudioWorklet decision), T05 (browser-constrained magnitude audit)