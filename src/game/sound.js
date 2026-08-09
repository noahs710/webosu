// Phase 4: howler-backed replacement for the vendored js/lib/sound.js (which shipped
// a dead AudioContextMonkeyPatch for ~8-year-old browsers). Exposes the SAME global
// interface the game uses: window.sounds (load/whenLoaded + sounds[url] map) and
// window.makeSound, with sound objects exposing .volume (setter, 0-1) + .play() (per-play
// volume via howler sound ids). Sets window.actx = Howler.ctx so the existing
// resume-on-gesture logic resumes howler's context.
import { Howl, Howler } from "howler";

window.actx = Howler.ctx;

class GameSound {
  constructor(url, onload, onerror) {
    this._vol = 1;
    this._howl = new Howl({ src: [url], preload: true, autoUnlock: false });
    if (onload) this._howl.once("load", () => onload(this));
    if (onerror) this._howl.once("loaderror", () => onerror(new Error("loaderror " + url)));
  }
  get volume() { return this._vol; }
  set volume(v) { this._vol = v; }
  play() { const id = this._howl.play(); this._howl.volume(this._vol, id); return id; }
  pause(id) { this._howl.pause(id); }
  stop(id) { this._howl.stop(id); }
}

const sounds = {
  toLoad: 0, loaded: 0, whenLoaded: null,
  load(arr) {
    this.toLoad = arr.length; this.loaded = 0;
    if (!arr.length && this.whenLoaded) { this.whenLoaded(); return; }
    for (const url of arr) {
      const s = new GameSound(url, null, () => { if (import.meta.env.DEV) console.warn("hitsound load failed:", url); });
      s._howl.once("load", () => {
        this.loaded++;
        if (this.toLoad === this.loaded) { this.toLoad = 0; this.loaded = 0; if (this.whenLoaded) this.whenLoaded(); }
      });
      this[url] = s;
    }
  },
};

function makeSound(name, onload, onerror) {
  return new GameSound(name, onload, onerror);
}

window.sounds = sounds;
window.makeSound = makeSound;
