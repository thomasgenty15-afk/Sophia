# Prepare Attack Card Handoff Verify Rerun - Bug Sheet

Cadre: Supabase local, `/functions/v1/test-send-message`, `force_full_ai=true`, connexions QA temporaires, cleanup cible effectue. Un redemarrage local de `supabase functions serve` a ete effectue apres suspicion de runtime stale; les runs frais restent rouges.

Rapport source: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-01-prepare-attack-card-handoff-verify-rerun.md`

## Bugs

### V1-B01

- Tours: R1 Tour 2
- Famille: `BF-INTAKE-03` - Contrainte explicite perdue
- Domaine owner: orientation clarification -> `prepare_attack_card`
- Source amont: resolution de clarification vers operation runtime
- Symptome visible: apres choix "preparer" + cible + piege + no-create, Sophia repond "Je ne confirme aucun changement durable sans effet confirmé."
- Preuve systeme: `response_owner=tool_skill`, `selected_handler=prepare_attack_card`, `status=ask_question`, pas de `platform_handoff`.
- Correction attendue: la resolution de clarification doit construire un active intake ou operation_input complet et produire `handoff_delivered`.
- Statut: `open`
- Fix reference: none
- Tests requis: QA reelle post-clarification avec `force_full_ai=true`; trace status `handoff_delivered`; no mutation.

### V1-B02

- Tours: R1 Tour 3
- Famille: `BF-STATE-01` - Mauvaise transition de flow
- Domaine owner: `prepare_attack_card`
- Source amont: absence d'etat handoff/preparation actif apres R1 Tour 2
- Symptome visible: "Ok crée-la" repart en choix de technique avec wording "je m'en occupe", au lieu de `apply_attempt` no-mutation.
- Preuve systeme: `status=ask_question`, pas de `platform_handoff`, pas de `apply_attempt`.
- Correction attendue: apres une intention prepare_attack_card claire, les approvals doivent etre non-mutants et ne jamais annoncer une prise en charge de creation.
- Statut: `open`
- Fix reference: none
- Tests requis: integration apres clarification; wording interdit absent.

### V2-B01

- Tours: R2 Tour 1
- Famille: `BF-INTAKE-01` - Slot fourni mais redemande / bloque
- Domaine owner: `prepare_attack_card`
- Source amont: AI intake / structured slot preservation
- Symptome visible: demande directe complete avec technique "Ancre visuelle" finit en technical blocked.
- Preuve systeme: `status=technical_blocked`, pas de `platform_handoff`, `executed_tools=[]`.
- Correction attendue: technique label + cible + piege + no-create doivent produire un handoff, jamais un block technique nominal.
- Statut: `open`
- Fix reference: none
- Tests requis: endpoint local direct explicit technique, paraphrase technique, no-create.

### V3-B01

- Tours: R3 Tour 1
- Famille: `BF-INTAKE-03` - Contrainte explicite perdue
- Domaine owner: `prepare_attack_card`
- Source amont: constraints `draft_only/no_create` dans le runtime reel
- Symptome visible: demande directe draft-only/no-create finit en guard durable-effect.
- Preuve systeme: `status=ask_question`, pas de `platform_handoff`, pas de pending executable.
- Correction attendue: `draft_only/no_create` doit declencher un handoff draft plateforme.
- Statut: `open`
- Fix reference: none
- Tests requis: endpoint local direct draft_only/no_create; assertion renderer complet; no token/no executor.

### V4-B01

- Tours: R1 Tour 1
- Famille: `BF-PREF-01` - Preference non appliquee runtime
- Domaine owner: orientation clarification
- Source amont: prompt/renderer de clarification
- Symptome visible: Sophia vouvoie l'utilisateur dans une clarification.
- Preuve systeme: `response_owner=orientation_clarification`.
- Correction attendue: appliquer le tutoiement standard de Sophia aux clarifications de routing.
- Statut: `open`
- Fix reference: none
- Tests requis: clarification product_help vs prepare_attack_card avec tutoiement.
