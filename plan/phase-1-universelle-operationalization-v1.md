# Plan D'Implementation — Phase 1 Universelle V1

## But

Mettre en place une vraie `Phase 1 universelle` visible apres validation du plan, qui donne a l'utilisateur une sensation de demarrage reel, de sens et d'equipement.

Cette phase 1 doit s'appuyer sur les fondations deja posees :

- le plan n'embarque plus les `supports`
- `Labo` et `Inspiration` existent comme surfaces hors plan
- la classification de type de plan existe
- le plan V3 porte `global_objective`, `phase_objective` et `maintained_foundation`

## Promesse Produit

La promesse de la phase 1 n'est pas :

- "tu as compris ton plan"

La promesse de la phase 1 est :

- "tu as deja commence"
- "tu as deja des appuis"
- "en moins de 30 minutes, ton socle de depart existe"

## Resultat Vise

A la fin de la phase 1, l'utilisateur doit avoir :

- ouvert `Inspiration`
- valide ou consulte `Ton histoire`
- donne au moins une reponse a `Ton pourquoi profond`
- valide ou cree une carte de defense
- valide ou cree une carte d'attaque

La carte de soutien reste recommandee, mais ne bloque pas la completion par defaut.

## Contraintes

- ne pas remettre `support` dans le plan comme dimension d'item
- ne pas faire de la phase 1 un preambule cache
- ne pas bloquer toute la phase si `Ton histoire` a besoin de details
- separer les sorties techniques qui ont des formats differents

## Partie 1 — Definir Le Contrat Produit De La Phase 1

### Objectif

Faire de la phase 1 une vraie phase d'execution, pas une annexe.

### Position Dans Le Flow

1. questionnaire termine
2. classification du type de transformation
3. generation du plan
4. validation du plan
5. entree en phase 1

### Nom Produit Recommande

- `Construire ton socle`

### Composition Produit

La phase 1 repose sur 2 surfaces :

- `Inspiration`
- `Labo`

### Regle De Taxonomie

- les actions visibles dans le plan peuvent pointer vers la phase 1
- mais la matiere executee vit dans `Inspiration` et `Labo`
- la phase 1 n'a pas besoin de reintroduire une dimension `support` dans le JSON du plan

## Partie 2 — Mater ialiser Un Contexte Partage De Phase 1

### Objectif

Construire un contexte unique qui alimente toutes les briques de phase 1 sans dupliquer les chargements metier.

### Objet Recommande

- `phase1_context`

### Contenu Minimal

- `cycle_id`
- `transformation_id`
- `plan_id`
- `plan_type_classification`
- `questionnaire_answers`
- `questionnaire_schema`
- `transformation_summary`
- `global_objective`
- `phase_1_objective`
- `phase_1_heartbeat`
- `recommended_lab_objects`
- `recommended_inspirations`

### Stockage Recommande

- `user_transformations.handoff_payload.phase_1`

### Regle Produit

Le contexte de phase 1 est un objet de prefill et d'orchestration.
Il ne remplace pas le plan V3.

## Partie 3 — Creer Les 3 Appels Specialises De Phase 1

### Objectif

Ne pas faire un gros appel fragile. Garder des briques separees selon la nature des sorties.

### Appel A — Preparation Du Labo

Responsabilite :

- pre-remplir la carte de defense
- pre-remplir la carte d'attaque
- decider si une carte de soutien doit etre suggeree tout de suite

Sortie attendue :

- `defense_card_prefill`
- `attack_card_prefill`
- `support_card_prefill` ou `null`

### Appel B — Preparation De `Ton histoire`

Responsabilite :

- dire si l'histoire peut etre generee directement
- ou s'il faut d'abord demander 1 a 3 details cibles
- fournir les hints narratifs utiles

Sortie attendue :

- `status = ready_to_generate | needs_details`
- `detail_questions[]`
- `story_prompt_hints`

### Appel C — Generation Des Questions Du Pourquoi Profond

Responsabilite :

- generer 3 a 6 formulations courtes
- rester emotionnellement justes
- coller au type de transformation

Sortie attendue :

- `deep_why_questions[]`

## Partie 4 — Strategie De Declenchement

### Objectif

Choisir ce qui doit partir au `confirm` et ce qui doit etre `lazy`.

### Eager Au Confirm

Doivent partir juste apres validation du plan :

- `prepare-phase-1-context`
- `prepare-phase-1-lab`
- `prepare-phase-1-deep-why`

Pourquoi :

- les cartes doivent etre prêtes vite
- le pourquoi profond peut etre affiche immediatement
- cela donne la sensation d'avoir deja commence

### Lazy A L'Ouverture

Doit etre lazy :

- `Ton histoire`

Pourquoi :

- il peut manquer des details importants
- mieux vaut demander 1 a 3 details que produire une histoire moyenne ou generique

### Regle Produit

La phase 1 ne doit jamais etre bloquee entierement par l'histoire.

## Partie 5 — Frontend Et Experience Utilisateur

### Objectif

Donner a la phase 1 une experience claire, courte et satisfaisante.

### Vue Recommandee

Un bloc ou ecran `Construire ton socle` affichant :

- progression de phase 1
- bloc `Inspiration`
- bloc `Labo`
- checklist de completion

### Bloc Inspiration

Doit contenir :

- `Ton histoire`
- `Ton pourquoi profond`
- `Les 5 principes japonais`

### Bloc Labo

Doit contenir :

- carte de defense
- carte d'attaque
- carte de soutien si suggeree

### Ordre Recommande

1. Inspiration
2. Labo

Mais :

- si `Ton histoire` n'est pas prete, la phase doit pouvoir avancer
- si les cartes sont deja pre-remplies, elles doivent etre visibles tout de suite

## Partie 6 — Regles De Completion Et Heartbeat

### Objectif

Faire de la phase 1 une vraie phase mesurable.

### Heartbeat Recommande

- `socle de depart installe`

### Traduction Produit

Le heartbeat peut etre considere comme atteint quand les conditions minimales sont remplies :

- `Ton histoire` consultee ou validee
- au moins une reponse au `pourquoi profond`
- carte de defense validee ou creee
- carte d'attaque validee ou creee

### Carte De Soutien

- recommandee
- quasi-obligatoire si le contexte montre une vulnerabilite forte
- non bloquante par defaut

## Partie 7 — Backend, Tables Et Statuts

### Objectif

Poser le suivi minimum necessaire de la phase 1.

### A Ajouter

- un etat de progression de phase 1
- un suivi de completion des blocs :
  - `story_viewed_or_validated`
  - `deep_why_answered`
  - `defense_card_ready`
  - `attack_card_ready`
  - `support_card_ready`

### Forme Recommandee

Deux options possibles :

#### Option A

Stocker cela dans :

- `user_transformations.handoff_payload.phase_1.runtime`

#### Option B

Creer une table dediee type :

- `user_phase_1_progress`

### Recommandation V1

Commencer par `handoff_payload.phase_1.runtime`.
Passer a une table dediee seulement si la logique grossit.

## Partie 8 — Nettoyage Legacy

### Objectif

Eviter que la phase 1 contredise les nouvelles fondations.

### A Nettoyer

- les formulations ou la phase 1 serait decrite comme une annexe d'onboarding
- les specs ou les actions de phase 1 seraient encore classees comme `support` dans le plan
- les zones du dashboard ou `Atelier` et `Inspiration` seraient melanges sans contrat clair
- les logiques qui supposent que l'histoire doit toujours etre eager

### A Preserver

- la defense card deja existante
- la separation `plan` / `hors-plan`
- la classification comme source de guidance

## Ordre Recommande

1. Partie 1
2. Partie 2
3. Partie 3
4. Partie 4
5. Partie 5
6. Partie 6
7. Partie 7
8. Partie 8

## Strategie De Livraison

### Lot 1

- contrat produit de phase 1
- `phase1_context`
- decision eager / lazy

### Lot 2

- 3 appels specialises
- persistence minimale dans `handoff_payload.phase_1`

### Lot 3

- UI `Construire ton socle`
- completion rules
- heartbeat de phase 1

### Lot 4

- nettoyage legacy
- harmonisation du naming et des statuts

## Ce Qui Viendra Apres

Une fois la phase 1 universelle en place, le chantier suivant devient beaucoup plus propre :

- orchestration fine entre phase active, cartes, inspirations et evolution dynamique du parcours
