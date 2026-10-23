// Reasoner: pluggable reasoning backend for the cognitive surface.
//
// Every cluster's compute() builds a strict prompt contract (what the
// ontology requires the reasoning to produce) and hands it to a Reasoner.
// The Reasoner returns a structured Analysis. A deterministic validation
// layer (validator.ts) then rejects/repairs any Analysis or ClusterOutput
// that violates the ontology, regardless of which backend produced it.
//
// Backends:
//  - DeterministicReasoner (deterministic_reasoner.ts): offline, rule-based
//    reasoning shipped in this repo. This is the backend used for the
//    Experiment 002 re-run, and it is fully reproducible: anyone can re-run
//    the exact code that produced the condition-A outputs.
//  - AgentReasoner (below): loads agent-authored Analysis JSON (produced by
//    an LLM/agent executing the same prompt contracts) from a map. Outputs
//    still pass through the same validators — the backend is interchangeable,
//    the constraints are not.
//  - A live LLM API backend can implement this same interface later without
//    touching clusters, validators, or the surface composer.

import { SurfaceInput } from "./types";
import { RelationshipClass } from "./evidence_bundle";

export interface AssertedRelation {
  subject: string;
  predicate: string;
  object: string;
  relationship_class: RelationshipClass;
  evidence_quotes: string[];
  justification: string;
  // Where the evidence lives: quoted input text (default) or the sovereign
  // record (structured context buckets). The validator applies the matching
  // evidence rule for each source.
  source?: "input" | "sovereign_record";
}

export type AuthorityBasis =
  | "direct_instruction" // the sovereign principal directly instructed this action
  | "emergency_exigency" // urgent, obvious, protective action; delay itself is harm
  | "personal_choice" // actor's own low-stakes choice over their own affairs
  | "existing_authority" // an authority stated in the input covers this action
  | "advisory_only" // a recommendation to the sovereign; no state change by itself
  | "sovereign_decision_required" // changes policy/state; needs explicit sovereign assent
  | "unauthorized"; // input shows the action exceeds the authority present

export interface AuthorityCheck {
  basis: AuthorityBasis;
  authorized: boolean;
  requires_assent: boolean;
  note: string;
}

export interface CandidateAction {
  action: string;
  authority_check: AuthorityCheck;
}

// ClaimRelation (fix sprint, spec §4.2): a typed relation between two
// claims in a composed record — a conflict (Mechanism A) or a
// retraction (Mechanism B) — expressed through the one seam:
// claim identity/topic relation → conflict/retraction relation →
// epistemic projection. Deliberately NOT a RelationshipClass: a claim
// relation asserts nothing about causation, so it never enters the
// evidence-ceiling machinery. Surfacing one asserts only "these two
// claims stand in this relation", with both sides quoted verbatim.
// There is intentionally NO winner / preferred-side / resolution
// field: the validator treats any such field as a violation with no
// repair (spec §4.3) — neither mechanism may manufacture a winner.
export interface ClaimRelationParty {
  date: string; // composed-record line date (asserted date)
  origin: string;
  quote: string; // the entry's text, verbatim from the input
}

export interface ClaimRelation {
  type: "conflict" | "retraction";
  parties: [ClaimRelationParty, ClaimRelationParty]; // [earlier, later]
  topic_stems: string[]; // shared matter stems that grouped the pair
  branches: string[]; // A branches fired, or B cue class — auditable
  binding: "bound" | "unbound" | null; // retraction only; null for conflicts
  date_relation: "same_day" | "cross_day";
}

export interface Analysis {
  // Layer 1 — raw: verbatim quoted observations from the input. Every quote
  // MUST be an exact substring of input.raw_text (validator-enforced).
  raw_quotes: string[];
  // Layer 2 — pattern: stated regularities. Must NOT be verbatim copies of
  // raw quotes; a regularity is an interpretation over observations.
  regularities: string[];
  // Layer 3 — relationship: every asserted relation, classified.
  relations: AssertedRelation[];
  // Layer 4 — trajectory: projection, or explicit null with a reason.
  projection: {
    statement: string;
    assumptions: string[];
    horizon: string;
    confidence: number;
  } | null;
  trajectory_null_reason: string | null;
  // Cross-cutting.
  unknowns: string[];
  // Claim relations over a composed record (fix sprint, spec §4.2).
  // Optional: authored (non-deterministic) backends may omit it; the
  // deterministic backend always sets it (possibly empty).
  claim_relations?: ClaimRelation[];
  candidate_actions: CandidateAction[];
  urgent_action: string | null;
  position_statement: string;
  history_statement: string;
  uncertainty_signals: {
    ambiguous_input: boolean;
    missing_context: boolean;
    conflicting_signals: boolean;
    sparse_history: boolean;
    /** The record's evidence is old relative to the question's stated
     * present (composed records, Experiment 003). */
    stale_evidence?: boolean;
  };
}

// The prompt contract each cluster sends its Reasoner. For an LLM backend
// this is rendered as the system/user prompt; for the deterministic backend
// it is the specification the rules implement.
export interface PromptContract {
  cluster_id: string;
  instructions: string[];
  required_layers: ["raw", "pattern", "relationship", "trajectory"];
}

export function contractFor(cluster_id: string): PromptContract {
  const base = [
    "Fill ALL four evidence layers from the input. Never fuse layers.",
    "raw: quote observations verbatim from the input; add nothing.",
    "pattern: state only regularities the observations support; a single anecdote is not a pattern.",
    "relationship: classify EVERY asserted relation into exactly one of observed_sequence, statistical_association, candidate_causal, demonstrated_intervention, with cited evidence quotes and a justification. Never claim a class above the evidence: co-occurrence caps at statistical_association; a reported sequence with no comparison caps at observed_sequence; candidate_causal requires a stated mechanism; demonstrated_intervention requires an intervention and an observed outcome change.",
    "trajectory: give a projection only if the input supports one; otherwise return an explicit null with the reason projection is unsupported. Never fill a trajectory gap with a confident estimate.",
    "Preserve uncertainty: list what is not known explicitly.",
  ];
  const perCluster: Record<string, string[]> = {
    position: [
      "Answer 'Where am I?': state the current position from observations, keeping any vivid anecdote in raw and any aggregate trend in pattern, distinctly.",
    ],
    history: [
      "Answer 'How did I get here?': reconstruct the observed sequence only; do not invent steps not in the input.",
    ],
    relationships: [
      "Answer 'What is interacting with what?': assert relations only at the class the evidence earns; name shared-cause / no-mechanism limits explicitly.",
    ],
    trajectory: [
      "Answer 'Where am I going?': distinguish observation (where I am) from projection (where I am going) in the output itself.",
    ],
    agency: [
      "Answer 'What can I do about it?': generate candidate actions AND run an explicit authority check on each against the authority present in the input before emitting it.",
      "If the input describes an actor exceeding stated authority, flag it: a good outcome does not retroactively authorize the action. Candidate remedies that change policy or state require sovereign assent.",
      "URGENT OVERRIDE: if the input presents an obvious urgent action (a crying child to comfort; fire alarm plus smoke), the FIRST candidate action is the obvious protective action, authorized under direct_instruction / emergency_exigency. The ontology must never delay or hedge it.",
    ],
  };
  return {
    cluster_id,
    instructions: [...base, ...(perCluster[cluster_id] ?? [])],
    required_layers: ["raw", "pattern", "relationship", "trajectory"],
  };
}

export interface Reasoner {
  id: string;
  reason(input: SurfaceInput, contract: PromptContract): Analysis;
}

// Registry: clusters use the active reasoner; tests/experiments may swap it.
let activeReasoner: Reasoner | null = null;
export function setReasoner(r: Reasoner): void {
  activeReasoner = r;
}
export function getReasoner(): Reasoner {
  if (activeReasoner) return activeReasoner;
  // Lazy default to avoid a static import cycle.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DeterministicReasoner } = require("./deterministic_reasoner");
  activeReasoner = DeterministicReasoner as Reasoner;
  return activeReasoner;
}

// AgentReasoner: an LLM/agent backend. The agent executes the prompt
// contracts itself and supplies Analysis objects keyed by exact input text.
// Anything it supplies still goes through validator.ts — an overclaimed
// relationship class or an unchecked agency action is repaired/downgraded
// exactly as with any other backend.
export class AgentReasoner implements Reasoner {
  id = "agent";
  constructor(private authored: Map<string, Analysis>) {}
  reason(input: SurfaceInput, contract: PromptContract): Analysis {
    const a = this.authored.get(input.raw_text);
    if (!a) {
      throw new Error(
        `AgentReasoner: no authored analysis for input (cluster ${contract.cluster_id})`
      );
    }
    return a;
  }
}
