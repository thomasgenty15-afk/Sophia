import type {
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectResult,
  OneShotReminderDirectEffectTool,
} from "./contract.ts";
import {
  extractReminderInstruction,
  hasAdditiveReminderMarker,
  isDegenerateReminderInstruction,
  isReminderInstructionInvarianceAnaphora,
} from "./instruction_parser.ts";
import { readPendingOneShotReminderRows } from "./persistence.ts";
import {
  extractTargetHHMMFromMessage,
  hasAnyExplicitDayToken,
  hasExplicitFutureDayHint,
  localHHMMForScheduledFor,
  parseOneShotReminderRequest,
  parseScheduledForFromMessage,
  resolveMeridiemClarifyAnswer,
  resolvePastTimeClarifyAnswer,
} from "./time_parser.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import {
  isBareClarifyRetraction,
  pendingCreateClarificationKnownSlots,
  pendingCreateClarificationReason,
  pendingOneShotReminderClarificationState,
  SAFETY_DEFERRED_REMINDER_RUNTIME_KEY,
  sanitizeOneShotReminderVisibleResult,
} from "./clarification_state.ts";
import {
  bareAmbiguousHour,
  hasNocturnalOrMeridiemForwardMarker,
  hasRescheduleCliticAnaphor,
  instructionTokensOverlap,
  messageContentOverlapScore,
  temporalScopeText,
} from "./text_signals.ts";
import {
  baseDirectEffectResult,
  canonicalInstructionHintFromTurnFrame,
  canonicalRawTextFromTurnFrame,
  canonicalWhenHintFromTurnFrame,
  compileStructuredCreatePayload,
  createEffectFromTurnFrame,
  formatOneShotLocalLabel,
  isValidIsoDate,
  payloadText,
} from "./payload_compile.ts";
export {
  buildMinuteByMinuteSequenceAddonForOneShotReminder
    as buildMinuteByMinuteSequenceAddon,
  localTextAddonForOneShotReminder as localTextAddonForOneShotReminder,
  oneShotReminderManagementReply,
} from "./renderer.ts";

// ⟳ 2026-09-24 · LOT 5b DU DÉCOUPAGE — DES MODULES SONT SORTIS DE CE FICHIER
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique :
//   · la clarification en attente, le différé de crise, la purge des gabarits → `clarification_state.ts`
//   · les détections sur le texte du message et les jetons d'une consigne → `text_signals.ts`
//   · le résultat de base, la lecture du turn frame, la compilation du rappel, la fusion multi-rappels → `payload_compile.ts`
// Puis (lot 5b-2) une fonction par intention, dans l'ordre où la lane les
// essaie : `intent_multi_create.ts`, `intent_reschedule.ts`,
// `intent_status.ts`, `intent_replace.ts`, `intent_cancel.ts`,
// `intent_create.ts`. Chacune reçoit les `let` du corps dans un objet
// d'état (`intent_state.ts`) ; celle qui rend `null` y a recopié ses
// valeurs, que le corps reprend avant l'étape suivante. Le début du corps
// (clarifications en attente, reclassement de l'intention, complétion de
// l'heure) reste ici.
// Tout ce que ce fichier exportait est ré-exporté ci-dessous : aucun appelant
// ne change d'import. Les tests qui lisent le TEXTE de ce fichier lisent la
// famille entière (`scripts/source-families.json`). Aucun de ces modules
// n'importe ce fichier.
import type { OneShotReminderLaneArgs } from "./intent_state.ts";
import { runMultiCreateIntent } from "./intent_multi_create.ts";
import { runRescheduleIntent } from "./intent_reschedule.ts";
import { runStatusIntent } from "./intent_status.ts";
import { runReplaceIntent } from "./intent_replace.ts";
import { runCancelIntent } from "./intent_cancel.ts";
import { runCreateIntent } from "./intent_create.ts";
export {
  applyOneShotReminderPendingClarification,
  clearSafetyDeferredReminderOnCommit,
  explicitDeferredReServeAsk,
  isBareClarifyRetraction,
  ONE_SHOT_REMINDER_CLARIFICATION_RUNTIME_KEY,
  pendingCreateClarificationKnownSlots,
  pendingCreateClarificationReason,
  pendingOneShotReminderClarificationForDispatcher,
  pendingOneShotReminderClarificationState,
  pendingSafetyDeferredReminderForDispatcher,
  SAFETY_DEFERRED_REMINDER_RUNTIME_KEY,
  storeSafetyDeferredReminder,
  stripTemplatePlaceholders,
} from "./clarification_state.ts";
export {
  classifyOneShotReminderDirectIntent,
  isOneShotReminderVerificationQuestion,
  oneShotReminderDraftRequested,
} from "./text_signals.ts";
export {
  mergeMultiCreateDirectEffectResults,
  recurringNotSupportedDirectEffectResult,
  safetyCrisisDeferredDirectEffectResult,
} from "./payload_compile.ts";

/**
 * One-shot reminder route runtime.
 * Execute only explicit one-shot reminder direct effects; status/product-help
 * blockers live in route_guards.ts.
 * P12-D2d: le résultat visible passe par la purge des placeholders de
 * template avant de sortir de la lane (invariant: aucun « [heure] » rendu).
 */
export async function maybeRunOneShotReminderDirectEffect(
  args: Parameters<typeof runOneShotReminderDirectEffectInner>[0],
): Promise<OneShotReminderDirectEffectResult> {
  return sanitizeOneShotReminderVisibleResult(
    await runOneShotReminderDirectEffectInner(args),
  );
}

async function runOneShotReminderDirectEffectInner(
  args: OneShotReminderLaneArgs,
): Promise<OneShotReminderDirectEffectResult> {
  {
    const intentResult = await runMultiCreateIntent(
      args,
      maybeRunOneShotReminderDirectEffect,
    );
    if (intentResult) return intentResult;
  }
  let createEffect = createEffectFromTurnFrame(args.turnFrame);
  const now = args.now && Number.isFinite(args.now.getTime())
    ? args.now
    : new Date();
  let compiledPayload = compileStructuredCreatePayload({
    turnFrame: args.turnFrame,
    message: args.message,
  });
  // P12-V (harness S2 T5): sur un tour de PURE CONFIRMATION (« Oui c'est
  // bien ça, vas-y ») après une opération déjà exécutée, le dispatcher
  // ré-émet parfois l'effet du tour précédent (raw_text agrégé) — le replace
  // se RE-jouait avec une ancre recalculée (23h aujourd'hui déplacé à demain
  // 23h, en silence). Règle 45 rendue structurelle: l'effet se rapporte au
  // MESSAGE COURANT — une affirmation nue (zéro chiffre, zéro jeton de
  // jour, zéro acte de rappel) ne porte aucune demande NOUVELLE. Conditions
  // de désarmement: un clarify one-shot ARMÉ (le « vas-y » est la réponse —
  // fusion D1) ou un différé safety en attente (re-serve P8-E) consomment
  // légitimement l'affirmation.
  {
    const normalizedAffirmation = String(args.message ?? "")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "")
      .replace(/[’']/g, " ").toLowerCase()
      .replace(/[.,!?;:\-]/g, " ").replace(/\s+/g, " ").trim();
    const affirmationLexicon = new Set([
      "oui", "ouais", "yes", "ok", "okay", "d", "accord", "ca", "marche",
      "parfait", "nickel", "super", "top", "c", "est", "bien", "exactement",
      "vas", "y", "vasy", "go", "fais", "le", "confirme", "je", "allez",
      "merci", "stp", "s", "il", "te", "plait", "carrement", "voila", "genial",
    ]);
    const affirmationTokens = normalizedAffirmation.split(" ").filter(Boolean);
    const isBareAffirmation = affirmationTokens.length > 0 &&
      affirmationTokens.length <= 8 &&
      !/\d/.test(normalizedAffirmation) &&
      affirmationTokens.every((token) => affirmationLexicon.has(token));
    const clarifyArmed = Boolean(
      pendingCreateClarificationKnownSlots(args.tempMemory) ||
        pendingOneShotReminderClarificationState(args.tempMemory),
    );
    const deferredArmed = ((args.tempMemory as
      | Record<string, unknown>
      | null
      | undefined)?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
        | Record<string, unknown>
        | undefined)?.mode === "deferred";
    if (
      createEffect && isBareAffirmation && !clarifyArmed && !deferredArmed
    ) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "blocked",
          reason_code: "confirmation_reemission_noop",
          reply:
            "Rien de nouveau à changer — c'est déjà en place comme convenu.",
        }),
        requested_effects: [{
          type: "create_one_shot_reminder",
          reason_code: "create",
        }],
        blocked_effects: [{
          type: "create_one_shot_reminder",
          reason_code: "confirmation_reemission_noop",
        }],
      };
    }
  }
  // P12-D (état partagé des fixes D1-D8): clarify one-shot en attente (tous
  // intents), marqueur additif du tour, et flag allow-duplicate transmis à
  // l'exécuteur (D2c/D3/D4).
  const pendingClarifyState = pendingOneShotReminderClarificationState(
    args.tempMemory,
  );
  const additiveMarker = hasAdditiveReminderMarker(
    `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
  );
  let allowDuplicateForTurn = additiveMarker;
  // P12-D2a (alex-untested24 R1-B03c): rétractation sous clarify actif ⇒
  // pending PURGÉ (le résultat ne porte AUCUN pending_clarification: le
  // pipeline P2-3d supprime la clé), zéro question résiduelle, zéro write.
  if (pendingClarifyState && isBareClarifyRetraction(args.message)) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: pendingClarifyState.intent === "replace"
          ? "replace"
          : "create",
        status: "blocked",
        reason_code: "clarify_dismissed",
        reply: pendingClarifyState.intent === "replace"
          ? "Ok, on laisse tomber — je n'ai rien changé, tes rappels existants restent tels quels."
          : "Ok, on laisse tomber — je n'ai rien créé.",
      }),
      requested_effects: [{
        type: "create_one_shot_reminder",
        reason_code: pendingClarifyState.intent === "replace"
          ? "replace"
          : "create",
      }],
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "clarify_dismissed",
      }],
    };
  }
  // P12-D2b (alex-untested24 R1-B04, régression P4-B): une NOUVELLE demande
  // composite explicite (« annule X et remets-le à Yh ») sous clarify actif
  // DÉSARME le pending et se lit À NEUF — le chemin P4-B cancel→replace
  // s'applique comme hors-clarify. Condition de désarmement de la fusion D1:
  // c'est elle (une réponse partielle sans verbes composites reste fusionnée).
  const pendingDisarmedByComposite = Boolean(pendingClarifyState) &&
    /\b(annule|supprime|enleve|retire|vire)\b[^.!?]{0,80}\b(remets|remet|recree|reprogramme|replanifie|repose|mets)\b/
      .test(
        String(args.message ?? "").normalize("NFD")
          .replace(/\p{Diacritic}/gu, "").toLowerCase(),
      );
  // P6-V (probe P6-4 passe 2): sur le tour d'EXPOSITION du rappel différé de
  // crise, le dispatcher émet parfois un create alors que le user n'a RIEN
  // demandé (« on peut passer à autre chose, merci ») — l'offre devenait un
  // commit non sollicité, puis un DOUBLON quand le user re-demandait
  // vraiment. Sans mention de rappel ni acceptation dans le message, l'effet
  // se dégrade en OFFRE honnête (zéro write).
  {
    const deferredRuntime = (args.tempMemory as
      | Record<string, unknown>
      | null
      | undefined)?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
        | Record<string, unknown>
        | undefined;
    const nominalCreateIntent =
      String(payloadText(createEffect, "intent") ?? "create") === "create";
    if (
      deferredRuntime?.mode === "deferred" && createEffect &&
      nominalCreateIntent
    ) {
      const normalizedForDeferred = args.message.normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").toLowerCase();
      const asksOrAccepts =
        /\b(rappel|rappelle|remets|reposes?|pose|note[- ]moi|programme|oui|ok|vas ?y|volontiers|carrement|d accord|c est bon)\b/
          .test(normalizedForDeferred);
      if (!asksOrAccepts) {
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent: "create",
            status: "blocked",
            reason_code: "safety_deferred_offer_only",
            reply:
              "Au fait, j'ai toujours ton rappel de côté — tu veux que je le pose maintenant ?",
          }),
          requested_effects: [{
            type: "create_one_shot_reminder",
            reason_code: "create",
          }],
          blocked_effects: [{
            type: "create_one_shot_reminder",
            reason_code: "safety_deferred_offer_only",
          }],
        };
      }
      // P8-E (probe P8-5 passe 2): le tour de RE-SERVE arrive souvent avec
      // une émission INCOMPLÈTE (« vas-y remets-le » — le dispatcher ré-émet
      // sans les champs temporels) → le create dégénérait en clarify
      // missing_time et la promesse restait orpheline. Les slots du DIFFÉRÉ
      // sont la source de vérité de sa promesse: ils complètent le payload
      // MANQUANT (jamais ils n'écrasent une valeur fournie ce tour). Le
      // commit solde le différé (P4-C).
      const deferredSlots = (deferredRuntime.known_slots ?? {}) as Record<
        string,
        unknown
      >;
      const deferredUtc = String(deferredSlots.UTC_time ?? "").trim();
      const deferredRaw = String(deferredSlots.raw_text ?? "").trim();
      // Le chemin run.ts de crise (backstop déterministe) ne stocke que
      // raw_text/when_hint — l'instruction et l'heure de la promesse se
      // ré-extraient DÉTERMINISTIQUEMENT du raw_text d'origine (probe P8-5
      // passe 9: « il me manque le contenu » en boucle sur le re-serve).
      let deferredInstruction = String(deferredSlots.instruction_hint ?? "")
        .trim();
      if (!deferredInstruction && deferredRaw) {
        const extracted = extractReminderInstruction(deferredRaw);
        if (
          extracted && !isDegenerateReminderInstruction(extracted) &&
          !isReminderInstructionInvarianceAnaphora(extracted)
        ) {
          deferredInstruction = extracted;
        }
      }
      let deferredScheduledFor = isValidIsoDate(deferredUtc)
        ? deferredUtc
        : null;
      let deferredLabel = String(deferredSlots.local_label ?? "").trim() ||
        null;
      try {
        const tctxDeferred = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        if (!deferredScheduledFor) {
          // Le backstop stocke le MESSAGE ENTIER du tour de crise comme
          // raw_text — il porte souvent DEUX expressions temporelles
          // (« ce soir ça va pas... demain à 9h ») et le parseur gagne la
          // mauvaise (leçon P3-B, re-observée probe P8-5 passe 10). Le
          // when_hint ISOLÉ prime; le segment de raw_text après le verbe de
          // rappel sert de repli.
          const deferredWhen = String(deferredSlots.when_hint ?? "").trim();
          const rawReminderIdx = deferredRaw
            .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
            .search(/\b(remets|rappelle|rappel|previens|pose|mets)\b/);
          const rawSegment = rawReminderIdx >= 0
            ? deferredRaw.slice(rawReminderIdx)
            : deferredRaw;
          for (const candidate of [deferredWhen, rawSegment]) {
            if (!candidate) continue;
            const parsedDeferred = parseOneShotReminderRequest({
              message: candidate,
              timezone: tctxDeferred.user_timezone || "Europe/Paris",
              nowIso: tctxDeferred.now_utc,
            });
            if (parsedDeferred?.scheduledFor) {
              deferredScheduledFor = parsedDeferred.scheduledFor;
              break;
            }
          }
        }
        // Le backstop de crise ne stocke pas de local_label — il se
        // recalcule depuis la valeur résolue (jamais un slot bloquant).
        if (!deferredLabel && deferredScheduledFor) {
          deferredLabel = formatOneShotLocalLabel(
            deferredScheduledFor,
            tctxDeferred.user_timezone || "Europe/Paris",
          );
        }
      } catch (_error) {
        // best-effort: le clarify existant reste le filet.
      }
      compiledPayload = {
        ...compiledPayload,
        scheduledFor: compiledPayload.scheduledFor ?? deferredScheduledFor,
        localLabel: compiledPayload.localLabel ?? deferredLabel,
        instruction: compiledPayload.instruction ??
          (deferredInstruction || null),
      };
    }
  }
  // P5-D (eva-p4verify R1-B02): tour-réponse à un clarify de CRÉNEAU — les
  // slots déjà fournis au tour initial SURVIVENT. L'instruction du pending
  // prime tant que le message courant ne porte pas sa propre clause
  // d'instruction (« le soir. pas le matin » n'est pas un texte de rappel).
  const pendingCreateSlots = pendingCreateClarificationKnownSlots(
    args.tempMemory,
  );
  // P7-C (paul-p6reval R1-B01): résolution du clarify de MÉRIDIEM — quand
  // elle réussit, elle est CANONIQUE pour ce tour (le dispatcher ré-émet le
  // texte d'origine, son when_hint « demain à 7 heures » re-résoudrait 07:00
  // via la couche P3-B et écraserait la fusion → gate plus bas).
  let meridiemFusionApplied = false;
  if (pendingCreateSlots && !pendingDisarmedByComposite) {
    const storedInstruction = String(
      pendingCreateSlots.instruction_hint ?? "",
    ).trim();
    if (
      storedInstruction &&
      (!compiledPayload.instruction ||
        !extractReminderInstruction(args.message))
    ) {
      compiledPayload = { ...compiledPayload, instruction: storedInstruction };
    }
    // P7-C: le clarify méridiem persistait déjà ses slots (P6-H) mais le
    // tour-réponse (« du soir, 19h ») ne fusionnait jamais le créneau avec
    // l'heure-base — le rappel n'était PLUS CRÉABLE (cul-de-sac, 2 réponses
    // explicites → re-clarify). Fusion déterministe, fail-closed (réponse
    // qui ne lève pas l'ambiguïté → clarify inchangé).
    if (
      pendingCreateClarificationReason(args.tempMemory) ===
        "hour_meridiem_ambiguous"
    ) {
      try {
        const tctxMeridiem = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const fused = resolveMeridiemClarifyAnswer({
          answerMessage: args.message,
          baseWhenHint: [
            pendingCreateSlots.when_hint,
            pendingCreateSlots.raw_text,
          ].filter(Boolean).join(" "),
          timezone: tctxMeridiem.user_timezone,
          nowIso: tctxMeridiem.now_utc,
        });
        if (fused) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: fused.scheduledFor,
            localLabel: formatOneShotLocalLabel(
              fused.scheduledFor,
              tctxMeridiem.user_timezone,
            ),
          };
          meridiemFusionApplied = true;
        }
      } catch (_error) {
        // best-effort: le clarify méridiem existant reste le filet.
      }
    }
    // P10-A (nina-hard24 R1-B01, T5): fusion du tour-réponse à un clarify
    // PAST_TIME — l'indice de jour forward de la réponse (« la nuit qui
    // vient », « demain ») se combine avec l'heure déjà stockée, au lieu de
    // retomber sur missing_time (cul-de-sac auto-contradictoire). Ne prime
    // que si le tour n'apporte pas déjà un créneau FUTUR propre.
    if (
      pendingCreateClarificationReason(args.tempMemory) === "past_time" &&
      (!compiledPayload.scheduledFor ||
        new Date(compiledPayload.scheduledFor).getTime() <=
          now.getTime() + 30_000)
    ) {
      try {
        const tctxPast = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const fusedPast = resolvePastTimeClarifyAnswer({
          answerMessage: args.message,
          baseWhenHint: [
            pendingCreateSlots.when_hint,
            pendingCreateSlots.raw_text,
          ].filter(Boolean).join(" "),
          timezone: tctxPast.user_timezone,
          nowIso: tctxPast.now_utc,
        });
        if (fusedPast) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: fusedPast.scheduledFor,
            localLabel: formatOneShotLocalLabel(
              fusedPast.scheduledFor,
              tctxPast.user_timezone,
            ),
          };
          // Fusion canonique du tour: la couche P3-B ne doit pas la
          // ré-écraser depuis le when_hint ré-émis (même gate que P7-C).
          meridiemFusionApplied = true;
        }
      } catch (_error) {
        // best-effort: le clarify past_time existant reste le filet.
      }
    }
    // P12-D1 (alex-untested24 R1-B03): fusion GÉNÉRALISÉE du tour-réponse —
    // avant ce fix, seuls hour_meridiem_ambiguous (P7-C) et past_time (P10-A)
    // fusionnaient; tous les autres reason_codes re-classaient la réponse
    // comme énoncé neuf (T8 re-clarify, T9 blocked missing_time avec
    // when_hint="à 20h30" AU FRAME). Règle: slots du pending + slots du tour
    // (le tour PRIME), exécution TENTÉE avant tout re-clarify. Le parseur ne
    // consomme que le when_hint ISOLÉ du tour (« à 20h30… plus à 19h » ⇒
    // 20:30), jamais le raw_text multi-jetons.
    // Conditions de désarmement (doctrine P9): hour_meridiem_ambiguous garde
    // sa résolution dédiée fail-closed (compléter ici committerait l'heure
    // ambiguë) ; une heure encore ambiguë dans la réponse (1-9 nue) reste au
    // clarify ; rétractation (D2a) et composite explicite (D2b) sont déjà
    // sortis de ce chemin.
    const generalizedFusionReason = pendingCreateClarificationReason(
      args.tempMemory,
    );
    if (
      !compiledPayload.scheduledFor &&
      generalizedFusionReason !== "hour_meridiem_ambiguous"
    ) {
      try {
        const tctxGeneral = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneGeneral = tctxGeneral.user_timezone || "Europe/Paris";
        const turnWhenHint = String(
          canonicalWhenHintFromTurnFrame(args.turnFrame) ?? "",
        ).trim();
        if (
          turnWhenHint &&
          bareAmbiguousHour(turnWhenHint, { includeDigits: true }) === null
        ) {
          const parsedTurn = parseOneShotReminderRequest({
            message: turnWhenHint,
            timezone: timezoneGeneral,
            nowIso: tctxGeneral.now_utc,
          })?.scheduledFor ??
            parseScheduledForFromMessage({
              message: turnWhenHint,
              timezone: timezoneGeneral,
              nowIso: tctxGeneral.now_utc,
            });
          if (
            parsedTurn &&
            new Date(parsedTurn).getTime() > now.getTime() + 30_000
          ) {
            compiledPayload = {
              ...compiledPayload,
              scheduledFor: parsedTurn,
              localLabel: formatOneShotLocalLabel(
                parsedTurn,
                timezoneGeneral,
              ),
            };
          }
        }
        // Repli: l'heure déjà RÉSOLUE au tour initial (UTC_time des slots) —
        // jamais un slot past_time (le gate past_time de l'exécuteur reste).
        if (!compiledPayload.scheduledFor) {
          const storedUtc = String(pendingCreateSlots.UTC_time ?? "").trim();
          if (
            isValidIsoDate(storedUtc) &&
            new Date(storedUtc).getTime() > now.getTime() + 30_000
          ) {
            compiledPayload = {
              ...compiledPayload,
              scheduledFor: storedUtc,
              localLabel: String(pendingCreateSlots.local_label ?? "")
                .trim() ||
                formatOneShotLocalLabel(storedUtc, timezoneGeneral),
            };
          }
        }
      } catch (_error) {
        // best-effort: le clarify existant reste le filet.
      }
    }
    // P12-D2c (nina-p10reval R1-B04): la réponse-option au gate
    // same_instruction_pending est CONSOMMÉE — l'option AJOUTER devient un
    // create assumé du doublon (allow_duplicate), l'option DÉPLACER se lit
    // comme un replace de la cible au même contenu (l'unique pending qui
    // porte cette instruction). Condition de désarmement: une réponse qui ne
    // choisit aucune option ⇒ re-clarify inchangé (fail-closed).
    if (generalizedFusionReason === "same_instruction_pending") {
      const answerNormalized = String(args.message ?? "").normalize("NFD")
        .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ").toLowerCase();
      const addAnswer =
        /\b(ajoute|ajouter|rajoute|rajouter|deuxieme|second|les deux|en plus|garde les deux)\b/
          .test(answerNormalized);
      const moveAnswer = !addAnswer &&
        /\b(deplace|deplacer|remets|remet|decale|repousse|change)\b/
          .test(answerNormalized);
      if (addAnswer) {
        allowDuplicateForTurn = true;
      } else if (moveAnswer) {
        try {
          const storedInstruction = String(
            pendingCreateSlots.instruction_hint ?? "",
          ).trim();
          const pendingsForMove = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          const tctxMove = await getUserTimeContext({
            supabase: args.supabase,
            userId: args.userId,
            now,
          });
          const sameContentRows = storedInstruction
            ? pendingsForMove.filter((row) =>
              instructionTokensOverlap(
                storedInstruction,
                String(
                  (row?.message_payload as
                    | Record<string, unknown>
                    | undefined)?.reminder_instruction ?? "",
                ),
              )
            )
            : [];
          if (sameContentRows.length === 1) {
            const targetHHMMMove = localHHMMForScheduledFor(
              String(sameContentRows[0]?.scheduled_for ?? ""),
              tctxMove.user_timezone || "Europe/Paris",
            );
            if (targetHHMMMove) {
              createEffect = {
                ...createEffect!,
                payload_hint: {
                  ...((createEffect!.payload_hint ?? {}) as Record<
                    string,
                    unknown
                  >),
                  intent: "replace",
                  replace_target_label: targetHHMMMove,
                },
              };
            }
          }
        } catch (_error) {
          // best-effort: le clarify same_instruction re-posé reste le filet.
        }
      }
    }
  }
  const hasExplicitCreateDirectEffect =
    createEffect?.explicitness === "explicit" &&
    createEffect.confidence_band !== "low";
  // P12-D1/D5 (alex-untested24 R1-B02/B03): tour-réponse à un clarify
  // REPLACE (cible ambiguë / payload incomplet) — la réponse FUSIONNE avec
  // les slots du pending (le tour prime) et l'exécution est tentée: l'intent
  // est coercé en replace, la cible se résout par la réponse (contenu nommé
  // d'abord, puis heure qui matche un pending existant ≠ nouvelle heure).
  // Conditions de désarmement (doctrine P9): composite explicite (D2b) et
  // rétractation (D2a) sont déjà sortis ; un message qui porte sa PROPRE
  // demande complète de rappel (acte + objet propre sans rapport avec le
  // pending) se lit à neuf — jamais coercé en replace.
  if (
    pendingClarifyState?.intent === "replace" &&
    !pendingDisarmedByComposite &&
    hasExplicitCreateDirectEffect &&
    ["create", "reschedule", "replace"].includes(
      String(payloadText(createEffect, "intent") ?? "create"),
    )
  ) {
    const slots = pendingClarifyState.known_slots;
    const freshInstruction = extractReminderInstruction(args.message);
    const pendingInstructionHint = String(slots.instruction_hint ?? "").trim();
    const freshUnrelatedRequest = Boolean(
      /\b(rappelle[- ]?moi|mets[- ]?moi un rappel|nouveau rappel)\b/.test(
        String(args.message ?? "").normalize("NFD")
          .replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ")
          .toLowerCase(),
      ) &&
        freshInstruction &&
        !isDegenerateReminderInstruction(freshInstruction) &&
        !isReminderInstructionInvarianceAnaphora(freshInstruction) &&
        (!pendingInstructionHint ||
          !instructionTokensOverlap(pendingInstructionHint, freshInstruction)),
    );
    if (!freshUnrelatedRequest) {
      try {
        const tctxReplaceFusion = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezoneReplaceFusion = tctxReplaceFusion.user_timezone ||
          "Europe/Paris";
        // Heure du NOUVEAU rappel: le tour prime, les slots complètent.
        if (!compiledPayload.scheduledFor) {
          const storedUtc = String(slots.UTC_time ?? "").trim();
          if (
            isValidIsoDate(storedUtc) &&
            new Date(storedUtc).getTime() > now.getTime() + 30_000
          ) {
            compiledPayload = {
              ...compiledPayload,
              scheduledFor: storedUtc,
              localLabel: String(slots.local_label ?? "").trim() ||
                formatOneShotLocalLabel(storedUtc, timezoneReplaceFusion),
            };
          }
        }
        if (!compiledPayload.instruction && pendingInstructionHint) {
          compiledPayload = {
            ...compiledPayload,
            instruction: pendingInstructionHint,
          };
        }
        // Cible: slot stocké, sinon résolution par la RÉPONSE.
        let targetLabel =
          String(slots.replace_target_label ?? "").trim() ||
          payloadText(createEffect, "replace_target_label") ||
          null;
        if (!targetLabel) {
          const pendingsForAnswer = await readPendingOneShotReminderRows({
            supabase: args.supabase,
            userId: args.userId,
          });
          // 1. Contenu nommé dans la réponse (« celui des étirements »).
          const contentMatches = pendingsForAnswer
            .map((row) => ({
              row,
              score: messageContentOverlapScore(
                args.message,
                String(
                  (row?.message_payload as
                    | Record<string, unknown>
                    | undefined)?.reminder_instruction ?? "",
                ),
              ),
            }))
            .filter((entry) => entry.score > 0);
          let targetRow = contentMatches.length === 1
            ? contentMatches[0].row
            : null;
          // 2. Heure de DÉSIGNATION: elle doit matcher un pending existant
          // et différer de la nouvelle heure (sinon c'est la nouvelle heure
          // ré-énoncée).
          if (!targetRow) {
            const answerHHMM = extractTargetHHMMFromMessage(args.message);
            const newHHMM = compiledPayload.scheduledFor
              ? localHHMMForScheduledFor(
                compiledPayload.scheduledFor,
                timezoneReplaceFusion,
              )
              : null;
            if (answerHHMM && answerHHMM !== newHHMM) {
              targetRow = pendingsForAnswer.find((row) =>
                localHHMMForScheduledFor(
                  String(row?.scheduled_for ?? ""),
                  timezoneReplaceFusion,
                ) === answerHHMM
              ) ?? null;
            }
          }
          if (targetRow) {
            targetLabel = localHHMMForScheduledFor(
              String(targetRow.scheduled_for ?? ""),
              timezoneReplaceFusion,
            );
          }
        }
        createEffect = {
          ...createEffect!,
          payload_hint: {
            ...((createEffect!.payload_hint ?? {}) as Record<string, unknown>),
            intent: "replace",
            ...(targetLabel ? { replace_target_label: targetLabel } : {}),
          },
        };
      } catch (_error) {
        // best-effort: le clarify replace re-posé reste le filet.
      }
    }
  }
  // P4-B (alex-global19 R1-B02): « annule X et remets-en un à Yh » émis en
  // UN SEUL effect intent="cancel" avec le when_hint de l'ANCIEN horaire —
  // seul le cancel partait et l'utilisateur restait sans aucun rappel.
  // Reclassification déterministe: un cancel dont le raw_text porte un
  // verbe de re-création suivi d'un horaire PARSEABLE différent de la cible
  // du cancel est un REPLACE. Le segment APRÈS le verbe isole le NOUVEL
  // horaire (leçon P3-B: ne jamais parser un texte à deux heures en entier).
  // P12-D2b (alex-untested24 R1-B04): sous clarify actif, le composite
  // explicite arrive souvent ré-émis en intent=create (avec le when_hint de
  // l'ANCIEN horaire) — la même reclassification s'applique: le pending est
  // désarmé, la phrase se lit à neuf comme un replace.
  if (
    hasExplicitCreateDirectEffect &&
    (payloadText(createEffect, "intent") === "cancel" ||
      (pendingDisarmedByComposite &&
        String(payloadText(createEffect, "intent") ?? "create") === "create"))
  ) {
    // P12-D2b: sur le composite ré-énoncé sous clarify, le MESSAGE user est
    // la source de vérité (le raw_text ré-émis peut agréger le tour initial).
    const rawText = pendingDisarmedByComposite &&
        String(args.message ?? "").trim()
      ? args.message
      : canonicalRawTextFromTurnFrame(args.turnFrame) ?? args.message;
    // P12-V (harness S2 T4): « annule ce rappel, et METS-M'EN un nouveau à
    // 23h » — la forme « mets-m'en / mets-moi un nouveau » manquait à la
    // liste de re-création: le composite retombait sur le gate
    // same_instruction au lieu du replace explicite (le consentement au
    // cancel est DANS le message). Bornée au contexte cancel/composite de
    // cette branche — « mets-moi un rappel » nu reste un create.
    const recreateMatch = rawText.match(
      /\b(remets|remet|recr[ée]e|reprogramme|replanifie|repose|mets[-\s]?m['’]en|mets[-\s]?moi)\b/i,
    );
    if (recreateMatch && typeof recreateMatch.index === "number") {
      const segment = rawText.slice(recreateMatch.index);
      try {
        const tctxReclass = await getUserTimeContext({
          supabase: args.supabase,
          userId: args.userId,
          now,
        });
        const timezone = tctxReclass.user_timezone || "Europe/Paris";
        const parsedSegment = parseOneShotReminderRequest({
          message: segment,
          timezone,
          nowIso: tctxReclass.now_utc,
        });
        // P12-D2b: le segment elliptique (« remets-le à 20h30 ») ne porte
        // pas d'instruction — parseOneShotReminderRequest y est muet par
        // construction; le fallback scheduled_for-seul rend la
        // reclassification opérante (même leçon que P12-A sur les hints).
        const segmentScheduledFor = parsedSegment?.scheduledFor ??
          parseScheduledForFromMessage({
            message: segment,
            timezone,
            nowIso: tctxReclass.now_utc,
          });
        const newHHMM = segmentScheduledFor
          ? localHHMMForScheduledFor(segmentScheduledFor, timezone)
          : null;
        const cancelTargetHHMM = extractTargetHHMMFromMessage(
          [
            payloadText(createEffect, "replace_target_label") ?? "",
            payloadText(createEffect, "when_hint") ?? "",
            rawText.slice(0, recreateMatch.index),
          ].filter(Boolean).join(" "),
        );
        if (newHHMM && newHHMM !== cancelTargetHHMM) {
          createEffect = {
            ...createEffect!,
            payload_hint: {
              ...((createEffect!.payload_hint ?? {}) as Record<
                string,
                unknown
              >),
              intent: "replace",
              replace_target_label:
                payloadText(createEffect, "replace_target_label") ??
                  payloadText(createEffect, "when_hint") ??
                  rawText.slice(0, recreateMatch.index),
              when_hint: segment,
            },
          };
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: String(segmentScheduledFor),
            localLabel: formatOneShotLocalLabel(
              String(segmentScheduledFor),
              timezone,
            ),
            instruction: compiledPayload.instruction ??
              parsedSegment?.reminderInstruction ?? null,
          };
        }
      } catch (_error) {
        // best-effort: le chemin cancel historique reste le fallback.
      }
    }
  }
  // Complétion structurelle (harness S2 T4): le dispatcher émet parfois un
  // create/replace explicite avec un moment exploitable dans les champs
  // structurés (raw_text/when_hint: « un nouveau à 23h ») mais UTC_time vide.
  // On résout l'heure avec le parseur déterministe existant (ancré horloge
  // client, timezone profil) au lieu de déclarer le payload incomplet — le
  // trou faisait dégénérer un replace en clarify puis en create nu (doublon).
  // Une expression ambiguë (« vers la fin de soirée ») reste irrésolue → même
  // clarify qu'avant, aucune devinette.
  // Complétion réservée aux intents à cible explicite (replace) ou sans
  // risque de doublon (reschedule dégradé quand ZÉRO pending): sur un create
  // NU, l'absence d'UTC_time sert de barriere aux sur-emissions du dispatcher
  // (ex. reschedule emis en create nu avec instruction anaphorique « ce qu'il
  // désigne ») — la completer recree le doublon d'eva-g16 B01 (run12 S2 T3).
  // Un texte de replace porte souvent DEUX heures (« annule celui de 19h et
  // remets-le demain à 20h ») et le parseur y gagne la MAUVAISE (leçon P3-B,
  // vérifié: 19h sort du texte entier). Le segment après le verbe de
  // re-création isole le NOUVEL horaire — même isolation que la
  // reclassification cancel→replace ci-dessus.
  const isolateRecreateSegment = (text: string): string => {
    const match = text.match(
      /\b(remets|remet|mets|recr[ée]e|reprogramme|replanifie|repose|repousse|d[ée]cale)\b/i,
    );
    return match && typeof match.index === "number"
      ? text.slice(match.index)
      : text;
  };
  const completeMissingPayloadTime = async (): Promise<void> => {
    if (compiledPayload.scheduledFor) return;
    try {
      const tctxFill = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      // Champs structurés émis par le dispatcher (payload raw_text /
      // when_hint) d'abord (frontière G1/C3: le payload structuré est
      // canonique). P6-V (probe P6-1 passe 4): quand l'émission perd TOUS les
      // champs temporels sur un REPLACE, le message user reste la seule
      // source du créneau explicite (« remets-le demain à 20h ») — le
      // fallback message est borné à ce cas (intent replace déjà émis par le
      // dispatcher, jamais un create nu: l'anti-doublon d'eva-g16 B01 tient).
      const payloadRawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
        "";
      const whenHint = payloadText(createEffect, "when_hint") ?? "";
      const candidates = [
        [payloadRawText, whenHint].filter(Boolean).join(" "),
        args.message,
      ].map((text) => isolateRecreateSegment(text).trim()).filter(Boolean);
      // L'heure de la CIBLE du replace ne peut jamais devenir l'heure du
      // nouveau rappel via complétion: si le parseur la retrouve quand même
      // (segment sans verbe, texte à deux heures), on rejette → clarify.
      const targetHHMM = extractTargetHHMMFromMessage(
        payloadText(createEffect, "replace_target_label") ?? "",
      );
      for (const parseText of candidates) {
        const parsed = parseOneShotReminderRequest({
          message: parseText,
          timezone: tctxFill.user_timezone,
          nowIso: tctxFill.now_utc,
        });
        const scheduledForFill = parsed?.scheduledFor ??
          parseScheduledForFromMessage({
            message: parseText,
            timezone: tctxFill.user_timezone,
            nowIso: tctxFill.now_utc,
          });
        if (!scheduledForFill) continue;
        if (
          targetHHMM &&
          localHHMMForScheduledFor(scheduledForFill, tctxFill.user_timezone) ===
            targetHHMM
        ) {
          continue;
        }
        const parsedInstruction = String(parsed?.reminderInstruction ?? "")
          .trim();
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: scheduledForFill,
          localLabel: compiledPayload.localLabel ??
            formatOneShotLocalLabel(
              scheduledForFill,
              tctxFill.user_timezone,
            ),
          // Une instruction anaphorique (« même chose ») ou dégénérée reste
          // vide ici: l'héritage P3-F/P6-A du replace la résout depuis le
          // pending ciblé, jamais depuis la clause temporelle.
          instruction: compiledPayload.instruction ??
            (parsedInstruction &&
                !isDegenerateReminderInstruction(parsedInstruction) &&
                !isReminderInstructionInvarianceAnaphora(parsedInstruction)
              ? parsedInstruction
              : null),
        };
        return;
      }
    } catch (_error) {
      // best-effort: le chemin clarify existant reste le fallback.
    }
  };
  if (
    hasExplicitCreateDirectEffect &&
    payloadText(createEffect, "intent") === "replace"
  ) {
    await completeMissingPayloadTime();
  }
  // P8-D (nina-hard23 R1-B01): une ANAPHORE DE STYLE (« pareil qu'avant »,
  // « comme d'hab », « même style ») co-présente avec une heure ABSOLUE
  // explicite faisait perdre le créneau — le dispatcher laissait UTC_time
  // vide (l'anaphore lue comme référence à l'heure d'un rappel antérieur) et
  // le create nu dégénérait en clarify missing_time alors que « à 21h » était
  // dans le message. Complétion BORNÉE du create nu, trois verrous cumulés:
  // (1) instruction propre déjà présente (jamais une anaphore/clause
  // dégénérée — le doublon d'eva-g16 B01 portait une instruction
  // anaphorique), (2) AUCUN marqueur de reschedule/replace dans le texte
  // (la barrière anti-sur-émission du create nu tient), (3) heure absolue
  // NON ambiguë (la ceinture méridiem garde les heures nues 1-9; « matin/
  // midi/soir » ou minutes explicites lèvent l'ambiguïté). Invariant: une
  // heure absolue explicite présente ⇒ jamais missing_time.
  if (
    hasExplicitCreateDirectEffect &&
    !compiledPayload.scheduledFor &&
    String(payloadText(createEffect, "intent") ?? "create") === "create" &&
    compiledPayload.instruction &&
    !isDegenerateReminderInstruction(compiledPayload.instruction) &&
    !isReminderInstructionInvarianceAnaphora(compiledPayload.instruction)
  ) {
    const timeSourceText = [
      canonicalRawTextFromTurnFrame(args.turnFrame) ?? "",
      payloadText(createEffect, "when_hint") ?? "",
      args.message,
    ].join(" ");
    const normalizedTimeSource = timeSourceText
      .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const hasRescheduleMarker =
      /\b(remets|remet|decale|repousse|replanifie|reprogramme)\b|\bau lieu de\b|\b(mets|passe)[- ](le|la)\b|\bplutot\b/
        .test(normalizedTimeSource);
    const hasUnambiguousExplicitHour =
      bareAmbiguousHour(timeSourceText, { includeDigits: true }) === null &&
      /\b\d{1,2}\s*h(?:\d{2})?\b|\b(matin|midi|soir)\b/.test(
        normalizedTimeSource,
      );
    // Verrou (0) — harness r5g-s4 T2 (régression attrapée en validation P8):
    // la barrière UTC_time-vide protège AUSSI contre les sur-émissions sur
    // INTENTION FUTURE sans demande (« que je puisse tester demain vers
    // 18h ») — la complétion ne s'applique que si le MESSAGE user porte un
    // ACTE DE RAPPEL explicite (le cas nina: « mets-moi un RAPPEL à 21h,
    // pareil qu'avant »). Sans acte, le clarify/zéro-write reste la réponse.
    const hasExplicitReminderAct =
      /\b(rappels?|rappelles?|rappeler|previens|prevenir|notifications?|notifs?|alarmes?|alertes?)\b/
        .test(
          String(args.message ?? "")
            .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
        );
    if (
      hasExplicitReminderAct && !hasRescheduleMarker &&
      hasUnambiguousExplicitHour
    ) {
      await completeMissingPayloadTime();
    }
  }
  // P3-B (paul-untested16 T12, rose-hard15 T11 — généralise RMR-B01): le
  // temps du payload est DÉTERMINISTE. L'UTC_time LLM dérive (« demain à
  // 19h » à 02h49 → aujourd'hui, les deux dates étant futures donc jamais
  // rattrapées par past_time) ; la résolution du parseur, ancrée sur
  // l'horloge client + timezone profil, PRIME dès qu'elle diverge. Couches:
  // 1. « demain »-famille explicite + parseur résout → parseur, point.
  // 2. « demain »-famille explicite + parseur muet (« demain matin » sans
  //    heure) → l'HEURE du LLM est gardée, le JOUR est forcé à J+1 local.
  // 3. Sans jour explicite: parseur et LLM tous deux FUTURS et divergents →
  //    parseur ; parseur futur mais LLM passé → on garde le passé (clarify
  //    past_time, décision V2-A: le bump d'une heure nue passée est ambigu).
  if (
    hasExplicitCreateDirectEffect && compiledPayload.scheduledFor &&
    payloadText(createEffect, "intent") !== "cancel" &&
    // P7-C: la fusion méridiem est canonique pour le tour — le when_hint
    // ré-émis (« demain à 7 heures ») re-résoudrait 07:00 et l'écraserait.
    !meridiemFusionApplied
  ) {
    try {
      const tctxTime = await getUserTimeContext({
        supabase: args.supabase,
        userId: args.userId,
        now,
      });
      const timezone = tctxTime.user_timezone || "Europe/Paris";
      const payloadRawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
        "";
      const whenHint = payloadText(createEffect, "when_hint") ?? "";
      // Le when_hint ISOLE l'expression temporelle pertinente — parser le
      // raw_text complet d'un replace (« annule celui de 14h et recrée-le à
      // 15h ») fait gagner la MAUVAISE heure au parseur (probe P3-6). Le
      // hint de jour (« demain ») peut vivre dans raw_text seul: on le
      // préfixe alors au when_hint pour que le parseur résolve le bon jour.
      // P6-V (probe P6-1 passe 4): when_hint VIDE sur un replace/reschedule →
      // même trap deux-heures sur le raw_text entier — le segment après le
      // verbe de re-création isole le nouvel horaire.
      const fullText = [payloadRawText, whenHint].filter(Boolean).join(" ");
      // P12-A: les détections de JOUR (demain-famille, marqueur nocturne)
      // lisent le scope temporel — jamais les jetons de date du contenu.
      const temporalScope = temporalScopeText(
        fullText,
        canonicalInstructionHintFromTurnFrame(args.turnFrame) ??
          compiledPayload.instruction,
      );
      const effectIntent = String(payloadText(createEffect, "intent") ?? "");
      let parseText = whenHint.trim() ||
        (effectIntent === "replace" || effectIntent === "reschedule"
          ? isolateRecreateSegment(payloadRawText)
          : payloadRawText);
      if (
        whenHint.trim() && hasExplicitFutureDayHint(temporalScope) &&
        !hasExplicitFutureDayHint(whenHint)
      ) {
        const dayToken = /apr[eè]s[- ]demain/i.test(temporalScope)
          ? "après-demain"
          : "demain";
        parseText = `${dayToken} ${whenHint}`;
      }
      const parsed = parseText.trim()
        ? parseOneShotReminderRequest({
          message: parseText,
          timezone,
          nowIso: tctxTime.now_utc,
        })
        : null;
      // P12-A (nina-p10reval R1-B02): un when_hint isolé ne porte pas
      // d'instruction — parseOneShotReminderRequest y était MUET par
      // construction et aucune couche ne réparait l'UTC LLM faux d'un item
      // de fan-out. Le fallback scheduled_for-seul rend les couches
      // opérantes sur les hints isolés.
      const parsedScheduledFor = parsed?.scheduledFor ??
        (parseText.trim()
          ? parseScheduledForFromMessage({
            message: parseText,
            timezone,
            nowIso: tctxTime.now_utc,
          })
          : null);
      const llmMs = new Date(compiledPayload.scheduledFor).getTime();
      const parsedMs = parsedScheduledFor
        ? new Date(parsedScheduledFor).getTime()
        : Number.NaN;
      const explicitFutureDay = hasExplicitFutureDayHint(temporalScope);
      const localDayUtc = (iso: string) =>
        Date.parse(
          `${
            new Intl.DateTimeFormat("en-CA", {
              timeZone: timezone,
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(new Date(iso))
          }T00:00:00Z`,
        );
      if (explicitFutureDay && Number.isFinite(parsedMs)) {
        // Couche 1: le parseur possède la famille « demain ».
        if (Math.abs(parsedMs - llmMs) > 60_000) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: String(parsedScheduledFor),
            parseSource: "local_parser",
          };
        }
      } else if (explicitFutureDay && Number.isFinite(llmMs)) {
        // Couche 2: « demain » explicite mais parseur muet — le JOUR du LLM
        // ne peut pas être ≤ aujourd'hui: décale en jours civils locaux
        // jusqu'à J+1 (heure locale préservée).
        const tomorrowDayUtc = localDayUtc(tctxTime.now_utc) + 86_400_000;
        let repairedMs = llmMs;
        while (localDayUtc(new Date(repairedMs).toISOString()) < tomorrowDayUtc) {
          repairedMs += 86_400_000;
        }
        if (repairedMs !== llmMs) {
          compiledPayload = {
            ...compiledPayload,
            scheduledFor: new Date(repairedMs).toISOString(),
            parseSource: "local_parser",
          };
        }
      } else if (
        Number.isFinite(parsedMs) && Number.isFinite(llmMs) &&
        llmMs > now.getTime() + 30_000 &&
        parsedMs > now.getTime() + 30_000 &&
        Math.abs(parsedMs - llmMs) > 60_000 &&
        // P12-A: la couche 3 exige que le parseur POSSÈDE son ancre — un jour
        // explicite dans le texte parsé (jour nommé, demain, ce soir…), un
        // relatif (« dans 2h »), ou une simple dérive d'HORAIRE (même jour
        // civil des deux côtés). Sans possession, un when_hint nu (« à
        // 18h ») résolu aujourd'hui n'écrase pas un jour LLM légitimement
        // ancré ailleurs dans le message.
        (hasAnyExplicitDayToken(parseText) ||
          /\bdans\s+(une?|\d{1,3})\s*(h(eures?)?|minutes?|quart)\b/.test(
            parseText.normalize("NFD").replace(/\p{Diacritic}/gu, "")
              .toLowerCase(),
          ) ||
          localDayUtc(new Date(parsedMs).toISOString()) ===
            localDayUtc(new Date(llmMs).toISOString()))
      ) {
        // Couche 3: deux résolutions futures qui divergent (heure relative,
        // dérive d'arithmétique, jour nommé mal résolu par le LLM) → le
        // déterministe gagne.
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: String(parsedScheduledFor),
          parseSource: "local_parser",
        };
      } else if (
        Number.isFinite(parsedMs) && Number.isFinite(llmMs) &&
        llmMs <= now.getTime() + 30_000 &&
        parsedMs > now.getTime() + 30_000 &&
        hasNocturnalOrMeridiemForwardMarker(temporalScope)
      ) {
        // Couche 4 — P10-A (nina-hard24 R1-B01, T4/T5): EXCEPTION bornée à
        // la décision V2-A (« LLM passé → on garde le passé »). Cette
        // décision visait l'heure NUE ambiguë ; « cette nuit à 2h du
        // matin » dit à 22h porte un marqueur nocturne/méridiem EXPLICITE:
        // la prochaine occurrence (le glissement du parseur au lendemain)
        // n'est pas un bump ambigu, c'est le sens demandé. Sans cette
        // couche, un rappel bénin parfaitement spécifié était non-créable
        // en langage naturel (past_time → cul-de-sac → seule la date de
        // calendrier absolue passait). L'heure nue passée SANS marqueur
        // garde le clarify past_time (anti-FP V2-A intact).
        compiledPayload = {
          ...compiledPayload,
          scheduledFor: String(parsedScheduledFor),
          parseSource: "local_parser",
        };
      }
    } catch (_error) {
      // best-effort: le clarify past_time existant reste le filet.
    }
  }
  const effectType: OneShotReminderDirectEffectTool =
    "create_one_shot_reminder";
  if (!hasExplicitCreateDirectEffect) {
    return baseDirectEffectResult({
      detected: false,
      intent: "off_topic",
      status: "ignored",
      reason_code: "missing_explicit_direct_effect",
    });
  }
  if (args.noMutationRequested) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "blocked",
        reason_code: "no_mutation_requested",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "no_mutation_requested",
      }],
    };
  }
  // P8-V (harness r5g-s2 T3, validation P8): le dispatcher émet parfois le
  // « mets-LE plutôt à 23h » en create NU (intent vide) malgré la RÈGLE DU
  // PRONOM du contrat — le create committait un DOUBLON (l'ancien pending
  // restait, « c'est décalé » mensonger). Le discriminant grammatical P6-V
  // (impératif + clitique à TRAIT D'UNION) est déterministe et désigne
  // toujours un rappel EXISTANT: le create nu est coercé en reschedule — le
  // chemin P6-H reprend la main (replace atomique sur cible unique, blocage
  // honnête sinon, dégradation P0-4 à zéro pending). Le re-serve d'un
  // différé de crise est exempté (son « remets-le » vise le différé, pas un
  // pending à déplacer).
  if (
    String(payloadText(createEffect, "intent") ?? "create") === "create" &&
    ((args.tempMemory as Record<string, unknown> | null | undefined)
        ?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
          | Record<string, unknown>
          | undefined)?.mode !== "deferred" &&
    // Un clarify CREATE en vol exempte aussi (probe P8-5 passe 9): le
    // « remets-le » du tour-réponse vise le create en cours de clarification,
    // jamais un AUTRE pending à déplacer — coercer ici re-ciblait le mauvais
    // rappel (le kiné) via P6-H.
    !pendingCreateClarificationKnownSlots(args.tempMemory) &&
    hasRescheduleCliticAnaphor(
      `${args.message} ${canonicalRawTextFromTurnFrame(args.turnFrame) ?? ""}`,
    )
  ) {
    createEffect = {
      ...createEffect!,
      payload_hint: {
        ...((createEffect!.payload_hint ?? {}) as Record<string, unknown>),
        intent: "reschedule",
      },
    };
  }
  {
    const intentState: Parameters<typeof runRescheduleIntent>[1] = {
      createEffect,
      compiledPayload,
      allowDuplicateForTurn,
      now,
      additiveMarker,
      effectType,
      completeMissingPayloadTime: async (current) => {
        createEffect = current.createEffect;
        compiledPayload = current.compiledPayload;
        await completeMissingPayloadTime();
        return compiledPayload;
      },
    };
    const intentResult = await runRescheduleIntent(args, intentState);
    if (intentResult) return intentResult;
    ({ createEffect, compiledPayload, allowDuplicateForTurn } = intentState);
  }
  {
    const intentResult = await runStatusIntent(args, { createEffect, now });
    if (intentResult) return intentResult;
  }
  // Replace explicite (eva-g16 B01) : « annule-le et remets-le a 23h » est la
  // composition de deux operations chat SUPPORTEES (cancel + create),
  // executee en un tour. Distinct du reschedule implicite (« mets-le plutot a
  // 23h »), qui reste bloque-honnete (arbitrage V1: pas d'edition en place).
  // Regle de securite anti-doublon: le create ne part QUE si le cancel a
  // reussi, ou s'il n'y avait rien a annuler. Cible du cancel = payload
  // replace_target_label (heure locale de l'ANCIEN rappel) sinon le pending
  // unique; plusieurs pendings sans cible → clarify, zero write.
  let replaceCancelCommitted:
    | OneShotReminderCommittedEffect[]
    | null = null;
  let replaceCancelledLabel: string | null = null;
  // P12-D3/D4: le replace a perdu le droit de CANCEL ce tour (marqueur
  // additif explicite, ou entité à jour nommé sans pending ce jour-là) —
  // create assumé, rendu « c'est un ajout » au lieu de « rien trouvé ».
  let replaceCancelForbidden = false;
  // Garde structurelle anti-variance (round6 S2): un intent='cancel' qui
  // porte un payload de creation COMPLET (UTC_time + local_label +
  // instruction) est contradictoire — le contrat dit qu'un cancel pur ne
  // remplit jamais ces champs. Deux lectures possibles (replace mal etiquete,
  // ou cancel sur-rempli): on ne DEVINE pas, on clarifie — zero write, et le
  // tour suivant re-arme l'effet complet (3g). Executer un replace ici
  // creerait un rappel fantome si c'etait un cancel sur-rempli (cf. test F4).
  // Coherence d'heure entre deux champs DISPATCHER (payload-quality, comme
  // looksTemporalLabel): un vrai « nouveau rappel » a un local_label dont
  // l'heure se retrouve dans when_hint; un cancel pur sur-rempli garde un
  // local_label residuel incoherent avec sa cible — il reste un cancel.
  const newTimeIsCoherent = (() => {
    const label = String(compiledPayload.localLabel ?? "");
    const hint = String(canonicalWhenHintFromTurnFrame(args.turnFrame) ?? "")
      .toLowerCase();
    const hourMatch = label.match(/(\d{1,2})/);
    if (!hourMatch || !hint) return false;
    const hour = String(Number(hourMatch[1]));
    return new RegExp(`(^|\\D)0?${hour}\\s*(h|:|heure)`).test(hint);
  })();
  const cancelCarriesFullCreatePayload =
    payloadText(createEffect, "intent") === "cancel" &&
    newTimeIsCoherent &&
    Boolean(
      compiledPayload.scheduledFor && compiledPayload.localLabel &&
        compiledPayload.instruction,
    );
  if (cancelCarriesFullCreatePayload) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "cancel",
        status: "needs_clarify",
        reason_code: "cancel_or_replace_ambiguous",
        reply:
          `Je veux être sûre de bien faire : tu veux annuler le rappel existant ET en poser un nouveau (${compiledPayload.localLabel} — ${compiledPayload.instruction}) ? Dis-moi oui et je fais les deux, ou précise si tu veux seulement annuler.`,
      }),
      requested_effects: [{ type: effectType, reason_code: "cancel" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "cancel_or_replace_ambiguous",
      }],
    };
  }
  {
    const intentState: Parameters<typeof runReplaceIntent>[1] = {
      createEffect,
      compiledPayload,
      allowDuplicateForTurn,
      replaceCancelCommitted,
      replaceCancelledLabel,
      replaceCancelForbidden,
      now,
      additiveMarker,
      effectType,
    };
    const intentResult = await runReplaceIntent(args, intentState);
    if (intentResult) return intentResult;
    ({
      createEffect,
      compiledPayload,
      allowDuplicateForTurn,
      replaceCancelCommitted,
      replaceCancelledLabel,
      replaceCancelForbidden,
    } = intentState);
  }
  {
    const intentResult = await runCancelIntent(args, {
      createEffect,
      cancelCarriesFullCreatePayload,
      now,
    });
    if (intentResult) return intentResult;
  }
  return await runCreateIntent(args, {
    compiledPayload,
    createEffect,
    allowDuplicateForTurn,
    replaceCancelCommitted,
    replaceCancelledLabel,
    replaceCancelForbidden,
    effectType,
    pendingCreateSlots,
    now,
  });
}
