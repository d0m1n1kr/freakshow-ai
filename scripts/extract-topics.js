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
 * Ruft das LLM auf, um Hauptthemen zu extrahieren (mit Retry bei Rate Limits)
 */
async function callLLM(messages, retryCount = 0) {
  const { provider, model, apiKey, baseURL, temperature, maxTokens } = settings.llm;
  const { maxRetries, retryDelayMs } = settings.topicExtraction;
  
  const requestBody = {
    model: model,
    messages,
    temperature: temperature,
    max_tokens: maxTokens
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
      // Rate limit erreicht
      if (retryCount < maxRetries) {
        const waitTime = retryDelayMs * Math.pow(2, retryCount); // Exponentielles Backoff
        console.log(`  ⏳ Rate limit erreicht, warte ${waitTime / 1000} Sekunden... (Versuch ${retryCount + 1}/${maxRetries})`);
        await sleep(waitTime);
        return callLLM(prompt, retryCount + 1);
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
        return callLLM(prompt, retryCount + 1);
      }
    }
    throw error;
  }
}

function parseJsonArrayFromLLM(responseText) {
  // Try to extract the first JSON array from the response (some models wrap with text)
  const text = String(responseText || '').trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const jsonText = jsonMatch ? jsonMatch[0] : text;
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) throw new Error('LLM-Antwort ist kein JSON-Array');
  return parsed;
}

function durationTupleToSeconds(tuple) {
  if (!tuple || !Array.isArray(tuple)) return null;
  const [h, m, s] = tuple;
  const hh = Number.isFinite(h) ? h : parseInt(h, 10);
  const mm = Number.isFinite(m) ? m : parseInt(m, 10);
  const ss = Number.isFinite(s) ? s : parseInt(s, 10);
  if ([hh, mm, ss].some(x => Number.isNaN(x))) return null;
  return hh * 3600 + mm * 60 + ss;
}

/**
 * Lade alle verfügbaren Informationen für eine Episode
 */
function loadEpisodeData(episodeNumber) {
  const episodesDir = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');
  const data = {};

  // Basis-Infos
  const mainFile = path.join(episodesDir, `${episodeNumber}.json`);
  if (fs.existsSync(mainFile)) {
    data.main = JSON.parse(fs.readFileSync(mainFile, 'utf-8'));
  }

  // Beschreibungstext
  const textFile = path.join(episodesDir, `${episodeNumber}-text.html`);
  if (fs.existsSync(textFile)) {
    data.text = fs.readFileSync(textFile, 'utf-8');
  }

  // Show Notes (einfach)
  const snFile = path.join(episodesDir, `${episodeNumber}-sn.json`);
  if (fs.existsSync(snFile)) {
    data.shownotes = JSON.parse(fs.readFileSync(snFile, 'utf-8'));
  }

  // Show Notes (OSF - detailliert)
  const osfFile = path.join(episodesDir, `${episodeNumber}-osf.json`);
  if (fs.existsSync(osfFile)) {
    data.osf = JSON.parse(fs.readFileSync(osfFile, 'utf-8'));
  }

  // Detaillierte Kapitel (mit positionSec/durationSec)
  const chaptersFile = path.join(episodesDir, `${episodeNumber}-chapters.json`);
  if (fs.existsSync(chaptersFile)) {
    data.detailedChapters = JSON.parse(fs.readFileSync(chaptersFile, 'utf-8'));
  }

  return data;
}

/**
 * Bestimme die beste Datenquelle für Topic-Extraktion nach Priorität
 */
function selectDataSource(episodeData) {
  // Priorität 1: Detaillierte Kapitel-Datei (episodes/<n>-chapters.json)
  if (episodeData.detailedChapters && Array.isArray(episodeData.detailedChapters.chapters) && episodeData.detailedChapters.chapters.length > 0) {
    return {
      source: 'detailed-chapters',
      data: episodeData.detailedChapters.chapters
    };
  }

  // Priorität 2: Text & Description
  let textData = '';
  if (episodeData.main && episodeData.main.description) {
    textData += episodeData.main.description;
  }
  if (episodeData.text) {
    const cleanText = episodeData.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanText.length > 0) {
      textData += (textData ? '\n\n' : '') + cleanText;
    }
  }
  
  if (textData.length > 0) {
    return {
      source: 'description',
      data: textData
    };
  }

  return null;
}

/**
 * Erstelle LLM-Messages zur Filterung + Kategorisierung von Kapiteln
 */
function createChapterCurationMessages(episodeData, chapterTopics) {
  const title = episodeData.main?.title || '';
  const payload = chapterTopics.map(t => ({
    id: t.id,
    topic: t.topic
  }));

  return [
    {
      role: "system",
      content:
        "Du kuratierst Podcast-Themen. Du bekommst eine geordnete Liste von Kapiteln (topic). " +
        "Deine Aufgaben: (1) entferne strukturelle/administrative Kapitel wie Intro, Begrüßung, Vorstellung, Orga/Housekeeping, Verabschiedung, Ausklang, Nachklapp, Werbung etc. " +
        "(2) Weise jedem verbleibenden Thema genau ZWEI Subject-Layer zu: coarse und fine. " +
        "Beispiele: 'Software / Filesystems', 'Hardware / iPad', 'Social / Social Network'. " +
        "Wichtig: Keine Keywords. Keine neuen Themen erfinden. Topic-Texte nicht umschreiben (nur klassifizieren und ggf. verwerfen). " +
        "Antworte ausschließlich mit einem JSON-Array von Objekten: {\"id\": number, \"keep\": boolean, \"subjectCoarse\": string, \"subjectFine\": string}."
    },
    {
      role: "user",
      content:
        `Episode: ${title}\n\n` +
        `Kapitel (geordnet):\n${JSON.stringify(payload, null, 2)}`
    }
  ];
}

/**
 * Erstelle LLM-Messages zur Topic-Extraktion aus Beschreibung (inkl. Subject-Layer, ohne Keywords)
 */
function createDescriptionExtractionMessages(episodeData, descriptionText) {
  const title = episodeData.main?.title || '';
  const text = String(descriptionText || '').substring(0, 5000);

  return [
    {
      role: "system",
      content:
        "Du extrahierst Podcast-Themen aus einem Beschreibungstext. " +
        "Gib eine geordnete Liste der besprochenen Hauptthemen zurück. " +
        "Entferne strukturelle/administrative Themen (Intro, Begrüßung, Vorstellung, Orga/Housekeeping, Verabschiedung, Ausklang etc.). " +
        "Wichtig: Keine Keywords. Weise jedem Thema genau ZWEI Subject-Layer zu: coarse und fine (z.B. 'Software'/'Filesystems', 'Hardware'/'iPad', 'Social'/'Social Network'). " +
        "Antworte ausschließlich mit einem JSON-Array von Objekten: {\"topic\": string, \"subjectCoarse\": string, \"subjectFine\": string}."
    },
    {
      role: "user",
      content:
        `Episode: ${title}\n\nBeschreibung (evtl. gekürzt):\n${text}${String(descriptionText || '').length > 5000 ? '...' : ''}`
    }
  ];
}

function toOptionalInt(value) {
  const n = Number.isFinite(value) ? value : parseInt(value, 10);
  if (!Number.isFinite(n) || Number.isNaN(n)) return null;
  return n;
}

/**
 * Extrahiere Topics für eine Episode
 */
async function extractTopicsForEpisode(episodeNumber, forceOverwrite = false) {
  console.log(`\nVerarbeite Episode ${episodeNumber}...`);
  
  // Prüfe, ob topics-Datei bereits existiert
  const topicsFile = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes', `${episodeNumber}-topics.json`);
  if (fs.existsSync(topicsFile) && !forceOverwrite) {
    console.log(`  ⚠️  Topics existieren bereits, überspringe...`);
    return;
  }
  
  if (fs.existsSync(topicsFile) && forceOverwrite) {
    console.log(`  🔄 Topics existieren bereits, werden überschrieben (--force)...`);
  }

  // Lade Episode-Daten
  const episodeData = loadEpisodeData(episodeNumber);
  
  if (!episodeData.main) {
    console.log(`  ❌ Keine Basis-Daten gefunden, überspringe...`);
    return;
  }

  // Wähle beste Datenquelle
  const dataSource = selectDataSource(episodeData);
  
  if (!dataSource) {
    console.log(`  ❌ Keine verwendbaren Daten gefunden (keine Kapitel, kein Text), überspringe...`);
    return;
  }

  console.log(`  📊 Verwende Datenquelle: ${dataSource.source}`);

  try {
    let finalTopics = [];

    if (dataSource.source === 'detailed-chapters') {
      // Take chapters directly as topics; use LLM only for filtering structural items + subject layers.
      const chapters = dataSource.data
        .filter(ch => ch && typeof ch === 'object')
        .map((ch, idx) => ({
          id: idx + 1,
          topic: String(ch.title || ch.topic || '').trim(),
          durationSec: toOptionalInt(ch.durationSec),
          positionSec: toOptionalInt(ch.positionSec),
        }))
        .filter(ch => ch.topic.length > 0);

      console.log(`  🤖 Rufe LLM auf (Kapitel filtern + Subject-Layer)...`);
      const response = await callLLM(createChapterCurationMessages(episodeData, chapters));
      const curated = parseJsonArrayFromLLM(response);

      const curatedById = new Map();
      curated.forEach(x => {
        if (x && typeof x === 'object' && Number.isFinite(x.id)) curatedById.set(x.id, x);
      });

      finalTopics = chapters
        .map(ch => {
          const c = curatedById.get(ch.id);
          const keep = c?.keep === true;
          if (!keep) return null;
          const topic = ch.topic;
          if (!topic || topic.length < settings.topicExtraction.minTopicLength) return null;
          const out = {
            topic,
            subject: {
              coarse: String(c.subjectCoarse || '').trim(),
              fine: String(c.subjectFine || '').trim(),
            },
          };
          // Only include timing fields if present in chapters source
          if (ch.durationSec !== null) out.durationSec = ch.durationSec;
          if (ch.positionSec !== null) out.positionSec = ch.positionSec;
          return out;
        })
        .filter(Boolean);
    } else if (dataSource.source === 'description') {
      console.log(`  🤖 Rufe LLM auf (Topics aus Beschreibung extrahieren + Subject-Layer)...`);
      const response = await callLLM(createDescriptionExtractionMessages(episodeData, dataSource.data));
      const topics = parseJsonArrayFromLLM(response);

      const cleaned = topics
        .filter(t => t && typeof t === 'object' && typeof t.topic === 'string')
        .map(t => ({
          topic: t.topic.trim(),
          subject: {
            coarse: String(t.subjectCoarse || '').trim(),
            fine: String(t.subjectFine || '').trim(),
          }
        }))
        .filter(t => t.topic && t.topic.length >= settings.topicExtraction.minTopicLength);

      // No per-topic timing data available without chapters → do not add duration/position
      finalTopics = cleaned;
    } else {
      throw new Error(`Unbekannte Datenquelle: ${dataSource.source}`);
    }

    // Erstelle Ergebnis-Objekt
    const result = {
      episodeNumber: episodeNumber,
      title: episodeData.main.title,
      extractedAt: new Date().toISOString(),
      dataSource: dataSource.source,
      topics: finalTopics
    };

    // Speichere in Datei
    fs.writeFileSync(topicsFile, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`  ✅ ${finalTopics.length} Themen extrahiert und gespeichert`);
    
    // Zeige Themen
    finalTopics.forEach((topic, i) => {
      console.log(`     ${i + 1}. ${topic.topic} (${topic.subject?.coarse || '?'}/${topic.subject?.fine || '?'})`);
    });

  } catch (error) {
    console.error(`  ❌ Fehler bei Episode ${episodeNumber}:`, error.message);
    throw error;
  }
}

/**
 * Finde alle verfügbaren Episoden-Nummern
 */
function findEpisodeNumbers() {
  const episodesDir = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');
  const files = fs.readdirSync(episodesDir);
  
  const numbers = new Set();
  files.forEach(file => {
    const match = file.match(/^(\d+)\.json$/);
    if (match) {
      numbers.add(parseInt(match[1]));
    }
  });
  
  return Array.from(numbers).sort((a, b) => a - b);
}

/**
 * Hauptfunktion
 */
async function main() {
  console.log(`🚀 Starte Topic-Extraktion für ${PODCAST_ID} Episoden\n`);
  console.log(`LLM: ${settings.llm.provider} - ${settings.llm.model}`);
  console.log(`Sprache: ${settings.topicExtraction.language}`);
  console.log(`Keine Maximalzahl - extrahiere alle Hauptthemen\n`);

  // Hole Episoden-Nummern
  const episodeNumbers = findEpisodeNumbers();
  console.log(`Gefundene Episoden: ${episodeNumbers.length}\n`);

  // Verarbeite Kommandozeilen-Argumente (filtere --podcast Parameter raus)
  const rawArgs = process.argv.slice(2);
  const args = [];
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--podcast') {
      i++; // Skip podcast ID
      continue;
    }
    args.push(rawArgs[i]);
  }
  
  let episodesToProcess = episodeNumbers;
  let forceOverwrite = false;

  // Prüfe auf --force Flag
  if (args.includes('--force')) {
    forceOverwrite = true;
    console.log('🔄 Force-Modus aktiviert: Bestehende Topic-Dateien werden überschrieben\n');
    // Entferne --force aus den Argumenten
    args.splice(args.indexOf('--force'), 1);
  }

  if (args.length > 0) {
    if (args[0] === '--all') {
      // Alle Episoden verarbeiten
      console.log('Verarbeite ALLE Episoden...\n');
    } else if (args[0] === '--range') {
      // Bereich verarbeiten: --range 1 10
      const start = parseInt(args[1]);
      const end = parseInt(args[2]);
      episodesToProcess = episodeNumbers.filter(n => n >= start && n <= end);
      console.log(`Verarbeite Episoden ${start}-${end} (${episodesToProcess.length} Episoden)...\n`);
    } else {
      // Einzelne Episode(n)
      episodesToProcess = args.map(arg => parseInt(arg)).filter(n => !isNaN(n));
      console.log(`Verarbeite ${episodesToProcess.length} spezifische Episode(n)...\n`);
    }
  } else {
    // Keine Argumente - nur erste Episode als Test
    episodesToProcess = [episodeNumbers[0]];
    console.log(`Keine Argumente angegeben, verarbeite nur Episode ${episodesToProcess[0]} als Test.\n`);
    console.log(`Verwendung:`);
    console.log(`  node scripts/extract-topics.js <episode-nummer>          # Einzelne Episode`);
    console.log(`  node scripts/extract-topics.js 1 2 3                     # Mehrere Episoden`);
    console.log(`  node scripts/extract-topics.js --range 1 10              # Bereich von Episoden`);
    console.log(`  node scripts/extract-topics.js --all                     # Alle Episoden`);
    console.log(`  node scripts/extract-topics.js --force <episode>         # Überschreibe bestehende Topics\n`);
  }

  // Verarbeite Episoden
  let processed = 0;
  let errors = 0;
  const delayMs = settings.topicExtraction.requestDelayMs || 3000;
  
  console.log(`⏱️  Pause zwischen Anfragen: ${delayMs / 1000} Sekunden\n`);
  
  for (const episodeNumber of episodesToProcess) {
    try {
      await extractTopicsForEpisode(episodeNumber, forceOverwrite);
      processed++;
      
      // Pause zwischen Anfragen, um Rate Limits zu vermeiden
      if (episodesToProcess.length > 1 && processed < episodesToProcess.length) {
        console.log(`  ⏸️  Warte ${delayMs / 1000} Sekunden vor nächster Episode...`);
        await sleep(delayMs);
      }
    } catch (error) {
      errors++;
      console.error(`  ❌ Fehler bei Episode ${episodeNumber}: ${error.message}`);
      
      if (errors > 3) {
        console.error('\n❌ Zu viele Fehler aufgetreten, breche ab...');
        break;
      }
      
      // Bei Fehler auch eine Pause einlegen
      if (processed < episodesToProcess.length) {
        console.log(`  ⏸️  Warte ${delayMs / 1000} Sekunden nach Fehler...`);
        await sleep(delayMs);
      }
    }
  }

  console.log(`\n✅ Fertig! ${processed} Episoden verarbeitet, ${errors} Fehler`);
}

// Starte das Skript
main().catch(error => {
  console.error('❌ Kritischer Fehler:', error);
  process.exit(1);
});

