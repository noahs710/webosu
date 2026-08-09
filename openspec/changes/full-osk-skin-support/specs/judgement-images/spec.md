# judgement-images

## ADDED Requirements

### Requirement: Judgement sprite rendering
When a skin is loaded with judgement images (`hit0.png`, `hit50.png`, `hit100.png`, `hit300.png`), the game SHALL render judgements as `PIXI.Sprite` using those textures instead of `PIXI.Text`.

#### Scenario: Judgements render as sprites with skin
- **WHEN** a skin containing `hit300.png` is loaded and a 300 judgement is triggered
- **THEN** a `PIXI.Sprite` with `hit300.png` texture is displayed

### Requirement: Judgement image mapping
The system SHALL map judgement results to skin images as follows: 0 (miss) → `hit0.png`, 50 → `hit50.png`, 100 → `hit100.png`, 300 → `hit300.png`, 300 with full combo (perfect) → `hit300g.png` (if present in skin).

#### Scenario: Points map to correct judgement image
- **WHEN** a 50 judgement is invoked with a skin loaded
- **THEN** the sprite texture becomes `hit50.png`

#### Scenario: Perfect 300 uses hit300g.png
- **WHEN** a 300 is judged with full combo and `hit300g.png` exists
- **THEN** the texture is `hit300g.png` instead of `hit300.png`

### Requirement: Text fallback
When no skin is loaded or judgement images are not present in the skin, the game SHALL fall back to the current `PIXI.Text` rendering with text ("miss", "meh", "good", "great") and hardcoded colors.

#### Scenario: Fallback to text without skin
- **WHEN** no skin is loaded and a judgement is triggered
- **THEN** `PIXI.Text` displays the judgement word with its fixed color

### Requirement: Judgement animation
The judgement sprite SHALL use the same animation timing as the current text judgement: fade in (100ms), hold, fade out. Miss judgements SHALL drop and rotate as currently implemented.

#### Scenario: Sprite follows text timing
- **WHEN** a judgement sprite is displayed
- **THEN** it fades in 100ms, remains visible, then fades out over 400ms per current timing, with miss drop/rotate preserved
