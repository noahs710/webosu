import { createApp, ref, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import LeaderboardBoard from "../components/LeaderboardBoard.vue";

createApp({
  components: { Nav, LeaderboardBoard },
  setup() {
    const bid = ref(null);
    const mods = ref(0);
    onMounted(() => {
      const q = new URLSearchParams(location.search);
      bid.value = parseInt(q.get("bid") || "0", 10) || null;
      mods.value = parseInt(q.get("mods") || "0", 10) || 0;
    });
    return { bid, mods };
  },
  template: `
    <Nav active="leaderboard" />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Leaderboard</h2>
      <LeaderboardBoard v-if="bid" :bid="bid" :mods="mods" />
      <div v-else class="text-lazer-dim p-4">No beatmap selected. Use the leaderboard link from the results screen.</div>
    </div>
  `
}).mount("#app");
