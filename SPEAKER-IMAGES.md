# Speaker Images Integration

This document describes how speaker images from the speaker metadata are displayed in the frontend.

## Overview

Speaker profile images are automatically displayed in three places:
1. **Search Tab**: When a speaker persona is selected, their image appears next to the answer
2. **Player Subtitles**: When playing audio with live transcripts, the current speaker's image appears next to their name
3. **Speaker River Chart**: Speaker images appear in the legend and tooltips when hovering over streams

## Implementation Details

### Backend (Rust)

The backend loads speaker images from `speakers/*-meta.json` files and includes them in the `/api/speakers` endpoint response:

```rust
// src/rag_backend.rs
struct SpeakerInfo {
    // ... other fields ...
    image: Option<String>,  // Podlove CDN URL
}
```

The `load_speakers_index` function reads both `index.json` and individual `-meta.json` files to populate the image URLs.

### Frontend (Vue.js)

#### SearchView Component

When a speaker is selected, their image is fetched from the `/api/speakers` endpoint and displayed:

```vue
<img
  v-if="selectedSpeakerInfo?.image"
  :src="selectedSpeakerInfo.image"
  :alt="selectedSpeakerInfo.speaker"
  class="w-12 h-12 rounded-full"
/>
```

#### MiniAudioPlayer Component

The player loads speaker metadata dynamically as transcript speakers change:

```vue
<img
  v-if="currentSpeakerImage"
  :src="currentSpeakerImage"
  :alt="currentSpoken.speaker"
  class="w-8 h-8 rounded-full"
/>
```

Speaker metadata files are fetched from `/speakers/{slug}-meta.json` using the `speakersMetaUrl` prop.

#### SpeakerRiver Component

The Speaker River chart displays speaker images in two locations:

**Legend:**
```vue
<img
  v-if="speakersMeta.get(speaker.id)?.image"
  :src="speakersMeta.get(speaker.id)?.image"
  :alt="speaker.name"
  class="w-8 h-8 rounded-full"
/>
```

**Tooltip (via innerHTML):**
```typescript
const speakerMeta = speakersMeta.value.get(speaker.id);
const imageHtml = speakerMeta?.image 
  ? `<img src="${speakerMeta.image}" alt="${speaker.name}" class="w-10 h-10 rounded-full border-2 border-white" />`
  : '';
```

Speaker metadata is loaded asynchronously on component mount from `/speakers/{slug}-meta.json` files.

## Data Flow

1. **Scraping**: `npm run scrape-speakers` fetches images from freakshow.fm/team
2. **Storage**: Images are stored as Podlove CDN URLs in `speakers/*-meta.json`
3. **Frontend Assets**: Meta files must be copied to `frontend/public/speakers/` for web access
4. **Backend**: Rust backend reads meta files and includes image URLs in API responses
5. **Frontend**: Vue components fetch and display images based on selected/current speaker

## Setup

### Copy Speaker Metadata to Frontend

After scraping or updating speaker metadata, copy the files to the frontend public directory:

```bash
mkdir -p frontend/public/speakers
cp speakers/*-meta.json frontend/public/speakers/

# Also copy to freakshow-stats if using that version
mkdir -p freakshow-stats/frontend/public/speakers
cp speakers/*-meta.json freakshow-stats/frontend/public/speakers/
```

This step is required for the MiniAudioPlayer and SpeakerRiver components to load speaker images.

## Image Sources

All speaker images are hosted on the Podlove CDN and follow this format:

```
https://freakshow.fm/podlove/image/{encoded-path}/128/0/0/{slug}
```

Images are 128x128px and optimized for web display.

## Usage

### Scrape Latest Images

```bash
npm run scrape-speakers --force
```

### View in Frontend

1. Navigate to the Search tab
2. Select a speaker from the dropdown
3. The speaker's image appears next to their answer

### Player Subtitles

1. Play an episode with live transcripts enabled
2. Speaker images appear automatically next to each utterance

### Speaker River Chart

1. Navigate to the Speaker River visualization
2. Speaker images appear in the legend on the right side
3. Hover over any speaker's stream to see their image in the tooltip

## Files Modified

- `src/rag_backend.rs`: Added image field and loading logic
- `frontend/src/views/SearchView.vue`: Display speaker image in answers
- `frontend/src/components/MiniAudioPlayer.vue`: Display speaker image in live transcripts
- `frontend/src/components/SpeakerRiver.vue`: Display speaker images in legend and tooltips
- `freakshow-stats/frontend/src/components/SpeakerRiver.vue`: Display speaker images in legend and tooltips
- `frontend/src/components/TopicRiver.vue`: Pass speakers-meta-url prop
- `scrape-speakers.js`: Scrape speaker images from team page

## Related Documentation

- [SPEAKER-RIVER-IMAGES.md](./SPEAKER-RIVER-IMAGES.md) - Detailed implementation of Speaker River images

## Browser Caching

Speaker metadata is cached with `cache: 'force-cache'` to minimize network requests. To see updated images after re-scraping, do a hard refresh (Cmd+Shift+R / Ctrl+Shift+F5).

