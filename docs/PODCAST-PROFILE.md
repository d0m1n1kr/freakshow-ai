# Podcast Profile Feature

## Überblick

Zusätzlich zu individuellen Sprecher-Profilen kann jetzt ein **Podcast-Profil** generiert werden, das den übergreifenden Charakter, Stil und die Dynamik eines Podcasts erfasst.

## Motivation

Während Sprecher-Profile individuelles Verhalten erfassen, fehlt oft der **Podcast-Kontext**:
- Wie interagieren die Sprecher miteinander?
- Welche Gesprächsdynamik ist typisch?
- Gibt es Running Gags oder wiederkehrende Elemente?
- Was ist der Ton und die Atmosphäre?
- Für welche Zielgruppe ist der Podcast?

Das **Podcast-Profil** ergänzt die Sprecher-Profile und macht generierte Diskussionen authentischer.

## Features

### Was wird erfasst?

1. **Podcast-Charakter**: Einzigartige Eigenschaften
2. **Gesprächsdynamik**: Interaktionsstil, Flow, Gruppen-Chemie
3. **Ton & Atmosphäre**: Formell/informell, Humor-Stil, Pacing
4. **Typische Themen**: Hauptfokusse des Podcasts
5. **Format-Eigenheiten**: Running Gags, wiederkehrende Elemente, Signature Phrases
6. **Zielgruppe**: Ansprache, Kommunikationsstil, angenommenes Vorwissen
7. **Unique Selling Points**: Was unterscheidet diesen Podcast?
8. **Diskussions-Guidelines**: Regeln für authentische LLM-generierte Diskussionen

## Verwendung

### Profil generieren

```bash
# Für freakshow
node scripts/generate-podcast-profile.js --podcast freakshow

# Für UKW mit mehr Episoden
node scripts/generate-podcast-profile.js --podcast ukw --max-episodes 20

# Force-Regenerierung
node scripts/generate-podcast-profile.js --podcast lnp --force
```

### Parameter

```
--podcast <id>             Podcast ID (default: freakshow)
--episodes-dir <dir>       Episodes directory (überschreibt Standard)
--out-dir <dir>            Output directory (überschreibt Standard)
--max-episodes <n>         Anzahl zu sampelnder Episoden (default: 15)
--max-excerpt-chars <n>    Max Zeichen pro Episode (default: 8000)
--force, -f                Neu generieren auch wenn Cache existiert
--dry-run                  Nur anzeigen was gemacht würde
--help, -h                 Hilfe anzeigen
```

### Output

Das Profil wird gespeichert als:
- `podcasts/<podcast-id>/podcast-profile.md` - Markdown-Profil
- `podcasts/<podcast-id>/.podcast-profile-cache.json` - Cache

## Profil-Struktur

### Markdown-Format

```markdown
# Podcast Profile: Freakshow

## Metadaten
- Podcast ID: freakshow
- Episoden analysiert: 15
- Sprecher: 8

## Charakterzusammenfassung
[3-5 Sätze über den einzigartigen Charakter]

## Gesprächsdynamik
### Interaktionsstil
- Locker und freundschaftlich
- Viel Overlap und gegenseitige Unterbrechungen

### Typischer Gesprächsfluss
- Starts mit News/Aktuellem
- Schweift gerne ab
- Kommt auf den Punkt zurück

### Gruppen-Chemie
Langjährige Freundschaft, viel Inside-Humor

## Ton & Atmosphäre
### Primärer Ton
- Informell
- Humorvoll
- Tech-fokussiert

### Humor-Stil
Trockener Humor, Wortspiele, Meta-Kommentare

## Typische Themen
- Technologie und Gadgets
- Apple-Produkte
- Privacy und Security
- Netzpolitik

## Format-Eigenheiten
### Running Gags
- "Das ist ja noch gar nicht raus!"
- Sprachassistenten-Fails

### Signature Phrases
- "Mega"
- "Das ist schon krass"
- "Ich hab da auch was..."

## Zielgruppe
Tech-affine Menschen, angenommenes Vorwissen: hoch

## Diskussions-Guidelines für LLM
- Verwende lockeren, freundschaftlichen Ton
- Erlaube Abschweifungen und Tangenten
- Nutze Inside-Humor und Meta-Kommentare
- Zeige tiefes Tech-Verständnis
```

## Integration in Discussion Mode

Das Podcast-Profil wird **automatisch** in den Discussion Mode integriert:

```rust
// src/handlers/chat.rs
let podcast_profile_path = PathBuf::from(format!("podcasts/{}/podcast-profile.md", podcast_id));
let podcast_profile = if podcast_profile_path.exists() {
    std::fs::read_to_string(&podcast_profile_path).ok()
} else {
    None
};

// Wird an llm_answer übergeben
let answer = llm_answer(
    st, 
    query, 
    &context, 
    speaker_profile.as_deref(),
    speaker2_profile.as_deref(),
    speaker_name.as_deref(),
    speaker2_name.as_deref(),
    podcast_profile.as_deref(),  // ← Podcast-Profil
).await?;
```

### LLM-Prompt-Erweiterung

```rust
// src/rag/embeddings.rs
let podcast_context = if let Some(podcast_prof) = podcast_profile {
    format!("\n\nPODCAST CONTEXT:\n{}\n\n\
            IMPORTANT: Match the overall tone, dynamics, and style of this podcast in your discussion. \
            Use the podcast's typical conversation patterns, humor style, and format quirks.", podcast_prof)
} else {
    String::new()
};
```

## Workflow

### 1. Sprecher-Profile generieren

```bash
# Für alle Top-Sprecher
node scripts/generate-speaker-profiles.js --podcast freakshow --limit-speakers 5
```

### 2. Podcast-Profil generieren

```bash
# Podcast-übergreifendes Profil
node scripts/generate-podcast-profile.js --podcast freakshow
```

### 3. Backend nutzen

```bash
# Backend startet und lädt automatisch beide Profile
cargo run --release --bin rag-backend
```

### 4. Discussion Mode im Frontend

- Wähle Podcast (z.B. Freakshow)
- Wähle zwei Sprecher (z.B. Tim + Roddi)
- Stelle eine Frage
- **Das LLM nutzt nun**:
  - Tim's Sprecher-Profil
  - Roddi's Sprecher-Profil
  - Freakshow's Podcast-Profil

## Beispiel-Vergleich

### Ohne Podcast-Profil

```
Tim: Bitcoin Mining ist interessant (Episode 281, 12:38).

Roddi: Ja, das stimmt. Es gibt verschiedene Aspekte (Episode 281, 15:20).

Tim: Genau, die Sicherheit ist wichtig.
```

❌ **Problem**: Zu generisch, keine Podcast-spezifische Dynamik

### Mit Podcast-Profil

```
Tim: Also, Bitcoin Mining... mega interessant eigentlich. Das ist ja so ein 
riesiger Rechenaufwand (Episode 281, 12:38)...

Roddi: Ja ne, aber moment! Du vereinfachst das zu sehr. Es geht ja auch um 
die Netzwerksicherheit (Episode 281, 15:20). Das ist schon krass, wie...

Tim: Okay okay, stimmt schon. Aber...

Roddi: Nee nee, lass mich mal ausreden! [lacht]
```

✅ **Besser**: Typische Freakshow-Dynamik, Sprache, und Humor

## Wie es funktioniert

### Episode-Sampling

```javascript
// Gleichmäßig über alle Episoden verteilt
function sampleEpisodesEvenly(episodes, maxEpisodes) {
  // Nimmt z.B. 15 Episoden gleichmäßig verteilt
  // Episode 1, 20, 40, 60, ..., letzte Episode
}
```

**Vorteil**: Erfasst Entwicklung über Zeit

### Excerpt-Extraktion

```javascript
// Pro Episode: Anfang, Mitte, Ende
function extractExcerpt(transcript, maxChars) {
  // Nimmt aus jedem Drittel Ausschnitte
  // Total: ~8000 Zeichen pro Episode
}
```

**Vorteil**: Repräsentative Samples statt nur Anfang

### LLM-Analyse

Das LLM erhält:
- Sprecher-Liste
- 15 Episode-Excerpts (je ~8000 chars)
- Instruktionen zur Analyse

Und generiert:
- Strukturiertes JSON mit allen Feldern
- Konkrete Beispiele und Zitate
- Diskussions-Guidelines

## Best Practices

### 1. Nach Sprecher-Profilen generieren

```bash
# Erst Sprecher
node scripts/generate-speaker-profiles.js --podcast freakshow

# Dann Podcast
node scripts/generate-podcast-profile.js --podcast freakshow
```

### 2. Genug Episoden sampeln

```bash
# Mehr Episoden = besseres Profil
node scripts/generate-podcast-profile.js --podcast freakshow --max-episodes 20
```

**Empfehlung**: 
- Kleine Podcasts (< 50 Episoden): `--max-episodes 10`
- Mittlere (50-200): `--max-episodes 15` (Standard)
- Große (> 200): `--max-episodes 20-30`

### 3. Regelmäßig aktualisieren

Podcast-Charakter kann sich über Zeit ändern:

```bash
# Alle 6-12 Monate oder bei großen Änderungen
node scripts/generate-podcast-profile.js --podcast freakshow --force
```

### 4. Für alle Podcasts generieren

```bash
# Loop über alle
for podcast in freakshow ukw lnp cre raumzeit; do
  echo "Generating profile for $podcast..."
  node scripts/generate-podcast-profile.js --podcast $podcast
done
```

## Cache-Verwaltung

### Cache prüfen

```bash
# Zeige Cache-Datei
cat podcasts/freakshow/.podcast-profile-cache.json
```

### Cache löschen

```bash
# Für einen Podcast
rm podcasts/freakshow/.podcast-profile-cache.json

# Für alle
find podcasts -name ".podcast-profile-cache.json" -delete
```

## Troubleshooting

### Profil nicht geladen

**Problem**: Discussion Mode nutzt kein Podcast-Profil

**Lösung**:
```bash
# Prüfe ob Datei existiert
ls -la podcasts/freakshow/podcast-profile.md

# Falls nicht, generiere
node scripts/generate-podcast-profile.js --podcast freakshow

# Backend neu starten
pkill -f rag-backend
cargo run --release --bin rag-backend
```

### Generierung schlägt fehl

**Problem**: LLM-Fehler oder Timeout

**Lösung**:
```bash
# Prüfe settings.json
cat settings.json | grep -A 5 "llm"

# Reduziere Episode-Anzahl
node scripts/generate-podcast-profile.js \
  --podcast freakshow \
  --max-episodes 10 \
  --max-excerpt-chars 6000
```

### Profil zu generisch

**Problem**: Profil erfasst Podcast-Charakter nicht gut

**Lösung**:
```bash
# Mehr Episoden samplen
node scripts/generate-podcast-profile.js \
  --podcast freakshow \
  --max-episodes 25 \
  --force

# Oder: Besseres LLM-Modell in settings.json
```

## Erweiterungen

### Zukünftige Verbesserungen

1. **Co-Host-Dynamiken**: Spezifische Pairings analysieren
2. **Zeitliche Entwicklung**: Wie hat sich der Podcast verändert?
3. **Episode-Typ-Erkennung**: Normal vs. Special vs. Interview
4. **Themen-Cluster**: Welche Themen-Kombinationen sind typisch?
5. **Audio-Merkmale**: Musik, Jingles, Sound-Effekte

### Custom-Felder hinzufügen

Editiere `scripts/generate-podcast-profile.js`:

```javascript
// In podcastProfileMessages() erweitere die JSON-Struktur:
'  "custom_field": string,\n' +
'  "another_field": string[],\n' +
```

Dann in `renderMarkdownProfile()` rendern:

```javascript
lines.push('## Custom Field');
lines.push('');
lines.push(profile.custom_field || '_n/a_');
```

## Siehe auch

- [SPEAKER-PROFILES-V2.md](./SPEAKER-PROFILES-V2.md) - Sprecher-Profile
- [DISCUSSION-MODE.md](./DISCUSSION-MODE.md) - Discussion Mode
- [DISCUSSION-MODE-IMPROVEMENTS.md](./DISCUSSION-MODE-IMPROVEMENTS.md) - Verbesserungen

## Changelog

### 2026-01-12 - v1.0
- Initial Release
- Podcast-Profil-Generierung
- Integration in Discussion Mode
- Automatic Loading im Backend
- Dokumentation
