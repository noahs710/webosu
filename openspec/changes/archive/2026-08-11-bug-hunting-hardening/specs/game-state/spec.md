## MODIFIED Requirements

### Requirement: `quitGame` clears stale game-state references
The system SHALL reset `window.playback` and the `window.game.scene`, `window.game.cursorLayer`, `window.game.cursor`, `window.game.cursorTrail`, and `window.game.cursorTrailHead` references inside `quitGame` so that a subsequent `launchGame` starts from a known-clean state.

#### Scenario: Re-launching after a successful quit
- **WHEN** the user quits a beatmap and immediately picks a different one
- **THEN** `window.playback` is `null`, `window.game.scene` is `null`, and the cursor references are `null`/`0` so the new `Playback` instance can rebuild them without touching destroyed Pixi objects

#### Scenario: Re-launching after a failed launch
- **WHEN** `launchGame` errors out before `window.app` is created but after `window.game` is partially populated
- **THEN** `quitGame` does not throw while clearing references (the reset block is wrapped in `try/catch`)

### Requirement: `Playback` constructor returns early on empty beatmaps
The system SHALL exit the `Playback` constructor immediately when `self.hits.length === 0` so that the constructor does not fall through into the `else` branch and dereference `self.hits[0].time`.

#### Scenario: Loading a beatmap with no hit objects
- **WHEN** the worker reports an empty `hitObjects` array
- **THEN** the constructor logs `gerror("playback", "empty beatmap — no hit objects")`, sets `endTime = 0`, `wait = 0`, `skipTime = 0`, and returns without throwing

#### Scenario: Game loop receives the partially-initialized instance
- **WHEN** the game loop ticks the empty-beatmap `Playback`
- **THEN** no `TypeError` is thrown; the loop harmlessly ticks against the zeroed-out state and the loading overlay stays up
