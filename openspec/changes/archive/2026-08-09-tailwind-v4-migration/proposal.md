## Why

The project uses Tailwind CSS v3 with `postcss.config.js` + `tailwind.config.js` + `autoprefixer` — three config files. Tailwind v4 eliminates all three: config moves into CSS via `@theme {}`, the build runs as a Vite plugin (`@tailwindcss/vite`), and builds are 10x faster. The `lit` dependency is also still in `package.json` but unused (Vue replaced it).

## What Changes

- **Install `@tailwindcss/vite`** — replaces `tailwindcss` + `postcss` + `autoprefixer` as build plugins
- **Delete `postcss.config.js`** — no longer needed (Tailwind v4 is a Vite plugin, not a PostCSS plugin)
- **Delete `tailwind.config.js`** — config moves into `src/vue/styles.css` via `@theme {}`
- **Update `src/vue/styles.css`** — replace `@tailwind base/components/utilities` with `@import "tailwindcss"`, move color config into `@theme {}`
- **Update `vite.config.mjs`** — add `@tailwindcss/vite` to plugins array
- **Remove `lit` from dependencies** — unused since Vue migration
- **Remove `postcss` and `autoprefixer` from devDependencies** — no longer needed

## Capabilities

### New Capabilities
(none — this is a build tooling migration, not a new feature)

### Modified Capabilities
(none — no spec-level behavior changes)

## Impact

- `package.json`: remove `lit`, `postcss`, `autoprefixer`; add `@tailwindcss/vite`
- `vite.config.mjs`: add `@tailwindcss/vite()` to plugins
- `src/vue/styles.css`: `@import "tailwindcss"` + `@theme {}` replaces `@tailwind` directives + JS config
- `postcss.config.js`: deleted
- `tailwind.config.js`: deleted
- No game code changes — this is purely build tooling
