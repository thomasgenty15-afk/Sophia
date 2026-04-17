import type {
  PotionDefinition,
  PotionQuestion,
  PotionType,
} from "../types/v2";

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

export const POTION_LIST = Object.values(POTION_DEFINITIONS);
