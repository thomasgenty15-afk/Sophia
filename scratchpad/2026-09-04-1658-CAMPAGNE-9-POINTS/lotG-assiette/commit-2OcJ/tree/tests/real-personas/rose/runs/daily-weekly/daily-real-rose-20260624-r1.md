# QA Run Report - Daily Action Review

## 1. Contexte Du Test

- Date: 2026-06-24
- Run: `daily-real-rose-20260624-r1`
- Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`)
- Objectif: verifier le flow daily normal, sans create one-shot reminder, avec 3 targets, collecte complete, commit DB, puis retour au dispatcher global.
- Trajectoire: `process-checkins` -> pending `daily_action_review` -> `whatsapp-webhook` daily -> commit daily -> `test-send-message` avec `force_full_ai=true`.
- Surfaces visees: `whatsapp_pending_actions`, `daily_action_review_v1`, visible daily, reducer/effects daily, `user_plan_item_entries`, statuts occurrences, retour `normal_reply`.
- Cadre IA reel: Supabase local, webhook WhatsApp local pour le pending daily, post-daily via `POST /functions/v1/test-send-message` avec `force_full_ai=true`. Pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Les reponses user ont ete choisies tour par tour apres lecture de Sophia et des traces courtes.
- Raw state: `tests/real-personas/rose/runs/daily-weekly/daily-real-rose-20260624-r1.raw.json`
- Nettoyage: cible et verifie. 3 entries, 7 messages, 1 pending et 1 scheduled checkin supprimes ; les 3 occurrences restaurees ; le memo temporaire daily dans `user_chat_states` nettoye.

Targets injectees dans le pending:

- `a8c5e803-1c14-4bbf-add0-f8d7802dd636` - Faire un sas de decompression (sans fumer)
- `80fdc319-6115-493b-8e64-1db689665535` - Cibler le joint reflexe
- `934ee6ce-a44b-4c3f-8266-defe9246131f` - Ranger le materiel hors de vue

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**User**
> Ouverture proactive daily par Sophia via `process-checkins`.

**Sophia**
> Je reviens sur tes deux actions du jour : le sas de decompression (sans fumer) et le materiel range hors de vue.  
> Tu en es ou la-dessus pour aujourd'hui ?

**Trace courte**
- http_status: `200` via `process-checkins`
- pending_status: `pending`
- targets_count: `3`
- asked_first_batch: `2`
- remaining_occurrence_ids: `["80fdc319-6115-493b-8e64-1db689665535"]`
- durable_effect: pending daily cree, aucune entry encore

### Tour 1

**Verdict du tour:** green

**User**
> Le sas est fait. Le materiel, non : j'etais epuisee et je l'ai laisse dehors, mais ca reste utile pour demain.

**Sophia**
> Et pour « Cibler le joint reflexe », c'est fait ou pas fait ?

**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_state_status: `needs_clarification`
- entries_count: `0`
- item sas: `completed`, `missing_slots=[]`
- item materiel: `missed`, `reason_text="epuisement"`, `still_relevant=true`, `missing_slots=[]`
- item joint reflexe: `outcome=null`, `missing_slots=["outcome"]`
- current_focus: `["80fdc319-6115-493b-8e64-1db689665535"]`
- durable_effect: aucun commit avant couverture des 3 targets

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Oui, fait aussi : j'ai repere que le reflexe arrive surtout juste apres le diner.

**Sophia**
> C'est note pour les 3 points : le sas est fait, le reflexe est mieux cible, et le materiel est reste dehors.

**Trace courte**
- http_status: `200`
- pending_status: `done`
- entries_count: `3`
- occurrence sas: `done`
- occurrence materiel: `rescheduled`
- occurrence joint reflexe: `done`
- durable_effect:
  - sas de decompression: entry `completed`, `reason_category=none`
  - ranger le materiel: entry `missed`, `reason_text=epuisement`, `still_relevant=true`, `rescheduled_tomorrow`, mais `reason_category=null`
  - cibler le joint reflexe: entry `completed`, evidence `j'ai repere que le reflexe arrive surtout juste apres le diner`

**Analyse si yellow/red**
- Symptome: l'effet durable est correct, mais la categorie de raison n'est pas normalisee pour `epuisee/epuisement`.
- Source amont probable: normalisation/categorisation daily de la raison apres capture du texte.
- Owner runtime: `daily_action_review_v1` extraction ou mapping `reason_category`.
- Meilleure correction selon les guidelines: mapper fatigue/epuisement/HS vers `reason_category=fatigue` tout en conservant `reason_text`.
- Pourquoi ce n'est pas un patch local: le visible et le commit fonctionnent ; le probleme est une projection metier incomplete dans l'entry daily.

### Tour Post-Daily

**Verdict du tour:** green

**User**
> Merci, c'est tout pour ce soir.

**Sophia**
> Bien recu, repose-toi 🙂

**Trace courte**
- http_status: `200`
- endpoint: `test-send-message`
- force_full_ai: `true`
- response_owner: `normal_reply`
- pending_status: `done`
- durable_effect: aucun nouvel effet daily

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**

- L'ouverture est claire et limitee au premier batch de 2 actions.
- Apres la reponse mixte `fait / pas fait`, Sophia ne redemande pas la raison deja donnee.
- La 3e action est reprise avec la bonne question `fait ou pas fait`, pas une question de pertinence.
- La confirmation finale est courte et comprehensible.

**Problemes**

- Aucun probleme visible bloquant pour l'utilisateur.

**Fix propose**

- Aucun fix UX prioritaire sur ce run.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**

- Le pending daily est bien ouvert par `process-checkins`.
- Les tours du pending passent par `whatsapp-webhook` et `daily_action_review_v1`.
- Apres commit, le tour suivant passe par `normal_reply` via `test-send-message force_full_ai=true`.

**Skills / Operations / Tools**

- Aucun create one-shot reminder ni tool non daily n'a ete appele.
- Aucun commit n'est applique avant couverture des 3 targets.
- Le commit final cree bien 3 `user_plan_item_entries`.
- Le reschedule de l'action manquee est applique uniquement parce que le user dit que ca reste utile pour demain.

**Memory / Effets durables**

- Effets durables finaux corrects avant nettoyage:
  - 2 actions en `completed`;
  - 1 action en `missed_rescheduled_tomorrow`;
  - pending `done`.
- Warning metadata: l'entry manquee porte `reason_text=epuisement`, mais `reason_category=null`.
- Nettoyage QA verifie: entries/messages/pending/scheduled checkin supprimes, occurrences restaurees, memo temporaire daily nettoye.

**Problemes**

- Tour 2: categorie de raison manquante sur une raison de fatigue explicite. Famille: `BF-PROACTIVE-01`. Impact systeme: analytics/weekly peuvent perdre le regroupement `fatigue`, meme si le texte de preuve et le reschedule sont corrects. Severite: yellow.

**Fix propose**

- Source amont: normalisation daily de `reason_category`.
- Correction recommandee: ajouter un invariant de mapping semantique fatigue/epuisement vers `fatigue`, sans regex de phrase exacte et sans relancer une clarification si `reason_text` est deja exploitable.
- Tests d'invariant attendus:
  - `epuisee`, `epuisement`, `HS`, `trop fatiguee` produisent `reason_category=fatigue`.
  - le daily ne redemande pas la raison quand `reason_text` est exploitable.
  - le weekly/status lit correctement les causes de daily depuis `reason_category`.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow daily normal fonctionne et les deux bugs du run precedent sont corriges en pratique, mais la categorisation metier de la raison reste incomplete.
- Follow-up prioritaire: normaliser `epuisement` vers `reason_category=fatigue` dans le daily.
