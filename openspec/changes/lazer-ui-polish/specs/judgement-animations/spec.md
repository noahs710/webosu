# judgement-animations

## ADDED Requirements

### Requirement: Judgement pop on appear
When a judgement becomes visible (hit0/50/100/300), it SHALL scale from 0.8 to 1.0 with a slight overshoot (to 1.1) over 150ms, then settle to 1.0. This pop animation SHALL layer on top of the existing fade-in/fade-out timing.

#### Scenario: Judgement pop scales on appear
- **WHEN** a judgement is triggered
- **THEN** it scales from 0.8 to 1.1 at 100ms to 1.0 at 150ms while retaining its alpha fade timing

### Requirement: Hit burst particle
When a hit is judged (not a miss), a `hitburst.png` sprite SHALL appear at the hit position, scale from 1.0 to 1.5, and fade from 1.0 to 0.0 over 200ms. The sprite SHALL be removed after the animation completes.

#### Scenario: Hit burst appears and fades
- **WHEN** a hit judgement with points > 0 is invoked
- **THEN** a hitburst sprite spawns at the hit position, scales to 1.5 and fades out over 200ms before being destroyed

### Requirement: Combo color flash
When a new combo starts (combo counter goes from 0 to 1), a brief flash of the current combo color SHALL appear at the hit position for 100ms. The flash SHALL scale from 1.0 to 2.0 and fade from 0.6 to 0.0 over 100ms.

#### Scenario: Combo flash on new combo
- **WHEN** the combo counter transitions from 0 to 1 on a successful hit
- **THEN** a circle tinted with the current combo color spawns at the hit position, scales to 2.0 and fades out over 100ms
