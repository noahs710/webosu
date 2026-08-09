<script setup>
import { ref, onMounted } from "vue";
import { gamesettings, defaultsettings, saveToLocal } from "../../shell/gamesettings.js";
import { loadOsk, cacheSkin, clearCachedSkin } from "../../game/skin-loader.js";

const SLIDERS = [
  ["dim", "Background dim", 0, 100, 1, "%"], ["blur", "Background blur", 0, 100, 1, "%"],
  ["cursorsize", "Cursor size", 0.5, 2, 0.05, "x"], ["dpiscale", "Resolution", 0.5, 2, 0.05, "x"],
  ["mastervolume", "Master volume", 0, 100, 1, "%"], ["effectvolume", "Effect volume", 0, 100, 1, "%"],
  ["musicvolume", "Music volume", 0, 100, 1, "%"], ["audiooffset", "Audio offset", -200, 200, 1, "ms"],
];
const DISPLAY_TOGGLES = ["hideNumbers","hideGreat","hideFollowPoints","snakein","snakeout","showhwmouse","autofullscreen","sysdpi","disableVideo"];
const MOD_TOGGLES = ["easy","hardrock","nightcore","daycore","hidden","nofail","suddendeath","perfect","spunout","classic","difficultyAdjust"];
const KEYS = [["K1name","K1"],["K2name","K2"],["Kpausename","Pause"],["Kpause2name","Pause 2"],["Kskipname","Skip"]];
const TOGGLE_LABELS = { easy:"Easy", hardrock:"Hard Rock", nightcore:"Nightcore", daycore:"Daycore", hidden:"Hidden", nofail:"No Fail", suddendeath:"Sudden Death", perfect:"Perfect", spunout:"Spun Out", classic:"Classic", difficultyAdjust:"Difficulty Adjust", hideNumbers:"Hide numbers", hideGreat:"Hide 300s", hideFollowPoints:"Hide follow points", snakein:"Snake-in", snakeout:"Snake-out", showhwmouse:"Hardware cursor", autofullscreen:"Auto fullscreen", sysdpi:"Use system resolution", beatmapHitsound:"Beatmap hitsounds", disableVideo:"Disable video (force no-video beatmap)" };

const gs = ref(gamesettings);
const skinStatus = ref("");
const skinName = ref("");

async function importOsk(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  skinStatus.value = "Loading " + file.name + "...";
  try {
    const skinData = await loadOsk(file);
    await cacheSkin(skinData);
    skinName.value = skinData.config ? skinData.config.name || file.name : file.name;
    skinStatus.value = "Skin loaded: " + skinName.value + " (" + Object.keys(skinData.textures).length + " textures, " + Object.keys(skinData.sounds).length + " sounds). Applied on next game.";
  } catch (e) {
    skinStatus.value = "Failed: " + (e.message || e);
  }
}

async function removeSkin() {
  await clearCachedSkin();
  skinName.value = "";
  skinStatus.value = "Skin removed. Default will be used.";
}

function set(key, val) { gs.value[key] = val; gamesettings.loadToGame(); saveToLocal(); gs.value = { ...gamesettings }; }
function reset() { Object.assign(gamesettings, defaultsettings); gamesettings.loadToGame(); saveToLocal(); gs.value = { ...gamesettings }; }
function captureKey(ev, key) {
  ev.preventDefault();
  const handler = (e) => {
    e.preventDefault();
    const name = e.key.length === 1 ? e.key.toUpperCase() : e.key.toUpperCase();
    gamesettings[key] = name; gamesettings.loadToGame(); saveToLocal();
    gs.value = { ...gamesettings };
    window.removeEventListener("keydown", handler, true);
  };
  window.addEventListener("keydown", handler, true);
}

onMounted(() => {
  if (gamesettings.syncFromServer) gamesettings.syncFromServer().then(() => { gs.value = { ...gamesettings }; }).catch(() => {});
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
      <h3 class="text-lazer-pink font-bold mb-2.5">Mods</h3>
      <div class="grid gap-1.5" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));">
        <label v-for="t in MOD_TOGGLES" :key="t" class="flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" :checked="gs[t]" @change="set(t, $event.target.checked)" />
          {{ TOGGLE_LABELS[t] }}
        </label>
      </div>
    </div>
    <div class="bg-lazer-panel border border-white/5 rounded-xl p-4">
    <h3 class="text-lazer-pink font-bold mb-2.5">Skin (.osk)</h3>
    <p class="text-lazer-dim text-sm mb-3">Import an osu! skin file (.osk). All textures, hitsounds, and skin.ini settings are applied on your next game.</p>
    <input type="file" accept=".osk,.zip" @change="importOsk" class="mb-2" />
    <button v-if="skinName" @click="removeSkin" class="text-red-400 text-sm ml-2">Remove skin</button>
    <div class="text-sm mt-2" :class="skinStatus.includes('Failed') ? 'text-red-400' : 'text-lazer-dim'">{{ skinStatus }}</div>
  </div>
  <button @click="reset" class="bg-lazer-pink text-white rounded-lg px-4 py-2 text-sm hover:brightness-110">Reset to defaults</button>
  </div>
</template>
