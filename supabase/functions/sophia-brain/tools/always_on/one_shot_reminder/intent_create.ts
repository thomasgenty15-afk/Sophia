// ═══════════════════════════════════════════════════════════════════════════
// L'INTENTION « CREATE » : POSER UN RAPPEL PONCTUEL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `router.ts` (découpage des gros fichiers,
// lot 5b). Le bloc est le texte d'origine, à l'indentation d'origine ; seules
// la signature, les lignes qui lisent l'état au début et celles qui le
// rendent à la fin sont nouvelles. Ce module n'importe jamais `router.ts`.
//
// La fin de la lane : tout ce qui n'a pas répondu avant arrive ici (création
// simple, ou la création qui suit l'annulation d'un « replace »). Rend
// toujours un résultat.

import type { OneShotReminderDirectEffectResult } from "./contract.ts";
import type {
  OneShotReminderIntentState,
  OneShotReminderLaneArgs,
} from "./intent_state.ts";
import {
  extractQuotedReminderInstruction,
  isDegenerateReminderInstruction,
  isReminderInstructionInvarianceAnaphora,
} from "./instruction_parser.ts";
import { maybeCreateOneShotReminderFromStructuredEffect } from "./executor.ts";
import { SAFETY_DEFERRED_REMINDER_RUNTIME_KEY } from "./clarification_state.ts";
import {
  bareAmbiguousHour,
  oneShotReminderDraftRequested,
} from "./text_signals.ts";
import {
  baseDirectEffectResult,
  canonicalRawTextFromTurnFrame,
  canonicalWhenHintFromTurnFrame,
  committedCreateEffects,
  createReminderSuccessReply,
  payloadText,
  recurringNotSupportedDirectEffectResult,
  uniqueToolsFromCommitted,
} from "./payload_compile.ts";

export async function runCreateIntent(
  args: OneShotReminderLaneArgs,
  st: Pick<
    OneShotReminderIntentState,
    "compiledPayload"
    | "createEffect"
    | "allowDuplicateForTurn"
    | "replaceCancelCommitted"
    | "replaceCancelledLabel"
    | "replaceCancelForbidden"
    | "effectType"
    | "pendingCreateSlots"
    | "now"
  >,
): Promise<OneShotReminderDirectEffectResult> {
  let { compiledPayload } = st;
  const {
    createEffect,
    allowDuplicateForTurn,
    replaceCancelCommitted,
    replaceCancelledLabel,
    replaceCancelForbidden,
    effectType,
    pendingCreateSlots,
    now,
  } = st;
  // Ceinture structurelle cardinalite: la doctrine interdit d'emettre un
  // one-shot pour une demande recurrente, mais quand le LLM desobeit le
  // payload porte cardinality="recurring" et on bloque ici au lieu de creer
  // un faux ponctuel (multiflow T13: recurrent committe silencieusement).
  if (payloadText(createEffect, "cardinality") === "recurring") {
    return recurringNotSupportedDirectEffectResult(effectType);
  }
  // P8-B (eva-hard23 T6/T7, probes P8-3 passes 1-2): ARTEFACT COACHING ≠
  // RAPPEL — la doctrine dispatcher n'a PAS tenu en live (2 passes sur 2: un
  // create armé en substitut d'une demande de potion, « prépare-moi une
  // potion pour 22h » lu comme un acte de rappel). Gate déterministe: un
  // create NU dont le payload mentionne un artefact coaching (potion/carte)
  // alors que le MESSAGE user ne porte AUCUN acte de rappel → blocked
  // honnête, zéro write. Anti-FP: « rappelle-moi de faire ma potion » porte
  // l'acte → passe; un tour-réponse à un clarify (pending) est exempté (le
  // user complète un rappel déjà légitime).
  if (
    replaceCancelCommitted === null &&
    String(payloadText(createEffect, "intent") ?? "create") === "create" &&
    !pendingCreateSlots &&
    // Le re-serve d'un différé de crise a son propre consentement
    // (asksOrAccepts plus haut) — jamais re-gaté ici.
    ((args.tempMemory as Record<string, unknown> | null | undefined)
        ?.[SAFETY_DEFERRED_REMINDER_RUNTIME_KEY] as
          | Record<string, unknown>
          | undefined)?.mode !== "deferred"
  ) {
    const messageNormalized = String(args.message ?? "")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    // P8-B (probe P8-3 passe 4): le chemin LOCAL (direct_effect_request du
    // flow coaching) émet un payload qui ne nomme pas toujours l'artefact —
    // le MESSAGE USER, lui, le nomme toujours dans les cas observés. La
    // détection lit payload ET message; l'acte de rappel dans le message
    // reste le seul désarmeur.
    const artifactSource = [
      compiledPayload.instruction ?? "",
      compiledPayload.rawText ?? "",
      messageNormalized,
    ].join(" ").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const mentionsCoachingArtifact = /\b(potions?|cartes?)\b/.test(
      artifactSource,
    );
    const hasReminderAct =
      /\b(rappels?|rappelles?|rappeler|previens|prevenir|notifications?|notifs?|alarmes?|alertes?|sonne(rie)?|programme[sr]?|planifie)\b/
        .test(messageNormalized);
    if (mentionsCoachingArtifact && !hasReminderAct) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "blocked",
          reason_code: "coaching_artifact_not_reminder",
          reply:
            "Je n'ai pas posé de rappel — une potion, ça se prépare ici en conversation et ça s'active dans l'app (Dashboard > Ressources), rien ne se « garde » depuis le chat. Si tu veux en plus un rappel à heure fixe, dis-le-moi explicitement.",
        }),
        requested_effects: [{ type: effectType, reason_code: "create" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "coaching_artifact_not_reminder",
        }],
      };
    }
  }
  // P4-D (eva-global19 R1-B03): CEINTURE heure nue ambiguë — « à huit
  // heures » / « à 8h » sans marqueur matin/soir se committait à 08:00 sur
  // une action du soir (mauvaise branche, corrigée par le user au tour
  // suivant). La règle prompt (UTC_time vide) ne tient pas toujours: le
  // runtime clarifie le créneau AVANT tout write. Ne s'applique qu'au
  // create NU (jamais au replace: l'ancre du rappel remplacé fait foi).
  if (replaceCancelCommitted === null) {
    // La détection lit le MESSAGE USER verbatim — le dispatcher normalise
    // parfois « huit heures » en « 08:00 » jusque dans raw_text (probe P4-8
    // passe 4), ce qui efface l'ambiguïté que la ceinture doit attraper.
    // L'ambiguïté vit dans les mots du user, pas dans leur normalisation.
    // P5-D (eva-p4verify R1-B01): le fallback raw_text ne s'applique QUE si
    // le message user est indisponible — sur le TOUR-RÉPONSE au clarify
    // (« le soir, 20h »), le raw_text agrège encore « huit heures » du tour
    // initial et re-bloquait un créneau pourtant résolu (message
    // auto-contradictoire + zéro write).
    const ambiguousHour = String(args.message ?? "").trim()
      ? bareAmbiguousHour(args.message)
      : bareAmbiguousHour(canonicalRawTextFromTurnFrame(args.turnFrame) ?? "");
    if (ambiguousHour !== null) {
      const clarifyReply =
        `Juste pour être sûre du créneau : ${ambiguousHour}h du matin, ou ${
          ambiguousHour + 12
        }h ? Je programme dès que tu me dis.`;
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "needs_clarify",
          reason_code: "hour_meridiem_ambiguous",
          reply: clarifyReply,
        }),
        requested_effects: [{ type: effectType, reason_code: "create" }],
        blocked_effects: [{
          type: effectType,
          reason_code: "hour_meridiem_ambiguous",
        }],
        missing_slots: ["scheduled_for"],
        // P5-D: les slots déjà fournis (instruction, texte d'origine) se
        // persistent pour que le tour-réponse complète CE create — sans ça,
        // le commit reprenait la phrase de désambiguïsation comme texte du
        // rappel (« le soir. pas le matin »).
        pending_clarification: {
          intent: "create",
          reason_code: "hour_meridiem_ambiguous",
          clarify_question: clarifyReply,
          known_slots: {
            instruction_hint: compiledPayload.instruction ?? null,
            raw_text: compiledPayload.rawText ?? args.message,
            when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
          },
        },
      };
    }
  }
  // P6-A (paul-hard21 R1-B04, aval): récupération HAUTE PRÉCISION du libellé
  // depuis les messages user récents quand le tour courant ne porte que le
  // créneau — uniquement les formes sans ambiguïté (guillemets, « texte
  // exact: … »), jamais les patterns lâches (une instruction périmée
  // committée en durable serait pire que le clarify). Le fix AMONT est la
  // doctrine d'émission du brouillon (le dispatcher émet, la lane persiste).
  if (!compiledPayload.instruction && (args.contextMessages ?? []).length > 0) {
    for (const contextMessage of args.contextMessages ?? []) {
      const quoted = extractQuotedReminderInstruction(String(contextMessage));
      if (quoted && !isDegenerateReminderInstruction(quoted)) {
        compiledPayload = { ...compiledPayload, instruction: quoted };
        break;
      }
    }
  }
  const missingPayloadSlots: OneShotReminderDirectEffectResult["missing_slots"] =
    [];
  if (!compiledPayload.scheduledFor || !compiledPayload.localLabel) {
    missingPayloadSlots.push("scheduled_for");
  }
  // P8-B (eva-hard23 T7, probe P8-3 passe 1): sur un create NU, une
  // instruction DÉGÉNÉRÉE ou anaphorique (« la retrouver » — clitique + verbe
  // sans objet propre) ne se committe JAMAIS telle quelle: le référent vit
  // dans la conversation (ici une potion jamais créée), l'écrire fabrique un
  // texte durable vide de sens et un artefact substitué. Clarify de l'objet.
  // Le REPLACE reste exempté: son héritage P3-F/P6-A résout l'instruction
  // depuis le pending ciblé, jamais depuis la clause.
  const nominalCreateInstructionDegenerate = replaceCancelCommitted === null &&
    Boolean(compiledPayload.instruction) &&
    (isDegenerateReminderInstruction(compiledPayload.instruction) ||
      isReminderInstructionInvarianceAnaphora(
        compiledPayload.instruction ?? "",
      ));
  if (!compiledPayload.instruction || nominalCreateInstructionDegenerate) {
    missingPayloadSlots.push("reminder_instruction");
  }
  if (missingPayloadSlots.length > 0) {
    const reasonCode = !compiledPayload.scheduledFor
      ? "missing_time"
      : "missing_instruction";
    // P4-D (eva-global19 R1-B03): heure nue ambiguë avec UTC_time laissé
    // vide par le dispatcher (contrat) — la question porte le CRENEAU au
    // lieu d'un vague « moment exact ». Formes chiffrées incluses ici: le
    // dispatcher a DÉJÀ jugé l'ambiguïté en laissant UTC_time vide.
    const ambiguousHour = bareAmbiguousHour(
      canonicalRawTextFromTurnFrame(args.turnFrame) ??
        canonicalWhenHintFromTurnFrame(args.turnFrame) ?? "",
      { includeDigits: true },
    );
    const missingReply = !compiledPayload.scheduledFor
      ? (ambiguousHour !== null
        ? `Juste pour être sûre du créneau : ${ambiguousHour}h du matin, ou ${
          ambiguousHour + 12
        }h ? Je programme dès que tu me dis.`
        : "Il me manque le moment exact pour programmer ce rappel.")
      : "Il me manque ce qu'il faut rappeler.";
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: reasonCode,
        reply: missingReply,
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: reasonCode,
      }],
      constraints: !compiledPayload.scheduledFor
        ? ["requires_explicit_time"]
        : ["requires_instruction"],
      missing_slots: missingPayloadSlots,
      // P5-D: même carry-over que la ceinture — un create incomplet garde
      // ses slots déjà fournis pour le tour-réponse. P8-B: une instruction
      // dégénérée ne se persiste PAS dans les slots (le tour-réponse ne doit
      // jamais hériter l'anaphore comme texte du rappel).
      pending_clarification: {
        intent: "create",
        reason_code: reasonCode,
        clarify_question: missingReply,
        known_slots: {
          instruction_hint: nominalCreateInstructionDegenerate
            ? null
            : compiledPayload.instruction ?? null,
          raw_text: compiledPayload.rawText ?? args.message,
          when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
        },
      },
    };
  }
  const scheduledFor = compiledPayload.scheduledFor;
  const reminderInstruction = compiledPayload.instruction;
  if (!scheduledFor || !reminderInstruction) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: "missing_payload",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{ type: effectType, reason_code: "missing_payload" }],
    };
  }
  // P5-F (nina-global20 B01, alex-untested20 R1-B02): demande de BROUILLON /
  // validation préalable explicite (« montre-le-moi d'abord », « le crée pas
  // tout de suite, je valide avant ») — garde d'admission déterministe,
  // jamais un prompt : le brouillon complet est rendu, ZÉRO ligne pending, et
  // les slots persistent (mécanique pending-create P5-D) pour que « ok
  // crée-le » au tour suivant committe tel quel.
  if (oneShotReminderDraftRequested(args.message)) {
    const draftLabel = compiledPayload.localLabel ?? scheduledFor;
    const draftReply =
      `Voilà le brouillon — ${draftLabel} : « ${reminderInstruction} ». Je ne l'ai PAS encore créé ; tu valides, ou tu veux changer quelque chose ?`;
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: "draft_pending_confirmation",
        reply: draftReply,
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "draft_pending_confirmation",
      }],
      pending_clarification: {
        intent: "create",
        reason_code: "draft_pending_confirmation",
        clarify_question: draftReply,
        known_slots: {
          instruction_hint: reminderInstruction,
          UTC_time: scheduledFor,
          local_label: compiledPayload.localLabel ?? null,
          raw_text: compiledPayload.rawText ?? args.message,
        },
      },
    };
  }
  const outcome = await maybeCreateOneShotReminderFromStructuredEffect({
    effect: {
      type: "create_one_shot_reminder",
      scheduled_for: scheduledFor,
      local_label: compiledPayload.localLabel ?? undefined,
      reminder_instruction: reminderInstruction,
      request_text: compiledPayload.rawText,
      reason_code: compiledPayload.parseSource,
    },
    supabase: args.supabase,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? args.requestId ?? null,
    requestId: args.requestId,
    now,
    timezone: args.userTimezone,
    locale: args.locale,
    // P12-D2c/D3/D4: doublon d'instruction assumé (réponse AJOUTER consommée,
    // marqueur additif, ou create pur d'un jour nommé sans pending).
    allowDuplicateInstruction: allowDuplicateForTurn,
  });
  if (!outcome.detected) {
    return baseDirectEffectResult({
      detected: false,
      intent: "create",
      status: "ignored",
      reason_code: "create_not_detected",
    });
  }
  if (outcome.status === "success") {
    const committedEffects = committedCreateEffects(outcome);
    if (committedEffects.length === 0) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent: "create",
          status: "failed",
          reason_code: "missing_create_commit",
          reply: "Je n'ai pas réussi à programmer ce rappel.",
        }),
        requested_effects: [{
          type: effectType,
          scheduled_for: outcome.scheduled_for,
          local_label: outcome.scheduled_for_local_label,
          reminder_instruction: outcome.reminder_instruction,
          reason_code: outcome.parse_source ?? "created",
        }],
        allowed_effects: [{
          type: effectType,
          scheduled_for: outcome.scheduled_for,
          local_label: outcome.scheduled_for_local_label,
          reminder_instruction: outcome.reminder_instruction,
          reason_code: outcome.parse_source ?? "created",
        }],
        attempted_effects: [effectType],
        blocked_effects: [{
          type: effectType,
          reason_code: "missing_create_commit",
        }],
      };
    }
    const createReply = createReminderSuccessReply({
      localLabel: outcome.scheduled_for_local_label,
      reminderInstruction: outcome.reminder_instruction,
      turnFrame: args.turnFrame ?? null,
    });
    // Volet replace: le rendu porte les DEUX operations (annule + recree) —
    // outcome total, jamais « c'est decale » sans trace de l'annulation.
    const replaceReply = replaceCancelCommitted === null
      ? createReply
      : replaceCancelCommitted.length > 0
      ? `C'est fait : l'ancien rappel${
        replaceCancelledLabel ? ` de ${replaceCancelledLabel}` : ""
      } est annulé, et le nouveau est posé. ${createReply}`
      // P12-D3/D4: sur un ajout explicite (ou une entité d'un autre jour),
      // le rendu dit l'AJOUT — « rien trouvé à annuler » mentirait sur
      // l'intention (rien ne devait être annulé).
      : replaceCancelForbidden
      ? `C'est un ajout — je n'ai touché à aucun rappel existant. ${createReply}`
      : `Je n'ai trouvé aucun ancien rappel en attente à annuler — j'ai posé le nouveau. ${createReply}`;
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: replaceCancelCommitted === null ? "create" : "replace",
        status: "success",
        reason_code: outcome.parse_source ?? "created",
        reply: replaceReply,
      }),
      requested_effects: [{
        type: effectType,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
        reason_code: outcome.parse_source ?? "created",
      }],
      allowed_effects: [{
        type: effectType,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
        reason_code: outcome.parse_source ?? "created",
      }],
      attempted_effects: [effectType],
      executed_tools: replaceCancelCommitted &&
          replaceCancelCommitted.length > 0
        ? [
          ...uniqueToolsFromCommitted(committedEffects),
          "cancel_one_shot_reminder",
        ]
        : uniqueToolsFromCommitted(committedEffects),
      committed_effects: [
        ...(replaceCancelCommitted ?? []),
        ...committedEffects,
      ],
      scheduled_for: outcome.scheduled_for,
      local_label: outcome.scheduled_for_local_label,
      reminder_instruction: outcome.reminder_instruction,
    };
  }
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent: "create",
      status: outcome.status === "needs_clarify" ? "needs_clarify" : "failed",
      reason_code: outcome.status === "needs_clarify"
        ? outcome.reason
        : outcome.status,
      reply: outcome.status === "needs_clarify"
        ? (outcome.reason === "duplicate_pending"
          ? "Bonne nouvelle : ce rappel existe déjà et il est bien en attente pour ce moment — je n'en ai pas ajouté un deuxième."
          // P12-D2c (nina-p10reval R1-B04): les deux options sont EXÉCUTABLES
          // au tour suivant (déplacer ⇒ replace de la cible au même contenu,
          // ajouter ⇒ create assumé du doublon) — plus de formule dictée avec
          // placeholder « [heure] » qui fuyait au rendu.
          : outcome.reason === "same_instruction_pending"
          ? "Tu as déjà un rappel en attente avec exactement ce contenu, à une autre heure. Tu veux que je le DÉPLACE à la nouvelle heure, ou que j'en AJOUTE un deuxième en plus ? Dis-moi « déplace-le » ou « ajoute-le » — je n'ai rien changé pour l'instant."
          : outcome.reason === "past_time"
          ? "Cette heure est déjà passée aujourd'hui, je n'ai rien programmé — tu veux un autre horaire, ou demain ?"
          : "Il me manque le moment exact pour programmer ce rappel.")
        : "Je n'ai pas réussi à programmer ce rappel.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    attempted_effects: outcome.status === "failed" ? [effectType] : [],
    blocked_effects: outcome.status === "needs_clarify"
      ? [{ type: effectType, reason_code: outcome.reason }]
      : [],
    missing_slots:
      outcome.status === "needs_clarify" &&
        outcome.reason !== "duplicate_pending" &&
        outcome.reason !== "past_time"
        ? ["scheduled_for"]
        : [],
    // P6-A (nina-untested21 R1-B02): le clarify PAST_TIME était le seul
    // clarify de create qui ne persistait PAS ses slots — l'objet du rappel
    // (« me peser ») était perdu et le tour-réponse (« alors demain 20h »)
    // committait le qualificatif résiduel (« avant ma garde ») comme
    // instruction durable. Même mécanique que missing_time (P5-D).
    ...(outcome.status === "needs_clarify" && outcome.reason === "past_time"
      ? {
        pending_clarification: {
          intent: "create" as const,
          reason_code: "past_time",
          clarify_question:
            "Cette heure est déjà passée aujourd'hui — tu veux un autre horaire, ou demain ?",
          known_slots: {
            instruction_hint: compiledPayload.instruction ?? null,
            raw_text: compiledPayload.rawText ?? args.message,
            when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
          },
        },
      }
      : {}),
    // P12-D2c (nina-p10reval R1-B04): le gate same_instruction_pending arme
    // SON pending — sans lui, la réponse-option (« en ajouter un deuxième »)
    // repassait par l'intake comme énoncé neuf et re-déclenchait le même
    // blocage verbatim (cul-de-sac T11/T12). Les slots portent l'heure et le
    // contenu du NOUVEAU rappel pour que l'option choisie s'exécute telle
    // quelle au tour suivant.
    ...(outcome.status === "needs_clarify" &&
        outcome.reason === "same_instruction_pending"
      ? {
        pending_clarification: {
          intent: "create" as const,
          reason_code: "same_instruction_pending",
          clarify_question:
            "Tu veux que je DÉPLACE le rappel existant à la nouvelle heure, ou que j'en AJOUTE un deuxième en plus ?",
          known_slots: {
            instruction_hint: compiledPayload.instruction ?? null,
            UTC_time: compiledPayload.scheduledFor ?? null,
            local_label: compiledPayload.localLabel ?? null,
            raw_text: compiledPayload.rawText ?? args.message,
            when_hint: canonicalWhenHintFromTurnFrame(args.turnFrame) ?? null,
          },
        },
      }
      : {}),
  };
}
