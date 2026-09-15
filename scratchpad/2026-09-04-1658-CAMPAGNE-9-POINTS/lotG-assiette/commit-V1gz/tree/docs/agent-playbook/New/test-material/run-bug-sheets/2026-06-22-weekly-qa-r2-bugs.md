# Run Bug Sheet - Weekly QA R2

Run: `weekly-qa-20260622-r2-partial_habits_mission_partial`
Report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-22-weekly-qa-r2.md`
Date: 2026-06-22

## R2-B01

- Bug id: `R2-B01`
- Tours: 1, 3, 4, 5
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: router / active flow arbitration / weekly active state integration
- Source amont: `readActiveFlowState` ou policy d'arbitrage active owner pour `weekly_adaptive_review_v1`
- Symptome visible: Sophia repond comme conversation generale alors que le user repond au prompt weekly.
- Preuve systeme: `user_chat_states.temp_memory.__active_skill_state.skill_id=weekly_adaptive_review_v1`, `status=active`, mais traces `active_flow_arbitration.active_owner=none`, `response_owner=normal_reply`.
- Correction attendue: rendre le weekly resumable depuis son active state canonique jusqu'a `exit_to_global_dispatcher`; router vers `weekly_adaptive_review_v1` pour les reponses au bilan.
- Statut: `open`
- Fix reference: none
- Tests requis: ouverture weekly proactive -> reponse naturelle sans mot "weekly" -> `selected_handler=weekly_adaptive_review_v1`; paraphrase avec "bilan hebdo"; anti-faux-positif sortie explicite produit/status -> `exit_to_global_dispatcher`.

## R2-B02

- Bug id: `R2-B02`
- Tours: 4
- Famille: `BF-LEDGER-02` - Commit reel mal rendu
- Domaine owner: direct-effect final response pipeline / visible composition
- Source amont: composition entre `direct_effect_confirmation_context.visible_confirmation_hint` et reponse finale `normal_reply`
- Symptome visible: Sophia confirme deux fois le meme rappel dans la meme reponse.
- Preuve systeme: `direct_effect_lane.committed_effects[0].id=9221838f-f557-4c7f-9648-32287301ddca`; reponse visible contient deux phrases "C'est programmé pour mardi 23 juin à 18:00".
- Correction attendue: rendre la confirmation direct-effect une seule fois, puis passer le besoin restant a l'owner actif weekly quand il existe.
- Statut: `open`
- Fix reference: none
- Tests requis: rappel ponctuel pendant weekly -> commit DB + confirmation unique + suite du weekly; rappel ponctuel hors weekly -> confirmation unique; anti-faux-positif "parle-moi deux minutes" -> pas de reminder.

## R2-B03

- Bug id: `R2-B03`
- Tours: 2
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: local Edge runtime / `test-send-message` observability
- Source amont: upstream invalid response non instrumentee
- Symptome visible: HTTP 502 avec reponse vide.
- Preuve systeme: body `{"message":"An invalid response was received from the upstream server"}`; pas de trace exploitable.
- Correction attendue: tracer l'erreur upstream dans `trace_error` ou diagnostic equivalent, et garantir qu'un retry n'entraine pas d'effet durable duplique.
- Statut: `open`
- Fix reference: none
- Tests requis: simulation/repro d'erreur upstream -> trace diagnostic exploitable; retry apres 502 -> pas de double commit ni double message assistant.
