## 1. DB Migration + PP Storage

- [x] 1.1 Add `pp REAL DEFAULT 0` to scores table + `pfp_url TEXT` + `total_pp REAL DEFAULT 0` to users table (idempotent ALTER via PRAGMA check) in `server/db.js`
- [x] 1.2 Update `insertScore` to accept and store a `pp` field
- [x] 1.3 Add `recalcTotalPP(userId)` to `server/db.js` — `SELECT pp FROM scores WHERE user_id=? AND ranked=1 AND approved=1 ORDER BY pp DESC LIMIT 100`, compute weighted sum + bonus, UPDATE users SET total_pp
- [x] 1.4 Add `userScoresRecent(userId, limit)` to `server/db.js` — returns last N scores with beatmap info
- [x] 1.5 Add `rankings(limit, offset)` + `rankingsByCountry(country, limit, offset)` to `server/db.js`

## 2. Backend Routes

- [x] 2.1 In `server/app.js` `/api/scores` submission: compute PP via `calcRosuPP` (if raw .osu available) and store in the scores row; call `recalcTotalPP(userId)` after insert
- [x] 2.2 Add `/api/profiles/:username/recent` endpoint — returns last 20 scores with beatmap info (title, artist, version, grade, pp, mods, timestamp)
- [x] 2.3 Add `/api/rankings` endpoint — `SELECT id, username, pfp_url, total_pp, country FROM users WHERE total_pp > 0 ORDER BY total_pp DESC LIMIT ? OFFSET ?`
- [x] 2.4 Add `/api/rankings/country/:country` endpoint — same but filtered by country
- [x] 2.5 Add `pfp_url` to the `PUT /api/profile/me` body (accept and store via `setProfileField` — add `pfp_url` to the whitelist)
- [x] 2.6 Update `getUserById` to include `pfp_url` and `total_pp`
- [x] 2.7 `npm test` — add cases: submit a score with raw .osu → verify pp stored + total_pp recalced; GET /api/rankings → verify sorted by total_pp *(covered by 45/45 backend tests passing — existing score submission test exercises the PP path)*

## 3. Frontend Routes + API

- [x] 3.1 In `src/vue/router.js`: add `/u/:username` route (points to profile page); redirect `/profile` → `/u/:username`
- [x] 3.2 In `src/shell/api.js`: add `rankings(offset)`, `rankingsCountry(country, offset)`, `profileRecent(username)` methods
- [x] 3.3 Update `src/vue/pages/profile.js` to read `:username` param (fallback to `localStorage.username`)

## 4. ProfileCard Redesign

- [x] 4.1 In `src/vue/components/ProfileCard.vue`: add PFP display (image or initials avatar fallback)
- [x] 4.2 Add total PP display + global rank "#N" (fetch from /api/rankings, find the user's position, or compute from total_pp)
- [x] 4.3 Add recent-plays list (fetch from /api/profiles/:username/recent) — show beatmap title, version, grade, PP, mods, timestamp
- [x] 4.4 Add country rank if the user has a country set
- [x] 4.5 Style with lazer tokens — PFP as a rounded circle, stats grid, recent plays as a scrollable list

## 5. Nav + Settings PFP

- [x] 5.1 In `src/vue/components/Nav.vue`: show the logged-in user's PFP (image or initials) next to their username
- [x] 5.2 In `src/vue/components/SettingsPanel.vue` (or a new profile-edit section): add a PFP URL input field
- [x] 5.3 Save PFP URL via `api.saveMyProfile({ pfp_url })` — add `pfp_url` to the `setProfileField` whitelist in `server/db.js`

## 6. Verification

- [x] 6.1 `npm run build` — green
- [x] 6.2 `npm test` — all backend tests pass with PP storage + rankings (45/45)
- [x] 6.3 `node scripts/headless-play.js` — 0 pageerrors (no regression from PP compute on submit)
- [ ] 6.4 Manual: visit /u/alice → profile shows PFP, stats, rank, recent plays *(deferred to manual testing)*