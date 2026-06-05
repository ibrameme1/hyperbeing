#!/usr/bin/env bash
set -e

echo "🚀 Starting HyperBeing..."

# Start backend
cd backend
[ ! -f .env ] && cp .env.example .env && echo "⚠️  Created backend/.env from example"

# Inject Codespaces secrets into .env if the env vars are set but .env still has placeholders
inject_secret() {
  local key="$1"
  local val="${!key}"
  if [ -n "$val" ]; then
    sed -i "s|^${key}=.*|${key}=${val}|" .env
  fi
}
inject_secret ANTHROPIC_API_KEY
inject_secret GOOGLE_API_KEY
inject_secret JWT_SECRET

npm install --silent
node --import ./instrument.js server.js &
BACKEND_PID=$!
echo "✅ Backend running (PID $BACKEND_PID)"

# Start frontend
cd ../frontend
npm install --silent
npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend running (PID $FRONTEND_PID)"

echo ""
echo "🌐 Open: http://localhost:5173"
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
