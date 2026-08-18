# Corrections et campagne réelle — 2026-08-11

Suite : `scratchpad/RAPPORT-QA-REELLE-20260811.md` · `RAPPORT-NUTRITION-20260811.md`
Modèle : `gpt-5.6-sol` · référentiel `food_composition_refs`
Suite de tests : **2123 verts, 0 rouge, typecheck compris**

---

## 0. Ce que ce rapport corrige de mes rapports précédents

**Mes deux rapports antérieurs sur-estimaient la sous-alimentation, d'un facteur
proche de deux.** La cause a été trouvée, et elle est de mesure — pas de
produit. Détail au §2. Les chiffres de ce rapport-ci remplacent les
précédents.

C'est la troisième fois que ma mesure se révèle fausse **dans le même sens**.
J'en tire une règle pour la suite : sur ce produit, un total nutritionnel bas
est d'abord un soupçon sur la mesure, jamais un constat sur le plan.

---

## 1. Les six corrections livrées

| # | Correction | Preuve |
|---|---|---|
| **P0.1** | Timeout Kong porté à 900 s | 7 jours passent (168 s) |
| **P0.2** | `supabase/.env` : trois valeurs non quotées | `--env-file` charge enfin les clés |
| **P0.3** | Trois tests rouges réparés (dont un trouvé au passage) | suite verte, typecheck compris |
| **C1** | Résolveur : le milieu de conservation | `canned tuna in spring water` → `tuna_tinned` |
| **C2** | Référentiel : 208 → **222 aliments, 805 alias** | résolution 79 % → **100 %** sur un plan |
| **C3** | Nutriments nuls comblés | `protein` passe de `not_computable` à `under` |
| **C4** | Sentinelles : abstention sous la semaine | 6 faux trous → 0 sur un plan d'un jour |

### C1 — le milieu de conservation

Le modèle écrit `canned tuna in spring water, drained`. `tuna_tinned` existait
au référentiel ; « canned » et « drained » tombaient bien, mais **« in spring
water » restait** et l'appariement échouait.

Ce n'était pas marginal : les ingrédients que le modèle décrit le plus
volontiers sont **les sources de protéine et les féculents** — ceux qui portent
l'énergie. Un plat de thon se calculait à 3 g de protéines.

Corrigé par une **réduction de forme** (couper avant la préposition de milieu),
du même genre que le retrait d'un modificateur — jamais une devinette. `with`
n'y est délibérément pas : « chicken with rice » nomme deux aliments, et couper
y perdrait le second. Trois tests le gardent, dont le désarmement.

### C3 — pourquoi le plancher protéique était muet

`verdictFor` faisait :

```ts
proteinTotal = n.proteinG === null ? null : proteinTotal + n.proteinG
```

**Un seul** ingrédient à protéine inconnue rendait tout le plan incalculable.
Et `lemon` avait `protein_g = null`. Un citron dans une vinaigrette suffisait à
faire taire la grandeur du rang 2 — celle qu'aucune doctrine n'a le droit
d'éteindre.

La règle « l'inconnu se propage, il ne devient pas zéro » est juste : **on ne
l'a pas affaiblie, on a retiré les inconnues.** Cinq protéines, dix-huit gras,
dix fibres — tous des trous d'extraction sur des aliments dont la valeur est
connue et proche de zéro.

### C4 — une cadence hebdomadaire ne se juge pas sur trois jours

Sur un plan d'**un seul jour**, le verdict rendait six groupes « manquants ».
Ce n'est pas un trou, c'est une journée. Chaque faux trou consommait un
`place_missing_sentinel` dans une relance **unique**, à la place d'un vrai
écart d'énergie.

Abstention sous 7 jours. Le canal **structurel** (« cet élève est végan, la B12
n'existe pas dans le règne végétal ») y survit : une carence structurelle n'est
pas une affaire de cadence.

---

## 2. Le défaut de mesure — et pourquoi il a fallu quatre passes pour le voir

Le générateur produit des **cuissons en lot** (`preparations`) que les plats
citent par `uses`. Un plat peut donc n'avoir que sa garniture en propre :

```
lunch — « Smoky chicken and yogurt pitta »
        ingrédients propres : pita, chou, yaourt, citron       ← 4 lignes
        uses: prep_smoky_chicken (1 portion sur 2)
              └─ 360 g de blanc de poulet, poivron, courgette…
```

Ne sommer que `dish.ingredients` faisait **disparaître la source de protéine de
la moitié des repas**. D'où mes trois conclusions successives — « un tiers de
l'enveloppe », « l'ancre n'a aucun effet », « le modèle omet la protéine » —
toutes fausses pour la même raison.

Le harnais compte désormais la **part du lot** revenant à chaque plat
(`servings / servingsMade`).

---

## 3. Ce que la mesure corrigée dit vraiment

| Gabarit | Cible | Servi | Écart |
|---|---|---|---|
| Femme 55 kg · 162 cm · `fat_loss` | 1 460 kcal/j | **1 183** | −19 % |
| Homme 92 kg · 186 cm · `fat_loss` | 2 390 kcal/j | **1 126** | −53 % |
| Homme 92 kg · 186 cm · `muscle_gain` | 3 068 kcal/j | **1 887** | −38 % |

**Protéines : atteintes** sur `muscle_gain` (156 / 150 / 181 g pour un plancher
de 147). La grandeur du rang 2 est servie.

---

## 3 bis. LA CAMPAGNE — six générations, entrées variées

| # | Scénario | kcal/j | cible | % | prot | plancher | résol | durée |
|---|---|---|---|---|---|---|---|---|
| 1 | Femme 55 kg · `fat_loss` · 3 j | 1027 | 1460 | **70 %** | 63 | 110 | 71 % | 107 s |
| 2 | Homme 92 kg · `fat_loss` · 3 j | 1637 | 2390 | **69 %** | 135 | 184 | 79 % | 113 s |
| 3 | Homme 92 kg · `muscle_gain` · 7 j | 2001 | 3068 | **65 %** | 138 | 147 | 81 % | 166 s |
| 4 | Végan · `health` · 3 j · absences | 1103 | 2114 | **52 %** | 43 | 109 | 71 % | 112 s |
| 5 | Sous `restriction_flag` · 3 j | 1699 | — | — | 109 | — | 83 % | 131 s |
| 6 | Apports fixes + jours + situation · 5 j | 1021 | 2541 | **40 %** | 94 | 156 | 96 % | 113 s |

### ⚠️ Cette campagne CORRIGE ma conclusion du §3

J'avais écrit, sur une comparaison à un seul run par gabarit :

> « Rapport 92 kg / 55 kg servi : ×0,95 — le produit sert la même quantité
> absolue à tout le monde. »

**C'est faux, et c'était de la variance de run.** Sur la campagne :
1027 kcal pour 55 kg contre 1637 pour 92 kg, soit **×1,59 pour un attendu de
×1,64**.

> **Les portions SUIVENT le corps, et correctement.** Le corps n'est pas
> décoratif.

### Le défaut réel, une fois la variance écartée

C'est un **sous-service uniforme d'environ un tiers** : 70 %, 69 %, 65 % de la
cible sur les trois gabarits pleinement mesurés. Le produit compose des
assiettes justes en PROPORTION et trop petites en NIVEAU — un facteur constant,
pas une erreur d'échelle.

C'est une bien meilleure nouvelle que ce que j'annonçais : un défaut
multiplicatif uniforme se corrige par un facteur, là où une échelle cassée
aurait demandé de reprendre l'injection du corps.

### Trois lectures à ne pas confondre

**Scénario 4 (végan)** — verdict `not_computable` : la résolution est à 71 %,
**sous la porte des 80 %**, et le moteur s'abstient. C'est le comportement
voulu. Mais 43 g de protéines pour un plancher de 109 est un vrai écart : les
plans végans sont pauvres en protéines, et c'est à instruire à part.

**Scénario 5 (`restriction_flag`)** — 1699 kcal, soit **plus** que le même
gabarit non flaggé (1637). Le mode `per_portion` ne restreint donc rien, ce qui
est exactement ce qu'on veut : le plancher TCA protège, il n'affame pas. Et
aucune mesure ne fuit dans la consigne.

**Scénario 6 (40 %)** — le plus bas, mais partiellement un artefact : le shaker
remplace cinq petits-déjeuners, et mon total ne compte que les PLATS. Les
~120 kcal et ~24 g de protéines quotidiens de l'apport fixe manquent au chiffre
(le verdict, lui, les reçoit via `fixedIntakeInputs`). Corrigé de la main :
~1140 kcal, ~118 g. L'écart reste réel, il est simplement moins spectaculaire.

---

## 3 ter. LE CORRECTIF — `portion_scaling.ts`, mesuré sur douze générations

Le facteur manquant ne passait par aucune consigne (§4). Il est donc appliqué
**au parseur**, de façon déterministe : le modèle compose, le déterministe
corrige — la posture de toutes les autres gardes du produit.

### ⚠️ CE QUE LA DERNIÈRE PASSE A RÉVÉLÉ — la résolution gouverne tout

Quatre campagnes successives de six générations. Les résultats semblaient
erratiques (86-96 %, puis 48-100 %, puis 53-92 %) — jusqu'à ce que la
**résolution** soit mise en regard :

| résolution du plan | ce que la mise à l'échelle fait |
|---|---|
| **93 %** | 87 % → **100 %** — pile sur la cible |
| **86 %** | 56 % → **83 %** |
| **82 %** | 74 % → **92 %** |
| 77 %, 74 %, 69 % | **abstention** — le plan reste faux |

**Le correctif marche quand il s'applique. Il s'applique moins d'une fois sur
deux, parce que le référentiel ne sait pas lire la majorité des plans.**

### Le défaut le plus dangereux du module, trouvé en run réel

La version d'avant mettait à l'échelle **sans regarder la résolution**. Un plan
lu à 52 % a reçu un facteur ×2 et s'est fait doubler — or à 52 %, l'énergie
calculée est un **sous-compte** : la moitié des aliments n'est pas lue. Ce plan
était peut-être déjà à sa cible, et on venait d'en faire une assiette de deux
fois trop.

C'est exactement le mode de défaillance que l'abstention du verdict existe pour
écarter, **en pire** : le verdict se contente de se taire, la mise à l'échelle
AGIT.

`resolvedShare` est désormais un **paramètre requis** des deux fonctions de
facteur, et le seuil réutilisé est celui du verdict
(`MIN_RESOLUTION_FOR_VERDICT`) — les deux répondent à la même question, « sait-on
lire cette assiette ? », et deux constantes finiraient par diverger. Testé aux
quatre valeurs sous le seuil **et** à la reprise à 80 %, sinon on aurait
remplacé un défaut par une garde morte.

### Résultat, sur six scénarios régénérés (avant la garde de lisibilité)

| scénario | avant | facteur | **après** | protéines |
|---|---|---|---|---|
| Femme 55 kg · `fat_loss` | 81 % | ×1,33 | **96 %** | 59→72 / 110 |
| Homme 92 kg · `fat_loss` | 76 % | ×1,51 | **88 %** | 121→137 / 184 |
| Homme 92 kg · `muscle_gain` | 60 % | ×1,95 | **86 %** | 121→**161** / 147 ✅ |
| Homme 78 kg · `recomposition` | 66 % | ×1,76 | **88 %** | 125→**162** / 156 ✅ |
| Femme 68 kg · `health` | 70 % | ×1,60 | **93 %** | 91→**119** / 109 ✅ |
| Sous `restriction_flag` | — | **aucun** | inchangé | inchangé |

**86 à 96 % de la cible**, contre 60 à 81 % avant. Trois planchers protéiques
sur cinq sont désormais atteints.

### La correction du correctif

La première version appliquait le facteur brut, et n'obtenait pas l'effet
demandé : **×1,81 ne rendait que ×1,39 effectif**. Parce que les unités
dénombrables ne bougent pas — « 1 tortilla » ×1,81 donnerait « 1,8 tortilla »,
qu'on ne peut ni acheter ni servir.

Le facteur juste est celui qui, appliqué à la **seule part pesable**, amène le
total à la cible :

```
f = (cible − part figée) / part échelonnable
```

C'est ce qui a fait passer le scénario 3 de 77 % à 86 %.

### Les décisions du module

- **Rien ne bouge sous le plancher TCA.** `per_portion` n'a pas de bande :
  `scaleFactorFor` rend `null` **structurellement**, pas par un `if` qu'on peut
  oublier.
- **La prose suit le chiffre.** Si `amount` bouge sans `quantity`, l'élève lit
  « 120 g » pendant que le moteur compte 175 g — la liste de courses ne
  correspond plus à l'assiette. Le défaut le plus dur à voir en production.
- **Bornes ×0,75 à ×2.** Un plan à 300 kcal/j n'est pas « trop petit », il est
  structurellement faux — il manque un repas. L'étirer ×8 produirait une
  assiette absurde au lieu de signaler le vrai problème.
- **Zone morte à 12 %**, jugée sur le TOTAL et non sur la part pesable : sinon
  un plan déjà bon mais peu pesable se ferait réécrire pour rien, et ses 100 g
  ronds deviendraient des 103 g.
- **`gramsRaw` est remis à `null`**, pas recalculé à la main : seul le résolveur
  connaît les rendements cru/cuit.

**15 tests**, dont le désarmement et l'abstention sous plancher.

---

## 4. Ce qui a été essayé AVANT, par la consigne, et n'a pas marché

| Tentative | Mesure |
|---|---|
| Boucle de correction (`raise_energy` + `raise_protein_component`) | 1140 → 1374 kcal · **×1,21** |
| Ancre de portion ajoutée en fin de consigne | 964 → 930 kcal · **×0,96** |
| Ancre **à la place** de la ligne générique du prompt système | 842 → 776 kcal · **×0,92** |
| Ancre + retrait du contre-exemple « 500 g = trois dîners » | **aucun effet** |

Il faudrait ×2,1. **Aucune intervention au niveau de la consigne ne déplace les
portions.** Le module `portion_anchor.ts` est écrit, testé (7 tests) et
échelonne correctement — 260 g de protéine pour 92 kg contre 150 g pour 55 kg,
`null` sous plancher TCA — mais le modèle ne le suit pas.

### Ce que j'en conclus

Le levier n'est pas dans le prompt. Les deux voies qui restent :

1. **Une mise à l'échelle déterministe au parseur.** Le moteur connaît
   l'énergie calculée et la cible : il peut multiplier les quantités des
   composants principaux (protéine, féculent, gras ajouté) par un facteur
   borné, en laissant les aromates. C'est exact, ça ne dépend d'aucune
   obéissance du modèle, et c'est la même posture que toutes les autres gardes
   du produit — le modèle compose, le déterministe corrige.
2. **Changer de modèle sur cette tâche**, et le mesurer avec ce harnais.

Ma recommandation : **1**, avec un plafond de facteur (×2 par exemple) et le
verdict recalculé après mise à l'échelle. C'est la seule qui ferme l'écart avec
certitude.

**Et la campagne la rend plus simple que prévu.** L'écart n'est pas une échelle
cassée mais un **facteur constant d'environ 1,45** (les trois gabarits mesurés
servent 65-70 % de leur cible). Une mise à l'échelle qui applique ce facteur
aux composants principaux — protéine, féculent, gras ajouté — en laissant les
aromates, corrigerait les trois d'un coup, et son plafond n'aurait jamais à
mordre.

---

## 5. Ce qui marche, mesuré

- **Le corps atteint la consigne** : taille, poids daté, bande d'âge, sexe —
  neuf injections vérifiées sur neuf.
- **Le plancher TCA tient** : sous `restriction_flag`, aucune mesure ne fuit,
  ni dans les blocs ni dans la consigne complète.
- **Le contexte est compris** : « je mange à la cantine le mardi midi » et « je
  travaille tard » produisent `Canteen plate` et `Late-shift wrap`.
- **Les apports fixes ne se dupliquent pas** : 7 jours × 3 repas − 5
  petits-déjeuners remplacés par le shaker = **16 plats**, exactement.
- **Le régime végan tient** après correction du faux positif `soy yogurt`.
- **7 jours passent** : 168 s, 31 771 caractères, aucune troncature.
- **Résolution du référentiel** : jusqu'à **100 %** après C1 + C2.

---

## 6. Ce qui reste

| | |
|---|---|
| 🔴 **LA RÉSOLUTION DU RÉFÉRENTIEL — le facteur limitant n°1** | 222 aliments, 805 alias, et les plans se lisent entre **69 % et 93 %** selon la cuisine. Sous 80 %, TOUT s'éteint : verdict, boucle de correction, mise à l'échelle. Combler au coup par coup ne marche pas — j'ai comblé deux fois, les termes changent à chaque génération. La réponse est l'import CIQUAL complet (~3200 entrées), qui est un chantier, pas un correctif. |
| ✅ ~~Le niveau des portions~~ | **corrigé** — 100 % de la cible quand le plan est lisible ; `portion_scaling.ts`, 22 tests |
| 🟠 **Le plancher protéique de `fat_loss`** | 72/110 et 137/184 après mise à l'échelle : les dynamiques à plancher élevé (2,0-2,7 g/kg) demandent proportionnellement PLUS de protéine, pas plus de tout |
| 🟠 **Les plans végans sont pauvres en protéines** | 43 g pour un plancher de 109 ; et résolution sous la porte des 80 %, donc verdict muet — à instruire à part |
| 🟠 **La porte des 80 % est une falaise** | résolution mesurée de 69 % à 87 % selon le style de cuisine ; sous 80 %, tout l'étage se tait d'un coup |
| 🟠 **Quatre modules écrits, aucun câblé** | `portion_scaling`, `plan_feedback`, `activity_floor`, et le verrou de régime — tous bloqués par `doctrine.ts` et `meal_generation.ts` en vol |
| 🟠 Câblage de `plan_feedback` et `activity_floor` | modules écrits et testés, aucun appelant — bloqué par `doctrine.ts` en vol |
| 🟠 Verrou de régime au parseur | FF-042 §3 ; aujourd'hui le régime ne passe que par le texte libre |
| 🟡 Résolution encore imparfaite sur les termes composés | « salt and black pepper », « garlic granules » |
