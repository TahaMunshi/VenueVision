#!/bin/sh
# Start ngrok tunnel to port 5000 for mobile capture and Tripo3D.
# Start the app first (e.g. docker-compose up), then run this from project root.
# Writes the ngrok URL to .ngrok/public_url so the app (including in Docker) can use it.
cd "$(dirname "$0")"

echo "Starting ngrok tunnel to http://localhost:5000 ..."
ngrok http 5000 &
NGROK_PID=$!
sleep 5
mkdir -p .ngrok
curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  for t in d.get('tunnels', []):
    u = (t.get('public_url') or '').strip()
    if u.startswith('https://'):
      open('.ngrok/public_url', 'w').write(u.rstrip('/'))
      print('URL saved to .ngrok/public_url:', u)
      break
except Exception: pass
" 2>/dev/null || true
wait $NGROK_PID
