// ═══════════════════════════════════════════════════════════════════════════
// LE RÉSULTAT D'UN RAPPEL PONCTUEL : LECTURE DU TURN FRAME ET ASSEMBLAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Aucune logique changée. `router.ts` ré-exporte tout ce qui est
// exporté ici : les appelants et les tests continuent d'importer depuis lui.
// Ce module n'importe jamais `router.ts`.
//
// Ce qui est ici : le résultat de base d'un effet direct et ses variantes
// (récurrent refusé, différé de crise), la lecture des champs du turn frame
// (`payload_hint`), la compilation du rappel à créer, le libellé local, et
// la fusion des résultats quand un message demande plusieurs rappels.

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectResult,
  OneShotReminderDirectEffectTool,
  OneShotReminderIntent,
  OneShotReminderToolOutcome,
} from "./contract.ts";
import { looksTemporalLabel } from "./text_signals.ts";

function baseDirectEffectResult(args: {
  detected: boolean;
  intent: OneShotReminderIntent;
  status: OneShotReminderDirectEffectResult["status"];
  reason_code: string;
  reply?: string | null;
}): OneShotReminderDirectEffectResult {
  return {
    detected: args.detected,
    intent: args.intent,
    status: args.status,
    reply: args.reply ?? null,
    requested_effects: [],
    allowed_effects: [],
    attempted_effects: [],
    executed_tools: [],
    committed_effects: [],
    blocked_effects: [],
    constraints: [],
    scheduled_for: null,
    local_label: null,
    reminder_instruction: null,
    target_reminder_ids: [],
    missing_slots: [],
    debug: { reason_code: args.reason_code },
  };
}

/**
 * Resultat canonique « demande recurrente, rien cree en ponctuel » — source
 * unique partagee entre le router du tool et l'intake du runtime (alex-r1
 * B02): la classification de cadence se consomme AVANT l'armement, sans
 * dependre du gate aval pour masquer une mauvaise selection.
 */
export function recurringNotSupportedDirectEffectResult(
  effectType: OneShotReminderDirectEffectTool = "create_one_shot_reminder",
): OneShotReminderDirectEffectResult {
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent: "create",
      status: "blocked",
      reason_code: "recurring_not_supported",
      reply:
        "Un rappel récurrent se règle dans les Initiatives — je n'ai rien créé en ponctuel.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    blocked_effects: [{
      type: effectType,
      reason_code: "recurring_not_supported",
    }],
  };
}

/**
 * P3-A (alex-safety-escalation R1-B01): résultat canonique « effet différé
 * pendant une crise safety » — la lane ne s'exécute JAMAIS sur un tour de
 * crise (active_safety_crisis / idéation), l'exception V5-1 ne valant que
 * pour la détresse medium non-crise. Le tour porte un outcome blocked avec
 * différé honnête au lieu d'un commit ou d'un silence.
 */
export function safetyCrisisDeferredDirectEffectResult(
  effectType: OneShotReminderDirectEffectTool = "create_one_shot_reminder",
): OneShotReminderDirectEffectResult {
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent: "create",
      status: "blocked",
      reason_code: "safety_crisis_deferred",
      reply:
        "Je le garde pour après — là, tout de suite, on reste sur toi. Je te le remets sur la table quand ça ira mieux.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    blocked_effects: [{
      type: effectType,
      reason_code: "safety_crisis_deferred",
    }],
  };
}

function uniqueToolsFromCommitted(
  committedEffects: OneShotReminderCommittedEffect[],
): OneShotReminderDirectEffectTool[] {
  return committedEffects
    .map((effect) => effect.type)
    .filter((tool, index, all) => all.indexOf(tool) === index);
}

function requestedEffect(
  type: OneShotReminderDirectEffectTool,
  reasonCode: string,
) {
  return { type, reason_code: reasonCode };
}

function committedCreateEffects(
  outcome: OneShotReminderToolOutcome,
): OneShotReminderCommittedEffect[] {
  if (!outcome.detected || outcome.status !== "success") return [];
  const id = String(outcome.inserted_checkin_id ?? "").trim();
  if (!id) return [];
  return [{
    type: "create_one_shot_reminder",
    id,
    scheduled_for: outcome.scheduled_for,
    local_label: outcome.scheduled_for_local_label,
    reminder_instruction: outcome.reminder_instruction,
  }];
}

function safetyFollowupForTurnFrame(
  turnFrame?: TurnFrame | null,
): string | null {
  const riskBand = String(turnFrame?.safety?.risk_band ?? "").toLowerCase();
  if (!["medium", "high", "critical"].includes(riskBand)) return null;
  return "D'ici là, reste avec ton soutien humain si tu l'as, et garde ce qui peut te blesser hors de portée.";
}

function hasActiveSafetyContext(turnFrame?: TurnFrame | null): boolean {
  return safetyFollowupForTurnFrame(turnFrame) !== null;
}

function createReminderSuccessReply(args: {
  localLabel: string;
  reminderInstruction?: string | null;
  turnFrame?: TurnFrame | null;
}): string {
  const instruction = String(args.reminderInstruction ?? "").trim();
  const base = hasActiveSafetyContext(args.turnFrame)
    ? `C'est programmé pour ${args.localLabel}: je te ferai le rappel demandé.`
    : instruction
    ? `C'est programmé pour ${args.localLabel}: je te ferai un rappel pour ${instruction}.`
    : `C'est programmé pour ${args.localLabel}.`;
  return [
    base,
    safetyFollowupForTurnFrame(args.turnFrame),
  ].filter(Boolean).join(" ");
}

function createEffectFromTurnFrame(
  turnFrame?: TurnFrame | null,
): TurnFrame["direct_effects"][number] | undefined {
  return (turnFrame?.direct_effects ?? []).find((candidate) =>
    candidate.effect_type === "create_one_shot_reminder"
  );
}

function payloadText(
  effect: TurnFrame["direct_effects"][number] | undefined,
  key: string,
): string | undefined {
  const hint = effect?.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? (effect.payload_hint as Record<string, unknown>)[key]
    : undefined;
  const text = typeof hint === "string" ? hint.trim() : "";
  return text || undefined;
}

function canonicalInstructionHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "instruction_hint");
}

function canonicalRawTextFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "raw_text");
}

function canonicalUtcTimeFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "UTC_time");
}

function canonicalWhenHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "when_hint");
}

function canonicalLocalLabelFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "local_label");
}

function isValidIsoDate(value: string | undefined): value is string {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

/** Label local lisible pour la lane status (fr, timezone user). */
function formatOneShotLocalLabel(
  scheduledForIso: string,
  timezone: string,
): string {
  const date = new Date(scheduledForIso);
  if (!Number.isFinite(date.getTime())) return "moment inconnu";
  try {
    const day = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date);
    const time = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    return `${day} à ${time}`;
  } catch (_error) {
    return scheduledForIso;
  }
}

function compileStructuredCreatePayload(args: {
  turnFrame?: TurnFrame | null;
  message: string;
}): {
  scheduledFor: string | null;
  localLabel: string | null;
  instruction: string | null;
  rawText: string;
  // P12-A: « local_parser » quand une couche P3-B a RÉPARÉ le temps — le
  // parse_source de l'outcome dit la vraie source (alex-untested24 R1-B01:
  // « payload_utc_time » mensonger sur une valeur réécrite par le parseur).
  parseSource: "payload_utc_time" | "payload" | "local_parser";
} {
  const whenHint = canonicalWhenHintFromTurnFrame(args.turnFrame);
  const utcTime = canonicalUtcTimeFromTurnFrame(args.turnFrame);
  const scheduledFor = isValidIsoDate(utcTime) ? utcTime : null;
  const instruction = canonicalInstructionHintFromTurnFrame(args.turnFrame) ??
    null;
  const rawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
    args.message;
  const localLabelHint = canonicalLocalLabelFromTurnFrame(args.turnFrame);
  const localLabel = looksTemporalLabel(localLabelHint)
    ? localLabelHint
    : looksTemporalLabel(whenHint)
    ? whenHint
    : null;
  return {
    scheduledFor,
    localLabel,
    instruction,
    rawText,
    parseSource: isValidIsoDate(utcTime) ? "payload_utc_time" : "payload",
  };
}

/**
 * P8-A (rose-p7verify R1 T13/T14, BF-LEDGER-02): agrégation des résultats
 * per-effet d'une co-demande de N rappels. Le rendu est ASSERVI au ledger —
 * chaque commit est nommé (label + instruction), et un volet NON committé est
 * annoncé manquant explicitement (default-deny symétrique), jamais « c'est
 * pris pour les deux » avec un seul commit. La comptabilité reste totale:
 * chaque effet du frame produit ses requested/committed/blocked, le surplus
 * au-delà de la borne est soldé blocked fan_out_bounded.
 */
export function mergeMultiCreateDirectEffectResults(args: {
  results: OneShotReminderDirectEffectResult[];
  overflow?: number;
}): OneShotReminderDirectEffectResult {
  // P12-A (nina-p10reval R1-B02) — INVARIANT: deux entrées committed ne
  // partagent JAMAIS un id. Quand l'exécuteur a résolu deux siblings sur la
  // MÊME ligne DB (idempotence/upsert sur instant identique), le second
  // n'est PAS un commit: il est rétrogradé en blocked
  // fan_out_duplicate_commit et son volet est annoncé manquant
  // nominativement (le rendu P8-A/P10-B fait le reste) — fin du « c'est
  // pris pour les deux » avec une seule ligne.
  const seenCommittedIds = new Set<string>();
  const results = args.results.map((result) => {
    const kept: typeof result.committed_effects = [];
    const demoted: typeof result.committed_effects = [];
    for (const effect of result.committed_effects) {
      const id = effect.type === "create_one_shot_reminder"
        ? String((effect as { id?: unknown }).id ?? "").trim()
        : "";
      if (id && seenCommittedIds.has(id)) {
        demoted.push(effect);
        continue;
      }
      if (id) seenCommittedIds.add(id);
      kept.push(effect);
    }
    if (demoted.length === 0) return result;
    const demotedLabel = String(
      (demoted[0] as { local_label?: unknown }).local_label ?? "",
    ).trim();
    return {
      ...result,
      committed_effects: kept,
      blocked_effects: [
        ...result.blocked_effects,
        ...demoted.map((effect) => ({
          type: effect.type,
          reason_code: "fan_out_duplicate_commit",
        })),
      ],
      status: kept.length > 0 ? result.status : "blocked" as const,
      reply: kept.length > 0 ? result.reply : `celui${
        demotedLabel ? ` de ${demotedLabel}` : "-là"
      } n'a PAS été posé séparément (il retombait sur le même rappel que l'autre volet). Redonne-moi son jour et son heure exacts si tu veux bien les deux.`,
    };
  });
  const overflow = Math.max(0, args.overflow ?? 0);
  const committed = results.flatMap((result) => result.committed_effects);
  const requested = [
    ...results.flatMap((result) => result.requested_effects),
    ...Array.from({ length: overflow }, () => ({
      type: "create_one_shot_reminder" as const,
      reason_code: "create",
    })),
  ];
  const blocked = [
    ...results.flatMap((result) => result.blocked_effects),
    ...Array.from({ length: overflow }, () => ({
      type: "create_one_shot_reminder" as const,
      reason_code: "fan_out_bounded",
    })),
  ];
  const allowed = results.flatMap((result) => result.allowed_effects);
  const attempted = [
    ...new Set(results.flatMap((result) => result.attempted_effects)),
  ];
  const executedTools = [
    ...new Set(results.flatMap((result) => result.executed_tools)),
  ];
  const constraints = [
    ...new Set(results.flatMap((result) => result.constraints)),
  ];
  const missingSlots = [
    ...new Set(results.flatMap((result) => result.missing_slots)),
  ];
  const pendingClarification = results
    .map((result) => result.pending_clarification)
    .find(Boolean) ?? null;
  const clarifyCount = results.filter(
    (result) => result.status === "needs_clarify",
  ).length;
  const status: OneShotReminderDirectEffectResult["status"] =
    committed.length > 0
      ? "success"
      : clarifyCount > 0
      ? "needs_clarify"
      : results.some((result) => result.status === "blocked")
      ? "blocked"
      : results.some((result) => result.status === "failed")
      ? "failed"
      : results[0]?.status ?? "ignored";
  const committedLines = committed
    .filter((effect) => effect.type === "create_one_shot_reminder")
    .map((effect) => {
      const instruction = String(effect.reminder_instruction ?? "").trim();
      const label = String(
        effect.local_label ?? effect.scheduled_for ?? "",
      ).trim();
      return instruction ? `${label} — « ${instruction} »` : label;
    })
    .filter(Boolean);
  // P10-B (nina-hard24 R1-B02, rose-p8reval T4): la reply d'un volet non
  // committé est NOMINATIVE — elle cite l'objet/créneau de SON item (« pour
  // celui de 2h du mat' : ... ») au lieu d'un « je ne peux pas te le
  // confirmer ici » vague sans récupération. Les slots viennent du
  // pending_clarification du sibling (source structurée, jamais le texte).
  const nonCommitReplies = results
    .filter((result) =>
      result.committed_effects.filter((effect) =>
        effect.type === "create_one_shot_reminder"
      ).length === 0 && result.reply
    )
    .map((result) => {
      const reply = String(result.reply);
      const slots = result.pending_clarification?.known_slots as
        | Record<string, unknown>
        | null
        | undefined;
      const itemName = String(
        slots?.instruction_hint ?? slots?.when_hint ?? "",
      ).trim();
      return itemName && !reply.toLowerCase().includes(itemName.toLowerCase())
        ? `Pour celui de « ${itemName} » : ${reply}`
        : reply;
    });
  const replyParts: string[] = [];
  if (committedLines.length > 1) {
    replyParts.push(
      `C'est fait, tes ${committedLines.length} rappels sont posés : ${
        committedLines.join(" ; ")
      }.`,
    );
  } else if (committedLines.length === 1) {
    replyParts.push(`C'est fait pour ${committedLines[0]}.`);
  }
  if (nonCommitReplies.length > 0) {
    replyParts.push(
      committedLines.length > 0
        ? `Par contre, l'autre rappel n'est PAS posé pour l'instant — ${
          nonCommitReplies[0]
        }`
        : clarifyCount > 1
        ? `Pour tes ${results.length} rappels, il me manque encore le créneau exact de chacun — donne-les-moi et je les pose d'un coup. ${
          nonCommitReplies[0]
        }`
        : nonCommitReplies[0],
    );
  }
  const firstCommittedResult = results.find((result) =>
    result.committed_effects.some((effect) =>
      effect.type === "create_one_shot_reminder"
    )
  );
  return {
    detected: true,
    intent: "create",
    status,
    reply: replyParts.join(" ") || null,
    requested_effects: requested,
    allowed_effects: allowed,
    attempted_effects: attempted,
    executed_tools: executedTools,
    committed_effects: committed,
    blocked_effects: blocked,
    constraints,
    scheduled_for: firstCommittedResult?.scheduled_for ?? null,
    local_label: firstCommittedResult?.local_label ?? null,
    reminder_instruction: firstCommittedResult?.reminder_instruction ?? null,
    target_reminder_ids: results.flatMap((result) =>
      result.target_reminder_ids
    ),
    missing_slots: missingSlots,
    pending_clarification: pendingClarification,
    debug: { reason_code: "multi_create" },
  };
}

// Exportés pour `router.ts` seulement (ils n'étaient pas exportés quand ils
// vivaient dans `router.ts`) ; `router.ts` ne les ré-exporte pas.
export {
  baseDirectEffectResult,
  canonicalInstructionHintFromTurnFrame,
  canonicalRawTextFromTurnFrame,
  canonicalWhenHintFromTurnFrame,
  committedCreateEffects,
  compileStructuredCreatePayload,
  createEffectFromTurnFrame,
  createReminderSuccessReply,
  formatOneShotLocalLabel,
  isValidIsoDate,
  payloadText,
  uniqueToolsFromCommitted,
};
