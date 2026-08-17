# lazer-feel-baseline Specification

## Purpose
Measure and publish the end-to-end input-to-judgement latency of webosu! under representative device profiles, document which parts of that latency are inherent to the browser and which are reducible, and produce a public "feel deltas vs osu!lazer" document that replaces the unsupportable "exactly like lazer" promise with honest, measured claims.

## ADDED Requirements

### Requirement: Headless latency probe
A `scripts/headless-latency-probe.js` SHALL measure end-to-end input-to-judgement latency by synthesizing a keypress at a known timestamp (via injected input events) and measuring the wall-time until the judgement sprite spawns.

#### Scenario: Probe reports P50 and P95 latency
- **WHEN** the probe runs against a fixed test beatmap with synthetic clicks at pre-determined times
- **THEN** it reports P50 and P95 input-to-judgement latency in milliseconds

#### Scenario: Probe runs on multiple device profiles
- **WHEN** the probe runs on a reference machine in [high-end 120Hz, mid-tier 60Hz, low-end mobile 30Hz] profiles (emulated via CDP)
- **THEN** it produces a latency profile per device profile

### Requirement: Latency composition measurement
The probe SHALL report the composition of end-to-end latency: input event → logic (playerActions → judgement computation) → sprite spawn → texture upload → composite → display.

#### Scenario: Composition breakdown
- **WHEN** the probe completes
- **THEN** it reports a breakdown of latency by subsystem (input, judging, render, compositor)

### Requirement: Published baseline document
`docs/lazer-feel-deltas.md` SHALL document the measured baselines, list the deltas-vs-native-lazer that are browser-constrained (and not reducible), and list the deltas that webosu! plans to reduce.

#### Scenario: Document checked in
- **WHEN** the change is archived
- **THEN** `docs/lazer-feel-deltas.md` exists in the repo with the current measured latencies and clearly-labeled browser-constraint deltas

#### Scenario: Document updated on material change
- **WHEN** a subsequent change alters the input-or-render critical path
- **THEN** `docs/lazer-feel-deltas.md` is updated with new measurements

### Requirement: Critical-path optimization
The judgement critical path (input → judgement → visual display) SHALL be optimized to reduce by at least one frame at 60 Hz (≈ 16.7 ms) from the baseline measured at campaign start.

#### Scenario: Optimization achieves ≥1 frame improvement
- **WHEN** the probe is re-run after the optimization
- **THEN** P50 latency drops by ≥ 16 ms on the mid-tier 60Hz profile

### Requirement: Honest browser-constraint deltas listed explicitly
The document SHALL list every browser constraint that prevents exact lazer parity, with a measured or estimated magnitude:

- RAF frame quantum: 16.7 ms (60 Hz) / 8.3 ms (120 Hz) / 4.2 ms (240 Hz)
- Audio clock resampling: ~1–5 ms jitter
- Compositor scheduling: up to 1 vsync delay
- JS event-loop scheduling variance: ~1–3 ms

#### Scenario: Constraints documented with magnitude
- **WHEN** a user reads `docs/lazer-feel-deltas.md`
- **THEN** they see each constraint with its estimated contribution to end-to-end latency

### Requirement: No pretense of perfect parity
The document SHALL NOT claim "exactly like lazer" or "no deviation." It SHALL state: "Best-effort parity within browser constraints; measured deltas published here."

#### Scenario: Wording audited
- **WHEN** the document is reviewed in PR
- **THEN** any language claiming perfect parity is rejected

## Non-goals
- Sub-frame latency reduction (not measurable in browsers).
- Hardware-specific tweaks (profiles are representative, not exhaustive).
- osu!lazer-side measurement (we measure ourselves; lazer's numbers are taken from public references).
