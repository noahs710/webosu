<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { api } from "../../shell/api.js";

const feed = ref([]);
const empty = ref(false);
const errored = ref(false);
let es = null;

function gradeColor(g) {
  return ({ SS: "#f6c060", S: "#f6c060", A: "#66cc66", B: "#5aa6df", C: "#c863c8", D: "#e15555", F: "#e15555" })[g] || "var(--lazer-dim)";
}
function makeRow(s) {
  return { username: s.username, title: (s.title || "beatmap") + " [" + (s.version || "") + "]",
    score: parseInt(s.score || 0, 10).toLocaleString(), grade: s.grade || "-",
    gradeColor: gradeColor(s.grade), mods: s.mods || "" };
}

onMounted(async () => {
  try {
    const list = await api.recentActivity();
    if (!list || !list.length) { empty.value = true; }
    else { feed.value = list.map(makeRow); }
    // only start SSE if backend is reachable
    try {
      es = api.activityStream();
      es.addEventListener("message", (ev) => {
        try {
          const s = JSON.parse(ev.data);
          feed.value.unshift(makeRow(s));
          if (feed.value.length > 22) feed.value.pop();
          empty.value = false;
        } catch {}
      });
    } catch {}
  } catch {
    errored.value = true;
  }
});
onUnmounted(() => { if (es) es.close(); });
</script>

<template>
  <div class="max-w-[900px] mx-auto mb-4">
    <div class="text-lazer-pink text-lg my-1.5">Recent scores</div>
    <div v-if="errored" class="text-lazer-dim text-center py-4">Could not load activity feed.</div>
    <div v-else-if="empty" class="text-lazer-dim text-center py-4">No scores yet. Be the first!</div>
    <div v-for="(s, i) in feed" :key="i"
      class="flex gap-2.5 items-center py-1.5 px-2 border-b border-lazer-panel2 text-sm">
      <span class="text-lazer-purple min-w-[110px]">{{ s.username }}</span>
      <span class="flex-1 text-lazer-text truncate">{{ s.title }}</span>
      <span class="text-lazer-text tabular-nums">{{ s.score }}</span>
      <span class="font-bold min-w-[30px] text-center" :style="{ color: s.gradeColor }">{{ s.grade }}</span>
      <span v-if="s.mods" class="text-lazer-dim text-xs">{{ s.mods }}</span>
    </div>
  </div>
</template>
