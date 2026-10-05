// Same three conditions as the record form in the mobile app
export type Condition = "healthy" | "damaged" | "diseased";

export const CONDITION_LABEL: Record<Condition, string> = {
  healthy: "Healthy",
  damaged: "Damaged",
  diseased: "Diseased",
};
