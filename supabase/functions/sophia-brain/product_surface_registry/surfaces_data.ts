// Generated from surfaces.json so Edge Function bundling includes the registry.
export const PRODUCT_SURFACE_DEFINITIONS = [
  {
    "id": "potion.state",
    "family": "state",
    "label": "Potion d'etat",
    "goal":
      "Aider le user a reguler un etat interne avant de reprendre l'action.",
    "when_relevant":
      "Honte, panique, culpabilite, fatigue emotionnelle ou activation forte.",
    "anti_noise":
      "Ne pas pousser comme productivite deguisee ou pendant une crise safety active.",
    "contraindications": [
      "safety_active",
      "user_asked_explanation_only",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": null,
    "default_level_cap": 2,
    "content_source": "state_potions",
    "aliases": [
      "potion",
      "potion d'etat",
      "regulation",
    ],
    "trigger_keywords": [
      "honte",
      "panique",
      "angoisse",
      "culpabilite",
      "calmer",
    ],
  },
  {
    "id": "attack_card",
    "family": "execution",
    "label": "Carte d'attaque",
    "goal":
      "Transformer un blocage d'execution clair en version minimale actionnable.",
    "when_relevant":
      "Action identifiee, evitement ou friction de demarrage avec energie suffisante.",
    "anti_noise":
      "Ne pas pousser si l'emotion haute domine ou si la cible est floue. Ne jamais dire qu'une carte d'attaque generee peut etre modifiee directement; proposer une nouvelle version apres confirmation si le contenu ne convient plus.",
    "contraindications": [
      "safety_active",
      "high_emotion",
      "target_missing",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": "prepare_attack_card",
    "default_level_cap": 3,
    "content_source": "attack_cards",
    "aliases": [
      "carte d'attaque",
      "attaque",
      "minimum action",
    ],
    "trigger_keywords": [
      "bloque",
      "evite",
      "procrastine",
      "demarrer",
      "action",
    ],
  },
  {
    "id": "defense_card",
    "family": "execution",
    "label": "Carte de defense",
    "goal":
      "Preparer une reponse a un risque recurrent, une tentation ou une rechute probable.",
    "when_relevant":
      "Risque recurrent, contexte declencheur identifiable, besoin de prevention.",
    "anti_noise":
      "Ne pas utiliser pour une simple action ponctuelle sans risque recurrent. Une carte de defense peut etre ajustee depuis la plateforme/Ressources quand l'option est disponible, mais pas modifiee directement depuis le chat; proposer une nouvelle version apres confirmation si le contenu ne convient plus.",
    "contraindications": [
      "safety_active",
      "target_missing",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": "prepare_defense_card",
    "default_level_cap": 3,
    "content_source": "defense_cards",
    "aliases": [
      "carte de defense",
      "defense",
      "prevention",
    ],
    "trigger_keywords": [
      "rechute",
      "tentation",
      "risque",
      "declencheur",
      "eviter",
    ],
  },
  {
    "id": "plan_item.reduce",
    "family": "execution",
    "label": "Réduire une action",
    "goal": "Rendre une action du plan plus petite quand elle est trop lourde.",
    "when_relevant":
      "Action claire mais trop grande, fatigue, accumulation d'echecs.",
    "anti_noise": "Ne pas modifier le plan sans consentement explicite.",
    "contraindications": [
      "safety_active",
      "target_missing",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": "adjust_plan_item",
    "default_level_cap": 3,
    "content_source": "plan_items",
    "aliases": [
      "reduire",
      "version plus petite",
      "alleger",
    ],
    "trigger_keywords": [
      "trop lourd",
      "reduire",
      "alleger",
      "plus petit",
      "minimum",
    ],
  },
  {
    "id": "plan_item.clarify",
    "family": "execution",
    "label": "Clarifier une action",
    "goal": "Transformer une action trop floue en prochaine action concrete.",
    "when_relevant":
      "Plan ou action ambigu, user ne sait pas quoi faire exactement.",
    "anti_noise":
      "Ne pas remplacer un diagnostic humain quand l'auto-attaque domine.",
    "contraindications": [
      "safety_active",
      "high_emotion",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": "adjust_plan_item",
    "default_level_cap": 2,
    "content_source": "plan_items",
    "aliases": [
      "clarifier",
      "rendre concret",
      "prochaine action",
    ],
    "trigger_keywords": [
      "flou",
      "pas clair",
      "quoi faire",
      "clarifier",
      "concret",
    ],
  },
  {
    "id": "dashboard.reminders",
    "family": "utility",
    "label": "Rappels",
    "goal":
      "Aider le user a configurer rappels, relances et messages planifies.",
    "when_relevant": "Besoin recurrent de rappel ou question sur les rappels.",
    "anti_noise":
      "Ne pas pousser si le user demande un rappel ponctuel direct deja resolu.",
    "contraindications": [
      "safety_active",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": "create_recurring_reminder",
    "default_level_cap": 3,
    "content_source": "reminders",
    "aliases": [
      "rappels",
      "reminders",
      "rendez-vous",
    ],
    "trigger_keywords": [
      "rappel",
      "tous les jours",
      "chaque",
      "relance",
      "notification",
    ],
  },
  {
    "id": "dashboard.preferences",
    "family": "utility",
    "label": "Preferences coach",
    "goal":
      "Adapter le ton, la directivite et la longueur des reponses Sophia.",
    "when_relevant": "Friction explicite avec le style de Sophia.",
    "anti_noise":
      "Ne pas deduire une preference durable depuis un seul signal faible.",
    "contraindications": [
      "safety_active",
      "weak_intent",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": "update_coach_preferences",
    "default_level_cap": 3,
    "content_source": "preferences",
    "aliases": [
      "preferences",
      "preferences coach",
      "ton",
    ],
    "trigger_keywords": [
      "plus direct",
      "plus doux",
      "moins de questions",
      "style",
      "ton",
    ],
  },
  {
    "id": "dashboard.personal_actions",
    "family": "utility",
    "label": "Actions personnelles",
    "goal":
      "Aider le user a suivre des habitudes ou actions personnelles hors plan principal.",
    "when_relevant":
      "Routine personnelle, habitude autonome, suivi non lie au plan courant.",
    "anti_noise":
      "Ne pas utiliser pour logger le progres d'une action du plan deja identifiee.",
    "contraindications": [
      "safety_active",
      "plan_item_direct_progress",
    ],
    "requires_consent": true,
    "can_execute_from_chat": false,
    "executor_tool_id": null,
    "default_level_cap": 2,
    "content_source": "personal_actions",
    "aliases": [
      "actions personnelles",
      "habitudes",
      "routine",
    ],
    "trigger_keywords": [
      "habitude",
      "routine",
      "action personnelle",
      "suivre",
      "tenir",
    ],
  },
  {
    "operation_type": "adjust_plan_item",
    "surface_id": "plan",
    "label": "Plan",
    "short_destination_label": "Plan",
    "user_facing_destination": "dans la section Plan",
    "platform_steps": [
      "ouvre la section Plan",
      "sélectionne l’action ou la semaine concernée",
      "reprends la recommandation proposée",
    ],
    "can_execute_from_chat": false,
    "chat_behavior": "platform_handoff",
  },
  {
    "operation_type": "prepare_attack_card",
    "surface_id": "attack_cards",
    "label": "Cartes d’attaque",
    "short_destination_label": "Cartes d’attaque",
    "user_facing_destination": "dans la section Cartes d’attaque",
    "platform_steps": [
      "ouvre la section Cartes",
      "choisis Carte d’attaque",
      "reprends le brouillon proposé",
    ],
    "can_execute_from_chat": false,
    "chat_behavior": "platform_handoff",
  },
  {
    "operation_type": "prepare_defense_card",
    "surface_id": "defense_cards",
    "label": "Cartes de défense",
    "short_destination_label": "Cartes de défense",
    "user_facing_destination":
      "dans Ressources / Défense / Cartes de défense libres",
    "platform_steps": [
      "ouvre Ressources / Défense",
      "dans Cartes de défense libres, choisis Ajouter une carte",
      "reprends les champs préparés par Sophia",
    ],
    "can_execute_from_chat": false,
    "chat_behavior": "platform_handoff",
  },
  {
    "operation_type": "select_state_potion",
    "surface_id": "state_potions",
    "label": "État / Potions",
    "short_destination_label": "État / Potions",
    "user_facing_destination": "dans la section État / Potions",
    "platform_steps": [
      "ouvre la section État / Potions",
      "choisis la potion recommandée",
      "active-la depuis la plateforme si elle te convient",
    ],
    "can_execute_from_chat": false,
    "chat_behavior": "platform_handoff",
  },
  {
    "operation_type": "create_recurring_reminder",
    "surface_id": "recurring_reminders",
    "label": "Initiatives",
    "short_destination_label": "Initiatives",
    "user_facing_destination": "dans la section Initiatives",
    "platform_steps": [
      "ouvre la section Initiatives",
      "crée un rappel récurrent",
      "reprends la cadence, l’heure et le contenu proposés",
    ],
    "can_execute_from_chat": false,
    "chat_behavior": "platform_handoff",
  },
  {
    "operation_type": "update_coach_preferences",
    "surface_id": "coach_preferences",
    "label": "Préférences coach",
    "short_destination_label": "Préférences coach",
    "user_facing_destination": "dans les Préférences coach",
    "platform_steps": [
      "ouvre les Préférences coach",
      "choisis le réglage correspondant",
      "applique-le depuis la plateforme",
    ],
    "can_execute_from_chat": false,
    "chat_behavior": "platform_handoff",
  },
] as const;
