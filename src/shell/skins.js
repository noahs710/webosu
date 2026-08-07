// Phase 3 shell component: lit <skin-list> — lists webosu skins via the ESM api,
// uploads a .osk (auth required), and downloads. Styled with --lazer-* tokens.
import { LitElement, html, css } from "lit";
import { api } from "./api.js";

class SkinList extends LitElement {
  static properties = { _skins: { state: true }, _err: { state: true }, _msg: { state: true } };
  static styles = css`
    :host { display: block; color: var(--lazer-text); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .card { background: var(--lazer-panel); border: 1px solid rgba(255,255,255,.08); border-radius: var(--lazer-radius); padding: 12px; }
    .name { font-weight: 700; color: var(--lazer-text); }
    .author { color: var(--lazer-dim); font-size: .85em; }
    .meta { color: var(--lazer-dim); font-size: .8em; margin: 6px 0; }
    button { cursor: pointer; background: var(--lazer-pink); color: #fff; border: none; border-radius: 8px; padding: 5px 12px; }
    button.ghost { background: transparent; color: var(--lazer-text); border: 1px solid rgba(255,255,255,.12); }
    .upload { margin-bottom: 14px; }
    .msg { margin-top: 8px; color: #43b581; font-size: .9em; }
    .err { color: #ff6b6b; }
  `;
  constructor() { super(); this._skins = []; }
  connectedCallback() { super.connectedCallback(); this._load(); }
  async _load() { this._err = ""; try { this._skins = await api.listSkins(); } catch (e) { this._err = String(e.message || e); } }
  _fmt(n) { return (n / 1024).toFixed(0) + " KB"; }
  async _onFile(e) {
    const f = e.target.files[0]; if (!f) return;
    this._msg = ""; this._err = "";
    if (!api.isLoggedIn()) { this._err = "Log in to upload a skin."; return; }
    try {
      const r = await api.uploadSkin(f.name.replace(/\.osk$/i, ""), f.name, await f.arrayBuffer());
      this._msg = "Uploaded " + r.name + " (#" + r.id + ")";
      this._load();
    } catch (err) { this._err = String(err.message || err); }
  }
  render() {
    return html`
      <div class="upload">
        <input type="file" accept=".osk" @change=${(e) => this._onFile(e)} />
        ${this._msg ? html`<div class="msg">${this._msg}</div>` : ""}
        ${this._err ? html`<div class="err">${this._err}</div>` : ""}
      </div>
      <div class="grid">${this._skins.map(s => html`
        <div class="card">
          <div class="name">${s.name || "skin"}</div>
          <div class="author">by ${s.author || "unknown"}</div>
          <div class="meta">${this._fmt(s.size || 0)} · ${s.downloads || 0} downloads</div>
          <a href=${api.skinDownloadUrl(s.id)} download><button class="ghost">Download</button></a>
        </div>`)}</div>
      ${!this._skins.length ? html`<div style="color:var(--lazer-dim);padding:18px">No skins shared yet.</div>` : ""}`;
  }
}
customElements.define("skin-list", SkinList);
