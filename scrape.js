import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';

const ARCHIVE_URL = 'https://freakshow.fm/archiv';
const EPISODES_DIR = './episodes';

// Parse duration string like "3 Stunden 53 Minuten" into [hh, mm, ss]
function parseDuration(durationText) {
  const hours = durationText.match(/(\d+)\s+Stunde[n]?/);
  const minutes = durationText.match(/(\d+)\s+Minute[n]?/);
  const seconds = durationText.match(/(\d+)\s+Sekunde[n]?/);
  
  return [
    hours ? parseInt(hours[1]) : 0,
    minutes ? parseInt(minutes[1]) : 0,
    seconds ? parseInt(seconds[1]) : 0
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

// Extract episode number from title like "FS296 Chat der langen Messer"
function extractEpisodeNumber(title) {
  const match = title.match(/FS(\d+)|MM(\d+)/i);
  if (match) {
    return parseInt(match[1] || match[2]);
  }
  return null;
}

async function scrapeEpisodes() {
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
    const episodeElements = document.querySelectorAll('ul.archive li.archive__element');
    const episodesData = [];
    
    episodeElements.forEach(element => {
      try {
        // Extract title and URL
        const titleLink = element.querySelector('a.show__title__link');
        const title = titleLink ? titleLink.textContent.trim() : '';
        const url = titleLink ? titleLink.href : '';
        
        // Extract date
        const dateElement = element.querySelector('.show__meta-data--date');
        const date = dateElement ? dateElement.textContent.trim() : '';
        
        // Extract duration
        const durationElement = element.querySelector('.show__meta-data--duration');
        const duration = durationElement ? durationElement.textContent.trim() : '';
        
        // Extract description
        const descElement = element.querySelector('.show__description');
        const description = descElement ? descElement.textContent.trim() : '';
        
        // Extract speakers
        const speakerElements = element.querySelectorAll('.show__guest__name');
        const speakers = Array.from(speakerElements).map(el => el.textContent.trim());
        
        // Extract chapters
        const chapterElements = element.querySelectorAll('.show__copy ol li');
        const chapters = Array.from(chapterElements).map(el => el.textContent.trim());
        
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
  await fs.mkdir(EPISODES_DIR, { recursive: true });
  
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
      await fs.writeFile(filename, JSON.stringify(episodeData, null, 2), 'utf-8');
      
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

