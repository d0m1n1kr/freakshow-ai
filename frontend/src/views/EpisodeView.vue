<script setup lang="ts">
import { ref, computed, watch, reactive, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { getPodcastFileUrl, getSpeakersBaseUrl, getEpisodeImageUrl, getPodcastLogoUrl, withBase } from '@/composables/usePodcast';
import SpeakingTimeFlowChart from '@/components/SpeakingTimeFlowChart.vue';
import SpeakerBoxPlot from '@/components/SpeakerBoxPlot.vue';
import SpeakerScatterPlot from '@/components/SpeakerScatterPlot.vue';
import { useInlineEpisodePlayer } from '@/composables/useInlineEpisodePlayer';
import EpisodeRadarChart from '@/components/EpisodeRadarChart.vue';

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const settings = useSettingsStore();
const audioPlayerStore = useAudioPlayerStore();

type EpisodeSearchResult = {
  episodeNumber: number;
  podcastId: string;
  title: string;
  date?: string;
  durationSec?: number;
  speakers: string[];
  description?: string;
  score: number;
  topics: string[];
  positionsSec: number[];
  positionScores?: number[];
  hasImage: boolean;
  hasTranscript: boolean;
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
const isRateLimitError = ref(false);
const rateLimitRetryAfter = ref(60);
const searchResults = ref<EpisodeSearchResult[]>([]);
const selectedEpisode = ref<EpisodeData | null>(null);
const hasMore = ref(false);
const currentOffset = ref(0);
const currentQuery = ref('');
const speakerStats = ref<SpeakerStats | null>(null);
const episodeTopics = ref<EpisodeTopics | null>(null);
const activeStat = ref<'flow' | 'boxplot' | 'scatter'>('flow');
const statsLoading = ref(false);
const episodeSubjectsData = ref<any | null>(null);
const searchResultsSubjectsData = ref<Map<number, any>>(new Map());
const loadingSearchResultsSubjects = ref<Set<number>>(new Set());

// Load episode subjects data for selected episode
const loadEpisodeSubjects = async (episodeNumber: number) => {
  if (episodeSubjectsData.value?.episodeNumber === episodeNumber) {
    return;
  }
  
  try {
    const url = getPodcastFileUrl(`episodes/${episodeNumber}-subjects.json`);
    const response = await fetch(url);
    if (response.ok) {
      episodeSubjectsData.value = await response.json();
    } else {
      episodeSubjectsData.value = null;
    }
  } catch (e) {
    episodeSubjectsData.value = null;
  }
};

// Load episode subjects data for search results
const loadSearchResultSubjects = async (episodeNumber: number, podcastId?: string) => {
  if (searchResultsSubjectsData.value.has(episodeNumber) || loadingSearchResultsSubjects.value.has(episodeNumber)) {
    return;
  }
  
  loadingSearchResultsSubjects.value.add(episodeNumber);
  try {
    const url = getPodcastFileUrl(`episodes/${episodeNumber}-subjects.json`, podcastId);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      searchResultsSubjectsData.value.set(episodeNumber, data);
    }
  } catch (e) {
    // Silently fail - not all episodes have subjects data
  } finally {
    loadingSearchResultsSubjects.value.delete(episodeNumber);
  }
};

// Track current speaker from audio player
const currentSpeaker = ref<string | null>(null);

// Check if currently playing episode matches selected episode
const isCurrentEpisode = computed(() => {
  if (!selectedEpisode.value?.number || !audioPlayerStore.state.transcriptSrc) return false;
  const match = audioPlayerStore.state.transcriptSrc.match(/\/(\d+)-ts-live\.json/);
  if (!match || !match[1]) return false;
  return parseInt(match[1], 10) === selectedEpisode.value.number;
});

// Helper function to find the last index <= value in a sorted array
const findLastIndexLE = (arr: number[], value: number) => {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = arr[mid] ?? Number.NaN;
    if (Number.isFinite(v) && v <= value) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

// Transcript data for finding current speaker
type TranscriptData = {
  v: number;
  speakers: string[];
  t: number[]; // timestamps in seconds
  s: number[]; // speaker indices
  x: string[]; // text
};

const transcriptData = ref<TranscriptData | null>(null);

// Load transcript data for current speaker detection
const loadTranscriptForCurrentSpeaker = async () => {
  if (!selectedEpisode.value?.number || transcriptData.value) return;
  
  try {
    
    const transcriptUrl = withBase(getPodcastFileUrl(`episodes/${selectedEpisode.value.number}-ts-live.json`));
    const response = await fetch(transcriptUrl, { cache: 'force-cache' });
    if (response.ok) {
      transcriptData.value = await response.json();
    }
  } catch (e) {
    // Silent fail - transcript might not exist
  }
};

// Get current speaker at a given time
const getCurrentSpeakerAtTime = (timeSec: number): string | null => {
  if (!transcriptData.value || !Number.isFinite(timeSec) || timeSec < 0) return null;
  
  const idx = findLastIndexLE(transcriptData.value.t, timeSec);
  if (idx < 0) return null;
  
  const speakerIdxRaw = transcriptData.value.s[idx];
  const speaker =
    (typeof speakerIdxRaw === 'number' &&
      Number.isInteger(speakerIdxRaw) &&
      speakerIdxRaw >= 0 &&
      speakerIdxRaw < transcriptData.value.speakers.length)
      ? (transcriptData.value.speakers[speakerIdxRaw] ?? null)
      : null;
  
  return speaker;
};

// Update current speaker from audio element
const updateCurrentSpeaker = () => {
  if (!isCurrentEpisode.value || !audioPlayerStore.state.src) {
    currentSpeaker.value = null;
    return;
  }
  
  // Try to get current time from audio element
  const audioElements = document.querySelectorAll('audio');
  let time: number | null = null;
  
  for (const audio of audioElements) {
    if (audio.src && audio.src === audioPlayerStore.state.src) {
      const audioTime = audio.currentTime || 0;
      if (Number.isFinite(audioTime) && audioTime >= 0) {
        time = audioTime;
        break;
      }
    }
  }
  
  // Fallback: use seekToSec if available
  if (time === null && audioPlayerStore.state.seekToSec !== undefined && Number.isFinite(audioPlayerStore.state.seekToSec)) {
    time = audioPlayerStore.state.seekToSec;
  }
  
  if (time !== null && transcriptData.value) {
    currentSpeaker.value = getCurrentSpeakerAtTime(time);
  } else {
    currentSpeaker.value = null;
  }
};

// Set up interval to update current speaker
let speakerUpdateInterval: number | null = null;

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
  isRateLimitError.value = false;

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
      // Handle 429 Rate Limit Error FIRST
      if (response.status === 429) {
        isRateLimitError.value = true;
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          rateLimitRetryAfter.value = parseInt(retryAfter, 10) || 60;
        } else {
          rateLimitRetryAfter.value = 60;
        }
        error.value = t('search.rateLimitError.title');
        return;
      }
      
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
    
    // Load subjects data for all episodes in the results
    const episodesToLoad = data.episodes || [];
    episodesToLoad.forEach((episode: EpisodeSearchResult) => {
      loadSearchResultSubjects(episode.episodeNumber, episode.podcastId);
    });
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
  
  // Update URL with search query (only when not appending)
  if (!append) {
    const queryParams: Record<string, string> = { ...route.query as Record<string, string> };
    
    if (query) {
      queryParams.q = query;
    } else {
      // Remove query parameter if search is empty
      delete queryParams.q;
    }
    
    // Remove episode parameter when starting a new search
    delete queryParams.episode;
    
    // Update URL without triggering navigation
    await router.replace({ 
      name: 'episodeSearch', 
      query: queryParams
    });
  }
  
  // Deselect episode when starting a new search
  if (!append) {
    // Clear results immediately when starting a new search
      searchResults.value = [];
    searchResultsSubjectsData.value.clear();
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
  isRateLimitError.value = false;

  try {
    const response = await fetch(`${backendBase.value}/api/episodes/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        podcastId: settings.selectedPodcast || 'freakshow',
        crossPodcast: settings.crossPodcastSearch,
        limit: 10,
        offset: append ? currentOffset.value : 0,
      }),
    });

    if (!response.ok) {
      // Handle 429 Rate Limit Error FIRST
      if (response.status === 429) {
        isRateLimitError.value = true;
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter) {
          rateLimitRetryAfter.value = parseInt(retryAfter, 10) || 60;
        } else {
          rateLimitRetryAfter.value = 60;
        }
        error.value = t('search.rateLimitError.title');
        return;
      }
      
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
    
    // Load subjects data for all episodes in the results
    const episodesToLoad = data.episodes || [];
    episodesToLoad.forEach((episode: EpisodeSearchResult) => {
      loadSearchResultSubjects(episode.episodeNumber, episode.podcastId);
    });
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
  // If episode is from a different podcast, switch to that podcast first
  const episodePodcastId = episode.podcastId || settings.selectedPodcast || 'freakshow';
  if (episodePodcastId !== settings.selectedPodcast) {
    settings.setSelectedPodcast(episodePodcastId);
  }
  
  // Update URL with episode number and podcast parameter
  await router.push({ 
    name: 'episodeSearch', 
    query: { 
      ...route.query,
      podcast: episodePodcastId,
      episode: episode.episodeNumber.toString() 
    } 
  });
  
  await loadEpisodeData(episode.episodeNumber, episodePodcastId);
};

const loadEpisodeData = async (episodeNumber: number, podcastIdOverride?: string) => {
  statsLoading.value = true;
  error.value = null;

  try {
    const podcastId = podcastIdOverride || settings.selectedPodcast || 'freakshow';
    
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
    try {
      const statsResponse = await fetch(statsUrl);
      if (statsResponse.ok) {
        const contentType = statsResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          speakerStats.value = await statsResponse.json();
        } else {
          speakerStats.value = null;
        }
      } else {
        speakerStats.value = null;
      }
    } catch (e) {
      // If speaker stats don't exist (e.g., for forschergeist), just set to null
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

    // Load episode subjects data
    await loadEpisodeSubjects(episodeNumber);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    statsLoading.value = false;
  }
};

const formatDuration = (duration?: number[]) => {
  if (!duration || duration.length < 3) return '';
  const [h, m, s] = duration;
  if (h !== undefined && h > 0) return `${h}:${String(m ?? 0).padStart(2, '0')}:${String(s ?? 0).padStart(2, '0')}`;
  return `${m ?? 0}:${String(s ?? 0).padStart(2, '0')}`;
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
    const queryStr = typeof q === 'string' ? q.trim() : '';
    
    // Update searchQuery if it differs from route query
    if (searchQuery.value !== queryStr) {
      searchQuery.value = queryStr;
    }
    
    if (queryStr) {
      // Trigger search if we have a query
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
  () => [route.query?.episode, route.query?.podcast],
  async ([episodeNum, podcastId]) => {
    if (episodeNum) {
      const num = parseInt(String(episodeNum), 10);
      if (Number.isFinite(num) && num > 0) {
        // Use podcast from URL if available, otherwise use current selection
        const podcastIdFromUrl = typeof podcastId === 'string' ? podcastId : undefined;
        await loadEpisodeData(num, podcastIdFromUrl);
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

// Watch for selected episode changes to load transcript
watch(() => selectedEpisode.value?.number, async (episodeNumber) => {
  if (episodeNumber) {
    await loadTranscriptForCurrentSpeaker();
  } else {
    transcriptData.value = null;
    currentSpeaker.value = null;
  }
});

// Watch for audio player state changes
watch(() => audioPlayerStore.state.src, () => {
  updateCurrentSpeaker();
});

watch(() => audioPlayerStore.state.transcriptSrc, () => {
  updateCurrentSpeaker();
});

// Countdown timer for rate limit
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(isRateLimitError, (isRateLimit) => {
  if (isRateLimit) {
    // Start countdown
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (rateLimitRetryAfter.value > 0) {
        rateLimitRetryAfter.value--;
      } else {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);
  } else {
    // Stop countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }
});

// Set up interval to update current speaker
onMounted(() => {
  speakerUpdateInterval = window.setInterval(() => {
    updateCurrentSpeaker();
  }, 100); // Update every 100ms
});

onBeforeUnmount(() => {
  if (speakerUpdateInterval !== null) {
    clearInterval(speakerUpdateInterval);
    speakerUpdateInterval = null;
  }
});

// Watch for podcast changes and reset search
watch(
  () => settings.selectedPodcast,
  async (newPodcast, oldPodcast) => {
    if (newPodcast && newPodcast !== oldPodcast && route.name === 'episodeSearch') {
      // Clear search query and results
      searchQuery.value = '';
      searchResults.value = [];
      searchResultsSubjectsData.value.clear();
      currentQuery.value = '';
      currentOffset.value = 0;
      hasMore.value = false;

      // Clear selected episode and related data
      selectedEpisode.value = null;
      speakerStats.value = null;
      episodeTopics.value = null;
      episodeSubjectsData.value = null;
      transcriptData.value = null;
      currentSpeaker.value = null;

      // Update URL: remove episode parameter and update podcast parameter
      const queryParams: Record<string, string> = { ...route.query as Record<string, string> };
      if (queryParams.episode) {
        delete queryParams.episode;
      }
      // Always update podcast parameter to match the new selection
      queryParams.podcast = newPodcast;
      
      // Use nextTick to ensure the update happens after the store change is processed
      await router.replace({ 
        name: 'episodeSearch', 
        query: queryParams 
      });

      // Load latest episodes for the new podcast
      await loadLatestEpisodes(false);
    }
  },
  { immediate: false } // Don't run on initial mount to avoid double loading
);


const playEpisode = async () => {
  if (!selectedEpisode.value?.number) return;
  
  const episodeNumber = selectedEpisode.value.number;
  
  // Use global player store instead of inline player
  await inlinePlayer.ensureMp3Index();
  const mp3 = inlinePlayer.mp3UrlByEpisode.get(episodeNumber) || null;
  if (!mp3) {
    await inlinePlayer.openEpisodeAt(episodeNumber, 0);
    return;
  }

  audioPlayerStore.play({
    src: mp3,
    title: selectedEpisode.value.title || `Episode ${episodeNumber}`,
    subtitle: selectedEpisode.value.title || `Episode ${episodeNumber}`,
    seekToSec: 0,
    autoplay: true,
    transcriptSrc: withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`)),
    speakersMetaUrl: getSpeakersBaseUrl(),
  });
};

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

const playEpisodeAtPosition = async (episode: EpisodeSearchResult, positionSec: number, e: Event) => {
  e.stopPropagation(); // Prevent selecting the episode when clicking play button
  
  const episodeNumber = episode.episodeNumber;
  const episodePodcastId = episode.podcastId || settings.selectedPodcast || 'freakshow';
  const label = `${formatTime(positionSec)} - ${episode.title}`;
  
  // If episode is from a different podcast, switch to that podcast first
  if (episodePodcastId !== settings.selectedPodcast) {
    settings.setSelectedPodcast(episodePodcastId);
  }
  
  // Update URL to open the episode detail page
  await router.push({ 
    name: 'episodeSearch', 
    query: { 
      ...route.query,
      podcast: episodePodcastId,
      episode: episodeNumber.toString() 
    } 
  });
  
  // Load episode data
  await loadEpisodeData(episodeNumber, episodePodcastId);
  
  // Use global player store instead of inline player
  await inlinePlayer.ensureMp3Index();
  const mp3 = inlinePlayer.mp3UrlByEpisode.get(episodeNumber) || null;
  if (!mp3) {
    await inlinePlayer.openEpisodeAt(episodeNumber, positionSec);
    return;
  }

  audioPlayerStore.play({
    src: mp3,
    title: episode.title || `Episode ${episodeNumber}`,
    subtitle: label,
    seekToSec: Math.max(0, Math.floor(positionSec)),
    autoplay: true,
    transcriptSrc: withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`, episodePodcastId)),
    speakersMetaUrl: getSpeakersBaseUrl(episodePodcastId),
  });
};

const formatTime = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const getPodcastInfo = (podcastId: string) => {
  return settings.availablePodcasts.find(p => p.id === podcastId) || null;
};
</script>

<template>
  <div class="space-y-6 overflow-x-hidden">
    <!-- Search Section -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6">
      <h2 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white mb-4">
        {{ t('episodes.searchTitle') }}
      </h2>
      
      <form @submit.prevent="() => searchEpisodes(false)" class="flex flex-col gap-3">
        <div class="flex flex-col sm:flex-row gap-3">
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
        </div>
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            :checked="settings.crossPodcastSearch"
            @change="settings.setCrossPodcastSearch(($event.target as HTMLInputElement).checked)"
            type="checkbox"
            class="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-purple-600 dark:text-purple-400 focus:ring-purple-500"
          />
          <span class="text-sm text-gray-700 dark:text-gray-300">{{ t('episodes.crossPodcastSearch') }}</span>
        </label>
      </form>

      <!-- Rate Limit Error (special styling) -->
      <div v-if="error && isRateLimitError" class="mt-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-6 shadow-lg">
        <div class="flex items-start gap-4">
          <div class="text-5xl flex-shrink-0 animate-pulse">🚦</div>
          <div class="flex-1">
            <div class="text-yellow-900 dark:text-yellow-200 font-bold text-xl mb-2">
              {{ t('search.rateLimitError.title') }}
            </div>
            <div class="text-yellow-800 dark:text-yellow-300 mb-3">
              {{ t('search.rateLimitError.message') }}
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-yellow-300 dark:border-yellow-700 mb-3">
              <div class="text-sm text-gray-700 dark:text-gray-300 mb-2">
                {{ t('search.rateLimitError.explanation') }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400 font-mono">
                {{ t('search.rateLimitError.limit', { limit: '10' }) }}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                {{ rateLimitRetryAfter }}s
              </div>
              <div class="text-sm text-yellow-700 dark:text-yellow-300">
                {{ t('search.rateLimitError.retryIn', { seconds: rateLimitRetryAfter }) }}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Regular Error -->
      <div v-else-if="error" class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
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
              v-if="episode.hasImage"
              :src="getEpisodeImageUrl(episode.episodeNumber, episode.podcastId)"
              :alt="episode.title"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
              class="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
            />
            <img
              v-else
              :src="getPodcastLogoUrl(episode.podcastId)"
              :alt="episode.title"
              class="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <h4 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white">
                  {{ episode.title }}
                </h4>
                <span v-if="settings.crossPodcastSearch && episode.podcastId && episode.podcastId !== settings.selectedPodcast" 
                      class="px-2 py-0.5 text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                  {{ getPodcastInfo(episode.podcastId)?.name || episode.podcastId }}
                </span>
              </div>
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
            <div class="flex items-center gap-3 flex-wrap">
              <EpisodeRadarChart
                v-if="searchResultsSubjectsData.has(episode.episodeNumber)"
                :data="searchResultsSubjectsData.get(episode.episodeNumber)"
                class="hidden sm:block w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0"
              />
              <template v-if="episode.positionsSec && episode.positionsSec.length > 0">
                <button
                  v-for="(positionSec, idx) in episode.positionsSec"
                  :key="idx"
                  @click="playEpisodeAtPosition(episode, positionSec, $event)"
                  class="flex-shrink-0 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                  :title="t('episodes.playAtPosition', { time: formatTime(positionSec) })"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                  {{ formatTime(positionSec) }}
                  <span v-if="episode.positionScores && episode.positionScores[idx] !== undefined" 
                        class="text-xs opacity-90 ml-0.5">
                    ({{ (episode.positionScores[idx] * 100).toFixed(0) }}%)
                  </span>
                </button>
              </template>
              <div v-if="currentQuery" class="text-sm text-gray-500 dark:text-gray-500">
                {{ (episode.score * 100).toFixed(0) }}%
              </div>
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
          <div class="flex items-start gap-3 flex-shrink-0">
            <img
              :src="getEpisodeImageUrl(selectedEpisode.number)"
              :alt="selectedEpisode.title"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
              class="w-24 h-24 sm:w-32 sm:h-32 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
            />
            <EpisodeRadarChart
              v-if="episodeSubjectsData"
              :data="episodeSubjectsData"
              class="hidden sm:block w-32 h-32 sm:w-40 sm:h-40 mt-2"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-4">
              <div class="flex-1"></div>
              <h3 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white text-center flex-1">
                {{ selectedEpisode.title }}
              </h3>
              <button
                @click="playEpisode"
                class="flex-shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors flex items-center gap-2"
                :title="t('episodes.play')"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
                {{ t('episodes.play') }}
              </button>
            </div>
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
              <template v-for="(speaker, idx) in selectedEpisode.speakers" :key="speaker">
                <span
                  :class="[
                    isCurrentEpisode && currentSpeaker === speaker
                      ? 'font-bold text-blue-600 dark:text-blue-400'
                      : ''
                  ]"
                >{{ speaker }}</span><span v-if="idx < selectedEpisode.speakers.length - 1">, </span>
              </template>
              <span v-if="selectedEpisode.speakers.length === 0">-</span>
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
          >
            {{ t('episodes.stats.boxplot') }}
          </button>
          <button
            @click="activeStat = 'scatter'"
            :class="[
              'px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
              activeStat === 'scatter'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
          >
            {{ t('episodes.stats.scatter') }}
          </button>
        </div>
      </div>

      <!-- Statistics Content -->
      <div v-if="speakerStats && activeStat === 'flow'" class="bg-white dark:bg-gray-800 rounded-b-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6 overflow-x-hidden max-w-full">
        <SpeakingTimeFlowChart
          :data="speakerStats"
          :episode-topics="episodeTopics"
          :episode-number="selectedEpisode?.number"
          :episode-subjects="episodeSubjectsData"
          @play-at-time="handlePlayAtTime"
        />
      </div>

      <div v-else-if="speakerStats && activeStat === 'boxplot'" class="bg-white dark:bg-gray-800 rounded-b-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6">
        <SpeakerBoxPlot
          :data="speakerStats"
          :episode-topics="episodeTopics"
          :episode-number="selectedEpisode?.number"
          @play-at-time="handlePlayAtTime"
        />
      </div>

      <div v-else-if="speakerStats && activeStat === 'scatter'" class="bg-white dark:bg-gray-800 rounded-b-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 md:p-6">
        <SpeakerScatterPlot
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

