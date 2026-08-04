# Defense Card Handoff Verify Rerun Bugs - 2026-06-01

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`,
connexions QA temporaires, aucun renderer deterministe, aucun fallback direct.

Run ids:

- `defense-handoff-rerun-r1b-20260601`
- `defense-handoff-rerun-r2-20260601`
- `defense-handoff-rerun-r3-20260601`

## Bugs

### DEF-HANDOFF-VERIFY-B01

- Tours: R2 T3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: active handoff arbitration / `prepare_defense_card`
- Source amont: classification active handoff pour revision de brouillon
- Symptome visible: Sophia produit bien une version plus douce avec un plan B,
  sans mutation, mais la trace courte remonte `route_reason_code =
  active_handoff_turn_unclear` au lieu d'un statut/reason explicite
  `revise_handoff`.
- Preuve systeme: R2 T3, `response_owner=tool_skill`,
  `selected_handler=prepare_defense_card`, `tool_execution=platform_handoff`,
  `executed_tools=[]`, `user_defense_cards=0`, mais
  `route_reason_code=active_handoff_turn_unclear`.
- Correction attendue: les demandes actives de type "rends-la plus douce",
  "avec un plan B", "change le plan B" doivent etre classees en
  `revise_handoff` dans l'etat/trace, tout en gardant le comportement non
  mutant.
- Statut: `fixed`
- Fix reference: `handoff_flow_arbitration.ts` reconnait maintenant
  "Rends-la plus douce, avec un plan B moins strict." comme
  `revise_handoff`; tests `handoff_flow_arbitration_test.ts` et
  `prepare_defense_card/tests.ts`.
- Tests requis: test actif handoff avec "Rends-la plus douce, avec un plan B
  moins strict."; integration `/test-send-message force_full_ai=true` qui
  observe `revise_handoff`, `executed_tools=[]`, `committed_effects=[]`.

### DEF-HANDOFF-VERIFY-B02

- Tours: R3 T3
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: active handoff arbitration / route policy
- Source amont: capture active handoff des annulations "pas de carte"
- Symptome visible: Sophia annule correctement en surface ("Ok, pas de
  carte") et ne cree rien, mais le tour sort en `normal_reply` au lieu de
  rester au skill `prepare_defense_card` avec statut `cancelled`.
- Preuve systeme: R3 T3, `response_owner=normal_reply`, `selected_handler=null`,
  `route_reason_code=normal_reply_default`, `tool_execution=none`,
  `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: pendant un handoff `prepare_defense_card` actif,
  "Pas de carte finalement." doit etre capture par le skill et tracer
  `cancelled`, puis clear l'etat actif sans mutation.
- Statut: `fixed`
- Fix reference: `run.ts` laisse les annulations actives
  `prepare_defense_card` retourner au skill au lieu de clearer l'etat avant le
  runtime; tests `handoff_flow_arbitration_test.ts` et
  `prepare_defense_card/tests.ts`.
- Tests requis: test active handoff avec casse/ponctuation
  "Pas de carte finalement."; integration `/test-send-message
  force_full_ai=true` verifiant `selected_handler=prepare_defense_card`,
  statut `cancelled`, `executed_tools=[]`, `user_defense_cards=0`.
