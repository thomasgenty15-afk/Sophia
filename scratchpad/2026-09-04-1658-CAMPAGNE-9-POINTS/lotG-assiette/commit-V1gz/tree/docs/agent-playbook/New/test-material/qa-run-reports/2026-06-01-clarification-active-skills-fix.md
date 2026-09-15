# QA Run Report — Clarification Active Skills Fix

## 1. Contexte Du Test

- Date: 2026-06-01
- Runs:
  - `clarification-active-skill-fix2-20260601-r1-execution`
  - `clarification-active-skill-fix2-20260601-r2-emotional`
  - `clarification-active-skill-fix2-20260601-r3-product`
- Persona: users QA temporaires locaux, Auth vérifié `200`, cleanup ciblé effectué.
- Objectif: vérifier que la clarification interne à un skill actif est owned par ce skill, pas par `dispatcher`.
- Trajectoire: injection de `__active_skill_state`, puis appel réel `/functions/v1/test-send-message`.
- Surfaces visees: active skill runtime, clarification arbitration, orientation_clarification, tool/effect gating.
- Cadre IA reel: Supabase local, `force_full_ai=true`, pas de fallback renderer.
- Validite QA: valide.

## 2. Tours De Conversation

### Tour 1 — execution_breakdown actif

**Verdict du tour:** green

**User**
> Pour l'action qu'on découpait, j'hésite entre garder juste une toute petite première marche ou revoir carrément la place de cette action dans mon plan.

**Sophia**
> Souhaitez-vous continuer à découper cette action en étapes plus simples ou préférez-vous modifier sa place dans votre plan ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun
- clarification_state.owner: `execution_breakdown`
- candidates: `execution_breakdown`, `adjust_plan_item`

### Tour 2 — emotional_repair actif

**Verdict du tour:** yellow

**Famille de bugs si yellow/red:** warning `BF-INTAKE-04`

**User**
> Je suis à plat ; je ne sais pas si le plus utile c'est que tu m'aides à poser ce que je ressens, que je change d'état avec une potion, ou qu'on choisisse une action minuscule.

**Sophia**
> Pour t'aider au mieux, préfères-tu un soutien émotionnel, ajuster ton plan ou découper une action minuscule ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun
- clarification_state.owner: `emotional_repair`
- candidates: `emotional_repair`, `adjust_plan_item`, `execution_breakdown`

**Analyse si yellow/red**
- Symptome: owner corrigé, mais la candidate potion explicite du message n'a pas été conservée dans ce run.
- Source amont probable: TurnFrame n'a pas exposé `select_state_potion` comme signal structuré sur cette paraphrase.
- Owner runtime: dispatcher L1 signal production / skill candidate construction.
- Correction recommandee: traiter séparément si l'objectif QA exige que la potion explicite soit toujours candidate; ne pas remettre l'owner dispatcher.

### Tour 3 — product_help actif

**Verdict du tour:** green

**User**
> Sur les cartes d'attaque, je suis entre comprendre le principe et en construire une pour lancer mon truc demain.

**Sophia**
> Souhaitez-vous d'abord obtenir des explications sur le fonctionnement des cartes d'attaque ou préférez-vous commencer directement à en créer une ? 🙂

**Trace courte**
- http_status: `200`
- response_owner: `orientation_clarification`
- selected_handler: `orientation_clarification`
- route_reason: `clarification_required`
- safety: `low`
- executed_tools: `[]`
- durable_effect: aucun
- clarification_state.owner: `product_help`
- candidates: `product_help`, `prepare_attack_card`

## 3. Analyse De Fluidite Humaine

**Verdict: yellow**

**Ce qui marche**
- Les trois réponses sont des questions uniques.
- Aucun flow outil complexe ne démarre pendant la clarification.
- Les questions sont lisibles et actionnables.

**Problemes**
- Tour 2: la question oublie l'option potion pourtant explicite. Impact UX: l'utilisateur peut croire que cette option n'est plus disponible.

**Fix propose**
- Source amont: production de candidats `select_state_potion` depuis TurnFrame ou skill actif émotionnel.
- Correction recommandee: à traiter dans une fiche séparée si priorisé; l'invariant owner skill actif est corrigé.
- Tests d'invariant attendus: paraphrase émotion + potion explicite -> candidate `select_state_potion` conservée.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- Les trois runs produisent `response_owner=orientation_clarification`.
- Les states ont bien `owner=execution_breakdown`, `owner=emotional_repair`, `owner=product_help`.

**Skills / Operations / Tools**
- `executed_tools=[]` dans les trois runs.
- `tool_execution=none` dans les trois runs.
- Aucun effet durable observé.
- `no_chat_mutation=true` dans les trois states.

**Memory / State**
- Cleanup ciblé effectué pour les users QA temporaires.
- `user_memories=404` au cleanup indique une table absente en local, pas une mémoire écrite.

## Verdict Global

`green` pour le bug `CASR-20260601-B01` d'ownership skill actif.

Warning restant: le run émotionnel n'a pas conservé la candidate potion dans cette paraphrase.
