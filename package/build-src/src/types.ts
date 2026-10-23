import { EvidenceBundle } from "./evidence_bundle";

export interface SurfaceInput {
  raw_text: string;
  tokens: string[];
  sovereign_context: Record<string, unknown> | null;
}

export interface ClusterOutput {
  summary: string;
  signals: Record<string, unknown>;
  uncertainty: number; // 0..1
  evidence: EvidenceBundle;
}

export interface ClusterModule {
  id: string;
  compute(input: SurfaceInput): ClusterOutput;
  confidence(input: SurfaceInput): number; // 0..1
}

export interface RankedCluster {
  cluster: ClusterModule;
  relevance_score: number; // 0..1
}

export interface LensOutput {
  cluster_id: string;
  relevance_score: number;
  output: ClusterOutput;
}

export interface SurfaceResponse {
  cluster_id: string;
  output: ClusterOutput;
  uncertainty: number;
  ranked_clusters: RankedCluster[];
  // Multi-lens composition: outputs from every sufficiently relevant lens,
  // not only ranked[0]. The ranked list now does work.
  lenses: LensOutput[];
  // The composed, user-facing answer text built from all lenses with the
  // four evidence layers kept visibly separate.
  answer_text: string;
  // Uncertainty cross-cut over ALL lens outputs (see uncertainty.ts):
  // source breakdown actually computed and returned, not decorative.
  uncertainty_sources: { name: string; weight: number; value: number }[];
  // Options/abations applied to this response (experiment harness).
  applied_options?: string[];
}

export interface SurfaceOptions {
  // Ablation flags (Experiment 002 harness): each disables one mechanism.
  ablate?: "A1" | "A2" | "A3" | "A4" | "A5";
  // How many lenses to compose (default: all with relevance >= lensThreshold).
  lensThreshold?: number;
}
