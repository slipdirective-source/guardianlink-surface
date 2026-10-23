// HistoryCluster: "How did I get here?"
// Lens projection over the shared Reasoner analysis (see cluster_core.ts).

import { SurfaceInput, ClusterOutput, ClusterModule } from "./types";
import { buildClusterOutput } from "./cluster_core";

export const HistoryCluster: ClusterModule = {
  id: "history",
  compute(input: SurfaceInput): ClusterOutput {
    return buildClusterOutput("history", input).output;
  },
  confidence(input: SurfaceInput): number {
    const ctx = input.sovereign_context ?? {};
    const timeline = (ctx["timeline"] as unknown[]) ?? [];
    if (timeline.length > 0) return 0.8;
    return /how|before|past|did|history|started|began/i.test(input.raw_text) ? 0.45 : 0.3;
  },
};
