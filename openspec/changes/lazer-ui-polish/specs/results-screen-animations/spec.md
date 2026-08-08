# results-screen-animations

## Requirements

### REQ-001: Grade badge bounce-in
The grade badge on the results screen SHALL animate in with a scale bounce: start at scale 0, overshoot to 1.2, settle to 1.0 over 400ms. Animation SHALL trigger when the results screen becomes visible (after the `transparent` class is removed).

### REQ-002: Staggered stat reveal
The stats row (score, accuracy, max combo) SHALL fade in with a stagger: each stat appears 100ms after the previous one, with a 200ms fade-in duration.

### REQ-003: Hit breakdown reveal
The hit breakdown grid (300/100/50/miss) SHALL fade in after the stats row, with a 150ms stagger between each hit stat.
