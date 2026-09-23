# Qualité nutritionnelle d'un plan de foyer — revue du 2026-09-21

> **Point de départ.** Le plan `3e121b21` (3 bouches, 5 jours, budget 200 €)
> servait 100 % de l'énergie de chacun, et un nutritionniste l'aurait refusé :
> Fabrice (perte, 59 ans, IMC 31) à 1,1 g/kg de protéines SOUS son plancher ;
> Thomas (prise, 72 kg) à 2,75 g/kg par un goûter de thon en boîte chaque jour ;
> deux légumes sur toute la semaine (oignon, poivron), 167 à 221 g par jour et
> par bouche ; de la saucisse à 4 repas sur 8 ; aucun poisson pour deux bouches
> sur trois ; la même casserole mercredi midi et soir.

## 1. Les neuf points, et où ils vivent

| # | Défaut mesuré | Ce qui change | Où |
|---|---|---|---|
| 1 | Le plafond de Thomas bornait la table SOUS le plancher de Fabrice (« 37 g, not more » pour un plancher de 43 g par déjeuner) | Sur une case partagée, le plancher le plus exigeant écrit la recette ; la bouche dont le plafond cède le voit sur sa carte et dans la garde | `sharedProteinCaps` (`floorG` requis, `floorWins`, `floorCells`), `proteinBriefFor` (`tableFloorCells`, `ceilingYielded`) |
| 2 | Le plafond n'avait ni cause ni consigne pour les collations | Cause `protein_ceiling_over` (comptée, jamais bloquante), tolérance 10 %, même dénominateur que le plancher ; réparation « retire chez ce qu'il mange seul d'abord » ; carte : « a snack … carries the figure of its line and not more » | `final_plan_gate.ts` (`PROTEIN_CEILING_TOLERANCE`), `final_plan_audit.ts` (`dayCeilingG`, `coveredCeilingG`), `plan_defect_pass.ts`, `plan_repair_loop.ts`, `plan_validation.ts`, front `planValidation.ts`, `PROTEIN_CONSEQUENCE` |
| 3 | 167 à 221 g de légumes par jour, deux espèces | Règle : 150 g de légumes crus par part de déjeuner et de dîner, quatre légumes différents ; compté | `household_meal_generation.ts`, `plan_food_quality.ts` |
| 4 | Saucisse à 4 repas sur 8 chez l'homme en perte | La charcuterie est une graisse : un plat sur sept jours ; viande rouge : trois repas sur sept, deux sur cinq ; liste fermée de 89 slugs | idem |
| 5 | Zéro poisson à table, tout le thon dans les goûters d'une bouche | Un plat partagé de poisson par cinq jours, un poisson gras par sept ; thon deux fois par personne et par semaine | idem |
| 6 | Même casserole midi et soir, quatre petits-déjeuners identiques | Jamais le même pot deux fois le même jour à la même personne ; deux bases de petit-déjeuner | idem |
| 7 | « Très léger le matin » : 535 kcal servies | Le levier existe déjà : la case « repas léger » de la fiche (`household_member_habits.light`, `LIGHT_SLOT_WEIGHT`). La note de brouillon ne l'écrit pas ; il faut cocher la fiche | rien de nouveau, constat |
| 8 | Maintien de Christèle au haut de la bande ; Thomas à 0,45 kg/sem | Un maintien lit le bas de sa bande de séances ; le gabarit d'une prise est 0,5 % du poids par semaine (adulte) | `meal_envelope.ts` (`sessionsEdgeFor`, `SPORT_SESSIONS_PER_WEEK_LOW`), `weight_pace.ts` (`MAX_WEEKLY_BODY_FRACTION_UP`) |
| 9 | La table visait la densité du gros mangeur (154 au déjeuner) | La visée d'une case partagée est le plus BAS `preferred`, ramené sur le plancher commun ; la carte dit avec quoi remplir l'assiette selon la direction | `household_portions.ts` (`cellDensityOf`), `household_prompt_v34.ts` (`directionFoodsOf`, méthode étape 3) |

Le point 8 **renverse en connaissance de cause** l'ouverture du 2026-08-18
(prise jusqu'à 1 % du poids, 0,5 kg en avertissement). Décision du
propriétaire du 2026-09-21 ; le mineur garde son gabarit d'avant.

## 2. Mesure — un run réel, même foyer, même fenêtre, même consigne

| | `3e121b21` avant | `e67eeeec` après |
|---|---|---|
| Cible Thomas / Fabrice / Christèle (kcal) | 3 386 / 2 192 / 1 981 | 3 276 / 2 192 / 1 944 |
| Protéines Thomas (g/j, g/kg) | 198 · 2,75 | 175 · 2,43 |
| Protéines Fabrice (plancher 108) | 102 · 1,10 · 18 % | **125 · 1,35 · 23 %** |
| Protéines Christèle | 92 · 1,6 | 111 · 1,9 |
| Collations de Thomas (protéines) | 74 g (thon 137 g/j) | 27 g (yaourt, pomme, cacahuètes) |
| Légumes non féculents (g/j) | 167 à 221 · 2 espèces | **316 à 418 · 4 espèces** + 270 à 370 g de pommes de terre |
| Charcuterie | 4 plats | 0 |
| Poisson à table | 0 | saumon 2 dîners, crevettes 2 déjeuners |
| Même pot midi et soir | oui (mercredi) | non |
| Bases de petit-déjeuner | 1 | 2 |
| Visée de la case déjeuner | 154 kcal/100 g | 140 |
| Assiette de Fabrice au déjeuner | 570 g | 600 g |
| Petit-déjeuner de Christèle | 535 kcal | 456 kcal |
| Liste de courses | 16,1 kg · 103 € | 22,2 kg · 144 € |
| Garde | 7 écarts | 15 écarts (`protein_ceiling_over` 6, `cell_bounds_off` 8, `ingredient_not_bought` 1), livrable |

## 3. Ce qui reste, avec ses chiffres

- **Thomas dépasse encore son plafond** de ~20 % (175 g pour 144, tolérance à
  158). Ses collations tiennent la carte ; ce sont les casseroles partagées
  qui sortent ~15 % plus denses en protéine que demandé (56 g au déjeuner
  pour « 34 to 49 »). La réparation de `protein_ceiling_over` ne touche pas
  une casserole partagée, par décision : la baisser ferait descendre Fabrice.
- **Le canal « féculent seul dans sa boîte » n'existe pas.** `member_deltas`
  est une trace, jamais appliquée aux boîtes. C'est le seul levier qui donne
  au gros mangeur son énergie sans sa protéine ; c'est un lot à part.
- **Le compteur `food_quality` du premier run réel lisait `meal`**, où les
  boîtes des plats tirés d'une casserole n'existent pas encore
  (`main_servings: 0`). Corrigé : il lit `writePayload`.
- **`cell_bounds_off` × 8** : avec 270 à 370 g de pommes de terre, le dîner de
  Thomas sort à 726 g pour une assiette bornée à 700 ; l'énergie est juste.
- **Le budget a monté** de 103 à 144 € (saumon, crevettes, parmesan) pour
  200 € demandés : le plafond tient.

## 4. Second run réel après la correction du compteur — `07f4d9d9`

Même foyer, même fenêtre, même consigne, 173 s. Le compteur lit désormais la
ligne écrite : `food_quality.vegetables = { main_servings: 27, under_floor: 14,
distinct: 8, min_g_per_mouth_day: 111 }`, `fish = { shared_mains: 2,
fatty_dishes: 3, tuna_servings_max_per_mouth: 1 }`, `red_meat = { main_dishes:
2, cap: 2 }`, `charcuterie = { dishes: 0 }`, `repetition = { same_pot_twice_a_day:
0, breakfast_bases: 5 }`. Huit légumes (brocoli, poivron, tomate, épinard,
carotte, haricot vert, laitue, ail), saumon deux fois à table, sardines et
thon le vendredi, zéro charcuterie, 167 € pour 200.

**Et la protéine part dans l'autre sens :** Thomas 230 g (3,2 g/kg), Fabrice
156 g (1,7 g/kg, 28 % de l'énergie — très bien en perte), Christèle 135 g
(2,3 g/kg, +16 % sur son plafond). Entre le run `e67eeeec` (175 / 125 / 111)
et celui-ci, le modèle a écrit ses casseroles deux fois plus riches en
protéine que la carte (1 060 g de dinde dans un pot de 3,5 kg). La cause
`protein_ceiling_over` l'a compté 8 fois sur 15 journées-bouche ; la
réparation n'y peut rien tant qu'elle ne touche pas une casserole partagée.
**Le prochain lot est là :** quand TOUS les mangeurs d'une casserole sont
au-dessus de leur plancher, la baisser est sûr, et c'est le seul geste qui
ramène le gros mangeur sous son plafond sans affamer l'autre.

## 5. Les courses : le repli choisit les dates qui congèlent le moins

> Rapporté sur le plan en cours `64abd449` : « jambon : acheté à la première
> course et congelé en rentrant », avec deux courses lundi et mardi.

La conservation datait trois vagues : lundi (la grosse course), mardi (les
sardines du goûter de mercredi, fenêtre crue d'un jour), mercredi (le jambon du
goûter de vendredi, fenêtre de deux jours). « Peu importe » vaut le haut de
l'offre, deux courses sur cinq jours. Le repli (`planGroceryWaves`, lot C)
gardait **les deux premières dates** et reversait la troisième sur la
dernière gardée en la congelant. Lundi et mercredi tenaient pourtant tout au
frais : un article s'achète n'importe quand entre sa date la plus tôt et son
jour de cuisson, et le repli ne savait qu'avancer un achat, jamais retarder
une course.

**Ce qui change** (`grocery_waves.ts`) : la première date reste ; les autres
sont choisies parmi les jours de la fenêtre pour couvrir au frais le plus
d'articles, à égalité celles qui n'abandonnent aucun incongelable sur une
vague à part, puis les plus tôt. Ce qu'aucune date gardée ne couvre est
congelé à la dernière date gardée avant sa fenêtre, comme avant. À une seule
course, rien ne change. La phrase du plan nomme désormais la course où l'on
congèle (`plan_rationale.ts`), au lieu de dire « la première » à tort.

**Rejoué sur le plan réel** avec ses lignes et ses casseroles : sans repli,
lundi, mardi, mercredi ; avec deux courses, **lundi et mercredi, rien à
congeler**, les sardines et le jambon partent mercredi.

Ce qui reste : le goûter de vendredi de ce plan s'appelle « Sardines… » et
contient du jambon, un titre recopié par le modèle que rien ne compte.

## 6. Relecture du brouillon `c1ce4658` et second lot de règles

Quatre jours, deux sessions, rien au congélateur, 109 €. Ce qui n'allait pas,
et ce qui le ferme :

| Constat | Règle (prompt) | Compteur (`food_quality`) |
|---|---|---|
| Les deux sessions tombaient le matin d'un jour de semaine : le déjeuner puisait dans une casserole cuite le jour même | La session est le SOIR ; le premier plat qui puise dans une casserole cuite le jour J est le dîner de J ; un déjeuner puise dans une casserole d'un jour d'avant ou est un plat sans cuisson ; seule exception, un plan qui commence aujourd'hui avec les courses du matin (méthode, étape 2) | `timing.lunch_from_same_day_pot`, `of_which_first_day` |
| 300 g de maquereau par part, deux jours de suite ; 1 265 g de dinde pour 925 g de couscous | Une part de viande, volaille ou poisson fait 100 à 150 g crus, jamais plus | `animal_protein.max_g_raw`, `over` (cap 150) |
| 5,3 kg de petits-suisses, 350 g dans un bol, 235 g dans un goûter, 12 plats sur 20 | Laitages frais 250 g par personne et par jour, 150 g dans une collation ; aucun ingrédient dans plus de la moitié des plats | `dairy.*` (caps 250 et 150), `ingredients.top_slug`, `max_share` |
| Casserole dinde-couscous sans légume, garnitures de 28 g | Les légumes sont DANS la casserole, 150 g crus par part ; une garniture de 20 ou 30 g n'est pas le légume du plat | `vegetables.under_floor` (existant) |
| Thomas à +56 % du plafond, ses cases seules déjà justes | La réparation dit, plat par plat, s'il est à lui, partagé et abaissable (chaque autre bouche de la case à 10 % au-dessus de son plancher), ou partagé et intouchable | `RepairDayContext.dishes[].shared`, `sharedLowerable` |

Non traité, dit tel quel : un remplacement composé le soir commence demain
et l'ancien plan est retiré (`retired_at`) en entier, dîner du soir compris.
C'est une décision de produit et une RPC, pas une règle de recette.

## 7. Relecture du brouillon `94c93ca9` et troisième lot

Les cinq règles du §6 ont mordu : aucun déjeuner tiré d'une casserole du
jour, plus grosse part animale 170 g (342 avant), petits-suisses 1,2 kg
(5,3 avant), collations à 12–13 g de protéines, légumes 300 à 390 g par jour,
courses mardi et jeudi sans rien congeler. Protéines 168 / 119 / 106 g.

Ce qui restait, et ce qui le ferme, décision du propriétaire :

| Constat | Règle (prompt) | Compteur (`food_quality`) |
|---|---|---|
| Du thon au petit-déjeuner, 195 g de tofu au réveil | **Pas de poisson le matin ni l'après-midi, sauf contre-ordre** (carte ou note) ; ni viande au petit-déjeuner et en collation ; leur protéine vient des laitages, œufs, noix ou un peu de tofu, au chiffre de la carte | `fish.outside_mains` |
| Maquereau, saumon ×2, sardines en quatre jours | Poisson gras dans deux plats au plus par sept jours ; le reste est maigre ou coquillage | `fish.fatty_cap`, `fatty_over` |
| Un pot de bœuf servi trois fois | Un pot de viande rouge nourrit deux plats au plus | `red_meat.max_draws`, `draws_over` |
| Légumes à 150 g pile, 120 sur la plus petite assiette | Écrire le pot pour que la PLUS PETITE part de la table porte encore 150 g : viser 200 g par part | `vegetables.under_floor` (existant) |
| « Courses et cuisson dès le matin, pour être prêt à midi » sur un plan dont le déjeuner se prépare sans cuisson | Fait `firstDayLunchNeedsCooking` (requis) dans `plan_rationale` ; sinon « Courses dès le matin : le déjeuner se prépare sans cuisson, la cuisine est le soir » | — |

Et le compteur de laitages ne compte plus le lait (`MILK_SLUG_PREFIX`) :
602 g comptés pour 251 g de petits-suisses et 351 ml de lait.

## 8. « Il n'y a pas de repas mardi midi » : la reprise de case refusée en silence

Rapporté à 20 h 51 : la note est classée en CASE (`cells: [tue/lunch]`), la
lane `edit_cells` est appelée… sans `replaces`. Sur un brouillon qui remplace
le plan en cours, la garde de chevauchement la refuse en 600 ms
(`plan_overlaps_existing`), avant tout tour de modèle. Le composeur de
brouillon portait `replaces` depuis le matin ; la reprise de case, non.
Corrigé : `editCells` transmet `opts.replaces`, la page le lui passe, un
test de câblage le tient. La reprise de case reçoit bien le plan de base
entier (`source_meal`) et coûte un tour de modèle : 40 à 60 s, plus la
réparation. Une reprise qui revient en une seconde est un refus, pas une
reprise.

Et la case était vide à la source : le modèle n'avait rien écrit mardi midi,
premier déjeuner d'un plan dont la session est le soir ; la réparation a
échoué deux fois (`no_improvement`). Ajouté à la méthode (étape 3) : une case
listée reçoit un plat, une case vide n'est jamais une réponse, sans casserole
c'est un plat sans cuisson.

## 9. La reprise de case refusait la case vide — rejouée en réel le 2026-09-21, 22:05

Rejoué avec la requête exacte de l'écran (`edit_cells`, mardi midi, base
`d65f57e2`, `replaces` posé) : le modèle répond en 42 s et rend 20 plats
contre 19 — il a écrit le déjeuner de mardi. Puis `mergeCellEdit` le jette :
« connue » voulait dire « le plan de départ y a un plat », et la case était
vide par construction. Refus `cell_unknown`, 409, « Ce repas-là n'est pas
dans cet aperçu ».

Corrigé : la fusion reçoit le calendrier du foyer (`householdGrid.cells`
avec au moins un mangeur) ; une case listée est connue, avec ou sans plat.
`filled` compte les cases prises depuis le vide (trace `cell_edit`). La
consigne de reprise dit au modèle qu'une case listée sans plat est une case
vide à écrire, jamais une réponse. Trois cas testés : rendue ⇒ prise et
`filled`, non rendue ⇒ `notRendered`, sans calendrier ⇒ toujours `unknown`.

Les essais de la soirée avant celui-ci n'ont pas atteint ce refus :
`94829551` a vu le modèle ne pas répondre en 350 s (repli `gpt-5.6-sol` tué
à 400 s par la limite du worker) ; les trois d'avant ont été tués par les
redémarrages du runtime (écritures parallèles sous `supabase/functions/`).

## 11. La reprise vérifiée sur les données, et les doses par personne — 2026-09-21, 22:45

**La reprise `a74f96af` (mardi midi) :** la case est remplie (thon, pain
complet, houmous, tomate, laitue, poivron, sans cuisson, une dose par
personne, à la table du dépôt : Thomas 977 kcal / 58 g de protéines,
Fabrice 873 / 52, Christèle 778 / 46 ; l'écran, sur la table du back, dit
996 et 893). Les 19 autres plats sont les mêmes recettes ; les
sessions de cuisine sont identiques ; la liste de courses a absorbé le
déjeuner (3 boîtes de thon, 265 g de houmous, 265 g de laitue, +470 g de
pain, +369 g de tomate, +132 g de poivron). Le moteur a re-dosé tout le
plan depuis les cibles kcal : 69 des 158 doses des plats non touchés ont
bougé, 16 de plus de 5 % (le poulet du mercredi midi de Thomas 300 → 343 g,
la clémentine du vendredi 112 → 84 g), le merlu 512 → 500 g. La garde finale
compte 9 écarts non bloquants contre 8 sur la base : la case vide a
disparu, deux `protein_ceiling_over` de plus le mardi (Thomas, Fabrice) —
le thon-houmous est dense en protéines sur une journée déjà au plafond.

**Les doses par personne :** un plat qui ne tire sur aucune préparation
(`uses` vide) n'est dans aucune session ; sa carte montre désormais « Les
doses par personne » — le prénom, les grammes de chaque ingrédient, et le
kcal quand le back l'émet (`meal-energy-v1` ne l'émet que pour une bouche
avec une direction : refus `no_direction` pour Christèle en maintien). Un
plat qui tire sur une casserole garde « Les boîtes à sortir ». Vérifié à
l'écran sur le plan et sur l'aperçu.

**À regarder ensuite :** le kcal affiché sous le titre d'un plat (572,
109, 893) est une moyenne par membre du foyer (total ÷ 3) : sur une
collation que seul Thomas mange, la carte dit 109 kcal quand sa dose dit
328. La dose est juste, le chiffre du titre ne l'est pas pour un plat à
une seule bouche.

## 12. Le chiffre sous le titre d'un plat — 2026-09-21, 23:00

Règle posée sur `DishCard` : une seule personne à table ⇒ son chiffre sous
le titre (celui de son contenant, émis par `meal-energy-v1` pour une bouche
avec une direction) et la ligne ne le répète pas ; plusieurs ⇒ aucun chiffre
global, chacun sa ligne. Le `energy` du serveur (`planEnergy`, recette ÷
`servings` du plan) ne se rend plus que sans contenant et à une personne au
plus : c'est le plan solo, où la division vaut 1. Le calcul serveur n'a pas
été touché ; sa moyenne par membre reste dans la réponse, elle n'est plus
lue là où elle mentait (109 kcal sous une collation à 328, 893 sous un
déjeuner à trois).

## 13. « Ajuster le plan » sur un aperçu repris — 2026-09-22, 00:00

Mesuré à 00:00:19 (heure locale) : la phrase « Pas autant de petit suisse le
matin… » a été lue (5 préférences rangées), puis la recomposition a été
refusée en 800 ms, sans trace (`bad_window`, « start in the past », qui ne
journalise rien). Cause : l'aperçu repris après rechargement recomposait
avec `draftInput()` de la page — un « aujourd'hui » calculé avant minuit,
ou, quand les plans étaient chargés, la fenêtre SUIVANTE (26 sept → 2 oct)
sur un brouillon qui remplaçait le plan courant. Rejoué à 00:04 dans mon
navigateur : accepté et composé… sur la mauvaise fenêtre (`c6fd5cd6`,
expiré à la main, jamais montré).

Corrigé : `recoverLatestDraft` relit `request_body` (`readComposeInput`) et
l'aperçu repris garde SA demande ; `onCompose` et `onEditCells` passent par
`windowFromToday` — une fenêtre qui a commencé hier part d'aujourd'hui et
perd les jours passés. Tests unitaires sur les deux lecteurs, câblage
épinglé.

## 14. Les lignes de mémoire partaient sans verbe — 2026-09-22, 00:20

Le réglage « Pas autant de petit suisse le matin, mets des bols de flocons
d'avoine avec du lait d'avoine… » rejoué (`6ef02747`) : accepté, composé,
et raté. Le prompt portait, sous « facts about their week… honour them » :
« petit suisse -- ONLY AT breakfast » (food.exclude) et « flocons d'avoines
-- ONLY AT breakfast » (food.prefer), mot pour mot la même forme ; et
« tofu, poissons au petit déjeuné » (food.exclude du 21). Le modèle a gardé
le petit-suisse et servi trois petits-déjeuners au tofu. Une ligne de bouche
porte son sens (`reachSuffix`), celle de la table ne portait rien.

Corrigé (`retained_items_routing.ts`, `TABLE_LINE_VERB`) : « OFF the
table: », « wanted: », « not this way: », « this way: » devant le texte des
lignes de la table. Rejoué (`8134dc21`, 113 s) : plus un petit-suisse ni un
tofu, deux petits-déjeuners en bols de flocons d'avoine. Suite backend à
7646.

**Reste ouvert.** « lait d'avoine » est servi en lait de soja : `oat_milk`
existe dans le référentiel mais n'entre pas dans le catalogue envoyé au
modèle (plafond par groupe, `over_group_cap`). Un aliment VOULU devrait
être épinglé dans le catalogue. « graines » de même. Et le classifieur range
« Pas autant de petit suisse » en `food.exclude` (un degré, pas une
exclusion) et « tofu, poissons au petit déjeuné » en un seul item composite
— c'est le chantier mémoire.

## 15. Les aliments voulus s'épinglent dans le catalogue — 2026-09-22

**Pourquoi ça ne se faisait pas.** Deux objets distincts. Les PRÉFÉRENCES
(ce que la note de retour range, ce que « Ce que Sophia sait » affiche)
partent au modèle en texte, et depuis la §14 avec leur verbe. Le CATALOGUE
est autre chose : la tranche du référentiel (121 aliments sur 945) que le
modèle a le droit de citer, choisie par popularité d'alias et plafonnée par
groupe (`CATALOG_GROUP_CAPS`, `whole_grain` : 8 sur 27). Rien n'y lisait
les préférences ; `oat_milk` avait zéro alias et n'y entrait jamais. Le
modèle l'a dit lui-même dans « Les choix de Sophia » : « Le lait de soja
remplace le lait d'avoine dans les bols, car c'est la référence disponible
pour chiffrer les ingrédients de cette cuisine. »

**Ce qui est fait.** `buildCompositionCatalog` reçoit `pinned` (requis) :
un aliment voulu passe au-delà du plafond de son groupe et du plafond total ;
la sécurité passe avant l'épingle (exclu par régime, allergène, interdit,
non composable ⇒ dehors, compté). Au site d'appel, les `food.prefer` des
souvenirs de note sont résolus par le référentiel (`resolveIngredient`) ;
les textes non résolus sont journalisés (`pinned_unresolved`). Une seule
porte pour les goûts confirmés en conversation (les voix) — le test de
câblage l'a rappelé, et le second chemin a été retiré.

**Le référentiel et le résolveur.** Migration `20260922001000` : alias pour
« lait d'avoine » (8 formes), « graines » → mélange de graines, « amendes »
→ amandes. Le résolveur accepte l'article de tête (« du lait d'avoine ») et
le pluriel fautif du dernier mot (« flocons d'avoines »), sans toucher aux
formes existantes.

**Mesuré (`d52f0c5c`, 214 s)** : `pinned_slugs` = fruit, oat_milk,
mixed_seeds, almonds ; `pinned_over_cap` = 1 ; deux petits-déjeuners en
flocons d'avoine, lait d'avoine et graines mélangées. Suite backend à 7649.

**Reste ouvert.** Le jeudi, Christèle reçoit une omelette alors que
« lesoeufs » (sic) est exclu pour elle : le classifieur a rangé la faute
telle quelle, et ni la ceinture ni le modèle ne reconnaissent « lesoeufs ».
Le classifieur devrait normaliser l'aliment (« œufs »). Et « Ce que Sophia
sait » n'affiche pas le moment d'une préférence (« petit suisse » sans « au
petit-déjeuner »). Les quatre souvenirs créés par mes rejeux ont été retirés
du magasin.

## 16. « Ce que Sophia sait » montre le moment d'une préférence — 2026-09-22

Le lecteur front (`retainedItems.ts`) ignorait `occasion` : la page disait
« petit suisse » sans « au petit-déjeuner », et — pire — une édition ou une
suppression depuis la page réécrivait le magasin sans le moment. Corrigé :
le type porte `occasion`, le lecteur le lit (jeton hors vocabulaire ⇒
`null`), l'écriture le garde, la carte l'affiche (« · Petit-déjeuner
seulement », namespace `slot` de la page). Le résolveur accepte aussi
l'article de tête et le pluriel fautif du dernier mot (§15). Suite front à
2 685 avec les 2 rouges préexistants.

## 17. Le curseur de perte va jusqu'à 0,8 kg par semaine — 2026-09-22

Décision du propriétaire, mesurée sur Fabrice (93 kg, perte). Le curseur
s'arrêtait à 0,45 kg/sem : ce n'était pas un calcul du corps mais le plafond
A1 (`MAX_DAILY_DEFICIT_KCAL`, 500 kcal/j = 500 × 7 / 7 700 = 0,4545). A1
passe à 880 kcal/j (0,8 kg/sem). Les deux autres bornes tiennent : le
plancher d'énergie (1 500 kcal pour un homme, 1 200 pour une femme) et la
fraction du corps (1 %/sem). Conséquence mesurée : le plan de Fabrice était
servi à 2 200 kcal quand sa dépense est de 2 400 à 2 600 ; il pourra viser
plus bas.

Une seconde ceinture mordait : `BOX_FACTOR_MIN` à 0,70 déclarait
« implausible » toute assiette sous 70 % de l'entretien, ce qu'un rythme de
0,8 kg/sem produit dès que l'entretien est sous 2 930 kcal (Fabrice :
0,695). Abaissée à 0,55 : au plancher d'énergie, une assiette vaut 58 % de
l'entretien (1 200 sur 2 080), et la ceinture ne garde que l'absurde.

Vérifié à l'écran : « Ajouter une personne », homme de 93 kg en perte, le
curseur va à 0,80 kg par semaine. Le formulaire « informations
personnelles » d'un membre existant, lui, n'a ni poids visé ni curseur :
le rythme d'une bouche ne se règle qu'à sa création ou dans l'entonnoir.
Tests mis à jour : le cas du design (60 kg) passe de 0,45 à 0,6, borné par
le corps ; l'arrivée à 55 kg passe du 10 novembre au 20 octobre.

---

## 2026-09-22 — LOT A1 · le riz fantôme sort du total du jour

**Le fait.** `generate-household-meal-v1` écrit, par bouche, un delta
`{ food_ref, grams }` dans `generated_from.household.member_deltas` (canal
FF-043 `more_of_the_same`). `_shared/keel/plan_energy.ts` lisait le delta du
**lecteur** et l'**ajoutait** au total de chacune de ses journées
(`entry.kcal += addon.kcal`). Sur le brouillon
`6e4e5548-e518-475f-abe2-338652f4e1dc`, le lecteur `6f591eaf-…` recevait
**1 373 kcal par jour** — environ 390 g de riz blanc cru.

**Pourquoi c'est un chiffre faux et pas un chiffre imprécis.** Ce riz n'a
**aucune boîte**, **aucune ligne de courses**, **aucune carte**. Il n'existait
que dans une somme. La page du plan annonçait **3 792 à 3 900 kcal/jour** là où
les boîtes du même lecteur font **3 266 à 3 292**, et où la fourchette que la
même réponse affiche dit **3 204–3 348**.

**Ce qui a été retiré.** `MemberAddon`, `memberAddonEnergy`, le paramètre
`addons` de `planEnergy`/`planEnergyAtTolerance`, le champ `DayEnergy.addonKcal`,
`readViewerAddons`, le champ `addon_kcal` du fil, `DayEnergyView.addonKcal`, la
branche d'écran `meals.energy.day_with_addon`, et — faute de cause — l'abstention
`household_portions_not_numeric`, dont la seule condition de déclenchement était
l'absence de cette trace. Le **générateur n'est pas touché** : il continue
d'écrire `member_deltas`, qui n'a plus aucun lecteur.

## 2026-09-22 — LOT A1-bis · le total du jour est la somme des boîtes du lecteur

**Ce que le retrait a mis au jour.** Sitôt l'add-on parti, `days[].kcal` est
tombé à **2 419–2 527**, soit **847 kcal SOUS** les boîtes qu'il chapeaute. La
réponse de `meal-energy-v1` porte deux calculs étrangers l'un à l'autre, rendus
sur le même écran :

| | source | ce que le nombre décrit |
|---|---|---|
| `days[].kcal` | `planEnergy` | le **tronc** : les plats du jour pliés, divisés par `servings` — une part standard, celle de personne |
| `boxes[].kcal` | `boxEnergies` | les **grammes nommés** de chaque bouche, ceux que `BoxTable` affiche ligne à ligne sous ce total |

L'add-on n'était pas le pont entre les deux : sa grandeur se calculait contre un
écart d'**enveloppes** (`m.envelope.energy.low - trunk.energy.low`), pas contre
ce que les boîtes livrent, et il dépassait l'écart réel de 526 kcal (1 373 contre
847). Le retirer laissait le titre plus faux qu'avant, dans l'autre sens.

**La règle posée.** Sur un plan de foyer, quand le lecteur a des boîtes ce
jour-là, le total de sa journée **est** la somme de ses boîtes — rien d'autre.
Le dénominateur devient le nombre de **ses** boîtes, pas le nombre de plats du
plan. Quand il n'en a aucune (bouche sans direction, `refused.no_direction`), le
tronc reste tel quel : un zéro se lirait « cette journée ne te nourrit pas ».
`meals_out` et `subject` ne bougent pas — ce sont des comptes de repas, pas des
énergies.

`EmittedBox` porte désormais `day`, pris sur `BoxEnergy`. Sans lui, le seul moyen
de regrouper les boîtes d'un jour était de découper `box_id`
(`box_wed_lunch_15_<member>`) — un matcher maison sur une chaîne composée
ailleurs.

**Mesure, run réel local du 2026-09-22** (`meal-energy-v1`, brouillon
`6e4e5548`, lecteur `6f591eaf-…`, trois appels, une édition entre chacun) :

| jour | A0 `kcal` (+ add-on) | A1 `kcal` (tronc nu) | A1-bis `kcal` | somme des boîtes du lecteur |
|---|---|---|---|---|
| wed | 3792 | 2419 | **3266** | 3266 |
| thu | 3900 | 2527 | **3292** | 3292 |
| fri | 3854 | 2481 | **3270** | 3270 |
| sat | 3809 | 2436 | **3283** | 3283 |
| sun | 3868 | 2495 | **3274** | 3274 |

Fourchette annoncée : 3 204–3 348. Les cinq journées y entrent désormais ; aucune
n'y entrait avant. Compteur du branchement sur ce run
(`keel.meal_energy.day_origin`) : `from_boxes: 5`, `from_trunk: 0`,
`boxes_summed: 25`. `addon_kcal` n'existe plus dans la réponse.

**⚠️ Ce que ce lot ne corrige pas.** Les deux calculs existent toujours et rien
ne les compare : `planEnergy` reste le chemin d'un plan personnel et du repli.
Le raccord est une substitution à la sortie, pas une réconciliation.

## 2026-09-22 — LOT A2 · le rythme se règle enfin sur la fiche d'un membre

**Ce que le point 8 avait laissé ouvert.** Le resserrement du 2026-09-21
(`MAX_WEEKLY_BODY_FRACTION_UP`, 0,5 %/semaine en prise) a déplacé deux bornes
sans donner à personne de quoi s'y ranger. Le cadre « Informations
personnelles » d'une bouche déjà inscrite (`household.member.frame_identity`,
`HouseholdPage.tsx`) n'avait **ni poids visé ni curseur de rythme** — le
curseur existait à deux endroits, l'entonnoir et la fiche d'ajout, et manquait
exactement là où l'on corrige quelqu'un qui est déjà là. Mesuré sur le foyer de
test `ihu@gmail.com` :

| bouche | corps | direction | en base avant | borne de son corps | ce que le moteur cuisinait |
|---|---|---|---|---|---|
| Fabrice (`b90ec30c-…`) | 93 kg · 173 cm · 59 ans | perte | 0,45 kg/sem | **0,80** | 0,45 (`chosen`) |
| Thomas (`6f591eaf-…`, titulaire) | 72 kg · 187 cm · 28 ans | prise | 0,45 kg/sem | **0,35** | **0,35** (`slider_ceiling`) |

Les deux défauts ne sont pas le même. Fabrice était **figé sous sa borne** et
aucun écran ne pouvait l'y amener. Thomas, lui, avait un curseur — et ce
curseur affichait **0,35**, parce que `paceControlFor` rabat le cran sur le
plafond du corps. Trois nombres coexistaient donc sans qu'aucune phrase ne les
relie : **0,45 en base**, **0,35 à l'écran**, **0,35 dans la casserole**.

**Ce qui est livré (front seul, aucune migration).**

- `TargetAndPaceFields` — le composant unique du dépôt, celui de l'entonnoir —
  est **monté** dans le cadre d'identité d'une bouche, **sous** le bloc du
  corps : son plafond est borné par ce corps, et le placer au-dessus ferait
  pointer `pace_needs_body` vers un bloc situé plus bas. Rien n'est recopié :
  une seconde lecture de `paceControlFor` ferait deux écrans qui divergent au
  premier correctif.
- Deux lectures nouvelles sur `/app/household`, maître seul, `null`
  fail-closed : `loadMemberTargets` (la paire, sur `household_members`) et
  `loadMemberBirthDates` (la date — le roster ne la rend jamais, et sans bande
  d'âge `estimatedMaintenanceKcal` rend `null`, donc le curseur retombe sur
  `needs_body`).
- L'écriture passe par `keel_household_set_member_target`, appelée **après** la
  direction : `household_members_target_needs_direction_check` refuse une cible
  chiffrée tant que `goal` n'est ni `fat_loss` ni `muscle_gain`.
- **La cible d'une bouche QUI A UN COMPTE n'est pas touchée ici** (D1) : elle
  vit dans `student_goals`, et le moteur lit `household_members` **en premier**
  — y écrire poserait, sur la colonne prioritaire, un nombre que la personne
  n'a pas réglé. La fiche du titulaire garde `ownTargetWriter`.
- Une phrase nouvelle sous le curseur, dans les deux packs
  (`household.mouth.pace_executed`), rendue **seulement** quand
  `executedPaceFor(...).clampedBy` n'est pas `chosen` : « Enregistré à 0,45 kg
  par semaine. Le plan n'en cuisine que 0,35 — au-delà, ce corps n'a plus de
  marge. » Elle lit le **brouillon brut**, pas `paceControl.value` : le cran
  rabattu rendrait toujours `chosen`, c'est-à-dire une garde désarmée qui
  ressemble à une garde qui marche.

**Deux gardes, et ce qu'elles coûteraient sans.**

- `targetsLoaded` — le cadre ne monte le curseur que sur une lecture faite.
  `keel_household_set_member_target` **remplace** la paire : monté sur du vide
  non lu, il afficherait « pas de poids visé » sur une bouche qui en a un, puis
  l'effacerait au premier Enregistrer.
- `targetWriteIsBlind` — `targetPayloadOf` rend `(null, null)` dans deux cas
  étrangers l'un à l'autre : une direction qui ne bouge pas (effacer est alors
  le geste légitime) et un **corps inconnu**, où aucun contrôle n'est à l'écran.
  Le second est nommé et l'écriture est sautée.

**Preuve au navigateur, 2026-09-22, pile locale, compte `ihu@gmail.com`.**

| | avant | geste | après, **relu après rechargement complet** |
|---|---|---|---|
| Fabrice | curseur absent ; `0,45` en base | curseur poussé à sa butée, Enregistrer | « **0,80 kg par semaine** », `max="0.8"`, `value="0.8"` ; `household_members.target_pace_kg_per_week = 0.8` ; date d'arrivée passée du 13 avril 2027 au 19 janvier 2027 |
| Fabrice (aller-retour) | 0,8 | curseur redescendu à 0,25, Enregistrer | base = `0.25`, relu `0.25` après rechargement — puis remonté à `0.8` |
| Thomas | curseur à 0,35, rien qui l'explique | aucun | « 0,35 kg par semaine » **+ « Enregistré à 0,45 kg par semaine. Le plan n'en cuisine que 0,35 — au-delà, ce corps n'a plus de marge. »** ; `student_goals` porte toujours 0,45 |
| Christèle (`maintenance`) | — | ouverture de la fiche | **aucun bloc, aucun curseur** — la balance ne bouge pas, rien n'est demandé |

**⚠️ Ce que ce lot ne fait pas.** Il ne **répare** pas la ligne de Thomas : sa
paire reste à 0,45 en base tant qu'il n'enregistre pas sa propre fiche
(`persistMouth` y écrirait alors le cran rabattu, 0,35, et la phrase
disparaîtrait). Le choix est délibéré — une écriture faite à l'ouverture d'un
écran est une donnée changée sans geste. Il ne touche pas non plus au moteur :
`executedPaceFor` décidait déjà 0,35 avant ce lot comme après ; ce qui change
est qu'on le **voit**.

## 2026-09-22 — LOT B · le plafond protéique, sur les plats mangés seul

**Ce qui est livré.** `_shared/keel/protein_ceiling_adjust.ts` (module pur) et
son appelant `adjustPlanProteinCeiling` (`plan_proportion_units.ts`), branché
dans `generate-household-meal-v1/index.ts` sur les deux chemins, **après**
l'ajusteur de densité et **avant** la garde finale (`runProteinCeilingPass`).
Pour chaque journée-bouche au-dessus de `proteinCeilingGFor` au-delà de
`PROTEIN_CEILING_TOLERANCE`, la passe déplace des grammes d'une ligne protéique
(`PROTEIN_GROUPS`) vers un féculent ou un gras du **même** plat, à énergie
constante, sur les seuls plats d'une case à un mangeur. Jamais d'ajout, de
retrait ni de remplacement d'ingrédient ; jamais un plat partagé. Compteurs dans
`generated_from.protein_ceiling.adjust` (`adjusted_mouth_days`, `moved_g`,
`residual_over`, et leurs dénominateurs). Tests : 19 cas du module, 8 épingles
de câblage.

**⚠️ Un écart assumé avec le lot D** : dans un corps culinaire mobile à
plusieurs lignes, chaque ligne est un levier (`lines_free_inside_body` le
compte). Le modèle déclare un seul composant `main` par petit-déjeuner ; la
règle du facteur commun rendait la passe inerte sur les cases mêmes qu'elle
vise.

**Mesure, deux runs réels du 2026-09-22** (foyer `ihu@gmail.com`, fenêtre du
23 au 27 septembre, même demande que `6e4e5548`) :

| brouillon | journées au-dessus avant la passe | ajustées | grammes déplacés | arrêt | `residual_over` | `protein_ceiling.over` sur les boîtes |
|---|---|---|---|---|---|---|
| `b982ce3d` | 3 / 15 | 0 | 0 | `no_solo_unit` × 3 | 3 | non écrit (voir ci-dessous) |
| `f48f6802` | 5 / 15 | 5 | 300 | `reverted_after_measure` × 5 | 5 | 5 / 15, pire +25 % |

**Ce que ces deux runs disent.**

1. Sur `b982ce3d`, les trois journées au-dessus ne mangent **que** des plats
   partagés ce jour-là : la passe n'a rien le droit de toucher. C'est le cas que
   seul le lot C traite.
2. Sur `f48f6802`, la passe agit puis s'arrête sur les cinq journées au premier
   pas que la mesure ne confirme pas. Rejoué hors ligne sur le repas stocké
   (`source_meal`) : dans ce référentiel, le yaourt porte ~40 g de protéine pour
   1 000 kcal et l'avoine ~34 g. Un pas de 5 g de yaourt vers l'avoine, à kcal
   constantes, retire ~0,03 g de protéine — sous l'arrondi au dixième de
   `measureFresh` (−5 g de yaourt : 52 → 51,8 g ; +5 g d'avoine : 52 → 52,6 g).
   La mesure lit « pas de baisse », et la passe défait le pas. **Le levier
   produit laitier → céréale est faible par nature sur ces petits-déjeuners**,
   et l'arrondi le coupe avant qu'il n'ait produit son peu.

**⚠️ Ce qui reste.** L'arrêt `reverted_after_measure` sur un pas plus petit que
l'arrondi de la mesure est un défaut de la passe, pas une propriété du plan : il
faut juger un pas contre la résolution de la mesure (ou mesurer sans arrondi),
pas contre une baisse stricte. Non corrigé ici. Et même corrigé, le levier ne
fermerait pas +25 % : c'est la table qui porte l'excès.

**Artefact de banc, pas du produit.** `b982ce3d` a composé 4 minutes puis
échoué à l'écriture (`draft_store_unavailable`, raison `draft_not_running`) :
le `x-request-id` envoyé par `uuidgen` était en MAJUSCULES, la ligne l'a stocké
tel quel dans `request_id` (texte), et
`keel_household_complete_draft_generation` compare à `p_request::text`, qui sort
en minuscules. Le front envoie `crypto.randomUUID()` (minuscules) et n'est pas
touché ; un client qui enverrait des majuscules perdrait chaque composition.

## 2026-09-22 — LOT C · le féculent à côté sur les cases partagées

**Le mécanisme visé.** Sur une case partagée, la densité protéique de la
casserole est celle du plancher le plus exigeant à table (`sharedProteinCaps`,
« le plancher gagne ») et un facteur unique la servait telle quelle à chaque
bouche. L'homme en prise de masse héritait, à ~3 300 kcal, de la densité écrite
pour l'homme en perte.

**Ce qui est livré.**

- **C1, consigne** (`standardRecipeBlock`, `household_meal_generation.ts`) : un
  déjeuner ou dîner mangé seul reste une assiette en UN plat ; un déjeuner ou
  dîner **partagé** est une préparation principale (protéine, légumes, sauce)
  **et** son féculent en préparation à part, un composant `separable_side`, le
  plat `uses` les deux ; le `run_through` dit de cuire le féculent à part et de
  poser les deux côte à côte dans chaque boîte. La phrase voisine « la
  casserole porte ses légumes » exempte la casserole-féculent.
- **C2, dimensionnement** (`_shared/keel/starch_side.ts`, pur) :
  `starchSideOf` retient la casserole-féculent si le modèle la déclare
  `separable_side` **et** si le référentiel le confirme (au moins une ligne dans
  un groupe féculent, aucune dans un groupe protéique) ; `proteinLaneAt` donne
  le couloir d'une bouche à sa case (son plancher et son plafond du jour ÷
  énergie composée du jour × énergie de sa part — la règle de trois de
  `sharedProteinCaps`) ; `splitStarchSide` choisit deux facteurs sur la droite
  d'énergie constante — la casserole principale vise la borne franchie, le
  féculent porte le reste. Bornes : principal 0,6–1,5 × le facteur uniforme,
  féculent 0,4–2,5 ×, et la masse de l'assiette (le pas s'arrête à la borne de
  masse, il n'est pas annulé). `EaterRowForApply.starchSide` (requis,
  nullable) porte les deux facteurs jusqu'à `applySizingForEaters`
  (`partFactorOf`), et jusqu'à la passe du lot B.
- **Brief protéique** (`proteinBriefFor`, paramètre requis
  `starchAsideCells`) : sur une case à féculent à côté, la borne haute d'une
  bouche reste son propre plafond ; le plancher de la table ne la fait plus
  céder.
- **C3, affichage** : aucun changement de code. `applySizingForEaters` écrit
  déjà un item de boîte par casserole tirée, et `BoxTable` rend un item par
  ligne. Les courses sont construites depuis les lignes des préparations : la
  casserole-féculent y entre d'office.
- Compteurs dans `generated_from.household.portion_sizing` : `two_pot_cells`,
  `starch_carried_kcal`, `starch_side` (`refused`, `outcomes`, `rows_split`,
  `protein_moved_g`). Les lignes par plat (`starch_side_rows`, seau et grammes)
  restent au journal. Tests : 19 cas du module, 1 d'application, 1 de brief,
  5 épingles de câblage.

**Mesure, runs réels du 2026-09-22** (foyer `ihu@gmail.com`, même demande) :

| brouillon | état | cases à 2 casseroles | lignes partagées | `protein_ceiling.over` (boîtes, sans tolérance) | garde finale `protein_ceiling_over` (tolérance 10 %) | `protein_floor_short` | `ceiling_yielded_slots` |
|---|---|---|---|---|---|---|---|
| `6e4e5548` | avant tout | — | — | 9/15, pire +46 % | 9 | 0 | — |
| `f48f6802` | lot B seul | — | — | 5/15, pire +25 % | 4 | 5 (Fabrice, 85–96 %) | 25 |
| `58ce432d` | C, compteurs non aiguillés | 8/10 (lu sur les boîtes) | non mesuré | 7/15, pire +42 % | 5 | 0 | 10 |
| `44c61a40` | C, masse en veto | 7 (1 `single_pot`) | 9 / 21 | 4/14, pire +15 % | **2** (Thomas +15, +15) | 5 (Fabrice, 88–97 %) | 10 |
| `505f8d7f` | C, masse en borne | 8 (2 `single_pot`) | 15 / 24 | 6/15, pire +31 % | 4 (Thomas +10 à +31) | 1 (Fabrice, 97 %) | 10 |

Sur `505f8d7f`, jeudi midi, **la même casserole** de poulet rôti aux légumes
(donc la même densité) : Thomas 240 g + riz 455 g, Fabrice 294 g + riz 205 g,
Christèle 226 g + riz 322 g. 545 kcal portées par le féculent sur le plan,
32,4 g de protéine déplacés. Visible à l'écran dans « Ce que ça donnerait »,
Session de cuisine → Boxing : chaque contenant sur deux lignes.

**Ce que la mesure dit.**

1. **Le modèle suit la consigne** : 8 déjeuners/dîners partagés sur 10 arrivent
   en deux casseroles avec un `separable_side` ; les 2 autres sont des assiettes
   froides sans casserole (`single_pot`). Aucun refus `side_not_starch`.
2. **Le couloir par case est atteint quand aucune borne ne mord.** Sur
   `44c61a40`, 4 lignes de Thomas sur 7 finissaient `mass_bound` : son assiette
   uniforme pèse 676–693 g pour un maximum de 700, et le féculent cuit est moins
   dense en kcal que la casserole principale. D'où le passage de la masse de veto
   à borne (`505f8d7f` : 2 `mass_bound`, 6 `bounded`).
3. **Le plafond du JOUR n'est pas tenu pour autant** : Thomas reste au-dessus
   sur 4 jours sur `505f8d7f`. Ses cases partagées sont dans leur couloir ou
   bornées ; l'excès vient de ses repas mangés seul (la passe B cale,
   `reverted_after_measure` × 4) et de ses grandes assiettes, où les bornes de
   rapport (0,6) et de masse (700 g) arrêtent le pas.
4. **Le critère du lot (`over ≤ 2/15`) n'est atteint que sur un run sur trois
   mesurés** (`44c61a40`, garde finale). Le résultat varie avec ce que le modèle
   compose.
5. `ceiling_yielded_slots` passe de 25 à 10. Les 10 restantes sont les
   petits-déjeuners partagés (5 jours × 2 bouches) : pas de casserole, pas de
   féculent à séparer.

**⚠️ Ce qui reste.**

- Le couloir est **par case**. Rien ne compense, sur les cases partagées, ce
  que les repas mangés seul ont dépassé. Un couloir de journée (plafond du jour
  moins ce que les plats solo apportent, réparti sur les cases partagées)
  fermerait l'écart restant de Thomas — non fait.
- Les grandes assiettes de la prise de masse : 161 g de saumon aux légumes pour
  503 g de couscous (`505f8d7f`, vendredi soir). C'est dans les bornes posées
  (principal ≥ 0,6 × uniforme) ; ces bornes sont un choix, à relire avec un
  regard culinaire.
- Les petits-déjeuners partagés gardent la densité du plancher le plus exigeant.
- `protein_floor_short` de Fabrice existait avant ce lot (`f48f6802`) et varie
  d'un run à l'autre ; C le réduit quand la case le permet (`to_floor`), sans le
  fermer.

## 2026-09-22 — LOT C bis · le couloir de journée

**Ce qui est livré.** `dayProteinLanes` (`_shared/keel/starch_side.ts`) : pour
chaque journée-bouche, ce que la journée peut encore porter une fois retirée la
protéine de tout ce que la bouche mange HORS cases à deux casseroles se répartit
sur ses cases à deux casseroles, au prorata de leur énergie :

    couloir_i = (borne couverte du jour − protéine du reste) × T_i / Σ T

Les bornes du jour sont celles du contrôle final (`proteinFloorAllocation`,
plancher et plafond COUVERTS, apports fixes déduits une fois), appelée DANS le
module — un appel de plus dans `index.ts` aurait volé l'ancre de
`output_contract_wiring_test.ts`, qui épingle la première occurrence. Le reste
se mesure avec l'arithmétique du dimensionnement (part standard × facteur) ; un
plat dont la protéine se tait rend la journée illisible, et la journée retombe
sur le couloir par case (`starch_side.day_lanes`, vocabulaire fermé : `day`,
`rest_unknown`, `target_unknown`, `no_bound`). Le couloir a ses deux bornes : il
pousse aussi la casserole principale vers le haut quand le reste est sous le
plancher. Journal : `day_rest_g`, `day_floor_g`, `day_ceiling_g`, `lane_kind`
sur chaque ligne de `starch_side_rows`. Tests : 5 cas du module, 1 épingle de
câblage éprouvée par mutation (couloir par case forcé ⇒ rouge).

**Mesure, run réel `0c02050d` (2026-09-22).**

| | valeur |
|---|---|
| couloirs de journée posés | 15 / 15 (`day`), aucun repli |
| cases à deux casseroles | 6 (4 `single_pot` : assiettes froides) |
| lignes partagées | 12 / 18 ; 100,8 g de protéine déplacés ; 1 594 kcal portées par le féculent |
| `protein_ceiling.over` (boîtes) | 7/15, pire +36 % |
| garde finale | Thomas au-dessus 5 jours sur 5 (+18 à +36 %) ; Fabrice sous son plancher 1 jour (98 %) |

**Pourquoi l'écart de Thomas ne se ferme pas.** Le journal le dit ligne par
ligne : le **reste** de sa journée, hors cases à deux casseroles, pèse à lui seul
145 g mercredi, 130 vendredi, 121 dimanche, 106 samedi, 62 jeudi — pour un
plafond couvert de 144 g. Mercredi : 145 g de reste + 50,7 g au dîner partagé =
195,7 g, le chiffre exact de la garde finale (195,6). Là où le couloir restant
tombe à 0–15 g, les cases partagées vont à leur borne : `mass_bound` (assiette
de 662–700 g pour un maximum de 700) ou `bounded` (casserole principale à
0,6 × uniforme). Le couloir de journée voit juste ; il n'a pas le levier.

⚠️ Ce run n'est pas comparable terme à terme à `505f8d7f` (couloir par case) :
le modèle a écrit 4 assiettes froides au lieu de 2, qui entrent toutes dans le
reste. Il faudrait journaliser le contrefactuel (le partage au couloir par case,
sur le même plan) pour isoler l'effet du couloir — non fait.

**Ce que le reste contient, et le levier de chacun.**

- **Les déjeuners partagés servis froids** (thon, légumineuses, pain) : aucune
  casserole, donc aucun féculent à séparer — alors que le pain y est déjà une
  ligne à part. Étendre le partage à une ligne de féculent frais du plat.
- **Le petit-déjeuner partagé** : écrit à la densité du plancher le plus
  exigeant, sans féculent à côté.
- **Les collations mangées seul** : la passe B cale sur l'arrondi de la mesure
  (`reverted_after_measure` × 5 sur ce run).

## 2026-09-22 — DÉCISION : le plafond protéique devient une mesure

**La décision (propriétaire, 2026-09-22).** Régler la protéine d'une personne en
lui ajoutant du féculent jusqu'à faire passer un compteur n'est pas une façon de
cuisiner (161 g de saumon pour 503 g de couscous sur `505f8d7f`). Le code le dit
lui-même dans `sharedProteinCaps` : « un plancher est un besoin ; un plafond est
une borne de confort ». Le plafond de 2,0 g/kg (`proteinCeilingGFor`) reste
**compté** — `generated_from.protein_ceiling`, cause `protein_ceiling_over` de la
garde finale — et **plus rien ne le poursuit**.

**Ce qui a changé.**

1. **Le partage des deux casseroles suit l'énergie** (`splitStarchSide`,
   `starch_side.ts`). Une grosse assiette reçoit la casserole principale de la
   part du **milieu** de la table (`tableReferenceFactor` : médiane des facteurs
   du plat, la plus petite des deux du milieu à nombre pair — jamais le minimum,
   qu'un enfant ferait tomber) ; son surplus d'énergie part dans le féculent.
   Proportions modérées : casserole ≥ 0,75 × sa part, féculent ≤ 1,75 × (0,6 et
   2,5 quand le module poursuivait le plafond). La masse de l'assiette reste une
   borne.
2. **Le plafond ne décide plus rien** : le couloir de journée ne garde que son
   côté plancher (`dayProteinFloors`) ; la passe du lot B est éteinte par
   `PROTEIN_CEILING_PURSUED = false` (`protein_ceiling_adjust.ts`) et sa trace
   écrit `ran: false, reason: "ceiling_is_a_measure"` ; la modification du brief
   qui gardait le plafond propre d'une bouche sur les cases à féculent à côté est
   retirée (retour au comportement du 2026-09-21 : le plancher de la table gagne,
   ce qui cède est compté).
3. **Le plancher reste une contrainte** : une part qui passerait sous le
   plancher de sa bouche (plancher de journée couvert, ou par case en repli)
   reprend de la casserole principale.

Rien n'est supprimé : le module du lot B et ses tests restent, la passe se
rallume par la constante.

**Mesure, run réel `1e553ca1` (2026-09-22)** — un run précédent (`381ea79a`) est
mort en composition (`timed_out`) : une autre session écrivait sous
`supabase/functions/`, `generate-household-meal-v1/index.ts` compris, et chaque
écriture redémarre le runtime.

| | valeur |
|---|---|
| cases à deux casseroles | 10 / 10 |
| lignes partagées | 13 / 30 : `uniform` 14, `mass_bound` 7, `to_floor` 4, `bounded` 4, `starch_carries_extra` 1 |
| plancher de journée | posé 15 / 15 |
| passe du lot B | `ran: false`, `ceiling_is_a_measure` |
| `ceiling_yielded_slots` | 25 (retour au comportement d'avant C) |
| plancher (garde finale) | Fabrice 1 jour à 99 % |
| plafond (mesure) | `protein_ceiling.over` 7/15, pire +74 % : Thomas 4 jours (+17 à +74 %, 250,6 g le samedi), Christèle 2 jours (+26 %, +46 %) |

**Ce que la mesure dit.**

- Le plancher de Fabrice est tenu : `to_floor` le ramène à son plancher de case
  quand il en manque (jeudi, vendredi).
- La règle d'énergie mord peu chez Thomas : 7 de ses 10 lignes finissent
  `mass_bound`. Ses assiettes sont déjà à la masse maximale, et le féculent cuit
  est moins dense en kcal que la casserole principale — lui en donner plus
  alourdit l'assiette.
- Le plafond, désormais seulement mesuré, atteint ici son pire chiffre des runs
  de la journée : 250,6 g samedi pour Thomas (3,5 g/kg), 168,9 g pour Christèle
  en maintien. Ce run a des recettes très protéinées (91 g dans UN déjeuner de
  Thomas) ; rien ne les retient plus en aval, et la seule borne restante est la
  ligne « not more » des cartes du prompt (`sharedProteinCaps`, 2026-09-20),
  que le plancher de la table fait céder sur les 15 cases partagées.

## 2026-09-23 — DÉCISION : le curseur est tenu, 0,8 kg en perte et 0,5 kg en prise

Décision du propriétaire : ce que le curseur affiche est ce que la casserole
cuisine. « Si une personne dit +500 g par semaine, on lui met +500 en
calories. » Les plafonds sont 0,8 kg/sem en perte et 0,5 kg/sem en prise ;
des bornes propres au corps restent permises, mais Fabrice (93 kg) doit pouvoir
perdre 0,8 et Thomas (72 kg) prendre 0,5.

**Ce qui ne tenait pas.** Thomas portait 0,45 en base. Depuis le 2026-09-21,
une prise était bornée à 0,5 % du poids (`MAX_WEEKLY_BODY_FRACTION_UP`) :
72 × 0,005 = 0,36, arrondi à 0,35. Le moteur cuisinait 0,35 (+385 kcal/j),
le curseur s'affichait à 0,35, et seule une ligne sous le curseur disait
l'écart.

**Ce qui change (`weight_pace.ts`).**

| | avant | maintenant |
|---|---|---|
| plafond absolu | 1,0 kg dans les deux sens | `MAX_KG_PER_WEEK` : `down` 0,8, `up` 0,5 |
| borne du corps | 1 % en perte, 0,5 % en prise | 1 % dans les deux sens (`MAX_WEEKLY_BODY_FRACTION_UP` retiré) |
| plancher d'énergie, A1 (880 kcal/j), mineur | inchangés | inchangés |

- Thomas : maximum 0,5, son 0,45 est cuisiné tel quel (+495 kcal/j). Sa cible
  passe de 3 276 à environ 3 386 kcal/j (entretien estimé 2 891).
- Fabrice : maximum 0,8, inchangé (A1 et le plafond absolu valent tous deux
  0,8 kg).
- En prise, le plafond absolu gagne dès 50 kg ; en dessous, c'est 1 % du poids
  (45 kg → 0,45).
- La phrase « au-delà d'environ 0,5 kg par semaine, le surplus part surtout en
  gras » (`paceWarning`) ne s'affiche plus : son seuil est devenu la butée.
- Un cran enregistré au-dessus du nouveau plafond (la base accepte jusqu'à
  1 kg) est affiché à la butée, cuisiné à la butée, et la ligne « Enregistré à
  X, le plan n'en cuisine que Y » le dit.

Le curseur et le moteur lisent la même fonction (`paceCeilingFor`, et
`executedPaceFor` qui la lit pour une prise) : rien n'est recopié côté écran.

**Vérifié.** Deno keel 7 822/7 822 ; mutation `up: 1.0` → 7 tests de
`weight_pace_test.ts` rouges. Front `tsc -b --force` propre, vitest 2 rouges
connus (`energyBasis`, `mouthProfileReaders`). À l'écran, fiche de Thomas :
curseur `max=0.5`, valeur 0,45, « 0,45 kg par semaine », aucune ligne d'écart.

## 2026-09-23 — Une session ne met en boîte que ce qu'elle cuisine

**Le défaut, lu sur le plan adopté `404d64b5` (du 23 au 28).** Le couscous
est cuit mercredi, une fois, pour le dîner du jeudi et celui du vendredi. Le
saumon est cuit vendredi. Le « Boxing » de la session de mercredi listait les
trois boîtes du vendredi soir en entier : « Saumon, brocoli et carotte
278 g » à peser deux jours avant la cuisson du saumon.

**La cause.** `boxLinesForSession` (`frontend/src/keel/lib/mealBoxes.ts`)
choisissait les repas par casserole, puis recopiait toutes les parts de
marmite de leurs boîtes. Son en-tête promettait pourtant qu'un repas à deux
sessions « se remplit en deux fois », et le filtre du 2026-09-16 disait « ce
qu'une session met en boîte, c'est ce qu'elle produit ». Il ne retirait que
les items frais. Tant qu'un repas tirait sur une seule casserole, rien ne se
voyait ; le féculent dans sa propre casserole (lot C) l'a rendu courant.

**Deux tests épinglaient le défaut.** « deux marmites d'une même session
restent ensemble » passait une session qui ne cuisait que le poulet et
exigeait le riz dans la boîte ; `potShareParts` faisait de même avec le
couscous. Leurs sessions passent désormais les deux casseroles.

**La correction.**

| Où | Avant | Après |
|---|---|---|
| `oneLine` | `potSharesOnly = false`, retire les seuls items frais | `scope` requis : une session ne garde que les parts de SES casseroles |
| `BoxLine` | `partial` seul | + `restOnTheDay` (items frais laissés) et `fromOtherSessions` (nom et jour de cuisson) |
| `frozen` | lu sur toute la boîte | lu sur ce que la session y met |
| `BoxTable` | « le reste se prépare le jour même » sur tout contenant partiel | cette mention pour le frais seul ; « · avec {part}, cuisiné {jour} » pour une autre session |

La règle est locale : elle ne dépend d'aucun ordre entre sessions. Test :
`frontend/src/keel/components/sessionBoxesOwnPots.int.test.ts`, sur les
chiffres du plan `404d64b5`, avec deux invariants sur tout le plan : chaque
gramme pesé à une session sort d'une de ses casseroles, et chaque part est
pesée une fois toutes sessions confondues. Rouge sur l'ancien code (11 sur 15),
vert après. Vérifié à l'écran : mercredi 398, 207 et 104 g de couscous avec
« avec Saumon, brocoli et carotte, cuisiné Vendredi » ; vendredi 278, 264 et
321 g de saumon avec « avec Couscous complet, cuisiné Mercredi ».

**Côté générateur, rien à faire.** Un plat mangé avant la cuisson de sa
casserole est refusé par la garde finale (`eaten_before_cooked`, réparable).

**Restent ouverts dans la même session de vendredi** : le déroulé global
réduit à « Sortir le saumon du congélateur jeudi soir. » (la réécriture après
le retrait de la casserole de dinde a supprimé la phrase qui cuisait aussi le
saumon), et une décongélation demandée pour un saumon acheté frais le
vendredi.
