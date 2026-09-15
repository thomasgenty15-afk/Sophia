# QA Run Report - Daily Action Review

## 1. Contexte Du Test

- Date: 2026-06-23
- Run: `daily-real-rose-20260623-r2`
- Persona: Rose (`02dc9ae2-4128-412b-b0be-56712bf775a8`)
- Objectif: verifier le flow daily en conditions reelles avec 3 targets, ouverture par `process-checkins`, collecte complete, commit DB, puis retour au dispatcher global.
- Trajectoire: `process-checkins` -> pending `daily_action_review` -> `whatsapp-webhook` daily -> commit daily -> `test-send-message` avec `force_full_ai=true`.
- Surfaces visees: `whatsapp_pending_actions`, `daily_action_review_v1`, visible daily, reducer/effects daily, `user_plan_item_entries`, statuts occurrences, retour `normal_reply`.
- Cadre IA reel: Supabase local, webhook WhatsApp local pour le pending daily, post-daily via `POST /functions/v1/test-send-message` avec `force_full_ai=true`. Pas de renderer deterministe, pas de fallback direct.
- Validite QA: valide. Les reponses user ont ete choisies tour par tour apres lecture de Sophia et des traces courtes.
- Raw state: `tests/real-personas/rose/runs/daily-weekly/daily-real-rose-20260623-r2.raw.json`
- Nettoyage: cible et verifie. 3 entries, 11 messages, 1 pending et 1 scheduled checkin supprimes ; les 3 occurrences restaurees a l'etat initial.

Targets injectees dans le pending:

- `de203918-6ca6-4b93-af3f-5d81f825c8d3` - Faire un sas de decompression (sans fumer)
- `934ee6ce-a44b-4c3f-8266-defe9246131f` - Ranger le materiel hors de vue
- `80fdc319-6115-493b-8e64-1db689665535` - Cibler le joint reflexe

## 2. Tours De Conversation

### Tour 0

**Verdict du tour:** green

**User**
> Ouverture proactive daily par Sophia via `process-checkins`.

**Sophia**
> Je repasse pour ton bilan du soir.  
> Tu as pu faire ton sas de decompression sans fumer, et ranger le materiel hors de vue ?

**Trace courte**
- http_status: `200` via `process-checkins`
- pending_status: `pending`
- targets_count: `3`
- asked_first_batch: `2`
- remaining_occurrence_ids: `["80fdc319-6115-493b-8e64-1db689665535"]`
- durable_effect: pending daily cree, aucune entry encore

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - Slot fourni mais redemande

**User**
> J'ai fait le sas de decompression. Par contre je n'ai pas range le materiel, j'etais trop crevee ; ca reste pertinent et je le ferai demain.

**Sophia**
> Qu'est-ce qui t'a empechee de ranger le materiel cette fois-ci ?

**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_state_status: `collecting`
- entries_count: `0`
- direct_effects: aucun commit avant slots complets
- item `de203...`: `completed`, evidence `J'ai fait le sas de decompression.`
- item `934...`: `missed`, still_relevant `true`, evidence contient `j'etais trop crevee`, mais `reason_text=null`, `missing_slots=["reason"]`
- remaining_occurrence_ids: `["80fdc319-6115-493b-8e64-1db689665535"]`

**Analyse si yellow/red**
- Symptome: Sophia redemande la raison alors que le user a donne `j'etais trop crevee`.
- Source amont probable: extraction/normalisation du slot reason dans le dispatcher/reducer daily.
- Owner runtime: `daily_action_review_v1` slot filler/reducer.
- Meilleure correction selon les guidelines: stabiliser l'invariant "fatigue/trop crevee" comme raison exploitable pour missed, sans redemande si `reason_text` peut etre rempli avec confiance.
- Pourquoi ce n'est pas un patch local: le probleme est contractuel sur la capture des slots daily, pas une phrase visible a remplacer.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-01` - Slot fourni mais redemande

**User**
> La fatigue, vraiment. J'etais trop crevee pour le faire correctement.

**Sophia**
> Tu peux me dire en une phrase la raison la plus utile pour le bilan ?

**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_state_status: `collecting`
- entries_count: `0`
- item `934...`: `reason_text="trop crevee / fatigue"`, `reason_category="fatigue"`, still_relevant `true`
- anomalie systeme: `missing_slots=["reason"]` reste present malgre `reason_text` et `reason_category`
- remaining_occurrence_ids: `["80fdc319-6115-493b-8e64-1db689665535"]`

**Analyse si yellow/red**
- Symptome: le state contient la raison, mais le flow la redemande encore.
- Source amont probable: merge/reducer daily qui ne recalcule pas `missing_slots` apres update du champ `reason`.
- Owner runtime: reducer/state daily.
- Meilleure correction selon les guidelines: recalculer `missing_slots` depuis l'etat metier stabilise apres chaque merge, et ne jamais conserver `reason` manquant si `reason_text` ou `reason_category` est pose avec confiance.
- Pourquoi ce n'est pas un patch local: le bug vient d'une contradiction d'etat, pas d'un probleme de wording visible.

### Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> La raison utile pour le bilan : fatigue.

**Sophia**
> Est-ce que cibler le joint reflexe reste pertinent pour toi ?

**Trace courte**
- http_status: `200`
- pending_status: `pending`
- review_state_status: `needs_clarification`
- entries_count: `0`
- item `934...`: `missed`, `reason_text="fatigue"`, `reason_category="fatigue"`, `missing_slots=[]`
- item `80...`: `outcome=null`, `missing_slots=["outcome"]`
- current_focus: `["80fdc319-6115-493b-8e64-1db689665535"]`
- remaining_occurrence_ids: `[]`

**Analyse si yellow/red**
- Symptome: Sophia passe bien a la 3e action, mais pose une question de pertinence alors que le slot manquant est l'outcome fait/pas fait.
- Source amont probable: mapping `visible_task`/stage daily pour une target non encore repondue.
- Owner runtime: daily queue/stage selection.
- Meilleure correction selon les guidelines: quand une target devient focus avec `outcome=null`, le prochain visible doit demander d'abord si l'action a ete faite ou non ; la pertinence ne vient qu'apres un missed non resolu.
- Pourquoi ce n'est pas un patch local: il faut corriger la priorite des slots par target dans le contrat daily, pas reformuler cette phrase.

### Tour 4

**Verdict du tour:** green

**User**
> Oui ca reste pertinent, et je l'ai fait : j'ai identifie le moment ou la main part vers le joint.

**Sophia**
> C'est note : tu as bien cible le joint reflexe.

**Trace courte**
- http_status: `200`
- pending_status: `done`
- review_state_status: `complete`
- entries_count: `3`
- occurrence `de203...`: `done`
- occurrence `934...`: `rescheduled`
- occurrence `80...`: `done`
- durable_effect:
  - sas de decompression: entry `completed`
  - ranger le materiel: entry `missed`, `reason_category=fatigue`, `still_relevant=true`, `rescheduled_tomorrow`
  - cibler le joint reflexe: entry `completed`

### Tour Post-Daily

**Verdict du tour:** green

**User**
> Merci, c'est tout pour ce soir.

**Sophia**
> D'accord, bonne nuit 🙂

**Trace courte**
- http_status: `200`
- endpoint: `test-send-message`
- force_full_ai: `true`
- response_owner: `normal_reply`
- pending_status: `done`
- durable_effect: aucun nouvel effet daily

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**

- L'ouverture est courte et naturelle.
- Le flow accepte un premier batch de 2 actions et garde bien la 3e action en file d'attente.
- La sortie daily est propre apres commit, et le message suivant repart en conversation normale.

**Problemes**

- Tour 1: Sophia redemande une raison deja donnee. Famille: `BF-INTAKE-01`. Impact: friction visible, le user doit repeter une information evidente. Severite: yellow.
- Tour 2: la meme raison est capturee dans le state mais reste marquee manquante. Famille: `BF-INTAKE-01`. Impact: experience mecanique, risque de boucle. Severite: red.
- Tour 3: la 3e action est bien reprise, mais avec la mauvaise question initiale. Famille: `BF-PROACTIVE-01`. Impact: le user doit deviner qu'il peut donner l'outcome malgre une question de pertinence. Severite: yellow.

**Fix propose**

- Source amont: reducer/slot coverage daily et stage selection daily.
- Correction recommandee: recalculer les slots manquants apres merge metier ; pour une target non encore traitee, prioriser `outcome` avant toute question de pertinence.
- Tests d'invariant attendus:
  - `missed + phrase de fatigue` doit remplir `reason_category=fatigue` sans redemande.
  - si `reason_text` est pose, `missing_slots` ne doit plus contenir `reason`.
  - une target `not_asked/outcome` doit produire une question fait/pas fait, pas une question `still_relevant`.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**

- Le pending daily est bien ouvert par `process-checkins`.
- Les tours du pending passent par `whatsapp-webhook` et `daily_action_review_v1`.
- Apres commit, le tour suivant passe par `normal_reply` via `test-send-message force_full_ai=true`.

**Skills / Operations / Tools**

- Aucun executor n'est appele avant slots complets.
- Le commit final cree bien 3 `user_plan_item_entries`.
- Le reschedule de l'action manquee est applique quand le user dit que l'action reste pertinente et qu'elle sera faite demain.

**Memory / Effets durables**

- Effets durables finaux corrects avant nettoyage:
  - 2 actions en `completed`;
  - 1 action en `missed_rescheduled_tomorrow`;
  - pending `done`.
- Nettoyage QA verifie: entries/messages/pending/scheduled checkin supprimes, occurrences restaurees a leur etat initial.

**Problemes**

- Tour 1-2: extraction et coverage du slot `reason` incoherentes. Famille: `BF-INTAKE-01`. Impact systeme: blocage inutile avant passage a la target suivante. Severite: red.
- Tour 3: selection de stage incorrecte pour la target restante. Famille: `BF-PROACTIVE-01`. Impact systeme: le flow sait que `outcome` manque mais demande `still_relevant`. Severite: yellow.

**Fix propose**

- Source amont: `daily_action_review_v1` reducer/state merge et visible stage selector.
- Correction recommandee:
  - faire du reducer la source de verite de coverage par item apres chaque update ;
  - interdire une sortie visible `clarify_still_relevant` tant que `outcome` est `null` ou `unclear`;
  - ajouter un test integration avec 3 targets, 2 en ouverture, puis 1 restante.
- Tests d'invariant attendus:
  - `remaining_occurrence_ids` pilote obligatoirement le prochain focus jusqu'a coverage de toutes les targets.
  - le daily ne peut passer `complete` que si chaque target a `completed` ou `missed` avec les slots requis.
  - la description complete des actions reste presente dans le pending ; ce run confirme qu'elle etait bien injectee.

## Verdict Global

- Verdict: yellow
- Raison principale: le workflow finit correctement et les effets durables sont bons, mais le daily conserve une contradiction de slots et pose une mauvaise question sur la target restante.
- Follow-up prioritaire: corriger le recalcul `missing_slots` et la priorite des stages visibles pour les targets restantes.
