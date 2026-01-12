# Speaker Profile Generation - Improved Prompting System

## Überblick

Die Speaker-Profil-Generierung wurde komplett überarbeitet und folgt jetzt einem strukturierten Prompt-Schema, das sich an professionellen Kommunikationsstrategien orientiert.

## Neue Prompt-Struktur

### Inspiration

Das neue System basiert auf dem folgenden Prompt-Schema für Stilanalyse:

```
Rolle:
Du bist Linguist, Kommunikationsstratege und Stilanalyst.
Deine Aufgabe ist es, aus Transkripten ein präzises Sprecherprofil zu erstellen,
das später genutzt werden kann, um neue Texte im Stil dieser Person zu generieren.

Analysiere insbesondere:
• Tonfall (formell, locker, motivierend, kritisch, humorvoll)
• Satzstruktur (kurz/lang, einfach/verschachtelt)
• Wortwahl (Alltagssprache, Fachsprache, Anglizismen, Metaphern)
• Typische Formulierungen & wiederkehrende Phrasen
• Umgang mit Fragen, Beispielen, Emotionen, Direktheit
• Haltung & Persona (Coach, Experte, Visionär, Kritiker)
```

## Verbesserungen

### 1. Chunk-Analyse (Phase 1)

#### Vorher
- Fokus auf linguistische Merkmale
- Weniger Kontext zur Verwendung

#### Nachher
- **Rollenbasiert**: Linguist, Kommunikationsstratege, Stilanalyst
- **Klare Verwendung**: "für Textgenerierung geeignet"
- **Erweiterte Kategorien**:
  - Umgang mit Fragen
  - Umgang mit Beispielen & Geschichten
  - Vorlieben und Abneigungen
  - Emotionale Range
  - Direktheit/Klarheit

**Neue JSON-Felder**:
```javascript
{
  // ... bestehende Felder ...
  "questions_usage": string,      // Wie werden Fragen eingesetzt?
  "examples_usage": string,        // Nutzung von Anekdoten/Beispielen
  "emotional_range": string,       // Emotionale Ausdrucksstärke
  "directness": string            // Grad der Direktheit
}
```

### 2. Final-Profile-Synthese (Phase 2)

#### Neues Output-Schema

Das generierte Profil folgt jetzt einem 5-Punkte-Format:

```javascript
{
  "speaker": string,
  "confidence": string,
  
  // 1. Kurzcharakteristik (5-7 Sätze)
  "short_characterization": string,
  
  // 2. Stil-DNA (strukturiert)
  "style_dna": {
    "tone": string[],
    "register": string,
    "sentence_structure": string[],
    "word_choice": string[],
    "rhythm": string,
    "typical_devices": string[]
  },
  
  // 3. Do / Don't Liste
  "do_list": string[],
  "dont_list": string[],
  
  // 4. Typische Phrasen
  "typical_phrases": string[],  // 10-20 Phrasen
  
  // 5. Prompt für Textgenerierung
  "generation_system_prompt": string,
  
  // Detaillierte Referenz-Daten
  "language": string,
  "vocabulary": { ... },
  "discourse_markers": string[],
  "humor_and_devices": string[],
  "interaction_playbook": {
    "questions": string,
    "examples_stories": string,
    "emotions": string,
    "directness": string
  },
  "attitude_and_persona": string[],
  "tics": string[],
  "example_lines": string[]
}
```

## Markdown-Output-Format

### Hauptstruktur (für LLM-Nutzung optimiert)

```markdown
# Speaker Profile: [Name]

## Data coverage
- Episodes: X
- Utterances: Y
- Words: Z
- Confidence: hoch/mittel/niedrig

## 1. Kurzcharakteristik
[5-7 Sätze Fließtext über die Stimme/den Stil]

## 2. Stil-DNA
### Ton
- ...

### Sprachregister
...

### Satzbau
- ...

### Wortwahl
- ...

### Rhythmus
...

### Typische Mittel
- ...

## 3. Do / Don't Liste
### ✅ Do (Dinge, die der Stil nutzt)
- ...

### ❌ Don't (Dinge, die vermieden werden)
- ...

## 4. Typische Phrasen
- "..."
- "..."

## 5. Prompt für Textgenerierung
### System Prompt
```
[Fertiger System-Prompt für LLM]
```

---

## Detaillierte Analyse (Referenz)
[Alle zusätzlichen Details für tiefere Analyse]
```

## Verwendung

### Profil generieren

```bash
# Für einen einzelnen Sprecher
node scripts/generate-speaker-profiles.js --speaker "Tim Pritlove"

# Mit benutzerdefinierten Parametern
node scripts/generate-speaker-profiles.js \
  --speaker "Tim Pritlove" \
  --chunk-chars 20000 \
  --max-chunks 10 \
  --force
```

### Profile für Discussion Mode nutzen

Die generierten Profile sind jetzt optimal für den Discussion Mode vorbereitet, da sie:

1. **Konkrete System-Prompts** enthalten (`generation_system_prompt`)
2. **Do/Don't Listen** für klare Stil-Guidance bieten
3. **Typische Phrasen** für authentische Sprache liefern
4. **Interaktionsmuster** (Fragen, Beispiele, Emotionen) dokumentieren

## Vorteile des neuen Systems

### 1. Klarere Struktur
- **5-Punkte-Format** ist übersichtlich und fokussiert
- **Trennung** zwischen Hauptprofil (für LLM) und Referenzdaten

### 2. Bessere LLM-Integration
- **Fertiger System-Prompt** kann direkt verwendet werden
- **Do/Don't Listen** geben klare Regeln
- **Typische Phrasen** ermöglichen authentische Mimikry

### 3. Umfassendere Analyse
- **Umgang mit Fragen** wird explizit analysiert
- **Beispiel-Nutzung** wird dokumentiert
- **Emotionale Range** wird erfasst
- **Direktheit** wird gemessen

### 4. Professionalität
- **Rollenbasierter Prompt** (Linguist, Stilanalyst)
- **Klarer Verwendungszweck** (Textgenerierung)
- **Strukturiertes Output** für bessere Nachvollziehbarkeit

## Backward Compatibility

Das neue Format ist **abwärtskompatibel** mit dem alten System:

- Alte Felder (`one_line_essence`, `style_fingerprint`, etc.) werden als Fallback verwendet
- Rendering-Funktion erkennt automatisch alte vs. neue Profile
- Bestehende Profile funktionieren weiterhin

## Migration

### Bestehende Profile aktualisieren

```bash
# Einzelnen Sprecher neu generieren
node scripts/generate-speaker-profiles.js --speaker "Tim Pritlove" --force

# Alle Sprecher neu generieren
node scripts/generate-speaker-profiles.js --force
```

**Empfehlung**: Profile nach und nach neu generieren, wenn:
- Discussion Mode genutzt wird
- Bessere Stil-Mimikry gewünscht ist
- Neue Interaktionsmuster erfasst werden sollen

## Beispiel-Vergleich

### Altes Format

```markdown
## Essence
Ein analytischer, humorvoller Sprecher

## Style fingerprint
- verwendet häufig Füllwörter
- zeigt kritische Haltung

## Prompting recipe for imitation
### System prompt
```
You are roleplaying as Tim Pritlove...
```
```

### Neues Format

```markdown
## 1. Kurzcharakteristik
Tim Pritlove ist ein analytischer und kritischer Sprecher, der komplexe 
technische Themen in einem lockeren, gesprächigen Stil behandelt. Seine 
Sprache ist von häufigen Füllwörtern ("also", "ja", "ne") durchzogen, 
was seiner Ausdrucksweise Authentizität verleiht. Er nutzt oft rhetorische 
Fragen und Ironie, um Punkte zu unterstreichen, und verbindet persönliche 
Anekdoten geschickt mit sachlichen Erklärungen.

## 2. Stil-DNA
### Ton
- locker und gesprächig
- kritisch-analytisch
- humorvoll mit Ironie

### Satzbau
- häufig lange, verschachtelte Sätze mit Einschüben
- gelegentlich abgebrochene Gedanken
- kurze prägnante Aussagen zur Betonung

## 3. Do / Don't Liste
### ✅ Do
- Beginne Sätze mit "Also", "Ja", "Ne"
- Nutze rhetorische Fragen
- Verwende persönliche Anekdoten
- Zeige kritische Distanz mit Ironie

### ❌ Don't
- Verwende keine Schimpfwörter
- Vermeide zu formelle Sprache
- Keine übertrieben emotionale Ausdrucksweise

## 4. Typische Phrasen
- "Also, das ist ja..."
- "Ja ne, aber..."
- "Das heißt..."
- "Irgendwie..."
- "So gesehen..."

## 5. Prompt für Textgenerierung
```
Du sprichst im Stil von Tim Pritlove: locker, analytisch und kritisch.
Beginne Sätze oft mit "also", "ja" oder "ne". Nutze verschachtelte Sätze
mit Einschüben. Verwende rhetorische Fragen und trockenen Humor...
```
```

## Testing

Nach der Generierung eines neuen Profils:

1. **Vollständigkeit prüfen**: Sind alle 5 Haupt-Sektionen gefüllt?
2. **System-Prompt testen**: Generiert er authentische Texte?
3. **Discussion Mode testen**: Klingen Dialoge natürlich?

## Bekannte Limitierungen

- **LLM-abhängig**: Qualität hängt vom verwendeten Modell ab
- **Daten-Menge**: Mindestens 50k Wörter für gute Ergebnisse empfohlen
- **JSON-Parsing**: Manche LLMs haben Probleme mit exaktem JSON-Format

## Weitere Ressourcen

- [SPEAKER-PROFILES.md](./SPEAKER-PROFILES.md) - Allgemeine Dokumentation
- [DISCUSSION-MODE.md](./DISCUSSION-MODE.md) - Nutzung im Discussion Mode
- [REGENERATE-PROFILES.md](./REGENERATE-PROFILES.md) - Profil-Regenerierung

## Changelog

### 2026-01-12 - v2.0 (Improved Prompting)
- Rollenbasierte Prompts (Linguist, Stilanalyst)
- Neues 5-Punkte-Output-Format
- Erweiterte Interaktionsanalyse
- Strukturiertes Stil-DNA-Schema
- Do/Don't Listen
- Typische-Phrasen-Sammlung
- Fertiger Generation-System-Prompt

### 2025-12-30 - v1.0 (Original)
- Grundlegende Profil-Generierung
- Chunk-basierte Analyse
- Markdown-Output
