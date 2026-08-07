// Phase 3 shell component: a lit <leaderboard bid="..."> that fetches the webosu
// leaderboard for a beatmap via the ESM api and renders the scores table.
import { LitElement, html, css } from "lit";
import { api } from "./api.js";

class Leaderboard extends LitElement {
  static properties = { bid: {}, mods: {}, _rows: { state: true }, _err: { state: true }, _loading: { state: true } };
  static styles = css`
    :host { display: block; color: var(--lazer-text); }
    table { width: 100%; border-collapse: collapse; background: var(--lazer-panel); border-radius: var(--lazer-radius); overflow: hidden; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,.06); }
    th { color: var(--lazer-dim); font-weight: 600; font-size: .85em; text-transform: uppercase; letter-spacing: .04em; }
    tr:hover td { background: rgba(255,102,170,.06); }
    .rank { width: 44px; color: var(--lazer-pink); font-weight: 700; }
    .grade { font-weight: 700; }
    .acc, .combo, .mods { color: var(--lazer-dim); }
    .empty, .err { padding: 18px; color: var(--lazer-dim); text-align: center; }
    .err { color: #ff6b6b; }
  `;
  constructor() { super(); this._rows = []; this._loading = false; }
  connectedCallback() { super.connectedCallback(); this._load(); }
  updated(changed) { if (changed.has("bid")) this._load(); }
  async _load() {
    if (this.bid == null) { this._err = "no beatmap id"; return; }
    this._loading = true; this._err = "";
    try { this._rows = await api.leaderboard(this.bid, this.mods != null ? this.mods : 0); }
    catch (e) { this._err = String(e.message || e); }
    this._loading = false;
  }
  render() {
    if (this._err) return html`<div class="err">${this._err}</div>`;
    if (this._loading) return html`<div class="empty">Loading…</div>`;
    if (!this._rows.length) return html`<div class="empty">No scores yet. Be the first!</div>`;
    return html`<table>
      <thead><tr><th class="rank">#</th><th>Player</th><th>Score</th><th class="acc">Acc</th><th class="combo">Combo</th><th>Grade</th><th class="mods">Mods</th></tr></thead>
      <tbody>${this._rows.map((r, i) => html`<tr>
        <td class="rank">${i + 1}</td><td>${r.username}</td><td>${(r.score || 0).toLocaleString()}</td>
        <td class="acc">${(r.acc || 0).toFixed(2)}%</td><td class="combo">${r.max_combo || 0}</td>
        <td class="grade">${r.grade || "-"}</td><td class="mods">${r.mods || "-"}</td>
      </tr>`)}</tbody></table>`;
  }
}
customElements.define("leaderboard-board", Leaderboard);
