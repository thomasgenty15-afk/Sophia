# Defense Card Handoff Nofix Rerun Bugs - 2026-06-02

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`,
connexions QA temporaires, aucun renderer deterministe, aucun fallback direct,
aucune correction appliquee pendant les runs.

Run ids:

- `defense-handoff-nofix-r1-20260602`
- `defense-handoff-nofix-r2-20260602`
- `defense-handoff-nofix-r3-20260602`

## Bugs

### DEF-HANDOFF-NOFIX-B01

- Tours: R1 T2, R2 T1
- Famille: `BF-EFFECT-04` - Executor ou fallback technique fragile
- Domaine owner: `prepare_defense_card` intake/generator/runtime
- Source amont: generation de brouillon handoff apres routage explicite
- Symptome visible: Sophia repond "Je n'arrive pas à préparer cette carte
  proprement là. On peut reprendre dans un instant." sur des demandes explicites
  de brouillon no-create.
- Preuve systeme: `response_owner=tool_skill`,
  `selected_handler=prepare_defense_card`,
  `route_reason=explicit_defense_card_handoff_runtime_priority`,
  `tool_execution=failed`, `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: une demande explicite avec slots suffisants doit produire
  un `platform_handoff` ou une clarification de slot propre, pas un failed
  generique.
- Statut: `open`
- Fix reference: aucun, pas de correction appliquee pendant ce rerun.
- Tests requis: integration force_full_ai sur demande defense no-create; tests
  de fallback intake/generator qui imposent `platform_handoff` ou
  `ask_question`, jamais `failed` generique pour slots suffisants.

### DEF-HANDOFF-NOFIX-B02

- Tours: R3 T2
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: clarification arbitration / active handoff arbitration
- Source amont: `orientation_clarification` preempte une continuation active
  qui devrait rester dans `prepare_defense_card`.
- Symptome visible: apres un handoff de carte defense, "Redis-moi quoi mettre
  exactement et où je la mets." ouvre une clarification entre contenu et aide
  produit, au lieu de repeter le brouillon et la destination.
- Preuve systeme: `response_owner=orientation_clarification`,
  `selected_handler=orientation_clarification`,
  `route_reason=clarification_required`, `tool_execution=none`,
  `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: les continuations actives `redis-moi`, `quoi mettre`,
  `où je la mets` doivent bypasser `orientation_clarification` et rester au
  skill comme `repeat_handoff`.
- Statut: `open`
- Fix reference: aucun, pas de correction appliquee pendant ce rerun.
- Tests requis: integration active handoff avec "Redis-moi quoi mettre
  exactement et où je la mets." -> `active_handoff_repeat_handoff`.

### DEF-HANDOFF-NOFIX-B03

- Tours: R3 T3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: clarification arbitration / active handoff state
- Source amont: clarification ouverte au tour precedent capture l'annulation
  avant le handoff actif.
- Symptome visible: "Pas de carte finalement." annule la clarification
  (`orientation_clarification_cancelled`) au lieu de tracer
  `prepare_defense_card.cancelled`.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`,
  `route_reason=orientation_clarification_cancelled`, `tool_execution=none`,
  `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: pendant un handoff actif, une annulation carte doit
  revenir au skill actif et produire `cancelled`, meme apres une clarification
  intermediaire.
- Statut: `open`
- Fix reference: aucun, pas de correction appliquee pendant ce rerun.
- Tests requis: integration T1 handoff, T2 repeat composite, T3 cancel; verifier
  repeat puis cancel au skill, no DB write.

