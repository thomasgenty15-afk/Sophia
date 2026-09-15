# Weekly Process R9 - Bug Sheet

## Run

- Date: 2026-06-26
- Run id: `weekly-qa-20260626-r9-partial_habits_mission_partial`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-26-weekly-process-r9.md`
- Verdict global: yellow

## Bugs

### R9-B01 - Slot global deja fourni mais redemande

- Bug id: R9-B01
- Tours: T1-T2
- Famille: BF-INTAKE-01 - Slot fourni mais redemande
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: weekly dispatcher/gates de capture `week_experience`, `global_progress`, `felt_progress`
- Symptome visible: Sophia redemande "comment tu l'as vecue au global" puis "vrai pas en avant ou tres instable" alors que le user a deja donne progres fragile + cause.
- Preuve systeme: T1/T2 `response_owner=weekly_adaptive_review_v1`; reponses de clarification redondantes; pas d'effet durable.
- Correction attendue: capturer les signaux hebdomadaires deja explicites dans les gates weekly sans regex metier, puis passer a la synthese.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/skills/weekly_review/local_flow.ts` + test `weekly reducer surfaces safe adjust recommendation before premature closure`; verified by run `weekly-qa-20260629-r10a-level-partial_habits_mission_partial`
- Tests requis: positif premiere reponse avec ressenti + cause; paraphrase "utile mais fragile"; anti-faux-positif reponse vague "je ne sais pas"; integration weekly full AI.

### R9-B02 - Demande d'intention validation niveau traitee comme cloture

- Bug id: R9-B02
- Tours: T4
- Famille: BF-STATE-01 - Mauvaise transition de flow
- Domaine owner: `weekly_adaptive_review_v1`
- Source amont: reducer / visible task selection entre `weekly_adjust_recommendation` et `weekly_closure`
- Symptome visible: le user demande quoi renseigner dans la Validation du niveau; Sophia repond "Le bilan hebdo est clos" et donne seulement une idee generale.
- Preuve systeme: DB apres T4 `status=completed`, `closure_status=complete`, `validation_unlock=available`; `adjust_recommendation.status=surfaced`, `safe_to_surface=true`, `confidence=0.96`, `target_scope=next_level_inputs`, mais visible sans destination claire.
- Correction attendue: si une demande explicite porte sur quoi renseigner pour la suite/validation du niveau et que `adjust_recommendation.safe_to_surface=true`, rendre `weekly_adjust_recommendation` avant la cloture durable; ne cloturer qu'apres surface claire ou demande explicite de cloture.
- Statut: verified
- Fix reference: `supabase/functions/sophia-brain/router/active_flow_state.ts` + test `active_flow_state ignores retained local flows with terminal status`; verified by run `weekly-qa-20260629-r10b-nextweek-partial_habits_mission_partial` T5
- Tests requis: positif "quoi noter dans la Validation du niveau"; paraphrase "quelle intention je mets dans le bilan du niveau"; anti-faux-positif "cloture le weekly sans refaire le bilan"; verification DB no mutation + `validation_unlock` seulement apres cloture.

### R9-B03 - Flow completed encore routable au tour suivant

- Bug id: R9-B03
- Tours: T5
- Famille: BF-ROUTE-02 - Ancien flow capture une nouvelle intention
- Domaine owner: active-flow arbitration / weekly state lifecycle
- Source amont: state cleanup ou politique d'arbitrage des active skill states `status=completed`
- Symptome visible: apres completion et unlock, le tour suivant reste `response_owner=weekly_adaptive_review_v1` et repete un mini-recap.
- Preuve systeme: DB avant cleanup `__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=completed`, `stage=closing`; T5 `response_owner=weekly_adaptive_review_v1`.
- Correction attendue: un active skill state completed ne doit plus etre route comme flow actif; nettoyer le state a la completion ou faire ignorer `status=completed` par l'arbitrage, sauf demande de status explicitement geree.
- Statut: open
- Fix reference: a renseigner
- Tests requis: post-completion "merci", "ok c'est termine ?", nouvelle demande hors weekly; attendu pas de capture active weekly sauf policy explicite de status non-mutante.
