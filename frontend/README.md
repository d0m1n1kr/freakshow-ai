# Freak Show Visualization Frontend

An interactive web application for visualizing the Freak Show podcast's topic evolution, speaker participation, and thematic patterns using Vue.js and D3.js.

## Features

### Interactive Visualizations

**River Charts**
- 📊 **Topic River** - Evolution of 256 topic clusters over time
- 🎯 **Category River** - High-level overview with 12 thematic categories
- 🎙️ **Speaker River** - Speaker participation across episodes

**Scatter Plots**
- 🔍 **UMAP Plot** - 2D visualization of topic embeddings colored by cluster

**Heatmaps**
- 🎨 **Speaker-Category Heatmap** - Which speakers discuss which topics
- 🎨 **Speaker-Cluster Heatmap** - Detailed speaker-topic relationships
- 🎨 **Speaker-Speaker Heatmap** - Co-occurrence patterns
- 🎨 **Cluster-Cluster Heatmap** - Topic relationships

**Duration Analysis**
- ⏱️ **Year Duration Heatmap** - Episode length trends by year
- 📅 **Day of Week Heatmap** - Duration patterns by weekday

### User Experience
- ✨ **Hover effects** - Highlight and explore individual elements
- 🖱️ **Click interactions** - Select topics/speakers for detailed information
- 📊 **Adjustable displays** - Slider to control number of visible items
- 🌐 **Multilingual** - German, English, French interfaces
- 📱 **Responsive design** - Works on desktop, tablet, and mobile
- 🌙 **Dark mode** - Automatic theme adaptation
- 🔗 **Episode links** - Direct links to episode details

## Quick Start

### Prerequisites

```bash
# Node.js 18+ required
node --version
```

### Installation

```bash
# From project root
cd frontend

# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev

# Access at http://localhost:5173
```

### Production Build

```bash
# Build for production
npm run build

# Output in dist/ folder
# Serve with any static file server
```

## Data Files

The frontend expects these files in the `public/` directory:

### Required Files
```
public/
├── topic-river-data.json              # Topic evolution data
├── category-river-data.json           # Category overview data
├── speaker-river-data.json            # Speaker participation data
├── topic-umap-data.json              # UMAP scatter plot data
├── topic-taxonomy.json               # Topic cluster metadata
├── topic-taxonomy-detailed.json      # Extended cluster info
├── speaker-category-heatmap.json     # Speaker-topic matrix
├── speaker-cluster-heatmap.json      # Speaker-cluster matrix
├── speaker-speaker-heatmap.json      # Speaker co-occurrence
├── cluster-cluster-heatmap.json      # Cluster relationships
├── year-duration-heatmap.json        # Duration by year
├── dayofweek-duration-heatmap.json   # Duration by weekday
└── episodes/                          # Episode detail files
    ├── 1.json
    ├── 1-ts.json
    └── ...
```

### Generating Data Files

From the project root directory:

```bash
# 1. Generate all visualization data
npm run topic-river
npm run category-river
node generate-speaker-river.js
node generate-topic-umap.js
node generate-speaker-category-heatmap.js
node generate-speaker-cluster-heatmap.js
node generate-speaker-speaker-heatmap.js
node generate-cluster-cluster-heatmap.js
node generate-year-duration-heatmap.js
node generate-dayofweek-duration-heatmap.js

# 2. Copy to frontend public folder
cp topic-river-data.json frontend/public/
cp category-river-data.json frontend/public/
cp speaker-river-data.json frontend/public/
cp topic-umap-data.json frontend/public/
cp topic-taxonomy.json frontend/public/
cp topic-taxonomy-detailed.json frontend/public/
cp speaker-category-heatmap.json frontend/public/
cp speaker-cluster-heatmap.json frontend/public/
cp speaker-speaker-heatmap.json frontend/public/
cp cluster-cluster-heatmap.json frontend/public/
cp year-duration-heatmap.json frontend/public/
cp dayofweek-duration-heatmap.json frontend/public/
cp -r episodes frontend/public/

# Or use sync script if available
./sync.sh
```

## Technology Stack

- **Vue.js 3** - Progressive JavaScript framework with Composition API
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Tailwind CSS 4** - Utility-first CSS framework with dark mode
- **D3.js** - Data visualization library
- **Vue Router** - Client-side routing
- **Vue I18n** - Internationalization
- **UMAP-js** - Dimensionality reduction for scatter plots

## Project Structure

```
frontend/
├── src/
│   ├── App.vue                    # Root component
│   ├── main.ts                    # Application entry point
│   ├── style.css                  # Global styles
│   │
│   ├── components/
│   │   ├── TopicRiver.vue        # Topic/Category river chart
│   │   ├── SpeakerRiver.vue      # Speaker river chart
│   │   └── LanguageSelector.vue  # Language switcher
│   │
│   ├── views/
│   │   ├── TopicsView.vue        # Topic river page
│   │   ├── CategoriesView.vue    # Category river page
│   │   ├── SpeakersView.vue      # Speaker river page
│   │   ├── UmapView.vue          # UMAP scatter plot page
│   │   ├── HeatmapView.vue       # Speaker-category heatmap
│   │   ├── ClusterHeatmapView.vue        # Speaker-cluster heatmap
│   │   ├── SpeakerSpeakerHeatmapView.vue # Speaker co-occurrence
│   │   ├── ClusterClusterHeatmapView.vue # Cluster relationships
│   │   ├── DurationHeatmapView.vue       # Duration analysis
│   │   └── AboutView.vue         # About page
│   │
│   ├── router/
│   │   └── index.ts              # Route definitions
│   │
│   ├── stores/
│   │   └── settings.ts           # Pinia store for app state
│   │
│   ├── i18n/
│   │   ├── index.ts              # i18n configuration
│   │   └── locales/
│   │       ├── de.json           # German translations
│   │       ├── en.json           # English translations
│   │       └── fr.json           # French translations
│   │
│   └── types.ts                  # TypeScript type definitions
│
├── public/                       # Static assets and data files
├── index.html                    # HTML entry point
├── vite.config.ts               # Vite configuration
├── tailwind.config.js           # Tailwind CSS config
├── tsconfig.json                # TypeScript config
└── package.json                 # Dependencies and scripts
```

## Configuration

### Vite Configuration

The `vite.config.ts` includes:
- Vue plugin
- Path aliases (`@` → `src`)
- Build optimizations

### Tailwind Configuration

The `tailwind.config.js` includes:
- Dark mode support (class-based)
- Custom color palette
- Responsive breakpoints

### TypeScript Configuration

Three config files:
- `tsconfig.json` - Base configuration
- `tsconfig.app.json` - Application code
- `tsconfig.node.json` - Build tools

## Development

### Available Scripts

```bash
# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview

# Type check
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

### Adding a New Visualization

1. **Create data generator** (in project root)
   ```bash
   # Create generate-my-viz.js
   node generate-my-viz.js
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

## Performance Optimization

### Lazy Loading Routes

All routes use lazy loading:
```typescript
component: () => import('../views/MyView.vue')
```

### Data Caching

Data files are fetched once and cached by the browser.

### Large Dataset Handling

For large visualizations:
1. Use `requestAnimationFrame` for smooth updates
2. Limit rendered elements with pagination/filtering
3. Use Canvas instead of SVG for >10k elements
4. Implement virtual scrolling for long lists

## Deployment

### Build for Production

```bash
npm run build
```

This creates optimized files in `dist/`:
- Minified JavaScript bundles
- Optimized CSS
- Compressed assets
- Source maps (for debugging)

### Hosting Options

**Static Hosting (Recommended)**
- Netlify: Drag & drop `dist/` folder
- Vercel: Connect GitHub repo
- GitHub Pages: `npm run build && gh-pages -d dist`
- AWS S3 + CloudFront
- Firebase Hosting

**Example: Netlify**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
cd dist
netlify deploy --prod
```

**Example: Custom Server (nginx)**
```nginx
server {
  listen 80;
  server_name your-domain.com;
  root /path/to/frontend/dist;
  
  location / {
    try_files $uri $uri/ /index.html;
  }
}
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

### Build Errors

**TypeScript errors**
```bash
npm run type-check
# Fix reported type issues
```

**Vite errors**
```bash
# Clear cache and rebuild
rm -rf node_modules/.vite
npm run build
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

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

**Note:** Modern JavaScript (ES2020+) and CSS features are used. No IE11 support.

## Contributing

### Code Style

- Use TypeScript strict mode
- Follow Vue 3 Composition API conventions
- Use Tailwind classes instead of custom CSS
- Keep components under 500 lines
- Write descriptive commit messages

### Component Guidelines

1. **Single responsibility** - One component, one purpose
2. **Props validation** - Define TypeScript interfaces
3. **Emits declaration** - Declare all emitted events
4. **Accessibility** - Add ARIA labels and keyboard support
5. **Performance** - Use computed properties and watchers wisely

## Resources

### Documentation
- [Vue.js 3](https://vuejs.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [D3.js](https://d3js.org/)
- [TypeScript](https://www.typescriptlang.org/)

### Learning
- [Vue Mastery](https://www.vuemastery.com/)
- [D3 in Depth](https://www.d3indepth.com/)
- [Observable](https://observablehq.com/) - D3 examples

## License

This frontend is part of the Freak Show analysis project. See main README for details.

## See Also

- Main README: `../README.md`
- Backend documentation: Various guides in project root
- Data generation scripts: Project root directory
