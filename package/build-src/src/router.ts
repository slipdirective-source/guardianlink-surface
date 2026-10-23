// Ranked router: takes a question, returns ranked list of (cluster, relevance).
// The five questions are lenses, not tabs. Top cluster is primary;
// others remain available for cross-reference.

import { SurfaceInput, ClusterModule, RankedCluster } from "./types";
import { PositionCluster } from "./position_cluster";
import { HistoryCluster } from "./history_cluster";
import { RelationshipsCluster } from "./relationships_cluster";
import { TrajectoryCluster } from "./trajectory_cluster";
import { AgencyCluster } from "./agency_cluster";

const CLUSTERS: ClusterModule[] = [
  PositionCluster,
  HistoryCluster,
  RelationshipsCluster,
  TrajectoryCluster,
  AgencyCluster,
];

// Question type hints mapped to cluster IDs.
const TYPE_HINTS: Record<string, string[]> = {
  position: ["position"],
  where_am_i: ["position"],
  history: ["history"],
  how_did_i_get_here: ["history"],
  relationships: ["relationships"],
  what_interacts: ["relationships"],
  trajectory: ["trajectory"],
  where_am_i_going: ["trajectory"],
  agency: ["agency"],
  what_can_i_do: ["agency"],
};

export interface Question {
  type: string;
  text: string;
}

export function routeQuestion(
  question: Question,
  input: SurfaceInput
): RankedCluster[] {
  const tokens = input.tokens.map((t) => t.toLowerCase());
  const hints = TYPE_HINTS[question.type.toLowerCase()] ?? [];

  const scored = CLUSTERS.map((cluster) => {
    let score = cluster.confidence(input) * 0.5;

    // Boost if question type hints at this cluster.
    if (hints.includes(cluster.id)) score += 0.4;

    // Boost based on token overlap with cluster domain.
    score += tokenRelevance(cluster.id, tokens) * 0.3;

    return { cluster, relevance_score: Math.min(1.0, score) };
  });

  // Sort descending by relevance.
  scored.sort((a, b) => b.relevance_score - a.relevance_score);
  return scored;
}

function tokenRelevance(clusterId: string, tokens: string[]): number {
  const domains: Record<string, string[]> = {
    position: ["where", "now", "current", "am", "status"],
    history: ["how", "before", "past", "was", "did", "history"],
    relationships: ["interact", "with", "between", "relate", "connect", "cause"],
    trajectory: ["going", "will", "future", "next", "predict", "where"],
    agency: ["can", "do", "change", "control", "should", "action"],
  };
  const keywords = domains[clusterId] ?? [];
  const hits = keywords.filter((kw) => tokens.includes(kw)).length;
  return keywords.length > 0 ? hits / keywords.length : 0;
}
