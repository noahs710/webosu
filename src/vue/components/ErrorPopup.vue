<script setup>
import { ref, watch } from "vue";

const props = defineProps({
   message: { type: String, default: "" },
   title: { type: String, default: "Something went wrong" },
   // When true, clicking the backdrop or pressing Escape does NOT dismiss.
   // (Reserved for future use; today we always let the user dismiss.)
   blocking: { type: Boolean, default: false },
});

const emit = defineEmits(["dismiss"]);

const visible = ref(true);
function close() {
   visible.value = false;
   emit("dismiss");
}

function onKey(e) {
   if (e.key === "Escape" && !props.blocking) close();
}
</script>

<template>
   <div v-if="visible"
      data-error-popup
      class="fixed inset-0 flex items-center justify-center"
      style="z-index: 2147483647; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(8, 8, 14, 0.92); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); image-rendering: auto;"
      @click.self="close"
      @keydown="onKey"
      tabindex="-1">
      <div class="bg-lazer-panel border border-red-500/40 rounded-xl shadow-2xl max-w-[480px] w-[92vw] p-5 text-lazer-text"
         role="alertdialog"
         aria-modal="true"
         @click.stop>
         <div class="flex items-start gap-3 mb-3">
            <div class="shrink-0 w-9 h-9 rounded-full bg-red-500/15 border border-red-500/40 flex items-center justify-center text-red-300 font-bold text-lg">!</div>
            <div class="flex-1">
               <h3 class="text-base font-bold text-red-300 leading-tight">{{ title }}</h3>
               <p class="text-sm text-lazer-text mt-1 break-words whitespace-pre-wrap">{{ message }}</p>
            </div>
         </div>
         <div class="flex justify-end gap-2 pt-2 border-t border-white/5">
            <button @click="close"
               class="px-4 py-1.5 rounded-lg text-sm font-bold bg-lazer-pink text-white hover:brightness-110 focus:outline-none">
               Dismiss
            </button>
         </div>
      </div>
   </div>
</template>
