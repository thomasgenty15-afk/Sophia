# V1 Plan Orchestrateur Dynamique

## Intention

Faire évoluer le plan d'une simple liste d'actions vers un système d'orchestration capable de :

- rediriger l'utilisateur vers le bon module au bon moment
- préremplir certains outils quand la confiance est suffisante
- laisser l'utilisateur valider ou corriger
- compter cette validation comme une vraie action utile
- décharger Sophia et Willy du routage mécanique

Le plan ne dit plus seulement "quoi faire".
Il peut aussi dire "où aller", "quoi vérifier", "quoi compléter" et "quoi valider".

## Idée Centrale

Un item de plan peut devenir une porte d'entrée vers :

- le laboratoire
- l'atelier d'inspiration
- un outil spécifique
- une ressource spécifique
- une hypothèse déjà préremplie

Le système prépare.
L'utilisateur confirme.
La progression est créditée.

## Pourquoi C'est Fort

### 1. Cela réduit la friction

L'utilisateur n'arrive pas devant une page vide.
Il arrive sur quelque chose de déjà préparé.

### 2. Cela garde l'agence côté utilisateur

Le système ne décide pas totalement à sa place.
Il propose, l'utilisateur valide, corrige ou complète.

### 3. Cela crée une micro-victoire

Le simple fait de :

- voir que quelque chose a déjà été préparé
- le reconnaître comme juste
- le confirmer

peut produire une vraie sensation d'avancée.

### 4. Cela rend le plan réellement vivant

Le plan devient une map dynamique entre :

- l'intention
- les outils
- les modules
- les actions réelles

## Hypothèse Produit

Dans de nombreux cas, "aller voir", "vérifier", "valider", "compléter" ou "corriger" un objet prérempli est déjà une action utile.

Ce n'est pas une sous-action.
C'est une vraie unité de progression.

Mais il faut distinguer plusieurs niveaux de complétion.

## Niveaux De Progression

Le système ne doit pas tout marquer comme "fait" au simple clic.

On distingue :

### `seen`

L'utilisateur a vu l'élément ou la surface.

Exemple :

- il ouvre une carte
- il consulte un framework

### `opened`

L'utilisateur est entré dans le bon module ou le bon outil.

Exemple :

- il ouvre le laboratoire sur la bonne carte
- il ouvre l'atelier d'inspiration sur le bon framework

### `engaged`

L'utilisateur a commencé une interaction significative.

Exemple :

- il modifie un champ
- il choisit une option
- il parcourt les éléments proposés

### `validated`

L'utilisateur confirme que la proposition lui correspond.

Exemple :

- il valide une carte de défense préremplie
- il confirme une hypothèse proposée par Sophia

### `completed`

L'action prévue par le plan est réellement terminée.

Exemple :

- l'outil est validé
- la carte est personnalisée
- la ressource a été lue jusqu'à un certain niveau d'engagement
- la mission réelle a été effectuée

## Règle Produit Recommandée

Par défaut :

- `open_module` -> completion au niveau `opened`
- `review_prefilled_tool` -> completion au niveau `validated`
- `complete_tool` -> completion au niveau `completed`
- `read_framework` -> completion au niveau `engaged` ou `completed` selon la profondeur

## Nouvelle Vision Des Items De Plan

Le plan doit supporter plusieurs natures d'items.

## Types D'Items V1

### 1. `real_world_action`

Action à faire dans la vraie vie.

Exemples :

- appeler quelqu'un
- aller marcher
- préparer un message
- retirer un produit déclencheur

### 2. `open_module`

Action consistant à ouvrir une surface pertinente.

Exemples :

- aller dans le laboratoire
- aller dans l'atelier d'inspiration
- ouvrir la page d'un outil ciblé

### 3. `review_prefilled_tool`

Action consistant à revoir une proposition déjà préparée.

Exemples :

- valider une carte de défense déjà générée
- revoir des déclencheurs probables
- confirmer une séquence d'action proposée

### 4. `complete_tool`

Action consistant à remplir ou finaliser un outil.

Exemples :

- compléter une carte de défense
- construire un protocole
- renseigner un outil de clarification

### 5. `read_framework`

Action consistant à consulter un cadre de compréhension ou d'action.

Exemples :

- lire un framework sur les cravings
- lire un cadre sur les conversations difficiles
- lire une structure de préparation mentale

### 6. `validate_hypothesis`

Action consistant à confirmer ou corriger une hypothèse préparée par Sophia.

Exemples :

- "Ces 3 déclencheurs te ressemblent-ils ?"
- "Ces 2 situations sont-elles les plus à risque ?"

## Shape Produit Recommandée

Exemple conceptuel :

```json
{
  "kind": "review_prefilled_tool",
  "target_surface": "laboratoire",
  "target_entity_type": "defense_card",
  "target_entity_id": "card_123",
  "title": "Valider tes cartes de défense",
  "description": "Sophia a préparé des cartes de défense probables pour tes moments de pulsion. Vérifie-les et corrige-les si besoin.",
  "prefill_payload": {
    "suspected_triggers": ["soirée seul", "stress après travail"],
    "confidence": 0.86
  },
  "completion_mode": "validate_or_edit",
  "success_event": "tool_validated"
}
```

## Préremplissage Et Confiance

Le système peut préremplir quand il a une confiance suffisante.

Exemples de sources de confiance :

- questionnaire
- historique des conversations
- transformation active
- blocages récurrents
- patterns déjà observés

Mais il ne faut pas basculer dans l'automatisation silencieuse.

## Règle Recommandée

### Confiance faible

- proposer
- ne pas préremplir fortement
- demander une création ou une sélection manuelle

### Confiance moyenne

- proposer 2 ou 3 hypothèses
- laisser l'utilisateur choisir ou corriger

### Confiance élevée

- préremplir une version probable
- demander validation ou ajustement

## Exemples Par Cas

### Cas Addiction

Le plan détecte qu'un framework sur les pulsions est pertinent.

Il peut créer :

- `open_module` vers le laboratoire > outils
- puis `review_prefilled_tool` sur des cartes de défense déjà proposées

Exemple :

- "Va valider les 3 cartes de défense que Sophia a préparées pour tes moments à risque"

La completion peut être déclenchée quand :

- au moins 1 carte est validée
- ou 3 cartes sont confirmées / corrigées

### Cas Deuil

Le plan ne parle pas de pulsion.

Il peut rediriger vers :

- un outil d'ancrage
- une carte de soutien pour moments de vague émotionnelle
- un cadre sur la reprise de contact avec le vivant

Exemple :

- "Va revoir les appuis que Sophia a préparés pour les moments de sidération ou de solitude"

### Cas Carrière

Le plan peut rediriger vers :

- un outil de préparation de conversation
- un cadre de preuve de valeur
- un guide d'argumentaire

Exemple :

- "Va compléter la trame d'augmentation déjà préparée"

### Cas Relations

Le plan peut rediriger vers :

- un outil de clarification de limite
- une préparation de conversation
- un cadre de tri relationnel

## Le Plan Comme Map De Redirection

Le plan peut devenir un routeur dynamique.

Cela signifie :

- il sait où envoyer l'utilisateur
- il sait pourquoi
- il sait sur quel objet
- il sait quel événement valide l'action

Le plan n'est plus séparé du reste du produit.
Il devient la carte qui relie les surfaces utiles.

## Complétion Automatique Par Événement

Une action du plan peut se compléter automatiquement quand un événement précis se produit.

Exemples :

- ouverture d'un outil ciblé
- validation d'une carte
- lecture d'un framework jusqu'à un seuil
- édition d'un objet prérempli

### Exemples d'événements

- `module_opened`
- `tool_opened`
- `tool_edited`
- `tool_validated`
- `framework_viewed`
- `framework_completed`

## Règle V1 Recommandée

Le moteur du plan ne détermine pas seulement la mission.
Il détermine aussi :

- la surface cible
- le mode de complétion
- le signal de succès

## Gestion Des Blocages

Si le système détecte qu'une personne bloque, il peut générer une action de redirection adaptée.

Exemple :

- elle n'avance pas depuis 5 jours
- elle évite une mission
- elle stagne après plusieurs check-ins

Alors le système peut créer une action comme :

- "Va revoir la carte de défense associée à ce blocage"
- "Va compléter l'outil de clarification avant de reprendre la mission"
- "Va consulter le framework recommandé pour débloquer la prochaine étape"

## Effet Recherché

On ne demande pas seulement :

- "fais plus"

On propose :

- "va au bon endroit pour débloquer la suite"

## Rôle De Sophia Et Rôle De Willy

## Sophia

Sophia reste le cerveau produit global :

- comprend la trajectoire
- prépare
- propose
- orchestre

## Willy

Willy ne doit pas être chargé du routage mécanique permanent.

Son rôle devrait être :

- coach tactique
- régulateur
- lecteur de situation
- soutien en période de stress
- priorisateur humainement crédible

Willy ne devrait pas être celui qui pense à ouvrir tous les modules ou à pousser tous les outils.

Le système de plan dynamique s'en charge.
Willy intervient quand il y a besoin de discernement, de soutien ou d'ajustement.

## Répartition Recommandée

### Plan Engine

- choisit la prochaine action
- choisit s'il faut rediriger vers une surface
- choisit si l'action est réelle, guidée ou validative

### Laboratoire

- héberge les outils
- reçoit les redirections
- gère les objets préremplis
- remonte les événements de validation et de complétion

### Atelier D'Inspiration

- héberge les frameworks
- sert à ouvrir une perspective, une structure ou une compréhension

### Willy

- aide à traverser
- aide à prioriser
- aide à re-réguler
- ne gère pas le routage bas niveau

## Règles De Design Produit

### 1. Préparer sans imposer

Le système peut proposer fortement.
Il ne doit pas agir comme si tout était déjà vrai.

### 2. Récompenser la validation

Confirmer, corriger ou compléter une proposition est déjà une action.
Cela doit compter dans la progression.

### 3. Ne pas sur-marquer comme terminé

Un simple clic ne doit pas toujours suffire.
Le niveau de complétion doit dépendre du type d'item.

### 4. Réduire le vide

L'utilisateur doit arriver sur des surfaces déjà orientées.
Moins de friction, plus de traction.

### 5. Garder des micro-victoires visibles

Le système doit rendre visible que :

- quelque chose a été préparé
- l'utilisateur l'a validé
- cela a réellement compté

## V1 Recommandée

Commencer petit.

### À implémenter d'abord

- `open_module`
- `review_prefilled_tool`
- `complete_tool`
- remontée automatique des événements de validation
- affichage des actions du plan comme redirections vivantes

### Exemples V1 concrets

- aller valider des cartes de défense
- aller compléter un outil de clarification
- aller lire un framework recommandé
- aller revoir une proposition déjà préparée

## À Ne Pas Faire Tout De Suite

- automatiser toutes les validations
- multiplier trop de types d'items
- construire une logique de scoring trop complexe
- traiter tous les clics comme des complétions pleines

## Résultat Attendu

Si cette logique est bien exécutée :

- le plan devient réellement dynamique
- le laboratoire s'insère naturellement dans l'exécution
- l'atelier d'inspiration devient actionnable
- l'utilisateur ressent davantage de progression
- Willy est déchargé du routage mécanique
- Sophia peut concentrer son intelligence sur ce qui a le plus de valeur
