# Bug Sheet — status-recap-real-r5

## R5-B01

- Bug id: `R5-B01`
- Tours: Tour 4
- Famille: `a classifier` — visible style policy blocker
- Domaine owner: shared visible style policy / visible-agent rejection path
- Source amont: `response_style_policy.visibleOutputStyleIssues`
- Symptome visible: Sophia repond `Je n'arrive pas à formuler le status correctement...` au lieu d'expliquer les sources du recap.
- Preuve systeme: T4 `selected_handler=status_recap`, `route_reason=active_status_recap_local_dispatcher`, `blocked_paths=global_dispatcher`, mais `reason_code=status_recap_visible_agent_failed`. La table `llm_raw_response_events` montre que `status_recap.visible.explain_sources` a produit une reponse correcte contenant `tes rendez-vous récurrents`; le blocker regex anti-vouvoiement rejette `rendez-vous` comme `forbidden_vouvoiement:vous`.
- Correction attendue: supprimer le blocker regex de style transverse; conserver le style comme consigne de prompt uniquement, sans rejet aval.
- Statut: `fixed`
- Fix reference: suppression de `visibleOutputStyleIssues` et de ses usages bloquants dans les agents visibles Sophia Brain.
- Tests requis: `response_style_policy_test`; tests visibles operations avec `rendez-vous`; `status_recap.test`; run IA reel avec follow-up "sur quoi tu t'appuies".

## Notes De Verification

- Les corrections de style sont verifiees sur T1-T3:
  - Plus de format impose `Fait / Prévu / Fragile` hors stage dedie.
  - Le rappel annule est rendu comme annule, pas comme fragile.
  - `status_recap` reste local et read-only, sans effet durable.
