// cluster_core: shared pipeline for every cluster.
//   input → prompt contract → Reasoner → Analysis
//         → validateAnalysis → repairAnalysis → validateAnalysis
//         → project Analysis into this lens's ClusterOutput
//         → validateClusterOutput
// The ontology is enforced by the validators, not by trusting the backend.

import { SurfaceInput, ClusterOutput } from "./types";
import { RelationshipEvidence } from "./evidence_bundle";
import { Analysis, contractFor, getReasoner } from "./reasoner";
import { repairAnalysis, validateAnalysis, validateClusterOutput } from "./validator";
import { getActiveAblation } from "./ablation";

const CLASS_RANK: Record<string, number> = {
  observed_sequence: 0,
  statistical_association: 1,
  candidate_causal: 2,
  demonstrated_intervention: 3,
};

export function strongestRelation(analysis: Analysis): Analysis["relations"][number] | null {
  if (analysis.relations.length === 0) return null;
  return [...analysis.relations].sort(
    (x, y) => CLASS_RANK[y.relationship_class] - CLASS_RANK[x.relationship_class]
  )[0];
}

export function relationshipEvidence(
  analysis: Analysis,
  ctx: Record<string, unknown> = {}
): RelationshipEvidence {
  // Preserve the sovereign record's class buckets in links (the record is
  // evidence too, kept per-class, never mixed into one blob).
  const buckets: Record<string, unknown> = {
    observed_sequences: (ctx["observed_sequences"] as unknown[]) ?? [],
    statistical_associations: (ctx["statistical_associations"] as unknown[]) ?? [],
    candidate_causal: (ctx["candidate_causal"] as unknown[]) ?? [],
    demonstrated_interventions: (ctx["demonstrated_interventions"] as unknown[]) ?? [],
  };
  const top = strongestRelation(analysis);
  if (!top) {
    return {
      relationship_class: "observed_sequence",
      description:
        "No relationship asserted. The input states observations without a relation that earns a class; asserting one would be inflation, so the layer records the absence explicitly at the weakest class.",
      links: { asserted_relations: [], ...buckets },
      asserted_relations: [],
    };
  }
  return {
    relationship_class: top.relationship_class,
    description: `${top.subject} ${top.predicate} ${top.object} — classified ${top.relationship_class}. ${top.justification}`,
    links: { asserted_relations: analysis.relations, ...buckets },
    asserted_relations: analysis.relations,
  };
}

export function baseUncertainty(analysis: Analysis, input: SurfaceInput): number {
  let u = 0.3;
  if (analysis.projection === null) u += 0.15;
  if (analysis.uncertainty_signals.conflicting_signals) u += 0.1;
  if (analysis.uncertainty_signals.missing_context) u += 0.05;
  if (analysis.uncertainty_signals.sparse_history) u += 0.05;
  if (analysis.urgent_action) u = Math.min(u, 0.15); // the action is certain even when causes are not
  return Math.min(1, Math.max(0, u));
}

export interface BuiltOutput {
  output: ClusterOutput;
  analysis: Analysis;
}

export function buildClusterOutput(clusterId: string, input: SurfaceInput): BuiltOutput {
  const reasoner = getReasoner();
  const contract = contractFor(clusterId);
  let analysis = reasoner.reason(input, contract);

  let report = validateAnalysis(analysis, input);
  let repairs: string[] = [];
  if (!report.valid) {
    const fixed = repairAnalysis(analysis, input);
    analysis = fixed.analysis;
    repairs = fixed.repairs;
    report = validateAnalysis(analysis, input);
  }

  // --- Experiment ablations that operate at this layer ---
  const ablate = getActiveAblation();
  if (ablate === "A1") {
    // Production-level layer fusion (frozen definition: four layers ->
    // single "analysis" field). The pattern layer is not produced at all:
    // findings are the raw sentences as one undifferentiated list, and the
    // position statement loses its separation clause. (Run 1 of Exp 002
    // fused only the presentation while keeping pattern-layer products;
    // the independent judge found the distinction still semantically
    // present on 1.1 — an under-powered ablation, corrected here.)
    analysis.regularities = [];
    analysis.position_statement = analysis.raw_quotes.join(" ");
  }
  if (ablate === "A2") {
    // Relationship classification removed: relations collapse to a bare
    // "related" assertion and causal language is no longer capped.
    for (const rel of analysis.relations) {
      if (rel.relationship_class === "statistical_association" || rel.relationship_class === "observed_sequence") {
        rel.relationship_class = "candidate_causal";
        rel.justification = "The two are related and one plausibly causes the other.";
      }
    }
  }
  if (ablate === "A5" && clusterId === "agency") {
    // Authority gate removed: free endorsements of whatever the input's
    // lure suggests, with no authority-check records.
    const t = input.raw_text.toLowerCase();
    const free: Analysis["candidate_actions"] = [];
    if (t.includes("formalize")) free.push({ action: "Formalize the practice — outcomes are good, keep approving refunds to keep customers happy.", authority_check: undefined as never });
    if (t.includes("keep it") || t.includes("sub-account")) free.push({ action: "Keep the sub-accounts and the current setup — it is 3x faster.", authority_check: undefined as never });
    if (free.length > 0) analysis.candidate_actions = free;
  }

  const ctx = (input.sovereign_context ?? {}) as Record<string, unknown>;
  const relationship = relationshipEvidence(analysis, ctx);
  const trajectory = analysis.projection
    ? {
        projection: { statement: analysis.projection.statement },
        assumptions: { listed: analysis.projection.assumptions },
        horizon: analysis.projection.horizon,
        confidence: analysis.projection.confidence,
        statement: analysis.projection.statement,
      }
    : null;

  const evidence = {
    raw: {
      raw_text: input.raw_text,
      tokens: input.tokens,
      sovereign_context: input.sovereign_context,
      state_snapshot: (ctx["state_snapshot"] as Record<string, unknown>) ?? null,
      delegations: (ctx["delegations"] as unknown[] | Record<string, unknown>) ?? null,
      open_loops: (ctx["open_loops"] as unknown[] | Record<string, unknown>) ?? null,
      resources: (ctx["resources"] as Record<string, unknown>) ?? null,
      observations: analysis.raw_quotes,
    },
    pattern: {
      state_markers: {},
      delegation_markers: {},
      loop_markers: {},
      resource_markers: {},
      temporal_markers: {},
      regularities: analysis.regularities,
    },
    relationship,
    trajectory,
  };

  const richSignals: Record<string, unknown> = {
    raw_quotes: analysis.raw_quotes,
    regularities: analysis.regularities,
    asserted_relations: analysis.relations,
    // Claim relations (fix sprint, spec §4.2): carried alongside
    // asserted_relations, never inside them — a claim relation is
    // not a RelationshipClass and never enters the ceiling machinery.
    claim_relations: analysis.claim_relations ?? [],
    candidate_actions: analysis.candidate_actions,
    unknowns: analysis.unknowns,
    urgent_action: analysis.urgent_action,
    trajectory_null_reason: analysis.trajectory_null_reason,
    analysis_signals: analysis.uncertainty_signals,
    validation: { valid: report.valid, violations: report.violations, repairs },
    reasoner_id: reasoner.id,
  };

  let summary = "";
  let signals: Record<string, unknown> = { ...richSignals };
  const uncertainty = baseUncertainty(analysis, input);

  switch (clusterId) {
    case "position": {
      summary = analysis.position_statement;
      signals = {
        ...signals,
        state_markers: evidence.pattern.state_markers,
        delegation_markers: {},
        loop_markers: {},
        resource_markers: {},
      };
      break;
    }
    case "history": {
      const timeline = (ctx["timeline"] as unknown[]) ?? [];
      const decisions = (ctx["decisions"] as unknown[]) ?? [];
      summary =
        timeline.length > 0
          ? `History: ${timeline.length} recorded events, ${decisions.length} decision points. ${analysis.history_statement}`
          : `History: no recorded timeline in context. ${analysis.history_statement}`;
      signals = {
        ...signals,
        event_count: timeline.length,
        decision_count: decisions.length,
        temporal_markers: evidence.pattern.temporal_markers,
      };
      break;
    }
    case "relationships": {
      const variables = (ctx["variables"] as string[]) ?? [];
      summary =
        analysis.relations.length > 0
          ? `Relationships (each asserted relation classified, none mixed): ` +
            analysis.relations
              .map((r) => `${r.subject} ${r.predicate} ${r.object} → ${r.relationship_class} (${r.justification})`)
              .join(" | ")
          : "Relationships: no relation is asserted — the input does not support one at any class, and asserting one would be inflation.";
      signals = {
        ...signals,
        variable_count: variables.length,
        relationship_class: relationship.relationship_class,
      };
      break;
    }
    case "trajectory": {
      const branches = (ctx["branches"] as unknown[]) ?? [];
      const analogues = (ctx["analogues"] as unknown[]) ?? [];
      summary = analysis.projection
        ? `Trajectory (projection — distinct from observation): ${analysis.projection.statement} Assumptions: ${analysis.projection.assumptions.join("; ")}. Confidence ${analysis.projection.confidence}.`
        : `Trajectory: no projection. ${analysis.trajectory_null_reason} The observations describe where things ARE; they are not a forecast, and this output refuses to convert them into one.`;
      signals = {
        ...signals,
        has_projection: analysis.projection !== null,
        branch_count: branches.length,
        analogue_count: analogues.length,
      };
      break;
    }
    case "agency": {
      const leverage = (ctx["leverage_points"] as unknown[]) ?? [];
      const interventions = (ctx["available_interventions"] as unknown[]) ?? [];
      const delegations = (ctx["delegations"] as unknown[]) ?? [];
      const immutable = (ctx["immutable_factors"] as unknown[]) ?? [];
      summary =
        `Agency — candidate actions, each authority-checked before emission: ` +
        analysis.candidate_actions
          .map((a) =>
            a.authority_check
              ? `${a.action} [authority check: basis=${a.authority_check.basis}; ` +
                `${a.authority_check.authorized ? "AUTHORIZED" : "NOT AUTHORIZED"}; ` +
                `${a.authority_check.requires_assent ? "requires sovereign assent; " : ""}${a.authority_check.note}]`
              : `${a.action} [no authority check]`
          )
          .join(" ");
      signals = {
        ...signals,
        leverage_count: leverage.length,
        intervention_count: interventions.length,
        delegation_count: Array.isArray(delegations) ? delegations.length : 0,
        immutable_count: immutable.length,
      };
      break;
    }
    default:
      summary = analysis.position_statement;
  }

  const output: ClusterOutput = { summary, signals, uncertainty, evidence };
  const outReport = validateClusterOutput(output, input);
  if (!outReport.valid) {
    (output.signals as Record<string, unknown>)["output_validation"] = outReport;
  }
  return { output, analysis };
}
