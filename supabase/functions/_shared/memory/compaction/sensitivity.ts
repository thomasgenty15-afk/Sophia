import type { SensitivityLevel } from "../types.v1.ts";
import type { TopicCompactionMemoryItem } from "./types.ts";

const RANK: Record<SensitivityLevel, number> = {
  normal: 0,
  sensitive: 1,
  safety: 2,
};

export function normalizeSensitivityLevel(
  raw: unknown,
): SensitivityLevel {
  const value = String(raw ?? "").trim();
  if (value === "safety" || value === "sensitive" || value === "normal") {
    return value;
  }
  return "normal";
}

export function maxSensitivityLevel(
  levels: unknown[],
): SensitivityLevel {
  let max: SensitivityLevel = "normal";
  for (const level of levels.map(normalizeSensitivityLevel)) {
    if (RANK[level] > RANK[max]) max = level;
  }
  return max;
}

export function computeTopicSensitivityMax(
  items: TopicCompactionMemoryItem[],
): SensitivityLevel {
  return maxSensitivityLevel(
    items
      .filter((item) => item.status === "active")
      .map((item) => item.sensitivity_level),
  );
}
