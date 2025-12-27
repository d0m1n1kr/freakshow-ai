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
 * Ruft das LLM auf (mit Retry bei Rate Limits)
 * @param {string} systemPrompt - System-Prompt
 * @param {string} userPrompt - User-Prompt
 * @param {object} options - Optionale Einstellungen
 * @param {number} options.maxTokens - Override für maxTokens
 * @param {number} options.retryCount - Interner Retry-Zähler
 */
async function callLLM(systemPrompt, userPrompt, options = {}) {
  const { model: defaultModel, apiKey, baseURL, temperature, maxTokens: defaultMaxTokens } = settings.llm;
  const maxRetries = settings.topicExtraction?.maxRetries || 3;
  const retryDelayMs = settings.topicExtraction?.retryDelayMs || 5000;
  const retryCount = options.retryCount || 0;
  
  // Optionales Override-Modell (z.B. für Taxonomie mit mehr Output-Tokens)
  const model = options.model || settings.topicNormalization?.model || defaultModel;
  
  const requestBody = {
    model: model,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    temperature: temperature,
    max_tokens: options.maxTokens || defaultMaxTokens || 4000
  };

  try {
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (response.status === 429) {
      if (retryCount < maxRetries) {
        const waitTime = retryDelayMs * Math.pow(2, retryCount);
        console.log(`  ⏳ Rate limit erreicht, warte ${waitTime / 1000} Sekunden... (Versuch ${retryCount + 1}/${maxRetries})`);
        await sleep(waitTime);
        return callLLM(systemPrompt, userPrompt, { ...options, retryCount: retryCount + 1 });
      } else {
        throw new Error('Rate limit erreicht - maximale Anzahl an Wiederholungen überschritten');
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API Fehler: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      if (retryCount < maxRetries) {
        const waitTime = retryDelayMs * Math.pow(2, retryCount);
        console.log(`  ⏳ Netzwerkfehler, warte ${waitTime / 1000} Sekunden... (Versuch ${retryCount + 1}/${maxRetries})`);
        await sleep(waitTime);
        return callLLM(systemPrompt, userPrompt, { ...options, retryCount: retryCount + 1 });
      }
    }
    throw error;
  }
}

/**
 * Bereinige JSON-String von häufigen LLM-Fehlern
 */
function cleanJSONString(jsonStr) {
  let cleaned = jsonStr;
  
  // Entferne Trailing Commas vor } oder ]
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  // Entferne JavaScript-Kommentare (// und /* */)
  cleaned = cleaned.replace(/\/\/[^\n]*\n/g, '\n');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Ersetze unescaped Newlines in Strings
  cleaned = cleaned.replace(/:\s*"([^"]*)\n([^"]*)"/g, (match, p1, p2) => {
    return `: "${p1}\\n${p2}"`;
  });
  
  return cleaned;
}

/**
 * Extrahiere JSON aus LLM-Antwort
 */
function extractJSON(response) {
  // Versuche, JSON-Array oder -Objekt aus der Antwort zu extrahieren
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  const objectMatch = response.match(/\{[\s\S]*\}/);
  
  let jsonStr = null;
  if (arrayMatch) {
    jsonStr = arrayMatch[0];
  } else if (objectMatch) {
    jsonStr = objectMatch[0];
  } else {
    jsonStr = response;
  }
  
  // Erster Versuch: Direkt parsen
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // Zweiter Versuch: Bereinigtes JSON parsen
    try {
      const cleaned = cleanJSONString(jsonStr);
      return JSON.parse(cleaned);
    } catch (e2) {
      // Fehler mit mehr Kontext ausgeben
      console.error('\n❌ JSON Parse Fehler. Antwort (erste 500 Zeichen):');
      console.error(jsonStr.substring(0, 500));
      console.error('\n... Position des Fehlers:', e.message);
      throw e;
    }
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
 * Lade alle Topics aus allen Episoden
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
 * Erstelle oder aktualisiere die Topic-Taxonomie
 */
async function createTaxonomy(allTopics) {
  const taxonomyFile = path.join(__dirname, 'topic-taxonomy.json');
  const maxMainTopics = settings.topicNormalization?.maxMainTopics || 35;
  
  // Gruppiere Topics nach ähnlichen Bezeichnungen für besseren Überblick
  const topicCounts = {};
  for (const { topic, keywords } of allTopics) {
    const key = topic.toLowerCase().trim();
    if (!topicCounts[key]) {
      topicCounts[key] = { topic, count: 0, keywords: new Set() };
    }
    topicCounts[key].count++;
    keywords.forEach(k => topicCounts[key].keywords.add(k));
  }
  
  // Sortiere nach Häufigkeit
  const sortedTopics = Object.values(topicCounts)
    .map(t => ({
      topic: t.topic,
      count: t.count,
      keywords: Array.from(t.keywords)
    }))
    .sort((a, b) => b.count - a.count);
  
  console.log(`\n📊 Gefundene einzigartige Topics: ${sortedTopics.length}`);
  console.log(`   Häufigste Topics:`);
  sortedTopics.slice(0, 10).forEach(t => {
    console.log(`   - "${t.topic}" (${t.count}x)`);
  });

  // Bereite Daten für LLM vor - batche große Listen
  const topicsForLLM = sortedTopics.map(t => ({
    topic: t.topic,
    count: t.count,
    keywords: t.keywords.slice(0, 5) // Limitiere Keywords pro Topic
  }));

  const systemPrompt = `Du bist ein Experte für die Kategorisierung von Podcast-Themen. Du analysierst eine Liste von Themen aus einem Tech-Podcast (Fokus auf Apple, Technologie, Nerd-Kultur) und erstellst eine normalisierte Taxonomie.

Deine Aufgabe:
1. Identifiziere die Haupt-Topics (Kategorien), die alle Themen abdecken
2. Fasse ähnliche/verwandte Themen zu Haupt-Topics zusammen
3. Erstelle kompakte, prägnante Bezeichnungen für die Haupt-Topics
4. Berücksichtige die Häufigkeit: Häufige Themen sollten eigene Haupt-Topics sein
5. Fragmentierte Unterkategorien sollen zu sinnvollen Haupt-Topics zusammengefasst werden

Antworte ausschließlich mit einem JSON-Array im folgenden Format:
[
  {
    "id": "eindeutige-id-in-kebab-case",
    "name": "Kompakter Name des Haupt-Topics",
    "description": "Kurze Beschreibung, was dieses Topic umfasst",
    "variants": ["Variante 1", "Variante 2", "..."],
    "keywords": ["keyword1", "keyword2"]
  }
]

Wichtig:
- Maximal ${maxMainTopics} Haupt-Topics erstellen
- Namen sollten kurz und prägnant sein (2-4 Wörter ideal)
- "variants" enthält verschiedene Formulierungen desselben Topics
- Das Ergebnis muss valides JSON sein`;

  const userPrompt = `Analysiere die folgenden ${topicsForLLM.length} Podcast-Themen und erstelle eine normalisierte Taxonomie der Haupt-Topics.

Die Zahl in Klammern zeigt, wie oft ein Thema vorkommt:

${topicsForLLM.map(t => `- ${t.topic} (${t.count}x) [Keywords: ${t.keywords.join(', ')}]`).join('\n')}

Erstelle jetzt die Taxonomie als JSON-Array:`;

  console.log(`\n🤖 Erstelle Taxonomie mit LLM...`);
  
  // Taxonomie braucht mehr Tokens wegen der großen Ausgabe
  const taxonomyMaxTokens = settings.topicNormalization?.taxonomyMaxTokens || 16000;
  const response = await callLLM(systemPrompt, userPrompt, { maxTokens: taxonomyMaxTokens });
  const taxonomy = extractJSON(response);
  
  // Validierung
  if (!Array.isArray(taxonomy)) {
    throw new Error('LLM-Antwort ist kein Array');
  }
  
  // Speichere Taxonomie
  const taxonomyData = {
    createdAt: new Date().toISOString(),
    totalSourceTopics: allTopics.length,
    uniqueSourceTopics: sortedTopics.length,
    mainTopics: taxonomy
  };
  
  fs.writeFileSync(taxonomyFile, JSON.stringify(taxonomyData, null, 2), 'utf-8');
  console.log(`✅ Taxonomie mit ${taxonomy.length} Haupt-Topics erstellt und gespeichert`);
  
  return taxonomyData;
}

/**
 * Lade existierende Taxonomie
 */
function loadTaxonomy() {
  const taxonomyFile = path.join(__dirname, 'topic-taxonomy.json');
  if (fs.existsSync(taxonomyFile)) {
    return JSON.parse(fs.readFileSync(taxonomyFile, 'utf-8'));
  }
  return null;
}

/**
 * Normalisiere Topics für eine einzelne Episode
 */
async function normalizeEpisodeTopics(episodeNumber, taxonomy) {
  const episodesDir = path.join(__dirname, 'episodes');
  const topicsFile = path.join(episodesDir, `${episodeNumber}-topics.json`);
  const normalizedFile = path.join(episodesDir, `${episodeNumber}-normalized-topics.json`);
  
  if (!fs.existsSync(topicsFile)) {
    console.log(`  ⚠️  Topics-Datei nicht gefunden für Episode ${episodeNumber}`);
    return null;
  }
  
  const episodeData = JSON.parse(fs.readFileSync(topicsFile, 'utf-8'));
  
  // Erstelle Prompt für LLM
  const systemPrompt = `Du bist ein Experte für die Zuordnung von Podcast-Themen zu einer vordefinierten Taxonomie.

Deine Aufgabe:
1. Ordne die gegebenen Episode-Topics den passenden Haupt-Topics aus der Taxonomie zu
2. Wähle für jedes Episode-Topic das beste passende Haupt-Topic
3. Bewerte die Relevanz/Wichtigkeit jedes zugeordneten Topics für diese Episode (1-10)
4. Ignoriere Topics, die nicht zur Taxonomie passen oder Meta-Topics sind (z.B. "Podcast-Format")

Antworte ausschließlich mit einem JSON-Array im folgenden Format:
[
  {
    "topicId": "id-aus-der-taxonomie",
    "relevance": 8,
    "originalTopics": ["Original Topic 1", "Original Topic 2"]
  }
]

Wichtig:
- Mehrere Original-Topics können dem gleichen Haupt-Topic zugeordnet werden
- Relevanz ist ein Wert von 1 (wenig relevant) bis 10 (Hauptthema der Episode)
- Sortiere nach Relevanz (wichtigstes zuerst)
- Das Ergebnis muss valides JSON sein`;

  const taxonomyList = taxonomy.mainTopics.map(t => 
    `- ${t.id}: "${t.name}" - ${t.description}`
  ).join('\n');
  
  const episodeTopics = episodeData.topics.map(t => 
    `- ${t.topic}${t.keywords ? ` [${t.keywords.join(', ')}]` : ''}`
  ).join('\n');

  const userPrompt = `Episode: "${episodeData.title}" (Episode ${episodeNumber})

Verfügbare Haupt-Topics aus der Taxonomie:
${taxonomyList}

Topics dieser Episode (zu normalisieren):
${episodeTopics}

Ordne die Episode-Topics den passenden Haupt-Topics zu:`;

  const response = await callLLM(systemPrompt, userPrompt);
  const normalizedTopics = extractJSON(response);
  
  // Validierung und Anreicherung
  if (!Array.isArray(normalizedTopics)) {
    throw new Error('LLM-Antwort ist kein Array');
  }
  
  // Reichere mit Topic-Namen an
  const enrichedTopics = normalizedTopics.map(nt => {
    const mainTopic = taxonomy.mainTopics.find(t => t.id === nt.topicId);
    return {
      ...nt,
      topicName: mainTopic ? mainTopic.name : nt.topicId
    };
  });
  
  // Erstelle Ergebnis-Objekt
  const result = {
    episodeNumber: episodeNumber,
    title: episodeData.title,
    normalizedAt: new Date().toISOString(),
    taxonomyVersion: taxonomy.createdAt,
    topics: enrichedTopics
  };
  
  // Speichere normalisierte Topics
  fs.writeFileSync(normalizedFile, JSON.stringify(result, null, 2), 'utf-8');
  
  return result;
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log('🚀 Topic-Normalisierung für Freakshow Episoden\n');
  const normModel = settings.topicNormalization?.model || settings.llm.model;
  console.log(`LLM: ${settings.llm.provider} - ${normModel}${settings.topicNormalization?.model ? ' (Override)' : ''}`);
  console.log(`Max Haupt-Topics: ${settings.topicNormalization?.maxMainTopics || 35}`);
  console.log(`Max Tokens (Taxonomie): ${settings.topicNormalization?.taxonomyMaxTokens || 16000}\n`);

  const args = process.argv.slice(2);
  const delayMs = settings.topicExtraction?.requestDelayMs || 3000;
  
  // Prüfe Kommandozeilen-Argumente
  if (args[0] === '--create-taxonomy' || args[0] === '-t') {
    // Nur Taxonomie erstellen/aktualisieren
    console.log('📚 Erstelle neue Taxonomie...\n');
    const allTopics = loadAllTopics();
    console.log(`Geladene Topics: ${allTopics.length} aus ${findTopicsFiles().length} Episoden`);
    await createTaxonomy(allTopics);
    return;
  }
  
  if (args[0] === '--help' || args[0] === '-h') {
    console.log('Verwendung:');
    console.log('  node normalize-topics.js --create-taxonomy    Erstelle/Aktualisiere Taxonomie');
    console.log('  node normalize-topics.js --normalize-all      Normalisiere alle Episoden');
    console.log('  node normalize-topics.js <episode>            Normalisiere eine Episode');
    console.log('  node normalize-topics.js 1 2 3                Normalisiere mehrere Episoden');
    console.log('  node normalize-topics.js --range 1 10         Normalisiere Bereich');
    console.log('  node normalize-topics.js --full               Taxonomie + alle Episoden\n');
    return;
  }
  
  // Lade oder erstelle Taxonomie
  let taxonomy = loadTaxonomy();
  
  if (args[0] === '--full') {
    // Vollständiger Durchlauf: Taxonomie erstellen + alle Episoden normalisieren
    console.log('📚 Vollständiger Durchlauf: Taxonomie + alle Episoden\n');
    const allTopics = loadAllTopics();
    console.log(`Geladene Topics: ${allTopics.length} aus ${findTopicsFiles().length} Episoden`);
    taxonomy = await createTaxonomy(allTopics);
    await sleep(delayMs);
    args[0] = '--normalize-all';
  }
  
  if (!taxonomy) {
    console.log('❌ Keine Taxonomie gefunden. Erstelle zuerst eine mit:');
    console.log('   node normalize-topics.js --create-taxonomy\n');
    return;
  }
  
  console.log(`📚 Taxonomie geladen: ${taxonomy.mainTopics.length} Haupt-Topics`);
  console.log(`   Erstellt am: ${taxonomy.createdAt}\n`);
  
  // Bestimme zu verarbeitende Episoden
  const topicsFiles = findTopicsFiles();
  let episodesToProcess = [];
  
  if (args[0] === '--normalize-all') {
    episodesToProcess = topicsFiles.map(f => f.episodeNumber);
    console.log(`Normalisiere ALLE ${episodesToProcess.length} Episoden...\n`);
  } else if (args[0] === '--range') {
    const start = parseInt(args[1]);
    const end = parseInt(args[2]);
    episodesToProcess = topicsFiles
      .filter(f => f.episodeNumber >= start && f.episodeNumber <= end)
      .map(f => f.episodeNumber);
    console.log(`Normalisiere Episoden ${start}-${end} (${episodesToProcess.length} Episoden)...\n`);
  } else if (args.length > 0) {
    episodesToProcess = args.map(arg => parseInt(arg)).filter(n => !isNaN(n));
    console.log(`Normalisiere ${episodesToProcess.length} spezifische Episode(n)...\n`);
  } else {
    // Keine Argumente - zeige Hilfe
    console.log('Keine Episode angegeben. Verwendung:\n');
    console.log('  node normalize-topics.js --create-taxonomy    Erstelle/Aktualisiere Taxonomie');
    console.log('  node normalize-topics.js --normalize-all      Normalisiere alle Episoden');
    console.log('  node normalize-topics.js <episode>            Normalisiere eine Episode');
    console.log('  node normalize-topics.js 1 2 3                Normalisiere mehrere Episoden');
    console.log('  node normalize-topics.js --range 1 10         Normalisiere Bereich');
    console.log('  node normalize-topics.js --full               Taxonomie + alle Episoden\n');
    return;
  }
  
  // Verarbeite Episoden
  let processed = 0;
  let errors = 0;
  
  console.log(`⏱️  Pause zwischen Anfragen: ${delayMs / 1000} Sekunden\n`);
  
  for (const episodeNumber of episodesToProcess) {
    console.log(`\nVerarbeite Episode ${episodeNumber}...`);
    
    try {
      const result = await normalizeEpisodeTopics(episodeNumber, taxonomy);
      if (result) {
        processed++;
        console.log(`  ✅ ${result.topics.length} normalisierte Topics`);
        result.topics.slice(0, 5).forEach(t => {
          console.log(`     - ${t.topicName} (Relevanz: ${t.relevance})`);
        });
        if (result.topics.length > 5) {
          console.log(`     ... und ${result.topics.length - 5} weitere`);
        }
      }
      
      // Pause zwischen Anfragen
      if (processed < episodesToProcess.length) {
        console.log(`  ⏸️  Warte ${delayMs / 1000} Sekunden...`);
        await sleep(delayMs);
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Fehler bei Episode ${episodeNumber}: ${error.message}`);
      
      if (errors > 3) {
        console.error('\n❌ Zu viele Fehler, breche ab...');
        break;
      }
      
      await sleep(delayMs);
    }
  }
  
  console.log(`\n✅ Fertig! ${processed} Episoden normalisiert, ${errors} Fehler`);
}

// Starte das Skript
main().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});

