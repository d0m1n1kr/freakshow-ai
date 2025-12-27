import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  // State
  const normalizedView = ref(false);
  const topicFilter = ref(15);
  const speakerFilter = ref(15);
  const topNSpeakersHeatmap = ref(15);
  const topNCategoriesHeatmap = ref(10);
  const topNSpeakersClusterHeatmap = ref(15);
  const topNClustersHeatmap = ref(20);
  
  // Actions
  function toggleNormalizedView() {
    normalizedView.value = !normalizedView.value;
  }
  
  function setNormalizedView(value: boolean) {
    normalizedView.value = value;
  }
  
  return {
    normalizedView,
    topicFilter,
    speakerFilter,
    topNSpeakersHeatmap,
    topNCategoriesHeatmap,
    topNSpeakersClusterHeatmap,
    topNClustersHeatmap,
    toggleNormalizedView,
    setNormalizedView
  };
}, {
  persist: {
    key: 'freakshow-settings',
    storage: window.localStorage,
  }
});

