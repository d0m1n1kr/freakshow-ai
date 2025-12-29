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
- ✅ Multiple clustering algorithms:
  - **V1**: Hierarchical Agglomerative Clustering (HAC) with fixed clusters
  - **V2**: HDBSCAN with automatic cluster detection
- ✅ Dimensionality reduction (Random Projection for V2)
- ✅ High-performance Rust implementation (10x faster than JavaScript)
- ✅ Variant system for comparing different clustering approaches
- ✅ Multiple linkage methods (weighted, ward, average, complete, single)
- ✅ LLM-based cluster naming with heuristic fallback

### Interactive Visualizations
- ✅ **Variant Selector**: Switch between different clustering variants
- ✅ **Topic River Chart**: Evolution of topics over time
- ✅ **Category River Chart**: High-level overview (legacy)
- ✅ **Speaker River Chart**: Speaker participation over time
- ✅ **UMAP Scatter Plot**: 2D visualization of topic embeddings
- ✅ **Heatmaps**: 
  - Speaker × Cluster relationships
  - Cluster × Cluster co-occurrence
  - Speaker × Speaker co-occurrence (legacy)
- ✅ **Duration Analysis**: Episode length patterns by year/day of week
- ✅ **Variant Info Panel**: Displays details about the active clustering configuration
- ✅ Multilingual interface (German, English, French)
- ✅ Dark mode support with persistent settings

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

#### 7. Cluster Topics with Variants

The project now supports multiple clustering variants with different algorithms and parameters. This allows you to experiment with different clustering approaches and compare results.

**Available Clustering Methods:**

- **V1 (Hierarchical Agglomerative Clustering)**: Traditional HAC with fixed number of clusters
- **V2 (HDBSCAN)**: Density-based clustering with automatic cluster detection and dimensionality reduction

**Configure Variants:**

Edit `variants.json` to define different clustering configurations:

```json
{
  "variants": {
    "default-v1": {
      "name": "Standard (V1, 256 Cluster)",
      "version": "v1",
      "settings": {
        "clusters": 256,
        "linkageMethod": "weighted"
      }
    },
    "auto-v2": {
      "name": "Automatisch (V2, HDBSCAN)",
      "version": "v2",
      "settings": {
        "minClusterSize": 5,
        "minSamples": 3,
        "reducedDimensions": 50
      }
    }
  }
}
```

**Build a Variant:**

```bash
# Build with V1 (HAC) - 256 fixed clusters
./build-variant.sh v1 default-v1

# Build with V2 (HDBSCAN) - automatic cluster detection
./build-variant.sh v2 auto-v2

# Build with custom settings
./build-variant.sh v1 coarse-v1   # 128 clusters
./build-variant.sh v1 fine-v1     # 512 clusters
```

**What it does:**
1. Reads configuration from `variants.json`
2. Creates temporary `settings.json` with variant-specific parameters
3. Runs the appropriate clustering binary (V1 or V2)
4. Generates all visualization data files
5. Moves output to `frontend/public/topics/<variant-name>/`
6. Updates `frontend/public/topics/manifest.json`

**Output Structure:**
```
frontend/public/topics/
├── manifest.json              # Available variants
├── default-v1/               # V1 variant with 256 clusters
│   ├── topic-taxonomy.json
│   ├── topic-river-data.json
│   ├── topic-umap-data.json
│   ├── cluster-cluster-heatmap.json
│   └── speaker-cluster-heatmap.json
└── auto-v2/                  # V2 variant with auto-detected clusters
    ├── topic-taxonomy.json
    ├── topic-river-data.json
    └── ...
```

**Comparing Variants:**

The frontend allows you to switch between variants using a dropdown selector. All visualizations will automatically reload with the selected variant's data.

**Time:** 
- V1: ~20-30 seconds + LLM naming (~2 minutes)
- V2: ~60-90 seconds (includes dimensionality reduction) + LLM naming (~2 minutes)

**Cost:** ~$0.50 per variant for LLM-based cluster naming

**Rebuild all variants:**
```bash
# Build all variants defined in variants.json
for variant in default-v1 coarse-v1 fine-v1 auto-v2; do
  version=$(jq -r ".variants.\"$variant\".version" variants.json)
  ./build-variant.sh "$version" "$variant"
done
```

#### 8. Create Category Groups (Legacy)
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

## RAG AI Search Backend (Rust)

This repo includes a small Rust HTTP backend (`rag-backend`) that does RAG over `rag-embeddings.json` (created by `node create-rag-db.js`). It retrieves the referenced transcript window from `episodes/<N>-ts.json`, asks the LLM, and returns the answer **plus sources** (episode + time window + excerpt).

### Build the RAG DB

```bash
# Creates ./rag-embeddings.json (make sure your LLM settings are configured)
npm run create-rag-db
```

### Run the backend

The backend reads LLM settings from `settings.json` (fallback: `settings.example.json`) and also supports **env overrides**. The LLM API must be **OpenAI-compatible** for both embeddings and chat.

```bash
export LLM_API_KEY="sk-..."
# Optional overrides (otherwise taken from settings.json):
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o-mini"
export EMBEDDING_MODEL="text-embedding-3-small"

# Optional:
export RAG_DB_PATH="./rag-embeddings.json"
export EPISODES_DIR="./episodes"
export RAG_BIND_ADDR="127.0.0.1:7878"
export RAG_TOP_K="6"

cargo run --bin rag-backend
```

### Call the API

```bash
curl -s http://127.0.0.1:7878/api/chat \
  -H 'Content-Type: application/json' \
  -d '{ "query": "Worum ging es bei Universal Control?" }' | jq
```

Response shape:

- **`answer`**: LLM answer (with citations like `(Episode 281, 12:38-17:19)`)
- **`sources[]`**: list of sources with `episodeNumber`, `startSec/endSec`, and an `excerpt`

## Project Structure

```
freakshow/
├── episodes/                 # Scraped episode data (959 files)
│   ├── 1.json               # Episode metadata
│   ├── 1-ts.json            # Transcript
│   ├── 1-sn.json            # Shownotes
│   └── 1-text.html          # Description
│
├── scrape.js                # Episode list scraper
├── scrape-details.js        # Transcript/shownotes scraper
├── scrape-osf.js            # Legacy shownotes scraper
│
├── extract-topics.js        # LLM topic extraction
├── normalize-topics.js      # Topic cleanup
├── create-embeddings.js     # Generate embeddings
│
├── cluster-topics.js        # JavaScript clustering (legacy)
├── src/
│   ├── cluster_topics.rs    # V1 Rust clustering (HAC)
│   └── cluster_topics_v2.rs # V2 Rust clustering (HDBSCAN)
├── Cargo.toml               # Rust dependencies
│
├── variants.json            # Variant configurations
├── build-variant.sh         # Variant build script
│
├── generate-*.js            # Visualization data generators
│
├── frontend/                # Vue.js visualization app
│   ├── src/
│   │   ├── views/           # Main view components
│   │   ├── components/      # Reusable components
│   │   ├── composables/     # Vue composables (variant handling)
│   │   ├── stores/          # Pinia state management
│   │   └── i18n/            # Translations (de, en, fr)
│   └── public/
│       ├── episodes/        # Episode data (copied)
│       └── topics/          # Variant-specific data
│           ├── manifest.json    # Available variants
│           ├── default-v1/      # V1 variant data
│           └── auto-v2/         # V2 variant data
│
├── settings.json            # Configuration (API keys, etc.)
├── settings.example.json    # Example configuration
└── README.md               # This file
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

**V1 (Hierarchical Agglomerative Clustering):**
```json
{
  "topicClustering": {
    "embeddingModel": "text-embedding-3-large",
    "embeddingBatchSize": 100,
    "clusters": 256,
    "outlierThreshold": 0.7,
    "linkageMethod": "weighted",
    "useRelevanceWeighting": true,
    "useLLMNaming": true,
    "model": "gpt-4o-mini"
  }
}
```

**V2 (HDBSCAN with Dimensionality Reduction):**
```json
{
  "topicClustering": {
    "embeddingModel": "text-embedding-3-large",
    "embeddingBatchSize": 100,
    "minClusterSize": 5,
    "minSamples": 3,
    "reducedDimensions": 50,
    "outlierThreshold": 0.7,
    "useRelevanceWeighting": true,
    "useLLMNaming": true,
    "model": "gpt-4o-mini"
  }
}
```

**Parameters:**
- `clusters` (V1 only): Fixed number of clusters to create
- `linkageMethod` (V1 only): Linkage method (weighted, ward, average, complete, single)
- `minClusterSize` (V2 only): Minimum points to form a cluster
- `minSamples` (V2 only): Core point threshold
- `reducedDimensions` (V2 only): Target dimensions for Random Projection (50-100 recommended)
- `outlierThreshold`: Distance threshold for outlier detection
- `useRelevanceWeighting`: Weight topics by episode frequency
- `useLLMNaming`: Use LLM for cluster naming (vs. heuristic)

**Legacy Category Grouping:**
```json
{
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
- `topic-taxonomy.json` - Generated by variant builds (in variant folders)
- `topic-taxonomy-detailed.json` - Extended cluster information (in variant folders)
- `topic-categories.json` - 12 high-level categories (legacy)

### Visualization Data (per Variant)
Located in `frontend/public/topics/<variant-name>/`:
- `topic-taxonomy.json` - Cluster hierarchy for this variant
- `topic-taxonomy-detailed.json` - Detailed topic-to-cluster mapping
- `topic-river-data.json` - Topic evolution over time
- `topic-umap-data.json` - 2D UMAP projection
- `speaker-cluster-heatmap.json` - Speaker-cluster matrix
- `cluster-cluster-heatmap.json` - Cluster co-occurrence matrix

### Legacy Visualization Data
- `category-river-data.json` - Category overview
- `speaker-river-data.json` - Speaker participation
- `speaker-category-heatmap.json` - Speaker-category matrix (obsolete)
- `speaker-speaker-heatmap.json` - Speaker co-occurrence (obsolete)
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

### Clustering Performance Comparison

**V1 (Hierarchical Agglomerative Clustering):**

| Operation | JavaScript | Rust | Speedup |
|-----------|-----------|------|---------|
| Distance Matrix (4500 topics) | ~20s | ~2s | 10x |
| Clustering (→256 clusters) | ~180s | ~15s | 12x |
| Total (excl. LLM) | ~3-5 min | ~20-30s | ~10x |

**V2 (HDBSCAN with Dimensionality Reduction):**

| Operation | Rust Only | Time |
|-----------|-----------|------|
| Random Projection (3072→50 dims) | ~5s | - |
| Distance Matrix (4500 topics, 50 dims) | ~3s | - |
| HDBSCAN Clustering | ~30s | - |
| Merge Small Clusters | ~5s | - |
| Total (excl. LLM) | ~60-90s | - |

**Note:** V2 automatically detects the optimal number of clusters (typically 30-50) vs. V1's fixed 256 clusters.

## Documentation

### Clustering & Analysis
- `RUST-CLUSTERING.md` - V1 Rust implementation guide (HAC)
- `CLUSTERING-V2.md` - V2 HDBSCAN implementation guide
- `VARIANTS-SYSTEM.md` - Variant system architecture
- `VARIANTS-QUICKSTART.md` - Quick start guide for variants
- `VARIANTS-COMPLETE.md` - Complete variant feature summary

### Visualizations
- `CATEGORY-RIVER-GUIDE.md` - Category grouping explanation
- `RIVER-CHARTS-OVERVIEW.md` - Comparison of all chart types
- `VISUAL-EXPLANATION.md` - Visual guide to the hierarchy
- `DURATION-HEATMAPS.md` - Duration analysis documentation
- `UMAP-FEATURE.md` - UMAP visualization guide

### Frontend
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
- New clustering algorithms (V3?)
- Support for other podcast formats
- Improved cluster quality metrics
- Better dimensionality reduction techniques

## License

This project is for personal/educational use. The Freak Show podcast content belongs to its creators.

## Credits

- **Podcast:** [Freak Show](https://freakshow.fm) by Tim Pritlove and guests
- **Technologies:** Node.js, Rust, Vue.js, D3.js, Puppeteer, OpenAI API
- **Inspiration:** Exploring podcast evolution through data visualization

## See Also

- [Freak Show Official Website](https://freakshow.fm)
- [Metaebene Podcast Network](https://metaebene.me)
