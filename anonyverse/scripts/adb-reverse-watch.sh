#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8081}"
declare -A applied

echo "[adb-reverse-watch] Watching devices, applying tcp:$PORT reverse to each (Ctrl+C to stop)..."

while true; do
  current=""
  while IFS= read -r serial; do
    [ -z "$serial" ] && continue
    current="$current $serial"
    if [ -z "${applied[$serial]:-}" ]; then
      if adb -s "$serial" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null 2>&1; then
        echo "[adb-reverse-watch] tcp:$PORT reversed -> $serial"
        applied[$serial]=1
      fi
    fi
  done < <(adb devices | tail -n +2 | awk '$2 == "device" {print $1}')

  # Forget devices that disconnected, so a future replug is re-applied and logged.
  for serial in "${!applied[@]}"; do
    case " $current " in
      *" $serial "*) ;;
      *) unset 'applied[$serial]' ;;
    esac
  done

  sleep 2
done
