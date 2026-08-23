# LOT B — L'ÉQUITÉ ENTRE LES BOUCHES

**2026-08-19.** Quatre défauts d'équité, tous décidés par l'utilisateur, tous
traités. **Runs réels consommés : 2 appels de modèle démarrés, 0 abouti** — la
cause est le poste, elle est mesurée, et tout ce qui suit est prouvé autrement
(§6). Aucune campagne.

---

## 0. En une page

| | défaut | état | ce qui le prouve |
|---|---|---|---|
| ① | direction déclarée qui ouvre un plat mais ne pèse aucun gramme | **corrigé** | rejeu des archives + 4 bancs, 2 mutations |
| ② | boîte partagée jamais dimensionnée | **corrigé** | rejeu des archives (avant reproduit à l'octet) + 5 bancs, 4 mutations |
| ③ | éviction toujours au détriment de la même personne | **corrigé** | rejeu des sorties archivées + 4 bancs, 3 mutations |
| ④ | la porte doctrine ferme le dimensionnement par le corps | **corrigé** (arbitrage étroit) | 1 banc, 1 mutation |

**Aucune garde de sécurité n'est desserrée.** Le plancher TCA reste la première
porte partout, la ceinture du mineur ferme avant toute direction, l'âge inconnu
ferme, et aucun chiffre de corps ni aucune calorie n'entre nulle part. Trois
bancs le vérifient *sous* les nouveaux chemins, pas à côté.

---

## 1. ① « Assez de direction pour coûter un plat, pas assez pour peser un gramme »

### L'arbitrage, et pourquoi celui-là

Deux sorties étaient posées par la vérification 3V :

1. **les deux lecteurs exigent la même chose** — une direction sans rythme ne
   fait alors *pas* diverger non plus, et on retire le plat dédié ;
2. **une direction sans rythme reçoit un cran par défaut.**

**J'ai pris la seconde**, et l'utilisateur l'avait déjà orientée (« une
direction déclarée doit peser sur les grammes »). La première rend le produit
plus petit pour réparer une incohérence : elle retire à quelqu'un un plat qu'il
a aujourd'hui, au motif qu'un curseur *qu'on ne lui a jamais montré* n'est pas
réglé.

### Où la dérivation vit, et où elle NE vit pas

⛔ **Pas en base.** Écrire `0,25` dans `household_members.target_pace_kg_per_week`
à l'ajout d'une bouche était la réparation tentante — une ligne dans la RPC qui
manque le champ — et elle casse trois choses :

- un cran **dérivé** deviendrait indiscernable d'un cran **choisi** : l'écran
  l'afficherait comme la réponse de la personne, et plus personne ne pourrait
  compter qui attend encore qu'on lui pose la question ;
- `keel_household_set_member_target(m, null, null)` **efface**, c'est écrit et
  c'est voulu ; un défaut posé en base serait retiré par un geste d'écran, et le
  grammage changerait sans que personne n'ait rien demandé ;
- le plafond réel d'un rythme se calcule **sur le corps** (`paceCeilingFor`) ;
  une valeur en dur serait posée sans lui.

✅ **À la lecture**, dans `mouthTargetFactor` — `DEFAULT_PACE_KG_PER_WEEK = 0,25`
kg/semaine — **avec son propre motif**, `sized_default_pace`, distinct de
`sized`. L'archive d'un plan dit donc toujours lequel des deux a servi.

La RPC, elle, reçoit une **migration de commentaires seulement**
(`20260819140000_une_direction_sans_rythme_pese_deja.sql`, appliquée) qui écrit
l'arbitrage là où la prochaine session ira le défaire, et une garde `do $$` qui
lève si `keel_household_add_member` se met un jour à toucher la colonne.

### Le nombre, et ce qu'il vaut dans les deux sens

0,25 kg/semaine = **275 kcal/jour** demandés, qui traversent `executedPaceFor`
comme n'importe quel cran :

- **perte d'adulte** — 275 est très en dessous d'A1 (500 kcal), donc c'est le
  cran qui décide, jamais le plafond ; le plancher d'énergie du corps reste
  évalué et gagne quand il est plus proche ;
- **prise d'adulte** — la bande `MAX_SURPLUS_FRACTION` (+10 %) est plus basse
  que 275 kcal sous ~2 750 kcal d'entretien, donc le clamp `surplus_band`
  décide : le facteur vaut exactement ce que la composition sait livrer ;
- **mineur** — n'y arrive jamais, la porte ② ferme avant.

⚠️ **Ce n'est pas le maximum, et c'est délibéré.** Saturer A1 donnerait le
déficit le plus creux du produit à quelqu'un qui a seulement coché une case.

### Avant / après, sur le décor archivé (03-foyer-modes, quatre corps réels)

Rejeu de `householdMouthFactors` — aucun modèle, aucun run.

| bouche | objectif | cran | motif objectif | facteur appliqué AVANT | APRÈS | rel. Aurèle |
|---|---|---|---|---|---|---|
| Aurèle 92 kg | `fat_loss` | 0,4 | `sized` | 0,9697 | 0,9697 | 1,000 → 1,000 |
| **Solveig** 55 kg | `muscle_gain` | — | `no_pace` → **`sized_default_pace`** | 1,0435 | **1,1480** | 1,076 → **1,184** |
| **Marceline** 74 kg | `muscle_gain` | — | `no_pace` → **`sized_default_pace`** | 0,9723 | **1,0695** | 1,003 → **1,103** |
| Théodule 9 ans | — | — | `minor` | 0,8268 | 0,8268 | 0,853 → 0,853 |

**Les deux bouches à qui le foyer ouvrait déjà un plat dédié cessent de recevoir
la part de quelqu'un qui ne vise rien** : +10,0 % chacune, exactement la bande
que le moteur exécute pour une prise. Les « 0,3 % d'écart entre deux adultes »
que 3A signalait passent à **10,3 %**. Le mineur ne bouge pas d'un gramme.

⚠️ **Et l'effet est parfois invisible, il faut le dire.** Sur le foyer de
`05-qualite-foyer`, Ivar (88 kg, `trains_hard`, `muscle_gain`, sans cran) passe
bien de `no_pace` à `sized_default_pace` avec un facteur d'objectif de **1,0738**
— mais son facteur *appliqué* ne bouge pas : sa part de fiche seule vaut 1,6134,
et le **rabotage** `BODY_SHARE_FACTOR_MAX` (1,45) mordait déjà avant comme
après. Le lot est armé ; sur ce corps-là, la borne du produit sature avant lui.

---

## 2. ② Les boîtes partagées ne sont pas dimensionnées

### L'arbitrage

Le moteur refusait de couper une boîte partagée — et il a raison :
`dishes[].uses[].box_id` pointerait sur un identifiant que personne ne cite.
**On ne coupe toujours pas.** Ce qui change, en deux moitiés :

**① l'étiquette** — la boîte est pesée à la **moyenne** des facteurs de ses
bouches. `grams` est ce qu'**une** personne sort (`boxingOrderLines` le dit en
toutes lettres), donc le tirage réel de la casserole est `grams × N` ; le
multiplier par la moyenne le porte à `base × Σfᵢ`, c'est-à-dire **exactement**
ce que N boîtes coupées auraient tiré. ⚠️ **La casserole ne gonfle pas** : la
somme est invariante par construction, sans qu'aucun `if` ait à le vérifier.

**② la phrase de table** — `attachSizedQuantities` rend à chaque bouche
`grams × fᵢ / moyenne`, soit `base × fᵢ` : le gramme qu'elle aurait eu dans sa
propre boîte. C'est là que « la part suit le corps » redevient vrai pour un
humain, parce que la phrase est ce qu'il exécute.

Un compteur neuf, `shared_scaled`, sous-ensemble de `shared_mixed` — la
propriété testée `sized + unchanged + shared_mixed === boxes` reste vraie et un
lecteur d'archive garde la même arithmétique.

### Avant / après, sur les plans archivés

Rejeu : `scratchpad/qa-generation/2026-08-19-1200-lotB-replay.ts`.
⚠️ **Le « avant » du rejeu est vérifié contre l'archive**, pas supposé — il
reproduit `sized` / `shared_mixed` des plans réellement écrits, à l'unité :

| run | boîtes | `sized` avant | `shared_mixed` | `sized` après | **`shared_scaled`** | archive (`sized`/`shared`) |
|---|---|---|---|---|---|---|
| plan-1 | 7 | 6 | 1 | 6 | **1** | 6/1 ✅ |
| plan-2 | 22 | 22 | 0 | 22 | 0 | 22/0 ✅ |
| plan-3 | 11 | 11 | 0 | 11 | 0 | 11/0 ✅ |
| plan-4 | 9 | 6 | 3 | 6 | **3** | 6/3 ✅ |
| onedish-1 | 11 | 11 | 0 | 11 | 0 | 11/0 ✅ |

*(plan-5 : la sortie brute archivée ne porte aucune préparation ; il est hors
mesure, et c'est dit plutôt que comblé.)*

**Le cas exact du rapport, plan-4, le quinoa :**

| boîte | bouches | étiquette avant | après | phrase de table après |
|---|---|---|---|---|
| `box_quinoa_shared` | Zoe (23 kg), Lubna (57 kg) | **130 g** aux deux | 95 g | **Zoe 90 g · Lubna 100 g** |
| `box_quinoa_roxane` | Roxane (61 kg) | 102 g | 102 g | Roxane 102 g |
| `box_quinoa_ivar` | Ivar (88 kg) | 189 g | 189 g | Ivar 189 g |

⇒ **L'enfant de 23 kg ne reçoit plus 130 g quand l'adulte de 61 kg en reçoit
102.** Elle en reçoit 90. Et le tirage de la boîte partagée est inchangé :
90 + 100 = 190 = 95 × 2.

Sur les cinq runs, la part des grammes lus à table qui venait d'une boîte non
dimensionnée était de **17,4 %** (mon dénominateur : la somme des phrases de
table ; 5A mesurait 33,8 % sur les grammes servis — les deux disent la même
chose, le mien est plus étroit et plus vérifiable). Elle est désormais **nulle**.

Par bouche, sur l'ensemble des runs : **Zoe −9,3 %**, **Lubna −6,9 %**,
**Roxane −2,0 %**, **Ivar +3,0 %** — l'écart va dans le sens des corps.

---

## 3. ③ Le plafond de plats évince toujours la même personne

⛔ **Je n'ai pas touché au budget.** `mergeDishBonus`, `dishCapFor`,
`dishBudgetFor` et la contradiction « at most 8 » / « 6 extra dishes » sont au
lot C. Ici il ne s'agit que de **qui s'assied**, jamais de combien de places.

### Les deux causes, et il y en avait bien deux

1. **Le rang.** Le rang `1` — le créneau protégé d'une case — allait au *second
   plat écrit*, quel qu'en soit le porteur. Le modèle écrit les bouches dans
   l'ordre du roster à chaque case : le premier nommé prenait donc le créneau
   protégé de **toutes** les cases.
2. **L'éviction.** Un plat de rang 2 qui arrivait ne pouvait **jamais** prendre
   la place d'un autre plat de rang 2 (`keptRanks[p] <= rank ⇒ continue`) : le
   porteur écrit en dernier tombait quoi qu'il arrive, même quand le premier en
   gardait quatre.

### Le correctif

- le rang `1` n'est accordé, **à porteur connu**, que si ce porteur est parmi
  les **moins servis** de la table ; porteur inconnu ⇒ rang `1` comme avant,
  donc **byte-identique** pour toute la population où le modèle ne déclare pas
  `for_member_id` (le cas le plus fréquent) ;
- le rang égal devient éligible à l'éviction, **sous une condition étroite** :
  les deux plats ont un porteur et l'arrivant est *strictement* moins servi —
  c'est-à-dire qu'un plat ne change de main que si l'échange **réduit l'écart** ;
  un plat sans porteur ne peut ni prendre ni céder à rang égal ;
- à l'intérieur d'un rang, l'ordre de sacrifice est : le plat que personne ne
  réclame, puis le porteur qui en a déjà le plus, puis le plus tard écrit (le
  départage d'avant, descendu d'un cran).

⚠️ **Ça termine, et c'est vérifiable** : chaque échange transfère une place d'un
porteur strictement plus servi vers un strictement moins servi.

### Avant / après, sur les SORTIES DE MODÈLE archivées

Rejeu de `parseGeneratedMeal` sur `03-foyer-modes`, plafond historique de 4
retrouvé en cherchant le `dedicatedDishesAsked` qui le rend — pour que ce rejeu
mesure **l'éviction**, pas le budget qui est en vol ailleurs.

| run archivé | avant (archive) | après (rejeu) |
|---|---|---|
| `one_session/run-1` | Aurèle 1 · Marceline 1 · Solveig 1 (pas d'éviction) | 1 · 1 · 1 ✅ *(reproduit l'archive `{6,3,3}`)* |
| `one_session/run-D1` | **Aurèle 2 · Marceline 0 · Solveig 0** | **Aurèle 1 · Marceline 0 · Solveig 1** |
| `separate_sessions/run-1` | **2 · 0 · 0** | **1 · 0 · 1** |
| `separate_sessions/run-2` | **2 · 0 · 0** | **1 · 0 · 1** |

`attributed` ne recule pas (2 partout) : **le même nombre de plats livrés, à
deux personnes différentes.** Trois porteurs pour deux places, quelqu'un reste à
zéro — c'est le **budget**, pas l'éviction, et c'est le lot C.

### ⚠️ La leçon de méthode la plus chère de ce lot

La mutation qui désarme le rang par porteur (`return 1` inconditionnel) **n'a
fait tomber aucun test** sur mon décor synthétique : la porte d'équité de
`sacrificeFor` y rééquilibrait seule. J'ai donc **supprimé la branche**, au nom
de « une branche qu'aucun test ne distingue est une branche qui ment sur ce
qu'elle protège ». Le rejeu des archives, lancé juste après, a rendu **2 · 0 · 0**
— le défaut exact, revenu.

**C'était le décor du banc qui était trop étroit, pas la branche qui était
inutile.** La branche est remise, un banc sur le décor archivé a été ajouté, et
la mutation y mord maintenant. L'histoire est écrite dans le code, au-dessus de
`dishRank`, pour que personne ne refasse la suppression.

---

## 4. ④ La porte doctrine ferme le dimensionnement par le corps

### L'arbitrage — étroit, et sa ligne est nette

Le jeton de la porte ③ est `count_calories` : *« on ne compte pas les
calories »*. Il porte sur un **chiffre mis devant quelqu'un**. Répartir une même
casserole au prorata des corps qui la mangent n'est pas un comptage : rien n'est
énoncé, aucun nombre de corps n'entre nulle part, et ce qui sort est une part de
plat — la grandeur que ce dépôt autorise en toutes lettres.

⚠️ **Et `countingStanceFrom` rend `no_counting` pour DEUX phrases différentes** :
« le coach l'a écrit » et « on n'a pas su lire sa doctrine » (fail-closed). La
seconde n'est la décision de personne. Tant que ③ fermait la part de fiche, une
**panne de lecture de doctrine** rendait à l'enfant de 23 kg la boîte de
l'adulte de 61 kg — un défaut d'infrastructure servi à table sous le nom d'une
méthode pédagogique.

**Ce que je change :** `bodyShareFactors` dépasse `doctrine_no_counting` exactement
comme il dépassait déjà `minor`, en rejouant la même chaîne (jamais en recopiant
un `if`).

**Ce que je ne change pas :** la porte ③ reste **entière** sur
`mouthTargetFactor`. Un coach qui ne compte pas garde exactement ce qu'il a
demandé — aucun déficit, aucun surplus, aucune cible pour personne de sa cohorte
— et ce qu'il perd est seulement le droit de faire manger à un enfant la part
d'un adulte.

> **La ligne : la position du coach gouverne une CIBLE ; elle ne gouverne pas
> qui reçoit le plus grand creux de la même casserole.**

### Avant / après, doctrine « on ne compte pas », décor 3V

| bouche | facteur appliqué AVANT | APRÈS | motif part / objectif |
|---|---|---|---|
| Aurèle 92 kg | 1,0000 | **1,1574** | `sized` / `doctrine_no_counting` |
| Solveig 55 kg | 1,0000 | **1,0435** | `sized` / `doctrine_no_counting` |
| Marceline 74 kg | 1,0000 | **0,9723** | `sized` / `doctrine_no_counting` |
| Théodule 9 ans | 1,0000 | **0,8268** | `sized` / `minor` |

Avant, les quatre recevaient **la même boîte**. Le rapport enfant/adulte passe
de **1,000** à **0,714**. Et la chaîne d'objectif reste fermée pour tout le
monde : **aucun déficit, aucun surplus** ne traverse.

### ⚠️ Une conséquence assumée, à connaître

`weightGroupCount` compte désormais **4 poids** au lieu de **1** sous une
doctrine `no_counting` : le brief de ce foyer dit maintenant « cette table est
servie en 4 poids, donc 4 boîtes par préparation », comme n'importe quel autre.
**Ce n'est pas un comptage** — aucun chiffre de corps, aucune calorie, aucun
rapport entre deux personnes n'entre dans le prompt ; c'est de la logistique de
casserole. Mais **c'est un octet de prompt qui change pour la population des
coachs qui ne comptent pas**, et il fallait le dire. Le banc l'épingle.

---

## 5. Les mutations — chaque garde vue mordre

Toutes appliquées sur le code réel, banc relancé, puis restaurées.

| # | mutation | banc | résultat |
|---|---|---|---|
| M1 | `DEFAULT_PACE_KG_PER_WEEK` passé à `0,8` | `target_grams_test` | **1 rouge** |
| M2 | un seul motif : `reason: "sized"` toujours | `target_grams_test` | **2 rouges** |
| M3 | boîte partagée pesée au facteur de la **1ʳᵉ** bouche | `target_grams_test` | **3 rouges** |
| M4 | la phrase ignore les facteurs (`share = grams`) | `household_body_share_test` | **1 rouge** |
| M5 | éviction : retour à `keptRanks[p] <= rank` | `household_merge_test` | **3 rouges** |
| M5b | équité sans la comparaison des tallies | `household_merge_test` | **1 rouge** |
| M6 | `dishRank` aveugle au porteur (`return 1`) | `household_merge_test` | **1 rouge** *(après ajout du banc archivé — voir §3)* |
| M7 | ④ : `coachCounting` repassé dans la seconde passe | `household_body_share_test` | **3 rouges** |
| M8 | le générateur appelle `attachSizedQuantities` sans facteurs | `household_body_share_test` | **1 rouge** |
| M9 | la porte du recollage referme sur `sized` seul | `household_body_share_test` | **1 rouge** |
| — | témoin (code réel) | les trois bancs | **0 rouge** |

Et **trois bancs vérifient l'absence de desserrage** *sous* les nouveaux
chemins, pas à côté : le plancher TCA sous `no_counting`, la ceinture du mineur
avec un cran dérivé et une direction déclarée, l'âge inconnu sous `no_counting`.

---

## 6. Les runs réels — 2 appels démarrés, 0 abouti, et pourquoi

⛔ **Aucun plan n'a été produit.** Consigné dans
`05-qualite-foyer/lotb-2/NOTES.md`, avec les trois dossiers d'entrée.

| tentative | HTTP | durée | modèle |
|---|---|---|---|
| `lotb-1` | 500 | 5 s | **aucun appel** — mort avant le modèle |
| `lotb-2` | 502 | 12 s | `attempt_start` 10:10:54, jamais de `success` |
| `lotb-3` | 502 | 16 s | `attempt_start` 10:13:37, jamais de `success` |

**La cause, mesurée :** le conteneur `supabase_edge_runtime_Sophia_2` est
**recréé toutes les 30 à 70 secondes** par le `functions serve` d'une session
voisine. Six sondes `docker inspect -f '{{.State.StartedAt}}'` à 20 s
d'intervalle : `10:13:56 · 10:13:56 · (inspect échoue, le conteneur n'existe
plus) · 10:15:01 · 10:15:01 · 10:15:28`. Une génération de foyer prend 30 à 60 s.
Kong était patché à 600 s et revérifié avant la première tentative ; le runtime
avait été redémarré après modification des `_shared`. **Ce n'est ni le produit
ni Kong**, et le briefing commun l'interdit explicitement comme conclusion.

Je m'arrête là : la consigne de coût dit deux runs au maximum, deux appels de
modèle ont été démarrés, et le troisième aurait été payé pour mourir de la même
façon.

### ⚠️ Un piège d'instrument rencontré, à ajouter au dossier

Les `request_id` `b0000001` à `b0000005` **avaient déjà servi la nuit du
2026-08-18**. `model.txt` affichait donc les lignes d'appels d'hier sur un run
qui n'avait rien appelé — **un vidage qui a l'air plein sur un run vide**.
Détecté par une contre-épreuve horodatée (`where created_at > '2026-08-19 10:05'`,
une seule ligne). **Ne jamais se fier au `request_id` seul.**

### Ce qui remplace le run

Le branchement — la seule chose qu'un run aurait prouvée de plus — est tenu par
un **test de source** sur `generate-household-meal-v1/index.ts`
(`household_body_share_test.ts`, « LE GÉNÉRATEUR PASSE BIEN LES FACTEURS À LA
PHRASE ») : il vérifie que `sizingFactors` est bien passé à
`attachSizedQuantities` et que la porte du recollage lit `shared_scaled`. Il a sa
**prémisse vérifiée** (la source a bien été lue) avant ses assertions — sans
quoi un extracteur cassé le rendrait vert en ne regardant rien. M8 et M9 le font
tomber.

---

## 7. Contrôles

- `deno test` — **3 724 passés, 0 échec** sur `_shared/keel/*_test.ts` moins
  `meal_boxes_test.ts`, exclu parce qu'il ne **compile pas** : il appelle
  `buildHouseholdPromptBlocks` sans le champ `ruleHolders` ajouté par un autre
  lot en vol (`household_meal_generation.ts`, +325 lignes non commitées). Rien à
  voir avec ce lot.
- `npx tsc -b --force` (frontend) — **vert** à 12:07.
- Front `vitest` — **4 échecs / 1670 passés à 12:07**, exactement les quatre
  connus et étrangers (`coverage-guard` : 55 fonctions edge contre 52 déclarées ;
  `household.int.test.ts:323`). **C'est le chiffre du briefing, et c'est celui
  que je rends.**
  ⚠️ **Le banc s'est dégradé pendant ce lot, et ce n'est pas moi.** À 12:27 il
  rendait 58 échecs et `tsc` était rouge sur `MouthFormDialogProps` /
  `HouseholdPage.tsx` / `SetupPage.tsx` ; à 12:30, 55 échecs sur **quatre
  fichiers** : les deux connus, plus `mouthFormDialog.int.test.ts` et
  `allergens.int.test.ts`, tous deux plantant à l'intérieur de
  `MouthFormDialog.tsx:879`. Ce fichier a été modifié **29 secondes avant** mon
  premier banc rouge par une autre session, mi-édition (lot allergènes / lot
  formulaire de bouche). **Je n'ai touché aucun fichier du front** — mon
  périmètre est `supabase/functions/**` et une migration.
- `supabase migration up` — `20260819140000` appliquée, registre vérifié
  (`20260819140000 > 20260819100000`), commentaire relu en base.
- `docker restart supabase_edge_runtime_Sophia_2` fait après modification des
  `_shared`, fraîcheur prouvée par observation du log de démarrage.

---

## 8. Ce que je remonte sans trancher

1. 🔴 **Le plafond de récipient sous-compte les boîtes partagées, avant comme
   après ce lot.** `sizeBoxesFromTarget` somme les boîtes **une fois** par
   préparation, alors qu'une boîte partagée par N bouches en tire `grams × N`
   — et il ne multiplie pas non plus par le nombre de repas où la boîte est
   reprise (5A l'a mesuré : `box_dahl_standard` tirée 10 fois pour 8 parts
   annoncées, `sum_over: 0`). Mon lot ne change ni le sens ni la portée de ce
   plafond : la moyenne conserve la somme, donc il ne l'aggrave pas. **Mais il
   reste faux**, et c'est un lot à part.
2. **Le rabotage `BODY_SHARE_FACTOR_MAX` sature avant la chaîne d'objectif.**
   Sur Ivar (88 kg, `trains_hard`), la part de fiche seule vaut 1,6134 : le
   produit est raboté à 1,45 avec ou sans le cran dérivé. Le correctif ① est
   donc **inerte sur les corps extrêmes**, et ce n'est pas un défaut de ce lot
   — c'est la question « les bornes de part sont-elles au bon endroit ? », que
   je ne tranche pas.
3. **La doctrine `no_counting` voit désormais un brief de boîtes différent**
   (§4, `weightGroupCount` 1 → 4). C'est la conséquence assumée de ④ ; si
   quelqu'un juge que le coach doit aussi gouverner la logistique des boîtes,
   c'est **là** qu'il faut renverser, pas dans la part.
4. **`no_pace` a changé de sens le 2026-08-19.** Il voulait dire « personne n'a
   réglé le curseur » ; il veut dire maintenant « aucun écart n'est exécutable
   sur ce corps » (un corps déjà sous son plancher d'énergie). Un plan archivé
   *avant* cette date qui porte `no_pace` dit l'ancienne phrase. C'est écrit sur
   le jeton, dans le code.
5. **`doctrine_no_counting` a quitté `BODY_SHARE_REASONS`**, et le jeton est
   laissé **en commentaire** dans la liste : les plans archivés le portent, et
   le garder actif en ferait une colonne structurellement à zéro.
6. **Trois porteurs pour deux places restent trois porteurs pour deux places.**
   L'éviction est équitable ; le nombre de places est le lot C. Tant qu'il n'a
   pas livré, quelqu'un reste à zéro sur une fenêtre courte — mais plus jamais
   la même personne à chaque case.

---

## 9. Le périmètre touché

| fichier | ce qui change |
|---|---|
| `_shared/keel/household_portions.ts` | ① `DEFAULT_PACE_KG_PER_WEEK` + motif `sized_default_pace` ; ② moyenne sur boîte partagée + part par bouche dans `attachSizedQuantities` (+ `shared_scaled`) ; ④ dépassement de la porte ③ dans `bodyShareFactors` |
| `_shared/keel/meal_generation.ts` | ③ `dishRank` par porteur + `sacrificeFor` équitable ; lecture du porteur remontée avant le rang, refus nommés laissés en place |
| `generate-household-meal-v1/index.ts` | ② branchement : `sizingFactors` passé à la phrase, porte ouverte sur `shared_scaled` |
| `supabase/migrations/20260819140000_…sql` | ① commentaires seuls + garde `do $$` ; **aucune donnée, aucun privilège, aucun `CHECK`** |
| 3 bancs (`target_grams`, `household_body_share`, `household_merge`) | 12 tests neufs |

⛔ **Non touchés**, comme demandé : `mergeDishBonus` et le budget de plats,
`allergen_catalog.ts`, `keel_output_locks.ts`, `dietary_regime.ts`,
`doctrine_loader.ts`, `MealBuilder.tsx`, et l'ensemble du front.

**Rien n'est commité** — 550+ fichiers du dépôt appartiennent à d'autres
sessions.
