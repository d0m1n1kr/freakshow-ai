<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from './stores/settings';
import { useAudioPlayerStore } from './stores/audioPlayer';
import LanguageSelector from './components/LanguageSelector.vue';
import MiniAudioPlayer from './components/MiniAudioPlayer.vue';

const route = useRoute();
const router = useRouter();
const settingsStore = useSettingsStore();
const audioPlayerStore = useAudioPlayerStore();
const { t } = useI18n();

// Podcast dropdown state
const showPodcastDropdown = ref(false);

// Get current podcast info
const currentPodcast = computed(() => {
  return settingsStore.availablePodcasts.find(p => p.id === settingsStore.selectedPodcast) || settingsStore.availablePodcasts[0];
});

const podcastLogoUrl = computed(() => {
  return currentPodcast.value?.logoUrl || 'https://freakshow.fm/files/2013/07/cropped-freakshow-logo-600x600-180x180.jpg';
});

const podcastHomeUrl = computed(() => {
  return currentPodcast.value?.homeUrl || 'https://freakshow.fm/';
});

const podcastName = computed(() => {
  return currentPodcast.value?.name || 'Freak Show';
});

const searchTabName = computed(() => {
  return currentPodcast.value?.tabName || t('nav.search');
});

const selectPodcast = async (podcastId: string) => {
  // Update URL with podcast parameter
  await router.push({ 
    ...route, 
    query: { 
      ...route.query, 
      podcast: podcastId 
    } 
  });
  showPodcastDropdown.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (!target.closest('.podcast-selector')) {
    showPodcastDropdown.value = false;
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

const activeView = computed(() => {
  return route.name as
    | 'clusters-river'
    | 'speakers-river'
    | 'cluster-heatmap'
    | 'speaker-speaker-heatmap'
    | 'cluster-cluster-heatmap'
    | 'duration-heatmap'
    | 'search'
    | 'episodes'
    | 'umap'
    | 'about';
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

const searchText = ref('');

watch(
  () => route.query?.q,
  (q) => {
    if (typeof q === 'string') searchText.value = q;
  },
  { immediate: true }
);

// Watch for podcast parameter in URL and sync with store
watch(
  () => route.query?.podcast,
  (podcastId) => {
    if (typeof podcastId === 'string' && podcastId.trim()) {
      const id = podcastId.trim();
      // Update store if different from current value
      if (settingsStore.selectedPodcast !== id) {
        settingsStore.setSelectedPodcast(id);
      }
    }
  },
  { immediate: true }
);

const submitEpisodeSearch = async () => {
  const q = searchText.value.trim();
  if (!q) return;
  await router.push({ 
    name: 'episodes', 
    query: { 
      ...route.query,
      q 
    } 
  });
};

const submitAIChat = async () => {
  const q = searchText.value.trim();
  if (!q) return;
  await router.push({ 
    name: 'search', 
    query: { 
      ...route.query,
      q 
    } 
  });
};
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
    <header class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div class="container mx-auto px-4 py-4 md:py-6">
        <div class="flex items-start justify-between flex-col lg:flex-row gap-4">
          <div class="flex-1 min-w-0 flex items-start gap-3">
            <a
              v-if="currentPodcast"
              :href="podcastHomeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-1 flex-shrink-0"
              :aria-label="currentPodcast.name"
              :title="currentPodcast.name"
            >
              <img
                :src="podcastLogoUrl"
                :alt="currentPodcast.name"
                class="w-10 h-10 sm:w-12 sm:h-12 rounded-lg shadow-sm ring-1 ring-gray-200 dark:ring-gray-700"
                loading="lazy"
                referrerpolicy="no-referrer"
              />
            </a>
            <div class="flex-1 min-w-0">
              <div class="podcast-selector relative inline-block">
                <button
                  @click="showPodcastDropdown = !showPodcastDropdown"
                  class="flex items-center gap-2 whitespace-nowrap group"
                  :title="podcastName"
                >
                  <h1 class="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {{ podcastName }}
                  </h1>
                  <span class="text-sm sm:text-base px-2 py-1 rounded-md bg-gradient-to-r from-blue-500 to-teal-400 text-white font-bold uppercase tracking-wider shadow-md flex-shrink-0">
                    {{ t('app.titleBadge') }}
                  </span>
                  <svg 
                    class="w-5 h-5 sm:w-6 sm:h-6 text-gray-600 dark:text-gray-400 transition-transform flex-shrink-0"
                    :class="{ 'rotate-180': showPodcastDropdown }"
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <!-- Dropdown -->
                <div
                  v-if="showPodcastDropdown && settingsStore.availablePodcasts.length > 1"
                  class="absolute left-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
                >
                  <button
                    v-for="podcast in settingsStore.availablePodcasts"
                    :key="podcast.id"
                    @click="selectPodcast(podcast.id)"
                    class="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    :class="{
                      'bg-blue-50 dark:bg-blue-900/20': settingsStore.selectedPodcast === podcast.id
                    }"
                  >
                    <img
                      v-if="podcast.logoUrl"
                      :src="podcast.logoUrl"
                      :alt="podcast.name"
                      class="w-8 h-8 rounded-lg flex-shrink-0"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                    />
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300 flex-1 text-left">{{ podcast.name }}</span>
                    <svg
                      v-if="settingsStore.selectedPodcast === podcast.id"
                      class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
              <p class="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1 md:mt-2">
                {{ t('app.subtitle') }}
              </p>
            </div>
          </div>
          
          <div class="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto lg:justify-end">
            <!-- Search -->
            <form
              class="flex items-center gap-0 w-full sm:w-auto"
              @submit.prevent="submitEpisodeSearch"
            >
              <input
                v-model="searchText"
                type="search"
                :placeholder="t('app.searchPlaceholder')"
                class="flex-1 min-w-0 sm:w-56 md:w-72 px-3 py-2 rounded-l-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 border-r-0"
              />
              <div class="flex">
                <button
                  type="submit"
                  class="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors border-y border-r border-blue-600"
                  :title="t('app.searchEpisodes')"
                >
                  {{ t('app.searchEpisodes') }}
                </button>
                <button
                  type="button"
                  @click="submitAIChat"
                  class="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors rounded-r-lg border border-purple-600"
                  :title="t('app.askAI')"
                >
                  {{ t('app.askAI') }}
                </button>
              </div>
            </form>

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
              to="/episodes"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'episodes' 
                  ? 'border-purple-500 text-purple-600 dark:text-purple-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.episodes') }}
            </router-link>
            <router-link
              to="/clusters-river"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'clusters-river' 
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ t('nav.topics') }}
            </router-link>
            <router-link
              to="/speakers-river"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap',
                activeView === 'speakers-river' 
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
            <router-link
              to="/search"
              :class="[
                'px-3 sm:px-4 md:px-6 py-2 md:py-3 text-sm md:text-base font-semibold border-b-2 transition-colors whitespace-nowrap inline-flex items-center gap-1.5',
                activeView === 'search' 
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400' 
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
              ]"
            >
              {{ searchTabName }}
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">
                beta
              </span>
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

    <main 
      class="container mx-auto px-2 sm:px-4 py-4 sm:py-6 md:py-8" 
      :class="{ 
        'pb-24': audioPlayerStore.state.src && audioPlayerStore.size === 'small',
        'pb-96': audioPlayerStore.state.src && audioPlayerStore.size === 'big'
      }"
    >
      <router-view />
    </main>

    <!-- Persistent Audio Player -->
    <div v-if="audioPlayerStore.state.src" class="fixed z-50" :class="audioPlayerStore.size === 'small' ? 'bottom-0 left-0 right-0' : 'bottom-4 left-1/2 transform -translate-x-1/2 max-w-2xl w-full px-4'">
      <MiniAudioPlayer
        :src="audioPlayerStore.state.src"
        :title="audioPlayerStore.state.title"
        :subtitle="audioPlayerStore.state.subtitle"
        :seek-to-sec="audioPlayerStore.state.seekToSec"
        :autoplay="audioPlayerStore.state.autoplay"
        :play-token="audioPlayerStore.state.playToken"
        :transcript-src="audioPlayerStore.state.transcriptSrc"
        :speakers-meta-url="audioPlayerStore.state.speakersMetaUrl"
        :size="audioPlayerStore.size"
        @close="audioPlayerStore.close"
        @error="audioPlayerStore.setError"
        @toggle-size="audioPlayerStore.toggleSize"
      />
    </div>
  </div>
</template>

<style>
#app {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
