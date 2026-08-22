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

⟳ ⛔ **AUCUN de ces six chiffres ne se reproduit — mesuré le 2026-08-21 par `V0-E′`, avec le résolveur de PRODUCTION importé et après pliage, puis contre-vérifié sous SIX définitions différentes.**

```
                              RÉSOLU          PESÉ (résolu ET pesé)
annoncé par ce plan     foyer 89,2 %   solo 89,3 %   |  foyer 80,1 %   solo  7,8 %
mesuré (retenu)         foyer 96,9 %   solo 94,1 %   |  foyer 93,6 %   solo 36,4 %
                                                        (9 399/10 039)  (1 880/5 161)
```

Les cinq autres définitions essayées et publiées : avant pliage toutes lignes **91,9 / 28,4** · avant pliage lignes de plat **90,9 / 21,0** · avant pliage lignes de préparation **93,5 / 55,9** · SQL `grams_raw` non nul ⛔ *(interdit — figé à la génération)* **75,6 / 14,9** · SQL `amount` structuré **87,7 / 17,2**.

⚠️ **Le foyer à 87,7 % tombe à 0,1 point du « 87,6 % » annoncé** — c'est probablement de là que vient la ligne. Mais dans cette même définition **le solo vaut 17,2 %, pas 11,2 %**. ⛔ **Et le « 7,8 % » est le chiffre voisin de `L-1`** — `unit_grams` sur **72/923 = 7,8 %**. La recopie n'est pas prouvée, mais **aucune définition ne rend 7,8 %**.

⇒ **La phrase « la résolution est identique dans les deux lanes, c'est la pesée qui s'effondre » RESTE VRAIE** — 96,9 contre 94,1 en résolution, 93,6 contre 36,4 en pesée — **mais l'effondrement est trois fois moins profond qu'annoncé**, et tout seuil de la vague 2 calé sur 7,8 % vise un point qui n'existe pas. **Le dénominateur de toutes les vagues suivantes est celui-ci, daté, pas celui du tableau ci-dessus.**

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
| **15** ✔︎déjà | **Aucun objectif de poids sur un mineur.** Le champ part du front. ~~⚠️ **Et le littéral en base est maintenu** — il coûte une ligne et **ferme les quatre surfaces**~~ ⟳ ⛔ **CETTE MOITIÉ EST FAUSSE, mesuré le 2026-08-21 par `V0-C` et revérifié : `target_not_for_minor` n'a JAMAIS existé** — **0 occurrence** dans `supabase/migrations/`, `frontend/src/` et `pg_proc` — et `goal_not_for_minor` a été **délibérément RETIRÉ** des deux portes le 2026-08-18 (`20260818100000`, renversement documenté en trois points dans la migration elle-même). **Il n'y a aucun littéral à maintenir : la décision tient, mais elle coûte une migration qui RENVERSE une décision écrite, pas une ligne** | ⛔ **PORTE G4 FERMÉE.** `S4` est débloqué, ⟳ **et il ne « garde » pas trois cas SQL : il CRÉE la garde sur QUATRE surfaces** — les quatre ont été mesurées `ok:true` en transaction `rollback`. ⚠️ **Les 2 bouches existantes doivent être traitées** — c'est un geste à part, nommé — ⟳ **et la 3ᵉ est la FIXTURE `V0-C`, pas une personne** |
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

## Ce qui reste ouvert — ~~**sept**~~ ⟳ **CINQ** *(13 et 26 fermées le 2026-08-21 par `Q-G2` et `Q-S2`)*

| # | question | pourquoi elle t'appartient |
|---|---|---|
| **1** | **Le périmètre juridique** *(porte P0)* | coût, calendrier, risque. Le doc dit *« à qualifier avant le pilote payant »* ; le reste t'appartient |
| **2** | **Un moteur d'ancrage, ou deux** *(porte G7)* | décision de **moyens**. Position retenue : **C maintenant** — retirer de l'écran solo ce que la lane solo ne lit pas, *« honnête et gratuit »* — **A quand le temps existe** |
| **5** | **Régénérer est gratuit** | un plafond ajoute de la friction sur un geste légitime. **Arbitrage produit, pas technique** |
| **20** | **1 311 comptes de test sur 1 320** | dépend d'un fait inconnu : **y a-t-il de vrais utilisateurs en prod ?** Si c'est 9, mesurer en prod n'apprend rien |
| ~~**13**~~ | ~~**Le bloc de déclaration de groupe devient-il inconditionnel ?** *(porte G2)*~~ ⟳ ✅ **FERMÉE le 2026-08-21** | ⟳ **le coût A ÉTÉ mesuré** *(lot `Q-G2`)* : **2 rouges sur 6 164**, ≈ 3-5 % d'un prompt réel et **dans le préfixe cachable**, 0 migration ⇒ **oui, inconditionnel** *(§⑨ n° 3)*. ⛔ **Mais la mesure a renversé le problème** : le modèle **obéit** déjà, et c'est `ingredientPayload()` qui jette la clé — fiche neuve **`L17-0`**, qui devient la vraie dépendance de `L17` |
| ~~**26**~~ | ~~**Portée de la ceinture `strict`**~~ ⟳ ✅ **FERMÉE le 2026-08-21** | ⟳ **le coût côté chat A ÉTÉ mesuré** *(lot `Q-S2`)* : **0 tour de plus** sur 5 701, **0,12 %**, majorant **1,97 %**, contre un seuil écrit à **5 %** ⇒ **les trois points d'entrée** *(§⑨ n° 4)*. ⛔ **Mais le coût réel de `S2` est ailleurs** : il n'existe **qu'un seul texte de repli**, *« put it to a doctor »*, **faux 100 % des fois où il sortirait** pour une intolérance |
| **19** | **Granularité du facteur d'ancrage** | demande de **lire ce que `anchorFactorFor` fait aujourd'hui**, ce qui n'a pas été fait |

⇒ ~~**Trois des sept (13, 19, 26) ne sont pas des décisions produit : ce sont des mesures
qui manquent.**~~ ⟳ ✅ **ET C'ÉTAIT VRAI : deux des trois sont tombées en une soirée**, par
une lecture de code et un compteur, sans qu'un humain ait rien à arbitrer — `Q-G2` a fermé
la **13**, `Q-S2` a fermé la **26**. **Reste la 19**, qui exige `V0-D` : sans boîtes,
`anchorFactorFor` ne produit rien à observer.

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
| 2026-08-21 | 0 · Q-S2 | tours de chat qui mordraient si `strict` entrait sous `applyKeelOutputLocks` : **non mesurés** | rejeu à blanc important le code de production, fidélité prouvée (restreinte à `{medical}`, **0 écart** sur 5 701 tours) : `tours_total` **5 701** (et non 5 885) · `mordent_avec_medical` **7** · `mordent_si_strict` **7** ⇒ **0 nouveau mordu, 0,12 %**. Majorant si le porteur était celui qui parle : **73 / 3 708 = 1,97 %** | **seuil 5 % NON ATTEINT.** ⟳ ⛔ **MAIS PAS « 41× en dessous » — ce cadrage est faux et il a été retiré le 2026-08-21 par la vérification adversariale.** Le 0,12 % est mesuré sur **18 tours exposés**, pas sur 5 701 : les **5 comptes** porteurs d'une contrainte `strict` porteuse de jeton totalisent 7+5+4+1+1 = **18 tours archivés**, dont **0** ne nomme son jeton. ⇒ **la mesure nominale n'a aucune puissance et ne doit pas être citée.** **Seul le majorant 73 / 3 708 = 1,97 % porte la décision** — 2,5× sous le seuil (§⑨ n° 4). ⚠️ Second biais nommé par la vérification : le rejeu s'applique à du texte **archivé**, or en production la ceinture s'exécute **avant** l'archivage — le chiffre nominal **sous-estime** doublement | ⛔ **Le volume n'est pas le coût.** ① Sur les 14 `strict`, **6 seulement portent un jeton** : les 8 lignes `kind='diet'` n'entrent jamais sous la ceinture même élargie (`safetyConstraintTokens` ne rend pas `dietRef`) — et c'est **voulu**, c'est la cicatrice `diabetes`. ② Les morsures viennent **toutes des FORMES DE SURFACE** (`cheese` 19, `yogurt` 42, `couscous` 20) et **jamais du mot de la contrainte** (`gluten`, `lactose`, `dairy` : **0 occurrence** sur 5 701 tours). ③ L'exception de négation **n'en sauve aucune** (64/64, 23/23) alors qu'elle sauve `peanut` (23→12). ④ ⛔ **La ceinture n'a qu'UN repli**, `MEDICAL_BLOCK_FALLBACK_EN` — *« put it to a doctor »* — **faux 100 % des fois où il sortirait** pour une intolérance au lactose : **c'est là qu'est le coût de `S2`, pas dans le taux de refus**. ⑤ `allergen_bridge.ts:76` porte **déjà** `BLOCKING_SEVERITIES = {medical, strict}` : `S2` **referme une divergence existante**, il n'en crée pas une. ⑥ `:408` **n'est pas un filtre de ceinture** mais un booléen de prompt — il ne fait pas partie du geste. ⑦ Pour `S1b` : `surfaceFormsFor('fruits_de_mer')` rend bien `[]`, **mais le jeton lui-même matche** — la ceinture de ce ref est morte **en anglais seulement**, pas morte tout court |
| 2026-08-21 | 0 · *budget & horloges* | la commande de comptage du §⑩ et la table des trois horloges, **prises telles quelles** | `operation_family = 'plan_generation'` : **56 lignes en tout, la dernière le 2026-08-13** ; les **107** appels des modèles de génération (`gpt-5.6-sol` 58, `gpt-5.6-luna` 49) sont sous `operation_family = 'other'`, la valeur **par défaut**. Latence réelle : luna **médiane 66 510 ms / max 210 365**, sol **médiane 133 463 / max 202 174**, contre **300 000 ms** en vigueur | **deux corrections écrites AVANT tout run** (§⑨ n° 6 et n° 7) | ⛔ **Le compteur de budget du plan était aveugle : il aurait rapporté « 0 génération dépensée » après en avoir dépensé dix.** La bonne clé est `source`, et elle sépare exactement l'unité demandée — `generate-*-v1` = **une GÉNÉRATION**, `generate-*-v1.<suffixe>` = une relance. `request_id` ne regroupe rien (48 appels = 48 `request_id`). ⛔ **Second fait : les 110 s de `GEMINI_HTTP_TIMEOUT_MS` ne contraignent PAS les générateurs** — `gemini.ts:248-251` les remplace dès que `meta.httpTimeoutMs` est passé, et les deux lanes passent `PLAN_HTTP_TIMEOUT_MS` (300 s) depuis le correctif du 2026-08-19. **Le plan portait un fait que ce correctif avait lui-même périmé**, et le commentaire du code aussi (« 164 s de médiane » ne se reproduit sur aucun des deux modèles). ⛔ **Troisième : `where status <> 'success'` rend zéro ligne, TOUJOURS** — `llm_usage_events` ne porte aucune ligne non-`success` : **un appel qui expire n'écrit pas d'événement.** Un résultat vide ne prouve pas l'absence d'expiration |
| 2026-08-21 | 0 · V0-B | 22:41:21 CEST — `student_generated_meals` : **une seule ligne**, `{}` · `0` · **180** *(reproduit)* · `composition_fill_weekly` : **6 semaines**, `unknowns_median = 0` et `unknowns_max = 0` sur les six, les quatre `share_*` **vides** · `reloptions` : **vide** | 22:46:20 CEST — ① `count(*) from composition_fill_weekly` → **0** ② `reloptions` → **`{security_invoker=true}`** ③ les 180 lignes → **`∅`, `∅`** · `updated_at` **intact** (min/max/152 `differs` identiques) · migration `20260821225000` **inscrite** au registre, disque = registre = **228** | **les trois seuils ATTEINTS.** Arme livrée et **mordue** : `composition_fill_weekly_test.sql`, **6 cas verts** (22:47:52) ; rejouée sur la vue du lot 18 réinjectée → **3 cas en `ÉCHEC`** et `raise` | ⛔ **`drop default` ne suffit pas : le défaut a un SECOND porteur, dans le chemin d'écriture.** `write_student_meal_plan` fait `coalesce(…, 0)` et `coalesce(…, '{}')` (`20260821032000:207-208`) — ses 2 appelants vivants passent de vraies valeurs, mais **tout appelant qui omet les clés repeuple la vue de faux zéros**. Second : la fiche disait `drop default`, or les colonnes étaient **`not null`** — l'`update … = null` **échouait** sans `drop not null`. Troisième : la vue **n'avait jamais** `security_invoker` (`reloptions` vide AVANT) — le lot le **pose**, il ne le repose pas. Quatrième, hors périmètre : `account-export-v1:488` exporte la table par **liste explicite** et **n'emporte ni l'une ni l'autre colonne**, alors que la migration du lot 18 affirme « exportée en entier » *(famille `S5`)* |
| 2026-08-21 | 0 · V0-B-bis | 23:06:30 CEST — ① vue mutée : `ÉCHEC ⑤ … plans=ABSENTE` **et** `NOTICE: tous les cas passent`, **`rc=0`** ; test non muté 6/6 ② ⛔ **`git show HEAD:` ne rend RIEN** — `compositionFill` a **0 occurrence** à HEAD dans les deux lanes : **toute la chaîne du lot 18 est non commitée** ; `prosrc` réel = `greatest(0, coalesce(…, 0))` + `coalesce(…, '{}')` ; plans à `0` sans remplissage : **0** | 23:22 CEST — ① même mutation → **`rc=3`**, test non muté **10/10** ② trois chemins **nombre / `null` / `null`**, prouvés par 5 cas Deno + 4 cas SQL neufs ③ vue **0**, `reloptions` **`{security_invoker=true}`**, trigger `'O'`, disque = registre = **229** | **les 3 seuils ATTEINTS**, **trois morsures prouvées** ; commit `47e293b6`, 4 fichiers — ⛔ les deux `index.ts` **modifiés mais NON commités**, exprès | ⛔ **Le `null` a un TROISIÈME visage : la sonde qui n'existe pas.** `insert … select … where …` pose zéro ligne si le `where` ne trouve rien : le cas **disparaît**, ni `OK` ni `ÉCHEC`, et `is distinct from true` ne le rattrape pas — **il faut une assertion de cardinalité**. ⛔ **Second, plus dur : ses propres sondes RPC sont d'abord passées pour la raison INVERSE de celle qu'elles testent** — `CommandId` figé, `NULL`, donc « vertes à cause du bug ». ⛔ **Troisième : retirer le `coalesce` seul n'aurait rien réparé — `greatest(0, null)` vaut `0`.** **Quatrième** : `coalesce(x, '{}')` sur un `null` JSON rend un jsonb `null`, que la vue ne filtre pas. **Cinquième** : la garde C5 ⑥ de `household_freeze_test.ts` a **mordu le correctif** et avait raison (`[object Object]` sur une `PostgrestError`). **Sixième** : `agent-gate` **lance bien** les tests Deno (`grep -c 'deno test'` → 1) et a bloqué le commit — ⚠️ mais la cicatrice tient, `grep -c vitest` → **0** : `H1`/`H2` restent entiers |
| 2026-08-21 | 0 · V0-C | 22:52:36 CEST — foyers ≥ 4 bouches **7** *(reproduit)* · foyers portant simultanément végane + mineur + allergie `medical` + 2 objectifs opposés **0** *(reproduit)* ; base à **31 foyers · 88 bouches · 7 allergies** | 23:03–23:04 CEST — ① la requête unique rend **1 ligne** (`b1959752-…`, 4 bouches) ② `surfaceFormsFor('peanut')` sous Deno → **8 formes** ③ relance : **32/92/8 → 32/92/8**. Arme mutée : `FIXTURE_ALLERGY_LABEL="fruits de mer"` ⇒ **exit 1, 0 écriture** | **les 3 seuils ATTEINTS**, arme prouvée dans les deux sens | ⛔ **`S4` ne ferme pas une brèche d'ORDRE : il CRÉE la garde, sur QUATRE surfaces.** Quatre ordres mesurés en transaction `rollback`, **quatre `ok:true`** — dont `add_member(date_de_mineur, 'fat_loss')` **en UN seul appel** *(c'est ce que `SetupPage.tsx:1592` envoie)* et **`set_member_target(45 kg, 0,2/sem)` sur une enfant de 15 ans**. `goal_not_for_minor` a été **retiré** des deux portes le 2026-08-18 (`20260818100000`, renversement documenté en trois points) et **`target_not_for_minor` n'a JAMAIS existé** — **0 occurrence** dans les migrations, le front et `pg_proc`, revérifié par l'orchestrateur. ⇒ **la décision n° 15 du §⑥ est fausse sur sa prémisse**. Second : sans `student_goals` du maître, `V0-D` reçoit **409 `goal_required`**. Troisième : **les 5 personas de `tests/real-personas/` n'existent plus en base** |
| 2026-08-21 | 0 · V0-E′ | les dix compteurs n'existaient que **recopiés dans le plan** : aucun fichier, aucune sortie datée, aucun moyen de les relancer | 23:11:21 CEST — **les dix lignes rendues en UNE commande**, archivées. #1 **0/180** · #2 **⛔ N'EXISTE PAS** · #3 foyer **93,6 %** / solo **36,4 %** · #4 **533/444/144 sur 1 821** · #5 **non mesuré (0/180)** · #6 **5/24/18 sur 47** · #7 **0/13** · #8 **181/340** · #9 **6 / 35 sur 58** · #10 **25/92 · 1 193/1 313**. Rejouable : 3 exécutions, `diff` ne rapporte que l'horodatage | **SEUIL ATTEINT.** ⛔ Mais **quatre valeurs du plan ne se reproduisent pas** : #5 *(attendu)*, **#6 et #10** *(inattendu)*, **#3** *(aucune des six définitions)* | ⛔ **`V0-C` DÉTRUIT DEUX COMPTEURS QUE LA FICHE NE PROTÉGEAIT PAS.** Elle nomme #1/#3/#5/#7 comme détruits par `V0-D` ; à **21:03:48 UTC**, pendant ce lot, la fixture a fait passer #6 de **1/24/18 sur 43** à **5/24/18 sur 47** et #10 de **25/88** à **25/92**. *Inverser `V0-E′` et `V0-D` était nécessaire, pas suffisant.* ⛔ **Second : `80,1 % / 7,8 %` ne se reproduit sous AUCUNE des six définitions** — mesuré **93,6 / 36,4**, et le « 7,8 % » est le chiffre voisin de `L-1` *(`unit_grams` 72/923 = 7,8 %)*. **Tout seuil de la vague 2 calé dessus visait un point qui n'existe pas.** **Troisième : le pliage fait DESCENDRE le taux du PLAT (43,2 → 38,4) et MONTER celui de la LIGNE (91,9 → 93,6)** — la fiche n'énonçait que la baisse. **Quatrième : `\b` n'est pas une frontière de mot en Postgres** — le compteur #8 écrit ainsi rend **0/340**, *et un zéro a l'air d'une bonne nouvelle*. **Cinquième : 15 lignes d'ingrédient ne portent aucun `term`** — SQL 9 810, résolveur 9 795 |
| 2026-08-21 | 0 · V0-E′-bis | 23:45:44 CEST — copie hors dépôt, compteur #6 neutralisé ⇒ **`rc=0`**, **stderr 0 octet**, **9 lignes** (#6 disparu), pied de page *« dix lignes rendues »* ; cardinalité **absente**. Copie non mutée d'abord : 10 lignes, `md5 dd6ea342…` | 23:49 CEST — ① même sabotage ⇒ **`rc=1`**, stdout vide, `⛔ CARDINALITÉ: 9/10 — MANQUANT(S): #6` ; contre-épreuve sur `c9` ⇒ `rc=1`, `#9` ② tableau intact ⇒ **10 lignes, `rc=0`**, corps **identique au bit près** à l'archive du 23:11 | **SEUIL 2/2 ATTEINT** — commit `0d17e7f0`, 1 fichier, +47 | ⛔ **Les deux ⛔ de la fiche se contredisaient : la ligne `FIN` EST dans le corps dont le `md5` est exigé.** Imprimer `$n` casse `dd6ea342…`, **c'est-à-dire la comparaison qui referme chaque vague**. Tranché sur la réversibilité (§⑨ n° 16). **Second** : l'arme mord sur un compteur quelconque — prouvé sur `c6` ET `c9`. **Troisième, règle de méthode** : **vérifier la copie hors dépôt NON MUTÉE d'abord** — sinon un `md5` divergent serait imputé au sabotage au lieu de la copie |
| 2026-08-21 | 0 · **V0-D** | 23:11 CEST — `dishes[].boxes` **0/180** · `box_sizing.anchor` **0/46** · `food_composition_pending` **0** · ceinture à `mouths>1` **0/13** · budget **0/3** | 21:50:54→21:52:37 UTC — **HTTP 200 en 102,8 s**, plan `3c781a71`, `intent: prepare_next`, fenêtre 7 jours. ① `dishes[0]->boxes` → **0** *(petit-déjeuner)* **mais 24/36 plats et 38 boîtes**, #1 **0/180 → 1/181** ② `box_sizing.anchor` **présent** ③ `regime_belt.mouths` **1**. Sas : **3 lignes** · 4 compteurs du lot 18 : `table .931 / promoted 0 / model .069 / group_bounds 0` · `composition_unknowns` **3, `measured:true`** · `per_portion` **première ligne** · modèle **`gpt-5.6-luna`, 100 059 ms sous 300 000**. Budget réel : **1 génération / 3, 26 906 tokens** | **① prose ATTEINT / requête MANQUÉE · ② ATTEINT · ③ MANQUÉ** — ⟳ **et « inatteignable » est RÉFUTÉ : c'est un trou de fixture, pas une fatalité** | ⛔ **LE RUN A ÉTÉ REFUSÉ AVANT DE COÛTER QUOI QUE CE SOIT : `no_coach` (409), une porte qu'AUCUNE fiche ne nommait.** La lane foyer exige un `coach_clients` actif — le « pivot foyer B2C » **ne compose pas sans coach**. ⛔ **Second : `intent: "commit"` est une FICTION DU PLAN** — le mot n'existe nulle part dans le code. ⛔ **Troisième, le plus grave : la MINEURE est servie DEUX FOIS, 12 repas sur 12** (`mouths_double: 12`) — un bac sur le plat commun **et** un sur son plat dédié ; le seul témoin est `generated_from.issues`, **un champ qu'aucun écran ne lit**. ⛔ **Quatrième : MALO, en `fat_loss`, n'a AUCUN contenant pesé** — il est dans le bac commun avec ceux qui n'ont pas d'objectif. **C'est le seuil que `L6′` croit tenir.** ⛔ **Cinquième : la `direction` se trompait de motif** — `day_incomplete` **0**, `no_delivery` **17/24**. ⛔ **Sixième : `Q-G19` ne peut PAS se fermer sur un run** — 24 facteurs calculés, **2 retenus** (`|f−1|` minimal), **22 jetés (91,7 %), et ce sont les jours les plus EXTRÊMES**, par construction du critère ; **aucune valeur n'est journalisée**. **Septième : le nom du modèle n'entre toujours pas dans `generated_from`** — 21 clés, aucune ne le porte. ⛔ **Huitième : DEUX des « neuf mécanismes » étaient HORS SUJET** — `condition_ref` et `cooking_session_states` appartiennent au **chat**, aucun chemin depuis un générateur. ⟳ ⛔ **~~et `laneMode` a 0 occurrence~~ — RÉFUTÉ le 2026-08-22 : le symbole réel s'appelle `HouseholdLaneMode` / `householdLaneMode` (`household_composition.ts:52` et `:86`), il est appelé par `resolveHousehold` (`:426`) depuis `index.ts:2632`, et c'est LUI qui produit le `per_portion` que ce même lot compte comme une réussite. `laneMode` était un nom que le code n'a jamais porté : le VERDICT D'ABSENCE reposait sur un grep d'un symbole inexistant.** ⚠️ **Et `per_portion` n'est pas vérifiable comme « première ligne »** : le mode n'est persisté **nulle part** *(0/181 plans portent une clé `composition_mode`)*, `resolveHousehold` est câblé depuis le **2026-08-11**, et **102 plans foyer** l'ont précédé. ⇒ **SEPT mécanismes étaient en jeu, pas six.** **Neuvième : le §⑩ sous-estime le coût d'un facteur 2** — 26 906 tokens contre ~13 000 |
| 2026-08-22 | 1 · S1 | 01:18:51 CEST — **0/6 sous ligature**, 6/6 sous digramme, TOTAL **6/12** ; neutre ⇒ `null`. ⛔ **Et la fiche disait faux** : le catalogue ne porte **aucune** ligature littérale *(0 sur 100 formes)* — les « 6 formes de surface » sont **6 formulations**, et la seule forme concernée est **`"oeuf"`**, listée sous `egg` **et** `eggs` | 01:21:48 CEST — **12/12**, `kind` et `severity` identiques · neutre `null` + 5 témoins · balayage **2/2 = 100 %** · **3 994 passed / 0 failed** · `deno check` **rc=0** | **les 3 seuils ATTEINTS**, mutation prouvée dans les deux sens — commit `8cfeb193`, 2 fichiers, +168/−0 | ⛔ **`S1` A UN JUMEAU, ET IL EST CLINIQUE.** `medical_condition_floor.ts:60` porte une **TROISIÈME** `normalize()` recopiée, identique à celle d'avant le correctif — et son en-tête dit de lui-même qu'il est *« le SEUL défaut de toute la campagne qui peut blesser quelqu'un »*. Mesuré 01:30:04 : **4/4 formes mortes sous ligature**, **`« j'ai une maladie cœliaque »` ⇒ `null`**. ⚠️ **Et c'est PIRE que `S1` : ici la ligature EST la graphie normale du mot** — dans le catalogue d'allergènes, le digramme `oeuf` était déjà là. ⇒ fiche neuve **`S1c`**. ⛔ **Second : le motif est dans SEPT autres modules, et DEUX l'ont déjà** *(`meal_declaration_floor`, `food_composition`)* — **la divergence est déjà installée**, et `S1` n'en referme **qu'un huitième**. ⇒ arbitrage : **une règle de dépôt** *(famille `X2′`)* plutôt que huit correctifs. **Troisième : la clé `eggs` du catalogue est INATTEIGNABLE** — tri stable par longueur, `{egg,'eggs'}` précède toujours `{eggs,'eggs'}` ; le critère juste d'un balayage est *« les deux graphies rendent le MÊME verdict »*, jamais *« rend ce ref »*. **Quatrième, de méthode : `agent-gate` a refusé le 1er commit sur 3 rouges d'`energy_gate*`** — fichier modifié à 01:27:23 **par une autre session** pendant la tentative. **Attendre et rejouer**, jamais `AGENT_GATE_SKIP_TESTS` |
| 2026-08-22 | 1 · S3 | 01:20:35 CEST — `birth_date` NULL **1 193/1 313** *(annoncé 1 193/1 312)* et **25/92** *(annoncé 25/88)* — les deux déplacements de la vague 0, reproduits · `escalateMinorStudent` **0 appelant prod, 0 en test**, `stripComments` appliqué · population **`minor 17 · adult 103 · absent 1 193`** · porte mesurée depuis `energy_gate.ts` : `absent` ⇒ **`{open:true}`** | 01:44 CEST — compteur `age_gate` sur les **1 313 lignes réelles**, zéro appel de modèle : **`{minor 17, adult 103, absent 1 193}`**. Couple même-entrée **HEAD vs corrigé** : `open 1 296` → `open 103` — ⛔ **le chiffre sortait 1 296 fois, il sort 103 fois**. `escalateMinorStudent` : **1 appelant de production**. Mutation ×5 (arbre intact 60/0) : 5 · 9 · 2 · 1 · 4 rouges | **les 2 seuils ATTEINTS**, arme prouvée dans les deux sens. ⚠️ **le RUN RÉEL n'est pas fait** — budget zéro génération respecté, reporté à la fin de vague | ⛔ **Le défaut était DEUX FOIS plus large que la fiche** : pas seulement `absent`, mais aussi `unreadable`/`future`/`implausible`. `ageStateFromVerdict` les range sous `unknown` **depuis toujours** et `household_portions.ts` refuse de dimensionner dessus en **4 endroits** — **la lane solo était la SEULE exception du dépôt.** ⛔ **Second : `minorEscalationRow` écrit un fait FAUX** — *« Plan generation is held »* alors que `generate-meal-v1` ne retient rien ⇒ **fiche `S3-a`**, **non corrigeable ici** : le texte vit dans `student_body_io.ts` *(incommittable — ses +9 lignes en cours nomment des champs absents de HEAD)* et sa moitié d'écran dans `en.ts`/`fr.ts` *(interdits)*. ⛔ **Troisième : 16 escalades vont partir** — 17 mineurs avérés, 1 seul déjà escaladé. ⚠️ **Quatrième : le gate a refusé le commit DEUX FOIS sur des rouges ÉTRANGERS**, prouvés non-miens en rejouant les tests avec les versions HEAD des modules du lot — **toujours 2 rouges**. Attendu et réessayé, **jamais `AGENT_GATE_SKIP_TESTS`, jamais de lock supprimé** |
| 2026-08-22 | 1 · S1c | 01:39:44 CEST — table **11 jetons / 76 formes / 0 ligature littérale** ; formes concernées **4** *(les digrammes de `coeliac_disease`)*, **4/4 mortes sous ligature**, accord **0/4 = 0 %** ; `« j'ai une maladie cœliaque »` ⇒ `null` | 01:43:53 CEST — balayage **4/4 = 100 %**, cardinalité **4 > 0** ; 7 témoins `null` ; fichier **21/21** ; suite keel **4 066 / 0** | **SEUIL ATTEINT**, mutation dans les deux sens *(non muté 21/21 rc=0 · sans `œ` rc=1 18/3 · sans `æ` rc=0 21/21)* — commit `b0ca4a15` | ⛔ **LA FICHE SE TROMPAIT DE COMPTE ET DE CAMP.** ① **Le motif n'est pas dans 7 modules : `.normalize("NFD")` sans repli est dans 46** *(hors tests)*, 3 le portent après `S1c`. ② ⛔ **`meal_declaration_floor` était listé parmi ceux qui « l'ont déjà » — IL NE L'A PAS, et il MORD** : `« j'ai mangé des œufs brouillés ce matin »` ⇒ **`null`**, **la déclaration de repas ENTIÈRE est perdue** — 3 phrases sur 4 divergentes. ③ ⛔ **Un module MORD dans la lane SÉCURITÉ, hors de la liste** : `safety_lexicon.ts` — `« ma sœur veut en finir »` ⇒ `THIRD_PARTY` **false** contre `true` au digramme. ④ `body_measure_floor` mord **en sens inverse** : `« je fais 78 kg comme ma sœur »` **écrit 78 kg**. ⑤ Les **5 autres** portent **zéro** jeton à ligature réelle ⇒ théoriques. ⑥ ⛔ **Une TROISIÈME politique est déjà installée** : `meal_correction.ts`, `dietary_regime.ts`, `protein_anchor.ts` **énumèrent les deux graphies** ; et `food_composition.ts:464` porte le repli **en ligatures LITTÉRALES sans `.normalize("NFD")`** — **un scan du motif NFD ne le voit pas**. ⚠️ **De méthode : le disque est à 100 %** — le 1er commit a échoué sur `ENOSPC` au `tsc`, rejoué 2 min plus tard : pass |
| 2026-08-22 | 1 · L0-a | 01:17:51 CEST — **29 violations / 14 plans** ✅ *(reproduit)*, sur **181** plans, **109** porteurs, **691** lignes ⛔ *(la fiche disait 112/677 : 113 portent la clé, dont 4 VIDES)*. Écarts signalés **4 j (21) · 5 j (4) · 6 j (4), aucun 3** ; couples à écart **exactement 3** : **51 sur 31 plans** — la population que le `>=` ouvre, **invisible dans `issues`** | 01:59:50 CEST — rejeu des 181 plans par la règle réelle, **0 génération** : `{violations 102, within 1179, not_evaluated 83}` · **violations résiduelles après refus 0** · **0 plan vidé** · 83 plats jetés / 36 plans · fenêtre crue **96,2 %** routée · **vagues 179 → 187** | **2 seuils sur 3.** `violations = 0` ✅ · `within` non nul ✅ · ⛔ **`not_evaluated = 0` MANQUÉ : 83**. **47 tests, 4 mutations** — 3 · 3 · 2 rouges, et **`not_evaluated`→`within` : 0 ROUGE** ⛔ *(compteur inatteignable, refermé puis re-muté)* | ⛔ **① `prep.cookOn` vient de la SESSION, parsée SOUS la boucle des plats** — **une garde posée dans la boucle serait passée VERTE sur le cas mesuré**. Bloc remonté. ⛔ **② 83 couples sur 1 466 tirent d'une casserole sans jour de cuisson, silencieusement sautés** : la fenêtre ne tournait pas **et le plan avait l'air vérifié** ⇒ fiche **`L0-a-bis`**. ✅ ③ la jointure terme→groupe existe et est vivante *(923 lignes `NOT NULL`, 96,2 % routées)* — **sans elle la colonne était morte**. ⚠️ ④ **le SENS de `MAX_FRIDGE_DAYS` n'était écrit nulle part** : le `>` lisait « trois jours APRÈS », la constante annonçait « trois jours EN TOUT ». ⚠️ ⑤ **la fiche se trompait sur `week_bounds_test.ts:350`** : l'épinglage reste VERT, c'est l'assertion de COMPORTEMENT qui rougit |
| 2026-08-22 | 1 · S1b | 01:45→01:52 CEST — `surfaceFormsFor('fruits_de_mer')` = **`[]`** · les deux langues : ref `fruits_de_mer` **1 FR / 0 EN**, et ⛔ ref **`shellfish` 0 / 0** · plancher **2/5** · balayage ~~1 active~~ **9 refs / 10 lignes actives**, sur **TROIS colonnes** | 02:12 CEST — intake **5/5**, ceinture **8/8** · `belt_ref_without_forms` **0** sur les 6 libellés réels, **1 puis 2** sur kiwi/fraise · suite keel **4 066 / 0** | **② ATTEINT, ① MANQUÉ** — 8 refs / 11 lignes restent sans formes ; **les 2 seuls qui atteignent la ceinture aujourd'hui sont des MÉDICAMENTS** ⇒ `S1b-bis`. 4 mutations, 4 rouges, 4 tests distincts | ⛔ **La ceinture du jeton CANONIQUE `shellfish` était morte aussi** — 0 morsure sur « seafood » comme sur « fruits de mer », la table portait neuf animaux et aucun collectif : **migrer la ligne aurait fait passer 1 morsure à 0**. ⛔ **Second, et il ferme une question réservée : LA BASE REFUSE LA MIGRATION.** Le trigger `student_safety_constraints_retraction_only` lève sur tout changement d'`allergen_ref` — *« superseded, never rewritten »*. Le seul chemin est insert+retract, **irréversible** (`retracted → active` refusé). **La réparation par le code était la seule disponible, et la base le dit elle-même.** ⛔ **Troisième : la ligne active est `strict`, pas `medical`** — trois causes de mort empilées. ⛔ **Quatrième : la levée coûte un 500 et une phrase d'ingénieur ANGLAISE affichée brute**, alors qu'un **503 traduit existe déjà** ⇒ `S1b-c`, une ligne. ⛔ **Cinquième : le mur des non-commitables a mordu ici aussi** — `household_safety_test.ts` **ne type-checke pas à HEAD** (8 `TS2554`) : **l'arme de ce lot n'est pas exécutable depuis un clone**. Prouvé pré-existant |
| 2026-08-22 | 1 · S6 | 03:14:43 CEST — **64 booléens, 53 VRAIS** *(la fiche disait 60 : c'est le chiffre d'AVANT `L0-a`)*. `anon` porte I/U/D sur **6** tables = **18** droits, pas 21. ⛔ Deux faits hors fiche : **`TRUNCATE`** accordé à `anon` sur 6 tables et à `authenticated` sur 7, **et il échappe à la RLS** ; **`MAINTAIN`** survivant au `revoke` de `L0-a` | 03:29:15 CEST — **19 / 64**, et **0 / 56** pour l'écriture d'`anon` *(`TRUNCATE` et `MAINTAIN` compris, vérifiés)*. Comptes de lignes **identiques** sur les 8 tables. Gate vert aux **8 commits** ; vitest **1 784/1 788**. PostgREST avec la vraie clé anon : `GET` **200 `[]`**, `PATCH`/`POST` **401 `permission denied`** | **les 3 seuils ATTEINTS.** Harnais **26/32 → 58/0**. **3 mutations, 3 rouges**, dont **le SUR-revoke** | ⛔ **① « ÇA ÉCHOUE » N'EST PAS UNE ASSERTION.** `anon update`/`delete` rendaient **aucune erreur, 0 ligne** : une garde qui assert l'échec serait passée **VERTE AVEC LE GRANT**. Le harnais assert sur `permission denied for table`, **que seul le privilège prononce**. ⛔ **② une liste de privilèges NOMMÉS se périme sans rien dire** — six nommés, sept existants ⇒ 8ᵉ migration, et `revoke all` aux huit. ⛔ **③ le trou déborde les 8 tables : 55 des 126** laissent `anon` écrire, **55** lui laissent `TRUNCATE`, **82** le laissent à `authenticated` — dont `internal_admins`, dont la seule policy est en SELECT ⇒ **`S6-b`**. ⚠️ ④ la policy `Users own profiles` en clause `ALL` ouvre un `delete` hors RGPD — **pas réversible par un `grant`, donc hors délégation** ⇒ **`S6-a`**, lot arrêté. ⚠️ ⑤ **`household_member_habits` n'a aucune RLS** ⇒ **`S6-c`**. ⚠️ ⑥ la fiche annonçait **673** tests vitest : il y en a **1 788** |
| 2026-08-22 | 1 · C1 | 03:17 CEST — **0** occurrence fonctionnelle · **8** lignes d'allergie *(le plan disait 7)* · **29** plats dédiés *(le plan disait 28 ; **définition RETROUVÉE** = `dish_owners.asked > 0` avant `V0-D`)* | 03:36 CEST — compteur rejoué **par le vrai module**, **0 génération** : 95 plans → **`{emitted 25, no_medical 38, no_dedicated 32}`**, cardinalité **95/95** ; sous-corpus tracé (53) → `{25, 5, 23}`, **53/53**. Fixture ⇒ `emitted`. Position **prouvée** : dernier bloc, seul `CONTENT_LANGUAGE:` le suit | **LES 2 SEUILS ATTEINTS** — commit `23aad7b5`, +546. **4 mutations, 4 rouges** | ⛔ **LE TROU AVAIT DÉJÀ 25 PLANS DEDANS.** ⛔ **La prémisse discriminante n'est pas le médical** *(48/53 = 90,6 % en portent une)* **mais le plat dédié** *(29/53)* — lire `emitted 25/95` comme « c'est rare » est faux. ⛔ **C'est le MOTEUR qui ordonne la cuisine partagée** : `dedicatedDishBlock` dit *« same cooking session, same shopping, different plate »*, et « different plate » ne suffit pas. ⚠️ Deux blocs auraient pu **s'annuler** — partage écrit : **ingrédient vs ÉQUIPEMENT**. ⛔ Une contrainte médicale **non attribuée** aurait désarmé le bloc **pour la bouche sans compte** |
| 2026-08-22 | 1 · L35-a | 03:19 CEST — **21 gabarits de phrase** *(« calendrier seulement » est FAUX)*, mais **0 des 21 ne nomme un COMPROMIS** · 92 bouches, **45** sans fiche mais **50** sans aucun poids lisible par le runtime · 8 `away_days` / 7 foyers, **0 journée pleine** · 181 plans, **8 `capped`** ✓ · **0 plan portant une des 4 familles** | 04:05 CEST — 32 foyers rejoués, **0 génération** : **23/32 = 71,9 %**. Par famille armée/population **7/7 · 18/18 · 2/2 · 20/20**. Phrase fixe : **20 sorties, ZÉRO par le verrou** *(d2 18 · d3 2 · d4 1)*, et **2 des 11 foyers complets** la portent | **3 seuils sur 4** — ⛔ « les trois sur la fixture » manqué à **2/3** : son unique plan porte `cooking.asked = null`, le plafond ne peut pas mordre ; rejoué à `capped: true` **sur les mêmes faits, la ligne sort**. Le lever demande une génération, hors budget. **6 mutations** | ⛔ **LA GRANULARITÉ D'`away_days` A RENVERSÉ LA FAMILLE ①** : armée sur la journée pleine, elle **ne mord sur AUCUN foyer** — les 8 absences réelles sont des **midis**. **Une famille qui ne mord jamais est indiscernable d'une famille débranchée.** ⛔ **Second : le « 45 sur 88 » sous-compte — c'est 50 sur 92**, parce que `loadHouseholdMemberBodies` **SAUTE la fiche d'une bouche qui a un compte** : **Camille, maître de la fixture, a une fiche, zéro pesée, aucun fait corporel**. ⚠️ **Troisième : `householdLaneMode` n'avait aucun lecteur visible ; ce lot est le premier** — le point n° 8 du §⑤ est à moitié fermé |
| 2026-08-22 | 1 · L0bis | 03:14 → 03:19:55 CEST — `condition_ref` = **0/68** ✅ · **59/92 bouches sans compte** · déficit ouvert MESURÉ par les modules importés : ancre **1 480 kcal (−500/j)**, facteur **0,7475**, enveloppe **1 485-1 683**, **journée la plus basse 1 200 kcal** | 03:48:21 CEST — **les DEUX cas ✅** : `noSizing("pregnancy")` facteur **1 exact** + ancre `null` · un autre `condition_ref` **BYTE-IDENTIQUE JUSQU'AUX GRAMMES** sur 4 jetons + 1 ref inconnu. ⛔ **Compteur 1/2** : 4 populations rendues, cardinalité assertée, `none` **100 %** — mais **3 sur 4 à ZÉRO** : `{0,0,0,92}` et `{0,0,0,358}` | **cas MORD + cas PASSE ATTEINTS · compteur MANQUÉ pour moitié** — **13 mutations, 13 rouges**, non mutée d'abord (74/74) **+ 1 contrôle négatif VERT** | ⛔ **① `pregnancy` et `breastfeeding` étaient UN SEUL jeton** : la 4ᵉ population aurait été **structurellement à zéro**. ⛔ **② La fiche oubliait le chemin VIVANT** (`mouth_anchor.ts`, dont le facteur **REMPLACE** le relatif) — la livrer telle quelle **laissait le déficit entier**. ⛔ **③ « Ancrer sur la maintenance » aurait été le défaut masqué en correctif** — l'équation ignore les **+340/+450 kcal** de la grossesse ⇒ **abstention**. ⛔ **④ LE PLANCHER DE MALADIE N'A JAMAIS MORDU EN RÉEL : 0 jeton sur 358 messages archivés.** La garde dont l'en-tête dit qu'elle est *« le seul défaut qui peut blesser quelqu'un »* **n'a aucune trace d'exécution** ⇒ `L0bis-c`. ⛔ **⑤ UNE MUTATION EST PASSÉE VERTE** — la règle « l'allaitement ne reçoit pas l'éviction » vivait dans un `if` du **générateur**, hors de portée de tout banc. Extraite, re-mutée : rouge. **C'est la mutation qui a écrit le code.** ⚠️ ⑥ `« j'allaite »` ⇒ `null` ⇒ `L0bis-b` · ⑦ **59/92 bouches ne peuvent porter aucune condition** ⇒ `L0bis-a`, **aucune migration créée** |
| 2026-08-22 | 1 · S4 | 03:54:17 CEST — **les cinq ordres rejoués, cinq `ok:true`** ; **score 1/5**. Mineurs porteurs : **3** *(`Tom` porte une cible de 32 kg)*. `authenticated` n'a que `SELECT` ⇒ **les 4 RPC sont la totalité des portes** | 04:11:22 CEST — **5/5**, **11/11** au harnais. A/B/C `goal_not_for_minor`, D `target_not_for_minor`, **P1 accepté sur un majeur**. **3 lignes existantes intactes** | **SEUIL ATTEINT 5/5**, mutation ×4 en transaction annulée — commit `547e90af` | ⛔ **Sous le mutant D, E reste VERT pour un AUTRE motif** (`target_needs_direction`) : **le 5ᵉ ordre ne peut pas armer la 4ᵉ garde**. **Sans la sonde D dédiée, `target_not_for_minor` était livré DÉSARMÉ.** ⛔ **Second : `weighedPortionMembers` n'a AUCUN test d'âge** — les 3 lignes existantes sont **encore pesées** ⇒ **le seuil « 0 mineur » de `L6′` ne prouve rien**. ⛔ **Troisième : `keel_household_join` sème `student_goals`, qui n'a aucune garde d'âge** ⇒ `S4-b`. ⛔ **Quatrième : trois COMMENTAIRES affirmaient l'absence de la garde** — une absence documentée survit à sa cause comme une contrainte. ⚠️ **Cinquième : « suivi par git » ≠ « commité »** — **l'orchestrateur a refait l'erreur de §⑨ n° 1** |
| 2026-08-22 | 1 · S2 | 03:49→03:55 CEST — `35 · 14 · 9` **reproduit** ; partition des 14 : **6 porteuses de jeton, 8 `diet` sans jeton** ; compteur sur les 58 lignes réelles, zéro modèle : **`strict bit 0 / 6`, muettes = les six**. ⛔ **L'énumération rend SIX sites de production, pas deux** | 04:20:24 CEST, **MÊME entrée** — **`strict bit 6 / 6`, muettes `[]`**, second repli servi **6 fois** ; `medical` et `preference` **inchangés au chiffre près** ; `passed` **50** ; plan sans contrainte **128 → 128 octets** ; keel **4 138/0**, skills **239/0** | **LES TROIS SEUILS ATTEINTS** *(6/6 · passed 50 · byte-identité)*. Mutation ×6, non mutée d'abord **86/0**. ⛔ **AUCUN COMMIT** : `safety_constraints.ts` seul sur un arbre HEAD ⇒ **3 `TS2554`**, et **l'arme seule à HEAD ⇒ 0 passed / 1 failed** | ⛔ **LE COÛT DU LOT N'ÉTAIT PAS LE TAUX DE REFUS, ET IL Y EN AVAIT DEUX.** Le second repli était annoncé ; **le prompt qui autorise la phrase fatale ne l'était pas** : sur les deux lanes de génération une morsure **VIDE le plan** (422 `empty_meal`), et `SEVERITY_READING_BLOCK` disait au modèle que **seul `medical` fait ça** — donc, mot pour mot, **qu'un nom `severity=strict` est sans danger dans un plat**. **Élargir la ceinture sans corriger le prompt, c'était rouvrir pour 6 contraintes le trou qui a DÉJÀ détruit une semaine entière en run réel.** ⛔ **Second : `medicalConstraintTokens` est du code mort que 3 fichiers de test lisent comme la vérité** — le laisser medical-only n'aurait rien cassé au runtime et aurait menti à tous ses lecteurs. ⚠️ **Troisième : `plan_question/renderer.ts` dégrade vers une copie LOCALISÉE ; les deux replis de la ceinture sont des littéraux anglais** ⇒ `S2-lang`. ⚠️ **Quatrième : un VRAI rouge étranger reste ouvert** — `declare_safety_constraint_test.ts:248` attend `caf_au_lait` alors que le moteur rend `cafe_au_lait` : **un repli d'accent livré sans son test**, et il ne se répare pas tout seul |
| 2026-08-22 | 1 · S1d | ① 03:51:35 — `« je fais 78 kg comme ma sœur »` ⇒ **78 kg ÉCRIT** contre `null`, **2/3 divergents** ② 03:52:20 — **4/4 divergents**, formes concernées **6 distinctes** dont ⛔ **3 JAMAIS ligaturées** (`moelleux`, `tomatoes`, `potatoes`) ③ 03:52:56 — **lane sécurité, mécanisme INVERSE** : la ligature **SURVIT** à `normalizeForSafety` ; **16 FR désarmables, accord 0/16 = 0 %** | ① **3/3**, balayage **1/1** ② **4/4**, balayage **3/3**, les 3 jamais-ligaturées mordent toujours ③ accord **16/16 = 100 %**, **crise 1ʳᵉ personne toujours `high`** · fichiers **34/47/13** · keel **4 138/0** · gate **pass** | **LES 3 SEUILS ATTEINTS**, mutation dans les deux sens ×3 — et ⛔ **`æ` est enfin ARMÉ STRUCTURELLEMENT** *(sans `æ` seul ⇒ rc=1 sur les trois)* — commit `9aed6639` | ⛔ **LE RECENSEMENT DE `S1c` SOUS-COMPTAIT : 68 modules, 6 avec repli, 62 sans** — et non 46/3/43. ⛔ **QUATRE porteurs de `soeur` étaient hors liste, et TROIS SONT DE VRAIS MATCHEURS DANS LA LANE MÉMOIRE** : `« ma sœur a rechute »` **n'est PAS marqué sensible** là où `« ma soeur »` l'est ⇒ **un souvenir qui nomme une sœur échappe à la RÉDACTION** ⇒ `S1e`. ⛔ **Le piège de la règle est DANS le lexique du module ②** (`moelleux au chocolat`) : **8 formes ligaturables / 48 occ.** contre **34 jamais ligaturées / 249** ⇒ **une règle visant le digramme serait fausse 83,8 % du temps** ; la liste fermée capture **8/8 = 100 %** ⇒ `X2′`. ⚠️ **Deux chiffres de son propre message de commit sont faux et le commit n'est plus HEAD** ⇒ **corrigés au registre, jamais effacés** |
| 2026-08-22 | 1 · S5 | 03:50 CEST — `grep -c` → **0**. **126** tables publiques, **15** citées *(dont **2 QUI N'EXISTENT PLUS**)*, **113 non citées**. Par colonne : **145 hors allowlist sur 35 des 38 tables** — dont `condition_ref`/`diet_ref` sur la table qui promet « exported in full » | 05:10 CEST — **126/126 tables classées**, **0 colonne muette** sur 39 tables. Archive **réelle** : 2 libellés du maître, **0 de l'autre bouche**. Purge « je pars » → **0 ligne** ; « détachement » → **1** *(décision)*. Gate vert aux 2 commits | **2 seuils sur 3.** ① ✅ **le test a ROUGI 3 fois** ② ✅ **2/2** ③ ⛔ **byte-identique MANQUÉ : 19 lignes de diff** — 3 clés neuves **vides**, 5 `null` ; **zéro ligne d'un compte sans foyer ne change**. **Le seuil était inatteignable, pas la mesure.** **4 mutations, 4 rouges** | ⛔ **① LE SEUL FILET RGPD ÉTAIT INEXÉCUTABLE DEPUIS LE 2026-08-03.** Une liste à la main se périme de **TROIS** façons, et la 3ᵉ n'est attrapée par aucune des deux autres : **la table existe, sa COLONNE DE PROPRIÉTAIRE non** (`meal_ideas.student_id`, droppée le 2026-08-04). **Réparer l'arme a RESSUSCITÉ le filet — il ne rougissait pas, il ne PARTAIT pas.** ⛔ **② La cicatrice par colonne fait 145, pas 2** — dont la **maladie** et le **régime** déclarés, sur la table qui promet l'export intégral. ⛔ **③ LA SYMÉTRIE ÉTAIT LE PIÈGE** : effacer l'allergie d'une bouche **détachée** aurait retiré la ceinture du foyer **en silence**. **Un geste de vie privée n'a pas le droit de produire une régression de sécurité.** ⚠️ ④ `FF-056` était « bloquée » depuis le 11-08 — raccordée. ⚠️ ⑤ **37 tables de dette NOMMÉE** ⇒ `S5-a`. ⚠️ ⑥ **l'export coach n'a pas ses convictions** ⇒ `S5-b` |
| 2026-08-22 | 1 · V0-C-quater | 02:17:59 UTC — `regime_belt` de `3c781a71` = `{mouths:1, checked:12, …}` ✅ *(reproduit)* · compteur #7 **0/14** ✅ · Malo `vegan` **seul déclaré**, Camille **à compte** avec **0 ligne `student_safety_constraints`** | 02:26:10 → 02:27:16 UTC — **HTTP 200 en 66,25 s**, plan `66de9046`. `regime_belt.mouths` = **2** · #7 **0/14 → 1/15**. **1 GÉNÉRATION** *(`gpt-5.6-luna`, **20 976 tokens**)* | **SEUIL ③ ATTEINT** — et ⛔ **tenu À VIDE** : `checked = 0` parce que **le modèle n'a écrit AUCUNE boîte** ; `checked = kept + refused` est **tautologique** ici | ⛔ **① Le piège était PLUS DUR qu'écrit** : écrire sur Camille n'aurait pas été un no-op muet — **la RPC REFUSE** (`has_account`, mesuré). ⛔ **② `dietDiverges` EST GATÉ PAR L'OBJECTIF, PAS PAR LE RÉGIME** : `regimes: 2` mais `diverging: [Anouk]` — **Yanis, porteur du second régime, ne diverge pas**, et Anouk, qui diverge, **n'a aucun régime**. `REGIME_PROTEIN_CEILING = full` ⇒ **seul `muscle_gain` franchit**. ⇒ ⛔ **la fin de vague 5 est HORS D'ATTEINTE de cette fixture** : il y faudrait un `muscle_gain` sur une bouche MAJEURE. ⛔ **③ LES BOÎTES SONT UN TIRAGE** : à prompt **IDENTIQUE**, `boxes` **38 → 0**, `declared` **18 → 0**, `box_sizing.anchor` **tout à zéro** ⇒ **le seuil ② de `V0-D` NE SE REPRODUIT PAS**, et `mouths_unboxed: 0` est un **FAUX ZÉRO** ⇒ fiche `L6′-b`. ⛔ **④ Le run a TRONQUÉ `3c781a71` de 7 j à 1 j** ⇒ `V0-C-quinquies` |
| 2026-08-22 | 1 · H1+H2 | 04:16 CEST — `grep -c vitest` → **0** ; tests dans le programme `tsc` → **0 / 112** *(449 fichiers lus)* ; `deno check` → 3 entrées, **0 des 2 lanes**. ⛔ **La mesure qui décide** : **1 788 tests / 112 fichiers, 4 rouges** *(3 runs identiques)* et **92 erreurs de typecheck / 25 fichiers** — **aucun de ce lot**, et **13 des 25 fichiers sont PROPRES à HEAD** | 04:45 CEST — `grep -c vitest` → **10** ; `vitest — 1788 tests, 4 rouges, 4 tolérés, 0 hors liste` ; `112 fichiers lus, 92 erreurs (liste: 92)` ; `deno check` porte **5 entrées, les 2 lanes comprises** *(gate 1 min 50 → 2 min 30)* | **les 3 seuils ATTEINTS**, et ⛔ **l'ARME tirée TROIS fois**, dont **une 3ᵉ erreur dans un fichier qui en tolère 2** ⇒ `rc=1` — **la liste est une BORNE par fichier, pas une permission**. Commit `6af2d67a` | ⛔ **① Le seuil « 44/44 · 673 » était PÉRIMÉ DE 2,7×** : la vraie cible est **112/112 · 1 788**, et `S6` l'avait mesuré sans que le plan le suive. ⛔ **② La clé dupliquée n'était PAS « passée à travers » — elle n'a JAMAIS été regardée.** Le verbe change le défaut, et le second est pire. ⛔ **③ Un gate qui « rapporte sans bloquer » NE PEUT PAS ÊTRE ARMÉ** — c'est la voie B littérale, et elle aurait livré une garde muette de plus. La sortie est une liste **nominative**, pas un drapeau. ⛔ **④ Un glob de test dans un commentaire de bloc JSON referme le commentaire** — 10 erreurs de syntaxe **indiscernables d'erreurs de code**. ⛔ **⑤ `L6′` N'EST PAS bloqué par `environment: node`** — `BoxTable` n'a aucun portail et est **déjà monté**. **Ce qui est bloqué, c'est le PORTAIL**, et le code le documentait déjà ⇒ fiche `H4`. ⚠️ ⑥ **le disque est à 297 Mio** : un `git worktree add` a échoué |
| 2026-08-22 | 2 · **L17-0** | 11:21-11:23 CEST — lignes d'ingrédient ~~9 810~~ **10 053** *(6 851 plats + 3 202 préparations)*, `group` **0**, `->>'group' is not null` **0** · plans `meal.*.v16+` ~~1 / 180~~ **3 / 182** · `0a02b706` = **25 / 25 / 0** ✅ *(reproduit)*, et les deux plans neufs **134 / 124 / 10** et **83 / 83 / 0** ⇒ ⛔ **242 déclarés, 232 valides, 0 persisté** · clés persistées **7, sans `group`** ✅ | 11:42 CEST — ⛔ **AUCUNE GÉNÉRATION** *(budget nul)*. Banc code↔base : la charge du **vrai chemin** (`parseGeneratedMeal` → `mealDishesPayload`/`mealPreparationsPayload`) passée à la **requête exacte** de la `mesure APRÈS` rend `declared 5 · valid 4 · refused 1 · **persisted 4** · lines 5 · lignes_avec_groupe 4 · écarts **0 / 0**` ⇒ **`OK`**. La même requête sur la charge d'AVANT rend **`ECHEC`** et `ecart_base_vs_compteur -4`. Suite keel **4 159 / 0**, `deno check` des 2 lanes **rc=0** | **seuil de banc ATTEINT (4/4), seuil de RUN en attente** — le plan neuf appartient au run groupé, la requête est écrite dans la fiche. **Mutation prouvée 5 fois** *(non muté 16/16 d'abord)* : clé retirée **4 rouges** · `persisted` cloué à `valid` **5 rouges** · compteur sans vocabulaire fermé **2 rouges** · parseur sans refus **1 rouge** · préparations hors compteur **5 rouges** ; copie restaurée **16/16**. ⚠️ **Gate : PASSE au commit** *(keel **4 160/0**, vitest 1 788 — 4 rouges tolérés, 0 hors liste —, `deno check` des 2 lanes `rc=0`, `eslint` sans objet : **0 fichier frontend dans ce lot**)*. Lancé **à la main sur tout l'arbre** il rougit sur **28 erreurs eslint / 8 fichiers frontend d'autres sessions** *(SetupPage, MouthFormDialog, HouseholdPage, MealBuilder, StudentWeekPlanPage + 3 tests)* — **aucune de ce lot**, et le message du commit dit « reste rouge » sans cette nuance *(corrigé ici, jamais réécrit — §⑨ n° 39)*. ⚠️ **Et le commit du plan a emporté les éditions concurrentes de `L19b`** : le fichier est partagé, `git commit -- <chemin>` prend l'arbre de travail. Rien n'est perdu, mais l'attribution l'est | ⛔ **① LE ZÉRO ÉTAIT UN ZÉRO D'ÉCRITURE, PAS DE DÉSOBÉISSANCE.** Le modèle a obéi **3 fois sur 3**, et une recopie de dix lignes jetait sa réponse entre le parseur et la RPC. **Personne ne comptait ce qui ARRIVAIT.** ⛔ **② Pas de jumeau côté foyer** — `ingredientPayload` est l'écrivain unique *(`grams_raw` : 1 occurrence d'écriture ; `applyHouseRuleLock` étale ; `household_portions.ts` n'écrit aucun ingrédient)*. ⚠️ **③ `regime_belt` n'est persisté que par la lane FOYER**, et sous `generated_from.household` — la lane solo n'en gardait rien. `food_groups` est posé à la **RACINE des deux lanes**. ⛔ **④ La clé écrite même à `null` RETOURNE la mesure d'avant** : `ing ? 'group'` devient vrai partout ⇒ toute requête héritée *(dont celle de `L17`)* doit passer à `ing->>'group' is not null`. ⛔ **⑤ `L17` cherche `food_group_ref` ; la clé s'appelle `group`** — et `shopping_list[].food_group` existe déjà, **résolu depuis le référentiel**, donc ce n'est pas la même chose. Deux provenances, deux noms. ⛔ **⑥ Le seuil peut être atteint À VIDE** : le bloc de consigne reste **conditionnel** *(G2 non livrée)*, et 75,6 % des plans n'ont aucun régime ⇒ **le run groupé doit viser une fixture portant un régime**, ce que le verdict SQL exige. |
| 2026-08-22 | 2 · **L19b** | 11:21:57 CEST — les 150 paires : `EN 150 100.0 %` · **`FR 124 82.7 %`** · `ÉCART 26 aliments, 17.3 points`, **les trois reproduits au chiffre près**. `pain complet grille` → `white_bread` *(refined_grain, 278, `unit_grams=35`)* — **7 occurrences** · `wraps` ×19 + `wrap` ×1 → `white_bread`, **20 occurrences** ⇒ « 2 wraps » = **70 g au lieu de 120**. Réductions qui changent l'aliment **38** *(dont **5** de `complet`, pas 38)* · alias morts **210, dont 19 CONTRADICTOIRES** *(191 inoffensifs)* | 11:34:06 CEST — **FR 147/150 (98,0 %)** · **EN 150/150** · **écart 2,0 points** · alias contradictoires **19 → 0** · les 5 épreuves rejouées **86/86 et 9/9**. Corpus entier (827 chaînes, 10 038 lignes) : **637 → 651** distinctes, **9 545 → 9 590** occurrences, ⛔ **0 PERDUE** | **LES TROIS SEUILS ATTEINTS** *(≥ 145 · = 150 · ≤ 4 pts)*. **11 mutations, 11 rouges** *(7 Deno + 4 SQL, dont la CARDINALITÉ)*, copie non mutée vérifiée d'abord sur les deux bancs. Suite keel **4 160 / 0**. Commit `bd4bf452`, **24 fichiers** — ⛔ **le volet ① (`food_composition.ts`) NON commité, exprès** | ⛔ **① LES 26 ÉCHECS FRANÇAIS N'ÉTAIENT PAS 26 TROUS DE TRADUCTION** : sur les 3 restants, **2 atteignent une ligne JUMELLE du même aliment** — `oeuf`→`whole_eggs` *(140)* contre `egg` *(140)*, `yaourt`→`plain_yogurt` *(59)* contre `yoghurt` *(56,8)*. **Le référentiel porte des DOUBLONS et l'épreuve les compte comme de la langue** ⇒ fiche neuve **`L19c`**. ⛔ **② LE COMPTEUR DES RÉDUCTIONS DANGEREUSES MONTE PENDANT QU'ON RÉPARE** — 38 → 33 à univers constant, **35 publié**, parce que les 86 noms neufs sont eux-mêmes éprouvés *(3 312 → 3 398)*. Les deux nouveaux atteignaient **déjà** le mauvais aliment ; l'alias les **corrige**. **Un compteur sans son dénominateur est indiscernable d'une régression.** ⛔ **③ LES 19 ALIAS MORTS NE CHANGENT RIEN AUJOURD'HUI, ET C'EST POUR ÇA QU'ILS DEVAIENT PARTIR** : la ligne atteinte est la ligne EXACTE, c'est la DÉCLARATION qui ment (`vegetable stock` disait **240 kcal**, la ligne atteinte en porte **4**). Le retrait n'est pas un correctif de calcul, c'est le retrait de **la seconde vérité** que le premier qui inverse l'ordre de consultation ferait sortir sur 19 aliments d'un coup. ⛔ **④ LE MUR §⑨ n° 15 A MORDU DEUX FOIS** : `CompositionRef` porte **19 champs dans l'arbre contre 17 à HEAD** — un test neuf qui en construit un **ne type-checke dans AUCUN des deux mondes**, et `deno test` type-vérifie **tout le répertoire**, donc un rouge de TYPE aurait emporté le banc de **tous les autres lots**. ⚠️ **⑤ UNE GARDE À TROIS QUARTS ARMÉE RESSEMBLE À UNE GARDE ARMÉE** : avec 2 cas, remettre `completes` **seul** passait **VERT** — 3 graphies sur 4 n'étaient tenues par rien. **C'est la mutation qui a écrit le 3ᵉ cas.** ⚠️ **⑥ Le lot est vendu comme un lot de FRANÇAIS ; sa plus grosse morsure est ANGLAISE** — `wraps` ×19 quittent `white_bread` *(35 g = UNE TRANCHE)* pour `tortilla_wrap` *(60 g)* |


## ⟳ CLÔTURE DE LA VAGUE 0 — **2026-08-22**

> §⑦ : *« Une vague n'est PAS close sans ces trois choses. »* Les voici.

### ① La sortie datée de `V0-E′` relancée, archivée côte à côte

`scratchpad/2026-08-21-2312-V0E-tableau-de-bord.txt` *(avant)* et
`scratchpad/2026-08-21-2355-V0D-V0E-tableau-de-bord-APRES.txt` *(après)*. **Rejouée trois fois par le vérificateur, `diff` vide hors horodatage.**

```
#1   0 / 180                  →  1 / 181       ⬆️  LE PREMIER PLAN À BOÎTES
#2   n'existe pas             →  n'existe pas      (lot L2-lang, vague 2)
#3   foyer 93,6 % solo 36,4 % →  93,6 %  /  —      le plan neuf : 272/290 = 93,8 %
#4   1 821 plats              →  1 857          ⚠️ dont 14 unknown_ingredient neufs = 38,9 % contre 24,4 % au corpus
#5   0/180 portent une valeur →  1 / 181        ⬆️  la vue rend sa 1re ligne, unknowns_median 3
#6   1 / 24 / 18 sur 43       →  5 / 24 / 18 sur 47   (déplacé par V0-C, pas par V0-D)
#7   0 / 13                   →  0 / 14         ⬇️  UN PLAN DE PLUS QUI ÉCHOUE
#8   181 / 340  (53,2 %)      →  181 / 344 (52,6 %)  ⬇️  ET C'EST UNE RÉUSSITE — voir V0-E′-ter
#9   6 non couvertes / 58     →  inchangé
#10  25 / 88 · 1 193 / 1 312  →  25 / 92 · 1 193 / 1 313   (déplacé par V0-C)
```

### ② La vérification en conditions réelles, avec sa preuve — **une ligne en base, pas un test**

**Plan `3c781a71-da7c-4abe-8a99-4a6ed7445c99`**, `student_generated_meals`, écrit le 2026-08-21 à 21:52:37 UTC.
**38 boîtes sur 24 plats**, `box_sizing.anchor` présent, sas à 3 lignes, `composition_unknowns = 3` avec `measured: true`.
⛔ **Six mécanismes sur sept ont produit leur première ligne** ; le septième — la ceinture à plusieurs bouches — **ne pouvait pas**, faute d'un second régime déclaré.

### ③ Ce que la vague a RÉVÉLÉ, et qui n'était pas prévu

| | |
|---|---|
| **Le cœur du calcul n'était pas versionné** | `mouth_anchor.ts` et `mouth_energy.ts` étaient `??`. Et la preuve qui a fixé le périmètre **confondait *suivi* et *commité*** — un `grep` sur l'arbre de travail ne dit **rien** de HEAD |
| ⛔ **Le compteur de budget était aveugle** | `operation_family = 'plan_generation'` comptait **1 appel sur 108**. Il aurait rapporté *« 0 génération dépensée »* après dix |
| ⛔ **Le timeout n'avait pas besoin d'être relevé** | Les 110 s ne contraignent pas les générateurs *(300 s en vigueur, médiane 66 s)*. **Le plan portait un fait que le correctif du 2026-08-19 avait lui-même périmé** |
| ⛔ **Quatre chiffres du plan ne se reproduisent pas** | `80,1 % / 7,8 %` **sous aucune des six définitions** — mesuré **93,6 / 36,4**. Et le « 7,8 » est le chiffre voisin de `L-1` |
| ⛔ **Et 47 % du « pesé » du solo est une CONVENTION** | hors convention : **19,3 %**. Tout seuil de vague 2 sur « le modèle écrit ses quantités » se cale là, **pas sur 36,4** |
| ⛔ **`S4` ne ferme pas une brèche : il CRÉE la garde, sur quatre surfaces** | quatre ordres mesurés, **quatre `ok:true`**, dont une cible de 40 kg à 0,5 kg/sem sur une enfant de 15 ans. `target_not_for_minor` **n'a jamais existé** |
| ⛔ **Le `null` a trois visages** | `not null` = `null` · `greatest(0, null)` = `0` · **et la sonde qui n'existe pas, qui fait disparaître une ligne d'un tableau sans laisser de trace** |
| ⛔ **La lane foyer exige un coach** | `no_coach` (409). Le *« pivot foyer B2C »* ne compose pas sans coach — et la doctrine servie est celle de la maison, **sans variante par objectif** |
| ⛔ **La mineure est servie deux fois, 12/12** | et **l'interdiction était DÉJÀ dans le brief servi** : c'est une désobéissance de **modèle**, il faut une **arête**, pas une phrase |
| ⛔ **La bouche en `fat_loss` n'a aucun bac pesé** | c'est **le seuil que `L6′` croit tenir** |
| ⚠️ **Trois vérifications ont réfuté leur propre lot** | `V0-A` *(l'arme ne discriminait pas)*, `V0-B` *(la porte aveugle au `null`)*, `V0-D` *(trois conclusions fausses)*. **Le second agent adversarial n'est pas une formalité : il a corrigé un lot sur deux** |

### ④ Le dépensé réel — **c'est lui qui ouvre le plafond suivant**

| | plafond | **dépensé réel** |
|---|---:|---:|
| **vague 0** | 3 | ⛔ **1 génération** · **26 906 tokens** + 623 de secours |

⛔ **Et le §⑩ sous-estimait d'un facteur 2,07** — il annonçait *« ~13 000 par génération »*.
⇒ **Les plafonds des vagues suivantes se posent sur 26 900 tokens/génération, pas sur 13 000.**

### ⑤ Ce qui reste ouvert en sortant de la vague 0

- ⛔ **`V0-A-bis`** — un checkout propre **ne compile pas**. Portée mesurée : six fichiers non commités, dont `en.ts`/`fr.ts`. **Appartient au propriétaire**, pas à l'exécutant.
- ⛔ **Le seuil ③ de `V0-D` reste MANQUÉ** — mais il est **atteignable** : `V0-C-quater` passe de « fatalité » à « petit lot de fixture + 1 génération », **à imputer au plafond de la vague 1**.
- **Sept fiches neuves** attendent leur vague : `V0-C-ter` *(fermée)*, `V0-C-quater`, `L26-0`, `L6′-a`, `Q-G19-a`, `L-anchor-nodelivery`, `V0-E′-ter`.



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
| ~~**1**~~ | ⟳ ⛔ **RÉFUTÉE le 2026-08-21 par la vérification adversariale — la prémisse était fausse.** ~~L'ARME de `V0-A` est déclarée MANQUÉE côté front, ATTEINTE côté back… l'arme est bloquée par une règle du dépôt, pas par le lot~~ | `V0-A` | ⛔ **Les deux moitiés sont tombées.** ① Le `deno check` **rc=0** déclaré « atteint côté back » rend **rc=0 aussi sur le commit PARENT**, sans aucun des 22 : il ne discriminait rien, parce que la version **commitée** de la lane foyer n'importe aucun des 22. Visés directement, **4 des 6 modules back échouent**. ② `tsc -b --force` sur le commit **parent** rend **rc=0, zéro erreur** : **avant `V0-A` le checkout propre compilait**. ⇒ ce n'est pas une règle du dépôt qui bloque, **c'est `V0-A` qui a cassé le checkout**, en commitant deux fichiers front qui nomment des symboles non commités. ⟳ **CE QUI EST DÉCIDÉ À LA PLACE, et qui tient** : `V0-A` **n'est ni reverté ni élargi**. Reverter dés-versionnerait `mouth_anchor.ts` et `mouth_energy.ts` — le sujet même du plan, sauvegardés nulle part — pour rendre un clone qui compile **mais n'a plus de moteur** ; **aucun des deux états n'est « reproductible », un seul protège le code d'une perte**. Élargir toucherait six fichiers d'autres sessions et `en.ts`/`fr.ts`, **hors délégation**. `V0-A` est marqué **NON FINI** au journal, et **il ne bloque rien** : `V0-B`, `V0-C`, `V0-E′`, `V0-D` travaillent sur l'arbre de travail et la base vivante, jamais sur HEAD | **un `git revert 3ab1dc83`** — et il rendrait un HEAD qui compile **au prix de dés-versionner le cœur du calcul**. ⚠️ **Le vrai coût du retour arrière n'est pas le revert : c'est que la question « le dépôt doit-il redevenir clonable ? » resterait sans réponse.** Elle est portée par `V0-A-bis`, **et elle appartient au propriétaire** | |
| **2** | **`??` cesse d'être un seuil.** Le seuil de `V0-A` est **22/22 par `git ls-files --error-unmatch`**, plus `M ≥ 168` | `V0-A` | Mesuré : `??` est passé de 142 (plan) à 144 (lancement) en une nuit, **et a gagné +1 pendant les cinq minutes du lot** — le dépôt est partagé et d'autres sessions y écrivent en direct. Un seuil qu'une session voisine peut faire échouer **n'est pas un seuil** | **gratuit** — c'est une règle de lecture du journal, pas un changement de code. Le chiffre brut reste écrit à côté | |
| **3** | ⛔ **PORTE G2 FERMÉE : le bloc de déclaration de groupe devient inconditionnel.** Mais ⚠️ **ça ne suffit pas, et la fiche `L17` doit le savoir** — fiche neuve `L17-0` | `Q-G2` | Le coût a été **mesuré**, c'est ce qui manquait pour trancher : **2 rouges sur 6 164 tests**, les deux portant sur la conditionnalité elle-même et **aucun sur un comportement** · **968 car. ≈ 242 tokens**, soit 3 à 5 % d'un prompt réel, et **dans le préfixe cachable** (donc une invalidation de cache unique, pas 242 tokens par appel) · **0 migration**. La position écrite du dépôt — *« une garde à trou n'est pas une garde »* — penchait déjà vers oui. **Élargir une garde est délégué** | **un commit** — remettre le bloc sous `dietaryRegimePromptLine` et re-verdir 2 tests. Aucune migration, aucune donnée, aucun effet rétroactif sur les plans déjà persistés | |
| **4** | ⛔ **La ceinture de sortie `strict` s'élargit aux TROIS points d'entrée**, chat compris — pas aux seuls générateurs. Et `S2` gagne une **contrainte d'implémentation** : un **second texte de repli** | `Q-S2` | Le seuil était **écrit d'avance dans la fiche** (*« si > 5 % des tours mordent, la porte se referme sur les générateurs seuls »*) : mesuré à **0,12 %**, majorant **1,97 %** — 41× sous le seuil. L'argument « ça ferait trop mordre le chat » **ne tient pas**. Et `allergen_bridge.ts:76` porte **déjà** `{medical, strict}` : refuser l'élargissement **laisserait deux copies diverger**. **Élargir une garde est délégué** | **un commit** — remettre `if (constraint.severity !== "medical") continue;` à `safety_constraints.ts:591`. ⚠️ **Mais le retour arrière n'est gratuit que TANT QUE le second repli n'a pas été vu par un utilisateur** : une fois qu'une intolérance a reçu une réponse adaptée, la lui retirer est visible | |
| **5** | **L'orchestrateur tient seul §⑨ et §⑩.** Les sous-agents rendent leur ligne de journal et leur fiche ; ils n'écrivent pas dans le registre | *processus* | §⑦ demande que la fiche et le journal partent **dans le commit du code**. Mais **tout lot touche ce document**, donc sous une lecture stricte de « jamais deux lots sur un même fichier » **aucun lot ne peut être parallèle**. Les écritures du document sont donc **sérialisées par l'orchestrateur**, et le commit du code emporte la fiche | **gratuit** — une règle de conduite. Revenir dessus, c'est laisser chaque sous-agent écrire, au prix de conflits sur ce fichier | |
| **6** | ⛔ **La commande de comptage du budget est REMPLACÉE.** Le plafond se compte sur `source`, pas sur `operation_family` | *orchestrateur, avant `V0-D`* | `operation_family = 'plan_generation'` **a cessé d'être écrit le 2026-08-13** ; les 107 appels des modèles de génération sont sous `'other'`, la valeur par défaut. La requête du plan **aurait rapporté « 0 génération dépensée » après dix générations réelles**. `source` sépare exactement l'unité que le budget demande : `generate-*-v1` = une GÉNÉRATION, `generate-*-v1.<suffixe>` = une relance | **gratuit** — c'est une requête de lecture, elle ne touche ni code ni base. Revenir dessus, c'est reprendre un compteur dont on a mesuré qu'il compte 1 sur 108. ⚠️ **Le vrai coût du retour arrière serait d'avoir dépensé sans le voir** | |
| **7** | ⛔ **Le timeout n'est PAS relevé — parce qu'il a été mesuré et qu'il n'a pas besoin de l'être.** Les trois horloges du §⑩ sont corrigées | *orchestrateur, avant `V0-D`* | Le protocole imposé est : mesurer, comparer, relever **seulement si** la médiane dépasse. Fait, **avant** tout run. `gemini.ts:248-251` : les 110 s ne s'appliquent **que** si `meta.httpTimeoutMs` est absent — or les deux lanes passent `PLAN_HTTP_TIMEOUT_MS` = **300 s** depuis le correctif du 2026-08-19. Médiane mesurée **66 s** (foyer) et **133 s** (solo), max **210 s**. ⇒ **rien ne contraint, le geste n° 3 n'est pas déclenché.** Le plan et le commentaire du code portaient un fait que le correctif avait périmé | **gratuit** — aucune constante n'a été touchée, c'est une décision de **ne pas** agir. Si `V0-D` expire malgré tout, la cause est ailleurs (worker à 400 s, ou runtime edge), et **relever `GEMINI_HTTP_TIMEOUT_MS` ne réparerait rien** | |
| **8** | **`drop not null` entre dans le geste de `V0-B`, et le trigger `updated_at` est désactivé autour du seul `update`** | `V0-B` | ① La fiche ne nommait que `drop default` — mais les deux colonnes étaient **`not null`**, et l'`update … = null` **échouait**. Sans `drop not null`, le lot ne peut pas exister. ② Le trigger réécrit `updated_at` **sans condition** : **152 des 180 lignes** portent un `updated_at` distinct de `created_at`, **et il sort dans l'export RGPD**. L'écraser aurait été une perte **irréversible**, hors périmètre délégué ; la désactivation ciblée, dans la même transaction, est réversible. **Vérifié après coup : `updated_at` intact au bit près** (min/max et les 152 `differs` identiques) | **un `update` inverse** pour les données — la commande exacte est dans la fiche `V0-B` et elle porte `and composition_unknowns is null`, pour ne pas écraser un plan réellement mesuré si `V0-D` a déjà tourné — **plus un commit** pour le schéma. `updated_at` n'a pas bougé : rien à restaurer de ce côté | |
| **9** | ⛔ **Le compte maître de la fixture est un compte NEUF** — `fixture.v0c.master@keeltest.dev`, créé par l'API admin GoTrue *(convention déjà commitée : `scripts/run_memory_v2_action_e2e.mjs:117`)* | `V0-C` | **Aucun compte libre n'existait.** Les 5 personas documentés (`tests/real-personas/{paul,alex,eva,nina,rose}/connection.json`) rendent **0 ligne** dans `auth.users` ; les **17** comptes `keeltest.dev` sans foyer appartiennent tous à un scénario QA du 2026-08-18, et y attacher un foyer aurait **contaminé la mesure d'une autre session** | **quasi nul** — un compte local, une ligne `profiles`, un foyer, 4 bouches, 1 allergie ; rien d'autre ne les référence. ⚠️ **Le vrai coût du choix inverse aurait été de fausser un banc QA voisin sans que personne le voie** | |
| **10** | ⛔ **La langue du foyer est ÉCRITE (`fr-FR`), pas héritée du défaut** — et surchargeable par `FIXTURE_LOCALE` | `V0-C` | `profiles.locale` vaut `fr-FR` **par défaut en base**, et `generate-household-meal-v1:1235` en fait **LA** langue du plan *(pas `student_goals.content_locale`)*. Une fixture qui ne l'écrit pas mesure une colonne en croyant mesurer un choix — c'est la cicatrice *« fixture qui ne l'écrit pas = faux défaut de langue »*. Le libellé d'allergie étant français *(« arachide », ce que le maître tape)*, `fr-FR` est cohérent | **gratuit** — une variable d'environnement à l'invocation. ⚠️ **Mais le choix n'est PAS neutre pour `V0-D`** : le référentiel est mesuré **17,3 points moins profond en français**. Si `V0-D` sort une couverture basse, **essayer `FIXTURE_LOCALE=en-GB` AVANT d'incriminer le moteur** | |
| **11** | ⛔ **Le mineur de la fixture porte `muscle_gain`, pas `fat_loss`, et n'a PAS de cible chiffrée** | `V0-C` | `weighedPortionMembers` ne lit que `goal` : une cible sur une enfant serait **une surface de plus sans rien exercer de plus**. Et la base compte déjà **deux** mineurs en `fat_loss` — en ajouter un troisième aurait déplacé la `mesure AVANT` de `S4` sans contrepartie | **gratuit** — deux appels RPC. ⚠️ La `mesure AVANT` de `S4` passe quand même de **2 à 3**, et **la 3ᵉ est la fixture, pas une personne** : `S4` ne doit pas la migrer avec les deux autres | |
| **12** | ⛔ **La fixture porte 4 corps et la ligne `student_goals` du maître, AU-DELÀ des six conditions** | `V0-C` | Sans la ligne d'objectif, `generate-household-meal-v1:1567-1579` rend **`goal_required` (409)** et `V0-D` **ne démarre pas**. ⟳ ⚠️ **CORRIGÉ par la vérification adversariale — la justification des 4 corps était fausse sur son mécanisme.** ~~Sans les 4 corps, `householdAppetite` rend `null` et `V0-D` mesurerait le repli sur le compte de têtes~~ : le tout-ou-rien de `householdAppetite` (`household_portions.ts:2399-2426`) est **réel**, mais **son unique appelant vivant ne fait que le JOURNALISER** — `index.ts:5398`, tag `keel.household_meal.table_appetite`, littéralement `steering: false`. **Il n'y a aucun repli : le compte de têtes (`presence.servings`) est le seul dimensionneur, avec ou sans corps.** ⟳ **Les 4 corps restent porteurs, mais par un AUTRE chemin** : `bodyShareFactors` (`index.ts:2168`) → `weightGroupCount` → `promptWeightGroups`, *« le seul résultat du moteur qui entre dans le prompt »* | **gratuit** — RPC idempotentes et un `upsert` `ignoreDuplicates`. Les retirer ne libère rien et casse `V0-D` | |
| **13** | ⛔ **Le livrable de `V0-E′` est UN PILOTE + deux fichiers, pas un seul fichier SQL.** La commande unique est `scripts/keel_v0e_tableau_de_bord_20260821.sh` | `V0-E′` | #3 et #4 exigent la normalisation des termes, les alias, les classes de rendement, les masses conventionnelles de condiment **et le pliage au prorata**. Les écrire en SQL, ce serait **un second moteur de résolution** — la faute que ce dépôt paie en boucle. Le pilote extrait, lance Deno, lance le SQL, fusionne et trie : une commande, dix lignes | **gratuit** — trois fichiers à supprimer. Revenir dessus, c'est **soit perdre #3 et #4, soit les maquiller en SQL approché** | |
| **14** | **Les trois lecteurs d'entrée de `meal-energy-v1` sont RECOPIÉS mot pour mot** — et c'est écrit dans l'en-tête du fichier | `V0-E′` | `readIngredient`/`readDishes`/`readPreparations` ne sont **pas exportés**, et leur module **ouvre un serveur au chargement**. Ce sont des **adaptateurs d'entrée**, pas le résolveur : l'interdit *« jamais une copie »* vise `food_composition.ts` et `plan_energy.ts`, qui sont bien **importés** | **un petit lot** : les exporter depuis `meal-energy-v1` et les importer ici. ⚠️ ⛔ **Le vrai coût du retour arrière est de NE RIEN FAIRE** : le jour où la production change son lecteur, le tableau de bord mesurera autre chose que le produit, **sans rien casser** | |
| **15** | **Le correctif des deux lanes est LIVRÉ DANS L'ARBRE DE TRAVAIL, pas dans l'histoire — et un module partagé neuf entre dans le commit** | `V0-B-bis` | ① Les deux `index.ts` sont `M` avec **+289/−24** et **+1305/−70** de travail non commité appartenant au chantier lot 18 **et à d'autres sessions** ; les commiter emporterait **~1 540 lignes hors délégation**. L'arbre de travail est **ce que `functions serve` exécute** : le correctif est vivant pour `V0-D` sans commit. ② **Le défaut était le MÊME à la virgule près dans les deux lanes** — le réparer deux fois, c'est accepter qu'une troisième lane le réintroduise. L'issue nommée (`CompositionFillOutcome`, `fillPlanComposition`, `compositionFillColumns`) est donc posée dans `composition_fill_io.ts`, **fichier suivi et propre**, donc commitable **sans emporter personne**. ③ Le `catch` muet devient un **compteur** : un `console.warn` ne se groupe pas, et un remplissage qui lève en boucle **ressemblait à un remplissage qui marche** | **un `git checkout` des deux `index.ts`** — et il **perd tout le chantier lot 18**, pas seulement ce lot. ⚠️ ⛔ **Le vrai coût du retour arrière est ailleurs : tant que ces deux fichiers ne sont pas commités, le correctif n'existe que sur ce disque**, et le premier `clone` réécrit `0`/`{}`. Côté base, la migration se défait par un `create or replace function` — **gratuit tant qu'aucun plan `null` n'a été écrit, et DESTRUCTEUR après** : les plans non mesurés redeviendraient indiscernables des plans mesurés à zéro | |
| **16** | **Le pied de page garde le mot « dix » au bit près — il n'est plus une AFFIRMATION mais un point INATTEIGNABLE si le compte n'est pas 10** | `V0-E′-bis` | ⛔ **La fiche demandait deux choses incompatibles** *(orchestrateur : c'est mon erreur de rédaction)* : « que le pied de page cesse d'affirmer un nombre qu'il ne compte pas » **et** « corps identique au bit près ». La ligne `FIN` **est dans ce corps**. ⇒ **le critère qui tranche est la réversibilité** : casser `dd6ea3420c25ec2b5120eee37f55a3be` aurait été **irréversible sans réécrire l'archive** — et c'est ce hash qui referme **chaque vague** ; garder le mot s'annule **en une ligne**, et cette ligne est **nommée dans le fichier** | **une ligne** : `printf 'FIN — dix lignes…'` → `printf 'FIN — %s lignes…' "$N"`. ⚠️ **Et il faut alors RÉARCHIVER le `md5` de référence**, sinon toutes les clôtures de vague suivantes compareront à un hash périmé | |
| **17** | ⛔ **`intent: "commit"` N'EXISTE PAS. Le mot retenu est `prepare_next`.** | `V0-D` | La lane n'accepte que `replace_current`, `prepare_next`, `draft` (`index.ts:1076-1092`). **« Commit » est une INTENTION du plan, pas un jeton du produit** — et le plan l'écrit comme s'il était littéral : un exécutant qui l'envoie tel quel reçoit `unknown_intent`. `replace_current` est refusé (`replaces_required`, 400) tant que la fixture n'a aucun plan vivant ⇒ **`prepare_next` est le SEUL mot qui écrit sur un foyer neuf**, et il écrit. ⛔ `draft` reste interdit : il ne persiste pas `generated_from` | **gratuit** — un mot dans une requête. ⚠️ **Le vrai coût du choix inverse aurait été de brûler une génération sur un 400** | |
| **18** | ⛔ **La fixture est RATTACHÉE AU COACH MAISON, par la RPC du produit `keel_join_house_coach('FR')`** | `V0-D` | **`V0-D` était BLOQUÉ** par `no_coach` (409). Trois chemins, deux écartés : ① un `insert` direct dans `coach_clients` — **exactement ce que le `risque` de `V0-C` interdit** ; ② un coach humain existant — **contaminerait le registre de sièges d'une autre session** *(cicatrice de la décision n° 9)* ; ③ **la porte d'inscription libre** (`StartPage.tsx:415`), sous le **jeton du maître**, sous RLS : le chemin nominal d'un foyer sans coach. **Vérifié après coup, et c'était le risque** : le moteur **n'écrase ni `locale` ni `country`** *(la ligne `locale='en-US'` a été retirée de `keel_attach_student_to_coach`)* — `fr-FR` et `FR` intacts, **décision n° 10 tenue** | **deux `update`** : `coach_clients → 'ended'`, `plan_versions → 'superseded'`. ⚠️ **Ils RECASSENT `V0-D` et la vérification de fin de CHAQUE vague.** ⛔ **Et le vrai coût est ailleurs : la doctrine servie est celle de la MAISON** — 6 croyances génériques, `foods` **vide**, **`table_scope_beliefs: 0`** alors que la table porte `fat_loss` + `muscle_gain`. **Toute mesure de vague sur cette fixture mesure un foyer SANS opinion de coach**, et il faut le savoir avant de lire un grammage | |
| **19** | **La fenêtre est `{kind:"days", count:7}`, pas le `until_sunday` du front** | `V0-D` | `until_sunday` un vendredi rend **3 jours**. Sept jours couvrent **le mercredi** *(Yanis absent midi ET soir)* et **le samedi** *(il dîne dehors)* — **les deux formes de l'absence partielle**, la 5ᵉ condition de la fixture — et donnent **24 couples bouche-jour** à l'ancrage au lieu de 12, ce dont `Q-G19` a besoin. **Même prix** : le plafond compte les générations, pas les jours | **gratuit** — un champ. ⚠️ Le corpus porte désormais **un** plan foyer de 7 jours en `fr-FR` : **un futur avant/après doit rejouer LA MÊME fenêtre** | |
| **20** | ⛔ **PAS de seconde génération. `FIXTURE_LOCALE=en-GB` n'est PAS déclenché.** | `V0-D` | Le protocole du §⑨ n° 10 dit : *« si `V0-D` sort une couverture basse, essayer `en-GB` AVANT d'incriminer le moteur »*. **La prémisse ne s'est pas produite** : le plan `fr-FR` apporte 290 lignes dont **272 résolues ET pesées = 93,8 %**, contre **93,6 %** pour le corpus foyer entier — **+0,2 point, pas −17,3**. ⇒ dépenser une génération en `en-GB` aurait mesuré **du bruit** | **gratuit** — c'est une décision de **ne pas** dépenser. ⚠️ **Réserve écrite : un seul plan.** Le corpus ne porte que **3 plans `fr*` sur 181** ; ce +0,2 point **ne réfute pas** la cicatrice des 17,3 points, il dit seulement qu'**elle n'a pas mordu ici**. **`L2-lang` reste entier** | |
| **21** | ⛔ **Le dépliage `æ → ae` est LIVRÉ alors qu'AUCUN test ne peut le faire mordre** — et un test **dit cette absence**. Et le chemin exécuté est écrit en `\u0153`/`\u00e6`, pas en littéral | `S1` | ① **Mesuré : zéro forme du catalogue ne contient `ae`** — la mutation le prouve, retirer la ligne `æ` seule laisse la suite **verte (rc=0)**, là où retirer `œ` rend **rc=1**. Le livrer quand même, c'est refuser que **deux normalisations divergent** : **c'est exactement la facture que `S1` vient de payer**, et le module frère la porte depuis le 2026-08-19. **Une ligne inerte ET DÉCLARÉE INERTE coûte moins qu'un huitième correctif à retrouver.** ② **L'échappement contre le littéral** : l'ANNEXE prescrit « éditer en UTF-8 » — tenu pour les commentaires et les tests, octets relus. Mais le **chemin exécuté** est en ASCII pur, comme `allergen_catalog.ts:211-215` : **c'est la seule forme qu'un mojibake ne peut pas atteindre**, et le mojibake est le risque nommé de ce lot | **une ligne** dans les deux cas. ⚠️ ⛔ **Le vrai coût du retour arrière n'est pas la ligne, c'est le SILENCE** : sans le test d'absence, le jour où une forme en `ae` entre au catalogue, **rien ne dirait que la moitié `æ` n'avait jamais été exercée** — et un dépliage jamais exercé ressemble **trait pour trait** à un dépliage qui marche | |
| **22** | ⛔ **La porte ②bis ferme `unreadable`/`future`/`implausible` EN PLUS d'`absent` — et le champ s'appelle `numberAllowed`, un SECOND champ, pas un durcissement d'`allowed`** | `S3` | ① La fiche ne nommait qu'`absent`. **Mesuré : les trois autres statuts ouvraient le chiffre aussi**, et `ageStateFromVerdict` les range sous `unknown` **depuis toujours** — fermer `absent` seul aurait laissé **trois portes ouvertes** et créé une **cinquième** définition de « on ne sait pas ». ② `allowed` n'est **pas** touché : c'est la condition de désarmement documentée en en-tête de `student_age.ts`, et la fermer ferait **échouer 1 193 comptes sur 1 313**. **Deux questions, deux champs** — et un test (`assertEquals(diverged, 4)`) qui **rougit s'ils redeviennent un alias**. **Poser une garde neuve est délégué** | **un commit** — supprimer le `if (!age.numberAllowed)` de `energy_gate.ts:275` et le champ. Aucune migration, aucune donnée, aucun effet rétroactif. ⚠️ ⛔ **Le vrai coût du retour arrière est le RETOUR DU SILENCE** : le chiffre redeviendrait produit pour **1 193 comptes**, et **rien ne le dirait** | |
| **23** | **`energy_gate_mouth_test.ts` est commité AVEC 37 lignes d'une AUTRE session** *(LOT 2 grammage, 2026-08-20)* | `S3` | La table de vérité de ce fichier **doit** bouger avec la porte ②bis, sinon HEAD est rouge. **Vérifié en rejouant la version de HEAD contre l'arbre courant : 2 échecs, dont UN antérieur à ce lot** — l'allowlist n'avait jamais été commitée après que `V0-A` eut versionné `mouth_anchor.ts`. ⇒ **laisser les 37 lignes dehors aurait livré DEUX rouges au lieu de zéro** ; les emporter en répare un et **publie du travail correct d'une autre session, sans rien écraser** | **un `git revert` du hunk** — et il **recasserait** l'allowlist, donc le test, **pour tout le monde**. ⚠️ Le vrai coût du choix inverse aurait été **un HEAD rouge attribué à `S3`** | |
| **24** | ⛔ **Le dépliage aligne AUSSI un DÉSARMEMENT** : `« ma sœur est diabétique et j'ai un diabète de type 2 »` rendait `diabetes` sous ligature, elle rend `null` après `S1c` | `S1c` | Le critère du lot est **l'équivalence des deux graphies, dans les DEUX sens**. Le comportement du digramme est celui que l'auteur a **écrit et testé** ; celui de la ligature était **un accident d'une `normalize()` cassée**. Ne pas aligner, c'était garder un plancher **dont le verdict dépend de la façon dont on tape « sœur »**. ⛔ **Ici on ne choisit pas entre deux comportements, on choisit entre UN et DEUX** | **deux lignes** — et le retour arrière **rouvre la maladie cœliaque**, qui est la raison du lot. ⚠️ Un test **nomme** ce changement : le retirer rendrait le geste invisible | |
| **25** | ⛔ **LES 30 VALEURS DE FENÊTRE CRUE, ET LEUR UNITÉ** — écart maximal **achat → cuisson** *(2 = acheté lundi, cuisiné jusqu'à mercredi)*. **1 j** poissons + frit · **2 j** volaille, viande hachée · **3 j** viande en pièce, salade, fruits rouges · **5 j** tofu · **7 j** légumes, yaourt · **14 j** féculents, agrumes, fromage, beurre · **21 j** les 12 restants | `L0-a` | ① **L'unité est celle que `grocery_waves.ts:211` lisait DÉJÀ** — le lot remplace un nombre unique par un nombre par groupe et **ne change pas la lecture**. En choisir une autre aurait fait **diverger le sens de deux nombres au même endroit**. ② Les cinq familles viennent de la fiche. ③ ⛔ **« 21 » est UN SEUL nombre pour « ça ne contraint rien »** — la fenêtre d'un plan fait au plus 7 jours, donc dix valeurs distinctes au-dessus de 7 auraient été **inventées et lues comme mesurées**. ⚠️ Écrit aux trois endroits que ce sont des **ordres de grandeur assumés**, même posture que `YIELD_FACTORS` | **un `update` de 30 lignes et un commit.** Aucune donnée détruite, aucun plan réécrit *(les vagues se calculent à la lecture)*. ⚠️ **Le vrai coût du retour arrière est de revenir à TROIS JOURS POUR TOUT** — donc au poulet du cas 04, **mesuré faux** | |
| **26** | ⛔ **La fenêtre CRUE n'est PAS fail-closed, la fenêtre CUITE l'est.** Un groupe non résolu retombe sur `MAX_FRIDGE_DAYS`, **et le repli se COMPTE** | `L0-a` | La fiche dit *« porte de sécurité, donc fail-closed »*, et **la cuite l'est** : le plat est jeté. Mais la crue **ne décide qu'une date de magasin** : s'y tromper coûte **de la fraîcheur, pas un empoisonnement**. Prendre la fenêtre la plus courte pour un terme non résolu enverrait aux courses le jour de la cuisson pour **un terme sur dix (3,8 % mesuré)** — une dégradation visible contre un gain non mesuré. **L'abstention se COMPTE, elle ne se déguise pas en résolution** | **un `??` à changer**. ⚠️ **Le coût du retour arrière est nul TANT QUE `unknown_group` est lu** — sans lui, une liste sans aucun groupe rendrait exactement la même chose qu'une liste parfaitement routée | |
| **27** | ⛔ **Le bloc `cooking_sessions` est REMONTÉ au-dessus de la boucle des plats** | `L0-a` | ⛔ **Sans ça le lot était désarmé et l'aurait PARU armé.** `prep.cookOn` vient de la SESSION, back-fillée **sous** la boucle : une garde posée dans la boucle lisait `null` et **passait verte sur le cas mesuré**. Le bloc ne dépend que de `root`, `preparations`, `preparationIds`, tous résolus avant ; **seul l'ORDRE des lignes d'`issues` change** | **remettre le bloc en place** — et le lot redevient une garde qui ne voit rien. ⚠️ ⛔ **Le vrai coût du retour arrière est qu'il NE SE VERRAIT PAS** : aucun test ne rougirait, la garde rendrait simplement `not_evaluated` partout | |
| **28** | **Le refus est LE PLAT ENTIER, prononcé DANS la boucle des plats** | `L0-a` | Le commentaire d'origine refusait deux gestes *(raccourcir la portée, déplacer la cuisson)* — **les deux restent vrais**. ⛔ **La troisième voie qu'on refuse, c'est de servir quand même.** Le geste est celui, **déjà écrit**, du plat posé un jour d'absence. Prononcé en queue de fonction, il aurait exigé de splicer **huit tableaux parallèles** dans un fichier portant +2 250 lignes d'autres sessions. ✅ **Mesuré : le refus ne vide AUCUN plan (0/181)** | **un `continue` à retirer** — la mutation prouve que 2 tests rougissent alors. ⚠️ **Le vrai coût du retour arrière est de reservir 83 plats hors fenêtre**, sur 36 plans | |
| **29** | **`fridge_window.ts` NE DÉFINIT PAS `MAX_FRIDGE_DAYS` — elle lui est PASSÉE**, et le câblage reste dans l'arbre de travail | `L0-a` | ① La déplacer aurait créé une **SECONDE** constante dans HEAD le temps que les **huit** porteurs suivent — **exactement le défaut qu'on répare**. Elle reste dans `meal_generation.ts`, **personne ne la recopie (vérifié sur les 8)**, et **le test l'épingle par un LITTÉRAL** — sans quoi la règle serait *« paramétrée par sa propre constante »* et resterait verte quand on la change. ② Même arbitrage qu'au **n° 15** : les trois fichiers de câblage portent ~4 000 lignes d'autres sessions. La **RÈGLE** entre dans l'histoire *(fichiers propres)*, le **CÂBLAGE** vit sur le disque. **Vérifié sur un arbre `git archive HEAD` + les 5 fichiers : 66/66 verts** | **un `import` à écrire** le jour où `meal_generation.ts` est commitable. ⚠️ ⛔ **Le vrai coût est le même qu'au n° 15 : tant que `meal_generation.ts` n'est pas commité, le `>=` et le compteur n'existent QUE SUR CE DISQUE.** La règle, elle, survit à un `clone` | |
| **30** | ⛔ **La levée du cran 4 mord sur « AUCUN ref ne porte de formes », pas sur « UN ref sans formes » — et elle RETIRE une propriété testée** | `S1b` | ⛔ **La lecture littérale de la direction était MESURÉE IMPOSSIBLE** : `householdAllergenRefs("arachide")` rend `["peanut","arachide"]`, dont **le second est sans formes** — lever sur « un ref sans formes » aurait **refusé le plan de la FIXTURE OBLIGATOIRE**, donc `V0-D` **et la vérification de fin de CHAQUE vague**. Sur « aucun ref », la levée mord **0 fois sur les 6 libellés réels**. ⛔ **Le prix est réel et il est écrit** : *« un mot inconnu garde le mot, jamais rien »* disparaît — une allergie au kiwi ne compose plus aucun plan. C'est ce que la fiche demandait *(« c'est le bon comportement pour une allergie »)*, et **le test qui portait l'ancienne propriété est INVERSÉ, pas effacé** : l'ancienne assertion est **citée en toutes lettres** dans le nouveau | **une ligne** — supprimer le bloc `if`, **nommé sur l'erreur elle-même**. ⚠️ **Le vrai coût du retour arrière est le silence d'avant** : un ref muet ressemble **trait pour trait** à un ref couvert | |
| **31** | ⛔ **La migration de la ligne `fruits_de_mer` n'est PAS préparée — elle est REFUSÉE PAR LA BASE, et elle est devenue INUTILE** | `S1b` | Le trigger `student_safety_constraints_retraction_only` lève sur tout changement d'`allergen_ref` : *« a declaration is superseded, never rewritten »*. Le seul chemin est **insert + retract**, c'est-à-dire **réécrire la déclaration de quelqu'un** — **point 2 de la liste fermée du propriétaire**, hors délégation. Et depuis `29495bb7` la ligne est **couverte dans les deux langues** par la clé miroir : **le seul gain restant serait cosmétique** | ⛔ **ON NE REVIENT PAS.** `active → retracted` est le seul changement d'état autorisé ; **`retracted → active` est refusé**. Défaire demanderait de **supprimer une déclaration de sécurité** | |
| **32** | **`safety_constraints.ts` et les deux fichiers front NE sont PAS commités, et c'est mesuré** | `S1b` | ① `safety_constraints.ts` entraînerait `meal_generation.ts` et `week_plan_generation.ts` *(6 `TS2554` mesurés sur un arbre HEAD + le fichier)*, **et c'est le fichier sur lequel `S2` travaille**. ② `copy/allergens.ts` nomme **quatre `MessageKey`** du chantier 2026-08-19 qui n'existent que dans `en.ts`/`fr.ts`, **interdits de commit**. Les deux sont **verts sur le disque** | **un commit** pour chacun — mais il faut d'abord que le propriétaire tranche `V0-A-bis`. ⚠️ ⛔ **Le coût de l'inaction est MESURÉ** : `household_safety_test.ts` **ne type-checke pas à HEAD** (8 `TS2554`), donc **l'arme de ce lot n'est pas exécutable depuis un clone** | |
| **33** | ⛔ **`meal_envelope.ts` et `weight_pace.ts` NE SONT PAS TOUCHÉS par le plancher de grossesse.** *(numéro cité `n° 42` par `L0bis` avant que le registre soit écrit)* | `L0bis` | Le déficit a **trois** ouvreurs, pas deux, et les deux modules nommés dans la fiche **ne sont pas** ceux qui tirent : le chemin vivant passe par `mouth_anchor.ts` *(l'ancre ABSOLUE, qui REMPLACE le facteur relatif)*. Toucher `meal_envelope`/`weight_pace` aurait modifié le calcul d'énergie **de toutes les bouches** pour fermer un chemin **que la grossesse n'emprunte pas** — un blast radius maximal pour un gain nul. La garde est posée en amont, dans un module pur (`condition_energy_gate.ts`), et branchée sur le seul chemin mesuré | **un import à ajouter** dans l'un des deux modules — mais il faudrait d'abord **mesurer** qu'un `condition_ref` les atteint, ce qui n'est pas le cas aujourd'hui | |
| **34** | ⛔ **Corollaire du n° 33 : la garde ne mord que VERS LE BAS** (`direction === "down"`, `fat_loss` seul). *(numéro cité `n° 43`)* | `L0bis` | La rabattre sur un **surplus** retirerait de l'énergie à une femme enceinte qui en demande, **sous le nom d'une protection**. Un plancher qui mord dans les deux sens n'est plus un plancher, c'est un plafond déguisé | **un opérateur** — et il rendrait la garde symétrique, donc nuisible | |
| **35** | **Le seuil ③ de `L35-a` est écrit MANQUÉ, jamais réécrit** *(numéro cité `n° 56`)* | `L35-a` | La famille ③ ne sort pas sur la fixture, **et ce n'est pas le code** : l'unique plan porte `cooking.asked = null`, donc le plafond **ne peut pas** mordre ; rejoué sur les MÊMES faits avec `capped: true`, **la ligne sort**. Le lever pour de vrai coûte **une génération**, hors budget du lot. ⛔ Réécrire le seuil en « 2 familles sur la fixture » aurait été **une justification, pas une mesure** — l'interdit nommé en §⑦ | **une génération** sur une requête portant une forme de cuisine ; le code n'a rien à changer | |
| **36** | ⛔ **`S2` est livré dans l'ARBRE DE TRAVAIL, sans aucun commit** *(numéro cité `n° 60`)* | `S2` | Ses fichiers portent le travail en vol d'autres sessions *(le mur du §⑨ n° 15)*. L'arbre de travail **est** ce que `functions serve` exécute : la garde est donc **vivante et mesurable** en local, elle n'est simplement pas **versionnée**. Committer aurait emporté le travail d'autrui ; ne rien livrer aurait laissé les 6 contraintes non couvertes | **un commit ciblé**, le jour où les fichiers porteurs redeviennent propres. ⚠️ Coût réel : un `git checkout` d'un autre agent **efface la garde sans trace** | |
| **37** | **`S1d`③ ne dépend PAS de `S1`/`S1c` : son mécanisme a été MESURÉ avant que le geste soit jugé applicable** *(numéro cité `n° 70`)* | `S1d` | `sophia-brain/safety/safety_lexicon.ts` porte le **mécanisme OPPOSÉ** : `normalizeForSafety` n'a **aucun** filtre non-alphanumérique, la ligature **SURVIT** intacte, et c'est le **littéral ASCII** qui rate. Appliquer le remède de `S1` par symétrie aurait été un geste sur un défaut qui n'existe pas là. ⛔ La 1ʳᵉ sonde a d'ailleurs échoué **pour la mauvaise raison** *(`null` des deux côtés, prémisse cassée)* et a dû être refaite sur la table | **rien** — c'est une mesure, pas un choix | |
| **38** | **Deux désarmements « autrui » CHANGENT de comportement, et deux tests les NOMMENT** *(numéro cité `n° 71`)* | `S1d` | ① `body_measure_floor` cesse d'écrire **78 kg** sur `« je fais 78 kg comme ma sœur »` · ③ le lexique de crise cesse de lever la bande à `high` quand quelqu'un parle **de sa sœur**. Ce sont des changements **voulus** — c'est le lot — mais un changement de comportement non nommé est indiscernable d'une régression. ⛔ Ils sont donc **écrits dans deux tests**, pas seulement dans un message de commit | **un revert des six lignes** ; il rendrait la sur-déclenche et le fait faux | |
| **39** | **Deux chiffres FAUX d'un message de commit sont corrigés AU REGISTRE, jamais effacés** *(numéro cité `n° 75`)* | `S1d` | Le commit n'est plus `HEAD` : le réécrire demanderait de réécrire l'histoire d'une branche partagée par d'autres sessions. Le recensement de `S1c` **sous-comptait** — sur 985 fichiers back, `.normalize("NFD")` hors tests = **68 modules / 6 avec repli / 62 sans**, et **non 46/3/43**. Un lecteur qui trouve le chiffre du commit trouve aussi sa correction ici | **rien** — c'est une correction, pas une décision réversible | |

| **40** | ⛔ **`L2-lang` se mesure sur 5 `fr-FR` + 5 `en` GÉNÉRÉS CÔTE À CÔTE, jamais sur 10 `fr-FR` comparés au corpus existant** — et **le plan se contredisait lui-même** *(sa `mesure APRÈS` disait « dix générations en `fr-FR` », sa ligne de fin de vague disait « cinq en `fr-FR` et cinq en `en` » ; c'est la seconde qui tient, et le tableau des plafonds de ce même §⑩ disait DÉJÀ « cinq `fr-FR`, cinq `en` » — la fiche était seule contre deux)* | `L2-lang` *(tranché par l'orchestrateur avant lancement)* | ⟳ **Mesuré le 2026-08-22 à 11:22 CEST, et c'est ce qui tranche.** Le corpus EN porte **178 plans étalés sur 15 générations de prompt** — `meal.en.v1` à `v15`+`household.v17` — **dont 43 sans aucun `prompt_version`**. Le corpus FR en porte **4**, dont **2 produits par les vagues 0 et 1 elles-mêmes**. Comparer 4 contre 178 ne mesure **pas une langue** : ça mesure un millésime de prompt. ⛔ C'est **exactement** le confondant que la fiche `L-1` nomme déjà — *« une part vient de trois générations de prompt mortes qui écrivent 100 % de leurs ingrédients sans `amount` »* — et le laisser entrer ferait de `L2-lang` un chiffre **impossible à interpréter**, donc pire qu'aucun chiffre. **Un échantillon mince et propre bat un échantillon gros et confondu.** Le corpus existant est rendu comme **troisième colonne, étiquetée**, jamais comme le bras EN. ⚠️ **Second fait qui change le script** : `content_locale` **n'est pas un axe de langue** — la base porte `en`, `en-GB`, `en-US`, `fr-FR` **et `fr-US`**. Le regroupement se fait sur le **sous-tag de langue**, pas sur la locale | **rien de technique** : les 10 générations coûtent le même plafond dans les deux lectures. ⚠️ Le coût du retour arrière est **interprétatif** : reprendre la lecture « 10 FR contre le corpus » rendrait un écart qu'on ne pourrait **pas** attribuer à la langue | |

| **41** | ⛔ **La clé persistée s'appelle `group`, PAS `food_group_ref` ni `food_group`** — et la clé est **écrite même à `null`** | `L17-0` | **① UN SEUL NOM, DE LA CONSIGNE À LA BASE.** Le bloc de prompt demande `"group"`, le parseur lit `group`, le type porte `group` : renommer en chemin est la façon la plus sûre de perdre un champ dans un dépôt où trois fiches cherchent la même valeur. ⛔ **② `shopping_list[].food_group` EXISTE DÉJÀ ET N'EST PAS LA MÊME CHOSE** : il est **résolu depuis le référentiel** (`resolveIngredient(...).foodGroupRef`, `L0-a`), quand celui-ci est **déclaré par le modèle** puis validé contre la liste fermée. Un nom commun inviterait à faire confiance à une déduction comme à une déclaration. **③ Écrite même à `null`**, comme `dishes[].name` et `dishes[].boxes` : une clé absente ne se distingue pas d'un lot débranché | **rien à défaire côté base** — la clé voyage en `jsonb`, aucune migration, et les plans écrits avant n'ont simplement pas le champ. ⛔ **Le vrai coût est sur les REQUÊTES** : `ing ? 'group'` devient **vrai partout** et cesse de mesurer quoi que ce soit ; toute requête héritée doit passer à `ing->>'group' is not null`. **`L17` et `L18b` doivent chercher `group`** | |


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
> ~~**~13 000** par génération~~ ⟳ ⛔ **MESURÉ LE 2026-08-21 PAR `V0-D` : 26 906 tokens** pour une génération foyer
> sur **7 jours et 4 bouches** — soit **2,07× l'estimation du plan**. *(Plus 623 tokens de secours `composition_fill`,
> hors plafond.)* **Les plafonds des vagues suivantes se posent sur 26 900, pas sur 13 000.**
> **~13 000 par génération** sur ces modèles.

## ⟳ La commande qui compte — ⛔ **CELLE DU PLAN ÉTAIT AVEUGLE, corrigée le 2026-08-21**

> ⛔ ~~`where operation_family = 'plan_generation'`~~ **compte 1 appel sur 108.**
> Mesuré à l'ouverture de la vague 0 : `operation_family = 'plan_generation'` **a cessé
> d'être écrit le 2026-08-13** (56 lignes en tout, la dernière ce jour-là). Les **107**
> appels des modèles de la lane de génération — `gpt-5.6-sol` 58, `gpt-5.6-luna` 49 —
> sont **tous** rangés sous `operation_family = 'other'`, la valeur **par défaut** de la
> colonne. Un budget mesuré par cette requête aurait rapporté **« 0 génération dépensée »**
> après en avoir dépensé dix. *C'est le mode d'échec que ce plan combat partout ailleurs :
> un compteur désarmé ressemble à un compteur qui marche.*

**La bonne clé est `source`, et elle sépare exactement ce que le budget demande** — la
GÉNÉRATION d'un côté, la relance et le secours de l'autre :

```
source                                            appels   ce que c'est
generate-household-meal-v1                            48   ← 1 GÉNÉRATION foyer
generate-meal-v1                                      48   ← 1 GÉNÉRATION solo
generate-meal-v1.composition_retry                     9   relance
generate-household-meal-v1.protein_anchor_retry        1   relance
generate-meal-v1.protein_anchor_retry                  1   relance
generate-week-plan-v1                                  1   la lane retirée
```

⇒ **une GÉNÉRATION = une ligne dont le `source` ne porte PAS de suffixe après un point.**
Les relances et le secours (`composition_fill`) portent `source like '<lane>.%'` et **ne
comptent pas au plafond** — ils se comptent à côté, parce qu'ils disent autre chose.

```sql
select
  case when source like '%.%' then 'relance / secours' else 'GÉNÉRATION' end as unite,
  source, model, count(*) as appels, sum(total_tokens) as tokens
from llm_usage_events
where created_at > '<horodatage du lancement>'
  and (source like 'generate-meal-v1%' or source like 'generate-household-meal-v1%')
group by 1, 2, 3
order by 1, 2;
```

⚠️ **`request_id` ne regroupe rien** : les 48 appels foyer portent **48 `request_id`
distincts**. Une relance n'est **pas** rattachable à sa génération par cette colonne —
seul `source` les distingue.

**Horodatage de lancement de la vague 0 : `2026-08-21 20:41:03+00`.**

⚠️ **Une génération de foyer = 1 appel principal + jusqu'à 1 relance + 1 appel court de
secours** (`composition_fill`). **Compter les GÉNÉRATIONS, pas les appels.**

## Le plafond, vague par vague

| vague | plafond | à quoi il sert |
|---|---:|---|
| **0** | **3** | `V0-D` : 1 run + 2 de marge — sa direction dit qu'on **s'attend** à ce qu'il sorte incomplet |
| **1** | **9** | chaque garde veut un cas qui **MORD** et un cas qui **PASSE** : `S2`, `L0bis`, `C1`, `L0-a`, `L24′`. + 1 de perte *(médiane mesurée à 164 s ; un 429 archive quand même)* |
| **2** | **16** | ⛔ **10 pour `L2-lang` seul** — cinq `fr-FR`, cinq `en` : *« rien d'autre ne le remplace »*. + 4 pour remplir le sas de `L18b` *(`unknowns_median` doit baisser sur deux semaines)*. + 2 de marge. ⟳ **RÉPARTITION ARRÊTÉE le 2026-08-22 à 11:25 CEST** : **1** pour la fumée de `L17-0` *(prouver que `group` persiste AVANT d'en dépenser 10 à l'aveugle)* · **10** pour `L2-lang`, **et ces dix-là servent AUSSI** `L18b` *(`pending ≥ 3`)*, `L17` *(`share_group_bounds` non nul)* et la vérification de fin de vague — ⛔ **aucune génération n'est dépensée deux fois** · **4** en réserve pour le sas si `pending < 3` après les dix · **1** de perte. ⚠️ **Le coût mesuré est de 21 à 27 k tokens par génération** *(vagues 0 et 1 : 26 906 et 20 976)*, soit **2,07× l'estimation de ce §⑩** ; le plafond reste en GÉNÉRATIONS, pas en tokens |
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

| horloge | valeur | où | ⟳ s'applique-t-elle aux générateurs ? |
|---|---|---|---|
| ~~`GEMINI_HTTP_TIMEOUT_MS`~~ | ~~**110 s** par défaut — **sous la médiane mesurée**~~ | l'appel modèle | ⛔ ⟳ **NON — et c'est le fait le plus important de cette section** |
| `PLAN_HTTP_TIMEOUT_MS` | **300 000 ms** (5 min) | `generation_model.ts:107` | ✅ **c'est ELLE qui s'applique** |
| le worker | coupe à **400 s** | au-dessus des deux | — |

⛔ ⟳ **CORRIGÉ le 2026-08-21, avant tout run — le plan et le commentaire du code portaient
un fait que le correctif du 2026-08-19 a lui-même périmé.**

`gemini.ts:248-251` : `GEMINI_HTTP_TIMEOUT_MS` n'est le défaut **que si `meta.httpTimeoutMs`
est absent**. Or **les deux lanes de génération le passent** — `generate-household-meal-v1/index.ts:4324`
et `:4548`, `generate-meal-v1/index.ts:1899`, `:2030`, `:2409` — toutes avec
`httpTimeoutMs: PLAN_HTTP_TIMEOUT_MS`. **Les 110 s ne les ont jamais contraintes depuis ce
correctif.** Elles contraignent le chat, qui ne passe rien.
*(`GEMINI_HTTP_TIMEOUT_MS` n'est posé nulle part dans `supabase/.env` : c'est bien le défaut littéral qui vaut.)*

**Et la latence mesurée ne reproduit pas non plus le « 164 s de MÉDIANE » du commentaire :**

```
gpt-5.6-luna  (foyer)   49 appels   médiane  66 510 ms   max 210 365 ms
gpt-5.6-sol   (solo)    59 appels   médiane 133 463 ms   max 202 174 ms
```

⇒ **médiane 66 s côté foyer contre 300 s en vigueur : il n'y a rien à relever.** Le geste
n° 3 (« relever le timeout ») **n'est pas déclenché**. Le max mesuré, 210 s, reste sous les
300 s ; c'est le worker à 400 s qui devient la borne la plus proche, et il ne mord pas.

⛔ ⟳ **ET UN PIÈGE DE MESURE À NE PAS RÉPÉTER** : la commande prescrite plus haut,
`where status <> 'success'`, rend **zéro ligne — toujours**. `llm_usage_events` ne porte
**aucune** ligne non-`success` : **un appel qui expire n'écrit pas d'événement du tout.**
Un résultat vide ne prouve donc **pas** l'absence d'expiration ; il ne prouve rien.
La latence des expirations se lit **dans les logs du runtime edge**, pas dans cette table.

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

> ⟳ ⛔ **CORRECTION DU 2026-08-21, après vérification adversariale — la preuve qui a fixé le périmètre à 22 était bancale.**
> Elle disait : *« `generate-household-meal-v1/index.ts`, **suivi**, importe `mouth_anchor.ts` »*. **Le fichier est suivi mais `M`, et sa version COMMITÉE
> n'importe aucun des 22.** Le `grep` lisait **l'arbre de travail** : il confondait *suivi* et *commité*.
> ⇒ Les 22 fichiers **méritaient** d'être versionnés — ils sont le sujet même du plan et n'étaient sauvegardés nulle part —
> mais **la raison écrite pour le faire était fausse**, et la conséquence n'avait pas été vue : le checkout propre compilait **avant** ce lot.
> **Règle qui en sort, et elle vaut pour tout le plan : une preuve tirée d'un `grep` sur l'arbre de travail ne dit rien de HEAD.**


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
| **pourquoi** | ⟳ ⛔ **RÉÉCRIT le 2026-08-21 par la vérification adversariale — la première version de cette fiche se trompait de coupable.** ~~« l'arme est bloquée par une règle du dépôt, pas par le lot »~~ : **faux, et mesuré.** Rejoué sur le commit **parent** `c4728f9b`, sans aucun des 22 fichiers, `node_modules` liés : `tsc -b --force frontend/tsconfig.app.json` → **`rc=0`, ZÉRO erreur**. ⇒ **avant `V0-A`, un checkout propre compilait. Après, il rend 40 erreurs.** Ce n'est pas une contrainte subie, c'est le **choix de périmètre** du lot : il a commité deux fichiers front (`HouseholdTraditionsCard.tsx` 17 erreurs, `mouthVoice.ts` 23) qui **nomment des symboles vivant seulement dans des modifications non commitées**. ⛔ **Et le `deno check` rc=0 déclaré ✅ est un FAUX VERT** : il rend `rc=0` **aussi sur le commit parent**, parce que la version **commitée** de `generate-household-meal-v1/index.ts` **n'importe aucun** des 22 — les imports vivent dans son diff `M`. Visés directement, **4 des 6 modules back échouent** (`mouth_anchor.ts` 4 erreurs, `composition_fill{,_io}.ts` 5, `composition_fill_test.ts` 10). ⇒ **dans HEAD, les 22 forment une île orpheline : zéro importateur commité.** |
| **dépend de** | rien |
| **bloque** | ⚠️ **rien de la vague 0** — c'est pour ça que `V0-A` est tenu pour livré *(§⑨ n° 1)*. Mais il bloque **la promesse** que le plan fait sur `V0-A` : « exécutable par quelqu'un d'autre » |
| **fichiers** | `frontend/src/keel/api/household.ts` *(3 exports)* · `frontend/src/keel/i18n/{en,fr}.ts` *(37 clés)* — ⛔ **et c'est précisément la liste des fichiers que l'ANNEXE interdit de commiter** |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 depuis un arbre `git archive HEAD | tar -x`** : `deno check` **rc=0** · `tsc -b --force tsconfig.app.json` **rc=1, 40 erreurs** · `git show HEAD:frontend/src/keel/i18n/en.ts | grep -c '"setup.traditions.title"'` → **0**, le disque → **1** |
| **direction** | ⟳ **La vraie portée est bien plus large que la couche i18n, et elle est mesurée.** Les dépendances des 22 vivent dans **six fichiers suivis mais non commités**, tous au dernier commit du **2026-08-18** : `household_portions.ts` **+1532/−188** *(`DEFAULT_PACE_KG_PER_WEEK`, `MouthRestrictionState`, `restrictionFlagOf`)* · `generate-household-meal-v1/index.ts` **+1278/−70** *(les imports eux-mêmes)* · `food_composition.ts` **+370** *(`CompositionSource`)* · `api/household.ts` **+264** *(3 exports)* · `tokens.ts` **+160** *(`MealComponent`)* · `TableStepPlanning.tsx` **+11**, plus `en.ts`/`fr.ts` *(37 clés)*. ⇒ ⛔ **« reproductible depuis un `git clone` » n'est atteignable qu'en commitant le chantier ENTIER** — donc `en.ts`/`fr.ts`, que l'ANNEXE **et** le propriétaire interdisent. **C'est une décision de propriétaire, pas un lot d'exécutant.** ~~⛔ Ne PAS réparer en retirant `HouseholdTraditionsCard.tsx` du commit : `TableStepPlanning.tsx`, suivi, l'importe~~ ⟳ **RÉFUTÉ** : `git show HEAD:…/TableStepPlanning.tsx | grep HouseholdTraditionsCard` → **rien**. L'import est **ligne 10 du disque seulement** |
| **mesure APRÈS** | `tsc -b --force tsconfig.app.json` **`rc=0`** depuis un arbre ne contenant que du commité. **Seuil : 0 erreur, et `deno check` reste à `rc=0`** |
| **armé par** | ⛔ ⟳ **Le même arbre tiers, rejoué — ET un contrôle négatif, sans lequel l'arme ne discrimine rien.** La leçon de la vérification : `deno check` sur la lane foyer passait **avant comme après**. **Toute arme de ce lot doit être rejouée sur le commit PARENT** et rendre un résultat **différent** ; sinon elle mesure autre chose que le lot |
| **coût** | **un lot**, dont la moitié est une **décision** *(l'interdit de commit sur `en.ts`/`fr.ts` est-il une règle ou une cicatrice ?)* |
| **risque** | ⛔ **L'interdit de l'ANNEXE existe pour une raison réelle** — ces fichiers portent le travail simultané de plusieurs sessions, et un commit partiel casse la parité. **Ce lot ne doit pas être livré par un agent qui décide seul de le lever.** ⚠️ Et `V0-A` a prouvé que le mojibake est le piège de cette famille : **jamais `unicode_escape`**, éditer par numéro de ligne, en UTF-8 |

## V0-B — les compteurs cessent de mentir

| | |
|---|---|
| **quoi** | La vue qui pilote le lot 18 arrête d'afficher un succès parfait sur des plans jamais mesurés. |
| **pourquoi** | **180 plans sur 180 portent `composition_energy_sources = '{}'` et `composition_unknowns = 0`** — les **valeurs par défaut**, sur des plans tous antérieurs à la migration. `composition_fill_weekly` affiche donc `unknowns_median = 0` sur 6 semaines. *« Un lot désarmé ressemble à un lot qui marche »*, et le rapport du lot 18 annonçait le symptôme sans voir qu'il était déjà là. |
| **dépend de** | rien |
| **bloque** | `V0-E′`, `L17`, `L18b` |
| **fichiers** | ⟳ **LIVRÉ** : `supabase/migrations/20260821225000_les_compteurs_de_composition_cessent_de_mentir.sql` · `supabase/functions/_shared/keel/composition_fill_weekly_test.sql`. ⟳ ~~`drop default` sur les deux colonnes~~ → **`drop default` ET `drop not null`** : les deux colonnes étaient `not null default …` (`pg_attribute.attnotnull = t` sur les deux, mesuré), et **l'`update … = null` échouait** sur la non-nullité. La fiche ne nommait que la moitié du geste |
| **migration** | **oui** — pas de table neuve. `student_generated_meals` est déjà exportée et purgée. ⟳ ~~`create or replace view` **perd `security_invoker`** : le repasser~~ → **la vue ne l'avait JAMAIS** : `select reloptions …` rendait **vide** avant le lot. Il n'y avait rien à *reposer* — le lot le **pose** pour la première fois. *(La cicatrice est réelle et mesurée quand même : sous mutation, un `create or replace view` du lot 18 rend `reloptions` → `VIDE`.)* |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 à 22:41:21 CEST** — `select composition_energy_sources::text, composition_unknowns, count(*) from student_generated_meals group by 1,2` → **une seule ligne : `{}` · `0` · `180`** *(reproduit)*. `select * from composition_fill_weekly` → **6 lignes**, `unknowns_median = 0` et `unknowns_max = 0` sur les six, les quatre `share_*` **vides** *(3 + 30 + 50 + 37 + 52 + 8 = 180)*. `select reloptions …` → **vide**. ⚠️ **Et le plan le plus récent date du 2026-08-19 10:18 UTC** : aucun des 180 n'a pu passer par `composition_fill.ts` |
| **direction** | la vue passe de « 6 semaines à médiane 0 » à **aucune ligne**. ⛔ **Un tableau de bord vide est le bon résultat** |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-21 à 22:46:20 CEST — LES TROIS SEUILS ATTEINTS.** ① `select count(*) from composition_fill_weekly` → **0** *(avant le run ; ≥ 1 avec médiane > 0 attendu après `V0-D`)* ② `select reloptions from pg_class where relname='composition_fill_weekly'` → **`{security_invoker=true}`** ③ `select composition_energy_sources::text, composition_unknowns, count(*) … group by 1,2` → **une seule ligne : `∅` · `∅` · `180`**. ⚠️ **Et `updated_at` est intact** : min/max/`differs` identiques au bit près (152 lignes sur 180 portent un `updated_at` distinct de `created_at`, et il **sort dans l'export RGPD**) — le trigger `student_generated_meals_set_updated_at` est **désactivé autour du seul `update`**, dans la même transaction, et re-vérifié `tgenabled = 'O'` après |
| **armé par** | ⟳ **LIVRÉ ET MORDU** : `composition_fill_weekly_test.sql`, **6 cas, tous verts** *(22:47:52 CEST)*. ① la colonne accepte `null` ② la vue exclut la ligne non mesurée ③ `reloptions` porte `security_invoker=true` ④ **le défaut est parti** — une écriture qui ne nomme pas les colonnes laisse `null`, pas `0` ⑤ ⛔ **LE CAS QUI PASSE** — deux lignes MESURÉES apparaissent dans la vue avec `plans=2 median=3 max=4 share_table=0.750`, plus « mesurée dedans, non mesurée dehors, **en même temps** ». **Preuve de morsure** : le test rejoué sur la vue du lot 18 réinjectée *(sans `where`)* rend **3 cas en `ÉCHEC`** — ② `1 ligne(s)`, ③ `VIDE`, et la coexistence — et lève `V0-B · 3 cas en échec`. ⑤ **reste vert sous la mutation**, ce qui est son travail |
| **coût** | **une petite migration** *(⟳ tenu : 1 migration, 1 test, 0 ligne de TS)* |
| **risque** | ⟳ **BALAYÉ, ET LE RISQUE N'EXISTAIT PAS** — *les trois épreuves d'absence faites* : **① code** (`rg` sur `supabase/`, `frontend/src/`, `scripts/`) → **aucun lecteur**, seulement **deux écrivains** (`generate-meal-v1:2880-2881`, `generate-household-meal-v1:5890-5891`) qui posent toujours les deux valeurs. **Zéro occurrence** de `composition_unknowns > 0` ou d'une comparaison quelconque, **zéro** côté `frontend/src` *(y compris en camelCase)*. **② `prosrc`** → **une seule** fonction, `write_student_meal_plan`, **écrivain lui aussi**, sans comparaison. **③ `pg_views`** → **une seule**, `composition_fill_weekly`, la cible. **Aucune matview, aucun trigger** sur ces colonnes. Le `CHECK (composition_unknowns >= 0)` est **null-safe** (`null >= 0` vaut `null`, et un CHECK `null` est satisfait) : il continue de refuser `-1` et accepte l'absence, **sans être touché** |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **`drop default` sur la colonne ne désarme PAS le défaut : `write_student_meal_plan` en porte un SECOND, dans le chemin d'écriture.** La RPC fait `greatest(0, coalesce((p_payload->>'composition_unknowns')::int, 0))` et `coalesce(p_payload->'composition_energy_sources', '{}'::jsonb)` *(migration `20260821032000`, lignes 207-208)*. Ses **deux seuls appelants vivants** passent de vraies valeurs, donc **aucun mensonge neuf n'entre aujourd'hui** — mais tout appelant futur qui **omet** les clés réécrit `0`/`{}` et **repeuple la vue de faux zéros**, silencieusement. ⚠️ **C'est un `coalesce` de trop, et il survit à ce lot** *(fiche à ouvrir si `V0-D` ou `L18b` le fait mordre)*. **Second fait, hors périmètre** : `account-export-v1:488` exporte `student_generated_meals` avec une **liste de colonnes EXPLICITE** qui ne contient **ni** `composition_unknowns` **ni** `composition_energy_sources` — la migration du lot 18 affirme pourtant *« la table est déjà exportée en entier »*. **C'est faux**, et c'est la cicatrice connue « le lifecycle RGPD ne réclame pas les tables neuves » qui se rejoue **sur des colonnes** *(famille `S5`)* |

## V0-B-bis — le zéro avait un TROISIÈME porteur, et la porte du test était aveugle  ✅ **LIVRÉ** *(commit `47e293b6`)*

> ⟳ **Fiche NEUVE, ouverte par la vérification adversariale de `V0-B`.** §⑦ : *« si le lot en révèle un autre, on ajoute une fiche »*.

| | |
|---|---|
| **quoi** | La porte du test de `V0-B` cesse de laisser passer un cas **non évaluable**, et *« pas mesuré »* cesse d'être **le même octet** que *« mesuré à zéro »* sur les **trois** porteurs. |
| **pourquoi** | ① `select count(*) … where not ok` : en SQL **`not null` vaut `null`**, et un `where` ne rend pas la ligne dont le prédicat vaut `null` — le tableau affichait `ÉCHEC` pendant que la porte rendait *« tous les cas passent »*, **`rc=0`**, **sur le cas dont le fichier écrit lui-même qu'il est celui sans lequel les autres ne prouvent rien**. ② Le zéro était réécrit **aujourd'hui**, sur **deux lanes vivantes et dans la RPC** : `composition` absent et `repairPlanComposition` qui lève écrivaient `0`/`{}`, et `write_student_meal_plan` les refabriquait de toute façon par `coalesce`. ⛔ **`V0-D` est le premier run réel et il écrit ces colonnes** : sans ce lot, le run réécrivait le mensonge que `V0-B` venait d'effacer, et `V0-E′` + `L18b` l'auraient lu **comme une mesure**. |
| **dépend de** | `V0-B` |
| **bloque** | ⛔ **`V0-D`** *(chemin critique)*, et par lui `V0-E′` et `L18b` |
| **fichiers** | **COMMITÉS** : `_shared/keel/composition_fill_weekly_test.sql` · `supabase/migrations/20260821231500_le_zero_de_composition_cesse_detre_une_mesure.sql` · `_shared/keel/composition_fill_io.ts` *(+127 : `CompositionFillOutcome`, `compositionFillColumns`, `fillPlanComposition`)* · `_shared/keel/composition_fill_outcome_test.ts` *(neuf)*. ⛔ **MODIFIÉS DANS L'ARBRE DE TRAVAIL ET NON COMMITÉS, EXPRÈS** : `generate-meal-v1/index.ts` *(`M`, +289/−24)* et `generate-household-meal-v1/index.ts` *(`M`, +1305/−70)* — **c'est l'arbre de travail que `functions serve` exécute, donc le correctif est vivant pour `V0-D`** *(§⑨ n° 15)*. ⚠️ **`composition_fill_io.ts` a changé ⇒ redémarrer `functions serve` avant le run.** |
| **migration** | **oui** — `20260821231500`, une seule fonction remplacée, corps extrait par `pg_get_functiondef` puis patché sur **deux** valeurs. Aucune table, colonne, type ni vue. ACL identique avant/après. |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 à 23:06:30 CEST.** ① vue mutée ⇒ `ÉCHEC ⑤ … plans=ABSENTE` **et** `NOTICE: tous les cas passent`, **`rc=0`** ; test non muté au même moment : **6/6, rc=0**. ② ⛔ **`git show HEAD:` ne rend RIEN** — `compositionFill`, `composition_unknowns` et `repairPlanComposition` ont **0 occurrence** à HEAD dans les deux lanes *(3 001 et 5 331 lignes contre 3 239 et 6 539 au disque)* : **toute la chaîne du lot 18 est non commitée**. `prosrc` réel l. 186-187 : `greatest(0, coalesce((p_payload ->> 'composition_unknowns')::int, 0))` et `coalesce(p_payload -> 'composition_energy_sources', '{}'::jsonb)`. Plans à `composition_unknowns = 0` sans remplissage : **0** *(les 180 sont à `∅` depuis `V0-B` — le « avant » est propre, **et c'est exactement ce que `V0-D` allait salir**)* |
| **direction** | *(écrite avant de coder)* Les **trois** porteurs laissent passer le `null` ; les trois chemins écrivent **un nombre / `null` / `null`** ; le chemin nominal est **inchangé** ; `greatest(0, …)` **reste** sur une valeur présente ; le `catch` cesse d'être muet et l'échec est **compté**. |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-21 à 23:22 CEST — LES TROIS SEUILS ATTEINTS.** **①** même mutation → **`rc=3`** *(`1 cas en échec, dont 1 non évaluables`)* ; test non muté → **10/10 verts, rc=0**. **②** trois chemins prouvés : nominal **7** · index absent **`null`/`null`**, `attempt` **0 appel** · remplissage qui lève **`null`/`null`**, index de base **intact**. Côté base : ⑥ absence → `NULL` · ⑦ `null` explicite → `NULL` · ⑧ `-1` → **`0`** *(la garde tient)* · ⑨ `0` mesuré → **`0`**. **③** vue → **0** · `reloptions` → **`{security_invoker=true}`** · 180 lignes `∅`/`∅` · trigger `tgenabled='O'` · disque = registre = **229** |
| **armé par** | **10 cas SQL** *(les 6 de `V0-B` + ⑥⑦⑧⑨ sur la RPC)* et **5 cas Deno**. ⛔ **LES CAS QUI DISCRIMINENT sont Deno ④ et SQL ⑨** : un zéro **réellement mesuré** doit rester `0` — **sans eux, « rendre `null` partout » serait vert** et détruirait la seule mesure qui dit que le sas a réussi. **Trois morsures prouvées** : vue mutée → `rc=3` · ancienne RPC réinjectée → `⑥ unknowns=0 sources={}`, `⑦ sources=null`, `rc=3` · littéral `{ unknowns: 0, … }` remis dans une lane → 1 test rouge, fichier restauré **sha256 identique**. Plus une **assertion de CARDINALITÉ** *(10 cas attendus)* 

> ⟳ ✅ **VÉRIFIÉ FINI — et le vérificateur adversarial a ajouté TROIS morsures que le lot n'avait pas faites :**
> ① **le correctif NAÏF `outcome.unknowns || null` est attrapé par le SEUL cas ④** — ①②③ restaient verts. C'est la preuve la plus forte
>   que ④ n'est pas décoratif : sans lui, la réparation « évidente » passait.
> ② **les deux sondes ÉVAPORÉES** *(casser leur `where`)* rendent un tableau à **9 lignes toutes vertes**, puis
>   `ERROR: 9 cas rendus, 10 attendus — une sonde a DISPARU`, **rc=3**. **Le troisième visage du `null` est bien fermé.**
> ③ ⛔ **ET LE LIEN ENTRE LES DEUX DÉFAUTS, que le lot n'avait pas énoncé** : la RPC mutée pour écrire `null` en dur fait tomber ⑧ et ⑨
>   en **`null`**, pas en `false`. **Avec l'ancienne porte `where not ok`, cette mutation aurait rendu `rc=0`.** *La réparation ① est ce qui ARME ⑨.*
>
> ⚠️ **Deux limites déclarées, et ce ne sont pas des défauts du lot :**
> · `expected_probes := 10` est **écrit en dur** : il attrape la sonde qui s'évapore, **pas celle qu'on retire en mettant le compteur à jour**.
> · ⛔ **La sonde ⑥ est VERTEMENT VIDE sur l'histoire.** À HEAD, les deux lanes ont **0 occurrence** de `compositionFill` : étant une garde
>   **négative**, elle ne distingue pas *« correctif posé »* de *« chantier lot 18 absent »*. **La seule preuve que `V0-D` exécutera le correctif
>   est l'arbre de travail**, vérifié directement — pas le test commité.
>
> ⚠️ *Imprécision documentaire relevée et corrigée : le lot écrivait « trois sondes » de forme `insert … select … where …` ; il y en a **deux**.
> La troisième occurrence comptée était la ligne d'exemple dans un commentaire.*

| **coût** | **un petit lot** — 1 migration, 1 module partagé, 1 test neuf, 2 lanes recâblées sans les commiter. **0 génération dépensée** |
| **risque** | ⛔ **Le correctif des lanes vit sur le disque, pas dans l'histoire.** Un `git checkout` de ces deux fichiers le perd — **et avec lui tout le lot 18**. Le lot qui commitera le chantier doit les emporter  ⟳ ⛔ **ET UN FAIT NEUF, DE LA FAMILLE `H1`/`H2`, TROUVÉ PAR LA VÉRIFICATION** : `check_typecheck` de `agent-gate.sh` ne lance `deno check` que sur **trois entrées `sophia-brain`**. ⇒ **les DEUX lanes de génération ne sont PAS typecheckées par le gate.** Le `deno check` vert de ce correctif est un geste **manuel**, et **rien ne le rejouera au prochain commit**. *C'est la même famille que « le gate ne lance pas vitest », un cran plus loin : le gate ne typecheck pas non plus le code le plus lourd du produit* |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① Le `null` a un TROISIÈME visage : la sonde qui n'existe pas.** Trois cas s'écrivent `insert into t_probe select … from x where …` et posent **zéro ligne** si le `where` ne trouve rien : le cas **disparaît** du tableau — ni `OK`, ni `ÉCHEC` — et un tableau à 5 lignes vertes se lit exactement comme un tableau à 6. `is distinct from true` **ne le rattrape pas** ; seule une assertion de **cardinalité** le fait. ⛔ **② Ses propres sondes RPC sont d'abord passées pour la raison INVERSE de celle qu'elles testent** : `where id = (select meal_id from write_student_meal_plan(…))` **ne voit pas** la ligne insérée pendant la même instruction *(`CommandId` figé)*, donc `v_unknowns` valait `NULL`, et la sonde affirmait `is null` — **verte à cause du bug**. Corrigé en deux instructions + `into strict`. ⛔ **③ Retirer le `coalesce` seul n'aurait RIEN réparé : `greatest(0, null)` vaut `0`** — `greatest` ignore les `null`. Le correctif « évident » aurait été vert au `deno check` et faux en base. ⛔ **④ `coalesce(x, '{}')` sur un `null` JSON rend un jsonb `null`, pas `{}`** — que le `where … is not null` de la vue **ne filtre pas**. ⛔ **⑤ Une garde existante a mordu le correctif, et elle avait raison** : `household_freeze_test.ts` C5 ⑥ a refusé `error instanceof Error ? … : String(…)` — une `PostgrestError` rendrait `[object Object]`. Remplacé par `readableErrorMessage`. **⑥ Et `agent-gate` a BLOQUÉ le commit sur ce rouge** : ⚠️ **précision — la cicatrice du dépôt tient et ne dit pas le contraire.** `grep -c 'deno test' scripts/agent-gate.sh` → **1**, `grep -c vitest` → **0** : le gate lance bien les tests **Deno**, et toujours **pas** vitest. `H1`/`H2` restent entiers |


## ⟳ V0-E′ — le tableau de bord, AVANT le run  ✅ **LIVRÉ le 2026-08-21** *(commit `e0d37f36`)*

> ⟳ **Déplacé avant `V0-D` par la revue architecte** : quatre de ses dix compteurs (#1,
> #3, #5, #7) sont **détruits par le run**. Exécuté après, le tableau de bord de départ
> n'a plus de départ à mesurer.

| | |
|---|---|
| **quoi** | Dix compteurs, un fichier SQL rejouable, une valeur datée. C'est le « avant » de toutes les vagues. |
| **pourquoi** | Plusieurs lots sont **injugeables sans état de départ**. Et le patron du dépôt (`ANCHOR_REASONS`) est explicite : **toutes** les populations sont comptées, y compris celles qui passent. |
| **dépend de** | `V0-B` |
| **bloque** | ⛔ **`V0-D`** *(inversé)*, et l'évaluation de toutes les vagues |
| **fichiers** | ⟳ **LIVRÉ** : `scripts/keel_v0e_tableau_de_bord_20260821.sh` *(le pilote — **c'est LUI qu'on lance**)* · `…_20260821.sql` *(8 compteurs, lecture seule)* · `…_resolveur_20260821.ts` *(#3 et #4)*. ⟳ ~~un script Deno pour le compteur #2~~ ⛔ **le script Deno n'est PAS pour #2** : #2 ne peut pas exister ici *(il exige dix générations — lot `L2-lang`)*. Il est pour **#3 et #4**, qui exigent `food_composition.ts`, `meal_verdict.ts` et `plan_energy.ts`, **importés, jamais recopiés**. ⚠️ Ce que le fichier **recopie**, et il faut le savoir : les trois lecteurs d'entrée `readIngredient`/`readDishes`/`readPreparations` de `meal-energy-v1/index.ts:183-249`, **non exportés** *(§⑨ n° 14)* |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 à 23:11:21 CEST**, sortie archivée dans `scratchpad/2026-08-21-2312-V0E-tableau-de-bord.txt`. ⛔ **QUATRE valeurs du plan ne se reproduisent pas** : **#5** *(détruit par `V0-B`, **attendu**)* · **#6 et #10** *(détruits par `V0-C` à 21:03:48 UTC, ⛔ **ce que la fiche n'avait PAS prévu**)* · **#3** *(aucune des **six** définitions essayées ne rend 80,1 / 7,8)* |
| **direction** | aucune : c'est la mesure. ⟳ **Et c'est un défaut assumé** — la revue QA note qu'un lot dont la direction est « aucune » ne peut pas échouer. Il est gardé tel quel **parce que son échec est visible autrement** : si le fichier ne s'exécute pas, aucune vague ne peut se clore |
| **mesure APRÈS** | ⟳ **exécutée — LE SEUIL EST ATTEINT.** ① les **dix** lignes sortent en **une seule commande** (`bash scripts/keel_v0e_tableau_de_bord_20260821.sh`) ② **#2 est rendu « ⛔ N'EXISTE PAS (ce n'est pas 0) »**, littéralement, avec son obstacle chiffré *(2 plans `fr*` sur 180, **0 en `fr-FR` foyer**)* ③ **rejouable** : trois exécutions, `diff` ne rapporte **que la ligne d'horodatage** — corps identique au bit près, y compris entre l'archive et une relance postérieure au commit |
| **armé par** | ⟳ **RENFORCÉ — le script prouve désormais SES PROPRES gardes, au lieu de promettre qu'il les respecte.** ① la sortie est **datée et archivée** à côté du plan ② ⛔ **la preuve qu'il PLIE** : le même compteur est imprimé **sans** pliage — **43,2 %** contre **38,4 %** ; s'ils étaient égaux, le pliage ne ferait rien et **personne ne le verrait** ③ `grams_raw` n'est **ni extrait ni lu** ④ `coverage` et `resolved.length` sortent **séparés et nommés** |
| **coût** | **un petit lot** · ⟳ **plus un lot à part pour le compteur #2**, qui n'existe pas |
| **risque** | ⛔ **Trois pièges de mesure déjà payés** : jamais `grams_raw` en base (**figé à la génération**) ; toujours **après pliage** (le taux DESCEND : 37,8 % → 28,6 %) ; `coverage` et non `resolved.length` (96 % contre 69 %)  ⟳ ⛔ **ET UN QUATRIÈME, TROUVÉ PAR LE LOT : `\b` n'est PAS une frontière de mot en Postgres** *(c'est un backspace)*. Écrite avec `\b`, la définition « grammage » du compteur #8 rend **0 / 340** — **et un zéro a l'air d'une bonne nouvelle**. Avec `\y` : **181 / 340**. ⚠️ **Cinquième** : le dénominateur SQL (**9 810**) et celui du résolveur (**9 795**) ne sont pas le même — **15 lignes d'ingrédient ne portent aucun `term`** et `readIngredient` les jette 

> ⟳ ✅ **VÉRIFIÉ FINI le 2026-08-21 — le compteur #3 a résisté aux quatre attaques.**
> Rejoué au bit près six fois · le résolveur **est** celui des trois lanes edge · les trois lecteurs recopiés sont **identiques hors commentaires**
> à leur original *(la divergence de §⑨ n° 14 est réelle mais **non réalisée**)* · **les deux dénominateurs (10 039 et 5 161) se retrouvent par un SQL
> indépendant** · et ⛔ **le pliage est prouvé PAR MUTATION** : le neutraliser fait s'effondrer 700 → 787 plats et 93,6 → 90,9 %.
>
> ⛔ ⟳ **MAIS UNE RÉSERVE QUI DÉPLACE UN SEUIL DE LA VAGUE 2, et elle n'était dans aucun rapport :**
> **le numérateur de #3 contient les pesées par CONVENTION** *(condiments, `condimentMassFor`)* :
> ```
> foyer  9 399/10 039 = 93,6 %   dont convention   779  (8,3 %)   hors convention  85,9 %
> solo   1 880/ 5 161 = 36,4 %   dont convention   885 (47,1 %)   hors convention  19,3 %
> ```
> **Près de la MOITIÉ du « pesé » du solo n'est pas une quantité écrite par le modèle : c'est une masse conventionnelle de condiment.**
> ⇒ ⛔ **Tout seuil de vague 2 qui parle de « le modèle écrit ses quantités » doit se caler sur 19,3 %, pas sur 36,4 %** — sinon on refait,
> en plus petit, exactement l'erreur du 7,8 %. *(`L-1` et `L17` sont concernés.)*
>
> ⚠️ **Et la garde `grams_raw` se décrit mal** : ~~« n'est ni extrait ni lu »~~ — il **EST** extrait, **6 808 entrées portent la clé**,
> à l'intérieur des JSONB `dishes`/`preparations` que le pilote extrait en entier. Ce n'est pas une colonne. **Il n'est simplement jamais LU.**
> Un auditeur qui vérifierait la garde « en regardant l'extraction » conclurait à tort. Formulation juste : **« extrait avec la ligne, jamais lu »**.


### ⟳ Les dix compteurs — **RÉELS, mesurés le 2026-08-21 à 23:11 CEST** *(lot `V0-E′`, sortie archivée)*

| # | compteur | dénominateur | valeur | ⟳ |
|---|---|---|---|---|
| 1 | plans portant `dishes[].boxes` *(tableau **non vide**)* | plans | **0 / 180** | ✅ **reproduit** — et sur **les deux** définitions : clé présente **0** aussi. *(`preparations[].boxes` : **56** clés / **50** non vides — l'écart est reproduit, il justifie la définition retenue)* |
| 2 | journées calculables, par lane **et par langue** | journées | ⛔ **N'EXISTE PAS** *(rendu littéralement, jamais `0`)* | conforme. Obstacle chiffré : **2 plans `fr*` sur 180**, dont **0 en `fr-FR` foyer** *(1 `fr-FR` solo + 1 `fr-US` foyer)*. Lot `L2-lang` |
| 3 | lignes **résolues et pesées**, **après pliage** | lignes pliées | ~~foyer 80,1 % · solo 7,8 %~~ ⟳ **foyer 93,6 %** (9 399/10 039) · **solo 36,4 %** (1 880/5 161) | ⛔ **CORRIGÉ. Six définitions essayées, AUCUNE ne rend 80,1 / 7,8** *(détail en §②)* |
| 4 | motifs d'abstention | plats pliés | **533 / 444 / 144** sur **1 821** | ✅ **reproduit à l'unité** *(plats calculables 700/1 821 = **38,4 %**)* |
| 5 | inconnus par plan (médiane) | plans | ~~0~~ ⟳ ⛔ **NON MESURÉ** — **0/180** portent une valeur, la vue rend **0 ligne** | ⛔ corrigé par `V0-B`, **et c'était le but** |
| 6 | `crossed` / `legacy` / `assumed` | corps | ~~1 / 24 / 18 sur 43~~ ⟳ **5 / 24 / 18 sur 47** | ⛔ **DÉTRUIT PAR `V0-C`** à 21:03:48 UTC, **pendant ce lot**. Valeur d'avant : **1 / 24 / 18 sur 43** *(reproduite)* |
| 7 | plans dont la ceinture a vu **> 1 bouche** | plans à ceinture | **0 / 13**, `refused: 0` *(`checked` 34, `silenced` 16, `unknown_mouth` 0)* | ✅ reproduit |
| 8 | `portion_note` portant un grammage | entrées | **181 / 340** | ✅ reproduit, et les deux définitions coïncident. ⛔ **`\y`, JAMAIS `\b`** : avec `\b` le compteur rend **0 / 340** |
| 9 | contraintes **non couvertes / couvertes** | actives | **6** non couvertes · **35** couvertes · sur **58** *(35 medical · 14 strict · 9 preference)* | ✅ reproduit. ⟳ **Définition désormais CLOSE et publiée dans le SQL** : couvertes = `medical` **+ jeton** · non couvertes = `strict` **+ jeton** · **hors de portée = les 8 `diet` sans jeton** · `preference` (9) hors sécurité. Elle ferme l'ambiguïté ouverte par `Q-S2` |
| 10 | bouches sans `birth_date` · profils | bouches · profils | ~~25 / 88 · 1 193 / 1 312~~ ⟳ **25 / 92 · 1 193 / 1 313** | ⛔ **DÉTRUIT PAR `V0-C`.** Valeur d'avant : **25 / 88 · 1 193 / 1 312** *(reproduite)* |

> ⛔ ⟳ **LA LEÇON D'ORDRE, ET ELLE N'ÉTAIT PAS DANS LE PLAN.** La fiche protège #1, #3, #5 et #7 de `V0-D`, et c'est pour ça que
> `V0-E′` a été inversé devant lui. **Mais `V0-C` détruit #6 et #10**, et il l'a fait **pendant** l'exécution de `V0-E′` :
> à 21:03:48 UTC la fixture a ajouté 4 bouches, 4 lignes de corps **portant les deux axes d'activité**, et 1 compte.
> Les lectures de 23:00 rendaient `43 corps · 1 crossed · 88 bouches · 1 312 profils` — exactement le plan ; sept minutes plus tard,
> `47 · 5 · 92 · 1 313`. **Inverser `V0-E′` et `V0-D` était nécessaire, pas suffisant : il fallait `V0-E′` avant `V0-C` aussi.**
> *(Les deux jeux de valeurs sont dans l'archive, avec la requête qui les sépare.)*

> ⟳ **ET LE PLIAGE VA DANS LES DEUX SENS — la fiche n'en énonçait qu'un.** Mesuré, et le script l'imprime **exprès** :
> plats calculables **43,2 % sans pliage → 38,4 % avec** *(la baisse que le plan connaissait)*, mais lignes résolues-et-pesées
> **91,9 % → 93,6 %** (foyer) et **28,4 % → 36,4 %** (solo). **Les deux directions sont justes : elles ne portent pas sur le même objet.**
> Les lignes de préparation sont mieux pesées, et le pliage les duplique chez chaque plat consommateur.

## ⟳ V0-E′-bis — le tableau de bord ne compte pas ses propres lignes  ✅ **LIVRÉ, 2/2** *(commit `0d17e7f0`)*

> ⟳ **Ouverte par la vérification adversariale de `V0-E′`.** C'est **la leçon de `V0-B-bis` non appliquée**, sur le fichier
> où une perte muette coûterait le plus cher : celui qu'on relance **à la fin de chaque vague**.

| | |
|---|---|
| **quoi** | Le pilote refuse de rendre neuf lignes en disant qu'il en a rendu dix. |
| **pourquoi** | ⛔ **Prouvé par mutation, dans une copie hors dépôt.** Un compteur cassé pour ne rendre **aucune ligne** (`... from c6 where corps < 0`) donne : **`rc=0`**, **stderr vide**, **9 lignes** — `#1`…`#5` puis `#7`…`#10`, `#6` **disparu** — et un pied de page qui affirme littéralement *« dix lignes rendues »*. Le total est une **constante de chaîne**, jamais un compte : `grep -E '^[0-9]+\|' \| sort \| awk` imprime ce qui arrive. **C'est le troisième visage du `null` de `V0-B-bis` — la sonde qui n'existe pas — non corrigé ici.** |
| **dépend de** | `V0-E′` |
| **bloque** | rien — ⚠️ **mais il garde la clôture de CHAQUE vague**, puisque c'est la sortie de ce fichier qui la referme |
| **fichiers** | `scripts/keel_v0e_tableau_de_bord_20260821.sh` |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 à 23:45:44 CEST**, dans une **COPIE hors dépôt** *(le fichier du dépôt n'a jamais été saboté)*. ⛔ **Copie non mutée d'abord, pour prouver qu'elle mesure la même chose** : **10 lignes, `rc=0`, `md5` du corps `dd6ea3420c25ec2b5120eee37f55a3be`**. Puis `) from c6` → `) from c6 where corps < 0` ⇒ **`rc=0`**, **stderr 0 octet**, **9 lignes** *(`#1`…`#5` puis `#7`…`#10`, **#6 disparu**)*, et le pied de page affirmant littéralement *« FIN — dix lignes rendues »*. Assertion de cardinalité : **absente** |
| **direction** | le même sabotage rend **`rc<>0`** et nomme la ligne manquante. ⚠️ **Le tableau non saboté doit rester à 10 lignes et `rc=0`** |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-21 à 23:49 CEST — LES DEUX SEUILS ATTEINTS (2/2).** ① même sabotage ⇒ **`rc=1`**, **stdout vide**, et la ligne **nommée** : `⛔ CARDINALITÉ: 9/10 lignes rendues — MANQUANT(S): #6` · `rendus : 1 2 3 4 5 7 8 9 10`. ⟳ **Contre-épreuve sur un SECOND compteur** (`) from c9 where actives < 0`) ⇒ `rc=1`, `MANQUANT(S): #9` — **l'arme n'est pas câblée sur #6**. ② tableau intact ⇒ **10 lignes, `rc=0`, stderr vide**, corps **identique au bit près** à l'archive du 23:11 *(`diff` vide)*. ⚠️ **Le `md5` A PU être comparé** : mesures prises à 23:44:53 et 23:49:25, **avant toute écriture de `V0-D`** sur ces dix compteurs |
| **armé par** | ⛔ **La mutation elle-même** — pas la lecture du code. ⚠️ **Et il faut dire sa limite** : `expected_probes` écrit en dur attrape la ligne qui **s'évapore**, jamais celle qu'on retire **en mettant le compteur à jour** *(c'est la limite reconnue par `V0-B-bis`)* |
| **coût** | **une constante** — une ligne de `bash` |
| **risque** | ⚠️ **Le danger est LATENT, pas vivant** : les huit CTE SQL sont aujourd'hui des agrégats nus qui rendent **toujours** exactement une ligne, et une erreur SQL **dure** arrête bien le pilote (`ON_ERROR_STOP=1` + `set -euo pipefail`, testé : `rc=3`, zéro ligne). **Il mordra au premier `where`, `group by` ou `join` ajouté à un compteur** — c'est-à-dire au premier lot de vague 2 qui touchera ce fichier |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **LES DEUX ⛔ DE CETTE FICHE SE CONTREDISAIENT, et l'un ne pouvait pas être tenu.** *« le pied de page cesse d'affirmer un nombre qu'il ne compte pas »* et *« corps identique au bit près »* portent sur **la même ligne** : la ligne `FIN` **est DANS le corps** dont le `md5` est exigé — vérifié, l'archive va jusqu'à la ligne 105, `FIN` incluse. ⇒ **interpoler `$n`, ou retirer le nombre, CASSE le hash qui referme chaque vague.** **Tranché sur la réversibilité** *(§⑨ n° 16)* : le hash est préservé, « dix » reste au bit près **et n'est plus une affirmation** — le point est **inatteignable** si le compte n'est pas 10 — avec 8 lignes de commentaire qui disent pourquoi le mot n'a pas été remplacé, et **le geste inverse est nommé dans le fichier**. ⟳ **Second** : l'arme mord sur **un compteur quelconque**, prouvé sur `c6` **et** `c9`. ⟳ **Troisième, et c'est une règle de méthode** : **la copie hors dépôt devait être vérifiée NON MUTÉE d'abord** — sans ce contrôle, un `md5` divergent aurait été imputé au sabotage **au lieu de la copie** |


## V0-C — la fixture obligatoire  ✅ **LIVRÉ le 2026-08-21** *(commit `814c6243`)*

| | |
|---|---|
| **quoi** | Le foyer décrit ci-dessus existe en base, reproductible par un script. |
| **pourquoi** | **La ceinture de régime a tourné sur 13 plans, toujours avec UNE bouche, et n'a jamais refusé.** `cooking_session_states` = 0. `condition_ref` = 0. `laneMode` invisible. Tout ce que les documents décrivent du foyer pluriel est du code **lu**. |
| **dépend de** | `V0-A` |
| **bloque** | `V0-D` et la vérification de fin de **chaque** vague |
| **fichiers** | ⟳ `scripts/2026-08-21-2300-fixture-v0c-foyer-pluriel.ts` — ⛔ **et PAS « SQL + amorce d'appel edge » comme l'annonçait la fiche** : du SQL direct est exactement ce que le `risque` de cette même fiche interdit. Deno + RPC PostgREST, **aucun appel edge, 0 génération dépensée**. ⚠️ bouches sans compte |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-21 à 22:52:36 CEST — LES DEUX CHIFFRES SE REPRODUISENT.** foyers à ≥ 4 bouches : **7** · foyers portant simultanément végane + mineur + allergie `medical` + deux objectifs opposés : **0**. Base de départ : **31 foyers · 88 bouches · 7 allergies** |
| **direction** | exactement **1** foyer remplit les **six** conditions *(dont les quatre précisions ci-dessus)* |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-21 à 23:03–23:04 CEST — LES TROIS SEUILS ATTEINTS.** ① la requête unique des six conditions rend **1 ligne** : `b1959752-92c8-4038-8c17-992a77d68d21` · 4 bouches ② `surfaceFormsFor('peanut')` **sous Deno** → **8 formes**, et `householdAllergenRefs("arachide")` → `["peanut","arachide"]` ③ **rejouabilité** : 2ᵉ passage, `32 / 92 / 8` → `32 / 92 / 8`, aucun second foyer |
| **armé par** | ⟳ **l'arme MORD, prouvé par exécution DANS LES DEUX SENS.** Le libellé est surchargeable **pour qu'on puisse muter la garde depuis l'extérieur** — *un test paramétré par sa propre constante reste vert quand on change la constante*. `FIXTURE_ALLERGY_LABEL="fruits de mer"` ⇒ **exit 1, refs `["fruits_de_mer"]`, RIEN d'écrit** *(l'arme passe avant toute connexion)* ; `arachide` ⇒ passe. Et la rejouabilité n'est pas tenue par la politesse du code mais **par la base** : `household_members_one_per_user` est UNIQUE sur `user_id`  ⟳ ⚠️ **CORRECTION de la vérification : « tenue par la base » ne vaut QUE pour le maître.** `household_members_one_per_user` est UNIQUE sur une colonne **NULLABLE** — prouvé en `rollback` : un **second `Malo` sans compte s'insère sans broncher**, 5 bouches. Les trois bouches sans compte sont tenues **par le code** *(recherche par `first_name` dans le roster)*. Sur le maître, la base est la **3ᵉ** ligne de défense, après le retour anticipé de `ensureHousehold` et la garde `already_in_household` de la RPC |
| ⟳ **ce qu'il MANQUE** | ⛔ **La requête des six conditions n'existe NULLE PART sur le disque** — ni fiche, ni journal, ni `scratchpad/`. Le vérificateur a dû la **reconstruire**. ⛔ **Et telle qu'elle est décrite, elle ne mord pas si on retire le MAÎTRE** : retirer Malo, Anouk ou Yanis ⇒ **0 ligne** ; retirer Camille ⇒ **1 ligne, 3 bouches**. Les huit clauses ne contraignent **ni la taille du foyer ni la présence d'un propriétaire**. ⇒ **à archiver avec une 9ᵉ clause `count(distinct member_id) = 4`.** ⚠️ Second manque : le contrôle n° 10 du script *(« `surfaceFormsFor` non vide »)* est une **tautologie** — `armOrDie()` a déjà **sélectionné** le ref pour cette propriété ; c'est l'arme en amont qui porte la garde, pas ce contrôle |
| **coût** | **un petit lot** |
| **risque** | une fixture qui diverge du produit mesure autre chose. Chaque champ posé par **la même RPC que l'écran**, jamais par un `insert` direct  ⟳ **TROIS champs n'ont AUCUNE RPC, et c'est le produit lui-même qui les écrit en PostgREST** : `profiles` (⟳ ~~`api/uiLanguage.ts:54-61`, `api/keelClient.ts:371`~~ **deux références FAUSSES, corrigées par la vérification** : `keelClient.ts:371` est `loadKeelRole`, **une LECTURE**, et `uiLanguage.ts` écrit par `.update` en **60-63**, pas un `upsert` en 54-61. Références justes : `api/household.ts:1253`, `api/onboarding.ts:1936`, `api/mealEnergy.ts:577`, `api/chat.ts:355`. **Le fond tient — aucune RPC n'écrit `profiles`** —, la citation ne tenait pas), `student_goals` du maître (`api/household.ts :: createOwnerGoalRow`), et le compte (API admin GoTrue, convention commitée `scripts/run_memory_v2_action_e2e.mjs:117`). Les trois posés **avec le jeton du maître, sous RLS**, jamais en `service_role` |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **`S4` ne ferme pas une brèche d'ORDRE : il CRÉE la garde, et sur QUATRE surfaces** *(voir `S4`)*. ⛔ **Second : `generate-household-meal-v1` rend `goal_required` (409) sans la ligne `student_goals` du maître**, et `householdAppetite` est **tout-ou-rien** — une seule bouche sans corps ⇒ `null` ⇒ repli sur le compte de têtes. Une fixture strictement limitée aux six conditions aurait fait mesurer à `V0-D` **un repli, ou rien**. **Troisième : `keel_household_create` RECOPIE `profiles.full_name` et `profiles.birth_date`** — écrire le profil après le foyer donne un maître nommé `Me`, sans date. **Quatrième : les cinq personas documentés (`tests/real-personas/{paul,alex,eva,nina,rose}`) n'existent plus en base — 0 ligne** ; `get-jwt.sh` et `qa-reset-persona.sh` nomment des comptes morts |

## ⟳ V0-C-ter — la lane foyer EXIGE un coach, et la fixture n'en avait pas  ✅ **FERMÉ** *(fiche NEUVE, ouverte par `V0-D`)*

| | |
|---|---|
| **quoi** | Le maître de la fixture porte un lien `coach_clients` actif. |
| **pourquoi** | ⛔ **Le premier appel de `V0-D` a été refusé `no_coach` (409)** — `index.ts:2109`, **après** `loadHouseholdDoctrine`, donc **après** `window_required` et `goal_required`. **Cette porte n'est nommée NULLE PART** : ni dans `V0-C`, ni dans le `risque` de `V0-D` qui énumérait pourtant les deux autres. `V0-C` avait posé `student_goals` pour éviter `goal_required` et **s'était arrêtée une porte trop tôt**. ⚠️ **Et c'est un fait de PRODUIT, pas de fixture** : *« pivot foyer : B2C avant les coachs »* décrit un foyer qui compose seul ; **la lane, elle, refuse de composer sans coach.** |
| **dépend de** | `V0-C` |
| **bloque** | ⛔ **`V0-D`**, et la vérification de fin de **chaque** vague |
| **fichiers** | aucun — la RPC du produit suffit *(`keel_join_house_coach`, `StartPage.tsx:415`)* |
| **migration** | non |
| **mesure AVANT** | ⟳ `coach_clients` où `student_user_id = 53fb05ba…` : **0 ligne** ⇒ **409 `no_coach` en 0,11 s, 0 génération dépensée** |
| **direction** | le rattachement passe **par la porte que l'écran utilise**, jamais par un `insert` |
| **mesure APRÈS** | ⟳ **2026-08-21 21:50:44 UTC** — `keel_join_house_coach('FR')` sous le **jeton du maître** → `{"joined": true}`. Vérifié : `coach_clients` = coach maison / `active` / `seat_state=free` · ⛔ **`profiles.locale` reste `fr-FR`** et `country` reste `FR` *(la ligne qui écrasait la locale a été retirée de `keel_attach_student_to_coach` — c'est écrit dans son `prosrc`)* · `keel_role` passe `null → student` · une ligne `plan_versions` `published` provisionnée. **Le run suivant : 200.** |
| **armé par** | ⛔ **le refus lui-même, mesuré DANS LES DEUX SENS** : sans le lien ⇒ **409 en 0,11 s** ; avec ⇒ **200 en 102,8 s**. Le journal edge porte les deux : `keel.doctrine.variant reason:"no_coach"` puis `reason:"loaded", beliefs_kept:6` |
| **coût** | **une commande** |
| **risque** | ⛔ ⟳ **CE QUE ÇA RÉVÈLE, ET QUI GOUVERNE TOUTES LES VAGUES SUIVANTES : la doctrine servie est celle du COACH MAISON.** `KEEL Discovery`, version 1, `content_locale = en-US`, **6 croyances génériques**, 2 arbitrages, **`foods` VIDE des deux côtés**, et ⛔ **`table_scope_beliefs: 0`** — aucune croyance ciblée par objectif de table n'a été tirée, ⟳ ~~alors que la table porte `fat_loss` + `muscle_gain`~~ — ⚠️ **nuance mesurée le 2026-08-22 : le log dit `table_goals: 1`, pas 2.** Le `muscle_gain` est celui d'**Anouk, mineure**, et `index.ts:2103-2106` l'exclut **par décision explicite** *(« LES MINEURS N'Y ENTRENT PAS, ET C'EST UNE DÉCISION »)* : il n'atteint jamais le chargeur de doctrine. **Le tirer comme un manque serait trompeur** — le vrai fait est que la doctrine maison n'a **aucune variante par objectif** (`composition_steering[0].goal_scope = null`, `daily_practices[*].goal_scope = []`). Le correctif `LOT C ①` du 2026-08-19 est branché et **n'a rien à servir**, parce que la doctrine maison n'a **aucune variante par objectif**. ⇒ **toute mesure de vague sur cette fixture mesure un foyer SANS opinion de coach**, et il faut le savoir **avant** de lire un grammage |

## ⟳ V0-C-quater — `regime_belt.mouths` compte les régimes DÉCLARÉS  ✅ **LIVRÉ le 2026-08-22, seuil ③ ATTEINT** *(commit `24853247`, plan `66de9046`)*

| | |
|---|---|
| **quoi** | Une **seconde** bouche de la fixture porte un `diet` déclaré. |
| **pourquoi** | ⛔ **Le seuil ③ de `V0-D` est inatteignable avec la fixture telle qu'elle est, et ce n'est PAS un tirage malheureux.** `meal_generation.ts:4241-4292` : `mouths = mouthRegimes.size`, et `mouthRegimes` n'est peuplé que par `boxMemberDiets` = `household_members.diet` (`index.ts:4434-4437`), **en sautant explicitement les `null`** (`:4251`). La fixture a : Malo `vegan`, Camille `null`, Anouk `null`, Yanis `null`. ⇒ **`mouths` ne peut valoir que 1, quelle que soit la génération.** ⚠️ ⛔ **Et la table « LA FIXTURE OBLIGATOIRE » se trompe de mécanisme** : elle attribue à *« 1 végane »* la ligne *« la ceinture n'a jamais vu plus d'une bouche »*. **Un végane SEUL ferme la divergence au lieu de l'ouvrir** — le plat commun devient végane pour tout le monde (`strictest_regime: vegan`, `regimes: 1`), **et alors plus personne ne diverge par le régime.** 

> ⟳ ⛔ **MÉCANISME RÉFUTÉ le 2026-08-22 — la conclusion tient, le chemin est faux, et la `direction` envoyait le lot dans le mur.**
> ~~`mouthRegimes` n'est peuplé que par `boxMemberDiets` = `household_members.diet`~~ : **`m.diet` ne vient PAS de `household_members.diet`.**
> Il vient de `memberRegime(r.diet)` où `r` est une ligne de **`keel_household_roster_for`**, dont le `prosrc` tranche :
> ```sql
> case when hm.user_id is null then hm.diet
>      else coalesce((select sc.diet_ref from student_safety_constraints sc
>                      where sc.user_id = hm.user_id and sc.kind='diet' and sc.status='active' …), …)
> end as diet
> ```
> ⇒ **pour une bouche AVEC COMPTE, `household_members.diet` est IGNORÉ** : la source est `student_safety_constraints.diet_ref`.
>
> **Ce que ça change :** ① *« mouths = 1 aujourd'hui »* **tient** *(Malo sans compte porte `vegan` ; Camille a 0 ligne `student_safety_constraints`)*.
> ② ⛔ **Mais le seuil ③ n'est PAS structurellement fermé** — c'est **un trou de FIXTURE**, pas une fatalité : il s'ouvre par une écriture.
> ③ ⛔ **Et l'exemple de l'ancienne direction était un PIÈGE** : elle proposait *« un `vegetarian` ou un `pescatarian` sur **Camille** ou Yanis »*.
>   Sur **Camille — la seule bouche AVEC compte** — écrire `household_members.diet` **ne ferait strictement RIEN**. Le lot repartirait avec
>   `mouths = 1` et **croirait le moteur cassé**. ④ À noter aussi : `omnivore` traverse `memberRegime` en `null`, donc `diet_asked` seul n'élève jamais `mouths`.

| **dépend de** | `V0-C` |
| **bloque** | le seuil ③ de `V0-D`, et la **fin de vague 5** *(« l'union de deux régimes mord pour la première fois »)* |
| **fichiers** | `scripts/2026-08-21-2300-fixture-v0c-foyer-pluriel.ts` — **un `diet` de plus sur une bouche** |
| **migration** | non |
| **mesure AVANT** | ⟳ **run réel du 2026-08-21 21:52** : `regime_belt = {mouths:1, checked:12, kept:12, refused:0, bites:0, separated:0, silenced:0}` · tableau de bord #7 : **0/14** |
| **direction** | ⟳ **CORRIGÉE.** Le second régime ne doit être **ni plus strict ni emboîté** dans le végane — `dietDiverges` sort `false` dès que `exclusionCount(own) >= exclusionCount(strictest)` : un `vegetarian` ou un `pescatarian` ouvre la divergence, **un second `vegan` ne l'ouvrirait pas**. ⛔ **ET IL FAUT ÉCRIRE AU BON ENDROIT** : sur **Anouk ou Yanis** *(sans compte)* ⇒ `household_members.diet` ; sur **Camille** *(avec compte)* ⇒ **une ligne `student_safety_constraints` active**, jamais `household_members.diet` |
| **mesure APRÈS** | ⟳ **2026-08-22, 02:26:10 → 02:27:16 UTC — HTTP 200 en 66,25 s**, plan `66de9046`. ✅ **SEUIL ATTEINT** : `regime_belt.mouths` = **2** · compteur #7 **0/14 → 1/15**. `checked = kept + refused` **tenu (`0 = 0 + 0`)** — ⛔ **mais VIDE, et il faut l'écrire** : `checked` ne s'incrémente **que** dans la boucle des appartenances de boîte, **et le modèle n'a écrit AUCUNE boîte**. **La propriété testée est TAUTOLOGIQUE sur ce plan** ⇒ fiche `V0-C-quater-a`. **1 GÉNÉRATION** *(`gpt-5.6-luna`, **20 976 tokens**, 63,6 s)* + 1 relance de secours *(634, hors plafond)* |
| **armé par** | ⛔ **une génération, et il en a fallu une.** ⟳ **Et l'arme du GESTE mord dans les DEUX SENS, sans dépenser un jeton** : `V0C_SECOND_REGIME=vegan` ⇒ **exit 1, RIEN d'écrit** *(« égal au plus strict »)* · `=omnivore` ⇒ **exit 1** *(traverse `memberRegime` en `null`)* · défaut `vegetarian` ⇒ écrit. Plus **la sonde `has_account` sur Camille, AVANT toute écriture** |
| **coût** | **un petit lot + 1 génération** |
| **risque** | ⟳ ⛔ **RÉFUTÉ SUR LE FOND : le plan du 22/08 est végane AUSSI** — 84 ingrédients, **zéro produit animal**. Le second régime **n'a rien dé-véganisé**, parce que `strictestRegimeAt` rend toujours `vegan` : **c'est le comportement JUSTE**. ⟳ ⛔ **ET UN RISQUE QUE PERSONNE N'AVAIT ÉCRIT : le run a TRONQUÉ `3c781a71` de 7 j à 1 j** ⇒ fiche `V0-C-quinquies` |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① LE PIÈGE ÉTAIT PLUS DUR QU'ÉCRIT** : écrire sur Camille n'aurait **même pas** été un no-op muet — **la RPC du produit REFUSE** (`{"ok":false,"reason":"has_account"}`, mesuré). **Le silence n'était atteignable que par un `insert` direct.** ⛔ **② `dietDiverges` EST GATÉ PAR L'OBJECTIF, PAS PAR LE RÉGIME.** Journal du run : `regimes: 2` *(la première fois que le moteur en voit plus d'un)*, **mais `diverging: [Anouk]`** — **Yanis, le porteur du second régime, NE DIVERGE PAS**, et Anouk, qui diverge, **n'a aucun régime déclaré**. Prouvé par exécution : `REGIME_PROTEIN_CEILING = "full"` ⇒ `maintenance` → `balanced` passe dessous, `fat_loss` → `full` égalise, **seul `muscle_gain` → `larger` franchit**. ⇒ ⛔ **Déclarer un second régime moins strict n'ouvre PAS un second plat, et la fin de vague 5 est HORS D'ATTEINTE de cette fixture telle quelle** : il y faudrait un `muscle_gain` sur une bouche **majeure**. ⛔ **③ LES BOÎTES SONT UN TIRAGE** ⇒ fiche **`L6′-b`**. ⛔ **④ Chaque run réel AMPUTE le plan de référence du précédent** ⇒ fiche **`V0-C-quinquies`** |

## ⛔ L6′-b — les BOÎTES et les PLATS DÉDIÉS sont un TIRAGE, pas un produit *(fiche NEUVE — elle renverse le seuil ② de `V0-D`)*

| | |
|---|---|
| **quoi** | Un plan foyer porte des boîtes **parce que le produit les exige**, pas parce que le modèle a bien voulu. |
| **pourquoi** | ⛔ **Deux runs, MÊME prompt, résultats opposés — mesuré, pas soupçonné.** `prompt_version` **IDENTIQUE**, même fixture, même fenêtre, même modèle : `3c781a71` *(21/08)* → `boxes` **38**, `with_box` **24/24**, `dish_owners.declared` **18** · `66de9046` *(22/08)* → `boxes` **0**, `with_box` **0/14**, `declared` **0**, `box_sizing.anchor` **tout à zéro**. ⇒ ⛔ **le compteur #1 (`0/180 → 1/181`) mesure UN COUP DE DÉ**, et **le seuil ② de `V0-D` NE SE REPRODUIT PAS**. ⚠️ **Et l'alarme ne sonne pas** : `mouths_unboxed: 0` — le compteur qu'on regarde *« pour savoir si le service tient »* — est un **FAUX ZÉRO**, parce qu'il compte les bouches oubliées **des repas boîtés**, et qu'il n'y en a aucun. `issues` ne porte **rien**. |
| **dépend de** | `V0-D`, `V0-C-quater` |
| **bloque** | ⛔ **`L6′`** *(son seuil suppose des boîtes)*, `L9bis`, `L11★`, `Q-G19-a` |
| **fichiers** | `generate-household-meal-v1/index.ts` *(la consigne)* · `meal_generation.ts` *(`boxCounts`, `mouths_unboxed`)* |
| **migration** | non |
| **mesure AVANT** | ⟳ **2 plans foyer v4 en base : `boxes` = 38 et 0** ; `expected` 72 puis 42 ; **`mouths_unboxed` = 0 DANS LES DEUX CAS** |
| **direction** | ⛔ **on ne « demande pas mieux » au modèle — on rend l'ABSENCE VISIBLE, puis on décide.** ① `mouths_unboxed` sort de son faux zéro ② une `issue` quand `with_box = 0` alors que `expected > 0`. **Réparer le TAUX est une décision de la `VAGUE D`, pas d'un compteur** |
| **mesure APRÈS** | les **deux** plans rejoués par le module *(0 génération)* : le second rend **`with_box 0 / expected 42` + une `issue` nommée**. **Seuil : le plan vide cesse d'être indiscernable d'un plan servi** |
| **armé par** | **les deux plans sont EN BASE** — le lot se rejoue **sans dépenser une génération** |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **Un compteur qui alarme sur 1 plan sur 2 sera lu comme un bug du compteur.** La fiche doit dire, **à côté du chiffre**, que **c'est le PLAN qui est vide**, pas la mesure |

## ⟳ V0-C-quater-a — `regime_belt.checked` est SUBORDONNÉ aux boîtes *(fiche NEUVE, petite)*

| | |
|---|---|
| **quoi** | La propriété `checked === kept + refused` cesse d'être vraie **par vacuité**. |
| **pourquoi** | ⛔ **Mesuré** : `{mouths: 2, checked: 0, kept: 0, refused: 0}`. **Le seuil ③ est ATTEINT et la ceinture n'a examiné RIEN.** `checked` ne s'incrémente **que** dans la boucle des appartenances de boîte. ⇒ **`checked = kept + refused` est une identité `0 = 0` dès qu'un plan n'a pas de boîte** — c'est-à-dire, aujourd'hui, **un plan foyer sur deux**. ⛔ **Un seuil qui ne peut pas échouer n'est pas un seuil.** |
| **dépend de** | `V0-C-quater` |
| **bloque** | la lecture du seuil ③, et la vérification de **fin de vague 5** |
| **fichiers** | `meal_generation.ts` *(`regimeBelt`)* · le compteur #7 du tableau de bord |
| **migration** | non |
| **mesure AVANT** | ⟳ **#7 = 1/15 plans à `mouths > 1`, et ce plan-là a `checked = 0`** |
| **direction** | le compteur #7 est **ventilé** : `mouths > 1` **et** `checked > 0` d'un côté, `checked = 0` de l'autre. ⚠️ **La seconde colonne n'est pas une erreur** — elle dit « deux régimes vus, aucune boîte à examiner » |
| **mesure APRÈS** | deux lignes, **total inchangé**. **Seuil : `avec_boîtes = 0/15`, `sans_boîte = 1/15` exactement** |
| **armé par** | muter la vue pour compter `checked >= 0` doit rendre **rouge** — sinon le seuil est encore une identité |
| **coût** | **une constante** |
| **risque** | ⚠️ **Sans ventilation, `mouths >= 2` se lira comme « la ceinture tient » alors qu'elle n'a rien regardé** — la famille exacte du faux zéro que `V0-B` a effacé |

## ⛔ V0-C-quinquies — chaque run réel TRONQUE le plan de référence du précédent *(fiche NEUVE)*

| | |
|---|---|
| **quoi** | Un run de vérification cesse d'amputer le plan sur lequel la vague d'avant a mesuré. |
| **pourquoi** | ⛔ **Mesuré le 2026-08-22 à 02:27:16 UTC** : le run de `V0-C-quater` a fait passer `3c781a71` — **le plan de `V0-D`** — de **7 jours à 1 jour**, avec `generated_from.truncated_by` posé. ⚠️ **Ce n'est PAS un défaut** : `write_student_meal_plan` raccourcit un plan vivant qui commence **avant** la nouvelle fenêtre, et `firstBlockingPlan` ne refuse que celui qui commence **le même jour ou après**. ⇒ ⛔ **La « vérification en conditions réelles de fin de CHAQUE vague » ampute MÉCANIQUEMENT la précédente.** `dishes` et `generated_from.household` restent **intacts** *(les compteurs #1, #7, #8 ne bougent pas)* ; **ce qui devient faux, ce sont les lectures de `duration_days`** — et rien ne les distingue. |
| **dépend de** | `V0-D` |
| **bloque** | la **comparabilité** des plans de référence entre vagues |
| **fichiers** | le protocole de fin de vague, §⑦ |
| **migration** | non |
| **mesure AVANT** | ⟳ **`3c781a71` : `duration_days` 7 → 1**, `truncated_by` posé |
| **direction** | ⛔ **on ne touche PAS à la RPC — c'est le produit, et il a raison.** Ce qui change est le **protocole** : chaque run écrit la durée du plan précédent **avant et après**, et le §⑧ note la troncature. ⚠️ **Retirer le plan précédent serait pire** : une suppression de données |
| **mesure APRÈS** | le journal porte, pour **chaque** run réel, `plan précédent : N j → M j`. **Seuil : les deux runs déjà faits sont rattrapés rétroactivement** |
| **armé par** | `truncated_by` **est en base** — le contrôle se rejoue en SQL, **sans génération** |
| **coût** | **une commande + deux lignes de journal** |
| **risque** | ⛔ **Le jour où une vague lira `duration_days` sur `3c781a71` pour normaliser une mesure « par jour », elle divisera par 1 au lieu de 7** — et le chiffre sortira **sept fois trop grand, sans rien qui rougisse** |


## ⟳ Q-G19-a — les facteurs d'ancrage ne sont journalisés nulle part *(fiche NEUVE — elle REMPLACE la promesse « journalise les deux » de `Q-G19`)*

| | |
|---|---|
| **quoi** | Le facteur **par bouche et par jour**, et celui **retenu pour le plan**, sortent dans le journal. |
| **pourquoi** | ⛔ **`Q-G19` demandait de « journaliser les deux et chiffrer l'écart » sur un run réel. Le run est fait, et l'écart n'est PAS chiffrable** : `box_sizing.anchor` ne rend que des **motifs** (`anchored/clamped/no_delivery/day_incomplete/…`), **jamais une valeur**. ⚠️ **Conséquence directe et mesurée** : on ne peut pas dire si les **6 `clamped`** touchent `ANCHOR_FACTOR_MAX = 3,00`, `ANCHOR_FACTOR_MIN = 0,60`, ou le **plafond physique** `MEAL_MAX_GRAMS_PER_KG × poids / maxMealGrams` — **les trois rendent le même mot.** C'est exactement la question que `L11★` doit trancher, et elle est aveugle. |
| **dépend de** | `V0-D` |
| **bloque** | `Q-G19` *(qui ne peut pas se fermer sans lui)*, et par lui `L13` |
| **fichiers** | `_shared/keel/mouth_anchor.ts` · `generate-household-meal-v1/index.ts:5358-5374` |
| **migration** | non |
| **mesure AVANT** | ⟳ ⛔ **le désaccord est CONFIRMÉ par lecture, sur du code EXÉCUTÉ.** `householdAnchors` (`mouth_anchor.ts:706`) est clé par `"<memberId> <jour>"` ⇒ **24 facteurs** *(4 bouches × 6 jours composés)* ; `index.ts:5358-5374` garde celui dont `|facteur − 1|` est **minimal**, par bouche ⇒ **2 facteurs retenus** (`anchor_applied = 2`). **22 jetés, 91,7 %** — ⛔ **et ce sont les jours les plus EXTRÊMES qui tombent, par construction du critère.** L'écart en **valeur** reste non chiffrable : **rien ne les journalise** |
| **direction** | ⛔ **on ne « répare » pas le désaccord dans ce lot — on le REND VISIBLE.** Choisir entre le facteur du jour et celui du plan est une décision de la **`VAGUE D`**, pas d'un compteur |
| **mesure APRÈS** | un journal portant, **par bouche** : les `n` facteurs bruts, le retenu, et `max − min`. **Seuil : sur le plan `3c781a71` rejoué, les 24 valeurs sortent, et l'amplitude par bouche est chiffrée** |
| **armé par** | le plan `3c781a71` est **en base** : le lot se rejoue sans dépenser une génération |
| **coût** | **un petit lot** |
| **risque** | ⚠️ Journaliser un facteur par bouche et par jour, c'est **écrire un nombre qui vise une personne**. Il va au **journal**, jamais à l'écran — *cicatrice « Zoé : 0,85 de la part de Marc », lu à voix haute à table* |

## ⟳ V0-E′-ter — le compteur #8 mesure ce que la v4 a délibérément vidé *(fiche NEUVE, petite)*

| | |
|---|---|
| **quoi** | Le compteur #8 cesse de lire une réparation comme une régression. |
| **pourquoi** | ⟳ **Mesuré sur le plan neuf** : `portion_note` portant un grammage passe de **181/340 à 181/344** — le dénominateur monte de 4, **le numérateur ne bouge pas**. ⟳ **Les 4 notes ne portent AUCUN chiffre, et c'est CORRECT** — ⚠️ *(citation corrigée : seules **2 sur 4** disent « Mettre tous les composants ensemble sur l'assiette » ; Malo porte « Mettre les légumes d'abord… » et Anouk « Mettre la protéine et le féculent d'abord… ». **Le fait — zéro grammage — tient sur les quatre**)* — v4 a mis le gramme **dans le bac**, pas dans la phrase *(cicatrice « la phrase de table contredit le couvercle »)*. ⇒ ⛔ **le compteur #8 va DESCENDRE à chaque plan v4, et sa baisse se lira comme une régression** alors qu'elle est la réussite de `L6′`. |
| **dépend de** | `V0-E′` |
| **bloque** | la lecture du seuil de `L6′` *(« le filtre retire ≥ 100 des 181 »)* |
| **fichiers** | `scripts/keel_v0e_tableau_de_bord_20260821.sql` |
| **migration** | non |
| **mesure AVANT** | ⟳ **181 / 344**, non ventilé |
| **direction** | le compteur est **ventilé** `plans à boîtes` / `plans sans boîte`. ⚠️ **La part des plans sans boîte doit rester à 181/340 ; celle des plans à boîtes doit tendre vers 0** |
| **mesure APRÈS** | deux lignes au lieu d'une, et **le total inchangé**. **Seuil : `sans_boîte = 181/340` exactement, `à_boîtes = 0/4`** |
| **armé par** | le plan `3c781a71` est le premier cas — **il doit apparaître du bon côté** |
| **coût** | **une constante** |
| **risque** | ⚠️ **Sans ventilation, ce compteur devient un compteur qui MENT dans le sens alarmiste** — la famille inverse du faux zéro, et tout aussi coûteuse |


## V0-D — ⛔ LE RUN RÉEL  ✅ **LIVRÉ le 2026-08-21** *(commit `9fc11fc2`, plan `3c781a71-da7c-4abe-8a99-4a6ed7445c99`)*

| | |
|---|---|
| **quoi** | On génère un plan pour la fixture, en `intent: commit`, et on regarde ce qui arrive en base. |
| **pourquoi** | **Neuf mécanismes n'ont jamais produit une ligne** : `dishes[].boxes`, `box_sizing.anchor`, le sas du lot 18, ses 4 compteurs, la ceinture à plusieurs bouches, `condition_ref`, `cooking_session_states`, `laneMode`, et le modèle réparé le 2026-08-19. |
| **dépend de** | `V0-A`, `V0-B`, ⟳ `V0-B-bis`, `V0-E′`, `V0-C` — ⟳ ⛔ **et `V0-C-ter`, une porte que PERSONNE n'avait vue** |
| **bloque** | `L6′`, `L9bis`, `L11★`, `L13`, `L38` — et toute mesure en grammes |
| **fichiers** | ⟳ `scratchpad/2026-08-21-2355-V0D-run-reel.sh` + 4 archives horodatées. ⛔ **« Le lot EST ce que le run casse » s'est vérifié : il ouvre SIX fiches** — `V0-C-ter`, `V0-C-quater`, `L26-0`, `L6′-a`, `Q-G19-a`, `L-anchor-nodelivery` — **plus une petite**, `V0-E′-ter` |
| **migration** | non |
| **mesure AVANT** | `dishes[].boxes` **0/180** · `box_sizing.anchor` **0/46** · `food_composition_pending` **0** · `regime_belt` à `mouths>1` **0/13** |
| **direction** | ⚠️ **écrite d'avance, et ce n'est pas « ça marche »** : on s'attend à ce que le run **sorte incomplet**, et à ce que l'écart nomme les lots réels. Les boîtes apparaissent ; l'ancrage rend `day_incomplete` sur la plupart des jours ; la ceinture de régime mord **pour la première fois**  ⟳ ⛔ **VERDICT SUR LA DIRECTION, sans la réécrire — un tiers juste, un tiers faux, un tiers faux POUR UNE RAISON STRUCTURELLE.** ✅ **Les boîtes apparaissent** *(38, une première)*. ⛔ **`day_incomplete` sort à `0`** et le motif réel est **`no_delivery` 17/24** — la journée n'existe pas du tout pour la bouche, ce qui n'est **pas** une journée trouée *(fiche `L-anchor-nodelivery`)*. ⛔ **La ceinture NE POUVAIT PAS mordre** : `mouths` compte les `diet` **déclarés**, et la fixture n'en a qu'un |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-21, 21:50:54 → 21:52:37 UTC — HTTP 200 en 102,8 s.** ⛔ **Et `intent: "commit"` N'EXISTE PAS** *(§⑨ n° 17)* : la lane n'accepte que `replace_current`, `prepare_next`, `draft`. Le mot qui écrit est **`prepare_next`**. ① `jsonb_array_length(dishes->0->'boxes')` → **`0`** ⛔ **la REQUÊTE est manquée**, ✅ **la PROSE est atteinte** : **24 plats / 36 boîtés, 38 boîtes**, compteur #1 **0/180 → 1/181**. ⚠️ `dishes[0]` est un **petit-déjeuner**, et aucun petit-déjeuner ne porte de boîte — **c'est le seuil qui vise un index arbitraire** ② `box_sizing.anchor` **PRÉSENT** ✅ ③ `regime_belt.mouths` = **1** ⛔ **MANQUÉ, et structurellement inatteignable** *(fiche `V0-C-quater`)* |
| **armé par** | ⛔ pas un test : **une ligne en base** (`3c781a71`), plus `V0-E′` relancé à **23:56:17** et archivé à côté de celui de 23:11 — ⟳ **six compteurs bougent** — ⛔ ~~aucun dans le mauvais sens~~ **RÉFUTÉ le 2026-08-22 : DEUX descendent.** **#8** `181/340 = 53,2 % → 181/344 = 52,6 %` *(le numérateur ne bouge pas, le dénominateur monte)* et **#7** `0/13 → 0/14` — un plan de plus qui **échoue** le critère. ⚠️ **Et la contradiction était interne** : ce lot a lui-même ouvert `V0-E′-ter` **pour dire que #8 va descendre**. À l'intérieur de #4, même famille : les 36 plats neufs apportent **14 `unknown_ingredient` = 38,9 %** contre **24,4 %** pour le corpus — le titre monte pendant qu'une sous-mesure descend : #1 `0/180 → 1/181` · #3 **93,6 % → 93,6 %** *(le plan neuf : 272/290 = **93,8 %**)* · #4 plats `1821 → 1857` · #5 `0/180 → 1/181`, la vue rend **1 ligne** · #7 `0/13 → 0/14` · #8 `181/340 → 181/344`. #2 #6 #9 #10 **inchangés** |
| **coût** | ⟳ **1 GÉNÉRATION SUR 3** — `gpt-5.6-luna`, **26 906 tokens**, 100 059 ms sous les 300 000 en vigueur ; plus **1 relance de secours** (`composition_fill`, `gpt-5.4-nano`, 623 tokens, **hors plafond**), `protein_anchor_retry: false`. Un **409 gratuit** avant. ⛔ ⟳ **LE §⑩ SOUS-ESTIME D'UN FACTEUR 2** : il annonce *« ~13 000 par génération »*, le réel est **26 906** sur une fenêtre de 7 jours à 4 bouches. **Les plafonds des vagues 2 et 4 se posent en connaissance de 26 900, pas de 13 000** |
| **risque** | ⛔ **Redémarrer `functions serve` avant.** ⛔ Un **401 « Invalid JWT »** ⇒ `./scripts/check-local-jwt-alg.sh` puis lire `docs/keel/JWT-HS256.md`, **jamais** `verify_jwt = false`. ⚠️ La lane foyer n'a **qu'une relance** et **aucune vérification**  ⛔ ⟳ **TROIS FAITS AJOUTÉS PAR LA VAGUE 0, à connaître AVANT d'appeler :** ① **`window_required` (400) est levé AVANT `goal_required` (409)** (`index.ts:1261-1265`) — **un 400 ne veut donc PAS dire « objectif manquant »**, il veut dire « fenêtre absente ». ② ⛔ **`composition_fill_io.ts` a changé (`V0-B-bis`) ⇒ redémarrer `functions serve` est OBLIGATOIRE**, pas prudent : le runtime sert un cache périmé des `_shared`, et **le correctif du faux zéro vit dans l'arbre de travail**. Sans redémarrage, le run réécrit exactement le mensonge que `V0-B` a effacé. ③ **La fixture est couverte jusqu'au `2026-09-20`** (`households.free_until`, posé à la création) et **aucune RPC ne réécrit cette date** : après cette échéance elle rendra `household_frozen`, et la « vérification de fin de chaque vague » avec elle  ⛔ ⟳ **QUATRIÈME FAIT, ET C'EST CELUI QUI A ARRÊTÉ LE PREMIER APPEL : `no_coach` (409)**, levé **après** la fenêtre ET l'objectif (`index.ts:2109`). **La lane foyer REFUSE de composer pour un foyer sans coach** — et `V0-C` ne posait aucun lien, alors qu'elle s'était donné la peine de fermer `goal_required` juste avant. ⚠️ **C'est un fait de PRODUIT, pas de fixture** : *« pivot foyer : B2C avant les coachs »* décrit un foyer qui compose seul ; **la lane, elle, exige un `coach_clients` actif.** Fiche `V0-C-ter` |

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

## S1 — la ligature tue le plancher d'allergie  ✅ **LIVRÉ le 2026-08-22** *(commit `8cfeb193`)*

| | |
|---|---|
| **quoi** | Quelqu'un qui écrit *« je suis allergique aux œufs »* déclenche le plancher, comme celui qui écrit *« oeufs »*. |
| **pourquoi** | ⟳ **Exécuté, pas lu** : `safety_constraint_floor.ts` porte sa **propre** `normalize()` (l. 62-78), sans le repli de ligatures du 2026-08-19 présent dans `allergen_catalog.ts:211-215`. Mesuré par `deno eval` : `"je suis allergique aux œufs"` ⇒ **`null`** · `"…oeufs"` ⇒ `{allergen_ref:"egg", severity:"medical"}`. Locale par défaut : **`fr-FR`**. Le plancher retombe alors sur le tirage du dispatcher — ce qu'il existe pour fermer. |
| **dépend de** | rien |
| **bloque** | `S2`, `M1b′`, le pilote payant |
| **fichiers** | `_shared/keel/safety_constraint_floor.ts:62-78` — déplier `œ→oe`, `æ→ae`. ⛔ **Ne PAS fusionner les deux modules** : le découplage est délibéré et documenté |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 01:18:51 CEST.** ~~les 6 formes de surface × 2 graphies~~ ⛔ **« formes de surface » est FAUX** : le catalogue ne porte **AUCUNE ligature littérale** — **0 sur 100 formes distinctes**, 26 slugs, 151 entrées. La grille réelle est **6 FORMULATIONS de déclaration × 2 graphies** : **0/6 sous ligature**, **6/6 sous digramme**, TOTAL **6/12** ; `"jaime bien les pates"` ⇒ `null` |
| **direction** | 12/12 passent, et le cas neutre reste `null`. ⚠️ **Aucune régression sur le digramme** |
| **mesure APRÈS** | ⟳ **RÉELLE, 2026-08-22 01:21:48 CEST — les 3 seuils ATTEINTS.** ① **12/12**, mêmes `kind` et `severity` dans les deux graphies ② cas neutre **`null`**, plus 5 témoins *(désarmements et R7 sous ligature)* ③ balayage : formes du catalogue concernées = **2 entrées / 1 forme distincte** *(`"oeuf"`, sous `egg` ET `eggs`)*, couvertes **2/2 = 100 %**. ⛔ **Formes portant `æ` ou `ae` : ZÉRO** — cette moitié du dépliage n'est exercée par aucun cas qui mord *(§⑨ n° 21)*. Suite `_shared/keel` : **3 994 passed, 0 failed** ; `deno check` des 3 entrypoints **rc=0** |
| **armé par** | ⛔ **un cas qui MORD et un cas qui PASSE** — le second est `"jaime bien les pates"` ⇒ `null`. ⟳ **Plus une TROISIÈME épreuve : la mutation**, sur copie hors dépôt, **non mutée vérifiée d'abord** *(14/14, rc=0)* : retirer le dépliage `œ` ⇒ **rc=1, 12/2** ; retirer `æ` seul ⇒ **rc=0, 14/14** ⚠️. ⟳ **Et le balayage porte une ASSERTION DE CARDINALITÉ** — sans elle, une boucle sur zéro cas est **verte sans rien prouver** *(cicatrice `V0-B-bis`)* |
| **coût** | **une constante** |
| **risque** | ⛔ **Jamais `unicode_escape`** : mojibake que ni `tsc` ni la parité n'attrapent. ⟳ **Tenu, et vérifié sur le BLOB COMMITÉ, pas sur le disque** — le dépôt est partagé : chemin exécuté en `\u0153`/`\u00e6`, **ASCII pur** *(`2f 5c 75 30 31 35 33 2f`)* ; ligatures littérales `c5 93`/`c3 a6` **uniquement** en commentaire et dans les tests. **0 mojibake** |

## S1b — `fruits_de_mer` : l'intake ET la sortie  ✅ **LIVRÉ le 2026-08-22, 1 seuil sur 2** *(commit `29495bb7`)*

| | |
|---|---|
| **quoi** | Une allergie déclarée sous un mot français cesse d'être invisible aux deux bouts. |
| **pourquoi** | ⟳ **Deux défauts, pas un — la v1 n'en voyait qu'un.** ① `"allergique aux fruits de mer"` ne mord pas au plancher : `fruits de mer` n'est pas une forme de surface de `shellfish`. ② ⛔ **Et la ceinture de SORTIE est armée et morte** : `householdAllergenRefs` retombe sur le slug littéral `fruits_de_mer`, pour lequel `surfaceFormsFor` rend `[]` — **elle cherche une chaîne française dans un texte anglais, ne la trouvera jamais, et ne dira rien.** La base porte **2 lignes**, dont **1 active** écrite le 2026-08-04, avant que l'alias n'existe.  ⟳ ⛔ **ET UN TROISIÈME DÉFAUT QUI RENVERSE LE GESTE QUE CETTE FICHE PRÉPARAIT** : **`shellfish` — le jeton CANONIQUE, 4 lignes actives — ne mordait NI sur « fruits de mer » NI sur « seafood »**. La table portait **neuf ANIMAUX** *(prawn, shrimp, crab, lobster, mussel, oyster, scallop, crevette, crustace)* et **aucun des deux mots COLLECTIFS**. ⇒ ⛔ **migrer la ligne vers `shellfish` sans réparer le catalogue aurait fait passer la couverture de 1 morsure à 0.** ⛔ **Quatrième : la ligne active est `kind='intolerance'`, `severity='strict'`** — elle n'atteint `findMedicalConstraintViolations` **qu'après `S2`**. **Trois causes de mort empilées, pas une** |
| **dépend de** | `S1` |
| **bloque** | la fixture *(précision n°1)* |
| **fichiers** | ⟳ ~~`allergen_catalog.ts`~~ ⛔ **FAUX FICHIER** : la table est `_shared/keel/allergen_surface_forms.ts`. **LIVRÉ** : `allergen_surface_forms.ts` *(3 formes collectives sous `shellfish` + **clé miroir `fruits_de_mer`**, même geste que `celeriac` sous `celery`)* · `household_safety.ts` *(**cran 4** : lève au lieu de se taire)* · 3 fichiers de test. ⛔ **NON COMMITÉS EXPRÈS** : `copy/allergens.ts` *(nomme 4 `MessageKey` de `en.ts`/`fr.ts`, interdits)* et `safety_constraints.ts` *(entraînerait `meal_generation.ts` + `week_plan_generation.ts`, **et c'est le fichier de `S2`**)* |
| **migration** | ⛔ ⟳ **AUCUNE, ET ELLE EST IMPOSSIBLE PAR `update`.** Le trigger `student_safety_constraints_retraction_only` **lève sur tout changement d'`allergen_ref`** : *« a declaration is superseded, never rewritten »*. Le seul chemin est **insert + retract**, et il est ⛔ **irréversible** — `active → retracted` est le seul changement autorisé, **`retracted → active` est REFUSÉ**. ⇒ **la réparation par le CODE était la seule disponible, et la base le dit elle-même** *(§⑨ n° 31)* |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 01:45→01:52 CEST.** ~~1 active~~ ⛔ **9 refs / 10 lignes actives sans formes**, et le balayage devait porter sur **TROIS colonnes** *(`allergen_ref`, `substance_ref`, `medication_class`)*, pas une. `surfaceFormsFor('fruits_de_mer')` = **`[]`**. ⟳ **Les deux langues** : ref `fruits_de_mer` **1 morsure FR / 0 EN** · ⛔ ref **`shellfish` 0 / 0**. Plancher d'intake **2/5** |
| **direction** | `surfaceFormsFor` rend un tableau non vide pour **tout** ref présent en base ; un ref sans formes fait **échouer** la ceinture au lieu de se taire |
| **mesure APRÈS** | ⟳ **RÉELLE, 2026-08-22 02:12 CEST — UN SEUIL SUR DEUX.** ✅ **② ATTEINT** : `belt_ref_without_forms` = **0** sur les 6 libellés réels + « fruits de mer », **et il compte vraiment** *(kiwi → 1, fraise → 2)*. ⛔ **① MANQUÉ** : **8 refs / 11 lignes actives** restent sans formes — 6 lignes `preference` *(inertes)*, `fructose` `strict`, et ⛔ **2 MÉDICAMENTS `medical` qui ATTEIGNENT la ceinture aujourd'hui** *(`warfarin`, `levothyroxine`)* **et n'auront jamais de forme de surface alimentaire** ⇒ **le seuil « 0 » est inatteignable tel qu'écrit**, fiche **`S1b-bis`**. Intake **5/5** *(était 2/5)*, ceinture **8/8** *(deux slugs × deux langues, était 4/8)*. Suite `_shared/keel` **4 066 / 0** |
| **armé par** | ⛔ **Le trépied + le compteur** : un cas qui MORD *(EN et FR)* · **deux** cas qui PASSENT · un test qui **forge un ref inconnu et vérifie que ça ÉCHOUE BRUYAMMENT**. ⟳ **Mutation, copie hors dépôt, NON MUTÉE VÉRIFIÉE D'ABORD (66/66, rc=0)** : clé miroir retirée ⇒ **rc=1** · formes collectives retirées ⇒ **rc=1** · cran 4 retiré ⇒ **rc=1** · ⛔ **compteur cloué à zéro, levée intacte ⇒ rc=1**. **Quatre mutations, quatre rouges, quatre tests DISTINCTS** — la quatrième existe parce qu'un compteur désarmé ressemble à un compteur qui marche |
| **coût** | **un petit lot** |
| **risque** | ⟳ ⛔ **RÉALISÉ ET MESURÉ, pas deviné.** La levée refuse le plan : **HTTP 500**, corps `{ok:false, error:"[keel/household_safety] a household allergy resolves to no catalogued allergen (kiwi); …"}`. `readEdgeRefusal` le prend pour un **jeton**, `edgeRefusalKey` rend `null`, et `MealBuilder.tsx:869` **affiche la phrase d'ingénieur ANGLAISE telle quelle**, sous un code qui se lit comme une panne. ⛔ **Or le refus traduit EXISTE DÉJÀ** — `safety_constraints_unreadable`, **503**, déjà dans `EDGE_REFUSAL_KEYS`, déjà traduit — **et il n'est pas branché là** ⇒ fiche **`S1b-c`**, *une ligne*. ✅ Côté chat, la dégradation prévue tient. ⚠️ **Et la levée RETIRE une propriété testée** — *« un mot inconnu garde le mot, jamais rien »* : une allergie au kiwi ne compose plus aucun plan. **Mesuré sur la population réelle : 0 morsure sur 6, fixture « arachide » incluse** |

## ⟳ S1c — le plancher de MALADIE porte la même blessure  ✅ **LIVRÉ le 2026-08-22** *(commit `b0ca4a15`)*

> ⛔ **Mesuré le 2026-08-22 à 01:30:04, juste après `S1`.** Le module dit **de lui-même**, dans son en-tête,
> qu'il est *« le SEUL défaut de toute la campagne qui peut blesser quelqu'un »*.

| | |
|---|---|
| **quoi** | Quelqu'un qui écrit *« j'ai une maladie cœliaque »* déclenche le plancher clinique, comme celui qui écrit *« coeliaque »*. |
| **pourquoi** | ⛔ `medical_condition_floor.ts:60` porte une **TROISIÈME** `normalize()` recopiée, **mot pour mot celle que `S1` vient de corriger**. Mesuré : `« j'ai une maladie cœliaque »` ⇒ **`null`** · `« …coeliaque »` ⇒ `coeliac_disease`. **4 des 6 formes de `coeliac_disease` sont mortes sous ligature — 4/4 des formes concernées.** ⚠️ ⛔ **Et c'est PIRE que `S1`** : dans le catalogue d'allergènes la ligature était une **variante** *(le digramme `oeuf` y était déjà)* ; **ici `cœliaque` EST la graphie normale du mot**, et c'est le **seul jeton français de la table** qui en porte une. |
| **dépend de** | `S1` *(le geste, le commentaire et le trépied d'armement sont écrits — il n'y a qu'à les rejouer)* |
| **bloque** | rien de mesuré — **mais c'est une garde clinique** |
| **fichiers** | `_shared/keel/medical_condition_floor.ts:60` — déplier `œ→oe`, `æ→ae`. ⛔ **Ne PAS fusionner** : même découplage délibéré, écrit dans les deux en-têtes. Consommateurs : `sophia-brain/router/run.ts`, `dietary_regime.ts`, `hunger_signal.ts` |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 01:39:44 CEST.** Table : **11 jetons, 76 formes, 0 ligature littérale**. Formes **concernées** = les **4 digrammes** de `coeliac_disease` ; **4/4 mortes sous ligature**, accord entre graphies **0/4 = 0 %**. `« j'ai une maladie cœliaque »` ⇒ **`null`**. ⛔ **Formes portant `ae` : ZÉRO.** ⛔ ⟳ **Et un SECOND littéral à digramme que la fiche ne nommait pas** : `soeur`, dans le désarmement « autrui » — `« ma sœur est diabétique et j'ai un diabète de type 2 »` ⇒ **`diabetes`** contre `« ma soeur… »` ⇒ `null` : **une divergence EN SENS INVERSE — le plancher SUR-déclenchait sous ligature** |
| **direction** | 4/4 mordent sous ligature · **aucune régression sur le digramme** · un message neutre reste `null` |
| **mesure APRÈS** | ⟳ **RÉELLE, 2026-08-22 01:43:53 CEST — SEUIL ATTEINT.** Balayage sur `MEDICAL_CONDITION_SURFACE_FORMS` : **cardinalité 4 (> 0)**, **même verdict 4/4 = 100 %** — assertion sur `condition_ref` **ET** `matched`, pas « rend ce ref » · 7 témoins neutres ⇒ `null`, dont R7 `« j'ai une maladie de cœur »` · fichier **21/21** · suite `_shared/keel` **4 066 passed / 0 failed** · `deno check` **rc=0** · `agent-gate` **pass** |
| **armé par** | le trépied de `S1` **recopié** — un cas qui **MORD** *(6 formulations × 2 graphies)* · un cas qui **PASSE** *(7 témoins)* · un **balayage avec assertion de cardinalité** · ⟳ **plus un QUATRIÈME** qui **déclare** le changement de comportement du désarmement `soeur`. **Mutation**, copie hors dépôt, **non mutée vérifiée d'abord (21/21, rc=0)** : retirer `\u0153` ⇒ **rc=1, 18/3** ; retirer `\u00e6` seul ⇒ **rc=0, 21/21** ⚠️ |
| **coût** | **une constante** |
| **risque** | ⛔ **Jamais `unicode_escape`** — tenu, et **vérifié sur le BLOB COMMITÉ** : chemin exécuté `2f 5c 75 30 31 35 33 2f` *(ASCII pur)*, ligatures littérales `c5 93`×6 / `c3 a6`×2 **uniquement en commentaire**. **0 mojibake** |


## ⟳ S1d — les trois dernières morsures de ligature  ✅ **LIVRÉ le 2026-08-22, 3 seuils sur 3** *(commit `9aed6639`)*

> Trois modules, **trois SENS différents**, et ⛔ **DEUX mécanismes** — mesurés **avant** tout geste.

| | |
|---|---|
| **quoi** | Écrire « ma sœur », « des œufs » ou « du bœuf » rend **exactement le même verdict** que le digramme, dans les trois derniers modules mesurés qui divergeaient. |
| **pourquoi** | ⟳ **Exécuté, pas lu.** ① `body_measure_floor.ts` **ÉCRIT un fait faux sur le corps de quelqu'un** : `« je fais 78 kg comme ma sœur »` ⇒ **78 kg ÉCRIT**, `« …ma soeur »` ⇒ `null`. ② `meal_declaration_floor.ts` **perd la déclaration ENTIÈRE** : `« j'ai mangé des œufs brouillés »` ⇒ **`null`** contre `["eggs"]` — quand l'œuf est le seul aliment, **la porte ne s'ouvre pas**. ③ ⛔ `sophia-brain/safety/safety_lexicon.ts`, **lane SÉCURITÉ, MÉCANISME OPPOSÉ** : `normalizeForSafety` **n'a aucun filtre non-alnum**, la ligature **SURVIT** intacte, et c'est le littéral ASCII qui rate — le plancher **SUR-déclenche** et lit une personne qui parle de sa sœur **comme étant elle-même en crise**, jusqu'à `critical`. |
| **dépend de** | `S1` et `S1c` pour ①② · ⛔ **PAS pour ③** : son mécanisme a dû être **mesuré** avant que le geste soit jugé applicable *(§⑨ n° 37)* |
| **bloque** | rien de mesuré — **mais ① écrit dans une ceinture et ③ est une lane de crise** |
| **fichiers** | les trois modules + leurs trois tests. **Tous les six étaient PROPRES avant le lot et sont commités.** ⛔ Les 5 modules « théoriques » ne sont **pas** touchés |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE.** ① **03:51:35** — **2 couples / 3 divergents**, formes concernées **1** (`soeur ×1`). ② **03:52:20** — **4/4 divergents**, formes concernées **6 distinctes / 7 occurrences**, en DEUX camps : **ligaturables 3** et ⛔ **JAMAIS ligaturés 3** *(`moelleux`, `tomatoes`, `potatoes`)*. ③ **03:52:56** — table **29 entrées**, **16 FR désarmables**, prémisse **16/16**, **accord 0/16 = 0 %**. ⛔ **La 1ʳᵉ sonde de ③ a échoué POUR LA MAUVAISE RAISON** — `null` des deux côtés, prémisse cassée ; refaite sur la table |
| **direction** | les deux graphies s'accordent · aucune régression sur le digramme · ⛔ **et le dépliage ne va QUE de la ligature vers le digramme** : `moelleux au chocolat` doit continuer de mordre |
| **mesure APRÈS** | ⟳ **RÉELLE — LES TROIS SEUILS ATTEINTS.** ① 3/3, balayage **1/1**, cardinalité **1 > 0**. ② **4/4**, balayage **3/3**, cardinalité **3 > 0**, les 3 jamais-ligaturés mordent toujours. ③ accord **16/16 = 100 %**, cardinalité **16 > 0**, **une crise à la PREMIÈRE personne lève toujours `high`**. Fichiers **34/34 · 47/47 · 13/13** · keel **4 138/0** · `agent-gate` **pass** |
| **armé par** | le trépied de `S1`, **recopié et DURCI ×3**. ⟳ ⛔ **Trois durcissements** : ① chaque balayage **vérifie sa PRÉMISSE** *(sans la porteuse, le verdict change — sinon comparer deux `null` est vert pour rien)* ② les balayages sont écrits sur le **SOURCE EXÉCUTÉ**, commentaires retirés — **un jeton neuf sans porteuse déclarée fait ROUGIR** ③ ⛔ **le balayage COMPTE les deux dépliages** ⇒ **`æ` est enfin armé STRUCTURELLEMENT**, là où `S1`/`S1c` le laissaient invisible. **Mutation ×6, non mutées d'abord (34/47/13, rc=0)** : sans `œ` ⇒ **30/4 · 44/3 · 10/3** ; **sans `æ` seul ⇒ 32/2 · 45/2 · 12/1** |
| **coût** | **six lignes exécutées** — deux par module |
| **risque** | ⛔ **Jamais `unicode_escape`** — vérifié **sur les trois BLOBS COMMITÉS** : `2f 5c 75 30 31 35 33 2f`, **ASCII pur** ; ligatures littérales **uniquement en commentaire et en test**. **0 mojibake sur six fichiers.** ⚠️ **Le vrai risque est un CHANGEMENT DE COMPORTEMENT sur deux désarmements « autrui »** — ① cesse d'écrire 78 kg, ③ **cesse de lever la bande à `high`** : **deux tests le NOMMENT** *(§⑨ n° 38)* |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① LE RECENSEMENT DE `S1c` SOUS-COMPTAIT** : sur 985 fichiers back, `.normalize("NFD")` hors tests = **68 modules**, **6 avec repli**, **62 sans** — et non 46/3/43. ⛔ **② QUATRE porteurs de `soeur` étaient hors liste, ET TROIS SONT DE VRAIS MATCHEURS, DANS LA LANE MÉMOIRE** : `extractRedactionTerms` mesuré — `« ma soeur a rechute »` ⇒ **sensible**, `« ma sœur a rechute »` ⇒ **NON sensible** ⇒ **un souvenir qui nomme une sœur ÉCHAPPE À LA RÉDACTION** ⇒ fiche **`S1e`**. ⛔ **③ LE PIÈGE DE LA RÈGLE EST DANS LE LEXIQUE DU MODULE ② LUI-MÊME** *(`moelleux au chocolat`)* : back-wide, **8 formes ligaturables / 48 occurrences** contre **34 jamais ligaturées / 249** ⇒ **une règle visant le DIGRAMME serait fausse 83,8 % du temps** ; la liste fermée capture **8/8 = 100 %** ⇒ fiche **`X2′`**. ⚠️ **④ Deux chiffres de son propre message de commit sont faux, et le commit n'est plus HEAD** ⇒ corrigés **au registre, jamais effacés** *(§⑨ n° 39)* |

## ⛔ S1e — la ligature échappe aussi à la lane MÉMOIRE *(fiche NEUVE, ouverte par `S1d`)*

| | |
|---|---|
| **quoi** | Un souvenir qui nomme « ma sœur » est traité comme un souvenir qui nomme « ma soeur ». |
| **pourquoi** | ⟳ **EXÉCUTÉ le 2026-08-22 à 04:21:36.** `extractRedactionTerms` (`_shared/memory/correction/redaction.ts:37`) : `« ma soeur a rechute »` ⇒ `["soeur","rechute"]`, **terme sensible DÉTECTÉ** · `« ma sœur a rechute »` ⇒ `["rechute"]`, **NON sensible**. **2 couples / 2 divergents.** ⇒ ⛔ **un souvenir qui nomme une sœur échappe à la rédaction**, sur la lane qui décide **ce qui est privé**. Deux autres portent le même littéral et la même normalisation : `memory/runtime/loader.ts:171` *(`relations.famille` ne se route plus)* et `memorizer_bridge.ts:158-160` *(la correction `mere→soeur` ne se détecte plus)*. ⚠️ **Mécanisme de ③, pas de ①②** : pas de filtre non-alnum, la ligature **survit**. |
| **dépend de** | `S1d` *(le geste, le trépied et le balayage sont écrits)* |
| **bloque** | rien de mesuré — **mais c'est la lane qui décide ce qui est SENSIBLE** |
| **fichiers** | `_shared/memory/correction/redaction.ts` · `_shared/memory/runtime/loader.ts` · `sophia-brain/memory_runtime/memorizer_bridge.ts`. ⛔ **`one_shot_reminder_prompt_contract.ts:52` N'EN FAIT PAS PARTIE** : son `ma soeur` est une **chaîne de prompt**, pas un matcheur |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE sur `redaction.ts` : 2 couples / 2 divergents.** ⛔ **Les deux autres ne sont PAS mesurés de bout en bout** — le mécanisme est lu, l'effet ne l'est pas. **C'est la première chose à faire, avant la première ligne de correctif** |
| **direction** | les deux graphies rendent le même verdict · aucune régression sur le digramme · un texte neutre reste inchangé |
| **mesure APRÈS** | balayage **par module**, **assertion de cardinalité**, seuil **100 % ET compte > 0** ; **mutation dans les deux sens**, copie **non mutée vérifiée d'abord** |
| **armé par** | le trépied de `S1d` recopié. ⚠️ **Et un test qui DÉCLARE tout changement de comportement** : ici `soeur` vit dans des **CLASSIFIEURS**, pas dans des désarmements — **vérifier avant de coder de quel côté chaque motif bascule** |
| **coût** | **six lignes exécutées** |
| **risque** | ⚠️ **`redaction.ts` ÉLARGIT ce qui est marqué SENSIBLE** : le taux de rédaction va **monter** — effet recherché ⇒ **compteur avant/après obligatoire** |

## ⟳ X2′ — une règle de dépôt pour les ligatures : la question, CHIFFRÉE *(fiche NEUVE — ⛔ elle ne tranche pas)*

| | |
|---|---|
| **quoi** | Décider s'il vaut mieux **une règle de dépôt** que N correctifs de deux lignes — **et laquelle**. |
| **pourquoi** | ⟳ **Le comptage est enfin fait** : **68 modules** `NFD` hors tests, **6 avec repli**, **62 sans**. ⛔ **Mais le VOLUME n'est pas le coût** : sur les 62, **3 seulement MORDENT** *(ceux de `S1e`)* — les 59 autres ne portent **aucun radical à ligature**. |
| **dépend de** | `S1d`, `S1e` *(sans eux la population de la règle n'est pas connue)* |
| **bloque** | rien — c'est une **porte** |
| **fichiers** | **aucun encore.** Le candidat est **un test de dépôt**, famille §2.6 |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 04:15 CEST.** **Ligaturables : 8 formes / 48 occurrences** *(`soeur` 19, `oeufs` 8, `oeuf` 7, `coeliaque` 5, `boeuf` 4, `coeliac` 3, `ecoeure` 1, `voeu` 1)*. **JAMAIS ligaturées : 34 formes / 249 occurrences** *(`does` 120, `goes` 20, `doesn` 9, `potatoes` 4…)*. ⇒ ⛔ **une règle visant le DIGRAMME serait fausse 249 fois sur 297 = 83,8 %** *(88,1 % avec le front)*. ✅ **La liste fermée de `S1c` capture 8/8 = 100 %** — **0 faux positif, 0 faux négatif** sur la population mesurée |
| **direction** | ⟳ **Trois options, DEUX déjà réfutées par les chiffres.** ⛔ **① 62 correctifs : NON** — 124 lignes pour **0 morsure de plus** que les 3 de `S1e` ; patron *« ceinture armée sur coffre vide »*. ⛔ **② une règle sur le digramme : NON** — **83,8 % de faux positifs**, et le piège est **dans le lexique du module ② de `S1d`**. ✅ **③ une GARDE AVEC UN ET** : *« un module qui porte une normalisation **ET** un littéral contenant un radical de la liste fermée **doit** porter le repli »*. Population **aujourd'hui : 3 modules**. Coût **un test + 3 × 2 lignes**. **Faux positifs 0 par construction** |
| **mesure APRÈS** | ⛔ **le seuil n'est pas « la règle passe », c'est « la règle MORD »** : un module fabriqué portant `normalize()` + `soeur` **sans** repli doit rendre **ROUGE**. Sinon la règle est une phrase — comme l'ANNEXE l'a été pour `revoke all` *(cicatrice `S6-b`)* |
| **armé par** | ⛔ **la mutation DANS LES DEUX SENS** : ① un module fautif ⇒ rouge ② un module portant `does`/`goes` **sans** radical ⇒ **VERT**. **Sans cette seconde moitié, la règle serait indiscernable de celle qui est fausse 83,8 % du temps** |
| **coût** | **un petit lot**, une fois `S1e` livré |
| **risque** | ⛔ **La garde ne doit PAS chercher `.normalize("NFD")`.** Deux contre-exemples **mesurés** : `safety_lexicon.ts` mordait **sans** filtre non-alnum, et `food_composition.ts:464` porte le repli **en ligatures littérales**. **Un scan du motif NFD rate les deux.** Le bon prédicat est **le LITTÉRAL** |


## S2 — la ceinture de sortie couvre `strict`  ✅ **LIVRÉ le 2026-08-22, 3 seuils sur 3** *(⛔ **arbre de travail, AUCUN commit** — §⑨ n° 36)*

| | |
|---|---|
| **quoi** | Une intolérance déclarée `strict` est vérifiée sur les aliments réellement nommés. |
| **pourquoi** | `if (constraint.severity !== "medical") continue;` — ⟳ **et il y en a au moins DEUX, aux lignes 541 et 591** *(une troisième possible à `:408`)*, **aucune à 580 comme l'écrivait la v1**. ⟳ Corriger l'une et laisser l'autre est exactement « deux copies divergent ». **6 contraintes actives** ne sont vérifiées par rien. |
| **dépend de** | `S1` |
| **bloque** | `L21` |
| **fichiers** | ⟳ **CINQ, pas un.** `safety_constraints.ts` *(la constante `BELT_BLOCKING_SEVERITIES` + les 2 sites + le champ `severity` **porté**)* · `sophia-brain/skills/_shared/keel_output_locks.ts` *(le **SECOND repli** + le verdict `blocked_strict_constraint`)* · ⛔ **`meal_generation.ts` — OBLIGATOIRE, découvert en cours de lot** *(voir `risque`)* · les 2 tests qui **encodaient** l'ancien comportement · **neuf : `safety_belt_strict_test.ts`** |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 03:49→03:55 CEST.** `medical 35 · strict 14 · preference 9` = 58, **reproduit**. Partition des 14 : **6 porteuses de jeton** *(mustard · lactose · gluten · dairy · fructose · fruits_de_mer)* · **8 `kind='diet'` sans jeton**. Compteur `belt{severity, bit, passed}` sur les 58 lignes réelles, **zéro appel de modèle** : `medical 35/35` · **`strict` porteuses 6, `bit 0`, muettes = les six** · `preference bit 0`. ⇒ **non couvertes : 6/6** |
| **direction** | les 6 entrent sous la ceinture. ⛔ **Le taux de refus va MONTER** — effet recherché, donc compteur avant/après obligatoire |
| **mesure APRÈS** | ⟳ **RÉELLE, 2026-08-22 04:20:24 CEST — LES TROIS SEUILS ATTEINTS**, sur **le MÊME fichier d'entrée**. ① **6/6 couvertes** — `strict bit 0 → 6`, **muettes = `[]`** ② **`passed` = 50** *(35 + 6 + 9)* ③ **byte-identité prouvée SUR LES OCTETS**, 128 → 128, `reason "clean"`. `medical` et `preference` **inchangés au chiffre près**. Suites : keel **4 138/0**, skills **239/0**, `deno check` **rc=0**. ⟳ ⛔ **~~Non couvertes : 0~~ reste INATTEIGNABLE tel qu'écrit** — les 8 `diet` n'entrent pas *(cicatrice `diabetes`)* : **le seuil se lit sur 6, et il est atteint** |
| **armé par** | ⟳ **TROIS cas + le CÂBLAGE + la mutation**, 10 tests. ① les **6 refs RÉELLES** mordent, **assertion sur la `severity` PORTÉE**, cardinalité 6 ② le **cas-frontière** : les 6 **mêmes** refs en `preference` ⇒ `clean` — et ⟳ **`fructose`, présent aux DEUX crans en base**, mord à `strict` et passe à `preference` : **la preuve que la ceinture lit la SÉVÉRITÉ, pas le jeton** ③ plan sans contrainte **byte-identique**. ⟳ **Plus le CÂBLAGE** : les 3 lanes appellent le verrou **et lui passent la table**, commentaires retirés, cardinalité 3 *(cicatrice `escalateMinorStudent`)*. ⟳ **Mutation ×6, non mutée d'abord (86/0)** : medical-only **8 rouges** · `:591` seul **7** · `:541` seul **2** · second repli retiré **2** · prompt reverté **1** · verrou débranché du chat **6** |
| **coût** | **un lot** *(la v1 disait « un petit lot »)* |
| **risque** | ⟳ ⛔ **RÉALISÉ ET FERMÉ DANS LE LOT, pas deviné — et il y en avait DEUX, pas un.** ① **Le second repli est livré** : *« I am not going to stand behind that one — it had something in it that you have told me to keep off your plate. Ask me again and I will work around it. »* Il ne nomme pas le jeton, ne renvoie **ni au médecin ni au coach**, **donne une sortie**, et **mord 0 fois** contre les 58 lignes. Quand les deux crans mordent, **le repli MÉDICAL gagne**. ② ⛔ ⟳ **LE SECOND COÛT N'ÉTAIT NULLE PART DANS LA FICHE, ET IL EST LE PLUS GRAVE : sur les DEUX lanes de génération, une morsure NE REMPLACE PAS UN TEXTE — ELLE VIDE LE PLAN (HTTP 422 `empty_meal`).** Or `SEVERITY_READING_BLOCK` annonçait au modèle que **SEUL** un nom `severity=medical` détruit la semaine. ⇒ **élargir la ceinture sans corriger le prompt, c'était rouvrir POUR 6 CONTRAINTES le trou qui a déjà détruit une semaine entière en run réel** *(`2a000000-3100-…`)*, **avec dans le même message la consigne qui pousse le modèle dedans**. Les deux passages nomment maintenant les DEUX crans, avec une formulation `strict` **mesurée à 0 morsure** |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① SIX sites de sévérité, pas deux** — dont `generate-household-meal-v1:2505`, **le bloc `C1`**, qu'aucune version de la fiche ne nommait, et qui **doit rester `medical` seul** : son propre code écrit *« Élargir à `strict` … le banaliserait »*. **Élargir une garde est délégué ; élargir un PROMPT de sécurité contre l'avis écrit dans son propre code ne l'est pas.** ⛔ **② `medicalConstraintTokens` (`:541`) est du CODE MORT que TROIS fichiers de test lisent comme « ce qui arme la ceinture »** — le laisser medical-only n'aurait **rien** cassé au runtime **et aurait menti à tous ses lecteurs**. C'est la mutation M3. ⚠️ **③ `plan_question/renderer.ts` savait déjà faire ce que la ceinture ne sait pas** : dégrader vers une copie **LOCALISÉE**. Les deux replis de la ceinture sont des **littéraux anglais**, servis à un compte dont `profiles.locale` vaut `fr-FR` par défaut ⇒ fiche **`S2-lang`**. ⚠️ **④ La lane SEMAINE appelle le verrou sans avoir JAMAIS averti le modèle** *(0 occurrence de l'avertissement dans son prompt)* ⇒ fiche **`S2-w`** |

## S3 — le mineur : rebrancher l'escalade, fermer l'entrée manquante  ✅ **LIVRÉ le 2026-08-22** *(commit `cdf89229`)*

| | |
|---|---|
| **quoi** | Un mineur ne traverse plus la porte du chiffre parce que sa date de naissance est absente. |
| **pourquoi** | ① `escalateMinorStudent` a **0 appelant** — son appelant historique a été retiré ; il a mordu **une fois, le 2026-08-12**. ② `weekPlanAgeGate` **PASSE** sur `absent`, et **1 193 profils sur 1 312** ont `birth_date` NULL.  ⟳ ⛔ **ET LE DÉFAUT EST DEUX FOIS PLUS LARGE, mesuré le 2026-08-22 : ce n'est PAS seulement `absent`.** `unreadable`, `future` et `implausible` **ouvraient le chiffre aussi**. `ageStateFromVerdict` range ces quatre statuts sous `unknown` **depuis toujours**, et `household_portions.ts` refuse de dimensionner dessus (`noSizing("age_unknown")`, **4 sites**) — **la lane SOLO était la SEULE exception du dépôt**, pas un trou neuf. Fermer `absent` seul aurait laissé **trois portes ouvertes** |
| **dépend de** | rien |
| **bloque** | le pilote payant |
| **fichiers** | `_shared/keel/student_age.ts:199-208` · `_shared/keel/student_body_io.ts:452` · `generate-meal-v1/index.ts` · ⟳ **`_shared/keel/energy_gate.ts:275`, qui APPELLE `weekPlanAgeGate`** — la v1 ne le nommait pas |
| **migration** | non |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-22 à 01:20:35 CEST.** `birth_date` NULL : ~~1 193/1 312~~ **1 193/1 313** *(90,86 %)* et ~~25/88~~ **25/92** — **les deux déplacements de la vague 0, reproduits** · `contract_change_requests` `minor_student` : **1**, du **2026-08-12 22:53:29+00** · `escalateMinorStudent` : **0 appelant prod, 0 appel en test**, `stripComments` du dépôt appliqué *(les 2 occurrences survivantes sont des **commentaires** de `coachCohort.ts`)* · ⟳ **population réelle, non annoncée par la fiche : `minor 17 · adult 103 · absent 1 193`** · ⟳ **la porte mesurée DEPUIS `energy_gate.ts` : `absent` ⇒ `{open:true, reason:"open"}`** |
| **direction** | ⚠️ **PAS « fermer sur `absent` »** — fermer ferait échouer 91 % des comptes. `absent` ⇒ **le chiffre ne sort pas** *(ce que le foyer fait déjà : `ageState === "unknown"` ⇒ `noSizing("age_unknown")`)*, **et le plan continue** |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-22 sur les 1 313 lignes RÉELLES de `profiles`**, à travers `assessBirthDate → ageGateCensus → energySafetyGates`, **zéro appel de modèle**. `age_gate{minor: 17, adult: 103, absent: 1 193}` — **les TROIS populations non vides**. ⛔ **Le couple, MÊME ENTRÉE, code de HEAD contre code corrigé** : **AVANT `open 1 296 · minor 17`** ⇒ le chiffre sort **1 296 fois** · **APRÈS `open 103 · age_unknown 1 193 · minor 17`** ⇒ il sort **103 fois**. **SEUIL 1 (`absent` non nul) : ATTEINT (1 193). SEUIL 2 (`escalateMinorStudent` ≥ 1 appelant réel) : ATTEINT** — `student_age_wiring.ts`, lui-même appelé par `generate-meal-v1/index.ts` |
| **armé par** | ⟳ **CE QUI EST LIVRÉ, ET CE QUI NE L'EST PAS.** ✅ `student_age_wiring_test.ts` (9 tests) entre par `energySafetyGates` **et** `canShowEnergy` **et** `canSizeFromTarget`, sur les trois populations — **jamais par `student_age.ts` seul**. **Le cas qui PASSE** est `allowed: true` + `numberAllowed: false` sur une date absente : *le plan SORT, sans chiffre*. `opened` passe de **5 à 1** dans les deux tables de vérité. ⟳ **Mutation ×5, arbre intact 60/0** : porte ②bis débranchée ⇒ **5 rouges** · `numberAllowed` rouvert ⇒ **9** · escalade jamais appelée ⇒ **2** · escalade aussi sur `unknown` ⇒ **1** · compteur uniforme ⇒ **4**. ⛔ **NON LIVRÉ : le RUN RÉEL.** Budget du lot = zéro génération, **respecté** — il est porté par la vérification de fin de vague 1. ⚠️ **Avant ce run : `supabase functions serve`** — le câblage vit dans l'arbre de travail |
| **coût** | **un lot** |
| **risque** | ⛔ Fermer sur `absent` **bloquerait tout en ressemblant à une garde qui marche**. ⟳ Et ce lot édite la fonction que la **porte ② de `energySafetyGates`** appelle : toute modification doit être éprouvée depuis `energy_gate.ts`, pas seulement depuis `student_age.ts` |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **`minorEscalationRow` écrit un fait FAUX dans la lane survivante** — *« Plan generation is held until you decide »* — alors que `generate-meal-v1` **ne retient RIEN** *(arbitrage du lot 1G, écrit dans son propre commentaire)*. ⇒ **fiche neuve `S3-a`**. ⚠️ ⛔ **Et 16 escalades vont partir** : **17 mineurs avérés** en base, **1 seul** porte déjà une ligne `minor_student` ouverte — le coach maison recevra 16 alertes **affirmant un blocage qui n'existe pas**, au premier repas composé par chacun |

## ⟳ S3-a — l'escalade « mineur » écrit un fait FAUX au coach *(fiche NEUVE, ouverte par `S3`)*

> ⛔ **BLOQUÉE PAR LE MÊME MUR QUE `V0-A-bis` — et c'est le second lot de sécurité qu'il arrête.**

| | |
|---|---|
| **quoi** | La ligne que le coach reçoit dit ce que le produit fait vraiment. |
| **pourquoi** | ⛔ **`minorEscalationRow` (`student_body_io.ts:421`) écrit : *« This student is N — under 18. Plan generation is held until you decide… »*. La génération n'est PAS retenue.** Elle l'était dans `generate-week-plan-v1` *(409 `minor_student`)*, **retiré le 2026-08-19**. La lane survivante, `generate-meal-v1`, **sert délibérément les mineurs** — c'est l'arbitrage écrit du **lot 1G**, dans son propre commentaire — et `S3` vient d'y rebrancher l'escalade. ⇒ **chaque alerte qui partira désormais affirmera un blocage qui n'existe pas, et 16 vont partir** *(17 mineurs avérés, 1 seul déjà escaladé)*. **Même famille que la cicatrice « coche auto = faits faux indémentables ».** ⚠️ **Et l'écran du coach dit la même chose** : `CoachHomePage.tsx:176` filtre sur `reason_code='minor_student'` et rend `coach.home.held_badge` + `held_hint`. |
| **dépend de** | rien — `S3` est livré |
| **bloque** | rien ; **il répare une phrase que le produit sert déjà** |
| **fichiers** | ⛔ `_shared/keel/student_body_io.ts` *(`minorEscalationRow`)* — **INCOMMITTABLE en l'état** : le fichier porte **+9 lignes** en cours qui nomment `declaredWeightKg`/`activityLevel`, **absents du `MealBodyContext` de HEAD** — le commiter **casserait le typecheck de HEAD** · ⛔ `frontend/src/keel/i18n/{en,fr}.ts` *(`coach.home.held_badge`, `held_hint`)* — **interdits de commit par l'ANNEXE et par le propriétaire** |
| **migration** | non. ⚠️ **La ligne existante du 2026-08-12 ne se réécrit PAS** : c'est une écriture sur une donnée **déjà servie**, hors délégation |
| **mesure AVANT** | ⟳ `select count(*) from contract_change_requests where reason_code='minor_student'` → **1** *(2026-08-22)* · la phrase contient `"Plan generation is held"` → **vrai** · `generate-meal-v1` retient une génération pour un mineur → ⛔ **FAUX** *(aucun `return`, aucun 409 ; le lot 1G le documente)* |
| **direction** | La phrase dit **ce qui se passe** : le repas est composé, **sans chiffre**, et la décision d'accompagner un mineur reste au coach. ⚠️ `student_body_io_test.ts` épingle `"under 18"` et `"professional framework"` — **les deux doivent survivre à la réécriture**, sinon `MINOR_ESCALATION_CONTENT_LOCALE` ment |
| **mesure APRÈS** | **0** occurrence de `"generation is held"` dans `minorEscalationRow` **ET** dans `held_badge`/`held_hint` · les deux phrases épinglées **toujours présentes**. **Seuil : 2/2 surfaces** |
| **armé par** | ⛔ un test qui **cherche le mot dans les DEUX surfaces**, **et un cas qui passe** : la ligne reste insérable *(colonnes `not null` de la DDL, garde déjà écrite)* |
| **coût** | **une phrase × 2 surfaces** — ⛔ **mais le prix réel est celui du DÉBLOCAGE des deux fichiers** |
| **risque** | ⛔ ⟳ **CE LOT NE PEUT PAS ÊTRE LIVRÉ PAR UN EXÉCUTANT tant que `student_body_io.ts` et `en.ts`/`fr.ts` sont bloqués. C'est le MÊME MUR que `V0-A-bis`, et c'est une décision de PROPRIÉTAIRE.** ⚠️ **En attendant, chaque escalade sert un fait faux** — et **le compteur du nombre d'alertes émises est la mesure du coût de l'attente**, pas une métrique décorative |


## S4 — l'objectif sur un mineur : l'écriture ET L'ORDRE  ✅ **LIVRÉ le 2026-08-22, 5 seuils sur 5** *(commit `547e90af`)*

| | |
|---|---|
| **quoi** | Poser un objectif sur une bouche mineure est refusé — **et poser la date après l'objectif ne le contourne plus**. |
| **pourquoi** | ⟳ ⛔ **RÉÉCRIT le 2026-08-21 par `V0-C`, qui a exécuté les quatre ordres au lieu de les lire.** ~~`keel_household_set_member_target` refuse sur 8 motifs, pas un mot sur `birth_date` … la garde se contourne dans le temps~~ — **la vérité est plus simple et plus large : il n'y a AUCUNE garde à contourner.** Mesuré en transaction `rollback`, **quatre ordres, quatre `ok:true`** : **A.** `add_member('SondeA', 2011-05-20, 'fat_loss')` — **date de mineur et objectif dans le MÊME appel**, ce que `SetupPage.tsx:1592` envoie réellement ⇒ `{"ok": true}` · **B.** le détour temporel décrit par la revue sécurité *(bouche sans date, puis date)* ⇒ `ok:true` · **C.** `set_member_goal('fat_loss')` sur une bouche **déjà datée mineure** ⇒ `ok:true` · **D.** ⛔ **`set_member_target(45 kg, 0,2 kg/sem)` sur une enfant de 15 ans ⇒ `ok:true`** — **ce cas n'est nommé nulle part dans le plan**. ⇒ `goal_not_for_minor` a été **retiré** des deux portes le 2026-08-18 (`20260818100000`), et **`target_not_for_minor` n'a jamais existé** *(0 occurrence, revérifié)*. **`S4` ne referme donc pas une brèche : il POSE la garde, sur quatre surfaces, en renversant une décision documentée.** |
| **dépend de** | ⛔ **PORTE G4** · ⟳ **`L37` touche le même CHECK** — les deux migrations se coordonnent |
| **bloque** | rien ; il ferme une surface |
| **fichiers** | `keel_household_set_member_target` (littéral `target_not_for_minor`) · ⟳ **`keel_household_set_member_birth_date`** *(migration `20260810170000:352-401`)* · `MouthFormDialog.tsx:102` |
| **migration** | **oui** — `create or replace function` ×2 |
| **mesure AVANT** | ⟳ **2026-08-22 03:54:17 CEST** — **les cinq ordres rejoués : cinq `ok:true`. Score 1/5**, seul le cas qui passe était vert. Mineurs porteurs : **3** *(`Lea` · `Tom`, **cible 32 kg à 0,3 kg/sem** · `Anouk`, la fixture)*. ⟳ **`authenticated` n'a que `SELECT` sur `household_members`** ⇒ **les 4 RPC sont la TOTALITÉ des portes** |
| **direction** | l'écriture est refusée dans **les deux ordres**. ⚠️ Les 2 lignes existantes ne se corrigent pas par cette migration — les migrer est une décision à part |
| **mesure APRÈS** | ⟳ **2026-08-22 04:11:22 CEST — ⛔ SEUIL ATTEINT, 5/5**, et **11/11** sur le harnais entier. A/B/C refusés `goal_not_for_minor`, **D refusé `target_not_for_minor`**, **P1 accepté sur un majeur**. Restent ouverts et vérifiés : `maintenance` sur une mineure · **le remède** *(retirer l'objectif puis poser la date)* · la date d'adulte. **Les 3 lignes existantes : 3 avant, 3 après, identiques** |
| **armé par** | ⟳ ⛔ **LA MUTATION, QUATRE FOIS, EN TRANSACTION ANNULÉE** : `add_member` ⇒ **A seul** · `set_member_birth_date` ⇒ **B seul** · `set_member_goal` ⇒ **C et E** · `set_member_target` ⇒ **D seul** ; contrôle de sortie **11/11**. ⛔ ⟳ **ET LE FAIT QUI VAUT LE LOT : sous le mutant D, E reste VERT pour un AUTRE motif** (`target_needs_direction`). **Le 5ᵉ ordre ne peut PAS armer la 4ᵉ garde — il passe parce que la garde d'à côté a refusé la direction.** Seule la **sonde D dédiée** l'arme. **Sans elle, `target_not_for_minor` était livré DÉSARMÉ** |
| **coût** | **une petite migration** — mais **la porte G4 coûte une décision** |
| **risque** | ⛔ Retirer le champ du front sans fermer la base laisse passer un import ou une API. Fermer la base sans rouvrir D4 met code et design en contradiction écrite  ⛔ ⟳ **ET UN ARBITRAGE À ÉCRIRE AVANT LE LOT, PAS PENDANT : `S4` rend la fixture `V0-C` non reconstructible.** Sa précision n° 2 exige un mineur porteur d'un objectif — c'est ce qui exerce `weighedPortionMembers` sur lui, la 5ᵉ surface du mineur, et le seuil « 0 mineur » de `L6′`. Après `S4`, ce foyer ne se rebâtit plus. **Deux issues, aucune gratuite** : une exception pour la fixture *(⛔ une garde à exception n'est pas une garde)*, ou la fixture perd sa précision n° 2 *(et `L6′` perd le seuil qui prouve que le mineur est exclu)*. ⚠️ **Et `20260818100000` porte TROIS raisons écrites d'avoir retiré la garde : les renverser demande de les nommer**, pas de les enjamber
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① `weighedPortionMembers` n'a AUCUN test d'âge** *(filtre sur `goal` seul)* — un mineur porteur d'une direction **EST pesé**. `S4` ferme l'**écriture** ; **les 3 lignes existantes traversent encore le sélecteur** ⇒ ⛔ **le seuil « 0 mineur » de `L6′` ne prouvera RIEN tant qu'elles sont là**. ⛔ **② `keel_household_join` SÈME `student_goals` depuis `household_members.goal`**, et `student_goals` n'a **aucune garde d'âge** ⇒ fiche **`S4-b`**. ⛔ **③ TROIS COMMENTAIRES affirmaient l'ABSENCE de la garde** — *« `goal_not_for_minor` N'EXISTE PLUS »*. **Une absence documentée survit à sa cause exactement comme une contrainte.** ⚠️ **④ La porte de sortie de la fixture coûte la CONDITION ④** en plus de la précision n° 2 ⇒ fiche `S4-c`. ⚠️ **⑤ « Suivi par git » ≠ « commité »** — index contre `HEAD`. **C'est la confusion de §⑨ n° 1, et l'orchestrateur l'a refaite** |

> ⟳ ⛔ **LES TROIS RAISONS DE `20260818100000` §③ (l. 129-150), CITÉES — parce que `S4` doit les renverser, pas les enjamber.**
> La migration écrit elle-même : *« Ne pas remettre un refus ici sans renverser ces trois-là d'abord. »*
> 1. **« L'ÉNERGIE RESTE FERMÉE »** — `childEnvelopeFromBody` **ne prend aucun paramètre `goal`** : un mineur reste en maintenance calculée sur son âge, quel que soit l'objectif posé.
> 2. **« LE PLAFOND DU RYTHME EST CALCULÉ SUR SON ÂGE »** — `weight_pace.ts` borne l'écart quotidien d'un mineur à **10 % de son besoin estimé** *(≈ 0,16 kg/sem)*, au lieu des 500 kcal de l'adulte.
> 3. **« LE CORPS D'UN ENFANT N'EST JAMAIS ÉNONCÉ »** *(FF-047)* — ni taille ni pesée à côté de son prénom.
>
> ⛔ ⟳ **ET UN CINQUIÈME ORDRE, PLUS DUR, MESURÉ PAR LA VÉRIFICATION** : `set_member_goal('fat_loss')` **puis** `set_member_target(40 kg, 0,5 kg/sem)`
> sur la **même enfant de 15 ans**, dans le **même tour** ⇒ `{"ok": true}` **et** `{"ok": true}`. Le seul garde-fou de `set_member_target`
> est `target_needs_direction` — **aucun test d'âge** — et la direction qu'il exige s'obtient par l'ordre précédent.
>
> ⚠️ ⟳ **Piège de lecture, déjà payé par ce dépôt** *(« une contrainte documentée survit à sa cause »)* : `goal_not_for_minor` rend **2 occurrences**
> dans `pg_proc` — mais ce sont **deux COMMENTAIRES**, pas deux gardes : *« PLUS DE `goal_not_for_minor` ICI NON PLUS »* et *« a existé du 13/08 au 18/08 »*.
> **Le littéral est là, la garde ne l'est pas.** Ne pas prendre le grep pour une mesure.


## ⟳ L0bis — LA GROSSESSE  ✅ **LIVRÉ le 2026-08-22, 1 seuil sur 2** *(commit `d026aa36`)*

| | |
|---|---|
| **quoi** | Une femme enceinte ou allaitante ne reçoit plus de boîte pesée en déficit. |
| **pourquoi** | ⛔ ⟳ **Chemin vérifié par la revue sécurité, et il est ouvert aujourd'hui.** `pregnancy`/`breastfeeding` sont bien dans la liste fermée (`medical_condition_floor.ts:181-189`, EN+FR) et le plancher est branché — **mais il n'écrit qu'une ligne et n'injecte son bloc que dans le CHAT**. Côté moteur, `conditionRef` est exclu de `safetyConstraintTokens` *(justifié)* et **n'est lu par aucun calcul d'énergie** : ni `meal_envelope.ts`, ni `weight_pace.ts`. Donc `executedPaceFor` amène jusqu'à `energyFloorFor("female") = 1 200 kcal`, **un plancher qui n'a jamais entendu parler de grossesse**. Et le bon chiffre de déficit en grossesse est **ZÉRO** : *« un plafond n'est pas un interdit »*. |
| **dépend de** | rien — ⟳ **et surtout PAS de la porte P1** : le jeton existe, le lecteur manque. C'est **un branchement**, pas une question à poser |
| **bloque** | le pilote payant |
| **fichiers** | ⟳ ⛔ **TROIS ouvreurs de déficit, pas deux — la fiche oubliait LE PLUS VIVANT.** ✅ **COMMITÉS** : `condition_energy_gate.ts` *(neuf, le module pur, `deno check` rc=0 seul)* · son test *(neuf)* · ⛔ **`mouth_anchor.ts` — l'ancre absolue, ABSENTE de la fiche, et c'est ELLE qui REMPLACE le facteur relatif quand elle tire** · `medical_condition_floor.ts` *(`breastfeeding` sort de `pregnancy`)*. ⛔ **NON COMMITÉS** : `household_portions.ts` *(portait **+1 532/−188** d'une autre session)*, les deux générateurs, 4 tests. ⟳ ⛔ **`meal_envelope.ts` et `weight_pace.ts` NE SONT PAS TOUCHÉS** *(§⑨ n° 33 et n° 34)* |
| **migration** | ⟳ ⛔ **AUCUNE, ET C'EST UNE DÉCISION PRODUIT QU'UN EXÉCUTANT NE PREND PAS.** Mesuré : **59 bouches sur 92 (64 %) n'ont aucun compte**, `condition_ref` est clée sur `user_id`, et **`household_member_conditions` N'EXISTE PAS**. **La garde ne peut donc pas protéger la majorité des bouches** ⇒ fiche **`L0bis-a`** |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 03:14 → 03:19:55 CEST.** `condition_ref is not null` ⇒ **0** ✅ sur **68** lignes. **Déficit ouvert, MESURÉ par les modules importés** sur une femme 31 a. / 165 cm / 68 kg / sédentaire *(entretien 1 980)* : ancre **1 480 kcal = −500/j** au cran 0,5 · facteur **0,7475** · `envelopeFor('fat_loss')` bande **1 485-1 683**, densité **1,3** · ⛔ **journée la plus basse exécutable : 1 200 kcal/j**, clamp `energy_floor` |
| **direction** | ⬇️ le déficit tombe à **0** pour cette bouche · aucune boîte pesée · retrait du poisson fumé à froid, des charcuteries crues et des fromages à pâte molle non cuits **pour elle seule** |
| **mesure APRÈS** | ⟳ **RÉELLE, 2026-08-22 03:48:21 CEST — UN SEUIL SUR DEUX.** ✅ **LES DEUX CAS ATTEINTS** : enceinte + `fat_loss` ⇒ `noSizing("pregnancy")`, **facteur 1 exact**, ancre **`null`** · un AUTRE `condition_ref` ⇒ **BYTE-IDENTIQUE JUSQU'AUX GRAMMES** *(`sizeBoxesFromTarget`, `JSON.stringify`)* sur `diabetes`, `hypertension`, `coeliac_disease`, `gout` **et un ref inconnu**, plus la prémisse inverse *(sous `pregnancy` la boîte BOUGE)* et **la bouche voisine intacte**. ⛔ **COMPTEUR : SEUIL MANQUÉ POUR MOITIÉ.** Les **4 populations** sont rendues *(cardinalité assertée + prouvée par mutation)* et **`none` est majoritaire à 100 %** — mais **3 des 4 sont à ZÉRO sur le corpus** : `{0, 0, 0, 92}` sur les bouches, et **`{0, 0, 0, 358}` au rejeu du plancher sur les 358 messages d'élève archivés** |
| **armé par** | le compteur à 4 populations, le cas byte-identique, **et une assertion de CARDINALITÉ**. ⟳ **13 MUTATIONS, 13 ROUGES**, copie **non mutée vérifiée d'abord (74/74)**, **plus un contrôle négatif resté VERT** *(le banc ne rougit pas tout seul)*. ⛔ ⟳ **ET UNE MUTATION A ÉCRIT DU CODE** : « l'éviction élargie à l'allaitement » est passée **VERTE** — la règle vivait dans un `if` du **GÉNÉRATEUR**, **hors de portée de tout banc de module**. Extraite en `evictsPregnancyFoods()`, puis re-mutée **dans les deux sens** : rouge les deux fois |
| **coût** | **un lot** |
| **risque** | ⛔ **Ceinture de SORTIE non armée sur `conditionRef`, tenu** — le module cite la cicatrice `diabetes` dans son en-tête. ⟳ **Second garde-fou ajouté après coup : la garde ne mord que VERS LE BAS** (`direction === "down"`, `fat_loss` seul) — **la rabattre sur un surplus retirerait de l'énergie à une femme enceinte qui en demande, sous le nom d'une protection**. ⚠️ **Fer, folates, iode : NON FERMÉ**, et c'est écrit dans le module. **Ce lot retire un déficit ; il n'ajoute aucun besoin** |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① `pregnancy` et `breastfeeding` étaient UN SEUL jeton** — `« I'm breastfeeding »` écrivait `pregnancy`, donc **la 4ᵉ population du compteur aurait été structurellement à zéro**. Séparés ; **gratuit uniquement parce que `condition_ref` était à 0/68**, et la fenêtre se ferme à la première ligne écrite *(trigger `retraction_only`)*. ⛔ **② Le chemin VIVANT du déficit n'était pas dans la fiche** : livrer sa liste de fichiers telle qu'écrite **aurait laissé le déficit passer entier**. ⛔ **③ « L'ancrer sur sa maintenance » aurait été LE DÉFAUT PORTANT LE MASQUE DU CORRECTIF** — l'équation est celle d'un corps qui ne nourrit que lui-même, et le besoin d'une grossesse la dépasse de **340 à 450 kcal/j**. **S'abstenir est la seule option honnête** ⇒ `kcal: null`. ⛔ **④ LE PLANCHER DE MALADIE N'A JAMAIS MORDU EN RÉEL : 0 jeton sur 358 messages d'élève archivés**, toutes maladies confondues ⇒ fiche **`L0bis-c`**. ⚠️ **⑤ `« j'allaite »` rend `null`** ⇒ fiche **`L0bis-b`** |

## ⟳ C1 — la contamination croisée  ✅ **LIVRÉ le 2026-08-22, 2 seuils sur 2** *(commit `23aad7b5`)*

| | |
|---|---|
| **quoi** | Quand une bouche porte une contrainte médicale et qu'un plat dédié existe dans le même repas, la consigne dit de ne pas partager la poêle. |
| **pourquoi** | ⛔ **Aucune règle nulle part** — 2 occurrences, aucune fonctionnelle. C'est **le seul sujet du moteur où une erreur ne fait pas un plan médiocre : elle rend malade.** |
| **dépend de** | ⟳ **rien** — la v1 la déclarait dépendante de `L26`. **Faux** : `dedicatedDishesFor` est **déjà câblé** (`index.ts:3448`) et **28 plats dédiés** sont mesurés en base. La prémisse est armée aujourd'hui |
| **bloque** | le pilote payant |
| **fichiers** | un bloc de prompt **en position de récence**, armé par la double prémisse `severity='medical'` **et** contenant séparé dans le même repas |
| **migration** | non |
| **mesure AVANT** | ⟳ **RÉELLE, 2026-08-22 03:17 CEST.** **0** occurrence fonctionnelle *(2 textuelles : une chaîne de fixture, un commentaire)* · ~~7~~ **8** lignes `household_member_allergies` *(+1 = la fixture `V0-C`)* · ~~28~~ **29** plats dédiés. ⛔ **Le « 28 » ne se reproduisait sous AUCUNE lecture littérale, et sa définition a été RETROUVÉE** : ni les plats portant un `member_id` (**113**), ni les plans en portant (**27**), ni `dish_owners.attributed > 0` (**25**), mais **`dish_owners.asked > 0` mesuré AVANT `V0-D`** — 29 − 1 = **28** *(contre-épreuve indépendante : `jsonb_array_length(cooking->'dish_bearing') > 0` = 29)* |
| **direction** | le bloc apparaît sur les plans qui remplissent les **deux** prémisses, et **sur eux seulement** |
| **mesure APRÈS** | ⟳ **RÉELLE, 2026-08-22 03:36 CEST — LES DEUX SEUILS ATTEINTS, ZÉRO GÉNÉRATION.** Compteur rejoué sur le corpus **par le VRAI module** *(importé, jamais recopié)* : **95 plans foyer → `{emitted 25, skipped_no_medical 38, skipped_no_dedicated 32}`, cardinalité 95/95** · sous-corpus `dish_bearing` archivé (53) → `{25, 5, 23}`, **53/53**. **Les trois populations non nulles sur les deux dénominateurs.** Fixture `3c781a71` ⇒ **`emitted`** |
| **armé par** | ⛔ **Une règle qui ne vit que dans un prompt régresse en réel et personne ne le voit** — le compteur est ce qui la rend falsifiable. ⟳ **QUATRE mutations, chacune `rc=1`** *(copie hors dépôt **vérifiée non mutée d'abord**, 11/11, restaurée au `md5` près)* : compteur cloué à zéro → **2 rouges** · prémisse médicale débranchée → **5** · prémisse du plat dédié débranchée → **3** · **phrase « pas garantie » retirée → 1**. ⟳ **Position PROUVÉE, pas supposée** : le bloc est **le DERNIER du `userSuffix`** *(offset 5856/7592)* — **seul `CONTENT_LANGUAGE:` le suit**, une consigne de langue, pas de contenu |
| **coût** | **un petit lot** pour la consigne · ⚠️ la vérification en sortie est un **chantier** — on ne prouve pas depuis un JSON qu'une poêle a été lavée |
| **risque** | ⚠️ Consigne **non vérifiable** — ⟳ **et elle le DIT, deux fois.** Au modèle, dernière ligne du bloc : *« Nothing further down this pipeline can check a washed pan — that written step is the only part of this rule that reaches the person cooking. »* *(constante épinglée : la couper rougit)*. Au lecteur du dépôt : *« `emitted` compte que la PHRASE EST PARTIE, jamais qu'un couteau a été rincé. Un lecteur qui verrait 12 et en conclurait “douze repas séparés” lirait ce compteur à l'envers. »* |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① LE TROU AVAIT DÉJÀ 25 PLANS DEDANS** — 25 plans foyer sur 95 remplissent **les deux** prémisses et ont été composés **sans qu'aucune règle existe nulle part**. Ce n'est pas un risque théorique, c'est **un arriéré mesuré**. ⛔ **② La prémisse discriminante n'est PAS le médical, c'est le plat dédié** : **48 plans tracés sur 53 (90,6 %)** portent déjà une contrainte médicale, contre **29/53** pour le plat dédié. **Lire `emitted 25/95` comme « la règle est rare » est faux.** ⛔ **③ C'est le MOTEUR qui ORDONNE la cuisine partagée** : `dedicatedDishBlock` dit mot pour mot *« same cooking session, same shopping, different plate »* — **et « different plate » ne suffit pas** pour une contrainte médicale. Le bloc devait se poser **contre ce texte-là**. ⚠️ **④ Deux blocs auraient pu S'ANNULER** : celui des contraintes dures dit *« ONE MOUTH'S HARD CONSTRAINT GOVERNS EVERYTHING »*, d'où un lecteur conclut que la seconde poêle est inutile. Le partage est écrit : **le premier tient l'INGRÉDIENT, celui-ci tient l'ÉQUIPEMENT**. ⛔ **⑤ Une contrainte médicale NON ATTRIBUÉE aurait désarmé le bloc pour la bouche SANS COMPTE** — cas nominal de `household_member_allergies`, et **la population qui ne peut pas se redéclarer**. D'où le second champ requis |

## ⟳ C1-a — la séparation demandée n'est DÉCLARÉE nulle part *(fiche NEUVE, ouverte par `C1`)*

> C'est la moitié que `C1` a **délibérément** laissée ouverte — sa propre fiche l'appelait *« un chantier »*.

| | |
|---|---|
| **quoi** | Le plan **dit** que le plat protégé a été fait en premier, sur du matériel propre — et le moteur **compte** s'il l'a dit. |
| **pourquoi** | ⛔ **La dernière ligne du bloc `C1` RÉCLAME une trace écrite** — *« the steps of the dish X eats say, in the plan's own language, that it is made first and on clean equipment »* — **et rien ne compte si elle est apparue.** C'est la forme *« ceinture armée sur un coffre vide »* : la consigne demande un geste observable, **l'observation n'existe pas**. ⚠️ Le compteur de `C1` **ne couvre pas ça** : `emitted` dit *« on l'a demandé »*, jamais *« il l'a écrit »*. ⛔ **Et la population est déjà là : 25 plans sur 95.** |
| **dépend de** | `C1` *(livré)* |
| **bloque** | rien — **mais c'est la seule moitié de `C1` qui puisse un jour MORDRE** |
| **fichiers** | `_shared/keel/cross_contact.ts` *(la moitié schéma)* · `meal_generation.ts` *(le parseur qui valide)* · `generate-household-meal-v1/index.ts` *(le compteur)* |
| **migration** | non |
| **mesure AVANT** | **0** — aucun champ, aucun compteur, aucun lecteur |
| **direction** | ⛔ **LE PATRON QUI MARCHE EST DÉJÀ DANS CE FICHIER** : `for_member_id` / `why_rule_of` / `same_day`. Une clé que le modèle **DÉCLARE**, validée contre une **liste fermée** *(les `dish_id` concernés)*, avec **la clé de schéma et sa promesse ADJACENTES** — la cicatrice qui rend **0 %** quand on l'oublie. ⛔ **ET SURTOUT PAS UN MATCHER** sur la prose : chercher « clean », « first », « propre » dans un texte rendu en trois langues avec ou sans négation est le geste qui a coûté **12 faux positifs sur 12** |
| **mesure APRÈS** | compteur `cross_contact_written{asked, declared, refused}` — ⛔ **trois nombres, jamais deux** : `{asked: 0}` veut dire que le bloc n'est pas sorti ; `{asked: 12, declared: 0}` veut dire **qu'on a demandé et que rien n'a été déclaré** — le résultat qu'on veut voir, **et pas du tout la même chose**. **Seuil : `asked` non nul sur la fixture, `declared`/`refused` séparés** |
| **armé par** | ⛔ un cas qui **MORD** *(deux prémisses remplies, rien de déclaré → `refused` non nul)* **et un cas qui PASSE** *(pas de plat dédié → `asked = 0`)*. ⚠️ **`L26-0` est l'avertissement** : le modèle a violé une interdiction **déjà servie**, 12 fois sur 12. Un champ déclaré ne garantit pas la poêle non plus — **il garantit seulement qu'on saura** |
| **coût** | **un lot** |
| **risque** | ⛔ **Ce lot ne doit PAS être vendu comme « la contamination croisée est vérifiée ».** Il vérifie qu'une **phrase** a été écrite. On ne prouve toujours pas depuis un JSON qu'une poêle a été lavée, **et le jour où un compteur `declared: 12` apparaîtra, c'est cette phrase-là qu'il faudra relire** |


## ⟳ L0-a — la conservation : ce qui ne dépend PAS de la porte G3  ✅ **LIVRÉ le 2026-08-22, 2 seuils sur 3** *(commit `af896e4a`)*

| | |
|---|---|
| **quoi** | Le plan cesse de faire manger un plat cuit quatre jours plus tôt, et cesse de faire acheter de la volaille trois jours avant de la cuire. |
| **pourquoi** | ⟳ **Trois défauts dont la valeur ne change pas selon qu'on tranche 48 h ou 72 h.** ① `MAX_FRIDGE_DAYS = 3` est appliqué en **`> 3`** : *cuit dimanche, mangé mercredi — ça passe*. ② **Il y a DEUX fenêtres et elles se CHAÎNENT** : `achat →[CRUE]→ cuisson →[CUITE]→ dernière portion`. **La première n'a aucune constante, aucune colonne, aucun lecteur** — mesuré sur le cas 04 : le poulet attend **3 jours cru**, or une volaille fraîche tient **1 à 2 jours**. ③ ⟳ **Et le compteur existe déjà** : `generated_from.issues`, **112 plans, 677 lignes, 29 violations de conservation sur 14 plans**, en clair. **La v1 disait « impossible de compter » — c'était faux.** |
| **dépend de** | ⟳ **rien** — et surtout **pas G3** |
| **bloque** | `L0-b`, `L35` |
| **fichiers** | `_shared/keel/meal_generation.ts:1880` et `:6082` (`>` → `>=`) · ⟳ **`grocery_waves.ts:59` et `:211` (la date de courses), `accident.ts:1739`, `accident_io.ts:471`** — la constante est **ré-exportée deux fois** · une colonne de fenêtre crue **par GROUPE** sur `food_groups` |
| **migration** | **oui** — une valeur par groupe sur `food_groups` (30 lignes). ⛔ **`food_groups` accorde aujourd'hui S/I/U/D jusqu'à `anon`** : **révoquer dans la même migration** *(voir `S6`)* |
| **mesure AVANT** | ⟳ **EXÉCUTÉE le 2026-08-22 à 01:17:51 CEST.** **29 violations sur 14 plans** ✅ *(le chiffre se reproduit)*, sur **181** plans, **109** porteurs, **691** lignes ⛔ *(et PAS 112/677 : 113 portent la clé, dont **4 avec un tableau VIDE**)*. ⟳ **DEUX faits neufs** : ① les écarts déjà signalés sont **4 j (21) · 5 j (4) · 6 j (4)** — **aucun écart de 3**, le `>` ne pouvait pas en produire ; ② les couples à écart **exactement 3**, reconstruits sur le corpus : **51, sur 31 plans**. ⛔ **C'est la population que le `>=` ouvre, et elle n'était lisible dans AUCUN `issues`** |
| **direction** | ⬇️ les 29 violations tombent à **0** *(elles sont refusées, pas signalées)* · ⬆️ le nombre de passages aux courses monte **sans congélateur** |
| **mesure APRÈS** | ⟳ **EXÉCUTÉE le 2026-08-22 à 01:59:50 CEST**, rejeu des 181 plans par la règle **RÉELLE** *(importée, jamais recopiée)*, **zéro génération** : `fridge_window{violations 102, within 1179, not_evaluated 83}` · **violations résiduelles après refus : 0** · **aucun plan vidé (0/181)** · 83 plats jetés sur 36 plans · fenêtre crue **96,2 %** routée *(4 826 / 189)* · **vagues de courses 179 → 187**. ⇒ **`violations = 0` ATTEINT** · **`within` non nul, 1 179** ✅ · ⛔ **`not_evaluated = 0` MANQUÉ : 83**. Arithmétique fermée et **revérifiée en SQL indépendamment** : `102 + 1 179 + 83 + 102 = 1 466` couples |
| **armé par** | ⟳ **47 tests neufs** — un par groupe *(30, valeurs en littéraux)*, la borne cuite, les trois populations, 7 tests de date d'achat. ⛔ **QUATRE MUTATIONS, ET LA TROISIÈME A TROUVÉ UN TROU** : `>=`→`>` **3 rouges** · `poultry` 2→3 **3 rouges** · refus→constat **2 rouges** · `not_evaluated++`→`within++` **0 ROUGE** ⛔ *(compteur structurellement inatteignable — refermé, puis re-muté : 1 rouge)*. ⟳ ⛔ **Et `week_bounds_test.ts:350` a rougi — mais PAS pour la raison annoncée** : `assertEquals(MAX_FRIDGE_DAYS, 3)` reste **VERT** *(la décision n° 14 garde 3 et change l'OPÉRATEUR)*. Ce qui a rougi, c'est l'**assertion de comportement** en dessous, qui affirmait *« thu → sun = J+3 : à la limite, et ça passe »* — **l'inverse de la décision n° 14**. Réécrite, épinglage **conservé** |
| **coût** | **un lot** *(le chantier, c'est `L0-b`)* |
| **risque** | ⛔ **Porte de SÉCURITÉ, donc fail-closed.** ⚠️ La fenêtre ne s'applique qu'aux occasions **cuisinées à l'avance** : sur 5 jours, **5 des 15 occasions sortent du problème** — sans cet attribut on compte 15 au lieu de 10 |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① `prep.cookOn` NE VIENT PAS DE `cook_on` — il vient de la SESSION**, back-fillée dans un bloc qui vivait **SOUS** la boucle des plats. **Une garde de conservation posée dans la boucle lisait `null` presque partout et SERAIT PASSÉE VERTE sur le cas mesuré.** Bloc remonté *(§⑨ n° 27)*. ⛔ **② 83 couples sur 1 466 tirent d'une casserole SANS jour de cuisson, et ils étaient SILENCIEUSEMENT SAUTÉS** (`if (!prep?.cookOn) continue;`) — la fenêtre ne tournait pas, **et le plan sortait avec l'air d'avoir été vérifié**. ⇒ **fiche neuve `L0-a-bis`**. ✅ **③ la jointure terme → groupe EXISTE et elle est vivante** : `food_composition_refs.food_group_ref`, **923 lignes NOT NULL**, **96,2 %** des lignes de courses routées — sans elle la colonne était morte, et la fiche ne disait pas ce qui la lirait. ⚠️ **④ le SENS de `MAX_FRIDGE_DAYS` n'était écrit NULLE PART** : le `>` lisait *« trois jours APRÈS »*, la constante annonçait *« trois jours EN TOUT »* |

## ⟳ L0-a-bis — 83 couples tirent d'une casserole sans jour de cuisson *(fiche NEUVE, ouverte par `L0-a`)*

| | |
|---|---|
| **quoi** | Toute casserole reprise porte un jour de cuisson, ou sa reprise est refusée. |
| **pourquoi** | ⛔ **`L0-a` a manqué son troisième seuil, et c'est ce qu'il a trouvé de plus utile.** `if (!prep?.cookOn) continue;` **sautait silencieusement** les couples dont la casserole n'a aucun jour de cuisson : **83 sur 1 466**, soit **5,7 %**. La fenêtre de conservation **ne tournait pas sur eux**, et **le plan sortait avec l'air d'avoir été vérifié**. ⚠️ **Et il a fallu une MUTATION pour le voir** : la première version du compteur `not_evaluated` était **structurellement inatteignable** *(`posOf` retombe toujours sur `DAY_TOKENS`)* — un compteur qui ne pouvait **que** rendre zéro. |
| **dépend de** | `L0-a` |
| **bloque** | le seuil `not_evaluated = 0` de `L0-a`, donc sa clôture pleine |
| **fichiers** | `_shared/keel/meal_generation.ts` *(la consigne, ou le refus du parseur)* — ⚠️ **incommittable en l'état** *(+2 250/−462 d'autres sessions)*, comme `L0-a` |
| **migration** | non |
| **mesure AVANT** | ⟳ **`not_evaluated = 83` sur 1 466 couples**, mesuré le 2026-08-22 à 01:59:50 |
| **direction** | ⚠️ **Deux voies, et il faut choisir AVANT de coder** : ① la consigne **exige** un jour de cuisson pour toute casserole reprise ; ② le parseur **refuse** la reprise d'une casserole sans jour. ⛔ **La ① est une phrase de prompt — et `L26-0` vient de montrer qu'une interdiction déjà servie peut être violée.** La ② est une arête |
| **mesure APRÈS** | `not_evaluated` **< 1 %** des couples, **et `within` ne baisse pas** — ⛔ **les deux ensemble** : refuser les 83 ferait mécaniquement tomber `not_evaluated` à 0 **en supprimant la population**, ce qui n'est pas la réparer |
| **armé par** | ⛔ **la mutation qui a trouvé le trou, rejouée** : `not_evaluated++` → `within++` doit rendre **≥ 1 rouge**. Elle en rendait **0** avant que `L0-a` ne referme le compteur |
| **coût** | **un petit lot** |
| **risque** | ⚠️ **Un plat composé le jour même n'a légitimement aucun jour de cuisson** — la cible n'est donc **pas 0**, et un lot qui viserait 0 forcerait un jour de cuisson sur des plats qui n'en ont pas besoin |


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

## S5 — les allergies du foyer entrent au lifecycle RGPD  ✅ **LIVRÉ le 2026-08-22, 2 seuils sur 3** *(commits `5961a616`, `dd97b6f9`)*

| | |
|---|---|
| **quoi** | Les allergies et interdits d'un foyer sortent avec l'export du compte et partent avec sa suppression. |
| **pourquoi** | **`household_member_allergies` (7) et `household_food_restrictions` (6) ne sont réclamées ni par l'export, ni par la purge, ni par le test.** Ce sont des données de santé.  ⟳ ⛔ **ET LA CICATRICE SE REJOUE UN CRAN PLUS BAS — mesuré le 2026-08-21 par `V0-B`, hors son périmètre.** `account-export-v1/index.ts:488` exporte `student_generated_meals` par **liste de colonnes EXPLICITE**, qui ne contient **ni `composition_unknowns` ni `composition_energy_sources`** — alors que la migration du lot 18 affirme en commentaire *« la table est déjà exportée en entier »*. **C'est faux.** ⇒ *« le lifecycle RGPD ne réclame pas les tables neuves »* n'est pas seulement vrai **par table** : c'est vrai **par COLONNE**, et une liste écrite à la main ne rougit jamais quand une colonne s'ajoute. **`S5` doit donc énumérer les colonnes autant que les tables**, sinon il ferme une porte et laisse la fenêtre |
| **dépend de** | ⟳ ⛔ **de la réparation de son propre test, qui devient la première moitié du lot** |
| **bloque** | le pilote payant |
| **fichiers** | ⟳ **`supabase/functions/keel_gdpr_lifecycle_test.ts` d'abord** — 608 lignes, une **liste écrite à la main** (`{ table: "student_goals", owner: "user_id", … }`), **sans aucune énumération d'`information_schema`** : une table absente de la liste **ne rougit jamais**. Puis `account-export-v1/index.ts` et `keel_household_purge_user` |
| **migration** | **oui** pour la purge |
| **mesure AVANT** | ⟳ **EXÉCUTÉE le 2026-08-22 à 03:50** : `grep -c` → **0** · **126** tables publiques, **15** citées par le test *(dont ⛔ **2 QUI N'EXISTENT PLUS**)*, **113 non citées** · et **par COLONNE : 145 hors allowlist sur 35 des 38 tables lues** — dont ⛔ **`student_safety_constraints.condition_ref` et `.diet_ref`** *(la maladie et le régime déclarés)* **sur la table dont le commentaire promet « exported in full »** |
| **direction** | le test **énumère** `information_schema.tables` avec une allow-list explicite ; il **rougit** sur les deux tables ; puis on les réclame et il **verdit** |
| **mesure APRÈS** | ⟳ **TROIS seuils, DEUX atteints.** ① ✅ **le test a ROUGI TROIS FOIS avant le correctif** *(fantômes ; les 2 tables ; 48 colonnes)*, sorties verbatim. ② ✅ **2/2** : archive **RÉELLE** portant les 2 libellés du maître, **ZÉRO libellé de l'autre bouche**, `tables_indisponibles: []` ; purge « je pars » → **0 ligne**, purge « détachement » → **1 ligne** *(décision)*. **126/126 tables classées**, **0 colonne muette** sur les 39 lues. ③ ⛔ **byte-identique MANQUÉ, écrit et pas réécrit : 19 lignes de diff** — 3 clés neuves **VIDES**, 6 clés de profil dont 5 `null`. **Zéro ligne d'un compte sans foyer ne change**, mais l'identité stricte **était inatteignable** dès lors que la moitié COLONNES ajoute des clés : **c'est le seuil qui était faux, pas la mesure** |
| **armé par** | ⛔ ⟳ **La v1 s'armait sur un mécanisme inexistant ; « on doit VOIR le test rouge » est vrai et INSUFFISANT.** L'arme réelle est **l'énumération + QUATRE MUTATIONS mesurées** : **table factice créée en base** → rouge · colonne retirée de l'allowlist → rouge · `delete` ajouté dans la branche du **détachement** → rouge · `mes_allergies` rendu `[]` → rouge. Les quatre **restaurées à l'octet**, vert avant et après |
| **coût** | ⟳ **un lot** *(la v1 disait « un petit lot » ; la réparation du test est la vraie tâche)* |
| **risque** | ⟳ ✅ **TRANCHÉ, plus un risque.** Décision n° 24 : **A et B selon la bouche**. Lecture **scopée par le `member_id` de SA ligne**, et un cas d'intégration **assert que les libellés de l'AUTRE bouche NE SONT PAS dans l'archive** |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① LE SEUL FILET RGPD DU DÉPÔT ÉTAIT INEXÉCUTABLE DEPUIS LE 2026-08-03, ET RIEN NE LE DISAIT.** Une liste écrite à la main se périme de **TROIS** façons, et la troisième n'est attrapée par aucune des deux autres : ① une table qu'elle ignore *(111)* · ② une table **droppée** qu'elle réclame encore *(`recurring_meals`, `student_facts`)* · ③ ⛔ **une table qui EXISTE dont la COLONNE DE PROPRIÉTAIRE a disparu** — `meal_ideas.student_id`, droppée le 2026-08-04. Le décor levait à sa première ligne. **Réparer l'arme a littéralement RESSUSCITÉ le filet : 3 cas / 3 verts.** Le seuil « le test rougit avant » a donc été atteint **dans un sens qui n'était pas prévu — il ne rougissait pas, il ne PARTAIT pas**. ⛔ **② La cicatrice par colonne fait 145, pas 2** — et la pire n'est pas celle que `V0-B` avait vue : **la MALADIE et le RÉGIME déclarés** étaient muets sur la table qui promet l'export intégral. **Une phrase et son code ont divergé des mois sans qu'aucune ligne ne les confronte.** ⛔ **③ LA SYMÉTRIE ÉTAIT LE PIÈGE DE LA PURGE** : le corps part dans les deux branches, et copier ce geste pour les allergies aurait **retiré la CEINTURE d'un foyer qui continue de cuisiner pour la bouche détachée**. ⛔ **Un geste de vie privée n'a pas le droit de produire une régression de sécurité.** Les deux branches sont **asymétriques**, et le test rougit **dans les deux sens**. ⚠️ **④ Une dépendance déclarée « bloquée » le reste jusqu'à ce qu'un filet la dénonce** — `FF-056`, diff écrit **mot pour mot** le 2026-08-11 : raccordée ici. ⚠️ **⑤ La dette est de 37 tables, NOMMÉE plutôt que rangée** ⇒ `S5-a` — les ranger en « journal serveur » aurait été **la faute même que le lot répare**. ⚠️ **⑥ L'export CÔTÉ COACH est amputé de ses convictions** ⇒ `S5-b` |

## S6 — les grants par défaut  ✅ **LIVRÉ le 2026-08-22, 3 seuils sur 3** *(8 commits, `8a7062bf` → `345fc335`)*

| | |
|---|---|
| **quoi** | `anon` cesse d'avoir tous les droits sur les tables qui portent des données personnelles. |
| **pourquoi** | **`anon` a S/I/U/D** sur `profiles`, `student_generated_meals`, `weekly_reviews`, `substances*` ; **`food_groups`** va jusqu'à `anon` en S/I/U/D. `profiles` est le pire : il porte **`birth_date`, l'entrée de la porte mineur**, et ses policies sont `TO public` avec une clause `ALL`. ⚠️ `student_safety_constraints` accorde **`DELETE` à `authenticated` sans aucune policy DELETE** — résidu, alors que le modèle voulu est la **rétraction**. |
| **dépend de** | rien · ⟳ **`L0-a` en dépend** pour `food_groups` |
| **bloque** | le pilote payant |
| **fichiers** | une migration de `revoke` ciblée, **une table par commit** |
| **migration** | **oui** — `revoke` seulement |
| **mesure AVANT** | ⟳ ~~64 booléens, **60 vrais**~~ ⛔ **EXÉCUTÉE le 2026-08-22 à 03:14:43 : 64 booléens, 53 VRAIS.** Le 60 est le chiffre **d'avant `L0-a`**, qui en avait retiré 7 sur `food_groups` le matin même *(53 + 7 = 60 — il se reproduit, il est périmé)*. ⟳ **Et « 21 droits » est faux d'autant** : `anon` portait I/U/D sur **6** tables, donc **18**. ⛔ **DEUX FAITS NEUFS, hors fiche** : ① `TRUNCATE` accordé à `anon` sur **6** tables et à `authenticated` sur **7** — **et il échappe à la RLS**, seul droit de la liste que rien d'autre ne retient ; ② **`MAINTAIN` (PG 17) survivait au `revoke` de `L0-a`, parce que sa liste était NOMMÉE** |
| **direction** | ⟳ **définie** : `anon` perd `INSERT/UPDATE/DELETE` sur les 8 tables = **21 droits** ; `authenticated` garde ce dont une policy se sert. ⛔ **`revoke from public` laisse `anon` en place** — vérifier avec `has_table_privilege('anon', …)`, jamais avec l'absence d'un `grant` |
| **mesure APRÈS** | ⟳ **EXÉCUTÉE le 2026-08-22 à 03:29:15 — LES TROIS SEUILS ATTEINTS.** ① **0 droit d'écriture pour `anon` : 0 / 56** *(7 privilèges × 8 tables)*, **`TRUNCATE` et `MAINTAIN` compris et vérifiés explicitement** ; matrice **53 → 19 / 64**. ② **les tests passent** : gate vert aux 8 commits ; vitest **1 784 / 1 788** *(les 4 rouges appartiennent à d'autres lots ; vitest tourne en `environment: node`, sans base)* — ⛔ ⟳ **la fiche disait « 673 tests », il y en a 1 788**. ③ **bout en bout par PostgREST avec la vraie clé anon** : `GET` **200 `[]`** · `PATCH`/`POST` **401 `42501 permission denied for table`**. **Aucune donnée perdue** : comptes identiques avant/après sur les 8 tables |
| **armé par** | ⟳ **L'arme réelle est livrée** : `scripts/keel_s6_grants_par_role_20260822.sh`, **58 contrôles**, transaction annulée, lectures **littérales** du front sous `authenticated` puis sous `anon`. **26 PASS / 32 FAIL avant le 1ᵉʳ commit → 58 / 0 après le 8ᵉ.** ⛔ ⟳ **ET LA FICHE NE DISAIT PAS LE PLUS IMPORTANT : « ÇA ÉCHOUE » N'EST PAS UNE ASSERTION.** Mesuré avant le premier `revoke` : `anon insert` → refusé **par la RLS** ; `anon update` et `anon delete` → **aucune erreur, 0 ligne**. **Une garde qui assert l'échec serait passée VERTE AVEC LE GRANT.** Le harnais assert sur la **forme du refus** — `permission denied for table`, **que seul le privilège prononce**. ⛔ **TROIS MUTATIONS, TROIS ROUGES**, dont ⟳ **le SUR-revoke** (`revoke select on weekly_reviews from authenticated`), **la seule qui prouve la protection contre le geste de TROP** — le vrai risque de ce lot |
| **coût** | **un lot** |
| **risque** | ⛔ **Le plus gros risque de régression du plan.** Une table par commit, un run après chacune |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① UNE LISTE DE PRIVILÈGES NOMMÉS LAISSE DERRIÈRE ELLE CE QU'ELLE NE CONNAÎT PAS.** `L0-a` en a nommé six, **PG 17 en compte sept** : `anon=m/postgres` — **`MAINTAIN`**, donc pour un rôle **non authentifié** le droit de poser un `VACUUM FULL`/`CLUSTER` et son verrou ACCESS EXCLUSIVE. ⇒ **8ᵉ migration non prévue**, et les huit écrites en `revoke all` puis `grant`. ⛔ **② LE VRAI TROU N'EST PAS `INSERT`, C'EST `TRUNCATE` — ET IL DÉBORDE LARGEMENT LES 8 TABLES** : sur **126** tables publiques, **55** laissent `anon` écrire, **55** lui laissent `TRUNCATE`, **82** le laissent à `authenticated`. Dont **`internal_admins`** — RLS active, **une seule policy, en SELECT** : **l'écriture est retenue par la RLS, le `TRUNCATE` par RIEN.** ⇒ fiche **`S6-b`**. ⚠️ **③ la policy `Users own profiles` est en clause `ALL`** : elle ouvre un chemin de **suppression d'un profil hors du parcours RGPD**. ⛔ **Ce n'est pas un `grant` à reprendre, c'est une POLICY à réécrire — donc PAS réversible par un `grant`, donc HORS délégation §⑨.** **Le lot s'est arrêté et a écrit `S6-a`.** ⚠️ **④ `household_member_habits` n'a AUCUNE RLS** *(22 lignes, seule table publique dans ce cas)* : elle n'est fermée **que par l'absence de grant** ⇒ fiche **`S6-c`** |

## ⛔ S6-b — le défaut n'est PAS dans les huit tables : **55 sur 126** *(fiche NEUVE, la plus large du lot)*

| | |
|---|---|
| **quoi** | Le `revoke` cesse d'être un geste par table et devient une **règle du schéma**. |
| **pourquoi** | ⛔ **`S6` a fermé huit portes dans un mur qui en compte 55.** Mesuré le 2026-08-22 sur les **126** tables du schéma `public` : **55 laissent `anon` faire I/U/D**, **55 lui laissent `TRUNCATE`**, **82 le laissent à `authenticated`**. **La cause est unique et encore vivante** : `pg_default_acl` accorde `arwdDxtm` — **tout** — à `anon`, `authenticated` et `service_role` sur **chaque table neuve**. ⛔ **Et `TRUNCATE` échappe à la RLS.** Parmi les 55 : **`internal_admins`** *(RLS active, **une seule policy, en SELECT** — l'écriture est retenue par la RLS, le `TRUNCATE` par **rien**)*, `student_goals`, `memory_items`, `user_profile_facts`, `subscriptions`, `app_config`, `plan_documents`. |
| **dépend de** | `S6` *(la forme du geste et l'arme existent)* |
| **bloque** | le pilote payant |
| **fichiers** | une migration par table, **ou** `alter default privileges … revoke` + une passe · ⟳ **et une garde de dépôt** : l'ANNEXE dit déjà *« toute table neuve : `revoke all … from anon, authenticated` »* — **rien ne le vérifie** |
| **migration** | **oui** |
| **mesure AVANT** | **EXÉCUTÉE le 2026-08-22 à 03:29** : 126 tables · **55** `anon` I/U/D · **55** `anon` `TRUNCATE` · **82** `authenticated` `TRUNCATE` |
| **direction** | reprendre le défaut **à la racine** (`alter default privileges`), puis passer les 55 · **et poser un test qui ÉNUMÈRE `information_schema`** au lieu d'une allow-list écrite à la main *(même défaut que `keel_gdpr_lifecycle_test.ts`, même réparation que `S5`)* |
| **mesure APRÈS** | **0** table publique où `anon` porte un droit d'écriture · **0** où `authenticated` porte `TRUNCATE` sans en avoir besoin · **le test rougit quand on crée une table sans son `revoke`** |
| **armé par** | ⛔ **la mutation de `S6`, rejouée à l'échelle du schéma** : créer une table neuve **sans** `revoke` doit rendre le test **rouge**. Sinon la règle de l'ANNEXE reste une phrase. ⚠️ **Et le harnais par rôle doit être élargi AVANT** : 55 tables = 55 lectures du front à rejouer — **le risque de `revoke` de trop GRANDIT avec le nombre** |
| **coût** | **un chantier**, pas un lot |
| **risque** | ⛔ **Plus gros que `S6`.** `S6` a touché 8 tables dont 5 sans aucun écrivain client ; ici il y en a **55**, dont `student_goals` et `subscriptions`, **que le front écrit** |

## ⚠️ S6-a — la policy `Users own profiles` ouvre un `delete` hors RGPD *(fiche NEUVE)*

> ⛔ **HORS DÉLÉGATION §⑨** : une policy **n'est pas réversible par un `grant`**. `S6` s'est arrêté ici.

| | |
|---|---|
| **quoi** | Supprimer sa ligne `profiles` cesse d'être possible hors du parcours de suppression de compte. |
| **pourquoi** | `Users own profiles` est en clause **`ALL`** avec `auth.uid() = id` : elle autorise `select`, `insert`, `update` **et `delete`**. ⛔ **Aucun code du dépôt ne supprime une ligne `profiles` sous l'identité de l'élève** — la suppression passe par `account-deletion-v1` et `purge-deleted-accounts`, en `service_role`, avec leur ordre, leurs audits et leur `purge_at`. Une clause `ALL` écrite pour lire et écrire accorde donc **par effet de bord** un chemin qui contourne tout ça. ⚠️ **Et `S6` n'a pas pu le fermer** : il reprend des `grant`, or ici le droit est **légitimement accordé par une policy** — le fermer par un `revoke delete` ferait **diverger le droit et la policy** |
| **dépend de** | rien |
| **bloque** | le pilote payant *(famille P0)* |
| **fichiers** | une migration qui **remplace** `Users own profiles` (`ALL`) par des policies explicites — **les trois `rls_profiles_*_self` existent déjà et font exactement ça** |
| **migration** | **oui** |
| **mesure AVANT** | `pg_policies` : `profiles | Users own profiles | ALL | {public} | auth.uid() = id`, **en plus** des trois policies qui la doublent. ⛔ **À mesurer avant de coder** : combien de lignes `profiles` ont été supprimées hors `account-deletion-v1` |
| **direction** | ⛔ **une policy à réécrire, PAS un `grant` à reprendre.** Retirer la clause `ALL`, garder les trois explicites, **n'ajouter aucune policy `DELETE`** — puis, **et seulement là**, `revoke delete on profiles from authenticated` |
| **mesure APRÈS** | un `DELETE` sur sa propre ligne rend **0 ligne**, puis après le `revoke` **`permission denied`** · **et les 9 écritures du front continuent de rendre 1 ligne** |
| **armé par** | ⛔ **le harnais de `S6` a déjà la place** : ajouter `authenticated / profiles / delete → denied` et **le muter** en remettant la clause `ALL`. ⚠️ **Piège de `S6`** : tant que le `grant` est là, un `delete` refusé par la policy rend *« aucune erreur, 0 ligne »* — **assert sur la FORME du refus, jamais sur l'échec** |
| **coût** | **un petit lot** |
| **risque** | ⚠️ La clause `ALL` est **antérieure** aux trois policies explicites et les recouvre. **Vérifier qu'aucune des trois n'a un prédicat plus étroit** avant de la retirer — sinon on **resserre une lecture** en croyant retirer un `delete` |

## ⚠️ S6-c — `household_member_habits` n'a AUCUNE RLS *(fiche NEUVE, petite)*

| | |
|---|---|
| **quoi** | La seule table publique sans RLS en reçoit une. |
| **pourquoi** | Sur **126** tables publiques, **une seule** a `relrowsecurity = false` : `household_member_habits`, **22 lignes**, les habitudes alimentaires par bouche. ✅ Elle est **inatteignable aujourd'hui** *(aucun droit pour `anon` ni `authenticated`, vérifié)*. ⛔ **Donc la porte n'est fermée QUE par l'absence de grant** — et le défaut du schéma est d'en accorder un à **toute table neuve** *(`S6-b`)*. **Un `grant select` posé « pour déboguer » rendrait les 22 lignes de tous les foyers à n'importe quel compte, sans une seule policy pour retenir quoi que ce soit.** |
| **dépend de** | rien |
| **bloque** | rien aujourd'hui — ⚠️ **et c'est exactement ce qui le rend facile à oublier** |
| **fichiers** | une migration : `enable row level security` + la policy propriétaire, sur le modèle des autres tables `household_*` |
| **migration** | **oui** |
| **mesure AVANT** | `relrowsecurity = false`, **0 policy**, **22 lignes**, aucun droit pour les deux rôles |
| **direction** | RLS activée, une policy de lecture par membre du foyer, `revoke all … from anon, authenticated` **dans la même migration** |
| **mesure APRÈS** | `relrowsecurity = true` · **≥ 1** policy · **0** table publique sans RLS |
| **armé par** | ⛔ **un cas qui MORD et un cas qui PASSE** : sous les claims d'un membre d'un **autre** foyer ⇒ **0 ligne** ; sous les siens ⇒ ses habitudes. ⚠️ **Une RLS activée sans policy bloque tout et ressemble à une garde qui marche** — le cas qui passe est **obligatoire** |
| **coût** | **un petit lot** |
| **risque** | ⚠️ La table est écrite par `service_role`, qui **bypasse** la RLS : le risque n'est pas de casser l'écriture, c'est d'**écrire une policy de lecture trop large sans s'en apercevoir** — la table est vide de sens pour un lecteur étranger, donc **0 ligne et « ça marche » se ressemblent** |


## ⟳ H1 + H2 — le gate voit enfin le front  ✅ **LIVRÉ le 2026-08-22, 3 seuils sur 3** *(commit `6af2d67a`)*

| | |
|---|---|
| **quoi** | Un rouge front cesse de passer le commit. |
| **pourquoi** | `scripts/agent-gate.sh` lance `deno test`, `tsc -b`, `deno check` et `eslint` — **aucun vitest**. Les **44 fichiers / 673 tests** passent quand on les lance à la main, jamais dans le gate. Et `tsconfig.app.json:29` exclut `**/*.test.*` : **0 des 44 fichiers n'est typechecké** — une clé dupliquée (`setupMouthsStep.int.test.ts:367`) est **déjà passée à travers**. |
| **dépend de** | rien |
| **bloque** | ⟳ **`L6′`, `L16`, `D1′`, `L24′`, `L0-a`** — tout lot à surface front est **invérifiable** sans eux |
| **fichiers** | `scripts/agent-gate.sh` · `frontend/tsconfig.app.json` *(ou un `tsconfig.test.json` séparé)* |
| **migration** | non |
| **mesure AVANT** | ⟳ **reproduite le 2026-08-22 à 04:16 CEST.** `grep -c vitest` → **0** · fichiers de test dans le programme `tsc` → **0 / 112** *(`--listFiles` : 449 fichiers, **pas un seul test**)* · `deno check` → **3 entrées `sophia-brain`**, **aucune des deux lanes**. ⛔ **LA MESURE QUI DÉCIDE DU LOT** : vitest à la main = **1 788 tests / 112 fichiers, 4 rouges** *(identique sur TROIS runs)* et typecheck des tests = **92 erreurs / 25 fichiers** — ⛔ **aucun des deux n'est de ce lot** : **13 des 25 fichiers sont PROPRES à HEAD**, cassés par la source modifiée d'un voisin |
| **direction** | ⟳ ⛔ **ÉCRITE AVANT DE CODER — et ce n'est NI A NI B.** **A est mesuré impossible** : armer sec bloquait **cinq lots en vol**. ⛔ **Mais B au sens littéral est PIRE QU'INUTILE** : un gate qui *rapporte sans faire échouer* **ne peut pas rougir**, donc **l'ARME exigée par la fiche ne pourrait pas être tirée** — on livrerait très exactement *« une garde qui ne mord jamais ressemble trait pour trait à une garde qui marche »*. ⇒ **`B′` : ARMÉ, borné par une liste NOMINATIVE et datée** qui nomme les 4 rouges, leur fichier, leur propriétaire. **Tout le reste mord.** Et pour `deno check`, c'est **A sans réserve** |
| **mesure APRÈS** | ⟳ **2026-08-22 à 04:45 CEST — LES TROIS SEUILS ATTEINTS.** `grep -c vitest` → **10** · le gate imprime `vitest — 1788 tests, 4 rouges, 4 tolérés, 0 hors liste` ⇒ **1 788 tests lancés PAR LE GATE** · `test typecheck: 112 fichiers lus, 92 erreurs (liste: 92)` ⇒ **112 / 112 typecheckés** *(le seuil du plan, « 44/44 », était **périmé de 2,7×**)* · `deno check` porte **5 entrées, les deux lanes comprises**. Coût : le gate passe de ~1 min 50 à **2 min 30** |
| **armé par** | ⟳ ⛔ **TROIS mutations, trois `rc=1`, et le gate NOMME la cause à chaque fois.** ① un test front cassé ⇒ `1 hors liste`, `rc=1` ② une erreur de type dans un fichier **vert** ⇒ `93 erreurs (liste: 92)`, `rc=1` ③ ⛔ **la mutation qui prouve que la liste n'est PAS une permission générale** : une **troisième** erreur dans un fichier qui en tolère **deux** ⇒ `— 3 erreurs de type, la liste en tolère 2`. **Deux cas de bord vérifiés en plus** : un fichier qui **ne se CHARGE pas** échoue **toujours, même listé** ; une ligne devenue **verte** s'annonce à chaque passage **sans faire échouer** |
| **coût** | **un petit lot** |
| **risque** | ⟳ ⛔ **MESURÉ PAR SONDE — ET LA CONSÉQUENCE POUR `L6′` EST L'INVERSE DE CELLE QU'ANNONÇAIT CETTE FICHE.** Les trois faits sont vrais : un `.int.test.tsx` rend **« No test files found »** · `typeof document` = **`undefined`** · `jsdom`, `happy-dom`, `@testing-library/*` sont **tous ABSENTS**. ⛔ **MAIS `L6′` n'est PAS bloqué** : **22 fichiers montent déjà des composants** via `renderToStaticMarkup` *(61 occurrences)*, **`BoxTable` n'a AUCUN portail**, et il est **DÉJÀ monté** par `mealBoxes.int.test.ts`. **Le chemin de `L6′` existe.** ⛔ **Ce qui reste réellement impossible, c'est un composant à PORTAIL** — et le code le documentait **déjà** ⇒ fiche **`H4`**. ⚠️ **Second risque, celui-là est à lui** : `tsconfig.test.json` est **volontairement NON référencé** depuis `tsconfig.json` — **quiconque le « range » dans les `references` casse les commits de tout le dépôt** |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① Le seuil de la fiche était PÉRIMÉ DE 2,7×** — « 44/44 · 673 tests » contre **112/112 · 1 788**. `S6` l'avait déjà mesuré, **et le plan ne l'avait pas suivi**. ⛔ **② La clé dupliquée n'est PAS « passée à travers » l'histoire — elle n'a JAMAIS été regardée.** `git show HEAD:` n'en porte aucune ; les six vivent dans la part non commitée d'un voisin. **Le verbe change le défaut**, et le second est pire. ⛔ **③ Un gate qui « rapporte sans bloquer » NE PEUT PAS ÊTRE ARMÉ** — c'est la voie B littérale, et elle aurait livré **la garde muette que ce dépôt collectionne**. ⛔ **④ Un glob de test dans un commentaire de bloc JSON REFERME le commentaire** — **10 erreurs de syntaxe** qui ressemblaient trait pour trait à des erreurs de code. ⚠️ **⑤ Le disque est à 297 Mio** : un `git worktree add` de HEAD a **échoué en cours de route** |

### ⟳ CLÔTURE DE LA VAGUE 1 — **2026-08-22**

> §⑦ : *« Une vague n'est PAS close sans ces trois choses. »*

#### ① La sortie datée de `V0-E′`, archivée côte à côte
`scratchpad/2026-08-22-0500-V0E-tableau-de-bord-FIN-VAGUE-1.txt`, à comparer à celle de la vague 0.

```
                       fin vague 0 (23:56)      fin vague 1 (05:00)
#1  boîtes             1 / 181                  clé 2 · NON VIDE 1 / 182   ⛔ le 2e plan a la CLÉ et un tableau VIDE
#3  résolu+pesé        foyer 93,6 % solo 36,4 %  foyer 93,5 % solo 36,4 %
#4  plats              1 857                     1 885   (unknown_ingredient 458 → 473)
#5  inconnus/plan      1 / 181                   2 / 182 · la vue rend 1 ligne
#6  activité           5 / 24 / 18 sur 47        inchangé
#7  ceinture > 1 bouche   0 / 14                 ⬆️ **1 / 15**   ← LE CHIFFRE DE LA VAGUE
#8  portion_note gramme  181 / 344               181 / 348   ⬇️ et c'est une RÉUSSITE (`V0-E′-ter`)
#9  contraintes        6 non couvertes / 58      6 / **59** — et ⛔ **les 6 sont désormais COUVERTES par `S2`**
#10 sans birth_date    25 / 92 · 1 193 / 1 313   25 / 92 · 1 213 / 1 333
```

#### ② La vérification en conditions réelles — **ce qui est prouvé, et ce qui ne l'est pas**

**Prouvé sur des DONNÉES RÉELLES, sans dépenser une génération :**

| critère de la vague | preuve |
|---|---|
| une intolérance `strict` fait refuser, un `preference` **ne fait rien** | ✅ compteur `belt` sur les **58 lignes actives** : `strict bit 0 → 6`, `preference bit 0`, **muettes `[]`** |
| un plan **sans contrainte** sort **byte-identique** | ✅ **128 → 128 octets**, `reason "clean"` |
| une bouche enceinte **ne reçoit aucune boîte pesée** | ✅ `noSizing("pregnancy")`, **facteur 1 exact**, ancre `null` — et un autre `condition_ref` **byte-identique JUSQU'AUX GRAMMES** |
| plat dédié + allergie médicale ⇒ **bloc de non-partage** | ✅ `emitted 25 / 95` sur le corpus, **cardinalité 95/95**, fixture ⇒ `emitted` |
| les **29 violations** de conservation tombent à **0** avec un `within` non nul | ✅ `{violations 102, within 1 179, not_evaluated 83}`, **0 violation résiduelle après refus, 0 plan vidé** |
| l'export contient les allergies du foyer, la purge décide | ✅ **archive RÉELLE** : 2 libellés du maître, **0 de l'autre bouche** ; purge « je pars » **0 ligne**, « détachement » **1** |
| **`anon` n'écrit plus** | ✅ **0 / 56**, `TRUNCATE` compris, **bout en bout par PostgREST avec la vraie clé anon** : `PATCH` → **401** |
| une allergie **avec ligature** écrit une ligne | ✅ **12/12** sous Deno, et **4/4** sur le plancher clinique |
| ⟳ **la ceinture voit plus d'une bouche** | ✅ **`mouths` 1 → 2**, compteur #7 **0/14 → 1/15** — *première fois du dépôt* |

⛔ **Ce qui N'EST PAS prouvé en conditions réelles, et qui doit être écrit :**
- **`S3`** — *« un mineur reçoit un plan SANS CHIFFRE »* : prouvé **par test** depuis `energy_gate.ts`, sur les **1 313 lignes réelles** *(le chiffre passe de 1 296 à 103 sorties)*, **jamais par un run**.
- ⛔ **Le seuil ③ est tenu À VIDE** : `checked = 0`, parce que le plan neuf **ne porte aucune boîte**. *(`V0-C-quater-a`)*
- ⛔ **Et la ceinture n'a toujours JAMAIS MORDU** : `refused`, `bites`, `separated` restent à **0** — non par sommeil, mais parce que **`dietDiverges` est gaté par l'OBJECTIF, pas par le régime**. **La fin de vague 5 est hors d'atteinte de cette fixture.**

#### ③ Ce que la vague a RÉVÉLÉ

| | |
|---|---|
| ⛔ **Le seul filet RGPD du dépôt était INEXÉCUTABLE depuis le 2026-08-03** | et rien ne le disait. Une liste à la main se périme de **trois** façons ; la troisième — *la table existe, sa colonne de propriétaire non* — n'est attrapée par aucune des deux autres. **Il ne rougissait pas : il ne PARTAIT pas** |
| ⛔ **Le plancher de maladie n'a JAMAIS mordu en réel** | **0 jeton sur 358 messages archivés**. La garde dont l'en-tête dit qu'elle est *« le seul défaut qui peut blesser quelqu'un »* n'a **aucune trace d'exécution** |
| ⛔ **Le vrai coût de `S2` n'était pas le taux de refus** | une morsure **VIDE le plan**, et le prompt disait au modèle que **seul `medical`** fait ça. Élargir sans corriger, c'était rouvrir **le trou qui a déjà détruit une semaine entière** |
| ⛔ **`S4` ne fermait pas une brèche : il POSAIT la garde, sur quatre surfaces** | quatre ordres, **quatre `ok:true`**, dont une cible de 40 kg à 0,5 kg/sem **sur une enfant de 15 ans** |
| ⛔ **Le trou de `C1` avait déjà 25 plans dedans** | et **c'est le moteur qui ordonne la cuisine partagée** : *« same cooking session, same shopping, different plate »* |
| ⛔ **`TRUNCATE` déborde les 8 tables : 55 sur 126** | dont `internal_admins`, dont la seule policy est en `SELECT` — **l'écriture est retenue par la RLS, le `TRUNCATE` par rien** |
| ⛔ **Une ligature échappe à la RÉDACTION de la mémoire** | et, dans la lane de crise, quelqu'un qui parlait de sa sœur était lu **comme étant lui-même en crise** |
| ⛔ **LES BOÎTES SONT UN TIRAGE** | à prompt **identique** : `boxes` **38 → 0**. **Le seuil ② de `V0-D` ne se reproduit pas**, et `mouths_unboxed: 0` est un **faux zéro** |
| ⛔ **Chaque run réel AMPUTE le plan de la vague précédente** | `3c781a71` : **7 j → 1 j** |
| ⚠️ **Cinq gardes auraient passé VERTES sur leur propre cas** | et **aucune** n'a été trouvée par une relecture — **toutes par une mutation**. C'est le seul instrument auquel cette campagne fait encore confiance |
| ⚠️ **Un gate qui « rapporte sans bloquer » ne peut pas être ARMÉ** | la voie B littérale aurait livré **une garde muette de plus** |

#### ④ Le dépensé réel — **c'est lui qui ouvre le plafond suivant**

| | plafond | **dépensé réel** |
|---|---:|---:|
| vague 0 | 3 | **1** génération · 26 906 tokens |
| **vague 1** | 9 | ⛔ **1 génération** · **20 976 tokens** *(+ 634 de secours, hors plafond)* |

⇒ **2 générations pour 15 lots.** Les gardes se prouvent **sur les données déjà en base** ; le plafond ne sert qu'aux seuils **qui ne se lisent pas dans le code**.

#### ⑤ Ce qui reste ouvert en sortant

- ⛔ **`L24′` — PORTE P0**, la qualification juridique. **Hors délégation.**
- ⛔ **Quatre lots bloqués par le mur des fichiers non commitables** : `V0-A-bis`, `S3-a` *(16 escalades servent un fait faux)*, `S1b-c` *(un 500 avec une phrase d'ingénieur anglaise)*, `S2` *(livré, mais **rien n'est commitable**)*.
- ⛔ **`S6-a`** — une **policy** n'est pas réversible par un `grant` : **hors du critère de délégation**.
- **19 fiches neuves** ouvertes par la vague : `S1c`, `S1d`, `S1e`, `X2′`, `S1b-bis`, `S1b-c`, `S3-a`, `S4-a`, `S4-b`, `S4-c`, `S4-d`, `S5-a`, `S5-b`, `S6-a`, `S6-b`, `S6-c`, `C1-a`, `L0-a-bis`, `L0bis-a`, `L0bis-b`, `L0bis-c`, `L35-a-bis`, `L35-a-ter`, `H3`, `H4`, `L6′-b`, `V0-C-quater-a`, `V0-C-quinquies`.


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

## L19b — appliquer ce que le lot 19 a mesuré · ✅ **LIVRÉ le 2026-08-22**

| | |
|---|---|
| **quoi** | Le français cesse d'atteindre un autre aliment que celui qu'on a écrit. |
| **pourquoi** | ① `complet/complete/complets/completes` est toujours dans `PREPARATION_MODIFIERS` (`food_composition.ts:384-387`), entré « par symétrie » avec `whole` — mais `wholemeal` est **un seul mot** en anglais et `complet` ne l'est pas : `pain complet grillé` (**7 occurrences réelles**) atteint `white_bread`, **`whole_grain` bascule en `refined_grain` en silence**, et ~~**38 réductions latentes changent l'aliment**~~ ⟳ **38 est le TOTAL de la liste des 127 modificateurs ; `complet`/`completes` en portent CINQ** *(mesuré 11:22:30, `07-modificateurs.ts`)* — toutes `whole_grain → refined_grain` : `pain complet`, `pain de mie complet`, `riz complet`, `muffin anglais complet…`, `pates completes`. ② **19 alias morts** dont le texte est lui-même un **autre slug** — `bySlug` gagne toujours (`red onion` dit `onion` et capture `red_onion` : l'un des deux est faux) ⟳ **sur 210 morts au total : 191 sont INOFFENSIFS** *(ils désignent la ligne que leur propre forme capture)*, **19 seulement sont CONTRADICTOIRES**. ③ Les **86 alias vérifiés** sont absents de la base. |
| **dépend de** | rien |
| **bloque** | `L-1`, `L-C`, `L17`, et le compteur #2 |
| **fichiers** | `_shared/keel/food_composition.ts:384-387` · migration d'alias depuis `…LOT19-PROPOSITIONS-ALIAS.tsv` (86) et `…-CORRECTIONS-ALIAS.tsv` (9) |
| **migration** | **oui** — `food_composition_aliases` est déjà `revoke`d (`f/f/f/f/f`, vérifié) |
| **mesure AVANT** | ⟳ **REJOUÉE le 2026-08-22 à 11:21:57 CEST**, commande littérale : `cd scratchpad/2026-08-22-1120-L19b-mesure && deno run --allow-read 06-nom-nu.ts <dir>` ⇒ `EN 150 100.0 %` · `FR 124 82.7 %` · `ÉCART sur « bon aliment » : 26 aliments, soit 17.3 points`. **Les trois chiffres du plan, au chiffre près.** Sondes (11:22:15) : `pain complet grille` → `white_bread` *(refined_grain, 278 kcal, `unit_grams = 35`)* — **7 occurrences réelles** · `wraps` ×19 + `wrap` ×1 → `white_bread`, **20 occurrences** ⇒ « 2 wraps » pèse **70 g au lieu de 120**. Réductions qui changent l'aliment **38** · alias morts **210, dont 19 contradictoires**. Archive : `scratchpad/2026-08-22-1120-L19b-mesure/mesure-AVANT.txt` |
| **direction** | ⬆️ le français ; l'anglais **ne bouge pas** (déjà 150/150). ⚠️ **Le taux global peut ne PAS bouger** — le corpus ne porte qu'**un** plan français, d'où une mesure d'après **construite**. ⟳ **ÉCRITE AVANT, ET À MOITIÉ FAUSSE — c'est une information** : le français monte bien et l'anglais des 150 paires ne bouge pas, mais **le corpus, lui, a bougé beaucoup, et surtout en ANGLAIS** : 45 occurrences déplacées et 45 gagnées, dont `wraps` ×19, `braised beef` ×11, `cooked chicken thigh meat` ×10, `toast` ×6 |
| **mesure APRÈS** | ⟳ **11:34:06 CEST** — les 150 paires rejouées : **FR 124 → 147/150 (98,0 %)** ✅ *(seuil ≥ 145)* · **EN 150/150** ✅ *(seuil = 150)* · **écart 17,3 → 2,0 points** ✅ *(seuil ≤ 4)*. **LES TROIS SEUILS ATTEINTS.** Corpus entier (827 chaînes, 10 038 lignes) : résolues **637 → 651** distinctes, **9 545 → 9 590** occurrences, ⛔ **0 PERDUE**. Alias contradictoires **19 → 0**. Archive : `…/mesure-APRES.txt` et `…/diff-corpus-AVANT-APRES.tsv` |
| **armé par** | les **cinq épreuves automatiques** du lot 19 (`09-verifier-propositions.ts`) — dont *« l'alias n'est pas MORT »* — **rejouées le 2026-08-22 à 11:28:01 sur la base du jour et le module corrigé : 86 lues, 86 retenues, 0 écartée** ; corrections **9/9**. ⛔ Elles avaient déjà **écarté 3 propositions et révélé un alias existant FAUX**. **Deux gardes livrées** : `lot19b_complet_test.ts` *(6 cas)* et `lot19b_aliases_test.sql` *(8 cas + assertion de CARDINALITÉ)*. **11 mutations, 11 rouges**, copie non mutée vérifiée d'abord sur les deux bancs — `…/journal-de-mutation.txt` |
| **coût** | **un lot** — ⛔ **on ne livre PAS les 4 800 qu'il faudrait pour atteindre 8 formulations** : *« un alias plausible non vérifié est un alias faux pas encore découvert »* |
| **risque** | ⛔ **Un mauvais alias remplace un aliment par un autre, pour tout le monde, définitivement — et ça ressemble à une donnée, pas à un bug.** ⚠️ `prune` (×5) et `pate` restent **irréparables par un alias** : seul un renommage de slug répare *(lot `O8`)* — ⟳ **vérifié en sortie : `prune` est l'un des 3 échecs FR restants, et il l'est toujours** |
| ⛔ **ce qui est commité, ce qui ne l'est pas** | **Commité** *(commit `bd4bf452`, 24 fichiers)* : la migration `20260822113000_lot19b_les_alias_verifies.sql` *(volets ② et ③)*, les deux gardes, les scripts et archives de `scratchpad/2026-08-22-1120-L19b-mesure/`, cette fiche. ⛔ **NON commité, et vivant seulement dans l'arbre de travail : le volet ①** — le retrait des quatre mots de `PREPARATION_MODIFIERS`. `food_composition.ts` est `M` avec **+370 lignes d'une AUTRE session** *(le sas du lot 18)* : le commiter emporterait leur travail *(mur §⑨ n° 15)*. Le correctif est donc **vivant et mesurable** — c'est lui que `functions serve` exécute — mais **absent de `HEAD`**. ⇒ `lot19b_complet_test.ts` **rend 3 passed / 3 failed face au module de `HEAD`**, mesuré, et chaque échec le dit dans son message. **Passation** : le jour où `food_composition.ts` est commité, vérifier que les quatre mots n'y sont pas revenus, et retirer la constante `CHAMPS_QUE_HEAD_NE_CONNAIT_PAS_ENCORE` du test. ⚠️ **Cette fiche, la fiche `L19c` et la ligne de journal ci-dessous ne sont PAS dans le commit `bd4bf452`** : écrites à 11:48, elles ont été emportées à 11:55 par le commit `5362312e` *(lot `L17-0`, une autre session)* — **le fichier de plan est partagé, et il part avec le premier qui commite**. Le SHA a été recollé ensuite |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① LES 26 ÉCHECS FRANÇAIS N'ÉTAIENT PAS 26 TROUS DE TRADUCTION.** Sur les 3 qui restent, **2 ne sont pas un problème de langue** : `oeuf` atteint `whole_eggs` *(Eggs, 140)* quand la paire attend `egg` *(Egg raw, **140**)*, `yaourt` atteint `plain_yogurt` *(59)* quand la paire attend `yoghurt` *(Yoghurt plain average, 56,8)*. **Le référentiel porte des DOUBLONS, et l'épreuve du nom nu les compte comme des échecs de langue.** ⇒ fiche neuve **`L19c`**. ⛔ **② LE COMPTEUR DES RÉDUCTIONS DANGEREUSES MONTE PENDANT QU'ON RÉPARE** : 38 → 33 à univers constant, mais **35 publié**, parce que le script éprouve les NOMS connus et que 86 alias neufs en ajoutent 86 *(3 312 → 3 398)*. Les deux nouveaux (`piment moulu`, `ground chilli`) atteignaient **déjà** le mauvais aliment avant *(`chilli` 44,5 au lieu de `chilli_powder` 282)*, l'alias les **corrige**, et la forme étendue rend `∅` **avant comme après**. **Un compteur qui monte sans son dénominateur est indiscernable d'une régression.** ⛔ **③ LES 19 ALIAS MORTS NE CHANGENT RIEN AUJOURD'HUI — C'EST EXACTEMENT POURQUOI ILS DEVAIENT PARTIR** : dans les 19 cas la ligne réellement atteinte est la ligne EXACTE, c'est la DÉCLARATION qui est fausse (`vegetable stock` disait `stock_cube` **240 kcal** ; la ligne atteinte en porte **4**). Le retrait ne corrige aucun calcul : il retire **la seconde vérité** que le premier qui inverse l'ordre de consultation ferait sortir, sur 19 aliments d'un coup. ⛔ **④ LE MUR DU §⑨ n° 15 A MORDU DEUX FOIS.** Pas seulement le correctif : **`CompositionRef` porte 19 champs dans l'arbre contre 17 à `HEAD`** (`source`, `condimentGrams`, arrivés avec le sas). Un test neuf qui construit un `CompositionRef` **ne type-checke dans AUCUN des deux mondes** sans précaution — et `deno test` type-vérifie **tout le répertoire d'un coup**, donc un rouge de TYPE ici aurait emporté le banc de **tous les autres lots**. ⚠️ **⑤ UNE GARDE À TROIS QUARTS ARMÉE RESSEMBLE À UNE GARDE ARMÉE** : avec 2 cas, remettre `completes` **seul** dans la liste passait **VERT** — 3 des 4 graphies n'étaient tenues par rien. **C'est la mutation qui a écrit le troisième cas.** ⚠️ **⑥ Le lot est vendu comme un lot de FRANÇAIS ; sa plus grosse morsure mesurée est ANGLAISE** — `wraps` ×19 quittent `white_bread` *(35 g l'unité, UNE TRANCHE)* pour `tortilla_wrap` *(60 g)* |

## ⟳ L19c — le référentiel porte des DOUBLONS, et on les compte comme des trous de langue *(fiche NEUVE, ouverte par `L19b`)*

> ⟳ **Ouverte le 2026-08-22 par la `mesure APRÈS` de `L19b`.** Elle renverse la lecture
> des échecs français : **une part de l'« écart FR/EN » n'est pas un écart de LANGUE.**

| | |
|---|---|
| **quoi** | Deux lignes du référentiel qui décrivent le même aliment cessent de se disputer les noms. |
| **pourquoi** | ⛔ Sur les **3** échecs français qui restent après `L19b`, **2 atteignent une ligne JUMELLE du même aliment** : `oeuf` → `whole_eggs` *(Eggs, eggs, **140** kcal)* quand la paire attend `egg` *(Egg, raw, eggs, **140** kcal)* ; `yaourt` → `plain_yogurt` *(Plain yogurt, dairy_yogurt, **59**)* quand la paire attend `yoghurt` *(Yoghurt, plain (average), dairy_yogurt, **56,8**)*. **Même groupe, même énergie à 4 % près, deux slugs.** ⚠️ Et l'asymétrie est réelle en production, pas seulement dans l'épreuve : depuis `L19b`, l'anglais `egg` atteint `egg` *(par `bySlug`)* et le français `oeuf` atteint `whole_eggs` *(par alias)* — **le même mot, deux lignes, selon la langue**. ⛔ Ce n'est pas un cas isolé : `blueberry`/`blueberries`, `raspberry`/`raspberries`, `strawberry`/`strawberries` étaient parmi les **19 alias contradictoires** de `L19b` pour la même raison. |
| **dépend de** | `L19b` |
| **bloque** | rien — mais il **fausse tout compteur de parité FR/EN**, `L2-lang` compris |
| **fichiers** | ⛔ **aucun code** : un recensement des couples de `food_composition_refs` à même groupe et à énergie proche, puis une décision par couple *(fusionner, ou nommer ce qui les sépare)* |
| **migration** | **oui**, mais ⛔ **PAS AVANT LE RECENSEMENT** — fusionner deux lignes casse les alias qui pointent sur la perdante |
| **mesure AVANT** | ⟳ **partiellement mesurée** : **2 couples nommés** *(`whole_eggs`/`egg`, `plain_yogurt`/`yoghurt`)* + **3 couples singulier/pluriel** vus par `L19b`. ⛔ **Le recensement complet des 923 lignes n'existe pas** |
| **direction** | ⬇️ le nombre de couples jumeaux. ⚠️ **Écrite d'avance : le taux de l'épreuve du nom nu peut ne PAS monter** — la paire attend un slug précis, et fusionner peut faire gagner l'un en faisant perdre l'autre. **Le bon compteur est le nombre de COUPLES, pas le taux** |
| **mesure APRÈS** | recensement publié *(la liste exacte, comme `L-C`)*, puis **0 couple à même groupe ET à moins de 5 % d'écart d'énergie hors liste décidée** |
| **armé par** | un test qui **liste** les couples jumeaux et **rougit quand la liste grandit** *(famille `X2′`)* — jamais un test qui compte |
| **coût** | **un petit lot** pour le recensement · la fusion est un lot à part, avec `O8` |
| **risque** | ⛔ **Fusionner est IRRÉVERSIBLE côté alias** : les 2 601 alias pointent sur des slugs, et la ligne perdante emporte les siens. ⚠️ Et **deux lignes proches ne sont pas toujours un doublon** — `bread` *(moyenne, 276)* et `white_bread` *(278)* sont **délibérément** deux généricités différentes, `L19b` s'appuie dessus |

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
| **fichiers** | ⟳ **RÉPARÉ LE 2026-08-22.** ⛔ **Aucun jumeau côté foyer : vérifié, et c'est un fait à garder.** `ingredientPayload()` (`_shared/keel/meal_generation.ts`, `:6813` avant le lot) est l'**écrivain unique** des lignes d'ingrédient — `grams_raw` a **1 seule occurrence d'écriture** dans tout `supabase/functions/`, et les deux lanes passent par `mealDishesPayload` / `mealPreparationsPayload`. Côté foyer, `applyHouseRuleLock` **étale** (`{...dish}`) et ne reconstruit aucune ligne ; `household_portions.ts` et `household_meal_generation.ts` n'écrivent **aucun** ingrédient. ⇒ **un seul site à réparer**, et c'est la bonne nouvelle du lot. **NEUF et COMMITÉ** : `_shared/keel/food_group_write.ts` + `food_group_write_test.ts` (16 épreuves). **ARBRE DE TRAVAIL SEULEMENT** (mur §⑨ n° 15) : `meal_generation.ts` (`ingredientPayload` étale `ingredientGroupPayload(i.group)`), `generate-meal-v1/index.ts` et `generate-household-meal-v1/index.ts` (`generated_from.food_groups` à la RACINE des deux lanes + un journal `keel.*.food_groups`). |
| **migration** | non — la clé voyage en jsonb |
| **mesure AVANT** | ⟳ **EXÉCUTÉE le 2026-08-22 à 11:21-11:23 CEST** — `docker exec supabase_db_Sophia_2 psql -U postgres -d postgres -c "…"`. ⛔ **Trois chiffres de la fiche ont bougé, et ils sont corrigés ici :** ① lignes d'ingrédient *(plats **6 851** + préparations **3 202**)* → ~~9 810~~ **10 053**, dont **0** portant `group` — et **0** aussi pour `ing->>'group' is not null` *(les deux prédicats, parce que le second est le seul qui dira quelque chose APRÈS)* ; ② plans sous `meal.*.v16+` → ~~1 / 180~~ **3 / 182** *(la base a reçu `3c781a71` le 08-21 par `V0-D` et `66de9046` le 08-22 par `V0-C-quater`)* ; ③ `regime_belt` sur `0a02b706…` → **25 / 25 / 0** ✅ **reproduit au chiffre près**, et les deux plans neufs disent **134 / 124 / 10** et **83 / 83 / 0** ⇒ ⛔ **242 groupes déclarés, 232 valides, 0 persisté : le modèle obéit 3 fois sur 3** ; ④ clés réellement persistées → **7**, `[amount, grams_raw, in_pantry, quantity, state, term, unit]`, **sans `group`** ✅. ⚠️ **`regime_belt` ne vit PAS dans `generated_from` à la racine** — il est sous `generated_from->'household'->'regime_belt'`, **et seulement sur la lane foyer** : la lane solo n'en persiste rien. |
| **direction** | ⬆️ ⚠️ **et elle porte DEUX populations, écrites d'avance** : `groups_declared` *(ce que le modèle écrit)* et `groups_persisted` *(ce qui atteint la base)*. ⛔ **Aujourd'hui l'écart est de 100 %** — 25 déclarés, 0 persistés. Sans les deux compteurs, un modèle qui cesserait de déclarer serait **indiscernable** d'une écriture réparée · ⟳ **LIVRÉE** sous la forme `generated_from.food_groups = {declared, valid, refused, persisted, lines}`, **à la RACINE des deux lanes** — même place que `names`, parce que `FOOD_GROUP_DECLARATION_BLOCK` est une consigne du **TRONC**. `lines` est le dénominateur : sans lui, `persisted: 0` sur un plan vide et sur un plan de 200 lignes sont le même nombre. |
| **mesure APRÈS** | ⟳ ⛔ **EN ATTENTE DU RUN GROUPÉ** *(budget modèle nul sur ce lot : aucune génération lancée)*. **Prouvé sur banc, sans appel de modèle** : la charge produite par le vrai chemin (`parseGeneratedMeal` → `mealDishesPayload`/`mealPreparationsPayload`) passée à la **requête exacte** ci-dessous rend `declared 5 · valid 4 · refused 1 · persisted 4 · lines 5 · lignes_avec_groupe 4 · écarts 0 / 0` ⇒ **`OK — seuil atteint`** *(11:42 CEST)*. La **même requête** sur la charge d'AVANT le lot *(les sept clés, `group` retiré)* rend **`ECHEC — aucune ligne en base ne porte un groupe`** et `ecart_base_vs_compteur = -4` : **le verdict SQL est armé**. Sur la base réelle au 11:38, le dernier plan (`66de9046`) rend `ECHEC — le plan ne porte pas generated_from.food_groups` avec `belt_valid 83` contre `lignes_avec_groupe 0` — l'écart de 100 %, vu par la requête qui le fermera. **Seuils, tous les quatre :** `declared > 0` *(sinon la mesure est VIDE — voir « risque »)* · `lignes_avec_groupe ≥ 1` · `persisted = valid` · `lignes_avec_groupe = persisted`. ⛔ **`ing ? 'group'` NE MESURE PLUS RIEN** : la clé est écrite même à `null`, donc elle est vraie partout — le seul prédicat qui dit quelque chose est **`ing->>'group' is not null`**. |
| **armé par** | ⟳ **UN COMPTEUR, ET IL EST MUTÉ.** `food_group_write_test.ts` : **16 épreuves**, suite keel **4 159 / 0**. **Preuve par mutation, sur copie hors dépôt** *(`scratchpad/L17-0-mut/`, copie NON MUTÉE vérifiée d'abord : 16/16, `rc=0`, 11:39:13)* — ① clé `group` retirée du payload ⇒ **`rc=1`, 4 rouges** · ② `persisted` cloué à `groups_valid` ⇒ **`rc=1`, 5 rouges** · ③a le compteur cesse de valider le vocabulaire fermé ⇒ **`rc=1`, 2 rouges** · ③b le parseur cesse de refuser un slug inventé ⇒ **`rc=1`, 1 rouge** · ④ les préparations sortent du compteur ⇒ **`rc=1`, 5 rouges**. Copie restaurée ⇒ **16/16**. ⚠️ **Le test unitaire ne suffisait pas et c'est écrit dans le fichier** : `ingredientPayload` recopiait déjà sept clés « correctement ». |
| **coût** | **un petit lot** |
| **risque** | ⚠️ ⟳ **Le test qui porte le nom de la byte-identité ne la tient pas** : `« FF-042 — sans régime déclaré, le prompt est INCHANGÉ »` (`dietary_regime_solo_lane_test.ts:96-105`) compare `dietBlock: ""` à `dietBlock: "   \n "` — **deux prompts sans régime entre eux** — et **reste vert** sous la modification. La seule garde réelle de la conditionnalité est `:466`. ⛔ **Ne pas prendre ce test vert pour une preuve d'innocuité** ⟳ ⛔ **ET UN SECOND RISQUE, PLUS DUR, DÉCOUVERT PAR LE LOT : la `mesure APRÈS` peut être VIDE sans être rouge.** `FOOD_GROUP_DECLARATION_BLOCK` **est toujours conditionnel** — il ne part qu'avec `dietaryRegimePromptLine`, et la porte G2 délègue son inconditionnalité à un AUTRE commit *(§⑨ n° 3, non livré au 11:45)*. **136 plans sur 180 (75,6 %) n'ont aucun régime déclaré** : sur une fixture pareille, le modèle ne reçoit pas la consigne, `declared = 0`, et `persisted = valid = 0` **satisferait « l'écart tombe à 0 » sans rien prouver**. ⇒ **le run groupé doit viser une fixture PORTANT UN RÉGIME**, et le verdict de la requête refuse explicitement le cas `declared = 0`. |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① La consigne était partie, elle avait été entendue, et personne ne l'a jamais reçue.** Le zéro qui a orienté deux jours de chantier était un zéro d'**écriture**, pas d'obéissance : entre le parseur qui posait le champ et la RPC, une fonction de recopie de dix lignes le laissait tomber. **La bonne question n'était pas « le modèle obéit-il ? » mais « qui a compté ce qui est arrivé ? » — et personne.** ⛔ **② Un seul écrivain, et c'est le fait rassurant du lot** : le jumeau redouté côté foyer n'existe pas *(`grams_raw` : 1 occurrence d'écriture ; `applyHouseRuleLock` étale ; `household_portions.ts` n'écrit aucun ingrédient)*. ⚠️ **③ Le compteur du modèle n'avait qu'UNE lane** : `regime_belt` n'est persisté que par le foyer, et seulement sous `generated_from.household` — **la lane solo ne persistait aucun des trois nombres.** `food_groups` est donc posé à la RACINE des DEUX lanes, à côté de `names`, dont le commentaire portait déjà la règle. ⛔ **④ La clé écrite même à `null` RETOURNE la mesure d'avant** : `ing ? 'group'` passe de 0 à 100 % sans qu'aucun modèle n'ait déclaré quoi que ce soit. Toute requête héritée qui lit ce prédicat *(y compris celle de la fiche `L17`)* est **périmée** et doit devenir `ing->>'group' is not null`. ⛔ **⑤ `L17` doit chercher la clé `group`, pas `food_group_ref`** — les deux fiches nommaient la seconde. Et `shopping_list[].food_group` **existe déjà** et n'est PAS la même chose : il est **résolu depuis le référentiel** (`resolveIngredient(...).foodGroupRef`, lot `L0-a`), quand `group` est **déclaré par le modèle** puis validé. **Deux provenances, deux noms** — leur donner le même inviterait à faire confiance à une déduction comme à une déclaration. |


> ⟳ **LA REQUÊTE EXACTE DE LA `mesure APRÈS`** — à lancer telle quelle sur le plan neuf du run groupé.
> Elle rend **un verdict**, pas des nombres à interpréter. ⛔ **Elle refuse `declared = 0`** : sans régime
> déclaré sur la fixture, la consigne ne part pas et un `0 = 0` ressemblerait à un seuil atteint.

```bash
docker exec -i supabase_db_Sophia_2 psql -U postgres -d postgres -x <<'SQL'
-- L17-0 · MESURE APRÈS — à lancer sur un PLAN NEUF.
-- Par défaut: le dernier plan écrit. Pour en épingler un:
--   remplacer le corps de `cible` par:  select * from student_generated_meals where id = '<uuid>'
with cible as (
  select * from student_generated_meals order by created_at desc limit 1
), lignes as (
  select ing from cible m,
    lateral jsonb_array_elements(coalesce(m.dishes, '[]'::jsonb)) d,
    lateral jsonb_array_elements(coalesce(d->'ingredients', '[]'::jsonb)) ing
  union all
  select ing from cible m,
    lateral jsonb_array_elements(coalesce(m.preparations, '[]'::jsonb)) p,
    lateral jsonb_array_elements(coalesce(p->'ingredients', '[]'::jsonb)) ing
), lu as (
  select
    c.id,
    c.created_at,
    c.plan_kind,
    c.generated_from->>'prompt_version'                     as pv,
    (c.generated_from->'food_groups'->>'declared')::int     as declared,
    (c.generated_from->'food_groups'->>'valid')::int        as valid,
    (c.generated_from->'food_groups'->>'refused')::int      as refused,
    (c.generated_from->'food_groups'->>'persisted')::int    as persisted,
    (c.generated_from->'food_groups'->>'lines')::int        as lines_comptees,
    (select count(*) from lignes)                           as lignes_reelles,
    -- ⛔ `ing ? 'group'` NE MESURE RIEN depuis L17-0: la clé est écrite même à
    -- `null`. Gardée ici pour qu'on ne la reprenne pas par erreur.
    (select count(*) from lignes where ing ? 'group')        as lignes_avec_cle,
    (select count(*) from lignes where ing->>'group' is not null)
                                                            as lignes_avec_groupe,
    -- CONTRE-LECTURE (lane FOYER seulement): la ceinture ecrit deja ses trois
    -- nombres sous `household.regime_belt`. Informative, jamais un verdict:
    -- la lane solo ne l ecrit pas.
    (c.generated_from->'household'->'regime_belt'->>'groups_valid')::int
                                                            as belt_valid
  from cible c
)
select *,
  valid - persisted                     as ecart_compteur,
  lignes_avec_groupe - persisted        as ecart_base_vs_compteur,
  case
    when declared is null then 'ECHEC — le plan ne porte pas generated_from.food_groups (lane ou build trop ancien)'
    when declared = 0     then 'NUL — le modele n a rien declare: la consigne n est pas partie (fixture sans regime, ou porte G2 non livree)'
    when lignes_avec_groupe < 1 then 'ECHEC — aucune ligne en base ne porte un groupe'
    when persisted <> valid then 'ECHEC — ecart declare/persiste non nul'
    when lignes_avec_groupe <> persisted then 'ECHEC — le compteur et la base ne disent pas la meme chose'
    else 'OK — seuil atteint: declared>0, groupe en base >=1, persisted=valid, base=compteur'
  end as verdict
from lu;
SQL
```
## L17 — l'abstention se PÈSE *(gardé par G2)*

| | |
|---|---|
| **quoi** | Un ingrédient dont on ignore la masse ne fait plus tomber la journée s'il ne peut pas peser lourd. |
| **pourquoi** | *« On s'abstient quand l'énergie NON RÉSOLUE dépasse une part de la cible (~5 %). Jamais parce qu'un ingrédient manque. »* Le groupe **borne** un inconnu : 12 g de « légume » vaut 1 à 12 kcal (0,4 % d'une journée) ; 130 g de « viande » jusqu'à 34 %. Le dépôt connaît le gain à moitié — *« la porte s'abstenait sur du sel »*, 69 % → 96 %. |
| **dépend de** | `L19b`, `L-1`, ~~⟳ ⛔ **`L17-0`** *(sans lui la borne n'a aucune entrée)*~~ ⟳ ✅ **`L17-0` LIVRÉ le 2026-08-22** — la borne a désormais une entrée : `group` part sur chaque ligne d'ingrédient des DEUX lanes, et `generated_from.food_groups` compte ce qui arrive. ⚠️ **Le correctif vit dans l'ARBRE DE TRAVAIL** *(mur §⑨ n° 15)* ; seuls `food_group_write.ts` et son test sont commités. · ~~PORTE G2~~ ⟳ **G2 FERMÉE le 2026-08-21** *(§⑨ n° 3, coût mesuré par `Q-G2`)* — ⛔ **mais son commit n'est PAS livré au 2026-08-22 11:45 : le bloc reste conditionnel, donc une fixture SANS régime rendrait ce lot muet** |
| **bloque** | toute la vague 4 |
| **fichiers** | `_shared/keel/plan_energy.ts:225-238` · les bandes existent déjà (`food_composition_group_bands`, 24 groupes bornés) |
| **migration** | non |
| **mesure AVANT** | plats s'abstenant **1 821** · ⛔ ~~**`food_group_ref` déclaré sur une ligne d'ingrédient : 0 sur 9 810**~~ ⟳ **CORRIGÉ le 2026-08-22 par `L17-0`, sur deux points.** ① **La clé s'appelle `group`**, pas `food_group_ref` *(§⑨ n° 41)* — chercher le second rend zéro pour toujours. ② Le compte est **0 sur 10 053** *(6 851 plats + 3 202 préparations)*, et il **ne mesurait pas la désobéissance** : le modèle avait déclaré **242 groupes** sur les 3 plans générés sous v16+, et l'écriture les jetait. ⛔ **ET LE PRÉDICAT EST PÉRIMÉ** : depuis `L17-0` la clé est écrite **même à `null`**, donc `ing ? 'group'` est vrai partout. La seule mesure vivante est **`ing->>'group' is not null`**, et les deux populations se lisent dans `generated_from.food_groups` |
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

## ⛔ L26-0 — la bouche qui porte un plat dédié reçoit AUSSI une part du plat commun *(fiche NEUVE — la plus grave du run)*

> ⟳ **Ouverte par `V0-D`.** C'est le seul défaut du run qui touche **une personne**, et c'est **la mineure**.

| | |
|---|---|
| **quoi** | Une bouche ne reçoit qu'**un** contenant par repas. |
| **pourquoi** | ⛔ **Mesuré 12 fois sur 12 repas** du plan `3c781a71`. Exemple `sat/lunch` : *« Salade de lentilles estivale »* porte `box_sat_lunch_shared [Camille, Malo, Yanis]` **et** `box_sat_lunch_anouk [Anouk]` ; le plat suivant, *« Lentilles en barquette »*, `member_id = Anouk`, porte `box_sat_lunch_anouk_own [Anouk]`. **Anouk mange deux fois.** Idem `sat/dinner`, `sun/lunch`, `sun/dinner`, `mon`, `tue`, `wed`, `thu` — **six jours × deux repas**. ⛔ **Et la personne servie deux fois est LA MINEURE.** ⚠️ **Rien ne refuse, rien ne corrige** : le seul témoin est `box_counts.mouths_double = 12` et douze lignes dans `generated_from.issues` — **un champ qu'aucun écran ne lit**.  ⟳ ✅ **FAITS CONFIRMÉS SOUS TROIS ANGLES INDÉPENDANTS** : ① les deux bacs portent **le contenu IDENTIQUE** — `sat/lunch` → `109 g lentilles + 81 g légumes` dans `box_sat_lunch_anouk` **et** dans `box_sat_lunch_anouk_own` : **les remplir tous les deux, c'est 218 g** ; ② `dedicatedDishBlock` (`household_meal_generation.ts:1207`) dit littéralement *« These people cannot be fed from the shared pot »* — **avoir un bac sur le plat commun est une contradiction, pas un remplacement exprimé** ; ③ **rien en aval ne dédoublonne** : la porte ② du parseur (`meal_generation.ts:5180-5200`) ne refuse un nom que **deux fois sur le MÊME couvercle** (`seenMouths`, par boîte), et `namedOnThisDish` est **par plat** — **aucune passe par case jour×moment** |
| **dépend de** | `V0-D` *(le lot qui l'a trouvé)* |
| **bloque** | ⛔ **`L6′`** — des contenants **visibles** qui servent deux fois la même personne sont **pires qu'aucun contenant** |
| **fichiers** | `_shared/keel/meal_generation.ts` — la boucle qui compte `mouths_double` **constate** ; il lui faut une **arête** |
| **migration** | non |
| **mesure AVANT** | ⟳ **`mouths_double = 12` sur 48 `mouth_slots`**, plan `3c781a71`, 2026-08-21 · `mouths_unboxed = 0` |
| **direction** | ⟳ ⛔ **RÉFUTÉE le 2026-08-22 par la vérification adversariale — et c'est la correction qui coûte le plus cher à ne pas faire.** ~~ce n'est PAS un défaut de modèle, c'est un défaut de CONSIGNE : le brief ne lui interdit nulle part de la nommer sur le bac commun~~ ⛔ **FAUX. `boxSchemaBlock` (`household_meal_generation.ts`, fin du bloc, ~l. 1108-1111) se termine MOT POUR MOT par :** *« Do NOT write a per-person figure on a lid that carries several names: its grams describe the tub, not anybody's plate. **And do NOT name the same person on two boxes of one meal.** »* — et **le bloc A ÉTÉ SERVI** : il sort dès `members.length >= 2` (`:1051`) et il est concaténé au suffixe système à `:1854`. La fixture a **4 bouches**. ⇒ **L'interdiction existe, elle a été envoyée, LE MODÈLE L'A VIOLÉE.** **Un lot qui suivrait l'ancienne direction écrirait dans le prompt une règle qui y est déjà.** ⟳ **La vraie direction : il faut une ARÊTE, pas une phrase** — le parseur retire la seconde déclaration, ou le brief refuse le plat. ⚠️ **Et le modèle a aussi violé la moitié POSITIVE du même bloc** : le brief nommait *« These people each get a box of their OWN, alone on the lid: Malo, Anouk »* — il a donné **deux** bacs à Anouk et **zéro** à Malo. ⚠️ **Pire encore** : `dishes[2]` et `dishes[3]` de la case sont **le MÊME plat** — `ingredients` identiques (150 g tomates + 10 g persil), mêmes `uses`, seuls le `name` et le `why` diffèrent |
| **mesure APRÈS** | `mouths_double = 0` sur un plan neuf, **et `mouths_unboxed` inchangé à 0**. ⛔ **Les deux ENSEMBLE** : retirer la seconde boîte en oubliant la première rendrait la bouche **non servie**, ce qui est **pire** |
| **armé par** | ⛔ un cas qui **MORD** *(le plan `3c781a71` rejoué sur le module pur → 12)* **et un cas qui PASSE** *(un plan sans plat dédié → 0)*. Le plan est **en base** : le cas qui mord ne coûte **aucune génération** |
| **coût** | **un lot** |
| **risque** | ⚠️ La correction se décide **avant le modèle** — le moteur nomme l'exclusion, il ne la corrige pas après coup. ⛔ Et **une règle qui ne vit que dans un prompt régresse en réel sans que personne le voie** : `mouths_double` doit rester un compteur armé, pas devenir une promesse |

## ⟳ L6′-a — `box_counts.expected` demande trois bacs sur un plat qui nourrit une personne *(fiche NEUVE)*

| | |
|---|---|
| **quoi** | Le contenant attendu se calcule sur les bouches **que ce plat-là nourrit**. |
| **pourquoi** | `meal_generation.ts:6462-6486` : `boxesExpected += weighedMembers.size + lines.size` sur **tout** plat gardé qui prélève sur une préparation, **sans jamais regarder `dish.member_id`**. Sur le plan neuf : 24 plats boîtés × *(2 bouches à objectif + 1 ligne de reste)* = **72 attendus** — dont **12 plats DÉDIÉS**, qui n'ont qu'une bouche et n'en attendent donc **qu'un**. ⇒ **`boxes 38 / expected 72 = 52,8 %`, et le dénominateur est FAUX.** ⚠️ ⛔ **Un compteur faux dans le sens PESSIMISTE est aussi dangereux qu'un faux zéro** : il fera lire *« le modèle n'obéit qu'à moitié »* à un lot de vague 3 qui cherchera un défaut **là où il n'y en a pas**. |
| **dépend de** | `V0-D` |
| **bloque** | la lecture du seuil de `L6′` |
| **fichiers** | `_shared/keel/meal_generation.ts:6462-6486` |
| **migration** | non |
| **mesure AVANT** | ⟳ **`{meals:24, with_box:24, boxes:38, expected:72}`**, plan `3c781a71` |
| **direction** | `expected` recalculé **en excluant les bouches qu'un `member_id` de plat exclut** |
| **mesure APRÈS** | **Seuil : sur le MÊME plan, `expected` tombe à 12×3 + 12×1 = 48** — et l'écart réel devient **38/48** |
| **armé par** | le plan est en base : rejouable **sans génération** |
| **coût** | **un petit lot** |
| **risque** | ⟳ ⛔ **CE QUE ÇA RÉVÈLE EN PASSANT, ET C'EST PLUS GRAVE QUE LE COMPTEUR : MALO N'A PAS DE CONTENANT PESÉ.** `weighedPortionMembers` rend `{goal ∈ fat_loss, muscle_gain}` = **Malo + Anouk**. Anouk a le sien ; **Malo est dans le bac commun avec Camille et Yanis.** C'est-à-dire : **la bouche en perte de poids reçoit le même bac que ceux qui n'ont aucun objectif.** ⛔ **C'est le seuil que `L6′` croit tenir** |


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

## ⟳ L-anchor-nodelivery — 17 journées-bouche sur 24 ne livrent AUCUNE énergie lisible *(fiche NEUVE)*

| | |
|---|---|
| **quoi** | Comprendre pourquoi `mouthDayEnergy` rend `kcal <= 0` pour **71 %** des couples bouche-jour. |
| **pourquoi** | ⛔ **C'est le VRAI plafond de l'ancrage, et la `direction` de `V0-D` visait à côté.** Elle annonçait `day_incomplete` *« sur la plupart des jours »* ; mesuré : **`day_incomplete = 0`, `no_delivery = 17`**. Or `no_delivery` est la branche **la plus haute** (`mouth_anchor.ts:604` — `day === null \|\| day.kcal === null \|\| day.kcal <= 0`) : **la journée n'existe pas du tout pour cette bouche**, ce qui n'est **pas** la même chose qu'une journée trouée. ⚠️ ⛔ **Tant qu'il vaut 17/24, `L11★`, `L38` et `L1` mesureront des grammes sur TROIS journées-bouche.**  ⟳ ⚠️ **Nuance de vocabulaire, portée par la vérification** : `no_delivery` se déclenche sur `day === null || day.kcal === null || day.kcal <= 0` — c'est **« aucune énergie LISIBLE »**, ce qui n'est pas tout à fait **« la journée n'existe pas »**. La conclusion — *la `direction` de `V0-D` se trompait de motif* — **reste juste** |
| **dépend de** | `V0-D` · ⚠️ **`L-1` et `L17`** *(vague 2)* — c'est la pesée qui gouverne |
| **bloque** | la **portée** de `L11★`, `L38`, `L1` |
| **fichiers** | `_shared/keel/mouth_anchor.ts:604` · `_shared/keel/mouth_energy.ts` |
| **migration** | non |
| **mesure AVANT** | ⟳ **`{anchored:1, clamped:6, no_delivery:17, day_incomplete:0}` — 24 couples**, plan `3c781a71` ; compteur #4 : plats calculables **38,9 %** |
| **direction** | ⬇️ `no_delivery`. ⚠️ **Ce n'est PAS un lot de grammes** : il ne déplace aucune portion, il **rend calculables** des journées qui ne le sont pas |
| **mesure APRÈS** | `no_delivery` **< 25 %** des couples sur un plan neuf, **et la répartition des trois autres motifs rendue à côté** — sans elle, on ne saurait pas si le gain est réel ou déplacé |
| **armé par** | le plan `3c781a71` est le point de départ, **en base** |
| **coût** | **un lot** |
| **risque** | ⚠️ **Un couple bouche-jour peut légitimement ne rien livrer** — Yanis est absent le mercredi midi **et** soir. **La cible n'est donc pas 0**, et un lot qui viserait 0 forcerait le moteur à inventer des repas pour quelqu'un qui n'est pas là |


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

### ⟳ L35-a — les trois phrases livrables tout de suite  ✅ **LIVRÉ le 2026-08-22, 3 seuils sur 4** *(commit `008eb192`)*

| | |
|---|---|
| **fichiers** | ⟳ ⛔ **PAS une extension de `plan_rationale.ts` : un MODULE À PART**, `_shared/keel/plan_tradeoffs.ts` *(neuf, commité)*. **La raison n'est pas architecturale** : l'en-tête de `plan_rationale.ts` porte l'invariant fondateur *« chaque phrase est armée par une prémisse »*, **que la quatrième viole par construction**. La poser au milieu de gabarits gouvernés par la règle opposée **garantit qu'un futur lecteur la « répare »**. ⚠️ La table de langue n'est **pas** dupliquée : `joinList`, `renderDays`, `regimeLabel` **exportés** du module frère · ⛔ le **câblage** (`generate-household-meal-v1/index.ts`, l. 5221-5350) est **NON COMMITÉ** — le fichier porte **+1 658/−78** d'autres sessions |
| **langue** | ⟳ ✅ **NON BLOQUÉ** — `plan_rationale.ts` porte son **propre catalogue** `COPY = {fr, en}` (l. 156-418), **zéro clé i18n**. Le front affiche `rationale[]` sous une clé de titre **qui existe déjà**. **Aucune ligne d'`en.ts`/`fr.ts` n'est nécessaire** |
| **mesure AVANT** | ⟳ **exécutée le 2026-08-22 à 03:19 CEST — LE CHIFFRE DU PLAN EST FAUX.** ~~gabarits : calendrier seulement~~ ⇒ **21 gabarits de phrase** : calendrier 9, argent 2, table 4, forme 4, régime 2. ✅ **Ce qui reste vrai : aucun des 21 ne nomme un COMPROMIS** — familles **0/4**. Populations : **92 bouches** · **45** sans fiche · ⚠️ **50 sans aucun poids que le RUNTIME lise** · **8** `away_days` dans 7 foyers, **0 journée pleine** · **181 plans**, `capped: true` = **8** ✓ · **0** portant une des 4 familles |
| **mesure APRÈS** | ⟳ **exécutée le 2026-08-22 à 04:05 CEST — 32 foyers rejoués, 0 génération.** Par famille **armée/population** : `mouth_absent` **7/7** · `mouth_without_body` **18/18** · `simple_cooking_regime` **2/2** · `shares_at_the_plate` **20/20**. **23 foyers sur 32 = 71,9 %**. **Seuils : ✅ < 100 % · ✅ ≥ 30 % sur la fixture (100 %) · ✅ 0 sur un foyer d'une bouche · ⛔ « les trois sur la fixture » MANQUÉ à 2/3** |
| ⛔ **le seuil manqué, et pourquoi** | La famille ③ ne sort pas sur la fixture, **et ce n'est pas le code** : son unique plan porte `cooking.asked = null` — **la requête `V0-D` n'a jamais porté de forme de cuisine** — donc le plafond **ne peut pas** mordre. **Rejoué sur les MÊMES faits avec `capped: true`, la ligne sort.** Le lever pour de vrai demande **une génération, hors budget de ce lot** *(§⑨ n° 35 : le seuil est écrit MANQUÉ, pas réécrit)* |
| ⛔ **la quatrième, et sa preuve** | Phrase **FIXE** : *« Les parts de ce plan sont servies à l'assiette, au plus près, plutôt qu'ajustées bouche par bouche. »* Aucun prénom, aucun nombre, **aucune branche de pluriel** — octet pour octet identique sous verrou et en cas anodin. **Quatre portes**, union calculée **DANS le module** : d1 le verrou de lane · d2 une bouche sans poids · d3 le plafond de forme · d4 le temps. ⟳ **MESURÉ** : la phrase sort sur **20 foyers, dont ZÉRO par le verrou** *(d2 18 · d3 2 · d4 1)*. ⛔ **d3 et d4 sont la moitié qui compte** — les seules qui mordent dans un foyer complet ; **les retirer « parce qu'elles font doublon » DÉSARME la garde**, et c'est écrit en majuscules dans le module |
| **armé par** | ⟳ ⛔ **SIX mutations**, copie **non mutée d'abord (21/21)** : un futur lecteur qui « arme proprement » la 4ᵉ ⇒ **18/3** · compteur cloué à zéro ⇒ **13/8** · famille ② commentée ⇒ **19/2** · plafond de prénoms inatteignable ⇒ **20/1** · prémisse ③ vidée ⇒ **18/3** · prémisse ① vidée ⇒ **18/3**. **Aucun des 4 compteurs n'est structurellement inatteignable** |
| **les deux gardes de `L35`** | ① **falsifiable** : `days: []` **fait taire la ligne** — on ne dit pas « elle manque des repas » sans pouvoir dire quand ② ⛔ **aucun nombre qui vise une personne** : les jours **se nomment**, ils ne se comptent pas, et **un test vérifie `!/\d/` sur TOUTE la sortie, dans les deux langues** |
| ⟳ **ce que le lot a RÉVÉLÉ** | ⛔ **① LA GRANULARITÉ D'`away_days` A RENVERSÉ LA FAMILLE ①.** Armée sur la journée pleine, elle **ne mord sur AUCUN foyer** : les 8 absences du corpus sont des **midis**, jamais une journée. **Une famille qui ne mord jamais est indiscernable d'une famille débranchée** — mesuré, puis corrigé en « il manque au moins un repas ce jour-là ». ⛔ **② Le « 45 sur 88 » du plan SOUS-COMPTE : c'est 50 sur 92.** `loadHouseholdMemberBodies` **SAUTE la fiche d'une bouche qui a un compte** — **Camille, maître de la fixture, a une fiche, zéro pesée, et aucun fait corporel**. Le plan comptait renseignées des bouches que le runtime lit vides. ⚠️ **③ `householdLaneMode` n'avait AUCUN lecteur visible — ce lot est le premier**, via `resolution.mode` : le point n° 8 du §⑤ *(« le verrou de lane, journalisé nulle part »)* est **à moitié fermé**. ⚠️ **④ La couverture anodine de la 4ᵉ est MINCE : 2 foyers sur 11 complets** ⇒ fiche `L35-a-ter` |


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
