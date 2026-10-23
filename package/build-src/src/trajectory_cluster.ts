// TrajectoryCluster: "Where am I going?"
// Projection only when the input supports it; otherwise an explicit null
// trajectory WITH a recorded reason. Observation and projection are never
// converted into one another.

import { SurfaceInput, ClusterOutput, ClusterModule } from "./types";
import { buildClusterOutput } from "./cluster_core";

export const TrajectoryCluster: ClusterModule = {
  id: "trajectory",
  compute(input: SurfaceInput): ClusterOutput {
    return buildClusterOutput("trajectory", input).output;
  },
  confidence(input: SurfaceInput): number {
    const ctx = input.sovereign_context ?? {};
    if (ctx["projection"]) return 0.7;
    return /where will|when will|going|next quarter|future|headed/i.test(input.raw_text) ? 0.5 : 0.2;
  },
};
