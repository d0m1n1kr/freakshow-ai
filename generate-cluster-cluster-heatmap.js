import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateClusterClusterHeatmap() {
  console.log('Loading topic taxonomy...');
  
  // Load topic taxonomy from root directory (where Rust binary outputs it)
  const taxonomyPath = path.join(__dirname, 'topic-taxonomy.json');
  const taxonomyData = JSON.parse(await fs.readFile(taxonomyPath, 'utf-8'));
  
  const clusters = taxonomyData.clusters;
  
  console.log(`Found ${clusters.length} clusters`);
  
  // Build cluster co-occurrence matrix
  const matrix = [];
  const clusterMap = new Map();
  
  // Index clusters by ID
  clusters.forEach(cluster => {
    clusterMap.set(cluster.id, cluster);
  });
  
  // For each cluster pair, find episodes where both clusters appear
  for (let i = 0; i < clusters.length; i++) {
    const cluster1 = clusters[i];
    const cluster1Episodes = new Set(cluster1.episodes);
    
    const row = {
      clusterId: cluster1.id,
      cluster1Name: cluster1.name,
      values: []
    };
    
    for (let j = 0; j < clusters.length; j++) {
      const cluster2 = clusters[j];
      const cluster2Episodes = new Set(cluster2.episodes);
      
      // Find intersection of episodes
      const commonEpisodes = [...cluster1Episodes].filter(ep => cluster2Episodes.has(ep));
      
      row.values.push({
        clusterId: cluster2.id,
        cluster2Name: cluster2.name,
        count: commonEpisodes.length,
        episodes: commonEpisodes.sort((a, b) => a - b)
      });
    }
    
    matrix.push(row);
  }
  
  // Sort clusters by total episode count
  const sortedClusters = [...clusters]
    .sort((a, b) => b.episodeCount - a.episodeCount)
    .map(c => ({
      id: c.id,
      name: c.name,
      totalEpisodes: c.episodeCount,
      topicCount: c.topicCount
    }));
  
  // Count total combinations (non-zero co-occurrences)
  let totalCombinations = 0;
  matrix.forEach(row => {
    row.values.forEach(val => {
      if (val.count > 0) totalCombinations++;
    });
  });
  
  const heatmapData = {
    generatedAt: new Date().toISOString(),
    description: 'Cluster-Cluster Co-occurrence Heatmap Data',
    statistics: {
      totalClusters: clusters.length,
      totalCombinations,
      topClustersByEpisodes: sortedClusters.slice(0, 20)
    },
    clusters: sortedClusters,
    matrix
  };
  
  // Write output to root directory (will be moved by build-variant.sh)
  const outputPath = path.join(__dirname, 'cluster-cluster-heatmap.json');
  await fs.writeFile(outputPath, JSON.stringify(heatmapData, null, 2));
  
  console.log(`\n✓ Generated cluster-cluster-heatmap.json`);
  console.log(`  - ${clusters.length} clusters`);
  console.log(`  - ${totalCombinations} combinations with co-occurrences`);
  console.log(`  - Top cluster: ${sortedClusters[0].name} (${sortedClusters[0].totalEpisodes} episodes)`);
}

generateClusterClusterHeatmap().catch(console.error);
