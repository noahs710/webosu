# Discord Webhook for webosu scores

Scores are proxied via Fly.io `:8080` (`https://webosu.fly.dev/api/webhook/score` → `DISCORD_WEBHOOK_URL`). No `api.catboy.best` is used.

## 1. Create webhook in Discord
1. Open your Discord server → channel settings (e.g. `#scores`) → **Integrations** → **Webhooks** → **Create Webhook**.
2. Name it `webosu`, pick avatar, **Copy Webhook URL** (looks like `https://discord.com/api/webhooks/123/...`).

## 2. Set webhook on Fly
```bash
flyctl secrets set DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..." -a webosu
flyctl deploy --config fly.toml -a webosu
```
Or set `DISCORD_WEBHOOK_URL` in your local `.env` for `npm run server` (dev).

## 3. How it works
- Game posts to `POST /api/webhook/score` (same-origin, Fly proxies `:8080`). Payload is the score summary (`player`, `score`, `artist - title [version]`, `grade`, `mods`, `count300/100/50/misses`, `acc`, `combo`) plus a Discord-compatible `content`/`embeds` wrapper (`src/game/overlay/score.js:372`).
- Server `server/app.js:165` `POST /api/webhook/score` forwards to `DISCORD_WEBHOOK_URL` via `fetch` (fire-and-forget, logs on failure). If no webhook is set, it just logs and returns `{ok:true, forwarded:false}`.
- The same Discord relay also runs on `POST /api/scores` (the normal leaderboard submit) so both manual and auto scores appear in Discord.

## 4. Test
```bash
curl -X POST https://webosu.fly.dev/api/webhook/score \
  -H "Content-Type: application/json" \
  -d '{"player":"test","score":123456,"artist":"Artist","title":"Title","version":"Hard","grade":"A","mods":"HD","count300":100,"count100":5,"count50":0,"misses":0,"acc":"97.5%","combo":"123x"}'
```
Check your Discord channel for the embed.

## 5. Disable
`flyctl secrets unset DISCORD_WEBHOOK_URL -a webosu` — scores still save locally, just no Discord post.
