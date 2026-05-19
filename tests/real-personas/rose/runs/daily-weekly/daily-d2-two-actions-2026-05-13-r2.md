# QA Run Report - Daily D2.1 Two Actions

## 1. Contexte Du Test

- Date: 2026-05-13
- Run: `daily-d2-two-actions-2026-05-13-r2`
- Persona: rose
- Objectif: tester le daily action review avec exactement deux actions dans le meme pending, une habitude faite et une mission non faite avec raison emotionnelle.
- Trajectoire: Sophia ouvre via le trigger daily, Rose repond librement en une phrase sur les deux actions, Sophia doit remplir le JSON a trous et appliquer uniquement les effets coherents.
- Surfaces visees: `process-checkins`, `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, `user_plan_item_entries`, `user_habit_week_occurrences`.
- Cadre IA reel: Supabase local, webhook WhatsApp local, generation proactive par `process-checkins`, reponse user improvisee apres lecture du message Sophia, pas de liste fixe pre-scripted.
- Validite QA: valide pour le daily a deux actions. Le setup a necessite une activite WhatsApp entrante simulee a T-30min pour respecter la regle produit de fenetre 24h.

Reference encart: `Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire` appliquee.

Grounding dynamique:

- connection: `tests/real-personas/rose/connection.json`
- scheduled_checkin_id: `2581a260-1619-4fa5-9493-045e2835b5a5`
- pending_id decouvert/genere au runtime: `7bc8299f-65d8-4567-94ae-4e8cdea83f5e`
- targets.length: `2`
- local_date: `2026-05-13`
- targets:
  - `Partager un point positif` / habit / occurrence `57e3b4a8-35ce-414f-8012-61a162423ef4`
  - `Convenir d'un signal de pause` / mission / occurrence `60103e2e-f87c-4759-be10-86081decafc7`
- tentative precedente: `daily-d2-two-actions-2026-05-13-r1` annulee par `action_evening_review_requires_24h_window`; correction setup: `whatsapp_last_inbound_at` simule a T-30min.

Raw: `tests/real-personas/rose/runs/daily-weekly/daily-d2-two-actions-2026-05-13-r2.raw.json`

## 2. Tours De Conversation

### Tour 0

**Sophia**
> Tu as pu faire ta revue du soir aujourd’hui, notamment partager un point positif ?

**Trace courte**
- source: `process-checkins`
- scheduled_checkin_status: `sent`
- pending_status: `pending`
- chat_capability: `daily_action_review`
- targets.length: `2`
- asked_occurrence_ids: `57e3b4a8-35ce-414f-8012-61a162423ef4`, `60103e2e-f87c-4759-be10-86081decafc7`
- opening issue: la phrase ne nomme explicitement qu'une action sur deux.

### Tour 1

**User**
> Oui, j'ai partagé un point positif avec lui ce soir, ça a été un peu maladroit mais je l'ai fait. Par contre le signal de pause, non : je n'ai pas osé l'amener, j'avais peur que ça relance une tension.

### Tour 1

**Sophia**
> C'est note pour ce soir :
> - Partager un point positif: faite
> - Convenir d'un signal de pause: non faite, reportee a mercredi
**Trace courte**
- http_status: `200`
- selected_handler: `handleActionEveningReviewReply`
- response_owner: pending daily action review
- route_reason: pending `chat_capability=daily_action_review`
- safety: no acute safety signal observed
- operation: none
- pending_confirmation: none
- direct_effects: entries daily creees, occurrence habit `done`, occurrence mission `rescheduled`
- pending_status: `done`
- entries_count: `2`
- assistant_message_count: `1`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia commence bien la conversation depuis le trigger daily, sans attendre un premier message user.
- Le message user libre contient deux statuts dans une seule phrase, et Sophia comprend les deux sans imposer de QCM.
- La reponse finale est courte et lisible : une ligne par action, pas de coaching inutile, pas de carte d'attaque, pas de potion, pas d'ajustement de plan.

**Problemes**
- Tour 0: l'ouverture dit `notamment partager un point positif` mais ne cite pas `Convenir d'un signal de pause`. Impact: si Rose n'avait pas devine qu'il fallait parler des deux, le JSON serait probablement reste incomplet. Severite: yellow.
- Tour 1: Sophia reporte directement la mission non faite a mercredi alors que Rose n'a pas confirme que l'action restait utile ni demande le report. Impact: effet durable possible trop rapide sur une mission. Severite: yellow/red selon la policy attendue.
- Tour 1: la formulation `reportee a mercredi` est ambigue dans ce run, car le check a lieu le mercredi 13 mai 2026 pour des occurrences planifiees mardi. Impact: le user peut comprendre un report dans le passe ou le jour meme. Severite: yellow.

**Fix propose**
- Contraindre le generateur d'ouverture daily: quand `current_focus_occurrence_ids.length=2`, la question visible doit nommer ou designer clairement les deux actions, meme de maniere courte.
- Pour une mission `missed`, ne pas rescheduler automatiquement si `still_relevant=unknown`; poser une clarification courte ou enregistrer `missed` sans report.
- Quand un report est calcule depuis une occurrence passee, afficher une date claire ou `demain` uniquement si c'est vraiment le lendemain du moment utilisateur.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Le checkin dynamique a ete pris par `process-checkins` et a cree un pending `daily_action_review` avec `targets.length=2`.
- Le webhook a bien priorise le pending daily au Tour 1 et n'est pas parti dans le dispatcher operationnel.
- Le pending est passe a `done` apres un seul message parce que les deux outcomes ont ete juges complets.

**Skills / Operations / Tools**
- `review_state` initial contenait les deux occurrences dans `current_focus_occurrence_ids`.
- Le skill a rempli le JSON a trous correctement sur les deux actions:
  - habit `Partager un point positif`: `outcome=completed`, `confidence=high`, `reason_category=none`;
  - mission `Convenir d'un signal de pause`: `outcome=missed`, `reason_category=emotional`, `reason_text=peur que ça relance une tension`.
- Aucune operation durable hors daily n'a ete proposee ou lancee.

**Memory / Effets durables**
- Entry habit creee avec `metadata.source=daily_action_review_v1`, `outcome=completed`, occurrence `done`.
- Entry mission creee avec `metadata.source=daily_action_review_v1`, `outcome=missed`, `blocker_hint=emotional`, occurrence `rescheduled`.
- `metadata.matched_user_text` conserve bien les extraits utiles pour le weekly.
- `metadata.reschedule_decision=rescheduled_tomorrow` et `rescheduled_to=wed` sont presents pour la mission.

**Problemes**
- Le payload initial prouve que deux actions etaient ciblees, mais le message visible n'en expose qu'une clairement.
- `still_relevant` reste `unknown` pour la mission ratee, tout en autorisant `should_apply_effects=true` et un report automatique. C'est le point systeme le plus risqué du run.
- Le report modifie `planned_day` vers `wed` sans stocker dans la reponse visible une date absolue, ce qui rend le feedback faible pour un check fait apres coup.

**Fix propose**
- Ajouter une garde dans `runDailyActionReviewSkill` ou dans l'application des effets: `missed + mission/clarification + still_relevant=unknown` ne doit pas declencher un report automatique.
- Ajouter un test integration: deux actions, une completed, une missed avec raison mais sans demande de report -> pas de reschedule tant que l'utilite n'est pas confirmee.
- Renforcer le prompt d'ouverture: `asked_occurrence_ids` doit etre fidele a la question visible; si deux IDs sont asks, les deux titres doivent etre couverts.

## Verdict Global

- Verdict: yellow
- Raison principale: le coeur du daily a deux actions fonctionne et le JSON structure est bon, mais l'ouverture ne couvre pas assez clairement les deux actions et le report automatique d'une mission non faite est trop agressif quand l'utilite reste inconnue.
- Follow-up prioritaire: bloquer le reschedule automatique des non-habitudes tant que `still_relevant` n'est pas confirme, puis rerun le meme scenario.
