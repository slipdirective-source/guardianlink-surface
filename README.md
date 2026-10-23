# GuardianLink Surface

**A record that keeps itself straight.**

You write down what happened, in plain words — *"Took the evening dose at
21:00"*, *"The meeting moved to Thursday"* — and ask what it means. Surface
answers from your record, and it has one rule it never breaks: **if your
record disagrees with itself, it shows you the disagreement.** It doesn't
quietly pick a winner, and it doesn't tidy corrections away. A conflict is
shown as a conflict. A correction stays tied to the thing it corrects, out
in the open. What it doesn't know, it says it doesn't know.

It feels like a notebook. Underneath, it's anything but casual — every
answer is worked out the same careful way, every time, from the same
record. Smooth to use; rigorous where it counts.

And this surface is one piece of a larger idea. GuardianLink is built so
you can **hand your cares over and trust them held**: it watches on your
behalf, keeps them straight, and enforces your best interests by
default. The only thing that ever overrides it is you — expressly,
by deliberate decision. Your authorship outranks its model of your
interests, always. What you're looking at in this repository is the
record-keeping surface of that system — the piece that keeps the story
straight — not the parts that act in the world.

## Try it

**Live demo — nothing to install:**
https://slipdirective-source.github.io/guardianlink-surface/
(the demo button on that page opens the surface itself)

**Android app:** download the APK from the
[latest release](https://github.com/slipdirective-source/guardianlink-surface/releases/latest)
and open it on your phone. Fully offline, no permissions requested, no
account. Android will ask you to confirm the install — it's a
debug-signed research build; see *Honest limits* below.

**Terminal / desktop package:** download
`guardianlink-surface-harness-2026-10-23.zip` from the same release,
unzip it, and follow `README.txt` inside. It runs on anything with
Node.js 18+ (on Android, that means Termux), and includes the surface web
app served locally, a home-screen install route, the observer console,
and a command-line harness (`node harness.js demo`,
`node harness.js run <file>`, `node harness.js repl`).

## What it does

Every answer is shown through five lenses over your record:

- **Position** — where am I right now?
- **History** — how did I get here?
- **Relationships** — what is interacting with what?
- **Trajectory** — where is this going?
- **Agency** — what can I do about it?

Conflicting statements surface as conflicting signals, never as a
silently resolved answer. Retractions bind to the statement they
withdraw. Uncertainty is displayed with the answer, not buried under
it. The same record always produces the same answer.

## Privacy, by construction

- Everything runs on your device. Nothing is uploaded anywhere; the
  surface makes no network calls of its own.
- The record lives **in memory only**. Close the app or reload the page
  and it is gone — unless you explicitly export it (a JSON file you
  download) and later import that file back. There is no account, no
  sync, and no silent persistence.

## Honest limits

- **Research build.** The surface is a verification-tested research
  artifact, not a finished product. Expect edges.
- **Debug-signed APK.** The Android build is signed with a debug key,
  not a release key, and is not on any app store. Android will warn you
  and ask you to allow the install.
- **The observer console's capability panel needs the GuardianLink
  engine**, a separate component that is not included in this package.
  Without it, that one panel reports the capability state as
  unavailable — honestly, rather than inventing data. Everything else
  works standalone.
- **Session-only record.** If you don't export, closing the app
  discards the record. That is a design decision, not a bug.

## Repository layout

- `package/` — the downloadable harness package (surface web app,
  observer console, local server, CLI harness, shell launchers); the
  same bytes as the release zip.
- `android/` — the minimal Android app: a single-activity WebView
  wrapper with the surface bundled as assets, built by CI.
- `site/` — the landing page and the static surface copy served as the
  live demo (`site/demo/`).
- `package/build-src/` — the TypeScript sources the surface and the
  harness are built from.

## How it was verified

The surface build in this repository is the pinned build from a blind
holdout verification run: fresh test cases the surface had never seen,
run once against a build frozen beforehand by a SHA-256 manifest, and
scored from the raw outputs and admission logs. Its fix history —
including failures that were found, kept on the record, and fixed — is
part of the project's own trajectory. Which is, rather, the point of
the thing.
