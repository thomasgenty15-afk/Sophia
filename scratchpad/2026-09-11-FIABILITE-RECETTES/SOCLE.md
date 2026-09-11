# Socle commun — chantier « Fiabiliser les portions et préserver les recettes »

Lis ce fichier EN ENTIER avant de toucher au code.

## 0. L'autorité

- **Le plan : `docs/keel/PLAN-FIABILITE-ET-EQUILIBRE-RECETTES-2026-09-11.md`.** C'est LUI que tu
  exécutes, à la lettre. Lis-le en entier, pas seulement la section de ton lot.
- **Les preuves : `docs/keel/REVUE-CAMPAGNE-ET-SAVEUR-2026-09-11.md`** et
  `scratchpad/2026-09-11-REVUE-CAMPAGNE/` (`revue.ts`, `resultats.json`, `compteurs.json`,
  `entrees.json`, `referentiel.json`, `versions.json`). Lis la revue en entier.
- Le rapport que la revue corrige : `docs/keel/CAMPAGNE-DEUX-SOLO-2026-09-11.md`. **Son bandeau
  de tête liste six conclusions fausses. Ne reprends aucun de ses chiffres sans le bandeau.**
- Le chantier précédent, livré cette nuit : `docs/keel/CHANTIER-PREMIER-JET-2026-09-11.md`.
  **Ne reconstruis pas les modules déjà fonctionnels** (décision de périmètre n° 9 du plan).
- Règles projet : `CLAUDE.md`, `AGENTS.md`.

## 1. L'ordre est un contrat

```
0 → A → B → C → D → E → F
```

**Chaque lot fournit ses tests et ses résultats avant le passage au suivant.** Tu es lancé pour
UN lot. Ne déborde pas sur le suivant, même si tu vois comment faire.

## 2. Style de code

Commentaires **en français**, denses, qui nomment le **défaut mesuré** que le code répare, avec
son chiffre et sa date. Regarde `food_composition.ts`, `portion_sizing.ts`,
`plan_repair_loop.ts` : c'est le registre. Pas de jargon décoratif. Les modules
`_shared/keel/*.ts` sont **purs** sauf les `_io.ts`. Une valeur absente reste **inconnue**,
jamais zéro. Un repli silencieux est interdit : on s'abstient, et on **compte** l'abstention.

## 3. Comment on vérifie

```bash
deno test --allow-read --allow-env supabase/functions/_shared/keel/
deno check supabase/functions/generate-household-meal-v1/index.ts
deno check supabase/functions/meal-energy-v1/index.ts
cd frontend && npx tsc -b --force && npx vitest --config vitest.config.ts run && npm run build
```

⚠️ `generate-meal-v1` **n'existe plus** dans l'arbre de travail. Ne cherche pas à le typechecker.

### Les rouges PRÉEXISTANTS au 2026-09-11 16 h — pas les tiens, ne les répare pas

Deno : `FAILED | 6550 passed | 3 failed | 2 ignored`
- `cooking_style_brief_test.ts:70` · `household_freeze_test.ts:286` · `household_merge_quota_test.ts:190`

Front (node v22.20.0) : `2 failed | 2533 passed | 20 skipped (161 fichiers)`
- `mouthProfileReaders.int.test.ts:154` ×2 — cherche un `<ActivitySessionsCard>` pas encore posé.

`tsc -b --force` : **exit 0**. `eslint` : 30 erreurs + 3 avertissements, tous dans des fichiers
front que ce chantier ne touche pas.

**Ton lot doit finir à 3 rouges Deno et 2 rouges front, pas un de plus**, et avec **plus** de
tests qu'avant.

## 4. Interdits

- ⛔ `supabase db push`, `db reset`, `functions deploy`, `secrets set/unset`, `config push`,
  `link`. Bloqués par un hook. **Prépare les fichiers, donne la commande exacte dans ton
  rapport, laisse l'humain l'exécuter.** Le plan ne demande aucun déploiement.
- ✅ `supabase migration up` en local est autorisé.
- ⛔ `git stash/checkout/restore/reset`, aucun commit. **Le dépôt est partagé** et porte le
  travail non commité d'autres sessions.
- ⛔ **Aucun appel modèle payant** sauf autorisation explicite de ton lot (seul le lot F en
  prévoit, et seulement après ses preuves).
- ⛔ **Aucune suppression de données.** `scripts/2026-09-11-campagne-premier-jet.ts` porte des
  `DELETE` larges par utilisateur de fixture : **le plan interdit de le relancer tel quel.**
  Toute purge éventuelle suit l'exception QA d'`AGENTS.md` et ne concerne que les données d'un
  run explicitement autorisé.
- ⛔ 401 `Invalid JWT` en local : seul geste autorisé `./scripts/check-local-jwt-alg.sh`, puis
  lire `docs/keel/JWT-HS256.md`.

## 5. La pile locale

Elle tourne. `supabase functions serve` a démarré à **15:02** ; Kong est relevé à **600 000 ms**.
⛔ **`docker restart` sur le conteneur edge est INTERDIT tant que `functions serve` tourne** — le
superviseur le fait boucler create→start→kill toutes les 5 s, et les 502 ressemblent alors à des
pannes de fonction. Pour recharger un `_shared` **modifié** avant un run réel, il faut redémarrer
`functions serve` lui-même (`./scripts/local_serve_functions.sh`) — c'est le terminal de
l'humain : demande-le, ne le tue pas.

Lecture SQL directe autorisée, **aucune écriture** :
```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -A -F'|' -c "select …"
```

## 6. Les deux plans de la campagne, et leurs comptes

| | plan | compte |
|---|---|---|
| PERTE | `1f8a8988-b3ed-4b83-a4d0-93297ac0d652` | `camp.perte@keeltest.dev` (mdp `1234567`) |
| GAIN | `1eada05b-2c3d-4ed5-aa85-14edf2840b77` | `camp.gain@keeltest.dev` |

Les deux plans du matin, antérieurs au chantier : `5fad22ce-…` et `a18f522e-…`.

## 7. Ce que j'ai eu FAUX hier soir, et qui doit rester faux

Pour que personne ne les recopie :

- **On ne mélange pas deux bases de mesure.** J'ai mesuré le contrôle 1 sur les items de boîte et
  le contrôle 5 sur des parts conventionnelles : les deux dimanches sont sortis à 2 370 et 3 075
  alors qu'ils valent **2 455,69** et **2 916,14**, à +0,07 % et +0,14 % de leur cible.
- **On n'attribue pas un pourcentage de gain sans témoin équivalent.** J'ai publié −51 %/−52 %
  entre des plans de **9 créneaux** et des plans de **7**.
- **Un `ingredient_not_bought` n'est pas un achat manquant** : 8 des 9 étaient des faux positifs
  de singulier/pluriel.
- **« Non applicable » n'est pas « non contrôlé »** : j'ai classé les protéines non applicables
  alors que l'absence de contrôle est une exigence non satisfaite.

## 8. Ton rapport final

1. Ce qui est **fait et prouvé** — pour chaque point, la commande et son résultat.
2. Ce qui est **fait mais non prouvé**, et pourquoi.
3. Ce que tu **n'as pas fait**, et pourquoi. Sans enjoliver.
4. **Les arbitrages**, un par ligne : « question → décision → raison ». C'est la partie que
   l'utilisateur lit en premier.
5. Les **tests de sortie de ton lot**, un par un, avec leur verdict.
6. Les fichiers créés ou modifiés, un par ligne.
7. Les **commandes réservées à l'humain**, s'il en reste.

⛔ Le plan l'écrit et je le répète : **ne jamais annoncer « aucune perte de saveur », « tous les
ingrédients vérifiés » ou « premier jet parfait » à partir de compteurs qui mesurent autre
chose.** Une étape non branchée, un test sauté ou une dégustation non faite reste **nommée comme
telle**.
