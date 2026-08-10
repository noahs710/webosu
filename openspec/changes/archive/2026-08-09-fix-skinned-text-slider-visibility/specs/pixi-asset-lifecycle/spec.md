# pixi-asset-lifecycle

## MODIFIED Requirements

### Requirement: Pixi v8 source handling
The system SHALL use `texture.source` (not `texture.baseTexture`) with `PIXI.Assets.load({src: blobUrl, parser:"texture"})` for all `blob:` URLs (skins and `createBackground` background `blob:` via `Z.getBlob`), avoiding `[Assets] not found in Cache` / `could not be loaded as we don't know how to parse it`, and SHALL use `renderer.render({container, target})` (v8) instead of `renderer.render(container, target)`. `Assets.unload` SHALL NOT be called on `window.Skin` textures managed by `Assets`; overwrite only (avoids `A Texture managed by Assets was destroyed` and `FilterSystem split`).

#### Scenario: Background blob loads without warning
- **WHEN** a beatmap background `blob:` URL is loaded via `createBackground`
- **THEN** no `[Assets] blob:... was not found in the Cache` warning appears.

#### Scenario: Skin switch no unload warning
- **WHEN** a second `.osk` is applied after a first
- **THEN** no `A Texture managed by Assets was destroyed` warning appears.

### Requirement: Blob URL lifecycle
The system SHALL create blob URLs for extracted skin PNGs and revoke each URL after `valid` and `tex.source.once("update", () => URL.revokeObjectURL)` or `loaded` + timeout, without `Assets.unload` on overwrite, and SHALL NOT `destroy(false)` textures still referenced in `_defaultSkin`.

#### Scenario: Skin switch does not leak or double-destroy
- **WHEN** a user imports a second `.osk` after a first
- **THEN** blob URLs are revoked and `_defaultSkin` textures remain valid (no micro scaling).
