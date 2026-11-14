#!/bin/bash

hub="192.168.0.1"
wifi="wlp2s0"
log="/var/log/wifi-watchdog/reconnects.log"

if ping -c 3 -W 2 "$hub" > /dev/null 2>&1; then
  exit 0
fi

echo "Hub $hub not answering, reconnecting $wifi"
echo "$(date -Iseconds) Hub $hub not answering, reconnecting $wifi" >> "$log"
tail -n 500 "$log" > "$log.tmp"
mv "$log.tmp" "$log"
ip link set "$wifi" down
sleep 2
ip link set "$wifi" up