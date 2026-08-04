import { appendResponseLanguageBlock, resolveResponseLocale } from "../_shared/keel/locale.ts";

/**
 * La confirmation d'opt-out — le message le plus sensible du produit.
 *
 * ── LE DÉFAUT QUE CE FICHIER PORTAIT ─────────────────────────────────────
 * La consigne de tour était en français ET CITAIT LA PHRASE À PRODUIRE
 * (`Confirme clairement: "Sophia ne te contactera plus sur WhatsApp"`). Un
 * modèle recopie une citation telle quelle: un élève anglophone recevait donc
 * « Sophia ne te contactera plus sur WhatsApp. You can pick this back up from
 * the website. » — mi-français, mi-anglais, observé en QA le 2026-08-03.
 *
 * La règle qui en sort, et qui vaut pour toutes les consignes de ce webhook:
 * une consigne de tour décrit une INTENTION, elle ne dicte pas une surface. Dès
 * qu'on écrit la phrase de sortie entre guillemets, on a codé en dur une langue
 * sans s'en apercevoir — et aucune revue ne le voit, parce que le fichier n'a
 * pas l'air de contenir de copy.
 *
 * La langue vient donc de `resolveResponseLocale` (source unique, R3) et le
 * bloc RESPONSE_LANGUAGE est appendu EN DERNIER, comme partout ailleurs: la
 * récence l'emporte chez les modèles, et ce dépôt a déjà payé l'oscillation de
 * langue entre deux tours.
 */
export async function handleStopOptOut(params) {
  if (!params.enabled || params.alreadyConfirmed) return true;

  const locale = resolveResponseLocale({
    persisted: params.profileLocale ?? null,
    tenantDefault: params.tenantLocale ?? null,
  });

  // Intention, pas surface. Aucune phrase entre guillemets: le modèle écrit la
  // sienne, dans la langue de l'élève. « Stable wording » n'est plus une
  // consigne de copy mais une contrainte de CONTENU — les assertions
  // mécaniques portent sur les trois faits ci-dessous, pas sur des mots.
  const contextOverride = [
    "=== WHATSAPP CONTEXT ===",
    "The student has just sent STOP. They are opting out of WhatsApp messages.",
    "",
    "TURN INSTRUCTION:",
    "- Confirm plainly that we will not message them on WhatsApp any more.",
    "- Say in one sentence that they can pick things back up from the website whenever they want.",
    "- Respect the decision. Do not argue, do not try to retain them, do not ask why.",
    "- Short message. No question.",
  ].join("\n");

  // AI everywhere: generate the STOP confirmation with the brain.
  await params.replyWithBrain({
    admin: params.admin,
    userId: params.userId,
    fromE164: params.fromE164,
    inboundText: "STOP",
    requestId: params.requestId,
    replyToWaMessageId: params.replyToWaMessageId ?? null,
    purpose: "optout_confirmation_ai",
    whatsappMode: "normal",
    forceMode: "companion",
    contextOverride: appendResponseLanguageBlock(contextOverride, locale),
  });
  await params.admin.from("profiles").update({
    whatsapp_optout_confirmed_at: params.nowIso
  }).eq("id", params.userId);
  return true;
}
