# Agent Safety Rules

## Commandes à risque — validation humaine EXPLICITE obligatoire

Un agent IA ne peut JAMAIS lancer seul les commandes ci-dessous. Elles exigent
que **l'utilisateur humain les tape lui-même** dans son terminal. Si une tâche
semble en avoir besoin, **arrête-toi** et donne la commande exacte à l'utilisateur
pour qu'il l'exécute — ne la lance pas, ne la contourne pas.

- `supabase secrets set` / `supabase secrets unset`  (⚠️ un push `--env-file` a déjà écrasé tous les secrets staging par des valeurs dev)
- `supabase db reset`
- `supabase db push` (notamment `--linked`)
- `supabase functions deploy`
- `supabase config push` (écrase la config du projet lié avec `supabase/config.toml`,
  qui porte des réglages **voulus locaux** — dont `signing_keys_path`, l'alignement
  HS256 de la pile locale ; voir [docs/keel/JWT-HS256.md](docs/keel/JWT-HS256.md))
- `supabase projects delete` / `supabase branches delete`
- `supabase link`
- Écriture de secrets via la Management API (`POST`/`DELETE` sur `api.supabase.com/.../secrets`)
- SQL direct qui `delete`, `truncate`, `drop` ou écrase des données/schéma

Les **lectures** restent autorisées (GET Management API, SELECT, requêtes PostgREST en lecture).

### Exception QA ciblée
Pendant un run QA/test, si l'utilisateur le demande explicitement, un agent peut
supprimer uniquement les enregistrements créés par CE run, dans un périmètre de test
clairement identifié (user id temporaire, run id, request id, source metadata). Aucune
autre suppression, reset, truncate ou changement de schéma.

## Application (défense en profondeur)

Ces règles ne reposent pas que sur la bonne volonté :

1. **Hook Claude Code** — `.claude/hooks/block-risky-commands.sh` (via `.claude/settings.json`)
   bloque ces commandes côté outil Bash (exit 2).
2. **Garde shell** — la fonction `supabase()` de `~/.zshrc` (via `_confirm_risky_cmd`)
   intercepte secrets set/unset · db reset/wipe/drop/push · functions deploy ·
   migration repair · `--linked` · `--project-ref` · link : elle exige de taper `YES`
   et bloque l'exécution non-interactive/agent (le `read` reçoit EOF → annulé).
   `scripts/safe-supabase.sh` est la version portable/committée équivalente (autres
   machines, CI).
3. **Cette doc** — lue par les agents.

Si tu es un agent et que ta commande est bloquée : c'est normal. Explique à
l'utilisateur ce qu'il doit lancer, et laisse-le décider.
