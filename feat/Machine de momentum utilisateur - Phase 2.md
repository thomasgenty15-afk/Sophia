# Machine de momentum utilisateur - Phase 2

## Objectif

Mettre en place le **pipeline technique d'identification** des états utilisateur, sans encore brancher de nouveaux comportements proactifs sur cette machine.

Cette phase 2 doit permettre:

- de calculer des signaux rapides à chaque tour user;
- de consolider des signaux lents côté watcher;
- de persister un état dérivé léger dans `user_chat_states.temp_memory`;
- de rendre l'état observable dans les logs de turn.

---

## Périmètre implémenté

### 1. Stockage

Le state est stocké dans:

- `user_chat_states.temp_memory.__momentum_state_v1`

Contenu principal:

- état dérivé courant;
- dimensions;
- métriques;
- logs de signaux rapides;
- métadonnées de dernière classification.

### 2. Calcul rapide côté routeur

À chaque message entrant user, le routeur:

- qualifie la réponse (`substantive`, `brief`, `minimal`);
- détecte une charge émotionnelle rapide;
- détecte un signal de consentement rapide;
- met à jour les logs courts de signaux;
- recalcule une lecture provisoire du state;
- persiste ce state dans `temp_memory`.

Important:

- ce calcul routeur est volontairement léger;
- il ne remplace pas la consolidation lente;
- il n'altère pas le comportement conversationnel actuel.

### 3. Consolidation lente côté watcher

Quand le watcher tourne, il:

- recharge l'état courant;
- lit les messages récents;
- lit les actions / entries récentes;
- lit les vitaux actifs et leurs entrées récentes;
- lit la pause profil si elle existe;
- reconstruit les 4 dimensions;
- reclassifie l'état final;
- réécrit le state consolidé dans `temp_memory`.

### 4. Observabilité

Le routeur injecte maintenant un résumé de la machine dans:

- le `turn_summary` payload;
- les traces de routing.

Cela sert de base pour la review comportementale et la perf plus tard.

---

## Répartition des responsabilités

### Routeur

Responsable de:

- la perception immédiate du tour;
- la charge émotionnelle rapide;
- le consentement explicite ou quasi-explicite;
- la qualité de réponse;
- la mise à jour du signal log.

### Watcher

Responsable de:

- l'engagement consolidé;
- la progression sur fenêtre glissante;
- la charge émotionnelle glissante;
- le consentement consolidé;
- la classification stable du state.

---

## Signaux effectivement utilisés en V1 technique

### Engagement

- récence des messages user;
- nombre de messages user récents;
- nombre de messages substantifs récents;
- répétition de réponses minimales.

### Progression

- actions complétées / manquées / partielles sur 7 jours;
- amélioration / dégradation de distance à la cible sur vitaux numériques, quand une cible existe.

### Charge émotionnelle

- signaux rapides détectés sur le tour courant;
- rolling window des tours émotionnellement chargés sur 72h.

### Consentement

- pauses actives en profil;
- stops explicites récents;
- soft declines récents;
- acceptations récentes.

---

## Fichiers ajoutés / modifiés

- `supabase/functions/sophia-brain/momentum_state.ts`
- `supabase/functions/sophia-brain/momentum_state_test.ts`
- `supabase/functions/sophia-brain/router/run.ts`
- `supabase/functions/sophia-brain/agents/watcher.ts`

---

## Limitations connues

### 1. Réactivation encore partielle

Le state `reactivation` est implémenté dans la logique de classification, mais il ne sera pleinement fiable que quand un scheduler ou un job dédié recalculera aussi l'état **sans nouveau message entrant**.

Aujourd'hui:

- le routeur recalcule quand le user parle;
- le watcher recalcule quand il y a eu de l'activité récente.

Donc le décrochage pur dans le silence n'est pas encore la meilleure source pour `reactivation`.

### 2. Charge émotionnelle encore simple

La détection rapide repose sur des heuristiques textuelles + les signaux safety existants.

Elle est suffisante pour une première instrumentation, mais devra être enrichie plus tard par un signal IA dédié si besoin.

### 3. Progression vitale limitée aux cas numériques

La progression sur vitaux n'est interprétée que lorsque:

- les valeurs sont numériques;
- une cible numérique existe.

Les vitaux non numériques restent neutres.

### 4. Aucun comportement produit nouveau

La machine est calculée et observée, mais:

- elle ne pilote pas encore les bilans;
- elle ne change pas encore les nudges;
- elle ne modifie pas encore la politique proactive.

C'est volontaire.

---

## Vérification minimale réalisée

- `deno test supabase/functions/sophia-brain/momentum_state_test.ts`
- `deno check supabase/functions/sophia-brain/momentum_state.ts supabase/functions/sophia-brain/router/run.ts supabase/functions/sophia-brain/agents/watcher.ts`

---

## Ce que débloque la phase 3

La phase 3 pourra maintenant porter sur:

- le tuning des seuils;
- la review des faux positifs / faux négatifs;
- les cas canoniques d'évaluation;
- puis seulement ensuite le branchement produit:
  - quoi envoyer à `momentum`
  - quoi envoyer à `friction_legere`
  - quoi interdire en `pause_consentie`
  - comment gérer `reactivation`.
