import {
  type SafetyCrisisPhase,
  type SafetyCrisisResponseContract,
  type SafetyCrisisWorkingState,
  safetyResponseContract,
  type SafetyRiskBand,
  type SafetySignal,
} from "./contract.ts";

export type SafetyCrisisResources = {
  emergency_numbers: string;
  suicide_prevention_number: string;
};

export const FRANCE_SAFETY_RESOURCES: SafetyCrisisResources = {
  emergency_numbers: "15 ou 112",
  suicide_prevention_number: "3114",
};

function emergencyLine(resources: SafetyCrisisResources): string {
  return `Si tu sens que tu peux passer a l'acte maintenant, appelle le ${resources.emergency_numbers} tout de suite. Pour les idees suicidaires, le ${resources.suicide_prevention_number} peut aussi t'aider maintenant.`;
}

function meansAreSafe(
  signals: SafetySignal,
  previousState: SafetyCrisisWorkingState,
): boolean {
  return signals.means_moved_away === true ||
    signals.has_means_nearby === false ||
    (previousState.has_means_nearby === false &&
      signals.has_means_nearby !== true);
}

function meansAreNearby(
  signals: SafetySignal,
  previousState: SafetyCrisisWorkingState,
): boolean {
  return signals.immediate_danger === true ||
    signals.has_means_nearby === true ||
    (previousState.has_means_nearby === true &&
      signals.means_moved_away !== true &&
      signals.has_means_nearby !== false);
}

function supportIsKnown(
  signals: SafetySignal,
  previousState: SafetyCrisisWorkingState,
): boolean {
  return signals.human_support_available === true ||
    signals.emergency_help_contacted === true ||
    signals.user_currently_alone === false ||
    previousState.human_support_mentioned === true ||
    previousState.user_not_alone === true;
}

function userIsKnownAlone(
  signals: SafetySignal,
  previousState: SafetyCrisisWorkingState,
): boolean {
  return signals.user_currently_alone === true ||
    (previousState.user_not_alone === false &&
      signals.user_currently_alone !== false);
}

function withEmergencyPrefix(
  required: boolean,
  resources: SafetyCrisisResources,
  body: string,
): string {
  return required ? `${emergencyLine(resources)} ${body}` : body;
}

export function renderSafetyReply(args: {
  phase: SafetyCrisisPhase;
  signals: SafetySignal;
  previousState: SafetyCrisisWorkingState;
  riskBand: SafetyRiskBand;
  resources?: SafetyCrisisResources;
}): { reply: string; responseContract: SafetyCrisisResponseContract } {
  const resources = args.resources ?? FRANCE_SAFETY_RESOURCES;
  const responseContract = safetyResponseContract({
    phase: args.phase,
    riskBand: args.riskBand,
    signals: args.signals,
  });
  const meansSafe = meansAreSafe(args.signals, args.previousState);
  const meansNearby = meansAreNearby(args.signals, args.previousState);
  const supportKnown = supportIsKnown(args.signals, args.previousState);
  const userKnownAlone = userIsKnownAlone(args.signals, args.previousState);
  const emergencyRequired = responseContract.must_include_emergency_numbers;

  if (args.phase === "acute_grounding") {
    if (meansSafe && supportKnown) {
      return {
        responseContract,
        reply: withEmergencyPrefix(
          emergencyRequired,
          resources,
          "Tu as deja fait les deux gestes qui comptent: ce qui pouvait te blesser est hors de portee, et tu as un lien humain maintenant. Reste avec cette personne ou au telephone; dis-moi juste si elle peut rester avec toi encore un moment.",
        ),
      };
    }
    if (meansSafe) {
      return {
        responseContract,
        reply: withEmergencyPrefix(
          emergencyRequired,
          resources,
          `C'est important que ce qui pouvait te blesser soit hors de portee. Maintenant, ne reste pas seul avec ca: appelle une personne proche ou le ${resources.suicide_prevention_number}. Qui peux-tu joindre maintenant ?`,
        ),
      };
    }
    if (supportKnown) {
      return {
        responseContract,
        reply: withEmergencyPrefix(
          emergencyRequired,
          resources,
          "Garde cette personne avec toi ou au telephone. Mets le plus de distance possible avec ce qui peut te blesser, meme en le posant dans une autre piece; dis-moi juste si c'est hors de portee.",
        ),
      };
    }
    if (meansNearby && userKnownAlone) {
      return {
        responseContract,
        reply: withEmergencyPrefix(
          emergencyRequired,
          resources,
          "Pose ou eloigne ce qui peut te blesser, puis appelle une personne proche ou va vers quelqu'un maintenant. Reste sur une seule chose: ne pas rester seul avec ca.",
        ),
      };
    }
    return {
      responseContract,
      reply: withEmergencyPrefix(
        emergencyRequired,
        resources,
        "Mets le plus de distance possible avec ce qui pourrait te blesser, meme dans une autre piece. Le point important maintenant: es-tu seul la ?",
      ),
    };
  }

  if (args.phase === "immediate_risk_check") {
    return {
      responseContract,
      reply: withEmergencyPrefix(
        emergencyRequired,
        resources,
        "Je reste sur ta securite immediate. Dis-moi juste ces deux points: est-ce que tu risques de te faire du mal maintenant, et est-ce que tu es seul ?",
      ),
    };
  }

  if (args.phase === "support_contact") {
    if (supportKnown) {
      return {
        responseContract,
        reply: withEmergencyPrefix(
          emergencyRequired,
          resources,
          meansSafe
            ? "Ce qui pouvait te blesser est hors de portee. Garde le lien avec cette personne maintenant, au telephone ou pres de toi; dis-moi juste si elle peut rester avec toi encore un moment."
            : "Garde cette personne avec toi ou au telephone. Mets ce qui peut te blesser hors de portee, puis dis-moi juste si c'est fait.",
        ),
      };
    }
    return {
      responseContract,
      reply: withEmergencyPrefix(
        emergencyRequired,
        resources,
        meansSafe
          ? `Ce qui pouvait te blesser est hors de portee; maintenant l'etape importante, c'est de ne pas rester seul avec ca. Appelle ou envoie un message a une personne proche, ou contacte le ${resources.suicide_prevention_number}. Qui peux-tu joindre maintenant ?`
          : `Mets ce qui peut te blesser hors de portee si tu peux le faire sans te mettre plus en danger. Ensuite appelle ou envoie un message a une personne proche, ou contacte le ${resources.suicide_prevention_number}. Qui peux-tu joindre maintenant ?`,
      ),
    };
  }

  if (args.phase === "stabilizing") {
    return {
      responseContract,
      reply: withEmergencyPrefix(
        emergencyRequired,
        resources,
        meansSafe && supportKnown
          ? "Tu as deja securise l'immediat. Reste avec la personne qui est la ou au telephone, et dis-lui simplement: j'ai besoin que tu restes avec moi un moment."
          : "Reste avec la personne qui est la, qui arrive, ou qui est au telephone. Garde ce qui peut blesser hors de portee et dis-lui simplement: j'ai besoin que tu restes avec moi un moment.",
      ),
    };
  }

  if (args.phase === "exit_check") {
    return {
      responseContract,
      reply: withEmergencyPrefix(
        emergencyRequired,
        resources,
        "Tu as fait les gestes immediats. Reste avec cette personne au telephone ou pres de toi encore un moment; si ca remonte, appelle-la tout de suite ou appelle le 15 ou 112.",
      ),
    };
  }

  if (args.phase === "resolved") {
    return {
      responseContract,
      reply:
        "Ok. L'immediat est stabilise et tu as un appui humain. On reprend doucement, sans pression.",
    };
  }

  return {
    responseContract,
    reply:
      "Je reste avec toi sur la securite immediate. Reponds simplement: es-tu en danger de te faire du mal maintenant ?",
  };
}
