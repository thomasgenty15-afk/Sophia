export type LoadingSequenceKind = 'plan' | 'plan_next' | 'plan_recraft' | 'plan_follow';

const SEQUENCES: Record<LoadingSequenceKind, string[]> = {
  plan: [
    "Analyse de ton profil...",
    "Lecture de ton contexte et de tes contraintes...",
    "Consultation des protocoles (neurosciences & habitudes)...",
    "Construction de ta stratégie sur-mesure...",
    "Finalisation du plan et des actions..."
  ],
  plan_next: [
    "Analyse de ton nouveau contexte...",
    "Connexion avec ton parcours global...",
    "Choix de la meilleure stratégie pour cet axe...",
    "Génération des actions et des missions...",
    "Finalisation du plan..."
  ],
  plan_recraft: [
    "Analyse de ce qui n’a pas marché...",
    "Intégration de tes nouveaux blocages...",
    "Recalibrage de la stratégie (version tenable)...",
    "Génération d’un plan amélioré...",
    "Finalisation du nouveau plan..."
  ],
  plan_follow: [
    "Analyse de tes réponses...",
    "Consultation des leviers les plus efficaces...",
    "Construction de ta stratégie étape par étape...",
    "Génération des actions et des frameworks...",
    "Finalisation du plan..."
  ]
};

export function startLoadingSequence(
  setMessage: (m: string) => void,
  kind: LoadingSequenceKind = 'plan',
  intervalMs = 2500
) {
  const messages = SEQUENCES[kind] || SEQUENCES.plan;
  let i = 0;
  setMessage(messages[0] ?? "");

  const interval = window.setInterval(() => {
    i++;
    if (i < messages.length) setMessage(messages[i]);
    else window.clearInterval(interval);
  }, intervalMs);

  return () => window.clearInterval(interval);
}


