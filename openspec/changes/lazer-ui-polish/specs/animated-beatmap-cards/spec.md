# animated-beatmap-cards

## Requirements

### REQ-001: Hover zoom on beatmap cards
Beatmap cards SHALL zoom the cover image slightly (scale 1.05) on mouse hover with a smooth 200ms transition. On mouse leave, the cover SHALL return to scale 1.0.

### REQ-002: Difficulty color bars
Each beatmap card SHALL display a row of colored bars beneath the title/artist, one bar per difficulty, colored by difficulty tier (easy=green, normal=blue, hard=orange, insane=pink, expert=purple, expert-plus=gray). This replaces the current star ring dots.

### REQ-003: Smooth card transitions
Card hover transitions (shadow, border color, transform) SHALL use CSS transitions with 200ms ease timing. No layout shift during hover.
