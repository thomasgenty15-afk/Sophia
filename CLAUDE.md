# Claude — règles projet

## 🧭 Le modèle produit — à savoir AVANT de toucher quoi que ce soit côté élève

> ### Le coach ne produit RIEN de personnel pour un élève.
> Pas de plan, pas de menu, pas de message, pas de correction. Il écrit une **doctrine** et un
> **programme** pour toute sa cohorte ; c'est **l'élève** qui compose sa semaine à partir de ça
> (`student_goals` → `generate-week-plan-v1` → `student_week_plans`). Il n'existe **aucun canal
> 1:1** coach → élève.

Conséquence immédiate et la plus souvent violée : **aucune copie ne doit faire attendre
l'élève**. « Ton coach prépare ton plan » est faux. Un écran élève vide porte la sortie vers
`/app/plan`, où il compose lui-même.

La chaîne de prescription individuelle (`plan_versions`, `/coach/import`, `/coach/templates`)
existe encore dans le code : elle est **gardée exprès** — c'est le mode 1:1 — et elle **n'est
pas le modèle**. Ne la supprime pas, ne la prends pas pour le produit.

Détail complet, ce que ça interdit, et le trou connu : **[docs/keel/MODEL.md](docs/keel/MODEL.md)**.

## ⛔ Commandes à risque : validation humaine explicite requise

Tu ne peux **pas** exécuter seul les commandes à risque (secrets, deploy, reset).
Elles sont **bloquées** par le hook `.claude/hooks/block-risky-commands.sh` et exigent
que l'utilisateur les lance lui-même. La liste complète et le pourquoi sont dans
[AGENTS.md](AGENTS.md).

En résumé, JAMAIS seul : `supabase secrets set/unset`, `supabase db reset`,
`supabase db push`, `supabase functions deploy`, `supabase config push`,
`supabase projects/branches delete`, `supabase link`, et toute écriture de
secrets via la Management API (`POST`/`DELETE` sur `api.supabase.com/.../secrets`).

Si tu en as besoin : arrête-toi, donne à l'utilisateur la commande exacte à
copier-coller, et laisse-le l'exécuter. Les lectures (GET/SELECT) restent permises.

## 🔒 401 « Invalid JWT » en local : NE TOUCHE À RIEN, lis d'abord

Si une fonction edge rend **401 `Invalid JWT`** pendant que PostgREST répond
normalement, ce n'est **pas** un bug de l'écran qui échoue. C'est l'algorithme de
signature de la pile locale. Ce piège a déjà coûté plusieurs journées, à
plusieurs sessions.

**Ton seul geste autorisé :**

```bash
./scripts/check-local-jwt-alg.sh
```

Puis lis **[docs/keel/JWT-HS256.md](docs/keel/JWT-HS256.md)**.

**Interdits — chacun a déjà été tenté, aucun ne répare :**

- ❌ Passer une fonction en `verify_jwt = false` dans `supabase/config.toml`.
  C'est déplacer un défaut de poste de dev dans un fichier qui part en prod.
  Le gate de commit refuse ce geste quand il est justifié par l'algorithme.
- ❌ Écrire une clé dans `supabase/signing_keys.local.json`. **Ce fichier doit
  rester `[]`** : c'est la seule façon d'obtenir HS256, et le vide est voulu.
- ❌ Supprimer ce fichier, ou recommenter `signing_keys_path`.
- ❌ Recréer le conteneur `auth` à la main.

La réparation légitime, quand la pile est plus vieille que le correctif, est
`supabase stop && supabase start` — puis se **déconnecter/reconnecter** dans
l'app, car le jeton déjà en `localStorage` n'est pas renouvelé par un simple
rechargement.
