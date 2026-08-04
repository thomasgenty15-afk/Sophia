# Bug Sheet - Weekly Full R9

## Run

- Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-13-weekly-full-r9.md`
- Run id: `weekly-full-20260613-r9-rose`
- Persona: Rose
- Verdict: yellow

## Bugs

### R9-B01 - Defense handoff loses concrete response plan

- Status: verified
- Severity: yellow
- Family: BF-INTAKE-03 - Contrainte explicite perdue
- Tours: T7
- Symptom: le user donne une parade concrete (`cles dans la salle de bain`, `douche cinq minutes`, phrase rituelle), mais le handoff visible et le draft initial ne restituent que la situation/pulsion.
- Expected: le child flow `prepare_defense_card` conserve la situation et la defense concrete dans des champs distincts, puis les expose dans le platform handoff sans pretendre creer la carte.
- Actual: `platform_fields.fields[0].locked_value` contient seulement le contexte de pulsion; le user doit corriger au T8.
- Suspected source: contrat local `prepare_defense_card` trop centre sur `support_need`, pas assez sur la reponse defense/action a executer.
- Recommended fix: ajouter des slots structures pour `defense_action`, `ritual_phrase` ou equivalent dans le reducer/handoff defense, avec contexte visible qui les rend explicitement.
- Anti-patching note: ne pas regler par phrase forcee; corriger l'intake et la structure du handoff.
- Validation: test IA reel et test reducer/visible ou un message user contient situation + action defense + phrase, et le handoff conserve les trois sans commit.
- Fix reference: `prepare_defense_card` conserve maintenant `prepared_fields.risk_context` et `prepared_fields.defense_action` dans le draft et le contexte visible; test `prepare_defense_card handoff preserves concrete defense response`.
- Verification: R10 T6, `prepared_fields.defense_action` contient sac, cles, douche et phrase; `committed_effects=[]`.

### R9-B02 - Weekly repeats child-flow return before synthesis

- Status: verified
- Severity: yellow
- Family: BF-STATE-01 - Mauvaise transition de flow
- Tours: T9
- Symptom: apres `return_from_child_flow` au T8, le T9 reste bloque sur `weekly_review_gate_order_requires_return_from_child_flow` au lieu de produire directement `weekly_synthesis`.
- Expected: une fois le retour child-flow rendu et la revision preservee, le tour suivant peut passer a la synthese.
- Actual: le user doit confirmer une deuxieme fois pour obtenir la vraie synthese au T10.
- Suspected source: `weekly_adaptive_review_v1.local_flow` ne marque pas le retour child-flow comme acknowledge dans l'etat local.
- Recommended fix: ajouter un marqueur local minimal d'acknowledgement du retour child-flow, ou ajuster `nextRequiredWeeklyStep` pour ne pas refuser `weekly_synthesis` apres un `return_from_child_flow` deja rendu.
- Anti-patching note: ne pas contourner via wording visible; corriger la transition d'etat du reducer.
- Validation: test reducer: previous child completed + visible return already rendered + user asks synthesis => visible_task `weekly_synthesis`, no blocked_effect `weekly_review_gate_order_requires_return_from_child_flow`.
- Fix reference: `weekly_flow_state.child_flow.result_details.return_acknowledged=true` apres rendu `return_from_child_flow`; test `weekly local reducer allows synthesis after child return acknowledged`.
- Verification: R10 T7 rend `return_from_child_flow`, puis T8 passe directement a `weekly_synthesis` sans blocked_effect.

## Confirmed Green In R9

- Weekly opening: `ask_week_experience` au T1.
- Action review before global progress: T2 `review_action_gaps`, T3 seulement ensuite `ask_global_progress_feeling`.
- Partial status preservation: rangement conserve en `partial` dans durable et synthese.
- No plan patch legacy: `weekly_adaptive_review` final ne contient pas `plan_patch`.
- No chat mutation: `committed_effects=[]`, child flow `created=false`, `available=false`, `user_must_create=true`.
- Closure: T11 `status=closed`, durable `status=completed`, `validation_unlock.status=available`.
- Cleanup: current QA scope supprime, `remaining_scope_messages=0`.
