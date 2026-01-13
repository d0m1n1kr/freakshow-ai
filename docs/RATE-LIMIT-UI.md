# Rate-Limit Error UI Implementation

## Änderungen

### 1. i18n Übersetzungen hinzugefügt

**Dateien**: 
- `frontend/src/i18n/locales/de.json`
- `frontend/src/i18n/locales/en.json`
- `frontend/src/i18n/locales/fr.json`

**Neue Keys**:
```json
"rateLimitError": {
  "title": "Zu viele Anfragen",
  "message": "Du hast zu viele Anfragen in kurzer Zeit gesendet. Bitte warte einen Moment.",
  "explanation": "Diese Limitierung schützt den Service und stellt faire Nutzung für alle sicher. LLM-Anfragen sind ressourcenintensiv.",
  "retryIn": "Bitte versuche es in {seconds} Sekunden erneut.",
  "limit": "Limit: {limit} Anfragen pro Minute"
}
```

---

### 2. SearchView.vue - Rate-Limit-Handling

#### State Management

```typescript
const isRateLimitError = ref(false);
const rateLimitRetryAfter = ref(60); // Default 60 seconds
```

#### Error Detection

```typescript
if (res.status === 429) {
  isRateLimitError.value = true;
  // Try to extract Retry-After header
  const retryAfter = res.headers.get('Retry-After');
  if (retryAfter) {
    rateLimitRetryAfter.value = parseInt(retryAfter, 10) || 60;
  } else {
    rateLimitRetryAfter.value = 60; // Default to 60 seconds
  }
  error.value = t('search.rateLimitError.title');
  return;
}
```

#### Countdown Timer

```typescript
let countdownInterval: ReturnType<typeof setInterval> | null = null;

watch(isRateLimitError, (isRateLimit) => {
  if (isRateLimit) {
    // Start countdown
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      if (rateLimitRetryAfter.value > 0) {
        rateLimitRetryAfter.value--;
      } else {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);
  } else {
    // Stop countdown
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }
});
```

#### UI Component

Schöne, auffällige Error-Box mit:
- 🚦 Icon mit Pulsing-Animation
- Gelb-Orange Gradient-Hintergrund
- Großer Countdown-Timer
- Erklärungstext
- Informationen zum Rate-Limit

```vue
<!-- Rate Limit Error (special styling) -->
<div v-else-if="error && isRateLimitError" class="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-400 dark:border-yellow-600 rounded-xl p-6 shadow-lg">
  <div class="flex items-start gap-4">
    <div class="text-5xl flex-shrink-0 animate-pulse">🚦</div>
    <div class="flex-1">
      <div class="text-yellow-900 dark:text-yellow-200 font-bold text-xl mb-2">
        {{ t('search.rateLimitError.title') }}
      </div>
      <div class="text-yellow-800 dark:text-yellow-300 mb-3">
        {{ t('search.rateLimitError.message') }}
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-yellow-300 dark:border-yellow-700 mb-3">
        <div class="text-sm text-gray-700 dark:text-gray-300 mb-2">
          {{ t('search.rateLimitError.explanation') }}
        </div>
        <div class="text-xs text-gray-600 dark:text-gray-400 font-mono">
          {{ t('search.rateLimitError.limit', { limit: '2-5' }) }}
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
          {{ rateLimitRetryAfter }}s
        </div>
        <div class="text-sm text-yellow-700 dark:text-yellow-300">
          {{ t('search.rateLimitError.retryIn', { seconds: rateLimitRetryAfter }) }}
        </div>
      </div>
    </div>
  </div>
</div>
```

---

## Features

✅ **429-Error-Erkennung**: Automatische Erkennung von Rate-Limit-Errors  
✅ **Retry-After Header**: Liest den `Retry-After` Header von nginx (wenn vorhanden)  
✅ **Countdown-Timer**: Live-Countdown bis zum nächsten erlaubten Request  
✅ **Schönes Design**: Auffällige, aber freundliche UI mit Gradient & Animation  
✅ **Dark Mode**: Funktioniert in Hell- und Dunkel-Modus  
✅ **i18n**: Übersetzungen für DE, EN, FR  
✅ **Benutzerfreundlich**: Erklärt warum das Limit existiert  

---

## Nginx-Config für Retry-After Header

Optional: Füge in der nginx-Config hinzu, damit das Frontend weiß wie lange zu warten ist:

```nginx
location /api/chat {
    limit_req zone=llm_ultra burst=3 nodelay;
    limit_req_status 429;
    
    # Sende Retry-After Header (60 Sekunden)
    add_header Retry-After "60" always;
    
    proxy_pass http://127.0.0.1:3001;
    # ... rest ...
}
```

Alternativ mit `limit_req_log_level`:

```nginx
location /api/chat {
    limit_req zone=llm_ultra burst=3 nodelay;
    limit_req_status 429;
    limit_req_log_level warn;
    
    proxy_pass http://127.0.0.1:3001;
    # ... rest ...
}
```

---

## Testing

### Test 1: Rate-Limit auslösen

```bash
# Sende mehrere Requests schnell hintereinander
for i in {1..5}; do
  curl -X POST http://localhost/api/chat \
    -H "Content-Type: application/json" \
    -d '{"query": "Test", "podcast_id": "freakshow"}'
  echo ""
done
```

Erwartung: Nach 2-3 Requests → 429-Error → Schöne Meldung im Frontend

### Test 2: Retry-After Header

```bash
curl -I -X POST http://localhost/api/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "Test"}'
```

Erwartung: `Retry-After: 60` Header sichtbar

---

## Weitere Verbesserungen (Optional)

### 1. Auto-Retry nach Countdown

```typescript
watch(rateLimitRetryAfter, (seconds) => {
  if (seconds === 0 && isRateLimitError.value && searchQuery.value) {
    // Automatisch nochmal versuchen
    isRateLimitError.value = false;
    error.value = null;
    doSearch(searchQuery.value);
  }
});
```

### 2. Retry-Button hinzufügen

```vue
<button 
  @click="retrySearch"
  :disabled="rateLimitRetryAfter > 0"
  class="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
>
  <span v-if="rateLimitRetryAfter > 0">
    Warten... ({{ rateLimitRetryAfter }}s)
  </span>
  <span v-else>
    Jetzt erneut versuchen
  </span>
</button>
```

### 3. Rate-Limit für andere Endpoints

Gleiche Logik kann für `/api/episodes/search` und andere API-Calls angewendet werden.

---

## Screenshots

### Rate-Limit-Error (Hell-Modus)
```
┌─────────────────────────────────────────────────────┐
│  🚦  Zu viele Anfragen                               │
│                                                      │
│      Du hast zu viele Anfragen in kurzer Zeit       │
│      gesendet. Bitte warte einen Moment.            │
│                                                      │
│      ┌────────────────────────────────────────┐     │
│      │ Diese Limitierung schützt den Service  │     │
│      │ und stellt faire Nutzung für alle      │     │
│      │ sicher. LLM-Anfragen sind ressourcen-  │     │
│      │ intensiv.                               │     │
│      │                                         │     │
│      │ Limit: 2-5 Anfragen pro Minute         │     │
│      └────────────────────────────────────────┘     │
│                                                      │
│      45s   Bitte versuche es in 45 Sekunden         │
│             erneut.                                  │
└─────────────────────────────────────────────────────┘
```

---

## Zusammenfassung

✅ **Implementiert**: SearchView.vue hat jetzt schönes Rate-Limit-Error-Handling  
✅ **Countdown**: Live-Timer zeigt verbleibende Sekunden  
✅ **i18n**: Mehrsprachig (DE, EN, FR)  
✅ **UX**: Benutzerfreundlich mit Erklärungen  
✅ **Design**: Auffällig aber freundlich  

**Next Steps**:
1. Frontend neu bauen: `cd frontend && npm run build`
2. Testen mit mehreren schnellen Requests
3. Optional: Gleiche Logik für EpisodeView und StatsView hinzufügen

---

**Datum**: 2026-01-13  
**Version**: 1.0
