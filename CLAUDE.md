# Claude — règles projet

## ⛔ Commandes à risque : validation humaine explicite requise

Tu ne peux **pas** exécuter seul les commandes à risque (secrets, deploy, reset).
Elles sont **bloquées** par le hook `.claude/hooks/block-risky-commands.sh` et exigent
que l'utilisateur les lance lui-même. La liste complète et le pourquoi sont dans
[AGENTS.md](AGENTS.md).

En résumé, JAMAIS seul : `supabase secrets set/unset`, `supabase db reset`,
`supabase db push`, `supabase functions deploy`, `supabase projects/branches delete`,
`supabase link`, et toute écriture de secrets via la Management API
(`POST`/`DELETE` sur `api.supabase.com/.../secrets`).

Si tu en as besoin : arrête-toi, donne à l'utilisateur la commande exacte à
copier-coller, et laisse-le l'exécuter. Les lectures (GET/SELECT) restent permises.
