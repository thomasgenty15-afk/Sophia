# Bug Sheet - select_state_potion Amour R1

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, run `state-potion-amour-20260608-r1`. Aucun fallback deterministe. Aucun changement de code pendant le run.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-select-state-potion-amour-r1.md`

## Bugs

### SSP-AMOUR-R1-B01

- Bug id: `SSP-AMOUR-R1-B01`
- Tours: Tour 2
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande
- Domaine owner: `select_state_potion.amour` subskill intake / local flow
- Source amont: extraction et merge du champ `love_state`
- Symptome visible: le user dit `je me parle tres durement`, mais Sophia redemande `Tu te sens surtout comment ?`.
- Preuve systeme: Tour 2 `selected_handler=select_state_potion.amour`, `current_field_id=love_state`, `flow_action=platform_destination_followup`, `status=repeat_handoff`.
- Correction attendue: la sortie structuree du sous-skill doit verrouiller `love_state=dur` quand l'utilisateur donne une formulation explicite de durete envers soi.
- Statut: `fixed`
- Fix reference: `select_state_potion/subskills/state_potion_subskill_flow.ts`; prompt local priorise `answer_current_field` avant destination followup et le reducer merge les field patches meme si l'action IA est `platform_destination_followup`.
- Tests requis: positif `je me parle tres durement` -> `love_state=dur`; paraphrase `je suis tres dur avec moi`; anti-faux-positif "je veux plus de douceur" seul ne locke pas forcement `dur`; run reel Amour T1-T2.
- Tests ajoutes: `amour field answer locks natural self-harshness and delivers handoff`; `amour destination followup still merges provided field values before deciding final handoff`; `active potion subskill delivers final handoff when remaining field is answered`.

### SSP-AMOUR-R1-B02

- Bug id: `SSP-AMOUR-R1-B02`
- Tours: Tour 3
- Famille: `BF-STATE-03` - Draft lifecycle casse
- Domaine owner: `select_state_potion.amour` reducer / visible renderer
- Source amont: transition finale des sous-flows potion avec champs requis complets
- Symptome visible: le handoff final affiche seulement les champs plateforme et la destination, sans rendre le contrat complet: etat compris, shift, pourquoi, a preserver, a eviter, phrase finale no-mutation.
- Preuve systeme: Tour 3 `status=repeat_handoff`, `reason_code=amour_platform_destination_followup`, `platform_handoff.draft=null`.
- Correction attendue: quand `love_lack_context` et `love_state` sont complets, produire un `handoff_delivered` avec un `StatePotionHandoffDraft` complet et renderer contractuel.
- Statut: `fixed`
- Fix reference: `select_state_potion/subskills/state_potion_subskill_flow.ts`, `select_state_potion/handoff.ts`; les sous-skills locaux complets produisent un `handoff_delivered` avec `StatePotionHandoffDraft`, et le runtime generique livre directement le handoff complet quand l'intake a deja toutes les reponses.
- Tests requis: handoff complet Amour contient les 7 blocs renderer; `draft` non null au handoff final; no `executed_tools`; no `committed_effects`; no DB sessions/reminders/checkins.
- Tests ajoutes: `state potion subskill completed fields always produce a final handoff for every local potion`; `active potion subskill delivers final handoff when remaining field is answered`.

## Verifications Vertes

| Scenario | Preuve | Statut |
| --- | --- | --- |
| Routage initial Amour | Tour 1 `selected_handler=select_state_potion.amour` | green |
| No mutation nominale | Tous les tours valides `executed_tools=[]`, `committed_effects=[]` | green |
| Apply attempt non-mutant | Tour 4b `status=apply_attempt`, `reason_code=amour_apply_attempt_no_chat_execution` | green |
| Repeat handoff actif | Tour 5 reste `select_state_potion.amour`, `status=repeat_handoff` | green |
| DB sans effets interdits | `user_potion_sessions=[]`, `user_recurring_reminders=[]`, `scheduled_checkins=[]` | green |
| Cleanup cible | Utilisateur Auth temporaire supprime | green |
