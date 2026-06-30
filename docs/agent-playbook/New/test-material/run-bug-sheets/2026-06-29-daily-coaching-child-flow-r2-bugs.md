# Bug Sheet - daily-coaching-child-flow-20260629-r2

## R2-B01

- Bug id: `R2-B01`
- Tours: 1-2
- Famille: `BF-PROACTIVE-01`
- Domaine owner: pending proactive / `test-send-message` route integration
- Source amont: pending `daily_action_review` en `message_mode=template_gate` non priorise avant `normal_reply` ou `coaching_recommendation`
- Symptome visible: Sophia repond comme si le daily etait deja traite, puis route la demande d'aide directement vers coaching.
- Preuve systeme: pending reste `pending`, `message_mode=template_gate`, `review_state.status=collecting`, `local_flow_transfer=null`, `child_flow_handoff=null`, `entries_count=0`.
- Correction attendue: si un pending daily existe, `/functions/v1/test-send-message` doit le consommer comme le chemin WhatsApp reel; l'acceptation du template doit ouvrir/continuer le daily, pas passer au global.
- Statut: `open`
- Fix reference: n/a
- Tests requis: integration `template_gate` daily + acceptation; integration demande explicite d'aide sur target daily -> `handoff_to_child_flow`.

## R2-B02

- Bug id: `R2-B02`
- Tours: 3-20
- Famille: `BF-LEDGER-01`
- Domaine owner: final response pipeline / ledger guard
- Source amont: reponse visible `normal_reply`/coaching autorisee a dire que le daily est clos sans effet durable daily.
- Symptome visible: "ton daily est clos" repete alors que rien n'est enregistre.
- Preuve systeme: `entries_count=0`, pending `pending`, occurrences `planned`, pas de `daily_action_review_v1` commit.
- Correction attendue: bloquer toute claim de cloture daily hors `daily_action_review_v1` commit success; si pending daily actif, rediriger vers le pending handler.
- Statut: `open`
- Fix reference: n/a
- Tests requis: anti-claim "daily clos" avec pending daily actif et entries `0`; verification commit success uniquement apres effects daily.
