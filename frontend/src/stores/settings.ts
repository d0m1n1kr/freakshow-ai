import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
  // State
  const normalizedView = ref(false);
  const topicFilter = ref(15);
  const speakerFilter = ref(15);
  const topNSpeakersHeatmap = ref(15);
  const topNCategoriesHeatmap = ref(10);
  const topNSpeakersClusterHeatmap = ref(15);
  const topNClustersHeatmap = ref(20);
  const topNClustersCluster1Heatmap = ref(20);
  const topNClustersCluster2Heatmap = ref(20);
  const topNSpeakers1Heatmap = ref(15);
  const topNSpeakers2Heatmap = ref(15);
  const topNSpeakersSpeaker1Heatmap = ref(15);
  const topNSpeakersSpeaker2Heatmap = ref(15);
  
  // Clustering variant selection
  const clusteringVariant = ref<string>('auto-v2.1');
  
  // Dark mode: 'auto' | 'light' | 'dark'
  const themeMode = ref<'auto' | 'light' | 'dark'>('auto');
  
  // Computed: actual dark mode state
  const isDarkMode = computed(() => {
    if (themeMode.value === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return themeMode.value === 'dark';
  });
  
  // Actions
  function toggleNormalizedView() {
    normalizedView.value = !normalizedView.value;
  }
  
  function setNormalizedView(value: boolean) {
    normalizedView.value = value;
  }
  
  function setThemeMode(mode: 'auto' | 'light' | 'dark') {
    themeMode.value = mode;
    applyTheme();
  }
  
  function cycleThemeMode() {
    const modes: Array<'auto' | 'light' | 'dark'> = ['auto', 'light', 'dark'];
    const currentIndex = modes.indexOf(themeMode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    if (nextMode) {
      setThemeMode(nextMode);
    }
  }
  
  function applyTheme() {
    console.log('applyTheme called, isDarkMode:', isDarkMode.value, 'themeMode:', themeMode.value);
    if (isDarkMode.value) {
      document.documentElement.classList.add('dark');
      console.log('Added dark class to html');
    } else {
      document.documentElement.classList.remove('dark');
      console.log('Removed dark class from html');
    }
    console.log('Current classes:', document.documentElement.className);
  }
  
  function setClusteringVariant(variant: string) {
    clusteringVariant.value = variant;
  }
  
  // Watch for theme changes
  watch([themeMode, isDarkMode], () => {
    applyTheme();
  });
  
  return {
    normalizedView,
    topicFilter,
    speakerFilter,
    topNSpeakersHeatmap,
    topNCategoriesHeatmap,
    topNSpeakersClusterHeatmap,
    topNClustersHeatmap,
    topNClustersCluster1Heatmap,
    topNClustersCluster2Heatmap,
    topNSpeakers1Heatmap,
    topNSpeakers2Heatmap,
    topNSpeakersSpeaker1Heatmap,
    topNSpeakersSpeaker2Heatmap,
    clusteringVariant,
    themeMode,
    isDarkMode,
    toggleNormalizedView,
    setNormalizedView,
    setClusteringVariant,
    setThemeMode,
    cycleThemeMode,
    applyTheme
  };
}, {
  persist: {
    key: 'freakshow-settings',
    storage: window.localStorage,
  }
});

