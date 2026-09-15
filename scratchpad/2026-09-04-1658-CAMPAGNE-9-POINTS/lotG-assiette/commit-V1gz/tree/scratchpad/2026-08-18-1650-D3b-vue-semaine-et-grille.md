# D3b — la vue semaine et la grille (2026-08-18, 16h50)

Branche `ff-001-quotidien-du-coach`. Aucun push, aucun merge. **Quatre commits** posés
— `874e1736`, `f2c52e49`, `6b6973f2`, `1d36c775` — gate vert à chaque fois. (Les
autres commits qui apparaissent entre les miens dans `git log` viennent de sessions
parallèles : tout le dépôt commite sous le même nom d'auteur.)

> ⚠️ **LE GATE NE JOUE PAS VITEST.** `agent-gate` rejoue la suite **Deno** (3361
> tests), le typecheck, `deno check` et eslint — **pas** la suite frontend. Un rouge
> que j'avais introduit (`planDayView.int.test.ts`) est donc passé sous le gate de
> **deux** commits avant que je le trouve à la main. Quiconque touche au frontend doit
> lancer `cd frontend && npx vitest run` lui-même.

**Suite frontend complète, à la main :** 1448 tests, **4 rouges, tous étrangers à ce
lot** — `api/household.int.test.ts` ×2 (`awayFrom` rend maintenant `kind`, et
`api/household.ts` est du travail **non commité d'une autre lane**, explicitement hors
de mon terrain) et `src/edge/coverage-guard.int.test.ts` ×2 (edge functions et
triggers ajoutés par deux commits étrangers tombés pendant le lot). Aucun des deux
fichiers n'importe quoi que ce soit que j'ai touché.

---

## Ce qui était déjà fait

`2935c459` (le plat dédié qui fuyait dans les listes plates) : vérifié, gardé, pas
retouché.

## ① La vue semaine cachait les jours sans plat — **fait**, `874e1736`

**Ce que j'ai trouvé en arrivant :** le lot était écrit et **jamais commité**.
`withDaysThatCarry` existait dans `mealBuilderModel.ts`, le branchement existait dans
`PlanResult.tsx`, le test existait — le tout **en index**, laissé par l'agent qui a
calé. Et le fichier de test était **corrompu** : un octet **NUL** dans un littéral de
chaîne (`day.slice(0, 3) + "\0"`), présent **dans l'index comme dans l'arbre**, donc
le fichier ne compilait pas et git le voyait comme binaire.

La règle elle-même est conforme à l'arbitrage : le jour s'affiche dès qu'il porte une
**session** ou des **courses** ; un jour **totalement** vide reste absent.

Réparé : le compteur de blocs (`blockHeadings`) est réécrit sans la soustraction
fautive, et son équivalence « nom entier ≠ nom abrégé » est désormais **tenue par un
rouge voisin** (le test « la moitié qui retient » exige l'absence de « Tuesday » sur
une semaine dont le rail nomme pourtant les sept jours).

**4 mutations, chacune mord :**

| mutation | rouges |
|---|---|
| `carries = false` (le jour qui porte redevient invisible) | 7 |
| `carries = true` (tout jour vide s'ouvre) | 10 |
| la vue semaine relit `groups` au lieu de `carrying` | 3 |
| le test du vide relit `groups` | 1 |

## ② `PlanGrid` ignorait le plat dédié — **fait**, `f2c52e49`

`buildPlanGrid` prenait **le premier** plat du moment (`find`) et le montrait seul.
Conséquences, deux et pas une :

- un dîner où Zoé mange autre chose se lisait « tout le monde mange la même chose » —
  la seule case où le foyer se divise était exactement celle où la grille l'affirmait
  uni ;
- un moment **sans plat de table** affichait l'assiette d'**une** bouche au nom de la
  table.

La case porte maintenant `ownMouths`, `titleIsOwn`, `extraTableDishes`, et rend un
badge court (`+1 à part`, `rien pour la table`). **Un seul badge par cause** :
`titleIsOwn` **remplace** le compte, deux lignes doubleraient la hauteur d'une case de
~57 px.

Le piège documenté `line-clamp-2 block` est corrigé (ligne 139 d'avant) : `block`
retiré, et un test tient la **classe rendue** (`not.toContain("line-clamp-2 block")`).

**⚠️ Une mutation ne mordait pas, et elle cachait un vrai défaut.** Remplacer
`table[0] ?? own[0]` par `atSlot[0]` laissait 39/39 au vert : **toutes** mes fixtures
écrivaient le plat de table **en premier**. Un moteur qui émet l'assiette de Zoé
d'abord faisait alors passer son plat pour le dîner de toute la table. Fixture durcie
(test « l'ordre du plan ne décide pas du titre ») — la mutation mord désormais.

## ③ Deux plats de table au même dîner — **fait**, `f2c52e49` + `6b6973f2`

**Mesuré sur un plan réel**, pas imaginé : `scratchpad/backup_dishes_6620682c.json`
(24 plats) porte « Prawn and tomato rice bowls » **et** « Tomato lentil soup with
bread » sur `fri/dinner`, tous deux sans `member_id`. Le second plan
(`backup_dishes_2ab8a495.json`, 9 plats) est sain — et **aucun des deux** ne porte le
moindre plat dédié, ce qui situe la fréquence réelle du défaut ②.

`PlanGrid.issues` compte et **nomme** (`{ kind: "two_table_dishes", day, slot,
titles }`). **Rien n'est rejeté** — ni ici, ni dans la case, ni dans la liste du jour.
Compté sur **tous** les moments, pas seulement sur les lignes du rythme : une
collision sur une collation non déclarée n'a aucune case où se voir, et c'est ce
silence-là qu'on rompt.

**`issues` a un lecteur** (`6b6973f2`) : le survol du badge nomme les plats en
collision. Sans lui l'écran ne disait que le **nombre**, et la liste des titres aurait
été un champ calculé que personne n'affiche — le défaut d'à côté.

**14 mutations au total sur ce commit et le suivant, chacune mord** : `ownMouths→0`
(5 rouges), `titleIsOwn→false` (2), `extraTableDishes→0` (3), `atSlot[0]` (1 après
durcissement), `tableCollisions→[]` (2), collisions sans le saut des plats dédiés (1),
seuil `<1` (3), le groupe sans jour non sauté (1), la paire inerte rétablie (1), badge
« à part » non rendu (3), badge « en trop » non rendu (2), `titleIsOwn` effacé (1),
`issueTitles→undefined` (2), survol réduit au premier titre (2).

**Un test posé passait à vide** et je l'ai remplacé : « aucune infobulle vide sur un
plan sain » réussissait pour la mauvaise raison — sur un plan sain **aucun badge**
n'est rendu, donc aucun `title=""` ne pouvait apparaître. Le repli `undefined` de
`issueTitles` n'est **pas atteignable** depuis le badge (les deux sortent des mêmes
`groups`), c'est écrit tel quel dans le code, et le test est remplacé par un cas qui
mesure quelque chose (trois titres, trois nommés).

---

## Ce qui n'est PAS fait, et ce qu'il faut savoir

**Le navigateur : NON FAIT.** Aucune fixture d'élève connecté avec un plan publié
n'existe (`docs/keel/qa-fixtures/` ne couvre que la cohorte coach et la doctrine, sans
aucun compte). Les trois serveurs de dev qui tournent appartiennent à d'autres
sessions — même origine = auth partagée, donc les emprunter contamine leur lane. Le
code est commité et prouvé par mutation ; `/app/plan` en 320 px / 1280 px, deux
langues, `document.scrollWidth`, **reste à faire**.

**Les 5 clés de copie sont sur le DISQUE, pas dans un commit.**
`meals.grid.own_one/own_many/own_only/extra_one/extra_many` sont posées dans `en.ts`
et `fr.ts`, qui portent **le travail non commité d'une autre lane** (`en.ts` : 3789
insertions non commitées ; `HEAD` n'a **aucune** clé `meals.grid.*`). Les commiter
aurait emporté la lane entière. C'est l'état documenté du dépôt, pas une négligence —
mais la parité en/fr est vérifiée (`parity.int.test.ts` vert).

**Un incident, dit franchement.** Un `open(p,'wb')` dans un script Python a tronqué
`planWeekCarriedDays.int.test.ts` à zéro octet avant d'échouer. Restauré depuis
l'index ; il manquait alors 13 octets de l'arbre. L'eslint du gate a nommé exactement
ce qui manquait (`'over' is assigned a value but never used`) : `\n    ...over,` dans
la fabrique `prep()` — **13 octets, exactement**. Reconstruit à l'identique, rien de
perdu.

**Trois lecteurs comparaient la case au champ près** (`1d36c775`). Les trois compteurs
neufs ont fait rougir trois assertions d'égalité **exacte** (deux dans
`planGridModel.int.test.ts`, une dans `planDayView.int.test.ts`). L'égalité exacte est
**gardée**, pas relâchée en `objectContaining` : c'est elle qui fait rougir le jour où
un champ apparaît sans son test — ce qui vient de se produire trois fois, et à chaque
fois c'était le comportement voulu.

**Index laissé intact.** `TableStepPlanning.tsx`, `tableStepPlanning.int.test.ts`,
`workLunchCommit.ts` et `meal_plan_integrity_test.ts` étaient/sont **en index** sans
m'appartenir : je ne les ai pas touchés, ils y sont toujours. Aucun de mes fichiers ne
portait de hunk étranger, donc aucun `.patch` n'a été nécessaire.

**Deux commits étrangers sont tombés pendant le lot** (`8802070e`, `1309d92a`) :
d'autres sessions travaillent sur ce dépôt en ce moment.

## Trouvé en passant, non corrigé (chip posée)

`PlanGrid.tsx` ne rend **rien** pour la case `eating_out`, alors que le modèle la
produit et que la copie existe dans les deux langues. Une case « repas dehors » est
donc un `<td>` **vide** — pas même le marqueur ambre d'anomalie. C'est exactement la
confusion que le lot L3 existait pour lever. Hors périmètre (la lane L3 possède
`presenceMarks`), donc signalé plutôt que corrigé.
