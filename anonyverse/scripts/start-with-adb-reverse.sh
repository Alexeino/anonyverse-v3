#!/usr/bin/env bash
# Runs the adb-reverse watcher alongside Metro, so every connected device
# (including ones plugged in after Metro starts, or replugged mid-session)
# automatically gets its tcp:8081 reverse tunnel — no manual `adb reverse`.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "$SCRIPT_DIR/adb-reverse-watch.sh" &
WATCH_PID=$!
trap 'kill "$WATCH_PID" 2>/dev/null || true' EXIT

npx react-native start "$@"
