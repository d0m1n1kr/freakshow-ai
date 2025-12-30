# Speaker Metadata Scraper

## Overview

The `scrape-speakers.js` script scrapes speaker metadata from [freakshow.fm/team](https://freakshow.fm/team) and saves it as individual JSON files for each speaker.

## Usage

```bash
# Scrape all speakers
node scrape-speakers.js

# or via npm script
npm run scrape-speakers

# Force re-scrape (overwrite existing files)
node scrape-speakers.js --force

# Custom timeout
node scrape-speakers.js --timeout-ms 120000
```

## Options

- `--force`, `-f` - Force re-download even if file exists
- `--timeout-ms <ms>` - Page load timeout in milliseconds (default: 60000)
- `--help`, `-h` - Show help message

## Output

Creates `*-meta.json` files in the `speakers/` directory, one per speaker.

### File Format

```json
{
  "name": "Tim Pritlove",
  "slug": "tim-pritlove",
  "image": "https://freakshow.fm/podlove/image/...",
  "bio": "Tim ist der Initiator und Produzent der Freak Show...",
  "isFormer": false,
  "social": {
    "mastodon": "https://mastodon.social/@timpritlove",
    "twitter": null,
    "bluesky": "https://bsky.app/profile/tim.pritlove.org",
    "website": "https://metaebene.me/",
    "github": null,
    "facebook": null,
    "instagram": null,
    "letterboxd": "https://letterboxd.com/timpritlove",
    "twitch": null,
    "soundcloud": null,
    "other": [...]
  },
  "support": {
    "amazonWishlist": null,
    "liberapay": "https://liberapay.com/timpritlove",
    "paypal": "https://www.paypal.com/...",
    "bitcoin": null,
    "other": []
  },
  "scrapedAt": "2025-12-30T13:53:17.544Z"
}
```

## Fields

### Core Fields
- **name** - Full name as displayed on the team page
- **slug** - URL-safe identifier derived from name
- **image** - Profile image URL (Podlove CDN)
- **bio** - Bio text including role description and computer history
- **isFormer** - Boolean indicating if this is a former team member
- **scrapedAt** - ISO timestamp of when data was scraped

### Social Links
Automatically categorized from page links:
- **mastodon** - Mastodon profile URL
- **twitter** - Twitter/X profile URL
- **bluesky** - Bluesky profile URL
- **website** - Personal website
- **github** - GitHub profile
- **facebook** - Facebook profile
- **instagram** - Instagram profile
- **letterboxd** - Letterboxd profile
- **twitch** - Twitch channel
- **soundcloud** - SoundCloud profile
- **other** - Array of uncategorized links

### Support Links
Payment/donation links:
- **amazonWishlist** - Amazon wishlist URL
- **liberapay** - Liberapay profile
- **paypal** - PayPal donation link
- **bitcoin** - Bitcoin address/link
- **other** - Array of other support links

## Speaker Identification

The scraper:
1. **Current team members** - Extracted before "Frühere Teammitglieder" heading
2. **Former team members** - Extracted from "Frühere Teammitglieder" section
3. **Excludes supporters** - Stops at "Unterstützer" heading

## Examples

### Current Team Member

```bash
node scrape-speakers.js
# Creates: speakers/tim-pritlove-meta.json
```

**Result:**
- ✅ Image URL extracted
- ✅ Bio including role and computer history
- ✅ Social links categorized (Mastodon, Bluesky, Letterboxd)
- ✅ Support links (Liberapay, PayPal)
- ✅ `isFormer: false`

### Former Team Member

```bash
node scrape-speakers.js
# Creates: speakers/john-paul-hukl-bader-meta.json
```

**Result:**
- ✅ Former member marked with `isFormer: true`
- ✅ Social links (GitHub, Twitch)
- ✅ Personal website
- ✅ Bio and computer history

## Use Cases

### 1. Speaker Profile Integration
Display speaker metadata in frontend:
```javascript
import timMeta from './speakers/tim-pritlove-meta.json';
console.log(timMeta.name); // "Tim Pritlove"
console.log(timMeta.social.mastodon); // Mastodon URL
```

### 2. Social Media Links
Build a "Follow the Team" section:
```javascript
const speakers = [/* load all *-meta.json files */];
speakers.forEach(speaker => {
  if (speaker.social.mastodon) {
    // Add Mastodon follow button
  }
});
```

### 3. Support Links
Aggregate donation links:
```javascript
const supportLinks = speakers
  .filter(s => !s.isFormer)
  .map(s => s.support)
  .filter(s => s.liberapay || s.paypal);
```

### 4. Team Directory
Generate a team page with images:
```javascript
const currentTeam = speakers.filter(s => !s.isFormer);
currentTeam.forEach(speaker => {
  renderCard(speaker.name, speaker.image, speaker.bio);
});
```

## Data Quality

### Automatic Categorization
The scraper intelligently categorizes links:
- **URL pattern matching** - GitHub, Mastodon, Twitter, etc.
- **Link text analysis** - "Website", "Wishlist", etc.
- **Fallback logic** - First uncategorized link becomes website
- **Support detection** - Payment/donation keywords

### Known Limitations
1. **Mastodon detection** - May miss some Mastodon instances (e.g., chaos.social)
2. **Generic links** - Some links end up in `other[]` arrays
3. **Link text** - Some `other` links have empty labels
4. **Image resolution** - Uses 128x128 Podlove CDN images

## Updating Speaker Data

Run periodically to keep data fresh:

```bash
# Weekly update
node scrape-speakers.js --force

# Add to cron/GitHub Actions
0 0 * * 0 cd /path/to/project && node scrape-speakers.js --force
```

## Integration with Other Tools

### Matching with Voice Profiles
Match metadata slugs with voice profile slugs:
```javascript
const meta = require('./speakers/tim-pritlove-meta.json');
const profile = require('./speakers/tim-pritlove.md');
// Same slug: tim-pritlove
```

### Frontend Display
```vue
<template>
  <div class="speaker-card">
    <img :src="speaker.image" :alt="speaker.name">
    <h3>{{ speaker.name }}</h3>
    <p>{{ speaker.bio }}</p>
    <div class="social-links">
      <a v-if="speaker.social.mastodon" :href="speaker.social.mastodon">
        Mastodon
      </a>
      <a v-if="speaker.social.github" :href="speaker.social.github">
        GitHub
      </a>
    </div>
  </div>
</template>
```

## Troubleshooting

### Browser Launch Fails
```bash
# Run with all permissions (bypasses sandbox)
# This is automatically handled by the scraper
```

### Timeout Issues
```bash
# Increase timeout for slow connections
node scrape-speakers.js --timeout-ms 120000
```

### Missing Speakers
Check if they're in the "Unterstützer" section (supporters are excluded).

### Wrong Categorization
Edit the JSON file manually or improve the categorization logic in `scrape-speakers.js`.

## Source

Data scraped from: https://freakshow.fm/team

According to [freakshow.fm/team](https://freakshow.fm/team), the Freak Show team includes current members (Tim Pritlove, roddi, Clemens Schrimpe, Ralf, Dom) and former members (Max von Webel, Denis Ahrens, hukl, Letty, Tala).

---

Last updated: 2025-12-30

