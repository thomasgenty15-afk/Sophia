// ═══════════════════════════════════════════════════════════════════════════
// PLUSIEURS RAPPELS DANS UN MÊME MESSAGE : UNE EXÉCUTION PAR RAPPEL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Le bloc est le texte d'origine, à l'indentation d'origine ; seules
// la signature, les lignes qui lisent l'état au début et celles qui le
// rendent à la fin sont nouvelles. Ce module n'importe jamais `router.ts`.
//
// Quand le turn frame porte plusieurs créations (ou un « récurrent » sur
// deux ou trois jours nommés), la lane s'exécute une fois par rappel et les
// résultats sont fusionnés. Rend `null` sinon. La lane est rappelée par le
// paramètre `maybeRunOneShotReminderDirectEffect`, que `router.ts` fournit :
// ce module n'importe pas `router.ts`.

import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { OneShotReminderDirectEffectResult } from "./contract.ts";
import type { OneShotReminderLaneArgs } from "./intent_state.ts";
import { parseScheduledForFromMessage } from "./time_parser.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import { temporalScopeText } from "./text_signals.ts";
import {
  formatOneShotLocalLabel,
  isValidIsoDate,
  mergeMultiCreateDirectEffectResults,
  payloadText,
} from "./payload_compile.ts";

export async function runMultiCreateIntent(
  args: OneShotReminderLaneArgs,
  maybeRunOneShotReminderDirectEffect: (
    args: OneShotReminderLaneArgs,
  ) => Promise<OneShotReminderDirectEffectResult>,
): Promise<OneShotReminderDirectEffectResult | null> {
  // P8-A (rose-p7verify R1 T13/T14, BF-LEDGER-02): CO-DEMANDE DE N RAPPELS —
  // quand le frame porte N effets create NOMINAUX distincts (contrat planner
  // + sanitizer par signature de payload), la lane s'exécute une fois PAR
  // effet (frame réduit: cet effet en tête, message = SA clause exacte) et le
  // résultat agrégé porte N requested / N committed distincts — la parité
  // P7-B redevient vérifiable par créneau. Sans ça, le premier effet
  // absorbait la co-demande: 1 committé, l'accusé énumérait les 2 créneaux
  // depuis le texte user et le récap confabulait le manquant. Nominal create
  // UNIQUEMENT (jamais cancel/replace/status/reschedule — ces intents restent
  // mono-effet), borné à 3 (doctrine P4). Les gates anti-doublon de
  // l'executor exemptent déjà les écritures du même source_message_id: des
  // creates frères du même tour ne se bloquent pas entre eux.
  {
    const nominalCreateEffects = (args.turnFrame?.direct_effects ?? []).filter(
      (effect) =>
        effect.effect_type === "create_one_shot_reminder" &&
        String(payloadText(effect, "intent") ?? "create") === "create" &&
        String(payloadText(effect, "cardinality") ?? "once") !== "recurring",
    );
    if (nominalCreateEffects.length >= 2) {
      const otherEffects = (args.turnFrame?.direct_effects ?? []).filter(
        (effect) => effect.effect_type !== "create_one_shot_reminder",
      );
      // P12-V (probe P12-1 passe 1): sur « jeudi et vendredi à 18h »,
      // l'émission distribue parfois les JOURS sans l'heure commune
      // (when_hint « jeudi » nu, UTC_time vide) → chaque volet dégénérait en
      // clarify missing_time alors que le message porte UNE SEULE heure.
      // Distribution déterministe bornée : exactement une heure distincte
      // dans le message ET le volet sans heure ni UTC_time. Deux heures
      // distinctes dans le message ⇒ jamais de devinette (chaque volet garde
      // la sienne ou clarifie).
      const soleMessageHour = (() => {
        // Condition de désarmement (test P8-A « samedi, heure à voir »): si
        // UN sibling porte déjà une heure dans son when_hint, l'heure unique
        // du message lui APPARTIENT — la greffer aux autres serait une
        // devinette (l'utilisateur a explicitement laissé l'autre créneau
        // ouvert). Distribution seulement quand l'heure est orpheline de
        // TOUS les volets.
        const anySiblingCarriesHour = nominalCreateEffects.some((effect) =>
          /\d/.test(String(payloadText(effect, "when_hint") ?? ""))
        );
        if (anySiblingCarriesHour) return null;
        const normalizedMessage = args.message.normalize("NFD")
          .replace(/\p{Diacritic}/gu, "").toLowerCase();
        const hours = [
          ...new Set(
            [...normalizedMessage.matchAll(/\b(\d{1,2})\s?h\s?(\d{2})?\b/g)]
              .map((m) => `${m[1]}h${m[2] ?? ""}`),
          ),
        ];
        return hours.length === 1 ? hours[0] : null;
      })();
      let boundedTimezone = "Europe/Paris";
      let boundedNowIso = (args.now && Number.isFinite(args.now.getTime())
        ? args.now
        : new Date()).toISOString();
      if (soleMessageHour) {
        try {
          const tctxDistribute = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now: args.now && Number.isFinite(args.now.getTime())
              ? args.now
              : new Date(),
          });
          boundedTimezone = tctxDistribute.user_timezone || "Europe/Paris";
          boundedNowIso = tctxDistribute.now_utc;
        } catch (_error) {
          // best-effort: la distribution parse en tz par défaut.
        }
      }
      const bounded = nominalCreateEffects.slice(0, 3).map((effect) => {
        if (!soleMessageHour) return effect;
        const hint = String(payloadText(effect, "when_hint") ?? "");
        const utc = String(payloadText(effect, "UTC_time") ?? "");
        if (!hint.trim() || /\d/.test(hint) || isValidIsoDate(utc)) {
          return effect;
        }
        const distributedWhen = `${hint} à ${soleMessageHour}`;
        // L'UTC se résout ICI (le message du sibling ne porte pas d'acte de
        // rappel: la complétion bornée du create nu ne s'armerait pas).
        const distributedScheduledFor = parseScheduledForFromMessage({
          message: distributedWhen,
          timezone: boundedTimezone,
          nowIso: boundedNowIso,
        });
        if (!distributedScheduledFor) return effect;
        return {
          ...effect,
          payload_hint: {
            ...((effect.payload_hint ?? {}) as Record<string, unknown>),
            when_hint: distributedWhen,
            UTC_time: distributedScheduledFor,
            local_label: formatOneShotLocalLabel(
              distributedScheduledFor,
              boundedTimezone,
            ),
            raw_text: `${
              String(payloadText(effect, "raw_text") ?? "")
            } à ${soleMessageHour}`.trim(),
          },
        };
      });
      const siblingResults: OneShotReminderDirectEffectResult[] = [];
      for (const effect of bounded) {
        siblingResults.push(
          await maybeRunOneShotReminderDirectEffect({
            ...args,
            message: payloadText(effect, "raw_text") ?? args.message,
            turnFrame: {
              ...(args.turnFrame as TurnFrame),
              direct_effects: [effect, ...otherEffects],
            },
          }),
        );
      }
      return mergeMultiCreateDirectEffectResults({
        results: siblingResults,
        overflow: nominalCreateEffects.length - bounded.length,
      });
    }
    // P12-B (nina-p10reval R1-B01): des jours calendaires NOMMÉS dénombrables
    // SANS marqueur d'habitude (« jeudi et vendredi à 18h ») ne sont PAS un
    // récurrent — c'est un fan-out once×N. Quand le dispatcher les classe
    // cardinality=recurring, la ceinture requalifie en N effets once (un par
    // jour, UTC résolu PAR item par le parseur) et délègue au chemin P8-A.
    // Conditions de désarmement: marqueur d'habitude (« tous les », « chaque »,
    // quotidien/hebdo) ⇒ blocage recurring honnête inchangé ; heure ambiguë
    // (1-9 nue) ou instruction absente ⇒ pas de requalification (jamais une
    // devinette committée). Les jours se lisent dans le SCOPE temporel
    // (l'instruction est inerte, P12-A).
    if (nominalCreateEffects.length === 0) {
      const recurringCreateEffects = (args.turnFrame?.direct_effects ?? [])
        .filter((effect) =>
          effect.effect_type === "create_one_shot_reminder" &&
          String(payloadText(effect, "intent") ?? "create") === "create" &&
          String(payloadText(effect, "cardinality") ?? "once") === "recurring"
        );
      const recurringEffect = recurringCreateEffects.length === 1
        ? recurringCreateEffects[0]
        : null;
      const recurringInstruction = recurringEffect
        ? String(payloadText(recurringEffect, "instruction_hint") ?? "").trim()
        : "";
      if (recurringEffect && recurringInstruction) {
        const combinedText = [
          payloadText(recurringEffect, "when_hint") ?? "",
          payloadText(recurringEffect, "raw_text") ?? "",
          args.message,
        ].filter(Boolean).join(" ");
        const scopedText = temporalScopeText(
          combinedText,
          recurringInstruction,
        );
        const hasHabitMarker =
          /\b(tous|toutes|chaque|quotidien(ne)?s?|hebdomadaires?|par jour|par semaine|a chaque fois)\b/
            .test(scopedText);
        const namedDayTokens = [
          ...new Set(
            [...scopedText.matchAll(
              /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|apres[- ]demain|demain)\b/g,
            )].map((match) => match[1]),
          ),
        ];
        const hourMatch = scopedText.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/);
        const hour = hourMatch ? Number(hourMatch[1]) : null;
        const hourUnambiguous = hour !== null &&
          (hour >= 10 || Boolean(hourMatch?.[2]) ||
            /\b(matin|midi|soir)\b/.test(scopedText));
        if (
          !hasHabitMarker && namedDayTokens.length >= 2 &&
          namedDayTokens.length <= 3 && hourUnambiguous
        ) {
          const hourLabel = `${hour}h${hourMatch?.[2] ?? ""}`;
          const nowForFanOut = args.now &&
              Number.isFinite(args.now.getTime())
            ? args.now
            : new Date();
          try {
            const tctxFanOut = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
              now: nowForFanOut,
            });
            const timezoneFanOut = tctxFanOut.user_timezone || "Europe/Paris";
            const siblingEffects = namedDayTokens.map((dayToken) => {
              const whenClause = `${dayToken} à ${hourLabel}`;
              const scheduledFor = parseScheduledForFromMessage({
                message: whenClause,
                timezone: timezoneFanOut,
                nowIso: tctxFanOut.now_utc,
              });
              return scheduledFor
                ? {
                  ...recurringEffect,
                  payload_hint: {
                    ...((recurringEffect.payload_hint ?? {}) as Record<
                      string,
                      unknown
                    >),
                    intent: "create",
                    cardinality: "once",
                    when_hint: whenClause,
                    raw_text: `${recurringInstruction} ${whenClause}`,
                    UTC_time: scheduledFor,
                    local_label: formatOneShotLocalLabel(
                      scheduledFor,
                      timezoneFanOut,
                    ),
                    instruction_hint: recurringInstruction,
                  },
                }
                : null;
            });
            if (siblingEffects.every(Boolean)) {
              const otherEffects = (args.turnFrame?.direct_effects ?? [])
                .filter((effect) =>
                  effect.effect_type !== "create_one_shot_reminder"
                );
              const siblingResults: OneShotReminderDirectEffectResult[] = [];
              for (const effect of siblingEffects) {
                siblingResults.push(
                  await maybeRunOneShotReminderDirectEffect({
                    ...args,
                    message: payloadText(effect!, "raw_text") ?? args.message,
                    turnFrame: {
                      ...(args.turnFrame as TurnFrame),
                      direct_effects: [effect!, ...otherEffects],
                    },
                  }),
                );
              }
              return mergeMultiCreateDirectEffectResults({
                results: siblingResults,
              });
            }
          } catch (_error) {
            // best-effort: le blocage recurring honnête reste le filet.
          }
        }
      }
    }
  }
  return null;
}
