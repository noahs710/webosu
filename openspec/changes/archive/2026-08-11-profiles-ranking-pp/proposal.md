## Why

webosu profiles are bare — a `/profile?u=X` query-param URL, a stat grid (plays/max score/combo/acc), and achievement badges. There's no profile picture, no recent plays list, no accumulated PP, and no ranking. To feel like a real osu! community, profiles need: clean `/u/USERNAME` URLs, PFP support, recent plays, total accumulated PP (computed from stored per-score PP), and a numbered ranking system matching osu!'s weighted-top-scores formula.

## What Changes

- **BREAKING**: Profile URL changes from `/profile?u=X` to `/u/:username` (redirect old URL for back-compat)
- Add `pfp_url` column to the `users` table (TEXT, nullable — image link, no upload)
- Add `pp` column to the `scores` table (REAL DEFAULT 0) — store computed PP at score-submission time
- Add `total_pp` column to the `users` table (REAL DEFAULT 0) — cached total PP for ranking
- Compute PP on score submission (server-side rosu-pp, already integrated) and store it in the scores row
- Add a `recalcTotalPP(userId)` function: osu! formula — weighted sum of top 100 scores by PP (`Σ pp_i × 0.95^(i-1)`) + bonus (`4100 × (1 - 0.9994^N)`)
- Call `recalcTotalPP` after each score submission (incremental) — keep it fast (one query + computation)
- Add `/api/profiles/:username/recent` endpoint — returns the last N scores with beatmap info (title, artist, version, grade, pp, mods, time)
- Add `/api/rankings` endpoint — returns users sorted by `total_pp` desc, with rank number, username, pfp_url, total_pp, country
- Add `/api/rankings/country/:country` — same but filtered by country
- ProfileCard redesign: PFP display (image link fallback to initials avatar), recent plays list, total PP display, global rank "#N", country rank
- User settings: add PFP URL field (image link) to the profile/settings page
- Nav: show the logged-in user's PFP + rank next to their username (like lazer)

## Capabilities

### New Capabilities
- `profile-rankings`: The /api/rankings endpoint, total_pp column, recalcTotalPP, and the ranked user list (global + country)
- `profile-recent-plays`: The /api/profiles/:username/recent endpoint and the recent-plays display on the profile
- `profile-pfp`: The pfp_url column + PFP display on profiles, leaderboard rows, and the Nav
- `pp-storage`: The pp column on scores + PP computed/stored at submission time

### Modified Capabilities
- (none — these are all new; the existing profile spec isn't in openspec/specs/)

## Impact

**Affected code:**
- `server/db.js`: migrate users (add pfp_url, total_pp) + scores (add pp); add recalcTotalPP, userScoresRecent, rankings queries
- `server/app.js`: compute PP on score submission, call recalcTotalPP; add /api/profiles/:username/recent, /api/rankings, /api/rankings/country/:country; add pfp_url to PUT /api/profile/me
- `src/vue/router.js`: add `/u/:username` route, redirect `/profile` to it
- `src/vue/pages/profile.js`: update to read `:username` param
- `src/vue/components/ProfileCard.vue`: add PFP, recent plays, total PP, rank display
- `src/vue/components/Nav.vue`: show PFP + rank for logged-in user
- `src/shell/api.js`: add rankings(), profileRecent() methods
- `src/vue/components/SettingsPanel.vue` (or a new profile-edit page): PFP URL input field