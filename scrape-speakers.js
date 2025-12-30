import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEAM_URL = 'https://freakshow.fm/team';
const SPEAKERS_DIR = path.join(__dirname, 'speakers');

function parseArgs(argv) {
  const args = {
    force: false,
    timeoutMs: 60000,
  };
  const a = argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--force' || k === '-f') args.force = true;
    else if (k === '--timeout-ms') args.timeoutMs = parseInt(a[++i], 10);
    else if (k === '--help' || k === '-h') args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`
Scrape speaker metadata from freakshow.fm/team

Usage:
  node scrape-speakers.js [options]

Options:
  --force, -f            Force re-download even if file exists
  --timeout-ms <ms>      Page load timeout in milliseconds (default: 60000)
  --help, -h             Show this help message
`);
}

// Normalize speaker name to slug
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9äöüß]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Extract social media links from a section
function extractSocialLinks(element) {
  const links = {
    mastodon: null,
    twitter: null,
    bluesky: null,
    website: null,
    github: null,
    facebook: null,
    instagram: null,
    letterboxd: null,
    twitch: null,
    soundcloud: null,
    amazonWishlist: null,
    liberapay: null,
    paypal: null,
    bitcoin: null,
    other: []
  };

  const linkElements = element.querySelectorAll('a');
  
  linkElements.forEach(link => {
    const href = link.href;
    const text = link.textContent.trim().toLowerCase();
    
    if (!href) return;
    
    // Mastodon
    if (href.includes('mastodon.social') || href.includes('@') && href.includes('mastodon')) {
      links.mastodon = href;
    }
    // Twitter
    else if (href.includes('twitter.com') || href.includes('x.com')) {
      links.twitter = href;
    }
    // Bluesky
    else if (href.includes('bsky.app') || text.includes('bluesky')) {
      links.bluesky = href;
    }
    // GitHub
    else if (href.includes('github.com')) {
      links.github = href;
    }
    // Facebook
    else if (href.includes('facebook.com')) {
      links.facebook = href;
    }
    // Instagram
    else if (href.includes('instagram.com')) {
      links.instagram = href;
    }
    // Letterboxd
    else if (href.includes('letterboxd.com')) {
      links.letterboxd = href;
    }
    // Twitch
    else if (href.includes('twitch.tv')) {
      links.twitch = href;
    }
    // Soundcloud
    else if (href.includes('soundcloud.com')) {
      links.soundcloud = href;
    }
    // Amazon Wishlist
    else if (href.includes('amazon.') && (text.includes('wishlist') || text.includes('wunschliste'))) {
      links.amazonWishlist = href;
    }
    // Liberapay
    else if (href.includes('liberapay.com')) {
      links.liberapay = href;
    }
    // Paypal
    else if (href.includes('paypal.com') || href.includes('paypal.me')) {
      links.paypal = href;
    }
    // Bitcoin
    else if (text.includes('bitcoin') || href.startsWith('bitcoin:')) {
      links.bitcoin = href;
    }
    // Website (generic)
    else if (text.includes('website') || link.title?.toLowerCase().includes('website')) {
      links.website = href;
    }
    // Other social/support links
    else if (!href.includes('freakshow.fm') && !href.includes('#')) {
      // Could be personal website or other social media
      if (!links.website && (href.includes('http://') || href.includes('https://'))) {
        // First non-categorized link is likely personal website
        links.website = href;
      } else {
        links.other.push(href);
      }
    }
  });

  return links;
}

async function scrapeSpeakers() {
  const ARGS = parseArgs(process.argv);
  
  if (ARGS.help) {
    printHelp();
    return;
  }

  console.log('🎙️  Scraping speaker metadata from freakshow.fm/team\n');
  console.log(`URL: ${TEAM_URL}`);
  console.log(`Output: ${SPEAKERS_DIR}`);
  console.log('');

  // Ensure speakers directory exists
  await fs.mkdir(SPEAKERS_DIR, { recursive: true });

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new'
  });
  
  const page = await browser.newPage();
  
  console.log(`Navigating to ${TEAM_URL}...`);
  await page.goto(TEAM_URL, { 
    waitUntil: 'networkidle2',
    timeout: ARGS.timeoutMs
  });
  
  console.log('Extracting speaker data...\n');
  
  // Extract speaker information from the page
  const speakers = await page.evaluate(() => {
    const speakersData = [];
    
    // Current team members (before "Frühere Teammitglieder" heading)
    const currentTeamHeading = document.querySelector('h1');
    const formerTeamHeading = Array.from(document.querySelectorAll('h1')).find(h => 
      h.textContent.includes('Frühere Teammitglieder')
    );
    
    // Find all hr elements that separate team members
    const sections = document.querySelectorAll('hr');
    
    // Get the main content area
    const mainContent = document.querySelector('.entry-content');
    if (!mainContent) return speakersData;
    
    // Process current team members
    const currentTeamSection = formerTeamHeading 
      ? mainContent.innerHTML.split(formerTeamHeading.outerHTML)[0]
      : mainContent.innerHTML;
    
    // Create a temporary div to parse current team
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = currentTeamSection;
    
    const processSection = (container, isFormer = false) => {
      // Find all sections separated by hr
      const hrs = Array.from(container.querySelectorAll('hr'));
      
      // Split content by hr elements
      let currentHtml = container.innerHTML;
      const sectionHtmls = [];
      
      hrs.forEach(hr => {
        const parts = currentHtml.split(hr.outerHTML);
        if (parts[0].trim()) {
          sectionHtmls.push(parts[0]);
        }
        currentHtml = parts.slice(1).join(hr.outerHTML);
      });
      if (currentHtml.trim()) {
        sectionHtmls.push(currentHtml);
      }
      
      sectionHtmls.forEach(html => {
        const section = document.createElement('div');
        section.innerHTML = html;
        
        // Extract image first to get the full name from alt attribute
        const img = section.querySelector('img');
        const image = img ? img.src : null;
        
        // Get name from image alt attribute (most reliable)
        let name = img ? img.alt : null;
        
        // Fallback to strong tag if no image alt
        if (!name) {
          const nameElement = section.querySelector('strong');
          if (!nameElement) return;
          name = nameElement.textContent.trim();
        }
        
        if (!name || name.includes('Unterstützer')) return;
        
        // Extract bio text
        const paragraphs = Array.from(section.querySelectorAll('p'))
          .map(p => p.textContent.trim())
          .filter(t => t && !t.startsWith('Amazon') && !t.startsWith('GitHub'));
        const bio = paragraphs.join('\n\n');
        
        // Extract links from this section
        const links = Array.from(section.querySelectorAll('a')).map(a => ({
          href: a.href,
          text: a.textContent.trim()
        }));
        
        speakersData.push({
          name,
          image,
          bio,
          links,
          isFormer
        });
      });
    };
    
    processSection(tempDiv, false);
    
    // Process former team members if section exists
    if (formerTeamHeading) {
      const formerDiv = document.createElement('div');
      const formerHtml = mainContent.innerHTML.split(formerTeamHeading.outerHTML)[1];
      if (formerHtml) {
        // Stop at "Unterstützer" heading
        const supporterHeading = Array.from(document.querySelectorAll('h1')).find(h => 
          h.textContent.includes('Unterstützer')
        );
        const finalHtml = supporterHeading 
          ? formerHtml.split(supporterHeading.outerHTML)[0]
          : formerHtml;
        formerDiv.innerHTML = finalHtml;
        processSection(formerDiv, true);
      }
    }
    
    return speakersData;
  });

  console.log(`Found ${speakers.length} speakers\n`);

  // Process each speaker
  for (const speaker of speakers) {
    const slug = slugify(speaker.name);
    const filename = `${slug}-meta.json`;
    const filepath = path.join(SPEAKERS_DIR, filename);
    
    // Check if file exists and --force not set
    if (!ARGS.force) {
      try {
        await fs.access(filepath);
        console.log(`✓ ${speaker.name} (${slug}) - already exists, skipping`);
        continue;
      } catch {
        // File doesn't exist, continue with processing
      }
    }
    
    // Organize social links
    const socialLinks = {
      mastodon: null,
      twitter: null,
      bluesky: null,
      website: null,
      github: null,
      facebook: null,
      instagram: null,
      letterboxd: null,
      twitch: null,
      soundcloud: null,
      other: []
    };
    
    const supportLinks = {
      amazonWishlist: null,
      liberapay: null,
      paypal: null,
      bitcoin: null,
      other: []
    };
    
    for (const link of speaker.links) {
      const href = link.href;
      const text = link.text.toLowerCase();
      
      // Mastodon
      if (href.includes('mastodon')) {
        socialLinks.mastodon = href;
      }
      // Twitter
      else if (href.includes('twitter.com') || href.includes('x.com')) {
        socialLinks.twitter = href;
      }
      // Bluesky
      else if (href.includes('bsky.app') || text.includes('bluesky')) {
        socialLinks.bluesky = href;
      }
      // GitHub
      else if (href.includes('github.com')) {
        socialLinks.github = href;
      }
      // Facebook
      else if (href.includes('facebook.com')) {
        socialLinks.facebook = href;
      }
      // Instagram
      else if (href.includes('instagram.com')) {
        socialLinks.instagram = href;
      }
      // Letterboxd
      else if (href.includes('letterboxd.com')) {
        socialLinks.letterboxd = href;
      }
      // Twitch
      else if (href.includes('twitch.tv')) {
        socialLinks.twitch = href;
      }
      // Soundcloud
      else if (href.includes('soundcloud.com')) {
        socialLinks.soundcloud = href;
      }
      // Amazon Wishlist
      else if (href.includes('amazon.') && (text.includes('wishlist') || text.includes('wunschliste') || href.includes('/wishlist/') || href.includes('/registry/'))) {
        supportLinks.amazonWishlist = href;
      }
      // Liberapay
      else if (href.includes('liberapay.com')) {
        supportLinks.liberapay = href;
      }
      // Paypal
      else if (href.includes('paypal.com') || href.includes('paypal.me')) {
        supportLinks.paypal = href;
      }
      // Bitcoin
      else if (text.includes('bitcoin') || href.startsWith('bitcoin:')) {
        supportLinks.bitcoin = href;
      }
      // Website
      else if (text.includes('website') || (!href.includes('freakshow.fm') && !socialLinks.website)) {
        socialLinks.website = href;
      }
      // Other
      else if (!href.includes('freakshow.fm') && !href.includes('#')) {
        if (text.includes('wishlist') || text.includes('support') || text.includes('spenden')) {
          supportLinks.other.push({ url: href, label: text });
        } else {
          socialLinks.other.push({ url: href, label: text });
        }
      }
    }
    
    // Build final metadata object
    const metadata = {
      name: speaker.name,
      slug,
      image: speaker.image,
      bio: speaker.bio,
      isFormer: speaker.isFormer,
      social: socialLinks,
      support: supportLinks,
      scrapedAt: new Date().toISOString()
    };
    
    // Write to file
    await fs.writeFile(filepath, JSON.stringify(metadata, null, 2), 'utf-8');
    console.log(`✓ ${speaker.name} (${slug}) - saved to ${filename}`);
  }

  await browser.close();
  
  console.log('\n✅ Done! Speaker metadata saved to speakers/*-meta.json');
}

// Run the scraper
scrapeSpeakers().catch((error) => {
  console.error('\n❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});

