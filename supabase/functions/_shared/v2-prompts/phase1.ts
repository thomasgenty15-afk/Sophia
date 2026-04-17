import type {
  Phase1DeepWhyQuestion,
  Phase1StoryPrincipleKey,
  Phase1StoryPrincipleSection,
  Phase1StoryState,
} from "../v2-types.ts";

export type Phase1PromptContext = {
  transformation_title: string;
  transformation_summary: string;
  focus_context: string;
  questionnaire_context: string | null;
  user_first_name: string | null;
  user_age: number | null;
  user_gender: string | null;
  phase_1_objective: string | null;
  phase_1_heartbeat: string | null;
  plan_levels_count?: number | null;
  success_definition: string | null;
  main_constraint: string | null;
  inspiration_narrative: string | null;
  journey_part_number?: number | null;
  journey_total_parts?: number | null;
  journey_continuation_hint?: string | null;
  previous_completed_transformation?: string | null;
};

export const PHASE1_DEEP_WHY_SYSTEM_PROMPT = `Tu écris les questions de "pourquoi profond" pour Sophia.

Objectif:
- générer exactement 4 questions
- émotionnellement justes
- jamais manipulatrices
- jamais mystiques ou creuses
- ancrées dans la transformation réelle

Règles:
- une seule question par item
- formulation simple, humaine, concrète
- pas de jargon thérapeutique
- pas de "pourquoi veux-tu changer ?" générique
- les questions doivent aller un cran plus loin que ce qui a déjà été dit dans le questionnaire
- les questions doivent aider la personne à retrouver ce qui compte quand l'élan baisse
- pour chaque question, propose exactement 2 débuts de réponse plausibles, personnalisés et concrets
- pour les suggestions de réponse, tu peux t'inspirer de ce qui a déjà été exprimé dans le questionnaire ou le résumé, mais tu dois reformuler et approfondir
- ces suggestions doivent aider à démarrer, pas enfermer la personne
- évite les réponses plates ou universelles du style "pour ma santé" sans contexte
- travaille UNIQUEMENT sur la transformation active
- n'injecte pas les autres transformations du cycle comme sous-thèmes
- n'utilise ni logique de parcours global, ni structure multi-transformation, ni hypothèses sur d'autres sujets du cycle
- exception rare: si un autre sujet est un obstacle massif et evident pour cette transformation, tu peux le mentionner UNE seule fois maximum dans l'ensemble de la sortie, sans en faire un deuxieme sujet

Tu dois couvrir exactement ces 4 angles, dans cet ordre, avec ces IDs fixes:
1. id = "importance_now"
   But: comprendre pourquoi cette transformation compte maintenant, ce qui est visé au fond, le reve, l'ambition, ce que la personne veut retrouver, proteger ou construire.
2. id = "daily_pain"
   But: comprendre comment le probleme se manifeste concretement dans le quotidien, ce qu'il gene, coute, abime ou fait souffrir.
3. id = "past_blocker"
   But: comprendre ce qui bloquait avant, pourquoi la personne n'a pas essaye plus tot, ou ce qui a fait echouer / freine les tentatives precedentes.
4. id = "success_state"
   But: comprendre ce qui rendrait la personne vraiment heureuse ou soulagee une fois transformee a ce niveau-la, dans la vraie vie.

Important:
- chaque question doit ouvrir de la matiere tangible pour une future histoire narrative personnalisee
- evite les formulations abstraites si tu peux viser le concret
- ne fusionne pas plusieurs angles dans une seule question

Retourne uniquement un JSON valide:
{
  "deep_why_questions": [
    {
      "id": "importance_now",
      "question": "...",
      "suggested_answers": ["...", "..."]
    }
  ]
}`;

export function buildPhase1DeepWhyUserPrompt(
  context: Phase1PromptContext,
): string {
  return `## Transformation

- Titre: ${context.transformation_title}
- Résumé: ${context.transformation_summary}
- Objectif du premier niveau de plan du plan (niveau de plan 2 affiché): ${context.phase_1_objective ?? "Non précisé"}
- Heartbeat du premier niveau de plan du plan (niveau de plan 2 affiché): ${context.phase_1_heartbeat ?? "Non précisé"}
- Définition de réussite: ${context.success_definition ?? "Non précisée"}
- Contrainte principale: ${context.main_constraint ?? "Non précisée"}

## Matière focale de la transformation active

${context.focus_context || "Aucun contexte focal fourni"}

## Ce qui a deja ete dit dans le questionnaire ou le cadrage

${context.questionnaire_context ?? "Aucune matiere questionnaire exploitable"}

## Histoire actuelle

${context.inspiration_narrative ?? "Aucune histoire existante"}

Retourne uniquement le JSON demandé.`;
}

export function validatePhase1DeepWhyOutput(
  value: unknown,
): { valid: boolean; issues: string[]; questions: Phase1DeepWhyQuestion[] } {
  const issues: string[] = [];
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const rawQuestions = Array.isArray(root?.deep_why_questions)
    ? root?.deep_why_questions
    : null;
  const expectedIds = [
    "importance_now",
    "daily_pain",
    "past_blocker",
    "success_state",
  ] as const;

  if (!rawQuestions || rawQuestions.length !== expectedIds.length) {
    issues.push("deep_why_questions must contain exactly 4 items");
  }

  const questions = (rawQuestions ?? []).flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push(`question[${index}] must be an object`);
      return [];
    }
    const row = item as Record<string, unknown>;
    const id = String(row.id ?? "").trim();
    const question = String(row.question ?? "").trim();
    const suggestedAnswers = Array.isArray(row.suggested_answers)
      ? row.suggested_answers
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
      : [];
    if (!id) issues.push(`question[${index}] missing id`);
    if (id && id !== expectedIds[index]) {
      issues.push(`question[${index}] id must be ${expectedIds[index]}`);
    }
    if (!question) issues.push(`question[${index}] missing question`);
    if (suggestedAnswers.length !== 2) {
      issues.push(`question[${index}] must have exactly 2 suggested_answers`);
    }
    return id && question && suggestedAnswers.length === 2 && id === expectedIds[index]
      ? [{ id, question, suggested_answers: suggestedAnswers }]
      : [];
  });

  return {
    valid: issues.length === 0,
    issues,
    questions,
  };
}

export const PHASE1_STORY_SYSTEM_PROMPT = `Tu aides Sophia a preparer "Ton histoire" pour la phase 1.

Objectif:
- générer une histoire narrative, incarnée et mémorable
- choisir exactement 5 principes japonais parmi une bibliothèque de 12 pour servir de repères sous l'histoire

Bibliothèque de principes disponible:
- ikigai
- kaizen
- hara_hachi_bu
- wabi_sabi
- gambaru
- shoshin
- kintsugi
- ma
- zanshin
- mottainai
- sunao
- fudoshin

Important:
- le rendu principal doit être UNE HISTOIRE, pas une succession de fiches explicatives
- les principes servent de colonne vertébrale cachée pour écrire le récit
- ensuite, tu fournis 5 principle_sections qui résument les 5 principes les plus pertinents retenus pour CETTE transformation
- n'utilise jamais plus de 5 principes
- ne retombe pas sur les 5 principes historiques par défaut si d'autres principes sont plus pertinents

Style narratif attendu:
- ton empathique, concret, lucide, jamais grandiloquent
- récit long, vivant et pédagogique, de type transmission orale ou voix off de vidéo
- le texte doit ressembler à une histoire racontée a une personne, avec des scenes, des bascules, des rechutes et une leçon claire
- évite le folklore ou l'exotisme gratuit autour du Japon
- les principes peuvent être cités dans l'histoire, mais ils ne doivent pas casser le flux narratif

Arc narratif attendu:
- un point de départ concret et douloureux
- ce qui coince vraiment dans le quotidien
- une scene de bascule ou de prise de conscience
- un premier changement volontairement petit, presque deceptif par sa simplicité
- des preuves progressives que quelque chose bouge
- une rechute, une resistance ou un moment de doute
- une reprise plus mature
- un changement visible dans la vraie vie
- une leçon finale que la personne peut garder quand l'élan baisse

Règles:
- écris une introduction courte et incarnée
- l'histoire doit être plus proche d'un récit transformateur que d'un cours
- pas de promesse irréaliste
- pas de storytelling décoratif
- pas de texte générique qui pourrait marcher pour n'importe qui
- évite de répéter simplement le résumé de transformation: ce résumé est déjà visible dans l'UI
- l'histoire doit apporter une lecture plus humaine, plus située, plus éducative et plus mémorable
- si un prénom est disponible, tu peux l'utiliser avec parcimonie
- si un âge est disponible, tu peux l'utiliser seulement si cela aide à situer le moment de vie
- fais sentir ce qui est en train de se rejouer, ce que la personne protège, ce qu'elle peut retrouver
- termine par un court "ce qu'il faut retenir"
- les 5 principle_sections doivent chacune avoir une vraie utilité pédagogique distincte
- travaille d'abord sur la transformation active
- si le contexte indique clairement que cette transformation est une partie d'un parcours plus large, tu peux le dire explicitement dans le récit
- dans ce cas, tu peux mentionner brièvement ce que la partie précédente a déjà permis de construire, mais sans transformer l'histoire en roadmap complète
- les autres transformations du cycle ne doivent jamais devenir la matière principale du récit
- n'utilise pas une logique de parcours global vague ou abstraite si aucun contexte concret de continuité n'est fourni
- n'invente jamais une structure en "actes", "chapitres", "parties" ou "niveaux" qui n'existe pas dans le contexte fourni
- les niveaux du plan ne sont pas des "actes" narratifs; si tu mentionnes le nombre de niveaux, reprends uniquement le chiffre exact fourni
- le découpage en parties de transformation n'est mentionnable que si le contexte indique explicitement 1/2 ou 2/2
- n'écris jamais "voyage en 3 actes", "parcours en 3 parties" ou toute autre numérotation non fournie
- si une continuité est fournie, elle doit servir uniquement à mieux situer le moment de vie actuel: "première partie sur 2", "deuxième partie sur 2", "socle déjà construit", "nouvelle couche"
- si des réponses de "pourquoi profond" sont fournies, tu dois t'en servir explicitement comme matière narrative
- ne recopie pas ces réponses mot à mot comme une liste: transforme-les en motivations, en tension, en bascule ou en leçon finale dans le récit
- quand ces réponses existent, l'histoire doit faire sentir ce que la personne protège, ce qu'elle refuse de perdre ou ce qu'elle veut retrouver

Référence de ton recherchée:
- pense a une histoire de transformation longue, structurée, très concrète, qui enseigne a travers le parcours d'une personne
- le lecteur doit sentir: le probleme, le declic, le micro-pas, la rechute, la reprise, puis le changement d'identité

Retourne uniquement un JSON valide:
{
  "status": "ready_to_generate",
  "detail_questions": [],
  "story_prompt_hints": ["..."],
  "intro": "...",
  "principle_sections": [
    {
      "principle_key": "ikigai",
      "title": "...",
      "meaning": "...",
      "in_your_story": "...",
      "concrete_example": "..."
    }
  ],
  "key_takeaway": "...",
  "story": "..."
}

"intro", "key_takeaway" et "story" doivent être non vides, avec exactement 5 principle_sections.`;

export function buildPhase1StoryUserPrompt(args: {
  context: Phase1PromptContext;
  deepWhyAnswers: string[];
  detailsAnswer: string | null;
}): string {
  return `## Transformation

- Titre: ${args.context.transformation_title}
- Résumé: ${args.context.transformation_summary}
- Prenom: ${args.context.user_first_name ?? "Non precise"}
- Age: ${args.context.user_age != null ? `${args.context.user_age} ans` : "Non precise"}
- Genre: ${args.context.user_gender ?? "Non precise"}
- Objectif du premier niveau de plan du plan (niveau de plan 2 affiché): ${args.context.phase_1_objective ?? "Non précisé"}
- Heartbeat du premier niveau de plan du plan (niveau de plan 2 affiché): ${args.context.phase_1_heartbeat ?? "Non précisé"}
- Nombre exact de niveaux dans le plan de cette transformation: ${args.context.plan_levels_count ?? "Non precise"}
- Définition de réussite: ${args.context.success_definition ?? "Non précisée"}
- Contrainte principale: ${args.context.main_constraint ?? "Non précisée"}

## Contexte éventuel de continuité

- Découpage multi-parties de la transformation: ${
  args.context.journey_part_number != null && args.context.journey_total_parts === 2
    ? `${args.context.journey_part_number} / 2`
    : "Aucun decoupage en 2 parties a mentionner"
}
- Indication de continuité factuelle: ${args.context.journey_continuation_hint ?? "Aucune"}
- Partie juste avant, si elle existe déjà et est accomplie:
${args.context.previous_completed_transformation ?? "Aucune"}

## Matière focale de la transformation active

${args.context.focus_context || "Aucun contexte focal fourni"}

Réponses de pourquoi profond:
${args.deepWhyAnswers.length > 0 ? args.deepWhyAnswers.join("\n- ") : "Aucune"}

Réponse aux détails éventuels:
${args.detailsAnswer ?? "Aucune"}

Histoire existante:
${args.context.inspiration_narrative ?? "Aucune"}

Cadrage narratif a respecter:
- raconte une vraie trajectoire humaine, pas un texte de conseils
- fais sentir un quotidien, une scene de bascule, un premier micro-pas, une rechute, une reprise, puis un changement visible
- laisse les principes soutenir le récit au lieu d'en faire des chapitres rigides
- si des réponses de pourquoi profond sont présentes, elles doivent nourrir concrètement la motivation du personnage, le sens du combat et la leçon finale
- ne juxtapose pas ces réponses: tisse-les dans l'histoire
- choisis exactement 5 principes parmi la bibliothèque disponible
- si tu cites un principe dans l'histoire, fais-le au service du parcours, pas comme une fiche pédagogique
- si le contexte indique explicitement 1/2 ou 2/2, tu peux le faire sentir clairement dans le récit
- si une partie immédiatement précédente est déjà accomplie, tu peux t'appuyer dessus pour montrer le socle déjà posé avant cette nouvelle étape
- n'utilise jamais le mot "acte"
- n'invente jamais un nombre de parties ou de niveaux; reprends uniquement les nombres exacts fournis ci-dessus

Retourne uniquement le JSON demandé.`;
}

export function validatePhase1StoryOutput(
  value: unknown,
): { valid: boolean; issues: string[]; story: Phase1StoryState | null } {
  const issues: string[] = [];
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  const status = root?.status;
  if (status !== "ready_to_generate") {
    issues.push("status must be ready_to_generate");
  }

  const detailQuestions = Array.isArray(root?.detail_questions)
    ? root?.detail_questions
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const storyPromptHints = Array.isArray(root?.story_prompt_hints)
    ? root?.story_prompt_hints
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const introText = typeof root?.intro === "string" ? root.intro.trim() : "";
  const keyTakeaway = typeof root?.key_takeaway === "string" ? root.key_takeaway.trim() : "";
  const storyText = typeof root?.story === "string" ? root.story.trim() : "";
  const validPrincipleKeys = new Set<Phase1StoryPrincipleKey>([
    "ikigai",
    "kaizen",
    "hara_hachi_bu",
    "wabi_sabi",
    "gambaru",
    "shoshin",
    "kintsugi",
    "ma",
    "zanshin",
    "mottainai",
    "sunao",
    "fudoshin",
  ]);
  const principleKeysSeen = new Set<Phase1StoryPrincipleKey>();
  const principleSections: Phase1StoryPrincipleSection[] = Array.isArray(root?.principle_sections)
    ? root.principle_sections.flatMap((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        issues.push(`principle_sections[${index}] must be an object`);
        return [];
      }
      const row = item as Record<string, unknown>;
      const principleKey = String(row.principle_key ?? "").trim() as Phase1StoryPrincipleKey;
      const title = String(row.title ?? "").trim();
      const meaning = String(row.meaning ?? "").trim();
      const inYourStory = String(row.in_your_story ?? "").trim();
      const concreteExample = String(row.concrete_example ?? "").trim();
      if (!validPrincipleKeys.has(principleKey)) {
        issues.push(`principle_sections[${index}] has invalid principle_key`);
        return [];
      }
      if (principleKeysSeen.has(principleKey)) {
        issues.push(`principle_sections[${index}] duplicates principle_key ${principleKey}`);
        return [];
      }
      principleKeysSeen.add(principleKey);
      if (!title) issues.push(`principle_sections[${index}] missing title`);
      if (!meaning) issues.push(`principle_sections[${index}] missing meaning`);
      if (!inYourStory) issues.push(`principle_sections[${index}] missing in_your_story`);
      if (!concreteExample) issues.push(`principle_sections[${index}] missing concrete_example`);
      if (!title || !meaning || !inYourStory || !concreteExample) return [];
      return [{
        principle_key: principleKey,
        title,
        meaning,
        in_your_story: inYourStory,
        concrete_example: concreteExample,
      }];
    })
    : [];

  if (detailQuestions.length > 0) {
    issues.push("ready_to_generate requires an empty detail_questions array");
  }
  if (!introText) issues.push("ready_to_generate requires a non-empty intro");
  if (!keyTakeaway) issues.push("ready_to_generate requires a non-empty key_takeaway");
  if (!storyText) issues.push("ready_to_generate requires a non-empty story");
  if (principleSections.length !== 5) {
    issues.push("ready_to_generate requires exactly 5 principle_sections");
  }

  return {
    valid: issues.length === 0,
    issues,
    story: issues.length === 0
      ? {
        status: "ready_to_generate",
        detail_questions: detailQuestions,
        details_answer: null,
        story_prompt_hints: storyPromptHints,
        intro: introText || null,
        key_takeaway: keyTakeaway || null,
        principle_sections: principleSections,
        story: storyText || null,
        generated_at: null,
      }
      : null,
  };
}
