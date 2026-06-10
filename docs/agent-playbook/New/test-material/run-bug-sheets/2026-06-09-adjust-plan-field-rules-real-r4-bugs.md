# Bug Sheet - adjust_plan_item field rules real R4 - 2026-06-09

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ADJUST-PLAN-FIELD-R4-B01 | T4 | `BF-STATE-01` | `adjust_plan_item` visible agent | Prompt stage `cancel_close` | Apres "Ok stop, laisse tomber", Sophia ferme mais ajoute "Je te laisse retourner à ton plan." | Trace correcte: `flow_action=cancel_flow`, `visible_task=cancel_close`, `local_state_null=true`, global bloque, `committed=0`. Le bug est uniquement le message visible. | Pour stop/cancel/defer sans nouveau sujet, produire une fermeture courte sans destination Plan, sans question et sans suite proposee. | open | N/A | Unit visible-agent `cancel_close`: variantes "stop", "laisse tomber", "pas maintenant" -> aucun "Plan", "retourner", "reprendre", "appliquer"; rerun QA stop local. |
