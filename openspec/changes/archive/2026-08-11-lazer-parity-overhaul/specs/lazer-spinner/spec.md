## ADDED Requirements

### Requirement: Lazer spinner spin-required formula
The spinner SHALL use the lazer spin-required-per-second formula: `spinRequiredPerSec = OD < 5 ? 3 + 0.4*OD : 2.5 + 0.5*OD`, WITHOUT the legacy `*= 0.7` "make it easier" multiplier. The total rotation required SHALL be `2 * PI * spinRequiredPerSec * (endTime - time) / 1000`.

#### Scenario: Spinner difficulty matches lazer
- **WHEN** a spinner is played on a map with OD=8
- **THEN** the spin required per second is `2.5 + 0.5*8 = 6.5` rotations/sec (not `6.5 * 0.7 = 4.55`)

#### Scenario: Spinner completable at lazer rate
- **WHEN** a player spins at the lazer-required rate for the spinner duration
- **THEN** the spinner reaches 100% progress and is judged 300

### Requirement: Lazer spinner judgement thresholds
The spinner judgement SHALL use the lazer thresholds: ≥100% progress → 300, ≥90% → 100, ≥75% → 50, <75% → 0 (miss). This matches the current thresholds but without the easier spin requirement.

#### Scenario: 300 at full progress
- **WHEN** the player reaches 100% spinner progress
- **THEN** the judgement is 300

#### Scenario: Miss below 75%
- **WHEN** the player reaches <75% progress at spinner end
- **THEN** the judgement is 0 (miss)