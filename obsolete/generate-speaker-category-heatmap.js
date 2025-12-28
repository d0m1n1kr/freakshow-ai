import fs from 'fs';
import path from 'path';

/**
 * Generiert Heatmap-Daten für Speaker x Categories
 * Zeigt, wie oft jeder Speaker über jede Kategorie gesprochen hat
 */

const CATEGORIES_FILE = 'topic-categories.json';
const EPISODES_DIR = 'episodes';
const SPEAKER_RIVER_FILE = 'speaker-river-data.json';
const OUTPUT_FILE = 'speaker-category-heatmap.json';

/**
 * Lädt die Kategorien-Daten
 */
function loadCategories() {
  console.log('Lade topic-categories.json...');
  const data = JSON.parse(fs.readFileSync(CATEGORIES_FILE, 'utf-8'));
  return data.categories;
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
  console.log('=== Speaker x Category Heatmap Generator ===\n');
  
  try {
    // 1. Lade Kategorien
    const categories = loadCategories();
    console.log(`${categories.length} Kategorien gefunden\n`);
    
    // 2. Erstelle Speaker-Kategorie Matrix
    const speakerCategoryData = new Map(); // speaker -> category -> { count, episodes, topics }
    const allSpeakers = new Set();
    
    // Für jede Kategorie
    for (const category of categories) {
      console.log(`Verarbeite Kategorie: ${category.name} (${category.episodes.length} Episoden)`);
      
      // Für jede Episode in dieser Kategorie
      for (const episodeNumber of category.episodes) {
        const episode = loadEpisode(episodeNumber);
        
        if (!episode || !episode.speakers) continue;
        
        // Für jeden Speaker in dieser Episode
        for (const speakerName of episode.speakers) {
          const speakerId = normalizeSpeakerName(speakerName);
          allSpeakers.add(speakerId);
          
          if (!speakerCategoryData.has(speakerId)) {
            speakerCategoryData.set(speakerId, {
              id: speakerId,
              name: speakerName,
              categories: new Map()
            });
          }
          
          const speakerData = speakerCategoryData.get(speakerId);
          
          if (!speakerData.categories.has(category.id)) {
            speakerData.categories.set(category.id, {
              count: 0,
              episodes: [],
              categoryName: category.name
            });
          }
          
          const catData = speakerData.categories.get(category.id);
          catData.count++;
          if (!catData.episodes.includes(episodeNumber)) {
            catData.episodes.push(episodeNumber);
          }
        }
      }
    }
    
    // 3. Konvertiere in Array-Format
    const speakers = Array.from(speakerCategoryData.values()).map(speaker => {
      const categoriesArray = Array.from(speaker.categories.entries()).map(([catId, data]) => ({
        categoryId: catId,
        categoryName: data.categoryName,
        count: data.count,
        episodes: data.episodes
      }));
      
      // Sortiere Kategorien nach Count (absteigend)
      categoriesArray.sort((a, b) => b.count - a.count);
      
      return {
        id: speaker.id,
        name: speaker.name,
        totalEpisodes: categoriesArray.reduce((sum, cat) => sum + cat.episodes.length, 0),
        categories: categoriesArray
      };
    });
    
    // Sortiere Speaker nach Gesamt-Episodenanzahl
    speakers.sort((a, b) => b.totalEpisodes - a.totalEpisodes);
    
    // 4. Erstelle Kategorien-Liste
    const categoryList = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      totalEpisodes: cat.episodes.length,
      clusterCount: cat.clusterCount,
      topicCount: cat.topicCount
    }));
    
    // 5. Berechne Statistiken
    const statistics = {
      totalSpeakers: speakers.length,
      totalCategories: categories.length,
      totalCombinations: speakers.reduce((sum, s) => sum + s.categories.length, 0),
      topSpeakersByEpisodes: speakers.slice(0, 10).map(s => ({
        id: s.id,
        name: s.name,
        count: s.totalEpisodes
      })),
      topCategoriesByEpisodes: categoryList
        .sort((a, b) => b.totalEpisodes - a.totalEpisodes)
        .slice(0, 10)
        .map(c => ({
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
      
      for (const category of categoryList) {
        const catData = speaker.categories.find(c => c.categoryId === category.id);
        row.values.push({
          categoryId: category.id,
          categoryName: category.name,
          count: catData ? catData.count : 0,
          episodes: catData ? catData.episodes : []
        });
      }
      
      matrix.push(row);
    }
    
    // 7. Erstelle Output
    const output = {
      generatedAt: new Date().toISOString(),
      description: "Speaker x Category Heatmap für Freak Show Podcast",
      statistics: statistics,
      speakers: speakers,
      categories: categoryList,
      matrix: matrix
    };
    
    // 8. Speichere JSON
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
    
    console.log(`\n✓ Daten erfolgreich gespeichert in: ${OUTPUT_FILE}`);
    console.log(`\nStatistiken:`);
    console.log(`- Speaker: ${statistics.totalSpeakers}`);
    console.log(`- Kategorien: ${statistics.totalCategories}`);
    console.log(`- Kombinationen: ${statistics.totalCombinations}`);
    console.log(`\nTop 5 Speaker:`);
    statistics.topSpeakersByEpisodes.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name}: ${s.count} Episoden`);
    });
    
  } catch (error) {
    console.error('Fehler:', error);
    process.exit(1);
  }
}

main();

