// Front-end view model for the cognitive surface.
//
// The surface maintains ONE record: an ordered list of entries, each entry
// a question put to the real pipeline (src/surface.ts `answer()`) with its
// full SurfaceResponse. The five questions are LENSES over that same
// record — a lens re-renders the same entry through one cluster's
// projection. Nothing here invents data: every rendered string traces to
// a SurfaceResponse produced by the pipeline, or to the record itself.

import { ClusterOutput, SurfaceResponse } from "../../src/types";
import { sha256Hex } from "./sha256";
import {
  Analysis,
  AssertedRelation,
  AuthorityBasis,
  CandidateAction,
} from "../../src/reasoner";
import { RelationshipClass } from "../../src/evidence_bundle";

export type LensId = "position" | "history" | "relationships" | "trajectory" | "agency";

export const LENSES: { id: LensId; question: string; capability: string }[] = [
  { id: "position", question: "Where am I?", capability: "Position" },
  { id: "history", question: "How did I get here?", capability: "History" },
  { id: "relationships", question: "What is interacting with what?", capability: "Relationships" },
  { id: "trajectory", question: "Where am I going?", capability: "Trajectory" },
  { id: "agency", question: "What can I do about it?", capability: "Agency" },
];

export type ViewId = "home" | LensId;

// --- Ingestion stamps (decided policy, 2026-10-21; see ui/README.md). ----
// Every entry is stamped AT THE CAPTURE BOUNDARY by the app layer: what
// kind of entry it is, where it came from, and when it entered the
// record. The stamps are set from the capture controls / calling code —
// never parsed out of the entry's own text. Entry content that claims a
// different source or time is just content: it lands in question_text
// and moves nothing.
export type EntryKind = "question" | "observation";

export type EntryOrigin =
  | "manual_entry" // typed into the entry form by the sovereign
  | "sovereign_dictation" // dictated by the sovereign, captured at the boundary
  | "fixture" // frozen-corpus fixture, labeled as such
  | "import"; // admitted via record import; original capture not witnessed here

export const ENTRY_ORIGIN_LABEL: Record<EntryOrigin, string> = {
  manual_entry: "manual entry",
  sovereign_dictation: "sovereign dictation",
  fixture: "frozen-corpus fixture",
  import: "imported record file",
};

export interface RecordEntry {
  id: number;
  seq: number;
  // `at` is the admission stamp, and its semantics are OBSERVED_AT:
  // the moment THIS system admitted the entry, on this system's
  // clock, stamped by the capture layer. It is never the time the
  // entry's event is claimed to have happened — that is asserted_at
  // below, a claim. Ordering and the hash chain read `at` (observed);
  // staleness reasoning reads asserted times in the entry text and
  // must never read `at` as an event time (see ui/README.md, time
  // audit). For an entry admitted via import, `at` holds the value
  // the file carried; it is then a claim too (see claimed_at) — the
  // witnessed admission fact for such an entry is origin: "import".
  at: string; // ISO timestamp; observed_at semantics (see above)
  // The user's stated event time — when the user says the event
  // happened. Optional, settable at the capture boundary as a
  // distinct field, stored and displayed as a CLAIM ("stated …"),
  // never merged into `at`. Part of the chain projection when
  // present, so the claim itself is tamper-evident.
  asserted_at?: string;
  question_type: string;
  question_text: string;
  // Provenance, shown in the UI: live input vs. labeled fixture.
  source: "live" | "fixture";
  // Ingestion stamps (see above). kind/origin are boundary facts, not
  // content claims: the text cannot set them.
  kind: EntryKind;
  origin: EntryOrigin;
  // Claimed provenance (import downgrade, board round 2, 2026-10-21).
  // On import, EVERY entry's effective origin becomes "import" — the
  // import is the only capture event this system witnessed — and the
  // stamps the FILE carried are preserved here as claims: visible in
  // the record as claims, never as witnessed stamps. Absent on
  // entries captured locally (their origin/at/kind ARE the witnessed
  // stamps) and on legacy entries that carried no stamps to claim.
  // Set only when absent: the first downgrade's claim wins, so a
  // re-imported file cannot launder an earlier claim away.
  claimed_origin?: EntryOrigin;
  claimed_at?: string;
  claimed_kind?: EntryKind;
  context_label: string | null; // e.g. "demo sovereign record (fixture)"
  response: SurfaceResponse;
  // Tamper-evident hash chain (see below). Absent on legacy entries
  // imported from a v1 export — absence is displayed, never repaired.
  chain?: { prev: string; hash: string };
}

/** True when this entry carries file-claimed provenance from an import. */
export function hasClaimedProvenance(e: RecordEntry): boolean {
  return (
    e.claimed_origin !== undefined ||
    e.claimed_at !== undefined ||
    e.claimed_kind !== undefined
  );
}

// ---------- tamper-evident hash chain ----------
// Each entry admitted since the chain existed carries
// chain = { prev, hash }: prev is the previous entry's hash (or a
// distinguished anchor), hash = SHA-256 over prev + the entry's
// canonical projection. The projection covers the entry's evidentiary
// content — its stamps, its question, and the pipeline's answer text
// and cross-cut value (the deterministic pipeline makes the answer a
// function of question + context, so these two pin the response's
// substance; the full response object is present in the export for
// inspection but is not itself hash-stable JSON).
//
// CLAIM BOUNDARY (board round 2, 2026-10-21): the chain claims
// CONSISTENCY ONLY — these entries were chained together and are
// unmodified since chaining. It does NOT claim AUTHENTICITY: anyone
// can fabricate a self-consistent chain from scratch, so a consistent
// chain says nothing about whether the events happened or whether
// the stamps were ever witnessed by this system. That is why import
// downgrades provenance (see claimed_* on RecordEntry): the chain
// survives the downgrade because the projection is computed over the
// CLAIMED stamps when claims are present — the chain binds the entry
// as it was chained, and the downgrade governs what this system
// treats as witnessed. Authenticity would require anchoring the
// chain to something an importer cannot fabricate (e.g. a
// sovereign-held key signature); that alternative is named, not
// built, and not claimed (see ui/README.md).
//
// Verification is all-or-nothing per entry and never repairs: any
// mismatch marks the record broken. Entries without chain data (v1
// legacy imports) stay chain-less forever — import does not silently
// upgrade their trust; entries appended after them anchor to
// LEGACY_ANCHOR so the boundary between unverified history and
// chained history is itself recorded.

export const GENESIS_ANCHOR = "guardianlink-record-genesis";
export const LEGACY_ANCHOR = "guardianlink-record-legacy-anchor";

export function canonicalProjection(e: RecordEntry): string {
  return JSON.stringify({
    seq: e.seq,
    // The stamps AS CHAINED: for an entry carrying claimed provenance
    // from an import, the chain was computed over the file's claimed
    // stamps, so the projection reads them back — the downgrade is an
    // admission-layer act and does not rewrite chained content. `at`
    // enters under its documented meaning: observed_at, the admission
    // stamp — never an event time.
    at: e.claimed_at ?? e.at,
    kind: e.claimed_kind ?? e.kind,
    origin: e.claimed_origin ?? e.origin,
    question_type: e.question_type,
    question_text: e.question_text,
    source: e.source,
    context_label: e.context_label,
    // asserted_at is chained content when present (the stated-time
    // claim is itself tamper-evident); omitted when absent so chains
    // computed before the field existed still verify.
    ...(e.asserted_at !== undefined ? { asserted_at: e.asserted_at } : {}),
    answer_text: e.response.answer_text,
    uncertainty_value: e.response.uncertainty,
  });
}

export function entryHash(e: RecordEntry, prev: string): string {
  return sha256Hex(prev + "\n" + canonicalProjection(e));
}

/** The anchor a new entry chains onto, given the current record tail. */
export function nextAnchor(entries: RecordEntry[]): string {
  if (entries.length === 0) return GENESIS_ANCHOR;
  const last = entries[entries.length - 1];
  return last.chain ? last.chain.hash : LEGACY_ANCHOR;
}

export type ChainStatus = "consistent" | "legacy-unverified" | "broken" | "empty";

/**
 * Verify a record's chain. "consistent" requires every entry chained
 * and every link recomputed equal, anchored at GENESIS_ANCHOR — and
 * it means exactly that: the entries match their chain. It is a
 * consistency claim, never an authenticity claim (see the claim
 * boundary above); the status is named "consistent", not "verified",
 * so the UI cannot say more than the chain establishes.
 * A record with any chain-less entries can be at most
 * "legacy-unverified" (its chained suffix must still verify, anchored
 * at LEGACY_ANCHOR where the chained run begins). Any mismatch,
 * reordering, or broken link is "broken" — never displayed as either
 * of the other two.
 */
export function verifyChain(entries: RecordEntry[]): ChainStatus {
  if (entries.length === 0) return "empty";
  let expectedPrev: string | null = null;
  let sawChained = false;
  let sawLegacy = false;
  for (const e of entries) {
    if (!e.chain) {
      sawLegacy = true;
      expectedPrev = LEGACY_ANCHOR;
      continue;
    }
    sawChained = true;
    if (expectedPrev === null) expectedPrev = GENESIS_ANCHOR;
    if (e.chain.prev !== expectedPrev) return "broken";
    if (e.chain.hash !== entryHash(e, e.chain.prev)) return "broken";
    expectedPrev = e.chain.hash;
  }
  if (!sawChained) return "legacy-unverified";
  return sawLegacy ? "legacy-unverified" : "consistent";
}

export const CHAIN_STATUS_LABEL: Record<ChainStatus, string> = {
  consistent:
    "hash chain consistent — the entries match their chain (consistency, not authenticity)",
  "legacy-unverified":
    "legacy record — contains entries without chain data (unverified history)",
  broken: "HASH CHAIN BROKEN — record contents do not match their chain",
  empty: "empty record",
};

// The shared analysis view of one lens output — the same extraction the
// pipeline's own composer performs (surface.ts reads these signals).
export interface AnalysisView {
  raw_quotes: string[];
  regularities: string[];
  relations: AssertedRelation[];
  unknowns: string[];
  candidate_actions: CandidateAction[];
  urgent_action: string | null;
  trajectory_null_reason: string | null;
  projection: { statement: string; assumptions: string[]; confidence: number } | null;
}

export function analysisViewOf(output: ClusterOutput): AnalysisView {
  const sig = output.signals as Record<string, unknown>;
  const traj = output.evidence.trajectory;
  return {
    raw_quotes: (sig["raw_quotes"] as string[]) ?? [],
    regularities: (sig["regularities"] as string[]) ?? [],
    relations: (sig["asserted_relations"] as AssertedRelation[]) ?? [],
    unknowns: (sig["unknowns"] as string[]) ?? [],
    candidate_actions: (sig["candidate_actions"] as CandidateAction[]) ?? [],
    urgent_action: (sig["urgent_action"] as string | null) ?? null,
    trajectory_null_reason: (sig["trajectory_null_reason"] as string | null) ?? null,
    projection: traj
      ? {
          statement: traj.statement ?? JSON.stringify(traj.projection),
          assumptions: Object.values(traj.assumptions).flat().map(String),
          confidence: traj.confidence,
        }
      : null,
  };
}

export function lensOutputOf(response: SurfaceResponse, lens: LensId) {
  return response.lenses.find((l) => l.cluster_id === lens) ?? null;
}

export function primaryView(response: SurfaceResponse): AnalysisView {
  return analysisViewOf(response.output);
}

export function urgentActionOf(response: SurfaceResponse): string | null {
  for (const lens of response.lenses) {
    const u = lens.output.signals["urgent_action"] as string | null;
    if (u) return u;
  }
  return null;
}

// --- Relationship classes: visual weight is part of the ontology. ------
// A candidate_causal must never carry the visual weight of a
// demonstrated_intervention. Weights are strictly ordered 1..4 and the
// renderer keys border/fill off them.
export const RELATIONSHIP_WEIGHT: Record<RelationshipClass, number> = {
  observed_sequence: 1,
  statistical_association: 2,
  candidate_causal: 3,
  demonstrated_intervention: 4,
};

export const RELATIONSHIP_CLASS_LABEL: Record<RelationshipClass, string> = {
  observed_sequence: "observed_sequence — X occurred, Y followed",
  statistical_association: "statistical_association — X and Y move together",
  candidate_causal: "candidate_causal — changing X may affect Y",
  demonstrated_intervention:
    "demonstrated_intervention — X was changed, Y changed under comparable conditions",
};

// --- Agency authority gate presentation. ---------------------------------
export type GateState = "cleared" | "advisory" | "assent-required" | "unauthorized";

export interface AuthorityPresentation {
  gate: GateState;
  // "executable" in the gate sense: the gate clears this action as
  // presented. sovereign_decision_required is NEVER executable — it
  // renders as requiring assent, full stop.
  executable: boolean;
  label: string;
}

export function authorityPresentation(action: CandidateAction): AuthorityPresentation {
  const check = action.authority_check;
  if (!check) {
    // The pipeline validator rejects unchecked actions; if one ever
    // reached the UI it renders as unauthorized, never as cleared.
    return { gate: "unauthorized", executable: false, label: "NO AUTHORITY CHECK — NOT EMITTED BY GATE" };
  }
  const basis: AuthorityBasis = check.basis;
  if (basis === "unauthorized" || !check.authorized) {
    if (basis === "sovereign_decision_required" || check.requires_assent) {
      return { gate: "assent-required", executable: false, label: "REQUIRES SOVEREIGN ASSENT" };
    }
    return { gate: "unauthorized", executable: false, label: "FLAGGED — UNAUTHORIZED IN RECORD" };
  }
  if (basis === "advisory_only") {
    return { gate: "advisory", executable: false, label: "ADVISORY ONLY — NO STATE CHANGE BY ITSELF" };
  }
  return { gate: "cleared", executable: true, label: `AUTHORIZED — ${basis}` };
}

// --- Uncertainty as epistemic states. ------------------------------------
// The cross-cut value and sources come from the response; the states are
// derived from the primary analysis view so each state names the actual
// evidence (or its absence) behind it.
export type UncertaintyState =
  | "known"
  | "inferred"
  | "suspected"
  | "cannot_distinguish"
  | "lacks_evidence";

export const UNCERTAINTY_STATE_LABEL: Record<UncertaintyState, string> = {
  known: "KNOWN — quoted in the raw record",
  inferred: "INFERRED — pattern over observations",
  suspected: "SUSPECTED — candidate relation or low-confidence projection",
  cannot_distinguish: "CANNOT DISTINGUISH — open unknowns",
  lacks_evidence: "LACKS EVIDENCE — no basis in the record",
};

export interface EpistemicView {
  value: number;
  sources: { name: string; weight: number; value: number }[];
  states: Record<UncertaintyState, string[]>;
}

export function epistemicView(response: SurfaceResponse): EpistemicView {
  const view = primaryView(response);
  const suspected: string[] = [];
  for (const r of view.relations) {
    if (r.relationship_class === "candidate_causal") {
      suspected.push(`${r.subject} ${r.predicate} ${r.object} — candidate_causal (not demonstrated)`);
    }
  }
  if (view.projection && view.projection.confidence < 0.7) {
    suspected.push(`Projection at confidence ${view.projection.confidence}: ${view.projection.statement}`);
  }
  const lacks: string[] = [];
  if (view.trajectory_null_reason) {
    lacks.push(`Trajectory: ${view.trajectory_null_reason}`);
  }
  for (const s of response.uncertainty_sources) {
    lacks.push(`Cross-cut source: ${s.name} (weight ${s.weight}, value ${s.value})`);
  }
  return {
    value: response.uncertainty,
    sources: response.uncertainty_sources,
    states: {
      known: view.raw_quotes,
      inferred: view.regularities,
      suspected,
      cannot_distinguish: view.unknowns,
      lacks_evidence: lacks,
    },
  };
}
