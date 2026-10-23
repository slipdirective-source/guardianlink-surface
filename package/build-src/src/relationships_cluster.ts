// RelationshipsCluster: "What is interacting with what?"
// Every asserted relation is forced through the four-class taxonomy with
// cited evidence; the validator caps classes at what the evidence earns.

import { SurfaceInput, ClusterOutput, ClusterModule } from "./types";
import { buildClusterOutput } from "./cluster_core";

export const RelationshipsCluster: ClusterModule = {
  id: "relationships",
  compute(input: SurfaceInput): ClusterOutput {
    return buildClusterOutput("relationships", input).output;
  },
  confidence(input: SurfaceInput): number {
    const ctx = input.sovereign_context ?? {};
    const variables = (ctx["variables"] as string[]) ?? [];
    if (variables.length > 1) return 0.7;
    return /both|every time|cause|relat|interact|peak/i.test(input.raw_text) ? 0.5 : 0.3;
  },
};
