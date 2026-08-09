<script setup>
import { ref, watch, onMounted } from "vue";
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
const diffBox = ref(null); // open difficulty box ref

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

function showDiff(set, ev) {
  ev.preventDefault(); ev.stopPropagation();
  // close existing
  if (diffBox.value) { diffBox.value.remove(); diffBox.value = null; }
  if (window._currentDiffList) { window._currentDiffList.remove(); window._currentDiffList = null; }

  const card = ev.currentTarget;
  const box = document.createElement("div");
  box.className = "difficulty-box";
  box.style.left = "0"; box.style.top = "100%";
  window._currentDiffList = box;

  const diffs = (set.beatmaps || []).filter(b => b.mode === "osu");
  for (const b of diffs) {
    const item = document.createElement("div");
    item.className = "difficulty-item";
    item.innerHTML =
      '<div class="bigringbase"></div><div class="bigring ' + starname(b.difficulty_rating) + '"></div>' +
      '<div class="versionline"><div class="version">' + b.version + '</div>' +
      '<div class="mapper">' + stars(b.difficulty_rating) + '\u2605</div></div>';
    item.onclick = (e) => {
      e.stopPropagation();
      document.dispatchEvent(new CustomEvent("beatmap-launch", { detail: { setId: set.id, beatmapId: b.id, version: b.version, title: set.title, artist: set.artist, stars: b.difficulty_rating } }));
      box.remove(); window._currentDiffList = null;
    };
    box.appendChild(item);
  }
  card.appendChild(box);
  box.onclick = (e) => e.stopPropagation();
  diffBox.value = box;
  setTimeout(() => {
    window.addEventListener("click", function close() {
      box.remove(); window._currentDiffList = null;
      window.removeEventListener("click", close);
    }, { once: true });
  }, 0);
}

onMounted(load);
</script>

<template>
  <div v-if="error" class="text-red-400 p-4">Failed to load: {{ error }}</div>
  <div v-else-if="!loading && !sets.length && emptyMessage" class="text-lazer-dim p-4">{{ emptyMessage }}</div>
  <div v-else class="flex flex-wrap gap-3">
    <article v-for="s in sets" :key="s.id"
      class="beatmap-card beatmapbox group relative cursor-pointer overflow-visible w-auto max-w-[420px] rounded-xl border border-white/5 shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl hover:border-lazer-pink/35"
      style="background: var(--lazer-panel);"
      @click="showDiff(s, $event)">
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
</template>
