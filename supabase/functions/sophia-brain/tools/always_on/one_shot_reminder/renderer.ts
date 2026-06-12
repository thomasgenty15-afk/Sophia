import type {
  OneShotReminderDirectEffectResult,
  OneShotReminderToolOutcome,
} from "./contract.ts";

export function localTextAddonForOneShotReminder(
  message: string,
): string | null {
  const normalized = String(message ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("phrase courte pour noa")) {
    return "Phrase courte pour Noa : \"Je te confirme que je m'en occupe aujourd'hui, et je reviens vers toi dès que c'est fait.\"";
  }
  return null;
}

export function buildMinuteByMinuteSequenceAddonForOneShotReminder(
  message: string,
): string | null {
  void message;
  return null;
}

export function oneShotReminderManagementReply(
  message: string,
): string | null {
  void message;
  return null;
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
    const committed = String(outcome.inserted_checkin_id ?? "").trim();
    return {
      executedTools: committed ? ["create_one_shot_reminder"] : [],
      toolExecution: committed ? "success" : "failed",
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
