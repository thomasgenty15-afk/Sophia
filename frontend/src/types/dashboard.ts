export type ActionType = 'habitude' | 'mission' | 'framework';

export interface Action {
  id: string;
  dbId?: string; // ID en base de données (pour user_actions)
  type: ActionType;
  title: string;
  description: string;
  isCompleted: boolean;
  status?: 'pending' | 'active' | 'completed' | 'cancelled' | 'abandoned'; // NOUVEAU : Gestion fine du verrouillage
  // Pour les Habitudes (Groupe A)
  targetReps?: number;
  currentReps?: number;
  lastPerformedAt?: string | null;
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night' | 'any_time';
  scheduledDays?: string[] | null; // ex: ["mon","wed","fri"] (optionnel)
  // Pour les One-Shot (Groupe B)
  frameworkId?: string; // Si c'est un outil à ouvrir
  // Méta
  tips?: string; // Infos pour réussir
  rationale?: string; // NOUVEAU : Explication de pourquoi ça aide
  questType?: 'main' | 'side'; // Quête Principale ou Secondaire
  
  // Fields used in RitualCard (potentially dynamic/merged fields)
  subType?: string;
  price?: string;
  free_trial_days?: number;
  current_trial_day?: number;
}

export interface PlanPhase {
  id: number;
  title: string;
  subtitle: string;
  status: 'completed' | 'active' | 'locked';
  actions: Action[];
}

export interface VitalSignal {
  id?: string; // ID de la base de données
  title: string;
  unit: string;
  startValue: string | number; // Peut être texte ou nombre
  targetValue: string | number;
  currentValue?: string | number; // La valeur actuelle en base
  last_checked_at?: string; // Date de la dernière mise à jour
  type?: 'time' | 'duration' | 'number' | 'range' | 'text'; // Type explicite
}

export interface GeneratedPlan {
  grimoireTitle?: string;
  strategy: string;
  phases: PlanPhase[];
  identity?: string;
  deepWhy?: string;
  goldenRules?: string;
  vitalSignal?: VitalSignal;
}
