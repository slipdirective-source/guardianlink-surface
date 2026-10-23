// Surface application: owns the record and the view state, calls the
// real pipeline, and re-renders. Lens switching changes only the view —
// the record (and each entry's SurfaceResponse) is untouched, which is
// what "lenses, not tabs" means mechanically.

import { answer } from "../../src/surface";
import { parseComposedRecord } from "../../src/deterministic_reasoner";
import {
  ChainStatus,
  EntryKind,
  EntryOrigin,
  LensId,
  RecordEntry,
  ViewId,
  entryHash,
  nextAnchor,
  verifyChain,
} from "./model";
import { esc, layerKey, renderApp } from "./render";
import {
  CORPUS_FIXTURES,
  DEMO_CONTEXT_LABEL,
  DEMO_SOVEREIGN_CONTEXT,
} from "./fixtures";

export interface AskOptions {
  sovereignContext?: Record<string, unknown> | null;
  contextLabel?: string | null;
  source?: "live" | "fixture";
  // Ingestion stamps, set by the capture path (see model.ts). Callers
  // pass the boundary facts; the entry text plays no part in them.
  kind?: EntryKind;
  origin?: EntryOrigin;
  // The user's stated event time (asserted_at) — a claim, set from a
  // distinct boundary field; never confused with the admission stamp.
  assertedAt?: string;
}

export interface EntrySubmission {
  kind: EntryKind;
  text: string;
  // For kind "question": the lens the question is put to. Ignored for
  // observations (an observation is admitted as position evidence).
  questionType?: string;
  // The capture source, chosen at the boundary (form control or caller).
  origin: EntryOrigin;
  // The user's stated event time, if they give one (a claim).
  assertedAt?: string;
  sovereignContext?: Record<string, unknown> | null;
  contextLabel?: string | null;
}

// --- Record persistence policy (decided 2026-10-21, board docket via
// Caleb; see ui/README.md). The record lives IN MEMORY ONLY. Nothing is
// written to localStorage, sessionStorage, or IndexedDB — silent browser
// persistence of longitudinal personal data would sit outside the
// fail-closed story. The record crosses a reload only through an
// explicit, user-invoked export (a JSON file the user downloads) and an
// explicit import of such a file.
export const RECORD_EXPORT_FORMAT = "guardianlink-cognitive-surface/record";
// v2: entries may carry hash-chain links (see model.ts). v1 exports
// remain importable as legacy-unchained records — displayed as such,
// never silently upgraded (decided policy, ui/README.md).
export const RECORD_EXPORT_VERSION = 2;

export interface RecordExport {
  format: typeof RECORD_EXPORT_FORMAT;
  version: number;
  entries: RecordEntry[];
}

export class SurfaceApp {
  entries: RecordEntry[] = [];
  view: ViewId = "home";
  private selectedId: number | null = null;
  private expanded = new Set<string>();
  private nextSeq = 1;

  constructor(private root: HTMLElement) {
    this.bindEvents();
    this.render();
  }

  get selected(): RecordEntry | null {
    return this.entries.find((e) => e.id === this.selectedId) ?? null;
  }

  // Put a question to the record through the real pipeline. All five
  // lenses are composed for every entry (lensThreshold 0) so that lens
  // switching is a pure re-render of this same response.
  ask(text: string, type: string, opts: AskOptions = {}): RecordEntry {
    // --- App-level composition path (fix sprint, spec §8.4 as ruled).
    // A plain question — no explicit sovereignContext supplied by the
    // caller, kind "question" — is put to the record the app actually
    // holds: the admitted OBSERVATION entries, in admission order,
    // composed in the frozen stamp format
    // `[asserted_date ?? at · origin] text` with the question as the
    // closing line and a timeline built from the same entries (the
    // harness's mechanic-B shape, produced by the app itself). This
    // is what lets the conflict/retraction mechanisms fire in live
    // use instead of only under the evaluation harness.
    // Discipline:
    //  - an explicit sovereignContext (including null, as the form,
    //    fixtures, demo context, submitEntry, and the holdout harness
    //    all pass) ALWAYS takes the legacy single-entry path;
    //  - fewer than two observation entries, or a composed text that
    //    does not parse as a composed record, falls back to the
    //    legacy path — composition failure never blocks a question;
    //  - question entries are not evidence lines: only observations
    //    compose. Every pre-sprint caller pattern (question-only
    //    records, chain tests, fixtures) therefore stays legacy.
    const kind = opts.kind ?? "question";
    let composedText: string | null = null;
    let composedContext: Record<string, unknown> | null = null;
    if (
      !Object.prototype.hasOwnProperty.call(opts, "sovereignContext") &&
      kind === "question"
    ) {
      try {
        const evidence = this.entries.filter((e) => e.kind === "observation");
        if (evidence.length >= 2) {
          const lineDate = (e: RecordEntry) => (e.asserted_at ?? e.at).slice(0, 10);
          const candidate =
            evidence.map((e) => `[${lineDate(e)} · ${e.origin}] ${e.question_text}`).join("\n") +
            "\n\n" +
            text;
          if (parseComposedRecord(candidate) !== null) {
            composedText = candidate;
            composedContext = {
              timeline: evidence.map((e) => ({ when: lineDate(e), event: e.question_text })),
            };
          }
        }
      } catch {
        composedText = null;
        composedContext = null;
      }
    }
    const isComposed = composedText !== null;
    const response = answer(
      { type, text: isComposed ? (composedText as string) : text },
      isComposed ? composedContext : opts.sovereignContext ?? null,
      { lensThreshold: 0 }
    );
    const entry: RecordEntry = {
      id: this.nextSeq,
      seq: this.nextSeq,
      // observed_at: this system's clock at admission. The stated
      // event time, when the user gives one, is asserted_at — a
      // separate field, never this one.
      at: new Date().toISOString(),
      question_type: type,
      // Composed text rides in question_text, so the entry's stored
      // form is exactly what the pipeline answered over.
      question_text: isComposed ? (composedText as string) : text,
      source: opts.source ?? "live",
      kind: opts.kind ?? "question",
      origin: opts.origin ?? (opts.source === "fixture" ? "fixture" : "manual_entry"),
      context_label: opts.contextLabel ?? null,
      ...(opts.assertedAt ? { asserted_at: opts.assertedAt } : {}),
      response,
    };
    // Chain the entry at admission: it links to whatever the record's
    // tail anchors to (genesis, the last entry's hash, or the legacy
    // anchor when the tail is unchained legacy history).
    // COMPOSED entries are chain-EXCLUDED: the composed text is
    // derived from the record, not a witnessed capture, so writing a
    // chain link over it would manufacture a tamper-evidence claim
    // the chain cannot honestly make (model.ts is untouched; the
    // record's status honestly reads legacy-unverified once a
    // composed entry is present, and later entries anchor to the
    // legacy anchor as with any unchained tail).
    if (!isComposed) {
      const anchor = nextAnchor(this.entries);
      entry.chain = { prev: anchor, hash: entryHash(entry, anchor) };
    }
    this.nextSeq += 1;
    this.entries.push(entry);
    this.selectedId = entry.id;
    // Raw layer starts peeled in every lens; the rest start covered.
    for (const l of response.lenses) {
      this.expanded.add(layerKey(entry.id, l.cluster_id as LensId, "raw"));
    }
    this.render();
    return entry;
  }

  // The ingestion path: a typed submission from the capture layer.
  // Source and timestamp are stamped HERE, at the boundary — the
  // submission's text is content and is never consulted for them.
  // Both kinds flow through answer() identically; an observation is a
  // statement admitted as position evidence (the position lens reads
  // "where am I?" over the stated fact), a question is put to its lens.
  submitEntry(sub: EntrySubmission): RecordEntry {
    const text = sub.text.trim();
    if (!text) throw new Error("entry text is empty");
    const type = sub.kind === "observation" ? "position" : sub.questionType ?? "position";
    return this.ask(text, type, {
      kind: sub.kind,
      origin: sub.origin,
      assertedAt: sub.assertedAt,
      sovereignContext: sub.sovereignContext ?? null,
      contextLabel: sub.contextLabel ?? null,
    });
  }

  loadFixture(caseId: string): RecordEntry {
    const f = CORPUS_FIXTURES.find((c) => c.case_id === caseId);
    if (!f) throw new Error(`unknown fixture ${caseId}`);
    return this.ask(f.text, f.question_type, { source: "fixture" });
  }

  loadDemoContext(): RecordEntry {
    return this.ask("How did I get here?", "history", {
      sovereignContext: DEMO_SOVEREIGN_CONTEXT,
      contextLabel: DEMO_CONTEXT_LABEL,
      source: "fixture",
    });
  }

  // Serialize the record for explicit export. Pure function of the
  // record: two exports of the same record are byte-identical, and an
  // export -> import -> export round-trip is byte-identical.
  exportRecord(): string {
    const payload: RecordExport = {
      format: RECORD_EXPORT_FORMAT,
      version: RECORD_EXPORT_VERSION,
      entries: this.entries,
    };
    return JSON.stringify(payload, null, 2);
  }

  // Load a record previously produced by exportRecord(). Replaces the
  // in-memory record wholesale; validates the envelope and the entry
  // shape before applying anything (a bad file changes nothing).
  importRecord(json: string): number {
    const parsed = JSON.parse(json) as Partial<RecordExport>;
    if (
      parsed.format !== RECORD_EXPORT_FORMAT ||
      (parsed.version !== 1 && parsed.version !== RECORD_EXPORT_VERSION) ||
      !Array.isArray(parsed.entries)
    ) {
      throw new Error("not a cognitive-surface record export");
    }
    for (const e of parsed.entries) {
      if (
        typeof e?.id !== "number" ||
        typeof e?.seq !== "number" ||
        typeof e?.question_text !== "string" ||
        typeof e?.response !== "object" ||
        e.response === null
      ) {
        throw new Error("record export contains a malformed entry");
      }
    }
    const entries = parsed.entries as RecordEntry[];
    // Tamper-evidence gate (v2): the chain is verified on the entries
    // exactly as they appear in the file, BEFORE anything is applied
    // or normalized. A v2 file claims a chain; a missing link or any
    // mismatch refuses the import wholesale — the current record is
    // untouched, never partially imported. v1 files carry no chain
    // and import as legacy-unchained (see ui/README.md).
    if (parsed.version === RECORD_EXPORT_VERSION) {
      for (const e of entries) {
        if (
          !e.chain ||
          typeof e.chain.prev !== "string" ||
          typeof e.chain.hash !== "string"
        ) {
          throw new Error(
            "record import refused: v2 export contains an entry without a hash-chain link"
          );
        }
      }
      if (verifyChain(entries) === "broken") {
        throw new Error(
          "record import refused: hash chain verification failed (contents do not match their chain)"
        );
      }
    }
    // Import provenance downgrade (board round 2, 2026-10-21). The
    // chain gate above establishes CONSISTENCY ONLY: the file's
    // entries match the file's chain. It cannot establish that any
    // stamp in the file was ever witnessed — a forged export can
    // carry a self-consistent chain and sovereign_dictation stamps,
    // and it would pass that gate. So the import is treated as what
    // it is: the capture event THIS system witnessed. Every entry's
    // effective origin becomes "import", and the stamps the file
    // carried are preserved on the entry as claimed provenance
    // (claimed_origin / claimed_at / claimed_kind) — visible as
    // claims, never as witnessed stamps. Entries that carried no
    // stamps (v1 legacy) simply have no claims to preserve; an entry
    // without a kind defaults to "question", as before. Claimed
    // fields are set only when absent — the first downgrade's claim
    // wins, so re-importing an already-downgraded file preserves the
    // original claim instead of overwriting it with "import".
    //
    // The chain stays valid across the downgrade: canonicalProjection
    // reads the claimed stamps when present (the chain binds the
    // entry as it was chained), and entries appended after the
    // import are local captures — chained over their own witnessed
    // stamps, linking from the imported record's tail hash as before.
    for (const e of entries) {
      if (e.claimed_origin === undefined && e.origin !== undefined) {
        e.claimed_origin = e.origin;
      }
      if (e.claimed_at === undefined && typeof e.at === "string") {
        e.claimed_at = e.at;
      }
      if (e.claimed_kind === undefined && e.kind !== undefined) {
        e.claimed_kind = e.kind;
      }
      e.origin = "import";
      if (e.kind === undefined) e.kind = "question";
    }
    this.entries = entries;
    this.selectedId = entries.length ? entries[entries.length - 1].id : null;
    this.nextSeq = entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    this.expanded = new Set<string>();
    for (const entry of entries) {
      for (const l of entry.response.lenses) {
        this.expanded.add(layerKey(entry.id, l.cluster_id as LensId, "raw"));
      }
    }
    this.render();
    return entries.length;
  }

  /** Live chain-verification status of the in-memory record. */
  chainStatus(): ChainStatus {
    return verifyChain(this.entries);
  }

  // Browser download of exportRecord(). Guarded so non-browser hosts
  // (tests, SSR) can call the click path without a Blob URL API.
  downloadRecord(): void {
    const blob = new Blob([this.exportRecord()], { type: "application/json" });
    if (typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "guardianlink-record.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  setView(view: ViewId): void {
    this.view = view;
    this.render();
  }

  selectEntry(id: number): void {
    if (this.entries.some((e) => e.id === id)) {
      this.selectedId = id;
      this.render();
    }
  }

  toggleLayer(key: string): void {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
    this.render();
  }

  isExpanded(key: string): boolean {
    return this.expanded.has(key);
  }

  render(): void {
    this.root.innerHTML = renderApp({
      entries: this.entries,
      selected: this.selected,
      view: this.view,
      expanded: this.expanded,
    });
    const holder = this.root.querySelector("#fixture-buttons");
    if (holder) {
      holder.innerHTML = CORPUS_FIXTURES.map(
        (f) =>
          `<button data-action="fixture" data-case-id="${esc(f.case_id)}">${esc(f.case_id)} · ${esc(f.category)}</button>`
      ).join("");
    }
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!el) return;
      const action = el.dataset.action;
      if (action === "view") this.setView(el.dataset.view as ViewId);
      else if (action === "select-entry") this.selectEntry(Number(el.dataset.entryId));
      else if (action === "peel") this.toggleLayer(el.dataset.layerKey as string);
      else if (action === "fixture") this.loadFixture(el.dataset.caseId as string);
      else if (action === "fixture-demo-context") this.loadDemoContext();
      else if (action === "export-record") this.downloadRecord();
    });
    this.root.addEventListener("change", (ev) => {
      const input = ev.target as HTMLInputElement;
      if (!input.matches("[data-import-file]")) return;
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        try {
          this.importRecord(text);
        } catch {
          // A malformed import changes nothing (validated before apply).
          // The record on screen is untouched; no silent partial state.
        }
        input.value = "";
      });
    });
    this.root.addEventListener("submit", (ev) => {
      const form = ev.target as HTMLFormElement;
      if (form.id !== "ask-form") return;
      ev.preventDefault();
      const data = new FormData(form);
      const text = String(data.get("qtext") ?? "").trim();
      if (!text) return;
      // The capture boundary: kind and origin come from the form's own
      // controls (the sovereign's selections at capture time), the
      // timestamp is stamped in ask(). The text is content only.
      const kind = (String(data.get("entry_kind") ?? "question") === "observation"
        ? "observation"
        : "question") as EntryKind;
      const originRaw = String(data.get("entry_origin") ?? "manual_entry");
      const origin: EntryOrigin =
        originRaw === "sovereign_dictation" ? "sovereign_dictation" : "manual_entry";
      const demo = data.get("demo_context") === "on";
      // The stated event time is its own boundary field (a claim);
      // it is never parsed out of the text and never touches `at`.
      const assertedAt = String(data.get("asserted_at") ?? "").trim();
      this.submitEntry({
        kind,
        text,
        questionType: String(data.get("qtype") ?? "position"),
        origin,
        assertedAt: assertedAt ? assertedAt : undefined,
        sovereignContext: demo ? DEMO_SOVEREIGN_CONTEXT : null,
        contextLabel: demo ? DEMO_CONTEXT_LABEL : null,
      });
      this.view = "home";
      this.render();
    });
  }
}

export function createApp(root: HTMLElement): SurfaceApp {
  return new SurfaceApp(root);
}
