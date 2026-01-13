# Crawler & Bot Protection für RAG-API

## Problem

Nach Entfernung des Auth-Tokens kann die `/api/chat` Endpoint von jedem ohne Authentifizierung genutzt werden. Das führt zu folgenden Risiken:

1. **Kostspielige LLM-Calls**: Jede Anfrage macht 2 API-Calls (Embedding + Chat)
2. **Crawler könnten Beispiele triggern**: Headless-Browser könnten Buttons klicken
3. **DoS-Anfälligkeit**: Ohne Rate-Limiting können viele Anfragen den Server überlasten
4. **API-Missbrauch**: Direkte API-Aufrufe ohne Frontend möglich

## Mehrschichtige Schutzstrategie

### Ebene 1: robots.txt + Meta-Tags (Basic Crawler Protection)

**Was es schützt**: Verhindert, dass "gutmütige" Crawler (Google, Bing) die Seite überhaupt crawlen.

**Implementation**:

#### 1.1 robots.txt erstellen

```txt
# robots.txt - Verhindert Crawling der gesamten Anwendung
User-agent: *
Disallow: /

# Explizit Chat/RAG verbieten
Disallow: /api/chat
Disallow: /api/episodes/search
Disallow: /search

# Analytics erlauben (falls gewünscht)
Allow: /api/analytics/track

# Optional: Crawl-Delay für erlaubte Bereiche
Crawl-delay: 10
```

**Platzierung**: 
- Im `frontend/public/` Ordner für statische Auslieferung
- ODER in nginx als statische Datei

#### 1.2 Meta-Tags im HTML

Im `frontend/index.html`:

```html
<head>
  <meta charset="UTF-8" />
  <!-- Crawling und Indexierung verhindern -->
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <meta name="googlebot" content="noindex, nofollow">
  <meta name="bingbot" content="noindex, nofollow">
  
  <!-- Verhindert AI-Crawling (OpenAI, Anthropic, etc.) -->
  <meta name="openai-bot" content="noindex, nofollow">
  <meta name="anthropic-ai" content="noindex, nofollow">
  <meta name="claudebot" content="noindex, nofollow">
  <meta name="gptbot" content="noindex, nofollow">
  
  <!-- Rest des <head> ... -->
</head>
```

**Effektivität**: 
- ✅ Stoppt gutmütige Crawler (Google, Bing, ChatGPT, Claude)
- ❌ Schützt NICHT gegen bösartige Bots

---

### Ebene 2: Nginx Rate-Limiting (Effektiver Schutz)

**Was es schützt**: Limitiert Anfragen pro IP-Adresse, verhindert DoS und massenhaften Missbrauch.

**Implementation**:

#### 2.1 Nginx Rate-Limiting Config

```nginx
http {
    # Rate-Limit-Zonen definieren
    
    # Moderate Limits für normale API-Endpoints
    limit_req_zone $binary_remote_addr zone=api_moderate:10m rate=10r/m;
    
    # Strenge Limits für teure LLM-Endpoints
    limit_req_zone $binary_remote_addr zone=llm_strict:10m rate=5r/m;
    
    # Sehr strenge Limits für Bot-Protection
    limit_req_zone $binary_remote_addr zone=llm_ultra:10m rate=2r/m;
    
    server {
        # ... existing config ...
        
        # RAG/Chat Endpoint - SEHR strenge Limits
        location /api/chat {
            # Maximal 2 Requests/Minute pro IP, Burst von 3 erlaubt
            limit_req zone=llm_ultra burst=3 nodelay;
            
            # Bei Rate-Limit 429 zurückgeben
            limit_req_status 429;
            
            proxy_pass http://127.0.0.1:3001;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
        
        # Episode Search - moderate Limits
        location /api/episodes/search {
            limit_req zone=api_moderate burst=5 nodelay;
            limit_req_status 429;
            
            proxy_pass http://127.0.0.1:3001;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
        
        # Analytics - großzügige Limits
        location /api/analytics/ {
            limit_req zone=api_moderate burst=20 nodelay;
            
            proxy_pass http://127.0.0.1:3001;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
        
        # Health-Check ohne Limits
        location /api/health {
            proxy_pass http://127.0.0.1:3001;
        }
    }
}
```

#### 2.2 User-Agent Blocking (zusätzlich)

Bekannte Bot-User-Agents blockieren:

```nginx
http {
    # Map für Bot-Detection
    map $http_user_agent $is_bot {
        default 0;
        ~*bot 1;
        ~*crawler 1;
        ~*spider 1;
        ~*scraper 1;
        ~*headless 1;
        ~*puppeteer 1;
        ~*selenium 1;
        ~*curl 1;
        ~*wget 1;
        ~*python-requests 1;
        ~*axios 1;
    }
    
    server {
        # ... config ...
        
        # Bots auf LLM-Endpoints blockieren
        location /api/chat {
            if ($is_bot) {
                return 403 "Bot access not allowed";
            }
            
            limit_req zone=llm_ultra burst=3 nodelay;
            proxy_pass http://127.0.0.1:3001;
        }
    }
}
```

**Effektivität**:
- ✅✅✅ Sehr effektiv gegen DoS und Massenanfragen
- ✅✅ Schützt vor den meisten Crawlern
- ✅ Schützt deine LLM-Kosten
- ⚠️ Clevere Angreifer könnten User-Agent fälschen

---

### Ebene 3: Backend Rate-Limiting (Tower Middleware)

**Was es schützt**: Application-Level Rate-Limiting, unabhängig von nginx.

**Implementation**:

#### 3.1 Dependencies hinzufügen

In `Cargo.toml`:

```toml
[dependencies]
tower = { version = "0.5", features = ["limit", "timeout"] }
tower-http = { version = "0.6", features = ["limit", "compression"] }
```

#### 3.2 Rate-Limiting im Backend

In `src/rag_backend.rs`:

```rust
use tower::limit::RateLimitLayer;
use tower::ServiceBuilder;
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<()> {
    // ... existing setup ...
    
    let app = Router::new()
        .route("/api/chat", post(chat))
        .layer(
            ServiceBuilder::new()
                // Maximal 5 Requests/Minute pro gesamtem Server
                .layer(RateLimitLayer::new(5, Duration::from_secs(60)))
                // Timeout für lange Requests
                .layer(tower::timeout::TimeoutLayer::new(Duration::from_secs(30)))
        )
        .route("/api/episodes/search", post(episodes_search))
        .route("/api/episodes/latest", post(episodes_latest))
        .route("/api/speakers", axum::routing::get(speakers_list))
        .route("/api/analytics/track", post(track))
        .route("/api/analytics/track-episode-play", post(track_episode_play))
        .route("/api/analytics/stats", axum::routing::get(stats))
        .route("/api/health", axum::routing::get(health))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(app_state);
    
    // ... rest of main ...
}
```

**Hinweis**: Tower's `RateLimitLayer` ist **global** (für alle IPs zusammen). Für per-IP-Limiting brauchst du eine komplexere Lösung (siehe Ebene 4).

**Effektivität**:
- ✅✅ Schützt Server vor Überlastung
- ✅ Unabhängig von nginx
- ⚠️ Limitiert ALLE Nutzer zusammen (nicht per IP)

---

### Ebene 4: Per-IP Rate-Limiting im Backend (Fortgeschritten)

**Was es schützt**: Granulares Rate-Limiting pro IP-Adresse direkt in der Applikation.

**Implementation**:

#### 4.1 Dependency hinzufügen

```toml
[dependencies]
governor = "0.7"
dashmap = "6.0"
```

#### 4.2 Rate-Limiter als Middleware

Neue Datei `src/middleware/rate_limiter.rs`:

```rust
use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use dashmap::DashMap;
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use std::{num::NonZeroU32, sync::Arc};

pub struct IpRateLimiter {
    limiters: DashMap<String, RateLimiter<NotKeyed, InMemoryState, DefaultClock>>,
    quota: Quota,
}

impl IpRateLimiter {
    pub fn new(requests_per_minute: u32) -> Self {
        let quota = Quota::per_minute(NonZeroU32::new(requests_per_minute).unwrap());
        Self {
            limiters: DashMap::new(),
            quota,
        }
    }

    fn get_or_create_limiter(&self, ip: &str) -> RateLimiter<NotKeyed, InMemoryState, DefaultClock> {
        self.limiters
            .entry(ip.to_string())
            .or_insert_with(|| RateLimiter::direct(self.quota))
            .clone()
    }

    pub fn check(&self, ip: &str) -> bool {
        let limiter = self.get_or_create_limiter(ip);
        limiter.check().is_ok()
    }
}

pub async fn rate_limit_middleware(
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Response {
    // Extract IP from headers
    let ip = extract_client_ip(&headers);
    
    // Get rate limiter from request extensions
    let limiter = request.extensions().get::<Arc<IpRateLimiter>>()
        .expect("Rate limiter not configured");
    
    if !limiter.check(&ip) {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "Rate limit exceeded. Please try again later.",
        ).into_response();
    }
    
    next.run(request).await
}

fn extract_client_ip(headers: &HeaderMap) -> String {
    // Try X-Forwarded-For first (from nginx)
    if let Some(xff) = headers.get("x-forwarded-for") {
        if let Ok(s) = xff.to_str() {
            if let Some(first) = s.split(',').next() {
                return first.trim().to_string();
            }
        }
    }
    
    // Try X-Real-IP
    if let Some(xri) = headers.get("x-real-ip") {
        if let Ok(s) = xri.to_str() {
            return s.to_string();
        }
    }
    
    "unknown".to_string()
}
```

#### 4.3 In `src/rag_backend.rs` einbinden

```rust
use axum::middleware;
mod middleware as app_middleware;

#[tokio::main]
async fn main() -> Result<()> {
    // ... existing setup ...
    
    // Create rate limiter (5 requests/minute per IP)
    let rate_limiter = Arc::new(app_middleware::rate_limiter::IpRateLimiter::new(5));
    
    let app = Router::new()
        .route("/api/chat", post(chat))
        .layer(middleware::from_fn(app_middleware::rate_limiter::rate_limit_middleware))
        .layer(Extension(rate_limiter))
        // ... rest of routes ...
        .with_state(app_state);
    
    // ... rest of main ...
}
```

**Effektivität**:
- ✅✅✅ Granulares Per-IP Rate-Limiting
- ✅✅ Unabhängig von nginx
- ✅ Flexibel konfigurierbar
- ⚠️ Zusätzliche Dependencies

---

### Ebene 5: CAPTCHA für Beispiel-Queries (Optional, für Paranoia-Modus)

**Was es schützt**: Verhindert, dass automatisierte Headless-Browser die Beispiel-Buttons klicken.

**Implementation**:

#### 5.1 hCaptcha oder reCAPTCHA einbinden

Im Frontend, nur für Beispiele:

```typescript
// In SearchView.vue
const runExample = async (query: string, speaker1Slug: string | null = null, speaker2Slug: string | null = null) => {
  // Optional: CAPTCHA für erste Nutzung (pro Session)
  if (!sessionStorage.getItem('captcha_verified')) {
    const captchaToken = await showCaptcha();
    if (!captchaToken) {
      return; // User hat CAPTCHA abgebrochen
    }
    sessionStorage.setItem('captcha_verified', 'true');
  }
  
  // ... rest of runExample ...
};
```

**Effektivität**:
- ✅✅✅ Verhindert automatisierte Headless-Browser
- ⚠️ Schlechtere UX (nervt echte Nutzer)
- ⚠️ Zusätzliche Kosten (hCaptcha/reCAPTCHA)

**Empfehlung**: Nur implementieren, wenn du nachweislich Bot-Probleme hast.

---

## Empfohlene Konfiguration (Priorität)

### ✅ Minimal (Sofort implementieren)

1. **robots.txt** erstellen → 5 Minuten
2. **Meta-Tags** in `index.html` → 2 Minuten
3. **Nginx Rate-Limiting** → 15 Minuten

**Effektivität**: ~90% der Crawler/Bots gestoppt

### ✅✅ Empfohlen (Diese Woche)

1. Minimal-Setup (siehe oben)
2. **User-Agent Blocking** in nginx → 10 Minuten
3. **Backend Rate-Limiting** mit Tower → 30 Minuten

**Effektivität**: ~98% Schutz

### ✅✅✅ Paranoia (Nur bei nachweisbarem Missbrauch)

1. Empfohlen-Setup (siehe oben)
2. **Per-IP Rate-Limiting** im Backend → 1-2 Stunden
3. **CAPTCHA** für Beispiele → 2-3 Stunden

**Effektivität**: ~99.9% Schutz

---

## Testing

### Test 1: Rate-Limiting funktioniert

```bash
# Schicke 10 Anfragen schnell hintereinander
for i in {1..10}; do
  curl -X POST http://localhost:3001/api/chat \
    -H "Content-Type: application/json" \
    -d '{"query": "Test", "podcast_id": "freakshow"}' &
done
wait

# Erwartung: Nach 2-5 Requests kommt 429 (Too Many Requests)
```

### Test 2: robots.txt ist erreichbar

```bash
curl http://your-domain.com/robots.txt
# Sollte die robots.txt zurückgeben
```

### Test 3: Bot User-Agent wird blockiert

```bash
curl -A "Mozilla/5.0 (compatible; Googlebot/2.1)" \
  http://your-domain.com/api/chat
# Sollte 403 zurückgeben
```

---

## Monitoring

Um Missbrauch zu erkennen, solltest du loggen:

```rust
// In src/handlers/chat.rs
pub async fn chat(
    State(st): State<crate::config::AppState>,
    headers: HeaderMap,
    Json(req): Json<ChatRequest>,
) -> impl IntoResponse {
    let ip = extract_client_ip(&headers);
    let user_agent = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");
    
    tracing::info!(
        target: "api_usage",
        ip = %ip,
        user_agent = %user_agent,
        podcast = %req.podcast_id.as_deref().unwrap_or("freakshow"),
        query_len = req.query.len(),
        "Chat request received"
    );
    
    // ... rest of handler ...
}
```

### Log-Analyse

```bash
# Zeige Top-IPs nach Anzahl Requests
grep "Chat request received" app.log | grep -oP 'ip=\S+' | sort | uniq -c | sort -rn | head -10

# Zeige verdächtige User-Agents
grep "Chat request received" app.log | grep -E "(bot|crawler|scraper)" | head -20
```

---

## Kostenschätzung bei Missbrauch

**Ohne Schutz**:
- 1 Bot mit 1 Request/Sekunde = 3600 Requests/Stunde
- Bei $0.01/Request → $36/Stunde = $864/Tag = $25,920/Monat 💸💸💸

**Mit Nginx Rate-Limiting (2 req/min)**:
- Max. 2 Requests/Minute/IP = 120 Requests/Stunde/IP
- 10 Bot-IPs → 1200 Requests/Stunde
- Bei $0.01/Request → $12/Stunde = $288/Tag = $8,640/Monat ⚠️

**Mit Nginx + User-Agent Blocking**:
- ~95% der Bots blockiert
- ~60 Requests/Stunde über alle IPs
- Bei $0.01/Request → $0.60/Stunde = $14.40/Tag = $432/Monat ✅

---

## Zusammenfassung

### Sofort umsetzen (15-20 Minuten)

1. ✅ `robots.txt` erstellen
2. ✅ Meta-Tags in `index.html` 
3. ✅ Nginx Rate-Limiting (2 req/min für `/api/chat`)

### Diese Woche (1-2 Stunden)

4. ✅ User-Agent Blocking in nginx
5. ✅ Backend Rate-Limiting mit Tower
6. ✅ Logging & Monitoring einrichten

### Bei Bedarf (2-3 Stunden)

7. ⏳ Per-IP Rate-Limiting im Backend
8. ⏳ CAPTCHA für Beispiele

---

## Weiterführende Ressourcen

- Nginx Rate Limiting: https://nginx.org/en/docs/http/ngx_http_limit_req_module.html
- Tower Middleware: https://docs.rs/tower/latest/tower/
- Governor (Rust Rate Limiter): https://docs.rs/governor/latest/governor/
