<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import * as d3 from 'd3';
import type { HeatmapData } from '../types';
import { useSettingsStore } from '../stores/settings';

const settingsStore = useSettingsStore();

const heatmapData = ref<HeatmapData | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const svgRef = ref<SVGSVGElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const selectedSpeaker = ref<string | null>(null);
const selectedCategory = ref<string | null>(null);
const showEpisodeList = ref(false);
const showTopicList = ref(false);
const episodeDetails = ref<Map<number, any>>(new Map());
const loadingEpisodes = ref(false);

onMounted(async () => {
  try {
    const response = await fetch('/speaker-category-heatmap.json');
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden der Heatmap-Daten');
    }
    
    heatmapData.value = await response.json();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unbekannter Fehler';
  } finally {
    loading.value = false;
  }
});

// Watch for data changes to draw heatmap
watch(() => heatmapData.value, (newData) => {
  if (newData) {
    // Use nextTick to ensure DOM is ready
    setTimeout(() => {
      drawHeatmap();
      
      // Add resize observer
      if (containerRef.value) {
        const resizeObserver = new ResizeObserver(() => {
          drawHeatmap();
        });
        resizeObserver.observe(containerRef.value);
      }
    }, 100);
  }
});

const filteredData = computed(() => {
  if (!heatmapData.value) return null;
  
  const topSpeakers = heatmapData.value.speakers.slice(0, settingsStore.topNSpeakersHeatmap);
  const topCategories = (heatmapData.value.categories || [])
    .sort((a, b) => b.totalEpisodes - a.totalEpisodes)
    .slice(0, settingsStore.topNCategoriesHeatmap);
  
  return {
    speakers: topSpeakers,
    categories: topCategories
  };
});

const selectedCellData = computed(() => {
  if (!selectedSpeaker.value || !selectedCategory.value || !heatmapData.value) return null;
  
  const speaker = heatmapData.value.speakers.find(s => s.id === selectedSpeaker.value);
  if (!speaker) return null;
  
  const category = (speaker.categories || []).find(c => c.categoryId === selectedCategory.value);
  const categoryInfo = (heatmapData.value.categories || []).find(c => c.id === selectedCategory.value);
  
  return {
    speakerId: speaker.id,
    speakerName: speaker.name,
    categoryId: selectedCategory.value,
    categoryName: categoryInfo?.name || '',
    categoryDescription: categoryInfo?.description || '',
    count: category?.count || 0,
    episodes: category?.episodes || []
  };
});

const drawHeatmap = () => {
  if (!svgRef.value || !containerRef.value || !filteredData.value) return;
  
  const container = containerRef.value;
  const width = container.clientWidth;
  const { speakers, categories } = filteredData.value;
  
  const margin = { top: 200, right: 40, bottom: 60, left: 200 };
  const cellSize = 40;
  const innerHeight = speakers.length * cellSize;
  const height = innerHeight + margin.top + margin.bottom;
  
  d3.select(svgRef.value).selectAll('*').remove();
  
  const svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height);
  
  const g = svg.append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);
  
  // Prepare data
  const maxValue = d3.max(speakers, s => 
    d3.max((s.categories || []).filter(c => 
      categories.some(cat => cat.id === c.categoryId)
    ), c => c.count)
  ) || 1;
  
  // Color scale
  const colorScale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, maxValue]);
  
  // Draw cells
  speakers.forEach((speaker, i) => {
    categories.forEach((category, j) => {
      const categoryData = (speaker.categories || []).find(c => c.categoryId === category.id);
      const value = categoryData?.count || 0;
      
      g.append('rect')
        .attr('x', j * cellSize)
        .attr('y', i * cellSize)
        .attr('width', cellSize - 1)
        .attr('height', cellSize - 1)
        .attr('fill', value > 0 ? colorScale(value) : '#f0f0f0')
        .attr('stroke', () => {
          if (selectedSpeaker.value === speaker.id && selectedCategory.value === category.id) {
            return '#000';
          }
          return 'white';
        })
        .attr('stroke-width', () => {
          if (selectedSpeaker.value === speaker.id && selectedCategory.value === category.id) {
            return 3;
          }
          return 1;
        })
        .style('cursor', value > 0 ? 'pointer' : 'default')
        .on('click', function() {
          if (value > 0) {
            if (selectedSpeaker.value === speaker.id && selectedCategory.value === category.id) {
              selectedSpeaker.value = null;
              selectedCategory.value = null;
            } else {
              selectedSpeaker.value = speaker.id;
              selectedCategory.value = category.id;
            }
            drawHeatmap();
          }
        })
        .on('mouseover', function(event) {
          if (value > 0) {
            d3.select(this)
              .attr('stroke', '#333')
              .attr('stroke-width', 2);
            
            // Tooltip
            d3.select('body').append('div')
              .attr('class', 'heatmap-tooltip')
              .style('position', 'absolute')
              .style('background', 'rgba(0,0,0,0.9)')
              .style('color', 'white')
              .style('padding', '8px 12px')
              .style('border-radius', '6px')
              .style('font-size', '13px')
              .style('pointer-events', 'none')
              .style('z-index', '1000')
              .html(`
                <div class="font-semibold">${speaker.name}</div>
                <div class="text-xs">${category.name}</div>
                <div class="text-xs mt-1"><strong>${value}</strong> Episoden</div>
              `)
              .style('left', `${event.pageX + 15}px`)
              .style('top', `${event.pageY - 10}px`);
          }
        })
        .on('mouseout', function() {
          if (!(selectedSpeaker.value === speaker.id && selectedCategory.value === category.id)) {
            d3.select(this)
              .attr('stroke', 'white')
              .attr('stroke-width', 1);
          }
          d3.selectAll('.heatmap-tooltip').remove();
        });
      
      // Add text for non-zero values
      if (value > 0) {
        g.append('text')
          .attr('x', j * cellSize + cellSize / 2)
          .attr('y', i * cellSize + cellSize / 2)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .attr('fill', value > maxValue / 2 ? 'white' : '#333')
          .attr('font-size', '11px')
          .attr('font-weight', '600')
          .attr('pointer-events', 'none')
          .text(value);
      }
    });
  });
  
  // Y-axis labels (speakers)
  speakers.forEach((speaker, i) => {
    g.append('text')
      .attr('x', -10)
      .attr('y', i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('fill', selectedSpeaker.value === speaker.id ? '#2563eb' : '#333')
      .attr('font-size', '12px')
      .attr('font-weight', selectedSpeaker.value === speaker.id ? '700' : '400')
      .style('cursor', 'pointer')
      .text(speaker.name)
      .on('click', () => {
        selectedSpeaker.value = selectedSpeaker.value === speaker.id ? null : speaker.id;
        selectedCategory.value = null;
        drawHeatmap();
      });
  });
  
  // X-axis labels (categories)
  categories.forEach((category, j) => {
    g.append('text')
      .attr('x', j * cellSize + cellSize / 2)
      .attr('y', -10)
      .attr('text-anchor', 'start')
      .attr('dominant-baseline', 'middle')
      .attr('fill', selectedCategory.value === category.id ? '#2563eb' : '#333')
      .attr('font-size', '12px')
      .attr('font-weight', selectedCategory.value === category.id ? '700' : '400')
      .attr('transform', `rotate(-45, ${j * cellSize + cellSize / 2}, -10)`)
      .style('cursor', 'pointer')
      .text(category.name)
      .on('click', () => {
        selectedCategory.value = selectedCategory.value === category.id ? null : category.id;
        selectedSpeaker.value = null;
        drawHeatmap();
      });
  });
  
  // Legend
  const legendWidth = 200;
  const legendHeight = 15;
  const legend = svg.append('g')
    .attr('transform', `translate(${margin.left}, ${height - 40})`);
  
  const legendScale = d3.scaleLinear()
    .domain([0, maxValue])
    .range([0, legendWidth]);
  
  const legendAxis = d3.axisBottom(legendScale)
    .ticks(5)
    .tickFormat(d => d3.format('.0f')(d as number));
  
  // Gradient
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient')
    .attr('id', 'legend-gradient');
  
  for (let i = 0; i <= 100; i += 10) {
    gradient.append('stop')
      .attr('offset', `${i}%`)
      .attr('stop-color', colorScale(maxValue * i / 100));
  }
  
  legend.append('rect')
    .attr('width', legendWidth)
    .attr('height', legendHeight)
    .style('fill', 'url(#legend-gradient)');
  
  legend.append('g')
    .attr('transform', `translate(0, ${legendHeight})`)
    .call(legendAxis)
    .selectAll('text')
    .attr('font-size', '11px');
  
  legend.append('text')
    .attr('x', legendWidth + 10)
    .attr('y', legendHeight / 2)
    .attr('dominant-baseline', 'middle')
    .attr('font-size', '12px')
    .text('Episoden');
};

watch([() => settingsStore.topNSpeakersHeatmap, () => settingsStore.topNCategoriesHeatmap], () => {
  selectedSpeaker.value = null;
  selectedCategory.value = null;
  drawHeatmap();
});

watch([selectedSpeaker, selectedCategory], () => {
  drawHeatmap();
});

// Load episode details
const loadEpisodeDetails = async () => {
  if (!selectedCellData.value || loadingEpisodes.value) return;
  
  loadingEpisodes.value = true;
  const newDetails = new Map<number, any>();
  
  const toLoad = selectedCellData.value.episodes.filter(num => !episodeDetails.value.has(num));
  
  for (const episodeNum of toLoad) {
    try {
      const response = await fetch(`/episodes/${episodeNum}.json`);
      if (response.ok) {
        const data = await response.json();
        newDetails.set(episodeNum, data);
      } else {
        newDetails.set(episodeNum, null);
      }
    } catch (e) {
      console.error(`Failed to load episode ${episodeNum}:`, e);
      newDetails.set(episodeNum, null);
    }
  }
  
  episodeDetails.value = new Map([...episodeDetails.value, ...newDetails]);
  loadingEpisodes.value = false;
};

watch(showEpisodeList, (newValue) => {
  if (newValue && selectedCellData.value) {
    loadEpisodeDetails();
  }
});

const formatDuration = (duration: [number, number, number]) => {
  const [hours, minutes, seconds] = duration;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-pink-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600">Lade Heatmap-Daten...</p>
    </div>
  </div>

  <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
    <p class="text-red-800 font-semibold">{{ error }}</p>
  </div>

  <div v-else-if="heatmapData" class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
    <div class="p-6 border-b border-gray-200 bg-gradient-to-r from-pink-50 to-pink-100">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="text-center">
          <div class="text-3xl font-bold text-pink-600">{{ heatmapData.statistics.totalSpeakers }}</div>
          <div class="text-sm text-gray-600 mt-1">Sprecher gesamt</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-pink-600">{{ heatmapData.statistics.totalCategories }}</div>
          <div class="text-sm text-gray-600 mt-1">Kategorien gesamt</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-pink-600">{{ heatmapData.statistics.totalCombinations }}</div>
          <div class="text-sm text-gray-600 mt-1">Kombinationen</div>
        </div>
      </div>
    </div>

    <div class="p-6">
      <!-- Controls -->
      <div class="mb-6 flex gap-6 flex-wrap items-center">
        <label class="text-sm font-medium text-gray-700">
          Anzahl Sprecher:
          <input
            v-model.number="settingsStore.topNSpeakersHeatmap"
            type="range"
            min="5"
            max="30"
            step="1"
            class="ml-2 w-48 slider-pink"
          />
          <span class="ml-2 text-pink-600 font-semibold">{{ settingsStore.topNSpeakersHeatmap }}</span>
        </label>
        
        <label class="text-sm font-medium text-gray-700">
          Anzahl Kategorien:
          <input
            v-model.number="settingsStore.topNCategoriesHeatmap"
            type="range"
            min="5"
            max="12"
            step="1"
            class="ml-2 w-48 slider-pink"
          />
          <span class="ml-2 text-pink-600 font-semibold">{{ settingsStore.topNCategoriesHeatmap }}</span>
        </label>
      </div>

      <!-- Selected Cell Details -->
      <div v-if="selectedCellData && selectedCellData.count > 0" class="mb-6 p-4 bg-pink-50 border border-pink-200 rounded-lg">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="font-semibold text-lg text-pink-900">
              {{ selectedCellData.speakerName }} → {{ selectedCellData.categoryName }}
            </h3>
            <p class="text-sm text-pink-700 mt-1">{{ selectedCellData.categoryDescription }}</p>
            <p class="text-sm text-pink-600 mt-2">
              <strong>{{ selectedCellData.count }}</strong> Episoden in dieser Kombination
            </p>
            
            <div class="mt-3 flex gap-4">
              <button
                @click="showEpisodeList = !showEpisodeList; if (showEpisodeList) showTopicList = false;"
                class="text-sm text-pink-600 hover:text-pink-800 font-semibold underline"
              >
                {{ showEpisodeList ? 'Episoden ausblenden' : `${selectedCellData.episodes.length} Episoden anzeigen` }}
              </button>
            </div>

            <!-- Episode List -->
            <div v-if="showEpisodeList" class="mt-4 bg-white rounded-lg border border-pink-300 overflow-hidden">
              <div v-if="loadingEpisodes" class="p-4 text-center text-gray-600">
                Lade Episoden-Details...
              </div>
              <div v-else class="max-h-96 overflow-y-auto">
                <table class="w-full text-sm">
                  <thead class="bg-pink-100 sticky top-0">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-pink-900">#</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-pink-900">Datum</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-pink-900">Titel</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-pink-900">Dauer</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-pink-900">Sprecher</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-pink-900">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr 
                      v-for="episodeNum in selectedCellData.episodes" 
                      :key="episodeNum"
                      class="border-t border-pink-100 hover:bg-pink-50"
                    >
                      <template v-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum)">
                        <td class="px-3 py-2 text-pink-700 font-mono text-xs">{{ episodeNum }}</td>
                        <td class="px-3 py-2 text-gray-600 whitespace-nowrap">
                          {{ new Date(episodeDetails.get(episodeNum).date).toLocaleDateString('de-DE') }}
                        </td>
                        <td class="px-3 py-2 text-gray-900">{{ episodeDetails.get(episodeNum).title }}</td>
                        <td class="px-3 py-2 text-gray-600 text-xs">
                          {{ formatDuration(episodeDetails.get(episodeNum).duration) }}
                        </td>
                        <td class="px-3 py-2 text-xs">
                          <template v-for="(speaker, idx) in episodeDetails.get(episodeNum).speakers" :key="`${episodeNum}-${idx}`">
                            <span
                              :class="[
                                'inline-block',
                                speaker === selectedCellData?.speakerName 
                                  ? 'font-semibold text-pink-700 bg-pink-100 px-1 rounded' 
                                  : 'text-gray-600'
                              ]"
                            >{{ speaker }}</span><span v-if="(idx as number) < (episodeDetails.get(episodeNum).speakers.length - 1)" class="text-gray-600">, </span>
                          </template>
                        </td>
                        <td class="px-3 py-2">
                          <a 
                            :href="episodeDetails.get(episodeNum).url"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-pink-600 hover:text-pink-800 underline text-xs"
                          >
                            🔗
                          </a>
                        </td>
                      </template>
                      <template v-else-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum) === null">
                        <td colspan="6" class="px-3 py-2 text-gray-400 text-xs">Episode {{ episodeNum }} - Daten nicht verfügbar</td>
                      </template>
                      <template v-else>
                        <td colspan="6" class="px-3 py-2 text-gray-400 text-xs">Lädt...</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <button
            @click="selectedSpeaker = null; selectedCategory = null; showEpisodeList = false;"
            class="text-pink-600 hover:text-pink-800 font-semibold ml-4"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Heatmap -->
      <div ref="containerRef" class="overflow-x-auto">
        <svg ref="svgRef"></svg>
      </div>

      <div class="mt-6 text-sm text-gray-600">
        <p>
          <strong>Interaktion:</strong> Klicke auf eine Zelle, um Details zu Sprecher und Kategorie anzuzeigen.
          Die Zahlen zeigen die Anzahl der Episoden für jede Kombination.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
input[type="range"] {
  accent-color: #6366f1;
}
</style>

