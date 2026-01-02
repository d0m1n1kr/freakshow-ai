import fs from 'fs';
import path from 'path';

const DEFAULT_FEED_URL = 'https://feeds.metaebene.me/freakshow/mp3';
const DEFAULT_PODCAST = 'freakshow';
const PROJECT_ROOT = process.cwd();

function tryReadJson(p) {
  try {
    if (!fs.existsSync(p)) return { ok: false, value: null, error: null };
    return { ok: true, value: JSON.parse(fs.readFileSync(p, 'utf-8')), error: null };
  } catch (e) {
    return { ok: false, value: null, error: e };
  }
}

function loadSettings() {
  const settingsPath = path.join(PROJECT_ROOT, 'settings.json');
  const fromSettings = tryReadJson(settingsPath);
  if (fromSettings.ok) return { settings: fromSettings.value, source: 'settings.json' };

  const examplePath = path.join(PROJECT_ROOT, 'settings.example.json');
  const fromExample = tryReadJson(examplePath);
  if (fromExample.ok) return { settings: fromExample.value, source: 'settings.example.json' };

  return { settings: null, source: null };
}

function getFeedUrlForPodcast(podcastId) {
  const { settings } = loadSettings();
  const podcast = settings?.podcasts?.find((p) => p?.id === podcastId);
  return podcast?.feedUrl || null;
}

function parseArgs(argv) {
  let podcast = DEFAULT_PODCAST;
  const args = {
    feed: null, // default resolved after parsing (from settings.json podcasts[].feedUrl)
    output: null, // Will be set based on podcast if not provided
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === '--feed' || a === '-f') && argv[i + 1]) args.feed = argv[++i];
    else if ((a === '--output' || a === '-o') && argv[i + 1]) args.output = argv[++i];
    else if (a === '--podcast' && argv[i + 1]) podcast = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node scripts/generate-episodes-mp3.js [--feed URL] [--podcast ID] [--output PATH]');
      console.log('');
      console.log('Default feed:   from settings.json podcasts[].feedUrl (fallback: DEFAULT_FEED_URL)');
      console.log(`Default podcast: ${DEFAULT_PODCAST}`);
      console.log(`Default output: frontend/public/podcasts/{podcast}/episodes.json`);
      process.exit(0);
    }
  }

  // Resolve default feed from podcast settings unless explicitly provided.
  if (!args.feed) {
    args.feed = getFeedUrlForPodcast(podcast) || DEFAULT_FEED_URL;
  }

  // Set default output based on podcast if not provided
  if (!args.output) {
    args.output = path.join('frontend', 'public', 'podcasts', podcast, 'episodes.json');
  }

  return args;
}

async function fetchText(url) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  const res = await fetch(url, {
    headers: { 'user-agent': 'freakshow-scraper/episodes-mp3 (node)' },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function loadInputText(feedArg) {
  // If it's an http(s) URL: fetch; otherwise treat as local file path.
  if (/^https?:\/\//i.test(feedArg)) {
    return fetchText(feedArg);
  }
  const p = path.isAbsolute(feedArg) ? feedArg : path.join(process.cwd(), feedArg);
  return Promise.resolve(fs.readFileSync(p, 'utf-8'));
}

function firstMatch(text, re) {
  const m = text.match(re);
  return m?.[1] ?? null;
}

function parseEpisodeDurationToSeconds(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const parts = s.split(':').map(p => p.trim()).filter(Boolean);
  if (parts.length === 3) {
    const [hh, mm, ss] = parts.map(n => parseInt(n, 10));
    if ([hh, mm, ss].some(Number.isNaN)) return null;
    return hh * 3600 + mm * 60 + ss;
  }
  if (parts.length === 2) {
    const [mm, ss] = parts.map(n => parseInt(n, 10));
    if ([mm, ss].some(Number.isNaN)) return null;
    return mm * 60 + ss;
  }
  return null;
}

function parseRssEpisodes(xml) {
  // Very small purpose-built parser: split into <item> blocks and extract key fields.
  const items = xml.split(/<item\b[^>]*>/i).slice(1).map(chunk => chunk.split(/<\/item>/i)[0]);

  const episodes = [];

  for (const item of items) {
    const title = firstMatch(item, /<title>([\s\S]*?)<\/title>/i);
    const pageUrl = firstMatch(item, /<link>([\s\S]*?)<\/link>/i);
    const pubDate = firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i);
    const episodeStr = firstMatch(item, /<itunes:episode>(\d+)<\/itunes:episode>/i);
    const durationRaw = firstMatch(item, /<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
    const enclosureUrl = firstMatch(item, /<enclosure\b[^>]*\burl="([^"]+)"/i);

    const episodeNumber = episodeStr ? parseInt(episodeStr, 10) : null;
    if (!Number.isFinite(episodeNumber)) continue;
    if (!enclosureUrl) continue;

    episodes.push({
      number: episodeNumber,
      title: title ? title.trim() : null,
      pageUrl: pageUrl ? pageUrl.trim() : null,
      pubDate: pubDate ? pubDate.trim() : null,
      duration: durationRaw ? durationRaw.trim() : null,
      durationSec: parseEpisodeDurationToSeconds(durationRaw),
      mp3Url: enclosureUrl.trim(),
    });
  }

  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log('=== Episodes MP3 URL Generator ===');
  console.log(`Feed:   ${args.feed}`);
  console.log(`Output: ${args.output}`);
  console.log('');

  const xml = await loadInputText(args.feed);
  const episodes = parseRssEpisodes(xml);

  // Also build a direct lookup map
  const byNumber = {};
  for (const ep of episodes) {
    byNumber[String(ep.number)] = {
      mp3Url: ep.mp3Url,
      pageUrl: ep.pageUrl,
      title: ep.title,
      pubDate: ep.pubDate,
      duration: ep.duration,
      durationSec: ep.durationSec,
    };
  }

  const out = {
    generatedAt: new Date().toISOString(),
    feed: args.feed,
    count: episodes.length,
    episodes,
    byNumber,
  };

  ensureDirForFile(args.output);
  fs.writeFileSync(args.output, JSON.stringify(out, null, 2), 'utf-8');

  console.log(`✓ Wrote ${episodes.length} episodes to ${args.output}`);
}

main().catch(err => {
  console.error('Error:', err?.stack || err);
  process.exit(1);
});


