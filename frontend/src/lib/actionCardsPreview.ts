import type { UserAttackCardRow, UserDefenseCardRow } from "../types/v2";

export function resolveDefensePreview(card: UserDefenseCardRow | null) {
  const impulse = card?.content.impulses.find((entry) =>
    Array.isArray(entry.triggers) && entry.triggers.length > 0
  );
  const trigger = impulse?.triggers?.[0];

  if (!card || !impulse || !trigger) return null;

  return {
    title: impulse.label?.trim() || "Plan anti-piege",
    moment: trigger.situation,
    trap: trigger.signal,
    move: trigger.defense_response,
    planB: String(trigger.plan_b ?? impulse.generic_defense ?? "").trim() || null,
  };
}

export function resolveAttackPreview(card: UserAttackCardRow | null) {
  const technique = card?.content.techniques.find((entry) => entry.generated_result) ??
    card?.content.techniques?.[0];

  if (!card || !technique) return null;

  return {
    title: technique.generated_result?.output_title?.trim() || technique.title,
    techniqueTitle: technique.title,
    summary: card.content.summary,
    modeEmploi: technique.generated_result?.mode_emploi ?? technique.mode_emploi,
    generatedAsset: technique.generated_result?.generated_asset ?? null,
    hasGeneratedResult: Boolean(technique.generated_result?.generated_asset),
  };
}
