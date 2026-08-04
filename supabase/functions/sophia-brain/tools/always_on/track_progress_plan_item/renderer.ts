import type {
  TrackProgressCommittedEffect,
  TrackProgressDirectEffectResult,
} from "./contract.ts";

/**
 * PIVOT NUTRITION — CES TEXTES SONT VISIBLES, DONC ILS ONT UNE LANGUE.
 *
 * ── LE DÉFAUT MESURÉ (QA agent 6, 2026-08-03) ─────────────────────────────
 * Élève KEEL en `locale='en-GB'`, message « I had a burger and chips at lunch
 * today, not on my plan. ». Le dispatcher classe un `track_progress_plan_item`,
 * l'exécuteur bloque en `target_missing` (l'élève n'a aucun `plan_commitments`
 * — c'est le modèle 1:N: le coach recommande, il ne prescrit pas), et le repli
 * de clarification part tel quel:
 *
 *     « Je prefere confirmer avant de l'ecrire. »
 *
 * Preuve: `chat_messages` du 2026-08-03, `reason_code='target_missing'`,
 * `response_owner='normal_reply'`. C'est une LIGNE ROUGE du produit (surface
 * élève KEEL en français alors que le produit est en-GB), et elle n'a rien
 * d'un défaut de génération: ces chaînes sont écrites en dur, aucun modèle
 * n'est passé par là.
 *
 * ── POURQUOI PARAMÈTRE OBLIGATOIRE ET NON OPTIONNEL ───────────────────────
 * `locale` est REQUIS à chaque fonction. Un `locale?: string` aurait compilé
 * partout sans rien changer aux appelants existants — c'est-à-dire une garde
 * déclarée et jamais armée, la classe de défaut n°1 de ce dépôt (un paramètre
 * de garde optionnel est une garde désarmée). En le rendant obligatoire, le
 * compilateur énumère lui-même les chemins qui rendent du texte visible, et
 * un chemin neuf ne peut pas oublier la langue en silence.
 *
 * ── CONDITION DE DÉSARMEMENT (doctrine P9) ────────────────────────────────
 * `isFrench(locale)` vrai ⇒ les textes sont EXACTEMENT ceux d'avant, octet
 * pour octet. Le produit legacy B2C, qui est francophone, ne voit aucun
 * changement — c'est le test prémisse-fausse de `renderer_locale_test.ts`.
 * La bascule ne mord que là où le problème existe: une locale non française.
 *
 * ── D'OÙ VIENT LA LOCALE, ET POURQUOI CELLE-LÀ ────────────────────────────
 * `turn_frame.direct_effect_time_context.user_locale`, alimentée par
 * `getUserTimeContext` depuis `profiles.locale` (`_shared/user_time_context.ts`).
 * PAS `turn_frame.user_locale`: ce champ existe dans le contrat et n'est écrit
 * par AUCUN chemin de production — le lire aurait produit `undefined`, donc le
 * repli français, donc un correctif vert en test et mort en réel.
 */
function isFrench(locale: string): boolean {
  return String(locale ?? "").trim().toLowerCase().startsWith("fr");
}

export function renderTrackProgressLoggedReply(
  effect: TrackProgressCommittedEffect | null | undefined,
  locale: string,
): string | null {
  if (!effect?.logged_progress_id) return null;
  // P4-A (rose-hard16 R1-B01): une correction de cible executee enonce les
  // DEUX moities — le commit ET le retrait sur l'ancienne cible. Le retrait
  // silencieux laissait le user croire que l'entree erronee comptait encore.
  if (isFrench(locale)) {
    const retargetSuffix = effect.retarget_invalidated
      ? effect.retarget_from_title
        ? ` — et je l'ai retiré de « ${effect.retarget_from_title} ».`
        : " — et j'ai retiré l'entrée erronée de l'autre action."
      : ".";
    if (effect.progress_status === "missed") {
      return `C'est noté : ${effect.target_title} est marqué comme raté${retargetSuffix}`;
    }
    if (effect.progress_status === "partial") {
      return `C'est noté : ${effect.target_title} est marqué comme partiel${retargetSuffix}`;
    }
    return `C'est noté : ${effect.target_title} est marqué comme fait${retargetSuffix}`;
  }
  const retargetSuffix = effect.retarget_invalidated
    ? effect.retarget_from_title
      ? ` — and I took it off “${effect.retarget_from_title}”.`
      : " — and I took the wrong entry off the other action."
    : ".";
  if (effect.progress_status === "missed") {
    return `Logged: ${effect.target_title} is marked as missed${retargetSuffix}`;
  }
  if (effect.progress_status === "partial") {
    return `Logged: ${effect.target_title} is marked as partial${retargetSuffix}`;
  }
  return `Logged: ${effect.target_title} is marked as done${retargetSuffix}`;
}

export function renderTrackProgressClarification(
  reasonCode: string,
  locale: string,
): string {
  if (isFrench(locale)) {
    if (reasonCode === "status_missing") {
      return "Le statut du progres n'est pas assez clair.";
    }
    if (reasonCode === "target_ambiguous") {
      return "Tu parles de quel element exactement ?";
    }
    if (reasonCode === "intent_implied_weak") {
      return "Tu veux que je le note vraiment ?";
    }
    return "Je prefere confirmer avant de l'ecrire.";
  }
  if (reasonCode === "status_missing") {
    return "I can't tell clearly enough how that went.";
  }
  if (reasonCode === "target_ambiguous") {
    return "Which one exactly do you mean?";
  }
  if (reasonCode === "intent_implied_weak") {
    return "Do you want me to log that?";
  }
  return "I'd rather check with you before I write it down.";
}

const trackProgressOutcomeLabels: Record<string, Record<string, string>> = {
  fr: { completed: "fait", partial: "partiel", missed: "rate" },
  en: { completed: "done", partial: "partial", missed: "missed" },
};

export function renderTrackProgressContradictionClarification(input: {
  target_title: string;
  existing_outcome: string;
  requested_status: string;
  locale: string;
}): string {
  // Pas d'offre de bascule: l'override same-day n'existe pas en chat
  // (paul-r5 B02, decision V1) — « tu veux que je corrige ? » promettait une
  // confirmation inexecutable (boucle morte). On dit l'etat et ou ca se
  // corrige, sans question.
  void input.requested_status;
  if (isFrench(input.locale)) {
    const existing = trackProgressOutcomeLabels.fr[input.existing_outcome] ??
      input.existing_outcome;
    return `Aujourd'hui, ${input.target_title} est deja note comme ${existing} — je ne peux pas changer ca depuis le chat. Si c'est une erreur, tu peux le corriger directement sur cette action dans Dashboard > Plan.`;
  }
  const existing = trackProgressOutcomeLabels.en[input.existing_outcome] ??
    input.existing_outcome;
  return `Today, ${input.target_title} is already logged as ${existing} — I can't change that from the chat. If it's wrong, you can correct it on that action in Dashboard > Plan.`;
}

export function enforceTrackProgressReplyInvariant(
  result: TrackProgressDirectEffectResult,
): TrackProgressDirectEffectResult {
  return result;
}
