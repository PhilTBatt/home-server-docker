#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

mkdir "$work/bin"
cat > "$work/bin/curl" <<'FAKE'
#!/bin/bash
echo "curl $*" >> "$CURL_LOG"
cat >> "$CURL_STDIN"
out=""
url=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift ;;
    http*) url="$1" ;;
  esac
  shift
done
case "$url" in
  */identity/v1/oauth2/token)
    if [ "$TOKEN_STATUS" = 000 ]; then echo "curl: (6) Could not resolve host" >&2; printf 000; exit 6; fi
    printf '%s' "$TOKEN_BODY" > "$out"
    printf '%s' "$TOKEN_STATUS"
    ;;
  *)
    if [ "$SEARCH_STATUS" = 000 ]; then echo "curl: (28) Operation timed out" >&2; printf 000; exit 28; fi
    printf '%s' "$SEARCH_BODY" > "$out"
    printf '%s' "$SEARCH_STATUS"
    ;;
esac
FAKE
chmod +x "$work/bin/curl"

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

check_has() {
  if [[ "$3" == *"$2"* ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1"
    echo "  expected to find: $2"
    echo "  in: $3"
  fi
}

check_lacks() {
  if [[ "$3" != *"$2"* ]]; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
    echo "FAIL: $1"
    echo "  expected not to find: $2"
    echo "  in: $3"
  fi
}

client_id=Test-App-PRD-0123456789
client_secret=PRD-not-a-real-secret
good_token='{"access_token":"v^1.1#not-a-real-token","expires_in":7200,"token_type":"Application Access Token"}'
good_search='{"href":"https://api.ebay.com/buy/browse/v1/item_summary/search?q=optiplex&limit=1","total":4321,"limit":1,"itemSummaries":[{"itemId":"v1|1|0","title":"A listing"}]}'

fresh() {
  rm -rf "$work/repo" "$work/curl.log" "$work/curl.stdin"
  mkdir -p "$work/repo/host" "$work/repo/api"
  touch "$work/curl.log" "$work/curl.stdin"
  cp "$here/ebay-check.sh" "$work/repo/host/ebay-check.sh"
  printf 'API_TOKEN=hub-test-token\nEBAY_CLIENT_ID=%s\nEBAY_CLIENT_SECRET=%s\n' "$client_id" "$client_secret" > "$work/repo/api/.env"
}

run() {
  (cd "$work/repo" && PATH="$work/bin:$PATH" CURL_LOG="$work/curl.log" CURL_STDIN="$work/curl.stdin" \
    TOKEN_STATUS="${TOKEN_STATUS:-200}" TOKEN_BODY="${TOKEN_BODY:-$good_token}" \
    SEARCH_STATUS="${SEARCH_STATUS:-200}" SEARCH_BODY="${SEARCH_BODY:-$good_search}" \
    bash host/ebay-check.sh "$@" < /dev/null 2>&1)
}

fresh
output=$(run)
check "with good keys it succeeds" "0" "$?"
check_has "it says the token worked" "Token: eBay replied 200 (good for 7200 seconds)." "$output"
check_has "it says how many listings the search found" "Search: eBay replied 200 and found 4321 listings" "$output"
check_has "it says nothing was bought" "Nothing was bought, bid on or saved." "$output"
check "it makes exactly two requests" "2" "$(grep -c '^curl ' "$work/curl.log")"
check_has "the first is to eBay's token address" "https://api.ebay.com/identity/v1/oauth2/token" "$(sed -n 1p "$work/curl.log")"
check_has "asking for the plain application scope" "scope=https://api.ebay.com/oauth/api_scope" "$(sed -n 1p "$work/curl.log")"
check_has "the second is one search on the Browse API" "https://api.ebay.com/buy/browse/v1/item_summary/search?q=optiplex&limit=1" "$(sed -n 2p "$work/curl.log")"
check_has "for eBay UK" "X-EBAY-C-MARKETPLACE-ID: EBAY_GB" "$(sed -n 2p "$work/curl.log")"
check_lacks "the secret is never on a command line" "$client_secret" "$(cat "$work/curl.log")"
check_lacks "nor is the token" "not-a-real-token" "$(cat "$work/curl.log")"
check_has "the keys go to curl on its input instead" "user = \"$client_id:$client_secret\"" "$(cat "$work/curl.stdin")"
check_has "and so does the token" 'header = "Authorization: Bearer v^1.1#not-a-real-token"' "$(cat "$work/curl.stdin")"
check_lacks "the output never shows the secret" "$client_secret" "$output"
check_lacks "or the client id" "$client_id" "$output"
check_lacks "or the token" "not-a-real-token" "$output"
check_lacks "or the API's own token" "hub-test-token" "$output"
check "both requests give up after 15 seconds" "2" "$(grep -c -- '-m 15' "$work/curl.log")"
check "no request follows a redirect" "0" "$(grep -c -- ' -L\| --location' "$work/curl.log")"
check "it leaves nothing behind in the repo folder" "api host" "$(ls "$work/repo" | tr '\n' ' ' | sed 's/ $//')"

fresh
output=$(run sandbox)
check "sandbox succeeds too" "0" "$?"
check_has "sandbox asks the sandbox for a token" "https://api.sandbox.ebay.com/identity/v1/oauth2/token" "$(sed -n 1p "$work/curl.log")"
check_has "and searches the sandbox" "https://api.sandbox.ebay.com/buy/browse/v1/item_summary/search" "$(sed -n 2p "$work/curl.log")"
check "sandbox never calls production" "0" "$(grep -c 'https://api\.ebay\.com/\(identity\|buy\)/' "$work/curl.log")"

fresh
output=$(run production)
check "production can be named" "0" "$?"
check_has "and goes to production" "https://api.ebay.com/identity/v1/oauth2/token" "$(sed -n 1p "$work/curl.log")"

fresh
output=$(run somewhere-else)
check "any other argument is refused" "1" "$?"
check_has "with the usage line" "Usage: bash host/ebay-check.sh [production|sandbox]" "$output"
check "and nothing is sent" "0" "$(grep -c '^curl ' "$work/curl.log")"

fresh
echo "API_TOKEN=hub-test-token" > "$work/repo/api/.env"
output=$(run)
check "with no keys it refuses" "1" "$?"
check_has "saying which are missing" "No EBAY_CLIENT_ID and EBAY_CLIENT_SECRET found in api/.env." "$output"
check "and nothing is sent" "0" "$(grep -c '^curl ' "$work/curl.log")"

fresh
printf 'EBAY_CLIENT_ID=%s\n' "$client_id" > "$work/repo/api/.env"
output=$(run)
check "with only the id it refuses" "1" "$?"
check "and nothing is sent" "0" "$(grep -c '^curl ' "$work/curl.log")"

fresh
output=$(TOKEN_STATUS=401 TOKEN_BODY='{"error":"invalid_client","error_description":"client authentication failed"}' run)
check "refused keys fail" "1" "$?"
check_has "with eBay's status and reason" "Token: eBay replied 401. client authentication failed" "$output"
check "and no search is tried" "1" "$(grep -c '^curl ' "$work/curl.log")"
check_lacks "still without the secret" "$client_secret" "$output"

fresh
output=$(TOKEN_BODY='{"expires_in":7200}' run)
check "a 200 with no token fails" "1" "$?"
check_has "saying so" "Token: eBay replied 200 but sent no token." "$output"
check "and no search is tried" "1" "$(grep -c '^curl ' "$work/curl.log")"

fresh
output=$(SEARCH_STATUS=403 SEARCH_BODY='{"errors":[{"errorId":1100,"domain":"ACCESS","category":"REQUEST","message":"Access denied","longMessage":"Insufficient permissions to fulfill the request."}]}' run)
check "a refused search fails" "1" "$?"
check_has "with eBay's status and message" "Search: eBay replied 403. Access denied" "$output"
check_has "and where to read about it" "See docs/deals.md" "$output"
check_lacks "without the token" "not-a-real-token" "$output"

fresh
output=$(SEARCH_STATUS=500 SEARCH_BODY='' run)
check "an eBay error on the search fails" "1" "$?"
check_has "with the status" "Search: eBay replied 500." "$output"
check_lacks "and no talk of permissions" "aren't allowed" "$output"

fresh
printf 'EBAY_CLIENT_ID=%s\nEBAY_CLIENT_SECRET=%s\n' "$client_id" 'se"cr\et=with=equals' > "$work/repo/api/.env"
output=$(run)
check "a secret with quotes, a backslash and equals signs still works" "0" "$?"
check_has "and reaches curl whole, escaped for its config format" 'user = "Test-App-PRD-0123456789:se\"cr\\et=with=equals"' "$(cat "$work/curl.stdin")"

fresh
printf 'EBAY_CLIENT_ID=old-id-left-behind\nEBAY_CLIENT_SECRET=old-secret-left-behind\nEBAY_CLIENT_ID=%s\nEBAY_CLIENT_SECRET=%s\n' "$client_id" "$client_secret" > "$work/repo/api/.env"
output=$(run)
check "with a key written twice, it still works" "0" "$?"
check_has "using the last one, as Docker does" "user = \"$client_id:$client_secret\"" "$(cat "$work/curl.stdin")"
check_lacks "and the earlier one is never sent" "old-id-left-behind" "$(cat "$work/curl.stdin")"
check_lacks "or shown" "old-id-left-behind" "$output"
check "in two requests, as usual" "2" "$(grep -c '^curl ' "$work/curl.log")"

fresh
output=$(TOKEN_STATUS=000 run)
check "an eBay that can't be reached fails" "1" "$?"
check_has "saying it couldn't be reached" "Token: couldn't reach api.ebay.com. This says nothing about the keys." "$output"
check_lacks "without blaming the keys" "aren't being accepted" "$output"
check_lacks "and without a stray error about a missing file" "No such file" "$output"

fresh
output=$(SEARCH_STATUS=000 run)
check "a search that can't reach eBay fails" "1" "$?"
check_has "saying so" "Search: couldn't reach api.ebay.com." "$output"
check_lacks "without talk of permissions" "aren't allowed" "$output"
check_lacks "and without the token" "not-a-real-token" "$output"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
