# Plan de mise en œuvre — composition de repas pour un foyer

**2026-08-21 · version 2, réécrite après cinq revues.**
La v1 est conservée telle quelle dans `2026-08-21-2100-PLAN-v1-avant-revues.md` — les
revues l'ont corrigée sur **quatorze faits**, et un lecteur qui ne trouve plus la
version réfutée la reconstruirait.

Construit sur trois documents de design, huit cas déroulés, quatre rapports de lot,
**six inventaires du code et de la base vivante**, puis **cinq revues adversariales**
(architecte · nutritionniste · sécurité alimentaire · QA/mesure · produit).

> **Ce plan ne suppose rien.** Chaque chiffre a été mesuré sur `supabase_db_Sophia_2`
> le 2026-08-21, ou vient d'un rapport cité par sa ligne. Les chiffres que la revue
> QA a **remesurés et corrigés** portent la marque ⟳. Quand une mesure manque, c'est
> écrit.

---
---

# ⛔ AVANT TOUT — LA DÉCOUVERTE QUI ORGANISE LE PLAN

**Le moteur de calcul par bouche n'a jamais tourné dans cette base.**

```
dishes[].boxes    présent sur   0 plan / 180     (absent des 1 821 plats)
box_sizing.anchor présent sur   0 plan / 46 porteurs de box_sizing
dernière génération             2026-08-19 10:18
```

`mouthDayEnergy` rend `[]` dès que `dish.boxes.length === 0` (`mouth_energy.ts:217`),
et `householdAnchors` est sous `if (composition)` (`generate-household-meal-v1/index.ts:5292`).
Or `index.ts:5717` écrit `box_sizing.anchor` **inconditionnellement** depuis le lot
d'ancrage : son absence sur les 46 plans porteurs prouve qu'ils datent tous d'avant.

⇒ **`anchorFactorFor`, `composedDishShare`, `dayCoverageOf` et `MEAL_MAX_GRAMS_PER_KG`
n'ont produit aucune mesure.** Le plafond physique retombe même sur `Infinity`
(`physicalMax` a `day.maxMealGrams` au dénominateur, nul sans boîtes).

**Ce n'est pas un lot de construction : c'est un lot de RUN.** `mealDishesPayload`
écrit `dishes[].boxes` aujourd'hui (`meal_generation.ts:6606`) et `readBoxes()` le lit
(`api/mealGeneration.ts:1054`). Le code de la v4 est sur le disque et personne ne l'a
exécuté. Le premier geste du plan n'est pas d'écrire du code — c'est de **mesurer,
puis de générer un plan**.

---

# ① CE QUI EST DÉJÀ FAIT

| lot | réellement livré | ce qui reste |
|---|---|---|
| **Lot 18** — sas des inconnus | ✅ **Vraiment livré** : 3 migrations appliquées et enregistrées, `composition_fill{,_io}.ts`, **les deux lanes câblées**, 4 compteurs, vue `composition_fill_weekly`, 28 tests Deno + 11 SQL + parité TS↔SQL | ⛔ **jamais exécuté** (sas à 0) · ⛔ **repli désarmé** *(porte G2)* · ⛔ **non commité** · aucun cron de promotion |
| **Lot 19** — parité FR/EN | ⚠️ **Ce n'est pas un lot, c'est une MESURE.** Rapport + 2 TSV + scripts rejouables. Écart FR/EN **17,3 points** (EN 150/150, FR 124/150), mécanisme identifié : les 923 slugs sont anglais et `bySlug` passe avant `byAlias` — **l'anglais a deux portes, le français une** | ⛔ **zéro alias appliqué** · `complet` toujours dans `PREPARATION_MODIFIERS` · `wrap`/`pitta`/`toast` toujours sur `white_bread` |
| **Lot 30** — grille de prix | ✅ 923 lignes en sas (917 FR, 860 US), bandes log, pièges cru/cuit et partie comestible traités **sur le prix** | ⛔ **0 promue, 0 lecteur** · pas de saisonnalité · l'**énergie** des lignes cuites reste fausse |
| **Convention des condiments** *(lot 0-C)* | ✅ Livrée — le seul mécanisme qui ait fait monter le taux : elle **double** la journée calculable foyer (9,1 % → 23,4 %) | — |
| **`keelGenerationModel()` foyer** | ✅ **Réparé le 2026-08-19** (`index.ts:4323`, `:4547`), cause nommée : timeout HTTP 110 s contre une médiane mesurée à 164 s | ⚠️ **lu, jamais observé** — `generated_from` ne porte aucune clé `model` |
| **M1 (le chat n'écrit plus)** | ⚠️ **À moitié fait, par accident** : `classifyAndPersistConversation` a **0 appelant**. Le renvoi de sizing est câblé et tenu par un test anti-commentaires | ⛔ `declare_safety_constraint` **écrit toujours** (68 lignes) — et ⛔ **c'est le seul port d'écriture des deux planchers déterministes** *(voir `M1b′`)* |
| **`protein_anchor.ts`** | ⟳ ✅ **IL MORD — la v1 disait le contraire deux fois.** `generate-meal-v1/index.ts:183` importe `proteinAnchorRetryInstruction`, `:2020` **déclenche une relance**, `:2050` journalise `keel.meal.protein_anchor` avec `missing_before/after` | il ne mord que sur la lane **solo** |
| **`generated_from.issues`** | ⟳ ✅ **PERSISTÉ — la v1 disait « nulle part ».** 112 plans, 108 non vides, **677 lignes**, dont **29 violations de conservation sur 14 plans**, en clair : *« "Roast chicken thighs" is cooked on wed and still eaten on sun — 4 days in the fridge »* | rien ne les compte |

⚠️ **Rien de tout ça n'est commité.** 13 migrations du 2026-08-20/21 sont appliquées à
la base locale **partagée** et enregistrées au registre, mais `NON-SUIVI` par git.
Disque et registre sont en revanche alignés : **227 = 227**, zéro doublon, zéro attente.

---

# ② LES TROIS LOTS QUI DÉBLOQUENT LE PLUS

**① `V0-E′` puis `V0-D` — mesurer, puis générer.** Le run ne change pas une ligne de
code et rend jugeables **neuf mécanismes** qui n'ont jamais produit une ligne. ⟳ **Et
l'ordre a été inversé par la revue architecte** : `V0-E′` doit tourner **avant** le run,
sinon quatre de ses dix compteurs n'ont plus de « avant » à mesurer.

**② `L6′` — la boîte v4 atteint la base et l'écran.** Racine du graphe de calcul.
⟳ **Désormais gardé par la porte G5**, sur exigence de la revue produit : c'est le lot
qui crée le **second emplacement du gramme**, et la v1 avait posé le verrou sur `L26`,
c'est-à-dire deux vagues trop tard.

**③ `L17` + `L-1` — la PESÉE, pas la résolution.** Le goulot a changé de nature :

```
pourquoi un plat s'abstient (1 821 plats ⟳ reproduit)
    missing_quantity      533     <- résolu, aucune quantité convertible
    unknown_ingredient    444     <- ce que le lot 18 a fermé (444 -> 27)
    no_ingredients        144     ⟳ 187 sur une définition SQL voisine
après le lot 18 : missing_quantity monte à 866
```

| | RÉSOLU | **PESÉ** | résolu **et** pesé |
|---|---:|---:|---:|
| foyer | 89,2 % | **87,6 %** | 80,1 % |
| solo | 89,3 % | **11,2 %** | **7,8 %** |

**La résolution est identique dans les deux lanes. C'est la pesée qui s'effondre.**

---

# ③ LE LOT LE PLUS DANGEREUX

### `L11★` — la mort de `composedDishShare`

`COMPOSED_DISH_MEAL_SHARE = 0,42` (`mouth_anchor.ts:207`). Le retirer multiplie la
cible de chaque plat par **×2,38**. Cinq raisons, et la cinquième a été trouvée par la
revue architecte :

1. **Il n'y a aucun « avant »** — la chaîne n'a jamais tourné.
2. **Le repli gouverne la population** : les trois cases de structure sont tranchées sur
   **2 fiches sur 43**.
3. **Aucune ceinture ne le rattrape** : `MEAL_MAX_GRAMS_PER_KG` retombe sur `Infinity`
   sans boîtes, et `ANCHOR_FACTOR_MAX = 3,00` laisse passer ×2,38.
4. **La lane foyer n'a pas de second essai** : ni vérification, ni mesure, ni relance.
5. ⟳ ⛔ **ET IL EMPORTE LA COUVERTURE DE 68 BOUCHES SUR 88, DANS LE SENS INVERSE.**
   `mouth_anchor.ts:423` : `declaredSlots.length > 0 ? declaredSlots : Object.keys(SLOT_DAY_WEIGHT)`.
   Passer de 3 à 6 clés fait tomber la couverture de repli de **1,00 à 0,82** pour les
   **68 bouches sans rythme déclaré** — soit **−18 % de cible sur la population
   majoritaire**, pendant que le lot annonce une hausse. La contre-épreuve de la v1 ne
   couvrait que la fiche à trois moments déclarés : **20 bouches sur 88**.

⇒ ⟳ **La ceinture passe DEVANT l'amplificateur.** `mouth_anchor.ts:666` calcule
`raw = (target.kcal * coverage * structure.share) / day.kcal` et `:671` pose
`physicalMax` : **cinq lignes d'écart, la même expression**. La v1 livrait `L9bis`
*après* `L11★`. **Inversé.**

**Deuxième, pour une autre raison : `L0-b` (la fenêtre du cuit).** Il ne casse pas un
calcul, il **change l'unité de valeur du produit** — un refus dur à 48 h plafonne chaque
session à deux jours de repas.

**Troisième : `S2`.** Une garde cassée bloque tout et ressemble à une garde qui marche.
⟳ Et elle atteint `sophia-brain/router/run.ts:292` : élargir la sévérité fait mordre le
verrou **dans la conversation**, sur une intolérance au lactose. C'est la famille exacte
du précédent que le dépôt a déjà payé — *armer sur `diabetes` a bâillonné un message
d'urgence*.

---

# ④ CE QUE CHAQUE PROFIL A FAIT CHANGER

| profil | en une ligne |
|---|---|
| **architecte** | A prouvé que **`SizableShare` n'existe pas** — le type réel `SizableMeal` porte **déjà** `items[]` et `memberIds[]` —, ce qui effondre le graphe §2.1 de la v1 et le report du lot 13 ; a inversé `L9bis` et `L11★` (ceinture avant amplificateur, cinq lignes d'écart) ; a trouvé **trois cycles cachés dans les critères d'acceptation**, dont `V0-D` qui exigeait deux lots de vagues ultérieures. |
| **nutritionniste** | A tué le littéral **`≥ 37 g/1 000 kcal`** — il vient de l'arithmétique d'une bouche fictive que le cas 08 a lui-même corrigée — et a mesuré que le plancher **`0,8 kcal/g` refuse le petit-déjeuner** (yaourt 0,59 · pomme 0,48 · shaker 0,36 · assiette à 500 g de légumes 0,79) ; a **retiré `L37`**, dont la constante est dérivée d'une bande citant une source contraire **dans le code**. |
| **sécurité alimentaire** | A trouvé que **`M1b` annulait `S1`** (le chat est le seul port d'écriture des deux planchers), que **la grossesse n'avait ni lot ni vague** alors qu'une femme enceinte déclarant une perte reçoit aujourd'hui une boîte pesée, et que **`restrictionFlagOf("no_account")` rend `false`** — le cas nominal du produit n'a aucun plancher TCA ; a porté le compte des surfaces du mineur de 8 à **12**. |
| **QA / mesure** | A **exécuté** les mesures et corrigé **huit chiffres**, dont deux qui renversaient un *pourquoi* : `issues[]` **est** persisté (677 lignes, 29 violations lisibles) et l'activité est à **1 / 24 / 18**, pas 87 sur 88 ; a montré que **l'épinglage est la norme du dépôt** (57 constantes épinglées, 57 non épinglées) et que **l'arme de `S5` n'existe pas** — le test RGPD est une liste écrite à la main. |
| **produit** | A compté les 31 décisions du registre : **4 traitées comme décisions, 10 déguisées en technique, 17 absentes** ; a déplacé la porte **G5 sur `L6′`** au lieu de `L26` ; a prouvé que **`L24` affaiblissait la porte qu'il prétendait brancher** (`mouthIsReader`, pas l'objectif) et relevé **neuf promesses** que le plan ne tenait pas dans ses propres mots. |

**Ce qui a été REFUSÉ, et pourquoi** — une revue n'a pas toujours raison :

- La revue produit demandait de **purger les 181 `portion_note`** dans le même lot que
  `L6′`. Refusé comme lot : purger une colonne lisible par tout le foyer sans savoir ce
  que l'écran affiche à la place **retire une information sans la remplacer**. La porte
  **G5** reste, et elle garde désormais `L6′` — ce qui était sa demande principale.
- La revue nutritionniste demandait de **retirer `L37` du plan**. Retenu, mais il n'est
  pas supprimé : il devient une **question ouverte documentée**, parce que le défaut
  qu'il décrit est réel (deux gardes, la plus stricte protège le moins bien) même si le
  remède proposé n'a pas de source.

---

# ⑤ CE QUE JE N'AI PAS PU VÉRIFIER — le résumé

Le détail est en **partie 6**, 17 entrées. Les cinq qui gouvernent le plan :

1. ⛔ **Le comportement réel de la chaîne d'ancrage** — aucun plan ne porte de boîtes.
2. **Le taux de journées calculables PAR LANGUE** — jamais mesuré, et le corpus ne porte
   **qu'un seul plan français** sur 180. ⟳ C'est aussi le **seul des dix compteurs du
   tableau de bord qui n'existe pas du tout**, et c'est le critère de fin de la vague 2.
3. ⛔ **La JUSTESSE des résolutions** — 95,3 % dit « une ligne a été trouvée », pas « la
   bonne ». Le taux d'erreur silencieuse est non nul en français (6,0 %) et **n'a jamais
   été mesuré en anglais**.
4. **Le verrou de lane (`per_portion`)** — calculé, journalisé nulle part. Je ne peux ni
   prouver ni réfuter qu'il a basculé.
5. **Le corpus est un banc** : **1 311 comptes de test sur 1 320**, et **aucun compte
   réel ne porte une ligne de mémoire**.

---
---

# ⑥ LES DÉCISIONS DU 2026-08-21 — 19 TRANCHÉES, 7 OUVERTES

> **Prises par le propriétaire le 2026-08-21**, après la première passe de revue.
> ⚠️ **Cinq d'entre elles étaient DÉJÀ tranchées dans les documents et la v1 les avait
> rouvertes** — c'est exactement le défaut que ce plan reproche ailleurs : reposer une
> question résolue efface la décision. Elles sont marquées ✔︎déjà.

## Ce qui est fermé

| # | décision | conséquence sur le plan |
|---|---|---|
| **15** ✔︎déjà | **Aucun objectif de poids sur un mineur.** Le champ part du front. ⚠️ **Et le littéral en base est maintenu** — il coûte une ligne et **ferme les quatre surfaces** | ⛔ **PORTE G4 FERMÉE.** `S4` est débloqué, **et il garde ses trois cas SQL** *(dont celui de l'ORDRE : `set_member_birth_date` écrit sans relire l'objectif)*. ⚠️ **Les 2 bouches existantes doivent être traitées** — c'est un geste à part, nommé |
| **14** ✔︎déjà | **Conservation = jour de cuisson + 2.** Cuit vendredi ⇒ mangé vendredi, samedi, dimanche. Lundi est trop tard | ⛔ **PORTE G3 FERMÉE**, et **48 h est écarté** : l'unité de valeur du produit est préservée. `L0-a` livre le `>` → `>=`. `L0-b` perd sa garde et **se recentre sur la congélation et les jours de cuisine dérivés** |
| **21** ✔︎déjà | **Le plafond de surplus monte à 0,5 kg/semaine**, la ligne d'avertissement | ⟳ **`L37` REVIENT dans la vague 4** *(la v1-bis l'avait sorti)*. ⚠️ Deux faits mesurés que la décision n'avait pas — **ce sont des contraintes d'implémentation, pas une réouverture** : ① `MAX_SURPLUS_FRACTION` est **dérivé** de `ENERGY_BANDS.muscle_gain.high` (`meal_envelope.ts:497`), donc **le relever déplace aussi la BANDE DE VERDICT** ; ② le commentaire de cette bande **cite Helms 2023 en sens contraire** — il faut le réécrire, sinon un futur lecteur trouvera un commentaire qui contredit la constante |
| **12** ✔︎déjà | **Soit le chat fait tout, soit il ne fait rien** — il ne fait rien, plus un **bouton de navigation** | ⛔ **`M1b′` confirmé.** Il retire **le tirage du LLM**, jamais le `direct_effect` des deux planchers déterministes — sinon il désarme `S1` |
| **9** ✔︎déjà | **Le champ `tradeoff` a un champ dédié**, hors du `why`, **avec son compteur** | `L35` livre le champ ; **le compteur est obligatoire** — champ déclaré par le modèle |
| **16** | **Le gramme QUITTE `portion_note`** et vit dans la boîte, qui a un destinataire. *« `member_portions` est lisible par tout le foyer, donc aucun fait de corps ne peut y transiter. »* | ⛔ **PORTE G5 FERMÉE.** `L6′` est débloqué **et porte la purge des 181 lignes** : ce n'est plus une question ouverte, c'est un invariant tenu depuis le début |
| **3** | **La bouche protégée ne bouge JAMAIS.** L'écart se rattrape en **add-on**, pas en faisant grossir la casserole | ✅ **et c'est déjà ce que le code fait** — tronc sur le MIN, *« on ajoute, on ne retire jamais »*. Rien à construire ; à **tester**, pour que ça ne dérive pas |
| **4** | **Le verrou de lane dégrade toute la table** — c'est l'arbitrage d'**indiscernabilité**, et il protège | ✅ comportement actuel. ⟳ **Ce qui manque devient un livrable** : une **phrase fixe, servie AUSSI dans des cas anodins**, pour que sa présence ne révèle rien. Ajoutée à `L35-a` |
| **6** | **La question existe déjà** : `portions`, cinq crans, avec `portions_subject` | ✅ **rien à inventer** — la question ferme sans lot |
| **22** | **A + B, jamais C** : diriger l'add-on protéique, **et** ouvrir le troisième état quand c'est impossible. **Ne jamais abaisser le plancher** | `L9bis` : le critère devient un **rapport par bouche**, avec add-on dirigé et état « impossible à couvrir » |
| **7** | **RNP, et on marque à part les nutriments qui n'ont ni RNP ni BNM** | ⛔ **PORTE G6 FERMÉE.** `L15` est débloqué. ⚠️ Et **le §3.5 du design doit être corrigé** : son texte dit « quatre AS sur neuf », son tableau porte dix lignes dont deux marquées |
| **17** | **On ne devine jamais un terme ambigu : le modèle écrit lequel.** C'est la règle du matcher, appliquée **en amont** | ⛔ **PORTE G8 FERMÉE.** `L19b` gagne un volet **prompt** : `pepper` devient une consigne d'écriture, pas un alias |
| **11** | **On demande** — une question fermée de plus, sur le patron du bilan qui **porte son référent** | lot mémoire : le bilan désambiguïse le refus d'un plat |
| **25** | **Une seule valeur : 400**, cohérente avec `TARGET_WEIGHT_KG_MAX` | `X1′` : direction fixée. ⛔ *« Deux copies d'un même nombre divergent, et c'est celle qu'on regarde le moins qui garde l'ancienne »* — `student_body_io.ts:89` porte le 350 |
| **18** | **Audit de `user_profile_facts` AVANT `M2`/`M3`, et c'est urgent** — *« un magasin de 11 880 lignes que le centre de notifications ne montrerait pas, c'est exactement le magasin caché qu'on supprime »* | ⟳ **`M-audit` devient un lot bloquant** de `M2` et `M3` |
| **8** | **On fixe maintenant, on révise quand des données existent** — mesurer est impossible, la fonction foyer n'a quasiment pas tourné | `D1′` livre les quatre jetons ; le seuil est **provisoire et daté** |
| **10** | **`portions` seul d'abord.** Les trois autres s'ajoutent **quand leur lecteur existe** — sinon on refabrique le champ sans lecteur | ⟳ **`M3` rétrécit** : cumuler `portion.adjust` dans une position bornée et visible. Rien d'autre |
| **24** | **A et B, selon la bouche** : une bouche **sans compte** n'a aucun moyen d'exporter, le maître les porte ; une bouche **avec compte** exporte les siennes — **règle R2 du roster, déjà en place** | `S5` : granularité fixée, plus une question ouverte |
| **23** | **Répondu par `L38`** : la cible suit l'objectif. **1,8 est défendable comme PLAFOND en prise ; comme DÉFAUT pour tout le monde, non** | `L38` : ce n'est pas une réouverture de la valeur, c'est **la fin de son usage comme défaut universel** |

## Ce qui reste ouvert — **sept**

| # | question | pourquoi elle t'appartient |
|---|---|---|
| **1** | **Le périmètre juridique** *(porte P0)* | coût, calendrier, risque. Le doc dit *« à qualifier avant le pilote payant »* ; le reste t'appartient |
| **2** | **Un moteur d'ancrage, ou deux** *(porte G7)* | décision de **moyens**. Position retenue : **C maintenant** — retirer de l'écran solo ce que la lane solo ne lit pas, *« honnête et gratuit »* — **A quand le temps existe** |
| **5** | **Régénérer est gratuit** | un plafond ajoute de la friction sur un geste légitime. **Arbitrage produit, pas technique** |
| **20** | **1 311 comptes de test sur 1 320** | dépend d'un fait inconnu : **y a-t-il de vrais utilisateurs en prod ?** Si c'est 9, mesurer en prod n'apprend rien |
| **13** | **Le bloc de déclaration de groupe devient-il inconditionnel ?** *(porte G2)* | tombe sous *« une garde à trou n'est pas une garde »* ⇒ penche vers **A** — mais **le coût du byte-identique n'a pas été mesuré** |
| **26** | **Portée de la ceinture `strict`** | même famille ⇒ penche vers **A** — mais **le coût côté chat n'a pas été mesuré** |
| **19** | **Granularité du facteur d'ancrage** | demande de **lire ce que `anchorFactorFor` fait aujourd'hui**, ce qui n'a pas été fait |

⇒ **Trois des sept (13, 19, 26) ne sont pas des décisions produit : ce sont des mesures
qui manquent.** Elles se ferment par une lecture de code et un compteur, pas par un
arbitrage — et elles sont donc **des lots de vague 0**, pas des portes.

---
---

# ⑦ COMMENT ON EXÉCUTE CE PLAN — ⛔ LIRE AVANT DE TOUCHER UN FICHIER

> **Ce document n'est pas une lecture, c'est un état.** Il se met à jour **au fur et à
> mesure**, par celui qui exécute, dans le même commit que le code. Un plan qui décrit
> l'état d'hier est pire qu'un plan absent : il **ressemble** à la vérité.

## La règle en une phrase

> **Un lot n'est PAS fini quand le code est écrit. Il est fini quand sa fiche porte sa
> `mesure APRÈS` réelle, datée, et que le seuil est atteint ou l'échec écrit.**

## Ce qu'on écrit dans la fiche, et quand

| moment | ce qu'on écrit, DANS la fiche du lot |
|---|---|
| **avant de coder** | la `mesure AVANT` **exécutée**, avec la commande littérale et sa sortie datée. ⛔ Si le chiffre du plan ne se reproduit pas, **on corrige le plan d'abord** — la v1 portait **huit** chiffres faux, et deux renversaient un *pourquoi* |
| **si la fiche se révèle fausse** | on la corrige **et on garde l'ancienne version barrée**, avec la marque ⟳ et la preuve. ⛔ **Ne jamais effacer une affirmation réfutée** : un lecteur qui ne la trouve plus la reconstruira. C'est pour ça que la v1 entière est conservée à côté |
| **après avoir codé** | la `mesure APRÈS` **exécutée**, avec son seuil : **atteint**, ou **manqué et pourquoi**. ⛔ Un seuil manqué qu'on réécrit après coup n'est pas une mesure, **c'est une justification** |
| **si le lot en révèle un autre** | on **ajoute une fiche**, on ne l'écrit pas dans un commentaire de code. `V0-D` est écrit pour ça : *« le lot EST ce que le run casse »* |
| **si une décision est prise** | elle va en **§⑥**, avec sa date et sa conséquence sur les lots. ⛔ **Jamais dans la tête de quelqu'un** — cinq décisions déjà prises avaient été rouvertes faute d'être écrites là |

## Ce qu'on écrit à la fin d'une VAGUE

Une vague n'est **pas close** sans ces trois choses, dans le **journal §⑧** :

1. la **sortie datée de `V0-E′`** relancée — les dix compteurs, archivés côte à côte avec
   la précédente ;
2. la **vérification en conditions réelles** de la vague, avec sa preuve — **une ligne en
   base ou un run, jamais un test seul** ;
3. ce que la vague a **révélé** et qui n'était pas prévu.

⛔ **Une vague dont la sortie n'est pas archivée n'est pas close, même si tout son code
est livré.** C'est la seule arme de `V0-E′`, et la revue QA a raison de dire que c'est un
engagement de processus : **il ne tient que s'il est écrit ici.**

## Les quatre choses à ne jamais faire à ce document

- ⛔ **Ne pas cocher un lot sans sa mesure.** Un lot « fait » sans chiffre est
  indiscernable d'un lot désarmé — c'est le mode d'échec principal de ce dépôt.
- ⛔ **Ne pas trancher une question de la partie 5 en passant.** Si un lot en a besoin,
  l'écrire comme une **porte** et s'arrêter.
- ⛔ **Ne pas supprimer un lot orphelin (§4.2) parce qu'il n'a pas de vague.** Il est
  listé précisément pour ne pas se perdre.
- ⛔ **Ne pas réécrire une `direction` après avoir vu le résultat.** La direction s'écrit
  **avant**. Si elle était fausse, on l'écrit — c'est une information, pas une faute.
- ⛔ **Ne pas prendre un arbitrage sans l'écrire en §⑨.** Décider est le défaut ; **ne pas
  le noter** est la faute.

---
---

# ⑧ JOURNAL D'EXÉCUTION — *(à remplir au fur et à mesure)*

| date | vague · lot | mesure AVANT | mesure APRÈS | seuil atteint ? | ce que ça a révélé |
|---|---|---|---|---|---|
| 2026-08-21 | — | *plan v2 écrit, 19 décisions prises* | — | — | *les cinq revues ont corrigé 14 faits ; la v1 est conservée* |
| 2026-08-21 | 0 · V0-A | 22:20:30 CEST — **144 `??`**, 168 `M`, 2 `D`, 2 `RM` ; 13 migrations `2026082*` non suivies | 22:23:58 CEST — **122 `??`** (−22), 22 `A`, 168 `M`, 2 `D`, 2 `RM` ; puis 22:25:53, cette fiche en index — 122 `??`, **23 `A`** ; `git ls-files --error-unmatch` → **22/22** | **les 2 seuils atteints, l'ARME à moitié manquée** — 22/22 et `M = 168` (≥ 168, aucun fichier d'une autre session emporté). Arbre tiers ne contenant que du commité : `deno check generate-household-meal-v1` **rc=0** ✅ ; `tsc -b --force tsconfig.app.json` **rc=1, 40 erreurs** ⛔ — 3 exports (`api/household.ts`, `M`) + 37 clés i18n (`en.ts`/`fr.ts`, `M`), **tous des fichiers suivis non commités**, aucun fichier neuf manquant | **le cœur du calcul du plan n'était pas versionné, et la fiche ne le voyait pas** : `mouth_anchor.ts` (ce que la journée VISE) et `mouth_energy.ts` (ce qu'elle LIVRE) étaient `??` alors que `generate-household-meal-v1/index.ts`, **suivi**, les importe. La fiche disait 18 fichiers ; il en fallait 22, et « 18 » ne comptait déjà pas sa propre énumération. **Second fait, plus dur : `armé par` et `risque` de cette même fiche se contredisent** — un `tsc` vert depuis un checkout propre est impossible tant qu'`en.ts`/`fr.ts` sont interdits de commit, parce que les fichiers neufs du front nomment des clés qui n'existent que dans leur modification. Troisième : `??` n'est **pas** un seuil reproductible — 142 → 144 en une nuit, et **+1 pendant les cinq minutes du lot** (316 → 317 lignes) |
| 2026-08-21 | 0 · Q-G2 | longueur du bloc, part d'élèves sans régime, tests protégés : **les trois non mesurés** | `FOOD_GROUP_DECLARATION_BLOCK` (`dietary_regime.ts:757-775`) = **968 car. ≈ 242 tokens**, soit **4,8 %** de la médiane d'un prompt solo réel et **3,1 %** d'un foyer (`llm_usage_events.prompt_tokens`) · sans régime déclaré : **136 plans / 180 (75,6 %)**, 81 bouches / 88, 24 foyers / 31 · bloc rendu inconditionnel ⇒ **2 rouges sur 6 164**, `deno check` vert, 0 migration | **mesure faite, porte G2 fermée côté coût** (§⑨ n° 3) | ⛔ **« 0 sur 9 810 » ne mesure PAS la désobéissance du modèle, et rendre le bloc inconditionnel ne changerait RIEN.** Le bloc est arrivé avec `meal.en.v16` le 2026-08-19 : **1 seul plan sur 180** a été généré sous v16+. Sur cette unique fois **le modèle a obéi** — `regime_belt` porte `groups_declared: 25, groups_valid: 25, groups_refused: 0` — et **l'écriture a jeté sa réponse** : `ingredientPayload()` (`meal_generation.ts:6593-6603`) recopie sept clés sans `group`, alors que le parseur l'avait posée (`:4433`, `:5004`). ⇒ fiche neuve **`L17-0`**. Second fait : le test qui porte le nom de la byte-identité (`dietary_regime_solo_lane_test.ts:96-105`) **ne la tient pas** — il compare `""` à `"   \n "`, deux prompts sans régime entre eux, et **reste vert** sous la modification |
| 2026-08-21 | 0 · Q-S2 | tours de chat qui mordraient si `strict` entrait sous `applyKeelOutputLocks` : **non mesurés** | rejeu à blanc important le code de production, fidélité prouvée (restreinte à `{medical}`, **0 écart** sur 5 701 tours) : `tours_total` **5 701** (et non 5 885) · `mordent_avec_medical` **7** · `mordent_si_strict` **7** ⇒ **0 nouveau mordu, 0,12 %**. Majorant si le porteur était celui qui parle : **73 / 3 708 = 1,97 %** | **seuil 5 % NON ATTEINT — 41× en dessous.** La porte reste ouverte sur les trois points d'entrée (§⑨ n° 4) | ⛔ **Le volume n'est pas le coût.** ① Sur les 14 `strict`, **6 seulement portent un jeton** : les 8 lignes `kind='diet'` n'entrent jamais sous la ceinture même élargie (`safetyConstraintTokens` ne rend pas `dietRef`) — et c'est **voulu**, c'est la cicatrice `diabetes`. ② Les morsures viennent **toutes des FORMES DE SURFACE** (`cheese` 19, `yogurt` 42, `couscous` 20) et **jamais du mot de la contrainte** (`gluten`, `lactose`, `dairy` : **0 occurrence** sur 5 701 tours). ③ L'exception de négation **n'en sauve aucune** (64/64, 23/23) alors qu'elle sauve `peanut` (23→12). ④ ⛔ **La ceinture n'a qu'UN repli**, `MEDICAL_BLOCK_FALLBACK_EN` — *« put it to a doctor »* — **faux 100 % des fois où il sortirait** pour une intolérance au lactose : **c'est là qu'est le coût de `S2`, pas dans le taux de refus**. ⑤ `allergen_bridge.ts:76` porte **déjà** `BLOCKING_SEVERITIES = {medical, strict}` : `S2` **referme une divergence existante**, il n'en crée pas une. ⑥ `:408` **n'est pas un filtre de ceinture** mais un booléen de prompt — il ne fait pas partie du geste. ⑦ Pour `S1b` : `surfaceFormsFor('fruits_de_mer')` rend bien `[]`, **mais le jeton lui-même matche** — la ceinture de ce ref est morte **en anglais seulement**, pas morte tout court |
| | | | | | |


---
---

# ⑨ LES DÉCISIONS PRISES À MA PLACE — *(registre à remplir, à valider après coup)*

> **Le défaut est de DÉCIDER, pas de s'arrêter.** Un exécutant qui bloque à chaque
> arbitrage ne livre rien. Il tranche, il écrit ici ce qu'il a tranché, et le propriétaire
> valide après coup.

## Le critère, et il n'y en a qu'un : **la réversibilité**

| | il décide seul | il s'arrête |
|---|---|---|
| **ce qui se défait** par un commit, un `grant`, un `update`, un revert | ✅ **il tranche et il note** | — |
| **ce qui ne se défait pas** — une donnée écrasée, une ligne de sécurité réécrite, un envoi vers l'extérieur, un plancher affaibli, une dépense hors plafond | — | ⛔ **il s'arrête et il demande** |

⛔ **La liste courte de ce qu'il ne prend JAMAIS seul** *(elle est fermée — tout le reste
est délégué)* :

1. **Les commandes interdites** — `secrets set/unset`, `db reset`, `db push`,
   `functions deploy`, `config push`, `link`, `projects/branches delete`. *(Bloquées par
   le hook de toute façon.)*
2. **Écrire sur une ligne de sécurité déjà déclarée par quelqu'un** — migrer la ligne
   `fruits_de_mer` active, corriger les **2 bouches mineures** qui portent un objectif.
   **Une allergie ou un objectif déclarés appartiennent à la personne**, pas au plan.
3. **Affaiblir un plancher** — TCA, mineur, grossesse — ou **retirer une garde** existante.
   *(L'élargir ou en poser une neuve : délégué.)*
4. **Supprimer des données**, ou écraser un fichier appartenant à une autre session.
5. **Dépasser le plafond de dépense** fixé au lancement.
6. **P0 — la qualification juridique.** Il ne peut pas la faire.

⚠️ **Tout le reste est délégué**, y compris ce que la v2 traitait comme des murs : le
commit de `V0-A`, le run réel `V0-D` *(dans le plafond)*, les `revoke` de `S6`
*(réversibles par un `grant`)*, et **les décisions de la `VAGUE D` qui sont réversibles**.

## Le registre

| # | décision prise | par quel lot | ce qu'il a choisi, et pourquoi | ce que coûte le retour arrière | validé ? |
|---|---|---|---|---|---|
| **1** | **L'ARME de `V0-A` est déclarée MANQUÉE côté front, ATTEINTE côté back — et `V0-A` est tenu pour livré.** Une fiche neuve **`V0-A-bis`** porte la fermeture | `V0-A` | L'objet du lot (« le code qui tourne devient reproductible ») est **atteint pour la lane foyer** : `deno check generate-household-meal-v1` rend `rc=0` depuis un arbre ne contenant que du commité. Les 40 erreurs `tsc` viennent **toutes** de fichiers **suivis et modifiés** (`en.ts`, `fr.ts`, `api/household.ts`), que le plan **interdit de commiter**. ⇒ l'arme est bloquée par une **règle du dépôt**, pas par le lot. Arrêter la vague 0 dessus arrêterait tout le plan sur une contrainte qui ne lui appartient pas | **gratuit** — rien à défaire : le commit reste valide et nécessaire dans les deux cas. Revenir dessus, c'est **rouvrir la ligne de journal** et décider que la vague 0 attend `V0-A-bis`. Aucun code, aucune migration, aucune donnée | |
| **2** | **`??` cesse d'être un seuil.** Le seuil de `V0-A` est **22/22 par `git ls-files --error-unmatch`**, plus `M ≥ 168` | `V0-A` | Mesuré : `??` est passé de 142 (plan) à 144 (lancement) en une nuit, **et a gagné +1 pendant les cinq minutes du lot** — le dépôt est partagé et d'autres sessions y écrivent en direct. Un seuil qu'une session voisine peut faire échouer **n'est pas un seuil** | **gratuit** — c'est une règle de lecture du journal, pas un changement de code. Le chiffre brut reste écrit à côté | |
| **3** | ⛔ **PORTE G2 FERMÉE : le bloc de déclaration de groupe devient inconditionnel.** Mais ⚠️ **ça ne suffit pas, et la fiche `L17` doit le savoir** — fiche neuve `L17-0` | `Q-G2` | Le coût a été **mesuré**, c'est ce qui manquait pour trancher : **2 rouges sur 6 164 tests**, les deux portant sur la conditionnalité elle-même et **aucun sur un comportement** · **968 car. ≈ 242 tokens**, soit 3 à 5 % d'un prompt réel, et **dans le préfixe cachable** (donc une invalidation de cache unique, pas 242 tokens par appel) · **0 migration**. La position écrite du dépôt — *« une garde à trou n'est pas une garde »* — penchait déjà vers oui. **Élargir une garde est délégué** | **un commit** — remettre le bloc sous `dietaryRegimePromptLine` et re-verdir 2 tests. Aucune migration, aucune donnée, aucun effet rétroactif sur les plans déjà persistés | |
| **4** | ⛔ **La ceinture de sortie `strict` s'élargit aux TROIS points d'entrée**, chat compris — pas aux seuls générateurs. Et `S2` gagne une **contrainte d'implémentation** : un **second texte de repli** | `Q-S2` | Le seuil était **écrit d'avance dans la fiche** (*« si > 5 % des tours mordent, la porte se referme sur les générateurs seuls »*) : mesuré à **0,12 %**, majorant **1,97 %** — 41× sous le seuil. L'argument « ça ferait trop mordre le chat » **ne tient pas**. Et `allergen_bridge.ts:76` porte **déjà** `{medical, strict}` : refuser l'élargissement **laisserait deux copies diverger**. **Élargir une garde est délégué** | **un commit** — remettre `if (constraint.severity !== "medical") continue;` à `safety_constraints.ts:591`. ⚠️ **Mais le retour arrière n'est gratuit que TANT QUE le second repli n'a pas été vu par un utilisateur** : une fois qu'une intolérance a reçu une réponse adaptée, la lui retirer est visible | |
| **5** | **L'orchestrateur tient seul §⑨ et §⑩.** Les sous-agents rendent leur ligne de journal et leur fiche ; ils n'écrivent pas dans le registre | *processus* | §⑦ demande que la fiche et le journal partent **dans le commit du code**. Mais **tout lot touche ce document**, donc sous une lecture stricte de « jamais deux lots sur un même fichier » **aucun lot ne peut être parallèle**. Les écritures du document sont donc **sérialisées par l'orchestrateur**, et le commit du code emporte la fiche | **gratuit** — une règle de conduite. Revenir dessus, c'est laisser chaque sous-agent écrire, au prix de conflits sur ce fichier | |

⚠️ **Trois colonnes sont obligatoires, et la troisième est celle qu'on oublie** : sans
**« ce que coûte le retour arrière »**, valider après coup est un pari — c'est le même
défaut que *« sans la citation, Défaire est un pari »* du centre de notifications.

⛔ **Et une décision réversible qui n'est PAS écrite ici devient irréversible en
pratique** : personne ne saura qu'elle a été prise, ni sur quoi revenir.


---
---

# ⑩ LE BUDGET MODÈLE — par vague

> ⛔ **Il ne s'exprime PAS en euros, et c'est mesuré.** `gpt-5.6-sol` et `gpt-5.6-luna` —
> **les modèles de la lane de génération** — totalisent **108 appels et 1 670 675 tokens
> pour un `cost_usd` de 0** dans `llm_usage_events` : ils ne sont **pas tarifés**
> *(lot `H6`)*. Les anciens le sont : `plan_generation` sur `gpt-5.4-mini` coûte
> **0,0034 $/appel**.
>
> ⇒ **L'unité est la GÉNÉRATION DE PLAN.** L'ordre de grandeur mesurable est le token :
> **~13 000 par génération** sur ces modèles.

## La commande qui compte

```sql
select model, count(*) as appels, sum(total_tokens) as tokens
from llm_usage_events
where created_at > '<horodatage du lancement>'
  and operation_family = 'plan_generation'
group by 1;
```

⚠️ **Une génération de foyer = 1 appel principal + jusqu'à 1 relance + 1 appel court de
secours** (`composition_fill`). **Compter les GÉNÉRATIONS, pas les appels.**

## Le plafond, vague par vague

| vague | plafond | à quoi il sert |
|---|---:|---|
| **0** | **3** | `V0-D` : 1 run + 2 de marge — sa direction dit qu'on **s'attend** à ce qu'il sorte incomplet |
| **1** | **9** | chaque garde veut un cas qui **MORD** et un cas qui **PASSE** : `S2`, `L0bis`, `C1`, `L0-a`, `L24′`. + 1 de perte *(médiane mesurée à 164 s ; un 429 archive quand même)* |
| **2** | **16** | ⛔ **10 pour `L2-lang` seul** — cinq `fr-FR`, cinq `en` : *« rien d'autre ne le remplace »*. + 4 pour remplir le sas de `L18b` *(`unknowns_median` doit baisser sur deux semaines)*. + 2 de marge |
| **D** | **0** | des signatures, pas des runs |
| **3** | **8** | `L6′` est *« ce que le run casse »* : compter des itérations, pas un run. `L16′` et `X2′` n'en demandent aucune |
| **4** | **20** | ⛔ **la plus chère, et c'est normal** : huit lots qui déplacent des grammes, chacun avec un **avant/après sur la MÊME fixture**. `L9bis` et `L11★` en demandent le plus |
| **5** | **12** | cinq lots, et la vérification de clôture est *« l'union de deux régimes MORD pour la première fois »* |
| **6** | **8** | peu de génération : `L35` pour voir les phrases, `M8` pour un état de session |
| | **≈ 76** | **soit ~1 M de tokens** sur les modèles de génération |

## ⛔ UN TIMEOUT NE SE RÉESSAIE PAS — IL SE MESURE

> **Si les runs expirent, on relève le timeout. On ne relance pas.** Un réessai brûle une
> génération du plafond et ne change rien à la cause.

**Et le dépôt a déjà payé cette erreur, avec le diagnostic écrit dans le code**
(`generate-household-meal-v1/index.ts:4308-4321`) :

> *« Cette lane passait `GLOBAL_AI_MODEL` faute de nommer un modèle […] **LA TENTATIVE
> PRÉCÉDENTE A ÉCHOUÉ, ET ON SAIT ENFIN POURQUOI** : le timeout HTTP par défaut est de
> **110 s** (`GEMINI_HTTP_TIMEOUT_MS`) alors que le banc mesure un modèle 5.6 à **164 s de
> MÉDIANE**. »*

**La branche a été réparée le 2026-08-19 — après avoir été réessayée en vain.**

**Les trois horloges, et elles ne sont pas les mêmes :**

| horloge | valeur | où |
|---|---|---|
| `GEMINI_HTTP_TIMEOUT_MS` | **110 s** par défaut — **sous la médiane mesurée** | l'appel modèle |
| `PLAN_HTTP_TIMEOUT_MS` | **300 000 ms** (5 min) | la lane de plan |
| le worker | coupe à **400 s** | au-dessus des deux |

⇒ **La marge existe** : ce n'est pas le worker qui contraint, c'est le timeout de l'appel.

**Le geste, dans cet ordre :**

1. **Mesurer** — `select model, percentile_cont(0.5) within group (order by latency_ms),
   max(latency_ms), count(*) from llm_usage_events where status <> 'success' … group by 1`.
2. **Comparer** la médiane observée au timeout en vigueur.
3. **Relever le timeout** si la médiane le dépasse, et **l'écrire au registre §⑨** — c'est
   une décision réversible.
4. **Seulement alors**, relancer.

⛔ **Deux réessais consécutifs sur un timeout sans avoir mesuré la latence sont une
faute** : ils consomment le plafond et **masquent la cause**. ⚠️ Et un **429 archive quand
même le prompt entier** — un réessai n'est jamais gratuit, même quand il échoue.


⛔ **Le plafond se rouvre vague par vague, jamais d'un coup.** L'exécutant rapporte le
**dépensé réel** à la clôture de chaque vague, dans le journal §⑧ — et le plafond de la
vague suivante se pose **en connaissance de ce chiffre**, pas de cette estimation.

⚠️ **Ces huit nombres sont une estimation, pas une mesure.** Ils sont ici pour que
personne n'ait à revenir demander à chaque vague — **pas** pour être défendus quand le
réel les contredira. Le premier chiffre réel *(vague 0)* les remplace tous.


---
---

# PARTIE 1 — L'ÉTAT DES LIEUX, MESURÉ

## 1.1 ⟳ Les entrées du moteur — la v1 se trompait de dénominateur

| entrée | remplie | dénominateur | ce qui gouverne à la place |
|---|---:|---:|---|
| ⟳ facteur d'activité : `crossed` / `legacy` / `assumed` | **1 / 24 / 18** | 43 **lignes de corps** | 24 bouches passent par `ACTIVITY_FACTORS` (1,45→2,00), **pas** par le repli 1,5 |
| ⛔ ⟳ bouches **sans aucune ligne de corps** | **45** | 88 bouches | **aucune enveloppe du tout** |
| `target_pace_kg_per_week` | **4** | 88 | `DEFAULT_PACE_KG_PER_WEEK = 0,25` |
| `eating_rhythm` | **20** | 88 | `declaredSlots: []` ⇒ **couverture = 1** pour 68 bouches |
| les trois cases `takes_*` | **2** | 43 corps | `COMPOSED_DISH_MEAL_SHARE = 0,42` |
| `appetite` déclaré | **2** | 43 | `×1,00` |
| `fixed_intakes` | ⟳ **1 ligne** | toute la base | — |
| `birth_date` sur `profiles` | **119** | 1 312 (**91 % NULL**) | `weekPlanAgeGate` **passe** sur `absent` |

⟳ ⛔ **La v1 écrivait « le repli EST le produit, à 87 bouches sur 88 ». C'est faux, et la
réalité est pire.** Le repli d'activité ne gouverne que **18 corps** ; 24 passent par la
table complète. Mais **45 bouches sur 88 n'ont aucune ligne de corps**, donc ni repli, ni
facteur, ni enveloppe. Le problème n'est pas « une mauvaise hypothèse » — c'est
**l'absence d'entrée**, et il est deux fois plus large.

⟳ ⚠️ **Et le compteur que `L16` voulait construire EXISTE DÉJÀ** :
`ACTIVITY_FACTOR_SOURCES = ["crossed","legacy","assumed"]` (`meal_envelope.ts:350`),
agrégé et journalisé (`generate-household-meal-v1/index.ts:5472` et `:5726`). Il n'a
jamais tourné, faute de plan généré. `L16` s'armait sur un compteur qu'il déclarait
inexistant et qui est écrit.

## 1.2 Le corpus de mesure est presque entièrement fictif

```
auth.users                                   1 320
  dont comptes de test                       1 311
  dont comptes non-test                          9
porteurs d'une clé de mémoire                   12   ... dont non-test : 0
```

⛔ **Aucun compte réel ne porte une ligne de mémoire.** Les chiffres du `DESIGN-MEMOIRE`
mesurent des fixtures QA, pas un produit sous-utilisé.

⚠️ **Une exception, et c'est le signal le plus fort du dossier** :
`cooking_session_states` est à **0 absolu** — QA compris. Le seul retour qui **détruit**
des repas n'a jamais été répondu par personne.

## 1.3 La nomenclature des documents ne correspond pas au schéma

| nommé dans les documents | réalité |
|---|---|
| tables `retained_*` | **clés jsonb** de `student_goals.practical_constraints` |
| `plan_feedback` | la table s'appelle `meal_plan_feedback` |
| `draft_note_*`, `food_preference*` | **n'existent qu'en code** |
| `household_composition/portions/diet` | **des MODULES**, pas des tables |
| `household_mouths` | **n'existe pas** |
| `member_portions` | une **colonne jsonb** de `student_generated_meals` |
| ⟳ **`SizableShare`** | ⛔ **N'EXISTE PAS.** 0 occurrence hors `scratchpad/`. Le type réel est **`SizableMeal`** (`household_portions.ts:2644`), qui porte **déjà** `memberIds: readonly string[]` (`:2660`) **et** `items: readonly SizableItem[]` (`:2672`) |

⟳ ⛔ **La dernière ligne renverse deux conclusions du design.** *« Une part n'est qu'un
identifiant et un scalaire, il n'y a nulle part où écrire une variante »* est **faux** :
l'endroit existe. Le graphe de la v1 et le report du **lot 13** reposaient dessus.

## 1.4 Ce qui est écrit, testé, et n'a aucun appelant

| module / garde | fichier | appelants réels |
|---|---|---:|
| `canEmitMouthEnergy` | `energy_gate.ts:528` | **0** |
| `escalateMinorStudent` | `student_body_io.ts:452` | **0** *(son appelant `generate-week-plan-v1` a été retiré)* |
| `portionAnchorFor` / `portionAnchorPromptLine` | `portion_anchor.ts:105,153` | **0** |
| `scaleFactorsFor` / `scaleIngredients` / `isScalableUnit` | `portion_scaling.ts` | **0** |
| `unmetDemand` / `neededPotFactor` | `pot_demand.ts:88,168` | **0** |
| `AnchorFactor.raw` | `mouth_anchor.ts:478` | **produit, jamais lu** |
| `trunkSentinelGaps` | `household_composition.ts` | **0** |
| `classifyAndPersistConversation` | `conversation_retained_io.ts:202` | **0** |
| `constraintsForPrompt` | — | **0** — mort par archivage |
| `promote_pending_food_{compositions,prices}()` | migrations | **0** — et 0 des 22 crons |
| lecture des prix (6 colonnes + 3 vues) | — | **0** |
| ⟳ ~~`protein_anchor.ts`~~ | ⟳ **RETIRÉ DE CETTE LISTE** | ⟳ **il mord** (lane solo) |

⚠️ `householdAppetite` a 1 appelant réel, journalisé `steering: false` — **mesuré, jamais
branché**, le commentaire `:5364` le dit.

## 1.5 L'état des cinq décisions du design foyer

| | décision | état mesuré |
|---|---|---|
| **D1** | le curseur, **4 réponses** | ⚠️ **PARTIEL** — `COOKING_SHAPES` n'a que **3** jetons ; la 4ᵉ est un `null`. Le curseur a **plafonné 8 fois** |
| **D2** | le curseur ne décide jamais de la sécurité | ✅ **tourne** |
| **D3** | la hiérarchie, 5 rangs, en récence | ⛔ **n'existe pas** — `PRECEDENCE_BLOCK` est enterré sous quatorze blocs et ne nomme aucun objet du foyer |
| **D4** | aucun objectif de poids sur un enfant | ⛔ **LE CODE A TRANCHÉ L'INVERSE** le 2026-08-18. **2 bouches mineures portent `fat_loss`/`muscle_gain`** |
| **D5** | le maître génère, les autres sont informés | ⚠️ partiel — le tuyau d'avis existe, la règle « sujet foyer / sujet bouche » n'a aucune implémentation |

Sur les **23 identifiants** nommés par les 166 conflits : **20 à zéro occurrence**.

## 1.6 Ce que la sécurité tient — et ce qu'elle ne tient pas

**Solide, et il faut le dire :** le plancher TCA est **fail-closed sur le chiffre, prouvé
à l'exécution** (`energySafetyGates` lève sur `undefined`, lève sur un `restrictionFlag`
non booléen, et le `if` du plancher ne prend **aucun `&&`**) · **340/340** `member_id` en
uuid, **0** prénom en clé · **0** kcal dans `member_portions` · **aucun matcher maison**
sur le chemin allergène · la lane **foyer** rend **503** quand elle ne peut pas lire les
contraintes.

**Ce qui ne tient pas, mesuré :**

| trou | mesure |
|---|---|
| ⛔ **La ligature tue le plancher d'allergie.** `safety_constraint_floor.ts` porte sa **propre** `normalize()`, sans le repli de ligatures du 2026-08-19. ⟳ **Exécuté** : `"allergique aux œufs"` ⇒ `null` · `"oeufs"` ⇒ `{allergen_ref:"egg", severity:"medical"}`. Locale par défaut : **`fr-FR`** | 1 ligne, 0 test |
| ⛔ **La ceinture de sortie ne couvre que `severity='medical'`** | ⟳ **35 medical · 14 strict · 9 preference** = 58 actives, dont **6 non couvertes** |
| ⛔ ⟳ **Et le repli de la ceinture foyer est armé et mort** : `householdAllergenRefs` retombe sur un slug littéral (`fruits_de_mer`) pour lequel `surfaceFormsFor` rend `[]` — **la ceinture cherche une chaîne française dans un texte anglais, ne la trouvera jamais, et ne dira rien** | 1 ligne active |
| ⛔ **La lane SOLO est fail-OPEN** sur la lecture des contraintes | asymétrie avec le 503 du foyer |
| ⛔ ⟳ **Une bouche SANS COMPTE — le cas nominal — n'a aucun plancher TCA** : `restrictionFlagOf("no_account")` rend **`false`**, la porte laisse passer, `executedPaceFor` ouvre le déficit. **Le commentaire du fichier affirme l'inverse** (`household_portions.ts:1972`) | 88 bouches |
| ⛔ **La garde du plan « mineur » est morte** + son entrée manque | `escalateMinorStudent` 0 appelant · `birth_date` NULL sur **1 193/1 312** |
| ⛔ **Aucune règle alimentaire de grossesse.** ⟳ Chemin vérifié : `conditionRef` n'est lu par **aucun calcul d'énergie**, donc `executedPaceFor` amène une femme enceinte jusqu'à `energyFloorFor("female") = 1 200 kcal`. **Elle reçoit une boîte pesée en déficit** | **0 ligne** `condition_ref` |
| ⛔ **Contamination croisée : RIEN** | 2 occurrences, aucune fonctionnelle |
| ⟳ ⛔ **`MAX_FRIDGE_DAYS` pousse un `issue` et ne rejette rien — MAIS L'ISSUE EST PERSISTÉE** : `generated_from.issues`, **112 plans, 677 lignes, 29 violations de conservation sur 14 plans**, en clair | **le « avant » de `L0` existe aujourd'hui** |
| ⛔ **`household_member_allergies` et `household_food_restrictions` ne sont pas réclamées par le lifecycle RGPD** | ⟳ **et le test qui devrait le dire ne peut pas** : `keel_gdpr_lifecycle_test.ts` est une **liste écrite à la main**, sans énumération d'`information_schema` |
| ⛔ **Grants par défaut jamais révoqués** : `anon` a S/I/U/D sur `profiles`, `student_generated_meals`, `weekly_reviews`, `substances*` | `profiles` porte `birth_date`, l'entrée de la porte mineur, policies `TO public` avec clause `ALL` |
| ⚠️ **181 `portion_note` sur 340 portent un GRAMMAGE par bouche** | ⟳ ⛔ **et ce n'est pas seulement « l'esprit » de la règle** : la migration `20260808000000:196` interdit la kcal **ET LA RAISON** — *« l'instruction est publique, le pourquoi ne l'est pas »*. « 1,5 part » est une consigne ; « Roxane 394 g · Zoe 344 g · Lubna 384 g » **est la raison écrite en chiffres** |

---
---

# PARTIE 2 — LE GRAPHE

## 2.1 Les quatre racines

```
RACINE A — LA BOÎTE PERSISTÉE  (dishes[].boxes)
│   0 plan sur 180. Le code l'écrit, personne ne l'a exécuté.
├─► mouthDayEnergy ─► householdAnchors ─► anchorFactorFor   (« cible ÷ livré »)
├─► MEAL_MAX_GRAMS_PER_KG   (maxMealGrams nul sans boîtes ⇒ physicalMax = Infinity)
├─► composedDishShare · dayCoverageOf
├─► le filtre v4 de portion_note   (dish.boxes.length === 0 TOUJOURS vrai)
└─► readBoxes() côté écran         (0 boîte rendue sur 102 plans foyer)
    ⇒ bloque L9bis · L11★ · L13 · L38 · et TOUTE mesure en grammes
    ⟳ NE bloque PAS L26 : SizableMeal porte déjà items[] et memberIds[]

RACINE B — LA JOURNÉE CALCULABLE  (gouvernée par la PESÉE)
│   solo 7,8 % résolu-et-pesé · foyer 80,1 % · porte BINAIRE (zéro toléré des 2 côtés)
├─◄ L-1 unit_grams (72/923) · L19b alias + `complet` · L-C lignes cuites
├─◄ L17 abstention pesée ─── PORTE G2 ───► FOOD_GROUP_DECLARATION_BLOCK (0/9 810)
└─◄ le PROMPT (missing_quantity vient du modèle qui n'écrit pas de quantité)
    ⇒ gouverne la PORTÉE de tout lot qui déplace un gramme

RACINE C — LES ENTRÉES DU CORPS
│   ⟳ 45 bouches sur 88 n'ont AUCUNE ligne de corps
│   activité crossed/legacy/assumed = 1/24/18 sur 43 · pace 4/88 · rythme 20/88
└─► L16 · L11★ · L1 · L38 agissent sur un REPLI, ou sur RIEN

RACINE D — LA SÉCURITÉ  (indépendante des trois autres)
└─► ne bloque aucun calcul ; bloque le PILOTE PAYANT
```

## 2.2 ⟳ La chaîne du gramme — L'ORDRE A ÉTÉ INVERSÉ

```
V0-E′ mesurer ─► V0-D run ─► L6′ la boîte en base   [PORTE G5, PORTE P0]
                                │
                                ├─► L9bis   LA CEINTURE D'ABORD          ◄── inversé
                                │     └─◄ L4 (le groupe déclaré d'un apport)
                                │
                                └─► L11★   L'AMPLIFICATEUR ENSUITE
                                      ├─◄ le repli d'occasions (:423)     ◄── manquant en v1
                                      ├─◄ la soustraction des apports fixes (inexistante)
                                      └─► L38 · L12 · L13
```

⛔ ⟳ **Pourquoi cet ordre, et pas l'inverse.** `mouth_anchor.ts:666` :
`const raw = (target.kcal * coverage * structure.share) / day.kcal` — puis `:671` :
`physicalMax = weightKg > 0 && day.maxMealGrams > 0 ? … : Infinity`.
**L'amplificateur et la ceinture sont dans la même expression, à cinq lignes.** La v1
livrait le ×2,38 avant la seule borne physique, et son propre §3 expliquait pourquoi
c'était dangereux.

⛔ **`L11★` et `L22` restent UNE SEULE PORTE** : une occasion couverte par une habitude
résolue **sort du dénominateur** et **ne se soustrait pas en plus**. ⟳ Mais la règle
suppose une soustraction qui **n'existe pas** : `mouth_anchor.ts` et `mouth_energy.ts`
portent **0 occurrence** de `fixedIntake`. **Il n'y a rien à ne pas compter deux fois —
il faut d'abord construire le chemin.**

## 2.3 ⟳ Les dépendances que les revues ont RETIRÉES

| dépendance de la v1 | pourquoi elle est fausse |
|---|---|
| `L11★` ← `E1` | `mouth_anchor.ts` n'est importé que par la lane **foyer**. `generate-meal-v1` n'importe **ni `mouth_anchor` ni `mouth_energy`**. Le risque annoncé de `E1` (« la lane solo se met à appliquer 0,42 ») est **impossible** |
| `L11★` ← `L16` | `L16` est un lot de **mesure + décision**. Il ne livre aucun symbole que `mouth_anchor.ts:207/261/399` consomme |
| `X2` bloque `L1`, `L37`, `L38` | `X2` épingle des constantes de `mouth_anchor.ts` ; L1/L37/L38 touchent `meal_envelope.ts:505/496/551`. **Zéro intersection** — remplacé par `X2′`, qui devient une **règle de dépôt** |
| `D3′` ← `L6′` | le prompt est assemblé à `index.ts:3971`, les boîtes dimensionnées à `:5402`, **après** l'appel modèle. 1 400 lignes d'écart |
| `C1` ← `L26` | `dedicatedDishesFor` est **déjà câblé** (`index.ts:3448`) et **28 plats dédiés** sont mesurés. La prémisse existe aujourd'hui ⇒ **`C1` remonte en vague 1** |
| `L8` ← `D3′` | aucun symbole partagé |
| `L30b` ← `L6′` | `gramsRaw` par ingrédient existe déjà. Un **constat** de coût se calcule sans boîte. Dépendance de **précision**, pas de blocage |
| `L24` ← `L23` | ⛔ **`L23` n'existe nulle part** — une seule occurrence, celle-là |

## 2.4 ⟳ Les dépendances que les revues ont AJOUTÉES

| lot | dépendance réelle | preuve |
|---|---|---|
| `E1` | ⛔ **la PORTE G7** | `generate-meal-v1` n'importe rien de la chaîne d'ancrage. « Brancher une lecture » = **porter le moteur**. La plus grosse sous-estimation de la v1 |
| `L11★` | le **repli d'occasions** (`:423`) et la **soustraction des apports fixes** (inexistante) | −18 % de cible sur 68 bouches sinon |
| `L9bis` | **doit précéder `L11★`** ; et **`L4`** le précède | `:666`/`:671` · `L4` déclarait déjà bloquer sa justesse |
| `L0★` | **`grocery_waves.ts` + `accident{,_io}.ts`** | `MAX_FRIDGE_DAYS` est **ré-exporté 2 fois** et gouverne **la date de courses** (`grocery_waves.ts:211`) ; épinglé par `week_bounds_test.ts:350` |
| `S2` | **le routeur du chat** | `applyKeelOutputLocks` est importé par `sophia-brain/router/run.ts:292` — élargir la sévérité fait mordre le verrou **en conversation** |
| `L6′`, `L16`, `D1′`, `L24′`, `L0-a` | **`H1` + `H2`** | `agent-gate.sh` ne lance **pas** vitest et `tsconfig.app.json:29` exclut les tests : tout lot à surface front est **invérifiable par le gate** |
| `S4` ↔ `L37` | même RPC, même CHECK | deux migrations sur `keel_household_set_member_target` / `household_members_target_pace_range_check` |

## 2.5 ⟳ Les doublons de constante — quatre porteurs, et ils divergent DÉJÀ

```
TARGET_WEIGHT_KG_MIN / MAX
   energy_target.ts:213-214      25 / 400     (source annoncée)
   weight_pace.ts:588-589        25 / 400     (redéclarées — le commentaire dit
                                               « importées », le fichier ne les importe pas)
WEIGHT_KG_MIN / MAX
   weekly_flow.ts:92-93          25 / 400
   student_body_io.ts:88-89      25 / 350     ⛔ DÉJÀ DIVERGENT
```

⟳ **La v1 écrivait « valeurs identiques aujourd'hui, donc le défaut est invisible ».
C'est faux : la divergence a eu lieu.** Et sa mesure d'après
(`grep -c 'TARGET_WEIGHT_KG_MIN\s*='` → 1) **ne matche pas** `WEIGHT_KG_MIN =` : le lot
se serait déclaré réussi en laissant deux copies en place, dont celle qui diverge.

## 2.6 ⟳ Les tests qui ne peuvent pas rougir — c'est une règle de dépôt, pas un fichier

`mouth_anchor_test.ts` (35 tests, **0 échec en 31 ms**) importe les constantes qu'il
vérifie et recalcule l'attendu avec elles. Changer `0,42` en `1,0` **ne rougit rien**.

⟳ **Mais la v1 se trompait sur l'ampleur ET sur la norme :**

```
constantes DÉJÀ épinglées par un littéral dans _shared/keel/*_test.ts   57
   dont ACTIVITY_FACTOR === 1.5   et   MAX_FRIDGE_DAYS === 3
constantes importées, assertées, JAMAIS épinglées                       57
   réparties sur ~40 fichiers, pas un seul
```

**L'épinglage est la norme du dépôt.** Les non-épinglées les plus dangereuses sont
celles qu'un lot du plan déplace : `DENSITY_CEILING_FAT_LOSS`/`_DEFAULT` (L38, L9bis) ·
`KEEL_MINOR_AGE` (S3, S4) · `BOX_FACTOR_MIN`/`MAX` (L6′) · `PACE_WARN_UP_KG_PER_WEEK`
(la question `L37`) · `MIN_RESOLUTION_FOR_VERDICT`, `PER_PORTION_PROTEIN_G` (L9bis) ·
`FILL_REQUEST_CAP` (L18b) · `MEAL_COMPONENT_KCAL` — ⟳ **que `X2` avait oubliée alors que
`L11★` la modifie**.

⚠️ `SLOT_DAY_WEIGHT` et `MEAL_COMPONENT_KCAL` sont des `Record`, pas des scalaires :
`assertEquals(<CONSTANTE>, <littéral>)` ne s'y applique pas tel quel — il faut épingler
**l'objet entier**.

---

## 2.7 LES PORTES — elles ne sont pas des lots

> ⚠️ **Aucune n'est tranchée ici.** Chacune porte ce qu'elle bloque et ce qu'il faut
> pour la lever.

> ⟳ **CINQ PORTES ONT ÉTÉ FERMÉES le 2026-08-21** *(voir §⑥)* : **G3, G4, G5, G6, G8**.
> Il en reste **trois**, et deux d'entre elles ne sont pas des décisions produit mais des
> **mesures manquantes**.

| | porte | état | ce qu'elle bloque | pour la lever |
|---|---|---|---|---|
| **P0** | ⛔ **Qualification juridique** | ⛔ **OUVERTE** — déficit **nominatif** et prescription de portions pour des **tiers sans compte**, en France | `L6′`, `L24′`, **le pilote payant**. Le seul trou qui peut annuler le produit entier | un avis juridique. **Coût de conseil** |
| **P1** | **Les questions du corps** | ⚠️ **partielle** : anticoagulants, côlon irritable, GLP-1 *(⟳ la grossesse en sort — elle devient le lot `L0bis`)* | `L9bis`, `L38` | une décision produit, puis un écran |
| **G2** | **Le bloc de déclaration de groupe devient-il inconditionnel ?** | ⛔ **OUVERTE — mesure manquante** (0 ligne sur 9 810 porte un `group`) | le repli de `L18b`, la borne de `L17` | renverse une décision documentée **tenue par un test d'identité d'octets** |
| **G3** | ~~La juridiction de la conservation~~ | ✅ **FERMÉE — jour de cuisson + 2, 48 h écarté** | ⟳ **`L0-b` seulement** — `L0-a` en sort | ⛔ 48 h **change l'unité de valeur du produit** |
| **G4** | ~~L'objectif de poids sur un mineur~~ | ✅ **FERMÉE — le champ part du front ET le littéral en base** — le code a tranché l'inverse le 2026-08-18, 2 bouches en portent un | `S4` | rouvrir la décision **en la nommant** |
| **G5** | ~~Le grammage par bouche dans `member_portions`~~ | ✅ **FERMÉE — le gramme QUITTE la note** — 181/340, et c'est **la lettre** du contrat de la colonne qui est violée, pas seulement l'esprit | ⟳ ⛔ **`L6′`** *(déplacé depuis `L26`)* | trancher : le gramme quitte la note et vit **dans la boîte**, qui a un destinataire — ou il reste et on assume |
| **G6** | ~~RNP ou BNM ?~~ | ✅ **FERMÉE — RNP, et les AS marqués à part** ⟳ Et la porte **n'a pas de réponse pour 2 des 9 nutriments** : B12 et vitamine D sont des **AS**, ni RNP ni BNM | `L15` | une décision, avec sa source écrite |
| **G7** | **Un moteur, ou deux ?** | ⛔ **OUVERTE** ⟳ **`E1` en est une instance**, pas un petit lot | `L13`, `E1`, et le coût ×2 de tout lot de grammes | une décision d'architecture |
| **G8** | ~~`pepper`~~ | ✅ **FERMÉE — le modèle écrit lequel, jamais un alias** — poivre ou poivron ? **98 occurrences = 21 % des ratés** | une part de `L19b` | ⛔ ne se résout **pas** par un alias |

---
---

# PARTIE 3 — LES VAGUES

⟳ **Sept vagues, dont une NEUVE** — `VAGUE D`, où un humain signe les décisions produit,
insérée sur exigence de la revue produit : sur les 31 décisions du registre foyer, la v1
en traitait **4 comme des décisions, 10 déguisées en technique, 17 absentes**.

| vague | ce qu'elle fait | ⟳ un utilisateur voit-il quelque chose ? | se termine par |
|---|---|---|---|
| **0** | mesurer, geler, **puis générer** | **non** — sauf sur la fixture | un plan foyer **persisté** avec des boîtes en base |
| **1** | la **sécurité** — parallèle à tout, sauf sa vérification qui attend la fixture | **non, sauf quand elle REFUSE** — un plan qui sortait ne sort plus | chaque garde a un cas qui **MORD** et un cas qui **PASSE** |
| **2** | la **journée devient calculable** | ⟳ **non — c'est un DÉNOMINATEUR, pas une assiette.** Seule exception : un francophone cesse de recevoir du pain blanc quand il écrit « pain complet » | le taux de journées calculables **dans les deux langues** |
| **D** | un humain **signe** les 31 décisions | **non** | 31 signatures, ou un refus écrit |
| **3** | les **entrées du moteur existent** | ⟳ **OUI, et c'est la plus grosse livraison d'interface du plan** : les contenants apparaissent sur les 102 plans foyer où il n'y en a jamais eu un seul | des boîtes **visibles**, et les mutations qui rougissent |
| **4** | les **grammes bougent** | **oui, fortement** — la portion grossit | grammes avant/après **par bouche**, seuils chiffrés |
| **5** | le **foyer pluriel**, enfin exercé | **oui** — le végane reçoit sa version sans seconde cuisson | l'union de deux régimes **mord pour la première fois** |
| **6** | ce qui **se dit**, et ce qu'on **retient** | **oui** — le plan nomme ce qu'il a sacrifié | un plan qui dit son compromis |

⚠️ **Les vagues 0 et 1 sont parallélisables. Les vagues 2 → 5 ne le sont pas** : chacune
est le dénominateur de la mesure de la suivante.

⟳ **Correction d'honnêteté, exigée par la revue produit** : la v1 marquait « change une
assiette ? oui » sur les vagues 2, 5 et 6 pour des lots dont la fiche disait elle-même
*« bloque : rien — il consolide »* ou *« il n'agit pas dessus »*. **Le plan cesse de
vendre de la plomberie comme un bénéfice.**

---

## LA FIXTURE OBLIGATOIRE — ⟳ renforcée par la revue sécurité

> Un **foyer de 4 bouches** : un **végane**, un **mineur**, une **allergie médicale**,
> **deux objectifs opposés**, et une **absence partielle**.

⟳ **Quatre précisions sans lesquelles la fixture n'exerce pas ce qu'elle prétend :**

1. ⛔ **Le libellé de l'allergie doit RÉSOUDRE** vers un `allergen_ref` connu du
   catalogue. Sinon `surfaceFormsFor` rend `[]` et la ceinture de sortie cherche une
   chaîne qu'elle ne trouvera jamais — le défaut mesuré sur `fruits_de_mer`.
2. ⛔ **Le mineur porte l'un des deux objectifs opposés.** Sinon `weighedPortionMembers`
   n'est jamais exercé sur lui, et c'est **la cinquième surface du mineur**.
3. ⛔ **Le végane et l'allergique sont deux bouches DIFFÉRENTES.** Sinon
   `dishBearingMembers` ne produit qu'un contenant et `C1` n'a pas d'objet.
4. ⛔ **Au moins une bouche SANS COMPTE** — c'est le cas nominal, et c'est celui dont
   `restrictionFlagOf` rend `false`.

| élément | ce qu'il exerce | à zéro aujourd'hui |
|---|---|---|
| **4 bouches** | union des interdits, groupage des contenants, hiérarchie D3 | la ceinture n'a **jamais** vu plus d'une bouche à régime |
| **1 végane** | `strictestRegimeAt`, `dietDiverges` — **R5 ne s'arme QUE pour un végane** | 13 plans à ceinture, **0 refus** |
| **1 mineur** | `weekPlanAgeGate`, `weighedPortionMembers`, la porte G4 | 2 mineurs portent déjà un objectif |
| **1 allergie `medical`** | le verrou de sortie **et** `C1` | 7 lignes |
| **2 objectifs opposés** | `laneMode` / `per_portion` — le verrou de lane du cas 09 | `laneMode` **n'apparaît nulle part** dans `index.ts` |
| **1 absence partielle** | `resolveWindowPresence`, l'occasion **estimée** | — |

⛔ **Composée en `intent: commit`, jamais en `draft`** — `draft` ne persiste pas
`generated_from`.

⚠️ **Trois pièges de préparation, déjà payés :** redémarrer `functions serve` avant le
run *(cache périmé des `_shared`)* · **ne jamais viser un compte sans mot de passe** ·
le harnais QA plafonne à **3 sièges d'essai**, donc la fixture utilise des **bouches sans
compte**, ce qui est de toute façon le cas nominal.

---
---

# VAGUE 0 — MESURER, GELER, PUIS GÉNÉRER

## V0-A — le travail qui tourne entre dans le dépôt

| | |
|---|---|
| **quoi** | Rien ne change pour l'utilisateur. Le code qui tourne devient reproductible depuis un `git clone`. |
| **pourquoi** | **13 migrations du 2026-08-20/21 sont appliquées et enregistrées mais `NON-SUIVI`**, dont les 3 du lot 18 et les 2 du lot 30. `composition_fill{,_io,_test}.ts` sont `??`. Côté front, **`lib/mouthVoice.ts` et `lib/habitSlots.ts` ne sont pas commités et sont importés par `MouthFormDialog`** — l'écran central ne compile pas depuis un checkout propre. |
| **dépend de** | rien |
| **bloque** | **tout** — un plan bâti sur du code non versionné n'est pas exécutable par quelqu'un d'autre |
| **fichiers** | ⟳ **22 — périmètre FERMÉ, arbitré par le propriétaire le 2026-08-21.** Les **13** migrations `2026082{0,1}*.sql` · `_shared/keel/composition_fill{,_io,_test}.ts` · ⟳ **`_shared/keel/mouth_anchor.ts` · `mouth_energy.ts` · `household_traditions.ts`** *(ajoutés — preuve sous la fiche)* · `frontend/src/keel/lib/{mouthVoice,habitSlots}.ts` · `components/HouseholdTraditionsCard.tsx`. ⛔ **Sortis du périmètre, et ils restent `??`** : `composition_pending_test.sql`, `composition_band_parity_test.ts`, les 8 `*.int.test.ts`. <br>~~`supabase/migrations/2026082{0,1}*.sql` (13) · `_shared/keel/composition_fill{,_io,_test}.ts` · `composition_pending_test.sql` · `composition_band_parity_test.ts` · `frontend/src/keel/lib/{mouthVoice,habitSlots}.ts` · `components/HouseholdTraditionsCard.tsx` · 8 `*.int.test.ts`~~ |
| **migration** | non — elles existent et sont appliquées ; ce lot les **versionne** |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 à 22:20:30 CEST** — `git status --porcelain \| awk '{print $1}' \| sort \| uniq -c` → **144 `??`**, **168 `M`**, **2 `D`**, **2 `RM`** · `for f in supabase/migrations/2026082*.sql; do git ls-files --error-unmatch "$f"; done 2>&1 \| grep -c did` → **13** *(reproduit)*. <br>~~⟳ **142 `??`**, 168 `M`, 2 `D`, 2 `RM`~~ — **le compte `??` a bougé de +2** entre l'écriture du plan et l'exécution : d'autres sessions écrivent dans ce dépôt. ⛔ **`??` n'est pas un seuil**, seulement un delta ; le seuil est `git ls-files`. |
| **direction** | ⟳ *(écrite avant le commit)* les **22** fichiers passent à `COMMITE` ; `??` baisse d'**au moins 22**. ⛔ **`M` ne doit PAS baisser** — `en.ts`, `fr.ts`, `catalog.ts` et les fichiers d'autres sessions restent modifiés. <br>~~les 13 migrations et les 5 fichiers de code passent à `COMMITE` ; `??` baisse d'au moins 16~~ |
| **mesure APRÈS** | ⟳ **Seuil : 22/22**, et `M ≥ 168`. **22:23:58 CEST** *(les 22 en index)* → `git ls-files --error-unmatch` **22/22**, aucun échec · `git status …\| uniq -c` → **122 `??`** *(−22)*, **22 `A`**, **2 `D`**, **168 `M`** *(inchangé)*, **2 `RM`**. **22:25:53 CEST** *(cette fiche en index, 23ᵉ fichier)* → **122 `??`**, **23 `A`**, **2 `D`**, **168 `M`**, **2 `RM`**. **Les deux seuils sont atteints.** ⚠️ `??` reste à 122 alors qu'il devait tomber à 121 : le **total des lignes passe de 316 à 317** entre les deux mesures — **une autre session a créé un fichier pendant le lot**, en direct. <br>~~`git ls-files --error-unmatch` réussit sur les 18. **Seuil : 18/18**~~ |
| **armé par** | un `git clone` dans un répertoire tiers où `frontend/node_modules/.bin/tsc -b --force tsconfig.app.json` **passe** — la preuve que `mouthVoice.ts` et `habitSlots.ts` sont là |
| **coût** | **un petit lot** — mais trier 142 fichiers de plusieurs sessions |
| **risque** | ⛔ `git stash` interdit (dépôt partagé). ⛔ Ne jamais commiter `en.ts`/`fr.ts`/`catalog.ts`/`planRefusals.ts`. Tri fichier par fichier, jamais `git add -A` |

### ⟳ La preuve que « 18 fichiers » ne pouvait pas passer sa propre arme

> **Ce que la fiche ne voyait pas : le cœur du calcul du plan n'était pas versionné.**
> `mouth_anchor.ts` *(ce que la journée VISE)* et `mouth_energy.ts` *(ce qu'elle LIVRE)*
> étaient `??`, et l'entrée **suivie** de la lane foyer les importe. À 18 fichiers, un
> `git clone` ne pouvait résoudre ni la lane foyer, ni `TableStepPlanning`.

`git grep` ne lit **que les fichiers suivis** — chaque ligne ci-dessous est donc un
importateur déjà dans le dépôt qui pointait vers un fichier qui n'y était pas :

```bash
git grep -nE 'from "(\.\./)+_shared/keel/(mouth_anchor|mouth_energy|household_traditions)\.ts"|from "\./household_traditions\.ts"|from "\./HouseholdTraditionsCard"|from "\.\./lib/(mouthVoice|habitSlots)"|from "(\.\./)+_shared/keel/composition_fill_io\.ts"'
```
```
frontend/src/keel/components/MouthFormDialog.tsx:19:import { type MouthVoice, voiced, whoOf } from "../lib/mouthVoice";
frontend/src/keel/components/TableStepPlanning.tsx:10:import HouseholdTraditionsCard from "./HouseholdTraditionsCard";
frontend/src/keel/pages/HouseholdPage.tsx:106:import { habitSlotsFor } from "../lib/habitSlots";
frontend/src/keel/pages/SetupPage.tsx:148:import { habitSlotsFor } from "../lib/habitSlots";
supabase/functions/_shared/keel/household_meal_generation.ts:68:} from "./household_traditions.ts";
supabase/functions/generate-household-meal-v1/index.ts:210:import { repairPlanComposition } from "../_shared/keel/composition_fill_io.ts";
supabase/functions/generate-household-meal-v1/index.ts:258:} from "../_shared/keel/household_traditions.ts";
supabase/functions/generate-household-meal-v1/index.ts:311:} from "../_shared/keel/mouth_anchor.ts";
supabase/functions/generate-household-meal-v1/index.ts:312:import { mouthDayEnergy } from "../_shared/keel/mouth_energy.ts";
supabase/functions/generate-meal-v1/index.ts:189:import { repairPlanComposition } from "../_shared/keel/composition_fill_io.ts";
```

⚠️ **Et « 18 » ne comptait déjà pas sa propre liste** : les items énumérés en face de
`fichiers` faisaient **13 + 3 + 2 + 3 = 21**, plus « 8 `*.int.test.ts` ». Le chiffre du
seuil et l'énumération du même cellule ne parlaient pas du même périmètre.

⚠️ **Le balayage complet a été fait** — pour chaque `.ts`/`.tsx` **suivi** de
`frontend/src` et `supabase/functions`, résoudre chaque import relatif et vérifier qu'il
est suivi. Après les 22, **il ne reste aucune arête suivi → non-suivi** : les trois seules
autres occurrences (`frontend/src/keel/i18n/pageSeams.int.test.ts`,
`i18n/servingDirections.int.test.ts`, `_shared/keel/draft_note_classify_wiring_test.ts`)
sont des **commentaires et des littéraux de chaîne**, pas des imports.

### ⟳ Le résultat de l'arme — **une moitié passe, l'autre NE PEUT PAS passer**

Mesuré le **2026-08-21 à 22:31 CEST**, sur un arbre tiers ne contenant **que du commité**
(`git archive HEAD | tar -x` — équivalent au `git clone` de la fiche pour ce qu'elle
teste ; ⚠️ la garde `git()` du `~/.zshrc` exige une validation humaine pour `git clone`,
traité comme opération distante), `node_modules` liés au dépôt principal, **aucune**
variable `SUPABASE_*` exportée.

| moitié | commande | verdict |
|---|---|---|
| **back** | `deno check supabase/functions/generate-household-meal-v1/index.ts` | ✅ **rc=0** — la lane foyer résout tous ses imports depuis le commité. C'est exactement ce que les 3 fichiers ajoutés au périmètre débloquent |
| **front** | `frontend/node_modules/.bin/tsc -b --force tsconfig.app.json` | ⛔ **rc=1 — 40 erreurs** |

⛔ **Le seuil de l'arme front est MANQUÉ, et il ne pouvait pas être atteint par ce lot.**
Les 40 erreurs sont **toutes** dans 2 des 22 fichiers neufs, et **aucune** ne vient d'un
fichier neuf manquant. Chacune vient d'un fichier **SUIVI dont la modification n'est pas
commitée** :

| cause | erreurs | preuve |
|---|---|---|
| `frontend/src/keel/api/household.ts` *(statut `M`)* n'exporte `loadTraditions`, `removeTradition`, `setTradition` **qu'à l'état modifié** | **3** *(TS2305 ×2, TS2724)* | `git show HEAD:…/api/household.ts \| grep -cE 'export (async )?function (setTradition\|removeTradition)'` → **0** · le même grep sur le disque → **2** |
| `frontend/src/keel/i18n/{en,fr}.ts` *(statut `M`)* portent les clés `setup.traditions.*` et `household.mouth.*_you` **qu'à l'état modifié** | **37** *(TS2820 ×19, TS2345 ×14, TS2322 ×4)* | `git show HEAD:…/i18n/en.ts \| grep -c '"setup.traditions.title"'` → **0** · sur le disque → **1** *(idem `household.mouth.body_you`, `household.mouth.rhythm_you`)* |

> ⚠️ **La fiche se contredit elle-même, et c'est le fait neuf.** Sa ligne `armé par`
> demande un `tsc` vert depuis un checkout propre ; sa ligne `risque` **interdit de
> commiter `en.ts`/`fr.ts`**. Les deux ne peuvent pas être vraies en même temps : les
> fichiers neufs du front **nomment des clés i18n et des exports qui n'existent que dans
> des modifications non commitées**. ⛔ **Le périmètre n'a pas été élargi pour faire passer
> l'arme** — c'est l'arme qui est écrite au rapport telle qu'elle est.
>
> Ce que ça coûte : `git clone` rend aujourd'hui un **back foyer qui compile** et un
> **front qui ne compile pas**. Refermer ça demande un lot qui tranche le sort de la
> couche i18n non commitée *(cf. la mémoire « la couche i18n n'est pas commitée »)* et de
> `api/household.ts` — **hors du périmètre fermé de `V0-A`.**

## ⟳ V0-A-bis — le front ne compile pas depuis un checkout propre *(fiche NEUVE, ouverte par `V0-A`)*

> ⟳ **Ouverte le 2026-08-21 par le lot `V0-A`, §⑦ : « si le lot en révèle un autre, on ajoute une fiche ».**
> `V0-A` a atteint ses deux seuils et **manqué la moitié de son arme**, pour une raison qui ne lui appartient pas.

| | |
|---|---|
| **quoi** | Un `git clone` rend un front qui **compile**. Aujourd'hui il rend un back foyer qui compile et un front qui ne compile pas. |
| **pourquoi** | ⛔ **Mesuré depuis un arbre ne contenant que du commité** : `deno check generate-household-meal-v1/index.ts` → **`rc=0`** ✅, mais `tsc -b --force tsconfig.app.json` → **`rc=1`, 40 erreurs** ⛔. **Aucune ne vient d'un fichier neuf manquant.** Les 40 se répartissent en **3** exports (`loadTraditions`, `removeTradition`, `setTradition`) que `api/household.ts` **n'a qu'à l'état `M`** — `git show HEAD:…` en rend **0**, le disque **2** — et **37** clés i18n (`setup.traditions.*`, `household.mouth.*_you`) qui **n'existent que dans la modification en cours** d'`en.ts`/`fr.ts`. ⛔ Et **le plan interdit en toutes lettres de commiter ces fichiers**. ⇒ **l'arme de `V0-A` est structurellement inatteignable tant que cette contradiction n'est pas tranchée** : `armé par` et `risque` de la fiche `V0-A` se contredisent. *(Le dépôt connaît déjà ce mode : « la couche i18n n'est pas commitée — un lot i18n livre sur le disque, jamais en commit ».)* |
| **dépend de** | rien |
| **bloque** | ⚠️ **rien de la vague 0** — c'est pour ça que `V0-A` est tenu pour livré *(§⑨ n° 1)*. Mais il bloque **la promesse** que le plan fait sur `V0-A` : « exécutable par quelqu'un d'autre » |
| **fichiers** | `frontend/src/keel/api/household.ts` *(3 exports)* · `frontend/src/keel/i18n/{en,fr}.ts` *(37 clés)* — ⛔ **et c'est précisément la liste des fichiers que l'ANNEXE interdit de commiter** |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 depuis un arbre `git archive HEAD | tar -x`** : `deno check` **rc=0** · `tsc -b --force tsconfig.app.json` **rc=1, 40 erreurs** · `git show HEAD:frontend/src/keel/i18n/en.ts | grep -c '"setup.traditions.title"'` → **0**, le disque → **1** |
| **direction** | ⚠️ **Il n'y en a qu'une qui ne soit pas un contournement** : trancher le sort de la couche i18n non commitée. Soit elle entre au dépôt *(et l'interdit de l'ANNEXE est réécrit en nommant sa raison)*, soit les fichiers neufs du front cessent de nommer des clés qui n'existent pas. ⛔ **Ne PAS « réparer » en retirant `HouseholdTraditionsCard.tsx` du commit** : `TableStepPlanning.tsx`, suivi, l'importe — ça déplacerait l'erreur sans la fermer |
| **mesure APRÈS** | `tsc -b --force tsconfig.app.json` **`rc=0`** depuis un arbre ne contenant que du commité. **Seuil : 0 erreur, et `deno check` reste à `rc=0`** |
| **armé par** | ⛔ **Le même arbre tiers, rejoué.** Pas un `tsc` local : le dépôt de travail porte les modifications qui masquent le défaut — **c'est exactement pourquoi personne ne l'avait vu** |
| **coût** | **un lot**, dont la moitié est une **décision** *(l'interdit de commit sur `en.ts`/`fr.ts` est-il une règle ou une cicatrice ?)* |
| **risque** | ⛔ **L'interdit de l'ANNEXE existe pour une raison réelle** — ces fichiers portent le travail simultané de plusieurs sessions, et un commit partiel casse la parité. **Ce lot ne doit pas être livré par un agent qui décide seul de le lever.** ⚠️ Et `V0-A` a prouvé que le mojibake est le piège de cette famille : **jamais `unicode_escape`**, éditer par numéro de ligne, en UTF-8 |

## V0-B — les compteurs cessent de mentir

| | |
|---|---|
| **quoi** | La vue qui pilote le lot 18 arrête d'afficher un succès parfait sur des plans jamais mesurés. |
| **pourquoi** | **180 plans sur 180 portent `composition_energy_sources = '{}'` et `composition_unknowns = 0`** — les **valeurs par défaut**, sur des plans tous antérieurs à la migration. `composition_fill_weekly` affiche donc `unknowns_median = 0` sur 6 semaines. *« Un lot désarmé ressemble à un lot qui marche »*, et le rapport du lot 18 annonçait le symptôme sans voir qu'il était déjà là. |
| **dépend de** | rien |
| **bloque** | `V0-E′`, `L17`, `L18b` |
| **fichiers** | migration : `drop default` sur les deux colonnes · `update … set … = null where created_at < '2026-08-21'` · `create or replace view composition_fill_weekly` avec `where composition_unknowns is not null` |
| **migration** | **oui** — pas de table neuve. `student_generated_meals` est déjà exportée et purgée. ⚠️ `create or replace view` **perd `security_invoker`** : le repasser dans la même migration |
| **mesure AVANT** | `select composition_energy_sources::text, composition_unknowns, count(*) from student_generated_meals group by 1,2` → ⟳ **une seule ligne : `{}`, `0`, `180`** *(reproduit)* |
| **direction** | la vue passe de « 6 semaines à médiane 0 » à **aucune ligne**. ⛔ **Un tableau de bord vide est le bon résultat** |
| **mesure APRÈS** | `select count(*) from composition_fill_weekly` → **0** avant le run, **≥ 1 avec médiane > 0** après `V0-D`. Et `select reloptions from pg_class where relname='composition_fill_weekly'` contient `security_invoker=true` |
| **armé par** | un test SQL : la colonne accepte `null`, la vue l'exclut, et `reloptions` porte `security_invoker` |
| **coût** | **une petite migration** |
| **risque** | rendre la colonne nullable relâche une contrainte : vérifier qu'aucun lecteur ne fait `composition_unknowns > 0` sans garde de nullité |

## ⟳ V0-E′ — le tableau de bord, AVANT le run

> ⟳ **Déplacé avant `V0-D` par la revue architecte** : quatre de ses dix compteurs (#1,
> #3, #5, #7) sont **détruits par le run**. Exécuté après, le tableau de bord de départ
> n'a plus de départ à mesurer.

| | |
|---|---|
| **quoi** | Dix compteurs, un fichier SQL rejouable, une valeur datée. C'est le « avant » de toutes les vagues. |
| **pourquoi** | Plusieurs lots sont **injugeables sans état de départ**. Et le patron du dépôt (`ANCHOR_REASONS`) est explicite : **toutes** les populations sont comptées, y compris celles qui passent. |
| **dépend de** | `V0-B` |
| **bloque** | ⛔ **`V0-D`** *(inversé)*, et l'évaluation de toutes les vagues |
| **fichiers** | `scripts/` — un fichier SQL versionné + ⟳ **un script Deno** pour le compteur #2, qui n'existe pas |
| **migration** | non |
| **mesure AVANT** | *(le tableau ci-dessous — chaque ligne porte sa valeur du 2026-08-21, ⟳ = remesurée par la revue QA)* |
| **direction** | aucune : c'est la mesure. ⟳ **Et c'est un défaut assumé** — la revue QA note qu'un lot dont la direction est « aucune » ne peut pas échouer. Il est gardé tel quel **parce que son échec est visible autrement** : si le fichier ne s'exécute pas, aucune vague ne peut se clore |
| **mesure APRÈS** | le même fichier, relancé en fin de chaque vague, sortie archivée à côté du plan |
| **armé par** | ⟳ **Ce n'est pas une preuve, c'est un engagement de processus, et la revue QA a raison de le dire.** Le renfort : la clôture de chaque vague **cite la sortie datée** ; une vague sans sortie archivée n'est pas close |
| **coût** | **un petit lot** · ⟳ **plus un lot à part pour le compteur #2**, qui n'existe pas |
| **risque** | ⛔ **Trois pièges de mesure déjà payés** : jamais `grams_raw` en base (**figé à la génération**) ; toujours **après pliage** (le taux DESCEND : 37,8 % → 28,6 %) ; `coverage` et non `resolved.length` (96 % contre 69 %) |

### Les dix compteurs, au 2026-08-21

| # | compteur | dénominateur | valeur | exécutable ? |
|---|---|---|---|---|
| 1 | plans portant `dishes[].boxes` | plans | **0 / 180** | ✅ |
| 2 | journées calculables, **par lane et par langue** | journées composées | foyer 27,9 % · solo 13,2 % *(lot 18)* — **par langue : n'existe pas** | ⛔ ⟳ **LE SEUL QUI N'EXISTE PAS** — et c'est le critère de fin de la vague 2. Exige `plan_energy.ts` sous Deno, et **1 seul plan `fr-FR`** sur 180 |
| 3 | lignes **résolues et pesées** | lignes | foyer **80,1 %** · solo **7,8 %** | ⚠️ 9 810 lignes ✅ (6 661 + 3 149) ; le taux exige le résolveur Deno |
| 4 | motifs d'abstention | plats | **533 / 444 / 144** sur **1 821** ⟳ (1 821 reproduit ; 552 et 187 sur des définitions SQL voisines) | ⚠️ nommer le script du lot 18 |
| 5 | inconnus par plan (médiane) | plans | **0** — ⟳ **un défaut, pas une mesure** *(voir `V0-B`)* | ✅ |
| 6 | `crossed` / `legacy` / `assumed` | **43 corps** | ⟳ **1 / 24 / 18** *(la v1 disait « 1 / ? / 87 »)* | ✅ **en une requête** — et le compteur existe déjà en code |
| 7 | plans dont la ceinture a vu **> 1 bouche** | plans à ceinture | **0 / 13**, `refused: 0` | ✅ |
| 8 | `portion_note` portant un grammage | entrées | **181 / 340** | ✅ |
| 9 | contraintes actives **non couvertes** / **couvertes** | actives | **6** non couvertes / **58** actives — ⟳ ventilation réelle **35 medical · 14 strict · 9 preference** | ✅ ⟳ **et il faut la population qui PASSE**, absente de la v1 |
| 10 | bouches sans `birth_date` | bouches · profils | **25 / 88** · **1 193 / 1 312** | ✅ |

## V0-C — la fixture obligatoire

| | |
|---|---|
| **quoi** | Le foyer décrit ci-dessus existe en base, reproductible par un script. |
| **pourquoi** | **La ceinture de régime a tourné sur 13 plans, toujours avec UNE bouche, et n'a jamais refusé.** `cooking_session_states` = 0. `condition_ref` = 0. `laneMode` invisible. Tout ce que les documents décrivent du foyer pluriel est du code **lu**. |
| **dépend de** | `V0-A` |
| **bloque** | `V0-D` et la vérification de fin de **chaque** vague |
| **fichiers** | `scripts/` — SQL + amorce d'appel edge. ⚠️ **bouches sans compte** |
| **migration** | non |
| **mesure AVANT** | foyers à ≥ 4 bouches : **7** · foyers portant simultanément végane + mineur + allergie `medical` + deux objectifs opposés : **0** |
| **direction** | exactement **1** foyer remplit les **six** conditions *(dont les quatre précisions ci-dessus)* |
| **mesure APRÈS** | une requête unique rend **1 ligne**, et `surfaceFormsFor(allergen_ref)` de cette fixture rend **un tableau non vide** |
| **armé par** | le script est **rejouable** — le relancer ne crée pas deux foyers (clé naturelle) — et il **échoue** si l'allergène ne résout pas |
| **coût** | **un petit lot** |
| **risque** | une fixture qui diverge du produit mesure autre chose. Chaque champ posé par **la même RPC que l'écran**, jamais par un `insert` direct |

## V0-D — ⛔ LE RUN RÉEL

| | |
|---|---|
| **quoi** | On génère un plan pour la fixture, en `intent: commit`, et on regarde ce qui arrive en base. |
| **pourquoi** | **Neuf mécanismes n'ont jamais produit une ligne** : `dishes[].boxes`, `box_sizing.anchor`, le sas du lot 18, ses 4 compteurs, la ceinture à plusieurs bouches, `condition_ref`, `cooking_session_states`, `laneMode`, et le modèle réparé le 2026-08-19. |
| **dépend de** | `V0-A`, `V0-B`, ⟳ **`V0-E′`**, `V0-C` |
| **bloque** | `L6′`, `L9bis`, `L11★`, `L13`, `L38` — et toute mesure en grammes |
| **fichiers** | aucun si le run passe. **Le lot EST ce que le run casse.** |
| **migration** | non |
| **mesure AVANT** | `dishes[].boxes` **0/180** · `box_sizing.anchor` **0/46** · `food_composition_pending` **0** · `regime_belt` à `mouths>1` **0/13** |
| **direction** | ⚠️ **écrite d'avance, et ce n'est pas « ça marche »** : on s'attend à ce que le run **sorte incomplet**, et à ce que l'écart nomme les lots réels. Les boîtes apparaissent ; l'ancrage rend `day_incomplete` sur la plupart des jours ; la ceinture de régime mord **pour la première fois** |
| **mesure APRÈS** | ⟳ **RÉDUITE à ce qu'un run seul peut produire** : `select jsonb_array_length(dishes->0->'boxes') from student_generated_meals order by created_at desc limit 1` → **≥ 1** · `box_sizing.anchor` **présent** · `regime_belt.mouths ≥ 2`. ⛔ **RETIRÉ : « boîtes visibles à l'écran » (= `L6′`, vague 3) et « `composition_fill_weekly` médiane > 0 » (= `L18b`, vague 2, gardé par G2)** — la v1 rendait son premier lot indéclarable réussi |
| **armé par** | ⛔ pas un test : **une ligne en base**, plus la sortie datée de `V0-E′` relancée juste après |
| **coût** | ⟳ **un lot, et le plan ne promet plus qu'il est bon marché.** Le run coûte une génération ; ce qu'il révèle coûte ce qu'il coûte |
| **risque** | ⛔ **Redémarrer `functions serve` avant.** ⛔ Un **401 « Invalid JWT »** ⇒ `./scripts/check-local-jwt-alg.sh` puis lire `docs/keel/JWT-HS256.md`, **jamais** `verify_jwt = false`. ⚠️ La lane foyer n'a **qu'une relance** et **aucune vérification** |

## ⟳ Q-G2 · Q-S2 · Q-G19 — les trois questions qui sont des MESURES, pas des portes

> ⟳ **Sur les sept questions restantes, trois ne sont pas des décisions produit** *(§⑥)* :
> elles se ferment par une lecture de code et un compteur. Elles descendent donc en vague 0.

| lot | quoi · pourquoi | mesure AVANT → APRÈS, avec seuil | armé par | coût |
|---|---|---|---|---|
| **Q-G2** | **Ce que coûte le bloc de déclaration de groupe s'il devient inconditionnel.** `FOOD_GROUP_DECLARATION_BLOCK` ne voyage qu'avec la ligne de régime, et **0 ligne d'ingrédient sur 9 810** porte un `group`. Le repli de `L17` et de `L18b` en dépend | longueur du bloc et part d'élèves sans régime : **non mesurées** → **les deux chiffrées**, plus le nombre de tests que le byte-identique protège | le test d'identité d'octets de `dietary_regime.ts` : **le lancer, voir où il rougit** | **un petit lot** |
| **Q-S2** | **Ce que coûte l'élargissement de la ceinture `strict` côté CHAT.** `applyKeelOutputLocks` est importé par `sophia-brain/router/run.ts:292` | tours qui mordraient : **non mesurés** → **comptés sur les tours archivés**. **Seuil : si > 5 % des tours mordent, la porte se referme sur les générateurs seuls** | un rejeu à blanc sur `chat_messages` (**5 885 lignes**), sans rien écrire | **un petit lot** |
| **Q-G19** | **Quelle granularité `anchorFactorFor` produit réellement.** L'ancrage rend un facteur par **jour**, `sizeBoxesFromTarget` en prend un par **plan** (*« on retient le plus proche de 1 »*) — désaccord silencieux entre deux modules voisins | granularité effective : **non journalisée** → **les deux journalisées sur un run réel**, et l'écart entre elles chiffré | ⛔ **la mesure exige `V0-D`** : sans boîtes, `anchorFactorFor` ne produit rien | **un petit lot**, après le run |

⚠️ **Les trois se ferment avant la `VAGUE D`** — sinon elles y arriveraient comme des
décisions alors que ce sont des chiffres manquants, et **c'est très exactement le défaut
que la vague D existe pour empêcher, à l'envers**.


---
---

# VAGUE 1 — LA SÉCURITÉ

> ⟳ **Élargie de 6 à 11 lots par la revue sécurité et la revue produit.** Trois lots y
> sont remontés d'autres vagues (`C1`, `L0-a`, `L24′`), un est neuf (`L0bis`, la
> grossesse, qui n'avait ni lot ni vague), et deux lots de harnais (`H1`, `H2`) y entrent
> parce que **aucun lot à surface front n'est vérifiable par le gate sans eux**.

## S1 — la ligature tue le plancher d'allergie

| | |
|---|---|
| **quoi** | Quelqu'un qui écrit *« je suis allergique aux œufs »* déclenche le plancher, comme celui qui écrit *« oeufs »*. |
| **pourquoi** | ⟳ **Exécuté, pas lu** : `safety_constraint_floor.ts` porte sa **propre** `normalize()` (l. 62-78), sans le repli de ligatures du 2026-08-19 présent dans `allergen_catalog.ts:211-215`. Mesuré par `deno eval` : `"je suis allergique aux œufs"` ⇒ **`null`** · `"…oeufs"` ⇒ `{allergen_ref:"egg", severity:"medical"}`. Locale par défaut : **`fr-FR`**. Le plancher retombe alors sur le tirage du dispatcher — ce qu'il existe pour fermer. |
| **dépend de** | rien |
| **bloque** | `S2`, `M1b′`, le pilote payant |
| **fichiers** | `_shared/keel/safety_constraint_floor.ts:62-78` — déplier `œ→oe`, `æ→ae`. ⛔ **Ne PAS fusionner les deux modules** : le découplage est délibéré et documenté |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutable et reproduite** : les 6 formes de surface × 2 graphies → **les 6 à ligature échouent**, les 6 en digramme passent, et `"jaime bien les pates"` ⇒ `null` |
| **direction** | 12/12 passent, et le cas neutre reste `null`. ⚠️ **Aucune régression sur le digramme** |
| **mesure APRÈS** | 12/12 + un balayage : **toute** forme de surface du catalogue contenant `œ` ou `æ` a un test. **Seuil : 100 % des formes concernées** |
| **armé par** | ⛔ **un cas qui MORD et un cas qui PASSE** — le second est `"jaime bien les pates"` ⇒ `null`. Sans lui, une garde cassée bloquerait tout en ressemblant à une garde qui marche |
| **coût** | **une constante** |
| **risque** | ⛔ **Jamais `unicode_escape`** : mojibake que ni `tsc` ni la parité n'attrapent. Éditer par numéro de ligne, en UTF-8. **C'est le lot où ce piège mord** |

## S1b — `fruits_de_mer` : l'intake ET la sortie

| | |
|---|---|
| **quoi** | Une allergie déclarée sous un mot français cesse d'être invisible aux deux bouts. |
| **pourquoi** | ⟳ **Deux défauts, pas un — la v1 n'en voyait qu'un.** ① `"allergique aux fruits de mer"` ne mord pas au plancher : `fruits de mer` n'est pas une forme de surface de `shellfish`. ② ⛔ **Et la ceinture de SORTIE est armée et morte** : `householdAllergenRefs` retombe sur le slug littéral `fruits_de_mer`, pour lequel `surfaceFormsFor` rend `[]` — **elle cherche une chaîne française dans un texte anglais, ne la trouvera jamais, et ne dira rien.** La base porte **2 lignes**, dont **1 active** écrite le 2026-08-04, avant que l'alias n'existe. |
| **dépend de** | `S1` |
| **bloque** | la fixture *(précision n°1)* |
| **fichiers** | `_shared/keel/allergen_catalog.ts` (forme de surface) · `_shared/keel/household_safety.ts:111-128` (`householdAllergenRefs` : refuser un ref sans formes, plutôt que de le laisser passer muet) |
| **migration** | ⚠️ **une décision, pas un effet de bord** — migrer la ligne active est **une écriture sur une contrainte de sécurité** |
| **mesure AVANT** | `select allergen_ref, count(*) from student_safety_constraints where allergen_ref not in (select … catalogue)` → **1 active** · `surfaceFormsFor('fruits_de_mer')` → **`[]`** |
| **direction** | `surfaceFormsFor` rend un tableau non vide pour **tout** ref présent en base ; un ref sans formes fait **échouer** la ceinture au lieu de se taire |
| **mesure APRÈS** | **0** ref actif sans formes de surface. Et un compteur `belt_ref_without_forms` qui doit rester à **0** |
| **armé par** | ⛔ Le compteur ci-dessus, **et** un test qui forge un ref inconnu et vérifie que la ceinture **échoue bruyamment** — pas qu'elle passe |
| **coût** | **un petit lot** |
| **risque** | ⛔ Une ceinture qui échoue bruyamment sur une lane sans second essai **refuse le plan**. C'est le bon comportement pour une allergie, et il faut le dire à l'utilisateur, pas le lui infliger en silence |

## S2 — la ceinture de sortie couvre `strict`

| | |
|---|---|
| **quoi** | Une intolérance déclarée `strict` est vérifiée sur les aliments réellement nommés. |
| **pourquoi** | `if (constraint.severity !== "medical") continue;` — ⟳ **et il y en a au moins DEUX, aux lignes 541 et 591** *(une troisième possible à `:408`)*, **aucune à 580 comme l'écrivait la v1**. ⟳ Corriger l'une et laisser l'autre est exactement « deux copies divergent ». **6 contraintes actives** ne sont vérifiées par rien. |
| **dépend de** | `S1` |
| **bloque** | `L21` |
| **fichiers** | `_shared/keel/safety_constraints.ts` — **énumérer d'abord les sites**, puis les élargir ensemble. ⛔ **Ne PAS y ajouter `conditionRef`** : l'armer sur `diabetes` a bâillonné un message d'urgence en run réel |
| **migration** | non |
| **mesure AVANT** | ⟳ `where retracted_at is null` → **`medical 35` · `strict 14` · `preference 9`** = 58 actives *(la v1 annonçait 42/18/9, qui sont des totaux sans filtre)*. Non couvertes : **6** |
| **direction** | les 6 entrent sous la ceinture. ⛔ **Le taux de refus va MONTER** — effet recherché, donc compteur avant/après obligatoire |
| **mesure APRÈS** | ⟳ **avec les DEUX populations** : `belt{severity, bit, passed}`. Non couvertes : **0**. Et un plan **sans contrainte** sort **byte-identique**. **Seuils : 0 non couverte ; `passed` non nul ; byte-identité prouvée** |
| **armé par** | ⟳ **trois cas, pas deux** : un `strict` qui MORD · un `preference` qui **reste dehors** *(le cas-frontière que la v1 oubliait)* · un plan sans contrainte byte-identique |
| **coût** | **un lot** *(la v1 disait « un petit lot »)* |
| **risque** | ⛔ ⟳ **`applyKeelOutputLocks` est importé par `sophia-brain/router/run.ts:292`** : élargir la sévérité fait mordre le verrou **dans la conversation**, sur une intolérance au lactose. **Même famille que le précédent `diabetes`.** Le lot doit décider explicitement s'il élargit **les trois** points d'entrée ou seulement les générateurs |

## S3 — le mineur : rebrancher l'escalade, fermer l'entrée manquante

| | |
|---|---|
| **quoi** | Un mineur ne traverse plus la porte du chiffre parce que sa date de naissance est absente. |
| **pourquoi** | ① `escalateMinorStudent` a **0 appelant** — son appelant historique a été retiré ; il a mordu **une fois, le 2026-08-12**. ② `weekPlanAgeGate` **PASSE** sur `absent`, et **1 193 profils sur 1 312** ont `birth_date` NULL. |
| **dépend de** | rien |
| **bloque** | le pilote payant |
| **fichiers** | `_shared/keel/student_age.ts:199-208` · `_shared/keel/student_body_io.ts:452` · `generate-meal-v1/index.ts` · ⟳ **`_shared/keel/energy_gate.ts:275`, qui APPELLE `weekPlanAgeGate`** — la v1 ne le nommait pas |
| **migration** | non |
| **mesure AVANT** | `birth_date` NULL : **1 193/1 312** et **25/88** · `contract_change_requests` `minor_student` : **1**, du 2026-08-12 |
| **direction** | ⚠️ **PAS « fermer sur `absent` »** — fermer ferait échouer 91 % des comptes. `absent` ⇒ **le chiffre ne sort pas** *(ce que le foyer fait déjà : `ageState === "unknown"` ⇒ `noSizing("age_unknown")`)*, **et le plan continue** |
| **mesure APRÈS** | un compteur `age_gate{minor, adult, absent}` — **les trois populations**. **Seuils : `absent` non nul dès le premier run (c'est 91 % de la base) ; `escalateMinorStudent` ≥ 1 appelant réel** |
| **armé par** | ⟳ **un grep n'est pas une exécution** : la preuve est un run où un mineur **reçoit un plan sans chiffre**. ⛔ Le cas qui PASSE est celui-là — un plan qui **sort quand même** |
| **coût** | **un lot** |
| **risque** | ⛔ Fermer sur `absent` **bloquerait tout en ressemblant à une garde qui marche**. ⟳ Et ce lot édite la fonction que la **porte ② de `energySafetyGates`** appelle : toute modification doit être éprouvée depuis `energy_gate.ts`, pas seulement depuis `student_age.ts` |

## S4 — l'objectif sur un mineur : l'écriture ET L'ORDRE *(gardé par G4)*

| | |
|---|---|
| **quoi** | Poser un objectif sur une bouche mineure est refusé — **et poser la date après l'objectif ne le contourne plus**. |
| **pourquoi** | `keel_household_set_member_target` refuse sur 8 motifs, **pas un mot sur `birth_date`**. ⟳ ⛔ **Et la revue sécurité a trouvé le chemin qui a réellement produit les 2 lignes en base** : ① ajouter une bouche **sans date** (âge `unknown` ⇒ `fat_loss` accepté), ② poser cible et rythme, ③ **saisir la date ensuite** — `keel_household_set_member_birth_date` écrit **sans relire ni `goal` ni `target_weight_kg` ni `target_pace_kg_per_week`**. **La garde se contourne dans le temps.** |
| **dépend de** | ⛔ **PORTE G4** · ⟳ **`L37` touche le même CHECK** — les deux migrations se coordonnent |
| **bloque** | rien ; il ferme une surface |
| **fichiers** | `keel_household_set_member_target` (littéral `target_not_for_minor`) · ⟳ **`keel_household_set_member_birth_date`** *(migration `20260810170000:352-401`)* · `MouthFormDialog.tsx:102` |
| **migration** | **oui** — `create or replace function` ×2 |
| **mesure AVANT** | mineurs portant `fat_loss`/`muscle_gain` : **2** |
| **direction** | l'écriture est refusée dans **les deux ordres**. ⚠️ Les 2 lignes existantes ne se corrigent pas par cette migration — les migrer est une décision à part |
| **mesure APRÈS** | ⟳ **trois cas SQL**, en transaction `rollback` : objectif sur mineur ⇒ `target_not_for_minor` · objectif sur majeur ⇒ **passe** · **objectif posé AVANT la date, puis date de mineur ⇒ refus ou effacement nommé**. **Seuil : 3/3** |
| **armé par** | le troisième cas — celui de l'ordre. Sans lui la garde est contournable et **ressemble à une garde qui marche** |
| **coût** | **une petite migration** — mais **la porte G4 coûte une décision** |
| **risque** | ⛔ Retirer le champ du front sans fermer la base laisse passer un import ou une API. Fermer la base sans rouvrir D4 met code et design en contradiction écrite |

## ⟳ L0bis — LA GROSSESSE *(lot neuf)*

| | |
|---|---|
| **quoi** | Une femme enceinte ou allaitante ne reçoit plus de boîte pesée en déficit. |
| **pourquoi** | ⛔ ⟳ **Chemin vérifié par la revue sécurité, et il est ouvert aujourd'hui.** `pregnancy`/`breastfeeding` sont bien dans la liste fermée (`medical_condition_floor.ts:181-189`, EN+FR) et le plancher est branché — **mais il n'écrit qu'une ligne et n'injecte son bloc que dans le CHAT**. Côté moteur, `conditionRef` est exclu de `safetyConstraintTokens` *(justifié)* et **n'est lu par aucun calcul d'énergie** : ni `meal_envelope.ts`, ni `weight_pace.ts`. Donc `executedPaceFor` amène jusqu'à `energyFloorFor("female") = 1 200 kcal`, **un plancher qui n'a jamais entendu parler de grossesse**. Et le bon chiffre de déficit en grossesse est **ZÉRO** : *« un plafond n'est pas un interdit »*. |
| **dépend de** | rien — ⟳ **et surtout PAS de la porte P1** : le jeton existe, le lecteur manque. C'est **un branchement**, pas une question à poser |
| **bloque** | le pilote payant |
| **fichiers** | `_shared/keel/household_portions.ts` (`mouthTargetFactor`) · `_shared/keel/meal_envelope.ts` (`envelopeCore`) — lire `conditionRef` et **annuler** la direction `down` · `_shared/keel/weight_pace.ts:172` (relever le plancher absolu) · l'éviction listeria dans le prompt, **pour cette bouche seulement** |
| **migration** | ⚠️ **oui si** une bouche **sans compte** doit pouvoir porter une condition — il n'existe pas de `household_member_conditions` *(décision produit n°5 du registre)* |
| **mesure AVANT** | `select count(*) from student_safety_constraints where condition_ref is not null` → **0** · déficit ouvert à une bouche portant `pregnancy` : **oui**, jusqu'à 1 200 kcal |
| **direction** | ⬇️ le déficit tombe à **0** pour cette bouche · aucune boîte pesée · retrait du poisson fumé à froid, des charcuteries crues et des fromages à pâte molle non cuits **pour elle seule** |
| **mesure APRÈS** | ⟳ **un cas qui MORD et un cas qui PASSE** : enceinte + `fat_loss` ⇒ `noSizing("pregnancy")` · un autre `condition_ref` ⇒ boîte **byte-identique**. Et un compteur `condition_gate{pregnancy, breastfeeding, other, none}`. **Seuil : 4 populations comptées, `none` majoritaire** |
| **armé par** | le compteur, plus le cas byte-identique — sans lui on ne saurait pas si la garde mord trop large |
| **coût** | **un lot** |
| **risque** | ⛔ **Ne PAS armer la ceinture de sortie sur `conditionRef`** : le dépôt a mesuré que l'armer sur `diabetes` **bâillonne un message d'urgence**. Ce lot touche le **calcul**, jamais le verrou de texte. ⚠️ Fer, folates et iode changent fortement en grossesse et la table sexe × âge ne le sait pas : **c'est l'exception qui rend cette table fausse dans le sens dangereux**, et elle n'est **pas** fermée ici |

## ⟳ C1 — la contamination croisée *(remontée de la vague 5)*

| | |
|---|---|
| **quoi** | Quand une bouche porte une contrainte médicale et qu'un plat dédié existe dans le même repas, la consigne dit de ne pas partager la poêle. |
| **pourquoi** | ⛔ **Aucune règle nulle part** — 2 occurrences, aucune fonctionnelle. C'est **le seul sujet du moteur où une erreur ne fait pas un plan médiocre : elle rend malade.** |
| **dépend de** | ⟳ **rien** — la v1 la déclarait dépendante de `L26`. **Faux** : `dedicatedDishesFor` est **déjà câblé** (`index.ts:3448`) et **28 plats dédiés** sont mesurés en base. La prémisse est armée aujourd'hui |
| **bloque** | le pilote payant |
| **fichiers** | un bloc de prompt **en position de récence**, armé par la double prémisse `severity='medical'` **et** contenant séparé dans le même repas |
| **migration** | non |
| **mesure AVANT** | **0** occurrence fonctionnelle · **7** lignes `household_member_allergies` · **28** plats dédiés |
| **direction** | le bloc apparaît sur les plans qui remplissent les **deux** prémisses, et **sur eux seulement** |
| **mesure APRÈS** | ⟳ compteur `cross_contact_block{emitted, skipped_no_medical, skipped_no_dedicated}` — **trois populations**, sinon on ne distingue pas « la règle n'avait pas lieu d'être » de « la règle n'a pas tourné ». **Seuil : `emitted` non nul sur la fixture ; `skipped_*` non nuls sur le corpus** |
| **armé par** | ⛔ **Une règle qui ne vit que dans un prompt régresse en réel et personne ne le voit.** Le compteur est ce qui la rend falsifiable |
| **coût** | **un petit lot** pour la consigne · ⚠️ la vérification en sortie est un **chantier** — on ne prouve pas depuis un JSON qu'une poêle a été lavée |
| **risque** | ⚠️ C'est une consigne **non vérifiable**. Il faut donc l'écrire **et dire qu'elle n'est pas garantie**, plutôt que de laisser croire qu'elle l'est |

## ⟳ L0-a — la conservation : ce qui ne dépend PAS de la porte G3 *(scindé)*

| | |
|---|---|
| **quoi** | Le plan cesse de faire manger un plat cuit quatre jours plus tôt, et cesse de faire acheter de la volaille trois jours avant de la cuire. |
| **pourquoi** | ⟳ **Trois défauts dont la valeur ne change pas selon qu'on tranche 48 h ou 72 h.** ① `MAX_FRIDGE_DAYS = 3` est appliqué en **`> 3`** : *cuit dimanche, mangé mercredi — ça passe*. ② **Il y a DEUX fenêtres et elles se CHAÎNENT** : `achat →[CRUE]→ cuisson →[CUITE]→ dernière portion`. **La première n'a aucune constante, aucune colonne, aucun lecteur** — mesuré sur le cas 04 : le poulet attend **3 jours cru**, or une volaille fraîche tient **1 à 2 jours**. ③ ⟳ **Et le compteur existe déjà** : `generated_from.issues`, **112 plans, 677 lignes, 29 violations de conservation sur 14 plans**, en clair. **La v1 disait « impossible de compter » — c'était faux.** |
| **dépend de** | ⟳ **rien** — et surtout **pas G3** |
| **bloque** | `L0-b`, `L35` |
| **fichiers** | `_shared/keel/meal_generation.ts:1880` et `:6082` (`>` → `>=`) · ⟳ **`grocery_waves.ts:59` et `:211` (la date de courses), `accident.ts:1739`, `accident_io.ts:471`** — la constante est **ré-exportée deux fois** · une colonne de fenêtre crue **par GROUPE** sur `food_groups` |
| **migration** | **oui** — une valeur par groupe sur `food_groups` (30 lignes). ⛔ **`food_groups` accorde aujourd'hui S/I/U/D jusqu'à `anon`** : **révoquer dans la même migration** *(voir `S6`)* |
| **mesure AVANT** | ⟳ **exécutable aujourd'hui** : `select count(*) from student_generated_meals where generated_from->'issues' @> '[]'` … → **29 violations de conservation sur 14 plans**, sur 112 plans porteurs et 677 lignes d'issue |
| **direction** | ⬇️ les 29 violations tombent à **0** *(elles sont refusées, pas signalées)* · ⬆️ le nombre de passages aux courses monte **sans congélateur** |
| **mesure APRÈS** | ⟳ **les DEUX populations, parce que c'est une porte de sécurité** : `fridge_window{violations, within, not_evaluated}`. **Seuils : `violations = 0` · `within` non nul · `not_evaluated = 0`.** ⛔ Sans `within`, on ne distinguerait pas « la fenêtre a tourné et rien n'a mordu » de « la fenêtre n'a pas tourné » — **le défaut le plus coûteux de la liste** |
| **armé par** | un test par groupe : poisson ~1 j · volaille et viande hachée ~2 j · viande en pièce ~3 j · légumes frais ~7 j · œufs, secs, conserves ~très long. ⚠️ Et `week_bounds_test.ts:350` porte `assertEquals(MAX_FRIDGE_DAYS, 3)` : **il rougira, et c'est voulu** |
| **coût** | **un lot** *(le chantier, c'est `L0-b`)* |
| **risque** | ⛔ **Porte de SÉCURITÉ, donc fail-closed.** ⚠️ La fenêtre ne s'applique qu'aux occasions **cuisinées à l'avance** : sur 5 jours, **5 des 15 occasions sortent du problème** — sans cet attribut on compte 15 au lieu de 10 |

## ⟳ L24′ — le chiffre ne sort que pour la bouche QUI LE DEMANDE *(remonté, et réécrit)*

| | |
|---|---|
| **quoi** | La porte qui décide si un kcal par bouche peut sortir est branchée — **avant** que la première boîte n'apparaisse. |
| **pourquoi** | ⟳ ⛔ **La v1 affaiblissait la porte qu'elle prétendait brancher.** `canEmitMouthEnergy` code : `if (!reader.show) return {emit:false, …}; if (!mouthIsReader) return {emit:false, reason:"other_mouth"}`. La règle est **« un chiffre ne sort que pour la bouche QUI LE DEMANDE »**. La v1 la réécrivait en **« pour quelqu'un qui a posé un objectif »** — ce qui **ouvrirait au maître le chiffre de 30 bouches sans compte**, exactement ce que `other_mouth` refuse. Et `profiles.energy_display_enabled` ne peut pas rattraper : **une bouche sans compte n'a pas de ligne `profiles`**. |
| **dépend de** | ⟳ **rien** *(la v1 dépendait d'un `L23` qui n'existe nulle part)* · **PORTE P0** |
| **bloque** | `L6′` — la règle d'affichage doit précéder la surface qu'elle gouverne |
| **fichiers** | `_shared/keel/energy_gate.ts:528` — **la brancher telle qu'elle est écrite** · ⟳ **et lui ajouter un paramètre d'âge de bouche REQUIS** : le cas 08 §5② montre qu'un mineur seul dans son contenant récupère un chiffre par la branche individuelle, et la fonction **ne lit pas l'âge** |
| **migration** | non |
| **mesure AVANT** | `canEmitMouthEnergy` : **0 appelant** · `energy_display_enabled` : `not null default false` — déjà opt-in · bouches à objectif : **30/88** |
| **direction** | la porte est branchée. ⛔ **Le nombre de surfaces pouvant émettre un kcal par bouche passe de « non gardé » à « gardé »** — et **pas** de « personne » à « 30 bouches » |
| **mesure APRÈS** | `grep` sans commentaires ni tests → **≥ 1 appelant réel** · compteur `mouth_energy{emitted, other_mouth, reader_off, minor}` — **quatre populations**. **Seuil : `minor` non nul dès qu'un mineur est dans la fixture** |
| **armé par** | ⛔ **Elle passe le plancher TCA comme tout le reste, et un refus de la porte la retire** — un test qui lève le plancher et vérifie que le chiffre disparaît. Plus un test qui vise **un mineur** et vérifie `emit: false` |
| **coût** | **un petit lot** |
| **risque** | ⛔ **Un mineur ne reçoit jamais un nombre qui le vise.** La porte doit lire **l'âge**, pas seulement le nombre d'ids dans `member_ids` |

## S5 — les allergies du foyer entrent au lifecycle RGPD *(⟳ précédé de la réparation de son arme)*

| | |
|---|---|
| **quoi** | Les allergies et interdits d'un foyer sortent avec l'export du compte et partent avec sa suppression. |
| **pourquoi** | **`household_member_allergies` (7) et `household_food_restrictions` (6) ne sont réclamées ni par l'export, ni par la purge, ni par le test.** Ce sont des données de santé. |
| **dépend de** | ⟳ ⛔ **de la réparation de son propre test, qui devient la première moitié du lot** |
| **bloque** | le pilote payant |
| **fichiers** | ⟳ **`supabase/functions/keel_gdpr_lifecycle_test.ts` d'abord** — 608 lignes, une **liste écrite à la main** (`{ table: "student_goals", owner: "user_id", … }`), **sans aucune énumération d'`information_schema`** : une table absente de la liste **ne rougit jamais**. Puis `account-export-v1/index.ts` et `keel_household_purge_user` |
| **migration** | **oui** pour la purge |
| **mesure AVANT** | `grep -c 'household_member_allergies\|household_food_restrictions' supabase/functions/account-export-v1/index.ts` → **0** · tables publiques non citées par le test : **à énumérer** |
| **direction** | le test **énumère** `information_schema.tables` avec une allow-list explicite ; il **rougit** sur les deux tables ; puis on les réclame et il **verdit** |
| **mesure APRÈS** | ⟳ **trois seuils** : le test rougit **avant** le correctif *(preuve qu'il peut rougir)* · **2/2** dans l'export et dans la purge · un export **sans foyer** reste byte-identique |
| **armé par** | ⛔ ⟳ **La v1 s'armait sur un mécanisme inexistant.** L'arme réelle est le premier seuil : **on doit VOIR le test rouge**. Sinon on ferme deux trous et on laisse la porte ouverte pour la table suivante — ce que le lot dit vouloir empêcher |
| **coût** | ⟳ **un lot** *(la v1 disait « un petit lot » ; la réparation du test est la vraie tâche)* |
| **risque** | ⚠️ **La granularité est une décision** : exporte-t-on les allergies des autres bouches dans l'export du maître ? Elle touche **P0** |

## S6 — les grants par défaut

| | |
|---|---|
| **quoi** | `anon` cesse d'avoir tous les droits sur les tables qui portent des données personnelles. |
| **pourquoi** | **`anon` a S/I/U/D** sur `profiles`, `student_generated_meals`, `weekly_reviews`, `substances*` ; **`food_groups`** va jusqu'à `anon` en S/I/U/D. `profiles` est le pire : il porte **`birth_date`, l'entrée de la porte mineur**, et ses policies sont `TO public` avec une clause `ALL`. ⚠️ `student_safety_constraints` accorde **`DELETE` à `authenticated` sans aucune policy DELETE** — résidu, alors que le modèle voulu est la **rétraction**. |
| **dépend de** | rien · ⟳ **`L0-a` en dépend** pour `food_groups` |
| **bloque** | le pilote payant |
| **fichiers** | une migration de `revoke` ciblée, **une table par commit** |
| **migration** | **oui** — `revoke` seulement |
| **mesure AVANT** | ⟳ la requête rend **64 booléens, 60 vrais**. « De trop » n'était pas défini dans la v1 : **la direction le définit maintenant** |
| **direction** | ⟳ **définie** : `anon` perd `INSERT/UPDATE/DELETE` sur les 8 tables = **21 droits** ; `authenticated` garde ce dont une policy se sert. ⛔ **`revoke from public` laisse `anon` en place** — vérifier avec `has_table_privilege('anon', …)`, jamais avec l'absence d'un `grant` |
| **mesure APRÈS** | **0 droit d'écriture pour `anon`** sur les 8 tables, et **les 673 tests vitest + un run réel passent**. ⚠️ `TRUNCATE` échappe à RLS : le vérifier explicitement |
| **armé par** | ⟳ ⛔ **La v1 s'armait sur une matrice de privilèges, qui n'est pas un cas qui passe.** L'arme réelle : **une session de test par rôle** qui exécute les lectures du front sous `authenticated`, puis sous `anon` — une lecture cassée par un `revoke` apparaît **à l'écran**, pas dans une matrice |
| **coût** | **un lot** |
| **risque** | ⛔ **Le plus gros risque de régression du plan.** Une table par commit, un run après chacune |

## ⟳ H1 + H2 — le gate voit enfin le front *(remontés)*

| | |
|---|---|
| **quoi** | Un rouge front cesse de passer le commit. |
| **pourquoi** | `scripts/agent-gate.sh` lance `deno test`, `tsc -b`, `deno check` et `eslint` — **aucun vitest**. Les **44 fichiers / 673 tests** passent quand on les lance à la main, jamais dans le gate. Et `tsconfig.app.json:29` exclut `**/*.test.*` : **0 des 44 fichiers n'est typechecké** — une clé dupliquée (`setupMouthsStep.int.test.ts:367`) est **déjà passée à travers**. |
| **dépend de** | rien |
| **bloque** | ⟳ **`L6′`, `L16`, `D1′`, `L24′`, `L0-a`** — tout lot à surface front est **invérifiable** sans eux |
| **fichiers** | `scripts/agent-gate.sh` · `frontend/tsconfig.app.json` *(ou un `tsconfig.test.json` séparé)* |
| **migration** | non |
| **mesure AVANT** | `grep -c vitest scripts/agent-gate.sh` → **0** · fichiers de test typecheckés : **0 / 44** |
| **direction** | le gate lance vitest ; les 44 fichiers sont typecheckés. ⚠️ **Attendu : au moins une erreur nouvelle apparaît** — la clé dupliquée connue |
| **mesure APRÈS** | `agent-gate.sh` échoue si l'on casse volontairement un test front. **Seuils : 44/44 typecheckés, 673 tests lancés par le gate** |
| **armé par** | ⛔ **une mutation** : casser un test front et vérifier que le gate rougit |
| **coût** | **un petit lot** |
| **risque** | ⚠️ `vitest.config.ts` tourne en `environment: "node"` et n'inclut que `*.int.test.ts` : **un `.tsx` ne serait jamais collecté**, et un composant à portail ne peut pas être monté. **`L6′` s'arme sur un test front — il faut le savoir avant** |

### Fin de vague 1 — vérification en conditions réelles

Sur la fixture : une allergie **avec ligature** écrit une ligne · une intolérance
`strict` **fait refuser** un plat qui la nomme, et un `preference` **ne fait rien** · une
bouche enceinte **ne reçoit aucune boîte pesée** · un plat dédié + une allergie médicale
**émettent le bloc de non-partage** · les 29 violations de conservation tombent à **0**
avec un `within` non nul · l'export contient les allergies du foyer et la purge les
retire · `anon` n'écrit plus · **et un plan sans aucune contrainte sort byte-identique à
avant** — c'est le cas qui PASSE, et sans lui aucune de ces gardes n'est prouvée.

---
---

# VAGUE 2 — LA JOURNÉE DEVIENT CALCULABLE

> Elle **donne sa portée** à tout ce qui suit. Livrer un lot de grammes avant elle, c'est
> changer le comportement de **8 %** des journées solo.
> ⟳ **Elle ne change pas une assiette : elle change un DÉNOMINATEUR.**

## L19b — appliquer ce que le lot 19 a mesuré

| | |
|---|---|
| **quoi** | Le français cesse d'atteindre un autre aliment que celui qu'on a écrit. |
| **pourquoi** | ① `complet/complete/complets/completes` est toujours dans `PREPARATION_MODIFIERS` (`food_composition.ts:384-387`), entré « par symétrie » avec `whole` — mais `wholemeal` est **un seul mot** en anglais et `complet` ne l'est pas : `pain complet grillé` (**7 occurrences réelles**) atteint `white_bread`, **`whole_grain` bascule en `refined_grain` en silence**, et **38 réductions latentes changent l'aliment**. ② **19 alias morts** dont le texte est lui-même un **autre slug** — `bySlug` gagne toujours (`red onion` dit `onion` et capture `red_onion` : l'un des deux est faux). ③ Les **86 alias vérifiés** sont absents de la base. |
| **dépend de** | rien |
| **bloque** | `L-1`, `L-C`, `L17`, et le compteur #2 |
| **fichiers** | `_shared/keel/food_composition.ts:384-387` · migration d'alias depuis `…LOT19-PROPOSITIONS-ALIAS.tsv` (86) et `…-CORRECTIONS-ALIAS.tsv` (9) |
| **migration** | **oui** — `food_composition_aliases` est déjà `revoke`d (`f/f/f/f/f`, vérifié) |
| **mesure AVANT** | ⟳ **reproduite** : `nom-nu.txt` dit `EN 150 100.0 %` et `ÉCART : 26 aliments, 17.3 points`. `pain complet grillé` → `white_bread` · `wrap` → `white_bread` dont `unit_grams = 35 g` **une tranche** ⇒ « 2 wraps » pèse **70 g au lieu de 120** (20 occurrences) |
| **direction** | ⬆️ le français ; l'anglais **ne bouge pas** (déjà 150/150). ⚠️ **Le taux global peut ne PAS bouger** — le corpus ne porte qu'**un** plan français, d'où une mesure d'après **construite** |
| **mesure APRÈS** | rejouer les **150 paires** : FR de **124/150 (82,7 %)** à **≥ 145/150** ; EN reste **150/150** ; écart de **17,3** à **≤ 4 points** |
| **armé par** | les **cinq épreuves automatiques** du lot 19 (`09-verifier-propositions.ts`) — dont *« l'alias n'est pas MORT »*. ⛔ Elles ont déjà **écarté 3 propositions et révélé un alias existant FAUX** |
| **coût** | **un lot** — ⛔ **on ne livre PAS les 4 800 qu'il faudrait pour atteindre 8 formulations** : *« un alias plausible non vérifié est un alias faux pas encore découvert »* |
| **risque** | ⛔ **Un mauvais alias remplace un aliment par un autre, pour tout le monde, définitivement — et ça ressemble à une donnée, pas à un bug.** ⚠️ `prune` (×5) et `pate` restent **irréparables par un alias** : seul un renommage de slug répare *(lot `O8`)* |

## L-1 — `unit_grams` sur les lignes que les plans atteignent

| | |
|---|---|
| **quoi** | Un aliment écrit sans quantité cesse d'éteindre le calcul de tout son plat. |
| **pourquoi** | `unit_grams` sur **72/923 (7,8 %)**. La porte est **binaire** (`plan_energy.ts:232-238` : zéro non résolu **et** zéro non pesé). `missing_quantity` est le **premier** motif d'abstention (**533**), devant l'inconnu (444), et **monte à 866** après le lot 18. Les vingt premiers termes sont connus du référentiel : `olive oil` ×242, `garlic` ×167, `pepper` ×149, `lemon` ×138. |
| **dépend de** | `L19b` |
| **bloque** | `L17`, toute la vague 4 |
| **fichiers** | migration d'`update` sur `food_composition_refs.unit_grams`, **ciblée sur les lignes atteintes**, pas les 923 |
| **migration** | **oui** |
| **mesure AVANT** | ⟳ `unit_grams` **72/923** · `condiment_grams` **17/923** · résolues et **non pesées** malgré la convention : **2 523 / 9 810 (25,7 %)** |
| **direction** | ⬆️ ⚠️ **asymétrique** : le foyer est déjà à 87,6 % de pesée, le solo à **11,2 %**. Le gain sera **majoritairement solo** — et une part vient de **trois générations de prompt mortes** qui écrivent **100 %** de leurs ingrédients sans `amount`. **Mesurer sur les plans du 2026-08-12 ou après**, où le solo remonte à 58,3 % |
| **mesure APRÈS** | non pesées : **25,7 % → ≤ 15 %** · journées calculables solo (plans récents) : **58,3 % → ≥ 70 %** |
| **armé par** | le compteur #3, coupé **par lane** et **par génération de prompt** — sinon le renouvellement du corpus se confond avec le gain du lot |
| **coût** | **un lot** — ~200 lignes atteintes |
| **risque** | ⚠️ Une masse d'usage fausse **pèse** au lieu de s'abstenir : l'erreur passe de « je ne sais pas » à « je crois savoir ». Les valeurs portent leur source, comme les prix du lot 30 |

## ⟳ L17-0 — l'écriture jette la clé `group` que le modèle a écrite *(fiche NEUVE, ouverte par `Q-G2`)*

> ⟳ **Ouverte le 2026-08-21 par la mesure `Q-G2`.** Elle renverse le *pourquoi* de `L17` et de `L18b` :
> **« 0 ligne sur 9 810 porte un `group` » ne mesure PAS la désobéissance du modèle.**

| | |
|---|---|
| **quoi** | Le groupe qu'un modèle déclare pour un ingrédient arrive jusqu'à la base. |
| **pourquoi** | ⛔ ⟳ **Trois faits mesurés, et ils s'enchaînent.** ① `FOOD_GROUP_DECLARATION_BLOCK` est arrivé avec `meal.en.v16` **le 2026-08-19** : sur les 180 plans, **un seul** a été généré sous v16+ — les 179 autres sont **antérieurs au bloc**. « 0 sur 9 810 » compte donc surtout des plans à qui la consigne n'a jamais été envoyée. ② Sur cette **unique** fois, **le modèle a obéi** : le plan `0a02b706…` porte `regime_belt = {groups_declared: 25, groups_valid: 25, groups_refused: 0}` sur 27 lignes d'ingrédient. ③ ⛔ **Et l'écriture a jeté sa réponse** : les clés persistées sont `["amount","grams_raw","in_pantry","quantity","state","term","unit"]` — `ingredientPayload()` (`meal_generation.ts:6593-6603`) recopie **sept clés en dur, sans `group`**, alors que le parseur l'avait posée (`:4433`, `:5004`). ⇒ **Rendre le bloc inconditionnel sans réparer cette fonction ne changera pas le 0 sur 9 810**, et `L17` s'armerait sur une borne qui n'a toujours aucune entrée. |
| **dépend de** | rien |
| **bloque** | ⛔ **`L17` et `L18b`** — c'est la seule entrée de leur borne de groupe |
| **fichiers** | `_shared/keel/meal_generation.ts:6593-6603` (`ingredientPayload`) — ⚠️ **vérifier s'il existe un jumeau côté foyer** avant d'en réparer un seul : *« deux copies d'un même nombre divergent, et c'est celle qu'on regarde le moins qui garde l'ancienne »* |
| **migration** | non — la clé voyage en jsonb |
| **mesure AVANT** | ⟳ **reproduite** : lignes d'ingrédient portant `group` → **0 / 9 810** · plans générés sous `meal.*.v16+` → **1 / 180** · `regime_belt.groups_declared` sur ce plan → **25**, `groups_valid` **25**, `groups_refused` **0** · clés réellement persistées → **7, sans `group`** |
| **direction** | ⬆️ ⚠️ **et elle porte DEUX populations, écrites d'avance** : `groups_declared` *(ce que le modèle écrit)* et `groups_persisted` *(ce qui atteint la base)*. ⛔ **Aujourd'hui l'écart est de 100 %** — 25 déclarés, 0 persistés. Sans les deux compteurs, un modèle qui cesserait de déclarer serait **indiscernable** d'une écriture réparée |
| **mesure APRÈS** | `group` présent sur les lignes d'ingrédient d'un plan neuf : **≥ 1**, et **`groups_persisted = groups_valid`** sur le run. ⛔ **Seuil : l'écart déclaré ↔ persisté tombe à 0** |
| **armé par** | ⛔ **Un compteur, pas un test de forme** — *« champ déclaré par le modèle = compteur obligatoire »*. Le test unitaire ne suffit pas : `ingredientPayload` recopiait déjà sept clés « correctement » |
| **coût** | **un petit lot** |
| **risque** | ⚠️ ⟳ **Le test qui porte le nom de la byte-identité ne la tient pas** : `« FF-042 — sans régime déclaré, le prompt est INCHANGÉ »` (`dietary_regime_solo_lane_test.ts:96-105`) compare `dietBlock: ""` à `dietBlock: "   \n "` — **deux prompts sans régime entre eux** — et **reste vert** sous la modification. La seule garde réelle de la conditionnalité est `:466`. ⛔ **Ne pas prendre ce test vert pour une preuve d'innocuité** |

## L17 — l'abstention se PÈSE *(gardé par G2)*

| | |
|---|---|
| **quoi** | Un ingrédient dont on ignore la masse ne fait plus tomber la journée s'il ne peut pas peser lourd. |
| **pourquoi** | *« On s'abstient quand l'énergie NON RÉSOLUE dépasse une part de la cible (~5 %). Jamais parce qu'un ingrédient manque. »* Le groupe **borne** un inconnu : 12 g de « légume » vaut 1 à 12 kcal (0,4 % d'une journée) ; 130 g de « viande » jusqu'à 34 %. Le dépôt connaît le gain à moitié — *« la porte s'abstenait sur du sel »*, 69 % → 96 %. |
| **dépend de** | `L19b`, `L-1`, ⟳ ⛔ **`L17-0`** *(sans lui la borne n'a aucune entrée)* · ~~PORTE G2~~ ⟳ **G2 FERMÉE le 2026-08-21** *(§⑨ n° 3, coût mesuré par `Q-G2`)* |
| **bloque** | toute la vague 4 |
| **fichiers** | `_shared/keel/plan_energy.ts:225-238` · les bandes existent déjà (`food_composition_group_bands`, 24 groupes bornés) |
| **migration** | non |
| **mesure AVANT** | plats s'abstenant **1 821** · ⛔ **`food_group_ref` déclaré sur une ligne d'ingrédient : 0 sur 9 810** — la borne n'a **aucune entrée** |
| **direction** | ⬆️ journées calculables. ⚠️ **Direction NÉGATIVE attendue sur un second compteur, écrite d'avance** : la part d'énergie venant d'une **borne** monte de 0 à quelque chose. Elle est comptée **à part** (`group_bounds`, le cinquième seau du lot 18) et **jamais fondue dans `model`** — un point de rupture ressemblerait à un fonctionnement |
| **mesure APRÈS** | foyer **27,9 % → ≥ 45 %** · solo **13,2 % → ≥ 30 %** · `share_group_bounds` **non nul** |
| **armé par** | ⛔ **un test qui MUTE le seuil** : passer 5 % à 0 % doit faire retomber le taux à sa valeur d'avant |
| **coût** | **un lot** |
| **risque** | ⛔ **Sans G2, ce lot est désarmé et ressemble à un lot qui marche.** La borne exige un `food_group_ref` déclaré, il y en a **0 sur 9 810**, parce que `FOOD_GROUP_DECLARATION_BLOCK` ne voyage qu'avec la ligne de régime — et **un test tient la promesse d'un prompt byte-identique**. C'est une **décision produit** |

## L18b — armer le repli du lot 18, lancer sa promotion

| | |
|---|---|
| **quoi** | Le sas se remplit, et les lignes vues trois fois entrent au référentiel. |
| **pourquoi** | Le lot 18 est câblé sur les deux lanes et **son sas est à 0**, ses 4 compteurs portent leurs défauts, `promote_pending_food_compositions()` a **0 appelant sur les 22 crons**, et **son repli est structurellement mort** *(G2)*. |
| **dépend de** | `V0-D`, `L17`, **PORTE G2** |
| **bloque** | rien — ⟳ **il consolide, et le plan ne le vend plus comme un changement d'assiette** |
| **fichiers** | `_shared/keel/composition_fill_io.ts` · ⛔ le cron demande `supabase secrets`/`config push`, **interdits** : **le plan donne la commande, il ne la lance pas** |
| **migration** | non |
| **mesure AVANT** | `food_composition_pending` **0** · `composition_fill_weekly` 6 semaines, médiane **0**, `share_*` **NULL** |
| **direction** | ⬇️ `unknowns_median` **baisse semaine après semaine**. ⛔ **S'il ne baisse pas, la table ne se remplit pas et on paie un appel de plus pour rien** |
| **mesure APRÈS** | ⟳ **avec les deux populations** : `pending > 0` **et** un compte de plats **entièrement résolus** *(la v1 ne comptait que la médiane d'inconnus)*. **Seuils : `pending ≥ 3` après le run · `unknowns_median` en baisse sur deux semaines** |
| **armé par** | `composition_fill_weekly` une fois `V0-B` livré · la règle structurelle : `withFilledRefs` ne fait qu'un `bySlug.set`, **`byAlias` est le même objet en sortie qu'en entrée** |
| **coût** | **un petit lot** |
| **risque** | ⛔ **Aliment NEUF, jamais un alias** — `laitue` → `lait`, 12/12. Tenu structurellement : **ne pas relâcher**. ⚠️ Promotion à la main : `select * from promote_pending_food_compositions(3, true);` puis `(3, false)` |

## L-C — les lignes cuites lues comme du cru

| | |
|---|---|
| **quoi** | Une ligne dont le libellé dit « braisé » cesse d'être facturée comme crue. |
| **pourquoi** | **131 lignes** portent un libellé d'état cuit ; **130 ont `yield_class = 'neutral'`** ⇒ `YIELD_FACTORS.neutral = 1.0` et `gramsRawOf` **ne reconvertit rien**. `Beef, braised` porte **240 kcal/100 g cuits** dans une table lue comme du cru. Le lot 30 a réparé le **prix** et l'a écrit : *« le prix est réparé, la calorie non »*. Cas inverse : `noodles` à **104 kcal** en `grain_absorbs` compte **×3,3 trop léger** et **bloque** l'alias `egg noodles` (11 occurrences). |
| **dépend de** | `L19b` — une seule migration de référentiel à la fois |
| **bloque** | la justesse de toute la vague 4 |
| **fichiers** | `update` sur `food_composition_refs`, en reprenant **le classement déjà fait par le lot 30** : 101 `cooked_label_dry_input`, 28 `as_purchased`, 1 à rendement non neutre, **+ 12 lignes qu'aucun `grep` ne trouvait** |
| **migration** | **oui** |
| **mesure AVANT** | ⟳ **le prédicat doit être PUBLIÉ avec le lot** : la v1 annonçait 131/130, un regex de libellé rend **128/128**. Sans la liste exacte, le test « qui liste les 131 » est inconstruisible |
| **direction** | ⟳ ⚠️ **Pas UNE direction : une direction PAR CLASSE**, et elle s'écrit **avant** l'`update`. Vers le haut pour une viande braisée facturée cuite, vers le bas pour des nouilles. ⛔ La v1 reportait cette écriture — **une direction reportée est une direction absente** |
| **mesure APRÈS** | **0** ligne à libellé cuit en `neutral` **hors la liste publiée** · l'énergie d'un plat témoin (200 g de bœuf braisé) recalculée avant/après |
| **armé par** | ⛔ **Le lot 30 a mesuré que l'automatisation rate** : 12 lignes sans mot-clé de cuisson ont dû être lues une par une. **Aucun rapprochement automatique**, et un test qui refuse qu'une ligne entre dans la liste sans décision |
| **coût** | **un lot** — ~143 décisions, déjà classées par le lot 30 |
| **risque** | ⚠️ **689 lignes sur 923 se déclarent `ciqual` sans `ciqual_code`** : pour elles, vérifier contre la source est **impossible** *(lot `O9`)* |

## ⟳ L5 — `sodium_mg`, `sugars_g`, `vitamin_k_ug` *(promis en vague 2 par la v1, et absent)*

| | |
|---|---|
| **quoi** | Le référentiel porte enfin le sel, les sucres et la vitamine K. |
| **pourquoi** | ⛔ **Le sel est le seul nutriment où le produit fait activement du mal sans le voir** : 9-10 g/j en France contre < 5 recommandés, et **`sodium_mg` n'existe même pas** au référentiel. ⛔ Et `vitamin_k_ug` n'est **pas optionnel** : à masse constante, changer d'espèce fait varier K de **deux ordres de grandeur** (épinard ≈ 480 µg/100 g, kale ≈ 700, courgette ≈ 5) — donc *« varier les légumes »* **défait la garde warfarine sans changer un seul gramme**. Or `L9bis` et `L38` poussent précisément le volume végétal. |
| **dépend de** | `L-C` |
| **bloque** | `L9bis`, `L38` — ⟳ **la v1 ne le disait pas** |
| **fichiers** | migration de colonnes + import CIQUAL |
| **migration** | **oui** — colonnes sur une table existante |
| **mesure AVANT** | `sodium_mg`, `sugars_g`, `vitamin_k_ug` : **n'existent pas** |
| **direction** | les trois colonnes existent et sont remplies sur les lignes atteintes par les plans |
| **mesure APRÈS** | couverture des trois colonnes sur les **198 aliments réellement atteints** : **≥ 90 %**. Et une liste fermée d'aliments à K élevé |
| **armé par** | un compteur de la K servie par plan, **et** un test qui vérifie qu'un plan portant une contrainte warfarine tient la K **STABLE**, pas basse |
| **coût** | **un import** |
| **risque** | ⛔ ⟳ **Erreur de catégorie à ne pas commettre** : `sodium_mg` est une valeur à **MAXIMUM**, pas un besoin. On ne dit jamais *« vous êtes en dessous de votre besoin en sel »*. Idem vitamine D et B12, qui sont des **AS** — *voir la porte G6* |

## ⟳ L2-lang — le compteur qui n'existe pas

| | |
|---|---|
| **quoi** | On sait enfin si le produit calcule aussi bien en français qu'en anglais. |
| **pourquoi** | ⟳ **C'est le seul des dix compteurs du tableau de bord qui n'existe pas du tout** — et c'est **le critère de fin de cette vague**. Il exige d'exécuter `plan_energy.ts` sur le corpus sous Deno, et **le corpus ne porte qu'un seul plan `fr-FR`** sur 180. |
| **dépend de** | `L19b` |
| **bloque** | la clôture de la vague 2 |
| **fichiers** | `scripts/` — un script Deno qui importe le résolveur **de production**, jamais une copie |
| **migration** | non |
| **mesure AVANT** | **n'existe pas** |
| **direction** | le chiffre existe, **par lane et par langue** |
| **mesure APRÈS** | ⛔ **dix générations en `fr-FR`, foyer et solo — rien d'autre ne le remplace.** Seuil : l'écart FR/EN sur le **taux de journées calculables** est **≤ 5 points** |
| **armé par** | le script est versionné et rejouable ; sa sortie est archivée avec celle de `V0-E′` |
| **coût** | **un petit lot** + **dix générations** |
| **risque** | ⚠️ Mesurer sur un corpus à **un** plan français, c'est mesurer une génération, pas une langue. **Les dix générations ne sont pas un raffinement : elles sont la mesure** |

### Fin de vague 2 — vérification en conditions réelles

⟳ **Dix runs sur la fixture, cinq en `fr-FR` et cinq en `en`**, et le compteur `L2-lang`
exécuté. C'est **la première fois que ce chiffre existe**.

---
---

# ⟳ VAGUE D — LES DÉCISIONS PRODUIT *(vague neuve)*

> ⛔ **Exigée par la revue produit.** Sur les 31 décisions du registre foyer, la v1 en
> traitait **4 comme des décisions, 10 déguisées en travail technique, 17 absentes**.
> Un lot technique qui tranche une décision produit la tranche **en silence** — le défaut
> que ce plan interdit partout ailleurs.

| | |
|---|---|
| **quoi** | Un humain signe les 31 décisions du registre, une par une, ou écrit pourquoi il ne les signe pas. |
| **pourquoi** | Mesuré : **20 des 23 identifiants** nommés par le registre ont **zéro occurrence** dans le code. Et le plan lui-même tranchait en passant : `S2` rendait identiques deux comportements que le registre voulait **divergents** *(allergie ⇒ retrait ; intolérance ⇒ consigne + avertissement, jamais 422)* ; `L11★` **tuait** le repli à 0,42 que le registre voulait **rendre VISIBLE** ; `L6′` décidait par construction que la boîte individuelle est **réservée aux objectifs**. |
| **dépend de** | `V0-D` — plusieurs décisions ont besoin de voir un plan réel |
| **bloque** | ⛔ **toute la vague 3 et au-delà** |
| **fichiers** | aucun. C'est un document signé, pas du code |
| **migration** | non |
| **mesure AVANT** | ⟳ **le 2026-08-21, 19 des 26 questions du plan ont été tranchées** *(§⑥)* — mais elles ne recouvrent que **7 des 31 décisions du registre foyer**. Restent : **4 posées · 10 tranchées en silence · 17 absentes** |
| **direction** | **31 signatures ou 31 refus écrits.** Aucune ne reste implicite |
| **mesure APRÈS** | **Seuil : 31/31.** ⟳ **Déjà signées : n° 4 (G4), n° 26 (via G5), n° 16, n° 17, n° 18, n° 30 (via le champ `tradeoff`), n° 5-6 partiellement (via `L0bis`).** Restent au minimum, avant tout lot de vague 3 : **n° 1** *(deux niveaux de sévérité pour une bouche sans compte)* · **n° 13** *(un végane fait manger végane six personnes)* · **n° 17** *(l'assiette suppose un pain, un fromage, un dessert non déclarés)* · **n° 24** *(deux titulaires opposés : seul celui qui appuie est entendu)* · **n° 26** *(la boîte à un seul nom dit l'objectif par sa forme)* · **n° 29** · **porte G5** |
| **armé par** | ⛔ Chaque lot de vague 3+ **cite la décision qu'il applique**. Un lot qui n'en cite aucune et qui en touche une est **refusé à la revue** |
| **coût** | **une décision** — mais **31 fois** |
| **risque** | ⛔ ⟳ **La décision n° 29 touche la règle fondatrice, et le plan l'avait perdue** : *« tout le foyer mange sous le coach du maître, sans l'avoir choisi et sans le savoir »*. `MODEL.md` couvre coach → élève ; il ne dit **rien** de coach → **tiers sans compte assis à la table**. C'est la même population que **P0** garde côté juridique. ⟳ Mesuré : **le mot « coach » apparaissait UNE fois dans les 1 486 lignes de la v1**, sans rapport |

---
---

# VAGUE 3 — LES ENTRÉES DU MOTEUR EXISTENT

> ⟳ **C'est la plus grosse livraison d'INTERFACE du plan** — la revue produit a relevé
> que la v1 la rangeait sous un titre de plomberie : les contenants apparaissent sur les
> 102 plans foyer où il n'y en a jamais eu un seul.

## ⟳ X2′ — l'épinglage devient une règle de dépôt *(élargi d'un fichier à tout `_shared/keel`)*

| | |
|---|---|
| **quoi** | Changer une constante numérique fait rougir un test. |
| **pourquoi** | `mouth_anchor_test.ts` (35 tests, **0 échec en 31 ms**) **importe** les constantes qu'il vérifie et recalcule l'attendu avec : changer `0,42` en `1,0` **ne rougit rien**. ⟳ **Mais la v1 se trompait sur l'ampleur et sur la norme** : **57 constantes sont déjà épinglées** par un littéral dans `_shared/keel/*_test.ts` — dont `ACTIVITY_FACTOR === 1.5` et `MAX_FRIDGE_DAYS === 3`. **L'épinglage est la norme.** Et **57 autres ne le sont pas**, réparties sur ~40 fichiers. |
| **dépend de** | rien |
| **bloque** | ⛔ ⟳ **tout lot qui déplace une constante** — pas seulement ceux de `mouth_anchor.ts` comme le croyait la v1 |
| **fichiers** | un test de gate qui **liste** les `export const <NOM> = <nombre>` importés par un test et non épinglés, et **rougit quand la liste grandit** · les épinglages d'emblée : `DENSITY_CEILING_FAT_LOSS`/`_DEFAULT` (L38, L9bis) · `KEEL_MINOR_AGE` (S3, S4) · `BOX_FACTOR_MIN`/`MAX` (L6′) · `PACE_WARN_UP_KG_PER_WEEK`, `MAX_KG_PER_WEEK` (la question `L37`) · `MIN_RESOLUTION_FOR_VERDICT`, `PER_PORTION_PROTEIN_G` (L9bis) · `FILL_REQUEST_CAP` (L18b) · les six de `mouth_anchor.ts` · ⟳ **`MEAL_COMPONENT_KCAL`, que la v1 avait oubliée alors que `L11★` la modifie** |
| **migration** | non |
| **mesure AVANT** | ⟳ **57 épinglées · 57 non épinglées** sur ~40 fichiers. Sur `mouth_anchor_test.ts` : **0** `assertEquals(<CONSTANTE>, <littéral>)` |
| **direction** | la liste des non épinglées **ne grandit plus**, et les 12 constantes que le plan déplace y entrent |
| **mesure APRÈS** | ⛔ **La preuve est une MUTATION, pas un run vert.** **Seuils : 12/12 mutations rougissent · la liste de gate ne grandit pas** |
| **armé par** | le journal de mutation, archivé : constante · valeur mutée · test qui rougit |
| **coût** | ⟳ **un lot** *(la v1 disait « une constante » ; c'est une règle de dépôt)* |
| **risque** | ⚠️ ⟳ `SLOT_DAY_WEIGHT` et `MEAL_COMPONENT_KCAL` sont des `Record`, **pas des scalaires** : `assertEquals(<CONSTANTE>, <littéral>)` ne s'y applique pas tel quel — il faut épingler **l'objet entier** |

## ⟳ X1′ — la constante déclarée quatre fois, et déjà divergente

| | |
|---|---|
| **quoi** | Le refus d'un poids aberrant est le même partout. |
| **pourquoi** | ⟳ **Quatre porteurs, pas trois — et la divergence a DÉJÀ eu lieu** : `energy_target.ts:213-214` (25/400) · `weight_pace.ts:588-589` (25/400, **redéclarées** alors que le commentaire dit *« importées »*) · `weekly_flow.ts:92-93` (25/400) · ⛔ **`student_body_io.ts:88-89` (25 / 350)**. La v1 écrivait *« valeurs identiques, donc le défaut est invisible »* : **faux**. |
| **dépend de** | rien |
| **bloque** | rien — mais c'est une bombe amorcée |
| **fichiers** | les quatre |
| **migration** | non |
| **mesure AVANT** | ⟳ **2 déclarations de `TARGET_WEIGHT_KG_MIN`** + **2 de `WEIGHT_KG_MIN`**, dont une à **350** |
| **direction** | 1 déclaration, 3 imports, **et la divergence 350/400 tranchée explicitement** |
| **mesure APRÈS** | ⟳ **le grep de la v1 était faux** — il ne matchait pas `WEIGHT_KG_MIN`. Nouveau seuil : `rg -c '(TARGET_)?WEIGHT_KG_(MIN\|MAX)\s*=' supabase/functions/_shared/keel/` → **1 fichier, 2 lignes** |
| **armé par** | ⚠️ Si l'import est impossible (cycle), le patron cité par la v1 — `energy_target_test.ts:239` — ⟳ **fait lui-même partie des 57 tests auto-paramétrés**. Il faut donc un test qui compare les **valeurs**, pas un qui les importe |
| **coût** | **une constante** |
| **risque** | ⛔ Trancher 350 contre 400 **change un refus** : c'est une décision, pas un nettoyage |

## L6′ — la boîte v4 atteint la base ET l'écran *(⟳ gardé par G5 et P0)*

| | |
|---|---|
| **quoi** | Un plan de foyer rend enfin des contenants à l'écran, et chaque bouche voit le sien. |
| **pourquoi** | **`dishes[].boxes` absent des 1 821 plats des 180 plans.** Les 56 plans porteurs les portent sous `preparations[].boxes`, l'ancien emplacement, que le lecteur front **refuse explicitement** : *« ces plans-là n'ont pas de table de pesée, et l'écran se tait »*. ⇒ **Aucun des 102 plans foyer ne rend une boîte.** |
| **dépend de** | `V0-D` *(ce lot EST ce que le run casse)* · `VAGUE D` · ⛔ ⟳ **PORTE G5** *(déplacée depuis `L26` par la revue produit — c'est CE lot qui crée le second emplacement du gramme)* · **PORTE P0** · `L24′` · `H1`, `H2` |
| **bloque** | `L9bis`, `L11★`, `L13`, `L38`, le filtre v4 de `portion_note` |
| **fichiers** | ⟳ **17 fichiers front portent `boxes`**, pas 3 : `api/mealGeneration.ts`, `lib/mealBoxes.ts`, `lib/planDaySlots.ts`, `components/DishCard.tsx`, `plan/BoxTable.tsx`, `plan/PlanDayBlock.tsx`, `pages/TodayPage.tsx`, i18n — plus **~480 lignes de parseur** (`meal_generation.ts:5113-5594`, 4 compteurs) et `household_portions.ts:2790` · ⟳ ⛔ **et `weighedPortionMembers` (`household_portions.ts:2321`), qui filtre sur `goal` et RIEN D'AUTRE** |
| **migration** | ⚠️ **à confirmer après le run** — le journal dit `boxes: 12/20/32` sur 51 plans, et **je n'ai pas retrouvé où ces contenants ont été écrits**. Écart journal/persistance non fermé |
| **mesure AVANT** | `dishes[].boxes` **0/180** · `dishes[].box` **0/180** · ⟳ `preparations[].boxes` **56** *(clé présente)* / **50** *(tableau non vide)* — **la v1 ne disait pas lequel** · boîtes à l'écran **0** |
| **direction** | ⬆️ le plan porte `dishes[].boxes` avec `items[]` et `member_ids[]`. ⚠️ **Le nombre attendu n'est pas 3, c'est 3 PAR REPAS** : sur 5 jours × 2 repas cuisinés, **~30 contenants** |
| **mesure APRÈS** | **≥ 1 plan** avec `jsonb_array_length(dishes->0->'boxes') ≥ 1` *(tableau non vide, définition fixée)* · `readBoxes()` non vide · ⟳ le filtre de `portion_note` **retire des lignes** — **seuil : ≥ 100 des 181** · ⟳ **0 mineur dans `weighedPortionMembers`** |
| **armé par** | la ligne en base · un test front qui monte `BoxTable` : ⛔ `context="dish"` **n'affiche AUCUN gramme** *(le contenant EST la portion)*, `context="session"` en affiche · ⚠️ ⟳ **et ce test dépend de `H1`/`H2`** — `vitest.config.ts` tourne en `environment: "node"` et n'inclut que `*.int.test.ts` : un `.tsx` **ne serait jamais collecté** |
| **coût** | ⟳ **un lot, minimum** — 17 fichiers front, 480 lignes de parseur, et un écart journal/persistance non fermé |
| **risque** | ⛔ ⟳ **`weighedPortionMembers` n'a AUCUN filtre d'âge** : un mineur porteur de `muscle_gain` — **autorisé en toutes lettres par la migration `20260813180000`** — entre dans le schéma de boîtes et **reçoit un contenant nominatif pesé à table**. **Le filtre d'âge se pose ICI, pas dans `S4`.** ⛔ **G5** : faire exister la boîte sans trancher laisse le gramme à deux endroits, dont un qui n'a pas de destinataire |

## ⟳ L16′ — l'activité : mesurer ce qui manque, pas corriger un repli

| | |
|---|---|
| **quoi** | On sait combien de bouches sont dimensionnées sur une hypothèse — **et combien ne le sont sur rien**. |
| **pourquoi** | ⟳ **La v1 se trompait de diagnostic.** Elle écrivait *« le repli EST le produit, à 87 bouches sur 88 »*. Mesuré : **`crossed 1 · legacy 24 · assumed 18` sur 43 lignes de corps** — 24 bouches passent par `ACTIVITY_FACTORS` (1,45→2,00), pas par le repli. ⛔ **Le vrai trou est ailleurs et il est deux fois plus large : 45 bouches sur 88 n'ont AUCUNE ligne de corps**, donc ni facteur, ni enveloppe. ⚠️ Et le repli se trompe **vers le bas** : +3 % sur un sédentaire, **−42 %** sur un métier physique à 5 séances. |
| **dépend de** | `H1`, `H2` |
| **bloque** | rien — ⟳ **la v1 le déclarait bloquant pour `L11★` : faux**, `mouth_anchor.ts` ne consomme aucun symbole de ce lot |
| **fichiers** | ⟳ **le compteur EXISTE DÉJÀ** : `ACTIVITY_FACTOR_SOURCES = ["crossed","legacy","assumed"]` (`meal_envelope.ts:350`), agrégé et journalisé (`index.ts:5472`, `:5726`). **Il n'a jamais tourné, faute de plan.** Reste : `SetupPage.tsx` (`peopleStepBlockers`) si l'activité doit retenir |
| **migration** | non |
| **mesure AVANT** | ⟳ **1 / 24 / 18** sur 43 corps · **45 bouches sans ligne de corps** |
| **direction** | ⟳ **honnête, et ce n'est pas une direction de grammes** : le compteur existant **tourne enfin**. Puis, **et seulement si la vague D tranche que l'activité retient** : `crossed` monte |
| **mesure APRÈS** | le journal porte les **trois** populations sur chaque plan. ⟳ **Seuil inconditionnel : `crossed + legacy + assumed = nombre de bouches dimensionnées`** — s'il ne somme pas, une quatrième population existe et personne ne la voit. Le seuil `crossed ≥ 50 %` reste **conditionnel** à la décision |
| **armé par** | le compteur #6, avec ses trois populations, sur la sortie datée de `V0-E′` |
| **coût** | ⟳ **une constante** pour la mesure *(le compteur existe)* · **un écran** si l'activité doit retenir |
| **risque** | ⛔ Faire retenir l'entonnoir **ferme le couloir d'entrée** à des comptes qui passent. La décision du 2026-08-19 allait dans l'autre sens **avec un arbitrage écrit** : le renverser demande de le nommer *(vague D)* |

## ⟳ E1 — requalifié en instance de la PORTE G7

| | |
|---|---|
| **quoi** | ~~Un compte solo cesse de répondre à trois questions qui ne changent rien.~~ ⟳ **Décider si la lane solo reçoit le moteur d'ancrage.** |
| **pourquoi** | `takes_dessert`/`takes_cheese`/`takes_bread` sont écrits par les deux chemins et lus **uniquement** par `generate-household-meal-v1/index.ts:1990` — **zéro occurrence dans `generate-meal-v1`**. ⟳ ⛔ **Mais « brancher la lecture » est impossible tel quel** : `generate-meal-v1` **n'importe NI `mouth_anchor.ts` NI `mouth_energy.ts`**, et `mealStructureState` n'existe que dans `mouth_anchor.ts`. Il faudrait **porter toute la chaîne d'ancrage sur la lane solo**. **C'est G7, pas un petit lot** — la plus grosse sous-estimation de la v1. |
| **dépend de** | ⛔ **PORTE G7** |
| **bloque** | rien — ⟳ **et son risque annoncé était impossible** : la lane solo n'appelle jamais `composedDishShare` |
| **fichiers** | selon la décision G7 : soit porter la chaîne, soit **retirer les trois questions de l'écran solo** |
| **migration** | non |
| **mesure AVANT** | `grep -c 'takes_dessert' supabase/functions/generate-meal-v1/` → **0** · fiches à trois cases tranchées : **2/43** |
| **direction** | ⟳ **deux directions selon la décision, et il faut choisir avant d'écrire** : ① porter le moteur ⇒ le compteur `meal_structure` apparaît sur les plans solo ; ② ne pas le porter ⇒ **les trois questions disparaissent de l'écran solo**, et c'est une livraison utilisateur honnête |
| **mesure APRÈS** | selon la branche. **Seuil ① : `meal_structure` présent sur ≥ 1 plan solo. Seuil ② : 0 occurrence des trois champs sur l'écran solo** |
| **armé par** | l'histogramme `meal_structure` sur un plan solo · ou un test d'écran qui refuse les trois champs en solo |
| **coût** | ⟳ **un chantier (branche ①)** ou **un écran (branche ②)** — *la v1 disait « un petit lot »* |
| **risque** | ⛔ Poser la question sans lire la réponse est le défaut que ce lot ferme. Le fermer par le bas *(retirer la question)* est **moins cher et plus honnête** que par le haut |

### Fin de vague 3 — vérification en conditions réelles

Un run qui rend des boîtes **visibles**, un `box_sizing.anchor` **présent**, **0 mineur**
dans `weighedPortionMembers`, le filtre de `portion_note` qui retire **≥ 100** des 181
lignes, et **12 mutations sur 12 qui rougissent**. ⛔ Tant que ces cinq choses ne sont pas
vraies, **aucun lot de la vague 4 ne se livre**.

---
---

# VAGUE 4 — LES GRAMMES BOUGENT

> ⟳ **L'ORDRE A ÉTÉ INVERSÉ** par la revue architecte : la ceinture passe **devant**
> l'amplificateur, parce que les deux vivent dans la même expression à cinq lignes
> d'écart (`mouth_anchor.ts:666` / `:671`).
> Chaque lot porte une **direction écrite d'avance** et un **seuil chiffré** — la revue
> QA a relevé **17 mesures APRÈS sans seuil** dans la v1.

## L4 — le groupe déclaré d'un apport fixe *(⟳ remonté en tête)*

| | |
|---|---|
| **quoi** | Une Danette cesse d'être comptée comme de la protéine maigre. |
| **pourquoi** | Un apport `nutrition: "declared"` est **forcé** dans `foodGroupRef: "lean_protein"`. Le commentaire du code le dit : *« le jour où des apports déclarés NON protéiques apparaissent, ce champ doit venir de la déclaration »*. **C'est ce jour-là.** |
| **dépend de** | rien — ⟳ **et il PRÉCÈDE `L9bis`**, dont il déclarait déjà bloquer la justesse |
| **bloque** | `L9bis`, `L11★` |
| **fichiers** | ⟳ ⛔ **la v1 nommait le mauvais fichier.** `food_composition.ts` porte **0 occurrence** de `lean_protein`. Le vrai code est **`fixed_intakes.ts:84`** (type), **`:498`** (`augmentedIndexFor`), **`:525`** (`foodGroupRef: "lean_protein"`), plus **`household_fixed_intakes.ts:50`** |
| **migration** | ⚠️ **oui si** la déclaration doit porter un groupe — à confirmer sur le schéma |
| **mesure AVANT** | ⟳ **`household_members.fixed_intakes` porte 1 SEULE LIGNE dans toute la base.** Il n'y a pas de distribution : « 100 % en `lean_protein` » est vrai **sur n = 1** |
| **direction** | la distribution s'étale. ⟳ ⚠️ **Et c'est une direction que n = 1 ne peut pas falsifier** : le lot ne devient mesurable que quand la fixture porte **au moins trois apports de groupes différents**, dont un dessert |
| **mesure APRÈS** | **Seuil : ≥ 3 apports de ≥ 2 groupes distincts sur la fixture, dont 0 dessert en `lean_protein`** · la cible protéique du plan **ne monte pas** quand on déclare un dessert |
| **armé par** | le test du dessert, avec la cible protéique **en littéral** avant et après |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **Tout compte protéique est faux tant que les apports fixes sont invisibles** — le shaker de 15 g n'entre nulle part, et un contrôle qui ne le voit pas se trompe **dans le sens qui refuse à tort** |

## L9bis — LA CEINTURE : une porte, deux critères, deux portées *(⟳ réécrit par la revue nutritionniste)*

| | |
|---|---|
| **quoi** | Un plat trop dilué est **refusé et recomposé** — plus jamais raboté en silence. |
| **pourquoi** | ⛔ **La borne actuelle ne refuse pas : elle rabote.** `physicalMax` plafonne le **facteur**, il ne rejette pas le plat — la soupe de 2 508 g n'est pas renvoyée au modèle, elle est **servie plus petite, sous la cible. La personne est sous-nourrie, en silence.** Et `MEAL_MAX_GRAMS_PER_KG = 8` suit le **poids total** : 880 g pour 110 kg, 584 g pour 73 kg — **l'estomac ne grossit pas avec la masse grasse, donc la règle est la plus permissive exactement là où on voudrait qu'elle serre.** |
| **dépend de** | `L6′`, `X2′`, `L4`, `L5` *(la vitamine K)*, `L17` *(portée)*, **PORTE P1** |
| **bloque** | ⛔ **`L11★`** *(inversé)*, `L38`, `L13`, `L21` |
| **fichiers** | `mouth_anchor.ts:169` et `:671` *(remplacer le terme `physicalMax`)* · une porte de composition neuve · `protein_anchor.ts` |
| **migration** | non |
| **mesure AVANT** | ⟳ **`protein_anchor.ts` MORD — la v1 disait deux fois « personne ne l'a mesuré »** : `generate-meal-v1/index.ts:183` importe `proteinAnchorRetryInstruction`, `:2020` déclenche une relance, `:2050` journalise `missing_before/after`. **Il mord sur la lane solo, pas sur le foyer** — c'est ça, le trou. Puis : plats sous `0,8 kcal/g` et journées sous le seuil protéique, sur la fixture |
| **direction** | ⬇️ plats servis **sous la cible sans refus** → **0** · ⬆️ recompositions *(coût assumé)*. ⚠️ Le plancher de densité **n'a besoin d'aucune donnée de corps** : il ferme au passage le trou `physicalMax = Infinity` quand `weightKg = 0` |
| **mesure APRÈS** | ⟳ **avec des seuils, que la v1 n'avait pas** : plats sous la cible sans refus **= 0** · recompositions **> 0 et ≤ 15 % des plats** *(sans borne haute, une explosion de recompositions VALIDERAIT la direction — défaut relevé par la revue QA)* · **deux portées** : densité **par repas**, protéine **par jour** |
| **armé par** | un compteur des **refus ET des passages** · un test qui compose une soupe de 2 kg et vérifie qu'elle est **refusée**, pas rabotée |
| **coût** | **un lot** |
| **risque** | ⛔ ⟳ **LE PLANCHER `0,8 kcal/g` REFUSE LE PETIT-DÉJEUNER.** Mesuré sur `food_composition_refs` : yaourt nature **0,59** · pomme **0,48** · melon **0,23** · brocoli **0,33**. Bol yaourt 200 g + pomme 150 g = **0,54 ⇒ refusé**. Shaker ≈ **0,36 ⇒ refusé**. Assiette à 500 g de légumes = **0,79 ⇒ refusée**, contre le repère OMS de 400 g/j. ⇒ **Le plancher ne se juge QUE sur les occasions CUISINÉES** ; petit-déjeuner, collation, shaker et forfait en sont exemptés — et `L11★` crée précisément ces occasions. ⛔ ⟳ **Et retirer `MEAL_MAX_GRAMS_PER_KG` sans le remplacer par un plafond de MASSE ABSOLU laisse `ANCHOR_FACTOR_MAX = 3,00` seul après le ×2,38** : un rapport ne borne pas une masse. ⛔ **La lane foyer n'a AUCUN second essai** : livrer la porte côté foyer sans relance transforme un plat médiocre en absence de plat |

### ⟳ Le critère protéique — le littéral est mort, le rapport le remplace

⛔ **`≥ 37 g / 1 000 kcal` n'a AUCUNE source dans la revue de littérature.** Il vient de
l'arithmétique d'**une bouche fictive** — `117 ÷ 3 152 = 37,1`, cas 02 — **et le cas 08 a
corrigé cette bouche** : cible 3 506 ⇒ **33,4**. Le design a figé le littéral, la v1 l'a
recopié.

Il vaut ~15 % de l'énergie, c'est-à-dire une **composition de population**, pas un besoin.
Pour une bouche en perte le vrai rapport est **70-90** *(Léa : 70,8)* : **un verdict vert
à 37 valide une journée à 52 % de son plancher.**

> **Le critère devient `plancherProtéique_g ÷ cible_kcal × 1 000`, calculé PAR BOUCHE**,
> au même endroit que l'enveloppe.

⚠️ **Et il faut un TROISIÈME ÉTAT.** Mesuré sur la vraie table : **0 ligne sur ~200** de
céréales complètes, céréales raffinées, féculents et fruits n'atteint 70,8 g/1 000 kcal.
Le tronc **ne peut pas** porter le plancher de Léa. ⇒ soit un **add-on protéique dirigé**,
soit **« impossible à couvrir »** — jamais un refus en boucle sur une lane sans second
essai.

## L11★ — L'AMPLIFICATEUR : les six moments, le forfait, la mort de `composedDishShare`

> ⛔ **UN SEUL LOT**, et la fusion a été **vérifiée ligne à ligne** par la revue
> architecte : `mouth_anchor.ts:356-360` — `whole = COMPOSED_DISH_KCAL; if (dessert)
> whole += MEAL_COMPONENT_KCAL.dessert; … return COMPOSED_DISH_KCAL / whole` : **L25 et
> L11 sont littéralement le même quotient.** Et `:666` compose `coverage` (L22) avec
> `structure.share` (L25+L11) **dans une seule expression**.
> ⟳ **Correction de vocabulaire** : il y a **deux dénominateurs qui se MULTIPLIENT**
> (`dayCoverageOf:427` et `composedDishShare:356`), pas un seul partagé — et c'est cette
> distinction qui faisait rater le défaut ci-dessous.

| | |
|---|---|
| **quoi** | La journée cesse d'être découpée en trois moments sur six, le fromage et le dessert sont **comptés sans être prescrits**, et l'assiette cesse de ne porter que 42 % du repas. |
| **pourquoi** | ① `EATING_OCCASIONS` porte **six** moments, `SLOT_DAY_WEIGHT` n'en pèse que **trois** — un shaker l'après-midi apporte de l'énergie en comptant pour zéro, donc **un facteur trop petit, systématiquement, dans le sens qui sous-nourrit**. ② `COMPOSED_DISH_MEAL_SHARE = 0,42` : **1 100 kcal au lieu de 2 600** sur la journée du cas travaillé. ③ Sans forfait, retirer le 0,42 **prescrirait** un dessert à quelqu'un qui a seulement dit qu'il en mangeait. |
| **dépend de** | ⛔ ⟳ **`L9bis` D'ABORD** *(inversé)* · `L6′`, `X2′`, `L4` · ⟳ **le repli d'occasions** · ⟳ **la soustraction des apports fixes** |
| **bloque** | `L38`, `L12`, `L13` |
| **fichiers** | `mouth_anchor.ts:399` (`SLOT_DAY_WEIGHT` → 6 poids **+ une `nature`**), `:207`, `:261` (`MEAL_COMPONENT_KCAL`), `:349`, `:418`, ⟳ **`:423` (le repli)** · le bloc de prompt qui porte la **nature** du moment |
| **migration** | non |
| **mesure AVANT** | `composedDishShare` rend **0,42 pour 41 fiches sur 43** · ⛔ **la valeur d'aujourd'hui des grammes servis est INCONNUE** — la chaîne n'a jamais tourné : **le « avant » est le run de `V0-D`, pas la base** |
| **direction** | ⬆️ **×2,4 sur les fiches muettes** — effet recherché. ⚠️ **Non-régression à trois moments déclarés** : `0,22/0,82 = 0,268` · `0,32/0,82 = 0,390` · `0,28/0,82 = 0,341`, contre 0,25/0,40/0,35 — *(arithmétique vérifiée par la revue QA)*. ⛔ ⟳ **ET UNE SECONDE DIRECTION, INVERSE, QUE LA v1 NE VOYAIT PAS** : `mouth_anchor.ts:423` fait `declaredSlots.length > 0 ? declaredSlots : Object.keys(SLOT_DAY_WEIGHT)`. Passer de 3 à 6 clés fait tomber la couverture de repli de **1,00 à 0,82** pour les **68 bouches sur 88 sans rythme déclaré** — **−18 % de cible sur la population majoritaire**. La contre-épreuve de la v1 ne couvrait que **20 bouches sur 88** |
| **mesure APRÈS** | ⟳ **avec des seuils, et sur les DEUX populations** : ① bouches à rythme déclaré (20/88) — le facteur bouge de **≤ 3 %** ; ② bouches **sans** rythme (68/88) — la couverture reste à **1,00**, pas 0,82 ; ③ grammes servis par bouche et par plat, avant/après ; ④ le facteur d'ancrage **s'éloigne** de `ANCHOR_FACTOR_MAX` — **seuil : < 90 % du plafond sur toutes les bouches**. ⛔ **Si les trois bouches sortent toutes exactement au plafond, le lot a reproduit le défaut qu'il corrige** *(c'est ce qui est arrivé au run réel précédent : trois bouches-jours, toutes à ×1,600 exactement)* |
| **armé par** | ① les mutations de `X2′` *(dont `MEAL_COMPONENT_KCAL`)* ; ② un compteur des **six** moments avec leur nature ; ③ ⛔ **la règle anti-double-comptage** — un test qui pose un shaker à 16 h 30 et vérifie qu'il n'est retiré **qu'une fois** ; ④ ⟳ **un test de parité `Object.keys(SLOT_DAY_WEIGHT)` ↔ `EATING_OCCASIONS`** *(le patron existe : `household_habits_test.ts:52`)* — c'est **le test qui attrape la chute de 18 %** |
| **coût** | **un lot** |
| **risque** | ⛔ **Le lot le plus dangereux du plan.** ⛔ ⟳ **Et la règle anti-double-comptage suppose une soustraction qui n'existe pas** : `mouth_anchor.ts` et `mouth_energy.ts` portent **0 occurrence** de `fixedIntake`. **Il n'y a rien à ne pas compter deux fois — il faut d'abord construire le chemin**, et il n'était dans aucune fiche de la v1. ⚠️ **La NATURE du moment est aussi importante que son poids** : sans elle, le modèle composera des choux de Bruxelles à 16 h |

## L1 — le poids de référence protéique est plafonné *(sans jamais nommer l'indice)*

| | |
|---|---|
| **quoi** | Une personne corpulente cesse de recevoir une cible protéique calculée sur son poids total. |
| **pourquoi** | Le plancher `2,0 g/kg` descend de Helms 2014, qui parle en **masse maigre** : la même règle donne 2,35 g/kg de masse maigre à quelqu'un de mince et **3,33 à quelqu'un de corpulent**. Plafonner le **poids de référence** referme **~72 %** du biais (220 g → 173 g) et c'est **une ligne**. |
| **dépend de** | `X2′` |
| **bloque** | rien |
| **fichiers** | `meal_envelope.ts:505` (`PROTEIN_FLOOR_G_PER_KG`), `:525` (`SENIOR_PROTEIN_FLOOR_G_PER_KG`) |
| **migration** | non |
| **mesure AVANT** | ⛔ **La porte n'existe pas.** Les fiches 01-07 écrivent *« IMC 21,1, donc pas de plafond »* comme si une porte était franchie : **elle n'existe pas**, et le cas 08 §0② le corrige |
| **direction** | ⬇️ la cible protéique baisse **chez les corps corpulents uniquement** |
| **mesure APRÈS** | trois corps témoins (mince, moyen, corpulent) : **seuil — elle ne bouge que sur le troisième**, et de **≥ 15 %** |
| **armé par** | un test à trois corps, valeurs attendues **en littéral** |
| **coût** | **une constante** — le meilleur rapport du dossier |
| **risque** | ⛔ **L'indice de masse corporelle est BANNI en toutes lettres** — *« no BMI, no category, no target »*, et le terme figure dans la liste des mots interdits **et dans le validateur de lexique**. Écrire un **poids de référence** (`min(poids, 30 × taille²)`), **sans jamais nommer l'indice**, ni en code, ni en commentaire visible, ni à l'écran. ⚠️ **Un arbitrage à trancher DANS ce lot** : appliqué à un senior corpulent, le plafond **FAIT DESCENDRE** sa cible — 1,60 m / 90 kg, ≥ 60 ans : 108 g sans plafond, **92 g avec, soit −16 g/j sur la population même pour laquelle la source recommande le plafond**. ⟳ Et la revue nutritionniste ajoute que le senior est le **trou n° 11** de la littérature et que le plancher devrait y **monter**. **Seul le silence ne se défend pas.** ⛔ ⟳ Et `O6` (GLP-1) demande de **SUSPENDRE ce plafond** : les deux lots doivent se connaître |

## L38 — la cible de densité suit l'objectif

| | |
|---|---|
| **quoi** | Quelqu'un qui veut prendre du poids cesse de recevoir 900 g de nourriture de plus pour la même énergie. |
| **pourquoi** | Cas 06 : la journée pèse **2 577 g** dont **1,1 kg au déjeuner, dans une gamelle**. À 1,24 kcal/g, 3 537 kcal pèsent **2 852 g/j** ; à 1,8, **1 965 g**. **900 g d'écart à énergie égale.** La cible basse a été posée pour la **perte** ; en **prise** elle travaille contre l'objectif. |
| **dépend de** | `L9bis` *(le plancher d'abord)*, `L5` *(la vitamine K)*, **PORTE P1** |
| **bloque** | rien |
| **fichiers** | `meal_envelope.ts:551-552` — **il manque la CIBLE**, et son sens s'inverse |
| **migration** | non |
| **mesure AVANT** | deux **plafonds**, **aucune cible** · densité livrée par objectif, sur la fixture |
| **direction** | perte ⬇️ · maintien neutre · **prise ⬆️**. ⛔ **Ne pas confondre avec le plancher de `L9bis`** : l'un **refuse** et vaut pour tous, l'autre **oriente** et s'inverse |
| **mesure APRÈS** | poids de la journée par objectif, avant/après. **Seuil : la bouche en prise perd ≥ 500 g/j à énergie constante** |
| **armé par** | un compteur de la densité **visée** et de la densité **livrée**, par objectif |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **La règle 5 du §1 du design doit gagner sa condition** — elle est vraie **en perte**, fausse en prise. ⛔ **Le levier de Klos ne s'applique PAS à une bouche boîtée** : chez elle l'énergie est épinglée et le poids est libre, donc baisser la densité **ne retire aucune kcal** — elle achète du **volume**. L'effet mesuré (−223 kcal) ne vaut que pour les bouches du **plat commun**, en *ad libitum*. **Le levier le mieux prouvé du dossier sert la majorité du foyer, pas la bouche à objectif.** ⚠️ ⟳ **Et `DENSITY_CEILING_DEFAULT = 1,8` n'est pas neutre** : la revue nutritionniste mesure que **1,96 kcal/g est la densité du bras qui a fait manger +508 kcal/j** (Hall 2019). 1,8 en défaut, c'est ce bras-là pour toute bouche hors `fat_loss`. **La valeur doit être rouverte, pas seulement son sens** |

## ⟳ L37 — le plafond de surplus monte à la ligne d'avertissement *(décision du 2026-08-21)*

| | |
|---|---|
| **quoi** | Quelqu'un qui veut prendre 0,35 kg par semaine peut le demander. |
| **pourquoi** | `MAX_SURPLUS_FRACTION` bloque à **0,29 kg/sem** pendant que `PACE_WARNINGS.surplus_becomes_fat` — *celui qui dit quelque chose de vrai* — n'alerte qu'à **0,5**. **Le produit interdit 42 % en dessous de sa propre ligne de danger**, et quelqu'un qui lit les deux ne comprend pas. |
| **dépend de** | `X2′` · ⚠️ **`S4` touche le même CHECK** (`household_members_target_pace_range_check`) — les deux migrations se coordonnent |
| **bloque** | rien |
| **fichiers** | `meal_envelope.ts:497` · le CHECK en base |
| **migration** | **oui** si le CHECK borne à l'ancienne valeur |
| **mesure AVANT** | bouches avec un `target_pace` réglé : **4/88** · `clampedBy: 'surplus_band'` sur le cas 08 |
| **direction** | 0,35 devient un choix normal ; l'avertissement se déclenche en approchant de 0,5 |
| **mesure APRÈS** | un compteur `clampedBy` **avec ses populations** (`clamped` / `passed`). **Seuil : `passed` non nul à 0,35 kg/sem** |
| **armé par** | ⟳ ⛔ **La v1 disait « rien à changer côté écran, et c'est ce qui le rend invisible » — donc le lot n'avait AUCUNE arme.** L'arme est le compteur ci-dessus : sans lui on ne saura pas s'il a pris |
| **coût** | **une constante** |
| **risque** | ⛔ ⟳ **DEUX contraintes d'implémentation mesurées par la revue, que la décision n'avait pas.** ① `MAX_SURPLUS_FRACTION` **n'est pas un littéral** : c'est `Math.round((ENERGY_BANDS.muscle_gain.high − 1) × 1000) / 1000`. **Le relever déplace aussi `ENERGY_BANDS.muscle_gain`, qui est la BANDE DE VERDICT** — il faut décider si la bande suit ou si les deux se découplent. ② Le commentaire de cette bande **cite Helms 2023 en sens contraire** (*« au-delà de +10 %, on gagne des plis cutanés, pas du muscle »*) : **le réécrire dans le même commit**, sinon un futur lecteur trouvera un commentaire qui contredit la constante. ⚠️ **Indexation** : 0,5 kg/sem vaut +17,4 % sur un corps à 3 187 kcal mais **+30 %** sur un corps à 1 800 — le plafond en kg n'est pas neutre selon le gabarit. ⛔ **NE PAS aligner `MAX_DAILY_DEFICIT_KCAL = 500` par symétrie : le plancher TCA n'a pas de miroir.** ⚠️ Et `muscle_gain` porte une limite d'**accrétion musculaire** légitime, alors que quelqu'un en **sous-poids** n'est pas dans ce cas — **deux objectifs sous un seul jeton**

## L12 — le terme de perte cumulée

| | |
|---|---|
| **quoi** | Plus quelqu'un perd, moins le produit relève sa cible en silence. |
| **pourquoi** | Chaque kilo perdu abaisse l'entretien d'environ **22 à 24 kcal/j** (Hall 2011, **règle de population, pas prédiction individuelle**), et Mifflin × PAL n'en capture qu'environ **65 %**. ⇒ il manque ⟳ **−6 à −8 kcal/j par kilo** *(la revue de littérature écrit −6 à 8 ; la v1 écrivait −6 à −10)*. Sans lui, **le produit ralentit lui-même la perte qu'il pilote, en silence**. |
| **dépend de** | `L11★` · ⛔ **le stockage du POIDS DE DÉPART** · ⛔ ⟳ **un PLANCHER ABSOLU quotidien, en dépendance BLOQUANTE et non en ligne de risque** |
| **bloque** | rien |
| **fichiers** | `meal_envelope.ts:808` (`estimatedMaintenanceKcal`) · ⟳ **`meal_envelope.ts:1060`** — poser `max(maintenance − 500, ENERGY_FLOOR_KCAL[sexe])` |
| **migration** | ⚠️ à vérifier — le poids de départ existe-t-il dans le modèle ? |
| **mesure AVANT** | ⟳ **9 comptes ont plus d'une pesée · 0 BOUCHE** : `student_body_measures` n'a **pas d'équivalent** côté `household_member_bodies`. **Le lot mesure une population qu'il ne vise pas** |
| **direction** | ⬇️ l'entretien baisse proportionnellement au poids déjà perdu |
| **mesure APRÈS** | l'entretien avant/après sur une bouche à 3 pesées décroissantes. ⟳ **Seuil chiffré, que la v1 n'avait pas : −6 à −8 kcal/j par kilo perdu, ±1** |
| **armé par** | un test à deux poids, valeur attendue en littéral |
| **coût** | **une requête en solo** · **un lot côté foyer** *(aucun trigger sur `student_body_measures`, aucun écrivain ne propage vers `household_member_bodies.weight_kg`)* |
| **risque** | ⛔ ⟳ **Le plancher opérant est RELATIF et descend 1 kcal pour 1 kcal avec l'entretien** : `energyFloorKcal = maintenance − 500`. 20 kg perdus × 8 = **−160 kcal/j de plancher**, et **la bouche qui a le plus perdu est celle dont le plancher descend le plus**. `ENERGY_FLOOR_KCAL` (1500/1200/1350) **ne garde que le poids visé à la saisie**, jamais la cible quotidienne. ⛔ **Et l'ordre est contraignant** : une pesée déclenche le recalcul **et** l'évaluation du plancher TCA — **le plancher passe devant** |

## ⟳ L3 — la date d'arrivée *(lot neuf : la v1 l'annonçait « à faire » et ne la plaçait nulle part)*

| | |
|---|---|
| **quoi** | Le produit cesse de promettre une date à laquelle quelqu'un aura atteint son poids. |
| **pourquoi** | ⛔ Notre erreur d'estimation est **±580 kcal/j**, soit **plus grande que notre plafond de déficit (500)** — RMSE ~20 %, **43 à 54 % des individus à ±10 %** seulement. Ça n'invalide pas le calcul (il donne la bonne direction) mais **ça interdit définitivement toute promesse de calendrier**. ⟳ **Et `weeksToTarget` est toujours VIVANT** : appelé par `frontend/src/keel/lib/mouthForm.ts:695`, il rend `{kind:"accepted", weeks}`. C'est le changement n° 3 de la revue de littérature, et il n'avait **ni vague, ni mesure, ni propriétaire**. |
| **dépend de** | rien |
| **bloque** | rien |
| **fichiers** | `_shared/keel/weight_pace.ts:918` (`weeksToTarget`) · `frontend/src/keel/lib/mouthForm.ts:695` · l'écran |
| **migration** | non |
| **mesure AVANT** | `weeksToTarget` : **1 appelant réel**, rend une semaine exacte |
| **direction** | la date **disparaît**, ou devient une **fourchette large** portant explicitement son incertitude |
| **mesure APRÈS** | **Seuil : 0 surface affichant une semaine exacte.** Si fourchette : sa largeur est **≥ ±30 %** |
| **armé par** | un test d'écran qui refuse un nombre de semaines exact |
| **coût** | **un écran** |
| **risque** | ⚠️ Retirer une promesse est visible par l'utilisateur. C'est **une décision produit** *(vague D)*, pas un nettoyage |

### Fin de vague 4 — vérification en conditions réelles

Deux runs sur la **même** fixture, avant et après, et un tableau des **grammes servis par
bouche et par plat**. ⛔ **Cinq contrôles qui refusent le train** : un facteur collé à
`ANCHOR_FACTOR_MAX` · un plat servi **sous** la cible sans refus · un compteur de
recomposition à zéro **ou au-dessus de 15 %** · ⟳ **une couverture tombée à 0,82 sur les
68 bouches sans rythme** · ⟳ **un petit-déjeuner refusé par le plancher de densité**.

---
---

# VAGUE 5 — LE FOYER PLURIEL, ENFIN EXERCÉ

## L26 — la variante de plat par bouche *(⟳ refondé : la justification de la v1 était fausse)*

| | |
|---|---|
| **quoi** | Une bouche qui ne peut pas manger un composant reçoit **sa version du plat**, pas un second plat. |
| **pourquoi** | ⟳ ⛔ **La v1 écrivait : « `SizableShare = {memberId, grams}` — aucun ingrédient, il n'y a nulle part où écrire la variante ». `SizableShare` N'EXISTE PAS** — 0 occurrence hors `scratchpad/`. Le type réel est **`SizableMeal`** (`household_portions.ts:2644`), qui porte **déjà `memberIds: readonly string[]` (`:2660`) et `items: readonly SizableItem[]` (`:2672`)**. **L'endroit existe.** Le lot n'est donc pas « créer une place » mais **« calculer le livré par variante »**. |
| **dépend de** | `L6′` · **PORTE G5** · ⟳ **et le lot 13 doit être rouvert** : son report reposait sur la même phrase fausse |
| **bloque** | `L21` |
| **fichiers** | `household_portions.ts:2644-2672` *(les types existent)*, `:2790` (`sizeBoxesFromTarget`) |
| **migration** | ⚠️ à confirmer — `meal_composition_verdicts` porte `user_id + meal_id` **sans `member_id`** |
| **mesure AVANT** | plans avec divergence de régime **36** · plats dédiés attribués **28** · variantes exprimées **0** |
| **direction** | une bouche reçoit une boîte dont les `items[]` diffèrent, **sans seconde cuisson** quand la différence s'ajoute **au dressage** |
| **mesure APRÈS** | ⟳ **avec un seuil sur ce qui est le risque nommé** : le facteur de la bouche divergente est calculé **contre SA variante**, et l'écart au facteur du plat commun est **≥ 2 %** quand les densités diffèrent — s'il est nul, le dénominateur est resté partagé |
| **armé par** | ⛔ **Le « livré » se calcule PAR VARIANTE.** Le moteur le calcule aujourd'hui **une fois par plat** : si les deux versions partagent le dénominateur, **celle qui diverge sort fausse, dans le sens qui sous-nourrit exactement la bouche qu'on protégeait**. Un test à deux variantes de densités différentes |
| **coût** | ⟳ **un lot** — et **moins cher que la v1 ne le croyait**, puisque la place existe |
| **risque** | ⚠️ Le coût dépend d'**où** est la différence : **au dressage** = quasi nul, 8 bouches = 8 gestes ; **cuit dans la base** = une vraie seconde préparation. ⚠️ L'échange n'est **pas neutre en énergie** : saumon 130 g (260 kcal) → poulet 120 g + huile d'algue 3 g (225 kcal) = **−35 kcal** — rattrapé **seulement si** le livré est par variante |

## L21 — un dégoût qui porte un apport n'est pas une préférence

| | |
|---|---|
| **quoi** | Retirer le poisson pour une personne cesse de retirer l'oméga-3 marin de toute la table sans le dire. |
| **pourquoi** | **R5** porte le bon geste, mais **R3** de la même spec écrit *« un régime n'est PAS une préférence »* — et un dégoût **est** une préférence. Il retire l'aliment **pour tout le monde**, ou ne fait rien. **Dans les deux cas l'apport disparaît en silence.** |
| **dépend de** | `L26`, `S2`, `L9bis` |
| **bloque** | rien |
| **fichiers** | le moteur, **avant** l'appel modèle : relever les **7 drapeaux**, interroger le référentiel, poser une **exigence positive** |
| **migration** | non |
| **mesure AVANT** | `household_food_restrictions` **6 lignes** · drapeaux tombés à zéro : **rien ne le mesure** |
| **direction** | ⬆️ `sentinels_lost` apparaît, non nul. ⟳ ⚠️ **La v1 ajoutait « puis il baisse » sans horizon ni pente — non falsifiable. Retiré** |
| **mesure APRÈS** | ⟳ **trois issues comptées, DANS CET ORDRE, avec le dénominateur** : **substituer** · sinon **diverger** · sinon **INATTEIGNABLE**. **Seuils : le troisième état est non nul ; et un compteur des plans où AUCUN drapeau ne tombe** *(le dénominateur, absent de la v1)* |
| **armé par** | ⛔ **Le test est MÉCANIQUE** : retirer un aliment retire ses drapeaux ; **si un drapeau tombe à zéro sur le plan entier, la divergence est obligatoire.** ⛔ **La substitution se décide AVANT le modèle** — le moteur nomme l'**exigence**, jamais l'aliment |
| **coût** | **un lot** |
| **risque** | ⛔ **« Re-router sur des noix » est FAUX** — le poisson porte EPA/DHA, les noix de l'**ALA**, converti à ~5 % en EPA et **moins de 1 %** en DHA. Le seul vrai substitut est **l'huile d'algue**. **Un substitut doit porter le MÊME drapeau.** ⚠️ Exige le **3ᵉ état** d'un nutriment, qui n'existe pas. ⚠️ ⟳ **Et les 7 drapeaux sont des booléens seuillés à 15 % de la VNR** — une valeur d'**étiquetage**, ni RNP, ni BNM, ni AS. Préserver `iron_source` **contredit** la revue de littérature, qui a tué le pilotage du fer *(« le stock de la personne écrase le terme alimentaire d'un ordre de grandeur »)*. **Le seul effet de matrice qui survit est zinc × phytates, et il doit être un décalage de cible journalière, pas une règle de repas** |

## D3′ — la hiérarchie inter-bouches est lue par le modèle

| | |
|---|---|
| **quoi** | Quand deux bouches demandent des choses contraires, le plan applique un rang écrit, le même à chaque fois. |
| **pourquoi** | **D3 n'existe pas.** `PRECEDENCE_BLOCK` est injecté à `:3617`, **pas en dernière position** sur la lane foyer — enterré sous quatorze blocs — et **ne nomme aucun objet du foyer**. Or *« la contrainte la plus proche de la fin est lue comme la plus contraignante »*. |
| **dépend de** | ⟳ **rien** *(la v1 le déclarait dépendant de `L6′` : faux — le prompt est assemblé à `:3971`, les boîtes à `:5402`, 1 400 lignes plus loin)* |
| **bloque** | `L35` |
| **fichiers** | `meal_generation.ts:1831` · `household_meal_generation.ts:1668` |
| **migration** | non |
| **mesure AVANT** | position du bloc : **enterré** · objets du foyer nommés : **0** |
| **direction** | le bloc passe **en dernière position**, **avant le seul bloc de langue**, et nomme les cinq rangs |
| **mesure APRÈS** | l'ordre des blocs sur un prompt capturé. ⟳ **Plus un compteur à deux populations** : rangs **appliqués** et rangs **sans objet** — la v1 écrivait « un compteur obligatoire » sans le nommer. ⚠️ ⛔ **Capturer le prompt AVANT toute réécriture en mode JSON** : le dépôt a déjà archivé une version de 25 caractères parce que la capture était placée après |
| **armé par** | un test d'ordre des blocs qui **rougit** si un bloc est inséré après. ⚠️ **Deux invariants de fin** : `PRECEDENCE_BLOCK` en queue du message utilisateur, **et le suffixe foyer reste le dernier** |
| **coût** | **un petit lot** |
| **risque** | ⛔ **Un lot qui ne vit que dans un prompt n'a aucune preuve d'exécution** — le modèle déclare le rang appliqué, et **le champ déclaré par le modèle exige son compteur** |

## L8 — le verdict foyer, en OBSERVATION seulement

| | |
|---|---|
| **quoi** | Le moteur écrit ce qu'il pense d'une assiette de foyer. **Il n'agit pas dessus.** |
| **pourquoi** | La lane foyer n'a **aucun** des trois : `verdictFor`, `assessCoverage`, `correctionPlanFor` ne sont **pas importés**. La lane solo a les trois et **deux relances** ; la lane foyer en a **une** et aucune vérification. **Le cas le plus compliqué du produit est celui qui n'est pas vérifié du tout.** |
| **dépend de** | `L6′` — ⟳ *(la v1 y ajoutait `D3′` : aucun symbole partagé)* |
| **bloque** | `L13` |
| **fichiers** | **cinq entrées manquantes, nommées et vérifiées** : `envelope` *(existe par bouche, **n'est pas conservée** ; à capturer avant `resolveHousehold`)* · `uncoverableSentinels` *(`uncoverableSentinelsFor` **jamais appelé**)* · `fixedIntakeInputs` *(chargés, pas projetés)* · `offAxes` · `friedMethod` — **les cinq à 0 occurrence** |
| **migration** | ⚠️ **probablement** — `meal_composition_verdicts` porte `user_id + meal_id` **sans `member_id`** |
| **mesure AVANT** | `meal_composition_verdicts` **10 lignes**, RLS active, **0 policy**, **0 grant** · verdicts foyer **0** |
| **direction** | des verdicts apparaissent pour les plans foyer. ⛔ **Aucune correction n'est appliquée** — c'est le point du lot. ⟳ **Et le plan cesse de compter cette vague comme « change une assiette » pour ce lot** |
| **mesure APRÈS** | **Seuil : ≥ 1 verdict PAR BOUCHE sur la fixture (donc ≥ 4)**, et la distribution des verdicts, qui devient l'entrée de `L13` |
| **armé par** | ✅ **Le pliage et le prorata sont déjà faits** : `mouthDayEnergy` appelle `foldPreparationsIntoDishes` **avec la même projection** que la lane solo |
| **coût** | **un lot** |
| **risque** | ⛔ **Vérifier ne veut pas dire corriger.** Poser une boucle de correction dans un dîner de famille demande de trancher **avant** : **qui voit le verdict**, et **une personne protégée peut-elle voir sa portion bouger à cause de la cible d'un autre**. ⟳ ⚠️ **Et ce lot frôle l'interdiction n° 3 de `MODEL.md`** *(toute notion d'adhérence à une prescription individuelle)* : tant qu'il reste en observation et en trace, il est dans le modèle ; rendu par bouche, **c'est un score collé sur une ligne que personne n'a prescrite** |

## D1′ — le curseur de cuisine a quatre réponses, pas trois

| | |
|---|---|
| **quoi** | « Une cuisson, des plats un peu différents » devient une réponse que le moteur sait lire. |
| **pourquoi** | `COOKING_SHAPES` n'a que **3** jetons ; la 4ᵉ réponse est un **`null`**. Or c'est le jeton intermédiaire qui porte la distinction qui compte : une différence **au dressage** passe à l'échelle, une différence **cuite dans la base** est une cuisson de plus. Le curseur a **plafonné 8 fois** et il est demandé sur **20 plans journalisés sur 52**. |
| **dépend de** | `L26`, `H1`, `H2` |
| **bloque** | rien |
| **fichiers** | ⟳ **8 fichiers, pas 2** : `household_portions.ts:625` et `:632-655`, `energy_target.ts`, **`plan_rationale.ts`** *(que `L35` touche aussi)*, `generate-household-meal-v1/index.ts`, `api/cookingShape.ts`, `api/household.ts`, `CookingShapeField.tsx`, `MealBuilder.tsx` — **plus l'enum en base** |
| **migration** | **oui** si le jeton est contraint — ⛔ **R6 du contrat : pas de valeur d'énumération sans une branche d'évaluateur nommée** |
| **mesure AVANT** | 3 jetons + un `null` · `capped: true` sur **8** plans · curseur demandé **20/52** |
| **direction** | le 4ᵉ état devient explicite ; le `null` cesse d'être une réponse |
| **mesure APRÈS** | ⟳ **avec un seuil** : les 4 jetons sont **tous représentés** sur les plans nouveaux, et `capped` est ventilé par jeton — **seuil : `capped` non nul sur au moins un jeton, nul sur `separate_sessions`** |
| **armé par** | ⛔ **R1 du contrat : jetons ASCII anglais, y compris dans le jsonb**, et une branche d'évaluateur nommée |
| **coût** | ⟳ **un lot** *(la v1 disait « un petit lot »)* |
| **risque** | ⚠️ **Il ne s'affiche qu'à partir de DEUX bouches** — servi à quelqu'un qui vit seul, il pose une question dont il est la seule réponse possible |

### Fin de vague 5 — vérification en conditions réelles

⛔ **Le seul contrôle qui compte : l'union de deux régimes déclarés MORD pour la première
fois.** Aujourd'hui : **13 plans, tous à une bouche, zéro refus** — alors que **deux
foyers portent chacun ≥ 2 régimes distincts et ont généré 11 plans chacun**. La ceinture
a **vu** ces foyers et n'a compté qu'une bouche. Tant que ce compteur reste à zéro, cette
vague n'est pas livrée, quel que soit l'état des tests.

---
---

# VAGUE 6 — CE QUI SE DIT, ET CE QU'ON RETIENT

## L0-b — la fenêtre du CUIT *(gardé par G3 — ⟳ tout le reste est parti en vague 1)*

| | |
|---|---|
| **quoi** | La durée de conservation d'un plat cuisiné devient un refus, et la congélation entre dans le calcul. |
| **pourquoi** | ⟳ **Ce qui reste après le découpage** : seule **la VALEUR de la fenêtre du cuit** dépend de la juridiction. Le `>=`, la fenêtre crue et le compteur sont partis en `L0-a`, parce que **leur valeur ne change pas** selon qu'on tranche 48 h ou 72 h. |
| **dépend de** | `L0-a`, ⛔ **PORTE G3** |
| **bloque** | `L35` |
| **fichiers** | `meal_generation.ts:1880` · ⟳ **`grocery_waves.ts:59` et `:211`, `accident.ts:1739`, `accident_io.ts:471`** — la constante est ré-exportée deux fois et **gouverne la date de courses** · `week_bounds_test.ts:350` *(`assertEquals(MAX_FRIDGE_DAYS, 3)` — il rougira)* |
| **migration** | non |
| **mesure AVANT** | `MAX_FRIDGE_DAYS = 3` · ⟳ **29 violations sur 14 plans**, lisibles dans `generated_from.issues` |
| **direction** | ⬇️ violations → 0 · ⬆️ sessions de cuisine · ⬆️ passages aux courses sans congélateur |
| **mesure APRÈS** | plats hors fenêtre **0**, `within` **non nul** · sessions par plan de 5 jours : **2**, aux jours 1 et 4 |
| **armé par** | les deux populations de `L0-a`, plus un test de la branche congélation |
| **coût** | **un chantier** |
| **risque** | ⛔ **UN REFUS DUR À 48 H CHANGE L'UNITÉ DE VALEUR DU PRODUIT** — il plafonne chaque session à **deux jours de repas**, soit 3-4 sessions par semaine au lieu d'une ou deux : **il détruit le temps gagné, qui est ce que le produit vend.** ✅ La pièce qui réconcilie une horloge courte avec une cuisson hebdomadaire est **la CONGÉLATION**, aujourd'hui **dans le PROMPT, donc non garantie**. ✅ Et le correctif est à moitié écrit : le **portionnement au refroidissement est exactement notre protocole de boîtes** — l'imposer et le dire, pas l'inventer |

## L35 — le plan DIT ce qu'il n'a pas respecté *(⟳ trois phrases remontent en vague 1)*

| | |
|---|---|
| **quoi** | Quand le produit sacrifie quelque chose, il le nomme. |
| **pourquoi** | La tension prix/santé **ne se résout pas** : *« un compromis nommé est un service ; un compromis silencieux est une faute qui retombe sur l'utilisateur »*. ✅ **Le module existe** — `plan_rationale.ts` est déterministe, backend, rend des phrases finies, et **chaque phrase est armée par une prémisse** *(`addedCookDays: []` ne produit rien, pas « aucun jour ajouté »)*. ⛔ **Mais son vocabulaire ne couvre que le CALENDRIER.** |
| **dépend de** | `L0-b`, `D3′`, `L9bis`, `L21`, `L30b` — ⟳ **sauf les trois phrases ci-dessous, qui ne dépendent de rien** |
| **bloque** | rien |
| **fichiers** | `_shared/keel/plan_rationale.ts` — **extension de vocabulaire** · un **champ de sortie dédié** côté modèle |
| **migration** | non |
| **mesure AVANT** | gabarits : calendrier seulement · `trade_off` côté modèle : **0 occurrence** |
| **direction** | ⬆️ plans portant une phrase de compromis. ⟳ **Seuil des DEUX côtés, que la v1 n'avait pas** : **≥ 30 %** des plans de la fixture *(qui portent tous un compromis par construction)* et **< 100 %** du corpus — une phrase sur un plan sans compromis serait une invention |
| **mesure APRÈS** | un compteur **par famille de prémisse**, avec les deux populations (armée / non armée) |
| **armé par** | ⛔ **DEUX gardes sur la moitié du modèle.** ① **La phrase doit être FALSIFIABLE contre le plan** : s'il écrit « j'ai remplacé le foie gras par du canard », le moteur vérifie que le foie gras est absent et le canard présent — **une affirmation qu'on ne peut pas confronter au JSON ne s'affiche pas**. ② **Aucun nombre qui vise une personne** : sur un run réel, le modèle a recopié un facteur dans le texte visible — *« Zoé : 0,85 de la part de Marc »*, **lu à voix haute à table** |
| **coût** | **un lot** |
| **risque** | ⛔ **La règle juste est « personne n'explique la décision d'un autre »** — le défaut d'origine était de demander au **modèle** d'expliquer un jour ajouté par le **moteur**. **C'est là que l'invention arrive, et nulle part ailleurs** |

### ⟳ L35-a — les trois phrases livrables tout de suite *(remontées en vague 1)*

Sur exigence de la revue produit : **trois phrases se construisent sur des données qui
existent déjà**, sans aucune dépendance, et donnent à la vague 1 sa **seule surface
utilisateur positive** — sinon la sécurité n'y est visible que quand elle **refuse**.

- *« Léa n'est pas comptée dans ce plan : absente du 12 au 18 »* — `away_days` existe
- *« Sarah n'a pas dit ce qu'elle mange »* — **45 bouches sur 88 n'ont aucune ligne de corps**
- *« Cette semaine tu as choisi de cuisiner simplement : la table mange végétarien »* —
  `capped: true` sur **8** plans, et le moteur connaît le budget
- ⟳ ⛔ **Et une quatrième, qui est une garde et non une explication** *(décision n° 4
  du 2026-08-21)* : quand le verrou de lane dégrade toute la table, **une phrase FIXE**
  dit que le plan est servi autrement — **et elle est servie AUSSI dans des cas
  anodins**, pour que sa présence ne révèle rien. ⚠️ **C'est l'inverse d'une prémisse
  armée** : ici, une phrase qui n'apparaîtrait QUE quand elle est vraie **désignerait
  la personne qu'elle protège**. À écrire explicitement, sinon un futur lecteur
  l'armera « proprement » et cassera la garde

**armé par** : chaque phrase est **armée par sa prémisse** ; une prémisse vide ne produit
**rien**. **Seuil : les trois apparaissent sur la fixture, et aucune sur un foyer d'une
seule bouche sans absence.**

## L30b — le budget devient un constat

| | |
|---|---|
| **quoi** | Le plan sait ce qu'il coûte. ⟳ **L'utilisateur, non — et le plan cesse de le laisser croire.** |
| **pourquoi** | Le lot 30 a livré **923 lignes en sas** (917 FR, 860 US), pièges cru/cuit et partie comestible traités. Mais **0 promue, 0 lecteur**, et `food_composition_refs` porte **0 prix**. |
| **dépend de** | ⟳ **rien de bloquant** — `gramsRaw` par ingrédient existe déjà (`food_composition.ts:1164`). *(La v1 le déclarait dépendant de `L6′` : dépendance de **précision**, pas de blocage.)* Le budget reste **de degré 1** : il se juge sur les grammes réels, **après** le facteur — **la seule porte post-facteur du produit**, la capacité des appareils ayant été écartée |
| **bloque** | `L32`, `L35` |
| **fichiers** | `promote_pending_food_prices()` *(écrite, 0 appelant)* · un lecteur `Σ q × prix` |
| **migration** | non |
| **mesure AVANT** | `food_price_pending` **923** · promues **0** · lecteurs **0** · `price_eur_per_100g_fr` **0/923** |
| **direction** | ⬆️ le coût estimé existe. ⛔ **Il ne contraint rien** — un constat d'abord |
| **mesure APRÈS** | coût du plan de la fixture en €/1 000 kcal. ⟳ **Seuil, absent de la v1 : dans la bande [1,5 ; 4,0] €/1 000 kcal** — hors bande, c'est la grille qui est fausse, pas le plan. Référence : **2,47 €/1 000 kcal** au cas 05 |
| **armé par** | les 3 vues du lot 30, **aujourd'hui sans lecteur** — ⟳ **et la revue QA a raison : une vue sans lecteur n'arme rien.** L'arme réelle est le seuil de bande ci-dessus, vérifié à chaque run |
| **coût** | **un lot** pour le lecteur ; le **chantier** est fait |
| **risque** | ⚠️ **La tension ne se résout pas** : à 4 €/jour il faudrait **1,48 €/1 000 kcal** contre 2,47. **C'est le prix de la nourriture** — le travail du produit est de faire au mieux **et de DIRE ce qu'il a sacrifié** *(`L35`)*. ⚠️ Aucune saisonnalité : la tomate passe de 2,80 € à 5,50 €, **±35 %** que la grille ne porte pas. ⚠️ Périmètre **étroit** : le panier du **plan**, pas les courses — shaker, pain, fromage et dessert **dehors**, ce qui rendrait le chiffre **faux à l'œil de qui le lirait** ⇒ **il ne s'affiche pas** |

## Les lots de mémoire — ⟳ recadrés, et l'un d'eux réécrit

> ⚠️ **Correction de cadrage pour les cinq.** Sur 1 320 comptes, **1 311 sont des comptes
> de test**, et les 12 porteurs d'une clé de mémoire **le sont tous**. **Aucun compte réel
> ne porte une ligne de mémoire.** Ces lots ne réparent pas un produit sous-utilisé : ils
> construisent sur un banc. **Priorité basse, sauf `M8`.**

| lot | quoi · pourquoi (mesuré) | mesure AVANT → APRÈS, avec seuil | armé par | coût · risque |
|---|---|---|---|---|
| **M8** | Faire répondre « as-tu cuisiné ? ». ⛔ `cooking_session_states` = **0 ABSOLU**, QA compris. Seul retour qui **détruit** des repas, et **150 plans portent au moins une session** | **0 ligne** → **≥ 1 ligne par session de la fixture** | ⛔ **la première ligne en base**. `loadSessionStates` et `loadSkippedDishIndexes` sont **armés en production et ne rendent jamais rien** | **un lot** · ⚠️ sans lui **le plan annonce des plats jamais cuisinés** |
| **M3** | ⟳ **RÉTRÉCI par la décision n° 10 : `portions` SEUL.** Les trois autres indices s'ajoutent **quand leur lecteur existe** — sinon on refabrique le champ sans lecteur. `portion.adjust` **est déjà un indice** : 5 crans, une fraction de bande — il lui manque d'être **CUMULÉ** dans une position bornée et visible | position cumulée : **n'existe pas** → **bornée, visible, et convergente sur 3 retours** | ⛔ **bornés ET visibles** | ⟳ **un petit lot** · ⛔ **l'indice « variété » ne se construit PAS** *(décision n° 10)* : la revue de littérature mesure la variété comme une **pompe à calories** (g de Hedges 0,405), **sauf sur les légumes** (+48 g). Le design l'avait vu ; **la v1 gardait l'indice et perdait le routage** |
| **M2** | Le centre de notifications. Les écrans existent (`/app/about-you`) ⛔ **mais la phrase source n'est stockée nulle part** — seul l'`id` du `memory_item` | citations stockées **0** → **100 % des écritures notifiées portent leur phrase** | ⛔ **Sans la citation, « Défaire » est un pari** | **un lot** · — |
| **M1b′** | ⟳ ⛔ **RÉÉCRIT — la v1 annulait `S1`.** `declare_safety_constraint` est **le SEUL port d'écriture des deux planchers déterministes** (`run.ts:4930`, `:4964`). Le lot retire **le tirage du LLM** comme source d'écriture, **jamais le `direct_effect`** | écritures par tirage LLM : **à mesurer** → **0** ; écritures par plancher : **inchangées** | ⛔ **une déclaration d'allergie avec ligature ÉCRIT ENCORE une ligne après le lot** — sinon le lot a désarmé `S1` | **un lot** · ⛔ **C'est le seul endroit où ce design RECULE** : qui déclare dans le chat et ne suit pas la redirection **n'est pas protégé**. ⛔ **Jamais « je le note »** — la phrase qui a coûté cher ici, six lecteurs armés et zéro écrivain pendant qu'une anaphylaxie recevait *« Noted, I'll keep it in mind »* |
| **M5** | **L'IA propose un CHAMP**, pas un magasin à part. ⟳ Aujourd'hui le questionnaire et le brouillon écrivent dans `retained_items` / `retained_next_plan`, **des magasins à part** ; seule exception partielle, `logistics.set` est traduit **à la lecture** en patch volatile sur `practical_constraints`. ⛔ Et `retained_items` **n'a AUCUN plafond** — trou nommé dans le code (`retained_items_io.ts:229`) — alors que `food_preferences` en a un (20) | écritures dans un magasin à part : **toutes** → **0**, et un plafond existe | ⛔ **le champ EST le dénominateur** : une écriture qui n'atterrit dans aucun champ visible est refusée et comptée | **un lot** · ⚠️ dépend de **`M2`** — sans notification citant sa source, proposer un champ est un opt-out avec des étapes en plus |
| **M7** | Un compteur sur le repli de sécurité : combien de phrases qui **ressemblaient** à de la sécurité ont fini en préférence | **n'existe pas** → **les deux populations comptées** | les compteurs de refus existent, **aucun ne compte ça** | **un petit lot** · ⛔ **le dépôt a déjà payé ce prix une fois sur cette table** |
| ⟳ **M0** *(neuf)* | **Donner au chat une LECTURE du magasin.** `sophia-brain` ne lit ni `practical_constraints` ni `retained_items` — **zéro fichier** | **0 lecteur** → **≥ 1 appelant réel** | un tour de chat qui **cite** une règle existante | **un lot** · ⛔ **`M6` (« la question vaut révocation ») est MÉCANIQUEMENT IMPOSSIBLE sans lui** |

## ⟳ M-audit — `user_profile_facts`, 11 880 lignes *(lot BLOQUANT, décision n° 18)*

| | |
|---|---|
| **quoi** | On sait qui écrit et qui lit le plus gros magasin de mémoire du produit. |
| **pourquoi** | ⛔ **11 880 lignes — plus que tous les autres réunis** — lues et écrites par `sophia-brain/profile_facts.ts` et `context/loader.ts`, et **ignorées des trois documents d'autorité**. *« Un magasin de 11 880 lignes que le centre de notifications ne montrerait pas, c'est exactement le magasin caché qu'on supprime. »* |
| **dépend de** | rien |
| **bloque** | ⛔ **`M2` et `M3`** |
| **fichiers** | `sophia-brain/profile_facts.ts` · `sophia-brain/context/loader.ts` |
| **migration** | non |
| **mesure AVANT** | **11 880 lignes** · écrivains et lecteurs : **non audités** |
| **direction** | chaque ligne a un écrivain nommé et un lecteur nommé, ou elle est morte |
| **mesure APRÈS** | **Seuils : 100 % des lignes rattachées à un écrivain identifié · la part atteignant un prompt est chiffrée · la part sans lecteur est chiffrée** |
| **armé par** | ⛔ **le même critère que pour les autres magasins** : écrivain atteignable, lecteur nommé, lignes en base — les trois, ou le magasin est déclaré mort |
| **coût** | **un lot** |
| **risque** | ⚠️ S'il atteint un prompt sans plafond, c'est **le même défaut que `retained_items`** *(0 plafond, trou nommé dans le code)*, à une échelle 1 000 fois supérieure |

⚠️ ⟳ **Rappel de ce qui a été mesuré** : `user_profile_facts`,
**11 880 lignes** — plus gros que tous les autres réunis, lu et écrit par
`sophia-brain/profile_facts.ts`. **Personne ne l'a audité.** Il mérite sa passe **avant**
`M2`/`M3`, sinon on construira un centre de notifications qui ne montre pas le plus gros
magasin.

---
---

# PARTIE 4 — LES LOTS QUI NE SONT PAS DANS LES VAGUES

## 4.1 Ceux qui s'annulent, se fusionnent, ou sont écartés

| lot du design | ce qu'il devient | pourquoi |
|---|---|---|
| **Lot 2** (les 6 moments) · **22** · **25** | ⇒ **absorbés dans `L11★`** | trois constantes voisines, **deux dénominateurs qui se multiplient** dans une seule expression |
| **Lot 9** (`D = max(1,1 ; E/(8W))`) | ⇒ **réécrit en `L9bis`** | la formule prescrirait **1,72 kcal/g au grand gabarit** — *moins de légumes à celui qui mange le plus*. Le défaut n'est pas la valeur, c'est **l'indexation** : une ceinture de satiété ne peut pas être proportionnelle à la masse grasse |
| **Lot 20** (piloter la protéine) | ⇒ **fusionné dans `L9bis`** | le rapport protéine÷énergie est **invariant d'échelle** : **aucun facteur ne peut le corriger — c'est de l'algèbre** |
| **Lot 27** (capacité des appareils) | ⛔ **ÉCARTÉ** *(décision du propriétaire)* | ⚠️ **Coût accepté** : le temps annoncé est **faux dès qu'un appareil à panier entre en jeu**, d'un facteur qui **croît avec les portions** (×4 sur le cas 04). **Ce qui survit** : ne pas afficher un temps non vérifié — **pour une portion**, avec le nombre de portions, ou rien |
| **Lot 31** (durée de session) | ⇒ **une consigne** | la parallélisation est écartée : la dispersion réelle **écrase** ce qu'un modèle gagnerait. ⚠️ `timeAllowsASecondDish` existe et **gate la divergence R5** — un champ à un seul lecteur |
| **Lot 3** (date d'arrivée) | ⟳ ⇒ **`L3`, vague 4** *(la v1 le laissait sans vague)* | `weeksToTarget` est **toujours appelé** |
| **Lot 5** (sodium, sucres, K) | ⟳ ⇒ **`L5`, vague 2** *(la v1 le promettait et l'omettait)* | ⛔ le sel est **le seul nutriment où le produit fait activement du mal sans le voir** |
| **D4** | ⇒ ⛔ **PORTE G4** | le code a tranché **l'inverse** le 2026-08-18 |
| **Lot 15** (fréquence sentinelle) | ⇒ **partiellement reporté** derrière **G6** | ⟳ ⛔ **mais le PLAFOND ne se reporte pas** : le mercure a une limite officielle **indépendante** de RNP/BNM. Coupler un plafond de sécurité à un débat de valeur de référence le reporte sine die. ⚠️ L'abstention sous 7 jours est **CORRECTE** |
| **Lot 13** (correction par rôle) | ⟳ ⇒ ⛔ **À ROUVRIR** — son report reposait sur *« `SizableShare` ne porte aucun ingrédient »*, **une phrase fausse** : `SizableMeal` porte déjà `items[]`. Reste **G7** et **la granularité non tranchée** (l'ancrage produit un facteur par **jour**, `sizeBoxesFromTarget` en prend un par **plan**) |
| **Lot 32** (la saison) | ⇒ **vague 6**, bloqué par `L30b` | la date porte la saison, **lue nulle part**, et elle gouverne disponibilité **et** prix du poste le plus variable |
| **Lot 37** (plafond de surplus) | ⟳ ⇒ ✅ **TRANCHÉ le 2026-08-21 — revient en vague 4** | la décision tient ; **les deux faits mesurés deviennent des contraintes d'implémentation**, pas une réouverture *(voir la fiche `L37`)* |


## 4.2 ⛔ Les lots ORPHELINS — décidés, nommés, sans numéro nulle part

| # | ce qui est décidé | pourquoi ça n'a pas de lot |
|---|---|---|
| **O1** | ⛔ **Compter les 42 % de compensation** — une boîte réduite de 200 kcal n'en retire que **~115** (Robinson 2023, 14 études, 85 effets, effet **curvilinéaire**) | **0 occurrence de « compensation » ou « Robinson » dans le design du calcul.** ⚠️ **Piège de lecture** : ce 42 % n'a **rien à voir** avec le `composedDishShare` de 0,42. ⛔ ⟳ **Et piège de direction** : « compter les 42 % » **côté prescription** donnerait `500 ÷ 0,58 = 862 kcal/j` de déficit. **C'est une correction de l'ATTENTE, jamais du déficit prescrit** |
| **O2** | **La rampe fibres sur deux ou trois plans** — nos deux recommandations poussent les fibres de ~20 à ~35 g/j **d'un coup**, et les symptômes se lisent *« le plan ne me va pas »* : **une attaque directe sur l'adhérence** | nommée comme une **étape**, jamais comme un lot. ⛔ **L'ordre des quatre gestes n'est pas commutatif**, et les gains 3 et 4 **ne s'additionnent pas** |
| **O3** | **La perte vitaminique à la cuisson** — `folate_source` calculé sur du **cru**, ment sur la cuisson (44-49 % restants), puis **une 2ᵉ fois** sur 3 jours de conservation, **une 3ᵉ** au réchauffage | aucun lot. ⟳ **`L-C` est la migration où le correctif coûterait le moins** |
| **O4** | **L'alcool n'est jamais demandé** — dans le référentiel, jamais collecté. **500 à 900 kcal/semaine invisibles**, et **premier candidat d'explication** quand le poids ne suit pas | le design dit *« il appartient à l'entonnoir »* et **ne lui donne pas de numéro** |
| **O5** | **La bande d'âge PÉDIATRIQUE** — un enfant de 8 mois = un ado de 17 ans, alors que les bornes admettent **50 cm / 3 kg**. Et la garde « mineur » ne porte que sur les **chiffres**, jamais sur les **aliments** : ni miel avant un an, ni formes à risque d'étouffement | `AgeBand` porte `60_plus`, armé — **le trou est EN BAS**. ⚠️ **29 bouches mineures** en base |
| **O6** | **Les GLP-1** — zéro occurrence. ⚠️ **Le geste minimal est une case qui fait TROIS choses** : désactiver le rythme · **exempter d'`observed_below_floor`** · **SUSPENDRE le plafond de `L1`**. Une case qui n'en ferait qu'une **contredirait les deux autres** | placé en **P1**, sans exécutant. ⛔ ⟳ **Et il contredit `L1`, qui se livre en vague 4 sans savoir que la case existe** |
| **O7** | ⛔ **`observed_below_floor`** — *« quand le déclaré est très en dessous du plancher, on n'ouvre aucun déficit : le signal le plus précoce d'une restriction en cours »* | ⟳ **0 occurrence dans tout le dépôt.** Nommé comme un **compteur**, jamais comme un lot. Dénominateur : les bouches avec un déclaré **et** un corps |
| **O8** | **Les faux amis de SLUG** — `prune` (fruit SEC, 229 kcal ; la prune fraîche fait 46 — **×5**) et `pate` (le PÂTÉ, `red_meat`) | ⛔ **irréparables par un alias** : `bySlug` gagne toujours. **Seul un renommage de slug répare**, et il touche alias, plans persistés et vues |
| **O9** | **689 lignes `ciqual` sans `ciqual_code`** (75 %) — vérifier contre la source est **impossible** | **préalable de toute génération d'alias en masse** et de toute correction de valeur |
| **O10** | **La granularité de l'ancrage n'est pas tranchée** — un facteur par **jour** contre un par **plan** | désaccord **silencieux** entre deux modules voisins |
| ⟳ **O11** | **Les 17 décisions produit absentes** du registre foyer *(n° 2, 3, 8, 10, 11, 12, 14, 15, 18, 20, 21, 22, 24, 25, 27, 28, 29)* — dont **n° 29, la seule qui touche la règle fondatrice** | ⇒ **traitées par la `VAGUE D`**, qui existe pour ça |

## 4.3 Les lots du harnais

| lot | quoi · pourquoi (mesuré) | mesure AVANT → APRÈS | armé par | coût |
|---|---|---|---|---|
| **H1 · H2** | ⟳ **remontés en vague 1** — le gate ne lance pas vitest ; **0 des 44 fichiers n'est typechecké** | 0 vitest, 0/44 → **673 tests lancés, 44/44 typecheckés** | ⛔ **une mutation** : casser un test front, le gate rougit | **un petit lot** |
| **H3** | `CookingCapacityCard` n'a **pas de garde de chargement propre** : `practicalConstraints` non nullable, deux `useState` figés au montage avec des **défauts positifs** (`"normal"`, `"some"`) qui **écraseraient au Save**. ⛔ Le dépôt écrit lui-même la règle : *« une garde qui dépend uniquement de la discipline de l'appelant n'est pas une garde »* | 0 garde propre → **la carte ne rend rien tant que `practicalConstraints === null`** | un test qui monte la carte **sans** données et vérifie qu'elle ne rend rien | **un petit lot** |
| **H4** | Une **4ᵉ occurrence latente** du refus loin du geste : `SetupPage.tsx:2895`, chemin **`self`** — le refus part dans le **bandeau du haut** alors qu'on vient de fermer une modale au milieu de l'écran | refus en haut → **refus à côté du geste** | un test qui provoque l'échec et vérifie **où** le message est rendu | **une constante** |
| ⟳ **H6** | ⛔ **Le produit ne sait pas ce que coûte sa propre génération.** Mesuré le 2026-08-21 sur `llm_usage_events` (10 253 lignes) : `gpt-5.6-sol` et `gpt-5.6-luna` — **les modèles de la lane de génération** — totalisent **108 appels et 1 670 675 tokens pour `cost_usd` = 0**. Ils ne sont **pas tarifés**. Les modèles anciens le sont (`plan_generation` sur `gpt-5.4-mini` : **0,0034 $/appel**) | `cost_usd` = 0 sur 108 appels → **tarif renseigné, coût non nul** | une requête qui **échoue** quand un modèle du ledger n'a pas de tarif | **une constante** · ⚠️ **conséquence immédiate : un plafond de dépense en dollars est INAPPLICABLE aujourd'hui** — un budget se compte en **appels** ou en **tokens**, pas en euros |
| **H5** | `ProgressPage.tsx` : **0 import réel**. Cohérent avec les namespaces i18n `progress` (36 clés) et `attack` (65) marqués **orphelins** | non routée → **routée ou supprimée** | `rg 'from ".*ProgressPage"'` → 0 ou ≥ 1, explicitement | **une constante** |

---
---

# PARTIE 5 — LES QUESTIONS QUI RESTENT OUVERTES — **SEPT**

> ⟳ **19 des 26 ont été tranchées le 2026-08-21** et sont en **§⑥**, avec leur
> conséquence sur le plan. Ce qui suit est ce qui reste, **et rien n'y est tranché**.

### Trois décisions, et elles t'appartiennent

1. **P0 — le périmètre juridique.** Déficit **nominatif** et prescription de portions pour
   des personnes **sans compte**, en France. Coût, calendrier, risque. **À faire qualifier
   avant le pilote payant** ; garde `L6′`, `L24′` et le pilote. **C'est la seule qui
   demande quelqu'un d'extérieur, donc la seule dont le délai ne dépend pas de toi.**
2. **G7 — un moteur d'ancrage, ou deux ?** Décision de **moyens**. Position retenue :
   **retirer maintenant de l'écran solo ce que la lane solo ne lit pas** *(honnête et
   gratuit)*, **porter le moteur quand le temps existe**. Garde `E1` et `L13`.
3. **Régénérer est gratuit.** Un plafond ajoute de la friction sur un geste légitime.
   **Arbitrage produit.** Ne garde aucun lot — mais devient productif dès que `L9bis`
   affine la correction *(régénérer jusqu'à la plus petite assiette)*.

### Trois MESURES qui manquent — ⟳ ce ne sont pas des portes, ce sont des lots de vague 0

4. **G2 — le bloc de déclaration de groupe devient-il inconditionnel ?** Tombe sous
   *« une garde à trou n'est pas une garde »* ⇒ penche vers **oui** — mais **le coût du
   prompt byte-identique n'a pas été mesuré**. ⇒ **`Q-G2` : mesurer ce que le bloc ajoute
   au prompt, et sur combien d'élèves sans régime le test d'identité mord.** Garde `L17`
   et le repli de `L18b`.
5. **Portée de la ceinture `strict`.** Même famille ⇒ penche vers **les trois points
   d'entrée** — mais **le coût côté chat n'a pas été mesuré**. ⇒ **`Q-S2` : compter, sur
   les tours de chat archivés, combien mordraient si `strict` entrait sous
   `applyKeelOutputLocks`.** Garde `S2`.
6. **Granularité du facteur d'ancrage** — par jour, par plan, ou par plat × bouche ?
   Demande de **lire ce que `anchorFactorFor` fait aujourd'hui**, ce qui n'a pas été fait.
   ⇒ **`Q-G19` : une lecture de `mouth_anchor.ts:583-696` et de `sizeBoxesFromTarget`, et
   le journal des deux granularités sur un run réel.** Garde `L13`.

### Un fait inconnu

7. **Le corpus de mesure est un banc** — **1 311 comptes de test sur 1 320**. Mesurer en
   prod n'a de sens que **s'il y a des utilisateurs en prod**. ⇒ **la question à trancher
   n'est pas « mesure-t-on en prod ? » mais « combien de comptes réels y a-t-il ? »**, et
   personne ici ne le sait. Une lecture en prod, en lecture seule, répond en une requête.

---
---

# PARTIE 6 — CE QUE JE N'AI PAS PU VÉRIFIER

> Écrit pour que personne ne prenne une lecture pour une mesure.

| # | ce qui n'est pas vérifié | ce qu'il faudrait |
|---|---|---|
| 1 | ⛔ **Le comportement réel de la chaîne d'ancrage** — aucun plan ne porte de boîtes. Le « trois bouches-jours toutes exactement au plafond » vient d'un run **non conservé en base** | **`V0-D`** |
| 2 | **Le modèle réellement utilisé** — `keelGenerationModel()` est appelé, mais `generated_from` ne porte **aucune clé `model`** | un run, **et** persister le nom du modèle |
| 3 | **L'écart journal/persistance des boîtes** — le journal dit `boxes: 12/20/32` sur **51 plans**, et ces contenants ne sont ni dans `dishes[].boxes` (0) ni sous une clé de `dishes` ; les 56 `preparations[].boxes` **ne recouvrent pas exactement** les 51 | relire le chemin d'écriture, ou un run qui tranche |
| 4 | **Le taux de résolution avec le résolveur de production** — mes mesures SQL sont en **égalité exacte**, donc un **plancher** | exécuter `food_composition.ts` sous Deno |
| 5 | ⛔ **La JUSTESSE des résolutions** — 95,3 % dit « une ligne a été trouvée », **pas « la bonne »**. Erreur silencieuse **non nulle** en français (6,0 %), **jamais mesurée en anglais** | relire à la main les 531 chaînes résolues |
| 6 | **Le taux de journées calculables PAR LANGUE** — jamais mesuré, **un seul plan français** sur 180. ⟳ **Le seul des dix compteurs qui n'existe pas** | dix générations en `fr-FR` — *lot `L2-lang`* |
| 7 | ⟳ ~~« `protein_anchor.ts` mord-il ? »~~ — **RÉSOLU par la revue architecte : il mord**, sur la lane solo | — |
| 8 | **Le verrou de lane (`per_portion`)** — calculé, **journalisé nulle part**. Ni prouvable ni réfutable | le journaliser, puis la fixture |
| 9 | ⟳ ~~« combien de plans ont violé la conservation »~~ — **RÉSOLU par la revue QA : 29 violations sur 14 plans**, lisibles dans `generated_from.issues` | — |
| 10 | **Combien de fois le verrou de sortie médical a mordu** — `blocked_medical_constraint` part en `console.error` et dans le corps HTTP, **jamais en base**. Les **8** `restriction_signal` et le **1** `minor_student` sont les **seuls** compteurs de morsure persistés | persister les refus de ceinture |
| 11 | **Le comportement RLS à l'exécution** — privilèges mesurés par `has_table_privilege`, **aucune requête exécutée sous `anon` ou `authenticated`** | une session de test par rôle — *c'est l'arme corrigée de `S6`* |
| 12 | **Si cette base reflète la production** — **1 311 comptes de test sur 1 320**. Le ratio de la porte mineur est **à reconfirmer en prod** | une mesure en prod, en lecture seule |
| 13 | **Ce que les 102 plans foyer représentent** — 47 le 2026-08-12 et 32 le 2026-08-19 sur **15 foyers** : un profil de **banc**, pas de trafic. **Aucune colonne ne distingue** | une colonne d'origine |
| 14 | **Les 14 entrées « le modèle arbitre » et une partie des 109 « le moteur tranche »** — seuls les **23 identifiants nommés** ont été grepés ; les règles qui sont des phrases de prompt **n'ont pas d'ancre**. Comptées **non vérifiées**, pas absentes | une relecture ligne à ligne |
| 15 | **Aucun test serveur n'a été lancé** (`deno test` sur `_shared/keel/`), ni `eslint`. Seuls **`tsc -b`** (vert), **vitest** (44 fichiers, 673 tests, verts) et **`mouth_anchor_test.ts`** (35 tests, 0 échec) ont tourné | lancer le gate complet |
| 16 | **Aucun rendu navigateur.** ⚠️ Et `vitest.config.ts` tourne en `environment: "node"` et n'inclut que `*.int.test.ts` : **un `.tsx` ne serait jamais collecté**, un composant à portail ne peut pas être monté — **`L6′` s'arme sur un test front** | un run navigateur sur la fixture |
| 17 | **Les edge functions déployées** correspondent-elles au dépôt ? Le raisonnement porte sur **l'arbre de travail**, qui porte 313 fichiers modifiés | comparer au déployé |
| ⟳ 18 | **Le prédicat exact des « 131 lignes cuites »** — un regex de libellé rend **128/128**. Sans la liste, le test de `L-C` est inconstruisible | publier la liste avec le lot |
| ⟳ 19 | **Le nombre exact de filtres `severity !== "medical"`** — deux confirmés (`:541`, `:591`), un possible (`:408`), **aucun à 580** comme l'écrivait la v1 | les énumérer avant d'élargir |

---
---

# ANNEXE — LES CONTRAINTES DURES

**Migrations — ⟳ deux chemins autorisés, et le premier est le bon**

```bash
supabase migration up --include-all          # applique ET enregistre en une fois
```
```bash
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -f <fichier>
# puis enregistrer À LA MAIN dans supabase_migrations.schema_migrations
```

⟳ **`migration up` est le chemin autorisé** *(autorisation du 2026-08-21, cohérente avec
la décision du 2026-08-10 : « `migration up` seulement, `db reset` INTERDIT »)*. Il
applique **et** enregistre, donc il ferme au passage le piège de la migration appliquée
sans être inscrite.

⚠️ **Mais `--include-all` applique TOUT ce qui est en attente, y compris les migrations
d'une autre session.** La base est partagée et le dépôt porte **313 fichiers modifiés**.
⇒ **Toujours comparer disque et registre AVANT** :
```bash
ls supabase/migrations/*.sql | wc -l
docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -tAc \
  "select count(*) from supabase_migrations.schema_migrations;"
```
*(Vérifié le 2026-08-21 : **227 = 227**, rien en attente. Si les deux nombres diffèrent,
regarder **quelles** migrations manquent avant de lancer `--include-all`.)*
⛔ **`supabase db reset` et `db push` INTERDITS, même en local** — base partagée.
*(Vérifié le 2026-08-21 : **227 = 227**, aucun doublon de version, aucune migration en
attente. Reconfirmer avant chaque lot : une migration hors ordre est **sautée en
silence**.)*

**Toute table neuve** : `revoke all … from anon, authenticated` **dans la même
migration** — *ce plan a mesuré `food_groups` accordant S/I/U/D jusqu'à `anon`* — et
**réclamée par le lifecycle RGPD**. ⟳ ⛔ **Et le test qui devrait le vérifier ne le peut
pas** : `keel_gdpr_lifecycle_test.ts` est une **liste écrite à la main**. **Le réparer est
la première moitié de `S5`.**

⛔ **Interdits sans validation humaine** : `secrets set/unset`, `db reset`, `db push`,
`functions deploy`, `config push`, `link`, `projects/branches delete`, écriture de secret
via la Management API. **Un lot en a besoin** — le cron de promotion (`L18b`) : **le plan
donne la commande, il ne la lance pas.**

**Ne jamais commiter** `en.ts` / `fr.ts` / `catalog.ts` / `planRefusals.ts`.
*(Précision : ces fichiers **sont** suivis par git — 18 fichiers i18n commités, parité
verte à 6 tests. Ce sont leurs **modifications en cours** qu'il ne faut pas commiter.)*

⛔ **Pas de `git stash`** — dépôt partagé, ça emporte 200+ fichiers d'autres sessions.
Pour comparer : `git show HEAD~1:<fichier>`.

⚠️ **N'exporte aucune variable `SUPABASE_*`** avant les tests : **114 faux rouges**.
*(Vérifié : les 673 tests vitest passent sans elles.)*

⚠️ **401 « Invalid JWT »** : seul geste autorisé, `./scripts/check-local-jwt-alg.sh`, puis
lire `docs/keel/JWT-HS256.md`. ⛔ Jamais `verify_jwt = false`, jamais écrire dans
`signing_keys.local.json` — **il doit rester `[]`**, c'est le correctif.

⚠️ **Avant tout run réel** : redémarrer `functions serve`. Le runtime edge sert un **cache
périmé des `_shared`** — un fichier **modifié** n'est pas rechargé. ⟳ **La commande est
autorisée** *(2026-08-21)* :
```bash
supabase functions serve --env-file supabase/.env
```
*(`supabase/.env` existe, 4 388 octets. ⚠️ Rappel : les clés de modèle vivent dans le
**runtime**, pas dans ce fichier — un `.env` incomplet ne prouve pas qu'une porte est
fermée.)* *(Vérifié : le runtime
répond, `generate-meal-v1` rend 401 sur un appel non authentifié — le chemin est
joignable ; PostgREST rend 200.)*

⛔ **Jamais `unicode_escape`** pour du texte accentué : mojibake que ni `tsc` ni la parité
n'attrapent. **`S1` touche précisément des ligatures — c'est le lot où ça mord.**

⛔ **Jamais un matcher maison** sur un nom d'aliment — « laitue » ≠ « lait », **12/12**.
*(Vérifié : il n'en existe aucun aujourd'hui. Le risque résiduel vient de la précédence
`bySlug` > `byAlias`, pas d'un rapprochement flou.)*

⚠️ **`create or replace view` perd `security_invoker`** — le repasser dans la même
migration. **`V0-B` touche `composition_fill_weekly` : c'est le lot où ça mord.**

⚠️ **R1 du contrat** : jetons **ASCII anglais**, y compris dans le jsonb.
**R6** : pas de valeur d'énumération sans une **branche d'évaluateur nommée** — *`D1′` en
ajoute une*.

⚠️ **Sessions parallèles** : horodater les fichiers d'une lane avant d'y écrire. Ce dépôt
porte **313 fichiers modifiés** appartenant à plusieurs sessions.

⚠️ **`agent-gate.sh` ne lance pas vitest et ne typecheck aucun test front** — ⟳ **`H1` et
`H2` sont remontés en vague 1 pour ça**. Et `tsc -b --force` prend 2 s ; l'incrémental
invente des erreurs.
