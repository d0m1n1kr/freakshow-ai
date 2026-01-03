import { computed, ref, watch } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { getEpisodeUrl, getPodcastFileUrl, getSpeakersBaseUrl } from '@/composables/usePodcast';

type PlayerInfo = { episodeNumber: number; positionSec: number; label: string };

const withBase = (p: string) => {
  const base = (import.meta as any)?.env?.BASE_URL || '/';
  const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
  const rel = String(p).replace(/^\/+/, '');
  return `${b}${rel}`;
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

export function useInlineEpisodePlayer() {
  const settings = useSettingsStore();

  const mp3IndexLoaded = ref(false);
  const mp3IndexError = ref<string | null>(null);
  const mp3UrlByEpisode = ref<Map<number, string>>(new Map());

  const currentMp3Url = ref<string | null>(null);
  const playerInfo = ref<PlayerInfo | null>(null);
  const playerError = ref<string | null>(null);
  const playerToken = ref(0);
  const currentTranscriptUrl = ref<string | null>(null);

  const speakersMetaUrl = computed(() => getSpeakersBaseUrl());

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
        ? `MP3 Index nicht verfügbar (${mp3IndexError.value})`
        : 'Keine MP3-URL für diese Episode gefunden (episodes.json)';
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

  const setPlayerError = (message: string | null) => {
    playerError.value = message;
  };

  return {
    currentMp3Url,
    playerInfo,
    playerError,
    playerToken,
    currentTranscriptUrl,
    speakersMetaUrl,
    mp3UrlByEpisode,
    ensureMp3Index,
    openEpisodeAt,
    playEpisodeAt,
    closePlayer,
    setPlayerError,
  };
}


