# build-tooling

## ADDED Requirements

### Requirement: Tailwind v4 Vite build
The build system SHALL use `@tailwindcss/vite` as a Vite plugin instead of PostCSS, and the CSS SHALL import Tailwind via `@import "tailwindcss"` with theme tokens defined in `@theme {}`. The legacy files `postcss.config.js` and `tailwind.config.js` SHALL not exist and the `postcss`/`autoprefixer`/`lit` dependencies SHALL be removed.

#### Scenario: Build uses Vite plugin
- **WHEN** `vite build` runs
- **THEN** Tailwind styles are generated via `@tailwindcss/vite` without PostCSS config files and the build succeeds

#### Scenario: No legacy config files
- **WHEN** the repository is inspected
- **THEN** `postcss.config.js` and `tailwind.config.js` are absent and `package.json` does not list `postcss`, `autoprefixer`, or `lit`
