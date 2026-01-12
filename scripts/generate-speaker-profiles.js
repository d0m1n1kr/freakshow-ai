import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function safeMkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
}

function slugify(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'unknown-speaker';
}

function parseArgs(argv) {
  // Parse podcast argument
  const podcastIndex = argv.indexOf('--podcast');
  const PODCAST_ID = podcastIndex !== -1 && argv[podcastIndex + 1] ? argv[podcastIndex + 1] : 'freakshow';
  const PROJECT_ROOT = path.join(__dirname, '..');
  
  const args = {
    episodesDir: path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes'),
    outDir: path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'speakers'),
    cacheDir: path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'speakers', '.cache'),
    podcastId: PODCAST_ID,
    minWordsForLLM: 800,
    maxChunkChars: 16000,
    maxChunks: 8,
    maxConcurrency: 3,  // Parallel LLM requests
    requestDelayMs: null,
    personaMode: 'speaker', // 'speaker' | 'fictional'
    characterName: null,
    force: false,
    dryRun: false,
    noLLM: false,
    speaker: null, // exact match
    speakerRegex: null, // string regex
    limitSpeakers: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episodes-dir') args.episodesDir = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--cache-dir') args.cacheDir = argv[++i];
    else if (a === '--min-words') args.minWordsForLLM = parseInt(argv[++i], 10);
    else if (a === '--chunk-chars') args.maxChunkChars = parseInt(argv[++i], 10);
    else if (a === '--max-chunks') args.maxChunks = parseInt(argv[++i], 10);
    else if (a === '--max-concurrency') args.maxConcurrency = parseInt(argv[++i], 10);
    else if (a === '--delay-ms') args.requestDelayMs = parseInt(argv[++i], 10);
    else if (a === '--persona-mode') args.personaMode = String(argv[++i] || '').trim();
    else if (a === '--character-name') args.characterName = argv[++i];
    else if (a === '--force' || a === '-f') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--no-llm') args.noLLM = true;
    else if (a === '--speaker') args.speaker = argv[++i];
    else if (a === '--speaker-regex') args.speakerRegex = argv[++i];
    else if (a === '--limit-speakers') args.limitSpeakers = parseInt(argv[++i], 10);
    else if (a === '--help' || a === '-h') args.help = true;
  }

  return args;
}

function printHelp() {
  console.log(`
Generate speaker profiles (Markdown) from episode transcripts (*-ts.json).

Usage:
  node scripts/generate-speaker-profiles.js [options]

Options:
  --podcast <id>             Podcast ID (default: freakshow)
                             Examples: freakshow, ukw, lnp, cre, raumzeit, etc.
                             
  --episodes-dir <dir>       Episodes directory (default: podcasts/<podcast>/episodes)
  --out-dir <dir>            Output directory (default: podcasts/<podcast>/speakers)
  --cache-dir <dir>          Cache directory (default: podcasts/<podcast>/speakers/.cache)
  --min-words <n>            Minimum words per speaker to call LLM (default: 800)
  --chunk-chars <n>          Chunk size in characters for LLM map step (default: 16000)
  --max-chunks <n>           Maximum number of chunks per speaker (evenly sampled). Default: 8
  --max-concurrency <n>      Maximum parallel LLM requests (default: 3)
                             Higher values = faster, but may hit rate limits
  --persona-mode <mode>      'speaker' (default) or 'fictional' (distinct character inspired by style features)
  --character-name <name>    Required for persona-mode 'fictional' (name of the fictional chatbot character)
  --delay-ms <n>             Delay between LLM requests (overrides settings.topicExtraction.requestDelayMs)
  --speaker <name>           Only process this exact speaker name
  --speaker-regex <pattern>  Only process speakers matching regex (JS RegExp, case-insensitive)
  --limit-speakers <n>       Only process first N speakers (after sorting by word count desc)
  --no-llm                   Only extract + write stats (no LLM calls)
  --dry-run                  Print what would be done, write nothing
  --force, -f                Re-generate profiles even if cache is up-to-date
  --help, -h                 Show this help message

Examples:
  # Generate profiles for freakshow (default)
  node scripts/generate-speaker-profiles.js

  # Generate profiles for UKW podcast
  node scripts/generate-speaker-profiles.js --podcast ukw

  # Generate profile for specific speaker in LNP
  node scripts/generate-speaker-profiles.js --podcast lnp --speaker "Linus Neumann"

  # Force regenerate all profiles for CRE
  node scripts/generate-speaker-profiles.js --podcast cre --force

  # Process only top 3 speakers in Raumzeit
  node scripts/generate-speaker-profiles.js --podcast raumzeit --limit-speakers 3
`);
}

function findTranscriptFiles(episodesDir) {
  const files = fs.readdirSync(episodesDir);
  return files
    .filter((f) => /^\d+-ts\.json$/.test(f))
    .map((f) => ({
      file: f,
      episodeNumber: parseInt(f.match(/^(\d+)-ts\.json$/)[1], 10),
      fullPath: path.join(episodesDir, f),
    }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function normalizeSpeakerName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function countWords(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  return t.split(/\s+/g).length;
}

function buildChunks(lines, maxChars) {
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    const add = (cur ? '\n' : '') + line;
    if (cur.length + add.length > maxChars && cur.length > 0) {
      chunks.push(cur);
      cur = line;
    } else {
      cur += add;
    }
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function sampleChunksEvenly(chunks, maxChunks) {
  if (maxChunks == null) return chunks;
  const n = Number(maxChunks);
  if (!Number.isFinite(n) || n <= 0) return [];
  if (chunks.length <= n) return chunks;
  if (n === 1) return [chunks[Math.floor(chunks.length / 2)]];

  // Evenly sample indices across [0, len-1], include start/end-ish.
  const last = chunks.length - 1;
  const picked = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * last) / (n - 1));
    picked.push(chunks[idx]);
  }

  // Deduplicate (rounding can collide) while keeping order.
  const seen = new Set();
  const out = [];
  for (const c of picked) {
    const h = sha1(c);
    if (seen.has(h)) continue;
    seen.add(h);
    out.push(c);
  }

  // If collisions reduced the count, top up from the remaining chunks.
  if (out.length < n) {
    for (let i = 0; i < chunks.length && out.length < n; i++) {
      const h = sha1(chunks[i]);
      if (seen.has(h)) continue;
      seen.add(h);
      out.push(chunks[i]);
    }
  }

  return out;
}

function extractFirstJsonObject(text) {
  const s = String(text || '').trim();
  const match = s.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : s;
  return JSON.parse(jsonText);
}

async function callChatCompletionsOpenAICompatible({ baseURL, apiKey, model, temperature, maxTokens }, messages, retryCfg) {
  const { maxRetries, retryDelayMs } = retryCfg;

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429 && attempt < maxRetries) {
        const waitMs = retryDelayMs * Math.pow(2, attempt);
        console.log(`  ⏳ Rate limit, warte ${Math.round(waitMs / 1000)}s... (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const t = await res.text();
        throw new Error(`LLM API Fehler: ${res.status} - ${t}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('LLM-Antwort leer/unerwartetes Format');
      return content;
    } catch (e) {
      const msg = String(e?.message || e);
      const isNetwork = msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT');
      if (isNetwork && attempt < maxRetries) {
        const waitMs = retryDelayMs * Math.pow(2, attempt);
        console.log(`  ⏳ Netzwerkfehler, warte ${Math.round(waitMs / 1000)}s... (${attempt + 1}/${maxRetries})`);
        await sleep(waitMs);
        continue;
      }
      throw e;
    }
  }

  throw new Error('Unreachable: retry loop ended unexpectedly');
}

function chunkAnalysisMessages({ speakerName, chunkText, languageHint }) {
  return [
    {
      role: 'system',
      content:
        'Rolle: Du bist Linguist, Kommunikationsstratege und Stilanalyst.\n' +
        'Deine Aufgabe ist es, aus diesem Transkript-Ausschnitt sprachliche und stilistische Merkmale zu extrahieren, ' +
        'die später genutzt werden können, um neue Texte im Stil dieser Person zu generieren.\n\n' +
        'Analysiere insbesondere:\n' +
        '• Tonfall (formell, locker, motivierend, kritisch, humorvoll, sachlich, emotional)\n' +
        '• Satzstruktur (kurz/lang, einfach/verschachtelt, abgebrochen, elliptisch)\n' +
        '• Wortwahl (Alltagssprache, Fachsprache, Anglizismen, Metaphern, Bildsprache)\n' +
        '• Typische Formulierungen & wiederkehrende Phrasen (extrahiere KONKRETE Beispiele!)\n' +
        '• Umgang mit:\n' +
        '  - Fragen (stellt viele? rhetorisch? direkt?)\n' +
        '  - Beispielen & Geschichten (nutzt Anekdoten? abstrakt? konkret?)\n' +
        '  - Vorlieben und Abneigungen (Worüber spricht die Person gerne/ungerne? Wie?)\n' +
        '  - Emotionen (zeigt Begeisterung? Zurückhaltung? Ironie?)\n' +
        '  - Direktheit/Klarheit (auf den Punkt? schweifend? diplomatisch?)\n' +
        '• Haltung & Persona (Coach, Experte, Visionär, Kritiker, Entertainer, Vermittler)\n\n' +
        'WICHTIG:\n' +
        '- Extrahiere VIELE konkrete Beispielphrasen wortwörtlich aus dem Text\n' +
        '- Sei spezifisch: nicht "oft Füllwörter" sondern "beginnt oft mit \'also\', \'ja nee\', \'ich mein\' (ca. 30% der Sätze)"\n' +
        '- Erfinde nichts - nur was im Text nachweisbar ist\n' +
        '- Ignoriere Themeninhalte - fokussiere auf WIE gesprochen wird, nicht WAS\n\n' +
        'Antworte ausschließlich mit einem JSON-Objekt mit genau diesen Schlüsseln: ' +
        '{"language": string, "register": string, "tone": string, "pace": string, "syntax": string, "discourse_markers": string[], "favorite_words": string[], "fillers": string[], "humor_style": string, "attitude": string, "interaction_style": string, "questions_usage": string, "examples_usage": string, "emotional_range": string, "directness": string, "tics": string[], "swearing": string, "code_switching": string, "examples": string[], "notes": string}.',
    },
    {
      role: 'user',
      content:
        `Speaker: ${speakerName}\n` +
        (languageHint ? `Language hint: ${languageHint}\n` : '') +
        `\nTRANSKRIPT-AUSSCHNITT:\n${chunkText}`,
    },
  ];
}

function finalProfileMessages({ speakerName, stats, chunkAnalyses }) {
  return [
    {
      role: 'system',
      content:
        'Rolle: Du bist Linguist, Kommunikationsstratege und Stilanalyst.\n' +
        'Deine Aufgabe ist es, aus den folgenden Transkript-Analysen ein präzises Sprecherprofil zu erstellen, ' +
        'das später genutzt werden kann, um neue Texte im Stil dieser Person zu generieren.\n\n' +
        'Du erhältst mehrere Chunk-Analysen. Synthesiere sie zu einem vollständigen Profil.\n\n' +
        'Aufgaben:\n' +
        '1. Extrahiere die sprachlichen und stilistischen Merkmale der Person\n' +
        '2. Erstelle daraus ein Sprecherprofil, das für Textgenerierung geeignet ist\n' +
        '3. Formuliere das Ergebnis so, dass es direkt als Stilvorgabe für ein LLM genutzt werden kann\n\n' +
        'Bitte analysiere und synthetisiere:\n' +
        '• Tonfall (z.B. formell, locker, motivierend, kritisch, humorvoll)\n' +
        '• Satzstruktur (kurz/lang, einfach/verschachtelt)\n' +
        '• Wortwahl (Alltagssprache, Fachsprache, Anglizismen, Metaphern)\n' +
        '• Typische Formulierungen & wiederkehrende Phrasen (sammle die häufigsten!)\n' +
        '• Umgang mit Fragen, Beispielen & Geschichten, Vorlieben und Abneigungen, Emotionen, Direktheit/Klarheit\n' +
        '• Haltung & Persona (z.B. Coach, Experte, Visionär, Kritiker)\n\n' +
        'ANFORDERUNGEN:\n' +
        '- Sei SEHR spezifisch: Nicht "verwendet Füllwörter" sondern "beginnt Sätze oft mit \'also\', \'ja nee\', \'ich mein\'"\n' +
        '- Sammle die häufigsten und charakteristischsten Wörter/Phrasen aus allen Chunk-Analysen\n' +
        '- Beschreibe Humor-Stil mit konkreten Beispielen und Mustern\n' +
        '- Identifiziere Persönlichkeits-Traits, die sich im Sprechen zeigen\n' +
        '- Liste typische Satzstrukturen und -muster auf\n' +
        '- Wähle 10-20 besonders charakteristische Beispiel-Zitate aus den Analysen\n\n' +
        'OUTPUT-FORMAT:\n' +
        'Erstelle ein JSON mit folgender Struktur:\n' +
        '{\n' +
        '  "speaker": string,\n' +
        '  "confidence": string (hoch/mittel/niedrig),\n' +
        '  "short_characterization": string (5-7 Sätze Fließtext über die Stimme/den Stil),\n' +
        '  "style_dna": {\n' +
        '    "tone": string[],\n' +
        '    "register": string,\n' +
        '    "sentence_structure": string[],\n' +
        '    "word_choice": string[],\n' +
        '    "rhythm": string,\n' +
        '    "typical_devices": string[]\n' +
        '  },\n' +
        '  "do_list": string[] (Dinge, die der Stil immer nutzt),\n' +
        '  "dont_list": string[] (Dinge, die vermieden werden sollten),\n' +
        '  "typical_phrases": string[] (10-20 wiederkehrende/stilprägende Formulierungen),\n' +
        '  "language": string,\n' +
        '  "vocabulary": {\n' +
        '    "high_freq": string[],\n' +
        '    "idiosyncratic": string[],\n' +
        '    "taboo_or_avoids": string[]\n' +
        '  },\n' +
        '  "discourse_markers": string[],\n' +
        '  "humor_and_devices": string[],\n' +
        '  "interaction_playbook": {\n' +
        '    "questions": string,\n' +
        '    "examples_stories": string,\n' +
        '    "emotions": string,\n' +
        '    "directness": string\n' +
        '  },\n' +
        '  "attitude_and_persona": string[],\n' +
        '  "tics": string[],\n' +
        '  "swearing": string,\n' +
        '  "code_switching": string,\n' +
        '  "example_lines": string[],\n' +
        '  "generation_system_prompt": string (System-Prompt für LLM zur Textgenerierung in diesem Stil)\n' +
        '}',
    },
    {
      role: 'user',
      content:
        `Speaker: ${speakerName}\n` +
        `Stats: ${JSON.stringify(stats)}\n\n` +
        `Chunk analyses (JSON objects):\n${JSON.stringify(chunkAnalyses, null, 2)}\n\n` +
        `Erstelle jetzt das vollständige Sprecherprofil im angegebenen JSON-Format.`,
    },
  ];
}

function fictionalProfileMessages({ characterName, stats, chunkAnalyses }) {
  return [
    {
      role: 'system',
      content:
        'Du entwirfst eine fiktive Chatbot-Figur (Persona), inspiriert von Stilmerkmalen aus Sprach-Analysen. ' +
        'Wichtig: Erzeuge eine eigenständige, fiktive Figur. Keine Referenzen auf reale Personen, keine Namen realer Personen, keine biografischen Behauptungen. ' +
        'Keine wörtlichen Zitate aus dem Originaltext. Keine erkennbaren Catchphrases 1:1 übernehmen. ' +
        'Ziel: ein praktisch nutzbares Persona-Spec, das konsistenten Wortschatz, Duktus, Rhythmus, Humor und Gesprächsführung vorgibt. ' +
        'Antworte ausschließlich mit einem JSON-Objekt mit genau diesen Schlüsseln: ' +
        '{"speaker": string, "confidence": string, "one_line_essence": string, "language": string, "register": string, "style_fingerprint": string[], "vocabulary": {"high_freq": string[], "idiosyncratic": string[], "taboo_or_avoids": string[]}, "syntax_and_rhythm": string[], "discourse_markers": string[], "humor_and_devices": string[], "attitude_and_values": string[], "interaction_playbook": {"does": string[], "does_not": string[]}, "tics": string[], "swearing": string, "code_switching": string, "example_lines": string[], "mimic_system_prompt": string, "mimic_user_instructions": string}.',
    },
    {
      role: 'user',
      content:
        `Character name: ${characterName}\n` +
        `Constraints:\n- Must be clearly fictional and distinct\n- No verbatim quotes from the source material\n- No real person references\n\n` +
        `Style evidence (chunk analyses):\n${JSON.stringify(chunkAnalyses, null, 2)}\n\n` +
        `Source coverage stats (for confidence only):\n${JSON.stringify(stats)}`,
    },
  ];
}

function renderMarkdownProfile(profile, stats, sourceInfo) {
  const lines = [];
  lines.push(`# Speaker Profile: ${profile.speaker || sourceInfo.speakerName}`);
  lines.push('');
  
  lines.push('## Data coverage');
  lines.push('');
  lines.push(`- **Episodes**: ${stats.episodesCount}`);
  lines.push(`- **Utterances**: ${stats.utterancesCount}`);
  lines.push(`- **Words (approx.)**: ${stats.totalWords}`);
  lines.push(`- **Confidence**: ${profile.confidence || 'unknown'}`);
  lines.push('');
  
  lines.push('## 1. Kurzcharakteristik');
  lines.push('');
  lines.push(profile.short_characterization || profile.one_line_essence || '_No characterization generated._');
  lines.push('');
  
  lines.push('## 2. Stil-DNA');
  lines.push('');
  
  if (profile.style_dna) {
    lines.push('### Ton');
    lines.push('');
    for (const s of profile.style_dna.tone || []) lines.push(`- ${s}`);
    if (!profile.style_dna.tone?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Sprachregister');
    lines.push('');
    lines.push(profile.style_dna.register || profile.register || '_n/a_');
    lines.push('');
    
    lines.push('### Satzbau');
    lines.push('');
    for (const s of profile.style_dna.sentence_structure || profile.syntax_and_rhythm || []) lines.push(`- ${s}`);
    if (!profile.style_dna.sentence_structure?.length && !profile.syntax_and_rhythm?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Wortwahl');
    lines.push('');
    for (const s of profile.style_dna.word_choice || []) lines.push(`- ${s}`);
    if (!profile.style_dna.word_choice?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Rhythmus');
    lines.push('');
    lines.push(profile.style_dna.rhythm || '_n/a_');
    lines.push('');
    
    lines.push('### Typische Mittel');
    lines.push('');
    for (const s of profile.style_dna.typical_devices || profile.humor_and_devices || []) lines.push(`- ${s}`);
    if (!profile.style_dna.typical_devices?.length && !profile.humor_and_devices?.length) lines.push('- _n/a_');
    lines.push('');
  } else {
    // Fallback to old format
    lines.push('### Style fingerprint');
    lines.push('');
    for (const s of profile.style_fingerprint || []) lines.push(`- ${s}`);
    if (!profile.style_fingerprint?.length) lines.push('- _n/a_');
    lines.push('');
  }
  
  lines.push('## 3. Do / Don\'t Liste');
  lines.push('');
  
  lines.push('### ✅ Do (Dinge, die der Stil nutzt)');
  lines.push('');
  for (const s of profile.do_list || profile.interaction_playbook?.does || []) lines.push(`- ${s}`);
  if (!profile.do_list?.length && !profile.interaction_playbook?.does?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('### ❌ Don\'t (Dinge, die vermieden werden)');
  lines.push('');
  for (const s of profile.dont_list || profile.interaction_playbook?.does_not || []) lines.push(`- ${s}`);
  if (!profile.dont_list?.length && !profile.interaction_playbook?.does_not?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('## 4. Typische Phrasen');
  lines.push('');
  for (const s of profile.typical_phrases || []) lines.push(`- "${s}"`);
  if (!profile.typical_phrases?.length) {
    // Fallback: use discourse markers + high freq words
    const fallback = [
      ...(profile.discourse_markers || []).slice(0, 5),
      ...(profile.vocabulary?.high_freq || []).slice(0, 5)
    ];
    for (const s of fallback) lines.push(`- "${s}"`);
    if (!fallback.length) lines.push('- _n/a_');
  }
  lines.push('');
  
  lines.push('## 5. Prompt für Textgenerierung');
  lines.push('');
  lines.push('### System Prompt');
  lines.push('');
  lines.push('```');
  lines.push(profile.generation_system_prompt || profile.mimic_system_prompt || '_No prompt generated._');
  lines.push('```');
  lines.push('');
  
  // Additional detailed sections for reference
  lines.push('---');
  lines.push('');
  lines.push('## Detaillierte Analyse (Referenz)');
  lines.push('');
  
  lines.push('### Sprache & Register');
  lines.push('');
  lines.push(`- **Language**: ${profile.language || 'unknown'}`);
  lines.push(`- **Register**: ${profile.style_dna?.register || profile.register || 'unknown'}`);
  lines.push('');
  
  lines.push('### Vokabular');
  lines.push('');
  lines.push('#### Hochfrequente Wörter/Phrasen');
  lines.push('');
  for (const s of profile.vocabulary?.high_freq || []) lines.push(`- ${s}`);
  if (!profile.vocabulary?.high_freq?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('#### Idiosynkratisches Lexikon');
  lines.push('');
  for (const s of profile.vocabulary?.idiosyncratic || []) lines.push(`- ${s}`);
  if (!profile.vocabulary?.idiosyncratic?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('#### Vermeidet/Tabu');
  lines.push('');
  for (const s of profile.vocabulary?.taboo_or_avoids || []) lines.push(`- ${s}`);
  if (!profile.vocabulary?.taboo_or_avoids?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('### Diskursmarker');
  lines.push('');
  for (const s of profile.discourse_markers || []) lines.push(`- ${s}`);
  if (!profile.discourse_markers?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('### Interaktionsmuster');
  lines.push('');
  if (profile.interaction_playbook) {
    if (profile.interaction_playbook.questions) {
      lines.push('**Fragen:** ' + profile.interaction_playbook.questions);
      lines.push('');
    }
    if (profile.interaction_playbook.examples_stories) {
      lines.push('**Beispiele & Geschichten:** ' + profile.interaction_playbook.examples_stories);
      lines.push('');
    }
    if (profile.interaction_playbook.emotions) {
      lines.push('**Emotionen:** ' + profile.interaction_playbook.emotions);
      lines.push('');
    }
    if (profile.interaction_playbook.directness) {
      lines.push('**Direktheit:** ' + profile.interaction_playbook.directness);
      lines.push('');
    }
  } else {
    lines.push('_n/a_');
    lines.push('');
  }
  
  lines.push('### Haltung & Persona');
  lines.push('');
  for (const s of profile.attitude_and_persona || profile.attitude_and_values || []) lines.push(`- ${s}`);
  if (!profile.attitude_and_persona?.length && !profile.attitude_and_values?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('### Tics & Eigenheiten');
  lines.push('');
  for (const s of profile.tics || []) lines.push(`- ${s}`);
  if (!profile.tics?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('### Flüche/Profanität');
  lines.push('');
  lines.push(profile.swearing || '_n/a_');
  lines.push('');
  
  lines.push('### Code-Switching');
  lines.push('');
  lines.push(profile.code_switching || '_n/a_');
  lines.push('');
  
  lines.push('### Beispiel-Zitate (verbatim)');
  lines.push('');
  for (const s of profile.example_lines || []) lines.push(`- "${s}"`);
  if (!profile.example_lines?.length) lines.push('- _n/a_');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.maxChunks != null) {
    if (!Number.isFinite(args.maxChunks) || args.maxChunks < 1) {
      console.error('❌ --max-chunks must be a positive integer (>= 1).');
      process.exit(1);
    }
  }

  if (!['speaker', 'fictional'].includes(args.personaMode)) {
    console.error("❌ --persona-mode must be 'speaker' or 'fictional'.");
    process.exit(1);
  }
  if (args.personaMode === 'fictional') {
    if (!args.characterName || !String(args.characterName).trim()) {
      console.error("❌ --character-name is required when --persona-mode fictional.");
      process.exit(1);
    }
    // Avoid ambiguous output: enforce a single source speaker selection.
    if (!args.speaker || args.speakerRegex || args.limitSpeakers != null) {
      console.error("❌ For --persona-mode fictional, please select exactly one source speaker via --speaker \"Exact Name\" (and don't use --speaker-regex/--limit-speakers).");
      process.exit(1);
    }
    if (args.noLLM) {
      console.error('❌ --persona-mode fictional requires the LLM (remove --no-llm).');
      process.exit(1);
    }
  }

  // settings.json lives in the project root (next to settings.example.json), not in scripts/
  const settingsPath = path.join(__dirname, '..', 'settings.json');
  if (!fs.existsSync(settingsPath) && !args.noLLM) {
    console.error(`❌ settings.json not found at ${settingsPath}. Create it (see settings.example.json) or run with --no-llm.`);
    process.exit(1);
  }

  // Important: In some environments settings.json may be inaccessible (e.g. ignored/sensitive files).
  // Only read it when we actually need LLM config.
  const settings = !args.noLLM && fs.existsSync(settingsPath) ? readJson(settingsPath) : null;
  const retryCfg = {
    maxRetries: settings?.topicExtraction?.maxRetries ?? 3,
    retryDelayMs: settings?.topicExtraction?.retryDelayMs ?? 5000,
  };
  const delayMs = args.requestDelayMs ?? settings?.topicExtraction?.requestDelayMs ?? 3000;

  const llmCfg = settings
    ? {
        provider: settings.llm?.provider,
        model: settings.llm?.model,
        apiKey: settings.llm?.apiKey,
        baseURL: settings.llm?.baseURL,
        temperature: settings.llm?.temperature ?? 0.3,
        maxTokens: settings.llm?.maxTokens ?? 2500,
      }
    : null;

  if (!args.noLLM) {
    if (!llmCfg?.apiKey || !llmCfg?.baseURL || !llmCfg?.model) {
      console.error('❌ LLM config missing in settings.json (llm.apiKey/baseURL/model).');
      process.exit(1);
    }
  }

  console.log('🎙️  Generiere Speaker-Profile aus Transkripten\n');
  console.log(`Podcast:      ${args.podcastId}`);
  console.log(`Episodes dir: ${args.episodesDir}`);
  console.log(`Output dir:   ${args.outDir}`);
  console.log(`Cache dir:    ${args.cacheDir}`);
  console.log(`LLM:          ${args.noLLM ? 'disabled' : `${llmCfg.provider || 'openai-compatible'} - ${llmCfg.model}`}`);
  console.log('');

  const transcriptFiles = findTranscriptFiles(args.episodesDir);
  if (transcriptFiles.length === 0) {
    console.error('❌ Keine *-ts.json Dateien gefunden.');
    process.exit(1);
  }
  console.log(`📂 ${transcriptFiles.length} Transcript-Dateien gefunden`);

  const speakerMap = new Map();
  for (const f of transcriptFiles) {
    const raw = readJson(f.fullPath);
    const transcript = raw?.transcript;
    if (!Array.isArray(transcript)) continue;
    for (const t of transcript) {
      const speaker = normalizeSpeakerName(t?.speaker);
      const text = String(t?.text || '').trim();
      const time = String(t?.time || '').trim();
      if (!speaker || !text) continue;

      const entry = speakerMap.get(speaker) || {
        speaker,
        episodes: new Set(),
        utterancesCount: 0,
        totalWords: 0,
        lines: [],
      };
      entry.episodes.add(f.episodeNumber);
      entry.utterancesCount++;
      entry.totalWords += countWords(text);

      // Keep a compact line with minimal metadata (helps during chunking; LLM instructed to ignore content).
      entry.lines.push(time ? `[${f.episodeNumber} @ ${time}] ${text}` : `[${f.episodeNumber}] ${text}`);

      speakerMap.set(speaker, entry);
    }
  }

  const allSpeakers = Array.from(speakerMap.values())
    .map((s) => ({
      ...s,
      episodesCount: s.episodes.size,
      episodes: Array.from(s.episodes).sort((a, b) => a - b),
    }))
    .sort((a, b) => b.totalWords - a.totalWords);

  let speakersToProcess = allSpeakers;
  if (args.speaker) speakersToProcess = speakersToProcess.filter((s) => s.speaker === args.speaker);
  if (args.speakerRegex) {
    const re = new RegExp(args.speakerRegex, 'i');
    speakersToProcess = speakersToProcess.filter((s) => re.test(s.speaker));
  }
  if (args.limitSpeakers != null) speakersToProcess = speakersToProcess.slice(0, args.limitSpeakers);

  console.log(`👥 Speakers gefunden: ${speakersToProcess.length}`);
  if (speakersToProcess.length === 0) {
    console.error('❌ Kein Speaker matcht die Filter.');
    process.exit(1);
  }

  // Ensure dirs
  if (!args.dryRun) {
    safeMkdirp(args.outDir);
    safeMkdirp(args.cacheDir);
  }

  // Write a full index for convenience (independent from filters)
  // Note: profilePath is not included - backend constructs paths relative to speakers directory
  const index = allSpeakers.map((s) => ({
    speaker: s.speaker,
    slug: slugify(s.speaker),
    episodesCount: s.episodesCount,
    utterancesCount: s.utterancesCount,
    totalWords: s.totalWords,
    episodes: s.episodes,
  }));

  if (!args.dryRun) {
    fs.writeFileSync(path.join(args.outDir, 'index.json'), JSON.stringify(index, null, 2));
  }

  for (const s of speakersToProcess) {
    const speakerName = s.speaker;
    const effectiveName = args.personaMode === 'fictional' ? String(args.characterName).trim() : speakerName;
    const slug = slugify(effectiveName);
    const outFile = path.join(args.outDir, `${slug}.md`);
    const cacheFile = path.join(args.cacheDir, `${slug}.json`);

    const stats = {
      speaker: speakerName,
      episodesCount: s.episodesCount,
      utterancesCount: s.utterancesCount,
      totalWords: s.totalWords,
      episodes: s.episodes,
    };

    const rawTextHash = sha1(s.lines.join('\n'));
    if (!args.force && fs.existsSync(outFile) && fs.existsSync(cacheFile)) {
      try {
        const cached = readJson(cacheFile);
        if (cached?.rawTextHash === rawTextHash && cached?.finalProfile?.speaker) {
          console.log(`✅ ${speakerName} (cache hit)`);
          continue;
        }
      } catch (_) {
        // ignore cache parse errors
      }
    }

    console.log(`\n🧑‍🎤 ${effectiveName}${args.personaMode === 'fictional' ? ` (fictional; source: ${speakerName})` : ''}`);
    console.log(`   Episodes: ${s.episodesCount} | Utterances: ${s.utterancesCount} | Words: ~${s.totalWords}`);

    if (args.noLLM || s.totalWords < args.minWordsForLLM) {
      const reason = args.noLLM
        ? 'LLM disabled (--no-llm)'
        : `insufficient words (< ${args.minWordsForLLM})`;
      const md =
        `# Speaker Profile: ${speakerName}\n\n` +
        `## Data coverage\n\n` +
        `- **Episodes**: ${s.episodesCount}\n` +
        `- **Utterances**: ${s.utterancesCount}\n` +
        `- **Words (approx.)**: ${s.totalWords}\n\n` +
        `## Notes\n\n` +
        `Profile generation skipped (**${reason}**). Add more transcript data or lower --min-words.\n\n` +
        `## Example lines (verbatim)\n\n` +
        s.lines.slice(0, 30).map((l) => `- "${l.replace(/^\[[^\]]+\]\s*/, '')}"`).join('\n') +
        `\n\n---\n\n_Generated from transcripts (episodes/**/*-ts.json) on ${new Date().toISOString()}._\n`;

      if (args.dryRun) {
        console.log(`   (dry-run) would write ${outFile}`);
      } else {
        fs.writeFileSync(outFile, md, 'utf-8');
        fs.writeFileSync(cacheFile, JSON.stringify({ rawTextHash, finalProfile: null, skipped: reason }, null, 2));
      }
      continue;
    }

    const allChunks = buildChunks(s.lines, args.maxChunkChars);
    const chunks = sampleChunksEvenly(allChunks, args.maxChunks);
    const capInfo = args.maxChunks != null ? `, maxChunks=${args.maxChunks}` : '';
    console.log(`   Chunks: ${chunks.length}/${allChunks.length} (chunkChars=${args.maxChunkChars}${capInfo})`);

    let cached = null;
    if (fs.existsSync(cacheFile)) {
      try {
        cached = readJson(cacheFile);
      } catch (_) {
        cached = null;
      }
    }

    const chunkAnalyses = [];
    
    // Prepare all chunks that need LLM calls (non-cached)
    const chunksToProcess = [];
    const cachedAnalyses = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const chunkHash = sha1(chunkText);
      const cachedChunk = cached?.chunks?.find((c) => c.chunkHash === chunkHash);
      
      if (!args.force && cachedChunk?.analysis) {
        cachedAnalyses.push({ index: i, analysis: cachedChunk.analysis, cached: true });
        process.stdout.write(`   - chunk ${i + 1}/${chunks.length}: cache\n`);
      } else {
        chunksToProcess.push({ index: i, chunkText, chunkHash });
      }
    }
    
    // Process all non-cached chunks in parallel (with concurrency limit)
    const maxConcurrency = args.maxConcurrency || 3; // 3 parallel requests by default
    const processedChunks = [];
    
    for (let i = 0; i < chunksToProcess.length; i += maxConcurrency) {
      const batch = chunksToProcess.slice(i, i + maxConcurrency);
      
      process.stdout.write(`   - processing chunks ${i + 1}-${Math.min(i + maxConcurrency, chunksToProcess.length)}/${chunksToProcess.length} (parallel)…\n`);
      
      const batchPromises = batch.map(async ({ index, chunkText, chunkHash }) => {
        const messages = chunkAnalysisMessages({
          speakerName,
          chunkText,
          languageHint: settings?.topicExtraction?.language || null,
        });
        
        try {
          const response = await callChatCompletionsOpenAICompatible(llmCfg, messages, retryCfg);
          const analysis = extractFirstJsonObject(response);
          return { index, analysis, chunkHash, success: true };
        } catch (error) {
          console.error(`      ❌ chunk ${index + 1} failed: ${error.message}`);
          return { index, analysis: null, chunkHash, success: false };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      processedChunks.push(...batchResults);
      
      // Only delay between batches, not between individual requests
      if (i + maxConcurrency < chunksToProcess.length) {
        await sleep(delayMs);
      }
    }
    
    // Combine cached and processed chunks in correct order
    const allChunkResults = [...cachedAnalyses, ...processedChunks]
      .sort((a, b) => a.index - b.index);
    
    for (const result of allChunkResults) {
      if (result.cached || result.success) {
        chunkAnalyses.push(result.analysis);
      }
    }
    
    // Update cache with new chunks
    if (!args.dryRun && processedChunks.length > 0) {
      const newChunks = processedChunks
        .filter(r => r.success)
        .map(r => ({ chunkHash: r.chunkHash, analysis: r.analysis }));
      
      const nextCache = {
        rawTextHash,
        chunks: [
          ...(cached?.chunks || []),
          ...newChunks
        ],
        finalProfile: cached?.finalProfile || null,
      };
      fs.writeFileSync(cacheFile, JSON.stringify(nextCache, null, 2));
      cached = nextCache;
    }

    console.log('   - final synthesis: LLM…');
    const finalMessages =
      args.personaMode === 'fictional'
        ? fictionalProfileMessages({ characterName: effectiveName, stats, chunkAnalyses })
        : finalProfileMessages({ speakerName, stats, chunkAnalyses });
    const finalResponse = await callChatCompletionsOpenAICompatible(llmCfg, finalMessages, retryCfg);
    const finalProfile = extractFirstJsonObject(finalResponse);

    const md = renderMarkdownProfile(finalProfile, stats, {
      speakerName: effectiveName,
      episodesDirName: path.basename(args.episodesDir),
      personaMode: args.personaMode,
    });

    if (args.dryRun) {
      console.log(`   (dry-run) would write ${outFile}`);
    } else {
      fs.writeFileSync(outFile, md, 'utf-8');
      fs.writeFileSync(
        cacheFile,
        JSON.stringify(
          {
            rawTextHash,
            chunks: (cached?.chunks || []).filter(Boolean),
            finalProfile,
          },
          null,
          2
        )
      );
    }
    await sleep(delayMs);
  }

  console.log('\n✅ Done.');
}

main().catch((e) => {
  console.error('\n❌ Fehler:', e?.stack || e?.message || e);
  process.exit(1);
});


