# QA Run - prepare_defense_card Local Doctrine R7 Invalid

## 1. Contexte Du Test

- Date: 2026-06-12
- Run: `prepare-defense-local-doctrine-r7`
- Persona: `alex`
- Objectif: verifier en IA reelle locale que les corrections recentes de `prepare_defense_card` ameliorent le rythme du premier tour et la sortie propre vers le dispatcher global avant `prepare_attack_card`.
- Trajectoire visee: entree directe defense -> enrichissement avant handoff -> confirmation/handoff -> destination/apply non-mutant -> changement explicite vers carte d'attaque via `exit_to_global_dispatcher`.
- Surfaces visees: dispatcher global d'entree, active flow routing, `prepare_defense_card.local_dispatcher`, reducer local, visible agent local, handoff arbitration, EffectLedger, no-chat-mutation.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runner `scripts/qa_prepare_defense_turn.mjs`, execution hors sandbox, aucun fallback deterministe, aucun staging/deploy.
- Validite QA: invalide. Le worker Sophia Brain retourne `503 BOOT_ERROR` avant tout tour conversationnel exploitable.
- Artefacts:
  - Raw: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r7.raw.json`
  - Summary: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r7.summary.json`
  - Durable: `tests/real-personas/alex/runs/operations/2026-06-12-prepare-defense-prepare-defense-local-doctrine-r7.durable.json`
  - Bug sheet: `docs/agent-playbook/New/test-material/run-bug-sheets/2026-06-12-prepare-defense-local-doctrine-r7-invalid-bugs.md`
- Nettoyage: aucun effet durable observe. Snapshot durable: `user_defense_cards=[]`, `chat_messages=[]`.

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Je veux preparer une carte de defense : quand je rentre rince apres le boulot, je me laisse happer par une commande au hasard au lieu de manger correctement.

**Sophia**
> Reponse vide. HTTP 503.

**Trace courte**
- http_status: `503`
- response_owner: `null`
- selected_handler: `null`
- route_reason: `null`
- safety: `null`
- direct_effects: `null`
- operation: `null`
- pending_confirmation: `false`
- memory_plan: `null`
- executed_tools: `[]`
- durable_effect: aucun. `user_defense_cards=[]`, `chat_messages=[]`.
- erreur body: `{"code":"BOOT_ERROR","message":"Worker failed to boot (please check logs)"}`

**Analyse si yellow/red**
- Symptome: le chemin IA reel local ne demarre pas; aucune reponse Sophia, aucune trace de routage, aucun appel dispatcher local.
- Source amont probable: boot/typecheck Sophia Brain, hors flow `prepare_defense_card`.
- Owner runtime: Sophia Brain function boot / module graph.
- Diagnostic non-mutant: `deno check supabase/functions/sophia-brain/index.ts` echoue avec `TS2305`: `router/adjust_plan_operation_bridge.ts` importe `isExplicitPendingApplyConfirmation` depuis `skills/weekly_review/runtime.ts`, mais ce membre n'est pas exporte.
- Meilleure correction selon les guidelines: restaurer la coherence du module graph Sophia Brain avant tout rerun QA reel; ensuite relancer le meme objectif avec un nouveau run id.
- Pourquoi ce n'est pas un patch local: le bug empeche le worker complet de booter avant d'atteindre `prepare_defense_card`; corriger une phrase, un prompt ou un runner ne testerait pas le vrai chemin IA.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien d'evaluable: Sophia ne repond pas.

**Problemes**
- Tour 1: absence totale de reponse utilisateur a cause du boot error. Famille: BF-TEST-01. Impact: run conversationnel inexploitable. Severite: red.

**Fix propose**
- Source amont: module graph Sophia Brain, import/export `weekly_review`.
- Correction recommandee: corriger l'export manquant ou l'import obsolète de `isExplicitPendingApplyConfirmation`, puis verifier que `supabase/functions/sophia-brain/index.ts` type-checke.
- Tests d'invariant attendus: health check `/functions/v1/test-send-message` HTTP 200 avec `force_full_ai=true`, puis rerun complet `prepare_defense_card`.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Aucun routage observable. Le worker echoue avant `turn_frame`, `route_decision` ou `operation_flow_run`.

**Skills / Operations / Tools**
- Aucun skill ou tool appele. `prepare_defense_card.local_dispatcher` n'a pas ete atteint.

**Memory / Effets durables**
- Aucun message chat persiste dans le scope QA.
- Aucune carte de defense creee.
- Aucun pending confirmation observe.

**Problemes**
- Tour 1: worker boot failure. Famille: BF-TEST-01. Impact systeme: impossible de verifier les corrections `prepare_defense_card` en conditions reelles. Severite: red.

**Fix propose**
- Source amont: `supabase/functions/sophia-brain/router/adjust_plan_operation_bridge.ts` / `supabase/functions/sophia-brain/skills/weekly_review/runtime.ts`.
- Correction recommandee: aligner l'import/export `isExplicitPendingApplyConfirmation`, puis relancer le run IA reel local sans fallback.
- Tests d'invariant attendus:
  - `deno check supabase/functions/sophia-brain/index.ts` vert;
  - premier tour QA defense retourne HTTP 200 avec trace;
  - le run couvre rythme premier tour, handoff, apply non-mutant, destination followup et sortie vers attaque via `prepare_defense_card.local_dispatcher -> exit_to_global_dispatcher -> global dispatcher`.

## Verdict Global

Red invalide. Le run ne prouve rien sur `prepare_defense_card` tant que le worker Sophia Brain ne boote pas.
