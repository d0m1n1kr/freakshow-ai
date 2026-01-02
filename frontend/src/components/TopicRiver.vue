<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import * as d3 from 'd3';
import type { TopicRiverData, ProcessedTopicData } from '../types';
import { useSettingsStore } from '../stores/settings';
import MiniAudioPlayer from './MiniAudioPlayer.vue';
import { getPodcastFileUrl, getEpisodeUrl, getSpeakersBaseUrl } from '@/composables/usePodcast';

const props = defineProps<{
  data: TopicRiverData;
  color?: 'blue' | 'purple';
}>();

const themeColor = props.color || 'blue';

const settingsStore = useSettingsStore();

const svgRef = ref<SVGSVGElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const selectedTopic = ref<string | null>(null);
const hoveredTopic = ref<string | null>(null);
const dimensions = ref({ width: 1200, height: 600 });
const tooltipRef = ref<HTMLDivElement | null>(null);
const selectedYear = ref<number | null>(null);
const hoveredYear = ref<number | null>(null);

// Total count of available topics (before filtering)
const totalTopicsAvailable = computed(() => {
  return Object.keys(props.data.topics).length;
});

// Slider max must be >= min (min is 5)
const topicFilterMax = computed(() => Math.max(5, totalTopicsAvailable.value));

// Default slider value to "max" (but don't override persisted user choice)
watch(topicFilterMax, (max) => {
  if (settingsStore.topicFilter === 15 || settingsStore.topicFilter > max) {
    settingsStore.topicFilter = max;
  }
}, { immediate: true });

// Legend search (desktop)
const legendSearchQuery = ref('');
const filteredLegendTopics = computed(() => {
  const q = legendSearchQuery.value.trim().toLowerCase();
  const items = processedData.value.topics;
  if (!q) return items;
  return items.filter((t) => t.name.toLowerCase().includes(q));
});

// Prozessiere die Daten
const processedData = computed(() => {
  const topics: ProcessedTopicData[] = [];
  const years = props.data.statistics.years;
  
  console.log('Processing data with topicFilter:', settingsStore.topicFilter);
  
  const hasRelevanceData = Object.values(props.data.topics).some(t =>
    Number.isFinite((t as any).totalRelevanceSec) ||
    (Array.isArray((t as any).yearData) && (t as any).yearData.some((yd: any) => Number.isFinite(yd?.totalRelevanceSec)))
  );

  const computeTopicTotalRelevanceSec = (topic: any): number => {
    if (Number.isFinite(topic?.totalRelevanceSec)) return topic.totalRelevanceSec;
    if (!Array.isArray(topic?.yearData)) return 0;
    return topic.yearData.reduce((sum: number, yd: any) => sum + (Number.isFinite(yd?.totalRelevanceSec) ? yd.totalRelevanceSec : 0), 0);
  };

  // Erstelle ein Array aller Topics mit ihrer Episode-Anzahl / Relevanz (Sekunden)
  const allTopics = Object.values(props.data.topics).map(topic => ({
    id: topic.id,
    name: topic.name,
    episodeCount: topic.totalEpisodes,
    relevanceSec: computeTopicTotalRelevanceSec(topic as any),
    data: topic
  }));
  
  // Sortiere nach Relevanz (oder Episode-Anzahl als Fallback) und nimm die Top-N
  const topTopics = allTopics
    .sort((a, b) => {
      const av = hasRelevanceData ? a.relevanceSec : a.episodeCount;
      const bv = hasRelevanceData ? b.relevanceSec : b.episodeCount;
      return bv - av;
    })
    .slice(0, settingsStore.topicFilter);
  
  console.log('Top topics count:', topTopics.length);
  
  // Erweiterte Farbpalette für mehr Topics
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
  
  const colors = generateColors(topTopics.length);
  
  topTopics.forEach((topicMeta, index) => {
    const topic = topicMeta.data;
    if (!topic) return;
    
    const yearValues = new Map<number, number>();
    
    // Initialisiere alle Jahre mit 0
    years.forEach(year => yearValues.set(year, 0));
    
    // Setze die tatsächlichen Werte (Relevanz in Sekunden; Fallback: Anzahl Episoden)
    topic.yearData.forEach(yd => {
      const v = hasRelevanceData
        ? (Number.isFinite((yd as any)?.totalRelevanceSec) ? (yd as any).totalRelevanceSec : 0)
        : yd.count;
      yearValues.set(yd.year, v);
    });
    
    topics.push({
      id: topic.id,
      name: topic.name,
      yearValues,
      totalDuration: hasRelevanceData ? computeTopicTotalRelevanceSec(topic as any) : topic.totalEpisodes,
      color: colors[index] || '#888'
    });
  });
  
  return { topics, years };
});

const formatTimespanSec = (sec: unknown) => {
  const s0 = Number.isFinite(sec as number) ? Math.max(0, Math.round(sec as number)) : 0;
  const days = Math.floor(s0 / 86400);
  const hours = Math.floor((s0 % 86400) / 3600);
  const minutes = Math.floor((s0 % 3600) / 60);
  const seconds = s0 % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

let pulsingTopicKey: string | null = null;
const stopPulse = () => {
  pulsingTopicKey = null;
  if (!svgRef.value) return;
  // Stop any in-flight pulse transitions and remove the pulse stroke.
  d3.select(svgRef.value)
    .selectAll<SVGPathElement, any>('.stream')
    .interrupt()
    .attr('stroke', 'none');
};

const pulseOnce = (key: string) => {
  if (!svgRef.value) return;
  if (pulsingTopicKey !== key) return;
  if (hoveredTopic.value !== key) return;

  const stroke = settingsStore.isDarkMode ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.45)';
  const sel = d3
    .select(svgRef.value)
    .selectAll<SVGPathElement, any>('.stream')
    .filter((d: any) => d?.key === key);

  // Continuous pulse (loop) while legend hover stays active.
  sel.interrupt();
  sel.attr('stroke', stroke)
    .attr('stroke-linejoin', 'round')
    .attr('stroke-linecap', 'round')
    .attr('stroke-width', 0)
    .attr('stroke-opacity', 0)
    .transition()
    .duration(650)
    .ease(d3.easeSinInOut)
    .attr('stroke-width', 2.5)
    .attr('stroke-opacity', 0.9)
    .transition()
    .delay(120)
    .duration(850)
    .ease(d3.easeSinInOut)
    .attr('stroke-width', 0)
    .attr('stroke-opacity', 0)
    .on('end', () => {
      if (pulsingTopicKey === key && hoveredTopic.value === key) pulseOnce(key);
      else {
        // Ensure cleanup if hover ended mid-loop.
        d3.select(svgRef.value as any).selectAll('.stream').attr('stroke', 'none');
      }
    });
};

const startPulse = (key: string) => {
  pulsingTopicKey = key;
  pulseOnce(key);
};

// Erstelle das Stream Graph (Topic River)
const drawRiver = () => {
  if (!svgRef.value || !containerRef.value) return;
  
  const container = containerRef.value;
  const width = container.clientWidth;
  const height = dimensions.value.height;
  dimensions.value.width = width;
  
  // Responsive margins (reduced right margin since legend is now separate)
  const isMobile = width < 640;
  const isTablet = width >= 640 && width < 1024;
  
  const margin = isMobile
    ? { top: 20, right: 10, bottom: 60, left: 40 }
    : isTablet
    ? { top: 20, right: 20, bottom: 60, left: 50 }
    : { top: 20, right: 20, bottom: 60, left: 60 };
  
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  
  // Lösche vorherigen Inhalt
  stopPulse();
  d3.select(svgRef.value).selectAll('*').remove();
  
  // No need to extend SVG width for legend anymore
  const svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  const { topics, years } = processedData.value;
  
  console.log('Drawing river with', topics.length, 'topics');
  
  // Erstelle Stack-Daten
  const stackData: any[] = years.map(year => {
    const obj: any = { year };
    topics.forEach(topic => {
      obj[topic.id] = topic.yearValues.get(year) || 0;
    });
    return obj;
  });
  
  const keys = topics.map(t => t.id);
  const stack = d3.stack()
    .keys(keys)
    // In normierter Ansicht: stackOffsetExpand sorgt für gleich hohe Jahre (0-1)
    // In normaler Ansicht: stackOffsetWiggle für schöne Stream-Optik
    .offset(settingsStore.normalizedView ? d3.stackOffsetExpand : d3.stackOffsetWiggle)
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
    // Important: curveBasis is an approximating spline and can visually distort values at exact years.
    // Use an interpolating curve so the thickness at each year matches the underlying data much better.
    .curve(d3.curveCatmullRom.alpha(0.5));

  // Hover highlight band for the nearest year (behind the streams)
  const year0 = Number.isFinite(years?.[0] as number) ? (years[0] as number) : 0;
  const year1 =
    years.length >= 2 && Number.isFinite(years?.[1] as number) ? (years[1] as number) : year0 + 1;
  const yearStep = Math.max(1, xScale(year1) - xScale(year0));
  const isDark = settingsStore.isDarkMode;
  const borderColor =
    themeColor === 'purple'
      ? (isDark ? '#c4b5fd' : '#6d28d9') // violet-300 / violet-700
      : (isDark ? '#93c5fd' : '#1d4ed8'); // blue-300 / blue-700
  const yearHighlight = g.append('rect')
    .attr('class', 'year-highlight')
    .attr('y', 0)
    .attr('height', innerHeight)
    .attr('fill', themeColor === 'purple' ? '#7c3aed' : '#2563eb')
    .attr('opacity', 0.08)
    .style('pointer-events', 'none')
    .style('display', 'none');
  const yearHighlightLeft = g.append('rect')
    .attr('class', 'year-highlight-border-left')
    .attr('y', 0)
    .attr('height', innerHeight)
    .attr('width', 1)
    .attr('fill', borderColor)
    .attr('opacity', isDark ? 0.35 : 0.45)
    .style('pointer-events', 'none')
    .style('display', 'none');
  const yearHighlightRight = g.append('rect')
    .attr('class', 'year-highlight-border-right')
    .attr('y', 0)
    .attr('height', innerHeight)
    .attr('width', 1)
    .attr('fill', borderColor)
    .attr('opacity', isDark ? 0.35 : 0.45)
    .style('pointer-events', 'none')
    .style('display', 'none');

  const nearestYear = (targetYear: number): number => {
    if (!Array.isArray(years) || years.length === 0) return targetYear;
    let best: number = Number.isFinite(years?.[0] as number) ? (years[0] as number) : targetYear;
    let bestDist = Math.abs(best - targetYear);
    for (const yy of years as Array<number | undefined>) {
      if (!Number.isFinite(yy as number)) continue;
      const y = yy as number;
      const d = Math.abs(y - targetYear);
      if (d < bestDist) {
        best = y;
        bestDist = d;
      }
    }
    return best;
  };
  
  // Zeichne die Streams
  const streams = g.selectAll('.stream')
    .data(series)
    .join('path')
    .attr('class', 'stream')
    .attr('d', area)
    .attr('fill', (d: any) => {
      const topic = topics.find(t => t.id === d.key);
      return topic?.color || '#ccc';
    })
    .attr('opacity', (d: any) => {
      if (!hoveredTopic.value && !selectedTopic.value) return 0.8;
      if (hoveredTopic.value && d.key === hoveredTopic.value) return 1;
      if (selectedTopic.value && d.key === selectedTopic.value) return 1;
      return 0.2;
    })
    .style('cursor', 'pointer')
    .on('mouseover', function(_event: any, d: any) {
      hoveredTopic.value = d.key;
    })
    .on('mousemove', function(event: any, d: any) {
      if (!tooltipRef.value) return;
      
      // Finde das nächste Jahr zum Mauszeiger
      const [mx] = d3.pointer(event);
      const yearRaw = Math.round(xScale.invert(mx));
      const year = nearestYear(yearRaw);
      hoveredYear.value = year;

      // Show year band highlight (even if there's no data for this topic/year)
      const x0 = Math.max(0, Math.min(innerWidth - yearStep, xScale(year) - yearStep / 2));
      yearHighlight
        .attr('x', x0)
        .attr('width', yearStep)
        .style('display', null);
      yearHighlightLeft
        .attr('x', x0)
        .style('display', null);
      yearHighlightRight
        .attr('x', x0 + Math.max(0, yearStep - 1))
        .style('display', null);
      const topic = topics.find(t => t.id === d.key);
      
      if (topic) {
        const topicData = props.data.topics[topic.id];
        const yearData = topicData?.yearData.find(yd => yd.year === year);
        
        const relevanceSec = topic.yearValues.get(year) || 0;
        const episodeCount = yearData?.count ?? 0;
        const hasYearData = (episodeCount > 0) || (relevanceSec > 0);

        if (hasYearData && yearData) {
          tooltipRef.value.style.display = 'block';
          tooltipRef.value.style.left = `${event.pageX + 15}px`;
          tooltipRef.value.style.top = `${event.pageY - 10}px`;
          
          tooltipRef.value.innerHTML = `
            <div class="font-semibold text-sm mb-1">${topic.name}</div>
            <div class="text-xs"><strong>Jahr:</strong> ${year}</div>
            <div class="text-xs"><strong>Episoden:</strong> ${episodeCount}</div>
            <div class="text-xs"><strong>Dauer:</strong> ${formatTimespanSec(relevanceSec)}</div>
          `;
          
          // Highlight the year on X-axis
          if (svgRef.value) {
            d3.select(svgRef.value)
              .selectAll('.x-axis text')
              .attr('fill', (tickYear: any) => tickYear === year ? '#2563eb' : '#666')
              .attr('font-weight', (tickYear: any) => tickYear === year ? '700' : '400')
              .style('font-size', (tickYear: any) => tickYear === year ? '14px' : '12px');
          }
        } else {
          tooltipRef.value.style.display = 'none';
          // Reset X-axis highlighting
          if (svgRef.value) {
            d3.select(svgRef.value)
              .selectAll('.x-axis text')
              .attr('fill', '#666')
              .attr('font-weight', '400')
              .style('font-size', '12px');
          }
        }
      }
    })
    .on('mouseout', function(_event: any, d: any) {
      // Only clear if we're leaving the current hovered item
      if (hoveredTopic.value === d.key) {
        hoveredTopic.value = null;
      }
      hoveredYear.value = null;
      yearHighlight.style('display', 'none');
      yearHighlightLeft.style('display', 'none');
      yearHighlightRight.style('display', 'none');
      if (tooltipRef.value) {
        tooltipRef.value.style.display = 'none';
      }
      // Reset X-axis highlighting (unless a year is selected)
      if (svgRef.value && !selectedYear.value) {
        d3.select(svgRef.value)
          .selectAll('.x-axis text')
          .attr('fill', '#666')
          .attr('font-weight', '400')
          .style('font-size', '12px');
      }
    })
    .on('click', function(_event: any, d: any) {
      const wasSelected = selectedTopic.value === d.key;
      selectedTopic.value = wasSelected ? null : d.key;
      // Speichere das aktuell gehoverte Jahr beim Klicken
      if (!wasSelected && hoveredYear.value) {
        selectedYear.value = hoveredYear.value;
      } else if (wasSelected) {
        selectedYear.value = null;
      }
    });
  
  // X-Achse
  const xAxis = d3.axisBottom(xScale)
    .tickFormat(d3.format('d'))
    .ticks(years.length);
  
  const xAxisGroup = g.append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis);
  
  xAxisGroup.selectAll('text')
    .attr('fill', '#666')
    .style('font-size', '12px')
    .attr('data-year', (d: any) => d)
    .style('transition', 'all 0.2s ease');
  
  g.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 45)
    .attr('fill', '#333')
    .attr('text-anchor', 'middle')
    .style('font-size', isMobile ? '12px' : '14px')
    .style('font-weight', '600')
    .text('Jahr');
  
  // D3 Legend removed - now using HTML legend
  
  return streams; // Return streams for updating
};

// Function to update opacity without full redraw
const updateOpacity = () => {
  if (!svgRef.value) return;
  
  const svg = d3.select(svgRef.value);
  
  // Update stream opacity
  svg.selectAll('.stream')
    .attr('opacity', function(d: any) {
      if (!hoveredTopic.value && !selectedTopic.value) return 0.8;
      if (hoveredTopic.value && d.key === hoveredTopic.value) return 1;
      if (selectedTopic.value && d.key === selectedTopic.value) return 1;
      return 0.2;
    });
};

// Watch für Änderungen
watch(() => settingsStore.topicFilter, () => {
  console.log('topicFilter changed to:', settingsStore.topicFilter);
  hoveredTopic.value = null; // Clear hover on filter change
  drawRiver();
});

watch(() => settingsStore.normalizedView, () => {
  console.log('normalizedView changed to:', settingsStore.normalizedView);
  hoveredTopic.value = null; // Clear hover on view change
  drawRiver();
});

// For hover/selection, just update opacity without redrawing
watch([hoveredTopic, selectedTopic], () => {
  updateOpacity();
});

// Initial draw und resize listener
onMounted(() => {
  drawRiver();
  
  const resizeObserver = new ResizeObserver(() => {
    drawRiver();
  });
  
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value);
  }
});

// Berechnete Infos für ausgewähltes Topic
const selectedTopicInfo = computed(() => {
  if (!selectedTopic.value) return null;
  const topic = processedData.value.topics.find(t => t.id === selectedTopic.value);
  if (!topic) return null;
  
  const fullTopic = props.data.topics[topic.id];
  if (!fullTopic) return null;
  
  // Sammle alle Episoden aus allen Jahren
  const allEpisodes: Array<{
    number: number;
    date: string;
    title: string;
    year: number;
  }> = [];
  
  fullTopic.yearData.forEach(yd => {
    yd.episodes.forEach(ep => {
      allEpisodes.push({
        ...ep,
        year: yd.year
      });
    });
  });
  
  // Sortiere nach Episode-Nummer (neueste zuerst)
  allEpisodes.sort((a, b) => b.number - a.number);
  
  // Filtere nach ausgewähltem Jahr, falls vorhanden
  const filteredEpisodes = selectedYear.value 
    ? allEpisodes.filter(ep => ep.year === selectedYear.value)
    : allEpisodes;
  
  return {
    ...topic,
    description: fullTopic.description,
    episodes: filteredEpisodes,
    totalEpisodes: allEpisodes.length,
    filteredCount: filteredEpisodes.length
  };
});

const showEpisodeList = ref(false);
const showTopicList = ref(false);
const episodeDetails = ref<Map<number, any>>(new Map());
const episodeTopics = ref<Map<number, any>>(new Map());
const taxonomyData = ref<any>(null);
const loadingEpisodes = ref(false);
const loadingTopics = ref(false);

// MP3 playback (uses /episodes.json generated from MP3 RSS feed)
const mp3IndexLoaded = ref(false);
const mp3IndexError = ref<string | null>(null);
const mp3UrlByEpisode = ref<Map<number, string>>(new Map());
const currentMp3Url = ref<string | null>(null);
const playerInfo = ref<{ episodeNumber: number; positionSec: number; label: string } | null>(null);
const playerError = ref<string | null>(null);
const playerToken = ref(0);
const currentTranscriptUrl = ref<string | null>(null);

// When switching podcasts, clear the cached MP3 index so we don't reuse URLs
// from a previously selected podcast (e.g. LNP playing Freakshow).
watch(
  () => settingsStore.selectedPodcast,
  () => {
    mp3IndexLoaded.value = false;
    mp3IndexError.value = null;
    mp3UrlByEpisode.value = new Map();
    // stop any currently playing audio tied to the previous podcast
    currentMp3Url.value = null;
    playerInfo.value = null;
    playerError.value = null;
    currentTranscriptUrl.value = null;
    playerToken.value++;
  }
);

const withBase = (p: string) => {
  // Ensure static assets work when deployed under a sub-path (Vite base).
  // Example: BASE_URL = "/freakshow/" -> "/freakshow/episodes/285-ts-live.json"
  const base = (import.meta as any)?.env?.BASE_URL || '/';
  const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
  const rel = String(p).replace(/^\/+/, '');
  return `${b}${rel}`;
};

// Lade Episode-Details für Topics (für Speaker-Informationen)
const loadEpisodeDetails = async () => {
  if (!selectedTopicInfo.value || loadingEpisodes.value) return;
  
  loadingEpisodes.value = true;
  const newDetails = new Map<number, any>();
  
  // Lade nur Episoden, die noch nicht geladen sind
  const toLoad = selectedTopicInfo.value.episodes
    .map(ep => ep.number)
    .filter(num => !episodeDetails.value.has(num));
  
  for (const episodeNum of toLoad) {
    try {
      const response = await fetch(getEpisodeUrl(episodeNum));
      if (response.ok) {
        const data = await response.json();
        newDetails.set(episodeNum, data);
      } else {
        console.warn(`Episode ${episodeNum} not found (HTTP ${response.status})`);
        // Mark as attempted but failed, so we don't try again
        newDetails.set(episodeNum, null);
      }
    } catch (e) {
      console.error(`Failed to load episode ${episodeNum}:`, e);
      // Mark as attempted but failed
      newDetails.set(episodeNum, null);
    }
  }
  
  // Merge mit existierenden Details
  episodeDetails.value = new Map([...episodeDetails.value, ...newDetails]);
  loadingEpisodes.value = false;
};

// Lade alle einzelnen Topics aus den Episode-Topics
const loadAllTopics = async () => {
  if (!selectedTopicInfo.value || loadingTopics.value) return;
  
  loadingTopics.value = true;
  
  // Versuche zuerst die detailed mapping zu laden
  if (!taxonomyData.value) {
    try {
      const response = await fetch(getPodcastFileUrl('topic-taxonomy-detailed.json'));
      if (response.ok) {
        taxonomyData.value = await response.json();
        loadingTopics.value = false;
        return; // Wir haben die Daten, kein Laden von Episode-Topics nötig
      }
    } catch (e) {
      console.log('Detailed taxonomy not found, falling back to episode topics');
    }
  }
  
  // Fallback: Lade Episode-Topics wie bisher
  const newTopics = new Map<number, any>();
  const toLoad = selectedTopicInfo.value.episodes
    .map(ep => ep.number)
    .filter(num => !episodeTopics.value.has(num));
  
  for (const episodeNum of toLoad) {
    try {
      const response = await fetch(getPodcastFileUrl(`episodes/${episodeNum}-topics.json`));
      if (response.ok) {
        const data = await response.json();
        newTopics.set(episodeNum, data);
      }
    } catch (e) {
      console.error(`Failed to load topics for episode ${episodeNum}:`, e);
    }
  }
  
  episodeTopics.value = new Map([...episodeTopics.value, ...newTopics]);
  loadingTopics.value = false;
};

// Sammle alle individuellen Topics für das ausgewählte Cluster
const allIndividualTopics = computed(() => {
  if (!selectedTopicInfo.value) return [];
  
  // Wenn wir detailed taxonomy haben, verwende diese
  if (taxonomyData.value && taxonomyData.value.clusters) {
    const cluster = taxonomyData.value.clusters.find((c: any) => c.id === selectedTopicInfo.value?.id);
    if (cluster && cluster.topics) {
      return cluster.topics.map((t: any) => ({
        topic: t.topic,
        keywords: t.keywords || [],
        episodeNumber: 0, // Not episode-specific in detailed view
        episodeTitle: '',
        clusterName: cluster.name,
        clusterId: cluster.id
      }));
    }
  }
  
  // Fallback: Zeige alle Topics aus den Episoden (alte Methode)
  const topics: Array<{
    topic: string;
    keywords: string[];
    episodeNumber: number;
    episodeTitle: string;
    clusterName?: string;
    clusterId?: string;
  }> = [];
  
  const currentCluster = props.data.topics[selectedTopicInfo.value.id];
  if (!currentCluster) return [];
  
  selectedTopicInfo.value.episodes.forEach(episode => {
    const episodeTopicData = episodeTopics.value.get(episode.number);
    if (episodeTopicData && episodeTopicData.topics) {
      episodeTopicData.topics.forEach((t: any) => {
        topics.push({
          topic: t.topic,
          keywords: t.keywords || [],
          episodeNumber: episode.number,
          episodeTitle: episode.title,
          clusterName: currentCluster.name,
          clusterId: currentCluster.id
        });
      });
    }
  });
  
  return topics;
});

// Watch für showEpisodeList
watch(showEpisodeList, (newValue) => {
  if (newValue && selectedTopicInfo.value) {
    loadEpisodeDetails();
  }
});

// Watch für selectedYear - lade zusätzliche Episoden wenn Filter entfernt wird
watch(selectedYear, () => {
  if (showEpisodeList.value && selectedTopicInfo.value) {
    loadEpisodeDetails();
  }
});

// Watch für showTopicList
watch(showTopicList, (newValue) => {
  if (newValue && selectedTopicInfo.value) {
    loadAllTopics();
  }
});

// Helper function to format duration
const formatDuration = (duration: [number, number, number]) => {
  const [hours, minutes, seconds] = duration;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const fullTopicById = (id: string) => {
  return props.data.topics[id];
};

const formatHmsFromSeconds = (sec: unknown) => {
  const s0 = Number.isFinite(sec as number) ? Math.max(0, Math.floor(sec as number)) : null;
  if (s0 === null) return '—';
  const hours = Math.floor(s0 / 3600);
  const minutes = Math.floor((s0 % 3600) / 60);
  const seconds = s0 % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const getTopicOccurrences = (episode: any): Array<{ positionSec: number; durationSec: number | null }> => {
  const occ = Array.isArray(episode?.occurrences) ? episode.occurrences : [];
  const items: Array<{ positionSec: number; durationSec: number | null }> = occ
    .map((o: any) => ({
      positionSec: Number.isFinite(o?.positionSec) ? o.positionSec : null,
      durationSec: Number.isFinite(o?.durationSec) ? o.durationSec : null,
    }))
    .filter((x: any): x is { positionSec: number; durationSec: number | null } => Number.isFinite(x?.positionSec));

  if (items.length === 0) return [];

  // sort + de-dupe
  items.sort((a, b) => a.positionSec - b.positionSec);
  const unique: Array<{ positionSec: number; durationSec: number | null }> = [];
  for (const it of items) {
    const last = unique[unique.length - 1];
    if (!last || last.positionSec !== it.positionSec || last.durationSec !== it.durationSec) unique.push(it);
  }
  return unique;
};

const formatOccurrenceLabel = (occ: { positionSec: number; durationSec: number | null }) => {
  const formatMinutes = (sec: number | null) => {
    if (!Number.isFinite(sec as number) || (sec as number) <= 0) return null;
    const m = Math.max(1, Math.round((sec as number) / 60));
    return `${m}m`;
  };
  const m = formatMinutes(occ.durationSec);
  return m ? `${formatHmsFromSeconds(occ.positionSec)} (${m})` : formatHmsFromSeconds(occ.positionSec);
};

const buildEpisodeDeepLink = (episodeUrl: string, seconds: number) => {
  try {
    const u = new URL(episodeUrl);
    // best-effort: some players support `?t=SECONDS` or `#t=SECONDS`; autoplay can be blocked by browser policies.
    u.searchParams.set('t', String(Math.max(0, Math.floor(seconds))));
    u.searchParams.set('autoplay', '1');
    u.hash = `t=${Math.max(0, Math.floor(seconds))}`;
    return u.toString();
  } catch {
    return episodeUrl;
  }
};

const openEpisodeAt = (episodeNumber: number, seconds: number) => {
  const details = episodeDetails.value.get(episodeNumber);
  const url = typeof details?.url === 'string' ? details.url : null;
  if (!url) return;
  const link = buildEpisodeDeepLink(url, seconds);
  window.open(link, '_blank', 'noopener,noreferrer');
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

const playEpisodeAt = async (episodeNumber: number, seconds: number, label: string) => {
  playerError.value = null;
  await ensureMp3Index();

  const mp3 = mp3UrlByEpisode.value.get(episodeNumber) || null;
  if (!mp3) {
    playerError.value = mp3IndexError.value
      ? `MP3 Index nicht verfügbar (${mp3IndexError.value})`
      : 'Keine MP3-URL für diese Episode gefunden (episodes.json)';
    // Fallback: open episode page (if we have it)
    openEpisodeAt(episodeNumber, seconds);
    return;
  }

  currentMp3Url.value = mp3;
  playerInfo.value = { episodeNumber, positionSec: Math.max(0, Math.floor(seconds)), label };
  // Live transcript data (generated via `yarn ts-live`)
  currentTranscriptUrl.value = withBase(getPodcastFileUrl(`episodes/${episodeNumber}-ts-live.json`));
  playerToken.value++;
};

const closePlayer = () => {
  currentMp3Url.value = null;
  playerInfo.value = null;
  playerError.value = null;
  currentTranscriptUrl.value = null;
};
</script>

<template>
  <div class="topic-river-container">
    <!-- Tooltip -->
    <div 
      ref="tooltipRef" 
      class="tooltip"
      style="display: none; position: absolute; background: rgba(0, 0, 0, 0.9); color: white; padding: 8px 12px; border-radius: 6px; pointer-events: none; z-index: 1000; font-size: 13px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"
    ></div>
    
    <div class="controls mb-4 sm:mb-6">
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
        <label class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex flex-col sm:flex-row sm:items-center gap-2">
          <span class="whitespace-nowrap">Anzahl Themen:</span>
          <div class="flex items-center gap-2">
            <input
              v-model.number="settingsStore.topicFilter"
              type="range"
              min="5"
              :max="topicFilterMax"
              step="1"
              :class="['flex-1 sm:w-32 md:w-48', themeColor === 'blue' ? 'slider-blue' : 'slider-purple']"
            />
            <span :class="['font-semibold min-w-[2rem] text-right', themeColor === 'blue' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400']">{{ settingsStore.topicFilter }}</span>
          </div>
        </label>
        
        <label class="flex items-center gap-2 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            v-model="settingsStore.normalizedView"
            type="checkbox"
            :class="['w-4 h-4 rounded', themeColor === 'blue' ? 'checkbox-blue' : 'checkbox-purple']"
          />
          <span>Normierte Ansicht (100%/Jahr)</span>
        </label>
      </div>
      
      <!-- Inline MP3 player (appears after clicking a position) -->
      <div v-if="currentMp3Url" class="mt-4 sm:mt-6">
        <MiniAudioPlayer
          :src="currentMp3Url"
          :title="`Episode ${playerInfo?.episodeNumber ?? ''}`"
          :subtitle="playerInfo?.label || ''"
          :seek-to-sec="playerInfo?.positionSec ?? 0"
          :autoplay="true"
          :play-token="playerToken"
          :transcript-src="currentTranscriptUrl || undefined"
          :speakers-meta-url="getSpeakersBaseUrl()"
          @close="closePlayer"
          @error="(msg) => { playerError = msg }"
        />
        <div v-if="playerError" class="mt-2 text-xs text-red-700 dark:text-red-300">
          {{ playerError }}
        </div>
      </div>
      
      <div v-if="selectedTopicInfo" :class="['mt-4 p-4 border rounded-lg', themeColor === 'blue' ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700' : 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700']">
        <div class="relative">
          <div class="min-w-0">
            <div class="pr-10">
            <h3 :class="['font-semibold text-lg', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">{{ selectedTopicInfo.name }}</h3>
            <p :class="['text-sm mt-1', themeColor === 'blue' ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300']">{{ selectedTopicInfo.description }}</p>
            
            <!-- Year Filter Badge -->
            <div v-if="selectedYear" class="mt-2 inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
              <span>📅 Jahr: {{ selectedYear }}</span>
              <button 
                @click="selectedYear = null"
                class="hover:bg-blue-700 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                title="Jahr-Filter entfernen"
              >
                ✕
              </button>
            </div>
            
            <div class="mt-2 flex gap-4">
              <button
                @click="showEpisodeList = !showEpisodeList; if (showEpisodeList) showTopicList = false;"
                :class="['text-sm font-semibold underline', themeColor === 'blue' ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300' : 'text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300']"
              >
                {{ showEpisodeList ? 'Episoden ausblenden' : (selectedYear ? `${selectedTopicInfo.filteredCount} von ${selectedTopicInfo.totalEpisodes} Episoden anzeigen` : `${selectedTopicInfo.episodes.length} Episoden anzeigen`) }}
              </button>
              <button
                @click="showTopicList = !showTopicList; if (showTopicList) showEpisodeList = false;"
                :class="['text-sm font-semibold underline', themeColor === 'blue' ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300' : 'text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300']"
              >
                {{ showTopicList ? 'Einzelne Themen ausblenden' : 'Alle einzelnen Themen anzeigen' }}
              </button>
            </div>
            </div>
            
            <!-- Episode List -->
            <div v-if="showEpisodeList" :class="['mt-4 rounded-lg border', themeColor === 'blue' ? 'bg-white dark:bg-gray-900 border-blue-300 dark:border-blue-700' : 'bg-white dark:bg-gray-900 border-purple-300 dark:border-purple-700']">
              <div v-if="loadingEpisodes" class="p-4 text-center text-gray-600 dark:text-gray-400">
                Lade Episoden-Details...
              </div>
              <div v-else class="max-h-96 overflow-auto">
                <table class="min-w-full w-max text-sm table-auto">
                  <thead :class="['sticky top-0', themeColor === 'blue' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-purple-100 dark:bg-purple-900']">
                    <tr>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">#</th>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">Datum</th>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">Titel</th>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">Position(en)</th>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">Dauer</th>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">Sprecher</th>
                      <th :class="['px-3 py-2 text-left text-xs font-semibold whitespace-nowrap', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr 
                      v-for="episode in selectedTopicInfo.episodes" 
                      :key="episode.number"
                      :class="['border-t', themeColor === 'blue' ? 'border-blue-100 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'border-purple-100 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20']"
                    >
                      <template v-if="episodeDetails.has(episode.number) && episodeDetails.get(episode.number)">
                        <td :class="['px-3 py-2 font-mono text-xs whitespace-nowrap', themeColor === 'blue' ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300']">{{ episode.number }}</td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                          {{ new Date(episode.date).toLocaleDateString('de-DE') }}
                        </td>
                        <td class="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs">{{ episode.title }}</td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap font-mono">
                          <template v-if="getTopicOccurrences(episode).length > 0">
                            <template v-for="(occ, idx) in getTopicOccurrences(episode)" :key="`${episode.number}-${occ.positionSec}-${idx}`">
                              <button
                                type="button"
                                :class="[
                                  'underline hover:no-underline cursor-pointer',
                                  themeColor === 'blue'
                                    ? 'text-blue-700 dark:text-blue-300'
                                    : 'text-purple-700 dark:text-purple-300'
                                ]"
                                @click="playEpisodeAt(episode.number, occ.positionSec, formatOccurrenceLabel(occ))"
                                :title="`Episode öffnen bei ${formatHmsFromSeconds(occ.positionSec)}`"
                              >
                                {{ formatOccurrenceLabel(occ) }}
                              </button><span v-if="idx < getTopicOccurrences(episode).length - 1">, </span>
                            </template>
                          </template>
                          <span v-else>—</span>
                        </td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                          {{ formatDuration(episodeDetails.get(episode.number).duration) }}
                        </td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                          {{ episodeDetails.get(episode.number).speakers.join(', ') }}
                        </td>
                        <td class="px-3 py-2">
                          <a 
                            :href="episodeDetails.get(episode.number).url"
                            target="_blank"
                            rel="noopener noreferrer"
                            :class="['underline text-xs', themeColor === 'blue' ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300' : 'text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300']"
                          >
                            🔗
                          </a>
                        </td>
                      </template>
                      <template v-else-if="episodeDetails.has(episode.number) && episodeDetails.get(episode.number) === null">
                        <td :class="['px-3 py-2 font-mono text-xs whitespace-nowrap', themeColor === 'blue' ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300']">{{ episode.number }}</td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                          {{ new Date(episode.date).toLocaleDateString('de-DE') }}
                        </td>
                        <td class="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs">{{ episode.title }}</td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap font-mono">
                          <template v-if="getTopicOccurrences(episode).length > 0">
                            {{ getTopicOccurrences(episode).map(formatOccurrenceLabel).join(', ') }}
                          </template>
                          <span v-else>—</span>
                        </td>
                        <td colspan="3" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">Details nicht verfügbar (Datei fehlt)</td>
                      </template>
                      <template v-else>
                        <td :class="['px-3 py-2 font-mono text-xs whitespace-nowrap', themeColor === 'blue' ? 'text-blue-700 dark:text-blue-300' : 'text-purple-700 dark:text-purple-300']">{{ episode.number }}</td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                          {{ new Date(episode.date).toLocaleDateString('de-DE') }}
                        </td>
                        <td class="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs">{{ episode.title }}</td>
                        <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap font-mono">
                          <template v-if="getTopicOccurrences(episode).length > 0">
                            {{ getTopicOccurrences(episode).map(formatOccurrenceLabel).join(', ') }}
                          </template>
                          <span v-else>—</span>
                        </td>
                        <td colspan="3" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">Lädt...</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Individual Topics List -->
            <div v-if="showTopicList" :class="['mt-4 rounded-lg border overflow-hidden', themeColor === 'blue' ? 'bg-white dark:bg-gray-900 border-blue-300 dark:border-blue-700' : 'bg-white dark:bg-gray-900 border-purple-300 dark:border-purple-700']">
              <div v-if="loadingTopics" class="p-4 text-center text-gray-600 dark:text-gray-400">
                Lade alle Themen...
              </div>
              <div v-else class="max-h-96 overflow-y-auto">
                <div :class="['p-3 sticky top-0', themeColor === 'blue' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-purple-100 dark:bg-purple-900']">
                  <p :class="['text-sm font-semibold', themeColor === 'blue' ? 'text-blue-900 dark:text-blue-100' : 'text-purple-900 dark:text-purple-100']">
                    {{ allIndividualTopics.length }} einzelne Themen gefunden
                  </p>
                </div>
                <div :class="[themeColor === 'blue' ? 'divide-y divide-blue-100 dark:divide-blue-800' : 'divide-y divide-purple-100 dark:divide-purple-800']">
                  <div 
                    v-for="(topicItem, index) in allIndividualTopics" 
                    :key="`${topicItem.episodeNumber}-${index}`"
                    :class="['p-3', themeColor === 'blue' ? 'hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'hover:bg-purple-50 dark:hover:bg-purple-900/20']"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ topicItem.topic }}</p>
                        <div class="mt-1 flex flex-wrap gap-1 items-center">
                          <span 
                            v-if="topicItem.clusterName"
                            class="inline-block px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-medium"
                          >
                            📁 {{ topicItem.clusterName }}
                          </span>
                          <span 
                            v-for="keyword in topicItem.keywords" 
                            :key="keyword"
                            :class="['inline-block px-2 py-0.5 text-xs rounded', themeColor === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300']"
                          >
                            {{ keyword }}
                          </span>
                        </div>
                      </div>
                      <div class="text-right whitespace-nowrap">
                        <a 
                          :href="episodeDetails.get(topicItem.episodeNumber)?.url || `https://freakshow.fm/${topicItem.episodeTitle.toLowerCase().split(' ')[0]}`"
                          target="_blank"
                          rel="noopener noreferrer"
                          :class="['text-xs', themeColor === 'blue' ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300' : 'text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300']"
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
          <button
            @click="selectedTopic = null; selectedYear = null; showEpisodeList = false; showTopicList = false;"
            :class="['absolute top-2 right-2 font-semibold p-1', themeColor === 'blue' ? 'text-blue-600 hover:text-blue-800' : 'text-purple-600 hover:text-purple-800']"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
    
    <div class="flex flex-col lg:flex-row gap-4">
      <!-- River Chart -->
      <div ref="containerRef" class="flex-1 w-full overflow-x-auto -mx-2 sm:mx-0">
        <svg ref="svgRef" class="topic-river-svg"></svg>
      </div>
      
      <!-- HTML Legend (Desktop only) -->
      <div class="hidden lg:block w-64 flex-shrink-0">
        <div class="sticky top-4 max-h-[600px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <h3 class="text-sm font-semibold mb-3 text-gray-900 dark:text-white">Themen</h3>
          <input
            v-model="legendSearchQuery"
            type="text"
            placeholder="Suche…"
            class="w-full mb-3 px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
          />
          <div class="space-y-2">
            <div 
              v-for="topic in filteredLegendTopics" 
              :key="topic.id"
              @mouseenter="hoveredTopic = topic.id; startPulse(topic.id)"
              @mouseleave="hoveredTopic = null; stopPulse()"
              @click="selectedTopic = selectedTopic === topic.id ? null : topic.id"
              class="flex items-start gap-2 p-2 rounded cursor-pointer transition-all hover:bg-gray-50 dark:hover:bg-gray-700"
              :class="{
                'bg-gray-100 dark:bg-gray-700': hoveredTopic === topic.id || selectedTopic === topic.id,
                'opacity-40': (hoveredTopic || selectedTopic) && hoveredTopic !== topic.id && selectedTopic !== topic.id
              }"
            >
              <div 
                class="w-4 h-4 rounded flex-shrink-0 mt-0.5" 
                :style="{ backgroundColor: topic.color }"
              ></div>
              <div class="flex-1 min-w-0">
                <div 
                  class="text-xs leading-tight text-gray-900 dark:text-white"
                  :class="{
                    'font-semibold': hoveredTopic === topic.id || selectedTopic === topic.id
                  }"
                  :title="`${topic.name} (${fullTopicById(topic.id)?.totalEpisodes ?? 0} Ep., ${formatTimespanSec(fullTopicById(topic.id)?.totalRelevanceSec ?? 0)})`"
                >
                  {{ topic.name }}
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400">
                  {{ fullTopicById(topic.id)?.totalEpisodes ?? 0 }} Ep. • {{ formatTimespanSec(fullTopicById(topic.id)?.totalRelevanceSec ?? 0) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-4 sm:mt-6 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
      <p>
        <strong>Interaktion:</strong> Bewege die Maus über einen Stream oder ein Thema in der Legende, um es hervorzuheben. 
        Klicke, um Details anzuzeigen.
      </p>
    </div>
  </div>
</template>

<style scoped>
.topic-river-container {
  padding: 1rem;
}

.topic-river-svg {
  display: block;
  font-family: system-ui, -apple-system, sans-serif;
}

input[type="range"] {
  accent-color: #3b82f6;
}
</style>

