## Context

The project uses Tailwind CSS v3 with three config files: `tailwind.config.js`, `postcss.config.js`, and the `@tailwind` directives in `src/vue/styles.css`. Tailwind v4 eliminates all three config files — config moves into CSS via `@theme {}`, the build runs as a Vite plugin (`@tailwindcss/vite`), and builds are ~10x faster. The `lit` dependency (3.3.3) is still in `package.json` but unused since the Vue migration.

## Goals

1. Migrate from Tailwind v3 to v4 with zero visual changes
2. Delete `postcss.config.js` and `tailwind.config.js` — config moves into CSS
3. Remove `lit`, `postcss`, `autoprefixer` from dependencies
4. Add `@tailwindcss/vite` as the build plugin
5. Faster builds (~10x improvement)

## Non-Goals

- No visual/design changes — this is purely a build tooling migration
- No new Tailwind utilities or components
- No changes to game code or game CSS

## Decisions

### D1: @tailwindcss/vite plugin instead of PostCSS
**Decision**: Use `@tailwindcss/vite` (the official Tailwind v4 Vite plugin) instead of the PostCSS-based v3 approach.
**Rationale**: Tailwind v4 is designed as a Vite plugin, not a PostCSS plugin. This eliminates the need for `postcss.config.js` and `autoprefixer`. The Vite plugin is faster and integrates better with Vite's build pipeline.
**Alternative**: Keep PostCSS-based approach (not possible with v4 — v4 dropped PostCSS support).

### D2: @theme {} in CSS instead of tailwind.config.js
**Decision**: Move all Tailwind config (colors, fonts, border-radius) into `@theme {}` block in `src/vue/styles.css`.
**Rationale**: Tailwind v4 uses CSS-first configuration. The `@theme {}` block defines custom design tokens as CSS custom properties, which Tailwind then uses to generate utilities. This eliminates the need for a separate JS config file.
**Alternative**: Keep a JS config (not supported in v4 — v4 is CSS-first).

### D3: Remove lit dependency
**Decision**: Remove `lit` from `package.json` dependencies.
**Rationale**: The project migrated from lit web components to Vue 3. No code imports lit. It's dead weight in `node_modules` and `package.json`.

## Risks / Trade-offs

- [Tailwind v4 has breaking changes from v3] → The migration is straightforward for our usage (custom colors, basic utilities). No deprecated utilities are used.
- [PostCSS plugins from other packages might break] → We don't use any other PostCSS plugins. Only `autoprefixer` (bundled into Tailwind v4) and `tailwindcss` itself.
- [Build output might differ slightly] → Verify with `npm run build` + headless tests after migration.

## Migration Plan

1. Install `@tailwindcss/vite`, remove `lit`, `postcss`, `autoprefixer`
2. Add `@tailwindcss/vite()` to `vite.config.mjs` plugins
3. Update `src/vue/styles.css`: `@import "tailwindcss"` + `@theme {}` with lazer colors
4. Delete `postcss.config.js` and `tailwind.config.js`
5. Verify build + all tests pass
