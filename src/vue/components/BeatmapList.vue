<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import { ensureGame } from "../game-loader.js";
import { getCachedBeatmaps, setCachedBeatmaps, clearCachedBeatmaps } from "../../shell/beatmapCache.js";
import { addFavorite, removeFavorite, getFavorites } from "../../shell/favorites.js";

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
const favSet = ref(new Set());
const launching = ref(false);

async function loadFavorites() {
  try { favSet.value = await getFavorites(); } catch { favSet.value = new Set(); }
}
function isFav(setId) { return favSet.value.has(setId); }
async function toggleFav(setId, ev) {
  if (ev) { ev.stopPropagation(); ev.preventDefault(); }
  if (isFav(setId)) { favSet.value = await removeFavorite(setId); }
  else { favSet.value = await addFavorite(setId); }
  favSet.value = new Set(favSet.value); // trigger reactivity
}

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

async function load(force = false) {
  if (!props.src && !props.sids) return;
  // empty sids array means no favorites/history — show empty without fetching
  if (props.sids && !props.sids.length) {
    if (Array.isArray(props.sids) && props.sids.length === 0) {
      sets.value = []; loading.value = false; return;
    }
  }
  const cacheKey = { src: props.src, sids: props.sids, limit: props.limit };
  if (!force) {
    const cached = getCachedBeatmaps(cacheKey);
    if (cached) {
      sets.value = cached;
      loading.value = false;
      error.value = "";
      return;
    }
  } else {
    clearCachedBeatmaps(cacheKey);
  }
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
    // The API already filters by mode=0 (osu standard); keep all sets returned.
    // Guard against null/missing beatmaps arrays (deleted sets).
    let filtered = (data || []).filter(s => s && s.beatmaps && Array.isArray(s.beatmaps)).slice(0, props.limit);
    // retry once if search returned empty (random offset may hit empty page)
    if (!filtered.length && props.src && props.src.includes('search') && !props.sids) {
       try {
         const retrySrc = props.src.includes('offset=') ? props.src.replace(/offset=\d+/, `offset=${Math.floor(Math.random()*400)}`) : `https://catboy.best/api/v2/search?q=&limit=6&offset=${Math.floor(Math.random()*400)}&status=1&status=3&status=4&mode=0`;
         const rr = await fetch(retrySrc);
         if (rr.ok) {
           const rdata = await rr.json();
            const rfiltered = (rdata || []).filter(s => s && s.beatmaps && Array.isArray(s.beatmaps)).slice(0, props.limit);
           if (rfiltered.length) {
              filtered = rfiltered;
              if (import.meta.env.DEV) console.log("[BeatmapList] retry hit", retrySrc, rfiltered.length);
           }
         }
       } catch {}
    }
    sets.value = filtered;
    // cache filtered result for smoother back-navigation
    try { setCachedBeatmaps(cacheKey, filtered); } catch {}
    if (import.meta.env.DEV) console.log("[BeatmapList] fetched & cached", cacheKey, filtered.length);
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

function reload() { load(true); }

watch(() => [props.src, props.sids], () => load(false));
// expose reload for parent pages / manual reload button
defineExpose({ reload, load });

let previewAudio = null;
function stopPreview() {
  if (previewAudio) {
    try { previewAudio.pause(); previewAudio.src = ""; } catch {}
    // softstop for launchgame compatibility
    if (previewAudio.softstop) try { previewAudio.softstop(); } catch {}
    previewAudio = null;
  }
  // also stop any other preview audios in DOM (legacy)
  try {
    const audios = document.getElementsByTagName("audio");
    for (let i = 0; i < audios.length; i++) if (audios[i].softstop) try { audios[i].softstop(); } catch {}
  } catch {}
}
function playPreview(set) {
  stopPreview();
  if (!set || !set.id) return;
  try {
    // catboy.best preview is at https://b.ppy.sh/preview/{setId}.mp3 (also catboy mirrors it)
    // Use Howler if available for better control, otherwise HTMLAudio
    const url = `https://b.ppy.sh/preview/${set.id}.mp3`;
    const audio = new Audio(url);
    audio.volume = 0.45;
    audio.loop = true;
    // softstop helper for launchgame to stop preview when game starts
    audio.softstop = function() {
      try {
        const a = this;
        const fade = setInterval(() => {
          if (a.volume > 0.05) a.volume -= 0.05;
          else { clearInterval(fade); a.pause(); }
        }, 40);
        setTimeout(() => { try { a.pause(); } catch {} }, 600);
      } catch {}
    };
    audio.addEventListener("error", () => { /* ignore, preview may not exist */ });
    previewAudio = audio;
    audio.play().catch(()=>{});
    if (import.meta.env.DEV) console.log("[BeatmapList] preview play", set.id);
  } catch (e) { if (import.meta.env.DEV) console.warn("[BeatmapList] preview failed", e); }
}
function openModal(set, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  selectedSet.value = set;
  showModal.value = true;
  document.body.style.overflow = "hidden";
  if (import.meta.env.DEV) console.log("[BeatmapList] open modal", set?.id, set?.title, "diffs", (set?.beatmaps||[]).filter(b=>b.mode==="osu").length);
  playPreview(set);
}
function closeModal() {
  if (!showModal.value) return;
  showModal.value = false;
  selectedSet.value = null;
  document.body.style.overflow = "";
  stopPreview();
  if (import.meta.env.DEV) console.log("[BeatmapList] close modal");
}
function waitForReadiness() {
  return new Promise((resolve) => {
    if (window.skinReady && window.soundReady) return resolve();
    const interval = setInterval(() => {
      if (window.skinReady && window.soundReady) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

async function launch(b) {
  const s = selectedSet.value;
  if (!s || !b) return;
  console.log("[BeatmapList] launch", s.id, b.id, b.version);
  stopPreview();
  document.dispatchEvent(new CustomEvent("beatmap-launch", { detail: { setId: s.id, beatmapId: b.id, version: b.version, title: s.title, artist: s.artist, stars: b.difficulty_rating } }));
  closeModal();
}
function openLeaderboard(b) {
  if (!b || !b.id) return;
  const modsHash = (window.ModRegistry && window.ModRegistry.serialize) ? window.ModRegistry.serialize().sort().join(",") : "";
  const url = "/leaderboard?bid=" + encodeURIComponent(b.id) + (modsHash ? "&mods_hash=" + encodeURIComponent(modsHash) : "");
  window.open(url, "_blank");
}
function onKey(e) {
  if (e.key === "Escape" && showModal.value) closeModal();
}
onMounted(() => {
  load();
  loadFavorites();
  window.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKey);
  stopPreview();
});
</script>

<template>
  <div v-if="error" class="text-red-400 p-4">Failed to load: {{ error }} <button @click="reload" class="ml-2 text-lazer-pink hover:underline">Retry</button></div>
  <div v-else-if="!loading && !sets.length && emptyMessage" class="text-lazer-dim p-4">{{ emptyMessage }}</div>
  <div v-else>
    <div v-if="sets.length" class="flex justify-end mb-2">
      <button @click="load(true)" :disabled="loading" class="text-xs text-lazer-dim hover:text-white disabled:opacity-50 flex items-center gap-1 px-2 py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/5">
        {{ loading ? 'Loading...' : 'More' }}
      </button>
    </div>
    <div class="flex flex-wrap gap-3">
    <article v-for="s in sets" :key="s.id"
      class="beatmap-card beatmapbox group relative cursor-pointer overflow-hidden w-auto max-w-[420px] rounded-xl border border-white/5 shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl hover:border-lazer-pink/35"
      style="background: var(--lazer-panel);"
      @click="openModal(s, $event)">
      <div class="overflow-hidden rounded-t-xl relative">
        <img :src="'https://assets.ppy.sh/beatmaps/' + s.id + '/covers/card@2x.jpg'"
             alt="" loading="lazy"
             class="w-full h-[140px] object-cover rounded-t-xl transition-transform duration-200 ease-out group-hover:scale-105"
             @error="$event.target.style.display='none'" />
        <button @click="toggleFav(s.id, $event)"
          class="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-lg hover:bg-black/70 transition"
          :class="isFav(s.id) ? 'text-lazer-pink' : 'text-white/50'" title="Toggle favorite">
          {{ isFav(s.id) ? '♥' : '♡' }}
        </button>
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
          <button @click.stop="toggleFav(selectedSet.id, $event)"
            class="absolute top-3 right-12 w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-lg hover:bg-black/70 transition"
            :class="isFav(selectedSet.id) ? 'text-lazer-pink' : 'text-white/50'" title="Toggle favorite">
            {{ isFav(selectedSet.id) ? '♥' : '♡' }}
          </button>
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
            <button @click.stop="openLeaderboard(b)" class="text-xs text-lazer-dim hover:text-lazer-pink px-2 py-1 rounded border border-white/10 hover:border-lazer-pink/30 transition" title="View leaderboard">🏆</button>
            <div class="text-lazer-pink text-sm">{{ launching ? '⏳' : '▶' }}</div>
          </div>
        </div>
        <div class="p-3 border-t border-white/5 flex justify-end gap-2 shrink-0">
          <button class="px-4 py-2 rounded-xl bg-lazer-panel2 border border-white/10 text-sm hover:bg-white/5" @click="closeModal">Close (Esc)</button>
        </div>
      </div>
    </div>
  </teleport>
</template>
