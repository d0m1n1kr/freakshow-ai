<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, computed } from 'vue';
import * as d3 from 'd3';
import { useSettingsStore } from '@/stores/settings';
import { getPodcastFileUrl, getSpeakerMetaUrl } from '@/composables/usePodcast';

type SpeakerStats = {
  v: number;
  episode: number;
  episodeDurationSec: number;
  speakers: string[];
  speakerStats: Record<string, {
    overall: {
      totalSpeakingTimeSec: number;
      speakingShare: number;
    };
    temporal: Array<{
      intervalStartSec: number;
      intervalEndSec: number;
      totalSpeakingTimeSec: number;
      speakingShare: number;
    }>;
  }>;
};

type EpisodeTopics = {
  episodeNumber: number;
  topics: Array<{
    topic: string;
    positionSec?: number;
    durationSec?: number;
  }>;
};

type SpeakerMeta = {
  name: string;
  slug: string;
  image?: string;
};

const props = defineProps<{
  data: SpeakerStats;
  episodeTopics?: EpisodeTopics | null;
  episodeNumber?: number;
}>();

const emit = defineEmits<{
  (e: 'play-at-time', timeSec: number): void;
}>();

const settingsStore = useSettingsStore();
const chartRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);
let svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null = null;
let resizeObserver: ResizeObserver | null = null;

// Transcript data for finding speaker segments
type TranscriptData = {
  v: number;
  speakers: string[];
  t: number[]; // timestamps in seconds
  s: number[]; // speaker indices
  x: string[]; // text
};

const transcriptData = ref<TranscriptData | null>(null);
const transcriptLoading = ref(false);

const speakersMeta = ref<Map<string, SpeakerMeta>>(new Map());

// Load transcript data
const loadTranscript = async () => {
  if (!props.episodeNumber || transcriptData.value || transcriptLoading.value) return;
  
  transcriptLoading.value = true;
  try {
    const withBase = (p: string) => {
      const base = (import.meta as any)?.env?.BASE_URL || '/';
      const b = String(base).endsWith('/') ? String(base) : `${String(base)}/`;
      const rel = String(p).replace(/^\/+/, '');
      return `${b}${rel}`;
    };
    
    const transcriptUrl = withBase(getPodcastFileUrl(`episodes/${props.episodeNumber}-ts-live.json`));
    const response = await fetch(transcriptUrl, { cache: 'force-cache' });
    if (response.ok) {
      transcriptData.value = await response.json();
    }
  } catch (e) {
    console.error('Failed to load transcript:', e);
  } finally {
    transcriptLoading.value = false;
  }
};

// Find the next segment start time for a speaker after a given timestamp
const findNextSegmentStart = (speaker: string, afterTimeSec: number): number | null => {
  if (!transcriptData.value) return null;
  
  const speakerIndex = transcriptData.value.speakers.indexOf(speaker);
  if (speakerIndex < 0) return null;
  
  // Search for the next segment of this speaker after the timestamp
  // Look within a window of ±2 minutes (120 seconds) around the clicked time
  const searchWindow = 120; // 2 minutes
  const minTime = Math.max(0, afterTimeSec - searchWindow);
  const maxTime = afterTimeSec + searchWindow;
  
  // Find all segments of this speaker in the search window
  const segments: Array<{ time: number; index: number }> = [];
  for (let i = 0; i < transcriptData.value.t.length; i++) {
    const time = transcriptData.value.t[i];
    const speakerIdx = transcriptData.value.s[i];
    
    if (speakerIdx === speakerIndex && time >= minTime && time <= maxTime) {
      segments.push({ time, index: i });
    }
  }
  
  if (segments.length === 0) return null;
  
  // Find the segment that is closest to the clicked time (prefer segments after, but use closest)
  let bestSegment: { time: number; index: number } | null = null;
  let bestDistance = Infinity;
  
  for (const seg of segments) {
    const distance = Math.abs(seg.time - afterTimeSec);
    
    if (seg.time >= afterTimeSec) {
      // Segment starts after clicked time - prefer this
      if (distance < bestDistance) {
        bestDistance = distance;
        bestSegment = seg;
      }
    } else {
      // Segment starts before clicked time - only use if no segment after exists
      if (bestSegment === null || bestSegment.time < afterTimeSec) {
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSegment = seg;
        }
      }
    }
  }
  
  // Return the start time of the segment (always start at the beginning of the segment)
  return bestSegment ? bestSegment.time : null;
};

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
    await loadSpeakerMeta(speaker);
  }
};

// Get topics for a time interval
const getTopicsForInterval = (startSec: number, endSec: number): string[] => {
  if (!props.episodeTopics?.topics) return [];
  
  const matchingTopics = props.episodeTopics.topics
    .filter(topic => {
      const topicStart = topic.positionSec;
      if (topicStart === undefined || topicStart === null) return false;
      
      // Calculate topic end time (start + duration)
      const topicDuration = topic.durationSec || 0;
      const topicEnd = topicStart + topicDuration;
      
      // Topic overlaps interval if: topic starts before interval ends AND topic ends after interval starts
      const overlaps = topicStart < endSec && topicEnd > startSec;
      
      return overlaps;
    })
    .map(topic => topic.topic)
    .filter(topic => topic && topic.trim().length > 0)
    .slice(0, 5); // Limit to 5 topics
  
  return matchingTopics;
};

const colors = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // orange
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
];

const drawChart = () => {
  if (!chartRef.value || !props.data || !tooltipRef.value) return;

  // Clear previous chart
  d3.select(chartRef.value).selectAll('*').remove();
  
  // Ensure tooltip is hidden initially
  if (tooltipRef.value) {
    tooltipRef.value.style.display = 'none';
  }
  
  // Detect dark mode dynamically
  const isDarkMode = document.documentElement.classList.contains('dark') || 
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const container = chartRef.value;
  const width = container.clientWidth;
  const height = Math.max(400, Math.min(600, width * 0.6));
  const margin = { top: 20, right: 20, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  svg = d3
    .select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const g = svg
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  // Prepare data: combine all temporal intervals
  const speakers = props.data.speakers;
  const intervals: Array<{
    start: number;
    end: number;
    speakers: Record<string, number>;
  }> = [];

  // Collect all intervals - use interval start as key
  const intervalMap = new Map<number, Record<string, number>>();
  
  for (const speaker of speakers) {
    const stats = props.data.speakerStats[speaker];
    if (!stats) continue;
    
    for (const interval of stats.temporal) {
      const start = interval.intervalStartSec;
      const share = interval.speakingShare;
      
      if (!intervalMap.has(start)) {
        intervalMap.set(start, {});
      }
      intervalMap.get(start)![speaker] = share;
    }
  }

  // Convert to array and sort
  for (const [start, shares] of intervalMap.entries()) {
    const end = Math.min(
      start + 600,
      props.data.episodeDurationSec
    );
    intervals.push({ start, end, speakers: shares });
  }

  intervals.sort((a, b) => a.start - b.start);
  
  // Fill gaps with zero shares
  const filledIntervals: typeof intervals = [];
  let lastEnd = 0;
  for (const interval of intervals) {
    if (interval.start > lastEnd) {
      // Add gap interval
      filledIntervals.push({
        start: lastEnd,
        end: interval.start,
        speakers: Object.fromEntries(speakers.map(s => [s, 0])),
      });
    }
    filledIntervals.push(interval);
    lastEnd = interval.end;
  }
  
  // Add final gap if needed
  if (lastEnd < props.data.episodeDurationSec) {
    filledIntervals.push({
      start: lastEnd,
      end: props.data.episodeDurationSec,
      speakers: Object.fromEntries(speakers.map(s => [s, 0])),
    });
  }

  // Create stacked data - need to properly stack shares
  const stackedData: Array<{
    x: number;
    [speaker: string]: number;
  }> = [];

  for (const interval of filledIntervals) {
    const x = (interval.start + interval.end) / 2;
    const entry: any = { x };
    let cumulative = 0;
    
    for (const speaker of speakers) {
      const share = interval.speakers[speaker] || 0;
      entry[`${speaker}_bottom`] = cumulative;
      entry[`${speaker}_top`] = cumulative + share;
      cumulative += share;
    }
    
    stackedData.push(entry);
  }

  // Scales
  const xScale = d3
    .scaleLinear()
    .domain([0, props.data.episodeDurationSec])
    .range([0, innerWidth]);

  const yScale = d3
    .scaleLinear()
    .domain([0, 1])
    .range([innerHeight, 0]);

  // Color scale
  const colorScale = d3
    .scaleOrdinal<string>()
    .domain(speakers)
    .range(colors);

  // Area generator
  const area = d3
    .area<{ x: number; [key: string]: number | string }>()
    .x((d) => xScale(d.x as number))
    .y0((d, i) => {
      const prevSpeaker = i > 0 ? speakers[i - 1] : null;
      if (prevSpeaker) {
        return yScale((d[prevSpeaker] as number) + (d[speakers[i]] as number));
      }
      return yScale(d[speakers[i]] as number);
    })
    .y1((d) => {
      const speaker = speakers[stackedData.indexOf(d)];
      return yScale((d[speaker] as number) || 0);
    })
    .curve(d3.curveMonotoneX);

  // Helper function to format time
  function formatTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Create invisible overlay for tooltip interaction (must be added AFTER paths so it's on top)
  // We'll add it after creating all paths

  // Create areas for each speaker
  for (const speaker of speakers) {
    const speakerData = stackedData.map((d) => ({
      x: d.x as number,
      y0: d[`${speaker}_bottom`] as number,
      y1: d[`${speaker}_top`] as number,
    }));

    g.append('path')
      .datum(speakerData)
      .attr('fill', colorScale(speaker))
      .attr('fill-opacity', 0.7)
      .attr('stroke', colorScale(speaker))
      .attr('stroke-width', 1)
      .attr('d', d3
        .area<{ x: number; y0: number; y1: number }>()
        .x((d) => xScale(d.x))
        .y0((d) => yScale(d.y0))
        .y1((d) => yScale(d.y1))
        .curve(d3.curveMonotoneX)
      )
      .style('pointer-events', 'none'); // Disable pointer events on paths, use overlay instead
  }

  // Create invisible overlay for tooltip interaction (must be added AFTER paths so it's on top)
  const overlay = g.append('rect')
    .attr('width', innerWidth)
    .attr('height', innerHeight)
    .attr('fill', 'transparent')
    .style('cursor', 'pointer')
    .on('click', function(event: MouseEvent) {
      if (!props.episodeNumber) return;
      
      const [mx, my] = d3.pointer(event, g.node() as any);
      const clickedTimeSec = Math.max(0, Math.min(props.data.episodeDurationSec, xScale.invert(mx)));
      const shareValue = Math.max(0, Math.min(1, yScale.invert(my)));
      
      // Find which speaker was clicked
      let clickedSpeaker: string | null = null;
      
      // Find the interval that contains this time
      let intervalIdx = -1;
      for (let i = 0; i < filledIntervals.length; i++) {
        const interval = filledIntervals[i];
        if (clickedTimeSec >= interval.start && clickedTimeSec < interval.end) {
          intervalIdx = i;
          break;
        }
      }
      
      if (intervalIdx >= 0 && intervalIdx < filledIntervals.length) {
        const interval = filledIntervals[intervalIdx];
        
        // Find which speaker's area was clicked
        let cumulative = 0;
        for (const speaker of speakers) {
          const share = interval.speakers[speaker] || 0;
          const bottom = cumulative;
          const top = cumulative + share;
          
          if (shareValue >= bottom && shareValue <= top && share > 0) {
            clickedSpeaker = speaker;
            break;
          }
          
          cumulative = top;
        }
      }
      
      // If we found a speaker, find their next segment start
      let playTimeSec = clickedTimeSec;
      if (clickedSpeaker && transcriptData.value) {
        const nextSegmentStart = findNextSegmentStart(clickedSpeaker, clickedTimeSec);
        if (nextSegmentStart !== null) {
          playTimeSec = nextSegmentStart;
        }
      }
      
      // Emit play event with the calculated time
      emit('play-at-time', playTimeSec);
    })
    .on('mousemove', function(event: MouseEvent) {
      if (!tooltipRef.value || !chartRef.value) return;
      
      const [mx, my] = d3.pointer(event, g.node() as any);
      const timeSec = Math.max(0, Math.min(props.data.episodeDurationSec, xScale.invert(mx)));
      const shareValue = Math.max(0, Math.min(1, yScale.invert(my)));
      
      // Find the interval that contains this time
      let intervalIdx = -1;
      for (let i = 0; i < filledIntervals.length; i++) {
        const interval = filledIntervals[i];
        if (timeSec >= interval.start && timeSec < interval.end) {
          intervalIdx = i;
          break;
        }
      }
      
      if (intervalIdx >= 0 && intervalIdx < filledIntervals.length) {
        const interval = filledIntervals[intervalIdx];
        
        // Find which speaker's area we're hovering over
        let cumulative = 0;
        let hoveredSpeaker: string | null = null;
        let speakerShare = 0;
        
        for (const speaker of speakers) {
          const share = interval.speakers[speaker] || 0;
          const bottom = cumulative;
          const top = cumulative + share;
          
          if (shareValue >= bottom && shareValue <= top && share > 0) {
            hoveredSpeaker = speaker;
            speakerShare = share;
            break;
          }
          
          cumulative = top;
        }
        
        if (hoveredSpeaker && tooltipRef.value) {
          const speakerMeta = speakersMeta.value.get(hoveredSpeaker);
          const topics = getTopicsForInterval(interval.start, interval.end);
          
          const imageHtml = speakerMeta?.image
            ? `<img src="${speakerMeta.image}" alt="${hoveredSpeaker}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: inline-block; margin-right: 8px;" />`
            : '';
          
          const borderColor = isDarkMode ? '#374151' : '#e5e7eb';
          const labelColor = isDarkMode ? '#9ca3af' : '#4b5563';
          const topicBgColor = isDarkMode ? 'rgba(30, 58, 138, 0.3)' : '#dbeafe';
          const topicTextColor = isDarkMode ? '#93c5fd' : '#1e40af';
          
          const topicsHtml = topics.length > 0
            ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
                 <div style="font-size: 11px; font-weight: 600; color: ${labelColor}; margin-bottom: 4px;">Topics:</div>
                 <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                   ${topics.map(topic => `<span style="padding: 2px 8px; font-size: 11px; background-color: ${topicBgColor}; color: ${topicTextColor}; border-radius: 4px;">${topic}</span>`).join('')}
                 </div>
               </div>`
            : '';
          
          // Get correct mouse position - use the actual event coordinates
          const rect = chartRef.value.getBoundingClientRect();
          const mouseX = event.clientX || (event as any).pageX || 0;
          const mouseY = event.clientY || (event as any).pageY || 0;
          
          tooltipRef.value.style.display = 'block';
          tooltipRef.value.style.position = 'fixed';
          tooltipRef.value.style.left = `${mouseX + 15}px`;
          tooltipRef.value.style.top = `${mouseY - 10}px`;
          tooltipRef.value.style.zIndex = '1000';
          tooltipRef.value.style.backgroundColor = isDarkMode ? '#1f2937' : 'white';
          tooltipRef.value.style.color = isDarkMode ? '#f3f4f6' : '#111827';
          tooltipRef.value.style.borderColor = isDarkMode ? '#374151' : '#e5e7eb';
          
          tooltipRef.value.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              ${imageHtml}
              <div style="font-weight: 600; font-size: 14px; color: ${isDarkMode ? '#f3f4f6' : '#111827'};">${hoveredSpeaker}</div>
            </div>
            <div style="font-size: 12px; color: ${isDarkMode ? '#9ca3af' : '#4b5563'};">
              <div><strong>Time:</strong> ${formatTime(interval.start)} - ${formatTime(interval.end)}</div>
              <div><strong>Share:</strong> ${(speakerShare * 100).toFixed(1)}%</div>
            </div>
            ${topicsHtml}
            ${props.episodeNumber ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
              <div style="font-size: 11px; color: ${labelColor}; font-style: italic;">Klicken zum Abspielen</div>
            </div>` : ''}
          `;
        } else if (tooltipRef.value) {
          tooltipRef.value.style.display = 'none';
        }
      } else if (tooltipRef.value) {
        tooltipRef.value.style.display = 'none';
      }
    })
    .on('mouseout', function() {
      if (tooltipRef.value) {
        tooltipRef.value.style.display = 'none';
      }
    });

  // X axis
  const xAxis = d3.axisBottom(xScale).tickFormat((d) => {
    const sec = Number(d);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
    return `${m}`;
  });

  // Use detected dark mode
  const labelColor = isDarkMode ? '#d1d5db' : '#4b5563'; // gray-300 for dark, gray-600 for light

  g.append('g')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll('text')
    .style('fill', labelColor)
    .style('font-size', '12px');

  g.append('text')
    .attr('x', innerWidth / 2)
    .attr('y', innerHeight + 45)
    .attr('text-anchor', 'middle')
    .style('fill', labelColor)
    .style('font-size', '14px')
    .style('font-weight', '500')
    .text('Time');

  // Y axis
  const yAxis = d3.axisLeft(yScale).tickFormat(d3.format('.0%'));

  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .style('fill', labelColor)
    .style('font-size', '12px');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -45)
    .attr('x', -innerHeight / 2)
    .attr('text-anchor', 'middle')
    .style('fill', labelColor)
    .style('font-size', '14px')
    .style('font-weight', '500')
    .text('Speaking Share');

  // Legend
  const legend = g
    .append('g')
    .attr('transform', `translate(${innerWidth - 150}, 20)`);

  speakers.forEach((speaker, i) => {
    const legendRow = legend
      .append('g')
      .attr('transform', `translate(0, ${i * 25})`);

    legendRow
      .append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', colorScale(speaker))
      .attr('fill-opacity', 0.7)
      .attr('stroke', colorScale(speaker));

    const legendTextColor = isDarkMode ? '#e5e7eb' : '#374151'; // gray-200 for dark, gray-700 for light
    
    legendRow
      .append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('fill', legendTextColor)
      .style('font-size', '12px')
      .text(speaker.length > 20 ? speaker.substring(0, 17) + '...' : speaker);
  });
};

onMounted(() => {
  // Load transcript data if episode number is available
  if (props.episodeNumber) {
    loadTranscript();
  }
  
  // Wait for next tick to ensure tooltipRef is available
  setTimeout(() => {
    loadAllSpeakerMeta().then(() => {
      drawChart();
    });
  }, 0);

  // Watch for data changes
  watch(() => props.data, () => {
    if (tooltipRef.value) {
      loadAllSpeakerMeta().then(() => {
        drawChart();
      });
    }
  }, { deep: true });
  
  // Watch for episode number changes to load transcript
  watch(() => props.episodeNumber, () => {
    if (props.episodeNumber) {
      loadTranscript();
    }
  }, { immediate: true });
  
  // Watch for episode topics changes
  watch(() => props.episodeTopics, () => {
    if (tooltipRef.value) {
      drawChart();
    }
  }, { deep: true });

  // Watch for theme changes (dark mode toggle)
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = () => {
      drawChart();
    };
    mediaQuery.addEventListener('change', handleThemeChange);
    
    // Also watch for class changes on html element
    const observer = new MutationObserver(() => {
      drawChart();
    });
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  // Watch for resize
  if (chartRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => {
      drawChart();
    });
    resizeObserver.observe(chartRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (svg) {
    svg.remove();
    svg = null;
  }
});
</script>

<template>
  <div class="relative w-full">
    <div ref="chartRef" class="w-full"></div>
    <div
      ref="tooltipRef"
      style="display: none; position: fixed; z-index: 1000; background: white; border: 1px solid #e5e7eb; border-radius: 0.5rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); padding: 0.75rem; max-width: 20rem; pointer-events: none;"
      class="dark:bg-gray-800 dark:border-gray-700"
    ></div>
  </div>
</template>

<style scoped>
:deep(.text-gray-600) {
  color: rgb(75 85 99);
}

.dark :deep(.text-gray-600) {
  color: rgb(156 163 175);
}

:deep(.text-gray-400) {
  color: rgb(156 163 175);
}

.dark :deep(.text-gray-400) {
  color: rgb(156 163 175);
}

:deep(.text-gray-700) {
  color: rgb(55 65 81);
}

.dark :deep(.text-gray-700) {
  color: rgb(209 213 219);
}

:deep(.text-gray-300) {
  color: rgb(209 213 219);
}

.dark :deep(.text-gray-300) {
  color: rgb(209 213 219);
}
</style>

