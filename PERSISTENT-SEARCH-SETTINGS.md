# Persistente Speicherung von Antwortstil und Diskussionsmodus

Diese Änderung verschiebt die Auswahl von Antwortstil (Speaker Persona) und Diskussionsmodus in den persistenten Pinia Store, damit die Einstellungen über Sitzungen hinweg erhalten bleiben.

## Änderungen

### 1. Settings Store (`frontend/src/stores/settings.ts`)

**Neue State-Variablen:**
```typescript
// Search: Answer style (speaker persona) - persisted
const selectedSpeaker = ref<string | null>(null);

// Search: Discussion mode (second speaker) - persisted
const selectedSpeaker2 = ref<string | null>(null);
```

**Neue Actions:**
```typescript
function setSelectedSpeaker(speaker: string | null) {
  selectedSpeaker.value = speaker;
}

function setSelectedSpeaker2(speaker: string | null) {
  selectedSpeaker2.value = speaker;
}
```

**Export:**
- `selectedSpeaker` - Ausgewählter Speaker für Antwortstil (slug)
- `selectedSpeaker2` - Zweiter Speaker für Diskussionsmodus (slug)
- `setSelectedSpeaker()` - Setter für Antwortstil
- `setSelectedSpeaker2()` - Setter für Diskussionsmodus

### 2. SearchView Component (`frontend/src/views/SearchView.vue`)

**Entfernte lokale State:**
```typescript
// Entfernt:
const selectedSpeaker = ref<string | null>(null);
const selectedSpeaker2 = ref<string | null>(null);
```

**Verwendung vom Store:**
```typescript
// Computed properties verwenden jetzt settings.selectedSpeaker
const selectedSpeakerInfo = computed(() => {
  if (!settings.selectedSpeaker) return null;
  return availableSpeakers.value.find(s => s.slug === settings.selectedSpeaker) || null;
});

const selectedSpeaker2Info = computed(() => {
  if (!settings.selectedSpeaker2) return null;
  return availableSpeakers.value.find(s => s.slug === settings.selectedSpeaker2) || null;
});
```

**Template-Bindungen:**
```vue
<!-- Antwortstil-Auswahl -->
<select v-model="settings.selectedSpeaker" ...>

<!-- Diskussionsmodus-Auswahl -->
<select v-model="settings.selectedSpeaker2" ...>

<!-- Bedingte Anzeige -->
<div v-if="settings.selectedSpeaker" ...>
<p v-if="settings.selectedSpeaker && settings.selectedSpeaker2" ...>
```

**API-Aufruf:**
```typescript
if (settings.selectedSpeaker) {
  body.speakerSlug = settings.selectedSpeaker;
}
if (settings.selectedSpeaker2) {
  body.speakerSlug2 = settings.selectedSpeaker2;
}
```

## Verhalten

### Vor der Änderung
- Antwortstil und Diskussionsmodus wurden bei jedem Seitenwechsel zurückgesetzt
- Nutzer mussten die Auswahl jedes Mal neu treffen

### Nach der Änderung
- Ausgewählter Antwortstil wird im `localStorage` gespeichert
- Ausgewählter Diskussionsmodus wird im `localStorage` gespeichert
- Einstellungen bleiben über Sitzungen hinweg erhalten
- Bei erneutem Besuch der Suche sind die letzten Einstellungen automatisch aktiv

## Storage-Schlüssel

Die Werte werden im `localStorage` unter dem Key `freakshow-settings` gespeichert:

```json
{
  "selectedSpeaker": "tim-pritlove",
  "selectedSpeaker2": "roddi",
  // ... andere Settings
}
```

## Kompatibilität

- Rückwärtskompatibel: Wenn keine gespeicherten Werte vorhanden sind, ist `null` der Standardwert
- Die UI verhält sich identisch, nur dass die Werte persistiert werden
- Keine Breaking Changes für bestehende Nutzer

## Vorteile

1. **Bessere User Experience**: Nutzer müssen nicht jedes Mal neu auswählen
2. **Konsistenz**: Gleiche Persistenz-Strategie wie andere Einstellungen
3. **Zentrale Verwaltung**: Alle Settings an einem Ort (Pinia Store)
4. **Typsicherheit**: TypeScript-Typen im gesamten Store

## Testing

Nach der Implementierung:
1. Wähle einen Speaker im Antwortstil aus
2. Wechsle zu einer anderen Ansicht
3. Kehre zur Suche zurück → Auswahl ist noch vorhanden
4. Schließe Browser und öffne neu → Auswahl ist noch vorhanden
5. Teste Diskussionsmodus ebenfalls

## Dateien geändert

- `frontend/src/stores/settings.ts` - Store-Erweiterung
- `frontend/src/views/SearchView.vue` - Store-Verwendung

