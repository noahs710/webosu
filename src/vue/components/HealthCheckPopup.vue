<script setup>
import { ref } from "vue";

const props = defineProps({
  issueType: String,   // "skin" or "hitsounds"
  message: String,    // plain-language explanation
  missing: Array,     // missing items
  corrupt: Array,     // corrupt items (skin only)
});

const emit = defineEmits(["repair", "reset", "dismiss"]);

function repair() { emit("repair"); }
function reset() { emit("reset"); }
function dismiss() { emit("dismiss"); }
</script>

<template>
  <div class="fixed inset-0 z-[600] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.7); backdrop-filter: blur(4px);">
    <div class="bg-lazer-panel border border-lazer-pink/30 rounded-2xl shadow-2xl max-w-[480px] w-full p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="text-3xl">⚠️</div>
        <h3 class="text-lg font-bold text-lazer-pink">{{ issueType === 'skin' ? 'Skin Issue Detected' : 'Hitsound Issue Detected' }}</h3>
      </div>
      <p class="text-lazer-text text-sm mb-4">{{ message }}</p>
      <div v-if="missing && missing.length" class="text-lazer-dim text-xs mb-2">
        <span class="font-bold">Missing:</span> {{ missing.join(", ") }}
      </div>
      <div v-if="corrupt && corrupt.length" class="text-lazer-dim text-xs mb-4">
        <span class="font-bold">Corrupt:</span> {{ corrupt.join(", ") }}
      </div>
      <div class="text-lazer-dim text-xs mb-4">
        {{ issueType === 'skin'
          ? 'The game will still work with fallback textures, but some elements may appear as white squares. Re-import the skin or reset to the default skin to fix this.'
          : 'The game will still work but some sounds will be silent. Re-import the skin or reset to default to fix this.' }}
      </div>
      <div class="flex gap-2 justify-end">
        <button @click="dismiss" class="px-4 py-2 text-sm rounded-lg bg-lazer-panel2 border border-white/10 text-lazer-dim hover:bg-white/5">Dismiss</button>
        <button @click="reset" class="px-4 py-2 text-sm rounded-lg bg-lazer-panel2 border border-white/10 text-lazer-text hover:bg-white/5">Reset to default</button>
        <button @click="repair" class="px-4 py-2 text-sm rounded-lg bg-lazer-pink text-white hover:brightness-110">Repair (re-import)</button>
      </div>
    </div>
  </div>
</template>