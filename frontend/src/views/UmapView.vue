<script setup lang="ts">
import { ref, onMounted, watch, computed, nextTick } from 'vue';
import * as d3 from 'd3';

interface UmapPoint {
  topic: string;
  keywords: string[];
  count: number;
  episodes: number[];
  x: number;
  y: number;
  clusterId: string;
  clusterName: string;
  isOutlier: boolean;
}

interface UmapData {
  createdAt: string;
  method: string;
  parameters: {
    nComponents: number;
    nNeighbors: number;
    minDist: number;
    spread: number;
  };
  totalTopics: number;
  totalClusters: number;
  points: UmapPoint[];
  statistics: {
    clusteredTopics: number;
    unclusteredTopics: number;
    topClusters: Array<{
      clusterId: string;
      count: number;
      name: string;
    }>;
  };
}

const umapData = ref<UmapData | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const selectedPoint = ref<UmapPoint | null>(null);
const hoveredPoint = ref<UmapPoint | null>(null);
const highlightCluster = ref<string | null>(null);
const searchQuery = ref('');

// Chart dimensions
const margin = { top: 20, right: 20, bottom: 40, left: 50 };
const width = 1200;
const height = 800;

const filteredPoints = computed(() => {
  if (!umapData.value) return [];
  let points = umapData.value.points;
  
  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    points = points.filter(p => 
      p.topic.toLowerCase().includes(query) ||
      p.clusterName.toLowerCase().includes(query) ||
      p.keywords.some(k => k.toLowerCase().includes(query))
    );
  }
  
  // Highlight specific cluster if selected
  if (highlightCluster.value) {
    points = points.map(p => ({
      ...p,
      _highlighted: p.clusterId === highlightCluster.value
    }));
  }
  
  return points;
});

const clusters = computed(() => {
  if (!umapData.value) return [];
  
  // Group points by cluster and count
  const clusterMap = new Map<string, { name: string; count: number; color: string }>();
  
  umapData.value.points.forEach((point) => {
    if (!clusterMap.has(point.clusterId)) {
      clusterMap.set(point.clusterId, {
        name: point.clusterName,
        count: 0,
        color: getClusterColor(point.clusterId)
      });
    }
    const cluster = clusterMap.get(point.clusterId)!;
    cluster.count++;
  });
  
  return Array.from(clusterMap.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.count - a.count);
});

function getClusterColor(clusterId: string): string {
  if (clusterId === 'unclustered') {
    return '#9ca3af'; // gray
  }
  
  // Use D3's extended color schemes
  const extendedScheme = [
    ...d3.schemeTableau10,
    ...d3.schemePaired,
    ...d3.schemeSet3
  ];
  
  // Hash the cluster ID to get consistent colors
  const hash = clusterId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);
  
  return extendedScheme[Math.abs(hash) % extendedScheme.length]!;
}

function createScatterplot() {
  if (!umapData.value) {
    console.log('No UMAP data available');
    return;
  }
  
  const chartElement = document.getElementById('umap-chart');
  if (!chartElement) {
    console.log('Chart element not found');
    return;
  }
  
  // Clear existing SVG
  d3.select('#umap-chart').selectAll('*').remove();
  
  const points = filteredPoints.value;
  console.log('Creating scatterplot with', points.length, 'points');
  
  // Create SVG
  const svg = d3.select('#umap-chart')
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('style', 'max-width: 100%; height: auto;');
  
  // Create scales
  const xExtent = d3.extent(points, d => d.x) as [number, number];
  const yExtent = d3.extent(points, d => d.y) as [number, number];
  
  const xScale = d3.scaleLinear()
    .domain(xExtent)
    .range([margin.left, width - margin.right])
    .nice();
  
  const yScale = d3.scaleLinear()
    .domain(yExtent)
    .range([height - margin.bottom, margin.top])
    .nice();
  
  // Create axes
  const xAxis = d3.axisBottom(xScale).ticks(10);
  const yAxis = d3.axisLeft(yScale).ticks(10);
  
  svg.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(xAxis)
    .attr('class', 'text-gray-600 dark:text-gray-400');
  
  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(yAxis)
    .attr('class', 'text-gray-600 dark:text-gray-400');
  
  // Add axis labels
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .attr('text-anchor', 'middle')
    .attr('class', 'text-sm fill-gray-600 dark:fill-gray-400')
    .text('UMAP 1');
  
  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -height / 2)
    .attr('y', 15)
    .attr('text-anchor', 'middle')
    .attr('class', 'text-sm fill-gray-600 dark:fill-gray-400')
    .text('UMAP 2');
  
  // Create tooltip
  const tooltip = d3.select('#umap-tooltip');
  
  // Add points
  const pointsGroup = svg.append('g');
  
  pointsGroup.selectAll('circle')
    .data(points)
    .join('circle')
    .attr('cx', d => xScale(d.x))
    .attr('cy', d => yScale(d.y))
    .attr('r', d => {
      if (highlightCluster.value && d.clusterId !== highlightCluster.value) {
        return 2;
      }
      return 4;
    })
    .attr('fill', d => getClusterColor(d.clusterId))
    .attr('opacity', d => {
      if (highlightCluster.value && d.clusterId !== highlightCluster.value) {
        return 0.1;
      }
      return 0.7;
    })
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.5)
    .style('cursor', 'pointer')
    .on('mouseover', function(event, d) {
      hoveredPoint.value = d;
      
      d3.select(this)
        .transition()
        .duration(150)
        .attr('r', 8)
        .attr('opacity', 1);
      
      // Show tooltip
      tooltip
        .style('display', 'block')
        .style('left', (event.pageX + 10) + 'px')
        .style('top', (event.pageY - 10) + 'px')
        .html(`
          <div class="font-semibold text-sm mb-1">${d.topic}</div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
            <strong>Cluster:</strong> ${d.clusterName}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400 mb-1">
            <strong>Keywords:</strong> ${d.keywords.join(', ')}
          </div>
          <div class="text-xs text-gray-600 dark:text-gray-400">
            <strong>Episoden:</strong> ${d.count} (${d.episodes.slice(0, 5).join(', ')}${d.episodes.length > 5 ? '...' : ''})
          </div>
        `);
    })
    .on('mouseout', function() {
      hoveredPoint.value = null;
      
      d3.select(this)
        .transition()
        .duration(150)
        .attr('r', (d: any) => {
          if (highlightCluster.value && d.clusterId !== highlightCluster.value) {
            return 2;
          }
          return 4;
        })
        .attr('opacity', (d: any) => {
          if (highlightCluster.value && d.clusterId !== highlightCluster.value) {
            return 0.1;
          }
          return 0.7;
        });
      
      tooltip.style('display', 'none');
    })
    .on('click', function(_event, d: any) {
      selectedPoint.value = d;
    });
}

onMounted(async () => {
  try {
    const response = await fetch('/topic-umap-data.json');
    
    if (!response.ok) {
      throw new Error('Fehler beim Laden der UMAP-Daten');
    }
    
    umapData.value = await response.json();
    loading.value = false;
    
    // Wait for DOM to be ready
    await nextTick();
    createScatterplot();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unbekannter Fehler';
    loading.value = false;
  }
});

// Recreate chart when filters change
watch([searchQuery, highlightCluster], () => {
  if (umapData.value) {
    nextTick(() => createScatterplot());
  }
});
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-20">
    <div class="text-center">
      <div class="inline-block animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent"></div>
      <p class="mt-4 text-gray-600 dark:text-gray-400">Lade UMAP-Daten...</p>
    </div>
  </div>

  <div v-else-if="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
    <p class="text-red-800 dark:text-red-200 font-semibold">{{ error }}</p>
  </div>

  <div v-else-if="umapData" class="space-y-6">
    <!-- Statistics Header -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ umapData.totalTopics }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Topics Total</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ umapData.totalClusters }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Cluster</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-purple-600 dark:text-purple-400">{{ umapData.statistics.clusteredTopics }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Clustered</div>
        </div>
        <div class="text-center">
          <div class="text-3xl font-bold text-gray-500 dark:text-gray-400">{{ umapData.statistics.unclusteredTopics }}</div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">Unclustered</div>
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex flex-wrap gap-4 items-center">
        <div class="flex-1 min-w-[200px]">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Suche Topics, Cluster oder Keywords..."
            class="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>
        
        <button
          @click="highlightCluster = null; searchQuery = ''"
          class="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm font-medium"
        >
          Reset Filter
        </button>
      </div>
      
      <div class="mt-4">
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Top Cluster: ({{ filteredPoints.length }} von {{ umapData.totalTopics }} Topics angezeigt)
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="cluster in clusters.slice(0, 10)"
            :key="cluster.id"
            @click="highlightCluster = highlightCluster === cluster.id ? null : cluster.id"
            :class="[
              'px-3 py-1 rounded-full text-xs font-medium transition-all',
              highlightCluster === cluster.id
                ? 'ring-2 ring-purple-500 scale-105'
                : 'hover:scale-105'
            ]"
            :style="{
              backgroundColor: cluster.color,
              color: '#fff',
              opacity: highlightCluster === cluster.id || !highlightCluster ? 1 : 0.3
            }"
          >
            {{ cluster.name }} ({{ cluster.count }})
          </button>
        </div>
      </div>
    </div>

    <!-- Chart -->
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">
          UMAP Topic Clustering Visualization
        </h2>
        <div class="text-sm text-gray-600 dark:text-gray-400">
          nNeighbors: {{ umapData.parameters.nNeighbors }} | 
          minDist: {{ umapData.parameters.minDist }} | 
          spread: {{ umapData.parameters.spread }}
        </div>
      </div>
      
      <div class="relative">
        <div id="umap-chart" class="w-full overflow-x-auto"></div>
        <div
          id="umap-tooltip"
          class="absolute hidden bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg p-3 pointer-events-none z-50 max-w-sm"
          style="display: none;"
        ></div>
      </div>
    </div>

    <!-- Selected Point Details -->
    <div
      v-if="selectedPoint"
      class="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6"
    >
      <div class="flex items-start justify-between mb-4">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white">Selected Topic</h3>
        <button
          @click="selectedPoint = null"
          class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>
      
      <div class="space-y-3">
        <div>
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Topic:</span>
          <p class="text-gray-900 dark:text-white">{{ selectedPoint.topic }}</p>
        </div>
        
        <div>
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Cluster:</span>
          <p class="text-gray-900 dark:text-white">{{ selectedPoint.clusterName }}</p>
        </div>
        
        <div>
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Keywords:</span>
          <div class="flex flex-wrap gap-2 mt-1">
            <span
              v-for="keyword in selectedPoint.keywords"
              :key="keyword"
              class="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded text-xs"
            >
              {{ keyword }}
            </span>
          </div>
        </div>
        
        <div>
          <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">Episodes ({{ selectedPoint.count }}):</span>
          <p class="text-gray-900 dark:text-white">{{ selectedPoint.episodes.join(', ') }}</p>
        </div>
        
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span class="font-semibold text-gray-700 dark:text-gray-300">X:</span>
            <span class="text-gray-900 dark:text-white ml-1">{{ selectedPoint.x.toFixed(3) }}</span>
          </div>
          <div>
            <span class="font-semibold text-gray-700 dark:text-gray-300">Y:</span>
            <span class="text-gray-900 dark:text-white ml-1">{{ selectedPoint.y.toFixed(3) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="text-center text-gray-500 dark:text-gray-400 text-sm">
      <p>Generiert am: {{ new Date(umapData.createdAt).toLocaleString('de-DE') }}</p>
      <p class="mt-1 text-xs">
        UMAP (Uniform Manifold Approximation and Projection) - Dimensionsreduktion von {{ umapData.points[0]?.keywords.length || 3072 }}D zu 2D
      </p>
    </footer>
  </div>
</template>

<style scoped>
/* D3 axis styling */
:deep(svg) {
  font-family: inherit;
}

:deep(.domain),
:deep(.tick line) {
  stroke: rgb(209 213 219);
}

:deep(.dark .domain),
:deep(.dark .tick line) {
  stroke: rgb(75 85 99);
}

:deep(.tick text) {
  fill: rgb(75 85 99);
}

:deep(.dark .tick text) {
  fill: rgb(156 163 175);
}
</style>

