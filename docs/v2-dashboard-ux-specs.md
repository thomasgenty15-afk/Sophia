# Dashboard V2 — Specs UX

## Statut

Document de reference UX pour le Lot 5. Produit par Gemini, corrige et enrichi par Claude apres review de coherence avec le flow canonique (`onboarding-v2-canonique.md`), le technical-schema et le playbook.

## Documents de reference

- `docs/onboarding-v2-canonique.md` — structure canonique du dashboard, caps de charge, mecaniques d'habitudes
- `docs/v2-technical-schema.md` — types, enums, champs des items et metrics
- `docs/v2-execution-playbook.md` — Lot 5, etapes 5.0 a 5.2

## Principes UX globaux

- **Mobile-first :** navigation fluide au pouce, sections empilees verticalement, cartes compactes.
- **Holistique mais focus :** les 3 dimensions (Support, Missions, Habits) sont visibles simultanement, mais la hierarchie visuelle guide l'oeil vers ce qui necessite une action immediate.
- **Anticipation vs Pression :** les elements bloques ou a venir creent de l'envie (teasing) sans surcharger la charge mentale (pas de to-do list infinie).
- **Identite avant l'action :** le rappel de *pourquoi* on fait les choses (Identity Shift, North Star) precede le *quoi* (les actions).
- **Support en premier :** la dimension support precede missions et habits dans le layout. L'ordre canonique a une logique : le support outille, les missions avancent, les habitudes ancrent.

---

## Layout General (Haut en bas)

1. **Daily Check-in** (Le point du jour)
2. **Header & Strategie** (Le "Pourquoi")
3. **North Star & Progress** (Le "Ou on en est")
4. **Dimension : Soutien** (Les ressources — en premier)
5. **Dimension : Missions** (L'action ponctuelle)
6. **Dimension : Habitudes** (L'action recurrente)
7. **Anticipation & Suite** (Le "Et apres ?")

Cet ordre respecte la structure canonique du dashboard definie dans `onboarding-v2-canonique.md` :
header → strategie → support → missions → habits → metrics → prochain deblocage → transformation suivante.

---

## 0. Daily Check-in (Bandeau)

### Canal principal : WhatsApp

Le daily bilan est principalement pousse via WhatsApp (cron `trigger-daily-bilan`, conversation avec sophia-brain/investigator). L'utilisateur repond directement dans WhatsApp — c'est le canal principal et le plus naturel.

### Role du bandeau in-app

Le bandeau dans le dashboard est un **canal complementaire**, pas le canal principal. Il sert a :

- **Montrer si le bilan du jour a ete fait** (via WhatsApp ou in-app) — indicateur de statut
- **Offrir un fallback in-app** pour les utilisateurs sans WhatsApp ou qui preferent l'app
- **Permettre un check-in spontane** si l'utilisateur ouvre l'app avant que le cron WhatsApp ne se declenche

### Layout

- **Bandeau compact** en haut de page, sous le header app (avant le header transformation).
- Fond legerement colore ou carte douce.
- CTA clair au centre.

### Interactions

- Tap sur le bandeau : ouvre le flow de daily check-in in-app (bottom-sheet ou nouvelle vue).
- Le bandeau disparait une fois le bilan du jour complete (que ce soit via WhatsApp ou in-app), remplace par un micro-feedback ("Point du jour fait" avec icone check).

### Micro-copy

- *Avant bilan :* "Comment s'est passee ta journee ?" ou "Faire le point"
- *Apres bilan :* "Point du jour fait" (discret, icone check)
- *Si fait via WhatsApp :* le bandeau montre directement l'etat "fait" a l'ouverture du dashboard

---

## 1. Header & Strategie

### Layout & Hierarchie

- **Header :** titre de la transformation active en grand (H1).
- **Sous-titre :** le `user_summary` (2-3 lignes max, texte empathique).
- **Bloc Strategie :**
  - Carte visuellement distincte (fond sombre ou degrade subtil), tres epuree.
  - "Qui je deviens" (`identity_shift`) mis en avant.
  - "Mon mantra" (`core_principle`) en citation.
  - Le bloc peut etre "collapsible" (repliable) au scroll pour gagner de la place au quotidien, mais il est toujours ouvert au premier chargement de la journee.

### Micro-copy

- *Sur-titre :* "Focus actuel"
- *Identity Shift label :* "Mon intention :"
- *Core Principle label :* "Mon mantra :"

### Note sur `success_definition` et `main_constraint`

La strategie du plan contient aussi `success_definition` et `main_constraint`. Ils ne sont pas affiches dans le header pour garder le bloc epure, mais peuvent etre exploites dans le detail de la North Star (tap sur la jauge) ou dans le coaching.

---

## 2. North Star & Progress Markers

### Layout & Hierarchie

- **North Star (Cycle-level) :**
  - Grande jauge ou anneau de progression circulaire en haut de section.
  - Valeur courante vs cible affichee clairement (ex: "12 / 20 seances").
- **Progress Markers (Transformation-level) :**
  - Petites "pilules" ou mini-cartes sous la North Star.
  - Affichage discret des metriques secondaires.

### Interactions

- Tap sur la jauge North Star : ouvre un detail avec `success_definition` et historique de progression.

### Micro-copy

- *North Star :* "L'objectif du cycle"
- *Progress Markers :* "Indicateurs de succes"

---

## 3. Dimension : Soutien (Support)

### Pourquoi en premier parmi les dimensions

Le doc canonique place le support avant les missions et les habitudes. La contrainte produit est explicite : "les supports ne doivent pas paraitre secondaires". Le support outille l'utilisateur pour mieux aborder ses missions et habitudes.

### Layout & Hierarchie

- **Titre de section :** "Ta boite a outils" (avec icone de bouclier/etincelle).
- **Affichage :** carousel horizontal de cartes.
- **Differenciation par mode d'usage :**
  - `recommended_now` : cartes en premier, bordure coloree, badge "Utile aujourd'hui".
  - `always_available` : cartes standards a la suite.
  - `unlockable` : cartes grisees/flouees avec cadenas discret, en fin de carousel. Tap affiche la condition de deblocage.
- **Differenciation par fonction :**
  - `rescue` : badge "SOS" ou icone eclair, toujours en tete du carousel (meme devant `recommended_now`). Un support de crise doit etre trouvable en 2 secondes.
  - `practice` : traitement standard (carte reguliere).
  - `understanding` : indicateur "A decouvrir" ou "One-shot" si c'est une lecture unique.

### Interactions

- Tap sur une carte : ouvre le framework, l'exercice ou le contenu dans un bottom-sheet.
- Tap sur une carte `unlockable` : affiche un tooltip avec la condition d'activation.

### Micro-copy

- *Titre :* "Ta boite a outils"
- *Badge recommended_now :* "Utile aujourd'hui"
- *Badge rescue :* "SOS" ou "En cas de besoin"
- *Badge understanding :* "A decouvrir"
- *Carte unlockable :* "Bientot disponible" (grise)
- *Si vide :* "Aucun outil specifique n'est requis pour le moment."

---

## 4. Dimension : Missions

### Layout & Hierarchie

- **Titre de section :** "Missions" (avec icone d'action/cible).
- **Affichage :** liste verticale (1 principale + 1 secondaire max selon les caps de charge).
- **Carte Task :**
  - Titre clair, statut d'avancement.
  - Bouton d'action principal ("Faire", "Completer").
- **Carte Milestone (differenciation) :**
  - Design distinct : icone drapeau/checkpoint, fond legerement different.
  - Le milestone est un jalon de validation, pas une action comme les autres. L'utilisateur doit comprendre que c'est un moment important.

### Interactions

- Tap sur la carte : ouvre le detail (contexte, etapes si existantes) dans un bottom-sheet.
- Swipe lateral : action rapide "Fait" (retour haptique + animation de celebration).
- Completion d'un milestone : animation de celebration renforcee (plus visible qu'une task simple).

### Micro-copy

- *Titre :* "Missions en cours"
- *Badge milestone :* "Jalon" ou "Etape cle"
- *Si vide :* "Tu as accompli tes missions du moment. La suite se prepare." + lien discret "Voir les conditions de deblocage".

---

## 5. Dimension : Habitudes (Habits)

### Layout & Hierarchie

- **Titre de section :** "Habitudes" (avec icone de boucle/recurrence).
- **Active Building (En construction) :**
  - Cartes empilees verticalement (max 2 simultanees selon les caps de charge — un carousel est inutile pour 1-2 items et cacherait la seconde habitude).
  - Chaque carte montre un indicateur d'ancrage (preuves d'ancrage, PAS un streak).
- **Stalled (En difficulte) :**
  - Carte avec bordure ambre/orange, message bienveillant.
  - CTA vers une action de reevaluation.
- **In Maintenance (En maintien) :**
  - Accordeon replie par defaut ("Voir mes habitudes ancrees") sous les cartes actives.
  - Ne doit pas polluer l'espace visuel des habitudes en construction.

### Indicateur d'ancrage (remplace le streak)

La mecanique canonique est "3 reussites sur 5 jours" (preuves d'ancrage), pas un streak. L'affichage doit refleter cette logique :

- **Habitude quotidienne :** grille des 5 derniers jours avec points remplis/vides + compteur "3/5". Les jours affiches sont adaptes a `scheduled_days` si l'habitude n'est pas quotidienne (ex: L M V pour une habitude 3 fois/semaine — afficher uniquement les jours prevus).
- **Micro-feedback d'ancrage :** quand l'utilisateur atteint 3/5, animation de celebration + message "Cette habitude s'ancre bien".
- **Le streak peut exister comme badge secondaire** (ex: "5 jours d'affilee" en petit) mais n'est pas la mecanique principale.

### Traitement de l'etat `stalled`

Une habitude `stalled` "n'avance plus de facon utile et doit etre reevaluee, allegee ou remplacee". L'affichage ne doit pas ressembler a un echec.

- Carte avec bordure ambre (pas rouge).
- Message : "Cette habitude a besoin d'attention" ou "On dirait que c'est difficile en ce moment".
- CTA : "Adapter" (ouvre un flow de reevaluation ou envoie vers le coaching).

### Interactions

- Tap sur un jour/bouton : marque l'habitude comme completee pour aujourd'hui.
- Expand sur "En maintien" : deroule la liste des habitudes acquises pour un check occasionnel.

### Micro-copy

- *Active :* "En construction"
- *Stalled :* "A adapter"
- *Maintenance :* "Habitudes ancrees" (Accordeon)
- *Validation :* "C'est fait" / "Pas aujourd'hui"
- *Ancrage atteint :* "Cette habitude s'ancre bien"

---

## 6. Anticipation & Suite

### Layout & Hierarchie

- **Prochain Deblocage :**
  - Carte grisee/flouee avec une icone de cadenas.
  - Condition textuelle indiquant ce qu'il manque pour debloquer (ex: "Plus que 2 reussites sur [Habitude] cette semaine").
  - Note : formuler la condition en termes de preuves d'ancrage, pas de streak.
- **Transformation Suivante (si applicable) :**
  - Tout en bas de l'ecran, une carte discrete "A venir".

### Interactions

- Tap sur le cadenas : affiche un tooltip amical expliquant la condition d'activation sans pression.

### Micro-copy

- *Deblocage :* "Bientot disponible..."
- *Tooltip :* "Cet element se debloquera quand tu auras stabilise ta mission actuelle. Chaque chose en son temps !"
- *Transformation suivante :* "Prochain focus : [Titre]"

---

## Points ouverts a valider

1. **Emplacement du daily check-in :** bandeau en haut vs bottom bar vs notification push qui renvoie vers un flow dedie. Le bandeau en haut est le plus direct mais consomme de l'espace.
2. **Niveau de detail des supports `rescue`** : badge "SOS" suffisant, ou faut-il un acces rapide permanent (floating action button, shortcut dans la bottom bar) ?
3. **Exploitation de `success_definition` / `main_constraint`** : dans le detail North Star uniquement, ou aussi dans un bloc "rappel" periodique ?
4. **Coaching / nudges :** le dashboard ne montre pas ou les messages coaching et morning nudges apparaissent (hors scope Lot 5, a integrer au Lot 6C). Prevoir un slot dans le layout.
