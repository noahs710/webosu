# judgement-animations Delta — lazer-parity-mega

## MODIFIED Requirements

### Requirement: Judgement pop on appear
When a judgement becomes visible (hit0/50/100/300), it SHALL scale from 0.8 to 1.0 with a slight overshoot (to 1.1) over 150ms, then settle to 1.0. This pop animation SHALL layer on top of the existing fade-in/fade-out timing. The judgement VALUE displayed SHALL be the final slider judgement computed from `SliderJudge.finalResultType()` for sliders (not the legacy `defaultScore = 50` fallback); for circles and spinners, the value SHALL be the directly-judged result (unchanged).

*Rationale for MODIFIED: adds the constraint that slider judgements shown by this animation come from the per-part accumulator, removing the legacy fallback. Animation timing itself is unchanged.*

#### Scenario: Judgement pop scales on appear
- **WHEN** a judgement is triggered
- **THEN** it scales from 0.8 to 1.1 at 100ms to 1.0 at 150ms while retaining its alpha fade timing

#### Scenario: Slider judgement shows accumulated final result, not defaultScore
- **WHEN** a slider's judgement is emitted after all parts have been judged
- **THEN** the displayed judgement is the output of `SliderJudge.finalResultType()`, not the `defaultScore` fallback

### Requirement: Hit burst particle
When a hit is judged (not a miss), a `hitburst.png` sprite SHALL appear at the hit position, scale from 1.0 to 1.5, and fade from 1.0 to 0.0 over 200ms. The sprite SHALL be removed after the animation completes. For sliders, the burst particle SHALL appear once per part judgement (head, each tick, each repeat, tail) — matching lazer's per-part burst behavior.

*Rationale for MODIFIED: extends burst emission from one-per-slider to one-per-part, matching lazer's per-part visual feedback.*

#### Scenario: Burst appears per part for sliders
- **WHEN** a slider head is judged a 300
- **THEN** a burst appears at the head position
- **AND** when each tick is judged, a burst appears at the tick position
- **AND** when the tail is judged, a burst appears at the tail position

#### Scenario: Miss does not trigger burst
- **WHEN** any part is judged miss
- **THEN** no burst appears for that part
