import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Navigate from scripts/ to project root
const PROJECT_ROOT = path.join(__dirname, '..');
const EPISODES_DIR = path.join(PROJECT_ROOT, 'episodes');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'frontend', 'public', 'speaker-river-data.json');

/**
 * Liest alle Episode-JSON-Dateien ein und extrahiert die Speaker-Informationen
 */
async function loadEpisodes() {
  const files = fs.readdirSync(EPISODES_DIR);
  const episodeFiles = files.filter(f => 
    f.match(/^\d+\.json$/) && !f.includes('-topics') && !f.includes('-ts')
  );

  const episodes = [];
  
  for (const file of episodeFiles) {
    try {
      const filePath = path.join(EPISODES_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const episode = JSON.parse(content);
      
      if (episode.number && episode.date && episode.speakers && episode.speakers.length > 0) {
        episodes.push({
          number: episode.number,
          date: episode.date,
          speakers: episode.speakers,
          duration: episode.duration || [0, 0, 0]
        });
      }
    } catch (error) {
      console.error(`Fehler beim Lesen von ${file}:`, error.message);
    }
  }
  
  return episodes.sort((a, b) => a.number - b.number);
}

/**
 * Extrahiert das Jahr aus einem Datum (YYYY-MM-DD Format)
 */
function getYear(dateString) {
  return parseInt(dateString.split('-')[0]);
}

/**
 * Konvertiert Duration-Array [h, m, s] in Stunden
 */
function durationToHours(duration) {
  if (!duration || duration.length !== 3) return 0;
  return duration[0] + duration[1] / 60 + duration[2] / 3600;
}

/**
 * Normalisiert Speaker-Namen für konsistente IDs
 */
function normalizeSpeakerName(name) {
  // Entfernt Sonderzeichen und konvertiert zu lowercase für ID
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
 * Aggregiert Speaker-Daten nach Jahren
 */
function aggregateSpeakersByYear(episodes) {
  const speakersByYear = new Map();
  const speakerMetadata = new Map();
  const years = new Set();
  
  // Sammle alle Daten
  for (const episode of episodes) {
    const year = getYear(episode.date);
    years.add(year);
    
    for (const speakerName of episode.speakers) {
      const speakerId = normalizeSpeakerName(speakerName);
      
      // Initialisiere Speaker-Metadaten
      if (!speakerMetadata.has(speakerId)) {
        speakerMetadata.set(speakerId, {
          id: speakerId,
          name: speakerName,
          totalEpisodes: 0,
          totalDurationHours: 0,
          firstAppearance: year,
          lastAppearance: year,
          episodes: []
        });
      }
      
      const metadata = speakerMetadata.get(speakerId);
      
      // Only add episode if not already in list (prevent duplicates)
      if (!metadata.episodes.includes(episode.number)) {
        metadata.episodes.push(episode.number);
        metadata.totalEpisodes++;
        metadata.totalDurationHours += durationToHours(episode.duration);
      }
      
      metadata.firstAppearance = Math.min(metadata.firstAppearance, year);
      metadata.lastAppearance = Math.max(metadata.lastAppearance, year);
      
      // Aggregiere nach Jahr
      const yearKey = `${speakerId}-${year}`;
      if (!speakersByYear.has(yearKey)) {
        speakersByYear.set(yearKey, {
          speakerId,
          speakerName,
          year,
          episodeCount: 0,
          durationHours: 0,
          episodes: []
        });
      }
      
      const yearData = speakersByYear.get(yearKey);
      yearData.episodeCount++;
      yearData.durationHours += durationToHours(episode.duration);
      
      // Only add episode if not already in list (prevent duplicates)
      if (!yearData.episodes.includes(episode.number)) {
        yearData.episodes.push(episode.number);
      }
    }
  }
  
  return {
    speakersByYear: Array.from(speakersByYear.values()),
    speakerMetadata: Array.from(speakerMetadata.values()),
    years: Array.from(years).sort()
  };
}

/**
 * Erstellt die finale Datenstruktur für das Speaker River Chart
 */
function createRiverData(aggregated, episodes) {
  const { speakersByYear, speakerMetadata, years } = aggregated;
  
  // Sortiere Speaker nach Gesamtzahl der Episoden
  const sortedSpeakers = speakerMetadata
    .sort((a, b) => b.totalEpisodes - a.totalEpisodes);
  
  // Erstelle Zeitreihen für jeden Speaker
  const speakers = sortedSpeakers.map(speaker => {
    const timeline = years.map(year => {
      const yearData = speakersByYear.find(
        d => d.speakerId === speaker.id && d.year === year
      );
      
      return {
        year,
        episodeCount: yearData ? yearData.episodeCount : 0,
        durationHours: yearData ? Math.round(yearData.durationHours * 100) / 100 : 0,
        episodes: yearData ? yearData.episodes : []
      };
    });
    
    return {
      id: speaker.id,
      name: speaker.name,
      totalEpisodes: speaker.totalEpisodes,
      totalDurationHours: Math.round(speaker.totalDurationHours * 100) / 100,
      firstAppearance: speaker.firstAppearance,
      lastAppearance: speaker.lastAppearance,
      timeline
    };
  });
  
  // Berechne Statistiken
  const totalEpisodes = episodes.length;
  const totalDurationHours = episodes.reduce(
    (sum, ep) => sum + durationToHours(ep.duration), 
    0
  );
  const totalSpeakers = speakerMetadata.length;
  const totalAppearances = speakersByYear.reduce(
    (sum, d) => sum + d.episodeCount, 
    0
  );
  
  // Top 10 Speaker nach Episode-Count
  const topSpeakersByEpisodeCount = sortedSpeakers.slice(0, 10).map(s => ({
    id: s.id,
    name: s.name,
    count: s.totalEpisodes
  }));
  
  return {
    generatedAt: new Date().toISOString(),
    description: 'Speaker River Daten für Freak Show Podcast - Speaker aggregiert nach Jahren',
    statistics: {
      totalSpeakers,
      totalEpisodes,
      totalAppearances,
      totalDurationHours: Math.round(totalDurationHours * 100) / 100,
      yearRange: {
        start: years[0],
        end: years[years.length - 1]
      },
      years,
      topSpeakersByEpisodeCount
    },
    speakers
  };
}

/**
 * Main-Funktion
 */
async function main() {
  console.log('🎙️  Lade Episode-Daten...');
  const episodes = await loadEpisodes();
  console.log(`✅ ${episodes.length} Episoden geladen`);
  
  console.log('📊 Aggregiere Speaker nach Jahren...');
  const aggregated = aggregateSpeakersByYear(episodes);
  console.log(`✅ ${aggregated.speakerMetadata.length} Speaker gefunden`);
  console.log(`✅ Jahre: ${aggregated.years.join(', ')}`);
  
  console.log('🌊 Erstelle Speaker River Daten...');
  const riverData = createRiverData(aggregated, episodes);
  
  console.log('\n📈 Statistiken:');
  console.log(`   Gesamt Episoden: ${riverData.statistics.totalEpisodes}`);
  console.log(`   Gesamt Speaker: ${riverData.statistics.totalSpeakers}`);
  console.log(`   Gesamt Auftritte: ${riverData.statistics.totalAppearances}`);
  console.log(`   Zeitraum: ${riverData.statistics.yearRange.start} - ${riverData.statistics.yearRange.end}`);
  console.log(`   Gesamt-Dauer: ${riverData.statistics.totalDurationHours.toFixed(2)} Stunden`);
  
  console.log('\n🏆 Top 10 Speaker nach Episode-Count:');
  riverData.statistics.topSpeakersByEpisodeCount.forEach((speaker, i) => {
    console.log(`   ${i + 1}. ${speaker.name}: ${speaker.count} Episoden`);
  });
  
  console.log(`\n💾 Speichere Daten nach ${OUTPUT_FILE}...`);
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(riverData, null, 2),
    'utf-8'
  );
  console.log('✅ Fertig!');
}

// Führe das Skript aus
main().catch(error => {
  console.error('❌ Fehler:', error);
  process.exit(1);
});

