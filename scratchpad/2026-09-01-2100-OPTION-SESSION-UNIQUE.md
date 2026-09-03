# « Tout cuisiner en une seule fois » — l'option, sa porte, et ce qu'elle a mesuré

> 2026-09-01, lot 3 du chantier « cohérence de la génération de plan »
> (suite de `2026-09-01-SYNTHESE-GENERATION-PLAN.md`, lots 0-1-2).
> `MEAL_PROMPT_VERSION` : **v21 → `meal.en.v22_one_cooking_session`**.

---

## 1. Ce que l'option est — et pourquoi ce n'est pas « un jour de cuisine en moins »

Elle ne choisit pas un jour : elle n'en garde **qu'un** — le premier de ceux qui
sont cochés et que la fenêtre contient (`singleSessionCookDay`). **Trois choses
changent ensemble**, et aucune ne se déduit des deux autres :

| | Avant (v21) | Avec la case (v22) |
|---|---|---|
| Les jours | « they can only cook on: thu, sat » — le modèle répartit | « ALL the cooking … in ONE session, on thu » — une seule entrée dans `cooking_sessions` |
| La conservation | `kept: "freezer"` existe depuis v20, **rien ne la réclame** | « every serving eaten more than 2 days after that session **MUST** carry `"kept": "freezer"` … saying it in the method is NOT enough » |
| Le temps | plafond **sec** : `sessionCeilingMinutes` rend `null` dès que `outOfReachDays === 0` | plafond **ouvert** ×2 : la session porte seule la semaine *par construction* |

⚠️ **Le troisième point est le piège du lot.** Avec un congélateur, la fenêtre
couvre le plan entier ⇒ `outOfReachDays` vaut **zéro** ⇒ l'ancienne condition
rendait `null`, et les 45 minutes déclarées restaient un plafond sec sur la seule
session de la semaine. Le modèle aurait cuisiné **moins** (« cook LESS and put the
rest on another cooking day » — le « rest » n'a nulle part où aller), et l'option
aurait livré des journées vides **en promettant l'inverse**. Un test le tient, et
muté il rougit.

## 2. La porte : le congélateur, et elle est fail-closed

`oneCookingSession = askedOneCookingSession && hasFreezerDeclared(kitchenEquipment)`,
une fois par lane, juste après la lecture de l'inventaire.

`false` (pas de congélateur) et `null` (jamais demandé) rendent le **même refus** :
sans congélateur un lot ne nourrit que trois jours, donc une session unique sur
sept, ce sont quatre journées qu'aucun lot n'atteint — l'option n'est pas « moins
pratique », elle est **fausse**. Le refus est **compté**
(`one_cooking_session_refused`) et **dit** (`plan_rationale`).

## 3. Ce qui a été mesuré — quatre runs réels, `intent: "draft"` (rien d'écrit)

| Compte | Décor | Sortie |
|---|---|---|
| `qa2a.s1` (congélateur), **7 j**, cook `thu+sat`, 45 min | option ON | **20 plats / 20 attendus** (le 21e est une absence déclarée) · `one_cooking_session: 1/1` · `uses_kept_freezer: **9/17**` · session **90 min** (plafond 45×2), **annoncée** |
| `qa2a.s1`, 2 j | option ON | `1/1` · `uses_kept_freezer: 0/3` — rien à congeler sur 2 jours, et c'est juste |
| `qa1v.foyer` (**lane foyer**, congélateur), 3 j, cook `tue+sat`, 55 min | option ON | `1/1` · `uses_kept_freezer: 4/15` · session **105 min** (plafond 110), annoncée · 9/9 plats |
| `qa1a.solo` (**pas** de congélateur), 3 j | option ON | `one_cooking_session_refused: no freezer declared` · 9/9 plats · les jours cochés restent décrits |

Rappel du point de départ (§8 de la synthèse) : *une session, congélateur, sept
jours* rendait **13 plats sur 21**, quatre journées réduites à leur
petit-déjeuner, sans qu'un mot ne le dise.

### Les phrases rendues, telles quelles

> *Everything is cooked on Thursday, in one go: whatever would not keep in the
> fridge until the meal goes in the freezer.*
> *The Thursday session will take 1 hour 30 min rather than 45 min: it is your
> only cooking day, and cooking less would leave days empty.*

Et le refus :

> *One cooking session needs a freezer, and none is declared: the cooking days
> stay the ones you ticked.*
> *You cook on Thursday, and that is what was kept: Tuesday is not in this window.*

⚠️ **Le refus laisse le bloc des jours en place** (deuxième ligne), l'option
honorée le **remplace**. Les faire cohabiter écrirait « tu cuisines jeudi ET
samedi, et c'est ce qui a été gardé » à côté de « tout est cuisiné jeudi » — deux
faits dont un est faux, la famille de défaut que `cookDeclaredDropped` a déjà
coûtée à ce module.

## 4. La porte devait être COLLECTABLE — et elle ne l'était pas

`KitchenEquipmentCard` ne vivait que dans l'entonnoir (`/app/setup`), **une route
sans entrée de nav**. Sur `/app/plan`, quelqu'un qui a un congélateur lisait donc
« il faut un congélateur » sans le moindre endroit atteignable pour le dire —
cicatrice `null-port-hides-the-collection-too`, prise par l'autre bout.

La carte est donc montée sur `/app/plan`, **repliée**, juste sous la case (« Avec
quoi vous cuisinez »). C'est la MÊME carte : elle porte sa garde de chargement,
son refus de sélection vide et son écriture qui **relit** la colonne avant de
fusionner. Vérifié dans le navigateur : cocher « Congélateur » dans le repli
**débloque la case dans la seconde**, et la décocher la **re-décoche toute seule**.

## 5. Ce que le lot ne fait pas

- **Il n'écrit dans aucune colonne.** La case voyage avec la demande
  (`one_cooking_session`), comme le budget et le mode de cuisson : « cette
  semaine-ci, je cuisine une fois » est un arbitrage de semaine, et un réglage de
  profil se rejouerait en silence sur celle où on reçoit du monde.
- **Il n'ajoute aucune session de cuisine** (décision du lot 2, inchangée) : une
  session de plus est une vague de courses de plus.
- **Il ne bloque rien.** Sans congélateur la case est grise et dit pourquoi ; elle
  ne retient aucune étape.

---

# 6. LOT 4 — les jours de cuisine retirés, et « je cuisine la veille »

> Décidé par l'utilisateur le 2026-09-01, après le lot 3.
> `MEAL_PROMPT_VERSION` : v22 → **`meal.en.v23_cook_the_day_before`**.

## 6.1 Ce qui a été retiré, et ce que ça coûtait de ne pas le faire jusqu'au bout

**« Les jours où tu cuisines » n'existe plus sur aucun écran.** Le plan ne
demande plus QUELS jours on cuisine — il pose ses sessions lui-même
(`cookDayLines` sort sur `declared.length === 0`). Ce qui reste de la question
est ce que la personne seule peut savoir, et c'est deux cases : **tout tient en
une fois ?** et **je peux m'y mettre la veille ?**

⚠️ **`cook_days` est ÉCRIT VIDE, pas seulement délaissé.** Cesser de l'écrire
aurait laissé, sur chaque compte ayant répondu, une valeur qui **continue** de
décider ses plans (`cookDayLines`, `addedCookDays`, `daysOutOfBatchReach` la
lisent en base) et que **plus aucun écran ne peut changer**. C'est la pire forme
de `null-port-hides-the-collection-too` : pas un champ qu'on ne peut plus
remplir, une contrainte qu'on ne peut plus lever. Les deux écrivains
(`savePlanInputs`, `savePlanAnswers`) écrivent donc `[]`.

**Trois portes ont dû se désarmer avec lui**, et l'une aurait bloqué le produit :

| | Avant | Après |
|---|---|---|
| `canGenerate` | `missing.push("cook_days")` | retiré — **sinon l'entonnoir retenait POUR TOUJOURS** sur une réponse que plus aucun écran ne permet |
| Registre des questions | `weight: "wrong"`, `branches: ALL` | `weight: "better"`, `branches: NEVER` — l'entrée reste, parce que le moteur LIT encore la clé |
| Avertissement « hors de portée » | ligne sous la rangée des jours | retiré : il se **calculait** sur les jours déclarés, et sans eux il ne peut plus rien annoncer |

## 6.2 « Je cuisine la veille » — la fenêtre recule, et ce jour ne porte rien

`withCookDayBefore` (`meal_plan_window.ts`, pur) : `starts_on − 1`,
`duration + 1`, et le nouveau premier jour devient `cookOnlyDay`.

**Le piège, et c'est tout le lot : la veille est DANS la fenêtre et HORS des
jours à remplir.** Les deux à la fois.

- **DANS** — c'est `daysToFill` qui situe les casseroles les unes par rapport
  aux autres. L'en retirer placerait le lot du rang 0 hors fenêtre, donc
  `not_evaluated`, dont le seuil est **zéro**.
- **HORS** — le modèle ne doit pas y écrire de repas (une phrase le nomme et
  l'interdit), le **plafond de plats** se calcule sur `daysToEat` (le laisser
  sur la fenêtre entière aurait autorisé un jour de plats de plus que le plan
  n'en porte — et le modèle remplit ce qu'on lui autorise), et
  `emptySlotsIn` **saute** ce jour : un vide VOULU rendu comme un trou subi est
  un fait faux.

Deux refus **nommés**, parce qu'ils se réparent par des gestes opposés :
`in_the_past` (le plan commence aujourd'hui) et `no_room` (la fenêtre fait déjà
sept jours). Aucun n'empêche de composer — la fenêtre demandée est servie, et
l'explication dit pourquoi.

## 6.3 Mesuré — quatre runs réels de plus

| Décor | Sortie |
|---|---|
| Solo, congélateur, veille + session unique, demandé jeu→lun (5 j) | fenêtre servie **mer 02/09, 6 jours** · **0 plat le mercredi** · **14/14** sur les cinq autres jours · session mer 75 min (plafond 90), annoncée · `uses_kept_freezer: 10/15` |
| Même décor, run précédent | 14/14, `12/19` congelés — et le **défaut trouvé ci-dessous** |
| Solo, veille demandée sur un plan qui commence **aujourd'hui** | `cook_the_day_before_refused: in_the_past` · fenêtre servie telle quelle · 4/4 plats |
| Écran (`/app/plan` et entonnoir) | la rangée des jours a disparu · les deux cases sont sous les dates · griser/dégriser vérifié dans les deux sens |

### Le défaut que le premier run a trouvé, et que la relecture n'avait pas vu

Run `af04fd89-…` : la **consigne** disait « ONE session, on wed », l'**explication**
écrivait « tout est cuisiné en une seule session », **sans jour**. Motif : la
liste de jours de cuisine de l'explication était calculée **sans la veille**
alors que celle du prompt l'incluait. Deux calculs du même fait, et c'est
l'explication qui avait tort — **la troisième fois** que ce dépôt paie cette
forme, après `usableCookDays` et `addedCookDays`. Corrigé, et épinglé par un
test de source sur les deux lanes.

---

# 7. LOT 5 — trois défauts rapportés sur un plan solo réel

> 2026-09-01, après le lot 4. `MEAL_PROMPT_VERSION` : v23 → **v24**.
> Rapportés par l'utilisateur, et tous les trois vérifiés EN BASE avant d'écrire
> une ligne de code.

| Rapporté | Vérifié | Cause |
|---|---|---|
| « pas l'histoire des barquettes » en solo | plan `96e9a7a2-…` : 4 plats, **`with_box: 0`**. Le plan foyer du même jour : 3 plats, 2 contenants | La lane solo passait `boxMemberIds: []`, ce qui **fermait tout le protocole**. C'était une décision **écrite**, pas un oubli |
| « cuisiner le poulet acheté le lundi, le samedi » | `RAW_WINDOW_DAYS` existe et est juste ; `grocery_waves` date correctement | Le calcul tourne **APRÈS**, à la lecture. **Le modèle ne l'a jamais su** |
| « pas de liste de courses » | la ligne EXISTE (25 articles en base) | Elle ne porte **ni jour ni date**, et le panneau ne montrait ses vagues que s'il y en avait **deux** |

## 7.1 La conservation crue atteint enfin le modèle

`raw_keeping.ts` (pur) ne redéfinit **aucune durée** — `RAW_WINDOW_DAYS` reste la
seule table. Il la traduit en deux choses qui manquaient :

- **`rawReachLines()`** — des **jours nommés** pour la consigne. Le modèle ne
  reçoit pas « la volaille tient deux jours », il reçoit « après mercredi, une
  volaille ne peut plus venir de la première course ». Quatrième application de
  la leçon d'`addedCookDays`.
- **`rawKeepingBreaches()`** — le constat après coup, préparation par
  préparation, qui alimente un compteur et une phrase de `plan_rationale`. Il ne
  **refuse** rien : la sortie honnête (une course plus proche) existe déjà.

⚠️ **Un décalage d'un jour trouvé en écrivant le test** : la règle s'énonçait sur
les jours *qui portent des repas*, par symétrie avec le plafond de plats. Faux —
la première course tombe au rang 0 de la **fenêtre**, donc sur la veille quand il
y en a une. Corrigé, et un test le tient dans les deux sens.

## 7.2 La date part avec la ligne de courses

`shopping_list[].buy_on`, posé par les deux lanes à partir de
`grocery_waves.ts` — **jamais recalculé**. C'est ce qui la fait voyager : écran,
PDF du frigo, liste partageable, bande du soir. Et `plan_rationale` le dit :
*« One shop, on Thursday: everything this plan asks for keeps until it is
cooked. »* Le panneau affiche désormais la date **même à une seule vague** —
`wavesAreMeaningful` ne change pas, sa règle est juste : ce qui manquait n'est
pas un découpage, c'est une date.

## 7.3 Les barquettes en solo — et le second passage qu'il a fallu

Premier passage : `SOLO_BOX_BLOCK`, le **schéma**, dans le prompt système.
Run réel `2235786d-…`, plan solo de sept jours :

```
17 meals take from a batch and NOT ONE carries a box --
17 containers were owed, zero came back
```

⛔ **L'alarme a sonné parce que je l'avais armée** (`roster: 1` sur la lane solo),
et elle disait exactement le patron déjà écrit dans ce dépôt, dans la définition
même de `boxSchemaBlock` :

> « `member_portions` a ces DEUX moitiés et il est rempli 100 % du temps ;
> `for_member_id` n'avait que celle-ci et il est resté à zéro sur douze
> générations. On copie le patron qui marche. »

Un schéma dit qu'une clé **existe** ; il ne dit pas de l'écrire. Second passage :
la moitié **consigne** (`-- WEIGH IT ONCE, INTO CONTAINERS NAMED BY MEAL --`)
dans le message utilisateur, avec son « compte-les avant de répondre ».

⚠️ **Aucun `member_ids` dans les deux moitiés**, et c'est le motif exact pour
lequel la lane n'avait rien : servir un bloc qui nomme des bouches à quelqu'un
qui mange seul lui apprendrait un marquage par personne et l'inviterait à en
inventer un.

## 7.4 MESURÉ — le run de vérification, plan solo de 7 jours

Run `09e1a7f3-…`, `qa2a.s1`, fenêtre jeu 03/09 → mer 09/09, deux sessions
(jeudi, samedi).

| | Avant le lot | Après |
|---|---|---|
| Barquettes | `with_box: 0` sur 4 plats (plan `96e9a7a2-…`) | **16 / 16** — chaque plat qui puise dans une casserole en porte exactement une, aucun n'en manque |
| Couvercle | — | `box_thu_breakfast`, `member_ids: []`, `items: [{preparation_id, term, grams: 270}]` — le jour + le repas disent lequel ouvrir, aucun nom |
| Courses | ni jour ni date | **24 lignes sur 24 datées** · `shopping_waves: 1 (2026-09-03)` |
| Fenêtre crue | jamais dite au modèle | `raw_keeping_needs_later_shop: **0/5** preparations` — le dénominateur est ce qui compte : **les 5 préparations ont été RÉELLEMENT examinées**, donc la jointure terme → groupe tient sur des données réelles |
| Explication | muette sur les courses | *« One shop, on Thursday: everything this plan asks for keeps until it is cooked. »* |

⚠️ **`0/5` n'est pas un compteur qui dort.** Si la jointure entre le terme de la
liste de courses et le groupe d'aliment n'avait pas tenu, le dénominateur serait
**zéro** et non cinq — c'est exactement pour ça que `rawKeepingBreaches` rend
`checked` à côté de `breaches`, et que le compteur sort les deux.

## 7.5 Confirmation indépendante, lane FOYER

Six plans foyer écrits en v24 par une autre session pendant ce lot :
**toutes leurs lignes de courses portent `buy_on`**, les deux compteurs sont en
base, et les contenants du protocole foyer sont intacts (2 à 3 par plan) — le
`soloBoxes: false` n'a rien changé de ce côté.

---

# 8. LOT 6 — les six restes nommés au §7, repris un par un

## 8.1 Le PDF du frigo lit enfin la date — et c'est le seul qui NE PEUT PAS la calculer

`meal-document-v1` fait `select id, mode, dishes, shopping_list, context,
created_at` : **ni `preparations`, ni `starts_on`**. Il lui est donc impossible
de rejouer `grocery_waves.ts`, et il imprimait une liste sans jour — sur la
feuille qu'on emporte au magasin, c'est-à-dire le défaut rapporté, sur papier.

C'est la surface qui justifiait `shopping_list[].buy_on` ; elle le lit
maintenant. Trois sorties, et la troisième est le comportement d'avant :

| | Rendu |
|---|---|
| plusieurs jours | une section par jour, le rayon dedans |
| un seul jour | une **ligne** au-dessus de la liste plate — même arbitrage que l'écran : une vague ne se DÉCOUPE pas |
| aucune date | la feuille d'avant, au caractère près (tout plan écrit avant ce lot) |

⛔ **La garde est « TOUTES datées », pas « au moins une ».** Une liste à moitié
datée découpée par jour laisserait les lignes sans date **hors de toute
section** — et « rien ne disparaît » est la propriété que les vagues tiennent
avant toutes les autres. Un test la tient.

⚠️ **La décision a dû être EXTRAITE pour être testable.** La convention de
`meal_pdf_locale_test.ts`, écrite dans le fichier lui-même, est qu'« on ne relit
pas le texte dans les octets d'un PDF (il est compressé) ». Une règle laissée en
ligne dans `buildMealPdf` aurait donc été une règle que **rien** ne peut
vérifier. `shoppingSections()` est pure ; le rendu ne fait que l'appeler.

⚠️ **Le formatage reste chez l'appelant.** Le module PDF reçoit déjà `dateLabel`
tout fait : il rend, il ne met pas en forme. Lui laisser formater les jours
d'achat aurait fait deux façons d'écrire une date dans le même produit.

## 8.2 La fenêtre crue VUE EN TRAIN DE MORDRE — par rejeu sur données réelles

Le §7 laissait un trou honnête : `raw_keeping_needs_later_shop: 0/N` sur tous les
runs. Le dénominateur prouvait que la jointure tenait, mais **aucun run n'avait
produit d'infraction** — le produit est précisément conçu pour les éviter, et
deux nouveaux runs (dont un forcé avec « roast chicken, steak, fresh fish » en
envie) ont encore rendu `0/4` : le compte visé était végétarien, sa ceinture de
régime a refusé le steak.

Chasser le décor au modèle coûte cher et prouve mal. La preuve juste est le
**rejeu**, que `fridge_window.ts` annonce lui-même comme un usage prévu
(« rejouable hors ligne sur les plans déjà écrits ») : on reprend la liste de
courses et les préparations d'un plan **réellement composé** — pas une fixture —
et on déplace la cuisson.

```
MÊME PLAN, cuisson au JEUDI (rang 0)          MÊME PLAN, cuisson au LUNDI (rang 4)
  examinées : 5                                 examinées : 5
  infractions : 0                               ⛔ prep_thu_cod_potatoes — white_fish tient 1 j
  jours de courses : [03/09]                    ⛔ prep_sat_chickpea_ragu — leafy_greens tient 3 j
  cod fillets → acheter le 03/09                ⛔ prep_thu_oat_egg_squares — leafy_greens
                                                ⛔ prep_sat_oat_frittata — leafy_greens
                                                jours à racheter : [lundi]
                                                jours de courses : [03/09, 04/09, 06/09]
                                                cod fillets → acheter le 06/09
```

**Le cabillaud passe du 3 au 6 septembre** — la veille de sa cuisson, plus le
premier jour du plan. C'est exactement le défaut rapporté (« cuisiner le poulet
acheté le lundi, le samedi »), et il est maintenant inexprimable.

⚠️ **Deux détails que le rejeu montre et qu'il faut lire :**
- le **thon en boîte** reste daté du 03 alors que son groupe est `white_fish`
  (1 jour). Ce n'est pas une faute : son rayon est `pantry`, et
  `PERISHABLE_AISLES` ne route que `produce/protein/dairy`. Les deux signaux se
  combinent, et le résultat est juste ;
- **7 termes d'ingrédient sur ce plan n'ont pas retrouvé leur ligne de courses**
  (`unknownGroups: 7`). Ils sont **ignorés**, jamais rangés du côté sûr ni du
  côté fragile — et le compteur existe pour que ça se voie. C'est une imprécision
  mesurée, pas un silence.
