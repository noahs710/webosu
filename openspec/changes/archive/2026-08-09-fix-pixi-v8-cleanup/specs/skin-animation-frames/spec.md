# skin-animation-frames

## MODIFIED Requirements

### Requirement: Follow point animation
When a skin contains `followpoint-0.png` through `followpoint-9.png`, the game SHALL cycle through these frames as an animation instead of using the static `followpoint.png`. Only 0-9 SHALL be loaded (cap), even if skin contains 0-60.

#### Scenario: Follow points animate through frames
- **WHEN** `followpoint-0.png` exists and follow points are rendered
- **THEN** the system cycles frames at 12.5fps (80ms) based on game time

### Requirement: Slider ball animation
When `skin.ini` specifies `SliderBallFrames: N` and the skin contains `sliderb0.png` through `sliderbN-1.png`, the game SHALL cycle through these frames for the slider ball texture.

#### Scenario: Slider ball cycles frames
- **WHEN** `SliderBallFrames: 4` and `sliderb0.png` … `sliderb3.png` exist
- **THEN** the slider ball animates through those 4 frames at 10fps

### Requirement: Animation frame rate
The system SHALL advance animation frames at a consistent rate based on `time` (game time, not wall clock `Date.now()`). The system SHALL fall back to the static texture (frame 0 or the non-numbered variant) if animation frames are not present.

#### Scenario: Fallback when no frames
- **WHEN** no numbered followpoint frames exist
- **THEN** the static `followpoint.png` is used
