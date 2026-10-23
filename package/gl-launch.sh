#!/bin/sh
# GuardianLink Surface - one-tap launcher (Termux / Android).
#
# Starts the package server in the background if it is not already
# answering on the port, waits for it, then opens the surface in the
# browser. Safe to tap repeatedly: a running server is detected and
# reused, never duplicated.
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SELF_DIR/server.js" ]; then
  DIR="$SELF_DIR"
else
  DIR="__GL_PACKAGE_DIR__"
fi
if [ ! -f "$DIR/server.js" ]; then
  echo "GuardianLink package not found (looked in $DIR)"
  exit 1
fi
cd "$DIR" || exit 1

PORT="${PORT:-4317}"
URL="http://127.0.0.1:$PORT/"

answering() {
  if command -v curl >/dev/null 2>&1; then
    curl -s -o /dev/null --max-time 2 "$URL" >/dev/null 2>&1
  else
    GL_URL="$URL" node -e 'require("http").get(process.env.GL_URL,function(r){r.resume();process.exit(0)}).on("error",function(){process.exit(1)})' >/dev/null 2>&1
  fi
}

if answering; then
  echo "GuardianLink server already running on port $PORT"
else
  echo "starting GuardianLink server on port $PORT ..."
  PORT="$PORT" nohup node server.js >>"$HOME/gl-surface-server.log" 2>&1 &
  i=0
  while [ $i -lt 40 ]; do
    answering && break
    i=$((i + 1))
    sleep 0.25
  done
  answering || {
    echo "server did not come up - see $HOME/gl-surface-server.log"
    exit 1
  }
fi

if command -v termux-open-url >/dev/null 2>&1; then
  termux-open-url "$URL"
elif command -v am >/dev/null 2>&1; then
  am start -a android.intent.action.VIEW -d "$URL" >/dev/null 2>&1 || echo "Open: $URL"
else
  echo "Open: $URL"
fi
