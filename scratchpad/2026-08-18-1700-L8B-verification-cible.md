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

🕓 *Sections 2 et suivantes en cours d'écriture.*
