// PositionCluster: "Where am I?"
// Reasoning is delegated to the active Reasoner under the position contract
// (see reasoner.ts); ontology enforcement lives in validator.ts. This module
// is the lens projection, not a keyword scaffold.

import { SurfaceInput, ClusterOutput, ClusterModule } from "./types";
import { buildClusterOutput } from "./cluster_core";

export const PositionCluster: ClusterModule = {
  id: "position",
  compute(input: SurfaceInput): ClusterOutput {
    return buildClusterOutput("position", input).output;
  },
  confidence(input: SurfaceInput): number {
    let score = 0.5;
    if (input.sovereign_context !== null) score += 0.2;
    if (input.tokens.length > 3) score += 0.1;
    if (input.raw_text.length > 10) score += 0.1;
    if (/now|current|status|worried|happening/i.test(input.raw_text)) score += 0.05;
    return Math.min(1.0, Math.max(0.0, score));
  },
};
