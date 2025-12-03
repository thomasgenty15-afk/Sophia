export type ActionType = 'habitude' | 'mission' | 'framework';

export interface Action {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  isCompleted: boolean;
  // Pour les Habitudes (Groupe A)
  targetReps?: number;
  currentReps?: number;
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
  title: string;
  unit: string;
  startValue: number;
  targetValue: number;
}

export interface GeneratedPlan {
  strategy: string;
  phases: PlanPhase[];
  identity?: string;
  deepWhy?: string;
  goldenRules?: string;
  vitalSignal?: VitalSignal;
}

