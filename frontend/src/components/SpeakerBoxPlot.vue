<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue';
import * as d3 from 'd3';
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
      boxplot: {
        min: number;
        q1: number;
        median: number;
        q3: number;
        max: number;
      };
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

const chartRef = ref<HTMLElement | null>(null);
const tooltipRef = ref<HTMLDivElement | null>(null);
const selectedSpeakers = ref<Set<string>>(new Set());
const speakersMeta = ref<Map<string, SpeakerMeta>>(new Map());
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
    
    if (speakerIdx === speakerIndex && time !== undefined && time >= minTime && time <= maxTime) {
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

// Prepare data for box plots
const prepareBoxPlotData = () => {
  const speakers = props.data.speakers;
  const boxPlotData: Array<{
    speaker: string;
    intervalStartSec: number;
    intervalEndSec: number;
    boxplot: {
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
    };
  }> = [];

  for (const speaker of speakers) {
    const stats = props.data.speakerStats[speaker];
    if (!stats) continue;

    for (const interval of stats.temporal) {
      // Only include intervals with actual data (segmentCount > 0)
      if (interval.boxplot && interval.boxplot.max > 0) {
        boxPlotData.push({
          speaker,
          intervalStartSec: interval.intervalStartSec,
          intervalEndSec: interval.intervalEndSec,
          boxplot: interval.boxplot,
        });
      }
    }
  }

  return boxPlotData;
};

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
  // Increase height significantly for better visibility
  const height = Math.max(600, Math.min(900, width * 0.9));
  const margin = { top: 30, right: 30, bottom: 90, left: 90 };
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

  const boxPlotData = prepareBoxPlotData();

  if (boxPlotData.length === 0) {
    // No data to display
    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight / 2)
      .attr('text-anchor', 'middle')
      .style('fill', isDarkMode ? '#9ca3af' : '#4b5563')
      .style('font-size', '16px')
      .text('No segment duration data available');
    return;
  }

  // Scales
  const xScale = d3
    .scaleLinear()
    .domain([0, props.data.episodeDurationSec])
    .range([0, innerWidth]);

  // Find min and max duration across all boxplots
  // Collect all min and max values from all boxplots
  const allMins: number[] = [];
  const allMaxs: number[] = [];
  boxPlotData.forEach(d => {
    if (d.boxplot && d.boxplot.min !== undefined && d.boxplot.min > 0) {
      allMins.push(d.boxplot.min);
    }
    if (d.boxplot && d.boxplot.max !== undefined && d.boxplot.max > 0) {
      allMaxs.push(d.boxplot.max);
    }
  });
  
  const minDuration = allMins.length > 0 ? d3.min(allMins)! : 0.1;
  const maxDuration = allMaxs.length > 0 ? d3.max(allMaxs)! : 1;
  
  // Use log scale with actual min/max values (no padding, no nice rounding)
  // Ensure minimum is at least 0.1 to avoid log(0) issues
  const yMin = Math.max(0.1, minDuration);
  const yMax = Math.max(yMin * 1.01, maxDuration); // Ensure max is slightly larger than min
  
  const yScale = d3
    .scaleLog()
    .domain([yMin, yMax])
    .range([innerHeight, 0]);
  // Don't use .nice() as it modifies the domain and doesn't respect actual min/max values

  // Color scale
  const colorScale = d3
    .scaleOrdinal<string>()
    .domain(props.data.speakers)
    .range(colors);

  // Helper function to format time
  function formatTime(sec: number): string {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  // Group data by interval start time (intervals are 600 seconds = 10 minutes)
  const intervalGroups = new Map<number, Array<typeof boxPlotData[0]>>();
  const allIntervalStarts = new Set<number>();
  boxPlotData.forEach((d) => {
    const intervalStart = d.intervalStartSec;
    allIntervalStarts.add(intervalStart);
    if (!intervalGroups.has(intervalStart)) {
      intervalGroups.set(intervalStart, []);
    }
    intervalGroups.get(intervalStart)!.push(d);
  });

  // Draw subtle vertical lines to separate intervals
  const sortedIntervals = Array.from(allIntervalStarts).sort((a, b) => a - b);
  sortedIntervals.forEach((intervalStart) => {
    const x = xScale(intervalStart);
    g.append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', 0)
      .attr('y2', innerHeight)
      .attr('stroke', isDarkMode ? '#374151' : '#e5e7eb')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '2,2')
      .attr('opacity', 0.5);
  });

  // Calculate box width based on available space
  // Use wider boxes for better visibility
  const intervalWidthPx = xScale(600) - xScale(0); // Width of one interval in pixels
  const maxBoxWidth = Math.min(intervalWidthPx * 0.15, 25); // Max 15% of interval width or 25px

  // Function to update visual state based on selected speakers
  const updateVisualState = () => {
    const allBoxElements = g.selectAll('[data-speaker]');
    const hasSelectedSpeakers = selectedSpeakers.value.size > 0;
    
    allBoxElements.each(function() {
      const element = d3.select(this);
      const elementSpeaker = element.attr('data-speaker');
      const node = element.node();
      const isSelected = selectedSpeakers.value.has(elementSpeaker);
      
      if (!hasSelectedSpeakers) {
        // No selection: show all elements normally
        element.style('opacity', null);
        if (node && 'tagName' in node && node.tagName === 'rect') {
          element.attr('fill-opacity', 0.7);
        } else if (node && 'tagName' in node && (node.tagName === 'line' || node.tagName === 'circle')) {
          const originalStrokeWidth = element.attr('data-original-stroke-width') || '2';
          element.attr('stroke-width', originalStrokeWidth);
        }
      } else if (isSelected) {
        // Selected: highlight
        element.style('opacity', 1);
        if (node && 'tagName' in node && node.tagName === 'rect') {
          element.attr('fill-opacity', 0.9);
        } else if (node && 'tagName' in node && (node.tagName === 'line' || node.tagName === 'circle')) {
          const originalStrokeWidth = element.attr('data-original-stroke-width') || '2';
          const currentWidth = parseFloat(originalStrokeWidth);
          element.attr('stroke-width', (currentWidth * 1.5).toString());
        }
      } else {
        // Not selected: dim
        element.style('opacity', 0.2);
        if (node && 'tagName' in node && node.tagName === 'rect') {
          element.attr('fill-opacity', 0.2);
        }
      }
    });
    
    // Update legend visual state
    const legendItems = g.selectAll('.legend-item');
    legendItems.each(function() {
      const legendItem = d3.select(this);
      const legendSpeaker = legendItem.attr('data-speaker');
      const isSelected = selectedSpeakers.value.has(legendSpeaker);
      
      const rect = legendItem.select('rect');
      const text = legendItem.select('text');
      
      if (isSelected) {
        rect.attr('fill-opacity', 1);
        text.style('font-weight', '600');
      } else {
        rect.attr('fill-opacity', 0.6);
        text.style('font-weight', 'normal');
      }
    });
  };
  
  // Function to toggle speaker selection
  const toggleSpeakerSelection = (speakerName: string) => {
    if (selectedSpeakers.value.has(speakerName)) {
      selectedSpeakers.value.delete(speakerName);
    } else {
      selectedSpeakers.value.add(speakerName);
    }
    updateVisualState();
  };

  // Draw box plots
  boxPlotData.forEach((d) => {
    const intervalStart = d.intervalStartSec;
    const intervalMid = (d.intervalStartSec + d.intervalEndSec) / 2;
    const speakersInInterval = intervalGroups.get(intervalStart) || [];
    
    // Sort speakers consistently for positioning
    const sortedSpeakers = [...speakersInInterval].sort((a, b) => 
      a.speaker.localeCompare(b.speaker)
    );
    const speakerIndex = sortedSpeakers.findIndex(item => 
      item.speaker === d.speaker && 
      item.intervalStartSec === d.intervalStartSec &&
      item.intervalEndSec === d.intervalEndSec
    );
    const totalSpeakers = speakersInInterval.length;
    
    // Calculate horizontal offset: spread speakers evenly across interval
    // Use 85% of interval width for spacing to leave margins
    const spacingWidth = intervalWidthPx * 0.85;
    const spacing = spacingWidth / Math.max(totalSpeakers, 1);
    // Make box width smaller than spacing to create larger gaps between boxes
    const gapSize = Math.min(15, spacing * 0.3); // Gap between boxes (max 15px or 30% of spacing)
    const boxWidth = Math.min(maxBoxWidth, spacing - gapSize);
    
    // Center the group of boxes in the interval
    const baseX = xScale(intervalMid);
    const groupStart = baseX - (spacingWidth / 2) + (spacing / 2);
    const offset = speakerIndex * spacing;
    
    const x = groupStart + offset;
    const bp = d.boxplot;
    const color = colorScale(d.speaker);

    // Draw whiskers (min to Q1 and Q3 to max) - add data attribute for highlighting
    const strokeWidth = 2;
    // Lower whisker
    g.append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', yScale(bp.min))
      .attr('y2', yScale(bp.q1))
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('data-speaker', d.speaker)
      .attr('data-original-stroke-width', strokeWidth.toString())
      .style('transition', 'opacity 0.2s');

    // Upper whisker
    g.append('line')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', yScale(bp.q3))
      .attr('y2', yScale(bp.max))
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('data-speaker', d.speaker)
      .attr('data-original-stroke-width', strokeWidth.toString())
      .style('transition', 'opacity 0.2s');

    // Draw box (Q1 to Q3) - make it more visible
    g.append('rect')
      .attr('x', x - boxWidth / 2)
      .attr('y', yScale(bp.q3))
      .attr('width', boxWidth)
      .attr('height', yScale(bp.q1) - yScale(bp.q3))
      .attr('fill', color)
      .attr('fill-opacity', 0.7)
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('data-speaker', d.speaker)
      .style('transition', 'opacity 0.2s, fill-opacity 0.2s');

    // Draw median line
    g.append('line')
      .attr('x1', x - boxWidth / 2)
      .attr('x2', x + boxWidth / 2)
      .attr('y1', yScale(bp.median))
      .attr('y2', yScale(bp.median))
      .attr('stroke', isDarkMode ? '#f3f4f6' : '#111827')
      .attr('stroke-width', strokeWidth)
      .attr('data-speaker', d.speaker)
      .attr('data-original-stroke-width', strokeWidth.toString())
      .style('transition', 'opacity 0.2s');

    // Draw min and max markers - make them slightly larger
    g.append('circle')
      .attr('cx', x)
      .attr('cy', yScale(bp.min))
      .attr('r', 4)
      .attr('fill', color)
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('data-speaker', d.speaker)
      .attr('data-original-stroke-width', strokeWidth.toString())
      .style('transition', 'opacity 0.2s');

    g.append('circle')
      .attr('cx', x)
      .attr('cy', yScale(bp.max))
      .attr('r', 4)
      .attr('fill', color)
      .attr('stroke', color)
      .attr('stroke-width', strokeWidth)
      .attr('data-speaker', d.speaker)
      .attr('data-original-stroke-width', strokeWidth.toString())
      .style('transition', 'opacity 0.2s');

    // Add invisible overlay for tooltip and click selection
    g.append('rect')
      .attr('x', x - boxWidth / 2 - 5)
      .attr('y', yScale(bp.max) - 5)
      .attr('width', boxWidth + 10)
      .attr('height', yScale(bp.min) - yScale(bp.max) + 10)
      .attr('fill', 'transparent')
      .style('cursor', 'pointer')
      .on('click', function(event: MouseEvent) {
        event.stopPropagation();
        if (!props.episodeNumber) return;
        
        const intervalMid = (d.intervalStartSec + d.intervalEndSec) / 2;
        let playTimeSec = intervalMid;
        
        // Find the nearest speaker segment start
        if (transcriptData.value) {
          const nextSegmentStart = findNextSegmentStart(d.speaker, intervalMid);
          if (nextSegmentStart !== null) {
            playTimeSec = nextSegmentStart;
          }
        }
        
        // Emit play event
        emit('play-at-time', playTimeSec);
      })
      .on('mouseover', function (event: MouseEvent) {
        if (!tooltipRef.value) return;

        const mouseX = event.clientX || (event as any).pageX || 0;
        const mouseY = event.clientY || (event as any).pageY || 0;

        const labelColor = isDarkMode ? '#9ca3af' : '#4b5563';
        const borderColor = isDarkMode ? '#374151' : '#e5e7eb';
        const topicBgColor = isDarkMode ? 'rgba(30, 58, 138, 0.3)' : '#dbeafe';
        const topicTextColor = isDarkMode ? '#93c5fd' : '#1e40af';
        
        const speakerMeta = speakersMeta.value.get(d.speaker);
        const topics = getTopicsForInterval(d.intervalStartSec, d.intervalEndSec);
        
        const imageHtml = speakerMeta?.image
          ? `<img src="${speakerMeta.image}" alt="${d.speaker}" style="width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; display: inline-block; margin-right: 8px;" />`
          : '';
        
        const topicsHtml = topics.length > 0
          ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor};">
               <div style="font-size: 11px; font-weight: 600; color: ${labelColor}; margin-bottom: 4px;">Topics:</div>
               <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                 ${topics.map(topic => `<span style="padding: 2px 8px; font-size: 11px; background-color: ${topicBgColor}; color: ${topicTextColor}; border-radius: 4px;">${topic}</span>`).join('')}
               </div>
             </div>`
          : '';

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
            <div style="font-weight: 600; font-size: 14px; color: ${isDarkMode ? '#f3f4f6' : '#111827'};">${d.speaker}</div>
          </div>
          <div style="font-size: 12px; color: ${labelColor};">
            <div><strong>Time:</strong> ${formatTime(d.intervalStartSec)} - ${formatTime(d.intervalEndSec)}</div>
            <div><strong>Min:</strong> ${bp.min.toFixed(1)}s</div>
            <div><strong>Q1:</strong> ${bp.q1.toFixed(1)}s</div>
            <div><strong>Median:</strong> ${bp.median.toFixed(1)}s</div>
            <div><strong>Q3:</strong> ${bp.q3.toFixed(1)}s</div>
            <div><strong>Max:</strong> ${bp.max.toFixed(1)}s</div>
          </div>
          ${topicsHtml}
          ${props.episodeNumber ? `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid ${borderColor}; font-size: 11px; color: ${labelColor}; font-style: italic;">Click to play</div>` : ''}
        `;
      })
      .on('mouseout', function () {
        if (tooltipRef.value) {
          tooltipRef.value.style.display = 'none';
        }
      });
  });

  // X axis
  const xAxis = d3.axisBottom(xScale).tickFormat((d) => {
    const sec = Number(d);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
    return `${m}`;
  });

  const labelColor = isDarkMode ? '#d1d5db' : '#4b5563';

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
    .text('Position in Episode');

  // Y axis (log scale)
  const yAxis = d3.axisLeft(yScale).tickFormat((d) => {
    const sec = Number(d);
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    }
    // For log scale, show decimal places for small values
    if (sec < 1) {
      return `${sec.toFixed(1)}s`;
    }
    return `${Math.floor(sec)}s`;
  });

  g.append('g')
    .call(yAxis)
    .selectAll('text')
    .style('fill', labelColor)
    .style('font-size', '12px');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('y', -55)
    .attr('x', -innerHeight / 2)
    .attr('text-anchor', 'middle')
    .style('fill', labelColor)
    .style('font-size', '14px')
    .style('font-weight', '500')
    .text('Segment Duration');

  // Legend with click selection
  const legend = g
    .append('g')
    .attr('transform', `translate(${innerWidth - 150}, 20)`);

  props.data.speakers.forEach((speaker, i) => {
    const legendRow = legend
      .append('g')
      .attr('transform', `translate(0, ${i * 25})`)
      .attr('class', 'legend-item')
      .attr('data-speaker', speaker)
      .style('cursor', 'pointer');

    legendRow
      .append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', colorScale(speaker))
      .attr('fill-opacity', 0.6)
      .attr('stroke', colorScale(speaker))
      .style('transition', 'opacity 0.2s, fill-opacity 0.2s');

    const legendTextColor = isDarkMode ? '#e5e7eb' : '#374151';

    legendRow
      .append('text')
      .attr('x', 20)
      .attr('y', 12)
      .style('fill', legendTextColor)
      .style('font-size', '12px')
      .style('transition', 'opacity 0.2s')
      .text(speaker.length > 20 ? speaker.substring(0, 17) + '...' : speaker);

    // Add click handler to legend
    legendRow
      .on('click', function(event: MouseEvent) {
        event.stopPropagation();
        toggleSpeakerSelection(speaker);
      });
  });
  
  // Initial visual state update
  updateVisualState();
};

onMounted(() => {
  // Load transcript data if episode number is available
  if (props.episodeNumber) {
    loadTranscript();
  }
  
  // Load speaker metadata
  loadAllSpeakerMeta().then(() => {
    setTimeout(() => {
      drawChart();
    }, 0);
  });

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

