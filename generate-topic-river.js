import fs from 'fs';
import path from 'path';

/**
 * Generiert eine JSON-Datei für Topic River Visualisierung
 * Aggregiert Main Topics aus topic-taxonomy.json nach Jahren
 */

const TAXONOMY_FILE = 'topic-taxonomy.json';
const EPISODES_DIR = 'episodes';
const OUTPUT_FILE = 'topic-river-data.json';

/**
 * Lädt die Taxonomie-Daten
 */
function loadTaxonomy() {
  console.log('Lade topic-taxonomy.json...');
  const data = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf-8'));
  return data.mainTopics;
}

/**
 * Lädt Episode-Metadaten (Datum)
 */
function loadEpisodeMetadata(episodeNumber) {
  const filePath = path.join(EPISODES_DIR, `${episodeNumber}.json`);
  
  if (!fs.existsSync(filePath)) {
    console.warn(`Episode ${episodeNumber}.json nicht gefunden`);
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return {
      number: episodeNumber,
      date: data.date,
      title: data.title
    };
  } catch (error) {
    console.warn(`Fehler beim Laden von Episode ${episodeNumber}:`, error.message);
    return null;
  }
}

/**
 * Extrahiert das Jahr aus einem Datum
 */
function getYear(dateString) {
  if (!dateString) return null;
  const year = new Date(dateString).getFullYear();
  return isNaN(year) ? null : year;
}

/**
 * Aggregiert Topics nach Jahren
 */
function aggregateTopicsByYear(mainTopics) {
  console.log('Aggregiere Topics nach Jahren...');
  
  // Struktur: { topicId: { year: count } }
  const topicYearCounts = {};
  
  // Struktur: { topicId: { id, name, description, yearData: [{ year, count, episodes }] } }
  const result = {};
  
  // Für jedes Main Topic
  for (const topic of mainTopics) {
    console.log(`Verarbeite Topic: ${topic.name} (${topic.episodes.length} Episoden)`);
    
    if (!topicYearCounts[topic.id]) {
      topicYearCounts[topic.id] = {};
    }
    
    // Für jede Episode in diesem Topic
    for (const episodeNumber of topic.episodes) {
      const metadata = loadEpisodeMetadata(episodeNumber);
      
      if (metadata && metadata.date) {
        const year = getYear(metadata.date);
        
        if (year) {
          if (!topicYearCounts[topic.id][year]) {
            topicYearCounts[topic.id][year] = {
              count: 0,
              episodes: []
            };
          }
          
          topicYearCounts[topic.id][year].count++;
          topicYearCounts[topic.id][year].episodes.push({
            number: episodeNumber,
            date: metadata.date,
            title: metadata.title
          });
        }
      }
    }
    
    // Konvertiere in Array-Format für bessere Visualisierung
    const yearData = [];
    const years = Object.keys(topicYearCounts[topic.id]).sort();
    
    for (const year of years) {
      yearData.push({
        year: parseInt(year),
        count: topicYearCounts[topic.id][year].count,
        episodes: topicYearCounts[topic.id][year].episodes
      });
    }
    
    result[topic.id] = {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      totalEpisodes: topic.episodeCount,
      totalTopics: topic.topicCount,
      yearData: yearData
    };
  }
  
  return result;
}

/**
 * Berechnet Statistiken
 */
function calculateStatistics(topicRiverData) {
  const topics = Object.values(topicRiverData);
  
  // Alle Jahre sammeln
  const allYears = new Set();
  for (const topic of topics) {
    for (const yearEntry of topic.yearData) {
      allYears.add(yearEntry.year);
    }
  }
  
  const years = Array.from(allYears).sort();
  
  return {
    totalTopics: topics.length,
    yearRange: {
      start: years[0],
      end: years[years.length - 1]
    },
    years: years,
    topicsByEpisodeCount: topics
      .map(t => ({ id: t.id, name: t.name, count: t.totalEpisodes }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10) // Top 10
  };
}

/**
 * Hauptfunktion
 */
function main() {
  console.log('=== Topic River Daten-Generator ===\n');
  
  try {
    // 1. Lade Main Topics
    const mainTopics = loadTaxonomy();
    console.log(`${mainTopics.length} Main Topics gefunden\n`);
    
    // 2. Aggregiere nach Jahren
    const topicRiverData = aggregateTopicsByYear(mainTopics);
    
    // 3. Berechne Statistiken
    const statistics = calculateStatistics(topicRiverData);
    
    // 4. Erstelle Output-Struktur
    const output = {
      generatedAt: new Date().toISOString(),
      description: "Topic River Daten für Freak Show Podcast - Main Topics aggregiert nach Jahren",
      statistics: statistics,
      topics: topicRiverData
    };
    
    // 5. Speichere JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    
    console.log(`\n✓ Daten erfolgreich gespeichert in: ${OUTPUT_FILE}`);
    console.log(`\nStatistiken:`);
    console.log(`- Main Topics: ${statistics.totalTopics}`);
    console.log(`- Zeitraum: ${statistics.yearRange.start} - ${statistics.yearRange.end}`);
    console.log(`- Jahre: ${statistics.years.join(', ')}`);
    console.log(`\nTop 10 Topics nach Episodenanzahl:`);
    statistics.topicsByEpisodeCount.forEach((topic, index) => {
      console.log(`  ${index + 1}. ${topic.name}: ${topic.count} Episoden`);
    });
    
  } catch (error) {
    console.error('Fehler:', error);
    process.exit(1);
  }
}

main();

