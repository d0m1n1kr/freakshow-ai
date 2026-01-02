<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import MiniAudioPlayer from '@/components/MiniAudioPlayer.vue';
import { useSettingsStore } from '@/stores/settings';
import { marked } from 'marked';
import { getPodcastFileUrl, getEpisodeUrl } from '@/composables/usePodcast';

type ChatSource = {
  episodeNumber: number;
  episodeTitle?: string | null;
  startSec: number;
  endSec: number;
  startHms?: string | null;
  endHms?: string | null;
  score: number;
  topic?: string | null;
  subjectCoarse?: string | null;
  subjectFine?: string | null;
  excerpt: string;
};

type ChatResponse = {
  answer: string;
  sources: ChatSource[];
};

type SpeakerInfo = {
  speaker: string;
  slug: string;
  episodesCount: number;
  utterancesCount: number;
  totalWords: number;
  hasProfile: boolean;
  image?: string;
};

const route = useRoute();
const { t } = useI18n();
const settings = useSettingsStore();

const searchTitle = computed(() => {
  const pid = settings.selectedPodcast || 'freakshow';
  const key = `search.titleByPodcast.${pid}`;
  // If the per-podcast key isn't present, fall back to the generic title.
  const s = t(key as any);
  return s === key ? t('search.title') : s;
});

const searchQuery = ref('');
const q = computed(() => (typeof route.query?.q === 'string' ? route.query.q.trim() : ''));

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<ChatResponse | null>(null);
const expandedSources = ref<Record<number, boolean>>({});

const availableSpeakers = ref<SpeakerInfo[]>([]);
const speakersLoading = ref(false);
const speakersError = ref<string | null>(null);

const selectedSpeakerInfo = computed(() => {
  if (!settings.selectedSpeaker) return null;
  return availableSpeakers.value.find(s => s.slug === settings.selectedSpeaker) || null;
});

const selectedSpeaker2Info = computed(() => {
  if (!settings.selectedSpeaker2) return null;
  return availableSpeakers.value.find(s => s.slug === settings.selectedSpeaker2) || null;
});

let abortController: AbortController | null = null;

const backendBase = computed(() => {
  // In production we assume a reverse proxy and always use relative URLs.
  if ((import.meta as any)?.env?.PROD) return '';

  // In dev, allow overriding the backend URL (or fall back to local dev server).
  const v = (import.meta as any)?.env?.VITE_RAG_BACKEND_URL;
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || 'http://127.0.0.1:7878').replace(/\/+$/, '');
});

const ensureAuthToken = async () => {
  const existing = typeof settings.ragAuthToken === 'string' ? settings.ragAuthToken.trim() : '';
  if (existing) return existing;

  const token = window.prompt(t('search.authToken.prompt'), '')?.trim() ?? '';
  if (!token) return null;
  settings.setRagAuthToken(token);
  return token;
};

const isPermissionDenied = (status: number, bodyText: string) => {
  if (status === 401 || status === 403) return true;
  const txt = (bodyText || '').toLowerCase();
  return txt.includes('permission denied') || txt.includes('forbidden') || txt.includes('unauthorized');
};

const fetchSpeakers = async () => {
  speakersLoading.value = true;
  speakersError.value = null;
  try {
    const podcastId = settings.selectedPodcast || 'freakshow';
    const url = backendBase.value 
      ? `${backendBase.value}/api/speakers?podcast_id=${podcastId}` 
      : `/api/speakers?podcast_id=${podcastId}`;
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    availableSpeakers.value = data.speakers || [];
  } catch (e) {
    speakersError.value = e instanceof Error ? e.message : String(e);
    console.error('Failed to fetch speakers:', e);
  } finally {
    speakersLoading.value = false;
  }
};

const doSearch = async (query: string) => {
  const qq = query.trim();
  result.value = null;
  error.value = null;
  expandedSources.value = {};
  if (!qq) return;

  if (abortController) abortController.abort();
  abortController = new AbortController();

  loading.value = true;
  try {
    const token0 = await ensureAuthToken();
    if (!token0) {
      error.value = t('search.authToken.required');
      return;
    }

    const run = async (token: string) => {
      const url = backendBase.value ? `${backendBase.value}/api/chat` : '/api/chat';
      const podcastId = settings.selectedPodcast || 'freakshow';
      const body: any = { query: qq, podcastId };
      if (settings.selectedSpeaker) {
        body.speakerSlug = settings.selectedSpeaker;
      }
      if (settings.selectedSpeaker2) {
        body.speakerSlug2 = settings.selectedSpeaker2;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
        body: JSON.stringify(body),
        signal: abortController?.signal,
      });
      return res;
    };

    let res = await run(token0);
    if (!res.ok) {
      const txt = await res.text();
      if (isPermissionDenied(res.status, txt)) {
        settings.clearRagAuthToken();
        const token1 = await ensureAuthToken();
        if (!token1) {
          error.value = t('search.authToken.required');
          return;
        }
        res = await run(token1);
        if (!res.ok) {
          const txt2 = await res.text();
          throw new Error(`HTTP ${res.status}: ${txt2}`);
        }
      } else {
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
    }

    const data = (await res.json()) as ChatResponse;
    if (!data || typeof data.answer !== 'string' || !Array.isArray(data.sources)) {
      throw new Error(t('search.errors.invalidResponse'));
    }
    result.value = data;
  } catch (e) {
    if ((e as any)?.name === 'AbortError') return;
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  fetchSpeakers();
  if (q.value) {
    searchQuery.value = q.value;
    doSearch(q.value);
  }
});

// When switching podcasts, reload speaker dropdown options.
watch(
  () => settings.selectedPodcast,
  async () => {
    // Reset selection to avoid carrying speakers across podcasts.
    settings.setSelectedSpeaker(null);
    settings.setSelectedSpeaker2(null);

    availableSpeakers.value = [];
    await fetchSpeakers();
  }
);

watch(
  () => q.value,
  (next) => {
    if (next && next !== searchQuery.value) {
      searchQuery.value = next;
      doSearch(next);
    }
  }
);

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    doSearch(searchQuery.value);
  }
};

// Run example with automatic speaker selection
const runExample = (query: string, speaker1Slug: string | null = null, speaker2Slug: string | null = null) => {
  // Set the speakers first
  if (speaker1Slug) {
    settings.setSelectedSpeaker(speaker1Slug);
  } else {
    settings.setSelectedSpeaker(null);
  }
  
  if (speaker2Slug) {
    settings.setSelectedSpeaker2(speaker2Slug);
  } else {
    settings.setSelectedSpeaker2(null);
  }
  
  // Set the query and search
  searchQuery.value = query;
  handleSearch();
};

type SearchExample = {
  id: string;
  icon: string;
  label: string;
  query: string;
  speaker1Slug: string | null;
  speaker2Slug: string | null;
  sublabel: string | null;
};

const searchExamples = computed<SearchExample[]>(() => {
  const pid = settings.selectedPodcast || 'freakshow';

  if (pid === 'lnp') {
    return [
      {
        id: 'lnp-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.lnp.discussion1'),
        query: 'Was haltet Ihr von Apples Reaktion auf den Digital Markets Act?',
        speaker1Slug: 'linus-neumann',
        speaker2Slug: 'tim-pritlove',
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'lnp-persona-1',
        icon: '🎙️',
        label: t('search.examplesByPodcast.lnp.persona1'),
        query: 'Was hältst du von der digitalen Patientenakte',
        speaker1Slug: 'linus-neumann',
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
    ];
  }

  if (pid === 'ukw') {
    return [
      {
        id: 'ukw-neutral-1',
        icon: '🌍',
        label: t('search.examplesByPodcast.ukw.neutral1'),
        query: 'Wie ist die Lage in der Ukraine?',
        speaker1Slug: null,
        speaker2Slug: null,
        sublabel: t('search.neutral'),
      },
    ];
  }

  // default: freakshow examples
  return [
    {
      id: 'fs-discussion',
      icon: '💬',
      label: t('search.examples.discussion'),
      query: 'Was ist besser, die Quest 3 oder Apple Vision Pro?',
      speaker1Slug: 'tim-pritlove',
      speaker2Slug: 'ralf-stockmann',
      sublabel: t('search.discussionMode.discussion'),
    },
    {
      id: 'fs-persona-1',
      icon: '🎙️',
      label: t('search.examples.persona1'),
      query: 'Wie stehst du zu Bitcoin?',
      speaker1Slug: 'tim-pritlove',
      speaker2Slug: null,
      sublabel: 'Speaker Persona',
    },
    {
      id: 'fs-persona-2',
      icon: '🏠',
      label: t('search.examples.persona2'),
      query: 'Kannst du mir Tipps zur Hausautomatisierung geben?',
      speaker1Slug: 'roddi',
      speaker2Slug: null,
      sublabel: 'Speaker Persona',
    },
    {
      id: 'fs-neutral',
      icon: '🍎',
      label: t('search.examples.neutral'),
      query: 'Apple Quo Vadis?',
      speaker1Slug: null,
      speaker2Slug: null,
      sublabel: t('search.neutral'),
    },
  ];
});

// ---- Inline MP3 player (copied from TopicRiver.vue pattern) ----

const mp3IndexLoaded = ref(false);
const mp3IndexError = ref<string | null>(null);
const mp3UrlByEpisode = ref<Map<number, string>>(new Map());
const currentMp3Url = ref<string | null>(null);
const playerInfo = ref<{ episodeNumber: number; positionSec: number; label: string } | null>(null);
const playerError = ref<string | null>(null);
const playerToken = ref(0);
const currentTranscriptUrl = ref<string | null>(null);

// When switching podcasts, clear cached MP3 index + close the player.
watch(
  () => settings.selectedPodcast,
  () => {
    mp3IndexLoaded.value = false;
    mp3IndexError.value = null;
    mp3UrlByEpisode.value = new Map();
    currentMp3Url.value = null;
    playerInfo.value = null;
    playerError.value = null;
    currentTranscriptUrl.value = null;
    playerToken.value++;
  }
);

const withBase = (p: string) => {
  const base = (import.meta as any)?.env?.BASE_URL || '/';
  const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
  const rel = String(p).replace(/^\/+/, '');
  return `${b}${rel}`;
};

const ensureMp3Index = async () => {
  if (mp3IndexLoaded.value || mp3IndexError.value) return;
  try {
    const res = await fetch(getPodcastFileUrl('episodes.json'), { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const map = new Map<number, string>();
    if (data?.byNumber && typeof data.byNumber === 'object') {
      for (const [k, v] of Object.entries<any>(data.byNumber)) {
        const n = parseInt(k, 10);
        const url = typeof v?.mp3Url === 'string' ? v.mp3Url : null;
        if (Number.isFinite(n) && url) map.set(n, url);
      }
    } else if (Array.isArray(data?.episodes)) {
      for (const ep of data.episodes) {
        const n = Number.isFinite(ep?.number) ? ep.number : null;
        const url = typeof ep?.mp3Url === 'string' ? ep.mp3Url : null;
        if (Number.isFinite(n) && url) map.set(n, url);
      }
    }

    mp3UrlByEpisode.value = map;
    mp3IndexLoaded.value = true;
  } catch (e) {
    mp3IndexError.value = e instanceof Error ? e.message : String(e);
  }
};

const buildEpisodeDeepLink = (episodeUrl: string, seconds: number) => {
  try {
    const u = new URL(episodeUrl);
    u.searchParams.set('t', String(Math.max(0, Math.floor(seconds))));
    u.searchParams.set('autoplay', '1');
    u.hash = `t=${Math.max(0, Math.floor(seconds))}`;
    return u.toString();
  } catch {
    return episodeUrl;
  }
};

const openEpisodeAt = async (episodeNumber: number, seconds: number) => {
  try {
    const res = await fetch(getEpisodeUrl(episodeNumber), { cache: 'force-cache' });
    if (!res.ok) return;
    const details = await res.json();
    const url = typeof details?.url === 'string' ? details.url : null;
    if (!url) return;
    window.open(buildEpisodeDeepLink(url, seconds), '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
};

const playEpisodeAt = async (episodeNumber: number, seconds: number, label: string) => {
  playerError.value = null;
  await ensureMp3Index();

  const mp3 = mp3UrlByEpisode.value.get(episodeNumber) || null;
  if (!mp3) {
    playerError.value = mp3IndexError.value
      ? t('search.errors.mp3IndexUnavailable', { error: mp3IndexError.value })
      : t('search.errors.noMp3Url');
    await openEpisodeAt(episodeNumber, seconds);
    return;
  }

  currentMp3Url.value = mp3;
  playerInfo.value = { episodeNumber, positionSec: Math.max(0, Math.floor(seconds)), label };
  currentTranscriptUrl.value = withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`));
  playerToken.value++;
};

const closePlayer = () => {
  currentMp3Url.value = null;
  playerInfo.value = null;
  currentTranscriptUrl.value = null;
  playerError.value = null;
};

const formatHmsFromSeconds = (sec: unknown) => {
  const s0 = Number.isFinite(sec as number) ? Math.max(0, Math.floor(sec as number)) : null;
  if (s0 === null) return '—';
  const hours = Math.floor(s0 / 3600);
  const minutes = Math.floor((s0 % 3600) / 60);
  const seconds = s0 % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const hmsToSeconds = (hms: string): number | null => {
  const parts = hms.trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(p => !Number.isFinite(p))) return null;
  
  if (parts.length === 3) {
    // H:MM:SS
    const [h, m, s] = parts;
    return (h ?? 0) * 3600 + (m ?? 0) * 60 + (s ?? 0);
  } else if (parts.length === 2) {
    // M:SS
    const [m, s] = parts;
    return (m ?? 0) * 60 + (s ?? 0);
  } else if (parts.length === 1) {
    // SS
    return parts[0] ?? 0;
  }
  return null;
};

const renderMarkdownWithLinks = (text: string): string => {
  // First, render markdown
  let html = marked.parse(text, { 
    breaks: true, 
    gfm: true 
  }) as string;
  
  // Then, linkify episode references in the rendered HTML
  const episodePattern = /\(Episode\s+(\d+),\s+([\d:]+)(?:-[\d:]+)?\)/gi;
  
  html = html.replace(episodePattern, (match, episodeNum, startTime) => {
    const episodeNumber = parseInt(episodeNum, 10);
    const seconds = hmsToSeconds(startTime);
    if (!Number.isFinite(episodeNumber) || seconds === null) return match;
    
    // Create a data attribute that we'll use to handle clicks
    return `<a href="#" class="episode-link text-blue-600 dark:text-blue-400 hover:underline font-medium" data-episode="${episodeNumber}" data-time="${seconds}">${match}</a>`;
  });
  
  return html;
};

const handleAnswerClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  if (target.classList.contains('episode-link')) {
    event.preventDefault();
    const episodeAttr = target.getAttribute('data-episode');
    const timeAttr = target.getAttribute('data-time');
    
    if (!episodeAttr || !timeAttr) return;
    
    const episodeNum = parseInt(episodeAttr, 10);
    const timeInSec = parseInt(timeAttr, 10);
    
    if (Number.isFinite(episodeNum) && Number.isFinite(timeInSec)) {
      const hms = formatHmsFromSeconds(timeInSec);
      playEpisodeAt(episodeNum, timeInSec, hms);
    }
  }
};
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{{ searchTitle }}</h2>
            <span class="text-xs px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold uppercase tracking-wider">
              beta
            </span>
          </div>
          
          <!-- Search Input -->
          <div class="mt-3">
            <form @submit.prevent="handleSearch" class="flex gap-2">
              <input
                v-model="searchQuery"
                type="text"
                :placeholder="t('search.placeholder')"
                class="flex-1 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                :disabled="loading"
              />
              <button
                type="submit"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm font-semibold transition-colors"
                :disabled="loading || !searchQuery.trim()"
              >
                {{ loading ? t('search.buttonSearching') : t('search.button') }}
              </button>
            </form>
          </div>
          
          <!-- Speaker Selection Dropdown -->
          <div class="mt-3 space-y-2">
            <label class="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              {{ t('search.answerStyle') }}
            </label>
            
            <div class="flex flex-col sm:flex-row gap-2">
              <div class="flex-1">
                <select
                  v-model="settings.selectedSpeaker"
                  class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  :disabled="speakersLoading || loading"
                >
                  <option :value="null">{{ t('search.neutral') }}</option>
                  <optgroup v-if="availableSpeakers.length > 0" :label="t('search.speakerPersonas')">
                    <option v-for="speaker in availableSpeakers" :key="speaker.slug" :value="speaker.slug">
                      {{ speaker.hasProfile ? '✓' : '⚠️' }} {{ speaker.speaker }} ({{ speaker.episodesCount }} episodes, {{ Math.round(speaker.totalWords / 1000) }}k words)
                    </option>
                  </optgroup>
                </select>
              </div>
              
              <div v-if="settings.selectedSpeaker" class="flex-1">
                <select
                  v-model="settings.selectedSpeaker2"
                  class="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  :disabled="speakersLoading || loading"
                >
                  <option :value="null">{{ t('search.discussionMode.none') }}</option>
                  <optgroup v-if="availableSpeakers.length > 0" :label="t('search.discussionMode.selectSecond')">
                    <option 
                      v-for="speaker in availableSpeakers" 
                      :key="speaker.slug" 
                      :value="speaker.slug"
                      :disabled="speaker.slug === settings.selectedSpeaker"
                    >
                      {{ speaker.hasProfile ? '✓' : '⚠️' }} {{ speaker.speaker }} ({{ speaker.episodesCount }} episodes, {{ Math.round(speaker.totalWords / 1000) }}k words)
                    </option>
                  </optgroup>
                </select>
              </div>
            </div>
            
            <p v-if="settings.selectedSpeaker && settings.selectedSpeaker2" class="text-xs text-purple-600 dark:text-purple-400 font-semibold">
              💬 {{ t('search.discussionMode.active', { 
                speaker1: availableSpeakers.find(s => s.slug === settings.selectedSpeaker)?.speaker,
                speaker2: availableSpeakers.find(s => s.slug === settings.selectedSpeaker2)?.speaker 
              }) }}
            </p>
            
            <p v-if="settings.selectedSpeaker && !settings.selectedSpeaker2" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              <span v-if="availableSpeakers.find(s => s.slug === settings.selectedSpeaker)?.hasProfile">
                ✓ {{ t('search.profileAvailable', { speaker: availableSpeakers.find(s => s.slug === settings.selectedSpeaker)?.speaker }) }}
              </span>
              <span v-else class="text-amber-600 dark:text-amber-400">
                ⚠️ {{ t('search.profileLimited') }} <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded">{{ t('search.profileGenerate', { speaker: availableSpeakers.find(s => s.slug === settings.selectedSpeaker)?.speaker }) }}</code>
              </span>
            </p>
            
            <p v-if="speakersError" class="mt-1 text-xs text-red-600 dark:text-red-400">
              ⚠️ {{ t('search.speakerLoadError', { error: speakersError }) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="p-4 sm:p-6">
      <div v-if="!searchQuery && !result" class="space-y-6">
        <div class="text-gray-600 dark:text-gray-400">
          {{ t('search.empty') }}
        </div>
        
        <!-- Example Queries -->
        <div class="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 sm:p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {{ t('search.examples.title') }}
          </h3>
          <div class="space-y-3">
            <button
              v-for="ex in searchExamples"
              :key="ex.id"
              @click="runExample(ex.query, ex.speaker1Slug, ex.speaker2Slug)"
              class="w-full text-left px-4 py-3 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors group"
            >
              <div class="flex items-start gap-3">
                <div class="text-2xl flex-shrink-0">{{ ex.icon }}</div>
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {{ ex.label }}
                  </div>
                  <div v-if="ex.sublabel" class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {{ ex.sublabel }}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="flex items-center gap-3">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-4 border-blue-500 border-t-transparent"></div>
        <div class="text-gray-700 dark:text-gray-300">{{ t('search.loading') }}</div>
      </div>

      <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div class="text-red-800 dark:text-red-200 font-semibold">{{ t('search.errorTitle') }}</div>
        <div class="mt-1 text-sm text-red-700 dark:text-red-300">{{ error }}</div>
      </div>

      <div v-else-if="result" class="space-y-6">
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
          <div class="flex items-start gap-3">
            <div v-if="selectedSpeaker2Info" class="flex items-center gap-2 flex-shrink-0">
              <img
                v-if="selectedSpeakerInfo?.image"
                :src="selectedSpeakerInfo.image"
                :alt="selectedSpeakerInfo.speaker"
                class="w-10 h-10 rounded-full border-2 border-blue-500 dark:border-blue-400"
              />
              <div v-else class="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                {{ selectedSpeakerInfo?.speaker?.charAt(0) || '?' }}
              </div>
              <span class="text-lg">💬</span>
              <img
                v-if="selectedSpeaker2Info?.image"
                :src="selectedSpeaker2Info.image"
                :alt="selectedSpeaker2Info.speaker"
                class="w-10 h-10 rounded-full border-2 border-purple-500 dark:border-purple-400"
              />
              <div v-else class="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-sm">
                {{ selectedSpeaker2Info?.speaker?.charAt(0) || '?' }}
              </div>
            </div>
            <img
              v-else-if="selectedSpeakerInfo?.image"
              :src="selectedSpeakerInfo.image"
              :alt="selectedSpeakerInfo.speaker"
              class="w-12 h-12 rounded-full flex-shrink-0 border-2 border-gray-300 dark:border-gray-600"
            />
            <div class="flex-1 min-w-0">
              <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
                {{ t('search.answerTitle') }}
                <span v-if="selectedSpeaker2Info" class="ml-1 font-normal normal-case">
                  ({{ t('search.discussionMode.discussion') }}: {{ selectedSpeakerInfo?.speaker }} & {{ selectedSpeaker2Info.speaker }})
                </span>
                <span v-else-if="selectedSpeakerInfo" class="ml-1 font-normal normal-case">
                  ({{ selectedSpeakerInfo.speaker }})
                </span>
              </div>
              <div 
                class="mt-2 prose prose-sm dark:prose-invert max-w-none text-gray-900 dark:text-gray-100 leading-relaxed prose-p:my-2 prose-headings:mt-4 prose-headings:mb-2"
                v-html="renderMarkdownWithLinks(result.answer)"
                @click="handleAnswerClick"
              >
              </div>
            </div>
          </div>
        </div>

        <div v-if="currentMp3Url" class="mt-2">
          <MiniAudioPlayer
            :src="currentMp3Url"
            :title="`Episode ${playerInfo?.episodeNumber ?? ''}`"
            :subtitle="playerInfo?.label || ''"
            :seek-to-sec="playerInfo?.positionSec ?? 0"
            :autoplay="true"
            :play-token="playerToken"
            :transcript-src="currentTranscriptUrl || undefined"
            :speakers-meta-url="'/speakers'"
            @close="closePlayer"
            @error="(msg) => { playerError = msg }"
          />
          <div v-if="playerError" class="mt-2 text-xs text-red-700 dark:text-red-300">
            {{ playerError }}
          </div>
        </div>

        <div class="space-y-3">
          <div class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ t('search.sourcesTitle', { count: result.sources.length }) }}
          </div>

          <div
            v-for="(s, idx) in result.sources"
            :key="idx"
            class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-gray-900 dark:text-white">
                  Episode {{ s.episodeNumber }}
                  <span v-if="s.episodeTitle" class="font-normal text-gray-600 dark:text-gray-300">— {{ s.episodeTitle }}</span>
                </div>
                <div class="mt-1 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
                  <span class="font-mono">
                    {{ s.startHms || formatHmsFromSeconds(s.startSec) }} - {{ s.endHms || formatHmsFromSeconds(s.endSec) }}
                  </span>
                  <span v-if="s.topic">Topic: {{ s.topic }}</span>
                  <span v-if="s.subjectCoarse || s.subjectFine">
                    Subject: {{ s.subjectCoarse || '—' }}<span v-if="s.subjectFine"> / {{ s.subjectFine }}</span>
                  </span>
                  <span class="font-mono">score={{ Number.isFinite(s.score) ? s.score.toFixed(3) : s.score }}</span>
                </div>
              </div>

              <button
                type="button"
                class="flex-shrink-0 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors"
                @click="playEpisodeAt(s.episodeNumber, s.startSec, `${s.startHms || formatHmsFromSeconds(s.startSec)}`)"
                :title="t('search.playTitle')"
              >
                {{ t('search.play') }}
              </button>
            </div>

            <div class="mt-3">
              <div
                :class="[
                  'whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100',
                  expandedSources[idx] ? '' : 'source-clamp-3'
                ]"
              >
                {{ s.excerpt }}
              </div>
              <div class="mt-2">
                <button
                  type="button"
                  class="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
                  @click="expandedSources[idx] = !expandedSources[idx]"
                >
                  {{ expandedSources[idx] ? t('search.collapseSource') : t('search.expandSource') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.source-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>


