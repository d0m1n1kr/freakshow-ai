# Heatmap Speaker Images Integration

This document describes the implementation of speaker images in the heatmap tooltips.

## Overview

Speaker profile images now appear in tooltips when hovering over cells in:
1. **Speaker × Speaker Heatmap**: Shows images for both speakers in the relationship
2. **Speaker × Cluster Heatmap**: Shows image for the speaker

## Implementation Details

### Components Modified

#### SpeakerSpeakerHeatmapView.vue

**Changes:**

1. **Added Speaker Metadata Loading**
   - Created `SpeakerMeta` type to store speaker name, slug, and image URL
   - Added `speakersMeta` reactive map to cache loaded metadata
   - Implemented `speakerNameToSlug()` helper to convert names to slugs
   - Implemented `loadSpeakerMeta()` function to fetch individual speaker metadata
   - Implemented `loadAllSpeakerMeta()` to load all speaker metadata after data loads

2. **Enhanced Tooltip**
   - Modified tooltip HTML to include images for both speakers
   - Uses 32px rounded circles with white borders
   - Falls back gracefully if no image is available (no image shown, text only)
   - Images are displayed inline with speaker names

3. **Added Interaction Instructions**
   - Internationalized instructions below the heatmap
   - Explains hover and click interactions
   - Available in German, English, and French

**Tooltip Structure:**
```typescript
const speaker1Meta = speakersMeta.value.get(row.speaker1Name || '');
const speaker2Meta = speakersMeta.value.get(value.speaker2Name || '');

const speaker1ImageHtml = speaker1Meta?.image
  ? `<img src="${speaker1Meta.image}" alt="${row.speaker1Name}" class="w-8 h-8 rounded-full border-2 border-white inline-block mr-2" />`
  : '';
const speaker2ImageHtml = speaker2Meta?.image
  ? `<img src="${speaker2Meta.image}" alt="${value.speaker2Name}" class="w-8 h-8 rounded-full border-2 border-white inline-block mr-2" />`
  : '';
```

#### ClusterHeatmapView.vue

**Changes:**

1. **Added Speaker Metadata Loading** (same as SpeakerSpeakerHeatmapView)
   - Identical metadata loading infrastructure
   - Loads speaker metadata after variant data is loaded

2. **Enhanced Tooltip**
   - Modified tooltip HTML to include speaker image
   - Single image for the speaker (Y-axis)
   - Cluster names remain text-only (no images for clusters)

3. **Added Interaction Instructions**
   - Internationalized instructions below the heatmap
   - Explains hover and click interactions
   - Available in German, English, and French

**Tooltip Structure:**
```typescript
const speakerMeta = speakersMeta.value.get(row.speakerName || '');
const speakerImageHtml = speakerMeta?.image
  ? `<img src="${speakerMeta.image}" alt="${row.speakerName}" class="w-8 h-8 rounded-full border-2 border-white inline-block mr-2" />`
  : '';
```

## Data Flow

### SpeakerSpeakerHeatmapView

1. **Component Mount**: Fetches `/speaker-speaker-heatmap.json`
2. **Data Load**: After heatmap data loads, triggers `loadAllSpeakerMeta()`
3. **Metadata Loading**: Fetches metadata for all unique speakers in parallel
4. **Tooltip Display**: On hover, retrieves images from cache and displays in tooltip

### ClusterHeatmapView

1. **Component Mount**: Loads variant data via `loadVariantData('speaker-cluster-heatmap.json')`
2. **Data Load**: After heatmap data loads, triggers `loadAllSpeakerMeta()`
3. **Metadata Loading**: Fetches metadata for all unique speakers in parallel
4. **Tooltip Display**: On hover, retrieves speaker image from cache and displays in tooltip

## Helper Functions

### speakerNameToSlug()

Converts speaker names to URL-friendly slugs:

```typescript
function speakerNameToSlug(name: string): string {
  return name.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
```

Examples:
- "Tim Pritlove" → "tim-pritlove"
- "Max von Webel" → "max-von-webel"
- "Björn Reimer" → "bjorn-reimer"

## Internationalization

Interaction instructions are displayed below each heatmap in the user's selected language:

**German:**
- "Interaktion: Bewege die Maus über eine Zelle, um Details zu sehen. Klicke auf eine Zelle, um die Episoden-Liste anzuzeigen."

**English:**
- "Interaction: Hover over a cell to see details. Click on a cell to display the episode list."

**French:**
- "Interaction: Survolez une cellule pour voir les détails. Cliquez sur une cellule pour afficher la liste des épisodes."

### Translation Keys

```json
{
  "common": {
    "interaction": "Interaction" // "Interaktion" / "Interaction"
  },
  "heatmap": {
    "interaction": {
      "hover": "Hover over a cell to see details.",
      "click": "Click on a cell to display the episode list."
    }
  }
}
```

## Visual Behavior

### Speaker × Speaker Heatmap Tooltip
- **With Images**: Shows two 32px rounded images, one for each speaker
- **Without Images**: Shows only text, no placeholders
- **Mixed**: Shows available images, omits missing ones

### Speaker × Cluster Heatmap Tooltip
- **With Image**: Shows 32px rounded image for the speaker
- **Without Image**: Shows only text, no placeholder
- Cluster name always shown as text (clusters don't have images)

### Tooltip Layout
Both tooltips use a vertical layout with:
- Line 1: Speaker 1 (with optional image) in bold
- Line 2: Speaker 2 or Cluster name (with optional image for speaker)
- Line 3: Episode count

## File Locations

### Source Files Modified
- `/frontend/src/views/SpeakerSpeakerHeatmapView.vue`
- `/frontend/src/views/ClusterHeatmapView.vue`
- `/frontend/src/views/ClusterClusterHeatmapView.vue` (interaction instructions only)
- `/frontend/src/views/DurationHeatmapView.vue` (interaction instructions only)
- `/frontend/src/i18n/locales/de.json` (added heatmap interaction translations)
- `/frontend/src/i18n/locales/en.json` (added heatmap interaction translations)
- `/frontend/src/i18n/locales/fr.json` (added heatmap interaction translations)

### Speaker Metadata Files
- `/frontend/public/speakers/*-meta.json` (required at runtime)

### Source Data
- `/speakers/*-meta.json` (source of truth)

## Performance Considerations

1. **Lazy Loading**: Metadata loads after heatmap data, not blocking initial render
2. **Caching**: Browser cache (`force-cache`) prevents redundant network requests
3. **Parallel Loading**: All speaker metadata files load simultaneously
4. **No Blocking**: UI remains interactive while images load
5. **Efficient Lookups**: Map-based cache for O(1) image lookups during hover

## Browser Compatibility

- All modern browsers (Chrome, Firefox, Safari, Edge)
- Fallback behavior for missing images works in all browsers
- Uses standard inline CSS for tooltip styling (universally supported)

## Testing

To test the implementation:

1. Navigate to Speaker × Speaker Heatmap
2. Hover over cells with known speakers (e.g., Tim Pritlove, roddi)
3. Verify images appear for speakers with metadata files
4. Verify graceful fallback for speakers without images

5. Navigate to Speaker × Cluster Heatmap
6. Hover over cells in speaker rows
7. Verify speaker images appear in tooltips
8. Verify cluster names remain text-only

## Future Enhancements

Possible improvements:
- Add loading placeholders/skeletons for images
- Implement preloading for better perceived performance
- Add image caching in localStorage
- Show speaker images in Y-axis labels (currently text-only)
- Add animations when images load

## Related Documentation

- [SPEAKER-IMAGES.md](./SPEAKER-IMAGES.md) - Overall speaker images system
- [SPEAKER-RIVER-IMAGES.md](./SPEAKER-RIVER-IMAGES.md) - Speaker River implementation
- [SPEAKER-METADATA-SCRAPER.md](./SPEAKER-METADATA-SCRAPER.md) - Metadata scraping

