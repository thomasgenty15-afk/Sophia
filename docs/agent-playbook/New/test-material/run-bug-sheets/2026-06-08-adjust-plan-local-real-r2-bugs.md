# Bug Sheet - adjust-plan-local-real-r2

## R2-B01

- Bug id: `R2-B01`
- Tours: 1, 2
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: global dispatcher / `adjust_plan_item` admission
- Source amont: routing policy pour demandes de modification d'action de Plan
- Symptome visible: Sophia repond en conversation normale et clarifie, mais n'ouvre pas le flux `adjust_plan_item` alors que le user demande de rendre une action du Plan plus legere.
- Preuve systeme: tours 1-2 `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, `executed_tools=[]`, `durable_effect=none`.
- Correction attendue: renforcer le contrat de routing pour item de Plan nomme + intention de transformation; autoriser le local flow a poser la clarification au lieu de laisser `normal_reply` gerer seul.
- Statut: `open`
- Fix reference: a definir
- Tests requis: paraphrase implicite ("rendre plus leger dans le Plan"), item nomme + consigne ciblee, anti-faux-positif pour discussion generale sans demande de modification.

## R2-B02

- Bug id: `R2-B02`
- Tours: 3, 5
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `adjust_plan_item` local flow / visible agent
- Source amont: contrat reducer -> visible agent pour handoff Plan
- Symptome visible: Sophia affiche un fallback d'erreur ("je n'arrive pas a formuler correctement...") au lieu de fournir une proposition de handoff Plan.
- Preuve systeme: `selected_handler=adjust_plan_item`, `durable_effect=platform_handoff`, `status=blocked`, `reason_code=adjust_plan_item_visible_agent_failed`, runtime issue `missing_suggested_platform_input`, `executed_tools=[]`, `no_chat_mutation=true`.
- Correction attendue: compiler et transmettre un `suggested_platform_input` obligatoire pour `plan_handoff_ready` et `apply_attempt`; bloquer `platform_handoff.status=delivered` si le payload visible est absent.
- Statut: `open`
- Fix reference: a definir
- Tests requis: local flow positif avec draft complet, apply attempt non-mutant avec handoff complet, test negatif qui echoue si `suggested_platform_input` manque.

## R2-B03

- Bug id: `R2-B03`
- Tours: 4
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: active flow state / router runtime
- Source amont: persistence et exit memo apres `adjust_plan_item_visible_agent_failed`
- Symptome visible: apres que Sophia dit garder l'ajustement du plan en cours, le tour suivant repart en `normal_reply` au lieu de reprendre le flow local.
- Preuve systeme: tour 3 `response_owner=tool_skill` avec `adjust_plan_item_visible_agent_failed`; tour 4 `response_owner=normal_reply`, `selected_handler=null`, `operation=null`.
- Correction attendue: definir une policy explicite apres echec visible: soit sortie nette sans promesse de continuation, soit active state conservé et repris localement au tour suivant.
- Statut: `open`
- Fix reference: a definir
- Tests requis: integration router multi-turn apres visible-agent failure, reprise locale sur retry, anti-capture si l'utilisateur change vraiment de sujet.
