use anyhow::Result;
use serde::Deserialize;

use crate::config::AppState;
use crate::rag::embeddings::embed_query;
use crate::lance::{RagIndexLance, rag::{Hit as LanceHit, RagItem as LanceRagItem, RagSubject as LanceRagSubject}};

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RagItem {
    #[allow(dead_code)]
    pub id: u32,
    pub episode_number: u32,
    pub episode_title: Option<String>,
    pub topic: Option<String>,
    pub subject: Option<RagSubject>,
    pub start_sec: f64,
    pub end_sec: f64,
    pub start_hms: Option<String>,
    pub end_hms: Option<String>,
    pub summary: Option<String>,
    pub text: Option<String>,
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RagSubject {
    pub coarse: Option<String>,
    pub fine: Option<String>,
}

/// RAG index - now only supports LanceDB backend
#[derive(Clone)]
pub struct RagIndex {
    pub lance: RagIndexLance,
}

impl RagIndex {
    /// Create a RagIndex from a LanceDB backend
    pub fn new(lance: RagIndexLance) -> Self {
        Self { lance }
    }
}

#[derive(Clone)]
pub struct Hit {
    pub item: RagItem,
    pub score: f32,
}

pub async fn retrieve(st: &AppState, rag: &RagIndex, query: &str, top_k: usize) -> Result<Vec<Hit>> {
    // Use LanceDB
    let q = embed_query(st, query).await?;
    let lance_hits = rag.lance.search(&q, top_k).await?;
    
    // Convert LanceDB hits to our format
    Ok(lance_hits.into_iter().map(|h| Hit {
        item: RagItem {
            id: h.item.id,
            episode_number: h.item.episode_number,
            episode_title: h.item.episode_title,
            topic: h.item.topic,
            subject: h.item.subject.map(|s| RagSubject {
                coarse: s.coarse,
                fine: s.fine,
            }),
            start_sec: h.item.start_sec,
            end_sec: h.item.end_sec,
            start_hms: h.item.start_hms,
            end_hms: h.item.end_hms,
            summary: h.item.summary,
            text: h.item.text,
            embedding: h.item.embedding,
        },
        score: h.score,
    }).collect())
}

