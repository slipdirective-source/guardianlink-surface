// Ablation switchboard for the experiment harness.
// Exactly one ablation may be active at a time; production calls never set
// one. Each ablation disables ONE mechanism of the rebuilt surface so the
// experiment can test whether that mechanism was doing the work:
//   A1 layers fused (composer-level)
//   A2 relationship ceiling/classification removed (cluster_core)
//   A3 ranked router -> single lens (surface-level)
//   A4 uncertainty cross-cut removed (surface/composer-level)
//   A5 agency authority gate removed (cluster_core)
export type AblationId = "A1" | "A2" | "A3" | "A4" | "A5";
let active: AblationId | null = null;
export function setActiveAblation(a: AblationId | null): void {
  active = a;
}
export function getActiveAblation(): AblationId | null {
  return active;
}
