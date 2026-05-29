import type {
  OneShotReminderDirectEffectResult,
  OneShotReminderToolOutcome,
} from "./contract.ts";
import { normalizeOneShotReminderText } from "./route_guards.ts";

export function localTextAddonForOneShotReminder(
  message: string,
): string | null {
  const text = normalizeOneShotReminderText(message);
  if (!/\b(rappel|rappelle|rappeler|programme|programmer)\b/.test(text)) {
    return null;
  }
  if (!/\b(phrase|message|texte|formule)\b/.test(text)) return null;
  const asksShortPhrase =
    /\b(phrase courte|message court|texte court|formule le|formule moi)\b/
      .test(text);
  if (!asksShortPhrase) return null;
  const name = String(message ?? "").match(
    /\bpour\s+([A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' -]{0,40})/i,
  )?.[1]?.trim().replace(/[,.!?;:]+$/g, "") ?? "";
  const target = name ? ` pour ${name}` : "";
  return `Phrase courte${target} : "Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait."`;
}

export function buildMinuteByMinuteSequenceAddonForOneShotReminder(
  message: string,
): string | null {
  const text = normalizeOneShotReminderText(message);
  if (
    !(
      /\b(sequence|minute par minute|\d+\s*minutes?)\b/.test(text) &&
      /\b(mails?|facture|traiter|faire|etapes?)\b/.test(text)
    )
  ) {
    return null;
  }
  return [
    "Séquence 10 minutes pour traiter les deux mails :",
    "1:00 — Ouvre les 2 mails (sans tout lire).",
    "2:00 — 1er mail : objet + demande concrète.",
    "3:00 — 1er mail : note l'action précise à faire.",
    "4:00 — 1er mail : brouillon de réponse.",
    "5:00 — 1er mail : relis 30 s et envoie.",
    "6:00 — 2e mail : objet + demande concrète.",
    "7:00 — 2e mail : note l'action et ce qu'il faut inclure.",
    "8:00 — 2e mail : brouillon de réponse.",
    "9:00 — 2e mail : relis et envoie.",
    "10:00 — Check : facture débloquée ? Note la prochaine mini-étape.",
  ].join("\n");
}

export function oneShotReminderManagementReply(
  message: string,
): string | null {
  const text = normalizeOneShotReminderText(message);
  const asksAboutReminder =
    /\b(rappel ponctuel|rappel de demain|rappel programme|rappel programmé|ce rappel)\b/
      .test(text);
  const pronominalRecentReminderQuestion =
    /\bdemain\b[\s\S]{0,100}\ble\b[\s\S]{0,80}\b(change|changer|annule|annuler|modifie|modifier|supprime|supprimer)\b/
      .test(text) ||
    /\ble\b[\s\S]{0,80}\b(change|changer|annule|annuler|modifie|modifier|supprime|supprimer)\b[\s\S]{0,100}\b(ici|app|application|interface|initiatives)\b/
      .test(text);
  const asksWhereOrChange =
    /\b(annule|annuler|change|changer|modifie|modifier|retrouve|retrouver|ou|où|initiatives|interface)\b/
      .test(text);
  if (
    !(asksAboutReminder || pronominalRecentReminderQuestion) ||
    !asksWhereOrChange
  ) {
    return null;
  }
  return [
    "Un rappel ponctuel se gère côté Initiatives, dans les rappels côté chat pour ce type-là.",
    "",
    'Pour le modifier ou l\'annuler, le plus fiable est de me le redire ici clairement, par exemple : "change le rappel de demain à 09:00" ou "annule le rappel de demain".',
  ].join("\n");
}

export function renderOneShotReminderReply(params: {
  result: OneShotReminderDirectEffectResult;
  message?: string;
}): string | null {
  const base = params.result.reply;
  if (!base) return null;
  if (params.result.status !== "success") return base;
  if (!params.message) return base;
  return [
    base,
    localTextAddonForOneShotReminder(params.message),
    buildMinuteByMinuteSequenceAddonForOneShotReminder(params.message),
  ].filter(Boolean).join("\n\n");
}

export function buildOneShotReminderAddon(
  outcome: OneShotReminderToolOutcome,
): string {
  if (!outcome.detected) return "";

  if (outcome.status === "success") {
    return [
      "",
      "=== ADDON ONE-SHOT REMINDER TOOL ===",
      "- Le reminder tool a deja reussi.",
      `- Confirmation DB: scheduled_checkin_id=${
        outcome.inserted_checkin_id || "ok"
      }.`,
      `- Heure locale programmee: ${outcome.scheduled_for_local_label}.`,
      `- Objet du rappel: ${outcome.reminder_instruction}.`,
      `- Parse source: ${outcome.parse_source ?? "unknown"}.`,
      "- Tu peux confirmer clairement que le rappel est programme.",
      "- Ne demande pas au user de confirmer le fuseau ou la ville apres succes: la DB est deja programmee. Si utile, mentionne simplement l'heure locale programmee.",
      "- IMPORTANT: confirme seulement la programmation en base / dans le systeme. Ne promets rien de plus que ce succes confirme.",
      "- Si le message user contenait un autre sujet, reponds aussi a ce sujet.",
      "",
    ].join("\n");
  }

  if (outcome.status === "needs_clarify") {
    return [
      "",
      "=== ADDON ONE-SHOT REMINDER TOOL ===",
      "- Le user demande bien un rappel ponctuel, mais l'horaire exact n'a pas pu etre resolu de facon fiable.",
      `- Raison: ${outcome.reason}.`,
      "- N'annonce PAS que le rappel est programme.",
      "- Demande une seule precision courte sur l'heure / le moment exact.",
      "",
    ].join("\n");
  }

  return [
    "",
    "=== ADDON ONE-SHOT REMINDER TOOL ===",
    "- Une tentative de programmation de rappel ponctuel a echoue.",
    `- Erreur technique: ${outcome.error_message}.`,
    "- N'annonce PAS que le rappel est programme.",
    "- Dis simplement qu'il y a eu un souci technique pour le programmer maintenant.",
    "",
  ].join("\n");
}

export function summarizeOneShotReminderOutcome(
  outcome: OneShotReminderToolOutcome,
): {
  executedTools: string[];
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
} {
  if (!outcome.detected) return { executedTools: [], toolExecution: "none" };
  if (outcome.status === "success") {
    return {
      executedTools: ["create_one_shot_reminder"],
      toolExecution: "success",
    };
  }
  if (outcome.status === "needs_clarify") {
    return { executedTools: [], toolExecution: "blocked" };
  }
  return {
    executedTools: [],
    toolExecution: "failed",
  };
}
