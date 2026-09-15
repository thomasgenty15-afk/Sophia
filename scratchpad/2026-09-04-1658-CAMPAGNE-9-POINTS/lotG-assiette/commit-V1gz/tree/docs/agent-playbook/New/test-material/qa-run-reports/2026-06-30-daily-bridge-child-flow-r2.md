# QA Run Report - daily-bridge-child-flow-20260630-r2

## 1. Contexte Du Test

- Date: 2026-06-30
- Run: `daily-bridge-child-flow-20260630-r2`
- Persona: Rose, Supabase local
- Objectif: verifier apres fix le chemin `daily_action_review_v1 -> daily_action_coaching_recommendation_v1 -> retour daily -> commit`.
- Trajectoire: fixture 2 plans / 4 actions -> `process-checkins` -> pending WhatsApp -> `/functions/v1/whatsapp-webhook` -> deux demandes explicites d'aide -> child flow specialise -> reprise daily autonome -> commit.
- Surfaces visees: `whatsapp-webhook`, pending daily, dispatcher local daily, child flow `daily_action_coaching_recommendation_v1`, visible `action_plan_coaching`, note de retour parent, reducer/effects `log_daily_action_review`.
- Cadre IA reel: Supabase local, webhook WhatsApp local, IA reelle, aucun `test-send-message`, aucun fallback deterministe.
- Validite QA: valide. Le run passe par le vrai pending WhatsApp local. Cleanup cible effectue et verifie.
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-bridge-child-flow-20260630-r2.raw.json`

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily depuis pending QA.

**Sophia**
> Je fais un petit point sur ta soirée : comment ça s’est passé pour la journée sans fumer et les 5 minutes de respiration quand une envie montait ?

**Trace courte**
- response_owner: pending daily
- selected_handler: `daily_action_review_v1`
- durable_effect: pending ouvert avec 4 targets

### Tour 1

**Verdict du tour:** green

**User**
> Oui, vas-y pour le bilan.

**Sophia**
> Je fais un petit point sur ta soirée : comment ça s’est passé pour la journée sans fumer et les 5 minutes de respiration quand une envie montait ?

**Trace courte**
- http_status: `200`
- response_owner: `scheduled_checkin`
- selected_handler: `daily_action_review_v1`
- pending_confirmation: `pending`
- durable_effect: entries_count=`0`

### Tour 2

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?

**Sophia**
> « Journée sans fumer », c’était tenir la journée sans fumer de joint, en faisant attention au moment où l’envie monte. Faisable aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: “Faisable aujourd’hui ?” est moins clair que la consigne canonique “fait ou pas fait”.
- Source amont probable: visible daily `explain_target` / contrat de wording outcome.
- Owner runtime: visible daily.
- Meilleure correction selon les guidelines: renforcer le contrat visible pour toujours demander `fait/pas fait`, sans ouvrir un troisième état implicite.

### Tour 3

**Verdict du tour:** green

**User**
> Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.

**Sophia**
> Pour **Respiration cinq minutes**, c’est fait ou pas fait aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: state daily partiel, no DB commit yet

### Tour 4

**Verdict du tour:** green

**User**
> Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?

**Sophia**
> Respiration cinq minutes, c’est prendre cinq minutes pour respirer calmement, afin de traverser une envie sans fumer.  
> C’est un appui court pour te laisser passer le moment sans réagir tout de suite.  
> Fait ou pas fait aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: none

### Tour 5

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Pas faite non plus : j’oublie à chaque fois quand l’envie monte. Je n’y arrive pas, tu peux m’aider à trouver le bon levier Sophia pour réussir celle-là ?

**Sophia**
> Je partirais sur une carte d’attaque, technique ancre visuelle : comme tu oublies au moment où l’envie monte, le plus utile est d’avoir un repère visible qui te relance tout de suite vers la respiration. Tu la prépares depuis l’action « Respiration cinq minutes » dans le Plan.
>
> Pour « Ranger deux papiers administratifs », c’est bien : fait, pas fait, ou en partie ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_coaching_recommendation`
- selected_handler: `daily_action_review_v1`
- child return note: `bridge_kind=daily_action_coaching_to_parent`
- recommended_feature: `attack_card`
- note occurrence: `Respiration cinq minutes`
- active_skill_state after turn: `null`
- durable_effect: daily state updated, no DB commit yet

**Analyse si yellow/red**
- Symptome principal corrige: le global ne capture plus le tour; le child flow specialise repond et daily reprend.
- Warning restant: la question de reprise contient encore “en partie”, wording qu'on voulait retirer.
- Source amont probable: visible daily current outcome question.
- Owner runtime: visible daily prompt / stage contract.
- Meilleure correction selon les guidelines: supprimer `en partie` des contrats visibles et schema visible daily; garder seulement “fait ou pas fait”, tout fait meme a moitie etant note comme fait cote reducer.

### Tour 6

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?

**Sophia**
> Ranger deux papiers administratifs, c’était simplement de choisir deux courriers, puis de les trier et les ranger ou les jeter.  
> Pour « Ranger deux papiers administratifs », c’est bien : fait, pas fait, ou en partie ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: none

**Analyse si yellow/red**
- Symptome: meme wording “en partie”.
- Source amont probable: visible daily `explain_target`.
- Owner runtime: visible daily.

### Tour 7

**Verdict du tour:** green

**User**
> Non, pas fait : je bloque complètement et je repousse dès que je vois les papiers. Aide-moi à trouver quoi faire pour y arriver.

**Sophia**
> Je partirais sur une carte d’attaque, technique texte magique : ton blocage a l’air de venir du réflexe mental au moment de voir les papiers, donc une phrase courte peut t’aider à couper l’élan de rejet et démarrer.
>
> Pour « Préparer la pochette documents », tu le considères plutôt fait ou pas fait ?

**Trace courte**
- response_owner: `daily_action_coaching_recommendation`
- selected_handler: `daily_action_review_v1`
- child return note: `bridge_kind=daily_action_coaching_to_parent`
- note occurrence: `Ranger deux papiers administratifs`
- recommended_feature: `attack_card`
- active_skill_state after turn: `null`
- durable_effect: daily state updated, no DB commit yet

### Tour 8

**Verdict du tour:** green

**User**
> Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?

**Sophia**
> Préparer la pochette documents, c’était pour regrouper tes papiers utiles au même endroit, bien visibles, afin de te simplifier les recherches et de réduire le blocage quand tu vois les documents.  
> Fait ou pas fait aujourd’hui ?

**Trace courte**
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- durable_effect: none

### Tour 9

**Verdict du tour:** green

**User**
> Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.

**Sophia**
> C’est clôturé pour aujourd’hui : 4 actions ont été prises en compte.

**Trace courte**
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- pending_confirmation: `done`
- review_status: `complete`
- active_skill_state final: `null`
- durable_effect: `log_daily_action_review x4`
- entries: `emotional`, `forgot`, `too_hard`, `external`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Le bridge est fluide: Sophia donne une recommandation courte, puis reprend le daily avec la prochaine action.
- Les deux recommandations sont ciblees sur la bonne action.
- La cloture finale est courte, globale, et donne le nombre exact d'actions.

**Problemes**
- Tours 5-6: le wording “en partie” reapparait. Famille: `BF-PROACTIVE-01`. Impact: contredit la decision produit “fait meme a moitie = fait” et rend le daily plus robotique. Severite: yellow.
- Tour 2: “Faisable aujourd’hui ?” est moins net que “fait ou pas fait”. Famille: `BF-PROACTIVE-01`. Severite: yellow.

**Fix propose**
- Source amont: prompts visibles daily, surtout `clarify_outcome` et `explain_target`.
- Correction recommandee: contrat visible strict: toujours demander “fait ou pas fait”; ne jamais proposer “en partie”; ne pas remplacer outcome par “faisable”.
- Tests d'invariant attendus: QA visible daily multi-action qui grep les reponses pour absence de “en partie” et presence d'une demande outcome binaire.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- `handoff_to_child_flow` ne fallthrough plus vers le dispatcher global.
- Les tours d'aide ont `response_owner=daily_action_coaching_recommendation`.
- `selected_handler` reste `daily_action_review_v1`, ce qui indique que le pending daily garde l'ownership.
- `active_skill_state` est `null` apres chaque retour parent et en final.

**Skills / Operations / Tools**
- Child flow specialise utilise: `daily_action_coaching_recommendation_v1`.
- Visible reutilise: `action_plan_coaching` via wrapper daily.
- Aucun `coaching_recommendation` general observe sur les tours d'aide.
- Aucun `create_one_shot_reminder`.

**Memory / Effets durables**
- Pending final: `done`.
- Review state final: `complete`.
- Entries finales:
  - `Journée sans fumer`: outcome=`missed`, reason_category=`emotional`
  - `Respiration cinq minutes`: outcome=`missed`, reason_category=`forgot`
  - `Ranger deux papiers administratifs`: outcome=`missed`, reason_category=`too_hard`
  - `Préparer la pochette documents`: outcome=`missed`, reason_category=`external`
- Cleanup final: OK.

**Problemes**
- Aucun probleme systeme bloquant observe apres fix.

**Fix propose**
- Source amont: n/a pour le bridge.
- Correction recommandee: conserver un test integration webhook couvrant les assertions `response_owner=daily_action_coaching_recommendation`, `active_skill_state=null` apres retour, entries x4.
- Tests d'invariant attendus: le meme scenario en regression apres suppression du wording “en partie”.

## Verdict Global

- Verdict: yellow
- Raison principale: le bridge daily -> child coaching -> daily est corrige et valide systemiquement, mais le visible daily ressort encore “en partie”.
- Follow-up prioritaire: nettoyer le contrat visible daily pour supprimer “en partie” et imposer `fait/pas fait`, puis relancer un run court.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-30-daily-bridge-child-flow-r2-bugs.md`
