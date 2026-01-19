import type { GeneratedPlan } from '../types/dashboard';

// --- MOCK DATA : PROFIL "CHAOS / À LA RAMASSE" ---
export const MOCK_CHAOS_PLAN: GeneratedPlan = {
  strategy: "On arrête l'hémorragie. On ne cherche pas à être productif, on cherche à survivre et à remettre les bases physiologiques (Sommeil + Dopamine) avant de reconstruire.",
  phases: [
    {
      id: 1,
      title: "Phase 1 : Urgence & Physiologie",
      subtitle: "Semaines 1-2 • Sortir de la zone rouge",
      status: 'completed',
      actions: [
        {
          id: 'a1',
          type: 'mission',
          title: "Purger la Dopamine Facile",
          description: "Supprimer TikTok/Insta, jeter la malbouffe des placards.",
          isCompleted: true,
          tips: "Ne réfléchis pas. Prends un sac poubelle. Fais-le maintenant.",
          questType: 'main'
        },
        {
          id: 'a2',
          type: 'habitude',
          title: "Le Couvre-Feu Digital (22h)",
          description: "Aucun écran après 22h00. Lecture ou Audio uniquement.",
          isCompleted: true,
          targetReps: 14,
          currentReps: 14,
          tips: "Mets ton téléphone dans une autre pièce (cuisine/salon) à 21h55.",
          questType: 'side'
        }
      ]
    },
    {
      id: 2,
      title: "Phase 2 : Clarté Mentale",
      subtitle: "Semaines 3-4 • Calmer le bruit",
      status: 'active',
      actions: [
        {
          id: 'a3',
          type: 'framework',
          title: "Le Vide-Cerveau (GTD)",
          description: "Noter absolument tout ce qui traîne dans ta tête.",
          isCompleted: false,
          frameworkId: 'gtd_simple',
          tips: "Utilise le modèle fourni. Ne trie pas, vide juste.",
          questType: 'main'
        },
        {
          id: 'a4',
          type: 'habitude',
          title: "Marche Matinale (Lumière)",
          description: "10 min dehors sans téléphone dès le réveil.",
          isCompleted: false,
          targetReps: 14,
          currentReps: 3,
          tips: "C'est pour ton cortisol. La lumière directe est non-négociable.",
          questType: 'side'
        }
      ]
    },
    {
      id: 3,
      title: "Phase 3 : Reconstruction",
      subtitle: "Semaines 5-6 • Reprendre le pouvoir",
      status: 'locked',
      actions: [
        {
          id: 'a5',
          type: 'habitude',
          title: "Défi Hypnose : Réparation",
          description: "Écoute du programme 'Reconstruction Profonde' chaque soir.",
          isCompleted: false,
          targetReps: 7,
          currentReps: 0,
          tips: "Laisse l'inconscient bosser en t'endormant.",
          questType: 'main'
        },
        {
          id: 'a6',
          type: 'mission',
          title: "Sanctuariser le Deep Work",
          description: "Bloquer 2h/jour dans l'agenda où personne ne dérange.",
          isCompleted: false,
          tips: "Préviens ton entourage : 'Je suis en mode avion'.",
          questType: 'side'
        }
      ]
    },
    {
      id: 4,
      title: "Phase 4 : Optimisation",
      subtitle: "Semaines 7-8 • Affiner le système",
      status: 'locked',
      actions: [
        {
          id: 'a7',
          type: 'framework',
          title: "Audit des Fuites d'Énergie",
          description: "Analyser ce qui te vide (gens, tâches, pensées).",
          isCompleted: false,
          frameworkId: 'energy_audit',
          tips: "Sois impitoyable.",
          questType: 'main'
        },
        {
          id: 'a8',
          type: 'habitude',
          title: "Priorité Unique (The One Thing)",
          description: "Définir LA priorité du lendemain avant de dormir.",
          isCompleted: false,
          targetReps: 14,
          currentReps: 0,
          tips: "Juste un post-it.",
          questType: 'side'
        }
      ]
    },
    {
      id: 5,
      title: "Phase 5 : Identité Nouvelle",
      subtitle: "Semaines 9-10 • Incarner le changement",
      status: 'locked',
      actions: [
        {
          id: 'a9',
          type: 'mission',
          title: "Lettre au Futur Moi",
          description: "Écrire à ton futur toi dans 1 an.",
          isCompleted: false,
          tips: "Fais des promesses que tu peux tenir.",
          questType: 'main'
        },
        {
          id: 'a10',
          type: 'habitude',
          title: "Visualisation Identitaire",
          description: "5 minutes par jour à ressentir la version finale.",
          isCompleted: false,
          targetReps: 14,
          currentReps: 0,
          tips: "Préparation neurologique.",
          questType: 'side'
        }
      ]
    }
  ]
};

// --- MOCK DATA (ARCHITECTE - 12 SEMAINES DÉVERROUILLÉES) ---
export const ARCHITECT_WEEKS = [
  // PHASE 1
  { id: 1, title: "Audit des Croyances", subtitle: "Déconstruction", status: "completed" },
  { id: 2, title: "Le Prix à Payer", subtitle: "Déconstruction", status: "completed" },
  { id: 3, title: "Système Nerveux & État", subtitle: "Fondations Intérieures", status: "completed" },
  { id: 4, title: "Incarnation & Parole", subtitle: "Fondations Intérieures", status: "active" },
  { id: 5, title: "La Boussole (Mission)", subtitle: "Fondations Intérieures", status: "locked" },
  { id: 6, title: "Environnement & Tribu", subtitle: "Projection Extérieure", status: "locked" },
  // PHASE 2
  { id: 7, title: "Le Moteur (Productivité)", subtitle: "Expansion", status: "locked" },
  { id: 8, title: "L'Ombre (Dark Side)", subtitle: "Intégration", status: "locked" },
  { id: 9, title: "L'Art de la Guerre", subtitle: "Affirmation", status: "locked" },
  { id: 10, title: "L'Argent & La Valeur", subtitle: "Abondance", status: "locked" },
  { id: 11, title: "Le Cercle (Leadership)", subtitle: "Influence", status: "locked" },
  { id: 12, title: "Le Grand Saut", subtitle: "Final", status: "locked" },
];

