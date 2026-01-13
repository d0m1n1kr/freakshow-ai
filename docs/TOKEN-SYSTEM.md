# Token-basiertes Request-Limit-System für Chat-API

## Konzept

Ein Self-Service-Token-System mit E-Mail-Verifizierung, um LLM-API-Missbrauch zu verhindern, aber legitimen Nutzern Fair-Use zu ermöglichen.

## Features

### User-Flow

1. **Token anfordern** 
   - User gibt E-Mail-Adresse ein
   - System generiert Token und sendet Aktivierungslink per E-Mail
   
2. **Token aktivieren**
   - User klickt auf Link in E-Mail
   - Token wird aktiviert und im LocalStorage gespeichert
   - User kann sofort mit 100 Requests starten

3. **Token nutzen**
   - Bei jedem Chat-Request wird Token mitgeschickt
   - Backend zählt Requests und prüft Limit
   - Wenn Limit erreicht: Freundliche Fehlermeldung mit Info

### Admin-Flow

1. **Token-Übersicht**
   - Admin-Seite (geschützt mit `statsAuthToken`)
   - Liste aller Tokens mit E-Mail, Nutzung, Limit
   - Filterfunktionen (aktiv, abgelaufen, etc.)

2. **Limit erhöhen**
   - Admin kann Limit um +100 erhöhen
   - Optional: Bulk-Actions

3. **Token-Management**
   - Token deaktivieren/löschen
   - Statistiken (Total Requests, aktive User, etc.)

### Besondere Regeln

- **Config-Token** (`authToken` in `settings.json`): **Unbegrenzt**
- **User-Tokens**: Standard 100 Requests, Admin kann erhöhen
- **Token-Ablauf**: Optional nach X Tagen (konfigurierbar)

---

## Architektur

### 1. Datenbank-Schema (SQLite)

```sql
-- Neue Datenbank: auth_tokens.db

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

-- Index für schnelle Token-Lookups
CREATE INDEX IF NOT EXISTS idx_token ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_activation_code ON auth_tokens(activation_code);
CREATE INDEX IF NOT EXISTS idx_email ON auth_tokens(email);
CREATE INDEX IF NOT EXISTS idx_is_activated ON auth_tokens(is_activated);

-- Request-Log (optional, für detaillierte Statistiken)
CREATE TABLE IF NOT EXISTS token_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    podcast_id TEXT,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ip_hash TEXT,
    FOREIGN KEY (token_id) REFERENCES auth_tokens(id)
);

CREATE INDEX IF NOT EXISTS idx_token_usage_token_id ON token_usage_log(token_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage_log(timestamp);
```

### 2. Backend API-Endpoints

```rust
// Neue Datei: src/handlers/auth_tokens.rs

// POST /api/auth/request-token
// Body: { "email": "user@example.com" }
// Response: { "success": true, "message": "Check your email" }
pub async fn request_token(...) -> impl IntoResponse;

// GET /api/auth/activate/{activation_code}
// Response: { "token": "abc123...", "limit": 100, "email": "user@example.com" }
pub async fn activate_token(...) -> impl IntoResponse;

// GET /api/auth/token-info
// Headers: x-auth-token
// Response: { "email": "...", "request_count": 42, "request_limit": 100, "remaining": 58 }
pub async fn token_info(...) -> impl IntoResponse;

// Admin-Endpoints (geschützt mit statsAuthToken):

// GET /api/admin/tokens
// Response: { "tokens": [...] }
pub async fn list_tokens(...) -> impl IntoResponse;

// POST /api/admin/tokens/{token}/increase-limit
// Body: { "amount": 100 }
// Response: { "new_limit": 200 }
pub async fn increase_token_limit(...) -> impl IntoResponse;

// DELETE /api/admin/tokens/{token}
// Response: { "success": true }
pub async fn delete_token(...) -> impl IntoResponse;
```

### 3. Token-Validation-Middleware

```rust
// src/middleware/auth_token.rs

pub async fn validate_chat_token(
    cfg: &AppConfig,
    headers: &HeaderMap,
    token_db: &TokenDatabase,
) -> Result<TokenValidationResult, AuthError> {
    // 1. Check if token is from headers
    let token = extract_auth_token(headers)?;
    
    // 2. Check if it's the config token (unbegrenzt)
    if cfg.auth_token.as_ref().map(|t| t == &token).unwrap_or(false) {
        return Ok(TokenValidationResult::ConfigToken);
    }
    
    // 3. Check if it's a user token (mit Limit)
    let token_info = token_db.get_token_info(&token).await?;
    
    // 4. Check if activated
    if !token_info.is_activated {
        return Err(AuthError::TokenNotActivated);
    }
    
    // 5. Check if expired
    if let Some(expires_at) = token_info.expires_at {
        if Utc::now() > expires_at {
            return Err(AuthError::TokenExpired);
        }
    }
    
    // 6. Check if limit reached
    if token_info.request_count >= token_info.request_limit {
        return Err(AuthError::LimitReached {
            limit: token_info.request_limit,
            used: token_info.request_count,
        });
    }
    
    // 7. Increment request count
    token_db.increment_request_count(&token).await?;
    
    Ok(TokenValidationResult::UserToken(token_info))
}

pub enum AuthError {
    NoToken,
    InvalidToken,
    TokenNotActivated,
    TokenExpired,
    LimitReached { limit: i64, used: i64 },
}
```

### 4. E-Mail-Service

```toml
# Cargo.toml Dependencies
[dependencies]
lettre = "0.11"
lettre_email = "0.9"
```

```rust
// src/email/mod.rs

pub struct EmailService {
    smtp_host: String,
    smtp_port: u16,
    smtp_username: String,
    smtp_password: String,
    from_email: String,
    base_url: String, // For activation links
}

impl EmailService {
    pub async fn send_activation_email(
        &self,
        to_email: &str,
        activation_code: &str,
    ) -> Result<()> {
        let activation_link = format!(
            "{}/activate?code={}",
            self.base_url,
            activation_code
        );
        
        let email_body = format!(
            r#"
            <html>
            <body>
                <h2>Aktiviere dein API-Token</h2>
                <p>Du hast ein Token für die Chat-API angefordert.</p>
                <p>Klicke auf den Link, um dein Token zu aktivieren:</p>
                <p><a href="{link}">{link}</a></p>
                <p>Dein Token hat 100 kostenlose Anfragen.</p>
                <p>Der Link ist 24 Stunden gültig.</p>
            </body>
            </html>
            "#,
            link = activation_link
        );
        
        // Send email via SMTP
        // ... implementation ...
        
        Ok(())
    }
}
```

### 5. Config-Erweiterung

```json
// settings.json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001",
    "authToken": "admin-token-unbegrenzt",  // ← Unbegrenzt
    "statsAuthToken": "admin-stats-token"
  },
  "email": {
    "smtpHost": "smtp.example.com",
    "smtpPort": 587,
    "smtpUsername": "noreply@example.com",
    "smtpPassword": "secret",
    "fromEmail": "PodInsights <noreply@example.com>",
    "baseUrl": "https://pod-insights.freshx.de"
  },
  "tokenSystem": {
    "defaultLimit": 100,
    "tokenExpireDays": 365,  // Optional: Token läuft nach X Tagen ab
    "activationLinkExpireHours": 24
  }
}
```

---

## Frontend-Implementierung

### 1. Token-Anfrage-Komponente

```vue
<!-- frontend/src/components/TokenRequest.vue -->
<template>
  <div class="max-w-md mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
    <h2 class="text-2xl font-bold mb-4">API-Token anfordern</h2>
    
    <div v-if="!submitted">
      <p class="text-gray-600 dark:text-gray-400 mb-4">
        Fordere ein kostenloses API-Token an, um den Chat-Bot zu nutzen.
        Du erhältst 100 kostenlose Anfragen.
      </p>
      
      <form @submit.prevent="requestToken">
        <input
          v-model="email"
          type="email"
          required
          placeholder="deine@email.de"
          class="w-full px-4 py-2 border rounded-lg mb-4"
        />
        
        <button
          type="submit"
          :disabled="loading"
          class="w-full bg-blue-600 text-white py-2 rounded-lg"
        >
          {{ loading ? 'Sende...' : 'Token anfordern' }}
        </button>
      </form>
    </div>
    
    <div v-else class="text-center">
      <div class="text-5xl mb-4">✉️</div>
      <h3 class="text-xl font-bold mb-2">Check deine E-Mail!</h3>
      <p class="text-gray-600 dark:text-gray-400">
        Wir haben dir einen Aktivierungslink an {{ email }} gesendet.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const email = ref('');
const loading = ref(false);
const submitted = ref(false);

const requestToken = async () => {
  loading.value = true;
  try {
    const response = await fetch('/api/auth/request-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value }),
    });
    
    if (response.ok) {
      submitted.value = true;
    } else {
      alert('Fehler beim Anfordern des Tokens');
    }
  } finally {
    loading.value = false;
  }
};
</script>
```

### 2. Token-Aktivierungs-Seite

```vue
<!-- frontend/src/views/ActivateTokenView.vue -->
<template>
  <div class="max-w-2xl mx-auto p-6">
    <div v-if="loading" class="text-center">
      <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
      <p>Aktiviere Token...</p>
    </div>
    
    <div v-else-if="error" class="bg-red-50 border border-red-200 rounded-lg p-6">
      <h2 class="text-xl font-bold text-red-800 mb-2">❌ Aktivierung fehlgeschlagen</h2>
      <p class="text-red-600">{{ error }}</p>
    </div>
    
    <div v-else-if="tokenInfo" class="bg-green-50 border border-green-200 rounded-lg p-6">
      <h2 class="text-2xl font-bold text-green-800 mb-4">✅ Token aktiviert!</h2>
      
      <div class="bg-white rounded-lg p-4 mb-4">
        <p class="text-sm text-gray-600 mb-2">Dein Token:</p>
        <code class="block bg-gray-100 p-2 rounded font-mono text-sm break-all">
          {{ tokenInfo.token }}
        </code>
      </div>
      
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div class="bg-white rounded-lg p-3">
          <p class="text-sm text-gray-600">E-Mail</p>
          <p class="font-semibold">{{ tokenInfo.email }}</p>
        </div>
        <div class="bg-white rounded-lg p-3">
          <p class="text-sm text-gray-600">Limit</p>
          <p class="font-semibold">{{ tokenInfo.limit }} Anfragen</p>
        </div>
      </div>
      
      <p class="text-sm text-gray-600 mb-4">
        Das Token wurde automatisch gespeichert. Du kannst jetzt den Chat nutzen!
      </p>
      
      <router-link to="/search" class="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg">
        Zum Chat
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { useSettingsStore } from '@/stores/settings';

const route = useRoute();
const settings = useSettingsStore();

const loading = ref(true);
const error = ref<string | null>(null);
const tokenInfo = ref<any>(null);

onMounted(async () => {
  const code = route.query.code as string;
  
  if (!code) {
    error.value = 'Kein Aktivierungscode gefunden';
    loading.value = false;
    return;
  }
  
  try {
    const response = await fetch(`/api/auth/activate/${code}`);
    
    if (!response.ok) {
      const data = await response.json();
      error.value = data.error || 'Aktivierung fehlgeschlagen';
      return;
    }
    
    tokenInfo.value = await response.json();
    
    // Speichere Token im LocalStorage
    settings.setRagAuthToken(tokenInfo.value.token);
    
  } catch (e) {
    error.value = 'Netzwerkfehler';
  } finally {
    loading.value = false;
  }
});
</script>
```

### 3. Token-Info-Anzeige im Chat

```vue
<!-- In SearchView.vue -->
<div v-if="tokenInfo" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-sm text-gray-600">Token-Status</p>
      <p class="font-semibold">{{ tokenInfo.request_count }} / {{ tokenInfo.request_limit }} Anfragen genutzt</p>
    </div>
    <div class="text-right">
      <p class="text-2xl font-bold text-blue-600">
        {{ tokenInfo.request_limit - tokenInfo.request_count }}
      </p>
      <p class="text-xs text-gray-600">verbleibend</p>
    </div>
  </div>
  
  <div class="mt-2 bg-gray-200 rounded-full h-2">
    <div 
      class="bg-blue-600 h-2 rounded-full transition-all"
      :style="{ width: `${(tokenInfo.request_count / tokenInfo.request_limit) * 100}%` }"
    ></div>
  </div>
</div>
```

### 4. Admin-Dashboard

```vue
<!-- frontend/src/views/AdminTokensView.vue -->
<template>
  <div class="container mx-auto p-6">
    <h1 class="text-3xl font-bold mb-6">Token-Management</h1>
    
    <!-- Statistiken -->
    <div class="grid grid-cols-4 gap-4 mb-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4">
        <p class="text-sm text-gray-600">Total Tokens</p>
        <p class="text-2xl font-bold">{{ stats.total }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4">
        <p class="text-sm text-gray-600">Aktiv</p>
        <p class="text-2xl font-bold text-green-600">{{ stats.active }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4">
        <p class="text-sm text-gray-600">Total Requests</p>
        <p class="text-2xl font-bold">{{ stats.totalRequests }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4">
        <p class="text-sm text-gray-600">Avg. Nutzung</p>
        <p class="text-2xl font-bold">{{ stats.avgUsage }}%</p>
      </div>
    </div>
    
    <!-- Token-Liste -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th class="px-4 py-3 text-left">E-Mail</th>
            <th class="px-4 py-3 text-left">Erstellt</th>
            <th class="px-4 py-3 text-left">Nutzung</th>
            <th class="px-4 py-3 text-left">Status</th>
            <th class="px-4 py-3 text-left">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="token in tokens" :key="token.id" class="border-t">
            <td class="px-4 py-3">{{ token.email }}</td>
            <td class="px-4 py-3">{{ formatDate(token.created_at) }}</td>
            <td class="px-4 py-3">
              <div class="flex items-center gap-2">
                <span>{{ token.request_count }} / {{ token.request_limit }}</span>
                <div class="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                  <div 
                    class="bg-blue-600 h-2 rounded-full"
                    :style="{ width: `${(token.request_count / token.request_limit) * 100}%` }"
                  ></div>
                </div>
              </div>
            </td>
            <td class="px-4 py-3">
              <span v-if="!token.is_activated" class="text-yellow-600">⏳ Pending</span>
              <span v-else-if="token.request_count >= token.request_limit" class="text-red-600">🚫 Limit</span>
              <span v-else class="text-green-600">✅ Aktiv</span>
            </td>
            <td class="px-4 py-3">
              <button 
                @click="increaseLimit(token.token)"
                class="bg-blue-600 text-white px-3 py-1 rounded text-sm mr-2"
              >
                +100
              </button>
              <button 
                @click="deleteToken(token.token)"
                class="bg-red-600 text-white px-3 py-1 rounded text-sm"
              >
                Löschen
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
```

---

## Sicherheits-Überlegungen

### 1. Rate-Limiting auf Token-Anfragen

```nginx
# Sehr streng für Token-Anfragen (Spam-Schutz)
location /api/auth/request-token {
    limit_req zone=api_moderate burst=1 nodelay;  # Max 1 Request/Minute
    limit_req_status 429;
    
    proxy_pass http://127.0.0.1:3001;
}
```

### 2. E-Mail-Validierung

```rust
// Basic E-Mail-Validierung
fn is_valid_email(email: &str) -> bool {
    email.contains('@') && email.contains('.') && email.len() >= 5
}

// Optional: Disposable E-Mail-Domains blockieren
const DISPOSABLE_DOMAINS: &[&str] = &[
    "tempmail.com",
    "10minutemail.com",
    // ...
];
```

### 3. Aktivierungscode-Format

```rust
// Kryptografisch sicherer Code
use rand::Rng;

fn generate_activation_code() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}
```

### 4. Token-Format

```rust
fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    format!("token_{}", hex::encode(bytes))
}
```

---

## Deployment-Überlegungen

### SMTP-Service

Optionen:
1. **SendGrid** (12.000 E-Mails/Monat gratis)
2. **Mailgun** (5.000 E-Mails/Monat gratis)
3. **AWS SES** (62.000 E-Mails/Monat gratis)
4. **Eigener SMTP** (z.B. Postfix)

### Empfehlung: SendGrid

```json
{
  "email": {
    "smtpHost": "smtp.sendgrid.net",
    "smtpPort": 587,
    "smtpUsername": "apikey",
    "smtpPassword": "SG.xxx...",
    "fromEmail": "noreply@pod-insights.freshx.de"
  }
}
```

---

## Implementierungs-Reihenfolge

1. **Phase 1: Backend-Grundlagen** (2-3 Stunden)
   - Datenbank-Schema
   - Token-Generation & -Validierung
   - Grundlegende API-Endpoints

2. **Phase 2: E-Mail-Integration** (1-2 Stunden)
   - SMTP-Service einrichten
   - E-Mail-Templates

3. **Phase 3: Chat-Integration** (1 Stunde)
   - Token-Middleware in `/api/chat` integrieren
   - Request-Counting

4. **Phase 4: Frontend - User** (2-3 Stunden)
   - Token-Anfrage-Formular
   - Aktivierungs-Seite
   - Token-Info-Anzeige im Chat

5. **Phase 5: Frontend - Admin** (2-3 Stunden)
   - Admin-Dashboard
   - Token-Management

6. **Phase 6: Testing & Docs** (1-2 Stunden)
   - End-to-End-Tests
   - Dokumentation

**Total**: ~10-15 Stunden

---

## Nächste Schritte

Soll ich mit der Implementierung starten? Empfohlene Reihenfolge:

1. ✅ Datenbank-Schema erstellen
2. ✅ Backend API-Endpoints implementieren
3. ✅ E-Mail-Service integrieren
4. ✅ Frontend-Komponenten erstellen

Oder möchtest du zunächst Änderungen am Konzept vornehmen?
