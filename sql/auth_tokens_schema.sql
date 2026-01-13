-- Token-System Datenbank Schema
-- Datei: auth_tokens.db

-- Tabelle für Auth-Tokens
CREATE TABLE IF NOT EXISTS auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    activation_code TEXT UNIQUE NOT NULL,
    is_activated BOOLEAN NOT NULL DEFAULT 0,
    request_limit INTEGER NOT NULL DEFAULT 100,
    request_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    notes TEXT
);

-- Indizes für schnelle Lookups
CREATE INDEX IF NOT EXISTS idx_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_activation_code ON auth_tokens(activation_code);
CREATE INDEX IF NOT EXISTS idx_email ON auth_tokens(email);
CREATE INDEX IF NOT EXISTS idx_is_activated ON auth_tokens(is_activated);
CREATE INDEX IF NOT EXISTS idx_expires_at ON auth_tokens(expires_at);

-- Tabelle für detailliertes Request-Logging (optional)
CREATE TABLE IF NOT EXISTS token_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    podcast_id TEXT,
    query_length INTEGER,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_hash TEXT,
    user_agent TEXT,
    FOREIGN KEY (token_id) REFERENCES auth_tokens(id) ON DELETE CASCADE
);

-- Indizes für Usage-Log
CREATE INDEX IF NOT EXISTS idx_token_usage_token_id ON token_usage_log(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage_log(timestamp);

-- View für Token-Statistiken
CREATE VIEW IF NOT EXISTS token_stats AS
SELECT 
    t.id,
    t.token,
    t.email,
    t.is_activated,
    t.request_count,
    t.request_limit,
    t.created_at,
    t.activated_at,
    t.last_used_at,
    (t.request_count * 100.0 / t.request_limit) as usage_percent,
    (t.request_limit - t.request_count) as remaining,
    COUNT(l.id) as total_logged_requests
FROM auth_tokens t
LEFT JOIN token_usage_log l ON t.id = l.token_id
GROUP BY t.id;
