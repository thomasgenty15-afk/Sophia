# Spécifications UX — Dashboard V3

## Vision Générale
Le Dashboard V3 abandonne la structure plate par dimensions (Habits, Missions, Support) pour adopter une **progression verticale par phases**. L'objectif est de réduire la charge cognitive et de focaliser l'attention de l'utilisateur sur l'action immédiate (le *Heartbeat* de la phase en cours).

**Contraintes globales :**
- **Mobile-first** (largeur min 375px)
- **Design System** : Tailwind CSS, cartes très arrondies (`rounded-[28px]` à `rounded-[32px]`), palette `stone` / `slate` pour un rendu organique et apaisant, ombres douces (`shadow-sm`, `shadow-md`).
- **Hiérarchie** : Le Heartbeat est le héros. Les items (habitudes, missions) sont secondaires et au service du Heartbeat.

---

## Layout et Hiérarchie Visuelle

Le dashboard est composé d'un header hero + 5 sections empilées verticalement :

### StrategyHeader (Hero Section)
- **Rôle** : Rappeler le "Pourquoi" profond et le cadre global.
- **Contenu** :
  - Titre de la transformation
  - Résumé de l'intention et Mantra
  - `success_definition` et `main_constraint` (absorbés de l'ancienne North Star)
  - Si `journey_context.is_multi_part === true` : badge "Partie [N] sur [total] — ~[X] mois" + barre de progression segmentée du parcours global. Texte au premier affichage : "Ce parcours est divisé en [total] étapes pour maximiser tes chances de réussite". Si `is_multi_part` est false ou absent : ne rien afficher.
- **UI** : Carte premium en haut de page, typographie élégante, fond subtilement texturé ou dégradé doux.

### 1. Plan de transformation (PhaseProgression) — Section Principale
- **Rôle** : Le cœur fonctionnel du dashboard. Progression verticale par phases + Heartbeat.
- **UI Globale** : Liste verticale de blocs "Phase". Une ligne de progression visuelle (bordure gauche ou ligne centrale) connecte les phases.
- **Focus** : La transformation (phases + Heartbeat), pas les items individuels.

### 2. Carte de défense (DefenseCard)
- **Rôle** : Cartographier les pulsions dominantes et fournir un système de défense structuré en 4 rôles.
- **Contenu** :
  - **Titre** : "Ta carte de défense" + icône bouclier
  - Si plusieurs pulsions (1 à 3) : tabs ou accordéon pour chaque pulsion
  - Pour chaque pulsion :
    - Nom de la pulsion en titre
    - Grille visuelle des 4 rôles :
      - **Le Stratège** 🗺️ : liste des situations à risque (icônes contextuelles, palette bleu)
      - **Le Surveillant** 👁️ : signaux d'alerte internes — pensées, sensations, émotions (palette ambre/orange)
      - **Le Défenseur** 🛡️ : cartes de réaction concrètes < 30 secondes (palette vert/action)
      - **Le Comptable** 📊 : mini courbe (spark line) des victoires par semaine + compteur total ("42 victoires depuis le début")
    - Bouton **"+1 victoire"** (quick-log) bien visible pour chaque pulsion
  - **Bouton "Imprimer ma carte"** en bas de section
- **UI** :
  - Palette `stone` + accents défense : ambre/orange pour les alertes, vert pour les réponses, bleu pour le stratège
  - Cards avec `rounded-[28-32px]`, ombres douces
  - Collapsible sur mobile (ouvert par défaut)
- **Messages contextuels du Comptable** (basés sur la tendance de la courbe) :
  - Début (courbe haute) : "Tu es en pleine bataille — chaque victoire compte"
  - Plateau : "Tu tiens bon, la constance paie"
  - Descente : "Tes pulsions diminuent — ta transformation est en marche"
- **Micro-copy** état initial (0 victoire) : "Note ta première victoire ici — même la plus petite compte."

### 3. Atelier d'inspirations (AtelierInspirations)
- **Rôle** : Nourrir la motivation à long terme.
- **Contenu** :
  - **Ton Histoire** : Narration *forward-looking* générée par l'IA (3-5 phrases, ton narratif et empathique, vision du futur basée sur le free text + l'historique de tentatives).
  - **5 Principes Japonais** : Cartes qui se débloquent progressivement selon des événements spécifiques :
    - **Kaizen** (改善) : toujours visible (jour 1) — "Un pas à la fois. Pas de révolution, juste 1% par jour."
    - **Ikigai** (生き甲斐) : se débloque quand le "pourquoi" émerge en conversation — "Ta raison profonde. Ce qui te pousse quand la motivation s'éteint."
    - **Hara Hachi Bu** (腹八分目) : se débloque quand une habitude atteint la maintenance — "La modération. Pas tout, pas rien — juste assez."
    - **Wabi-sabi** (侘寂) : se débloque après le premier trébuchement (skip/blocker) — "La beauté de l'imperfection. Tu as trébuché, pas échoué."
    - **Gambaru** (頑張る) : se débloque après un plateau ou un moment de stall — "Persévérer malgré tout. Le chemin continue."
- **UI** : Carrousel horizontal (scroll snap) ou grille compacte. Les principes verrouillés sont grisés avec une icône de cadenas discret + "?" à la place du titre. Animation subtile au déblocage (fade-in + scale). Section collapsible par défaut sur mobile (titre "Atelier d'inspirations" + chevron).

### 4. Section Rendez-vous (Restaurée de la V1)
- **Rôle** : Gérer les rappels et interactions proactives de Sophia (WhatsApp).
- **Contenu** : Liste des rendez-vous configurés (ex: "Envoie-moi une citation à 8h"). Bouton "Ajouter".
- **UI** : Reprise du composant `RemindersSection` existant. Cartes compactes avec l'heure, les jours, et un toggle d'activation.

### 5. Section Préférences (Restaurée de la V1)
- **Rôle** : Paramétrer le comportement du coach.
- **Contenu** : Ton global, niveau de challenge, bavardage, longueur des messages.
- **UI** : Reprise du composant `PreferencesSection` existant. Accordéons avec icônes (Mic, Crown, etc.) et choix sous forme de boutons radio stylisés.

---

## États de la Progression par Phases

La section PhaseProgression gère 3 états distincts pour les phases :

### A. Phase Active (En cours)
- **Visuel** : Carte déployée, mise en avant (ombre plus forte, bordure colorée ex: `ring-2 ring-violet-500`).
- **Contenu** :
  - **En-tête** : Numéro de phase et titre.
  - **Heartbeat (Hero)** : Grande jauge de progression ou compteur (ex: "Jours sans fumer : 3/10"). Bouton d'action principal bien visible pour logger un check-in.
  - **Items** : Liste des habitudes, missions et soutiens associés. Affichés sous forme de liste compacte ou accordéon. Séparateur visuel par dimension possible (mais pas de headers lourds).
  - **Rationale** : 1 phrase italic en dessous du titre expliquant pourquoi cette phase.
- **Micro-copy** : "Objectif actuel", "Log ton action du jour".

### B. Phase Complétée
- **Visuel** : Carte compactée, fond teinté de vert/succès (`bg-emerald-50`).
- **Contenu** :
  - Titre de la phase accompagné d'un gros check vert (`CheckCircle`).
  - Résumé des accomplissements ("Objectif atteint : 10/10").
  - Les items sont masqués (dépliables au clic).
- **Micro-copy** : "Phase terminée le [Date]", "Bien joué !".

### C. Phase Future (Verrouillée)
- **Visuel** : Carte très compacte, opacité réduite (`opacity-60`), fond neutre (`bg-stone-50`).
- **Contenu** :
  - Numéro de phase et titre de l'objectif.
  - Icône de cadenas (`Lock`).
  - Pas de détails visibles pour créer de la curiosité sans frustrer.
- **Micro-copy** : "Se débloque après la phase précédente".

---

## Interactions et Animations

- **Déplier/Replier** : Clic sur une phase complétée pour revoir ses items (animation `slide-down` douce).
- **Logger un check-in (Heartbeat)** :
  - Clic sur le bouton d'action du Heartbeat.
  - **Animation** : Confetti discret ou micro-interaction de succès (scale bump sur le bouton, remplissage fluide de la jauge de progression).
- **Transition de Phase** :
  - Quand le seuil du Heartbeat est atteint, la phase active se compacte automatiquement (devient verte).
  - La ligne de progression s'anime vers le bas.
  - Le cadenas de la phase suivante se brise (animation de déverrouillage) et la carte s'étend (`height: auto`).
- **Quick-log victoire (Carte de défense)** :
  - Clic sur "+1 victoire" → choix rapide de la situation (ou "autre") → confirmation.
  - **Animation** : Célébration subtile (confetti ou pulse vert), mise à jour de la spark line.
- **Déblocage de Principe (Atelier)** :
  - Lorsqu'un principe japonais est débloqué, une notification toast apparaît.
  - Dans la section Atelier, la carte passe de l'état grisé à coloré avec un effet de brillance (`shimmer`).

---

## Edge Cases

1. **1 seule phase dans le plan** :
   - La ligne de progression verticale est masquée.
   - La phase est affichée comme une carte d'objectif unique.
2. **Toutes les phases complétées** :
   - Affichage d'un état de célébration final ("Transformation achevée !").
   - Bouton d'appel à l'action pour démarrer le "Roadmap Review" et passer à la transformation suivante.
3. **Pas de plan généré (erreur ou attente)** :
   - Skeleton loaders reproduisant la forme des phases.
   - Message de réassurance : "Sophia finalise ton plan d'action...".
4. **Parcours multi-part** (`journey_context.is_multi_part === true`) :
   - Badge visible dans le StrategyHeader : "Partie [N] sur [total]".
   - Barre de progression segmentée du parcours global.
   - Quand toutes les phases de la partie courante sont terminées : message "Étape [N] terminée ! Prêt pour la suite ?" + bouton Roadmap Review.
5. **Carte de défense pas encore générée** (appel LLM différé) :
   - Placeholder avec skeleton loader reproduisant la forme de la carte.
   - Message : "Sophia prépare ta carte de défense...".
6. **0 victoire dans la carte de défense** (état initial du Comptable) :
   - Pas de spark line affichée.
   - Message d'encouragement : "Note ta première victoire ici — même la plus petite compte."
7. **Inspiration narrative absente** (pas encore générée) :
   - Placeholder discret dans l'Atelier.
   - Message : "Ton histoire se construit au fil de tes échanges avec Sophia."
