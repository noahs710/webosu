// webosu API client (ESM). Same-origin /api endpoints (proxied to the backend in
// dev, same-origin in prod). Also sets window.WebosuAPI for any classic scripts.
// catboy.best remains the source of truth for beatmaps/search.
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
    res = await fetch(BASE + path, { method, headers, body: body == null ? undefined : body });
  } catch (e) {
    throw new Error("network error: " + e.message);
  }
  if (res.status === 401) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  return res;
}
async function json(method, path, body) {
  const res = await request(method, path, body == null ? undefined : JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  let data;
  const txt = await res.text();
  try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

function notifyAuth() {
  try { window.dispatchEvent(new Event("webosu-auth")); } catch {}
}

const api = {
  token, isLoggedIn() { return !!token(); },
  getUser() { const u = localStorage.getItem(USER_KEY); return u ? JSON.parse(u) : null; },
  async register(username, password) { const d = await json("POST", "/api/auth/register", { username, password }); localStorage.setItem(TOKEN_KEY, d.token); localStorage.setItem(USER_KEY, JSON.stringify(d.user)); notifyAuth(); return d.user; },
  async login(username, password) { const d = await json("POST", "/api/auth/login", { username, password }); localStorage.setItem(TOKEN_KEY, d.token); localStorage.setItem(USER_KEY, JSON.stringify(d.user)); notifyAuth(); return d.user; },
  logout() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); notifyAuth(); },
  async me() { return json("GET", "/api/auth/me"); },
  async ppEstimate(q) { return json("GET", "/api/pp?" + new URLSearchParams(q).toString()); },
  async submitScore(s) { return json("POST", "/api/scores", s); },
  async leaderboard(beatmapId, modsNum) { const p = new URLSearchParams(); if (modsNum != null) p.set("mods", modsNum); p.set("limit", "50"); return json("GET", "/api/leaderboards/" + beatmapId + "?" + p.toString()); },
  async recentActivity() { return json("GET", "/api/activity/recent"); },
  activityStream() { return new EventSource(BASE + "/api/activity"); },
  // Server metadata (small payload, useful for "is the API up?" checks)
  async version() { return json("GET", "/api/version"); },
  async health() { return json("GET", "/api/health"); },
  async profile(username) { return json("GET", "/api/profiles/" + encodeURIComponent(username)); },
  async profileRecent(username, limit) { const p = new URLSearchParams(); if (limit) p.set("limit", limit); return json("GET", "/api/profiles/" + encodeURIComponent(username) + "/recent?" + p.toString()); },
  async rankings(offset) { const p = new URLSearchParams({ limit: "50" }); if (offset) p.set("offset", offset); return json("GET", "/api/rankings?" + p.toString()); },
  async rankingsCountry(country, offset) { const p = new URLSearchParams({ limit: "50" }); if (offset) p.set("offset", offset); return json("GET", "/api/rankings/country/" + encodeURIComponent(country) + "?" + p.toString()); },
  async getMyProfile() { return json("GET", "/api/profile/me"); },
  async saveMyProfile(obj) { return json("PUT", "/api/profile/me", obj); },
  async getMyFavorites() { const p = await this.getMyProfile(); return p?.favorites || null; },
  async saveMyFavorites(sids) { return this.saveMyProfile({ favorites: sids }); },
  async listSkins(offset) { const p = new URLSearchParams(); if (offset) p.set("offset", offset); return json("GET", "/api/skins?" + p.toString()); },
  async uploadSkin(name, filename, data) { const res = await request("POST", "/api/skins", data, { headers: { "Content-Type": "application/octet-stream", "X-Skin-Name": name, "X-Skin-Filename": filename } }); const d = await res.json(); if (!res.ok) throw new Error(d.error || res.statusText); return d; },
  skinDownloadUrl(id) { return BASE + "/api/skins/" + id; },
  async comments(setId) { return json("GET", "/api/comments/" + setId); },
  async addComment(setId, body) { return json("POST", "/api/comments/" + setId, { body }); },
  async myAchievements() { return json("GET", "/api/achievements/me"); },
  async listTournaments() { return json("GET", "/api/tournaments"); },
  async createTournament(name) { return json("POST", "/api/tournaments", { name }); },
  multiplayer(room, username) { const proto = location.protocol === "https:" ? "wss:" : "ws:"; const ws = new WebSocket(proto + "//" + location.host + "/ws"); ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", room, username }))); return ws; },
};

window.WebosuAPI = api; // back-compat for any classic scripts
export { api };
