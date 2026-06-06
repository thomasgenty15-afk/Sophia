import type {
  SelectStatePotionSkillResult,
  StatePotionHandoffDraft,
} from "./contract.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";

export function renderSelectStatePotionSkillResult(
  result: SelectStatePotionSkillResult,
): string {
  if (result.committed_effects.length === 0) {
    return renderNonCommittedReply(
      result.reply,
      result.status === "blocked"
        ? "Je ne peux pas activer cette potion dans cet état."
        : result.status === "cancelled"
        ? "Ok, je ne l'active pas."
        : "",
    );
  }
  return result.reply ?? "";
}

function disabledLegacyRenderer(): never {
  throw new Error(
    "select_state_potion_visible_renderer_legacy_disabled: use visible_agents/agent.ts",
  );
}

export function renderSelectStatePotionHandoffDraft(
  _draft: StatePotionHandoffDraft,
): string {
  return disabledLegacyRenderer();
}

export function renderStatePotionApplyAttemptHandoff(
  _draft?: StatePotionHandoffDraft | null,
): string {
  return disabledLegacyRenderer();
}

export function renderStatePotionPlatformDestinationHandoff(
  _draft?: StatePotionHandoffDraft | null,
): string {
  return disabledLegacyRenderer();
}

export function renderStatePotionRepeatHandoff(
  _draft?: StatePotionHandoffDraft | null,
): string {
  return disabledLegacyRenderer();
}
