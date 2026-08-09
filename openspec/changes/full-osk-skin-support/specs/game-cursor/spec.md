# game-cursor

## ADDED Requirements

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
