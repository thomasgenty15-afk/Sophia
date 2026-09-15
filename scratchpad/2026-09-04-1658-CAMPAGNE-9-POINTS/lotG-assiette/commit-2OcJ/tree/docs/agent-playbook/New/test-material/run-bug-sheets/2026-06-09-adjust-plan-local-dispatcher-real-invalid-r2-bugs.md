# Bug Sheet - adjust_plan_item local dispatcher real invalid R2 - 2026-06-09

| Bug id | Tours | Famille | Domaine owner | Symptome | Preuves | Correction attendue | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADJUST-PLAN-LD-R2-B01 | Preflight/T1 | BF-TEST-01 | Runtime QA local / Supabase local | Le rerun ne peut pas demarrer car l'API locale `127.0.0.1:54321` refuse les connexions au moment d'obtenir le token utilisateur. | `auth/v1/token?grant_type=refresh_token` echoue `curl: (7) Failed to connect`; 5 probes consecutifs `/auth/v1/settings` retournent `http=000` avec refus de connexion. | Stabiliser Supabase local sans reset global; verifier plusieurs appels consecutifs avant nouveau QA reel. | open |
| ADJUST-PLAN-LD-R2-B02 | Cleanup | BF-TEST-01 | QA cleanup local | La connexion temporaire R1/R2 reste a nettoyer faute d'API locale disponible. | Cleanup R1 avait deja echoue; R2 montre 5 refus de connexion consecutifs donc cleanup non retente. | Relancer `scripts/qa-cleanup-run-connection.sh qa-skill all_skills_adjustplan_local_20260609_qa1` quand l'API locale repond stablement. | open |
