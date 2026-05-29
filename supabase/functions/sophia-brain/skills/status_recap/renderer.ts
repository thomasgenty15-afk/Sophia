import {
  coachPreferenceStatusLabel,
  SUPPORTED_COACH_PREFERENCE_KEYS,
} from "../../tools/operations/update_coach_preferences/status.ts";
import type {
  StatusRecapDecision,
  StatusRecapDecisionDraft,
  StatusRecapProjection,
} from "./contract.ts";
import { buildRecentEffectHistoryRecapLines } from "./effect_history.ts";

function knownExplicitCoachPreferences(projection: StatusRecapProjection) {
  return projection.coach_preferences.filter((pref) =>
    (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(pref.key) &&
    pref.source_type !== "system_default"
  );
}

function knownDefaultCoachPreferences(projection: StatusRecapProjection) {
  return projection.coach_preferences.filter((pref) =>
    (SUPPORTED_COACH_PREFERENCE_KEYS as readonly string[]).includes(pref.key) &&
    pref.source_type === "system_default"
  );
}

function reminderLabel(reminder: {
  local_time: string | null;
  instruction: string;
}): string {
  return `${
    reminder.local_time ? `${reminder.local_time} ` : ""
  }${reminder.instruction}`.trim();
}

function projectionHasAnySource(projection: StatusRecapProjection): boolean {
  return projection.attack_cards.length > 0 ||
    projection.defense_cards.length > 0 ||
    projection.one_shot_reminders.pending.length > 0 ||
    projection.one_shot_reminders.cancelled_recent.length > 0 ||
    projection.recurring_reminders.length > 0 ||
    projection.potion_sessions.length > 0 ||
    projection.coach_preferences.length > 0 ||
    projection.recent_effect_history.length > 0;
}

function renderNoSource(): string {
  return "Sans rien modifier : je n'en vois pas en place avec les sources DB disponibles ; je ne vois pas assez de source DB disponible pour affirmer qu'un objet existe.";
}

function renderCoachPreferences(projection: StatusRecapProjection): string {
  const explicitPrefs = knownExplicitCoachPreferences(projection);
  const defaultPrefs = knownDefaultCoachPreferences(projection);
  if (!explicitPrefs.length) {
    return defaultPrefs.length
      ? "Préférences coach : je ne vois pas de choix utilisateur explicite enregistré ; seuls les réglages par défaut système sont actifs."
      : "Préférences coach : je ne vois pas de préférence coach explicite enregistrée.";
  }
  const labels = explicitPrefs
    .map((pref) => coachPreferenceStatusLabel(pref))
    .filter((label): label is string => Boolean(label));
  return `Préférences coach : ${labels.join(", ")}${
    defaultPrefs.length
      ? " (les autres réglages restent sur la valeur par défaut système)"
      : ""
  }.`;
}

function renderReminders(projection: StatusRecapProjection): string {
  const pending = projection.one_shot_reminders.pending;
  const cancelled = projection.one_shot_reminders.cancelled_recent;
  if (!pending.length) {
    if (cancelled.length) {
      return `Rappels ponctuels : aucun actif ; dernier rappel ${
        reminderLabel(cancelled[0])
      } créé puis annulé, pas actif.`;
    }
    return "Rappels ponctuels : aucun actif visible dans la projection DB.";
  }
  if (pending.length === 1) {
    return `Rappels ponctuels : actif, ${reminderLabel(pending[0])}.`;
  }
  return `Rappels ponctuels : oui, j'en vois ${pending.length} en place : ${
    pending.map(reminderLabel).join(" ; ")
  }.`;
}

function renderRecurring(projection: StatusRecapProjection): string | null {
  const active = projection.recurring_reminders.filter((row) =>
    row.status === "active"
  );
  if (!active.length) return null;
  return `Rappels récurrents : ${
    active.map((row) =>
      [row.cadence_label, row.instruction].filter(Boolean).join(" - ")
    ).join(" ; ")
  }.`;
}

function renderCompact(projection: StatusRecapProjection): string {
  if (!projectionHasAnySource(projection)) return renderNoSource();
  const explicitPrefs = knownExplicitCoachPreferences(projection);
  const lines = [
    "Sans rien modifier :",
    `- Carte d'attaque : ${
      projection.attack_cards[0]
        ? `en place (${projection.attack_cards[0].title}).`
        : "aucune active visible dans la projection DB."
    }`,
    `- Carte de défense : ${
      projection.defense_cards[0]
        ? `en place (${projection.defense_cards[0].title}).`
        : "aucune active visible dans la projection DB."
    }`,
    `- ${renderReminders(projection)}`,
    `- ${renderCoachPreferences(projection)}`,
  ];
  const recurring = renderRecurring(projection);
  if (recurring) lines.push(`- ${recurring}`);
  if (projection.potion_sessions.length) {
    lines.push(
      `- Potions : ${
        projection.potion_sessions.map((row) =>
          `${row.potion_type} (${row.status})`
        ).join(" ; ")
      }.`,
    );
  }
  lines.push(
    ...buildRecentEffectHistoryRecapLines(projection.recent_effect_history),
  );
  if (!explicitPrefs.length && projection.coach_preferences.length) {
    lines.push(
      "- Note : les defaults système ne sont pas des choix utilisateur.",
    );
  }
  return lines.join("\n");
}

function renderCancelled(projection: StatusRecapProjection): string {
  const cancelled = projection.one_shot_reminders.cancelled_recent;
  const pending = projection.one_shot_reminders.pending;
  if (!cancelled.length && !pending.length) return renderNoSource();
  if (!cancelled.length) {
    return `Je vois ${
      pending.length === 1
        ? "un rappel actif"
        : `${pending.length} rappels actifs`
    } : ${pending.map(reminderLabel).join(" ; ")}.`;
  }
  const cancelledLine = cancelled.map((row) =>
    `${reminderLabel(row)} (créé puis annulé, pas actif)`
  ).join(" ; ");
  const pendingLine = pending.length
    ? ` Actifs encore présents : ${pending.map(reminderLabel).join(" ; ")}.`
    : " aucun actif visible côté DB.";
  return `Rappels annulés récemment : ${cancelledLine}.${pendingLine}`;
}

function renderFaitPrevuFragile(projection: StatusRecapProjection): string {
  const explicitPrefs = knownExplicitCoachPreferences(projection);
  const faitParts = [
    ...projection.attack_cards.slice(0, 1).map((row) =>
      `carte d'attaque "${row.title}"`
    ),
    ...projection.defense_cards.slice(0, 1).map((row) =>
      `carte de défense "${row.title}"`
    ),
    explicitPrefs.length
      ? `${explicitPrefs.length} préférence(s) coach explicite(s)`
      : null,
  ].filter((part): part is string => Boolean(part));
  const prevuParts = [
    ...projection.one_shot_reminders.pending.map(reminderLabel),
    ...projection.recurring_reminders.filter((row) => row.status === "active")
      .map((row) =>
        [row.cadence_label, row.instruction].filter(Boolean).join(" - ")
      ),
  ].filter(Boolean);
  return [
    `Fait : ${
      faitParts.length
        ? `${faitParts.join(", ")}.`
        : "aucun objet durable explicite visible dans la projection DB."
    }`,
    `Prévu : ${
      prevuParts.length
        ? `${prevuParts.join(" ; ")}.`
        : "aucun rappel actif visible dans la projection DB."
    }`,
    "Fragile : repère de conversation seulement, pas une écriture durable.",
  ].join("\n");
}

function renderObjectAnswer(
  decision: StatusRecapDecisionDraft,
  projection: StatusRecapProjection,
): string {
  if (decision.target_objects.includes("coach_preference")) {
    return renderCoachPreferences(projection);
  }
  if (
    decision.target_objects.includes("one_shot_reminder") ||
    decision.target_objects.includes("recurring_reminder")
  ) {
    return [
      renderReminders(projection),
      renderRecurring(projection),
    ].filter(Boolean).join("\n");
  }
  return renderCompact(projection);
}

export function renderStatusRecapDecision(args: {
  decision: StatusRecapDecisionDraft;
  projection: StatusRecapProjection;
}): StatusRecapDecision {
  const reply = args.decision.intent === "fait_prevu_fragile"
    ? renderFaitPrevuFragile(args.projection)
    : args.decision.intent === "coach_preferences_status"
    ? renderCoachPreferences(args.projection)
    : args.decision.intent === "cancelled_objects"
    ? renderCancelled(args.projection)
    : args.decision.intent === "object_status"
    ? renderObjectAnswer(args.decision, args.projection)
    : args.decision.intent === "recent_effects_recap"
    ? renderCompact(args.projection)
    : args.decision.intent === "durable_status"
    ? renderCompact(args.projection)
    : "";
  return { ...args.decision, reply };
}
