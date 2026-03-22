# Machine de momentum utilisateur - Phase 3

## Objectif

Stabiliser la classification avant tout branchement produit.

Cette phase introduit:

- de l'hystérèse sur les transitions lentes;
- une hiérarchie claire entre changements immédiats et changements différés;
- des cas canoniques de review;
- des tests de transitions critiques.

---

## Ce qui a été ajouté

### 1. Hystérèse sur les états lents

Les transitions lentes ne doivent plus bouger sur un seul signal faible.

En pratique:

- un user `momentum` ne tombe plus en `friction_legere` sur un simple `ok`;
- un user `friction_legere` ne tombe plus en `evitement` sur un seul tour faible;
- les dégradations routeur sont mises en attente avant confirmation.

La machine mémorise désormais:

- l'état stable actuel;
- un `pending_transition` éventuel;
- un compteur de confirmations;
- un `stable_since_at`.

### 2. Séparation routeur / watcher plus nette

Le routeur peut toujours:

- préempter immédiatement vers `soutien_emotionnel`;
- préempter immédiatement vers `pause_consentie`;
- remonter vite vers `momentum` si le user donne un signal fort de progression.

Le watcher reste l'autorité pour:

- confirmer les transitions lentes;
- consolider les dégradations sur fenêtre glissante;
- valider les états de fond comme `reactivation`.

### 3. Dégradations lissées

Le routeur ne saute plus brutalement plusieurs niveaux vers le bas.

Exemples:

- `momentum -> evitement` est d'abord ramené vers `friction_legere`;
- `friction_legere -> reactivation` est d'abord ramené vers `evitement`.

L'idée est simple:

- on ne veut pas qu'un seul tour fragile fasse "tomber l'utilisateur de deux étages".

### 4. États urgents sticky

Deux états restent volontairement collants:

- `pause_consentie`
- `soutien_emotionnel`

Le routeur ne peut pas les quitter sur un signal faible.

Exemples:

- un simple `ok` ne rouvre pas une relation après un stop explicite;
- une accalmie instantanée ne suffit pas à sortir durablement de `soutien_emotionnel`.

---

## Politique de transition V1 stabilisée

### Transitions immédiates

- toute montée vers `soutien_emotionnel`
- toute montée vers `pause_consentie`
- remontée vers `momentum` quand le routeur voit un signal fort:
  - progression `up`
  - consentement `open`
  - engagement `high`

### Transitions différées

- toutes les dégradations lentes issues du routeur
- sortie de `pause_consentie` sans signal de reprise fort
- sortie de `soutien_emotionnel` sans confirmation watcher

### Confirmation minimale

Pour les dégradations lentes côté routeur:

- 2 confirmations cohérentes sont demandées avant commit.

---

## Cas canoniques de review

### Cas 1. Faux négatif à éviter

User en souffrance:

- message très chargé;
- progression éventuellement bonne;
- consentement ouvert.

Attendu:

- `soutien_emotionnel` doit préempter tout le reste.

### Cas 2. Faux positif à éviter

User en `momentum` qui répond une seule fois:

- `ok`
- `oui`
- réponse minimale

Attendu:

- ne pas dégrader immédiatement.

### Cas 3. Friction réelle

User encore présent:

- répond;
- n'avance pas vraiment;
- ne refuse pas explicitement.

Attendu:

- `friction_legere`, pas `evitement`.

### Cas 4. Évitement réel

User encore là mais:

- réponses faibles répétées;
- reports fréquents;
- consentement fragile.

Attendu:

- `evitement`, pas `friction_legere`.

### Cas 5. Pause respectée

User a dit stop ou pause explicite.

Attendu:

- `pause_consentie` reste actif tant qu'il n'y a pas de vraie reprise.

### Cas 6. Décrochage

User silencieux depuis plusieurs jours sans pause explicite.

Attendu:

- `reactivation`.

---

## Vérifications ajoutées

Les tests couvrent désormais:

- stop explicite -> `pause_consentie`
- charge émotionnelle haute -> `soutien_emotionnel`
- progression claire -> `momentum`
- pause active profil -> `pause_consentie`
- un seul tour faible ne dégrade pas `momentum`
- deux tours faibles peuvent confirmer `momentum -> friction_legere`
- un tour très positif peut remonter vers `momentum`
- `pause_consentie` reste sticky sur un signal faible
- le watcher peut confirmer `evitement -> reactivation`

---

## Ce que la phase 3 débloque

La machine est maintenant assez stable pour:

- lancer une vraie review de perf;
- annoter des conversations réelles et comparer le state attendu vs observé;
- brancher ensuite des comportements produits par état avec moins de risque de jitter.

---

## Ce qui reste après la phase 3

- tuning des seuils sur données réelles;
- cas canoniques enrichis par exemples prod;
- éventuel classifieur IA dédié pour la charge émotionnelle;
- recalcul batch silencieux pour rendre `reactivation` plus fiable sans attendre une nouvelle activité;
- phase suivante: brancher la politique proactive par état.
