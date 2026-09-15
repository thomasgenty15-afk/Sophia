# VÉRIFICATION ⑤ — qualité d'un plan de foyer (agent 5V)

Vérification de l'étape ⑤ jugée par 5A. **Aucun run neuf n'a été lancé.** Tout ce
qui suit est établi sur les archives, la base locale, et le code exécuté
directement (`deno run` sur `forbidden_matcher.ts`).

## Réserve de portée, redite et non enterrée

Les 5 plans jugés sortent tous de **`gemini-3-flash-preview`** (`provider=gemini`,
relevé sur `dump/output.json → result.model`, 5 fois sur 5). Le briefing annonce
`GLOBAL_AI_MODEL = gpt-5.4-mini` pour la lane foyer : **ce n'est pas le modèle
qui a produit ces plans.** Tout ce qui relève du COMPORTEMENT DU MODÈLE
ci-dessous (combien de plats il écrit, comment il découpe ses boîtes, ce qu'il
écrit dans un `why`) ne vaut que pour ce modèle-là. Tout ce qui relève du
MOTEUR (le plafond, le sacrifice, `attachSizedQuantities`, la portée de
doctrine) est indépendant du modèle et vaut en général.

## Appariement run ↔ plan — vérifié avant toute conclusion

Le piège transmis (un harnais qui archive « le dernier plan du foyer » et non
celui du run) a été **cherché et écarté** :

| dossier | `plan_id` local | ligne en base | `created_at` modèle | `created_at` ligne |
|---|---|---|---|---|
| plan-1 | `361148cb…` | ✅ | 03:39:28.462 | 03:39:28.533 |
| plan-2 | `a47099e3…` | ✅ | 03:50:17.788 | 03:50:17.869 |
| plan-3 | `168fbda7…` | ✅ | 03:58:10.034 | 03:58:10.098 |
| plan-4 | `12bff160…` | ✅ | 04:00:16.095 | 04:00:16.160 |
| onedish-1 | `adbdb2f1…` | ✅ | 04:21:30.855 | 04:21:30.920 |

Corroboré par une seconde requête de forme différente :
`count(*) = 5`, `min/max(created_at)` = 03:39:28 → 04:21:30,
`sum(jsonb_array_length(dishes)) = 36` = 8+8+8+8+4. **Les cinq sont appariés,
aucun plan étranger.**

`plan-5` et `onedish-2` : **aucune ligne en base** — leurs `NOTES.md` sont
exacts. J'ai vérifié en plus que `onedish-2/plan-payload.json` est
**octet pour octet identique** à celui de `onedish-1` (même md5
`029eff98…`) : c'est bien la copie périmée que la note désavoue. Les deux
dossiers sont écartés de tout dénominateur.

---

# I. MON JUGEMENT PROPRE — écrit avant lecture du rapport de 5A

Le foyer : Roxane (titulaire, F, 61 kg, `on_feet`, `fat_loss`, omnivore),
Zoe (mineure, 23 kg), Lubna (F, 57 kg, sédentaire, **végane + allergie gluten
severity=medical**), Ivar (H, 88 kg, `trains_hard`, `muscle_gain`, dehors les
midis de mer./jeu.). Fenêtre 2 jours, 1 seul jour de cuisson dans la fenêtre.

## Casquette ① — diététicien : **non, je ne livre pas.**

**Le défaut qui décide, c'est la protéine, et surtout QUI la reçoit.**

Protéine allouée sur 2 jours (calcul indépendant : protéine de la casserole,
prorata des grammes de boîte / masse prête ; table de composition et rendements
de cuisson explicités dans le script) :

| bouche | plan-1 | plan-2 | plan-3 | plan-4 | onedish-1 |
|---|---|---|---|---|---|
| Roxane 61 kg | 69 g | 114 g | 112 g | 96 g | 56 g |
| Zoe 23 kg | 40 g | 43 g | 31 g | 50 g | 49 g |
| Lubna 57 kg | 40 g | **7 g** | 35 g | 50 g | 55 g |
| **Ivar 88 kg** | 47 g | **0 g** | **0 g** | **0 g** | 55 g |

Ramené au corps et au jour : Ivar plafonne à **0,31 g/kg/j** dans son meilleur
run, et vaut **0** dans trois runs sur cinq. Un homme de 88 kg qui s'entraîne
dur, en prise de masse, a besoin d'un ordre de grandeur de 1,6–2,2 g/kg/j. Le
plan le mieux disant lui en sert **un cinquième**. Lubna descend à
**0,06 g/kg/j** (7 g sur deux jours) dans plan-2. Roxane, en déficit et debout
toute la journée, plafonne à 0,94 g/kg/j quand il lui en faudrait 1,2–1,6 pour
protéger sa masse maigre. **La seule bouche correctement servie est l'enfant**
(0,87–1,09 g/kg/j, ce qui est juste pour 23 kg).

Ce que je retiens comme **bien fait** et qui doit survivre : la sécurité
alimentaire. Aucun plan sur cinq ne met de gluten ni de produit animal dans une
assiette de Lubna. Le compteur du moteur le dit aussi (`regime_belt.refused: 0`,
`checked > 0` partout). C'est la chose qui marche le plus proprement.

Ce que je ne peux pas juger sur 2 jours : les micronutriments. Je note quand
même qu'une végane nourrie de lentilles + riz, sans aliment enrichi, sans
variété de légumineuses, sans source de B12 et quasi sans oléagineux n'est pas
un motif à étendre à une semaine — mais **2 jours ne le prouvent pas**, et je
ne le compte pas comme défaut.

**Défaut diététique supplémentaire : la casserole ne suit pas.** Compté dans
l'unité que le plan déclare lui-même (`servings_made` contre le nombre de parts
réellement tirées par les plats gardés) :

- **plan-1, le dahl est tiré 10 fois pour 8 parts annoncées** — deux bouches
  n'ont rien jeudi soir. *(C'est exactement le nombre de 5A en §1.7 ; j'y étais
  arrivé à 199 % par une erreur de double-comptage que j'ai corrigée — voir la
  note de méthode ci-dessous. 5A a raison, moi non.)*
- à l'inverse, la plupart des casseroles sont **sous-tirées** : plan-2 tire
  3 parts de dahl sur 6 annoncées et 6 de riz sur 11 ; plan-3, 4 sur 8 et 8 sur
  14 ; plan-4, 4 sur 6 de poulet.
- **onedish-1 est le seul exact** : 8/8 et 3/3.

Le moteur ne voit ni l'un ni l'autre : `boxes.sum_over: 0` et
`box_sizing.capped_by_pot: 0` sur les 5 runs. Sa vérification compare la **somme
des boîtes** au pot **une fois**, et ne multiplie jamais par le nombre de repas
où la boîte est reprise.

> ⚠️ **Note de méthode, sur ma propre erreur.** Mon premier calcul créditait la
> boîte partagée à **toutes** ses bouches à **chaque** repas — y compris à celles
> qui avaient déjà leur propre assiette à ce repas-là. Il rendait 3 200 g tirés
> d'un pot de 1 605 g, soit « 199 % », un nombre spectaculaire et **faux**. La
> règle juste est : une bouche mange **son** plat s'il existe, **sinon** celui de
> la table. Tous les chiffres de ce document sont recalculés avec cette règle.

## Casquette ② — utilisateur lambda : **non, je ne livre pas.**

Ouvert en tant que Roxane, le plan est **crédible** : noms appétissants, méthodes
courtes, une seule session de cuisine le mercredi, une liste de courses. C'est
ce qui rend les défauts pires, pas meilleurs.

**Ce qui me ferait fermer l'application :**

1. **Le plan achète pour quelqu'un qu'il ne nourrit jamais.** plan-2 met 750 g
   de cuisses de poulet sur la liste, nomme des boîtes `box_chicken_ivar_1/2`
   — et Ivar n'apparaît dans **aucun repas**. plan-3 : 900 g achetés, idem.
   plan-4 : 900 g, idem.

2. **L'écran promet à Ivar une portion qui n'existe dans aucun repas.** Dans
   plan-4, sa fiche affiche mot pour mot :
   `Pan-Fried Thyme Chicken Strips 145 g · Steamed Herbed Quinoa 189 g ·
   Sautéed Rainbow Vegetables 145 g`
   — et **aucun plat gardé n'utilise ces trois boîtes**. C'est le pire défaut
   visible du lot : un chiffre affiché, précis, sans repas derrière.

3. **La contrainte médicale d'une bouche se lit devant toute la table**, et une
   fois **attribuée à la mauvaise personne** : plan-4 écrit « A quick, warm
   lunch **for Roxane** that avoids gluten » et « A high-protein, **gluten-free**
   meal designed specifically for **Roxane's** midday energy needs ». L'allergie
   au gluten est celle de **Lubna**. Roxane n'en a aucune. Le plan fabrique un
   fait médical faux sur une personne.

4. **La moitié du panier finit à la poubelle** (voir les taux d'utilisation
   ci-dessus). Sur un foyer à budget déclaré de 95 £, c'est concret.

**Ce que je ne retiens PAS contre le plan :** la monotonie. Sur une fenêtre de
2 jours avec **un seul jour de cuisson**, et un prompt qui réclame lui-même
« Most lunches and dinners must therefore come from BATCHES — one cooking
session, several servings, several days », manger 4 fois le même lot **est le
comportement demandé**. Le reprocher, c'est reprocher au batch d'être un batch.

## Ma hiérarchie

| # | défaut | gravité | cause |
|---|---|---|---|
| 1 | Ivar sans aucune portion allouée dans 3 runs/5 | bloquant | **moteur** (plafond + sacrifice) |
| 2 | Gramme affiché sans repas derrière | bloquant | **moteur** (`attachSizedQuantities`) |
| 3 | Contrainte médicale en clair + mal attribuée | bloquant | **modèle** ; aucune ceinture ne couvre — arbitrage assumé |
| 4 | Boîte partagée non coupée entre corps différents | grave | **modèle**, moteur s'abstient exprès |
| 5 | Casserole tirée 10 fois pour 8 parts / pots sous-tirés de moitié | grave | **moteur** (somme non multipliée par les repas) |
| 6 | Croyance `muscle_gain` du coach jamais injectée | grave | **moteur** (portée sur le titulaire) |
| 7 | Monotonie | **non retenu** | dénominateur trop court |

---

# II. AFFIRMATION PAR AFFIRMATION

## ① « Celui qui s'entraîne est celui qui mange le moins » — **CONFIRMÉE (résultat), CAUSE À REQUALIFIER**

Le **résultat** est confirmé, et je le trouve même pire que 5A ne l'écrit.
Le **dénominateur** demandé se tranche ainsi :

> **« 8 demandés » ne compte NI ce que le modèle a déclaré, NI ce que le plafond
> a laissé passer. Il compte les occasions de repas d'Ivar À LA MAISON, lues sur
> le roster** (2 par run × 4 runs). C'est le bon dénominateur pour la question
> « a-t-il eu une assiette à chaque fois qu'il mangeait chez lui », et il est
> indépendant du modèle et du moteur. Il est donc légitime.

Mais il ne doit **pas** se lire « le modèle oublie l'athlète ». J'ai sorti les
sorties BRUTES du modèle (`dump/output.json → result.output_text_json`) :

| run | plats **déclarés par le modèle** | gardés | `member_id` déclaré par le modèle |
|---|---|---|---|
| plan-1 | 8 | 8 | **aucun — `null` sur les 8** |
| plan-2 | **10** | 8 | **aucun — `null` sur les 10** |
| plan-3 | **10** | 8 | **aucun** |
| plan-4 | **10** | 8 | **aucun** |
| onedish-1 | 4 | 4 | **aucun** |

Deux faits que ça établit, et qu'il faut dire ensemble :

1. **Le modèle ne déclare JAMAIS `member_id`.** L'attribution d'un plat à une
   bouche est entièrement **dérivée par le moteur** à partir des boîtes citées.
   Un compteur de « plats propres » mesure donc une décision du moteur, pas une
   déclaration du modèle.
2. **Dans 3 runs sur 4 le modèle A ÉCRIT un troisième plat à mer/dîner et à
   jeu/dîner — c'est-à-dire la bouche en trop, Ivar — et le plafond les a
   supprimés.** Les `issues` le nomment mot pour mot.

Le mécanisme est **déterministe** et je l'ai rejoué à la main sur plan-2 :
`dishRank` donne 0 au 1ᵉʳ plat d'une case, 1 au 2ᵉ, **2 au 3ᵉ** ;
`sacrificeFor` sacrifie le rang le plus élevé. Les rangs gardés à l'arrivée du
9ᵉ plat sont `[0,1,0,1,2,0,1,0]` — un seul rang 2, l'index 4, « Seared thyme
chicken with a **double portion** of spinach rice ». C'est exactement le plat
que l'`issue` dit avoir jeté. **Reproduction exacte, sans run.**

⇒ **Le plafond de 8 = 4 cases × 2 (un plat de table + un plat dédié par case).
Il ne peut structurellement pas représenter une table de 4 bouches à 3 besoins
distincts.** La 3ᵉ assiette d'une case est toujours de rang 2, donc toujours la
victime. La bouche qui la porte paie à chaque fois.

**Sur les grammes de poulet achetés à son nom** — confirmé, et chiffré : plan-2
750 g achetés, `box_chicken_ivar_1/2` = 348 g à son nom, **0 servi** ; plan-3
900 g, 290 g à son nom, **0 servi** ; plan-4 900 g, 145 g à son nom, **0 servi**.

**« Moins de 10 g par repas sur deux runs sur quatre » : je mesure pire.** Voir
le désaccord D1 ci-dessous — sous ma convention, Ivar n'a **aucune part
allouée** dans plan-2, plan-3 **et** plan-4, soit **3 runs sur 4**.

## ② La variance non bornée — **CONFIRMÉE. C'est la variance du MODÈLE, transformée en falaise par le MOTEUR.**

Les entrées sont byte-identiques (5A l'a prouvé par sha256 sur les prompts ; je
l'ai recoupé : `inputs.json` de plan-1 et onedish-1 ne diffèrent que par
`asked_at`, `request_id` et `cooking_shape_asked`).

La réponse à « variance du modèle ou du moteur ? » est **les deux, en série, et
c'est le point** :

- Le **moteur est pur et déterministe** — même sortie modèle ⇒ même plan. Il
  n'ajoute aucun aléa.
- Le **modèle** varie sur une chose apparemment mineure : **combien de plats il
  écrit**. 8 (plan-1) ou 10 (plans 2-4).
- Le **moteur** convertit cet écart mineur en **tout ou rien** : à 8 plats,
  aucune éviction, Ivar mange ; à 10 plats, l'éviction tombe deux fois sur lui,
  et il ne mange rien.

⇒ **La variance naît dans le modèle, mais son amplitude est fabriquée par le
plafond.** Ce n'est pas « le modèle sert tantôt 16 g tantôt 75 g » ; c'est « le
modèle franchit ou non un seuil de comptage, et le moteur en fait 0 ou 47 ».
C'est une distinction qui change le correctif : borner le modèle ne suffirait
pas, il faut retirer la falaise.

## ③ La monotonie — **DÉNOMINATEUR CONTESTABLE. Je n'endosse pas l'inférence.**

Le **fait** est confirmé (je le recompte à 11/16, 5A à 14/16 — voir D2).
L'**inférence** ne tient pas, pour une raison écrite dans l'instrument lui-même.

Le prompt réellement envoyé (`prompt-user.txt:118`) dit :

> *cooking sessions: at most 2 for the whole stretch. Most lunches and dinners
> must therefore come from BATCHES — one cooking session, several servings,
> several days.*

Et la fenêtre est de **2 jours avec un seul jour de cuisson dedans** (`cook_days:
[wed, sat]`, fenêtre mer-jeu). Manger 4 fois le même lot n'est donc pas une
défaillance de qualité : **c'est la consigne exécutée.** Un compteur qui
sanctionne ça sanctionne le batch d'être un batch.

De plus le dénominateur est mécaniquement favorable au verdict : Ivar n'a que
**2** repas à la maison — deux tirages identiques suffisent à le classer
« monotone », ce qui n'a pas le même sens que 4 repas identiques.

⇒ **Non vérifiable en l'état.** La monotonie ne devient une question qu'à
partir d'une fenêtre où plusieurs sessions de cuisson tombent. 5A l'écrit
d'ailleurs lui-même en §6 (« une fenêtre de plus de 2 jours n'est pas mesurable
sur le modèle de repli ») — mais la garde quand même comme raison n°3 du refus
diététique. C'est mon désaccord principal (D2).

## ④ 🔴 Le trou des boîtes partagées — **CONFIRMÉ. Fraction mesurée ci-dessous.**

Le cas que vous avez vérifié vous-même est exact, à l'octet : plan-4,
`box_quinoa_shared` = **130 g** pour Zoe (23 kg) **et** Lubna (57 kg) ;
`box_quinoa_roxane` = **102 g** pour Roxane (61 kg). L'enfant reçoit bien plus
que l'adulte, et deux corps différents reçoivent des grammes **identiques**.

**La portée, qui est la question posée. Trois dénominateurs, et ils ne disent
pas la même chose :**

| dénominateur | valeur | ce qu'il donne à croire |
|---|---|---|
| **boîtes** non dimensionnées / boîtes totales | **4 / 60 = 6,7 %** | « défaut marginal » — **trompeur** |
| **grammes servis** issus d'une boîte non dimensionnée, 5 plans | **5 040 / 14 919 = 33,8 %** | la mesure honnête d'ensemble |
| grammes servis, **dans les runs touchés** | plan-1 **63,2 %** · plan-4 **74,5 %** | « les deux tiers aux trois quarts » |

**Le défaut est BIMODAL, pas fractionnaire.** Il ne s'étale pas : ou le modèle
découpe une boîte par bouche et le correctif s'applique à **100 %**
(plan-2, plan-3, onedish-1 → **0 %** non dimensionné), ou il met plusieurs
bouches dans une boîte et le correctif s'abstient sur **les deux tiers aux trois
quarts** de ce qui est servi (plan-1, plan-4).

**Par bouche, dans les runs touchés :**

| | plan-1 | plan-4 |
|---|---|---|
| **Zoe (23 kg)** | **100 %** | **100 %** |
| **Lubna (57 kg)** | **100 %** | **100 %** |
| Roxane (61 kg) | 21,7 % | 0 % |
| Ivar (88 kg) | 31,1 % | — (rien servi) |

⇒ **Réponse directe : dans l'ensemble le correctif tient aux deux tiers (66 % des
grammes servis sont bien dimensionnés). Mais il ne tient PAS DU TOUT pour les
deux bouches sans compte dans 2 runs sur 5 : Zoe et Lubna mangent 100 % non
dimensionné.** C'est exactement la population qu'il visait, et c'est le chiffre
qui compte : la titulaire du compte, elle, est correctement servie à 78–100 %.

Le moteur **voit** le problème et **s'abstient exprès** : `sizeBoxesFromTarget`
(`household_portions.ts:2470-2486`) refuse de couper une boîte partagée à
facteurs divergents, journalise `shared_mixed`, et laisse les grammes du modèle.
Compteurs du moteur, qui corroborent mon calcul indépendant :
`shared_mixed` = 1 (plan-1), 0, 0, 3 (plan-4), 0.

⚠️ **Défaut de la même famille : la boîte partagée est aussi TROP TIRÉE.**
plan-1 tire `box_dahl_standard` **10 fois pour 8 parts annoncées**
(`servings_made: 8`) — deux bouches n'ont rien jeudi soir. Le moteur ne le voit
pas (`boxes.sum_over: 0`, `box_sizing.capped_by_pot: 0`) : sa vérification
compare la **somme des boîtes** au pot **une fois**, et ne multiplie jamais par
le nombre de repas où la boîte est reprise.
**C'est le défaut que 5A a déjà mesuré en §1.7, et son nombre est le bon** — le
mien (« 199 % ») venait d'un double-comptage, corrigé.
Dans l'autre sens, les casseroles sont surtout **sous-tirées** (plan-2 : 3 parts
de dahl sur 6, 6 de riz sur 11 ; plan-3 : 4 sur 8 et 8 sur 14). **Seul
onedish-1 est exact : 8/8 et 3/3** — et c'est le seul dont les boîtes sont
découpées par bouche **et par jour**.

## ⑤ `attachSizedQuantities` ne consulte jamais `dishes[]` — **CONFIRMÉ, code ET plan réel**

**Dans le code** (`household_portions.ts:3877-3919`) : la signature est
`attachSizedQuantities(portions, preparations)`. **`dishes` n'est même pas un
paramètre.** La fonction parcourt les préparations, et pour toute boîte portant
le nom de la bouche recolle `` `${title} ${grams} g` ``. Elle ne demande jamais
si un plat survivant utilise cette boîte.

**Sur un plan réel** (plan-4, `member_portions[Ivar]`, tel qu'il est en base) :

```
Serve the chicken and quinoa first, with the vegetables on the side.
— Pan-Fried Thyme Chicken Strips 145 g · Steamed Herbed Quinoa 189 g
· Sautéed Rainbow Vegetables 145 g
```

et **aucun des trois `box_chicken_ivar` / `box_quinoa_ivar` / `box_veg_ivar`
n'est cité par un plat gardé.** Boîtes orphelines mesurées : plan-2 **10**
(4 d'Ivar, 6 de Lubna), plan-3 **5** (3 d'Ivar, 1 de Roxane, 1 de Zoe),
plan-4 **3** (toutes d'Ivar). plan-1 et onedish-1 : **0**.

⚠️ **Précision que je n'ai vue nulle part ailleurs, et qui compte pour le
correctif :** l'appel est **conditionné** à `boxSizing.counts.sized > 0`
(`generate-household-meal-v1/index.ts:4749`). Donc le défaut ne se manifeste que
quand le moteur a dimensionné **au moins une** boîte. Si le modèle mettait tout
le monde dans des boîtes partagées, `sized` vaudrait 0, le moteur n'écrirait
rien, et ce serait la prose du modèle qui porterait les grammes. **Les deux
défauts ④ et ⑤ sont donc mutuellement exclusifs par construction** — ce qui
explique pourquoi plan-1 (le plus « boîte partagée ») a 0 boîte orpheline.

## ⑥ Régime et contrainte médicale en clair + garantie d'écran — **CONFIRMÉE (moitié 1) · CONFIRMÉE MAIS À REQUALIFIER (moitié 2)**

**Moitié 1 — la sortie en clair : 5 plans sur 5.** Relevé indépendamment sur
`dishes[].why`, `portion_note`, `run_through` et `shopping_list` :

- plan-1 : « A **non-vegan** plate for Roxane … separate from the shared
  **vegan** pot » ; portion_note[Lubna] « … no cross-contamination with
  **non-vegan** items »
- plan-2 : « … avoids the shared **vegan** pot as requested »
- plan-3 : « … naturally free from **one of the foods on your medical list** »
- plan-4 : « … **gluten-free** … for **Roxane's** midday energy needs », « …
  that **avoids gluten** … », « … entirely **gluten-free** »
- onedish-1 : « … meets the **vegan and gluten-free** needs of the whole house »

⚠️ **Un défaut de plus, que je ne vois signalé nulle part : plan-4 attribue
l'allergie au gluten à ROXANE**, qui n'en a aucune (`allergies: []`). L'allergie
est celle de **Lubna**. Le plan n'expose pas seulement un fait médical, il en
**fabrique un faux sur une autre personne**.

**Moitié 2 — la garantie promise et non armée.** Vérifiée en deux temps.

`frontend/src/keel/components/plan/PlanByPerson.tsx:32-35` promet :

> « `portion_note` est une INSTRUCTION DE SERVICE, **garantie sans motif** ni
> vocabulaire de corps par `sanitizePortionNote` côté serveur — **c'est
> précisément ce qui permet de l'afficher devant toute la table.** »

Or `FORBIDDEN_PORTION_TERMS` (`household_portions.ts:2860`) ne contient que du
vocabulaire de **CORPS**, et je l'ai énuméré :
`age · calories · cutting · diet · fat_loss · health · height · maigrir ·
maintenance · measurements · muscle_gain · performance · recomposition ·
silhouette · weight`.
**Zéro occurrence de `vegan`, `gluten`, `allergy`, `medical`.**
Nuance utile : le jeton `diet` (formes `regime`/`objectif`/`goal`) attrape le mot
**abstrait**, jamais le **nom concret** d'un régime. « vegan » passe.

⇒ Le commentaire promet « sans motif », la ceinture n'arme que « sans corps ».
Et la portion_note de Lubna en plan-1 porte bien un motif (« no
cross-contamination with non-vegan items ») **jusqu'à l'écran**.

**Et la menace écrite AU MODÈLE est fausse — mais pas pour la raison que je
croyais.** Le prompt dit en majuscules qu'un nom `severity=medical` écrit dans un
`why` « **empties the WHOLE week** ». Il y a **deux** ceintures, et il faut les
distinguer, sinon on accuse la mauvaise.

> ⚠️ **J'ai d'abord écrit ici que « on ne donne jamais l'allergène à la
> ceinture ». C'est FAUX, et je le corrige.** Mon premier test passait un objet
> de contrainte en `snake_case` alors que le type est en `camelCase`
> (`allergenRef`) : la ceinture recevait **zéro jeton** et rendait `clean` sur
> tout, y compris sur mes contrôles. C'était mon instrument qui était mort, pas
> le produit — exactement le piège n°1 du briefing, retourné contre moi.

**Ceinture A — `applyKeelOutputLocks`** (`meal_generation.ts:4892`), qui rejette
le repas entier. Rejouée avec le bon type :

```
CONTRÔLE « Toasted wheat bread with pasta »  => blocked_medical_constraint ["wheat"]
CONTRÔLE « This dish contains gluten. »      => blocked_medical_constraint ["gluten"]
plan-4 « … gluten-free meal … »              => clean
plan-4 « … that avoids gluten … »            => clean
onedish-1 « … vegan and gluten-free needs … » => clean
```

⇒ **Elle EST armée, elle EST branchée sur la lane foyer, et elle mord sur une
mention nue.** Elle laisse passer la forme **niée** — et c'est **délibéré et
documenté** (`safety_constraints.ts:107-117`) : armer sur le mot ferait rejeter
« ce plat est sans gluten », c'est-à-dire précisément les bonnes réponses. Ce
dépôt a déjà payé ce défaut en run réel avec `allergen_ref='diabetes'`.
**C'est le bon comportement, et 5A le dit correctement.** Ce qui est faux, c'est
seulement **la phrase du prompt**, qui promet au modèle une conséquence qui
n'arrivera pas pour cette forme-là.

**Ceinture B — `applyHouseRuleLock`** (`household_restriction_lock.ts:98`), la
seule qui **efface un `why`**. Elle, en revanche, ne voit jamais l'allergène :
elle est appelée avec `householdSplit.houseRuleLabels` (`index.ts:4326-4328`) —
les **règles de maison** — et les allergies partent dans un champ séparé
(`safetyConstraints`, `household_safety.ts:249-253`). Là encore c'est **écrit
exprès** (`index.ts:4321-4325` : « il est structurellement impossible qu'une
allergie y entre un jour par distraction »).

**Le trou réel est donc entre les deux, et il est ARBITRÉ, pas oublié :**
aucune ceinture déterministe n'empêche qu'un **nom de régime** (`vegan`) ou une
**mention niée d'allergène** (`gluten-free`) soit écrit dans un `why` lu à
table. `meal_generation.ts:2899-2906` l'assume mot pour mot : « verser "vegan"
dans la liste d'évitement armerait la ceinture de sortie sur le mot lui-même ».
La **seule** protection est une ligne de prompt (`household_diet.ts:318-322` :
« Never write it as a reason in anything read at the table »), et
`household_diet.ts:292-296` confirme qu'aucune ceinture ne la soutient.

⇒ **Le défaut à porter devant un humain n'est pas « une ceinture est
désarmée ».** C'est : *la confidentialité du régime et de la contrainte médicale
à table repose entièrement sur l'obéissance du modèle à une phrase de prompt, et
le modèle désobéit 5 fois sur 5.*

## ⑦ La croyance `goal_scope` du coach — **INFIRMÉE DANS SA FORMULATION, CONFIRMÉE DANS SA CONSÉQUENCE**

⛔ **« n'atteindrait jamais le prompt » est FAUX.** `goal_scope` n'est pas un
champ mort. Il est parsé (`doctrine.ts:434`), et **filtré** par
`goalScopeApplies` (`tokens.ts:739`) en trois endroits vivants
(`doctrine.ts:693-694`, `doctrine_loader.ts:512-515`, `doctrine_loader.ts:578`).
`grep` en rend **84 occurrences** dans `supabase/functions/`.

> ⚠️ Note de méthode : ma première recherche a rendu « absent du backend » —
> parce que j'avais tronqué la sortie par `head -20` et que les 20 premières
> lignes étaient toutes des migrations. **C'est exactement le sous-ensemble
> plausible et faux dont le poste met en garde, en version `grep`.** Corrigé en
> comptant d'abord (`wc -l`) puis en lisant tout.

✅ **La CONSÉQUENCE, elle, est vraie — et je la démontre sur ces runs mêmes.**
La doctrine est chargée par `loadPublishedDoctrine(admin, userId)`
(`index.ts:1940`) et l'objectif est `goalRow = ownerGoal` — **le titulaire du
compte**. En base :

```
coach 1e000000-…-c1, 3 croyances :
  1. « Every week starts with a plate you can name out loud… »   goal_scope: —
  2. « One loud vegetable on every plate… »                      goal_scope: —
  3. « On a muscle gain stretch the starch goes where the        goal_scope:
     training is. »                                              ["muscle_gain"]
```

Le titulaire est Roxane, `goal = fat_loss` (vérifié en base, et
`generated_from.goal = "fat_loss"` sur les 5 plans). Donc :

```
belief_keys = ["name_the_plate_out_loud", "one_loud_vegetable"]   — 5 plans / 5
grep « starch goes where the training is » dans les 6 prompts archivés : 0 / 6
```

⇒ **Le foyer contient exactement l'élève pour qui la croyance est écrite (Ivar,
`muscle_gain`, `trains_hard`), et la croyance est absente de tous les prompts
parce que la titulaire du compte est en `fat_loss`.** Grave, et démontré.

Mais **le correctif n'est pas celui que la formulation suggère** : il n'y a rien
à « brancher ». Il y a une décision produit à prendre — sur quel(s) objectif(s)
compile-t-on la doctrine d'un foyer à plusieurs objectifs. Ce n'est pas un
champ mort, c'est une **clé de portée posée sur la mauvaise bouche**.

---

# III. LES TROIS CORRECTIFS DE LA NUIT — contrôlés moi-même

**Aucune régression.** Les trois tiennent. Vérifié sur les compteurs du moteur
archivés en base (`generated_from.household`), pas sur la parole de 5A.

| correctif | preuve indépendante | verdict |
|---|---|---|
| **Part dimensionnée par le corps** | `box_sizing.sized` = 6/22/11/6/11, **> 0 sur 5 runs sur 5** ; `share.sized: 4` (les 4 corps lus, comptes ou pas). Gradient recalculé par moi sur les grammes bruts : Ivar/Roxane = 109/59 = 1,847 (plan-1), 218/118 = 1,847, 189/102 = 1,853 (plan-4), 464/252 = 1,841 (onedish-1) — **stable à 3 décimales sur 4 plans indépendants** | ✅ **armé, agit, non régressé** |
| **Contrainte dure attachée à sa bouche** | prompt archivé : `- Lubna: gluten — allergy, severity=medical (declared by student)`, la bouche est nommée ; `restriction_count: 1` sur 5/5 ; **0 occurrence** de gluten/blé/pain/pâtes en ALIMENT sur les 5 plans | ✅ **armé, non régressé** |
| **Ceinture de régime** | `regime_belt.checked` = 1/6/2/3/3, **> 0 sur 5/5** (pas le zéro ambigu) ; `refused: 0` partout, `mouths: 1` | ✅ **armée, non régressée** — mais **elle n'a jamais eu à mordre** : dénominateur faible, comme 5A le dit |

⚠️ **Le correctif « part dimensionnée » a une porte de sortie non fermée**, déjà
chiffrée en ④ : il ne s'applique qu'aux boîtes que le modèle a **déjà** coupées
par bouche. Ce n'est pas une régression, c'est une portée.

## Un défaut que je ne trouve signalé nulle part : une garde dont le nom promet ce qui a échoué

`protein_anchor_missing: []` et `protein_anchor_retry: false` sur **les 5 runs**
— y compris ceux où Ivar ne reçoit aucune part. La raison est dans le code :

```ts
export function detectProteinAnchor(ingredients): boolean   // protein_anchor.ts:409
```

Elle répond « **ce PLAT contient-il un aliment protéique ?** » — présence/absence,
**par plat, jamais par bouche, jamais une quantité**. Le dahl contient des
lentilles ⇒ ancre satisfaite ⇒ compteur vert, pendant qu'un homme de 88 kg n'a
aucune boîte à son nom. La garde est armée, elle passe, et elle est **aveugle à
la question qu'elle a l'air de poser**.

---

# IV. LÀ OÙ JE NE SUIS PAS D'ACCORD AVEC 5A

Le rapport de 5A est solide, honnête sur ses limites, et **sa cause racine est
juste** — il attribue explicitement le défaut n°1 au plafond
(« Ce n'est pas un tirage : c'est de l'arithmétique de plafond »), ce qui est
exactement ce que ma reconstruction du `dishRank`/`sacrificeFor` confirme. Mes
désaccords portent sur **quatre points**, dont deux sérieux.

## D1 · La protéine d'Ivar — convention différente, écart important **(sérieux)**

| | plan-1 | plan-2 | plan-3 | plan-4 |
|---|---|---|---|---|
| **5A** | 40 g | 16 g | **75 g** | 19 g |
| **moi** | 47 g | **0 g** | **0 g** | **0 g** |

**La cause est une convention, pas une erreur de calcul.** 5A crédite Ivar d'une
part de la casserole commune **même quand aucune boîte ne porte son nom** ; je
ne compte que ce qui lui est **alloué**.

Les deux lectures sont défendables — la casserole a physiquement du reste
(plan-3 : ~1 567 g non tirés). Mais je maintiens la mienne pour une raison
produit : **le plan ne lui alloue rien**, et « il peut racler le fond » n'est pas
une phrase que le produit écrit. Surtout, la convention de 5A a un coût de
lecture : son plan-3 à **75 g / 38 g par repas** se lit comme un run où Ivar
**est** servi, alors qu'aucune boîte n'est à son nom dans aucun plat gardé.
Cela **masque** que le défaut est présent **3 runs sur 4**, et pas 2.

⇒ Je propose de rendre les deux nombres, jamais un seul : **alloué** et
**physiquement disponible**.

## D2 · La monotonie comme raison n°3 du refus diététique — **je la retire (sérieux)**

5A la classe « systématique » et en fait sa 3ᵉ raison de ne pas signer. Je pense
que l'inférence ne tient pas sur ce décor (argument complet en ③) : **2 jours, un
seul jour de cuisson dans la fenêtre, et un prompt qui réclame explicitement le
batch.** 5A écrit lui-même en §6 qu'une fenêtre plus longue n'est pas mesurable ;
je trouve incohérent de conclure quand même.

Et nos comptes diffèrent : **14/16 pour 5A, 11/16 pour moi**. L'écart est sur
plan-2, où je compte les déjeuners froids sans préparation (salade thon/avocat,
salade pois chiches) comme une **combinaison distincte** — ce sont bien des
aliments différents, cuisinés autrement. 5A semble ne compter que les
combinaisons de **préparations**, ce qui rend `()` pour un plat sans batch et
fusionne des repas réellement différents.

⇒ Sur le verdict global ça ne change rien (je refuse aussi de signer), mais la
raison n°3 doit tomber, sinon elle affaiblit les deux premières, qui sont
irréprochables.

## D3 · « La croyance n'atteint jamais le prompt » — formulation à corriger **(mineur, mais piégeux)**

§1.6 de 5A est **exact** (« doctrine compilée sur `student_goals.goal` du
titulaire »). Mais la ligne de synthèse du §5 écrit « **La croyance de doctrine
`muscle_gain` n'atteint jamais le prompt** », et c'est cette ligne-là qui
remonte. Elle se lit comme « champ collecté sans lecteur » — le piège central du
chantier — alors que c'est l'inverse : **le lecteur existe et fonctionne**, il
est juste indexé sur la mauvaise bouche. Le correctif est une décision produit,
pas un branchement. (Cette formulation m'a moi-même envoyé sur une fausse piste,
cf. la note de méthode en ⑦.)

## D4 · Trois mesures que 5A n'a pas faites, et qui durcissent son propre dossier

Pas des désaccords — des ajouts qui vont dans son sens :

1. **Le tirage des casseroles, étendu aux 5 plans.** 5A mesure le défaut en §1.7
   sur une seule casserole (« 10 parts demandées, `servings_made: 8` — son
   nombre est le bon, le mien était faux) ; en le passant sur les 5 plans on
   voit que **seul `one_dish` est exact (8/8, 3/3)** et que partout ailleurs les
   pots sont **sous-tirés de moitié**. Ça renforce sa propre conclusion de §E.
2. **`protein_anchor_missing: []` sur 5/5** alors que la protéine par bouche est
   le défaut n°1 (section III ci-dessus). 5A ne mentionne pas cette garde, dont
   le nom promet exactement ce qui a échoué.
3. **`attachSizedQuantities` est conditionné à `sized > 0`** (`index.ts:4749`),
   ce qui rend les défauts ④ et ⑤ mutuellement exclusifs. 5A décrit la fonction
   sans mentionner la porte qui la commande.

## Ce sur quoi je le confirme sans réserve

Le plafond et son arithmétique (§0), `attachSizedQuantities` (§2.1), la garantie
du front non armée (§2.2) — que j'ai retrouvée indépendamment —, le facteur de
part stable à 3 décimales (§4.1), les trois correctifs non régressés (§4), la
discipline d'archive (`plan-5` et `onedish-2` correctement désavoués, `plan_id`
vérifié), et la réserve de modèle en tête. **Son instrument est propre ; je n'ai
trouvé aucune mesure fausse, seulement deux conventions à expliciter.**


---

# V. SYNTHÈSE — état des 7 affirmations

| # | affirmation | verdict |
|---|---|---|
| ① | « Celui qui s'entraîne mange le moins », 1/8 vs 15/16 | **CONFIRMÉE** en résultat. Dénominateur légitime (occasions de repas du roster). ⚠️ La cause est le **plafond du moteur**, pas l'indifférence du modèle : le modèle a écrit un plat à Ivar dans **3 runs sur 4**, le plafond l'a jeté. Éviction reproduite à la main, sans run. |
| ② | Variance 16→75 g à octets identiques | **CONFIRMÉE.** Variance née dans le **modèle** (8 ou 10 plats écrits), transformée en **falaise tout-ou-rien** par le moteur. Sous ma convention : 0 → 47 g. |
| ③ | Monotonie, 14/16 | **DÉNOMINATEUR CONTESTABLE — inférence non endossée.** Fenêtre de 2 jours, 1 seul jour de cuisson, et un prompt qui **réclame** le batch. Je recompte 11/16, et je retire ce point du verdict. |
| ④ | Trou des boîtes partagées | **CONFIRMÉ**, cas exact reproduit (130 g pour 23 kg vs 102 g pour 61 kg). **33,8 %** des grammes servis sortent d'une boîte non dimensionnée ; défaut **bimodal** (0 % sur 3 runs, 63–75 % sur 2) ; **100 % pour Zoe et Lubna** dans les runs touchés. |
| ⑤ | `attachSizedQuantities` ignore `dishes[]` | **CONFIRMÉ** en code (`dishes` n'est pas un paramètre) **et** sur plan-4. 18 boîtes orphelines sur 5 plans. ➕ la fonction est **gatée par `sized > 0`**, ce qui rend ④ et ⑤ mutuellement exclusifs. |
| ⑥ | Régime/médical en clair + garantie d'écran | **MOITIÉ 1 CONFIRMÉE** (5/5, ➕ allergie **mal attribuée à Roxane** en plan-4). **MOITIÉ 2 CONFIRMÉE MAIS REQUALIFIÉE** : la ceinture de sortie **est armée et mord** sur une mention nue ; elle tolère la forme **niée** **par décision documentée**. Le vrai trou : la confidentialité repose sur **une ligne de prompt**, et le modèle désobéit 5/5. |
| ⑦ | `goal_scope` n'atteint jamais le prompt | **INFIRMÉE dans sa formulation** (84 occurrences, filtre vivant), **CONFIRMÉE dans sa conséquence** : compilée sur l'objectif du **titulaire**, la croyance `muscle_gain` du coach est absente des **6 prompts sur 6** alors que l'athlète est à table. |

**Les trois correctifs de la nuit : aucune régression.** Part dimensionnée
(`sized > 0` sur 5/5, facteur stable à 3 décimales), contrainte dure attachée à
sa bouche (`restriction_count: 1`, 0 aliment interdit sur 5 plans), ceinture de
régime (`checked > 0` sur 5/5, `refused: 0`).

**Mes deux verdicts, comme 5A : NON et NON.** Mais pour des raisons partiellement
différentes — je retire la monotonie, j'ajoute la portion promise sans repas
comme défaut n°1 de l'utilisateur, et je requalifie la cause du n°1 diététique.
