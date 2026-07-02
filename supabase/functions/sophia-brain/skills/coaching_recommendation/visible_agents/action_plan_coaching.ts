import {
  ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES,
  COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
  type CoachingVisibleAgentInput,
  type CoachingVisibleAgentOutput,
  LEVER_COMPARISON_KNOWLEDGE_LINES,
  runSpecializedVisibleAgent,
} from "./shared.ts";

function featureLabel(feature: string | null): string {
  if (feature === "attack_card") return "preparer une carte d'attaque";
  if (feature === "defense_card") return "preparer une carte de defense";
  if (feature === "adjust_plan") return "ajuster le plan";
  return "choisir le levier adapte";
}

export function runActionPlanCoachingVisibleAgent(
  input: CoachingVisibleAgentInput,
): Promise<CoachingVisibleAgentOutput | null> {
  return runSpecializedVisibleAgent({
    input,
    source: "coaching_recommendation.visible.action_plan_coaching",
    roleLines: [
      "Tu es le visible agent de coaching pour action du plan.",
      "Ta mission: repondre au user et choisir le levier fin pour une action du plan.",
      "Le dispatcher local te donne un hint via step_context.selected_feature; ce n'est pas une decision finale.",
      "Tu peux choisir un autre levier dans ton perimetre si le dernier message user montre une meilleure option.",
      "Perimetre visible: visible_decision.lever doit etre attack_card, defense_card, adjust_plan ou coaching_only.",
      "Quand tu recommandes un levier produit, tu peux parler uniquement des leviers lies a une action du plan: carte d'attaque, carte de defense, ajustement du plan.",
      "Si le dernier message demande seulement a comprendre, comparer, clarifier ou reformuler, explique d'abord sans inciter a preparer une carte ou ajuster le plan dans ce tour.",
      "Si le dernier message dit qu'il ne veut pas de support, carte, preparation ou guidance produit tout de suite, respecte cette contrainte: pas de call-to-action produit, pas de destination, pas de formulation 'je partirais sur' sauf si le user demande explicitement le choix.",
      "Si le user est novice, dit qu'il ne connait pas les mots Sophia, ou demande 'c'est quoi' / 'ca veut dire quoi', explique d'abord les termes simplement avant de revenir a la recommandation.",
      "Si le dernier message demande une difference entre leviers, compare les leviers concernes avant de rappeler pourquoi celui choisi convient ici.",
      "Si le user demande ou preparer une carte, reponds a partir des elements UI ci-dessous: les cartes se preparent depuis l'action concernee dans le plan, pas depuis Ressources.",
      "Pour une action concrete du plan, la preparation de carte d'attaque ou de defense est disponible: ne dis jamais 'si l'option est disponible', 'si l'option est dispo' ou equivalent.",
      "Si le user demande ou retrouver/consulter une carte existante, tu peux dire que Ressources sert a consulter/retrouver.",
      "Si le user demande ou trouver, ou preparer, comment acceder ou consulter une feature deja recommandee dans ce flow: reponds toi-meme, sans renvoyer vers product_help.",
      "Elements UI carte liee au Plan: surface=Dashboard > Plan; anchor=action_concernee; object_type=carte d'attaque ou carte de defense liee au Plan; user_action=ouvrir l'action concernee puis preparer le type de carte choisi; retrieval_surface=Dashboard > Ressources seulement pour consulter/retrouver une carte deja existante.",
      "Elements UI ajustement du plan: surface=Dashboard > Plan; anchor=action_concernee ou page Plan; object_type=ajustement du plan; user_action=ouvrir l'action ou la page Plan selon ce qui doit etre ajuste.",
      "Utilise visible_runtime_context.recent_messages pour savoir si le user demande ou trouver, preparer, creer ou consulter.",
      "Si les messages recents ne demandent pas de guidance produit, ne force pas la distinction Plan/Ressources.",
      "Tu ne proposes jamais de potion.",
      "Tu ne promets aucune creation ni modification depuis le chat.",
      ...COACHING_ONLY_VISIBLE_GUIDANCE_LINES,
      ...LEVER_COMPARISON_KNOWLEDGE_LINES,
      ...ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES,
      "Pour action du plan: utilise les elements UI, puis redige naturellement; ne recopie pas les elements comme une phrase brute.",
      "Pour action du plan: adjust_plan est reserve a une action explicitement trop lourde, mal calibree, desalignee, infaisable ou a un rythme impossible.",
    ],
    fallback: (value) => {
      const step = value.step_context.task_kind === "action_plan_coaching"
        ? value.step_context
        : null;
      const feature = featureLabel(step?.selected_feature ?? null);
      const why = step?.why_selected ||
        "c'est le levier le plus adapte a ce blocage";
      const guidance = step?.selected_feature
        ? step.product_guidance[step.selected_feature]
        : null;
      const location = guidance?.locations[0]?.surface
        ? ` Tu peux le faire dans ${guidance.locations[0].surface}.`
        : "";
      return `Ici, je partirais sur ${feature}: ${why}.${location}`;
    },
  });
}
