<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-3 sm:p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-violet-50 to-violet-100 dark:from-violet-900/20 dark:to-violet-900/30">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
        <h2 class="text-xl sm:text-2xl font-bold text-violet-900 dark:text-violet-100">Duration Heatmaps</h2>
        
        <!-- Tab Switch -->
        <div class="flex gap-1 sm:gap-2 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-md w-full sm:w-auto overflow-x-auto">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            :class="[
              'px-3 sm:px-4 py-2 rounded-md transition-colors text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0',
              activeTab === tab.id
                ? 'bg-violet-500 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            ]"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      
      <!-- Statistics for active tab -->
      <div v-if="currentData" class="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">{{ currentData.statistics.totalEpisodes }}</div>
          <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Episoden insgesamt</p>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">{{ currentData.statistics[mostCommonLabel] }}</div>
          <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">{{ mostCommonDesc }}</p>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">{{ currentData.statistics.mostCommonDurationLabel }}</div>
          <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Häufigste Dauer</p>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Heatmap -->
      <div class="flex-1 overflow-auto p-6" ref="heatmapContainer">
        <div v-if="loading" class="flex items-center justify-center h-full">
          <p class="text-gray-500 dark:text-gray-400">Lade Daten...</p>
        </div>
        <div v-else>
          <!-- Selected Cell Details -->
          <div v-if="selectedCell" class="mb-6 p-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg">
            <div class="relative">
              <button
                @click="clearSelection"
                class="absolute top-2 right-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                aria-label="Schließen"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fill-rule="evenodd"
                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>

              <div class="min-w-0">
                <div class="pr-10">
                  <h3 class="font-semibold text-lg text-violet-900 dark:text-violet-100">
                    {{ selectedCell.label }} – {{ selectedCell.durationLabel }}
                  </h3>
                  <p class="text-sm text-violet-600 dark:text-violet-400 mt-2">
                    <strong>{{ selectedCell.episodes.length }}</strong> Episoden
                  </p>
                  
                  <div class="mt-3">
                    <button
                      @click="showEpisodeList = !showEpisodeList"
                      class="text-sm text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300 font-semibold underline"
                    >
                      {{ showEpisodeList ? 'Episoden ausblenden' : `${selectedCell.episodes.length} Episoden anzeigen` }}
                    </button>
                  </div>
                </div>

                <div v-if="inlinePlayer.currentMp3Url" class="mt-3">
                  <MiniAudioPlayer
                    :src="inlinePlayer.currentMp3Url"
                    :title="`Episode ${inlinePlayer.playerInfo?.episodeNumber ?? ''}`"
                    :subtitle="inlinePlayer.playerInfo?.label || ''"
                    :seek-to-sec="inlinePlayer.playerInfo?.positionSec ?? 0"
                    :autoplay="true"
                    :play-token="inlinePlayer.playerToken"
                    :transcript-src="inlinePlayer.currentTranscriptUrl || undefined"
                    :speakers-meta-url="inlinePlayer.speakersMetaUrl"
                    @close="inlinePlayer.closePlayer"
                    @error="inlinePlayer.setPlayerError"
                  />
                  <div v-if="inlinePlayer.playerError" class="mt-2 text-xs text-red-700 dark:text-red-300">
                    {{ inlinePlayer.playerError }}
                  </div>
                </div>

                <!-- Episode List -->
                <div v-if="showEpisodeList" class="mt-4 bg-white dark:bg-gray-900 rounded-lg border border-violet-300 dark:border-violet-700">
                  <div v-if="loadingEpisodes" class="p-4 text-center text-gray-600 dark:text-gray-400">
                    Lade Episoden-Details...
                  </div>
                  <div v-else class="max-h-96 overflow-auto">
                    <table class="min-w-full w-max text-sm table-auto">
                      <thead class="bg-violet-100 dark:bg-violet-900 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-violet-900 dark:text-violet-100 whitespace-nowrap">#</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-violet-900 dark:text-violet-100 whitespace-nowrap">Datum</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-violet-900 dark:text-violet-100">Titel</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-violet-900 dark:text-violet-100 whitespace-nowrap">Dauer</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-violet-900 dark:text-violet-100 whitespace-nowrap">Sprecher</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-violet-900 dark:text-violet-100 whitespace-nowrap">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr 
                          v-for="episodeNum in selectedCell.episodes" 
                          :key="episodeNum"
                          class="border-t border-violet-100 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                        >
                          <template v-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum) !== null">
                            <td class="px-3 py-2 text-violet-700 dark:text-violet-300 text-xs whitespace-nowrap">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  @click="inlinePlayer.playEpisodeAt(episodeNum, 0, 'Start')"
                                  title="Episode von Anfang abspielen"
                                  aria-label="Episode von Anfang abspielen"
                                >
                                  ▶︎
                                </button>
                                <span class="font-mono">{{ episodeNum }}</span>
                              </div>
                            </td>
                            <td class="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                              {{ formatDate(episodeDetails.get(episodeNum)?.date) }}
                            </td>
                            <td class="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs">
                              {{ episodeDetails.get(episodeNum)?.title }}
                            </td>
                            <td class="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                              {{ formatDuration(episodeDetails.get(episodeNum)?.duration) }}
                            </td>
                            <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                              <span v-for="(speaker, idx) in episodeDetails.get(episodeNum)?.speakers" :key="speaker">
                                <span class="inline-block text-gray-600 dark:text-gray-400">{{ speaker }}</span><span v-if="idx < ((episodeDetails.get(episodeNum)?.speakers?.length || 0) - 1)" class="text-gray-600 dark:text-gray-400">, </span>
                              </span>
                            </td>
                            <td class="px-3 py-2 text-xs">
                              <a 
                                v-if="episodeDetails.get(episodeNum)?.url" 
                                :href="episodeDetails.get(episodeNum)?.url" 
                                target="_blank"
                                class="text-violet-600 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300 underline"
                              >
                                →
                              </a>
                            </td>
                          </template>
                          <template v-else-if="episodeDetails.get(episodeNum) === null">
                            <td class="px-3 py-2 text-violet-700 dark:text-violet-300 text-xs whitespace-nowrap">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  @click="inlinePlayer.playEpisodeAt(episodeNum, 0, 'Start')"
                                  title="Episode von Anfang abspielen"
                                  aria-label="Episode von Anfang abspielen"
                                >
                                  ▶︎
                                </button>
                                <span class="font-mono">{{ episodeNum }}</span>
                              </div>
                            </td>
                            <td colspan="5" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs italic">
                              Details nicht verfügbar
                            </td>
                          </template>
                          <template v-else>
                            <td class="px-3 py-2 text-violet-700 dark:text-violet-300 text-xs whitespace-nowrap">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  @click="inlinePlayer.playEpisodeAt(episodeNum, 0, 'Start')"
                                  title="Episode von Anfang abspielen"
                                  aria-label="Episode von Anfang abspielen"
                                >
                                  ▶︎
                                </button>
                                <span class="font-mono">{{ episodeNum }}</span>
                              </div>
                            </td>
                            <td colspan="5" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">
                              Lade...
                            </td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SVG Container -->
          <svg ref="svgElement" class="w-full"></svg>
          
          <!-- Interaction Instructions -->
          <div class="mt-4 sm:mt-6 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            <p>
              <strong>{{ $t('common.interaction') }}:</strong> 
              {{ $t('heatmap.interaction.hover') }} 
              {{ $t('heatmap.interaction.click') }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed, reactive } from 'vue';
import * as d3 from 'd3';
import { useSettingsStore } from '../stores/settings';
import { getEpisodeUrl, getPodcastFileUrl } from '@/composables/usePodcast';
import MiniAudioPlayer from '@/components/MiniAudioPlayer.vue';
import { useInlineEpisodePlayer } from '@/composables/useInlineEpisodePlayer';

const settingsStore = useSettingsStore();
const inlinePlayer = reactive(useInlineEpisodePlayer());

interface EpisodeDetail {
  title: string;
  date: string;
  duration?: string | number;
  speakers?: string[];
  url?: string;
}

interface HeatmapData {
  generatedAt: string;
  description: string;
  statistics: {
    totalEpisodes: number;
    [key: string]: any;
  };
  matrix: Array<{
    [key: string]: any;
    values: Array<{
      duration: number;
      durationLabel: string;
      count: number;
      episodes: number[];
    }>;
  }>;
  durations: Array<{
    minutes: number;
    label: string;
    totalEpisodes: number;
  }>;
}

const tabs = [
  { id: 'dayofweek', label: 'Wochentag', file: 'dayofweek-duration-heatmap.json' },
  { id: 'year', label: 'Jahr', file: 'year-duration-heatmap.json' },
  { id: 'speaker', label: 'Sprecher', file: 'speaker-duration-heatmap.json' }
];

const activeTab = ref('dayofweek');
const heatmapDataCache = ref<Record<string, HeatmapData>>({});
const loading = ref(false);
const svgElement = ref<SVGSVGElement | null>(null);
const heatmapContainer = ref<HTMLDivElement | null>(null);

type HeatmapFocus = { type: 'row'; id: string } | { type: 'col'; id: string } | null;
const activeHeatmapFocusByTab = ref<Record<string, HeatmapFocus>>({});

const selectedCell = ref<{
  label: string;
  durationLabel: string;
  count: number;
  episodes: number[];
} | null>(null);

const showEpisodeList = ref(false);
const loadingEpisodes = ref(false);
const episodeDetails = ref<Map<number, EpisodeDetail | null>>(new Map());

const currentData = computed(() => {
  return heatmapDataCache.value[activeTab.value] || null;
});

const mostCommonLabel = computed(() => {
  switch (activeTab.value) {
    case 'dayofweek': return 'mostCommonDay';
    case 'year': return 'mostCommonYear';
    case 'speaker': return 'mostCommonSpeaker';
    default: return 'mostCommonDay';
  }
});

const mostCommonDesc = computed(() => {
  switch (activeTab.value) {
    case 'dayofweek': return 'Häufigster Wochentag';
    case 'year': return 'Häufigstes Jahr';
    case 'speaker': return 'Häufigster Sprecher';
    default: return 'Häufigster Wert';
  }
});

function clearSelection() {
  selectedCell.value = null;
  showEpisodeList.value = false;
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('de-DE');
}

function formatDuration(duration?: string | number): string {
  if (!duration) return '';
  
  if (typeof duration === 'string') return duration;
  
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

async function loadEpisodeDetails() {
  if (!selectedCell.value) return;
  
  loadingEpisodes.value = true;
  
  for (const episodeNum of selectedCell.value.episodes) {
    if (!episodeDetails.value.has(episodeNum)) {
      try {
        const response = await fetch(getEpisodeUrl(episodeNum));
        if (response.ok) {
          const data = await response.json();
          
          let durationInSeconds: number | undefined;
          if (Array.isArray(data.duration) && data.duration.length === 3) {
            const [h, m, s] = data.duration;
            durationInSeconds = h * 3600 + m * 60 + s;
          }
          
          const episodeDetail: EpisodeDetail = {
            title: data.title || '',
            date: data.date || '',
            duration: durationInSeconds,
            speakers: data.speakers || [],
            url: data.url || ''
          };
          
          episodeDetails.value.set(episodeNum, episodeDetail);
        } else {
          episodeDetails.value.set(episodeNum, null);
        }
      } catch (error) {
        console.error(`Failed to load episode ${episodeNum}:`, error);
        episodeDetails.value.set(episodeNum, null);
      }
    }
  }
  
  loadingEpisodes.value = false;
}

function getTextColor(color: string): string {
  let r: number, g: number, b: number;
  
  if (color.startsWith('#')) {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  } else if (color.startsWith('rgb')) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0] || '0');
      g = parseInt(matches[1] || '0');
      b = parseInt(matches[2] || '0');
    } else {
      return 'white';
    }
  } else {
    return 'white';
  }
  
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.35 ? '#1f2937' : 'white';
}

function getRowLabel(row: any): string {
  if (activeTab.value === 'dayofweek') return row.day;
  if (activeTab.value === 'year') return row.year;
  if (activeTab.value === 'speaker') return row.speaker;
  return '';
}

function drawHeatmap() {
  if (!svgElement.value || !currentData.value || !heatmapContainer.value) return;

  d3.selectAll('.heatmap-tooltip').remove();

  const svg = d3.select(svgElement.value);
  svg.selectAll('*').remove();

  const matrix = currentData.value.matrix;
  const durations = currentData.value.durations;

  if (matrix.length === 0 || durations.length === 0) {
    svg.append('text')
      .attr('x', 200)
      .attr('y', 100)
      .attr('text-anchor', 'middle')
      .attr('class', 'text-gray-500 dark:text-gray-400')
      .text('Keine Daten verfügbar');
    return;
  }

  // Dimensions
  const containerWidth = heatmapContainer.value.clientWidth - 48;
  
  // Responsive margins based on viewport
  const isMobile = containerWidth < 640;
  const isTablet = containerWidth >= 640 && containerWidth < 1024;
  
  const cellSize = Math.min(80, Math.max(40, containerWidth / (durations.length + 3)));
  const labelWidth = isMobile 
    ? 60
    : isTablet 
    ? (activeTab.value === 'speaker' ? 100 : 80) 
    : (activeTab.value === 'speaker' ? 180 : 150);
  
  const margin = isMobile
    ? { top: 60, right: 10, bottom: 40, left: labelWidth }
    : isTablet
    ? { top: 80, right: 15, bottom: 50, left: labelWidth }
    : { top: 100, right: 20, bottom: 60, left: labelWidth };
  const width = durations.length * cellSize;
  const height = matrix.length * cellSize;

  svg.attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Color scale + row/col hover normalization (in-place update, no redraw)
  const allCounts = matrix.flatMap(row => row.values.map(v => v.count)).filter(c => c > 0);
  const globalMin = d3.min(allCounts) ?? 0;
  const globalMax = d3.max(allCounts) ?? 0;

  function normalizeDomain(min: number, max: number): [number, number] {
    if (!Number.isFinite(max) || max <= 0) return [0, 1];
    if (!Number.isFinite(min) || min < 0) min = 0;
    if (min === max) min = 0;
    return [min, max];
  }

  const globalDomain = normalizeDomain(globalMin, globalMax);
  let currentDomain: [number, number] = globalDomain;
  let colorScale = d3.scaleSequential(d3.interpolatePurples).domain(currentDomain);

  function getEmptyCellColor() {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark ? '#1f2937' : '#f0f0f0';
  }

  function getRowDomain(rowLabel: string): [number, number] {
    const row = matrix.find(r => getRowLabel(r) === rowLabel);
    if (!row) return globalDomain;
    const counts = row.values.map(v => v.count).filter(c => c > 0);
    if (counts.length === 0) return globalDomain;
    return normalizeDomain(d3.min(counts) ?? 0, d3.max(counts) ?? 0);
  }

  function getColDomain(colId: string): [number, number] {
    const counts = matrix
      .flatMap(r => r.values)
      .filter(v => v.duration.toString() === colId)
      .map(v => v.count)
      .filter(c => c > 0);
    if (counts.length === 0) return globalDomain;
    return normalizeDomain(d3.min(counts) ?? 0, d3.max(counts) ?? 0);
  }

  // X axis (durations)
  const xScale = d3.scaleBand()
    .domain(durations.map(d => d.minutes.toString()))
    .range([0, width])
    .padding(0.05);

  // Y axis (rows)
  const yScale = d3.scaleBand()
    .domain(matrix.map(row => getRowLabel(row)))
    .range([0, height])
    .padding(0.05);

  // Draw cells
  matrix.forEach((row) => {
    const rowLabel = getRowLabel(row);
    
    row.values.forEach((value) => {
      const x = xScale(value.duration.toString());
      const y = yScale(rowLabel);
      
      if (x === undefined || y === undefined) return;
      const rowId = rowLabel;
      const colId = value.duration.toString();

      const cellGroup = g.append('g')
        .attr('class', 'cell-group')
        .style('cursor', value.count > 0 ? 'pointer' : 'default');

      cellGroup.append('rect')
        .attr('class', 'heatmap-cell')
        .attr('data-row-id', rowId)
        .attr('data-col-id', colId)
        .attr('data-count', String(value.count))
        .attr('x', x)
        .attr('y', y)
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', value.count > 0 ? colorScale(value.count) : getEmptyCellColor())
        .attr('stroke', 'none')
        .attr('stroke-width', 0)
        .on('mouseover', function(event) {
          if (value.count === 0) return;
          
          d3.select(this)
            .attr('stroke', '#000')
            .attr('stroke-width', 2);
          
          d3.selectAll('.heatmap-tooltip').remove();
          
          d3.select('body').append('div')
            .attr('class', 'heatmap-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', '#fff')
            .style('padding', '8px 12px')
            .style('border-radius', '4px')
            .style('pointer-events', 'none')
            .style('font-size', '12px')
            .style('z-index', '1000')
            .html(`
              <strong>${rowLabel}</strong><br/>
              ${value.durationLabel}<br/>
              ${value.count} Episoden
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('stroke', 'none')
            .attr('stroke-width', 0);
          
          d3.selectAll('.heatmap-tooltip').remove();
        })
        .on('click', function() {
          if (value.count === 0) return;
          
          d3.selectAll('.heatmap-tooltip').remove();
          
          selectedCell.value = {
            label: rowLabel,
            durationLabel: value.durationLabel,
            count: value.count,
            episodes: value.episodes
          };
          
          showEpisodeList.value = true;
          loadEpisodeDetails();
        });

      if (value.count > 0 && cellSize > 30) {
        const cellColor = colorScale(value.count);
        const textColor = getTextColor(cellColor);
        
        cellGroup.append('text')
          .attr('class', 'heatmap-cell-text')
          .attr('data-row-id', rowId)
          .attr('data-col-id', colId)
          .attr('data-count', String(value.count))
          .attr('x', x + xScale.bandwidth() / 2)
          .attr('y', y + yScale.bandwidth() / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', Math.min(14, cellSize * 0.3))
          .attr('fill', textColor)
          .attr('pointer-events', 'none')
          .text(value.count);
      }
    });
  });

  // X axis labels (durations)
  const xLabels = g.append('g')
    .selectAll('text')
    .data(durations)
    .enter()
    .append('text')
    .attr('x', d => (xScale(d.minutes.toString()) || 0) + xScale.bandwidth() / 2)
    .attr('y', -15)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .style('cursor', 'pointer')
    .text(d => d.label);

  // Y axis labels
  const labelFontSize = isMobile ? '8px' : isTablet ? '9px' : '11px';
  
  const yLabels = g.append('g')
    .selectAll('text')
    .data(matrix)
    .enter()
    .append('text')
    .attr('x', -5)
    .attr('y', d => (yScale(getRowLabel(d)) || 0) + yScale.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', labelFontSize)
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .style('cursor', 'pointer')
    .text(d => {
      const label = getRowLabel(d);
      // Truncate long labels on mobile
      if (isMobile && label.length > 10) {
        return label.substring(0, 9) + '…';
      } else if (isTablet && label.length > 15) {
        return label.substring(0, 14) + '…';
      }
      return label;
    });

  yLabels.append('title').text(d => getRowLabel(d));

  // Legend
  const legendWidth = 200;
  const legendHeight = 10;
  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top + height + 40})`);

  const legendScale = d3.scaleLinear()
    .domain(currentDomain)
    .range([0, legendWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(5)
    .tickFormat(d => d.toString());

  const gradientId = `legend-gradient-${activeTab.value}`;
  const gradient = svg.append('defs')
    .append('linearGradient')
    .attr('id', gradientId)
    .attr('x1', '0%')
    .attr('x2', '100%');

  gradient.selectAll('stop')
    .data(d3.range(0, 1.01, 0.1))
    .enter()
    .append('stop')
    .attr('offset', d => `${d * 100}%`)
    .attr('stop-color', d => colorScale(currentDomain[0] + d * (currentDomain[1] - currentDomain[0])));

  legend.append('rect')
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .style('fill', `url(#${gradientId})`);

  const legendAxisG = legend.append('g')
    .attr('transform', `translate(0,${legendHeight})`)
    .attr('class', 'fill-gray-700 dark:fill-gray-300');

  legendAxisG.call(legendAxis as any);
  legendAxisG.selectAll('text').attr('class', 'fill-gray-700 dark:fill-gray-300');

  legend.append('text')
    .attr('x', legendWidth / 2)
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .text('Anzahl Episoden');

  function getDimmedCellColor() {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark ? '#374151' : '#e5e7eb';
  }

  function applyDomain(domain: [number, number], focus: HeatmapFocus = null) {
    currentDomain = normalizeDomain(domain[0], domain[1]);
    colorScale = d3.scaleSequential(d3.interpolatePurples).domain(currentDomain);

    g.selectAll<SVGRectElement, unknown>('rect.heatmap-cell')
      .attr('fill', function() {
        const el = this as SVGRectElement;
        const count = Number(el.getAttribute('data-count') || '0');
        if (count <= 0) return getEmptyCellColor();
        if (!focus) return colorScale(count);
        const rowId = el.getAttribute('data-row-id') || '';
        const colId = el.getAttribute('data-col-id') || '';
        const isFocused = focus.type === 'row' ? rowId === focus.id : colId === focus.id;
        return isFocused ? colorScale(count) : getDimmedCellColor();
      });

    g.selectAll<SVGTextElement, unknown>('text.heatmap-cell-text')
      .attr('fill', function() {
        const el = this as SVGTextElement;
        const count = Number(el.getAttribute('data-count') || '0');
        if (count <= 0) return getTextColor(colorScale(0));
        if (!focus) return getTextColor(colorScale(count));
        const rowId = el.getAttribute('data-row-id') || '';
        const colId = el.getAttribute('data-col-id') || '';
        const isFocused = focus.type === 'row' ? rowId === focus.id : colId === focus.id;
        return isFocused ? getTextColor(colorScale(count)) : '#6b7280';
      })
      .attr('opacity', function() {
        const el = this as SVGTextElement;
        const count = Number(el.getAttribute('data-count') || '0');
        if (count <= 0) return 1;
        if (!focus) return 1;
        const rowId = el.getAttribute('data-row-id') || '';
        const colId = el.getAttribute('data-col-id') || '';
        const isFocused = focus.type === 'row' ? rowId === focus.id : colId === focus.id;
        return isFocused ? 1 : 0.2;
      });

    if (focus?.type === 'row') {
      yLabels.attr('opacity', d => (getRowLabel(d) === focus.id ? 1 : 0.25));
      xLabels.attr('opacity', 1);
    } else if (focus?.type === 'col') {
      xLabels.attr('opacity', d => (d.minutes.toString() === focus.id ? 1 : 0.25));
      yLabels.attr('opacity', 1);
    } else {
      xLabels.attr('opacity', 1);
      yLabels.attr('opacity', 1);
    }

    xLabels
      .style('font-weight', d => (focus?.type === 'col' && d.minutes.toString() === focus.id ? '700' : '400'))
      .style('text-decoration', d => (focus?.type === 'col' && d.minutes.toString() === focus.id ? 'underline' : null));
    yLabels
      .style('font-weight', d => (focus?.type === 'row' && getRowLabel(d) === focus.id ? '700' : '400'))
      .style('text-decoration', d => (focus?.type === 'row' && getRowLabel(d) === focus.id ? 'underline' : null));

    legendScale.domain(currentDomain);
    legendAxisG.call(legendAxis as any);
    gradient.selectAll('stop')
      .attr('stop-color', d => colorScale(currentDomain[0] + (d as number) * (currentDomain[1] - currentDomain[0])));
  }

  // Click labels to select/deselect focus; focus persists per-tab across redraws
  xLabels.on('click', (_event, d) => {
    const colId = d.minutes.toString();
    const current = activeHeatmapFocusByTab.value[activeTab.value] || null;
    const next: HeatmapFocus = current?.type === 'col' && current.id === colId ? null : { type: 'col', id: colId };
    if (next) activeHeatmapFocusByTab.value[activeTab.value] = next;
    else delete activeHeatmapFocusByTab.value[activeTab.value];
    applyDomain(next ? getColDomain(next.id) : globalDomain, next);
  });

  yLabels.on('click', (_event, d) => {
    const rowId = getRowLabel(d);
    const current = activeHeatmapFocusByTab.value[activeTab.value] || null;
    const next: HeatmapFocus = current?.type === 'row' && current.id === rowId ? null : { type: 'row', id: rowId };
    if (next) activeHeatmapFocusByTab.value[activeTab.value] = next;
    else delete activeHeatmapFocusByTab.value[activeTab.value];
    applyDomain(next ? getRowDomain(next.id) : globalDomain, next);
  });

  // Re-apply persisted focus for this tab (if any)
  const persisted = activeHeatmapFocusByTab.value[activeTab.value] || null;
  if (persisted?.type === 'col') applyDomain(getColDomain(persisted.id), persisted);
  else if (persisted?.type === 'row') applyDomain(getRowDomain(persisted.id), persisted);
}

async function loadData(tabId: string) {
  if (heatmapDataCache.value[tabId]) {
    return;
  }
  
  loading.value = true;
  try {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    const response = await fetch(getPodcastFileUrl(tab.file));
    heatmapDataCache.value[tabId] = await response.json();
  } catch (error) {
    console.error(`Failed to load ${tabId} data:`, error);
  } finally {
    loading.value = false;
  }
}

// Load data on mount
onMounted(async () => {
  await loadData(activeTab.value);
});

// Watch for tab changes
watch(activeTab, async (newTab) => {
  clearSelection();
  await loadData(newTab);
  drawHeatmap();
});

// Watch for podcast changes and reload data
watch(() => settingsStore.selectedPodcast, async () => {
  clearSelection();
  // Clear cache to force reload
  heatmapDataCache.value = {};
  await loadData(activeTab.value);
  drawHeatmap();
});

// Watch for data changes and redraw
watch([currentData, () => settingsStore.isDarkMode], () => {
  if (currentData.value) {
    drawHeatmap();
  }
});

// Watch for selected cell changes
watch(selectedCell, () => {
  if (selectedCell.value) {
    loadEpisodeDetails();
  }
});

// Watch for window resize
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (heatmapContainer.value) {
    resizeObserver = new ResizeObserver(() => {
      if (currentData.value) {
        drawHeatmap();
      }
    });
    resizeObserver.observe(heatmapContainer.value);
  }
});
</script>

