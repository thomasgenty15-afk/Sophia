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

export const INCREASE_WEEK_TARGET_TOOL = {
  name: "increase_week_target",
  description:
    "Augmente de 1 l'objectif hebdomadaire (target_reps) d'une habitude. Max 7×/semaine. À appeler uniquement après confirmation explicite de l'utilisateur.",
  parameters: {
    type: "OBJECT",
    properties: {
      action_id: { type: "STRING", description: "L'ID de l'action habitude dont on augmente la cible." },
      confirmed: { type: "BOOLEAN", description: "True si l'utilisateur a explicitement confirmé vouloir augmenter." },
    },
    required: ["action_id", "confirmed"],
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVESTIGATOR TOOLS
//
// Release 1: bilan is track-only.
// The Investigator keeps only logging and optional weekly-target increase.
// ═══════════════════════════════════════════════════════════════════════════════

export const INVESTIGATOR_TOOLS = [
  LOG_ACTION_TOOL,
  INCREASE_WEEK_TARGET_TOOL,
]




