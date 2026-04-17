import type {
  LabTransformationContext,
} from "./v2-lab-context.ts";
import type {
  PotionActivationContent,
  PotionDefinition,
  PotionQuestion,
  PotionType,
} from "./v2-types.ts";

type PotionResponseShape = PotionActivationContent;

function selectQuestion(
  id: string,
  label: string,
  options: Array<{ value: string; label: string }>,
  helperText?: string,
): PotionQuestion {
  return {
    id,
    label,
    helper_text: helperText ?? null,
    input_type: "single_select",
    options,
    placeholder: null,
    required: true,
  };
}

function textQuestion(
  id: string,
  label: string,
  placeholder: string,
  helperText?: string,
): PotionQuestion {
  return {
    id,
    label,
    helper_text: helperText ?? null,
    input_type: "free_text",
    options: [],
    placeholder,
    required: true,
  };
}

export const POTION_DEFINITIONS: Record<PotionType, PotionDefinition> = {
  rappel: {
    type: "rappel",
    title: "Potion anti-decrochage",
    short_description:
      "Quand tu sais deja ce que tu devrais faire mais que tu sens que tu laisses filer, elle t'aide a te raccrocher.",
    state_trigger: [
      "Je sens que je suis en train de laisser tomber.",
      "Je sais ce que je dois faire, mais je laisse filer.",
      "Je sais que je devrais m'y mettre, mais j'ai plus l'elan.",
    ],
    effect_goal: [
      "te raccrocher",
      "couper le glissement",
      "te remettre dans le mouvement",
    ],
    questionnaire: [
      textQuestion(
        "drift_target",
        "Par rapport a quoi tu sens que tu decroches ?",
        "Exemple: mon sport, mon coucher, une action importante, un cap que je laisse filer.",
      ),
      selectQuestion(
        "drift_style",
        "Tu decroches plutot comment ?",
        [
          { value: "oubli", label: "J'oublie" },
          { value: "repousse", label: "Je repousse" },
          { value: "laisse_filer", label: "Je laisse filer" },
          { value: "baisse_elan", label: "Je perds l'elan" },
        ],
      ),
      selectQuestion(
        "support_need",
        "Qu'est-ce qui t'aiderait le plus en ce moment ?",
        [
          { value: "rappel", label: "Un rappel court" },
          { value: "presence", label: "Une presence reguliere" },
          { value: "relance", label: "Une relance pour repartir" },
        ],
      ),
    ],
    free_text_label: "Si tu veux, ajoute ce que tu sens en train de glisser.",
    free_text_placeholder: "Tu peux rester simple. Une phrase suffit.",
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Un petit message quotidien peut aider a raccrocher avant que le glissement s'installe.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
    },
  },
  courage: {
    type: "courage",
    title: "Potion de courage",
    short_description:
      "Quand la peur, l'apprehension ou l'evitement te bloquent, elle t'aide a avancer sans te brutaliser.",
    state_trigger: [
      "Je repousse parce que ca m'angoisse.",
      "J'ai peur d'y aller, donc j'evite.",
      "Rien que d'y penser, ca me bloque.",
    ],
    effect_goal: [
      "faire un premier pas",
      "tenir face a l'inconfort",
      "sortir de l'evitement",
    ],
    questionnaire: [
      textQuestion(
        "avoidance_target",
        "Qu'est-ce que tu evites en ce moment ?",
        "Exemple: envoyer un message, prendre une decision, faire quelque chose qui m'impressionne.",
      ),
      selectQuestion(
        "blocker_kind",
        "Qu'est-ce qui bloque le plus ?",
        [
          { value: "resultat", label: "La peur du resultat" },
          { value: "regard", label: "La peur du regard des autres" },
          { value: "inconfort", label: "La peur de l'inconfort" },
          { value: "conflit", label: "La peur du conflit" },
        ],
      ),
      selectQuestion(
        "desired_help",
        "Tu as surtout besoin de quoi ?",
        [
          { value: "premier_pas", label: "D'un premier pas concret" },
          { value: "force", label: "D'un regain de force" },
          { value: "permission", label: "D'une permission d'y aller doucement" },
        ],
      ),
    ],
    free_text_label: "Si tu veux, precise ce qui te fait le plus hesiter.",
    free_text_placeholder: "Exemple: je sais quoi faire, mais mon corps se ferme des que j'y pense.",
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Un petit appui pendant quelques jours peut aider a ne pas re-rentrer dans l'evitement.",
      suggested_delay_hours: 24,
      suggested_duration_days: 5,
    },
  },
  guerison: {
    type: "guerison",
    title: "Potion de guerison",
    short_description:
      "Quand tu t'en veux, que tu as craque ou que tu te sens blesse, elle t'aide a te relever sans t'enfoncer.",
    state_trigger: [
      "Je m'en veux pour ce qui s'est passe.",
      "Je me sens mal apres avoir craque ou echoue.",
      "J'ai besoin d'aide pour me relever sans m'enfoncer.",
    ],
    effect_goal: [
      "te relever",
      "degonfler la honte",
      "repartir plus proprement",
    ],
    questionnaire: [
      textQuestion(
        "recent_hurt",
        "Qu'est-ce qui t'a fait mal ou t'a fait retomber recemment ?",
        "Exemple: j'ai craque hier, j'ai abandonne quelque chose, je me suis parle tres violemment.",
      ),
      selectQuestion(
        "dominant_feeling",
        "Tu ressens surtout quoi ?",
        [
          { value: "culpabilite", label: "De la culpabilite" },
          { value: "honte", label: "De la honte" },
          { value: "decouragement", label: "Du decouragement" },
          { value: "fatigue", label: "De la fatigue" },
        ],
      ),
      selectQuestion(
        "repair_need",
        "Tu as surtout besoin de quoi maintenant ?",
        [
          { value: "pardonner", label: "Me pardonner" },
          { value: "relever", label: "Me relever" },
          { value: "reprendre_doucement", label: "Reprendre doucement" },
        ],
      ),
    ],
    free_text_label: "Si tu veux, ajoute ce que cet episode t'a fait ressentir.",
    free_text_placeholder: "Le but n'est pas de tout raconter. Juste d'ancrer la reparation dans le reel.",
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Un message doux sur quelques jours aide a reparer sans replonger dans l'auto-attaque.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
    },
  },
  clarte: {
    type: "clarte",
    title: "Potion de clarte",
    short_description:
      "Quand tout est flou, qu'il y a trop de choses ou que tu perds le sens, elle remet de l'ordre.",
    state_trigger: [
      "Je ne sais plus par quoi commencer.",
      "J'ai trop de choses dans la tete, tout se melange.",
      "Je ne vois plus clairement ce qui est important.",
    ],
    effect_goal: [
      "retrouver du sens",
      "voir plus clair",
      "faire emerger la prochaine etape",
    ],
    questionnaire: [
      textQuestion(
        "clarity_problem",
        "Qu'est-ce qui est flou pour toi en ce moment ?",
        "Exemple: je ne sais plus quoi prioriser, je suis noye, je ne sais plus ce qui compte vraiment.",
      ),
      selectQuestion(
        "clarity_need",
        "Tu as surtout besoin de comprendre quoi ?",
        [
          { value: "quoi_faire", label: "Quoi faire" },
          { value: "par_ou_commencer", label: "Par ou commencer" },
          { value: "ce_qui_compte", label: "Ce qui compte vraiment" },
        ],
      ),
      selectQuestion(
        "output_style",
        "Tu veux ressortir avec quoi ?",
        [
          { value: "simple", label: "Quelque chose de simple" },
          { value: "structure", label: "Quelque chose de plus structure" },
          { value: "priorite", label: "Une priorite nette" },
        ],
      ),
    ],
    free_text_label: "Si tu veux, ajoute le point qui te brouille le plus.",
    free_text_placeholder: "Une phrase suffit.",
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Un point de recentrage sur quelques jours peut aider a ne pas te re-disperser.",
      suggested_delay_hours: 24,
      suggested_duration_days: 5,
    },
  },
  amour: {
    type: "amour",
    title: "Potion d'amour",
    short_description:
      "Quand tu es dur avec toi, froid envers toi ou en manque de douceur, elle remet de la chaleur humaine.",
    state_trigger: [
      "Je suis trop dur avec moi-meme.",
      "J'ai besoin qu'on me parle avec douceur.",
      "Je me traite mal en ce moment.",
    ],
    effect_goal: [
      "ramener de la douceur",
      "adoucir le dialogue interieur",
      "te traiter plus humainement",
    ],
    questionnaire: [
      textQuestion(
        "self_talk",
        "Comment est-ce que tu te parles en ce moment ?",
        "Exemple: je me juge, je me rabaisse, je me sens froid avec moi.",
      ),
      selectQuestion(
        "love_state",
        "Tu te sens plutot comment ?",
        [
          { value: "dur", label: "Dur avec moi" },
          { value: "seul", label: "Seul" },
          { value: "vide", label: "Vide affectivement" },
        ],
      ),
      selectQuestion(
        "love_need",
        "Tu as surtout besoin de quoi ?",
        [
          { value: "douceur", label: "De douceur" },
          { value: "reconfort", label: "De reconfort" },
          { value: "tendresse", label: "D'un regard plus tendre" },
        ],
      ),
    ],
    free_text_label: "Pourquoi est-ce que tu manques d'amour en ce moment ?",
    free_text_placeholder: "Tu peux rester tres simple.",
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Une parole douce pendant quelques jours peut aider a changer le climat interieur.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
    },
  },
  apaisement: {
    type: "apaisement",
    title: "Potion d'apaisement",
    short_description:
      "Quand tu montes en pression, que tu es a cran ou trop stresse, elle t'aide a redescendre.",
    state_trigger: [
      "Je suis trop stresse la.",
      "Je sens que je monte en pression.",
      "Je suis a cran.",
    ],
    effect_goal: [
      "redescendre",
      "desserrer la pression",
      "retrouver un peu d'espace interieur",
    ],
    questionnaire: [
      textQuestion(
        "pressure_source",
        "Qu'est-ce qui te met le plus sous pression la ?",
        "Exemple: une accumulation, une discussion, une pensee qui tourne, une situation qui me comprime.",
      ),
      selectQuestion(
        "pressure_state",
        "Tu te sens plutot comment ?",
        [
          { value: "stresse", label: "Tres stresse" },
          { value: "a_cran", label: "A cran" },
          { value: "submerge", label: "Submerge" },
        ],
      ),
      selectQuestion(
        "calm_need",
        "Tu as besoin de quoi ?",
        [
          { value: "ralentir", label: "Ralentir" },
          { value: "respirer", label: "Respirer" },
          { value: "relacher", label: "Relacher la pression" },
        ],
      ),
    ],
    free_text_label: "Si tu veux, ajoute ce qui a allume l'alerte.",
    free_text_placeholder: "Une phrase suffit.",
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale: "Un point d'apaisement quotidien sur quelques jours peut aider a casser la montee en charge.",
      suggested_delay_hours: 24,
      suggested_duration_days: 3,
    },
  },
};

export const POTION_SYSTEM_PROMPT =
  `Tu generes la reponse immediate d'une potion Sophia.

La potion sert a traverser un etat interieur maintenant.
Elle a toujours 2 sorties:
1. un texte court qui fait du bien, rassure, remet dans l'axe et aide tout de suite
2. une proposition de rendez-vous quotidien pendant quelques jours, que le user pourra programmer ensuite

Retourne uniquement un JSON valide de la forme :
{
  "potion_name": "nom court de la potion, memorisable et personnel",
  "instant_response": "3 a 6 phrases maximum, tres ciblees, tres humaines, utiles maintenant",
  "suggested_next_step": "un geste tres simple a faire juste apres, ou null",
  "follow_up_proposal": {
    "title": "titre tres court",
    "description": "1 a 2 phrases qui expliquent a quoi servira ce rendez-vous",
    "message_text": "message court que Sophia pourra envoyer chaque jour",
    "cadence_hint": "exemple: chaque jour pendant quelques jours"
  }
}

Regles :
- pas de markdown
- pas de jargon therapeutique
- pas de ton professoral
- tutoie toujours la personne
- adapte la reponse au type de potion, aux reponses donnees et au contexte
- \`potion_name\` doit etre court, concret, memorisable, et donner envie de retrouver cette potion plus tard
- instant_response doit vraiment ressembler a des mots qui font du bien maintenant
- suggested_next_step peut etre null si rien n'est utile
- follow_up_proposal doit etre presente sauf cas tres exceptionnel ou elle n'apporte vraiment rien
- follow_up_proposal.message_text doit etre un vrai message court que la personne pourrait recevoir tel quel
- si la potion est d'apaisement, privilegie la deceleration
- si la potion est de guerison, ne culpabilise jamais`;

export function getPotionDefinition(type: PotionType): PotionDefinition {
  return POTION_DEFINITIONS[type];
}

export function buildPotionActivationPrompt(args: {
  context: LabTransformationContext;
  definition: PotionDefinition;
  answers: Record<string, string>;
  freeText: string | null;
}): string {
  const answerLines = args.definition.questionnaire.map((question) => {
    const rawAnswer = args.answers[question.id];
    if (question.input_type === "free_text") {
      return `- ${question.label}: ${rawAnswer?.trim() || "Non renseigne"}`;
    }
    const answerLabel = question.options.find((option) => option.value === rawAnswer)?.label ??
      rawAnswer ?? "Non renseigne";
    return `- ${question.label}: ${answerLabel || "Non renseigne"}`;
  }).join("\n");

  const classificationBlock = args.context.classification
    ? `
## Classification

- type_key: ${args.context.classification.type_key}
- plan_style: ${args.context.classification.plan_style.join(", ")}
- recommended_metrics: ${args.context.classification.recommended_metrics.join(", ")}`
    : "";

  return `## Potion

- type: ${args.definition.type}
- titre: ${args.definition.title}
- effet recherche: ${args.definition.effect_goal.join(", ")}

## Etats qui ressemblent a cette potion

${args.definition.state_trigger.map((item) => `- ${item}`).join("\n")}

## Etat du moment

${answerLines}

## Champ libre

${args.freeText?.trim() || "Non renseigne"}

## Transformation

- titre: ${args.context.transformation_title}
- resume utilisateur: ${args.context.user_summary}
- texte libre: ${args.context.free_text || "Non renseigne"}
- identity_shift: ${args.context.plan_strategy.identity_shift ?? "null"}
- core_principle: ${args.context.plan_strategy.core_principle ?? "null"}
- success_definition: ${args.context.plan_strategy.success_definition ?? "null"}
- main_constraint: ${args.context.plan_strategy.main_constraint ?? "null"}${classificationBlock}

## Questionnaire global

${JSON.stringify(args.context.questionnaire_answers ?? {}, null, 2)}

Rappels importants:
- traite d'abord l'etat interieur, pas la mecanique du plan
- si le user parle d'une action du plan, tu peux t'y raccrocher, mais la potion reste centree sur son etat
- le texte doit etre court, chaud, concret et utile

Retourne uniquement le JSON demande.`;
}

export function validatePotionActivationOutput(raw: unknown): {
  valid: boolean;
  issues: string[];
  content: PotionResponseShape | null;
} {
  const issues: string[] = [];
  if (!isRecord(raw)) {
    return { valid: false, issues: ["output is not an object"], content: null };
  }
  if (typeof raw.potion_name !== "string" || !raw.potion_name.trim()) {
    issues.push("potion_name is required");
  }
  if (typeof raw.instant_response !== "string" || !raw.instant_response.trim()) {
    issues.push("instant_response is required");
  }
  if (
    raw.suggested_next_step !== null &&
    raw.suggested_next_step !== undefined &&
    (typeof raw.suggested_next_step !== "string" || !raw.suggested_next_step.trim())
  ) {
    issues.push("suggested_next_step must be a non-empty string or null");
  }

  let followUpProposal: PotionResponseShape["follow_up_proposal"] = null;
  if (raw.follow_up_proposal !== null && raw.follow_up_proposal !== undefined) {
    if (!isRecord(raw.follow_up_proposal)) {
      issues.push("follow_up_proposal must be an object or null");
    } else {
      const title = typeof raw.follow_up_proposal.title === "string"
        ? raw.follow_up_proposal.title.trim()
        : "";
      const description = typeof raw.follow_up_proposal.description === "string"
        ? raw.follow_up_proposal.description.trim()
        : "";
      const messageText = typeof raw.follow_up_proposal.message_text === "string"
        ? raw.follow_up_proposal.message_text.trim()
        : "";
      const cadenceHint = typeof raw.follow_up_proposal.cadence_hint === "string" &&
          raw.follow_up_proposal.cadence_hint.trim()
        ? raw.follow_up_proposal.cadence_hint.trim()
        : null;

      if (!title) issues.push("follow_up_proposal.title is required");
      if (!description) issues.push("follow_up_proposal.description is required");
      if (!messageText) issues.push("follow_up_proposal.message_text is required");

      if (title && description && messageText) {
        followUpProposal = {
          title,
          description,
          message_text: messageText,
          cadence_hint: cadenceHint,
        };
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    content: issues.length === 0
      ? {
        potion_name: String(raw.potion_name).trim(),
        instant_response: String(raw.instant_response).trim(),
        suggested_next_step: typeof raw.suggested_next_step === "string" &&
            raw.suggested_next_step.trim()
          ? raw.suggested_next_step.trim()
          : null,
        follow_up_proposal: followUpProposal,
      }
      : null,
  };
}

export function validatePotionAnswers(
  definition: PotionDefinition,
  answers: Record<string, string>,
  freeText: string | null,
): string[] {
  const issues: string[] = [];
  for (const question of definition.questionnaire) {
    const answer = answers[question.id];
    if (question.required && !(answer && answer.trim())) {
      issues.push(`${question.id} is required`);
      continue;
    }
    if (
      question.input_type === "single_select" &&
      answer &&
      !question.options.some((option) => option.value === answer)
    ) {
      issues.push(`${question.id} has an invalid option`);
    }
  }
  if (definition.free_text_required && !(freeText && freeText.trim())) {
    issues.push("free_text is required");
  }
  return issues;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
