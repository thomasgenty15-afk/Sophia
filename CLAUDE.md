# Claude — règles projet

## ✂️ Politique d'exécution et comportement de l'agent

### Directives de communication strictes

- **Concision absolue :** supprime systématiquement tout préambule, salutation, transition ou
  conclusion (« Certainement ! », « Voici le code… », « J'espère que ça aide »).
- **Entrée directe :** commence la réponse immédiatement par la première ligne de code, le
  résultat brut ou le fait demandé.
- **Zéro débat :** ne réinterprète pas, ne discute pas et ne « corrige » pas le contexte global
  ou l'architecture demandée. Exécute la commande à la lettre.
- **Pas d'avertissements spontanés :** aucun message d'alerte, de sécurité ou de bonne pratique
  non sollicité.
- **Langage clair — consigne pour Opus 5 :** « N'utilises pas de charabia, fait en sorte
  d'utiliser des termes clairs, des idées claires. » Pas de jargon, pas de métaphore qui
  remplace une explication, pas de formule qui sonne bien sans rien dire. Un mot technique
  n'est admis que s'il nomme quelque chose qui existe dans ce dépôt — un fichier, une
  fonction, une table, une colonne.

### Mode de raisonnement (anti-suranalyse)

- Ne lance aucune phase d'auto-correction ou de refactorisation globale sans demande explicite.
- Reste focalisé uniquement sur le correctif ou le fichier ciblé par la commande.

> **Les deux seules exceptions à « zéro débat »** — elles ne sont pas du bavardage, ce sont des
> arrêts : les **commandes à risque** (§ ⛔ ci-dessous, il faut rendre la main à l'humain) et le
> **401 « Invalid JWT » en local** (§ 🔒 ci-dessous, il faut lire avant de toucher). Dans ces deux
> cas : une phrase, la commande exacte, et on s'arrête.

## 🧭 Le modèle produit — à savoir AVANT de toucher au produit

> ### Ce qui est vendu aujourd'hui, c'est **Sophia**, en **B2C** : la planification de repas
> ### d'un foyer. Le monde professionnel est **occulté, pas supprimé**.

**L'unité planifiée est la session de cuisine, pas le plat** : N jours × M personnes, une
cuisson, des portions qui bifurquent selon l'objectif de chacun. La landing `/` (seule page de
vente depuis le 2026-09-08) s'adresse à **une personne avec un objectif individuel** — perte de
poids, prise de muscle ; le foyer est l'avantage concret, jamais un prérequis. **L'entrée est
à 1** : la famille est un upgrade découvert au 2ᵉ profil.

**« KEEL » est un nom de code INTERNE** (crons, fonctions edge, dossiers, `profiles.keel_role`).
Il ne doit apparaître sur **aucune surface lue par un utilisateur** — et la dernière fuite est
passée par les **données injectées en contexte**, pas par le TSX.

### Le circuit vivant

```
/app/setup   l'entonnoir d'entrée (FF-060) — il se termine PAR UNE GÉNÉRATION
/app/plan    StudentWeekPlanPage + MealBuilder — c'est ICI qu'on compose
                 planDraft.ts route DEUX lanes selon `input.lane` :
                   generate-meal-v1            → plan individuel
                   generate-household-meal-v1  → plan de foyer (UNE cuisson)
                 fenêtre de 1 à 7 jours (`MAX_WINDOW_DAYS`, la base l'impose)
/app/today · /app/chat · /app/progress · /app/household
```

**La règle mère du foyer :** *une personne gouverne le menu ; une bouche n'a pas besoin d'un
compte.* Le foyer n'est pas un espace partagé — c'est une personne qui cuisine pour plusieurs.
Réclamer son profil donne la lecture, son objectif et sa part ; **jamais** le droit de composer,
d'ajouter, de retirer ou de restreindre. Autorité :
**[docs/fonctionnalites/le-foyer/README.md](docs/fonctionnalites/le-foyer/README.md)** ;
la direction d'ensemble : **[docs/keel/PIVOT-FOYER.md](docs/keel/PIVOT-FOYER.md)** (⚠️ plusieurs
de ses sections sont périmées, son bandeau de tête dit lesquelles).

### ⚠️ Le monde pro est derrière un interrupteur — ne le supprime pas

`VITE_B2C_ONLY` (`frontend/src/security/proSurface.ts`) retire de la surface les quatre pages
pro (`/pro`, `/coaches`, `/gyms`, `/communities`), l'inscription coach et l'accès à l'espace
coach. **Les huit écrans coach, `coach-signup-v1`, la doctrine, le protocole et la facturation
restent en place et typecheckent** : le pro rouvre par une variable d'environnement, pas par un
revert. Deux points de dérivation, et deux seulement : **`WORLDS` dans `PublicHeader.tsx`** et
**`?role=coach` dans `Auth.tsx`**. Ce drapeau n'est **pas** une frontière de sécurité — RLS et
les fonctions edge le sont.

### Quand le monde pro est ouvert, la règle KEEL tient — et elle n'a pas changé

> **Le coach ne produit RIEN de personnel pour un élève.** Pas de plan, pas de menu, pas de
> message, pas de correction. Il écrit une **doctrine** et un **programme** pour toute sa
> cohorte ; c'est **l'élève** qui compose à partir de ça. **Aucun canal 1:1** coach → élève.

Conséquence immédiate et la plus souvent violée, **vraie dans les deux mondes** : **aucune copie
ne doit faire attendre**. « Ton coach prépare ton plan » est faux. Un écran vide porte la sortie
vers `/app/plan`, où la personne compose elle-même.

Détail complet, ce que ça interdit, et le trou connu :
**[docs/keel/MODEL.md](docs/keel/MODEL.md)**.

### Deux chaînes gardées EXPRÈS — ne les supprime pas, ne les prends pas pour le modèle

- **La lane de la SEMAINE** (`generate-week-plan-v1` → `student_week_plans`) : le **producteur**
  a été retiré le 2026-08-19 (aucun appelant vivant). La **table et ses cinq lecteurs restent**.
  Ne « rebranche » pas un écrivain par symétrie — c'est une décision produit. Ce que ça coûte,
  écrit ici pour que personne ne le redécouvre : plus aucun objet où une consigne **nomme** la
  conviction qu'elle applique et où la base **refuse** la ligne qui ne la nomme pas. La lane du
  repas *peut* citer une conviction (`generated_from.belief_keys`, à l'échelle du plan) ; elle
  n'y est **jamais obligée** et rien ne le vérifie. **La traçabilité par ligne n'existe plus.**
- **La chaîne de prescription individuelle** (`plan_versions`, `/coach/import`,
  `/coach/templates`) : c'est le mode 1:1, gardé exprès, et ce **n'est pas le modèle**.

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
