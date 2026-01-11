/**
 * scrape-transcript.js
 * 
 * Scrapes podcast episode transcripts from Podlove WebVTT URLs and saves them
 * in the -ts.json format used throughout the project.
 * 
 * For podcasts hosted on metaebene.me (like forschergeist), this script constructs
 * the direct VTT file URL from the episode URL:
 *   Episode: https://forschergeist.de/podcast/fg100-stellerator/
 *   VTT: https://media.metaebene.me/media/forschergeist/episodes/fg100-stellerator.vtt
 * 
 * The script converts WebVTT format (with <v speaker-slug> tags) to the project's
 * transcript format with proper speaker names and merged text segments.
 * 
 * Usage:
 *   node scripts/scrape-transcript.js --podcast <podcast-id> [options]
 * 
 * Options:
 *   --podcast <id>     Podcast ID (default: freakshow)
 *   --episode <num>    Process single episode
 *   --start <num>      Start at episode number
 *   --end <num>        End at episode number
 *   --force            Overwrite existing transcript files
 * 
 * Examples:
 *   node scripts/scrape-transcript.js --podcast forschergeist --episode 100
 *   node scripts/scrape-transcript.js --podcast forschergeist --start 90 --end 100
 *   node scripts/scrape-transcript.js --podcast forschergeist --force
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const podcastIndex = args.indexOf('--podcast');
const PODCAST_ID = podcastIndex !== -1 && args[podcastIndex + 1] ? args[podcastIndex + 1] : 'freakshow';

const PROJECT_ROOT = path.join(__dirname, '..');
const EPISODES_DIR = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');

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
    else if (a === '--podcast') i++; // Skip podcast value (already parsed)
  }

  return args;
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

async function isTranscriptProcessed(episodeNumber) {
  try {
    const outFile = path.join(EPISODES_DIR, `${episodeNumber}-ts.json`);
    await fs.access(outFile);
    return true;
  } catch {
    return false;
  }
}

/**
 * Construct possible transcript URLs from episode URL
 * Returns an array of URLs to try in order
 */
function constructTranscriptUrls(episodeUrl) {
  const urls = [];
  
  // Method 1: Podlove transcript query parameter (most reliable)
  // e.g., https://forschergeist.de/podcast/fg100-stellerator/?podlove_transcript=webvtt
  urls.push(`${episodeUrl}?podlove_transcript=webvtt`);
  
  // Method 2: Direct VTT file on media server (faster, but not always available)
  // e.g., https://media.metaebene.me/media/forschergeist/episodes/fg100-stellerator.vtt
  const urlObj = new URL(episodeUrl);
  const pathname = urlObj.pathname;
  const match = pathname.match(/\/podcast\/([^\/]+)/);
  if (match) {
    const episodeSlug = match[1];
    urls.push(`https://media.metaebene.me/media/${PODCAST_ID}/episodes/${episodeSlug}.vtt`);
  }
  
  return urls;
}

/**
 * Extract transcript URL from Podlove player config (fallback method)
 */
async function extractTranscriptUrlFromPage(page) {
  return await page.evaluate(() => {
    // Method 1: Look for transcript URL in podlovePlayerCache
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const script of scripts) {
      if (script.textContent && script.textContent.includes('podlovePlayerCache')) {
        const match = script.textContent.match(/podlovePlayerCache\.add\(\[([\s\S]+?)\]\)/);
        if (match) {
          try {
            const data = JSON.parse('[' + match[1] + ']');
            const episode = data.find(d => d && d.data);
            if (episode?.data?.transcripts) {
              const webvttTranscript = episode.data.transcripts.find(t => t.type === 'text/vtt');
              if (webvttTranscript?.url) {
                return webvttTranscript.url;
              }
            }
          } catch (e) {
            // Continue to next method
          }
        }
      }
    }
    
    // Method 2: Look for transcript link in the page
    const transcriptLinks = Array.from(document.querySelectorAll('a[href*="transcript"], a[href*=".vtt"]'));
    for (const link of transcriptLinks) {
      if (link.href.includes('.vtt')) {
        return link.href;
      }
    }
    
    return null;
  });
}

/**
 * Convert speaker slug to proper name
 * e.g., "tim-pritlove" -> "Tim Pritlove"
 */
function slugToName(slug) {
  if (!slug) return '';
  
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Fetch WebVTT content from URL
 */
async function fetchWebVTT(url) {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { error: 'Transcript file not found (404) - transcript may not be available for this episode', html: false };
      }
      return { error: `HTTP ${response.status}: ${response.statusText}`, html: false };
    }
    
    const text = await response.text();
    
    // Check if it's actually WebVTT and not HTML
    if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
      return { error: 'Received HTML instead of WebVTT format', html: true };
    }
    
    if (!text.includes('WEBVTT')) {
      return { error: 'Invalid WebVTT format: missing WEBVTT header', html: false };
    }
    
    return { text };
  } catch (error) {
    return { error: error.message, html: false };
  }
}

/**
 * Convert WebVTT timestamp to seconds-precision format (H:MM:SS)
 * Input: "00:00:43.301" or "00:00:43,301"
 * Output: "0:00:43"
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  
  // Remove milliseconds (after . or ,)
  const withoutMs = timestamp.split(/[.,]/)[0];
  
  // Parse HH:MM:SS
  const parts = withoutMs.split(':');
  if (parts.length !== 3) return '';
  
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const seconds = parts[2];
  
  // Format as H:MM:SS (remove leading zero from hours)
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Parse WebVTT format to extract transcript entries.
 * WebVTT format:
 * WEBVTT
 * 
 * 1
 * 00:00:00.000 --> 00:00:05.000
 * <v speaker-slug>Text content here
 * 
 * @param {string} webvttContent - The WebVTT content
 * @returns {Array} Array of transcript objects with speaker, time, and text
 */
function parseWebVTT(webvttContent) {
  const lines = webvttContent.split('\n');
  const transcript = [];
  
  let i = 0;
  // Skip WEBVTT header and any metadata
  while (i < lines.length && !lines[i].trim().startsWith('WEBVTT')) {
    i++;
  }
  i++; // Move past WEBVTT line
  
  // Skip any header metadata
  while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
    i++;
  }
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Skip empty lines and cue identifiers (numbers)
    if (!line || /^\d+$/.test(line)) {
      i++;
      continue;
    }
    
    // Check for timestamp line (e.g., "00:00:00.000 --> 00:00:05.000")
    if (line.includes('-->')) {
      const timestampMatch = line.match(/^(\d{2}:\d{2}:\d{2}[.,]\d{3})/);
      const timestamp = timestampMatch ? formatTimestamp(timestampMatch[1]) : '';
      
      i++; // Move to content line(s)
      
      // Collect all content lines until next empty line or timestamp
      const contentLines = [];
      while (i < lines.length) {
        const contentLine = lines[i].trim();
        if (!contentLine || contentLine.includes('-->') || /^\d+$/.test(contentLine)) {
          break;
        }
        contentLines.push(contentLine);
        i++;
      }
      
      // Parse content lines for speaker and text
      const content = contentLines.join('\n');
      
      // WebVTT voice tags: <v speaker-slug>Text
      // Note: The closing tag might not always be present, text continues until end of cue
      const voiceTagRegex = /<v\s+([^>]+)>([\s\S]*?)(?:<\/v>|$)/g;
      let match;
      let hasVoiceTag = false;
      
      while ((match = voiceTagRegex.exec(content)) !== null) {
        hasVoiceTag = true;
        const speakerSlug = match[1].trim();
        const speaker = slugToName(speakerSlug);
        let text = match[2].trim();
        
        // Remove any remaining HTML tags
        text = text.replace(/<[^>]+>/g, '').trim();
        
        if (text) {
          // Each segment becomes a separate entry (no merging)
          transcript.push({
            speaker: speaker,
            time: timestamp,
            text: text
          });
        }
      }
      
      // Fallback: if no voice tags, treat entire content as text without speaker
      if (!hasVoiceTag && content) {
        const cleanText = content
          .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
          .trim();
        
        if (cleanText) {
          transcript.push({
            speaker: '',
            time: timestamp,
            text: cleanText
          });
        }
      }
    } else {
      i++;
    }
  }
  
  return transcript;
}

async function processEpisode(page, episodeFile, { force }) {
  const episodePath = path.join(EPISODES_DIR, episodeFile);
  const episodeData = JSON.parse(await fs.readFile(episodePath, 'utf-8'));
  const episodeNumber = episodeData.number;
  const url = episodeData.url;

  if (!force && await isTranscriptProcessed(episodeNumber)) {
    console.log(`Skipping episode ${episodeNumber} (transcript already scraped)`);
    return { success: true, episode: episodeNumber, skipped: true };
  }

  console.log(`Processing episode ${episodeNumber}: ${episodeData.title}`);

  try {
    // Try multiple possible transcript URLs
    const possibleUrls = constructTranscriptUrls(url);
    let transcriptUrl = null;
    let webvttContent = null;
    
    for (const tryUrl of possibleUrls) {
      console.log(`  Trying: ${tryUrl}`);
      
      // First check if URL is accessible
      try {
        const testResponse = await fetch(tryUrl, { method: 'HEAD' });
        if (!testResponse.ok) {
          console.log(`  ! Returned ${testResponse.status}`);
          continue;
        }
      } catch (e) {
        console.log(`  ! Could not access: ${e.message}`);
        continue;
      }
      
      // URL is accessible, try to fetch content
      console.log(`  Fetching transcript from: ${tryUrl}`);
      const result = await fetchWebVTT(tryUrl);
      
      if (result.text) {
        // Success!
        webvttContent = result.text;
        transcriptUrl = tryUrl;
        console.log(`  ✓ Found valid WebVTT transcript`);
        break;
      } else if (result.html) {
        // Got HTML instead, try next URL
        console.log(`  ! Received HTML instead of WebVTT, trying next URL...`);
        continue;
      } else {
        // Other error
        console.log(`  ! ${result.error}`);
        continue;
      }
    }
    
    // Fallback: scrape the page to find transcript URL
    if (!webvttContent) {
      console.log(`  Trying to scrape page for transcript URL...`);
      page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: NAVIGATION_TIMEOUT_MS,
        });
      } catch (err) {
        console.warn(`  ! Navigation issue for episode ${episodeNumber}, retrying once: ${err?.message || err}`);
        await page.goto(url, {
          waitUntil: 'load',
          timeout: NAVIGATION_TIMEOUT_MS,
        });
      }

      // Wait for Podlove player
      try {
        await page.waitForSelector('.podlove-web-player', { timeout: 8000 });
      } catch {
        // Best effort
      }

      // Extract transcript URL from page
      const scrapedUrl = await extractTranscriptUrlFromPage(page);
      
      if (scrapedUrl) {
        console.log(`  Found URL from page scraping: ${scrapedUrl}`);
        console.log(`  Fetching transcript from: ${scrapedUrl}`);
        const result = await fetchWebVTT(scrapedUrl);
        if (result.text) {
          webvttContent = result.text;
          transcriptUrl = scrapedUrl;
        } else {
          throw new Error(`Failed to fetch scraped transcript: ${result.error}`);
        }
      }
    }
    
    if (!webvttContent) {
      throw new Error('Could not find transcript - transcript may not be available for this episode');
    }
    
    // Parse WebVTT to transcript format
    const transcript = parseWebVTT(webvttContent);
    
    if (!transcript || transcript.length === 0) {
      throw new Error('No transcript entries found in WebVTT');
    }
    
    // Save to -ts.json file
    const outFile = path.join(EPISODES_DIR, `${episodeNumber}-ts.json`);
    await fs.writeFile(outFile, JSON.stringify({ transcript }, null, 2), 'utf-8');
    
    console.log(`  ✓ Saved transcript (${transcript.length} entries)`);

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

async function scrapeTranscripts() {
  const args = parseArgs(process.argv.slice(2));
  const episodeFiles = await getEpisodeFiles(args);

  console.log(`Processing podcast: ${PODCAST_ID}`);
  console.log(`Episodes directory: ${EPISODES_DIR}`);
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

  const processedCount = results.success + results.failed;
  if (processedCount > 0) {
    console.log(`⚡ Average: ${(duration / processedCount).toFixed(1)}s per episode`);
  }

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

scrapeTranscripts().catch(error => {
  console.error('Error running scrape-transcript:', error);
  process.exit(1);
});
