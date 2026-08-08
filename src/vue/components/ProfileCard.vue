<script setup>
import { ref, watch, onMounted } from "vue";
import { api } from "../../shell/api.js";

const props = defineProps({ username: String });
const data = ref(null);
const err = ref("");

async function load() {
  if (!props.username) { err.value = "no username"; return; }
  err.value = "";
  try { data.value = await api.profile(props.username); }
  catch (e) { err.value = String(e.message || e); data.value = null; }
}
watch(() => props.username, load);
onMounted(load);
</script>

<template>
  <div v-if="err && !data" class="text-red-400">{{ err }}</div>
  <div v-else-if="!data" class="bg-lazer-panel rounded-xl p-4">Loading…</div>
  <div v-else class="bg-lazer-panel border border-white/8 rounded-xl p-4">
    <h2 class="text-lazer-pink text-lg font-bold mb-1">{{ (data.user || {}).username || username }}</h2>
    <div class="text-lazer-dim text-sm mb-4">webosu profile</div>
    <div class="grid gap-2.5" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));">
      <div class="bg-lazer-panel2 rounded-lg px-3 py-2.5" v-for="stat in [
        { k: 'Plays', v: (data.stats || {}).plays || 0 },
        { k: 'Max score', v: ((data.stats || {}).max_score || 0).toLocaleString() },
        { k: 'Max combo', v: (data.stats || {}).max_combo || 0 },
        { k: 'Avg acc', v: ((data.stats || {}).avg_acc || 0).toFixed(2) + '%' },
        { k: '300s', v: (data.stats || {}).c300 || 0 },
        { k: 'Misses', v: (data.stats || {}).miss || 0 },
      ]" :key="stat.k">
        <div class="text-lazer-dim text-xs uppercase tracking-wide">{{ stat.k }}</div>
        <div class="text-xl font-bold">{{ stat.v }}</div>
      </div>
    </div>
    <div v-if="(data.achievements || []).length" class="flex flex-wrap gap-1.5 mt-4">
      <span v-for="a in (data.achievements || [])" :key="a.key"
        class="bg-lazer-pink/16 text-lazer-pink border border-lazer-pink/30 rounded-full px-2.5 py-0.5 text-sm">
        {{ a.key }}
      </span>
    </div>
  </div>
</template>
