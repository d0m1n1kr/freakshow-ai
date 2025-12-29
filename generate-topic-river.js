import fs from 'fs';
import path from 'path';

/**
 * Generiert eine JSON-Datei für Topic River Visualisierung
 * Aggregiert Cluster/Topics aus topic-taxonomy(.json) nach Jahren.
 *
 * Optional: Wenn `topic-taxonomy-detailed.json` vorhanden ist und Occurrences enthält,
 * werden pro Episode zusätzlich `relevanceSec` sowie `occurrences` (mit Positionsdaten)
 * in `topic-river-data.json` angereichert.
 */

const TAXONOMY_FILE = 'topic-taxonomy.json';
const DETAILED_TAXONOMY_FILE = 'topic-taxonomy-detailed.json';
const EPISODES_DIR = 'episodes';
const OUTPUT_FILE = 'topic-river-data.json';

function parseArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return null;
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * Lädt die Taxonomie-Daten
 */
function loadTaxonomy() {
  const taxonomyPath = parseArg('--taxonomy') || TAXONOMY_FILE;
  const detailedPath = parseArg('--taxonomy-detailed') || DETAILED_TAXONOMY_FILE;

  const hasDetailed = fileExists(detailedPath);
  const hasTaxonomy = fileExists(taxonomyPath);

  let taxonomy = null;
  let detailed = null;

  if (hasTaxonomy) {
    console.log(`Lade Taxonomie: ${taxonomyPath}...`);
    taxonomy = JSON.parse(fs.readFileSync(taxonomyPath, 'utf-8'));
  }

  if (hasDetailed) {
    console.log(`Lade Detailed Taxonomie: ${detailedPath}...`);
    detailed = JSON.parse(fs.readFileSync(detailedPath, 'utf-8'));
  }

  if (!taxonomy && !detailed) {
    throw new Error(
      `Keine Taxonomie-Datei gefunden. Erwartet: ${taxonomyPath} oder ${detailedPath} (oder via --taxonomy / --taxonomy-detailed)`
    );
  }

  const taxonomyClusters = Array.isArray(taxonomy?.clusters) ? taxonomy.clusters : null;
  const detailedClusters = Array.isArray(detailed?.clusters) ? detailed.clusters : null;

  // Prefer detailed clusters if they contain occurrences with positions (enrichment mode)
  const detailedHasOccurrences =
    Array.isArray(detailedClusters) &&
    detailedClusters.some(c => Array.isArray(c?.topics) && c.topics.some(t => Array.isArray(t?.occurrences)));

  const baseClusters = detailedHasOccurrences
    ? detailedClusters
    : (taxonomyClusters || detailedClusters || []);

  const baseById = new Map(baseClusters.map(c => [c.id, c]));
  const taxonomyById = taxonomyClusters ? new Map(taxonomyClusters.map(c => [c.id, c])) : null;
  const detailedById = detailedClusters ? new Map(detailedClusters.map(c => [c.id, c])) : null;

  // Build optional per-episode enrichment from detailed occurrences (if present)
  const enrichmentByClusterId = new Map();

  if (detailedHasOccurrences && detailedById) {
    for (const [clusterId, cluster] of detailedById.entries()) {
      const perEpisode = new Map(); // episodeNumber -> { relevanceSec, occurrences[] }
      const topics = Array.isArray(cluster?.topics) ? cluster.topics : [];

      for (const t of topics) {
        const occs = Array.isArray(t?.occurrences) ? t.occurrences : [];
        for (const occ of occs) {
          const epNum = Number.isFinite(occ?.episodeNumber) ? occ.episodeNumber : null;
          if (!Number.isFinite(epNum)) continue;

          const positionSec = Number.isFinite(occ?.positionSec) ? occ.positionSec : null;
          const durationSec = Number.isFinite(occ?.durationSec) ? occ.durationSec : null;

          if (!perEpisode.has(epNum)) perEpisode.set(epNum, { relevanceSec: 0, occurrences: [] });

          const entry = perEpisode.get(epNum);
          if (Number.isFinite(durationSec)) entry.relevanceSec += durationSec;

          // Only push occurrences that have a usable position
          if (Number.isFinite(positionSec)) {
            entry.occurrences.push({
              topic: typeof t?.topic === 'string' ? t.topic : null,
              positionSec,
              durationSec: Number.isFinite(durationSec) ? durationSec : null
            });
          }
        }
      }

      // Sort occurrences per episode by position
      for (const v of perEpisode.values()) {
        v.occurrences.sort((a, b) => (a.positionSec ?? 0) - (b.positionSec ?? 0));
      }

      enrichmentByClusterId.set(clusterId, perEpisode);
    }
  }

  // Normalize cluster shape expected by generator (episodes list, counts, etc.)
  const normalized = [];
  for (const [clusterId, cluster] of baseById.entries()) {
    const tax = taxonomyById ? taxonomyById.get(clusterId) : null;
    const det = detailedById ? detailedById.get(clusterId) : null;

    // Episode list: prefer taxonomy episodes; else derive from enrichment occurrences; else empty.
    let episodes = Array.isArray(tax?.episodes) ? tax.episodes.slice() : null;
    if (!episodes && enrichmentByClusterId.has(clusterId)) {
      episodes = Array.from(enrichmentByClusterId.get(clusterId).keys()).sort((a, b) => a - b);
    }
    if (!episodes) episodes = Array.isArray(cluster?.episodes) ? cluster.episodes.slice() : [];

    // Counts / description
    const topicCount = Number.isFinite(cluster?.topicCount) ? cluster.topicCount : (Number.isFinite(tax?.topicCount) ? tax.topicCount : null);
    const episodeCount =
      Number.isFinite(cluster?.episodeCount) ? cluster.episodeCount :
      (Number.isFinite(tax?.episodeCount) ? tax.episodeCount : episodes.length);

    const name = typeof cluster?.name === 'string' ? cluster.name : (typeof tax?.name === 'string' ? tax.name : clusterId);
    const description =
      typeof cluster?.description === 'string'
        ? cluster.description
        : (typeof tax?.description === 'string'
          ? tax.description
          : `${topicCount ?? ''} Topics in ${episodeCount} Episoden`.trim());

    normalized.push({
      id: clusterId,
      name,
      description,
      topicCount: topicCount ?? undefined,
      episodeCount,
      episodes,
      // for potential future use; not written directly unless we attach to episodes below
      _enrichment: enrichmentByClusterId.get(clusterId) || null,
      // keep reference if needed later
      _relevanceSec: Number.isFinite(det?.relevanceSec) ? det.relevanceSec : (Number.isFinite(cluster?.relevanceSec) ? cluster.relevanceSec : null)
    });
  }

  return normalized;
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
    
    const enrichment = topic?._enrichment instanceof Map ? topic._enrichment : null;

    // Für jede Episode in diesem Topic
    for (const episodeNumber of topic.episodes) {
      const metadata = loadEpisodeMetadata(episodeNumber);
      
      if (metadata && metadata.date) {
        const year = getYear(metadata.date);
        
        if (year) {
          if (!topicYearCounts[topic.id][year]) {
            topicYearCounts[topic.id][year] = {
              count: 0,
              episodes: [],
              totalRelevanceSec: 0,
              totalOccurrences: 0
            };
          }
          
          topicYearCounts[topic.id][year].count++;
          const enrich = enrichment ? enrichment.get(episodeNumber) : null;
          const relevanceSec = enrich && Number.isFinite(enrich?.relevanceSec) ? enrich.relevanceSec : null;
          const occurrences = enrich && Array.isArray(enrich?.occurrences) ? enrich.occurrences : null;

          if (Number.isFinite(relevanceSec)) topicYearCounts[topic.id][year].totalRelevanceSec += relevanceSec;
          if (Array.isArray(occurrences)) topicYearCounts[topic.id][year].totalOccurrences += occurrences.length;

          topicYearCounts[topic.id][year].episodes.push({
            number: episodeNumber,
            date: metadata.date,
            title: metadata.title,
            relevanceSec: Number.isFinite(relevanceSec) ? relevanceSec : undefined,
            occurrences: Array.isArray(occurrences) ? occurrences : undefined
          });
        }
      }
    }
    
    // Konvertiere in Array-Format für bessere Visualisierung
    const yearData = [];
    const years = Object.keys(topicYearCounts[topic.id]).sort();
    
    let totalRelevanceSec = 0;
    let totalOccurrences = 0;

    for (const year of years) {
      const yr = topicYearCounts[topic.id][year];
      totalRelevanceSec += Number.isFinite(yr?.totalRelevanceSec) ? yr.totalRelevanceSec : 0;
      totalOccurrences += Number.isFinite(yr?.totalOccurrences) ? yr.totalOccurrences : 0;

      yearData.push({
        year: parseInt(year),
        count: yr.count,
        totalRelevanceSec: yr.totalRelevanceSec || undefined,
        totalOccurrences: yr.totalOccurrences || undefined,
        episodes: yr.episodes
      });
    }
    
    result[topic.id] = {
      id: topic.id,
      name: topic.name,
      description: topic.description,
      totalEpisodes: topic.episodeCount,
      totalTopics: topic.topicCount,
      totalRelevanceSec: totalRelevanceSec || undefined,
      totalOccurrences: totalOccurrences || undefined,
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

