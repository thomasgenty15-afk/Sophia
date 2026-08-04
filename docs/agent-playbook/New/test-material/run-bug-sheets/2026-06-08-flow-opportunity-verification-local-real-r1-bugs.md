# Bug Sheet - flow_opportunity_verification Local Real R1

## FOV-R1-B1 - Status recap implicit opportunity not produced

- Famille: `BF-ROUTE-01`
- Severite: P1
- Statut QA: RED
- Run: `flow-opportunity-verification-r3-20260608`
- Message user: "Je sais plus ce qu'il y a dans ma carte d'attaque."

Attendu:
- Le dispatcher global produit une `flow_opportunity` vers `status_recap`.
- Le runtime cree un etat `flow_opportunity_verification`.
- Sophia propose un recap court a confirmer.

Observe:
- HTTP 200 mais route `normal_reply_default`.
- `response_owner=normal_reply`.
- `turn_frame.tool_skill_opportunity.type=none`.
- Aucun `flow_opportunity`, aucun `selected_handler`, aucun etat actif.
- Reponse visible demande au user de copier/coller le contenu de sa carte d'attaque.

Impact:
- Le cas canonique du contrat `status_recap.attack_card_uncertainty` n'est pas atteignable via le chemin real IA local.
- Le nouveau flow est partiellement integre: il fonctionne avec une opportunity legacy `update_coach_preferences`, mais pas avec le conversation skill `status_recap` attendu.

Piste probable:
- Le prompt/sanitizer du dispatcher global ne produit pas encore le champ canonique `flow_opportunity` pour les skills conversationnels, ou le mapping `status_recap` implicite est absent/insuffisamment priorise.

Artefacts:
- `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-r3-20260608.raw.json`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-flow-opportunity-verification-local-real-r1.md`

## FOV-R1-B2 - Active state metadata drifts after product_help inline

- Famille: `BF-STATE-01`
- Severite: P3
- Statut QA: YELLOW
- Run: `flow-opportunity-verification-r4-20260608`
- Tour: 2

Attendu:
- `origin.user_message` reste le message initial qui a cree l'opportunity.
- `turn_count` avance d'un tour logique.
- `recent_user_messages` n'ajoute pas deux fois le meme message.

Observe:
- Apres la question produit inline, l'ancre est bien conservee, mais:
  - `origin.user_message` devient "Avant de dire oui, c'est quoi exactement une preference coach dans Sophia ?"
  - `turn_count` passe de 1 a 3 apres seulement deux tours utilisateur.
  - `recent_user_messages` contient deux fois le message du tour 2.

Impact:
- Pas de regression bloquante observee sur l'acceptation tardive: le tour 3 lance correctement `update_coach_preferences`.
- Risque futur sur stale/max-turn, audit trail, et raisonnement local si plusieurs questions produit s'enchainent.

Artefacts:
- `tests/real-personas/qa-skill/runs/flow_opportunity_verification/flow-opportunity-verification-r4-20260608.raw.json`
- Rapport: `docs/agent-playbook/New/test-material/qa-run-reports/2026-06-08-flow-opportunity-verification-local-real-r1.md`
