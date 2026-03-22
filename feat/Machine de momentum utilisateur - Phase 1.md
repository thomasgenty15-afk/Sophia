# Machine de momentum utilisateur - Phase 1

## Objectif

Définir la **spécification produit** de l'identification des états utilisateur, avant d'implémenter la détection runtime et avant de décider précisément des interventions associées.

Cette machine ne remplace pas les machines conversationnelles existantes.

Elle répond à une autre question:

**"Dans quelle situation relationnelle et comportementale se trouve ce user en ce moment ?"**

Le but est de sortir d'une logique "daily bilan par défaut" et de basculer vers une logique "état utilisateur -> geste relationnel approprié".

---

## Hors périmètre

Cette phase 1 ne couvre pas:

- le détail des messages à envoyer pour chaque état;
- le choix précis des triggers produits;
- l'implémentation technique détaillée;
- le tuning fin des seuils en production.

Cette phase 1 couvre:

- le vocabulaire;
- les 4 dimensions d'analyse;
- les niveaux de chaque dimension;
- les signaux d'entrée;
- le mapping vers 6 états dérivés;
- les règles de priorité;
- les invariants de conception.

---

## Principes de conception

### 1. L'intent n'est pas l'état

L'intent est un **signal d'entrée**, utile pour confirmer ou infléchir une lecture.

L'état est une **synthèse lente** de la situation du user.

Exemple:

- "j'ai pas eu le temps" peut être un indice de friction;
- "pas maintenant" peut être un indice de consentement fragile ou fermé;
- "ça va mieux" peut alléger la charge émotionnelle du tour;
- aucun de ces messages ne doit, à lui seul, définir tout l'état durable du user.

### 2. L'état est dérivé, pas stocké comme vérité première

On distingue 3 couches:

- **événements bruts**: messages, actions cochées, vitaux mis à jour, proactive envoyé/ignoré, pause explicite;
- **dimensions dérivées**: engagement, progression, charge émotionnelle, consentement;
- **état utilisateur final**: l'un des 6 états définis plus bas.

### 3. Deux vitesses de lecture

Le système combine:

- des **signaux rapides**, mis à jour au niveau du tour;
- des **signaux lents**, consolidés sur plusieurs jours.

Sans cette séparation, la machine devient trop nerveuse.

### 4. Les signaux IA sont autorisés, mais non souverains

Les signaux issus d'un classifieur IA servent surtout pour:

- la charge émotionnelle;
- le refus implicite;
- la qualité d'engagement d'une réponse;
- certaines formes d'évitement.

Les faits structurés doivent toujours primer quand ils existent.

### 5. Un seul état dérivé à la fois

La machine produit un seul état final actif, avec des priorités explicites.

---

## Vocabulaire

- **Événement brut**: fait observable qui survient dans le produit.
- **Signal**: interprétation simple d'un ou plusieurs événements.
- **Dimension**: axe d'analyse stable calculé à partir des signaux.
- **État dérivé**: classification finale du user.
- **Signal rapide**: signal pouvant changer à chaque message.
- **Signal lent**: signal calculé sur une fenêtre glissante.
- **Hystérèse**: règle empêchant un changement d'état sur un seul signal faible.

---

## Les 4 dimensions

### 1. Engagement

### Définition

L'engagement mesure à quel point le user est encore activement en relation avec Sophia.

Ce n'est pas seulement le taux de réponse.

Il s'agit d'un mélange de:

- réactivité;
- régularité de réponse;
- qualité de réponse;
- initiative spontanée.

### Signaux d'entrée

- temps depuis le dernier message entrant;
- taux de réponse aux dernières sollicitations proactives;
- longueur et densité informationnelle des réponses;
- présence de réponses purement minimales ("ok", "oui", emoji, acquittement);
- existence de messages initiés par le user sans relance;
- répétition de messages très courts sans suivi.

### Fenêtres d'observation

- **micro**: 24 à 72 heures pour la réactivité immédiate;
- **macro**: 7 jours pour l'engagement cumulé.

### Niveaux

- **high**
  - réponse récente;
  - plusieurs réponses substantielles;
  - ou initiative spontanée récente.
- **medium**
  - réponses présentes mais irrégulières, brèves ou peu investies.
- **low**
  - silence prolongé;
  - ou plusieurs sollicitations ignorées;
  - ou réponses minimales répétées sans réelle reprise.

### Règle produit

Un user qui répond souvent mais seulement par acquittements ne doit pas être classé automatiquement en engagement haut.

---

### 2. Progression

### Définition

La progression mesure s'il existe des **indices de mouvement réel** sur le plan du user.

Elle ne mesure ni la motivation déclarée, ni le niveau de parole.

### Signaux d'entrée

- actions complétées;
- actions manquées;
- streaks de régularité;
- activation puis exécution d'actions;
- évolution des vitaux quand ils existent;
- progrès explicitement déclarés par le user, si aucun signal structuré n'est disponible;
- détérioration répétée ou stagnation persistante.

### Fenêtres d'observation

- **7 jours** pour les actions et micro-progrès;
- **7 à 14 jours** pour les tendances de vitaux.

### Niveaux

- **up**
  - au moins un signal crédible de progression réelle;
  - sans signal dominant de régression.
- **flat**
  - peu de mouvement visible;
  - pas de dégradation claire;
  - situation stable ou ambiguë.
- **down**
  - accumulation de ratés;
  - ou dégradation visible des vitaux;
  - ou absence prolongée de mouvement sur un plan pourtant actif.
- **unknown**
  - pas assez de données;
  - user récent;
  - instrumentation insuffisante.

### Règle produit

`unknown` n'est pas égal à `down`.

Un manque de données ne doit jamais être traité comme un échec.

---

### 3. Charge émotionnelle

### Définition

La charge émotionnelle mesure à quel point le contexte psychologique rend inadaptée ou risquée une logique de pilotage, d'accountability ou de challenge.

### Signaux d'entrée

- détresse explicite;
- surcharge, débordement, fatigue extrême;
- événement difficile en cours;
- ton émotionnel lourd persistant;
- besoin manifeste d'écoute ou de stabilisation;
- signaux de sécurité déjà produits par le routeur.

### Fenêtres d'observation

- **turn-level**: lecture du dernier message;
- **rolling**: consolidation sur 24 à 72 heures.

### Niveaux

- **high**
  - contexte incompatible avec une logique de performance;
  - détresse, crise, surcharge forte, événement très actif.
- **medium**
  - fatigue notable, tension, charge réelle mais non aiguë.
- **low**
  - pas de charge émotionnelle structurante détectée.

### Règle produit

Un signal `high` sur le tour courant peut surclasser immédiatement l'état final, même si la tendance lente était basse.

---

### 4. Consentement

### Définition

Le consentement mesure dans quelle mesure le user accepte actuellement d'être relancé, guidé, challengé ou invité à reprendre un suivi.

Ce n'est pas seulement une pause binaire.

### Signaux d'entrée

- refus explicites: "stop", "pas maintenant", "laisse-moi", "on verra plus tard";
- pause active;
- refus répétés d'ouvrir un bilan ou une relance;
- sollicitations ignorées de façon répétée;
- acceptation récente d'un proactive;
- reprise volontaire d'un échange après une relance;
- récupération de relation après un refus précédent.

### Fenêtres d'observation

- **immédiate**: dernier tour ou dernière interaction explicite;
- **7 jours** pour les signaux implicites répétés.

### Niveaux

- **open**
  - pas de refus récent bloquant;
  - plusieurs indices que le user accepte l'échange.
- **fragile**
  - ambiguïté;
  - un ou plusieurs reports récents;
  - réponses faibles après sollicitation;
  - risque de sur-sollicitation.
- **closed**
  - pause explicite active;
  - ou refus clair et récent;
  - ou séquence nette indiquant qu'il faut arrêter d'insister.

### Règle produit

Le consentement explicite prime sur toute inférence IA.

---

## Synthèse: nature des dimensions

| Dimension | Nature principale | Source dominante |
| --- | --- | --- |
| Engagement | lente + un peu rapide | timestamps, taux de réponse, qualité de réponse |
| Progression | lente | données actions + vitaux + déclaratif cadré |
| Charge émotionnelle | rapide + consolidation courte | classifieur IA + signaux sécurité |
| Consentement | rapide + consolidation moyenne | explicite user + historique récent de refus/acceptation |

---

## Les 6 états dérivés

### 1. momentum

### Définition

Le user est engagé et il existe un mouvement réel ou crédible.

### Signature attendue

- engagement `high` ou `medium`;
- progression `up`;
- charge émotionnelle `low` ou `medium`;
- consentement `open`.

---

### 2. friction_legere

### Définition

Le user est toujours dans la relation, mais la progression est faible, floue ou ralentie.

### Signature attendue

- engagement `high` ou `medium`;
- progression `flat` ou `down` léger;
- charge émotionnelle `low` ou `medium`;
- consentement `open`.

---

### 3. evitement

### Définition

Le user reste présent, mais contourne le réel, reporte ou répond de façon peu investie.

### Signature attendue

- engagement `medium` ou `low`;
- progression `flat` ou `down`;
- charge émotionnelle `low` ou `medium`;
- consentement `fragile`.

### Note

L'évitement n'est pas la même chose que la détresse.

---

### 4. pause_consentie

### Définition

Le user a explicitement demandé qu'on arrête, qu'on attende, ou qu'on baisse fortement la pression.

### Signature attendue

- consentement `closed`;
- sauf si charge émotionnelle `high`, qui prend priorité sous forme de `soutien_emotionnel`.

---

### 5. soutien_emotionnel

### Définition

Le contexte impose une lecture d'abord émotionnelle, stabilisante ou protectrice.

### Signature attendue

- charge émotionnelle `high`.

### Note

Cet état surclasse les lectures de progression et d'engagement.

---

### 6. reactivation

### Définition

Le user n'est plus vraiment en relation active avec Sophia, sans avoir forcément fermé la porte explicitement.

### Signature attendue

- engagement `low`;
- consentement différent de `closed`;
- absence de contexte émotionnel fort actif;
- signes de silence ou de décrochage prolongé.

---

## Priorité des états

L'ordre de priorité doit être strict:

1. `soutien_emotionnel`
2. `pause_consentie`
3. `reactivation`
4. `momentum`
5. `friction_legere`
6. `evitement`

## Pourquoi cet ordre

- `soutien_emotionnel` préempte tout.
- `pause_consentie` doit bloquer toute pression relationnelle.
- `reactivation` ne doit exister que si le user n'est plus vraiment engagé.
- `momentum` et `friction_legere` concernent des users encore dans la relation.
- `evitement` reste un état relationnel actif, mais plus fragile.

---

## Règles de mapping V1

### Étape 1: surclassement prioritaire

- si charge émotionnelle = `high` -> `soutien_emotionnel`
- sinon si consentement = `closed` -> `pause_consentie`
- sinon si engagement = `low` et contexte de silence/décrochage prolongé -> `reactivation`

### Étape 2: lecture du coeur relationnel

- si progression = `up` et consentement = `open` et engagement != `low` -> `momentum`
- sinon si consentement = `open` et engagement != `low` -> `friction_legere`
- sinon -> `evitement`

## Interprétation

`friction_legere` est le défaut pour un user encore là, encore ouvert, mais pas franchement en progrès.

`evitement` devient le défaut quand le user reste dans la zone grise: présent, peu avancé, consentement fragile, réponses peu investies.

---

## Déterministe vs IA

### Signaux déterministes prioritaires

- timestamps de messages entrants et sortants;
- actions complétées / manquées;
- évolution structurée des vitaux;
- pause active;
- refus explicite;
- nombre de sollicitations ignorées;
- relance acceptée ou non.

### Signaux IA autorisés

- charge émotionnelle du tour;
- refus implicite;
- qualité réelle d'une réponse;
- indice d'évitement;
- intent conversationnel.

### Règle de fusion

- un fait explicite prime toujours sur une inférence IA;
- un signal IA faible ne doit pas, seul, faire basculer une dimension lente;
- un signal IA fort sur la sécurité ou la charge émotionnelle peut préempter immédiatement.

---

## Hystérèse et stabilité

La machine doit éviter les oscillations.

### Règles V1

- ne pas faire basculer une dimension lente sur un seul signal faible;
- permettre un surclassement immédiat seulement pour:
  - sécurité;
  - charge émotionnelle haute;
  - refus explicite;
- faire décroître les signaux anciens;
- exiger de la confirmation pour les transitions lentes:
  - `momentum -> friction_legere`
  - `friction_legere -> evitement`
  - `evitement -> reactivation`

---

## Déclencheurs de recalcul à prévoir en phase 2

La machine ne doit pas recalculer "en permanence", mais à chaque événement important:

- message entrant du user;
- proactive envoyé;
- proactive ignoré;
- action complétée ou manquée;
- vital mis à jour;
- pause explicite;
- refus explicite ou implicite détecté;
- consolidation périodique.

---

## Signaux existants réutilisables dans le système actuel

Le système possède déjà plusieurs briques utiles:

- récence des messages entrants et sortants;
- pause active côté coaching / bilan;
- streaks de ratés sur actions;
- winback progressif;
- état des bilans en cours;
- signaux de sécurité et d'interruption dans le routeur.

La phase 2 devra partir de ces signaux existants avant d'ajouter de nouvelles couches.

---

## Invariants produit

- Un user ne peut avoir qu'un seul état dérivé actif à la fois.
- `charge_emotionnelle = high` force `soutien_emotionnel`.
- `consentement = closed` interdit toute logique d'insistance.
- `progression = unknown` ne doit jamais être interprété comme un échec.
- `reactivation` ne s'applique pas si une pause explicite est active.
- Un seul signal IA faible ne doit pas suffire à reclasser un état lent.
- Les signaux explicites du user ont priorité sur les inférences.

---

## Sortie attendue de la phase 1

À l'issue de cette phase, on doit considérer comme figés:

- les 4 dimensions;
- leurs niveaux;
- les signaux admissibles;
- les règles de priorité;
- les 6 états;
- le mapping V1 dimensions -> état.

La phase 2 pourra alors implémenter:

- la collecte de signaux;
- le recalcul à chaque événement;
- la consolidation lente;
- l'observabilité.

---

## Résumé court

La machine de momentum utilisateur repose sur 4 dimensions:

- engagement;
- progression;
- charge émotionnelle;
- consentement.

Ces dimensions produisent 6 états finaux:

- `momentum`
- `friction_legere`
- `evitement`
- `pause_consentie`
- `soutien_emotionnel`
- `reactivation`

Le système est:

- **dérivé**, pas purement déclaratif;
- **hybride**, déterministe + IA;
- **événementiel**, pas recalculé en boucle;
- **stable**, grâce aux priorités et à l'hystérèse.
