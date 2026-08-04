import {
  COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
  type CoachingVisibleAgentInput,
  type CoachingVisibleAgentOutput,
  LEVER_COMPARISON_KNOWLEDGE_LINES,
  runSpecializedVisibleAgent,
} from "./shared.ts";

// W2.B: la BRANCHE POTION de cet agent est supprimée. Le coaching émotionnel
// n'a plus aucun levier produit à recommander — W2.A avait déjà figé
// `EmotionCoachingStepContext.selected_feature` à `null` — il reste
// conversationnel et `visible_decision.lever` vaut toujours `coaching_only`.
// Étaient portés ici et sont partis: le catalogue des 6 potions, l'explication
// canonique du suivi 7 jours, la destination Dashboard > Ressources > Potions,
// la doctrine go-ahead/consentement-consommé (P12-G) et l'aveu d'absence de
// persistance depuis le chat. Aucune de ces phrases n'a plus d'objet.

export function runEmotionCoachingVisibleAgent(
  input: CoachingVisibleAgentInput,
): Promise<CoachingVisibleAgentOutput | null> {
  return runSpecializedVisibleAgent({
    input,
    source: "coaching_recommendation.visible.emotion_coaching",
    roleLines: [
      "Tu es le visible agent de coaching emotionnel.",
      "Pacing d'entree (eva-r8 B01): si c'est le PREMIER tour du flow (aucun message assistant de ce flow dans recent_messages) et que le user MINIMISE sa divulgation ('c'est surement rien', 'c'est bete mais...'), ta reponse est un reflet + UNE question d'exploration.",
      "Ta mission: repondre au user sur un etat emotionnel global, non rattache a une action concrete.",
      "Perimetre visible: visible_decision.lever doit valoir coaching_only, et visible_decision.potion_type reste null. Aucun levier produit n'est recommandable en coaching emotionnel.",
      "Tu ne proposes AUCUN dispositif, carte, outil ou surface produit dans ce flow. Si le user en demande un explicitement, dis honnetement que ce n'est pas ce que tu proposes ici — jamais une destination inventee, jamais une promesse de creation.",
      "Si le contexte parle d'une action concrete a demarrer, tenir ou terminer, ne reste pas en coaching emotionnel: le dispatcher aurait du garder un agent d'action.",
      "Si le dernier message demande seulement a comprendre, clarifier ou reformuler, explique d'abord.",
      "Si le dernier message dit qu'il ne veut pas de support ou de guidance produit tout de suite, respecte cette contrainte: pas de call-to-action produit ni destination.",
      "Utilise visible_runtime_context.recent_messages pour rester sur ce que le user vient de dire; ne force jamais une navigation produit.",
      ...COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
      ...LEVER_COMPARISON_KNOWLEDGE_LINES,
      "Tu ne parles jamais de carte d'attaque, carte de defense, ajustement du plan, mission ou habitude.",
      "Tu ne promets aucune creation ni execution depuis le chat.",
    ],
    fallback: (value) => {
      const step = value.step_context.task_kind === "emotion_coaching"
        ? value.step_context
        : null;
      const state = step?.state_hint ? ` avec ${step.state_hint}` : "";
      return `Là, je resterais sur ce que tu traverses${state}: l’objectif est d’abord de te remettre dans un état plus praticable avant de décider quoi faire.`;
    },
  });
}
