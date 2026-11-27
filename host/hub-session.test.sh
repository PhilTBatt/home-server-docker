#!/bin/bash

set -u

here="$(cd "$(dirname "$0")" && pwd)"
work=$(mktemp -d) || exit 1
trap '[ -n "$work" ] && rm -rf "$work"' EXIT

mkdir -p "$work/bin" "$work/hub/host" "$work/hub/api" "$work/home"
cp "$here/hub-session.sh" "$work/hub/host/hub-session.sh"
cat > "$work/bin/curl" <<'FAKE'
#!/bin/bash
headers=$(cat)
echo "args: $*" >> "$CURL_LOG"
echo "stdin: $headers" >> "$CURL_LOG"
if [ -n "${CURL_FAIL:-}" ]; then echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; fi
exit 0
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

token=test-token-0123456789abcdef

fresh() {
  rm -rf "$work/home/.cache" "$work/curl.log"
  touch "$work/curl.log"
  printf 'API_TOKEN=%s\nSESSIONS=%s\n' "$token" "$1" > "$work/hub/api/.env"
}

hook() {
  (cd "$work" && echo '{"hook_event_name":"Stop"}' | HOME="$work/home" PATH="$work/bin:$PATH" CURL_LOG="$work/curl.log" bash "$work/hub/host/hub-session.sh" "$@" 2>&1; echo "exit $?")
}

fresh on
output=$(hook docker waiting)
check "it prints nothing and exits 0, since Claude Code adds a hook's output to what Claude sees" "exit 0" "$output"
log=$(cat "$work/curl.log")
check_has "it tells the hub the session's state, through Caddy, with a short time limit" "-X POST -H @- -H Host: api.home -H Content-Type: application/json -d {\"state\":\"waiting\"} http://localhost/sessions/docker/state" "$log"
check_has "and gives up after 3 seconds" "-m 3" "$log"
check_has "the token goes on curl's input" "stdin: Authorization: Bearer $token" "$log"
check "the token isn't in curl's arguments" "0" "$(grep '^args' "$work/curl.log" | grep -c "$token")"

fresh off
check "with SESSIONS off it asks nothing" "exit 0" "$(hook docker waiting)"
check "and calls nothing" "" "$(cat "$work/curl.log")"

fresh on
rm "$work/hub/api/.env"
check "with no api/.env, as on another computer, it does nothing quietly" "exit 0" "$(hook docker waiting)"
check "and calls nothing" "" "$(cat "$work/curl.log")"

fresh on
printf 'SESSIONS=on\n' > "$work/hub/api/.env"
hook docker waiting > /dev/null
check "with no token it calls nothing" "" "$(cat "$work/curl.log")"

fresh on
for args in "Docker waiting" "docker asleep" "../x waiting" "docker" "" "a_b working"; do
  check "an odd name or state is ignored quietly: $args" "exit 0" "$(hook $args)"
done
check "and nothing was called" "" "$(cat "$work/curl.log")"

fresh on
hook docker working > /dev/null
hook docker working > /dev/null
check "the same state twice within 5 minutes is sent once" "1" "$(grep -c '^args' "$work/curl.log")"
hook docker waiting > /dev/null
check "a new state is sent" "2" "$(grep -c '^args' "$work/curl.log")"
touch -d '10 minutes ago' "$work/home/.cache/home-hub/session-docker"
hook docker waiting > /dev/null
check "and the same one again after 5 minutes, in case the hub restarted" "3" "$(grep -c '^args' "$work/curl.log")"
hook brain waiting > /dev/null
check "each session is kept apart" "4" "$(grep -c '^args' "$work/curl.log")"

fresh on
CURL_FAIL=1 hook docker stopped > /dev/null
hook docker stopped > /dev/null
check "a send that failed is tried again next time" "2" "$(grep -c '^args' "$work/curl.log")"

fresh on
output=$(CURL_FAIL=1 hook docker stopped)
check "and a failure still prints nothing and exits 0" "exit 0" "$output"

settings=$(cat "$here/../.claude/settings.json")
for hook_name in UserPromptSubmit Notification PostToolUse Stop SessionStart SessionEnd; do
  check_has "the docker repo's settings hook $hook_name" "\"$hook_name\"" "$settings"
done
check_has "a prompt means working" 'bash \"$CLAUDE_PROJECT_DIR/host/hub-session.sh\" docker working' "$settings"
check_has "waiting for a permission or an answer means waiting" 'bash \"$CLAUDE_PROJECT_DIR/host/hub-session.sh\" docker waiting' "$settings"
check_has "the session ending means stopped" 'bash \"$CLAUDE_PROJECT_DIR/host/hub-session.sh\" docker stopped' "$settings"
check_has "permission prompts count as waiting" '"matcher": "permission_prompt"' "$settings"
check_has "and so does Claude Code sitting idle" '"matcher": "idle_prompt"' "$settings"

echo "$passed passed, $failed failed"
[ "$failed" -eq 0 ]
