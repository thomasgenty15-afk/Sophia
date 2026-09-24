// ═══════════════════════════════════════════════════════════════════════════
// L'INTENTION « REPLACE » : ANNULER UN RAPPEL ET EN POSER UN AUTRE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Le bloc est le texte d'origine, à l'indentation d'origine ; seules
// la signature, les lignes qui lisent l'état au début et celles qui le
// rendent à la fin sont nouvelles. Ce module n'importe jamais `router.ts`.
//
// Rend un résultat quand le remplacement se conclut ici. Rend `null` quand
// il continue vers la création (annulation faite, ou rien à annuler) : il
// a alors recopié dans `st` ses six valeurs (`createEffect`,
// `compiledPayload`, `allowDuplicateForTurn` et les trois `replaceCancel*`),
// que `router.ts` reprend avant l'intention « create ».

import type { OneShotReminderDirectEffectResult } from "./contract.ts";
import type {
  OneShotReminderIntentState,
  OneShotReminderLaneArgs,
} from "./intent_state.ts";
import {
  daypartWindowFromReference,
  isReminderEntityReference,
  isReminderInstructionInvarianceAnaphora,
} from "./instruction_parser.ts";
import { maybeCancelOneShotReminder } from "./executor.ts";
import {
  readPendingOneShotReminderRows,
  readRecentOneShotReminderRows,
} from "./persistence.ts";
import {
  extractTargetHHMMFromMessage,
  hasAnyExplicitDayToken,
  localHHMMForScheduledFor,
} from "./time_parser.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import {
  entityAnchoredDayToken,
  instructionTokensOverlap,
  localWeekdayName,
  messageContentOverlapScore,
  oneShotInstructionTokens,
} from "./text_signals.ts";
import {
  baseDirectEffectResult,
  formatOneShotLocalLabel,
  payloadText,
} from "./payload_compile.ts";

export async function runReplaceIntent(
  args: OneShotReminderLaneArgs,
  st: Pick<
    OneShotReminderIntentState,
    "createEffect"
    | "compiledPayload"
    | "allowDuplicateForTurn"
    | "replaceCancelCommitted"
    | "replaceCancelledLabel"
    | "replaceCancelForbidden"
    | "now"
    | "additiveMarker"
    | "effectType"
  >,
): Promise<OneShotReminderDirectEffectResult | null> {
  let {
    createEffect,
    compiledPayload,
    allowDuplicateForTurn,
    replaceCancelCommitted,
    replaceCancelledLabel,
    replaceCancelForbidden,
  } = st;
  const { now, additiveMarker, effectType } = st;
  if (payloadText(createEffect, "intent") === "replace") {
    // P3-F (nina-global18 T12): HÉRITAGE D'INSTRUCTION — « annule X et
    // recrée-le à H, même texte » arrivait avec une instruction absente ou
    // une expression de référence (« le rappel de l'eau »). AVANT toute
    // mutation (l'atomicité l'exige), l'instruction manquante s'hérite du
    // pending ciblé (même résolution d'ancre que l'héritage de jour P2-3a).
    // P6-A (nina-untested21 R1-B01): une ANAPHORE D'INVARIANCE (« même
    // chose », « pareil », « idem ») compte comme instruction ABSENTE — la
    // prendre littéralement délivrait un rappel « à propos de: même chose ».
    // P10-E (alex-hard24 R1-B02, nina-hard24 R1-B03): une RÉFÉRENCE D'ENTITÉ
    // (« celui du midi », « le rappel des en-cas ») vaut instruction ABSENTE
    // — jamais un contenu durable. Elle porte en revanche un éventuel
    // CRÉNEAU NOMINAL qui aide à résoudre la cible.
    const instructionIsEntityReference = isReminderEntityReference(
      compiledPayload.instruction,
    );
    // P12-D7 (alex-untested24 R1-B07): candidats de MÊME contenu quand ≥2 —
    // portés hors du try pour rendre la clarify nominative (avec les HEURES).
    let replaceSameContentCandidates:
      | Array<{ instruction: string; hhmm: string | null }>
      | null = null;
    if (
      !compiledPayload.instruction ||
      isReminderInstructionInvarianceAnaphora(compiledPayload.instruction) ||
      instructionIsEntityReference
    ) {
      try {
        const tctxInherit = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezone = tctxInherit.user_timezone || "Europe/Paris";
        const pendings = await readPendingOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
        });
        const targetHHMM = extractTargetHHMMFromMessage(
          payloadText(createEffect, "replace_target_label") ?? "",
        );
        // P10-E: résolution par créneau nominal — « celui du midi » avec
        // plusieurs pendings cible l'UNIQUE pending de la fenêtre 11-15h
        // (jamais un choix au hasard: 0 ou ≥2 candidats = pas de cible).
        const daypart = instructionIsEntityReference
          ? daypartWindowFromReference(compiledPayload.instruction)
          : null;
        const daypartRows = daypart
          ? pendings.filter((row) => {
            const hhmm = localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezone,
            );
            const hour = Number(String(hhmm ?? "").split(":")[0]);
            return Number.isFinite(hour) && hour >= daypart.startHour &&
              hour < daypart.endHour;
          })
          : [];
        // P12-D7 (alex-untested24 R1-B07, principe P5-E): cible par ÉVIDENCE
        // NOMMÉE — le contenu discriminant (référence d'entité « le rappel
        // des courses » ou message) résout la cible SANS exiger son heure
        // actuelle: un unique pending recouvert = cible. Condition de
        // désarmement: ≥2 pendings de même contenu ⇒ clarify nominative avec
        // leurs heures (jamais une consigne circulaire), jamais un choix.
        const contentSource = `${compiledPayload.instruction ?? ""} ${
          args.message
        }`;
        const contentMatches = pendings
          .map((row) => ({
            row,
            score: messageContentOverlapScore(
              contentSource,
              String(
                (row?.message_payload as Record<string, unknown> | undefined)
                  ?.reminder_instruction ?? "",
              ),
            ),
          }))
          .filter((entry) => entry.score > 0);
        const targetRow = targetHHMM
          ? pendings.find((row) =>
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezone,
            ) === targetHHMM
          )
          : daypartRows.length === 1
          ? daypartRows[0]
          : contentMatches.length === 1
          ? contentMatches[0].row
          : pendings.length === 1
          ? pendings[0]
          : null;
        if (!targetRow && contentMatches.length >= 2) {
          replaceSameContentCandidates = contentMatches.map((entry) => ({
            instruction: String(
              (entry.row?.message_payload as
                | Record<string, unknown>
                | undefined)?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel",
            hhmm: localHHMMForScheduledFor(
              String(entry.row?.scheduled_for ?? ""),
              timezone,
            ),
          }));
        }
        // P12-D4 (nina-p10reval R1-B03a): l'entité porte un JOUR NOMMÉ qui
        // ne matche PAS le jour de la cible résolue ⇒ l'instruction s'hérite
        // (même série) mais le CANCEL est interdit — create pur, le pending
        // de l'autre jour reste intact. Condition de désarmement: jour de la
        // cible = jour nommé ⇒ replace historique.
        const replaceEntityDay = entityAnchoredDayToken(
          `${compiledPayload.instruction ?? ""} ${args.message}`,
        );
        let entityDayProtects = false;
        if (replaceEntityDay && targetRow) {
          const civilOf = (iso: string) => {
            try {
              return new Intl.DateTimeFormat("fr-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(iso));
            } catch (_error) {
              return "";
            }
          };
          const targetIso = String(targetRow?.scheduled_for ?? "");
          const dayMatches =
            replaceEntityDay === "demain" ||
              replaceEntityDay.startsWith("apres")
              ? civilOf(targetIso) === civilOf(
                new Date(
                  new Date(tctxInherit.now_utc).getTime() +
                    (replaceEntityDay === "demain" ? 1 : 2) * 86_400_000,
                ).toISOString(),
              )
              : localWeekdayName(targetIso, timezone) === replaceEntityDay;
          if (!dayMatches) {
            entityDayProtects = true;
            replaceCancelForbidden = true;
            allowDuplicateForTurn = true;
          }
        }
        const inheritedInstruction = String(
          (targetRow?.message_payload as Record<string, unknown> | undefined)
            ?.reminder_instruction ?? "",
        ).trim();
        if (inheritedInstruction) {
          compiledPayload = {
            ...compiledPayload,
            instruction: inheritedInstruction,
          };
          // P10-E: la cible résolue par créneau nominal devient l'ancre du
          // cancel du replace (sans elle, le cancel ne sait pas qui viser
          // et l'original survivrait à côté du nouveau — le doublon d'alex).
          // P12-D4: jamais d'ancre quand le jour nommé protège la cible.
          if (!targetHHMM && targetRow && !entityDayProtects) {
            const resolvedHHMM = localHHMMForScheduledFor(
              String(targetRow?.scheduled_for ?? ""),
              timezone,
            );
            if (resolvedHHMM) {
              createEffect = {
                ...createEffect!,
                payload_hint: {
                  ...((createEffect!.payload_hint ?? {}) as Record<
                    string,
                    unknown
                  >),
                  replace_target_label: resolvedHHMM,
                },
              };
            }
          }
        } else if (
          isReminderInstructionInvarianceAnaphora(
            compiledPayload.instruction,
          ) || instructionIsEntityReference
        ) {
          // P6-A/P10-E: anaphore ou référence sans cible résoluble →
          // l'instruction tombe, le clarify demande le contenu — on ne
          // committe JAMAIS « même chose »/« celui du midi » littéral.
          compiledPayload = { ...compiledPayload, instruction: null };
        }
      } catch (_error) {
        // best-effort: le clarify replace_payload_incomplete reste le filet.
      }
    }
    // P12-D7 (alex-untested24 R1-B07): deux pendings de MÊME contenu ⇒
    // clarify nominative avec les HEURES des candidats — jamais la consigne
    // circulaire « donne-moi son heure actuelle » sans les heures.
    if (replaceSameContentCandidates) {
      const candidateLine = replaceSameContentCandidates
        .map((entry) => `celui de ${entry.hhmm ?? "?"}`)
        .join(" ou ");
      const sameContentReply = `Tu as ${replaceSameContentCandidates.length} rappels « ${
        replaceSameContentCandidates[0].instruction
      } » en attente : ${candidateLine} — lequel je remplace ? Rien n'a été changé.`;
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_target_ambiguous",
          reply: sameContentReply,
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_target_ambiguous",
        }],
        pending_clarification: {
          intent: "replace",
          reason_code: "replace_target_ambiguous",
          clarify_question: sameContentReply,
          known_slots: {
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            instruction_hint: compiledPayload.instruction ?? null,
            replace_target_label: null,
          },
        },
      };
    }
    // P12-D8a (paul-p9reval R1-B03): héritage étendu aux CANCELLED récents —
    // un replace émis après un cancel (« remets-moi celui des poubelles »)
    // hérite l'instruction de la ligne annulée quand l'entité est unique;
    // AUCUNE ancre de cancel n'est posée (issue non destructive, P9-A).
    if (!compiledPayload.instruction) {
      try {
        const sinceIso = new Date(now.getTime() - 24 * 3_600_000)
          .toISOString();
        const recentRows = await readRecentOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
          sinceIso,
        });
        const cancelledMatches = (recentRows as Array<Record<string, unknown>>)
          .filter((row) => String(row?.status ?? "") === "cancelled")
          .map((row) =>
            String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim()
          )
          .filter((instruction) =>
            instruction &&
            messageContentOverlapScore(args.message, instruction) > 0
          );
        const distinct = [
          ...new Set(
            cancelledMatches.map((instruction) =>
              instruction.normalize("NFD").replace(/\p{Diacritic}/gu, "")
                .toLowerCase()
            ),
          ),
        ];
        if (cancelledMatches.length > 0 && distinct.length === 1) {
          compiledPayload = {
            ...compiledPayload,
            instruction: cancelledMatches[0],
          };
        }
      } catch (_error) {
        // Lecture best-effort: le clarify replace_payload_incomplete reste.
      }
    }
    // TOUT-OU-RIEN (round12 S2): le payload du NOUVEAU rappel se valide AVANT
    // d'annuler l'ancien — un cancel suivi d'un create impossible laisserait
    // l'utilisateur sans aucun rappel (demi-replace, pire que rien).
    if (
      !compiledPayload.scheduledFor || !compiledPayload.localLabel ||
      !compiledPayload.instruction
    ) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_payload_incomplete",
          reply: !compiledPayload.scheduledFor
            ? "Pour remplacer ce rappel il me manque l'heure exacte du nouveau — rien n'a été annulé pour l'instant."
            : "Pour remplacer ce rappel il me manque ce qu'il doit rappeler — rien n'a été annulé pour l'instant.",
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_payload_incomplete",
        }],
        missing_slots: !compiledPayload.scheduledFor
          ? ["scheduled_for"]
          : ["reminder_instruction"],
        pending_clarification: {
          intent: "replace",
          reason_code: "replace_payload_incomplete",
          clarify_question: !compiledPayload.scheduledFor
            ? "Pour remplacer ce rappel il me manque l'heure exacte du nouveau."
            : "Pour remplacer ce rappel il me manque ce qu'il doit rappeler.",
          known_slots: {
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            instruction_hint: compiledPayload.instruction ?? null,
            replace_target_label:
              payloadText(createEffect, "replace_target_label") ?? null,
          },
        },
      };
    }
    // P2-3a (alex-untested R1-B02): admission TEMPORELLE avant toute
    // mutation — le tout-ou-rien validait la COMPLÉTUDE du payload, pas son
    // ADMISSIBILITÉ : « annule celui de 21h50 et remets-en un à 21h15 » à
    // 23h17 résolvait 21h15 au jour courant (passé) → cancel committé PUIS
    // create bloqué past_time = user sans plus aucun rappel (demi-replace).
    // Une heure nue dans un replace hérite du JOUR du rappel remplacé
    // (l'ancre naturelle) ; toujours passée après réparation → clarify,
    // RIEN n'est annulé.
    // P4-B (alex-global19 R1-B02, volet ancre): l'héritage de jour vaut PAR
    // DÉFAUT dès que la nouvelle heure ne porte AUCUN marqueur de jour —
    // « remets-en un à 21h » sur un rappel de demain vise demain, pas
    // aujourd'hui, même quand 21h n'est pas encore passé.
    {
      const newMs = new Date(compiledPayload.scheduledFor).getTime();
      // Le marqueur de jour se cherche dans l'expression USER (when_hint) —
      // jamais dans un label recalculé (il porte toujours un nom de mois).
      const whenHintForDay = payloadText(createEffect, "when_hint") ?? "";
      const newTimeDayText = whenHintForDay.trim() ||
        (compiledPayload.localLabel ?? "");
      if (
        Number.isFinite(newMs) &&
        (newMs <= now.getTime() + 30_000 ||
          !hasAnyExplicitDayToken(newTimeDayText))
      ) {
        try {
          const tctxAnchor = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const timezone = tctxAnchor.user_timezone || "Europe/Paris";
          const pendings = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          const targetHHMM = extractTargetHHMMFromMessage(
            payloadText(createEffect, "replace_target_label") ?? "",
          );
          const anchorRow = targetHHMM
            ? pendings.find((row) =>
              localHHMMForScheduledFor(
                String(row?.scheduled_for ?? ""),
                timezone,
              ) === targetHHMM
            )
            : pendings.length === 1
            ? pendings[0]
            : null;
          const anchorIso = String(anchorRow?.scheduled_for ?? "");
          if (anchorIso) {
            const localDayUtcMs = (iso: string) => {
              const day = new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date(iso));
              return Date.parse(`${day}T00:00:00Z`);
            };
            // Décalage en jours civils LOCAUX (préserve l'heure locale du
            // nouveau, hors bascule DST — re-vérifié futur ci-dessous).
            const dayDeltaMs = localDayUtcMs(anchorIso) -
              localDayUtcMs(String(compiledPayload.scheduledFor));
            if (dayDeltaMs > 0) {
              const repaired = new Date(newMs + dayDeltaMs).toISOString();
              if (new Date(repaired).getTime() > now.getTime() + 30_000) {
                compiledPayload = {
                  ...compiledPayload,
                  scheduledFor: repaired,
                  // Le label suit le jour hérité — un label resté sur le
                  // jour pré-décalage mentirait au rendu (leçon eva B02).
                  localLabel: formatOneShotLocalLabel(repaired, timezone),
                };
              }
            }
          }
        } catch (_error) {
          // best-effort: le clarify ci-dessous reste le filet.
        }
        if (
          new Date(String(compiledPayload.scheduledFor)).getTime() <=
            now.getTime() + 30_000
        ) {
          return {
            ...baseDirectEffectResult({
              detected: true,
              intent: "replace",
              status: "needs_clarify",
              reason_code: "replace_past_time",
              reply:
                "L'heure demandée pour le nouveau rappel est déjà passée aujourd'hui — du coup rien n'a été annulé ni créé. Tu le veux pour quel jour ?",
            }),
            requested_effects: [{ type: effectType, reason_code: "replace" }],
            blocked_effects: [{
              type: effectType,
              reason_code: "replace_past_time",
            }],
            missing_slots: ["scheduled_for"],
            pending_clarification: {
              intent: "replace",
              reason_code: "replace_past_time",
              clarify_question:
                "L'heure demandée est déjà passée aujourd'hui — tu veux le nouveau rappel pour quel jour ?",
              known_slots: {
                UTC_time: null,
                local_label: compiledPayload.localLabel ?? null,
                instruction_hint: compiledPayload.instruction ?? null,
                replace_target_label:
                  payloadText(createEffect, "replace_target_label") ?? null,
              },
            },
          };
        }
      }
    }
    // P4-C (paul-p3verify R1-B03, probes P4-5 ×2): le CANCEL du replace ne
    // part que vers une cible qui CORRESPOND. Deux dérives observées:
    // (a) « remets-moi le rappel des pâtes » sans heure cible → le repli
    // « pending unique » annulait le kiné ; (b) le dispatcher met l'heure du
    // NOUVEAU rappel dans replace_target_label (18h) → aucun pending à cette
    // heure → même repli, même kiné annulé. Règle: une heure qui matche
    // RÉELLEMENT un pending autorise le cancel (ciblage explicite) ; sinon
    // le repli unique exige le recouvrement d'instruction — à défaut, zéro
    // cancel, le create part seul (chemin « rien à remplacer »).
    let replaceTargetsUnrelatedReminder = false;
    if (compiledPayload.instruction) {
      try {
        const pendingsForMatch = await readPendingOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
        });
        const tctxGuard = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const guardTimezone = tctxGuard.user_timezone || "Europe/Paris";
        const targetHHMM = extractTargetHHMMFromMessage(
          payloadText(createEffect, "replace_target_label") ?? "",
        );
        const rowByHour = targetHHMM
          ? pendingsForMatch.find((row) =>
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              guardTimezone,
            ) === targetHHMM
          )
          : null;
        const fallbackRow = !rowByHour && pendingsForMatch.length === 1
          ? pendingsForMatch[0]
          : null;
        if (
          !rowByHour && fallbackRow &&
          oneShotInstructionTokens(compiledPayload.instruction).size > 0 &&
          !instructionTokensOverlap(
            compiledPayload.instruction,
            String(
              (fallbackRow?.message_payload as
                | Record<string, unknown>
                | undefined)?.reminder_instruction ?? "",
            ),
          )
        ) {
          replaceTargetsUnrelatedReminder = true;
        }
      } catch (_error) {
        // best-effort: le chemin cancel historique reste le fallback.
      }
    }
    // P12-D3 (nina-p10reval R1-B03b): marqueur additif explicite (« rajoute…
    // et tu gardes celui de vendredi ») ⇒ le chemin replace perd le droit de
    // CANCEL — la contrainte « garde Y » protège l'existant, le create part
    // seul (doublon assumé). Condition de désarmement: pas de marqueur ⇒
    // replace historique (« décale X à jeudi » cancel+create normalement).
    if (additiveMarker) {
      replaceCancelForbidden = true;
      allowDuplicateForTurn = true;
    }
    const cancelRunner = args.cancelReminder ?? maybeCancelOneShotReminder;
    const cancelOutcome = replaceTargetsUnrelatedReminder ||
        replaceCancelForbidden
      ? { detected: true, status: "no_reminder" as const, user_message: "" }
      : await cancelRunner({
        supabase: args.supabase,
        userId: args.userId,
        message: payloadText(createEffect, "replace_target_label") ?? "",
        requestId: args.requestId,
        now,
      });
    if (cancelOutcome.detected && cancelOutcome.status === "cancelled") {
      replaceCancelledLabel = cancelOutcome.cancelled_local_labels[0] ?? null;
      // Garde anti-faux-replace: si l'heure du « nouveau » est identique a
      // celle qui vient d'etre annulee, c'etait un cancel pur (payload
      // sur-rempli) — on n'y recree RIEN, l'annulation est le resultat.
      if (compiledPayload.scheduledFor && replaceCancelledLabel) {
        try {
          const tctxReplace = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const newLocalHHMM = new Intl.DateTimeFormat("fr-FR", {
            timeZone: tctxReplace.user_timezone || "Europe/Paris",
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(compiledPayload.scheduledFor));
          if (newLocalHHMM === replaceCancelledLabel) {
            return {
              ...baseDirectEffectResult({
                detected: true,
                intent: "cancel",
                status: "success",
                reason_code: "cancelled",
                reply:
                  `C'est annulé : le rappel de ${replaceCancelledLabel} ne partira pas.`,
              }),
              executed_tools: ["cancel_one_shot_reminder"],
              requested_effects: [{
                type: "cancel_one_shot_reminder",
                reason_code: "cancel",
              }],
              allowed_effects: [{
                type: "cancel_one_shot_reminder",
                reason_code: "cancel",
              }],
              committed_effects: [{
                type: "cancel_one_shot_reminder",
                ids: cancelOutcome.cancelled_ids ?? [],
                local_label: replaceCancelledLabel ?? undefined,
              }],
            };
          }
        } catch (_error) {
          // comparaison best-effort: en cas d'echec on suit le chemin replace
        }
      }
      replaceCancelCommitted = [{
        type: "cancel_one_shot_reminder",
        ids: cancelOutcome.cancelled_ids ?? [],
        local_label: replaceCancelledLabel ?? undefined,
      }];
    } else if (
      cancelOutcome.detected && cancelOutcome.status === "ambiguous_target"
    ) {
      // P12-D5/D7 (nina-p10reval R1-B06): clarify NOMINATIVE — chaque
      // candidat cité (objet + heure), jamais « donne-moi son heure
      // actuelle » sec ni « l'intitulé exact ».
      let ambiguousInventory = "";
      try {
        const tctxAmbiguous = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneAmbiguous = tctxAmbiguous.user_timezone ||
          "Europe/Paris";
        const ambiguousRows = await readPendingOneShotReminderRows({
          supabase: args.supabase,
          userId: args.userId,
        });
        ambiguousInventory = ambiguousRows.map((row) =>
          `« ${
            String(
              (row?.message_payload as Record<string, unknown> | undefined)
                ?.reminder_instruction ?? "",
            ).trim() || "rappel ponctuel"
          } » à ${
            localHHMMForScheduledFor(
              String(row?.scheduled_for ?? ""),
              timezoneAmbiguous,
            ) ?? "?"
          }`
        ).join(" ; ");
      } catch (_error) {
        // Lecture best-effort: la question reste posée sans inventaire.
      }
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "needs_clarify",
          reason_code: "replace_target_ambiguous",
          reply: ambiguousInventory
            ? `Tu as ${cancelOutcome.pending_count} rappels en attente : ${ambiguousInventory} — lequel je remplace ?`
            : `Tu as ${cancelOutcome.pending_count} rappels en attente — lequel je remplace ? Dis-moi son contenu ou son heure.`,
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_target_ambiguous",
        }],
        pending_clarification: {
          intent: "replace",
          reason_code: "replace_target_ambiguous",
          clarify_question:
            "Lequel de tes rappels en attente je remplace ? Donne-moi son heure actuelle.",
          known_slots: {
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            instruction_hint: compiledPayload.instruction ?? null,
            replace_target_label: null,
          },
        },
      };
    } else if (
      cancelOutcome.detected && cancelOutcome.status === "no_reminder"
    ) {
      // Rien a remplacer: le nouveau rappel se cree quand meme (l'intention
      // du user est le NOUVEAU), le rendu le dira honnetement.
      replaceCancelCommitted = [];
    } else {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "replace",
          status: "failed",
          reason_code: "replace_cancel_failed",
          reply:
            "Je n'ai pas réussi à annuler l'ancien rappel, donc je n'ai rien recréé pour éviter un doublon. Réessaie, ou gère-le dans l'app.",
        }),
        requested_effects: [{ type: effectType, reason_code: "replace" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "replace_cancel_failed",
        }],
      };
    }
  }
  st.createEffect = createEffect;
  st.compiledPayload = compiledPayload;
  st.allowDuplicateForTurn = allowDuplicateForTurn;
  st.replaceCancelCommitted = replaceCancelCommitted;
  st.replaceCancelledLabel = replaceCancelledLabel;
  st.replaceCancelForbidden = replaceCancelForbidden;
  return null;
}
