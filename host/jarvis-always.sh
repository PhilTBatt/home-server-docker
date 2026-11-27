#!/bin/bash

set -u

socket=jarvis
session=jarvis
dir=${HOME_HUB_DIR:-$HOME/docker}
state="$HOME/.local/state/home-hub"
stop_file="$state/jarvis-stop"
self=$(readlink -f "$0")
history=50000
stop_wait=30
quick=60
again=5

setting() {
  sed -n -E "s/^[[:space:]]*(export[[:space:]]+)?$1[[:space:]]*[=:][[:space:]]*//p" "$dir/jarvis/.env" 2> /dev/null | tail -n 1 | sed -E "/^\"[^\"]*\"/{s/^\"([^\"]*)\".*$/\1/;b}; /^'[^']*'/{s/^'([^']*)'.*$/\1/;b}; s/ #.*$//; s/[[:space:]]+$//"
}

running() {
  tmux -L "$socket" has-session -t "$session" 2> /dev/null
}

start() {
  if [ ! -d "$dir" ]; then
    echo "There's no Home Hub folder at $dir." >&2
    exit 1
  fi
  if running; then
    echo "Jarvis is already running. See him with: home-hub-jarvis attach"
    return 0
  fi
  mkdir -p "$state" && rm -f "$stop_file"
  if ! tmux -L "$socket" start-server \; set-option -g history-limit "$history" \; set-option -g mouse on \; new-session -d -s "$session" -x 200 -y 50 -c "$dir" "$self run"; then
    echo "tmux couldn't start Jarvis's session." >&2
    exit 1
  fi
  echo "Jarvis is starting in tmux. See him with: home-hub-jarvis attach"
}

run() {
  cd "$dir" || exit 1
  local ears started ran code pause
  ears=$(setting JARVIS_EARS)
  if [ -n "$ears" ] && [ "$ears" != off ]; then
    echo "Starting ears, which always starts muted. Unmute it on the server with: bash host/ears.sh unmute"
    bash host/ears.sh start || echo "Ears didn't start, so Jarvis will say what he can't do without it."
  fi
  while [ ! -e "$stop_file" ]; do
    started=$(date +%s)
    bash host/jarvis.sh
    code=$?
    [ -e "$stop_file" ] && break
    ran=$(($(date +%s) - started))
    pause=$again
    [ "$ran" -lt "$quick" ] && pause=$quick
    echo
    echo "Jarvis stopped (exit $code) after $ran seconds. Starting him again in $pause seconds. To stop him until home-hub-jarvis start, press Ctrl+C now."
    sleep "$pause" || break
  done
  echo "Jarvis has stopped, and won't start again until: home-hub-jarvis start"
}

stop() {
  mkdir -p "$state" && touch "$stop_file"
  if ! running; then
    echo "Jarvis isn't running."
    return 0
  fi
  tmux -L "$socket" copy-mode -q -t "$session" 2> /dev/null
  tmux -L "$socket" send-keys -t "$session" C-c
  local waited leftover
  for ((waited = 0; waited < stop_wait; waited++)); do
    if ! running; then
      echo "Jarvis has stopped."
      return 0
    fi
    sleep 1
  done
  tmux -L "$socket" kill-session -t "$session" 2> /dev/null
  leftover=$(docker ps -q --filter label=com.docker.compose.service=jarvis --filter label=com.docker.compose.oneoff=True --filter "label=com.docker.compose.project.working_dir=$dir")
  [ -n "$leftover" ] && docker stop $leftover > /dev/null
  echo "Jarvis didn't stop within $stop_wait seconds, so his tmux session was closed."
}

case "${1:-}" in
  start) start ;;
  run) run ;;
  stop) stop ;;
  restart)
    stop
    start
    ;;
  attach)
    if ! running; then
      echo "Jarvis isn't running. Start him with: home-hub-jarvis start" >&2
      exit 1
    fi
    exec tmux -L "$socket" attach -t "$session"
    ;;
  status)
    if running; then echo "Jarvis is running. See him with: home-hub-jarvis attach"; else echo "Jarvis isn't running."; fi
    ;;
  *)
    echo "Usage: home-hub-jarvis start|stop|restart|attach|status" >&2
    exit 1
    ;;
esac
