# Speaker Profile Generation - Podcast Parameter

## Überblick

Das `generate-speaker-profiles.js` Script unterstützt jetzt den `--podcast` Parameter, um Profile für verschiedene Podcasts zu generieren.

## Verwendung

### Basis-Syntax

```bash
node scripts/generate-speaker-profiles.js --podcast <podcast-id> [weitere-optionen]
```

### Verfügbare Podcasts

Basierend auf dem `podcasts/` Verzeichnis:

- `freakshow` (Standard)
- `ukw`
- `lnp`
- `cre`
- `raumzeit`
- `forschergeist`
- `das-universum`
- `minkorrekt`
- `wrint-wissenschaft`

## Beispiele

### 1. Profile für einen bestimmten Podcast generieren

```bash
# UKW Podcast
node scripts/generate-speaker-profiles.js --podcast ukw

# Logbuch Netzpolitik
node scripts/generate-speaker-profiles.js --podcast lnp

# CRE Podcast
node scripts/generate-speaker-profiles.js --podcast cre
```

### 2. Bestimmten Sprecher in einem Podcast

```bash
# Tim Pritlove im UKW Podcast
node scripts/generate-speaker-profiles.js --podcast ukw --speaker "Tim Pritlove"

# Linus Neumann im LNP
node scripts/generate-speaker-profiles.js --podcast lnp --speaker "Linus Neumann"
```

### 3. Force-Regenerierung

```bash
# Alle Profile für UKW neu generieren
node scripts/generate-speaker-profiles.js --podcast ukw --force

# Einzelnen Sprecher neu generieren
node scripts/generate-speaker-profiles.js --podcast ukw --speaker "Tim Pritlove" --force
```

### 4. Top N Sprecher

```bash
# Nur die 3 Sprecher mit den meisten Wörtern in Raumzeit
node scripts/generate-speaker-profiles.js --podcast raumzeit --limit-speakers 3

# Top 5 im Forschergeist
node scripts/generate-speaker-profiles.js --podcast forschergeist --limit-speakers 5
```

### 5. Alle Sprecher für alle Podcasts

```bash
# Bash-Loop über alle Podcasts
for podcast in freakshow ukw lnp cre raumzeit forschergeist das-universum minkorrekt wrint-wissenschaft; do
  echo "Processing $podcast..."
  node scripts/generate-speaker-profiles.js --podcast $podcast
done
```

### 6. Mit benutzerdefinierten Parametern

```bash
# UKW mit größeren Chunks und mehr Chunks
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --chunk-chars 20000 \
  --max-chunks 10 \
  --speaker "Tim Pritlove"
```

## Verzeichnisstruktur

Der `--podcast` Parameter setzt automatisch die korrekten Pfade:

```
podcasts/
  <podcast-id>/
    episodes/           # Transkripte werden hier gelesen
      123-ts.json
      124-ts.json
      ...
    speakers/           # Profile werden hier geschrieben
      tim-pritlove.md
      tim-pritlove-meta.json
      .cache/           # LLM-Antworten werden hier gecacht
        chunk-*.json
        profile-*.json
```

### Beispiel für UKW

```bash
node scripts/generate-speaker-profiles.js --podcast ukw
```

Liest von: `podcasts/ukw/episodes/*-ts.json`  
Schreibt nach: `podcasts/ukw/speakers/*.md`  
Cache: `podcasts/ukw/speakers/.cache/`

## Standard-Werte

Wenn `--podcast` nicht angegeben wird:

- **Standard**: `freakshow`
- Episodes: `podcasts/freakshow/episodes/`
- Output: `podcasts/freakshow/speakers/`

## Vollständige Optionen

```bash
node scripts/generate-speaker-profiles.js --help
```

Zeigt alle verfügbaren Optionen:

```
Options:
  --podcast <id>             Podcast ID (default: freakshow)
  --episodes-dir <dir>       Episodes directory (überschreibt Standard)
  --out-dir <dir>            Output directory (überschreibt Standard)
  --cache-dir <dir>          Cache directory (überschreibt Standard)
  --speaker <name>           Nur diesen Sprecher verarbeiten
  --speaker-regex <pattern>  Nur Sprecher die dem Regex entsprechen
  --limit-speakers <n>       Nur die ersten N Sprecher (nach Wortanzahl)
  --force, -f                Neu generieren auch wenn Cache aktuell ist
  --chunk-chars <n>          Chunk-Größe (default: 16000)
  --max-chunks <n>           Maximale Anzahl Chunks (default: 8)
  --min-words <n>            Minimum Wörter pro Sprecher (default: 800)
  --no-llm                   Nur Stats extrahieren, kein LLM
  --dry-run                  Nur anzeigen was gemacht würde
```

## Workflow: Alle Podcasts aktualisieren

### Schritt 1: Überblick verschaffen

```bash
# Zeige Sprecher für jeden Podcast
for podcast in freakshow ukw lnp cre; do
  echo "=== $podcast ==="
  node scripts/generate-speaker-profiles.js --podcast $podcast --no-llm
done
```

### Schritt 2: Profile für spezifische Podcasts generieren

```bash
# UKW komplett
node scripts/generate-speaker-profiles.js --podcast ukw

# LNP nur Top-Sprecher
node scripts/generate-speaker-profiles.js --podcast lnp --limit-speakers 5
```

### Schritt 3: Force-Update bei Änderungen

Wenn du das Prompt-System aktualisiert hast:

```bash
# Alle Profile für UKW neu generieren
node scripts/generate-speaker-profiles.js --podcast ukw --force

# Oder nur bestimmte Sprecher
node scripts/generate-speaker-profiles.js --podcast ukw --speaker "Tim Pritlove" --force
```

## Tipps

### 1. Cache-Verwaltung

Der Cache ist podcast-spezifisch:

```bash
# Cache für UKW löschen (erzwingt komplette Neu-Generierung)
rm -rf podcasts/ukw/speakers/.cache/

# Dann neu generieren
node scripts/generate-speaker-profiles.js --podcast ukw
```

### 2. Dry-Run Test

Teste ohne Dateien zu schreiben:

```bash
node scripts/generate-speaker-profiles.js --podcast ukw --dry-run
```

### 3. Progressiv arbeiten

Generiere zuerst nur Stats:

```bash
# Phase 1: Stats ohne LLM
node scripts/generate-speaker-profiles.js --podcast ukw --no-llm
```

Dann die wichtigsten Sprecher:

```bash
# Phase 2: Top 3 Sprecher
node scripts/generate-speaker-profiles.js --podcast ukw --limit-speakers 3
```

Dann alle:

```bash
# Phase 3: Alle
node scripts/generate-speaker-profiles.js --podcast ukw
```

## Fehlerbehebung

### Podcast nicht gefunden

```
❌ Keine *-ts.json Dateien gefunden.
```

**Lösung**: Prüfe ob `podcasts/<podcast-id>/episodes/` existiert und Transkripte enthält

```bash
ls -la podcasts/ukw/episodes/*.json | head
```

### Verzeichnis existiert nicht

Erstelle die Struktur:

```bash
mkdir -p podcasts/ukw/episodes
mkdir -p podcasts/ukw/speakers
```

### Settings fehlt

```
❌ settings.json not found
```

**Lösung**: Kopiere `settings.example.json` zu `settings.json` und fülle die LLM-Config aus

```bash
cp settings.example.json settings.json
# Dann editiere settings.json
```

## Integration mit Discussion Mode

Nach der Profil-Generierung kannst du die Sprecher im Discussion Mode nutzen:

```bash
# 1. Profile generieren
node scripts/generate-speaker-profiles.js --podcast ukw

# 2. Backend starten
cargo run --release --bin rag-backend

# 3. Im Frontend: Wähle UKW als Podcast, dann zwei Sprecher für Discussion
```

Die generierten Profile in `podcasts/ukw/speakers/` werden automatisch vom Backend geladen.

## Siehe auch

- [SPEAKER-PROFILES-V2.md](./SPEAKER-PROFILES-V2.md) - Neues Prompt-System
- [SPEAKER-PROFILES.md](./SPEAKER-PROFILES.md) - Allgemeine Dokumentation
- [DISCUSSION-MODE.md](./DISCUSSION-MODE.md) - Nutzung der Profile
