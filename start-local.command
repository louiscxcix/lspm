#!/bin/bash
set -eu
cd "$(dirname "$0")"

if ! curl -fsS --max-time 2 http://127.0.0.1:4173/api/health >/dev/null; then
  mkdir -p ../.local-data
  nohup node server.js >> ../.local-data/launcher.log 2>&1 < /dev/null &
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 2 http://127.0.0.1:4173/api/health >/dev/null; then break; fi
    sleep 1
  done
fi

if ! curl -fsS --max-time 2 http://127.0.0.1:4173/api/health >/dev/null; then
  echo 'Local server could not start. Check ../.local-data/launcher.log.'
  read -r -p 'Press Return to close.' _
  exit 1
fi

open http://127.0.0.1:4173/
