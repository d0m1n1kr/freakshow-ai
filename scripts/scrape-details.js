import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Parse podcast argument FIRST (before other args)
const podcastIndex = process.argv.indexOf('--podcast');
const PODCAST_ID = podcastIndex !== -1 && process.argv[podcastIndex + 1] ? process.argv[podcastIndex + 1] : 'freakshow';

function parseArgs(argv) {
  const args = {
    force: false,
    start: null,
    end: null,
    timeoutMs: 60000,
    retries: 2,
    all: false,
  };
  // Skip 'node' and script name, and also skip --podcast and its value
  const a = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--podcast') {
      i++; // Skip the podcast ID value
      continue;
    }
    a.push(argv[i]);
  }
  
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--force' || k === '-f') args.force = true;
    else if (k === '--all') args.all = true;
    else if (k === '--start') args.start = a[++i] ?? null;
    else if (k === '--end') args.end = a[++i] ?? null;
    else if (k === '--timeout-ms') args.timeoutMs = a[++i] ?? null;
    else if (k === '--retries') args.retries = a[++i] ?? null;
    else if (k === '--help' || k === '-h') args.help = true;
  }
  args.timeoutMs = Number.isFinite(parseInt(String(args.timeoutMs), 10)) ? parseInt(String(args.timeoutMs), 10) : 60000;
  args.retries = Number.isFinite(parseInt(String(args.retries), 10)) ? parseInt(String(args.retries), 10) : 2;
  return args;
}

const ARGS = parseArgs(process.argv);
const START_EPISODE = ARGS.start !== null ? parseInt(String(ARGS.start), 10) : null;
const END_EPISODE = ARGS.end !== null ? parseInt(String(ARGS.end), 10) : null;

const PROJECT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EPISODES_DIR = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');
const CONCURRENT_REQUESTS = 3; // Reduced for stability
const BROWSER_RESTART_AFTER = 30; // Restart browser after N episodes

// Read all episode JSON files
async function getEpisodeFiles() {
  const files = await fs.readdir(EPISODES_DIR);
  let episodeFiles = files
    .filter(file => file.match(/^\d+\.json$/))
    .sort((a, b) => {
      const numA = parseInt(a.replace('.json', ''));
      const numB = parseInt(b.replace('.json', ''));
      return numA - numB;
    });
  
  // Filter by episode range if specified
  if (START_EPISODE !== null || END_EPISODE !== null) {
    episodeFiles = episodeFiles.filter(file => {
      const num = parseInt(file.replace('.json', ''));
      const afterStart = START_EPISODE === null || num >= START_EPISODE;
      const beforeEnd = END_EPISODE === null || num <= END_EPISODE;
      return afterStart && beforeEnd;
    });
  }
  
  return episodeFiles;
}

// Check if episode has already been processed
async function isEpisodeProcessed(episodeNumber) {
  try {
    const tsFile = path.join(EPISODES_DIR, `${episodeNumber}-ts.json`);
    const snFile = path.join(EPISODES_DIR, `${episodeNumber}-sn.json`);
    const textFile = path.join(EPISODES_DIR, `${episodeNumber}-text.html`);
    
    // Check if at least one file exists
    const checks = await Promise.all([
      fs.access(tsFile).then(() => true).catch(() => false),
      fs.access(snFile).then(() => true).catch(() => false),
      fs.access(textFile).then(() => true).catch(() => false)
    ]);
    
    return checks.some(exists => exists);
  } catch (error) {
    return false;
  }
}

// Extract transcript from page
async function extractTranscript(page) {
  return await page.evaluate(() => {
    const transcriptItems = [];
    const groups = document.querySelectorAll('.ts-group');
    
    groups.forEach(group => {
      try {
        const speakerEl = group.querySelector('.ts-speaker');
        if (!speakerEl) return;
        
        // Extract speaker name (without the time)
        const speakerText = speakerEl.childNodes[0]?.textContent?.trim() || '';
        
        // Extract time
        const timeEl = speakerEl.querySelector('.ts-time');
        const time = timeEl ? timeEl.textContent.trim() : '';
        
        // Extract text (ALL lines within this ts-group)
        // The page often splits a single speaker segment into multiple `.ts-line` elements.
        // Using `querySelector` would only capture the first line.
        const lineEls = group.querySelectorAll('.ts-content .ts-line');
        let text = Array.from(lineEls)
          .map(el => (el?.textContent || '').trim())
          .filter(Boolean)
          .join('\n');
        // Fallback: some pages might not use `.ts-line` but still have text in `.ts-content`.
        if (!text) {
          const contentEl = group.querySelector('.ts-content');
          text = contentEl ? (contentEl.textContent || '').trim() : '';
        }
        
        if (speakerText && text) {
          transcriptItems.push({
            speaker: speakerText,
            time: time,
            text: text
          });
        }
      } catch (error) {
        console.error('Error extracting transcript item:', error);
      }
    });
    
    return transcriptItems.length > 0 ? transcriptItems : null;
  });
}

// Extract shownotes from page
async function extractShownotes(page) {
  return await page.evaluate(() => {
    const shownotes = [];
    const entries = document.querySelectorAll('.psn-entry');
    
    entries.forEach(entry => {
      try {
        // Extract icon (type class)
        const iconEl = entry.querySelector('[class*="psn-type-"]');
        let icon = '';
        if (iconEl) {
          const classes = iconEl.className.split(' ');
          const typeClass = classes.find(c => c.startsWith('psn-type-'));
          icon = typeClass ? typeClass.replace('psn-type-', '') : '';
        }
        
        // Extract title
        const titleEl = entry.querySelector('.psn-title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        
        // Extract link and linkText
        const linkEl = entry.querySelector('.psn-link a');
        const link = linkEl ? linkEl.href : '';
        const linkText = linkEl ? linkEl.textContent.trim() : '';
        
        shownotes.push({
          icon: icon,
          title: title,
          link: link,
          linkText: linkText
        });
      } catch (error) {
        console.error('Error extracting shownote item:', error);
      }
    });
    
    return shownotes.length > 0 ? shownotes : null;
  });
}

// Extract second paragraph from entry-content
async function extractSecondParagraph(page) {
  return await page.evaluate(() => {
    const entryContent = document.querySelector('.entry-content');
    if (!entryContent) return null;
    
    const paragraphs = entryContent.querySelectorAll('p');
    if (paragraphs.length >= 2) {
      return paragraphs[1].innerHTML;
    }
    
    return null;
  });
}

// Process a single episode
async function processEpisode(page, episodeFile) {
  const episodePath = path.join(EPISODES_DIR, episodeFile);
  const episodeData = JSON.parse(await fs.readFile(episodePath, 'utf-8'));
  const episodeNumber = episodeData.number;
  const url = episodeData.url;
  
  // Check if already processed
  if (!ARGS.force && await isEpisodeProcessed(episodeNumber)) {
    console.log(`Skipping episode ${episodeNumber} (already processed)`);
    return { success: true, episode: episodeNumber, skipped: true };
  }
  
  console.log(`Processing episode ${episodeNumber}: ${episodeData.title}`);
  
  try {
    // Some pages keep long-polling / analytics requests open, which can prevent `networkidle2`
    // from ever being reached. Prefer DOM readiness and then wait briefly for expected content.
    page.setDefaultNavigationTimeout(ARGS.timeoutMs);
    page.setDefaultTimeout(ARGS.timeoutMs);

    let lastNavErr = null;
    const attempts = Math.max(1, ARGS.retries + 1);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: ARGS.timeoutMs,
        });
        // Best-effort: wait for either transcript groups or shownotes or main content.
        // If none appear quickly, proceed anyway; extraction functions handle "not found".
        await Promise.race([
          page.waitForSelector('.ts-group', { timeout: Math.min(15000, ARGS.timeoutMs) }),
          page.waitForSelector('.psn-entry', { timeout: Math.min(15000, ARGS.timeoutMs) }),
          page.waitForSelector('.entry-content', { timeout: Math.min(15000, ARGS.timeoutMs) }),
        ]).catch(() => {});
        lastNavErr = null;
        break;
      } catch (e) {
        lastNavErr = e;
        if (attempt < attempts) {
          console.warn(`  ! Navigation attempt ${attempt}/${attempts} failed for episode ${episodeNumber}: ${e?.message || e}`);
          // Short backoff before retry
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
      }
    }
    if (lastNavErr) throw lastNavErr;
    
    // Extract transcript
    const transcript = await extractTranscript(page);
    if (transcript) {
      const transcriptFile = path.join(EPISODES_DIR, `${episodeNumber}-ts.json`);
      await fs.writeFile(
        transcriptFile, 
        JSON.stringify({ transcript }, null, 2), 
        'utf-8'
      );
      console.log(`  ✓ Saved transcript (${transcript.length} entries)`);
    } else {
      console.log(`  - No transcript found`);
    }
    
    // Extract shownotes
    const shownotes = await extractShownotes(page);
    if (shownotes) {
      const shownotesFile = path.join(EPISODES_DIR, `${episodeNumber}-sn.json`);
      await fs.writeFile(
        shownotesFile, 
        JSON.stringify({ shownotes }, null, 2), 
        'utf-8'
      );
      console.log(`  ✓ Saved shownotes (${shownotes.length} entries)`);
    } else {
      console.log(`  - No shownotes found`);
    }
    
    // Extract second paragraph
    const secondParagraph = await extractSecondParagraph(page);
    if (secondParagraph) {
      const textFile = path.join(EPISODES_DIR, `${episodeNumber}-text.html`);
      await fs.writeFile(textFile, secondParagraph, 'utf-8');
      console.log(`  ✓ Saved text content`);
    } else {
      console.log(`  - No text content found`);
    }
    
    return { success: true, episode: episodeNumber };
  } catch (error) {
    console.error(`  ✗ Error processing episode ${episodeNumber}:`, error.message);
    return { success: false, episode: episodeNumber, error: error.message };
  }
}

// Process episodes in batches with concurrent requests
async function processEpisodesInBatches(browser, episodeFiles, concurrentRequests) {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };
  
  // Process in batches
  for (let i = 0; i < episodeFiles.length; i += concurrentRequests) {
    const batch = episodeFiles.slice(i, i + concurrentRequests);
    
    console.log(`\nProcessing batch ${Math.floor(i / concurrentRequests) + 1}/${Math.ceil(episodeFiles.length / concurrentRequests)}`);
    
    try {
      // Create pages for concurrent processing
      const pages = await Promise.all(
        batch.map(() => browser.newPage())
      );
      
      // Process episodes concurrently
      const batchResults = await Promise.all(
        batch.map((file, idx) => processEpisode(pages[idx], file))
      );
      
      // Close pages
      await Promise.all(pages.map(p => p.close()));
      
      // Update results
      batchResults.forEach(result => {
        if (result.success) {
          if (result.skipped) {
            results.skipped++;
          } else {
            results.success++;
          }
        } else {
          results.failed++;
          results.errors.push({ episode: result.episode, error: result.error });
        }
      });
      
      // Small delay between batches
      if (i + concurrentRequests < episodeFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`\n✗ Batch error: ${error.message}`);
      // Mark all episodes in this batch as failed
      batch.forEach(file => {
        const num = parseInt(file.replace('.json', ''));
        results.failed++;
        results.errors.push({ episode: num, error: error.message });
      });
    }
  }
  
  return results;
}

async function scrapeEpisodeDetails() {
  if (ARGS.help) {
    console.log(`Usage:
  node scripts/scrape-details.js [--force] [--start <n>] [--end <n>] [--timeout-ms <ms>] [--retries <n>]

Options:
  --force, -f   Overwrite existing output files (do not skip episodes)
  --start <n>   Only process episodes with number >= n
  --end <n>     Only process episodes with number <= n
  --timeout-ms <ms>  Navigation + selector timeout per episode (default: 60000)
  --retries <n>      Number of retries after a failed navigation (default: 2)
`);
    return;
  }

  console.log(`Processing podcast: ${PODCAST_ID}`);
  console.log(`Episodes directory: ${EPISODES_DIR}`);
  console.log('Reading episode files...');
  const episodeFiles = await getEpisodeFiles();
  
  if (START_EPISODE !== null || END_EPISODE !== null) {
    console.log(`Processing episodes ${START_EPISODE || 'start'} to ${END_EPISODE || 'end'}`);
  }
  console.log(`Found ${episodeFiles.length} episodes to process\n`);
  
  if (episodeFiles.length === 0) {
    console.log('No episodes to process!');
    return;
  }
  
  const startTime = Date.now();
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };
  
  // Process episodes in chunks, restarting browser for each chunk
  for (let chunkStart = 0; chunkStart < episodeFiles.length; chunkStart += BROWSER_RESTART_AFTER) {
    const chunk = episodeFiles.slice(chunkStart, chunkStart + BROWSER_RESTART_AFTER);
    const chunkNum = Math.floor(chunkStart / BROWSER_RESTART_AFTER) + 1;
    const totalChunks = Math.ceil(episodeFiles.length / BROWSER_RESTART_AFTER);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Browser Session ${chunkNum}/${totalChunks} (Episodes ${chunkStart + 1}-${Math.min(chunkStart + BROWSER_RESTART_AFTER, episodeFiles.length)})`);
    console.log('='.repeat(50));
    
    try {
      console.log('Launching browser...');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const chunkResults = await processEpisodesInBatches(browser, chunk, CONCURRENT_REQUESTS);
      
      // Merge results
      results.success += chunkResults.success;
      results.skipped += chunkResults.skipped;
      results.failed += chunkResults.failed;
      results.errors.push(...chunkResults.errors);
      
      console.log('\nClosing browser...');
      await browser.close();
      
      // Brief pause between browser restarts
      if (chunkStart + BROWSER_RESTART_AFTER < episodeFiles.length) {
        console.log('Waiting 2 seconds before next session...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`\n✗ Browser session error: ${error.message}`);
      // Continue to next chunk
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
  
  const processedCount = results.success + results.failed;
  if (processedCount > 0) {
    console.log(`⚡ Average: ${(duration / processedCount).toFixed(1)}s per episode`);
  }
  
  if (results.errors.length > 0) {
    console.log('\nFailed Episodes:');
    const uniqueErrors = new Map();
    results.errors.forEach(err => {
      if (!uniqueErrors.has(err.episode)) {
        uniqueErrors.set(err.episode, err.error);
      }
    });
    Array.from(uniqueErrors.entries()).forEach(([episode, error]) => {
      console.log(`  Episode ${episode}: ${error}`);
    });
  }
}

// Run the scraper
scrapeEpisodeDetails().catch(error => {
  console.error('Error running scraper:', error);
  process.exit(1);
});

