# QA Run Report - Daily Action Review

## 1. Contexte Du Test

- Date: 2026-06-22
- Run: `daily-real-rose-20260622-r1`
- Persona: Rose
- Objectif: verifier le flow `daily_action_review_v1` avec 3 targets, ouverture sur 2 actions, puis obligation de collecter la 3e avant cloture.
- Trajectoire: scheduled checkin local -> `process-checkins` -> pending WhatsApp daily -> reponses user adaptatives -> commit daily -> sortie post-daily en `normal_reply`.
- Surfaces visees: `scheduled_checkins`, `whatsapp_pending_actions`, `whatsapp-webhook/handlers_pending`, `daily_action_review_v1`, `user_plan_item_entries`, `user_habit_week_occurrences`, router normal post-daily.
- Cadre IA reel: Supabase local, `process-checkins` local, webhook WhatsApp local pour le pending daily reel. Le controle post-daily a ete fait via `/functions/v1/test-send-message` avec `force_full_ai=true`.
- Validite QA: valide pour le flow daily pending reel. Note technique: le pending `daily_action_review` est consomme par `whatsapp-webhook/handlers_pending`, pas par `test-send-message`; utiliser uniquement `test-send-message` n'aurait pas teste le daily pending.

Grounding dynamique:

- Connection: `tests/real-personas/rose/connection.json`
- User id: `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Access tier: `alliance`
- Timezone: `Europe/Paris`
- Scheduled checkin QA cree: `56a36b6f-ee66-4030-945d-fdcc16333a83`
- Pending daily cree par `process-checkins`: `caeb0f80-dc22-4a34-9952-0f58ebfd7c75`
- Targets decouvertes depuis DB: 3
- Raw state: `tests/real-personas/rose/runs/daily-weekly/daily-real-rose-20260622-r1.raw.json`
- Nettoyage: entries, pending, scheduled checkins et messages du run supprimes; occurrences restaurees en `planned`.

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**User**
> System scheduled checkin via `process-checkins`.

**Sophia**
> Ce soir, où tu en es avec tes deux actions : faire ton sas de décompression (sans fumer) et ranger le matériel hors de vue ?

**Trace courte**
- http_status: `200` sur `process-checkins`
- response_owner: pending proactive WhatsApp
- selected_handler: `process-checkins.action_evening_review_v2`
- route_reason: scheduled checkin due
- safety: none
- direct_effects: none
- operation: daily opening generated
- pending_confirmation: `whatsapp_pending_actions.status=pending`
- memory_plan: n/a
- executed_tools: none
- durable_effect: pending daily cree avec 3 targets; `asked_occurrence_ids=2`, `not_yet_asked_occurrence_ids=1`

### Tour 1

**Verdict du tour:** green

**User**
> J'ai bien fait le sas de décompression, et j'ai aussi rangé le matériel hors de vue.

**Sophia**
> Et pour “cibler le joint réflexe”, c’est fait ou pas fait ?

**Trace courte**
- http_status: `200`
- response_owner: pending handler WhatsApp
- selected_handler: `daily_action_review_v1`
- route_reason: pending daily action review active
- safety: none
- direct_effects: none
- operation: no commit yet
- pending_confirmation: `pending`
- memory_plan: n/a
- executed_tools: none
- durable_effect: aucun commit; 2 items stabilises `completed`, 1 item reste sans outcome

Systeme observe:

- `Faire un sas de décompression (sans fumer)` -> `completed`, confidence `high`, evidence: `J'ai bien fait le sas de décompression`
- `Ranger le matériel hors de vue` -> `completed`, confidence `high`, evidence: `j'ai aussi rangé le matériel hors de vue`
- `Cibler le joint réflexe` reste `outcome=null`, `missing_slots=["outcome"]`
- Le runtime avance bien la file: `current_focus_occurrence_ids=["80fdc319-6115-493b-8e64-1db689665535"]`, `remaining_occurrence_ids=[]`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, j'ai au moins ciblé le moment réflexe : c'est quand je tends la main vers le joint sans réfléchir.

**Sophia**
> C’est noté pour les trois actions.

**Trace courte**
- http_status: `200`
- response_owner: pending handler WhatsApp
- selected_handler: `daily_action_review_v1`
- route_reason: daily review complete
- safety: none
- direct_effects: none
- operation: `log_daily_action_review`
- pending_confirmation: `done`
- memory_plan: n/a
- executed_tools: daily review executor
- durable_effect: 3 `user_plan_item_entries` creees, 3 occurrences passees `done`

Effets observes avant nettoyage:

- `3db6278b-bd59-4401-bbdf-80b575ee14bb` -> `outcome=completed`, `source=daily_action_review_v1`, `occurrence_status=done`
- `ba4815d2-2af7-4d55-8c08-ec355c43988a` -> `outcome=completed`, `source=daily_action_review_v1`, `occurrence_status=done`
- `bd2ef2a9-de7b-48ef-bb4d-fd2e6356561c` -> `outcome=completed`, `source=daily_action_review_v1`, `occurrence_status=done`
- La reponse "au moins ciblé..." a bien ete classee comme action faite, pas comme partiel bloquant.

### Tour 3

**Verdict du tour:** green

**User**
> Merci, c’est tout pour ce soir.

**Sophia**
> C’est bon, on s’arrête là pour ce soir. Reprends demain, sans te rajouter d’action. 🙂

**Trace courte**
- http_status: `200`
- endpoint: `/functions/v1/test-send-message`
- force_full_ai: `true`
- response_owner: `normal_reply`
- selected_handler: `null`
- route_reason: `normal_reply_default`
- safety: none
- direct_effects: none
- operation: none
- pending_confirmation: aucun pending daily actif
- memory_plan: present dans trace routeur
- executed_tools: none
- durable_effect: aucun effet daily additionnel

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**

- L'ouverture est naturelle et compacte: Sophia ne liste que 2 actions, ce qui reste lisible.
- Le flow ne cloture pas trop tot: apres validation des deux actions visibles, Sophia demande explicitement la 3e.
- La question sur la 3e est courte et claire.
- La confirmation finale est concise et ne relance pas de solution inutile.
- La sortie post-daily est naturelle: Sophia accepte l'arret sans rouvrir le daily ni proposer un outil.

**Problemes**

- Aucun probleme bloquant observe.

**Fix propose**

- Source amont: aucun fix requis sur ce run.
- Correction recommandee: conserver l'invariant "targets totales en pending, subset visible par etape, file obligatoire jusqu'a coverage complete".
- Tests d'invariant attendus: regression daily avec 1, 2, 3 et 4 targets; commit interdit tant qu'une target sans outcome reste dans `review_state.items`.

## 4. Analyse Systeme

**Verdict: green**

**Routage**

- `process-checkins` cree correctement un pending `chat_capability=daily_action_review`.
- `whatsapp-webhook/handlers_pending` prend ownership pendant le pending.
- Le global dispatcher n'est pas appele pendant la collecte daily.
- Apres `pending_status=done`, le message suivant repasse bien en `normal_reply` via `test-send-message force_full_ai=true`.

**Skills / Operations / Tools**

- `daily_action_review_v1` reconnait deux actions dans le premier message user et met a jour les deux en une seule passe.
- Le reducer/runtime conserve la 3e target et la promeut en prochaine question.
- La reponse nuancee "au moins ciblé..." est traitee comme `completed`, conformement a la regle "fait meme a moitie = fait".
- L'executor daily cree 3 entries `daily_action_review_v1`; aucun `track_progress_plan_item` concurrent n'est observe.

**Memory / Effets durables**

- Avant nettoyage, 3 `user_plan_item_entries` etaient presentes avec `source=daily_action_review_v1`.
- Les 3 occurrences ciblees etaient passees `done`.
- Le pending etait `done`.
- Nettoyage effectue apres verification:
  - entries supprimees: 3
  - pending supprime: 1
  - scheduled checkins supprimes: 2, incluant le checkin morning parasite cree par la tentative initiale de scheduler
  - messages du run supprimes: 7
  - occurrences restaurees en `planned` avec leur `source` d'origine

**Problemes**

- Aucun probleme systeme observe sur le flow daily.

**Fix propose**

- Source amont: aucun fix requis.
- Correction recommandee: ajouter ce scenario a la regression QA daily "3 targets, opening subset=2, forced queue for remaining target".
- Tests d'invariant attendus:
  - `pending.payload.targets.length=3`
  - `asked_occurrence_ids.length=2`
  - apres tour 1: `pending.status=pending`, `entries_count=0`, `review_state.items` contient toujours les 3 occurrences
  - apres tour 2: `pending.status=done`, `entries_count=3`, occurrences `done`
  - apres sortie: `response_owner=normal_reply`

## Verdict Global

- Verdict: green
- Raison principale: le daily gere correctement une ouverture partielle sur 2 actions tout en imposant la collecte de la 3e avant commit.
- Follow-up prioritaire: formaliser ce run comme regression daily multi-target avec queue obligatoire et reponse nuancee classee `completed`.
