# T16 — Implement D9 animated judgements (`hit*-N.png` frames)

## Type
task (HITL — new feature, scope expansion beyond the mega-change)

## Question

T14 decided D9: **implement animated judgements** — load the `hit*-N.png` numbered frames per judgement type and play them as a `PIXI.AnimatedSprite` at `AnimationFramerate`. This is a real parity win (lazer's `LegacySkin.getJudgementAnimation` does this; webosu currently skips the frames and shows the static base texture). Skins like reowoTuna (the project default) ship animated judgement frames that are silently ignored today.

This graduates the map's "Not yet specified" fog item "`hit*-N.png` animated judgement implementation scope" into a real ticket.

### Implementation questions to resolve (HITL — grill the user or decide in-ticket)

1. **Sprite approach**: `PIXI.AnimatedSprite` (Pixi 8 built-in, plays a texture array at a set FPS) vs. per-frame `Texture.from` swap in the judgement's onRender. `AnimatedSprite` is cleaner; per-frame swap is more control. Recommend `AnimatedSprite`.
2. **`AnimationFramerate`**: lazer defaults to 60 FPS if the skin doesn't specify `AnimationFramerate` in skin.ini, else `1000/AnimationFrameDelay` (if the skin uses the per-frame delay key). Check what `skin-loader.js` already parses — does it read `AnimationFramerate`? If not, add the parse and default to 60.
3. **Memory budget**: animated judgement frames can be 10-60 per judgement type × 4-6 judgement types (hit0, hit50, hit100, hit300, hit300k, hit300g) = up to ~360 textures. Cap the frame count per type (e.g. 60 max, matching the followpoint/sliderb cap in `skin-filter.js`)? Or load all? The existing 300MB unzipped + 1000-entry limits still apply.
4. **Loader integration**: `skin-loader.js:188-189` currently skips `hit(0|50|100|300)[k]?-\d+\.png`. Remove the skip for these names (keep the skip for `followpoint`/`sliderb` numbered frames if they're handled separately — actually those ARE loaded per the `skin-filter.js` whitelist). Add the `hit*-N.png` frames to the whitelist (`skin-filter.js`).
5. **Judgement spawn integration**: `playback.js` `createJudgement` (line 704+) creates a `PIXI.Sprite` with the base texture. For animated judgements, when the judgement is shown (hit success / miss), swap to an `AnimatedSprite` playing the frames for that judgement type. The judgement sprite is pooled (`_spritePool`), so the AnimatedSprite needs pooling too — or the animation plays once and returns to the pool.
6. **Flag gating**: gate behind `FEATURES.skinConformance` (consistent with the other Track B skin changes) or ship ungated (it's a new feature, not a behavior change). Recommend gated — flip on after T04 conformance green.
7. **Fallback**: if a skin ships only the base `hit0.png` (no numbered frames), show the static sprite (current behavior). The animated path only activates when frames exist.

### Scope

- `src/game/skin-filter.js`: add `hit(0|50|100|300)[k]?-\d+\.png` to the whitelist (remove the intentional skip).
- `src/game/skin-loader.js`: remove the skip at line 188-189 for hit variants; load the frames; parse `AnimationFramerate` (default 60); group frames by judgement type (`hit0-0.png`, `hit0-1.png`, ... → `hit0` frames array).
- `src/game/playback.js` `createJudgement` / the hit-success spawn path: when the judgement type has frames, spawn an `AnimatedSprite` playing them at `AnimationFramerate`; else fall back to the static sprite.
- `src/game/features.js`: if gating, the `skinConformance` flag already exists — verify the animated path checks it.
- Tests: extend `test-lazer-parity.js` or add a headless test that a skin with `hit0-0.png` through `hit0-N.png` renders an `AnimatedSprite` (not a static `Sprite`).

### Acceptance

- Animated judgements render for skins that ship `hit*-N.png` frames (verify with reowoTuna — the project default skin — which ships these frames).
- Static fallback for skins that ship only the base texture.
- `AnimationFramerate` respected (default 60, or skin-specified).
- Memory cap enforced (frame count per type capped, or documented as uncapped within the 300MB limit).
- `npm run typecheck` + `npm test` + `npm run test:lazer` green.
- `npm run test:conformance` — goldens will shift (animated judgements render differently). Regenerate with `--update-golden` and commit with a note.
- `headless-play.js` 0 pageerrors.
- One-line Decisions-so-far entry on the map.

## Status
done

## Resolution

Commit `57c0ee1`. D9 animated judgements implemented: `skin-loader.js` adds `animationFramerate` parse + removes the hit*-N.png skip + groups frames into `window.Skin.__hitAnimFrames`. `playback.js invokeJudgement` creates a `PIXI.AnimatedSprite` when frames exist (>1), plays once at `animationFramerate/60` speed, falls back to static texture otherwise. Despawn cleans up the AnimatedSprite. Conformance goldens regenerated (whitecat 88→328 textures). typecheck 120/120, lazer parity 110/110, conformance 4/4, headless-play 0 pageerrors.

## Blocks

T12 (final validation)

## Blocked by

T03 (whitelist — done), T14 (D9 decision — closed)