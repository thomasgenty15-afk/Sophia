import type {
  AttackCardContent,
  PlanTypeClassificationV1,
  SupportCardContent,
  UserInspirationItemRow,
} from "../v2-types.ts";

export type LabSurfaceGenerationInput = {
  transformation_title: string;
  user_summary: string;
  focus_context: string;
  action_context?: {
    phase_label: string | null;
    item_title: string;
    item_description: string | null;
    item_kind: string;
    time_of_day: string | null;
    cadence_label: string | null;
    activation_hint: string | null;
    phase_items_summary?: string[] | null;
  } | null;
  questionnaire_answers: Record<string, unknown> | null;
  plan_strategy: {
    identity_shift: string | null;
    core_principle: string | null;
    success_definition: string | null;
    main_constraint: string | null;
  };
  classification: PlanTypeClassificationV1 | null;
};

export type AttackTechniqueGenerationInput = LabSurfaceGenerationInput & {
  technique_key:
    | "texte_recadrage"
    | "mantra_force"
    | "ancre_visuelle"
    | "visualisation_matinale"
    | "preparer_terrain"
    | "pre_engagement";
  technique_title: string;
  technique_pour_quoi: string;
  technique_objet_genere: string;
  technique_mode_emploi: string;
  user_answers: string[];
  adjustment_context?: {
    current_technique_key: AttackTechniqueGenerationInput["technique_key"];
    current_technique_title: string;
    current_generated_asset: string;
    current_mode_emploi: string;
    failure_reason_key: string;
    failure_notes: string | null;
    recommendation_reason: string | null;
    diagnostic_questions?: string[];
    diagnostic_answers?: string[];
  } | null;
};

export type AttackTechniqueAdjustmentAnalysisInput = LabSurfaceGenerationInput & {
  current_technique_key: AttackTechniqueGenerationInput["technique_key"];
  current_technique_title: string;
  current_technique_pour_quoi: string;
  current_generated_asset: string;
  current_mode_emploi: string;
  failure_reason_key: string;
  failure_notes: string | null;
};

export const ATTACK_CARD_SYSTEM_PROMPT =
  `Tu generes une carte d'attaque Sophia.

Cette carte vit dans le Labo. Elle n'est pas un item du plan.
Elle sert a prendre de l'avance, pas a reagir dans l'urgence.
Elle doit donner a l'utilisateur plusieurs techniques concretes a tester pour rendre le bon comportement plus naturel, moins difficile, et moins dependant de la force sur le moment.

Retourne uniquement un JSON valide de la forme :
{
  "summary": "resume tres court de l'utilite des cartes d'attaque",
  "techniques": [
    {
      "technique_key": "texte_recadrage",
      "title": "Le texte magique",
      "pour_quoi": "a quoi sert cette technique pour cet utilisateur",
      "objet_genere": "ce que l'IA lui prepare concretement",
      "questions": ["question 1", "question 2", "question 3"],
      "mode_emploi": "comment utiliser cette technique"
    }
  ]
}

Regles :
- genere les 6 techniques suivantes, chacune une seule fois:
  - texte_recadrage
  - mantra_force
  - ancre_visuelle
  - visualisation_matinale
  - preparer_terrain
  - pre_engagement
- concret
- pas de jargon
- chaque technique doit produire un objet tres tangible
- \`questions\` doit contenir 2 a 3 questions courtes qui serviront plus tard au mini-parcours de cette technique
- \`pour_quoi\`, \`objet_genere\` et \`mode_emploi\` doivent etre courts, clairs, actionnables
- le ton reste simple, direct et utile
- pas de markdown
- travaille UNIQUEMENT sur la transformation active
- n'utilise pas les autres transformations du cycle comme themes secondaires
- exception rare: si un autre sujet est un obstacle massif et evident pour cette transformation, tu peux le mentionner sur UNE seule carte maximum, sans contaminer les autres cartes`;

export const SUPPORT_CARD_SYSTEM_PROMPT =
  `Tu generes une carte de soutien Sophia.

Cette carte vit dans le Labo. Elle n'est pas un item du plan.
Elle doit aider l'utilisateur a tenir dans la duree quand la charge monte, sans le renvoyer vers un module abstrait.

Retourne uniquement un JSON valide de la forme :
{
  "support_goal": "ce que cette carte aide a proteger",
  "moments": ["moment 1", "moment 2", "moment 3"],
  "grounding_actions": ["geste 1", "geste 2", "geste 3"],
  "reminder": "rappel court"
}

Regles :
- concret
- pas de jargon therapeutique inutile
- 3 a 5 moments
- 2 a 4 grounding_actions
- reminder court
- pas de markdown`;

export const INSPIRATION_SYSTEM_PROMPT =
  `Tu generes des inspirations Sophia.

Les inspirations sont des objets hors plan. Elles servent a donner un angle, un recadrage, un mini-declic ou un micro-pas.

Retourne uniquement un JSON valide de la forme :
{
  "items": [
    {
      "inspiration_type": "recadrage",
      "angle": "angle court",
      "title": "titre court",
      "body": "texte principal",
      "cta_label": "CTA court ou null",
      "cta_payload": {},
      "tags": ["tag1", "tag2"],
      "effort_level": "light",
      "context_window": "anytime"
    }
  ]
}

Regles :
- genere 3 a 5 items
- varie les types
- pas de banalites
- body en 2 a 5 phrases max
- effort_level: light | medium | high
- context_window: anytime | morning | afternoon | evening | during_friction
- pas de markdown`;

export const ATTACK_TECHNIQUE_SYSTEM_PROMPT =
  `Tu personnalises UNE technique de carte d'attaque Sophia.

La carte d'attaque sert a prendre de l'avance. Elle installe quelque chose en amont pour rendre le bon comportement plus naturel, reduire la friction, et demander moins de force sur le moment.

Retourne uniquement un JSON valide de la forme :
{
  "output_title": "titre tres court de l'objet final",
  "generated_asset": "contenu principal genere",
  "supporting_points": ["point 1", "point 2"],
  "mode_emploi": "mode d'emploi personnalise",
  "keyword_trigger": {
    "activation_keyword": "mot court",
    "activation_keyword_normalized": "mot court normalise",
    "risk_situation": "situation precise ou l'utilisateur peut craquer",
    "strength_anchor": "ce qu'il protege de grand ou de noble chez lui",
    "first_response_intent": "ce que Sophia doit faire en premier",
    "assistant_prompt": "instruction tres courte a suivre par Sophia quand elle recoit ce mot"
  }
}

Regles :
- concret
- pas de jargon
- \`generated_asset\` doit etre directement utilisable par l'utilisateur
- si la technique genere un texte, un mantra ou un protocole, mets le texte complet dans \`generated_asset\`
- si la technique genere plutot une recette ou une sequence, mets le coeur de la recette dans \`generated_asset\` et les etapes en \`supporting_points\`
- \`supporting_points\` est optionnel, 0 a 4 items max
- \`mode_emploi\` doit etre personnalise selon les reponses utilisateur
- \`keyword_trigger\` est optionnel pour les autres techniques
- si \`technique_key === "pre_engagement"\`, \`keyword_trigger\` devient obligatoire
- si \`technique_key === "pre_engagement"\` :
  - genere un mot-cle tres court, memorisable, facile a taper sous stress
  - le mot doit etre un seul mot
  - \`generated_asset\` doit expliquer tres simplement quoi envoyer et a quel moment
  - \`assistant_prompt\` doit dire a Sophia comment aider immediatement l'utilisateur a tenir sans entrer dans un long echange
- la technique doit COMPLETER le plan actif, jamais le dupliquer
- n'utilise jamais la technique pour reproposer une mission, une clarification ou une habitude deja prevue dans ce niveau
- n'anticipe jamais une action deja planifiee plus tard dans le niveau
- si d'autres actions du niveau sont fournies dans le contexte, traite-les comme des zones interdites a recopier ou reformuler
- pour \`preparer_terrain\`, reste sur un micro-setup complementaire a l'action cible, pas sur une grosse mission deja prevue dans le plan
- ton simple, direct, utile
- tutoie l'utilisateur
- pas de markdown`;

export const ATTACK_TECHNIQUE_ADJUSTMENT_SYSTEM_PROMPT =
  `Tu aides Sophia a recalibrer une carte d'attaque qui n'a pas bien marche.

Tu ne repars pas de zero. Tu gardes le contexte, la technique deja essayee, l'objet genere, et le retour utilisateur.

Retourne uniquement un JSON valide de la forme :
{
  "decision": "refine" | "change",
  "recommended_technique_key": "texte_recadrage",
  "recommendation_reason": "une phrase courte qui explique pourquoi",
  "diagnostic_questions": ["question 1", "question 2"]
}

Regles :
- \`decision\` vaut \`refine\` si la technique semble bonne mais mal calibree
- \`decision\` vaut \`change\` si une autre technique parait plus adaptee
- \`recommended_technique_key\` doit etre l'une des 6 techniques d'attaque
- \`recommendation_reason\` doit etre courte, concrete, et comprehensible
- \`diagnostic_questions\` contient 0 a 2 questions max
- ces questions ne doivent servir qu'a affiner la prochaine generation
- pas de jargon
- pas de markdown`;

export function buildLabSurfaceUserPrompt(
  input: LabSurfaceGenerationInput,
): string {
  const classificationBlock = input.classification
    ? `
## Classification

- type_key: ${input.classification.type_key}
- plan_style: ${input.classification.plan_style.join(", ")}
- recommended_metrics: ${input.classification.recommended_metrics.join(", ")}
- framing_to_avoid: ${input.classification.framing_to_avoid.join(", ")}
- first_steps_examples: ${input.classification.first_steps_examples.join(", ")}`
    : "";

  return `## Transformation

- Titre: ${input.transformation_title}
- Resume utilisateur: ${input.user_summary}
- Matiere focale deja cristallisee sur la transformation active:
${input.focus_context || "Non renseigne"}

## Strategie

- identity_shift: ${input.plan_strategy.identity_shift ?? "null"}
- core_principle: ${input.plan_strategy.core_principle ?? "null"}
- success_definition: ${input.plan_strategy.success_definition ?? "null"}
- main_constraint: ${input.plan_strategy.main_constraint ?? "null"}

## Questionnaire answers

${JSON.stringify(input.questionnaire_answers ?? {}, null, 2)}${classificationBlock}

${input.action_context?.item_title
    ? `## Focus action courante

- Action cible: ${input.action_context.item_title}
- Type d'action: ${input.action_context.item_kind}
- Description: ${input.action_context.item_description ?? "Non précisée"}
- Niveau du plan: ${input.action_context.phase_label ?? "Non précisé"}
- Moment: ${input.action_context.time_of_day ?? "Non précisé"}
- Cadence: ${input.action_context.cadence_label ?? "Non précisée"}
- Ce qui doit être protégé maintenant: ${input.action_context.activation_hint ?? "L'exécution de cette action au bon moment."}${
      Array.isArray(input.action_context.phase_items_summary) &&
        input.action_context.phase_items_summary.length > 0
        ? `
- Autres actions deja prevues dans ce niveau:
${input.action_context.phase_items_summary.map((item) => `  - ${item}`).join("\n")}`
        : ""
    }`
    : ""}

## Regle de focus

- Ne travaille que sur la transformation active.
- Si un focus action courante est fourni, travaille d'abord pour cette action précise.
- Une carte du Labo doit completer le plan, jamais consommer a l'avance une action deja prevue dans le niveau.
- Si des actions deja prevues dans ce niveau sont fournies, considere-les comme reservees au plan: ne les recopie pas, ne les reformule pas, ne les anticipe pas.
- N'injecte pas les autres transformations du cycle comme themes paralleles.
- Exception rare: si un autre sujet est un obstacle massif et evident pour cette transformation, tu peux le mentionner UNE seule fois maximum dans toute la sortie, sans le developper comme second axe.

Retourne uniquement le JSON demande.`;
}

export function buildAttackTechniqueUserPrompt(
  input: AttackTechniqueGenerationInput,
): string {
  const base = buildLabSurfaceUserPrompt(input);
  const answers = input.user_answers
    .map((answer, index) => `- Reponse ${index + 1}: ${answer}`)
    .join("\n");

  const adjustmentBlock = input.adjustment_context
    ? `
## Contexte d'ajustement

- Technique deja essayee: ${input.adjustment_context.current_technique_title} (${input.adjustment_context.current_technique_key})
- Objet precedent:
${input.adjustment_context.current_generated_asset}
- Mode d'emploi precedent: ${input.adjustment_context.current_mode_emploi}
- Raison d'echec: ${input.adjustment_context.failure_reason_key}
- Notes libres: ${input.adjustment_context.failure_notes ?? "aucune"}
- Pourquoi cette nouvelle direction: ${input.adjustment_context.recommendation_reason ?? "non precise"}

## Questions de diagnostic supplementaires

${(input.adjustment_context.diagnostic_questions ?? []).map((question, index) =>
      `- Question ${index + 1}: ${question}`
    ).join("\n") || "- Aucune"}

## Reponses de diagnostic

${(input.adjustment_context.diagnostic_answers ?? []).map((answer, index) =>
      `- Reponse diagnostic ${index + 1}: ${answer}`
    ).join("\n") || "- Aucune"}`
    : "";

  return `${base}

## Technique choisie

- technique_key: ${input.technique_key}
- titre: ${input.technique_title}
- pour_quoi: ${input.technique_pour_quoi}
- objet_genere: ${input.technique_objet_genere}
- mode_emploi_de_base: ${input.technique_mode_emploi}

## Reponses utilisateur

${answers}

${adjustmentBlock}

${input.technique_key === "pre_engagement"
    ? `## Guidance speciale pour cette technique

- Tu generes un mot-cle de bascule, pas un contrat.
- Le mot-cle doit etre cool, court, memorisable, facile a taper.
- Le texte final doit dire a l'utilisateur d'envoyer seulement ce mot quand il sent qu'il va craquer ou perdre le controle.
- Le JSON final doit absolument remplir \`keyword_trigger\`.`
    : ""}

## Garde-fous anti-chevauchement

- Tu completes l'action cible, tu ne reecris pas le plan.
- N'utilise jamais cette technique pour proposer une mission deja prevue ailleurs dans le niveau.
- N'anticipe pas une action qui apparait deja plus tard dans ce niveau.
- Si une autre action du niveau parle deja de tri, rangement, preparation de l'environnement, retrait des tentations ou installation materielle, ne la refais pas ici.
- Si \`technique_key === "preparer_terrain"\`, cherche un geste plus petit, plus leger, plus immediat que les autres actions deja prevues.

Personnalise maintenant cette technique precise pour cet utilisateur. Retourne uniquement le JSON demande.`;
}

export function buildAttackTechniqueAdjustmentPrompt(
  input: AttackTechniqueAdjustmentAnalysisInput,
): string {
  const base = buildLabSurfaceUserPrompt(input);

  return `${base}

## Technique essayee

- technique_key: ${input.current_technique_key}
- titre: ${input.current_technique_title}
- pour_quoi: ${input.current_technique_pour_quoi}
- mode_emploi: ${input.current_mode_emploi}

## Objet genere qui n'a pas pris

${input.current_generated_asset}

## Retour utilisateur

- raison_principale: ${input.failure_reason_key}
- notes_libres: ${input.failure_notes ?? "aucune"}

Decide maintenant s'il faut affiner cette technique ou en proposer une autre, puis genere 0 a 2 questions de diagnostic si utile. Retourne uniquement le JSON demande.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown, min: number, max: number): value is string[] {
  return Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

export function validateAttackCardOutput(raw: unknown): {
  valid: boolean;
  issues: string[];
  content: AttackCardContent | null;
} {
  const issues: string[] = [];
  if (!isRecord(raw)) return { valid: false, issues: ["output is not an object"], content: null };
  if (typeof raw.summary !== "string" || !raw.summary.trim()) {
    issues.push("summary is required");
  }

  const allowedKeys = new Set([
    "texte_recadrage",
    "mantra_force",
    "ancre_visuelle",
    "visualisation_matinale",
    "preparer_terrain",
    "pre_engagement",
  ]);

  if (!Array.isArray(raw.techniques) || raw.techniques.length !== 6) {
    issues.push("techniques must contain exactly 6 items");
  } else {
    const seen = new Set<string>();
    for (const [index, candidate] of raw.techniques.entries()) {
      if (!isRecord(candidate)) {
        issues.push(`techniques[${index}] must be an object`);
        continue;
      }
      const key = String(candidate.technique_key ?? "");
      if (!allowedKeys.has(key)) {
        issues.push(`techniques[${index}].technique_key is invalid`);
      } else if (seen.has(key)) {
        issues.push(`techniques[${index}].technique_key duplicated`);
      } else {
        seen.add(key);
      }

      if (typeof candidate.title !== "string" || !candidate.title.trim()) {
        issues.push(`techniques[${index}].title is required`);
      }
      if (typeof candidate.pour_quoi !== "string" || !candidate.pour_quoi.trim()) {
        issues.push(`techniques[${index}].pour_quoi is required`);
      }
      if (typeof candidate.objet_genere !== "string" || !candidate.objet_genere.trim()) {
        issues.push(`techniques[${index}].objet_genere is required`);
      }
      if (
        candidate.questions !== undefined &&
        (
          !Array.isArray(candidate.questions) ||
          candidate.questions.length < 2 ||
          candidate.questions.length > 3 ||
          candidate.questions.some((entry) => typeof entry !== "string" || !entry.trim())
        )
      ) {
        issues.push(`techniques[${index}].questions must contain 2 to 3 items when provided`);
      }
      if (typeof candidate.mode_emploi !== "string" || !candidate.mode_emploi.trim()) {
        issues.push(`techniques[${index}].mode_emploi is required`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    content: issues.length === 0 ? raw as AttackCardContent : null,
  };
}

export function validateSupportCardOutput(raw: unknown): {
  valid: boolean;
  issues: string[];
  content: SupportCardContent | null;
} {
  const issues: string[] = [];
  if (!isRecord(raw)) return { valid: false, issues: ["output is not an object"], content: null };
  if (typeof raw.support_goal !== "string" || !raw.support_goal.trim()) {
    issues.push("support_goal is required");
  }
  if (!isStringArray(raw.moments, 3, 5)) {
    issues.push("moments must contain 3-5 strings");
  }
  if (!isStringArray(raw.grounding_actions, 2, 4)) {
    issues.push("grounding_actions must contain 2-4 strings");
  }
  if (typeof raw.reminder !== "string" || !raw.reminder.trim()) {
    issues.push("reminder is required");
  }

  return {
    valid: issues.length === 0,
    issues,
    content: issues.length === 0 ? raw as SupportCardContent : null,
  };
}

type InspirationOutput = Pick<
  UserInspirationItemRow,
  | "inspiration_type"
  | "angle"
  | "title"
  | "body"
  | "cta_label"
  | "cta_payload"
  | "tags"
  | "effort_level"
  | "context_window"
>;

export function validateInspirationOutput(raw: unknown): {
  valid: boolean;
  issues: string[];
  items: InspirationOutput[];
} {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, issues: ["output is not an object"], items: [] };
  }
  if (!Array.isArray(raw.items) || raw.items.length < 3 || raw.items.length > 5) {
    return {
      valid: false,
      issues: ["items must contain 3-5 inspiration objects"],
      items: [],
    };
  }

  const items: InspirationOutput[] = [];
  for (const candidate of raw.items) {
    if (!isRecord(candidate)) {
      issues.push("each inspiration item must be an object");
      continue;
    }
    if (typeof candidate.inspiration_type !== "string" || !candidate.inspiration_type.trim()) {
      issues.push("inspiration_type is required");
    }
    if (typeof candidate.title !== "string" || !candidate.title.trim()) {
      issues.push("title is required");
    }
    if (typeof candidate.body !== "string" || !candidate.body.trim()) {
      issues.push("body is required");
    }
    if (!Array.isArray(candidate.tags) || candidate.tags.some((tag) => typeof tag !== "string")) {
      issues.push("tags must be a string array");
    }
    if (!["light", "medium", "high"].includes(String(candidate.effort_level ?? ""))) {
      issues.push("effort_level is invalid");
    }
    if (
      !["anytime", "morning", "afternoon", "evening", "during_friction"]
        .includes(String(candidate.context_window ?? ""))
    ) {
      issues.push("context_window is invalid");
    }

    items.push({
      inspiration_type: String(candidate.inspiration_type ?? "").trim(),
      angle: typeof candidate.angle === "string" && candidate.angle.trim()
        ? candidate.angle.trim()
        : null,
      title: String(candidate.title ?? "").trim(),
      body: String(candidate.body ?? "").trim(),
      cta_label: typeof candidate.cta_label === "string" && candidate.cta_label.trim()
        ? candidate.cta_label.trim()
        : null,
      cta_payload: isRecord(candidate.cta_payload) ? candidate.cta_payload : {},
      tags: Array.isArray(candidate.tags)
        ? candidate.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
        : [],
      effort_level: candidate.effort_level as UserInspirationItemRow["effort_level"],
      context_window: candidate.context_window as UserInspirationItemRow["context_window"],
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    items: issues.length === 0 ? items : [],
  };
}

export function validateAttackTechniqueOutput(raw: unknown): {
  valid: boolean;
  issues: string[];
  content: {
    output_title: string;
    generated_asset: string;
    supporting_points: string[];
    mode_emploi: string;
    keyword_trigger: {
      activation_keyword: string;
      activation_keyword_normalized: string;
      risk_situation: string;
      strength_anchor: string;
      first_response_intent: string;
      assistant_prompt: string;
    } | null;
  } | null;
} {
  const issues: string[] = [];
  if (!isRecord(raw)) return { valid: false, issues: ["output is not an object"], content: null };
  if (typeof raw.output_title !== "string" || !raw.output_title.trim()) {
    issues.push("output_title is required");
  }
  if (typeof raw.generated_asset !== "string" || !raw.generated_asset.trim()) {
    issues.push("generated_asset is required");
  }
  if (
    raw.supporting_points !== undefined &&
    !isStringArray(raw.supporting_points, 1, 4)
  ) {
    issues.push("supporting_points must contain 1-4 strings when provided");
  }
  if (typeof raw.mode_emploi !== "string" || !raw.mode_emploi.trim()) {
    issues.push("mode_emploi is required");
  }

  let keywordTrigger: {
    activation_keyword: string;
    activation_keyword_normalized: string;
    risk_situation: string;
    strength_anchor: string;
    first_response_intent: string;
    assistant_prompt: string;
  } | null = null;

  if (raw.keyword_trigger !== undefined) {
    if (!isRecord(raw.keyword_trigger)) {
      issues.push("keyword_trigger must be an object when provided");
    } else {
      const activationKeyword = String(raw.keyword_trigger.activation_keyword ?? "").trim();
      const activationKeywordNormalized = String(
        raw.keyword_trigger.activation_keyword_normalized ?? "",
      ).trim();
      const riskSituation = String(raw.keyword_trigger.risk_situation ?? "").trim();
      const strengthAnchor = String(raw.keyword_trigger.strength_anchor ?? "").trim();
      const firstResponseIntent = String(
        raw.keyword_trigger.first_response_intent ?? "",
      ).trim();
      const assistantPrompt = String(raw.keyword_trigger.assistant_prompt ?? "").trim();

      if (!activationKeyword) issues.push("keyword_trigger.activation_keyword is required");
      if (!activationKeywordNormalized) {
        issues.push("keyword_trigger.activation_keyword_normalized is required");
      }
      if (!riskSituation) issues.push("keyword_trigger.risk_situation is required");
      if (!strengthAnchor) issues.push("keyword_trigger.strength_anchor is required");
      if (!firstResponseIntent) {
        issues.push("keyword_trigger.first_response_intent is required");
      }
      if (!assistantPrompt) issues.push("keyword_trigger.assistant_prompt is required");

      if (
        activationKeyword &&
        activationKeywordNormalized &&
        riskSituation &&
        strengthAnchor &&
        firstResponseIntent &&
        assistantPrompt
      ) {
        keywordTrigger = {
          activation_keyword: activationKeyword,
          activation_keyword_normalized: activationKeywordNormalized,
          risk_situation: riskSituation,
          strength_anchor: strengthAnchor,
          first_response_intent: firstResponseIntent,
          assistant_prompt: assistantPrompt,
        };
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    content: issues.length === 0
      ? {
          output_title: String(raw.output_title).trim(),
          generated_asset: String(raw.generated_asset).trim(),
          supporting_points: Array.isArray(raw.supporting_points)
            ? raw.supporting_points.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 4)
            : [],
          mode_emploi: String(raw.mode_emploi).trim(),
          keyword_trigger: keywordTrigger,
        }
      : null,
  };
}
