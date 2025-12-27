# Rate Limit Verbesserungen für Rust Clustering

## Problem
Das Rust-Programm für Topic-Clustering hing bei der LLM-basierten Benennung der Cluster (ca. bei Cluster 170/256), wahrscheinlich aufgrund von OpenAI API Rate Limits.

## Lösung

### 1. Erhöhte Default-Werte für Retry-Mechanismus
- **max_retries**: 3 → 5 Versuche
- **retry_delay_ms**: 5000ms → 10000ms (10 Sekunden)
- **delay_ms zwischen Requests**: 1000ms → 2000ms (2 Sekunden)

### 2. Verbessertes Error Handling
- HTTP Status 429 (Rate Limit) **UND** 503 (Service Unavailable) werden erkannt
- Exponential Backoff: Bei jedem Retry verdoppelt sich die Wartezeit
  - Retry 1: 10 Sekunden
  - Retry 2: 20 Sekunden
  - Retry 3: 40 Sekunden
  - Retry 4: 80 Sekunden
  - Retry 5: 160 Sekunden

### 3. Request Timeout
- 30 Sekunden Timeout für jeden LLM-Request hinzugefügt
- Verhindert, dass hängende Requests den gesamten Prozess blockieren

### 4. Präventive Pausen
- Alle 50 Requests: 30 Sekunden Pause
- Verhindert proaktiv das Erreichen von Rate Limits
- Progress Bar zeigt "⏸️  Pause (Rate Limit Prävention)" an

### 5. Besseres Logging
- Detaillierte Fehlermeldungen bei Rate Limits
- HTTP Status Codes werden ausgegeben
- JSON Parse Errors werden geloggt
- Request Errors mit Retry-Informationen

### 6. Fallback auf Heuristik
- Bei LLM-Fehlern wird automatisch die heuristische Namensfindung verwendet
- Progress Bar zeigt "(Heuristik - LLM fehlgeschlagen)" an

## Verwendung

```bash
# Mit Default-Einstellungen (jetzt sicherer)
cargo run --release

# Oder in settings.json anpassen:
{
  "topicExtraction": {
    "requestDelayMs": 3000,      // Noch längere Verzögerung
    "maxRetries": 10,             // Mehr Retries
    "retryDelayMs": 15000         // Längere initiale Retry-Verzögerung
  }
}
```

## Erwartete Laufzeit
- 256 Cluster × 2 Sekunden = ~8.5 Minuten (ohne Pausen)
- + 5 Pausen à 30 Sekunden = ~2.5 Minuten
- **Gesamt: ~11 Minuten** (statt vorher hängen zu bleiben)

## Backup
Eine Backup-Datei wurde erstellt: `src/cluster_topics.rs.backup`
