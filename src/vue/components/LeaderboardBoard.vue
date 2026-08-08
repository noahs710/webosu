<script setup>
import { ref, watch, onMounted } from "vue";
import { api } from "../../shell/api.js";

const props = defineProps({ bid: [Number, String], mods: { default: 0 } });
const rows = ref([]);
const err = ref("");
const loading = ref(false);

async function load() {
  if (props.bid == null) { err.value = "no beatmap id"; return; }
  loading.value = true; err.value = "";
  try { rows.value = await api.leaderboard(props.bid, props.mods || 0); }
  catch (e) { err.value = String(e.message || e); }
  loading.value = false;
}
watch(() => props.bid, load);
onMounted(load);
</script>

<template>
  <div v-if="err" class="text-red-400 p-4">{{ err }}</div>
  <div v-else-if="loading" class="text-lazer-dim p-4">Loading…</div>
  <div v-else-if="!rows.length" class="text-lazer-dim p-4 text-center">No scores yet. Be the first!</div>
  <table v-else class="w-full border-collapse bg-lazer-panel rounded-xl overflow-hidden">
    <thead>
      <tr class="text-lazer-dim text-xs uppercase tracking-wide font-semibold">
        <th class="py-2 px-2.5 text-left w-11 text-lazer-pink">#</th>
        <th class="py-2 px-2.5 text-left">Player</th>
        <th class="py-2 px-2.5 text-left">Score</th>
        <th class="py-2 px-2.5 text-left text-lazer-dim">Acc</th>
        <th class="py-2 px-2.5 text-left text-lazer-dim">Combo</th>
        <th class="py-2 px-2.5 text-left">Grade</th>
        <th class="py-2 px-2.5 text-left text-lazer-dim">Mods</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, i) in rows" :key="i" class="hover:bg-lazer-pink/6 border-t border-white/6">
        <td class="py-2 px-2.5 text-lazer-pink font-bold">{{ i + 1 }}</td>
        <td class="py-2 px-2.5">{{ r.username }}</td>
        <td class="py-2 px-2.5">{{ (r.score || 0).toLocaleString() }}</td>
        <td class="py-2 px-2.5 text-lazer-dim">{{ (r.acc || 0).toFixed(2) }}%</td>
        <td class="py-2 px-2.5 text-lazer-dim">{{ r.max_combo || 0 }}</td>
        <td class="py-2 px-2.5 font-bold">{{ r.grade || "-" }}</td>
        <td class="py-2 px-2.5 text-lazer-dim">{{ r.mods || "-" }}</td>
      </tr>
    </tbody>
  </table>
</template>
