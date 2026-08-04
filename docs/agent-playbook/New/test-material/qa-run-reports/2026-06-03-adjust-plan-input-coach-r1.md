# QA Run Report - adjust_plan input coach R1

## 1. Contexte Du Test

- Date: 2026-06-03
- Run: `adjust-plan-input-coach-r1`
- Persona: Rose, scope `qa-rose-2026-06-03-adjust-plan-whole-plan-adjust-plan-input-coach-r1`
- Objectif: verifier le nouveau comportement `adjust_plan_item` comme coach de formulation d'input Plan, sans scope métier ni mutation chat.
- Trajectoire: demande vague d'ajustement -> clarification -> réponse au choix -> demande explicite de phrase à coller dans Plan -> retry après incident.
- Surfaces visees: dispatcher, orientation clarification, `adjust_plan_item`, routing active/opportunity, no-mutation, traces runtime.
- Cadre IA reel: valide jusqu'à incident. Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, messages choisis tour par tour apres lecture reponse/trace.
- Validite QA: run exploitable mais interrompu rouge. Objectif 5 tours non atteint parce que les tours 3 et 4 retournent `502` vide sur l'entree explicite adjust_plan.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Je veux ajuster mon plan, mais je ne sais pas trop quoi écrire. Ce qui bloque, c’est que ça me paraît trop lourd en ce moment.

**Sophia**
> Est-ce que tu veux modifier le contenu de ton plan ou plutôt découper tes actions pour les rendre moins lourdes ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: non signale
- direct_effects: 0
- operation: `none`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: messages/state du scope uniquement, cleanup ensuite

**Analyse si yellow/red**
- Symptome: la question est utile, mais le nouveau skill devait pouvoir posseder cette clarification légère au lieu de passer par une clarification globale.
- Source amont probable: dispatcher/arbitrage de clarification avant skill.
- Owner runtime: routing + clarification ownership.
- Meilleure correction selon les guidelines: quand l'intention adjust_plan est claire mais le contenu est flou, router vers `adjust_plan_item` et laisser le skill poser sa clarification.
- Pourquoi ce n'est pas un patch local: il faut corriger l'ownership du flow, pas matcher cette phrase.

### Tour 2

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` - Mauvais owner selectionne

**User**
> Plutôt découper et alléger. Je veux garder l’objectif, mais que l’entrée soit moins intimidante cette semaine.

**Sophia**
> Ouvre juste l'endroit de l'action et fais une trace imparfaite de 2 minutes. Après, on ajuste. 🙂

**Trace courte**
- http_status: 200
- response_owner: `conversation_handler`
- selected_handler: `execution_breakdown`
- route_reason: `orientation_clarification_resolved_conversation_skill`
- safety: non signale
- direct_effects: 0
- operation: `none`
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: messages/state du scope uniquement, cleanup ensuite

**Analyse si yellow/red**
- Symptome: la clarification adjust_plan est resolue vers `execution_breakdown`; Sophia donne une micro-action à faire maintenant au lieu d'aider à rédiger l'input Plan.
- Source amont probable: orientation clarification resolution / dispatcher contract.
- Owner runtime: clarification resolver + route decision.
- Meilleure correction selon les guidelines: la résolution "découper/alléger un plan en gardant l'objectif" doit rester `adjust_plan_item` en `platform_input_coaching`.
- Pourquoi ce n'est pas un patch local: le mauvais handler est choisi avant renderer.

### Tour 3

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Non, je veux surtout une phrase claire à mettre dans Plan pour demander l’ajustement.

**Sophia**
> [réponse vide - HTTP 502]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: indisponible
- direct_effects: null
- operation: null
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: message loggé puis cleanup

**Analyse si yellow/red**
- Symptome: l'entrée explicite qui devrait déclencher `adjust_plan_item` retourne `502` avec `An invalid response was received from the upstream server`.
- Source amont probable: crash/import/runtime Edge dans le nouveau chemin `adjust_plan_item`, ou appel IA non géré dans le generator.
- Owner runtime: `adjust_plan_item` runtime + Edge diagnostics.
- Meilleure correction selon les guidelines: reproduire localement avec le même input et inspecter la stack Edge; ajouter un test d'intégration qui appelle le runtime avec `forceFullAi=true`.
- Pourquoi ce n'est pas un patch local: absence totale de trace Sophia; il faut corriger le runtime ou son appel IA.

### Tour 4

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` - Trace/test incoherent ou suite malsaine

**User**
> Je reformule : aide-moi à écrire la demande à coller dans Plan, pas à faire l’action maintenant.

**Sophia**
> [réponse vide - HTTP 502]

**Trace courte**
- http_status: 502
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: indisponible
- direct_effects: null
- operation: null
- pending_confirmation: false
- executed_tools: `[]`
- durable_effect: message loggé puis cleanup

**Analyse si yellow/red**
- Symptome: retry naturel apres incident retourne le même `502`; le run ne peut pas continuer vers 5 tours exploitables.
- Source amont probable: même blocage runtime que tour 3.
- Owner runtime: `adjust_plan_item` runtime + Edge diagnostics.
- Meilleure correction selon les guidelines: stopper le run, documenter rouge, corriger le runtime avant rerun.
- Pourquoi ce n'est pas un patch local: le système ne produit aucune réponse ni trace utilisable.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Tour 1: Sophia pose une question simple, compréhensible, sans effet durable.
- Aucun tour ne crée d'executor, de confirmation pending ou d'effet durable.

**Problemes**
- Tour 1: la clarification sort du skill adjust_plan. Famille: `BF-ROUTE-01`. Impact: le skill ne possède pas sa clarification fine.
- Tour 2: mauvaise résolution vers `execution_breakdown`. Famille: `BF-ROUTE-01`. Impact: Sophia répond "fais une action" alors que l'utilisateur veut rédiger une demande pour Plan.
- Tours 3-4: `502` vide sur demande explicite. Famille: `BF-TEST-01`. Impact: expérience inutilisable, run interrompu.

**Fix propose**
- Source amont: dispatcher/orientation clarification, puis runtime `adjust_plan_item`.
- Correction recommandee: router les clarifications adjust_plan vers le skill; diagnostiquer le 502 du nouveau runtime en environnement Edge avec input explicite.
- Tests d'invariant attendus: "je veux une phrase à coller dans Plan" -> `adjust_plan_item`, `toolExecution=platform_handoff`, contenu non vide, `executed_tools=[]`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Tour 1: `orientation_clarification`, alors que le nouveau skill pourrait clarifier lui-même.
- Tour 2: `execution_breakdown`, clairement mauvais owner pour une formulation d'ajustement Plan.
- Tours 3-4: pas de route decision exploitable à cause du `502`.

**Skills / Operations / Tools**
- Aucun outil exécuté.
- Aucun pending confirmation.
- Aucun direct effect.
- Le nouveau runtime `adjust_plan_item` n'a pas produit de réponse en run réel; c'est le blocage prioritaire.

**Memory / Effets durables**
- Snapshot initial: 1 plan, 5 items.
- Cleanup: 1 plan et 5 items restaurés; 6 messages et 1 state scoped supprimés.
- Etat final du scope: `chat_messages=0`, `user_chat_states=0`.

**Problemes**
- Tours 1-2: mauvais owner avant même l'accès au nouveau skill. Famille: `BF-ROUTE-01`. Impact systeme: `adjust_plan_item` ne reçoit pas le flow de formulation.
- Tours 3-4: `502` vide. Famille: `BF-TEST-01`. Impact systeme: run full AI impossible dès que l'utilisateur demande explicitement l'input Plan.

**Fix propose**
- Source amont: clarification resolver + adjust_plan runtime Edge.
- Correction recommandee: reproduire le 502 avec une requête directe et corriger la cause runtime; ajouter une garde de non-crash autour du generator IA; aligner le contrat dispatcher pour que "écrire/coller dans Plan" cible `adjust_plan_item`.
- Tests d'invariant attendus: run full AI 5 tours complet; no `execution_breakdown` sur formulation Plan; no `orientation_clarification` propriétaire final après résolution; no 502.

## Verdict Global

- Verdict: red
- Raison principale: le run ne peut pas atteindre 5 tours exploitables; la demande explicite de phrase à coller dans Plan provoque deux `502` consécutifs.
- Follow-up prioritaire: diagnostiquer et corriger le crash/runtime `adjust_plan_item` sur entrée explicite, puis rerun full AI.

## Feuille De Suivi Bugs

- Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-03-adjust-plan-input-coach-r1-bugs.md`
