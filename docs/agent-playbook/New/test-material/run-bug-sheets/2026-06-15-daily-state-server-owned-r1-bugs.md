# Run Bug Sheet - Daily State Server-Owned R1

## R1-B01

- Tours: run-level
- Famille: `BF-TEST-01`
- Domaine owner: QA runtime daily / test harness
- Source amont: divergence entre `14-qa-test-guidelines.md` et le flow produit daily pending
- Symptome visible: le run daily valide le vrai chemin `process-checkins -> whatsapp-webhook`, mais ne peut pas revendiquer le cadre generique `/functions/v1/test-send-message force_full_ai=true`.
- Preuve systeme: `test-send-message` appelle `processMessage` et ne consomme pas `whatsapp_pending_actions`; le pending daily reel est gere par `whatsapp-webhook/handlers_pending.ts`.
- Correction attendue: ajouter un chemin QA officiel pour injecter un message user dans un pending WhatsApp via endpoint de test avec IA forcee, ou documenter l'exception daily/weekly pending.
- Statut: open
- Fix reference: n/a
- Tests requis: run daily pending avec pending systeme, local dispatcher IA reel, `daily_action_review_diagnosis`, commit DB et cleanup verifies.
