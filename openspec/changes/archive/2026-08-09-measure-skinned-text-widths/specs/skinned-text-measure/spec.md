# skinned-text-measure

## ADDED Requirements

### Requirement: Digit glyph metric spike
The system SHALL log per-digit `width`/`orig.width`/`source.width`/`resolution`/`valid`/`effSpacing` for `score-0..9`, `score-dot`, `score-percent`, `x` on first `setSpriteArrayText` call, gated `import.meta.env.DEV`, for default and WhiteCat skins at `devicePixelRatio 1` and `2` with `ScoreOverlap 0/2/4/6`.

#### Scenario: Metrics table produced
- **WHEN** a map with skinned text is played with `?perf=1` DEV
- **THEN** console shows a table with `width` vs `orig.width` vs `source.width/resolution` for each digit, proving which source to use for `knownwidth`.
