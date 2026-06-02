import type {
  CoachPreferenceHandoffDraft,
  CoachPreferencesPatchDraftRef,
  UpdateCoachPreferencesCommittedEffect,
  UpdateCoachPreferencesSkillResult,
} from "./contract.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

const PLATFORM_UPDATE_CLOSING =
  "Je t’ai préparé le réglage ; il ne reste qu’à le mettre à jour dans les Préférences coach.";

export function renderCoachPreferencesExecuted(args: {
  draft: CoachPreferencesPatchDraftRef;
  committedEffects: UpdateCoachPreferencesCommittedEffect[];
}): string {
  void args;
  return renderCoachPreferencesFailed();
}

export function renderCoachPreferencesFailed(): string {
  const destination = getHandoffTargetForOperation("update_coach_preferences")
    ?.user_facing_destination ?? "dans les préférences coach de la plateforme";
  return `Je t’ai préparé le réglage à reprendre ${destination}. Il ne reste qu’à le mettre à jour depuis la plateforme.`;
}

function settingText(
  setting: CoachPreferenceHandoffDraft["supported_settings"][number],
) {
  return `${setting.label} sur ${setting.recommended_value}`;
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function durableIntro(draft: CoachPreferenceHandoffDraft): string {
  if (draft.preference_kind === "punctual_instruction") {
    return `Là, je le traite comme une consigne ponctuelle pour cette réponse, pas comme un réglage durable.`;
  }
  if (draft.preference_kind === "ambiguous") {
    return `Je vois l’idée, mais il manque encore une précision avant d’en faire un réglage durable.`;
  }
  if (draft.preference_kind === "durable_unsupported") {
    return `Je vois la préférence durable que tu demandes, mais elle n’existe pas telle quelle dans les réglages visibles.`;
  }
  return `Oui, je te prépare ça comme préférence durable pour la suite.`;
}

export function renderCoachPreferenceHandoffDraft(
  draft: CoachPreferenceHandoffDraft,
): string {
  const target = getHandoffTargetForOperation("update_coach_preferences");
  const destination = target?.user_facing_destination ??
    draft.recommendation.platform_destination;
  const steps = target?.platform_steps ?? draft.recommendation.platform_steps;
  const lines: string[] = [durableIntro(draft)];
  if (draft.supported_settings.length > 0) {
    lines.push("");
    lines.push(
      `${
        draft.supported_settings.length > 1
          ? "Ça correspond aux réglages suivants"
          : "Ça correspond au réglage suivant"
      } : ${joinNatural(draft.supported_settings.map(settingText))}.`,
    );
  }
  if (draft.unsupported_parts.length > 0) {
    lines.push("");
    lines.push(
      `En revanche, ${
        joinNatural(draft.unsupported_parts)
      } ne correspond pas à un réglage durable disponible tel quel.`,
    );
  }
  if (draft.recommendation.preserve.length > 0) {
    lines.push("");
    lines.push(
      `Je garderais surtout ${draft.recommendation.preserve.join("; ")}.`,
    );
  }
  if (draft.recommendation.avoid.length > 0) {
    lines.push(
      `J’éviterais d’en faire une règle trop rigide : ${
        draft.recommendation.avoid.join("; ")
      }.`,
    );
  }
  lines.push("");
  if (draft.supported_settings.length > 0) {
    lines.push(
      `Il ne manque plus qu’à aller ${destination} pour mettre à jour ${
        draft.supported_settings.length > 1 ? "ces réglages" : "ce réglage"
      }.`,
    );
  } else {
    lines.push(
      `Tu peux aller ${destination} pour voir les réglages coach disponibles.`,
    );
  }
  if (steps.length > 0) {
    lines.push(`Concrètement : ${steps.join(" ")}`);
  }
  return lines.join("\n");
}

export function renderCoachPreferencesSkillResult(
  result: UpdateCoachPreferencesSkillResult,
): string {
  if (result.status === "executed" && result.committed_effects.length === 0) {
    return renderCoachPreferencesFailed();
  }
  if (result.handoff_draft) {
    return renderCoachPreferenceHandoffDraft(result.handoff_draft);
  }
  if (result.committed_effects.length === 0) {
    return renderNonCommittedReply(
      result.reply,
      PLATFORM_UPDATE_CLOSING,
    );
  }
  return result.reply ?? "";
}
