## ADDED Requirements

### Requirement: Lazer slider judgement accumulator
Each slider SHALL accumulate tick hits, edge hits, and follow-circle time during its duration. At slider end, the judgement SHALL be computed from the accumulator using the lazer thresholds: all ticks + all edges + completion → 300; all ticks + most edges → 100; some ticks → 50; none → 0 (miss).

#### Scenario: Perfect slider yields 300
- **WHEN** the player hits all ticks and all edges of a slider
- **THEN** the slider's final judgement is 300

#### Scenario: Partial slider yields 50
- **WHEN** the player hits some but not all ticks
- **THEN** the slider's final judgement is 50

#### Scenario: No ticks yields miss
- **WHEN** the player hits no ticks and no edges
- **THEN** the slider's final judgement is 0 (miss)

### Requirement: Lazer slider tick and edge scoring
Slider ticks SHALL score 10 points each and slider edges (repeats) SHALL score 30 points each, added to the combo and score at the moment they are hit, matching lazer. The final slider judgement SHALL add the completion bonus.

#### Scenario: Tick scores 10
- **WHEN** the player hits a slider tick
- **THEN** 10 points are added to the score and the combo increments

#### Scenario: Edge scores 30
- **WHEN** the player hits a slider edge (repeat)
- **THEN** 30 points are added to the score and the combo increments

### Requirement: Follow-circle tracking for judgement
The slider judgement SHALL track whether the cursor is within the follow circle (`isfollowing`) over the slider duration. The follow-circle time SHALL factor into the completion bonus per the lazer `SliderFollowWindow`.

#### Scenario: Follow-circle held full duration
- **WHEN** the cursor stays within the follow circle for the entire slider duration
- **THEN** the completion bonus is awarded

#### Scenario: Follow-circle lost mid-slider
- **WHEN** the cursor leaves the follow circle mid-slider
- **THEN** the completion bonus is reduced proportionally