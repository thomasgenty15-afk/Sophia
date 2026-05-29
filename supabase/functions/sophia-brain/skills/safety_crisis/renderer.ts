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
  return `Si tu peux te faire du mal maintenant, appelle le ${resources.emergency_numbers} maintenant; pour les idees suicidaires, le ${resources.suicide_prevention_number} est aussi la.`;
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
  const emergency = responseContract.must_include_emergency_numbers
    ? `${emergencyLine(resources)} `
    : "";

  if (args.phase === "acute_grounding") {
    const userKnownAlone = args.signals.user_currently_alone === true ||
      (args.previousState.user_not_alone === false &&
        args.signals.user_currently_alone !== false);
    const meansNearby = args.signals.immediate_danger === true ||
      args.signals.has_means_nearby === true ||
      (args.previousState.has_means_nearby === true &&
        args.signals.means_moved_away !== true);
    if (meansNearby && userKnownAlone) {
      return {
        responseContract,
        reply:
          `${emergency}Pose ou eloigne ce qui peut te blesser, puis appelle une personne proche ou va vers quelqu'un maintenant. Reste sur une seule chose: ne pas rester seul avec ca.`,
      };
    }
    return {
      responseContract,
      reply:
        `${emergency}Eloigne d'abord ce qui pourrait te blesser, meme dans une autre piece. Ensuite reponds seulement: es-tu seul la ?`,
    };
  }

  if (args.phase === "immediate_risk_check") {
    return {
      responseContract,
      reply:
        `${emergency}Je reste sur ta securite immediate. Reponds juste a ces deux points: es-tu en danger de te faire du mal maintenant, et es-tu seul ?`,
    };
  }

  if (args.phase === "support_contact") {
    if (args.signals.human_support_available === true) {
      return {
        responseContract,
        reply:
          "Bien, garde ce qui peut blesser hors de portee. Demande clairement a cette personne de venir maintenant ou de rester au telephone avec toi. Dis-moi quand quelqu'un est avec toi.",
      };
    }
    return {
      responseContract,
      reply:
        `Bien, garde ce qui peut blesser hors de portee. Maintenant, ne reste pas seul avec ca: appelle ou envoie un message a une personne proche, ou contacte le ${resources.suicide_prevention_number} si les idees restent fortes. Qui peux-tu joindre maintenant ?`,
    };
  }

  if (args.phase === "stabilizing") {
    return {
      responseContract,
      reply:
        "Ok, reste avec la personne qui est la, qui arrive, ou qui est au telephone. Garde ce qui peut blesser hors de portee et dis-lui simplement: j'ai besoin que tu restes avec moi un moment.",
    };
  }

  if (args.phase === "exit_check") {
    return {
      responseContract,
      reply:
        "Avant de sortir du mode securite, confirme seulement: tu ne vas pas te faire de mal maintenant, et tu peux rester avec quelqu'un ou rappeler quelqu'un si ca remonte ?",
    };
  }

  if (args.phase === "resolved") {
    return {
      responseContract,
      reply:
        "Ok. Le danger immediat est ecarte et tu as un appui humain. On sort du mode securite; on reprend doucement, sans pression.",
    };
  }

  return {
    responseContract,
    reply:
      "Je reste avec toi sur la securite immediate. Reponds simplement: es-tu en danger de te faire du mal maintenant ?",
  };
}
