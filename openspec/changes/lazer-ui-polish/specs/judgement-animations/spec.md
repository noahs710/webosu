# judgement-animations

## Requirements

### REQ-001: Judgement pop on appear
When a judgement becomes visible (hit0/50/100/300), it SHALL scale from 0.8 to 1.0 with a slight overshoot (to 1.1) over 150ms, then settle to 1.0. This pop animation SHALL layer on top of the existing fade-in/fade-out timing.

### REQ-002: Hit burst particle
When a hit is judged (not a miss), a `hitburst.png` sprite SHALL appear at the hit position, scale from 1.0 to 1.5, and fade from 1.0 to 0.0 over 200ms. The sprite SHALL be removed after the animation completes.

### REQ-003: Combo color flash
When a new combo starts (combo counter goes from 0 to 1), a brief flash of the current combo color SHALL appear at the hit position for 100ms.
