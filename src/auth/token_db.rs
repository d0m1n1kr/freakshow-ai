// Token-System Datenbank-Modul
use anyhow::{Context, Result, anyhow};
use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthToken {
    pub id: i64,
    pub token: String,
    pub email: String,
    pub activation_code: String,
    pub is_activated: bool,
    pub request_limit: i64,
    pub request_count: i64,
    pub created_at: DateTime<Utc>,
    pub activated_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TokenStats {
    pub id: i64,
    pub token: String,
    pub email: String,
    pub is_activated: bool,
    pub request_count: i64,
    pub request_limit: i64,
    pub created_at: DateTime<Utc>,
    pub activated_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub usage_percent: f64,
    pub remaining: i64,
}

pub struct TokenDatabase {
    conn: Arc<Mutex<Connection>>,
}

impl TokenDatabase {
    /// Create or open the token database
    pub async fn new<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        // SQLite performance optimizations
        // Try to enable WAL mode (may fail if DB is locked, that's ok)
        if let Err(e) = conn.execute("PRAGMA journal_mode = WAL", []) {
            tracing::warn!("Failed to enable WAL mode (may be locked): {}", e);
        }
        if let Err(e) = conn.execute("PRAGMA synchronous = NORMAL", []) {
            tracing::warn!("Failed to set synchronous mode: {}", e);
        }
        if let Err(e) = conn.execute("PRAGMA busy_timeout = 5000", []) {
            tracing::warn!("Failed to set busy timeout: {}", e);
        }
        conn.execute("PRAGMA foreign_keys = ON", [])?;
        
        // Initialize schema
        let schema = include_str!("../../sql/auth_tokens_schema.sql");
        conn.execute_batch(schema)?;
        
        // Migrate old timestamps from SQLite format to RFC3339
        Self::migrate_timestamps(&conn)?;
        
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }
    
    /// Migrate timestamps from SQLite format (YYYY-MM-DD HH:MM:SS) to RFC3339
    fn migrate_timestamps(conn: &Connection) -> Result<()> {
        // Check if migration is needed by looking for timestamps without 'T'
        let needs_migration: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM auth_tokens WHERE created_at NOT LIKE '%T%'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);
        
        if !needs_migration {
            return Ok(());
        }
        
        tracing::info!("Migrating old timestamp formats to RFC3339...");
        
        // Migrate created_at
        conn.execute(
            "UPDATE auth_tokens SET created_at = REPLACE(created_at, ' ', 'T') || '+00:00'
             WHERE created_at NOT LIKE '%T%'",
            [],
        )?;
        
        // Migrate activated_at
        conn.execute(
            "UPDATE auth_tokens SET activated_at = REPLACE(activated_at, ' ', 'T') || '+00:00'
             WHERE activated_at IS NOT NULL AND activated_at NOT LIKE '%T%'",
            [],
        )?;
        
        // Migrate last_used_at
        conn.execute(
            "UPDATE auth_tokens SET last_used_at = REPLACE(last_used_at, ' ', 'T') || '+00:00'
             WHERE last_used_at IS NOT NULL AND last_used_at NOT LIKE '%T%'",
            [],
        )?;
        
        // Migrate expires_at
        conn.execute(
            "UPDATE auth_tokens SET expires_at = REPLACE(expires_at, ' ', 'T') || '+00:00'
             WHERE expires_at IS NOT NULL AND expires_at NOT LIKE '%T%'",
            [],
        )?;
        
        tracing::info!("Timestamp migration complete");
        Ok(())
    }
    
    /// Generate a cryptographically secure token
    fn generate_token() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        format!("tk_{}", hex::encode(bytes))
    }
    
    /// Generate a cryptographically secure activation code
    fn generate_activation_code() -> String {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
        hex::encode(bytes)
    }
    
    /// Create a new token request
    pub async fn create_token_request(
        &self,
        email: &str,
        request_limit: i64,
        expires_in_days: Option<i64>,
    ) -> Result<(String, String)> {
        let conn = self.conn.lock().await;
        
        // Check if there's already a pending (non-activated) token for this email
        let existing: Option<(String, String)> = conn
            .query_row(
                "SELECT token, activation_code FROM auth_tokens 
                 WHERE email = ?1 AND is_activated = 0 
                 ORDER BY created_at DESC LIMIT 1",
                params![email],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        
        // If pending token exists, return it instead of creating a new one
        if let Some((token, activation_code)) = existing {
            tracing::info!("Reusing existing pending token for email: {}", email);
            return Ok((token, activation_code));
        }
        
        // Create new token
        let token = Self::generate_token();
        let activation_code = Self::generate_activation_code();
        let now = Utc::now();
        let expires_at = expires_in_days.map(|days| now + Duration::days(days));
        
        conn.execute(
            "INSERT INTO auth_tokens (token, email, activation_code, request_limit, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                token,
                email,
                activation_code,
                request_limit,
                now.to_rfc3339(),
                expires_at.map(|dt| dt.to_rfc3339()),
            ],
        )?;
        
        tracing::info!("Created new token request for email: {}", email);
        Ok((token, activation_code))
    }
    
    /// Activate a token using the activation code
    pub async fn activate_token(&self, activation_code: &str) -> Result<AuthToken> {
        let conn = self.conn.lock().await;
        
        // Check if code exists
        let token_info: Option<(i64, String, String, bool)> = conn
            .query_row(
                "SELECT id, token, email, is_activated FROM auth_tokens WHERE activation_code = ?1",
                params![activation_code],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .optional()?;
        
        let (id, token, email, is_activated) = token_info
            .ok_or_else(|| anyhow!("Invalid activation code"))?;
        
        if is_activated {
            // Token already activated - return the token info anyway
            // This allows users to get their token again if they lost it
            tracing::info!("Token already activated for email: {} - returning token info", email);
            return self.get_token_by_value_internal(&conn, &token);
        }
        
        // Activate the token
        let now = Utc::now();
        conn.execute(
            "UPDATE auth_tokens SET is_activated = 1, activated_at = ?1 WHERE id = ?2",
            params![now.to_rfc3339(), id],
        )?;
        
        tracing::info!("Token activated for email: {}", email);
        
        // Return the activated token info
        self.get_token_by_value_internal(&conn, &token)
    }
    
    /// Get token information by token value
    pub async fn get_token(&self, token: &str) -> Result<Option<AuthToken>> {
        let conn = self.conn.lock().await;
        self.get_token_by_value_internal(&conn, token)
            .map(Some)
            .or_else(|_| Ok(None))
    }
    
    fn get_token_by_value_internal(&self, conn: &Connection, token: &str) -> Result<AuthToken> {
        let token_info = conn.query_row(
            "SELECT id, token, email, activation_code, is_activated, request_limit, 
                    request_count, created_at, activated_at, last_used_at, expires_at, notes
             FROM auth_tokens WHERE token = ?1",
            params![token],
            |row| {
                let created_at_str: String = row.get(7)?;
                let created_at = created_at_str.parse().map_err(|e| {
                    rusqlite::Error::FromSqlConversionFailure(
                        7,
                        rusqlite::types::Type::Text,
                        Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, format!("Failed to parse created_at: {}", e)))
                    )
                })?;
                
                Ok(AuthToken {
                    id: row.get(0)?,
                    token: row.get(1)?,
                    email: row.get(2)?,
                    activation_code: row.get(3)?,
                    is_activated: row.get(4)?,
                    request_limit: row.get(5)?,
                    request_count: row.get(6)?,
                    created_at,
                    activated_at: row.get::<_, Option<String>>(8)?.and_then(|s| s.parse().ok()),
                    last_used_at: row.get::<_, Option<String>>(9)?.and_then(|s| s.parse().ok()),
                    expires_at: row.get::<_, Option<String>>(10)?.and_then(|s| s.parse().ok()),
                    notes: row.get(11)?,
                })
            },
        )?;
        
        Ok(token_info)
    }
    
    /// Increment request count and update last_used_at
    pub async fn increment_request_count(&self, token: &str) -> Result<()> {
        let conn = self.conn.lock().await;
        let now = Utc::now();
        
        conn.execute(
            "UPDATE auth_tokens 
             SET request_count = request_count + 1, last_used_at = ?1 
             WHERE token = ?2",
            params![now.to_rfc3339(), token],
        )?;
        
        Ok(())
    }
    
    /// Log a request (detailed logging)
    pub async fn log_request(
        &self,
        token: &str,
        endpoint: &str,
        podcast_id: Option<&str>,
        query_length: Option<usize>,
        ip_hash: &str,
        user_agent: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().await;
        
        // Get token ID
        let token_id: i64 = conn.query_row(
            "SELECT id FROM auth_tokens WHERE token = ?1",
            params![token],
            |row| row.get(0),
        )?;
        
        conn.execute(
            "INSERT INTO token_usage_log (token_id, endpoint, podcast_id, query_length, ip_hash, user_agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                token_id,
                endpoint,
                podcast_id,
                query_length.map(|l| l as i64),
                ip_hash,
                user_agent,
            ],
        )?;
        
        Ok(())
    }
    
    /// Get all tokens (for admin)
    pub async fn list_tokens(&self) -> Result<Vec<TokenStats>> {
        let conn = self.conn.lock().await;
        
        // Query directly from auth_tokens table instead of view to avoid issues
        let mut stmt = conn.prepare(
            "SELECT id, token, email, is_activated, request_count, request_limit,
                    created_at, activated_at, last_used_at
             FROM auth_tokens
             ORDER BY created_at DESC"
        )?;
        
        let tokens = stmt.query_map([], |row| {
            let created_at_str: String = row.get(6)?;
            let created_at = created_at_str.parse().map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    6,
                    rusqlite::types::Type::Text,
                    Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, format!("Failed to parse created_at: {}", e)))
                )
            })?;
            
            let request_count: i64 = row.get(4)?;
            let request_limit: i64 = row.get(5)?;
            let usage_percent = if request_limit > 0 {
                (request_count as f64 * 100.0 / request_limit as f64)
            } else {
                0.0
            };
            let remaining = request_limit - request_count;
            
            Ok(TokenStats {
                id: row.get(0)?,
                token: row.get(1)?,
                email: row.get(2)?,
                is_activated: row.get(3)?,
                request_count,
                request_limit,
                created_at,
                activated_at: row.get::<_, Option<String>>(7)?.and_then(|s| s.parse().ok()),
                last_used_at: row.get::<_, Option<String>>(8)?.and_then(|s| s.parse().ok()),
                usage_percent,
                remaining,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
        
        Ok(tokens)
    }
    
    /// Increase token request limit (admin function)
    pub async fn increase_limit(&self, token: &str, amount: i64) -> Result<i64> {
        let conn = self.conn.lock().await;
        
        conn.execute(
            "UPDATE auth_tokens SET request_limit = request_limit + ?1 WHERE token = ?2",
            params![amount, token],
        )?;
        
        // Return new limit
        let new_limit: i64 = conn.query_row(
            "SELECT request_limit FROM auth_tokens WHERE token = ?1",
            params![token],
            |row| row.get(0),
        )?;
        
        Ok(new_limit)
    }
    
    /// Delete a token (admin function)
    pub async fn delete_token(&self, token: &str) -> Result<()> {
        let conn = self.conn.lock().await;
        
        conn.execute("DELETE FROM auth_tokens WHERE token = ?1", params![token])?;
        
        Ok(())
    }
    
    /// Get statistics
    pub async fn get_statistics(&self) -> Result<TokenStatistics> {
        let conn = self.conn.lock().await;
        
        let total: i64 = conn.query_row(
            "SELECT COUNT(*) FROM auth_tokens",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let active: i64 = conn.query_row(
            "SELECT COUNT(*) FROM auth_tokens WHERE is_activated = 1",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        let total_requests: i64 = conn.query_row(
            "SELECT COALESCE(SUM(request_count), 0) FROM auth_tokens",
            [],
            |row| row.get(0),
        ).unwrap_or(0);
        
        // Calculate average usage directly without using the view
        let avg_usage: f64 = if active > 0 {
            conn.query_row(
                "SELECT AVG(CAST(request_count AS REAL) * 100.0 / request_limit) 
                 FROM auth_tokens 
                 WHERE is_activated = 1 AND request_limit > 0",
                [],
                |row| row.get(0),
            ).unwrap_or(0.0)
        } else {
            0.0
        };
        
        Ok(TokenStatistics {
            total,
            active,
            total_requests,
            avg_usage,
        })
    }
    
    /// Clean up expired tokens (maintenance)
    pub async fn cleanup_expired(&self) -> Result<usize> {
        let conn = self.conn.lock().await;
        let now = Utc::now();
        
        let deleted = conn.execute(
            "DELETE FROM auth_tokens WHERE expires_at IS NOT NULL AND expires_at < ?1",
            params![now.to_rfc3339()],
        )?;
        
        Ok(deleted)
    }
}

#[derive(Debug, Serialize)]
pub struct TokenStatistics {
    pub total: i64,
    pub active: i64,
    pub total_requests: i64,
    pub avg_usage: f64,
}
