use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::Instant;
use indicatif::{ProgressBar, ProgressStyle};

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
    clusters: Option<usize>,
    #[serde(rename = "outlierThreshold")]
    outlier_threshold: Option<f64>,
    #[serde(rename = "linkageMethod")]
    linkage_method: Option<String>,
    #[serde(rename = "useRelevanceWeighting")]
    use_relevance_weighting: Option<bool>,
    #[serde(rename = "useLLMNaming")]
    use_llm_naming: Option<bool>,
    model: Option<String>,
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
    embedding: Vec<f64>,
}

#[derive(Debug, Clone)]
struct Cluster {
    id: usize,
    items: Vec<usize>,
    embedding: Vec<f64>,
    total_weight: f64,
    is_outlier: bool,
    max_merge_distance: f64,
}

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
    topics: Vec<ClusterTopic>,
    episodes: Vec<u32>,
}

#[derive(Debug, Clone, Serialize)]
struct ClusterTopic {
    topic: String,
    count: usize,
    keywords: Vec<String>,
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

#[inline]
fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    let mut dot_product = 0.0;
    let mut norm_a = 0.0;
    let mut norm_b = 0.0;
    let len = a.len();
    let chunks = len / 4;
    for i in 0..chunks {
        let idx = i * 4;
        for j in 0..4 {
            let ai = a[idx + j];
            let bi = b[idx + j];
            dot_product += ai * bi;
            norm_a += ai * ai;
            norm_b += bi * bi;
        }
    }
    for i in (chunks * 4)..len {
        let ai = a[i];
        let bi = b[i];
        dot_product += ai * bi;
        norm_a += ai * ai;
        norm_b += bi * bi;
    }
    dot_product / (norm_a.sqrt() * norm_b.sqrt())
}

fn compute_distance_matrix(embeddings: &[Vec<f64>]) -> Vec<Vec<f64>> {
    let n = embeddings.len();
    let mut distances = vec![vec![0.0; n]; n];
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
    for (i, j, dist) in results {
        distances[i][j] = dist;
        distances[j][i] = dist;
    }
    distances
}

fn compute_weighted_centroid(
    items: &[usize],
    embeddings: &[Vec<f64>],
    weights: &[f64],
) -> (Vec<f64>, f64) {
    let dim = embeddings[0].len();
    let mut centroid = vec![0.0; dim];
    let mut total_weight = 0.0;
    for &idx in items {
        let w = weights[idx];
        total_weight += w;
        for d in 0..dim {
            centroid[d] += embeddings[idx][d] * w;
        }
    }
    for d in 0..dim {
        centroid[d] /= total_weight;
    }
    (centroid, total_weight)
}

fn compute_cluster_distance(
    cluster_a: &Cluster,
    cluster_b: &Cluster,
    distances: &[Vec<f64>],
    weights: &[f64],
    linkage_method: &str,
) -> f64 {
    match linkage_method {
        "single" => {
            let mut min_dist = f64::INFINITY;
            for &i in &cluster_a.items {
                for &j in &cluster_b.items {
                    min_dist = min_dist.min(distances[i][j]);
                }
            }
            min_dist
        }
        "complete" => {
            let mut max_dist: f64 = 0.0;
            for &i in &cluster_a.items {
                for &j in &cluster_b.items {
                    max_dist = max_dist.max(distances[i][j]);
                }
            }
            max_dist
        }
        "weighted" => {
            let mut weighted_sum = 0.0;
            let mut total_weight = 0.0;
            for &i in &cluster_a.items {
                for &j in &cluster_b.items {
                    let w = weights[i] * weights[j];
                    weighted_sum += distances[i][j] * w;
                    total_weight += w;
                }
            }
            weighted_sum / total_weight
        }
        "ward" => {
            let n_a = cluster_a.total_weight;
            let n_b = cluster_b.total_weight;
            let centroid_dist = 1.0 - cosine_similarity(&cluster_a.embedding, &cluster_b.embedding);
            ((2.0 * n_a * n_b) / (n_a + n_b)).sqrt() * centroid_dist
        }
        _ => {
            let mut total_dist = 0.0;
            let mut count = 0;
            for &i in &cluster_a.items {
                for &j in &cluster_b.items {
                    total_dist += distances[i][j];
                    count += 1;
                }
            }
            total_dist / count as f64
        }
    }
}

fn hierarchical_clustering(
    topics: &[TopicWithEmbedding],
    embeddings: &[Vec<f64>],
    target_clusters: usize,
    outlier_threshold: f64,
    linkage_method: &str,
    use_relevance_weighting: bool,
) -> Vec<Cluster> {
    let n = topics.len();
    println!("   Linkage-Methode: {}", linkage_method);
    println!("   Relevanz-Gewichtung: {}", if use_relevance_weighting { "Ja" } else { "Nein" });
    let weights: Vec<f64> = if use_relevance_weighting {
        topics.iter().map(|t| t.episodes.len() as f64).collect()
    } else {
        vec![1.0; n]
    };
    let mut clusters: Vec<Cluster> = (0..n)
        .map(|i| Cluster {
            id: i,
            items: vec![i],
            embedding: embeddings[i].clone(),
            total_weight: weights[i],
            is_outlier: false,
            max_merge_distance: 0.0,
        })
        .collect();
    println!("   Berechne Distanz-Matrix...");
    let distances = compute_distance_matrix(embeddings);
    println!("   Merge Cluster...");
    let pb = ProgressBar::new((n - target_clusters) as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("   [{bar:40.cyan/blue}] {pos}/{len} ({percent}%) - {msg}")
            .unwrap()
            .progress_chars("#>-"),
    );
    while clusters.len() > target_clusters {
        let mut min_dist = f64::INFINITY;
        let mut merge_i = 0;
        let mut merge_j = 1;
        for i in 0..clusters.len() {
            for j in (i + 1)..clusters.len() {
                let dist = compute_cluster_distance(
                    &clusters[i],
                    &clusters[j],
                    &distances,
                    &weights,
                    linkage_method,
                );
                if dist < min_dist {
                    min_dist = dist;
                    merge_i = i;
                    merge_j = j;
                }
            }
        }
        let mut is_outlier = clusters[merge_i].is_outlier || clusters[merge_j].is_outlier;
        if min_dist > outlier_threshold {
            is_outlier = true;
        }
        let mut new_items = clusters[merge_i].items.clone();
        new_items.extend(&clusters[merge_j].items);
        let (new_embedding, new_total_weight) = if use_relevance_weighting {
            compute_weighted_centroid(&new_items, embeddings, &weights)
        } else {
            let mut centroid = vec![0.0; embeddings[0].len()];
            for &idx in &new_items {
                for d in 0..embeddings[0].len() {
                    centroid[d] += embeddings[idx][d];
                }
            }
            for d in 0..embeddings[0].len() {
                centroid[d] /= new_items.len() as f64;
            }
            (centroid, new_items.len() as f64)
        };
        let new_cluster = Cluster {
            id: clusters[merge_i].id,
            items: new_items,
            embedding: new_embedding,
            total_weight: new_total_weight,
            is_outlier,
            max_merge_distance: min_dist
                .max(clusters[merge_i].max_merge_distance)
                .max(clusters[merge_j].max_merge_distance),
        };
        if merge_i < merge_j {
            clusters.remove(merge_j);
            clusters.remove(merge_i);
        } else {
            clusters.remove(merge_i);
            clusters.remove(merge_j);
        }
        clusters.push(new_cluster);
        pb.set_message(format!("{} Cluster", clusters.len()));
        pb.inc(1);
    }
    pb.finish_with_message("Done");
    println!("   Progress: 100% ({} Cluster)", clusters.len());
    clusters
}

fn find_cluster_name(
    cluster_items: &[usize],
    all_topics: &[TopicWithEmbedding],
    use_relevance_weighting: bool,
) -> String {
    let mut keyword_counts: HashMap<String, f64> = HashMap::new();
    let mut topic_words: HashMap<String, f64> = HashMap::new();
    let generic_words: HashSet<&str> = [
        "und", "der", "die", "das", "in", "im", "von", "für", "mit", "über", "zur", "zum",
        "diskussion", "thema", "themen", "aspekte", "entwicklung", "entwicklungen",
        "nutzung", "verwendung", "einsatz", "einfluss", "bedeutung", "rolle",
        "allgemein", "allgemeine", "verschiedene", "aktuelle", "neue", "neuen",
        "technologie", "technologien", "technik", "technisch", "technische",
        "zukunft", "zukünftige", "trends", "trend",
    ].iter().copied().collect();
    for &idx in cluster_items {
        let topic = &all_topics[idx];
        let weight = if use_relevance_weighting {
            topic.episodes.len() as f64
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
    // Capitalize first character (UTF-8 safe)
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
        // Capitalize first character (UTF-8 safe)
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

fn call_llm_for_naming<'a>(
    topics: Vec<String>,
    settings: &'a Settings,
    model: Option<&'a str>,
    retry_count: u32,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Option<String>> + Send + 'a>> {
    Box::pin(async move {
    let client = reqwest::Client::new();
    let model_name = model.unwrap_or(&settings.llm.model);
    let max_retries = settings.topic_extraction.as_ref().and_then(|s| s.max_retries).unwrap_or(3);
    let retry_delay_ms = settings.topic_extraction.as_ref().and_then(|s| s.retry_delay_ms).unwrap_or(5000);
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
            LlmRequestMessage { role: "system".to_string(), content: system_prompt.to_string() },
            LlmRequestMessage { role: "user".to_string(), content: user_prompt },
        ],
        temperature: settings.llm.temperature.unwrap_or(0.3),
        max_tokens: 50,
    };
    match client.post(format!("{}/chat/completions", settings.llm.base_url))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", settings.llm.api_key))
        .json(&request)
        .send()
        .await
    {
        Ok(response) => {
            if response.status() == 429 && retry_count < max_retries {
                tokio::time::sleep(tokio::time::Duration::from_millis(
                    retry_delay_ms * 2u64.pow(retry_count),
                )).await;
                return call_llm_for_naming(topics, settings, model, retry_count + 1).await;
            }
            if response.status().is_success() {
                match response.json::<LlmResponse>().await {
                    Ok(data) => {
                        let content = data.choices[0].message.content.trim();
                        let cleaned = content.replace(&['\"', '\''][..], "");
                        return Some(cleaned);
                    }
                    Err(_) => return None,
                }
            }
            None
        }
        Err(_) => None,
    }
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let start_time = Instant::now();
    println!("🔬 Topic-Clustering für Freakshow Episoden\n");
    let settings_path = PathBuf::from("settings.json");
    if !settings_path.exists() {
        eprintln!("\n❌ settings.json nicht gefunden!");
        eprintln!("   Kopiere settings.example.json zu settings.json und passe die Konfiguration an.\n");
        std::process::exit(1);
    }
    let settings_content = fs::read_to_string(&settings_path)?;
    let settings: Settings = serde_json::from_str(&settings_content)?;
    let target_clusters = settings.topic_clustering.as_ref().and_then(|s| s.clusters).unwrap_or(256);
    let outlier_threshold = settings.topic_clustering.as_ref().and_then(|s| s.outlier_threshold).unwrap_or(0.7);
    let linkage_method = settings.topic_clustering.as_ref().and_then(|s| s.linkage_method.clone()).unwrap_or_else(|| "weighted".to_string());
    let use_relevance_weighting = settings.topic_clustering.as_ref().and_then(|s| s.use_relevance_weighting).unwrap_or(true);
    let use_llm_naming = settings.topic_clustering.as_ref().and_then(|s| s.use_llm_naming).unwrap_or(true);
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
    println!("\n📊 Clustering-Einstellungen:");
    println!("   Ziel-Cluster:        {}", target_clusters);
    println!("   Outlier-Schwellwert: {}", outlier_threshold);
    println!("   Linkage-Methode:     {}", linkage_method);
    println!("   Relevanz-Gewichtung: {}", if use_relevance_weighting { "Ja" } else { "Nein" });
    println!("   LLM-Benennung:       {}\n", if use_llm_naming { "Ja" } else { "Nein" });
    let unique_topics = db.topics.clone();
    let embeddings: Vec<Vec<f64>> = db.topics.iter().map(|t| t.embedding.clone()).collect();
    println!("📊 Cluster erstellen...");
    let cluster_result = hierarchical_clustering(
        &unique_topics, &embeddings, target_clusters, outlier_threshold, &linkage_method, use_relevance_weighting,
    );
    println!("   ✓ {} Cluster erstellt\n", cluster_result.len());
    println!("🏷️  Cluster benennen...");
    let delay_ms = settings.topic_extraction.as_ref().and_then(|s| s.request_delay_ms).unwrap_or(1000);
    let pb = ProgressBar::new(cluster_result.len() as u64);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("   [{bar:40.cyan/blue}] {pos}/{len} - {msg}")
            .unwrap()
            .progress_chars("#>-"),
    );
    let mut named_clusters = Vec::new();
    let mut outlier_count = 0;
    let model = settings.topic_clustering.as_ref().and_then(|s| s.model.as_deref());
    for (_i, cluster) in cluster_result.iter().enumerate() {
        let cluster_topics: Vec<_> = cluster.items.iter().map(|&idx| unique_topics[idx].clone()).collect();
        let name = if cluster.is_outlier || cluster.max_merge_distance > outlier_threshold {
            outlier_count += 1;
            pb.set_message(format!("\"Sonstiges\" (Outlier)"));
            "Sonstiges".to_string()
        } else if use_llm_naming && cluster_topics.len() > 1 {
            let mut sorted_topics = cluster_topics.clone();
            sorted_topics.sort_by(|a, b| b.episodes.len().cmp(&a.episodes.len()));
            let top_topics: Vec<String> = sorted_topics.iter().take(10).map(|t| t.topic.clone()).collect();
            match call_llm_for_naming(top_topics, &settings, model, 0).await {
                Some(llm_name) => {
                    pb.set_message(format!("\"{}\" (LLM)", llm_name));
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms / 2)).await;
                    llm_name
                }
                None => {
                    let heuristic_name = find_cluster_name(&cluster.items, &unique_topics, use_relevance_weighting);
                    pb.set_message(format!("\"{}\" (Heuristik)", heuristic_name));
                    heuristic_name
                }
            }
        } else {
            let heuristic_name = find_cluster_name(&cluster.items, &unique_topics, use_relevance_weighting);
            pb.set_message(format!("\"{}\" (Heuristik)", heuristic_name));
            heuristic_name
        };
        let mut all_episodes = HashSet::new();
        for topic in &cluster_topics {
            for &ep in &topic.episodes {
                all_episodes.insert(ep);
            }
        }
        let mut episodes: Vec<u32> = all_episodes.into_iter().collect();
        episodes.sort_unstable();
        let id = name.to_lowercase().chars().map(|c| {
            if c.is_alphanumeric() || c == 'ä' || c == 'ö' || c == 'ü' || c == 'ß' { c } else { '-' }
        }).collect::<String>().split('-').filter(|s| !s.is_empty()).collect::<Vec<_>>().join("-");
        named_clusters.push(NamedCluster {
            id,
            name,
            is_outlier: cluster.is_outlier || cluster.max_merge_distance > outlier_threshold,
            topic_count: cluster_topics.len(),
            episode_count: episodes.len(),
            topics: cluster_topics.iter().map(|t| ClusterTopic {
                topic: t.topic.clone(),
                count: t.count,
                keywords: t.keywords.iter().take(5).cloned().collect(),
            }).collect(),
            episodes,
        });
        pb.inc(1);
    }
    pb.finish_with_message("Done");
    println!("\n   ℹ️  {} Outlier-Cluster gefunden\n", outlier_count);
    named_clusters.sort_by(|a, b| b.episode_count.cmp(&a.episode_count));
    let taxonomy_file = PathBuf::from("topic-taxonomy.json");
    let outliers: Vec<_> = named_clusters.iter().filter(|c| c.is_outlier).collect();
    let result = TaxonomyResult {
        created_at: chrono::Utc::now().to_rfc3339(),
        method: "embedding-clustering".to_string(),
        embedding_model: db.embedding_model.clone(),
        embeddings_created_at: db.created_at.clone(),
        total_topics: db.total_topics_raw,
        unique_topics: db.topics.len(),
        settings: ClusterSettings {
            clusters: target_clusters,
            outlier_threshold,
            linkage_method: linkage_method.clone(),
            use_relevance_weighting,
        },
        statistics: Statistics {
            cluster_count: named_clusters.len(),
            outlier_count: outliers.len(),
            outlier_percentage: format!("{:.1}%", (outliers.len() as f64 / named_clusters.len() as f64) * 100.0),
        },
        clusters: named_clusters.iter().map(|c| TaxonomyCluster {
            id: c.id.clone(),
            name: c.name.clone(),
            description: format!("{} Topics in {} Episoden", c.topic_count, c.episode_count),
            is_outlier: c.is_outlier,
            topic_count: c.topic_count,
            episode_count: c.episode_count,
            sample_topics: c.topics.iter().take(5).map(|t| t.topic.clone()).collect(),
            episodes: c.episodes.clone(),
        }).collect(),
    };
    let result_json = serde_json::to_string_pretty(&result)?;
    fs::write(&taxonomy_file, result_json)?;
    println!("✅ Taxonomie gespeichert: {:?}", taxonomy_file);
    
    // Save detailed mapping with all topics per cluster
    #[derive(Serialize)]
    struct DetailedCluster {
        id: String,
        name: String,
        #[serde(rename = "topicCount")]
        topic_count: usize,
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
        clusters: named_clusters.iter().map(|c| DetailedCluster {
            id: c.id.clone(),
            name: c.name.clone(),
            topic_count: c.topic_count,
            topics: c.topics.clone(),
        }).collect(),
    };
    let detailed_json = serde_json::to_string_pretty(&detailed_mapping)?;
    fs::write(&detailed_file, detailed_json)?;
    println!("✅ Detailed Topic-Mapping gespeichert: {:?}", detailed_file);
    println!("\n📋 Top 15 Cluster:");
    for (i, c) in named_clusters.iter().take(15).enumerate() {
        let outlier_tag = if c.is_outlier { " [Outlier]" } else { "" };
        println!("   {}. {}{} ({} Episoden, {} Topics)", i + 1, c.name, outlier_tag, c.episode_count, c.topic_count);
        let examples: Vec<String> = c.topics.iter().take(3).map(|t| t.topic.clone()).collect();
        println!("      Beispiele: {}", examples.join(", "));
    }
    let elapsed = start_time.elapsed();
    println!("\n✨ Statistik:");
    println!("   {} Cluster erstellt", named_clusters.len());
    println!("   {} Outlier ({:.1}%)", outliers.len(), (outliers.len() as f64 / named_clusters.len() as f64) * 100.0);
    println!("   Laufzeit: {:.2}s", elapsed.as_secs_f64());
    Ok(())
}
