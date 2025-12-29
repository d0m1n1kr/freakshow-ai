<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import MiniAudioPlayer from '@/components/MiniAudioPlayer.vue';

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

const route = useRoute();
const { t } = useI18n();

const q = computed(() => (typeof route.query?.q === 'string' ? route.query.q.trim() : ''));

const loading = ref(false);
const error = ref<string | null>(null);
const result = ref<ChatResponse | null>(null);
const expandedSources = ref<Record<number, boolean>>({});

let abortController: AbortController | null = null;

const backendBase = computed(() => {
  const v = (import.meta as any)?.env?.VITE_RAG_BACKEND_URL;
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || 'http://127.0.0.1:7878').replace(/\/+$/, '');
});

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
    const res = await fetch(`${backendBase.value}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: qq }),
      signal: abortController.signal,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
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
  if (q.value) doSearch(q.value);
});

watch(
  () => q.value,
  (next) => {
    if (next) doSearch(next);
  }
);

// ---- Inline MP3 player (copied from TopicRiver.vue pattern) ----

const mp3IndexLoaded = ref(false);
const mp3IndexError = ref<string | null>(null);
const mp3UrlByEpisode = ref<Map<number, string>>(new Map());
const currentMp3Url = ref<string | null>(null);
const playerInfo = ref<{ episodeNumber: number; positionSec: number; label: string } | null>(null);
const playerError = ref<string | null>(null);
const playerToken = ref(0);
const currentTranscriptUrl = ref<string | null>(null);

const withBase = (p: string) => {
  const base = (import.meta as any)?.env?.BASE_URL || '/';
  const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
  const rel = String(p).replace(/^\/+/, '');
  return `${b}${rel}`;
};

const ensureMp3Index = async () => {
  if (mp3IndexLoaded.value || mp3IndexError.value) return;
  try {
    const res = await fetch('/episodes.json', { cache: 'force-cache' });
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
    const res = await fetch(`/episodes/${episodeNumber}.json`, { cache: 'force-cache' });
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
  currentTranscriptUrl.value = withBase(`episodes/${episodeNumber}-ts-live.json`);
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
</script>

<template>
  <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">{{ t('search.title') }}</h2>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <span class="font-semibold">{{ t('search.queryLabel') }}</span>
            <span class="font-mono">{{ q || '—' }}</span>
          </p>
        </div>
      </div>
    </div>

    <div class="p-4 sm:p-6">
      <div v-if="!q" class="text-gray-600 dark:text-gray-400">
        {{ t('search.empty') }}
      </div>

      <div v-else-if="loading" class="flex items-center gap-3">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-4 border-blue-500 border-t-transparent"></div>
        <div class="text-gray-700 dark:text-gray-300">{{ t('search.loading') }}</div>
      </div>

      <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div class="text-red-800 dark:text-red-200 font-semibold">{{ t('search.errorTitle') }}</div>
        <div class="mt-1 text-sm text-red-700 dark:text-red-300">{{ error }}</div>
      </div>

      <div v-else-if="result" class="space-y-6">
        <div class="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
          <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold">
            {{ t('search.answerTitle') }}
          </div>
          <div class="mt-2 whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed">
            {{ result.answer }}
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

      <div v-else class="text-gray-600 dark:text-gray-400">{{ t('search.noResults') }}</div>
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


