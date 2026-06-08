# QA Run - prepare_attack_card Tool Opportunity R3

## 1. Contexte Du Test

- Date: 2026-06-08
- Run: `prepare-attack-tool-opportunity-r3`
- Persona: `alex`
- Objectif: verifier qu'un blocage concret sur une action du plan peut produire une `tool_skill_opportunity`, sans demande explicite de carte, puis lancer le flow cible apres acceptation.
- Trajectoire: friction de demarrage sur l'action active `Faire le sas de dechargement` -> offre opportunite carte d'attaque -> acceptation -> lancement `prepare_attack_card`.
- Surfaces visees: dispatcher global, `tool_skill_opportunity`, `flow_opportunity_verification`, pont vers `prepare_attack_card`, effect ledger.
- Cadre IA reel: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun renderer deterministe ni fallback direct.
- Validite QA: valide. Tentatives precedentes: R1 HTTP 502; R2 a detecte l'opportunite mais a revele un bug de lancement cible, corrige avant R3.

Artefacts:

- Raw: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-attack-tool-opportunity-r3.raw.json`
- Summary: `tests/real-personas/alex/runs/operations/2026-06-08-prepare-defense-prepare-attack-tool-opportunity-r3.summary.json`

## 2. Tours De Conversation

### Tour 1

**Verdict du tour:** green

**User**
> Ce soir, quand arrive l'heure de faire le sas de dechargement, je tourne autour du carnet et je repousse le moment de commencer. Je veux couper ce flottement avant qu'il m'embarque.

**Sophia**
> Je comprends ce moment de flottement. Pour t'aider a briser cette hesitation et entrer directement dans ton sas de dechargement, on pourrait preparer une carte d'attaque. Est-ce que tu veux qu'on fasse ca ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `flow_opportunity_verification`
- route_reason: `normal_reply_default`
- tool_skill_intents: `[]`
- tool_skill_opportunity: `type=attack_card`, `operation_type=prepare_attack_card`, `should_offer=true`, `confidence_band=high`, `must_not_execute=true`, `target_hint=sas de dechargement`
- operation: `flow_opportunity_verification`, status `waiting_confirmation`
- committed_effects: `[]`
- executed_tools: `[]`
- tool_execution: `none`

### Tour 2

**Verdict du tour:** green

**User**
> Oui, on fait ca.

**Sophia**
> Super. Qu'est-ce qui te fait derailler precisement au moment ou tu devrais commencer ton sas de dechargement ? 🙂

**Trace courte**
- http_status: 200
- response_owner: `tool_skill`
- selected_handler: `prepare_attack_card`
- route_reason: `active_flow_opportunity_verification_local_dispatcher`
- launched_by: `flow_opportunity_verification`
- original_opportunity_id: `prepare_attack_card.attack_card`
- operation: `prepare_attack_card`, status `clarifying`, reason `prepare_attack_card_local_ask_blocker`
- no_chat_mutation: true
- executable_from_chat: false
- committed_effects: `[]`
- executed_tools: `[]`
- tool_execution: `blocked`

## 3. Analyse De Fluidite Humaine

**Verdict: green**

**Ce qui marche**
- Sophia ne force pas l'outil au premier tour: elle propose une carte d'attaque et demande consentement.
- L'offre est contextuelle: elle vise le flottement avant le sas, pas un conseil generique.
- Apres acceptation, Sophia entre naturellement dans le flow cible et pose une question de slot pertinente.

**Problemes**
- Aucun probleme produit observe sur R3.

**Fix applique avant R3**
- R2 avait echoue avec `flow_opportunity_verification_target_flow_launch_failed`.
- Le pont `flow_opportunity_verification -> prepare_attack_card / prepare_defense_card` a ete branche dans le runtime local.
- Test ajoute: lancement accepte d'une opportunite `prepare_attack_card` sans IA reelle.

## 4. Analyse Systeme

**Verdict: green**

**Routage**
- T1: pas d'intent explicite; l'opportunite est bien dans `tool_skill_opportunity`.
- T1: `must_not_execute=true`, aucun lancement automatique.
- T2: l'acceptation lance `prepare_attack_card` via le flow actif `flow_opportunity_verification`.

**Skills / Operations / Tools**
- T1: `flow_opportunity_verification` cree une attente de confirmation.
- T2: `prepare_attack_card` prend le relais avec `launched_by=flow_opportunity_verification`.
- Aucun effect durable, aucun writer, aucun pending confirmation executable.

**Tests techniques associes**
- `deno test supabase/functions/sophia-brain/skills/flow_opportunity_verification/flow_opportunity_verification_test.ts` -> 9 passed, 0 failed.
- `deno check supabase/functions/sophia-brain/skills/flow_opportunity_verification/runtime.ts supabase/functions/sophia-brain/skills/flow_opportunity_verification/flow_opportunity_verification_test.ts` -> OK.

## Verdict Global

Verdict global: **green**.

Le chemin opportunite fonctionne: un blocage d'execution sur une action du plan produit une opportunite `prepare_attack_card`, n'execute rien sans consentement, puis lance correctement le dispatcher local attaque apres acceptation.
