#!/bin/bash

case "$1" in
  "" | production) host=api.ebay.com ;;
  sandbox) host=api.sandbox.ebay.com ;;
  *)
    echo "Usage: bash host/ebay-check.sh [production|sandbox]" >&2
    exit 1
    ;;
esac

id=$(grep '^EBAY_CLIENT_ID=' api/.env | tail -n 1 | cut -d= -f2-)
secret=$(grep '^EBAY_CLIENT_SECRET=' api/.env | tail -n 1 | cut -d= -f2-)
if [ -z "$id" ] || [ -z "$secret" ]; then
  echo "No EBAY_CLIENT_ID and EBAY_CLIENT_SECRET found in api/.env. Run this from ~/docker." >&2
  exit 1
fi

work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

quoted() {
  local value=${1//\\/\\\\}
  printf '%s' "${value//\"/\\\"}"
}

field() {
  [ -f "$2" ] || return
  grep -o "\"$1\" *: *\"[^\"]*\"" "$2" | head -n 1 | sed 's/^[^:]*: *"//; s/"$//'
}

number() {
  [ -f "$2" ] || return
  grep -o "\"$1\" *: *[0-9]*" "$2" | head -n 1 | sed 's/^[^:]*: *//'
}

unreachable() {
  [ -z "$1" ] || [ "$1" = 000 ]
}

echo "Asking $host for a token..."
status=$(printf 'user = "%s:%s"\n' "$(quoted "$id")" "$(quoted "$secret")" | curl -sS -m 15 -K - -o "$work/token" -w '%{http_code}' \
  -d 'grant_type=client_credentials' --data-urlencode 'scope=https://api.ebay.com/oauth/api_scope' \
  "https://$host/identity/v1/oauth2/token")
if unreachable "$status"; then
  echo "Token: couldn't reach $host. This says nothing about the keys."
  exit 1
fi
if [ "$status" != 200 ]; then
  echo "Token: eBay replied $status. $(field error_description "$work/token")"
  echo "The keys in api/.env aren't being accepted for $host."
  exit 1
fi
token=$(field access_token "$work/token")
if [ -z "$token" ]; then
  echo "Token: eBay replied 200 but sent no token."
  exit 1
fi
echo "Token: eBay replied 200 (good for $(number expires_in "$work/token") seconds)."

echo "Searching eBay UK for one listing..."
status=$(printf 'header = "Authorization: Bearer %s"\n' "$(quoted "$token")" | curl -sS -m 15 -K - -o "$work/search" -w '%{http_code}' \
  -H 'X-EBAY-C-MARKETPLACE-ID: EBAY_GB' -H 'Accept: application/json' \
  "https://$host/buy/browse/v1/item_summary/search?q=optiplex&limit=1")
if unreachable "$status"; then
  echo "Search: couldn't reach $host."
  exit 1
fi
if [ "$status" != 200 ]; then
  echo "Search: eBay replied $status. $(field message "$work/search")"
  if [ "$status" = 403 ]; then
    echo "These keys can mint a token but aren't allowed to search listings. See docs/deals.md, \"If eBay says no\"."
  fi
  exit 1
fi
echo "Search: eBay replied 200 and found $(number total "$work/search") listings for \"optiplex\"."
echo "These keys can search. Nothing was bought, bid on or saved."