# Token-System - Quick Start Guide

## Setup (5 Minuten)

### 1. settings.json erweitern

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001",
    "authToken": "dein-unbegrenzter-admin-token",
    "statsAuthToken": "dein-admin-dashboard-token"
  },
  "email": {
    "smtpHost": "smtp.sendgrid.net",
    "smtpPort": 587,
    "smtpUsername": "apikey",
    "smtpPassword": "SG.xxx...",
    "fromEmail": "noreply@pod-insights.freshx.de",
    "fromName": "PodInsights",
    "baseUrl": "https://pod-insights.freshx.de"
  },
  "tokenSystem": {
    "enabled": true,
    "defaultLimit": 100,
    "tokenExpireDays": 365
  }
}
```

### 2. Datenbank initialisieren

```bash
# Wird automatisch beim ersten Start erstellt
# Datei: auth_tokens.db
```

### 3. Backend kompilieren & starten

```bash
cargo build --release --bin rag-backend
./target/release/rag-backend
```

## API-Endpoints

### Public

- `POST /api/auth/request-token` - Token anfordern
- `GET /api/auth/activate/{code}` - Token aktivieren  
- `GET /api/auth/token-info` - Token-Status

### Admin (statsAuthToken required)

- `GET /api/admin/tokens` - Alle Tokens anzeigen
- `POST /api/admin/tokens/{token}/increase-limit` - Limit erhöhen
- `DELETE /api/admin/tokens/{token}` - Token löschen

## User-Flow

1. User besucht `/request-token`
2. Gibt E-Mail ein
3. Erhält E-Mail mit Aktivierungslink
4. Klickt Link → Token aktiviert & gespeichert
5. Nutzt Chat mit 100 Requests

## Admin-Flow

1. Admin besucht `/admin/tokens` (mit statsAuthToken)
2. Sieht alle Tokens, E-Mails, Usage
3. Kann Limit erhöhen (+100)

## Features

✅ E-Mail-Verifizierung  
✅ 100 Requests/Token (konfigurierbar)  
✅ Config-Token unbegrenzt  
✅ Admin-Dashboard  
✅ Request-Counting  
✅ Schöne HTML-E-Mails  

Vollständige Doku: `docs/TOKEN-SYSTEM.md`
