import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const EPISODES_DIR = './episodes';

const CONCURRENT_REQUESTS = 3;
const BROWSER_RESTART_AFTER = 30;
const NAVIGATION_TIMEOUT_MS = 90_000;

function parseArgs(argv) {
  const args = {
    episode: null,
    start: null,
    end: null,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episode' && argv[i + 1]) args.episode = parseInt(argv[++i], 10);
    else if (a === '--start' && argv[i + 1]) args.start = parseInt(argv[++i], 10);
    else if (a === '--end' && argv[i + 1]) args.end = parseInt(argv[++i], 10);
    else if (a === '--force') args.force = true;
  }

  return args;
}

function parseDurationToSeconds(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // Prefer HH:MM:SS(.mmm) or MM:SS(.mmm) (sometimes without leading zeros)
  const parts = s.split(':').map(p => p.trim()).filter(Boolean);
  if (parts.length === 2 || parts.length === 3) {
    // seconds can be "SS" or "SS.mmm"
    const last = parts[parts.length - 1];
    const sec = Number.parseFloat(last);
    if (Number.isNaN(sec)) return null;
    const headNums = parts.slice(0, -1).map(p => Number.parseInt(p, 10));
    if (headNums.some(n => Number.isNaN(n))) return null;
    if (parts.length === 2) return headNums[0] * 60 + sec;
    return headNums[0] * 3600 + headNums[1] * 60 + sec;
  }

  // Fallback: German duration like "0 Stunden 2 Minuten 29 Sekunden"
  const hours = s.match(/(\d+)\s+Stunde[n]?/i);
  const minutes = s.match(/(\d+)\s+Minute[n]?/i);
  const seconds = s.match(/(\d+)\s+Sekunde[n]?/i);
  if (hours || minutes || seconds) {
    return (hours ? parseInt(hours[1], 10) : 0) * 3600
      + (minutes ? parseInt(minutes[1], 10) : 0) * 60
      + (seconds ? parseInt(seconds[1], 10) : 0);
  }

  return null;
}

function toIntSecondsFloor(seconds) {
  if (seconds === null || seconds === undefined) return 0;
  const n = typeof seconds === 'number' ? seconds : Number(seconds);
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

async function getEpisodeFiles({ episode, start, end }) {
  if (episode !== null && !Number.isNaN(episode)) {
    return [`${episode}.json`];
  }

  const files = await fs.readdir(EPISODES_DIR);
  let episodeFiles = files
    .filter(file => file.match(/^\d+\.json$/))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  if (start !== null || end !== null) {
    episodeFiles = episodeFiles.filter(file => {
      const num = parseInt(file.replace('.json', ''), 10);
      const afterStart = start === null || num >= start;
      const beforeEnd = end === null || num <= end;
      return afterStart && beforeEnd;
    });
  }

  return episodeFiles;
}

async function isChaptersProcessed(episodeNumber) {
  try {
    const outFile = path.join(EPISODES_DIR, `${episodeNumber}-chapters.json`);
    await fs.access(outFile);
    return true;
  } catch {
    return false;
  }
}

async function openChaptersTabIfPresent(page) {
  // Some pages have a chapter tab trigger; others might already show chapters.
  const triggerSelectors = [
    '#trigger-chapters',
    '[data-test="trigger-chapters"]',
    '[aria-controls="tab-chapters"]',
    'button#trigger-chapters',
    'a#trigger-chapters',
  ];

  for (const sel of triggerSelectors) {
    try {
      const handle = await page.$(sel);
      if (!handle) continue;
      await page.evaluate(el => el.click(), handle);
      await handle.dispose();
      break;
    } catch {
      // keep trying
    }
  }
}

async function extractChapters(page) {
  // Returns: [{ title: string, durationRaw: string|null }]
  return await page.evaluate(() => {
    const trim = (v) => (v ?? '').toString().replace(/\s+/g, ' ').trim();

    // Prefer the visible list entries
    const entryNodes = Array.from(
      document.querySelectorAll('#tab-chapters [data-test="tab-chapters--entry"], [data-test="tab-chapters--entry"]')
    );

    if (entryNodes.length > 0) {
      return entryNodes.map(node => {
        const titleEl = node.querySelector('.title');
        const timeEl =
          node.querySelector('time.timer') ||
          node.querySelector('time[datetime]') ||
          node.querySelector('time');

        const durationRaw = trim(timeEl?.getAttribute('datetime') || timeEl?.textContent || timeEl?.getAttribute('title') || '');
        return {
          title: trim(titleEl?.textContent || ''),
          durationRaw: durationRaw || null,
        };
      }).filter(x => x.title);
    }

    // Fallback: screenreader-only chapter list
    const srItems = Array.from(document.querySelectorAll('ol.sr-only[aria-label="Kapitel"] li'));
    if (srItems.length > 0) {
      return srItems.map(li => {
        const button = li.querySelector('button');
        const time = li.querySelector('time[title]');
        const buttonText = trim(button?.textContent || '');

        // buttonText looks like: Kapitel 2 "Begrüßung" abspielen
        const m = buttonText.match(/"([^"]+)"/);
        const title = m ? trim(m[1]) : buttonText.replace(/^Kapitel\s+\d+\s+/i, '').replace(/\s+abspielen$/i, '').trim();
        const durationRaw = trim(time?.getAttribute('title') || '');
        return { title, durationRaw: durationRaw || null };
      }).filter(x => x.title);
    }

    return [];
  });
}

async function extractPodloveEpisodeData(page) {
  // Returns: { duration: string|null, chapters: [{ start: string, title: string }] } | null
  const scriptText = await page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll('script'));
    // The inline script containing the cache often includes `"chapters":[` and `podlovePlayerCache.add(`
    const hit = scripts.find(s =>
      typeof s.textContent === 'string' &&
      s.textContent.includes('podlovePlayerCache.add(') &&
      s.textContent.includes('"chapters"')
    );
    return hit?.textContent || null;
  });

  if (!scriptText) return null;

  const m = scriptText.match(/podlovePlayerCache\.add\((\[[\s\S]*?\])\)\s*;?/);
  if (!m?.[1]) return null;

  let items;
  try {
    items = JSON.parse(m[1]);
  } catch {
    return null;
  }

  if (!Array.isArray(items)) return null;
  const episodeItem = items.find(it => it && typeof it === 'object' && it.data && Array.isArray(it.data.chapters));
  if (!episodeItem?.data) return null;

  const chapters = episodeItem.data.chapters
    .filter(ch => ch && typeof ch === 'object')
    .map(ch => ({ start: ch.start, title: ch.title }))
    .filter(ch => typeof ch.title === 'string' && ch.title.trim().length > 0 && typeof ch.start === 'string');

  return {
    duration: typeof episodeItem.data.duration === 'string' ? episodeItem.data.duration : null,
    chapters,
  };
}

async function processEpisode(page, episodeFile, { force }) {
  const episodePath = path.join(EPISODES_DIR, episodeFile);
  const episodeData = JSON.parse(await fs.readFile(episodePath, 'utf-8'));
  const episodeNumber = episodeData.number;
  const url = episodeData.url;

  if (!force && await isChaptersProcessed(episodeNumber)) {
    console.log(`Skipping episode ${episodeNumber} (chapters already scraped)`);
    return { success: true, episode: episodeNumber, skipped: true };
  }

  console.log(`Processing episode ${episodeNumber}: ${episodeData.title}`);

  try {
    // We primarily scrape the inline Podlove cache script which is part of the HTML response,
    // so waiting for "networkidle2" can hang on long-lived requests (analytics, keep-alive, etc).
    // "domcontentloaded" is both faster and more reliable across older episodes.
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    } catch (err) {
      // Fallback retry: sometimes the first navigation attempt hits a transient timeout.
      console.warn(`  ! Navigation issue for episode ${episodeNumber}, retrying once: ${err?.message || err}`);
      await page.goto(url, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    }

    // Primary strategy: Podlove Web Player embeds structured chapter start times in an inline cache script.
    // This is more reliable than trying to scrape the rendered player UI.
    try {
      await page.waitForSelector('.podlove-web-player', { timeout: 8000 });
    } catch {
      // best-effort
    }

    const podlove = await extractPodloveEpisodeData(page);

    let chapters = [];
    if (podlove?.chapters?.length) {
      const durationTotalSec = parseDurationToSeconds(podlove.duration);

      const starts = podlove.chapters
        .map(ch => ({
          title: ch.title,
          startSec: parseDurationToSeconds(ch.start),
        }))
        .filter(ch => ch.title && ch.startSec !== null)
        .sort((a, b) => a.startSec - b.startSec);

      chapters = starts.map((ch, idx) => {
        const next = starts[idx + 1];
        const positionSec = toIntSecondsFloor(ch.startSec);
        const endSec = next?.startSec ?? durationTotalSec;
        const durationSec = endSec !== null ? toIntSecondsFloor(endSec - ch.startSec) : 0;
        return {
          number: idx + 1,
          title: ch.title,
          durationSec,
          positionSec,
        };
      });
    } else {
      // Fallback strategy: try to scrape the rendered UI (may require interaction depending on site/player changes)
      await openChaptersTabIfPresent(page);
      try {
        await page.waitForSelector('[data-test="tab-chapters--entry"], ol.sr-only[aria-label="Kapitel"] li', { timeout: 8000 });
      } catch {
        // no-op
      }

      const raw = await extractChapters(page);
      let positionSec = 0;
      chapters = raw.map((c, idx) => {
        const durationSec = parseDurationToSeconds(c.durationRaw);
        const chapter = {
          number: idx + 1,
          title: c.title,
          durationSec: toIntSecondsFloor(durationSec),
          positionSec,
        };
        positionSec += toIntSecondsFloor(durationSec);
        return chapter;
      });
    }

    const outFile = path.join(EPISODES_DIR, `${episodeNumber}-chapters.json`);
    await fs.writeFile(outFile, JSON.stringify({ chapters }, null, 2), 'utf-8');
    console.log(`  ✓ Saved chapters (${chapters.length})`);

    return { success: true, episode: episodeNumber };
  } catch (error) {
    console.error(`  ✗ Error processing episode ${episodeNumber}:`, error.message);
    return { success: false, episode: episodeNumber, error: error.message };
  }
}

async function processEpisodesInBatches(browser, episodeFiles, concurrentRequests, opts) {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < episodeFiles.length; i += concurrentRequests) {
    const batch = episodeFiles.slice(i, i + concurrentRequests);
    console.log(`\nProcessing batch ${Math.floor(i / concurrentRequests) + 1}/${Math.ceil(episodeFiles.length / concurrentRequests)}`);

    try {
      const pages = await Promise.all(batch.map(() => browser.newPage()));

      const batchResults = await Promise.all(
        batch.map((file, idx) => processEpisode(pages[idx], file, opts))
      );

      await Promise.all(pages.map(p => p.close()));

      batchResults.forEach(r => {
        if (r.success) {
          if (r.skipped) results.skipped++;
          else results.success++;
        } else {
          results.failed++;
          results.errors.push({ episode: r.episode, error: r.error });
        }
      });

      if (i + concurrentRequests < episodeFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`\n✗ Batch error: ${error.message}`);
      batch.forEach(file => {
        const num = parseInt(file.replace('.json', ''), 10);
        results.failed++;
        results.errors.push({ episode: num, error: error.message });
      });
    }
  }

  return results;
}

async function scrapeChapters() {
  const args = parseArgs(process.argv.slice(2));
  const episodeFiles = await getEpisodeFiles(args);

  console.log(`Found ${episodeFiles.length} episodes to process\n`);
  if (episodeFiles.length === 0) return;

  const startTime = Date.now();
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (let chunkStart = 0; chunkStart < episodeFiles.length; chunkStart += BROWSER_RESTART_AFTER) {
    const chunk = episodeFiles.slice(chunkStart, chunkStart + BROWSER_RESTART_AFTER);
    const chunkNum = Math.floor(chunkStart / BROWSER_RESTART_AFTER) + 1;
    const totalChunks = Math.ceil(episodeFiles.length / BROWSER_RESTART_AFTER);

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Browser Session ${chunkNum}/${totalChunks} (Episodes ${chunkStart + 1}-${Math.min(chunkStart + BROWSER_RESTART_AFTER, episodeFiles.length)})`);
    console.log('='.repeat(50));

    try {
      // In sandboxed environments, writing to the real home directory can be blocked.
      // Force a writable HOME so Chromium's crashpad/user-data dirs end up inside the repo.
      const sandboxHome = path.resolve('.puppeteer-home');
      await fs.mkdir(sandboxHome, { recursive: true });
      const userDataDir = path.join(sandboxHome, 'chrome-profile');

      console.log('Launching browser...');
      const browser = await puppeteer.launch({
        headless: 'new',
        env: { ...process.env, HOME: sandboxHome },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-crash-reporter',
          '--disable-breakpad',
          '--no-first-run',
          '--no-default-browser-check',
          `--user-data-dir=${userDataDir}`,
        ],
      });

      const chunkResults = await processEpisodesInBatches(browser, chunk, CONCURRENT_REQUESTS, args);

      results.success += chunkResults.success;
      results.skipped += chunkResults.skipped;
      results.failed += chunkResults.failed;
      results.errors.push(...chunkResults.errors);

      console.log('\nClosing browser...');
      await browser.close();

      if (chunkStart + BROWSER_RESTART_AFTER < episodeFiles.length) {
        console.log('Waiting 2 seconds before next session...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`\n✗ Browser session error: ${error.message}`);
    }
  }

  const duration = Math.round((Date.now() - startTime) / 1000);
  console.log('\n' + '='.repeat(50));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(50));
  console.log(`✓ Successfully processed: ${results.success} episodes`);
  console.log(`⊘ Skipped (already done): ${results.skipped} episodes`);
  console.log(`✗ Failed: ${results.failed} episodes`);
  console.log(`⏱ Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);

  if (results.errors.length > 0) {
    console.log('\nFailed Episodes:');
    const uniqueErrors = new Map();
    results.errors.forEach(err => {
      if (!uniqueErrors.has(err.episode)) uniqueErrors.set(err.episode, err.error);
    });
    Array.from(uniqueErrors.entries()).forEach(([episode, error]) => {
      console.log(`  Episode ${episode}: ${error}`);
    });
  }
}

scrapeChapters().catch(error => {
  console.error('Error running scrape-chapters:', error);
  process.exit(1);
});


