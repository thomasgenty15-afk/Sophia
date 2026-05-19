# QA Run Report - Daily Paul Action Déjà Faite + Action À Vérifier

## 1. Contexte Du Test

- Date: 2026-05-16
- Run: `daily-paul-done-plus-open-20260516-r3`
- Persona: Paul, fixture minimale locale recréée après reset accidentel du Supabase local.
- Objectif: vérifier qu'un daily reconnaît une action déjà marquée faite avant l'ouverture, ne la redemande pas, puis traite une mission partiellement faite avec split vers demain.
- Trajectoire: `process-checkins` génère l'ouverture, `whatsapp-webhook` traite la réponse libre, puis recap post-clôture.
- Surfaces visées: `process-checkins`, `daily_action_review_v1`, `whatsapp_pending_actions`, `user_plan_item_entries`, `user_habit_week_occurrences`, split mission.
- Cadre IA réel: Supabase local, Edge Functions locales, génération d'ouverture et parsing daily via chemin IA réel, pas de fallback déterministe.
- Validité QA: valide avec réserve. Les tentatives `r1/r2` ont révélé puis corrigé un bug `default_day`; le Supabase local a ensuite été redémarré et Paul recréé minimalement car la DB locale avait été réinitialisée.

Grounding dynamique:

- Plan: `Structurer et faire avancer ton projet d'entreprise`
- Action déjà validée avant daily: `Créer ton Parking à idées`
- Action ouverte à vérifier: `Bloquer tes créneaux de la semaine`
- Raw: `tests/real-personas/paul/runs/daily-weekly/daily-paul-done-plus-open-20260516-r3.raw.json`
- State: `tests/real-personas/paul/runs/daily-weekly/daily-paul-done-plus-open-20260516-r3.state.json`
- Restauration DB: fixture Paul minimale et artefacts du run supprimés à `2026-05-16T17:42:04.199Z`; vérification finale `profile_count=0`, `pending_count=0`, `message_count=0`.

## 2. Tours De Conversation

### Tour 0

**Sophia**
> J'ai vu que « Créer ton Parking à idées » est déjà validée aujourd'hui. Bien joué.
>
> J'espère que ta journée de samedi a été chouette ! Je voulais savoir comment tu avais géré Bloquer tes créneaux de la semaine. Tu as pu t'en occuper ?

**Trace courte**
- http_status: `200` via `process-checkins`
- response_owner: scheduled checkin
- selected_handler: `action_evening_review`
- direct_effects: pending daily créé
- durable_effect: `already_resolved_targets.length=1`, `targets.length=1`
- pending_confirmation: `whatsapp_pending_actions.status=pending`

### Tour 1

**User**
> J'ai mis lundi et mardi dans le calendrier, donc il y a un vrai début. Mais le reste de la semaine est encore en bazar, j'étais rincé et je n'ai pas eu la tête pour finir.

**Sophia**
> C'est noté pour le blocage de tes créneaux, que tu as fait en partie. Je prends en compte la fatigue pour ton bilan. C'est tout pour aujourd'hui !

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp-webhook`
- selected_handler: `handleActionEveningReviewReply`
- safety: aucun signal
- direct_effects: pending clôturé
- operation: aucune operation tool hors daily
- pending_confirmation: `status=done`
- durable_effect: entrée `outcome=partial`, `reason_category=fatigue`, occurrence source mise `done`, continuation créée pour `sun`

### Tour 2

**User**
> Tu as noté quoi exactement dans le bilan ?

**Sophia**
> Voilà ce que j'ai noté pour le bilan qu'on vient de faire :
> - Bloquer tes créneaux de la semaine : partiellement fait (rincé et pas eu la tête pour finir)
> Je ne change rien d'autre dans ton plan.

**Trace courte**
- http_status: `200`
- response_owner: `whatsapp-webhook`
- selected_handler: `daily_action_review_recap`
- safety: aucun signal
- direct_effects: aucun nouvel effet durable
- durable_effect: recap post-clôture depuis le pending `done`

## 3. Analyse De Fluidité Humaine

**Verdict: green**

**Ce qui marche**
- Tour 0: Sophia rend visible l'action déjà faite avec une petite reconnaissance, puis ne demande que l'action restante. C'est exactement le comportement demandé.
- Tour 1: la formulation évite `partiel`; `fait en partie` est plus humain et moins sec.
- Tour 2: le recap utilise `partiellement fait`, pas `partiel`, et reste borné au bilan sans rouvrir un autre flow.

**Problèmes**
- Tour 0: la phrase “J'espère que ta journée de samedi a été chouette” ajoute un peu de small talk. Impact faible, mais Paul peut préférer plus direct sur un daily opérationnel. Sévérité: green/yellow léger.

**Fix proposé**
- Optionnel: réduire la salutation proactive quand le message contient déjà une reconnaissance d'action faite.

## 4. Analyse Système

**Verdict: green**

**Routage**
- `process-checkins` charge les deux occurrences, classe `Créer ton Parking à idées` en `already_resolved_targets`, et ne garde que `Bloquer tes créneaux de la semaine` dans `targets`.
- Le webhook priorise le pending daily, applique le skill `daily_action_review_v1`, puis le recap post-clôture est repris par `daily_action_review_recap`.

**Skills / Operations / Tools**
- Aucun tool ou opération hors daily n'est déclenché.
- La mission partiellement faite produit `daily_decision=mission_partial_split_continuation_created`.
- L'entrée du jour a `completed_part_label=1ere_partie`.

**Memory / Effets durables**
- Entrée préexistante: `Créer ton Parking à idées` en `completed`, source `qa_prevalidated_before_daily`.
- Entrée daily: `Bloquer tes créneaux de la semaine` en `partial`, `reason_category=fatigue`, `occurrence_status=done`.
- Continuation: nouveau plan item `Terminer Bloquer tes créneaux de la semaine (2e partie)` avec occurrence `planned` le dimanche.
- Cartes: non couvert dans ce run, car les deux items de fixture n'avaient pas de carte attaque/défense; `continuation_cards_decision=no_cards_to_duplicate`.

**Problèmes**
- Tentatives `r1/r2`: bug système découvert avant ce run propre. Le split créait le plan item de continuation puis échouait à créer l'occurrence parce que `default_day` manquait dans l'insert. Correctif appliqué dans `handlers_pending.ts` avant `r3`.
- Environnement: le redémarrage Supabase local a réinitialisé la DB; Paul a dû être recréé minimalement pour ce run. Impact: couverture conversationnelle OK, mais moins riche que le vrai Paul historique.

**Fix proposé**
- Ajouter un test de non-régression ciblé sur `ensureMissionPartialContinuation` pour vérifier que l'occurrence de continuation renseigne `default_day`, `planned_day`, `original_planned_day`.
- Faire un run complémentaire avec des cartes attaque/défense réelles pour valider la duplication de cartes.

## Verdict Global

- Verdict: yellow
- Raison principale: le comportement produit demandé passe dans `r3`, mais le run contient une réserve d'environnement importante après reset local et ne couvre pas la duplication de cartes.
- Follow-up prioritaire: ajouter une régression automatisée sur le split mission partial, puis relancer avec une action possédant des cartes.
