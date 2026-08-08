# skin-animation-frames

## Requirements

### REQ-001: Follow point animation
When a skin contains `followpoint-0.png` through `followpoint-N.png`, the game SHALL cycle through these frames as an animation instead of using the static `followpoint.png`.

### REQ-002: Slider ball animation
When `skin.ini` specifies `SliderBallFrames: N` and the skin contains `sliderb0.png` through `sliderbN-1.png`, the game SHALL cycle through these frames for the slider ball texture.

### REQ-003: Animation frame rate
The system SHALL advance animation frames at a consistent rate. Default rate SHALL be 60 FPS for follow points. The system SHALL fall back to the static texture (frame 0 or the non-numbered variant) if animation frames are not present.
