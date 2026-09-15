# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `daily-d1-live-adaptive-2026-05-13-r3`
- Persona: paul
- Objectif: Test D1.1 daily minimal, une seule action, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 1 target, puis continuation conversationnelle minimum 5 tours user.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `false`
- pending_id decouvert/genere au runtime: `b5d0996d-6d61-4ef0-92eb-fd94b7d667cb`
- targets.length: `1`
- local_date: `2026-05-13`
- setup: aucun pending daily disponible au depart; scheduler local sans candidat. Un scheduled_checkin dynamique QA a donc ete cree sur une occurrence ouverte existante, avec `draft_message=""`, puis `process-checkins` a genere le message Sophia reel.
- scheduled_checkin_id: `ce1834d8-f6e4-4d4a-9a43-e6735c2a1fa5`
- occurrence cible: `b4c849b9-28ce-4225-8bec-1d13bbeda866`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d1-live-adaptive-2026-05-13-r3.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Créer ton “Parking à idées” : qu’est-ce qui s’est passé pour toi dessus aujourd’hui (où tu en es, et si tu l’as utilisé un peu ou pas du tout) ?

### Tour 1

**User**
> Je l'ai commencé : j'ai créé l'endroit où mettre les idées, mais je n'ai pas vraiment vidé tout ce que j'avais en tête. Je me suis bloqué sur la structure et j'ai laissé ça à moitié prêt.

### Tour 1

**Sophia**
> C'est note : Créer ton Parking à idées: commencee, pas terminee.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `1`
- assistant_message_count: `1`

### Tour 2

**User**
> Ok. Pour le bilan de fin de semaine, le point important c'est plutôt que l'idée est utile, mais que je perds du temps à vouloir organiser parfaitement le parking avant de m'en servir.

### Tour 2

**Sophia**
> Je te propose cette carte d'attaque avant de la creer.
> 
> Preparer le terrain
> Prepare l'environnement de "Faire une session de travail focus (2h)" pendant 2 minutes, sans obligation d'aller plus loin. Contraintes: avant de m'en servir.
> 
> Mode d'emploi: Prepare le terrain avant le moment vise, puis laisse l'environnement t'aider a demarrer.
> 
> Tu veux que je cree cette carte ?
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `1`
- assistant_message_count: `1`

### Tour 3

**User**
> Non, ne crée pas de carte. Et ce n'est pas l'action focus : je parlais du Parking à idées. Je veux juste que ce soit retenu comme cause probable : je complexifie trop la structure.

### Tour 3

**Sophia**
> Ok, je ne crée pas cette carte d'attaque.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `2`
- assistant_message_count: `1`

### Tour 4

**User**
> Merci. Tu peux me confirmer simplement ce qui est enregistré pour le daily, sans me proposer autre chose ?

### Tour 4

**Sophia**
> Oui, je vérifie seulement. Je ne crée rien et je ne modifie rien.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `2`
- assistant_message_count: `1`

### Tour 5

**User**
> D'accord, mais concrètement tu as noté quoi : fait, pas fait, ou commencé mais pas terminé ?

### Tour 5

**Sophia**
> Oui, je vérifie seulement. Je ne crée rien et je ne modifie rien.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `2`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 0: Sophia ouvre bien la conversation elle-meme avec une phrase generee, sans template hardcode type "Petit check du soir".
- Tour 1: Sophia comprend la reponse libre et classe correctement l'action comme commencee / pas terminee, avec une reponse courte et non culpabilisante.
- Tour 3: apres refus explicite, Sophia ne cree pas la carte d'attaque.

**Problemes**
- Tour 2: le user demande de retenir une nuance pour le bilan weekly, mais Sophia lance directement une carte d'attaque. Impact: elle transforme une note de bilan en operation.
- Tour 2: la carte d'attaque vise la mauvaise action (`Faire une session de travail focus (2h)`) alors que le daily cible `Créer ton Parking à idées`. Impact: mauvaise cible et risque de side effect incoherent.
- Tours 4-5: le user demande une verification factuelle du daily, mais Sophia repond seulement qu'elle ne cree rien et ne modifie rien. Elle ne donne pas le statut enregistre, meme apres relance explicite.
- La conversation post-daily ne sait pas encore "s'arreter" sur une bonne reponse factuelle quand le pending est termine.

**Fix propose**
- Prioriser le contexte daily recent apres `daily_action_review_v1`: si le user demande "ce qui est note/enregistre/retenu", repondre depuis `review_state` et les entries avant toute operation.
- Quand `tool_skill_opportunity` propose une carte apres daily, verifier que la cible operationnelle correspond a la target du daily ou demander clarification.
- Apres refus explicite d'une operation, mettre un cooldown local sur cette opportunite et revenir au besoin demande par le user.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 0: `process-checkins` genere un pending `daily_action_review` reel depuis `scheduled_checkins`, avec `draft_message` IA.
- Tour 1: le pending passe par `daily_action_review_v1`, puis `pending_status=done`.
- Tours 2-5: la conversation sort du pending et repasse en brain WhatsApp normal (`purpose=whatsapp_default_brain_reply`), mais le contexte daily recent n'est pas assez prioritaire.

**Skills / Operations / Tools**
- Tour 1: parsing daily correct: `outcome=partial`, `reason_text` conserve la reponse libre, occurrence cible -> `partial`.
- Tour 2: demarrage d'un draft `prepare_attack_card` non demande explicitement, et cible mismatch vers une ancienne action focus.
- Tours 4-5: absence d'outil ou retrieval factuel visible pour repondre a la question "qu'est-ce qui est enregistre ?".

**Memory / Effets durables**
- Entry daily principale creee: `metadata.source=daily_action_review_v1`, `outcome=partial`, `reason_text` contient la reponse user du tour 1.
- Occurrence cible `b4c849b9-28ce-4225-8bec-1d13bbeda866` passe a `status=partial`.
- Une entry supplementaire `router_parallel_tracking_v2` est creee apres le tour 3, ce qui peut bruiter le weekly.

**Problemes**
- Mauvaise priorisation post-daily: une note pour weekly devient une operation.
- Mauvaise resolution de cible operationnelle: le daily cible une mission, l'operation cible une habitude differente.
- Verification factuelle absente: Sophia a les donnees mais ne les restitue pas au user.
- Bruit durable possible via `router_parallel_tracking_v2` sur une conversation qui clarifie/refuse plutot qu'un nouveau progres.

**Fix propose**
- Ajouter un handler/guard post-daily pour les demandes factuelles: `what_is_recorded`, `did_you_note_it`, `weekly_note`, `daily_status_check`.
- Dans ce guard, lire `whatsapp_pending_actions.payload.review_state` ou la derniere entry `daily_action_review_v1` et repondre directement.
- Bloquer ou degrader `tool_skill_opportunity` si `target_status=identified` mais la target ne correspond pas a l'action daily recente.
- Eviter le tracking parallele quand le message corrige/refuse une operation ou demande une verification de statut.

## Verdict Global

- Verdict: red
- Raison principale: le daily lui-meme fonctionne, mais le post-daily echoue sur deux points critiques: mauvaise proposition d'operation et incapacité a confirmer factuellement ce qui a ete enregistre.
- Follow-up prioritaire: implementer une priorite `daily_status_check / weekly_note` avant `tool_skill_opportunity` dans les tours qui suivent un pending daily termine.

## Addendum - Retest Apres Garde Operation Opportunity

### Tour 6

**User**
> Pour le bilan, note juste que le blocage venait surtout du fait que je voulais organiser parfaitement le Parking à idées avant de m'en servir. Je ne veux pas lancer d'outil, seulement que cette raison soit retenue.

**Sophia**
> C'est bien noté, j'ai enregistré que le blocage vient de ton besoin de perfectionnisme sur la structure avant même d'utiliser l'outil. C'est un point clé pour ton bilan. 📝

**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `3`
- assistant_message_count: `1`

**Verdict retest ciblé: green sur le bug tool_skill_opportunity**

- Sophia ne propose plus de carte d'attaque quand le user demande explicitement de noter une raison pour le bilan.
- Elle reste dans le cadre attendu: enregistrer / reformuler la cause, sans lancer de flow operation.
- Point de polish restant: eviter l'emoji dans ce type de reponse si on veut garder le ton systeme plus sobre.
