// Phase 3 shell component: lit <profile-card username="..."> fetches a webosu
// profile (user + stats + achievements) via the ESM api and renders it (lazer theme).
import { LitElement, html, css } from "lit";
import { api } from "./api.js";

class ProfileCard extends LitElement {
  static properties = { username: {}, _data: { state: true }, _err: { state: true } };
  static styles = css`
    :host { display: block; color: var(--lazer-text); }
    .card { background: var(--lazer-panel); border: 1px solid rgba(255,255,255,.08); border-radius: var(--lazer-radius); padding: 18px; }
    h2 { margin: 0 0 4px; color: var(--lazer-pink); }
    .sub { color: var(--lazer-dim); margin-bottom: 16px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
    .stat { background: var(--lazer-panel2); border-radius: 10px; padding: 10px 12px; }
    .stat .k { color: var(--lazer-dim); font-size: .75em; text-transform: uppercase; letter-spacing: .04em; }
    .stat .v { font-size: 1.2em; font-weight: 700; }
    .ach { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 6px; }
    .badge { background: rgba(255,102,170,.16); color: var(--lazer-pink); border: 1px solid rgba(255,102,170,.3); border-radius: 999px; padding: 3px 10px; font-size: .85em; }
    .err { color: #ff6b6b; }
  `;
  constructor() { super(); this._data = null; }
  connectedCallback() { super.connectedCallback(); this._load(); }
  updated(changed) { if (changed.has("username")) this._load(); }
  async _load() {
    if (!this.username) { this._err = "no username"; return; }
    this._err = "";
    try { this._data = await api.profile(this.username); }
    catch (e) { this._err = String(e.message || e); this._data = null; }
  }
  render() {
    if (this._err && !this._data) return html`<div class="err">${this._err}</div>`;
    if (!this._data) return html`<div class="card">Loading…</div>`;
    const u = this._data.user || {}, s = this._data.stats || {}, a = this._data.achievements || [];
    return html`<div class="card">
      <h2>${u.username || this.username}</h2>
      <div class="sub">webosu profile</div>
      <div class="stats">
        <div class="stat"><div class="k">Plays</div><div class="v">${s.plays || 0}</div></div>
        <div class="stat"><div class="k">Max score</div><div class="v">${(s.max_score || 0).toLocaleString()}</div></div>
        <div class="stat"><div class="k">Max combo</div><div class="v">${s.max_combo || 0}</div></div>
        <div class="stat"><div class="k">Avg acc</div><div class="v">${(s.avg_acc || 0).toFixed(2)}%</div></div>
        <div class="stat"><div class="k">300s</div><div class="v">${s.c300 || 0}</div></div>
        <div class="stat"><div class="k">Misses</div><div class="v">${s.miss || 0}</div></div>
      </div>
      ${a.length ? html`<div class="ach">${a.map(x => html`<span class="badge">${x.key}</span>`)}</div>` : ""}`;
  }
}
customElements.define("profile-card", ProfileCard);
