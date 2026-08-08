import { createApp } from "vue";
import "../styles.css";
import Nav from "../components/Nav.vue";
import SettingsPanel from "../components/SettingsPanel.vue";

createApp({
  components: { Nav, SettingsPanel },
  template: `
    <Nav active="settings" />
    <div class="main-page max-w-[1400px] mx-auto px-4 pt-4 max-w-3xl">
      <h2 class="text-xl font-bold text-white mb-3">Settings</h2>
      <SettingsPanel />
    </div>
  `
}).mount("#app");
