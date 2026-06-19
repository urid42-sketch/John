#!/bin/bash
echo "Starting OSINT Platform..."

cd backend
pip install -r requirements.txt -q
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "Backend running on http://localhost:8000"

cd ../frontend
npm install -q
npm start &
FRONTEND_PID=$!
echo "Frontend running on http://localhost:3000"

trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
