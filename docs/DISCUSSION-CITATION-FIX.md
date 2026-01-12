# Discussion Mode - Citation Fix (2026-01-12)

## Problem

Nach den Verbesserungen zur natürlicheren Konversation waren die Episode-Referenzen mit Zeitmarken verloren gegangen. Die Instruktion "Add citations naturally, not in every sentence" wurde vom LLM falsch interpretiert als "Citations sind optional".

## Lösung

Klarere, zwingendere Formulierung der Citation-Regeln im Prompt.

### Vorher (zu vage)

```rust
"- Add citations naturally, not in every sentence: (Episode 281, 12:38-17:19)"
```

**Problem**: 
- Zu vage formuliert
- "not in every sentence" klingt wie "du kannst sie weglassen"
- Kein klarer Unterschied zwischen wann Citations nötig sind und wann nicht

### Nachher (klar und zwingend)

```rust
"CITATIONS - MANDATORY BUT NATURAL:\n\
- ALWAYS cite sources when making factual claims: (Episode 281, 12:38-17:19)\n\
- Citations are REQUIRED for facts, data, or specific information from transcripts\n\
- Place citations at the end of statements, not after every phrase\n\
- Short reactions or agreements don't need citations (\"Ja genau\", \"Stimmt schon\")\n\
- But any substantive point MUST be cited"
```

**Verbesserungen**:
- ✅ Eigene Sektion "CITATIONS - MANDATORY BUT NATURAL"
- ✅ Klare Regel: "ALWAYS cite" und "REQUIRED"
- ✅ Konkrete Beispiele wann KEINE Citation nötig ist (Reactions)
- ✅ Wiederholung: "substantive point MUST be cited"
- ✅ Format-Reminder bleibt erhalten

### User-Prompt Verstärkung

Zusätzlich im User-Prompt ergänzt:

```rust
"- ALWAYS include episode citations in format: (Episode 123, 12:34-56:78) when stating facts"
```

**Vorteil**: Wiederholung der Citation-Pflicht näher an den eigentlichen Sources.

## Beispiel-Vergleich

### Falsch (nach erstem Fix, ohne Citations)

```
Tim: Also, Bitcoin Mining... das ist im Grunde so ein riesiger Rechenvorrat halt.

Roddi: Ja ne, moment! Das ist zu simpel. Es geht vor allem um die Sicherheit vom Netzwerk...

Tim: Okay, stimmt schon.
```

❌ **Problem**: Keine Episode-Referenzen, nicht nachvollziehbar

### Richtig (nach Citation-Fix)

```
Tim: Also, Bitcoin Mining... das ist im Grunde so ein riesiger Rechenvorrat halt (Episode 281, 12:38-17:19).

Roddi: Ja ne, moment! Das ist zu simpel. Es geht vor allem um die Sicherheit vom Netzwerk (Episode 281, 17:20-19:45)...

Tim: Okay, stimmt schon.
```

✅ **Korrekt**: 
- Faktische Aussagen haben Citations
- Kurze Reaktionen ("Okay, stimmt schon") brauchen keine
- Format ist klickbar
- Konversation bleibt natürlich

## Implementation

**Datei**: `src/rag/embeddings.rs`

**Geänderte Zeilen**: 99-116

```rust
let system = format!(
    "You are orchestrating a NATURAL, RELAXED DISCUSSION between two people with the following profiles. \
    Create an authentic conversation where they discuss the topic based ONLY on the provided SOURCES.\n\n\
    SPEAKER 1 ({}):\n{}\n\n\
    SPEAKER 2 ({}):\n{}\n\n\
    CRITICAL RULES FOR ATTRIBUTION:\n\
    - Each speaker can ONLY use information from their OWN transcript lines in the SOURCES\n\
    - When {} speaks, use ONLY lines marked with '{}: ...'\n\
    - When {} speaks, use ONLY lines marked with '{}: ...'\n\
    - NEVER mix up who said what - check the speaker label in the transcript carefully\n\
    - If a speaker doesn't have relevant information in their lines, have them acknowledge this or ask the other speaker\n\
    - Each speaker's arguments must be based on what THEY actually said in the transcripts, not what the other person said\n\n\
    CONVERSATION STYLE - MAKE IT NATURAL:\n\
    - Write as if this is a REAL, spontaneous conversation between friends\n\
    - Use casual, flowing language - avoid overly formal or structured speech\n\
    - Let speakers interrupt, overlap, or build on each other's thoughts naturally\n\
    - Include natural discourse markers from their profiles (\"also\", \"ja\", \"ne\", etc.)\n\
    - Don't make every turn too balanced - some responses can be short, others longer\n\
    - Let the conversation flow organically - not every point needs a counter-point\n\
    - Use ellipses (...) for trailing thoughts or interruptions\n\
    - Include reactions like agreements, laughter references, or brief acknowledgments\n\
    - Stay in character with each speaker's unique personality, vocabulary, and humor style\n\
    - Format: Simply use speaker names followed by colon (e.g., '{}: <text>')\n\n\
    CITATIONS - MANDATORY BUT NATURAL:\n\
    - ALWAYS cite sources when making factual claims: (Episode 281, 12:38-17:19)\n\
    - Citations are REQUIRED for facts, data, or specific information from transcripts\n\
    - Place citations at the end of statements, not after every phrase\n\
    - Short reactions or agreements don't need citations (\"Ja genau\", \"Stimmt schon\")\n\
    - But any substantive point MUST be cited\n\
    - Answer in German unless the user asks otherwise",
    name1, profile1, name2, profile2, name1, name1, name2, name2, name1
);
```

## Balance zwischen Natürlichkeit und Citations

Die neue Formulierung findet die richtige Balance:

| Aussage-Typ | Citation nötig? | Beispiel |
|-------------|----------------|----------|
| Faktische Aussage | ✅ JA | "Bitcoin Mining verbraucht viel Strom" (Episode 281, 12:34) |
| Spezifische Info | ✅ JA | "Das waren 2021 etwa 150 TWh" (Episode 281, 15:20) |
| Kurze Zustimmung | ❌ NEIN | "Ja genau" |
| Kurzes Reaction | ❌ NEIN | "Stimmt schon" |
| Unterbrechung | ❌ NEIN | "Moment mal..." |
| Gegenfrage | ❌ NEIN | "Wirklich?" |
| Substantive Antwort | ✅ JA | "Das liegt an der Proof-of-Work Methode" (Episode 281, 18:45) |

## Testing

### Test-Case 1: Faktische Diskussion

**Frage**: "Wie funktioniert Bitcoin Mining?"

**Erwartung**: 
- Jede substanzielle Erklärung hat Citation
- Kurze Reactions wie "Ja", "Stimmt" haben keine
- Format: `(Episode 123, 12:34-56:78)`

### Test-Case 2: Kontroverses Thema

**Frage**: "Was denkt ihr über Corona-Maßnahmen?"

**Erwartung**:
- Jede Position/Meinung hat Citation
- Zustimmung/Ablehnung ohne neue Info braucht keine
- Citations sollten klickbar sein

### Test-Case 3: Technisches Thema

**Frage**: "Erklärt mir Quantencomputer"

**Erwartung**:
- Technische Details haben Citations
- "Das ist kompliziert" braucht keine
- Beispiele und Zahlen haben Citations

## Build & Deploy

```bash
# Backend neu kompilieren
cd /Users/dominik/Projects/freakshow
cargo build --release

# Backend neu starten
pkill -f rag-backend
cargo run --release --bin rag-backend
```

## Metrics nach Deployment

Zu beobachten:

- **Citation-Rate**: ~30-50% der Turns sollten Citations haben
- **Klickrate auf Citations**: Sollte hoch sein (alle Citations sollten klickbar sein)
- **Natürlichkeit**: Sollte trotz Citations erhalten bleiben
- **Attribution-Korrektheit**: Sollte weiterhin korrekt sein

## Changelog

### 2026-01-12 - Citation Fix
- Neue Sektion "CITATIONS - MANDATORY BUT NATURAL"
- Klarere Regeln wann Citations nötig sind
- Beispiele für Citation-freie Aussagen
- User-Prompt Verstärkung

### 2026-01-12 - v2 (Improvements)
- Natürlichere Konversationen
- Erweiterte Zeitmarken-Erkennung

### 2026-01-12 - v1 (Attribution Fix)
- Initiale Attribution-Korrektur
- Sprecher-Trennung verbessert

## Verwandte Dokumente

- [DISCUSSION-MODE.md](./DISCUSSION-MODE.md) - Allgemeine Übersicht
- [DISCUSSION-ATTRIBUTION-FIX.md](./DISCUSSION-ATTRIBUTION-FIX.md) - Attribution-Fix Details
- [DISCUSSION-MODE-IMPROVEMENTS.md](./DISCUSSION-MODE-IMPROVEMENTS.md) - Natürlichkeits-Verbesserungen
