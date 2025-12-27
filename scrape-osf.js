import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const EPISODES_DIR = './episodes';
const START_EPISODE = 89;
const END_EPISODE = 190;
const CONCURRENT_REQUESTS = 3;
const BROWSER_RESTART_AFTER = 30;

// Read episode files in the specified range
async function getEpisodeFiles() {
  const files = await fs.readdir(EPISODES_DIR);
  return files
    .filter(file => {
      const match = file.match(/^(\d+)\.json$/);
      if (!match) return false;
      const num = parseInt(match[1]);
      return num >= START_EPISODE && num <= END_EPISODE;
    })
    .sort((a, b) => {
      const numA = parseInt(a.replace('.json', ''));
      const numB = parseInt(b.replace('.json', ''));
      return numA - numB;
    });
}

// Check if OSF shownotes already extracted
async function isOSFProcessed(episodeNumber) {
  try {
    const osfFile = path.join(EPISODES_DIR, `${episodeNumber}-osf.json`);
    await fs.access(osfFile);
    return true;
  } catch (error) {
    return false;
  }
}

// Parse time string to seconds
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(p => parseInt(p));
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

// Extract OSF shownotes from page
async function extractOSFShownotes(page) {
  return await page.evaluate(() => {
    const chapters = [];
    const chapterBoxes = document.querySelectorAll('.osf_chapterbox');
    
    chapterBoxes.forEach(box => {
      try {
        // Extract chapter name
        const chapterEl = box.querySelector('h2.osf_chapter, h3.osf_chapter, h2, h3');
        let chapterName = '';
        if (chapterEl) {
          // Clone to avoid link text
          const clone = chapterEl.cloneNode(true);
          // Remove links from title
          const links = clone.querySelectorAll('a');
          links.forEach(link => link.remove());
          chapterName = clone.textContent.trim();
        }
        
        // Extract time
        const timeEl = box.querySelector('.osf_chaptertime');
        const time = timeEl ? timeEl.textContent.trim() : '';
        const timeSeconds = timeEl && timeEl.dataset.time ? parseInt(timeEl.dataset.time) : 0;
        
        // Extract items
        const items = [];
        const itemsContainer = box.querySelector('.osf_items, p');
        
        if (itemsContainer) {
          // Process all child nodes
          const processNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.trim();
              // Filter out separators and empty text
              if (text && text !== '—' && text !== '.' && text !== '(' && text !== ')') {
                items.push({
                  type: 'text',
                  text: text
                });
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'A') {
                // Link element
                items.push({
                  type: 'link',
                  url: node.href || '',
                  text: node.textContent.trim(),
                  title: node.title || '',
                  classes: Array.from(node.classList).filter(c => c.startsWith('osf_'))
                });
              } else if (node.tagName === 'SPAN') {
                const title = node.title || '';
                const text = node.textContent.trim();
                const classes = Array.from(node.classList).filter(c => c.startsWith('osf_'));
                
                items.push({
                  type: 'span',
                  text: text,
                  title: title,
                  classes: classes
                });
              } else {
                // Recursively process children
                node.childNodes.forEach(processNode);
              }
            }
          };
          
          itemsContainer.childNodes.forEach(processNode);
        }
        
        chapters.push({
          chapter: chapterName,
          time: time,
          timeSeconds: timeSeconds,
          items: items.filter(item => item.text || item.title)
        });
      } catch (error) {
        console.error('Error processing chapter box:', error);
      }
    });
    
    return chapters.length > 0 ? chapters : null;
  });
}

// Process a single episode
async function processEpisode(page, episodeFile) {
  const episodePath = path.join(EPISODES_DIR, episodeFile);
  const episodeData = JSON.parse(await fs.readFile(episodePath, 'utf-8'));
  const episodeNumber = episodeData.number;
  const url = episodeData.url;
  
  // Check if already processed
  if (await isOSFProcessed(episodeNumber)) {
    console.log(`Skipping episode ${episodeNumber} (already processed)`);
    return { success: true, episode: episodeNumber, skipped: true };
  }
  
  console.log(`Processing episode ${episodeNumber}: ${episodeData.title}`);
  
  try {
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    
    // Extract OSF shownotes
    const osfShownotes = await extractOSFShownotes(page);
    if (osfShownotes) {
      const osfFile = path.join(EPISODES_DIR, `${episodeNumber}-osf.json`);
      await fs.writeFile(
        osfFile, 
        JSON.stringify({ shownotes: osfShownotes }, null, 2), 
        'utf-8'
      );
      console.log(`  ✓ Saved OSF shownotes (${osfShownotes.length} chapters)`);
    } else {
      console.log(`  - No OSF shownotes found`);
    }
    
    return { success: true, episode: episodeNumber };
  } catch (error) {
    console.error(`  ✗ Error processing episode ${episodeNumber}:`, error.message);
    return { success: false, episode: episodeNumber, error: error.message };
  }
}

// Process episodes in batches
async function processEpisodesInBatches(browser, episodeFiles, concurrentRequests) {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: []
  };
  
  for (let i = 0; i < episodeFiles.length; i += concurrentRequests) {
    const batch = episodeFiles.slice(i, i + concurrentRequests);
    
    console.log(`\nProcessing batch ${Math.floor(i / concurrentRequests) + 1}/${Math.ceil(episodeFiles.length / concurrentRequests)}`);
    
    try {
      const pages = await Promise.all(
        batch.map(() => browser.newPage())
      );
      
      const batchResults = await Promise.all(
        batch.map((file, idx) => processEpisode(pages[idx], file))
      );
      
      await Promise.all(pages.map(p => p.close()));
      
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
      
      if (i + concurrentRequests < episodeFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`\n✗ Batch error: ${error.message}`);
      batch.forEach(file => {
        const num = parseInt(file.replace('.json', ''));
        results.failed++;
        results.errors.push({ episode: num, error: error.message });
      });
    }
  }
  
  return results;
}

async function scrapeOSFShownotes() {
  console.log('Reading episode files...');
  const episodeFiles = await getEpisodeFiles();
  console.log(`Processing episodes ${START_EPISODE} to ${END_EPISODE}`);
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
  
  // Process in chunks with browser restart
  for (let chunkStart = 0; chunkStart < episodeFiles.length; chunkStart += BROWSER_RESTART_AFTER) {
    const chunk = episodeFiles.slice(chunkStart, chunkStart + BROWSER_RESTART_AFTER);
    const chunkNum = Math.floor(chunkStart / BROWSER_RESTART_AFTER) + 1;
    const totalChunks = Math.ceil(episodeFiles.length / BROWSER_RESTART_AFTER);
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Browser Session ${chunkNum}/${totalChunks} (Episodes ${parseInt(chunk[0].replace('.json', ''))}-${parseInt(chunk[chunk.length - 1].replace('.json', ''))})`);
    console.log('='.repeat(50));
    
    try {
      console.log('Launching browser...');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const chunkResults = await processEpisodesInBatches(browser, chunk, CONCURRENT_REQUESTS);
      
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
scrapeOSFShownotes().catch(error => {
  console.error('Error running scraper:', error);
  process.exit(1);
});

