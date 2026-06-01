export type ToolOpportunityType =
  | "attack_card"
  | "defense_card"
  | "portion"
  | "plan_adjustment"
  | "state_potion"
  | "self_reminder"
  | string;

export type RecommendationOperationType =
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "adjust_plan_item"
  | "select_state_potion"
  | "create_recurring_reminder"
  | string
  | null
  | undefined;

export function renderToolSkillOpportunityOfferText(args: {
  opportunityType: ToolOpportunityType;
  targetHint?: string | null;
  surfaceLabel?: string | null;
}): string {
  const target = String(args.targetHint ?? "").trim();
  const surface = String(args.surfaceLabel ?? "").trim();
  const suffix = target ? ` pour "${target}"` : "";
  switch (args.opportunityType) {
    case "attack_card":
      return `Je vois surtout une friction de lancement${suffix}. Si tu veux, on peut en faire une petite ${
        surface || "carte d'attaque"
      } pour rendre le démarrage plus simple.`;
    case "defense_card":
      return `Je vois un risque récurrent${suffix}. Si tu veux, on peut préparer une ${
        surface || "carte de défense"
      } pour ce moment précis.`;
    case "portion":
      return `Je vois que l'action pourrait gagner à être plus petite ou plus claire${suffix}. Si tu veux, on peut la découper proprement sans tout refaire.`;
    case "plan_adjustment":
      return `Je vois un possible problème de fit avec le plan${suffix}. Si tu veux, on peut regarder un ajustement sans l'appliquer sans ton accord.`;
    case "state_potion":
      return `Je vois surtout un état interne à réguler. Si tu veux, on peut choisir une ${
        surface || "potion d'état"
      } avant de reparler action.`;
    case "self_reminder":
      return "Je vois une phrase utile à garder. Si tu veux, on peut en faire un rappel pour toi-même.";
    default:
      return "";
  }
}

export function renderRecommendationToolVisibleReply(args: {
  responseContent: string;
  surfaceLabel: string;
  operationType: RecommendationOperationType;
  fromDispatcherOpportunity: boolean;
  explicitToolAsk: boolean;
  resolvedTargetTitle?: string | null;
  naturalOffer?: string | null;
}): string {
  const response = String(args.responseContent ?? "").trim();
  const targetTitle = String(args.resolvedTargetTitle ?? "").trim();
  const naturalOffer = String(args.naturalOffer ?? "").trim() ||
    "on rend l'action plus petite pour qu'elle soit faisable même quand tu décroches";

  if (
    args.fromDispatcherOpportunity && !args.explicitToolAsk &&
    args.operationType === "select_state_potion"
  ) {
    return response;
  }

  if (args.fromDispatcherOpportunity && !args.explicitToolAsk) {
    const targetText = targetTitle ? ` pour "${targetTitle}"` : "";
    return `${response}\n\nConcrètement, je parle d'une ${args.surfaceLabel}${targetText}, à préparer seulement si tu confirmes.`;
  }

  if (args.operationType === "prepare_attack_card") {
    if (targetTitle) {
      return `Le plus simple ici, c'est "${args.surfaceLabel}" : on garde ton plan tel quel et on crée une version de démarrage de "${targetTitle}". Tu veux que je la prépare ?`;
    }
    return `Je peux te proposer une "${args.surfaceLabel}", mais je veux la rattacher à la bonne action. Tu parles de quelle action exactement ?`;
  }

  const targetText = targetTitle ? ` "${targetTitle}"` : " l'action la plus lourde";
  return `Le plus simple ici, c'est l'outil "${args.surfaceLabel}" : ${naturalOffer}. Tu veux qu'on l'utilise pour alléger${targetText} maintenant ?`;
}
