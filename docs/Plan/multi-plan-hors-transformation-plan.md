# Plan Mise En Place Multi Plans Et Hors Transformation

## Objectif

Mettre en place une structure produit qui permet :

- d'avoir plusieurs plans de transformation dans le temps
- d'avoir un espace `Hors transformations`
- de filtrer le dashboard selon le scope actif
- de lancer un nouveau plan via un parcours dedie

Ce chantier doit etre traite avant la refonte detaillee des cartes de defense et d'attaque.

---

## Cadrage Produit Retenu

### 1. Deux Niveaux De Navigation

Il y a un menu horizontal de scope au-dessus des tabs actuels.

Ce menu contient :

- la transformation active ou selectionnee
- `Hors transformations`
- `Ajouter un plan`
- `Preferences`

`Preferences` sort du second niveau de tabs car il n'est pas lie a une transformation.

### 2. Quand Le Scope Actif Est Une Transformation

Tabs visibles :

- `Plan de transformation`
- `Labo`
- `Inspiration`
- `Rendez-vous`

Tous les contenus de ces tabs sont filtres sur la transformation active.

### 3. Quand Le Scope Actif Est Hors Transformations

Tabs visibles :

- `Labo`
- `Inspiration`
- `Rendez-vous`

`Plan de transformation` disparait.

Cet espace sert pour :

- les objets non lies a un plan
- les besoins intemporels
- les contenus de labo qui ne doivent pas etre enfermes dans une transformation
- a terme, certains rendez-vous non rattaches a un plan

### 4. Ajouter Un Plan

Le bouton `Ajouter un plan` lance un nouveau parcours.

Il existe 2 situations.

#### Cas 1. Il reste des transformations deja screenees

Le premier ecran est un recapitulatif des transformations restantes.

Le systeme doit :

- faire un appel IA pour proposer la transformation suivante la plus pertinente
- permettre a l'utilisateur de changer l'ordre
- permettre a l'utilisateur de supprimer une transformation proposee
- permettre a l'utilisateur de choisir laquelle lancer

L'utilisateur doit aussi pouvoir cliquer sur :

- `J'ai d'autres priorites`

Dans ce cas :

- on renvoie vers l'etape 1
- les transformations restantes passent en statut `abandonnee`

#### Cas 2. Il ne reste plus de transformations screenees

On relance un onboarding complet a partir de l'etape 1.

### 5. Etape 2 Onboarding

L'etape 2 doit permettre :

- de reordonner les transformations
- de supprimer une transformation proposee
- de confirmer cette suppression via un pop-up

---

## Statuts Metier Recommandes

Pour les transformations, le minimum recommande est :

- `screened`
- `active`
- `completed`
- `abandoned`

Remarque :

- `abandoned` est prefere a `archived`
- l'idee est de representer une vraie decision utilisateur
- on conserve le record en base, meme si on le retire des flux actifs

---

## Structure Produit A Mettre En Place

### A. Scope De Navigation

Il faut introduire un vrai concept de `scope actif` dans le dashboard.

Ce scope peut etre :

- une transformation
- `hors_transformation`

### B. Separation Des Donnees

Il faut preparer la structure pour gerer :

- les transformations actives ou passees
- les transformations screenees mais non lancees
- les contenus hors transformation

### C. Filtrage Des Surfaces

Il faut que les surfaces suivantes puissent etre filtrees par scope :

- plan
- labo
- inspiration
- rendez-vous

Quand le scope est `hors_transformation`, les surfaces doivent charger uniquement les donnees non rattachees a une transformation.

### D. Creation D'Un Nouveau Plan

Il faut un parcours dedie `Ajouter un plan` avec :

- recap des transformations restantes si elles existent
- proposition IA de priorisation
- actions utilisateur de tri / suppression / relance
- fallback vers onboarding complet si rien ne reste

---

## Plan De Mise En Oeuvre

### Etape 1. Cadrer Le Modele De Donnees

Definir proprement :

- comment representer `hors_transformation`
- comment stocker les transformations `screened`
- comment marquer une transformation `abandoned`
- quelles tables doivent accepter un rattachement nullable a une transformation

Livrable :

- schema cible
- liste des colonnes / statuts / relations a ajouter ou modifier

### Etape 2. Introduire Le Scope Actif Dans Le Frontend

Ajouter au dashboard :

- le menu horizontal de scope
- la gestion du scope selectionne
- l'affichage conditionnel des tabs selon le scope

Livrable :

- navigation fonctionnelle entre transformation et hors transformation

### Etape 3. Filtrer Les Donnees Selon Le Scope

Adapter les hooks et loaders pour que :

- une transformation charge uniquement ses propres donnees
- `hors_transformation` charge uniquement les donnees non rattachees

Livrable :

- dashboard coherent par scope

### Etape 4. Creer Le Parcours Ajouter Un Plan

Implementer le nouveau flux :

- recap des transformations restantes
- priorisation IA
- reordonnancement
- suppression avec confirmation
- bouton `J'ai d'autres priorites`
- reroutage vers onboarding et passage en `abandoned`

Livrable :

- parcours complet de demarrage d'un nouveau plan

### Etape 5. Ajuster L'Onboarding Et Les Ecrans Existants

Faire evoluer l'etape 2 pour autoriser :

- suppression d'une transformation proposee
- confirmation pop-up
- reordonnancement plus explicite si necessaire

Livrable :

- onboarding coherent avec la logique multi plans

### Etape 6. Ouvrir Le Chantier Cartes Defense / Attaque

Une fois la structure de scope en place :

- rattacher proprement defense / attaque / inspiration / rendez-vous
- permettre a certaines cartes d'exister hors transformation
- finaliser les parcours defense et attaque

---

## Questions A Trancher Ensuite

- quelle table porte le `scope actif` ou son equivalent runtime cote frontend
- comment representer exactement `hors_transformation` cote data
- quels objets doivent etre autorises hors transformation des la V1
- est-ce qu'un rendez-vous peut etre deplace d'une transformation vers hors transformation
- comment presenter plusieurs transformations dans le menu si leur nombre augmente

---

## Priorite

Ce chantier est prioritaire avant la refonte detaillee des cartes :

- defense
- attaque

Raison :

- la place des objets dans le produit depend d'abord de la structure `transformation vs hors transformation`
- sinon on risque de concevoir les cartes dans un perimetre de navigation deja depasse
