# PLAN — sortir « KEEL » du vocabulaire interne

> **Ce document est un plan, pas un chantier fait.** La partie *visible* est
> livrée (voir §0) ; ce qui suit concerne les **identifiants**, qu'aucun
> utilisateur ne lit.
>
> ⚠️ **La règle qui gouverne tout ce plan : à aucun moment entre deux étapes le
> produit ne doit être cassé.** C'est ce qui impose l'ordre ci-dessous, et
> l'ordre n'est pas négociable.

---

## 0. Ce qui est DÉJÀ fait — la partie qui se voyait

| surface | ce qu'elle portait | état |
|---|---|---|
| `plan_versions.title` — le `h1` de `/app/today` | « KEEL discovery program » | ✅ « Sophia discovery program » |
| `plan_versions.notes_for_student` | « … a real coach on KEEL … » | ✅ Sophia |
| `coach_doctrines.forbidden[].instead` — **une phrase que le modèle DIT à l'élève** | « a real coach on KEEL is for » | ✅ Sophia |
| `coach_doctrines.change_note` | « KEEL discovery program — … » | ✅ Sophia |
| `keel_provision_house_plan_version()` — **écrit un titre à CHAQUE inscription** | 3 chaînes | ✅ remplacée |
| Prompt d'identité du modèle (`companion.ts`) | « You are the conversational runtime of KEEL » | ✅ « of Sophia » |
| 4 questions d'import montrées au coach | « KEEL needs the form », … | ✅ Sophia |
| Message de validation Stripe | « unless plan is a KEEL plan » | ✅ ne nomme plus rien |

**La preuve que ça n'était pas théorique** — trouvé dans `chat_messages`, écrit
par l'assistant à un élève :
> « the method is the general **KEEL** discovery approach: real-food meals … »

Le mot venait des **données** injectées en contexte, pas du code d'un écran :
aucune relecture de TSX ne pouvait l'attraper.

---

## 1. L'ampleur du reste, mesurée

| ce qui porte le nom | nombre | risque de prod |
|---|---:|---|
| fichiers front sous `frontend/src/keel/` | **199** | **aucun** |
| identifiants TS `Keel*` (`KeelAppShell`, `KeelStudentRoute`, …) | **34** | **aucun** |
| fichiers edge sous `_shared/keel/` | **302** | faible (import interne) |
| **fonctions SQL `keel_*`** | **77** | **élevé** |
| **crons `keel-*`** | **10** | **élevé** |
| **fonctions edge `keel-*-v1`** | **5** | **élevé** |
| colonnes `keel_*` | **1** (`profiles.keel_role`) | **élevé** |
| tables `keel_*` | 0 | — |

⚠️ **`keel_signup_intent` n'est pas une colonne** : c'est une clé dans
`auth.users.user_metadata` (JSON), écrite au signup et lue par
`handle_new_user()`. La renommer demande de gérer les deux formes pendant la
transition, sinon tout compte créé avant la bascule devient non rattachable.

---

## 2. L'ordre, et pourquoi il est dans cet ordre

### Étape 1 — le front (199 fichiers + 34 identifiants) · **sans risque**
`frontend/src/keel/` → `frontend/src/sophia/`, `KeelAppShell` → `SophiaAppShell`,
etc. Purement mécanique, vérifié par `tsc` et les tests. Aucun contrat externe.

⚠️ **Un seul piège, et il est réel** : `data-testid="shell-menu-toggle"` et ses
voisins sont lus par les tests e2e. Renommer un `data-testid` casse un test
**sans que `tsc` bronche**. Les laisser tels quels, ou les changer dans le même
commit que les tests.

### Étape 2 — les `_shared/keel/` (302 fichiers) · **faible**
Imports internes aux fonctions edge. `deno check` couvre.
⚠️ **Le runtime edge sert des `_shared` PÉRIMÉS** : un fichier modifié n'est pas
rechargé. Après cette étape, **redémarrer la pile** avant tout run réel, sinon on
mesure l'ancien code et on conclut de travers.

### Étape 3 — les 77 fonctions SQL · **élevé, et c'est le cœur**
Une fonction SQL est appelée depuis **trois** endroits : le front (`.rpc()`), les
fonctions edge, et d'autres fonctions SQL (y compris des triggers).

**Le motif sûr, et il évite toute fenêtre de casse :**
1. `create` la fonction sous le **nouveau** nom (copie exacte du corps).
2. Transformer l'**ancienne** en enveloppe qui appelle la nouvelle.
3. Migrer les appelants, par vagues, en vérifiant après chacune.
4. `drop` l'ancienne **seulement** quand elle n'a plus d'appelant.

⚠️ **Les trois épreuves d'absence** que ce dépôt exige avant de supprimer un nom
(cicatrice `renaming-a-table-needs-three-absence-proofs`) : le **code**, le
**`prosrc`** des autres fonctions, et les **vues**. Un `grep` du seul dépôt ne
suffit pas — une fonction SQL peut en appeler une autre par son nom, en texte.
⚠️ **`create or replace` sur une vue perd `security_invoker`** — invisible aux
tests. Si une vue est touchée, re-poser l'option explicitement.
⚠️ Préserver `SECURITY DEFINER` et `SET search_path` à l'identique : les perdre
ouvre une fonction privilégiée.

### Étape 4 — `profiles.keel_role` · **élevé**
Même motif que ci-dessus, en trois temps : ajouter `role` (ou un meilleur nom),
**écrire les deux** pendant la transition, migrer les lecteurs, puis retirer
l'ancienne colonne. Ne jamais renommer d'un coup : les gardes de route
(`KeelStudentRoute`, `resolveHomePath`) lisent cette colonne à chaque
navigation, et une lecture qui rend `null` envoie tout le monde sur `/account`.

### Étape 5 — les 5 fonctions edge et les 10 crons · **élevé, et c'est le seul irréversible**
Une fonction edge est une **URL déployée**. La renommer, c'est en créer une
nouvelle et retirer l'ancienne, et **les crons appellent l'ancienne par son nom**.

**L'ordre qui ne casse rien :**
1. déployer la fonction sous le **nouveau** nom (l'ancienne reste en ligne) ;
2. `unschedule` puis `schedule` chaque cron vers le nouveau nom ;
3. observer un cycle complet (le plus lent est hebdomadaire — **une semaine**) ;
4. retirer l'ancienne fonction.

⚠️ **Les crons n'appellent pas comme un client** : ce dépôt a déjà payé un 403
sur chaque envoi parce qu'un cron utilisait `invoke` là où la fonction attendait
`x-internal-secret` (cicatrice `keel-crons-invoke-vs-internal-secret`). Vérifier
la forme d'appel **avant** de recâbler, pas après.

---

## 3. ⛔ Les commandes que je ne peux pas lancer

Le renommage exige **toutes** les commandes que `CLAUDE.md` réserve à un humain :

```bash
supabase db push
```
```bash
supabase functions deploy <les nouvelles>
```

Je peux : écrire les migrations, les appliquer **en local** (`migration up`),
migrer le code, et vérifier. **Je ne peux pas** pousser en distant ni déployer.
L'étape 5 est donc, par construction, un geste humain.

---

## 3bis. ⛔ CE QUE LE PLAN AVAIT OUBLIÉ : la concurrence

**Ce plan supposait un dépôt au repos. Il ne l'est pas.** À la première tentative
d'exécution (2026-08-13), le dépôt portait **361 fichiers modifiés** par d'autres
sessions, dont **62 sous `frontend/src/keel/`** et **60 sous
`_shared/keel/`** — et **dix fichiers de ces deux répertoires avaient été écrits
dans les dix minutes précédentes.**

`git mv` a d'ailleurs refusé net : une autre session avait supprimé
`i18n/fr.public.ts` sans indexer la suppression, et menait dans ce même
répertoire un refactor i18n avec **douze fichiers NEUFS non suivis**
(`fr.ts`, `format.ts`, `plural.ts`, `reconcile.ts`, …).

**Le danger n'est pas la perte de contenu** — `mv` emporte aussi les fichiers non
suivis, donc le travail en vol suit le déplacement. **Le danger est le
split-brain** : l'agent d'en face tient l'ANCIEN chemin en mémoire, écrit à sa
prochaine action, et **recrée `keel/`**. On se retrouve avec la moitié du module
i18n de chaque côté, deux fois le même nom de module, et
`scripts/.i18n-baseline.json` — qui est indexé PAR CHEMIN — qui ne trouve plus
ses fichiers. C'est le seul dégât de ce plan qui soit vraiment pénible à défaire.

**La réponse : `scratchpad/plateforme/renommage-etape1-2.sh`.** Les étapes 1 et 2
y sont une opération unique, ce qui ramène la fenêtre d'incohérence de plusieurs
heures d'édition à **quelques secondes**. Le script :

- **refuse de tourner** si un fichier des deux répertoires a été écrit dans les
  10 dernières minutes (`--force` pour passer outre, en connaissance de cause) ;
- utilise `mv` et non `git mv`, précisément parce que `git mv` capitule dès
  qu'un fichier suivi est supprimé sans être indexé ;
- ne réécrit **que des segments de chemin** et six noms de composants.

**La preuve que la frontière tient**, mesurée sur un fichier témoin portant les
huit formes dangereuses : `profiles.keel_role`, `keel_signup_intent`,
`rpc("keel_join_house_coach")`, `cron 'keel-daily-pulse'`,
`keel-daily-pulse-v1`, `supabase/functions/keel-reengage-v1/`,
`data-testid="…"` et la clé `"app.nav.today"` sont **tous intacts** après
substitution — seuls les imports et les composants changent. À l'échelle du
dépôt : **277 identifiants de base** et **39 noms déployés** hors d'atteinte,
pour **419 fichiers** réécrits.

```bash
bash scratchpad/plateforme/renommage-etape1-2.sh --dry   # compte, ne touche rien
bash scratchpad/plateforme/renommage-etape1-2.sh --go    # refuse si l'arbre bouge
```

## 4. Ma recommandation sur le découpage

**Faire l'étape 1 seule, et s'arrêter là un moment.** Elle couvre 233 des
identifiants (199 fichiers + 34 noms), ne touche ni la base ni les fonctions
déployées, et se vérifie entièrement par `tsc` + les tests. C'est 90 % du confort
de lecture pour 0 % du risque.

**Les étapes 3 à 5 ne valent d'être faites que groupées**, parce que chacune
laisse le vocabulaire mixte si elle est seule — et un vocabulaire à moitié
renommé est *pire* que pas renommé : le lecteur ne sait plus lequel des deux noms
est le vrai. Si elles ne sont pas planifiées, mieux vaut ne pas commencer.

**Ce qui reste légitimement « keel » dans tous les cas, et qu'il faut écrire
quelque part :** le mot désigne aussi une **voie** du produit — « un élève
KEEL » veut dire *un élève encadré par un coach en 1:N*, par opposition au foyer
et au 1:1. C'est ce sens-là qui apparaît dans les prompts du dispatcher
(« KEEL uniquement »). **Le remplacer par « Sophia » y détruirait la
distinction** : tous les utilisateurs sont des utilisateurs Sophia. Ce concept a
besoin d'un nom à lui — « élève encadré », « cohorte », « coaché » — et ce
choix-là est un choix de produit, pas de renommage.
