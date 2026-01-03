<script setup lang="ts">
import { ref, computed, watch, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';
import { getPodcastFileUrl } from '@/composables/usePodcast';
import SpeakingTimeFlowChart from '@/components/SpeakingTimeFlowChart.vue';
import MiniAudioPlayer from '@/components/MiniAudioPlayer.vue';
import { useInlineEpisodePlayer } from '@/composables/useInlineEpisodePlayer';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const settings = useSettingsStore();

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
const error = ref<string | null>(null);
const searchResults = ref<EpisodeSearchResult[]>([]);
const selectedEpisode = ref<EpisodeData | null>(null);
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

const searchEpisodes = async () => {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }

  loading.value = true;
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
        topK: 10,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Search failed: ${response.status} ${text}`);
    }

    const data = await response.json();
    searchResults.value = data.episodes || [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    searchResults.value = [];
  } finally {
    loading.value = false;
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
      searchEpisodes();
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
      inlinePlayer.closePlayer();
    }
  },
  { immediate: true }
);

const handlePlayAtTime = async (timeSec: number) => {
  if (!selectedEpisode.value?.number) return;
  
  const episodeNumber = selectedEpisode.value.number;
  const label = `${formatTime(timeSec)} - ${selectedEpisode.value.title}`;
  await inlinePlayer.playEpisodeAt(episodeNumber, timeSec, label);
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
      
      <form @submit.prevent="searchEpisodes" class="flex flex-col sm:flex-row gap-3">
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

      <div v-if="loading" class="mt-4 p-4 text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">{{ t('search.loading') }}</p>
      </div>

      <div v-if="error" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p class="text-red-800 dark:text-red-200 text-sm">{{ error }}</p>
      </div>
    </div>

    <!-- Search Results -->
    <div v-if="searchResults.length > 0 && !selectedEpisode" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">
          {{ t('episodes.resultsTitle', { count: searchResults.length }) }}
        </h3>
      </div>
      
      <div class="divide-y divide-gray-200 dark:divide-gray-700">
        <button
          v-for="episode in searchResults"
          :key="episode.episodeNumber"
          @click="selectEpisode(episode)"
          class="w-full text-left p-4 md:p-6 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
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
            <div class="text-sm text-gray-500 dark:text-gray-500">
              {{ (episode.score * 100).toFixed(0) }}%
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Selected Episode Details -->
    <div v-if="selectedEpisode" class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="p-4 md:p-6 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-4">
          {{ selectedEpisode.title }}
        </h3>
        
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
        
        <!-- Audio Player -->
        <div v-if="inlinePlayer.currentMp3Url" class="mt-4">
          <MiniAudioPlayer
            :src="inlinePlayer.currentMp3Url"
            :title="selectedEpisode?.title || `Episode ${inlinePlayer.playerInfo?.episodeNumber ?? ''}`"
            :subtitle="inlinePlayer.playerInfo?.label || ''"
            :seek-to-sec="inlinePlayer.playerInfo?.positionSec ?? 0"
            :autoplay="true"
            :play-token="inlinePlayer.playerToken"
            :transcript-src="inlinePlayer.currentTranscriptUrl || undefined"
            :speakers-meta-url="inlinePlayer.speakersMetaUrl"
            @close="inlinePlayer.closePlayer"
            @error="inlinePlayer.setPlayerError"
          />
        </div>
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

