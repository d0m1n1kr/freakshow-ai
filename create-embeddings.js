import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Settings laden
const settings = JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf-8'));

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
  const episodesDir = path.join(__dirname, 'episodes');
  const files = fs.readdirSync(episodesDir);
  
  return files
    .filter(file => file.match(/^\d+-topics\.json$/))
    .map(file => ({
      file: file,
      episodeNumber: parseInt(file.match(/^(\d+)/)[1]),
      path: path.join(episodesDir, file)
    }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

/**
 * Lade alle Topics
 */
function loadAllTopics() {
  const topicsFiles = findTopicsFiles();
  const allTopics = [];
  
  for (const { path: filePath, episodeNumber } of topicsFiles) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    for (const topic of data.topics) {
      allTopics.push({
        episodeNumber,
        topic: topic.topic,
        keywords: topic.keywords || []
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
      existing.episodes.push(t.episodeNumber);
    } else {
      seen.set(key, {
        topic: t.topic,
        keywords: [...t.keywords],
        count: 1,
        episodes: [t.episodeNumber]
      });
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🧠 Erstelle Embeddings-Datenbank für Topics\n');
  
  const embeddingModel = settings.topicClustering?.embeddingModel || 'text-embedding-3-small';
  const batchSize = settings.topicClustering?.embeddingBatchSize || 100;
  const dbFile = path.join(__dirname, 'topic-embeddings.json');
  
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
  console.log('📂 Lade Topics aus Episoden...');
  const allTopics = loadAllTopics();
  const topicsFiles = findTopicsFiles();
  console.log(`   ${allTopics.length} Topics aus ${topicsFiles.length} Episoden geladen`);

  // 2. Dedupliziere
  console.log('\n🔄 Dedupliziere Topics...');
  const uniqueTopics = deduplicateTopics(allTopics);
  console.log(`   ${uniqueTopics.length} einzigartige Topics`);

  // 3. Prüfe ob Update nötig
  const args = process.argv.slice(2);
  const forceUpdate = args.includes('--force') || args.includes('-f');
  
  if (existingDb && !forceUpdate) {
    if (existingDb.embeddingModel === embeddingModel && 
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
    const texts = batch.map(t => `${t.topic}. Keywords: ${t.keywords.join(', ')}`);
    
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

  // 5. Speichere Datenbank
  console.log('\n💾 Speichere Datenbank...');
  
  const database = {
    createdAt: new Date().toISOString(),
    embeddingModel: embeddingModel,
    embeddingDimensions: allEmbeddings[0]?.length || 0,
    sourceEpisodes: topicsFiles.length,
    totalTopicsRaw: allTopics.length,
    topics: uniqueTopics.map((topic, i) => ({
      id: i,
      topic: topic.topic,
      keywords: topic.keywords,
      count: topic.count,
      episodes: topic.episodes,
      embedding: allEmbeddings[i]
    }))
  };

  fs.writeFileSync(dbFile, JSON.stringify(database, null, 2), 'utf-8');
  
  const fileSizeMB = (fs.statSync(dbFile).size / 1024 / 1024).toFixed(2);
  console.log(`   Gespeichert: ${dbFile}`);
  console.log(`   Dateigröße: ${fileSizeMB} MB`);
  console.log(`   Dimensionen: ${database.embeddingDimensions}`);

  console.log('\n✅ Embeddings-Datenbank erstellt!');
  console.log('\nNächste Schritte:');
  console.log('   node cluster-topics.js    # Clustering durchführen');
}

// Starte das Skript
main().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});

