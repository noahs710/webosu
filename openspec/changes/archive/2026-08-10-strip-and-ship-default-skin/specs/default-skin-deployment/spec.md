## Specs

### default-skin-deployment

- The build pipeline SHALL strip the default .osk to gameplay-only textures + hitsounds + skin.ini before shipping
- The Dockerfile SHALL download the default skin from a configurable build arg URL if the file is not present in the build context
- The build SHALL fail if the default skin is missing after the download + strip steps
- The stripped .osk SHALL be served at `/skins/default.osk` with a 24-hour cache header
- The stripped .osk SHALL be functionally identical to the full .osk when loaded by the client (same gameplay textures, same skin.ini config)