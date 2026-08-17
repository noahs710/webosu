# skin-conformance-harness Specification

## Purpose
Provide a headless, snapshot-based conformance harness that loads a `.osk` skin, runs a fixed reference beatmap for a fixed number of frames, and compares the live render tree against a golden baseline. Catches whitelist gaps, dead skin.ini fields, hardcoded skin-dependent constants, and other regressions in the skin pipeline.

## ADDED Requirements

### Requirement: Headless harness executable in CI
The harness SHALL run in Node (via Puppeteer or equivalent headless browser) without manual interaction, in under 60 seconds per skin.

#### Scenario: Harness runs on default skin
- **WHEN** `scripts/headless-skin-conformance.js` runs against `skins/default.osk`
- **THEN** it completes within 60 seconds and produces a conformance report in `tmp/skin-conformance/default.json`

#### Scenario: Harness runs in CI
- **WHEN** the harness runs in CI (no GPU, software rasterizer)
- **THEN** it completes and produces a report without timing out

### Requirement: Reference skin set
The harness SHALL ship with a reference set of at minimum 4 skins covering:
- `skins/default.osk` (baseline, always present)
- One "minimal" skin (few files, tests whitelist floor)
- One "full" skin (WhiteCat-class, tests whitelist ceiling and memory limits)
- One "weird" skin (non-default `sliderStyle`, `hitCircleOverlap`, custom prefixes — tests dead-field wiring)

#### Scenario: Reference skins are versioned
- **WHEN** the harness is initialized
- **THEN** the reference skins are present in `scripts/conformance-skins/` with a SHA-256 manifest for integrity checking

#### Scenario: Missing reference skin fails the run
- **WHEN** a reference skin is missing
- **THEN** the harness reports a setup failure and exits non-zero (not a conformance failure)

### Requirement: Golden snapshot compare
The harness SHALL compare the live render tree (per-sprite texture ID, position, scale, rotation, tint, alpha) at frames [10, 30, 60] of the reference beatmap against golden snapshots checked into `scripts/conformance-golden/<skin-id>/`. Mismatch = failure.

#### Scenario: Snapshot match passes
- **WHEN** the harness runs against a skin whose golden snapshots are current
- **THEN** the harness exits 0

#### Scenario: Snapshot mismatch fails with diff-artifact
- **WHEN** a skin's actual render tree differs from golden
- **THEN** the harness exits non-zero AND writes a JSON diff AND a rendered PNG comparison to `tmp/skin-conformance/<skin-id>-diff/`

#### Scenario: Golden update mode
- **WHEN** the harness runs with `--update-golden`
- **THEN** it overwrites goldens with the current actual render tree (used after an intentional conformance change) and logs the skins updated

### Requirement: Whitelist gap detection
The harness SHALL log any `.osk` texture file present in the skin that was *not* loaded into the active scene graph during the run — flagging potential whitelist gaps.

#### Scenario: Unloaded texture is reported
- **WHEN** a skin contains a texture file that never lands in the scene graph during the test run
- **THEN** the report includes the filename with status "not-loaded"

#### Scenario: Hardcoded constant detection
- **WHEN** a hardcoded value (e.g., followpoint `% 10`) is exercised during the run
- **THEN** the report flags it as "hardcoded" with the file:line of the constant

### Requirement: skin.ini dead-field detection
The harness SHALL warn when a parsed skin.ini key is present in the skin but no consumer was invoked during the run (detected via instrumentation hooks on the consumer functions).

#### Scenario: Dead field detected
- **WHEN** a skin sets `hitcircleoverlap: 5` in its skin.ini but the run never invokes the consumer for `hitCircleOverlap`
- **THEN** the report flags `hitcircleoverlap` as "dead-field"

### Requirement: Golden snapshots versioned with code
Golden snapshots SHALL be committed to the repository alongside code, and a conformance failure SHALL block CI merges.

#### Scenario: PR that breaks conformance fails CI
- **WHEN** a PR changes render output for any reference skin without updating goldens
- **THEN** CI fails with a conformance-diff artifact attached

## Non-goals
- Pixel-perfect diff against live osu!lazer screenshots (browser pixel pipelines differ from native; we snapshot our own render tree for internal consistency).
- Performance regression tracking (handled by a separate benchmark).
