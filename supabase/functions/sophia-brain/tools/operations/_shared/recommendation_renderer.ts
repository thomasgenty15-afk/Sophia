export type RecommendationOperationType =
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "adjust_plan_item"
  | "select_state_potion"
  | "create_recurring_reminder"
  | string
  | null
  | undefined;

export function renderRecommendationToolVisibleReply(args: {
  responseContent: string;
  surfaceLabel: string;
  operationType: RecommendationOperationType;
  explicitToolAsk: boolean;
  resolvedTargetTitle?: string | null;
  naturalOffer?: string | null;
}): string {
  const response = String(args.responseContent ?? "").trim();
  const targetTitle = String(args.resolvedTargetTitle ?? "").trim();
  const naturalOffer = String(args.naturalOffer ?? "").trim() ||
    "on rend l'action plus petite pour qu'elle soit faisable même quand tu décroches";

  if (args.operationType === "prepare_attack_card") {
    if (targetTitle) {
      return `Le plus simple ici, c'est "${args.surfaceLabel}" : on garde ton plan tel quel et on crée une version de démarrage de "${targetTitle}". Tu veux que je la prépare ?`;
    }
    return `Je peux te proposer une "${args.surfaceLabel}", mais je veux la rattacher à la bonne action. Tu parles de quelle action exactement ?`;
  }

  const targetText = targetTitle ? ` "${targetTitle}"` : " l'action la plus lourde";
  return `Le plus simple ici, c'est l'outil "${args.surfaceLabel}" : ${naturalOffer}. Tu veux qu'on l'utilise pour alléger${targetText} maintenant ?`;
}
