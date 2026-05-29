import type {
  PrepareAttackCardCommittedEffect,
  PrepareAttackCardEffect,
} from "./contract.ts";
import type { AttackCardDraftV1 } from "./generator.ts";

function draftLines(draft: AttackCardDraftV1): string[] {
  return [
    draft.draft.title,
    `Technique : ${draft.draft.technique_title}`,
    draft.draft.generated_asset,
    `Mode d'emploi : ${draft.draft.mode_emploi}`,
  ].filter((line) => String(line ?? "").trim());
}

export function renderAttackCardDraftOnlyReply(draft: AttackCardDraftV1): string {
  return [
    "Voici le brouillon complet. Je n'ai rien créé en base.",
    "",
    ...draftLines(draft),
  ].join("\n");
}

export function renderAttackCardPendingConfirmationReply(
  draft: AttackCardDraftV1,
): string {
  return [
    ...draftLines(draft),
    "",
    "Confirme explicitement si tu veux que je crée cette carte d'attaque.",
  ].join("\n");
}

export function renderAttackCardExecutedReply(
  committed: PrepareAttackCardCommittedEffect,
): string {
  const resourceLabel = committed.target.kind === "personal_action"
    ? "Ressources > Cartes d'attaque"
    : "Ressources > Cartes d'attaque du plan";
  return [
    "C'est fait. J'ai créé cette carte d'attaque.",
    "",
    ...draftLines(committed.draft),
    "",
    `Carte créée : ${committed.attack_card_id}`,
    `Tu peux la retrouver dans ${resourceLabel}.`,
  ].join("\n");
}

export function renderAttackCardFailedReply(): string {
  return "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est fait tant que la DB ne l'a pas confirmé.";
}

export function renderAttackCardBlockedCreateReply(): string {
  return "Je ne crée pas cette carte sans confirmation compatible du brouillon en attente.";
}

export function renderAttackCardCancelledReply(): string {
  return "Ok, je ne crée pas cette carte d'attaque.";
}

export function renderAttackCardExplanationReply(draft: AttackCardDraftV1): string {
  return [
    `Pourquoi cette technique : ${draft.draft.why_it_helps}`,
    "",
    `Mode d'emploi : ${draft.draft.mode_emploi}`,
    "",
    "Je ne crée rien tant que tu ne confirmes pas explicitement.",
  ].join("\n");
}

export function renderAttackCardPendingFromEffect(
  effect: PrepareAttackCardEffect,
): string {
  return renderAttackCardPendingConfirmationReply(effect.draft);
}
