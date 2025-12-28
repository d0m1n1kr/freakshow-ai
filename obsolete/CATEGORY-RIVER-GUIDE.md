# Topic Categories River Chart - Quick Start Guide

This guide shows you how to create a **Topic Categories River Chart** - a higher-level view that groups your 256 topic clusters into broader themes.

## What is it?

While the **Topic River** shows 256 detailed topic clusters (like "iPhone", "Podcasting", "Bitcoin"), the **Category River** groups these into ~12 broader themes (like "Technology & Hardware", "Media & Communication", "Politics & Society").

Think of it as:
- **Topic River** = Zoomed in, detailed view
- **Category River** = Zoomed out, bird's eye view

## Prerequisites

You must have already:
1. ✅ Extracted topics from episodes (`node extract-topics.js`)
2. ✅ Created embeddings (`node create-embeddings.js`)
3. ✅ Clustered topics (`./build-and-run.sh` or `node cluster-topics.js`)

This should give you:
- `topic-embeddings.json` (embeddings for all topics)
- `topic-taxonomy.json` (256 topic clusters)

## Step-by-Step

### 1. Configure Settings

Edit your `settings.json` (or copy from `settings.example.json`):

```json
{
  "categoryGrouping": {
    "categories": 12
  }
}
```

**Recommended values:**
- **8-10**: Very high-level (broad themes)
- **12-15**: Balanced (default, recommended)
- **20-25**: More granular categories

### 2. Cluster Topics into Categories

```bash
npm run cluster-categories
```

**What it does:**
1. Loads your 256 topic clusters
2. Creates embeddings for each cluster (by averaging their topic embeddings)
3. Performs hierarchical clustering on the clusters themselves
4. Uses LLM to name each category meaningfully
5. Saves to `topic-categories.json`

**Expected output:**
```
🎯 Topic-Kategorien Clustering für Freakshow

📂 Lade Daten...
   ✓ 4056 Topic-Embeddings geladen
   ✓ 256 Topic-Cluster geladen
   Ziel: 12 Kategorien

🔬 Erstelle Cluster-Embeddings...
   ✓ 256 Cluster-Embeddings erstellt

📊 Erstelle Kategorien...
   Progress: 100% (12 Kategorien)
   ✓ 12 Kategorien erstellt

🏷️  Benenne Kategorien mit LLM...
   12/12: "Medien & Kommunikation"
   ✓ 12 Kategorien benannt

📋 Kategorien:

1. Technologie & Hardware (289 Episoden, 45 Cluster)
   Beispiel-Cluster: iPhone, Android, Mac, Hardware, USB
   
2. Politik & Gesellschaft (267 Episoden, 38 Cluster)
   Beispiel-Cluster: Ukraine, Trump, EU, Wahlen, Migration
   
...
```

**Cost:** ~12 LLM API calls for naming (very cheap with gpt-4o-mini)

### 3. Generate River Chart Data

```bash
npm run category-river
```

**What it does:**
1. Loads `topic-categories.json`
2. Aggregates category appearances by year
3. Saves to `category-river-data.json`

**Expected output:**
```
=== Category River Daten-Generator ===

12 Kategorien gefunden

Verarbeite Kategorie: Technologie & Hardware (289 Episoden)
Verarbeite Kategorie: Politik & Gesellschaft (267 Episoden)
...

✓ Daten erfolgreich gespeichert in: category-river-data.json

Statistiken:
- Kategorien: 12
- Zeitraum: 2010 - 2024
- Jahre: 2010, 2011, 2012, ...

Kategorien nach Episodenanzahl:
  1. Technologie & Hardware: 289 Episoden (45 Cluster)
  2. Politik & Gesellschaft: 267 Episoden (38 Cluster)
  3. Medien & Kommunikation: 245 Episoden (32 Cluster)
  ...
```

### 4. Copy to Frontend

```bash
# Copy the generated data to your frontend public folder
cp category-river-data.json frontend/public/
```

### 5. View in Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 and you'll now see **three tabs**:
- **Topics (Detail)** - 256 detailed topic clusters
- **Kategorien (Übersicht)** - 12 high-level categories ← NEW!
- **Speaker** - Speaker participation over time

## Example Output

Your `topic-categories.json` will look like:

```json
{
  "createdAt": "2025-12-27T...",
  "method": "hierarchical-category-clustering",
  "targetCategories": 12,
  "categories": [
    {
      "id": "technologie-hardware",
      "name": "Technologie & Hardware",
      "description": "45 Cluster in 289 Episoden",
      "clusterCount": 45,
      "episodeCount": 289,
      "sampleClusters": [
        "iPhone",
        "Android",
        "Mac",
        "Hardware",
        "USB"
      ],
      "episodes": [1, 2, 5, 7, ...]
    }
  ]
}
```

## Customization

### Change Number of Categories

Edit `settings.json`:
```json
{
  "categoryGrouping": {
    "categories": 15  // More granular
  }
}
```

Then re-run:
```bash
npm run cluster-categories
npm run category-river
```

### Use Different LLM for Naming

The script uses your configured LLM from `settings.json`:
```json
{
  "llm": {
    "model": "gpt-4o-mini",  // Fast and cheap
    // or "gpt-4o" for better naming
    "apiKey": "...",
    "baseURL": "https://api.openai.com/v1"
  }
}
```

## Troubleshooting

**Problem:** "Keine Embeddings-Datenbank gefunden"
- **Solution:** Run `npm run create-embeddings` first

**Problem:** "Keine Topic-Taxonomie gefunden"
- **Solution:** Run `./build-and-run.sh` or `npm run cluster-topics` first

**Problem:** Categories don't make sense
- **Solution:** Try different numbers (8-25 range)
- **Solution:** Use gpt-4o instead of gpt-4o-mini for better naming

**Problem:** Frontend doesn't show categories tab
- **Solution:** Make sure `category-river-data.json` is in `frontend/public/`
- **Solution:** Refresh your browser

## Full Pipeline

To create everything from scratch:

```bash
# 1. Extract topics (slow, costs money)
npm run extract-topics -- --all

# 2. Create embeddings (costs money)
npm run create-embeddings

# 3. Cluster into 256 topics (fast with Rust)
./build-and-run.sh

# 4. Group into categories (very fast)
npm run cluster-categories

# 5. Generate all river data
npm run topic-river
npm run category-river
npm run speaker-river  # if not done yet

# 6. Copy to frontend
cp topic-river-data.json frontend/public/
cp category-river-data.json frontend/public/
cp speaker-river-data.json frontend/public/

# 7. Run frontend
cd frontend && npm run dev
```

## Why is this useful?

1. **Big Picture View**: See how broad themes evolved over podcast history
2. **Less Noise**: 12 categories are easier to comprehend than 256 topics
3. **Complementary**: Switch between detail (topics) and overview (categories)
4. **Patterns**: Identify major shifts in podcast focus areas

## Technical Details

**Algorithm:**
- Hierarchical agglomerative clustering on cluster centroids
- Episode-weighted distance computation
- LLM-based semantic naming with fallbacks

**Performance:**
- Clustering: ~5-10 seconds (256 → 12)
- LLM naming: ~30 seconds (12 API calls)
- River generation: ~2 seconds

**Files created:**
- `topic-categories.json` (~50KB) - Category definitions
- `category-river-data.json` (~5-10KB) - River chart data

