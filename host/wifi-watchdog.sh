#!/bin/bash
# Reconnects the Wi-Fi when the Sky hub stops answering.
# The copy that runs is /usr/local/sbin/wifi-watchdog, started by wifi-watchdog.service.

hub="192.168.0.1"
wifi="wlp2s0"

if ping -c 3 -W 2 "$hub" > /dev/null 2>&1; then
  exit 0
fi

echo "Hub $hub not answering, reconnecting $wifi"
echo "$(date -Iseconds) Hub $hub not answering, reconnecting $wifi" >> /var/log/wifi-watchdog/reconnects.log
ip link set "$wifi" down
sleep 2
ip link set "$wifi" up