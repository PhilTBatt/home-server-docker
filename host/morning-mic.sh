#!/bin/bash

set -u

dir=${HOME_HUB_DIR:-$HOME/docker}
state_dir="$HOME/.local/state/home-hub"
state="$state_dir/morning-mic"

if ! cd "$dir" 2> /dev/null; then
  echo "There's no Home Hub folder at $dir." >&2
  exit 1
fi

phase=""
day=""

ask_hub() {
  local key reply
  key=$(grep '^API_TOKEN=' api/.env 2> /dev/null | tail -n 1 | cut -d= -f2-)
  [ -n "$key" ] || return 1
  reply=$(printf 'Authorization: Bearer %s\n' "$key" | curl -sS --max-time 5 -H @- -H "Host: api.home" "http://localhost/morning" 2> /dev/null) || return 1
  [[ "$reply" =~ \"phase\":\"([a-z]+)\" ]] || return 1
  phase=${BASH_REMATCH[1]}
  [[ "$reply" =~ \"day\":\"([0-9]{4}-[0-9]{2}-[0-9]{2})\" ]] || return 1
  day=${BASH_REMATCH[1]}
}

ears_state() {
  local said wait=${1:-15}
  if [ -z "$(timeout "$wait" docker compose ps --status running --quiet ears 2> /dev/null)" ]; then
    echo stopped
    return
  fi
  said=$(timeout "$wait" docker compose exec -T ears node dist/ask.js health 2> /dev/null)
  if [[ "$said" =~ ^200\ ([a-z]+)$ ]]; then
    echo "${BASH_REMATCH[1]}"
  else
    echo unknown
  fi
}

write_switch() {
  local part
  part=$(mktemp ears/switch/.mute.XXXXXX 2> /dev/null) || return 1
  if printf '%s\n' "$1" > "$part" && chmod 644 "$part" && mv -f "$part" ears/switch/mute; then
    return 0
  fi
  rm -f "$part"
  return 1
}

keep() {
  mkdir -p "$state_dir" && printf '%s\n' "$1" > "$state"
}

held_day=""
held_what=""
held_switch=""
if [ -f "$state" ]; then
  read -r held_day held_what held_switch < "$state"
fi
switch_now=$(head -n 1 ears/switch/mute 2> /dev/null)

ask_hub || phase=""
case "$phase" in
  speaking | snoozed) waking=yes ;;
  *) waking=no ;;
esac

if [ "$held_what" = open ] && { [ "$waking" = no ] || [ "$held_day" != "$day" ]; }; then
  after=""
  if [ -z "$phase" ]; then
    case "$(ears_state 5)" in
      idle | recording | working) after="$held_day paused" ;;
      *) after="$held_day left" ;;
    esac
  fi
  if [ "$switch_now" != "$held_switch" ]; then
    keep "$held_day left"
    echo "The room mic was changed by hand during the morning, so it's left as it is."
  elif write_switch muted; then
    if [ -n "$after" ]; then
      keep "$after"
      echo "Couldn't ask the hub about the morning, so the room mic is muted for now$([ "$after" = "$held_day paused" ] && echo ", and opened again if the morning's still on")."
    else
      rm -f "$state"
      echo "Muted the room mic again after the morning."
    fi
  else
    echo "Couldn't write ears/switch/mute to mute the room mic after the morning, so it's tried again in a minute. Mute it now with: bash host/ears.sh mute" >&2
    exit 1
  fi
  held_what=""
fi

[ "$waking" = yes ] || exit 0

if [ "$held_day" = "$day" ] && [ "$held_what" = left ]; then
  exit 0
fi

if [ "$held_day" = "$day" ] && [ "$held_what" = open ]; then
  if [ "$switch_now" != "$held_switch" ]; then
    keep "$day left"
    echo "The room mic was changed by hand during the morning, so the morning leaves it as it is."
  fi
  exit 0
fi

case "$(ears_state)" in
  muted | failed)
    says="unmuted morning-$(date +%s%N)"
    if ! [[ "$says" =~ ^unmuted\ morning-[0-9]{1,30}$ ]]; then
      echo "Couldn't make a new mute switch for the morning, so the room mic stays muted." >&2
      exit 1
    fi
    if ! keep "$day open $says"; then
      echo "Couldn't keep a note of the morning in $state_dir, so the room mic stays muted." >&2
      exit 1
    fi
    if write_switch "$says"; then
      echo "Opened the room mic for the morning."
    else
      rm -f "$state"
      echo "Couldn't write ears/switch/mute, so the room mic stays muted this morning." >&2
      exit 1
    fi
    ;;
  idle | recording | working)
    keep "$day left"
    echo "The room mic was already listening, so the morning leaves it as it is."
    ;;
  stopped) ;;
  *)
    echo "Ears didn't say whether it's muted, so the room mic wasn't opened; trying again in a minute." >&2
    ;;
esac
exit 0
