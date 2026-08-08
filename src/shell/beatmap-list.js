// Phase 3 shell component: a lit web component that fetches a catboy.best search
// URL and renders beatmap cards in the osu!lazer look (uses the --lazer-* design
// tokens already defined on :root by css/main.css). Renders to light DOM so the
// page's lazer CSS applies and tests can query the cards.
import { LitElement, html } from "lit";

class BeatmapList extends LitElement {
  static properties = {
    src: {},
    sids: {},
    limit: {},
    emptyMessage: {},
    _sets: { state: true },
    _error: { state: true },
    _loading: { state: true },
  };
  constructor() {
    super();
    this.limit = 12;
    this.sids = null;
    this.emptyMessage = "";
    this._sets = [];
    this._loading = false;
  }
  createRenderRoot() {
    return this; // light DOM -> global lazer CSS applies + queryable
  }
  connectedCallback() { super.connectedCallback(); this._load(); }
  updated(changed) { if (changed.has("src") || changed.has("sids")) this._load(); }
  async _load() {
    if (!this.src && !this.sids) return;
    this._error = "";
    this._loading = true;
    try {
      let sets;
      if (this.sids && this.sids.length) {
        const url = "https://catboy.best/api/v2/beatmapsets?ids=" + this.sids.join("&ids=");
        const r = await fetch(url);
        if (!r.ok) throw new Error("sets " + r.status);
        sets = await r.json();
      } else if (this.sids) {
        this._sets = []; this._loading = false; return;
      } else {
        const r = await fetch(this.src);
        if (!r.ok) throw new Error("search " + r.status);
        sets = await r.json();
      }
      sets = (sets || []).filter((s) => s.beatmaps && s.beatmaps.some((b) => b.mode === "osu"));
      this._sets = sets.slice(0, this.limit);
    } catch (e) {
      this._error = String(e);
      console.warn("beatmap-list load failed:", e);
    } finally {
      this._loading = false;
    }
  }
  _stars(rating) { return (Math.round(rating * 100) / 100).toFixed(2); }
  _starname(star) {
    if (star == null) return "unknown";
    if (star < 2) return "easy";
    if (star < 2.7) return "normal";
    if (star < 4) return "hard";
    if (star < 5.3) return "insane";
    if (star < 6.5) return "expert";
    return "expert-plus";
  }
  _launch(set, beatmap, ev) {
    ev.preventDefault();
    this.dispatchEvent(new CustomEvent("beatmap-launch", { bubbles: true, composed: true,
      detail: { setId: set.id, beatmapId: beatmap.id, version: beatmap.version, title: set.title, artist: set.artist, stars: beatmap.difficulty_rating } }));
  }
  _showDifficulties(set, ev) {
    ev.preventDefault(); ev.stopPropagation();
    // close any existing difficulty list
    if (window._currentDiffList) {
      const old = window._currentDiffList;
      window.removeEventListener("click", old._close);
      if (old.parentNode) old.parentNode.removeChild(old);
      window._currentDiffList = null;
    }
    const card = ev.currentTarget;
    const box = document.createElement("div");
    box.className = "difficulty-box";
    box.style.position = "absolute";
    box.style.left = "0";
    box.style.top = "100%";
    box.style.zIndex = "10000";
    box._close = function() {
      if (box.parentNode) box.parentNode.removeChild(box);
      window.removeEventListener("click", box._close);
      window._currentDiffList = null;
    };
    // fill difficulty items
    const diffs = (set.beatmaps || []).filter((b) => b.mode === "osu");
    for (const b of diffs) {
      const item = document.createElement("div");
      item.className = "difficulty-item";
      // ring icon
      const ringbase = document.createElement("div"); ringbase.className = "bigringbase";
      const ring = document.createElement("div"); ring.className = "bigring " + this._starname(b.difficulty_rating);
      item.appendChild(ringbase); item.appendChild(ring);
      // version + stars
      const line = document.createElement("div"); line.className = "versionline";
      const ver = document.createElement("div"); ver.className = "version"; ver.textContent = b.version;
      const stars = document.createElement("div"); stars.className = "mapper"; stars.textContent = this._stars(b.difficulty_rating) + "\u2605";
      line.appendChild(ver); line.appendChild(stars);
      item.appendChild(line);
      // leaderboard (optional)
      if (window.api && window.api.leaderboard) {
        window.api.leaderboard(b.id).then(function(top) {
          if (top && top.length) {
            const lb = document.createElement("div"); lb.className = "diff-leaderboard";
            lb.textContent = "\uD83C\uDFC6 " + top[0].username + "  " + parseInt(top[0].score, 10).toLocaleString();
            item.appendChild(lb);
          }
        }).catch(function() {});
      }
      item.onclick = (e) => { e.stopPropagation(); this._launch(set, b, e); box._close(); };
      box.appendChild(item);
    }
    card.appendChild(box);
    box.onclick = (e) => e.stopPropagation();
    window._currentDiffList = box;
    // defer adding the close listener so the current click doesn't immediately close it
    setTimeout(() => window.addEventListener("click", box._close, false), 0);
  }
  render() {
    if (this._error) return html`<div class="beatmap-list-error">Failed to load: ${this._error}</div>`;
    if (!this._loading && !this._sets.length && this.emptyMessage)
      return html`<div class="beatmap-list-empty">${this.emptyMessage}</div>`;
    return html`${this._sets.map((s) => {
      const diffs = (s.beatmaps || []).filter((b) => b.mode === "osu");
      return html`
      <article class="beatmap-card beatmapbox" @click=${(e) => this._showDifficulties(s, e)}>
        <img class="beatmapcover" src="https://assets.ppy.sh/beatmaps/${s.id}/covers/card@2x.jpg" alt="" loading="lazy" onerror="this.style.display='none'"/>
        <div class="beatmapcover-overlay"></div>
        <div class="beatmapcard-info">
          <div class="beatmapcard-title">${s.title}</div>
          <div class="beatmapcard-artist">${s.artist}</div>
          <div class="beatmap-difficulties">
            ${diffs.length <= 13 ? diffs.map((b) => html`<div class="difficulty-ring ${this._starname(b.difficulty_rating)}"></div>`) : html`<div class="difficulty-ring ${this._starname(diffs[diffs.length-1].difficulty_rating)}"></div><span class="difficulty-count">${diffs.length}</span>`}
          </div>
        </div>
      </article>`;
    })}`;
  }
}
customElements.define("beatmap-list", BeatmapList);
