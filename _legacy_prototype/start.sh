#!/usr/bin/env bash
# Starts the ML service (port 8001) and the backend + frontend (port ${PORT:-3000}).
set -e
cd "$(dirname "$0")"
if [ ! -d ml/.venv ]; then npm run ml:setup; fi
if [ ! -f ml/model/sakshya_risk.joblib ]; then npm run ml:train; fi
(cd ml && .venv/bin/uvicorn app:app --host 127.0.0.1 --port 8001) &
ML_PID=$!
trap 'kill $ML_PID 2>/dev/null' EXIT
node backend/server.js
