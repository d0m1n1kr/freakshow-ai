use anyhow::{anyhow, Context, Result};
use arrow_array::Array;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use lancedb::Table;
use lancedb::query::ExecutableQuery;

#[derive(Clone)]
pub struct TopicEmbeddingsLance {
    table: Arc<Table>,
    metadata: TopicMetadata,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicMetadata {
    pub embedding_model: String,
    pub embedding_dimensions: usize,
    pub total_topics: usize,
    pub unique_topics: usize,
}

#[derive(Debug, Clone)]
pub struct TopicRecord {
    pub id: usize,
    pub topic: String,
    pub keywords: Vec<String>,
    pub count: usize,
    pub episodes: Vec<u32>,
    pub embedding: Vec<f32>,
}

impl TopicEmbeddingsLance {
    pub async fn open(podcast_id: &str) -> Result<Self> {
        let lance_dir = PathBuf::from(format!("db/{}/lance", podcast_id));
        let meta_path = lance_dir.join("metadata.json");
        
        if !lance_dir.exists() {
            return Err(anyhow!(
                "LanceDB not found for {}. Run: node scripts/create-embeddings.js --podcast {}",
                podcast_id, podcast_id
            ));
        }
        
        // Convert path to absolute path for LanceDB connection
        let abs_path = lance_dir.canonicalize()
            .with_context(|| format!("Failed to resolve path: {:?}", lance_dir))?;
        let db = lancedb::connect(abs_path.to_str().unwrap()).execute().await?;
        let table = db.open_table("topics").execute().await?;
        
        // Load metadata
        let metadata: serde_json::Value = if meta_path.exists() {
            let json = tokio::fs::read_to_string(&meta_path).await?;
            serde_json::from_str(&json)?
        } else {
            serde_json::json!({})
        };
        
        let topics_meta = metadata.get("topics").cloned().unwrap_or_else(|| serde_json::json!({}));
        let metadata = TopicMetadata {
            embedding_model: topics_meta.get("embeddingModel")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            embedding_dimensions: topics_meta.get("embeddingDimensions")
                .and_then(|v| v.as_u64())
                .unwrap_or(1536) as usize,
            total_topics: topics_meta.get("totalTopics")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize,
            unique_topics: topics_meta.get("uniqueTopics")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as usize,
        };
        
        Ok(Self {
            table: Arc::new(table),
            metadata,
        })
    }
    
    pub async fn get_all(&self) -> Result<Vec<TopicRecord>> {
        use arrow_array::{
            FixedSizeListArray, Float32Array, Float64Array, Int32Array, Int64Array, LargeStringArray,
            StringArray, UInt32Array, UInt64Array,
        };
        use futures::TryStreamExt;
        
        let mut stream = self.table.query()
            .execute()
            .await?;
        
        let mut records = Vec::new();
        while let Some(batch) = stream.try_next().await? {
            let num_rows = batch.num_rows();
            
            let get_string_vec = |col_name: &str| -> Result<Vec<String>> {
                let col = batch
                    .column_by_name(col_name)
                    .with_context(|| format!("Missing {} column", col_name))?;
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
                        "Failed to cast {} column (type {:?})",
                        col_name,
                        col.data_type()
                    ))
                }
            };

            let get_u32_vec = |col_name: &str| -> Result<Vec<u32>> {
                let col = batch
                    .column_by_name(col_name)
                    .with_context(|| format!("Missing {} column", col_name))?;

                if let Some(arr) = col.as_any().downcast_ref::<UInt32Array>() {
                    Ok(arr.values().to_vec())
                } else if let Some(arr) = col.as_any().downcast_ref::<Int32Array>() {
                    Ok(arr.values().iter().map(|&v| v as u32).collect())
                } else if let Some(arr) = col.as_any().downcast_ref::<UInt64Array>() {
                    Ok(arr.values().iter().map(|&v| v as u32).collect())
                } else if let Some(arr) = col.as_any().downcast_ref::<Int64Array>() {
                    Ok(arr.values().iter().map(|&v| v as u32).collect())
                } else if let Some(arr) = col.as_any().downcast_ref::<Float64Array>() {
                    Ok(arr.values().iter().map(|&v| v.round().max(0.0) as u32).collect())
                } else if let Some(arr) = col.as_any().downcast_ref::<Float32Array>() {
                    Ok(arr
                        .values()
                        .iter()
                        .map(|&v| (v as f64).round().max(0.0) as u32)
                        .collect())
                } else {
                    Err(anyhow!(
                        "Failed to cast {} column (type {:?})",
                        col_name,
                        col.data_type()
                    ))
                }
            };

            // Prefer explicit id if present, otherwise fall back to Lance's internal _rowid.
            let id_values: Vec<u32> = if batch.column_by_name("id").is_some() {
                get_u32_vec("id")?
            } else {
                get_u32_vec("_rowid")?
            };

            let topic_values = get_string_vec("topic")?;
            let keywords_json_values = get_string_vec("keywords")?;
            let count_values = get_u32_vec("count")?;
            let episodes_json_values = get_string_vec("episodes")?;

            let vectors = batch.column_by_name("vector")
                .context("Missing vector column")?
                .as_any()
                .downcast_ref::<FixedSizeListArray>()
                .context("Failed to cast vector column")?;
            
            for i in 0..num_rows {
                // Parse keywords JSON
                let keywords: Vec<String> = {
                    let s = keywords_json_values[i].as_str();
                    if s.is_empty() { Vec::new() } else { serde_json::from_str(s).unwrap_or_default() }
                };
                
                // Parse episodes JSON
                let episodes: Vec<u32> = {
                    let s = episodes_json_values[i].as_str();
                    if s.is_empty() { Vec::new() } else { serde_json::from_str(s).unwrap_or_default() }
                };
                
                // Extract vector
                let vector_values = vectors.value(i);
                let embedding: Vec<f32> = if let Some(arr) = vector_values.as_any().downcast_ref::<Float32Array>() {
                    arr.values().to_vec()
                } else if let Some(arr) = vector_values.as_any().downcast_ref::<Float64Array>() {
                    arr.values().iter().map(|&v| v as f32).collect()
                } else {
                    return Err(anyhow!(
                        "Failed to cast vector values (type {:?})",
                        vector_values.data_type()
                    ));
                };
                
                records.push(TopicRecord {
                    id: id_values[i] as usize,
                    topic: topic_values[i].to_string(),
                    keywords,
                    count: count_values[i] as usize,
                    episodes,
                    embedding,
                });
            }
        }
        
        Ok(records)
    }
    
    pub fn metadata(&self) -> &TopicMetadata {
        &self.metadata
    }
}
