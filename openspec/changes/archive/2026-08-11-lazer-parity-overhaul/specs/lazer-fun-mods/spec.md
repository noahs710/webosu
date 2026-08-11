## ADDED Requirements

### Requirement: Magnetised mod
The Magnetised mod SHALL pull the cursor toward the nearest unhit hit object within a configurable radius (`MagnetRadius`, default ~100px lazer). When the cursor is within the radius, the cursor position used for judgement SHALL be biased toward the hit object by the lazer attraction curve.

#### Scenario: Cursor snaps to nearby hit object
- **WHEN** Magnetised is active and the cursor is within `MagnetRadius` of an unhit circle
- **THEN** the judgement position is biased toward the circle's center

#### Scenario: No snap when out of radius
- **WHEN** Magnetised is active and the cursor is farther than `MagnetRadius` from any hit object
- **THEN** the cursor position is unmodified

### Requirement: Wobble mod
The Wobble mod SHALL apply a sine-wave displacement to all hit object positions over time, with the lazer `WobbleStrength` and `WobbleFrequency` defaults. The displacement SHALL be applied at the `updateHitObjects` level so it affects circles, sliders, and spinners uniformly.

#### Scenario: Hit objects wobble
- **WHEN** Wobble is active
- **THEN** every hit object's rendered position oscillates by a sine wave over time

### Requirement: Wind Up mod
The Wind Up mod SHALL increase the approach rate over the duration of the beatmap, starting slow and ending fast, per the lazer `WindUpTargetRate` curve.

#### Scenario: Approach rate increases over time
- **WHEN** Wind Up is active and the song progresses from start to end
- **THEN** the approach time decreases (objects approach faster) following the lazer curve

### Requirement: Traceable mod
The Traceable mod SHALL hide hit objects until the cursor is within a proximity radius of them, revealing them as the cursor approaches, per the lazer `TraceableRevealRadius`.

#### Scenario: Objects hidden until cursor near
- **WHEN** Traceable is active and the cursor is farther than `TraceableRevealRadius` from a hit object
- **THEN** the hit object is invisible; it fades in as the cursor approaches

### Requirement: Approach Different mod
The Approach Different mod SHALL override the approach circle animation curve with a configurable easing (the lazer `ApproachDifferentStyle` options: linear, ease-in, ease-out, ease-in-out, etc.).

#### Scenario: Approach circle uses custom curve
- **WHEN** Approach Different is active with the "ease-in" style
- **THEN** the approach circle shrinks with an ease-in curve instead of linear

### Requirement: Bubbles mod
The Bubbles mod SHALL spawn a bubble particle at the cursor position on each hit, which floats upward and fades, per the lazer `BubbleSpawnRate` and `BubbleLifetime`.

#### Scenario: Bubble on hit
- **WHEN** Bubbles is active and a hit is judged
- **THEN** a bubble sprite spawns at the hit position, floats up, and fades over its lifetime

### Requirement: Repel mod
The Repel mod SHALL push the cursor away from hit objects within a radius, inverting the Magnetised behavior.

#### Scenario: Cursor pushed away from hit objects
- **WHEN** Repel is active and the cursor is within the repel radius of a hit object
- **THEN** the judgement cursor position is pushed away from the hit object

### Requirement: Depth mod
The Depth mod SHALL scale hit objects based on their distance from the cursor, creating a faux-3D depth effect, per the lazer `DepthScale` curve.

#### Scenario: Objects scale with cursor distance
- **WHEN** Depth is active
- **THEN** hit objects farther from the cursor render smaller and closer ones render larger

### Requirement: Transform mod
The Transform mod SHALL apply a configurable geometric transform (rotation, translation, scale) to all hit object positions, per the lazer `TransformMode` settings.

#### Scenario: Objects rotated by transform
- **WHEN** Transform is active with the "rotate 45°" setting
- **THEN** all hit object positions are rotated 45° around the playfield center

### Requirement: No Scope mod
The No Scope mod SHALL hide the cursor until the player clicks/presses a key, revealing it only while a button is held, per the lazer `NoScopeRevealDuration`.

#### Scenario: Cursor hidden until click
- **WHEN** No Scope is active and no key is down
- **THEN** the cursor is invisible; it appears only while a key/mouse button is held

### Requirement: Fun-mod performance budget
All fun mods SHALL meet p95 ≤16.6ms on the 2015 floor device. Geometry-transform mods (Wobble, Depth, Transform) SHALL apply a single precomputed transform per frame, not per-sprite. If any fun mod misses the budget, it SHALL be feature-flagged off by default.

#### Scenario: Fun mods meet perf budget
- **WHEN** Wobble + Depth + Transform are all active on a dense map on the 2015 floor device
- **THEN** the frame p95 stays ≤16.6ms