export type ActionType = 'habitude' | 'mission' | 'framework';

export interface Action {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  isCompleted: boolean;
  // Méta
  mantra?: string;
  // Pour les Hypnoses (archivées ici aussi)
  isHypnosis?: boolean;
  media_duration?: string;
  
  // Technical fields for reactivation
  originalActionId?: string; // The 'a1', 'a2' id from the original plan JSON
  frameworkType?: string; // For frameworks
  targetReps?: number; // For habits/frameworks
}

export interface Strategy {
  identity: string;
  bigWhy: string;
  goldenRules: string;
}

export interface CompletedTransformation {
  id: string;
  title: string;
  theme: string;
  completedDate: string;
  strategy: Strategy;
  contextProblem?: string; // Résumé du problème initial
  actions: Action[];
  status: 'completed' | 'archived' | 'active';
}
