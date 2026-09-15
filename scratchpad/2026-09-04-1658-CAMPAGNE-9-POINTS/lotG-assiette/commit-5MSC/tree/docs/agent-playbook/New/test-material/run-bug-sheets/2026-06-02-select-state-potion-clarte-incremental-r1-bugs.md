# Bug Sheet — select_state_potion clarte incremental R1

- Run: `qa-potion-clarte-incremental-20260602-r1`
- Date: 2026-06-02
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-02-select-state-potion-clarte-incremental-r1.md`
- Verdict global: yellow

## CLARTE-R1-B01

- Tours: 3
- Famille: BF-STATE-01
- Domaine owner: active handoff arbitration + `select_state_potion` detail intake
- Source amont: distinction entre confirmation de champ courant et `handoff_apply_attempt`
- Symptome visible: "Oui, mets ça" apres une proposition de valeur est rendu comme "Je ne peux pas le créer/lancer depuis le chat" au lieu de verrouiller le premier champ.
- Preuve systeme: `route_reason=active_handoff_apply_attempt`, `executed_tools=[]`, `direct_effects=[]`.
- Correction attendue: quand `phase=detail_intake` et qu'un champ est `proposed`, une confirmation structuree doit devenir `field_value_confirmation`, pas apply_attempt. `handoff_apply_attempt` doit rester reserve aux demandes d'application, surtout apres handoff final.
- Statut: fixed
- Fix reference: `select_state_potion` handoff detail-intake proposed-field guard + unit test `field confirmation during detail intake is not apply_attempt`
- Tests requis: positif "oui mets ça" verrouille le champ; paraphrase "ok garde cette formulation"; anti-faux-positif "ok maintenant active-la" apres handoff final reste apply_attempt; aucune DB mutation.

## CLARTE-R1-B02

- Tours: 7
- Famille: BF-INTAKE-05
- Domaine owner: `clarte_intake` / `potion_detail_intake`
- Source amont: extraction du champ UI `output_style`
- Symptome visible: "Une priorité nette, mais formulée simplement" devient "Quelque chose de simple".
- Preuve systeme: handoff final affiche `Tu veux ressortir avec quoi ? Quelque chose de simple`.
- Correction attendue: l'IA doit extraire l'intention principale du champ courant (`priorite`) et traiter "formulee simplement" comme nuance de formulation, pas comme option principale `simple`.
- Statut: fixed
- Fix reference: `clarte_intake` output_style extraction rule + prompt invariant test `clarte detail prompt preserves priority over simple wording for output_style`
- Tests requis: positif "une priorité nette, simplement" -> `output_style=priorite`; paraphrase "un cap clair mais en phrase simple"; anti-faux-positif "quelque chose de simple, pas une priorité" -> `simple`.
