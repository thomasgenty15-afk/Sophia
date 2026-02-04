# App config (DB) - éviter que staging appelle prod

## Problème rencontré
Les crons `pg_cron` (et triggers DB) utilisent `public.app_config` pour construire l’URL des Edge Functions.

Si **staging** a `edge_functions_base_url` qui pointe vers **prod**, alors les jobs staging vont appeler les Edge Functions prod via `pg_net`, ce qui crée des erreurs 403 “fantômes” côté prod.

## Source of truth
- Le code des triggers/crons est dans `supabase/migrations/`.
- Les valeurs runtime par environnement sont dans `public.app_config` + Vault.

## Clés à définir par projet
- `public.app_config.supabase_project_ref`
- `public.app_config.edge_functions_base_url` = `https://<project-ref>.supabase.co`
- `public.app_config.edge_functions_anon_key` = anon key du projet
- Vault: `INTERNAL_FUNCTION_SECRET` (doit matcher le secret Edge Functions)

## Guardrail
La migration `20260131184500_guard_app_config_edge_base_url.sql` ajoute une protection :
- Une fois `supabase_project_ref` rempli, toute tentative de mettre `edge_functions_base_url` sur un autre domaine est refusée.

## Seed rapide
Utilise `scripts/seed_app_config_env.sql.template` sur chaque projet (staging/prod) en remplaçant :
- `<PROJECT_REF>`
- `<ANON_KEY>`




