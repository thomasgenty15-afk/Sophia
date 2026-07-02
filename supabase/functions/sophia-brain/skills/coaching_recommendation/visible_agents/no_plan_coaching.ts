import {
  ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES,
  COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
  type CoachingVisibleAgentInput,
  type CoachingVisibleAgentOutput,
  LEVER_COMPARISON_KNOWLEDGE_LINES,
  runSpecializedVisibleAgent,
} from "./shared.ts";

function fallbackForMove(input: CoachingVisibleAgentInput): string {
  const step = input.step_context.task_kind === "no_plan_coaching"
    ? input.step_context
    : null;
  const action = step?.action_title ? ` "${step.action_title}"` : "";
  if (step?.selected_feature === "attack_card") {
    return `Pour cette action${action}, je partirais sur une carte d'attaque libre: prepare a l'avance le premier geste, le contexte et la phrase de demarrage, sans la rattacher au Plan.`;
  }
  if (step?.selected_feature === "defense_card") {
    return `Pour cette action${action}, je partirais sur une carte de defense libre: prepare ce que tu fais au moment ou tu risques de decrocher, sans la rattacher au Plan.`;
  }
  if (step?.coaching_move === "clarify_outcome") {
    return `Pour cette action${action}, commence par clarifier le resultat attendu: en une phrase, qu'est-ce qui doit etre compris, decide ou obtenu ?`;
  }
  if (step?.coaching_move === "risk_preparation") {
    return `Pour cette action${action}, prepare le moment ou tu risques de decrocher: choisis une phrase simple a te redire, puis reviens au tout premier geste.`;
  }
  if (step?.coaching_move === "avoidance_plan") {
    return `Pour cette action${action}, reduis l'evitement: ouvre seulement le support, puis fais une micro-action de 2 minutes sans chercher a finir.`;
  }
  if (step?.coaching_move === "emotional_grounding") {
    return `Pour cette action${action}, commence par redescendre la pression: pose une phrase brouillon, meme imparfaite, puis reviens au premier geste concret.`;
  }
  return `Pour cette action${action}, le premier geste utile est simple: ouvre le support et traite uniquement la premiere phrase ou le premier detail.`;
}

export function runNoPlanCoachingVisibleAgent(
  input: CoachingVisibleAgentInput,
): Promise<CoachingVisibleAgentOutput | null> {
  return runSpecializedVisibleAgent({
    input,
    source: "coaching_recommendation.visible.no_plan_coaching",
    roleLines: [
      "Tu es le visible agent de coaching pour action non reliee au plan.",
      "Ta mission: repondre au user et choisir le levier fin pour une action non reliee au plan.",
      "Le dispatcher local te donne un hint via step_context.selected_feature; ce n'est pas une decision finale.",
      "Tu peux choisir un autre levier dans ton perimetre si le dernier message user montre une meilleure option.",
      "Perimetre ferme: visible_decision.lever doit etre free_attack_card, free_defense_card ou coaching_only.",
      "Si step_context.selected_feature=attack_card, tu peux recommander une carte d'attaque libre, sans la presenter comme liee au Plan.",
      "Si step_context.selected_feature=defense_card, tu peux recommander une carte de defense libre, sans la presenter comme liee au Plan.",
      "Si step_context.selected_feature=null, fais seulement du coaching classique.",
      "Si le dernier message demande seulement a comprendre l'objectif, l'intention, le sens, les mots Sophia ou la difference entre options, choisis visible_decision.lever=coaching_only sauf si le user demande clairement une carte.",
      "Si le dernier message dit qu'il ne veut pas de support, carte, preparation ou feature tout de suite, choisis visible_decision.lever=coaching_only et aide conversationnellement sans pousser de carte.",
      "Si le user est novice, dit qu'il ne connait pas les mots Sophia, ou demande 'c'est quoi' / 'ca veut dire quoi', explique d'abord les termes simplement avant de revenir a la recommandation.",
      "Si le dernier message demande une difference entre leviers, compare les leviers concernes avant de rappeler pourquoi celui choisi convient ici.",
      "Tu ne dis jamais d'aller dans Plan, mission ou habitude.",
      "Tu ne dis jamais ajustement du plan.",
      "Tu ne dis jamais que la carte est rattachee a une action du Plan.",
      "Tu ne proposes jamais de potion.",
      "Si le user demande ou trouver, ou preparer, comment acceder ou consulter une carte libre deja recommandee dans ce flow: reponds toi-meme a partir des elements UI ci-dessous, sans renvoyer vers product_help.",
      "Elements UI carte d'attaque libre: surface=Dashboard > Ressources; object_type=carte d'attaque libre; relation_to_plan=hors_plan; user_action=ouvrir Ressources puis choisir ou creer ce type de carte; wording_constraint=repondre comme un chemin d'action UI naturel, pas comme un label de categorie.",
      "Elements UI carte de defense libre: surface=Dashboard > Ressources; object_type=carte de defense libre; relation_to_plan=hors_plan; user_action=ouvrir Ressources puis choisir ou creer ce type de carte; wording_constraint=repondre comme un chemin d'action UI naturel, pas comme un label de categorie.",
      "Contrainte de wording pour les destinations libres: n'utilise pas une tournure 'comme/en tant que' suivie du type de carte; transforme les elements UI en action utilisateur naturelle.",
      "Ressources est le bon endroit pour les cartes libres hors plan; Dashboard > Plan est interdit pour une action hors plan.",
      "Tu donnes un conseil concret adapte au coaching_move fourni.",
      ...COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
      ...LEVER_COMPARISON_KNOWLEDGE_LINES,
      ...ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES,
      "Pour action hors plan: si une carte est recommandee, presente-la comme carte libre, pas comme carte liee au Plan.",
    ],
    fallback: fallbackForMove,
  });
}
