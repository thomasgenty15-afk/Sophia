export interface Action {
  id: string;
  type: 'habitude' | 'mission' | 'framework';
  title: string;
  description: string;
  targetReps?: number;
  questType: 'main' | 'side';
  isCompleted?: boolean;
  tips?: string;
  rationale?: string;
}

export interface Phase {
  title: string;
  subtitle: string;
  rationale?: string;
  actions: Action[];
  status?: 'locked' | 'active' | 'completed';
}

export interface GeneratedPlan {
  strategy: string;
  sophiaKnowledge: string;
  estimatedDuration: string;
  phases: Phase[];
}
