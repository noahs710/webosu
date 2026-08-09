# pixi-asset-lifecycle Specification

## Purpose
TBD - created by archiving change fix-pixi-v8-cleanup. Update Purpose after archive.
## Requirements
### Requirement: Blob URL lifecycle
The system SHALL create blob URLs for extracted skin PNGs and revoke each URL after the corresponding `PIXI.Texture` is valid and uploaded to GPU, and SHALL destroy any replaced `window.Skin` texture with `destroy(false)` to prevent GPU leaks.

#### Scenario: Skin switch does not leak blob URLs
- **WHEN** a user imports a second `.osk` after a first
- **THEN** the previous skin's blob URLs are revoked and old textures destroyed

### Requirement: RenderTexture lifecycle
The background blur path SHALL create a `PIXI.RenderTexture` for the blurred background and destroy it with `destroy(true)` when the playback is destroyed or the background is replaced.

#### Scenario: Background texture cleaned on destroy
- **WHEN** `playback.destroy()` is called
- **THEN** `background.texture.destroy(true)` is called if the texture is a `RenderTexture`

### Requirement: Pixi v8 source handling
The system SHALL use `texture.source` (not `texture.baseTexture`) and `PIXI.Assets.load` for blob URLs to avoid `[Assets] not found in Cache` warnings, and SHALL use `renderer.render({container, target})` (v8) instead of `renderer.render(container, target)`.

#### Scenario: Background loads without warning
- **WHEN** a beatmap background `blob:` URL is loaded
- **THEN** no `[Assets] Asset id blob:... not found` warning appears and `bgTexture.valid` becomes true
