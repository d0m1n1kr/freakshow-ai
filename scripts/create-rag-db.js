import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    inDir: path.join(__dirname, 'episodes'),
    outFile: path.join(__dirname, 'db', 'rag-embeddings.json'),
    episode: null,
    from: null,
    to: null,
    batchSize: 100,
    force: false,
    resume: true,
    noEmbeddings: false,
    requestDelayMs: null,
  };

  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === '--in-dir') args.inDir = rest.shift();
    else if (a === '--out') args.outFile = rest.shift();
    else if (a === '--episode') args.episode = parseInt(rest.shift(), 10);
    else if (a === '--from') args.from = parseInt(rest.shift(), 10);
    else if (a === '--to') args.to = parseInt(rest.shift(), 10);
    else if (a === '--batch-size') args.batchSize = Math.max(1, parseInt(rest.shift(), 10));
    else if (a === '--force') args.force = true;
    else if (a === '--no-resume') args.resume = false;
    else if (a === '--no-embeddings') args.noEmbeddings = true;
    else if (a === '--request-delay-ms') args.requestDelayMs = Math.max(0, parseInt(rest.shift(), 10));
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${a}`);
  }
  return args;
}

function usage() {
  return (
    'Usage:\n' +
    '  node scripts/create-rag-db.js --episode <n> [--out <file>] [--no-embeddings]\n' +
    '  node scripts/create-rag-db.js --from <n> --to <n> [--out <file>] [--batch-size <n>]\n' +
    '  node scripts/create-rag-db.js --in-dir <dir> [--out <file>] [--force] [--no-resume]\n' +
    '\n' +
    'Options:\n' +
    '  --in-dir <dir>           Directory with *-extended-topics.json (default: ./episodes)\n' +
    '  --out <file>             Output JSON file (default: ./db/rag-embeddings.json)\n' +
    '  --episode <n>            Only index one episode\n' +
    '  --from <n> --to <n>      Index a range of episodes\n' +
    '  --batch-size <n>         Embedding API batch size (default: 100)\n' +
    '  --force                  Rebuild from scratch (ignore existing output)\n' +
    '  --no-resume              Don\'t reuse embeddings from existing output\n' +
    '  --no-embeddings           Build DB without calling embedding API (embeddings = null)\n' +
    '  --request-delay-ms <n>   Wait between embedding batches (default: 0 unless set)\n'
  );
}

function tryReadJson(p) {
  try {
    if (!fs.existsSync(p)) return { ok: false, value: null, error: null };
    return { ok: true, value: JSON.parse(fs.readFileSync(p, 'utf-8')), error: null };
  } catch (e) {
    return { ok: false, value: null, error: e };
  }
}

function loadSettings({ allowMissing } = { allowMissing: false }) {
  // Prefer settings.json, but in some environments it may be blocked (ignored/secret file).
  const settingsPath = path.join(__dirname, 'settings.json');
  const fromSettings = tryReadJson(settingsPath);

  if (fromSettings.ok) return { settings: fromSettings.value, source: 'settings.json' };

  // If settings.json is missing or unreadable, allow env-based config (and optionally fall back to settings.example.json)
  const examplePath = path.join(__dirname, 'settings.example.json');
  const fromExample = tryReadJson(examplePath);

  const envLLM = {
    provider: process.env.LLM_PROVIDER,
    model: process.env.LLM_MODEL,
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL,
    temperature: process.env.LLM_TEMPERATURE != null ? parseFloat(process.env.LLM_TEMPERATURE) : undefined,
    maxTokens: process.env.LLM_MAX_TOKENS != null ? parseInt(process.env.LLM_MAX_TOKENS, 10) : undefined,
  };

  const envTopic = {
    requestDelayMs: process.env.TOPIC_REQUEST_DELAY_MS != null ? parseInt(process.env.TOPIC_REQUEST_DELAY_MS, 10) : undefined,
    maxRetries: process.env.TOPIC_MAX_RETRIES != null ? parseInt(process.env.TOPIC_MAX_RETRIES, 10) : undefined,
    retryDelayMs: process.env.TOPIC_RETRY_DELAY_MS != null ? parseInt(process.env.TOPIC_RETRY_DELAY_MS, 10) : undefined,
  };

  const envCluster = {
    embeddingModel: process.env.EMBEDDING_MODEL,
    embeddingBatchSize: process.env.EMBEDDING_BATCH_SIZE != null ? parseInt(process.env.EMBEDDING_BATCH_SIZE, 10) : undefined,
  };

  const base = fromExample.ok ? fromExample.value : { llm: {}, topicExtraction: {}, topicClustering: {} };

  const merged = {
    ...base,
    llm: {
      ...(base.llm || {}),
      ...Object.fromEntries(Object.entries(envLLM).filter(([, v]) => v !== undefined && v !== '')),
    },
    topicExtraction: {
      ...(base.topicExtraction || {}),
      ...Object.fromEntries(Object.entries(envTopic).filter(([, v]) => v !== undefined && v !== '')),
    },
    topicClustering: {
      ...(base.topicClustering || {}),
      ...Object.fromEntries(Object.entries(envCluster).filter(([, v]) => v !== undefined && v !== '')),
    },
  };

  const hasUsableSettings =
    typeof merged?.llm?.baseURL === 'string' &&
    merged.llm.baseURL.trim() &&
    typeof merged?.llm?.apiKey === 'string' &&
    merged.llm.apiKey.trim() &&
    merged.llm.apiKey !== 'YOUR_API_KEY_HERE';

  if (!allowMissing && !hasUsableSettings) {
    const reason = fromSettings.error ? `\n(Reason: ${String(fromSettings.error?.message || fromSettings.error)})\n` : '\n';
    throw new Error(
      'Embedding config not found.\n' +
        reason +
        'Provide one of:\n' +
        '- settings.json (copy settings.example.json → settings.json)\n' +
        '- or env vars: LLM_API_KEY, LLM_BASE_URL (optional: EMBEDDING_MODEL)\n'
    );
  }

  return { settings: merged, source: fromExample.ok ? 'settings.example.json+env' : 'env' };
}

async function createEmbeddingsOpenAICompatible({ baseURL, apiKey, embeddingModel, texts, retryCfg }) {
  const { maxRetries, retryDelayMs } = retryCfg;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${baseURL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: embeddingModel,
          input: texts,
        }),
      });

      if (response.status === 429 && attempt < maxRetries) {
        const waitTime = retryDelayMs * Math.pow(2, attempt);
        console.log(`  ⏳ Rate limit, warte ${Math.round(waitTime / 1000)}s... (${attempt + 1}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API Fehler: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const arr = Array.isArray(data?.data) ? data.data : [];
      const embeddings = arr.map(d => d.embedding);
      if (embeddings.length !== texts.length) {
        throw new Error(`Embedding API returned ${embeddings.length} vectors for ${texts.length} inputs`);
      }
      return embeddings;
    } catch (e) {
      const msg = String(e?.message || e);
      const isNetwork = msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT');
      if (isNetwork && attempt < maxRetries) {
        const waitTime = retryDelayMs * Math.pow(2, attempt);
        console.log(`  ⏳ Netzwerkfehler, warte ${Math.round(waitTime / 1000)}s... (${attempt + 1}/${maxRetries})`);
        await sleep(waitTime);
        continue;
      }
      throw e;
    }
  }

  throw new Error('Unreachable: retry loop ended unexpectedly');
}

function findExtendedTopicsFiles(inDir) {
  const files = fs.readdirSync(inDir);
  return files
    .filter(f => /^\d+-extended-topics\.json$/.test(f))
    .map(f => ({
      file: f,
      episodeNumber: parseInt(f.match(/^(\d+)/)[1], 10),
      path: path.join(inDir, f),
    }))
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

function normalizeKeyPart(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function secondsToHms(sec) {
  if (!Number.isFinite(sec) || sec < 0) return null;
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

function pickTimeBounds(topic) {
  const positionSec = Number.isFinite(topic?.positionSec) ? topic.positionSec : (topic?.positionSec != null ? parseInt(topic.positionSec, 10) : null);
  const durationSec = Number.isFinite(topic?.durationSec) ? topic.durationSec : (topic?.durationSec != null ? parseInt(topic.durationSec, 10) : null);

  if (Number.isFinite(positionSec) && Number.isFinite(durationSec) && durationSec >= 0) {
    return { startSec: positionSec, endSec: positionSec + durationSec };
  }

  // Fallback: extended-topics uses a padded time window for summary generation.
  const sm = topic?.summaryMeta;
  const smStart = Number.isFinite(sm?.startSec) ? sm.startSec : null;
  const smEnd = Number.isFinite(sm?.endSec) ? sm.endSec : null;
  if (Number.isFinite(smStart) && Number.isFinite(smEnd) && smEnd >= smStart) {
    return { startSec: smStart, endSec: smEnd };
  }

  return { startSec: null, endSec: null };
}

function buildChunkText({ episodeNumber, episodeTitle, t, startSec, endSec }) {
  const topic = typeof t?.topic === 'string' ? t.topic.trim() : '';
  const coarse = typeof t?.subject?.coarse === 'string' ? t.subject.coarse.trim() : '';
  const fine = typeof t?.subject?.fine === 'string' ? t.subject.fine.trim() : '';
  const subjectLine = coarse || fine ? `Subject: ${coarse}${coarse && fine ? ' / ' : ''}${fine}` : '';
  const summary = typeof t?.summary === 'string' ? t.summary.trim() : '';
  const timeLine =
    Number.isFinite(startSec) && Number.isFinite(endSec)
      ? `Time: ${secondsToHms(startSec) || String(startSec)} - ${secondsToHms(endSec) || String(endSec)}`
      : '';

  // Compact but embedding-friendly.
  return [
    `Episode: ${episodeNumber}${episodeTitle ? ` - ${episodeTitle}` : ''}`,
    topic ? `Topic: ${topic}` : '',
    subjectLine,
    timeLine,
    summary ? `Summary: ${summary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function loadExistingDb(outFile) {
  if (!fs.existsSync(outFile)) return null;
  const parsed = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed.items)) return null;
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const inDir = path.resolve(args.inDir);
  const outFile = path.resolve(args.outFile);

  const { settings, source: settingsSource } = loadSettings({ allowMissing: args.noEmbeddings });
  const llmCfg = settings.llm || {};

  const embeddingModel = settings.topicClustering?.embeddingModel || 'text-embedding-3-small';
  const retryCfg = {
    maxRetries: settings.topicExtraction?.maxRetries ?? 3,
    retryDelayMs: settings.topicExtraction?.retryDelayMs ?? 5000,
  };
  const requestDelayMs =
    args.requestDelayMs != null ? args.requestDelayMs : (settings.topicExtraction?.requestDelayMs ?? 0);

  let files = findExtendedTopicsFiles(inDir);
  if (Number.isFinite(args.episode)) {
    files = files.filter(f => f.episodeNumber === args.episode);
    if (files.length === 0) throw new Error(`No extended topics file found for episode ${args.episode} in ${inDir}`);
  } else if (Number.isFinite(args.from) || Number.isFinite(args.to)) {
    const from = Number.isFinite(args.from) ? args.from : -Infinity;
    const to = Number.isFinite(args.to) ? args.to : Infinity;
    files = files.filter(f => f.episodeNumber >= from && f.episodeNumber <= to);
  }

  if (files.length === 0) throw new Error(`No *-extended-topics.json files found in ${inDir}`);

  const schemaVersion = 1;

  let existing = null;
  let existingByKey = new Map();

  if (!args.force && args.resume) {
    existing = loadExistingDb(outFile);
    if (existing?.embeddingModel === embeddingModel && Array.isArray(existing?.items)) {
      for (const it of existing.items) {
        if (typeof it?.key === 'string' && it.key) existingByKey.set(it.key, it);
      }
    } else {
      existing = null;
    }
  }

  console.log('📚 Build RAG embeddings DB from extended topics');
  console.log(`In:           ${inDir}`);
  console.log(`Out:          ${outFile}`);
  console.log(`Episodes:     ${files.length}`);
  console.log(`Embeddings:   ${args.noEmbeddings ? 'disabled (--no-embeddings)' : `${embeddingModel}`}`);
  console.log(`Settings:     ${settingsSource}`);
  if (!args.noEmbeddings) console.log(`Base URL:     ${llmCfg.baseURL}`);
  console.log(`Resume:       ${args.force ? 'no (--force)' : args.resume ? 'yes' : 'no (--no-resume)'}`);
  console.log('');

  const items = [];
  const skippedNoTime = [];
  let reused = 0;

  for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f.path, 'utf-8'));
    const episodeNumber = data?.episodeNumber ?? f.episodeNumber;
    const episodeTitle = typeof data?.title === 'string' ? data.title.trim() : '';
    const topics = Array.isArray(data?.topics) ? data.topics : [];

    for (let i = 0; i < topics.length; i++) {
      const t = topics[i];
      const { startSec, endSec } = pickTimeBounds(t);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
        skippedNoTime.push({ episodeNumber, topic: t?.topic ?? null });
        continue;
      }

      const topicName = typeof t?.topic === 'string' ? t.topic.trim() : '';
      const key = `${episodeNumber}:${Math.floor(startSec)}:${Math.floor(endSec)}:${normalizeKeyPart(topicName)}`;

      const chunkText = buildChunkText({ episodeNumber, episodeTitle, t, startSec, endSec });
      const subject = t?.subject && typeof t.subject === 'object' ? t.subject : null;

      const baseItem = {
        key,
        episodeNumber,
        episodeTitle,
        topic: topicName,
        subject: {
          coarse: typeof subject?.coarse === 'string' ? subject.coarse : null,
          fine: typeof subject?.fine === 'string' ? subject.fine : null,
        },
        startSec,
        endSec,
        startHms: secondsToHms(startSec),
        endHms: secondsToHms(endSec),
        durationSec: Math.max(0, endSec - startSec),
        summary: typeof t?.summary === 'string' ? t.summary : '',
        source: {
          file: path.basename(f.path),
          topicIndex: i,
          summaryMeta: t?.summaryMeta ?? null,
        },
        text: chunkText,
        embedding: null,
      };

      const prev = existingByKey.get(key);
      if (!args.noEmbeddings && prev && Array.isArray(prev?.embedding) && prev.embedding.length > 0) {
        items.push({ ...baseItem, embedding: prev.embedding });
        reused++;
      } else {
        items.push(baseItem);
      }
    }
  }

  const needEmbeddingIdx = [];
  if (!args.noEmbeddings) {
    for (let i = 0; i < items.length; i++) {
      if (!Array.isArray(items[i].embedding)) needEmbeddingIdx.push(i);
    }
  }

  console.log(`Items:        ${items.length}`);
  if (skippedNoTime.length) console.log(`Skipped:      ${skippedNoTime.length} (missing timestamps)`);
  if (!args.noEmbeddings) {
    console.log(`Reused:       ${reused}`);
    console.log(`To embed:     ${needEmbeddingIdx.length}`);
  }
  console.log('');

  if (!args.noEmbeddings && needEmbeddingIdx.length > 0) {
    if (!llmCfg?.baseURL || !llmCfg?.apiKey) {
      throw new Error('Missing llm.baseURL or llm.apiKey (needed for /embeddings).');
    }

    for (let i = 0; i < needEmbeddingIdx.length; i += args.batchSize) {
      const batchIdx = needEmbeddingIdx.slice(i, i + args.batchSize);
      const texts = batchIdx.map(idx => items[idx].text);

      const batchNum = Math.floor(i / args.batchSize) + 1;
      const totalBatches = Math.ceil(needEmbeddingIdx.length / args.batchSize);
      console.log(`🧠 Embeddings batch ${batchNum}/${totalBatches} (${texts.length} items)...`);

      const vectors = await createEmbeddingsOpenAICompatible({
        baseURL: llmCfg.baseURL,
        apiKey: llmCfg.apiKey,
        embeddingModel,
        texts,
        retryCfg,
      });

      for (let j = 0; j < batchIdx.length; j++) {
        items[batchIdx[j]].embedding = vectors[j];
      }

      if (requestDelayMs > 0 && i + args.batchSize < needEmbeddingIdx.length) {
        await sleep(requestDelayMs);
      }
    }
  }

  const embeddingDimensions = Array.isArray(items?.[0]?.embedding) ? items[0].embedding.length : 0;

  const db = {
    schemaVersion,
    createdAt: existing?.createdAt && !args.force ? existing.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    embeddingModel: args.noEmbeddings ? null : embeddingModel,
    embeddingDimensions,
    source: {
      type: 'extended-topics',
      inDir,
      episodeCount: files.length,
    },
    items: items.map((it, idx) => ({ id: idx, ...it })),
    stats: {
      totalItems: items.length,
      skippedNoTime: skippedNoTime.length,
      reusedEmbeddings: args.noEmbeddings ? 0 : reused,
    },
  };

  fs.writeFileSync(outFile, JSON.stringify(db, null, 2) + '\n', 'utf-8');
  const fileSizeMB = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Wrote ${outFile} (${fileSizeMB} MB)`);
}

main().catch(err => {
  console.error('\n❌', err?.stack || err?.message || err);
  process.exit(1);
});


