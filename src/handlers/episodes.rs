use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};

use crate::cache::{
    check_episode_files_batch_cached, load_episode_list_cached, load_episode_metadata_batch_cached, load_episode_topics_map_cached,
};
use crate::config::AppState as AppStateType;
use crate::cache::load_rag_index_cached;
use crate::rag::embeddings::embed_query;
use crate::utils::{dot, l2_norm};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodesSearchRequest {
    pub query: String,
    #[serde(default)]
    pub podcast_id: Option<String>,
    #[serde(default)]
    pub cross_podcast: Option<bool>,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub offset: Option<usize>,
    #[serde(default)]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodesLatestRequest {
    #[serde(default)]
    pub podcast_id: Option<String>,
    #[serde(default)]
    pub limit: Option<usize>,
    #[serde(default)]
    pub offset: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodesSearchResponse {
    pub episodes: Vec<EpisodeSearchResult>,
    pub has_more: bool,
    pub total: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeSearchResult {
    pub episode_number: u32,
    pub podcast_id: String,
    pub title: String,
    pub date: Option<String>,
    pub duration_sec: Option<u32>,
    pub speakers: Vec<String>,
    pub description: Option<String>,
    pub score: f32,
    pub topics: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub positions_sec: Vec<f64>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub position_scores: Vec<f32>,
    pub has_image: bool,
    pub has_transcript: bool,
}

pub async fn episodes_search(
    State(st): State<AppStateType>,
    Json(req): Json<EpisodesSearchRequest>,
) -> impl IntoResponse {
    match episodes_search_impl(&st, req).await {
        Ok(resp) => (StatusCode::OK, Json(resp)).into_response(),
        Err(e) => {
            tracing::error!("{:?}", e);
            let msg = format!("{}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response()
        }
    }
}

// Helper function to get all available podcast IDs from db directory
async fn get_all_podcast_ids() -> Result<Vec<String>> {
    use std::path::PathBuf;
    let db_dir = PathBuf::from("db");
    
    let mut entries = match tokio::fs::read_dir(&db_dir).await {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };
    
    let mut podcast_ids = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.is_dir() {
            if let Some(podcast_id) = path.file_name().and_then(|n| n.to_str()) {
                // Check for LanceDB directory with rag_chunks table
                let lance_path = path.join("lance/rag_chunks.lance");
                if tokio::fs::metadata(&lance_path).await.is_ok() {
                    podcast_ids.push(podcast_id.to_string());
                }
            }
        }
    }
    
    Ok(podcast_ids)
}

async fn episodes_search_impl(st: &AppStateType, req: EpisodesSearchRequest) -> Result<EpisodesSearchResponse> {
    use std::cmp::Ordering;
    
    let query = req.query.trim();
    if query.is_empty() {
        return Err(anyhow!("query must not be empty"));
    }

    let cross_podcast = req.cross_podcast.unwrap_or(false);
    let page_size = req.limit.unwrap_or(req.top_k.unwrap_or(10)).clamp(1, 50);
    let offset = req.offset.unwrap_or(0);
    
    // Determine which podcasts to search
    let podcast_ids: Vec<String> = if cross_podcast {
        get_all_podcast_ids().await?
    } else {
        vec![req.podcast_id.as_deref().unwrap_or("freakshow").to_string()]
    };
    
    if podcast_ids.is_empty() {
        return Err(anyhow!("No podcasts found to search"));
    }
    
    // Load RAG databases for all podcasts (with caching)
    let mut rag_indices: Vec<(String, Arc<crate::rag::RagIndex>)> = Vec::new();
    
    for podcast_id in &podcast_ids {
        match load_rag_index_cached(st, podcast_id).await {
            Ok(rag) => {
                rag_indices.push((podcast_id.clone(), rag));
            }
            Err(e) => {
                tracing::warn!("Failed to load RAG index for {}: {}", podcast_id, e);
            }
        }
    }
    
    if rag_indices.is_empty() {
        return Err(anyhow!("No RAG indices could be loaded"));
    }
    
    // Get embedding for query
    let q = embed_query(st, query).await?;

    // Search all podcasts and collect results
    let keep_count = (offset + page_size) * 5;
    let mut all_hits: Vec<(String, crate::rag::Hit)> = Vec::new();
    
    for (podcast_id, rag) in &rag_indices {
        // Search this podcast's RAG index using LanceDB
        let hits = rag.lance.search(&q, keep_count).await?;
        
        // Convert to our format and tag with podcast_id
        for hit in hits {
            all_hits.push((
                podcast_id.clone(),
                crate::rag::Hit {
                    item: crate::rag::RagItem {
                        id: hit.item.id,
                        episode_number: hit.item.episode_number,
                        episode_title: hit.item.episode_title,
                        topic: hit.item.topic,
                        subject: hit.item.subject.map(|s| crate::rag::RagSubject {
                            coarse: s.coarse,
                            fine: s.fine,
                        }),
                        start_sec: hit.item.start_sec,
                        end_sec: hit.item.end_sec,
                        start_hms: hit.item.start_hms,
                        end_hms: hit.item.end_hms,
                        summary: hit.item.summary,
                        text: hit.item.text,
                        embedding: hit.item.embedding,
                    },
                    score: hit.score,
                },
            ));
        }
    }
    
    // Sort all hits by score
    all_hits.sort_by(|a, b| b.1.score.partial_cmp(&a.1.score).unwrap_or(Ordering::Equal));
    all_hits.truncate(keep_count);
    
    // Group by (podcast_id, episode_number) and get best score per episode
    // Also track multiple positions (start_sec) of matching items (top 3 per episode)
    let mut episode_data: HashMap<(String, u32), (f32, Vec<(f64, f32)>)> = HashMap::new();
    
    // Take more items than page_size to ensure we have enough episodes after grouping
    for (podcast_id, hit) in all_hits.iter().take(keep_count) {
        let item = &hit.item;
        let ep_num = item.episode_number;
        let score = hit.score;
        let key: (String, u32) = (podcast_id.clone(), ep_num);
        
        // Track best score per episode and collect positions with their scores
        let entry = episode_data.entry(key).or_insert((score, Vec::new()));
        if score > entry.0 {
            entry.0 = score;
        }
        
        // Collect positions with their scores
        entry.1.push((item.start_sec, score));
    }
    
    // Sort positions by score and keep top 3 per episode, preserving both positions and scores
    let mut episode_positions: HashMap<(String, u32), Vec<(f64, f32)>> = HashMap::new();
    for ((podcast_id, ep_num), (_, positions_with_scores)) in &episode_data {
        let mut sorted_positions: Vec<(f64, f32)> = positions_with_scores.clone();
        sorted_positions.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
        let mut unique_positions: Vec<(f64, f32)> = Vec::new();
        for (pos, score) in sorted_positions {
            // Check if position is already in list (within 1 second tolerance)
            if !unique_positions.iter().any(|(p, _)| (p - pos).abs() < 1.0) {
                unique_positions.push((pos, score));
                if unique_positions.len() >= 3 {
                    break;
                }
            }
        }
        episode_positions.insert((podcast_id.clone(), *ep_num), unique_positions);
    }
    
    // Convert to vector and sort by score
    let mut episode_results: Vec<((String, u32), f32, Vec<(f64, f32)>)> = episode_data.into_iter()
        .map(|(key, (score, _))| {
            let positions = episode_positions.get(&key).cloned().unwrap_or_default();
            (key, score, positions)
        })
        .collect();
    episode_results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
    
    let total = episode_results.len();
    let has_more = (offset + page_size) < total;
    
    // Apply pagination
    let paginated_results: Vec<((String, u32), f32, Vec<(f64, f32)>)> = episode_results
        .into_iter()
        .skip(offset)
        .take(page_size)
        .collect();
    
    // Load episode metadata in parallel (batch loading with caching per podcast)
    // Group by podcast_id to batch load efficiently
    let mut metadata_requests: Vec<(String, Vec<u32>)> = Vec::new();
    for ((podcast_id, ep_num), _, _) in &paginated_results {
        if let Some(existing) = metadata_requests.iter_mut().find(|(pid, _)| pid == podcast_id) {
            if !existing.1.contains(ep_num) {
                existing.1.push(*ep_num);
            }
        } else {
            metadata_requests.push((podcast_id.clone(), vec![*ep_num]));
        }
    }
    
    // Load metadata for all podcasts in parallel
    let mut all_metadata: HashMap<(String, u32), crate::cache::EpisodeMetadata> = HashMap::new();
    for (podcast_id, episode_numbers) in metadata_requests {
        match load_episode_metadata_batch_cached(st, &podcast_id, &episode_numbers).await {
            Ok(metadata_map) => {
                for (ep_num, meta) in metadata_map {
                    all_metadata.insert((podcast_id.clone(), ep_num), meta);
                }
            }
            Err(e) => {
                tracing::warn!("Failed to load metadata for {}: {}", podcast_id, e);
            }
        }
    }
    
    // Load episode topics maps for all podcasts
    let mut all_topics_maps: HashMap<String, HashMap<u32, std::collections::HashSet<String>>> = HashMap::new();
    for podcast_id in &podcast_ids {
        if let Ok(topics_map) = load_episode_topics_map_cached(st, podcast_id).await {
            all_topics_maps.insert(podcast_id.clone(), topics_map);
        }
    }
    
    // Load episode file existence (image and transcript) for all podcasts
    let mut all_files: HashMap<(String, u32), (bool, bool)> = HashMap::new();
    for podcast_id in &podcast_ids {
        let episode_numbers: Vec<u32> = paginated_results.iter()
            .filter(|((pid, _), _, _)| pid == podcast_id)
            .map(|((_, ep_num), _, _)| *ep_num)
            .collect();
        if !episode_numbers.is_empty() {
            if let Ok(files_map) = check_episode_files_batch_cached(st, podcast_id, &episode_numbers).await {
                for (ep_num, (has_image, has_transcript)) in files_map {
                    all_files.insert((podcast_id.clone(), ep_num), (has_image, has_transcript));
                }
            }
        }
    }
    
    // Build results
    let mut results = Vec::new();
    for ((podcast_id, ep_num), score, positions_with_scores) in paginated_results {
        let mut title = format!("Episode {}", ep_num);
        let mut date = None;
        let mut duration_sec = None;
        let mut description = None;
        let mut speakers = Vec::new();
        
        if let Some(meta) = all_metadata.get(&(podcast_id.clone(), ep_num)) {
            if let Some(t) = &meta.title {
                title = t.clone();
            }
            date = meta.date.clone();
            if let Some(dur) = &meta.duration {
                if dur.len() >= 3 {
                    duration_sec = Some(dur[0] * 3600 + dur[1] * 60 + dur[2]);
                }
            }
            description = meta.description.clone();
            if let Some(s) = &meta.speakers {
                speakers = s.clone();
            }
        }
        
        let topics: Vec<String> = all_topics_maps
            .get(&podcast_id)
            .and_then(|map| map.get(&ep_num))
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default();
        
        // Extract positions and scores separately
        let positions_sec: Vec<f64> = positions_with_scores.iter().map(|(pos, _)| *pos).collect();
        let position_scores: Vec<f32> = positions_with_scores.iter().map(|(_, scr)| *scr).collect();
        
        // Get file existence info
        let (has_image, has_transcript) = all_files.get(&(podcast_id.clone(), ep_num))
            .copied()
            .unwrap_or((false, false));
        
        results.push(EpisodeSearchResult {
            episode_number: ep_num,
            podcast_id: podcast_id.clone(),
            title,
            date,
            duration_sec,
            speakers,
            description,
            score,
            topics,
            positions_sec,
            position_scores,
            has_image,
            has_transcript,
        });
    }
    
    Ok(EpisodesSearchResponse { 
        episodes: results,
        has_more,
        total: Some(total),
    })
}

pub async fn episodes_latest(
    State(st): State<AppStateType>,
    Json(req): Json<EpisodesLatestRequest>,
) -> impl IntoResponse {
    match episodes_latest_impl(&st, req).await {
        Ok(resp) => (StatusCode::OK, Json(resp)).into_response(),
        Err(e) => {
            tracing::error!("{:?}", e);
            let msg = format!("{}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response()
        }
    }
}

async fn episodes_latest_impl(st: &AppStateType, req: EpisodesLatestRequest) -> Result<EpisodesSearchResponse> {
    let podcast_id = req.podcast_id.as_deref().unwrap_or("freakshow");
    let podcast_id_string = podcast_id.to_string();
    let page_size = req.limit.unwrap_or(10).clamp(1, 50);
    let offset = req.offset.unwrap_or(0);
    
    // Load episode list (with caching)
    let episode_numbers = load_episode_list_cached(st, podcast_id).await?;
    
    let total = episode_numbers.len();
    let has_more = (offset + page_size) < total;
    
    // Apply pagination
    let paginated_episodes: Vec<u32> = episode_numbers
        .into_iter()
        .skip(offset)
        .take(page_size)
        .collect();
    
    // Note: Topic map feature removed - topics are now stored in LanceDB
    // and would require a full scan which is inefficient. Consider adding
    // a separate index if this feature is needed.
    let episode_topics_map: HashMap<u32, std::collections::HashSet<String>> = HashMap::new();
    
    // Load episode metadata in parallel (batch loading with caching)
    let metadata_map = load_episode_metadata_batch_cached(st, podcast_id, &paginated_episodes).await?;
    
    // Load episode file existence (image and transcript)
    let files_map = check_episode_files_batch_cached(st, podcast_id, &paginated_episodes).await.unwrap_or_default();
    
    // Build results
    let mut results = Vec::new();
    for ep_num in paginated_episodes {
        let mut title = format!("Episode {}", ep_num);
        let mut date = None;
        let mut duration_sec = None;
        let mut description = None;
        let mut speakers = Vec::new();
        
        if let Some(meta) = metadata_map.get(&ep_num) {
            if let Some(t) = &meta.title {
                title = t.clone();
            }
            date = meta.date.clone();
            if let Some(dur) = &meta.duration {
                if dur.len() >= 3 {
                    duration_sec = Some(dur[0] * 3600 + dur[1] * 60 + dur[2]);
                }
            }
            description = meta.description.clone();
            if let Some(s) = &meta.speakers {
                speakers = s.clone();
            }
        }
        
        // Get topics from pre-loaded map
        let topics: Vec<String> = episode_topics_map
            .get(&ep_num)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default();
        
        // Get file existence info
        let (has_image, has_transcript) = files_map.get(&ep_num)
            .copied()
            .unwrap_or((false, false));
        
        results.push(EpisodeSearchResult {
            episode_number: ep_num,
            podcast_id: podcast_id_string.clone(),
            title,
            date,
            duration_sec,
            speakers,
            description,
            score: 1.0, // No relevance score for latest episodes
            topics,
            positions_sec: Vec::new(), // No positions for latest episodes
            position_scores: Vec::new(), // No position scores for latest episodes
            has_image,
            has_transcript,
        });
    }
    
    Ok(EpisodesSearchResponse { 
        episodes: results,
        has_more,
        total: Some(total),
    })
}

