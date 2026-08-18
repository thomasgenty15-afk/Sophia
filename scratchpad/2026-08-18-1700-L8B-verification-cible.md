# L8-B — Vérification du LOT CIBLE (`269797e7` + `95786e85`)

**2026-08-18 · branche `ff-001-quotidien-du-coach` · aucun push, aucun merge**
Lot vérifié : [`2026-08-18-1545-L8A-cible-et-grammages.md`](2026-08-18-1545-L8A-cible-et-grammages.md)
Grille : [`2026-08-18-1215-L4B-verification-garde-tca.md`](2026-08-18-1215-L4B-verification-garde-tca.md) §7 (C1→C9)

> ⚠️ Ce rapport est écrit **au fil de l'eau et commité par paliers**. Trois agents
> ont calé sur cette vérification ; un résultat partiel posé vaut mieux qu'une
> vérification complète perdue. Les sections marquées 🕓 sont en cours.

---

## 0. État de l'environnement, avant toute mesure

| Fait | Mesure |
|---|---|
| Runtime edge | redémarré à **14:54:33 UTC** (16:54 local) — soit **après** la dernière modification de disque des six fichiers du lot (la plus récente : `generate-household-meal-v1/index.ts`, 16:51:17 local) |
| Sonde `docker logs` avant | **aucune génération d'une autre lane** en vol — uniquement les crons `process-llm-retry-jobs`, `trigger-topic-compaction`, `process-checkins` |
| Les six fichiers de production du lot | **byte-identiques à HEAD** (`git diff --numstat HEAD` vide sur chacun) — je ne mesure donc pas du code étranger non commité sur ce chemin |

⛔ **Correction d'un chiffre du rapport L8-A** : son §9 ① annonce
`with_pace = 0 | 65` sur `household_members`. À 16:57 la base dit
**`with_pace = 4 | 66`** : une population a été posée entre-temps (sans doute par
l'un des trois agents qui ont calé). Sur `student_goals`, en revanche, le chiffre
tient : **zéro sur soixante-treize**.

Les quatre bouches déjà porteuses d'un cran :

| Prénom | Foyer | Naissance | Objectif | Cran (kg/sem) | Compte | Corps |
|---|---|---|---|---|---|---|
| Paul | `4123e479` « Vidal » | 1988-03-10 | `fat_loss` | 0,5 | oui | 162 cm / 55 kg |
| Nina | `4123e479` « Vidal » | 1992-02-20 | `muscle_gain` | 0,4 | oui | 170 cm / 85 kg |
| **Tom** | `4123e479` « Vidal » | **2014-09-15 (onze ans)** | `fat_loss` | 0,3 | non | 145 cm / 36 kg |
| ZoeL5B | `58abb20a` | 1990-05-04 | `fat_loss` | 0,3 | non | oui |

⚠️ **Ceci est une FIXTURE, et je le dis comme tel.** Elle n'a pas été produite par
un usage : aucun écran n'écrit encore le curseur (le port a été livré le matin
même). Tout chiffre de dimensionnement mesuré ci-dessous est un chiffre **de
fixture**, pas un chiffre de population.

---

## 1. ⛔ LA CONTRE-PREUVE DE P4 — LA RÉPONSE, EN TOUTES LETTRES

> **Question :** *les grammages des boîtes suivent-ils maintenant la CIBLE de
> chacun ? L'écart entre les boîtes d'une même casserole change-t-il quand les
> cibles changent — ou reste-t-il le même, auquel cas le lot est décoratif ?*
>
> ## **OUI. L'écart change, et il change beaucoup.**
> Sur la **même casserole**, les **mêmes boîtes**, les **mêmes bouches**, en ne
> faisant varier **que les cibles** : l'écart total sur six casseroles passe de
> **trois cent dix grammes** (aucune cible) à **six cent vingt-huit grammes**
> (cibles douces) à **mille dix-sept grammes** (les cibles réelles de la
> fixture). **Le lot n'est pas décoratif.**

### 1.1 La méthode — et pourquoi ce n'est pas la requête ④ telle quelle

La requête ④ du §9 de L8-A compare le `spread_g` **entre plans différents**. Je
l'ai jouée, et **elle ne peut pas répondre à P4** : chaque plan a une autre
casserole, un autre foyer et un autre tirage du modèle. Voici ce qu'elle rend :

| Plan | Foyer | `box_sizing` ? | `spread_g` max |
|---|---|---|---|
| `00646a00` (18/08 14:04 UTC) | `4123e479` Vidal | **oui** — vingt-quatre boîtes, douze dimensionnées | cent quatre-vingt-six |
| `8982a647` (18/08 11:30 UTC) | `4ba4c573` | non | **six cent soixante** |
| `483da69a` (17/08) | `80e9af4c` | non | **sept cent cinquante** |
| `1e653a47` (17/08) | `42cf7a53` | non | deux cent quatre-vingts |
| `124254f5` (17/08) | `42cf7a53` | non | **zéro** |

⛔ **Lue seule, cette table conclurait le contraire du vrai** : les plans **sans**
cible ont les plus GROS écarts (sept cent cinquante, six cent soixante) et le
plan **avec** cible en a un petit (cent quatre-vingt-six). C'est le piège exact :
le modèle écrit déjà des parts très divergentes de son propre chef, et cette
divergence-là ne suit **aucune** cible — c'est le constat d'hier
(« 700/650/600/550/350 g sur une même casserole »).

**Il faut donc tenir tout le reste constant.** J'ai pris le plan `00646a00`, et :

1. j'ai **reconstitué les grammes que le modèle a réellement écrits**, en
   divisant chaque boîte par le facteur de sa bouche ;
2. j'ai rejoué `sizeBoxesFromTarget` **sur cette même entrée**, avec trois jeux
   de cibles, en appelant **le vrai code du lot** (`memberTargetFactor` et
   `sizeBoxesFromTarget` importés du module, jamais recopiés) ;
3. j'ai vérifié que le jeu « cibles réelles » **reproduit la base, boîte par
   boîte**. C'est la garde de la reconstitution : sans elle je mesurerais une
   arithmétique inventée.

### 1.2 Le résultat, casserole par casserole

**Les facteurs, calculés sur les corps réels de la base** — Paul :
`sized`, **zéro virgule sept mille deux cent soixante** · Nina : `sized`,
**un virgule un** · Tom : refusé · Lea : refusée.

| Casserole | ① ce que le MODÈLE a écrit | ② cibles RÉELLES | ③ cibles CHANGÉES (Paul 0,1) |
|---|---|---|---|
| Roast chicken thighs | **cinquante** | **cent quarante-huit** | quatre-vingt-quatorze |
| Courgette pepper rice | cinquante | cent soixante-dix-huit | cent sept |
| Tuna pasta salad base | soixante | cent quatre-vingt-six | cent dix-sept |
| Salmon tray with potatoes | cinquante | cent soixante-dix-huit | cent sept |
| Falafel and couscous boxes | cinquante | cent soixante | cent |
| Chickpea vegetable tray | cinquante | cent soixante-sept | cent trois |
| **ÉCART TOTAL** | **trois cent dix** | **mille dix-sept** | **six cent vingt-huit** |

Sur la casserole de poulet, en grammes réellement écrits en base :

* ce que le modèle avait écrit : Paul **deux cent cinquante**, Lea deux cent
  cinquante, Tom deux cent cinquante, Nina **trois cents** ;
* ce que le lot a écrit : Paul **cent quatre-vingt-deux**, Lea deux cent
  cinquante, Tom deux cent cinquante, Nina **trois cent trente**.

⛔ **`sizeBoxesFromTarget` rejoué avec les facteurs réels rend exactement les
vingt-quatre grammages de la base, boîte par boîte.** La ligne écrite dans
`student_generated_meals` **est** le produit de ce calcul : le lot est branché,
armé, et son arithmétique est vérifiable à l'unité depuis la base.

### 1.3 Les trois contrôles négatifs — la porte se ferme aussi

| Scénario | Facteurs rendus | Boîtes dimensionnées | Écart total |
|---|---|---|---|
| **Aucune cible** (la population entière au 18/08) | `no_pace` partout | **zéro sur vingt-quatre** | **trois cent dix** — byte-identique à l'entrée |
| **La doctrine du coach interdit de compter** | `doctrine_no_counting` sur les deux adultes | **zéro** | **trois cent dix** — identique |
| **Seul Paul a une cible** | Paul `sized`, Nina `no_pace` | **six sur vingt-quatre** | mille trois cent soixante-dix-neuf sur les boîtes déjà écrites |

La byte-identité sans cible est **mesurée**, pas déduite : c'est la garde
`anySized`, et elle tient.

### 1.4 🟠 CE QUE LA CONTRE-PREUVE TROUVE AU PASSAGE, ET QUE LE LOT NE DIT PAS

**Le curseur d'une PRISE est saturé, et il l'est très tôt.** Nina rend le facteur
**un virgule un** avec un cran de **zéro virgule quatre** kg/semaine **comme**
avec un cran de **un** kg/semaine — deux crans dans un rapport de un à deux et
demi, **exactement le même grammage**. La cause est légitime et documentée
(`MAX_SURPLUS_FRACTION`, dérivé de Helms 2023, plafonne le surplus à dix pour
cent) et le lot l'assume au §6 de son rapport. **Mais la conséquence produit
n'est écrite nulle part** : pour une prise de masse, **déplacer le curseur ne
change rien aux boîtes** au-delà du premier cran utile. Un utilisateur qui
monte son curseur de zéro virgule quatre à un verra **zéro gramme** de
différence, et rien ne le lui dit.

C'est le scénario **D** de mon banc : cibles Paul zéro virgule cinq / Nina zéro
virgule cinq, et cibles Paul zéro virgule cinq / Nina zéro virgule quatre,
rendent des grammages **rigoureusement identiques**.

⚠️ **Ce n'est pas un défaut du lot**, c'est un défaut de **l'écran qui n'existe
pas encore**. Je le nomme ici pour que celui qui livrera le curseur ne découvre
pas la saturation en production.

### 1.5 ⚠️ Et c'est une FIXTURE, je le redis

Aucun de ces chiffres n'est un chiffre d'usage. Les trois crans lus viennent de
lignes posées à la main dans `household_members` ; **aucun écran n'écrit encore
`target_pace_kg_per_week`**, et `student_goals` en compte **zéro sur
soixante-treize**. Ce que la contre-preuve établit est que **le mécanisme
répond aux cibles**, pas que quiconque en ait une.

---

## 2. C8 — LA CEINTURE PAR BOUCHE. Ce qui est prouvé, et ce qui ne l'est pas.

### 2.1 En base : la boîte du mineur n'a pas bougé d'un gramme

Le foyer `4123e479` « Vidal » porte **Tom, né le quinze septembre deux mille
quatorze — onze ans**, avec `goal = fat_loss`, `target_pace_kg_per_week = zéro
virgule trois` et un corps complet en base (cent quarante-cinq centimètres,
trente-six kilos). **Il a donc une cible, exactement comme son père.**

Ses six boîtes dans le plan `00646a00` : deux cent cinquante, trois cent trente,
trois cent vingt, trois cent trente, deux cent quatre-vingts, trois cents
grammes. **Les six sont rigoureusement celles que le modèle a écrites** — la
reconstitution du §1.2 le montre boîte par boîte, et le compteur le confirme :
`sized: 12` sur vingt-quatre, soit **les six boîtes de Paul et les six de Nina,
aucune de Tom ni de Lea**.

⛔ **Le mineur n'est pas dimensionné, et il porte une cible.** C'est le trou que
C8 nomme, et il est fermé en base.

### 2.2 ⚠️ MAIS la porte qui s'est fermée sur Tom n'est PAS la porte ②

`box_sizing.mouths` du plan `00646a00` dit :
`sized: deux` · `restriction_floor: deux` · **`minor: zéro`**.

Tom et Lea sont refusés par **la porte ①** (le plancher TCA, en *fail-closed* :
une bouche sans compte n'a aucun `MealBodyContext`, donc `restrictionFlag` vaut
`true`), **pas** par la porte ② de l'âge. La porte ② **n'a jamais tourné** sur ce
plan, parce que la porte ① se ferme avant elle sur toute bouche sans compte.

**Le bon résultat sort, mais pas par le mécanisme que C8 décrit.** Si la porte ②
était retirée, le plan `00646a00` serait **rigoureusement identique** — ce qui est
la définition d'une ceinture non exercée en base.

### 2.3 La porte ② elle-même, exercée sur le corps réel de Tom

J'ai donc rejoué `memberTargetFactor` avec **le vrai code**, sur **le vrai corps
de Tom**, en n'ouvrant que la porte ① (`restrictionFlag: false`, ce qu'un mineur
**avec un compte relu** rend — un cas que le produit permet, `departs_with_account`
et les invitations existent) :

| Bouche | Cran | Motif rendu | Facteur |
|---|---|---|---|
| Paul (adulte) | zéro virgule cinq | `sized` | zéro virgule sept mille deux cent soixante |
| Nina (adulte) | zéro virgule quatre | `sized` | un virgule un |
| **Tom (onze ans, compte relu)** | **zéro virgule trois** | **`minor`** | **un, exactement** |
| Lea (huit ans, sans compte) | aucun | `restriction_floor` | un |

**La porte ② rend `minor` et le facteur reste à un.** Les grammages produits sont
identiques à ceux de la base.

### 2.4 M2, rejouée

```
M2   MORD   L8 ① — chaque porte de sécurité ferme le DIMENSIONNEMENT, avec son motif
            ⛔ L8 C8 — L'ENFANT DE DOUZE ANS N'EST PAS DIMENSIONNÉ PARCE QUE SON PARENT EST ADULTE
            L8 ① — le vocabulaire des motifs est FERMÉ et chaque valeur est atteignable
```

La mutation remplace `mouthAgeVerdict(args.ageState)` par
`mouthAgeVerdict("adult")` — c'est-à-dire exactement le défaut d'avant le lot.
**Trois tests rougissent, dont celui qui porte le nom de la clause.** Fichier
restauré, SHA256 revérifié.

### 2.5 🟠 Ce qui n'est donc PAS prouvé

**Aucune ligne de la base ne fait tourner la porte ②.** Pour l'exercer en base il
faudrait un **mineur avec un compte dont l'évaluation de restriction a réussi**,
et il n'en existe aucun dans les fixtures. Je ne l'ai pas fabriqué : créer un
compte `auth.users` pour un enfant sur un dépôt que trois autres lanes partagent
est une écriture dont le coût dépasse ce qu'elle prouverait de plus que le §2.3.

**Conséquence à écrire** : dans le produit d'aujourd'hui, `restriction_floor`
**masque** `minor` pour toute bouche sans compte. Un histogramme de motifs lu de
bonne foi conclurait « nous n'avons aucun mineur », alors que le foyer en a deux.

---

## 3. C9 — LE CONSEIL DU MIDI, ET SON CONTOURNEMENT

### 3.1 ⛔ La première chose à dire : la fonction n'a AUCUN APPELANT

```
grep -rn "eatingOutAdvice" supabase frontend/src
  → household_portions.ts:1992  (la définition)
  → household_portions.ts:2100  (le rendu de phrase)
```

**Aucun autre.** `eatingOutAdvice` n'est appelée nulle part en production.
**Aucun chiffre ne peut donc sortir de nulle part, par construction** — et c'est
le lot lui-même qui le dit (§5.3 de son rapport). La garde C9 est **armée sur une
porte que personne ne franchit encore**. Ce n'est pas un reproche : c'est
l'ordre correct (écrire la garde avant le lecteur). C'est la première ligne de la
réponse à « éprouve le contournement ».

### 3.2 L'état de présence INVENTÉ — les deux portes d'écriture

**Porte ① — celle du maître (`household_members.away_days`).** Écriture directe
d'un `kind` inventé :

```
update public.household_members
   set away_days = '[{"day":"thu","slots":["lunch"],"kind":"chez_mamie"}]'
 where member_id = '<Paul>';
→ ERROR: violates check constraint "household_members_away_days_kind_check"
```

**REFUSÉE en base.** Le vocabulaire y est fermé (`away | eating_out`).

**Porte ② — celle de l'élève (`student_goals.practical_constraints.away_days`).**

```
select conname from pg_constraint
 where conrelid = 'public.student_goals'::regclass
   and pg_get_constraintdef(oid) ilike '%away%';
→ (0 rows)
```

⛔ **AUCUNE contrainte.** L'écriture passe, et je l'ai jouée : la ligne accepte
`{"day":"thu","slots":["lunch"],"kind":"chez_mamie"}` sans broncher (transaction
annulée après mesure). **La porte d'écriture de la présence côté élève n'a pas de
vocabulaire fermé** — ce qui est exactement la prémisse pour laquelle C9.b existe.

### 3.3 Ce que l'état inventé produit — mesuré, sept cas

| Cas | Chiffre rendu | Motif |
|---|---|---|
| A · l'état **dérivé** de l'écriture inventée (`presenceStateFor`) | **AUCUN** | `not_eating_out` |
| B · le `kind` **brut** passé tel quel (le contournement d'un appelant naïf) | **AUCUN** | `unknown_state` |
| C · un **mineur** qui mange dehors, toutes les autres portes ouvertes | **AUCUN** | `mouth_minor` |
| D · un **âge inconnu** qui mange dehors | **AUCUN** | `mouth_age_unknown` |
| E · la bouche n'est **pas le lecteur** | **AUCUN** | `other_mouth` |
| F · l'interrupteur ⑤ du lecteur est **éteint** | **AUCUN** | `target_off` |
| **G ✅ LE CAS QUI PASSE** — adulte, lecteur, dehors, corps connu | **sept cents** | `advised` |

Deux choses, et les deux comptent :

* **`presenceStateFor` neutralise l'invention avant même la garde.** Un `kind`
  hors vocabulaire tombe dans `away`, jamais dans `eating_out` : la dérivation
  rend une valeur d'un ensemble **fermé de trois états**. C'est une seconde
  ceinture, et elle est en amont.
* **La garde C9.b tient quand même le cas où quelqu'un court-circuite cette
  dérivation** (cas B) — c'est-à-dire le seul cas où elle sert, et c'est
  précisément pourquoi `presenceState` est typé `string` et non `PresenceState`.
  L'arbitrage du lot est juste, et il est **mesuré**, pas supposé.
* ⛔ **Le cas qui passe existe** (G, sept cents kcal). Une garde cassée bloque
  tout et ressemble à une garde qui marche ; celle-ci laisse passer le cas
  nominal.

M8 et M9, rejouées : **MORDENT** toutes les deux, sur
`⛔ L8 C9.a — UN MINEUR ET UN ÂGE INCONNU NE REÇOIVENT AUCUN CHIFFRE` et
`⛔ L8 C9.b — UN VOCABULAIRE INCONNU NE REÇOIT AUCUN CHIFFRE, ET AUCUN REPLI`.

### 3.4 🟠 Le défaut que je laisse ouvert, nommé

`student_goals.practical_constraints.away_days` **n'a aucune contrainte de
vocabulaire**, là où `household_members.away_days` en a une. Aujourd'hui c'est
sans conséquence (la dérivation rattrape, et rien n'appelle le conseil). Le jour
où quelqu'un écrira le lecteur du §5.3 en lisant le `kind` brut plutôt que
`presenceStateFor`, ce sera le chemin. **Ce n'est pas au lot L8 de le fermer** —
la table n'est pas la sienne — mais personne ne l'a écrit avant cette ligne.

---

## 4. LES MUTATIONS — neuf rejouées, et **une qui SURVIT**

Harnais du lot (`scratchpad/mutate_l8a.py`), plus trois de moi sur les bornes.

| # | Ce qu'on casse | Verdict | Test qui rougit |
|---|---|---|---|
| **M2** | la porte ② lit le verdict du **maître** | **MORD** | ⛔ L8 C8 — L'ENFANT DE DOUZE ANS… (+ deux autres) |
| **M4** | le plafond du récipient tourne **sans cible** | **MORD** | ⛔ L8 ① — AUCUNE CIBLE ⇒ AUCUN GRAMME NE BOUGE |
| **M8** | C9.a retirée (mineur) | **MORD** | ⛔ L8 C9.a — UN MINEUR… AUCUN CHIFFRE |
| **M9** | C9.b retirée (vocabulaire) | **MORD** | ⛔ L8 C9.b — … AUCUN REPLI |
| **M15** | le module **court-circuite** `canSizeFromTarget` | **MORD** | R6 retourné **+** LE DIMENSIONNEMENT NE LIT NI ④ NI ⑤ |
| **M16** | le plancher d'un gramme retiré | **MORD** | ⛔ UNE BOÎTE NE DESCEND JAMAIS À ZÉRO |
| **M17** (à moi) | `BOX_FACTOR_MIN` **resserré** de zéro virgule sept à zéro virgule soixante-quinze | **MORD** | ⛔ LES BORNES DE PLAUSIBILITÉ NE MORDENT SUR AUCUN CORPS RÉEL |
| **M18** (à moi) | `BOX_FACTOR_MIN` **relâché** à zéro virgule un | **MORD** | ⛔ UNE BOÎTE NE DESCEND JAMAIS À ZÉRO |
| **M19** (à moi) | `BOX_FACTOR_MAX` porté de un virgule vingt-cinq à **quatre-vingt-dix-neuf** | 🔴 **SURVIT** | *(aucun)* |

**Les fichiers sont restaurés à l'octet après chaque mutation** (SHA256
revérifié par le harnais, et `git diff --stat HEAD` vide après la série).

### 4.1 ✅ Le plancher corrigé EST exercé — et par un corps réel de la fixture

**M17 mord**, et la démonstration est plus jolie que le test : **Paul rend un
facteur de zéro virgule sept mille deux cent soixante**. Avec l'ancienne valeur
`0,75`, la seule adulte réelle de la fixture aurait été refusée en
`implausible_factor` et **ses six boîtes n'auraient pas bougé**. La correction
`0,75 → 0,70` n'est pas une précaution théorique : sans elle, le lot serait
désarmé sur le seul corps qui l'exerce en base.

### 4.2 🔴 `BOX_FACTOR_MAX` est une ceinture SANS AUCUN CAS

**M19 survit** : on peut porter le plafond de plausibilité de un virgule
vingt-cinq à quatre-vingt-dix-neuf, **aucun test ne rougit**. Et c'est
structurel : le facteur d'une prise vaut `(E + Δ)/E` avec `Δ ≤ 0,10 × E`
(`MAX_SURPLUS_FRACTION`), donc **il ne peut mathématiquement pas dépasser un
virgule dix**. Le plafond est inatteignable par le chemin nominal.

⚠️ **Ce n'est pas symétrique du plancher**, et c'est ça le défaut : le commentaire
du module calcule explicitement le minimum **structurel** du plancher
(`0,7059`) et affirme ensuite, **pour les deux bornes ensemble**, qu'« elles ne
sont pas dormantes pour autant » — elles mordraient sur un appelant qui
fabriquerait un écart à la main. Le plancher a deux cas qui le prouvent (M17,
M18). **Le plafond n'en a aucun.** C'est la « ceinture armée sur un coffre
vide », quatrième fois nommée sur ce chantier, et cette fois c'est le lot qui
l'écrit.

**Le geste, pour qui le prendra** : un test qui appelle `mouthTargetFactor` avec
un `subject` dont l'écart exécuté dépasse la borne — ou, plus honnête, un
commentaire qui dit que le plafond est **inatteignable aujourd'hui** et sous
quelle condition il cesserait de l'être.

---

## 5. AUCUN BUMP, AUCUNE LIGNE DE PROMPT — prouvé à l'octet

| Épreuve | Résultat |
|---|---|
| Fichiers de prompt / gabarits touchés par les deux commits | **aucun** |
| `boxingOrderLines` (fonction de prompt, la seule dont le voisinage bouge) | **IDENTIQUE À L'OCTET** — le `diff` porte sur le bloc de commentaire L8 inséré **après** sa dernière accolade |
| `buildPortionBrief` (cent quatre-vingt-une lignes) | **IDENTIQUE À L'OCTET** |
| `cookingShapeLines`, `servingDirectionFor`, `readServingDemands`, `dedicatedDishesFor`, `mergeDishBonus`, `distinctServingDirections` | **IDENTIQUES** |
| `SERVING_DIRECTION`, `NEUTRAL_DIRECTION`, `CHILD_DIRECTION`, `SERVING_DEMANDS`, `COOKING_SHAPES` | **IDENTIQUES** |
| Chaînes de douze caractères ou plus **ajoutées** au générateur | **trois** : `"../_shared/keel/energy_gate.ts"`, `"member_id, target_pace_kg_per_week"`, `"user_id, target_pace_kg_per_week"` — **un import et deux listes de colonnes SQL**, aucune ligne de consigne |
| Chaînes **supprimées** | **zéro** |
| Version en base, avant et après le lot | `household.v16_this_kitchen_and_a_meal_out` des **deux** côtés (plan de onze heures trente UTC et plan de quatorze heures quatre UTC) |

**La population qui voit une consigne différente est vide, et c'est mesuré, pas
affirmé.**

### 5.1 Aucune calorie, aucun chiffre de corps dans les plans produits

Sur les six plans de foyer vivants :

| Épreuve | Résultat |
|---|---|
| `kcal\|calorie` dans `preparations` | **faux partout** |
| `kcal\|calorie` dans `dishes` | **faux partout** |
| `kcal\|calorie` dans `generated_from` | **faux partout** |
| phrase de tracker (`il te reste`, `tu as consommé`, `remaining`, `left for today`, `budget restant`, `calories left`) | **faux partout** |
| `box_sizing.mouths` porte-t-il un `member_id` ? | **non** — neuf motifs, neuf entiers, aucun identifiant |

⛔ « Il te reste six cent quatre-vingts » **n'existe nulle part**, et le §5.2 du
lot explique pourquoi c'est une **signature** et pas une discipline : aucune
entrée d'`eatingOutAdvice` ne porte un consommé, donc la phrase n'est **pas
constructible**. Vérifié : la seule sortie chiffrée est `advised`, sept cents,
arrondie aux cinquante.

🕓 *Section 6 (C1→C9 au complet, C3/C6, ce qui reste rouge) en cours.*
