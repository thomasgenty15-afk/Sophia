# QA Run Report - Daily Two Runs R1

## 1. Contexte Du Test

- Date: 2026-06-18
- Run batch: `qa-daily-two-runs-20260618-r1`
- Persona: Rose locale, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: relancer deux runs `daily_action_review_v1`, depuis l'ouverture proactive daily, avec autant de tours que necessaire.
- Trajectoire: items actifs Rose -> occurrences QA ciblees -> `scheduled_checkins.action_evening_review_v2` -> `process-checkins` reel -> pending `daily_action_review` -> `whatsapp-webhook` local loopback -> verification DB -> cleanup cible.
- Surfaces visees: `process-checkins`, `whatsapp_pending_actions`, `whatsapp-webhook`, `daily_action_review_v1`, visible agents daily, `user_plan_item_entries`, `user_habit_week_occurrences`.
- Cadre IA reel: Supabase local, fonctions locales, LLM/reducer/effects reels, aucun renderer deterministe, aucun fallback direct, aucun patch applicatif pendant le run.
- Validite QA: valide. Le deuxieme run a attendu le min-gap local des `scheduled_checkins` avant de traiter le checkin QA; la file due ne contenait alors que le checkin QA `clarify`.

Grounding dynamique:

- Fichiers contexte lus: `tests/real-personas/rose/persona.md`, `current-plan.md`, `observations.md`, `timeline.md`.
- Plan actif: `Libération progressive du cannabis`.
- Items actifs DB utilises:
  - `Faire un sas de décompression (sans fumer)`
  - `Ranger le matériel hors de vue`
  - `Cibler le joint réflexe`
- Date locale: `2026-06-18`, week start `2026-06-15`, planned day `thu`.
- Artefacts raw:
  - `tmp/qa-daily-two-runs-20260618-r1/qa-daily-two-runs-20260618-r1-direct.raw.json`
  - `tmp/qa-daily-two-runs-20260618-r1/qa-daily-two-runs-20260618-r1-clarify.raw.json`
- Cleanup: effectue et verifie. `scheduled_checkins=0`, `whatsapp_pending_actions=0` pour les deux `qa_run_id`; entries et occurrences QA supprimees apres capture.

Verdict global: **yellow**.

## 2. Tours De Conversation

### Run 1 - Tour 0 - Ouverture Proactive

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01`

**User**
> Ouverture systeme via `process-checkins`.

**Sophia**
> Je fais le point sur tes actions d’aujourd’hui : sas de décompression (sans fumer) et matériel rangé hors de vue.  
> Comment ça s’est passé pour toi sur ces deux points ?

**Trace courte**
- http_status: `200`
- process_response: `success=true`, `processed=1`
- pending_status: `pending`
- targets_count: `3`
- asked_occurrence_ids: `2`
- not_yet_asked_occurrence_ids: `1`

**Analyse si yellow/red**
- Symptome: le pending contient 3 targets, mais l'ouverture visible n'en demande que 2.
- Impact: si le user ne mentionne pas spontanement la troisieme, le flow peut devoir relancer ou paraitre incomplet.
- Note: meilleur qu'avant, car la suite sait committer les 3 si le user repond aux 3.

### Run 1 - Tour 1

**Verdict du tour:** green

**User**
> Oui, j’ai fait les trois aujourd’hui : le sas en rentrant, le matériel est rangé, et j’ai identifié que le joint réflexe arrive surtout juste après le dîner.

**Sophia**
> C’est bien noté pour les trois : le sas en rentrant, le matériel rangé, et le joint réflexe ciblé juste après le dîner.

**Trace courte**
- selected_handler: `daily_action_review_v1`
- response_source: `daily_action_review`
- pending_status: `done`
- review_state.status: `complete`
- entries_count: `3`
- occurrence_statuses: `done`, `done`, `done`
- effects: 3 `log_daily_action_review`, source `daily_action_review_v1`, outcome `completed`
- completed_flow_memo: present

### Run 2 - Tour 0 - Ouverture Proactive

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01`

**User**
> Ouverture systeme via `process-checkins`.

**Sophia**
> Je reviens sur aujourd’hui : tu as pu faire ton sas de décompression (sans fumer) et ranger le matériel hors de vue ?

**Trace courte**
- http_status: `200`
- process_response: `processed=1`
- pending_status: `pending`
- targets_count: `3`
- asked_occurrence_ids: `2`
- not_yet_asked_occurrence_ids: `1`

**Analyse si yellow/red**
- Meme probleme que Run 1: ouverture visible sur 2 actions alors que le pending contient 3 targets.

### Run 2 - Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01`

**User**
> Le sas sans fumer, c’est fait. Par contre je ne suis pas sûre de ce que tu attends par « cibler le joint réflexe », et pour le matériel j’ai commencé mais je ne sais pas si ça compte.

**Sophia**
> Tu parles de laquelle : le sas de décompression, le matériel hors de vue, ou le joint réflexe ?

**Trace courte**
- selected_handler: `daily_action_review_v1`
- response_source: `daily_action_review_clarification`
- pending_status: `pending`
- review_state.status: `collecting`
- entries_count: `0`
- occurrences: all `planned`

**Analyse si yellow/red**
- Le message user distinguait 3 informations: sas fait, demande d'explication sur joint reflexe, materiel commence.
- Sophia pose une clarification "laquelle ?" trop generique au lieu de traiter le sas comme acquis, expliquer ou clarifier le joint reflexe, puis demander uniquement le statut du materiel.

### Run 2 - Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01`

**User**
> Ok, dans ce cas je l’ai fait : le moment réflexe, c’est juste après le dîner quand je range la cuisine.

**Sophia**
> Tu parles de quelle action : Faire un sas de décompression (sans fumer), Ranger le matériel hors de vue, ou Cibler le joint réflexe ?

**Trace courte**
- response_source: `daily_action_review_clarification`
- pending_status: `pending`
- entries_count: `0`
- occurrences: all `planned`

**Analyse si yellow/red**
- Sophia ne rattache pas "moment réflexe" a `Cibler le joint réflexe`, alors que le lien semantique est direct.
- Elle repete une clarification de cible au lieu de progresser.

### Run 2 - Tour 3

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01`

**User**
> Ok, dans ce cas je l’ai fait : le moment réflexe, c’est juste après le dîner quand je range la cuisine.

**Sophia**
> Tu me confirmes juste pour le sas de décompression : c’est fait ou pas fait ?

**Trace courte**
- response_source: `daily_action_review_clarification`
- pending_status: `pending`
- entries_count: `0`
- occurrences: all `planned`

**Analyse si yellow/red**
- Sophia demande une confirmation sur le sas alors que le user avait deja dit "Le sas sans fumer, c’est fait" au tour 1.
- C'est une perte de contexte intra-flow.

### Run 2 - Tour 4

**Verdict du tour:** green systeme, yellow UX

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01`

**User**
> Je viens de finir le matériel aussi : grinder, feuilles et pochon sont dans une boîte fermée.

**Sophia**
> C’est noté pour les trois : sas sans fumer, matériel rangé hors de vue, et moment réflexe repéré juste après le dîner.

**Trace courte**
- response_source: `daily_action_review`
- pending_status: `done`
- review_state.status: `complete`
- entries_count: `3`
- occurrence_statuses: `done`, `done`, `done`
- effects: 3 `log_daily_action_review`, source `daily_action_review_v1`, outcome `completed`
- completed_flow_memo: present

**Analyse si yellow/red**
- Systeme final correct: les 3 entries sont bien creees.
- UX faible: Sophia commit correctement au final, mais apres deux relances inutiles et une question sur une info deja donnee.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le ton est court, calme, non culpabilisant.
- Le wording "partiel" n'apparait pas cote Sophia dans ces runs.
- Le succes final est clair et correspond aux effets DB.

**Problemes**
- Les ouvertures ne couvrent toujours que 2 actions alors que le pending contient 3 targets.
- En clarification, Sophia demande "quelle action ?" alors que le user donne des indices semantiques suffisants.
- Le flow oublie ou ne stabilise pas correctement une evidence deja donnee: "Le sas sans fumer, c’est fait."
- Le user doit repeter et contourner le flow pour arriver au commit.

**Fix propose**
- Source amont: `daily_action_review_v1` opening plan + local dispatcher/intake multi-target.
- Correction recommandee:
  - aligner strictement ouverture visible et coverage attendue, ou relancer explicitement sur la target non demandee;
  - renforcer la resolution semantique par titre/description: "moment réflexe" doit resolver `Cibler le joint réflexe`;
  - faire persister les slots deja acquis d'un tour a l'autre dans le raisonnement visible, pas seulement dans le reducer final.
- Tests d'invariant attendus:
  - 3 targets dans pending -> ouverture demande 3 ou indique clairement qu'une troisieme viendra ensuite;
  - reponse composite avec une action faite + une demande d'explication + une action commencee;
  - pas de clarification de cible quand le user utilise le nom exact ou une paraphrase forte de l'action.

## 4. Analyse Systeme

**Verdict: green avec warning UX**

**Routage**
- Les deux ouvertures passent par `process-checkins`.
- Les tours user passent par `whatsapp-webhook`.
- Le pending `daily_action_review` gagne bien sur le dispatcher global.
- Aucune sortie globale ou safety parasite observee.

**Skills / Operations / Tools**
- Le direct effect canonique est bien `log_daily_action_review`.
- Run 1: 3 effects committes au tour 1.
- Run 2: 3 effects committes au tour 4.
- `completed_flow_memo` present apres commit.

**Memory / Effets durables**
- Avant cleanup, chaque run cree 3 `user_plan_item_entries` avec `metadata.source=daily_action_review_v1`.
- `reason_category=none` pour completed.
- `reschedule_decision=null`, coherent pour actions faites.
- Occurrences passent a `done`.
- Cleanup cible effectue apres capture: checkins, pending, entries et occurrences QA supprimes.

**Problemes**
- L'orchestration QA a ete ralentie par le trigger local de min-gap `scheduled_checkins`, qui a repousse le deuxieme checkin a `14:02:30Z`. La file due a ete reverifiee avant traitement; elle contenait uniquement le checkin QA.
- La metadata visible ne remonte pas toujours le diagnostic detaille dans les messages `daily_action_review_clarification`; le raw contient surtout source/pending/status.
- Le champ `constraints` reste present dans `review_state` runtime, alors qu'on avait convenu de l'alleger cote prompt/contrat visible. C'est un bruit runtime a traiter separement si l'objectif est de simplifier les payloads persistés.

**Fix propose**
- Source amont UX: daily opening + intake local dispatcher.
- Source amont QA harness: ajouter un mode QA cible a `process-checkins` (`scheduled_checkin_id` ou `user_id`) pour eviter d'attendre le min-gap sans bypass ni manipulation.
- Source amont payload: auditer `review_state.constraints` si on veut vraiment supprimer ce bruit des payloads persistés.

## Verdict Global

- Verdict: **yellow**
- Raison principale: le commit durable daily fonctionne maintenant pour 3 targets, y compris quand l'ouverture n'en demande que 2, mais la clarification reste trop maladroite et force des repetitions inutiles.
- Follow-up prioritaire: corriger la resolution semantique multi-target du dispatcher daily et aligner ouverture visible/targets attendues.
