#!/bin/sh
# Serve locally so the bundled WASM speech engine and Service Worker work.
D="$(cd "$(dirname "$0")" && pwd)"
PORT=8765
if command -v python3 >/dev/null 2>&1; then
  (cd "$D" && nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >"${TMPDIR:-/tmp}/shahr-credit-advisor-http.log" 2>&1 </dev/null &)
  sleep 1
  URL="http://127.0.0.1:${PORT}/index.html"
elif command -v perl >/dev/null 2>&1; then
  nohup perl "$D/Start-Local-Server.pl" "$PORT" >"${TMPDIR:-/tmp}/shahr-credit-advisor-http.log" 2>&1 </dev/null &
  sleep 1
  URL="http://127.0.0.1:${PORT}/index.html"
else
  URL="file://$D/index.html"
  printf '%s\n' 'Python 3 and Perl were not found: speech Worker/Service Worker features need a local HTTP server.'
fi
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
else
  printf 'Open this URL in a browser: %s\n' "$URL"
fi
