# game-cursor

## Requirements

### REQ-001: Cursor trail texture from skin
When a skin contains `cursortrail.png`, the game SHALL use it as the cursor trail texture instead of cloning the `cursor.png` sprite. When no skin is loaded, the game SHALL fall back to the current behavior (cloned cursor sprite).

### REQ-002: CursorSize from skin.ini
When `skin.ini` specifies `CursorSize`, the game SHALL override the user's cursor size setting with the skin's value during gameplay.

### REQ-003: CursorRotate from skin.ini
When `skin.ini` specifies `CursorRotate: 1`, the cursor sprite SHALL rotate continuously during gameplay. When `CursorRotate: 0` (default), the cursor SHALL not rotate.

### REQ-004: CursorExpand from skin.ini
When `skin.ini` specifies `CursorExpand: 1`, the cursor sprite SHALL expand on click input. When `CursorExpand: 0`, the cursor SHALL not expand.
