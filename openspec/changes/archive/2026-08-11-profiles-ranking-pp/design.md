## Context

webosu has a basic profile system: `/profile?u=X` query-param URL, a stat grid (plays/max score/max combo/avg acc), and achievement badges. The backend (`server/db.js`) has `userStats()` (aggregate counts) and `recentScores()` (global recent, not per-user). PP is computed on display (frontend calls `/api/pp/rosu`) but never stored. There's no ranking system, no PFP, and no per-user recent plays. The `users` table has `country` and `bio` columns (unused). The `scores` table has no `pp` column. The lazer-parity-overhaul change already integrated rosu-pp-js on the server with `lazer: true` mode.

## Goals / Non-Goals

**Goals:**
- Clean `/u/USERNAME` URLs
- PFP support via image links (no upload)
- Store PP at score-submission time, compute total PP per user
- Numbered ranking system (global + country) matching osu!'s weighted-top-scores formula
- Recent plays displayed on the profile
- ProfileCard redesign with PFP, rank, total PP, recent plays

**Non-Goals:**
- PFP upload (link only — keeps Fly.io-alone constraint)
- Real-time rank updates (recalc on submit is sufficient)
- Performance points for non-osu! rulesets
- Country detection from IP (use the existing `country` column, user-set)
- Per-mod-combination ranking (the leaderboard already handles that; this is global PP ranking)

## Decisions

### Decision 1: Store PP at submission time, not on display

Compute PP on the server during `/api/scores` submission using the already-integrated rosu-pp-js (`server/pp.js` `calcRosuPP` with `lazer: true`). Store it in a new `pp` column on the scores table. This means PP is always available for ranking without a recalculation pass.

**Why over display-time:** ranking requires aggregating PP across all users — can't do that if PP is only computed per-display. Storing it makes the ranking query a simple `SELECT ... ORDER BY total_pp DESC`.

**Alternative:** compute PP lazily and cache in a `user_pp_cache` table. Rejected — more complex, stale-prone, and the server already has rosu-pp.

### Decision 2: osu! total PP formula (weighted top-100 + bonus)

```
total_pp = Σ (pp_i × 0.95^(i-1))  for i=1..N (sorted by pp desc, N=top 100)
         + 4100 × (1 - 0.9994^N)   (bonus for total score count)
```

This is the exact osu! formula. `N` is the number of ranked scores the user has.

**Why not sum-of-all-PP:** osu!'s weighted formula rewards a deep score pool (the bonus) without letting spam scores inflate rank. Sum-of-all would rank a player who plays 1000 easy maps above one who plays 100 hard maps.

**Recalc strategy:** recalc on each score submission (incremental). The query is `SELECT pp FROM scores WHERE user_id=? AND ranked=1 AND approved=1 ORDER BY pp DESC LIMIT 100` — fast on node:sqlite with the existing indexes. The bonus uses `COUNT(*)` of all ranked scores.

### Decision 3: PFP via image link (no upload)

Add `pfp_url TEXT` to the `users` table. The user provides a URL in the settings. If empty, render an initials avatar (first letter of username in a colored circle).

**Why no upload:** Fly.io-alone constraint (no object storage). Image links are free, don't bloat the DB, and let users use any host (imgur, GitHub, Discord CDN). The risk is link rot — mitigated by a fallback initials avatar.

### Decision 4: /u/:username route, redirect /profile

Add `/u/:username` as the primary profile route. Keep `/profile` as a redirect to `/u/:username` for back-compat (old links).

### Decision 5: Rankings query — cached total_pp column

Add `total_pp REAL DEFAULT 0` to the `users` table. Recalc on each score submission. The `/api/rankings` query is then `SELECT id, username, pfp_url, total_pp, country FROM users WHERE total_pp > 0 ORDER BY total_pp DESC LIMIT ? OFFSET ?`. The user's rank is their position in this list.

**Alternative:** compute total_pp on the fly per ranking query. Rejected — a `GROUP BY user_id` + weighted sum across all scores per user is expensive; the cached column is one index scan.

## Risks / Trade-offs

- **[PP drift]** If rosu-pp-js updates or lazer mode changes, stored PP values become stale. → Mitigation: accept the drift; PP recalcs only on new submissions, not retroactively. A full recalc tool can be added later.
- **[total_pp recalc cost]** Recalc on every submission is O(N log N) per user (sort top 100). → Mitigation: it's one query + simple loop; on node:sqlite with ~1000 scores per user it's sub-millisecond.
- **[PFP link rot]** Image links may 404 over time. → Mitigation: `@error` on the `<img>` swaps to the initials avatar.
- **[Country data]** The `country` column exists but isn't populated by users today. → Mitigation: add a country input to settings; default to null (no country ranking until set).

## Migration Plan

1. **DB migration:** `ALTER TABLE users ADD COLUMN pfp_url TEXT; ADD COLUMN total_pp REAL DEFAULT 0;` + `ALTER TABLE scores ADD COLUMN pp REAL DEFAULT 0;` (idempotent via PRAGMA check, like the existing migration pattern).
2. **Backfill PP:** for existing scores, PP stays 0 until a new score is submitted (or a one-time backfill script runs). Not critical — existing scores are v1 anyway and unranked in v2.
3. **No rollback** — the columns are additive.