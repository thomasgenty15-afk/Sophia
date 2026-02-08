type ToolDef = { name: string; description: string; parameters: any }

const CREATE_ACTION_TOOL: ToolDef = {
  name: "create_simple_action",
  description:
    "Crée une action simple (Habitude ou Mission). À utiliser pour tout ce qui est tâche concrète (ex: 'Courir', 'Acheter X', 'Méditer').",
  parameters: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "Titre court et impactant." },
      description: { type: "STRING", description: "Description précise." },
      type: { type: "STRING", enum: ["habit", "mission"], description: "'habit' = récurrent, 'mission' = une fois." },
      targetReps: {
        type: "INTEGER",
        description:
          "Si habit, nombre de fois par SEMAINE (ex: 3). Si mission, mettre 1. Intervalle recommandé: 1 à 6 (max 6). IMPORTANT: si tu veux '4 grands verres d'eau', mets-le dans le titre/description (c'est une validation par jour), pas via targetReps>6.",
      },
      tips: { type: "STRING", description: "Un petit conseil court pour réussir." },
      time_of_day: {
        type: "STRING",
        enum: ["morning", "afternoon", "evening", "night", "any_time"],
        description: "Moment idéal pour faire l'action.",
      },
    },
    required: ["title", "description", "type", "time_of_day"],
  },
}

const CREATE_FRAMEWORK_TOOL: ToolDef = {
  name: "create_framework",
  description:
    "Crée un EXERCICE D'ÉCRITURE ou de RÉFLEXION (Journaling, Bilan, Worksheet). L'utilisateur devra écrire dans l'app.",
  parameters: {
    type: "OBJECT",
    properties: {
      title: { type: "STRING", description: "Titre de l'exercice." },
      description: { type: "STRING", description: "À quoi ça sert ?" },
      targetReps: { type: "INTEGER", description: "Combien de fois à faire (ex: 7 pour une semaine, 1 pour one-shot)." },
      time_of_day: {
        type: "STRING",
        enum: ["morning", "afternoon", "evening", "night", "any_time"],
        description: "Moment idéal pour faire l'exercice.",
      },
      frameworkDetails: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["one_shot", "recurring"], description: "Juste une fois ou à répéter ?" },
          intro: { type: "STRING", description: "Texte inspirant qui s'affiche avant l'exercice." },
          sections: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "STRING", description: "Identifiant unique (s1, s2...)" },
                label: { type: "STRING", description: "La question posée à l'utilisateur." },
                inputType: { type: "STRING", enum: ["text", "textarea", "scale"], description: "Type de champ." },
                placeholder: { type: "STRING", description: "Exemple de réponse." },
              },
              required: ["id", "label", "inputType"],
            },
          },
        },
        required: ["type", "intro", "sections"],
      },
    },
    required: ["title", "description", "frameworkDetails", "time_of_day"],
  },
}

const TRACK_PROGRESS_TOOL: ToolDef = {
  name: "track_progress",
  description:
    "Enregistre une progression ou un raté (Action faite, Pas faite, ou Signe Vital mesuré). À utiliser quand l'utilisateur dit 'J'ai fait mon sport' ou 'J'ai raté mon sport'.",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom approximatif de l'action ou du signe vital." },
      value: { type: "NUMBER", description: "Valeur à ajouter (ex: 1 pour 'J'ai fait', 0 pour 'Raté')." },
      operation: { type: "STRING", enum: ["add", "set"], description: "'add' = ajouter au total existant, 'set' = définir la valeur absolue." },
      status: { type: "STRING", enum: ["completed", "missed", "partial"], description: "Statut de l'action : 'completed' (fait), 'missed' (pas fait/raté), 'partial' (à moitié)." },
      date: { type: "STRING", description: "Date concernée (YYYY-MM-DD). Laisser vide pour aujourd'hui." },
    },
    required: ["target_name", "value", "operation"],
  },
}

const BREAK_DOWN_ACTION_TOOL: ToolDef = {
  name: "break_down_action",
  description:
    "Génère une micro-étape (action intermédiaire) pour débloquer UNE action. À appeler uniquement si l'utilisateur accepte explicitement ('oui', 'ok', etc.).",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: {
        type: "STRING",
        description: "Titre ou ID de l'action à débloquer (requis si plusieurs actions existent).",
      },
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

const UPDATE_ACTION_TOOL: ToolDef = {
  name: "update_action_structure",
  description: "Modifie la structure d'une action existante (Titre, Description, Fréquence). À utiliser si l'utilisateur dit 'Change le nom en X', 'Mets la fréquence à 3'.",
  parameters: {
    type: "OBJECT",
    properties: {
      target_name: { type: "STRING", description: "Nom actuel de l'action à modifier." },
      new_title: { type: "STRING", description: "Nouveau titre (optionnel)." },
      new_description: { type: "STRING", description: "Nouvelle description (optionnel)." },
      new_target_reps: { type: "INTEGER", description: "Nouveau nombre de répétitions cible (optionnel)." },
      new_scheduled_days: {
        type: "ARRAY",
        items: { type: "STRING", enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
        description: "Optionnel. Jours planifiés pour une habitude (ex: ['mon','wed','fri']). Si absent, on ne change pas. Si [] on désactive la planification.",
      },
    },
    required: ["target_name"],
  },
}

const ACTIVATE_ACTION_TOOL: ToolDef = {
  name: "activate_plan_action",
  description: "Active une action spécifique du plan qui était en attente (future). Vérifie d'abord si les phases précédentes sont complétées.",
  parameters: {
    type: "OBJECT",
    properties: { action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à activer." } },
    required: ["action_title_or_id"],
  },
}

const ARCHIVE_ACTION_TOOL: ToolDef = {
  name: "archive_plan_action",
  description: "Archive (supprime définitivement) une action du plan. À utiliser si l'utilisateur dit 'j'arrête le sport', 'supprime cette tâche', 'je ne veux plus faire ça'.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à archiver." },
      reason: { type: "STRING", description: "Raison de l'arrêt (ex: 'trop difficile', 'plus pertinent', 'n'aime pas'). Utile pour l'analyse future." },
    },
    required: ["action_title_or_id"],
  },
}

const DEACTIVATE_ACTION_TOOL: ToolDef = {
  name: "deactivate_plan_action",
  description: "Désactive (met en pause) une action active du plan. L'action reste dans le plan mais passe en status 'pending'. Réversible. À utiliser si l'utilisateur dit 'mets en pause le sport', 'désactive la méditation', 'j'arrête temporairement'.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title_or_id: { type: "STRING", description: "Titre ou ID de l'action à désactiver." },
    },
    required: ["action_title_or_id"],
  },
}

/**
 * START DEEP EXPLORATION TOOL
 * 
 * Used to launch deep reasons exploration DIRECTLY (entry point 2 - outside bilan).
 * When user expresses a motivational blocker, Architect can propose and launch exploration.
 */
const START_DEEP_EXPLORATION_TOOL: ToolDef = {
  name: "start_deep_exploration",
  description:
    "Lance une exploration profonde des raisons de blocage MOTIVATIONNEL (pas pratique). " +
    "À utiliser HORS BILAN quand l'utilisateur exprime: 'j'arrive vraiment pas', 'j'ai la flemme', " +
    "'je repousse toujours', 'je sais pas pourquoi je fais ça', 'ça me fait peur'. " +
    "L'utilisateur doit avoir dit 'oui' à la proposition d'explorer.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_title: {
        type: "STRING",
        description: "Titre de l'action concernée (optionnel si blocage général).",
      },
      action_id: {
        type: "STRING",
        description: "ID de l'action concernée (optionnel).",
      },
      detected_pattern: {
        type: "STRING",
        enum: ["fear", "meaning", "energy", "ambivalence", "identity", "unknown"],
        description:
          "Pattern détecté: fear (peur/échec/jugement), meaning (manque de sens), " +
          "energy (flemme/fatigue), ambivalence (veut et veut pas), " +
          "identity (pas mon truc), unknown (pas clair).",
      },
      user_words: {
        type: "STRING",
        description: "Ce que l'utilisateur a dit (verbatim court, max 150 caractères).",
      },
      skip_re_consent: {
        type: "BOOLEAN",
        description: "True si le consentement a déjà été obtenu (on saute la phase re_consent).",
        default: true,
      },
    },
    required: ["detected_pattern", "user_words"],
  },
}

export function getArchitectTools(): ToolDef[] {
  const baseTools = [
    CREATE_ACTION_TOOL, 
    CREATE_FRAMEWORK_TOOL, 
    TRACK_PROGRESS_TOOL, 
    BREAK_DOWN_ACTION_TOOL, 
    UPDATE_ACTION_TOOL, 
    ARCHIVE_ACTION_TOOL,
    START_DEEP_EXPLORATION_TOOL,
  ]

  return [...baseTools, ACTIVATE_ACTION_TOOL, DEACTIVATE_ACTION_TOOL]
}


