# Bug Sheet — Clarification Local Flow Real R1

- Run report: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-clarification-local-flow-real-r1.md`
- Date: 2026-06-08
- Run id: `clarification-local-flow-real-20260608-r1`
- Persona: Alex, scope QA isolé

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `CLF-R1-B01` | T1, T2 | `BF-PREF-01` | clarification visible agent / global tone policy | Prompt/guard visible clarification | Sophia vouvoie dans la clarification et la reprise (`Préférez-vous`, `votre action`) | T1 `response_owner=orientation_clarification`, message visible en vouvoiement; T2 `selected_handler=prepare_attack_card`, message visible en vouvoiement | Forcer le tutoiement dans le visible agent clarification et les transitions issues de clarification; ajouter guard/test contre `vous/souhaitez-vous/préférez-vous` dans ce chemin | `open` |  | Positif: product_help vs attack card; paraphrase: explication vs préparation; anti-FP: citation d'un texte utilisateur contenant `vous`; integration: run IA réel force_full_ai |
| `CLF-R1-B02` | T2 | `BF-TEST-01` | clarification arbitration / router trace | Handoff metadata et trace runtime | Le run résout correctement mais ne permet pas de vérifier `note_information` dans la trace courte | T2 `route_reason=orientation_clarification_resolved_tool_skill`, `selected_handler=prepare_attack_card`, mais pas de champ trace visible `note_information.target_dispatcher=prepare_attack_card`; `__clarification_flow_state` non observable dans la trace extraite | Exposer la note de clarification dans trace/EffectLedger ou dans le contexte target; garantir une preuve QA courte pour chaque changement de dispatcher | `open` |  | Unit: reducer note required; integration: arbitrator result carries note; real QA: trace courte inclut note target on resolved handoff |
| `CLF-R1-B03` | T2 | `BF-INTAKE-01` | prepare_attack_card local intake | Consommation du contexte clarifié | Sophia redemande si l'action de demain matin est la cible alors que le user vient de fournir le blocage et la fenêtre | T2 visible: `Est-ce que votre action de demain matin est bien la cible...`; no durable effect; active handoff starts collecting | Transmettre `user_words` et payload de clarification au dispatcher attack card pour ne redemander la cible que si elle est réellement insuffisante | `open` |  | Positif: cible fournie dans réponse de clarification; paraphrase: risque de repousser au réveil; anti-FP: réponse vague `préparons-la` sans cible doit demander la cible |

## Cleanup

- Messages du scope `qa-clarification-local-flow-real-r1-20260608`: supprimés après run.
- `__active_attack_card_handoff`: retiré de `user_chat_states.temp_memory`.
- Autres clés `temp_memory`: préservées.
- `user_attack_cards`: aucun enregistrement créé.
