// ═══════════════════════════════════════════════════════════════════════════
// L'INTENTION « CANCEL » : ANNULER UN RAPPEL PONCTUEL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Le bloc est le texte d'origine, à l'indentation d'origine ; seules
// la signature, les lignes qui lisent l'état au début et celles qui le
// rendent à la fin sont nouvelles. Ce module n'importe jamais `router.ts`.
//
// Rend `null` quand le tour n'est pas une annulation (ou quand le cancel
// porte un rappel complet à créer : `cancelCarriesFullCreatePayload`).

import type { OneShotReminderDirectEffectResult } from "./contract.ts";
import type {
  OneShotReminderIntentState,
  OneShotReminderLaneArgs,
} from "./intent_state.ts";
import { maybeCancelOneShotReminder } from "./executor.ts";
import { readPendingOneShotReminderRows } from "./persistence.ts";
import {
  baseDirectEffectResult,
  payloadText,
} from "./payload_compile.ts";

export async function runCancelIntent(
  args: OneShotReminderLaneArgs,
  st: Pick<
    OneShotReminderIntentState,
    "createEffect"
    | "cancelCarriesFullCreatePayload"
    | "now"
  >,
): Promise<OneShotReminderDirectEffectResult | null> {
  const { createEffect, cancelCarriesFullCreatePayload, now } = st;
  // Intention cancel (F4, paul-broadflow15 T14): une demande d'annulation ne
  // touche JAMAIS le chemin create — garde structurelle meme si le LLM se
  // trompe ailleurs. Le payload porte intent="cancel" (contrat dispatcher);
  // l'executor cible le pending par heure locale, et l'ambiguite clarifie au
  // lieu de deviner.
  if (
    payloadText(createEffect, "intent") === "cancel" &&
    !cancelCarriesFullCreatePayload
  ) {
    const cancelRunner = args.cancelReminder ?? maybeCancelOneShotReminder;
    const cancelOutcome = await cancelRunner({
      supabase: args.supabase,
      userId: args.userId,
      message: args.message,
      requestId: args.requestId,
      now,
    });
    if (cancelOutcome.detected && cancelOutcome.status === "cancelled") {
      const label = cancelOutcome.cancelled_local_labels[0] ?? "";
      // P9-B (alex-hard24 R1-B03): un cancel de MASSE rend l'inventaire
      // complet — les N annulés énumérés + le restant relu en DB (recap
      // post-opération dérivé de l'inventaire réel, jamais de « je n'annule
      // pas le reste » sur une demande de masse exécutée).
      const isMassCancel = cancelOutcome.mass_scope === true ||
        (cancelOutcome.cancelled_ids ?? []).length > 1;
      let massReply: string | null = null;
      if (isMassCancel) {
        const cancelledList = cancelOutcome.cancelled_local_labels
          .filter(Boolean).join(" ; ");
        let remainingLine = "";
        try {
          const remainingRows = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          remainingLine = remainingRows.length === 0
            ? " Il ne te reste aucun rappel ponctuel en attente."
            : ` Il te reste ${remainingRows.length} rappel(s) en attente.`;
        } catch (_error) {
          // Lecture best-effort: sans projection, pas de ligne de restant.
        }
        massReply = `C'est annulé pour tes ${cancelOutcome.cancelled_count} rappels${
          cancelledList ? ` (${cancelledList})` : ""
        } : aucun ne partira.${remainingLine}`;
      }
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "success",
          reason_code: "cancelled",
          reply: massReply ?? (label
            ? `C'est annulé : le rappel de ${label} ne partira pas.`
            : "C'est annulé : ce rappel ne partira pas."),
        }),
        executed_tools: ["cancel_one_shot_reminder"],
        // P12-C (paul-p9reval R1-B01): cardinalité du ledger = cardinalité
        // DB — une entrée requested/committed PAR rappel annulé (extension
        // du contrat P7-B « N commits ⇒ N annoncés » au cancel de masse).
        // L'entrée agrégée unique privait le composeur de la liste et le
        // rendu sortait un pluriel vague.
        requested_effects: (cancelOutcome.cancelled_ids ?? [label || "x"])
          .map(() => ({
            type: "cancel_one_shot_reminder" as const,
            reason_code: "cancel",
          })),
        allowed_effects: (cancelOutcome.cancelled_ids ?? [label || "x"])
          .map(() => ({
            type: "cancel_one_shot_reminder" as const,
            reason_code: "cancel",
          })),
        committed_effects: (cancelOutcome.cancelled_ids ?? []).length > 0
          ? (cancelOutcome.cancelled_ids ?? []).map((cancelledId, index) => ({
            type: "cancel_one_shot_reminder" as const,
            id: cancelledId,
            ids: [cancelledId],
            local_label: cancelOutcome.cancelled_local_labels?.[index] ??
              (index === 0 ? label || undefined : undefined),
          }))
          : [{
            type: "cancel_one_shot_reminder" as const,
            ids: [],
            local_label: label || undefined,
          }],
      };
    }
    if (cancelOutcome.detected && cancelOutcome.status === "ambiguous_target") {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "needs_clarify",
          reason_code: "cancel_target_ambiguous",
          reply:
            `Tu as ${cancelOutcome.pending_count} rappels en attente — tu veux annuler lequel ? Donne-moi son heure.`,
        }),
        requested_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: "cancel",
        }],
        blocked_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: "cancel_target_ambiguous",
        }],
      };
    }
    if (cancelOutcome.detected && cancelOutcome.status === "no_reminder") {
      // eva-r6 B03: la reponse distingue « jamais existe » de « deja
      // envoye/annule » — nier l'existence d'un rappel reel (fire il y a
      // 5 min) etait un faux statut.
      const absence = cancelOutcome.absence_reason ?? "never_existed";
      const label = String(cancelOutcome.non_pending_local_label ?? "").trim();
      const reasonCode = absence === "already_delivered"
        ? "cancel_already_delivered"
        : absence === "already_cancelled"
        ? "cancel_already_cancelled"
        : "no_pending_reminder";
      const reply = absence === "already_delivered"
        ? `Ton rappel${
          label ? ` de ${label}` : ""
        } a déjà été envoyé — il n'est plus en attente, donc rien à annuler.`
        : absence === "already_cancelled"
        ? `Ce rappel${label ? ` de ${label}` : ""} était déjà annulé.`
        : "Je ne trouve aucun rappel en attente qui corresponde — rien à annuler.";
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "cancel",
          status: "blocked",
          reason_code: reasonCode,
          reply,
        }),
        requested_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: "cancel",
        }],
        blocked_effects: [{
          type: "cancel_one_shot_reminder",
          reason_code: reasonCode,
        }],
      };
    }
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "cancel",
        status: "failed",
        reason_code: "cancel_failed",
        reply: "Je n'ai pas réussi à annuler ce rappel.",
      }),
      requested_effects: [{
        type: "cancel_one_shot_reminder",
        reason_code: "cancel",
      }],
      blocked_effects: [{
        type: "cancel_one_shot_reminder",
        reason_code: "cancel_failed",
      }],
    };
  }
  return null;
}
