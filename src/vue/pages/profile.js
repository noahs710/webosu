import { createApp, ref, onMounted } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import ProfileCard from "../components/ProfileCard.vue";

createApp({
  components: { Nav, ProfileCard },
  setup() {
    const username = ref("");
    onMounted(() => {
      username.value = new URLSearchParams(location.search).get("u") || localStorage.getItem("username") || "";
    });
    return { username };
  },
  template: `
    <Nav />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4">
      <h2 class="text-xl font-bold text-white mb-3">Profile</h2>
      <ProfileCard :username="username" />
    </div>
  `
}).mount("#app");
