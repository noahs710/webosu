# Tasks: full-osk-skin-support

## Phase 1: Name mapping + skin.ini parser (foundation)

- [ ] T1: Create `src/game/skin-loader.js` — the unified .osk skin loading module
  - OSK_NAME_MAP with ~30 entries (hitcircle→disc, sliderb0→sliderb, default-N→N, etc.)
  - `parseSkinIni(iniText)` → returns `{ cursorSize, cursorRotate, cursorExpand, comboColors, sliderBorder, sliderTrackOverride, hitCirclePrefix, scorePrefix, ... }`
  - `loadOsk(file)` → extracts .osk with fflate, parses skin.ini, creates blob URLs for all PNGs, maps names, returns `{ textures: Map, sounds: Map, config: object }`
  - `applySkin(skinData)` → overrides `window.Skin` entries, `game.sample` hitsounds, `game` config from skin.ini
  - `cacheSkin(skinData)` → stores raw buffers in IndexedDB
  - `loadCachedSkin()` → recreates blob URLs from IndexedDB cache

- [ ] T2: Integrate skin-loader into `initgame.js`
  - Call `loadCachedSkin()` before `applyCustomSkin()`
  - If cached skin exists, apply it (textures + sounds + config)
  - Keep existing `applyCustomSkin()` as fallback for old base64 skins in localforage

## Phase 2: Judgement images

- [ ] T3: Add judgement textures to `window.Skin` when skin is loaded
  - Add `hit0.png`, `hit50.png`, `hit100.png`, `hit300.png`, `hit300g.png` as PIXI textures
  - These don't exist in the default spritesheet — add them dynamically

- [ ] T4: Modify `playback.js` `createJudgement()` and `invokeJudgement()`
  - `createJudgement()`: If `Skin["hit300.png"]` exists, create `PIXI.Sprite` instead of `PIXI.Text`
  - `invokeJudgement()`: Set sprite texture based on points (0→hit0, 50→hit50, 100→hit100, 300→hit300 or hit300g)
  - Fall back to `PIXI.Text` when no judgement textures in Skin
  - Preserve existing animation timing (fade in/out, miss drop/rotate)

## Phase 3: Cursor trail + skin.ini cursor settings

- [ ] T5: Modify `launchgame.js` cursor trail
  - If `Skin["cursortrail.png"]` exists, use it as trail sprite texture
  - Fall back to cloned `cursor.png` when no skin

- [ ] T6: Apply skin.ini cursor settings
  - `CursorSize`: override `game.cursorSize` during gameplay
  - `CursorRotate`: add rotation animation to cursor in game loop
  - `CursorExpand`: add scale pulse on click input

## Phase 4: Combo/slider color overrides + @2x + animation

- [ ] T7: Apply skin.ini combo colors in `playback.js`
  - Override `combos` array with skin.ini `Combo1-8` when skin is loaded
  - Fall back to beatmap colors when no skin

- [ ] T8: Apply skin.ini slider colors in `playback.js`
  - Override `SliderTrackOverride` and `SliderBorder` with skin.ini values

- [ ] T9: @2x texture selection in `skin-loader.js`
  - When `devicePixelRatio > 1`, prefer `texture@2x.png` over `texture.png`

- [ ] T10: Animation frame support
  - Follow points: detect `followpoint-0.png` through `followpoint-N.png`, cycle in render loop
  - Slider ball: detect `sliderb0.png` through `sliderbN-1.png` (count from skin.ini `SliderBallFrames`), cycle

## Phase 5: UI + testing

- [ ] T11: Update settings page — unified .osk import
  - Single drop zone / file picker that accepts .osk files
  - Shows skin name (from skin.ini) and applied status
  - Replaces the separate hitsound import

- [ ] T12: Test with clearblack.osk and dokidoki.osk
  - Verify all game textures are applied
  - Verify hitsounds are loaded
  - Verify skin.ini colors are applied
  - Verify judgement images render
  - Verify cursor trail uses skin texture
  - Verify @2x textures load on high-DPI
  - Verify animation frames cycle
