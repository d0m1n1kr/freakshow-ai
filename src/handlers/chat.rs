use std::path::PathBuf;

use anyhow::{anyhow, Result};
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};

use crate::cache::{
    load_speaker_profile_cached, load_speakers_index_cached,
};
use crate::config::AppConfig;
use crate::cache::load_rag_index_cached;
use crate::rag::{embeddings::llm_answer, retrieval::retrieve};
use crate::transcript::{excerpt_for_window, load_transcript_entries};
use crate::utils::seconds_to_hms;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub query: String,
    #[serde(default)]
    pub top_k: Option<usize>,
    #[serde(default)]
    pub speaker_slug: Option<String>,
    #[serde(default)]
    pub speaker_slug2: Option<String>,
    #[serde(default)]
    pub podcast_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub answer: String,
    pub sources: Vec<ChatSource>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSource {
    pub episode_number: u32,
    pub episode_title: Option<String>,
    pub start_sec: f64,
    pub end_sec: f64,
    pub start_hms: Option<String>,
    pub end_hms: Option<String>,
    pub score: f32,
    pub topic: Option<String>,
    pub subject_coarse: Option<String>,
    pub subject_fine: Option<String>,
    pub excerpt: String,
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

pub async fn chat(
    State(st): State<crate::config::AppState>,
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

async fn chat_impl(st: &crate::config::AppState, req: ChatRequest) -> Result<ChatResponse> {
    let query = req.query.trim();
    if query.is_empty() {
        return Err(anyhow!("query must not be empty"));
    }

    // Determine podcast ID from request or use default
    let podcast_id = req.podcast_id.as_deref().unwrap_or("freakshow");
    
    // Load RAG database for this podcast (with caching)
    let rag = load_rag_index_cached(st, podcast_id).await?;
    
    // Use podcast-specific episodes directory
    let episodes_dir = PathBuf::from(format!("podcasts/{}/episodes", podcast_id));

    let top_k = req.top_k.unwrap_or(st.cfg.top_k).clamp(1, 20);

    // Get speaker name from slug if requested (using cached speakers index)
    let speaker_name = if let Some(slug) = req.speaker_slug.as_ref() {
        load_speakers_index_cached(st, podcast_id).await.ok()
            .and_then(|speakers| speakers.iter().find(|s| s.slug == *slug).map(|s| s.speaker.clone()))
    } else {
        None
    };
    
    // Get second speaker name from slug if requested (discussion mode)
    let speaker2_name = if let Some(slug) = req.speaker_slug2.as_ref() {
        load_speakers_index_cached(st, podcast_id).await.ok()
            .and_then(|speakers| speakers.iter().find(|s| s.slug == *slug).map(|s| s.speaker.clone()))
    } else {
        None
    };

    // Load speaker profile if requested (with caching)
    let speaker_profile = if let Some(slug) = req.speaker_slug.as_ref() {
        load_speaker_profile_cached(st, podcast_id, slug).await.ok()
    } else {
        None
    };
    
    // Load second speaker profile if requested (discussion mode, with caching)
    let speaker2_profile = if let Some(slug) = req.speaker_slug2.as_ref() {
        load_speaker_profile_cached(st, podcast_id, slug).await.ok()
    } else {
        None
    };

    // 1) Retrieve - get more results if we need to filter by speaker
    let search_k = if speaker_name.is_some() || speaker2_name.is_some() {
        top_k * 3
    } else {
        top_k
    };
    let hits = retrieve(st, &rag, query, search_k).await?;

    // 2) Build context from transcripts
    let mut sources: Vec<ChatSource> = Vec::with_capacity(hits.len());
    let mut context_parts: Vec<String> = Vec::with_capacity(hits.len());

    for h in hits {
        let transcript =
            load_transcript_entries(st, podcast_id, &episodes_dir, h.item.episode_number).await?;

        // If discussion mode is active (two speakers), build per-speaker excerpts so each position
        // is grounded in that speaker's actual transcript lines.
        let (excerpt, should_skip) = if let (Some(name1), Some(name2)) =
            (speaker_name.as_deref(), speaker2_name.as_deref())
        {
            let ex1 = excerpt_for_window(
                &transcript,
                h.item.start_sec,
                h.item.end_sec,
                2200,
                Some(name1),
            );
            let ex2 = excerpt_for_window(
                &transcript,
                h.item.start_sec,
                h.item.end_sec,
                2200,
                Some(name2),
            );

            let empty1 = ex1.contains("[no transcript entries found");
            let empty2 = ex2.contains("[no transcript entries found");

            // Format with clear separators and emphasis on who said what
            let combined = format!(
                "=== WHAT {} SAID ===\n{}\n\n=== WHAT {} SAID ===\n{}",
                name1.to_uppercase(), ex1, name2.to_uppercase(), ex2
            );
            (combined, empty1 && empty2)
        } else {
            let ex = excerpt_for_window(
                &transcript,
                h.item.start_sec,
                h.item.end_sec,
                4000,
                speaker_name.as_deref(),
            );
            // Skip empty excerpts when filtering by a single speaker
            let should_skip = speaker_name.is_some() && ex.contains("[no transcript entries found");
            (ex, should_skip)
        };

        if should_skip {
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
        // Truncate at a valid UTF-8 char boundary
        let mut truncate_pos = st.cfg.max_context_chars;
        while truncate_pos > 0 && !context.is_char_boundary(truncate_pos) {
            truncate_pos -= 1;
        }
        context.truncate(truncate_pos);
        context.push_str("\n\n[context truncated]\n");
    }

    // Load podcast profile if it exists (for discussion mode context)
    let podcast_profile_path = PathBuf::from(format!("podcasts/{}/podcast-profile.md", podcast_id));
    let podcast_profile = if podcast_profile_path.exists() {
        std::fs::read_to_string(&podcast_profile_path).ok()
    } else {
        None
    };

    // 3) Ask LLM
    let answer = llm_answer(
        st, 
        query, 
        &context, 
        speaker_profile.as_deref(),
        speaker2_profile.as_deref(),
        speaker_name.as_deref(),
        speaker2_name.as_deref(),
        podcast_profile.as_deref(),
    ).await?;

    Ok(ChatResponse { answer, sources })
}

