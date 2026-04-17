# Onboarding V2 — Specs UX

## Statut

Document de reference UX pour le Lot 4. Produit par Gemini (4.0), corrige et enrichi par Claude apres review de coherence avec le flow canonique (`onboarding-v2-canonique.md`), le playbook (`v2-execution-playbook.md`) et les prompts implementes (`structuration.ts`, `cristallisation.ts`).

## Documents de reference

- `docs/onboarding-v2-canonique.md` — flow canonique, decisions produit, modele metier
- `docs/v2-execution-playbook.md` — Lot 4, etapes 4.0 a 4.2
- `supabase/functions/_shared/v2-prompts/structuration.ts` — output type de l'IA de structuration
- `supabase/functions/_shared/v2-prompts/cristallisation.ts` — output type de l'IA de cristallisation
- `supabase/functions/_shared/v2-prompts/questionnaire.ts` — schema et contraintes du questionnaire sur mesure V2

## Principes UX globaux

- Mobile-first : tout est concu pour le pouce
- Bienveillant : jamais de jugement, jamais de pression
- Pas de categorisation prematuree : on parle d'aspects, sujets, regroupements — jamais de "transformations" avant la priorisation
- Confiance progressive : chaque ecran donne le sentiment d'avancer sans forcer
- Les aspects incertains ne sont jamais presentes comme une erreur
- "Pour plus tard" est une reserve de travail futur, pas une poubelle

## Progression

Pas de barre de progression numerotee ("Etape 1/5"). Le nombre d'etapes varie selon le cas (1 vs 3 transformations, utilisateur deja inscrit ou non). Utiliser un indicateur non numerote : trait progressif, couleur qui avance, ou rien du tout.

---

## Ecran 1 — Capture libre (L'Intention)

### Mapping flow canonique

Etape 1 du doc canonique.

### Layout

- **Header** : logo Sophia discret centre
- **Titre (H1)** : grand, aere, centre
- **Zone de saisie** : grand textarea occupant ~40% de l'ecran, bordures douces, fond legerement grise
- **Helper text** : sous le champ, suggestions tournantes en gris clair
- **Footer (sticky)** : CTA pleine largeur, desactive tant que le champ est vide

### Hierarchie visuelle

1. Le H1 (question ouverte)
2. La zone de saisie
3. Le CTA

### Interactions

- Focus automatique sur le textarea a l'ouverture (le clavier monte)
- Le CTA s'active des que quelques mots sont saisis
- Au clic sur le CTA : transition vers un etat de chargement (shimmer ou particules douces)

### Micro-copy

- **H1** : "Qu'aimeriez-vous changer ou ameliorer en ce moment ?"
- **Placeholder** : "Je me sens un peu bloque dans ma carriere et j'aimerais retrouver de l'energie le matin..."
- **Helper text** : "Ecrivez comme vous parlez. Il n'y a pas de mauvaise reponse."
- **CTA** : "Continuer"

### Transition sortante

Fondu enchaine vers un ecran de chargement transitoire ("Sophia structure vos pensees..."), puis slide vers le haut de l'ecran 2.

---

## Ecran 1bis — Clarification (Cas C : texte vague)

### Mapping flow canonique

Cas C du doc canonique. Se declenche quand l'IA de structuration retourne `needs_clarification: true`.

### Quand cet ecran apparait

Apres l'ecran de chargement, si le texte est trop vague, trop court ou incomprehensible pour en extraire des aspects. L'IA retourne un `clarification_prompt` avec une question de relance.

### Layout

- **Header** : bouton retour
- **Illustration** : icone ou animation douce de reflexion (pas d'erreur, pas de warning)
- **Message** : texte bienveillant expliquant qu'on a besoin de plus de matiere
- **Question IA** : le `clarification_prompt` retourne par l'IA, mis en forme
- **Zone de saisie** : textarea pour le complement, pre-rempli avec le texte original (editable)
- **Footer (sticky)** : CTA "Reessayer"

### Micro-copy

- **Message** : "J'ai besoin d'en savoir un peu plus pour bien comprendre votre situation."
- **Sous-titre** : "Pas d'inquietude — quelques precisions suffiront."
- **Question IA** : variable, generee par le LLM (ex: "Pouvez-vous me donner un exemple concret de ce qui vous bloque au quotidien ?")
- **CTA** : "Reessayer"

### Transition sortante

Retour a l'ecran de chargement, puis ecran 2 si l'analyse reussit. Si toujours vague : re-affichage avec nouveau `clarification_prompt`.

---

## Ecran 2 — Validation des regroupements

### Mapping flow canonique

Etapes 2 (analyse IA — automatique) + 3 (validation utilisateur). L'analyse IA est invisible pour l'utilisateur, il voit directement le resultat a valider.

### Layout

- **Header** : bouton retour, titre explicatif
- **Zone principale (scrollable)** :
  - Cartes de regroupement (1 a 3 max) : titre du sujet (`group_label`), breve description (`grouping_rationale`), et tags ("pilules") representant les aspects
  - Aspects incertains : marques visuellement dans leur carte (pas retires)
  - Zone "Pour plus tard" : section visuellement distincte en bas (fond plus sombre ou bordure pointillee), contenant les tags d'aspects differes
- **Footer (sticky)** : CTA de validation

### Hierarchie visuelle

1. Les cartes principales (regroupements proposes)
2. Les tags d'aspects a l'interieur des cartes
3. Les aspects incertains (couleur differente ou icone `?` discrete — pas une erreur)
4. La zone "Pour plus tard" (presente mais secondaire)

### Traitement visuel des incertitudes

L'IA distingue 3 niveaux (`low`, `medium`, `high`). Proposition de traitement :

- `low` : pas de marquage visible (le doute est trop faible pour deranger l'utilisateur)
- `medium` : icone `?` discrete a cote du tag
- `high` : icone `?` + bordure differente du tag + invite a confirmer au tap

Decision a valider : on peut aussi traiter tous les niveaux de la meme facon (icone `?` uniforme) si on juge que la distinction n'apporte pas assez de valeur UX.

### Interactions

- **Drag & drop** : appui long sur un tag d'aspect pour le deplacer d'une carte a l'autre, ou vers "Pour plus tard"
- **Tap contextuel** (alternative au drag) : un tap ouvre un menu "Deplacer vers..." avec la liste des cartes + "Pour plus tard"
- **Confirmation d'incertains** : un tap sur un aspect marque `?` ouvre un tooltip ou bottom sheet : "Est-ce bien ce que vous vouliez dire ?" avec options "Oui, c'est ca" / "Deplacer vers..." (liste des cartes + "Pour plus tard")
- **Suppression d'aspect** : swipe gauche sur un tag, ou icone `x` dans le menu contextuel, pour retirer un aspect hors sujet. Confirmation legere ("Retirer cet aspect ?")
- **PAS de swipe de carte entiere** : un regroupement complet ne peut pas etre swipe d'un geste — trop destructif. Les deplacements se font aspect par aspect.

### Micro-copy

- **H1** : "Voici ce que je comprends de votre situation."
- **Sous-titre** : "J'ai regroupe vos pensees en grands sujets. Vous pouvez les ajuster."
- **Titre de carte** : le `group_label` genere (ex: "Equilibre Pro/Perso")
- **Aspect incertain** : "Gerer le stress (?)" → Tooltip : "Ai-je bien compris ce point ?"
- **Zone Pour plus tard** : "Sujets en attente — on s'en occupera quand vous serez pret."
- **CTA** : "C'est bien ca" ou "Valider ces sujets"

### Transition sortante

Au clic sur le CTA : ecran de chargement "Sophia formalise vos objectifs..." (appel `crystallize-v2`), puis :

- Si plusieurs transformations → slide vers ecran 3 (Priorisation)
- Si une seule transformation → skip ecran 3, slide direct vers ecran 4 (Questionnaire)

---

## Ecran 2→3 — Transition cristallisation

### Mapping flow canonique

Etape 4 du doc canonique (cristallisation). Etape automatique backend (appel LLM `crystallize-v2`).

### Ce qui se passe

Le backend recoit les `validated_groups` et appelle l'IA de cristallisation qui produit pour chaque regroupement :
- un titre de transformation
- une synthese interne (pour le systeme)
- une synthese user-ready (pour l'utilisateur)
- un contexte questionnaire
- un ordre recommande

### Layout

Ecran de chargement intermediaire (meme style que la transition ecran 1 → ecran 2) :

- Animation douce (shimmer, particules, ou animation Sophia)
- Message : "Sophia formalise vos objectifs..."
- Duree estimee : 3-8 secondes

### Pourquoi cet ecran existe

Sans cette transition, l'utilisateur passe de "sujets" a "priorites" sans comprendre que le systeme a fait un travail de formalisation. La transition donne du poids a l'etape et prepare le changement de vocabulaire (on peut maintenant parler de transformations dans le code, meme si l'UX continue de dire "priorites").

---

## Ecran 3 — Priorisation (PlanPriorities.tsx adapte)

### Mapping flow canonique

Etape 5 du doc canonique. Utilise le composant existant `PlanPriorities.tsx` adapte.

### Condition d'affichage

Cet ecran n'apparait que s'il y a 2 ou 3 transformations. S'il n'y en a qu'une, on passe directement au questionnaire.

### Layout

Composant existant adapte — ne pas recoder. Seules la data et la micro-copy changent.

- **Header** : titre clair
- **Liste** : les transformations (appelees "priorites" cote user) sous forme de cartes empilees avec poignee de drag
- **Footer** : CTA de confirmation

### Hierarchie visuelle

1. L'ordre de la liste (le numero 1 ressort visuellement)
2. Les titres des transformations (issus de la cristallisation)
3. Le `user_summary` de chaque transformation (2-4 phrases, empathique)

### Interactions

- **Drag & drop vertical** : reordonner les cartes. Retour haptique (vibration) au drag.
- L'ordre IA (`recommended_order` de la cristallisation) est pre-rempli mais modifiable.

### Micro-copy

- **H1** : "Par quoi voulez-vous commencer ?"
- **Sous-titre** : "Nous allons aborder ces sujets un par un pour garantir votre succes."
- **Badge sur la carte #1** : "Focus actuel"
- **Sur chaque carte** : le `user_summary` (synthese empathique produite par la cristallisation)
- **CTA** : "Definir mon plan"

### Transition sortante

Slide vers la gauche pour entrer dans le questionnaire sur mesure.

---

## Ecran 4 — Questionnaire sur mesure

### Mapping flow canonique

Etape 6 du doc canonique. Le nombre de questions est dynamique (pas fixe a 3+3).

### Format

"One question per screen" (Typeform-like). C'est le format le plus focus sur mobile.

### Layout

- **Header** : indicateur de progression sans nombre total (ex: "Question 3" sans "sur 6", ou juste des points qui se remplissent au fur et a mesure — pas de barre avec un total fixe)
- **Zone centrale** :
  - La question (generee par l'IA, contextuelle a la transformation)
  - Les options de reponse (QCM sous forme de gros boutons tactiles) OU un champ texte libre pour les questions qualitatives
- **Footer** : bouton "Precedent" (discret) et "Suivant" (CTA principal, ou auto-advance pour les QCM)

### Hierarchie visuelle

1. La question
2. Les choix de reponse (faciles a taper avec le pouce)

### Interactions

- **QCM choix unique** : auto-advance — le tap sur une reponse passe automatiquement a la question suivante avec un slide fluide
- **QCM choix multiple** : selection multiple + bouton "Suivant"
- **Qualitative** : le clavier s'ouvre, le bouton "Suivant" s'active des qu'il y a du texte

### Micro-copy

- **Questions (exemples IA)** : "Qu'est-ce qui vous a empeche de faire du sport ces derniers mois ?" (qualitatif) / "Combien de temps pouvez-vous y consacrer par semaine ?" (QCM)
- **Placeholder texte** : "Dites-m'en plus..."
- **CTA derniere question** : "Terminer"

### Transition sortante

- Si l'utilisateur n'est pas inscrit → redirection vers `Auth.tsx` (ecran 5)
- Si deja inscrit → slide vers ecran 6 (Profil)

---

## Ecran 5 — Inscription (Auth.tsx conserve)

### Mapping flow canonique

Etape 7 du doc canonique.

### Implementation

`Auth.tsx` existant est conserve **tel quel**. Il gere deja le flow guest → signup, le handoff du brouillon via `guestPlanFlowCache`, et la redirection post-inscription. Aucune modification necessaire.

### Transition sortante

Apres inscription → slide vers ecran 6 (Profil).

---

## Ecran 6 — Profil minimal (Personnalisation)

### Mapping flow canonique

Etape 8 du doc canonique.

### Layout

- **Header** : titre "Derniers details"
- **Formulaire aere** :
  - Date de naissance : selecteur natif iOS/Android
  - Genre : boutons radio stylises ou menu deroulant
  - Duree d'engagement : cartes selectionnables (1, 2, 3 mois)
- **Footer** : CTA final

### Hierarchie visuelle

1. Les cartes de duree (engagement le plus important)
2. Les champs demographiques

### Interactions

- Selection visuelle pour la duree : la carte selectionnee prend une bordure de couleur primaire et une icone check
- Pre-selection de la duree 2 mois (recommande)

### Micro-copy

- **H1** : "Ajustons le rythme a votre profil"
- **Date de naissance** : "Pour adapter le ton et les references."
- **Duree** : "Sur quelle duree souhaitez-vous vous engager pour ce premier cycle ?"
  - Option 1 : "1 mois — Intensif"
  - Option 2 : "2 mois — Progressif" (recommande)
  - Option 3 : "3 mois — En douceur"
- **CTA** : "Generer mon plan"

### Transition sortante

Au clic sur le CTA final → ecran de chargement immersif (generation du plan V2).

---

## Ecran 7 — Generation du plan (chargement immersif)

### Mapping flow canonique

Etape 9 du doc canonique. Appel a `generate-plan-v2`.

### Pourquoi cet ecran est important

La generation du plan V2 fait un appel LLM + validation JSON + distribution des items + creation North Star + activation des entites. Ca peut prendre 10-30 secondes. L'ecran de chargement doit transformer cette attente en moment positif.

### Layout

- **Ecran plein** : pas de header, pas de footer
- **Animation centrale** : animation Sophia immersive (particules, construction progressive, etc.)
- **Messages progressifs** : textes qui changent pendant le chargement
- **Pas de barre de progression precise** (la duree est imprevisible)

### Micro-copy (messages progressifs)

Sequence de messages qui defilent (ex: 4-5 secondes chacun) :

1. "Sophia construit votre plan..."
2. "Choix des leviers de soutien adaptes..."
3. "Calibration du rythme de progression..."
4. "Preparation de vos premieres actions..."
5. "Presque pret..."

### Transition sortante

Slide ou fondu vers le Dashboard V2.

---

## Parcours invite et sauvegarde

### Principe

Tout le parcours de l'ecran 1 a l'ecran 4 (questionnaire) est faisable sans inscription. Le brouillon complet du cycle est serialise dans `localStorage`.

### Ce que le cache invite stocke

- Texte libre (`raw_intake_text`)
- Aspects extraits
- Regroupements provisoires
- Regroupements valides
- Transformations cristallisees
- Priorite
- Reponses au questionnaire

### Ce que le cache invite ne stocke PAS

- Profil minimal (date de naissance, genre, duree) — capture apres inscription
- Plan genere — genere apres inscription

### Feedback UX de sauvegarde

- Micro-indication discrete apres chaque etape completee : "Progression sauvegardee" (toast ephemere ou icone check discret)
- Au retour apres fermeture (si brouillon detecte dans localStorage) : modale de reprise "Vous aviez commence un parcours. Reprendre ou recommencer ?"
- Si le localStorage est inaccessible : le flow continue normalement, les donnees sont en memoire — l'utilisateur ne voit pas d'erreur mais l'inscription est critique pour persister.

---

## Resume du mapping ecrans ↔ flow canonique

| Ecran | Flow canonique | Backend call | Condition de skip |
|---|---|---|---|
| 1 — Capture libre | Etape 1 | — | — |
| 1bis — Clarification | Cas C | `analyze-intake-v2` retourne `needs_clarification` | Skip si analyse reussit |
| Chargement analyse | Etape 2 | `analyze-intake-v2` | — |
| 2 — Validation | Etape 3 | — | — |
| Chargement cristallisation | Etape 4 | `crystallize-v2` | — |
| 3 — Priorisation | Etape 5 | — | Skip si 1 seule transformation |
| 4 — Questionnaire | Etape 6 | `generate-questionnaire-v2` | — |
| 5 — Inscription | Etape 7 | — | Skip si deja inscrit |
| 6 — Profil | Etape 8 | — | — |
| 7 — Generation | Etape 9 | `generate-plan-v2` | — |

## Points ouverts a valider

1. **Traitement visuel des niveaux d'incertitude** : differencier `low/medium/high` visuellement, ou traitement uniforme `?` pour tous ?
2. **Micro-copy "programme" vs "plan"** : le modele metier dit "plan", l'UX pourrait dire "programme". Decision produit a prendre.
3. **Transformation suivante (mini recap)** : le doc canonique prevoit un mini recap avant le questionnaire pour les transformations apres la premiere. Design a faire quand le flow principal est stable.
4. **CTA ecran 1** : "Continuer" est neutre. Alternatives possibles : "Decouvrir mes sujets", "Laisser Sophia reflechir". A tester.
