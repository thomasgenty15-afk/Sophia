# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `daily-d1-trigger-single-2026-05-13-r2`
- Persona: paul
- Objectif: Test D1.1 daily minimal, une seule action, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 1 target, puis continuation conversationnelle minimum 5 tours user.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `true`
- pending_id decouvert/genere au runtime: `24d51850-6632-40fb-8774-64390c77764f`
- targets.length: `1`
- local_date: `2026-05-17`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d1-trigger-single-2026-05-13-r2.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Petit check du soir : est-ce que tu as fait "Faire une session de travail focus (2h)" ?
> 
> Reponds librement. Si ce n'est pas fait et que ca reste utile, je regarderai si ca peut etre decale demain.

### Tour 1

**User**
> Oui, je l'ai faite. J'ai tenu les deux heures complètes, même si le démarrage m'a demandé un effort.

### Tour 1

**Sophia**
> C'est note : Faire une session de travail focus (2h): faite.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `9`
- assistant_message_count: `1`

### Tour 2

**User**
> Parfait. Pour le bilan, retiens surtout que l'action est faite, mais que j'ai perdu environ quinze minutes avant de vraiment lancer le focus.

### Tour 2

**Sophia**
> On ne cherche pas encore la solution parfaite. On cherche le point exact ou ca bloque: demarrage, energie, flou, peur, ou environnement.
> 
> Concrètement, je parle d'une Carte d'attaque pour "Faire une session de travail focus (2h)", à préparer seulement si tu confirmes.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `10`
- assistant_message_count: `1`

### Tour 3

**User**
> Pas de carte ce soir. Je veux juste que ce soit noté comme info pour le bilan weekly : fait, mais démarrage coûteux.

### Tour 3

**Sophia**
> On ne cherche pas encore la solution parfaite. On cherche le point exact ou ca bloque: demarrage, energie, flou, peur, ou environnement.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `11`
- assistant_message_count: `1`

### Tour 4

**User**
> C'est vraiment le démarrage. Une fois lancé, je reste concentré. Le problème c'est le passage entre décider de m'y mettre et ouvrir le bon document.

### Tour 4

**Sophia**
> On ne cherche pas encore la solution parfaite. On cherche le point exact ou ca bloque: demarrage, energie, flou, peur, ou environnement.
> 
> Concrètement, je parle d'une Carte d'attaque pour "Faire une session de travail focus (2h)", à préparer seulement si tu confirmes.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `11`
- assistant_message_count: `1`

### Tour 5

**User**
> Ok, dernière vérification : dans le daily, cette action est bien enregistrée comme faite, avec la note démarrage difficile ?

### Tour 5

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
> 
> Preparer le terrain
> Prepare l'environnement de "Faire une session de travail focus (2h)" pendant 2 minutes, sans obligation d'aller plus loin.
> 
> Mode d'emploi: Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.
> 
> Tu veux que je cree cette carte ?
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `12`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 0: Sophia ouvre bien la conversation elle-même depuis le trigger daily, avec une seule action claire à checker.
- Tour 1: Sophia comprend correctement le statut principal. L'action est enregistrée comme `faite`, sans reproduire l'ancien bug `commencée, pas terminée`.
- Le ton du check initial est court, simple, et laisse bien une réponse libre.

**Problemes**
- Tour 2: le user demande explicitement de retenir une nuance pour le bilan weekly, mais Sophia répond par une question de diagnostic et une offre de Carte d'attaque. Impact: elle ne confirme pas la prise en note de l'information demandée. Sévérité: yellow/red.
- Tour 3: le user refuse explicitement la carte et répète qu'il veut seulement que ce soit noté. Sophia ne confirme toujours pas la note et répète la même grille. Impact: elle ne sait pas s'arrêter après un refus d'opération. Sévérité: red.
- Tour 4: le user répond au diagnostic, mais Sophia répète encore la même phrase et repropose la carte. Impact: boucle conversationnelle, faible adaptation. Sévérité: red.
- Tour 5: le user pose une question factuelle de vérification du daily. Sophia lance un pending de création de Carte d'attaque au lieu de répondre. Impact: hors sujet et dangereux pour la confiance dans le bilan. Sévérité: red.

**Fix propose**
- Ajouter un état post-daily court: après traitement du pending, si le user demande "note pour le bilan" ou "vérifie le statut", Sophia doit répondre factuellement avant toute opportunité.
- Après un refus explicite d'opération ("pas de carte"), supprimer/suspendre l'opportunité pendant quelques tours.
- Autoriser l'offre Carte d'attaque seulement après avoir accusé réception de la donnée daily demandée, et sous forme d'une question optionnelle unique.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 0: pending `daily_action_review` généré dynamiquement avec `targets.length=1`.
- Tour 1: pending traité correctement via `daily_action_review_v1`; `pending_status=done`.
- Tours 2-5: après le pending, la conversation bascule en réponse brain WhatsApp normale, mais le contexte daily n'est pas assez priorisé pour les demandes de note/vérification.

**Skills / Operations / Tools**
- Tour 1: le parser daily classe correctement `outcome=completed`.
- Tours 2 et 4: opportunité Carte d'attaque détectée sur friction de démarrage. Le signal est pertinent, mais l'offre n'est pas priorisée correctement par rapport à la demande de prise en note.
- Tour 5: un flow `prepare_attack_card` démarre alors que le user demande une vérification factuelle. C'est le mauvais comportement.

**Memory / Effets durables**
- Occurrence cible `f77106df-2119-479f-8819-2f4d91fa3975`: `status=done`.
- Entry daily principale: `entry_kind=checkin`, `outcome=completed`, `metadata.source=daily_action_review_v1`, `matched_user_text` contient la réponse du tour 1.
- Limite observée: la nuance "démarrage difficile / quinze minutes perdues" n'apparaît pas comme note structurée dans l'entry daily principale (`reason_text=null`, `reason_category=none`).
- Des entries `router_parallel_tracking_v2` supplémentaires sont créées ensuite sur le même item, ce qui risque de bruiter les données weekly.

**Problemes**
- Tour 2: absence de stockage structuré visible de la nuance demandée pour le weekly. Impact système: le weekly peut savoir que l'action est faite, mais pas forcément pourquoi elle a coûté. Sévérité: yellow.
- Tours 2-5: tracking parallèle ajoute des entries `completed` répétées. Impact système: bruit durable autour du même fait. Sévérité: yellow.
- Tour 5: mauvaise priorisation route/operation; une vérification de statut daily devient un draft de Carte d'attaque. Impact système: red.

**Fix propose**
- Étendre `daily_action_review_v1` ou le post-daily handler pour stocker les nuances qualitatives après le premier check: `reason_text`, `friction_type`, `weekly_note`, ou équivalent déterministe.
- Ajouter une garde dans le routeur: si le message contient une vérification de statut daily ("bien enregistré comme fait", "tu l'as noté ?"), répondre factuellement depuis les données récentes et ne pas lancer d'opération.
- Dédupliquer ou bloquer `router_parallel_tracking_v2` sur les tours post-daily qui commentent la même action déjà traitée.

## Verdict Global

- Verdict: red
- Raison principale: le check initial fonctionne et enregistre bien l'action comme faite, mais la suite post-daily ne sait pas gérer "note ça pour le weekly" ni "vérifie le statut" sans partir en boucle Carte d'attaque.
- Follow-up prioritaire: créer une vraie couche post-daily courte qui priorise confirmation factuelle, stockage de nuance, et arrêt après refus d'opération.
