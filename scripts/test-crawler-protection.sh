#!/bin/bash

# Test-Script für Rate-Limiting & Bot-Protection
# 
# Führt verschiedene Tests aus, um zu prüfen ob die Schutzmaßnahmen greifen

set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Konfiguration
API_URL="${API_URL:-http://localhost:3001}"
CHAT_ENDPOINT="${API_URL}/api/chat"
SEARCH_ENDPOINT="${API_URL}/api/episodes/search"
HEALTH_ENDPOINT="${API_URL}/api/health"

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Rate-Limiting & Bot-Protection Tests${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "API URL: $API_URL"
echo ""

# Test 1: Rate-Limiting auf /api/chat
echo -e "${YELLOW}Test 1: Rate-Limiting auf /api/chat${NC}"
echo "Sende 10 schnelle Requests..."

success_count=0
rate_limit_count=0

for i in {1..10}; do
    response=$(curl -s -w "\n%{http_code}" -X POST "$CHAT_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{"query": "Was ist das?", "podcast_id": "freakshow"}' 2>/dev/null)
    
    status_code=$(echo "$response" | tail -n1)
    
    if [ "$status_code" = "200" ]; then
        ((success_count++))
        echo -e "  Request $i: ${GREEN}200 OK${NC}"
    elif [ "$status_code" = "429" ]; then
        ((rate_limit_count++))
        echo -e "  Request $i: ${RED}429 Rate Limited${NC}"
    else
        echo -e "  Request $i: ${RED}$status_code${NC}"
    fi
    
    sleep 0.1  # Kleine Pause zwischen Requests
done

echo ""
if [ $rate_limit_count -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: Rate-Limiting funktioniert! ($rate_limit_count von 10 Requests blockiert)${NC}"
else
    echo -e "${RED}❌ FAIL: Kein Rate-Limiting aktiv! Alle Requests gingen durch.${NC}"
fi
echo ""

# Test 2: Bot User-Agent wird blockiert
echo -e "${YELLOW}Test 2: Bot User-Agent blockieren${NC}"

bot_user_agents=(
    "Mozilla/5.0 (compatible; Googlebot/2.1)"
    "curl/7.79.1"
    "python-requests/2.28.0"
    "Headless Chrome"
    "gptbot"
)

bot_blocked_count=0

for ua in "${bot_user_agents[@]}"; do
    status_code=$(curl -s -o /dev/null -w "%{http_code}" \
        -A "$ua" \
        "$CHAT_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d '{"query": "test"}')
    
    if [ "$status_code" = "403" ]; then
        echo -e "  ${GREEN}✅ Blocked: $ua ($status_code)${NC}"
        ((bot_blocked_count++))
    else
        echo -e "  ${RED}❌ NOT Blocked: $ua ($status_code)${NC}"
    fi
done

echo ""
if [ $bot_blocked_count -eq ${#bot_user_agents[@]} ]; then
    echo -e "${GREEN}✅ PASS: Alle Bots wurden blockiert!${NC}"
elif [ $bot_blocked_count -gt 0 ]; then
    echo -e "${YELLOW}⚠️  PARTIAL: $bot_blocked_count von ${#bot_user_agents[@]} Bots blockiert${NC}"
else
    echo -e "${RED}❌ FAIL: Keine Bots blockiert. User-Agent Filtering nicht aktiv?${NC}"
fi
echo ""

# Test 3: Normale Browser gehen durch
echo -e "${YELLOW}Test 3: Normale Browser erlauben${NC}"

normal_ua="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
status_code=$(curl -s -o /dev/null -w "%{http_code}" \
    -A "$normal_ua" \
    "$HEALTH_ENDPOINT")

if [ "$status_code" = "200" ]; then
    echo -e "${GREEN}✅ PASS: Normale Browser werden durchgelassen ($status_code)${NC}"
else
    echo -e "${RED}❌ FAIL: Normale Browser blockiert? ($status_code)${NC}"
fi
echo ""

# Test 4: robots.txt existiert
echo -e "${YELLOW}Test 4: robots.txt vorhanden${NC}"

robots_status=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/robots.txt")

if [ "$robots_status" = "200" ]; then
    echo -e "${GREEN}✅ PASS: robots.txt ist erreichbar${NC}"
    echo ""
    echo "Inhalt (erste 10 Zeilen):"
    curl -s "${API_URL}/robots.txt" | head -n 10 | sed 's/^/  /'
else
    echo -e "${RED}❌ FAIL: robots.txt nicht gefunden ($robots_status)${NC}"
fi
echo ""

# Test 5: Concurrent Requests
echo -e "${YELLOW}Test 5: Gleichzeitige Requests (Concurrency)${NC}"
echo "Sende 5 parallele Requests..."

temp_file=$(mktemp)
concurrent_success=0
concurrent_fail=0

for i in {1..5}; do
    (
        status_code=$(curl -s -o /dev/null -w "%{http_code}" \
            -X POST "$CHAT_ENDPOINT" \
            -H "Content-Type: application/json" \
            -d '{"query": "concurrent test", "podcast_id": "freakshow"}')
        echo "$status_code"
    ) >> "$temp_file" &
done

wait

while read status; do
    if [ "$status" = "200" ]; then
        ((concurrent_success++))
    else
        ((concurrent_fail++))
    fi
done < "$temp_file"

rm "$temp_file"

echo -e "  Erfolgreiche Requests: ${GREEN}$concurrent_success${NC}"
echo -e "  Blockierte Requests: ${RED}$concurrent_fail${NC}"

if [ $concurrent_fail -gt 0 ]; then
    echo -e "${GREEN}✅ PASS: Concurrency-Limit greift${NC}"
else
    echo -e "${YELLOW}⚠️  INFO: Alle gleichzeitigen Requests gingen durch (evtl. kein Concurrency-Limit)${NC}"
fi
echo ""

# Zusammenfassung
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Zusammenfassung${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# Berechne Gesamtergebnis
total_tests=5
passed_tests=0

[ $rate_limit_count -gt 0 ] && ((passed_tests++))
[ $bot_blocked_count -eq ${#bot_user_agents[@]} ] && ((passed_tests++))
[ "$status_code" = "200" ] && ((passed_tests++))
[ "$robots_status" = "200" ] && ((passed_tests++))
[ $concurrent_fail -gt 0 ] && ((passed_tests++))

echo "Tests bestanden: $passed_tests / $total_tests"
echo ""

if [ $passed_tests -eq $total_tests ]; then
    echo -e "${GREEN}✅ Alle Tests bestanden! Deine API ist gut geschützt.${NC}"
    exit 0
elif [ $passed_tests -ge 3 ]; then
    echo -e "${YELLOW}⚠️  Die meisten Tests bestanden, aber noch Verbesserungspotential.${NC}"
    exit 0
else
    echo -e "${RED}❌ Viele Tests fehlgeschlagen. Bitte überprüfe deine Konfiguration!${NC}"
    echo ""
    echo "Empfohlene Schritte:"
    echo "1. Nginx Rate-Limiting aktivieren (siehe nginx-rate-limit.conf)"
    echo "2. robots.txt nach frontend/public/ kopieren"
    echo "3. Meta-Tags in frontend/index.html prüfen"
    exit 1
fi
