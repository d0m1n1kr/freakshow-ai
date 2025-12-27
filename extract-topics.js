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
 * Ruft das LLM auf, um Hauptthemen zu extrahieren (mit Retry bei Rate Limits)
 */
async function callLLM(prompt, retryCount = 0) {
  const { provider, model, apiKey, baseURL, temperature, maxTokens } = settings.llm;
  const { maxRetries, retryDelayMs } = settings.topicExtraction;
  
  const requestBody = {
    model: model,
    messages: [
      {
        role: "system",
        content: "Du bist ein Assistent, der Hauptthemen aus Podcast-Episoden extrahiert. Antworte immer mit einem JSON-Array von Themen-Objekten. Jedes Objekt sollte ein 'topic' (kurze Beschreibung) und optional 'keywords' (Array von Schlagwörtern) enthalten."
      },
      {
        role: "user",
        content: prompt
      }
    ],
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

/**
 * Lade alle verfügbaren Informationen für eine Episode
 */
function loadEpisodeData(episodeNumber) {
  const episodesDir = path.join(__dirname, 'episodes');
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

  return data;
}

/**
 * Erstelle einen Prompt für das LLM aus den Episode-Daten
 */
function createPrompt(episodeData) {
  const { maxTopics, language } = settings.topicExtraction;
  
  let prompt = `Analysiere die folgenden Informationen einer Podcast-Episode und extrahiere die ${maxTopics} wichtigsten Hauptthemen. Wenn weniger themen relevant sind oder die themen sich zu weniger Hauptthemen sinnvoll zusammenfassen lassen, dann gib entsprechend weniger themen zurück.\n\n`;
  
  // Titel und Beschreibung
  if (episodeData.main) {
    prompt += `**Titel:** ${episodeData.main.title}\n`;
    if (episodeData.main.description) {
      prompt += `**Beschreibung:** ${episodeData.main.description}\n\n`;
    }
  }

  // Beschreibungstext
  if (episodeData.text) {
    // HTML-Tags entfernen und auf eine vernünftige Länge kürzen
    const cleanText = episodeData.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (cleanText.length > 0) {
      prompt += `**Text:** ${cleanText.substring(0, 1000)}${cleanText.length > 1000 ? '...' : ''}\n\n`;
    }
  }

  // Kapitel aus OSF Show Notes
  if (episodeData.osf && episodeData.osf.shownotes) {
    const chapters = episodeData.osf.shownotes
      .filter(section => section.chapter && section.chapter !== '')
      .map(section => section.chapter)
      .slice(0, 20); // Maximal 20 Kapitel
    
    if (chapters.length > 0) {
      prompt += `**Kapitel:**\n${chapters.map(c => `- ${c}`).join('\n')}\n\n`;
    }

    // Wichtige Begriffe/Links aus Show Notes
    const items = [];
    episodeData.osf.shownotes.forEach(section => {
      if (section.items) {
        section.items.forEach(item => {
          if (item.type === 'link' && item.text) {
            items.push(item.text);
          } else if (item.type === 'span' && item.text && !item.text.startsWith('"')) {
            // Nur Spans ohne Anführungszeichen (keine Zitate)
            items.push(item.text);
          }
        });
      }
    });
    
    if (items.length > 0) {
      const uniqueItems = [...new Set(items)].slice(0, 30); // Top 30 einzigartige Items
      prompt += `**Erwähnte Themen/Links:**\n${uniqueItems.slice(0, 20).join(', ')}\n\n`;
    }
  }

  prompt += `Antworte ausschließlich mit einem JSON-Array im folgenden Format (ohne zusätzlichen Text):\n`;
  prompt += `[\n`;
  prompt += `  {\n`;
  prompt += `    "topic": "Hauptthema als kurze Beschreibung",\n`;
  prompt += `    "keywords": ["keyword1", "keyword2"]\n`;
  prompt += `  }\n`;
  prompt += `]\n\n`;
  prompt += `Wichtig:\n`;
  prompt += `- Extrahiere maximal ${maxTopics} Hauptthemen\n`;
  prompt += `- Themen sollten die wichtigsten besprochenen Inhalte widerspiegeln\n`;
  prompt += `- Jedes Thema sollte klar und präzise sein\n`;
  prompt += `- Keywords sollten relevante Schlagwörter zum Thema sein\n`;
  prompt += `- Antwort muss valides JSON sein\n`;

  return prompt;
}

/**
 * Extrahiere Topics für eine Episode
 */
async function extractTopicsForEpisode(episodeNumber) {
  console.log(`\nVerarbeite Episode ${episodeNumber}...`);
  
  // Prüfe, ob topics-Datei bereits existiert
  const topicsFile = path.join(__dirname, 'episodes', `${episodeNumber}-topics.json`);
  if (fs.existsSync(topicsFile)) {
    console.log(`  ⚠️  Topics existieren bereits, überspringe...`);
    return;
  }

  // Lade Episode-Daten
  const episodeData = loadEpisodeData(episodeNumber);
  
  if (!episodeData.main) {
    console.log(`  ❌ Keine Basis-Daten gefunden, überspringe...`);
    return;
  }

  // Erstelle Prompt
  const prompt = createPrompt(episodeData);
  
  try {
    // LLM aufrufen
    console.log(`  🤖 Rufe LLM auf...`);
    const response = await callLLM(prompt);
    
    // Parse JSON response
    let topics;
    try {
      // Versuche, JSON aus der Antwort zu extrahieren (falls das LLM zusätzlichen Text zurückgibt)
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        topics = JSON.parse(jsonMatch[0]);
      } else {
        topics = JSON.parse(response);
      }
    } catch (parseError) {
      console.error(`  ❌ Fehler beim Parsen der LLM-Antwort:`, response);
      throw parseError;
    }

    // Validiere und bereinige Topics
    if (!Array.isArray(topics)) {
      throw new Error('LLM-Antwort ist kein Array');
    }

    const validTopics = topics.filter(t => t.topic && t.topic.length >= settings.topicExtraction.minTopicLength);

    // Erstelle Ergebnis-Objekt
    const result = {
      episodeNumber: episodeNumber,
      title: episodeData.main.title,
      extractedAt: new Date().toISOString(),
      topics: validTopics
    };

    // Speichere in Datei
    fs.writeFileSync(topicsFile, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`  ✅ ${validTopics.length} Themen extrahiert und gespeichert`);
    
    // Zeige Themen
    validTopics.forEach((topic, i) => {
      console.log(`     ${i + 1}. ${topic.topic}`);
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
  const episodesDir = path.join(__dirname, 'episodes');
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
  console.log('🚀 Starte Topic-Extraktion für Freakshow Episoden\n');
  console.log(`LLM: ${settings.llm.provider} - ${settings.llm.model}`);
  console.log(`Sprache: ${settings.topicExtraction.language}`);
  console.log(`Max Topics pro Episode: ${settings.topicExtraction.maxTopics}\n`);

  // Hole Episoden-Nummern
  const episodeNumbers = findEpisodeNumbers();
  console.log(`Gefundene Episoden: ${episodeNumbers.length}\n`);

  // Verarbeite Kommandozeilen-Argumente
  const args = process.argv.slice(2);
  let episodesToProcess = episodeNumbers;

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
    console.log(`  node extract-topics.js <episode-nummer>          # Einzelne Episode`);
    console.log(`  node extract-topics.js 1 2 3                     # Mehrere Episoden`);
    console.log(`  node extract-topics.js --range 1 10              # Bereich von Episoden`);
    console.log(`  node extract-topics.js --all                     # Alle Episoden\n`);
  }

  // Verarbeite Episoden
  let processed = 0;
  let errors = 0;
  const delayMs = settings.topicExtraction.requestDelayMs || 3000;
  
  console.log(`⏱️  Pause zwischen Anfragen: ${delayMs / 1000} Sekunden\n`);
  
  for (const episodeNumber of episodesToProcess) {
    try {
      await extractTopicsForEpisode(episodeNumber);
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

