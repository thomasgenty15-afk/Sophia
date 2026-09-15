# QA Operation Suggestion - Test 3.1 - Nina - 2026-05-12 - adjust-plan-reduce-r1

## 1. Contexte Du Test

- Date: 2026-05-12
- Run: `test3-adjust-plan-reduce-r1`
- Persona: Nina
- Connexion: `tests/real-personas/nina/connection.json`, JWT via `bash scripts/get-jwt.sh nina`
- Objectif: tester qu'une action du plan jugee trop lourde declenche `adjust_plan_item`.
- Trajectoire: demande de reduction durable -> clarification de cible -> draft `adjust_plan_item` -> confirmation utilisateur -> execution.
- Surfaces visees: dispatcher `operation_intent`, operation flow `adjust_plan_item`, confirmation pending, executor, effet durable DB `user_plan_items.payload.active_operation_adjustment`.
- Cadre IA reel: endpoint local `POST /functions/v1/test-send-message`, `force_full_ai=true`, `disable_debounce=true`, aucun renderer deterministe, aucun fallback `processMessage`.
- Validite QA: valide. Une premiere invocation locale a echoue avant conversation avec `EPERM 127.0.0.1:54321` sous sandbox; le meme tour a ete relance avec autorisation locale, sans melanger de transcript.

Artefacts:

- Raw: `tests/real-personas/nina/runs/operations/2026-05-12-test3-test3-adjust-plan-reduce-r1.raw.json`
- Summary: `tests/real-personas/nina/runs/operations/2026-05-12-test3-test3-adjust-plan-reduce-r1.summary.json`
- Durable: `tests/real-personas/nina/runs/operations/2026-05-12-test3-test3-adjust-plan-reduce-r1.durable.json`

## 2. Tours De Conversation

### Tour 1

**User**
> Nettoyer tous mes placards, c'est trop gros, je veux rendre cette action beaucoup plus petite.

**Sophia**
> Je peux l'ajuster, mais il me manque la cible exacte. Donne-moi le nom de l'action du plan à clarifier.

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `adjust_plan_item`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: `[]`
- operation: `status=ask_question`, `missing_slots=["scope"]`
- pending_confirmation: none
- memory_plan: none
- executed_tools: `[]`
- durable_effect: aucun patch avant confirmation

### Tour 2

**User**
> L'action exacte, c'est Nettoyer ton environnement direct. Je veux la réduire, pas l'abandonner : juste une version beaucoup plus petite.

**Sophia**
> Je te propose d'ajuster Nettoyer ton environnement direct: reduire l'action a une version minimale. Tu veux que je l'applique ?

**Trace courte**
- http_status: 200
- response_owner: `operation_flow`
- selected_handler: `adjust_plan_item`
- route_reason: `operation_intent_start`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: `[]`
- operation: `status=pending_confirmation`, `operation_id=8d0134d6-a09c-4d8f-9f1d-d9533ca60d61`, draft patch `{difficulty:"low", duration_minutes:5}`, `adjustment_type=reduce`
- pending_confirmation: non expose dans le champ court, mais draft de confirmation present dans `operation_flow_run`
- memory_plan: none
- executed_tools: `[]`
- durable_effect: aucun patch avant confirmation

### Tour 3

**User**
> oui allege-la, mais pas en mode ridicule

**Sophia**
> C'est fait : j'ai réduit "Nettoyer ton environnement direct" pour ce soir. Version légère : 5 minutes, difficulté basse. On vise juste de rester dans le mouvement.

**Trace courte**
- http_status: 200
- response_owner: `pending_confirmation`
- selected_handler: `cancel` dans `route_decision`, mais `operation_flow_run.selected_handler=adjust_plan_item`
- route_reason: `confirmation_correction_to_pending`
- safety: `risk_band=none`, `allow_side_effects=true`
- direct_effects: `[{tool_id:"adjust_plan_item", outcome:"success"}]`
- operation: `status=executed`, `operation_id=8d0134d6-a09c-4d8f-9f1d-d9533ca60d61`, `plan_patch_id=4d74625c-230b-44ad-8f87-1ec7079e1cef`
- pending_confirmation: cleared
- memory_plan: none
- executed_tools: `["adjust_plan_item"]`
- durable_effect: `user_plan_items.a751731a-3832-4bea-a707-c72170fd15a0.payload.active_operation_adjustment` ajoute avec patch `{difficulty:"low", duration_minutes:5}`

Durable DB observe:

- `Nettoyer ton environnement direct` reste `status=active`.
- `payload.active_operation_adjustment.plan_patch_id=4d74625c-230b-44ad-8f87-1ec7079e1cef`.
- `payload.active_operation_adjustment.patch={"difficulty":"low","duration_minutes":5}`.
- `payload.active_operation_adjustment.request_id=qa-operation-suggestion-test3-nina-2026-05-12-test3-adjust-plan-reduce-r1-t03`.
- `Faire le choix du brut` reste inchange: `target_reps=6`, `cadence_label=6 jours / semaine`.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia comprend des le tour 1 qu'il s'agit d'un ajustement de plan, pas seulement d'une aide ponctuelle.
- Tour 2: elle reformule la cible et demande confirmation avant d'appliquer.
- Tour 3: l'accuse de reception est clair et donne une version concrete de l'ajustement.

**Problemes**
- Tour 1: Sophia demande "le nom de l'action" alors que le dispatcher avait deja `target_hint=Nettoyer ton environnement direct`. Impact: friction inutile, Nina doit reformuler une cible que le systeme connait probablement. Severite: yellow.
- Tour 2: formulation raide et non polie (`reduire l'action a`, accents perdus), peu naturelle pour Nina. Impact: experience utilisable mais mecanique. Severite: yellow.
- Tour 3: Sophia dit "pour ce soir" alors que Nina demandait de rendre l'action du plan plus petite, donc durable. Impact: ambiguite sur l'effet reel applique. Severite: yellow.

**Fix propose**
- Quand `operation_intents[0].target_hint` matche un item actif unique, pre-remplir le scope ou demander une confirmation de cible courte au lieu de redemander le nom exact.
- Harmoniser le wording visible de `adjust_plan_item`: "Je peux reduire l'action Nettoyer ton environnement direct en version 5 minutes. Tu veux que je l'applique dans ton plan ?"
- Eviter "pour ce soir" dans l'ack d'un ajustement durable, sauf si le patch est explicitement temporaire.

## 4. Analyse Systeme

**Verdict: yellow**

**Routage**
- Pass: Tour 1 route vers `response_owner=operation_flow`, `selected_handler=adjust_plan_item`, `reason_code=operation_intent_start`.
- Pass: Tour 2 genere un draft `adjust_plan_item` avec `adjustment_type=reduce`, cible `a751731a-3832-4bea-a707-c72170fd15a0` et patch autorise.
- Pass: aucun executor n'est appele avant confirmation.
- Warning: Tour 1 a `operation_intents.target_hint=Nettoyer ton environnement direct` mais l'intake declare encore `missing_slots=["scope"]`.
- Warning: Tour 3 execute avec succes mais `route_decision.selected_handler=cancel` et `reason_code=confirmation_correction_to_pending`, ce qui contredit l'execution effective.

**Skills / Operations / Tools**
- `execution_breakdown` ne prend pas la main; le chemin operationnel est bien priorise.
- `adjust_plan_item` est bloque au draft, puis execute apres le message de confirmation/correction "oui allege-la...".
- `response_executed_tools=["adjust_plan_item"]` uniquement au tour 3.

**Memory / Effets durables**
- Pass: le patch durable est applique sur le bon item `Nettoyer ton environnement direct`.
- Pass: l'autre item actif `Faire le choix du brut` n'est pas modifie.
- Warning: l'effet durable est stocke dans `payload.active_operation_adjustment` et `payload.operation_adjustments`, pas dans les champs top-level lisibles comme `description`; a verifier cote dashboard pour savoir si l'utilisateur verra vraiment l'ajustement.

**Problemes**
- Tour 1: scope non resolu malgre `target_hint` clair. Impact systeme: un tour supplementaire inutile. Severite: yellow.
- Tour 3: trace incoherente `selected_handler=cancel` alors que l'outil s'execute. Impact systeme: observabilite et audit de confirmation confus. Severite: yellow.
- Tour 3: ack visible temporaire "pour ce soir" alors que le patch est durable. Impact systeme/produit: l'utilisateur peut mal comprendre la portee du write. Severite: yellow.

**Fix propose**
- Raccorder `operation_intents.target_hint` a la resolution de scope de `runAdjustPlanItemIntake`.
- Corriger la classification des confirmations avec correction mineure: `oui allege-la, mais...` doit rester `execute_confirmed_with_adjustment` ou equivalent, pas `cancel`.
- Clarifier le contrat d'application du patch: si `payload.active_operation_adjustment` est la source d'affichage, ajouter un test dashboard/API qui prouve que l'action est bien rendue en version reduite.

## Verdict Global

- Verdict: yellow
- Raison principale: le flow `adjust_plan_item` fonctionne et respecte la confirmation, mais la clarification de cible est inutile, la trace d'execution est incoherente, et l'ack final brouille la portee durable de l'ajustement.
- Follow-up prioritaire: corriger la resolution de scope depuis `target_hint` et la trace de confirmation/correction, puis relancer Test 3.1 pour viser un `green`.
