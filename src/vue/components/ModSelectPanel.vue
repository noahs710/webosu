<script setup>
import { ref, computed, onMounted } from "vue";
import { gamesettings, saveToLocal } from "../../shell/gamesettings.js";
import GameState from "../../shell/gamestate.js";

// Mod definitions grouped by type (matches lazer mod-select panel layout).
// Each mod: { acronym, name, type, color, hasSettings }
const MOD_GROUPS = [
  { label: "Difficulty Increase", mods: [
    { a: "HR", n: "Hard Rock", color: "#ff6b6b" },
    { a: "DT", n: "Double Time", color: "#4ecdc4" },
    { a: "NC", n: "Nightcore", color: "#c9b1ff" },
    { a: "HD", n: "Hidden", color: "#a8a8a8" },
    { a: "FL", n: "Flashlight", color: "#ffd93d", settings: true },
  ]},
  { label: "Difficulty Reduction", mods: [
    { a: "EZ", n: "Easy", color: "#6bcf7f" },
    { a: "HT", n: "Half Time", color: "#6bcf7f" },
    { a: "NF", n: "No Fail", color: "#6bcf7f" },
    { a: "SD", n: "Sudden Death", color: "#ff6b6b" },
    { a: "PF", n: "Perfect", color: "#ff6b6b" },
    { a: "SO", n: "Spun Out", color: "#6bcf7f" },
    { a: "DA", n: "Difficulty Adjust", color: "#4aa3e8", settings: true },
  ]},
  { label: "Automation", mods: [
    { a: "AT", n: "Autoplay", color: "#4ecdc4" },
    { a: "RX", n: "Relax", color: "#4ecdc4" },
    { a: "AP", n: "AutoPilot", color: "#4ecdc4" },
  ]},
  { label: "Conversion", mods: [
    { a: "CL", n: "Classic", color: "#ffd93d" },
    { a: "TP", n: "Target Practice", color: "#ffd93d", settings: true },
  ]},
  { label: "Fun", mods: [
    { a: "AS", n: "Adaptive Speed", color: "#c9b1ff", settings: true },
    { a: "MG", n: "Magnetised", color: "#c9b1ff" },
    { a: "WO", n: "Wobble", color: "#c9b1ff" },
    { a: "WU", n: "Wind Up", color: "#c9b1ff" },
    { a: "TR", n: "Traceable", color: "#c9b1ff" },
    { a: "AD", n: "Approach Different", color: "#c9b1ff" },
    { a: "BU", n: "Bubbles", color: "#c9b1ff" },
    { a: "RP", n: "Repel", color: "#c9b1ff" },
    { a: "DP", n: "Depth", color: "#c9b1ff" },
    { a: "TF", n: "Transform", color: "#c9b1ff", settings: true },
    { a: "NS", n: "No Scope", color: "#c9b1ff" },
  ]},
];

// Settings definitions for mods with customization
const MOD_SETTINGS = {
  DA: [{ key: "customAR", label: "AR", min: -10, max: 10, step: 0.1 },
       { key: "customCS", label: "CS", min: -10, max: 10, step: 0.1 },
       { key: "customOD", label: "OD", min: -10, max: 10, step: 0.1 },
       { key: "customHP", label: "HP", min: -10, max: 10, step: 0.1 }],
  FL: [{ key: "flSize0", label: "Size (combo 0)", min: 200, max: 600, step: 10 },
       { key: "flSize200", label: "Size (combo 200+)", min: 100, max: 400, step: 10 }],
  TP: [{ key: "tpSize", label: "Target size", min: 0.5, max: 2, step: 0.05 }],
  AS: [{ key: "asMaxRate", label: "Max rate", min: 1.0, max: 1.2, step: 0.01 }],
  TF: [{ key: "tfRotate", label: "Rotation", min: 0, max: 360, step: 1 }],
};

// Map mod acronyms to gamesettings flat flags (the bridge to the old settings system)
const MOD_FLAG = {
  HR: "hardrock", EZ: "easy", DT: "doubletime", NC: "nightcore", HT: "daycore",
  HD: "hidden", NF: "nofail", SD: "suddendeath", PF: "perfect", SO: "spunout",
  CL: "classic", DA: "difficultyAdjust", AT: "autoplay", FL: "flashlight",
  // New mods don't have flat flags; they're driven by ModRegistry directly via game flags
  RX: "relax", AP: "autopilot", TP: "targetpractice", AS: "adaptiveSpeed",
  MG: "magnetised", WO: "wobble", WU: "windup", TR: "traceable",
  AD: "approachDifferent", BU: "bubbles", RP: "repel", DP: "depth",
  TF: "transform", NS: "noscope",
};

const activeMods = ref(new Set());
const showSettings = ref(null);  // acronym of the mod whose settings dialog is open
const gs = ref(gamesettings);

// Initialize active mods from gamesettings flags
function syncFromGamesettings() {
  const set = new Set();
  for (const [acronym, flag] of Object.entries(MOD_FLAG)) {
    if (gamesettings[flag]) set.add(acronym);
  }
  activeMods.value = set;
}
syncFromGamesettings();

function toggle(acronym) {
  const set = new Set(activeMods.value);
  if (set.has(acronym)) {
    set.delete(acronym);
    // NC implies DT — unchecking DT also unchecks NC
    if (acronym === "DT") set.delete("NC");
  } else {
    set.add(acronym);
    // NC implies DT — selecting NC also selects DT
    if (acronym === "NC") set.add("DT");
  }
  // Run registry validation to prune incompatible mods (last-selected wins).
  const validated = validateSet(set);
  activeMods.value = validated;
  applyToGamesettings();
}

function isActive(acronym) { return activeMods.value.has(acronym); }

function isDisabled(acronym) {
  // A mod is disabled if it conflicts with any currently active mod (and is not already active).
  if (activeMods.value.has(acronym)) return false;
  if (!window.ModRegistry || !window.ModRegistry.validateActiveSet) return false;
  const trial = new Set(activeMods.value);
  trial.add(acronym);
  const { removed } = window.ModRegistry.validateActiveSet(Array.from(trial));
  return removed.includes(acronym);
}

function validateSet(set) {
  const specs = Array.from(set).map(a => ({
    acronym: a,
    settings: a === "DA" ? daSettingsFromGamesettings() : undefined,
  }));
  if (window.ModRegistry && window.ModRegistry.validateActiveSet) {
    const { valid } = window.ModRegistry.validateActiveSet(specs);
    return new Set(valid.map(s => (typeof s === "string" ? s : s.acronym)));
  }
  return set;
}

function daSettingsFromGamesettings() {
  return {
    ar: parseFloat(gamesettings.customAR) || 0,
    cs: parseFloat(gamesettings.customCS) || 0,
    od: parseFloat(gamesettings.customOD) || 0,
    hp: parseFloat(gamesettings.customHP) || 0,
  };
}

function applyToGamesettings() {
  // Route every mod flag through GameState so the registry and legacy game
  // flags stay in sync. GameState.setBatch takes the path-keyed API.
  const updates = {};
  for (const [acronym, flag] of Object.entries(MOD_FLAG)) {
    updates["mods." + flag] = activeMods.value.has(acronym);
  }
  GameState.setBatch(updates);
  GameState.syncLegacy();
  saveToLocal();
  gs.value = { ...gamesettings };
}

function deselectAll() {
  activeMods.value = new Set();
  applyToGamesettings();
}

function resetToDefault() {
  // Reset to no mods (lazer default = nomod)
  deselectAll();
}

function setModSetting(key, val) {
  // Per-mod customization settings (flSize0, customAR, …) live under the
  // "settings.<key>" namespace in GameState; the mod flag itself will be
  // re-applied next time the registry activates.
  GameState.set("settings." + key, val);
  if (activeMods.value.has("FL") || activeMods.value.has("DA") || activeMods.value.has("TP") || activeMods.value.has("AS") || activeMods.value.has("TF")) {
    GameState.syncLegacy();
  }
  // If FL is currently active, also push the new size into the running
  // playback so the in-game flashlight resizes without requiring a replay.
  if (key === "flSize0" || key === "flSize200") {
    try {
      const flMod = window.ModRegistry ? window.ModRegistry.get("FL") : null;
      if (flMod && flMod.settings) {
        const s0 = parseFloat(gamesettings.flSize0) || 400;
        const s200 = parseFloat(gamesettings.flSize200) || 250;
        flMod.settings.sizeCombo0 = s0;
        flMod.settings.sizeCombo100 = Math.round(s0 + (s200 - s0) * 0.5);
        flMod.settings.sizeCombo200 = s200;
      }
      if (window.playback && typeof window.playback.refreshFlashlight === "function") {
        window.playback.refreshFlashlight();
      }
    } catch (e) {}
  }
  saveToLocal();
  gs.value = { ...gamesettings };
}

// Compute the aggregate score multiplier from the ModRegistry
const scoreMultiplier = computed(() => {
  if (window.ModRegistry && window.ModRegistry.scoreMultiplier) {
    const m = window.ModRegistry.scoreMultiplier();
    return m > 0 ? m.toFixed(2) + "x" : "unranked";
  }
  return "1.00x";
});
</script>

<template>
  <div class="space-y-3">
    <div v-for="group in MOD_GROUPS" :key="group.label">
      <div class="text-lazer-dim text-xs font-bold uppercase tracking-wider mb-1.5">{{ group.label }}</div>
      <div class="flex flex-wrap gap-2">
        <button v-for="mod in group.mods" :key="mod.a"
          @click="toggle(mod.a)"
          :class="['mod-badge', { active: isActive(mod.a), disabled: isDisabled(mod.a) }]"
          :style="{ '--mod-color': mod.color }"
          :disabled="isDisabled(mod.a)"
          class="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all text-sm font-bold"
        >
          <span class="mod-acronym">{{ mod.a }}</span>
          <span class="mod-name text-xs opacity-70">{{ mod.n }}</span>
          <button v-if="mod.settings && isActive(mod.a)"
            @click.stop="showSettings = showSettings === mod.a ? null : mod.a"
            class="mod-gear ml-0.5 opacity-60 hover:opacity-100 text-xs"
            title="Customize">⚙</button>
        </button>
      </div>
      <!-- Settings dialog for the mod being customized -->
      <div v-if="showSettings && MOD_SETTINGS[showSettings] && group.mods.some(m => m.a === showSettings)"
        class="mt-2 p-3 bg-lazer-panel border border-white/5 rounded-lg">
        <div v-for="s in MOD_SETTINGS[showSettings]" :key="s.key" class="flex items-center gap-2.5 my-1.5">
          <label class="text-lazer-dim text-sm w-[140px]">{{ s.label }}</label>
          <input type="range" :min="s.min" :max="s.max" :step="s.step" :value="gs[s.key] || 0"
            @input="setModSetting(s.key, +$event.target.value)"
            class="flex-1 h-1.5 rounded-full bg-[#2a2a38] appearance-none cursor-pointer" />
          <span class="text-xs text-lazer-text w-12 text-right">{{ gs[s.key] || 0 }}</span>
        </div>
      </div>
    </div>
    <!-- Footer: multiplier + deselect + reset -->
    <div class="flex items-center justify-between pt-2 border-t border-white/5">
      <div class="flex gap-2">
        <button @click="deselectAll" class="px-3 py-1.5 text-xs rounded-lg bg-lazer-panel border border-white/5 hover:border-white/20 transition">Deselect All</button>
        <button @click="resetToDefault" class="px-3 py-1.5 text-xs rounded-lg bg-lazer-panel border border-white/5 hover:border-white/20 transition">Reset to Default</button>
      </div>
      <div class="text-sm font-bold" :class="{ 'text-lazer-pink': scoreMultiplier !== '1.00x' }">
        Score Multiplier: {{ scoreMultiplier }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.mod-badge {
  border-color: rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
  color: var(--mod-color, #fff);
}
.mod-badge:hover {
  border-color: var(--mod-color, #fff);
  background: rgba(255,255,255,0.05);
}
.mod-badge.active {
  border-color: var(--mod-color, #fff);
  background: color-mix(in srgb, var(--mod-color, #fff) 15%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--mod-color, #fff) 30%, transparent);
}
.mod-badge.active .mod-acronym {
  text-shadow: 0 0 8px var(--mod-color, #fff);
}
.mod-badge.disabled {
  opacity: 0.35;
  cursor: not-allowed;
  filter: grayscale(0.6);
}
.mod-acronym {
  font-weight: 800;
  letter-spacing: 0.5px;
}
</style>