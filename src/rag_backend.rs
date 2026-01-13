// Main entry point for RAG backend
mod auth;
mod cache;
mod config;
mod email;
mod handlers;
mod lance;
mod rag;
mod transcript;
mod utils;

use anyhow::{Context, Result};
use axum::{
    http::{header, HeaderName, HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::post,
    Router,
};
use moka::future::Cache;
use reqwest::Client;
use std::time::Duration;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use config::{AppConfig, AppState};
use handlers::{
    activate_token, chat, delete_token, episodes_latest, episodes_search, increase_token_limit,
    list_tokens, request_token, speakers_list, token_info,
};
use handlers::analytics::{self, insert_test_data_endpoint, stats, track, track_episode_play};
use cache::load_rag_index_cached;
use std::path::PathBuf;
use std::sync::Arc;

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env().add_directive("info".parse()?))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let (cfg, settings_source) = AppConfig::from_env_and_settings()?;
    info!("Settings source: {}", settings_source);
    
    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("*"))
        .allow_methods([Method::POST, Method::GET, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::AUTHORIZATION,
            HeaderName::from_static("x-auth-token"),
        ]);

    // Configure HTTP client with connection pooling
    let http = Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .pool_max_idle_per_host(10)
        .build()
        .context("Failed to create HTTP client")?;
    
    // Initialize LRU caches with size limits and TTL
    // Transcript cache: up to 1000 episodes, 1 hour TTL
    let transcript_cache = Cache::builder()
        .max_capacity(1000)
        .time_to_live(Duration::from_secs(3600))
        .time_to_idle(Duration::from_secs(1800))
        .build();
    
    // RAG cache: up to 20 podcasts, no TTL (never expires)
    let rag_cache = Cache::builder()
        .max_capacity(20)
        .build();
    
    // Episode metadata cache: up to 5000 episodes, 1 hour TTL
    let episode_metadata_cache = Cache::builder()
        .max_capacity(5000)
        .time_to_live(Duration::from_secs(3600))
        .time_to_idle(Duration::from_secs(1800))
        .build();
    
    // Episode list cache: up to 20 podcasts, 30 minutes TTL
    let episode_list_cache = Cache::builder()
        .max_capacity(20)
        .time_to_live(Duration::from_secs(1800))
        .time_to_idle(Duration::from_secs(900))
        .build();
    
    // Speaker profile cache: up to 500 profiles, 1 hour TTL
    let speaker_profile_cache = Cache::builder()
        .max_capacity(500)
        .time_to_live(Duration::from_secs(3600))
        .time_to_idle(Duration::from_secs(1800))
        .build();
    
    // Speakers index cache: up to 20 podcasts, 30 minutes TTL
    let speakers_index_cache = Cache::builder()
        .max_capacity(20)
        .time_to_live(Duration::from_secs(1800))
        .time_to_idle(Duration::from_secs(900))
        .build();
    
    // Speaker meta cache: up to 500 entries, 1 hour TTL
    let speaker_meta_cache = Cache::builder()
        .max_capacity(500)
        .time_to_live(Duration::from_secs(3600))
        .time_to_idle(Duration::from_secs(1800))
        .build();
    
    // Episode topics map cache: up to 20 podcasts, no TTL (never expires)
    let episode_topics_map_cache = Cache::builder()
        .max_capacity(20)
        .build();
    
    // Episode files cache: up to 5000 episodes, 1 hour TTL
    let episode_files_cache = Cache::builder()
        .max_capacity(5000)
        .time_to_live(Duration::from_secs(3600))
        .time_to_idle(Duration::from_secs(1800))
        .build();

    // Initialize analytics database
    let analytics_db_path = PathBuf::from("analytics.db");
    let geoip_db_path = std::env::var("GEOIP_DB_PATH")
        .ok()
        .map(PathBuf::from)
        .or_else(|| Some(PathBuf::from("GeoLite2-City.mmdb")));
    
    let analytics_db = Arc::new(
        analytics::AnalyticsDb::new(&analytics_db_path, geoip_db_path.as_ref())
            .context("Failed to initialize analytics database")?
    );
    
    match &geoip_db_path {
        Some(path) if path.exists() => {
            info!("GeoIP database loaded successfully");
        }
        Some(path) => {
            info!("GeoIP database path configured but file not found: {}. Location tracking will be disabled.", path.display());
        }
        None => {
            info!("GeoIP database not configured. Location tracking will be disabled. Set GEOIP_DB_PATH env var or place GeoLite2-City.mmdb in the project root.");
        }
    }

    // Initialize token system if enabled
    let (token_db, email_service) = if cfg.token_system_enabled {
        info!("Token system enabled - initializing...");
        
        // Initialize token database
        let token_db = match auth::TokenDatabase::new("auth_tokens.db").await {
            Ok(db) => {
                info!("Token database initialized");
                Some(Arc::new(db))
            }
            Err(e) => {
                tracing::warn!("Failed to initialize token database: {}. Token system disabled.", e);
                None
            }
        };

        // Initialize email service
        let email_service = if let (Some(host), Some(port), Some(user), Some(pass), Some(from), Some(base_url)) = (
            cfg.email_smtp_host.as_ref(),
            cfg.email_smtp_port,
            cfg.email_smtp_username.as_ref(),
            cfg.email_smtp_password.as_ref(),
            cfg.email_from_email.as_ref(),
            cfg.email_base_url.as_ref(),
        ) {
            match email::EmailService::new(
                host.clone(),
                port,
                user.clone(),
                pass.clone(),
                from.clone(),
                cfg.email_from_name.clone(),
                base_url.clone(),
            ) {
                Ok(service) => {
                    info!("Email service initialized (SMTP: {}:{})", host, port);
                    Some(Arc::new(service))
                }
                Err(e) => {
                    tracing::warn!("Failed to initialize email service: {}. Token requests will fail.", e);
                    None
                }
            }
        } else {
            tracing::warn!("Email settings incomplete. Token system will not be able to send activation emails.");
            None
        };

        (token_db, email_service)
    } else {
        info!("Token system disabled");
        (None, None)
    };

    let app_state = AppState {
        cfg: cfg.clone(),
        http,
        transcript_cache,
        rag_cache,
        episode_metadata_cache,
        episode_list_cache,
        speaker_profile_cache,
        speakers_index_cache,
        speaker_meta_cache,
        episode_topics_map_cache,
        episode_files_cache,
        analytics_db,
        token_db,
        email_service,
    };

    // Pre-cache all embedding databases
    info!("Pre-loading all embedding databases...");
    preload_embedding_databases(&app_state).await;
    info!("Finished pre-loading embedding databases");


    let app = Router::new()
        .route("/api/chat", post(chat))
        .route("/api/episodes/search", post(episodes_search))
        .route("/api/episodes/latest", post(episodes_latest))
        .route("/api/speakers", axum::routing::get(speakers_list))
        .route("/api/analytics/track", post(track))
        .route("/api/analytics/track-episode-play", post(track_episode_play))
        .route("/api/analytics/stats", axum::routing::get(stats))
        .route("/api/analytics/test-data", axum::routing::get(insert_test_data_endpoint))
        .route("/api/health", axum::routing::get(health))
        // Token system endpoints
        .route("/api/auth/request-token", post(request_token))
        .route("/api/auth/activate/:activation_code", axum::routing::get(activate_token))
        .route("/api/auth/token-info", axum::routing::get(token_info))
        // Admin token endpoints
        .route("/api/admin/tokens", axum::routing::get(list_tokens))
        .route("/api/admin/tokens/:token/increase-limit", post(increase_token_limit))
        .route("/api/admin/tokens/:token", axum::routing::delete(delete_token))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);

    info!("RAG backend listening on http://{}", cfg.bind_addr);
    let listener = tokio::net::TcpListener::bind(cfg.bind_addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// Pre-load all embedding databases found in the db/ directory
async fn preload_embedding_databases(app_state: &AppState) {
    let db_dir = PathBuf::from("db");
    
    // Read db directory to find all podcast subdirectories
    let mut entries = match tokio::fs::read_dir(&db_dir).await {
        Ok(entries) => entries,
        Err(e) => {
            tracing::warn!("Failed to read db directory: {}", e);
            return;
        }
    };
    
    let mut podcast_ids = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path.is_dir() {
            if let Some(podcast_id) = path.file_name().and_then(|n| n.to_str()) {
                // Check if rag-embeddings.json exists
                let rag_path = path.join("rag-embeddings.json");
                if tokio::fs::metadata(&rag_path).await.is_ok() {
                    podcast_ids.push(podcast_id.to_string());
                }
            }
        }
    }
    
    if podcast_ids.is_empty() {
        tracing::info!("No embedding databases found in db/ directory");
        return;
    }
    
    tracing::info!("Found {} embedding databases to pre-load: {:?}", podcast_ids.len(), podcast_ids);
    
    // Load all databases in parallel
    let mut load_tasks = Vec::new();
    for podcast_id in podcast_ids {
        let app_state_clone = app_state.clone();
        let podcast_id_clone = podcast_id.clone();
        load_tasks.push(tokio::spawn(async move {
            match load_rag_index_cached(&app_state_clone, &podcast_id_clone).await {
                Ok(_) => {
                    tracing::info!("✓ Pre-loaded embeddings for podcast: {}", podcast_id_clone);
                }
                Err(e) => {
                    tracing::warn!("Failed to pre-load embeddings for {}: {}", podcast_id_clone, e);
                }
            }
        }));
    }
    
    // Wait for all loads to complete
    for task in load_tasks {
        let _ = task.await;
    }
}
