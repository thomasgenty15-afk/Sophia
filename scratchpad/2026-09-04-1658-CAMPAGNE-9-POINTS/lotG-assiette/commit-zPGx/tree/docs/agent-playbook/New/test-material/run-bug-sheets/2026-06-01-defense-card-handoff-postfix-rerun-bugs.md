# Defense Card Handoff Postfix Rerun Bugs - 2026-06-01

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`,
connexions QA temporaires, aucun renderer deterministe, aucun fallback direct.

Run ids:

- `defense-handoff-postfix-r1-20260601`
- `defense-handoff-postfix-r2-20260601`
- `defense-handoff-postfix-r3-20260601`

## Bugs

### DEF-HANDOFF-POSTFIX-B01

- Tours: R3 T2
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: clarification arbitration / active handoff arbitration
- Source amont: `orientation_clarification` preempte une continuation active
  qui devrait rester dans `prepare_defense_card`.
- Symptome visible: apres un handoff de carte defense, le message "Redis-moi
  quoi mettre exactement et où je la mets." declenche une clarification entre
  texte a copier et aide produit, au lieu de repeter directement le brouillon
  et la destination.
- Preuve systeme: R3 T2, `response_owner=orientation_clarification`,
  `selected_handler=orientation_clarification`, `route_reason=clarification_required`,
  `tool_execution=none`, `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: les phrases active handoff "redis-moi quoi mettre",
  "où je la mets", "quoi mettre exactement" doivent bypasser
  `orientation_clarification` et rester au skill comme `repeat_handoff`.
- Statut: `open`
- Fix reference: aucun
- Tests requis: integration active handoff avec message composite "Redis-moi
  quoi mettre exactement et où je la mets."; attendre
  `selected_handler=prepare_defense_card`, `route_reason=active_handoff_repeat_handoff`,
  `tool_execution=platform_handoff`, `executed_tools=[]`.

### DEF-HANDOFF-POSTFIX-B02

- Tours: R3 T3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: clarification arbitration / active handoff state
- Source amont: la clarification ouverte au tour precedent capture
  l'annulation "Pas de carte finalement." avant que le handoff
  `prepare_defense_card` puisse rendre `cancelled`.
- Symptome visible: l'annulation est correcte en surface et sans mutation, mais
  elle annule la clarification (`orientation_clarification_cancelled`) au lieu
  de tracer `prepare_defense_card.cancelled`.
- Preuve systeme: R3 T3, `response_owner=normal_reply`, `selected_handler=null`,
  `route_reason=orientation_clarification_cancelled`, `tool_execution=none`,
  `executed_tools=[]`, `user_defense_cards=0`.
- Correction attendue: pendant un handoff actif, une annulation "Pas de carte
  finalement." doit revenir au skill actif et produire `cancelled`, meme si une
  clarification intermediaire a ete ouverte a tort.
- Statut: `open`
- Fix reference: aucun
- Tests requis: integration active handoff avec T1 handoff, T2 repeat composite,
  T3 cancel; verifier repeat puis cancel au skill, no DB write.

## Verifications positives

- R2 T3 verifie le fix precedent: "Rends-la plus douce, avec un plan B moins
  strict." produit maintenant `route_reason=active_handoff_revise_handoff`,
  `tool_execution=platform_handoff`, `executed_tools=[]`,
  `user_defense_cards=0`.

