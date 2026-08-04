# Bug Sheet - State Potion Other Flows Global R1

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, runs globaux pour Rappel, Courage, Guerison et Apaisement. Aucun fallback deterministe. Aucun changement de code applicatif pendant les runs.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-state-potion-other-flows-global-r1.md`

## Bugs

### SSP-OTHER-GLOBAL-R1-B01

- Bug id: `SSP-OTHER-GLOBAL-R1-B01`
- Tours: Courage Tour 1
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: dispatcher global / arbitration `select_state_potion` vs `normal_reply`
- Source amont: route policy pour une demande vague de potion avec contexte courage.
- Symptome visible: Sophia repond en `normal_reply`, propose des options non canoniques (`Potion Courage-Action`, `Potion Cadre & Message`) au lieu d'entrer dans `select_state_potion`.
- Preuve systeme: `response_owner=normal_reply`, `selected_handler=null`, `route_reason=normal_reply_default`, `tool_execution=none`, `executed_tools=[]`.
- Correction attendue: quand le user dit vouloir une potion sans savoir laquelle, le dispatcher global doit armer `select_state_potion` meme si le contexte semantique suggere deja Courage; `normal_reply` ne doit pas inventer de nomenclature produit.
- Statut: `open`
- Fix reference:
- Tests requis: positif `j'aimerais une potion mais je ne sais pas laquelle` + peur d'envoyer un message -> `selected_handler=select_state_potion`; paraphrase `je veux une potion, je bloque avant d'envoyer`; anti-faux-positif vraie discussion generale sur le concept de potion -> product/help ou normal reply sans options inventees; run reel Courage global.

### SSP-OTHER-GLOBAL-R1-B02

- Bug id: `SSP-OTHER-GLOBAL-R1-B02`
- Tours: Guerison Tours 3-5
- Famille: `BF-INTAKE-05` - Semantique composite aplatie
- Domaine owner: `select_state_potion.guerison` local intake / field merge / canonical option mapping
- Source amont: extraction du champ ferme `dominant_feeling`.
- Symptome visible: le user dit `Depuis je ressens surtout de la honte`, mais le champ plateforme rendu est `Tu ressens surtout quoi ? De la culpabilite`.
- Preuve systeme: Tour 3 `selected_handler=select_state_potion.guerison`, `status=handoff_delivered`, puis Tours 4-5 `repeat_handoff` et `apply_attempt` repetent la valeur `De la culpabilite`.
- Correction attendue: le message courant explicite doit avoir precedence sur le contexte precedent pour les champs fermes; `surtout de la honte` doit verrouiller l'option honte si elle existe dans le catalogue UI, sinon demander clarification au lieu de choisir culpabilite.
- Statut: `open`
- Fix reference:
- Tests requis: positif contexte culpabilite puis detail `surtout honte` -> champ honte; paraphrase `ce qui domine c'est la honte`; anti-faux-positif `je veux apaiser la culpabilite` sans signal honte -> culpabilite; repeat/apply_attempt repetent la valeur corrigee.

### SSP-OTHER-GLOBAL-R1-B03

- Bug id: `SSP-OTHER-GLOBAL-R1-B03`
- Tours: Rappel Tour 1
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: trace mapping dispatcher / route reason
- Source amont: metadata `route_reason` apres selection effective du tool skill.
- Symptome visible: experience correcte, mais trace incoherente: `response_owner=tool_skill` et `selected_handler=select_state_potion` avec `route_reason=normal_reply_default`.
- Preuve systeme: Rappel Tour 1 `tool_execution=platform_handoff`, `operation.status=clarifying`, `reason_code=state_potion_handoff_clarifying`, mais `route_reason=normal_reply_default`.
- Correction attendue: aligner le `route_reason` sur la decision effective quand un tool skill est selectionne.
- Statut: `open`
- Fix reference:
- Tests requis: run vague potion -> `response_owner=tool_skill`, `selected_handler=select_state_potion`, route reason non `normal_reply_default`; anti-faux-positif vrai normal reply garde `normal_reply_default`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Rappel global -> sous-skill | Rappel T1 `selected_handler=select_state_potion`, T2 `select_state_potion.rappel` | green |
| Apaisement global -> sous-skill | Apaisement T1 `selected_handler=select_state_potion`, T2 `select_state_potion.apaisement` | green |
| Courage subskill apres selection explicite | Courage T2-T6 `selected_handler=select_state_potion.courage` | green |
| Guerison route globale | Guerison T1-T2 `selected_handler=select_state_potion` puis `select_state_potion.guerison` | green |
| Repeat handoff actif | Tous les `Redis-moi` valides restent dans le sous-skill actif avec `repeat_handoff` | green |
| Apply attempt non-mutant | Tous les `Ok active-la` valides donnent `*_apply_attempt_no_chat_execution` | green |
| No mutation durable | Tous les runs valides: `executed_tools=[]`, `committed_effects=[]`, `user_potion_sessions=0`, `user_recurring_reminders=0`, `scheduled_checkins=0` | green |
| Cleanup cible | Utilisateurs QA temporaires supprimes apres run | green |

## Incidents QA Non Sophia

| Incident | Cause observee | Resolution | Statut |
| --- | --- | --- | --- |
| Rappel R1 invalide | HTTP 401 par token runner mal saisi avant Sophia | Run repris en `state-potion-rappel-global-20260608-r2` | closed |
| Courage T5 invalide | HTTP 401 par token runner mal saisi avant Sophia | Meme tour repris en T6 avec authentification correcte | closed |
