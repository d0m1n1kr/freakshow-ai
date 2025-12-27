# Freak Show Podcast Scraper

This project scrapes the Freak Show podcast archive page and extracts episode information including metadata, transcripts, shownotes, and text content into structured JSON and HTML files.

## Features

- ✅ Scrapes all 300 episodes from the Freak Show archive
- ✅ Extracts episode metadata (title, number, date, duration, speakers, chapters)
- ✅ Extracts transcripts with timestamps and speaker attribution
- ✅ Extracts shownotes with links and categorization
- ✅ Extracts episode descriptions as HTML
- ✅ Concurrent processing for better performance
- ✅ Automatic browser restart to handle large scraping sessions
- ✅ Skip already processed episodes (resume capability)

## Installation

```bash
npm install
```

## Usage

### Step 1: Scrape Episode List

Run the main scraper to get all episode metadata:

```bash
npm run scrape
```

This will:
1. Navigate to https://freakshow.fm/archiv
2. Extract all episode information
3. Create an `episodes/` directory
4. Save each episode as `<episode_number>.json`

### Step 2: Scrape Episode Details

Run the details scraper to get transcripts, shownotes, and text content:

```bash
npm run scrape-details
```

This will:
1. Read all episode JSON files
2. Visit each episode URL
3. Extract transcript (if available) → `<episode_number>-ts.json`
4. Extract shownotes (if available) → `<episode_number>-sn.json`
5. Extract 2nd paragraph content → `<episode_number>-text.html`

The scraper processes 3 episodes concurrently for better performance.

### Step 3: Scrape OSF Shownotes (Episodes 89-190)

Episodes 89-190 use an older shownote format (OSF - Open Shownotes Format). Run this scraper to extract them:

```bash
npm run scrape-osf
```

This will:
1. Process episodes 89-190
2. Extract OSF shownotes with chapters, times, links, and annotations
3. Save to `<episode_number>-osf.json`

## Output Format

### Episode Metadata (`<episode_number>.json`)

```json
{
  "title": "FS296 Chat der langen Messer",
  "number": 296,
  "date": "2025-09-05",
  "url": "https://freakshow.fm/fs296-chat-der-langen-messer",
  "duration": [3, 53, 0],
  "description": "Die Stimme der Jugend — trackiwi — ...",
  "speakers": ["Tim Pritlove", "hukl", "Ralf Stockmann"],
  "chapters": ["Intro", "Begrüßung", ...]
}
```

### Transcript (`<episode_number>-ts.json`)

```json
{
  "transcript": [
    {
      "speaker": "Tim Pritlove",
      "time": "0:00:21",
      "text": "Hallo und herzlich willkommen..."
    }
  ]
}
```

### Shownotes (`<episode_number>-sn.json`)

```json
{
  "shownotes": [
    {
      "icon": "link",
      "title": "pretalx",
      "link": "https://pretalx.c3voc.de/39c3-sendezentrum/",
      "linkText": "39C3: Sendezentrum"
    }
  ]
}
```

### Text Content (`<episode_number>-text.html`)

HTML content of the second paragraph from the episode page.

### OSF Shownotes (`<episode_number>-osf.json`, Episodes 89-190 only)

```json
{
  "shownotes": [
    {
      "chapter": "Intro",
      "time": "00:00:00",
      "timeSeconds": 0,
      "items": [
        {
          "type": "link",
          "url": "https://example.com",
          "text": "Link text",
          "title": "00:00:05: Description",
          "classes": ["osf_url", "osf_https"]
        },
        {
          "type": "span",
          "text": "Some note",
          "title": "00:01:30: Some note with timestamp",
          "classes": ["osf_quote"]
        },
        {
          "type": "text",
          "text": "Plain text content"
        }
      ]
    }
  ]
}
```

## Results

After running all scrapers, you'll have:

- **300 episode metadata files** (`1.json` to `300.json`)
- **88 transcript files** (newer episodes have transcripts)
- **170 shownote files** (episodes 191+ in modern format)
- **101 OSF shownote files** (episodes 89-190 in OSF format)
- **300 text content files** (episode descriptions)

**Total: 959 files**

## Topic Extraction with LLM

This project includes an AI-powered topic extraction feature that automatically identifies the main topics discussed in each episode using a configurable Large Language Model (LLM).

### Setup

1. **Configure your LLM** by editing `settings.json`:

```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "YOUR_API_KEY_HERE",
    "baseURL": "https://api.openai.com/v1",
    "temperature": 0.3,
    "maxTokens": 1000
  },
  "topicExtraction": {
    "maxTopics": 10,
    "minTopicLength": 3,
    "language": "de"
  }
}
```

2. **Extract topics**:

```bash
# Test with a single episode
npm run extract-topics 1

# Process multiple episodes
npm run extract-topics 1 2 3

# Process a range
npm run extract-topics -- --range 1 10

# Process all episodes (may take time and cost money!)
npm run extract-topics -- --all
```

### Output

For each episode, a `<episode_number>-topics.json` file is created:

```json
{
  "episodeNumber": 1,
  "title": "MM001 Der Pilot",
  "extractedAt": "2025-12-27T10:30:00.000Z",
  "topics": [
    {
      "topic": "Podcast-Start und Format-Findung",
      "keywords": ["Pilotsendung", "Experiment", "Format"]
    },
    {
      "topic": "Apple iPhone und Mac Diskussion",
      "keywords": ["iPhone", "Mac", "Apple"]
    }
  ]
}
```

See `TOPICS-README.md` for detailed documentation about topic extraction, including:
- Alternative LLM providers (Anthropic, OpenRouter, Ollama)
- Cost estimation
- Advanced configuration options

## Configuration

You can customize the scraping behavior:

### `scrape-details.js`
```javascript
const CONCURRENT_REQUESTS = 3; // Number of parallel browser pages
const BROWSER_RESTART_AFTER = 30; // Restart browser after N episodes
const START_EPISODE = null; // Set to process specific range
const END_EPISODE = null;   // e.g., 1 to 50
```

### `scrape-osf.js`
```javascript
const START_EPISODE = 89;  // Fixed range for OSF format
const END_EPISODE = 190;   // (episodes with old shownote format)
const CONCURRENT_REQUESTS = 3;
const BROWSER_RESTART_AFTER = 30;
```

