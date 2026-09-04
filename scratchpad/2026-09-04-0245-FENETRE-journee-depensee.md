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

## 8. ⟳ LE RUN RÉEL A EU LIEU — et il a trouvé deux phrases fausses

**Le §8 disait « aucun run réel n'a vu le rétrécissement mordre ». C'est faux depuis
03:13.** Deux runs, témoin et cas, empreinte du code **identique aux quatre relevés** —
donc les deux plans comparent deux fuseaux et non deux codes.

Le fuseau de la fixture `eval0823.solo@keeltest.dev` est passé de `Europe/London` à
`America/Sao_Paulo` le temps du second run, **lu avant, restauré après, vérifié**. Ce n'est
pas une horloge forcée : c'est un élève brésilien qui compose à 22 h, cas produit ordinaire.
Le dîner « passe » à 21 h (`SLOT_PASSED_HOUR`).

| | témoin — Londres, 02:11 | cas — São Paulo, 22:13 |
|---|---|---|
| fenêtre | **3 jours**, 2026-09-04 → 09-06 | **2 jours**, 2026-09-04 → 09-05 |
| demandé | jeu+3 (09-04 → 09-06) | jeu+3 (**09-03** → 09-05) |
| dernier jour servi | 09-06 | **09-05 — la fin demandée** |
| `timing.kind` | `same_morning` | **`starts_tomorrow`** |
| `issues` | `[]` | **`spent_first_day_dropped: thu`** |
| plats | 9 (3/jour) | 6 (3/jour) — **aucun perdu** |

Le témoin compte autant que le cas : une garde qui mord toujours ressemble à une garde qui
marche. Et aucune trace du jeudi retiré ne subsiste dans les sessions de cuisine, la liste
de courses ni les plats — vérifié, pas supposé.

### ⛔ CE QUE LE RUN A TROUVÉ, ET QU'AUCUN TEST NE POUVAIT VOIR

Le premier run a rendu à la personne :

> « You asked for 3: **the week ends before that**, so 2 are left. »
> « Shopping and cooking **first thing in the morning**, so it is ready by lunch. »

La première donne **une cause qui n'est pas la sienne** — `until_sunday` était la seule
façon de raccourcir une fenêtre quand cette phrase a été écrite. La seconde parle du matin
d'**aujourd'hui** sur un plan qui commence demain : le fait faux et indémentable que le
parseur du front nomme déjà en toutes lettres, et que j'avais corrigé côté écran **sans voir
que le serveur avait sa propre copie**.

Les deux prémisses étaient vraies à l'écriture ; une seconde cause les a rendues fausses.
**Aucun test unitaire ne pouvait le dire : aucun ne rendait la chaîne sur un plan rétréci.**
Corrigé (`82e18366`), `spentFirstDay` devenant un fait **requis** de la chaîne. Confirmé au
second run : la bonne cause sort, « dès le matin » se tait, et la ligne de courses reste.

⚠️ **Et mon instrument regardait à côté** : le comparateur montrait la fenêtre, le timing et
les plats — tout ce qui était déjà vert en unitaire — mais pas la phrase. Corrigé aussi
(`6217a81a`).

## 9. ⛔ Ce qui n'est PAS mesuré, nommé
1. ~~La lane foyer n'est pas touchée.~~ **FAIT — voir §11.**
2. ~~Le cas où un seul moment reste à venir n'a pas été joué en run réel.~~ **FAIT — §12.**
3. ~~Le refus `cook_day` n'a pas été vu en run réel.~~ **FAIT — voir §10.**
4. **Aucune migration, aucun déploiement.** Rien n'est poussé.


---

## 10. ⟳ LE REFUS `cook_day` EN RUN RÉEL — la garde la plus importante du lot

**Elle est prouvée.** `plan-COOKDAY-20260904-032948.json`, HTTP 200, empreinte du code
inchangée avant/après.

### ⛔ Pourquoi ce cas est difficile à atteindre, et pourquoi c'est ça qui compte

La garde ne **change** le résultat que si, sans elle, le retrait aurait mordu — donc si tous
les moments déclarés sont passés. Or deux constantes du dépôt s'y opposent :

- la veille de cuisine est **refusée après 18 h** (`SHOPPING_CUTOFF_HOUR`) ;
- le dîner ne « passe » qu'à **21 h** (`SLOT_PASSED_HOUR`).

**Avec les trois repas par défaut, les deux conditions s'excluent.** Il faut donc un rythme
sans repas tardif — quelqu'un qui ne dîne pas — et une heure locale entre 14 h et 17 h.
Vérifié par **simulation des trois fonctions pures avant de dépenser un appel modèle** :
à 15 h avec trois repas, la garde tire mais ne change rien (`slots_remain` aurait suffi) ;
à 15 h sans dîner, elle change tout ; à 22 h, la veille est refusée et on retombe sur
`not_today`.

### La mesure

Fixture `eval0823.solo@keeltest.dev`, **deux** écritures lues avant et restaurées après,
vérifiées dans les deux sens : fuseau `Europe/London` → `Pacific/Kiritimati` (UTC+14, il y
est 15 h 29), rythme trois repas → **petit-déjeuner + déjeuner**.

| | |
|---|---|
| demandé | départ **2026-09-05** + 3 jours |
| servi | **2026-09-04 + 4 jours** → la veille a bien reculé la fenêtre sur aujourd'hui |
| `timing.kind` | **`day_before`**, `lead_day: 2026-09-04` — **la veille est INTACTE** |
| `issues` | **`spent_first_day_kept: cook_day`** — la garde tire, et elle le dit |

Sans elle : `startsOn === today`, petit-déjeuner et déjeuner tous deux passés à 15 h 29 ⇒
le retrait aurait mangé le 2026-09-04, **c'est-à-dire le jour de cuisine lui-même**.

### ⚠️ Ce que le run a montré en passant, et qui n'est PAS de ce lot

La chaîne rend, sur le même jour, **deux raisons concurrentes** :

> « Everything is cooked tonight, Friday: the plan starts a day earlier, and **nothing is
> eaten on that day**. »
> « For today, breakfast and lunch are off the plan: **the day is already under way**. »

La première est la vraie : ce jour est un jour de cuisine, rien n'y est mangé **par
conception**. La seconde donne une raison d'horloge pour une journée vide **par nature**, et
un lecteur ne peut pas savoir laquelle compte.

⛔ **Ce n'est pas une régression de ce lot** : `slotsDroppedToday` se calcule dès que la
fenêtre commence aujourd'hui, ce qui est exactement le cas d'une veille accordée, et c'était
déjà vrai avant le 2026-09-04. **Nommé, pas corrigé** — c'est un arbitrage de copie, pas un
bug, et il appartient à qui décide ce que l'élève lit.

**Autre observation, hors lot** : la fenêtre porte 4 jours dont 3 mangés, et le lundi n'a
**aucun plat**. La chaîne le dit (« No batch keeps until Monday: that day is cooked on the
day »), donc ce n'est pas silencieux — mais ce n'est pas mesuré ici.

---

## 11. ⟳ LA LANE FOYER — portée, et prouvée sur les trois cas

**L'aveu est levé.** Elle recevait `{ dropped: null }` et `spentFirstDay: null` **en dur**.

### La surprise : son ordonnancement ne demandait rien

Sur la lane solo, décider que la journée est finie exige le rythme **corrigé**, parsé
280 lignes **sous** la veille de cuisine — il avait fallu descendre toute la dérivation de
fenêtre. **Ici `eatingRhythm` est déjà résolu bien au-dessus de la veille.** Le retrait se
pose sur place, rien ne bouge. Mesuré avant d'écrire.

⚠️ **Un foyer n'a qu'un rythme**, et c'est déjà vrai avant ce lot : c'est `eatingRhythm` que
la lane passe au prompt et au parseur. Le retrait ne décide donc **rien de nouveau sur les
bouches** — il lit ce que `slotsDroppedToday` lisait déjà.

### Les trois runs réels — empreinte du code identique aux six relevés

| | fenêtre | `timing.kind` | `issues` | plats |
|---|---|---|---|---|
| ① témoin · Londres 02:51 | **3 j** (09-04 → 09-06) | `same_morning` | — | 6 × 3 jours |
| ② cas · São Paulo 22:45 | **2 j** (09-04 → 09-05) | **`starts_tomorrow`** | **`spent_first_day_dropped: thu`** | 6 × 2 jours |
| ③ cook_day · Kiritimati 15:53 | **4 j** (09-04 → 09-07) | `day_before`, `lead_day: 2026-09-04` | **`spent_first_day_kept: cook_day`** | 4 × 2 jours |

- **② garde la fin** : demandé jeu+3 (09-03 → 09-05), servi ven+2 (09-04 → **09-05**).
  Et la phrase corrigée sort : « Thursday was already under way, so the plan starts tomorrow
  and covers 2. »
- **③ est celui qui compte** : la veille est **intacte** alors que les deux moments déclarés
  étaient passés à 15 h 53. Sans la garde, le retrait aurait mangé le jour de cuisine.
- **① compte autant** : sans lui, une garde qui mord toujours ressemblerait à une garde qui
  marche.

### Le câblage tient maintenant les DEUX lanes

Les quatre gardes de source bouclent sur `LANES`. Le débranchement du timing côté foyer
**ne rougissait nulle part** avant : `planTimingOf(lead, cookAhead, { dropped: null })`
compile, et aucun test n'exécute une fonction edge. Trois mutations, trois rouges.

⚠️ La garde d'ordre a dû tolérer **deux écritures** : la lane solo annote
`daysToFill: string[]`, la foyer non. Chercher une ligne littérale aurait fait rougir le
test sur une annotation de type, ce qu'il ne vérifie pas.

### Ce que le poste a coûté, écrit pour la prochaine fois

**Quatre 502 avant les trois bons runs**, et deux causes distinctes qu'il a fallu séparer :
le processus `functions serve` est mort et a été relancé pendant une génération ; puis une
**session voisine écrivait dans `_shared/keel`**, empreinte passée de `e9230b5f` à
`6beb43de` puis `4ab6b1bc` **sous la mesure**. Aucune des deux n'était mon code — et sans
l'empreinte avant/après, j'aurais cherché le défaut chez moi.

⛔ **La règle, une fois de plus** : celui qui génère l'**annonce**, les autres n'écrivent pas
sous `supabase/functions/` pendant ce temps, et le créneau se termine à un **signal**, jamais
à l'estime. Je ne l'avais annoncé qu'à une seule des trois sessions vivantes.

---

## 12. ⟳ UN SEUL MOMENT RESTE À VENIR — la garde s'abstient, et c'est prouvé

**Le dernier trou nommé est fermé.** `plan-UNSEUL-20260904-040331.json`, HTTP 200, empreinte
du code inchangée.

### La frontière, simulée avant de dépenser l'appel

    h=19  passés=[breakfast,lunch]  reste=[dinner]  →  slots_remain, fenêtre 3 jours
    h=20  passés=[breakfast,lunch]  reste=[dinner]  →  slots_remain, fenêtre 3 jours
    h=21  passés=[breakfast,lunch,dinner]  reste=[]  →  RETRAIT, fenêtre 2 jours

La bascule est **exactement** à 21 h — l'heure où `SLOT_PASSED_HOUR` fait tomber le dîner.

### La mesure — `America/Los_Angeles`, 19 h 03

| | |
|---|---|
| fenêtre | **3 jours, 2026-09-03 → 09-05** — elle n'a **pas** bougé |
| `timing.kind` | `same_morning`, `starts_today` |
| `issues` | **aucune trace `spent_first_day`** — le cas ordinaire est **muet**, comme voulu |
| jeudi (aujourd'hui) | **`['dinner']` seulement** — petit-déjeuner et déjeuner retirés |
| vendredi, samedi | les trois moments |

**C'est la démonstration la plus tranchante du lot** : il est 19 h, deux moments sur trois
sont passés, et **la fenêtre est intacte** parce que le dîner est encore devant. La garde ne
mord pas par excès, et elle ne dit rien quand elle n'a rien à dire.

⚠️ Et la phrase reste juste : « For today, breakfast and lunch are off the plan: the day is
already under way. » Cette ligne-là **doit** sortir ici — c'est le cas qu'elle décrit
vraiment. Le lot ne l'a pas fait taire partout, seulement là où le premier jour a été retiré.

### Ce que je n'ai PAS refait, et pourquoi

**Ce cas n'est pas rejoué sur la lane foyer.** C'est le **même appel à la même fonction
pure**, et le câblage foyer est déjà prouvé par ses trois runs du §11. Une génération de
plus pour re-mesurer une fonction identique serait un appel modèle dépensé pour rien.

---

## ✅ ÉTAT FINAL — les quatre états de la garde, tous vus en run réel

| état | ce qui se passe | vu où |
|---|---|---|
| `slots_remain` | rien ne bouge, **muet** | §12 (solo 19 h), §8 témoin, §11 ① |
| retrait | fenêtre raccourcie, fin gardée, **dit** | §8 cas, §11 ② |
| `cook_day` | veille **sauvée**, **dit** | §10 (solo), §11 ③ |
| `single_day` | fenêtre d'un jour gardée, **dit** | §13 (solo 22 h 43) |

**Les quatre états sont vus en conditions réelles.** Aucun n'est plus tenu par la seule
simulation.

---

## 13. ⟳ `single_day` — le quatrième état, et une question produit qu'il pose

`plan-SINGLEDAY-20260904-144343.json` · `Australia/Sydney`, **22 h 43** · fenêtre demandée :
**1 jour** · empreinte du code inchangée.

### La frontière, simulée avant l'appel

    fenêtre=1j  h=22  passés=3/3  →  single_day    · fenêtre gardée à 1 jour
    fenêtre=1j  h=19  passés=2/3  →  slots_remain  · le dîner est devant
    fenêtre=2j  h=22  passés=3/3  →  RETRAIT       · il reste 1 jour

La troisième ligne est celle qui rend le refus nécessaire : une fenêtre de **deux** jours
peut rétrécir à un ; une fenêtre d'**un** jour ne le peut pas sans devenir vide.

### Ce que le serveur a rendu

```json
{ "error": "draft_not_composed", "lock": "disarmed_empty_text",
  "issues": ["spent_first_day_kept: single_day"] }
```

**HTTP 422, en 3,8 s, sans appeler le modèle.** La garde a tiré **et l'a dit** — et c'est
précisément le compteur ajouté plus tôt qui rend ce refus prouvable : sans lui, ce 422 ne
porterait aucune preuve du code qui a tourné.

### ⚠️ CE QUE ÇA POSE, ET QUI N'EST PAS DE CE LOT

La personne qui demande un plan **pour aujourd'hui** à 22 h 43 lit :

> « L'aperçu n'a pas abouti. Rien n'a été enregistré, ton plan n'a pas bougé. »

**C'est un message de panne technique pour une situation parfaitement connue.** La vraie
phrase serait « ta journée est finie, demande demain ». Telle quelle, la personne va
réessayer, obtenir la même chose, et conclure que le produit est cassé.

⛔ **Ce n'est pas une régression de ce lot, et le raisonnement est vérifiable** : sans le
retrait, `slotsDroppedToday` retirait déjà les trois moments d'une fenêtre d'un jour qui
commence aujourd'hui — même composition vide, même 422, même phrase. **La seule chose que ce
lot ajoute à cette réponse est la trace `spent_first_day_kept: single_day`**, c'est-à-dire
la seule information qui permette aujourd'hui de savoir POURQUOI l'aperçu n'a pas abouti.

### ⟳ CORRIGÉ — `day_already_spent` (`eee96226`)

J'avais écrit « nommé, pas corrigé : c'est un arbitrage de copie ». Une session voisine m'a
montré que le dépôt a **déjà la forme exacte** et qu'elle venait de l'appliquer deux fois la
même nuit (`mouth_unfed`, plutôt que réutiliser `empty_meal`). La décision tient en une
question — *est-ce que la personne doit lire autre chose ?* — et ici la réponse est oui :
la phrase actuelle est de la même famille que les deux que ce lot a déjà corrigées.

**Trois fichiers, la forme du précédent** : un `error:` neuf côté serveur, une ligne dans
`EDGE_REFUSAL_KEYS`, deux clés i18n.

> « Ta journée est finie : tous tes repas d'aujourd'hui sont passés. **Demande un plan à
> partir de demain.** »

Elle dit la **cause** et la **sortie** — la précédente ne disait ni l'une ni l'autre.

⛔ **Un troisième littéral, jamais un ternaire dans la clé.** `planRefusals.int.test.ts`
scanne le générateur à la recherche de `error: "…"` **littéraux** : un jeton calculé y
devient invisible, et le mot disparaîtrait de l'écran sans qu'aucun test ne rougisse. Le
pavé sur place l'écrivait déjà.

**Deux mutations, deux rouges, dans les deux sens** : le serveur qui cesse d'émettre le mot
rend la clé **orpheline** ; la table qui perd le mot laisse le refus arriver **sans phrase**.

**Confirmé en run réel** : Sydney 22 h 59, fenêtre d'un jour, HTTP 422 en 3,3 s sans appeler
le modèle, `error: "day_already_spent"`, empreinte du code inchangée.

### ⚠️ Et ce commit a demandé une chirurgie d'index — la leçon du jour

`fr.ts` et `en.ts` portaient **trois hunks d'une troisième session** (cadences de courses,
congélateur, rythme dérivé, shaker). Retirés de l'index par **patch inverse**, contenu
vérifié intact dans l'arbre après coup.

⛔ **Le compte de fichiers ne l'aurait PAS montré** : l'index annonçait exactement mes quatre
chemins. C'est le **compte de lignes** qui a trahi — `+53` et `+88` là où mon ajout fait six
lignes — puis la lecture des **clés** ajoutées. Les deux pièges de l'arbre partagé sont à des
niveaux différents, et il faut les deux lectures :

| niveau | ce qui arrive | ce qui l'attrape |
|---|---|---|
| **fichier** | un voisin a stagé SES fichiers dans l'index partagé | `git diff --cached --stat` : plus de fichiers que de chemins nommés |
| **contenu** | un de MES fichiers porte AUSSI ses lignes | le compte de **lignes**, puis la relecture hunk par hunk |