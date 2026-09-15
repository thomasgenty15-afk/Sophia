# 2026-06-23 — coaching_target_switch_20260623_r1 — Bugs

## R1-B01

- **Tours:** T4
- **Famille:** `BF-STATE-01` — Mauvaise transition de flow
- **Domaine owner:** `coaching_recommendation`
- **Source amont:** dispatcher local / contrat `target_switch` / reducer
  d'ownership actif
- **Symptome visible:** Sophia donne une reponse correcte sur le fond, mais le
  tour est rendu par `normal_reply` apres sortie du flow actif.
- **Preuve systeme:** T4 avait
  `active_flow_arbitration.decision=continue_active`,
  `active_owner=coaching_recommendation`,
  `selected_skill_id=coaching_recommendation`, puis `skill_status=exit`,
  `exit_target=global`, `route_reason=coaching_recommendation_exit_to_global`.
  La `note_information.collected_state.dispatcher_signal_context` reste sur
  `no_plan_action` / `mail perso`, alors que l'evidence dit que le user parle
  d'une action du plan.
- **Correction attendue:** le dispatcher local doit utiliser
  `target_switch.status=explicit` vers `plan_action` avec
  `target.title="préparer le dossier mutuelle"` quand le dernier message change
  clairement de cible dans le flow actif. Le reducer doit alors continuer en
  `action_plan_coaching`, pas sortir au global.
- **Statut:** `fixed`
- **Fix reference:** `coaching_recommendation` prompt target-switch rules + reducer guard `active_flow_non_critical_exit_blocked`.
- **Tests requis:** run reel actif no-plan -> switch action plan ; paraphrase
  sans `plan_item_id` ; anti-faux-positif mention vague d'un objet plan ->
  confirmation ; invariant
  `active flow + explicit target switch != exit_to_global_dispatcher`.
- **Tests ajoutes:** `coaching active flow rejects non-critical global exit when target switch is omitted`.
- **Verification restante:** rerun QA reel pour passer `verified`.
