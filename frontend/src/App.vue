<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from './stores/settings';
import LanguageSelector from './components/LanguageSelector.vue';
import VariantSelector from './components/VariantSelector.vue';

const route = useRoute();
const settingsStore = useSettingsStore();
const { t } = useI18n();

const activeView = computed(() => {
  return route.name as 'clusters' | 'speakers' | 'cluster-heatmap' | 'speaker-speaker-heatmap' | 'cluster-cluster-heatmap' | 'duration-heatmap' | 'umap' | 'about';
});

const themeIcon = computed(() => {
  if (settingsStore.themeMode === 'auto') return '🌓';
  if (settingsStore.themeMode === 'light') return '☀️';
  return '🌙';
});

const themeLabel = computed(() => {
  if (settingsStore.themeMode === 'auto') return t('theme.auto');
  if (settingsStore.themeMode === 'light') return t('theme.light');
  return t('theme.dark');
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div class="container mx-auto px-4 py-4 md:py-6">
        <div class="flex items-start justify-between flex-col sm:flex-row gap-4">
          <div class="flex-1">
            <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white">
              {{ t('app.title') }}
            </h1>
            <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 md:mt-2">
              {{ t('app.subtitle') }}
            </p>
          </div>
          
          <div class="flex flex-wrap items-center gap-2 sm:gap-3">
            <!-- Variant Selector -->
            <VariantSelector />
            
            <!-- Language Selector -->
            <LanguageSelector />
            
            <!-- Theme Toggle -->
            <button
              @click="settingsStore.cycleThemeMode()"
              class="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              :title="t('theme.current', { mode: themeLabel })"
            >
              <span class="text-xl sm:text-2xl">{{ themeIcon }}</span>
              <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:inline">{{ themeLabel }}</span>
            </button>
          </div>
        </div>
        
        <!-- Tab Navigation with Router Links -->
        <div class="mt-4 md:mt-6 -mx-4 px-4 overflow-x-auto border-b border-gray-200 dark:border-gray-700">
          <div class="flex gap-1 sm:gap-2 min-w-max">
            <router-link
              to="/clusters"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'clusters' 
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.topics') }}
            </router-link>
            <router-link
              to="/speakers"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'speakers' 
                  ? 'border-green-500 text-green-600 dark:text-green-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.speakers') }}
            </router-link>
            <router-link
              to="/cluster-heatmap"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'cluster-heatmap' 
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.speakerClusters') }}
            </router-link>
            <router-link
              to="/cluster-cluster-heatmap"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'cluster-cluster-heatmap' 
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.clusterCluster') }}
            </router-link>
            <router-link
              to="/speaker-speaker-heatmap"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'speaker-speaker-heatmap' 
                  ? 'border-teal-500 text-teal-600 dark:text-teal-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.speakerSpeaker') }}
            </router-link>
            <router-link
              to="/duration-heatmap"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'duration-heatmap' 
                  ? 'border-violet-500 text-violet-600 dark:text-violet-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.duration') }}
            </router-link>
            <!-- Temporarily hidden UMAP tab
            <router-link
              to="/umap"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'umap' 
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.umap') }}
            </router-link>
            -->
            <router-link
              to="/about"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'about' 
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
          >
            {{ t('nav.about') }}
          </router-link>
          </div>
        </div>
      </div>
    </header>

    <main class="container mx-auto px-2 sm:px-4 py-4 sm:py-6 md:py-8">
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
