# Product Help Local Doctrine Real R1 Bugs

| Bug id | Tours | Famille | Domaine owner | Source amont | Symptome visible | Preuve systeme | Correction attendue | Statut | Fix reference | Tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1-B01 | Avant T1 | BF-TEST-01 | Environnement QA local | Supabase local / orchestration de runs concurrents | Aucun tour IA reel exploitable; impossible de verifier `product_help` en conditions reelles | `curl: (7) Failed to connect to 127.0.0.1 port 54321`; `fetch failed`; `supabase status` signale des services arretes | Stabiliser Supabase local sans utiliser de fallback; relancer via `/functions/v1/test-send-message` avec `force_full_ai=true` et connexion QA isolee | open | N/A | Run reel product_help avec transcript complet, traces courtes, aucun fallback, et verification absence side effects |
