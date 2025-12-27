<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsStore } from './stores/settings';

const route = useRoute();
const settingsStore = useSettingsStore();

const activeView = computed(() => {
  return route.name as 'topics' | 'categories' | 'speakers' | 'heatmap' | 'cluster-heatmap' | 'speaker-speaker-heatmap' | 'cluster-cluster-heatmap' | 'about';
});

const themeIcon = computed(() => {
  if (settingsStore.themeMode === 'auto') return '🌓';
  if (settingsStore.themeMode === 'light') return '☀️';
  return '🌙';
});

const themeLabel = computed(() => {
  if (settingsStore.themeMode === 'auto') return 'Auto';
  if (settingsStore.themeMode === 'light') return 'Hell';
  return 'Dunkel';
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div class="container mx-auto px-4 py-6">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h1 class="text-4xl font-bold text-gray-900 dark:text-white">
              Freak Show Visualisierung
            </h1>
            <p class="text-gray-600 dark:text-gray-400 mt-2">
              Visualisierung der Themen- und Sprecher-Entwicklung über die Jahre
            </p>
          </div>
          
          <!-- Theme Toggle -->
          <button
            @click="settingsStore.cycleThemeMode()"
            class="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            :title="`Aktuell: ${themeLabel}`"
          >
            <span class="text-2xl">{{ themeIcon }}</span>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ themeLabel }}</span>
          </button>
        </div>
        
        <!-- Tab Navigation with Router Links -->
        <div class="mt-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <router-link
            to="/categories"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'categories' 
                ? 'border-purple-500 text-purple-600 dark:text-purple-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Kategorien
          </router-link>
          <router-link
            to="/topics"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'topics' 
                ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Themen
          </router-link>
          <router-link
            to="/speakers"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'speakers' 
                ? 'border-green-500 text-green-600 dark:text-green-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Sprecher
          </router-link>
          <router-link
            to="/heatmap"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'heatmap' 
                ? 'border-pink-500 text-pink-600 dark:text-pink-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Sprecher × Kategorien
          </router-link>
          <router-link
            to="/cluster-heatmap"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'cluster-heatmap' 
                ? 'border-orange-500 text-orange-600 dark:text-orange-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Sprecher × Cluster
          </router-link>
          <router-link
            to="/cluster-cluster-heatmap"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'cluster-cluster-heatmap' 
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Cluster × Cluster
          </router-link>
          <router-link
            to="/speaker-speaker-heatmap"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'speaker-speaker-heatmap' 
                ? 'border-teal-500 text-teal-600 dark:text-teal-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Sprecher × Sprecher
          </router-link>
          <router-link
            to="/about"
            :class="[
              'px-6 py-3 font-semibold border-b-2 transition-colors',
              activeView === 'about' 
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
            ]"
          >
            Über
          </router-link>
        </div>
      </div>
    </header>

    <main class="container mx-auto px-4 py-8">
      <router-view />
    </main>
  </div>
</template>

<style>
#app {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
