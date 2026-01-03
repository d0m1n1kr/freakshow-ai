<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick, onUnmounted } from 'vue';
import * as d3 from 'd3';
import type { SpeakerRiverData, ProcessedSpeakerData } from '../types';
import { useSettingsStore } from '../stores/settings';
import { useAudioPlayerStore } from '../stores/audioPlayer';
import { getPodcastFileUrl, getEpisodeUrl, getSpeakersBaseUrl, getSpeakerMetaUrl } from '@/composables/usePodcast';
import { useLazyEpisodeDetails, loadEpisodeDetail, getCachedEpisodeDetail } from '@/composables/useEpisodeDetails';

const props = defineProps<{
  data: SpeakerRiverData;
}>();

const svgRef = ref<SVGSVGElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const selectedSpeaker = ref<string | null>(null);
const hoveredSpeaker = ref<string | null>(null);
const speakerFilter = ref<number>(15);
const normalizedView = ref<boolean>(false);
const dimensions = ref({ width: 1200, height: 600 });
const selectedYear = ref<number | null>(null);
const tooltipData = ref<{ speakerName: string; speakerImage?: string; year: number; x: number; y: number } | null>(null);
// @ts-expect-error - tooltipRef is used in template but TypeScript doesn't recognize template refs
const tooltipRef = ref<HTMLDivElement | null>(null);

// Audio player setup
const settings = useSettingsStore();
const audioPlayerStore = useAudioPlayerStore();

// Speaker metadata with images
type SpeakerMeta = {
  name: string;
  slug: string;
  image?: string;
};
const speakersMeta = ref<Map<string, SpeakerMeta>>(new Map());

// Helper to convert speaker name to slug
function speakerNameToSlug(name: string): string {
  return name.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// Load speaker metadata (for images)
const loadSpeakerMeta = async (speakerName: string) => {
  if (speakersMeta.value.has(speakerName)) return;
  
  try {
    const slug = speakerNameToSlug(speakerName);
    const url = getSpeakerMetaUrl(slug);
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

// Load all speaker metadata
const loadAllSpeakerMeta = async () => {
  if (!props.data) return;
  for (const speaker of props.data.speakers) {
    await loadSpeakerMeta(speaker.name);
  }
};

// MP3 index loading
const mp3IndexLoaded = ref(false);
const mp3IndexError = ref<string | null>(null);
const mp3UrlByEpisode = ref<Map<number, string>>(new Map());

// Prozessiere die Daten
const processedData = computed(() => {
  const speakers: ProcessedSpeakerData[] = [];
  const years = props.data.statistics.years;
  
  console.log('Processing speaker data with speakerFilter:', speakerFilter.value);
  
  // Erstelle ein Array aller Speaker mit ihrer Episode-Anzahl
  const allSpeakers = props.data.speakers.map(speaker => ({
    id: speaker.id,
    name: speaker.name,
    episodeCount: speaker.totalEpisodes,
    data: speaker
  }));
  
  // Sortiere nach Episode-Anzahl und nimm die Top-N
  const topSpeakers = allSpeakers
    .sort((a, b) => b.episodeCount - a.episodeCount)
    .slice(0, speakerFilter.value);
  
  console.log('Top speakers count:', topSpeakers.length);
  
  // Erweiterte Farbpalette für mehr Speaker
  const generateColors = (count: number): string[] => {
    if (count <= 10) {
      return d3.schemeCategory10.slice(0, count);
    }
    
    // Kombiniere mehrere D3 Farbschemata für bessere Unterscheidbarkeit
    const colors = [
      ...d3.schemeCategory10,
      ...d3.schemePaired,
      ...d3.schemeSet3
    ];
    
    // Falls immer noch nicht genug, generiere zusätzliche Farben mit HSL
    if (count > colors.length) {
      for (let i = colors.length; i < count; i++) {
        const hue = (i * 137.5) % 360; // Goldener Winkel für gute Verteilung
        const saturation = 60 + (i % 3) * 15;
        const lightness = 45 + (i % 4) * 10;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
      }
    }
    
    return colors.slice(0, count);
  };
  
  const colors = generateColors(topSpeakers.length);
  
  topSpeakers.forEach((speakerMeta, index) => {
    const speaker = speakerMeta.data;
    if (!speaker) return;
    
    const yearValues = new Map<number, number>();
    
    // Initialisiere alle Jahre mit 0
    years.forEach(year => yearValues.set(year, 0));
    
    // Setze die tatsächlichen Werte (Anzahl Episoden)
    if (speaker.timeline && Array.isArray(speaker.timeline)) {
      speaker.timeline.forEach(timelineEntry => {
        yearValues.set(timelineEntry.year, timelineEntry.episodeCount);
      });
    }
    
    speakers.push({
      id: speaker.id,
      name: speaker.name,
      yearValues,
      totalAppearances: speaker.totalEpisodes,
      color: colors[index] || '#888'
    });
  });
  
  return { speakers, years };
});

// Erstelle das Stream Graph (Speaker River)
const drawRiver = () => {
  if (!svgRef.value || !containerRef.value) return;
  
  const container = containerRef.value;
  const width = container.clientWidth;
  const height = dimensions.value.height;
  dimensions.value.width = width;
  
  const margin = { top: 20, right: 280, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  
  // Lösche vorherigen Inhalt
  d3.select(svgRef.value).selectAll('*').remove();
  
  const svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  const { speakers, years } = processedData.value;
  
  console.log('Drawing speaker river with', speakers.length, 'speakers');
  
  // Erstelle Stack-Daten
  const stackData: any[] = years.map(year => {
    const obj: any = { year };
    speakers.forEach(speaker => {
      obj[speaker.id] = speaker.yearValues.get(year) || 0;
    });
    return obj;
  });
  
  const keys = speakers.map(s => s.id);
  const stack = d3.stack()
    .keys(keys)
    // In normierter Ansicht: stackOffsetExpand sorgt für gleich hohe Jahre (0-1)
    // In normaler Ansicht: stackOffsetWiggle für schöne Stream-Optik
    .offset(normalizedView.value ? d3.stackOffsetExpand : d3.stackOffsetWiggle)
    .order(d3.stackOrderInsideOut);
  
  const series = stack(stackData);
  
  // Scales
  const xScale = d3.scaleLinear()
    .domain([years[0] || 0, years[years.length - 1] || 0])
    .range([0, innerWidth]);
  
  const flatValues = series.flat(2).filter((d): d is number => d !== undefined);
  const yExtent = d3.extent(flatValues) as [number, number];
  const yScale = d3.scaleLinear()
    .domain(yExtent)
    .range([innerHeight, 0]);
  
  // Area generator
  const area = d3.area<any>()
    .x((d: any) => xScale(d.data.year))
    .y0((d: any) => yScale(d[0]))
    .y1((d: any) => yScale(d[1]))
    .curve(d3.curveBasis);
  
  // Zeichne die Streams
  const streams = g.selectAll('.stream')
    .data(series)
    .join('path')
    .attr('class', 'stream')
    .attr('d', area)
    .attr('fill', (d: any) => {
      const speaker = speakers.find(s => s.id === d.key);
      return speaker?.color || '#ccc';
    })
    .attr('opacity', (d: any) => {
      if (!hoveredSpeaker.value && !selectedSpeaker.value) return 0.8;
      if (hoveredSpeaker.value && d.key === hoveredSpeaker.value) return 1;
      if (selectedSpeaker.value && d.key === selectedSpeaker.value) return 1;
      return 0.2;
    })
    .style('cursor', 'pointer')
    .on('mouseover', function(event: any, d: any) {
      hoveredSpeaker.value = d.key;
      
      // Get year from mouse position
      const [mouseX] = d3.pointer(event, g.node());
      const year = Math.round(xScale.invert(mouseX));
      
      // Find speaker name
      const speaker = speakers.find(s => s.id === d.key);
      if (speaker) {
        const meta = speakersMeta.value.get(speaker.name);
        tooltipData.value = {
          speakerName: speaker.name,
          speakerImage: meta?.image,
          year: year,
          x: event.clientX,
          y: event.clientY
        };
      }
    })
    .on('mousemove', function(event: any, _d: any) {
      // Update tooltip position
      if (tooltipData.value) {
        const [mouseX] = d3.pointer(event, g.node());
        const year = Math.round(xScale.invert(mouseX));
        tooltipData.value = {
          ...tooltipData.value,
          year: year,
          x: event.clientX,
          y: event.clientY
        };
      }
    })
    .on('mouseout', function(_event: any, d: any) {
      // Only clear if we're leaving the current hovered item
      if (hoveredSpeaker.value === d.key) {
        hoveredSpeaker.value = null;
        tooltipData.value = null;
      }
    })
    .on('click', function(event: any, d: any) {
      // Get year from click position
      const [mouseX] = d3.pointer(event, g.node());
      const year = Math.round(xScale.invert(mouseX));
      
      // Set selected speaker and year
      selectedSpeaker.value = selectedSpeaker.value === d.key ? null : d.key;
      if (selectedSpeaker.value) {
        selectedYear.value = year;
        showEpisodeList.value = true;
      } else {
        selectedYear.value = null;
        showEpisodeList.value = false;
      }
    });
  
  // X-Achse
  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d3.format('d'))
    .ticks(years.length);
  
  g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text')
    .attr('fill', '#666')
    .style('font-size', '12px');
  
  g.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 45)
    .attr('fill', '#333')
    .attr('text-anchor', 'middle')
    .style('font-size', '14px')
    .style('font-weight', '600')
    .text('Jahr');
  
  // Legende
  const legend = g.append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${innerWidth + 20}, 0)`);
  
  speakers.forEach((speaker, i) => {
    const legendRow = legend.append('g')
      .attr('class', 'legend-item')
      .attr('data-speaker-id', speaker.id)
      .attr('transform', `translate(0, ${i * 24})`)
      .style('cursor', 'pointer')
      .on('mouseover', function() {
        hoveredSpeaker.value = speaker.id;
      })
      .on('mouseout', function() {
        // Only clear if we're leaving the current hovered item
        if (hoveredSpeaker.value === speaker.id) {
          hoveredSpeaker.value = null;
        }
      })
      .on('click', function() {
        selectedSpeaker.value = selectedSpeaker.value === speaker.id ? null : speaker.id;
      });
    
    legendRow.append('rect')
      .attr('width', 16)
      .attr('height', 16)
      .attr('fill', speaker.color)
      .attr('opacity', () => {
        if (!hoveredSpeaker.value && !selectedSpeaker.value) return 0.8;
        if (hoveredSpeaker.value === speaker.id || selectedSpeaker.value === speaker.id) return 1;
        return 0.2;
      });
    
    const text = legendRow.append('text')
      .attr('x', 22)
      .attr('y', 12)
      .attr('fill', '#333')
      .style('font-size', '11px')
      .style('font-weight', () => {
        if (hoveredSpeaker.value === speaker.id || selectedSpeaker.value === speaker.id) return '600';
        return '400';
      })
      .text(`${speaker.name} (${speaker.totalAppearances} Episoden)`);
    
    // Tooltip für lange Namen
    text.append('title').text(`${speaker.name} (${speaker.totalAppearances} Episoden)`);
  });
  
  return streams; // Return streams for updating
};

// Function to update opacity without full redraw
const updateOpacity = () => {
  if (!svgRef.value) return;
  
  const svg = d3.select(svgRef.value);
  
  // Update stream opacity
  svg.selectAll('.stream')
    .attr('opacity', function(d: any) {
      if (!hoveredSpeaker.value && !selectedSpeaker.value) return 0.8;
      if (hoveredSpeaker.value && d.key === hoveredSpeaker.value) return 1;
      if (selectedSpeaker.value && d.key === selectedSpeaker.value) return 1;
      return 0.2;
    });
  
  // Update legend opacity and font weight
  svg.selectAll('.legend-item').each(function() {
    const item = d3.select(this);
    const speakerId = item.attr('data-speaker-id');
    
    item.select('rect')
      .attr('opacity', () => {
        if (!hoveredSpeaker.value && !selectedSpeaker.value) return 0.8;
        if (hoveredSpeaker.value === speakerId || selectedSpeaker.value === speakerId) return 1;
        return 0.2;
      });
    
    item.select('text')
      .style('font-weight', () => {
        if (hoveredSpeaker.value === speakerId || selectedSpeaker.value === speakerId) return '600';
        return '400';
      });
  });
};

// Watch für Änderungen
watch(speakerFilter, () => {
  console.log('speakerFilter changed to:', speakerFilter.value);
  hoveredSpeaker.value = null; // Clear hover on filter change
  drawRiver();
});

watch(normalizedView, () => {
  console.log('normalizedView changed to:', normalizedView.value);
  hoveredSpeaker.value = null; // Clear hover on view change
  drawRiver();
});

// For hover/selection, just update opacity without redrawing
watch([hoveredSpeaker, selectedSpeaker], () => {
  updateOpacity();
});

// Helper function to format duration
const formatDuration = (duration: [number, number, number]) => {
  const [hours, minutes, seconds] = duration;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Initial draw und resize listener
onMounted(async () => {
  // Load speaker metadata first
  await loadAllSpeakerMeta();
  drawRiver();
  
  const resizeObserver = new ResizeObserver(() => {
    drawRiver();
  });
  
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
});

// Berechnete Infos für ausgewählten Speaker
const selectedSpeakerInfo = computed(() => {
  if (!selectedSpeaker.value) return null;
  const speaker = processedData.value.speakers.find(s => s.id === selectedSpeaker.value);
  if (!speaker) return null;
  
  const fullSpeaker = props.data.speakers.find(s => s.id === speaker.id);
  if (!fullSpeaker) {
    return {
      ...speaker,
      firstAppearance: null,
      lastAppearance: null,
      episodeNumbers: [],
      episodesByYear: [],
      totalEpisodes: 0,
      filteredCount: 0
    };
  }
  
  // Sammle alle Episoden mit Jahr-Informationen
  const episodesByYear: Array<{ number: number; year: number }> = [];
  fullSpeaker.timeline.forEach(tl => {
    tl.episodes.forEach(epNum => {
      episodesByYear.push({ number: epNum, year: tl.year });
    });
  });
  
  // Sortiere nach Nummer (neueste zuerst)
  episodesByYear.sort((a, b) => b.number - a.number);
  
  // Filtere nach ausgewähltem Jahr, falls vorhanden
  const filteredEpisodes = selectedYear.value 
    ? episodesByYear.filter(ep => ep.year === selectedYear.value)
    : episodesByYear;
  
  return {
    ...speaker,
    firstAppearance: fullSpeaker.firstAppearance,
    lastAppearance: fullSpeaker.lastAppearance,
    episodeNumbers: filteredEpisodes.map(ep => ep.number),
    episodesByYear,
    totalEpisodes: episodesByYear.length,
    filteredCount: filteredEpisodes.length
  };
});

const showEpisodeList = ref(false);
const episodeDetails = ref<Map<number, any>>(new Map());
const loadingEpisodes = ref(false);

// Use lazy loading composable
const { setupLazyLoad, preloadVisible } = useLazyEpisodeDetails();
const observerCleanups = ref<Map<number, () => void>>(new Map());

// Helper function for base URL
const withBase = (p: string) => {
  const base = (import.meta as any)?.env?.BASE_URL || '/';
  const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
  const rel = String(p).replace(/^\/+/, '');
  return `${b}${rel}`;
};

// MP3 index loading function
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

// Fallback function to open episode externally
const openEpisodeAt = async (episodeNumber: number, seconds: number) => {
  try {
    const res = await fetch(getEpisodeUrl(episodeNumber), { cache: 'force-cache' });
    if (!res.ok) return;
    const details = await res.json();
    const url = typeof details?.url === 'string' ? details.url : null;
    if (!url) return;
    const u = new URL(url);
    u.searchParams.set('t', String(Math.max(0, Math.floor(seconds))));
    u.searchParams.set('autoplay', '1');
    u.hash = `t=${Math.max(0, Math.floor(seconds))}`;
    window.open(u.toString(), '_blank', 'noopener,noreferrer');
  } catch {
    // ignore
  }
};

// Setup lazy loading for episode rows
async function setupLazyLoadingForEpisodes(episodeNumbers: number[]) {
  // Clean up existing observers for episodes that are no longer in the list
  const currentEpisodeSet = new Set(episodeNumbers);
  observerCleanups.value.forEach((cleanup, episodeNum) => {
    if (!currentEpisodeSet.has(episodeNum)) {
      cleanup();
      observerCleanups.value.delete(episodeNum);
    }
  });

  // Remove episode details that are no longer in the list
  episodeDetails.value.forEach((_, episodeNum) => {
    if (!currentEpisodeSet.has(episodeNum)) {
      episodeDetails.value.delete(episodeNum);
    }
  });

  // Preload first few visible episodes immediately
  const visibleCount = Math.min(5, episodeNumbers.length);
  if (visibleCount > 0) {
    const toPreload = episodeNumbers.slice(0, visibleCount).filter(num => !episodeDetails.value.has(num));
    if (toPreload.length > 0) {
      await preloadVisible(toPreload);
      // Sync with local map
      toPreload.forEach(num => {
        const cached = getCachedEpisodeDetail(num);
        if (cached !== undefined) {
          episodeDetails.value.set(num, cached);
        }
      });
    }
  }

  // Setup lazy loading for remaining episodes
  // Wait for DOM to update - use double nextTick to ensure Vue has rendered the list
  await nextTick();
  await nextTick();
  // Also wait for next animation frame to ensure DOM is fully ready
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  episodeNumbers.forEach(episodeNum => {
    // Skip if already has an observer
    if (observerCleanups.value.has(episodeNum)) {
      return;
    }

    // Check if already loaded in local map
    if (episodeDetails.value.has(episodeNum)) {
      return;
    }

    // Check if already cached in global cache
    const cached = getCachedEpisodeDetail(episodeNum);
    if (cached !== undefined) {
      episodeDetails.value.set(episodeNum, cached);
      return;
    }

    // Find the row element and setup observer
    const rowElement = document.querySelector(`[data-episode-row="${episodeNum}"]`) as HTMLElement;
    if (rowElement) {
      const cleanup = setupLazyLoad(
        rowElement,
        episodeNum,
        (detail) => {
          episodeDetails.value.set(episodeNum, detail);
        }
      );
      observerCleanups.value.set(episodeNum, cleanup);
    } else {
      // Element not found, load immediately
      loadEpisodeDetail(episodeNum).then(detail => {
        episodeDetails.value.set(episodeNum, detail);
      });
    }
  });
  
  loadingEpisodes.value = false;
}

// Lade Episode-Details mit lazy loading
const loadEpisodeDetails = async () => {
  if (!selectedSpeakerInfo.value || loadingEpisodes.value) return;
  
  loadingEpisodes.value = true;
  await setupLazyLoadingForEpisodes(selectedSpeakerInfo.value.episodeNumbers);
};

// Watch für showEpisodeList
watch(showEpisodeList, (newValue) => {
  if (newValue && selectedSpeakerInfo.value) {
    loadEpisodeDetails();
  }
});

// Watch für selectedYear - lade zusätzliche Episoden wenn Filter entfernt wird
watch(selectedYear, () => {
  if (showEpisodeList.value && selectedSpeakerInfo.value) {
    loadEpisodeDetails();
  }
});

// Cleanup observers on unmount
onUnmounted(() => {
  observerCleanups.value.forEach(cleanup => cleanup());
  observerCleanups.value.clear();
});

// When switching podcasts, clear cached MP3 index and episode details
watch(
  () => settings.selectedPodcast,
  () => {
    mp3IndexLoaded.value = false;
    mp3IndexError.value = null;
    mp3UrlByEpisode.value = new Map();
    episodeDetails.value = new Map();
    showEpisodeList.value = false;
    observerCleanups.value.forEach(cleanup => cleanup());
    observerCleanups.value.clear();
  }
);

// Play episode function
const playEpisodeAt = async (episodeNumber: number, seconds: number, label: string) => {
  await ensureMp3Index();

  const mp3 = mp3UrlByEpisode.value.get(episodeNumber) || null;
  if (!mp3) {
    const errorMsg = mp3IndexError.value
      ? `MP3 Index nicht verfügbar (${mp3IndexError.value})`
      : 'Keine MP3-URL für diese Episode gefunden (episodes.json)';
    audioPlayerStore.setError(errorMsg);
    // Fallback: open episode page (if we have it)
    openEpisodeAt(episodeNumber, seconds);
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
</script>

<template>
  <div class="speaker-river-container">
    <div class="controls mb-6">
      <div class="flex items-center gap-4 flex-wrap">
        <label class="text-sm font-medium text-gray-700">
          Anzahl Speaker:
          <input
            v-model.number="speakerFilter"
            type="range"
            min="5"
            max="30"
            step="1"
            class="ml-2 w-48"
            @input="(e) => { speakerFilter = Number((e.target as HTMLInputElement).value); }"
          />
          <span class="ml-2 text-green-600 font-semibold">{{ speakerFilter }}</span>
        </label>
        
        <label class="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input
            v-model="normalizedView"
            type="checkbox"
            class="w-4 h-4 text-green-600 rounded focus:ring-green-500"
          />
          <span>Normierte Ansicht (100%/Jahr)</span>
        </label>
      </div>
      
      <div v-if="selectedSpeakerInfo" class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="font-semibold text-lg text-green-900">{{ selectedSpeakerInfo.name }}</h3>
            <p class="text-sm text-green-700 mt-1">
              {{ selectedSpeakerInfo.totalAppearances }} Episoden
              <span v-if="selectedSpeakerInfo.firstAppearance">
                ({{ selectedSpeakerInfo.firstAppearance }} - {{ selectedSpeakerInfo.lastAppearance }})
              </span>
            </p>
            
            <!-- Year Filter Badge -->
            <div v-if="selectedYear" class="mt-2 inline-flex items-center gap-2 bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              <span>📅 Jahr: {{ selectedYear }}</span>
              <button 
                @click="selectedYear = null"
                class="hover:bg-green-700 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                title="Jahr-Filter entfernen"
              >
                ✕
              </button>
            </div>
            
            <div class="mt-2">
              <button
                @click="showEpisodeList = !showEpisodeList"
                class="text-sm text-green-600 hover:text-green-800 font-semibold underline"
              >
                {{ showEpisodeList ? 'Episoden ausblenden' : (selectedYear ? `${selectedSpeakerInfo.filteredCount} von ${selectedSpeakerInfo.totalEpisodes} Episoden anzeigen` : `${selectedSpeakerInfo.episodeNumbers.length} Episoden anzeigen`) }}
              </button>
            </div>
            
            <!-- Episode List -->
            <div v-if="showEpisodeList" class="mt-4 bg-white rounded-lg border border-green-300 overflow-hidden">
              <div v-if="loadingEpisodes" class="p-4 text-center text-gray-600">
                Lade Episoden-Details...
              </div>
              <div v-else class="max-h-96 overflow-y-auto">
                <table class="w-full text-sm">
                  <thead class="bg-green-100 sticky top-0">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">#</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Datum</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Titel</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Play</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Dauer</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Speaker</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr 
                      v-for="episodeNum in selectedSpeakerInfo.episodeNumbers" 
                      :key="episodeNum"
                      :data-episode-row="episodeNum"
                      class="border-t border-green-100 hover:bg-green-50"
                    >
                      <template v-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum)">
                        <td class="px-3 py-2 text-green-700 font-mono text-xs">{{ episodeNum }}</td>
                        <td class="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {{ new Date(episodeDetails.get(episodeNum)!.date).toLocaleDateString('de-DE') }}
                        </td>
                        <td class="px-3 py-2 text-gray-900">{{ episodeDetails.get(episodeNum)!.title }}</td>
                        <td class="px-3 py-2">
                          <button
                            type="button"
                            class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            @click="playEpisodeAt(episodeNum, 0, 'Start')"
                            title="Episode von Anfang abspielen"
                            aria-label="Episode von Anfang abspielen"
                          >
                            ▶︎
                          </button>
                        </td>
                        <td class="px-3 py-2 text-gray-600 text-xs">
                          {{ formatDuration(episodeDetails.get(episodeNum)!.duration) }}
                        </td>
                        <td class="px-3 py-2 text-xs">
                          <template v-for="(speaker, idx) in episodeDetails.get(episodeNum)!.speakers" :key="`${episodeNum}-${idx}`">
                            <span
                              :class="[
                                'inline-block',
                                speaker === selectedSpeakerInfo?.name 
                                  ? 'font-semibold text-green-700 bg-green-100 px-1 rounded' 
                                  : 'text-gray-600'
                              ]"
                            >{{ speaker }}</span><span v-if="(idx as number) < (episodeDetails.get(episodeNum)!.speakers.length - 1)" class="text-gray-600">, </span>
                          </template>
                        </td>
                        <td class="px-3 py-2">
                          <a
                            :href="episodeDetails.get(episodeNum)!.url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-green-600 hover:text-green-800 underline text-xs"
                          >
                            🔗
                          </a>
                        </td>
                      </template>
                      <template v-else-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum) === null">
                        <td colspan="7" class="px-3 py-2 text-gray-400 text-xs">Episode {{ episodeNum }} - Daten nicht verfügbar</td>
                      </template>
                      <template v-else>
                        <td colspan="7" class="px-3 py-2 text-gray-400 text-xs">Episode {{ episodeNum }} - Lädt...</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <button
            @click="selectedSpeaker = null; showEpisodeList = false;"
            class="text-green-600 hover:text-green-800 font-semibold ml-4"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
    
    <div ref="containerRef" class="w-full overflow-x-auto">
      <svg ref="svgRef" class="speaker-river-svg"></svg>
    </div>
    
    <!-- Tooltip -->
    <div
      v-if="tooltipData"
      ref="tooltipRef"
      class="fixed z-50 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none"
      :style="{
        left: `${tooltipData.x + 10}px`,
        top: `${tooltipData.y - 10}px`,
        transform: 'translateY(-100%)'
      }"
    >
      <div class="flex items-center gap-3">
        <img
          v-if="tooltipData.speakerImage"
          :src="tooltipData.speakerImage"
          :alt="tooltipData.speakerName"
          class="w-12 h-12 rounded-full border-2 border-green-500 object-cover"
        />
        <div v-else class="w-12 h-12 rounded-full border-2 border-green-500 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-green-600 dark:text-green-400 font-semibold text-lg">
          {{ tooltipData.speakerName.charAt(0).toUpperCase() }}
        </div>
        <div>
          <div class="font-semibold text-gray-900 dark:text-gray-100">{{ tooltipData.speakerName }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400">Jahr: {{ tooltipData.year }}</div>
        </div>
      </div>
      <div class="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">Klicken zum Filtern</div>
    </div>
    
    <div class="mt-6 text-sm text-gray-600">
      <p>
        <strong>Interaktion:</strong> Bewege die Maus über einen Stream oder die Legende, um den Speaker hervorzuheben. 
        Klicke, um Details anzuzeigen. Klicke auf einen Stream, um Episoden nach Jahr zu filtern.
      </p>
    </div>
  </div>
</template>

<style scoped>
.speaker-river-container {
  padding: 1rem;
}

.speaker-river-svg {
  display: block;
  font-family: system-ui, -apple-system, sans-serif;
}

input[type="range"] {
  accent-color: #10b981;
}
</style>

