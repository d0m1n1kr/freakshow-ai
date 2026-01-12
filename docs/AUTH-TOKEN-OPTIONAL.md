# Auth-Token Optional machen

## Problem

Das Frontend fragt **immer** nach einem Auth-Token, auch wenn das Backend keines erfordert.

## Lösung

Das Frontend (SearchView + StatsView) wurde angepasst, um **zuerst ohne Token** zu versuchen und nur bei Bedarf (403/401) nach einem Token zu fragen.

## Änderungen

### Frontend: `SearchView.vue` (RAG/Chat Auth)

**Vorher**: Token wird sofort abgefragt
```typescript
const ensureAuthToken = async () => {
  const existing = settings.ragAuthToken || '';
  if (existing) return existing;
  
  const token = window.prompt('Enter auth token') || '';  // ← Sofort prompt!
  if (!token) return null;
  return token;
};
```

**Nachher**: Erst versuchen, dann bei Bedarf fragen
```typescript
const ensureAuthToken = async () => {
  const existing = settings.ragAuthToken || '';
  if (existing) return existing;
  
  // Return empty string to try without token first
  return '';  // ← Kein Prompt!
};

const promptForAuthToken = async () => {
  const token = window.prompt('Enter auth token') || '';
  if (!token) return null;
  settings.setRagAuthToken(token);
  return token;
};
```

**Request-Logik**:
```typescript
// 1. Versuche ohne Token (oder mit gespeichertem)
const headers: any = { 'Content-Type': 'application/json' };
if (token) {  // ← Nur wenn Token vorhanden
  headers['x-auth-token'] = token;
}

let res = await fetch(url, { method: 'POST', headers, body });

// 2. Wenn 403/401 → Jetzt Token abfragen
if (!res.ok && isPermissionDenied(res.status, txt)) {
  const token1 = await promptForAuthToken();  // ← Erst JETZT prompt
  if (!token1) {
    error.value = 'Auth required';
    return;
  }
  res = await fetch(...);  // Retry mit Token
}
```

### Frontend: `StatsView.vue` (Analytics Auth)

Die **gleichen Änderungen** wurden auch für die Analytics-Seite implementiert:

```typescript
const ensureAuthToken = async (): Promise<string> => {
  const existing = settings.statsAuthToken || '';
  if (existing) return existing;
  return '';  // ← Kein Prompt!
};

const promptForAuthToken = async (): Promise<string | null> => {
  const token = window.prompt('Enter analytics authentication token') || null;
  if (!token) return null;
  settings.setStatsAuthToken(token);
  return token;
};
```

**Request-Logik** (analog zu SearchView):
```typescript
const headers: any = {};
if (token) {  // ← Nur wenn Token vorhanden
  headers['x-auth-token'] = token;
}

let res = await fetch(url, { headers, cache: 'no-cache' });

if (!res.ok && isPermissionDenied(res.status, txt)) {
  const token1 = await promptForAuthToken();  // ← Erst jetzt prompt
  if (!token1) {
    error.value = 'Auth required';
    return;
  }
  res = await fetch(...);  // Retry
}
```

## Workflow

### Ohne Auth (Backend ohne Token)

```
User → Suche/Stats → Frontend sendet Request ohne Token
                      ↓
                   Backend erlaubt (kein authToken/statsAuthToken)
                      ↓
                   Antwort kommt → Fertig ✅
```

### Mit Auth (Backend mit Token)

```
User → Suche/Stats → Frontend sendet Request ohne Token
                      ↓
                   Backend verweigert (403)
                      ↓
                   Frontend fragt nach Token (Prompt)
                      ↓
                   User gibt Token ein
                      ↓
                   Retry mit Token → Fertig ✅
```

## Backend-Konfiguration

### Auth komplett deaktiviert

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001"
    // Kein authToken = RAG/Chat Auth deaktiviert
    // Kein statsAuthToken = Analytics Auth deaktiviert
  }
}
```

**Verhalten**: 
- SearchView fragt **nie** nach Token ✅
- StatsView fragt **nie** nach Token ✅

### Nur RAG Auth aktiviert

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001",
    "authToken": "my-secret-token-123"
    // Kein statsAuthToken = Analytics ohne Auth
  }
}
```

**Verhalten**: 
- SearchView fragt beim ersten Request nach Token 🔒
- StatsView fragt **nie** nach Token ✅

### Nur Stats Auth aktiviert

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001",
    "statsAuthToken": "my-stats-token-456"
    // Kein authToken = RAG ohne Auth
  }
}
```

**Verhalten**: 
- SearchView fragt **nie** nach Token ✅
- StatsView fragt beim ersten Request nach Token 🔒

### Beide Auth aktiviert

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001",
    "authToken": "my-secret-token-123",
    "statsAuthToken": "my-stats-token-456"
  }
}
```

**Verhalten**: 
- SearchView fragt beim ersten Request nach RAG Token 🔒
- StatsView fragt beim ersten Request nach Stats Token 🔒
- Tokens werden separat gespeichert

## Testing

### Test 1: Ohne Auth (beide deaktiviert)

```bash
# settings.json ohne authToken und statsAuthToken
cat settings.json
# {
#   "rag": { "bindAddr": "..." }
# }

# Backend starten
cargo run --release --bin rag-backend

# Frontend nutzen
# → SearchView: Keine Token-Abfrage ✅
# → StatsView: Keine Token-Abfrage ✅
```

### Test 2: Nur RAG Auth

```bash
# settings.json mit authToken
cat settings.json
# {
#   "rag": { 
#     "bindAddr": "...",
#     "authToken": "test123"
#   }
# }

# Backend starten
cargo run --release --bin rag-backend

# Frontend nutzen
# → SearchView: Token-Prompt beim ersten Request 🔒
# → StatsView: Keine Token-Abfrage ✅
```

### Test 3: Nur Stats Auth

```bash
# settings.json mit statsAuthToken
cat settings.json
# {
#   "rag": { 
#     "bindAddr": "...",
#     "statsAuthToken": "stats456"
#   }
# }

# Backend starten
cargo run --release --bin rag-backend

# Frontend nutzen
# → SearchView: Keine Token-Abfrage ✅
# → StatsView: Token-Prompt beim ersten Request 🔒
```

### Test 4: Beide Auth aktiv

```bash
# settings.json mit beiden Tokens
cat settings.json
# {
#   "rag": { 
#     "bindAddr": "...",
#     "authToken": "rag123",
#     "statsAuthToken": "stats456"
#   }
# }

# Backend starten
cargo run --release --bin rag-backend

# Frontend nutzen
# → SearchView: RAG Token-Prompt 🔒
# → StatsView: Stats Token-Prompt 🔒
```

### Test 5: Token zurücksetzen

Im Frontend (Browser Console):
```javascript
// RAG Token löschen
localStorage.removeItem('ragAuthToken')

// Stats Token löschen
localStorage.removeItem('statsAuthToken')

// Oder über Settings-Store
import { useSettingsStore } from '@/stores/settings'
const settings = useSettingsStore()
settings.clearRagAuthToken()
settings.clearStatsAuthToken()
```

## Vorteile

✅ **Bessere UX**: Kein unnötiger Prompt wenn Auth nicht nötig ist  
✅ **Graceful Degradation**: Versucht ohne Token, fragt bei Bedarf  
✅ **Token-Caching**: Einmal eingegeben, wird gespeichert  
✅ **Flexibel**: Funktioniert mit und ohne Backend-Auth  
✅ **Separate Tokens**: RAG und Stats können unterschiedliche Tokens haben  
✅ **Unabhängig konfigurierbar**: RAG mit Auth, Stats ohne - oder umgekehrt

## Siehe auch

- Backend Auth-Logik (RAG): `src/handlers/chat.rs:80-89`
- Backend Auth-Logik (Stats): `src/handlers/analytics.rs:912-921`
- Backend Config: `src/config.rs:151-161`
- Frontend Settings: `frontend/src/stores/settings.ts`

## Changelog

### 2026-01-12 - v2
- **StatsView**: Auth-Token nur bei Bedarf abfragen (gleiche Logik wie SearchView)
- Dokumentation erweitert mit Stats-Beispielen
- Separate Token-Verwaltung dokumentiert

### 2026-01-12 - v1
- **SearchView**: Auth-Token nur bei Bedarf abfragen
- Erst Request ohne Token versuchen
- Bei 403/401 → dann Token-Prompt
- Dokumentation erstellt
