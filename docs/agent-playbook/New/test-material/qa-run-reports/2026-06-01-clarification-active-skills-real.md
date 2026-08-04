# QA Run Report — Clarification Active Skills Real

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `clarification-active-skill-20260601-r1-execution`
  - `clarification-active-skill-20260601-r2-emotional`
  - `clarification-active-skill-20260601-r3-product`
- Persona: users QA temporaires locaux, Auth vérifié `200`, cleanup ciblé effectué.
- Objectif: tester la clarification quand un skill conversationnel est déjà actif, pas seulement au niveau dispatcher.
- Trajectoire: injection de `__active_skill_state` dans `user_chat_states.temp_memory`, puis appel réel `/functions/v1/test-send-message`.
- Surfaces visees: active skill state, dispatcher active runtime context, clarification arbitration, orientation_clarification, tool/effect gating.
- Cadre IA reel: Supabase local, `force_full_ai=true`, pas de renderer/fallback direct.
- Validite QA: valide. Les trois tours sont HTTP 200 avec trace et snapshot DB.

## 2. Tours De Conversation

### Tour 1 — execution_breakdown actif

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner selectionne.

**User**
> Dans ce découpage, je ne sais plus si je veux juste réduire la première étape ou changer l'organisation du plan.

**Sophia**
> Souhaitez-vous réduire la première étape ou préférez-vous obtenir une explication sur l'organisation du plan ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun, `scheduled_checkins=0`
- active_skill_state: `execution_breakdown`
- clarification_state.owner: `dispatcher`

**Analyse si yellow/red**
- Symptome: clarification visible, mais pas portée par le skill actif; la question bascule vers `product_help` + `adjust_plan_item`.
- Source amont probable: arbitration globale démarre la clarification avant qu'un runtime skill actif puisse appeler `runSkillClarification`.
- Owner runtime: active conversation skill runtime + clarification arbitration.
- Meilleure correction selon les guidelines: ajouter une étape dédiée qui donne la main au skill actif pour ses ambiguïtés internes, avec `owner=execution_breakdown`.
- Pourquoi ce n'est pas un patch local: corriger le wording ne suffit pas; la preuve système est l'owner `dispatcher`.

### Tour 2 — emotional_repair actif

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner selectionne.

**User**
> Là je me sens vidé et tendu ; dans ce qu'on faisait je ne sais pas si j'ai besoin d'être écouté, de changer d'état avec une potion, ou de choisir une mini-action.

**Sophia**
> Souhaitez-vous commencer par être écouté, choisir une potion pour changer d'état, ou définir une mini-action ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun, `scheduled_checkins=0`
- active_skill_state: `emotional_repair`
- clarification_state.owner: `dispatcher`
- candidates: `adjust_plan_item`, `select_state_potion`, `execution_breakdown`

**Analyse si yellow/red**
- Symptome: question visible correcte, mais owner `dispatcher`; le skill actif `emotional_repair` ne porte pas sa clarification interne.
- Source amont probable: l'adapter partagé existe mais n'est pas branché dans le runtime des skills conversationnels concernés.
- Owner runtime: emotional_repair + active skill runtime.
- Meilleure correction selon les guidelines: brancher `runSkillClarification` côté skill actif pour émotion/potion/action, puis persister `owner=emotional_repair`.
- Pourquoi ce n'est pas un patch local: le dispatcher ne doit pas remplir la clarification fine du domaine.

### Tour 3 — product_help actif

**Verdict du tour:** red

**Famille de bugs si yellow/red:** `BF-ROUTE-01` — mauvais owner selectionne.

**User**
> En continuant sur les cartes d'attaque, je ne sais pas si je veux juste comprendre à quoi elles servent ou en préparer une pour mon action de demain matin.

**Sophia**
> Souhaitez-vous obtenir une explication sur le fonctionnement des cartes d'attaque ou en préparer une dès maintenant ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- direct_effects: `[]`
- operation: `none`
- pending_confirmation: `null`
- executed_tools: `[]`
- durable_effect: aucun, `scheduled_checkins=0`
- active_skill_state: `product_help`
- clarification_state.owner: `dispatcher`
- candidates: `product_help`, `prepare_attack_card`

**Analyse si yellow/red**
- Symptome: bonne question visible, aucun tool lancé, mais la clarification est dispatcher-owned malgré `product_help` actif.
- Source amont probable: active skill runtime non prioritaire pour la clarification interne product_help/action.
- Owner runtime: product_help + active skill runtime.
- Meilleure correction selon les guidelines: permettre au skill actif de construire ses candidats et appeler le clarification_tool avant arbitrage dispatcher final.
- Pourquoi ce n'est pas un patch local: l'invariant attendu est structurel (`owner=product_help`), pas seulement textuel.

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Sophia pose une seule question dans les trois cas.
- Aucun tool skill complexe n'est lancé.
- Les questions sont globalement compréhensibles pour le user.

**Problemes**
- Tour 1: la deuxième option visible est décalée, car elle parle d'explication du plan au lieu de changer le plan. Famille: `BF-ROUTE-01`. Impact: confusion utilisateur. Sévérité: yellow.
- Tours 1-3: la clarification semble correcte côté surface, mais elle ne respecte pas l'ownership skill-interne demandé. Famille: `BF-ROUTE-01`. Impact: les skills ne contrôlent pas leurs ambiguïtés internes. Sévérité: red système.

**Fix propose**
- Source amont: active conversation skill runtime.
- Correction recommandee: brancher une étape `maybeRunActiveSkillClarification` avant ou pendant l'exécution du skill actif, utilisant `runSkillClarification` avec `owner=<skill actif>`.
- Tests d'invariant attendus: active `execution_breakdown`, `emotional_repair`, `product_help` -> `__clarification_state_v1.owner` égal au skill actif; aucun executor; `response_owner=orientation_clarification`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Les trois runs routent vers `orientation_clarification`, ce qui bloque correctement les handlers finaux.
- Mais le state écrit `owner: dispatcher` dans les trois cas malgré un `__active_skill_state` valide.
- Le dispatcher reste donc le propriétaire effectif de la clarification, ce qui contredit l'objectif "quand on est déjà dans un flow".

**Skills / Operations / Tools**
- `executed_tools=[]` dans les trois runs.
- `tool_execution=none` dans les trois runs.
- Aucun `scheduled_checkins` créé.
- `no_chat_mutation=true` dans les states de clarification.

**Memory / State**
- Le cleanup ciblé a supprimé `chat_messages`, `scheduled_checkins`, `user_chat_states`, `user_topic_memories`, `memory_items` et `auth.users`.
- `user_memories=404` au cleanup correspond à une table absente du local, pas à une mémoire créée.

**Fix systeme**
- Ajouter un point d'intégration pour active conversation skills: si `__active_skill_state` existe et que le user reste dans le domaine du skill, le skill doit pouvoir fournir ses candidats et appeler `runSkillClarification`.
- Le dispatcher peut rester fallback hors flow, mais ne doit pas devenir propriétaire des clarifications internes.

## Verdict Global

`red`.

Les runs sont valides et non-mutants, mais ils ne prouvent pas que les skills appellent le clarification_tool. Ils prouvent l'inverse: même avec un flow conversationnel actif, la clarification est encore démarrée et stockée comme `owner=dispatcher`.
