# Plan D'Implementation Cartes Defense Et Attaque

## Objectif

Mettre en place la nouvelle version des cartes du labo definie dans
[docs/v3-cartes-defense-attaque-cadrage.md](/Users/ahmedamara/Dev/Sophia%202/docs/v3-cartes-defense-attaque-cadrage.md)

Le but est de:

- refondre la `carte de defense`
- refondre la `carte d'attaque`
- supprimer la `carte de soutien`
- garder `potions` comme surface de gestion d'etat
- permettre l'usage `lie au plan` et `hors transformation`

---

## Perimetre Retenu

### A Faire

- nouveau parcours de creation de `carte de defense`
- nouveau vocabulaire visible:
  - `Le moment`
  - `Le piege`
  - `Mon geste`
  - `Plan B`
- edition libre de chaque champ de defense
- nouvelle experience `cartes d'attaque`
- bibliotheque des 6 techniques d'attaque
- mini parcours specifique par technique
- affichage du `mode d'emploi` sur chaque carte d'attaque
- suppression produit de la `carte de soutien`
- compatibilite `lie au plan / hors transformation`

### Hors Perimetre Pour Ce Chantier

- routage intelligent defense / attaque / potion
- systeme de recommendation automatique du bon type de carte
- optimisation fine du scoring ou de l'ethique IA au-dela du minimum deja en place

---

## Chantier 1 - Structure Produit Et Navigation

### But

Faire en sorte que les cartes puissent vivre:

- dans un plan actif
- ou dans `Hors transformations`

### Taches

- brancher le scope `transformation` / `hors transformation` sur les surfaces du labo
- verifier que defense, attaque, inspiration et rendez-vous savent vivre hors plan
- definir clairement quelles cartes sont:
  - uniques par scope
  - multiples par scope

### Decision Produit A Fig er

- `carte de defense`
  - soit une carte unique avec plusieurs situations
  - soit plusieurs cartes defense unitaires

Au vu du cadrage actuel, la direction la plus coherente semble etre:

- une `carte defense` = un objet defense
- avec un nom clair
- et un ensemble limite de situations coherentes a l'interieur

---

## Chantier 2 - Modele De Donnees

### But

Faire evoluer la base pour supporter proprement:

- les cartes liees a une transformation
- les cartes hors transformation
- la suppression de la carte de soutien

### Taches

- ajouter un `scope_kind` ou equivalent sur les tables du labo
  - `transformation`
  - `out_of_plan`
- rendre le rattachement a `transformation_id` nullable quand le scope est `out_of_plan`
- verifier si `cycle_id` doit rester obligatoire ou devenir nullable pour les objets intemporels
- ajouter les index et contraintes d'unicite adaptes
- preparer la migration de suppression logique de `user_support_cards`

### Recommendation

Garder une structure explicite plutot que de deduire `hors transformation` a partir de `transformation_id = null`.

Exemple:

- `scope_kind`
- `transformation_id nullable`
- eventuellement `cycle_id nullable`

---

## Chantier 3 - Refonte Carte De Defense

### But

Remplacer l'experience actuelle trop conceptuelle par un parcours court et naturel.

### Parcours Cible

1. question d'entree:
   - `Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?`
2. mini questionnaire:
   - 3 questions max
3. generation IA de la carte
4. edition libre des champs

### Taches Frontend

- creer un point d'entree `Ajouter une carte de defense`
- remplacer le formulaire manuel actuel par le nouveau parcours guide
- afficher la carte avec la taxonomie:
  - `Le moment`
  - `Le piege`
  - `Mon geste`
  - `Plan B`
- permettre l'edition champ par champ
- garder un bouton `Regenerer`

### Taches Backend

- creer un endpoint de generation guidee pour defense
- transformer les reponses du mini questionnaire en structure defense
- conserver la verification ethique permissive deja en place
- conserver l'enrichissement:
  - nom
  - illustration

### Point De Vigilance

Le user ne doit jamais voir:

- `environnement`
- `declencheur`
- `defense`

comme vocabulaire principal.

---

## Chantier 4 - Refonte Carte D'Attaque

### But

Transformer la carte d'attaque en bibliotheque de techniques testables.

### Experience Cible

- un depliant explique le concept
- l'utilisateur choisit une technique
- un mini parcours specifique se lance
- l'IA genere l'objet concret
- le `mode d'emploi` est visible sur la carte

### Les 6 Techniques A Implementer

1. `Texte de recadrage`
2. `Mantra de force`
3. `Ancre visuelle`
4. `Rituel de depart`
5. `Preparer le terrain`
6. `Pre-engagement`

### Taches Frontend

- remplacer la carte d'attaque actuelle par une galerie de techniques
- ajouter une vue detail par technique
- ajouter le mini questionnaire de chaque technique
- afficher le resultat dans un format coherent:
  - `Pour quoi`
  - `Objet genere`
  - `Mode d'emploi`

### Taches Backend

- soit un endpoint unique avec `technique_type`
- soit 6 generateurs specialises

Recommendation:

- commencer par un endpoint unique
- avec prompt conditionnel selon la technique

---

## Chantier 5 - Suppression Carte De Soutien

### But

Retirer une surface produit devenue redondante.

### Taches

- retirer le wording `soutien` du labo
- retirer les CTA de generation associes
- masquer puis decommissionner `user_support_cards`
- verifier qu'aucun prompt ou auto-generation ne depend encore de cette carte

### Strategie

Faire en 2 temps:

1. suppression UX
2. suppression technique

Comme ca on evite une regression brutale.

---

## Chantier 6 - Prompts Et Schemas IA

### But

Aligner la generation IA avec la nouvelle logique produit.

### Defense

- prompt base sur une scene concrete
- sortie structuree:
  - `title`
  - `moment`
  - `trap`
  - `gesture`
  - `plan_b`
- ton simple, memorizable, court

### Attaque

- prompt specialise par technique
- sortie avec:
  - `pour_quoi`
  - `objet_genere`
  - `mode_d_emploi`

### Taches

- revoir les validators
- revoir les types partages frontend / backend
- verifier que les champs restent courts et affichables

---

## Chantier 7 - Migration UI Progressive

### But

Limiter la casse pendant la transition.

### Strategie

1. supporter temporairement ancien + nouveau format en lecture
2. basculer la creation sur le nouveau format
3. migrer ou regrouper l'existant si necessaire
4. retirer le support legacy ensuite

### Point Important

Les cartes de defense existantes peuvent ne pas rentrer parfaitement dans le nouveau format.
Il faudra choisir entre:

- migration best-effort
- ou recreation progressive a la premiere regeneration

Recommendation:

- faire une migration best-effort minimale
- et utiliser la regeneration pour nettoyer les cas limites

---

## Ordre Recommande

1. finaliser le modele de scope `transformation / hors transformation`
2. supprimer la surface `soutien` en UI
3. refondre la defense
4. refondre l'attaque
5. aligner prompts / validateurs / types
6. nettoyer le legacy

---

## Definition Of Done

Le chantier sera considere termine quand:

- `Hors transformations` supporte defense + attaque + inspiration
- la `carte de defense` suit le nouveau parcours guide
- la `carte de defense` affiche `Le moment / Le piege / Mon geste / Plan B`
- chaque champ defense est editable
- la `carte d'attaque` devient une bibliotheque des 6 techniques
- chaque technique a son mini parcours
- chaque carte d'attaque affiche un `mode d'emploi`
- `carte de soutien` n'est plus visible dans le produit
- les prompts et validateurs sont alignes avec les nouvelles formes
- le frontend et les edge functions passent les checks de base

---

## Premiere Decoupe Technique Concrete

Si on veut lancer l'implementation tout de suite, la meilleure premiere tranche est:

1. retirer `soutien` du frontend
2. poser le schema DB `scope_kind`
3. brancher defense / attaque / inspiration en `hors transformation`
4. refaire le parcours defense

Cette tranche donne deja un gain produit net sans attendre toute la refonte attaque.
