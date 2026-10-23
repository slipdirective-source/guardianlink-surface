// Uncertainty cross-cut: post-processing module, not a cluster.
// In the rebuilt surface this actually runs across ALL lens outputs:
// answer() passes every composed lens output here, derives source flags
// from the outputs themselves, and returns both the combined value and
// the source breakdown on the response. (In Experiment 001 it was called
// with exactly one output and uncertaintySources() was never called —
// the cross-cut was vacuous. That is fixed and covered by tests.)

import { ClusterOutput } from "./types";

export interface UncertaintySource {
  name: string;
  weight: number;
  value: number; // 0..1
}

export function computeUncertainty(outputs: ClusterOutput[]): number {
  if (outputs.length === 0) return 1.0;
  const sum = outputs.reduce((acc, o) => acc + o.uncertainty, 0);
  return sum / outputs.length;
}

export function uncertaintySources(input: {
  ambiguous_input: boolean;
  missing_context: boolean;
  conflicting_signals: boolean;
  low_confidence_tokens: boolean;
  sparse_history: boolean;
}): UncertaintySource[] {
  const sources: UncertaintySource[] = [];
  if (input.ambiguous_input)
    sources.push({ name: "ambiguous_input", weight: 0.25, value: 0.8 });
  if (input.missing_context)
    sources.push({ name: "missing_sovereign_context", weight: 0.25, value: 0.7 });
  if (input.conflicting_signals)
    sources.push({ name: "conflicting_cluster_signals", weight: 0.2, value: 0.6 });
  if (input.low_confidence_tokens)
    sources.push({ name: "low_confidence_tokenization", weight: 0.15, value: 0.5 });
  if (input.sparse_history)
    sources.push({ name: "sparse_history", weight: 0.15, value: 0.6 });
  return sources;
}

// Cross-cut over a set of lens outputs: weighted combination of the mean
// lens uncertainty and the derived source penalties. Sources are derived
// from the outputs' own recorded signals (unknowns count, null trajectory
// reasons, conflicting regularities), not re-guessed here.
export function crossCutUncertainty(outputs: ClusterOutput[]): {
  value: number;
  sources: UncertaintySource[];
} {
  if (outputs.length === 0) return { value: 1.0, sources: [] };
  const mean = computeUncertainty(outputs);

  const anySignals = outputs.map((o) => o.signals as Record<string, unknown>);
  const unknownsCount = Math.max(
    0,
    ...anySignals.map((s) => (Array.isArray(s["unknowns"]) ? (s["unknowns"] as unknown[]).length : 0))
  );
  const hasNullTrajectory = anySignals.some((s) => s["trajectory_null_reason"]);
  const hasUrgent = anySignals.some((s) => s["urgent_action"]);
  // Analysis-level signals recorded by the reasoner on each output:
  // a record that contradicts itself and a record whose evidence is
  // stale relative to the question are cross-cut sources, derived from
  // the outputs (Experiment 003) — not re-guessed here.
  const analysisSignals = anySignals.map(
    (s) => (s["analysis_signals"] as Record<string, unknown> | undefined) ?? {}
  );
  const hasConflict = analysisSignals.some((s) => s["conflicting_signals"] === true);
  const hasStale = analysisSignals.some((s) => s["stale_evidence"] === true);

  const sources = uncertaintySources({
    ambiguous_input: unknownsCount >= 3,
    missing_context: outputs.some((o) => o.evidence.raw.sovereign_context === null),
    conflicting_signals: hasConflict,
    low_confidence_tokens: false,
    sparse_history: hasNullTrajectory,
  });
  if (hasStale)
    sources.push({ name: "stale_record_evidence", weight: 0.2, value: 0.7 });
  // An urgent, obvious action is NOT uncertain even when its causes are:
  // the cross-cut must not manufacture hesitation on Category 5 inputs.
  if (hasUrgent) return { value: Math.min(mean, 0.2), sources };

  const penalty = sources.reduce((acc, s) => acc + s.weight * s.value, 0) * 0.3;
  return { value: Math.min(1, mean + penalty), sources };
}
