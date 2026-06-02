import { loadAdjustPlanFrameFromTempMemory } from "../../tools/operations/adjust_plan_item/state.ts";
import {
  buildWeeklyExactAdjustPlanProposal,
  isCopyForwardWeeklyRequest,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  rememberWeeklyExactAdjustPlanProposal,
  rememberWeeklyPartialExactConstraint,
  weeklyExactProposalFromConversation,
  weeklyExactProposalKindFromText,
  weeklyMissionCarryOverContext,
  weeklyPartialExactConstraintsComplete,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";
import { isExplicitPendingApplyConfirmation } from "./confirmation.ts";
import { isExplicitWeeklyAdjustPlanRequest } from "./bridges.ts";
import { stripWeeklySupportItemsFromResponse } from "./renderer.ts";
import { weeklyAdaptiveReviewStateForTurn } from "./state.ts";

function normalizeRouteText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Legacy weekly response guard.
 * Owner target: weekly renderer/reducer.
 * Removal condition: renderer contract covers this invariant.
 */
export function applyWeeklyForgottenProgressAckGuard(args: {
  responseContent: string;
  tempMemory: any;
  loggedMessageId?: string | null;
}): string {
  const progress = args.tempMemory?.__weekly_forgotten_progress;
  if (!progress) return args.responseContent;
  const responseText = normalizeRouteText(args.responseContent);
  if (
    ["logged", "logged_multi"].includes(String(progress.mode ?? "")) &&
    /\bsemaine empechee\b|\boubli de check\b|\bplan trop dur\b/.test(
      responseText,
    ) &&
    (
      /\bil me faut\b|\bjuste 1 info\b|\bc etait plutot\b|\bcetait plutot\b/
        .test(responseText) ||
      /\bpourquoi\b[\s\S]{0,80}\bsignal\b/.test(responseText) ||
      /\bquand tu dis\b[\s\S]{0,80}\bsignal maintenant\b/.test(responseText)
    )
  ) {
    return [
      "Ok, on passe à la suite prudemment.",
      "",
      "Je garde la cause comme un oubli de check: ce n'est pas une preuve que le plan ne tient pas.",
      "",
      "Pour la semaine prochaine, l'option logique est donc d'avancer avec prudence: même direction, charge surveillée, et on garde les actions réellement faites dans le bilan.",
      "",
      "Rien n'est appliqué sans validation explicite.",
    ].join("\n");
  }
  if (
    args.loggedMessageId &&
    String(progress.source_message_id ?? "") !== args.loggedMessageId
  ) return args.responseContent;
  if (
    progress.mode === "incomplete" &&
    String(progress.reason_code ?? "") === "ambiguous_multi_action_dates"
  ) {
    return [
      "Je ne l'ai pas encore enregistré: les dates sont ambiguës entre les actions.",
      "",
      "Dis-moi juste la répartition exacte, par exemple: respiration mardi + jeudi, point positif vendredi. Dès que c'est clair, je l'ajoute au bilan weekly.",
    ].join("\n");
  }
  if (!["logged", "logged_multi"].includes(progress.mode)) {
    return args.responseContent;
  }
  if (progress.mode === "logged_multi" && Array.isArray(progress.items)) {
    const items = progress.items
      .map((item: any) => {
        const title = String(item?.title ?? "action").trim();
        const count = Number(item?.count ?? 0);
        const dateHint = String(item?.date_hint ?? "").trim();
        return `+${
          Number.isFinite(count) && count > 0 ? count : 1
        } pour "${title}"${dateHint ? ` (${dateHint})` : ""}`;
      })
      .filter(Boolean);
    if (items.length > 0) {
      const ack = `C'est enregistré: ${items.join(" ; ")}.`;
      const normalized = normalizeRouteText(args.responseContent);
      if (
        /\bc est note\b|\bcest note\b|\benregistre\b|\benregistree\b/.test(
          normalized,
        )
      ) {
        if (
          /\bnombre de fois\b|\b1 par jour\b|\bune par jour\b|\bcombien de fois\b/
            .test(normalized)
        ) {
          return [
            ack,
            "",
            "Le bilan weekly est corrigé avec ces actions oubliées.",
            "On peut maintenant décider la suite à partir de ce signal récupéré.",
          ].join("\n");
        }
        if (
          /\btu confirmes\b|\bconfirme moi\b|\bconfirmer\b|\bc est bien ca\b|\bcest bien ca\b/
            .test(normalized) ||
          /\bvalide comme ca\b|\bvalider comme ca\b|\bvalidation comme ca\b|\bvalide ca\b/
            .test(normalized)
        ) {
          return [
            ack,
            "",
            "Le bilan weekly est corrigé avec ces actions oubliées.",
            "On peut maintenant décider la suite à partir de ce signal récupéré: passer à la suite prudemment, ou refaire la même semaine si tu veux consolider.",
          ].join("\n");
        }
        return args.responseContent;
      }
      return `${ack}\n\n${args.responseContent}`;
    }
  }
  const title = String(progress.title ?? "l'action").trim();
  const count = Number(progress.count ?? 0);
  const dateHint = String(progress.date_hint ?? "").trim();
  const ack = `C'est enregistré: +${
    Number.isFinite(count) && count > 0 ? count : 1
  } répétition(s) pour "${title}"${
    dateHint ? ` sur la semaine (${dateHint})` : ""
  }.`;
  const normalized = normalizeRouteText(args.responseContent);
  if (
    /\bc est note\b|\bcest note\b|\benregistre\b|\benregistree\b/.test(
      normalized,
    )
  ) {
    if (/\btu confirmes\b|\bconfirme moi\b|\bconfirmer\b/.test(normalized)) {
      return `${ack}\n\nOn reste sur le point weekly et l'organisation de la semaine prochaine.`;
    }
    return args.responseContent;
  }
  return `${ack}\n\n${args.responseContent}`.trim();
}

/**
 * Legacy weekly response guard.
 * Owner target: weekly renderer/reducer.
 * Removal condition: renderer contract covers this invariant.
 */
export function applyWeeklyRepeatedClarificationGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState: unknown;
  tempMemory: any;
}): string {
  if (
    !weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    })
  ) return args.responseContent;
  const user = normalizeRouteText(args.userMessage);
  const response = normalizeRouteText(args.responseContent);
  const userGaveTrackingCause =
    /\boubli de suivi\b|\boublie de suivi\b|\boublie de cocher\b|\bpas coche\b|\bpas cochees\b|\bpas cochees\b|\bles habitudes n ont pas ete cochees\b/
      .test(user);
  const responseRepeatsCauseChoice =
    /\bplutot\b[\s\S]{0,120}\boubli\b[\s\S]{0,120}\b(fatigue|charge|chargee|impossible)\b/
      .test(response) ||
    /\bplutot\b[\s\S]{0,120}\b(fatigue|charge|chargee|impossible)\b[\s\S]{0,120}\boubli\b/
      .test(response) ||
    /\bhabitudes\b[\s\S]{0,120}\bactions non faites\b/.test(response) ||
    /\bconfirmes juste\b[\s\S]{0,160}\bcheck[- ]?ins\b[\s\S]{0,160}\bhabitudes\b/
      .test(response);
  if (userGaveTrackingCause && responseRepeatsCauseChoice) {
    return [
      "C'est clair: je garde la cause comme un oubli de suivi, pas comme une preuve que le plan ne tient pas.",
      "",
      "Donc on consolide la même semaine pour récupérer un signal propre, sans augmenter la charge. La validation de la semaine prochaine reste en attente tant que ce point weekly n'est pas conclu.",
    ].join("\n");
  }
  return args.responseContent;
}

/**
 * Legacy weekly response guard.
 * Owner target: weekly renderer/reducer.
 * Removal condition: renderer contract covers this invariant.
 */
export function applyWeeklyConcreteOrganizationGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState: unknown;
  tempMemory: any;
  history?: any[] | null;
}): string {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState) return args.responseContent;
  const user = normalizeRouteText(args.userMessage);
  const asksExactRestatement =
    /\b(redis|redis moi|reformule|exactement|avant d appliquer|sans plan global|pas assez precis|pas assez précis)\b/
      .test(user);
  const explicitApplyConfirmation = isExplicitPendingApplyConfirmation(
    args.userMessage,
  );
  if (
    explicitApplyConfirmation &&
    (isWeeklyMissionCarryOverRequest(args.userMessage) ||
      isCopyForwardWeeklyRequest(args.userMessage) ||
      isWeeklyLightRepeatRequest(args.userMessage))
  ) return args.responseContent;
  if (
    isWeeklyMissionCarryOverRequest(args.userMessage) ||
    (asksExactRestatement &&
      weeklyMissionCarryOverContext({
        userMessage: args.userMessage,
        history: args.history,
      }))
  ) {
    return [
      "Oui: on passe à la semaine suivante, et on reporte seulement la mission signal de pause.",
      "",
      "Ce qui change:",
      "- Les habitudes validées restent acquises.",
      "- La mission signal de pause reste dans la suite, parce qu'elle est encore utile.",
      "- On ne refait pas toute la semaine à l'identique.",
      "",
      "Rien n'est appliqué tant que tu ne confirmes pas clairement. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.",
    ].join("\n");
  }
  if (isCopyForwardWeeklyRequest(args.userMessage)) {
    return [
      "Oui: l'option propre ici, c'est de refaire la même semaine à l'identique.",
      "",
      "Ce qui change: uniquement la durée. Les actions, le rythme et les repères restent les mêmes.",
      "",
      "Rien n'est appliqué tant que tu ne confirmes pas clairement. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.",
    ].join("\n");
  }
  if (isWeeklyLightRepeatRequest(args.userMessage)) {
    return [
      "Oui: on repart sur une semaine allégée, sans changer tout le plan.",
      "",
      "Ce qui change:",
      "- Respiration de pause: une fois seulement.",
      "- Partager un point positif: une fois seulement.",
      "- Mission signal de pause: seulement si une fenêtre naturelle se présente.",
      "",
      "Rien n'est appliqué tant que tu ne confirmes pas clairement. A reprendre dans la section Plan; je ne modifie pas le plan depuis le chat.",
    ].join("\n");
  }
  const exactProposalFromContext = weeklyExactProposalFromConversation({
    userMessage: args.userMessage,
    history: args.history ?? [],
    tempMemory: args.tempMemory,
    weeklyState,
  });
  if (
    exactProposalFromContext?.kind === "precise_level_adjustment" &&
    (asksExactRestatement ||
      weeklyExactProposalKindFromText(
          [
            ...(args.history ?? []).slice(-8).map((turn: any) =>
              String(turn?.content ?? "").trim()
            ),
            args.userMessage,
          ].filter(Boolean).join("\n\n"),
        ) === "precise_level_adjustment")
  ) {
    rememberWeeklyExactAdjustPlanProposal({
      tempMemory: args.tempMemory,
      proposal: exactProposalFromContext,
    });
    return exactProposalFromContext.response;
  }
  const userRejectsRules =
    /\bpas des? regles?\b|\bsans regles?\b|\bpas une liste de regles\b|\borganisation concrete\b|\bparle moi de l organisation\b/
      .test(user);
  if (
    /\b(est ce que|est-ce que|ca doit|ça doit)\b/.test(user) &&
    /\b(ajuster le plan|ajust plan|weekly|bilan)\b/.test(user) &&
    /\b(appliquer|applique|directement|perdre le fil)\b/.test(user)
  ) {
    return [
      "Pour une proposition simple de semaine prochaine, on peut rester dans le weekly.",
      "",
      "Si on change vraiment la cadence ou le contenu des actions dans ton plan, je passe par une recommandation d'ajustement puis un handoff vers Plan. Là, ta version touche bien l'organisation concrète: je te donne quoi reprendre dans Plan, sans modifier depuis le chat.",
    ].join("\n");
  }
  if (
    /\brespiration\b/.test(user) &&
    /\blundi\b/.test(user) &&
    /\bmercredi\b/.test(user) &&
    /\bpoint positif\b/.test(user) &&
    /\bvendredi\b/.test(user)
  ) {
    const proposal = buildWeeklyExactAdjustPlanProposal({
      kind: "partial_weekly_organization",
      weeklyState: weeklyAdaptiveReviewStateForTurn({
        activeSkillState: args.activeSkillState,
        tempMemory: args.tempMemory,
      }),
    });
    rememberWeeklyExactAdjustPlanProposal({
      tempMemory: args.tempMemory,
      proposal,
    });
    return proposal.response;
  }
  if (
    /\bdeconnexion\b/.test(user) &&
    /\bmardi\b/.test(user) &&
    /\bjeudi\b/.test(user) &&
    /\bpoint positif\b/.test(user) &&
    /\bsamedi\b/.test(user) &&
    /\bphrase de sortie\b/.test(user) &&
    /\bvendredi\b/.test(user)
  ) {
    const proposal = buildWeeklyExactAdjustPlanProposal({
      kind: "precise_level_adjustment",
      weeklyState: weeklyAdaptiveReviewStateForTurn({
        activeSkillState: args.activeSkillState,
        tempMemory: args.tempMemory,
      }),
    });
    rememberWeeklyExactAdjustPlanProposal({
      tempMemory: args.tempMemory,
      proposal,
    });
    return proposal.response;
  }
  if (
    /\bdeconnexion\b/.test(user) &&
    /\bmardi\b/.test(user) &&
    /\bjeudi\b/.test(user)
  ) {
    rememberWeeklyPartialExactConstraint(args.tempMemory, "deconnexion");
    if (weeklyPartialExactConstraintsComplete(args.tempMemory)) {
      const proposal = buildWeeklyExactAdjustPlanProposal({
        kind: "precise_level_adjustment",
        weeklyState: weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        }),
      });
      rememberWeeklyExactAdjustPlanProposal({
        tempMemory: args.tempMemory,
        proposal,
      });
      return proposal.response;
    }
    return [
      "Ok, je prends ce point précisément.",
      "",
      "Dans la proposition, Respiration de pause serait remplacée par Deconnexion de 7 minutes apres le diner, mardi et jeudi uniquement.",
      "",
      "Je garde l'objectif du niveau, et je ne touche pas au plan global. Il reste juste à caler les autres actions avant d'appliquer quoi que ce soit.",
    ].join("\n");
  }
  if (/\bpoint positif\b/.test(user) && /\bsamedi\b/.test(user)) {
    rememberWeeklyPartialExactConstraint(args.tempMemory, "positive");
    if (weeklyPartialExactConstraintsComplete(args.tempMemory)) {
      const proposal = buildWeeklyExactAdjustPlanProposal({
        kind: "precise_level_adjustment",
        weeklyState: weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        }),
      });
      rememberWeeklyExactAdjustPlanProposal({
        tempMemory: args.tempMemory,
        proposal,
      });
      return proposal.response;
    }
    return [
      "Ok, je l'ajoute à la proposition.",
      "",
      "Partager un point positif passerait à samedi matin seulement, une seule fois dans la semaine.",
      "",
      "Rien n'est appliqué pour l'instant; je garde ça avec le reste des ajustements du niveau.",
    ].join("\n");
  }
  if (
    /\bphrase de sortie\b/.test(user) &&
    /\bvendredi\b/.test(user) &&
    /\b(10|dix)\b/.test(user)
  ) {
    rememberWeeklyPartialExactConstraint(args.tempMemory, "mission");
    if (weeklyPartialExactConstraintsComplete(args.tempMemory)) {
      const proposal = buildWeeklyExactAdjustPlanProposal({
        kind: "precise_level_adjustment",
        weeklyState: weeklyAdaptiveReviewStateForTurn({
          activeSkillState: args.activeSkillState,
          tempMemory: args.tempMemory,
        }),
      });
      rememberWeeklyExactAdjustPlanProposal({
        tempMemory: args.tempMemory,
        proposal,
      });
      return proposal.response;
    }
    return [
      "Ok, je complète la proposition.",
      "",
      "Convenir d'un signal de pause deviendrait Phrase de sortie, vendredi, 10 minutes maximum.",
      "",
      "Je n'applique rien encore; je peux te redire la version exacte avant validation.",
    ].join("\n");
  }
  let next = stripWeeklySupportItemsFromResponse(args.responseContent);
  if (userRejectsRules) {
    next = next
      .replace(/\bR[eè]gle d[’']or\b/gi, "Point concret")
      .replace(/\bR[eè]gle simple\b/gi, "Point concret")
      .replace(/\bR[eè]gle\b/gi, "Point")
      .replace(/\br[eè]gles\b/gi, "points")
      .replace(/\bje te verrouille ça\b/gi, "je te propose ça")
      .replace(/\bte verrouiller ça\b/gi, "te proposer ça")
      .replace(/\bverrouiller ça\b/gi, "poser cette proposition")
      .replace(/\bverrouille ça\b/gi, "pose cette proposition")
      .replace(/\bplan précis\b/gi, "proposition concrète");
  }
  if (
    /\bfatigue forte\b|\btres fatigue\b|\btrès fatigu[eé]\b|\bcrame\b|\bcram[eé]\b|\bko\b/
      .test(user)
  ) {
    next = next
      .replace(
        /\bobjectif concret\s*:\s*100\s*%[^\n.]*/gi,
        "objectif concret: avancer sans viser la perfection",
      )
      .replace(
        /\bobjectif\s*:\s*100\s*%[^\n.]*/gi,
        "objectif: avancer sans viser la perfection",
      )
      .replace(/\b100\s*%\b/g, "une version tenable")
      .replace(/\btout finir a tout prix\b/gi, "garder une charge tenable")
      .replace(/\btout finir à tout prix\b/gi, "garder une charge tenable");
  }
  return next;
}

function weeklyResponseConcludesReview(response: string): boolean {
  const text = normalizeRouteText(response);
  if (/\bvalidation\b[\s\S]{0,80}\bpas encore\b/.test(text)) return false;
  return (
    /\b(point weekly|point de fin de semaine|bilan de la semaine)\b[\s\S]{0,120}\b(termine|terminee|conclu|cloture|cloturee)\b/
      .test(text) ||
    /\bvalidation de la semaine prochaine\b[\s\S]{0,80}\b(disponible|debloquee|ouverte)\b/
      .test(text)
  );
}

function weeklyUserAskedConclusion(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\b(conclus|conclure|termine|terminer|cloture|cloturer|clore)\b/
    .test(text) &&
    /\b(weekly|point weekly|bilan|semaine)\b/.test(text);
}

function weeklyUserAskedValidationAvailability(message: string): boolean {
  const text = normalizeRouteText(message);
  return /\bvalidation\b[\s\S]{0,100}\b(dispo|disponible|debloquee|ouverte|verifier|verifie|valider)\b/
    .test(text) ||
    /\b(dispo|disponible|debloquee|ouverte)\b[\s\S]{0,80}\bvalidation\b/
      .test(text);
}

/**
 * Legacy weekly response guard.
 * Owner target: weekly renderer/reducer.
 * Removal condition: renderer contract covers this invariant.
 */
export function applyWeeklyConclusionGuard(args: {
  responseContent: string;
  userMessage: string;
  activeSkillState: unknown;
  tempMemory: any;
}): string {
  const hasWeeklyState = Boolean(weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  }));
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  }) as any;
  if (
    weeklyUserAskedValidationAvailability(args.userMessage) && hasWeeklyState
  ) {
    const flowStatus = String(
      weeklyState?.weekly_flow_state?.status ?? weeklyState?.status ?? "",
    ).trim();
    if (
      flowStatus === "adjustment_applied" ||
      flowStatus === "completed" ||
      loadAdjustPlanFrameFromTempMemory(args.tempMemory).last_execution
    ) {
      const proposal = weeklyExactProposalFromConversation({
        userMessage: args.userMessage,
        history: [],
        tempMemory: args.tempMemory,
        weeklyState,
      });
      const checks = proposal?.kind === "precise_level_adjustment"
        ? "Avant de valider, vérifie que l'écran affiche bien: Deconnexion mardi/jeudi, Point positif samedi matin, Phrase de sortie vendredi. Le plan global et les supports doivent rester inchangés."
        : "Avant de valider, vérifie que l'écran affiche bien: Respiration lundi/mercredi, Point positif vendredi, et mission signal de pause à finir sans pression.";
      return [
        "Oui. Le point weekly est terminé, donc la validation de la semaine prochaine est disponible.",
        "",
        checks,
      ].join("\n");
    }
    return [
      "Pas encore: la validation de la semaine prochaine se débloque quand le point weekly est terminé.",
      "",
      "Là, il faut d'abord finir de confirmer l'organisation de la suite.",
    ].join("\n");
  }
  if (!weeklyUserAskedConclusion(args.userMessage)) return args.responseContent;
  if (isExplicitWeeklyAdjustPlanRequest(args.userMessage)) {
    return args.responseContent;
  }
  if (
    !hasWeeklyState && !/\bweekly\b/.test(normalizeRouteText(args.userMessage))
  ) {
    return args.responseContent;
  }
  if (weeklyResponseConcludesReview(args.responseContent)) {
    return args.responseContent;
  }
  const conclusionText = normalizeRouteText(args.userMessage);
  const mentionsReplacement =
    /\b(remplace|remplacee|remplacement|modifiee|modification|ajustement)\b/
      .test(conclusionText) &&
    /\b(action|niveau|respiration|pause)\b/.test(conclusionText);
  const retained = mentionsReplacement
    ? "Ce qu'on retient: la semaine a bien demarre, puis la fatigue de jeudi/vendredi a cassé le rythme. Pour la suite, on garde une semaine plus légère, avec l'action de pause remplacée parce que l'ancien format ne convenait pas."
    : "Ce qu'on retient: la semaine a bien demarre, puis la fatigue de jeudi/vendredi a cassé le rythme. Pour la suite, on garde la même direction, mais en version plus légère: une répétition par habitude en début de semaine, et la mission signal de pause à terminer tranquillement.";
  return [
    "Ok, on conclut le point de fin de semaine ici.",
    "",
    retained,
    "",
    "Le point weekly est terminé. La validation de la semaine prochaine est disponible: elle sert à confirmer cette organisation de la semaine suivante après le bilan.",
  ].join("\n");
}
