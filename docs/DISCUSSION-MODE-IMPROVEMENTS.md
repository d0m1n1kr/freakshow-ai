# Discussion Mode - Verbesserungen (2026-01-12)

## Probleme

1. **Nicht-klickbare Zeitmarken**: Einige Episode-Referenzen wurden nicht als klickbare Links erkannt
2. **Gestelzte Konversation**: Die Diskussionen klangen zu formal, strukturiert und unnatürlich

## Lösungen

### 1. Erweiterte Zeitmarken-Erkennung

**Problem**: Der Regex-Pattern erkannte nur das Format `(Episode 123, 12:34-56:78)`

**Lösung**: Unterstützung für mehrere Zitationsformate

#### Vorher

```javascript
const episodePattern = /\(Episode\s+(\d+),\s+([\d:]+)(?:-[\d:]+)?\)/gi;
```

#### Nachher

```javascript
// Support multiple citation formats:
// - (Episode 123, 12:34-56:78)
// - (Episode 123, 12:34)
// - (Ep. 123, 12:34-56:78)
// - (Ep 123, 12:34)
const episodePattern = /\((Episode|Ep\.?)\s+(\d+),\s+([\d:]+)(?:-[\d:]+)?\)/gi;
```

**Vorteile**:
- ✅ Erkennt auch verkürzte Formen ("Ep.", "Ep")
- ✅ Flexibler bei LLM-generierten Zitaten
- ✅ Alle gängigen Varianten werden klickbar

**Datei**: `frontend/src/views/SearchView.vue`, Zeile 797-817

---

### 2. Natürlicherer Konversationsstil

**Problem**: Der Prompt erzeugte zu formale, strukturierte Diskussionen:
- Jede Aussage wurde mit Gegenpunkt beantwortet
- Zu gleichmäßig balanciert
- Zu viele Zitate pro Satz
- Klang wie ein Debate-Club statt wie echte Freunde

**Lösung**: Komplett überarbeiteter System-Prompt mit Fokus auf Natürlichkeit

#### Vorher

```rust
"You are orchestrating a DISCUSSION/DEBATE between two people..."
"DIALOGUE FORMAT:"
"- Create a natural back-and-forth discussion or debate"
"- Make it feel like a real conversation..."
```

#### Nachher

```rust
"You are orchestrating a NATURAL, RELAXED DISCUSSION between two people..."
"CONVERSATION STYLE - MAKE IT NATURAL:"
"- Write as if this is a REAL, spontaneous conversation between friends"
"- Use casual, flowing language - avoid overly formal or structured speech"
"- Let speakers interrupt, overlap, or build on each other's thoughts naturally"
"- Include natural discourse markers from their profiles (\"also\", \"ja\", \"ne\", etc.)"
"- Don't make every turn too balanced - some responses can be short, others longer"
"- Let the conversation flow organically - not every point needs a counter-point"
"- Use ellipses (...) for trailing thoughts or interruptions"
"- Include reactions like agreements, laughter references, or brief acknowledgments"
```

**Neue Instruktionen**:

1. **Spontaneität**: "REAL, spontaneous conversation between friends"
2. **Ungleiche Turns**: "some responses can be short, others longer"
3. **Natürlicher Fluss**: "not every point needs a counter-point"
4. **Ellipsen**: "Use ellipses (...) for trailing thoughts"
5. **Reaktionen**: "agreements, laughter references, brief acknowledgments"
6. **Discourse Markers**: "also", "ja", "ne" aus Sprecher-Profilen
7. **Weniger Zitate**: "not in every sentence"
8. **Informeller**: "casual, flowing language"

#### User-Prompt Anpassung

**Vorher**:
```rust
"Create a discussion/debate between {} and {} about this question."
```

**Nachher**:
```rust
"Create a natural, flowing discussion - not a formal debate"
"Make it sound like a real conversation between friends discussing an interesting topic"
```

**Datei**: `src/rag/embeddings.rs`, Zeile 84-136

---

## Beispiel-Vergleich

### Vorher (Gestelzt)

```
Tim: Bitcoin Mining ist im Grunde ein riesiger Rechenvorrat, bei dem Computer komplexe mathematische Aufgaben lösen. (Episode 281, 12:38-17:19)

Roddi: Das ist sehr vereinfacht dargestellt. Es geht ja auch um die Sicherheit des gesamten Netzwerks und die Validierung von Transaktionen. (Episode 281, 17:20-19:45)

Tim: Ja gut, aber für den Normalsterblichen ist es doch erstmal wichtig zu verstehen, dass es um das Lösen von Aufgaben geht. (Episode 281, 20:12-21:34)

Roddi: Nein, das sehe ich anders. Wenn man nicht das Grundprinzip versteht, kann man auch nicht die Implikationen verstehen. (Episode 281, 21:35-23:15)
```

**Probleme**:
- Jeder Satz hat eine Zitation
- Perfekt balancierte Turns
- Zu formal ("Das ist sehr vereinfacht dargestellt")
- Klingt wie ein Skript

### Nachher (Natürlich)

```
Tim: Also, Bitcoin Mining... das ist im Grunde so, dass Computer irgendwie komplexe Mathe-Aufgaben lösen müssen. Riesiger Rechenvorrat halt.

Roddi: Ja ne, moment, das ist zu simpel! Es geht ja vor allem um die Sicherheit vom ganzen Netzwerk (Episode 281, 17:20-19:45). Die validieren da ja auch Transaktionen...

Tim: Ja gut, aber...

Roddi: Nee nee, hör mal zu – wenn man das Grundprinzip nicht checkt, versteht man auch nicht was das eigentlich bedeutet.

Tim: Okay, stimmt schon. Aber ich find's trotzdem wichtig, dass Leute erstmal verstehen, dass da Rechenpower im Spiel ist (Episode 281, 12:38-17:19). Dann kann man die Details immer noch erklären.
```

**Verbesserungen**:
- ✅ Natürliche Füllwörter ("also", "irgendwie", "halt")
- ✅ Unterbrechungen ("Ja ne, moment")
- ✅ Ungleiche Längen
- ✅ Weniger Zitate, dafür gezielter platziert
- ✅ Reaktionen ("stimmt schon")
- ✅ Informeller Ton

---

## Implementation Details

### Frontend Changes

**File**: `frontend/src/views/SearchView.vue`

```typescript
const renderMarkdownWithLinks = (text: string): string => {
  let html = marked.parse(text, { breaks: true, gfm: true }) as string;
  
  // Enhanced regex pattern for episode references
  const episodePattern = /\((Episode|Ep\.?)\s+(\d+),\s+([\d:]+)(?:-[\d:]+)?\)/gi;
  
  html = html.replace(episodePattern, (match, _prefix, episodeNum, startTime) => {
    const episodeNumber = parseInt(episodeNum, 10);
    const seconds = hmsToSeconds(startTime);
    if (!Number.isFinite(episodeNumber) || seconds === null) return match;
    
    return `<a href="#" class="episode-link text-blue-600 dark:text-blue-400 hover:underline font-medium" data-episode="${episodeNumber}" data-time="${seconds}">${match}</a>`;
  });
  
  return html;
};
```

### Backend Changes

**File**: `src/rag/embeddings.rs`

Komplette Überarbeitung des System-Prompts:
- Fokus auf "NATURAL, RELAXED DISCUSSION"
- Neue Sektion "CONVERSATION STYLE - MAKE IT NATURAL"
- 8 konkrete Regeln für natürlichen Gesprächsfluss
- Attribution-Regeln beibehalten (aus vorherigem Fix)

---

## Testing

### Test-Cases für Zeitmarken

Teste, ob folgende Formate klickbar sind:

1. `(Episode 123, 12:34-56:78)` ✅
2. `(Episode 123, 12:34)` ✅
3. `(Ep. 123, 12:34-56:78)` ✅
4. `(Ep 123, 12:34)` ✅

### Test-Cases für Natürlichkeit

Prüfe in generierten Dialogen:

- [ ] Sind Turns unterschiedlich lang?
- [ ] Gibt es natürliche Unterbrechungen?
- [ ] Werden Füllwörter aus Profilen verwendet?
- [ ] Gibt es Ellipsen (...)?
- [ ] Nicht jeder Satz hat Zitat?
- [ ] Klingen die Sprecher wie ihre Profile?
- [ ] Gibt es Reaktionen/Agreements?
- [ ] Ist die Sprache casual, nicht formal?

---

## Build & Deploy

```bash
# Backend neu kompilieren
cd /Users/dominik/Projects/freakshow
cargo build --release

# Frontend neu bauen
cd frontend
npm run build

# Backend neu starten
pkill -f rag-backend
cargo run --release --bin rag-backend

# Optional: Dev-Server für Frontend-Tests
cd frontend
npm run dev
```

---

## Weitere Optimierungsmöglichkeiten

Falls die Konversationen immer noch zu gestelzt wirken:

### 1. Temperature erhöhen

```rust
temperature: 0.2  // aktuell
temperature: 0.3  // für mehr Kreativität
```

**Pro**: Mehr Variation, natürlicher  
**Contra**: Weniger deterministisch, könnte Attribution verschlechtern

### 2. Few-Shot Examples hinzufügen

Dem Prompt 1-2 Beispiel-Dialoge hinzufügen, die den gewünschten Stil zeigen.

### 3. Post-Processing

Text nach LLM-Generierung weiter informalisieren:
- "Ich finde" → "Ich find's"
- "Das ist" → "Das ist ja"
- Mehr Füllwörter einfügen

### 4. Speaker-Profile verbessern

Sicherstellen, dass Profile genug Beispiele für informelle Sprache enthalten.

---

## Metrics

Nach Deployment zu beobachten:

- **Klickrate auf Zeitmarken**: Sollte steigen
- **User-Feedback zur Natürlichkeit**: Sollte positiver werden
- **Durchschnittliche Dialog-Länge**: Sollte variieren (nicht konstant)
- **Anzahl Citations pro 100 Wörter**: Sollte sinken (von ~15 auf ~8-10)

---

## Changelog

### 2026-01-12 - v2
- Erweiterte Zeitmarken-Erkennung (Ep., Ep)
- Komplett überarbeiteter Prompt für natürlichere Konversationen
- Dokumentation erstellt

### 2026-01-12 - v1
- Initial Attribution Fix (siehe DISCUSSION-ATTRIBUTION-FIX.md)
