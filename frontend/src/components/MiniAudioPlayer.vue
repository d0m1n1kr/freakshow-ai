<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed, nextTick } from 'vue';
import { getEpisodeImageUrl } from '@/composables/usePodcast';

const props = defineProps<{
  src: string;
  title?: string;
  subtitle?: string;
  seekToSec?: number;
  autoplay?: boolean;
  playToken?: number; // increment to force re-seek/play even if seekToSec is unchanged
  transcriptSrc?: string; // optional: URL to <episode>-ts-live.json for live speaker/text display
  speakersMetaUrl?: string; // optional: Base URL to fetch speaker meta data (e.g., '/speakers')
  size?: 'small' | 'big'; // player size
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'error', message: string | null): void;
  (e: 'toggle-size'): void;
}>();

const playerSize = computed(() => {
  // Always use the prop if provided, otherwise default to 'small'
  // This ensures we respect the store's persisted value
  return props.size ?? 'small';
});

// Extract episode number from transcriptSrc URL (e.g., "/podcasts/freakshow/episodes/123-ts-live.json" -> 123)
const episodeNumber = computed(() => {
  if (props.transcriptSrc) {
    const match = props.transcriptSrc.match(/\/(\d+)-ts-live\.json/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  // Fallback: try to extract from title (e.g., "Episode 123" -> 123)
  if (props.title) {
    const match = props.title.match(/Episode\s+(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return null;
});

const episodeImageUrl = computed(() => {
  if (episodeNumber.value) {
    return getEpisodeImageUrl(episodeNumber.value);
  }
  return null;
});

const audioRef = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const localError = ref<string | null>(null);
const isSeeking = ref(false);
const scrubValue = ref(0);

type LiveTranscriptV1 = {
  v: 1;
  episode?: number;
  speakers: string[];
  t: number[]; // seconds
  s: number[]; // speaker index into speakers[]
  x: string[]; // text
};

type SpeakerMeta = {
  name: string;
  slug: string;
  image?: string;
};

const liveTranscript = ref<LiveTranscriptV1 | null>(null);
const liveTranscriptError = ref<string | null>(null);
const liveTranscriptLoading = ref(false);

const speakersMeta = ref<Map<string, SpeakerMeta>>(new Map());

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

const currentSpoken = computed(() => {
  const lt = liveTranscript.value;
  if (!lt || !Array.isArray(lt.t) || lt.t.length === 0) return null;

  const sec = Math.max(0, Math.floor(currentTime.value || 0));
  const idx = findLastIndexLE(lt.t, sec);
  if (idx < 0) return null;

  const startSecRaw = lt.t[idx];
  if (typeof startSecRaw !== 'number' || !Number.isFinite(startSecRaw)) return null;
  const startSec = Math.max(0, Math.floor(startSecRaw));

  const speakerIdxRaw = lt.s[idx];
  const speaker =
    (typeof speakerIdxRaw === 'number' &&
      Number.isInteger(speakerIdxRaw) &&
      speakerIdxRaw >= 0 &&
      speakerIdxRaw < lt.speakers.length)
      ? (lt.speakers[speakerIdxRaw] ?? null)
      : null;
  const text = typeof lt.x[idx] === 'string' ? lt.x[idx] : '';
  if (!speaker && !text) return null;

  return { speaker, text, startSec };
});

const currentSpeakerImage = computed(() => {
  const speaker = currentSpoken.value?.speaker;
  if (!speaker) return null;
  const meta = speakersMeta.value.get(speaker);
  return meta?.image || null;
});

const loadSpeakerMeta = async (speakerName: string) => {
  if (!props.speakersMetaUrl || speakersMeta.value.has(speakerName)) return;
  
  try {
    // Convert speaker name to slug (lowercase, replace spaces with dashes)
    const slug = speakerName.toLowerCase().replace(/\s+/g, '-');
    const url = `${props.speakersMetaUrl}/${slug}-meta.json`;
    
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return; // Silent fail if meta doesn't exist
    
    const data = await res.json();
    if (data && typeof data.name === 'string') {
      speakersMeta.value.set(speakerName, {
        name: data.name,
        slug: data.slug || slug,
        image: data.image || undefined,
      });
    }
  } catch {
    // Silent fail
  }
};

const loadLiveTranscript = async () => {
  const url = typeof props.transcriptSrc === 'string' ? props.transcriptSrc.trim() : '';
  liveTranscript.value = null;
  liveTranscriptError.value = null;
  if (!url) return;

  try {
    liveTranscriptLoading.value = true;
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) {
      // Silent when the transcript file simply doesn't exist (common when not generated).
      if (res.status === 404) return;
      liveTranscriptError.value = `Transcript nicht verfügbar (HTTP ${res.status})`;
      return;
    }
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    // Guard: many static hosts return index.html (200) for unknown paths.
    if (!ct.includes('application/json') && !ct.includes('text/json') && !ct.includes('+json')) {
      const txt = await res.text();
      const head = txt.trim().slice(0, 32);
      if (head.startsWith('<!doctype') || head.startsWith('<html') || head.startsWith('<')) {
        // Treat SPA HTML fallback as "transcript missing" (silent).
        // Many static hosts return index.html with HTTP 200 for unknown asset paths.
        return;
      } else {
        liveTranscriptError.value = `Transcript ist kein JSON (content-type: ${ct || 'unknown'})`;
      }
      return;
    }
    const data = await res.json();
    // very light validation
    if (data?.v !== 1 || !Array.isArray(data?.t) || !Array.isArray(data?.s) || !Array.isArray(data?.x) || !Array.isArray(data?.speakers)) {
      liveTranscriptError.value = 'Transcript hat ein unbekanntes Format';
      return;
    }
    liveTranscript.value = data as LiveTranscriptV1;
  } catch (e) {
    liveTranscriptError.value = e instanceof Error ? e.message : String(e);
  } finally {
    liveTranscriptLoading.value = false;
  }
};

const formatHms = (sec: number) => {
  const s0 = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const h = Math.floor(s0 / 3600);
  const m = Math.floor((s0 % 3600) / 60);
  const s = s0 % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const stateLabel = computed(() => {
  if (!audioRef.value) return '—';
  if (audioRef.value.ended) return 'ended';
  return isPlaying.value ? 'playing' : 'paused';
});

const timeLabel = computed(() => {
  const d = duration.value || 0;
  return `${formatHms(currentTime.value)} / ${formatHms(d)}`;
});

const safeSetTime = (sec: number) => {
  const a = audioRef.value;
  if (!a) return;
  const t = Math.max(0, Math.floor(sec));
  try {
    a.currentTime = t;
  } catch {
    // Some browsers throw before metadata is loaded; we'll retry after loadedmetadata.
  }
};

const waitForEventOnce = (el: EventTarget, event: string, timeoutMs: number) => {
  return new Promise<boolean>((resolve) => {
    let done = false;
    const on = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve(true);
    };
    const t = window.setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      resolve(false);
    }, Math.max(0, Math.floor(timeoutMs)));
    const cleanup = () => {
      window.clearTimeout(t);
      el.removeEventListener(event, on as any);
    };
    el.addEventListener(event, on as any, { once: true } as any);
  });
};

const safePlay = async () => {
  const a = audioRef.value;
  if (!a) return;
  try {
    localError.value = null;
    emit('error', null);
    await a.play();
  } catch (e: any) {
    // Common benign race when `src` changes / `load()` is called while autoplay is requested.
    // Chrome message: "The play() request was interrupted by a new load request."
    const m = String(e?.message || e || '');
    if (m.includes('interrupted by a new load request')) return;
    if (e?.name === 'AbortError') return;

    const msg = `Konnte nicht automatisch abspielen: ${m || e}`;
    localError.value = msg;
    emit('error', msg);
  }
};

let applySeq = 0;
let lastSrcKey: string | null = null;
const applySeekAndMaybePlay = async () => {
  const a = audioRef.value;
  if (!a) return;
  const seq = ++applySeq;
  const seek = Number.isFinite(props.seekToSec as number) ? (props.seekToSec as number) : 0;

  const doIt = async () => {
    if (seq !== applySeq) return; // superseded by a newer call
    safeSetTime(seek);
    if (props.autoplay) await safePlay();
  };

  const srcKey = typeof props.src === 'string' ? props.src : '';
  const srcChanged = lastSrcKey !== srcKey;
  if (srcChanged) lastSrcKey = srcKey;

  if (srcChanged) {
    // When switching tracks while playing, make sure we load the new src first.
    // Otherwise `play()` can race with the new load and end up paused.
    try { a.pause(); } catch {}
    if (seq === applySeq) a.load();
    await waitForEventOnce(a, 'loadedmetadata', 15000);
    if (seq !== applySeq) return;
    await doIt();
    return;
  }

  if (a.readyState >= 1) {
    await doIt();
  } else {
    const onMeta = async () => {
      a.removeEventListener('loadedmetadata', onMeta);
      await doIt();
    };
    a.addEventListener('loadedmetadata', onMeta);
    if (seq === applySeq) a.load();
  }
};

const togglePlay = async () => {
  const a = audioRef.value;
  if (!a) return;
  if (isPlaying.value) {
    a.pause();
    return;
  }
  await safePlay();
};

const onScrub = (e: Event) => {
  const a = audioRef.value;
  if (!a) return;
  const v = Number((e.target as HTMLInputElement).value);
  isSeeking.value = true;
  scrubValue.value = v;
  // update UI immediately (also updates live transcript while scrubbing)
  currentTime.value = v;
  safeSetTime(v);
};

const onScrubCommit = async () => {
  isSeeking.value = false;
  const a = audioRef.value;
  if (a) currentTime.value = a.currentTime || currentTime.value || 0;
  if (props.autoplay && !isPlaying.value) {
    // user interaction: safePlay should succeed reliably
    await safePlay();
  }
};

const attach = () => {
  const a = audioRef.value;
  if (!a) return;

  const onPlay = () => { isPlaying.value = true; };
  const onPause = () => { isPlaying.value = false; };
  const onTimeUpdate = () => { currentTime.value = a.currentTime || 0; };
  const onLoadedMeta = () => {
    duration.value = Number.isFinite(a.duration) ? a.duration : 0;
    // keep currentTime in sync if we set it before metadata was ready
    currentTime.value = a.currentTime || 0;
  };
  const onEnded = () => { isPlaying.value = false; };

  a.addEventListener('play', onPlay);
  a.addEventListener('pause', onPause);
  a.addEventListener('timeupdate', onTimeUpdate);
  a.addEventListener('loadedmetadata', onLoadedMeta);
  a.addEventListener('ended', onEnded);

  return () => {
    a.removeEventListener('play', onPlay);
    a.removeEventListener('pause', onPause);
    a.removeEventListener('timeupdate', onTimeUpdate);
    a.removeEventListener('loadedmetadata', onLoadedMeta);
    a.removeEventListener('ended', onEnded);
  };
};

let detach: (() => void) | undefined;

onMounted(async () => {
  // Ensure the <audio> ref is populated before attaching listeners.
  await nextTick();
  detach = attach();
  await loadLiveTranscript();
  await applySeekAndMaybePlay();
});

onBeforeUnmount(() => {
  detach?.();
  const a = audioRef.value;
  if (a) {
    try { a.pause(); } catch {}
  }
});

// In rare cases the ref can be null on first mount (or change during HMR);
// attach listeners as soon as it becomes available.
watch(audioRef, (a, prev) => {
  if (a && a !== prev) {
    detach?.();
    detach = attach();
  }
});

watch(() => props.src, async () => {
  // Reset local state when switching tracks
  localError.value = null;
  emit('error', null);
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;

  // Ensure the template has applied the new `src` to the <audio> element before we call `load()` / `play()`.
  await nextTick();
  await applySeekAndMaybePlay();
});

watch(() => props.transcriptSrc, async () => {
  await loadLiveTranscript();
});

watch(() => props.seekToSec, async () => {
  await applySeekAndMaybePlay();
});

watch(() => props.playToken, async () => {
  await applySeekAndMaybePlay();
});

// Load speaker meta when current speaker changes
watch(() => currentSpoken.value?.speaker, async (speakerName) => {
  if (speakerName) {
    await loadSpeakerMeta(speakerName);
  }
}, { immediate: true });
</script>

<template>
  <!-- Small state -->
  <div v-if="playerSize === 'small'" class="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
    <div class="container mx-auto px-4 py-2">
      <div class="flex items-center gap-3">
        <img
          v-if="episodeImageUrl"
          :src="episodeImageUrl"
          :alt="title || 'Episode'"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
          class="w-10 h-10 rounded object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0"
        />
        <button
          type="button"
          class="px-2 py-1 rounded text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0"
          @click="togglePlay"
        >
          {{ isPlaying ? '⏸' : '▶' }}
        </button>
        
        <div class="min-w-0 flex-1">
          <div class="text-xs font-semibold text-gray-900 dark:text-white truncate">
            {{ title || 'Audio' }}
          </div>
          <div class="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <span class="font-mono">{{ timeLabel }}</span>
          </div>
        </div>

        <input
          class="flex-1 max-w-32"
          type="range"
          min="0"
          :max="Math.max(0, Math.floor(duration || 0))"
          step="1"
          :value="isSeeking ? Math.floor(scrubValue || 0) : Math.floor(currentTime || 0)"
          @input="onScrub"
          @change="onScrubCommit"
          @pointerup="onScrubCommit"
        />

        <button
          type="button"
          class="px-2 py-1 rounded text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex-shrink-0"
          @click="emit('toggle-size')"
          aria-label="Player vergrößern"
          title="Vergrößern"
        >
          ⬆
        </button>

        <button
          type="button"
          class="px-2 py-1 rounded text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white flex-shrink-0"
          @click="emit('close')"
          aria-label="Player schließen"
          title="Schließen"
        >
          ✕
        </button>
      </div>
    </div>
  </div>

  <!-- Big state -->
  <div v-else class="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3">
    <div class="flex items-start justify-between gap-3">
      <img
        v-if="episodeImageUrl"
        :src="episodeImageUrl"
        :alt="title || 'Episode'"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
        class="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0"
      />
      <div class="min-w-0 flex-1">
        <div class="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {{ title || 'Audio' }}
          <span v-if="subtitle" class="font-normal text-gray-600 dark:text-gray-300">— {{ subtitle }}</span>
        </div>
        <div class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span class="font-mono">{{ timeLabel }}</span>
          <span class="uppercase tracking-wide">{{ stateLabel }}</span>
        </div>
        <div v-if="localError" class="mt-1 text-xs text-red-700 dark:text-red-300">
          {{ localError }}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="px-2 py-1 rounded text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          @click="emit('toggle-size')"
          aria-label="Player verkleinern"
          title="Verkleinern"
        >
          ⬇
        </button>
        <button
          type="button"
          class="text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          @click="emit('close')"
          aria-label="Player schließen"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Transcript: full width of player (not constrained by the header row / close button) -->
    <div v-if="transcriptSrc" class="mt-2 w-full">
      <div v-if="liveTranscriptLoading" class="text-xs text-gray-500 dark:text-gray-400">
        Transcript lädt…
      </div>
      <div v-else-if="currentSpoken" class="w-full rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 px-2 py-1.5">
        <div class="flex items-start gap-2">
          <img
            v-if="currentSpeakerImage"
            :src="currentSpeakerImage"
            :alt="currentSpoken.speaker || ''"
            class="w-8 h-8 rounded-full flex-shrink-0 border border-gray-300 dark:border-gray-600"
          />
          <div class="flex-1 min-w-0">
            <div class="text-[11px] font-semibold text-gray-600 dark:text-gray-300 truncate">
              {{ currentSpoken.speaker || '—' }}
              <span class="ml-2 font-mono font-normal text-gray-500 dark:text-gray-400">
                @ {{ formatHms(currentSpoken.startSec) }}
              </span>
            </div>
            <div class="mt-0.5 text-sm leading-snug text-gray-900 dark:text-gray-100 max-h-24 overflow-auto whitespace-pre-wrap">
              {{ currentSpoken.text }}
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="liveTranscriptError" class="text-xs text-gray-500 dark:text-gray-400">
        {{ liveTranscriptError }}
      </div>
      <div v-else class="text-xs text-gray-500 dark:text-gray-400">
        Kein Transcript an dieser Stelle.
      </div>
    </div>

    <div class="mt-2 flex items-center gap-3">
      <button
        type="button"
        class="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
        @click="togglePlay"
      >
        {{ isPlaying ? 'Pause' : 'Play' }}
      </button>

      <input
        class="flex-1"
        type="range"
        min="0"
        :max="Math.max(0, Math.floor(duration || 0))"
        step="1"
        :value="isSeeking ? Math.floor(scrubValue || 0) : Math.floor(currentTime || 0)"
        @input="onScrub"
        @change="onScrubCommit"
        @pointerup="onScrubCommit"
      />
    </div>
  </div>

  <!-- Audio element - always present to maintain playback state when switching sizes -->
  <audio ref="audioRef" class="hidden" preload="metadata" :src="src"></audio>
</template>


