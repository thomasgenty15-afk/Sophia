# FF-061 — Le compte-rendu de la demande · rapport

> **État : lots 1 et 2 livrés et verts, lots 3 et 4 non faits. Rien n'est
> commité** — le gate refuse pour deux rouges qui ne sont pas de ce lot (§6).

Le chantier ferme un trou simple : les envies entrent dans le prompt depuis
toujours (`what they feel like eating THIS TIME`) et **aucun champ de sortie ne
dit ce qui en a été fait**. On demande à quelqu'un ce dont il a envie, puis on
lui rend un plan muet là-dessus.

---

## 1. Lot par lot

| Lot | État | Preuve |
|---|---|---|
| **1 · `request_report.ts`** | ✅ livré | 30 tests verts |
| **2 · les quatre portes + `findGuiltTripping`** | ✅ livré | 19 tests verts, mesure de faux positifs |
| **3 · la surface** | ❌ non fait | — |
| **4 · la fiche FF-061** | ❌ non fait | — |

**49 tests**, tous verts. Suite keel complète : 2780 passants au dernier run
propre.

### Lot 1 — le module pur

Le compte-rendu est un **diff déterministe** : on sait ce qui a été demandé, on
sait ce que le plan contient, le rapprochement se calcule. **Aucun champ n'est
demandé au modèle, aucun appel supplémentaire n'est fait.** V2 fermée, sans
crochet.

Quatre statuts, et `unreadable` porte tout le poids : une prose qu'on ne sait
pas lire ne devient **jamais** `absent`. Annoncer un refus qu'on n'a pas fait
est indémentable pour qui lit son plan.

Le rapprochement passe **exclusivement** par `findForbiddenMatches`. Le test
« laitue » / « lait » est celui qui justifie ce choix — 12 faux positifs sur 12
avec un `includes()`.

### Lot 2 — les portes

Ordre respecté, motifs nommés. **La porte 1 se prouve par l'absence de chemin** :
sous `restriction_flag` on retourne AVANT tout assemblage, donc il n'y a pas de
texte à filtrer et aucune porte suivante ne peut en produire.

Aucun paramètre optionnel : la fonction **jette** si `restrictionFlag` manque,
parce que `false` veut dire « cette personne n'est pas protégée » — une
affirmation, pas un défaut.

---

## 2. La table de vérité des quatre portes

| Porte | Où elle vit | Ce qui tombe | Motif |
|---|---|---|---|
| 1 · plancher TCA | `gateRequestReport`, **avant** l'assemblage | tout | `restriction_floor` |
| 2 · règles de maison | `reportOnRequest`, à la naissance des termes | le terme, quel que soit son statut réel | *(jamais nommé — le terme n'existe pas)* |
| 3 · doctrine du coach | `gateRequestReport`, ligne par ligne | la ligne seule | `doctrine_lock` si tout tombe |
| 4 · anti-culpabilisation | `gateRequestReport`, sur le bloc assemblé | tout, + trace `console.error` | `guilt_tripping` |

**La porte 2 vit chez les faits, pas chez le texte.** Un terme couvert par une
règle de maison n'entre jamais dans la sortie : aucun chemin ne peut le faire
réapparaître. Filtrer en sortie aurait laissé un second lecteur la contourner.

**La porte 3 est ligne par ligne, la porte 4 est globale**, et c'est délibéré :
une détection de culpabilisation dans nos propres gabarits est un DÉFAUT (ils
sont fixes et testés), pas une ligne à retirer.

### Le test extra-hard

> Élève sous `restriction_flag` **+** demande entièrement honorée **+** doctrine
> qui autorise tout ⇒ **rien**, dans les deux langues.

✅ Vert en test, **et prouvé en génération réelle** (scénario 5) :

```
termes : burgers=served · pizzas=served
refus  : restriction_floor
▸ (aucune ligne)
```

Les faits existaient, il n'y avait que des bonnes nouvelles — rien n'est sorti.

### Le cas Nutella, rejoué

✅ Un terme couvert par une règle de maison disparaît de la sortie **même quand
il est servi**. Sinon la seule présence d'une ligne serait déjà une information.

---

## 3. `findGuiltTripping` — la mesure avant de brancher

```
`why` déjà en base : 1116
déclenchements     : 0   (0,00 %)
```

**Décision : branché**, sur le `why` de chaque plat — le seul champ de prose
libre du plan sans ceinture de ton. Le trou du §1.3 est refermé.

**La phrase est effacée, le plat est gardé.** Rejeter le plat ferait perdre un
dîner pour une tournure, et un générateur qui retire des repas pour un mot est
un générateur qu'on désarme dans la semaine. Même geste que
`household_restriction_lock.ts`.

Confirmé en réel : **6 générations, 54 plats, 0 `why` effacé.**

---

## 4. Les décisions prises seul

### 4.1 L'assemblage du texte est **backend**, pas frontend

Le brief prévoyait un miroir du module pur côté écran. **Rejeté** : les portes 3
et 4 s'appliquent au TEXTE, donc les dupliquer côté front était la seule façon
de les faire tourner là-bas — et **une garde en double diverge**, c'est la
cicatrice la plus chère du dépôt.

Le backend connaît `content_locale`, assemble, garde, et rend des phrases
finies. L'écran les affiche, il ne les décide pas. Le patron existe déjà :
`activity_floor.ts`.

**Conséquence sur le lot 3** : il se réduit à afficher un tableau de chaînes.

### 4.2 `served_reduced` — la moitié calculable, et seulement elle

**Retenu** : dans le TITRE ⇒ `served` (le plat EST la chose) ; seulement dans
les ingrédients ou la méthode ⇒ `served_reduced` (il y en a, mais ce n'était pas
le plat).

**Rejeté** : « sur moins de créneaux que demandé ». Il faudrait lire un nombre
dans la prose (« des burgers deux fois ») ; on ne sait pas le faire de façon
fiable, et un statut qu'on ne sait pas calculer est pire qu'un statut absent.

### 4.3 Le seuil d'`unreadable`

Trois règles, toutes fermées et documentées : moins de 3 caractères, plus de 4
mots, ou un fragment entièrement fait de mots vides. Plus les deux règles nées
du réel (§5).

### 4.4 Où le bloc s'affiche

**Non tranché** — le lot 3 n'est pas fait.

---

## 5. Ce que le run réel a trouvé, et que 49 tests inventés n'avaient pas vu

Deux passes : rejeu sur les `preferences` déjà en base, puis 6 générations
réelles (vraie consigne, vrai modèle, vrai parseur, chaîne complète).

### 5.1 Un refus ne s'annonce que sur un MOT, jamais sur une phrase

Le champ `preferences` **ne contient pas que des envies**. Une ligne réelle
porte une description d'objectif :

```
« Building muscle. Eats a heavy evening plate with a full meat portion and a generous starch. »
   ▸ You asked for full meat portion: there isn't any this time.
   ▸ You asked for generous starch: there isn't any this time.
```

**Deux refus annoncés qui n'ont jamais eu lieu.** Les gardes de longueur et de
mots vides ne l'attrapaient pas : « full meat portion » fait trois mots et n'en
contient aucun de vide.

**L'asymétrie qui tranche** : une CORRESPONDANCE est une preuve — le terme est
là, on peut le dire quel que soit le nombre de mots. Une NON-correspondance sur
une phrase est une IGNORANCE.

⚠️ **Piste rejetée, et mesurée** : filtrer sur les aliments connus de
`food_composition_refs`. Il ne connaît **ni burger, ni pizza, ni sushi, ni
tacos** — exactement les envies pour lesquelles cette fonctionnalité existe.

### 5.2 Une demande NIÉE n'est pas une demande

```
« des trucs rapides, mais pas de poisson »
   ▸ Tu as demandé trucs rapides : il n'y en a pas cette fois.
   ▸ Tu as demandé mais pas de poisson : il n'y en a pas cette fois.
```

Le second dit **le contraire** de ce qui a été écrit. Une liste fermée de
négations EN+FR rejette désormais ces fragments.

⚠️ On ne réutilise **pas** la liste de `forbidden_matcher.ts` : la sienne
blanchit une mention DANS un texte analysé, celle-ci juge une DEMANDE. Deux
questions différentes, deux listes — les coupler ferait qu'un assouplissement de
l'une déplace l'autre en silence.

### 5.3 L'avant / après — deux campagnes complètes

**Passe A**, les 6 `preferences` réelles rejouées :

| | refus inventés | vrai signal conservé |
|---|---|---|
| avant | 3 | oui |
| après | **0** | oui (`carrots=served`) |

**Passe B**, 6 générations réelles, avant et après correctif :

| scénario | avant | après |
|---|---|---|
| 1 · FR nominal | 2 oui + 1 non | **inchangé** — les correctifs n'ont rien serré |
| 2 · EN nominal | `fruit=absent` | `fruit=**served_reduced**` — « it's there Tuesday, inside a dish » |
| 3 · négation | **2 refus inventés**, dont un qui disait le contraire | `(aucun)` · 2 illisibles · **aucune ligne** |
| 4 · prose floue | aucune ligne | inchangé |
| 5 · plancher TCA | `restriction_floor`, rien | inchangé |
| 6 · doctrine | la ligne « burgers » tombe seule | inchangé |

Le scénario 1 est la contre-épreuve qui compte : si les deux correctifs avaient
trop serré, c'est là qu'un `burgers=served` aurait disparu. Le silence n'a pas
été acheté en tuant la fonctionnalité.

Le scénario 2 montre `served_reduced` en conditions réelles pour la première
fois — le mot est dans un ingrédient, aucun plat ne s'intitule ainsi, et la
phrase le dit exactement.

**`why` : 54 plats sur les 6 générations, 0 effacé pour ton.** La ceinture
branchée au lot 2 ne casse rien.

---

## 6. 🔴 Le blocage qui dépasse ce chantier

```
content_locale = 'fr-FR'   →   titres : « Afternoon apple », « Chicken, brown rice and broccoli plate »
```

**`buildMealPrompt` ne dit jamais au modèle dans quelle langue écrire.** Zéro
occurrence de `locale` ou `language` dans `meal_generation.ts`. `content_locale`
est lu sur `student_goals` (`generate-meal-v1:505`), écrit sur la ligne du plan
(`:1553`), et **rien ne l'applique**. Les 6 plans marqués `fr-FR` en base sont en
anglais.

Pour FF-061 c'est **éliminatoire sur le cas nominal français**, et c'est
reproduit à l'identique dans **deux campagnes indépendantes** :

| run | envie | ce que le plan contenait | ce que le compte-rendu a dit |
|---|---|---|---|
| 1 | « du poisson » | *Lemon cod*, *Cod taco salad* | « il n'y en a pas cette fois » |
| 2 | « du poisson » | *Lemon fish couscous bowl*, *Cold lemon fish and cabbage wrap* | « il n'y en a pas cette fois » |

Au second run le mot *fish* est là **deux fois, en toutes lettres**. Ce n'est
donc pas de la variance de modèle ni un problème de vocabulaire : c'est la
frontière de langue, et elle produit exactement le défaut que tout ce module
existe pour empêcher.

**Non corrigé, et la raison a changé en cours de route.** D'abord parce que
c'est le prompt de tous les plans de tous les utilisateurs, hors périmètre du
brief. Puis, quand la correction a été autorisée, parce qu'une **autre session
écrivait dans `meal_generation.ts` à la minute même** (mtime 23:05:49, mesuré à
23:07:57) — et l'arbre de travail est PARTAGÉ : il n'y a pas de merge, le
dernier qui écrit écrase l'autre. Un changement de signature sur 47 sites
d'appel dans un fichier ouvert par quelqu'un d'autre détruit son travail.

### Le correctif, prêt à poser dès que la lane est calme

**1. `buildMealPrompt` gagne `contentLocale: string` — REQUIS, jamais `?`.**
Sept fois dans ce fichier un paramètre de garde optionnel a été une garde
désarmée ; la huitième serait celle-ci. Le repli sur une locale inconnue est
l'anglais, ce qui reproduit EXACTEMENT le comportement d'aujourd'hui — c'est la
condition de désarmement, et elle se teste.

**2. Un bloc de prompt, à forte saillance :**

```
== THE LANGUAGE ==

Write EVERY word the student reads in {LANGUAGE}: dish titles, methods, the
"why", the shopping list, and the prose of every quantity.

The JSON FIELD NAMES stay in English. They are the contract, not the text.
```

⚠️ La seconde phrase n'est pas du zèle : sans elle, un modèle à qui on demande
d'écrire en français traduit aussi ses clés, et le parseur ne reconnaît plus
rien.

**3. `MEAL_PROMPT_VERSION`** passe de `meal.en.v9_cooking_shape` à une version
qui ne prétend plus `en` — le préfixe de langue y est **faux depuis toujours**
pour les élèves francophones.

**4. Les 47 sites d'appel** (12 fichiers, dont 45 en test) prennent le
paramètre. ⚠️ `household_merge_test.ts` (8 appels) et `household_presence.ts`
appartiennent à une autre lane : à faire quand elle a rendu la main.

**5. La preuve** : un run réel avec `content_locale = 'fr-FR'`, et des titres de
plats en français. C'est le seul test qui vaut ici — la consigne est dans le
prompt, et une consigne de prompt régresse en réel (§1.4 du brief).

---

## 7. Ce que je n'ai pas pu vérifier

- **Aucun câblage de production.** `reportOnRequest` et `gateRequestReport`
  n'ont **aucun appelant** dans `generate-meal-v1`. Tout ce qui précède est
  prouvé par harnais, pas par le produit.
- **Aucune vérification navigateur**, aucune capture : le lot 3 n'existe pas.
- **Le rappel de §2.5** (« un absent se dit une fois ») est testé sur le module,
  mais **rien ne dérive l'état du plan précédent** — c'est le travail du câblage.
- **La suite keel est intermittente** pendant qu'un autre agent écrit dans
  `_shared/keel/` : 3 rouges, puis 0, puis 1, puis 0 sur des runs consécutifs.
  Mes 49 tests passent systématiquement.

---

## 8. Les rouges qui ne sont pas de ce lot

Le gate de commit les refuse, et la règle 7 du brief dit de les **consigner, pas
de les réparer** :

1. `mergeDishBonus` appelé avec 3 arguments pour une signature à 1 —
   `household_merge_test.ts:1414-1416`, `meal_generation.ts:886` ;
2. `MealPrepPage.tsx:438-444` référence des clés i18n `mealprep.fig.moves.*`
   absentes du catalogue.

**Aucune commande à risque n'est nécessaire** pour ce lot : aucune migration,
aucun secret, aucun déploiement.

---

## 9. Ce qui reste

1. **Le câblage** dans `generate-meal-v1` — sans lui, rien de tout ça ne tourne.
2. **Le lot 3** (la surface) et le **lot 4** (la fiche `FF-061`, identifiant
   vérifié libre : le dernier pris est FF-060).
3. **La langue du plan** (§6), qui commande la livraison en français.
