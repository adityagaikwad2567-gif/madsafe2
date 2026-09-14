/**
 * Client-safe safety level metadata (no server/db imports).
 * Kept in sync with src/lib/safety-engine.ts, which owns the rules.
 */
export type Level = "green" | "yellow" | "orange" | "red";

export const LEVEL_LABELS: Record<Level, string> = {
  green: "General Awareness",
  yellow: "Caution",
  orange: "Professional Supervision",
  red: "Important Warning",
};
