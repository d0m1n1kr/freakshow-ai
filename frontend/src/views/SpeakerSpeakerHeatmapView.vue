<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-teal-50 to-teal-100 dark:from-teal-900/20 dark:to-teal-900/30">
      <div v-if="heatmapData" class="grid grid-cols-2 gap-4">
        <div class="text-center">
          <div class="text-3xl font-bold text-teal-600 dark:text-teal-400">{{ heatmapData.statistics.totalSpeakers }}</div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Sprecher insgesamt</p>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-teal-600 dark:text-teal-400">{{ heatmapData.statistics.totalCombinations }}</div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">Kombinationen</p>
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
          <div class="mb-6 flex gap-6 flex-wrap items-center">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Sprecher 1:
              <input
                v-model.number="settingsStore.topNSpeakersSpeaker1Heatmap"
                type="range"
                min="5"
                :max="heatmapData.statistics.totalSpeakers"
                step="1"
                class="ml-2 w-48 slider-teal"
              />
              <span class="ml-2 text-teal-600 dark:text-teal-400 font-semibold">{{ settingsStore.topNSpeakersSpeaker1Heatmap }}</span>
            </label>
            
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Sprecher 2:
              <input
                v-model.number="settingsStore.topNSpeakersSpeaker2Heatmap"
                type="range"
                min="10"
                :max="heatmapData.statistics.totalSpeakers"
                step="1"
                class="ml-2 w-48 slider-teal"
              />
              <span class="ml-2 text-teal-600 dark:text-teal-400 font-semibold">{{ settingsStore.topNSpeakersSpeaker2Heatmap }}</span>
            </label>
          </div>

          <!-- Selected Cell Details -->
          <div v-if="selectedCell" class="mb-6 p-4 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-lg">
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
                  <h3 class="font-semibold text-lg text-teal-900 dark:text-teal-100">
                    {{ selectedCell.speaker1Name }} → {{ selectedCell.speaker2Name }}
                  </h3>
                  <p class="text-sm text-teal-600 dark:text-teal-400 mt-2">
                    <strong>{{ selectedCell.episodes.length }}</strong> Episoden in dieser Kombination
                  </p>
                  
                  <div class="mt-3">
                    <button
                      @click="showEpisodeList = !showEpisodeList"
                      class="text-sm text-teal-600 hover:text-teal-800 dark:text-teal-400 dark:hover:text-teal-300 font-semibold underline"
                    >
                      {{ showEpisodeList ? 'Episoden ausblenden' : `${selectedCell.episodes.length} Episoden anzeigen` }}
                    </button>
                  </div>
                </div>


                <!-- Episode List -->
                <div v-if="showEpisodeList" class="mt-4 bg-white dark:bg-gray-900 rounded-lg border border-teal-300 dark:border-teal-700">
                  <div v-if="loadingEpisodes" class="p-4 text-center text-gray-600 dark:text-gray-400">
                    Lade Episoden-Details...
                  </div>
                  <div v-else class="max-h-96 overflow-auto">
                    <table class="min-w-full w-max text-sm table-auto">
                      <thead class="bg-teal-100 dark:bg-teal-900 sticky top-0">
                        <tr>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100 whitespace-nowrap">#</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100 whitespace-nowrap">Bild</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100 whitespace-nowrap">Datum</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100">Titel</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100 whitespace-nowrap">Dauer</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100 whitespace-nowrap">Sprecher</th>
                          <th class="px-3 py-2 text-left text-xs font-semibold text-teal-900 dark:text-teal-100 whitespace-nowrap">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr 
                          v-for="episodeNum in selectedCell.episodes" 
                          :key="episodeNum"
                          class="border-t border-teal-100 dark:border-teal-800 hover:bg-teal-50 dark:hover:bg-teal-900/50"
                        >
                          <template v-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum) !== null">
                            <td class="px-3 py-2 text-teal-700 dark:text-teal-300 text-xs whitespace-nowrap">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  @click="playEpisodeAt(episodeNum, 0, 'Start')"
                                  title="Episode von Anfang abspielen"
                                  aria-label="Episode von Anfang abspielen"
                                >
                                  ▶︎
                                </button>
                                <span class="font-mono">{{ episodeNum }}</span>
                              </div>
                            </td>
                            <td class="px-3 py-2">
                              <img
                                :src="getEpisodeImageUrl(episodeNum)"
                                :alt="episodeDetails.get(episodeNum)?.title || `Episode ${episodeNum}`"
                                @error="($event.target as HTMLImageElement).style.display = 'none'"
                                class="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-700"
                              />
                            </td>
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
                                    speaker === selectedCell?.speaker1Name || speaker === selectedCell?.speaker2Name
                                      ? 'font-semibold text-teal-700 dark:text-teal-300 bg-teal-100 dark:bg-teal-900/30 px-1 rounded' 
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
                                class="text-teal-600 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 text-xs underline"
                              >
                                🔗
                              </a>
                            </td>
                          </template>
                          <template v-else-if="episodeDetails.get(episodeNum) === null">
                            <td class="px-3 py-2 text-teal-700 dark:text-teal-300 text-xs whitespace-nowrap">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  @click="playEpisodeAt(episodeNum, 0, 'Start')"
                                  title="Episode von Anfang abspielen"
                                  aria-label="Episode von Anfang abspielen"
                                >
                                  ▶︎
                                </button>
                                <span class="font-mono">{{ episodeNum }}</span>
                              </div>
                            </td>
                            <td class="px-3 py-2">
                              <img
                                :src="getEpisodeImageUrl(episodeNum)"
                                :alt="`Episode ${episodeNum}`"
                                @error="($event.target as HTMLImageElement).style.display = 'none'"
                                class="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-700"
                              />
                            </td>
                            <td colspan="4" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs italic">
                              Details nicht verfügbar
                            </td>
                          </template>
                          <template v-else>
                            <td class="px-3 py-2 text-teal-700 dark:text-teal-300 text-xs whitespace-nowrap">
                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  class="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  @click="playEpisodeAt(episodeNum, 0, 'Start')"
                                  title="Episode von Anfang abspielen"
                                  aria-label="Episode von Anfang abspielen"
                                >
                                  ▶︎
                                </button>
                                <span class="font-mono">{{ episodeNum }}</span>
                              </div>
                            </td>
                            <td class="px-3 py-2">
                              <img
                                :src="getEpisodeImageUrl(episodeNum)"
                                :alt="`Episode ${episodeNum}`"
                                @error="($event.target as HTMLImageElement).style.display = 'none'"
                                class="w-12 h-12 rounded object-cover border border-gray-200 dark:border-gray-700"
                              />
                            </td>
                            <td colspan="4" class="px-3 py-2 text-gray-400 dark:text-gray-500 text-xs">
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
import { ref, onMounted, computed, watch, reactive } from 'vue';
import * as d3 from 'd3';
import type { HeatmapData } from '../types';
import { useSettingsStore } from '../stores/settings';
import { useAudioPlayerStore } from '@/stores/audioPlayer';
import { getPodcastFileUrl, getSpeakerMetaUrl, getEpisodeUrl, getSpeakersBaseUrl, getEpisodeImageUrl } from '@/composables/usePodcast';
import { useInlineEpisodePlayer } from '@/composables/useInlineEpisodePlayer';

const settingsStore = useSettingsStore();
const audioPlayerStore = useAudioPlayerStore();
const inlinePlayer = reactive(useInlineEpisodePlayer());

// Helper function to play episode using global store
const playEpisodeAt = async (episodeNumber: number, seconds: number, label: string) => {
  await inlinePlayer.ensureMp3Index();
  const mp3 = inlinePlayer.mp3UrlByEpisode.get(episodeNumber) || null;
  if (!mp3) {
    await inlinePlayer.openEpisodeAt(episodeNumber, seconds);
    return;
  }

  const withBase = (p: string) => {
    const base = (import.meta as any)?.env?.BASE_URL || '/';
    const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
    const rel = String(p).replace(/^\/+/, '');
    return `${b}${rel}`;
  };

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

interface EpisodeDetail {
  title: string;
  date: string;
  duration?: string | number;
  speakers?: string[];
  url?: string;
}

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
  if (!heatmapData.value) return;
  const speakerNames = new Set<string>();
  heatmapData.value.speakers.forEach(s => speakerNames.add(s.name));
  const promises = Array.from(speakerNames).map(name => loadSpeakerMeta(name));
  await Promise.all(promises);
};

const heatmapData = ref<HeatmapData | null>(null);
const svgElement = ref<SVGSVGElement | null>(null);
const heatmapContainer = ref<HTMLDivElement | null>(null);

type HeatmapFocus = { type: 'row'; id: string } | { type: 'col'; id: string } | null;
const activeHeatmapFocus = ref<HeatmapFocus>(null);

const selectedCell = ref<{
  speaker1Name: string;
  speaker2Name: string;
  count: number;
  episodes: number[];
} | null>(null);

const showEpisodeList = ref(false);
const loadingEpisodes = ref(false);

const episodeDetails = ref<Map<number, EpisodeDetail | null>>(new Map());

// Filtered data based on slider values
const filteredData = computed(() => {
  if (!heatmapData.value) return { speakers1: [], speakers2: [] };
  
  // Get top N speakers for axis 1 (already sorted by episodes in the data)
  const speakers1 = heatmapData.value.speakers.slice(0, settingsStore.topNSpeakersSpeaker1Heatmap);
  
  // Get top N speakers for axis 2 (already sorted by episodes in the data)
  const speakers2 = heatmapData.value.speakers.slice(0, settingsStore.topNSpeakersSpeaker2Heatmap);
  
  return { speakers1, speakers2 };
});

const filteredMatrix = computed(() => {
  if (!heatmapData.value) return [];
  
  const { speakers1, speakers2 } = filteredData.value;
  const speaker1Ids = new Set(speakers1.map(s => s.id));
  const speaker2Ids = new Set(speakers2.map(s => s.id));
  
  // Filter matrix by selected speakers
  let matrix = heatmapData.value.matrix.filter(row => row.speakerId && speaker1Ids.has(row.speakerId));
  
  // Filter values by selected speakers
  matrix = matrix.map(row => ({
    ...row,
    values: row.values.filter(val => val.speakerId && speaker2Ids.has(val.speakerId))
  }));
  
  return matrix;
});

const filteredSpeakers2 = computed(() => {
  return filteredData.value.speakers2;
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
      const response = await fetch(getEpisodeUrl(num));
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
  const speakers2 = filteredSpeakers2.value;

  if (matrix.length === 0 || speakers2.length === 0) {
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
  
  const cellSize = Math.min(30, Math.max(10, containerWidth / (speakers2.length + 10)));
  const margin = isMobile
    ? { top: 80, right: 10, bottom: 20, left: 60 }
    : isTablet
    ? { top: 120, right: 15, bottom: 20, left: 100 }
    : { top: 180, right: 20, bottom: 20, left: 200 };
  const width = speakers2.length * cellSize;
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
  let colorScale = d3.scaleSequential(d3.interpolateBuGn).domain(currentDomain);

  function getEmptyCellColor() {
    const isDark = document.documentElement.classList.contains('dark');
    return isDark ? '#1f2937' : '#f0f0f0';
  }

  function getTextColorForCount(count: number): string {
    const color = d3.rgb(colorScale(count));
    const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
    return luminance > 0.5 ? '#1f2937' : 'white';
  }

  function getRowDomain(rowId: string): [number, number] {
    const row = matrix.find(r => (r.speakerId || '') === rowId);
    if (!row) return globalDomain;
    const counts = row.values.map(v => v.count).filter(c => c > 0);
    if (counts.length === 0) return globalDomain;
    return normalizeDomain(d3.min(counts) ?? 0, d3.max(counts) ?? 0);
  }

  function getColDomain(colId: string): [number, number] {
    const counts = matrix
      .flatMap(r => r.values)
      .filter(v => (v.speakerId || '') === colId)
      .map(v => v.count)
      .filter(c => c > 0);
    if (counts.length === 0) return globalDomain;
    return normalizeDomain(d3.min(counts) ?? 0, d3.max(counts) ?? 0);
  }

  // X axis (speakers on x-axis)
  const xScale = d3.scaleBand()
    .domain(speakers2.map(s => s.id))
    .range([0, width])
    .padding(0.05);

  // Y axis (speakers on y-axis)
  const yScale = d3.scaleBand()
    .domain(matrix.map(row => row.speakerId || '').filter(id => id))
    .range([0, height])
    .padding(0.05);

  // Draw cells
  matrix.forEach((row) => {
    if (!row.speakerId) return;
    row.values.forEach((value) => {
      if (!value.speakerId) return;
      
      const x = xScale(value.speakerId);
      const y = yScale(row.speakerId || '');
      
      if (x === undefined || y === undefined) return;

      const cellGroup = g.append('g')
        .attr('class', 'cell-group')
        .style('cursor', value.count > 0 ? 'pointer' : 'default');

      const rowId = row.speakerId || '';
      const colId = value.speakerId || '';

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

          // Remove any existing tooltips first
          d3.selectAll('.heatmap-tooltip').remove();

          // Get speaker images
          const speaker1Meta = speakersMeta.value.get(row.speaker1Name || row.speakerName || '');
          const speaker2Meta = speakersMeta.value.get(value.speaker2Name || '');
          
          const speaker1ImageHtml = speaker1Meta?.image
            ? `<img src="${speaker1Meta.image}" alt="${row.speaker1Name}" class="w-8 h-8 rounded-full border-2 border-white inline-block mr-2" />`
            : '';
          const speaker2ImageHtml = speaker2Meta?.image
            ? `<img src="${speaker2Meta.image}" alt="${value.speaker2Name}" class="w-8 h-8 rounded-full border-2 border-white inline-block mr-2" />`
            : '';

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
              <div>${speaker1ImageHtml}<strong>${row.speaker1Name}</strong></div>
              <div class="mt-1">${speaker2ImageHtml}${value.speaker2Name}</div>
              <div class="mt-1">${value.count} Episoden</div>
            `)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px');
        })
        .on('mouseout', function() {
          d3.select(this)
            .attr('stroke', 'none')
            .attr('stroke-width', 0);

          // Remove tooltip
          d3.selectAll('.heatmap-tooltip').remove();
        })
        .on('click', function() {
          if (value.count === 0) return;
          
          // Remove tooltip on click
          d3.selectAll('.heatmap-tooltip').remove();
          
          selectedCell.value = {
            speaker1Name: row.speaker1Name || row.speakerName || '',
            speaker2Name: value.speaker2Name || '',
            count: value.count,
            episodes: value.episodes
          };
        });

      // Add text for non-zero values
      if (value.count > 0 && cellSize > 15) {
        const textColor = getTextColorForCount(value.count);
        
        cellGroup.append('text')
          .attr('class', 'heatmap-cell-text')
          .attr('data-row-id', rowId)
          .attr('data-col-id', colId)
          .attr('data-count', String(value.count))
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

  // X axis labels (speakers on x-axis)
  const labelFontSize = isMobile ? '8px' : isTablet ? '9px' : '11px';
  
  const xLabels = g.append('g')
    .selectAll('text')
    .data(speakers2)
    .enter()
    .append('text')
    .attr('x', d => (xScale(d.id) || 0) + xScale.bandwidth() / 2)
    .attr('y', -10)
    .attr('text-anchor', 'start')
    .attr('transform', d => {
      const x = (xScale(d.id) || 0) + xScale.bandwidth() / 2;
      return `rotate(-65 ${x} -10)`;
    })
    .attr('font-size', labelFontSize)
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .style('cursor', 'pointer')
    .text(d => {
      const name = d.name;
      if (isMobile && name.length > 10) {
        return name.substring(0, 9) + '…';
      } else if (isTablet && name.length > 15) {
        return name.substring(0, 14) + '…';
      }
      return name;
    });

  xLabels.append('title').text(d => d.name);

  // Y axis labels (speakers on y-axis)
  const yLabelFontSize = isMobile ? '8px' : isTablet ? '9px' : '10px';
  
  const yLabels = g.append('g')
    .selectAll('text')
    .data(matrix)
    .enter()
    .append('text')
    .attr('x', -5)
    .attr('y', d => (yScale(d.speakerId || '') || 0) + yScale.bandwidth() / 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', yLabelFontSize)
    .attr('class', 'fill-gray-700 dark:fill-gray-300')
    .style('cursor', 'pointer')
    .text(d => {
      const name = d.speaker1Name || d.speakerName || '';
      if (isMobile && name.length > 10) {
        return name.substring(0, 9) + '…';
      } else if (isTablet && name.length > 15) {
        return name.substring(0, 14) + '…';
      }
      return name;
    });

  yLabels.append('title').text(d => d.speaker1Name || d.speakerName || '');

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

  // Create gradient
  const defs = svg.append('defs');
  const gradientId = 'legend-gradient-speaker-speaker';
  const gradient = defs.append('linearGradient')
    .attr('id', gradientId);

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
    .call(legendAxis);

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
    colorScale = d3.scaleSequential(d3.interpolateBuGn).domain(currentDomain);

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
        if (count <= 0) return getTextColorForCount(0);
        if (!focus) return getTextColorForCount(count);
        const rowId = el.getAttribute('data-row-id') || '';
        const colId = el.getAttribute('data-col-id') || '';
        const isFocused = focus.type === 'row' ? rowId === focus.id : colId === focus.id;
        return isFocused ? getTextColorForCount(count) : '#6b7280';
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
      yLabels.attr('opacity', d => ((d.speakerId || '') === focus.id ? 1 : 0.25));
      xLabels.attr('opacity', 1);
    } else if (focus?.type === 'col') {
      xLabels.attr('opacity', d => (d.id === focus.id ? 1 : 0.25));
      yLabels.attr('opacity', 1);
    } else {
      xLabels.attr('opacity', 1);
      yLabels.attr('opacity', 1);
    }

    xLabels
      .style('font-weight', d => (focus?.type === 'col' && d.id === focus.id ? '700' : '400'))
      .style('text-decoration', d => (focus?.type === 'col' && d.id === focus.id ? 'underline' : null));
    yLabels
      .style('font-weight', d => (focus?.type === 'row' && (d.speakerId || '') === focus.id ? '700' : '400'))
      .style('text-decoration', d => (focus?.type === 'row' && (d.speakerId || '') === focus.id ? 'underline' : null));

    legendScale.domain(currentDomain);
    legendAxisG.call(legendAxis);
    gradient.selectAll('stop')
      .attr('stop-color', d => colorScale(currentDomain[0] + (d as number) * (currentDomain[1] - currentDomain[0])));
  }

  // Click labels to select/deselect focus; focus persists across redraws
  xLabels.on('click', (_event, d) => {
    const current = activeHeatmapFocus.value;
    const next: HeatmapFocus = current?.type === 'col' && current.id === d.id ? null : { type: 'col', id: d.id };
    activeHeatmapFocus.value = next;
    applyDomain(next ? getColDomain(next.id) : globalDomain, next);
  });

  yLabels.on('click', (_event, d) => {
    const rowId = d.speakerId || '';
    const current = activeHeatmapFocus.value;
    const next: HeatmapFocus = current?.type === 'row' && current.id === rowId ? null : { type: 'row', id: rowId };
    activeHeatmapFocus.value = next;
    applyDomain(next ? getRowDomain(next.id) : globalDomain, next);
  });

  // Re-apply persisted focus (if any)
  const persisted = activeHeatmapFocus.value;
  if (persisted?.type === 'col') applyDomain(getColDomain(persisted.id), persisted);
  else if (persisted?.type === 'row') applyDomain(getRowDomain(persisted.id), persisted);
}

// Load data on mount
onMounted(async () => {
  try {
    const response = await fetch(getPodcastFileUrl('speaker-speaker-heatmap.json'));
    heatmapData.value = await response.json();
    // Load speaker metadata for images
    await loadAllSpeakerMeta();
  } catch (error) {
    console.error('Failed to load heatmap data:', error);
  }
});

// Watch for podcast changes and reload data
watch(() => settingsStore.selectedPodcast, async () => {
  try {
    const response = await fetch(getPodcastFileUrl('speaker-speaker-heatmap.json'));
    heatmapData.value = await response.json();
    // Load speaker metadata for images
    await loadAllSpeakerMeta();
    if (heatmapData.value) {
      drawHeatmap();
    }
  } catch (error) {
    console.error('Failed to load heatmap data:', error);
  }
});

// Watch for data changes and redraw
watch([heatmapData, filteredMatrix, filteredSpeakers2, () => settingsStore.isDarkMode], () => {
  if (heatmapData.value) {
    drawHeatmap();
  }
});

// Clear selection when slider values change
watch([() => settingsStore.topNSpeakers1Heatmap, () => settingsStore.topNSpeakers2Heatmap], () => {
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

