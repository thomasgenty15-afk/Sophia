# Prepare Attack Card Platform Fields R1 - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, run `attack-card-platform-fields-20260602-r1`, aucune correction pendant le run, cleanup cible effectue.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-prepare-attack-card-platform-fields-r1.md`

## Bugs

### PAC-FIELDS-R1-B01

- Bug id: `PAC-FIELDS-R1-B01`
- Tours: Tour 1, Tour 2
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: dispatcher / product_help skill entry arbitration
- Source amont: arbitrage entre `product_help` et `prepare_attack_card` quand une demande de preparation mentionne les champs plateforme
- Symptome visible: Sophia repond en aide produit generique ou hors sujet au lieu de preparer la carte et le handoff plateforme.
- Preuve systeme: Tour 1 et Tour 2 `response_owner=product_help`, `selected_handler=product_help`, `route_reason=skill_entry_signal`, `tool_skill_intents=[]`, `executed_tools=[]`, `tool_execution=none`.
- Correction attendue: une demande contenant preparation de carte + action cible + piege + no_create doit router vers `prepare_attack_card` ou demander une clarification product_help vs preparation; la simple mention "champs plateforme" ne doit pas forcer `product_help`.
- Statut: `open`
- Fix reference:
- Tests requis: positif "prepare la carte et dis-moi quoi remplir"; paraphrase "je veux renseigner cette carte d'attaque pour mon action"; anti-faux-positif "je veux juste comprendre les champs d'une carte d'attaque"; integration locale `/test-send-message force_full_ai=true`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Handoff enrichi une fois le skill atteint | Tour 3 `selected_handler=prepare_attack_card`, `tool_execution=platform_handoff`, destination + parcours + champs + reponses proposees | green |
| No-mutation sur apply attempt | Tour 4 `route_reason=confirmation_yes_is_handoff_apply_attempt`, `executed_tools=[]`, reponse repete destination/parcours/champs | green |
| Aucun effet durable chat | Tous les tours `executed_tools=[]`; cleanup cible effectue | green |
