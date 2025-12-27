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
 * Berechne Distanz-Matrix (1 - Kosinus-Ähnlichkeit)
 */
function computeDistanceMatrix(embeddings) {
  const n = embeddings.length;
  const distances = Array(n).fill(null).map(() => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = 1 - cosineSimilarity(embeddings[i], embeddings[j]);
      distances[i][j] = dist;
      distances[j][i] = dist;
    }
  }
  return distances;
}

/**
 * Berechne Cluster-Distanz basierend auf Linkage-Methode
 */
function computeClusterDistance(clusterA, clusterB, distances, weights, linkageMethod) {
  const itemsA = clusterA.items;
  const itemsB = clusterB.items;
  
  switch (linkageMethod) {
    case 'single':
      // Minimale Distanz (nächste Nachbarn)
      let minDist = Infinity;
      for (const i of itemsA) {
        for (const j of itemsB) {
          minDist = Math.min(minDist, distances[i][j]);
        }
      }
      return minDist;
    
    case 'complete':
      // Maximale Distanz (weiteste Nachbarn)
      let maxDist = 0;
      for (const i of itemsA) {
        for (const j of itemsB) {
          maxDist = Math.max(maxDist, distances[i][j]);
        }
      }
      return maxDist;
    
    case 'weighted':
      // Gewichteter Durchschnitt nach Relevanz (Episoden-Anzahl)
      let weightedSum = 0;
      let totalWeight = 0;
      for (const i of itemsA) {
        for (const j of itemsB) {
          const w = (weights[i] || 1) * (weights[j] || 1);
          weightedSum += distances[i][j] * w;
          totalWeight += w;
        }
      }
      return weightedSum / totalWeight;
    
    case 'ward':
      // Ward-Linkage: Minimiert Varianz-Zuwachs
      // Approximation: Distanz zwischen gewichteten Centroids * Größenfaktor
      const nA = clusterA.totalWeight || itemsA.length;
      const nB = clusterB.totalWeight || itemsB.length;
      const centroidDist = 1 - cosineSimilarity(clusterA.embedding, clusterB.embedding);
      return Math.sqrt((2 * nA * nB) / (nA + nB)) * centroidDist;
    
    case 'average':
    default:
      // Durchschnittliche Distanz (Average Linkage)
      let totalDist = 0;
      let count = 0;
      for (const i of itemsA) {
        for (const j of itemsB) {
          totalDist += distances[i][j];
          count++;
        }
      }
      return totalDist / count;
  }
}

/**
 * Berechne gewichteten Centroid
 */
function computeWeightedCentroid(items, embeddings, weights) {
  const dim = embeddings[0].length;
  const centroid = Array(dim).fill(0);
  let totalWeight = 0;
  
  for (const idx of items) {
    const w = weights[idx] || 1;
    totalWeight += w;
    for (let d = 0; d < dim; d++) {
      centroid[d] += embeddings[idx][d] * w;
    }
  }
  
  for (let d = 0; d < dim; d++) {
    centroid[d] /= totalWeight;
  }
  
  return { centroid, totalWeight };
}

/**
 * Hierarchisches Agglomeratives Clustering mit konfigurierbarer Linkage und Gewichtung
 */
function hierarchicalClustering(items, embeddings, targetClusters, options = {}) {
  const { 
    outlierThreshold = 0.7, 
    linkageMethod = 'weighted',
    useRelevanceWeighting = true
  } = options;
  
  const n = items.length;
  
  // Berechne Gewichte (Episoden-Anzahl) für jedes Topic
  const weights = items.map(item => {
    if (useRelevanceWeighting && item.episodes) {
      return item.episodes.length;
    }
    return 1;
  });
  
  console.log(`   Linkage-Methode: ${linkageMethod}`);
  console.log(`   Relevanz-Gewichtung: ${useRelevanceWeighting ? 'Ja' : 'Nein'}`);
  
  // Initialisiere: Jedes Item ist sein eigener Cluster
  let clusters = items.map((item, i) => {
    const w = weights[i];
    return {
      id: i,
      items: [i],
      embedding: embeddings[i],
      totalWeight: w,
      isOutlier: false,
      maxMergeDistance: 0
    };
  });
  
  // Berechne initiale Distanz-Matrix
  console.log('   Berechne Distanz-Matrix...');
  const distances = computeDistanceMatrix(embeddings);
  
  // Merge Cluster bis wir die gewünschte Anzahl erreichen
  console.log('   Merge Cluster...');
  let lastProgress = 0;
  
  while (clusters.length > targetClusters) {
    // Finde die zwei nächsten Cluster
    let minDist = Infinity;
    let mergeI = 0, mergeJ = 1;
    
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const dist = computeClusterDistance(
          clusters[i], clusters[j], distances, weights, linkageMethod
        );
        
        if (dist < minDist) {
          minDist = dist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    
    // Markiere als Outlier wenn die Merge-Distanz zu hoch ist
    if (minDist > outlierThreshold) {
      clusters[mergeI].isOutlier = true;
      clusters[mergeJ].isOutlier = true;
    }
    
    // Merge die zwei nächsten Cluster
    const newItems = [...clusters[mergeI].items, ...clusters[mergeJ].items];
    
    // Berechne gewichteten Centroid
    const { centroid: newEmbedding, totalWeight: newTotalWeight } = 
      useRelevanceWeighting 
        ? computeWeightedCentroid(newItems, embeddings, weights)
        : { 
            centroid: computeUnweightedCentroid(newItems, embeddings),
            totalWeight: newItems.length
          };
    
    const newCluster = {
      id: clusters[mergeI].id,
      items: newItems,
      embedding: newEmbedding,
      totalWeight: newTotalWeight,
      isOutlier: clusters[mergeI].isOutlier || clusters[mergeJ].isOutlier,
      maxMergeDistance: Math.max(minDist, clusters[mergeI].maxMergeDistance, clusters[mergeJ].maxMergeDistance)
    };
    
    // Entferne alte Cluster und füge neuen hinzu
    clusters = clusters.filter((_, idx) => idx !== mergeI && idx !== mergeJ);
    clusters.push(newCluster);
    
    // Progress anzeigen
    const progress = Math.floor((1 - (clusters.length - targetClusters) / (n - targetClusters)) * 100);
    if (progress > lastProgress + 5) {
      process.stdout.write(`   Progress: ${progress}% (${clusters.length} Cluster)\r`);
      lastProgress = progress;
    }
  }
  console.log(`   Progress: 100% (${clusters.length} Cluster)   `);
  
  return clusters;
}

/**
 * Berechne ungewichteten Centroid (Fallback)
 */
function computeUnweightedCentroid(items, embeddings) {
  const dim = embeddings[0].length;
  const centroid = Array(dim).fill(0);
  
  for (const idx of items) {
    for (let d = 0; d < dim; d++) {
      centroid[d] += embeddings[idx][d];
    }
  }
  
  for (let d = 0; d < dim; d++) {
    centroid[d] /= items.length;
  }
  
  return centroid;
}

/**
 * Finde repräsentativen Namen für einen Cluster (mit Relevanz-Gewichtung)
 */
function findClusterName(clusterItems, allTopics, useRelevanceWeighting = true) {
  const keywordCounts = {};
  const topicWords = {};
  
  for (const idx of clusterItems) {
    const topic = allTopics[idx];
    
    // Gewichtung basiert auf Episoden-Anzahl
    const weight = useRelevanceWeighting 
      ? (topic.episodes?.length || topic.count || 1)
      : 1;
    
    // Zähle Keywords (gewichtet)
    for (const kw of topic.keywords || []) {
      const key = kw.toLowerCase();
      keywordCounts[key] = (keywordCounts[key] || 0) + weight;
    }
    
    // Extrahiere wichtige Wörter aus Topic-Namen
    const genericWords = new Set([
      'und', 'der', 'die', 'das', 'in', 'im', 'von', 'für', 'mit', 'über', 'zur', 'zum',
      'diskussion', 'thema', 'themen', 'aspekte', 'entwicklung', 'entwicklungen',
      'nutzung', 'verwendung', 'einsatz', 'einfluss', 'bedeutung', 'rolle',
      'allgemein', 'allgemeine', 'verschiedene', 'aktuelle', 'neue', 'neuen',
      'technologie', 'technologien', 'technik', 'technisch', 'technische',
      'zukunft', 'zukünftige', 'trends', 'trend'
    ]);
    
    const words = topic.topic.toLowerCase()
      .replace(/[^a-zäöüß\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !genericWords.has(w));
    
    for (const word of words) {
      topicWords[word] = (topicWords[word] || 0) + weight;
    }
  }
  
  // Kombiniere Keywords und Topic-Wörter
  const allCounts = { ...topicWords };
  for (const [kw, count] of Object.entries(keywordCounts)) {
    allCounts[kw] = (allCounts[kw] || 0) + count * 2;
  }
  
  const sorted = Object.entries(allCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);
  
  if (sorted.length === 0) {
    return 'Sonstiges';
  }
  
  const name = sorted[0].charAt(0).toUpperCase() + sorted[0].slice(1);
  
  if (sorted.length === 1 || allCounts[sorted[0]] > allCounts[sorted[1]] * 2) {
    return name;
  }
  
  const second = sorted[1].charAt(0).toUpperCase() + sorted[1].slice(1);
  return `${name} & ${second}`;
}

/**
 * Ruft das LLM auf für Cluster-Benennung
 */
async function callLLMForNaming(topics, retryCount = 0) {
  const { apiKey, baseURL, temperature } = settings.llm;
  const model = settings.topicClustering?.model || settings.llm.model;
  const maxRetries = settings.topicExtraction?.maxRetries || 3;
  const retryDelayMs = settings.topicExtraction?.retryDelayMs || 5000;

  const systemPrompt = `Du bist ein Experte für präzise Kategorisierung. Deine Aufgabe ist es, für eine Gruppe von Podcast-Topics einen kurzen, prägnanten Kategorie-Namen zu finden.

Regeln:
- Der Name sollte 1-3 Wörter lang sein
- Sei spezifisch, nicht generisch (z.B. "iPhone" statt "Mobilgeräte", "Podcasting" statt "Medien")
- Wenn es um ein konkretes Produkt/Thema geht, nenne es beim Namen
- Die Topics sind nach Relevanz sortiert - die ersten sind wichtiger!
- Antworte NUR mit dem Kategorie-Namen, nichts anderes`;

  const userPrompt = `Finde einen kurzen, prägnanten Namen für diese Gruppe von Topics (sortiert nach Relevanz, wichtigste zuerst):

${topics.map(t => `- ${t}`).join('\n')}

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
        return callLLMForNaming(topics, retryCount + 1);
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
 * Clustere Child-Cluster zu Parent-Clustern mit Gewichtung nach Relevanz
 */
function clusterChildren(childClusters, targetClusters, options = {}) {
  const { 
    outlierThreshold = 0.7, 
    linkageMethod = 'weighted',
    useRelevanceWeighting = true
  } = options;
  
  const n = childClusters.length;
  
  if (n <= targetClusters) {
    return childClusters.map((cluster, i) => ({
      id: i,
      children: [i],
      embedding: cluster.embedding,
      totalWeight: cluster.episodeCount || cluster.totalWeight || 1,
      isOutlier: cluster.isOutlier || false
    }));
  }
  
  // Erstelle Embeddings und Gewichte aus Child-Clustern
  const embeddings = childClusters.map(c => c.embedding);
  
  // Gewichte basieren auf Episoden-Anzahl der Child-Cluster
  const weights = childClusters.map(c => {
    if (useRelevanceWeighting) {
      return c.episodeCount || c.totalWeight || 1;
    }
    return 1;
  });
  
  console.log(`   Linkage-Methode: ${linkageMethod}`);
  console.log(`   Relevanz-Gewichtung: ${useRelevanceWeighting ? 'Ja' : 'Nein'}`);
  
  // Initialisiere: Jeder Child-Cluster ist seine eigene Gruppe
  let clusters = childClusters.map((cluster, i) => ({
    id: i,
    children: [i],
    embedding: embeddings[i],
    totalWeight: weights[i],
    isOutlier: cluster.isOutlier || false,
    maxMergeDistance: 0
  }));
  
  // Berechne Distanz-Matrix
  console.log('   Berechne Distanz-Matrix...');
  const distances = computeDistanceMatrix(embeddings);
  
  // Merge bis wir die gewünschte Anzahl erreichen
  console.log('   Merge Cluster...');
  let lastProgress = 0;
  
  while (clusters.length > targetClusters) {
    let minDist = Infinity;
    let mergeI = 0, mergeJ = 1;
    
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Verwende die konfigurierte Linkage-Methode
        // Aber für Children-Clustering verwenden wir "children" statt "items"
        const clusterI = { ...clusters[i], items: clusters[i].children };
        const clusterJ = { ...clusters[j], items: clusters[j].children };
        
        const dist = computeClusterDistance(
          clusterI, clusterJ, distances, weights, linkageMethod
        );
        
        if (dist < minDist) {
          minDist = dist;
          mergeI = i;
          mergeJ = j;
        }
      }
    }
    
    // Markiere als Outlier wenn die Merge-Distanz zu hoch ist
    if (minDist > outlierThreshold) {
      clusters[mergeI].isOutlier = true;
      clusters[mergeJ].isOutlier = true;
    }
    
    const newChildren = [...clusters[mergeI].children, ...clusters[mergeJ].children];
    
    // Berechne gewichteten Centroid
    const { centroid: newEmbedding, totalWeight: newTotalWeight } = 
      useRelevanceWeighting 
        ? computeWeightedCentroid(newChildren, embeddings, weights)
        : { 
            centroid: computeUnweightedCentroid(newChildren, embeddings),
            totalWeight: newChildren.length
          };
    
    const newCluster = {
      id: clusters[mergeI].id,
      children: newChildren,
      embedding: newEmbedding,
      totalWeight: newTotalWeight,
      isOutlier: clusters[mergeI].isOutlier || clusters[mergeJ].isOutlier,
      maxMergeDistance: Math.max(minDist, clusters[mergeI].maxMergeDistance, clusters[mergeJ].maxMergeDistance)
    };
    
    clusters = clusters.filter((_, idx) => idx !== mergeI && idx !== mergeJ);
    clusters.push(newCluster);
    
    const progress = Math.floor((1 - (clusters.length - targetClusters) / (n - targetClusters)) * 100);
    if (progress > lastProgress + 5) {
      process.stdout.write(`   Progress: ${progress}% (${clusters.length} Cluster)\r`);
      lastProgress = progress;
    }
  }
  console.log(`   Progress: 100% (${clusters.length} Cluster)   `);
  
  return clusters;
}

/**
 * Erstelle Namen aus Kind-Cluster-Namen (mit Relevanz-Gewichtung)
 * @param {Array} childClusters - Array von Cluster-Objekten mit { name, episodeCount } oder nur Namen
 * @param {boolean} useRelevanceWeighting - Ob nach Episoden-Anzahl gewichtet werden soll
 */
function deriveNameFromChildren(childClusters, useRelevanceWeighting = true) {
  const wordCounts = {};
  
  for (const child of childClusters) {
    // Unterstütze sowohl Objekte als auch einfache Strings
    const name = typeof child === 'string' ? child : child.name;
    const weight = useRelevanceWeighting && typeof child === 'object'
      ? (child.episodeCount || 1)
      : 1;
    
    const words = name.toLowerCase().split(/[\s&]+/);
    
    for (const w of words) {
      if (w.length > 2) {
        wordCounts[w] = (wordCounts[w] || 0) + weight;
      }
    }
  }
  
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([w]) => w.charAt(0).toUpperCase() + w.slice(1));
  
  if (topWords.length === 0) return 'Sonstiges';
  if (topWords.length === 1) return topWords[0];
  return topWords.join(' & ');
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🔬 Topic-Clustering für Freakshow Episoden (3 Hierarchie-Ebenen)\n');
  
  const fineClusters = settings.topicClustering?.fineClusters || 256;
  const coarseClusters = settings.topicClustering?.coarseClusters || 64;
  const overviewClusters = settings.topicClustering?.overviewClusters || 16;
  const outlierThreshold = settings.topicClustering?.outlierThreshold || 0.7;
  const linkageMethod = settings.topicClustering?.linkageMethod || 'weighted';
  const useRelevanceWeighting = settings.topicClustering?.useRelevanceWeighting !== false;
  const useLLMNaming = settings.topicClustering?.useLLMNaming !== false;
  
  // Clustering-Optionen
  const clusteringOptions = {
    outlierThreshold,
    linkageMethod,
    useRelevanceWeighting
  };
  
  // 1. Lade Embeddings-Datenbank
  console.log('📂 Lade Embeddings-Datenbank...');
  const db = loadEmbeddingsDatabase();
  
  if (!db) {
    console.log('\n❌ Keine Embeddings-Datenbank gefunden!');
    console.log('   Erstelle zuerst die Datenbank mit:');
    console.log('   node create-embeddings.js\n');
    process.exit(1);
  }
  
  console.log(`   Modell: ${db.embeddingModel}`);
  console.log(`   Topics: ${db.topics.length}`);
  console.log(`   Dimensionen: ${db.embeddingDimensions}`);
  console.log(`   Erstellt: ${db.createdAt}`);
  
  console.log(`\n📊 Cluster-Hierarchie:`);
  console.log(`   Feine Cluster:       ${fineClusters}`);
  console.log(`   Grobe Cluster:       ${coarseClusters}`);
  console.log(`   Übersichtscluster:   ${overviewClusters}`);
  console.log(`   Outlier-Schwellwert: ${outlierThreshold}`);
  console.log(`   Linkage-Methode:     ${linkageMethod}`);
  console.log(`   Relevanz-Gewichtung: ${useRelevanceWeighting ? 'Ja' : 'Nein'}`);
  console.log(`   LLM-Benennung:       ${useLLMNaming ? 'Ja' : 'Nein'}\n`);

  // 2. Extrahiere Topics und Embeddings
  const uniqueTopics = db.topics.map(t => ({
    topic: t.topic,
    keywords: t.keywords,
    count: t.count,
    episodes: t.episodes
  }));
  
  const embeddings = db.topics.map(t => t.embedding);

  // 3. Hierarchisches Clustering - Ebene 1: Feine Cluster (Blätter)
  console.log('📊 Ebene 1: Feine Cluster erstellen (Blätter)...');
  const fineClusterResult = hierarchicalClustering(uniqueTopics, embeddings, fineClusters, clusteringOptions);
  console.log(`   ✓ ${fineClusterResult.length} feine Cluster erstellt\n`);

  // 4. Benenne feine Cluster
  console.log('🏷️  Ebene 1: Feine Cluster benennen...');
  const delayMs = settings.topicExtraction?.requestDelayMs || 1000;
  const namedFineClusters = [];
  let outlierCount = 0;
  
  for (let i = 0; i < fineClusterResult.length; i++) {
    const cluster = fineClusterResult[i];
    const clusterTopics = cluster.items.map(idx => uniqueTopics[idx]);
    const topicNames = clusterTopics.map(t => t.topic);
    
    let name;
    
    // Outlier-Cluster werden als "Sonstiges" markiert
    if (cluster.isOutlier || cluster.maxMergeDistance > outlierThreshold) {
      name = 'Sonstiges';
      outlierCount++;
      process.stdout.write(`   ${i + 1}/${fineClusterResult.length}: "${name}" (Outlier)          \r`);
    } else if (useLLMNaming && clusterTopics.length > 1) {
      // Sortiere Topics nach Relevanz (Episoden-Anzahl) für LLM
      const sortedTopics = [...clusterTopics]
        .sort((a, b) => (b.episodes?.length || 0) - (a.episodes?.length || 0))
        .slice(0, 10)
        .map(t => t.topic);
      name = await callLLMForNaming(sortedTopics);
      if (name) {
        process.stdout.write(`   ${i + 1}/${fineClusterResult.length}: "${name}" (LLM)          \r`);
      }
      await sleep(delayMs / 2);
    }
    
    if (!name) {
      name = findClusterName(cluster.items, uniqueTopics, useRelevanceWeighting);
      process.stdout.write(`   ${i + 1}/${fineClusterResult.length}: "${name}" (Heuristik)          \r`);
    }
    
    const allEpisodes = new Set();
    for (const t of clusterTopics) {
      for (const ep of t.episodes) {
        allEpisodes.add(ep);
      }
    }
    
    namedFineClusters.push({
      index: i,  // Original-Index für Clustering
      id: name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      name: name,
      isOutlier: cluster.isOutlier || cluster.maxMergeDistance > outlierThreshold,
      maxMergeDistance: cluster.maxMergeDistance,
      topicCount: clusterTopics.length,
      episodeCount: allEpisodes.size,
      embedding: cluster.embedding,
      topics: clusterTopics.map(t => ({
        topic: t.topic,
        count: t.count,
        keywords: t.keywords.slice(0, 5)
      })),
      episodes: Array.from(allEpisodes).sort((a, b) => a - b)
    });
  }
  console.log(`\n   ℹ️  ${outlierCount} Outlier-Cluster gefunden\n`);

  // 5. Clustere feine Cluster zu groben Clustern (mittlere Ebene)
  console.log('📊 Ebene 2: Grobe Cluster erstellen...');
  const coarseClusterResult = clusterChildren(namedFineClusters, coarseClusters, clusteringOptions);
  console.log(`   ✓ ${coarseClusterResult.length} grobe Cluster erstellt\n`);

  // 6. Benenne grobe Cluster (aus Fine-Cluster-Namen abgeleitet)
  console.log('🏷️  Ebene 2: Grobe Cluster benennen (aus Fine-Cluster-Namen)...');
  const namedCoarseClusters = [];
  let coarseOutlierCount = 0;
  
  for (let i = 0; i < coarseClusterResult.length; i++) {
    const cluster = coarseClusterResult[i];
    const childFineClusters = cluster.children.map(idx => namedFineClusters[idx]);
    
    // Wenn alle Kind-Cluster Outlier sind, ist auch der Parent ein Outlier
    const allOutliers = childFineClusters.every(fc => fc.isOutlier);
    const isOutlier = cluster.isOutlier || cluster.maxMergeDistance > outlierThreshold || allOutliers;
    
    let name;
    if (isOutlier) {
      name = 'Sonstiges';
      coarseOutlierCount++;
      process.stdout.write(`   ${i + 1}/${coarseClusterResult.length}: "${name}" (Outlier)          \r`);
    } else {
      // Filtere Outlier-Cluster für die Namensgebung heraus
      // Übergebe vollständige Cluster-Objekte für Relevanz-Gewichtung
      const nonOutlierClusters = childFineClusters.filter(fc => !fc.isOutlier);
      
      if (nonOutlierClusters.length > 0) {
        name = deriveNameFromChildren(nonOutlierClusters, useRelevanceWeighting);
      } else {
        name = 'Sonstiges';
      }
      process.stdout.write(`   ${i + 1}/${coarseClusterResult.length}: "${name}" (aus ${childFineClusters.length} Fine-Clustern)          \r`);
    }
    
    const allEpisodes = new Set();
    childFineClusters.forEach(fc => fc.episodes.forEach(ep => allEpisodes.add(ep)));
    
    const allTopics = childFineClusters.reduce((sum, fc) => sum + fc.topicCount, 0);
    
    namedCoarseClusters.push({
      index: i,  // Original-Index für Clustering
      id: name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      name: name,
      isOutlier: isOutlier,
      maxMergeDistance: cluster.maxMergeDistance,
      fineClusterCount: cluster.children.length,
      fineClusters: cluster.children,
      topicCount: allTopics,
      episodeCount: allEpisodes.size,
      embedding: cluster.embedding,
      episodes: Array.from(allEpisodes).sort((a, b) => a - b)
    });
  }
  console.log(`\n   ℹ️  ${coarseOutlierCount} Outlier-Cluster gefunden\n`);

  // 7. Aktualisiere Fine Cluster mit Coarse-Cluster-Referenzen
  const fineToCoarse = new Map();
  coarseClusterResult.forEach((coarse, coarseIdx) => {
    coarse.children.forEach(fineIdx => {
      fineToCoarse.set(fineIdx, coarseIdx);
    });
  });

  namedFineClusters.forEach(fc => {
    fc.coarseCluster = fineToCoarse.get(fc.index);
    fc.coarseClusterId = namedCoarseClusters[fc.coarseCluster].id;
  });

  // 8. Clustere grobe Cluster zu Übersichtsclustern (Wurzeln)
  console.log('📊 Ebene 3: Übersichtscluster erstellen (Wurzeln)...');
  const overviewClusterResult = clusterChildren(namedCoarseClusters, overviewClusters, clusteringOptions);
  console.log(`   ✓ ${overviewClusterResult.length} Übersichtscluster erstellt\n`);

  // 9. Benenne Übersichtscluster (aus Coarse-Cluster-Namen abgeleitet)
  console.log('🏷️  Ebene 3: Übersichtscluster benennen (aus Coarse-Cluster-Namen)...');
  const namedOverviewClusters = [];
  let overviewOutlierCount = 0;
  
  for (let i = 0; i < overviewClusterResult.length; i++) {
    const cluster = overviewClusterResult[i];
    const childCoarseClusters = cluster.children.map(idx => namedCoarseClusters[idx]);
    
    // Wenn alle Kind-Cluster Outlier sind, ist auch der Parent ein Outlier
    const allOutliers = childCoarseClusters.every(cc => cc.isOutlier);
    const isOutlier = cluster.isOutlier || cluster.maxMergeDistance > outlierThreshold || allOutliers;
    
    let name;
    if (isOutlier) {
      name = 'Sonstiges';
      overviewOutlierCount++;
      process.stdout.write(`   ${i + 1}/${overviewClusterResult.length}: "${name}" (Outlier)          \r`);
    } else {
      // Filtere Outlier-Cluster für die Namensgebung heraus
      // Übergebe vollständige Cluster-Objekte für Relevanz-Gewichtung
      const nonOutlierClusters = childCoarseClusters.filter(cc => !cc.isOutlier);
      
      if (nonOutlierClusters.length > 0) {
        name = deriveNameFromChildren(nonOutlierClusters, useRelevanceWeighting);
      } else {
        name = 'Allgemein';
      }
      process.stdout.write(`   ${i + 1}/${overviewClusterResult.length}: "${name}" (aus ${childCoarseClusters.length} Coarse-Clustern)          \r`);
    }
    
    const allEpisodes = new Set();
    childCoarseClusters.forEach(cc => cc.episodes.forEach(ep => allEpisodes.add(ep)));
    
    const allFineClusters = childCoarseClusters.reduce((sum, cc) => sum + cc.fineClusterCount, 0);
    const allTopics = childCoarseClusters.reduce((sum, cc) => sum + cc.topicCount, 0);
    
    namedOverviewClusters.push({
      index: i,  // Original-Index
      id: name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
      name: name,
      isOutlier: isOutlier,
      maxMergeDistance: cluster.maxMergeDistance,
      coarseClusterCount: cluster.children.length,
      coarseClusters: cluster.children,
      fineClusterCount: allFineClusters,
      topicCount: allTopics,
      episodeCount: allEpisodes.size,
      episodes: Array.from(allEpisodes).sort((a, b) => a - b)
    });
  }
  console.log(`\n   ℹ️  ${overviewOutlierCount} Outlier-Cluster gefunden\n`);

  // 10. Aktualisiere Coarse Cluster mit Overview-Cluster-Referenzen
  const coarseToOverview = new Map();
  overviewClusterResult.forEach((overview, overviewIdx) => {
    overview.children.forEach(coarseIdx => {
      coarseToOverview.set(coarseIdx, overviewIdx);
    });
  });

  namedCoarseClusters.forEach(cc => {
    cc.overviewCluster = coarseToOverview.get(cc.index);
    cc.overviewClusterId = namedOverviewClusters[cc.overviewCluster].id;
  });

  // 11. Aktualisiere Fine Cluster mit Overview-Cluster-Referenzen
  namedFineClusters.forEach(fc => {
    fc.overviewCluster = coarseToOverview.get(fc.coarseCluster);
    fc.overviewClusterId = namedOverviewClusters[fc.overviewCluster].id;
  });

  // 12. Sortiere nach Häufigkeit
  namedFineClusters.sort((a, b) => b.episodeCount - a.episodeCount);
  namedCoarseClusters.sort((a, b) => b.episodeCount - a.episodeCount);
  namedOverviewClusters.sort((a, b) => b.episodeCount - a.episodeCount);

  // 13. Speichere Ergebnis mit Baum-Hierarchie
  const taxonomyFile = path.join(__dirname, 'topic-taxonomy.json');
  
  // Berechne Outlier-Statistiken
  const fineOutliers = namedFineClusters.filter(c => c.isOutlier);
  const coarseOutliers = namedCoarseClusters.filter(c => c.isOutlier);
  const overviewOutliers = namedOverviewClusters.filter(c => c.isOutlier);
  
  const result = {
    createdAt: new Date().toISOString(),
    method: 'embedding-clustering-hierarchical-tree',
    embeddingModel: db.embeddingModel,
    embeddingsCreatedAt: db.createdAt,
    totalTopics: db.totalTopicsRaw,
    uniqueTopics: db.topics.length,
    hierarchy: {
      description: 'Baum-Hierarchie: Overview (Wurzel) -> Coarse -> Fine (Blätter)',
      overviewClusters: overviewClusters,
      coarseClusters: coarseClusters,
      fineClusters: fineClusters,
      outlierThreshold: outlierThreshold,
      linkageMethod: linkageMethod,
      useRelevanceWeighting: useRelevanceWeighting
    },
    outlierStatistics: {
      fineClusters: {
        total: namedFineClusters.length,
        outliers: fineOutliers.length,
        percentage: ((fineOutliers.length / namedFineClusters.length) * 100).toFixed(1) + '%'
      },
      coarseClusters: {
        total: namedCoarseClusters.length,
        outliers: coarseOutliers.length,
        percentage: ((coarseOutliers.length / namedCoarseClusters.length) * 100).toFixed(1) + '%'
      },
      overviewClusters: {
        total: namedOverviewClusters.length,
        outliers: overviewOutliers.length,
        percentage: ((overviewOutliers.length / namedOverviewClusters.length) * 100).toFixed(1) + '%'
      }
    },
    overviewClusters: namedOverviewClusters.map(c => ({
      id: c.id,
      name: c.name,
      description: `${c.topicCount} Topics in ${c.episodeCount} Episoden`,
      isOutlier: c.isOutlier,
      maxMergeDistance: c.maxMergeDistance,
      coarseClusterCount: c.coarseClusterCount,
      fineClusterCount: c.fineClusterCount,
      topicCount: c.topicCount,
      episodeCount: c.episodeCount,
      coarseClusters: c.coarseClusters.map(idx => ({
        index: idx,
        id: namedCoarseClusters[idx].id,
        name: namedCoarseClusters[idx].name,
        isOutlier: namedCoarseClusters[idx].isOutlier
      })),
      episodes: c.episodes
    })),
    coarseClusters: namedCoarseClusters.map(c => ({
      id: c.id,
      name: c.name,
      description: `${c.topicCount} Topics in ${c.episodeCount} Episoden`,
      isOutlier: c.isOutlier,
      maxMergeDistance: c.maxMergeDistance,
      fineClusterCount: c.fineClusterCount,
      topicCount: c.topicCount,
      episodeCount: c.episodeCount,
      overviewCluster: {
        index: c.overviewCluster,
        id: c.overviewClusterId,
        name: namedOverviewClusters[c.overviewCluster].name,
        isOutlier: namedOverviewClusters[c.overviewCluster].isOutlier
      },
      fineClusters: c.fineClusters.map(idx => ({
        index: idx,
        id: namedFineClusters[idx].id,
        name: namedFineClusters[idx].name,
        isOutlier: namedFineClusters[idx].isOutlier
      })),
      episodes: c.episodes
    })),
    fineClusters: namedFineClusters.map(c => ({
      id: c.id,
      name: c.name,
      description: `${c.topicCount} Topics in ${c.episodeCount} Episoden`,
      isOutlier: c.isOutlier,
      maxMergeDistance: c.maxMergeDistance,
      topicCount: c.topicCount,
      episodeCount: c.episodeCount,
      coarseCluster: {
        index: c.coarseCluster,
        id: c.coarseClusterId,
        name: namedCoarseClusters[c.coarseCluster].name,
        isOutlier: namedCoarseClusters[c.coarseCluster].isOutlier
      },
      overviewCluster: {
        index: c.overviewCluster,
        id: c.overviewClusterId,
        name: namedOverviewClusters[c.overviewCluster].name,
        isOutlier: namedOverviewClusters[c.overviewCluster].isOutlier
      },
      sampleTopics: c.topics.slice(0, 5).map(t => t.topic),
      episodes: c.episodes
    }))
  };

  fs.writeFileSync(taxonomyFile, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`✅ Taxonomie gespeichert: ${taxonomyFile}`);
  
  // Zeige Baum-Hierarchie mit Outlier-Informationen
  console.log('\n📋 Baum-Hierarchie:\n');
  
  console.log(`   🌳 Ebene 3 - Übersichtscluster (Wurzeln, ${namedOverviewClusters.length}):`);
  namedOverviewClusters.slice(0, 5).forEach((c, i) => {
    const outlierTag = c.isOutlier ? ' [Outlier]' : '';
    console.log(`      ${i + 1}. ${c.name}${outlierTag}`);
    console.log(`         └─ ${c.episodeCount} Episoden, ${c.coarseClusterCount} Coarse-Cluster, ${c.fineClusterCount} Fine-Cluster`);
  });
  
  console.log(`\n   📦 Ebene 2 - Grobe Cluster (${namedCoarseClusters.length}):`);
  namedCoarseClusters.slice(0, 5).forEach((c, i) => {
    const outlierTag = c.isOutlier ? ' [Outlier]' : '';
    console.log(`      ${i + 1}. ${c.name}${outlierTag}`);
    console.log(`         ├─ Parent: ${namedOverviewClusters[c.overviewCluster].name}`);
    console.log(`         └─ ${c.episodeCount} Episoden, ${c.fineClusterCount} Fine-Cluster`);
  });
  
  console.log(`\n   🍃 Ebene 1 - Feine Cluster (Blätter, ${namedFineClusters.length}):`);
  namedFineClusters.slice(0, 5).forEach((c, i) => {
    const outlierTag = c.isOutlier ? ' [Outlier]' : '';
    console.log(`      ${i + 1}. ${c.name}${outlierTag}`);
    console.log(`         ├─ Coarse: ${namedCoarseClusters[c.coarseCluster].name}`);
    console.log(`         ├─ Overview: ${namedOverviewClusters[c.overviewCluster].name}`);
    console.log(`         └─ ${c.episodeCount} Episoden, ${c.topicCount} Topics`);
  });
  
  console.log('\n✨ Hierarchie-Statistik:');
  console.log(`   ${namedOverviewClusters.length} Overview → ${namedCoarseClusters.length} Coarse → ${namedFineClusters.length} Fine`);
  console.log(`   Durchschnitt: ${(namedCoarseClusters.length / namedOverviewClusters.length).toFixed(1)} Coarse/Overview, ${(namedFineClusters.length / namedCoarseClusters.length).toFixed(1)} Fine/Coarse`);
  
  console.log('\n🔍 Outlier-Statistik:');
  console.log(`   Fine Cluster:     ${fineOutliers.length}/${namedFineClusters.length} (${((fineOutliers.length / namedFineClusters.length) * 100).toFixed(1)}%)`);
  console.log(`   Coarse Cluster:   ${coarseOutliers.length}/${namedCoarseClusters.length} (${((coarseOutliers.length / namedCoarseClusters.length) * 100).toFixed(1)}%)`);
  console.log(`   Overview Cluster: ${overviewOutliers.length}/${namedOverviewClusters.length} (${((overviewOutliers.length / namedOverviewClusters.length) * 100).toFixed(1)}%)`);
}

// Starte das Skript
main().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});
