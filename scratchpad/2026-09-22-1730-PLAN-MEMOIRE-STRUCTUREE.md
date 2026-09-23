# Plan — que la mémoire soit STRUCTURÉE, et pas seulement fidèle

> Écrit le 2026-09-22, après avoir mesuré la mémoire réelle du seul compte qui en a une.
> Rien de ce plan n'est commencé. Les lots sont ordonnés : chacun rend le suivant mesurable.

---

## Le constat, chiffré

> ### ⚠️ CORRIGÉ LE 2026-09-22 — la première version de ce constat était FAUSSE
> Elle disait **4/9** et « `les œufs` ne résout rien ». Les deux venaient d'une sonde SQL
> qui comparait des chaînes brutes aux colonnes `slug` / `alias` — ce que
> `resolveIngredient` **ne fait pas** : il dépose l'article, replie la ligature `œ`, essaie
> plusieurs formes candidates, et consulte les faux amis. Mesuré avec le VRAI résolveur
> contre le VRAI référentiel (945 slugs, 2 739 alias, 4 faux amis), le résultat est
> **5/9**, et `les œufs` résout.

**9 souvenirs durables en base. 5 résolvent, 4 non.**

| texte retenu | résout vers |
|---|---|
| `fruit` | `fruit` ✓ |
| `flocons d'avoines` *(pluriel)* | `oats` ✓ |
| `lait d'avoine` | `oat_milk` ✓ |
| `graines` | `mixed_seeds` ✓ |
| `amendes` *(la faute)* | `almonds` ✓ |
| `lesoeufs` | ⛔ rien |
| `bol de muesli` | ⛔ rien |
| `petit suisse` | ⛔ rien |
| `tofu, poissons au petit déjeuné` | ⛔ rien *(le composite, fermé la veille)* |

**Les quatre échecs ne sont pas de la même nature, et c'est ça qui décide de la réponse :**

- **`lesoeufs` — une FAUTE.** `les œufs` **et** `oeufs` résolvent tous deux vers
  `whole_eggs` : seule la faute bloque. La consigne d'orthographe ferme ce cas.
- **`bol de muesli` — un MOT DE CONTENANT.** `muesli` résout vers `granola` ; « bol de »
  suffit à tout perdre. La consigne peut fermer ce cas aussi (demander l'aliment, pas la
  phrase qui l'entoure).
- **`petit suisse` — une VRAIE ABSENCE.** Ni `petit suisse` ni `petit-suisse` ne sont dans
  les 945 slugs. **Aucune consigne n'y peut rien.** Et le produit le sait déjà : le sas
  `food_composition_pending_aliases` porte `petit suisse nature` et
  `fromage frais type petit suisse`, vus par la chaîne de composition. La mémoire n'y passe
  jamais.
- Le composite est fermé depuis le 2026-09-21.

### Ce que ça change pour la réponse

La consigne de prompt **sert** — elle ferme deux des trois cas vivants. Ce qu'elle ne peut
pas faire, c'est **le prouver** : le modèle n'a ni les 945 slugs ni les 2 739 alias en tête,
et il écrira toujours des formes plausibles dont certaines ne résolvent pas. Rien, dans le
produit, ne distingue aujourd'hui un souvenir qui agit d'un souvenir décoratif.

**Et la cause profonde tient toujours :** le champ `text` sert à DEUX choses incompatibles —
la ligne que la personne LIT sur sa carte (ses mots, sa langue, sa faute) et la clé que la
machine CHERCHE dans les plats. Un seul champ pour les deux en rend toujours un faux.

## Lot A — un souvenir porte SA CLÉ, à côté de ses mots

**Ce qu'il ferme :** 5 souvenirs sur 9 ne peuvent ni mordre ni être vérifiés. Un souvenir
qui ne résout pas est un souvenir décoratif : il s'affiche, il ne fait rien.

**La forme.** `food.exclude` / `food.prefer` / `method.*` gagnent un champ, à côté de
`text` (qui ne bouge pas — c'est la ligne de la carte, ses mots) :

```
ref: string | null   ⟵ le slug du référentiel, ou null quand rien ne résout
```

**⛔ La résolution n'est PAS faite par le modèle.** Elle est déterministe, elle existe déjà
(`resolveIngredient`, `food_composition.ts`), et elle a sa doctrine écrite : égalité exacte
d'abord, alias ensuite, faux amis nommés un par un, **aucune distance d'édition**. On
l'appelle après la classification, on ne la réinvente pas.

**Les lecteurs changent, dans cet ordre :**
1. `exclusionTermsFor` cherche **le slug** quand il existe, et retombe sur les mots quand
   il n'existe pas. La ceinture cesse d'être un jeu de mots-clés sur de la prose.
2. `retained_honoured` compare **slug à slug** avec ce que le plan a servi. Aujourd'hui il
   compare un texte libre à des termes libres.
3. La carte continue d'afficher `text`. Rien ne change pour la personne.

**Ce qui ne résout pas ne se perd pas et ne se devine pas :** la forme part dans le sas
`food_composition_pending_aliases` (`form_source: 'memory'`), qui existe et a déjà 12
lignes. `petit suisse` y est déjà. C'est comme ça que le référentiel apprend.

**Compteurs obligatoires :** `ref_resolved` / `ref_unresolved` par écriture, et le taux par
foyer. Sans eux, « la mémoire résout » est une affirmation.

**Mesure de fin de lot :** rejouer les 9 souvenirs réels. Cible — **8/9** résolus
(`petit suisse` reste au sas tant que personne ne l'ajoute), contre **5/9** aujourd'hui.

**Risque :** un faux positif de résolution attache un souvenir au mauvais aliment, et la
ceinture retire alors le mauvais plat. C'est exactement la cicatrice « laitue ≠ lait ».
→ On n'utilise **que** `resolveIngredient`, qui est une égalité de clé, jamais une
ressemblance. Et le corpus reçoit une colonne `ref` attendue, avec les faux amis connus
(`prune`, `raisin`, `complet`) en cas d'épingle.

---

## Lot B — ce qu'on garde et ce qu'on jette

**Ce qu'il ferme :** une phrase a produit **4 `food.prefer` d'un coup**, dont `graines`
(une catégorie, pas un aliment) et `amendes` (une faute qui est aussi un vrai mot français).
Le magasin grossit de tout ce que le modèle sait découper, sans que personne ne demande si
ça valait d'être gardé.

Trois gardes, dans l'ordre de leur valeur :

1. **Un souvenir sans destination ne s'écrit pas.** Une entrée dont ni le slug ni les mots
   n'ont de sens pour un plan (`graines`, `des choses`, `etc.`) part en `skipped`, avec son
   motif compté — pas en préférence.
2. **Un plafond par note, nommé et compté.** Une phrase qui produirait plus de N souvenirs
   dit qu'on a mal lu, pas qu'on a beaucoup appris. Le refus se COMPTE (`over_cap`).
3. **La consigne d'orthographe est retirée du prompt** — elle est fausse (voir plus haut),
   et le lot A la remplace par la résolution.

**Mesure :** sur le corpus de 50 notes, le nombre de souvenirs produits par note, avant et
après. Et sur la note réelle du 22 : 5 souvenirs aujourd'hui, combien après ?

---

## Lot C — le vieillissement

**Ce qu'il ferme :** la supersession (livrée le 22) retire sur **contradiction**. Rien ne
retire sur **âge**. Un `food.exclude` de mars est encore vrai en septembre tant que personne
ne le dément — et personne ne dément jamais ce qu'il a oublié avoir dit.

**⛔ Et ce n'est PAS une expiration automatique.** Retirer un souvenir parce qu'il est vieux
effacerait « mon fils n'aime pas le poisson », qui n'a pas de date de péremption. La
distinction est entre une préférence (permanente jusqu'à démenti) et une **circonstance**
(« pas de tartiflette, on est début septembre »), et le produit n'a aujourd'hui aucune
famille pour la seconde — c'est pour ça que « pas de tartiflette » devient un bannissement
définitif.

**Deux options à trancher, et c'est une décision produit :**
- **(a)** une `season` / `until` sur les familles d'aliments, écrite seulement quand la
  phrase la porte (« en ce moment », « cette saison ») ;
- **(b)** rien de neuf, et la carte demande confirmation d'un souvenir qui n'a rien produit
  depuis N plans (`retained_honoured` donne enfin ce compte).

**(b) est moins cher et plus honnête** : elle ne devine rien, elle demande. Elle dépend du
lot A pour que le compte soit juste.

---

## Lot D — le magasin du foyer

**Ce qu'il ferme :** un souvenir `subject: household` est rangé dans
`student_goals.practical_constraints` de **la personne qui compose**. Deux comptes du même
foyer auraient deux mémoires de maison séparées.

**⚠️ Ça ne mord pas aujourd'hui** — ton foyer n'a qu'un compte. Et le code nomme déjà le
trou, en le classant décision produit : *qui parle pour la maison quand deux titulaires
demandent des choses opposées ?*

**Donc : à trancher avant d'écrire, pas après.** Le déplacement technique (une table
`household_retained_items`, ou une clé sur le foyer) est mécanique ; la règle d'arbitrage ne
l'est pas. Ce lot est **le dernier**, et il est bloqué sur une réponse, pas sur du code.

---

## Ce que je ne ferais pas

- **Un matcher maison** pour rapprocher `lesoeufs` de `oeufs`. 12 faux positifs sur 12
  mesurés. La résolution passe par une égalité de clé ou elle ne passe pas.
- **Compter sur le modèle pour PROUVER la normalisation.** Il n'a pas le référentiel. Sa
  consigne aide (elle ferme `lesoeufs` et `bol de muesli`) ; c'est la résolution
  déterministe qui tranche, et le compteur qui le dit.
- **Une expiration par l'âge** (voir lot C).
- **Ouvrir le questionnaire** avant que le chemin de la note soit propre : 37 lignes en
  base, **0 venant d'un compte réel**. Deux producteurs à moitié justes valent moins qu'un
  producteur juste.

## L'ordre, et pourquoi

**A → B → C → D.**
A rend tout le reste mesurable : sans slug, « est-ce que ce souvenir a servi à quelque
chose ? » n'a pas de réponse exacte, et B comme C se décideraient au jugé.
D est dernier parce qu'il attend une décision, pas du code.
