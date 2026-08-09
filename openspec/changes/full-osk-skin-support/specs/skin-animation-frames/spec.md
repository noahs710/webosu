# skin-animation-frames

## ADDED Requirements

### Requirement: Follow point animation
When a skin contains `followpoint-0.png` through `followpoint-N.png`, the game SHALL cycle through these frames as an animation instead of using the static `followpoint.png`.

#### Scenario: Follow points animate through frames
- **WHEN** `followpoint-0.png` exists and follow points are rendered
- **THEN** the system cycles frames at 10fps based on game time

### Requirement: Slider ball animation
When `skin.ini` specifies `SliderBallFrames: N` and the skin contains `sliderb0.png` through `sliderbN-1.png`, the game SHALL cycle through these frames for the slider ball texture.

#### Scenario: Slider ball cycles frames
- **WHEN** `SliderBallFrames: 4` and `sliderb0.png` … `sliderb3.png` exist
- **THEN** the slider ball animates through those 4 frames

### Requirement: Animation frame rate
The system SHALL advance animation frames at a consistent rate. Default rate SHALL be 60 FPS for follow points. The system SHALL fall back to the static texture (frame 0 or the non-numbered variant) if animation frames are not present.

#### Scenario: Fallback when no frames
- **WHEN** no numbered followpoint frames exist
- **THEN** the static `followpoint.png` is used
