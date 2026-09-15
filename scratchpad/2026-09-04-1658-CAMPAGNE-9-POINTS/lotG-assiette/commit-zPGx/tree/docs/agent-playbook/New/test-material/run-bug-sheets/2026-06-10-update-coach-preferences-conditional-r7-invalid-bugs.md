# Bug Sheet - 2026-06-10 update_coach_preferences conditional r7 invalid

Cadre: tentative de run IA réel local via `/functions/v1/test-send-message` avec `force_full_ai=true`. Aucun fallback déterministe. Aucun changement de code pendant le run.

| Bug id | Tours | Famille | Owner | Source amont | Symptôme | Preuve | Correction recommandée | Statut | Notes / tests requis |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `UCP-R7-B01` | Pré-run | `BF-TEST-01` | QA harness / Supabase local / Edge Runtime local | Environnement local indisponible | Impossible de créer une connexion QA et endpoint Sophia en `BOOT_ERROR` | `qa-create-run-connection` bloqué sur `supabase status`; relance avec env explicite: Auth admin `Database error finding users`; `/functions/v1/test-send-message`: `503 BOOT_ERROR`; `docker ps` bloqué | Stabiliser Supabase/Docker local hors run, sans reset DB ni commande destructive, puis relancer le scénario conditionnel | open | Requis: T1 conditionnel -> proposed/no write; T2 confirmation générale -> write DB; vérification `executed_tools`, `committed_effects`, `user_profile_facts` |
