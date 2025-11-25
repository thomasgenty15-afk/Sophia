import type { Theme } from './types';

export const THEME_MEANING: Theme = {
  id: 'SNS',
  title: 'Sens & Direction',
  shortTitle: 'Sens',
  icon: '🧭',
  axes: [
    {
      id: 'SNS_1',
      title: 'Retrouver du sens & de l’envie de se lever le matin',
      description: 'Mode automatique, perte d’envie, “à quoi bon”.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: []
    },
    {
      id: 'SNS_2',
      title: 'Clarifier sa direction pro / scolaire (ou créative)',
      description: 'Flou sur la voie, multi-pistes, peur de se tromper.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: []
    },
    {
      id: 'SNS_3',
      title: 'Traverser une rupture, un deuil ou une grosse transition',
      description: 'Rupture, deuil, licenciement, déménagement, changement massif.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: []
    },
    {
      id: 'SNS_4',
      title: 'Mieux me connaître & rester aligné sur la durée',
      description: 'Ne pas trop savoir ce qui est vraiment important pour soi.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: []
    }
  ]
};

