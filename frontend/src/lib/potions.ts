import type { PotionDefinition, PotionQuestion, PotionType } from "../types/v2";

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
    free_text_label:
      "Si tu veux, ajoute ce que tu aimerais retrouver dans ce plan.",
    free_text_placeholder: "Une phrase suffit.",
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
      "Quand tu montes en pression, que tu es a cran ou trop stressé, elle t'aide a redescendre.",
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

export const POTION_LIST = Object.values(POTION_DEFINITIONS);
