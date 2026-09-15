# LOT D — CE QUE LE GRAMME COUVRE, SUR LA CARTE D'UN PLAT

**Date** 2026-08-19 22h · **Branche** `ff-001-quotidien-du-coach` · **Rien n'est commité.**
Chantier : `scratchpad/2026-08-19-2200-MASTER-PROMPT-GRAMMAGE.md`, section « LOT D ».
Lot indépendant : aucun fichier de `_shared/keel/`, aucune migration, aucun run modèle,
aucune commande `supabase`.

---

## 1. LE DÉFAUT, ET POURQUOI IL N'ÉTAIT PAS UN BUG DE NOMBRE

L'unité de la boîte a changé le matin même : une boîte porte désormais **un REPAS
ENTIER** (le poulet **plus** les légumes **plus** la semoule), et non plus une
casserole. Le changement est écrit dans trois commentaires de code
(`lib/mealBoxes.ts`, `plan/BoxTable.tsx`, `DishCard.tsx`) et dans le prompt du moteur
(`household_portions.ts:1493` : *« one container for that ONE meal, holding everything
that meal takes out »*). **Il n'était écrit nulle part à l'écran.**

Le lecteur voyait, sous un titre de plat :

```
LA BOÎTE
iku et Christèle
en tout 900 g   iku 450 g   Christèle 450 g
```

et a lu « 450 g de poulet ». Le nombre est juste ; la phrase qui le porte ne dit pas
de quoi elle parle.

---

## 2. AVANT / APRÈS — LE TEXTE RENDU

Mesuré en montant `BoxTable` et en lisant son HTML (les deux contextes, même ligne de
données : `total 900`, `iku 450`, `Christèle 450`).

### Contexte `dish` — la carte d'un plat (`DishCard.tsx:301`)

```
AVANT                              APRÈS
Your box                           Your box
iku and Christèle                  One box for the whole meal, not for one ingredient.
total 900 g                        iku and Christèle
iku 450 g                          total 900 g
Christèle 450 g                    iku 450 g
                                   Christèle 450 g
```

En français : « **Une boîte pour tout le repas, pas pour un seul aliment.** »

La ligne est posée **sous le titre de la table et au-dessus des noms** : elle est lue
*avant* le nombre, donc elle cadre la lecture au lieu de la corriger après coup.

### Contexte `session` — la table de la session de cuisine

```
AVANT = APRÈS  (octet pour octet)
Weigh it out
iku and Christèle — Thursday Lunch
Roast chicken, potatoes, courgette and pepper
total 900 g
iku 450 g
Christèle 450 g
```

**Le couvercle complet de la session n'a rien perdu** — repas, contenu, parts, total.
C'est tenu par un test dédié, pas par la lecture du diff.

---

## 3. LES QUATRE ARBITRAGES, ET CE QUI LES A DÉCIDÉS

### ⛔ 3.1 — Aucun « pourquoi », et la garde est double

`member_portions` est lisible par **tout** le foyer : une raison à côté du gramme
divulguerait l'objectif d'un membre à ses colocataires. La mention ajoutée est une
**constante de contenu** : elle ne lit **aucune donnée**, donc elle ne peut
structurellement rien divulguer, et elle est identique pour les deux bouches (aucune
comparaison entre personnes).

⚠️ **La garde existante ne couvrait pas ce cas.** Le test
« ⛔ AUCUN POURQUOI n'entre dans la table » scanne la **source** de `mealBoxes.ts` et
`BoxTable.tsx` (`goal`, `kcal`, `calorie`, `weightKg`, `heightCm`). Or la mention
n'est **pas de la source** : c'est une **valeur** de `en.ts`/`fr.ts`. Une copie
« une boîte pour tout le repas, pour ta prise de masse » serait passée **verte**.
Un second test a été ajouté, qui scanne les deux valeurs traduites contre
`goal / objectif / kcal / calorie / poids / weight / muscle / perte / déficit`.

Aucune calorie, aucun fait corporel : la phrase ne contient aucun nombre.

### ⚠️ 3.2 — Elle **n'énumère pas** le contenu, et c'est mesuré

Le prompt du chantier suggérait « tout le repas : poulet rôti + légumes rôtis +
semoule ». La matière existe : `boxContents(dish, preparations)` est **déjà écrite**
dans `lib/mealBoxes.ts`. **Elle n'a aucun appelant, et je ne l'ai pas branchée**, pour
deux raisons vérifiées sur le disque :

1. **Les titres de préparations n'atteignent pas `/app/today`.** `DishCard` ne les
   reçoit que par la prop `sources`, résolue par l'appelant.
   `plan/PlanDayBlock.tsx:232` la passe ; **`pages/TodayPage.tsx:313` et `:344` ne la
   passent pas** (`sources` y vaut son défaut `[]`). Une énumération serait donc
   présente sur `/app/plan` et **absente sur `/app/today` — l'écran où l'on OUVRE la
   boîte**. Deux rendus divergents sur la phrase même qui désambiguïse un nombre est
   pire que pas de phrase (c'est le mode de défaillance que `DishCard.tsx` nomme en
   tête de fichier : « deux rendus du même objet finissent par diverger »).
2. **Elle contredirait le titre du plat, trois centimètres au-dessus.** La carte est
   déjà titrée « Poulet, pommes de terre, courgette et poivron » ; les titres de
   casseroles disent autre chose (« Poulet rôti », « Légumes d'été rôtis »). Deux
   énumérations du même repas qui ne coïncident pas.

Un test tient cette décision : la valeur de copie ne doit contenir **aucun trou
`{…}`** — elle mord le jour où quelqu'un la câble sur une donnée.

### ⚠️ 3.3 — Contexte `dish` seulement

La table de session liste des contenants **loin** des plats, et chacune de ses lignes
porte déjà le titre du plat comme « ce qu'il y a dedans » (`line.dish`). La même
phrase y serait répétée sous chacun des six repas d'une session. Le contexte
`session` est donc **inchangé**, et un test l'épingle dans les deux sens (la mention
n'y entre pas ; le couvercle complet y est toujours).

### ⚠️ 3.4 — 320 px

Le `<p>` est un enfant **bloc** du conteneur de la carte, pas un enfant de flex : la
cicatrice `min-width: auto` du dépôt ne s'applique pas ici. `break-words` est posé
(idiome 320 px du dépôt, `dishCardSameDay.int.test.ts:141`) parce que la phrase est
**traduisible** même si elle est constante aujourd'hui, et `max-w-[46ch]` la borne sur
écran large. Un test vérifie la classe **sur le rendu** et borne à **24 caractères**
(littéral, pas une constante importée) le plus long mot des deux packs — mot le plus
long aujourd'hui : `ingredient.` (11) et `aliment.` (8).

⚠️ **Non vérifié dans un navigateur réel** : voir §6.

---

## 4. CE QUI A ÉTÉ TOUCHÉ

| Fichier | Nature |
|---|---|
| `frontend/src/keel/components/plan/BoxTable.tsx` | la ligne, en contexte `dish` seulement |
| `frontend/src/keel/components/DishCard.tsx` | **commentaire seulement** — le bloc « LA BOÎTE DE CE REPAS » est complété, pas contredit : « un repas a UN contenant, tout dedans » y était écrit *pour le développeur*, la ligne l'écrit *pour le lecteur* |
| `frontend/src/keel/i18n/en.ts` | `meals.boxes.covers_dish` (+ la note du pourquoi) |
| `frontend/src/keel/i18n/fr.ts` | `meals.boxes.covers_dish` |
| `frontend/src/keel/components/mealBoxes.int.test.ts` | 1 test **retourné**, 5 tests neufs, 2 assertions ajoutées |

⛔ **Aucun autre fichier.** `lib/mealBoxes.ts` n'est pas modifié : aucun champ neuf,
aucune prop neuve, aucune signature touchée — donc aucun appelant à mettre à jour, et
aucune occasion de fabriquer une garde optionnelle.

### Le test retourné, et pourquoi il l'est

`« ⛔ contexte dish: les prénoms et les grammes, rien d'autre »` épinglait littéralement
l'ancien rendu. **Il n'a pas été supprimé** : il est renommé
`« ⛔ contexte dish: pas d'écho du repas — et ce que le gramme couvre »`, ses quatre
assertions d'origine sont **conservées** (pas d'écho du repas, pas d'écho du plat,
titre `title_dish`, pas de titre `title`), et le pourquoi du retournement est écrit
**dans le test** : le « rien d'autre » visait les **échos** — le repas et le plat, déjà
écrits plus haut sur la même carte — et n'a jamais voulu dire « aucune phrase » ; une
carte muette sur son unité n'était pas plus lisible, elle l'était moins.

---

## 5. LA VÉRIFICATION — FAITE ICI, PAS DÉLÉGUÉE

Aucune variable `SUPABASE_*` exportée (les commandes tournent sous `env -u`).

```
npx tsc -b --force frontend/tsconfig.app.json     →  0 erreur
npx vitest run src/keel/components/mealBoxes.int.test.ts   →  33/33
npx vitest run src/keel/i18n + src/keel/components         →  329/329 (24 fichiers)
npx vitest run (suite front entière)                       →  1740 passés, 4 échecs
```

**Les 4 échecs sont antérieurs et étrangers au lot** (vérifié : ils ne touchent aucun
fichier de ce lot, et les deux fichiers concernés étaient déjà modifiés dans l'arbre au
début de la session par d'autres lanes) :

- `src/edge/coverage-guard.int.test.ts` ×2 — fonctions edge / triggers non déclarés ;
- `src/keel/api/household.int.test.ts` ×2 — `awayFrom` rend un champ `kind` que le
  test n'attend pas encore.

### La contre-épreuve — deux mutations, deux rouges

| Mutation | Attendu | Mesuré |
|---|---|---|
| Retirer le `<p>` du rendu de `BoxTable` | rouge | **2 tests rouges** (`… sur la vraie carte`, `… ce que le gramme couvre`) |
| Retirer `break-words` de la classe | rouge | **1 test rouge** (`⚠️ 320 PX`) |

Les deux fichiers ont été restaurés depuis une copie **hors du dépôt**
(`scratchpad/` de session, jamais `git stash` : ce dépôt porte le travail non commité
de plusieurs sessions).

Et le test de langue est paramétré **à la fois** par la constante (`en[…]`, pour que la
présence soit vérifiée sur le rendu) **et** par un littéral (`"whole meal"`, pour que
la reformulation qui retirerait l'affirmation de contenu morde) — sans le second,
réécrire la copie en « iku 450 g » laisserait le test vert.

---

## 6. CE QUI RESTE OUVERT — NOMMÉ

1. **Aucune vérification dans un navigateur réel à 320 px.** Le rendu a été mesuré sur
   le HTML produit (classes présentes, mot le plus long borné, `<p>` bloc et non enfant
   de flex), pas sur des pixels. Atteindre l'écran réel demande une session
   authentifiée sur un foyer avec un plan portant des boîtes ; un serveur de dev
   d'une **autre session** tourne déjà dans ce dossier, et en démarrer un second
   risquait un conflit de port avec une lane voisine. **À rejouer par le vérificateur
   du lot D sur `/app/plan` et `/app/today`, en 320 px.**
2. **`boxContents()` reste sans appelant** dans `lib/mealBoxes.ts`. Elle est morte
   depuis sa naissance (le fichier entier est neuf et non commité), et §3.2 explique
   pourquoi je ne l'ai pas branchée. **Ce n'est pas un reliquat à supprimer par
   propreté** : le jour où `TodayPage` passera `sources`, elle est le bon opérateur.
   Si personne ne la branche, c'est elle qu'il faut retirer, pas la mention.
3. **`/app/today` ne passe pas `sources` à `DishCard`.** Conséquence **déjà visible et
   hors lot D** : la ligne « From Roast chicken — cooked on Monday » n'apparaît pas sur
   l'écran du jour. C'est un défaut à part entière, et il est ce qui a décidé §3.2.
4. **La session de cuisine ne dit toujours pas l'unité en toutes lettres.** Elle la dit
   par la **forme** (une ligne = un contenant = un repas, chacune titrée par son repas
   et son plat), ce qui suffisait avant ce lot et n'a pas été mesuré comme un défaut.
   Si le vérificateur constate la même erreur de lecture là-bas, la réparation est une
   **seconde clé** au pluriel (« une boîte par repas »), pas la même phrase répétée
   sous chaque ligne.
5. **La mention est invariante.** Elle dit « tout le repas » y compris pour un repas
   qui ne tire que d'une seule casserole. C'est vrai (une boîte = un repas), mais
   moins informatif dans ce cas-là. Non traité : le rendre conditionnel demanderait
   `uses` côté composant, donc le point 3.

---

## 7. I18N — LA MENTION EXPLICITE DEMANDÉE

- **Deux fichiers de traduction modifiés, sur le disque, NON COMMITÉS** :
  `frontend/src/keel/i18n/en.ts` et `frontend/src/keel/i18n/fr.ts`. Une clé chacun,
  `meals.boxes.covers_dish`.
- ⚠️ **Correctif à la note de mémoire du dépôt** : « la couche i18n n'est pas
  commitée / `fr.ts` absent de `HEAD` » est **faux sur cette branche**.
  `git ls-tree HEAD frontend/src/keel/i18n/` montre `en.ts` **et** `fr.ts` **suivis**.
  Les deux sont simplement **modifiés** dans l'arbre de travail (`M`), par ce lot et
  par d'autres lanes en parallèle. Qui commitera cette branche emportera donc aussi
  les modifications i18n des autres sessions : **relire le diff de ces deux fichiers
  avant tout `git add`.**
- **Parité vérifiée** : `src/keel/i18n/parity.int.test.ts` passe (6/6). La clé porte
  **zéro trou d'interpolation** dans les deux packs, et les deux valeurs sont
  **différentes** (elle n'est pas dans la liste `legitimatelyIdentical`, et un test du
  lot le vérifie explicitement).
- `meals` est bien dans `TRANSLATED_NAMESPACES` (`i18n/catalog.ts`) : une clé anglaise
  sans français y ferait lever `t()` en DEV.

---

## 8. CE QUE CE LOT NE FAIT PAS

Rien du LOT 0, 1, 2 ni 3. Aucun facteur, aucune borne, aucun compteur, aucun prompt,
aucune migration, aucun `energy_dense`, aucune calorie nulle part. Le nombre affiché
est **exactement** celui d'avant : ce lot répare la **phrase qui le porte**.
