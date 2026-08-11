## MODIFIED Requirements

### Requirement: Skinned digit layout and padding
The system SHALL render skinned digit sprites (score, combo, accuracy, hit numbers) using `window.Skin` textures with `ScorePrefix`/`HitCirclePrefix` resolution (`prefix === "default" ? ch + ".png" : prefix + "-" + ch + ".png"`, fallback to `score-` then `ch + ".png"`). Each sprite's `knownwidth` SHALL be computed from the texture's `orig.width` (or `source.width / resolution` when `@2x`) plus `effSpacing = charspacing - ScoreOverlap`, where `charspacing` is 12 and `ScoreOverlap` is from `skin.ini [Fonts]`. `setSpriteArrayPos` SHALL position sprites using `knownwidth` and `effSpacing / 2` offset so digits do not overlap, and SHALL respect `ScoreOverlap` exactly (osu! spec). The combo number rendering SHALL support multi-digit combos (100-9999+), extending the current 2-digit cap.

#### Scenario: WhiteCat numbers not overlapping
- **WHEN** a WhiteCat skin with `numbers-*.png` (mapped to `score-*.png`) is applied and `ScoreOverlap=0`
- **THEN** `12345` renders with visible gaps between digits (no overlap), matching `effSpacing = 12`.

#### Scenario: Hit circle numbers respect HitCircleOverlap
- **WHEN** a beatmap shows combo `42` with `HitCirclePrefix=score` and `HitCircleOverlap=2`
- **THEN** the `4` and `2` sprites are offset by `overlap * 0.3` and do not touch.

#### Scenario: Multi-digit combo number layout
- **WHEN** a combo number `142` (3 digits) is rendered on a hit circle
- **THEN** three digit sprites are positioned left-to-right with the leftmost anchored at x=1, middle at x=0.5, rightmost at x=0, and `HitCircleOverlap` applied between each pair, not truncated to 2 digits.

### Requirement: @2x digit resolution handling
When `devicePixelRatio > 1` and a `digit@2x.png` exists, `pickBestResolution` SHALL prefer the `@2x` variant and `tex.source.resolution` SHALL be set to `2` (otherwise `1`). `orig.width` SHALL be used for layout so `@2x` glyphs do not appear half-width or double-spaced.

#### Scenario: @2x digits same visual spacing as 1x
- **WHEN** `cursor.png` and `cursor@2x.png` both exist and `devicePixelRatio=2`
- **THEN** `score-1.png@2x` renders at same visual size as `score-1.png` with `orig.width / 2` matching `1x` width.

### Requirement: Valid fallback for missing digit textures
`setSpriteArrayText` SHALL NOT force `score-0.png` when `tex.valid === false`; it SHALL use `tex` even if not yet `valid` and fallback width to `14` or `score-0.png.width` only for layout, while texture remains the intended digit (not always `0`).

#### Scenario: All digits not forced to 0
- **WHEN** `score-7.png` is not yet `valid` on first frame
- **THEN** the sprite shows `7` (WHITE fallback tinted) not `0`, and does not overlap neighbor.