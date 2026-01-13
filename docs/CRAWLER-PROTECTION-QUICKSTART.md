# Quick-Start: Crawler-Protection aktivieren

Diese Anleitung zeigt dir die **schnellsten Schritte**, um deine API vor Crawlern und Bot-Missbrauch zu schützen.

**Zeitaufwand**: 15-20 Minuten  
**Schutzlevel**: ~90% der Crawler/Bots werden gestoppt

---

## ✅ Schritt 1: robots.txt (2 Minuten)

Die `robots.txt` wurde bereits erstellt:

```bash
# Prüfe ob sie existiert
ls -la frontend/public/robots.txt
```

**✅ Fertig!** Die Datei wird automatisch ausgeliefert, wenn du das Frontend baust.

---

## ✅ Schritt 2: Meta-Tags im HTML (2 Minuten)

Die Meta-Tags wurden bereits in `frontend/index.html` eingefügt.

**Frontend neu bauen** (damit die Änderungen wirksam werden):

```bash
cd frontend
npm run build
# oder yarn build
```

**✅ Fertig!** Alle gängigen Crawler sollten jetzt die Seite respektieren.

---

## ✅ Schritt 3: Nginx Rate-Limiting (10-15 Minuten)

### 3.1 Nginx-Config öffnen

```bash
# Finde deine nginx-Config
sudo nano /etc/nginx/sites-available/podinsights
# oder
sudo nano /etc/nginx/nginx.conf
```

### 3.2 Rate-Limit-Zonen hinzufügen

**Im `http {}` Block** (VOR dem `server {}` Block):

```nginx
http {
    # ... bestehende Konfiguration ...
    
    # Rate-Limit-Zonen
    limit_req_zone $binary_remote_addr zone=llm_ultra:10m rate=2r/m;
    limit_req_zone $binary_remote_addr zone=api_moderate:10m rate=10r/m;
    
    # Bot-Detection
    map $http_user_agent $is_bot {
        default 0;
        ~*bot 1;
        ~*crawler 1;
        ~*spider 1;
        ~*scraper 1;
        ~*curl 1;
        ~*wget 1;
        ~*python-requests 1;
        ~*headless 1;
        ~*puppeteer 1;
        ~*selenium 1;
        ~*gptbot 1;
        ~*claudebot 1;
    }
    
    # ... server {} kommt hier ...
}
```

### 3.3 Rate-Limiting auf Chat-Endpoint anwenden

**Im `server {}` Block**:

```nginx
server {
    # ... bestehende Konfiguration ...
    
    # Chat-Endpoint mit strengem Rate-Limiting
    location /api/chat {
        # Bots blockieren
        if ($is_bot) {
            return 403 '{"error": "Bot access not allowed"}';
        }
        
        # Rate-Limiting: Max 2 Requests/Minute
        limit_req zone=llm_ultra burst=3 nodelay;
        limit_req_status 429;
        
        # Proxy zum Backend
        proxy_pass http://127.0.0.1:3001;  # Passe Port an!
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_read_timeout 60s;
    }
    
    # Optional: Andere Endpoints schützen
    location /api/episodes/search {
        if ($is_bot) {
            return 403 '{"error": "Bot access not allowed"}';
        }
        
        limit_req zone=api_moderate burst=5 nodelay;
        limit_req_status 429;
        
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # Gesundheitscheck ohne Limits
    location /api/health {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

### 3.4 Nginx testen & neu laden

```bash
# Config-Syntax prüfen
sudo nginx -t

# Wenn OK, neu laden
sudo systemctl reload nginx
# oder
sudo nginx -s reload
```

**✅ Fertig!** Rate-Limiting ist aktiv.

---

## 🧪 Schritt 4: Testen (5 Minuten)

### Test 1: Rate-Limiting funktioniert

```bash
# Sende viele Requests schnell hintereinander
for i in {1..10}; do
  curl -X POST http://localhost/api/chat \
    -H "Content-Type: application/json" \
    -d '{"query": "Test", "podcast_id": "freakshow"}'
  echo ""
done
```

**Erwartung**: Nach 2-3 Requests solltest du `429` (Too Many Requests) sehen.

### Test 2: Bots werden blockiert

```bash
# Curl wird als Bot erkannt
curl http://localhost/api/chat
```

**Erwartung**: `403 Forbidden` oder `{"error": "Bot access not allowed"}`

### Test 3: Automatischer Test

```bash
# Führe das Test-Script aus
./scripts/test-crawler-protection.sh
```

**Erwartung**: Mindestens 3 von 5 Tests sollten bestehen.

---

## 📊 Monitoring

### Nginx-Logs überwachen

```bash
# Rate-Limited Requests anzeigen
sudo tail -f /var/log/nginx/error.log | grep "limiting requests"

# Blockierte Bots anzeigen
sudo tail -f /var/log/nginx/access.log | grep "403"
```

### Top-Angreifer-IPs finden

```bash
# Zeige IPs mit den meisten Requests
sudo awk '{print $1}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head -10
```

### Rate-Limit-Statistiken

```bash
# Zeige wie viele Requests rate-limited wurden
sudo grep "limiting requests" /var/log/nginx/error.log | wc -l
```

---

## 🔧 Anpassungen

### Rate-Limits anpassen

Wenn zu viele legitime Nutzer geblockt werden:

```nginx
# Lockerer (5 statt 2 Requests/Minute)
limit_req_zone $binary_remote_addr zone=llm_ultra:10m rate=5r/m;

# Oder burst erhöhen (erlaubt mehr Spitzen)
limit_req zone=llm_ultra burst=5 nodelay;
```

Wenn immer noch zu viel Missbrauch:

```nginx
# Strenger (1 Request/Minute)
limit_req_zone $binary_remote_addr zone=llm_ultra:10m rate=1r/m;

# Oder burst reduzieren
limit_req zone=llm_ultra burst=1 nodelay;
```

### Bestimmte IPs erlauben (Whitelist)

```nginx
geo $limited {
    default 1;
    # Deine eigene IP nicht limitieren
    123.123.123.123 0;
    # Vertrauenswürdige IPs
    192.168.1.0/24 0;
}

map $limited $limit_key {
    0 "";
    1 $binary_remote_addr;
}

limit_req_zone $limit_key zone=llm_ultra:10m rate=2r/m;
```

---

## ⚠️ Troubleshooting

### "Alle meine Requests werden blockiert"

**Problem**: Du testest von localhost oder hinter einem Proxy.

**Lösung**: 
1. Prüfe welche IP nginx sieht: `curl http://localhost/api/health -v`
2. Füge deine IP zur Whitelist hinzu (siehe oben)

### "Rate-Limiting funktioniert nicht"

**Mögliche Ursachen**:

1. **Nginx nicht neu geladen**:
   ```bash
   sudo nginx -s reload
   ```

2. **Zone-Definition fehlt**:
   ```bash
   # Prüfe ob Zones definiert sind
   sudo nginx -T | grep limit_req_zone
   ```

3. **Falsche Location-Reihenfolge**:
   Nginx nutzt die ERSTE passende Location. Prüfe die Reihenfolge!

### "Bots werden nicht blockiert"

**Mögliche Ursachen**:

1. **Map nicht im http {} Block**:
   Die `map $http_user_agent $is_bot` MUSS im `http {}` Block sein, nicht im `server {}`!

2. **User-Agent wird nicht weitergegeben**:
   ```nginx
   proxy_set_header User-Agent $http_user_agent;
   ```

---

## 🎯 Nächste Schritte (Optional)

Wenn du noch mehr Schutz willst:

1. **Backend Rate-Limiting** hinzufügen (siehe `docs/CRAWLER-PROTECTION.md`)
2. **Logging verbessern** (siehe `docs/CRAWLER-PROTECTION.md` → Monitoring)
3. **CAPTCHA** für Beispiele (nur bei nachweisbarem Missbrauch)

---

## ✅ Checkliste

- [x] `robots.txt` existiert in `frontend/public/`
- [x] Meta-Tags in `frontend/index.html`
- [x] Frontend neu gebaut (`npm run build`)
- [ ] Nginx Rate-Limit-Zonen definiert
- [ ] Nginx Bot-Detection Map erstellt
- [ ] Nginx `/api/chat` Location mit Rate-Limit
- [ ] Nginx config getestet (`nginx -t`)
- [ ] Nginx neu geladen (`systemctl reload nginx`)
- [ ] Rate-Limiting getestet (siehe oben)
- [ ] Monitoring eingerichtet (Logs überwachen)

---

## 📚 Weitere Dokumentation

- Vollständige Dokumentation: `docs/CRAWLER-PROTECTION.md`
- Nginx-Beispielconfig: `nginx-rate-limit.conf`
- Test-Script: `scripts/test-crawler-protection.sh`
