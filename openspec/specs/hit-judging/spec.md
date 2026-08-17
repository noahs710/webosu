# hit-judging Specification

## Purpose
TBD - created by archiving change fix-burst-miss-on-first-tap. Update Purpose after archive.
## Requirements
### Requirement: Miss fires only from the updateJudgement path
The system SHALL emit miss judgements (score 0, maxresult 300) exclusively from the `updateJudgement` function when `judge.points < 0 && time >= judge.finalTime`. No other code path (slider final judgement, spinner end, slider tick) SHALL call `scoreOverlay.hit(0, 300, ...)` or `invokeJudgement(judge, 0, ...)` directly for a miss.

#### Scenario: Single miss per unhit circle
- **WHEN** a circle's `finalTime` (hit.time + MehTime) passes without the player tapping it
- **THEN** exactly one miss is recorded in `scoreOverlay.judgecnt.miss` and one miss judgement animation plays

#### Scenario: No burst misses on frame gap during lead-in
- **WHEN** the render loop experiences a frame gap (e.g. >200ms) during the negative-to-positive time transition at the start of a map
- **THEN** no misses SHALL fire for notes whose `finalTime` was crossed during the gap, because those notes were not yet reachable (their approach window had not begun)

#### Scenario: No burst misses on retry with late first note
- **WHEN** the player retries a map where the first hit object's time is ≥ 1500ms (so `wait = 0` and audio starts at position 0)
- **THEN** the miss counter SHALL start at 0 and remain 0 until the first note's `finalTime` actually passes during live gameplay

### Requirement: Audio position resets to zero on retry when wait is zero
The `OsuAudio.play(wait)` method SHALL set `self.position = 0` when `wait === 0`, ensuring a fresh playback starts from the beginning of the track. When `wait > 0`, it SHALL set `self.position = -wait/1000` (negative lead-in) as before.

#### Scenario: Retry starts audio from beginning
- **WHEN** `play(0)` is called (no lead-in, e.g. first note at ≥ 1500ms)
- **THEN** `self.position` is set to 0 and the audio source starts at offset 0

#### Scenario: Lead-in still produces negative position
- **WHEN** `play(1500)` is called (first note at 0ms, 1500ms lead-in)
- **THEN** `self.position` is set to -1.5 and `time` in the render loop ramps from -1500 toward 0

### Requirement: Slider end scores 50 when head was hit but tail missed
When a slider's head circle is hit successfully, the system SHALL set the slider's last edge judgement's `defaultScore` to 50. If the player fails to follow the slider to its end, the missed tail judgement SHALL score 50 (not 0/miss), matching the original webosu behavior ("only missing slider end will not result in a miss").

#### Scenario: Slider head hit, tail missed
- **WHEN** the player taps the slider head on time (score > 0) but does not hold/follow to the slider end
- **THEN** the slider's tail judgement scores 50, not 0, and `judgecnt.miss` is not incremented for the tail

#### Scenario: Slider head missed entirely
- **WHEN** the player never taps the slider head (head score stays -1)
- **THEN** the head judgement scores 0 (miss) when its `finalTime` passes, and `judgecnt.miss` increments by 1

### Requirement: Slider edges score immediately as 300
The system SHALL score each slider edge (repeat) hit as 300/300 immediately when the player is following the slider at the edge time, matching the original webosu behavior. There SHALL be no separate "final slider judgement" emission at slider end that bypasses the normal miss path.

#### Scenario: Slider edge hit while following
- **WHEN** the player is following the slider (activated) at the time of an edge (repeat)
- **THEN** `scoreOverlay.hit(300, 300, time)` is called immediately and a 300 judgement animation plays at the edge position

#### Scenario: Slider edge missed while not following
- **WHEN** the player is not following the slider at an edge time
- **THEN** no score is recorded for that edge (the edge is silently skipped), and no miss counter increments

### Requirement: Time flows directly from audio position without scrub gating
The render loop SHALL compute `time = osu.audio.getPosition() * 1000 + offset` and pass it directly to all update functions. There SHALL be no `_scrubFrame`, `_lastGameTime`, `_missesThisFrame`, or `MAX_MISSES_PER_FRAME` gating. All update functions (updateHitCircle, updateSlider, updateSpinner, scoreOverlay.update) SHALL be robust to arbitrary `time` values including negative lead-in values, as in the original webosu.

#### Scenario: Negative time during lead-in
- **WHEN** `time` is negative (during the lead-in period before the first note)
- **THEN** no hit objects appear (their approach windows have not begun), no misses fire, and the background fades in smoothly

#### Scenario: Time jumps forward from pause/resume
- **WHEN** the audio position jumps forward (e.g. after a pause/resume or browser throttling)
- **THEN** notes whose `finalTime` was crossed during the gap fire their normal miss via `updateJudgement` (one per object), with no additional burst protection needed

