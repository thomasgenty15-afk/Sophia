# Socle — chantier « Clôture après la campagne des six tirs »

## 0. L'autorité

- **Le plan : `docs/keel/PLAN-CLOTURE-APRES-SIX-TIRS-2026-09-11.md`.** Lis-le **en entier**,
  pas seulement ta section. Il prescrit ; **il ne déclare rien de fait**.
- Les preuves : `docs/keel/CAMPAGNE-SIX-TIRS-2026-09-11.md` et les réponses brutes des onze
  lancements dans `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/`.
- `scratchpad/2026-09-11-FIABILITE-RECETTES/NON-BRANCHE.md` — ce qui est écrit, éprouvé et
  **sans appelant de production**.
- Les rapports des chantiers précédents : `scratchpad/2026-09-11-FIABILITE-RECETTES/RAPPORT-*`.
- Règles projet : `CLAUDE.md`, `AGENTS.md`.

⛔ **Ne reprends aucun lot précédent depuis zéro.** Le plan l'écrit : « Réutiliser les
résolveurs, contrats par créneau, composants culinaires, finalisation des quantités, audits et
transport de test désormais présents. » Et : « Ne pas créer de nouvel orchestrateur ou réécrire
les modules qui fonctionnent déjà pour contourner leurs appelants actuels. »

⚠️ **Vérifie les changements intervenus depuis ces preuves avant chaque modification** — le
dépôt bouge.

## 1. L'ordre est un contrat

```
C0 → C1 → C2 → C3 → C4 → C5 → C6
```

Chaque étape apporte **son correctif, ses tests de régression et une preuve de branchement**.
Tu es lancé pour UNE étape. Ne déborde pas.

⛔ **« Codé », « testé en isolation » et « branché jusqu'à la livraison » sont TROIS ÉTATS
DIFFÉRENTS.** C'est la phrase des conditions de clôture, et c'est la grille de lecture de ton
rapport.

⛔ **« Aucune limite de "propriétaire du lot précédent" ne justifie de laisser une correction de
ce plan non branchée. »** Si un correctif de ton étape demande de toucher un fichier qu'un autre
chantier « possédait », tu le touches.

## 2. La décision du propriétaire, ajoutée à ce plan

**Arrondir les quantités au plus proche.** Les quantités arrondies sont celles **réellement
calculées, cuisinées, achetées et affichées**. Pas de recherche du kcal exact au prix de
fractions d'œufs ou de morceaux de viande. Le barème complet est au § C2 du plan.

## 3. Style de code

Commentaires **en français**, denses, qui nomment le **défaut mesuré** réparé, avec son chiffre
et sa date. Registre : `food_composition.ts`, `portion_sizing.ts`, `plan_repair_loop.ts`.
Modules `_shared/keel/*.ts` **purs** sauf les `_io.ts`. Une valeur absente reste **inconnue**,
jamais zéro. Un repli silencieux est interdit : on s'abstient et on **compte** l'abstention.

## 4. Comment on vérifie

```bash
deno test --allow-read --allow-env supabase/functions/_shared/keel/
deno check supabase/functions/generate-household-meal-v1/index.ts
deno check supabase/functions/meal-energy-v1/index.ts
deno run --allow-read scripts/2026-09-11-mesure-grille.ts scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures
deno test --allow-read scripts/2026-09-11-mesure-grille_test.ts
cd frontend && npx tsc -b --force && npx vitest --config vitest.config.ts run && npm run build
```

Node v22 requis pour vitest : `export PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH"`.

### L'état au 2026-09-11 22 h 45

| | résultat |
|---|---|
| Deno `_shared/keel/` | **6 670 verts · 0 rouge · 2 ignorés** |
| `deno check` des deux handlers | exit 0 |
| front `tsc -b --force` | exit 0 |
| front vitest | **2 551 verts · 2 rouges** — `mouthProfileReaders.int.test.ts:154` ×2, session voisine |
| `npm run build` | vert |

⛔ **La suite Deno est à ZÉRO rouge. Tu finis à zéro.** Front : **2 rouges**, pas un de plus.
Et **plus** de tests qu'avant, partout.

⚠️ `generate-meal-v1` **n'existe plus** dans l'arbre. Ne le typechecke pas.

## 5. Interdits

- ⛔ `supabase db push`, `db reset`, `functions deploy`, `secrets set/unset`, `config push`,
  `link` : **prépare les fichiers, donne la commande exacte, laisse l'humain l'exécuter.**
  Le plan ne demande **aucun déploiement**.
- ✅ `supabase migration up` en local est autorisé.
- ⛔ `git stash/checkout/restore/reset`, aucun commit. **Dépôt partagé.**
- ⛔ **Aucune suppression destructive.** « Les essais utilisent des fixtures isolées sans
  nettoyage destructif nécessaire. » Un compte par run, jamais un `DELETE` large.
- ⛔ 401 `Invalid JWT` : seul geste `./scripts/check-local-jwt-alg.sh`, puis
  `docs/keel/JWT-HS256.md`.
- ⛔ **`docker restart` sur le conteneur edge est INTERDIT** tant que `functions serve` tourne.

## 6. La pile locale

`supabase functions serve` **redémarré à 19:31**, Kong à **600 000 ms**, journal
`/tmp/keel-serve.log`. ⚠️ **L'hébergé coupe à 150 000 ms** : le relevé sert à **connaître** la
durée, jamais à la **pardonner**.

⚠️ **Si ton étape modifie un `_shared` et qu'un run réel suit, le runtime doit être
redémarré.** Demande-le dans ton rapport ; ne tue pas le processus.

Lecture SQL directe autorisée, **aucune écriture** :
```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -A -F'|' -c "select …"
```

## 7. Les erreurs de mesure déjà commises — ne les refais pas

- **On ne mélange pas deux bases de mesure.** Deux dimanches publiés à 2 370 et 3 075 valaient
  **2 455,69** et **2 916,14**.
- **On n'attribue pas un pourcentage de gain sans témoin équivalent** — même nombre de cases,
  mêmes horaires, mêmes réglages, même environnement.
- **Un `ingredient_not_bought` n'est pas un achat manquant** : 8 sur 9 étaient des pluriels.
- **« Non applicable » n'est pas « non contrôlé ».**
- **Un compteur ne prouve pas ce qu'il ne mesure pas.** `consumers_degraded = 0` veut dire
  « aucune portion conforme **en densité** dégradée », pas « aucune recette dégradée ».

## 8. Ton rapport final

1. **Fait et prouvé** — commande et résultat pour chaque point.
2. **Fait mais non prouvé**, et pourquoi.
3. **Pas fait**, et pourquoi. Sans enjoliver.
4. **Arbitrages** : « question → décision → raison ». En tête.
5. **Les tests de sortie de ton étape**, un par un, avec leur verdict.
6. **Preuve de branchement** — pour chaque correctif : est-il **codé**, **testé en isolation**,
   ou **branché jusqu'à la livraison** ? Les trois mots comptent.
7. Fichiers créés ou modifiés.
8. **Commandes réservées à l'humain**, s'il en reste.
9. **« Pour les étapes suivantes »** : fichier, ligne, preuve.

⛔ La garde finale du plan : **ne jamais annoncer « aucune perte de saveur », « tous les
ingrédients vérifiés » ou « premier jet parfait » à partir de compteurs qui mesurent autre
chose. Une étape non branchée, un test sauté ou une dégustation non faite reste nommée comme
telle.**

## 9. ⚠️ ÉTAT DU RUNTIME EDGE — 2026-09-12 00 h 53

`supabase functions serve` **est mort à 22:52**. Journal (`/tmp/keel-serve.log`) :

```
File change detected: …/_shared/keel/cell_edit.ts (WRITE)
failed to create docker container: Conflict. The container name
"/supabase_edge_runtime_Sophia_2" is already in use by container "3b496d8f…"
```

Le superviseur a voulu recréer le conteneur sur un changement de fichier et n'a pas pu.
**Le conteneur orphelin tourne toujours et répond** (401 sur le handler), mais il sert le code
**figé au 2026-09-11 22:52** et **plus personne ne le surveille**.

⛔ **Aucun run réel par HTTP ne prouve quoi que ce soit dans cet état.** Il mesurerait du code
d'avant C2 et C3.

✅ **Le transport contrôlé n'est PAS concerné** : `banc-lot-F.ts` importe le handler **dans son
propre processus**. C'est pour ça que ses nombres sont à jour. Continue à t'en servir.

**La remise en état, quand plus personne n'écrit sous `supabase/functions/` :**

```bash
docker rm -f supabase_edge_runtime_Sophia_2
./scripts/local_serve_functions.sh
```

⚠️ `docker rm -f` n'est autorisé ici **que parce que `functions serve` ne tourne plus**. Tant
qu'il tourne, toucher ce conteneur le fait boucler create→start→kill toutes les 5 s
(`keel-bench-generation-feedback-tick`). Vérifier `ps aux | grep "functions serve"` **avant**.

## 10. ⟳ RUNTIME REMIS EN ÉTAT — 2026-09-12 03 h 14

Le conteneur orphelin a été retiré (`functions serve` était bien arrêté, vérifié) et le serveur
relancé par `./scripts/local_serve_functions.sh`.

| | état |
|---|---|
| `supabase functions serve` | **PID vivant depuis 03:14**, journal `/tmp/keel-serve.log` |
| conteneur edge | recréé à 03:14, **sert le code de C0→C5** |
| Kong `read_timeout` | **600 000 ms** — ⚠️ l'hébergé coupe à **150 000 ms** |
| endpoint | répond `401` (authentification requise) = vivant |

✅ **Un run réel par HTTP mesure désormais le code du chantier.**

⛔ **Et la règle qui reprend effet : `docker restart` / `docker rm` sur ce conteneur est
INTERDIT tant que `functions serve` tourne.** Vérifier `ps aux | grep "[f]unctions serve"`
avant tout geste. ⛔ **N'écris rien sous `supabase/functions/**` pendant qu'une génération réelle
est en vol** : le superviseur recrée le conteneur et le run meurt en 502.
