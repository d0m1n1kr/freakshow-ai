import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface PlayerState {
  src: string | null;
  title?: string;
  subtitle?: string;
  seekToSec?: number;
  autoplay?: boolean;
  playToken?: number;
  transcriptSrc?: string;
  speakersMetaUrl?: string;
}

export const useAudioPlayerStore = defineStore('audioPlayer', () => {
  // Player state
  const state = ref<PlayerState>({
    src: null,
    title: undefined,
    subtitle: undefined,
    seekToSec: undefined,
    autoplay: false,
    playToken: 0,
    transcriptSrc: undefined,
    speakersMetaUrl: undefined,
  });

  // Player size: 'small' | 'big'
  // Pinia persistedstate will restore this from localStorage
  const size = ref<'small' | 'big'>('small');
  
  // Error state
  const error = ref<string | null>(null);

  // Actions
  function play({
    src,
    title,
    subtitle,
    seekToSec,
    autoplay = false,
    transcriptSrc,
    speakersMetaUrl,
  }: {
    src: string;
    title?: string;
    subtitle?: string;
    seekToSec?: number;
    autoplay?: boolean;
    transcriptSrc?: string;
    speakersMetaUrl?: string;
  }) {
    state.value = {
      src,
      title,
      subtitle,
      seekToSec: seekToSec ?? 0,
      autoplay,
      playToken: (state.value.playToken ?? 0) + 1,
      transcriptSrc,
      speakersMetaUrl,
    };
    error.value = null;
    // Keep the current size preference (persisted) - don't auto-expand
  }

  function close() {
    state.value = {
      src: null,
      title: undefined,
      subtitle: undefined,
      seekToSec: undefined,
      autoplay: false,
      playToken: 0,
      transcriptSrc: undefined,
      speakersMetaUrl: undefined,
    };
    error.value = null;
  }

  function setError(message: string | null) {
    error.value = message;
  }

  function toggleSize() {
    size.value = size.value === 'small' ? 'big' : 'small';
  }

  function setSize(newSize: 'small' | 'big') {
    size.value = newSize;
  }

  const isOpen = ref(false);

  function open() {
    isOpen.value = true;
  }

  function setIsOpen(value: boolean) {
    isOpen.value = value;
  }

  return {
    state,
    size,
    error,
    isOpen,
    play,
    close,
    setError,
    toggleSize,
    setSize,
    setIsOpen,
  };
}, {
  persist: {
    key: 'freakshow-audio-player',
    storage: window.localStorage,
    paths: [
      'size',
    ],
  }
});

