<script setup lang="ts">
import { ref, onMounted } from 'vue';
import TopicRiver from '../components/TopicRiver.vue';
import type { TopicRiverData } from '../types';

const categoryData = ref<TopicRiverData | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    const response = await fetch('/category-river-data.json');
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Kategorie-Daten');
    }
    
    categoryData.value = await response.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unbekannter Fehler';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600">Lade Kategorie-Daten...</p>
    </div>
  </div>

  <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
    <p class="text-red-800 font-semibold">{{ error }}</p>
  </div>

  <div v-else-if="categoryData" class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
    <div class="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-purple-100">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600">{{ categoryData.statistics.totalCategories || 0 }}</div>
          <div class="text-sm text-gray-600 mt-1">Kategorien insgesamt</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600">
            {{ categoryData.statistics.yearRange.start }} - {{ categoryData.statistics.yearRange.end }}
          </div>
          <div class="text-sm text-gray-600 mt-1">Zeitspanne</div>
        </div>
      </div>
    </div>

    <TopicRiver :data="categoryData" color="purple" />
    
    <footer class="p-4 text-center text-gray-500 text-sm border-t border-gray-200">
      <p>Generiert am: {{ new Date(categoryData.generatedAt).toLocaleString('de-DE') }}</p>
    </footer>
  </div>
</template>

