# Bug Sheet - adjust-plan-input-coach-r2

## Contexte

- Date: 2026-06-03
- Run: `adjust-plan-input-coach-r2`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-adjust-plan-input-coach-r2.md`
- Persona: `rose`
- Verdict global: red
- Cadre: run IA reel local, `/functions/v1/test-send-message`, `force_full_ai=true`, aucun fallback deterministe.

## Bugs

### R2-B01 - Repeat actif capture par product_help

- Bug id: `R2-B01`
- Tours: 3
- Famille: `BF-ROUTE-03` - Product/status/tool mal priorises
- Domaine owner: active flow arbitration, priorite `adjust_plan_item` vs `product_help`
- Source amont: policy d'arbitrage quand un handoff `adjust_plan_item` actif existe et que le message demande de repeter l'artefact en cours.
- Symptome visible: le user demande "Redis-moi juste la phrase courte a coller dans Plan", mais Sophia repond par une aide generale sur Plan.
- Preuve systeme: `response_owner=product_help`, `selected_handler=product_help`, `route_reason_code=skill_entry_signal`, `tool_skill_run=null`, `executed_tools=[]`.
- Correction attendue: l'arbitrage doit laisser au handoff actif les demandes de repeat/reprise de l'artefact courant. Les vraies questions produit explicites doivent rester routables vers `product_help`.
- Statut: `open`
- Fix reference: a definir
- Tests requis: positif `redis-moi la phrase a coller dans Plan` pendant handoff actif ; paraphrase `redonne-moi ce qu'on vient de preparer` ; anti-faux-positif `ou est l'onglet Plan ?` hors artefact actif doit pouvoir aller a `product_help` ; integration multi-tour avec correction utilisateur.

### R2-B02 - Lifecycle actif rabattu vers start/default/revise

- Bug id: `R2-B02`
- Tours: 2, 4, 5
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `adjust_plan_item` active state/reducer + route trace mapping
- Source amont: contrat de continuation du handoff actif, qui ne modelise pas assez distinctement `revise_draft`, `repeat_handoff`, `phrase_only` et `apply_attempt`.
- Symptome visible: T2 revise bien la phrase mais la route globale reste `tool_skill_intent_start`; T4 demande une phrase courte mais rend tout le bloc ; T5 "applique" n'est pas trace comme `apply_attempt`.
- Preuve systeme: T2 `route_reason_code=tool_skill_intent_start` avec `tool_skill_run.reason_code=tool_skill_intent_revises_platform_input`; T4/T5 `route_reason_code=normal_reply_default`, `status=revise_draft`.
- Correction attendue: formaliser les transitions de handoff actif comme intentions structurees du skill et les remonter dans les traces ; renderer court pour `phrase_only` ; renderer no-mutation explicite pour `apply_attempt`.
- Statut: `open`
- Fix reference: a definir
- Tests requis: positif `rends-la plus precise` -> `revise_draft`; positif `redis-moi juste la phrase` -> `repeat_handoff` ou `phrase_only`; positif `ok vas-y applique` -> `apply_attempt`, `committed_effects=[]`, `executedTools=[]`; anti-faux-positif nouvelle intention explicite `mets-moi un rappel demain` doit sortir du handoff.

### R2-B03 - Apply attempt no-mutation pas assez explicite

- Bug id: `R2-B03`
- Tours: 5
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: renderer `adjust_plan_item` + state active handoff
- Source amont: absence de statut `apply_attempt` exploitable par le renderer.
- Symptome visible: Sophia n'execute rien mais ne dit pas clairement que l'application doit se faire dans Plan, pas depuis le chat.
- Preuve systeme: T5 `executed_tools=[]`, `committed_effects=[]`, `pending_confirmation=null`, mais `tool_skill_run.status=revise_draft` et reponse identique au repeat complet.
- Correction attendue: quand le user demande d'appliquer un input non executable, le skill doit rendre une redirection chaleureuse et explicite : reprendre la phrase dans Plan, sans creer de confirmation ni chemin executor.
- Statut: `open`
- Fix reference: a definir
- Tests requis: positif `ok applique` apres handoff actif ; paraphrase `vas-y fais-le`; anti-faux-positif `ok je vais le faire dans Plan` ne doit pas sur-expliciter ; invariant wording no "c'est fait", no "j'ai modifie", contains destination Plan.

## Synthese Owners

- Owner principal: active flow arbitration pour la priorite du handoff actif sur `product_help`.
- Owner secondaire: `adjust_plan_item` state/reducer/renderer pour distinguer repeat, phrase courte, revision et apply attempt.
- Non-solution: ajouter une regex locale sur "redis-moi", "Plan" ou "applique". La charte anti-patching interdit que ces checks inventent une intention metier ; la correction doit passer par l'etat actif et une intention structuree.
