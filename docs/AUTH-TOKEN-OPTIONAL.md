# Auth-Token Optional machen

## Problem

Das Frontend fragt **immer** nach einem Auth-Token, auch wenn das Backend keines erfordert.

## Lösung

Das Frontend wurde angepasst, um **zuerst ohne Token** zu versuchen und nur bei Bedarf (403/401) nach einem Token zu fragen.

## Änderungen

### Frontend: `SearchView.vue`

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

## Workflow

### Ohne Auth (Backend ohne Token)

```
User → Suche → Frontend sendet Request ohne Token
                ↓
             Backend erlaubt (kein authToken in settings.json)
                ↓
             Antwort kommt → Fertig ✅
```

### Mit Auth (Backend mit Token)

```
User → Suche → Frontend sendet Request ohne Token
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

### Auth deaktiviert

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001"
    // Kein authToken = Auth deaktiviert
  }
}
```

**Verhalten**: Frontend fragt **nie** nach Token ✅

### Auth aktiviert

```json
{
  "rag": {
    "bindAddr": "127.0.0.1:3001",
    "authToken": "my-secret-token-123"
  }
}
```

**Verhalten**: Frontend fragt beim ersten Request nach Token 🔒

## Testing

### Test 1: Ohne Auth

```bash
# settings.json ohne authToken
cat settings.json
# {
#   "rag": { "bindAddr": "..." }
# }

# Backend starten
cargo run --release --bin rag-backend

# Frontend nutzen
# → Keine Token-Abfrage ✅
```

### Test 2: Mit Auth

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
# → Token-Prompt beim ersten Request
# → Token wird gespeichert (localStorage)
# → Weitere Requests ohne Prompt ✅
```

### Test 3: Token zurücksetzen

Im Frontend (Browser Console):
```javascript
// Token löschen
localStorage.removeItem('ragAuthToken')

// Oder über Settings-Store
import { useSettingsStore } from '@/stores/settings'
const settings = useSettingsStore()
settings.clearRagAuthToken()
```

## Vorteile

✅ **Besser UX**: Kein unnötiger Prompt wenn Auth nicht nötig ist  
✅ **Graceful Degradation**: Versucht ohne Token, fragt bei Bedarf  
✅ **Token-Caching**: Einmal eingegeben, wird gespeichert  
✅ **Flexibel**: Funktioniert mit und ohne Backend-Auth

## Siehe auch

- Backend Auth-Logik: `src/handlers/chat.rs:80-89`
- Backend Config: `src/config.rs:151-155`
- Frontend Settings: `frontend/src/stores/settings.ts`

## Changelog

### 2026-01-12
- Frontend: Auth-Token nur bei Bedarf abfragen
- Erst Request ohne Token versuchen
- Bei 403/401 → dann Token-Prompt
- Dokumentation erstellt
