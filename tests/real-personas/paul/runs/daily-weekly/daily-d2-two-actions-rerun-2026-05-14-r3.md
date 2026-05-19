# QA Run Report - Daily D1.1 Manual Adaptive

## 1. Contexte Du Test

- Date: 2026-05-14
- Run: `daily-d2-two-actions-rerun-2026-05-14-r3`
- Persona: paul
- Objectif: Test daily deux actions, conversation ouverte par Sophia puis conduite manuellement tour par tour.
- Trajectoire: daily action review avec 2 target, puis continuation conversationnelle minimum 5 tours user.
- Surfaces visees: `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, reponse conversationnelle WhatsApp apres pending.
- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.
- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/paul/connection.json`
- daily genere dynamiquement: `false`
- pending_id decouvert/genere au runtime: `4ec30df9-6fc4-428e-8c36-326bb220b5ee`
- targets.length: `2`
- local_date: `2026-05-18`

Raw: `tests/real-personas/paul/runs/daily-weekly/daily-d2-two-actions-rerun-2026-05-14-r3.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> La session de travail focus (2h), tu la comptes bien comme faite (1h45), et où tu en es pour “bloquer tes créneaux de la semaine” ?

### Tour 1

**User**
> Oui, pour moi la session focus est faite. Pour les créneaux, non, je ne les ai pas bloqués : j'étais déjà saturé et je ne voulais pas ouvrir mon agenda ce soir.

### Tour 1

**Sophia**
> Est-ce que tu souhaites reporter le blocage de tes créneaux à demain ?
**Trace courte**
- http_status: `200`
- pending_status: `pending`
- entries_count: `14`
- assistant_message_count: `1`

### Tour 2

**User**
> Oui, reporte-le à demain. Je préfère le faire avec la tête plus fraîche.

### Tour 2

**Sophia**
> C'est note pour ce soir :
> - Faire une session de travail focus (2h): faite
> - Bloquer tes créneaux de la semaine: non faite, reportee a mardi
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `16`
- assistant_message_count: `1`

### Tour 3

**User**
> Tu peux me confirmer ce que tu viens d'enregistrer exactement ?

### Tour 3

**Sophia**
> Base de vie: La Base de vie regroupe ce qui reste utile hors d'une transformation active: transformations terminees, lignes verte et rouge, declics de cloture et initiatives hors plan. Les ressources restent conservees dans l'historique de la transformation; elles ne sont pas deplacees directement dans la Base de vie.
> 
> Comment l'utiliser: Dans la sidebar du dashboard, choisis Base de vie. Tu peux consulter les transformations terminees et les elements de cloture. Les lignes verte et rouge sont remplies a la fin de chaque plan via le questionnaire de cloture. Les ressources restent dans l'historique de la transformation; elles ne sont pas rangees directement dans la Base de vie.
> 
> Ce que ca apporte:
> - Evite que tout disparaisse quand une transformation se termine.
> - Conserve les lignes verte et rouge et les declics issus du questionnaire de cloture.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `16`
- assistant_message_count: `1`

### Tour 4

**User**
> Ok, donc récapitulatif : qu'est-ce qui est enregistré dans le daily là ?

### Tour 4

**Sophia**
> Base de vie: La Base de vie regroupe ce qui reste utile hors d'une transformation active: transformations terminees, lignes verte et rouge, declics de cloture et initiatives hors plan. Les ressources restent conservees dans l'historique de la transformation; elles ne sont pas deplacees directement dans la Base de vie.
> 
> Comment l'utiliser: Dans la sidebar du dashboard, choisis Base de vie. Tu peux consulter les transformations terminees et les elements de cloture. Les lignes verte et rouge sont remplies a la fin de chaque plan via le questionnaire de cloture. Les ressources restent dans l'historique de la transformation; elles ne sont pas rangees directement dans la Base de vie.
> 
> Ce que ca apporte:
> - Evite que tout disparaisse quand une transformation se termine.
> - Conserve les lignes verte et rouge et les declics issus du questionnaire de cloture.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `16`
- assistant_message_count: `1`

### Tour 5

**User**
> Je reformule : qu'est-ce qui est enregistré exactement pour ce daily ?

### Tour 5

**Sophia**
> J'ai enregistré ça pour le daily :
> - Faire une session de travail focus (2h) : faite.
> - Bloquer tes créneaux de la semaine : non faite, raison : déjà saturé et je ne voulais pas ouvrir mon agenda ce soir, reportée à mardi.
**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `16`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: pass partiel, puis correction validee au tour 5**

**Ce qui marche**
- Le message d'ouverture nomme clairement les deux actions ciblees: la session focus et le blocage des creneaux.
- Sophia ne propose plus de report automatique de la mission non faite: elle demande d'abord confirmation au tour 1.
- Apres confirmation user, Sophia cloture le pending sans repeter la meme question.
- Le recap post-correction au tour 5 est factuel et reprend les deux actions.

**Problemes**
- Tours 3 et 4: avant correction finale du guard post-daily, Sophia sortait du contexte daily et repondait hors sujet sur la Base de vie.
- Le message de cloture du tour 2 reste un peu mecanique et sans accents (`C'est note`, `reportee a mardi`), mais il est factuellement correct.
- Le report affiche `mardi` parce que le daily QA est ancre sur `local_date=2026-05-18` (lundi). La date est claire, mais le fixture reste artificiel.

**Fix propose**
- Guard ajoute avant le brain general: si le user demande ce qui vient d'etre enregistre apres un daily termine, Sophia repond depuis le `review_state` et les entries `daily_action_review_v1`.
- Detection corrigee pour les formulations accentuees et libres du type "qu'est-ce qui est enregistre exactement".

## 4. Analyse Systeme

**Verdict: pass sur le flux daily principal, pass apres hot reload sur la verification post-daily**

**Routage**
- Tours 1-2: routage correct vers `handleActionEveningReviewReply` via pending `chat_capability=daily_action_review`.
- Tour 1: `missed + mission + still_relevant=unknown` reste en pending, donc aucun effet durable applique avant confirmation.
- Tour 2: confirmation de report acceptee; pending passe a `done`.
- Tour 5: guard `daily_action_review_recent_summary` intercepte la question de verification avant le brain general.

**Skills / Operations / Tools**
- `daily_action_review_v1` remplit le JSON conversationnellement; pas de regex pour classifier les outcomes du daily.
- Le garde-fou deterministe sert uniquement a confirmer un report deja demande dans un pending tres contraint.
- Aucune operation card/plan/potion n'est proposee pendant le daily.

**Memory / Effets durables**
- Deux entries creees au tour 2 avec `metadata.source=daily_action_review_v1`.
- Habit `Faire une session de travail focus (2h)` marquee `done`.
- Mission `Bloquer tes creneaux de la semaine` marquee `rescheduled`, `rescheduled_to=tue`, seulement apres confirmation user.

**Problemes**
- Le product-help captait les questions de verification post-daily avant le guard; reproduit aux tours 3 et 4.

**Fix propose**
- Conserver le guard post-daily et ajouter un test integration dedie: daily termine -> question "qu'est-ce qui est enregistre ?" -> reponse factuelle depuis `review_state`.

## Verdict Global

- Verdict: PASS avec incident intermediaire documente.
- Raison principale: les deux corrections critiques sont validees: pas de report sans confirmation, et recap post-daily factuel apres correction du guard.
- Follow-up prioritaire: durcir le test integration post-daily pour empecher un retour du product-help hors sujet.
