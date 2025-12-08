export type ModuleType = 'week' | 'forge' | 'round_table';

export interface ModuleDefinition {
  id: string;
  title: string;
  type: ModuleType;
  
  // Règles de transition
  nextModuleIds?: string[]; 
  unlockDelayDays?: number; 
  unlockCondition?: 'next_sunday' | 'immediate' | 'fixed_delay';
}

export const MODULES_REGISTRY: Record<string, ModuleDefinition> = {
  // --- PARCOURS SEMAINE (Construction du Temple) ---
  'week_1': {
    id: 'week_1',
    title: 'Semaine 1 : Audit des Croyances',
    type: 'week',
    nextModuleIds: ['week_2'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_2': {
    id: 'week_2',
    title: 'Semaine 2 : Le Prix à Payer',
    type: 'week',
    nextModuleIds: ['week_3'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_3': {
    id: 'week_3',
    title: 'Semaine 3 : Système Nerveux & État',
    type: 'week',
    nextModuleIds: ['week_4'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_4': {
    id: 'week_4',
    title: 'Semaine 4 : Incarnation & Parole',
    type: 'week',
    nextModuleIds: ['week_5'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_5': {
    id: 'week_5',
    title: 'Semaine 5 : La Boussole (Mission)',
    type: 'week',
    nextModuleIds: ['week_6'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_6': {
    id: 'week_6',
    title: 'Semaine 6 : Environnement & Tribu',
    type: 'week',
    nextModuleIds: ['week_7'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_7': {
    id: 'week_7',
    title: 'Semaine 7 : Œuvre & Contribution',
    type: 'week',
    nextModuleIds: ['week_8'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_8': {
    id: 'week_8',
    title: 'Semaine 8 : Expérience de Vie (Aventure)',
    type: 'week',
    nextModuleIds: ['week_9'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_9': {
    id: 'week_9',
    title: 'Semaine 9 : Métriques de Vérité',
    type: 'week',
    nextModuleIds: ['week_10'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_10': {
    id: 'week_10',
    title: 'Semaine 10 : Écologie du Chemin',
    type: 'week',
    nextModuleIds: ['week_11'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  'week_11': {
    id: 'week_11',
    title: 'Semaine 11 : Leadership & Rayonnement',
    type: 'week',
    nextModuleIds: ['week_12'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7
  },
  
  // LA DERNIÈRE SEMAINE DU TEMPLE
  'week_12': {
    id: 'week_12',
    title: 'Semaine 12 : L\'Envol',
    type: 'week',
    
    // C'est ici que le chemin se sépare !
    nextModuleIds: [
        'round_table_1', // La Table Ronde démarre
        'forge_level_2'  // La Forge démarre
    ], 
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 7 // 7 jours après la semaine 12 (Comme le reste)
  },

  // --- PARCOURS TABLE RONDE ---
  'round_table_1': {
    id: 'round_table_1',
    title: 'Table Ronde #1',
    type: 'round_table',
    nextModuleIds: ['round_table_2'],
    unlockCondition: 'next_sunday'
  },
  'round_table_2': {
    id: 'round_table_2',
    title: 'Table Ronde #2',
    type: 'round_table',
    nextModuleIds: ['round_table_3'],
    unlockCondition: 'next_sunday'
  },

  // --- PARCOURS FORGE ---
  'forge_level_2': {
    id: 'forge_level_2',
    title: 'Forge Niveau 2',
    type: 'forge',
    nextModuleIds: ['forge_level_3'],
    unlockCondition: 'fixed_delay',
    unlockDelayDays: 5
  }
};

// Helper
export const getModuleConfig = (moduleId: string): ModuleDefinition | undefined => {
  return MODULES_REGISTRY[moduleId];
};
