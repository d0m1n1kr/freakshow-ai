# Frontend Documentation

This is the Vue.js frontend for the PodInsights podcast analysis tool. See the main [README.md](../README.md) for complete project documentation, installation instructions, and setup.

## Note on Embeddings / RAG storage

The large embedding databases are stored in **LanceDB** under `db/<podcast-id>/lance/` (outside the frontend). The frontend consumes the pre-generated JSON artifacts in `frontend/public/podcasts/<podcast-id>/` (river data, heatmaps, UMAP, etc.).

## Adding a New Visualization

1. **Create data generator** (in project root)
   ```bash
   # Create generate-my-viz.js
   node scripts/generate-my-viz.js
   ```

2. **Copy data to public/**
   ```bash
   cp my-viz-data.json frontend/public/
   ```

3. **Create Vue component**
   ```vue
   <!-- src/components/MyViz.vue -->
   <script setup lang="ts">
   import { ref, onMounted } from 'vue'
   import * as d3 from 'd3'
   
   const data = ref(null)
   
   onMounted(async () => {
     const response = await fetch('/my-viz-data.json')
     data.value = await response.json()
     // D3 visualization code here
   })
   </script>
   ```

4. **Create view**
   ```vue
   <!-- src/views/MyVizView.vue -->
   <template>
     <div class="container mx-auto p-4">
       <h1 class="text-3xl font-bold mb-6">My Visualization</h1>
       <MyViz />
     </div>
   </template>
   ```

5. **Add route**
   ```typescript
   // src/router/index.ts
   {
     path: '/my-viz',
     name: 'my-viz',
     component: () => import('../views/MyVizView.vue')
   }
   ```

6. **Add navigation** (in `App.vue`)

### Internationalization

Add translations in `src/i18n/locales/`:

```json
// de.json
{
  "nav": {
    "myViz": "Meine Visualisierung"
  }
}

// en.json
{
  "nav": {
    "myViz": "My Visualization"
  }
}
```

Use in components:
```vue
<template>
  <h1>{{ $t('nav.myViz') }}</h1>
</template>
```

## Styling

### Tailwind CSS Classes

The project uses Tailwind's utility classes extensively:

```vue
<div class="container mx-auto p-4">
  <h1 class="text-3xl font-bold mb-6 dark:text-white">
    Title
  </h1>
  <div class="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-6">
    Content
  </div>
</div>
```

### Dark Mode

Dark mode is implemented with Tailwind's `dark:` variant:

```vue
<div class="bg-white dark:bg-gray-900">
  <p class="text-gray-900 dark:text-white">Text</p>
</div>
```

The mode is stored in the Pinia store and persisted to localStorage.

### Responsive Design

Use Tailwind's responsive prefixes:

```vue
<div class="w-full md:w-1/2 lg:w-1/3">
  <!-- Full width on mobile, half on tablet, third on desktop -->
</div>
```

## D3.js Integration

### Loading Data

```typescript
import { ref, onMounted } from 'vue'

const data = ref(null)

onMounted(async () => {
  const response = await fetch('/data-file.json')
  data.value = await response.json()
  createVisualization()
})
```

### Creating Visualizations

```typescript
import * as d3 from 'd3'

const svg = d3.select('#viz-container')
  .append('svg')
  .attr('width', width)
  .attr('height', height)

// Add elements, scales, axes, etc.
```

### Reactivity with D3

```typescript
import { watch } from 'vue'

watch(selectedTopic, (newValue) => {
  // Update D3 visualization
  updateHighlight(newValue)
})
```

## Troubleshooting

### Data Files Not Loading

**Error:** `Failed to fetch /topic-river-data.json`

**Solution:** Ensure all data files are in `public/` directory

```bash
# Check files exist
ls -la public/*.json

# Regenerate if missing
cd ..
npm run topic-river
cp topic-river-data.json frontend/public/
```

### Visualization Not Rendering

1. **Check browser console** for JavaScript errors
2. **Verify data format** matches expected structure
3. **Check D3 selectors** point to existing elements
4. **Ensure data loaded** before rendering

### Performance Issues

**Slow rendering**
- Reduce number of displayed elements
- Use canvas instead of SVG
- Implement virtualization
- Optimize D3 code (reduce DOM updates)

**Large bundle size**
- Check bundle analyzer: `npm run build -- --analyze`
- Remove unused dependencies
- Use dynamic imports
- Enable gzip/brotli compression

## CDN Configuration

The frontend supports loading podcast data files from a CDN (e.g., GitHub Pages, GitHub raw URLs, or any CDN) instead of the local server. This is useful for hosting the frontend separately from the data files.

### Configuration

Set the `VITE_CDN_BASE_URL` environment variable to enable CDN mode:

```bash
# Example 1: Use GitHub Pages (recommended)
export VITE_CDN_BASE_URL="https://d0m1n1kr.github.io/pod-insights/public"

# Example 2: Use GitHub raw URLs
export VITE_CDN_BASE_URL="https://raw.githubusercontent.com/d0m1n1kr/pod-insights/refs/heads/main/frontend/public"

# Example 3: Use custom CDN
export VITE_CDN_BASE_URL="https://cdn.yourdomain.com/pod-insights/public"

# Or create a .env file in the frontend directory
echo "VITE_CDN_BASE_URL=https://d0m1n1kr.github.io/pod-insights/public" > frontend/.env
```

### GitHub Pages Setup

For detailed instructions on setting up GitHub Pages as a CDN, see [GitHub Pages Setup Guide](../docs/GITHUB-PAGES-SETUP.md).

Quick setup:
1. Enable GitHub Pages in repository settings (Settings → Pages → Source: GitHub Actions)
2. The included `.github/workflows/deploy-pages.yml` will automatically deploy `frontend/public/` to GitHub Pages
3. Files will be available at `https://d0m1n1kr.github.io/pod-insights/public/`
4. Set `VITE_CDN_BASE_URL` to the GitHub Pages URL

### How It Works

When `VITE_CDN_BASE_URL` is set:
- All podcast files (episodes.json, episode details, speaker stats, etc.) are loaded from the CDN
- The `podcasts.json` file is also loaded from the CDN
- All paths are automatically prefixed with the CDN base URL

When `VITE_CDN_BASE_URL` is not set (default):
- Files are loaded from the local server using relative paths (e.g., `/podcasts/freakshow/episodes.json`)

### Example URLs

**Local mode (default):**
- `/podcasts/freakshow/episodes.json`
- `/podcasts/freakshow/episodes/123.json`

**CDN mode (with VITE_CDN_BASE_URL set):**
- `https://raw.githubusercontent.com/.../podcasts/freakshow/episodes.json`
- `https://raw.githubusercontent.com/.../podcasts/freakshow/episodes/123.json`

### Building with CDN

```bash
# Set environment variable and build
VITE_CDN_BASE_URL="https://raw.githubusercontent.com/d0m1n1kr/pod-insights/refs/heads/main/frontend/public" npm run build

# Or use .env file
echo "VITE_CDN_BASE_URL=https://raw.githubusercontent.com/d0m1n1kr/pod-insights/refs/heads/main/frontend/public" > .env
npm run build
```

## See Also

- Main README: `../README.md`
- Backend documentation: Various guides in project root
- Data generation scripts: Project root directory
