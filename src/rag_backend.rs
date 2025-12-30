use std::{
    cmp::Ordering,
    collections::HashMap,
    io,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{anyhow, Context, Result};
use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::post,
    Json, Router,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[derive(Debug, Deserialize, Clone)]
struct SettingsFile {
    llm: Option<LlmSettings>,
    #[serde(rename = "topicClustering")]
    topic_clustering: Option<TopicClusteringSettings>,
    rag: Option<RagSettings>,
}

#[derive(Debug, Deserialize, Clone)]
struct LlmSettings {
    #[serde(rename = "baseURL")]
    base_url: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct TopicClusteringSettings {
    #[serde(rename = "embeddingModel")]
    embedding_model: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct RagSettings {
    #[serde(rename = "authToken")]
    auth_token: Option<String>,
    #[serde(rename = "bindAddr")]
    bind_addr: Option<String>,
}

fn try_read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).with_context(|| format!("Failed to read {}", path.display()))?;
    let parsed: T = serde_json::from_slice(&bytes).with_context(|| format!("Failed to parse {}", path.display()))?;
    Ok(Some(parsed))
}

fn load_settings() -> Result<(Option<SettingsFile>, String)> {
    // Prefer settings.json, fall back to settings.example.json (but still require non-placeholder API key unless env overrides)
    let settings_path = PathBuf::from("settings.json");
    if let Some(s) = try_read_json::<SettingsFile>(&settings_path)? {
        return Ok((Some(s), "settings.json".to_string()));
    }

    let example_path = PathBuf::from("settings.example.json");
    if let Some(s) = try_read_json::<SettingsFile>(&example_path)? {
        return Ok((Some(s), "settings.example.json".to_string()));
    }

    Ok((None, "env".to_string()))
}

#[derive(Clone, Debug)]
struct AppConfig {
    bind_addr: SocketAddr,
    rag_db_path: PathBuf,
    episodes_dir: PathBuf,
    speakers_dir: PathBuf,
    llm_base_url: String,
    llm_api_key: String,
    llm_model: String,
    embedding_model: String,
    top_k: usize,
    max_context_chars: usize,
    auth_token: Option<String>,
}

impl AppConfig {
    fn from_env_and_settings() -> Result<(Self, String)> {
        let (settings, settings_source) = load_settings()?;

        let rag_db_path = PathBuf::from(
            std::env::var("RAG_DB_PATH").unwrap_or_else(|_| "rag-embeddings.json".to_string()),
        );
        let episodes_dir =
            PathBuf::from(std::env::var("EPISODES_DIR").unwrap_or_else(|_| "episodes".to_string()));
        let speakers_dir =
            PathBuf::from(std::env::var("SPEAKERS_DIR").unwrap_or_else(|_| "speakers".to_string()));

        // Resolve from settings first, then allow env override.
        let settings_llm = settings.as_ref().and_then(|s| s.llm.as_ref());
        let settings_cluster = settings.as_ref().and_then(|s| s.topic_clustering.as_ref());
        let settings_rag = settings.as_ref().and_then(|s| s.rag.as_ref());

        let bind_addr_s = std::env::var("RAG_BIND_ADDR")
            .ok()
            .or_else(|| settings_rag.and_then(|r| r.bind_addr.clone()))
            .unwrap_or_else(|| "127.0.0.1:7878".to_string());

        let bind_addr: SocketAddr = bind_addr_s
            .parse()
            .with_context(|| format!("Invalid RAG bind address '{bind_addr_s}' (expected host:port)"))?;

        let llm_base_url = std::env::var("LLM_BASE_URL")
            .ok()
            .or_else(|| settings_llm.and_then(|l| l.base_url.clone()))
            .ok_or_else(|| anyhow!("Missing LLM base URL (set LLM_BASE_URL or settings.json: llm.baseURL)"))?;

        let llm_api_key = std::env::var("LLM_API_KEY")
            .ok()
            .or_else(|| settings_llm.and_then(|l| l.api_key.clone()))
            .ok_or_else(|| anyhow!("Missing LLM API key (set LLM_API_KEY or settings.json: llm.apiKey)"))?;

        if llm_api_key.trim().is_empty() || llm_api_key == "YOUR_API_KEY_HERE" {
            return Err(anyhow!(
                "LLM API key is missing/placeholder (set LLM_API_KEY or update settings.json: llm.apiKey)"
            ));
        }

        let llm_model = std::env::var("LLM_MODEL")
            .ok()
            .or_else(|| settings_llm.and_then(|l| l.model.clone()))
            .unwrap_or_else(|| "gpt-4o-mini".to_string());

        let embedding_model = std::env::var("EMBEDDING_MODEL")
            .ok()
            .or_else(|| settings_cluster.and_then(|c| c.embedding_model.clone()))
            .unwrap_or_else(|| "text-embedding-3-small".to_string());

        let top_k = std::env::var("RAG_TOP_K")
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(6);

        let max_context_chars = std::env::var("RAG_MAX_CONTEXT_CHARS")
            .ok()
            .and_then(|s| s.parse::<usize>().ok())
            .unwrap_or(24_000);

        let auth_token = std::env::var("RAG_AUTH_TOKEN")
            .ok()
            .or_else(|| settings_rag.and_then(|r| r.auth_token.clone()))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        Ok((
            Self {
            bind_addr,
            rag_db_path,
            episodes_dir,
            speakers_dir,
            llm_base_url: llm_base_url.trim_end_matches('/').to_string(),
            llm_api_key,
            llm_model,
            embedding_model,
            top_k,
            max_context_chars,
            auth_token,
            },
            settings_source,
        ))
    }
}

#[derive(Clone)]
struct AppState {
    cfg: AppConfig,
    http: Client,
    rag: Arc<RagIndex>,
    transcript_cache: Arc<RwLock<HashMap<u32, Arc<Vec<TranscriptEntry>>>>>,
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse()?))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let (cfg, settings_source) = AppConfig::from_env_and_settings()?;
    info!("Settings source: {}", settings_source);
    info!("Loading RAG DB: {}", cfg.rag_db_path.display());
    let rag = RagIndex::load(&cfg.rag_db_path)?;
    info!("RAG items: {}", rag.items.len());

    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("*"))
        .allow_methods([Method::POST, Method::GET, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            HeaderName::from_static("x-auth-token"),
        ]);

    let app_state = AppState {
        cfg: cfg.clone(),
        http: Client::new(),
        rag: Arc::new(rag),
        transcript_cache: Arc::new(RwLock::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/api/chat", post(chat))
        .route("/api/speakers", axum::routing::get(speakers_list))
        .route("/api/health", axum::routing::get(health))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    info!("RAG backend listening on http://{}", cfg.bind_addr);
    let listener = tokio::net::TcpListener::bind(cfg.bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpeakerInfo {
    speaker: String,
    slug: String,
    episodes_count: u32,
    utterances_count: u32,
    total_words: u32,
    #[serde(skip_deserializing, default)]
    has_profile: bool,
    #[serde(skip_deserializing, skip_serializing_if = "Option::is_none")]
    image: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SpeakerMeta {
    image: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SpeakersListResponse {
    speakers: Vec<SpeakerInfo>,
}

async fn speakers_list(State(st): State<AppState>) -> impl IntoResponse {
    match load_speakers_index(&st.cfg.speakers_dir) {
        Ok(speakers) => (StatusCode::OK, Json(SpeakersListResponse { speakers })).into_response(),
        Err(e) => {
            error!("Failed to load speakers: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Failed to load speakers: {}", e) })),
            )
                .into_response()
        }
    }
}

fn load_speakers_index(speakers_dir: &Path) -> Result<Vec<SpeakerInfo>> {
    let index_path = speakers_dir.join("index.json");
    if !index_path.exists() {
        return Ok(Vec::new());
    }
    let bytes = std::fs::read(&index_path)
        .with_context(|| format!("Failed to read {}", index_path.display()))?;
    let mut speakers: Vec<SpeakerInfo> = serde_json::from_slice(&bytes)
        .with_context(|| format!("Failed to parse {}", index_path.display()))?;
    
    // Check which speakers have profile markdown files and load image URLs from meta files
    for speaker in &mut speakers {
        let profile_path = speakers_dir.join(format!("{}.md", speaker.slug));
        speaker.has_profile = profile_path.exists();
        
        // Try to load image from meta file
        let meta_path = speakers_dir.join(format!("{}-meta.json", speaker.slug));
        if meta_path.exists() {
            if let Ok(meta_bytes) = std::fs::read(&meta_path) {
                if let Ok(meta) = serde_json::from_slice::<SpeakerMeta>(&meta_bytes) {
                    speaker.image = meta.image;
                }
            }
        }
        
        info!("Speaker '{}' (slug: {}): profile at {} exists = {}, image = {:?}", 
              speaker.speaker, speaker.slug, profile_path.display(), speaker.has_profile, speaker.image);
    }
    
    Ok(speakers)
}

fn load_speaker_profile(speakers_dir: &Path, slug: &str) -> Result<String> {
    let profile_path = speakers_dir.join(format!("{}.md", slug));
    if !profile_path.exists() {
        return Err(anyhow!("Speaker profile not found: {}", slug));
    }
    let content = std::fs::read_to_string(&profile_path)
        .with_context(|| format!("Failed to read profile {}", profile_path.display()))?;
    Ok(content)
}

fn get_speaker_name_from_slug(speakers_dir: &Path, slug: &str) -> Result<String> {
    let index = load_speakers_index(speakers_dir)?;
    for speaker in index {
        if speaker.slug == slug {
            return Ok(speaker.speaker);
        }
    }
    Err(anyhow!("Speaker not found: {}", slug))
}

fn extract_auth_token(headers: &HeaderMap) -> Option<String> {
    // Prefer explicit x-auth-token, but also accept Authorization: Bearer <token>
    if let Some(v) = headers.get("x-auth-token").and_then(|v| v.to_str().ok()) {
        let t = v.trim();
        if !t.is_empty() {
            return Some(t.to_string());
        }
    }

    if let Some(v) = headers.get(header::AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        let s = v.trim();
        if let Some(rest) = s.strip_prefix("Bearer ").or_else(|| s.strip_prefix("bearer ")) {
            let t = rest.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }

    None
}

fn is_auth_ok(cfg: &AppConfig, headers: &HeaderMap) -> bool {
    let Some(expected) = cfg.auth_token.as_ref() else {
        // No auth configured => allow.
        return true;
    };
    let Some(got) = extract_auth_token(headers) else {
        return false;
    };
    got == *expected
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest {
    query: String,
    #[serde(default)]
    top_k: Option<usize>,
    #[serde(default)]
    speaker_slug: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatResponse {
    answer: String,
    sources: Vec<ChatSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatSource {
    episode_number: u32,
    episode_title: Option<String>,
    start_sec: f64,
    end_sec: f64,
    start_hms: Option<String>,
    end_hms: Option<String>,
    score: f32,
    topic: Option<String>,
    subject_coarse: Option<String>,
    subject_fine: Option<String>,
    excerpt: String,
}

async fn chat(
    State(st): State<AppState>,
    headers: HeaderMap,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    if !is_auth_ok(&st.cfg, &headers) {
        return (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "error": "permission denied" })),
        )
            .into_response();
    }
    match chat_impl(&st, req).await {
        Ok(resp) => (StatusCode::OK, Json(resp)).into_response(),
        Err(e) => {
            error!("{:?}", e);
            let msg = format!("{}", e);
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": msg })),
            )
                .into_response()
        }
    }
}

async fn chat_impl(st: &AppState, req: ChatRequest) -> Result<ChatResponse> {
    let query = req.query.trim();
    if query.is_empty() {
        return Err(anyhow!("query must not be empty"));
    }

    let top_k = req.top_k.unwrap_or(st.cfg.top_k).clamp(1, 20);

    // Get speaker name from slug if requested
    let speaker_name = if let Some(slug) = req.speaker_slug.as_ref() {
        get_speaker_name_from_slug(&st.cfg.speakers_dir, slug).ok()
    } else {
        None
    };

    // Load speaker profile if requested
    let speaker_profile = if let Some(slug) = req.speaker_slug.as_ref() {
        load_speaker_profile(&st.cfg.speakers_dir, slug).ok()
    } else {
        None
    };

    // 1) Retrieve - get more results if we need to filter by speaker
    let search_k = if speaker_name.is_some() { top_k * 3 } else { top_k };
    let hits = retrieve(st, query, search_k).await?;

    // 2) Build context from transcripts
    let mut sources: Vec<ChatSource> = Vec::with_capacity(hits.len());
    let mut context_parts: Vec<String> = Vec::with_capacity(hits.len());

    for h in hits {
        let transcript = load_transcript_entries(st, h.item.episode_number).await?;
        let excerpt = excerpt_for_window(
            &transcript,
            h.item.start_sec,
            h.item.end_sec,
            4000,
            speaker_name.as_deref(),
        );

        // Skip empty excerpts when filtering by speaker
        if speaker_name.is_some() && excerpt.contains("[no transcript entries found") {
            continue;
        }

        let ep = h.item.episode_number;
        let start = h
            .item
            .start_hms
            .clone()
            .unwrap_or_else(|| seconds_to_hms(h.item.start_sec));
        let end = h
            .item
            .end_hms
            .clone()
            .unwrap_or_else(|| seconds_to_hms(h.item.end_sec));
        let topic = h.item.topic.clone().filter(|s| !s.trim().is_empty());

        context_parts.push(format!(
            "SOURCE: Episode {ep} ({start} - {end}){}\n{excerpt}\n",
            topic
                .as_ref()
                .map(|t| format!(" | Topic: {t}"))
                .unwrap_or_default()
        ));

        sources.push(ChatSource {
            episode_number: h.item.episode_number,
            episode_title: h
                .item
                .episode_title
                .clone()
                .filter(|s| !s.trim().is_empty()),
            start_sec: h.item.start_sec,
            end_sec: h.item.end_sec,
            start_hms: h.item.start_hms.clone(),
            end_hms: h.item.end_hms.clone(),
            score: h.score,
            topic,
            subject_coarse: h.item.subject.as_ref().and_then(|s| s.coarse.clone()),
            subject_fine: h.item.subject.as_ref().and_then(|s| s.fine.clone()),
            excerpt,
        });

        // Stop when we have enough sources
        if sources.len() >= top_k {
            break;
        }
    }

    // Keep prompt bounded.
    let mut context = context_parts.join("\n");
    if context.len() > st.cfg.max_context_chars {
        context.truncate(st.cfg.max_context_chars);
        context.push_str("\n\n[context truncated]\n");
    }

    // 3) Ask LLM
    let answer = llm_answer(st, query, &context, speaker_profile.as_deref()).await?;

    Ok(ChatResponse { answer, sources })
}

// ------------------------ Retrieval ------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RagDb {
    #[allow(dead_code)]
    schema_version: Option<u32>,
    #[allow(dead_code)]
    embedding_model: Option<String>,
    items: Vec<RagItem>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RagItem {
    #[allow(dead_code)]
    id: u32,
    episode_number: u32,
    episode_title: Option<String>,
    topic: Option<String>,
    subject: Option<RagSubject>,
    start_sec: f64,
    end_sec: f64,
    start_hms: Option<String>,
    end_hms: Option<String>,
    summary: Option<String>,
    text: Option<String>,
    embedding: Option<Vec<f32>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RagSubject {
    coarse: Option<String>,
    fine: Option<String>,
}

struct RagIndex {
    items: Vec<RagItem>,
    // Precomputed norms for cosine similarity; 0.0 if missing.
    norms: Vec<f32>,
    // True when *all* items have embeddings.
    has_embeddings: bool,
}

impl RagIndex {
    fn load(path: &PathBuf) -> Result<Self> {
        let bytes =
            std::fs::read(path).with_context(|| format!("Failed to read {}", path.display()))?;
        let db: RagDb = serde_json::from_slice(&bytes)
            .with_context(|| format!("Failed to parse JSON {}", path.display()))?;

        let mut norms = Vec::with_capacity(db.items.len());
        let mut has_embeddings = true;
        for it in &db.items {
            if let Some(v) = &it.embedding {
                norms.push(l2_norm(v));
            } else {
                norms.push(0.0);
                has_embeddings = false;
            }
        }

        Ok(Self {
            items: db.items,
            norms,
            has_embeddings,
        })
    }
}

#[derive(Clone)]
struct Hit {
    item: RagItem,
    score: f32,
}

async fn retrieve(st: &AppState, query: &str, top_k: usize) -> Result<Vec<Hit>> {
    if st.rag.has_embeddings {
        let q = embed_query(st, query).await?;
        let qn = l2_norm(&q);
        if qn <= 0.0 {
            return Err(anyhow!("Query embedding norm is 0"));
        }

        let mut scored: Vec<(usize, f32)> = Vec::with_capacity(st.rag.items.len());
        for (i, it) in st.rag.items.iter().enumerate() {
            let Some(v) = &it.embedding else { continue };
            let dn = st.rag.norms[i];
            if dn <= 0.0 {
                continue;
            }
            let s = dot(&q, v) / (qn * dn);
            if s.is_finite() {
                scored.push((i, s));
            }
        }

        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
        scored.truncate(top_k);
        Ok(scored
            .into_iter()
            .map(|(i, score)| Hit {
                item: st.rag.items[i].clone(),
                score,
            })
            .collect())
    } else {
        // Fallback if DB was built with --no-embeddings.
        let q = normalize_for_match(query);
        let q_tokens: Vec<&str> = q.split_whitespace().collect();

        let mut scored: Vec<(usize, f32)> = Vec::with_capacity(st.rag.items.len());
        for (i, it) in st.rag.items.iter().enumerate() {
            let hay = normalize_for_match(
                it.text
                    .as_deref()
                    .or(it.summary.as_deref())
                    .unwrap_or_default(),
            );
            if hay.is_empty() {
                continue;
            }
            let mut score = 0.0f32;
            for t in &q_tokens {
                if hay.contains(t) {
                    score += 1.0;
                }
            }
            // Mild bonus for exact substring match.
            if hay.contains(&q) {
                score += 2.0;
            }
            if score > 0.0 {
                scored.push((i, score));
            }
        }
        scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(Ordering::Equal));
        scored.truncate(top_k);

        Ok(scored
            .into_iter()
            .map(|(i, score)| Hit {
                item: st.rag.items[i].clone(),
                score,
            })
            .collect())
    }
}

fn normalize_for_match(s: &str) -> String {
    s.to_lowercase()
        .replace(|c: char| !c.is_alphanumeric() && !c.is_whitespace(), " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn dot(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    let mut sum = 0.0f32;
    for i in 0..n {
        sum += a[i] * b[i];
    }
    sum
}

fn l2_norm(v: &[f32]) -> f32 {
    let mut s = 0.0f32;
    for &x in v {
        s += x * x;
    }
    s.sqrt()
}

// ------------------------ Transcript extraction ------------------------

#[derive(Debug, Deserialize, Clone)]
struct TranscriptFile {
    transcript: Vec<TranscriptEntry>,
}

#[derive(Debug, Deserialize, Clone)]
struct TranscriptEntry {
    speaker: Option<String>,
    time: String,
    text: String,
}

async fn load_transcript_entries(
    st: &AppState,
    episode_number: u32,
) -> Result<Arc<Vec<TranscriptEntry>>> {
    // Fast path from cache
    {
        let cache = st.transcript_cache.read().await;
        if let Some(v) = cache.get(&episode_number) {
            return Ok(v.clone());
        }
    }

    let fname = format!("{episode_number}-ts.json");
    let path = st.cfg.episodes_dir.join(fname);
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == io::ErrorKind::NotFound => {
            warn!("Transcript not found: {}", path.display());
            let arc = Arc::new(Vec::new());
            let mut cache = st.transcript_cache.write().await;
            cache.insert(episode_number, arc.clone());
            return Ok(arc);
        }
        Err(e) => {
            return Err(anyhow!(e).context(format!("Failed to read transcript {}", path.display())));
        }
    };
    let tf: TranscriptFile = serde_json::from_slice(&bytes)
        .with_context(|| format!("Failed to parse {}", path.display()))?;

    let arc = Arc::new(tf.transcript);
    let mut cache = st.transcript_cache.write().await;
    cache.insert(episode_number, arc.clone());
    Ok(arc)
}

fn excerpt_for_window(
    transcript: &[TranscriptEntry],
    start_sec: f64,
    end_sec: f64,
    max_chars: usize,
    speaker_filter: Option<&str>,
) -> String {
    let mut out = String::new();
    let mut first = true;

    for e in transcript {
        let Some(t) = hms_to_seconds(&e.time) else {
            continue;
        };
        if t + 0.001 < start_sec {
            continue;
        }
        if t - 0.001 > end_sec {
            break;
        }

        // Filter by speaker if requested
        if let Some(filter_speaker) = speaker_filter {
            let entry_speaker = e.speaker.as_deref().unwrap_or("").trim();
            if !entry_speaker.eq_ignore_ascii_case(filter_speaker) {
                continue;
            }
        }

        if !first {
            out.push('\n');
        }
        first = false;

        let who = e
            .speaker
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("unknown");
        out.push_str(&format!("[{}] {}: {}", e.time, who, e.text.trim()));

        if out.len() >= max_chars {
            out.truncate(max_chars);
            out.push_str("\n…");
            break;
        }
    }

    if out.trim().is_empty() {
        // Still provide something so the LLM has a stable format.
        let speaker_note = speaker_filter
            .map(|s| format!(" (filtered by speaker: {})", s))
            .unwrap_or_default();
        format!(
            "[no transcript entries found in window {} - {}{}]",
            seconds_to_hms(start_sec),
            seconds_to_hms(end_sec),
            speaker_note
        )
    } else {
        out
    }
}

fn hms_to_seconds(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let parts: Vec<&str> = s.split(':').collect();
    let nums: Vec<i64> = parts
        .iter()
        .map(|p| p.parse::<i64>().ok())
        .collect::<Option<_>>()?;
    match nums.as_slice() {
        [m, sec] => Some((*m as f64) * 60.0 + (*sec as f64)),
        [h, m, sec] => Some((*h as f64) * 3600.0 + (*m as f64) * 60.0 + (*sec as f64)),
        [sec] => Some(*sec as f64),
        _ => None,
    }
}

fn seconds_to_hms(sec: f64) -> String {
    if !sec.is_finite() || sec < 0.0 {
        return "0:00".to_string();
    }
    let s = sec.floor() as i64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    let ss = s % 60;
    if h > 0 {
        format!("{h}:{:02}:{:02}", m, ss)
    } else {
        format!("{m}:{:02}", ss)
    }
}

// ------------------------ LLM (OpenAI-compatible) ------------------------

#[derive(Debug, Deserialize)]
struct EmbeddingsResponse {
    data: Vec<EmbeddingDatum>,
}

#[derive(Debug, Deserialize)]
struct EmbeddingDatum {
    embedding: Vec<f32>,
}

async fn embed_query(st: &AppState, query: &str) -> Result<Vec<f32>> {
    #[derive(Serialize)]
    struct EmbReq<'a> {
        model: &'a str,
        input: Vec<&'a str>,
    }
    let url = format!("{}/embeddings", st.cfg.llm_base_url);
    let resp = st
        .http
        .post(url)
        .bearer_auth(&st.cfg.llm_api_key)
        .json(&EmbReq {
            model: &st.cfg.embedding_model,
            input: vec![query],
        })
        .send()
        .await
        .context("Embedding request failed")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Embedding API error: {} - {}", status, body));
    }
    let data: EmbeddingsResponse = resp.json().await.context("Invalid embeddings JSON")?;
    let v = data
        .data
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("Embedding API returned no vectors"))?
        .embedding;
    Ok(v)
}

async fn llm_answer(st: &AppState, query: &str, context: &str, speaker_profile: Option<&str>) -> Result<String> {
    #[derive(Serialize)]
    struct ChatReq<'a> {
        model: &'a str,
        messages: Vec<ChatMsg<'a>>,
        temperature: f32,
    }
    #[derive(Serialize)]
    struct ChatMsg<'a> {
        role: &'a str,
        content: &'a str,
    }

    #[derive(Deserialize)]
    struct ChatResp {
        choices: Vec<ChatChoice>,
    }
    #[derive(Deserialize)]
    struct ChatChoice {
        message: ChatChoiceMsg,
    }
    #[derive(Deserialize)]
    struct ChatChoiceMsg {
        content: String,
    }

    let (system, user_prompt) = if let Some(profile) = speaker_profile {
        // Speaker persona mode
        let system = format!(
            "You are roleplaying as a fictional person described in the following speaker profile. \
            Answer the user's question using ONLY the provided SOURCES (transcript excerpts), \
            but deliver the answer in the voice, style, and personality described in the profile below.\n\n\
            SPEAKER PROFILE:\n{}\n\n\
            IMPORTANT:\n\
            - Stay in character throughout your response\n\
            - Use the vocabulary, phrases, and speech patterns from the profile\n\
            - Match the humor style and attitude described\n\
            - If the sources don't contain enough information, say so in character\n\
            - Include citations inline like: (Episode 281, 12:38-17:19)\n\
            - Answer in German unless the user asks otherwise",
            profile
        );
        
        let user_prompt = format!(
            "QUESTION:\n{}\n\nSOURCES:\n{}\n\n\
            Remember: Answer this question as the person from the speaker profile, \
            using their typical vocabulary, style, and humor. Use only information from the sources.",
            query, context
        );
        
        (system, user_prompt)
    } else {
        // Neutral mode (original behavior)
        let system = "You are a helpful RAG assistant. Answer the user's question using ONLY the provided SOURCES (transcript excerpts). If the sources do not contain enough information, say so explicitly. When you make a factual claim, cite it inline like: (Episode 281, 12:38-17:19). Keep the answer concise and in German unless the user asks otherwise.".to_string();
        
        let user_prompt = format!(
            "QUESTION:\n{query}\n\nSOURCES:\n{context}\n\nINSTRUCTIONS:\n- Use the sources only.\n- Prefer quoting short phrases when helpful.\n- Include citations with episode number and time window.\n"
        );
        
        (system, user_prompt)
    };

    let url = format!("{}/chat/completions", st.cfg.llm_base_url);
    let resp = st
        .http
        .post(url)
        .bearer_auth(&st.cfg.llm_api_key)
        .json(&ChatReq {
            model: &st.cfg.llm_model,
            messages: vec![
                ChatMsg {
                    role: "system",
                    content: &system,
                },
                ChatMsg {
                    role: "user",
                    content: &user_prompt,
                },
            ],
            temperature: 0.2,
        })
        .send()
        .await
        .context("Chat request failed")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Chat API error: {} - {}", status, body));
    }

    let data: ChatResp = resp.json().await.context("Invalid chat JSON")?;
    let content = data
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| anyhow!("Chat API returned no choices"))?
        .message
        .content;
    Ok(content.trim().to_string())
}
