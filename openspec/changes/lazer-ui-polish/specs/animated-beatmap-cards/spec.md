# animated-beatmap-cards

## ADDED Requirements

### Requirement: Hover zoom on beatmap cards
Beatmap cards SHALL zoom the cover image slightly (scale 1.05) on mouse hover with a smooth 200ms transition. On mouse leave, the cover SHALL return to scale 1.0.

#### Scenario: Hover zoom scales cover image
- **WHEN** user hovers over a beatmap card's cover image
- **THEN** the image scales to 1.05 with a 200ms ease transition and returns to 1.0 on mouse leave

### Requirement: Difficulty color bars
Each beatmap card SHALL display a row of colored bars beneath the title/artist, one bar per difficulty, colored by difficulty tier (easy=#62d36b, normal=#4aa3e8, hard=#f5a623, insane=#ff5e8a, expert=#a259d6, expert-plus=#4a4a5a). This replaces the current star ring dots. Bars SHALL be 4px height, rounded, stacked horizontally with 2px gap.

#### Scenario: Difficulty bars display correctly
- **WHEN** a beatmap card with multiple difficulties is rendered
- **THEN** a row of 4px rounded color bars appears beneath the title, one per difficulty, with correct tier colors and 2px gap

### Requirement: Smooth card transitions
Card hover transitions (shadow, border color, transform) SHALL use CSS transitions with 200ms ease timing. No layout shift SHALL occur during hover.

#### Scenario: Card hover without layout shift
- **WHEN** user hovers over a beatmap card
- **THEN** shadow, border, and transform animate with 200ms ease and the card's layout position remains stable
