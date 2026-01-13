<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { marked } from 'marked';
import { getPodcastFileUrl, getEpisodeUrl, getSpeakersBaseUrl, getEpisodeImageUrl, withBase } from '@/composables/usePodcast';
import EpisodeRadarChart from '@/components/EpisodeRadarChart.vue';

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
const router = useRouter();
const { t } = useI18n();
const settings = useSettingsStore();
const audioPlayerStore = useAudioPlayerStore();

const searchTitle = computed(() => {
  const pid = settings.selectedPodcast || 'freakshow';
  const key = `search.titleByPodcast.${pid}`;
  // If the per-podcast key isn't present, fall back to the generic title.
  const s = t(key as any);
  return s === key ? t('search.title') : s;
});

const searchQuery = ref('');
const q = computed(() => (typeof route.query?.q === 'string' ? route.query.q.trim() : ''));

// Flag to prevent infinite loops when reading from URL
const isReadingFromUrl = ref(false);

// Update URL with query and speaker parameters
const updateUrl = () => {
  if (isReadingFromUrl.value) return;
  
  const queryParams: Record<string, string> = { ...route.query as Record<string, string> };
  
  // Update query parameter
  if (searchQuery.value.trim()) {
    queryParams.q = searchQuery.value.trim();
  } else {
    delete queryParams.q;
  }
  
  // Update speaker1 parameter
  if (settings.selectedSpeaker) {
    queryParams.speaker1 = settings.selectedSpeaker;
  } else {
    delete queryParams.speaker1;
  }
  
  // Update speaker2 parameter
  if (settings.selectedSpeaker2) {
    queryParams.speaker2 = settings.selectedSpeaker2;
  } else {
    delete queryParams.speaker2;
  }
  
  router.replace({ query: queryParams });
};

// Read from URL and update component state
const readFromUrl = () => {
  isReadingFromUrl.value = true;
  
  const query = route.query;
  
  // Read query
  if (query.q && typeof query.q === 'string') {
    const queryStr = query.q.trim();
    if (queryStr && queryStr !== searchQuery.value) {
      searchQuery.value = queryStr;
    }
  }
  
  // Read speaker1
  if (query.speaker1 && typeof query.speaker1 === 'string') {
    const speaker1Slug = query.speaker1.trim();
    if (speaker1Slug && speaker1Slug !== settings.selectedSpeaker) {
      settings.setSelectedSpeaker(speaker1Slug);
    }
  } else if (query.speaker1 === null || query.speaker1 === undefined) {
    // Only clear if explicitly removed from URL
    if (settings.selectedSpeaker) {
      settings.setSelectedSpeaker(null);
    }
  }
  
  // Read speaker2
  if (query.speaker2 && typeof query.speaker2 === 'string') {
    const speaker2Slug = query.speaker2.trim();
    if (speaker2Slug && speaker2Slug !== settings.selectedSpeaker2) {
      settings.setSelectedSpeaker2(speaker2Slug);
    }
  } else if (query.speaker2 === null || query.speaker2 === undefined) {
    // Only clear if explicitly removed from URL
    if (settings.selectedSpeaker2) {
      settings.setSelectedSpeaker2(null);
    }
  }
  
  isReadingFromUrl.value = false;
};

const loading = ref(false);
const error = ref<string | null>(null);
const isRateLimitError = ref(false);
const rateLimitRetryAfter = ref(60); // Default 60 seconds
const result = ref<ChatResponse | null>(null);
const expandedSources = ref<Record<number, boolean>>({});
const episodeSubjectsData = ref<Map<number, any>>(new Map());
const loadingSubjects = ref<Set<number>>(new Set());

// Load episode subjects data
const loadEpisodeSubjects = async (episodeNumber: number) => {
  if (episodeSubjectsData.value.has(episodeNumber) || loadingSubjects.value.has(episodeNumber)) {
    return;
  }
  
  loadingSubjects.value.add(episodeNumber);
  try {
    const url = getPodcastFileUrl(`episodes/${episodeNumber}-subjects.json`);
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      episodeSubjectsData.value.set(episodeNumber, data);
    }
  } catch (e) {
    // Silently fail - not all episodes have subjects data
  } finally {
    loadingSubjects.value.delete(episodeNumber);
  }
};

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

  // Return empty string to try without token first
  // (backend allows no auth if not configured)
  return '';
};

const isPermissionDenied = (status: number, bodyText: string) => {
  if (status === 401 || status === 403) return true;
  const txt = (bodyText || '').toLowerCase();
  return txt.includes('permission denied') || txt.includes('forbidden') || txt.includes('unauthorized');
};

// Token request modal state
const showTokenModal = ref(false);
const tokenModalTab = ref<'request' | 'enter'>('request');
const tokenRequestEmail = ref('');
const tokenRequestLoading = ref(false);
const tokenRequestSuccess = ref(false);
const tokenRequestError = ref('');
const tokenInputValue = ref('');

const promptForAuthToken = async () => {
  return new Promise<string | null>((resolve) => {
    showTokenModal.value = true;
    tokenModalTab.value = 'request';
    tokenRequestSuccess.value = false;
    tokenRequestError.value = '';
    tokenInputValue.value = '';
    
    // Store resolve function to call later
    (window as any).__tokenModalResolve = (token: string | null) => {
      showTokenModal.value = false;
      resolve(token);
    };
  });
};

const submitTokenInput = () => {
  const token = tokenInputValue.value.trim();
  if (!token) return;
  settings.setRagAuthToken(token);
  (window as any).__tokenModalResolve?.(token);
};

const cancelTokenModal = () => {
  (window as any).__tokenModalResolve?.(null);
};

const requestToken = async () => {
  const email = tokenRequestEmail.value.trim();
  if (!email) {
    tokenRequestError.value = t('search.tokenRequest.emailRequired');
    return;
  }
  
  tokenRequestLoading.value = true;
  tokenRequestError.value = '';
  
  try {
    const url = backendBase.value 
      ? `${backendBase.value}/api/auth/request-token` 
      : '/api/auth/request-token';
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    
    tokenRequestSuccess.value = true;
    tokenRequestEmail.value = '';
  } catch (e) {
    tokenRequestError.value = e instanceof Error ? e.message : String(e);
  } finally {
    tokenRequestLoading.value = false;
  }
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
  isRateLimitError.value = false;
  expandedSources.value = {};
  if (!qq) return;

  if (abortController) abortController.abort();
  abortController = new AbortController();

  loading.value = true;
  try {
    const token0 = await ensureAuthToken();

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
      const headers: any = { 'Content-Type': 'application/json' };
      // Only add auth header if token is non-empty
      if (token) {
        headers['x-auth-token'] = token;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: abortController?.signal,
      });
      return res;
    };

    let res = await run(token0);
    if (!res.ok) {
      // Handle 429 Rate Limit Error FIRST (before reading body)
      if (res.status === 429) {
        isRateLimitError.value = true;
        // Try to extract Retry-After header
        const retryAfter = res.headers.get('Retry-After');
        if (retryAfter) {
          rateLimitRetryAfter.value = parseInt(retryAfter, 10) || 60;
        } else {
          rateLimitRetryAfter.value = 60; // Default to 60 seconds
        }
        error.value = t('search.rateLimitError.title');
        return;
      }
      
      const txt = await res.text();
      
      if (isPermissionDenied(res.status, txt)) {
        // Backend requires auth - prompt user
        settings.clearRagAuthToken();
        const token1 = await promptForAuthToken();
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

onMounted(() => {
  fetchSpeakers();
  readFromUrl(); // Read initial state from URL
  if (q.value) {
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
    
    // Update URL to remove speaker parameters when podcast changes
    updateUrl();
  }
);

// Watch for URL query changes
watch(
  () => route.query,
  () => {
    readFromUrl();
    if (q.value && q.value !== searchQuery.value) {
      doSearch(q.value);
    }
  },
  { deep: true }
);

// Watch for query changes from URL
watch(
  () => q.value,
  (next) => {
    if (next && next !== searchQuery.value) {
      searchQuery.value = next;
      doSearch(next);
    }
  }
);

// Watch for speaker changes and update URL
watch(
  () => settings.selectedSpeaker,
  () => {
    updateUrl();
  }
);

watch(
  () => settings.selectedSpeaker2,
  () => {
    updateUrl();
  }
);

const handleSearch = () => {
  if (searchQuery.value.trim()) {
    updateUrl(); // Update URL when search is performed
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
  // handleSearch will call updateUrl, so we don't need to call it here
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

  if (pid === 'das-universum') {
    return [
      {
        id: 'du-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.das-universum.discussion1'),
        query: 'Sollten wir nach außerirdischem Leben suchen?',
        speaker1Slug: 'ruth',
        speaker2Slug: 'florian',
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'du-persona-1',
        icon: '🌌',
        label: t('search.examplesByPodcast.das-universum.persona1'),
        query: 'Was sind eigentlich die Lagrange-Punkte?',
        speaker1Slug: 'florian',
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
      {
        id: 'du-neutral-1',
        icon: '🪐',
        label: t('search.examplesByPodcast.das-universum.neutral1'),
        query: 'Was sind Exoplaneten und wie findet man sie?',
        speaker1Slug: null,
        speaker2Slug: null,
        sublabel: t('search.neutral'),
      },
    ];
  }

  if (pid === 'cre') {
    return [
      {
        id: 'cre-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.cre.discussion1'),
        query: 'Was ist besser, Open Source oder proprietäre Software?',
        speaker1Slug: 'tim-pritlove',
        speaker2Slug: null, // Will be selected by user
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'cre-persona-1',
        icon: '🎙️',
        label: t('search.examplesByPodcast.cre.persona1'),
        query: 'Wie siehst du die Zukunft des Podcastings?',
        speaker1Slug: 'tim-pritlove',
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
      {
        id: 'cre-neutral-1',
        icon: '🤖',
        label: t('search.examplesByPodcast.cre.neutral1'),
        query: 'Was ist der aktuelle Stand der KI-Entwicklung?',
        speaker1Slug: null,
        speaker2Slug: null,
        sublabel: t('search.neutral'),
      },
    ];
  }

  if (pid === 'raumzeit') {
    return [
      {
        id: 'rz-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.raumzeit.discussion1'),
        query: 'Sollten wir zum Mars fliegen?',
        speaker1Slug: 'tim-pritlove',
        speaker2Slug: null, // Will be selected by user
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'rz-persona-1',
        icon: '🚀',
        label: t('search.examplesByPodcast.raumzeit.persona1'),
        query: 'Wie funktioniert die Raumfahrt-Technologie?',
        speaker1Slug: 'tim-pritlove',
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
      {
        id: 'rz-neutral-1',
        icon: '🔴',
        label: t('search.examplesByPodcast.raumzeit.neutral1'),
        query: 'Was sind die neuesten Erkenntnisse über den Mars?',
        speaker1Slug: null,
        speaker2Slug: null,
        sublabel: t('search.neutral'),
      },
    ];
  }

  if (pid === 'forschergeist') {
    return [
      {
        id: 'fg-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.forschergeist.discussion1'),
        query: 'Wie sollte Wissenschaft kommuniziert werden?',
        speaker1Slug: 'tim-pritlove',
        speaker2Slug: null, // Will be selected by user
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'fg-persona-1',
        icon: '🔬',
        label: t('search.examplesByPodcast.forschergeist.persona1'),
        query: 'Was sind die größten Herausforderungen in der Wissenschaft?',
        speaker1Slug: 'tim-pritlove',
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
      {
        id: 'fg-neutral-1',
        icon: '📚',
        label: t('search.examplesByPodcast.forschergeist.neutral1'),
        query: 'Wie funktioniert wissenschaftliches Arbeiten heute?',
        speaker1Slug: null,
        speaker2Slug: null,
        sublabel: t('search.neutral'),
      },
    ];
  }

  if (pid === 'minkorrekt') {
    return [
      {
        id: 'mi-persona-1',
        icon: '🏆',
        label: t('search.examplesByPodcast.minkorrekt.persona1'),
        query: 'Was sind deine Ig-Nobelpreis Favoriten?',
        speaker1Slug: 'nikolas',
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
      {
        id: 'mi-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.minkorrekt.discussion1'),
        query: 'Was haltet Ihr von Homöopathie?',
        speaker1Slug: 'nikolas',
        speaker2Slug: 'rainer',
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'mi-neutral-1',
        icon: '🔬',
        label: t('search.examplesByPodcast.minkorrekt.neutral1'),
        query: 'Was gibt es neues und spannendes in der Wissenschaft?',
        speaker1Slug: null,
        speaker2Slug: null,
        sublabel: t('search.neutral'),
      },
    ];
  }

  if (pid === 'wrint-wissenschaft') {
    return [
      {
        id: 'ww-discussion-1',
        icon: '💬',
        label: t('search.examplesByPodcast.wrint-wissenschaft.discussion1'),
        query: 'Wie sollte Wissenschaftskommunikation funktionieren?',
        speaker1Slug: null, // Will be selected by user
        speaker2Slug: null,
        sublabel: t('search.discussionMode.discussion'),
      },
      {
        id: 'ww-persona-1',
        icon: '🎙️',
        label: t('search.examplesByPodcast.wrint-wissenschaft.persona1'),
        query: 'Wie erklärst du komplexe Wissenschaft verständlich?',
        speaker1Slug: null, // Will be selected by user
        speaker2Slug: null,
        sublabel: 'Speaker Persona',
      },
      {
        id: 'ww-neutral-1',
        icon: '🌡️',
        label: t('search.examplesByPodcast.wrint-wissenschaft.neutral1'),
        query: 'Was sind die neuesten Erkenntnisse in der Klimaforschung?',
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

// When switching podcasts, clear cached MP3 index
watch(
  () => settings.selectedPodcast,
  () => {
    mp3IndexLoaded.value = false;
    mp3IndexError.value = null;
    mp3UrlByEpisode.value = new Map();
  }
);


const ensureMp3Index = async () => {
  if (mp3IndexLoaded.value || mp3IndexError.value) return;
  try {
    // In dev mode, always reload to get latest data; in production, use cache
    const res = await fetch(getPodcastFileUrl('episodes.json'), { 
      cache: import.meta.env.DEV ? 'no-cache' : 'force-cache' 
    });
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
    // In dev mode, always reload to get latest data; in production, use cache
    const res = await fetch(withBase(getEpisodeUrl(episodeNumber)), { 
      cache: import.meta.env.DEV ? 'no-cache' : 'force-cache' 
    });
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
  await ensureMp3Index();

  const mp3 = mp3UrlByEpisode.value.get(episodeNumber) || null;
  if (!mp3) {
    const errorMsg = mp3IndexError.value
      ? t('search.errors.mp3IndexUnavailable', { error: mp3IndexError.value })
      : t('search.errors.noMp3Url');
    audioPlayerStore.setError(errorMsg);
    await openEpisodeAt(episodeNumber, seconds);
    return;
  }

  audioPlayerStore.play({
    src: mp3,
    title: `Episode ${episodeNumber}`,
    subtitle: label,
    seekToSec: Math.max(0, Math.floor(seconds)),
    autoplay: true,
    transcriptSrc: withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`)),
    speakersMetaUrl: getSpeakersBaseUrl(),
  });
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
  // Support multiple citation formats:
  // - (Episode 123, 12:34-56:78)
  // - (Episode 123, 12:34)
  // - (Ep. 123, 12:34-56:78)
  // - (Ep 123, 12:34)
  const episodePattern = /\((Episode|Ep\.?)\s+(\d+),\s+([\d:]+)(?:-[\d:]+)?\)/gi;
  
  html = html.replace(episodePattern, (match, _prefix, episodeNum, startTime) => {
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

      <!-- Rate Limit Error (special styling) -->
      <div v-else-if="error && isRateLimitError" class="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-6 shadow-lg">
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
                {{ t('search.rateLimitError.limit', { limit: '2-5' }) }}
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

        <div class="space-y-3">
          <div class="text-sm font-semibold text-gray-900 dark:text-white">
            {{ t('search.sourcesTitle', { count: result.sources.length }) }}
          </div>

          <div
            v-for="(s, idx) in result.sources"
            :key="idx"
            class="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
            @mouseenter="loadEpisodeSubjects(s.episodeNumber)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3 flex-shrink-0">
                <img
                  :src="getEpisodeImageUrl(s.episodeNumber)"
                  :alt="s.episodeTitle || `Episode ${s.episodeNumber}`"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                  class="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-gray-200 dark:border-gray-700"
                />
                <EpisodeRadarChart
                  v-if="episodeSubjectsData.has(s.episodeNumber)"
                  :data="episodeSubjectsData.get(s.episodeNumber)"
                  class="hidden sm:block w-16 h-16"
                />
              </div>
              <div class="min-w-0 flex-1">
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

  <!-- Token Request Modal -->
  <div
    v-if="showTokenModal"
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    @click.self="cancelTokenModal"
  >
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
      <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
        {{ t('search.tokenRequest.title') }}
      </h3>
      
      <!-- Success Message -->
      <div v-if="tokenRequestSuccess" class="space-y-4">
        <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div class="flex items-start gap-3">
            <span class="text-2xl">✅</span>
            <div class="flex-1">
              <div class="font-semibold text-green-800 dark:text-green-200">
                {{ t('search.tokenRequest.successTitle') }}
              </div>
              <p class="text-sm text-green-700 dark:text-green-300 mt-1">
                {{ t('search.tokenRequest.successMessage') }}
              </p>
            </div>
          </div>
        </div>
        <button
          @click="cancelTokenModal"
          class="w-full bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded transition-colors"
        >
          {{ t('search.tokenRequest.close') }}
        </button>
      </div>

      <!-- Request Form -->
      <div v-else class="space-y-4">
        <!-- Tab Selection -->
        <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            @click="tokenModalTab = 'request'"
            :class="[
              'px-4 py-2 font-semibold transition-colors border-b-2',
              tokenModalTab === 'request'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
          >
            {{ t('search.tokenRequest.requestTab') }}
          </button>
          <button
            @click="tokenModalTab = 'enter'"
            :class="[
              'px-4 py-2 font-semibold transition-colors border-b-2',
              tokenModalTab === 'enter'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            ]"
          >
            {{ t('search.tokenRequest.haveTokenTab') }}
          </button>
        </div>

        <!-- Request Token Section -->
        <div v-if="tokenModalTab === 'request'">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ t('search.tokenRequest.description') }}
          </p>
          
          <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
            <p class="text-xs text-blue-700 dark:text-blue-300">
              {{ t('search.tokenRequest.privacyNotice') }}
            </p>
          </div>
          
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {{ t('search.tokenRequest.emailLabel') }}
              </label>
              <input
                v-model="tokenRequestEmail"
                type="email"
                :placeholder="t('search.tokenRequest.emailPlaceholder')"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                @keyup.enter="requestToken"
              />
            </div>

            <div v-if="tokenRequestError" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p class="text-sm text-red-700 dark:text-red-300">{{ tokenRequestError }}</p>
            </div>

            <div class="flex gap-2">
              <button
                @click="requestToken"
                :disabled="tokenRequestLoading || !tokenRequestEmail.trim()"
                class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition-colors disabled:cursor-not-allowed"
              >
                <span v-if="tokenRequestLoading">{{ t('search.tokenRequest.requesting') }}</span>
                <span v-else>{{ t('search.tokenRequest.requestButton') }}</span>
              </button>
              <button
                @click="cancelTokenModal"
                class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold transition-colors"
              >
                {{ t('search.tokenRequest.cancel') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Enter Token Section -->
        <div v-else>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {{ t('search.tokenRequest.enterTokenDescription') }}
          </p>
          
          <div class="space-y-3">
            <div>
              <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {{ t('search.tokenRequest.tokenLabel') }}
              </label>
              <input
                v-model="tokenInputValue"
                type="text"
                :placeholder="t('search.tokenRequest.tokenPlaceholder')"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                @keyup.enter="submitTokenInput"
              />
            </div>

            <div class="flex gap-2">
              <button
                @click="submitTokenInput"
                :disabled="!tokenInputValue.trim()"
                class="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded transition-colors disabled:cursor-not-allowed"
              >
                {{ t('search.tokenRequest.submitToken') }}
              </button>
              <button
                @click="cancelTokenModal"
                class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold transition-colors"
              >
                {{ t('search.tokenRequest.cancel') }}
              </button>
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


