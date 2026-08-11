<script setup>
import { ref, watch, onMounted, computed } from "vue";
import { api } from "../../shell/api.js";

const props = defineProps({ username: String });
const data = ref(null);
const recentPlays = ref([]);
const err = ref("");

async function load() {
  if (!props.username) { err.value = "no username"; return; }
  err.value = "";
  try {
    data.value = await api.profile(props.username);
    // fetch recent plays
    try { const r = await api.profileRecent(props.username, 20); recentPlays.value = (r && r.items) || r || []; } catch { recentPlays.value = []; }
  }
  catch (e) { err.value = String(e.message || e); data.value = null; }
}
watch(() => props.username, load);
onMounted(load);

// PFP: image if pfp_url, else initials avatar
const user = computed(() => (data.value && data.value.user) || {});
const pfpUrl = computed(() => user.value.pfp_url || "");
const hasPfp = computed(() => !!pfpUrl.value);
const initial = computed(() => (user.value.username || props.username || "?").charAt(0).toUpperCase());
const totalPP = computed(() => (user.value.total_pp || 0).toFixed(0));
const globalRank = computed(() => data.value && data.value.globalRank ? "#" + data.value.globalRank : "—");
const countryRank = computed(() => data.value && data.value.countryRank ? "#" + data.value.countryRank : "");

function gradeColor(grade) {
  if (!grade) return "#888";
  if (grade.startsWith("SS") || grade === "S") return "#ffd966";
  if (grade === "A") return "#66cc66";
  if (grade === "B") return "#4aa3e8";
  if (grade === "C") return "#c863c8";
  return "#e15555";
}
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const d = Math.floor(h / 24);
  return d + "d ago";
}
</script>

<template>
  <div v-if="err && !data" class="text-red-400">{{ err }}</div>
  <div v-else-if="!data" class="bg-lazer-panel rounded-xl p-4">Loading…</div>
  <div v-else class="bg-lazer-panel border border-white/8 rounded-xl p-4">
    <!-- Header: PFP + username + ranks -->
    <div class="flex items-center gap-4 mb-4">
      <div class="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center bg-lazer-panel2 border-2 border-lazer-pink/30 shrink-0">
        <img v-if="hasPfp" :src="pfpUrl" :alt="user.username" class="w-full h-full object-cover"
             @error="$event.target.style.display='none'; $event.target.nextElementSibling.style.display='flex'" />
        <div v-if="!hasPfp" class="w-full h-full flex items-center justify-center text-2xl font-bold text-lazer-pink">{{ initial }}</div>
        <div v-else class="w-full h-full flex items-center justify-center text-2xl font-bold text-lazer-pink" style="display:none">{{ initial }}</div>
      </div>
      <div class="flex-1">
        <h2 class="text-lazer-pink text-xl font-bold">{{ user.username || username }}</h2>
        <div class="text-lazer-dim text-sm">{{ user.bio || "webosu player" }}</div>
        <div class="flex gap-3 mt-1 text-sm">
          <span v-if="globalRank !== '—'" class="text-white font-bold">Global {{ globalRank }}</span>
          <span v-if="countryRank" class="text-lazer-dim">Country {{ countryRank }}</span>
        </div>
      </div>
      <div class="text-right">
        <div class="text-lazer-dim text-xs uppercase tracking-wide">Total PP</div>
        <div class="text-2xl font-bold text-white">{{ totalPP }}</div>
      </div>
    </div>
    <!-- Stats grid -->
    <div class="grid gap-2.5 mb-4" style="grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));">
      <div class="bg-lazer-panel2 rounded-lg px-3 py-2.5" v-for="stat in [
        { k: 'Plays', v: (data.stats || {}).plays || 0 },
        { k: 'Max score', v: ((data.stats || {}).max_score || 0).toLocaleString() },
        { k: 'Max combo', v: (data.stats || {}).max_combo || 0 },
        { k: 'Avg acc', v: ((data.stats || {}).avg_acc || 0).toFixed(2) + '%' },
        { k: '300s', v: (data.stats || {}).c300 || 0 },
        { k: 'Misses', v: (data.stats || {}).miss || 0 },
      ]" :key="stat.k">
        <div class="text-lazer-dim text-xs uppercase tracking-wide">{{ stat.k }}</div>
        <div class="text-lg font-bold">{{ stat.v }}</div>
      </div>
    </div>
    <!-- Recent plays -->
    <div v-if="recentPlays.length" class="mt-4">
      <div class="text-xs uppercase tracking-wide text-lazer-dim mb-2">Recent plays</div>
      <div class="space-y-1.5 max-h-[400px] overflow-y-auto">
        <div v-for="play in recentPlays" :key="play.id" class="flex items-center gap-3 bg-lazer-panel2 rounded-lg px-3 py-2">
          <div class="font-bold text-sm w-8 text-center" :style="{ color: gradeColor(play.grade) }">{{ play.grade }}</div>
          <div class="flex-1 min-w-0">
            <div class="text-sm text-lazer-text truncate">{{ play.title }} [{{ play.version }}]</div>
            <div class="text-xs text-lazer-dim">{{ (play.acc || 0).toFixed(2) }}% • {{ play.mods || "NM" }} • {{ timeAgo(play.created_at) }}</div>
          </div>
          <div v-if="play.pp > 0" class="text-sm font-bold text-lazer-pink">{{ Math.round(play.pp) }}pp</div>
        </div>
      </div>
    </div>
    <div v-else class="text-lazer-dim text-sm mt-2">No recent plays yet</div>
    <!-- Achievements -->
    <div v-if="(data.achievements || []).length" class="flex flex-wrap gap-1.5 mt-4">
      <span v-for="a in (data.achievements || [])" :key="a.key"
        class="bg-lazer-pink/16 text-lazer-pink border border-lazer-pink/30 rounded-full px-2.5 py-0.5 text-sm">
        {{ a.key }}
      </span>
    </div>
  </div>
</template>