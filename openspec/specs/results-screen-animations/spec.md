# results-screen-animations Specification

## Purpose
TBD - created by archiving change lazer-ui-polish. Update Purpose after archive.
## Requirements
### Requirement: Grade badge bounce-in
The grade badge on the results screen SHALL animate in with a scale bounce: start at scale 0, overshoot to 1.2, settle to 1.0 over 400ms. Animation SHALL trigger when the results screen becomes visible (after the `transparent` class is removed).

#### Scenario: Grade badge bounce animation
- **WHEN** the results screen becomes visible
- **THEN** the grade badge scales from 0 to 1.2 to 1.0 over 400ms with a bounce easing

### Requirement: Staggered stat reveal
The stats row (score, accuracy, max combo) SHALL fade in with a stagger: each stat appears 100ms after the previous one, with a 200ms fade-in duration. Each stat SHALL animate from opacity 0 and translateY 10px to opacity 1 and translateY 0.

#### Scenario: Stats stagger in sequence
- **WHEN** the results screen is shown
- **THEN** the three stats fade in sequentially with delays 0ms, 100ms, 200ms and a 200ms duration

### Requirement: Hit breakdown reveal
The hit breakdown grid (300/100/50/miss) SHALL fade in after the stats row, with a 150ms stagger between each hit stat (delays 350ms, 500ms, 650ms, 800ms). The animation SHALL use the same opacity and translateY transition as the stat reveal.

#### Scenario: Hit stats stagger after main stats
- **WHEN** the results screen is shown
- **THEN** the four hit breakdown items fade in with delays 350ms, 500ms, 650ms, 800ms

