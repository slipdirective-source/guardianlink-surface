// AgencyCluster: "What can I do about it?"
// Generates candidate actions AND runs an explicit authority/assent check
// on each before emission (validator-enforced: no action leaves this
// cluster without an authority-check record). Urgent obvious action is
// emitted first, authorized — the ontology never impedes it.

import { SurfaceInput, ClusterOutput, ClusterModule } from "./types";
import { buildClusterOutput } from "./cluster_core";

export const AgencyCluster: ClusterModule = {
  id: "agency",
  compute(input: SurfaceInput): ClusterOutput {
    return buildClusterOutput("agency", input).output;
  },
  confidence(input: SurfaceInput): number {
    const ctx = input.sovereign_context ?? {};
    const leverage = (ctx["leverage_points"] as unknown[]) ?? [];
    if (leverage.length > 0) return 0.7;
    return /can|do|should|keep|formalize|ban|wear|comfort|evacuate/i.test(input.raw_text) ? 0.55 : 0.4;
  },
};
