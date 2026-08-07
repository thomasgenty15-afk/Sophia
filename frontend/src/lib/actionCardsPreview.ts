import type { UserAttackCardRow } from "../types/v2";

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
