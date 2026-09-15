# RAPPORT — la mémoire à trois destinations

**Chantier** : deux sources, trois destinations, un encart, et la sécurité en dehors.
**Branche** `ff-001-quotidien-du-coach` · **cinq lots** (0, A, B, C, D) + une campagne de
cinq cycles en conditions réelles.

---

## 1. Ce qui a changé, lot par lot

### Lot 0 — la nomenclature devient l'autorité
`docs/keel/NOMENCLATURE-MEMOIRE.md` réécrit : deux sources (le retour sur un BROUILLON,
le BILAN de fin de plan), trois destinations sans recouvrement, l'encart qui meurt à la
VALIDATION et non au calendrier, et §8 — dix phrases et quatorze cas que les lots A et B
testent. `MODEL.md` reçoit le paragraphe qui dit le modèle en cinq lignes.
Commit `3f2af62a`.

### Lot A — le retour sur brouillon a trois portes, plus une
`draft_note_classify.ts` range en **quatre listes** (préférence durable, note, encart,
`skipped`) au lieu de deux, et **une seule écriture** sert les trois destinations. Le mémo
gagne un **sujet** et un **`when`** (`{weekday, slot}`), donc « Léa doit bien manger le
mardi » cesse d'être une règle de toute la table. L'encart cesse de mourir à une date :
`isNextPlanItemAlive` compare `written_at` au `validated_at` du plan suivant.

**Ce que le banc a trouvé** : une phrase d'habitude à un moment (« l'après-midi elle mange
toujours des compotes ») ne tombait dans aucune liste **et n'apparaissait pas dans
`skipped`** — un silence. Réparé, remesuré. Et une consigne ajoutée au prompt (« donne à
cette personne sa PROPRE boîte ») a produit une boîte de **169 g** pour Léa contre 740 g/tête
partagés : régression mesurée, phrase **retirée**, trou structurel écrit au-dessus du prompt.

### Lot B — le bilan demande ce qu'il devinait
Le questionnaire **déduisait** deux réglages depuis « pas cuisiné » et **posait** une
question dont personne ne lisait la réponse. Il demande maintenant `difficulty`, `speed` et
`variety` (devenue commune), des **aliments avec leur personne** au lieu de titres de plats,
et un champ libre. `hunger_between_meals` et `could_finish` partent : leur seul lecteur
nommé n'a jamais eu d'appelant. La rapidité bouge d'un **barreau** de l'échelle, jamais d'un
delta de minutes qui écrirait une valeur absente du formulaire.

**Ce que le banc a trouvé** : le roster lisait deux colonnes qui **n'existent pas**
(`age_state`, `gender` sur `household_members`), et les deux RPC du foyer ne prennent pas le
même argument (`p_user` vs `p_household`). Invisibles au typecheck et aux tests unitaires.

### Lot C — un seul magasin de préférences, et le chat se ferme
Le champ « Aliments refusés » écrivait dans `household_food_restrictions`, la table des
**règles de maison**, celle dont le verrou censure le « pourquoi » des plats. Il écrit
maintenant un `food.exclude` `subject=member:<uuid>` `source=written`. `FoodPreferencesCard`
est démontée, et les deux générateurs ne lisent plus le magasin plat : **deux modules
supprimés** après vérification d'absence d'appelant.

**Mesuré** : les lectures de préférences passent de **N par génération à `reads=0`**.

**Ce que le lot a trouvé** : `PIVOT-FOYER §8.5 règle 1` (« restriction impossible sur un
majeur ») était écrite depuis le premier jour et **armée nulle part** — 6 des 7 lignes
locales visaient un adulte. Migration `20260903180000`. Et le lot lui-même **ouvrait** un
chemin de doublon (l'exemption de `written` au dédoublonnage a deux côtés) ; fermé,
avec un test existant renversé et son motif écrit.
Commit `b146b1ee`.

### Lot D — la carte montre trois choses, une fois chacune
Six sections **par famille** deviennent cinq blocs **par destination**, groupés par personne.
`visibleDuplicates` détecte qu'un même fait vit dans deux magasins et l'**annonce** au lieu
de le masquer. Le récap du soir gagne les deux destinations qui lui manquaient : il
n'annonçait que l'encart — le magasin **provisoire** — et se taisait sur la préférence
**durable**.
Commit `67c878a8`.

---

## 2. La campagne — cinq cycles, compte neuf, écritures par les portes de l'écran

**Compte** `qa-3dest-20260903@keeltest.dev`, foyer Claire (titulaire) / Léa et Tom (mineurs),
**mémoire vide vérifiée** avant le premier cycle (0 item, 0 note, 0 encart, 0 journal,
0 restriction, 0 ligne de sécurité). Banc :
`scripts/2026-09-03-2200-campagne-quatre-cycles.sh`. Cinq générations réelles, 58 à 124 s.

### Le tableau du §8.3

| grandeur | attendu | obtenu | ✓ |
|---|---|---|---|
| préférence de bouche tenue | poisson absent des boîtes de Tom | **0 plat au poisson** sur les 4 cycles qui suivent ; `mouths=1 checked=2..4 kept=tous refused=0` | ✓ |
| préférence de table tenue | l'aliment refusé disparaît au cycle suivant | ⛔ **« pain complet » resservi aux cycles 3 ET 4**, `bites_after: 1` après relance | ✗ |
| note de Léa servie | `served ≥ 1`, la ligne du mardi dans le prompt | `notes lines=1 member_lines=1 **served=1**` dès le cycle 3, puis `served=2` | ✓ |
| indice de portion | −1 au c1, revenu à 0 au c3 | **−1 → −1 → 0 → 0 → 0** | ✓ |
| mineurs exclus, avec motif | à chaque cycle | `portion_excluded: ["…:minor", "…:minor"]` aux **cinq** cycles | ✓ |
| capacité, rapidité, variété | bougent une fois chacune, question citée | `recipe_difficulty normal→simple`, `cooking_time_min 60→45` (**un barreau**), `variety some→varied`, `fields_written: 3` | ✓ *(cycle 5, voir §3)* |
| encart | présent au c3, **mort** après `validated_at` | écrit au c3 ; après validation, `isNextPlanItemAlive` rend **`false`** | ✓ |
| `anything_else` | 1 note, 0 préférence, 0 indice | note `household` « On mange tard le vendredi » `when={weekday: fri}` ; 0 préférence | ✓ |
| doublons | 0 ligne, 3 requêtes | **0, 0, 0** | ✓ |
| sécurité | inchangée | 0 ligne de sécurité, 0 allergie, 0 restriction, aux cinq cycles | ✓ |
| répétition de plats | à reporter | **1 titre répété** sur 20 (« Yaourt grec, flocons d'avoine, pêche et noix ») | — |

**La boucle apprend.** « Mon fils n'aime pas le poisson » écrit au cycle 1 tient sur quatre
cycles ; la note de Léa entre dans le prompt dès qu'elle est écrite ; l'envie de fajitas du
cycle 3 se lit dans le plan de ce cycle (tortillas, salsa) et meurt à la validation.

---

## 3. Les fois où le banc s'est trompé

Quatre, toutes corrigées et remesurées.

**① Le banc écrivait ses propres doublons.** La première version appelait
`keel_write_retained_items` en ajoutant l'aliment sans regarder : trois passages ont laissé
**trois lignes « saumon » identiques** sur Tom. Le produit ne fait pas ça —
`addWrittenFoodExclusions` compare `(kind, sujet, texte normalisé)` avant d'écrire — mais
**la RPC, elle, n'en sait rien** : le dédoublonnage vit dans l'appelant, pas dans le port.

**② Le banc lisait un chemin inexistant.** Le scan des plats lisait `meal.days[].dishes` ;
la réponse porte `dishes` à plat, et `meal` ne contient que l'`id`. Résultat : « 0 boîte »
partout, ce qui **ressemble à une exclusion réussie**. C'est le pire mode d'échec d'un banc :
un zéro qui se lit comme une réussite.

**③ Le banc perdait ses compteurs en silence.** `grep -o` sur des lignes préfixées
« [Info] » rendait des fragments que `json.loads` refusait sans un mot : zéro compteur
affiché sur un run réussi.

**④ La campagne rendait les indices de cuisine INMESURABLES par construction.** §8.1 exige
un compte neuf à mémoire vide, et la fixture est nue. Or `recipe_difficulty`, `variety` et
`cooking_time_min` ne sont pas de la mémoire : ce sont des réglages que la personne remplit
dans l'entonnoir. Les cycles 1 et 2 ont donc mesuré `noBaseline` — un refus **correct**, que
le tableau aurait rendu comme « les indices ne bougent pas ». La base a été posée **par
l'écriture de l'écran** (`mergePracticalConstraints`, PATCH avec le jeton de la personne),
et un cycle 5 mesure les trois crans d'un coup.

**Et une erreur de lecture de ma part, hors banc** : la première sonde d'encart passait le
tableau `retained_next_plan` à `readNextPlanEntries`, qui attend l'objet
`practical_constraints` entier. Elle rendait « 0 ligne, 0 refus » — c'est-à-dire *rien*, pas
*mort*. Un magasin illisible et un magasin vide se ressemblent, et c'est exactement la
distinction que ce module documente.

---

## 4. Ce qui reste ouvert, nommé

### ⛔ Une exclusion de TABLE n'est pas tenue à zéro
`bites_after: 1` aux cycles 3 et 4 : « pain complet », refusé au bilan du cycle 2, est
resservi deux cycles de suite. Le produit **le dit** — l'`issue` du plan porte
*« household asked to avoid "pain complet" and "Œufs brouillés, pain complet, tomates et
épinards" still contains pain »* — mais le plat part quand même, après une seule relance.
La ceinture PAR BOUCHE, elle, est tenue à zéro (`refused: 0` aux cinq cycles).

### ⛔ Un aliment à plusieurs mots devient des jetons indépendants
Le jeton qui mord ci-dessus est **« pain »**, pas « pain complet » :
`termsOfInstruction("pain complet")` rend des jetons séparés, et « pain » seul mord sur
n'importe quel pain. Mesuré deux fois — « yaourt grec nature » a le même effet, et retire une
bouche de deux parts sur trois sur un plan qui sert du yaourt ordinaire. La personne a refusé
un aliment précis ; le produit en refuse une catégorie qu'elle n'a jamais nommée. C'est
l'inverse exact de la règle écrite dans `food_exclusion_belt.ts` (« un mot de catégorie se
déplie, un aliment précis non — sens unique »).

### ⏸ Le sort des 7 lignes de `household_food_restrictions`
Aucune migration de données : le sens (« goût » ou « interdit ») n'est pas déductible d'un
libellé. Six visent un adulte, une un mineur. La requête est dans
`scratchpad/2026-09-03-2010-C-rapport.md`.

### ⏸ Le port d'écriture des items retenus n'a pas de dédoublonnage à lui
Un second écran qui écrirait par `keel_write_retained_items` sans rejouer la règle de
`addWrittenFoodExclusions` produirait des doublons. Un seul appelant aujourd'hui, gardé par
un test.

### ⏸ La charge du questionnaire passe de quatre à six gestes
FF-054 dit « au-delà de quatre gestes c'est un formulaire ». Un test le mesure plutôt que de
le laisser dériver. Accepter, ou scinder — un lot à part.

### Non mesuré, et pourquoi
« Grammage du dîner du mardi de Léa > lundi » : la fenêtre des cycles est de deux jours à
partir d'aujourd'hui (jeudi), donc aucun plan de la campagne ne contient à la fois un lundi
et un mardi. La note de Léa est **servie** (`served`, `member_lines=1`), son effet sur le
grammage d'un mardi ne l'est pas.

---

## 5. Ce qui attend l'humain

1. **Le sort des 7 restrictions** (ci-dessus).
2. **`supabase db push`** — trois migrations de ce chantier ne sont posées qu'en local :
   `20260903120000` (le port serveur écrit aussi le mémo), `20260903150000` (les six
   colonnes du bilan), `20260903180000` (un interdit de maison ne vise qu'un mineur).
   ⚠️ Le bloc de contrôle de la troisième **compte les lignes réelles** : sur la base
   distante il mesurera *ses* lignes, pas celles d'ici.
3. **`supabase functions deploy`** de `generate-meal-v1`, `generate-household-meal-v1`,
   `keel-plan-feedback-v1`.
4. **Les deux arbitrages ⏸** ci-dessus.

## 6. L'état des tests

`supabase/functions/_shared/keel` : **5 042 verts, 0 rouge, 1 ignoré**.
Front : **2 173 verts**, 4 rouges qui sont exactement ceux de `scripts/.vitest-red-baseline`.
`tsc -p tsconfig.app.json` et `eslint` propres. Trois migrations au registre local, blocs de
contrôle passés.

⚠️ Le gate a été rouge au moment du commit du lot D, sur `pageSeams.int.test.ts`, à cause
d'un fichier **non suivi** d'une autre session qui réécrivait le routage de locale. Mesuré
comme étranger en remettant mes deux fichiers i18n dans leur version de `HEAD` : les rouges
restaient. Aucune ligne ajoutée à la baseline — elle demande de nommer un propriétaire et
une date, et épingler un arbre qui bouge à la minute y laisserait une liste périmée.
