# judgement-images

## Requirements

### REQ-001: Judgement sprite rendering
When a skin is loaded with judgement images (`hit0.png`, `hit50.png`, `hit100.png`, `hit300.png`), the game SHALL render judgements as `PIXI.Sprite` using those textures instead of `PIXI.Text`.

### REQ-002: Judgement image mapping
The system SHALL map judgement results to skin images as follows:
- 0 (miss) → `hit0.png`
- 50 → `hit50.png`
- 100 → `hit100.png`
- 300 → `hit300.png`
- 300 with full combo (perfect) → `hit300g.png` (if present in skin)

### REQ-003: Text fallback
When no skin is loaded or judgement images are not present in the skin, the game SHALL fall back to the current `PIXI.Text` rendering with text ("miss", "meh", "good", "great") and hardcoded colors.

### REQ-004: Judgement animation
The judgement sprite SHALL use the same animation timing as the current text judgement: fade in (100ms), hold, fade out. Miss judgements SHALL drop and rotate as currently implemented.
