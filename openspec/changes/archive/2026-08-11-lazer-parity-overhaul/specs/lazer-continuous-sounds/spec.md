## ADDED Requirements

### Requirement: Continuous slider-slide sound
The system SHALL play a looped `sliderslide` sound (from the active sample set: normal/soft/drum) while the cursor is following a slider, starting when following begins and stopping when following ends or the slider ends. The sound SHALL be loaded by the existing `skin-loader.js` slots (`normal-sliderslide`, `soft-sliderslide`, `drum-sliderslide`) and played via a looping howler sound, matching lazer's continuous slider audio.

#### Scenario: Slider-slide starts on follow
- **WHEN** the cursor begins following a slider (`isfollowing` becomes true)
- **THEN** the `sliderslide` sound for the active sample set starts looping

#### Scenario: Slider-slide stops on follow loss
- **WHEN** the cursor stops following the slider or the slider ends
- **THEN** the `sliderslide` sound stops

### Requirement: Continuous spinner-spin sound
The system SHALL play a looped `spinnerspin` sound while a spinner is active (between `hit.time` and `hit.endTime`), starting when the spinner begins and stopping when it ends, matching lazer's continuous spinner audio.

#### Scenario: Spinner-spin starts on spinner begin
- **WHEN** a spinner's active time begins (`time >= hit.time`)
- **THEN** the `spinnerspin` sound starts looping

#### Scenario: Spinner-spin stops on spinner end
- **WHEN** the spinner ends (`time >= hit.endTime`)
- **THEN** the `spinnerspin` sound stops

### Requirement: Continuous sound volume follows timing point
The continuous slider-slide and spinner-spin sounds SHALL respect the active timing point's volume (like hitsounds), scaling with `game.masterVolume * game.effectVolume * timing.volume / 100`.

#### Scenario: Slide volume follows timing
- **WHEN** a slider crosses a timing point with a different volume
- **THEN** the `sliderslide` sound volume updates to match the new timing point's volume