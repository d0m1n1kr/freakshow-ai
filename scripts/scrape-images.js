import puppeteer from 'puppeteer';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const podcastIndex = args.indexOf('--podcast');
const PODCAST_ID = podcastIndex !== -1 && args[podcastIndex + 1] ? args[podcastIndex + 1] : 'freakshow';

const PROJECT_ROOT = path.join(__dirname, '..');

// Load settings and get podcast configuration
let settings;
try {
  settings = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'settings.json'), 'utf-8'));
} catch (error) {
  console.error('Error loading settings.json:', error.message);
  console.error('Falling back to settings.example.json');
  try {
    settings = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'settings.example.json'), 'utf-8'));
  } catch (e) {
    console.error('Error loading settings.example.json:', e.message);
    process.exit(1);
  }
}

// Find podcast configuration
const podcast = settings.podcasts?.find(p => p.id === PODCAST_ID);
if (!podcast) {
  console.error(`Error: Podcast '${PODCAST_ID}' not found in settings.json`);
  process.exit(1);
}

const ARCHIVE_URL = podcast.archiveUrl;
if (!ARCHIVE_URL) {
  console.error(`Error: archiveUrl not configured for podcast '${PODCAST_ID}'`);
  process.exit(1);
}

const EPISODES_DIR = path.join(PROJECT_ROOT, 'podcasts', PODCAST_ID, 'episodes');

// Extract episode number from title like "FS296 Chat der langen Messer" or "LNP540 Respektschelle"
// Removes any letter prefix and extracts the first number
function extractEpisodeNumber(title) {
  // Match any letters followed by digits, or just digits at the start
  const match = title.match(/^[A-Za-z]*(\d+)/);
  if (match) {
    return parseInt(match[1]);
  }
  return null;
}

// Extract episode number from URL like "https://freakshow.fm/fs300-das-ist-aber-nicht-schoen-gebucht"
function extractEpisodeNumberFromUrl(url) {
  // Try to extract number from URL path (e.g., fs300, lnp540, etc.)
  const match = url.match(/\/([a-z]+)(\d+)/i);
  if (match && match[2]) {
    return parseInt(match[2]);
  }
  return null;
}

// Download image from URL and save to file
async function downloadImage(imageUrl, filePath) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    await fsPromises.writeFile(filePath, buffer);
    return true;
  } catch (error) {
    console.error(`  ✗ Error downloading image: ${error.message}`);
    return false;
  }
}

// Get file extension from URL or content type
function getImageExtension(url) {
  // Try to extract extension from URL
  const urlMatch = url.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i);
  if (urlMatch) {
    return urlMatch[1].toLowerCase();
  }
  // Default to jpg
  return 'jpg';
}

async function scrapeImages() {
  console.log(`Processing podcast: ${PODCAST_ID}`);
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new'
  });
  
  const page = await browser.newPage();
  
  console.log(`Navigating to ${ARCHIVE_URL}...`);
  await page.goto(ARCHIVE_URL, { 
    waitUntil: 'networkidle2',
    timeout: 60000
  });
  
  console.log('Extracting episodes and images...');
  
  // Extract all episodes with their cover images from the page
  const episodes = await page.evaluate(() => {
    const normalizeText = (v) => (v ?? '').toString().replace(/\s+/g, ' ').trim();

    const episodesData = [];

    // Layout C (article-based archive): <article class="show">
    const articleElements = document.querySelectorAll('article.show');
    articleElements.forEach(article => {
      try {
        const titleLink = article.querySelector('a.show__title__link');
        const title = titleLink ? normalizeText(titleLink.textContent) : '';
        const url = titleLink ? titleLink.href : '';

        // Extract cover image
        const coverImage = article.querySelector('img.show__cover__image');
        const imageUrl = coverImage ? coverImage.src : null;
        
        // Try to get the highest resolution from srcset if available
        let bestImageUrl = imageUrl;
        if (coverImage && coverImage.srcset) {
          // Parse srcset: "url1 1x, url2 2x, url3 3x"
          const srcset = coverImage.srcset;
          const matches = srcset.matchAll(/(\S+)\s+(\d+)x/g);
          let maxRes = 0;
          for (const match of matches) {
            const res = parseInt(match[2]);
            if (res > maxRes) {
              maxRes = res;
              bestImageUrl = match[1];
            }
          }
        }

        if (title && url && bestImageUrl) {
          episodesData.push({
            title,
            url,
            imageUrl: bestImageUrl
          });
        }
      } catch (error) {
        console.error('Error processing episode element:', error);
      }
    });

    return episodesData;
  });
  
  await browser.close();
  
  console.log(`Found ${episodes.length} episodes with images`);
  
  // Create episodes directory
  await fsPromises.mkdir(EPISODES_DIR, { recursive: true });
  
  // Process and download each image
  let downloadedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  for (const episode of episodes) {
    try {
      // Try to extract episode number from URL first, then from title
      let episodeNumber = extractEpisodeNumberFromUrl(episode.url);
      if (!episodeNumber) {
        episodeNumber = extractEpisodeNumber(episode.title);
      }
      
      if (!episodeNumber) {
        console.log(`Skipping episode with unparseable number: ${episode.title}`);
        skippedCount++;
        continue;
      }
      
      // Determine file extension
      const extension = getImageExtension(episode.imageUrl);
      const imagePath = path.join(EPISODES_DIR, `${episodeNumber}.${extension}`);
      
      // Check if image already exists
      try {
        await fsPromises.access(imagePath);
        console.log(`⊘ Skipping episode ${episodeNumber} (image already exists)`);
        skippedCount++;
        continue;
      } catch {
        // File doesn't exist, proceed with download
      }
      
      console.log(`Downloading image for episode ${episodeNumber}: ${episode.title}`);
      const success = await downloadImage(episode.imageUrl, imagePath);
      
      if (success) {
        console.log(`  ✓ Saved image: ${episodeNumber}.${extension}`);
        downloadedCount++;
      } else {
        failedCount++;
      }
    } catch (error) {
      console.error(`Error processing episode ${episode.title}:`, error);
      failedCount++;
    }
  }
  
  console.log(`\n✓ Successfully downloaded ${downloadedCount} images`);
  if (skippedCount > 0) {
    console.log(`⊘ Skipped ${skippedCount} images (already exist or unparseable)`);
  }
  if (failedCount > 0) {
    console.log(`✗ Failed to download ${failedCount} images`);
  }
}

// Run the scraper
scrapeImages().catch(error => {
  console.error('Error running scraper:', error);
  process.exit(1);
});

