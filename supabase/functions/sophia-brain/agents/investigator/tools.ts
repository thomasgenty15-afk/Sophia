export const LOG_ACTION_TOOL = {
  name: "log_action_execution",
  description: "Enregistre le résultat d'une action, d'un framework ou d'un signe vital pour la journée.",
  parameters: {
    type: "OBJECT",
    properties: {
      item_id: { type: "STRING", description: "L'ID de l'action ou du signe vital." },
      item_type: { type: "STRING", enum: ["action", "vital", "framework"], description: "Type d'élément." },
      status: { type: "STRING", enum: ["completed", "missed", "partial"], description: "Résultat." },
      value: { type: "NUMBER", description: "Valeur numérique (pour les counters ou signes vitaux)." },
      note: { type: "STRING", description: "Raison de l'échec ou commentaire (ex: 'Trop fatigué', 'Super séance')." },
      share_insight: { type: "BOOLEAN", description: "True si l'utilisateur a partagé une info intéressante pour le coaching." },
    },
    required: ["item_id", "item_type", "status"],
  },
}

export const ACTIVATE_ACTION_TOOL = {
  name: "activate_plan_action",
  description:
    "Active une action spécifique du plan qui était en attente (future). Vérifie d'abord si les phases précédentes sont complétées.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à activer." },
    },
    required: ["action_title_or_id"],
  },
}

export const ARCHIVE_ACTION_TOOL = {
  name: "archive_plan_action",
  description:
    "Archive (désactive/supprime) une action du plan. À utiliser si l'utilisateur dit 'j'arrête le sport', 'supprime cette tâche', 'je ne veux plus faire ça'.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à archiver." },
      reason: { type: "STRING", description: "Raison de l'arrêt (ex: 'trop difficile', 'plus pertinent', 'n'aime pas'). Utile pour l'analyse future." },
    },
    required: ["action_title_or_id"],
  },
}

export const BREAK_DOWN_ACTION_TOOL = {
  name: "break_down_action",
  description:
    "Génère une micro-étape (action intermédiaire) pour débloquer UNE action qui est ratée depuis plusieurs jours. À appeler uniquement si l'utilisateur accepte explicitement ('oui', 'ok', etc.).",
  parameters: {
    type: "OBJECT",
    properties: {
      problem: {
        type: "STRING",
        description: "Pourquoi ça bloque / ce que l'utilisateur dit (ex: 'pas le temps le soir', 'trop fatigué', 'j'oublie').",
      },
      apply_to_plan: {
        type: "BOOLEAN",
        description:
          "Si true, ajoute la micro-étape dans le plan actif (user_plans.content) et crée aussi la ligne user_actions correspondante.",
        default: true,
      },
    },
    required: ["problem"],
  },
}

/**
 * DEFER DEEP EXPLORATION TOOL
 * 
 * Called when the Investigator detects a motivational/deep blocker during bilan
 * and the user consents to explore it AFTER the bilan.
 * 
 * This is different from break_down_action:
 * - break_down_action = practical problem (how to do it)
 * - defer_deep_exploration = motivational problem (why I don't want to do it)
 */
export const DEFER_DEEP_EXPLORATION_TOOL = {
  name: "defer_deep_exploration",
  description:
    "Propose une exploration profonde des raisons de blocage APRÈS le bilan. À utiliser quand le blocage semble motivationnel (pas envie, peur, manque de sens) plutôt que pratique. L'utilisateur doit avoir dit 'oui' à la proposition d'explorer.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_id: {
        type: "STRING",
        description: "L'ID de l'action concernée par le blocage.",
      },
      action_title: {
        type: "STRING",
        description: "Le titre de l'action concernée.",
      },
      detected_pattern: {
        type: "STRING",
        enum: ["fear", "meaning", "energy", "ambivalence", "identity", "unknown"],
        description: "Pattern détecté: fear (peur), meaning (manque de sens), energy (flemme/fatigue), ambivalence (veut et veut pas), identity (pas mon truc), unknown (pas clair).",
      },
      user_words: {
        type: "STRING",
        description: "Ce que l'utilisateur a dit (verbatim court, max 150 caractères).",
      },
      consent_obtained: {
        type: "BOOLEAN",
        description: "True si l'utilisateur a dit oui à 'Tu veux qu'on explore ça après le bilan ?'.",
      },
    },
    required: ["action_id", "action_title", "detected_pattern", "user_words", "consent_obtained"],
  },
}

export const INVESTIGATOR_TOOLS = [
  LOG_ACTION_TOOL,
  BREAK_DOWN_ACTION_TOOL,
  DEFER_DEEP_EXPLORATION_TOOL,
  ACTIVATE_ACTION_TOOL,
  ARCHIVE_ACTION_TOOL,
]




