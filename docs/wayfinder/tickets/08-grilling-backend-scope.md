# 08 — grilling: backend scope

Type: `wayfinder:grilling` (HITL)

## Question

Is the webosu backend (Express 4 + `ws` + `bcryptjs` + `jsonwebtoken`, file/SQLite DB, deployed to Fly.io) in scope for this modernization, or is this effort frontend-only?

- **Frontend-only** — modernize build/deps/architecture/theme/perf; leave the backend and deploy as-is.
- **Full-stack** — modernize the backend too (framework, DB, deploy/infra).
- **Both, no infra** — modernize backend code, but keep Fly.io and the current data store; no infra migration.

Pin one to bound the map. If frontend-only, the backend tickets are closed as out of scope.


## Resolution (PROVISIONAL — pending user confirmation)

**Frontend-only** is assumed provisionally. The user's framing ("modernize deps and architecture/stack from basic HTML/CSS/JS") is frontend-oriented, and the 60+ FPS goal lives entirely in the browser. The Express/ws/Fly.io backend stays as-is for this effort.

Consequence: tickets touching the backend (jsonwebtoken->jose, express 4->5 from the dep audit) are parked and not on the frontier. If the user wants full-stack scope, reopen this ticket and graduate those items.


## Resolution (CONFIRMED by user)

**Full-stack — but constrained to run on Fly.io alone.** The backend is modernized too, with no external DB service or multi-process infra: a single Node process on Fly.io + the mounted volume + the already-built-in `node:sqlite` (verified: `server/db.js` uses Node 22 `DatabaseSync`, SQLite on the volume — already Fly.io-alone-friendly).

Consequence (dep audit update): Express 4 → **Fastify** (single process, Fly.io-friendly); keep `node:sqlite`, `ws`, `bcryptjs`; optionally `jsonwebtoken` → `jose`. The 22 existing Express routes (auth, scores, replays, leaderboards, skins, comments, achievements, tournaments, SSE activity, WS multiplayer) port to Fastify; `db.js`/`validate.js`/`pp.js` are framework-agnostic and carry over. This satisfies "full-stack" while staying on one Fly.io machine.
