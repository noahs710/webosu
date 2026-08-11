## ADDED Requirements

### Requirement: PP stored at score submission
The system SHALL compute PP for each score at submission time using the server-side rosu-pp-js integration (lazer mode) and store it in a `pp` column on the scores table. Scores submitted without PP computation (legacy v1 scores) SHALL have `pp = 0`.

#### Scenario: PP computed on submit
- **WHEN** a v2 score is submitted with a valid beatmap (raw .osu available)
- **THEN** the server computes PP via `calcRosuPP` and stores it in the scores row's `pp` column

#### Scenario: Legacy scores have pp=0
- **WHEN** a v1 score exists in the database (pre-PP-storage)
- **THEN** its `pp` column is 0 and it doesn't contribute to the user's total PP

### Requirement: Total PP per user (osu! weighted formula)
The system SHALL compute each user's total PP using the osu! formula: weighted sum of top 100 scores by PP (`Σ pp_i × 0.95^(i-1)`) plus a bonus for score count (`4100 × (1 - 0.9994^N)`). The total SHALL be cached in a `total_pp` column on the users table and recalculated after each score submission.

#### Scenario: Total PP recalcs on submit
- **WHEN** a user submits a new score with PP > 0
- **THEN** the server recalculates the user's `total_pp` from their top 100 ranked scores

#### Scenario: Total PP with few scores
- **WHEN** a user has 3 ranked scores with PP 100, 80, 50
- **THEN** total_pp = (100 × 1.0) + (80 × 0.95) + (50 × 0.9025) + bonus for 3 scores

### Requirement: Profile URL /u/:username
The system SHALL serve profiles at `/u/:username` (clean URL). The old `/profile?u=X` URL SHALL redirect to `/u/:username` for back-compat.

#### Scenario: Clean profile URL
- **WHEN** a user visits `/u/alice`
- **THEN** the profile page loads for user "alice"

#### Scenario: Old URL redirects
- **WHEN** a user visits `/profile?u=alice`
- **THEN** they are redirected to `/u/alice`

### Requirement: Profile picture via image link
The system SHALL support a `pfp_url` field on the users table (TEXT, nullable). The user can set it via the profile settings. The profile card, leaderboard rows, and Nav SHALL display the PFP image. If `pfp_url` is null or the image fails to load, an initials avatar (first letter of username in a colored circle) SHALL be shown.

#### Scenario: PFP displayed on profile
- **WHEN** a user has `pfp_url = "https://imgur.com/example.png"` and their profile is viewed
- **THEN** the image is displayed as their profile picture

#### Scenario: Initials avatar fallback
- **WHEN** a user has no `pfp_url` or the image URL 404s
- **THEN** an initials avatar with the first letter of their username in a colored circle is displayed

### Requirement: Recent plays on profile
The system SHALL provide a `/api/profiles/:username/recent` endpoint returning the last N scores (default 20) for that user, including beatmap info (title, artist, version), grade, pp, mods, score, and timestamp. The profile card SHALL display this as a recent-plays list.

#### Scenario: Recent plays displayed
- **WHEN** a user's profile is viewed and they have submitted scores
- **THEN** the profile shows their most recent plays with beatmap title, grade, PP, and mods

#### Scenario: Empty recent plays
- **WHEN** a user has no scores
- **THEN** the profile shows "No recent plays yet"

### Requirement: Global and country rankings
The system SHALL provide `/api/rankings` (global) and `/api/rankings/country/:country` endpoints returning users sorted by `total_pp` desc, with rank number, username, pfp_url, total_pp, and country. The profile card SHALL display the user's global rank as "#N".

#### Scenario: Global ranking
- **WHEN** `/api/rankings` is queried
- **THEN** users are returned sorted by total_pp desc, with their rank position

#### Scenario: Country ranking
- **WHEN** `/api/rankings/country/US` is queried
- **THEN** only users with country="US" are returned, sorted by total_pp desc

#### Scenario: Rank displayed on profile
- **WHEN** a user has total_pp > 0 and their profile is viewed
- **THEN** their global rank "#N" is displayed