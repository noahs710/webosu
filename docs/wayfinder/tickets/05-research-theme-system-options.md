# 05 — research: theme system

Type: `wayfinder:research`
Blocked by: `09-grilling-perf-budget.md`.

## Question

What replaces picnic.css (abandoned upstream) + the hand-written 41KB `main.css` while keeping the osu!lazer look and **not** bloating the critical path on the floor device?

Evaluate **Tailwind v4** (engine), **Open Props**, **plain CSS `@layer`** + design tokens, and **keep/refactor picnic**. For each report: bundle weight / critical-path bytes, theming + dark-mode support, maintenance status, whether it pulls in a JS runtime, and how it composes with the game page (which must stay CSS-light). Note the current theme is a lazer-style additive override added recently and is "unpolished but in a good direction."

Recommend one and sketch a token map for the lazer palette (background, accent, combo colors, surface, text) so the existing lazer look is preserved, not redesigned. Cite primary sources.


## Resolution

Findings: `research/05-theme-system.md`. **Recommendation:** drop picnic.css (abandoned) and the ad-hoc color values; adopt plain CSS `@layer` + a `:root` design-token block encoding the current lazer palette (no existing tokens were found), with dark mode as a token swap. Keep the game page on a separate minimal stylesheet (no shell theme CSS on the game page). Keep Comfortaa, self-host the woff2 for offline/PWA. No JS runtime; smallest critical path. Tailwind v4 is a fine alternative if the team already uses it.
