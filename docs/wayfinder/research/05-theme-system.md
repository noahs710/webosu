# Research 05 — Theme system

Interprets against the provisional perf budget (ticket 09): shell-page CSS must be small and critical-path-light; the game page stays CSS-light. Evidence: `css/main.css` is 41 KB hand-written, `css/picnic.min.css` is 39 KB (an abandoned minimalist framework), and there are **no CSS custom properties / `:root` design tokens** — the recent "osu!lazer-style" theme is an additive override laid on top of picnic with ad-hoc color values. Comfortaa is the typeface (now correctly `@font-face` + Google Fonts after the latest fix).

## Options

| Approach | Critical-path CSS | Theming/dark-mode | JS runtime | Maintenance | Fit |
|---|---|---|---|---|---|
| **Plain CSS `@layer` + design tokens** | small (only what's used) | excellent (token swap) | none | you own it | **Recommended** |
| Tailwind v4 (engine) | small (purged) | built-in `dark:` | none (CSS engine) | active | good, adds build config + a mental model |
| Open Props | ~the token set | built-in | none | active | good as a token source, not a full system |
| keep/refactor picnic | 39 KB min + main.css | manual | none | **abandoned** | reject long-term |

All CSS-only options add **zero** runtime cost — theme choice is not FPS-sensitive as long as CSS stays small and off the game page. The real issue today is *no token layer*: the lazer look is hard to keep consistent without `--accent`, `--surface`, etc.

## Recommendation

**Plain CSS with `@layer` + a design-token `:root` block**, dropping picnic. The lazer palette becomes tokens; components reference tokens; dark mode is a token swap under `[data-theme="dark"]` (or `prefers-color-scheme`). Rationale: the shell is small enough that a framework (Tailwind) buys little but adds a build/mental-model dependency and a learning curve; plain CSS + tokens preserves the existing lazer look exactly, is the smallest critical path, and needs no JS runtime — directly serving the floor-device budget. Tailwind v4 is a fine alternative if the team already uses it; Open Props is a good ready-made token source to borrow from rather than author tokens cold.

### Token map to author (preserving the current lazer look, not redesigning)

```
:root {
  --bg, --bg-elevated, --surface;          /* lazer dark surfaces */
  --text, --text-muted, --text-dim;
  --accent, --accent-strong;              /* lazer pink/magenta */
  --combo-1..--combo-n;                   /* osu combo colors */
  --good, --ok, --miss;                   /* 300/100/50 hit judgement */
  --border, --border-strong;
  --radius, --shadow;
  font: Comfortaa weights 300/400/700;
}
[data-theme="dark"] { /* token overrides */ }
```

### Migration ordering (concrete)

1. Audit `main.css` for the actual lazer colors in use; encode them as tokens in a new `css/tokens.css`. Confirm no existing `:root` (verified: none).
2. Replace picnic's reset/layout primitives with a small modern reset (e.g. a ~1KB modern-normalize) + a few layout utilities — picnic's grid/buttons become ~20 lines of token-driven CSS.
3. Refactor `main.css` components to use `var(--token)` and `@layer base, components, utilities`. Split the 41 KB into per-area files if helpful; the build (ticket 02) concatenates and minifies.
4. Keep the game page on a **separate minimal stylesheet** — no shell theme CSS on the game page (it renders in Pixi; CSS only styles the pause menu/overlays HTML).
5. Keep the font setup (Comfortaa via `@font-face` + Google Fonts, `font-display: swap`), self-host the woff2 for offline/PWA rather than depending on the network on the floor device.

Cite primary sources: MDN `@layer`, Open Props token set, picnic.css (last release date / archived status).
