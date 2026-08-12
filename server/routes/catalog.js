"use strict";
// server/routes/catalog.js — single source of truth for the /api base route.
// Lists every registered /api/* route with method, path, visibility, summary,
// path params and query params. /api returns HTML for browsers; /api/routes
// returns JSON for scripts. Both endpoints honour ?private=1 and ?public=1 to
// filter the listing.

// Authoritative list. Each entry:
//   method   HTTP verb (GET/POST/PUT/DELETE)
//   url      route path (Fastify syntax: :param)
//   group    first URL segment after /api (auth, pp, scores, ...)
//   private  true when the route requires a Bearer token
//   summary  one-line description (shown on the /api page)
//   params   path params (object: name -> description)
//   query    query params (object: name -> description)
const ROUTES = [
   {
      method: "GET",
      url: "/api/health",
      group: "health",
      private: false,
      summary: "Liveness probe.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/version",
      group: "version",
      private: false,
      summary: "Server version + feature flags.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/routes",
      group: "routes",
      private: false,
      summary:
         "JSON listing of every /api/* endpoint (this page, in machine-readable form). Honours ?private=1 and ?public=1.",
      params: {},
      query: {
         private: "set to 1 to show only auth-required routes",
         public: "set to 1 to show only public routes",
      },
   },
   {
      method: "POST",
      url: "/api/auth/register",
      group: "auth",
      private: false,
      summary: "Create an account (rate-limited 12/min).",
      params: {},
      query: {},
   },
   {
      method: "POST",
      url: "/api/auth/login",
      group: "auth",
      private: false,
      summary: "Exchange username + password for a JWT (rate-limited 12/min).",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/auth/me",
      group: "auth",
      private: true,
      summary: "Currently logged-in user.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/pp",
      group: "pp",
      private: false,
      summary: "Quick PP estimate from stars + accuracy + counts.",
      params: {},
      query: {
         stars: "star rating",
         acc: "accuracy 0-100",
         c300: "300 count",
         c100: "100 count",
         c50: "50 count",
         miss: "miss count",
         combo: "current combo",
         maxCombo: "map max combo",
         modsNum: "mod bitmask",
      },
   },
   {
      method: "POST",
      url: "/api/pp/rosu",
      group: "pp",
      private: false,
      summary:
         "Accurate PP via rosu-pp-js (lazer mode). Send raw .osu text in `osu`.",
      params: {},
      query: {},
   },
   {
      method: "POST",
      url: "/api/scores",
      group: "scores",
      private: true,
      summary:
         "Submit a score (and optionally a replay). Rate-limited 40/min. Unknown mods rejected.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/scores/:id",
      group: "scores",
      private: false,
      summary: "Fetch a single score row by id.",
      params: { id: "score id" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/replays/:id",
      group: "scores",
      private: false,
      summary: "Replay frames for a score (JSON array of {t,x,y,d}).",
      params: { id: "score id" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/leaderboards/:beatmapId",
      group: "leaderboards",
      private: false,
      summary:
         "Leaderboard for a beatmap. v2 (default) is lazer-scaled, per-mod-combination via mods_hash. v1 is legacy mods-bitmask.",
      params: { beatmapId: "beatmap id" },
      query: {
         version: "v1 or v2 (default v2)",
         mods: "mods bitmask (v1 only)",
         mods_hash: "per-mod-combination hash (v2)",
         limit: "max rows, capped at 100",
         ranked: "true (default) or false",
      },
   },
   {
      method: "GET",
      url: "/api/leaderboards/:beatmapId/mods",
      group: "leaderboards",
      private: false,
      summary: "Distinct mod combinations played on a beatmap (UI selector).",
      params: { beatmapId: "beatmap id" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/activity/recent",
      group: "activity",
      private: false,
      summary: "Last 20 scores across all users (drives the ActivityFeed).",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/activity",
      group: "activity",
      private: false,
      summary: "SSE stream of live score events.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/profiles/:username",
      group: "profiles",
      private: false,
      summary:
         "Public profile: user row + stats + achievements + global/country rank.",
      params: { username: "username" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/profiles/:username/recent",
      group: "profiles",
      private: false,
      summary: "Recent plays for a user (paginated).",
      params: { username: "username" },
      query: { limit: "1-100, default 20", offset: "0+, default 0" },
   },
   {
      method: "GET",
      url: "/api/users/:id",
      group: "profiles",
      private: false,
      summary: "Look up a user by numeric id.",
      params: { id: "user id" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/rankings",
      group: "rankings",
      private: false,
      summary: "Global rankings by total PP.",
      params: {},
      query: { limit: "1-100, default 50", offset: "0+, default 0" },
   },
   {
      method: "GET",
      url: "/api/rankings/country/:country",
      group: "rankings",
      private: false,
      summary: "Country-filtered rankings.",
      params: { country: "2-letter country code" },
      query: { limit: "1-100, default 50", offset: "0+, default 0" },
   },
   {
      method: "GET",
      url: "/api/me",
      group: "me",
      private: true,
      summary:
         "Logged-in user row + stats + achievements + ranks (one round-trip).",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/me/scores",
      group: "me",
      private: true,
      summary: "Your own scores (paginated, newest first).",
      params: {},
      query: { limit: "1-100, default 20", offset: "0+, default 0" },
   },
   {
      method: "GET",
      url: "/api/profile/me",
      group: "me",
      private: true,
      summary: "Your persisted client settings + favorites.",
      params: {},
      query: {},
   },
   {
      method: "PUT",
      url: "/api/profile/me",
      group: "me",
      private: true,
      summary: "Persist client settings + favorites + pfp_url.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/skins",
      group: "skins",
      private: false,
      summary: "Browse shared skins (rate-limited 30/min).",
      params: {},
      query: { limit: "1-100, default 50", offset: "0+, default 0" },
   },
   {
      method: "POST",
      url: "/api/skins",
      group: "skins",
      private: true,
      summary:
         "Upload a .osk (application/octet-stream body, rate-limited 5/min).",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/skins/:id",
      group: "skins",
      private: false,
      summary: "Download a skin as octet-stream.",
      params: { id: "skin id" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/comments/:setId",
      group: "comments",
      private: false,
      summary: "Comments on a beatmap set.",
      params: { setId: "beatmap set id" },
      query: {},
   },
   {
      method: "POST",
      url: "/api/comments/:setId",
      group: "comments",
      private: true,
      summary: "Post a comment on a beatmap set (1KB max).",
      params: { setId: "beatmap set id" },
      query: {},
   },
   {
      method: "GET",
      url: "/api/achievements/me",
      group: "achievements",
      private: true,
      summary: "Your unlocked achievements.",
      params: {},
      query: {},
   },
   {
      method: "GET",
      url: "/api/tournaments",
      group: "tournaments",
      private: false,
      summary: "List tournaments (scaffold).",
      params: {},
      query: {},
   },
   {
      method: "POST",
      url: "/api/tournaments",
      group: "tournaments",
      private: true,
      summary: "Create a tournament (scaffold).",
      params: {},
      query: {},
   },
   {
      method: "POST",
      url: "/api/webhook/score",
      group: "webhook",
      private: false,
      summary:
         "Discord-webhook-compatible score relay (rate-limited 20/min). Forwards to DISCORD_WEBHOOK_URL when set.",
      params: {},
      query: {},
   },
].map((r) => ({ ...r, params: r.params || {}, query: r.query || {} }));

function filterRoutes(query) {
   if (query && (query.private === "1" || query.private === "true"))
      return ROUTES.filter((r) => r.private);
   if (query && (query.public === "1" || query.public === "true"))
      return ROUTES.filter((r) => !r.private);
   return ROUTES;
}

function renderJSON(query) {
   const defs = filterRoutes(query);
   const groups = {};
   for (const r of defs) {
      (groups[r.group] = groups[r.group] || []).push({
         method: r.method,
         url: r.url,
         private: r.private,
         summary: r.summary,
         params: r.params,
         query: r.query,
      });
   }
   return { total: defs.length, groups };
}

const escAmp = String.fromCharCode(38) + "amp;";
const escLt = String.fromCharCode(38) + "lt;";
const escGt = String.fromCharCode(38) + "gt;";
const escQt = String.fromCharCode(38) + "quot;";
function esc(s) {
   return String(s)
      .replace(/&/g, escAmp)
      .replace(/</g, escLt)
      .replace(/>/g, escGt)
      .replace(/"/g, escQt);
}

function renderText(query, selfUrl) {
   const APIROOT = "/" + "api";
   const defs = filterRoutes(query || {});
   const onlyPrivate =
      (query.private === "1" || query.private === "true") &&
      !(query.public === "1" || query.public === "true");
   const onlyPublic =
      (query.public === "1" || query.public === "true") &&
      !(query.private === "1" || query.private === "true");
   const showPrivate = !onlyPublic;
   const showPublic = !onlyPrivate;
   const byGroup = {};

   for (const r of defs) {
      if (!showPrivate && r.private) continue;
      if (!showPublic && !r.private) continue;
      (byGroup[r.group] = byGroup[r.group] || []).push(r);
   }
   const groups = Object.keys(byGroup).sort();
   const out = [];
   out.push("webosu api");
   out.push("==========");
   out.push("");

   out.push("You hit: " + (selfUrl || APIROOT));
   out.push(
      defs.length +
         " endpoints across " +
         groups.length +
         " groups. Base path: " +
         APIROOT,
   );
   out.push("");

   out.push(
      "Usage: most routes accept and return JSON. Private routes need header",
   );
   out.push("  Authorization: Bearer <token>");
   out.push("Get a token from POST /api/auth/login (username, password).");
   out.push("Rate-limited routes return 429 when exceeded.");
   out.push("");
   out.push("Filter:");
   out.push("  GET /api                          all routes (this listing)");
   out.push("  GET /api?public=1                  public routes only");
   out.push("  GET /api?private=1                 private (auth) routes only");
   out.push("  GET /api/routes               JSON listing (machine-readable)");
   out.push("");
   for (const g of groups) {
      const list = byGroup[g].slice().sort(function (a, b) {
         return a.url.localeCompare(b.url);
      });
      out.push("");
      out.push(g.toUpperCase() + "  (" + list.length + ")");
      out.push("-".repeat(g.length + 4));
      for (const r of list) {
         const tag = r.private ? "[private]" : "[public] ";
         let line = "  " + tag + " " + r.method.padEnd(6) + " " + r.url;
         line += "  -- " + r.summary;
         out.push(line);
         const pkeys = Object.keys(r.params);
         if (pkeys.length)
            out.push(
               "    path params: " +
                  Object.entries(r.params)
                     .map(function (e) {
                        return e[0] + "=" + e[1];
                     })
                     .join(", "),
            );
         const qkeys = Object.keys(r.query);
         if (qkeys.length)
            out.push(
               "    query:       " +
                  Object.entries(r.query)
                     .map(function (e) {
                        return e[0] + "=" + e[1];
                     })
                     .join(", "),
            );
      }
   }
   if (groups.length === 0) out.push("(no routes match the current filter)");
   out.push("");
   return out.join("\n");
}

function register(app) {
   app.get("/api", async (req, reply) => {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.indexOf("application/json") !== -1) {
         reply.send(renderJSON(req.query || {}));
      } else {
         reply.header("content-type", "text/plain; charset=utf-8");
         reply.send(renderText(req.query || {}, req.url));
      }
   });
   app.get("/api/routes", async (req, reply) => {
      reply.send(renderJSON(req.query || {}));
   });
}

module.exports = {
   register: register,
   ROUTES: ROUTES,
   renderText: renderText,
   renderJSON: renderJSON,
};
