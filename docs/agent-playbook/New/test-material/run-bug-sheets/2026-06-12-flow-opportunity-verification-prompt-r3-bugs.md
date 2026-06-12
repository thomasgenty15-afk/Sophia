# Bug Sheet - Flow Opportunity Verification Prompt R3

Run exploitable: `flow-opportunity-verification-prompt-r3c-20260612`

Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-12-flow-opportunity-verification-prompt-r3.md`

## Bugs

### R3-B01

- Tours: 2
- Famille: `BF-STATE-02` - Pending confirmation cible perdue
- Domaine owner: `flow_opportunity_verification`
- Source amont: dispatcher local / regle d'acceptation de `handoff_to_local_flow`
- Symptome visible: le user demande seulement "confirme-moi juste" que le recap sera read-only ; Sophia confirme puis execute le recap dans le meme tour.
- Preuve systeme: tour 2 selectionne `status_recap`, `selected_action=answer_object_status`, et `flow_opportunity_state=null` apres le tour. La note de handoff est canonique, donc le probleme n'est pas le format de `note_information`.
- Correction attendue: distinguer contrainte ou question pre-confirmation d'une acceptation explicite. Les formulations "confirme-moi juste", "avant de dire oui", "sans lancer encore" doivent rester dans le flow parent ou passer par un inline product/status roundtrip sans nettoyer l'ancre.
- Statut: `open`
- Fix reference: n/a
- Tests requis: test dispatcher/reducer anti-faux-positif pour "confirme-moi juste que c'est read-only"; test positif pour "oui, fais le recap"; rerun QA reel avec contrainte read-only puis acceptation explicite.
