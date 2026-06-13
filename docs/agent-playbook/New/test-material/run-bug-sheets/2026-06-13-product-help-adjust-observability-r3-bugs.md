# Run Bug Sheet - product-help-adjust-observability-20260613-r3

## R3-B01

- Bug id: R3-B01
- Tours: T1
- Famille: BF-ROUTE-03 - Product/status/tool mal priorises
- Domaine owner: `dispatcher-v2-llm`
- Source amont: note_information globale vers `product_help`
- Symptome visible: aucun dans r3; Product Help local corrige le hint et repond bien Ajustement du plan.
- Preuve systeme: raw `dispatcher-v2-llm` T1 contient encore `recommended_next_focus`: "Explain the product feature (Attack Cards) as the way to make an action concrete without mutating the Plan structure. Do not trigger adjust_plan_item."
- Correction attendue: le dispatcher global doit recommander `plan.adjustment / adjust_plan_item` dans la note_information quand le user demande comment rendre une action existante du Plan moins floue, plus concrete, ou mieux adaptee sans toucher au reste.
- Statut: open
- Fix reference: none
- Tests requis: raw dispatcher global sur question informative Plan refinement -> note_information structured_context/recommended_next_focus ne mentionne pas Attack Card; anti-faux-positif explicite "carte d'attaque" -> product_help/attack card reste autorise.
