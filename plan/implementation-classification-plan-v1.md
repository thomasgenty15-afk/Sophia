# Plan D'Implementation — Classification Plan + Objectifs + Clarification

## But

Mettre en place, dans le repo actuel, les evolutions suivantes :

- classifier le type de plan juste apres le questionnaire
- faire consommer cette classification par `generate-plan-v2`
- enrichir le contrat de generation du plan avec la couche d'objectifs
- faire evoluer la semantique `support` vs `clarification`
- nettoyer le legacy remplace par cette nouvelle logique

## Contraintes

- le repo actuel genere deja des plans V3 par phases + heartbeat
- la classification doit s'inserer sans migration DB obligatoire
- la refonte `support` vs `clarification` touche le contrat du plan, donc elle doit etre traitee explicitement
- on privilegie un ordre de livraison qui donne de la valeur vite sans figer un contrat deja obsolete

## Partie 1 — Classification du type de plan apres questionnaire

### Objectif

Declencher la classification du type de transformation a la fin du questionnaire, puis la stocker sur la transformation active.

### Implementation

- creer une edge function dediee `classify-plan-type-v1`
- la fonction lit :
  - `user_transformations.title`
  - `user_transformations.internal_summary`
  - `user_transformations.user_summary`
  - `user_transformations.questionnaire_answers`
  - `user_transformations.questionnaire_schema`
  - `handoff_payload.onboarding_v2.questionnaire_context`
- la fonction persiste le resultat dans :
  - `user_transformations.handoff_payload.onboarding_v2.plan_type_classification`

### Branchement produit

- utilisateur auth :
  - apres `questionnaire_answers` persistées
  - avant ou pendant le passage en `profile_pending`
- utilisateur invite :
  - la classification est declenchee au moment ou les reponses sont finalement hydratees cote serveur apres auth

### Sortie attendue

- `type_key`
- `confidence`
- `duration_guidance`
- `plan_style`
- `recommended_metrics`
- `framing_to_avoid`
- `first_steps_examples`

## Partie 2 — Utiliser la classification dans `generate-plan-v2`

### Objectif

Faire de la classification une guidance forte de generation, sans transformer le plan en template rigide.

### Implementation

- charger `plan_type_classification` depuis `handoff_payload.onboarding_v2`
- enrichir l'input LLM avec :
  - le type
  - la guidance de duree
  - les styles de plan
  - les metriques naturelles
  - les framings a eviter
  - les premieres etapes typiques
- mettre a jour le prompt V3 de generation pour :
  - utiliser cette classification comme guidance forte
  - interdire les framings absurdes
  - garder une generation adaptee au contexte reel

### Impact attendu

- phases plus credibles
- heartbeat plus naturel
- plans moins generiques
- meilleure coherence entre transformation et execution

## Partie 3 — Ajouter la couche des 3 objectifs dans le contrat du plan

### Objectif

Rendre le plan plus lisible en distinguant clairement :

- l'objectif global de transformation
- l'objectif de phase
- l'indicateur principal de phase

Le `heartbeat` reste l'indicateur principal de phase.

### Evolution du contrat

- niveau plan :
  - `global_objective`
- niveau phase :
  - `phase_objective`
  - `maintained_foundation[]`
  - `heartbeat`

### Implementation

- etendre les types frontend et backend du plan V3
- etendre la validation JSON du plan genere
- enrichir le prompt de generation avec ces contraintes
- afficher ces informations :
  - dans le preview du plan
  - dans le dashboard V3

### Regle de design

- `global_objective` = cap stable de la transformation
- `phase_objective` = palier en cours de construction
- `heartbeat` = indicateur principal mesurable
- `maintained_foundation[]` = ce qui doit rester actif d'une phase a l'autre

## Partie 4 — Refonte `support` vs `clarification`

### Objectif

Faire en sorte que le plan ne peuple plus les `supports`, mais qu'il puisse peupler les `clarifications`.

### Cible produit

- le plan porte :
  - `habits`
  - `missions`
  - `clarifications`
- les `supports` deviennent des surfaces/modules du produit hors plan :
  - defense card
  - inspiration
  - labo
  - potions
  - autres outils guides

### Decision de mise en oeuvre recommandee

- faire la vraie migration du contrat plutot qu'une demi-mesure
- remplacer la dimension stable `support` par `clarifications`
- adapter :
  - enums et types
  - validation LLM
  - distribution des plan items
  - logique dashboard
  - prompt de generation

### Point d'attention

Cette partie est la plus structurante. Elle ne doit pas etre traitee comme un simple changement de wording, car elle change le sens du plan et la source de verite d'execution.

## Partie 5 — Nettoyage legacy

### Objectif

Supprimer ou deprecier les briques qui deviennent incoherentes apres cette refonte.

### A nettoyer ou revisiter

- references documentaires qui disent encore :
  - "le plan est structure en 3 dimensions `support / missions / habits`"
  - "pas en phases" quand la V3 en produit deja
- prompt V3 actuel si la generation continue de creer des `support` dans le plan
- composants dashboard qui supposent qu'une dimension `support` doit toujours etre affichee comme section du plan
- validations JSON qui imposent `support` comme dimension metier de plan
- logique de distribution et de runtime qui considere `support` comme item d'execution de premier niveau
- specs V1/V2/V3 qui emploient en parallele :
  - `Inspiration`
  - `Atelier d'inspirations`
  - `Labo`
  - `support`
  sans source de verite unique

### Legacy a deprecier explicitement

- l'ancienne lecture de `support` comme categorie native du plan
- les formulations ambigues ou `clarification` devient un sous-cas flou de `support`
- les bouts de spec ou de code qui melangent surface produit et categorie de plan

### Resultat attendu

Apres ce nettoyage :

- le contrat du plan redevient coherent
- les docs cessent de se contredire
- les surfaces produit et les dimensions du plan ont chacune un role net

## Ordre recommande

1. Partie 1
2. Partie 2
3. Partie 3
4. Partie 4
5. Partie 5

## Strategie de livraison

- lot court 1 :
  - classification + persistence
  - lecture de classification dans `generate-plan-v2`
- lot court 2 :
  - couche `global_objective / phase_objective / maintained_foundation`
- lot structurant 3 :
  - migration `support -> clarifications`
- lot final :
  - nettoyage legacy code + docs + invariants
