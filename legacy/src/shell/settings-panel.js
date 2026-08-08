// Phase 3 shell component: lit <settings-panel> — edits the shared gamesettings
// (display / audio / input / mods) and persists to localStorage + backend. Bound
// to the ESM gamesettings module; styled with --lazer-* tokens.
import { LitElement, html, css } from "lit";
import { gamesettings, defaultsettings, saveToLocal } from "./gamesettings.js";

const SLIDERS = [
  ["dim", "Background dim", 0, 100, 1, "%"], ["blur", "Background blur", 0, 100, 1, "%"],
  ["cursorsize", "Cursor size", 0.5, 2, 0.05, "x"],
  ["dpiscale", "Resolution", 0.5, 2, 0.05, "x"],
  ["mastervolume", "Master volume", 0, 100, 1, "%"], ["effectvolume", "Effect volume", 0, 100, 1, "%"],
  ["musicvolume", "Music volume", 0, 100, 1, "%"], ["audiooffset", "Audio offset", -200, 200, 1, "ms"],
];
const TOGGLES = [
  ["easy", "Easy"], ["hardrock", "Hard Rock"], ["nightcore", "Nightcore"], ["daycore", "Daycore"],
  ["hidden", "Hidden"], ["nofail", "No Fail"], ["suddendeath", "Sudden Death"], ["perfect", "Perfect"],
  ["spunout", "Spun Out"], ["classic", "Classic"], ["difficultyAdjust", "Difficulty Adjust"],
  ["hideNumbers", "Hide numbers"], ["hideGreat", "Hide 300s"], ["hideFollowPoints", "Hide follow points"],
  ["beatmapHitsound", "Beatmap hitsounds"], ["snakein", "Snake-in"], ["snakeout", "Snake-out"],
  ["showhwmouse", "Hardware cursor"], ["autofullscreen", "Auto fullscreen"], ["sysdpi", "Use system resolution"],
];
const KEYS = [["K1name", "K1"], ["K2name", "K2"], ["Kpausename", "Pause"], ["Kpause2name", "Pause 2"], ["Kskipname", "Skip"]];

class SettingsPanel extends LitElement {
  static styles = css`
    :host { display: block; color: var(--lazer-text); }
    .group { background: var(--lazer-panel); border: 1px solid rgba(255,255,255,.08); border-radius: var(--lazer-radius); padding: 14px 16px; margin-bottom: 14px; }
    .group > h3 { margin: 0 0 10px; color: var(--lazer-pink); font-size: 1em; }
    .row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    .row label { flex: 0 0 170px; color: var(--lazer-dim); font-size: .9em; }
    .row input[type=range] { flex: 1; }
    .val { flex: 0 0 48px; text-align: right; font-variant-numeric: tabular-nums; }
    .toggles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 6px 14px; }
    .tog { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .keys { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    .keyrow { display: flex; align-items: center; gap: 8px; }
    .keyrow span { color: var(--lazer-dim); flex: 1; }
    button { cursor: pointer; background: var(--lazer-panel2); color: var(--lazer-text); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; padding: 4px 10px; }
    button.primary { background: var(--lazer-pink); color: #fff; border: none; }
  `;
  connectedCallback() {
    super.connectedCallback();
    // pull cross-device settings from the server when logged in (the ESM
    // gamesettings.js defines syncFromServer but nothing called it on the v2
    // settings page, so server settings never reached a new device).
    if (gamesettings.syncFromServer) gamesettings.syncFromServer().then(() => this.requestUpdate()).catch(() => {});
    (gamesettings.restoreCallbacks = gamesettings.restoreCallbacks || []).push(() => this.requestUpdate());
  }
  _set(key, val) { gamesettings[key] = val; gamesettings.loadToGame(); saveToLocal(); this.requestUpdate(); }
  _reset() { Object.assign(gamesettings, defaultsettings); gamesettings.loadToGame(); saveToLocal(); this.requestUpdate(); }
  render() {
    return html`
      <div class="group"><h3>Display</h3>${SLIDERS.slice(0, 4).map(([k, label, min, max, step, unit]) => html`
        <div class="row"><label>${label}</label><input type="range" min=${min} max=${max} step=${step} .value=${gamesettings[k]} @input=${(e) => this._set(k, +e.target.value)} /><span class="val">${gamesettings[k]}${unit}</span></div>`)}
        ${TOGGLES.filter(t => ["hideNumbers","hideGreat","hideFollowPoints","snakein","snakeout","showhwmouse","autofullscreen","sysdpi"].includes(t[0])).map(([k, label]) => html`
        <label class="tog"><input type="checkbox" ?checked=${gamesettings[k]} @change=${(e) => this._set(k, e.target.checked)} /> ${label}</label>`)}</div>
      <div class="group"><h3>Audio</h3>${SLIDERS.slice(4).map(([k, label, min, max, step, unit]) => html`
        <div class="row"><label>${label}</label><input type="range" min=${min} max=${max} step=${step} .value=${gamesettings[k]} @input=${(e) => this._set(k, +e.target.value)} /><span class="val">${gamesettings[k]}${unit}</span></div>`)}
        <label class="tog"><input type="checkbox" ?checked=${gamesettings.beatmapHitsound} @change=${(e) => this._set("beatmapHitsound", e.target.checked)} /> Beatmap hitsounds</label></div>
      <div class="group"><h3>Keys</h3><div class="keys">${KEYS.map(([k, label]) => html`
        <div class="keyrow"><span>${label}</span><button @click=${(e) => this._captureKey(e, k)}>${gamesettings[k]}</button></div>`)}</div></div>
      <div class="group"><h3>Mods</h3><div class="toggles">${TOGGLES.filter(t => ["easy","hardrock","nightcore","daycore","hidden","nofail","suddendeath","perfect","spunout","classic","difficultyAdjust"].includes(t[0])).map(([k, label]) => html`
        <label class="tog"><input type="checkbox" ?checked=${gamesettings[k]} @change=${(e) => this._set(k, e.target.checked)} /> ${label}</label>`)}</div></div>
      <button class="primary" @click=${() => this._reset()}>Reset to defaults</button>`;
  }
  _captureKey(e, key) {
    const btn = e.target;
    const handler = (ev) => {
      ev.preventDefault();
      const name = ev.key.length === 1 ? ev.key.toUpperCase() : ev.key.toUpperCase();
      gamesettings[key] = name;
      gamesettings.loadToGame(); saveToLocal();
      this.requestUpdate();
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("keydown", handler, true);
  }
}
customElements.define("settings-panel", SettingsPanel);
