<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SubjectRiver from '../components/SubjectRiver.vue';
import SubjectRadar from '../components/SubjectRadar.vue';
import EpisodeTable from '../components/EpisodeTable.vue';
import type { SubjectRiverData } from '../types';
import { getPodcastFileUrl, withBase, getSpeakersBaseUrl } from '@/composables/usePodcast';
import { useSettingsStore } from '@/stores/settings';
import { useLazyEpisodeDetails, loadEpisodeDetail, getCachedEpisodeDetail } from '@/composables/useEpisodeDetails';
import { useAudioPlayerStore } from '@/stores/audioPlayer';

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();
const subjectData = ref<SubjectRiverData | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const activeChart = ref<'river' | 'radar'>('radar');
const radarSelectedArea = ref<{ year: number; subject: string } | null>(null);
const radarComponentRef = ref<InstanceType<typeof SubjectRadar> | null>(null);
const riverComponentRef = ref<InstanceType<typeof SubjectRiver> | null>(null);
const riverEpisodeTableRef = ref<InstanceType<typeof EpisodeTable> | null>(null);
const radarEpisodeTableRef = ref<InstanceType<typeof EpisodeTable> | null>(null);

// Local state for river chart controls (synced with URL and store)
const normalizedView = ref(settings.normalizedView);
const subjectFilter = ref(settings.subjectFilter);

// Episode details for radar table
const { setupLazyLoad } = useLazyEpisodeDetails();
const radarEpisodeDetails = ref<Map<number, any>>(new Map());
const loadingRadarEpisodes = ref(false);

// Compute episodes for selected area
const radarSelectedEpisodes = computed(() => {
  if (!radarSelectedArea.value || !subjectData.value) return [];
  
  const { year, subject } = radarSelectedArea.value;
  const subjectDataObj = subjectData.value.subjects[subject];
  if (!subjectDataObj) return [];
  
  const yearData = subjectDataObj.yearData.find(yd => yd.year === year);
  if (!yearData) return [];
  
  return yearData.episodes.sort((a, b) => b.number - a.number);
});

async function loadData() {
  loading.value = true;
  error.value = null;
  
  try {
    const url = getPodcastFileUrl('subject-river-data.json');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load subject river data: ${response.status}`);
    }
    subjectData.value = await response.json();
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unbekannter Fehler';
    error.value = errorMessage;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await loadData();
  // Read URL parameters after data is loaded and components are mounted
  await nextTick();
  await nextTick(); // Extra tick to ensure components are fully mounted
  readFromUrl();
});

// Helper function to format duration
const formatDuration = (duration: string | [number, number, number] | undefined) => {
  if (!duration) return '—';
  if (typeof duration === 'string') {
    const parts = duration.split(':');
    if (parts.length === 3) {
      const [h, m, s] = parts;
      if (h === '00') return `${m}:${s}`;
      return `${h}:${m}:${s}`;
    }
    return duration;
  }
  if (Array.isArray(duration) && duration.length === 3) {
    const [h, m, s] = duration;
    if (h === 0) return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return '—';
};

// Helper function to set default years for radar chart
const setDefaultRadarYears = () => {
  if (radarComponentRef.value && subjectData.value && radarComponentRef.value.setSelectedYears) {
    const data = subjectData.value;
    // Get available years (sorted descending, newest first)
    const availableYears = data.statistics.years
      .filter(year => {
        // Check if any subject has data for this year
        return Object.values(data.subjects).some(subject => {
          const yearData = subject.yearData.find(yd => yd.year === year);
          return yearData && yearData.count > 0;
        });
      })
      .sort((a, b) => b - a); // Descending order (newest first)
    
    if (availableYears.length > 0) {
      const defaultYears: number[] = [];
      
      // Always add newest year (first in descending order)
      const newestYear = availableYears[0];
      if (newestYear !== undefined) {
        defaultYears.push(newestYear);
      }
      
      // Always add oldest year (last in descending order)
      const oldestYear = availableYears[availableYears.length - 1];
      if (oldestYear !== undefined && oldestYear !== newestYear) {
        defaultYears.push(oldestYear);
      }
      
      // Add middle year if available and different from newest/oldest
      if (availableYears.length > 2) {
        const middleIndex = Math.floor(availableYears.length / 2);
        const middleYear = availableYears[middleIndex];
        if (middleYear !== undefined && !defaultYears.includes(middleYear)) {
          defaultYears.push(middleYear);
        }
      } else if (availableYears.length === 2) {
        // If only two years available, add the second one (oldest)
        const secondYear = availableYears[1];
        if (secondYear !== undefined && !defaultYears.includes(secondYear)) {
          defaultYears.push(secondYear);
        }
      }
      
      // Set the default years (should be at least 1, up to 3)
      if (defaultYears.length > 0) {
        radarComponentRef.value.setSelectedYears(defaultYears);
      }
    }
  }
};

// Watch for podcast changes and reload data
watch(() => settings.selectedPodcast, async () => {
  await loadData();
  radarEpisodeDetails.value.clear();
  // Reset years to defaults when podcast changes and we're on radar chart
  if (activeChart.value === 'radar') {
    await nextTick();
    await nextTick(); // Wait for component to mount
    setDefaultRadarYears();
  }
});

// Update URL when selections change
const updateUrl = () => {
  const query: Record<string, string | undefined> = {};
  
  if (activeChart.value) {
    query.chart = activeChart.value;
  }
  
  if (activeChart.value === 'river') {
    // Include normalized view and subject filter for river chart
    if (normalizedView.value) {
      query.normalized = '1';
    } else {
      // Explicitly remove normalized parameter if false
      query.normalized = undefined;
    }
    query.subjects = subjectFilter.value.toString();
    
    if (riverComponentRef.value?.selectedSubject) {
      query.subject = riverComponentRef.value.selectedSubject;
      if (riverComponentRef.value.selectedYear) {
        query.year = riverComponentRef.value.selectedYear.toString();
      }
    }
    
    // Remove area parameter when switching to river chart (it's radar-specific)
    query.area = undefined;
  }
  
  if (activeChart.value === 'radar') {
    // Include selected years for radar chart
    if (radarComponentRef.value?.selectedYears && radarComponentRef.value.selectedYears.size > 0) {
      const yearsArray = Array.from(radarComponentRef.value.selectedYears).sort();
      query.years = yearsArray.join(',');
    }
    
    // Include selected area if any
    if (radarSelectedArea.value) {
      query.area = `${radarSelectedArea.value.subject}:${radarSelectedArea.value.year}`;
    }
    
    // Remove river chart specific parameters when switching to radar
    query.subject = undefined;
    query.year = undefined;
  }
  
  // Build final query object, removing undefined values and merging with current query
  const currentQuery = route.query;
  const mergedQuery: Record<string, string> = {};
  
  // Copy current query values (only strings)
  Object.keys(currentQuery).forEach(key => {
    const value = currentQuery[key];
    if (typeof value === 'string') {
      mergedQuery[key] = value;
    }
  });
  
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined) {
      mergedQuery[key] = value;
    } else {
      // Remove the key if value is undefined
      delete mergedQuery[key];
    }
  });
  
  // Only update URL if query params actually changed
  const hasChanges = 
    mergedQuery.chart !== currentQuery.chart ||
    mergedQuery.subject !== currentQuery.subject ||
    mergedQuery.year !== currentQuery.year ||
    mergedQuery.years !== currentQuery.years ||
    mergedQuery.area !== currentQuery.area ||
    mergedQuery.normalized !== currentQuery.normalized ||
    mergedQuery.subjects !== currentQuery.subjects;
  
  if (hasChanges) {
    router.replace({ query: mergedQuery });
  }
};

// Read initial values from URL
const readFromUrl = () => {
  const query = route.query;
  
  // Chart type
  if (query.chart === 'river' || query.chart === 'radar') {
    activeChart.value = query.chart;
  }
  
  // Normalized view and subject filter for river chart
  if (activeChart.value === 'river') {
    if (query.normalized === '1') {
      normalizedView.value = true;
    } else if (query.normalized === undefined) {
      // Fall back to store value if not in URL
      normalizedView.value = settings.normalizedView;
    } else {
      normalizedView.value = false;
    }
    
    if (query.subjects && typeof query.subjects === 'string') {
      const filterValue = parseInt(query.subjects, 10);
      if (Number.isFinite(filterValue) && filterValue >= 5) {
        // Validate against max available subjects
        const maxSubjects = subjectData.value?.statistics.subjectsByEpisodeCount.length || 12;
        subjectFilter.value = Math.min(filterValue, Math.max(5, maxSubjects));
      }
    } else if (subjectData.value) {
      // Fall back to store value if not in URL, but validate against max
      const maxSubjects = subjectData.value.statistics.subjectsByEpisodeCount.length;
      const storeValue = settings.subjectFilter;
      subjectFilter.value = Math.min(Math.max(5, storeValue), Math.max(5, maxSubjects));
    } else {
      // Use store value if data not loaded yet
      subjectFilter.value = settings.subjectFilter;
    }
    
    // Subject and year for river chart
    if (query.subject && typeof query.subject === 'string') {
      // Will be set after component is mounted
      nextTick(() => {
        if (riverComponentRef.value && subjectData.value) {
          const subjectId = query.subject as string;
          // Check if subject exists in data
          if (subjectData.value.subjects[subjectId]) {
            riverComponentRef.value.setSelectedSubject(subjectId);
            
            if (query.year && typeof query.year === 'string') {
              const year = parseInt(query.year, 10);
              if (Number.isFinite(year)) {
                riverComponentRef.value.setSelectedYear(year);
              }
            }
          }
        }
      });
    }
  }
  
  // Years and area for radar chart
  if (activeChart.value === 'radar') {
    // Set selected years from URL - need to wait for component to be mounted
    if (query.years && typeof query.years === 'string') {
      nextTick(() => {
        if (radarComponentRef.value && radarComponentRef.value.setSelectedYears) {
          const yearsStr = query.years;
          if (typeof yearsStr === 'string') {
            const years = yearsStr.split(',').map((y: string) => parseInt(y.trim(), 10)).filter((y: number) => Number.isFinite(y));
            if (years.length > 0) {
              radarComponentRef.value.setSelectedYears(years);
            }
          }
        }
      });
    } else {
      // Default years if not in URL: newest, oldest, and middle year
      nextTick(() => {
        setDefaultRadarYears();
      });
    }
    
    // Set selected area from URL
    if (query.area && typeof query.area === 'string') {
      const [subject, yearStr] = query.area.split(':');
      if (subject && yearStr) {
        const year = parseInt(yearStr, 10);
        if (Number.isFinite(year) && subjectData.value?.subjects[subject]) {
          radarSelectedArea.value = { subject, year };
        }
      }
    }
  }
};

// Watch for chart changes and clear selected area
watch(activeChart, async (newChart) => {
  if (newChart !== 'radar') {
    // When switching to river chart, check if there's an area parameter from radar
    // and use it to set the subject and year in river chart
    const query = route.query;
    if (query.area && typeof query.area === 'string' && newChart === 'river') {
      const [subject, yearStr] = query.area.split(':');
      if (subject && yearStr) {
        const year = parseInt(yearStr, 10);
        if (Number.isFinite(year) && subjectData.value?.subjects[subject]) {
          await nextTick();
          if (riverComponentRef.value) {
            riverComponentRef.value.setSelectedSubject(subject);
            if (Number.isFinite(year)) {
              riverComponentRef.value.setSelectedYear(year);
            }
          }
        }
      }
    }
    radarSelectedArea.value = null;
    radarEpisodeDetails.value.clear();
  } else {
    // When switching to radar chart, restore years and selected area from URL
    // Wait for component to be mounted and available
    await nextTick();
    await nextTick(); // Extra tick to ensure component is fully mounted
    
    const query = route.query;
    
    // Restore selected years
    let attempts = 0;
    const maxAttempts = 10;
    const restoreYears = () => {
      if (query.years && typeof query.years === 'string' && radarComponentRef.value && radarComponentRef.value.setSelectedYears) {
        const years = query.years.split(',').map(y => parseInt(y.trim(), 10)).filter(y => Number.isFinite(y));
        if (years.length > 0) {
          radarComponentRef.value.setSelectedYears(years);
          return true;
        }
      }
      return false;
    };
    
    while (attempts < maxAttempts && !restoreYears()) {
      await nextTick();
      attempts++;
    }
    
    // Restore selected area (subject + year) from URL
    // Check both 'area' parameter (radar-specific) and 'subject'/'year' parameters (from river chart)
    let areaToRestore: { subject: string; year: number } | null = null;
    
    if (query.area && typeof query.area === 'string' && subjectData.value) {
      // Use area parameter if available (from previous radar selection)
      const [subject, yearStr] = query.area.split(':');
      if (subject && yearStr) {
        const year = parseInt(yearStr, 10);
        if (Number.isFinite(year) && subjectData.value.subjects[subject]) {
          areaToRestore = { subject, year };
        }
      }
    } else if (query.subject && typeof query.subject === 'string' && query.year && typeof query.year === 'string' && subjectData.value) {
      // Convert river chart's subject/year to radar's area format
      const subject = query.subject;
      const year = parseInt(query.year, 10);
      if (Number.isFinite(year) && subjectData.value.subjects[subject]) {
        areaToRestore = { subject, year };
      }
    }
    
    if (areaToRestore) {
      // Set in parent component first
      radarSelectedArea.value = areaToRestore;
      // Also set it in the radar component - wait a bit more for component to be ready
      await nextTick();
      await nextTick();
      if (radarComponentRef.value && radarComponentRef.value.setSelectedArea) {
        radarComponentRef.value.setSelectedArea(areaToRestore);
      }
    }
  }
  // Update URL after all state changes
  updateUrl();
});

// Watch for changes and update URL
watch(() => riverComponentRef.value?.selectedSubject, () => {
  if (activeChart.value === 'river') {
    updateUrl();
  }
});

watch(() => riverComponentRef.value?.selectedYear, () => {
  if (activeChart.value === 'river') {
    updateUrl();
  }
});

// Watch for normalized view and subject filter changes
watch(normalizedView, (newValue) => {
  // Update store when value changes
  settings.setNormalizedView(newValue);
  if (activeChart.value === 'river') {
    updateUrl();
  }
});

watch(subjectFilter, (newValue) => {
  // Update store when value changes
  settings.subjectFilter = newValue;
  if (activeChart.value === 'river') {
    updateUrl();
  }
});

watch(radarSelectedArea, () => {
  if (activeChart.value === 'radar') {
    updateUrl();
    // Scroll to radar table when selection is made
    nextTick(() => {
      setTimeout(() => {
        if (radarEpisodeTableRef.value?.$el) {
          radarEpisodeTableRef.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    });
  }
});

// Watch for river chart selection changes to scroll to table
watch(() => riverComponentRef.value?.selectedSubjectInfo, (newValue) => {
  if (newValue && activeChart.value === 'river' && riverComponentRef.value?.showEpisodeList) {
    // Scroll to river table when a subject is selected
    nextTick(() => {
      setTimeout(() => {
        if (riverEpisodeTableRef.value?.$el) {
          riverEpisodeTableRef.value.$el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    });
  }
});

// Watch for radar selected years changes
watch(() => radarComponentRef.value?.selectedYears, () => {
  if (activeChart.value === 'radar') {
    updateUrl();
  }
}, { deep: true });

// Load episode details when area is selected
watch(radarSelectedEpisodes, async (episodes) => {
  if (episodes.length === 0) {
    radarEpisodeDetails.value.clear();
    return;
  }
  
  loadingRadarEpisodes.value = true;
  
  // Load details for all episodes
  const episodeNumbers = episodes.map(ep => ep.number);
  
  // Preload first few episodes immediately
  const visibleCount = Math.min(5, episodeNumbers.length);
  const visibleEpisodes = episodeNumbers.slice(0, visibleCount);
  
  await Promise.all(visibleEpisodes.map(async (episodeNum) => {
    const cached = getCachedEpisodeDetail(episodeNum);
    if (cached !== undefined && cached !== null) {
      radarEpisodeDetails.value.set(episodeNum, cached);
      return;
    }
    
    try {
      const detail = await loadEpisodeDetail(episodeNum);
      if (detail) {
        radarEpisodeDetails.value.set(episodeNum, detail);
      }
    } catch (e) {
      console.error(`Failed to load episode ${episodeNum}:`, e);
    }
  }));
  
  // Setup lazy loading for remaining episodes
  await nextTick();
  episodeNumbers.slice(visibleCount).forEach(episodeNum => {
    const rowElement = document.querySelector(`[data-episode-row="${episodeNum}"]`) as HTMLElement;
    if (rowElement) {
      setupLazyLoad(rowElement, episodeNum, (detail) => {
        if (detail) {
          radarEpisodeDetails.value.set(episodeNum, detail);
        }
      });
    } else {
      // Element not found, load immediately
      loadEpisodeDetail(episodeNum).then(detail => {
        if (detail) {
          radarEpisodeDetails.value.set(episodeNum, detail);
        }
      });
    }
  });
  
  loadingRadarEpisodes.value = false;
}, { immediate: true });

// Helper functions for episode table
const audioPlayerStore = useAudioPlayerStore();

// MP3 playback (uses /episodes.json generated from MP3 RSS feed) - same as SubjectRiver
const mp3IndexLoaded = ref(false);
const mp3IndexError = ref<string | null>(null);
const mp3UrlByEpisode = ref<Map<number, string>>(new Map());

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
      for (const [k, v] of Object.entries(data.byNumber)) {
        const n = parseInt(k, 10);
        const vObj = v as any;
        const url = typeof vObj?.mp3Url === 'string' ? vObj.mp3Url : null;
        if (Number.isFinite(n) && url) map.set(n, url);
      }
    } else if (Array.isArray(data?.episodes)) {
      for (const ep of data.episodes) {
        const epObj = ep as any;
        const n = epObj?.number;
        const url = typeof epObj?.mp3Url === 'string' ? epObj.mp3Url : null;
        if (Number.isFinite(n) && url) map.set(n as number, url);
      }
    }

    mp3UrlByEpisode.value = map;
    mp3IndexLoaded.value = true;
  } catch (e) {
    mp3IndexError.value = e instanceof Error ? e.message : String(e);
  }
};

// Watch for podcast changes and clear the cached MP3 index
watch(() => settings.selectedPodcast, () => {
  mp3IndexLoaded.value = false;
  mp3IndexError.value = null;
  mp3UrlByEpisode.value.clear();
});

const formatHmsFromSeconds = (sec: unknown) => {
  const s0 = Number.isFinite(sec as number) ? Math.max(0, Math.floor(sec as number)) : null;
  if (s0 === null) return '—';
  const hours = Math.floor(s0 / 3600);
  const minutes = Math.floor((s0 % 3600) / 60);
  const seconds = s0 % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getTopicOccurrences = (episode: any): Array<{ positionSec: number; durationSec: number | null; topic: string | null }> => {
  if (!radarComponentRef.value) return [];
  return radarComponentRef.value.getTopicOccurrences(episode);
};

const formatOccurrenceLabel = (occ: { positionSec: number; durationSec: number | null; topic?: string | null }) => {
  if (!radarComponentRef.value) return '';
  return radarComponentRef.value.formatOccurrenceLabel(occ);
};

const playEpisodeAt = async (episodeNumber: number, positionSec: number, label: string) => {
  await ensureMp3Index();

  const mp3 = mp3UrlByEpisode.value.get(episodeNumber) || null;
  if (!mp3) {
    const errorMsg = mp3IndexError.value
      ? `MP3 Index nicht verfügbar (${mp3IndexError.value})`
      : 'Keine MP3-URL für diese Episode gefunden (episodes.json)';
    audioPlayerStore.setError(errorMsg);
    return;
  }

  // Get episode title from details if available
  const details = radarEpisodeDetails.value.get(episodeNumber);
  const title = details?.title || `Episode ${episodeNumber}`;

  audioPlayerStore.play({
    src: mp3,
    title: title,
    subtitle: label,
    seekToSec: Math.max(0, Math.floor(positionSec)),
    autoplay: true,
    transcriptSrc: withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`)),
    speakersMetaUrl: getSpeakersBaseUrl(),
  });
};
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Lade {{ $t('nav.subjects') }}-Daten...</p>
    </div>
  </div>

  <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
    <p class="text-red-800 dark:text-red-200 font-semibold">{{ error }}</p>
  </div>

  <div v-else-if="subjectData">
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div class="p-3 sm:p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{{ subjectData.statistics.totalSubjects || 0 }}</div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">{{ $t('nav.subjects') }} insgesamt</div>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
            {{ subjectData.statistics.yearRange.start }} - {{ subjectData.statistics.yearRange.end }}
          </div>
          <div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Zeitspanne</div>
        </div>
      </div>
      
      <!-- Second-level navigation -->
      <div class="border-t border-purple-200 dark:border-purple-800 pt-4">
        <!-- Chart Selector -->
        <div class="flex justify-center mb-4">
          <div class="flex gap-1 sm:gap-2 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-md w-full sm:w-auto overflow-x-auto">
            <button
              @click="activeChart = 'river'; updateUrl();"
              :class="[
                'px-3 sm:px-4 py-2 rounded-md transition-colors text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0',
                activeChart === 'river'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              ]"
            >
              River Chart
            </button>
            <button
              @click="activeChart = 'radar'; updateUrl();"
              :class="[
                'px-3 sm:px-4 py-2 rounded-md transition-colors text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0',
                activeChart === 'radar'
                  ? 'bg-purple-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              ]"
            >
              Radar Chart
            </button>
          </div>
        </div>
        
        <!-- River Chart Controls (only shown when river chart is active) -->
        <div v-if="activeChart === 'river' && subjectData" class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 w-full">
          <label class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex flex-col sm:flex-row sm:items-center gap-2">
            <span class="whitespace-nowrap">Anzahl {{ $t('nav.subjects') }}:</span>
            <div class="flex items-center gap-2">
              <input
                v-model.number="subjectFilter"
                type="range"
                min="5"
                :max="Math.max(5, subjectData.statistics.subjectsByEpisodeCount.length)"
                step="1"
                class="flex-1 sm:w-32 md:w-48 slider-purple"
              />
              <span class="font-semibold min-w-[2rem] text-right text-purple-600 dark:text-purple-400">{{ subjectFilter }}</span>
            </div>
          </label>
          
          <label class="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              v-model="normalizedView"
              type="checkbox"
              class="w-4 h-4 rounded checkbox-purple"
            />
            <span>Normierte Ansicht (100%/Jahr)</span>
          </label>
        </div>
      </div>
    </div>

    <SubjectRiver 
      v-if="activeChart === 'river'" 
      ref="riverComponentRef"
      :data="subjectData" 
      color="purple"
      :normalized-view="normalizedView"
      :subject-filter="subjectFilter"
    />
    <SubjectRadar 
      v-if="activeChart === 'radar'" 
      ref="radarComponentRef"
      :data="subjectData" 
      color="purple"
      @selected-area="(area) => { 
        radarSelectedArea = area;
        updateUrl();
      }"
    />
    </div>
    
    <!-- Toggle Buttons (only for river chart) -->
    <template v-if="activeChart === 'river' && riverComponentRef">
      <div v-if="riverComponentRef.selectedSubjectInfo" class="mt-6 flex justify-center gap-2 mb-4">
        <button
          @click="riverComponentRef.setShowEpisodeList(true)"
          :class="[
            'text-sm font-semibold px-3 py-1 rounded transition-colors',
            riverComponentRef.showEpisodeList 
              ? 'bg-purple-600 text-white'
              : 'text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300'
          ]"
        >
          Episoden
        </button>
        <button
          @click="() => { 
            if (riverComponentRef) {
              riverComponentRef.setShowEpisodeList(false);
              riverComponentRef.setShowTopicList(true);
              // Ensure topics are loaded - call directly if not already loading
              if (riverComponentRef.selectedSubjectInfo) {
                riverComponentRef.loadAllTopics();
              }
            }
          }"
          :class="[
            'text-sm font-semibold px-3 py-1 rounded transition-colors',
            riverComponentRef.showTopicList 
              ? 'bg-purple-600 text-white'
              : 'text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300'
          ]"
        >
          Topics
        </button>
      </div>
      
      <!-- Episodes Table (for river chart) -->
      <div v-if="riverComponentRef.selectedSubjectInfo && riverComponentRef.showEpisodeList" class="mt-6">
        <div v-if="riverComponentRef.loadingEpisodes" class="p-4 text-center text-gray-600 dark:text-gray-400">
          Lade Episoden-Details...
        </div>
        <EpisodeTable
          ref="riverEpisodeTableRef"
          v-else
          :episodes="riverComponentRef.selectedSubjectInfo.episodes"
          :episode-details="riverComponentRef.episodeDetails"
          :loading-episodes="riverComponentRef.loadingEpisodes"
          :get-topic-occurrences="riverComponentRef.getTopicOccurrences"
          :play-episode-at="riverComponentRef.playEpisodeAt"
          :format-occurrence-label="riverComponentRef.formatOccurrenceLabel"
          :format-hms-from-seconds="riverComponentRef.formatHmsFromSeconds"
          :format-duration="riverComponentRef.formatDuration"
          theme-color="purple"
          :show-play-button="true"
        >
          <template #header>
            <div class="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 class="text-lg font-semibold text-purple-900 dark:text-purple-100">
                  Episoden: {{ riverComponentRef.selectedSubjectInfo.name }}{{ riverComponentRef.selectedYear ? ` (${riverComponentRef.selectedYear})` : '' }}
                </h2>
                <!-- Year Filter Badge -->
                <div v-if="riverComponentRef.selectedYear" class="mt-2 inline-flex items-center gap-2 text-white px-3 py-1 rounded-full text-sm font-semibold bg-purple-600">
                  <span>📅 Jahr: {{ riverComponentRef.selectedYear }}</span>
                  <button 
                    @click="riverComponentRef.setSelectedYear(null)"
                    class="rounded-full w-5 h-5 flex items-center justify-center transition-colors hover:bg-purple-700"
                    title="Jahr-Filter entfernen"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <button
                @click="riverComponentRef.setSelectedSubject(null); riverComponentRef.setSelectedYear(null); riverComponentRef.setShowEpisodeList(false); riverComponentRef.setShowTopicList(false);"
                class="font-semibold p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                aria-label="Schließen"
              >
                ✕
              </button>
            </div>
          </template>
        </EpisodeTable>
      </div>
      
      <!-- Topics List (for river chart) -->
      <div v-if="riverComponentRef.selectedSubjectInfo && riverComponentRef.showTopicList" class="mt-6">
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-lg border border-purple-300 dark:border-purple-700 overflow-hidden">
          <div v-if="riverComponentRef.loadingTopics" class="p-4 text-center text-gray-600 dark:text-gray-400">
            Lade alle Topics...
          </div>
          <div v-else class="max-h-96 overflow-y-auto">
            <div class="p-3 sticky top-0 bg-purple-100 dark:bg-purple-900 border-b border-purple-200 dark:border-purple-700">
              <div class="flex items-center justify-between flex-wrap gap-4">
                <p class="text-sm font-semibold text-purple-900 dark:text-purple-100">
                  {{ riverComponentRef.allIndividualTopics?.length || 0 }} einzelne Topics gefunden
                </p>
                <button
                  @click="riverComponentRef.setSelectedSubject(null); riverComponentRef.setSelectedYear(null); riverComponentRef.setShowEpisodeList(false); riverComponentRef.setShowTopicList(false);"
                  class="font-semibold p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                  aria-label="Schließen"
                >
                  ✕
                </button>
              </div>
            </div>
            <div class="divide-y divide-purple-100 dark:divide-purple-800">
              <div 
                v-for="(topicItem, index) in riverComponentRef.allIndividualTopics" 
                :key="`${topicItem.episodeNumber}-${index}`"
                class="p-3 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ topicItem.topic }}</p>
                    <div class="mt-1 flex flex-wrap gap-1 items-center">
                      <span 
                        v-if="topicItem.clusterName"
                        class="inline-block px-2 py-0.5 text-xs rounded font-semibold bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100"
                      >
                        {{ topicItem.clusterName }}
                      </span>
                      <span 
                        v-for="keyword in topicItem.keywords"
                        :key="keyword"
                        class="inline-block px-2 py-0.5 text-xs rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                      >
                        {{ keyword }}
                      </span>
                    </div>
                  </div>
                  <div class="text-right whitespace-nowrap">
                    <a 
                      :href="riverComponentRef.episodeDetails?.get(topicItem.episodeNumber)?.url || `https://freakshow.fm/${topicItem.episodeTitle.toLowerCase().split(' ')[0]}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-xs text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                    >
                      {{ topicItem.episodeTitle }}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    
    <!-- Episodes Table (for radar chart) -->
    <div v-if="activeChart === 'radar' && radarSelectedArea" class="mt-6">
      <EpisodeTable
        ref="radarEpisodeTableRef"
        :episodes="radarSelectedEpisodes"
        :episode-details="radarEpisodeDetails"
        :loading-episodes="loadingRadarEpisodes"
        :get-topic-occurrences="getTopicOccurrences"
        :play-episode-at="playEpisodeAt"
        :format-occurrence-label="formatOccurrenceLabel"
        :format-hms-from-seconds="formatHmsFromSeconds"
        :format-duration="formatDuration"
        theme-color="purple"
        :show-play-button="true"
      >
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-purple-900 dark:text-purple-100">
              Episoden: {{ subjectData.subjects[radarSelectedArea.subject]?.name }} ({{ radarSelectedArea.year }})
            </h2>
            <button
              @click="radarSelectedArea = null; updateUrl();"
              class="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-semibold ml-4"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
        </template>
      </EpisodeTable>
    </div>
    
    <!-- Footer outside panel, centered -->
    <div class="mt-6 text-center text-gray-500 dark:text-gray-400 text-xs sm:text-sm">
      <p>Generiert am: {{ new Date(subjectData.generatedAt).toLocaleString('de-DE') }}</p>
    </div>
  </div>
</template>

