# Speaker Profile Generation - Performance Optimization

## Überblick

Die Profilgenerierung wurde mit parallelen LLM-Calls optimiert, um die Geschwindigkeit deutlich zu erhöhen.

## Probleme & Lösungen

### Problem 1: Sprecher-Isolierung ✅

**Frage**: Werden nur Texte des jeweiligen Sprechers verwendet?

**Antwort**: ✅ **Ja, vollständig sichergestellt**

**Implementation** (Zeilen 682-709):

```javascript
const speakerMap = new Map();
for (const f of transcriptFiles) {
  const raw = readJson(f.fullPath);
  const transcript = raw?.transcript;
  if (!Array.isArray(transcript)) continue;
  
  for (const t of transcript) {
    const speaker = normalizeSpeakerName(t?.speaker);
    const text = String(t?.text || '').trim();
    const time = String(t?.time || '').trim();
    
    // ✅ Nur Einträge mit Sprecher werden berücksichtigt
    if (!speaker || !text) continue;

    // ✅ Jeder Sprecher bekommt seine eigene Map-Entry
    const entry = speakerMap.get(speaker) || {
      speaker,
      episodes: new Set(),
      utterancesCount: 0,
      totalWords: 0,
      lines: [],  // ← Nur Zeilen DIESES Sprechers
    };
    
    entry.lines.push(time ? `[${f.episodeNumber} @ ${time}] ${text}` : `[${f.episodeNumber}] ${text}`);
    speakerMap.set(speaker, entry);
  }
}
```

**Garantie**: 
- Jeder Transkript-Eintrag hat ein `speaker`-Feld
- Nur Einträge wo `speaker === "Tim Pritlove"` landen in Tim's Profil
- Keine Vermischung zwischen Sprechern möglich

---

### Problem 2: Langsame sequenzielle Verarbeitung ❌ → ✅

**Vorher**: Chunk-Analyse lief sequenziell (1 LLM-Call nach dem anderen)

```javascript
// ❌ LANGSAM - Sequenziell
for (let i = 0; i < chunks.length; i++) {
  const response = await callLLM(...);  // Wartet auf Antwort
  await sleep(delayMs);                  // Wartet zusätzlich
}
// Mit 8 chunks und 3s delay = 24+ Sekunden nur Wartezeit!
```

**Nachher**: Parallele Verarbeitung mit Batching

```javascript
// ✅ SCHNELL - Parallel
const maxConcurrency = 3;  // 3 gleichzeitige Requests

for (let i = 0; i < chunksToProcess.length; i += maxConcurrency) {
  const batch = chunksToProcess.slice(i, i + maxConcurrency);
  
  // Alle 3 Chunks parallel verarbeiten
  const batchPromises = batch.map(async (chunk) => {
    return await callLLM(...);
  });
  
  const results = await Promise.all(batchPromises);
  
  // Nur zwischen Batches warten, nicht zwischen einzelnen Requests
  if (i + maxConcurrency < chunksToProcess.length) {
    await sleep(delayMs);
  }
}
```

## Performance-Verbesserung

### Rechenbeispiel

**Szenario**: 8 Chunks, 5 Sekunden pro LLM-Call, 3 Sekunden Delay

#### Vorher (Sequenziell)
```
Chunk 1: 5s LLM + 3s delay = 8s
Chunk 2: 5s LLM + 3s delay = 8s
...
Chunk 8: 5s LLM + 3s delay = 8s

Total: 8 × 8s = 64 Sekunden
```

#### Nachher (Parallel, 3 concurrent)
```
Batch 1 (Chunks 1-3): max(5s, 5s, 5s) = 5s + 3s delay
Batch 2 (Chunks 4-6): max(5s, 5s, 5s) = 5s + 3s delay  
Batch 3 (Chunks 7-8): max(5s, 5s) = 5s

Total: 5 + 3 + 5 + 3 + 5 = 21 Sekunden
```

**🚀 Speedup: 3x schneller** (64s → 21s)

### Reale Szenarien

| Chunks | Sequenziell | Parallel (3x) | Speedup |
|--------|-------------|---------------|---------|
| 4      | 32s         | 13s           | 2.5x    |
| 8      | 64s         | 21s           | 3.0x    |
| 12     | 96s         | 29s           | 3.3x    |
| 16     | 128s        | 37s           | 3.5x    |

## Verwendung

### Standard (3 parallele Requests)

```bash
node scripts/generate-speaker-profiles.js --podcast ukw --speaker "Tim Pritlove"
```

### Höhere Parallelität

```bash
# 5 gleichzeitige Requests (schneller, aber höheres Rate-Limit-Risiko)
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --speaker "Tim Pritlove" \
  --max-concurrency 5
```

### Konservativ (1 Request = sequenziell)

```bash
# Bei Rate-Limit-Problemen
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --speaker "Tim Pritlove" \
  --max-concurrency 1
```

## Neue Option: `--max-concurrency`

```
--max-concurrency <n>      Maximum parallel LLM requests (default: 3)
                            Higher values = faster, but may hit rate limits
```

**Empfehlungen**:
- **3** (Standard): Gute Balance zwischen Speed und Stabilität
- **5-10**: Wenn dein LLM-Provider hohe Rate Limits hat
- **1**: Bei Rate-Limit-Problemen oder instabiler Verbindung

## Weitere Optimierungen

### 1. Cache wird optimal genutzt

Bereits verarbeitete Chunks werden übersprungen:

```javascript
if (!args.force && cachedChunk?.analysis) {
  // ✅ Verwendet Cache, kein LLM-Call
  cachedAnalyses.push({ index: i, analysis: cachedChunk.analysis, cached: true });
}
```

**Vorteil**: Erneutes Ausführen ist fast instant wenn Cache vorhanden

### 2. Batching zwischen Requests

Nur zwischen Batches wird gewartet, nicht zwischen einzelnen parallelen Requests:

```javascript
// ✅ Wartet nur zwischen Batches
if (i + maxConcurrency < chunksToProcess.length) {
  await sleep(delayMs);  // z.B. 3 Sekunden
}
```

### 3. Fehlerbehandlung pro Chunk

Wenn ein Chunk fehlschlägt, werden die anderen trotzdem verarbeitet:

```javascript
try {
  const response = await callLLM(...);
  return { success: true, analysis };
} catch (error) {
  console.error(`❌ chunk ${index + 1} failed: ${error.message}`);
  return { success: false };  // Andere Chunks laufen weiter
}
```

## Best Practices

### 1. Erste Generierung

```bash
# Konservativ starten
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --speaker "Tim Pritlove" \
  --max-concurrency 3
```

### 2. Bulk-Generierung

```bash
# Mehrere Sprecher, höhere Parallelität
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --limit-speakers 5 \
  --max-concurrency 5
```

### 3. Regenerierung (mit Cache)

```bash
# Nur geänderte Chunks werden neu verarbeitet
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --speaker "Tim Pritlove"
# Cached chunks: instant
# Neue chunks: parallel verarbeitet
```

### 4. Komplette Neu-Generierung

```bash
# Force = alles neu, aber parallel
node scripts/generate-speaker-profiles.js \
  --podcast ukw \
  --speaker "Tim Pritlove" \
  --force \
  --max-concurrency 3
```

## Rate Limits beachten

### OpenAI

- **Free Tier**: 3 requests/minute → `--max-concurrency 1`
- **Tier 1**: 60 requests/minute → `--max-concurrency 3-5`
- **Tier 2+**: 3500+ requests/minute → `--max-concurrency 10+`

### Anthropic (Claude)

- **Free Tier**: 5 requests/minute → `--max-concurrency 1-2`
- **Tier 1**: 50 requests/minute → `--max-concurrency 3-5`
- **Tier 2+**: 1000+ requests/minute → `--max-concurrency 10+`

### OpenRouter / Andere

Prüfe die Rate Limits deines Providers und passe `--max-concurrency` an.

## Monitoring

Die Ausgabe zeigt den Fortschritt:

```
🧑‍🎤 Tim Pritlove
   Episodes: 140 | Utterances: 9744 | Words: ~1114207
   Chunks: 8/12 (chunkChars=16000, maxChunks=8)
   
   - chunk 1/8: cache
   - chunk 2/8: cache
   - processing chunks 3-5/8 (parallel)…    ← 3 gleichzeitig
   - processing chunks 6-8/8 (parallel)…    ← 3 gleichzeitig
   - final synthesis: LLM…

✅ Done.
```

## Fehlerbehandlung

Wenn ein Chunk fehlschlägt:

```
   - processing chunks 1-3/8 (parallel)…
      ❌ chunk 2 failed: Rate limit exceeded
   ✅ Chunks 1 und 3 werden trotzdem verarbeitet
```

**Lösung**: Reduziere `--max-concurrency` oder erhöhe `--delay-ms`

## Performance-Tipps

1. **Cache nutzen**: Laufe ohne `--force` wenn möglich
2. **Chunks optimieren**: `--max-chunks 8` ist gut für die meisten Fälle
3. **Chunk-Größe**: `--chunk-chars 16000` ist optimal für die meisten LLMs
4. **Parallelität anpassen**: Teste verschiedene `--max-concurrency` Werte
5. **Delay reduzieren**: Wenn Rate Limits kein Problem sind: `--delay-ms 1000`

## Zusammenfassung

✅ **Sprecher-Isolierung**: Vollständig sichergestellt durch `speaker`-Feld im Transcript  
✅ **Parallele Verarbeitung**: 3x Speedup durch parallele LLM-Calls  
✅ **Konfigurierbar**: `--max-concurrency` für flexible Anpassung  
✅ **Fehlerresistent**: Einzelne Fehler stoppen nicht die gesamte Verarbeitung  
✅ **Cache-optimiert**: Bereits verarbeitete Chunks werden übersprungen

## Siehe auch

- [SPEAKER-PROFILES-V2.md](./SPEAKER-PROFILES-V2.md) - Neues Prompt-System
- [SPEAKER-PROFILES-PODCAST-PARAM.md](./SPEAKER-PROFILES-PODCAST-PARAM.md) - Podcast-Parameter
