<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import TopicRiver from '../components/TopicRiver.vue';
import NoVariantsMessage from '../components/NoVariantsMessage.vue';
// import VariantInfoPanel from '../components/VariantInfoPanel.vue';
import type { TopicRiverData } from '../types';
import { loadVariantData } from '@/composables/useVariants';
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
const topicData = ref<TopicRiverData | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const noVariants = ref(false);

async function loadData() {
  loading.value = true;
  error.value = null;
  noVariants.value = false;
  
  try {
    topicData.value = await loadVariantData<TopicRiverData>('topic-river-data.json');
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unbekannter Fehler';
    // Check if error is due to missing variants
    if (errorMessage.includes('Failed to load') || errorMessage.includes('404')) {
      noVariants.value = true;
    } else {
      error.value = errorMessage;
    }
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  loadData();
});

// Watch for variant changes and reload data
watch(() => settings.clusteringVariant, () => {
  loadData();
});

// Watch for podcast changes and reload data
watch(() => settings.selectedPodcast, () => {
  loadData();
});
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Lade Themen-Daten...</p>
    </div>
  </div>

  <NoVariantsMessage v-else-if="noVariants" />

  <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
    <p class="text-red-800 dark:text-red-200 font-semibold">{{ error }}</p>
  </div>

  <div v-else-if="topicData">
    <!-- Temporarily hidden
    <VariantInfoPanel class="mb-6" />
    -->
    
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-3 sm:p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{{ topicData.statistics.totalTopics || 0 }}</div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Themen insgesamt</div>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
            {{ topicData.statistics.yearRange.start }} - {{ topicData.statistics.yearRange.end }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Zeitspanne</div>
        </div>
      </div>
    </div>

    <TopicRiver :data="topicData" color="blue" />
    
    <footer class="p-3 sm:p-4 text-center text-gray-500 dark:text-gray-400 text-xs sm:text-sm border-t border-gray-200 dark:border-gray-700">
      <p>Generiert am: {{ new Date(topicData.generatedAt).toLocaleString('de-DE') }}</p>
    </footer>
    </div>
  </div>
</template>

