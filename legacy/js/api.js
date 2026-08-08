/*
 * webosu API client (webosu-specific backend; catboy.best remains the source of
 * truth for beatmaps/search/score-submission). Same-origin /api endpoints.
 */
(function () {
  const BASE = window.WEBOSU_API_BASE || "";
  const TOKEN_KEY = "webosu_token";
  const USER_KEY = "webosu_user";

  function token() { return localStorage.getItem(TOKEN_KEY); }
  function authHeaders() {
    const t = token();
    return t ? { Authorization: "Bearer " + t } : {};
  }
  async function request(method, path, body, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {}, authHeaders());
    let res;
    try {
      res = await fetch(BASE + path, {
        method: method,
        headers: headers,
        body: body == null ? undefined : body,
      });
    } catch (e) {
      throw new Error("network error: " + e.message);
    }
    if (res.status === 401) {
      // session expired
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    return res;
  }
  async function json(method, path, body) {
    const res = await request(method, path, body == null ? undefined : JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
    let data;
    const txt = await res.text();
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
    if (!res.ok) throw new Error((data && data.error) || res.statusText);
    return data;
  }

  const API = {
    token, isLoggedIn() { return !!token(); },
    getUser() { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; },

    async register(username, password) {
      const d = await json("POST", "/api/auth/register", { username, password });
      localStorage.setItem(TOKEN_KEY, d.token);
      localStorage.setItem(USER_KEY, JSON.stringify(d.user));
      return d.user;
    },
    async login(username, password) {
      const d = await json("POST", "/api/auth/login", { username, password });
      localStorage.setItem(TOKEN_KEY, d.token);
      localStorage.setItem(USER_KEY, JSON.stringify(d.user));
      return d.user;
    },
    logout() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },

    async me() { return json("GET", "/api/auth/me"); },
    async ppEstimate(q) { return json("GET", "/api/pp?" + new URLSearchParams(q).toString()); },

    // webosu leaderboard submission (additive; catboy.best submission stays)
    async submitScore(s) {
      return json("POST", "/api/scores", s);
    },
    async leaderboard(beatmapId, modsNum) {
      const p = new URLSearchParams();
      if (modsNum != null) p.set("mods", modsNum);
      p.set("limit", "50");
      return json("GET", "/api/leaderboards/" + beatmapId + "?" + p.toString());
    },
    async recentActivity() { return json("GET", "/api/activity/recent"); },
    activityStream() {
      return new EventSource(BASE + "/api/activity");
    },

    async profile(username) { return json("GET", "/api/profiles/" + encodeURIComponent(username)); },
    async getMyProfile() { return json("GET", "/api/profile/me"); },
    async saveMyProfile(obj) { return json("PUT", "/api/profile/me", obj); },

    async listSkins(offset) {
      const p = new URLSearchParams();
      if (offset) p.set("offset", offset);
      return json("GET", "/api/skins?" + p.toString());
    },
    async uploadSkin(name, filename, data) {
      const res = await request("POST", "/api/skins", data, {
        headers: { "Content-Type": "application/octet-stream", "X-Skin-Name": name, "X-Skin-Filename": filename },
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || res.statusText);
      return d;
    },
    skinDownloadUrl(id) { return BASE + "/api/skins/" + id; },

    async comments(setId) { return json("GET", "/api/comments/" + setId); },
    async addComment(setId, body) { return json("POST", "/api/comments/" + setId, { body: body }); },
    async myAchievements() { return json("GET", "/api/achievements/me"); },
    async listTournaments() { return json("GET", "/api/tournaments"); },
    async createTournament(name) { return json("POST", "/api/tournaments", { name: name }); },

    // multiplayer websocket
    multiplayer(room, username) {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(proto + "//" + location.host + "/ws");
      ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", room: room, username: username })));
      return ws;
    },
  };
  window.WebosuAPI = API;
})();
