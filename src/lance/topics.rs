use anyhow::{anyhow, Context, Result};
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
        use arrow_array::{Int32Array, StringArray, FixedSizeListArray, Float32Array};
        use futures::TryStreamExt;
        
        let mut stream = self.table.query()
            .execute()
            .await?;
        
        let mut records = Vec::new();
        while let Some(batch) = stream.try_next().await? {
            let num_rows = batch.num_rows();
            
            // Get columns
            let ids = batch.column_by_name("id")
                .context("Missing id column")?
                .as_any()
                .downcast_ref::<Int32Array>()
                .context("Failed to cast id column")?;
            
            let topics = batch.column_by_name("topic")
                .context("Missing topic column")?
                .as_any()
                .downcast_ref::<StringArray>()
                .context("Failed to cast topic column")?;
            
            let keywords_json = batch.column_by_name("keywords")
                .context("Missing keywords column")?
                .as_any()
                .downcast_ref::<StringArray>()
                .context("Failed to cast keywords column")?;
            
            let counts = batch.column_by_name("count")
                .context("Missing count column")?
                .as_any()
                .downcast_ref::<Int32Array>()
                .context("Failed to cast count column")?;
            
            let episodes_json = batch.column_by_name("episodes")
                .context("Missing episodes column")?
                .as_any()
                .downcast_ref::<StringArray>()
                .context("Failed to cast episodes column")?;
            
            let vectors = batch.column_by_name("vector")
                .context("Missing vector column")?
                .as_any()
                .downcast_ref::<FixedSizeListArray>()
                .context("Failed to cast vector column")?;
            
            for i in 0..num_rows {
                // Parse keywords JSON
                let keywords: Vec<String> = serde_json::from_str(keywords_json.value(i))
                    .unwrap_or_default();
                
                // Parse episodes JSON
                let episodes: Vec<u32> = serde_json::from_str(episodes_json.value(i))
                    .unwrap_or_default();
                
                // Extract vector
                let vector_values = vectors.value(i);
                let vector_floats = vector_values
                    .as_any()
                    .downcast_ref::<Float32Array>()
                    .context("Failed to cast vector values")?;
                let embedding = vector_floats.values().to_vec();
                
                records.push(TopicRecord {
                    id: ids.value(i) as usize,
                    topic: topics.value(i).to_string(),
                    keywords,
                    count: counts.value(i) as usize,
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
