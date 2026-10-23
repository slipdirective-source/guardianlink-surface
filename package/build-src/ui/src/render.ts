// Rendering: pure functions from (record, view state) to HTML strings.
//
// Ontology rendered, not paraphrased:
//  - the four evidence layers are sibling sections, never nested, never
//    fused into one analysis blob;
//  - relationship cards carry their class and a strictly ordered visual
//    weight (1..4); candidate_causal never renders at demonstrated
//    weight;
//  - agency actions carry their gate state; an action requiring
//    sovereign assent renders as requiring it and contains no button;
//  - uncertainty is a panel of five distinct epistemic states, present
//    on every view;
//  - an urgent action, when the pipeline emits one, is the first
//    element of the view.

import { ClusterOutput, SurfaceResponse } from "../../src/types";
import { AssertedRelation, CandidateAction } from "../../src/reasoner";
import {
  AnalysisView,
  CHAIN_STATUS_LABEL,
  ENTRY_ORIGIN_LABEL,
  LENSES,
  LensId,
  RecordEntry,
  RELATIONSHIP_CLASS_LABEL,
  RELATIONSHIP_WEIGHT,
  UNCERTAINTY_STATE_LABEL,
  UncertaintyState,
  ViewId,
  analysisViewOf,
  authorityPresentation,
  epistemicView,
  hasClaimedProvenance,
  lensOutputOf,
  primaryView,
  urgentActionOf,
  verifyChain,
} from "./model";

export interface RenderState {
  entries: RecordEntry[];
  selected: RecordEntry | null;
  view: ViewId;
  expanded: ReadonlySet<string>; // peel keys: `${entryId}:${lensId}:${layer}`
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layerKey(entryId: number, lens: LensId, layer: string): string {
  return `${entryId}:${lens}:${layer}`;
}

const LAYER_TITLES: Record<string, string> = {
  raw: "RAW — the record, quoted. Not yet interpreted.",
  pattern: "PATTERN — regularities the raw layer supports. Kept separate from the anecdotes beneath them.",
  relationship: "RELATIONSHIP — proposed relations, each classified. Never mixed with raw or pattern.",
  trajectory: "TRAJECTORY — projection, or an explicit null. Distinct from observation.",
};

export function renderApp(state: RenderState): string {
  return `
  <header class="chrome">
    <div class="brand">
      <span class="brand-name">GUARDIANLINK</span>
      <span class="brand-sub">cognitive surface — the record, through five lenses</span>
    </div>
    <nav class="lens-switcher" aria-label="Lenses">
      <button data-action="view" data-view="home" data-active="${state.view === "home"}">You, now</button>
      ${LENSES.map(
        (l) => `<button data-action="view" data-view="${l.id}" data-active="${state.view === l.id}" title="${esc(l.capability)}">${esc(l.question)}</button>`
      ).join("")}
    </nav>
    <div class="record-count">RECORD — ${state.entries.length} ${state.entries.length === 1 ? "entry" : "entries"}</div>
  </header>
  ${renderEntrySelector(state)}
  <main class="view" data-view="${state.view}">
    ${state.selected ? renderMain(state, state.selected) : renderEmpty()}
  </main>
  ${renderAskPanel()}
  ${renderFixturePanel()}
  ${renderRecordPanel(state.entries, verifyChain(state.entries))}`;
}

// Record persistence is explicit-only (decided policy, see ui/README.md):
// the record lives in memory; export downloads it as a JSON file, import
// loads such a file back. No ambient browser storage is used anywhere.
function renderRecordPanel(
  entries: RecordEntry[],
  status: ReturnType<typeof verifyChain>
): string {
  const imported = entries.filter((e) => e.origin === "import").length;
  return `<section class="record-panel">
    <h2>The record — persistence is explicit, never ambient</h2>
    <p class="record-policy">This record lives in memory only. It is not written to browser storage.
    Export downloads it as a JSON file; import loads a file you exported. Reloading without importing starts empty.</p>
    <p class="chain-status">Tamper evidence: <span data-chain-status="${esc(status)}">${esc(CHAIN_STATUS_LABEL[status])}</span></p>
    ${imported ? `<p class="record-provenance" data-record-provenance="imported-claim">Record provenance: ${imported} of ${entries.length} ${entries.length === 1 ? "entry" : "entries"} arrived by import — their provenance is imported-claim (the file's stamps, preserved as claims), not witnessed by this system.</p>` : ""}
    <button data-action="export-record">Export record (JSON download)</button>
    <label class="import-label">Import a record export
      <input type="file" data-import-file accept="application/json,.json" />
    </label>
  </section>`;
}

function renderEntrySelector(state: RenderState): string {
  if (state.entries.length === 0) return "";
  return `<div class="entry-selector" role="list" aria-label="Record entries">
    ${state.entries
      .map(
        (e) => `<button role="listitem" data-action="select-entry" data-entry-id="${e.id}" data-selected="${state.selected?.id === e.id}">
          #${e.seq} · ${esc(e.question_text.slice(0, 60))}${e.question_text.length > 60 ? "…" : ""}
        </button>`
      )
      .join("")}
  </div>`;
}

// The entry's provenance line. Three cases, kept distinct:
//  - locally captured: the stamps are witnessed — "admitted <at>
//    (observed) · <origin> · <kind> · stamped at capture";
//  - imported: the only witnessed fact is the import itself. The
//    file's stamps render as what they are — claims ("file claims:
//    … — claims, not witnessed here"), never in the witnessed form;
//  - either way, a stated event time (asserted_at) renders as
//    "stated event time: …" — a claim, visually and verbally
//    distinct from the admission stamp.
export function entryMetaLine(entry: RecordEntry): string {
  const parts: string[] = [`#${entry.seq}`];
  if (entry.origin === "import") {
    parts.push("admitted via import");
    parts.push(esc(ENTRY_ORIGIN_LABEL[entry.origin] ?? entry.origin));
    if (hasClaimedProvenance(entry)) {
      const claims: string[] = [];
      if (entry.claimed_origin !== undefined) {
        claims.push(`origin ${esc(ENTRY_ORIGIN_LABEL[entry.claimed_origin] ?? entry.claimed_origin)}`);
      }
      if (entry.claimed_at !== undefined) claims.push(`admitted ${esc(entry.claimed_at)}`);
      if (entry.claimed_kind !== undefined) claims.push(`kind ${esc(entry.claimed_kind)}`);
      parts.push(`file claims: ${claims.join(", ")} — claims, not witnessed here`);
    }
  } else {
    parts.push(`admitted ${esc(entry.at)}`);
    parts.push(esc(ENTRY_ORIGIN_LABEL[entry.origin] ?? entry.origin));
    parts.push(esc(entry.kind));
    parts.push("stamped at capture");
  }
  if (entry.asserted_at !== undefined) {
    parts.push(`stated event time: ${esc(entry.asserted_at)} (the user's claim — not the admission time)`);
  }
  if (entry.context_label) parts.push(esc(entry.context_label));
  return parts.join(" · ");
}

// Short provenance segment for the record timeline: same distinctions,
// compressed. Imported entries never render with a witnessed origin.
export function provenanceShort(entry: RecordEntry): string {
  const base =
    entry.origin === "import"
      ? "imported record file — provenance is the file's claim, not witnessed here"
      : (ENTRY_ORIGIN_LABEL[entry.origin] ?? entry.origin);
  return entry.asserted_at !== undefined
    ? `${base} · stated event time ${entry.asserted_at}`
    : base;
}

function renderEmpty(): string {
  return `<section class="empty">
    <h1>You, now</h1>
    <p>No entries in the record yet. Ask a question below, or load a frozen-corpus fixture.
    Every answer is produced by the shipped pipeline (deterministic backend) and enters the record.</p>
  </section>`;
}

function renderMain(state: RenderState, entry: RecordEntry): string {
  if (state.view === "home") return renderHome(state, entry);
  return renderLens(state, entry, state.view);
}

// --- Home: "You, now" -----------------------------------------------------

function renderHome(state: RenderState, entry: RecordEntry): string {
  const r = entry.response;
  const urgent = urgentActionOf(r);
  const view = primaryView(r);
  return `
  <article class="entry" data-entry-id="${entry.id}">
    ${urgent ? renderUrgent(urgent) : ""}
    <section class="now" data-section="position-now">
      <h1>You, now</h1>
      <p class="entry-meta">${entryMetaLine(entry)}</p>
      <p class="question-text">${esc(entry.question_text)}</p>
      <p class="position-statement">${esc(r.output.summary)}</p>
    </section>
    ${renderCapabilityStrip(entry)}
    ${view.candidate_actions.length ? renderActions(view.candidate_actions, "What can be done — candidate actions, each authority-checked") : ""}
    ${renderUncertaintyPanel(r)}
    <section class="peel-block">
      <h2>Evidence beneath this answer — primary lens (${esc(r.cluster_id)}), layers peelable</h2>
      ${renderLayers(state, entry, r.cluster_id as LensId, r.output)}
    </section>
    <details class="composed">
      <summary>Pipeline composed answer_text (verbatim)</summary>
      <pre>${esc(r.answer_text)}</pre>
    </details>
  </article>`;
}

function renderCapabilityStrip(entry: RecordEntry): string {
  const r = entry.response;
  const view = primaryView(r);
  const relOut = lensOutputOf(r, "relationships");
  const histOut = lensOutputOf(r, "history");
  const topClass = relOut?.output.evidence.relationship.relationship_class ?? "observed_sequence";
  const relCount = relOut ? analysisViewOf(relOut.output).relations.length : 0;
  const gates = view.candidate_actions.map((a) => authorityPresentation(a).gate);
  const cards: { cap: string; title: string; body: string }[] = [
    { cap: "position", title: "Position", body: r.output.summary },
    {
      cap: "patterns",
      title: "Patterns",
      body: view.regularities.length
        ? view.regularities.join(" ")
        : "No regularity stated — a single observation is not a pattern.",
    },
    {
      cap: "relationships",
      title: "Relationships",
      body: `${relCount} asserted relation(s); strongest class on record: ${topClass}. Classes are never mixed.`,
    },
    {
      cap: "history",
      title: "History",
      body: histOut?.output.summary ?? "No history lens output.",
    },
    {
      cap: "trajectory",
      title: "Trajectory",
      body: view.projection
        ? `Projection (distinct from observation): ${view.projection.statement} Confidence ${view.projection.confidence}.`
        : `No projection. ${view.trajectory_null_reason ?? ""}`,
    },
    {
      cap: "agency",
      title: "Agency",
      body: view.candidate_actions.length
        ? `${view.candidate_actions.length} candidate action(s); gate states: ${gates.join(", ")}.`
        : "No candidate actions emitted.",
    },
    {
      cap: "uncertainty",
      title: "Uncertainty",
      body: `Cross-cut over all lenses: ${r.uncertainty.toFixed(2)} · sources: ${r.uncertainty_sources.map((s) => s.name).join(", ") || "none"}.`,
    },
  ];
  return `<section class="capabilities">
    ${cards
      .map(
        (c) => `<div class="cap-card" data-capability="${c.cap}">
          <h3>${esc(c.title)}</h3><p>${esc(c.body)}</p>
        </div>`
      )
      .join("")}
  </section>`;
}

// --- Lens views -------------------------------------------------------------

function renderLens(state: RenderState, entry: RecordEntry, lens: LensId): string {
  const r = entry.response;
  const urgent = urgentActionOf(r);
  const lensOut = lensOutputOf(r, lens);
  const meta = LENSES.find((l) => l.id === lens)!;
  if (!lensOut) {
    return `<article class="entry" data-entry-id="${entry.id}"><p>No ${esc(lens)} lens output in this response.</p></article>`;
  }
  const out = lensOut.output;
  const view = analysisViewOf(out);
  const ranked = r.ranked_clusters
    .map((rc) => `${rc.cluster.id}:${rc.relevance_score.toFixed(2)}`)
    .join(" · ");
  let specific = "";
  if (lens === "relationships") {
    specific = view.relations.length
      ? renderRelations(view.relations)
      : `<p class="none-asserted">${esc(out.evidence.relationship.description)}</p>`;
  } else if (lens === "agency") {
    specific = view.candidate_actions.length
      ? renderActions(view.candidate_actions, "Candidate actions — gate state is part of the rendering")
      : `<p>No candidate actions emitted by the agency lens for this entry.</p>`;
  } else if (lens === "trajectory") {
    specific = view.projection
      ? `<div class="projection" data-trajectory="projection" aria-label="Trajectory: a projection is stated, distinct from observation"><h3>Projection — distinct from observation</h3>
           <p>${esc(view.projection.statement)}</p>
           <p>Assumptions: ${esc(view.projection.assumptions.join("; "))}</p>
           <p>Confidence: ${view.projection.confidence}</p></div>`
      : `<div class="projection" data-trajectory="null" aria-label="Trajectory: no projection — the record does not support one"><h3>No projection</h3>
           <p>${esc(view.trajectory_null_reason ?? "The record does not support one.")}</p>
           <p>The observations describe where things ARE; they are not a forecast.</p></div>`;
  } else if (lens === "history") {
    specific = renderRecordTimeline(state);
  }
  return `
  <article class="entry" data-entry-id="${entry.id}">
    ${urgent ? renderUrgent(urgent) : ""}
    <section class="lens-head" data-lens-view="${lens}">
      <h1>${esc(meta.question)}</h1>
      <p class="lens-rank">Lens ranking over this record entry: ${esc(ranked)} · this lens relevance ${lensOut.relevance_score.toFixed(2)}</p>
      <p class="lens-summary">${esc(out.summary)}</p>
    </section>
    ${specific}
    ${renderUncertaintyPanel(r)}
    <section class="peel-block">
      <h2>Evidence beneath this lens — four layers, peelable, never fused</h2>
      ${renderLayers(state, entry, lens, out)}
    </section>
  </article>`;
}

function renderRecordTimeline(state: RenderState): string {
  const items = state.entries
    .map((e) => {
      const urgent = urgentActionOf(e.response);
      return `<li class="record-item" data-record-entry="${e.id}">
        <button data-action="select-entry" data-entry-id="${e.id}" data-selected="${state.selected?.id === e.id}">
          <span class="rec-seq">#${e.seq}</span>
          <span class="rec-when">admitted ${esc(e.at)}</span>
          <span class="rec-q">${esc(e.question_text)}</span>
          <span class="rec-meta">primary lens ${esc(e.response.cluster_id)} · ${esc(e.kind)} · ${esc(provenanceShort(e))} · uncertainty ${e.response.uncertainty.toFixed(2)}${urgent ? " · URGENT ACTION ON RECORD" : ""}</span>
        </button>
      </li>`;
    })
    .join("");
  return `<section class="record-timeline">
    <h2>The record — how the current position was reached, in order</h2>
    <ol>${items}</ol>
  </section>`;
}

// --- Pieces -----------------------------------------------------------------

export function renderUrgent(action: string): string {
  return `<div class="urgent-banner" data-urgent-action role="alert">
    <span class="urgent-label">DO THIS NOW</span>
    <span class="urgent-text">${esc(action)}</span>
  </div>`;
}

export function renderRelations(relations: AssertedRelation[]): string {
  return `<div class="relations">
    ${relations
      .map((rel) => {
        // Total over the class field: an out-of-enum value (impossible
        // from the typed pipeline, but the DOM is an untrusted-string
        // surface) renders at the weakest weight with the raw string as
        // its own label — it never throws and never gains weight.
        const w = RELATIONSHIP_WEIGHT[rel.relationship_class] ?? 1;
        const label = RELATIONSHIP_CLASS_LABEL[rel.relationship_class] ?? rel.relationship_class;
        return `<article class="rel-card" data-relationship-class="${esc(rel.relationship_class)}" data-rel-weight="${w}" aria-label="Relationship class ${esc(rel.relationship_class)}, evidential weight ${w} of 4 — ${esc(label)}">
          <div class="rel-head">
            <span class="rel-class">${esc(rel.relationship_class)}</span>
            <span class="rel-weight">evidential weight ${w}/4 — ${esc(label)}</span>
          </div>
          <p class="rel-claim">${esc(rel.subject)} ${esc(rel.predicate)} ${esc(rel.object)}</p>
          <p class="rel-just">Basis: ${esc(rel.justification)}</p>
          ${rel.evidence_quotes.map((q) => `<blockquote class="rel-evidence">${esc(q)}</blockquote>`).join("")}
        </article>`;
      })
      .join("")}
  </div>`;
}

export function renderActions(actions: CandidateAction[], title: string): string {
  return `<section class="actions">
    <h2>${esc(title)}</h2>
    ${actions
      .map((a) => {
        const p = authorityPresentation(a);
        const check = a.authority_check;
        return `<div class="action" data-gate="${p.gate}" data-executable="${p.executable}" data-authority-basis="${esc(check?.basis ?? "none")}" aria-label="Action gate state: ${esc(p.label)}">
          <p class="action-text">${esc(a.action)}</p>
          <p class="action-gate">${esc(p.label)}</p>
          ${check ? `<p class="action-note">Authority check — basis: ${esc(check.basis)}; authorized: ${check.authorized}; requires assent: ${check.requires_assent}. ${esc(check.note)}</p>` : ""}
        </div>`;
      })
      .join("")}
  </section>`;
}

export function renderUncertaintyPanel(response: SurfaceResponse): string {
  const ev = epistemicView(response);
  const order: UncertaintyState[] = [
    "known",
    "inferred",
    "suspected",
    "cannot_distinguish",
    "lacks_evidence",
  ];
  return `<aside class="uncertainty-panel" data-uncertainty-panel data-uncertainty-value="${ev.value.toFixed(2)}">
    <h2>Uncertainty — cross-cut over all lenses: ${ev.value.toFixed(2)}</h2>
    ${order
      .map((s) => {
        const items = ev.states[s];
        return `<div class="epistemic" data-uncertainty-state="${s}" aria-label="Uncertainty state: ${esc(UNCERTAINTY_STATE_LABEL[s])}">
          <h3>${esc(UNCERTAINTY_STATE_LABEL[s])}</h3>
          ${
            items.length
              ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
              : `<p class="epistemic-none">— none on this record —</p>`
          }
        </div>`;
      })
      .join("")}
    <p class="uncertainty-sources">Cross-cut sources: ${ev.sources.length ? esc(ev.sources.map((s) => `${s.name} (w ${s.weight}, v ${s.value})`).join("; ")) : "none"}</p>
  </aside>`;
}

export function renderLayers(
  state: RenderState,
  entry: RecordEntry,
  lens: LensId,
  output: ClusterOutput
): string {
  const ev = output.evidence;
  const view = analysisViewOf(output);
  const isOpen = (layer: string) => state.expanded.has(layerKey(entry.id, lens, layer));
  const section = (layer: string, body: string) => `
    <section class="layer" data-layer="${layer}" data-expanded="${isOpen(layer)}">
      <header class="layer-head">
        <span class="layer-name">${layer.toUpperCase()}</span>
        <span class="layer-title">${esc(LAYER_TITLES[layer])}</span>
        <button data-action="peel" data-layer-key="${layerKey(entry.id, lens, layer)}">${isOpen(layer) ? "cover" : "peel"}</button>
      </header>
      <div class="layer-body">${body}</div>
    </section>`;

  const raw = ev.raw;
  const rawBody = `
    <p class="raw-text">${esc(raw.raw_text)}</p>
    <h4>Quoted observations (verbatim from the record)</h4>
    ${(raw.observations ?? view.raw_quotes).map((q) => `<blockquote data-raw-quote>${esc(q)}</blockquote>`).join("") || "<p>— none —</p>"}
    <h4>Record context buckets</h4>
    <ul class="buckets">
      <li>state_snapshot: ${raw.state_snapshot ? esc(JSON.stringify(raw.state_snapshot)) : "absent"}</li>
      <li>delegations: ${raw.delegations ? esc(JSON.stringify(raw.delegations)) : "absent"}</li>
      <li>open_loops: ${raw.open_loops ? esc(JSON.stringify(raw.open_loops)) : "absent"}</li>
      <li>resources: ${raw.resources ? esc(JSON.stringify(raw.resources)) : "absent"}</li>
    </ul>`;

  const pat = ev.pattern;
  const patternBody = `
    <h4>Stated regularities (interpretations over the raw layer — never the quotes themselves)</h4>
    ${(pat.regularities ?? view.regularities).map((g) => `<p class="regularity" data-regularity>${esc(g)}</p>`).join("") || "<p>— no regularity stated —</p>"}`;

  const rel = ev.relationship;
  const relBody = `
    <p class="rel-description">${esc(rel.description)}</p>
    ${view.relations.length ? renderRelations(view.relations) : "<p>— no relation asserted; the absence is recorded at the weakest class —</p>"}`;

  const trajBody = ev.trajectory
    ? `<div data-trajectory="projection">
         <p>${esc(ev.trajectory.statement ?? JSON.stringify(ev.trajectory.projection))}</p>
         <p>Assumptions: ${esc(Object.values(ev.trajectory.assumptions).flat().map(String).join("; "))}</p>
         <p>Horizon: ${esc(String(ev.trajectory.horizon))} · Confidence: ${ev.trajectory.confidence}</p>
       </div>`
    : `<div data-trajectory="null">
         <p>trajectory: null — explicit, never silent.</p>
         <p>${esc(view.trajectory_null_reason ?? "No projection is supported by the record.")}</p>
       </div>`;

  // Four sibling sections under one parent — structure is the non-fusion claim.
  return `<div class="layers" data-layers-for="${lens}">
    ${section("raw", rawBody)}
    ${section("pattern", patternBody)}
    ${section("relationship", relBody)}
    ${section("trajectory", trajBody)}
  </div>`;
}

// --- Input panels -------------------------------------------------------------

function renderAskPanel(): string {
  return `<section class="ask-panel">
    <h2>Add to the record — the capture boundary</h2>
    <p class="capture-policy">Source and time are stamped by this form when the entry is admitted —
    they are never taken from the entry's own text. An entry is a claim from its stamped source,
    admitted to the raw layer only; what it supports beyond that is the pipeline's work, not ingestion's.
    Two clocks are kept apart: the admission stamp is this system's clock (observed), and the optional
    stated event time below is your claim about when it happened (asserted) — the two are never merged.</p>
    <form id="ask-form">
      <label>Entry kind
        <select name="entry_kind">
          <option value="question">Question — put to a lens</option>
          <option value="observation">Observation — a statement, recorded as position evidence</option>
        </select>
      </label>
      <label>Source (stamped at capture)
        <select name="entry_origin">
          <option value="manual_entry">Manual entry — typed by the sovereign</option>
          <option value="sovereign_dictation">Sovereign dictation — spoken by the sovereign</option>
        </select>
      </label>
      <label>Lens (for questions)
        <select name="qtype">
          <option value="position">Where am I?</option>
          <option value="history">How did I get here?</option>
          <option value="relationships">What is interacting with what?</option>
          <option value="trajectory">Where am I going?</option>
          <option value="agency">What can I do about it?</option>
        </select>
      </label>
      <label>Entry text
        <input name="qtext" type="text" autocomplete="off" placeholder="The observation or question, in your own words" />
      </label>
      <label>Stated event time (optional — your claim, kept distinct from the admission stamp)
        <input name="asserted_at" type="text" autocomplete="off" placeholder="e.g. 2026-10-20 or 2026-10-20 09:15 — when you say it happened" />
      </label>
      <label class="demo-toggle"><input name="demo_context" type="checkbox" /> attach the demo sovereign record (fixture) as context</label>
      <button type="submit">Record entry — through the pipeline</button>
    </form>
  </section>`;
}

function renderFixturePanel(): string {
  return `<section class="fixture-panel">
    <h2>Frozen corpus — Surface Experiments 001/002 (fixtures; each runs the real pipeline)</h2>
    <div class="fixture-buttons" id="fixture-buttons"></div>
    <button data-action="fixture-demo-context">Load demo sovereign record (fixture) — “How did I get here?”</button>
  </section>`;
}
