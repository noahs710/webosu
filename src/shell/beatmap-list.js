// Phase 3 shell component: a lit web component that fetches a catboy.best search
// URL and renders beatmap cards in the osu!lazer look (uses the --lazer-* design
// tokens already defined on :root by css/main.css). Renders to light DOM so the
// page's lazer CSS applies and tests can query the cards.
import { LitElement, html } from "lit";

class BeatmapList extends LitElement {
  static properties = {
    src: {},
    limit: {},
    _sets: { state: true },
    _error: { state: true },
  };
  constructor() {
    super();
    this.limit = 12;
    this._sets = [];
  }
  createRenderRoot() {
    return this; // light DOM -> global lazer CSS applies + queryable
  }
  connectedCallback() { super.connectedCallback(); this._load(); }
  updated(changed) { if (changed.has("src")) this._load(); }
  async _load() {
    if (!this.src) return;
    this._error = "";
    try {
      const r = await fetch(this.src);
      if (!r.ok) throw new Error("search " + r.status);
      let sets = await r.json();
      sets = sets.filter((s) => s.beatmaps && s.beatmaps.some((b) => b.mode === "osu"));
      this._sets = sets.slice(0, this.limit);
    } catch (e) {
      this._error = String(e);
      console.warn("beatmap-list load failed:", e);
    }
  }
  _stars(rating) { return (Math.round(rating * 100) / 100).toFixed(2); }
  _launch(set, beatmap, ev) {
    ev.preventDefault();
    this.dispatchEvent(new CustomEvent("beatmap-launch", { bubbles: true, composed: true,
      detail: { setId: set.id, beatmapId: beatmap.id, version: beatmap.version, title: set.title, artist: set.artist, stars: beatmap.difficulty_rating } }));
  }
  render() {
    if (this._error) return html`<div class="beatmap-list-error">Failed to load: ${this._error}</div>`;
    return html`${this._sets.map((s) => html`
      <article class="beatmap-card beatmapbox">
        <img class="beatmapcover" src="https://assets.ppy.sh/beatmaps/${s.id}/covers/card@2x.jpg" alt="" loading="lazy" onerror="this.style.display='none'"/>
        <div class="beatmapcard-info">
          <div class="beatmapcard-title">${s.title}</div>
          <div class="beatmapcard-artist">${s.artist}</div>
          <div class="difficulty-list">
            ${(s.beatmaps || []).filter((b) => b.mode === "osu").map((b) => html`
              <button class="difficulty-item" @click=${(e) => this._launch(s, b, e)}>
                <span class="difficulty-version">${b.version}</span>
                <span class="difficulty-stars">${this._stars(b.difficulty_rating)}★</span>
              </button>`)}
          </div>
        </div>
      </article>`)}`;
  }
}
customElements.define("beatmap-list", BeatmapList);
