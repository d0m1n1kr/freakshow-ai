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

// Parse duration string like "3 Stunden 53 Minuten" into [hh, mm, ss]
function parseDuration(durationText) {
  const s = String(durationText || '').replace(/\s+/g, ' ').trim();
  // German
  const hours = s.match(/(\d+)\s+Stunde[n]?/i);
  const minutes = s.match(/(\d+)\s+Minute[n]?/i);
  const seconds = s.match(/(\d+)\s+Sekunde[n]?/i);
  // English (e.g. UKW archive uses "3 hours 19 minutes")
  const hoursEn = s.match(/(\d+)\s+hour[s]?/i);
  const minutesEn = s.match(/(\d+)\s+minute[s]?/i);
  const secondsEn = s.match(/(\d+)\s+second[s]?/i);
  
  return [
    hours ? parseInt(hours[1], 10) : (hoursEn ? parseInt(hoursEn[1], 10) : 0),
    minutes ? parseInt(minutes[1], 10) : (minutesEn ? parseInt(minutesEn[1], 10) : 0),
    seconds ? parseInt(seconds[1], 10) : (secondsEn ? parseInt(secondsEn[1], 10) : 0),
  ];
}

// Parse date string like "05.09.2025" into "yyyy-mm-dd"
function parseDate(dateText) {
  const parts = dateText.trim().split('.');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateText;
}

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

async function scrapeEpisodes() {
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
  
  console.log('Extracting episodes...');
  
  // Extract all episodes from the page
  const episodes = await page.evaluate(() => {
    const normalizeText = (v) => (v ?? '').toString().replace(/\s+/g, ' ').trim();
    const splitSpeakers = (v) => {
      const s = normalizeText(v);
      if (!s) return [];
      return s
        .split(',')
        .map(x => normalizeText(x))
        .filter(Boolean);
    };

    const episodesData = [];

    // Layout A (Freak Show / LNP): list-based archive
    const listElements = document.querySelectorAll('ul.archive li.archive__element');
    if (listElements.length > 0) {
      listElements.forEach(element => {
        try {
          // Extract title and URL
          const titleLink = element.querySelector('a.show__title__link');
          const title = titleLink ? normalizeText(titleLink.textContent) : '';
          const url = titleLink ? titleLink.href : '';
          
          // Extract date
          const dateElement = element.querySelector('.show__meta-data--date');
          const date = dateElement ? normalizeText(dateElement.textContent) : '';
          
          // Extract duration
          const durationElement = element.querySelector('.show__meta-data--duration');
          const duration = durationElement ? normalizeText(durationElement.textContent) : '';
          
          // Extract description
          const descElement = element.querySelector('.show__description');
          const description = descElement ? normalizeText(descElement.textContent) : '';
          
          // Extract speakers
          const speakerElements = element.querySelectorAll('.show__guest__name');
          const speakers = Array.from(speakerElements).map(el => normalizeText(el.textContent)).filter(Boolean);
          
          // Extract chapters (optional)
          const chapterElements = element.querySelectorAll('.show__copy ol li');
          const chapters = Array.from(chapterElements).map(el => normalizeText(el.textContent)).filter(Boolean);
          
          episodesData.push({
            title,
            url,
            date,
            duration,
            description,
            speakers,
            chapters
          });
        } catch (error) {
          console.error('Error processing episode element:', error);
        }
      });
      
      return episodesData;
    }
    
    // Layout B (UKW): table-based archive
    const rowElements = document.querySelectorAll('tr.archive_episode_row');
    if (rowElements.length > 0) {
      rowElements.forEach(row => {
        try {
          const titleLink = row.querySelector('.episode_title a');
          const title = titleLink ? normalizeText(titleLink.textContent) : '';
          const url = titleLink ? titleLink.href : '';
          
          const dateElement = row.querySelector('.show__meta-data--date');
          const date = dateElement ? normalizeText(dateElement.textContent) : '';
          
          const durationElement = row.querySelector('.show__meta-data--duration');
          const duration = durationElement ? normalizeText(durationElement.textContent) : '';
          
          const subtitleEl = row.querySelector('.episode_subtitle');
          const description = subtitleEl ? normalizeText(subtitleEl.textContent) : '';
          
          // Speakers: prefer explicit contributor names; fallback to avatar alt texts
          const contributorNamesEl = row.querySelector('.episode_contributor_names');
          let speakers = contributorNamesEl ? splitSpeakers(contributorNamesEl.textContent) : [];
          if (speakers.length === 0) {
            const avatarImgs = Array.from(row.querySelectorAll('.episode_contributor_avatars img[alt]'));
            speakers = avatarImgs
              .map(img => normalizeText(img.getAttribute('alt')))
              .filter(Boolean);
            // de-dupe while keeping order
            const seen = new Set();
            speakers = speakers.filter(s => (seen.has(s) ? false : (seen.add(s), true)));
          }
          
          const chapters = [];
          
          episodesData.push({
            title,
            url,
            date,
            duration,
            description,
            speakers,
            chapters
          });
        } catch (error) {
          console.error('Error processing episode element:', error);
        }
      });
      
      return episodesData;
    }

    // Layout C (LNP): article-based archive (e.g. <article class="show">)
    const articleElements = document.querySelectorAll('article.show');
    articleElements.forEach(article => {
      try {
        const titleLink = article.querySelector('a.show__title__link');
        const title = titleLink ? normalizeText(titleLink.textContent) : '';
        const url = titleLink ? titleLink.href : '';

        const dateElement = article.querySelector('.show__meta-data--date');
        const date = dateElement ? normalizeText(dateElement.textContent) : '';

        const durationElement = article.querySelector('.show__meta-data--duration');
        const duration = durationElement ? normalizeText(durationElement.textContent) : '';

        const descElement = article.querySelector('.show__description');
        const description = descElement ? normalizeText(descElement.textContent) : '';

        const speakerElements = article.querySelectorAll('.show__guest__name');
        const speakers = Array.from(speakerElements).map(el => normalizeText(el.textContent)).filter(Boolean);

        // Chapters are shown as an ordered list inside a .show__copy block ("Kapitel:")
        const chapterElements = article.querySelectorAll('.show__copy ol li');
        const chapters = Array.from(chapterElements).map(el => normalizeText(el.textContent)).filter(Boolean);

        episodesData.push({
          title,
          url,
          date,
          duration,
          description,
          speakers,
          chapters
        });
      } catch (error) {
        console.error('Error processing episode element:', error);
      }
    });

    return episodesData;
  });
  
  await browser.close();
  
  console.log(`Found ${episodes.length} episodes`);
  
  // Create episodes directory
  await fsPromises.mkdir(EPISODES_DIR, { recursive: true });
  
  // Process and save each episode
  let savedCount = 0;
  let skippedCount = 0;
  
  for (const episode of episodes) {
    try {
      const episodeNumber = extractEpisodeNumber(episode.title);
      
      if (!episodeNumber) {
        console.log(`Skipping episode with unparseable number: ${episode.title}`);
        skippedCount++;
        continue;
      }
      
      const episodeData = {
        title: episode.title,
        number: episodeNumber,
        date: parseDate(episode.date),
        url: episode.url,
        duration: parseDuration(episode.duration),
        description: episode.description,
        speakers: episode.speakers,
        chapters: episode.chapters
      };
      
      const filename = path.join(EPISODES_DIR, `${episodeNumber}.json`);
      await fsPromises.writeFile(filename, JSON.stringify(episodeData, null, 2), 'utf-8');
      
      console.log(`✓ Saved episode ${episodeNumber}: ${episode.title}`);
      savedCount++;
    } catch (error) {
      console.error(`Error saving episode ${episode.title}:`, error);
      skippedCount++;
    }
  }
  
  console.log(`\n✓ Successfully saved ${savedCount} episodes`);
  if (skippedCount > 0) {
    console.log(`⚠ Skipped ${skippedCount} episodes`);
  }
}

// Run the scraper
scrapeEpisodes().catch(error => {
  console.error('Error running scraper:', error);
  process.exit(1);
});

