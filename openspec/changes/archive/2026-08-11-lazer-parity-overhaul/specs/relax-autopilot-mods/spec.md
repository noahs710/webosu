## ADDED Requirements

### Requirement: Relax mod
The Relax (RX) mod SHALL automatically register a hit when the cursor is within the hit window of an unhit circle or slider start, without requiring the player to press a key. The player still controls the cursor position. Keyboard/mouse input SHALL be ignored for hit registration while RX is active.

#### Scenario: Auto-click on cursor over circle
- **WHEN** RX is active and the cursor is within `circleRadius` of an unhit circle within the MehTime window
- **THEN** the hit is registered as if the player clicked, without a keypress

#### Scenario: Player still moves cursor
- **WHEN** RX is active
- **THEN** the cursor follows the player's mouse/touch input (no auto-cursor)

### Requirement: AutoPilot mod
The AutoPilot (AP) mod SHALL automatically move the cursor to each hit object's position at the hit time, following the lazer `AutoPilotMovement` curve. The player SHALL still press keys to register hits. The cursor SHALL not require mouse/touch input while AP is active.

#### Scenario: Cursor auto-moves to hit objects
- **WHEN** AP is active and the next hit object is a circle at (x, y) at time t
- **THEN** the cursor moves to (x, y) by time t following the lazer easing curve

#### Scenario: Player still presses keys
- **WHEN** AP is active and the cursor is on an unhit circle within the hit window
- **THEN** the hit is registered only when the player presses a key (no auto-click)

### Requirement: Relax and AutoPilot score multipliers
RX and AP SHALL each apply the lazer score multiplier (0x, meaning they make the score unranked/for-fun, matching lazer where Relax and AutoPilot have a 0x multiplier and produce unranked scores).

#### Scenario: Relax unranked
- **WHEN** RX is active and a score is submitted
- **THEN** the score is marked unranked (multiplier 0x) and does not appear on the ranked leaderboard

#### Scenario: AutoPilot unranked
- **WHEN** AP is active and a score is submitted
- **THEN** the score is marked unranked (multiplier 0x) and does not appear on the ranked leaderboard