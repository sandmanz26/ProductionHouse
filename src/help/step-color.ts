import type { StepKind } from "./content";

/** Step colours reuse the validated process-map palette. */
export const STEP_COLOR: Record<StepKind, string> = {
  material: "var(--flow-bahan)",
  process: "var(--flow-netral)",
  product: "var(--flow-produk)",
  offcut: "var(--flow-sisa)",
  money: "var(--flow-biaya)",
  neutral: "var(--rule)",
};
