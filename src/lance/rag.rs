use anyhow::{anyhow, Context, Result};
use arrow_array::Array;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use lancedb::Table;
use lancedb::query::{ExecutableQuery, QueryBase};

// Re-import types from rag module
#[derive(Clone)]
pub struct Hit {
    pub item: RagItem,
    pub score: f32,
}

#[derive(Clone)]
pub struct RagItem {
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

#[derive(Clone)]
pub struct RagSubject {
    pub coarse: Option<String>,
    pub fine: Option<String>,
}

#[derive(Clone)]
pub struct RagIndexLance {
    pub table: Arc<Table>,
    pub metadata: RagMetadata,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RagMetadata {
    pub embedding_model: Option<String>,
    pub embedding_dimensions: usize,
    pub record_count: usize,
}

impl RagIndexLance {
    pub async fn open(podcast_id: &str) -> Result<Self> {
        let lance_dir = PathBuf::from(format!("db/{}/lance", podcast_id));
        let meta_path = lance_dir.join("metadata.json");
        
        if !lance_dir.exists() {
            return Err(anyhow!(
                "LanceDB not found for {}. Run: node scripts/create-rag-db.js --podcast {}",
                podcast_id, podcast_id
            ));
        }
        
        // Convert path to absolute path for LanceDB connection
        let abs_path = lance_dir.canonicalize()
            .with_context(|| format!("Failed to resolve path: {:?}", lance_dir))?;
        let path_str = abs_path.to_str()
            .ok_or_else(|| anyhow::anyhow!("Path contains invalid UTF-8 characters: {:?}", abs_path))?;
        let db = lancedb::connect(path_str).execute().await?;
        let table = db.open_table("rag_chunks").execute().await?;
        
        // Load metadata
        let metadata: serde_json::Value = if meta_path.exists() {
            let json = tokio::fs::read_to_string(&meta_path).await?;
            serde_json::from_str(&json)?
        } else {
            serde_json::json!({})
        };
        
        let rag_meta = metadata.get("rag").cloned().unwrap_or_else(|| serde_json::json!({}));
        let metadata = RagMetadata {
            embedding_model: rag_meta.get("embeddingModel")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            embedding_dimensions: rag_meta.get("embeddingDimensions")
                .and_then(|v| v.as_u64())
                .unwrap_or(1536) as usize,
            record_count: rag_meta.get("recordCount")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize,
        };
        
        Ok(Self {
            table: Arc::new(table),
            metadata,
        })
    }
    
    pub async fn search(&self, query_embedding: &[f32], limit: usize) -> Result<Vec<Hit>> {
        use arrow_array::{
            Float32Array, Float64Array, Int32Array, Int64Array, LargeStringArray, StringArray,
            UInt32Array, UInt64Array,
        };
        use futures::TryStreamExt;
        
        let stream = self.table
            .vector_search(query_embedding)?
            .limit(limit)
            .select(lancedb::query::Select::columns(&[
                "_rowid",
                "episodeNumber",
                "episodeTitle",
                "topic",
                "subjectCoarse",
                "subjectFine",
                "startSec",
                "endSec",
                "startHms",
                "endHms",
                "durationSec",
                "summary",
                "text",
                "source",
                "_distance",
            ]))
            .execute()
            .await?;
        
        let batches: Vec<_> = stream.try_collect().await?;
        let mut hits = Vec::new();
        
        for batch in batches {
            let num_rows = batch.num_rows();
            
            // Extract columns (using _rowid instead of id)
            let ids_col = batch.column_by_name("_rowid")
                .context("Missing _rowid column")?;
            
            // Debug: print the actual type name
            tracing::debug!("_rowid type: {:?}, type_id: {:?}", ids_col.data_type(), ids_col.as_any().type_id());
            
            // Handle different numeric types for _rowid - try explicit arrow_array:: prefix
            use arrow_array as arrow;
            let id_values: Vec<u32> = if let Some(arr) = ids_col.as_any().downcast_ref::<arrow::UInt64Array>() {
                arr.values().iter().map(|&v| v as u32).collect()
            } else if let Some(arr) = ids_col.as_any().downcast_ref::<arrow::Int64Array>() {
                arr.values().iter().map(|&v| v as u32).collect()
            } else if let Some(arr) = ids_col.as_any().downcast_ref::<arrow::UInt32Array>() {
                arr.values().to_vec()
            } else if let Some(arr) = ids_col.as_any().downcast_ref::<arrow::Int32Array>() {
                arr.values().iter().map(|&v| v as u32).collect()
            } else {
                return Err(anyhow!("Unsupported _rowid type: {:?}, please report this", ids_col.data_type()));
            };
            
            let episode_nums = batch.column_by_name("episodeNumber")
                .context("Missing episodeNumber")?
                ;

            // episodeNumber can be different integer widths depending on Arrow/DataFusion planning.
            let episode_num_values: Vec<u32> = if let Some(arr) = episode_nums
                .as_any()
                .downcast_ref::<Int32Array>()
            {
                arr.values().iter().map(|&v| v as u32).collect()
            } else if let Some(arr) = episode_nums
                .as_any()
                .downcast_ref::<Int64Array>()
            {
                arr.values().iter().map(|&v| v as u32).collect()
            } else if let Some(arr) = episode_nums
                .as_any()
                .downcast_ref::<UInt32Array>()
            {
                arr.values().to_vec()
            } else if let Some(arr) = episode_nums
                .as_any()
                .downcast_ref::<UInt64Array>()
            {
                arr.values().iter().map(|&v| v as u32).collect()
            } else if let Some(arr) = episode_nums
                .as_any()
                .downcast_ref::<Float64Array>()
            {
                // Some Node->Arrow inference paths store numeric JS values as Float64.
                arr.values()
                    .iter()
                    .map(|&v| v.round().max(0.0) as u32)
                    .collect()
            } else if let Some(arr) = episode_nums
                .as_any()
                .downcast_ref::<Float32Array>()
            {
                arr.values()
                    .iter()
                    .map(|&v| (v as f64).round().max(0.0) as u32)
                    .collect()
            } else {
                return Err(anyhow!(
                    "Failed to cast episodeNumber (type {:?})",
                    episode_nums.data_type()
                ));
            };

            let get_string_vec = |col_name: &str| -> Result<Vec<String>> {
                let col = batch
                    .column_by_name(col_name)
                    .with_context(|| format!("Missing {}", col_name))?;
                if let Some(arr) = col.as_any().downcast_ref::<StringArray>() {
                    let mut out = Vec::with_capacity(num_rows);
                    for i in 0..num_rows {
                        out.push(if arr.is_null(i) { "" } else { arr.value(i) }.to_string());
                    }
                    Ok(out)
                } else if let Some(arr) = col.as_any().downcast_ref::<LargeStringArray>() {
                    let mut out = Vec::with_capacity(num_rows);
                    for i in 0..num_rows {
                        out.push(if arr.is_null(i) { "" } else { arr.value(i) }.to_string());
                    }
                    Ok(out)
                } else {
                    Err(anyhow!(
                        "Failed to cast {} (type {:?})",
                        col_name,
                        col.data_type()
                    ))
                }
            };

            let episode_title_values = get_string_vec("episodeTitle")?;
            let topic_values = get_string_vec("topic")?;
            let subject_coarse_values = get_string_vec("subjectCoarse")?;
            let subject_fine_values = get_string_vec("subjectFine")?;
            let summary_values = get_string_vec("summary")?;
            let text_values = get_string_vec("text")?;
            
            // Handle both Float32 and Float64 for start/end seconds
            let start_secs: Vec<f64> = if let Some(col) = batch.column_by_name("startSec") {
                if let Some(arr) = col.as_any().downcast_ref::<Float64Array>() {
                    arr.values().to_vec()
                } else if let Some(arr) = col.as_any().downcast_ref::<Float32Array>() {
                    arr.values().iter().map(|&v| v as f64).collect()
                } else {
                    vec![0.0; batch.num_rows()]
                }
            } else {
                vec![0.0; batch.num_rows()]
            };
            
            let end_secs: Vec<f64> = if let Some(col) = batch.column_by_name("endSec") {
                if let Some(arr) = col.as_any().downcast_ref::<Float64Array>() {
                    arr.values().to_vec()
                } else if let Some(arr) = col.as_any().downcast_ref::<Float32Array>() {
                    arr.values().iter().map(|&v| v as f64).collect()
                } else {
                    vec![0.0; batch.num_rows()]
                }
            } else {
                vec![0.0; batch.num_rows()]
            };
            
            let start_hms_values = get_string_vec("startHms")?;
            let end_hms_values = get_string_vec("endHms")?;
            
            // Extract distance/score if available
            let scores: Vec<f32> = if let Some(col) = batch.column_by_name("_distance") {
                if let Some(arr) = col.as_any().downcast_ref::<Float32Array>() {
                    arr.values().to_vec()
                } else if let Some(arr) = col.as_any().downcast_ref::<Float64Array>() {
                    arr.values().iter().map(|&v| v as f32).collect()
                } else {
                    vec![0.0; num_rows]
                }
            } else {
                vec![0.0; num_rows]
            };
            
            for i in 0..num_rows {
                let episode_title_str = episode_title_values[i].as_str();
                let topic_str = topic_values[i].as_str();
                let coarse_str = subject_coarse_values[i].as_str();
                let fine_str = subject_fine_values[i].as_str();
                let summary_str = summary_values[i].as_str();
                let text_str = text_values[i].as_str();
                let start_hms_str = start_hms_values[i].as_str();
                let end_hms_str = end_hms_values[i].as_str();
                
                let item = RagItem {
                    id: id_values[i],
                    episode_number: episode_num_values[i],
                    episode_title: if !episode_title_str.is_empty() { 
                        Some(episode_title_str.to_string()) 
                    } else { 
                        None 
                    },
                    topic: if !topic_str.is_empty() { 
                        Some(topic_str.to_string()) 
                    } else { 
                        None 
                    },
                    subject: if !coarse_str.is_empty() || !fine_str.is_empty() {
                        Some(RagSubject {
                            coarse: if !coarse_str.is_empty() { 
                                Some(coarse_str.to_string()) 
                            } else { 
                                None 
                            },
                            fine: if !fine_str.is_empty() { 
                                Some(fine_str.to_string()) 
                            } else { 
                                None 
                            },
                        })
                    } else {
                        None
                    },
                    start_sec: start_secs[i],
                    end_sec: end_secs[i],
                    start_hms: if !start_hms_str.is_empty() { 
                        Some(start_hms_str.to_string()) 
                    } else { 
                        None 
                    },
                    end_hms: if !end_hms_str.is_empty() { 
                        Some(end_hms_str.to_string()) 
                    } else { 
                        None 
                    },
                    summary: if !summary_str.is_empty() { 
                        Some(summary_str.to_string()) 
                    } else { 
                        None 
                    },
                    text: if !text_str.is_empty() { 
                        Some(text_str.to_string()) 
                    } else { 
                        None 
                    },
                    embedding: None, // Don't return embeddings in search results
                };
                
                // Convert distance to similarity score (cosine similarity = 1 - distance)
                let score = 1.0 - scores[i];
                
                hits.push(Hit { item, score });
            }
        }
        
        Ok(hits)
    }
    
    pub fn metadata(&self) -> &RagMetadata {
        &self.metadata
    }
}
