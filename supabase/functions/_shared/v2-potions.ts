import type { LabTransformationContext } from "./v2-lab-context.ts";
import {
  formatPotionBaseContextForPrompt,
  type PotionBaseContext,
} from "./potion-base-context.ts";
import type {
  PotionActivationContent,
  PotionDefinition,
  PotionQuestion,
  PotionScopeSelection,
  PotionType,
  RappelScopeSelection,
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
    ],
    free_text_label: null,
    free_text_placeholder: null,
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale:
        "Un petit message quotidien peut aider a raccrocher avant que le glissement s'installe.",
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
    ],
    free_text_label: null,
    free_text_placeholder: null,
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale:
        "Un petit appui pendant quelques jours peut aider a ne pas re-rentrer dans l'evitement.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
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
    ],
    free_text_label: null,
    free_text_placeholder: null,
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale:
        "Un message doux sur quelques jours aide a reparer sans replonger dans l'auto-attaque.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
    },
  },
  clarte: {
    type: "clarte",
    title: "Potion de clarte",
    short_description:
      "Quand ton plan perd son sens, elle t'aide a retrouver pourquoi il compte pour toi et a te reconnecter a ton pourquoi profond.",
    state_trigger: [
      "Je fais les actions de mon plan mecaniquement.",
      "Je ne vois plus le lien entre mon plan et mon pourquoi profond.",
      "Je ne me reconnais plus vraiment dans ce plan.",
    ],
    effect_goal: [
      "retrouver pourquoi ce plan compte",
      "reconnecter le plan au pourquoi profond",
      "ramener du sens dans les actions du plan",
    ],
    questionnaire: [
      textQuestion(
        "plan_meaning_loss_reason",
        "Qu'est-ce qui te donne l'impression que ton plan n'a plus de sens pour toi aujourd'hui ?",
        "Exemple: je fais les actions mecaniquement, je ne vois plus le lien avec mon pourquoi profond, ou je ne me reconnais plus dans ce plan.",
      ),
    ],
    free_text_label: null,
    free_text_placeholder: null,
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale:
        "Un rappel quotidien peut t'aider a garder le lien entre ton plan et ton pourquoi profond.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
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
        "love_lack_context",
        "Par rapport a quoi est-ce que tu te sens en manque d'amour en ce moment ?",
        "Exemple: une partie de moi que je juge, une situation ou je me sens seul, un echec, ou quelque chose que je n'arrive pas a m'offrir.",
      ),
      selectQuestion(
        "love_state",
        "Tu te sens surtout comment ?",
        [
          { value: "dur", label: "Dur avec moi" },
          { value: "seul", label: "Seul" },
          { value: "vide", label: "Vide" },
        ],
      ),
    ],
    free_text_label: null,
    free_text_placeholder: null,
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale:
        "Une parole douce pendant quelques jours peut aider a changer le climat interieur.",
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
    ],
    free_text_label: null,
    free_text_placeholder: null,
    free_text_required: false,
    default_follow_up_strategy: {
      mode: "suggested_series",
      rationale:
        "Un point d'apaisement quotidien sur quelques jours peut aider a casser la montee en charge.",
      suggested_delay_hours: 24,
      suggested_duration_days: 7,
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
- n'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t'adresser directement à la personne
- adapte la reponse au type de potion, aux reponses donnees et au contexte
- \`potion_name\` doit etre court, concret, memorisable, et donner envie de retrouver cette potion plus tard
- instant_response doit vraiment ressembler a des mots qui font du bien maintenant
- suggested_next_step peut etre null si rien n'est utile
- follow_up_proposal doit etre presente sauf cas tres exceptionnel ou elle n'apporte vraiment rien
- follow_up_proposal.message_text doit etre un vrai message court que la personne pourrait recevoir tel quel
- si la potion est de clarte, reconnecte le plan au pourquoi profond; ne la transforme pas en priorisation, todo-list ou breakdown d'action
- si la potion est d'amour, parle de douceur envers soi sans infantiliser, sans medicaliser et sans en faire une performance emotionnelle
- si la potion est d'apaisement, privilegie la deceleration
- si la potion est de guerison, ne culpabilise jamais`;

export function getPotionDefinition(type: PotionType): PotionDefinition {
  return POTION_DEFINITIONS[type];
}

export function buildPotionActivationPrompt(args: {
  context: LabTransformationContext;
  baseContext?: PotionBaseContext | null;
  definition: PotionDefinition;
  answers: Record<string, string>;
  freeText: string | null;
  potionScope?: PotionScopeSelection | null;
  rappelScope?: RappelScopeSelection | null;
  targetBinding?: Record<string, unknown> | null;
}): string {
  const answerLines = args.definition.questionnaire.map((question) => {
    const rawAnswer = args.answers[question.id];
    if (question.input_type === "free_text") {
      return `- ${question.label}: ${rawAnswer?.trim() || "Non renseigne"}`;
    }
    const answerLabel = question.options.find((option) =>
      option.value === rawAnswer
    )?.label ??
      rawAnswer ?? "Non renseigne";
    return `- ${question.label}: ${answerLabel || "Non renseigne"}`;
  }).join("\n");

  const classificationBlock = args.context.classification
    ? `
## Classification

- type_key: ${args.context.classification.type_key}
- plan_style: ${args.context.classification.plan_style.join(", ")}
- recommended_metrics: ${
      args.context.classification.recommended_metrics.join(", ")
    }`
    : "";
  const potionScope = args.potionScope ?? args.rappelScope ?? null;
  const potionScopeBlock = args.definition.type === "rappel"
    ? `
## Scope anti-decrochage plateforme

${
      JSON.stringify(
        {
          potion_scope: potionScope,
          rappel_scope: potionScope,
          target_binding: args.targetBinding ?? null,
        },
        null,
        2,
      )
    }

Regles anti-decrochage:
- si potion_scope.scope_kind = "plan_linked", tu peux utiliser le pourquoi profond, le plan actif, la transformation et les actions actives; si target_plan_item_id est fourni, relie prioritairement a cette action; si target_scope = "whole_plan", relie au cap global; si target_scope = "unknown", reste prudent et n'invente pas d'action precise.
- si potion_scope.scope_kind = "out_of_plan", ne force pas le pourquoi profond, ne fais pas de lien au plan et reste centre sur drift_target.
- ne deduis jamais plan-linked/out-of-plan par mots-cles: utilise seulement le scope structure ci-dessus.`
    : args.definition.type === "courage"
    ? `
## Scope courage plateforme

${
      JSON.stringify(
        {
          potion_scope: potionScope,
          target_binding: args.targetBinding ?? null,
        },
        null,
        2,
      )
    }

Regles courage:
- si potion_scope.scope_kind = "plan_linked", tu peux utiliser le pourquoi profond, le plan actif, l'action ciblee si connue, la contrainte principale, identity_shift et core_principle; relie l'objet evite au passage de transformation sans pousser brutalement.
- si potion_scope.scope_kind = "out_of_plan", ne force pas le plan, ne force pas le pourquoi profond, et reste centre sur avoidance_target et blocker_kind.
- ne deduis jamais plan-linked/out-of-plan par mots-cles: utilise seulement le scope structure ci-dessus.`
    : args.definition.type === "guerison"
    ? `
## Scope guerison plateforme

${
      JSON.stringify(
        {
          potion_scope: potionScope,
          target_binding: args.targetBinding ?? null,
        },
        null,
        2,
      )
    }

Regles guerison:
- si potion_scope.scope_kind = "plan_linked", tu peux utiliser le pourquoi profond, la transformation, la strategie du plan, identity_shift, core_principle, la contrainte principale et l'action ciblee si connue; repare le lien au chemin sans pousser a performer.
- si potion_scope.scope_kind = "out_of_plan", ne force pas le plan, ne force pas le pourquoi profond, et reste centre sur recent_hurt et dominant_feeling.
- ne deduis jamais plan-linked/out-of-plan par mots-cles: utilise seulement le scope structure ci-dessus.`
    : args.definition.type === "amour"
    ? `
## Scope amour plateforme

${
      JSON.stringify(
        {
          potion_scope: potionScope,
          target_binding: args.targetBinding ?? null,
        },
        null,
        2,
      )
    }

Regles amour:
- si potion_scope.scope_kind = "plan_linked", tu peux utiliser le pourquoi profond, le plan actif, l'action ciblee si connue, identity_shift et core_principle; ramene le plan comme soutien, jamais comme preuve de valeur.
- si potion_scope.scope_kind = "out_of_plan", ne force pas le plan, ne force pas le pourquoi profond, et reste centre sur love_lack_context et love_state.
- ne deduis jamais plan-linked/out-of-plan par mots-cles: utilise seulement le scope structure ci-dessus.`
    : args.definition.type === "apaisement"
    ? `
## Scope apaisement plateforme

${
      JSON.stringify(
        {
          potion_scope: potionScope,
          target_binding: args.targetBinding ?? null,
        },
        null,
        2,
      )
    }

Regles apaisement:
- si potion_scope.scope_kind = "plan_linked", tu peux utiliser le plan, la charge visible, la contrainte principale, le pourquoi profond et l'action ciblee si connue pour desserrer la pression autour du plan; ne transforme jamais l'apaisement en motivation ou performance.
- si potion_scope.scope_kind = "out_of_plan", ne force pas le plan, ne force pas le pourquoi profond, et reste centre sur pressure_source et pressure_state.
- ne deduis jamais plan-linked/out-of-plan par mots-cles: utilise seulement le scope structure ci-dessus.`
    : "";

  return `## Potion

- type: ${args.definition.type}
- titre: ${args.definition.title}
- effet recherche: ${args.definition.effect_goal.join(", ")}

## Etats qui ressemblent a cette potion

${args.definition.state_trigger.map((item) => `- ${item}`).join("\n")}

## Etat du moment

${answerLines}

${
    args.definition.free_text_label
      ? `## Champ libre\n\n${args.freeText?.trim() || "Non renseigne"}`
      : ""
  }

## Transformation

- titre: ${args.context.transformation_title}
- resume utilisateur: ${args.context.user_summary}
- texte libre: ${args.context.free_text || "Non renseigne"}
- identity_shift: ${args.context.plan_strategy.identity_shift ?? "null"}
- core_principle: ${args.context.plan_strategy.core_principle ?? "null"}
- success_definition: ${args.context.plan_strategy.success_definition ?? "null"}
- main_constraint: ${
    args.context.plan_strategy.main_constraint ?? "null"
  }${classificationBlock}

## Questionnaire global

${JSON.stringify(args.context.questionnaire_answers ?? {}, null, 2)}

## Contexte de base disponible en base

${formatPotionBaseContextForPrompt(args.baseContext)}
${potionScopeBlock}

Rappels importants:
- traite d'abord l'etat interieur, pas la mecanique du plan
- si la potion est de clarte, l'etat interieur est la perte de sens du plan: reconnecte les actions au pourquoi profond quand il est disponible
- si la potion est d'amour, l'etat interieur est le manque de douceur ou de regard tendre envers soi; ne transforme jamais l'amour en performance emotionnelle
- si le user parle d'une action du plan, tu peux t'y raccrocher, mais la potion reste centree sur son etat
- n'invente jamais de contexte personnel absent de la base ou des reponses de l'utilisateur
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
  if (
    typeof raw.instant_response !== "string" || !raw.instant_response.trim()
  ) {
    issues.push("instant_response is required");
  }
  if (
    raw.suggested_next_step !== null &&
    raw.suggested_next_step !== undefined &&
    (typeof raw.suggested_next_step !== "string" ||
      !raw.suggested_next_step.trim())
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
      const messageText =
        typeof raw.follow_up_proposal.message_text === "string"
          ? raw.follow_up_proposal.message_text.trim()
          : "";
      const cadenceHint =
        typeof raw.follow_up_proposal.cadence_hint === "string" &&
          raw.follow_up_proposal.cadence_hint.trim()
          ? raw.follow_up_proposal.cadence_hint.trim()
          : null;

      if (!title) issues.push("follow_up_proposal.title is required");
      if (!description) {
        issues.push("follow_up_proposal.description is required");
      }
      if (!messageText) {
        issues.push("follow_up_proposal.message_text is required");
      }

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
