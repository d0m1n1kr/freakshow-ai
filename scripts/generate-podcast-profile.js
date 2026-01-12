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

function sha1(text) {
  return crypto.createHash('sha1').update(String(text || ''), 'utf8').digest('hex');
}

function parseArgs(argv) {
  const podcastIndex = argv.indexOf('--podcast');
  const PODCAST_ID = podcastIndex !== -1 && argv[podcastIndex + 1] ? argv[podcastIndex + 1] : 'freakshow';
  const PROJECT_ROOT = path.join(__dirname, '..');
  
  const args = {
    episodesDir: path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes'),
    outDir: path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID),
    podcastId: PODCAST_ID,
    maxEpisodes: 15,  // Sample from 15 episodes
    maxExcerptChars: 8000,  // Per episode
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--podcast') i++; // already parsed
    else if (a === '--episodes-dir') args.episodesDir = argv[++i];
    else if (a === '--out-dir') args.outDir = argv[++i];
    else if (a === '--max-episodes') args.maxEpisodes = parseInt(argv[++i], 10);
    else if (a === '--max-excerpt-chars') args.maxExcerptChars = parseInt(argv[++i], 10);
    else if (a === '--force' || a === '-f') args.force = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }

  return args;
}

function printHelp() {
  console.log(`
Generate podcast profile (overall character/vibe) from episode transcripts.

Usage:
  node scripts/generate-podcast-profile.js [options]

Options:
  --podcast <id>             Podcast ID (default: freakshow)
  --episodes-dir <dir>       Episodes directory (default: podcasts/<podcast>/episodes)
  --out-dir <dir>            Output directory (default: podcasts/<podcast>)
  --max-episodes <n>         Number of episodes to sample (default: 15)
  --max-excerpt-chars <n>    Max chars per episode excerpt (default: 8000)
  --force, -f                Re-generate even if cached
  --dry-run                  Print what would be done, write nothing
  --help, -h                 Show this help

Examples:
  # Generate profile for freakshow
  node scripts/generate-podcast-profile.js --podcast freakshow

  # UKW with more episodes
  node scripts/generate-podcast-profile.js --podcast ukw --max-episodes 20

  # Force regenerate
  node scripts/generate-podcast-profile.js --podcast lnp --force
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

function sampleEpisodesEvenly(episodes, maxEpisodes) {
  if (episodes.length <= maxEpisodes) return episodes;
  
  const last = episodes.length - 1;
  const picked = [];
  
  for (let i = 0; i < maxEpisodes; i++) {
    const idx = Math.round((i * last) / (maxEpisodes - 1));
    picked.push(episodes[idx]);
  }
  
  return picked;
}

function extractExcerpt(transcript, maxChars) {
  const lines = [];
  let totalChars = 0;
  
  // Take from beginning, middle, and end
  const third = Math.floor(transcript.length / 3);
  const sections = [
    transcript.slice(0, third),
    transcript.slice(third, 2 * third),
    transcript.slice(2 * third)
  ];
  
  for (const section of sections) {
    for (const entry of section) {
      if (totalChars >= maxChars) break;
      
      const speaker = entry.speaker || 'Unknown';
      const text = String(entry.text || '').trim();
      if (!text) continue;
      
      const line = `${speaker}: ${text}`;
      lines.push(line);
      totalChars += line.length;
      
      if (totalChars >= maxChars / 3) break; // Limit per section
    }
    if (totalChars >= maxChars) break;
  }
  
  return lines.join('\n');
}

async function callChatCompletionsOpenAICompatible(llmCfg, messages, retryCfg) {
  const { maxRetries = 3, retryDelayMs = 5000 } = retryCfg;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${llmCfg.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmCfg.apiKey}`,
        },
        body: JSON.stringify({
          model: llmCfg.model,
          messages,
          temperature: llmCfg.temperature || 0.3,
          max_tokens: llmCfg.maxTokens || 4000,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      if (attempt < maxRetries) {
        console.error(`  ⚠️  Attempt ${attempt + 1} failed: ${error.message}`);
        console.error(`  ⏳ Retrying in ${retryDelayMs}ms...`);
        await sleep(retryDelayMs);
      } else {
        throw error;
      }
    }
  }
}

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return {};
  try {
    return JSON.parse(text.substring(start, end + 1));
  } catch {
    return {};
  }
}

function podcastProfileMessages({ podcastId, episodeExcerpts, speakersSummary }) {
  return [
    {
      role: 'system',
      content:
        'Du bist ein Podcast-Analyst und Kommunikationsexperte. ' +
        'Deine Aufgabe ist es, den übergreifenden Charakter, Stil und die Dynamik eines Podcasts zu erfassen.\n\n' +
        'Analysiere die folgenden Transkript-Ausschnitte aus verschiedenen Episoden und erstelle ein Podcast-Profil.\n\n' +
        'Fokussiere dich auf:\n' +
        '• **Podcast-Charakter**: Was macht diesen Podcast einzigartig?\n' +
        '• **Gesprächsdynamik**: Wie interagieren die Sprecher miteinander?\n' +
        '• **Ton & Atmosphäre**: Formell/informell, ernst/humorvoll, kritisch/unterhaltend\n' +
        '• **Typische Themen**: Welche Themen dominieren?\n' +
        '• **Format-Eigenheiten**: Running Gags, wiederkehrende Elemente, Rituale\n' +
        '• **Zielgruppe & Ansprache**: Für wen ist der Podcast? Wie wird kommuniziert?\n' +
        '• **Besonderheiten**: Was unterscheidet diesen Podcast von anderen?\n\n' +
        'Erstelle ein JSON-Objekt mit dieser Struktur:\n' +
        '{\n' +
        '  "podcast_name": string,\n' +
        '  "character_summary": string (3-5 Sätze Fließtext),\n' +
        '  "conversation_dynamics": {\n' +
        '    "interaction_style": string[],\n' +
        '    "typical_flow": string[],\n' +
        '    "group_chemistry": string\n' +
        '  },\n' +
        '  "tone_and_atmosphere": {\n' +
        '    "primary_tone": string[],\n' +
        '    "humor_style": string,\n' +
        '    "formality_level": string,\n' +
        '    "pacing": string\n' +
        '  },\n' +
        '  "typical_themes": string[],\n' +
        '  "format_quirks": {\n' +
        '    "running_gags": string[],\n' +
        '    "recurring_elements": string[],\n' +
        '    "signature_phrases": string[]\n' +
        '  },\n' +
        '  "audience": {\n' +
        '    "target_audience": string,\n' +
        '    "communication_style": string,\n' +
        '    "assumed_knowledge": string\n' +
        '  },\n' +
        '  "unique_selling_points": string[],\n' +
        '  "discussion_guidelines": string[] (Regeln für authentische Diskussionen im Stil dieses Podcasts)\n' +
        '}'
    },
    {
      role: 'user',
      content:
        `Podcast ID: ${podcastId}\n\n` +
        `Sprecher-Zusammenfassung:\n${speakersSummary}\n\n` +
        `Episode-Ausschnitte (${episodeExcerpts.length} Episoden):\n\n` +
        episodeExcerpts.map((ex, i) => `=== Episode ${ex.episodeNumber} ===\n${ex.excerpt}\n`).join('\n')
    }
  ];
}

function renderMarkdownProfile(profile, metadata) {
  const lines = [];
  lines.push(`# Podcast Profile: ${profile.podcast_name || metadata.podcastId}`);
  lines.push('');
  
  lines.push('## Metadaten');
  lines.push('');
  lines.push(`- **Podcast ID**: ${metadata.podcastId}`);
  lines.push(`- **Episoden analysiert**: ${metadata.episodesAnalyzed}`);
  lines.push(`- **Sprecher**: ${metadata.totalSpeakers}`);
  lines.push(`- **Generiert**: ${new Date().toISOString()}`);
  lines.push('');
  
  lines.push('## Charakterzusammenfassung');
  lines.push('');
  lines.push(profile.character_summary || '_Keine Zusammenfassung generiert._');
  lines.push('');
  
  lines.push('## Gesprächsdynamik');
  lines.push('');
  
  if (profile.conversation_dynamics) {
    lines.push('### Interaktionsstil');
    lines.push('');
    for (const s of profile.conversation_dynamics.interaction_style || []) {
      lines.push(`- ${s}`);
    }
    if (!profile.conversation_dynamics.interaction_style?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Typischer Gesprächsfluss');
    lines.push('');
    for (const s of profile.conversation_dynamics.typical_flow || []) {
      lines.push(`- ${s}`);
    }
    if (!profile.conversation_dynamics.typical_flow?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Gruppen-Chemie');
    lines.push('');
    lines.push(profile.conversation_dynamics.group_chemistry || '_n/a_');
    lines.push('');
  }
  
  lines.push('## Ton & Atmosphäre');
  lines.push('');
  
  if (profile.tone_and_atmosphere) {
    lines.push('### Primärer Ton');
    lines.push('');
    for (const s of profile.tone_and_atmosphere.primary_tone || []) {
      lines.push(`- ${s}`);
    }
    if (!profile.tone_and_atmosphere.primary_tone?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Humor-Stil');
    lines.push('');
    lines.push(profile.tone_and_atmosphere.humor_style || '_n/a_');
    lines.push('');
    
    lines.push('### Formalitätslevel');
    lines.push('');
    lines.push(profile.tone_and_atmosphere.formality_level || '_n/a_');
    lines.push('');
    
    lines.push('### Pacing');
    lines.push('');
    lines.push(profile.tone_and_atmosphere.pacing || '_n/a_');
    lines.push('');
  }
  
  lines.push('## Typische Themen');
  lines.push('');
  for (const s of profile.typical_themes || []) {
    lines.push(`- ${s}`);
  }
  if (!profile.typical_themes?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('## Format-Eigenheiten');
  lines.push('');
  
  if (profile.format_quirks) {
    lines.push('### Running Gags');
    lines.push('');
    for (const s of profile.format_quirks.running_gags || []) {
      lines.push(`- "${s}"`);
    }
    if (!profile.format_quirks.running_gags?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Wiederkehrende Elemente');
    lines.push('');
    for (const s of profile.format_quirks.recurring_elements || []) {
      lines.push(`- ${s}`);
    }
    if (!profile.format_quirks.recurring_elements?.length) lines.push('- _n/a_');
    lines.push('');
    
    lines.push('### Signature Phrases');
    lines.push('');
    for (const s of profile.format_quirks.signature_phrases || []) {
      lines.push(`- "${s}"`);
    }
    if (!profile.format_quirks.signature_phrases?.length) lines.push('- _n/a_');
    lines.push('');
  }
  
  lines.push('## Zielgruppe');
  lines.push('');
  
  if (profile.audience) {
    lines.push('### Target Audience');
    lines.push('');
    lines.push(profile.audience.target_audience || '_n/a_');
    lines.push('');
    
    lines.push('### Kommunikationsstil');
    lines.push('');
    lines.push(profile.audience.communication_style || '_n/a_');
    lines.push('');
    
    lines.push('### Angenommenes Vorwissen');
    lines.push('');
    lines.push(profile.audience.assumed_knowledge || '_n/a_');
    lines.push('');
  }
  
  lines.push('## Unique Selling Points');
  lines.push('');
  for (const s of profile.unique_selling_points || []) {
    lines.push(`- ${s}`);
  }
  if (!profile.unique_selling_points?.length) lines.push('- _n/a_');
  lines.push('');
  
  lines.push('## Diskussions-Guidelines für LLM');
  lines.push('');
  lines.push('_Verwende diese Regeln, um authentische Diskussionen im Stil dieses Podcasts zu generieren:_');
  lines.push('');
  for (const s of profile.discussion_guidelines || []) {
    lines.push(`- ${s}`);
  }
  if (!profile.discussion_guidelines?.length) lines.push('- _n/a_');
  lines.push('');
  
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (args.help) {
    printHelp();
    return;
  }
  
  const settingsPath = path.join(__dirname, '..', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    console.error(`❌ settings.json not found at ${settingsPath}`);
    process.exit(1);
  }
  
  const settings = readJson(settingsPath);
  const llmCfg = {
    provider: settings.llm?.provider,
    model: settings.llm?.model,
    apiKey: settings.llm?.apiKey,
    baseURL: settings.llm?.baseURL,
    temperature: 0.3,
    maxTokens: 4000,
  };
  
  const retryCfg = {
    maxRetries: settings?.topicExtraction?.maxRetries ?? 3,
    retryDelayMs: settings?.topicExtraction?.retryDelayMs ?? 5000,
  };
  
  console.log('🎙️  Generiere Podcast-Profil\n');
  console.log(`Podcast:      ${args.podcastId}`);
  console.log(`Episodes dir: ${args.episodesDir}`);
  console.log(`Output dir:   ${args.outDir}`);
  console.log(`LLM:          ${llmCfg.provider || 'openai-compatible'} - ${llmCfg.model}`);
  console.log('');
  
  const outFile = path.join(args.outDir, 'podcast-profile.md');
  const cacheFile = path.join(args.outDir, '.podcast-profile-cache.json');
  
  const transcriptFiles = findTranscriptFiles(args.episodesDir);
  if (transcriptFiles.length === 0) {
    console.error('❌ Keine *-ts.json Dateien gefunden.');
    process.exit(1);
  }
  
  console.log(`📂 ${transcriptFiles.length} Transcript-Dateien gefunden`);
  
  const sampledEpisodes = sampleEpisodesEvenly(transcriptFiles, args.maxEpisodes);
  console.log(`📊 ${sampledEpisodes.length} Episoden für Analyse ausgewählt`);
  
  // Collect speaker info
  const allSpeakers = new Set();
  sampledEpisodes.forEach(ep => {
    try {
      const raw = readJson(ep.fullPath);
      const transcript = raw?.transcript;
      if (Array.isArray(transcript)) {
        transcript.forEach(t => {
          if (t.speaker) allSpeakers.add(t.speaker);
        });
      }
    } catch (e) {
      console.warn(`  ⚠️  Fehler beim Lesen von Episode ${ep.episodeNumber}: ${e.message}`);
    }
  });
  
  const speakersSummary = `Sprecher (${allSpeakers.size}): ${Array.from(allSpeakers).join(', ')}`;
  console.log(`👥 ${allSpeakers.size} verschiedene Sprecher gefunden`);
  
  // Check cache
  const episodesHash = sha1(sampledEpisodes.map(e => e.episodeNumber).join(','));
  
  if (!args.force && fs.existsSync(cacheFile)) {
    try {
      const cached = readJson(cacheFile);
      if (cached.episodesHash === episodesHash && cached.profile) {
        console.log('✅ Cache hit - verwende gespeichertes Profil');
        
        if (!args.dryRun) {
          const md = renderMarkdownProfile(cached.profile, {
            podcastId: args.podcastId,
            episodesAnalyzed: sampledEpisodes.length,
            totalSpeakers: allSpeakers.size,
          });
          fs.writeFileSync(outFile, md, 'utf-8');
        }
        
        console.log('\n✅ Done.');
        return;
      }
    } catch (e) {
      console.warn('  ⚠️  Cache konnte nicht gelesen werden, generiere neu...');
    }
  }
  
  // Extract excerpts from episodes
  console.log('\n📝 Extrahiere Ausschnitte aus Episoden...');
  const episodeExcerpts = [];
  
  for (const ep of sampledEpisodes) {
    try {
      const raw = readJson(ep.fullPath);
      const transcript = raw?.transcript;
      
      if (!Array.isArray(transcript) || transcript.length === 0) continue;
      
      const excerpt = extractExcerpt(transcript, args.maxExcerptChars);
      if (excerpt) {
        episodeExcerpts.push({
          episodeNumber: ep.episodeNumber,
          excerpt
        });
        console.log(`   ✓ Episode ${ep.episodeNumber}: ${excerpt.length} Zeichen`);
      }
    } catch (e) {
      console.warn(`   ⚠️  Episode ${ep.episodeNumber}: ${e.message}`);
    }
  }
  
  if (episodeExcerpts.length === 0) {
    console.error('\n❌ Keine verwertbaren Transkripte gefunden.');
    process.exit(1);
  }
  
  console.log(`\n🤖 Analysiere ${episodeExcerpts.length} Episoden mit LLM...`);
  
  const messages = podcastProfileMessages({
    podcastId: args.podcastId,
    episodeExcerpts,
    speakersSummary
  });
  
  const response = await callChatCompletionsOpenAICompatible(llmCfg, messages, retryCfg);
  const profile = extractFirstJsonObject(response);
  
  const md = renderMarkdownProfile(profile, {
    podcastId: args.podcastId,
    episodesAnalyzed: episodeExcerpts.length,
    totalSpeakers: allSpeakers.size,
  });
  
  if (args.dryRun) {
    console.log(`\n(dry-run) würde schreiben: ${outFile}`);
    console.log('\nProfil-Vorschau:');
    console.log(md.substring(0, 500) + '...');
  } else {
    fs.writeFileSync(outFile, md, 'utf-8');
    fs.writeFileSync(cacheFile, JSON.stringify({
      episodesHash,
      profile,
      generatedAt: new Date().toISOString()
    }, null, 2));
    console.log(`\n✅ Profil geschrieben: ${outFile}`);
  }
  
  console.log('\n✅ Done.');
}

main().catch((e) => {
  console.error('❌ Fatal error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
