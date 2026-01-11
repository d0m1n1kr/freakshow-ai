# PodInsights

A comprehensive tool suite for scraping, analyzing, and visualizing podcast archives. PodInsights extracts episode metadata, transcripts, and shownotes, then uses AI-powered topic extraction and clustering to create interactive visualizations showing the evolution of topics, speakers, and themes across multiple podcasts.

**🌐 Live Demo:** [https://pod-insights.freshx.de](https://pod-insights.freshx.de)

**📦 GitHub Repository:** [https://github.com/d0m1n1kr/pod-insights](https://github.com/d0m1n1kr/pod-insights)

## Features

### Episode Search & Discovery
- ✅ **Semantic Episode Search**: AI-powered search to find episodes by content, not just keywords
- ✅ **Direct Playback Links**: Multiple play buttons per search result linking to relevant positions in episodes
- ✅ **Latest Episodes**: Automatically shows the 10 most recent episodes when no search query is provided
- ✅ **Infinite Scroll**: Paginated results with seamless loading of more episodes
- ✅ **Episode Details**: Comprehensive episode information including speakers, topics, and descriptions
- ✅ **Episode Images**: Visual episode covers displayed throughout the interface

### Speaker Statistics & Analysis
- ✅ **Speaking Time Analysis**: Detailed breakdown of speaking time per speaker per episode
- ✅ **Flow Charts**: Visual representation of speaking time distribution over episode duration
- ✅ **Scatter Plots**: Individual speech segments with duration vs. position visualization
- ✅ **Box Plot Visualizations**: Statistical distribution of speaking patterns
- ✅ **Monologue Analysis**: Longest and shortest speaking segments per speaker
- ✅ **Speaker Profiles**: Rich speaker metadata with images and descriptions

### Global Audio Player
- ✅ **Persistent Player**: Audio playback continues seamlessly across all pages and views
- ✅ **Dual States**: Compact small state and expanded large state with transcript display
- ✅ **Live Transcript**: Real-time transcript display synchronized with audio playback
- ✅ **Speaker Identification**: Current speaker highlighted with profile images
- ✅ **Episode Links**: Clickable episode titles linking to episode detail pages
- ✅ **State Persistence**: Player size preference saved across sessions

### Multi-Podcast Support
- ✅ **Podcast-Auswahl**: Dropdown zur Auswahl zwischen mehreren Podcasts
- ✅ **Podcast-spezifische Daten**: Alle Daten werden pro Podcast organisiert
- ✅ **Dynamische Pfade**: Automatische Pfad-Generierung basierend auf ausgewähltem Podcast
- ✅ **Konfigurierbare Podcasts**: Einfache Erweiterung um weitere Podcasts über `podcasts.json`
- ✅ **Podcast-Metadaten**: Logo, Tab-Namen und URLs pro Podcast konfigurierbar

### Data Collection
- ✅ Scrapes episodes from podcast archives
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
- ✅ **Speaker Scatter Plot**: Individual speech segments by duration and position
- ✅ **Heatmaps**:
  - Speaker × Cluster relationships
  - Cluster × Cluster co-occurrence
  - Speaker × Speaker co-occurrence (legacy)
- ✅ **Duration Analysis**: Episode length patterns by year/day of week
- ✅ **Variant Info Panel**: Displays details about the active clustering configuration
- ✅ **Episode Search**: Semantic search for episodes with direct playback links to relevant positions
- ✅ **Speaker Statistics**: Detailed analysis of speaking time, monologues, and time distribution per episode
- ✅ **Global Seamless Player**: Persistent audio player across all pages with small and large states
- ✅ Multilingual interface (German, English, French)
- ✅ Dark mode support with persistent settings

## Quick Start

### Prerequisites

```bash
# Node.js 18+ for scraping and data processing
node --version

# Git LFS (recommended for large LanceDB files: *.lance, *.idx)
# macOS
brew install git-lfs

# Ubuntu/Debian
sudo apt-get install git-lfs

# Windows
# Download installer from https://git-lfs.github.com

# Initialize Git LFS (one-time setup)
git lfs install

# Rust (optional, for 10x faster clustering)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Installation

```bash
# Clone repository (Git LFS will automatically download embedding databases)
git clone https://github.com/d0m1n1kr/pod-insights.git
cd pod-insights

# If you already cloned without Git LFS, fetch the LFS files:
# git lfs pull

# Install dependencies
npm install

# Configure API keys (copy and edit)
cp settings.example.json settings.json
# Add your OpenAI API key (or alternative LLM provider)
```

## Automated Pipeline

For a complete automated processing of a podcast, you can use the `process-podcast.sh` script. This script orchestrates all steps from scraping to visualization generation:

```bash
# Process a complete podcast (all steps)
./scripts/process-podcast.sh <podcast-id>

# Example: Process Freak Show
./scripts/process-podcast.sh freakshow

# Example: Process Logbuch:Netzpolitik
./scripts/process-podcast.sh lnp

# Skip scraping if data already exists
./scripts/process-podcast.sh <podcast-id> --skip-scraping

# Skip RAG database creation
./scripts/process-podcast.sh <podcast-id> --skip-rag
```

**What it does:**
1. Scrapes episode data (metadata, transcripts, shownotes, speakers, chapters)
2. Extracts and normalizes topics using LLMs
3. Creates semantic embeddings for topics
4. Performs topic clustering (V2 auto-v2.1 variant)
5. Generates visualization data files (river charts, heatmaps, UMAP)
6. Generates optional data (MP3 index, speaker profiles, TS-live files)
7. Creates RAG database (optional)
8. Organizes all files into the correct frontend structure
9. Creates necessary symbolic links

**Output:** All data files organized in `frontend/public/podcasts/<podcast-id>/` ready for frontend use.

## Step-by-Step Guide

If you prefer to run individual steps manually or need more control over the process, you can follow these 6 phases. Each script accepts a `--podcast <id>` parameter for multi-podcast support.

### Phase 1: Data Collection

#### 1. Scrape Episode List
Extract basic metadata for all episodes:

```bash
node scripts/scrape.js --podcast freakshow
```

**Output:** `podcasts/freakshow/episodes/1.json`, `podcasts/freakshow/episodes/2.json`, ... (300+ files)

**Time:** ~5 minutes

#### 2. Scrape Episode Details
Extract transcripts, shownotes, and descriptions:

```bash
node scripts/scrape-details.js --podcast freakshow --all
```

**Output:**
- Transcripts: `podcasts/freakshow/episodes/1-ts.json`, `podcasts/freakshow/episodes/2-ts.json`, ...
- Shownotes: `podcasts/freakshow/episodes/1-sn.json`, `podcasts/freakshow/episodes/2-sn.json`, ...
- Descriptions: `podcasts/freakshow/episodes/1-text.html`, `podcasts/freakshow/episodes/2-text.html`, ...

**Time:** ~30-60 minutes (concurrent processing, 3 episodes at a time)

#### 3. Scrape Speakers
Extract speaker information and profiles:

```bash
node scripts/scrape-speakers.js --podcast freakshow
```

**Output:** Speaker data in `podcasts/freakshow/speakers/`

**Time:** ~2 minutes

#### 4. Generate Speaker Stats
Create detailed speaker statistics for each episode:

```bash
node scripts/generate-speaker-stats.js --podcast freakshow --all
```

**Output:** `podcasts/freakshow/episodes/1-speaker-stats.json`, ...

**Time:** ~1 minute

#### 6. Scrape Chapters
Extract episode chapters:

```bash
node scripts/scrape-chapters.js --podcast freakshow --all
```

**Output:** `podcasts/freakshow/episodes/1-chapters.json`, ...

**Time:** ~5 minutes

#### 8. Scrape Legacy Shownotes (Optional)
Extract OSF-format shownotes for older episodes (if applicable):

```bash
node scripts/scrape-osf.js --podcast freakshow
```

**Output:** `podcasts/freakshow/episodes/89-osf.json`, ...

**Time:** ~15 minutes

**Total Data:** 1000+ files organized by podcast

### Phase 2: Topic Extraction & Analysis

#### 10. Extract Topics with LLM
Identify main topics from episode transcripts:

```bash
# Test with a single episode first
node scripts/extract-topics.js --podcast freakshow 296

# Process all episodes
node scripts/extract-topics.js --podcast freakshow --all
```

**Output:** `podcasts/freakshow/episodes/1-topics.json`, `podcasts/freakshow/episodes/2-topics.json`, ...

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

#### 12. Normalize Topics
Clean up and standardize extracted topics:

```bash
node scripts/normalize-topics.js --podcast freakshow
```

**Output:** Updates topic files in place

**Time:** ~30 seconds

#### 13. Generate Extended Topics (for RAG)
Create additional topic data for better AI search:

```bash
node scripts/generate-extended-topics.js --podcast freakshow --all
```

**Output:** Extended topic data for RAG database

**Time:** ~10 minutes

#### 14. Create Embeddings
Generate semantic embeddings for all topics:

```bash
node scripts/create-embeddings.js --podcast freakshow
```

**Output (LanceDB):** `db/freakshow/lance/topics.lance` (+ `db/freakshow/lance/metadata.json`)

**Time:** ~10-15 minutes

**Cost:** ~$2-3 (OpenAI text-embedding-3-large)

### Phase 3: Clustering

#### 15. Build Clustering Variant
Create topic clusters using V2 HDBSCAN (recommended):

```bash
# Build the standard auto-v2.1 variant
./scripts/build-variant.sh v2 auto-v2.1 --podcast freakshow

# Alternative: V1 with fixed clusters
./scripts/build-variant.sh v1 default-v1 --podcast freakshow
```

**Available Variants:**
- **auto-v2.1**: HDBSCAN with automatic cluster detection (recommended)
- **default-v1**: HAC with 256 fixed clusters
- **coarse-v1/fine-v1**: Different cluster granularities

**What it does:**
1. Reads configuration from `variants.json`
2. Runs appropriate clustering algorithm (Rust)
3. Generates taxonomy, river charts, UMAP, and heatmaps
4. Moves output to `frontend/public/podcasts/freakshow/topics/auto-v2.1/`

**Time:**
- V2: ~60-90 seconds + LLM naming (~2 minutes)
- V1: ~20-30 seconds + LLM naming (~2 minutes)

**Cost:** ~$0.50 per variant for LLM-based cluster naming

### Phase 4: Generate Visualizations

#### 17. Generate Speaker River Data
Create speaker participation timeline:

```bash
node scripts/generate-speaker-river.js --podcast freakshow
```

**Output:** `speaker-river-data.json`

**Time:** ~30 seconds

#### 18. Generate Speaker-Speaker Heatmap
Analyze speaker co-occurrence patterns:

```bash
node scripts/generate-speaker-speaker-heatmap.js --podcast freakshow
```

**Output:** `speaker-speaker-heatmap.json`

**Time:** ~10 seconds

#### 19. Generate Duration Heatmaps
Analyze episode length patterns:

```bash
node scripts/generate-year-duration-heatmap.js --podcast freakshow
node scripts/generate-dayofweek-duration-heatmap.js --podcast freakshow
node scripts/generate-speaker-duration-heatmap.js --podcast freakshow
```

**Output:** `year-duration-heatmap.json`, `dayofweek-duration-heatmap.json`, `speaker-duration-heatmap.json`

**Time:** ~20 seconds total

### Phase 5: Optional Processing

#### 20. Generate MP3 Index (Optional)
Create index for MP3 files:

```bash
node scripts/generate-episodes-mp3.js --podcast freakshow
```

**Output:** MP3 metadata index

#### 21. Generate TS-Live Files
Create live transcript files for the player:

```bash
node scripts/generate-ts-live.js --podcast freakshow --all
```

**Output:** `podcasts/freakshow/episodes/1-ts-live.json`, ...

**Time:** ~5 minutes

#### 23. Create RAG Database
Build AI search database:

```bash
node scripts/create-rag-db.js --podcast freakshow
```

**Output (LanceDB):** `db/freakshow/lance/rag_chunks.lance` (+ `db/freakshow/lance/metadata.json`)

**Time:** ~5 minutes

**Cost:** ~$1-2

### Phase 6: Organize Frontend Files

**Diese Phase wird automatisch von `process-podcast.sh` ausgeführt**

**Output Structure per Podcast:**
```
podcasts/freakshow/
├── episodes/              # Raw episode data
├── speakers/              # Speaker profiles
└── ...

frontend/public/podcasts/freakshow/
├── episodes.json          # Episode index
├── speaker-river-data.json
├── *-heatmap.json         # All heatmap data
├── episodes/              # Symlink to raw episodes
├── speakers/              # Speaker data
└── topics/
    └── auto-v2.1/         # Clustering variant data
        ├── topic-taxonomy.json
        ├── topic-river-data.json
        ├── topic-umap-data.json
        ├── speaker-cluster-heatmap.json
        └── cluster-cluster-heatmap.json
```

## Empfohlener Workflow

**Verwende das automatische Script für die komplette Verarbeitung:**

```bash
# Komplette Verarbeitung eines Podcasts
./scripts/process-podcast.sh freakshow

# Von bestimmter Phase starten (z.B. nur Clustering)
./scripts/process-podcast.sh freakshow --from-step 3

# Scraping überspringen wenn Daten vorhanden
./scripts/process-podcast.sh freakshow --skip-scraping

# RAG-Datenbank überspringen
./scripts/process-podcast.sh freakshow --skip-rag
```

**Alle Scripts unterstützen den `--podcast <id>` Parameter für Multi-Podcast-Support**

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

This repo includes a small Rust HTTP backend (`rag-backend`) that does RAG over podcast-specific LanceDB databases in `db/<podcast-id>/lance/` (created by `node scripts/create-rag-db.js --podcast <id>`). It supports all podcasts simultaneously and selects the appropriate database based on the `podcastId` parameter in API requests.

### Build the RAG DB

```bash
# Build RAG database for a specific podcast
npm run create-rag-db -- --podcast freakshow

# Build RAG databases for all podcasts
for podcast in cre forschergeist lnp raumzeit ukw freakshow; do
  npm run create-rag-db -- --podcast "$podcast"
done
```

### Run the backend

The backend reads LLM settings from `settings.json` (fallback: `settings.example.json`) and also supports **env overrides**. The LLM API must be **OpenAI-compatible** for both embeddings and chat.

```bash
export LLM_API_KEY="sk-..."
# Optional overrides (otherwise taken from settings.json):
export LLM_BASE_URL="https://api.openai.com/v1"
export LLM_MODEL="gpt-4o-mini"
export EMBEDDING_MODEL="text-embedding-3-small"

# RAG databases are loaded automatically from db/<podcast-id>/lance/
export EPISODES_DIR="./episodes"
export RAG_BIND_ADDR="127.0.0.1:7878"
export RAG_TOP_K="6"

cargo run --bin rag-backend
```

### Call the API

```bash
# Suche in allen verfügbaren Podcasts (fallback: freakshow)
curl -s http://127.0.0.1:7878/api/chat \
  -H 'Content-Type: application/json' \
  -d '{ "query": "Worum ging es bei Universal Control?" }' | jq

# Explizit einen Podcast angeben
curl -s http://127.0.0.1:7878/api/chat \
  -H 'Content-Type: application/json' \
  -d '{ "query": "Worum ging es bei Universal Control?", "podcastId": "freakshow" }' | jq
```

Response shape:

- **`answer`**: LLM answer (with citations like `(Episode 281, 12:38-17:19)`)
- **`sources[]`**: list of sources with `episodeNumber`, `startSec/endSec`, and an `excerpt`

## Multi-Podcast Setup

Die Anwendung unterstützt jetzt mehrere Podcasts. Jeder Podcast hat seine eigenen Daten und Konfiguration.

### Podcast-Konfiguration

Bearbeite `frontend/public/podcasts.json` um Podcasts hinzuzufügen:

```json
{
  "podcasts": [
    {
      "id": "freakshow",
      "name": "Freak Show",
      "tabName": "FdFS",
      "logoUrl": "https://freakshow.fm/files/2013/07/cropped-freakshow-logo-600x600-180x180.jpg",
      "homeUrl": "https://freakshow.fm/",
      "feedUrl": "https://feeds.metaebene.me/freakshow/mp3",
      "archiveUrl": "https://freakshow.fm/archiv",
      "teamUrl": "https://freakshow.fm/team"
    }
  ]
}
```

### Verzeichnisstruktur

Jeder Podcast hat seine eigenen Verzeichnisse:

```
podcasts/
└── <podcast-id>/
    ├── episodes/            # Episode-Daten
    └── speakers/           # Speaker-Daten

frontend/public/podcasts/
└── <podcast-id>/
    ├── episodes.json       # Episode-Index
    ├── speaker-river-data.json
    ├── topic-river-data.json
    ├── topics/             # Clustering-Varianten
    │   ├── manifest.json
    │   └── <variant>/
    └── speakers/           # Speaker-Metadaten
```

### Skripte mit Podcast-Parameter

Alle Skripte unterstützen den `--podcast` Parameter:

```bash
# Scraping für einen bestimmten Podcast
node scripts/scrape.js --podcast freakshow
node scripts/scrape-details.js --podcast freakshow

# Topic-Extraktion
node scripts/extract-topics.js --podcast freakshow --all

# Clustering
./scripts/build-variant.sh v2 auto-v2.1 --podcast freakshow

# Visualisierungen generieren
node scripts/generate-topic-river.js --podcast freakshow
node scripts/generate-speaker-river.js --podcast freakshow
```

### RAG-Backend

Das RAG-Backend unterstützt alle Podcasts gleichzeitig. Die Podcast-Auswahl erfolgt pro Anfrage:

```bash
cargo run --bin rag-backend
```

## Project Structure

```
pod-insights/
├── Cargo.lock               # Rust dependencies lock file
├── Cargo.toml               # Rust project configuration
├── db/                      # Database files and embeddings
│   ├── freakshow/           # Podcast-specific embeddings and databases
│   │   └── lance/                 # LanceDB tables (topics + rag_chunks)
│   ├── cre/                 # Other podcast data
│   ├── forschergeist/
│   ├── lnp/
│   ├── raumzeit/
│   └── ukw/
│
├── docs/                    # Documentation files
├── frontend/                # Vue.js visualization application
│   ├── src/
│   │   ├── views/           # Main view components
│   │   ├── components/      # Reusable components (charts, selectors)
│   │   ├── composables/     # Vue composables (podcast, audio, etc.)
│   │   ├── stores/          # Pinia state management
│   │   ├── i18n/            # Internationalization (de, en, fr)
│   │   └── types.ts         # TypeScript type definitions
│   └── public/
│       ├── podcasts.json    # Podcast configuration
│       └── podcasts/        # Frontend data per podcast
│           └── <podcast-id>/
│               ├── episodes.json     # Episode index
│               ├── episodes/         # Episode data (symlinks)
│               ├── speakers/         # Speaker metadata
│               └── topics/           # Clustering variants
│                   ├── manifest.json
│                   └── <variant>/
│
├── lib/                     # Shared JavaScript utilities
├── podcasts/                # Raw podcast data (organized by podcast)
│   ├── cre/                 # Chaosradio Express
│   ├── forschergeist/       # Forschergeist
│   ├── lnp/                 # Logbuch:Netzpolitik
│   ├── raumzeit/            # Raumzeit
│   └── ukw/                 # UKW
│
├── scripts/                 # Build and utility scripts
│   ├── process-podcast.sh   # Complete podcast processing pipeline
│   ├── build-variant.sh     # Clustering variant builder
│   ├── sync.sh             # Data synchronization
│   └── generate-*.js       # Individual data generators
│
├── src/                    # Rust source code
│   ├── cache.rs            # Caching utilities
│   ├── cluster_topics.rs   # V1 HAC clustering
│   ├── cluster_topics_v2.rs # V2 HDBSCAN clustering
│   ├── config.rs           # Configuration handling
│   ├── handlers/           # HTTP request handlers
│   ├── lib.rs              # Library exports
│   ├── rag/                # RAG search implementation
│   ├── rag_backend.rs      # RAG HTTP server
│   ├── transcript.rs       # Transcript processing
│   └── utils.rs            # Utility functions
│
├── settings.json           # Configuration (API keys, etc.)
├── settings.example.json   # Example configuration template
├── variants.json           # Clustering variant definitions
├── package.json            # Node.js dependencies and scripts
└── README.md              # This documentation
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
- `db/{podcast-id}/lance/topics.lance` - Topic embeddings (LanceDB)
- `db/{podcast-id}/lance/rag_chunks.lance` - RAG embeddings (LanceDB)
- `db/{podcast-id}/lance/metadata.json` - Metadata for the LanceDB tables
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

### LanceDB storage (no JSON fallback)
This project now stores embeddings **only** in LanceDB tables under `db/<podcast-id>/lance/`:

- `topics.lance` (topic embeddings)
- `rag_chunks.lance` (RAG chunks + vectors)

If you need to regenerate all embedding DBs:

```bash
for podcast in cre das-universum forschergeist freakshow lnp minkorrekt raumzeit ukw wrint-wissenschaft; do
  [ -d "podcasts/$podcast" ] || continue
  node scripts/create-embeddings.js --podcast "$podcast"
  node scripts/create-rag-db.js --podcast "$podcast"
done
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

This project is for personal/educational use. Podcast content belongs to their respective creators.

## Credits

- **Technologies:** Node.js, Rust, Vue.js, D3.js, Puppeteer, OpenAI API
- **Inspiration:** Exploring podcast evolution through data visualization
