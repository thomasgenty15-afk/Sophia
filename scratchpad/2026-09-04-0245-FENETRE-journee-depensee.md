# La journée déjà dépensée sort de la fenêtre — lot posé

**Branche** `ff-001-quotidien-du-coach` · **commit** `4e2719d9`

La décision, mot pour mot : « si la personne demande lundi mardi mercredi alors qu'on est
lundi 20h, alors il faut juste que le plan soit pour mardi et mercredi. Et oui il peut y
avoir un warning si besoin ».

---

## 1. Ce que le lot corrige, et ce qu'il ne touche pas

Les moments déjà passés du jour même étaient retirés **depuis toujours**, et c'est juste :
on ne planifie pas un déjeuner à 22 h pour le jour même. Mais **la fenêtre continuait de
compter ce jour-là**. Trois jours demandés rendaient deux journées de repas, et rien ne le
disait.

⛔ **La nourriture servie ne bouge pas d'un gramme.** C'était déjà mardi et mercredi qui
étaient composés. Ce lot corrige la **comptabilité** de la fenêtre et la **franchise** de
l'écran. La mesure du §4 le confirme : les 5 plans rétrécis portaient **zéro plat** le jour
retiré.

⛔ **On garde la FIN.** La formule « trois demandés = trois nourris », qui irait chercher un
jeudi, a été explicitement écartée. Le plan assume d'être plus court.

## 2. La garde qui fait tout le lot

`withCookDayBefore` recule `startsOn`. Donc **qui a demandé la veille de cuisine se retrouve
avec la fenêtre commençant aujourd'hui ET aujourd'hui en jour de cuisine seule** — où tous
les moments sont trivialement « passés », puisqu'on n'y mange pas.

**Sans la garde `cook_day`, ce lot mange la veille livrée la veille.** Elle est testée, et
sa mutation rougit.

Quatre refus nommés plutôt qu'un booléen : `not_today`, `cook_day`, `slots_remain`,
`single_day`. Une fenêtre d'un jour ne se rétrécit pas — elle deviendrait vide, et générer
zéro jour est pire que générer un plan court.

## 3. L'ordonnancement, mesuré avant d'être déplacé

Le calcul descend **sous** le parse du rythme : décider que la journée est finie demande le
rythme **corrigé** (`rhythm.set`). Mesure faite avant de bouger quoi que ce soit : **entre
l'ancien site et le nouveau, rien ne lit** `startsOn`, `durationDays`, `daysToFill`,
`daysToEat` ni `scope`. Le déplacement ne traverse aucun lecteur.

Une **seule** lecture de l'heure alimente les deux questions (le retrait, et le retrait des
moments passés plus bas). Deux appels auraient pu diverger.

**Les CHECK de `20260903170000` tiennent sans migration** : le retrait décrémente
`duration_days` sans toucher à la veille (il se refuse quand elle existe), donc
`duration_days − lead_days` reste dans `[1, 7]`. Vérifié, pas supposé.

## 4. La mesure — 18 plans réels

| | |
|---|---:|
| plans du corpus | 21 |
| mesurables (fenêtre lisible) | 17 |
| **rétrécis par le lot** | **5** |
| plans perdant un plat | **0** |

Les cinq : `F1-20260903-221206`, `S1-20260903-220929`, `S1allergy-20260903-221416`,
`S1egg-20260903-221659`, `S7bis-20260824-230630`. **Tous générés après 22 h.** Tout plan
généré avant ~21 h porte au moins un plat le premier jour et reste inchangé.

## 5. Les mutations — 9 sur 9 rougissent

| # | garde | rouge |
|---|---|---|
| 1 | ⛔ `cook_day` (le piège) | ✓ |
| 2 | plancher d'un jour | ✓ |
| 3 | fenêtre qui ne commence pas aujourd'hui | ✓ |
| 4 | un moment encore à venir retient | ✓ |
| 5 | fail-closed sur rythme illisible | ✓ |
| 6 | le retrait retire vraiment un jour | ✓ |
| 7 | ordre veille / retrait dans `planTimingOf` | ✓ |
| **8** | **câblage : le timing reçoit le retrait** | ✓ |
| **9** | **câblage : une seule lecture de l'heure** | ✓ |

Restaurations par `cp`, **prouvées par `cmp`**. Jamais `git checkout`/`stash`/`reset`.

⚠️ **8 et 9 sont celles que le lot du verdict n'avait pas su fermer hier.** Rien n'exécute
`generate-meal-v1/index.ts` (`Deno.serve` au chargement) : trois tests de **source** les
tiennent, en assertant des **absences et des ordres**, jamais des lignes. Épingler le texte
d'un appel photographie le code — c'est ce qui a fait rougir `cook_the_day_before_test.ts`
le jour même, et je l'ai desserré plutôt que recopié.

## 6. Ce que la personne lit

`timing.kind` gagne `starts_tomorrow`. La phrase dit les **deux** faits : il commence
demain, **et** il couvre un jour de moins. Ne dire que le premier laisserait croire qu'on a
décalé les trois jours.

⛔ Elle ne dit **jamais** « tu n'étais pas là » : le serveur sépare exprès les moments passés
des absences déclarées.

**Un défaut trouvé en passant, et réparé** : `PlanResult.tsx` rendait « courses et cuisson
dès le matin » pour **tout** ce qui n'est pas une veille. Sur un plan qui commence demain,
c'est un fait faux — et le parseur du front l'avait écrit vingt lignes plus loin : « un fait
FAUX, et il est indémentable pour qui le lit ». Chaque cas se nomme désormais.

## 7. Les portes

| porte | résultat |
|---|---|
| `deno test _shared/keel/` (typecheck compris) | **5 229 passés, 0 échec, 1 ignoré** |
| `deno check` sur les deux lanes | **rc=0** |
| `tsc -b --force` | **rc=0** |
| `tsc -p tsconfig.test.json` | **87 / liste 87** |
| `vitest run` | **2 249 verts, 4 rouges — les 4 de la baseline, étrangers** |

## 8. ⛔ Ce qui n'est PAS mesuré, nommé

1. **Aucun run réel n'a vu le rétrécissement mordre, et ce n'est pas un oubli.** À 2 h du
   matin aucun moment n'est passé — mesuré par une session voisine sur son propre run :
   `suggested_window: {shifted: null}`, trois journées pleines. Le voir exigerait de forcer
   l'horloge d'une pile partagée. La garde est prouvée par unité et par mutation.
2. **Et un run maintenant ne prouverait pas ce qu'il semble prouver** : `meal_plan_window.ts`
   est un fichier **modifié**, et le runtime edge ne recharge pas un `_shared` modifié sans
   redémarrage — cicatrice connue du dépôt. Il faudrait redémarrer `functions serve`, qui
   appartient à une autre session.
3. **La lane foyer n'est pas touchée.** Elle reçoit `{ dropped: null }` **en dur** plutôt
   qu'un paramètre optionnel : l'absence est visible au lecteur et au compilateur. Son propre
   ordonnancement n'a pas été mesuré.
4. **Aucune migration, aucun déploiement.** Rien n'est poussé.
