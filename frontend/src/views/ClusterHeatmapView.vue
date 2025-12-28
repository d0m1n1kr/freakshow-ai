<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-3 sm:p-4 md:p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/30">
      <div v-if="heatmapData" class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{{ heatmapData.statistics.totalSpeakers }}</div>
          <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Sprecher insgesamt</p>
        </div>
        <div class="text-center">
          <div class="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{{ heatmapData.statistics.totalClusters }}</div>
          <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">Cluster insgesamt</p>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Heatmap -->
      <div class="flex-1 overflow-auto p-6" ref="heatmapContainer">
        <div v-if="!heatmapData" class="flex items-center justify-center h-full">
          <p class="text-gray-500 dark:text-gray-400">Lade Daten...</p>
        </div>
        <div v-else>
          <!-- Controls -->
          <div class="mb-4 sm:mb-6 flex flex-col sm:flex-row gap-3 sm:gap-6 items-stretch sm:items-center">
            <label class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex flex-col sm:flex-row sm:items-center gap-2">
              <span class="whitespace-nowrap">Anzahl Sprecher:</span>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="settingsStore.topNSpeakersClusterHeatmap"
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  class="flex-1 sm:w-32 md:w-48 slider-orange"
                />
                <span class="text-orange-600 dark:text-orange-400 font-semibold min-w-[2rem] text-right">{{ settingsStore.topNSpeakersClusterHeatmap }}</span>
              </div>
            </label>
            
            <label class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex flex-col sm:flex-row sm:items-center gap-2">
              <span class="whitespace-nowrap">Anzahl Cluster:</span>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="settingsStore.topNClustersHeatmap"
                  type="range"
                  min="10"
                  max="50"
                  step="1"
                  class="flex-1 sm:w-32 md:w-48 slider-orange"
                />
                <span class="text-orange-600 dark:text-orange-400 font-semibold min-w-[2rem] text-right">{{ settingsStore.topNClustersHeatmap }}</span>
              </div>
            </label>
          </div>

          <!-- Selected Cell Details -->
          <div v-if="selectedCell" class="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg">
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
                  <h3 class="font-semibold text-lg text-orange-900 dark:text-orange-100">
                    {{ selectedCell.speakerName }} → {{ selectedCell.clusterName }}
                  </h3>
                  <p class="text-sm text-orange-600 dark:text-orange-400 mt-2">
                    <strong>{{ selectedCell.episodes.length }}</strong> Episoden in dieser Kombination
                  </p>
                  
                  <div class="mt-3">
                    <button
                      @click="showEpisodeList = !showEpisodeList"
                      class="text-sm text-orange-600 hover:text-orange-800 dark:text-orange-400 dark:hover:text-orange-300 font-semibold underline"
                    >
                      {{ showEpisodeList ? 'Episoden ausblenden' : `${selectedCell.episodes.length} Episoden anzeigen` }}
                    </button>
                  </div>
                </div>

                <!-- Episode List -->
                <div v-if="showEpisodeList" class="mt-4 bg-white dark:bg-gray-900 rounded-lg border border-orange-300 dark:border-orange-700">
                  <div v-if="loadingEpisodes" class="p-4 text-center text-gray-600 dark:text-gray-400">
                    Lade Episoden-Details...
                  </div>
                  <div v-else class="max-h-96 overflow-auto">
                    <table class="min-w-full w-max text-sm table-auto">
                      <thead class="bg-orange-100 dark:bg-orange-900 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-orange-900 dark:text-orange-100 whitespace-nowrap">#</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-orange-900 dark:text-orange-100 whitespace-nowrap">Datum</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-orange-900 dark:text-orange-100">Titel</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-orange-900 dark:text-orange-100 whitespace-nowrap">Dauer</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-orange-900 dark:text-orange-100 whitespace-nowrap">Sprecher</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-orange-900 dark:text-orange-100 whitespace-nowrap">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr 
                          v-for="episodeNum in selectedCell.episodes" 
                          :key="episodeNum"
                          class="border-t border-orange-100 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/50"
                        >
                          <template v-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum) !== null">
                            <td class="px-3 py-2 text-orange-700 dark:text-orange-300 font-mono text-xs whitespace-nowrap">{{ episodeNum }}</td>
                            <td class="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                              {{ formatDate(episodeDetails.get(episodeNum)?.date) }}
                            </td>
                            <td class="px-3 py-2 text-gray-900 dark:text-gray-100 text-xs">
                              {{ episodeDetails.get(episodeNum)?.title }}
                            </td>
                            <td class="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                              {{ episodeDetails.get(episodeNum)?.duration ? formatDuration(episodeDetails.get(episodeNum)?.duration) : 'N/A' }}
                            </td>
                            <td class="px-3 py-2 text-xs whitespace-nowrap">
                              <template v-for="(speaker, idx) in episodeDetails.get(episodeNum)?.speakers || []" :key="`${episodeNum}-${idx}`">
                                <span
                                  :class="[
                                    'inline-block',
                                    speaker === selectedCell?.speakerName 
                                      ? 'font-semibold text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 px-1 rounded' 
                                      : 'text-gray-600 dark:text-gray-400'
                                  ]"
                                >{{ speaker }}</span><span v-if="idx < ((episodeDetails.get(episodeNum)?.speakers?.length || 0) - 1)" class="text-gray-600 dark:text-gray-400">, </span>
                              </template>
                            </td>
                            <td class="px-3 py-2">
                              <a 
                                v-if="episodeDetails.get(episodeNum)?.url"
                                :href="episodeDetails.get(episodeNum)?.url" 
                                target="_blank"
                                rel="noopener noreferrer"
                                class="text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-xs underline"
                              >
                                🔗
                              </a>
                            </td>
                          </template>
                          <template v-else-if="episodeDetails.get(episodeNum) === null">
                            <td class="px-3 py-2 text-orange-700 dark:text-orange-300 font-mono text-xs">{{ episodeNum }}</td>
                            <td colspan="5" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs italic">
                              Details nicht verfügbar
                            </td>
                          </template>
                          <template v-else>
                            <td class="px-3 py-2 text-orange-700 dark:text-orange-300 font-mono text-xs">{{ episodeNum }}</td>
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
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import * as d3 from 'd3';
import type { HeatmapData } from '../types';
import { useSettingsStore } from '../stores/settings';
import { loadVariantData } from '@/composables/useVariants';

const settingsStore = useSettingsStore();

interface EpisodeDetail {
  title: string;
  date: string;
  duration?: string | number;
  speakers?: string[];
  url?: string;
}

const heatmapData = ref<HeatmapData | null>(null);
const svgElement = ref<SVGSVGElement | null>(null);
const heatmapContainer = ref<HTMLDivElement | null>(null);

const selectedCell = ref<{
  speakerName: string;
  clusterName: string;
  count: number;
  episodes: number[];
} | null>(null);

const showEpisodeList = ref(false);

async function loadData() {
  try {
    heatmapData.value = await loadVariantData('speaker-cluster-heatmap.json');
  } catch (error) {
    console.error('Failed to load heatmap data:', error);
  }
}
const loadingEpisodes = ref(false);

const episodeDetails = ref<Map<number, EpisodeDetail | null>>(new Map());

// Filtered data based on slider values
const filteredData = computed(() => {
  if (!heatmapData.value) return { speakers: [], clusters: [] };
  
  // Get top N speakers (already sorted by episodes in the data)
  const speakers = heatmapData.value.speakers.slice(0, settingsStore.topNSpeakersClusterHeatmap);
  
  // Get top N clusters (already sorted by episodes in the data)
  const clusters = (heatmapData.value.clusters || []).slice(0, settingsStore.topNClustersHeatmap);
  
  return { speakers, clusters };
});

const filteredMatrix = computed(() => {
  if (!heatmapData.value) return [];
  
  const { speakers, clusters } = filteredData.value;
  const speakerIds = new Set(speakers.map(s => s.id));
  const clusterIds = new Set(clusters.map(c => c.id));
  
  // Filter matrix by selected speakers
  let matrix = heatmapData.value.matrix.filter(row => row.speakerId && speakerIds.has(row.speakerId));
  
  // Filter values by selected clusters
  matrix = matrix.map(row => ({
    ...row,
    values: row.values.filter(val => val.clusterId && clusterIds.has(val.clusterId))
  }));
  
  return matrix;
});

const filteredClusters = computed(() => {
  return filteredData.value.clusters;
});

function clearSelection() {
  selectedCell.value = null;
  showEpisodeList.value = false;
}

async function loadEpisodeDetails(episodeNumbers: number[]) {
  loadingEpisodes.value = true;
  
  for (const num of episodeNumbers) {
    if (episodeDetails.value.has(num)) continue;

    try {
      const response = await fetch(`/episodes/${num}.json`);
      if (!response.ok) {
        episodeDetails.value.set(num, null);
        continue;
      }
      const data = await response.json();
      
      // Convert duration array [hours, minutes, seconds] to total seconds
      let durationInSeconds: number | undefined;
      if (Array.isArray(data.duration) && data.duration.length === 3) {
        const [hours, minutes, seconds] = data.duration;
        durationInSeconds = hours * 3600 + minutes * 60 + seconds;
      }
      
      episodeDetails.value.set(num, {
        title: data.title,
        date: data.date,
        url: data.url,
        speakers: data.speakers,
        duration: durationInSeconds
      });
    } catch (error) {
      console.error(`Failed to load episode ${num}:`, error);
      episodeDetails.value.set(num, null);
    }
  }
  
  loadingEpisodes.value = false;
}

function formatDate(dateString: string | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('de-DE', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatDuration(duration: string | number | undefined): string {
  if (!duration) return 'N/A';
  
  // If it's already a string (formatted), return it
  if (typeof duration === 'string') return duration;
  
  // If it's a number (seconds), format it
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Watch for selection changes to load episode details
watch(selectedCell, (newCell) => {
  if (newCell && newCell.episodes.length > 0) {
    loadEpisodeDetails(newCell.episodes);
  }
});

function drawHeatmap() {
  if (!svgElement.value || !heatmapData.value || !heatmapContainer.value) return;

  // Remove all existing tooltips first
  d3.selectAll('.heatmap-tooltip').remove();

  const svg = d3.select(svgElement.value);
  svg.selectAll('*').remove();

  const matrix = filteredMatrix.value;
  const clusters = filteredClusters.value;

  if (matrix.length === 0 || clusters.length === 0) {
    svg.append('text')
      .attr('x', 200)
      .attr('y', 100)
      .attr('text-anchor', 'middle')
      .attr('class', 'text-gray-500 dark:text-gray-400')
      .text('Keine Daten für die ausgewählten Filter');
    return;
  }

  // Dimensions
  const containerWidth = heatmapContainer.value.clientWidth - 48; // padding
  
  // Responsive margins based on viewport
  const isMobile = containerWidth < 640;
  const isTablet = containerWidth >= 640 && containerWidth < 1024;
  
  const cellSize = Math.min(30, Math.max(10, containerWidth / (clusters.length + 10)));
  const margin = isMobile
    ? { top: 80, right: 10, bottom: 20, left: 60 }
    : isTablet
    ? { top: 120, right: 15, bottom: 20, left: 100 }
    : { top: 180, right: 20, bottom: 20, left: 200 };
  const width = clusters.length * cellSize;
  const height = matrix.length * cellSize;

  svg.attr('width', width + margin.left + margin.right)
    .attr('height', height + margin.top + margin.bottom);

  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Color scale
  const maxCount = d3.max(matrix.flatMap(row => row.values.map(v => v.count))) || 0;
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, maxCount]);

  // X axis (clusters)
  const xScale = d3.scaleBand()
    .domain(clusters.map(c => c.id))
    .range([0, width])
    .padding(0.05);

  // Y axis (speakers)
  const yScale = d3.scaleBand()
    .domain(matrix.map(row => row.speakerId || '').filter(id => id))
    .range([0, height])
    .padding(0.05);

  // Draw cells
  matrix.forEach((row) => {
    if (!row.speakerId) return;
    row.values.forEach((value) => {
      if (!value.clusterId) return;
      
      const x = xScale(value.clusterId);
      const y = yScale(row.speakerId || '');
      
      if (x === undefined || y === undefined) return;

      const cellGroup = g.append('g')
        .attr('class', 'cell-group')
        .style('cursor', value.count > 0 ? 'pointer' : 'default');

      // Get empty cell color based on dark mode
      const isDark = document.documentElement.classList.contains('dark');
      const emptyCellColor = isDark ? '#1f2937' : '#f0f0f0'; // dark:bg-gray-800 or light gray

      cellGroup.append('rect')
        .attr('x', x)
        .attr('y', y)
        .attr('width', xScale.bandwidth())
        .attr('height', yScale.bandwidth())
        .attr('fill', value.count > 0 ? colorScale(value.count) : emptyCellColor)
        .attr('stroke', 'none')
        .attr('stroke-width', 0)
        .on('mouseover', function(event) {
          if (value.count === 0) return;
          
          d3.select(this)
            .attr('stroke', '#000')
            .attr('stroke-width', 2);

          // Remove any existing tooltips first
          d3.selectAll('.heatmap-tooltip').remove();

          // Create tooltip
          d3.select('body').append('div')
            .attr('class', 'heatmap-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0, 0, 0, 0.8)')
            .style('color', 'white')
            .style('padding', '8px')
            .style('border-radius', '4px')
            .style('pointer-events', 'none')
            .style('font-size', '12px')
            .style('z-index', '1000')
            .html(`
              <strong>${row.speakerName}</strong><br/>
              ${value.clusterName}<br/>
              ${value.count} Episoden
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);

          // Remove tooltip
          d3.selectAll('.heatmap-tooltip').remove();
        })
        .on('click', function() {
          if (value.count === 0) return;
          
          // Remove tooltip on click
          d3.selectAll('.heatmap-tooltip').remove();
          
          selectedCell.value = {
            speakerName: row.speakerName || '',
            clusterName: value.clusterName || '',
            count: value.count,
            episodes: value.episodes
          };
        });

      // Add text for non-zero values
      if (value.count > 0 && cellSize > 15) {
        // Calculate luminance of the cell color to determine text color
        const color = d3.rgb(colorScale(value.count));
        const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
        
        // Use dark text for light cells, white text for dark cells
        const textColor = luminance > 0.5 ? '#1f2937' : 'white';
        
        cellGroup.append('text')
          .attr('x', x + xScale.bandwidth() / 2)
          .attr('y', y + yScale.bandwidth() / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('font-size', Math.min(10, cellSize * 0.4))
          .attr('fill', textColor)
          .attr('pointer-events', 'none')
          .text(value.count);
      }
    });
  });

  // X axis labels (clusters)
  const clusterLabelFontSize = isMobile ? '8px' : isTablet ? '9px' : '11px';
  
  g.append('g')
    .selectAll('text')
    .data(clusters)
    .enter()
    .append('text')
    .attr('x', d => (xScale(d.id) || 0) + xScale.bandwidth() / 2)
    .attr('y', -10)
    .attr('text-anchor', 'start')
    .attr('transform', d => {
      const x = (xScale(d.id) || 0) + xScale.bandwidth() / 2;
      return `rotate(-65 ${x} -10)`;
    })
    .attr('font-size', clusterLabelFontSize)
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .text(d => {
      const name = d.name;
      // Truncate long cluster names on mobile
      if (isMobile && name.length > 12) {
        return name.substring(0, 11) + '…';
      } else if (isTablet && name.length > 18) {
        return name.substring(0, 17) + '…';
      }
      return name;
    })
    .append('title')
    .text(d => d.name); // Full name in tooltip

  // Y axis labels (speakers)
  const labelFontSize = isMobile ? '8px' : isTablet ? '9px' : '10px';
  
  g.append('g')
    .selectAll('text')
    .data(matrix)
    .enter()
    .append('text')
    .attr('x', -5)
    .attr('y', d => (yScale(d.speakerId || '') || 0) + yScale.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', labelFontSize)
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .text(d => {
      const name = d.speakerName || '';
      // Truncate long names on mobile
      if (isMobile && name.length > 10) {
        return name.substring(0, 9) + '…';
      } else if (isTablet && name.length > 15) {
        return name.substring(0, 14) + '…';
      }
      return name;
    })
    .append('title')
    .text(d => d.speakerName || ''); // Full name in tooltip

  // Legend
  const legendWidth = 200;
  const legendHeight = 10;
  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top + height + 40})`);

  const legendScale = d3.scaleLinear()
    .domain([0, maxCount])
    .range([0, legendWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(5)
    .tickFormat(d => d.toString());

  // Create gradient
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient')
    .attr('id', 'legend-gradient');

  gradient.selectAll('stop')
    .data(d3.range(0, 1.1, 0.1))
    .enter()
    .append('stop')
    .attr('offset', d => `${d * 100}%`)
    .attr('stop-color', d => colorScale(d * maxCount));

  legend.append('rect')
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .style('fill', 'url(#legend-gradient)');

  legend.append('g')
    .attr('transform', `translate(0,${legendHeight})`)
    .call(legendAxis);

  legend.append('text')
    .attr('x', legendWidth / 2)
    .attr('y', -5)
    .attr('text-anchor', 'middle')
    .attr('font-size', '12px')
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .text('Anzahl Episoden');
}

// Load data on mount
onMounted(() => {
  loadData();
});

// Watch for variant changes and reload data
watch(() => settingsStore.clusteringVariant, () => {
  loadData();
});

// Watch for data changes and redraw
watch([heatmapData, filteredMatrix, filteredClusters, () => settingsStore.isDarkMode], () => {
  if (heatmapData.value) {
    drawHeatmap();
  }
});

// Clear selection when slider values change
watch([() => settingsStore.topNSpeakersClusterHeatmap, () => settingsStore.topNClustersHeatmap], () => {
  selectedCell.value = null;
  showEpisodeList.value = false;
});

// Load episode details when episode list is shown
watch(showEpisodeList, (show) => {
  if (show && selectedCell.value) {
    loadEpisodeDetails(selectedCell.value.episodes);
  }
});

// Redraw on container resize
watch(heatmapContainer, (container) => {
  if (!container) return;
  
  const resizeObserver = new ResizeObserver(() => {
    drawHeatmap();
  });
  
  resizeObserver.observe(container);
});
</script>

