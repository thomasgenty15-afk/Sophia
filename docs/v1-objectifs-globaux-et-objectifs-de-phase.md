# V1 Objectifs Globaux Et Objectifs De Phase

## Intention

Clarifier la structure des objectifs dans le plan pour éviter les phases qui donnent une impression de juxtaposition, de patchwork ou de rupture artificielle.

Le problème actuel :

- les objectifs de phase ressemblent trop à des micro-thèmes isolés
- les métriques sont trop locales
- le lien avec la transformation globale n'est pas assez visible
- la continuité entre les phases est faible

L'objectif de ce document est de poser une structure simple et forte pour rendre le plan plus lisible, plus cumulatif et plus crédible.

## Principe Fondamental

Il faut distinguer 3 niveaux :

- l'objectif global de la transformation
- l'objectif de phase
- l'indicateur actif de phase

Et il faut ajouter un 4e élément d'affichage et de logique :

- le socle maintenu

## Les 4 Niveaux

## 1. Objectif Global De Transformation

### Définition

C'est la cible finale du plan.

Il exprime le changement concret recherché à l'échelle de la transformation entière.

### Rôle

- donner le cap
- rappeler la finalité
- éviter que les phases deviennent des petits mondes séparés

### Caractéristiques

- il reste stable tout au long du plan
- il n'est pas redéfini à chaque phase
- il est orienté résultat vécu, pas micro-action

### Exemples

- retrouver un endormissement apaisé et régulier
- se libérer durablement de la cigarette
- obtenir une augmentation en s'appuyant sur une valeur démontrée
- traverser le deuil sans s'effondrer ni se couper de la vie

## 2. Objectif De Phase

### Définition

C'est le palier de progression en cours de construction.

L'objectif de phase ne doit pas être une action.
Il doit représenter une capacité, un changement d'état ou une brique structurante.

### Rôle

- dire ce qu'on construit maintenant
- montrer en quoi cette phase rapproche réellement de l'objectif global
- éviter qu'une phase soit juste un outil ou une astuce

### Caractéristiques

- chaque phase a un objectif propre
- cet objectif doit être relié explicitement à l'objectif global
- il doit être formulé comme un palier de transformation, pas comme une consigne isolée

### Exemples

Bon niveau :

- réinstaller un vrai signal de fin de journée
- réduire la charge mentale qui déborde sur le coucher
- stabiliser un sas complet vers l'endormissement

Mauvais niveau :

- éteindre la lumière
- écrire ses pensées
- écouter un audio calme

Pourquoi :

- les mauvais exemples sont des moyens
- les bons exemples sont des paliers

## 3. Indicateur Actif De Phase

### Définition

C'est la mesure principale qui permet de savoir si la phase avance réellement.

### Rôle

- rendre la phase mesurable
- donner un feedback simple
- éviter les objectifs vagues

### Caractéristiques

- un indicateur principal par phase
- il mesure le progrès de la phase, pas la transformation entière
- il doit rester lisible et naturel

### Exemples

- 5 soirs par semaine avec un signal lumineux cohérent
- 4 soirs par semaine avec décharge mentale faite avant le lit
- 20 à 30 minutes de transition calme sur 5 soirs par semaine

## 4. Socle Maintenu

### Définition

C'est ce qui a été construit dans les phases précédentes et qui doit continuer d'exister pendant la phase actuelle.

### Rôle

- créer la continuité
- éviter l'effet "on change complètement de sujet à chaque phase"
- faire sentir que les phases s'empilent au lieu de se remplacer

### Caractéristiques

- il ne devient pas l'objectif principal de la nouvelle phase
- il reste visible comme acquis à maintenir
- il peut contenir 1 à 3 éléments maximum

### Exemples

Pour une phase 2 sommeil :

- signal du soir maintenu

Pour une phase 3 sommeil :

- signal du soir maintenu
- décharge mentale maintenue

## Structure Recommandée D'Une Phase

Chaque phase doit être pensée et affichée avec :

- un objectif global de transformation
- un objectif de phase
- un indicateur principal de phase
- un socle maintenu

## Forme Produit Recommandée

### En haut du plan

- objectif global de transformation

### Pour chaque phase

- titre de phase
- objectif de phase
- indicateur principal
- socle maintenu

## Exemple De Structure

```json
{
  "global_objective": "Retrouver un endormissement plus apaisé, plus précoce et plus régulier",
  "phase": {
    "title": "Réduire la charge mentale du soir",
    "phase_objective": "Décharger ce que le cerveau garde en circulation au moment du coucher",
    "primary_indicator": {
      "label": "Décharges mentales faites par semaine",
      "target": "4 soirs / semaine"
    },
    "maintained_foundation": [
      "Garder un signal de fin de journée cohérent"
    ]
  }
}
```

## Règle De Continuité

Une nouvelle phase ne doit jamais donner l'impression qu'on abandonne la précédente.

Elle doit :

- conserver le socle utile déjà construit
- ajouter une nouvelle couche
- élargir ou approfondir la capacité en construction

Formule mentale :

- phase 1 construit une base
- phase 2 consolide la base et ajoute une couche
- phase 3 stabilise l'ensemble et augmente la cohérence

## Ce Qu'Il Faut Éviter

## 1. Les phases-outils

Une phase ne doit pas être définie par un outil particulier.

Exemple à éviter :

- phase 1 = lumière
- phase 2 = journal
- phase 3 = audio

Pourquoi :

- cela donne une impression de check-list d'astuces
- cela masque la logique de progression réelle

## 2. Les objectifs trop locaux

Exemple :

- "éteindre la lumière"
- "écrire 3 pensées"
- "faire 20 minutes d'audio"

Ce sont des moyens, pas des objectifs de phase.

## 3. Les phases qui se remplacent

Exemple implicite à éviter :

- maintenant on fait la lumière
- ensuite on oublie la lumière et on fait le mental
- ensuite on oublie le mental et on fait l'audio

Une bonne progression n'est pas une suite de remplacements.
C'est une suite de constructions cumulatives.

## Règle De Design Produit

Chaque phase doit répondre explicitement à 2 questions :

### 1. Qu'est-ce qu'on construit maintenant ?

Réponse :

- objectif de phase

### 2. Qu'est-ce qu'on continue à tenir pendant qu'on construit ça ?

Réponse :

- socle maintenu

Si une phase ne répond pas à ces deux questions, elle est probablement mal construite.

## Relation Entre Objectif Global Et Objectifs De Phase

L'objectif global doit rester visible comme boussole.

Les objectifs de phase doivent être formulés de manière à montrer qu'ils sont :

- des marches
- des paliers
- des conditions de rapprochement

Autrement dit :

- l'objectif global n'est pas la somme plate des actions
- il est approché grâce à des paliers successifs

## Exemple Complet : Sommeil

### Objectif Global

Retrouver un endormissement plus apaisé, plus précoce et plus régulier.

### Phase 1

#### Objectif de phase

Réinstaller un vrai signal de fin de journée.

#### Indicateur principal

5 soirs par semaine avec un signal lumineux cohérent.

#### Socle maintenu

- aucun, car première phase

### Phase 2

#### Objectif de phase

Réduire la charge mentale qui déborde sur le coucher.

#### Indicateur principal

4 soirs par semaine avec décharge mentale faite avant le lit.

#### Socle maintenu

- garder un signal du soir cohérent

### Phase 3

#### Objectif de phase

Stabiliser un sas complet vers l'endormissement.

#### Indicateur principal

20 à 30 minutes de transition calme sur 5 soirs par semaine.

#### Socle maintenu

- garder un signal du soir cohérent
- maintenir la décharge mentale

## Heuristique De Construction Des Phases

Quand on construit un plan, il faut se poser dans cet ordre :

### 1. Quel est l'objectif global ?

Quel changement vécu veut-on obtenir à la fin de la transformation ?

### 2. Quels sont les 2 à 5 paliers nécessaires ?

Quelles capacités ou quels changements d'état doivent exister pour s'en approcher ?

### 3. Quel est le bon objectif de chaque phase ?

Comment nommer chaque palier de façon structurante ?

### 4. Quel indicateur principal permet de suivre ce palier ?

Quel signal simple montre que cette phase avance ?

### 5. Quel socle doit rester actif ?

Qu'est-ce qui doit continuer d'être tenu en arrière-plan ?

## Conséquence Sur Les Items De Plan

Les items de phase ne doivent pas définir la phase.

C'est l'inverse :

- la phase définit ce qu'on construit
- les items servent cette construction

Donc :

- les missions
- les habitudes
- les clarifications
- les supports

doivent être au service de l'objectif de phase, pas l'inverse.

## Conséquence Sur Le Prompt De Génération

Le générateur de plan doit produire explicitement :

- `global_objective`
- pour chaque phase :
  - `phase_objective`
  - `primary_indicator`
  - `maintained_foundation[]`

Et il doit respecter la règle suivante :

- une phase doit prolonger ou approfondir les précédentes
- elle ne doit pas simplement changer d'outil

## Recommandation V1

Pour la première version :

- 1 objectif global par transformation
- 1 objectif de phase par phase
- 1 indicateur principal par phase
- 0 à 3 éléments de socle maintenu par phase

Cela suffit largement pour transformer la qualité perçue du plan.

## Résultat Attendu

Si cette structure est bien appliquée :

- les phases paraîtront plus intelligentes
- le lien avec la transformation globale sera plus visible
- la continuité sera mieux ressentie
- les utilisateurs comprendront mieux ce qu'ils construisent
- les plans sembleront moins patchwork et plus organiques
