## MODIFIED Requirements

### Requirement: Judgement pop on appear
When a judgement becomes visible (hit0/50/100/300), it SHALL scale from 0.8 to 1.0 with a slight overshoot (to 1.1) over 150ms, then settle to 1.0. This pop animation SHALL layer on top of the existing fade-in/fade-out timing. The judgement SHALL be triggered via exactly one `invokeJudgement` call per hit object — no burst emissions from slider-end or spinner-end paths.

#### Scenario: Judgement pop scales on appear
- **WHEN** a judgement is triggered via `invokeJudgement`
- **THEN** it scales from 0.8 to 1.1 at 100ms to 1.0 at 150ms while retaining its alpha fade timing

#### Scenario: Single miss judgement per missed object
- **WHEN** a hit object's `finalTime` passes without being hit
- **THEN** exactly one miss judgement animation plays (via the `updateJudgement` path), not a burst of miss animations from multiple code paths

#### Scenario: No miss animation burst on retry
- **WHEN** the player retries a map and the audio restarts
- **THEN** no miss judgement animations appear until the first note's `finalTime` actually passes during the new playthrough