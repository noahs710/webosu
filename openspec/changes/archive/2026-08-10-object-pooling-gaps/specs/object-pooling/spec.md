## Specs

### object-pooling

- All gameplay sprites (hit circles, slider sub-sprites, hit bursts, judgements) SHALL be acquired from a texture-keyed pool and returned on despawn instead of being created and destroyed per hit
- The pool SHALL reassign `sprite.texture` on acquire if the pooled sprite's texture differs from the requested texture (handles skin switch + animation drift)
- The pool SHALL reset `rotation = 0` on acquire (prevents stale rotation from approach circles / reverse arrows)
- The pool SHALL be capped at 48 sprites per texture bucket; excess sprites are destroyed, not leaked
- The pool SHALL be drained (all sprites destroyed) on `playback.destroy()` (game quit/retry)

### judgement-images

- Judgements SHALL use a type-homogeneous pool (Sprite or Text), decided once at `populateHit` time based on `window.Skin["hit300.png"]` presence
- Sprite judgements SHALL be pooled by texture (like hit-circle sprites); Text judgements SHALL be pooled in a single bucket
- The `_pooledType` marker SHALL distinguish Sprite vs Text judgements for correct pool return on despawn