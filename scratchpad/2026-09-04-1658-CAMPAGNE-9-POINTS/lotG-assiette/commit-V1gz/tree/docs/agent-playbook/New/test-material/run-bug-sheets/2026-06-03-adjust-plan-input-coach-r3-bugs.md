# Bug Sheet - adjust-plan-input-coach-r3

## Contexte

- Date: 2026-06-03
- Run: `adjust-plan-input-coach-r3`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-03-adjust-plan-input-coach-r3.md`
- Persona: `rose`
- Verdict global: yellow
- Cadre: run IA reel local, `/functions/v1/test-send-message`, `force_full_ai=true`.

## Bugs

### R3-B01 - Repeat actif rendu par le mauvais owner

- Bug id: `R3-B01`
- Tours: 3
- Famille: `BF-ROUTE-03` - Product/status/tool mal priorises
- Domaine owner: active flow arbitration
- Source amont: priorite entre handoff actif `adjust_plan_item` et `product_help` quand le message demande de repeter l'artefact actif.
- Symptome visible: la reponse est bonne, mais `response_owner=product_help` et `tool_skill_run=null`.
- Preuve systeme: T3 `selected_handler=product_help`, `route_reason_code=skill_entry_signal`, `response_tool_execution=none`.
- Correction attendue: repeat d'artefact actif reste au skill actif ; vraie question produit explicite peut partir a `product_help`.
- Statut: `open`
- Fix reference: a definir
- Tests requis: positif `redis-moi seulement la phrase` pendant handoff actif ; paraphrase `redonne-moi le texte a coller`; anti-faux-positif `ou est l'onglet Plan ?` doit rester `product_help`.

### R3-B02 - Apply attempt non modelise

- Bug id: `R3-B02`
- Tours: 4
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: active flow continuation contract + `adjust_plan_item` state
- Source amont: la demande "applique cette phrase" est rabattue vers `revise_draft`.
- Symptome visible: Sophia ne mute rien, mais ne trace pas `apply_attempt`.
- Preuve systeme: T4 `tool_skill_run.status=revise_draft`, `reason_code=active_platform_input_coach_default_revision`, `executed_tools=[]`, `committed_effects=[]`.
- Correction attendue: `apply_attempt` explicite, no-mutation, destination Plan, sans executor ni confirmation.
- Statut: `open`
- Fix reference: a definir
- Tests requis: positif `ok applique cette phrase`; paraphrase `vas-y fais-le dans mon plan`; anti-faux-positif `ok je vais le faire moi-meme dans Plan` ne doit pas etre traite comme demande d'execution.

## Verification Positive

- Ancien template visible supprime du run reel: pas de sequence `Je vois l'idée` / `Tu peux reprendre cette phrase dans Plan` / `À préserver` / `À éviter`.
- No-mutation preservee: `executed_tools=[]`, `committed_effects=[]`, pas de pending confirmation, cleanup restaure 1 plan et 5 items.
