## MODIFIED Requirements

### Requirement: Cursor trail texture from skin
When a skin contains `cursortrail.png`, the game SHALL use it as the cursor trail texture instead of cloning the `cursor.png` sprite. When no skin is loaded, the game SHALL fall back to the current behavior (cloned cursor sprite).

#### Scenario: Trail uses skin cursortrail.png
- **WHEN** a skin with `cursortrail.png` is loaded
- **THEN** the cursor trail renders using `cursortrail.png` texture

#### Scenario: Trail falls back to cursor.png
- **WHEN** no skin is loaded or `cursortrail.png` is absent
- **THEN** the trail uses a cloned `cursor.png` sprite

### Requirement: CursorSize from skin.ini
When `skin.ini` specifies `CursorSize`, the game SHALL override the user's cursor size setting with the skin's value during gameplay.

#### Scenario: Skin CursorSize overrides game setting
- **WHEN** `skin.ini` contains `CursorSize: 1.2` and a skin is loaded
- **THEN** the in-game cursor scale uses `1.2` instead of `game.cursorSize`

### Requirement: CursorRotate from skin.ini
When `skin.ini` specifies `CursorRotate: 1`, the cursor sprite SHALL rotate continuously during gameplay. When `CursorRotate: 0` (default), the cursor SHALL not rotate.

#### Scenario: Cursor rotates when enabled
- **WHEN** `skin.ini` has `CursorRotate: 1`
- **THEN** the cursor sprite rotation increments each frame

### Requirement: CursorExpand from skin.ini
When `skin.ini` specifies `CursorExpand: 1`, the cursor sprite SHALL expand on click input. When `CursorExpand: 0`, the cursor SHALL not expand.

#### Scenario: Cursor expands on click
- **WHEN** `skin.ini` has `CursorExpand: 1` and mouse is down
- **THEN** the cursor scales to 1.3× and eases back to 1.0 on release

### Requirement: CursorCentre from skin.ini
When `skin.ini` specifies `CursorCentre: 0`, the cursor anchor SHALL be `0,0` (top-left) instead of `0.5,0.5` (center). The game SHALL respect this for both cursor and trail sprites.

#### Scenario: Cursor anchor respects CursorCentre
- **WHEN** `skin.ini` has `CursorCentre: 0`
- **THEN** `game.cursor.anchor` and `game.cursorTrail` sprites use `0,0`

### Requirement: Cursor position consistency for clicks and sliders
The cursor position used for hit-object click judgement (`checkClickdown`) SHALL be the predicted position (`game.mouse(realtime)`) — the same position used for slider following — so that clicks and sliders use a single consistent cursor position, matching lazer's single-cursor-position model. A `?legacyinput=1` flag SHALL be available during development to A/B test against the old lagged-position behavior.

#### Scenario: Click uses predicted position
- **WHEN** the player clicks and `checkClickdown` runs
- **THEN** the click position is `game.mouse(this.realtime)` (predicted), not the raw `game.mouseX/Y` (lagged)

#### Scenario: Click and slider use same position
- **WHEN** the player is following a slider and clicks a nearby circle
- **THEN** both the slider following and the circle click use the same predicted cursor position

#### Scenario: Legacy input flag restores old behavior
- **WHEN** `?legacyinput=1` is in the URL
- **THEN** `checkClickdown` uses the raw `game.mouseX/Y` (the old lagged behavior) for A/B testing