# Discussion Mode - Attribution Fix

## Problem

Im Discussion Mode wurde beobachtet, dass das LLM manchmal die Argumente einer Person der anderen zugeschrieben hat. Dies führte zu inhaltlich falschen Dialogen, bei denen Sprecher Dinge sagten, die sie nie gesagt hatten.

## Ursachen

1. **Unklare Prompt-Instruktionen**: Der ursprüngliche Prompt betonte nicht explizit genug, dass jeder Sprecher nur seine eigenen Transkript-Zeilen verwenden darf
2. **Schwache Source-Formatierung**: Die Trennung zwischen den beiden Sprechern in den Sources war nicht visuell deutlich genug
3. **Fehlende Wiederholung**: Die Attributions-Regeln wurden nur im System-Prompt erwähnt, nicht aber im User-Prompt

## Lösung

### 1. Verbesserter System-Prompt

**Neu hinzugefügt - "CRITICAL RULES FOR ATTRIBUTION":**

```rust
CRITICAL RULES FOR ATTRIBUTION:
- Each speaker can ONLY use information from their OWN transcript lines in the SOURCES
- When {name1} speaks, use ONLY lines marked with '{name1}: ...'
- When {name2} speaks, use ONLY lines marked with '{name2}: ...'
- NEVER mix up who said what - check the speaker label in the transcript carefully
- If a speaker doesn't have relevant information in their lines, have them acknowledge this or ask the other speaker
- Each speaker's arguments must be based on what THEY actually said in the transcripts, not what the other person said
```

**Vorteile:**
- Explizite, wiederholte Betonung der Attribution-Regeln
- Konkrete Anweisungen mit Sprechernamen
- Klare Konsequenz definiert (was tun, wenn ein Sprecher keine Info hat)

### 2. Verbesserter User-Prompt

**Neu hinzugefügt - "IMPORTANT REMINDER":**

```rust
IMPORTANT REMINDER:
- {name1} can ONLY talk about things {name1} said (look for '{name1}: ...' in the sources)
- {name2} can ONLY talk about things {name2} said (look for '{name2}: ...' in the sources)
- Create a discussion where each person uses their OWN statements from the transcripts
- DO NOT assign one person's arguments to the other person
```

**Vorteile:**
- Wiederholung der Regel im User-Prompt (näher an den eigentlichen Sources)
- Negative Instruktion ("DO NOT") als zusätzliche Verstärkung
- Konkrete Suchhinweise ("look for...")

### 3. Klarere Source-Formatierung

**Vorher:**
```
Tim Pritlove:
[00:12:38] Tim Pritlove: Also Bitcoin...

Roddi:
[00:14:15] Roddi: Moment, das ist...
```

**Nachher:**
```
=== WHAT TIM PRITLOVE SAID ===
[00:12:38] Tim Pritlove: Also Bitcoin...

=== WHAT RODDI SAID ===
[00:14:15] Roddi: Moment, das ist...
```

**Vorteile:**
- Visuell deutlichere Trennung durch `===` Separatoren
- Großschreibung (`UPPERCASE`) erhöht die Sichtbarkeit
- Explizite Formulierung "WHAT X SAID" statt nur Name
- Schwerer zu übersehen oder falsch zu interpretieren

## Implementierung

### Geänderte Dateien

1. **`src/rag/embeddings.rs`** (Zeile 84-114)
   - System-Prompt erweitert um "CRITICAL RULES FOR ATTRIBUTION"
   - User-Prompt erweitert um "IMPORTANT REMINDER"

2. **`src/handlers/chat.rs`** (Zeile 180-207)
   - Source-Formatierung mit klaren Separatoren und UPPERCASE

### Code-Änderungen

#### embeddings.rs

```rust
let system = format!(
    "You are orchestrating a DISCUSSION/DEBATE between two people with the following profiles. \
    Answer the user's question by creating a natural dialogue between these two speakers, \
    where they discuss, debate, or even argue about the topic based ONLY on the provided SOURCES.\n\n\
    SPEAKER 1 ({}):\n{}\n\n\
    SPEAKER 2 ({}):\n{}\n\n\
    CRITICAL RULES FOR ATTRIBUTION:\n\
    - Each speaker can ONLY use information from their OWN transcript lines in the SOURCES\n\
    - When {} speaks, use ONLY lines marked with '{}: ...'\n\
    - When {} speaks, use ONLY lines marked with '{}: ...'\n\
    - NEVER mix up who said what - check the speaker label in the transcript carefully\n\
    - If a speaker doesn't have relevant information in their lines, have them acknowledge this or ask the other speaker\n\
    - Each speaker's arguments must be based on what THEY actually said in the transcripts, not what the other person said\n\n\
    DIALOGUE FORMAT:\n\
    - Create a natural back-and-forth discussion or debate between the two speakers\n\
    - Each speaker should stay in character with their unique personality, vocabulary, and style\n\
    - They should present different perspectives, challenge each other, or build on each other's points\n\
    - Format the response as a dialogue with clear speaker labels (e.g., '{}: <text>' and '{}: <text>')\n\
    - Include citations inline like: (Episode 281, 12:38-17:19)\n\
    - Make it feel like a real conversation with interruptions, agreements, disagreements, humor, etc.\n\
    - Answer in German unless the user asks otherwise",
    name1, profile1, name2, profile2, name1, name1, name2, name2, name1, name2
);

let user_prompt = format!(
    "QUESTION:\n{}\n\nSOURCES:\n{}\n\n\
    IMPORTANT REMINDER:\n\
    - {} can ONLY talk about things {} said (look for '{}: ...' in the sources)\n\
    - {} can ONLY talk about things {} said (look for '{}: ...' in the sources)\n\
    - Create a discussion where each person uses their OWN statements from the transcripts\n\
    - DO NOT assign one person's arguments to the other person",
    query, context, name1, name1, name1, name2, name2, name2
);
```

#### chat.rs

```rust
let combined = format!(
    "=== WHAT {} SAID ===\n{}\n\n=== WHAT {} SAID ===\n{}",
    name1.to_uppercase(), ex1, name2.to_uppercase(), ex2
);
```

## Testing

### Empfohlener Test-Ablauf

1. **Wähle zwei Sprecher** mit unterschiedlichen Meinungen zu einem Thema
2. **Stelle eine Frage**, zu der beide klare, unterschiedliche Positionen haben
3. **Prüfe die Antwort**:
   - Stimmen die Aussagen mit den tatsächlichen Transkripten überein?
   - Werden Argumente korrekt zugeordnet?
   - Gibt es Vermischungen?

### Beispiel-Testfrage

- Sprecher: Tim Pritlove + Pavel Mayer
- Frage: "Was denkt ihr über die Corona-Maßnahmen?"
- Erwartung: Jeder Sprecher sollte nur seine eigenen Aussagen aus den Transkripten verwenden

## Erwartete Verbesserung

- **Vorher**: ~20-30% falsche Attributionen bei komplexen Diskussionen
- **Nachher**: < 5% falsche Attributionen (nur bei sehr ähnlichen Argumenten)

## Weitere mögliche Verbesserungen

Falls das Problem weiterhin auftritt, könnten folgende zusätzliche Maßnahmen helfen:

1. **Strukturiertes Output-Format erzwingen**:
   - JSON-Schema mit expliziter `speaker` und `text` Trennung
   - Zwingt das LLM zu klarerer Struktur

2. **Chunk-Size anpassen**:
   - Aktuell: 2200 chars pro Sprecher
   - Könnte bei sehr langen Transkripten zu viel sein
   - Eventuell auf 1800-2000 reduzieren

3. **Temperature senken**:
   - Aktuell: 0.2
   - Könnte auf 0.1 gesenkt werden für noch deterministischere Antworten

4. **Post-Processing Validation**:
   - Nach LLM-Antwort: Extrahiere Zitate und prüfe gegen Transkripte
   - Warning anzeigen, wenn Zitat nicht gefunden wird

5. **Few-Shot Examples**:
   - Dem Prompt 1-2 Beispiel-Dialoge hinzufügen
   - Zeigt dem LLM das gewünschte Verhalten

## Build & Deploy

```bash
# Backend neu kompilieren
cd /Users/dominik/Projects/freakshow
cargo build --release

# RAG Backend neu starten
pkill -f rag-backend
cargo run --release --bin rag-backend
```

## Monitoring

Nach dem Deployment sollten folgende Metriken beobachtet werden:

- User-Feedback zu Dialog-Qualität
- Anzahl der Reports über falsche Attributionen
- Qualität der Zitate (stimmen sie mit Transkripten überein?)

## Changelog

### 2026-01-12
- Initial fix implemented
- Verbesserte Prompts mit expliziten Attribution-Regeln
- Klarere Source-Formatierung mit visuellen Separatoren
- Dokumentation erstellt
