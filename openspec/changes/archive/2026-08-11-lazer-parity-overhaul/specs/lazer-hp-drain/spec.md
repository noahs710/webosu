## ADDED Requirements

### Requirement: Lazer passive HP drain
The HP drain SHALL use the lazer passive-drain model where HP decreases continuously over time at a rate derived from `HPDrainRate` and the lazer `HpMultiplier` table, not the stable approximation. The drain rate SHALL be `lazerDrainRate(HPDrainRate)` applied per millisecond of gameplay.

#### Scenario: HP drains during gameplay
- **WHEN** the player is playing (not on a break) and no judgement occurs
- **THEN** HP decreases continuously at the lazer drain rate

#### Scenario: HP drain matches lazer table
- **WHEN** a map has HPDrainRate=8
- **THEN** the passive drain rate matches the lazer `HpMultiplier` value for HP=8, not the stable `0.00001 * HPdrain` approximation

### Requirement: Lazer per-judgement HP changes
Each judgement (300/100/50/miss, tick, slider edge) SHALL change HP by the lazer `HpMultiplier` amounts: 300 increases by `lazerHpGain(300, HPdrain)`, miss decreases by `lazerHpMiss(HPdrain)`, etc., using the lazer tables rather than the stable `0.01 * (10.2 - HPdrain)` formula.

#### Scenario: 300 increases HP by lazer amount
- **WHEN** the player hits a 300 on a map with HPdrain=5
- **THEN** HP increases by the lazer `HpMultiplier[300]` for HP=5, not `0.01 * (10.2 - 5)`

#### Scenario: Miss decreases HP by lazer amount
- **WHEN** the player misses on a map with HPdrain=5
- **THEN** HP decreases by the lazer `HpMultiplier[miss]` for HP=5

### Requirement: NoFail clamps HP to 0
When NoFail is active, HP SHALL not drop below 0 and the player SHALL not fail from HP loss, matching lazer.

#### Scenario: NoFail prevents HP death
- **WHEN** NoFail is active and HP would drop below 0
- **THEN** HP is clamped to 0 and the player does not fail