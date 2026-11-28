#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/repo/api"
cat > "$work/bin/curl" <<'FAKE'
#!/bin/bash
printf '%s\n' "$@" > "$CURL_ARGS"
cat > "$CURL_INPUT"
echo '{"pretend":"reply"}'
FAKE
chmod +x "$work/bin/curl"

token="test-token-0123456789abcdef"
printf 'ALERTS=on\nAPI_TOKEN=%s\nTALK=off\n' "$token" > "$work/repo/api/.env"
export CURL_ARGS="$work/args" CURL_INPUT="$work/input"

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

run() {
  rm -f "$CURL_ARGS" "$CURL_INPUT"
  (cd "$work/repo" && PATH="$work/bin:$PATH" bash "$here/$1" "${@:2}" < /dev/null 2>&1)
}

output=$(run hub-get.sh /system/status)
check "hub-get.sh prints the API's reply" '{"pretend":"reply"}' "$output"
check "hub-get.sh never puts the token on curl's command line" "0" "$(grep -c "$token" "$CURL_ARGS")"
check "hub-get.sh gives curl the header on its input, and nothing else" "Authorization: Bearer $token" "$(cat "$CURL_INPUT")"
check "hub-get.sh tells curl to read a header from its input" "1" "$(grep -cx -- '@-' "$CURL_ARGS")"
check "hub-get.sh asks the API through Caddy on the server itself" "1" "$(grep -cx 'http://localhost/system/status' "$CURL_ARGS")"
check "hub-get.sh names api.home" "1" "$(grep -cx 'Host: api.home' "$CURL_ARGS")"

output=$(run hub-post.sh /phone/find)
check "hub-post.sh with no body prints the API's reply" '{"pretend":"reply"}' "$output"
check "hub-post.sh with no body never puts the token on curl's command line" "0" "$(grep -c "$token" "$CURL_ARGS")"
check "hub-post.sh with no body gives curl the header on its input" "Authorization: Bearer $token" "$(cat "$CURL_INPUT")"
check "hub-post.sh with no body posts" "POST" "$(grep -A1 -x -- '-X' "$CURL_ARGS" | tail -1)"
check "hub-post.sh with no body sends no body" "0" "$(grep -cx -- '-d' "$CURL_ARGS")"

output=$(run hub-post.sh /memory/inbox '{"title":"a","text":"b"}')
check "hub-post.sh with a body never puts the token on curl's command line" "0" "$(grep -c "$token" "$CURL_ARGS")"
check "hub-post.sh with a body gives curl the header on its input" "Authorization: Bearer $token" "$(cat "$CURL_INPUT")"
check "hub-post.sh with a body sends it as JSON" '{"title":"a","text":"b"}' "$(grep -A1 -x -- '-d' "$CURL_ARGS" | tail -1)"
check "hub-post.sh with a body says it's JSON" "1" "$(grep -cx 'Content-Type: application/json' "$CURL_ARGS")"
check "hub-post.sh with a body asks the right path" "1" "$(grep -cx 'http://localhost/memory/inbox' "$CURL_ARGS")"

output=$(run hub-get.sh system/status)
check "hub-get.sh refuses a path without a leading slash" "Usage: bash host/hub-get.sh /path (the path must start with /)" "$output"
check "and never calls curl" "no" "$([ -e "$CURL_ARGS" ] && echo yes || echo no)"

output=$(run hub-post.sh phone/find)
check "hub-post.sh refuses a path without a leading slash, without calling curl" "no" "$([ -e "$CURL_ARGS" ] && echo yes || echo no)"

printf 'ALERTS=on\n' > "$work/repo/api/.env"
output=$(run hub-get.sh /health)
check "hub-get.sh with no token says so" "No API_TOKEN found in api/.env. Run this from ~/docker." "$output"
check "and never calls curl" "no" "$([ -e "$CURL_ARGS" ] && echo yes || echo no)"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
