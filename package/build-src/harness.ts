// GuardianLink cognitive-surface CLI harness.
//
// Drives the REAL SurfaceApp (ui/src/app.ts) and the real deterministic
// pipeline (src/) — no mocks. The admission mechanics mirror
// experiment005-h2/runner.ts (mechanic B): each entry is admitted
// through SurfaceApp.submitEntry with the process clock stubbed to the
// entry's observed_at and asserted_at set from the case; the probe is
// a composed record built from the ADMITTED entries, put via ask()
// with the clock at probe time.
//
// SurfaceApp renders into a DOM root in the browser. Headless, the
// only DOM surface it touches is root.innerHTML (write), root
// .querySelector (fixture buttons — absent here, returns null), and
// root.addEventListener. A minimal stub root satisfies it; all state
// and answers come from the app object itself, never from the "DOM".

import { createApp } from "./ui/src/app";

// ---------------- minimal root stub --------------------------------
function fakeRoot(): never {
  return {
    innerHTML: "",
    addEventListener: () => undefined,
    querySelector: () => null,
  } as never;
}

// ---------------- injected clock (runner.ts protocol) ---------------
const RealDate = Date;
let fakeNow = "2026-10-23T12:00:00.000Z";
class FakeDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(fakeNow);
    else super(...(args as [string]));
  }
  static now(): number {
    return new RealDate(fakeNow).getTime();
  }
}
function setClock(iso: string): void {
  fakeNow = iso;
  (globalThis as { Date: unknown }).Date = FakeDate;
}
function restoreClock(): void {
  (globalThis as { Date: unknown }).Date = RealDate;
}

// ---------------- relation extraction -------------------------------
interface ClaimRelationLike {
  type: string;
  parties: { date: string; origin: string; quote: string }[];
  topic_stems?: string[];
  binding?: string | null;
  date_relation?: string;
}

function collectRelations(response: unknown): ClaimRelationLike[] {
  const out: ClaimRelationLike[] = [];
  const seen = new Set<string>();
  const r = response as {
    output?: { signals?: Record<string, unknown> };
    lenses?: { output?: { signals?: Record<string, unknown> } }[];
  };
  const outputs = [r.output, ...(r.lenses ?? []).map((l) => l.output)];
  for (const o of outputs) {
    const rels = (o?.signals?.["claim_relations"] ?? []) as ClaimRelationLike[];
    for (const rel of rels) {
      const key =
        rel.type + "|" + rel.parties.map((p) => p.quote).join("|") + "|" + (rel.binding ?? "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rel);
    }
  }
  return out;
}

function printRelations(response: unknown): void {
  const rels = collectRelations(response);
  if (rels.length === 0) {
    console.log("relations: none surfaced");
    return;
  }
  console.log(`relations surfaced: ${rels.length}`);
  for (const rel of rels) {
    const [a, b] = rel.parties;
    const bind = rel.type === "retraction" ? ` · binding: ${rel.binding ?? "?"}` : "";
    console.log(
      `  [${rel.type} · ${rel.date_relation ?? "?"}${bind} · stems: ${(rel.topic_stems ?? []).join(", ")}]`
    );
    console.log(`    earlier [${a.date} · ${a.origin}] "${a.quote}"`);
    console.log(`    later   [${b.date} · ${b.origin}] "${b.quote}"`);
  }
}

// ---------------- case running (mechanic B) --------------------------
interface CaseEntry {
  text: string;
  origin?: string;
  asserted_at: string;
  observed_at: string;
}
interface CaseSpec {
  id: string;
  question: string;
  question_type?: string;
  entries: CaseEntry[];
}

function runCase(spec: CaseSpec, probeNow: string): void {
  const app = createApp(fakeRoot());
  try {
    for (const e of spec.entries) {
      setClock(e.observed_at);
      app.submitEntry({
        kind: "observation",
        text: e.text,
        origin: (e.origin ?? "manual_entry") as never,
        assertedAt: e.asserted_at,
      });
    }
    const recordEntries = [...app.entries];
    const lineDate = (e: (typeof recordEntries)[number]) =>
      (e.asserted_at ?? e.at).slice(0, 10);
    const composedText =
      recordEntries
        .map((e) => `[${lineDate(e)} · ${e.origin}] ${e.question_text}`)
        .join("\n") +
      "\n\n" +
      spec.question;
    const context = {
      timeline: recordEntries.map((e) => ({
        when: lineDate(e),
        event: e.question_text,
      })),
    };
    setClock(probeNow);
    const probe = app.ask(composedText, spec.question_type ?? "position", {
      sovereignContext: context,
    });
    console.log(`--- case ${spec.id} ---`);
    console.log(`Q: ${spec.question}`);
    console.log(probe.response.answer_text);
    printRelations(probe.response);
    console.log("");
  } finally {
    restoreClock();
  }
}

// ---------------- demo ----------------------------------------------
function cmdDemo(): void {
  console.log("GuardianLink surface harness — demo (real pipeline, no mocks)\n");
  runCase(
    {
      id: "demo-conflict",
      question: "Did I take the evening dose?",
      question_type: "position",
      entries: [
        {
          text: "Took the evening dose.",
          asserted_at: "2026-10-22",
          observed_at: "2026-10-22T20:00:00.000Z",
        },
        {
          text: "Skipped the evening dose.",
          asserted_at: "2026-10-22",
          observed_at: "2026-10-22T21:00:00.000Z",
        },
      ],
    },
    "2026-10-22T22:00:00.000Z"
  );
  runCase(
    {
      id: "demo-retraction",
      question: "What is on record about the ladder?",
      question_type: "position",
      entries: [
        {
          text: "Borrowed a ladder from the neighbor on Tuesday.",
          asserted_at: "2026-10-21",
          observed_at: "2026-10-21T09:00:00.000Z",
        },
        {
          text: "Correction to my earlier note: I did not borrow a ladder; I borrowed a step stool.",
          asserted_at: "2026-10-22",
          observed_at: "2026-10-22T09:00:00.000Z",
        },
      ],
    },
    "2026-10-22T12:00:00.000Z"
  );
}

// ---------------- run <file.json> ------------------------------------
function cmdRun(file: string): void {
  const fs = require("fs") as typeof import("fs");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as {
    probe_now?: string;
    cases: CaseSpec[];
  };
  if (!Array.isArray(data.cases)) throw new Error("cases file has no cases[] array");
  for (const c of data.cases) {
    const last = c.entries[c.entries.length - 1];
    const probeNow = data.probe_now ?? last?.observed_at ?? new RealDate().toISOString();
    runCase(c, probeNow);
  }
}

// ---------------- repl ------------------------------------------------
function cmdRepl(): void {
  const readline = require("readline") as typeof import("readline");
  const app = createApp(fakeRoot());
  console.log("GuardianLink surface — interactive session (in-memory only)");
  console.log('  "+ <text>"  add an observation, stamped now');
  console.log('  "? <text>"  ask a question over the record');
  console.log('  "record"    print the current record');
  console.log('  "quit"      exit');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("gl> ");
  rl.prompt();
  rl.on("line", (line: string) => {
    const t = line.trim();
    try {
      if (t === "quit" || t === "exit") {
        rl.close();
        return;
      } else if (t === "record") {
        if (app.entries.length === 0) console.log("(record is empty)");
        for (const e of app.entries) {
          console.log(`#${e.seq} [${e.at} · ${e.origin} · ${e.kind}] ${e.question_text}`);
        }
      } else if (t.startsWith("+ ")) {
        const now = new RealDate();
        const e = app.submitEntry({
          kind: "observation",
          text: t.slice(2),
          origin: "manual_entry",
          assertedAt: now.toISOString().slice(0, 10),
        });
        console.log(`admitted #${e.seq} at ${e.at}`);
      } else if (t.startsWith("? ")) {
        const probe = app.ask(t.slice(2), "position");
        console.log(probe.response.answer_text);
        printRelations(probe.response);
      } else if (t.length > 0) {
        console.log('unknown input — start with "+ ", "? ", or type "record" / "quit"');
      }
    } catch (err) {
      console.error("error:", err instanceof Error ? err.message : String(err));
    }
    rl.prompt();
  });
  rl.on("close", () => {
    console.log("session ended — record was in memory only, nothing was saved.");
  });
}

// ---------------- main -------------------------------------------------
function main(): void {
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "demo") cmdDemo();
  else if (cmd === "run" && arg) cmdRun(arg);
  else if (cmd === "repl") cmdRepl();
  else {
    console.log("usage:");
    console.log("  node harness.js demo           built-in conflict + retraction scenarios");
    console.log("  node harness.js run <file>     run a mapped-cases JSON file");
    console.log("  node harness.js repl           interactive session");
    process.exit(cmd ? 1 : 0);
  }
}

main();
