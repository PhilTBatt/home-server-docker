#!/bin/bash

set -u

repo="$(cd "$(dirname "$0")/.." && pwd)"
caddyfile="$repo/caddy/Caddyfile"

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

site() {
  awk -v start="$1 {" '$0 == start { on = 1 } on { print } on && $0 == "}" { exit }' "$caddyfile"
}

sites_naming() {
  awk -v name="$1" '/^[^#[:space:]].* \{$/ { line = substr($0, 1, length($0) - 2); n = split(line, names, /, */); for (i = 1; i <= n; i++) if (names[i] == name) count++ } END { print count + 0 }' "$caddyfile"
}

plain=$(site "http://hub.home")
secure=$(site "https://hub.home")

check "hub.home has a plain http site of its own" "1" "$(grep -cx 'http://hub.home {' "$caddyfile")"
check "and an https site of its own" "1" "$(grep -cx 'https://hub.home {' "$caddyfile")"
check "no other site names http://hub.home" "1" "$(sites_naming 'http://hub.home')"
check "no other site names https://hub.home" "1" "$(sites_naming 'https://hub.home')"
check "no site names hub.home without a scheme" "0" "$(sites_naming 'hub.home')"

check "the plain http site serves the root certificate" "1" "$(grep -cx '	handle /caddy-root.crt {' <<< "$plain")"
check "from the hub folder" "1" "$(grep -cx '		root \* /srv/hub' <<< "$plain")"
check "with one file server" "1" "$(grep -c 'file_server' <<< "$plain")"
check "and sends everything else to https, with the same path" "1" "$(grep -cx '		redir https://hub.home{uri}' <<< "$plain")"
check "with Caddy's temporary redirect, not a permanent one" "0" "$(grep -cE 'redir .* (permanent|301|308)' <<< "$plain")"
check "the plain http site has two handles and nothing else at its top level" "	handle /caddy-root.crt {|	handle {" "$(grep -E '^	[^	}]' <<< "$plain" | paste -sd '|')"
check "the plain http site never reaches the API" "0" "$(grep -c 'reverse_proxy' <<< "$plain")"

check "the https site uses Caddy's own certificate authority" "1" "$(grep -cx '	tls internal' <<< "$secure")"
check "and passes /api/ to the API" "1" "$(grep -cx '		reverse_proxy api:3000' <<< "$secure")"
check "and serves the hub folder" "1" "$(grep -cx '		root \* /srv/hub' <<< "$secure")"

policy="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; media-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
check "the https site sends the content security policy" "1" "$(grep -cxF "		Content-Security-Policy \"$policy\"" <<< "$secure")"
check "and nosniff" "1" "$(grep -cx '		X-Content-Type-Options "nosniff"' <<< "$secure")"
check "and refuses being shown in a frame" "1" "$(grep -cx '		X-Frame-Options "DENY"' <<< "$secure")"
check "and sends no referrer" "1" "$(grep -cx '		Referrer-Policy "no-referrer"' <<< "$secure")"
check "the headers are in one header block, applying to the whole site" "1" "$(grep -cx '	header {' <<< "$secure")"
check "no policy allows inline code or eval" "0" "$(grep -cE "unsafe-inline|unsafe-eval|unsafe-hashes|'strict-dynamic'" "$caddyfile")"
check "no policy lets the page load from anywhere but itself" "0" "$(grep -E '^		Content-Security-Policy' "$caddyfile" | grep -cE 'https?:|\*|data:|blob:')"

hub="$repo/hub"
check "the hub's pages have no script written inside them, which the policy would block" "0" "$(grep -hiE '<script' "$hub"/*.html | grep -civ ' src=')"
check "no style written inside them" "0" "$(cat "$hub"/*.html | grep -ciE '<style|style=')"
check "no on... handlers written in them" "0" "$(cat "$hub"/*.html | grep -ciE '\son[a-z]+=')"
check "nothing loaded from another site" "0" "$(cat "$hub"/*.html | grep -ciE '(src|href)="(https?:)?//')"
check "no javascript: addresses" "0" "$(cat "$hub"/*.html "$hub"/*.js | grep -ci 'javascript:')"
check "the hub's code never builds code from text" "0" "$(cat "$hub"/*.js | grep -cE '\beval\(|new Function\(|setTimeout\("|setInterval\("')"
check "and never sets a style or handler attribute, which the policy would block" "0" "$(cat "$hub"/*.js | grep -ciE 'setAttribute\("(style|on[a-z]+)"')"

check "api.home still answers on plain http for the server's own scripts" "1" "$(grep -cx 'http://api.home, https://api.home {' "$caddyfile")"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
