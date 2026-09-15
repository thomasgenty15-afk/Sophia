# Bug Sheet - adjust_plan Rule 0 R1

## Contexte

- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-adjust-plan-rule0-r1.md`
- Run: `adjust-plan-rule0-r1`
- Verdict global: red
- Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, 6 tours, aucun code modifie pendant le run.

## Bugs

### R1-B01 - Active handoff vole par product_help

- Tours: 4
- Famille: `BF-ROUTE-03` - Product/status/tool mal priorises
- Domaine owner: routers/arbitrators active flow
- Source amont: active handoff arbitration + product_help inline resume policy
- Symptome visible: "Redis-moi exactement quoi faire dans Plan" reçoit une aide produit generique sur Plan au lieu de repeter le handoff adjust_plan.
- Preuve systeme: `response_owner=product_help`, `selected_handler=product_help`, `route_reason=product_help_inline_resume_active_tool_skill`, `tool_execution=none`.
- Correction attendue: quand `adjust_plan_item` est actif en `platform_handoff`, les demandes de repeat/reformulation/destination liees au handoff restent au skill; `product_help` ne preempte que si l'intention produit est autonome et explicite.
- Statut: `open`
- Fix reference: a definir
- Tests requis: `redis-moi quoi faire dans Plan` inside active adjust_plan -> `repeat_handoff`; paraphrase `donne-moi la version courte a copier dans Plan` -> `adjust_plan_item`; anti-faux-positif `comment ouvrir Plan ?` hors handoff -> `product_help`.

### R1-B02 - Revise handoff recycle le draft ou copie le user

- Tours: 2, 5, 6
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `adjust_plan_item`
- Source amont: reducer `revise_handoff`/`repeat_handoff`, handoff draft generation, renderer integration
- Symptome visible: Sophia garde un framing whole-plan stale, copie le message utilisateur dans "Ma recommandation", ou ignore la demande de phrase courte/chaleureuse.
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=adjust_plan_item`, no effects; contenu visible stale malgre nouveaux signaux `cette semaine`, `signal de pause`, `version courte`.
- Correction attendue: distinguer repeat, revise et apply_attempt; regenerer le draft depuis le scope courant et la demande de style; ne jamais utiliser le message utilisateur brut comme `recommended_change`.
- Statut: `open`
- Fix reference: a definir
- Tests requis: `plutôt cette semaine` regenere un draft `current_week`; `redis-moi la recommandation` repete le draft; `rends ça plus chaleureux` produit une phrase courte reusable; aucun test ne doit matcher une phrase exacte.

### R1-B03 - Slotting metier deterministe suspect dans adjust_plan intake

- Tours: 1, 2, 3, 5, 6
- Famille: `BF-INTAKE-05` - Semantique composite aplatie
- Domaine owner: `adjust_plan_item` intake/candidate compiler
- Source amont: scope/intake payload, candidate builder, coaching guidance compiler
- Symptome visible: le systeme fige trop vite le cas en whole-plan/resequence et resiste au glissement "cette semaine / signal de pause".
- Preuve systeme: traces avec `deterministic whole-plan fit/complexity signal`, `deterministic whole-plan mentioned plan anchors`, `deterministic whole-plan concrete trajectory proposal`.
- Correction attendue: auditer ces signaux contre `contract-prompts/anti-patching-qa-charter.md`; les decisions de scope/slots metier doivent venir du dispatcher structure, de l'intake IA ou du clarification tool, pas de regex/includes ou de heuristiques semantiques locales.
- Statut: `open`
- Fix reference: a definir
- Tests requis: inspection structurelle no-regex/no-includes pour routing metier; run paraphrase whole-plan vs current-week; ambiguity `je veux changer ça` -> clarification; trace sans evidence "deterministic..." pour decisions metier.

### R1-B04 - Apply attempt no-mutation correct mais rendu incomplet

- Tours: 3
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `adjust_plan_item`
- Source amont: reducer `apply_attempt` + renderer handoff
- Symptome visible: "Ok vas-y applique" n'execute rien, mais Sophia ne nomme pas clairement l'impossibilite d'appliquer depuis le chat et ressort un draft mecanique.
- Preuve systeme: `executed_tools=[]`, `pending_confirmation=false`, `direct_effects=[]`, `tool_execution=platform_handoff`.
- Correction attendue: `apply_attempt` doit rendre un message dedie: pas d'execution chat, destination Plan, version courte a reprendre.
- Statut: `open`
- Fix reference: a definir
- Tests requis: `ok vas-y`, `applique`, `fais-le` inside active handoff -> no executor/no token/no writer + renderer apply_attempt clair.
