import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { UMAP } from 'umap-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generates UMAP 2D coordinates for topics colored by their clusters
 * Reads db/topic-embeddings.json and topic-taxonomy.json
 */

// Parse command line arguments
const args = process.argv.slice(2);
const podcastIndex = args.indexOf('--podcast');
const PODCAST_ID = podcastIndex !== -1 && args[podcastIndex + 1] ? args[podcastIndex + 1] : 'freakshow';

const PROJECT_ROOT = path.join(__dirname, '..');
const EMBEDDINGS_FILE = path.join(PROJECT_ROOT, 'db', PODCAST_ID, 'topic-embeddings.json');
const TAXONOMY_FILE = path.join(PROJECT_ROOT, 'frontend', 'public', 'podcasts', PODCAST_ID, 'topic-taxonomy.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'frontend', 'public', 'podcasts', PODCAST_ID);
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'topic-umap-data.json');
const FRONTEND_OUTPUT = OUTPUT_FILE;

/**
 * Load embeddings database
 */
function loadEmbeddings() {
  console.log(`📂 Loading embeddings database for podcast: ${PODCAST_ID}...`);
  console.log(`   Path: ${EMBEDDINGS_FILE}`);
  if (!fs.existsSync(EMBEDDINGS_FILE)) {
    console.error(`❌ ${EMBEDDINGS_FILE} not found!`);
    console.error(`   Create it with: node scripts/create-embeddings.js --podcast ${PODCAST_ID}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(EMBEDDINGS_FILE, 'utf-8'));
  console.log(`   ✓ Loaded ${data.topics.length} topics with embeddings`);
  console.log(`   Dimensions: ${data.embeddingDimensions}`);
  return data;
}

/**
 * Load taxonomy to get cluster assignments
 */
function loadTaxonomy() {
  console.log('\n📂 Loading topic-taxonomy.json...');
  if (!fs.existsSync(TAXONOMY_FILE)) {
    console.error(`❌ ${TAXONOMY_FILE} not found!`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf-8'));
  console.log(`   ✓ Loaded ${data.clusters.length} clusters`);
  return data;
}

/**
 * Create a mapping from topic to cluster
 */
function createTopicClusterMap(taxonomy) {
  console.log('\n🗂️  Creating topic → cluster mapping...');
  const topicToCluster = new Map();
  
  for (const cluster of taxonomy.clusters) {
    // Get all topics in this cluster from sample topics
    // Note: The taxonomy doesn't have all topics explicitly, 
    // so we'll use the episodes to infer which topics belong where
    for (const topic of cluster.sampleTopics || []) {
      topicToCluster.set(topic, {
        clusterId: cluster.id,
        clusterName: cluster.name,
        clusterDescription: cluster.description,
        isOutlier: cluster.isOutlier
      });
    }
  }
  
  console.log(`   ✓ Mapped ${topicToCluster.size} topics to clusters`);
  return topicToCluster;
}

/**
 * Run UMAP dimensionality reduction
 */
function runUMAP(embeddings, options = {}) {
  console.log('\n🧮 Running UMAP dimensionality reduction...');
  console.log(`   Input dimensions: ${embeddings[0].length}`);
  console.log(`   Number of samples: ${embeddings.length}`);
  
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: options.nNeighbors || 50,
    minDist: options.minDist || 0.3,
    spread: options.spread || 1.0,
    random: options.random || Math.random
  });
  
  console.log('   Parameters:');
  console.log(`   - nComponents: 2`);
  console.log(`   - nNeighbors: ${options.nNeighbors || 15}`);
  console.log(`   - minDist: ${options.minDist || 0.1}`);
  console.log(`   - spread: ${options.spread || 1.0}`);
  
  const start = Date.now();
  const umapEmbedding = umap.fit(embeddings);
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  
  console.log(`   ✓ UMAP completed in ${duration}s`);
  return umapEmbedding;
}

/**
 * Main function
 */
async function main() {
  console.log(`🗺️  Generating UMAP visualization data for podcast: ${PODCAST_ID}\n`);
  
  // Load data
  const embeddingsDb = loadEmbeddings();
  const taxonomy = loadTaxonomy();
  const topicClusterMap = createTopicClusterMap(taxonomy);
  
  // Prepare embeddings matrix
  console.log('\n📊 Preparing data for UMAP...');
  const embeddings = embeddingsDb.topics.map(t => t.embedding);
  
  // Run UMAP
  const umapCoords = runUMAP(embeddings, {
    nNeighbors: 200,
    minDist: 0.75,
    spread: 1.0
  });
  
  // Create output data structure
  console.log('\n📦 Creating output data...');
  const outputData = {
    createdAt: new Date().toISOString(),
    method: 'UMAP',
    parameters: {
      nComponents: 2,
      nNeighbors: 200,
      minDist: 0.75,
      spread: 1.0
    },
    totalTopics: embeddingsDb.topics.length,
    totalClusters: taxonomy.clusters.length,
    points: []
  };
  
  // For each topic, create a point with UMAP coordinates
  for (let i = 0; i < embeddingsDb.topics.length; i++) {
    const topic = embeddingsDb.topics[i];
    const coords = umapCoords[i];
    const clusterInfo = topicClusterMap.get(topic.topic);
    
    // If topic is in taxonomy, use its cluster info
    // Otherwise, mark as "unclustered"
    const point = {
      topic: topic.topic,
      keywords: topic.keywords,
      count: topic.count,
      episodes: topic.episodes,
      x: coords[0],
      y: coords[1],
      clusterId: clusterInfo?.clusterId || 'unclustered',
      clusterName: clusterInfo?.clusterName || 'Nicht zugeordnet',
      isOutlier: clusterInfo?.isOutlier || false
    };
    
    outputData.points.push(point);
  }
  
  // Calculate statistics
  const clusterCounts = {};
  for (const point of outputData.points) {
    clusterCounts[point.clusterId] = (clusterCounts[point.clusterId] || 0) + 1;
  }
  
  outputData.statistics = {
    clusteredTopics: outputData.points.filter(p => p.clusterId !== 'unclustered').length,
    unclusteredTopics: outputData.points.filter(p => p.clusterId === 'unclustered').length,
    topClusters: Object.entries(clusterCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([clusterId, count]) => ({
        clusterId,
        count,
        name: outputData.points.find(p => p.clusterId === clusterId)?.clusterName
      }))
  };
  
  console.log(`   ✓ Created ${outputData.points.length} data points`);
  console.log(`   Clustered: ${outputData.statistics.clusteredTopics}`);
  console.log(`   Unclustered: ${outputData.statistics.unclusteredTopics}`);
  
  // Save output
  console.log('\n💾 Saving output files...');
  
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Frontend public directory
  fs.writeFileSync(FRONTEND_OUTPUT, JSON.stringify(outputData, null, 2));
  console.log(`   ✓ Saved: ${FRONTEND_OUTPUT}`);
  
  const fileSize = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2);
  console.log(`   File size: ${fileSize} KB`);
  
  console.log('\n✅ UMAP data generation complete!');
  console.log('\nNext steps:');
  console.log('   - View the visualization at /umap route in the frontend');
  console.log('   - Adjust UMAP parameters if needed (nNeighbors, minDist, spread)');
}

// Run the script
main().catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});

