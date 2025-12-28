# Topic Clustering V2 - HDBSCAN with Dimensionality Reduction

## Overview

V2 introduces significant improvements over V1:

| Feature | V1 (HAC) | V2 (HDBSCAN) |
|---------|----------|--------------|
| **Cluster Count** | Fixed (e.g., 256) | Automatic discovery |
| **Algorithm** | Hierarchical Agglomerative | HDBSCAN (density-based) |
| **Dimensions** | Full (1536-3072D) | Reduced (50D default) |
| **Outlier Detection** | Threshold-based | Built into algorithm |
| **Speed** | ~15-30s | ~60-120s (incl. reduction) |

## Key Improvements

### 1. Automatic Cluster Discovery
HDBSCAN finds the natural number of clusters based on data density, rather than forcing a fixed K. This produces more meaningful groupings.

### 2. Dimensionality Reduction
Before clustering, embeddings are reduced from 3072D to 50D using Random Projection. This:
- Reduces noise in the high-dimensional space
- Speeds up distance calculations
- Improves cluster quality (curse of dimensionality)

### 3. Better Outlier Handling
HDBSCAN naturally identifies noise points that don't belong to any cluster, which are then assigned to the nearest cluster during post-processing.

## Usage

### Build and Run

```bash
# Build the release binary
cargo build --release --bin cluster-topics-v2

# Run
./target/release/cluster-topics-v2

# Or use the script
./build-and-run-v2.sh
```

### Configuration

Add V2 settings to `settings.json`:

```json
{
  "topicClustering": {
    "minClusterSize": 5,
    "minSamples": 3,
    "reducedDimensions": 50,
    "useLLMNaming": true,
    "useRelevanceWeighting": true
  }
}
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minClusterSize` | 5 | Minimum topics to form a cluster |
| `minSamples` | 3 | Density parameter (higher = stricter) |
| `reducedDimensions` | 50 | Target dimensions after reduction |
| `useLLMNaming` | true | Use LLM for cluster names |
| `useRelevanceWeighting` | true | Weight by episode count |

### Tuning for More/Fewer Clusters

**More clusters (finer granularity):**
```json
{
  "minClusterSize": 3,
  "minSamples": 2
}
```

**Fewer clusters (coarser grouping):**
```json
{
  "minClusterSize": 15,
  "minSamples": 5
}
```

## Algorithm Details

### Step 1: Dimensionality Reduction

Uses **Random Projection** based on the Johnson-Lindenstrauss lemma:
- Projects 3072D embeddings to 50D
- Preserves pairwise distances with high probability
- Very fast (parallel computation)

Alternative: **PCA** is also implemented (`pca_reduce`) but slower without BLAS.

### Step 2: HDBSCAN Clustering

1. **Core Distances**: For each point, find the k-th nearest neighbor distance
2. **Mutual Reachability Distance**: `max(core_dist[a], core_dist[b], dist[a,b])`
3. **Minimum Spanning Tree**: Build MST on mutual reachability graph
4. **Cluster Hierarchy**: Convert MST to hierarchical cluster tree
5. **Cluster Selection**: Extract flat clusters using stability

### Step 3: Post-Processing

1. **Merge Small Clusters**: Clusters below `minClusterSize` merged to nearest large cluster
2. **Assign Noise**: Any remaining noise points assigned to nearest cluster
3. **Renumber**: Contiguous cluster IDs

### Step 4: Naming

Same as V1:
- LLM-based naming for clusters > 1 topic
- Heuristic fallback using keyword extraction
- Rate limiting for API calls

## Output Format

Identical to V1 for compatibility:

```json
{
  "createdAt": "...",
  "method": "hdbscan-v2",
  "embeddingModel": "text-embedding-3-large",
  "settings": {
    "clusters": 45,
    "linkageMethod": "hdbscan(min_cluster_size=5, min_samples=3)"
  },
  "statistics": {
    "clusterCount": 45,
    "outlierCount": 0
  },
  "clusters": [...]
}
```

## Comparison Results

Running on 4056 topics from Freakshow episodes:

| Metric | V1 (256 fixed) | V2 (HDBSCAN) |
|--------|---------------|--------------|
| Clusters | 256 | 45 (auto) |
| Avg Topics/Cluster | 16 | 90 |
| Outliers | ~12% | 0% |
| Runtime | ~17s | ~98s |

V2 produces fewer but more cohesive clusters. The natural grouping better reflects the actual topic structure.

## When to Use V1 vs V2

**Use V1 when:**
- You need a specific number of clusters
- You want faster runtime
- Fine-grained categorization is important

**Use V2 when:**
- You want natural topic groupings
- Cluster quality matters more than quantity
- You're exploring the data structure

## Technical Notes

### Dependencies

V2 adds these Rust crates:
- `ndarray` - Matrix operations
- `ndarray-rand` - Random number generation for matrices
- `rand`, `rand_distr` - Random projection
- `ordered-float` - Ordered floats for heap operations

### Performance

The main bottleneck is distance matrix computation (O(n²)). With 4056 topics:
- Distance matrix: ~15s (parallel)
- Dimensionality reduction: ~2s
- MST building: ~5s
- Post-processing: ~1s
- LLM naming: ~75s (network-bound)

Without LLM naming, V2 runs in ~25s.

