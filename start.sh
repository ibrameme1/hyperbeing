#!/usr/bin/env bash
set -e

echo "🚀 Starting HyperBeing..."

# Start backend
cd backend
[ ! -f .env ] && cp .env.example .env && echo "⚠️  Created backend/.env — add your API keys before using the app"
npm install --silent
node server.js &
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
