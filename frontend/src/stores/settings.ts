import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  // State
  const normalizedView = ref(false);
  
  // Actions
  function toggleNormalizedView() {
    normalizedView.value = !normalizedView.value;
  }
  
  function setNormalizedView(value: boolean) {
    normalizedView.value = value;
  }
  
  return {
    normalizedView,
    toggleNormalizedView,
    setNormalizedView
  };
}, {
  persist: true // Aktiviert localStorage Persistenz
});

