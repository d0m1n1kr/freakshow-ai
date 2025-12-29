<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue';

const props = defineProps<{
  src: string;
  title?: string;
  subtitle?: string;
  seekToSec?: number;
  autoplay?: boolean;
  playToken?: number; // increment to force re-seek/play even if seekToSec is unchanged
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'error', message: string | null): void;
}>();

const audioRef = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const localError = ref<string | null>(null);
const isSeeking = ref(false);

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

const safePlay = async () => {
  const a = audioRef.value;
  if (!a) return;
  try {
    localError.value = null;
    emit('error', null);
    await a.play();
  } catch (e: any) {
    const msg = `Konnte nicht automatisch abspielen: ${e?.message || e}`;
    localError.value = msg;
    emit('error', msg);
  }
};

const applySeekAndMaybePlay = async () => {
  const a = audioRef.value;
  if (!a) return;
  const seek = Number.isFinite(props.seekToSec as number) ? (props.seekToSec as number) : 0;

  const doIt = async () => {
    safeSetTime(seek);
    if (props.autoplay) await safePlay();
  };

  if (a.readyState >= 1) {
    await doIt();
  } else {
    const onMeta = async () => {
      a.removeEventListener('loadedmetadata', onMeta);
      await doIt();
    };
    a.addEventListener('loadedmetadata', onMeta);
    a.load();
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
  safeSetTime(v);
};

const onScrubCommit = async () => {
  isSeeking.value = false;
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
  const onTimeUpdate = () => { if (!isSeeking.value) currentTime.value = a.currentTime || 0; };
  const onLoadedMeta = () => {
    duration.value = Number.isFinite(a.duration) ? a.duration : 0;
    // keep currentTime in sync if we set it before metadata was ready
    if (!isSeeking.value) currentTime.value = a.currentTime || 0;
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
  detach = attach();
  await applySeekAndMaybePlay();
});

onBeforeUnmount(() => {
  detach?.();
  const a = audioRef.value;
  if (a) {
    try { a.pause(); } catch {}
  }
});

watch(() => props.src, async () => {
  // Reset local state when switching tracks
  localError.value = null;
  emit('error', null);
  currentTime.value = 0;
  duration.value = 0;
  isPlaying.value = false;

  await applySeekAndMaybePlay();
});

watch(() => props.seekToSec, async () => {
  await applySeekAndMaybePlay();
});

watch(() => props.playToken, async () => {
  await applySeekAndMaybePlay();
});
</script>

<template>
  <div class="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
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
      <button
        type="button"
        class="text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        @click="emit('close')"
        aria-label="Player schließen"
      >
        ✕
      </button>
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
        :value="Math.floor(currentTime || 0)"
        @input="onScrub"
        @change="onScrubCommit"
      />
    </div>

    <!-- hidden native element -->
    <audio ref="audioRef" class="hidden" preload="metadata" :src="src"></audio>
  </div>
</template>


