#!/bin/sh
# GuardianLink Surface package — start the server.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-4317}"
echo "GuardianLink Surface:  http://127.0.0.1:$PORT/"
echo "Observer console:      http://127.0.0.1:$PORT/topui/"
PORT="$PORT" exec node server.js
