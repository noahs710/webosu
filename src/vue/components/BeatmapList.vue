<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { ensureGame } from "../game-loader.js";

const props = defineProps({
  src: String,
  sids: { default: null },
  limit: { default: 12 },
  emptyMessage: { default: "" },
});
// beatmap-launch is dispatched as a DOM CustomEvent (caught by app.js)
const sets = ref([]);
const loading = ref(false);
const error = ref("");
const selectedSet = ref(null);
const showModal = ref(false);

function starname(star) {
  if (star == null) return "unknown";
  if (star < 2) return "easy";
  if (star < 2.7) return "normal";
  if (star < 4) return "hard";
  if (star < 5.3) return "insane";
  if (star < 6.5) return "expert";
  return "expert-plus";
}
function stars(rating) { return (Math.round(rating * 100) / 100).toFixed(2); }

async function load() {
  if (!props.src && !props.sids) return;
  error.value = ""; loading.value = true;
  try {
    let data;
    if (props.sids && props.sids.length) {
      const r = await fetch("https://catboy.best/api/v2/beatmapsets?ids=" + props.sids.join("&ids="));
      if (!r.ok) throw new Error("sets " + r.status);
      data = await r.json();
    } else if (props.sids) {
      sets.value = []; loading.value = false; return;
    } else {
      const r = await fetch(props.src);
      if (!r.ok) throw new Error("search " + r.status);
      data = await r.json();
    }
    sets.value = (data || []).filter(s => s.beatmaps && s.beatmaps.some(b => b.mode === "osu")).slice(0, props.limit);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

watch(() => [props.src, props.sids], load);

function openModal(set, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  selectedSet.value = set;
  showModal.value = true;
  document.body.style.overflow = "hidden";
  console.log("[BeatmapList] open modal", set?.id, set?.title, "diffs", (set?.beatmaps||[]).filter(b=>b.mode==="osu").length);
}
function closeModal() {
  if (!showModal.value) return;
  showModal.value = false;
  selectedSet.value = null;
  document.body.style.overflow = "";
  console.log("[BeatmapList] close modal");
}
function launch(b) {
  const s = selectedSet.value;
  if (!s || !b) return;
  console.log("[BeatmapList] launch", s.id, b.id, b.version);
  document.dispatchEvent(new CustomEvent("beatmap-launch", { detail: { setId: s.id, beatmapId: b.id, version: b.version, title: s.title, artist: s.artist, stars: b.difficulty_rating } }));
  closeModal();
}
function onKey(e) {
  if (e.key === "Escape" && showModal.value) closeModal();
}
onMounted(() => {
  load();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div v-if="error" class="text-red-400 p-4">Failed to load: {{ error }}</div>
  <div v-else-if="!loading && !sets.length && emptyMessage" class="text-lazer-dim p-4">{{ emptyMessage }}</div>
  <div v-else class="flex flex-wrap gap-3">
    <article v-for="s in sets" :key="s.id"
      class="beatmap-card beatmapbox group relative cursor-pointer overflow-hidden w-auto max-w-[420px] rounded-xl border border-white/5 shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl hover:border-lazer-pink/35"
      style="background: var(--lazer-panel);"
      @click="openModal(s, $event)">
      <div class="overflow-hidden rounded-t-xl">
        <img :src="'https://assets.ppy.sh/beatmaps/' + s.id + '/covers/card@2x.jpg'"
             alt="" loading="lazy"
             class="w-full h-[140px] object-cover rounded-t-xl transition-transform duration-200 ease-out group-hover:scale-105"
             @error="$event.target.style.display='none'" />
      </div>
      <div class="p-3">
        <div class="font-bold text-lazer-text truncate">{{ s.title }}</div>
        <div class="text-sm text-lazer-dim truncate mb-1.5">{{ s.artist }}</div>
        <div class="flex items-center gap-[2px]">
          <template v-if="(s.beatmaps || []).filter(b => b.mode === 'osu').length <= 13">
            <div v-for="(b, i) in (s.beatmaps || []).filter(b => b.mode === 'osu')" :key="i"
                 class="difficulty-bar" :class="starname(b.difficulty_rating)"></div>
          </template>
          <template v-else>
            <div class="difficulty-bar" :class="starname((s.beatmaps || []).filter(b => b.mode === 'osu').slice(-1)[0].difficulty_rating)"></div>
            <span class="text-xs text-lazer-dim ml-0.5">{{ (s.beatmaps || []).filter(b => b.mode === 'osu').length }}</span>
          </template>
        </div>
      </div>
    </article>
  </div>

  <!-- Difficulty / Map Info Modal -->
  <teleport to="body">
    <div v-if="showModal && selectedSet" class="fixed inset-0 z-[500] flex items-center justify-center p-4" @click.self="closeModal" @keydown.esc="closeModal">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeModal"></div>
      <div class="relative bg-lazer-panel border border-white/10 rounded-2xl shadow-2xl max-w-[560px] w-full max-h-[88vh] flex flex-col overflow-hidden">
        <div class="relative h-[180px] shrink-0 overflow-hidden">
          <img :src="'https://assets.ppy.sh/beatmaps/' + selectedSet.id + '/covers/cover@2x.jpg'" alt="" class="w-full h-full object-cover" @error="$event.target.style.display='none'" />
          <div class="absolute inset-0 bg-gradient-to-t from-lazer-panel via-lazer-panel/40 to-transparent"></div>
          <button @click="closeModal" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70" aria-label="Close">✕</button>
          <div class="absolute bottom-0 left-0 right-0 p-4">
            <div class="text-xl font-bold text-white drop-shadow">{{ selectedSet.title }}</div>
            <div class="text-sm text-white/80">{{ selectedSet.artist }}</div>
            <div class="text-xs text-white/60 mt-1">by {{ selectedSet.creator }} • {{ (selectedSet.beatmaps||[]).filter(b=>b.mode==='osu').length }} difficulties</div>
          </div>
        </div>
        <div class="p-4 overflow-y-auto space-y-2">
          <div class="text-xs uppercase tracking-wide text-lazer-dim mb-2">Select difficulty</div>
          <div v-for="b in (selectedSet.beatmaps||[]).filter(b=>b.mode==='osu').slice().sort((a,b)=>a.difficulty_rating-b.difficulty_rating)" :key="b.id"
               class="difficulty-item cursor-pointer hover:border-lazer-pink/40" @click="launch(b)">
            <div class="bigringbase"></div><div class="bigring" :class="starname(b.difficulty_rating)"></div>
            <div class="versionline flex-1">
              <div class="version">{{ b.version }}</div>
              <div class="mapper">{{ stars(b.difficulty_rating) }}★ • {{ (b.hit_length||0) }}s • AR{{ b.ar ?? '?' }} CS{{ b.cs ?? '?' }} OD{{ b.accuracy ?? b.od ?? '?' }} HP{{ b.drain ?? '?' }}</div>
            </div>
            <div class="text-lazer-pink text-sm">▶</div>
          </div>
        </div>
        <div class="p-3 border-t border-white/5 flex justify-end gap-2 shrink-0">
          <button class="px-4 py-2 rounded-xl bg-lazer-panel2 border border-white/10 text-sm hover:bg-white/5" @click="closeModal">Close (Esc)</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
