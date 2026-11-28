#!/bin/bash

set -u

repo="$(cd "$(dirname "$0")/.." && pwd)"
compose="$repo/docker-compose.yaml"
services="$repo/homepage/config/services.yaml"

passed=0
failed=0

check() {
  if [ "$2" = "$3" ]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1"
    echo "  expected: $2"
    echo "  got:      $3"
  fi
}

published() {
  awk -v want="$1" '
    /^  [a-z][a-z0-9-]*:$/ { name = substr($1, 1, length($1) - 1); inports = 0; next }
    name == want && /^    ports:$/ { inports = 1; next }
    inports && /^      - / { line = $0; sub(/^      - /, "", line); gsub(/"/, "", line); print line; next }
    inports && !/^      - / { inports = 0 }
  ' "$compose" | paste -sd ' '
}

check "AdGuard publishes DNS only, not its admin page" "53:53/tcp 53:53/udp" "$(published adguard)"
check "Caddy publishes 80 and 443" "80:80 443:443" "$(published caddy)"
check "Jellyfin keeps 8096 for TV apps" "8096:8096" "$(published jellyfin)"
check "qBittorrent publishes only the torrent port, not its web page" "6881:6881 6881:6881/udp" "$(published qbittorrent)"
check "Beszel's page is only on the server itself, for its agent" "127.0.0.1:8090:8090" "$(published beszel)"
for name in homepage kuma prowlarr sonarr radarr seerr byparr api beszel-agent; do
  check "$name publishes nothing, so it's only reached through Caddy" "" "$(published "$name")"
done

all=$(awk '/^    ports:$/ { on = 1; next } on && /^      - / { line = $0; sub(/^      - /, "", line); gsub(/"/, "", line); print line; next } on { on = 0 }' "$compose" | LC_ALL=C sort | paste -sd ' ')
check "nothing else in the compose file publishes a port" "127.0.0.1:8090:8090 443:443 53:53/tcp 53:53/udp 6881:6881 6881:6881/udp 8096:8096 80:80" "$all"
check "Beszel's links point at its .home name" "1" "$(grep -cx '      APP_URL: http://metrics.home' "$compose")"
check "only those five services have a ports list, each written as a list" "5" "$(grep -cE '^[[:space:]]*ports:' "$compose")"
check "no ports list is written on one line, where the check above can't read it" "0" "$(grep -cE '^[[:space:]]*ports:[[:space:]]*[^[:space:]#]' "$compose")"
check "no port uses the long form" "0" "$(grep -cE '^[[:space:]]*(- )?(published|host_ip):' "$compose")"
hosts=$(for file in "$repo"/docker-compose*.yaml; do awk '/^  [a-z][a-z0-9-]*:$/ { name = substr($1, 1, length($1) - 1) } /^    network_mode: *"?host"?$/ { print name }' "$file"; done | paste -sd ' ')
check "only the Beszel agent uses the server's own network" "beszel-agent" "$hosts"
written=0
for file in "$repo"/docker-compose*.yaml; do written=$((written + $(grep -cE "^[[:space:]]*network_mode:[[:space:]]*['\"]?host" "$file"))); done
check "and only one service does, however its network_mode is written" "1" "$written"
overlays=0
for file in "$repo"/docker-compose.*.yaml; do overlays=$((overlays + $(grep -cE '^[[:space:]]*ports:' "$file"))); done
check "the add-on compose files publish nothing" "0" "$overlays"

for port in 3000 3001 8080 8081 8090 9696 8989 7878 5055 8096; do
  check "Homepage never links to port $port on the server's address" "0" "$(grep -c "href: http://192\.168\.0\.200:$port\$" "$services")"
done

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
