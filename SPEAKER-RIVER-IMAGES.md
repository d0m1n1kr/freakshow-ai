# Speaker River: Speaker Images Integration

This document describes the implementation of speaker images in the Speaker River visualization.

## Overview

Speaker profile images are now displayed in two places on the Speaker River chart:
1. **Legend**: Each speaker entry shows their profile image (if available) instead of just a colored square
2. **Tooltip**: When hovering over a speaker's stream, their image appears in the tooltip alongside their name and statistics

## Implementation Details

### Frontend Components

#### SpeakerRiver.vue (both `/frontend` and `/freakshow-stats`)

**Changes:**

1. **Added Speaker Metadata Loading**
   - Created `SpeakerMeta` type to store speaker name, slug, and image URL
   - Added `speakersMeta` reactive map to cache loaded metadata
   - Implemented `loadSpeakerMeta()` function to fetch individual speaker metadata
   - Implemented `loadAllSpeakerMeta()` to load all speaker metadata on mount

2. **Enhanced Tooltip**
   - Modified tooltip HTML to include speaker image
   - Uses flexbox layout with image on the left and text on the right
   - Falls back gracefully if no image is available (no image shown, text only)
   - Image is displayed as a 40px rounded circle with white border

3. **Enhanced Legend**
   - Replaced colored square with speaker image (32px rounded circle)
   - Falls back to colored circle with speaker initial if no image is available
   - Maintains consistent sizing and alignment with improved visual hierarchy

### Data Flow

1. **Component Mount**: 
   - SpeakerRiver component loads speaker river data from JSON
   - Immediately triggers `loadAllSpeakerMeta()` to fetch all speaker metadata in parallel

2. **Metadata Loading**:
   - Each speaker's metadata is fetched from `/speakers/{slug}-meta.json`
   - Uses `cache: 'force-cache'` for optimal performance
   - Silent failure if metadata file doesn't exist (graceful fallback)

3. **Display**:
   - Legend items reactively show images as metadata loads
   - Tooltip dynamically includes images based on hovered speaker
   - No blocking or loading states - images appear as they become available

## File Locations

### Source Files Modified
- `/frontend/src/components/SpeakerRiver.vue`
- `/freakshow-stats/frontend/src/components/SpeakerRiver.vue`

### Speaker Metadata Files
- `/frontend/public/speakers/*-meta.json`
- `/freakshow-stats/frontend/public/speakers/*-meta.json`

### Source Data
- `/speakers/*-meta.json` (source of truth, scraped from freakshow.fm)

## Image Sources

All speaker images are hosted on the Podlove CDN and follow this format:
```
https://freakshow.fm/podlove/image/{encoded-path}/128/0/0/{slug}
```

Images are 128x128px and optimized for web display.

## Setup & Maintenance

### Initial Setup (Already Done)

1. Copy speaker metadata to frontend public directories:
```bash
cp speakers/*-meta.json frontend/public/speakers/
cp speakers/*-meta.json freakshow-stats/frontend/public/speakers/
```

### Updating Speaker Images

1. Re-scrape speaker metadata:
```bash
npm run scrape-speakers --force
```

2. Copy updated files to frontend:
```bash
cp speakers/*-meta.json frontend/public/speakers/
cp speakers/*-meta.json freakshow-stats/frontend/public/speakers/
```

3. Hard refresh browser to clear cache (Cmd+Shift+R / Ctrl+Shift+F5)

## Visual Behavior

### Legend
- **With Image**: Shows 32x32px rounded profile photo with subtle border
- **Without Image**: Shows 32x32px colored circle with speaker's initial in white

### Tooltip
- **With Image**: Shows 40x40px rounded profile photo with white border on the left
- **Without Image**: Shows only the text information (no placeholder)

### Responsive Design
- Images scale appropriately on mobile devices
- Legend remains scrollable with images
- Tooltip positioning accounts for image size

## Browser Compatibility

- All modern browsers (Chrome, Firefox, Safari, Edge)
- Fallback behavior for missing images works in all browsers
- Uses standard CSS flexbox for layout (universally supported)

## Performance Considerations

1. **Lazy Loading**: Metadata is loaded asynchronously after initial render
2. **Caching**: Browser cache (`force-cache`) prevents redundant network requests
3. **Parallel Loading**: All speaker metadata files load simultaneously
4. **No Blocking**: UI remains interactive while images load
5. **Small File Sizes**: Metadata files are small JSON files (~1-2KB each)
6. **CDN Images**: Images served from Podlove CDN for optimal delivery

## Future Enhancements

Possible improvements for future iterations:
- Add loading placeholders/skeletons for images
- Implement image preloading strategy
- Add error state indicators for failed image loads
- Cache speaker metadata in localStorage for faster subsequent visits
- Progressive enhancement with larger images on hover

## Related Documentation

- [SPEAKER-IMAGES.md](./SPEAKER-IMAGES.md) - Overall speaker images system
- [SPEAKER-METADATA-SCRAPER.md](./SPEAKER-METADATA-SCRAPER.md) - Scraping speaker data
- [RIVER-CHARTS-OVERVIEW.md](./RIVER-CHARTS-OVERVIEW.md) - River chart system overview

