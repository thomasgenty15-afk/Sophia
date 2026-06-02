# Bug Sheet — Demotivation Repair R2

## Run

- Date: 2026-06-02
- Run id: `20260602-r2`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-demotivation-repair-r2.md`
- Persona: `qa-skill`, connexion temporaire locale `demotivation_repair_20260602-r1`
- Verdict: red

## Bugs

### R2-B01

- Bug id: `R2-B01`
- Tours: 1
- Famille: `BF-ROUTE-01`
- Domaine owner: dispatcher / orientation clarification
- Source amont: arbitration entre `demotivation_repair` et plan edit.
- Symptome visible: Sophia demande "motivation ou modifier le plan" alors que la demotivation est explicite et qu'aucune modification n'est demandee.
- Preuve systeme: `response_owner=orientation_clarification`, `selected_handler=orientation_clarification`, `route_reason=clarification_required`.
- Correction attendue: prioriser `demotivation_repair` quand fatigue/perte de sens/abandon dominent sans demande explicite de plan edit.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: positif "ca ne sert a rien / je vais laisser tomber" -> `demotivation_repair`; anti-faux-positif "je veux alleger le plan" -> plan edit/handoff.

### R2-B02

- Bug id: `R2-B02`
- Tours: 2, 3
- Famille: `BF-ROUTE-03`
- Domaine owner: clarification arbitrator / operation suggestion resolver.
- Source amont: resolved path transforme "motivation" en `select_state_potion` malgre `no_potion/no_tool`.
- Symptome visible: Sophia repond avec une recommandation Potions apres "pas de potion ni d'outil".
- Preuve systeme: tour 2 `response_owner=tool_skill`, `selected_handler=select_state_potion`, `tool_execution=blocked`; tour 3 handler encore `select_state_potion`.
- Correction attendue: appliquer `no_potion` et `no_tool` avant promotion d'un candidate tool; conserver `demotivation_repair` comme owner final.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: positif "motivation, pas de potion ni outil"; paraphrase "reste avec moi, pas dans l'app"; anti-faux-positif "active une potion courage".

### R2-B03

- Bug id: `R2-B03`
- Tours: 4
- Famille: `BF-AGENDA-02`
- Domaine owner: TurnAgenda / demotivation handoff readiness.
- Source amont: action readiness non reconnue apres micro-action explicitement choisie.
- Symptome visible: Sophia redemande "decouper ou preparer" alors que l'utilisateur dit "un paquet, pas plus, aide-moi a lancer".
- Preuve systeme: tour 4 `response_owner=orientation_clarification`, `route_reason=clarification_required`, aucun effet.
- Correction attendue: traiter une micro-action concrete deja choisie comme `action_readiness=ready/already_chosen`, puis repondre ou handoff vers `execution_breakdown` sans mutation.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: "un seul paquet maintenant" -> reponse de demarrage; "je ne sais pas quoi choisir" -> clarification.

### R2-B04

- Bug id: `R2-B04`
- Tours: 5
- Famille: `BF-ROUTE-03`
- Domaine owner: clarification arbitrator / prepare attack card admission.
- Source amont: "preparer mon demarrage" dans un flow demotivation devient `prepare_attack_card`.
- Symptome visible: Sophia dit qu'elle n'a pas pu preparer une carte, alors que le user demandait une aide de demarrage conversationnelle.
- Preuve systeme: `selected_handler=prepare_attack_card`, `route_reason=orientation_clarification_resolved_tool_skill`, `tool_execution=blocked`, `executed_tools=[]`.
- Correction attendue: distinguer preparation conversationnelle du demarrage et demande explicite de carte; router vers `execution_breakdown`/reply non-mutant, pas tool skill.
- Statut: `open`
- Fix reference: a definir.
- Tests requis: positif "prepare juste mon demarrage" -> no tool; anti-faux-positif "prepare une carte d'attaque" -> `prepare_attack_card`.

## Verifications

- Run IA reel local avec `force_full_ai=true`: fait.
- Effets durables: aucun rappel, aucune potion session, aucune carte d'attaque, aucune memoire observee.
- Test contractuel local: 15 tests `demotivation_repair` passes, 0 failed.
