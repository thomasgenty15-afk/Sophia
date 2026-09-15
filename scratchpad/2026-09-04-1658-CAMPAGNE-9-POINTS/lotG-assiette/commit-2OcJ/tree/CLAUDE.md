# Claude — règles projet

## 🧭 Le modèle produit — à savoir AVANT de toucher quoi que ce soit côté élève

> ### Le coach ne produit RIEN de personnel pour un élève.
> Pas de plan, pas de menu, pas de message, pas de correction. Il écrit une **doctrine** et un
> **programme** pour toute sa cohorte ; c'est **l'élève** qui compose à partir de ça
> (`student_goals` → `generate-meal-v1` → `student_generated_meals`, sur une fenêtre de 1 à
> 7 jours — `MAX_WINDOW_DAYS`). Il n'existe **aucun canal 1:1** coach → élève.

Conséquence immédiate et la plus souvent violée : **aucune copie ne doit faire attendre
l'élève**. « Ton coach prépare ton plan » est faux. Un écran élève vide porte la sortie vers
`/app/plan`, où il compose lui-même.

> ⚠️ **La chaîne de la SEMAINE (`generate-week-plan-v1` → `student_week_plans`) a été retirée
> le 2026-08-19.** Elle n'avait aucun appelant vivant : aucun écran ne pouvait produire une
> ligne, ni la faire passer en `adopted`. **Ce que ça coûte, écrit ici pour que personne ne le
> redécouvre** : le produit n'a plus d'objet où une consigne **nomme** la conviction du coach
> qu'elle applique, et où la base **refuse** la ligne qui ne la nomme pas (le CHECK
> `student_week_plans_doctrine_traceable_check`). La lane du repas *peut* citer une conviction
> (`generated_from.belief_keys`, à l'échelle du plan) ; elle n'y est **jamais obligée** et rien
> ne le vérifie. **La traçabilité par ligne n'existe plus dans le produit.**
>
> La table `student_week_plans` et ses **cinq lecteurs restants** sont **gardés exprès** : le
> retrait s'arrête au producteur. Ne « rebranche » pas un écrivain par symétrie — c'est une
> décision produit. Détail : **[docs/keel/MODEL.md](docs/keel/MODEL.md)**.

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
