# Clustering-Varianten System

Dieses System ermöglicht es, verschiedene Clustering-Konfigurationen zu erstellen und im Frontend zwischen ihnen zu wechseln.

## 📁 Architektur

```
freakshow/
├── variants.json                      # Zentrale Varianten-Konfiguration
├── build-variant.sh                   # Master-Skript zum Erstellen von Varianten
├── frontend/public/topics/
│   ├── manifest.json                  # Liste aller verfügbaren Varianten
│   ├── default-v1/                    # Variante: Standard HAC mit 256 Clustern
│   │   ├── topic-taxonomy.json
│   │   ├── topic-taxonomy-detailed.json
│   │   ├── topic-umap-data.json
│   │   ├── topic-river-data.json
│   │   ├── cluster-cluster-heatmap.json
│   │   └── speaker-cluster-heatmap.json
│   ├── auto-v2/                       # Variante: HDBSCAN automatisch
│   │   └── ...
│   └── fine-v2/                       # Variante: HDBSCAN fein-granular
│       └── ...
└── frontend/src/
    ├── composables/useVariants.ts     # Varianten-Logik
    └── components/VariantSelector.vue # Dropdown im Frontend
```

## 🚀 Quick Start

### 1. Variante erstellen

```bash
# V1 Variante (fixe Cluster-Anzahl)
./build-variant.sh v1 default-v1

# V2 Variante (automatische Cluster-Erkennung)
./build-variant.sh v2 auto-v2

# Mit vollständigem Rebuild
./build-variant.sh v2 fine-v2 --rebuild-all
```

### 2. Frontend starten

```bash
cd frontend
npm run dev
```

### 3. Variante im Frontend auswählen

Im Header-Bereich gibt es ein Dropdown "Clustering-Variante", über das zwischen den verfügbaren Varianten gewechselt werden kann.

## ⚙️ Varianten konfigurieren

Bearbeite `variants.json`:

```json
{
  "defaultVariant": "default-v1",
  "variants": {
    "meine-variante": {
      "version": "v2",
      "name": "Mein Custom Clustering",
      "description": "Beschreibung...",
      "settings": {
        "minClusterSize": 10,
        "minSamples": 5,
        "reducedDimensions": 30,
        "useLLMNaming": true,
        "useRelevanceWeighting": true
      }
    }
  }
}
```

### V1 Settings (Hierarchical Agglomerative Clustering)

| Parameter | Default | Beschreibung |
|-----------|---------|--------------|
| `clusters` | 256 | Anzahl der Ziel-Cluster (fix) |
| `outlierThreshold` | 0.7 | Schwellwert für Outlier-Erkennung |
| `linkageMethod` | `"weighted"` | Linkage-Methode: `weighted`, `ward`, `average`, `complete`, `single` |
| `useRelevanceWeighting` | `true` | Gewichtung nach Episode-Häufigkeit |
| `useLLMNaming` | `true` | LLM-basierte Cluster-Benennung |

### V2 Settings (HDBSCAN)

| Parameter | Default | Beschreibung |
|-----------|---------|--------------|
| `minClusterSize` | 5 | Minimale Cluster-Größe |
| `minSamples` | 3 | Dichte-Parameter für Core-Points |
| `reducedDimensions` | 50 | Dimensionen nach Reduktion (PCA/Random Projection) |
| `useRelevanceWeighting` | `true` | Gewichtung nach Episode-Häufigkeit |
| `useLLMNaming` | `true` | LLM-basierte Cluster-Benennung |

## 🔧 Was macht `build-variant.sh`?

Das Skript:

1. ✅ Liest Konfiguration aus `variants.json`
2. ✅ Erstellt temporäre `settings.json` mit Varianten-Settings
3. ✅ Kompiliert Rust-Binary (falls nötig)
4. ✅ Führt Clustering aus (V1 oder V2)
5. ✅ Generiert abgeleitete Visualisierungen:
   - UMAP 2D-Projektion
   - Topic River Data
   - Cluster-Cluster Heatmap
   - Speaker-Cluster Heatmap
6. ✅ Verschiebt alle Files nach `frontend/public/topics/<variant>/`
7. ✅ Aktualisiert `manifest.json`

## 📊 Vordefinierte Varianten

### V1 Varianten (HAC)

| Variante | Cluster | Linkage | Beschreibung |
|----------|---------|---------|--------------|
| `default-v1` | 256 | weighted | Standard-Konfiguration |
| `fine-v1` | 512 | weighted | Sehr feine Kategorisierung |
| `coarse-v1` | 128 | ward | Grobe Gruppierung |

### V2 Varianten (HDBSCAN)

| Variante | minClusterSize | minSamples | Beschreibung |
|----------|----------------|------------|--------------|
| `auto-v2` | 5 | 3 | Automatische Cluster-Erkennung |
| `fine-v2` | 3 | 2 | Viele kleine Cluster |
| `coarse-v2` | 15 | 5 | Wenige große Cluster |
| `fast-v2` | 5 | 3 | Ohne LLM (nur Heuristik) |

## 🎨 Frontend Integration

### Varianten-Daten laden

```typescript
import { loadVariantData } from '@/composables/useVariants';

// Lädt aus /topics/<current-variant>/topic-taxonomy.json
const taxonomy = await loadVariantData('topic-taxonomy.json');
```

### Varianten-spezifische URL

```typescript
import { getVariantFileUrl } from '@/composables/useVariants';

const url = getVariantFileUrl('topic-umap-data.json');
// → /topics/default-v1/topic-umap-data.json
```

### Variante wechseln

```typescript
import { useSettingsStore } from '@/stores/settings';

const settings = useSettingsStore();
settings.setClusteringVariant('fine-v2');
```

## 🔄 Workflow: Neue Variante hinzufügen

1. **Konfiguration in `variants.json`** ergänzen:
   ```json
   {
     "my-experiment": {
       "version": "v2",
       "name": "Experiment: Sehr grob",
       "settings": { "minClusterSize": 20, "minSamples": 10 }
     }
   }
   ```

2. **Variante builden**:
   ```bash
   ./build-variant.sh v2 my-experiment
   ```

3. **Im Frontend testen**:
   - Frontend neu laden
   - Dropdown öffnen
   - "Experiment: Sehr grob" auswählen

## 🛠️ Troubleshooting

### "Variant not found in variants.json"

→ Prüfe, ob der Varianten-Name in `variants.json` existiert und richtig geschrieben ist.

### "settings.json not found"

→ Erstelle `settings.json` aus `settings.example.json`:
```bash
cp settings.example.json settings.json
# API-Key eintragen!
```

### "topic-embeddings.json not found"

→ Embeddings müssen zuerst erstellt werden:
```bash
node create-embeddings.js
```

### Variante erscheint nicht im Dropdown

→ Prüfe `frontend/public/topics/manifest.json` - wurde sie vom Build-Skript hinzugefügt?

### Dateien landen im falschen Ordner

→ Das Skript verschiebt die Files automatisch. Falls das fehlschlägt, manuell verschieben:
```bash
mkdir -p frontend/public/topics/my-variant
mv topic-taxonomy*.json frontend/public/topics/my-variant/
```

## 📈 Performance-Vergleich

| Version | Algorithmus | Cluster | Runtime | Memory |
|---------|-------------|---------|---------|--------|
| V1 | HAC | 256 (fix) | ~17s | ~500MB |
| V2 | HDBSCAN | ~45 (auto) | ~98s | ~800MB |

*Runtime auf Apple M1 Pro, 4056 Topics*

## 🔮 Zukünftige Erweiterungen

- [ ] Automatische Qualitäts-Metriken (Silhouette Score, etc.)
- [ ] Varianten-Vergleich in einem View
- [ ] Export/Import von Varianten-Configs
- [ ] Batch-Build aller Varianten
- [ ] Visualisierung der Cluster-Unterschiede

## 📚 Siehe auch

- [CLUSTERING-V2.md](./CLUSTERING-V2.md) - HDBSCAN Details
- [RUST-CLUSTERING.md](./RUST-CLUSTERING.md) - Rust Implementation
- [README.md](./README.md) - Haupt-Dokumentation

