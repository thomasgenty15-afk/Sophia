# Un retour et les calories — ce que la chaîne fait vraiment d'un « j'aime pas trop »

Session sophia-2-0f, 2026-09-06, 14 h → 15 h. Question de l'utilisateur : *comment un retour
comme « j'aime pas trop le rougaille saucisse » s'immisce dans le système, et comment il peut ne
pas foirer le calcul calorique ?* Méthode : une carte de la chaîne, fichier:ligne à l'appui
(`FB-chaine-retour-calories.md`), puis **14 brouillons réels** de 7 jours sur le foyer de banc de
quatre bouches (Paul en perte, Nora végane, Claire, Leo ; style `balanced`, 2 courses), l'état
retenu posé par SQL avant chaque tir et restauré après. Compteurs lus dans la **réponse** (par
requête), jamais dans le journal partagé. Tout est dans ce dossier : lanceur, plans, synthèse.

## 1. La chaîne, en une page

1. **Écriture.** Un retour devient une ligne `{kind: food.exclude | food.prefer | craving …,
   subject: household | member:<uuid>, text, scope: durable | next_plan}` dans
   `student_goals.practical_constraints.retained_items` (ou `retained_next_plan`), par le
   classifieur de note, le bilan de fin de plan (`never_again`) ou la carte.
2. **Prompt.** À la génération suivante, la ligne est servie au modèle : sous le titulaire pour la
   table, avec « THIS PERSON ONLY » pour une bouche. **La note du brouillon n'agit sur son propre
   plan que par le prompt** ; elle n'est un terme de ceinture qu'au plan N+1.
3. **Ceinture par bouche** (après le modèle) : pour une exclusion `member:`, chaque boîte de cette
   bouche est comparée aux termes ; une morsure **retire le nom de la bouche de la boîte** — jamais
   un gramme, jamais un plat.
4. **Relance / repli.** Si des cellules restent sans repas, une relance modèle par parties ; si
   elle échoue, le repli **remet la bouche sur la boîte partagée du plat, « qui porte ce qu'elle
   évite »**.
5. **Énergie.** La cible de la bouche est recalculée sur les moments **qui lui restent**
   (`ownSlots`) : une journée amputée n'est pas « sous le besoin », elle est plus courte.
6. **Courses et casseroles** ne rétrécissent jamais après un retrait.

**« Rougaille saucisse » devient deux règles**, « rougaille » et « saucisse » : « lentilles aux
saucisses » mord, « rougaille de tomates » mord aussi.

## 2. Ce que les tirs ont montré

| cas | retour | résultat |
|---|---|---|
| FB0 / FB0b / FB0c | témoin ×3 | énergie livrée par bouche **27 → 61 %** de la cible selon le tir : la variance du modèle seul vaut ~30 points |
| FB5 | « Leo n'aime pas le rougaille saucisse » (rien ne correspond) | rien ne casse : 0 morsure, 0 fuite, plan normal |
| FB3 | « Nora (végane) n'aime pas le yaourt de soja » | le modèle obéit ; Nora tombe à 44 % (témoin 61 %) : ce qu'elle perd n'est compensé par rien, aucun compteur ne la distingue |
| FB7 | « Claire n'aime pas les noix ni les amandes » | le modèle obéit, collations remplacées, propre |
| FB6 | envie « des fajitas » pour le prochain plan | servie, un plat de fajitas ; sans effet mesurable sur l'énergie |
| **FB2 / FB2r** | « Paul n'aime pas le poulet » | FB2 : ceinture 3 refus, relance rejetée, **repli : Paul remis sur 3 boîtes à 300 g de poulet**, sa note dit « ajouter le poulet prévu dans la boîte ». FB2r : la ceinture **sépare** 3/3 (boîte d'échange), 0 repli, aucun poulet chez Paul. Le même retour donne l'un ou l'autre selon le tir : le repli n'est pas un cas rare, c'est la moitié des tirs |
| **FB8** | table préfère les lentilles + « Nora (végane) n'aime pas le tofu » | 0 lentille ; 12 morsures ; **repli : la végane remise sur 9 boîtes de chili de dinde et de poisson** ; 13 repas manquants ; Nora à 31 % |
| **FB1 / FB1r / FB4 / FB4r** | exclusion **de table** (saumon ; poulet+saumon+thon) | **4 tirs sur 4 : le poulet et le saumon sont servis à tous** (8 à 12 boîtes, 115–315 g), le plan l'écrit lui-même dans `issues` (« household asked to avoid … still contains »), HTTP 200. Aucune ceinture déterministe pour une exclusion de table : une seule relance modèle, rejetée à chaque fois |
| FB1 | (idem, 1er tir) | le modèle a rendu un plan de 20 collations sans aucun repas principal (réponse de 12,8 k caractères) ; **76 cellules sur 110 vides, accepté en 200** ; non reproduit au rejeu : aléa du modèle, mais le produit l'a laissé passer |

## 3. Réponse à la question

**Un retour ne « foire » pas le calcul calorique : il le contourne.** Le calcul recalcule la cible
de la bouche sur ce qui lui reste, donc une bouche qui perd un plat n'apparaît jamais sous le
besoin ; et quand le retrait la laisse sans repas, le repli la remet sur le plat qu'elle évite pour
que « personne sans repas » reste vrai. Le chiffre reste juste sur le papier, l'assiette ne l'est
pas. Trois défauts structurels, tous reproduits :

1. **Une exclusion de table n'est tenue par rien** (FB1r, FB4, FB4r) : la ceinture par bouche ne
   s'applique qu'aux exclusions `member:` ; pour la table, une relance modèle unique, refusée si
   elle rend moins de plats, puis on sert quand même. C'est le cas le plus courant (« on n'aime pas
   le saumon ») et il ne marche pas.
2. **Le repli « personne sans repas » annule le dégoût** (FB2) **et peut violer un régime** (FB8 :
   végane servie de dinde). Il remet la bouche sur la boîte partagée sans regarder ce qu'elle porte.
3. **Une bouche qui obéit perd des calories en silence** (FB3) : la cible suit les moments
   restants, la densification ne voit pas un moment perdu, les courses ne bougent pas.

Deux faits de méthode : la variance du modèle sur l'énergie (~30 points entre deux témoins) rend
un tir isolé illisible sur les kcal — les structures (fuites, replis, manquants) se lisent à n=1,
l'énergie demande ≥3 témoins ; et un plan dégénéré (FB1) passe en 200.

## 4. Ce qu'il serait mieux de faire (dans l'ordre)

1. **Une ceinture déterministe pour les exclusions de table** : appliquer le retrait par bouche à
   toutes les bouches quand `subject = household` (c'est déjà l'union des termes que la relance
   reçoit), puis relance ; jamais servir un plat qui porte un terme exclu de la table sans l'avoir
   séparé (boîte d'échange) ou refusé.
2. **Le repli respecte les ceintures** : ne jamais remettre une bouche sur une boîte qui porte un
   terme qu'elle exclut OU un composant que son régime interdit ; à défaut, compter la cellule
   `missing` et le dire, plutôt que nourrir sur le papier.
3. **Une morsure recalcule la journée** : quand une bouche perd un moment, sa cible du jour ne
   doit pas rétrécir ; ses autres boîtes du jour grossissent (densification vers le plus dense)
   ou le manque est compté `unmet` — au choix, mais compté. Et les courses/casseroles suivent.
4. **Un plan sans repas principal se refuse** : `no_dish > N` sur les déjeuners/dîners ⇒ 422 ou
   relance, jamais 200.
5. **Une phrase = un terme** : « rougaille saucisse » ne doit pas devenir « rougaille » + « saucisse »
   (ou alors le dire à la personne).
6. Un test qui traverse ceinture → énergie (aucun aujourd'hui), et le banc de ce dossier rejoué
   à chaque changement de prompt (n≥3 sur le témoin).

## 5. Ce que ce rapport ne prouve pas

- Les kcal comme effet d'un retour : la variance du modèle domine ; il faudrait 3 témoins et 3
  tirs par variation pour un chiffre.
- La lane solo : non tirée (elle n'a aucune ceinture d'exclusion, seule une `issue`).
- Le bilan de fin de plan (`never_again`) comme source : le banc a posé les lignes retenues par
  SQL, la porte d'écriture a été prouvée les 3–5 septembre.

## 6. ⟳ Après correctifs (2026-09-06, 15 h 15) — les trois défauts, dans l'ordre

| correctif | où | ce que ça fait |
|---|---|---|
| **1. Ceinture déterministe pour les exclusions de table** | `generate-household-meal-v1/index.ts` (les termes de la table rejoignent ceux de chaque bouche), `meal_generation.ts` (`exclusionBites` par plat), `meals_delivered.ts` (un plat ouvert ne nourrit pas la bouche dont l'exclusion le mord) | une exclusion `household` retire la bouche du couvercle comme une exclusion `member:` ; un plat vidé de ses boîtes ne devient plus « de la maison » |
| **2. Le recours respecte les ceintures** | `meals_delivered.ts` (`restoreHeldOff` avec `canJoin`), index (ceinture = régime du plat + exclusion sur sa surface) | une bouche n'est jamais remise sur une boîte qui porte ce qu'elle évite ou ce que son régime interdit ; la case reste manquante, comptée et dite |
| **3. Un moment perdu par la ligne garde sa part** | `mouth_anchor.ts` (`lostLineKcal` sur la cible), index (`lostSlotEnergy` de 74 sur les cases `held_off_*`, compteur `lost_by_line`) | la cible du jour ne rétrécit plus quand un plat est retiré ; l'écart apparaît dans `unmet` et la densification peut le combler |

Rejoué (4 brouillons, même fixture, même style) :

| cas | avant | après |
|---|---|---|
| témoin | 43–61 % | 45–55 %, `lost_by_line` 0 — aucune régression |
| « Paul n'aime pas le poulet » | repli ×3, 300 g de poulet chez Paul | **0 boîte de Paul au poulet**, 0 repli (13 manquants : Nora, régime — lane 8a, variance) |
| « la table exclut poulet, saumon, thon » | 12–20 boîtes de saumon/poulet servies, `issues` le disait, 200 | **0 item servi** ; le modèle compose encore 7 déj/dîn sur 13 avec ces protéines, la relance ne les répare pas ⇒ **21 cases manquantes**, comptées (`lost_by_line` 16 633 kcal, `unmet: pot_ceiling`), dites ; en `prepare_next` ce plan se refuse au lieu d'être servi avec l'aliment exclu |
| « Nora végane n'aime pas le tofu » | remise sur 9 boîtes de dinde/poisson, 13 manquants, 31 % | **11 boîtes sans produit animal ni tofu**, 0 repli, 2 manquants, **51 %** |

**Ce qui reste, et à qui.** Le modèle n'obéit pas toujours à une exclusion de table (7 plats sur
13 en FC4) et une relance ne suffit pas : la relance d'exclusion (rejetée quand elle rend moins de
plats) et la relance par parties sont la lane de 8a. La cible retrouvée par le correctif 3 ne se
comble pas quand les plafonds de pot mordent (`pot_ceiling 9`) : c'est l'arbitrage 1 (74). Les
courses et casseroles ne rétrécissent toujours pas après un retrait.

## 7. ⟳ Le reste, à trois (2026-09-06, 16 h)

**Ma part, rejouée :**
- **La lane solo a une ceinture d'exclusion** (`generate-meal-v1`) : les termes retenus de la
  table sont cherchés sur chaque plat (titre, ingrédients, casseroles citées) ; une relance
  nomme les plats fautifs ; ce qui mord encore est **retiré** et sa case rouverte pour la relance
  des cases vides — jamais servi, jamais compté. Tir FS1 (« poulet » exclu, 7 jours) : 3 morsures
  détectées, relance acceptée, **0 plat au poulet servi**, 0 retrait, 0 trou. Avant : aucune
  ceinture, une ligne d'`issue`.
- **Une phrase nue = une règle** : « rougaille saucisse » ne mord plus « lentilles aux
  saucisses » ni « rougaille de tomates » ; une phrase de personne (« Mon fils n'aime pas le
  poisson ») garde la règle d'avant, parce que l'extracteur y laisse du bruit ; une catégorie
  (« poisson ») reste un mot qu'une espèce suffit à trouver.

**Les deux autres lanes** (en cours au moment d'écrire) : 8a — la relance d'exclusion rejetée
quand elle rend moins de plats et la relance par parties qui ne répare pas (FC4), la ceinture de
régime qui retire la végane de toutes ses boîtes (FC2), tentatives et motif de rejet au journal ;
74 — les plafonds de pot qui empêchent de combler l'écart retrouvé, et les courses/casseroles qui
ne rétrécissent pas après un retrait.

## 8. ⟳ Le reste, rejoué à trois lanes (2026-09-06, 16 h 25 → 16 h 40, HEAD `6a104f86`)

Trois lanes posées : les miennes (§6, §7), le rétrécissement des casseroles et des courses
après un retrait (74, `a3c6af19`, `9cca3de1`), le relogement d'une bouche retirée sur la boîte du
même plat que sa ligne accepte, les relances par parties avec le texte source adopté et les
journaux de rejet (8a, `6a104f86`).

| cas | avant tout (§2) | mes correctifs seuls (§6) | trois lanes |
|---|---|---|---|
| « Paul n'aime pas le poulet » | repli ×3, 300 g de poulet chez Paul | 0 poulet, 13 manquants (Nora, régime) | 0 poulet chez Paul, Nora 12 boîtes propres, 10 manquants = aléas du modèle (4 cases sans plat, 6 régime) |
| « la table exclut poulet, saumon, thon » | 12–20 boîtes de saumon/poulet servies | 0 servi, **21 cases manquantes** | 24 morsures, **18 bouches relogées**, **0 servi, 0 manquant par exclusion**, pots retirés 2, courses rabotées ; énergie 51–63 % (bande du témoin) |
| « Nora végane n'aime pas le tofu » | remise sur la dinde et le poisson, 31 % | 11 boîtes propres, 51 % (le modèle avait composé des lentilles) | 0 violation, mais **12 cases manquantes** : aucune boîte acceptable à reloger (la sienne porte du tofu, les autres de la dinde), 2 relances ne recomposent pas de composant végane sans tofu ; 4 % |

**Ce qui est réglé** : un retour ne fait plus servir ce qu'il exclut, ne remet plus une bouche
sur ce qu'elle évite ni sur ce que son régime interdit, ne fait plus rétrécir la cible en silence,
et ne laisse plus cuire ni acheter une casserole que plus personne ne tire. L'exclusion de table
(le cas le plus courant) est nourrie proprement.

**Ce qui reste ouvert, nommé** : la bouche dont la ligne exclut son SEUL composant possible sur
la table (la végane sans tofu) — le retrait est juste, le relogement n'a rien à offrir, et la
relance ne compose pas encore l'alternative (lentilles, pois chiches). C'est un levier de relance
(dire au modèle QUEL composant composer pour cette bouche), pas de ceinture. En attendant, le plan
se refuse (`mouth_unfed`) plutôt que de la servir avec la dinde.

## 9. ⟳ Rejeu final (17 h 10, HEAD `10d74992`) — les deux cas restants

8a a posé trois compléments : un analogue déclaré (« yaourt de soja ») éteint son mot nu dans la
prose du même plat pour la ceinture de régime ; la fusion par cellule accepte toute cellule où
MOINS de bouches manquent ; la relance par parties nomme la boîte et l'item à remplacer pour la
bouche retirée (« remplace cet item par un composant du même rôle qu'elle mange et qui suit sa
ligne »).

| cas | §8 (trois lanes) | rejeu final |
|---|---|---|
| « Paul n'aime pas le poulet » | 10 manquants (aléas) | 3 morsures, **3 relogées, 0 manquant**, sans relance ; 0 poulet chez Paul, 0 produit animal chez Nora |
| « Nora végane n'aime pas le tofu » | 12 manquants, 4 % | 13 morsures, **une relance par parties fusionne 13 cellules**, **0 manquant** ; 13 boîtes aux légumineuses (lentilles, haricots blancs), 0 animal, 0 tofu, **60 %** |

**Conclusion.** Sur les quatre cas fautifs du banc, plus aucune fuite, plus aucun repli sur ce
qu'une bouche évite, plus aucune case manquante par exclusion, des casseroles et des courses qui
suivent un retrait, et une cible qui ne rétrécit plus en silence. Ce qui reste est de la variance
du modèle (cases sans plat, ~30 points d'énergie entre deux témoins), à mesurer par campagne.

## 10. ⟳ Un retour à deux bouches : « Léa n'aime pas trop les asperges mais Marc adore, tu peux faire deux versions du plat ? » (18 h, foyer de cinq, deux tirs réels)

| étape | ce qui se passe |
|---|---|
| **Mémoire** | la note est classée juste : `food.exclude « les asperges » @Léa` et `food.prefer « les asperges » @Marc` ; la demande « deux versions » est un `skipped` (une consigne de composition, pas un souvenir) ; l'accusé dit « Léa : « les asperges » · Marc : « les asperges » » — **il ne dit pas qui veut et qui ne veut pas** (défaut de copie) |
| **Le plan composé avec la note** | la note n'agit que par le prompt (C6, connu) : le modèle met les asperges dans la casserole commune « Légumes rôtis aux asperges et courgettes », servie à **tous les cinq, Léa comprise**, sur les quatre déjeuners-dîners ; son explication affirme « deux façons de servir, les courgettes peuvent remplacer » — **rien de tel dans les boîtes**. La demande n'est pas honorée sur le plan qu'elle visait, et l'explication le masque |
| **Le plan suivant** | les deux lignes sont servies (`composition 2`) ; **plus une asperge nulle part** : l'exclusion de Léa est honorée en évitant l'aliment pour toute la table, la préférence de Marc n'a aucun effet visible. La boîte d'échange (une base commune, le composant qui sépare par boîte) existe pour les régimes et les exclusions, mais le modèle ne compose pas « la version de Marc » de lui-même |

**Ce qu'il faudrait :** (1) que les exclusions d'une note mordent **le plan qu'elle annote** (classer avant la ceinture, pas après l'écriture) ; (2) quand une bouche préfère ce qu'une autre exclut, demander explicitement au modèle le composant séparé par boîte (la boîte d'échange) plutôt que d'éviter l'aliment pour tous ; (3) un accusé qui dit « Léa : pas d'asperges · Marc : plus d'asperges ».

## 11. ⟳ Les trois points corrigés, et le cas Léa/Marc rejoué (18 h 30 – 19 h, HEAD 22ab729c)

Trois lanes, trois commits sur la même branche, dans l'ordre : 74 a posé `5fa06ef6` puis `0085e2da` (point 2 : quand une bouche veut ce qu'une autre refuse, le brief demande le composant séparé par boîte, compteur `preference_split`, et l'écart entre l'explication et les boîtes est dit dans `issues`) ; 8a a posé `2901b046` (point 3 : l'accusé dit le sens — « Léa : à éviter — « les asperges » · Marc : à servir plus souvent — « les asperges » », FR + EN) ; moi `22ab729c` (point 1 : la note est classée **avant** le plan qu'elle annote).

**Le point 1, en une ligne :** le classifieur de la note (`classifyDraftNoteEarly`) part sans `await` juste avant l'appel principal, dans les deux lanes ; sa réponse est lue après le parse par le même lecteur que la persistance (`draftNoteBeltItems`) et ses items — durables et encart, avec leur `subject` — rejoignent le magasin structuré dans `beltItems`, que la ceinture lit pour la table et pour chaque bouche. Zéro latence ajoutée (< 25 s en parallèle de minutes). La persistance nominale garde son propre appel avec les aliments du plan écrit (c'est là que « laquelle ? » compte) ; seul le site du refus du foyer réutilise la réponse précoce. Compteurs : `keel.household_meal.draft_note_belt`, `note_items`/`note_refusal` dans les compteurs de ceinture. Épingles : `draft_note_belt_wiring_test.ts` (ordre, lecture, `beltItems`, compteur, site de réutilisation — chaque moitié retirée rougit).

**Tir ASP1r** — même foyer de cinq (qa-scope-20260905), même note « Léa n'aime pas trop les asperges mais Marc adore, tu peux faire deux versions du plat ? », 3 jours demandés, HTTP 200 en 166 s ([plan-ASP1r-note-avant-ceinture.json](plan-ASP1r-note-avant-ceinture.json), [lecture-ASP1r.txt](lecture-ASP1r.txt)) :

| | ASP1 (avant, §10) | ASP1r (après) |
|---|---|---|
| ce que la ceinture reçoit de la note | rien (`draft_note_belt` n'existe pas ; `exclusion_belt` muet, 0 terme) | `items 2 · durable 2 · exclude 1 · prefer 1 · refusal null` ; `exclusion_belt.note_items 2` |
| asperges à Léa | **6 fois sur 6** (la casserole « Légumes rôtis aux asperges » citée par toutes les boîtes, Léa comprise) | **0** : la ceinture mord (`bites 1`, `mouths 1`), Léa est retirée de la boîte du « Tofu, asperges, pommes de terre » (`issues` le dit), puis la relance des cases manquantes (`missing_before 1 → missing 0`, `retry_on {held_off_exclusion: 1}`) lui compose **sa boîte** : tofu, pommes de terre, haricots — sans asperge |
| asperges à Marc | 6/6, comme tout le monde | 1 (le dîner du lundi), comme Claire, Tom et Zoé — la préférence n'a pas encore d'effet propre sur ce plan-là (`preference_split` : pas de ligne, les paires du bloc de 74 lisent les magasins, vides à cet instant — extension à `beltItems` convenue avec 74, après ce tir) |
| l'explication | affirme « deux façons de servir » — **fausse**, une seule boîte pour tous | « une version sans asperges et une version qui les met en avant » — **vraie** : deux boîtes, la sienne sans |
| l'accusé | « Léa : « les asperges » · Marc : « les asperges » » (sans le sens) | « Léa : à éviter — « les asperges » · Marc : à servir plus souvent — « les asperges » » |
| mémoire | 2 durables écrites | 2 durables écrites, 0 question (`clarify_proposed 0`) |

Ce qui reste vrai et n'est pas réparé par ce tir : la « version de Marc » n'est pas encore une version **avec plus** d'asperges — c'est la version commune. Le brief de 74 (v31) ne s'arme que sur des paires déjà en magasin ; sur un brouillon annoté, la paire n'existe que dans `beltItems`, après l'appel principal. Armer le prompt avec la note fraîche coûterait la latence du classifieur sur chaque plan annoté : nous avons choisi de ne pas le faire, et de laisser le prompt à la note verbatim (`draftNoteInstruction`), qui a suffi ici pour que le modèle sépare la boîte de Léa.

**Tir ASP2r** — le plan suivant, sans note, la mémoire portant les deux lignes (HEAD 22ab729c, les trois lanes) : HTTP 200 ([plan-ASP2r-plan-suivant-trois-lanes.json](plan-ASP2r-plan-suivant-trois-lanes.json), [lecture-ASP2r.txt](lecture-ASP2r.txt)).

| | ASP2 (avant, §10) | ASP2r (après) |
|---|---|---|
| la paire vue par le brief | rien | `preference_split {pairs 1, wanters 1, composed 1, refuser_clean 1, refuser_bitten 0}` |
| la boîte d'échange | n'existe pas : **plus une asperge nulle part**, l'exclusion honorée en évitant l'aliment pour tous | une casserole à part, « Asperges rôties », citée **seulement** par la boîte de Marc, à deux repas (déjeuner de lundi, dîner de mardi) ; la base commune (quinoa-tofu, curry de lentilles) reste la même pour les cinq |
| asperges à Léa / aux autres | 0 / 0 | 0 / 0 (`exclusion_belt`: `bites 2 · separated 2 · not_separated 0`) |
| asperges à Marc | 0 | **2** |
| l'explication | — | « Les asperges sont préparées à part et ajoutées seulement dans les boîtes qui les incluent, tandis que la base commune reste inchangée » — vraie, boîte par boîte |

**Bilan des trois points sur le cas Léa/Marc :** (1) l'exclusion mord le plan annoté (Léa : 6 → 0 asperges, sa propre boîte) ; (2) au plan suivant, la préférence de Marc devient une casserole à part servie dans sa seule boîte, deux fois, sans qu'aucune autre bouche la reçoive ; (3) l'accusé dit qui évite et qui veut. Ce que ce cas ne mesure pas encore : la même paire **sur le plan annoté lui-même** (les paires du brief lisent les magasins ; sur ASP1r, Marc a eu la version commune, une fois) — 74 étend le compteur à `beltItems`, et le brief garde la note verbatim. Deux tirs, un foyer : c'est un cas, pas une campagne ; la variance du modèle reste ce qu'elle est (§9).

**Suite posée par 8a (19 h) :** `769856a2` — quand une bouche veut ce qu'une autre refuse et que sa boîte n'en a pas, une relance par parties reprend les cellules où elle en a enfin (jamais celle d'un refusant, jamais une cellule qui coûte un repas) ; elle lit les magasins **et** la note fraîche (`allSplits`), donc elle couvre le cas qui manquait sur le plan annoté. `c686417e` — l'explication IA ne contredit plus un plan fusionné (les lignes de la base qui nomment le terme tombent, celles de la relance entrent). Mesuré sur le foyer de quatre (Claire exclut, Paul préfère) : ASP5 composé juste sans relance (Paul 4 repas, Claire 0) ; ASP6 composé 0 → relance, 3 cellules, Paul 3 repas ; ASP7 composé 0 → relance, 2 cellules, `plan_explanation {merged_dropped 1, merged_added 1}`, explication finale conforme aux boîtes. 0 fuite et 102/102 nourris sur les trois.
