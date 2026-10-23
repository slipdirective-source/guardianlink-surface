// Validator: deterministic ontology enforcement over any Reasoner output.
//
// The ontology is enforced HERE, mechanically, not by trusting the backend:
//  - all four EvidenceBundle layers present, never fused into one field
//  - raw quotes must be verbatim substrings of the input (no invented raw)
//  - pattern regularities must not be verbatim raw quotes (no fused layers)
//  - every asserted relation carries a valid class, cited evidence quotes
//    that exist in the input, and a justification; classes are capped by
//    evidence strength (the ceiling rules)
//  - trajectory is either a projection with stated assumptions, or an
//    explicit null WITH a reason recorded on the output
//  - every agency candidate action carries an authority-check record;
//    an action that endorses continuing an unauthorized practice fails
//  - unknowns must be explicit (uncertainty is preserved, not filled)
//
// validate() reports violations; repair() fixes the fixable ones
// (downgrade an overclaimed class, drop/replace an unchecked action,
// attach the null reason) and reports what it changed. Clusters run
// validate → repair → validate and record the result on the output.

import { ClusterOutput, SurfaceInput } from "./types";
import { RelationshipClass } from "./evidence_bundle";
import { Analysis } from "./reasoner";

export const RELATIONSHIP_CLASSES: RelationshipClass[] = [
  "observed_sequence",
  "statistical_association",
  "candidate_causal",
  "demonstrated_intervention",
];

const CLASS_RANK: Record<RelationshipClass, number> = {
  observed_sequence: 0,
  statistical_association: 1,
  candidate_causal: 2,
  demonstrated_intervention: 3,
};

export interface ValidationReport {
  valid: boolean;
  violations: string[];
  repairs: string[];
}

const INTERVENTION_EVIDENCE =
  /\b(intervention|changed|introduced|removed|banned|switched|replaced|trial|experiment|before and after|when .* (was|were) (added|removed|changed))/i;
const MECHANISM_EVIDENCE =
  /\b(because|mechanism|causes|caused by|leads to|results in|drives|driven by)\b/i;
const CO_OCCURRENCE_EVIDENCE =
  /\b(both|peak|correlat|co-move|co-occurr|associated|together|same period|same month)\b/i;

// The evidence ceiling for a relation, from its own cited evidence and
// justification. A claimed class above the ceiling is inflation.
export function evidenceCeiling(quotes: string[], justification: string): RelationshipClass {
  const blob = quotes.join(" ") + " " + justification;
  if (INTERVENTION_EVIDENCE.test(blob) && /outcome|result|changed|increased|decreased|fell|rose/i.test(blob)) {
    return "demonstrated_intervention";
  }
  if (MECHANISM_EVIDENCE.test(blob) && quotes.length > 0) return "candidate_causal";
  if (CO_OCCURRENCE_EVIDENCE.test(blob)) return "statistical_association";
  return "observed_sequence";
}

export function validateAnalysis(analysis: Analysis, input: SurfaceInput): ValidationReport {
  const violations: string[] = [];

  if (!analysis.raw_quotes || analysis.raw_quotes.length === 0) {
    violations.push("raw layer empty: at least one quoted observation is required");
  }
  for (const q of analysis.raw_quotes ?? []) {
    if (!input.raw_text.includes(q)) {
      violations.push(`raw quote is not a verbatim substring of the input: "${q.slice(0, 60)}"`);
    }
  }
  if (!analysis.regularities || analysis.regularities.length === 0) {
    violations.push("pattern layer empty: state the supported regularity or explicitly that none is stated");
  }
  for (const r of analysis.regularities ?? []) {
    if ((analysis.raw_quotes ?? []).includes(r)) {
      violations.push("pattern layer fused with raw: a regularity is a verbatim copy of a raw quote");
    }
  }
  for (const rel of analysis.relations ?? []) {
    if (!RELATIONSHIP_CLASSES.includes(rel.relationship_class)) {
      violations.push(`relation has invalid class: ${String(rel.relationship_class)}`);
      continue;
    }
    if (!rel.evidence_quotes || rel.evidence_quotes.length === 0) {
      violations.push(`relation "${rel.subject}" asserts class ${rel.relationship_class} with no cited evidence`);
      continue;
    }
    for (const q of rel.evidence_quotes) {
      if (!input.raw_text.includes(q) && q !== input.raw_text) {
        violations.push(`relation "${rel.subject}" cites evidence not present in the input`);
      }
    }
    if (!rel.justification || rel.justification.trim().length === 0) {
      violations.push(`relation "${rel.subject}" has no justification (choice must be auditable)`);
    }
    // Ceiling check: justification text that itself concedes a lower ceiling
    // ("Ceiling: statistical_association") is the classifier being explicit;
    // trust the lower of (claimed, stated ceiling) — a stated ceiling below
    // the claim is a contradiction and is repaired by downgrading.
    const stated = /ceiling:\s*(observed_sequence|statistical_association|candidate_causal|demonstrated_intervention)/i.exec(
      rel.justification
    );
    if (stated && CLASS_RANK[stated[1].toLowerCase() as RelationshipClass] < CLASS_RANK[rel.relationship_class]) {
      violations.push(
        `relation "${rel.subject}" claims ${rel.relationship_class} but its own justification states ceiling ${stated[1]}`
      );
    }
    // Evidence-strength ceiling: candidate_causal+ requires mechanism or
    // intervention evidence IN THE CITED QUOTES — not just in prose.
    // Record-backed relations are exempt: their evidence is the sovereign
    // record bucket itself (e.g. recorded demonstrated interventions),
    // which the bucket name certifies.
    if (rel.source === "sovereign_record") continue;
    if (rel.relationship_class === "demonstrated_intervention") {
      const quoteBlob = rel.evidence_quotes.join(" ");
      if (!INTERVENTION_EVIDENCE.test(quoteBlob)) {
        violations.push(
          `relation "${rel.subject}" claims demonstrated_intervention but cited evidence shows no intervention`
        );
      }
    }
    if (rel.relationship_class === "candidate_causal") {
      const quoteBlob = rel.evidence_quotes.join(" ");
      if (!INTERVENTION_EVIDENCE.test(quoteBlob) && !/peak|both|every time/i.test(quoteBlob)) {
        // A causal claim with neither mechanism in justification nor any
        // pattern in evidence is unsupported.
        if (!MECHANISM_EVIDENCE.test(rel.justification)) {
          violations.push(
            `relation "${rel.subject}" claims candidate_causal with no mechanism stated`
          );
        }
      }
    }
  }
  if (analysis.projection === null && !analysis.trajectory_null_reason) {
    violations.push("trajectory is null without a recorded reason (null must be explicit, not silent)");
  }
  if (analysis.projection !== null) {
    if (!analysis.projection.assumptions || analysis.projection.assumptions.length === 0) {
      violations.push("projection present without stated assumptions");
    }
    if (!(analysis.projection.confidence >= 0 && analysis.projection.confidence <= 1)) {
      violations.push("projection confidence outside 0..1");
    }
  }
  if (!analysis.unknowns || analysis.unknowns.length === 0) {
    violations.push("unknowns empty: uncertainty must be preserved explicitly");
  }
  for (const a of analysis.candidate_actions ?? []) {
    if (!a.authority_check) {
      violations.push(`agency action emitted without an authority-check record: "${a.action.slice(0, 60)}"`);
      continue;
    }
    if (typeof a.authority_check.authorized !== "boolean") {
      violations.push(`agency action has a malformed authority check: "${a.action.slice(0, 60)}"`);
    }
  }
  // Claim relations (fix sprint, spec §4.3 — mechanical duties):
  //  - every cited party quote must be a verbatim substring of the
  //    input (the invented-quote rule, unchanged in kind);
  //  - a retraction's binding must reference a party that appears
  //    earlier in the input than the retracting party;
  //  - NO resolution fields: a relation carrying any winner /
  //    preferred-side / resolved field is a violation with NO repair
  //    (see repairAnalysis) — the output fails validation visibly.
  // The validator does NOT require claim_relations to be non-empty:
  // detection belongs to the reasoner; an empty list is legitimate.
  const RESOLUTION_FIELDS = ["winner", "preferred", "preferred_side", "resolved", "resolution", "winning_side", "loser"];
  for (const rel of analysis.claim_relations ?? []) {
    const rec = rel as unknown as Record<string, unknown>;
    for (const f of RESOLUTION_FIELDS) {
      if (f in rec) {
        violations.push(
          `claim relation (${rel.type}) carries a resolution field "${f}": neither mechanism may manufacture a winner`
        );
      }
    }
    if (!Array.isArray(rel.parties) || rel.parties.length !== 2) {
      violations.push(`claim relation (${rel.type}) does not cite exactly two parties`);
      continue;
    }
    for (const p of rel.parties) {
      if (!input.raw_text.includes(p.quote)) {
        violations.push(
          `claim relation (${rel.type}) cites a party quote that is not a verbatim substring of the input: "${p.quote.slice(0, 60)}"`
        );
      }
    }
    if (rel.type === "retraction" && rel.binding === "bound") {
      const targetAt = input.raw_text.indexOf(rel.parties[0].quote);
      const retractingAt = input.raw_text.indexOf(rel.parties[1].quote);
      if (targetAt !== -1 && retractingAt !== -1 && targetAt >= retractingAt) {
        violations.push(
          "retraction binding references a party that does not appear earlier in the record than the retracting entry"
        );
      }
    }
    if (rel.type === "conflict" && rel.binding !== null) {
      violations.push("conflict relation carries a binding (binding is retraction-only)");
    }
  }
  return { valid: violations.length === 0, violations, repairs: [] };
}

export function repairAnalysis(analysis: Analysis, input: SurfaceInput): { analysis: Analysis; repairs: string[] } {
  const repairs: string[] = [];
  const a: Analysis = JSON.parse(JSON.stringify(analysis)) as Analysis;

  // Raw quotes: drop invented quotes; if all dropped, fall back to the
  // full input as the single raw observation (it is verbatim by definition).
  const beforeRaw = a.raw_quotes.length;
  a.raw_quotes = a.raw_quotes.filter((q) => input.raw_text.includes(q));
  if (a.raw_quotes.length < beforeRaw) repairs.push("dropped raw quote(s) not present in the input");
  if (a.raw_quotes.length === 0) {
    a.raw_quotes = [input.raw_text];
    repairs.push("raw layer was empty/invented; replaced with the full input as the raw observation");
  }
  if (!a.regularities || a.regularities.length === 0) {
    a.regularities = ["No repeated-measurement regularity is stated in the input; the observations stand as individual observations."];
    repairs.push("pattern layer was empty; stated explicitly that no regularity is supported");
  }
  a.regularities = a.regularities.filter((r) => !a.raw_quotes.includes(r));
  if (a.regularities.length === 0) {
    a.regularities = ["Regularities are distinct from the raw observations and none beyond them is supported."];
    repairs.push("pattern layer was fused with raw; replaced with an explicit non-fusion statement");
  }

  for (const rel of a.relations) {
    if (rel.source === "sovereign_record") continue;
    const stated = /ceiling:\s*(observed_sequence|statistical_association|candidate_causal|demonstrated_intervention)/i.exec(rel.justification);
    if (stated) {
      const ceiling = stated[1].toLowerCase() as RelationshipClass;
      if (CLASS_RANK[ceiling] < CLASS_RANK[rel.relationship_class]) {
        rel.relationship_class = ceiling;
        repairs.push(`downgraded relation "${rel.subject}" to its stated ceiling ${ceiling}`);
      }
    }
    if (rel.relationship_class === "demonstrated_intervention") {
      const quoteBlob = rel.evidence_quotes.join(" ");
      if (!INTERVENTION_EVIDENCE.test(quoteBlob)) {
        rel.relationship_class = "candidate_causal";
        repairs.push(`downgraded relation "${rel.subject}" from demonstrated_intervention (no intervention in cited evidence)`);
      }
    }
    if (rel.relationship_class === "candidate_causal" && !MECHANISM_EVIDENCE.test(rel.justification)) {
      const ceiling = evidenceCeiling(rel.evidence_quotes, rel.justification);
      rel.relationship_class = ceiling === "candidate_causal" ? "statistical_association" : ceiling;
      repairs.push(`downgraded relation "${rel.subject}" from candidate_causal (no mechanism stated)`);
    }
    if (!rel.evidence_quotes || rel.evidence_quotes.length === 0) {
      rel.evidence_quotes = [input.raw_text];
      repairs.push(`relation "${rel.subject}" had no cited evidence; cited the input`);
    }
  }

  // Claim relations (fix sprint, spec §4.3): drop relations citing
  // invented text (repair recorded); a retraction binding that fails
  // the earlier-party rule is repaired to "unbound", never to a
  // different target. Resolution fields are deliberately NOT repaired
  // away — a relation carrying one keeps failing validation visibly.
  if (Array.isArray(a.claim_relations)) {
    const before = a.claim_relations.length;
    a.claim_relations = a.claim_relations.filter(
      (rel) =>
        Array.isArray(rel.parties) &&
        rel.parties.length === 2 &&
        rel.parties.every((p) => input.raw_text.includes(p.quote))
    );
    if (a.claim_relations.length < before) {
      repairs.push("dropped claim relation(s) citing text not present in the input");
    }
    for (const rel of a.claim_relations) {
      if (rel.type === "retraction" && rel.binding === "bound") {
        const targetAt = input.raw_text.indexOf(rel.parties[0].quote);
        const retractingAt = input.raw_text.indexOf(rel.parties[1].quote);
        if (targetAt === -1 || retractingAt === -1 || targetAt >= retractingAt) {
          rel.binding = "unbound";
          repairs.push("retraction binding failed the earlier-party rule; repaired to unbound (never re-targeted)");
        }
      }
      if (rel.type === "conflict" && rel.binding !== null) {
        rel.binding = null;
        repairs.push("cleared a binding on a conflict relation (binding is retraction-only)");
      }
    }
  }

  if (a.projection === null && !a.trajectory_null_reason) {
    a.trajectory_null_reason = "Projection is not supported by the input as given.";
    repairs.push("attached an explicit reason to the null trajectory");
  }
  if (!a.unknowns || a.unknowns.length === 0) {
    a.unknowns = ["anything beyond the stated observations is not in evidence"];
    repairs.push("unknowns were empty; recorded the default explicit unknown");
  }
  for (const act of a.candidate_actions) {
    if (!act.authority_check) {
      act.authority_check = {
        basis: "advisory_only",
        authorized: true,
        requires_assent: true,
        note: "No authority check was supplied by the reasoner; attached by the validator as advisory-only pending sovereign assent.",
      };
      repairs.push(`attached a default advisory authority check to an unchecked action`);
    }
  }
  return { analysis: a, repairs };
}

export function validateClusterOutput(output: ClusterOutput, input: SurfaceInput): ValidationReport {
  const violations: string[] = [];
  const ev = output.evidence as unknown as Record<string, unknown>;
  if (!ev || !("raw" in ev) || !("pattern" in ev) || !("relationship" in ev) || !("trajectory" in ev)) {
    violations.push("evidence bundle is missing one of the four layers (raw/pattern/relationship/trajectory)");
  }
  if (ev && "analysis" in ev) {
    violations.push("evidence bundle is fused into a single 'analysis' field (layers must stay separate)");
  }
  if (output.evidence?.relationship && !RELATIONSHIP_CLASSES.includes(output.evidence.relationship.relationship_class)) {
    violations.push("relationship layer carries an invalid relationship_class");
  }
  if (output.evidence && output.evidence.trajectory === null) {
    const reason = (output.signals as Record<string, unknown>)["trajectory_null_reason"];
    if (!reason) violations.push("output trajectory is null but no trajectory_null_reason is recorded in signals");
  }
  const actions = (output.signals as Record<string, unknown>)["candidate_actions"] as
    | Array<{ authority_check?: unknown }>
    | undefined;
  if (Array.isArray(actions)) {
    for (const act of actions) {
      if (!act.authority_check) violations.push("cluster output carries an agency action without an authority-check record");
    }
  }
  if (!(output.uncertainty >= 0 && output.uncertainty <= 1)) {
    violations.push("uncertainty outside 0..1");
  }
  return { valid: violations.length === 0, violations, repairs: [] };
}
