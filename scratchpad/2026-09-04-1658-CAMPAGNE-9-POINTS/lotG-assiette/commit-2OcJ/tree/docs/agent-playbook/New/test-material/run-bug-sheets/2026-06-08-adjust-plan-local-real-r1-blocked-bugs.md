# Bug Sheet - 2026-06-08 Adjust Plan Local Real R1 Blocked

## R1-B01

- Bug id: `R1-B01`
- Tours: Pre-run 1, Pre-run 2, Pre-run 3, Pre-run 4
- Famille: `BF-TEST-01` - Trace/test incoherent ou suite malsaine
- Domaine owner: environnement QA local / Supabase local
- Source amont: gateway/API locale `127.0.0.1:54321`
- Symptome visible: impossible de lancer un run conversationnel Sophia reel; Auth et REST retournent `curl: (7) Failed to connect` / `http_status=000` apres disponibilite intermittente.
- Preuve systeme: probes REST/Auth health ponctuellement `200`, puis Auth et REST `000`; retry utilisateur reproduit le blocage avec `health=200`, `rest=200`, puis Auth `000` et health encore `000` apres attente; aucun appel `/functions/v1/test-send-message` exploitable; aucun tour Sophia produit.
- Correction attendue: stabiliser l'environnement Supabase local avant de relancer; ne pas remplacer par staging, renderer deterministe ou appel direct `processMessage`.
- Statut: `open`
- Fix reference: n/a
- Tests requis: `GET /auth/v1/health` stable, login password ou refresh stable, `GET /auth/v1/user` stable, puis run `/functions/v1/test-send-message` avec `force_full_ai=true` et transcript tour par tour.
