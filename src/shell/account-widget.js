// Phase 3 shell component: webosu account widget (lit). Replaces the classic
// accounts.js IIFE. Renders a Login/Account control in the nav and a small auth
// modal; uses the ESM api module. Styled with --lazer-* tokens (inherit into shadow DOM).
import { LitElement, html, css } from "lit";
import { api } from "./api.js";

class AccountWidget extends LitElement {
  static properties = {
    _user: { state: true }, _open: { state: true }, _err: { state: true }, _busy: { state: true },
  };
  static styles = css`
    :host { display: inline-flex; align-items: center; gap: 6px; }
    .wa-name { color: var(--lazer-pink); font-weight: 700; font-size: .92em; }
    button { cursor: pointer; background: var(--lazer-pink); color: #fff; border: none;
      border-radius: 16px; padding: 4px 14px; font-family: inherit;
      box-shadow: 0 2px 10px rgba(255,102,170,.35); transition: filter .15s, transform .12s; }
    button:hover { filter: brightness(1.08); transform: translateY(-1px); }
    button.ghost { background: transparent; color: var(--lazer-text); box-shadow: none; border: 1px solid rgba(255,255,255,.12); }
    .modal { position: fixed; inset: 0; background: rgba(0,0,0,.62); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .card { background: var(--lazer-panel); border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px; padding: 20px; width: 300px; position: relative; color: var(--lazer-text);
      box-shadow: 0 18px 50px rgba(0,0,0,.6); }
    .card h3 { margin: 0 0 14px; color: var(--lazer-pink); }
    .close { position: absolute; top: 8px; right: 12px; cursor: pointer; color: var(--lazer-dim); }
    input { display: block; width: 100%; box-sizing: border-box; margin: 8px 0; padding: 8px;
      background: var(--lazer-panel2); border: 1px solid rgba(255,255,255,.12); border-radius: 6px;
      color: var(--lazer-text); font-family: inherit; }
    input:focus { border-color: var(--lazer-pink); outline: none; }
    .row { display: flex; gap: 8px; margin-top: 8px; }
    .row button { flex: 1; }
    .err { color: #ff6b6b; font-size: .85em; min-height: 1em; margin-bottom: 6px; }
  `;
  constructor() { super(); this._user = api.getUser(); this._open = false; this._err = ""; this._busy = false; }
  connectedCallback() { super.connectedCallback(); this._user = api.getUser(); }
  _openModal() { this._open = true; this._err = ""; }
  _close() { this._open = false; }
  async _doAuth(which) {
    const u = this.renderRoot.querySelector(".u").value;
    const p = this.renderRoot.querySelector(".p").value;
    if (!u || !p) { this._err = "enter username and password"; return; }
    this._busy = true; this._err = "";
    try {
      const user = which === "reg" ? await api.register(u, p) : await api.login(u, p);
      this._user = user; this._open = false;
      this.dispatchEvent(new CustomEvent("account-change", { bubbles: true, composed: true, detail: user }));
    } catch (e) { this._err = e.message; }
    this._busy = false;
  }
  _logout() { api.logout(); this._user = null; this.dispatchEvent(new CustomEvent("account-change", { bubbles: true, composed: true, detail: null })); }
  render() {
    return html`
      ${this._user
        ? html`<span class="wa-name">${this._user.username}</span><button class="ghost" @click=${() => this._logout()}>Log out</button>`
        : html`<button @click=${() => this._openModal()}>Log in</button>`}
      ${this._open ? html`
        <div class="modal" @click=${(e) => { if (e.target.classList.contains("modal")) this._close(); }}>
          <div class="card">
            <div class="close" @click=${() => this._close()}>x</div>
            <h3>webosu account</h3>
            <div class="err">${this._err}</div>
            <input class="u" placeholder="username" maxlength="20" />
            <input class="p" type="password" placeholder="password" @keydown=${(e) => e.key === "Enter" && this._doAuth("login")} />
            <div class="row">
              <button class="ghost" ?disabled=${this._busy} @click=${() => this._doAuth("login")}>Log in</button>
              <button ?disabled=${this._busy} @click=${() => this._doAuth("reg")}>Register</button>
            </div>
          </div>
        </div>` : ""}`;
  }
}
customElements.define("account-widget", AccountWidget);
