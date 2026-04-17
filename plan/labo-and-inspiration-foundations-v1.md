# Plan D'Implementation — Fondations Labo + Inspiration V1

## But

Structurer le `Labo` et l'`Inspiration` comme objets produit canoniques hors plan, avant toute orchestration fine avec la phase 1.

Point de depart retenu :

- le plan ne doit plus generer de `supports`
- le plan peut generer des `clarifications`, des `missions` et des `habits`
- les `supports` doivent exister comme vraies surfaces produit hors plan
- tant que ces surfaces n'existent pas proprement, retirer `support` du plan laisse un trou produit

## Resultat vise

Obtenir une base produit stable ou :

- le `Labo` a un vrai contrat de donnees
- l'`Inspiration` a un vrai contrat de donnees
- le dashboard sait qu'un support vit hors plan
- une transformation, une phase ou une classification peuvent pre-remplir ces surfaces
- la phase 1 pourra ensuite les utiliser sans bricolage

## Contraintes

- ne pas repartir dans un chantier UX complet trop tot
- ne pas melanger `dimension du plan` et `surface produit`
- conserver une V1 assez simple pour etre implementable sans tout figer
- preserver le deja-existant utile, notamment la `defense card`

## Partie 1 — Definir Le Contrat Canonique Du Labo

### Objectif

Faire du `Labo` une surface produit stable avec ses propres objets, ses propres statuts et ses propres prefills.

### Cible V1

Le Labo doit pouvoir porter au minimum :

- `defense_cards`
- `attack_cards`
- `support_cards`

Les `potions` et autres objets peuvent arriver apres si besoin, mais ils ne doivent pas brouiller la V1.

### Pour chaque objet du Labo, definir

- identifiant
- `user_id`
- `cycle_id`
- `transformation_id`
- `phase_id` optionnel
- `source`
  - manuel
  - prefill depuis plan
  - prefill depuis classification
  - prefill systeme
- `status`
  - draft
  - suggested
  - active
  - archived
- `content`
- `metadata`
- `generated_at`
- `last_updated_at`

### Decision recommandee

- garder `defense_card` comme premier objet deja existant
- ajouter ensuite `attack_card` et `support_card` sur le meme patron
- eviter de lancer les `potions` tant que ces 3 cartes ne sont pas propres

## Partie 2 — Definir Le Contrat Canonique De L'Inspiration

### Objectif

Faire de l'Inspiration une vraie surface de contenu/actionnable, et pas juste une sous-page ou un wording variable.

### Cible V1

Une inspiration doit pouvoir exister comme objet distinct avec :

- identifiant
- titre
- type
- angle
- contenu
- CTA principal
- tags
- niveau d'effort
- contexte d'usage
- lien optionnel avec :
  - `type_key` de classification
  - `phase_id`
  - besoin detecte

### Types minimaux recommandes

- recadrage
- perspective
- mini-rituel
- micro-pas
- question utile
- rappel identitaire

### Decision recommandee

- separer clairement `Inspiration` de `Labo`
- `Inspiration` donne des appuis, angles, micro-declics
- `Labo` porte des objets plus structurels et plus outilles

## Partie 3 — Definir La Couture Hors Plan

### Objectif

Definir comment le plan, la transformation et la classification peuvent alimenter ces surfaces sans refaire entrer `support` dans le plan.

### A definir

- ce qu'un plan peut demander au hors-plan
- ce qu'une phase peut suggerer comme prefill
- comment une classification peut influencer :
  - les cartes suggerees
  - les inspirations prioritaires

### Contrat recommande

Le plan ne cree pas un `support` comme item d'execution.
Il peut seulement produire un signal de prefill ou de recommandation, par exemple :

- `recommended_lab_objects`
- `recommended_inspirations`
- `support_prefill_context`

Ces informations peuvent vivre :

- dans le `content` du plan V3
- ou dans un bloc derive calcule serveur

### Regle produit

- `clarification` reste dans le plan
- `support` reste hors plan
- le passage du plan vers le hors-plan se fait par recommandation ou prefill, pas par confusion de taxonomie

## Partie 4 — Backend Et Stockage V1

### Objectif

Poser les tables, types et edge functions minimales pour rendre ces surfaces utilisables.

### Backend recommande

#### Labo

- creer les tables manquantes pour :
  - `user_attack_cards`
  - `user_support_cards`
- harmoniser avec la structure existante de `user_defense_cards`

#### Inspiration

- creer une table canonique du type :
  - `user_inspiration_items`
  ou
  - `user_inspirations_v1`

### Edge functions minimales

- `generate-attack-card-v1`
- `generate-support-card-v1`
- `generate-inspiration-v1`
- `refresh-inspiration-v1` optionnelle plus tard

### Input minimal commun

- `transformation_id`
- contexte de transformation
- classification si disponible
- phase active si disponible
- eventuel `support_prefill_context`

## Partie 5 — Frontend Et Points D'Atterrissage

### Objectif

Donner un point d'entree clair a ces surfaces sans attendre leur version finale.

### V1 minimale recommandee

- un onglet ou bloc `Labo`
- un onglet ou bloc `Inspiration`
- un etat vide propre si rien n'est encore genere
- une distinction visuelle claire :
  - le plan = execution
  - le hors-plan = appuis / objets / leviers

### Dans le dashboard

- ne plus afficher `support` comme dimension native du plan
- afficher a la place des acces explicites vers :
  - `Labo`
  - `Inspiration`

### Dans les cartes

- si une carte est seulement suggeree :
  - badge `Suggere`
- si une carte a ete validee :
  - badge `Active`

## Partie 6 — Nettoyage Legacy

### Objectif

Supprimer les contradictions et les zones floues que cette fondation remplace.

### A nettoyer

- specs qui traitent `support` comme une dimension stable du plan
- composants qui supposent que le dashboard plan doit afficher une colonne `support`
- naming incoherent entre :
  - `Inspiration`
  - `Atelier d'inspirations`
  - `Labo`
  - `cards`
- code ou docs qui melangent :
  - surface produit
  - type de contenu
  - dimension de plan

### A deprecier explicitement

- la lecture de `support` comme item natif du plan
- les formulations ou une carte de labo devient implicitement une mission ou une habitude
- le statut hybride des inspirations si elles n'ont ni contrat ni surface claire

## Ordre Recommande

1. Partie 1
2. Partie 2
3. Partie 3
4. Partie 4
5. Partie 5
6. Partie 6

## Strategie De Livraison

### Lot 1

- contrat canonique `Labo`
- contrat canonique `Inspiration`
- decisions de naming et de scope

### Lot 2

- tables et types backend
- edge functions minimales

### Lot 3

- points d'entree frontend
- affichage dashboard minimal

### Lot 4

- nettoyage legacy
- clarification des docs encore contradictoires

## Ce Qui Vient Apres

Une fois cette base posee, le chantier suivant devient logique :

- `Phase 1 universelle`

Et cette fois la phase 1 pourra vraiment :

- pre-remplir des objets de Labo
- pointer vers de l'Inspiration
- rester coherente avec la nouvelle taxonomie
