use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use anyhow::{anyhow, Context, Result};
use moka::future::Cache;
use reqwest::Client;
use serde::Deserialize;

use crate::cache::{CachedEpisodeFiles, CachedEpisodeList, CachedEpisodeMetadata, CachedEpisodeTopicsMap, CachedRagIndex, CachedSpeakerMeta, CachedSpeakerProfile, CachedSpeakersIndex};

// Forward declarations to avoid circular dependency
pub type AnalyticsDb = crate::handlers::analytics::AnalyticsDb;
pub type TokenDatabase = crate::auth::TokenDatabase;
pub type EmailService = crate::email::EmailService;

#[derive(Debug, Deserialize, Clone)]
pub struct SettingsFile {
    llm: Option<LlmSettings>,
    #[serde(rename = "topicClustering")]
    topic_clustering: Option<TopicClusteringSettings>,
    rag: Option<RagSettings>,
    email: Option<EmailSettings>,
    #[serde(rename = "tokenSystem")]
    token_system: Option<TokenSystemSettings>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LlmSettings {
    #[serde(rename = "baseURL")]
    base_url: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    model: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TopicClusteringSettings {
    #[serde(rename = "embeddingModel")]
    embedding_model: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RagSettings {
    #[serde(rename = "authToken")]
    auth_token: Option<String>,
    #[serde(rename = "statsAuthToken")]
    stats_auth_token: Option<String>,
    #[serde(rename = "bindAddr")]
    bind_addr: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct EmailSettings {
    #[serde(rename = "smtpHost")]
    smtp_host: Option<String>,
    #[serde(rename = "smtpPort")]
    smtp_port: Option<u16>,
    #[serde(rename = "smtpUsername")]
    smtp_username: Option<String>,
    #[serde(rename = "smtpPassword")]
    smtp_password: Option<String>,
    #[serde(rename = "fromEmail")]
    from_email: Option<String>,
    #[serde(rename = "fromName")]
    from_name: Option<String>,
    #[serde(rename = "baseUrl")]
    base_url: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TokenSystemSettings {
    #[serde(rename = "defaultLimit")]
    default_limit: Option<i64>,
    #[serde(rename = "tokenExpireDays")]
    token_expire_days: Option<i64>,
    #[serde(rename = "enabled")]
    enabled: Option<bool>,
}

fn try_read_json<T: for<'de> Deserialize<'de>>(path: &PathBuf) -> Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = std::fs::read(path).with_context(|| format!("Failed to read {}", path.display()))?;
    let parsed: T = serde_json::from_slice(&bytes)
        .with_context(|| format!("Failed to parse {}", path.display()))?;
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
pub struct AppConfig {
    pub bind_addr: SocketAddr,
    pub episodes_dir: PathBuf,
    pub speakers_dir: PathBuf,
    pub llm_base_url: String,
    pub llm_api_key: String,
    pub llm_model: String,
    pub embedding_model: String,
    pub top_k: usize,
    pub max_context_chars: usize,
    pub auth_token: Option<String>,
    pub stats_auth_token: Option<String>,
    // Email settings
    pub email_smtp_host: Option<String>,
    pub email_smtp_port: Option<u16>,
    pub email_smtp_username: Option<String>,
    pub email_smtp_password: Option<String>,
    pub email_from_email: Option<String>,
    pub email_from_name: Option<String>,
    pub email_base_url: Option<String>,
    // Token system settings
    pub token_system_enabled: bool,
    pub token_default_limit: Option<i64>,
    pub token_expire_days: Option<i64>,
}

impl AppConfig {
    pub fn from_env_and_settings() -> Result<(Self, String)> {
        let (settings, settings_source) = load_settings()?;

        // Default podcast ID, can be overridden via PODCAST_ID env var
        let podcast_id = std::env::var("PODCAST_ID").unwrap_or_else(|_| "freakshow".to_string());
        let episodes_dir = PathBuf::from(
            std::env::var("EPISODES_DIR")
                .unwrap_or_else(|_| format!("podcasts/{}/episodes", podcast_id)),
        );
        let speakers_dir = PathBuf::from(
            std::env::var("SPEAKERS_DIR")
                .unwrap_or_else(|_| format!("podcasts/{}/speakers", podcast_id)),
        );

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

        let stats_auth_token = std::env::var("RAG_STATS_AUTH_TOKEN")
            .ok()
            .or_else(|| settings_rag.and_then(|r| r.stats_auth_token.clone()))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        // Email settings
        let settings_email = settings.as_ref().and_then(|s| s.email.as_ref());
        let email_smtp_host = settings_email.and_then(|e| e.smtp_host.clone());
        let email_smtp_port = settings_email.and_then(|e| e.smtp_port);
        let email_smtp_username = settings_email.and_then(|e| e.smtp_username.clone());
        let email_smtp_password = settings_email.and_then(|e| e.smtp_password.clone());
        let email_from_email = settings_email.and_then(|e| e.from_email.clone());
        let email_from_name = settings_email.and_then(|e| e.from_name.clone());
        let email_base_url = settings_email.and_then(|e| e.base_url.clone());

        // Token system settings
        let settings_token = settings.as_ref().and_then(|s| s.token_system.as_ref());
        let token_system_enabled = settings_token
            .and_then(|t| t.enabled)
            .unwrap_or(false);
        let token_default_limit = settings_token.and_then(|t| t.default_limit);
        let token_expire_days = settings_token.and_then(|t| t.token_expire_days);

        Ok((
            Self {
                bind_addr,
                episodes_dir,
                speakers_dir,
                llm_base_url: llm_base_url.trim_end_matches('/').to_string(),
                llm_api_key,
                llm_model,
                embedding_model,
                top_k,
                max_context_chars,
                auth_token,
                stats_auth_token,
                email_smtp_host,
                email_smtp_port,
                email_smtp_username,
                email_smtp_password,
                email_from_email,
                email_from_name,
                email_base_url,
                token_system_enabled,
                token_default_limit,
                token_expire_days,
            },
            settings_source,
        ))
    }
}

#[derive(Clone)]
pub struct AppState {
    pub cfg: AppConfig,
    pub http: Client,
    // LRU Cache with size limits and TTL
    pub transcript_cache: Cache<(String, u32), Arc<Vec<crate::transcript::TranscriptEntry>>>,
    pub rag_cache: Cache<String, CachedRagIndex>,
    pub episode_metadata_cache: Cache<(String, u32), CachedEpisodeMetadata>,
    pub episode_list_cache: Cache<String, CachedEpisodeList>,
    pub speaker_profile_cache: Cache<(String, String), CachedSpeakerProfile>,
    pub speakers_index_cache: Cache<String, CachedSpeakersIndex>,
    pub speaker_meta_cache: Cache<(String, String), CachedSpeakerMeta>,
    pub episode_topics_map_cache: Cache<String, CachedEpisodeTopicsMap>,
    pub episode_files_cache: Cache<(String, u32), CachedEpisodeFiles>,
    pub analytics_db: Arc<AnalyticsDb>,
    // Token system
    pub token_db: Option<Arc<TokenDatabase>>,
    pub email_service: Option<Arc<EmailService>>,
}

