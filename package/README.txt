GUARDIANLINK COGNITIVE SURFACE - DOWNLOADABLE PACKAGE
======================================================

WHAT THIS IS
------------
This package is the GuardianLink cognitive surface, packaged to run
on your phone (or any machine with Node.js). It contains:

  - The surface web app: a record you add entries to, answered by the
    real deterministic pipeline through five lenses (position,
    history, relationships, trajectory, agency). Conflicts and
    retractions in the record are surfaced, never silently resolved.
  - The observer console (top UI): trajectory tracking, the nine
    gates board, the Merkle audit view, and the capability panel.
  - A command-line harness that drives the same real engine from a
    terminal: built-in demo scenarios, your own case files, and an
    interactive session.

Everything runs locally. Nothing is uploaded anywhere. Records live
in memory only (see HONEST LIMITS).

The surface code in this package is the exact pinned build from the
H2 verification run (experiment004 post-build pin, 39 files), copied
read-only from the source tree. The prebuilt browser bundles are the
committed ones from that tree.


REQUIREMENTS
------------
Node.js 18 or newer. Nothing else: no npm install, no node_modules,
no build step. The server and the harness are zero-dependency.

On Android, use Termux:

  pkg install nodejs-lts

(termux-open-url, used by the dash launcher if present, comes with
the Termux:API app/package. It is optional - see PUT IT ON YOUR DASH.)


INSTALL
-------
Unzip the package, then enter the folder:

  unzip guardianlink-surface-harness-2026-10-23.zip
  cd guardianlink-surface


RUN THE INTERFACE
-----------------
  sh start.sh

Then open, in your browser:

  Surface (the app):     http://127.0.0.1:4317/
  Observer console:      http://127.0.0.1:4317/topui/

To use a different port:

  PORT=8081 sh start.sh

To stop the server: Ctrl-C in the terminal running it, or close the
Termux session.


PUT IT ON YOUR DASH
-------------------
Route 1 - Chrome install (PWA). The surface is an installable web
app. Start the server once (sh start.sh or sh gl-launch.sh), open
http://127.0.0.1:4317/ in Chrome, open the three-dot menu, and choose
"Install app" or "Add to Home screen". A "GL Surface" icon lands on
your home screen and opens the surface full-screen, like an app.
Note: the page must be served by the package server for Chrome to
offer the install; the server still has to be running for the app to
load, which is what the launcher in Route 2 is for.

Route 2 - Termux:Widget one-tap launcher. This route starts the
server for you when you tap, so you never open a terminal:

  sh install-dash-shortcut.sh

That installs GuardianLink.sh into ~/.shortcuts/ (the folder the
Termux:Widget app reads). Then the two manual steps:

  1. Long-press your home screen, choose Widgets, add the
     Termux:Widget widget, and pick "GuardianLink".
  2. Tap it. If the server is not running, the launcher starts it in
     the background, waits for it, and opens the surface in your
     browser. If it is already running, it just opens the surface -
     it never starts a second copy.

You can also run the launcher by hand any time:

  sh gl-launch.sh

Server output from launched servers goes to ~/gl-surface-server.log.


RUN THE CLI HARNESS
-------------------
The harness drives the same SurfaceApp and pipeline as the web UI,
from the terminal. It needs no server.

Demo - two built-in scenarios (a same-day conflicting pair, and a
retraction), printed with the pipeline's full answer and the
relations it surfaced:

  node harness.js demo

Run your own cases - a JSON file in the mapped-cases format:

  node harness.js run my-cases.json

Format: a top-level object with a "cases" array. Each case has an
"id", a "question", an optional "question_type" (position, history,
relationships, trajectory, agency), and "entries". Each entry has
"text", "asserted_at" (the date you say it happened, e.g.
"2026-10-22"), "observed_at" (ISO timestamp of admission, e.g.
"2026-10-22T20:00:00.000Z"), and an optional "origin" (default
"manual_entry"). A top-level "probe_now" (ISO timestamp) is optional.
Example case:

  {
    "cases": [
      {
        "id": "example-1",
        "question": "Did I lock the gate?",
        "question_type": "position",
        "entries": [
          { "text": "Locked the main gate.",
            "asserted_at": "2026-10-22",
            "observed_at": "2026-10-22T17:00:00.000Z" },
          { "text": "Left the main gate unlocked.",
            "asserted_at": "2026-10-22",
            "observed_at": "2026-10-22T17:15:00.000Z" }
        ]
      }
    ]
  }

Interactive session - a line loop over one live record:

  node harness.js repl

    + some observation     add an entry, stamped now
    ? some question        ask over the record; prints the answer
                           and any conflict/retraction relations
    record                 print the current record entries
    quit                   exit

The record exists only for that session.


PACKAGE CONTENTS
----------------
  server.js              the package server (surface + console +
                         sidecar proxy). PORT and GUARDIANLINK_SIDECAR
                         environment variables override the defaults.
  start.sh               starts server.js and prints the two URLs.
  gl-launch.sh           one-tap launcher (see PUT IT ON YOUR DASH).
  install-dash-shortcut.sh
                         installs the Termux:Widget shortcut.
  harness.js             CLI launcher (loads harness.cjs).
  harness.cjs            the prebuilt harness bundle (real pipeline +
                         SurfaceApp; self-contained).
  build-src/             the TypeScript sources harness.cjs was built
                         from (the pinned src/ tree plus the UI app
                         layer), kept for audit. Not used at runtime.
  ui/                    the surface web app: index.html, dist/
                         (prebuilt bundle.js and bundle.css), its own
                         serve.js (standalone, port 4173),
                         manifest.webmanifest, sw.js, icons/.
  topui/                 the observer console: index.html, bundle.js,
                         styles.css, its own serve.js.


HONEST LIMITS
-------------
  - The observer console's capability panel reads the GuardianLink
    engine sidecar (a separate Kotlin service, NOT in this package)
    at http://127.0.0.1:8080. With no sidecar running, the panel
    shows the engine as unavailable and the server answers /v1/ calls
    with a 502 error. It never fabricates capability data. Everything
    else in both interfaces is the real deterministic pipeline.
  - The record is in memory only, by design. Reloading the page (or
    restarting a repl session) starts empty. The web app can export
    the record as a JSON file and import it back - that is a manual,
    explicit action in the page, never automatic. Nothing is written
    to browser storage, and nothing leaves the device.
  - The service worker caches only the static app shell (page,
    bundles, manifest, icons) so the PWA installs and opens fast.
    It never caches record data or /v1/ responses.
  - The harness's web rendering is the app's own; headlessly, the
    harness prints the pipeline's composed answer_text and the
    claim relations from the response. Same engine, same answers;
    the terminal is just a plainer window.
