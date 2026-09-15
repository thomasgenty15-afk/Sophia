# QA Run Report - Daily Post-Fix Rerun R2

## 1. Contexte Du Test

- Date: 2026-06-18
- Run: `qa-daily-two-runs-20260618-r1-direct`
- Persona: Rose locale
- Objectif: verifier apres correction que le daily local sait traiter 3 targets, avec descriptions d'actions, et ne perd pas la troisieme target.
- Trajectoire: occurrences QA dynamiques -> `scheduled_checkins` `action_evening_review_v2` -> `process-checkins` local -> pending `daily_action_review` -> `whatsapp-webhook` local -> dispatcher local daily -> commit DB -> cleanup cible.
- Surfaces visees: `process-checkins`, ouverture proactive daily, `whatsapp_pending_actions`, `daily_action_review_v1`, visible commit success, `user_plan_item_entries`, statuts d'occurrences.
- Cadre IA reel: Supabase local, fonctions locales, LLM/reducer/executor reels, aucun renderer deterministe appele comme resultat QA, aucun fallback direct.
- Validite QA: partiellement valide. Le run direct est valide pour verifier le dispatcher local et les effets DB. Le batch complet n'est pas valide car le second scenario `clarify` n'a pas genere de pending (`process-checkins processed=0`) et n'a donc pas produit de conversation exploitable.

Artefacts:

- Raw direct: `tmp/qa-daily-two-runs-20260618-r1/qa-daily-two-runs-20260618-r1-direct.raw.json`
- Cleanup: le checkin/pending QA du scenario `clarify` reste a ete nettoye; verification finale: aucun checkin QA `direct/clarify` restant.

Targets du pending direct:

- `Faire un sas de decompression (sans fumer)` avec description presente.
- `Ranger le materiel hors de vue` avec description presente.
- `Cibler le joint reflexe` avec description presente.

## 2. Tours De Conversation

### Tour 0 - Ouverture Proactive

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** BF-LEDGER-01 - Claim sans commit; BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee

**Sophia**
> J’ai vu tes actions d’aujourd’hui : sas sans fumer + matériel rangé hors de vue, nickel.  
> Pour le sas, tu as fait quoi exactement pendant tes 45–60 minutes (douche, cuisine, sport, musique, autre) ?

**Trace courte**

- http_status: `200`
- process_response: `processed=1`
- pending_status: `pending`
- targets_count: `3`
- asked_occurrence_ids: `["62857914-050d-4293-95fc-e1b48ea24343","49b8107b-6f46-49a1-8cfe-56acc4718ba3"]`
- not_yet_asked_occurrence_ids: `["1733494d-f6b8-46aa-81ea-3d758b590ab3"]`
- durable_effect: aucun commit daily a ce stade

**Analyse si yellow/red**

- Symptome: l'ouverture dit "J'ai vu tes actions... nickel" avant preuve user et ne couvre que 2 actions visibles alors que le pending contient 3 targets.
- Source amont probable: prompt/garde visible d'ouverture daily dans `process-checkins`, pas le dispatcher local de reponse.
- Owner runtime: `process-checkins` / opening daily proactive.
- Meilleure correction selon les guidelines: interdire les claims de validation dans l'ouverture et forcer une formulation de collecte sur les targets du stage, avec mention explicite qu'il reste une file si toutes les targets ne sont pas affichees.
- Pourquoi ce n'est pas un patch local: le dispatcher local n'est pas encore appele au Tour 0; la phrase vient de la generation proactive d'ouverture.

### Tour 1

**Verdict du tour:** green

**User**
> Oui, j’ai fait les trois aujourd’hui : le sas en rentrant, le matériel est rangé, et j’ai identifié que le joint réflexe arrive surtout juste après le dîner.

**Sophia**
> Merci, c’est bien noté pour les trois.

**Trace courte**

- http_status: `200`
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- assistant_message_count: `1`
- pending_status: `done`
- review_status: `complete`
- entries_count: `3`
- direct_effects: `log_daily_action_review x3`
- durable_effect: 3 `user_plan_item_entries` outcome `completed`; 3 occurrences `done`

**Effets observes**

- `Faire un sas de decompression (sans fumer)`: outcome `completed`, evidence `j’ai fait le sas en rentrant`, occurrence `done`.
- `Ranger le materiel hors de vue`: outcome `completed`, evidence `le matériel est rangé`, occurrence `done`.
- `Cibler le joint reflexe`: outcome `completed`, evidence `j’ai identifié que le joint réflexe arrive surtout juste après le dîner`, occurrence `done`.

### Tentative Run 2 - Scenario Clarify

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**Incident**

- Scenario: `qa-daily-two-runs-20260618-r1-clarify`
- Symptome: le checkin QA a ete cree, mais aucun pending `daily_action_review` n'a ete genere.
- Reprocess manuel cible: `process-checkins processed=0`
- Pending observe: aucun.
- Action prise: nettoyage cible du checkin QA reste `pending`; verification finale sans checkin QA restant.

**Analyse si yellow/red**

- Source amont probable: selection `process-checkins` / conditions d'eligibilite du checkin QA, ou collision avec garde de cadence.
- Owner runtime: QA harness + `process-checkins` selection.
- Meilleure correction selon les guidelines: rendre le harness capable d'isoler un second checkin daily sans collision de cadence, ou documenter explicitement une variante single-run quand `process-checkins` refuse la seconde generation.
- Pourquoi ce n'est pas un patch daily local: le pending n'existe pas, donc le dispatcher local daily n'est jamais appele.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**

- Quand le user repond aux 3 actions dans une phrase naturelle, Sophia comprend et cloture sans clarification inutile.
- La reponse visible finale est courte et adaptee.

**Problemes**

- Tour 0: Sophia valide implicitement deux actions avant preuve. Famille: BF-LEDGER-01. Impact: le user peut croire que Sophia a deja enregistre ou juge les actions. Severite: yellow.
- Tour 0: l'ouverture ne montre pas la troisieme action alors que le pending en contient 3. Famille: BF-PROACTIVE-01. Impact: la collecte semble incomplete et depend du user pour mentionner spontanement la troisieme action. Severite: yellow.

**Fix propose**

- Source amont: opening proactive daily dans `process-checkins`.
- Correction recommandee: remplacer les formulations de validation par une question de collecte; si seulement 2 targets sont affichees, annoncer clairement qu'il y aura une suite ou que le check couvre plusieurs actions du jour.
- Tests d'invariant attendus: ouverture avec 1, 2, 3 et 4 targets; aucune phrase de type "c'est fait", "nickel", "j'ai vu" avant preuve user; si `targets_count > asked_occurrence_ids.length`, le pending garde une file restante et l'ouverture ne laisse pas croire que le daily est complet.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**

- Le run direct passe bien par le chemin local reel: `process-checkins` genere un pending, puis `whatsapp-webhook` traite la reponse via `daily_action_review_v1`.
- Le dispatcher local corrige le bug initial: il recoit les 3 targets avec descriptions et applique 3 updates en un tour.

**Skills / Operations / Tools**

- `daily_action_review_v1` produit 3 effets canoniques `log_daily_action_review`.
- Aucun `track_progress_plan_item` parasite n'est observe; le daily utilise bien son effet canonique.

**Side Effects**

- 3 entries creees avec `metadata.source=daily_action_review_v1`.
- 3 occurrences passent en `done`.
- `pending_status=done`, `review_status=complete`.

**Warnings Systeme**

- L'ouverture proactive reste mal cadree: elle peut produire une phrase de validation avant commit.
- Le batch multi-run n'est pas stable: le second checkin QA est reste `pending` et `process-checkins` a retourne `processed=0`.

**Fix propose**

- Source amont opening: renforcer le prompt/garde `buildDailyActionReviewInstruction` ou le repair guard d'ouverture pour interdire claims de preuve et couvrir correctement le stage.
- Source amont QA: isoler les run_ids et la cadence `process-checkins` pour permettre deux scenarios successifs sans blocage.

## Verdict Global

- Verdict: yellow
- Raison principale: le dispatcher local daily est corrige pour 3 targets, mais l'ouverture proactive daily reste trompeuse et le batch a echoue sur le second scenario.
- Follow-up prioritaire: corriger l'ouverture proactive daily avant de considerer le flow complet green.
