import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import {
  committedOneShotReminderKnown,
  directEffectContextCommittedThisTurn,
  oneShotReminderCanonicalVisiblePromptLines,
  oneShotReminderVisibleContextPresent,
} from "../../../router/one_shot_reminder_prompt_contract.ts";
import {
  VISIBLE_CONVERSATION_FLOW_RULES,
  VISIBLE_OUTPUT_STYLE_RULES,
} from "../../../router/response_style_policy.ts";
import { userIdentityVisiblePromptLines } from "../../../context/user_identity.ts";
import type {
  CoachingAttackCardTechnique,
  CoachingPotionType,
  CoachingRecommendationFlowContext,
  CoachingVisibleDecision,
  CoachingVisibleDecisionLever,
  CoachingVisibleStepContext,
} from "../contract.ts";

export type CoachingVisibleAgentInput = {
  user_id: string;
  request_id?: string | null;
  visible_runtime_context: {
    recent_messages: Array<{
      role: "user" | "assistant";
      content: string;
      created_at?: string | null;
    }>;
    recent_effects_summary?: string | null;
    user_identity?: {
      first_name: string | null;
      age: number | null;
      gender: "male" | "female" | "other" | null;
    } | null;
  };
  flow_context: CoachingRecommendationFlowContext;
  step_context: CoachingVisibleStepContext;
};

export type CoachingRecommendationVisibleAgent = (
  input: CoachingVisibleAgentInput,
) => Promise<CoachingVisibleAgentOutput | string | null>;

export type CoachingVisibleAgentOutput = {
  message: string;
  visible_decision: CoachingVisibleDecision | null;
};

export const COACHING_VISIBLE_GLOBAL_RULES = [
  "Regles globales visibles:",
  "- Francais naturel, tutoiement, message court.",
  "- Ne mentionne jamais route, dispatcher, reducer, JSON, DB, note_information, prompt, tool ou outil interne.",
  "- Ne promets jamais une creation, sauvegarde, activation, programmation, modification ou execution de carte, potion, plan, preference ou feature Sophia depuis le chat.",
  "- Exception stricte: si flow_context.direct_effect_confirmation_context.one_shot_reminder.committed=true ou si visible_runtime_context.recent_effects_summary prouve une ligne 'Rappel ponctuel cree: execute et persiste' avec etat DB actuel, tu peux confirmer sobrement le rappel en suivant strictement les regles one_shot_reminder ci-dessous: confirmation active uniquement sur le tour du commit; sur les tours suivants, seulement si le user en parle — jamais en preambule d'un tour qui porte sur autre chose. Cette exception ne permet pas de dire qu'une carte, potion, plan, preference ou feature a ete creee.",
  "- Si visible_runtime_context.recent_effects_summary contient un effet recent, utilise-le seulement si le user demande ce qui vient d'etre fait, programme, note, valide ou annule, ou pour eviter de contredire un effet recent. Ne nomme jamais EffectLedger et ne le mentionne pas spontanement.",
  "- Ne cite jamais recurring_reminder, coach_preferences, one_shot_reminder, track_progress, track_progress_plan_item ou platform.",
  "- step_context.selected_feature est une hypothese initiale du dispatcher, pas une decision finale. Tu peux reviser la feature dans ton perimetre si le dernier message user donne une cause plus precise ou corrige le diagnostic.",
  "- Respecte le scope et la destination de step_context. Ne change pas de type de coaching, ne change pas de surface produit hors des regles UI du scope courant.",
  VISIBLE_CONVERSATION_FLOW_RULES,
  "- Si le dernier message demande une definition, une explication, une difference, une clarification, un exemple concret ou une destination produit, reponds d'abord a cette demande precise avant de rappeler la recommandation.",
  "- Si le dernier message demande seulement a comprendre, comparer, clarifier ou reformuler, ne pousse pas une feature par reflexe: explique d'abord, puis mentionne une feature seulement si elle aide directement la demande actuelle.",
  "- Si le dernier message indique explicitement que le user ne veut pas de support, carte, potion, feature ou guidance produit maintenant, respecte cette contrainte dans la reponse visible.",
  "- Pour un user novice qui dit qu'il ne connait pas les mots Sophia, definis les termes simplement; ne repete pas seulement la recommandation.",
  "- Continuite d'engagement: si ta derniere reponse (role assistant dans visible_runtime_context.recent_messages) proposait un sous-livrable conversationnel (une phrase, un exemple, un resume, une reformulation) et que le dernier message user l'accepte, produis ce livrable maintenant; ne repete jamais le pitch de la technique a la place.",
  ...userIdentityVisiblePromptLines(),
  "- Redige uniquement la reponse visible de cette etape.",
].join("\n");

export const COACHING_ONLY_VISIBLE_GUIDANCE_LINES = [
  "Bloc commun coaching conversationnel:",
  "- Tu peux repondre par du coaching generique quand c'est plus pertinent pour le user que de pousser un levier Sophia.",
  "- Coaching generique = aide concrete, reformulation, premier geste, phrase de reprise, apaisement court ou clarification, sans nommer carte, potion, technique ou destination produit par reflexe.",
  "- Choisis visible_decision.lever=coaching_only quand le dernier message demande une aide normale, une ligne, une phrase a copier, une explication, ou refuse les noms de cartes, potions, features ou techniques.",
  "- Une contrainte de style explicite du tour courant prime sur le format standard du skill: si le user demande 'parle normalement', 'pas de carte', 'pas de potion', 'une seule ligne' ou equivalent, respecte-la.",
];

export const ACTION_CARD_EMOTIONAL_FRICTION_GUIDANCE_LINES = [
  "Bloc commun cartes d'action:",
  "- Une emotion liee a une action concrete reste dans le coaching d'action; ne la transforme pas en potion.",
  "- Carte d'attaque: aide a entrer dans l'action quand le demarrage bloque, y compris si l'anxiete, la pression ou la boule au ventre rendent le premier geste difficile.",
  "- Quand step_context.selected_feature=attack_card ou que tu recommandes une carte d'attaque, nomme toujours la technique conseillee et explique en une phrase pourquoi cette technique correspond a la finalite du moment.",
  "- Contre-exemple interdit: 'Oui, ici une carte d'attaque est adaptee. Elle sert a te preparer avant de commencer l'action du plan et a rendre le demarrage plus simple.' Cette reponse decrit seulement la finalite et laisse un user non familier sans technique concrete.",
  "- Forme attendue: 'Je partirais sur une carte d'attaque, technique [nom de la technique]: ...'. Ne copie pas toujours le meme exemple.",
  "- Ne choisis jamais une technique par defaut. Identifie d'abord la friction dominante, puis choisis la technique qui y repond le mieux.",
  "- Techniques possibles de carte d'attaque: Le texte magique = une phrase courte qui recadre l'action; Mantra de force = une phrase d'appui a se repeter; Ancre visuelle = un repere visuel prepare; Meditation de 5 minutes = visualiser calmement le demarrage; Preparer le terrain = organiser l'environnement avant l'action; Mot de bascule = un seul mot declencheur, jamais une phrase, reserve au cas ou le user sait qu'il risque de craquer, abandonner ou basculer contre l'objectif/action fixee.",
  "- Matrice de choix attaque: Le texte magique si le blocage vient d'une pensee, excuse, interpretation, peur de mal faire ou recit interne a recadrer.",
  "- Matrice de choix attaque: Mantra de force si le user a surtout besoin d'une phrase d'appui, de courage, d'identite ou de tenue mentale au moment de commencer.",
  "- Matrice de choix attaque: Ancre visuelle si un objet, lieu, post-it, document ouvert ou repere visible peut rappeler l'action et couper l'evitement.",
  "- Matrice de choix attaque: Meditation de 5 minutes si l'action parait floue, lourde, anxiogene ou difficile a visualiser calmement avant le premier geste.",
  "- Matrice de choix attaque: Preparer le terrain seulement si le blocage vient surtout du contexte concret: documents, espace, outils, distraction, environnement ou ordre des premieres etapes a organiser.",
  "- Matrice de choix attaque: Mot de bascule seulement si le user sait qu'il risque de craquer, abandonner ou basculer contre l'objectif/action fixee.",
  "- N'utilise pas Mot de bascule pour un simple blocage de demarrage ou une page blanche: dans ce cas, choisis entre Le texte magique, Mantra de force, Ancre visuelle, Meditation de 5 minutes ou Preparer le terrain selon la friction dominante.",
  "- N'utilise pas Preparer le terrain comme reponse automatique a tout blocage de demarrage: si la friction est mentale, emotionnelle, narrative ou liee au manque d'elan, une autre technique peut etre plus pertinente.",
  "- Si tu cites Mot de bascule, propose un mot unique comme 'Stop', 'Retour', 'Objectif' ou 'Tenir'. Ne donne jamais une phrase du type 'J'ouvre le brouillon...'.",
  "- Noms reserves attaque: texte magique, mantra de force, ancre visuelle, meditation de 5 minutes, preparer le terrain et mot de bascule appartiennent uniquement aux cartes d'attaque.",
  "- Carte de defense: aide a proteger un moment de risque pendant ou juste avant l'action: evitement, decrochage, impulsion, pression, fatigue, reaction automatique, risque d'abandon.",
  "- Une carte de defense ne se presente pas par une technique nommee. Elle se presente par ses composants: moment critique, piege observable, geste de retour faisable en moins de 30 secondes, plan B simple.",
  "- Limite carte de defense: tu peux expliquer informellement ces composants, mais tu ne dois jamais pre-remplir, rediger, simuler ou te projeter dans les sections exactes de la carte de defense.",
  "- Pour une carte de defense, ne donne pas de brouillon de carte, de champs a copier, de contenu section par section ni de formulation qui laisse croire que Sophia a prepare la carte. La creation et le remplissage se font ensuite sur la plateforme.",
  "- Interdit carte de defense: ne jamais ecrire une liste du type 'moment critique: ...', 'piege observable: ...', 'geste de retour: ...', 'plan B: ...' avec des valeurs concretes. Ces libelles peuvent etre expliques, mais pas remplis depuis le chat.",
  "- Interdit carte de defense: meme si le user demande 'quoi mettre exactement', 'redige-moi', 'champ par champ', 'sections' ou 'contenu exact', pose la limite produit: la carte se complete dans Sophia, pas dans la reponse chat.",
  "- Interdit carte de defense: ne dis pas 'je peux t'aider a formuler ces elements', 'je peux te dire quoi mettre' ou equivalent si cela revient a produire le contenu de la carte.",
  "- Forme autorisee carte de defense: 'Je ne vais pas remplir la carte depuis le chat. Sur Sophia, tu la completeras dans l'ecran de creation. Ici je peux t'expliquer le role des composants: le moment critique sert a reperer quand ca deraille; le piege sert a identifier ce qui t'embarque; le geste de retour sert a revenir vite; le plan B sert a garder une option simple si le premier retour ne marche pas.' Adapte naturellement sans donner de valeurs concretes.",
  "- Si visible_decision.lever=defense_card ou free_defense_card, visible_decision.variant doit etre null et le message ne doit jamais presenter texte magique, mantra de force, ancre visuelle, meditation de 5 minutes, preparer le terrain ou mot de bascule comme une technique de defense.",
  "- Contre-exemple interdit defense: 'Je partirais sur une carte de defense, technique mot de bascule...'. C'est faux: mot de bascule est une technique de carte d'attaque, pas de defense.",
  "- Si le probleme est d'abord 'je n'arrive pas a commencer', favorise attaque. Si le probleme est 'je risque de deraper ou quitter au moment critique', favorise defense.",
  "- Regle prioritaire action/no-plan: si le dernier message precise que le user commence bien puis decroche pendant l'action, part vers un piege concret, quitte l'action apres quelques minutes ou se fait aspirer par une distraction pendant l'execution, considere defense_card ou free_defense_card avant attack_card.",
  "- Ne maintiens pas une carte d'attaque seulement parce que step_context.selected_feature=attack_card si le dernier message clarifie un decrochage pendant l'action.",
];

export const LEVER_COMPARISON_KNOWLEDGE_LINES = [
  "Bloc commun comparaison des leviers Sophia:",
  "- Quand le user compare deux leviers Sophia, reponds a la comparaison dans le scope courant; ne transforme pas cette comparaison en changement de flow.",
  "- Une comparaison peut citer une potion sans devenir emotion_coaching: si l'etat est rattache a une action concrete, l'agent d'action reste responsable.",
  "- Potion: levier pour un etat emotionnel global, non rattache a une action concrete a demarrer, tenir ou terminer.",
  "- Les 6 potions: Apaisement = pression qui monte; Amour = manque de douceur envers soi ou relation a soi; Courage = peur ou evitement global; Clarte = besoin de retrouver le pourquoi profond; Guerison = apres un episode douloureux; Anti-decrochage = etat global de laisser-filer/deconnexion.",
  "- Carte d'attaque: levier pour entrer dans une action quand le demarrage bloque; elle peut traiter une emotion si cette emotion bloque le premier geste d'une action concrete.",
  "- Carte de defense: levier pour proteger un moment critique ou le user risque de decrocher, fuir, abandonner, craquer ou se faire embarquer pendant ou juste avant l'action.",
  "- Ajustement du plan: levier seulement pour une action concrete du plan trop lourde, mal calibree, desalignee, infaisable ou placee au mauvais rythme.",
  "- Carte libre hors plan: meme logique attaque/defense, mais creee ou consultee dans Ressources et jamais rattachee au Plan.",
  "- Si tu compares potion Amour ou Apaisement avec une carte liee a une action, explique la potion brievement puis tranche selon le scope: etat global = potion; resistance liee a l'action = carte d'action.",
  "- Si le scope courant interdit un levier compare, explique pourquoi il n'est pas le bon cadre sans dire que le user a tort.",
];

function cleanMessage(value: unknown): string | null {
  const text = String(value ?? "").replaceAll("\r\n", "\n").trim();
  return text ? text : null;
}

function parseVisibleMessage(raw: unknown): string | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    return cleanMessage(root?.message);
  } catch {
    return cleanMessage(raw);
  }
}

const VISIBLE_DECISION_LEVERS = new Set<CoachingVisibleDecisionLever>([
  "attack_card",
  "defense_card",
  "adjust_plan",
  "free_attack_card",
  "free_defense_card",
  "coaching_only",
  "state_potion",
]);

const ATTACK_TECHNIQUES = new Set<CoachingAttackCardTechnique>([
  "texte_magique",
  "mantra_force",
  "ancre_visuelle",
  "meditation_5_min",
  "preparer_terrain",
  "mot_de_bascule",
]);

const POTION_TYPES = new Set<CoachingPotionType>([
  "apaisement",
  "amour",
  "courage",
  "clarte",
  "guerison",
  "anti_decrochage",
]);

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<T>,
): T | null {
  const raw = String(value ?? "").trim();
  return allowed.has(raw as T) ? raw as T : null;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "medium";
}

function sanitizeDecision(raw: unknown): CoachingVisibleDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const root = raw as Record<string, unknown>;
  const lever = enumValue(root.lever, VISIBLE_DECISION_LEVERS);
  if (!lever) return null;
  const reason = cleanMessage(root.reason) ?? "Decision visible.";
  return {
    lever,
    variant: enumValue(root.variant, ATTACK_TECHNIQUES),
    potion_type: enumValue(root.potion_type, POTION_TYPES),
    reason,
    confidence: confidence(root.confidence),
  };
}

function parseVisibleOutput(raw: unknown): CoachingVisibleAgentOutput | null {
  try {
    const root = typeof raw === "string" ? JSON.parse(raw) : raw as any;
    const message = sanitizeVisibleText(cleanMessage(root?.message));
    if (!message) return null;
    return {
      message,
      visible_decision: sanitizeDecision(root?.visible_decision),
    };
  } catch {
    const message = sanitizeVisibleText(cleanMessage(raw));
    return message ? { message, visible_decision: null } : null;
  }
}

function sanitizeVisibleText(value: string | null): string | null {
  if (!value) return null;
  return value
    .replaceAll("recurring_reminder", "initiatives")
    .replaceAll("coach_preferences", "preferences de coaching")
    .replaceAll("one_shot_reminder", "rappel ponctuel")
    .replaceAll("track_progress_plan_item", "suivi de progression")
    .replaceAll("track_progress", "suivi de progression")
    .trim();
}

function visibleOutputContractError(args: {
  input: CoachingVisibleAgentInput;
  output: CoachingVisibleAgentOutput;
}): string | null {
  const decision = args.output.visible_decision;
  const recommendsAttack = decision?.lever === "attack_card" ||
    decision?.lever === "free_attack_card";
  if (recommendsAttack && !decision?.variant) {
    return "attack_card_or_free_attack_card_requires_visible_decision_variant";
  }
  if (
    decision?.lever !== "attack_card" &&
    decision?.lever !== "free_attack_card" &&
    decision?.variant
  ) {
    return "non_attack_lever_must_not_set_attack_card_variant";
  }
  const defenseLever = decision?.lever === "defense_card" ||
    decision?.lever === "free_defense_card";
  if (defenseLever && messageContainsAttackTechniqueName(args.output.message)) {
    return "defense_card_message_must_not_name_attack_card_technique";
  }
  return null;
}

function messageContainsAttackTechniqueName(message: string): boolean {
  const normalized = message.trim().toLocaleLowerCase("fr-FR");
  const attackTechniqueNames = [
    "texte magique",
    "mantra de force",
    "ancre visuelle",
    "meditation de 5 minutes",
    "méditation de 5 minutes",
    "preparer le terrain",
    "préparer le terrain",
    "mot de bascule",
  ];
  return attackTechniqueNames.some((name) => normalized.includes(name));
}

export async function runSpecializedVisibleAgent(args: {
  input: CoachingVisibleAgentInput;
  source: string;
  roleLines: string[];
  fallback: (input: CoachingVisibleAgentInput) => string;
}): Promise<CoachingVisibleAgentOutput | null> {
  const oneShotReminderContextPresent = oneShotReminderVisibleContextPresent(
    args.input.flow_context?.direct_effect_confirmation_context,
  );
  const committedReminderKnown = committedOneShotReminderKnown({
    directEffectConfirmationContext:
      args.input.flow_context?.direct_effect_confirmation_context,
    recentEffectsSummary:
      args.input.visible_runtime_context?.recent_effects_summary,
  });
  const committedReminderThisTurn = directEffectContextCommittedThisTurn(
    args.input.flow_context?.direct_effect_confirmation_context,
  );
  const prompt = [
    ...args.roleLines,
    COACHING_VISIBLE_GLOBAL_RULES,
    ...oneShotReminderCanonicalVisiblePromptLines(
      "flow_context.direct_effect_confirmation_context",
      {
        present: oneShotReminderContextPresent,
        committedThisTurn: committedReminderThisTurn,
        committedKnown: committedReminderKnown,
      },
    ),
    VISIBLE_OUTPUT_STYLE_RULES,
    "Contrat de decision visible:",
    "- Si visible_decision.lever est attack_card ou free_attack_card, visible_decision.variant ne doit jamais etre null: choisis une technique parmi texte_magique, mantra_force, ancre_visuelle, meditation_5_min, preparer_terrain, mot_de_bascule.",
    "- step_context.selected_feature=attack_card ne force pas visible_decision.lever=attack_card: si le dernier message montre mieux une carte de defense ou un autre levier autorise par ton perimetre, revise la decision.",
    "- Quand visible_decision.variant est renseigne, le message visible doit nommer la meme technique en mots comprehensibles pour le user.",
    "- Si visible_decision.lever n'est pas attack_card ou free_attack_card, visible_decision.variant doit etre null.",
    "- Si visible_decision.lever est defense_card ou free_defense_card, le message ne doit jamais nommer les techniques d'attaque: texte magique, mantra de force, ancre visuelle, meditation de 5 minutes, preparer le terrain, mot de bascule.",
    "- Pour defense_card ou free_defense_card, explique la carte via moment critique, piege observable, geste de retour en moins de 30 secondes et plan B simple.",
    "- Si visible_decision.lever est coaching_only, visible_decision.variant et visible_decision.potion_type doivent etre null: aide le user conversationnellement sans pousser carte, potion, technique ou destination produit.",
    'Retourne uniquement un JSON strict: {"message":"...","visible_decision":{"lever":"attack_card|defense_card|adjust_plan|free_attack_card|free_defense_card|coaching_only|state_potion","variant":"texte_magique|mantra_force|ancre_visuelle|meditation_5_min|preparer_terrain|mot_de_bascule|null","potion_type":"apaisement|amour|courage|clarte|guerison|anti_decrochage|null","reason":"string","confidence":"low|medium|high"}}.',
  ].join("\n");
  try {
    const raw = await generateWithGemini(
      prompt,
      JSON.stringify({
        visible_runtime_context: args.input.visible_runtime_context,
        flow_context: args.input.flow_context,
        step_context: args.input.step_context,
      }),
      0.35,
      true,
      [],
      "auto",
      {
        requestId: args.input.request_id ?? undefined,
        userId: args.input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: args.source,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const parsed = parseVisibleOutput(raw);
    const contractError = parsed
      ? visibleOutputContractError({ input: args.input, output: parsed })
      : "invalid_visible_json";
    if (parsed && !contractError) return parsed;

    const repairPrompt = [
      prompt,
      "Correction contractuelle obligatoire:",
      `Erreur detectee: ${contractError}.`,
      "- Repare uniquement la sortie JSON du visible agent.",
      "- Ne change pas de scope, ne route pas, ne produis pas d'effet.",
      "- Si une carte d'attaque est recommandee, choisis la technique pertinente et nomme-la dans message.",
      "- Si une carte de defense est recommandee, ne nomme aucune technique d'attaque; decris moment critique, piege, geste 30 secondes et plan B.",
      "- Retourne uniquement un JSON strict valide.",
    ].join("\n");
    const repairedRaw = await generateWithGemini(
      repairPrompt,
      JSON.stringify({
        visible_runtime_context: args.input.visible_runtime_context,
        flow_context: args.input.flow_context,
        step_context: args.input.step_context,
        previous_visible_output: raw,
      }),
      0.2,
      true,
      [],
      "auto",
      {
        requestId: args.input.request_id ?? undefined,
        userId: args.input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: `${args.source}_contract_retry`,
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 0,
      },
    );
    const repaired = parseVisibleOutput(repairedRaw);
    if (
      repaired &&
      !visibleOutputContractError({ input: args.input, output: repaired })
    ) {
      return repaired;
    }
    return parsed ?? {
      message: sanitizeVisibleText(args.fallback(args.input)) ?? "",
      visible_decision: null,
    };
  } catch (error) {
    console.warn(`[CoachingRecommendation] ${args.source} failed`, error);
    return {
      message: sanitizeVisibleText(args.fallback(args.input)) ?? "",
      visible_decision: null,
    };
  }
}
