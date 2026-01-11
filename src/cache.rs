use std::{collections::HashMap, path::Path, path::PathBuf, sync::Arc, time::SystemTime};

use anyhow::{anyhow, Context, Result};
use futures::future;
use serde::Deserialize;

use crate::config::AppState;
use crate::rag::RagIndex;
use crate::lance::RagIndexLance;

// Cache entry structures
#[derive(Clone)]
pub struct CachedRagIndex {
    pub rag: Arc<RagIndex>,
    pub loaded_at: SystemTime,
    pub file_path: PathBuf,
}

#[derive(Clone)]
pub struct CachedEpisodeMetadata {
    pub metadata: EpisodeMetadata,
    pub loaded_at: SystemTime,
}

#[derive(Clone)]
pub struct CachedEpisodeList {
    pub episode_numbers: Vec<u32>,
    pub loaded_at: SystemTime,
}

#[derive(Clone)]
pub struct CachedSpeakerProfile {
    pub content: String,
    pub loaded_at: SystemTime,
}

#[derive(Clone)]
pub struct CachedSpeakersIndex {
    pub speakers: Vec<SpeakerInfo>,
    pub loaded_at: SystemTime,
}

#[derive(Clone)]
pub struct CachedSpeakerMeta {
    pub meta: SpeakerMeta,
    pub loaded_at: SystemTime,
}

#[derive(Clone)]
pub struct CachedEpisodeTopicsMap {
    pub topics_map: HashMap<u32, std::collections::HashSet<String>>,
    pub loaded_at: SystemTime,
    pub rag_db_path: PathBuf,
}

#[derive(Clone)]
pub struct CachedEpisodeFiles {
    pub has_image: bool,
    pub has_transcript: bool,
    pub loaded_at: SystemTime,
}

// Types used in cache
#[derive(Debug, Deserialize, Clone)]
pub struct EpisodeMetadata {
    pub title: Option<String>,
    #[allow(dead_code)]
    pub number: Option<u32>,
    pub date: Option<String>,
    pub duration: Option<Vec<u32>>,
    pub description: Option<String>,
    pub speakers: Option<Vec<String>>,
}

#[derive(Debug, Deserialize, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerInfo {
    pub speaker: String,
    pub slug: String,
    #[serde(default)]
    pub episodes_count: u32,
    #[serde(default)]
    pub utterances_count: u32,
    #[serde(default)]
    pub total_words: u32,
    #[serde(skip_deserializing, default)]
    pub has_profile: bool,
    #[serde(skip_deserializing, skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct SpeakerMeta {
    pub image: Option<String>,
}

// Helper functions
async fn get_file_mtime(path: &Path) -> Option<SystemTime> {
    tokio::fs::metadata(path)
        .await
        .ok()?
        .modified()
        .ok()
}

async fn is_cache_valid(_cached_time: SystemTime, _file_path: &Path) -> bool {
    // Always return true - never invalidate embeddings cache
    // This ensures embeddings stay in memory once loaded
    true
}

// Cache loading functions
pub async fn load_rag_index_cached(
    st: &AppState,
    podcast_id: &str,
) -> Result<Arc<RagIndex>> {
    // Load from LanceDB
    let lance_path = PathBuf::from(format!("db/{}/lance", podcast_id));
    
    tracing::debug!("Loading RAG index from LanceDB for podcast: {}", podcast_id);
    
    // Check cache
    if let Some(cached) = st.rag_cache.get(podcast_id).await {
        if cached.file_path == lance_path {
            return Ok(cached.rag.clone());
        }
    }
    
    // Load from LanceDB
    let podcast_id_clone = podcast_id.to_string();
    let rag_lance = RagIndexLance::open(&podcast_id_clone).await
        .map_err(|e| anyhow!("Failed to open LanceDB for podcast '{}': {}", podcast_id, e))?;
    
    let rag = Arc::new(RagIndex::new(rag_lance));
    
    st.rag_cache.insert(
        podcast_id.to_string(),
        CachedRagIndex {
            rag: rag.clone(),
            loaded_at: SystemTime::now(),
            file_path: lance_path,
        }
    ).await;
    
    Ok(rag)
}

pub async fn load_episode_metadata_batch_cached(
    st: &AppState,
    podcast_id: &str,
    episode_numbers: &[u32],
) -> Result<HashMap<u32, EpisodeMetadata>> {
    let mut results = HashMap::new();
    
    // Create futures for all episodes
    let futures: Vec<_> = episode_numbers.iter()
        .map(|&ep_num| load_episode_metadata_cached(st, podcast_id, ep_num))
        .collect();
    
    // Execute all in parallel
    let metadata_results = future::join_all(futures).await;
    
    // Collect results
    for (ep_num, result) in episode_numbers.iter().zip(metadata_results) {
        if let Ok(Some(meta)) = result {
            results.insert(*ep_num, meta);
        }
    }
    
    Ok(results)
}

pub async fn load_episode_metadata_cached(
    st: &AppState,
    podcast_id: &str,
    episode_number: u32,
) -> Result<Option<EpisodeMetadata>> {
    let cache_key = (podcast_id.to_string(), episode_number);
    let ep_file = PathBuf::from(format!("podcasts/{}/episodes/{}.json", podcast_id, episode_number));
    
    // Check cache (moka handles TTL and LRU automatically)
    if let Some(cached) = st.episode_metadata_cache.get(&cache_key).await {
        if is_cache_valid(cached.loaded_at, &ep_file).await {
            return Ok(Some(cached.metadata.clone()));
        }
    }

    // Load and cache
    if tokio::fs::metadata(&ep_file).await.is_err() {
        return Ok(None);
    }

    // Use streaming deserialization for better memory efficiency
    let ep_file_clone = ep_file.clone();
    let metadata: EpisodeMetadata = tokio::task::spawn_blocking(move || {
        use serde_json::Deserializer;
        use std::fs::File;
        use std::io::BufReader;
        
        let file = File::open(&ep_file_clone)
            .with_context(|| format!("Failed to open {}", ep_file_clone.display()))?;
        let reader = BufReader::new(file);
        let mut deserializer = Deserializer::from_reader(reader);
        serde::Deserialize::deserialize(&mut deserializer)
            .with_context(|| format!("Failed to parse {}", ep_file_clone.display()))
    }).await
        .with_context(|| "Failed to spawn blocking task")??;

    // Insert into cache
    st.episode_metadata_cache.insert(
        cache_key,
        CachedEpisodeMetadata {
            metadata: metadata.clone(),
            loaded_at: SystemTime::now(),
        }
    ).await;

    Ok(Some(metadata))
}

pub async fn load_episode_list_cached(
    st: &AppState,
    podcast_id: &str,
) -> Result<Vec<u32>> {
    let episodes_dir = PathBuf::from(format!("podcasts/{}/episodes", podcast_id));
    
    // Check cache (use directory mtime for invalidation)
    if let Some(cached) = st.episode_list_cache.get(podcast_id).await {
        // Check if directory was modified (approximate check)
        if let Some(dir_mtime) = get_file_mtime(&episodes_dir).await {
            if dir_mtime <= cached.loaded_at {
                return Ok(cached.episode_numbers.clone());
            }
        }
    }

    // Scan directory using async I/O
    let mut episode_numbers = Vec::new();
    let mut entries = tokio::fs::read_dir(&episodes_dir).await
        .with_context(|| format!("Failed to read directory {}", episodes_dir.display()))?;
    
    while let Some(entry) = entries.next_entry().await
        .with_context(|| format!("Failed to read directory entry in {}", episodes_dir.display()))? {
        let path = entry.path();
        if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(ep_num_str) = file_name.strip_suffix(".json") {
                    if ep_num_str.chars().all(|c| c.is_ascii_digit()) {
                        if let Ok(ep_num) = ep_num_str.parse::<u32>() {
                            episode_numbers.push(ep_num);
                        }
                    }
                }
            }
        }
    }
    
    episode_numbers.sort_by(|a, b| b.cmp(a));

    // Cache result
    st.episode_list_cache.insert(
        podcast_id.to_string(),
        CachedEpisodeList {
            episode_numbers: episode_numbers.clone(),
            loaded_at: SystemTime::now(),
        }
    ).await;

    Ok(episode_numbers)
}

pub async fn load_speaker_profile_cached(
    st: &AppState,
    podcast_id: &str,
    slug: &str,
) -> Result<String> {
    let cache_key = (podcast_id.to_string(), slug.to_string());
    let profile_path = PathBuf::from(format!("podcasts/{}/speakers/{}.md", podcast_id, slug));
    
    if tokio::fs::metadata(&profile_path).await.is_err() {
        return Err(anyhow!("Speaker profile not found: {}", slug));
    }

    // Check cache (moka handles TTL and LRU automatically)
    if let Some(cached) = st.speaker_profile_cache.get(&cache_key).await {
        if is_cache_valid(cached.loaded_at, &profile_path).await {
            return Ok(cached.content.clone());
        }
    }

    // Load and cache using async I/O
    let content = tokio::fs::read_to_string(&profile_path).await
        .with_context(|| format!("Failed to read profile {}", profile_path.display()))?;

    st.speaker_profile_cache.insert(
        cache_key,
        CachedSpeakerProfile {
            content: content.clone(),
            loaded_at: SystemTime::now(),
        }
    ).await;

    Ok(content)
}

pub async fn load_speakers_index_cached(
    st: &AppState,
    podcast_id: &str,
) -> Result<Vec<SpeakerInfo>> {
    let speakers_dir = PathBuf::from(format!("podcasts/{}/speakers", podcast_id));
    let index_path = speakers_dir.join("index.json");
    
    if tokio::fs::metadata(&index_path).await.is_err() {
        return Ok(Vec::new());
    }

    // Check cache (moka handles TTL and LRU automatically)
    if let Some(cached) = st.speakers_index_cache.get(podcast_id).await {
        if is_cache_valid(cached.loaded_at, &index_path).await {
            return Ok(cached.speakers.clone());
        }
    }

    // Load and cache
    let mut speakers = load_speakers_index(&speakers_dir).await?;
    
    // Load speaker meta data for each speaker (with caching)
    for speaker in &mut speakers {
        if let Ok(Some(meta)) = load_speaker_meta_cached(st, podcast_id, &speaker.slug).await {
            speaker.image = meta.image;
        }
    }

    st.speakers_index_cache.insert(
        podcast_id.to_string(),
        CachedSpeakersIndex {
            speakers: speakers.clone(),
            loaded_at: SystemTime::now(),
        }
    ).await;

    Ok(speakers)
}

pub async fn load_speaker_meta_cached(
    st: &AppState,
    podcast_id: &str,
    slug: &str,
) -> Result<Option<SpeakerMeta>> {
    let cache_key = (podcast_id.to_string(), slug.to_string());
    let meta_path = PathBuf::from(format!("podcasts/{}/speakers/{}-meta.json", podcast_id, slug));
    
    if tokio::fs::metadata(&meta_path).await.is_err() {
        return Ok(None);
    }

    // Check cache (moka handles TTL and LRU automatically)
    if let Some(cached) = st.speaker_meta_cache.get(&cache_key).await {
        if is_cache_valid(cached.loaded_at, &meta_path).await {
            return Ok(Some(cached.meta.clone()));
        }
    }

    // Use streaming deserialization
    let meta_path_clone = meta_path.clone();
    let meta: SpeakerMeta = tokio::task::spawn_blocking(move || {
        use serde_json::Deserializer;
        use std::fs::File;
        use std::io::BufReader;
        
        let file = File::open(&meta_path_clone)
            .with_context(|| format!("Failed to open {}", meta_path_clone.display()))?;
        let reader = BufReader::new(file);
        let mut deserializer = Deserializer::from_reader(reader);
        serde::Deserialize::deserialize(&mut deserializer)
            .with_context(|| format!("Failed to parse {}", meta_path_clone.display()))
    }).await
        .with_context(|| "Failed to spawn blocking task")??;

    st.speaker_meta_cache.insert(
        cache_key,
        CachedSpeakerMeta {
            meta: meta.clone(),
            loaded_at: SystemTime::now(),
        }
    ).await;

    Ok(Some(meta))
}

pub async fn load_episode_topics_map_cached(
    _st: &AppState,
    _podcast_id: &str,
) -> Result<HashMap<u32, std::collections::HashSet<String>>> {
    // Note: This feature has been removed as it required scanning all RAG items.
    // Topics are now stored in LanceDB and would require inefficient full scans.
    // Consider adding a separate index if this feature is needed.
    Ok(HashMap::new())
}

pub async fn check_episode_files_cached(
    st: &AppState,
    podcast_id: &str,
    episode_number: u32,
) -> Result<(bool, bool)> {
    let cache_key = (podcast_id.to_string(), episode_number);
    
    // Check cache
    if let Some(cached) = st.episode_files_cache.get(&cache_key).await {
        return Ok((cached.has_image, cached.has_transcript));
    }
    
    // Check files
    let episodes_dir = PathBuf::from(format!("podcasts/{}/episodes", podcast_id));
    
    // Check for image (try common extensions)
    let mut has_image = false;
    for ext in &["jpg", "jpeg", "png", "webp"] {
        let image_path = episodes_dir.join(format!("{}.{}", episode_number, ext));
        if tokio::fs::metadata(&image_path).await.is_ok() {
            has_image = true;
            break;
        }
    }
    
    // Check for transcript
    let transcript_path = episodes_dir.join(format!("{}-ts.json", episode_number));
    let has_transcript = tokio::fs::metadata(&transcript_path).await.is_ok();
    
    // Cache result
    st.episode_files_cache.insert(
        cache_key,
        CachedEpisodeFiles {
            has_image,
            has_transcript,
            loaded_at: SystemTime::now(),
        }
    ).await;
    
    Ok((has_image, has_transcript))
}

pub async fn check_episode_files_batch_cached(
    st: &AppState,
    podcast_id: &str,
    episode_numbers: &[u32],
) -> Result<HashMap<u32, (bool, bool)>> {
    let mut results = HashMap::new();
    
    // Create futures for all episodes
    let futures: Vec<_> = episode_numbers.iter()
        .map(|&ep_num| check_episode_files_cached(st, podcast_id, ep_num))
        .collect();
    
    // Execute all in parallel
    let file_results = future::join_all(futures).await;
    
    // Collect results
    for (ep_num, result) in episode_numbers.iter().zip(file_results) {
        if let Ok((has_image, has_transcript)) = result {
            results.insert(*ep_num, (has_image, has_transcript));
        }
    }
    
    Ok(results)
}

pub async fn load_speakers_index(speakers_dir: &Path) -> Result<Vec<SpeakerInfo>> {
    let index_path = speakers_dir.join("index.json");
    if tokio::fs::metadata(&index_path).await.is_err() {
        return Ok(Vec::new());
    }
    
    // Use streaming deserialization
    let index_path_clone = index_path.clone();
    let mut speakers: Vec<SpeakerInfo> = tokio::task::spawn_blocking(move || {
        use serde_json::Deserializer;
        use std::fs::File;
        use std::io::BufReader;
        
        let file = File::open(&index_path_clone)
            .with_context(|| format!("Failed to open {}", index_path_clone.display()))?;
        let reader = BufReader::new(file);
        let mut deserializer = Deserializer::from_reader(reader);
        serde::Deserialize::deserialize(&mut deserializer)
            .with_context(|| format!("Failed to parse {}", index_path_clone.display()))
    }).await
        .with_context(|| "Failed to spawn blocking task")??;
    
    // Check for profile files using async I/O
    for speaker in &mut speakers {
        let profile_path = speakers_dir.join(format!("{}.md", speaker.slug));
        speaker.has_profile = tokio::fs::metadata(&profile_path).await.is_ok();
    }
    
    Ok(speakers)
}

