# Machine de momentum utilisateur - Observability Phase 1

## Objectif

Définir le **contrat d'observabilité v1** du système de momentum utilisateur avant d'implémenter :

- l'instrumentation runtime ;
- l'export d'audit ;
- le guide d'analyse final.

L'objectif est d'obtenir une base suffisamment rigoureuse pour pouvoir auditer toute la chaîne momentum/proactive de bout en bout, de la classification d'état jusqu'à la réaction du user.

Ce document joue le même rôle que la spec mémoire avant la création du bundle d'audit :

- il fixe ce qu'on veut observer ;
- il fixe comment nommer les événements ;
- il fixe quelles questions l'audit devra permettre de trancher ;
- il évite d'ajouter des logs incomplets ou non corrélables.

---

## Ce que doit permettre un bon système d'observabilité momentum

Une bonne observabilité momentum doit permettre de répondre à toutes les questions suivantes :

- Quel état momentum le système a-t-il attribué au user à chaque moment significatif ?
- Quelles dimensions ont conduit à cet état ?
- Quelle transition a été proposée, confirmée ou rejetée ?
- Quel composant a fait bouger l'état :
  - routeur
  - watcher
  - trigger quotidien
  - trigger hebdo
- Le système a-t-il autorisé un bilan, bloqué un bilan ou programmé un autre geste ?
- Si un bilan a été bloqué, pour quelle raison exacte ?
- Si un outreach a été programmé, pour quel état et avec quelle consigne ?
- Cet outreach a-t-il été réellement envoyé, différé, annulé, throttlé ou ignoré ?
- Le user a-t-il répondu après ce geste ?
- Cette réponse a-t-elle confirmé que la branche choisie était pertinente ?
- Y a-t-il des branches trop fréquentes, jamais utilisées ou visiblement mauvaises ?

Si l'observabilité permet de répondre proprement à ces questions, alors on pourra faire un vrai audit produit du système.

---

## Hors périmètre

Cette phase 1 ne couvre pas :

- le stockage SQL final des événements ;
- l'export JSON / transcript ;
- la commande d'export ;
- le guide d'audit final ;
- le tuning des seuils produit.

Cette phase 1 couvre :

- les objets à observer ;
- la taxonomie d'événements ;
- les champs minimums de chaque événement ;
- la corrélation entre événements ;
- le scorecard attendu à terme ;
- les invariants d'observabilité.

---

## Principe général

L'observabilité momentum doit suivre 5 niveaux :

1. **lecture**
   - ce que le système a vu
2. **classification**
   - ce que le système en a conclu
3. **décision proactive**
   - ce que le système a décidé de faire ou ne pas faire
4. **delivery**
   - ce qui a réellement été programmé / envoyé
5. **effet**
   - comment le user a réagi ensuite

Le système d'audit doit donc permettre de reconstruire une chaîne causale complète :

`signaux -> dimensions -> état -> décision -> message -> réaction -> nouvel état`

---

## Objets d'audit à couvrir

Le bundle d'audit momentum devra contenir au minimum les objets suivants.

### 1. State Timeline

Chronologie des états momentum du user.

But :

- voir quand l'état change ;
- voir qui l'a changé ;
- voir si la machine oscille ;
- voir si les transitions sont cohérentes.

### 2. Dimension Updates

Historique des recalculs des 4 dimensions :

- `engagement`
- `progression`
- `charge_emotionnelle`
- `consentement`

But :

- comprendre pourquoi un état a changé ;
- isoler les dimensions trop nerveuses ou trop aveugles ;
- distinguer erreur de classification d'état et erreur d'estimation de dimension.

### 3. State Transitions

Historique des transitions :

- proposées ;
- différées ;
- confirmées ;
- rejetées ;
- prioritaires.

But :

- auditer l'hystérèse ;
- repérer les faux positifs de transition ;
- comprendre les changements d'état brusques.

### 4. Proactive Decisions

Décisions prises par les triggers ou sélecteurs proactifs :

- `allow`
- `skip`
- `schedule_outreach`

But :

- vérifier que les bilans ne partent plus dans les mauvais états ;
- vérifier que les branches produit sont respectées ;
- mesurer la pression relationnelle réelle exercée par le système.

### 5. Outreach Schedules

Historique des outreachs non-bilan programmés par état.

But :

- savoir quel geste a été choisi ;
- vérifier les cooldowns ;
- vérifier que les bons états débouchent sur les bons gestes.

### 6. Deliveries

Historique des effets de livraison :

- scheduled
- sent
- deferred
- cancelled
- throttled
- skipped
- failed

But :

- ne pas confondre décision produit et exécution transport ;
- auditer les pertes réelles entre décision et envoi.

### 7. User Reactions

Historique des réactions user après proactive momentum.

But :

- relier la qualité du geste à la réponse réelle ;
- mesurer si une branche ouvre, ferme ou dégrade la relation ;
- vérifier si le nouvel état après réaction est cohérent.

---

## Taxonomie d'événements v1

### A. Événements de classification

- `router_momentum_state_applied`
- `watcher_momentum_state_consolidated`
- `momentum_transition_pending`
- `momentum_transition_confirmed`
- `momentum_transition_rejected`

### B. Événements de décision proactive

- `daily_bilan_momentum_decision`
- `weekly_bilan_momentum_decision`
- `momentum_outreach_decision`

### C. Événements de scheduling

- `momentum_outreach_scheduled`
- `momentum_outreach_schedule_skipped`
- `momentum_outreach_schedule_blocked`

### D. Événements de delivery

- `momentum_outreach_sent`
- `momentum_outreach_deferred`
- `momentum_outreach_cancelled`
- `momentum_outreach_failed`
- `momentum_outreach_throttled`

### E. Événements de réaction

- `momentum_user_reply_after_outreach`
- `momentum_user_silence_after_outreach`
- `momentum_state_changed_after_outreach`

---

## Champs minimums requis sur tous les événements

Chaque événement observabilité momentum doit contenir au minimum :

- `event_name`
- `occurred_at`
- `user_id`
- `scope`
- `request_id` quand disponible
- `source_component`
- `channel`

### `source_component`

Valeurs attendues :

- `router`
- `watcher`
- `trigger_daily_bilan`
- `trigger_weekly_bilan`
- `process_checkins`
- `whatsapp_send`
- `audit_exporter`

### `channel`

Valeurs attendues :

- `whatsapp`
- `web`
- `system`

---

## Champs métier requis par type d'événement

### 1. Classification / transition

Champs requis :

- `state_before`
- `state_after`
- `state_reason`
- `classifier_source`
- `dimensions`
- `pending_transition`

`dimensions` doit contenir :

- `engagement.level`
- `progression.level`
- `emotional_load.level`
- `consent.level`

Optionnel mais fortement recommandé :

- `metrics_snapshot`
- `signal_summary`
- `stable_since_at`
- `pending_transition_confirmations`

### 2. Décision proactive

Champs requis :

- `decision_kind`
- `target_kind`
- `state_at_decision`
- `decision`
- `decision_reason`
- `policy_summary`

Exemples :

- `target_kind = daily_bilan`
- `target_kind = weekly_bilan`
- `target_kind = momentum_outreach`

### 3. Scheduling outreach

Champs requis :

- `outreach_state`
- `event_context`
- `scheduled_for`
- `cooldown_snapshot`
- `instruction_summary`

`cooldown_snapshot` doit permettre de lire :

- `max_proactive_per_7d`
- `min_gap_hours`
- `recent_matching_events`

### 4. Delivery

Champs requis :

- `delivery_status`
- `purpose`
- `event_context`
- `scheduled_checkin_id` si applicable
- `transport`
- `skip_reason` ou `failure_reason`

### 5. User reaction

Champs requis :

- `related_outreach_event_context`
- `related_outreach_sent_at`
- `delay_hours`
- `reply_quality`
- `reply_detected`
- `state_before_reply`
- `state_after_reply`

---

## Corrélation entre événements

L'audit doit pouvoir relier plusieurs niveaux entre eux.

### Clés de corrélation minimales

- `user_id`
- `request_id`
- `event_context`
- `scheduled_checkin_id`
- `purpose`
- `occurred_at`

### Règles de corrélation

- un changement d'état doit pouvoir être relié à la décision proactive prise ensuite ;
- une décision proactive doit pouvoir être reliée à un scheduling réel ;
- un scheduling doit pouvoir être relié à un envoi réel ;
- un envoi réel doit pouvoir être relié à la première réponse user utile qui suit ;
- la réponse user doit pouvoir être reliée au nouvel état dérivé.

Sans ces corrélations, on observe des fragments mais on ne peut pas auditer la chaîne.

---

## Scorecard cible à produire plus tard

Le bundle d'audit momentum devra produire une `scorecard` avec au minimum :

### 1. Volumétrie

- `events_total`
- `state_events_total`
- `proactive_decisions_total`
- `outreach_scheduled_total`
- `outreach_sent_total`
- `outreach_failed_total`

### 2. Distribution des états

- nb et part de :
  - `momentum`
  - `friction_legere`
  - `evitement`
  - `pause_consentie`
  - `soutien_emotionnel`
  - `reactivation`

### 3. Matrice de transitions

- `momentum -> friction_legere`
- `friction_legere -> momentum`
- `friction_legere -> evitement`
- `evitement -> reactivation`
- `any -> pause_consentie`
- `any -> soutien_emotionnel`

### 4. Décisions proactives

- daily bilan allowed
- daily bilan blocked
- weekly bilan allowed
- weekly bilan blocked
- outreach scheduled by state
- outreach blocked by state

### 5. Delivery et outcome

- taux d'outreach envoyés après scheduling
- taux de skip transport
- taux de throttle
- taux de réponse user après outreach
- latence médiane avant réponse
- variation d'état après réponse

### 6. Signaux d'alerte

- branches jamais utilisées
- branches sur-utilisées
- état instable / oscillant
- outreachs trop rapprochés
- bilans envoyés alors qu'un état bloquant était actif

---

## Questions d'audit que le futur bundle devra permettre

### Qualité de classification

- L'état dérivé semblait-il juste au regard des messages user ?
- Les dimensions justifiant cet état étaient-elles cohérentes ?
- Le watcher et le routeur racontaient-ils la même histoire ?
- Y a-t-il eu sur-réactivité ou inertie excessive ?

### Qualité de décision proactive

- Le système a-t-il choisi le bon geste pour cet état ?
- A-t-il bloqué un bilan qu'il aurait dû laisser passer ?
- A-t-il laissé passer un bilan qui aurait dû être bloqué ?
- A-t-il programmé un outreach trop tôt ou trop souvent ?

### Qualité de delivery

- Le geste décidé a-t-il réellement été envoyé ?
- A-t-il été annulé par la fenêtre 24h, le throttle ou un conflit de scheduling ?
- Y a-t-il trop de perte entre décision et delivery ?

### Qualité de réaction

- Le user a-t-il répondu ?
- Le ton de la réponse confirme-t-il que le geste était approprié ?
- Le nouvel état après réaction va-t-il dans le bon sens ?

---

## Invariants d'observabilité

### 1. Pas d'événement opaque

Chaque décision proactive doit avoir une `reason` lisible et stable.

### 2. Pas de changement d'état sans snapshot minimal

Si un état change, on doit toujours avoir :

- `state_before`
- `state_after`
- `dimensions`
- `reason`

### 3. Pas de scheduling sans contexte

Tout outreach programmé doit être relié à :

- un état ;
- un `event_context` ;
- une règle de cooldown ;
- un composant source.

### 4. Pas de delivery sans rattachement métier

Un envoi ne doit pas être seulement un événement transport.

Il doit rester relié au geste produit qui l'a causé.

### 5. Pas de réaction user orpheline

Si on annote une réponse comme réaction à un outreach, il faut pouvoir justifier le lien.

---

## Priorités de mise en oeuvre pour la phase 2

Quand on passera à l'implémentation, les priorités doivent être :

1. instrumenter les événements de classification ;
2. instrumenter les décisions `daily` et `weekly` ;
3. instrumenter les outreachs programmés par état ;
4. instrumenter la livraison réelle ;
5. instrumenter la réaction user ;
6. seulement ensuite construire l'export.

---

## Livrable de cette phase

Le livrable de cette phase 1 est ce contrat d'observabilité.

Il sert de référence pour :

- la phase 2 d'instrumentation ;
- la phase 3 d'export ;
- la phase 4 de documentation d'audit.

Il doit être considéré comme la source de vérité sur ce que le système momentum doit rendre observable.
