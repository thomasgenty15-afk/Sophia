import type { PotionType } from "../../../../_shared/v2-types.ts";

export const STATE_POTION_VISIBLE_LABELS: Record<PotionType, string> = {
  rappel: "Potion anti-décrochage",
  courage: "Potion de courage",
  guerison: "Potion de guérison",
  clarte: "Potion de clarté",
  amour: "Potion d'amour",
  apaisement: "Potion d'apaisement",
};

export function visiblePotionLabel(type: string | null | undefined): string {
  return type && type in STATE_POTION_VISIBLE_LABELS
    ? STATE_POTION_VISIBLE_LABELS[type as PotionType]
    : "Potion d'état";
}

export function assertAllowedStatePotionLabel(label: string): string {
  const raw = String(label ?? "").trim();
  const allowed = new Set(Object.values(STATE_POTION_VISIBLE_LABELS));
  if (allowed.has(raw)) return raw;
  throw new Error(`invalid_state_potion_visible_label:${raw}`);
}

