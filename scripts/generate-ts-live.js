import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Converts <episode>-ts.json (verbose objects) into <episode>-ts-live.json
 * optimized for live playback lookups.
 *
 * Output format:
 * {
 *   v: 1,
 *   episode: 285,
 *   speakers: ["Tim Pritlove", ...],
 *   t: [22, 47, 49, ...],        // seconds (int), sorted ascending
 *   s: [0, 1, 0, ...],           // speaker index into speakers[]
 *   x: ["Hallo ...", "Einen ...", ...] // spoken text
 * }
 */

function parseArgs(argv) {
  const args = {
    projectRoot: path.join(__dirname, '..'),
    podcastId: 'freakshow',
    inDir: null,
    outDir: null,
    episode: null,
    all: false,
    pretty: false,
  };

  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--podcast') args.podcastId = a[++i] ?? 'freakshow';
    else if (k === '--in-dir') args.inDir = a[++i] ?? null;
    else if (k === '--out-dir') args.outDir = a[++i] ?? null;
    else if (k === '--episode') args.episode = a[++i] ?? null;
    else if (k === '--all') args.all = true;
    else if (k === '--pretty') args.pretty = true;
    else if (k === '--help' || k === '-h') args.help = true;
    else throw new Error(`Unknown arg: ${k}`);
  }

  return args;
}

function parseHmsToSec(timeStr) {
  if (typeof timeStr !== 'string') return null;
  const s = timeStr.trim();
  if (!s) return null;

  const parts = s.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;

  const nums = parts.map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) ? n : null;
  });
  if (nums.some((n) => n === null)) return null;

  if (nums.length === 3) {
    const [h, m, sec] = nums;
    return h * 3600 + m * 60 + sec;
  }
  if (nums.length === 2) {
    const [m, sec] = nums;
    return m * 60 + sec;
  }
  return nums[0];
}

function extractEpisodeNumberFromFilename(filename) {
  const m = filename.match(/^(\d+)-ts\.json$/);
  return m ? parseInt(m[1], 10) : null;
}

async function generateOne(inputPath, outputPath, { pretty }) {
  const raw = await fs.readFile(inputPath, 'utf8');
  const json = JSON.parse(raw);

  const rows = Array.isArray(json?.transcript) ? json.transcript : null;
  if (!rows) throw new Error(`Invalid transcript JSON (missing transcript array): ${inputPath}`);

  const speakers = [];
  const speakerIndex = new Map();

  const items = [];
  let rowIdx = 0;
  for (const r of rows) {
    const speaker = typeof r?.speaker === 'string' ? r.speaker.trim() : '';
    const text = typeof r?.text === 'string' ? r.text.trim() : '';
    const sec = parseHmsToSec(r?.time);
    if (!speaker || !text || !Number.isFinite(sec)) continue;

    let si = speakerIndex.get(speaker);
    if (si === undefined) {
      si = speakers.length;
      speakers.push(speaker);
      speakerIndex.set(speaker, si);
    }
    items.push({ sec: Math.max(0, Math.floor(sec)), si, text, rowIdx });
    rowIdx++;
  }

  // Ensure time ordering + stable for equal timestamps (preserve transcript order within same second)
  items.sort((a, b) => (a.sec - b.sec) || (a.rowIdx - b.rowIdx));

  // Merge duplicate timestamps for same speaker (rare but can happen)
  const merged = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (last && last.sec === it.sec && last.si === it.si) {
      last.text = `${last.text} ${it.text}`.trim();
    } else {
      merged.push({ sec: it.sec, si: it.si, text: it.text });
    }
  }

  const episode = (() => {
    const base = path.basename(inputPath);
    const n = extractEpisodeNumberFromFilename(base);
    return Number.isFinite(n) ? n : null;
  })();

  const out = {
    v: 1,
    ...(episode !== null ? { episode } : {}),
    speakers,
    t: merged.map((m) => m.sec),
    s: merged.map((m) => m.si),
    x: merged.map((m) => m.text),
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const jsonOut = pretty ? JSON.stringify(out, null, 2) : JSON.stringify(out);
  await fs.writeFile(outputPath, jsonOut, 'utf8');
  return { segments: merged.length, speakers: speakers.length };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(`Usage:
  node scripts/generate-ts-live.js --in-dir <dir> --out-dir <dir> [--all | --episode <n>] [--pretty]

Example:
  node scripts/generate-ts-live.js [--podcast <id>] --in-dir <dir> --out-dir <dir> --all
  node scripts/generate-ts-live.js --podcast freakshow --all
`);
    process.exit(0);
  }

  // Default to podcast episodes directory if not provided
  const defaultEpisodesDir = path.join(args.projectRoot, 'podcasts', args.podcastId, 'episodes');
  const inDir = args.inDir ?? defaultEpisodesDir;
  const outDir = args.outDir ?? inDir;

  const entries = await fs.readdir(inDir, { withFileTypes: true });
  const tsFiles = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => n.endsWith('-ts.json'));

  const wantedEpisode = args.episode ? parseInt(String(args.episode), 10) : null;

  const selected = tsFiles.filter((name) => {
    const ep = extractEpisodeNumberFromFilename(name);
    if (!Number.isFinite(ep)) return false;
    if (args.all) return true;
    if (wantedEpisode !== null) return ep === wantedEpisode;
    // default: generate all (safe, and matches typical usage)
    return true;
  });

  if (selected.length === 0) {
    console.error('No input files selected. Check --in-dir and --episode.');
    process.exit(2);
  }

  let ok = 0;
  let failed = 0;

  for (const name of selected) {
    const inputPath = path.join(inDir, name);
    const outName = name.replace(/-ts\.json$/, '-ts-live.json');
    const outputPath = path.join(outDir, outName);
    try {
      const stats = await generateOne(inputPath, outputPath, { pretty: args.pretty });
      ok++;
      console.log(`✅ ${name} -> ${outName} (${stats.segments} segments, ${stats.speakers} speakers)`);
    } catch (e) {
      failed++;
      console.error(`❌ ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (failed > 0) process.exit(1);
}

await main();


