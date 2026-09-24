// ═══════════════════════════════════════════════════════════════════════════
// L'INTENTION « STATUS » : LIRE LES RAPPELS PONCTUELS, SANS RIEN ÉCRIRE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Le bloc est le texte d'origine, à l'indentation d'origine ; seules
// la signature, les lignes qui lisent l'état au début et celles qui le
// rendent à la fin sont nouvelles. Ce module n'importe jamais `router.ts`.
//
// La question de statut (et la question de vérification émise en `cancel`)
// lit les rappels en base et décrit ce qui est programmé. Rend `null` quand
// le tour n'est pas une question de statut.

import type { OneShotReminderDirectEffectResult } from "./contract.ts";
import type {
  OneShotReminderIntentState,
  OneShotReminderLaneArgs,
} from "./intent_state.ts";
import {
  readPendingOneShotReminderRows,
  readRecentOneShotReminderRows,
} from "./persistence.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import { isOneShotReminderVerificationQuestion } from "./text_signals.ts";
import {
  baseDirectEffectResult,
  formatOneShotLocalLabel,
  payloadText,
} from "./payload_compile.ts";

export async function runStatusIntent(
  args: OneShotReminderLaneArgs,
  st: Pick<
    OneShotReminderIntentState,
    "createEffect"
    | "now"
  >,
): Promise<OneShotReminderDirectEffectResult | null> {
  const { createEffect, now } = st;
  // R-1 (paul-triflow R1-B01, alex-multiflow B1 — BF-STATUS-01): question de
  // verification / liste / recap sur les rappels ponctuels. Le dispatcher
  // ORIENTE (intent='status'), le runtime LIT la verite DB, l'outcome DECRIT,
  // le composeur CONFIRME. Zero write. Sans cette lane, une question de
  // statut atteignait le composeur sans aucune projection et il niait des
  // rappels pourtant committes et pending.
  // P5-B (rose-hard17 T14-T15): une question de vérification émise en
  // intent=cancel par le dispatcher entre AUSSI dans cette lane de lecture —
  // jamais dans l'exécution du cancel (qui a détruit le rappel de la sœur via
  // le repli pending-unique, puis affirmé qu'il restait actif).
  const verificationQuestionOverridesCancel =
    payloadText(createEffect, "intent") === "cancel" &&
    isOneShotReminderVerificationQuestion(args.message);
  if (
    payloadText(createEffect, "intent") === "status" ||
    verificationQuestionOverridesCancel
  ) {
    try {
      const pendingRows = await readPendingOneShotReminderRows({
        supabase: args.supabase,
        userId: args.userId,
        limit: 12,
      });
      // Timezone: la verite profil (comme la lane cancel) — args.userTimezone
      // peut porter un fallback UTC selon le canal, ce qui ferait rendre des
      // heures UTC a l'utilisateur (round2 S1: « 05:30 » au lieu de 07:30).
      const tctx = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      const timezone = tctx.user_timezone?.trim() ||
        args.userTimezone?.trim() || "Europe/Paris";
      const lines = pendingRows.map((row) => {
        const payload = (row.message_payload ?? {}) as Record<string, unknown>;
        const instruction =
          String(payload.reminder_instruction ?? "").trim() ||
          "rappel ponctuel";
        return `${
          formatOneShotLocalLabel(String(row.scheduled_for ?? ""), timezone)
        } — ${instruction}`;
      });
      // P5-B: la vérité inclut les rappels RÉCENTS non-pending (48h) — une
      // vérification « t'es sûre que X est annulé ? » se répond depuis le
      // statut réel de X (cancelled/delivered), pas seulement la liste des
      // pending (qui faisait affirmer « actif » un rappel annulé, rose T15).
      let recentLines: string[] = [];
      try {
        const sinceIso = new Date(
          (now ?? new Date()).getTime() - 48 * 3_600_000,
        ).toISOString();
        const recentRows = await readRecentOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
          sinceIso,
        });
        recentLines = (recentRows as any[])
          .filter((row) => String(row?.status ?? "") !== "pending")
          .slice(0, 8)
          .map((row) => {
            const payload = (row?.message_payload ?? {}) as Record<
              string,
              unknown
            >;
            const instruction =
              String(payload.reminder_instruction ?? "").trim() ||
              "rappel ponctuel";
            const statusLabel = String(row?.status ?? "") === "cancelled"
              ? "annulé"
              : "déjà envoyé";
            return `${
              formatOneShotLocalLabel(
                String(row?.scheduled_for ?? ""),
                timezone,
              )
            } — ${instruction} (${statusLabel})`;
          });
      } catch (_error) {
        // Lecture best-effort: la projection pending reste la base.
      }
      const summary = (lines.length === 0
        ? "Aucun rappel ponctuel en attente en ce moment."
        : `Rappel(s) ponctuel(s) en attente (${lines.length}) : ${
          lines.join(" ; ")
        }.`) + (recentLines.length > 0
          ? ` Récents non-actifs : ${recentLines.join(" ; ")}.`
          : "");
      const reply = verificationQuestionOverridesCancel
        // Vérification: réponse neutre et factuelle (pas de « Oui — c'est
        // bien enregistré » quand la question porte sur une annulation).
        ? `Voilà l'état réel : en attente — ${
          lines.length > 0 ? lines.join(" ; ") : "aucun"
        }${
          recentLines.length > 0
            ? ` ; récents non-actifs — ${recentLines.join(" ; ")}`
            : ""
        }. Rien n'a été modifié.`
        : lines.length === 0
        ? "Tu n'as aucun rappel ponctuel en attente pour le moment."
        : lines.length === 1
        ? `Oui — c'est bien enregistré : ${lines[0]}.`
        : `Oui — tu as ${lines.length} rappels ponctuels en attente : ${
          lines.join(" ; ")
        }.`;
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "status",
          status: "success",
          reason_code: "status_report",
          reply,
        }),
        executed_tools: ["read_one_shot_reminder_status"],
        requested_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status",
        }],
        allowed_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status",
        }],
        committed_effects: [{
          type: "one_shot_reminder_status",
          // La verite lisible par le composeur voyage dans target_title
          // (outcomeTargetFromEffect) — donnees, pas regles.
          target_title: summary,
          pending_count: lines.length,
          pending_labels: lines,
        }],
      };
    } catch (_error) {
      // Lecture indisponible: on ne NIE JAMAIS sur une projection absente —
      // le composeur dit qu'il ne peut pas verifier la, jamais « aucun ».
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "status",
          status: "failed",
          reason_code: "status_read_failed",
          reply:
            "Je n'arrive pas à vérifier tes rappels là tout de suite — le plus sûr est de regarder dans l'app. (Ça ne veut pas dire qu'il n'y en a pas.)",
        }),
        requested_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status",
        }],
        blocked_effects: [{
          type: "one_shot_reminder_status",
          reason_code: "status_read_failed",
        }],
      };
    }
  }
  return null;
}
