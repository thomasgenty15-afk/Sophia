# Weekly Local Dispatcher Local Handoff R1 - Invalid

## 1. Contexte Du Test

- Date: 2026-06-09
- Run: `weekly-local-dispatcher-local-handoff-r1`
- Persona: non ouverte; run arrete avant authentification
- Objectif: verifier en IA reelle locale que le weekly actif garde le dispatcher global coupe, puis handoff vers `prepare_attack_card` via `note_information`
- Trajectoire: weekly actif -> demande carte d'attaque -> dispatcher local weekly -> handoff local carte
- Surfaces visees: `weekly_adaptive_review_v1`, router active flow, `prepare_attack_card`, `note_information`, traces
- Cadre IA reel: attendu via Supabase local `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe
- Validite QA: invalide. Le run n'a pas demarre car `supabase status --output json` indique `supabase_edge_runtime_Sophia_2` arrete, et les guidelines interdisent de demarrer/redemarrer les services pendant le run.

## 2. Tours De Conversation

Aucun tour Sophia n'a ete envoye. Le cadre IA reel local n'etait pas disponible avant le premier message.

### Incident Pre-run

**Verdict du tour:** red

**Famille de bugs si yellow/red:** BF-TEST-01 - Trace/test incoherent ou suite malsaine

**User**
> Non envoye.

**Sophia**
> Aucune reponse Sophia. Aucun transcript exploitable.

**Trace courte**
- http_status: non appele
- response_owner: null
- selected_handler: null
- route_reason: null
- safety: non evalue
- direct_effects: none
- operation: none
- pending_confirmation: non verifie
- memory_plan: non produit
- executed_tools: none
- durable_effect: none
- preflight: `supabase_edge_runtime_Sophia_2` arrete

**Analyse si yellow/red**
- Symptome: impossibilite de lancer `/functions/v1/test-send-message` dans un cadre local valide.
- Source amont probable: environnement Supabase local incomplet, Edge Runtime arrete.
- Owner runtime: QA harness / infrastructure locale.
- Meilleure correction selon les guidelines: remettre l'environnement local en etat hors run QA, puis relancer avec `force_full_ai=true`.
- Pourquoi ce n'est pas un patch local: aucun tour Sophia n'a ete execute; corriger le code ne prouverait rien sans Edge Runtime.

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Rien d'observable cote conversation: aucun tour n'a ete lance.

**Problemes**
- Incident pre-run: pas de reponse Sophia possible. Famille: BF-TEST-01. Impact: validation conversationnelle impossible. Severite: red.

**Fix propose**
- Source amont: environnement local Supabase / Edge Runtime.
- Correction recommandee: redemarrer ou reparer les services locaux hors cadre QA, puis relancer le run tour par tour.
- Tests d'invariant attendus: `/functions/v1/test-send-message` retourne HTTP 200 avec trace courte, `force_full_ai=true`, et aucun fallback deterministe.

## 4. Analyse Systeme

**Verdict: red**

**Routage**
- Non teste. Aucun `response_owner`, `selected_handler` ou `route_reason` n'a ete produit.

**Skills / Operations / Tools**
- Non testes. Aucun dispatcher local weekly ni operation carte n'a ete appele.

**Memory / Effets durables**
- Aucun effet durable observe ou attendu. Aucun message QA envoye.

**Problemes**
- Incident pre-run: Edge Runtime local arrete. Famille: BF-TEST-01. Impact systeme: impossible de verifier le chemin IA reel local. Severite: red.

**Fix propose**
- Source amont: runtime local Supabase.
- Correction recommandee: remettre Edge Runtime en etat, sans utiliser de fallback, puis relancer le meme objectif QA.
- Tests d'invariant attendus: trace prouvant `global_dispatcher_skipped_due_weekly_review=true`, `flow_action=handoff_to_local_flow`, `target_dispatcher=prepare_attack_card`, `note_information_present=true`, puis `selected_handler=prepare_attack_card`.

## Verdict Global

- Verdict: red
- Raison principale: run IA reel local invalide, Edge Runtime Supabase arrete avant le premier tour.
- Follow-up prioritaire: relancer apres remise en etat de Supabase local, sans correction de code pendant le run.
