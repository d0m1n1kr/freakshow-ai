import fs from 'fs';
import path from 'path';

/**
 * Generiert eine JSON-Datei für Category River Visualisierung
 * Aggregiert Topic-Kategorien aus topic-categories.json nach Jahren
 */

const CATEGORIES_FILE = 'topic-categories.json';
const EPISODES_DIR = 'episodes';
const OUTPUT_FILE = 'category-river-data.json';

/**
 * Lädt die Kategorien-Daten
 */
function loadCategories() {
  console.log('Lade topic-categories.json...');
  const data = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
  return data.categories;
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
 * Aggregiert Kategorien nach Jahren
 */
function aggregateCategoriesByYear(categories) {
  console.log('Aggregiere Kategorien nach Jahren...');
  
  // Struktur: { categoryId: { year: count } }
  const categoryYearCounts = {};
  
  // Struktur: { categoryId: { id, name, description, yearData: [{ year, count, episodes }] } }
  const result = {};
  
  // Für jede Kategorie
  for (const category of categories) {
    console.log(`Verarbeite Kategorie: ${category.name} (${category.episodes.length} Episoden)`);
    
    if (!categoryYearCounts[category.id]) {
      categoryYearCounts[category.id] = {};
    }
    
    // Für jede Episode in dieser Kategorie
    for (const episodeNumber of category.episodes) {
      const metadata = loadEpisodeMetadata(episodeNumber);
      
      if (metadata && metadata.date) {
        const year = getYear(metadata.date);
        
        if (year) {
          if (!categoryYearCounts[category.id][year]) {
            categoryYearCounts[category.id][year] = {
              count: 0,
              episodes: []
            };
          }
          
          categoryYearCounts[category.id][year].count++;
          categoryYearCounts[category.id][year].episodes.push({
            number: episodeNumber,
            date: metadata.date,
            title: metadata.title
          });
        }
      }
    }
    
    // Konvertiere in Array-Format für bessere Visualisierung
    const yearData = [];
    const years = Object.keys(categoryYearCounts[category.id]).sort();
    
    for (const year of years) {
      yearData.push({
        year: parseInt(year),
        count: categoryYearCounts[category.id][year].count,
        episodes: categoryYearCounts[category.id][year].episodes
      });
    }
    
    result[category.id] = {
      id: category.id,
      name: category.name,
      description: category.description,
      totalEpisodes: category.episodeCount,
      clusterCount: category.clusterCount,
      topicCount: category.topicCount,
      sampleClusters: category.sampleClusters,
      yearData: yearData
    };
  }
  
  return result;
}

/**
 * Berechnet Statistiken
 */
function calculateStatistics(categoryRiverData) {
  const categories = Object.values(categoryRiverData);
  
  // Alle Jahre sammeln
  const allYears = new Set();
  for (const category of categories) {
    for (const yearEntry of category.yearData) {
      allYears.add(yearEntry.year);
    }
  }
  
  const years = Array.from(allYears).sort();
  
  return {
    totalCategories: categories.length,
    yearRange: {
      start: years[0],
      end: years[years.length - 1]
    },
    years: years,
    categoriesByEpisodeCount: categories
      .map(c => ({ id: c.id, name: c.name, count: c.totalEpisodes, clusters: c.clusterCount }))
      .sort((a, b) => b.count - a.count)
  };
}

/**
 * Hauptfunktion
 */
function main() {
  console.log('=== Category River Daten-Generator ===\n');
  
  try {
    // 1. Lade Kategorien
    const categories = loadCategories();
    console.log(`${categories.length} Kategorien gefunden\n`);
    
    // 2. Aggregiere nach Jahren
    const categoryRiverData = aggregateCategoriesByYear(categories);
    
    // 3. Berechne Statistiken
    const statistics = calculateStatistics(categoryRiverData);
    
    // 4. Erstelle Output-Struktur
    const output = {
      generatedAt: new Date().toISOString(),
      description: "Category River Daten für Freak Show Podcast - Topic-Kategorien aggregiert nach Jahren",
      statistics: statistics,
      topics: categoryRiverData  // Nutze "topics" für Kompatibilität mit Frontend
    };
    
    // 5. Speichere JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    
    console.log(`\n✓ Daten erfolgreich gespeichert in: ${OUTPUT_FILE}`);
    console.log(`\nStatistiken:`);
    console.log(`- Kategorien: ${statistics.totalCategories}`);
    console.log(`- Zeitraum: ${statistics.yearRange.start} - ${statistics.yearRange.end}`);
    console.log(`- Jahre: ${statistics.years.join(', ')}`);
    console.log(`\nKategorien nach Episodenanzahl:`);
    statistics.categoriesByEpisodeCount.forEach((category, index) => {
      console.log(`  ${index + 1}. ${category.name}: ${category.count} Episoden (${category.clusters} Cluster)`);
    });
    
  } catch (error) {
    console.error('Fehler:', error);
    process.exit(1);
  }
}

main();

