<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import * as d3 from 'd3';
import type { SpeakerRiverData, ProcessedSpeakerData } from '../types';
import { useSettingsStore } from '../stores/settings';

const props = defineProps<{
  data: SpeakerRiverData;
}>();

const settingsStore = useSettingsStore();

const svgRef = ref<SVGSVGElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);
const selectedSpeaker = ref<string | null>(null);
const hoveredSpeaker = ref<string | null>(null);
const dimensions = ref({ width: 1200, height: 600 });
const tooltipRef = ref<HTMLDivElement | null>(null);
const selectedYear = ref<number | null>(null);
const hoveredYear = ref<number | null>(null);

// Prozessiere die Daten
const processedData = computed(() => {
  const speakers: ProcessedSpeakerData[] = [];
  const years = props.data.statistics.years;
  
  console.log('Processing speaker data with speakerFilter:', settingsStore.speakerFilter);
  
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
    .slice(0, settingsStore.speakerFilter);
  
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
    .on('mouseover', function(_event: any, d: any) {
      hoveredSpeaker.value = d.key;
    })
    .on('mousemove', function(event: any, d: any) {
      if (!tooltipRef.value) return;
      
      // Finde das nächste Jahr zum Mauszeiger
      const [mx] = d3.pointer(event);
      const year = Math.round(xScale.invert(mx));
      hoveredYear.value = year;
      const speaker = speakers.find(s => s.id === d.key);
      
      if (speaker) {
        const episodeCount = speaker.yearValues.get(year) || 0;
        const speakerData = props.data.speakers.find(s => s.id === speaker.id);
        const yearData = speakerData?.timeline.find(tl => tl.year === year);
        
        if (episodeCount > 0 && yearData) {
          tooltipRef.value.style.display = 'block';
          tooltipRef.value.style.left = `${event.pageX + 15}px`;
          tooltipRef.value.style.top = `${event.pageY - 10}px`;
          
          const durationHours = yearData.durationHours.toFixed(1);
          
          tooltipRef.value.innerHTML = `
            <div class="font-semibold text-sm mb-1">${speaker.name}</div>
            <div class="text-xs"><strong>Jahr:</strong> ${year}</div>
            <div class="text-xs"><strong>Episoden:</strong> ${episodeCount}</div>
            <div class="text-xs"><strong>Dauer:</strong> ${durationHours}h</div>
          `;
          
          // Highlight the year on X-axis
          if (svgRef.value) {
            d3.select(svgRef.value)
              .selectAll('.x-axis text')
              .attr('fill', (tickYear: any) => tickYear === year ? '#10b981' : '#666')
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
      if (hoveredSpeaker.value === d.key) {
        hoveredSpeaker.value = null;
      }
      hoveredYear.value = null;
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
      const wasSelected = selectedSpeaker.value === d.key;
      selectedSpeaker.value = wasSelected ? null : d.key;
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
watch(() => settingsStore.speakerFilter, () => {
  console.log('speakerFilter changed to:', settingsStore.speakerFilter);
  hoveredSpeaker.value = null; // Clear hover on filter change
  drawRiver();
});

watch(() => settingsStore.normalizedView, () => {
  console.log('normalizedView changed to:', settingsStore.normalizedView);
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
onMounted(() => {
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
      totalEpisodes: 0,
      filteredCount: 0
    };
  }
  
  // Sammle alle Episode-Nummern mit Jahr
  const episodeData: Array<{ number: number; year: number }> = [];
  fullSpeaker.timeline.forEach(tl => {
    tl.episodes.forEach(ep => {
      episodeData.push({ number: ep, year: tl.year });
    });
  });
  
  // Sortiere nach Nummer (neueste zuerst)
  episodeData.sort((a, b) => b.number - a.number);
  
  // Filtere nach ausgewähltem Jahr, falls vorhanden
  const filteredEpisodeData = selectedYear.value 
    ? episodeData.filter(ep => ep.year === selectedYear.value)
    : episodeData;
  
  return {
    ...speaker,
    firstAppearance: fullSpeaker.firstAppearance,
    lastAppearance: fullSpeaker.lastAppearance,
    episodeNumbers: filteredEpisodeData.map(ep => ep.number),
    totalEpisodes: episodeData.length,
    filteredCount: filteredEpisodeData.length
  };
});

const showEpisodeList = ref(false);
const episodeDetails = ref<Map<number, any>>(new Map());
const loadingEpisodes = ref(false);

// Lade Episode-Details
const loadEpisodeDetails = async () => {
  if (!selectedSpeakerInfo.value || loadingEpisodes.value) return;
  
  loadingEpisodes.value = true;
  const newDetails = new Map<number, any>();
  
  // Lade nur Episoden, die noch nicht geladen sind
  const toLoad = selectedSpeakerInfo.value.episodeNumbers.filter(num => !episodeDetails.value.has(num));
  
  for (const episodeNum of toLoad) {
    try {
      const response = await fetch(`/episodes/${episodeNum}.json`);
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

// Watch für selectedYear - reload episodes when filter changes
watch(selectedYear, () => {
  if (showEpisodeList.value && selectedSpeakerInfo.value) {
    loadEpisodeDetails();
  }
});
</script>

<template>
  <div class="speaker-river-container">
    <!-- Tooltip -->
    <div 
      ref="tooltipRef" 
      class="tooltip"
      style="display: none; position: absolute; background: rgba(0, 0, 0, 0.9); color: white; padding: 8px 12px; border-radius: 6px; pointer-events: none; z-index: 1000; font-size: 13px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);"
    ></div>
    
    <div class="controls mb-6">
      <div class="flex items-center gap-4 flex-wrap">
        <label class="m-2 text-sm font-medium text-gray-700">
          Anzahl Sprecher:
          <input
            v-model.number="settingsStore.speakerFilter"
            type="range"
            min="5"
            max="30"
            step="1"
            class="ml-2 w-48 slider-green"
          />
          <span class="ml-2 text-green-600 font-semibold">{{ settingsStore.speakerFilter }}</span>
        </label>
        
        <label class="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
          <input
            v-model="settingsStore.normalizedView"
            type="checkbox"
            class="w-4 h-4 rounded checkbox-green"
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
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Dauer</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Sprecher</th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-green-900">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr 
                      v-for="episodeNum in selectedSpeakerInfo.episodeNumbers" 
                      :key="episodeNum"
                      class="border-t border-green-100 hover:bg-green-50"
                    >
                      <template v-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum)">
                        <td class="px-3 py-2 text-green-700 font-mono text-xs">{{ episodeNum }}</td>
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
                                speaker === selectedSpeakerInfo?.name 
                                  ? 'font-semibold text-green-700 bg-green-100 px-1 rounded' 
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
                            class="text-green-600 hover:text-green-800 underline text-xs"
                          >
                            🔗
                          </a>
                        </td>
                      </template>
                      <template v-else-if="episodeDetails.has(episodeNum) && episodeDetails.get(episodeNum) === null">
                        <td colspan="6" class="px-3 py-2 text-gray-400 text-xs">Episode {{ episodeNum }} - Daten nicht verfügbar (Datei fehlt)</td>
                      </template>
                      <template v-else>
                        <td colspan="6" class="px-3 py-2 text-gray-400 text-xs">Episode {{ episodeNum }} - Lädt...</td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <button
            @click="selectedSpeaker = null; selectedYear = null; showEpisodeList = false;"
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
    
    <div class="mt-6 text-sm text-gray-600">
      <p>
        <strong>Interaktion:</strong> Bewege die Maus über einen Stream oder die Legende, um den Sprecher hervorzuheben. 
        Klicke, um Details anzuzeigen.
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

