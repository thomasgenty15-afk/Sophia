# Bug Sheet — qa-wa-onb-full-from-wait-invalid-r1

## R1-B01

- Bug id: R1-B01
- Tours: setup avant Tour 1
- Famille: BF-TEST-01 — Trace/test incoherent ou suite malsaine
- Domaine owner: environnement local Supabase Auth / QA setup
- Source amont: creation Auth temporaire via `/auth/v1/admin/users`
- Symptome visible: aucun test conversationnel possible; Sophia n'est jamais appelee.
- Preuve systeme:
  - `qa-wa-onb-full-1781096131278`: `504 request_timeout`
  - `qa-wa-onb-full-1781096154612`: `500 Database error checking email`
  - `qa-wa-onb-full-1781096269442`: `500 Database error checking email`
  - `fixture=null`, aucun webhook appele.
- Correction attendue: rendre la creation Auth locale fiable ou definir une connexion QA locale dediee reutilisable avec nettoyage cible.
- Statut: open
- Fix reference: a creer
- Tests requis:
  - Positif: setup QA cree ou recupere une connexion locale et verifie Auth.
  - Integration: webhook WhatsApp loopback peut executer le scenario complet `awaiting_plan_finalization -> completed`.
  - Anti-regression: si Auth local est indisponible, le runner echoue avant conversation avec rapport invalide explicite.
