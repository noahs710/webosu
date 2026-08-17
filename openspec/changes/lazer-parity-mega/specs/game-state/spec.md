# game-state Delta — lazer-parity-mega

## ADDED Requirements

### Requirement: Game state exposes HP drain model
GameState SHALL expose `GameState.get("hp.drainRate")` (per-map computed, in HP/ms) and `GameState.get("hp.current")` (0.0–1.0) as the canonical HP state. Legacy `window.game.hp` SHALL be kept in sync via `syncLegacy()` for existing renderers.

#### Scenario: Drain rate computed at beatmap load
- **WHEN** a beatmap is loaded in `beatmap-worker.js`
- **THEN** `GameState.set("hp.drainRate", computedRate)` is called before gameplay starts

#### Scenario: Legacy hp field stays in sync
- **WHEN** `GameState.set("hp.current", 0.42)` is called during gameplay
- **THEN** `window.game.hp` becomes `0.42`

### Requirement: HP drain pauses during break periods
The passive HP drain SHALL pause during `[Break]` periods defined in the beatmap, during the pre-first-object lead-in, and SHALL NOT pause during gameplay. Drain SHALL resume immediately when the break ends.

#### Scenario: Drain pauses during break
- **WHEN** current time is within a `[Break]` event's time range
- **THEN** HP does not passively drain

#### Scenario: Drain resumes after break
- **WHEN** a `[Break]` event ends
- **THEN** HP drain resumes at the same `hp.drainRate`

### Requirement: Per-map drain rate computed by binary search
The passive drain rate SHALL be computed per-map via a binary search targeting lazer's invariant: "a perfect play ends at near-zero HP just before the final object." The rate SHALL be cached keyed by `(beatmapId, modHash)` to avoid re-compute on replays.

#### Scenario: Drain rate computed on first load
- **WHEN** a beatmap is played for the first time with a given mod combination
- **THEN** the binary search runs inside `beatmap-worker.js` and produces a `hp.drainRate` value

#### Scenario: Drain rate reused on repeat play
- **WHEN** the same beatmap is replayed with the same mods
- **THEN** the cached `hp.drainRate` is reused without recomputation

### Requirement: No single-hit HP loss cap
The legacy `Math.max(hpDelta, -0.1)` cap on single-hit HP loss SHALL be removed. The full `lazerHpTables.Miss[HP]` value SHALL be applied per miss.

#### Scenario: HP 10 miss applies full -0.2 delta
- **WHEN** a miss occurs on a map with HP Difficulty 10
- **THEN** HP drops by `lazerHpTables.Miss.HP10` (approximately -0.2), not capped at -0.1

### Requirement: Last-combo HP bonus applied
When the last object of a combo is judged, `LAZER_LAST_COMBO_BONUS[result]` SHALL be added to the HP delta: `+0.07` for Great, `+0.05` for Ok, `+0.03` for Meh, `0` for Miss.

#### Scenario: Last great in combo grants +0.07
- **WHEN** the object ending a combo is judged 300
- **THEN** HP increases by `lazerHpTables.Great` + 0.07

#### Scenario: Last miss in combo grants no bonus
- **WHEN** the object ending a combo is judged miss
- **THEN** HP decreases by `lazerHpTables.Miss` only (no last-combo bonus)

### Requirement: Spinner bonus rotations grant LargeBonus score
When a spinner completes (clear RPM reached) and the player continues to spin, each additional full rotation up to the `complete` RPM SHALL grant a `LargeBonus` score event.

#### Scenario: Bonus rotation adds score
- **WHEN** a player spins faster than `clear` RPM and reaches one additional full rotation
- **THEN** score increases by `lazerHpTables.LargeBonus` (1000 before multipliers)

### Requirement: Edge misses recorded as LargeTickMiss
Slider edge (repeat or tail) misses SHALL be recorded as `HitResult.LargeTickMiss` events — affecting accuracy (as 30-max result with 0 value), HP (via `lazerHpTables.LargeTickMiss`), and combo (resets combo).

#### Scenario: Edge miss drops accuracy
- **WHEN** a slider tail is missed (cursor outside follow circle at end time)
- **THEN** the miss is recorded, accuracy drops by 30/maxJudgeTotal, and combo resets

#### Scenario: Edge miss applies HP delta
- **WHEN** an edge miss occurs
- **THEN** HP decreases by `lazerHpTables.LargeTickMiss[HP]`
