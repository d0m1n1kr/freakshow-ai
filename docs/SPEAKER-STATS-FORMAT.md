# Sprecherstatistik Format

## Vorgeschlagenes JSON-Format für `<episode-number>-speaker-stats.json`

```json
{
  "v": 1,
  "episode": 123,
  "episodeDurationSec": 6640,
  "speakers": [
    "Tim Pritlove",
    "Paul Hartogh"
  ],
  "speakerStats": {
    "Tim Pritlove": {
      "overall": {
        "totalSpeakingTimeSec": 3320,
        "speakingShare": 0.5,
        "segmentCount": 145,
        "longestMonologueSec": 45,
        "shortestSegmentSec": 2,
        "averageSegmentDurationSec": 22.9,
        "medianSegmentDurationSec": 18.5,
        "varianceSegmentDurationSec": 156.2,
        "stdDevSegmentDurationSec": 12.5,
        "boxplot": {
          "min": 2,
          "q1": 8,
          "median": 18.5,
          "q3": 32,
          "max": 45
        }
      },
      "temporal": [
        {
          "intervalStartSec": 0,
          "intervalEndSec": 600,
          "totalSpeakingTimeSec": 180,
          "speakingShare": 0.3,
          "segmentCount": 12,
          "averageSegmentDurationSec": 15.0,
          "medianSegmentDurationSec": 12.5,
          "varianceSegmentDurationSec": 45.2,
          "stdDevSegmentDurationSec": 6.7,
          "longestMonologueSec": 28,
          "shortestSegmentSec": 3,
          "boxplot": {
            "min": 3,
            "q1": 8,
            "median": 12.5,
            "q3": 20,
            "max": 28
          }
        },
        {
          "intervalStartSec": 600,
          "intervalEndSec": 1200,
          "totalSpeakingTimeSec": 320,
          "speakingShare": 0.53,
          "segmentCount": 18,
          "averageSegmentDurationSec": 17.8,
          "medianSegmentDurationSec": 15.0,
          "varianceSegmentDurationSec": 78.5,
          "stdDevSegmentDurationSec": 8.9,
          "longestMonologueSec": 42,
          "shortestSegmentSec": 2,
          "boxplot": {
            "min": 2,
            "q1": 10,
            "median": 15.0,
            "q3": 25,
            "max": 42
          }
        }
        // ... weitere 10-Minuten-Intervalle
      ]
    },
    "Paul Hartogh": {
      "overall": {
        "totalSpeakingTimeSec": 3320,
        "speakingShare": 0.5,
        "segmentCount": 132,
        "longestMonologueSec": 67,
        "shortestSegmentSec": 1,
        "averageSegmentDurationSec": 25.2,
        "medianSegmentDurationSec": 21.0,
        "varianceSegmentDurationSec": 198.5,
        "stdDevSegmentDurationSec": 14.1,
        "boxplot": {
          "min": 1,
          "q1": 12,
          "median": 21.0,
          "q3": 35,
          "max": 67
        }
      },
      "temporal": [
        // ... gleiche Struktur wie oben
      ]
    }
  }
}
```

## Erläuterungen

### Top-Level Felder
- `v`: Versionsnummer des Formats (für zukünftige Kompatibilität)
- `episode`: Episodennummer
- `episodeDurationSec`: Gesamtdauer der Episode in Sekunden (basierend auf letztem Timestamp)
- `speakers`: Array aller Sprecher in der Episode
- `speakerStats`: Objekt mit Statistiken pro Sprecher

### `overall` Statistiken pro Sprecher
- `totalSpeakingTimeSec`: Gesamte Sprechzeit in Sekunden (absolut)
- `speakingShare`: Anteil an Gesamtsprechzeit (0.0 - 1.0, relativ)
- `segmentCount`: Anzahl der Sprechsegmente
- `longestMonologueSec`: Längster ununterbrochener Monolog in Sekunden
- `shortestSegmentSec`: Kürzestes Segment in Sekunden
- `averageSegmentDurationSec`: Durchschnittliche Segmentdauer
- `medianSegmentDurationSec`: Median der Segmentdauern
- `varianceSegmentDurationSec`: Varianz der Segmentdauern
- `stdDevSegmentDurationSec`: Standardabweichung der Segmentdauern
- `boxplot`: Quartile und Extremwerte für Boxplot-Visualisierung
  - `min`: Minimum (kürzestes Segment)
  - `q1`: Erstes Quartil (25%)
  - `median`: Median (50%)
  - `q3`: Drittes Quartil (75%)
  - `max`: Maximum (längstes Segment)

### `temporal` Statistiken
Array von 10-Minuten-Intervallen (600 Sekunden) mit:
- `intervalStartSec`: Startzeit des Intervalls in Sekunden
- `intervalEndSec`: Endzeit des Intervalls in Sekunden
- `totalSpeakingTimeSec`: Sprechzeit in diesem Intervall
- `speakingShare`: Anteil an der Gesamtzeit dieses Intervalls
- `segmentCount`: Anzahl der Segmente in diesem Intervall
- `averageSegmentDurationSec`: Durchschnittliche Segmentdauer in diesem Intervall
- `medianSegmentDurationSec`: Median der Segmentdauern in diesem Intervall
- `varianceSegmentDurationSec`: Varianz der Segmentdauern in diesem Intervall
- `stdDevSegmentDurationSec`: Standardabweichung der Segmentdauern in diesem Intervall
- `longestMonologueSec`: Längster Monolog in diesem Intervall
- `shortestSegmentSec`: Kürzestes Segment in diesem Intervall
- `boxplot`: Quartile und Extremwerte für Boxplot-Visualisierung (wie bei `overall`)
  - `min`: Minimum (kürzestes Segment im Intervall)
  - `q1`: Erstes Quartil (25%)
  - `median`: Median (50%)
  - `q3`: Drittes Quartil (75%)
  - `max`: Maximum (längstes Segment im Intervall)

## Berechnungslogik

### Segmentdauer
- Für jedes Segment wird die Dauer als Differenz zum nächsten Segment berechnet
- Für das letzte Segment wird die Dauer als Differenz zum Episodenende geschätzt (oder als Durchschnitt der vorherigen Segmente, falls kein Episodenende bekannt)

### Monolog
- Ein Monolog ist eine Sequenz aufeinanderfolgender Segmente desselben Sprechers ohne Unterbrechung durch andere Sprecher

### Temporal Intervals
- Episode wird in 10-Minuten-Intervalle (600 Sekunden) aufgeteilt
- Letztes Intervall kann kürzer sein, wenn Episode nicht exakt durch 600 teilbar ist
- Segmente werden dem Intervall zugeordnet, in dem sie beginnen

## Offene Fragen

1. **Segmentdauer für letztes Segment**: Wie soll die Dauer des letzten Segments berechnet werden?
   - Option A: Differenz zum Episodenende (falls verfügbar)
   - Option B: Durchschnittliche Dauer der vorherigen Segmente
   - Option C: Als 0 oder minimaler Wert behandeln

2. **Segmente ohne Zeitstempel**: Wie sollen Segmente ohne Zeitstempel behandelt werden?
   - Option A: Überspringen
   - Option B: Sequenziell nach vorherigem Segment platzieren

3. **Temporal Intervals**: Sollen Intervalle mit 0 Sprechzeit enthalten sein oder weggelassen werden?

