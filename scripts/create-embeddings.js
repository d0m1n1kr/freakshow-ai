import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const podcastIndex = args.indexOf('--podcast');
const PODCAST_ID = podcastIndex !== -1 && args[podcastIndex + 1] ? args[podcastIndex + 1] : 'freakshow';
const PROJECT_ROOT = path.join(__dirname, '..');

// Settings laden
const settings = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'settings.json'), 'utf-8'));

/**
 * Wartet für eine bestimmte Zeit
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Erstelle Embeddings für eine Liste von Texten
 */
async function createEmbeddings(texts, retryCount = 0) {
  const { apiKey, baseURL } = settings.llm;
  const embeddingModel = settings.topicClustering?.embeddingModel || 'text-embedding-3-small';
  const maxRetries = settings.topicExtraction?.maxRetries || 3;
  const retryDelayMs = settings.topicExtraction?.retryDelayMs || 5000;

  try {
    const response = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: embeddingModel,
        input: texts
      })
    });

    if (response.status === 429) {
      if (retryCount < maxRetries) {
        const waitTime = retryDelayMs * Math.pow(2, retryCount);
        console.log(`  ⏳ Rate limit, warte ${waitTime / 1000}s... (${retryCount + 1}/${maxRetries})`);
        await sleep(waitTime);
        return createEmbeddings(texts, retryCount + 1);
      }
      throw new Error('Rate limit erreicht');
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Embedding API Fehler: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.data.map(d => d.embedding);
  } catch (error) {
    if (error.message.includes('fetch failed') && retryCount < maxRetries) {
      const waitTime = retryDelayMs * Math.pow(2, retryCount);
      console.log(`  ⏳ Netzwerkfehler, warte ${waitTime / 1000}s...`);
      await sleep(waitTime);
      return createEmbeddings(texts, retryCount + 1);
    }
    throw error;
  }
}

/**
 * Finde alle Topics-Dateien
 */
function findTopicsFiles() {
  const episodesDir = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');
  
  if (!fs.existsSync(episodesDir)) {
    console.error(`\n❌ Episoden-Verzeichnis nicht gefunden: ${episodesDir}`);
    console.error(`   Podcast ID: ${PODCAST_ID}`);
    console.error(`   Projekt-Root: ${PROJECT_ROOT}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(episodesDir);
  const topicsFiles = files
    .filter(file => file.match(/^\d+-topics\.json$/))
    .map(file => ({
      file: file,
      episodeNumber: parseInt(file.match(/^(\d+)/)[1]),
      path: path.join(episodesDir, file)
    }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
  
  if (topicsFiles.length === 0) {
    console.warn(`\n⚠️  Keine Topics-Dateien gefunden in: ${episodesDir}`);
    console.warn(`   Gefundene Dateien: ${files.filter(f => f.endsWith('.json')).slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
  }
  
  return topicsFiles;
}

/**
 * Lade alle Topics mit Fallback zu extended-topics für Timestamps
 */
function loadAllTopics() {
  const topicsFiles = findTopicsFiles();
  const allTopics = [];
  const episodesDir = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');
  
  // Lade Extended Topics für alle Episoden (für Fallback-Timestamps)
  const extendedTopicsByEpisode = new Map();
  for (const { episodeNumber } of topicsFiles) {
    const extendedTopicsFile = path.join(episodesDir, `${episodeNumber}-extended-topics.json`);
    if (fs.existsSync(extendedTopicsFile)) {
      try {
        const extendedData = JSON.parse(fs.readFileSync(extendedTopicsFile, 'utf-8'));
        const extendedTopics = Array.isArray(extendedData.topics) ? extendedData.topics : [];
        // Erstelle Map: topic name -> { startSec, endSec }
        const topicMap = new Map();
        for (const et of extendedTopics) {
          const topicName = typeof et?.topic === 'string' ? et.topic.trim() : '';
          if (topicName) {
            const startSec = Number.isFinite(et?.summaryMeta?.startSec) ? Math.floor(et.summaryMeta.startSec) : null;
            const endSec = Number.isFinite(et?.summaryMeta?.endSec) ? Math.floor(et.summaryMeta.endSec) : null;
            if (startSec !== null) {
              topicMap.set(topicName.toLowerCase(), { startSec, endSec });
            }
          }
        }
        extendedTopicsByEpisode.set(episodeNumber, topicMap);
      } catch (e) {
        // Ignore errors loading extended topics
      }
    }
  }
  
  for (const { path: filePath, episodeNumber } of topicsFiles) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const extendedTopicMap = extendedTopicsByEpisode.get(episodeNumber) || new Map();
    
    for (const topic of data.topics) {
      const subjectCoarse =
        (topic?.subject && typeof topic.subject.coarse === 'string' && topic.subject.coarse.trim()) ||
        (typeof topic?.subjectCoarse === 'string' && topic.subjectCoarse.trim()) ||
        null;
      const subjectFine =
        (topic?.subject && typeof topic.subject.fine === 'string' && topic.subject.fine.trim()) ||
        (typeof topic?.subjectFine === 'string' && topic.subjectFine.trim()) ||
        null;

      // Versuche positionSec aus topics.json
      let positionSec =
        Number.isFinite(topic?.positionSec) ? topic.positionSec : (topic?.positionSec != null ? parseInt(topic.positionSec, 10) : null);
      
      // Fallback: verwende startSec aus extended-topics.json
      if (positionSec === null) {
        const topicName = typeof topic?.topic === 'string' ? topic.topic.trim() : '';
        if (topicName) {
          const extendedTopic = extendedTopicMap.get(topicName.toLowerCase());
          if (extendedTopic && extendedTopic.startSec !== null) {
            positionSec = extendedTopic.startSec;
          }
        }
      }

      // Versuche durationSec aus topics.json
      let durationSec =
        Number.isFinite(topic?.durationSec) ? topic.durationSec : (topic?.durationSec != null ? parseInt(topic.durationSec, 10) : null);
      
      // Fallback: berechne durationSec aus extended-topics (endSec - startSec)
      if (durationSec === null) {
        const topicName = typeof topic?.topic === 'string' ? topic.topic.trim() : '';
        if (topicName) {
          const extendedTopic = extendedTopicMap.get(topicName.toLowerCase());
          if (extendedTopic && extendedTopic.startSec !== null && extendedTopic.endSec !== null) {
            durationSec = Math.max(0, extendedTopic.endSec - extendedTopic.startSec);
          }
        }
      }

      allTopics.push({
        episodeNumber,
        topic: topic.topic,
        keywords: Array.isArray(topic.keywords) ? topic.keywords : [],
        subject: {
          coarse: subjectCoarse,
          fine: subjectFine
        },
        durationSec: Number.isFinite(durationSec) ? durationSec : null,
        positionSec: Number.isFinite(positionSec) ? positionSec : null
      });
    }
  }
  
  return allTopics;
}

/**
 * Dedupliziere Topics (ähnliche zusammenfassen)
 */
function deduplicateTopics(topics) {
  const seen = new Map();
  
  for (const t of topics) {
    const key = t.topic.toLowerCase().trim();
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.count++;
      for (const kw of t.keywords) {
        if (!existing.keywords.includes(kw)) {
          existing.keywords.push(kw);
        }
      }
      if (!existing.episodes.includes(t.episodeNumber)) {
        existing.episodes.push(t.episodeNumber);
      }

      existing.occurrences.push({
        episodeNumber: t.episodeNumber,
        subject: {
          coarse: t.subject?.coarse || null,
          fine: t.subject?.fine || null
        },
        durationSec: t.durationSec ?? null,
        positionSec: t.positionSec ?? null
      });
    } else {
      seen.set(key, {
        topic: t.topic,
        keywords: [...t.keywords],
        count: 1,
        episodes: [t.episodeNumber],
        occurrences: [
          {
            episodeNumber: t.episodeNumber,
            subject: {
              coarse: t.subject?.coarse || null,
              fine: t.subject?.fine || null
            },
            durationSec: t.durationSec ?? null,
            positionSec: t.positionSec ?? null
          }
        ]
      });
    }
  }
  
  return Array.from(seen.values());
}

function buildSubjectKeywordsFromOccurrences(occurrences) {
  const kws = new Set();
  if (!Array.isArray(occurrences)) return [];
  for (const o of occurrences) {
    const coarse = o?.subject?.coarse;
    const fine = o?.subject?.fine;
    if (typeof coarse === 'string' && coarse.trim()) kws.add(coarse.trim());
    if (typeof fine === 'string' && fine.trim()) kws.add(fine.trim());
  }
  return Array.from(kws);
}

function computeTopSubjects(occurrences, max = 3) {
  const counts = new Map();
  if (!Array.isArray(occurrences)) return [];
  for (const o of occurrences) {
    const coarse = typeof o?.subject?.coarse === 'string' ? o.subject.coarse.trim() : '';
    const fine = typeof o?.subject?.fine === 'string' ? o.subject.fine.trim() : '';
    const key = `${coarse} /// ${fine}`.trim();
    if (!key || key === '///') continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([k]) => {
      const [coarse, fine] = k.split(' /// ').map(s => s.trim());
      if (coarse && fine) return `${coarse} / ${fine}`;
      return coarse || fine || k;
    });
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log(`🧠 Erstelle Embeddings-Datenbank für Topics (Podcast: ${PODCAST_ID})\n`);
  
  const embeddingModel = settings.topicClustering?.embeddingModel || 'text-embedding-3-small';
  const batchSize = settings.topicClustering?.embeddingBatchSize || 100;
  const dbDir = path.join(PROJECT_ROOT, 'db', PODCAST_ID);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const dbFile = path.join(dbDir, 'topic-embeddings.json');
  const schemaVersion = 2;
  
  console.log(`Embedding-Modell: ${embeddingModel}`);
  console.log(`Batch-Größe: ${batchSize}\n`);

  // Prüfe ob bereits eine Datenbank existiert
  let existingDb = null;
  if (fs.existsSync(dbFile)) {
    existingDb = JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
    console.log(`📂 Existierende Datenbank gefunden:`);
    console.log(`   Modell: ${existingDb.embeddingModel}`);
    console.log(`   Topics: ${existingDb.topics.length}`);
    console.log(`   Erstellt: ${existingDb.createdAt}\n`);
  }

  // 1. Lade alle Topics
  console.log(`📂 Lade Topics aus Episoden (Podcast: ${PODCAST_ID})...`);
  const episodesDir = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');
  if (!fs.existsSync(episodesDir)) {
    console.error(`\n❌ Episoden-Verzeichnis nicht gefunden: ${episodesDir}`);
    console.error(`   Stelle sicher, dass die Episoden-Daten für Podcast '${PODCAST_ID}' existieren.`);
    process.exit(1);
  }
  const allTopics = loadAllTopics();
  const topicsFiles = findTopicsFiles();
  console.log(`   ${allTopics.length} Topics aus ${topicsFiles.length} Episoden geladen`);
  
  if (allTopics.length === 0) {
    console.error(`\n❌ Keine Topics gefunden!`);
    console.error(`   Episoden-Verzeichnis: ${episodesDir}`);
    console.error(`   Gefundene Topics-Dateien: ${topicsFiles.length}`);
    if (topicsFiles.length === 0) {
      console.error(`   Stelle sicher, dass Topics extrahiert wurden mit:`);
      console.error(`   node scripts/extract-topics.js --podcast ${PODCAST_ID} --all`);
    }
    process.exit(1);
  }

  // 2. Dedupliziere
  console.log('\n🔄 Dedupliziere Topics...');
  const uniqueTopics = deduplicateTopics(allTopics);
  console.log(`   ${uniqueTopics.length} einzigartige Topics`);

  // 3. Prüfe ob Update nötig
  const args = process.argv.slice(2);
  const forceUpdate = args.includes('--force') || args.includes('-f');
  
  if (existingDb && !forceUpdate) {
    if (existingDb.schemaVersion === schemaVersion &&
        existingDb.embeddingModel === embeddingModel && 
        existingDb.topics.length === uniqueTopics.length) {
      console.log('\n✅ Datenbank ist aktuell. Nutze --force für Neuerstellung.');
      return;
    }
    console.log('\n⚠️  Änderungen erkannt, aktualisiere Datenbank...');
  }

  // 4. Erstelle Embeddings
  console.log('\n🧠 Erstelle Embeddings...');
  const allEmbeddings = [];
  
  for (let i = 0; i < uniqueTopics.length; i += batchSize) {
    const batch = uniqueTopics.slice(i, i + batchSize);
    const texts = batch.map(t => {
      const topSubjects = computeTopSubjects(t.occurrences, 3);
      const subjectLine = topSubjects.length > 0 ? `\nSubject: ${topSubjects.join('; ')}` : '';
      const keywordLine = (t.keywords && t.keywords.length > 0) ? `\nKeywords: ${t.keywords.slice(0, 12).join(', ')}` : '';
      return `Topic: ${t.topic}${subjectLine}${keywordLine}`;
    });
    
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(uniqueTopics.length / batchSize);
    console.log(`   Batch ${batchNum}/${totalBatches} (${batch.length} Topics)...`);
    
    const embeddings = await createEmbeddings(texts);
    allEmbeddings.push(...embeddings);
    
    if (i + batchSize < uniqueTopics.length) {
      await sleep(500);
    }
  }
  console.log(`   ${allEmbeddings.length} Embeddings erstellt`);

  // 5. Speichere Datenbank (LanceDB)
  console.log('\n💾 Speichere Datenbank...');
  
  const embeddingDimensions = allEmbeddings[0]?.length || 0;
  const createdAt = new Date().toISOString();
  
  const lancedb = await import('@lancedb/lancedb');
  const lanceDir = path.join(dbDir, 'lance');
  if (!fs.existsSync(lanceDir)) {
    fs.mkdirSync(lanceDir, { recursive: true });
  }
  
  const lanceDb = await lancedb.connect(lanceDir);
  
  const records = uniqueTopics.map((topic, idx) => ({
    id: idx,
    topic: topic.topic,
    keywords: JSON.stringify(Array.from(new Set([...(topic.keywords || []), ...buildSubjectKeywordsFromOccurrences(topic.occurrences)]))),
    count: topic.count,
    episodes: JSON.stringify(topic.episodes),
    occurrences: JSON.stringify(topic.occurrences),
    vector: allEmbeddings[idx],
  }));
  
  const tableNames = await lanceDb.tableNames();
  if (tableNames.includes('topics')) {
    await lanceDb.dropTable('topics');
  }
  
  await lanceDb.createTable('topics', records);
  
  // Save metadata
  const metaPath = path.join(lanceDir, 'metadata.json');
  const existingMeta = fs.existsSync(metaPath) 
    ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')) 
    : {};
  
  fs.writeFileSync(metaPath, JSON.stringify({
    ...existingMeta,
    topics: {
      type: 'topic-embeddings',
      schemaVersion,
      createdAt: createdAt,
      updatedAt: new Date().toISOString(),
      embeddingModel: embeddingModel,
      embeddingDimensions: embeddingDimensions,
      totalTopics: allTopics.length,
      uniqueTopics: uniqueTopics.length,
      recordCount: records.length,
    },
  }, null, 2));
  
  const lanceSizeMB = ((await getDirSize(lanceDir)) / 1024 / 1024).toFixed(2);
  console.log(`   Gespeichert: ${lanceDir}`);
  console.log(`   Dateigröße: ${lanceSizeMB} MB`);
  console.log(`   Dimensionen: ${embeddingDimensions}`);

  console.log('\n✅ Embeddings-Datenbank erstellt!');
  console.log('\nNächste Schritte:');
  console.log('   node scripts/cluster-topics.js    # Clustering durchführen');
}

async function getDirSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dirPath, file.name);
    if (file.isDirectory()) {
      size += await getDirSize(filePath);
    } else {
      size += fs.statSync(filePath).size;
    }
  }
  return size;
}

// Starte das Skript
main().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});

