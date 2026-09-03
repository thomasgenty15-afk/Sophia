# Évaluation de la qualité des plans en conditions réelles — 2026-08-23

Branche `ff-001-quotidien-du-coach`, base locale, **10 générations** :
7 solo (`generate-meal-v1`) + 3 foyer (`generate-household-meal-v1`), fenêtre de
**3 jours**, `intent: "draft"` (toutes les gardes amont mordent à l'identique ;
rien n'est écrit, donc aucun `plan_overlaps_existing` entre les runs).

⛔ **Aucun fichier de production n'a été modifié.** Les seules écritures sont des
tables de fixture, journalisées dans `ECRITURES-FIXTURE.log`.

---

## VERDICT — cinq lignes

1. **Les plans sont bons à cuisiner et faux à nourrir.** Ce sont de vraies
   recettes, faisables, achetables, qui respectent les régimes et les allergies.
2. **Mais ils servent systématiquement trop peu.** Sur le cas le plus simple —
   un adulte en entretien, sans aucune contrainte — le plan livre **65 à 72 %**
   de l'énergie que le produit lui-même a calculée, et **64 à 73 %** de la
   protéine.
3. **Le produit le SAIT** : son propre verdict dit `below` / `under` sur **7 plans
   sur 7**, il dépense une relance de modèle pour corriger, et il n'y arrive
   qu'**une fois sur sept**. Puis il livre quand même, sans le dire à personne.
4. **Le défaut le plus grave est là** : un plan sous-calibré de 30 %, livré
   silencieusement, à quelqu'un qui n'a aucun moyen de le voir.
5. **Sur le foyer, c'est pire** : aucune bouche n'a été dimensionnée sur son
   propre corps (`mouths.sized: 0`, 3 runs sur 3), et sur 27 journées-bouche
   mesurées, **3 seulement** portent un chiffre.

---

## Un tableau par plan

### SOLO — le même compte, une donnée de plus à chaque fois
`eval0823.solo@keeltest.dev` · homme, 1990-05-12, 178 cm, 82,0 kg · coach maison.

| # | ce qui change (table.colonne) | ① nutritionniste | ② réaliste | le pire défaut de ce plan |
|---|---|---|---|---|
| **S1** | *socle* — `student_goals.goal='maintenance'`, `profiles.activity_level='sedentary'`, aucune contrainte | cible **2414–2668** ; servi **1743 / 1579** (0,72 / 0,65) ; protéine plancher **131 g**, servi **84 / 96 g**. Verdict produit : `below` / `under`. Résolution 65/65 — **ce chiffre n'est pas un artefact** | courses complètes, conservation J+2 tenue, 7 plats distincts, 2 sessions (55 + 30 min), restes tous consommés | **le plan le plus simple manque déjà 30 % de son énergie et 36 % de sa protéine** |
| **S2** | `+ goal='fat_loss'` | cible **2041–2160** (déficit de ~370 kcal, plafonné) — **direction correcte** ; 2 jours sur 3 incalculables | 1 session dimanche ; **2 œufs pour 1 portion** (220 g pour 2) ; boiled eggs faits ×2, mangés ×1 | `green or brown lentils` et `British berries` **inconnus du référentiel** ⇒ la protéine de 2 repas disparaît en silence |
| **S3** | `+ diet_ref='vegan'` | **régime respecté à 100 %** (0 produit animal sur 38 termes) ; `b12_source` correctement déclaré incouvrable | courses complètes | **`sun` porte DEUX dîners et aucun petit-déjeuner** ; `oat milk` inconnu du référentiel |
| **S4** | `+ allergy peanut (medical)` | **arachide absente** des ingrédients ET des courses ; résolution **106/106** ; servi **1732 / 1805** vs 2041–2160 (0,85 / 0,88) | tout propre ; quinoa fait ×5, utilisé ×3 | **du tofu dans 7 plats sur 7** — la variété affichée (7 noms distincts) masque une source protéique unique |
| **S5** | `+ cook_days=['sun']`, `cooking_time_min=25` | protéine tombe à **56–57 g** pour un plancher de 164 g | **contrainte tenue et DITE** : « You cook on Sunday, and that is what was kept », 1 session de 25 min | la session annonce **25 min** alors que ses deux préparations déclarent **15 + 12 = 27 min de mains** |
| **S6** | `+ budget_amount=15`, `activity_level='trains_hard'` | cible passe à **3005** (un POINT, pas une fourchette : le plafond de déficit de 500 kcal referme la bande) ; servi ~1100 | **budget tenu et DIT** ; 16 lignes de courses, conserves et féculents ; l'ordre de sacrifice est récité | **écart de ~1800 kcal/jour** ; `pepper « 150 g »` non résolu (ambigu : poivre / poivron) |
| **S7** | `+ dislike tofu` — **le cumul dur** | tofu absent, arachide absente, végane tenu ; **5 plats sur 7 aux lentilles** ; protéine **58–67 g** vs 164 | courses complètes, conservation tenue, 1 session de 25 min, budget dit | **le cumul ne s'effondre pas — il était déjà cassé à S1** ; `unsweetened soy yoghurt` inconnu |

⚠️ **Les ratios de S2, S3, S5, S6, S7 sont des PLANCHERS, pas des mesures** : ces
plans portent 1 à 2 termes inconnus du référentiel, donc 1 à 2 plats par jour ne
sont pas comptés. **S1 et S4 sont les deux seules mesures propres** (3 jours
complets, 0 terme inconnu) — et ce sont elles qui portent le verdict.

### FOYER — `eval0823.master@keeltest.dev`, 3 bouches, Marc titulaire

| # | la table | ① nutritionniste | ② réaliste | le pire défaut |
|---|---|---|---|---|
| **F1** | Marc (41 a, 79 kg, entretien) · Lea (35 a, 68 kg, `fat_loss`, **végane**, sans compte) · Theo (37 a, 84 kg, `muscle_gain`, sans compte) | cibles **2485–2747 / 2114–2336 / 4015–4437** ; **Marc et Lea partagent UN contenant** ⇒ `gaps: common_pot`, aucune énergie calculable pour 6 journées-bouche sur 9 ; Theo (seul avec un bac dédié) reçoit **506 / 1153 / 1625 kcal** contre 4015 | **le plat commun est végane pour toute la table** (« that is what Lea eats »), Theo a son poulet à part ; **7 contenants refusés** sur 21 attendus (`names_refused: 7`) ; le lot d'œufs ne suffit pas (« 418 g demandés, 279 g produits ») | **Theo reçoit un tiers de son besoin, et deux bouches sur trois n'ont aucun chiffre du tout** |
| **F2** | Theo retiré ; **Anna, 13 ans, sans compte** ; **absence déclarée de Lea** (lun midi, mar soir) | Anna : enveloppe pédiatrique **2109–2331**, plancher 49 g — **mais elle est mise dans le MÊME bac que Marc** (`box_*_marc_anna`, 620 à 1080 g) ⇒ son énergie est **incalculable**. Lea, seule bouche à bac propre : **628 / 404 kcal** vs 2114–2336 | **l'absence est parfaitement honorée** : aucun contenant pour Lea aux deux créneaux, `mouths_unboxed: 2`, et la phrase le dit — *« Lea misses meals on Monday and Tuesday »*. ⛔ **Le défaut `D3′-d` ne se reproduit pas.** | **la mineure de 13 ans et l'adulte de 79 kg partagent un bac indifférencié** — la question « le mineur est-il en déficit ? » est *inrépondable par le produit* |
| **F3** | `+ arachide (médicale) sur Anna, bouche SANS COMPTE` · `+ cook_days=['sun']`, 25 min | **arachide absente** partout ; végane tenu ; **0 journée-bouche sur 9 ne porte de chiffre** (les lentilles, seule protéine, sont inconnues du référentiel) | l'arbitrage est **dit à voix haute** : *« With 25 min of cooking a week, everyone eats the same dish — that is what the time allows »* ; four absent des équipements, aucune recette au four | ⛔ **deux repas sur sept ne produisent AUCUN contenant** (`mon/breakfast`, `tue/breakfast`) : le plat existe, sa méthode dit « three bowls », et personne ne reçoit rien |

---

## Ce qui se dégrade avec la complexité — le cœur de l'exercice

**La réponse n'est pas celle qu'on attendait : rien ne casse au cumul. Tout était
déjà cassé au socle.**

- **L'énergie et la protéine sont fausses dès S1**, sans une seule contrainte, sur
  une mesure sans trou. Elles ne se dégradent pas ensuite : elles restent fausses.
- **Ce qui se dégrade vraiment avec la complexité, c'est la MESURABILITÉ.**
  Jours complets sur 3 : `S1 3/3 · S2 1/3 · S3 0/3 · S4 3/3 · S5 1/3 · S6 1/3 ·
  S7 1/3`. Plus le profil se contraint, plus le plan pioche dans des aliments que
  le référentiel ne connaît pas (`oat milk`, `green or brown lentils`,
  `unsweetened soy yoghurt`, `ready-to-eat smoked tofu`) — et le produit perd la
  capacité de dire ce qu'il sert.
- **Le cumul dur `S7` TIENT structurellement** : végane + arachide + tofu détesté
  + un seul jour de cuisson de 25 min + 15 de budget → un plan cohérent, achetable,
  conservable, dont chaque contrainte est respectée **et énoncée**. Il ne
  s'effondre pas. Il nourrit simplement à ~35 % de la cible, comme les six autres.
- **`F3` TIENT aussi** — sauf sur la livraison : deux repas sans contenant.
- **La seule chose qui casse vraiment au cumul est le foyer**, et elle casse dès
  `F1` : dès qu'il y a un pot commun, plus personne n'a de chiffre.

---

## Ce qui marche bien — précisément

1. **Le respect des interdits est sans faute sur 10 plans.** Végane : 0 produit
   animal. Arachide : absente des ingrédients *et* des courses (vérifié terme par
   terme, pas sur les titres). Tofu détesté : absent. La ceinture de régime
   compte ses morsures (`regime_belt`) et n'en a laissé passer aucune.
2. **Les contraintes pratiques sont respectées ET énoncées.** Un jour de cuisson,
   25 minutes, le budget, l'équipement manquant : chacune produit une ligne de
   `rationale` que la personne peut lire. Le foyer va jusqu'à dire le compromis
   qu'il fait à cause du temps.
3. **L'absence déclarée fonctionne** (`F2`, `F3`) : pas de contenant fantôme pour
   une bouche partie. La fiche `D3′-d` ne se reproduit pas ici.
4. **La liste de courses est quasi complète** : sur 10 plans, les seuls manquants
   sont l'eau, le sel et **un** persil. Rien de substantiel n'est oublié.
5. **La conservation « jour de cuisson + 2 » est tenue sur 10 plans sur 10.**
   Zéro violation, y compris quand tout est cuit le dimanche pour trois jours.
6. **Les restes sont presque toujours consommés** (3 écarts sur 10 plans).
7. **Un mineur ne peut pas porter d'objectif** : `goal_not_for_minor` refuse à la
   création, et refuse aussi le contournement dans le temps (poser l'objectif
   d'abord, la date ensuite).

---

## Les défauts, classés par gravité

### ① Le plan est sous-calibré de 30 % et personne ne le sait — **critique**
`S1`, mesure propre : cible **2414–2668 kcal**, servi **1743** (lundi) et **1579**
(mardi). Protéine : plancher **131 g**, servi **84** et **96 g**. Le verdict interne
dit `below` / `under`, la boucle de correction lève `raise_protein_component` +
`raise_energy`, paie une relance de modèle de 38 s — et la relance est **rejetée**
(`retried: false`). Le plan part quand même. **Rien dans la réponse rendue à
l'écran ne porte cette information** : ni `issues`, ni `rationale`, ni
`request_report`.
Sur 7 plans solo : correction levée **7/7**, relance adoptée **1/7**.
*Le plat qui le montre* : `mon/dinner — Smoky chickpea couscous`, 60 g de couscous
et une portion de ragoût de pois chiches, dans une journée à 1743 kcal pour un
homme de 82 kg.

### ② Deux repas sans aucun contenant — **critique**
`F3` : `mon/breakfast — Silken Berry Oat Pots` et `tue/breakfast — Tofu Tomato
Toast` ont `boxes: []`. La méthode dit *« Spoon the silken tofu into three
bowls »* ; le compteur dit `meals: 5` pour 7 plats, `mouths_unboxed: 2`. Trois
personnes ont un petit-déjeuner écrit et rien à se partager.

### ③ Aucune bouche de foyer n'est dimensionnée sur son corps — **majeur**
`box_sizing.mouths.sized = 0` sur **les 3 runs**. Les causes nommées par le
produit : `common_pot_day: 6` (sur 9 journées-bouche), `minor: 1`,
`no_direction: 1`, `sized_default_pace: 1–2`. `member_deltas` est **vide** sur les
trois plans. Le produit le dit d'ailleurs lui-même : *« The shares in this plan
are served at the plate, as close as they can be, rather than adjusted mouth by
mouth. »*
*Le contenant qui le montre* : `F2 / box_mon_lunch_marc_anna`, **960 g** pour un
homme de 41 ans et une fille de 13 ans, sans partage.

### ④ Le référentiel perd la protéine des plans contraints — **majeur**
Termes inconnus rencontrés : `green or brown lentils` (S2, F3 — **la seule source
de protéine des deux plans**), `british berries`, `oat milk`, `wholemeal tortilla
wraps` (alors que `wholemeal tortilla` au singulier résout), `ready-to-eat smoked
tofu`, `unsweetened soy yoghurt`, `pepper`. Conséquence mesurée : `F3` ne porte
**aucun** chiffre d'énergie, pour aucune bouche, aucun jour.
La quantité est pourtant écrite en clair (`« 900 g dried green or brown
lentils »`) : la lecture en prose (`quantity_from_prose`) n'attrape pas une
quantité suivie de mots.

### ⑤ Le produit sait que les courses n'arrivent pas à temps, et ne le dit pas — **majeur**
Sur **10 plans sur 10**, le serveur a rendu
`suggested_window: {starts_on: <demain>, shifted: "shopping_cutoff"}` — il est
21 h, on ne fera pas les courses ce soir. Ce champ est parsé par
`frontend/src/keel/api/planDraft.ts:249` (`suggestedStartsOn`) et **aucun écran
ne le lit** (seuls deux tests le référencent). Le plan démarre donc aujourd'hui,
avec un dîner du soir qui tire sur une session de cuisson de 25 à 60 minutes et
28 lignes de courses non faites.
Par ailleurs, **la liste de courses ne porte aucun jour ni aucune date** (aucun
plan sur 10), et **aucun texte du plan ne mentionne les courses**. La question
« les courses arrivent-elles avant le premier repas ? » n'a donc pas de réponse
dans le produit : *le plan ne place jamais les courses dans le temps*.

### ⑥ Une bouche sans âge peut porter un objectif — **moyen**
`goal_not_for_minor` refuse aux trois portes. Mais l'ordre « ajouter sans date →
poser l'objectif → poser la date » laisse la bouche dans l'état intermédiaire :
`age_state: unknown`, `goal: fat_loss`, aucune date. Le refus est au bon endroit,
l'état résiduel ne l'est pas.

### ⑦ Une issue de foyer se déclenche sur un plan solo — **moyen**
Sur **7 plans solo sur 7** : `« sun/dinner: the table's dish feeds nobody — every
mouth has a dish of its own »`, jusqu'à 7 fois par plan, pour une personne qui vit
seule. Bruit qui rend la liste d'issues illisible là où elle porte de vraies
alertes (`F3`).

### ⑧ Deux journées se composent dans le même créneau — **moyen**
`S3` : `sun` porte **deux dîners** (`Silken Tofu Berry Smoothie` et `Roasted Tofu
Quinoa Bowl`) et aucun autre repas. Le premier est un smoothie servi comme dîner.

### ⑨ Petites incohérences internes — **mineur**
- `S5` : session déclarée **25 min**, ses deux préparations déclarent **15 + 12**
  minutes de mains.
- `S2` : `Boiled eggs` fait 2 portions, 1 seule est consommée ; 220 g d'œufs
  (≈ 4 œufs) pour 2 portions.
- `S4` : quinoa fait ×5, utilisé ×3.
- **La variété est comptée sur les NOMS.** `S4` affiche « 7 plats distincts » avec
  du tofu dans les 7 ; `S7`, des lentilles dans 5 sur 7.
- `cost_usd = 0` sur les 18 appels du modèle principal (`cost_unpriced = true`,
  `pricing_version` nulle pour `gpt-5.6-luna`) : le coût de génération n'est pas
  chiffré.

---

## Ce que je n'ai PAS pu vérifier, et pourquoi

1. **Le budget n'est pas prouvable, et le produit ne peut pas le prouver.**
   Le plafond porte sur la liste de courses ; il n'existe aucun prix dans le
   produit. Ce que j'ai mesuré : le plafond est **cité** dans la `rationale`
   (`S6`, `S7`) et le panier **change de nature** (16 lignes au lieu de 28,
   conserves, plus de fruits rouges). Je ne conclus pas au-delà.
2. **L'énergie réellement servie sur 7 plans sur 10.** Dès qu'un terme est inconnu
   du référentiel, le plat ne porte pas de chiffre : les nombres de S2, S3, S5,
   S6, S7 et de tout le foyer sont des **planchers**. Seuls `S1` et `S4` sont des
   mesures.
3. **Le déficit d'un mineur.** `Anna` est dans un bac commun sur `F2` et `F3` :
   le produit lui-même s'abstient (`gaps: common_pot`). La question ne peut être
   tranchée ni par lui, ni par moi.
4. **Le français.** Toute l'évaluation est en `en-GB`. Le référentiel est plus
   pauvre en français (écart de 17,3 points déjà mesuré dans ce dépôt) : **les
   chiffres ci-dessus sont le meilleur cas du produit, pas le cas moyen.**
5. **Le plan adopté.** Tout est en `intent: "draft"`. Les gardes amont sont
   identiques et la charge rendue est la même, mais je n'ai pas vérifié l'écriture
   (`member_portions` en base, `generated_from`).
6. **La reproductibilité.** Une génération par cas. Un plan est un tirage ; les
   écarts entre cas voisins mélangent l'effet du profil et la variance du modèle.
   Ce qui est robuste, c'est **le signe**, constant sur 7 plans sur 7.
7. **La stabilité du code sous la mesure.** Une autre session éditait
   `supabase/functions/**` pendant le run — le watcher de `functions serve` a
   recréé le conteneur trois fois (voir plus bas). Les fichiers touchés sont
   **tous des `*_test.ts`** plus un fichier non suivi `_ffa1_harness_probe.ts`
   sans aucun importeur : le code exécuté n'a pas changé, mais je ne peux pas
   l'affirmer à la milliseconde.

---

## Le compte exact des générations

**10 plans gardés** — S1…S7, F1…F3. Aucun run n'a été relancé pour obtenir un
plan plus flatteur ; les plans mauvais sont ceux du rapport.

| appelant | appels | prompt | sortie |
|---|---|---|---|
| `generate-meal-v1` | **8** | 53 356 | 48 174 |
| `generate-meal-v1.composition_retry` | 7 | 47 580 | 50 842 |
| `generate-meal-v1.composition_fill` | 5 | 2 080 | 406 |
| `generate-household-meal-v1` | **3** | 28 188 | 30 713 |
| `generate-household-meal-v1.composition_fill` | 3 | 1 314 | 456 |
| **total** | **26** | 132 518 | 130 591 |

`llm_usage_events` : **10 279 → 10 305, delta = 26**, tous en `success`.

**Le 8ᵉ appel de `generate-meal-v1` est le run S2 tué en vol par un 502** — le
conteneur `supabase_edge_runtime` a été recréé sous la requête parce qu'une autre
session éditait `supabase/functions/**`. Panne d'infrastructure : réparée
(relance) et **non comptée comme un plan**. Deux autres 502 (à 6 s et 20 s) n'ont
coûté aucun appel de modèle. Sorties brutes conservées sous
`INFRA-502-S2-*.json`.

**Une génération de plan solo = 2 à 3 appels de modèle** : la composition, puis
la relance de correction (7 fois sur 8), puis parfois le sas de réparation du
référentiel. La lane foyer **n'a pas de boucle de correction du tout** — 3 appels
principaux, 0 relance —, ce que le dépôt documente lui-même
(`generate-household-meal-v1/index.ts:4862`).

---

## Les écritures de fixture

Comptes créés (mot de passe `1234567`, connexion prouvée par
`grant_type=password` avant chaque run) :
- `eval0823.solo@keeltest.dev` — `auth.users`, `profiles`, `student_body_measures`,
  `student_goals`, `student_safety_constraints`, `coach_clients`
- `eval0823.master@keeltest.dev` + foyer *Rousseau (éval 2026-08-23)* —
  idem, plus `households`, `household_members`, `household_member_bodies`,
  `household_member_allergies` via les **mêmes RPC que `SetupPage.tsx`**

Chaque mutation est horodatée dans `ECRITURES-FIXTURE.log`.
**Aucune fixture existante (`qa*`, `fixture.v0c.*`) n'a été touchée.**
**Aucune écriture dans `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`** — il est
modifié par une autre session, je l'ai laissé intact.

## Les outils de mesure

`analyse.ts` / `analyse-foyer.ts` importent `plan_energy.ts`, `meal_verdict.ts`,
`meal_envelope.ts`, `energy_target.ts`, `mouth_energy.ts`, `food_composition*.ts`
**depuis la production** — jamais de copie. `faisabilite.py` est en revanche **à
moi** (courses, conservation, restes, quantités) : un écart entre lui et le
produit est un écart de ma lecture.

---

# ⚠️ ADDENDUM DU 2026-08-24 — trois corrections à ce rapport

Écrites après avoir lu le code de près pour corriger les défauts. **Chacune
change une conclusion ci-dessus**, elles ne sont donc pas des nuances.

**① Les termes « sans quantité » n'étaient pas un défaut de lecture de prose.**
Le §④ accuse `quantity_from_prose`. C'est faux pour ces sept lignes: elles
portent `amount: 900, unit: "g", quantity_source: "structured"`. `grams_raw` est
`null` parce que **`resolveIngredient` rend `null`** — pas de `ref`, pas de
grammes. La cause est le RÉSOLVEUR. *(Corrigé: 19 journées solo calculables sur
21 contre 10 avant, après sept alias vérifiés, deux lignes de référentiel
créées et une règle sur les alternatives.)*

**② « Deux repas sans contenant » n'est pas un défaut de livraison.**
Un plat cuisiné le jour même n'a pas de bac — c'est le contrat, écrit dans le
prompt. Le vrai défaut est que le compteur EXCLUT ces cases du dénominateur:
`mouths_unboxed: 2` là où six parts manquent, et `delivery: "served"`. Le défaut
descend de **critique à majeur**, et c'est un lot de mesure, pas de génération.
*(Corrigé: `cells_no_box` / `mouths_no_box_cell` nomment la population exclue.)*

**③ Le bac commun Marc + Anna n'est PAS le scandale décrit au §③.**
« Cacher une fille de 13 ans dans la ration d'un homme de 79 kg » compare des
MASSES CORPORELLES (×1,61). Leurs BESOINS sont à **×1,18** (2 485–2 747 contre
2 109–2 331): le bac partagé en deux donne 50/50 là où le besoin dit 54/46 —
quatre points. **Aucune restructuration des bacs n'est justifiée par cette
mesure**, et la recommandation d'élargir « qui mérite son bac » est retirée. Ce
qui reste vrai, et qui est le vrai défaut: **personne ne peut le savoir**, parce
que `common_pot` refuse de chiffrer — l'invisibilité, pas la portion.

## Ce que la mesure a appris en plus

**Un plan est un tirage, et une génération n'est pas une mesure.** La MÊME
fixture `S1` a rendu 0,65–0,72 de sa bande le 2026-08-23 et `within` le
2026-08-24, sans qu'une ligne de composition ait changé. Tout écart lu sur une
seule génération mélange l'effet du profil et la variance du modèle. Les seuls
comparatifs fiables sont les rejeux AVANT/APRÈS sur les mêmes lignes dans la
même passe (`rejeu-ancrage.ts`).
