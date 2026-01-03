<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { getPodcastFileUrl, getSpeakersBaseUrl, getEpisodeImageUrl } from '@/composables/usePodcast';
import SpeakingTimeFlowChart from '@/components/SpeakingTimeFlowChart.vue';
import { useInlineEpisodePlayer } from '@/composables/useInlineEpisodePlayer';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const settings = useSettingsStore();
const audioPlayerStore = useAudioPlayerStore();

type EpisodeSearchResult = {
  episodeNumber: number;
  title: string;
  date?: string;
  durationSec?: number;
  speakers: string[];
  description?: string;
  score: number;
  topics: string[];
};

type EpisodeData = {
  title: string;
  number: number;
  date?: string;
  duration?: number[];
  description?: string;
  speakers: string[];
};

type SpeakerStats = {
  v: number;
  episode: number;
  episodeDurationSec: number;
  speakers: string[];
  speakerStats: Record<string, {
    overall: {
      totalSpeakingTimeSec: number;
      speakingShare: number;
      segmentCount: number;
      longestMonologueSec: number;
      shortestSegmentSec: number;
      averageSegmentDurationSec: number;
      medianSegmentDurationSec: number;
      varianceSegmentDurationSec: number;
      stdDevSegmentDurationSec: number;
      boxplot: {
        min: number;
        q1: number;
        median: number;
        q3: number;
        max: number;
      };
    };
    temporal: Array<{
      intervalStartSec: number;
      intervalEndSec: number;
      totalSpeakingTimeSec: number;
      speakingShare: number;
      segmentCount: number;
      averageSegmentDurationSec: number;
      medianSegmentDurationSec: number;
      varianceSegmentDurationSec: number;
      stdDevSegmentDurationSec: number;
      longestMonologueSec: number;
      shortestSegmentSec: number;
      boxplot: {
        min: number;
        q1: number;
        median: number;
        q3: number;
        max: number;
      };
    }>;
  }>;
};

const searchQuery = ref('');
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);
const searchResults = ref<EpisodeSearchResult[]>([]);
const selectedEpisode = ref<EpisodeData | null>(null);
const hasMore = ref(false);
const currentOffset = ref(0);
const currentQuery = ref('');
const speakerStats = ref<SpeakerStats | null>(null);
const episodeTopics = ref<EpisodeTopics | null>(null);
const activeStat = ref<'flow' | 'boxplot' | 'monologue'>('flow');
const statsLoading = ref(false);

// Audio player
const inlinePlayer = reactive(useInlineEpisodePlayer());

type EpisodeTopics = {
  episodeNumber: number;
  topics: Array<{
    topic: string;
    positionSec?: number;
    durationSec?: number;
  }>;
};

const backendBase = computed(() => {
  if ((import.meta as any)?.env?.PROD) return '';
  const v = (import.meta as any)?.env?.VITE_RAG_BACKEND_URL;
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || 'http://127.0.0.1:7878').replace(/\/+$/, '');
});

const loadLatestEpisodes = async (append = false) => {
  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
    currentOffset.value = 0;
    currentQuery.value = ''; // Clear query to indicate we're showing latest episodes
  }
  error.value = null;

  try {
    const response = await fetch(`${backendBase.value}/api/episodes/latest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        podcastId: settings.selectedPodcast || 'freakshow',
        limit: 10,
        offset: append ? currentOffset.value : 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to load latest episodes: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (append) {
      searchResults.value.push(...(data.episodes || []));
    } else {
      searchResults.value = data.episodes || [];
    }
    hasMore.value = data.hasMore || false;
    if (append) {
      currentOffset.value += data.episodes?.length || 0;
    } else {
      currentOffset.value = data.episodes?.length || 0;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    if (!append) {
      searchResults.value = [];
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const searchEpisodes = async (append = false) => {
  // Prevent multiple simultaneous searches
  if (loading.value && !append) {
    return;
  }
  
  const query = searchQuery.value.trim();
  
  // Deselect episode when starting a new search
  if (!append) {
    // Clear results immediately when starting a new search
    searchResults.value = [];
    selectedEpisode.value = null;
    speakerStats.value = null;
    episodeTopics.value = null;
    currentQuery.value = query;
    hasMore.value = false;
    currentOffset.value = 0;
  }

  if (!query) {
    // If search is empty and no episode is selected, show latest episodes
    if (!selectedEpisode.value) {
      await loadLatestEpisodes(append);
    } else {
      if (!append) {
        searchResults.value = [];
      }
    }
    return;
  }

  if (append) {
    loadingMore.value = true;
  } else {
    loading.value = true;
    currentOffset.value = 0;
    hasMore.value = false;
  }
  error.value = null;

  try {
    const response = await fetch(`${backendBase.value}/api/episodes/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        podcastId: settings.selectedPodcast || 'freakshow',
        limit: 10,
        offset: append ? currentOffset.value : 0,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Search failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    if (append) {
      searchResults.value.push(...(data.episodes || []));
    } else {
      // Always replace, never append when append is false
      searchResults.value = data.episodes || [];
    }
    hasMore.value = data.hasMore || false;
    if (append) {
      currentOffset.value += data.episodes?.length || 0;
    } else {
      currentOffset.value = data.episodes?.length || 0;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    if (!append) {
      searchResults.value = [];
    }
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
};

const loadMore = () => {
  if (!loadingMore.value && !loading.value && hasMore.value) {
    if (currentQuery.value) {
      searchEpisodes(true);
    } else {
      loadLatestEpisodes(true);
    }
  }
};

const handleScroll = (event: Event) => {
  const target = event.target as HTMLElement;
  if (!target) return;
  
  const scrollTop = target.scrollTop;
  const scrollHeight = target.scrollHeight;
  const clientHeight = target.clientHeight;
  
  // Load more when user scrolls to within 200px of bottom
  if (scrollHeight - scrollTop - clientHeight < 200) {
    loadMore();
  }
};

const selectEpisode = async (episode: EpisodeSearchResult) => {
  // Update URL with episode number and preserve podcast parameter
  await router.push({ 
    name: 'episodes', 
    query: { 
      ...route.query,
      podcast: settings.selectedPodcast || 'freakshow',
      episode: episode.episodeNumber.toString() 
    } 
  });
  
  await loadEpisodeData(episode.episodeNumber);
};

const loadEpisodeData = async (episodeNumber: number) => {
  statsLoading.value = true;
  error.value = null;

  try {
    const podcastId = settings.selectedPodcast || 'freakshow';
    
    // Load episode metadata
    const epUrl = getPodcastFileUrl(`episodes/${episodeNumber}.json`, podcastId);
    const epResponse = await fetch(epUrl);
    if (epResponse.ok) {
      selectedEpisode.value = await epResponse.json();
    } else {
      // Fallback: try to get from search results
      const searchResult = searchResults.value.find(e => e.episodeNumber === episodeNumber);
      if (searchResult) {
        selectedEpisode.value = {
          title: searchResult.title,
          number: searchResult.episodeNumber,
          date: searchResult.date,
          duration: searchResult.durationSec ? [
            Math.floor(searchResult.durationSec / 3600),
            Math.floor((searchResult.durationSec % 3600) / 60),
            searchResult.durationSec % 60,
          ] : undefined,
          description: searchResult.description,
          speakers: searchResult.speakers,
        };
      }
    }

    // Load speaker stats
    const statsUrl = getPodcastFileUrl(`episodes/${episodeNumber}-speaker-stats.json`, podcastId);
    const statsResponse = await fetch(statsUrl);
    if (statsResponse.ok) {
      speakerStats.value = await statsResponse.json();
    } else {
      speakerStats.value = null;
    }

    // Load episode topics
    const topicsUrl = getPodcastFileUrl(`episodes/${episodeNumber}-topics.json`, podcastId);
    const topicsResponse = await fetch(topicsUrl);
    if (topicsResponse.ok) {
      episodeTopics.value = await topicsResponse.json();
    } else {
      episodeTopics.value = null;
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    statsLoading.value = false;
  }
};

const formatDuration = (duration?: number[]) => {
  if (!duration || duration.length < 3) return '';
  const [h, m, s] = duration;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const formatDurationSec = (sec?: number) => {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Watch route query for initial search
watch(
  () => route.query?.q,
  (q) => {
    if (typeof q === 'string' && q.trim()) {
      searchQuery.value = q.trim();
      searchEpisodes(false); // Explicitly pass false to ensure results are cleared
    } else if (!selectedEpisode.value) {
      // If no search query and no episode selected, load latest episodes
      loadLatestEpisodes(false); // Explicitly pass false
    }
  },
  { immediate: true }
);

// Watch route query for episode selection
watch(
  () => route.query?.episode,
  async (episodeNum) => {
    if (episodeNum) {
      const num = parseInt(String(episodeNum), 10);
      if (Number.isFinite(num) && num > 0) {
        await loadEpisodeData(num);
      }
    } else {
      // Clear selection if episode param is removed
      selectedEpisode.value = null;
      speakerStats.value = null;
      episodeTopics.value = null;
      // If no search query, load latest episodes
      if (!searchQuery.value.trim()) {
        await loadLatestEpisodes();
      }
    }
  },
  { immediate: true }
);

const handlePlayAtTime = async (timeSec: number) => {
  if (!selectedEpisode.value?.number) return;
  
  const episodeNumber = selectedEpisode.value.number;
  const label = `${formatTime(timeSec)} - ${selectedEpisode.value.title}`;
  
  // Use global player store instead of inline player
  await inlinePlayer.ensureMp3Index();
  const mp3 = inlinePlayer.mp3UrlByEpisode.get(episodeNumber) || null;
  if (!mp3) {
    await inlinePlayer.openEpisodeAt(episodeNumber, timeSec);
    return;
  }

  const withBase = (p: string) => {
    const base = (import.meta as any)?.env?.BASE_URL || '/';
    const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
    const rel = String(p).replace(/^\/+/, '');
    return `${b}${rel}`;
  };

  audioPlayerStore.play({
    src: mp3,
    title: selectedEpisode.value.title || `Episode ${episodeNumber}`,
    subtitle: label,
    seekToSec: Math.max(0, Math.floor(timeSec)),
    autoplay: true,
    transcriptSrc: withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`)),
    speakersMetaUrl: getSpeakersBaseUrl(),
  });
};

const formatTime = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};
</script>

<template>
  <div class="space-y-6">
    <!-- Search Section -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6">
      <h2 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-4">
        {{ t('episodes.searchTitle') }}
      </h2>
      
      <form @submit.prevent="() => searchEpisodes(false)" class="flex flex-col sm:flex-row gap-3">
        <input
          v-model="searchQuery"
          type="search"
          :placeholder="t('episodes.searchPlaceholder')"
          :disabled="loading"
          class="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          :disabled="loading"
          class="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold transition-colors flex items-center justify-center gap-2"
        >
          <span v-if="loading" class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></span>
          {{ loading ? t('search.buttonSearching') : t('search.button') }}
        </button>
      </form>

      <div v-if="error" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-red-800 dark:text-red-200 text-sm">{{ error }}</p>
      </div>
    </div>

    <!-- Search Results -->
    <div v-if="(searchResults.length > 0 || loading) && !selectedEpisode" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <!-- Single Loading Indicator -->
      <div v-if="loading && searchResults.length === 0" class="p-12 text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        <p class="mt-4 text-sm font-medium text-gray-900 dark:text-white">{{ t('search.loading') }}</p>
      </div>
      
      <template v-else>
        <div class="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 class="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
            {{ t('episodes.resultsTitle', { count: searchResults.length }) }}
          </h3>
        </div>
        
        <div 
          class="divide-y divide-gray-200 dark:divide-gray-700 max-h-[600px] overflow-y-auto"
          @scroll="handleScroll"
        >
        <button
          v-for="episode in searchResults"
          :key="episode.episodeNumber"
          @click="selectEpisode(episode)"
          class="w-full text-left p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
        >
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <img
              :src="getEpisodeImageUrl(episode.episodeNumber)"
              :alt="episode.title"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
              class="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
            />
            <div class="flex-1 min-w-0">
              <h4 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-1">
                {{ episode.title }}
              </h4>
              <div class="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span v-if="episode.date">{{ episode.date }}</span>
                <span v-if="episode.durationSec">{{ formatDurationSec(episode.durationSec) }}</span>
                <span v-if="episode.speakers.length > 0">{{ episode.speakers.join(', ') }}</span>
              </div>
              <p v-if="episode.description" class="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {{ episode.description }}
              </p>
              <div v-if="episode.topics.length > 0" class="mt-2 flex flex-wrap gap-1">
                <span
                  v-for="topic in episode.topics.slice(0, 3)"
                  :key="topic"
                  class="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                >
                  {{ topic }}
                </span>
              </div>
            </div>
            <div v-if="currentQuery" class="text-sm text-gray-500 dark:text-gray-500">
              {{ (episode.score * 100).toFixed(0) }}%
            </div>
          </div>
        </button>
        
        <!-- Loading More Indicator -->
        <div v-if="loadingMore" class="p-4 text-center">
          <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
          <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{{ t('episodes.loadingMore') }}</p>
        </div>
        
        <!-- End of Results -->
        <div v-if="!hasMore && searchResults.length > 0" class="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
          {{ t('episodes.noMoreEpisodes') }}
        </div>
        </div>
      </template>
    </div>

    <!-- Selected Episode Details -->
    <div v-if="selectedEpisode" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-start gap-4 mb-4">
          <img
            :src="getEpisodeImageUrl(selectedEpisode.number)"
            :alt="selectedEpisode.title"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
            class="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
          />
          <div class="flex-1 min-w-0">
            <h3 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
              {{ selectedEpisode.title }}
            </h3>
          </div>
        </div>
        
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <span class="text-gray-600 dark:text-gray-400">{{ t('episodes.date') }}:</span>
            <span class="ml-2 font-medium text-gray-900 dark:text-white">{{ selectedEpisode.date || '-' }}</span>
          </div>
          <div>
            <span class="text-gray-600 dark:text-gray-400">{{ t('episodes.duration') }}:</span>
            <span class="ml-2 font-medium text-gray-900 dark:text-white">
              {{ formatDuration(selectedEpisode.duration) || '-' }}
            </span>
          </div>
          <div class="sm:col-span-2">
            <span class="text-gray-600 dark:text-gray-400">{{ t('episodes.speakers') }}:</span>
            <span class="ml-2 font-medium text-gray-900 dark:text-white">
              {{ selectedEpisode.speakers.join(', ') || '-' }}
            </span>
          </div>
        </div>

        <p v-if="selectedEpisode.description" class="mt-4 text-sm text-gray-600 dark:text-gray-400">
          {{ selectedEpisode.description }}
        </p>
      </div>

      <!-- Statistics Tabs -->
      <div v-if="speakerStats" class="border-b border-gray-200 dark:border-gray-700">
        <div class="flex overflow-x-auto">
          <button
            @click="activeStat = 'flow'"
            :class="[
              'px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeStat === 'flow'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
          >
            {{ t('episodes.stats.flow') }}
          </button>
          <button
            @click="activeStat = 'boxplot'"
            :class="[
              'px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeStat === 'boxplot'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
            disabled
          >
            {{ t('episodes.stats.boxplot') }} ({{ t('episodes.comingSoon') }})
          </button>
          <button
            @click="activeStat = 'monologue'"
            :class="[
              'px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeStat === 'monologue'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
            disabled
          >
            {{ t('episodes.stats.monologue') }} ({{ t('episodes.comingSoon') }})
          </button>
        </div>
      </div>

      <!-- Statistics Content -->
      <div v-if="speakerStats && activeStat === 'flow'" class="p-4 md:p-6">
        <SpeakingTimeFlowChart 
          :data="speakerStats" 
          :episode-topics="episodeTopics"
          :episode-number="selectedEpisode?.number"
          @play-at-time="handlePlayAtTime"
        />
        
      </div>

      <div v-else-if="statsLoading" class="p-8 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">{{ t('episodes.loadingStats') }}</p>
      </div>

      <div v-else-if="!speakerStats" class="p-8 text-center text-gray-500 dark:text-gray-400">
        {{ t('episodes.noStats') }}
      </div>
    </div>
  </div>
</template>

