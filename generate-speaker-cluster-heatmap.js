import fs from 'fs';
import path from 'path';

/**
 * Generiert Heatmap-Daten für Speaker x Topic-Clusters
 * Zeigt, wie oft jeder Speaker über jedes Topic-Cluster gesprochen hat
 */

const TAXONOMY_FILE = 'topic-taxonomy.json';
const EPISODES_DIR = 'episodes';
const OUTPUT_FILE = 'speaker-cluster-heatmap.json';

/**
 * Lädt die Topic-Taxonomy-Daten
 */
function loadTaxonomy() {
  console.log('Lade topic-taxonomy.json...');
  const data = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf-8'));
  return data.clusters;
}

/**
 * Lädt Episode-Metadaten
 */
function loadEpisode(episodeNumber) {
  const filePath = path.join(EPISODES_DIR, `${episodeNumber}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    console.warn(`Fehler beim Laden von Episode ${episodeNumber}:`, error.message);
    return null;
  }
}

/**
 * Normalisiert Speaker-Namen
 */
function normalizeSpeakerName(name) {
  return name
    .toLowerCase()
    .replace(/[äöü]/g, match => {
      const map = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue' };
      return map[match] || match;
    })
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Hauptfunktion
 */
function main() {
  console.log('=== Speaker x Topic-Cluster Heatmap Generator ===\n');
  
  try {
    // 1. Lade Clusters
    const clusters = loadTaxonomy();
    console.log(`${clusters.length} Cluster gefunden\n`);
    
    // 2. Erstelle Speaker-Cluster Matrix
    const speakerClusterData = new Map(); // speaker -> cluster -> { count, episodes }
    const allSpeakers = new Set();
    
    // Für jedes Cluster
    for (const cluster of clusters) {
      console.log(`Verarbeite Cluster: ${cluster.name} (${cluster.episodes.length} Episoden)`);
      
      // Für jede Episode in diesem Cluster
      for (const episodeNumber of cluster.episodes) {
        const episode = loadEpisode(episodeNumber);
        
        if (!episode || !episode.speakers) continue;
        
        // Für jeden Speaker in dieser Episode
        for (const speakerName of episode.speakers) {
          const speakerId = normalizeSpeakerName(speakerName);
          allSpeakers.add(speakerId);
          
          if (!speakerClusterData.has(speakerId)) {
            speakerClusterData.set(speakerId, {
              id: speakerId,
              name: speakerName,
              clusters: new Map()
            });
          }
          
          const speakerData = speakerClusterData.get(speakerId);
          
          if (!speakerData.clusters.has(cluster.id)) {
            speakerData.clusters.set(cluster.id, {
              count: 0,
              episodes: [],
              clusterName: cluster.name
            });
          }
          
          const clusterData = speakerData.clusters.get(cluster.id);
          clusterData.count++;
          if (!clusterData.episodes.includes(episodeNumber)) {
            clusterData.episodes.push(episodeNumber);
          }
        }
      }
    }
    
    // 3. Konvertiere in Array-Format
    const speakers = Array.from(speakerClusterData.values()).map(speaker => {
      const clustersArray = Array.from(speaker.clusters.entries()).map(([clusterId, data]) => ({
        clusterId: clusterId,
        clusterName: data.clusterName,
        count: data.count,
        episodes: data.episodes
      }));
      
      // Sortiere Cluster nach Count (absteigend)
      clustersArray.sort((a, b) => b.count - a.count);
      
      return {
        id: speaker.id,
        name: speaker.name,
        totalEpisodes: clustersArray.reduce((sum, c) => sum + c.episodes.length, 0),
        clusters: clustersArray
      };
    });
    
    // Sortiere Speaker nach Gesamt-Episodenanzahl
    speakers.sort((a, b) => b.totalEpisodes - a.totalEpisodes);
    
    // 4. Erstelle Cluster-Liste
    const clusterList = clusters.map(cluster => ({
      id: cluster.id,
      name: cluster.name,
      totalEpisodes: cluster.episodeCount || cluster.episodes.length,
      topicCount: cluster.topicCount || 0
    }));
    
    // Sortiere Cluster nach Episodenanzahl
    clusterList.sort((a, b) => b.totalEpisodes - a.totalEpisodes);
    
    // 5. Berechne Statistiken
    const statistics = {
      totalSpeakers: speakers.length,
      totalClusters: clusters.length,
      totalCombinations: speakers.reduce((sum, s) => sum + s.clusters.length, 0),
      topSpeakersByEpisodes: speakers.slice(0, 10).map(s => ({
        id: s.id,
        name: s.name,
        count: s.totalEpisodes
      })),
      topClustersByEpisodes: clusterList.slice(0, 10).map(c => ({
        id: c.id,
        name: c.name,
        count: c.totalEpisodes
      }))
    };
    
    // 6. Erstelle Matrix für Heatmap
    const matrix = [];
    for (const speaker of speakers) {
      const row = {
        speakerId: speaker.id,
        speakerName: speaker.name,
        values: []
      };
      
      for (const cluster of clusterList) {
        const clusterData = speaker.clusters.find(c => c.clusterId === cluster.id);
        row.values.push({
          clusterId: cluster.id,
          clusterName: cluster.name,
          count: clusterData ? clusterData.count : 0,
          episodes: clusterData ? clusterData.episodes : []
        });
      }
      
      matrix.push(row);
    }
    
    // 7. Erstelle Output
    const output = {
      generatedAt: new Date().toISOString(),
      description: "Speaker x Topic-Cluster Heatmap für Freak Show Podcast",
      statistics: statistics,
      speakers: speakers,
      clusters: clusterList,
      matrix: matrix
    };
    
    // 8. Speichere JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    
    console.log(`\n✓ Daten erfolgreich gespeichert in: ${OUTPUT_FILE}`);
    console.log(`\nStatistiken:`);
    console.log(`- Speaker: ${statistics.totalSpeakers}`);
    console.log(`- Cluster: ${statistics.totalClusters}`);
    console.log(`- Kombinationen: ${statistics.totalCombinations}`);
    console.log(`\nTop 5 Speaker:`);
    statistics.topSpeakersByEpisodes.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name}: ${s.count} Episoden`);
    });
    console.log(`\nTop 5 Cluster:`);
    statistics.topClustersByEpisodes.slice(0, 5).forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.name}: ${c.count} Episoden`);
    });
    
  } catch (error) {
    console.error('Fehler:', error);
    process.exit(1);
  }
}

main();

