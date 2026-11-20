#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

if [ $# -ne 1 ] || { [ "$1" != mute ] && [ "$1" != unmute ]; }; then
  echo "Usage: bash host/ears.sh mute|unmute" >&2
  exit 1
fi

if [ "$1" = mute ]; then
  says=muted
else
  says="unmuted $(date +%s%N)"
fi

part=""
if ! { mkdir -p ears/switch && part=$(mktemp ears/switch/.mute.XXXXXX) && printf '%s\n' "$says" > "$part" && chmod 644 "$part" && mv -f "$part" ears/switch/mute; }; then
  [ -n "$part" ] && rm -f "$part"
  if [ ! -d ears/switch ]; then
    echo "Couldn't make the folder ears/switch, so nothing was written. Ears won't start without it." >&2
    exit 1
  fi
  if [ "$1" = unmute ]; then
    echo "Couldn't write ears/switch/mute, so nothing changed." >&2
    exit 1
  fi
  if rm -f ears/switch/mute 2> /dev/null && [ ! -e ears/switch/mute ]; then
    echo "Couldn't write ears/switch/mute, so it was removed instead. Ears counts a missing switch as muted, and ends any recording within about a second."
    exit 0
  fi
  echo "Couldn't write or remove ears/switch/mute, so ears may still be unmuted. Stop it with: docker compose stop ears" >&2
  exit 1
fi

if [ "$1" = mute ]; then
  echo "Muted. Ears ends any recording within about a second, and records nothing until it's unmuted."
else
  echo "Unmuted. Ears notices within a second. If ears restarts, it comes back muted and needs this again."
fi
