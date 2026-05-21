import {
  baseOutput,
  normalizeText,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";

type SafetyCrisisPhase =
  | "entry"
  | "immediate_risk_check"
  | "acute_grounding"
  | "support_contact"
  | "stabilizing"
  | "exit_check"
  | "resolved";

type SafetyCrisisWorkingState = {
  phase?: SafetyCrisisPhase;
  risk_band?: string;
  trigger_summary?: string | null;
  immediate_danger?: boolean | null;
  has_means_nearby?: boolean | null;
  user_not_alone?: boolean | null;
  emergency_help_mentioned?: boolean;
  human_support_mentioned?: boolean;
  consecutive_deescalated_turns?: number;
  last_user_safety_signal?: string | null;
  last_assistant_safety_step?: string | null;
};

type SafetyCrisisSignals = {
  crisisSignal: boolean;
  immediateDanger: boolean;
  clarifiedNonImmediate: boolean;
  meansMovedAway: boolean;
  meansStillNearby: boolean;
  humanSupport: boolean;
  currentlyAlone: boolean | null;
};

function workingState(input: RunSkillInput): SafetyCrisisWorkingState {
  const raw = input.context.active_skill_working_state?.working_state;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as SafetyCrisisWorkingState
    : {};
}

function includesSafetyCrisisSignal(text: string): boolean {
  return /me faire du mal|suicid|en finir|mourir|disparaitre|disparaître|ne pas me reveiller|pas me reveiller|ne plus exister|plus exister|prendre tous les cachets|prendre tout les cachets|avaler tous les cachets|avaler tout les cachets|foncer dans|me jeter|sauter du|sauter par|plus envie de vivre|faire une connerie|me blesser|passer a l'acte|passer à l'acte/
    .test(text);
}

function detectsImmediateDanger(text: string): boolean {
  return /maintenant|tout de suite|ce soir|la maintenant|là maintenant|je vais le faire|je suis sur le point|je suis au bord|j'ai .*main|j ai .*main|couteau|lame|cachets|medicaments|médicaments|fenetre|fenêtre|balcon|corde|foncer dans|me jeter|rails?|metro|métro/
    .test(text);
}

function detectsNonImmediateClarification(text: string): boolean {
  return /pas maintenant|je ne vais pas|je vais pas|pas en danger|je suis en securite|je suis en sécurité|je ne veux pas me faire du mal|je veux pas me faire du mal|je ne vais rien faire|je vais rien faire|pas de passage a l'acte|pas de passage à l'acte/
    .test(text);
}

function detectsMeansMovedAway(text: string): boolean {
  return /j['’]?ai pose|j ai pose|j['’]?ai posé|j ai posé|j['’]?ai mis|j ai mis|eloigne|éloigné|loin de moi|plus a portee|plus à portée|hors de portee|hors de portée|range|rangé|dans une autre piece|dans une autre pièce|dans la salle de bain|aucun (cachet|medicament|médicament) pres de moi|aucun (cachet|medicament|médicament) près de moi|pas de (cachets?|medicaments?|médicaments?) pres de moi|pas de (cachets?|medicaments?|médicaments?) près de moi/
    .test(text);
}

function detectsMeansStillNearby(text: string): boolean {
  if (/aucun (cachet|medicament|médicament) pres de moi|aucun (cachet|medicament|médicament) près de moi|pas de (cachets?|medicaments?|médicaments?) pres de moi|pas de (cachets?|medicaments?|médicaments?) près de moi/.test(text)) {
    return false;
  }
  return /dans ma main|dans les mains|dans ma poche|devant moi|sur moi|a cote de moi|à côté de moi|pres de moi|près de moi|dans ma chambre|je tiens (le|la|les|un|une)|j'ai le couteau|j ai le couteau|j'ai la lame|j ai la lame|j'ai les cachets|j ai les cachets/
    .test(text);
}

function detectsHumanSupport(text: string): boolean {
  return /pas seul|pas seule|avec quelqu|avec ma coloc|avec mon coloc|coloc est la|coloc est là|quelqu'un arrive|quelqu’un arrive|quelqu'un est la|quelqu’un est la|elle est la|il est la|ils sont la|elles sont la|au telephone avec moi|en ligne avec moi|reste au telephone|j'appelle|je vais appeler|j ai appele|j'ai appele|j'ai appelé|je viens d appeler|ma soeur|ma sœur|mon frere|mon frère|mon cousin|ma cousine|ami|amie|proche|secours|samu|112|15|3114/
    .test(text);
}

function detectsCurrentlyAlone(text: string): boolean | null {
  if (/pas seul|pas seule|plus seul|plus seule|avec ma coloc|avec mon coloc|ma soeur est (la |là )?avec moi|ma sœur est (la |là )?avec moi|mon frere est (la |là )?avec moi|mon frère est (la |là )?avec moi|mon cousin est (la |là )?avec moi|ma cousine est (la |là )?avec moi|mon cousin est la|mon cousin est là|ma cousine est la|ma cousine est là|un ami est (la |là )?avec moi|une amie est (la |là )?avec moi|elle est avec moi|il est avec moi|quelqu'un est avec moi|quelqu’un est avec moi|elle est la|il est la|quelqu'un est la|quelqu’un est la|au telephone avec moi|en ligne avec moi|reste au telephone/.test(text)) {
    return false;
  }
  if (/je suis seul|je suis seule|encore seul|encore seule|tout seul|toute seule/.test(text)) {
    return true;
  }
  return null;
}

function safetySignals(text: string): SafetyCrisisSignals {
  const crisisSignal = includesSafetyCrisisSignal(text);
  const clarifiedNonImmediate = detectsNonImmediateClarification(text);
  const meansMovedAway = detectsMeansMovedAway(text);
  const meansStillNearby = detectsMeansStillNearby(text);
  const humanSupport = detectsHumanSupport(text);
  const currentlyAlone = detectsCurrentlyAlone(text);
  const rawImmediateDanger = detectsImmediateDanger(text);
  const stabilizingEvidence = clarifiedNonImmediate || meansMovedAway ||
    humanSupport || currentlyAlone === false;
  const immediateDanger = meansStillNearby ||
    (rawImmediateDanger && !stabilizingEvidence);
  return {
    crisisSignal,
    immediateDanger,
    clarifiedNonImmediate,
    meansMovedAway,
    meansStillNearby,
    humanSupport,
    currentlyAlone,
  };
}

function nextPhase(args: {
  previous: SafetyCrisisWorkingState;
  riskBand: string;
  signals: SafetyCrisisSignals;
}): SafetyCrisisPhase {
  const previousDeescalations = Number(
    args.previous.consecutive_deescalated_turns ?? 0,
  );
  const userNotAlone = args.signals.currentlyAlone === false ||
    args.previous.user_not_alone === true;
  const userKnownAlone = args.signals.currentlyAlone === true ||
    (args.previous.user_not_alone === false &&
      args.signals.currentlyAlone !== false);
  const supportAvailable = userNotAlone || args.signals.humanSupport;
  const meansAway = args.signals.meansMovedAway ||
    args.previous.has_means_nearby === false;
  const meansNearby = args.signals.meansStillNearby ||
    (args.previous.has_means_nearby === true && !args.signals.meansMovedAway);
  if (
    args.signals.clarifiedNonImmediate && userNotAlone && !meansNearby &&
    previousDeescalations >= 1
  ) {
    return "resolved";
  }
  if (args.signals.clarifiedNonImmediate && supportAvailable) {
    return "exit_check";
  }
  if (args.signals.immediateDanger) return "acute_grounding";
  if (meansNearby && userKnownAlone) return "acute_grounding";
  if (meansNearby) return "immediate_risk_check";
  if (meansAway && !userNotAlone) return "support_contact";
  if (supportAvailable) return "stabilizing";
  if (args.signals.clarifiedNonImmediate) {
    return previousDeescalations >= 1 ? "exit_check" : "immediate_risk_check";
  }
  if (args.riskBand === "high") return "immediate_risk_check";
  if (args.previous.phase === "support_contact") return "support_contact";
  if (args.previous.phase === "exit_check") return "exit_check";
  return "stabilizing";
}

function effectiveRiskBand(
  phase: SafetyCrisisPhase,
  fallback: string,
): string {
  if (phase === "resolved") return "low";
  if (phase === "exit_check" || phase === "stabilizing") return "medium";
  if (phase === "support_contact" || phase === "immediate_risk_check") {
    return "high";
  }
  if (phase === "acute_grounding") {
    return fallback === "critical" ? "critical" : "high";
  }
  return fallback;
}

function replyForPhase(
  phase: SafetyCrisisPhase,
  signals: SafetyCrisisSignals,
  previous: SafetyCrisisWorkingState,
): string {
  if (phase === "acute_grounding") {
    const userKnownAlone = signals.currentlyAlone === true ||
      (previous.user_not_alone === false && signals.currentlyAlone !== false);
    const meansNearby = signals.immediateDanger ||
      signals.meansStillNearby ||
      (previous.has_means_nearby === true && !signals.meansMovedAway);
    if (meansNearby && userKnownAlone) {
      return "Je prends ca au serieux. Comme tu es seul, appelle le 15 ou le 112 tout de suite si tu peux te faire du mal maintenant; pour des idees suicidaires, le 3114 peut aussi t'aider. D'abord, eloigne ce qui pourrait te blesser, puis contacte une personne proche sans rester seul avec ca. 🧭";
    }
    return signals.immediateDanger
      ? "Je prends ca au serieux. Si tu peux te faire du mal maintenant, appelle le 15 ou le 112 tout de suite; si c'est lie a des idees suicidaires, le 3114 peut aussi t'aider maintenant. La premiere chose: eloigne de toi ce qui pourrait te blesser, puis dis-moi juste si tu es seul la. 🧭"
      : "On ralentit maintenant. Eloigne d'abord ce qui pourrait te blesser, meme d'un metre ou dans une autre piece. Ensuite reponds-moi seulement: tu es seul la, oui ou non ? 🧭";
  }
  if (phase === "immediate_risk_check") {
    return "Je reste sur la securite, pas sur le reste. Dis-moi juste deux choses: est-ce que tu es en danger de te faire du mal maintenant, et est-ce que tu es seul ? 🧭";
  }
  if (phase === "support_contact") {
    if (signals.humanSupport) {
      return "Bien, le fait d'avoir mis ce qui peut blesser loin de toi compte. Continue le contact avec cette personne: demande-lui clairement de venir maintenant ou de rester au telephone avec toi, et garde ce qui pourrait blesser hors de portee. Dis-moi quand quelqu'un est avec toi.";
    }
    return "Bien, le fait d'avoir mis ce qui peut blesser loin de toi compte. Maintenant ne reste pas seul avec ca: appelle ou envoie un message a une personne proche, ou contacte le 3114 si les idees restent fortes. Qui peux-tu joindre maintenant ?";
  }
  if (phase === "stabilizing") {
    return "Ok, tu as fait les bons gestes: tu n'es plus seul avec ca, et on reste sur les prochaines minutes. Garde ce qui pourrait blesser hors de portee, reste avec la personne qui arrive ou qui est la, et dis-lui simplement: j'ai besoin que tu restes avec moi un moment.";
  }
  if (phase === "exit_check") {
    return "Je t'entends: le danger immediat semble ecarte. Avant de sortir du mode securite, confirme-moi juste deux choses: tu ne vas pas te faire de mal maintenant, et tu restes avec quelqu'un ou tu peux rappeler quelqu'un si ca remonte.";
  }
  if (phase === "resolved") {
    return "Ok. Je garde seulement que le danger immediat est ecarte et que tu n'es pas seul. On sort du mode securite; on peut reprendre doucement, sans outil ni pression pour l'instant.";
  }
  return "Je reste avec toi sur la securite immediate. Reponds-moi simplement: tu es en danger de te faire du mal maintenant ?";
}

export function runSafetyCrisisSkill(input: RunSkillInput) {
  const text = normalizeText(input.user_message);
  const previous = workingState(input);
  const sourceRiskBand = input.context.turn_frame.safety.risk_band;
  const signals = safetySignals(text);
  const critical = sourceRiskBand === "critical" && signals.immediateDanger;
  const phase = nextPhase({
    previous,
    riskBand: sourceRiskBand,
    signals,
  });
  const riskBand = effectiveRiskBand(phase, sourceRiskBand);
  const consecutiveDeescalatedTurns = signals.clarifiedNonImmediate ||
      signals.humanSupport || signals.meansMovedAway ||
      signals.currentlyAlone === false
    ? Number(previous.consecutive_deescalated_turns ?? 0) + 1
    : 0;
  const reply = replyForPhase(phase, signals, previous);
  const status = phase === "resolved" ? "exit" : "continue";
  return baseOutput("safety_crisis", {
    status,
    response_intent: phase === "resolved"
      ? "deescalate_and_exit"
      : phase === "acute_grounding"
      ? "ground_safety"
      : "continue_safety_flow",
    reply,
    diagnosis: {
      critical,
      phase,
      source_risk_band: sourceRiskBand,
      risk_band: riskBand,
      immediate_danger: signals.immediateDanger,
      clarified_non_immediate: signals.clarifiedNonImmediate,
      means_moved_away: signals.meansMovedAway,
      means_still_nearby: signals.meansStillNearby,
      human_support: signals.humanSupport,
      currently_alone: signals.currentlyAlone,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: ["no_product_push_during_safety"],
    },
    operation_suggestions: [],
    memory_write_candidates: [
      statementCandidate(
        input.user_message,
        input.context.turn_frame.source_message_id,
        sourceRiskBand === "critical" || sourceRiskBand === "high" ? 4 : 3,
        false,
      ),
    ],
    state_patch: {
      phase,
      risk_band: riskBand,
      trigger_summary: previous.trigger_summary ??
        (signals.crisisSignal ? input.user_message.slice(0, 180) : null),
      immediate_danger: signals.immediateDanger,
      has_means_nearby: signals.meansMovedAway
        ? false
        : signals.meansStillNearby
        ? true
        : previous.has_means_nearby ?? null,
      user_not_alone: signals.currentlyAlone === false
        ? true
        : signals.currentlyAlone === true
        ? false
        : previous.user_not_alone ?? null,
      emergency_help_mentioned: previous.emergency_help_mentioned || critical,
      human_support_mentioned: previous.human_support_mentioned ||
        signals.humanSupport,
      consecutive_deescalated_turns: consecutiveDeescalatedTurns,
      last_user_safety_signal: input.user_message.slice(0, 220),
      last_assistant_safety_step: reply.slice(0, 220),
      summary: phase === "resolved"
        ? "Safety crisis deescalated; immediate danger clarified as absent."
        : critical
        ? "Critical safety support active."
        : "Safety support active.",
    },
  });
}
