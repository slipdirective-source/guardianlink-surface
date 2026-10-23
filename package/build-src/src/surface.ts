// Surface API: the public "answer" function.
//
// Rebuilt per Experiment 001 RESULTS.md ("What Would Earn It"):
//  - the router's ranked list does work: every sufficiently relevant lens
//    is computed and composed into the answer (multi-lens), not ranked[0]
//    alone;
//  - the uncertainty cross-cut runs across ALL lens outputs and its source
//    breakdown is returned on the response;
//  - the composed answer_text keeps the four evidence layers visibly
//    separate, states classified relationships with their evidence,
//    distinguishes observation from projection, lists authority-checked
//    actions, and preserves unknowns explicitly;
//  - an urgent obvious action, when any lens detects one, leads the
//    answer. The ontology never impedes it (Category 5 requirement).

import { SurfaceInput, SurfaceOptions, SurfaceResponse, LensOutput } from "./types";
import { Question, routeQuestion } from "./router";
import { crossCutUncertainty } from "./uncertainty";
import { setActiveAblation } from "./ablation";
import { Analysis } from "./reasoner";

export function answer(
  question: Question,
  sovereignContext: Record<string, unknown> | null = null,
  options: SurfaceOptions = {}
): SurfaceResponse {
  const input: SurfaceInput = {
    raw_text: question.text,
    tokens: question.text.toLowerCase().split(/\s+/),
    sovereign_context: sovereignContext,
  };

  setActiveAblation(options.ablate ?? null);
  try {
    const ranked = routeQuestion(question, input);
    const threshold = options.lensThreshold ?? 0.3;
    let selected = ranked.filter((r) => r.relevance_score >= threshold);
    if (selected.length === 0) selected = [ranked[0]];
    // Multi-lens floor: a single-lens answer is the Exp 001 failure mode
    // (ranked list as decoration). Always compose at least the top two
    // lenses so cross-referencing is structural, not incidental.
    if (selected.length < 2 && ranked.length > 1) selected = ranked.slice(0, 2);
    if (options.ablate === "A3") selected = [ranked[0]]; // single best-match lens

    const lenses: LensOutput[] = selected.map((r) => ({
      cluster_id: r.cluster.id,
      relevance_score: r.relevance_score,
      output: r.cluster.compute(input),
    }));

    const primary = lenses[0];
    const outputs = lenses.map((l) => l.output);

    // Analysis view shared by all lenses (same reasoner input): recovered
    // from the primary output's recorded signals for composition.
    const sig = primary.output.signals as Record<string, unknown>;
    const analysisView = {
      raw_quotes: (sig["raw_quotes"] as string[]) ?? [question.text],
      regularities: (sig["regularities"] as string[]) ?? [],
      relations: (sig["asserted_relations"] as Analysis["relations"]) ?? [],
      claim_relations: (sig["claim_relations"] as Analysis["claim_relations"]) ?? [],
      unknowns: (sig["unknowns"] as string[]) ?? [],
      candidate_actions: (sig["candidate_actions"] as Analysis["candidate_actions"]) ?? [],
      urgent_action: (sig["urgent_action"] as string | null) ?? null,
      trajectory_null_reason: (sig["trajectory_null_reason"] as string | null) ?? null,
    };
    // Trajectory projection (if any lens carries one).
    const projLens = lenses.find((l) => l.output.evidence.trajectory !== null);
    const projection = projLens?.output.evidence.trajectory ?? null;

    let uncertainty: number;
    let sources: { name: string; weight: number; value: number }[];
    if (options.ablate === "A4") {
      // Cross-cut removed: per-cluster value only, no source breakdown.
      uncertainty = primary.output.uncertainty;
      sources = [];
    } else {
      const cc = crossCutUncertainty(outputs);
      uncertainty = cc.value;
      sources = cc.sources;
    }

    const answer_text = composeAnswerText({
      question,
      lenses,
      primaryId: primary.cluster_id,
      view: analysisView,
      projection: projection
        ? {
            statement: projection.statement ?? JSON.stringify(projection.projection),
            assumptions: Object.values(projection.assumptions).flat().map(String),
            confidence: projection.confidence,
          }
        : null,
      uncertainty,
      sources,
      ablate: options.ablate ?? null,
    });

    return {
      cluster_id: primary.cluster_id,
      output: primary.output,
      uncertainty,
      ranked_clusters: ranked,
      lenses,
      answer_text,
      uncertainty_sources: sources,
      applied_options: options.ablate ? [options.ablate] : [],
    };
  } finally {
    setActiveAblation(null);
  }
}

interface ComposeArgs {
  question: Question;
  lenses: LensOutput[];
  primaryId: string;
  view: {
    raw_quotes: string[];
    regularities: string[];
    relations: Analysis["relations"];
    claim_relations: NonNullable<Analysis["claim_relations"]>;
    unknowns: string[];
    candidate_actions: Analysis["candidate_actions"];
    urgent_action: string | null;
    trajectory_null_reason: string | null;
  };
  projection: { statement: string; assumptions: string[]; confidence: number } | null;
  uncertainty: number;
  sources: { name: string; weight: number; value: number }[];
  ablate: string | null;
}

function composeAnswerText(a: ComposeArgs): string {
  const v = a.view;

  if (a.ablate === "A1") {
    // Layers fused into one undifferentiated analysis blob (production
    // level): findings are the raw sentences with no layer labels and no
    // pattern layer at all; relations and actions appear as plain
    // sentences in the same blob. Nothing marks any finding as
    // observation vs. regularity vs. inference.
    const merged = [
      ...v.raw_quotes,
      ...v.relations.map((r) => `${r.subject} ${r.predicate} ${r.object}.`),
      ...(a.projection ? [a.projection.statement] : []),
      ...v.candidate_actions.map((x) => x.action),
    ].join(" ");
    return `Analysis: ${merged}`;
  }

  const parts: string[] = [];

  // Urgent action FIRST — before any structure. (Category 5 requirement.)
  if (v.urgent_action) parts.push(`DO THIS NOW: ${v.urgent_action}`);

  parts.push(`Primary lens — ${a.primaryId}: ${a.lenses[0].output.summary}`);

  parts.push(
    `What is observed (raw evidence, quoted — not yet interpreted): ${v.raw_quotes.map((q) => `"${q}"`).join(" ")}`
  );
  parts.push(
    `What pattern is supported (pattern layer, kept separate from the raw anecdotes above): ${v.regularities.join(" ")}`
  );
  if (v.relations.length > 0) {
    parts.push(
      `Relationship (classified, with evidence): ` +
        v.relations
          .map(
            (r) =>
              `${r.subject} ${r.predicate} ${r.object} → class: ${r.relationship_class}. Basis: ${r.justification} Evidence: "${r.evidence_quotes.join('" "')}"`
          )
          .join(" | ")
    );
  } else {
    parts.push(
      `Relationship: none asserted. No relation in the input earns a class; asserting one would be inflation.`
    );
  }

  // Claim relations (fix sprint, spec §4.4): surfaced on the composed
  // answer text itself, both parties quoted verbatim with stamps,
  // never resolved. Emitted ONLY when at least one relation exists —
  // relation-free records keep byte-identical answer text (§5.8).
  if (v.claim_relations.length > 0) {
    const rendered = v.claim_relations.map((rel) => {
      const [earlier, later] = rel.parties;
      if (rel.type === "conflict") {
        return `CONFLICT (${rel.date_relation}; branches: ${rel.branches.join(", ")}) — "[${earlier.date} · ${earlier.origin}] ${earlier.quote}" vs "[${later.date} · ${later.origin}] ${later.quote}" — neither side is asserted and no timestamp is treated as truth; the record does not resolve which entry holds.`;
      }
      if (rel.binding === "bound") {
        return `RETRACTION (bound; ${rel.date_relation}; branches: ${rel.branches.join(", ")}) — "[${earlier.date} · ${earlier.origin}] ${earlier.quote}" retracted by "[${later.date} · ${later.origin}] ${later.quote}" — the retracted entry remains in the record, marked as retracted; the retraction is itself a claim, not a resolved fact.`;
      }
      return `RETRACTION (unbound; ${rel.date_relation}; branches: ${rel.branches.join(", ")}) — retracting entry "[${later.date} · ${later.origin}] ${later.quote}" — its target cannot be distinguished from this record; no target is guessed.`;
    });
    parts.push(
      `Claim relations in this record (surfaced, not resolved): ${rendered.join(" | ")}`
    );
  }

  if (a.projection) {
    parts.push(
      `Where this is going (projection — distinct from the observations above): ${a.projection.statement} Assumptions: ${a.projection.assumptions.join("; ")}. Confidence: ${a.projection.confidence}.`
    );
  } else if (a.ablate === "A4") {
    // Uncertainty filling (A4's predicted failure): a confident estimate
    // is supplied where the intact surface preserves a null trajectory.
    parts.push(
      `Where this is going: based on the current pace, expect a clear result on a definite timeline — the trend points to continued movement in the same direction.`
    );
  } else {
    parts.push(
      `Where this is going (projection): no projection is warranted. ${v.trajectory_null_reason ?? "The input does not support one."} Stating the observations is not the same as forecasting from them.`
    );
  }

  if (v.candidate_actions.length > 0) {
    parts.push(
      `What can be done (candidate actions, each authority-checked): ` +
        v.candidate_actions
          .map((x) =>
            x.authority_check
              ? `${x.action} [authority: ${x.authority_check.basis} — ${x.authority_check.authorized ? "authorized" : "NOT authorized"}${x.authority_check.requires_assent ? ", requires sovereign assent" : ""}]`
              : `${x.action} [no authority check]`
          )
          .join(" ")
    );
  }

  // Multi-lens: the other lenses' conclusions are part of the answer,
  // not decoration. (Skipped under A3, whose selected set has one lens.)
  if (a.lenses.length > 1) {
    parts.push(
      `Also in view (other lenses, ranked ${a.lenses.map((l) => `${l.cluster_id}:${l.relevance_score.toFixed(2)}`).join(", ")}): ` +
        a.lenses.slice(1).map((l) => `[${l.cluster_id}] ${l.output.summary}`).join(" ")
    );
  }

  if (a.ablate !== "A4") {
    parts.push(
      `What is not known (uncertainty preserved, not filled): ${v.unknowns.join("; ")}. Overall uncertainty: ${a.uncertainty.toFixed(2)}${a.sources.length ? ` (sources: ${a.sources.map((s) => s.name).join(", ")})` : ""}.`
    );
  } else {
    parts.push(`Confidence: ${(1 - a.uncertainty).toFixed(2)}.`);
  }

  return parts.join("\n\n");
}
