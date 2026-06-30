# Run Bug Sheet - Weekly Process R2

## Bug R2-B01

- Tours: 1-5
- Famille: `BF-ROUTE-01` - Mauvais owner selectionne
- Domaine owner: dispatcher / active flow arbitration / weekly local dispatcher
- Source amont: chargement et priorisation de `user_chat_states.scope=whatsapp.temp_memory.__active_skill_state` apres ouverture `process-checkins`.
- Symptome visible: Sophia repond comme `normal_reply` a tout le bilan weekly; elle ne passe jamais par `weekly_adaptive_review_v1`.
- Preuve systeme: `process-checkins.success=true`, `processed=1`, `scheduled_checkin.status=sent`, `message_payload.weekly_adaptive_review` present, `plan_patch.requires_confirmation=true`; DB contient `scope=whatsapp`, `skill=weekly_adaptive_review_v1`, `status=open`; pourtant T1-T5 ont `response_owner=normal_reply`, `selected_handler=null`, `active_flow_arbitration.active_owner=none`.
- Correction attendue: le premier message user apres un check-in weekly doit reprendre l'active state weekly et router vers `weekly_adaptive_review_v1`, sauf interruption explicite hors bilan.
- Statut: `open`
- Fix reference: a faire
- Tests requis: integration locale `process-checkins` + `/test-send-message force_full_ai=true channel=whatsapp scope=whatsapp`; paraphrases de bilan weekly; anti-faux-positif sortie explicite vers ajustement de plan hors bilan.

## Bug R2-B02

- Tours: 3-5
- Famille: `BF-LEDGER-01` - Claim sans commit
- Domaine owner: final response guard / weekly renderer
- Source amont: reponses `normal_reply` parlent de proposition a confirmer sans objet weekly propose dans le ledger.
- Symptome visible: Sophia dit que la semaine allegee est une proposition et qu'elle n'applique rien, mais il n'y a ni `plan_patch` rendu par le reducer weekly, ni ledger `proposed`.
- Preuve systeme: T3-T5 `EffectLedger.proposed=0`, `committed=0`, `selected_handler=null`.
- Correction attendue: si le flow weekly est owner, la proposition doit etre portee par `weekly_adaptive_review.plan_patch` et tracee; sinon le renderer ne doit pas donner une illusion de proposition produit.
- Statut: `open`
- Fix reference: a faire
- Tests requis: apres correction R2-B01, verifier que la proposition weekly est tracee par le handler weekly; anti-faux-positif normal conversation hors flow ne doit pas inventer un patch.
