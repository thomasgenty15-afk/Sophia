# Bug Sheet - emotional-repair-potion-bridges-r1

## Run

- Date: 2026-06-15
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-15-emotional-repair-potion-bridges-r1.md`
- Raw artifacts: `tests/real-personas/qa-skill/runs/emotional_repair/2026-06-15-emotional-repair-potion-bridges-r1-*.json`
- Verdict: red

## Bugs

### Bug id: R1-B01

- Tours: A3-A5
- Famille: `BF-STATE-01` - mauvaise transition de flow
- Domaine owner: `emotional_repair`
- Source amont: local dispatcher/reducer bridge potion, `last_potion_bridge_offer`, `conversationContextForVisibleTask`, state patch `emotional_repair_potion_handoff`
- Symptome visible: Sophia reconnait le besoin de potion/douceur mais ne rend pas une offre claire; apres consentement, elle repond vaguement "Voyons ce qui te conviendrait" sans passer au sous-flow potion.
- Preuve systeme: A3-A4 `local_flow_action=potion_bridge_offer` mais `local_visible_task=separate_fact_from_identity`; A5 `local_flow_action=confirm_potion_bridge`, `local_visible_task=potion_bridge_handoff`, puis DB state `selected_candidate.potion=null`, `handoff_data.target_dispatcher=null`, `emotional_repair_potion_handoff=null`.
- Correction attendue: rendre atomique l'offre bridge: si `potion_bridge_offer` est persistable, conserver `selected_potion`, `durable_need`, prefills et note; si elle ne l'est pas, ne pas afficher ni stocker un faux handoff. Interdire contractuellement `potion_bridge_handoff` sans `selected_potion` et `target_dispatcher=select_state_potion`.
- Statut: fixed-unit-pending-qa-rerun
- Fix reference: `supabase/functions/sophia-brain/skills/emotional_repair/local_flow.ts` + `supabase/functions/sophia-brain/skills/emotional_repair/local_flow_test.ts`
- Tests requis: positif `amour` stabilise -> offre -> consentement -> `select_state_potion.amour`; paraphrase "soutien de douceur sur quelques jours"; anti-faux-positif emotion encore dominante/no_potion; invariant reducer `confirm_potion_bridge` sans offre precedente.
- Validation fix: `deno test supabase/functions/sophia-brain/skills/emotional_repair/local_flow_test.ts` passe avec invariant `confirm_potion_bridge` invalide sans faux `potion_bridge_handoff` et couverture positive des bridges `amour`, `guerison`, `apaisement`.

### Bug id: R1-B02

- Tours: A6-A7, B1-B2, C1-C2
- Famille: `BF-EFFECT-04` - executor/fallback technique fragile
- Domaine owner: `sophia-brain` runtime local / active flow bridge integration
- Source amont: passage active flow `emotional_repair` vers `select_state_potion`, ou crash Edge Function local apres etat de bridge incoherent
- Symptome visible: reponse vide HTTP 502 `An invalid response was received from the upstream server`.
- Preuve systeme: A6/A7 apres consentement `amour` renvoient 502; `guerison` et `apaisement` renvoient chacun 502 au premier tour puis au retry. Aucun selected handler ni trace metier exposee.
- Correction attendue: inspecter logs runtime Edge Function, corriger le crash, et ajouter un test d'integration qui couvre les trois bridges `emotional_repair -> select_state_potion.<potion>` sans fallback deterministe.
- Statut: open
- Fix reference: a definir
- Tests requis: rerun QA reel local des 3 variantes; test contractuel no 502 sur active state incoherent; test integration avec note_information consommee par `select_state_potion`.

### Bug id: R1-B03

- Tours: verification systeme finale
- Famille: `BF-TEST-01` - trace/test incoherent ou suite malsaine
- Domaine owner: trace QA / `test-send-message`
- Source amont: persistence ou exposition de `conversation_turn_traces`
- Symptome visible: aucun pour l'utilisateur; limite d'audit QA.
- Preuve systeme: les traces utiles sont presentes dans les reponses endpoint et fichiers summary/raw, mais la verification REST finale `conversation_turn_traces?user_id=...` retourne 0 lignes pour les trois users.
- Correction attendue: clarifier si la table `conversation_turn_traces` doit etre persistante pour les runs locaux; si oui, restaurer la persistence ou documenter le champ/table correct a interroger.
- Statut: open
- Fix reference: a definir
- Tests requis: run QA local simple avec verification qu'une trace interrogeable existe par `request_id` ou documentation officielle du remplacement.
