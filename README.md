# Freak Show Podcast Analysis & Visualization

A comprehensive tool suite for scraping, analyzing, and visualizing the [Freak Show podcast](https://freakshow.fm) archive. This project extracts episode metadata, transcripts, and shownotes, then uses AI-powered topic extraction and clustering to create interactive visualizations showing the evolution of topics, speakers, and themes across 300+ episodes.

## Features

### Data Collection
- ✅ Scrapes 300+ episodes from the Freak Show archive
- ✅ Extracts metadata (title, date, duration, speakers, chapters)
- ✅ Extracts transcripts with timestamps and speaker attribution
- ✅ Extracts shownotes with links and categorization
- ✅ Concurrent processing with automatic browser restart

### AI-Powered Analysis
- ✅ LLM-based topic extraction from transcripts
- ✅ Semantic embedding generation for topics
- ✅ Hierarchical clustering (256 topic clusters → 12 categories)
- ✅ High-performance Rust implementation (10x faster than JavaScript)
- ✅ Multiple clustering algorithms (weighted, ward, average, complete, single)

### Interactive Visualizations
- ✅ **Topic River Chart**: Evolution of 256 topics over time
- ✅ **Category River Chart**: High-level overview with 12 categories
- ✅ **Speaker River Chart**: Speaker participation over time
- ✅ **UMAP Scatter Plot**: 2D visualization of topic embeddings
- ✅ **Heatmaps**: Speaker-topic, speaker-speaker, cluster relationships
- ✅ **Duration Analysis**: Episode length patterns by year/day of week
- ✅ Multilingual interface (German, English, French)

## Quick Start

### Prerequisites

```bash
# Node.js 18+ for scraping and data processing
node --version

# Rust (optional, for 10x faster clustering)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Installation

```bash
# Clone repository
git clone <repository-url>
cd freakshow

# Install dependencies
npm install

# Configure API keys (copy and edit)
cp settings.example.json settings.json
# Add your OpenAI API key (or alternative LLM provider)
```

## Step-by-Step Guide

### Phase 1: Data Collection

#### 1. Scrape Episode List
Extract basic metadata for all episodes:

```bash
npm run scrape
```

**Output:** `episodes/1.json`, `episodes/2.json`, ... (300 files)

**Time:** ~5 minutes

#### 2. Scrape Episode Details
Extract transcripts, shownotes, and descriptions:

```bash
npm run scrape-details
```

**Output:** 
- Transcripts: `episodes/1-ts.json`, `episodes/2-ts.json`, ...
- Shownotes: `episodes/1-sn.json`, `episodes/2-sn.json`, ...
- Descriptions: `episodes/1-text.html`, `episodes/2-text.html`, ...

**Time:** ~30-60 minutes (concurrent processing, 3 episodes at a time)

#### 3. Scrape Legacy Shownotes (Episodes 89-190)
Extract OSF-format shownotes for older episodes:

```bash
npm run scrape-osf
```

**Output:** `episodes/89-osf.json`, ..., `episodes/190-osf.json`

**Time:** ~15 minutes

**Total Data:** 959 files (~100MB)

### Phase 2: Topic Extraction & Analysis

#### 4. Extract Topics with LLM
Identify main topics from episode transcripts:

```bash
# Test with a single episode first
npm run extract-topics 296

# Process all episodes
npm run extract-topics -- --all
```

**Output:** `episodes/1-topics.json`, `episodes/2-topics.json`, ...

**Time:** ~2-4 hours for all episodes

**Cost:** ~$5-10 (with gpt-4o-mini)

**Configuration:** Edit `settings.json` to customize:
```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "YOUR_API_KEY",
    "temperature": 0.3
  },
  "topicExtraction": {
    "maxTopics": 10,
    "language": "de"
  }
}
```

#### 5. Normalize Topics
Clean up and standardize extracted topics:

```bash
npm run normalize-topics
```

**Output:** Updates topic files in place

**Time:** ~30 seconds

#### 6. Create Embeddings
Generate semantic embeddings for all topics:

```bash
npm run create-embeddings
```

**Output:** `topic-embeddings.json` (~500MB)

**Time:** ~10-15 minutes

**Cost:** ~$2-3 (OpenAI text-embedding-3-large)

#### 7. Cluster Topics (Choose one)

**Option A: Rust (Recommended - 10x faster)**
```bash
./build-and-run.sh
```

**Option B: JavaScript**
```bash
npm run cluster-topics
```

**Output:** `topic-taxonomy.json` (256 clusters with names)

**Time:** 
- Rust: ~20-30 seconds + LLM naming (~2 minutes)
- JavaScript: ~3-5 minutes + LLM naming (~2 minutes)

**Cost:** ~$0.50 for LLM-based cluster naming

**What it does:**
1. Computes distance matrix from embeddings
2. Performs hierarchical clustering to group similar topics
3. Names clusters using LLM or heuristics
4. Detects outliers

#### 8. Create Category Groups
Group 256 clusters into high-level categories:

```bash
npm run cluster-categories
```

**Output:** `topic-categories.json` (12 categories)

**Time:** ~40 seconds

**Cost:** ~$0.10

### Phase 3: Generate Visualizations

#### 9. Generate All Data Files

Run all generation scripts to create visualization data:

```bash
# River charts
npm run topic-river          # Topic evolution over time
npm run category-river       # Category overview
npm run generate-speaker-river  # Speaker participation

# UMAP scatter plot
npm run generate-umap        # 2D topic visualization

# Heatmaps
node generate-speaker-category-heatmap.js   # Speaker-topic relationships
node generate-speaker-cluster-heatmap.js     # Speaker-cluster relationships
node generate-speaker-speaker-heatmap.js     # Speaker co-occurrence
node generate-cluster-cluster-heatmap.js     # Cluster relationships

# Duration analysis
node generate-year-duration-heatmap.js       # Duration by year
node generate-dayofweek-duration-heatmap.js  # Duration by day of week
```

**Output:** Multiple JSON files in project root

**Time:** ~2-3 minutes total

#### 10. Copy Data to Frontend

```bash
# Copy all generated data files to frontend
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

# Copy episodes directory (for episode detail links)
cp -r episodes frontend/public/
```

Or use the sync script if available:
```bash
./sync.sh
```

### Phase 4: Run Frontend

#### 11. Install Frontend Dependencies

```bash
cd frontend
npm install
```

#### 12. Start Development Server

```bash
npm run dev
```

**Access:** http://localhost:5173

#### 13. Build for Production

```bash
npm run build
```

**Output:** `frontend/dist/` (static files ready for deployment)

## Project Structure

```
freakshow/
├── episodes/              # Scraped episode data (959 files)
│   ├── 1.json            # Episode metadata
│   ├── 1-ts.json         # Transcript
│   ├── 1-sn.json         # Shownotes
│   └── 1-text.html       # Description
│
├── scrape.js             # Episode list scraper
├── scrape-details.js     # Transcript/shownotes scraper
├── scrape-osf.js         # Legacy shownotes scraper
│
├── extract-topics.js     # LLM topic extraction
├── normalize-topics.js   # Topic cleanup
├── create-embeddings.js  # Generate embeddings
│
├── cluster-topics.js     # JavaScript clustering
├── src/cluster_topics.rs # Rust clustering (10x faster)
├── cluster-categories.js # Category grouping
│
├── generate-*.js         # Visualization data generators
│
├── frontend/             # Vue.js visualization app
│   ├── src/
│   │   ├── views/        # Main view components
│   │   ├── components/   # Reusable components
│   │   └── i18n/         # Translations (de, en, fr)
│   └── public/           # Static data files
│
├── settings.json         # Configuration (API keys, etc.)
└── README.md            # This file
```

## Configuration

### LLM Providers

Edit `settings.json` to configure your preferred LLM:

**OpenAI (Default)**
```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "apiKey": "sk-...",
    "baseURL": "https://api.openai.com/v1"
  }
}
```

**Anthropic Claude**
```json
{
  "llm": {
    "provider": "anthropic",
    "model": "claude-3-haiku-20240307",
    "apiKey": "sk-ant-..."
  }
}
```

**OpenRouter (Access multiple models)**
```json
{
  "llm": {
    "provider": "openrouter",
    "model": "anthropic/claude-3-haiku",
    "apiKey": "sk-or-...",
    "baseURL": "https://openrouter.ai/api/v1"
  }
}
```

**Ollama (Local/Free)**
```json
{
  "llm": {
    "provider": "ollama",
    "model": "llama2",
    "baseURL": "http://localhost:11434/api"
  }
}
```

### Clustering Options

```json
{
  "clustering": {
    "numClusters": 256,           // Number of topic clusters
    "linkageMethod": "weighted",   // weighted, ward, average, complete, single
    "outlierThreshold": 0.15,      // Distance threshold for outlier detection
    "useRelevanceWeighting": true  // Weight by episode frequency
  },
  "categoryGrouping": {
    "categories": 12               // Number of high-level categories
  }
}
```

## Output Files

### Episode Data
- `episodes/<N>.json` - Episode metadata
- `episodes/<N>-ts.json` - Transcript with timestamps
- `episodes/<N>-sn.json` - Modern shownotes (episodes 191+)
- `episodes/<N>-osf.json` - Legacy OSF shownotes (episodes 89-190)
- `episodes/<N>-text.html` - Episode description
- `episodes/<N>-topics.json` - Extracted topics

### Analysis Results
- `topic-embeddings.json` - Semantic embeddings for all topics (~500MB)
- `topic-taxonomy.json` - 256 topic clusters with metadata
- `topic-taxonomy-detailed.json` - Extended cluster information
- `topic-categories.json` - 12 high-level categories

### Visualization Data
- `topic-river-data.json` - Topic evolution over time
- `category-river-data.json` - Category overview
- `speaker-river-data.json` - Speaker participation
- `topic-umap-data.json` - 2D UMAP projection
- `speaker-category-heatmap.json` - Speaker-topic matrix
- `speaker-cluster-heatmap.json` - Speaker-cluster matrix
- `speaker-speaker-heatmap.json` - Speaker co-occurrence
- `cluster-cluster-heatmap.json` - Cluster relationships
- `year-duration-heatmap.json` - Duration patterns by year
- `dayofweek-duration-heatmap.json` - Duration patterns by weekday

## Cost Estimation

| Phase | Service | Approx. Cost |
|-------|---------|--------------|
| Topic Extraction | OpenAI API (gpt-4o-mini) | $5-10 |
| Embeddings | OpenAI API (text-embedding-3-large) | $2-3 |
| Cluster Naming | OpenAI API (gpt-4o-mini, 256 clusters) | $0.50 |
| Category Naming | OpenAI API (gpt-4o-mini, 12 categories) | $0.10 |
| **Total** | | **~$8-14** |

**Note:** Using local models (Ollama) reduces cost to ~$0 but may affect quality.

## Performance

| Operation | JavaScript | Rust | Speedup |
|-----------|-----------|------|---------|
| Distance Matrix (4500 topics) | ~20s | ~2s | 10x |
| Clustering (→256 clusters) | ~180s | ~15s | 12x |
| Total (excl. LLM) | ~3-5 min | ~20-30s | ~10x |

## Documentation

- `RUST-CLUSTERING.md` - Detailed Rust implementation guide
- `CATEGORY-RIVER-GUIDE.md` - Category grouping explanation
- `RIVER-CHARTS-OVERVIEW.md` - Comparison of all chart types
- `VISUAL-EXPLANATION.md` - Visual guide to the hierarchy
- `DURATION-HEATMAPS.md` - Duration analysis documentation
- `UMAP-FEATURE.md` - UMAP visualization guide
- `frontend/README.md` - Frontend-specific documentation

## Troubleshooting

### API Rate Limits
If clustering hangs during LLM naming:
- The Rust version includes automatic retry with exponential backoff
- Configure delays in `settings.json`:
  ```json
  {
    "topicExtraction": {
      "requestDelayMs": 2000,
      "maxRetries": 5
    }
  }
  ```

### Out of Memory
For large datasets, increase Node.js memory:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run create-embeddings
```

### Missing Data Files
Ensure all steps are completed in order. Each phase depends on outputs from previous phases.

### Rust Build Issues
```bash
# Update Rust toolchain
rustup update

# Clean and rebuild
cargo clean
cargo build --release
```

## Development

### Running Tests
```bash
# Backend
npm test

# Frontend
cd frontend
npm run test
```

### Code Style
```bash
# Format frontend code
cd frontend
npm run format
```

## Contributing

This is a personal analysis project, but improvements are welcome! Focus areas:
- Additional visualization types
- Performance optimizations
- Support for other podcast formats
- Better clustering algorithms

## License

This project is for personal/educational use. The Freak Show podcast content belongs to its creators.

## Credits

- **Podcast:** [Freak Show](https://freakshow.fm) by Tim Pritlove and guests
- **Technologies:** Node.js, Rust, Vue.js, D3.js, Puppeteer, OpenAI API
- **Inspiration:** Exploring podcast evolution through data visualization

## See Also

- [Freak Show Official Website](https://freakshow.fm)
- [Metaebene Podcast Network](https://metaebene.me)
