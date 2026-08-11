<script setup>
import { ref, onMounted } from "vue";
import { gamesettings, defaultsettings, saveToLocal } from "../../shell/gamesettings.js";
import GameState from "../../shell/gamestate.js";
import { api } from "../../shell/api.js";

const pfpUrl = ref("");

const SLIDERS = [
  ["dim", "Background dim", 0, 100, 1, "%"], ["blur", "Background blur", 0, 100, 1, "%"],
  ["cursorsize", "Cursor size", 0.5, 2, 0.05, "x"], ["dpiscale", "Resolution", 0.5, 2, 0.05, "x"],
  ["mastervolume", "Master volume", 0, 100, 1, "%"], ["effectvolume", "Effect volume", 0, 100, 1, "%"],
  ["musicvolume", "Music volume", 0, 100, 1, "%"], ["audiooffset", "Audio offset", -200, 200, 1, "ms"],
];
const DISPLAY_TOGGLES = ["hideNumbers","hideGreat","hideFollowPoints","snakein","snakeout","showhwmouse","autofullscreen","sysdpi"];
const MOD_TOGGLES = ["autoplay","easy","hardrock","nightcore","daycore","hidden","nofail","suddendeath","perfect","spunout","classic","difficultyAdjust"];
const KEYS = [["K1name","K1"],["K2name","K2"],["Kpausename","Pause"],["Kpause2name","Pause 2"],["Kskipname","Skip"]];
const TOGGLE_LABELS = { autoplay:"Autoplay", easy:"Easy", hardrock:"Hard Rock", nightcore:"Nightcore", daycore:"Daycore", hidden:"Hidden", nofail:"No Fail", suddendeath:"Sudden Death", perfect:"Perfect", spunout:"Spun Out", classic:"Classic", difficultyAdjust:"Difficulty Adjust", hideNumbers:"Hide numbers", hideGreat:"Hide 300s", hideFollowPoints:"Hide follow points", snakein:"Snake-in", snakeout:"Snake-out", showhwmouse:"Hardware cursor", autofullscreen:"Auto fullscreen", sysdpi:"Use system resolution", beatmapHitsound:"Beatmap hitsounds" };

// Map raw gamesettings keys to their GameState path namespace.
const PATH_NAMESPACE = {
  dim: "display.dim", blur: "display.blur", cursorsize: "display.cursorsize",
  dpiscale: "display.dpiscale", mastervolume: "audio.mastervolume",
  effectvolume: "audio.effectvolume", musicvolume: "audio.musicvolume",
  audiooffset: "audio.audiooffset",
  hideNumbers: "display.hideNumbers", hideGreat: "display.hideGreat",
  hideFollowPoints: "display.hideFollowPoints", snakein: "display.snakein",
  snakeout: "display.snakeout", showhwmouse: "display.showhwmouse",
  autofullscreen: "display.autofullscreen", sysdpi: "display.sysdpi",
  beatmapHitsound: "audio.beatmapHitsound",
  disableWheel: "input.disableWheel", disableButton: "input.disableButton",
  K1name: "input.K1name", K2name: "input.K2name",
  Kpausename: "input.Kpausename", Kpause2name: "input.Kpause2name",
  Kskipname: "input.Kskipname", K1keycode: "input.K1keycode",
  K2keycode: "input.K2keycode", Kpausekeycode: "input.Kpausekeycode",
  Kpause2keycode: "input.Kpause2keycode", Kskipkeycode: "input.Kskipkeycode",
  // mod flat flags
  autoplay: "mods.autoplay", easy: "mods.easy", hardrock: "mods.hardrock",
  nightcore: "mods.nightcore", daycore: "mods.daycore", hidden: "mods.hidden",
  nofail: "mods.nofail", suddendeath: "mods.suddendeath", perfect: "mods.perfect",
  spunout: "mods.spunout", classic: "mods.classic", difficultyAdjust: "mods.difficultyAdjust",
};

const gs = ref(gamesettings);

function set(key, val) {
  gamesettings[key] = val;
  const path = PATH_NAMESPACE[key] || ("settings." + key);
  GameState.set(path, val);
  saveToLocal();
  gs.value = { ...gamesettings };
}
function reset() { Object.assign(gamesettings, defaultsettings); gamesettings.loadToGame(); saveToLocal(); gs.value = { ...gamesettings }; }
async function savePfp(url) {
  // PFP is a per-user setting; only the owner of the account can set it.
  if (!api.isLoggedIn()) return;
  // Block javascript:/data: URLs that could execute in the img src.
  // Allow http(s):/relative-path only.
  const safe = typeof url === "string" ? url.trim() : "";
  if (safe && !/^(https?:|\/)/i.test(safe)) {
    if (typeof window.__showErrorPopup === "function") {
      window.__showErrorPopup("Only http(s) URLs or site-relative paths are allowed.", "Profile picture URL rejected");
    }
    return;
  }
  pfpUrlSaveStatus.value = "saving";
  try {
    await api.saveMyProfile({ pfp_url: safe });
    pfpUrl.value = safe;
    pfpUrlSaveStatus.value = "saved";
    setTimeout(() => { if (pfpUrlSaveStatus.value === "saved") pfpUrlSaveStatus.value = ""; }, 1500);
  } catch (e) {
    pfpUrlSaveStatus.value = "error";
    if (typeof window.__showErrorPopup === "function") {
      window.__showErrorPopup("Could not save profile picture: " + (e.message || e), "Profile picture");
    } else {
      console.warn("[settings] PFP save failed", e);
    }
    setTimeout(() => { if (pfpUrlSaveStatus.value === "error") pfpUrlSaveStatus.value = ""; }, 3000);
  }
}
function captureKey(ev, key) {
  ev.preventDefault();
  const handler = (e) => {
    e.preventDefault();
    const name = e.key.toUpperCase();
    gamesettings[key] = name;
    // also update the corresponding keycode field (e.g. K1name → K1keycode)
    const keycodeKey = key.replace("name", "keycode");
    if (keycodeKey !== key && keycodeKey in gamesettings) gamesettings[keycodeKey] = e.keyCode;
    GameState.set(PATH_NAMESPACE[key] || ("settings." + key), name);
    if (keycodeKey !== key && keycodeKey in gamesettings) {
      GameState.set(PATH_NAMESPACE[keycodeKey] || ("settings." + keycodeKey), e.keyCode);
    }
    saveToLocal();
    gs.value = { ...gamesettings };
    window.removeEventListener("keydown", handler, true);
  };
  window.addEventListener("keydown", handler, true);
}

onMounted(() => {
  const hasLocalChanges = (() => {
    try {
      const raw = JSON.parse(localStorage.getItem("osugamesettings") || "{}");
      return Object.keys(raw).some(k => k in defaultsettings && JSON.stringify(raw[k]) !== JSON.stringify(defaultsettings[k]));
    } catch { return false; }
  })();
  if (!hasLocalChanges && gamesettings.syncFromServer) {
    gamesettings.syncFromServer().then(() => { gs.value = { ...gamesettings }; }).catch(() => {});
  } else {
    gs.value = { ...gamesettings };
    if (window.game) gamesettings.loadToGame();
  }
  // Load PFP URL if logged in
  if (api.isLoggedIn()) {
    api.me().then((u) => { pfpUrl.value = u.pfp_url || ""; }).catch(() => {});
  }
});
</script>

<template>
  <div class="space-y-4">
    <div class="bg-lazer-panel border border-white/5 rounded-xl p-4">
      <h3 class="text-lazer-pink font-bold mb-2.5">Display</h3>
      <div v-for="s in SLIDERS.slice(0, 4)" :key="s[0]" class="flex items-center gap-2.5 my-2">
        <label class="text-lazer-dim text-sm w-[170px]">{{ s[1] }}</label>
        <input type="range" :min="s[2]" :max="s[3]" :step="s[4]" :value="gs[s[0]]"
          @input="set(s[0], +$event.target.value)"
          class="flex-1 h-1.5 rounded-full bg-[#2a2a38] appearance-none cursor-pointer" />
        <span class="w-12 text-right tabular-nums">{{ gs[s[0]] }}{{ s[5] }}</span>
      </div>
      <div class="grid gap-1.5 mt-3" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
        <label v-for="t in DISPLAY_TOGGLES" :key="t" class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" :checked="gs[t]" @change="set(t, $event.target.checked)" />
          {{ TOGGLE_LABELS[t] }}
        </label>
      </div>
    </div>
    <div class="bg-lazer-panel border border-white/5 rounded-xl p-4">
      <h3 class="text-lazer-pink font-bold mb-2.5">Audio</h3>
      <div v-for="s in SLIDERS.slice(4)" :key="s[0]" class="flex items-center gap-2.5 my-2">
        <label class="text-lazer-dim text-sm w-[170px]">{{ s[1] }}</label>
        <input type="range" :min="s[2]" :max="s[3]" :step="s[4]" :value="gs[s[0]]"
          @input="set(s[0], +$event.target.value)"
          class="flex-1 h-1.5 rounded-full bg-[#2a2a38] appearance-none cursor-pointer" />
        <span class="w-12 text-right tabular-nums">{{ gs[s[0]] }}{{ s[5] }}</span>
      </div>
      <label class="flex items-center gap-1.5 cursor-pointer mt-2">
        <input type="checkbox" :checked="gs.beatmapHitsound" @change="set('beatmapHitsound', $event.target.checked)" />
        Beatmap hitsounds
      </label>
    </div>
    <div class="bg-lazer-panel border border-white/5 rounded-xl p-4">
      <h3 class="text-lazer-pink font-bold mb-2.5">Keys</h3>
      <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));">
        <div v-for="k in KEYS" :key="k[0]" class="flex items-center gap-2">
          <span class="text-lazer-dim flex-1">{{ k[1] }}</span>
          <button @click="captureKey($event, k[0])"
            class="bg-lazer-panel2 text-lazer-text border border-white/12 rounded-lg px-2.5 py-1 text-sm cursor-pointer hover:bg-white/5">
            {{ gs[k[0]] }}
          </button>
        </div>
      </div>
    </div>
    <div class="bg-lazer-panel border border-white/5 rounded-xl p-4">
      <h3 class="text-lazer-pink font-bold mb-2.5">Skin</h3>
      <p class="text-lazer-dim text-sm">Manage skins on the <router-link to="/skins" class="text-lazer-pink hover:underline">Skins page</router-link>. Default: reowoTuna. Mods are now in the sidebar (Mods button in the nav or F1).</p>
    </div>
    <div class="bg-lazer-panel border border-white/5 rounded-xl p-4">
      <h3 class="text-lazer-pink font-bold mb-2.5">Profile</h3>
      <label class="text-lazer-dim text-sm">Profile picture URL</label>
      <input type="text" placeholder="https://example.com/avatar.png" :value="pfpUrl"
        @change="savePfp($event.target.value)"
        class="block w-full bg-lazer-bg border border-white/10 rounded-lg px-3 py-2 mt-1 mb-2 text-lazer-text focus:border-lazer-pink focus:outline-none text-sm" />
      <p class="text-lazer-dim text-xs">Paste an image link. Leave empty for initials avatar.</p>
    </div>
    <button @click="reset" class="bg-lazer-pink text-white rounded-lg px-4 py-2 text-sm hover:brightness-110">Reset to defaults</button>
  </div>
</template>
