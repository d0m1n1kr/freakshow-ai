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
 * Lade Embeddings-Datenbank
 */
function loadEmbeddingsDatabase() {
  const dbFile = path.join(__dirname, 'topic-embeddings.json');
  
  if (!fs.existsSync(dbFile)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(dbFile, 'utf-8'));
}

/**
 * Lade Topic Taxonomie (256 Cluster)
 */
function loadTopicTaxonomy() {
  const taxFile = path.join(__dirname, 'topic-taxonomy.json');
  
  if (!fs.existsSync(taxFile)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(taxFile, 'utf-8'));
}

/**
 * Berechne Kosinus-Ähnlichkeit zwischen zwei Vektoren
 */
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Berechne Centroid eines Clusters aus mehreren Embeddings
 */
function computeCentroid(embeddings, weights = null) {
  if (embeddings.length === 0) return null;
  
  const dim = embeddings[0].length;
  const centroid = Array(dim).fill(0);
  let totalWeight = 0;
  
  for (let i = 0; i < embeddings.length; i++) {
    const weight = weights ? weights[i] : 1;
    totalWeight += weight;
    
    for (let d = 0; d < dim; d++) {
      centroid[d] += embeddings[i][d] * weight;
    }
  }
  
  // Normalisieren
  for (let d = 0; d < dim; d++) {
    centroid[d] /= totalWeight;
  }
  
  return centroid;
}

/**
 * Erstelle Cluster-Embeddings basierend auf ihren Topics
 */
function createClusterEmbeddings(taxonomy, embeddingsDb) {
  console.log('   Erstelle Cluster-Embeddings...');
  
  // Erstelle einen Index: topic -> embedding
  const topicEmbeddingMap = new Map();
  for (const item of embeddingsDb.topics) {
    topicEmbeddingMap.set(item.topic, item.embedding);
  }
  
  const clusterEmbeddings = [];
  
  for (const cluster of taxonomy.clusters) {
    // Sammle alle Embeddings für Topics in diesem Cluster
    const embeddings = [];
    const weights = [];
    
    // Nutze die sampleTopics als Repräsentation
    for (const sampleTopic of cluster.sampleTopics || []) {
      const embedding = topicEmbeddingMap.get(sampleTopic);
      if (embedding) {
        embeddings.push(embedding);
        weights.push(1); // Gleiche Gewichtung für Sample-Topics
      }
    }
    
    // Falls keine Sample-Topics gefunden, überspringe
    if (embeddings.length === 0) {
      console.warn(`   ⚠️  Keine Embeddings für Cluster "${cluster.name}" gefunden`);
      continue;
    }
    
    // Berechne gewichteten Centroid
    const centroid = computeCentroid(embeddings, weights);
    
    clusterEmbeddings.push({
      id: cluster.id,
      name: cluster.name,
      description: cluster.description,
      embedding: centroid,
      episodeCount: cluster.episodeCount,
      topicCount: cluster.topicCount,
      episodes: cluster.episodes,
      sampleTopics: cluster.sampleTopics
    });
  }
  
  console.log(`   ✓ ${clusterEmbeddings.length} Cluster-Embeddings erstellt`);
  return clusterEmbeddings;
}

/**
 * Hierarchisches Clustering für Kategorien mit Size-Balancing
 */
function hierarchicalCategoryClustering(clusterEmbeddings, targetCategories) {
  console.log(`   Starte Clustering mit Ziel: ${targetCategories} Kategorien...`);
  
  const n = clusterEmbeddings.length;
  
  // Initialisiere: Jeder Cluster ist seine eigene Kategorie
  let categories = clusterEmbeddings.map((cluster, i) => ({
    id: i,
    clusters: [cluster],
    embedding: cluster.embedding,
    totalEpisodes: cluster.episodeCount,
    totalTopics: cluster.topicCount
  }));
  
  // Berechne Distanz-Matrix
  console.log('   Berechne Distanz-Matrix...');
  const distances = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = 1 - cosineSimilarity(
        clusterEmbeddings[i].embedding,
        clusterEmbeddings[j].embedding
      );
      distances[i][j] = dist;
      distances[j][i] = dist;
    }
  }
  
  // Merge bis zur Zielanzahl
  console.log('   Merge Kategorien (mit Size-Balancing)...');
  let lastProgress = 0;
  
  while (categories.length > targetCategories) {
    let bestScore = Infinity;
    let mergeI = 0, mergeJ = 1;
    
    // Berechne durchschnittliche Kategorie-Größe
    const avgSize = categories.reduce((sum, cat) => sum + cat.clusters.length, 0) / categories.length;
    const maxSize = Math.max(...categories.map(cat => cat.clusters.length));
    
    // Finde bestes Paar zum Mergen
    for (let i = 0; i < categories.length; i++) {
      for (let j = i + 1; j < categories.length; j++) {
        // Berechne durchschnittliche Distanz zwischen allen Clustern
        let totalDist = 0;
        let count = 0;
        
        for (const clusterA of categories[i].clusters) {
          for (const clusterB of categories[j].clusters) {
            const idxA = clusterEmbeddings.findIndex(c => c.id === clusterA.id);
            const idxB = clusterEmbeddings.findIndex(c => c.id === clusterB.id);
            totalDist += distances[idxA][idxB];
            count++;
          }
        }
        
        const avgDist = totalDist / count;
        
        // Size-Penalty: Verhindere, dass große Kategorien noch größer werden
        const newSize = categories[i].clusters.length + categories[j].clusters.length;
        const sizePenalty = Math.pow(newSize / avgSize, 2); // Quadratische Strafe
        
        // Starke Penalty für sehr große Kategorien
        const maxPenalty = (newSize > avgSize * 2) ? 5.0 : 1.0;
        
        // Kombinierter Score (niedrig = besser)
        const score = avgDist * sizePenalty * maxPenalty;
        
        if (score < bestScore) {
          bestScore = score;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    
    // Merge die zwei besten Kategorien
    const mergedClusters = [...categories[mergeI].clusters, ...categories[mergeJ].clusters];
    
    // Berechne neuen Centroid (gewichtet nach Episode-Anzahl)
    const embeddings = mergedClusters.map(c => c.embedding);
    const weights = mergedClusters.map(c => c.episodeCount);
    const newEmbedding = computeCentroid(embeddings, weights);
    
    const newCategory = {
      id: categories[mergeI].id,
      clusters: mergedClusters,
      embedding: newEmbedding,
      totalEpisodes: categories[mergeI].totalEpisodes + categories[mergeJ].totalEpisodes,
      totalTopics: categories[mergeI].totalTopics + categories[mergeJ].totalTopics
    };
    
    categories = categories.filter((_, idx) => idx !== mergeI && idx !== mergeJ);
    categories.push(newCategory);
    
    const progress = Math.floor((1 - (categories.length - targetCategories) / (n - targetCategories)) * 100);
    if (progress > lastProgress + 10) {
      process.stdout.write(`   Progress: ${progress}% (${categories.length} Kategorien)\r`);
      lastProgress = progress;
    }
  }
  
  console.log(`   Progress: 100% (${categories.length} Kategorien)   `);
  return categories;
}

/**
 * Ruft das LLM auf für Kategorie-Benennung
 */
async function callLLMForCategoryNaming(clusterNames, retryCount = 0) {
  const { apiKey, baseURL, temperature } = settings.llm;
  const model = settings.topicClustering?.model || settings.llm.model;
  const maxRetries = settings.topicExtraction?.maxRetries || 3;
  const retryDelayMs = settings.topicExtraction?.retryDelayMs || 5000;

  const systemPrompt = `Du bist ein Experte für Kategorisierung und Themen-Taxonomien. Deine Aufgabe ist es, für eine Gruppe von Topic-Clustern einen übergeordneten Kategorie-Namen zu finden.

Regeln:
- Der Name sollte 1-4 Wörter lang sein
- Wähle einen SPEZIFISCHEN, unterscheidbaren Begriff (z.B. "KI & Machine Learning", "Mobile Geräte", "Podcasting & Audio")
- VERMEIDE generische Begriffe wie "Technologie & Innovation" - sei konkreter!
- Fokussiere auf das SPEZIFISCHE Thema, nicht das Übergeordnete
- Beispiele für gute Namen: "iPhone & iOS", "Bitcoin & Blockchain", "Podcasting", "Raumfahrt"
- Beispiele für schlechte Namen: "Technologie", "Innovation", "Allgemein"
- Die Cluster sind nach Relevanz sortiert - die ersten sind wichtiger!
- Antworte NUR mit dem Kategorie-Namen, nichts anderes`;

  const userPrompt = `Finde einen übergeordneten Kategorie-Namen für diese Gruppe von Topic-Clustern (sortiert nach Relevanz):

${clusterNames.slice(0, 15).map((name, i) => `${i + 1}. ${name}`).join('\n')}

Kategorie-Name:`;

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: temperature || 0.3,
        max_tokens: 50
      })
    });

    if (response.status === 429) {
      if (retryCount < maxRetries) {
        await sleep(retryDelayMs * Math.pow(2, retryCount));
        return callLLMForCategoryNaming(clusterNames, retryCount + 1);
      }
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.choices[0].message.content.trim().replace(/["']/g, '');
  } catch {
    return null;
  }
}

/**
 * Benenne Kategorien basierend auf ihren Clustern
 */
async function nameCategoriesWithLLM(categories) {
  console.log('🏷️  Benenne Kategorien mit LLM...');
  
  const delayMs = settings.topicExtraction?.requestDelayMs || 1000;
  const namedCategories = [];
  
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    
    // Sortiere Cluster nach Episode-Anzahl
    const sortedClusters = [...category.clusters]
      .sort((a, b) => b.episodeCount - a.episodeCount);
    
    const clusterNames = sortedClusters.map(c => c.name);
    
    // Rufe LLM auf
    const name = await callLLMForCategoryNaming(clusterNames);
    
    if (name) {
      process.stdout.write(`   ${i + 1}/${categories.length}: "${name}"          \r`);
    } else {
      // Fallback: Nutze häufigsten Cluster-Namen
      const fallbackName = sortedClusters[0].name;
      process.stdout.write(`   ${i + 1}/${categories.length}: "${fallbackName}" (Fallback)          \r`);
      namedCategories.push({
        name: fallbackName,
        category: category
      });
      await sleep(delayMs);
      continue;
    }
    
    namedCategories.push({
      name: name,
      category: category
    });
    
    await sleep(delayMs);
  }
  
  console.log(`\n   ✓ ${namedCategories.length} Kategorien benannt`);
  return namedCategories;
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🎯 Topic-Kategorien Clustering für Freakshow\n');
  
  const targetCategories = settings.categoryGrouping?.categories || 12;
  
  // 1. Lade Daten
  console.log('📂 Lade Daten...');
  const embeddingsDb = loadEmbeddingsDatabase();
  const taxonomy = loadTopicTaxonomy();
  
  if (!embeddingsDb) {
    console.log('\n❌ Keine Embeddings-Datenbank gefunden!');
    console.log('   Erstelle zuerst mit: node create-embeddings.js\n');
    process.exit(1);
  }
  
  if (!taxonomy) {
    console.log('\n❌ Keine Topic-Taxonomie gefunden!');
    console.log('   Erstelle zuerst mit: node cluster-topics.js\n');
    process.exit(1);
  }
  
  console.log(`   ✓ ${embeddingsDb.topics.length} Topic-Embeddings geladen`);
  console.log(`   ✓ ${taxonomy.clusters.length} Topic-Cluster geladen`);
  console.log(`   Ziel: ${targetCategories} Kategorien\n`);
  
  // 2. Erstelle Cluster-Embeddings
  console.log('🔬 Erstelle Cluster-Embeddings...');
  const clusterEmbeddings = createClusterEmbeddings(taxonomy, embeddingsDb);
  
  // 3. Clustere zu Kategorien
  console.log('\n📊 Erstelle Kategorien...');
  const categories = hierarchicalCategoryClustering(clusterEmbeddings, targetCategories);
  console.log(`   ✓ ${categories.length} Kategorien erstellt\n`);
  
  // 4. Benenne Kategorien
  const namedCategories = await nameCategoriesWithLLM(categories);
  
  // 5. Erstelle finale Struktur
  console.log('\n📦 Erstelle finale Struktur...');
  
  const result = namedCategories.map(nc => {
    const category = nc.category;
    
    // Sammle alle Episoden
    const allEpisodes = new Set();
    for (const cluster of category.clusters) {
      for (const ep of cluster.episodes) {
        allEpisodes.add(ep);
      }
    }
    
    // Sortiere Cluster nach Episode-Anzahl
    const sortedClusters = [...category.clusters]
      .sort((a, b) => b.episodeCount - a.episodeCount);
    
    return {
      id: nc.name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      name: nc.name,
      description: `${category.clusters.length} Cluster in ${allEpisodes.size} Episoden`,
      clusterCount: category.clusters.length,
      topicCount: category.totalTopics,
      episodeCount: allEpisodes.size,
      clusters: sortedClusters.map(c => ({
        id: c.id,
        name: c.name,
        episodeCount: c.episodeCount,
        topicCount: c.topicCount
      })),
      episodes: Array.from(allEpisodes).sort((a, b) => a - b),
      sampleClusters: sortedClusters.slice(0, 5).map(c => c.name)
    };
  });
  
  // Sortiere nach Episode-Anzahl
  result.sort((a, b) => b.episodeCount - a.episodeCount);
  
  // 6. Speichere Ergebnis
  const outputFile = path.join(__dirname, 'topic-categories.json');
  const output = {
    createdAt: new Date().toISOString(),
    method: 'hierarchical-category-clustering',
    sourceFile: 'topic-taxonomy.json',
    targetCategories: targetCategories,
    statistics: {
      categoryCount: result.length,
      totalClusters: taxonomy.clusters.length,
      avgClustersPerCategory: (taxonomy.clusters.length / result.length).toFixed(1)
    },
    categories: result
  };
  
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✅ Kategorien gespeichert: ${outputFile}\n`);
  
  // Zeige Ergebnis
  console.log('📋 Kategorien:');
  result.forEach((cat, i) => {
    console.log(`\n${i + 1}. ${cat.name} (${cat.episodeCount} Episoden, ${cat.clusterCount} Cluster)`);
    console.log(`   Beispiel-Cluster: ${cat.sampleClusters.join(', ')}`);
  });
  
  console.log('\n✨ Statistik:');
  console.log(`   ${result.length} Kategorien erstellt`);
  console.log(`   Ø ${output.statistics.avgClustersPerCategory} Cluster pro Kategorie`);
  console.log('\n💡 Nächster Schritt: node generate-category-river.js');
}

// Starte das Skript
main().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});

