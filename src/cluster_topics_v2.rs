//! Topic Clustering V2 - HDBSCAN with dimensionality reduction
//!
//! Improvements over V1:
//! - HDBSCAN for automatic cluster discovery (no fixed K needed)
//! - PCA/Random Projection for dimensionality reduction before clustering
//! - Automatic optimal cluster count detection
//! - Better outlier handling

use clap::Parser;
use indicatif::{ProgressBar, ProgressStyle};
use ndarray::{Array1, Array2, Axis};
use ordered_float::OrderedFloat;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{BinaryHeap, HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;

// ============================================================================
// Command-line Arguments
// ============================================================================

#[derive(Parser, Debug)]
#[command(name = "cluster-topics-v2")]
#[command(about = "V2 Topic clustering using HDBSCAN with dimensionality reduction")]
struct Args {
    /// Variant name to load from variants.json
    #[arg(short, long)]
    variant: Option<String>,
}

// ============================================================================
// Variant Configuration (from variants.json)
// ============================================================================

#[derive(Debug, Deserialize, Clone)]
struct VariantsConfig {
    variants: HashMap<String, VariantConfig>,
}

#[derive(Debug, Deserialize, Clone)]
struct VariantConfig {
    #[allow(dead_code)]
    version: String,
    name: String,
    settings: VariantSettingsJson,
}

#[derive(Debug, Deserialize, Clone, Default)]
struct VariantSettingsJson {
    #[serde(rename = "minClusterSize")]
    min_cluster_size: Option<usize>,
    #[serde(rename = "minSamples")]
    min_samples: Option<usize>,
    #[serde(rename = "reducedDimensions")]
    reduced_dimensions: Option<usize>,
    #[serde(rename = "outlierThreshold")]
    outlier_threshold: Option<f64>,
    /// Default per-topic duration (seconds) used as relevance when no duration is available.
    #[serde(rename = "defaultTopicDurationSec")]
    default_topic_duration_sec: Option<u32>,
    #[serde(rename = "useRelevanceWeighting")]
    use_relevance_weighting: Option<bool>,
    #[serde(rename = "useLLMNaming")]
    use_llm_naming: Option<bool>,
}
use rand::SeedableRng;
use rand_distr::{Distribution, Normal};

// ============================================================================
// Settings & Data Structures (same as V1 for compatibility)
// ============================================================================

#[derive(Debug, Deserialize)]
struct Settings {
    llm: LlmSettings,
    #[serde(rename = "topicExtraction")]
    topic_extraction: Option<TopicExtractionSettings>,
    #[serde(rename = "topicClustering")]
    topic_clustering: Option<TopicClusteringSettings>,
}

#[derive(Debug, Deserialize)]
struct LlmSettings {
    model: String,
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "baseURL")]
    base_url: String,
    temperature: Option<f32>,
}

#[derive(Debug, Deserialize)]
struct TopicExtractionSettings {
    #[serde(rename = "requestDelayMs")]
    request_delay_ms: Option<u64>,
    #[serde(rename = "maxRetries")]
    max_retries: Option<u32>,
    #[serde(rename = "retryDelayMs")]
    retry_delay_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct TopicClusteringSettings {
    #[allow(dead_code)]
    clusters: Option<usize>,
    #[serde(rename = "outlierThreshold")]
    outlier_threshold: Option<f64>,
    /// Topics that appear in (almost) every episode are not useful clusters (e.g. intro/outro).
    /// If set, topics with episode_share >= threshold will be excluded before clustering.
    #[serde(rename = "ubiquitousTopicMaxEpisodeShare")]
    ubiquitous_topic_max_episode_share: Option<f64>,
    #[allow(dead_code)]
    #[serde(rename = "linkageMethod")]
    linkage_method: Option<String>,
    #[serde(rename = "useRelevanceWeighting")]
    use_relevance_weighting: Option<bool>,
    #[serde(rename = "useLLMNaming")]
    use_llm_naming: Option<bool>,
    model: Option<String>,
    // V2 specific settings
    #[serde(rename = "minClusterSize")]
    min_cluster_size: Option<usize>,
    #[serde(rename = "reducedDimensions")]
    reduced_dimensions: Option<usize>,
    #[serde(rename = "minSamples")]
    min_samples: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingsDatabase {
    #[serde(rename = "embeddingModel")]
    embedding_model: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "embeddingDimensions")]
    embedding_dimensions: usize,
    #[serde(rename = "totalTopicsRaw")]
    total_topics_raw: usize,
    topics: Vec<TopicWithEmbedding>,
}

#[derive(Debug, Clone, Deserialize)]
struct TopicWithEmbedding {
    topic: String,
    keywords: Vec<String>,
    count: usize,
    episodes: Vec<u32>,
    #[serde(default)]
    occurrences: Option<Vec<TopicOccurrence>>,
    embedding: Vec<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct TopicOccurrence {
    #[serde(rename = "episodeNumber")]
    episode_number: u32,
    #[serde(rename = "durationSec")]
    duration_sec: Option<u32>,
    #[serde(rename = "positionSec")]
    position_sec: Option<u32>,
}

// ============================================================================
// Output Structures (identical to V1 for compatibility)
// ============================================================================

#[derive(Debug, Clone, Serialize)]
struct NamedCluster {
    id: String,
    name: String,
    #[serde(rename = "isOutlier")]
    is_outlier: bool,
    #[serde(rename = "topicCount")]
    topic_count: usize,
    #[serde(rename = "episodeCount")]
    episode_count: usize,
    /// Sum of topic relevance (seconds) within the cluster.
    #[serde(rename = "relevanceSec")]
    relevance_sec: u64,
    topics: Vec<ClusterTopic>,
    episodes: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct ClusterTopic {
    topic: String,
    count: usize,
    keywords: Vec<String>,
    #[serde(rename = "relevanceSec")]
    relevance_sec: u64,
    /// Per-episode timing metadata for jumping into the audio stream.
    occurrences: Vec<ClusterTopicOccurrence>,
}

#[derive(Debug, Clone, Serialize)]
struct ClusterTopicOccurrence {
    #[serde(rename = "episodeNumber")]
    episode_number: u32,
    #[serde(rename = "durationSec")]
    duration_sec: u32,
    #[serde(rename = "positionSec")]
    position_sec: u32,
}

#[derive(Debug, Clone, Serialize)]
struct TaxonomyResult {
    #[serde(rename = "createdAt")]
    created_at: String,
    method: String,
    #[serde(rename = "embeddingModel")]
    embedding_model: String,
    #[serde(rename = "embeddingsCreatedAt")]
    embeddings_created_at: String,
    #[serde(rename = "totalTopics")]
    total_topics: usize,
    #[serde(rename = "uniqueTopics")]
    unique_topics: usize,
    settings: ClusterSettings,
    statistics: Statistics,
    clusters: Vec<TaxonomyCluster>,
}

#[derive(Debug, Clone, Serialize)]
struct ClusterSettings {
    clusters: usize,
    #[serde(rename = "outlierThreshold")]
    outlier_threshold: f64,
    #[serde(rename = "linkageMethod")]
    linkage_method: String,
    #[serde(rename = "useRelevanceWeighting")]
    use_relevance_weighting: bool,
}

#[derive(Debug, Clone, Serialize)]
struct Statistics {
    #[serde(rename = "clusterCount")]
    cluster_count: usize,
    #[serde(rename = "outlierCount")]
    outlier_count: usize,
    #[serde(rename = "outlierPercentage")]
    outlier_percentage: String,
}

#[derive(Debug, Clone, Serialize)]
struct TaxonomyCluster {
    id: String,
    name: String,
    description: String,
    #[serde(rename = "isOutlier")]
    is_outlier: bool,
    #[serde(rename = "topicCount")]
    topic_count: usize,
    #[serde(rename = "episodeCount")]
    episode_count: usize,
    #[serde(rename = "relevanceSec")]
    relevance_sec: u64,
    #[serde(rename = "sampleTopics")]
    sample_topics: Vec<String>,
    episodes: Vec<u32>,
}

#[derive(Debug, Deserialize)]
struct LlmResponse {
    choices: Vec<LlmChoice>,
}

#[derive(Debug, Deserialize)]
struct LlmChoice {
    message: LlmMessage,
}

#[derive(Debug, Deserialize)]
struct LlmMessage {
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct LlmRequest {
    model: String,
    messages: Vec<LlmRequestMessage>,
    temperature: f32,
    max_tokens: u32,
}

#[derive(Debug, Clone, Serialize)]
struct LlmRequestMessage {
    role: String,
    content: String,
}

// ============================================================================
// Dimensionality Reduction: PCA via Power Iteration
// ============================================================================

/// Perform PCA using power iteration method (no BLAS/LAPACK needed)
/// This is slower than SVD-based PCA but has no external dependencies
#[allow(dead_code)]
fn pca_reduce(embeddings: &[Vec<f64>], target_dims: usize) -> Vec<Vec<f64>> {
    let n = embeddings.len();
    let d = embeddings[0].len();

    println!("   Reduziere Dimensionen: {} → {} (PCA)", d, target_dims);

    // Convert to ndarray
    let mut data = Array2::<f64>::zeros((n, d));
    for (i, emb) in embeddings.iter().enumerate() {
        for (j, &val) in emb.iter().enumerate() {
            data[[i, j]] = val;
        }
    }

    // Center the data (subtract mean)
    let mean = data.mean_axis(Axis(0)).unwrap();
    for i in 0..n {
        for j in 0..d {
            data[[i, j]] -= mean[j];
        }
    }

    // Power iteration to find principal components
    let mut rng = rand::rngs::StdRng::seed_from_u64(42);
    let normal = Normal::new(0.0, 1.0).unwrap();

    let mut components = Vec::with_capacity(target_dims);
    let mut projected = data.clone();

    let pb = ProgressBar::new(target_dims as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("   [{bar:40.cyan/blue}] {pos}/{len} Komponenten")
            .unwrap()
            .progress_chars("#>-"),
    );

    for _ in 0..target_dims {
        // Random initial vector
        let mut v: Array1<f64> = Array1::from_iter((0..d).map(|_| normal.sample(&mut rng)));

        // Normalize
        let norm: f64 = v.iter().map(|x| x * x).sum::<f64>().sqrt();
        v.mapv_inplace(|x| x / norm);

        // Power iteration (find dominant eigenvector of X^T X)
        for _ in 0..50 {
            // v_new = X^T * (X * v)
            let xv: Array1<f64> = projected.dot(&v);
            let mut v_new: Array1<f64> = Array1::zeros(d);
            for i in 0..n {
                for j in 0..d {
                    v_new[j] += projected[[i, j]] * xv[i];
                }
            }

            // Normalize
            let norm: f64 = v_new.iter().map(|x| x * x).sum::<f64>().sqrt();
            if norm > 1e-10 {
                v = v_new.mapv(|x| x / norm);
            }
        }

        // Store component
        components.push(v.clone());

        // Deflate: remove this component from data
        let scores: Array1<f64> = projected.dot(&v);
        for i in 0..n {
            for j in 0..d {
                projected[[i, j]] -= scores[i] * v[j];
            }
        }

        pb.inc(1);
    }
    pb.finish();

    // Project original data onto components
    let mut result = vec![vec![0.0; target_dims]; n];
    for (i, emb) in embeddings.iter().enumerate() {
        for (k, comp) in components.iter().enumerate() {
            let mut sum = 0.0;
            for j in 0..d {
                sum += (emb[j] - mean[j]) * comp[j];
            }
            result[i][k] = sum;
        }
    }

    // Normalize the reduced embeddings
    for emb in &mut result {
        let norm: f64 = emb.iter().map(|x| x * x).sum::<f64>().sqrt();
        if norm > 1e-10 {
            for x in emb.iter_mut() {
                *x /= norm;
            }
        }
    }

    result
}

/// Random Projection for dimensionality reduction (faster than PCA)
/// Based on Johnson-Lindenstrauss lemma - preserves distances well
fn random_projection_reduce(embeddings: &[Vec<f64>], target_dims: usize) -> Vec<Vec<f64>> {
    let n = embeddings.len();
    let d = embeddings[0].len();

    println!(
        "   Reduziere Dimensionen: {} → {} (Random Projection, {} Vektoren)",
        d, target_dims, n
    );

    // Generate random projection matrix
    let mut rng = rand::rngs::StdRng::seed_from_u64(42);
    let normal = Normal::new(0.0, 1.0 / (target_dims as f64).sqrt()).unwrap();

    let projection: Vec<Vec<f64>> = (0..target_dims)
        .map(|_| (0..d).map(|_| normal.sample(&mut rng)).collect())
        .collect();

    // Project all embeddings in parallel
    let result: Vec<Vec<f64>> = embeddings
        .par_iter()
        .map(|emb| {
            let mut reduced = vec![0.0; target_dims];
            for (k, proj_row) in projection.iter().enumerate() {
                for (j, &val) in emb.iter().enumerate() {
                    reduced[k] += val * proj_row[j];
                }
            }
            // Normalize
            let norm: f64 = reduced.iter().map(|x| x * x).sum::<f64>().sqrt();
            if norm > 1e-10 {
                for x in &mut reduced {
                    *x /= norm;
                }
            }
            reduced
        })
        .collect();

    result
}

// ============================================================================
// HDBSCAN Implementation
// ============================================================================

/// Core distance: minimum distance at which a point is considered a core point
fn compute_core_distances(distances: &[Vec<f64>], min_samples: usize) -> Vec<f64> {
    let n = distances.len();
    distances
        .par_iter()
        .map(|row| {
            let mut sorted: Vec<f64> = row.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            // k-th nearest neighbor distance (k = min_samples)
            sorted[min_samples.min(n - 1)]
        })
        .collect()
}

/// Mutual reachability distance
#[inline]
fn mutual_reachability_distance(
    i: usize,
    j: usize,
    distances: &[Vec<f64>],
    core_distances: &[f64],
) -> f64 {
    let d = distances[i][j];
    d.max(core_distances[i]).max(core_distances[j])
}

/// Edge in the minimum spanning tree
#[derive(Clone, Copy, Debug)]
struct MstEdge {
    from: usize,
    to: usize,
    weight: f64,
}

/// Build MST using Prim's algorithm on mutual reachability distances
fn build_mst(distances: &[Vec<f64>], core_distances: &[f64]) -> Vec<MstEdge> {
    let n = distances.len();
    let mut in_tree = vec![false; n];
    let mut edges = Vec::with_capacity(n - 1);

    // Min-heap: (distance, from, to)
    let mut heap: BinaryHeap<(std::cmp::Reverse<OrderedFloat<f64>>, usize, usize)> =
        BinaryHeap::new();

    // Start from node 0
    in_tree[0] = true;
    for j in 1..n {
        let d = mutual_reachability_distance(0, j, distances, core_distances);
        heap.push((std::cmp::Reverse(OrderedFloat(d)), 0, j));
    }

    while edges.len() < n - 1 {
        if let Some((std::cmp::Reverse(OrderedFloat(weight)), from, to)) = heap.pop() {
            if in_tree[to] {
                continue;
            }

            in_tree[to] = true;
            edges.push(MstEdge { from, to, weight });

            // Add edges from new node
            for (j, &is_in_tree) in in_tree.iter().enumerate() {
                if !is_in_tree {
                    let d = mutual_reachability_distance(to, j, distances, core_distances);
                    heap.push((std::cmp::Reverse(OrderedFloat(d)), to, j));
                }
            }
        } else {
            break;
        }
    }

    edges
}

/// Union-Find data structure for efficient cluster merging
struct UnionFind {
    parent: Vec<usize>,
    rank: Vec<usize>,
    size: Vec<usize>,
}

impl UnionFind {
    fn new(n: usize) -> Self {
        Self {
            parent: (0..n).collect(),
            rank: vec![0; n],
            size: vec![1; n],
        }
    }

    fn find(&mut self, x: usize) -> usize {
        if self.parent[x] != x {
            self.parent[x] = self.find(self.parent[x]);
        }
        self.parent[x]
    }

    fn union(&mut self, x: usize, y: usize) -> bool {
        let px = self.find(x);
        let py = self.find(y);
        if px == py {
            return false;
        }

        if self.rank[px] < self.rank[py] {
            self.parent[px] = py;
            self.size[py] += self.size[px];
        } else if self.rank[px] > self.rank[py] {
            self.parent[py] = px;
            self.size[px] += self.size[py];
        } else {
            self.parent[py] = px;
            self.size[px] += self.size[py];
            self.rank[px] += 1;
        }
        true
    }

    #[allow(dead_code)]
    fn size_of(&mut self, x: usize) -> usize {
        let root = self.find(x);
        self.size[root]
    }
}

/// HDBSCAN cluster hierarchy node
#[derive(Clone, Debug)]
struct HdbscanNode {
    #[allow(dead_code)]
    id: usize,
    children: Vec<usize>,
    lambda_birth: f64, // 1/distance at which this cluster was formed
    lambda_death: f64, // 1/distance at which this cluster split
    points: Vec<usize>,
    stability: f64,
    is_leaf: bool,
    selected: bool,
}

/// Build the HDBSCAN cluster tree from MST.
/// Replacement for build_cluster_tree function - lines 549-644.
fn build_cluster_tree(mst: &[MstEdge], n: usize, _min_cluster_size: usize) -> Vec<HdbscanNode> {
    // Sort MST edges by weight (ascending - smallest distances first)
    let mut sorted_edges = mst.to_vec();
    sorted_edges.sort_by(|a, b| a.weight.partial_cmp(&b.weight).unwrap());

    let mut uf = UnionFind::new(n);
    let mut nodes: Vec<HdbscanNode> = Vec::new();

    // Track active cluster for each root (union-find root -> node_id)
    let mut active_clusters: HashMap<usize, usize> = HashMap::new();

    // Initialize: each point starts as its own cluster
    for i in 0..n {
        let node_id = nodes.len();
        nodes.push(HdbscanNode {
            id: node_id,
            children: vec![],
            // NOTE: In a full HDBSCAN implementation, leaf "birth" is related to core distance.
            // For our simplified EOM stability computation we must NOT use +∞ here, otherwise
            // stability becomes degenerate. We'll set birth when the leaf dies (first merge),
            // resulting in a zero-lifespan leaf and preventing leaves from dominating stability.
            lambda_birth: 0.0,
            lambda_death: 0.0,
            points: vec![i],
            stability: 0.0,
            is_leaf: true,
            selected: false,
        });
        active_clusters.insert(i, node_id);
    }

    // Process edges in order of increasing distance
    for edge in sorted_edges {
        let root_a = uf.find(edge.from);
        let root_b = uf.find(edge.to);

        if root_a == root_b {
            continue; // Already in same cluster
        }

        let lambda = if edge.weight > 0.0 {
            1.0 / edge.weight
        } else {
            f64::INFINITY
        };

        // Get the two clusters being merged
        let cluster_a_id = active_clusters[&root_a];
        let cluster_b_id = active_clusters[&root_b];

        // Mark death time for both clusters
        nodes[cluster_a_id].lambda_death = lambda;
        nodes[cluster_b_id].lambda_death = lambda;

        // If these are leaf nodes, set their birth to the same lambda so their lifespan is 0
        // (prevents +∞/degenerate stability at the leaves).
        if nodes[cluster_a_id].children.is_empty() && nodes[cluster_a_id].lambda_birth == 0.0 {
            nodes[cluster_a_id].lambda_birth = lambda;
        }
        if nodes[cluster_b_id].children.is_empty() && nodes[cluster_b_id].lambda_birth == 0.0 {
            nodes[cluster_b_id].lambda_birth = lambda;
        }

        // Merge in union-find
        uf.union(root_a, root_b);
        let new_root = uf.find(root_a);

        // Combine points from both clusters
        let mut new_points = nodes[cluster_a_id].points.clone();
        new_points.extend(&nodes[cluster_b_id].points);

        // Create new parent cluster
        let new_node_id = nodes.len();
        nodes.push(HdbscanNode {
            id: new_node_id,
            children: vec![cluster_a_id, cluster_b_id],
            lambda_birth: lambda,
            lambda_death: 0.0, // Will be set when this cluster merges
            points: new_points,
            stability: 0.0,
            is_leaf: false,
            selected: false,
        });

        // Update active cluster for this root
        active_clusters.remove(&root_a);
        active_clusters.remove(&root_b);
        active_clusters.insert(new_root, new_node_id);
    }

    // Set death time for root node(s) to 0 (they never die)
    for &node_id in active_clusters.values() {
        nodes[node_id].lambda_death = 0.0;
    }

    nodes
}

/// Compute stability for each cluster and select optimal clusters
fn select_clusters(nodes: &mut [HdbscanNode], min_cluster_size: usize) {
    if nodes.is_empty() {
        return;
    }

    // Reset selection flags
    for node in nodes.iter_mut() {
        node.selected = false;
    }

    // Compute (simplified) stability per node.
    // We use: stability = (lambda_birth - lambda_death) * |cluster|
    // where lambda_birth >= lambda_death (lambda decreases over merges).
    for node in nodes.iter_mut() {
        if node.children.is_empty() {
            node.stability = 0.0;
            continue;
        }
        if node.points.len() < min_cluster_size {
            node.stability = 0.0;
            continue;
        }

        let birth = node.lambda_birth;
        let death = node.lambda_death; // root death = 0.0
        let lifespan = (birth - death).max(0.0);

        // IMPORTANT:
        // Using size * lifespan tends to make the root dominate and collapses everything into 1 cluster.
        // We use a sub-linear size scaling to approximate HDBSCAN's EOM behavior more closely:
        // large, short-lived clusters should not automatically beat several stable subclusters.
        node.stability = lifespan * (node.points.len() as f64).sqrt();
    }

    // EOM selection (dynamic programming):
    // process nodes from leaves to root. In our construction, children always have smaller ids
    // than their parent (parent nodes are appended). So iterating i=0..N is bottom-up.
    let mut subtree_best_stability = vec![0.0f64; nodes.len()];

    for i in 0..nodes.len() {
        if nodes[i].children.is_empty() || nodes[i].points.len() < min_cluster_size {
            subtree_best_stability[i] = 0.0;
            continue;
        }

        let mut children_sum = 0.0;
        for &child_idx in &nodes[i].children {
            if child_idx < nodes.len() {
                children_sum += subtree_best_stability[child_idx];
            }
        }

        // Select this cluster if it is more stable than the sum of its children's best stabilities.
        if nodes[i].stability > children_sum {
            nodes[i].selected = true;

            // Deselect all descendants to keep the selected set disjoint.
            let mut stack: Vec<usize> = nodes[i].children.clone();
            while let Some(idx) = stack.pop() {
                if idx >= nodes.len() {
                    continue;
                }
                nodes[idx].selected = false;
                stack.extend(nodes[idx].children.iter().copied());
            }

            subtree_best_stability[i] = nodes[i].stability;
        } else {
            // Keep children selections
            subtree_best_stability[i] = children_sum;
        }
    }
}

/// Extract flat clustering from HDBSCAN result
fn extract_flat_clusters(nodes: &[HdbscanNode], n: usize, min_cluster_size: usize) -> Vec<i32> {
    let mut labels = vec![-1i32; n]; // -1 = noise

    if nodes.is_empty() {
        return labels;
    }

    // Find selected clusters (leaves)
    let mut cluster_id = 0i32;
    for node in nodes.iter() {
        if node.selected && node.points.len() >= min_cluster_size {
            for &pt in &node.points {
                if labels[pt] == -1 {
                    labels[pt] = cluster_id;
                }
            }
            cluster_id += 1;
        }
    }

    labels
}

/// Main HDBSCAN function
fn hdbscan(embeddings: &[Vec<f64>], min_cluster_size: usize, min_samples: usize) -> Vec<i32> {
    let n = embeddings.len();

    println!(
        "   Parameter: min_cluster_size={}, min_samples={}",
        min_cluster_size, min_samples
    );
    println!("   Anzahl Topics: {}", n);

    // Step 1: Compute distance matrix
    println!("   Berechne Distanz-Matrix...");
    let distances = compute_distance_matrix(embeddings);

    // Step 2: Compute core distances
    println!("   Berechne Core-Distanzen...");
    let core_distances = compute_core_distances(&distances, min_samples);

    // Step 3: Build MST
    println!("   Erstelle Minimum Spanning Tree...");
    let mst = build_mst(&distances, &core_distances);

    // Step 4: Build cluster hierarchy
    println!("   Erstelle Cluster-Hierarchie...");
    let mut nodes = build_cluster_tree(&mst, n, min_cluster_size);

    // Step 5: Select optimal clusters
    println!("   Wähle optimale Cluster...");
    select_clusters(&mut nodes, min_cluster_size);

    // Debug: count selected nodes
    let selected_count = nodes.iter().filter(|n| n.selected).count();
    let leaf_count = nodes.iter().filter(|n| n.is_leaf).count();
    println!(
        "   Debug: {} nodes total, {} leaves, {} selected",
        nodes.len(),
        leaf_count,
        selected_count
    );

    // Step 6: Extract flat clustering
    let labels = extract_flat_clusters(&nodes, n, min_cluster_size);

    // If the current HDBSCAN-tree selection degenerates (e.g. 1 mega-cluster or almost one per point),
    // fall back to a DBSCAN clustering with automatically selected epsilon. This keeps V2 usable
    // and restores meaningful noise/outliers.
    let num_clusters = labels
        .iter()
        .filter(|&&l| l >= 0)
        .max()
        .map_or(0, |&m| m + 1);
    let num_noise = labels.iter().filter(|&&l| l == -1).count();

    let degenerate_many = (num_clusters as usize) > (n / 2);
    if num_clusters <= 1 || degenerate_many {
        println!("   ⚠️  HDBSCAN selection degenerate (clusters={}, noise={}). Falling back to DBSCAN(auto-eps)...", num_clusters, num_noise);
        let (db_labels, eps) = dbscan_auto_eps(embeddings, min_samples);
        println!("   ✓ Fallback DBSCAN eps={:.4}", eps);
        return db_labels;
    }

    labels
}

/// Alternative: DBSCAN with automatic epsilon selection
#[allow(dead_code)]
fn dbscan_auto_eps(embeddings: &[Vec<f64>], min_samples: usize) -> (Vec<i32>, f64) {
    let n = embeddings.len();

    // Compute distance matrix
    let distances = compute_distance_matrix(embeddings);

    // Compute k-distance for each point
    let k = min_samples;
    let mut k_distances: Vec<f64> = distances
        .iter()
        .map(|row| {
            let mut sorted: Vec<f64> = row.clone();
            sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
            sorted[k.min(n - 1)]
        })
        .collect();

    k_distances.sort_by(|a, b| a.partial_cmp(b).unwrap());

    // Find the "elbow" in the k-distance graph
    // Use second derivative to find the point of maximum curvature
    let mut max_curvature = 0.0;
    let mut best_idx = n / 2;

    // Avoid picking the extreme tail where curvature is often noisy (can lead to eps too large
    // and a single mega-cluster). Search within [10%, 90%].
    let start_i = (n / 10).max(1);
    let end_i = ((n * 9) / 10).min(n.saturating_sub(2));

    for i in start_i..=end_i {
        let second_deriv = (k_distances[i + 1] - 2.0 * k_distances[i] + k_distances[i - 1]).abs();
        if second_deriv > max_curvature {
            max_curvature = second_deriv;
            best_idx = i;
        }
    }

    let raw_eps = k_distances[best_idx];
    // Heuristic: the elbow-point often skews too permissive for cosine distances in high-dim space,
    // collapsing into a single mega-cluster. Scale down to encourage separation + noise.
    let eps = raw_eps * 0.75;
    println!(
        "   Auto-Epsilon: {:.4} → {:.4} (scale 0.75, index {})",
        raw_eps, eps, best_idx
    );

    // Run DBSCAN with this epsilon
    let labels = dbscan(&distances, eps, min_samples);

    (labels, eps)
}

/// Simple DBSCAN implementation
#[allow(dead_code)]
fn dbscan(distances: &[Vec<f64>], eps: f64, min_samples: usize) -> Vec<i32> {
    let n = distances.len();
    let mut labels = vec![-1i32; n];
    let mut cluster_id = 0;

    for i in 0..n {
        if labels[i] != -1 {
            continue;
        }

        // Find neighbors
        let neighbors: Vec<usize> = (0..n).filter(|&j| distances[i][j] <= eps).collect();

        if neighbors.len() < min_samples {
            // Noise point (will be labeled later if reachable from a core point)
            continue;
        }

        // Start a new cluster
        labels[i] = cluster_id;
        let mut queue: Vec<usize> = neighbors.clone();
        let mut visited = vec![false; n];
        visited[i] = true;

        while let Some(pt) = queue.pop() {
            if visited[pt] {
                continue;
            }
            visited[pt] = true;

            if labels[pt] == -1 {
                labels[pt] = cluster_id;
            } else if labels[pt] != cluster_id {
                continue;
            }

            let pt_neighbors: Vec<usize> = (0..n).filter(|&j| distances[pt][j] <= eps).collect();

            if pt_neighbors.len() >= min_samples {
                for &neighbor in &pt_neighbors {
                    if labels[neighbor] == -1 {
                        labels[neighbor] = cluster_id;
                    }
                    if !visited[neighbor] {
                        queue.push(neighbor);
                    }
                }
            }
        }

        cluster_id += 1;
    }

    labels
}

/// Compute cosine distance matrix (parallel)
fn compute_distance_matrix(embeddings: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let n = embeddings.len();

    // Parallel computation
    let results: Vec<(usize, usize, f64)> = (0..n)
        .into_par_iter()
        .flat_map(|i| {
            (i + 1..n)
                .map(|j| {
                    let dist = 1.0 - cosine_similarity(&embeddings[i], &embeddings[j]);
                    (i, j, dist)
                })
                .collect::<Vec<_>>()
        })
        .collect();

    let mut distances = vec![vec![0.0; n]; n];
    for (i, j, dist) in results {
        distances[i][j] = dist;
        distances[j][i] = dist;
    }

    distances
}

#[inline]
fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;

    for i in 0..a.len() {
        dot_product += a[i] * b[i];
        norm_a += a[i] * a[i];
        norm_b += b[i] * b[i];
    }

    if norm_a > 0.0 && norm_b > 0.0 {
        dot_product / (norm_a.sqrt() * norm_b.sqrt())
    } else {
        0.0
    }
}

// ============================================================================
// Post-processing: Merge small clusters
// ============================================================================

/// Merge clusters that are too small into their nearest neighbor
fn merge_small_clusters(
    labels: &[i32],
    embeddings: &[Vec<f64>],
    min_size: usize,
    outlier_threshold: f64,
) -> Vec<i32> {
    let mut new_labels = labels.to_vec();

    // Count cluster sizes
    let mut cluster_sizes: HashMap<i32, usize> = HashMap::new();
    for &label in labels {
        if label >= 0 {
            *cluster_sizes.entry(label).or_insert(0) += 1;
        }
    }

    // Compute cluster centroids
    let mut cluster_centroids: HashMap<i32, Vec<f64>> = HashMap::new();
    let mut cluster_counts: HashMap<i32, usize> = HashMap::new();

    for (i, &label) in labels.iter().enumerate() {
        if label >= 0 {
            let centroid = cluster_centroids
                .entry(label)
                .or_insert_with(|| vec![0.0; embeddings[0].len()]);
            for (j, &val) in embeddings[i].iter().enumerate() {
                centroid[j] += val;
            }
            *cluster_counts.entry(label).or_insert(0) += 1;
        }
    }

    for (label, centroid) in cluster_centroids.iter_mut() {
        let count = cluster_counts[label] as f64;
        for val in centroid.iter_mut() {
            *val /= count;
        }
    }

    // Find small clusters and merge them
    let small_clusters: Vec<i32> = cluster_sizes
        .iter()
        .filter(|(_, &size)| size < min_size)
        .map(|(&label, _)| label)
        .collect();

    let large_clusters: Vec<i32> = cluster_sizes
        .iter()
        .filter(|(_, &size)| size >= min_size)
        .map(|(&label, _)| label)
        .collect();

    if large_clusters.is_empty() {
        return new_labels;
    }

    for small_label in small_clusters {
        if let Some(small_centroid) = cluster_centroids.get(&small_label) {
            // Find nearest large cluster
            let mut best_label = large_clusters[0];
            let mut best_sim = -1.0;

            for &large_label in &large_clusters {
                if let Some(large_centroid) = cluster_centroids.get(&large_label) {
                    let sim = cosine_similarity(small_centroid, large_centroid);
                    if sim > best_sim {
                        best_sim = sim;
                        best_label = large_label;
                    }
                }
            }

            // Reassign all points
            for label in new_labels.iter_mut() {
                if *label == small_label {
                    *label = best_label;
                }
            }
        }
    }

    // Reassign noise points to nearest cluster ONLY if similarity exceeds threshold
    for (i, label) in new_labels.iter_mut().enumerate() {
        if *label == -1 && !large_clusters.is_empty() {
            let mut best_label = large_clusters[0];
            let mut best_sim = -1.0;

            for &cluster_label in &large_clusters {
                if let Some(centroid) = cluster_centroids.get(&cluster_label) {
                    let sim = cosine_similarity(&embeddings[i], centroid);
                    if sim > best_sim {
                        best_sim = sim;
                        best_label = cluster_label;
                    }
                }
            }

            // Only assign if similarity exceeds threshold
            if best_sim >= outlier_threshold {
                *label = best_label;
            }
            // else: keep as -1 (noise/outlier)
        }
    }

    // Renumber clusters to be contiguous
    let unique_labels: HashSet<i32> = new_labels.iter().filter(|&&l| l >= 0).copied().collect();
    let mut label_map: HashMap<i32, i32> = HashMap::new();
    for (new_id, &old_label) in unique_labels.iter().enumerate() {
        label_map.insert(old_label, new_id as i32);
    }

    for label in new_labels.iter_mut() {
        if *label >= 0 {
            *label = label_map[label];
        }
    }

    new_labels
}

// ============================================================================
// Cluster Naming (same as V1)
// ============================================================================

fn find_cluster_name(
    cluster_items: &[usize],
    all_topics: &[TopicWithEmbedding],
    use_relevance_weighting: bool,
    default_topic_duration_sec: u32,
) -> String {
    let mut keyword_counts: HashMap<String, f64> = HashMap::new();
    let mut topic_words: HashMap<String, f64> = HashMap::new();

    let generic_words: HashSet<&str> = [
        "und",
        "der",
        "die",
        "das",
        "in",
        "im",
        "von",
        "für",
        "mit",
        "über",
        "zur",
        "zum",
        "diskussion",
        "thema",
        "themen",
        "aspekte",
        "entwicklung",
        "entwicklungen",
        "nutzung",
        "verwendung",
        "einsatz",
        "einfluss",
        "bedeutung",
        "rolle",
        "allgemein",
        "allgemeine",
        "verschiedene",
        "aktuelle",
        "neue",
        "neuen",
        "technologie",
        "technologien",
        "technik",
        "technisch",
        "technische",
        "zukunft",
        "zukünftige",
        "trends",
        "trend",
    ]
    .iter()
    .copied()
    .collect();

    for &idx in cluster_items {
        let topic = &all_topics[idx];
        let weight = if use_relevance_weighting {
            topic_relevance_sec(topic, default_topic_duration_sec) as f64
        } else {
            1.0
        };

        for kw in &topic.keywords {
            let key = kw.to_lowercase();
            *keyword_counts.entry(key).or_insert(0.0) += weight;
        }

        let words: Vec<String> = topic
            .topic
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphabetic() || c == ' ' || c == '-' {
                    c
                } else {
                    ' '
                }
            })
            .collect::<String>()
            .split_whitespace()
            .filter(|w| w.len() > 2 && !generic_words.contains(w))
            .map(|s| s.to_string())
            .collect();

        for word in words {
            *topic_words.entry(word).or_insert(0.0) += weight;
        }
    }

    let mut all_counts: HashMap<String, f64> = topic_words.clone();
    for (kw, count) in keyword_counts {
        *all_counts.entry(kw).or_insert(0.0) += count * 2.0;
    }

    if all_counts.is_empty() {
        return "Sonstiges".to_string();
    }

    let mut sorted: Vec<_> = all_counts.into_iter().collect();
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    let top_words: Vec<_> = sorted.iter().take(3).collect();
    if top_words.is_empty() {
        return "Sonstiges".to_string();
    }

    let first_word = &top_words[0].0;
    let mut chars = first_word.chars();
    let name = match chars.next() {
        Some(first_char) => {
            let mut s = first_char.to_uppercase().to_string();
            s.push_str(chars.as_str());
            s
        }
        None => first_word.to_string(),
    };

    if top_words.len() > 1 && top_words[0].1 <= top_words[1].1 * 2.0 {
        let second_word = &top_words[1].0;
        let mut chars = second_word.chars();
        let second = match chars.next() {
            Some(first_char) => {
                let mut s = first_char.to_uppercase().to_string();
                s.push_str(chars.as_str());
                s
            }
            None => second_word.to_string(),
        };
        return format!("{} & {}", name, second);
    }

    name
}

fn normalized_occurrences(
    topic: &TopicWithEmbedding,
    default_topic_duration_sec: u32,
) -> Vec<ClusterTopicOccurrence> {
    if let Some(occ) = topic.occurrences.as_ref() {
        if !occ.is_empty() {
            return occ
                .iter()
                .map(|o| ClusterTopicOccurrence {
                    episode_number: o.episode_number,
                    duration_sec: o.duration_sec.unwrap_or(default_topic_duration_sec),
                    position_sec: o.position_sec.unwrap_or(0),
                })
                .collect();
        }
    }

    // Backwards compatibility: older embeddings DBs don't have occurrences.
    // Synthesize one occurrence per episode with default duration and position 0.
    topic
        .episodes
        .iter()
        .map(|&ep| ClusterTopicOccurrence {
            episode_number: ep,
            duration_sec: default_topic_duration_sec,
            position_sec: 0,
        })
        .collect()
}

fn topic_relevance_sec(topic: &TopicWithEmbedding, default_topic_duration_sec: u32) -> u64 {
    normalized_occurrences(topic, default_topic_duration_sec)
        .iter()
        .map(|o| o.duration_sec as u64)
        .sum()
}

fn call_llm_for_naming<'a>(
    topics: Vec<String>,
    settings: &'a Settings,
    model: Option<&'a str>,
    retry_count: u32,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send + 'a>> {
    Box::pin(async move {
        let client = reqwest::Client::new();
        let model_name = model.unwrap_or(&settings.llm.model);
        let max_retries = settings
            .topic_extraction
            .as_ref()
            .and_then(|s| s.max_retries)
            .unwrap_or(5);
        let retry_delay_ms = settings
            .topic_extraction
            .as_ref()
            .and_then(|s| s.retry_delay_ms)
            .unwrap_or(10000);

        let system_prompt = r#"Du bist ein Experte für präzise Kategorisierung. Deine Aufgabe ist es, für eine Gruppe von Podcast-Topics einen kurzen, prägnanten Kategorie-Namen zu finden.

Regeln:
- Der Name sollte 1-3 Wörter lang sein
- Sei spezifisch, nicht generisch (z.B. "iPhone" statt "Mobilgeräte", "Podcasting" statt "Medien")
- Wenn es um ein konkretes Produkt/Thema geht, nenne es beim Namen
- Die Topics sind nach Relevanz sortiert - die ersten sind wichtiger!
- Antworte NUR mit dem Kategorie-Namen, nichts anderes"#;

        let user_prompt = format!(
            "Finde einen kurzen, prägnanten Namen für diese Gruppe von Topics (sortiert nach Relevanz, wichtigste zuerst):\n\n{}\n\nKategorie-Name:",
            topics.iter().map(|t| format!("- {}", t)).collect::<Vec<_>>().join("\n")
        );

        let request = LlmRequest {
            model: model_name.to_string(),
            messages: vec![
                LlmRequestMessage {
                    role: "system".to_string(),
                    content: system_prompt.to_string(),
                },
                LlmRequestMessage {
                    role: "user".to_string(),
                    content: user_prompt,
                },
            ],
            temperature: settings.llm.temperature.unwrap_or(0.3),
            max_tokens: 50,
        };

        match client
            .post(format!("{}/chat/completions", settings.llm.base_url))
            .header("Content-Type", "application/json")
            .header("Authorization", format!("Bearer {}", settings.llm.api_key))
            .json(&request)
            .timeout(tokio::time::Duration::from_secs(30))
            .send()
            .await
        {
            Ok(response) => {
                let status = response.status();
                if status == 429 || status == 503 {
                    if retry_count < max_retries {
                        let backoff_ms = retry_delay_ms * 2u64.pow(retry_count);
                        eprintln!(
                            "   ⚠️  Rate limit ({}), warte {}ms vor Retry {}/{}",
                            status,
                            backoff_ms,
                            retry_count + 1,
                            max_retries
                        );
                        tokio::time::sleep(tokio::time::Duration::from_millis(backoff_ms)).await;
                        return call_llm_for_naming(topics, settings, model, retry_count + 1).await;
                    } else {
                        eprintln!("   ❌ Max retries erreicht nach Rate Limit");
                        return None;
                    }
                }
                if status.is_success() {
                    match response.json::<LlmResponse>().await {
                        Ok(data) => {
                            let content = data.choices[0].message.content.trim();
                            let cleaned = content.replace(&['\"', '\''][..], "");
                            return Some(cleaned);
                        }
                        Err(e) => {
                            eprintln!("   ❌ JSON Parse Error: {}", e);
                            return None;
                        }
                    }
                }
                eprintln!("   ❌ HTTP Status: {}", status);
                None
            }
            Err(e) => {
                if retry_count < max_retries {
                    let backoff_ms = retry_delay_ms * 2u64.pow(retry_count);
                    eprintln!(
                        "   ⚠️  Request Error: {}, Retry {}/{}",
                        e,
                        retry_count + 1,
                        max_retries
                    );
                    tokio::time::sleep(tokio::time::Duration::from_millis(backoff_ms)).await;
                    return call_llm_for_naming(topics, settings, model, retry_count + 1).await;
                }
                eprintln!("   ❌ Request failed: {}", e);
                None
            }
        }
    })
}

// ============================================================================
// Main
// ============================================================================

/// Load variant settings from variants.json
fn load_variant_settings(
    variant_name: &str,
) -> Result<(String, VariantSettingsJson), Box<dyn std::error::Error>> {
    let variants_path = PathBuf::from("variants.json");
    if !variants_path.exists() {
        return Err("variants.json not found".into());
    }

    let variants_content = fs::read_to_string(&variants_path)?;
    let variants_config: VariantsConfig = serde_json::from_str(&variants_content)?;

    let variant = variants_config
        .variants
        .get(variant_name)
        .ok_or_else(|| format!("Variant '{}' not found in variants.json", variant_name))?;

    Ok((variant.name.clone(), variant.settings.clone()))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let start_time = Instant::now();

    // Parse command-line arguments
    let args = Args::parse();

    println!("🔬 Topic-Clustering V2 für Freakshow Episoden");
    println!("   (HDBSCAN + Dimensionsreduktion)\n");

    // Load base settings
    let settings_path = PathBuf::from("settings.json");
    if !settings_path.exists() {
        eprintln!("\n❌ settings.json nicht gefunden!");
        eprintln!(
            "   Kopiere settings.example.json zu settings.json und passe die Konfiguration an.\n"
        );
        std::process::exit(1);
    }

    let settings_content = fs::read_to_string(&settings_path)?;
    let settings: Settings = serde_json::from_str(&settings_content)?;

    // Load variant settings if specified, otherwise use base settings
    let (
        min_cluster_size,
        min_samples,
        reduced_dims,
        use_llm_naming,
        use_relevance_weighting,
        outlier_threshold,
        default_topic_duration_sec,
    ) = if let Some(ref variant_name) = args.variant {
        match load_variant_settings(variant_name) {
            Ok((variant_display_name, variant_settings)) => {
                println!(
                    "📋 Lade Variante: {} ({})\n",
                    variant_display_name, variant_name
                );
                (
                    variant_settings
                        .min_cluster_size
                        .or(settings
                            .topic_clustering
                            .as_ref()
                            .and_then(|s| s.min_cluster_size))
                        .unwrap_or(5),
                    variant_settings
                        .min_samples
                        .or(settings
                            .topic_clustering
                            .as_ref()
                            .and_then(|s| s.min_samples))
                        .unwrap_or(3),
                    variant_settings
                        .reduced_dimensions
                        .or(settings
                            .topic_clustering
                            .as_ref()
                            .and_then(|s| s.reduced_dimensions))
                        .unwrap_or(50),
                    variant_settings
                        .use_llm_naming
                        .or(settings
                            .topic_clustering
                            .as_ref()
                            .and_then(|s| s.use_llm_naming))
                        .unwrap_or(true),
                    variant_settings
                        .use_relevance_weighting
                        .or(settings
                            .topic_clustering
                            .as_ref()
                            .and_then(|s| s.use_relevance_weighting))
                        .unwrap_or(true),
                    variant_settings
                        .outlier_threshold
                        .or(settings
                            .topic_clustering
                            .as_ref()
                            .and_then(|s| s.outlier_threshold))
                        .unwrap_or(0.15),
                    variant_settings.default_topic_duration_sec.unwrap_or(300),
                )
            }
            Err(e) => {
                eprintln!(
                    "\n❌ Fehler beim Laden der Variante '{}': {}",
                    variant_name, e
                );
                std::process::exit(1);
            }
        }
    } else {
        (
            settings
                .topic_clustering
                .as_ref()
                .and_then(|s| s.min_cluster_size)
                .unwrap_or(5),
            settings
                .topic_clustering
                .as_ref()
                .and_then(|s| s.min_samples)
                .unwrap_or(3),
            settings
                .topic_clustering
                .as_ref()
                .and_then(|s| s.reduced_dimensions)
                .unwrap_or(50),
            settings
                .topic_clustering
                .as_ref()
                .and_then(|s| s.use_llm_naming)
                .unwrap_or(true),
            settings
                .topic_clustering
                .as_ref()
                .and_then(|s| s.use_relevance_weighting)
                .unwrap_or(true),
            settings
                .topic_clustering
                .as_ref()
                .and_then(|s| s.outlier_threshold)
                .unwrap_or(0.15),
            300,
        )
    };

    // Load embeddings
    println!("📂 Lade Embeddings-Datenbank...");
    let db_path = PathBuf::from("topic-embeddings.json");
    if !db_path.exists() {
        eprintln!("\n❌ Keine Embeddings-Datenbank gefunden!");
        eprintln!("   Erstelle zuerst die Datenbank mit:");
        eprintln!("   node create-embeddings.js\n");
        std::process::exit(1);
    }

    let db_content = fs::read_to_string(&db_path)?;
    let db: EmbeddingsDatabase = serde_json::from_str(&db_content)?;

    println!("   Modell: {}", db.embedding_model);
    println!("   Topics: {}", db.topics.len());
    println!("   Dimensionen: {}", db.embedding_dimensions);
    println!("   Erstellt: {}", db.created_at);

    // ------------------------------------------------------------------------
    // Filter ubiquitous / boilerplate topics (e.g. intro/outro)
    // ------------------------------------------------------------------------
    let ubiquitous_share_threshold = settings
        .topic_clustering
        .as_ref()
        .and_then(|s| s.ubiquitous_topic_max_episode_share)
        .unwrap_or(0.90);

    let mut all_episode_ids: HashSet<u32> = HashSet::new();
    for t in db.topics.iter() {
        for &ep in &t.episodes {
            all_episode_ids.insert(ep);
        }
    }
    let total_episodes = all_episode_ids.len().max(1);

    let mut filtered_topics: Vec<TopicWithEmbedding> = Vec::with_capacity(db.topics.len());
    let mut skipped_by_name = 0usize;
    let mut skipped_by_share = 0usize;

    for t in db.topics.iter().cloned() {
        let topic_lc = t.topic.to_lowercase();
        let is_intro_outro = topic_lc.contains("intro") || topic_lc.contains("outro");

        if is_intro_outro {
            skipped_by_name += 1;
            continue;
        }

        let share = (t.episodes.len() as f64) / (total_episodes as f64);
        if share >= ubiquitous_share_threshold {
            skipped_by_share += 1;
            continue;
        }

        filtered_topics.push(t);
    }

    if skipped_by_name > 0 || skipped_by_share > 0 {
        println!(
            "🧹 Filter: entferne {} Intro/Outro-Themen + {} ubiquitäre Themen (≥ {:.0}% von {} Episoden).",
            skipped_by_name,
            skipped_by_share,
            ubiquitous_share_threshold * 100.0,
            total_episodes
        );
        println!("   Topics nach Filter: {}", filtered_topics.len());
    }

    println!("\n📊 V2 Clustering-Einstellungen:");
    println!("   Algorithmus:         HDBSCAN");
    println!("   Min Cluster Size:    {}", min_cluster_size);
    println!("   Min Samples:         {}", min_samples);
    println!("   Reduzierte Dims:     {}", reduced_dims);
    println!(
        "   Relevanz-Gewichtung: {}",
        if use_relevance_weighting {
            "Ja"
        } else {
            "Nein"
        }
    );
    println!("   Default Topic Dauer: {}s", default_topic_duration_sec);
    println!(
        "   LLM-Benennung:       {}\n",
        if use_llm_naming { "Ja" } else { "Nein" }
    );

    let unique_topics = filtered_topics.clone();
    let embeddings: Vec<Vec<f64>> = filtered_topics
        .iter()
        .map(|t| t.embedding.clone())
        .collect();

    // Step 1: Dimensionality reduction
    println!("📉 Dimensionsreduktion...");
    let reduced_embeddings = if reduced_dims < db.embedding_dimensions {
        // Use random projection (faster) or PCA (better quality)
        random_projection_reduce(&embeddings, reduced_dims)
    } else {
        embeddings.clone()
    };

    // Step 2: HDBSCAN clustering
    println!("\n📊 HDBSCAN Clustering...");
    let labels = hdbscan(&reduced_embeddings, min_cluster_size, min_samples);

    // Count clusters and noise
    let num_clusters = labels
        .iter()
        .filter(|&&l| l >= 0)
        .max()
        .map_or(0, |&m| m + 1);
    let num_noise = labels.iter().filter(|&&l| l == -1).count();
    println!(
        "   ✓ {} Cluster gefunden, {} Noise-Punkte",
        num_clusters, num_noise
    );

    // Step 3: Merge small clusters and assign noise
    println!("\n🔄 Post-Processing...");
    let final_labels = merge_small_clusters(
        &labels,
        &reduced_embeddings,
        min_cluster_size,
        outlier_threshold,
    );

    let final_num_clusters = final_labels
        .iter()
        .filter(|&&l| l >= 0)
        .max()
        .map_or(0, |&m| m + 1);
    let final_num_outliers = final_labels.iter().filter(|&&l| l == -1).count();
    println!("   ✓ {} finale Cluster nach Merge", final_num_clusters);
    println!(
        "   ✓ {} Outliers (Threshold: {})",
        final_num_outliers, outlier_threshold
    );

    // Step 4: Build cluster structures
    println!("\n🏷️  Cluster benennen...");
    let delay_ms = settings
        .topic_extraction
        .as_ref()
        .and_then(|s| s.request_delay_ms)
        .unwrap_or(2000);

    // Group topics by cluster
    let mut cluster_topics: HashMap<i32, Vec<usize>> = HashMap::new();
    for (i, &label) in final_labels.iter().enumerate() {
        if label >= 0 {
            cluster_topics.entry(label).or_default().push(i);
        }
    }

    let pb = ProgressBar::new(cluster_topics.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("   [{bar:40.cyan/blue}] {pos}/{len} - {msg}")
            .unwrap()
            .progress_chars("#>-"),
    );

    let mut named_clusters = Vec::new();
    let model = settings
        .topic_clustering
        .as_ref()
        .and_then(|s| s.model.as_deref());

    for (i, (_cluster_label, topic_indices)) in cluster_topics.iter().enumerate() {
        let cluster_topics_data: Vec<_> = topic_indices
            .iter()
            .map(|&idx| unique_topics[idx].clone())
            .collect();

        // Determine if outlier based on cluster cohesion
        let is_outlier = cluster_topics_data.len() < min_cluster_size;

        let name = if is_outlier {
            pb.set_message("\"Sonstiges\" (Outlier)".to_string());
            "Sonstiges".to_string()
        } else if use_llm_naming && cluster_topics_data.len() > 1 {
            let mut sorted_topics = cluster_topics_data.clone();
            sorted_topics.sort_by(|a, b| {
                topic_relevance_sec(b, default_topic_duration_sec)
                    .cmp(&topic_relevance_sec(a, default_topic_duration_sec))
            });
            let top_topics: Vec<String> = sorted_topics
                .iter()
                .take(10)
                .map(|t| t.topic.clone())
                .collect();

            // Rate limit prevention
            if i > 0 && i % 50 == 0 {
                pb.set_message("⏸️  Pause (Rate Limit Prävention)".to_string());
                tokio::time::sleep(tokio::time::Duration::from_millis(30000)).await;
            }

            match call_llm_for_naming(top_topics, &settings, model, 0).await {
                Some(llm_name) => {
                    pb.set_message(format!("\"{}\" (LLM)", llm_name));
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                    llm_name
                }
                None => {
                    let heuristic_name = find_cluster_name(
                        topic_indices,
                        &unique_topics,
                        use_relevance_weighting,
                        default_topic_duration_sec,
                    );
                    pb.set_message(format!("\"{}\" (Heuristik)", heuristic_name));
                    heuristic_name
                }
            }
        } else {
            let heuristic_name = find_cluster_name(
                topic_indices,
                &unique_topics,
                use_relevance_weighting,
                default_topic_duration_sec,
            );
            pb.set_message(format!("\"{}\" (Heuristik)", heuristic_name));
            heuristic_name
        };

        // Collect all episodes
        let mut all_episodes = HashSet::new();
        for topic in &cluster_topics_data {
            for &ep in &topic.episodes {
                all_episodes.insert(ep);
            }
        }
        let mut episodes: Vec<u32> = all_episodes.into_iter().collect();
        episodes.sort_unstable();

        let cluster_relevance_sec: u64 = cluster_topics_data
            .iter()
            .map(|t| topic_relevance_sec(t, default_topic_duration_sec))
            .sum();

        // Create ID from name
        let id = name
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == 'ä' || c == 'ö' || c == 'ü' || c == 'ß' {
                    c
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        named_clusters.push(NamedCluster {
            id,
            name,
            is_outlier,
            topic_count: cluster_topics_data.len(),
            episode_count: episodes.len(),
            relevance_sec: cluster_relevance_sec,
            topics: cluster_topics_data
                .iter()
                .map(|t| ClusterTopic {
                    topic: t.topic.clone(),
                    count: t.count,
                    keywords: t.keywords.iter().take(5).cloned().collect(),
                    relevance_sec: topic_relevance_sec(t, default_topic_duration_sec),
                    occurrences: normalized_occurrences(t, default_topic_duration_sec),
                })
                .collect(),
            episodes,
        });

        pb.inc(1);
    }

    pb.finish_with_message("Done");

    // Sort by relevance (duration) so "bigger" clusters bubble to the top
    named_clusters.sort_by(|a, b| b.relevance_sec.cmp(&a.relevance_sec));

    let outlier_count = named_clusters.iter().filter(|c| c.is_outlier).count();
    println!("\n   ℹ️  {} Outlier-Cluster gefunden\n", outlier_count);

    // Save results (same format as V1)
    let taxonomy_file = PathBuf::from("topic-taxonomy.json");

    let result = TaxonomyResult {
        created_at: chrono::Utc::now().to_rfc3339(),
        method: "hdbscan-v2".to_string(),
        embedding_model: db.embedding_model.clone(),
        embeddings_created_at: db.created_at.clone(),
        total_topics: db.total_topics_raw,
        unique_topics: unique_topics.len(),
        settings: ClusterSettings {
            clusters: named_clusters.len(),
            outlier_threshold,
            linkage_method: format!(
                "hdbscan(min_cluster_size={}, min_samples={})",
                min_cluster_size, min_samples
            ),
            use_relevance_weighting,
        },
        statistics: Statistics {
            cluster_count: named_clusters.len(),
            outlier_count,
            outlier_percentage: format!(
                "{:.1}%",
                (outlier_count as f64 / named_clusters.len() as f64) * 100.0
            ),
        },
        clusters: named_clusters
            .iter()
            .map(|c| TaxonomyCluster {
                id: c.id.clone(),
                name: c.name.clone(),
                description: format!("{} Topics in {} Episoden", c.topic_count, c.episode_count),
                is_outlier: c.is_outlier,
                topic_count: c.topic_count,
                episode_count: c.episode_count,
                relevance_sec: c.relevance_sec,
                sample_topics: c.topics.iter().take(5).map(|t| t.topic.clone()).collect(),
                episodes: c.episodes.clone(),
            })
            .collect(),
    };

    let result_json = serde_json::to_string_pretty(&result)?;
    fs::write(&taxonomy_file, result_json)?;
    println!("✅ Taxonomie gespeichert: {:?}", taxonomy_file);

    // Save detailed mapping
    #[derive(Serialize)]
    struct DetailedCluster {
        id: String,
        name: String,
        #[serde(rename = "topicCount")]
        topic_count: usize,
        #[serde(rename = "relevanceSec")]
        relevance_sec: u64,
        topics: Vec<ClusterTopic>,
    }

    #[derive(Serialize)]
    struct DetailedMapping {
        #[serde(rename = "createdAt")]
        created_at: String,
        clusters: Vec<DetailedCluster>,
    }

    let detailed_file = PathBuf::from("topic-taxonomy-detailed.json");
    let detailed_mapping = DetailedMapping {
        created_at: chrono::Utc::now().to_rfc3339(),
        clusters: named_clusters
            .iter()
            .map(|c| DetailedCluster {
                id: c.id.clone(),
                name: c.name.clone(),
                topic_count: c.topic_count,
                relevance_sec: c.relevance_sec,
                topics: c.topics.clone(),
            })
            .collect(),
    };

    let detailed_json = serde_json::to_string_pretty(&detailed_mapping)?;
    fs::write(&detailed_file, detailed_json)?;
    println!("✅ Detailed Topic-Mapping gespeichert: {:?}", detailed_file);

    // Print top clusters
    println!("\n📋 Top 15 Cluster:");
    for (i, c) in named_clusters.iter().take(15).enumerate() {
        let outlier_tag = if c.is_outlier { " [Outlier]" } else { "" };
        println!(
            "   {}. {}{} ({} Episoden, {} Topics)",
            i + 1,
            c.name,
            outlier_tag,
            c.episode_count,
            c.topic_count
        );
        let examples: Vec<String> = c.topics.iter().take(3).map(|t| t.topic.clone()).collect();
        println!("      Beispiele: {}", examples.join(", "));
    }

    let elapsed = start_time.elapsed();
    println!("\n✨ Statistik:");
    println!(
        "   {} Cluster erstellt (automatisch gefunden)",
        named_clusters.len()
    );
    println!(
        "   {} Outlier ({:.1}%)",
        outlier_count,
        (outlier_count as f64 / named_clusters.len() as f64) * 100.0
    );
    println!("   Laufzeit: {:.2}s", elapsed.as_secs_f64());

    Ok(())
}
