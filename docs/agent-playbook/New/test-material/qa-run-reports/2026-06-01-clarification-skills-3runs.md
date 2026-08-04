# QA Run Report — Clarification Skills 3 Runs

## 1. Contexte Du Test

- Date: 2026-06-01.
- Run:
  - tentative invalide:
    `clarification-skills-3runs-20260601-r1-product-action`
  - runs exploitables:
    `clarification-skills-3runs-20260601-r1b-product-action`,
    `clarification-skills-3runs-20260601-r2-execution-adjust`,
    `clarification-skills-3runs-20260601-r3-emotion-potion-action`
- Persona: users temporaires QA locaux, un par run, nettoyés en fin de run.
- Objectif: relancer 3 runs réels pour vérifier si les ambiguïtés de domaines
  conversation skills passent par le `clarification_tool` au lieu de lancer un
  tool skill ou une réponse métier trop tôt.
- Trajectoire: product help vs carte d'attaque, découpage d'action vs ajustement
  du plan, soutien émotionnel vs potion vs micro-action.
- Surfaces visees: dispatcher L1, `TurnFrame`, clarification arbitration,
  conversation skills, tool skill routing, temp memory, effets durables.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`,
  `force_full_ai=true`, aucun renderer déterministe, aucun fallback
  `processMessage`.
- Validite QA: valide pour les 3 runs exploitables; la tentative initiale R1 est
  invalide techniquement et documentée comme incident.

## 2. Tours De Conversation

### Incident Initial — R1 502

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-TEST-01` — trace/test incohérent ou suite
malsaine.

**User**
> Je bloque un peu : soit j'ai besoin que tu m'expliques à quoi sert une carte d'attaque, soit on en prépare une pour mon démarrage de demain.

**Sophia**
> Réponse vide.

**Trace courte**
- http_status: 502
- response_owner: none
- selected_handler: none
- route_reason: none
- safety: none
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: non disponible
- executed_tools: `[]`
- durable_effect: none observé

**Analyse si yellow/red**
- Symptome: le endpoint retourne `An invalid response was received from the upstream server`.
- Source amont probable: runtime Edge ou appel IA upstream, sans stack utile dans
  la trace courte.
- Owner runtime: testability / Edge runtime.
- Meilleure correction selon les guidelines: rendre l'erreur upstream observable
  dans le chemin local, puis relancer le scénario. Un retry séparé R1b a été
  fait.
- Pourquoi ce n'est pas un patch local: le problème est l'observabilité/runtime,
  pas le contenu de réponse Sophia.

### Run R1b — Product Help Vs Carte D'attaque

**Verdict du tour:** green

**User**
> Je bloque un peu : soit j'ai besoin que tu m'expliques à quoi sert une carte d'attaque, soit on en prépare une pour mon démarrage de demain.

**Sophia**
> Souhaitez-vous obtenir une explication sur l'utilité d'une carte d'attaque ou préférez-vous en préparer une pour demain ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: none
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: `[]`
- durable_effect: none; `scheduled_checkins_count=0`
- clarification_state: present, owner `dispatcher`, ambiguity `intent`,
  candidats `execution_breakdown`, `product_help`, `prepare_attack_card`,
  `no_chat_mutation=true`
- blocked_paths: `tool_skill_router`, `product_help`,
  `operation_runtime_pipeline`, `direct_effects`

### Run R2 — Découper L'action Vs Changer Le Plan

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-04` — ambiguïté non reconnue.

**User**
> Mon action du soir est trop lourde : je ne sais pas si je dois juste la découper maintenant ou changer l'organisation du plan.

**Sophia**
> : tu veux seulement alléger l’action du soir, ou aussi revoir l’organisation du niveau entier ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `adjust_plan_item`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `adjust_plan_item`
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: `[]`
- tool_execution: `platform_handoff`
- durable_effect: aucun scheduled checkin, mais tool skill handoff engagé
- skill_signals: `execution_breakdown` détecté en medium confidence
- tool_skill_intents: `adjust_plan_item`, confidence `high`, ambiguity `none`

**Analyse si yellow/red**
- Symptome: le message contient explicitement "je ne sais pas si" entre
  découpage et ajustement, mais le dispatcher marque `adjust_plan_item` en
  `ambiguity=none` et démarre le tool skill.
- Source amont probable: `TurnFrame` / dispatcher L1, puis absence de
  clarification arbitration sur le couple `execution_breakdown` vs
  `adjust_plan_item`.
- Owner runtime: dispatcher + clarification candidate builder/arbitrator.
- Meilleure correction selon les guidelines: conserver les signaux concurrents
  dans le `TurnFrame` et construire des candidats
  `execution_breakdown` / `adjust_plan_handoff` avant tout `tool_skill` quand le
  user exprime l'hésitation.
- Pourquoi ce n'est pas un patch local: le problème est la structuration de
  l'ambiguïté et l'arbitrage owner, pas une phrase à modifier.

### Run R3 — Soutien Émotionnel Vs Potion Vs Micro-Action

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-INTAKE-04` — ambiguïté non reconnue.

**User**
> Je suis vidé et tendu, je ne sais pas si j'ai surtout besoin d'être écouté, de changer d'état avec une potion, ou de trouver une toute petite action.

**Sophia**
> Pour t'aider, préfères-tu relâcher la tension ou recevoir un peu de douceur ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `select_state_potion`
- route_reason: `tool_skill_intent_start`
- safety: `low`
- direct_effects: `[]`
- operation: `select_state_potion`
- pending_confirmation: none
- memory_plan: non pertinent
- executed_tools: `[]`
- tool_execution: `platform_handoff`
- durable_effect: aucun scheduled checkin, mais tool skill handoff engagé
- skill_signals: `execution_breakdown` détecté en medium confidence
- tool_skill_intents: `adjust_plan_item`, confidence `high`, ambiguity `none`

**Analyse si yellow/red**
- Symptome: le user donne trois options concurrentes, dont "être écouté";
  Sophia lance le domaine potion et pose une question interne à la potion au
  lieu de clarifier soutien émotionnel vs potion vs micro-action.
- Source amont probable: dispatcher L1 aplatit l'intention composite en tool
  skill; incohérence aussi visible entre `selected_handler=select_state_potion`
  et `tool_skill_intents=adjust_plan_item`.
- Owner runtime: dispatcher + tool skill arbitration + clarification
  candidate builder.
- Meilleure correction selon les guidelines: construire des candidats
  `emotional_repair`, `state_potion_handoff`, `execution_breakdown` depuis les
  signaux structurés, puis router vers `orientation_clarification` sans lancer
  `select_state_potion`.
- Pourquoi ce n'est pas un patch local: le problème est une décision de routage
  et de candidats concurrents, pas le wording de la question potion.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- R1b est fluide: Sophia pose une seule question claire et ne prétend pas créer
  de carte.
- Les trois runs exploitables ne créent pas d'effet durable en DB.

**Problemes**
- Incident initial: 502 sans réponse Sophia. Famille: `BF-TEST-01`. Impact:
  tentative invalide, retry obligatoire. Severite: red.
- R2: Sophia commence par `:` et demande une clarification de scope après avoir
  déjà engagé `adjust_plan_item`. Famille: `BF-INTAKE-04`. Impact: l'utilisateur
  est poussé vers l'ajustement du plan au lieu d'un choix découpage vs plan.
  Severite: red.
- R3: Sophia ignore l'option "être écouté" et transforme l'hésitation en choix
  de potion. Famille: `BF-INTAKE-04`. Impact: risque d'orienter trop tôt vers un
  outil alors que le besoin émotionnel immédiat est plausible. Severite: red.

**Fix propose**
- Source amont: dispatcher L1, candidate builder, arbitration
  clarification/tool skill.
- Correction recommandee: pour les couples/triples de signaux structurés
  conversation skill vs tool skill, démarrer `orientation_clarification` et
  bloquer `tool_skill_router` tant que le modèle n'a pas choisi entre candidats.
- Tests d'invariant attendus: R2 et R3 doivent produire
  `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`,
  `executed_tools=[]`, `tool_execution=none`, state clarification présent.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- R1b respecte le contrat dispatcher clarification: owner
  `orientation_clarification`, chemins mutants bloqués, state clarification
  écrit.
- R2 ne respecte pas le contrat: `execution_breakdown` est détecté, mais
  `adjust_plan_item` gagne avec `ambiguity=none`.
- R3 ne respecte pas le contrat: intention composite émotion/potion/action
  routée vers `select_state_potion` avec incohérence trace
  `tool_skill_intents=adjust_plan_item`.

**Skills / Operations / Tools**
- Aucun executor durable n'est appelé.
- R2 et R3 engagent quand même un `platform_handoff` tool skill alors que la
  demande est explicitement ambiguë.
- Aucun run ne prouve encore un appel réel d'un conversation skill actif vers
  `runSkillClarification`; R1b reste une clarification owner `dispatcher`.

**Memory / Effets Durables**
- Aucun scheduled checkin créé.
- `no_chat_mutation=true` observé dans le state de R1b.
- Cleanup ciblé effectué pour les quatre users temporaires. `user_memories`
  retourne 404 dans cet environnement local; `chat_messages`,
  `scheduled_checkins`, `user_chat_states`, `user_topic_memories`,
  `memory_items` et `auth.users` ont été nettoyés.

**Problemes**
- Ambiguïté non reconnue sur les scénarios conversation skill internes.
- Le tool skill router n'est pas bloqué dans R2/R3.
- Le runtime manque encore d'une preuve traceable `owner=<conversation_skill>`
  pour clarification interne.

**Fix propose**
- Source amont: `dispatcher.v2`, `clarification_candidate_builder`,
  `clarification_arbitrator`, puis adapters skill-level.
- Correction recommandee: renforcer la production de signaux concurrents depuis
  le `TurnFrame`, ajouter les familles candidates manquantes, puis empêcher
  `tool_skill_intent_start` quand une ambiguity candidate set existe.
- Tests requis: unit builder/arbitrator pour R2/R3, puis rerun réel
  `force_full_ai=true` sur les mêmes familles avec paraphrases.

## Verdict Global

- Verdict: red.
- Raison principale: 1 run vert sur clarification dispatcher, mais 2 runs réels
  rouges où un tool skill démarre malgré une ambiguïté explicite.
- Follow-up prioritaire: corriger la reconnaissance d'ambiguïté
  `execution_breakdown` vs `adjust_plan_item` et `emotional_repair` vs
  `state_potion` vs micro-action, puis relancer les 3 runs.

## Feuille De Suivi Bugs

- Bug sheet:
  `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-01-clarification-skills-3runs-bugs.md`
