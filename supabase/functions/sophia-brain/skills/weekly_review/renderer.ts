import {
  resolveWeeklyForgottenProgressCandidate
    as resolveWeeklyForgottenProgressCandidateFromBridge,
  weeklyAdaptiveReviewStateForTurn,
  weeklyForgottenProgressMentioned
    as weeklyForgottenProgressMentionedFromBridge,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";
import { isWeeklyAdaptiveReviewActive } from "./state.ts";

function normalizeRouteText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function stripWeeklyInternalVocabulary(text: string): string {
  return text
    .replace(/\bbridge_week\b/gi, "semaine allegee")
    .replace(/\bbridge\b/gi, "semaine allegee")
    .replace(/\bsemaine pont\b/gi, "semaine allegee")
    .replace(/\bcarry_over\b/gi, "report")
    .replace(/\bmode advance\b/gi, "passage a la suite")
    .replace(/\brepeat_week\b/gi, "refaire la meme semaine")
    .replace(/\bno[-_ ]signal\b/gi, "manque de retours fiables")
    .replace(/\blevel_review\b/gi, "revoir la forme du niveau")
    .replace(/\bnot_relevant\b/gi, "pas assez adapte a ta situation")
    .replace(/\bsignal faible\b/gi, "signal récupéré mais encore incomplet")
    .replace(
      /\bsignal\s+(?:dont je dispose est encore\s+)?(?:trop\s+)?faible\b/gi,
      "signal récupéré mais encore incomplet",
    )
    .replace(/\blevel\b/gi, "niveau")
    .replace(/\bitem_decision\b/gi, "decision sur l'action")
    .replace(/\bplan_patch\b/gi, "proposition d'organisation")
    .replace(/\boperation\b/gi, "ajustement")
    .replace(/\bverrouiller\b/gi, "clarifier")
    .replace(/\bbrouillon\b/gi, "proposition");
}

export function stripVisibleWeeklyInternalSummary(text: string): string {
  return String(text ?? "")
    .replace(
      /\n{0,2}Mini-synth[eè]se pour le prochain weekly\s*:[\s\S]*?(?=\n{2,}|$)/gi,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanWeeklyVisibleResponse(text: string): string {
  const raw = String(text ?? "");
  const normalizedRaw = normalizeRouteText(raw);
  if (
    /\brappel\b/.test(normalizedRaw) &&
    /\b(fuseau horaire|heure locale|heure de ta ville|heure de ton telephone|18h pile|mercredi prochain|mercredi de cette semaine|je le programme|je te le programme|je te le mets|je vais te le mettre|je m en occupe|c est tout bon|cest tout bon|programmer ce rappel|quel moment)\b|(?:\brappel\b[\s\S]{0,140}\b(confirme|tu veux|c est bon|cest bon|tout bon|occupe|heure locale|18h))/
      .test(normalizedRaw)
  ) {
    const withoutReminder = raw
      .split(/\n{2,}/)
      .filter((paragraph) => {
        const normalized = normalizeRouteText(paragraph);
        return !(
          /\brappel\b/.test(normalized) &&
          /\b(fuseau horaire|heure locale|heure de ta ville|heure de ton telephone|18h pile|mercredi prochain|mercredi de cette semaine|je le programme|je te le programme|je te le mets|je vais te le mettre|je m en occupe|c est tout bon|cest tout bon|programmer ce rappel|quel moment)\b|(?:\brappel\b[\s\S]{0,140}\b(confirme|tu veux|c est bon|cest bon|tout bon|occupe|heure locale|18h))/
            .test(normalized)
        );
      })
      .join("\n\n")
      .trim();
    return [
      withoutReminder ||
      "Ok, je garde ça comme un point à traiter après le bilan si tu veux.",
      "",
      "Pour l'instant, on reste sur le point weekly: est-ce qu'on part sur une semaine plus légère pour éviter que la fatigue de fin de semaine casse le rythme ?",
    ].join("\n");
  }
  if (
    /\b(carte de defense|carte defense|defense anti fatigue|défense anti-fatigue|fiche)\b/
      .test(normalizedRaw) &&
    (
      /\bje te propose une carte\b/.test(normalizedRaw) ||
      /\b(1|2|3|4|5)\)\s/.test(raw) ||
      /\bversion ultra courte\b/.test(normalizedRaw)
    )
  ) {
    return [
      "C'est une bonne idée, mais on la garde pour juste après le bilan.",
      "",
      "Là, on termine d'abord l'organisation de la semaine prochaine pour éviter de se disperser. Vu la fatigue de fin de semaine, est-ce qu'on part bien sur une version plus légère ?",
    ].join("\n");
  }
  if (
    /\bc est enregistre\b|\bcest enregistre\b/.test(normalizedRaw) &&
    /\brespiration de pause\b/.test(normalizedRaw) &&
    (
      /\btu me confirmes\b|\btu confirmes\b|\bc est bien ca\b|\bcest bien ca\b/
        .test(normalizedRaw) ||
      /\bvalide comme ca\b|\bvalider comme ca\b|\bvalidation comme ca\b/
        .test(normalizedRaw) ||
      /\btu veux que je consolide\b|\brefaire la meme semaine\b/.test(
        normalizedRaw,
      )
    )
  ) {
    const ack = raw.split(/\r?\n/).find((line) =>
      /C['’]?est enregistré/i.test(line)
    )?.trim() || "C'est enregistré.";
    return [
      ack,
      "",
      "Le bilan weekly est corrigé avec ces actions oubliées.",
      "On peut maintenant décider la suite à partir de ce signal récupéré: passer à la suite prudemment, ou refaire la même semaine si tu veux consolider.",
    ].join("\n");
  }
  return stripVisibleWeeklyInternalSummary(
    stripWeeklyInternalVocabulary(String(text ?? "")),
  ).replace(
    /((?:Respiration de pause|respiration de pause)\s*(?::|=)\s*)2 fois\s+(?:mardi|\(mardi)\s*\+\s*2 fois\s+(?:jeudi|jeudi\))/g,
    "$1deux fois au total (mardi + jeudi)",
  ).replace(/\u{1F43E}/gu, "");
}

export function renderWeeklyResponseWithEffects(args: {
  responseContent: string;
  committedEffects?: unknown[];
}): string {
  const cleaned = cleanWeeklyVisibleResponse(args.responseContent);
  if ((args.committedEffects ?? []).length > 0) return cleaned;
  const normalized = normalizeRouteText(cleaned).replace(/[^a-z0-9]+/g, " ");
  const doneTerms = [
    "c est applique",
    "cest applique",
    "c est valide",
    "cest valide",
    "c est enregistre",
    "cest enregistre",
    "j ai applique",
    "j ai valide",
    "j ai enregistre",
  ];
  if (!doneTerms.some((term) => normalized.includes(term))) return cleaned;
  return "Rien n'est appliqué sans confirmation et effet confirmé.";
}

export function stripWeeklySupportItemsFromResponse(text: string): string {
  return String(text ?? "")
    .replace(
      /\n?\s*\d+\)\s*[^\n]*(?:fiche|support|repere de fatigue|repère de fatigue)[\s\S]*?(?=\n\s*\d+\)|\n\s*Derniere|\n\s*Dernière|\n\s*Tu\b|\n\s*$)/gi,
      "\n",
    )
    .replace(
      /\n?\s*[-•]\s*[^\n]*(?:fiche|support|repere de fatigue|repère de fatigue)[^\n]*(?:\n\s*[^\n]*){0,2}/gi,
      "\n",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function weeklyReturnAfterAdjustmentMessage(
  userMessage: string,
): string | null {
  const text = normalizeRouteText(userMessage);
  const askedReturn = (
    /\b(reviens|retourne|reprends|conclus|conclure|termine|terminer)\b/
      .test(text) &&
    /\b(weekly|bilan|semaine)\b/.test(text)
  ) ||
    /\bvalidation\b[\s\S]{0,60}\b(dispo|disponible|debloquee|ouverte)\b/.test(
      text,
    );
  if (!askedReturn) return null;
  const copyForward =
    /\b(identique|a l identique|copie conforme|meme rythme|memes actions?|prolongation|prolonge)\b/
      .test(text);
  const mentionsReplacement =
    /\b(remplace|remplacee|remplacement|modifiee|modification|ajustement)\b/
      .test(text) &&
    /\b(action|niveau|respiration|pause)\b/.test(text);
  const retained = copyForward
    ? "Ce qu'on retient côté weekly: la semaine a été partielle, mais la suite est maintenant prolongée à l'identique. Les actions, le rythme et le plan global restent inchangés."
    : mentionsReplacement
    ? "Ce qu'on retient côté weekly: la semaine a été partielle, la fatigue de fin de semaine a pesé, et l'action de pause a été remplacée parce que l'ancien format ne convenait pas."
    : "Ce qu'on retient côté weekly: la semaine a été partielle, et l'organisation de la suite a été ajustée pour rester plus légère.";
  return [
    "On revient au weekly.",
    "",
    retained,
    "",
    "Le point weekly est terminé. La validation de la semaine prochaine est disponible pour confirmer cette organisation.",
  ].join("\n");
}

function weeklyStrategyUserLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "advance") return "passer a la suite";
  if (raw === "advance_with_caution" || raw === "advance_with_watch") {
    return "passer a la suite prudemment";
  }
  if (raw === "bridge_week") return "faire une semaine allegee";
  if (raw === "repeat_week") return "refaire la meme semaine";
  if (raw === "level_review") return "revoir la forme du niveau";
  return raw || "ajuster la semaine prochaine";
}

function weeklyItemDecisionUserLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "keep") return "garder tel quel";
  if (raw === "mark_completed") return "compter comme fait";
  if (raw === "carry_over") return "reporter si encore utile";
  if (raw === "drop") return "retirer si ca ne sert plus";
  if (raw === "repeat_with_week") return "refaire avec la meme semaine";
  if (raw === "bridge_with_week") return "garder en version allegee";
  if (raw === "split_or_replace") return "simplifier ou remplacer";
  if (raw === "escalate_level_review") return "revoir la forme du niveau";
  return raw || "a clarifier";
}

function weeklyOperationUserLabel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (raw === "advance_week") return "passer a la suite";
  if (raw === "repeat_week") return "refaire la meme semaine";
  if (raw === "insert_bridge_week") return "creer une semaine allegee";
  if (raw === "mark_item_completed") return "compter un item comme fait";
  if (raw === "carry_over_item") return "reporter une mission/action utile";
  if (raw === "drop_item") return "retirer un item devenu inutile";
  if (raw === "open_level_review") return "ouvrir une revue du niveau";
  return raw || "ajustement";
}

export function summarizeWeeklyAdaptiveReviewForAddon(
  activeSkillState: unknown,
): string | null {
  if (!isWeeklyAdaptiveReviewActive(activeSkillState)) return null;
  const review = (activeSkillState as any)?.weekly_adaptive_review;
  if (!review || typeof review !== "object") return null;
  const habitVerdict = (review as any)?.habit_verdict ?? {};
  const strategy = (review as any)?.week_strategy ?? {};
  const question = (review as any)?.question ?? null;
  const daily = (review as any)?.daily_evidence_summary ?? {};
  const operations = Array.isArray((review as any)?.plan_patch?.operations)
    ? (review as any).plan_patch.operations.map((op: any) =>
      weeklyOperationUserLabel(op?.op)
    ).filter(Boolean)
    : [];
  const itemDecisions = Array.isArray((review as any)?.item_decisions)
    ? (review as any).item_decisions.map((item: any) =>
      `${String(item?.title ?? "item")}: ${
        weeklyItemDecisionUserLabel(item?.decision)
      } (${String(item?.current_week_status ?? "unknown")})`
    ).slice(0, 8)
    : [];
  return [
    "=== CONTEXTE WEEKLY_ADAPTIVE_REVIEW_V1 ACTIF ===",
    "Tu es dans le point weekly. Continue la revue weekly, sauf si le user demande explicitement de sortir du bilan.",
    "Base-toi sur le JSON weekly_adaptive_review deja calcule; ne refais pas un bilan action par action si les raisons daily sont deja disponibles.",
    "Le message d'ouverture weekly est proactif et doit deja avoir pose une seule question large sur la semaine. Ensuite, remplis naturellement les signaux humains dans le JSON: progression ressentie, etat/energie, blocage dominant, pertinence des actions et confirmation finale.",
    "Ne repose pas deux questions frontales progression + etat sauf si une information manque vraiment apres la reponse du user.",
    "Si le user corrige le bilan en disant qu'une action a ete faite mais oubliee/non cochee, ne lance pas le daily et ne lance pas un flow separe. Il faut seulement reunir action concernee + nombre de repetitions a ajouter + date/semaine si donnee; quand c'est complet, le runtime logge en direct et tu continues le weekly.",
    "Vocabulaire simple obligatoire: ne dis jamais bridge, bridge_week, semaine pont, carry_over, mode advance, repeat_week, level_review, not_relevant, item_decision, plan_patch ou operation. Ce sont des codes internes.",
    "Si le user emploie un de ces mots interdits, ne le repete pas, meme pour dire que tu ne vas pas l'utiliser; reformule directement en vocabulaire simple.",
    "Traductions a utiliser: bridge_week = semaine allegee; advance = passer a la suite; repeat_week = refaire la meme semaine; level_review = revoir la forme du niveau; carry_over = reporter cette mission/action utile.",
    "Aucun changement de plan ne doit etre applique sans confirmation explicite. Formule les changements comme une proposition d'organisation de la semaine prochaine, pas comme des regles abstraites.",
    "Si le user demande une organisation concrete ou refuse les regles/listes de regles, ne dis pas le mot regle. Reponds avec actions a garder/reporter/alleger, charge, ordre ou jours, pas avec des principes generaux.",
    "Si le user signale une fatigue forte, ne parle pas d'objectif 100%, de perfection ou de tout finir a tout prix. Propose plutot une charge tenable et la prochaine etape utile.",
    "Tant que le flow d'ajustement n'a pas ete lance et confirme, ne dis pas que tu verrouilles, appliques ou enregistres un plan precis. Dis que c'est une proposition concrete et demande si le user veut l'appliquer maintenant ou continuer la discussion sans confirmation.",
    "Pendant le weekly, evite le mot brouillon. Dis plutot proposition d'organisation, version proposee, ou rien n'est confirme.",
    "Si le user demande explicitement de modifier et appliquer l'organisation, le weekly peut passer ponctuellement par adjust_plan_item, puis revenir ici pour conclure le bilan.",
    "Si le user demande un rappel, une carte ou une fiche pendant le weekly, ne commence pas une collecte de slots dans la reponse weekly. Dis simplement qu'on pourra le faire apres le bilan si besoin, puis reviens a la question weekly ou a l'organisation de la semaine prochaine.",
    "Si le user pose seulement une question hypothetique du type 'si je demande a changer...' ou 'tu peux passer par le flow...', reponds dans le weekly sans lancer d'ajustement.",
    "Si le user veut attendre demain/plus tard ou dit de ne rien changer maintenant, dis qu'on reprendra plus tard et que rien n'est confirme maintenant. Ne demande pas une heure de reprise sauf demande explicite de rappel.",
    "Quand le weekly est conclu, dis clairement: le point de fin de semaine est termine et la validation de la semaine prochaine est disponible. Ici, validation veut dire confirmer l'organisation de la semaine suivante apres ce bilan.",
    "A la conclusion du weekly, ne montre pas de mini-synthese pour le prochain weekly au user. Cette synthese est interne: le runtime la stocke pour aider le prochain message d'ouverture.",
    "Si la proposition n'est pas confirmee ou si le user dit de ne rien changer maintenant, dis que la validation de la semaine prochaine n'est pas encore debloquee.",
    "Ne propose pas de valider une occurrence dans le dashboard pour combler une semaine sans signal. En no_signal, clarifie la cause avant de conclure performance ou progression.",
    "Si decision_user_label=passer a la suite: ne reporte que les missions/clarifications utiles non faites. Ne reporte pas les habitudes deja comptabilisees.",
    "Si decision_user_label=passer a la suite avec des habitudes deja faites, ne propose aucune modification de cadence, pression, frequence, statut ou maintien sur ces habitudes. Elles sont seulement acquises/comptees; le seul ajustement possible vient des missions/actions utiles a reporter.",
    "Si decision_user_label=faire une semaine allegee: propose moins de charge pour garder le cap, pas un reset complet ni une repetition brute.",
    "Si decision_user_label=refaire la meme semaine: explique que le signal est insuffisant et qu'on consolide avant d'avancer; demande la cause si elle bloque la decision.",
    "Si decision_user_label=revoir la forme du niveau: traite cela comme une revue de la forme du niveau/bloc, pas comme une modification item par item. Ne demande pas 'quelles actions modifier'; demande confirmation ou clarifie le mauvais calibrage du niveau.",
    "Les supports sont hors scope des decisions weekly. Ne les propose pas dans l'organisation de la semaine prochaine et ne les compte jamais comme action a garder/reporter/alleger.",
    `habit_verdict=${
      String(habitVerdict.status ?? "unknown")
    } completion_rate=${String(habitVerdict.completion_rate ?? "unknown")}`,
    `daily_coverage=${String(daily.coverage ?? "unknown")} blockers=${
      JSON.stringify(daily.dominant_blockers ?? [])
    }`,
    `decision_user_label=${weeklyStrategyUserLabel(strategy.decision)} reason=${
      String(strategy.reason ?? "")
    }`,
    question
      ? `question_active=${String(question.id ?? "")}: ${
        String(question.text ?? "")
      } blocks_decision=${String(question.blocks_decision ?? "")}`
      : "question_active=none",
    `confirmation_required=${
      String((review as any)?.plan_patch?.requires_confirmation ?? true)
    } proposed_changes=${JSON.stringify(operations)}`,
    itemDecisions.length > 0
      ? `item_notes=${itemDecisions.join(" ; ")}`
      : "item_notes=none",
  ].join("\n");
}

export function buildWeeklyTurnSlotAddon(args: {
  activeSkillState: unknown;
  tempMemory: unknown;
  userMessage: string;
}): string | null {
  const weeklyState = weeklyAdaptiveReviewStateForTurn({
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  if (!weeklyState) return null;
  const text = normalizeRouteText(args.userMessage);
  const lines = ["=== SLOTS WEEKLY REMPLIS CE TOUR ==="];
  let hasSignal = false;
  if (
    /\boubli de suivi\b|\boublie de suivi\b|\boublie de cocher\b|\bpas coche\b|\bpas cochees\b|\bles habitudes n ont pas ete cochees\b/
      .test(text)
  ) {
    lines.push(
      "- cause_no_signal: oubli de suivi / check-ins non renseignes. Ne redemande pas si c'etait oubli ou fatigue; utilise cette cause.",
    );
    hasSignal = true;
  }
  if (weeklyForgottenProgressMentionedFromBridge(args.userMessage)) {
    const forgottenCandidate =
      resolveWeeklyForgottenProgressCandidateFromBridge({
        activeSkillState: args.activeSkillState,
        tempMemory: args.tempMemory,
        userMessage: args.userMessage,
      });
    if (forgottenCandidate.ready) {
      lines.push(
        "- correction_action_oubliee: le user corrige le bilan weekly. Le runtime a les infos pour logger; apres log, acquiesce et continue le weekly. Ne parle pas de signal faible: dis plutot que le signal est recupere mais encore incomplet si tout n'est pas clarifie.",
      );
    } else {
      lines.push(
        "- correction_action_oubliee_incomplete: le user corrige le bilan weekly, mais l'action ou le nombre est ambigu. Ne dis pas que c'est note/enregistre. Demande une confirmation courte avec action + nombre de repetitions.",
      );
    }
    hasSignal = true;
  }
  if (
    /\bpas des? regles?\b|\bsans regles?\b|\bpas une liste de regles\b|\borganisation concrete\b|\bparle moi de l organisation\b/
      .test(text)
  ) {
    lines.push(
      "- preference_wording: le user demande une organisation concrete. Reponds en termes d'actions, charge, jours/ordre si utile. Evite le mot regle et les principes abstraits. N'inclus aucun item support/fiche support dans l'organisation weekly.",
    );
    hasSignal = true;
  }
  if (/\bje viens de le dire\b|\bje l ai deja dit\b/.test(text)) {
    lines.push(
      "- anti_repetition: le user signale une repetition. Ne repose pas la meme clarification; resume l'etat avec les infos deja donnees.",
    );
    hasSignal = true;
  }
  return hasSignal ? lines.join("\n") : null;
}
