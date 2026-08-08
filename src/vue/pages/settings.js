import SettingsPanel from "../components/SettingsPanel.vue";
export default {
  components: { SettingsPanel },
  template: `
    <div class="max-w-[1400px] mx-auto px-4 pt-4" style="max-width: 768px;">
      <h2 class="text-xl font-bold text-white mb-3">Settings</h2>
      <SettingsPanel />
    </div>
  `
};
