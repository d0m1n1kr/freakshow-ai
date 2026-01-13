# Admin Dashboard

## Zugriff

Das Admin-Dashboard ist über die Route **`/admin/tokens`** erreichbar:

```
http://localhost:5173/admin/tokens
https://yoursite.com/admin/tokens
```

⚠️ **Wichtig**: Es gibt **keine Verlinkung** im Frontend zum Admin-Dashboard. Man muss die URL direkt eingeben.

## Authentifizierung

Beim ersten Besuch der Seite wird nach dem **Admin-Token** gefragt. Dies ist der `statsAuthToken` aus der `settings.json`:

```json
{
  "statsAuthToken": "your-secret-admin-token-here"
}
```

Der Admin-Token wird im Browser-LocalStorage gespeichert und bei jedem API-Request mitgeschickt.

## Funktionen

### 1. **Token-Übersicht**
- Alle registrierten Tokens anzeigen
- Email, Status (aktiviert/nicht aktiviert)
- Request Count / Limit mit Fortschrittsbalken
- Zeitstempel (Erstellt, Aktiviert, Zuletzt genutzt)

### 2. **Limit erhöhen**
- "Limit erhöhen" Button für jeden Token
- Eingabefeld für Anzahl (z.B. +100)
- API: `POST /api/admin/tokens/:token/increase-limit`
  ```json
  {
    "increase_by": 100
  }
  ```

### 3. **Token löschen**
- "Löschen" Button für jeden Token
- Bestätigung durch Eingabe von "DELETE"
- API: `DELETE /api/admin/tokens/:token`

### 4. **Aktionen**
- **Aktualisieren**: Lädt alle Tokens neu
- **Logout**: Entfernt Admin-Token aus LocalStorage
- **Zurück**: Navigiert zur Startseite

## Backend-Konfiguration

Die Admin-API-Endpunkte sind bereits implementiert:

```rust
.route("/api/admin/tokens", axum::routing::get(list_tokens))
.route("/api/admin/tokens/:token/increase-limit", post(increase_token_limit))
.route("/api/admin/tokens/:token", axum::routing::delete(delete_token))
```

Alle Endpunkte erfordern den `statsAuthToken` im `Authorization: Bearer` Header.

## Sicherheit

✅ **Was ist geschützt:**
- Admin-Token wird im Backend mit `statsAuthToken` aus `settings.json` validiert
- Alle API-Requests erfordern Authentifizierung
- Kein öffentlicher Zugriff auf Token-Daten

✅ **Was NICHT geschützt ist:**
- Die Route `/admin/tokens` selbst ist öffentlich (aber ohne Token sieht man nichts)
- Wenn jemand die URL kennt, kann er die Login-Seite sehen

⚠️ **Empfehlung**: Für zusätzliche Sicherheit könnte man später:
- Rate-Limiting auf Admin-Endpunkte
- IP-Whitelist über Nginx
- 2FA für Admin-Login

## Design

Das Dashboard nutzt:
- **Tailwind CSS** für modernes, responsives Design
- **Dark Mode** Support
- **Farbcodierte Warnings** (Grün/Orange/Rot basierend auf Request-Nutzung)
- **Inline-Aktionen** (Limit erhöhen, Löschen) ohne Seitenwechsel
- **Responsive Grid** für mobile und Desktop-Nutzung

## Verwendung

1. Navigiere zu `/admin/tokens`
2. Gib den Admin-Token ein (aus `settings.json`)
3. Sieh alle Tokens und ihre Nutzung
4. Erhöhe Limits oder lösche Tokens nach Bedarf
5. Logout wenn fertig

Das Dashboard ist für schnelle Admin-Aktionen optimiert ohne komplexe Navigation!
