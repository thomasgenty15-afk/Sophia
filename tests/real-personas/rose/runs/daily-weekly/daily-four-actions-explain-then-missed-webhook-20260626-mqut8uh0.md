# QA Run Report - daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0

## 1. Contexte Du Test

- Date: 2026-06-26
- Run: `daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0`
- Persona: Rose, user `02dc9ae2-4128-412b-b0be-56712bf775a8`
- Objectif: tester un daily avec 2 plans et 4 actions, via le bon chemin `whatsapp-webhook`, ou le user demande une explication sur chaque action avant de la declarer non faite avec une excuse.
- Trajectoire: fixture pending `daily_action_review` avec 4 targets -> `whatsapp-webhook` tour par tour -> `daily_action_review_v1` -> `log_daily_action_review` -> verification DB -> cleanup cible.
- Surfaces visees: pending daily, dispatcher local daily, visible daily `explain_target` et clarifications, reducer/effects daily, `user_plan_item_entries.reason_category`, statuts occurrences, retour hors pending.
- Cadre IA reel: Supabase local, vrai webhook WhatsApp local, aucun renderer deterministe, aucun fallback direct, aucun `test-send-message` pendant le pending daily.
- Validite QA: valide pour le flow daily local. Limite: pending fixture dynamique creee directement pour eviter de dependre de `process-checkins`; le chemin teste est bien `whatsapp-webhook -> handlePendingActions -> daily_action_review_v1`.
- Raw: `tests/real-personas/rose/runs/daily-weekly/daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0.raw.json`
- Cleanup: effectue et verifie.

Targets du run:

- QA plan cannabis daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0: Journée sans fumer
- QA plan cannabis daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0: Respiration cinq minutes
- QA plan administratif daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0: Ranger deux papiers administratifs
- QA plan administratif daily-four-actions-explain-then-missed-webhook-20260626-mqut8uh0: Préparer la pochette documents

## 2. Tours De Conversation

### Tour 0 - Ouverture daily

**Verdict du tour:** green

**User**
> N/A - ouverture proactive daily depuis le pending QA.

**Sophia**
> Je fais le point sur aujourd'hui : Journée sans fumer et Respiration cinq minutes.
> Tu en es où sur ces deux-là ?

**Trace courte**
- http_status: opening fixture OK
- response_owner: pending daily
- selected_handler: `daily_action_review_v1`
- route_reason: pending `chat_capability=daily_action_review`
- safety: none
- direct_effects: none
- operation: pending daily ouvert
- pending_confirmation: pending `85fd004c-4b95-4f5d-85c7-ebe64b0a1f66`
- memory_plan: N/A
- executed_tools: none
- durable_effect: pending contient 4 targets, ouverture configuree sur les 2 premieres

### Tour 1

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?

**Sophia**
> « Journée sans fumer », ça veut dire tenir la journée sans joint, en restant attentive au moment où l’envie monte.  
> Faite ou pas faite aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 2

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.

**Sophia**
> Et pour « Respiration cinq minutes », c’est fait aujourd’hui ou pas fait ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 3

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?

**Sophia**
> « Respiration cinq minutes », c’était faire 5 minutes de respiration calme pour traverser une envie sans fumer. C’était juste un appui court pour passer le moment sans agir tout de suite. Fait aujourd’hui ou pas fait ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 4

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pas faite non plus : j’ai complètement oublié quand l’envie est montée. Je veux quand même la garder.

**Sophia**
> Pour « Ranger deux papiers administratifs », c’est fait ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 5

**Verdict du tour:** green

**Famille de bugs si yellow/red:** n/a

**User**
> Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?

**Sophia**
> Ça voulait dire : prendre deux courriers, les trier, puis les ranger ou les jeter. L’idée, c’était juste de faire un peu de place et d’avancer sur l’administratif.
> 
> C’est fait ou pas fait aujourd’hui ?

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review_clarification`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily actif`
- safety: none observed
- direct_effects: none observed
- operation: `daily_action_review_v1`
- pending_confirmation: `pending`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`0`, review_status=`needs_clarification`

### Tour 6

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Non, pas fait : j’étais trop fatiguée et j’ai remis ça à plus tard. Oui, c’est encore pertinent.

**Sophia**
> C’est noté pour les 4 actions de ta revue du jour. Ta journée est bien clôturée.

**Trace courte**
- http_status: `200`
- response_owner: `daily_action_review`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily done`
- safety: none observed
- direct_effects: `log_daily_action_review x4`
- operation: `daily_action_review_v1`
- pending_confirmation: `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`4`, review_status=`complete`

**Analyse si yellow/red**
- Symptome: Sophia cloture les 4 actions alors que le user repond seulement a l'action courante `Ranger deux papiers administratifs`; la 4e action `Préparer la pochette documents` n'a pas encore ete expliquee ni evaluee.
- Source amont probable: coverage gate daily/reducer trop permissif; une reponse non nommee a ete appliquee a une target restante non courante.
- Owner runtime: `daily_action_review_v1` reducer/effect plan.
- Meilleure correction selon les guidelines: avant `should_apply_effects=true`, verifier que chaque target commitee dispose d'une preuve propre reliee a cette occurrence ou a une reponse explicitement globale.
- Pourquoi ce n'est pas un patch local: le probleme n'est pas une phrase visible, c'est un effet durable faux (`log_daily_action_review` cree pour une action sans preuve).

### Tour 7

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?

**Sophia**
> 

**Trace courte**
- http_status: `502`
- response_owner: `whatsapp-webhook`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily done`
- safety: none observed
- direct_effects: `log_daily_action_review x4`
- operation: `daily_action_review_v1`
- pending_confirmation: `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`4`, review_status=`complete`

**Analyse si yellow/red**
- Symptome: le user continue naturellement vers la 4e action, mais le pending daily est deja ferme; le webhook retourne `502` et aucune reponse visible.
- Source amont probable: consequence directe du commit premature au tour 6.
- Owner runtime: `daily_action_review_v1` reducer/effect plan, puis robustesse post-close du webhook.
- Meilleure correction selon les guidelines: empecher la fermeture tant que la target courante/restante n'a pas de preuve; le post-close ne devrait pas etre atteint dans ce scenario.
- Pourquoi ce n'est pas un patch local: la correction doit bloquer le commit durable premature, pas seulement rendre une phrase de secours.

### Tour 8

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-PROACTIVE-01` - Daily/weekly preuve -> decision cassee

**User**
> Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.

**Sophia**
> 

**Trace courte**
- http_status: `502`
- response_owner: `whatsapp-webhook`
- selected_handler: `daily_action_review_v1`
- route_reason: `pending daily done`
- safety: none observed
- direct_effects: `log_daily_action_review x4`
- operation: `daily_action_review_v1`
- pending_confirmation: `done`
- memory_plan: N/A
- executed_tools: none
- durable_effect: entries_count=`4`, review_status=`complete`

**Analyse si yellow/red**
- Symptome: la vraie preuve de la 4e action arrive apres fermeture, n'est pas collectee, et la DB conserve a la place la raison fatigue heritee de l'action 3.
- Source amont probable: meme commit premature au tour 6.
- Owner runtime: `daily_action_review_v1` reducer/effect plan.
- Meilleure correction selon les guidelines: ne jamais creer une entry pour une target restante sans preuve ciblee; garder le daily actif et demander/traiter la 4e action.
- Pourquoi ce n'est pas un patch local: l'effet durable en DB est faux, avec mauvais `reason_category`.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Le daily garde l'ownership sur les tours du pending.
- Sophia avance dans la file des actions et va chercher les actions du second plan.
- La conversation reste dans le daily pendant les demandes d'explication et ne part pas vers `coaching_recommendation`.

**Problemes**
- Tour 6: cloture trop tot alors que la 4e action n'a pas ete traitee. Famille: BF-PROACTIVE-01. Impact: le user croit que le daily est fini alors qu'une action manque. Severite: red.
- Tours 7-8: le user essaie de continuer sur la 4e action, mais le flow est deja ferme et le webhook renvoie 502. Famille: BF-PROACTIVE-01. Impact: rupture conversationnelle et absence de reponse. Severite: red.

**Fix propose**
- Source amont: daily coverage gate / reducer / effect plan.
- Correction recommandee: `commit_success` interdit tant que toutes les targets du pending n'ont pas une preuve propre; une reponse au singulier sur la target courante ne peut pas etre appliquee automatiquement aux remaining targets.
- Tests d'invariant attendus: daily 4 targets avec demandes d'explication intercalees ne ferme pas avant la derniere target; chaque entry doit avoir une evidence differente ou explicitement globale.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tous les tours du pending passent via `whatsapp-webhook`.
- Le pending daily reste owner jusqu'au commit.
- Aucun `normal_reply` ou `coaching_recommendation` ne capture les preuves daily.

**Skills / Operations / Tools**
- Skill observe: `daily_action_review_v1`.
- Effet canonique attendu: `log_daily_action_review`.
- Aucun `create_one_shot_reminder` ni outil hors scope.

**Memory / Effets durables**
- Ranger deux papiers administratifs: outcome=`missed`, reason_category=`fatigue`, reason_text=`j’étais trop fatiguée et j’ai remis ça à plus tard`, blocker_hint=`fatigue`
- Journée sans fumer: outcome=`missed`, reason_category=`emotional`, reason_text=`j’ai fumé après une contrariété en fin d’après-midi`, blocker_hint=`emotional`
- Respiration cinq minutes: outcome=`missed`, reason_category=`forgot`, reason_text=`j’ai complètement oublié quand l’envie est montée`, blocker_hint=`forgot`
- Préparer la pochette documents: outcome=`missed`, reason_category=`fatigue`, reason_text=`j’étais trop fatiguée et j’ai remis ça à plus tard`, blocker_hint=`fatigue`

**Problemes**
- Tour 6: `Préparer la pochette documents` est commitee sans preuve utilisateur ciblee.
- Préparer la pochette documents: attendu `external`, observe `fatigue`.
- Tours 7-8: messages apres fermeture prematuree retournent `502` sans assistant visible.

**Fix propose**
- Source amont: daily reducer/effect admission, pas seulement mapping `reason_category`.
- Correction recommandee: le runtime doit refuser `should_apply_effects=true` si `committed_targets_count` couvre une target sans `matched_user_text`/`evidence_text` reliee a cette occurrence ou a une phrase globale explicite.
- Tests d'invariant attendus: webhook pending 4 targets cree 4 entries seulement apres preuve des 4 actions; une preuve de l'action courante ne remplit pas la target restante.

## Verdict Global

**red**

Le run reste a corriger selon les problemes listes ci-dessus.
