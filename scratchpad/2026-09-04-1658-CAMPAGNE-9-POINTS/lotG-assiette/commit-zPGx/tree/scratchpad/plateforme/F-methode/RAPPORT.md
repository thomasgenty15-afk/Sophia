# FAMILLE F — LA MÉTHODE · rapport

> Huit fichiers, 9 495 lignes au départ. `/coach/doctrine`, `/coach/protocol`,
> `/coach/meals`, `/coach/templates`, `/coach/import`, et `CommitmentLine` qui est
> aussi monté par `/app/today`.
> **Tout ce qui suit est mesuré au rendu**, pas relu dans le TSX : serveur
> `frontend-a21` (port 5191), sessions QA `coach` et `house`, 320 px et 1280 px.

---

## 1. Par quelle FORME l'échelle de priorité en trois couleurs a été remplacée

C'était la faute nommée comme la plus nette du chantier. En l'ouvrant, elle était
en fait **deux** fautes empilées, et **trois** rendus concurrents du même rang.

### 1.1 Ce qui était là — le relevé exact

| rendu | fichier | `core` | `secondary` | `optional` |
|---|---|---|---|---|
| `PriorityChip` | `TemplatesPage:115` | `bg-gray-100` | **`bg-sky-50`** | `bg-gray-50` |
| `PriorityChip` | `PlanImportPage:213` | `bg-gray-100` | **`bg-sky-50`** | `bg-gray-50` |
| `PriorityBadge` | `KeelBadges:33` | **`bg-emerald-50`** | **`bg-sky-50`** | `bg-gray-50` |

Et, séparément, un **code-couleur de PARTIE** (`food` / `actions` / `unsorted`)
en **lime / orange / ambre**, dupliqué à l'identique dans
`TemplatesPage:159-170` et `PlanImportPage:642-651` — c'est ce que l'audit §2.2
avait compté sous le même nom.

Quatre reproches, tous vérifiés :

1. **Un rang n'est pas un état.** La couleur saturée dit un fait dans ce produit
   (émeraude = ok, bleu = info, ambre = attention, rouge = échec). « Cette ligne
   porte le bloc » n'est aucun des quatre.
2. **Le `sky` prenait le bleu de `Badge tone="info"`** et rendait la pastille
   bleue muette — sur l'écran d'import, qui en affiche.
3. **L'émeraude de « Core » était un FAUX « ok ».** Un engagement principal n'est
   pas un engagement tenu. Sur `/app/today`, cette fausse coche touchait la vraie
   — la pastille de statut — dans la même rangée, à 11 px.
4. **L'échelle n'était même pas ordonnée** : `orange` et `amber` sont à 30° l'un
   de l'autre, `lime` est le voisin de l'émeraude. Trois teintes ne se lisent pas
   comme « haut / moyen / bas » ; elles se lisent comme trois choses.

### 1.2 Ce qui les remplace — deux formes, pas une

**(a) Le RANG devient une marque ordinale : `PriorityMark`.**
`frontend/src/keel/components/CommitmentLine.tsx` — **une** définition, trois
écrans appelants.

Trois pièces de 3 × 7 px sur une grille de 13 × 8, **remplies de gauche à
droite** : `core` = 3, `secondary` = 2, `optional` = 1. Tracé en 2 px de
`currentColor`, le langage de figure de la charte (§5). Le mot reste écrit à
droite (R1 : le jeton est une donnée, jamais une copie), et `core` prend le seul
poids typographique de la rangée (`font-semibold text-ink`, les deux autres
`text-ink-soft`).

Trois raisons pour lesquelles c'est mieux et pas seulement conforme :
- **c'est ordinal**, ce que les couleurs n'étaient pas : on lit le rang sans
  légende ;
- **aucun remplissage de fond.** Un remplissage est ce qui fait une pastille, et
  la pastille appartient aux états. Sur la rangée de `/app/today`, la **seule**
  chose remplie est désormais le statut — la garde de la charte devient visible
  au lieu d'être une règle écrite ailleurs ;
- ça survit au daltonisme et à l'impression.

**(b) La PARTIE devient un FRONTON À ÉQUERRE** — et c'est la forme que le kit a
choisie le même jour pour le même problème (`ui/SetupSection.tsx`, charte §4).

Mesuré au navigateur sur `/coach/import` et `/coach/templates` :

| pièce | valeur rendue | jeton |
|---|---|---|
| cadre de la section | `rgb(142, 120, 134)` · rayon 12 px | `line-strong` · `radius-card` |
| fronton | `rgb(244, 239, 242)` | `paper-2` |
| trait de fermeture | `rgb(227, 218, 224)`, 1 px | `line` |
| équerre `::before` | 10 × 14 px, `rgb(99, 44, 76)` | `fig-700` |
| titre | 11 px, +1,1 px d'approche, capitales, `padding-left: 18px` | `text-label` |

C'est **exactement** le patron de `SetupSection`, donc `/coach/import` et
`/app/plan` disent maintenant « ici commence une section » de la même façon.

**La seule teinte gardée : `unsorted` reste ambre.** Ce n'est pas une catégorie —
`api/planStructure.ts` l'écrit en clair : *« a line whose family we could not
place is a thing the coach must FIX »*. C'est un fait qui attend une décision,
donc `Card tone="warning"` et **ses valeurs exactes** (`border-amber-200
bg-amber-50`) pour qu'il n'y ait qu'un ambre dans le produit. En restant seul, il
redevient lisible : sur ces écrans, ambre veut dire « il y a quelque chose à faire
ici », y compris pour le bandeau des questions ouvertes deux blocs plus haut.

### 1.3 La duplication est fermée, pas déplacée

`PriorityChip` était **dupliqué à l'identique** dans mes deux pages. Les deux
sont supprimés ; les deux importent `PriorityMark` de `CommitmentLine.tsx`, qui
est déjà le fichier que les deux importaient pour `ActivityChip`. **Zéro nouveau
fichier partagé.** Chaque site de suppression porte un commentaire qui nomme le
troisième rendu (`KeelBadges.PriorityBadge`) pour que le prochain lecteur ne
recrée pas la copie.

### 1.4 Le même geste sur la FAMILLE (`ActivityChip`), qui était le jumeau caché

`ACTIVITY_TINT` peignait **neuf domaines** (`nutrition`, `movement`, …) en
lime / ambre / orange / teal / cyan / indigo / fuchsia / slate / gray — 27
classes. Une famille est un domaine, pas un état, et les teintes mordaient
précisément là où ça compte : `amber` sur `supplement` était l'ambre
d'« attention », `cyan` sur `exposure` le voisin du bleu d'« info »,
**`indigo` et `fuchsia` étaient la marque du produit grand public supprimé**, et
`lime` sur `nutrition` est ce qu'on voyait sur `/app/today` à côté d'une pastille
émeraude.

**Le glyphe portait déjà l'identité** — neuf tracés de 2 px sur une grille de 24.
Les neuf teintes partent, le glyphe reste, le chip perd son cadre et son fond.
En rôle d'en-tête (`size="md"`, trois écrans), il prend en plus le **même cran que
le `<h5>` qu'il remplace** (`text-label`) : les deux branches du ternaire se
ressemblent enfin.

⚠️ **Le garde R7 est intact.** Il testait `!tint || !glyph` ; il teste `!glyph`.
Les deux tables avaient **les mêmes neuf clés**, donc le comportement est
identique au caractère près — aucun changement de logique.

---

## 2. Ce que `PlanImportPage` a gagné en passant au kit

Il n'importait **rien** du kit (seul `KeelAppShell`). Il importe maintenant
`Badge`, `Button`, `Card`, `SectionLabel`, `Field`, `inputClass`.

| mesure | avant (`HEAD`) | après |
|---|---:|---:|
| `<button>` écrits à la main | **13** | **1** |
| classes de champ recopiées (`border-gray-300`) | **11** | **0** |
| instances de primitives du kit rendues | **0** | **24** |
| usages d'`inputClass` | 0 | 9 |
| lignes de balisage supprimées / ajoutées | — | **−228 / +197** |
| lignes de code hors commentaires | 1 088 | **1 058** (**−30**) |

Le seul `<button>` restant (ligne 390) n'est pas un bouton : c'est une cible de
clic sans chrome qui enveloppe le titre d'une ligne.

Les six primitives locales nommées dans le brief, une par une :

| local | devenu |
|---|---|
| `PriorityChip` (213) | **supprimé** → `PriorityMark` (partagé) |
| `QuestionRow` (240) | gardé (il porte une logique d'ancre), son `<select>` passe à `inputClass` + `aria-label` |
| `CommitmentCard` (297) | gardé (c'est la ligne du plan), ses 4 boutons → `Button`, sa pastille « Proposé » → `Badge`, son cadre de proposition → le **pointillé** du kit |
| `Queue` (526) | gardé, **la prop `tone` retirée du type et de ses 3 sites d'appel** |
| `PartSection` (607) | gardé, le code-couleur → fronton à équerre |
| `PartSubgroup` (678) | gardé, l'en-tête passe à `text-label` |

Et le même passage sur `TemplatesPage` : **11 → 3** boutons maison (les trois
restants sont deux cibles de clic sans chrome et un interrupteur `aria-pressed`),
**14 → 0** champs recopiés, **25** instances du kit, **−29** lignes de code.

**Le défaut que ça répare vraiment.** Les 11 + 14 = 25 champs recopiés portaient
`text-sm` ou `text-xs` — 14 et 12 px. `index.css` pose 16 px sur les champs sous
`lg` parce que **Safari iOS zoome sur un champ plus petit au focus et ne dézoome
pas** ; la règle vit dans `@layer base` et un utilitaire la bat. La protection
était donc contournée 25 fois sur ces deux écrans. **Mesuré à 320 px après
passage** : chaque `input`/`select`/`textarea` de `/coach/import` et
`/coach/templates` calcule `16px`, bordure `rgb(142, 120, 134)` = `line-strong`
(3,84:1, le seuil WCAG 1.4.11 d'un contrôle).

---

## 3. La preuve que `CommitmentLine` va bien sur les DEUX écrans

Le composant est monté par trois écrans dont un qui n'est pas à moi.

### `/app/today` — session `house`, `CommitmentLine` en entier

Rangée « Photograph a meal », valeurs **calculées** :

| pièce | rendu | vérdict |
|---|---|---|
| cadre de la ligne | `rounded-card border border-line-strong bg-paper p-3` | `p-3` gardé exprès : `/app/today` en empile jusqu'à 15, le `p-4` de `Card` y changerait le rythme d'un écran qui n'est pas le mien |
| famille « Nutrition » | glyphe + mot, `color: rgb(106, 90, 100)`, **fond transparent** | le lime est parti, le fond aussi |
| rang « Core » | `svg[viewBox="0 0 13 8"]`, 3 `rect` en `currentColor`, mot en `ink` semi-gras | l'émeraude est partie |
| statut « Not logged yet » | **la seule pièce remplie de la rangée** | la garde est visible |
| « Log it » | `Button size="sm"` (secondaire) | plus de bouton maison |
| 320 px | `scrollWidth = 320`, **0 élément débordant** | — |

La plainte d'origine — *« une pastille Nutrition vert-jaune et une pastille Core
émeraude, aucune des deux n'est un état »* — n'a plus d'objet : ni l'une ni
l'autre n'est une pastille.

### `/coach/templates` — `ActivityChip` en rôle d'en-tête + `PriorityMark`

Gabarit ouvert, 2 lignes ajoutées, 320 px et 1280 px :
`scrollWidth = 320`, **0 débordement**, **0 gris Tailwind** rendu dans tout le
`body`, **2 rayons** seulement (12 px et plein), tous les contrôles à 16 px,
et **exactement UN bouton figue** (`rgb(99, 44, 76)`) : « Save ».
Le sous-groupe « OTHER » rend le glyphe + le mot en `text-label`, aligné sur le
`<h5>` voisin.

### `/coach/import` — le cas populé (11 lignes extraites d'un vrai plan)

Import réel exécuté (`plan-import-v1`), 11 lignes, 3 files, 3 parties.
`figButtons` = **[« Approve & publish to student »]** — un seul. Deux frontons
mesurés (`Food 6`, `Actions 3`), bloc `Observations` en pointillé `line-strong`,
11 `PriorityMark`. À 320 px : `scrollWidth = 320`, **0 débordement**, 0 gris.

---

## 4. Avant / après mesurés, par fichier

`gray` = `-(gray|slate|zinc|neutral|stone)-\d+` **hors commentaires de ligne**.
`sat.` = saturées hors `Badge.tsx`, hors commentaires.

| fichier | lignes | `gray` | `sat.` | rayons |
|---|---|---|---|---|
| `CoachDoctrinePage.tsx` | 1 918 → 1 922 | **98 → 0** | 15 → 15 | `full`×3 `lg`×1 `md`×9 → **`card`×7 `full`×3** |
| `CoachProtocolPage.tsx` | 1 751 → 1 778 | **59 → 0** | 11 → 11 | `full`×5 `lg`×4 → **`card`×4 `full`×5** |
| `CoachMealsPage.tsx` | 506 → 509 | **21 → 0** | 0 → 0 | `full`×1 `lg`×2 → **`card`×2 `full`×1** |
| `TemplatesPage.tsx` | 1 015 → 1 036 | **89 → 0** | **33 → 17** | `rounded`×29 `lg`×2 `xl`×7 → **`card`×11 `full`×1** |
| `PlanImportPage.tsx` | 1 459 → 1 516 | **97 → 0** | **47 → 21** | `rounded`×30 `full`×1 `lg`×10 → **`card`×14 `full`×1** |
| `DoctrineStartDialog.tsx` | 615 → 630 | **41 → 0** | 1 → 4 | `rounded`×1 `full`×1 `lg`×3 `md`×2 → **`card`×3 `full`×2** |
| `CommitmentEditor.tsx` | 976 → 1 008 | **19 → 0** | 0 → 0 | `rounded`×4 → **`card`×2 `full`×1** |
| `CommitmentLine.tsx` | 183 → 282 | **17 → 0** | **25 → 2** | `rounded`×2 `lg`×2 → **`card`×1** |
| **TOTAL** | 8 423 → 8 681 | **441 → 0** | **132 → 70** | 7 valeurs → **2** |

**Les 70 saturées qui restent sont toutes des ÉTATS**, ligne par ligne :
ambre = attention (bandeau de questions ouvertes, ligne bloquée, partie
`unsorted`, avertissement de délégation, note d'horaire), rouge = échec (bandeau
d'erreur, `Button variant="danger"`, posture « exclu »), émeraude =
enregistrement confirmé et posture « encouragé ».

Deux mouvements dans cette colonne méritent leur explication :

- **`DoctrineStartDialog` 1 → 4.** Le bandeau d'échec était `bg-amber-50` avec du
  **texte gris** ; il prend le `border-amber-200` et le `text-amber-900` de
  `Card tone="warning"`. Un état gagne sa cohérence, il n'en apparaît pas un
  nouveau.
- **`CoachProtocolPage` : `rose` → `red`.** Les trois postures (`encouraged` /
  `discouraged` / `excluded`) **restent colorées, et c'est juste** : une posture
  est un verdict que le coach a rendu, et ce sont trois des quatre familles
  d'état. Mais `rose` en était une **cinquième famille**, doublon de `critical`
  (`Badge` rend `bg-red-50 text-red-700`) à quelques degrés de lui. Deux familles
  pour un seul sens, c'est ainsi qu'un vocabulaire d'état se perd.

### Le plafond d'action figue — vérifié au navigateur, pas au grep

| écran | avant | après | rendu simultané, mesuré |
|---|---:|---|---|
| `CoachProtocolPage` | **3** (le maximum du produit) | 1 | « Ajouter un aliment » démoté ; « Publier » garde la marque. « Confirmer la publication » **remplace** « Publier » à l'écran, jamais à côté : ce n'était pas un troisième. |
| `TemplatesPage` | 1 (`Nouveau`) | 1 (`Enregistrer`) | « Nouveau » et « Enregistrer » sont rendus **en même temps** dès qu'un gabarit est ouvert. La marque descend sur celui que le coach cherche à ce moment-là. Sans gabarit ouvert : **zéro** figue, et c'est juste. |
| `PlanImportPage` | 0 | 1 | Deux phases jamais confondues : `Importer` est figue tant qu'il n'y a rien d'extrait, `Publier` l'est dès qu'il y a des lignes. **Mesuré avec 11 lignes : un seul bouton `fig-700` dans le document.** |

### Les gestes du kit, comptés

- **Pastilles maison → `Badge`** : « Proposé » (`bg-sky-100`→`neutral`),
  « Section approuvée » (`bg-emerald-100`→`positive`), « Enregistré N fois »
  sur la ligne de l'élève (→`positive`).
- **Champs recopiés → `inputClass`** : 25 sur les deux pages du plan, **+ la
  constante `FIELD` de `CommitmentEditor`** qui habillait ses **25 contrôles**
  (`text-sm`, bordure sous 3:1, `focus:outline-none` sans anneau de
  remplacement). Une constante remplacée, 25 contrôles corrigés.
- **`AddButton` de `CoachDoctrinePage` → `Button`** ; son pointillé est perdu
  exprès : dans le vocabulaire du kit le pointillé dit « emplacement vide en
  attente » (`Card tone="dashed"`), pas « action ». Le « + » dit qu'on ajoute.
- **La coque de `DoctrineStartDialog` → `ui/Modal`.** Ce n'était pas un geste de
  couleur : la version locale n'avait ni `role="dialog"`, ni `aria-modal`, ni
  Échap, ni verrou de défilement, ni focus entrant. **Mesuré après** :
  `role=dialog`, `aria-modal=true`, `aria-label="Where your method comes from"`,
  `body.style.overflow = hidden`, rayon 16 px, voile à l'encre de la marque.
- **`divide-*` / `accent-*` balayés** aussi : `divide-gray-100`
  (`CoachDoctrinePage:619`, `CoachProtocolPage:809`) → `divide-line`, et les
  cases à cocher prennent `accent-fig-700` (une case cochée est un choix, donc
  une action).
- **Compteurs** : les six pastilles grises qui n'entouraient qu'un nombre sont
  devenues du texte `tabular-nums`. Un chiffre est un chiffre ; à côté d'une
  pastille d'état, une pastille qui ne dit qu'un nombre est un objet de plus à
  trier.
- **Mesure de lecture** : `max-w-[62ch]` posé sur les 20 chapôs et notes d'aide
  qui couraient sur toute la largeur d'une carte de 1 200 px.

---

## 5. Ce que je SIGNALE et n'ai pas réparé

### 5.1 ⛔ `keel/components/KeelBadges.tsx` n'appartient à personne, et il porte encore l'ancienne palette

**C'est le point le plus important de ce rapport pour l'orchestrateur.**
Ce fichier **n'est pas dans l'inventaire §4 de l'audit** (les 22 partagés) et n'est
donc dans la liste d'aucune famille. Il a **un seul importeur : mon
`CommitmentLine.tsx`**, ce qui explique qu'il ait échappé au comptage — il est
monté transitivement.

Il rend encore, **mesuré sur `/app/today`** (`bg-gray-100` calculé sur la
pastille de statut) :

```
STATUS_STYLE  unknown        bg-gray-100 text-gray-600      ← neutre du kit: bg-line text-ink-soft
              partial        bg-sky-100  text-sky-800       ← le bleu de `info`, en 100/800
              missed         bg-rose-100 text-rose-700      ← `rose`, cinquième famille (cf. §4)
              not_applicable bg-violet-100 text-violet-700  ← ⛔ LA MARQUE DU PRODUIT SUPPRIMÉ
              flex_used      bg-violet-100 text-violet-700  ← ⛔ IDEM
PRIORITY_STYLE core          bg-emerald-50 …                ← le FAUX « ok » que §1 vient de retirer
```

Deux conséquences :
1. **`PriorityBadge` n'a plus aucun importeur** depuis que `CommitmentLine` rend
   `PriorityMark`. C'est du code mort qui porte la faute que le chantier corrige :
   candidat à la purge, pas au style.
2. **`StatusBadge` est la dernière pièce non convertie de la rangée de
   `/app/today`.** Elle est aussi la pièce qui porte la garde (« un état est une
   pastille ») : la laisser en `gray-100`/`violet-100` à côté d'un rang converti
   est le seul défaut visible qui reste sur cet écran.

Le violet y est un **statut** (`not_applicable`, `flex_used`) — donc à la fois
reliquat de marque **et** vrai état sans teinte légitime. Exactement le cas de
`WeekView.tsx` (famille E, audit §3 n°5), qui **copie ce fichier en commentaire**
(`WeekView:489` : *« The cell tints mirror `KeelBadges.STATUS_STYLE`
deliberately »*). Le convertir sans convertir `KeelBadges` fait diverger les deux.

**Je ne l'ai pas touché** : il n'est pas dans ma liste, et le SOCLE §5 est
explicite. Il faut une décision de l'orchestrateur — l'attribuer, ou le convertir
dans sa fenêtre série.

### 5.2 Contraintes documentées périmées, dans des fichiers qui ne sont pas à moi

- **`TodayPage.tsx:434-436`** (famille B) affirme encore : *« Each family carries
  an icon and a tint (`ActivityChip`), the same one on the line, on the section
  header and in the day tally, so "nutrition held, movement did not" is readable
  without reading a single word »*. **La teinte n'existe plus.** Laissée telle
  quelle, cette phrase fait « réparer » mon travail par le prochain lecteur — le
  dépôt l'a déjà payé deux fois. J'ai réécrit la version qui vivait dans mon
  fichier (`CommitmentLine.tsx`, en-tête) et j'y ai nommé `TodayPage` comme le
  second endroit à corriger.
- **`TodayPage.tsx:694-697`** (famille B) porte encore le **même code-couleur de
  partie** que je viens de retirer : `border-lime-200 bg-lime-50/50` pour
  `food`, `orange` pour `actions`. Si B ne le retire pas, `/app/today` et
  `/coach/import` rendront les mêmes lignes sous deux vocabulaires — ce que
  `api/planStructure.ts` existe précisément pour empêcher.

### 5.3 Défaut d'accessibilité de structure — signalé, pas réparé

`ActivityChip` est rendu **dans un emplacement d'en-tête** sur trois écrans
(`TemplatesPage.TemplateSubgroup`, `PlanImportPage.PartSubgroup`,
`TodayPage.DaySubsection`) alors que l'autre branche du même ternaire rend un
`<h5>` / `<h3>`. **La moitié des en-têtes de sous-groupe ne sont pas des
en-têtes** : un lecteur d'écran qui navigue par titres saute « Supplements » mais
pas « Nutrition ». Le corriger demande de changer l'élément **par site d'appel**
(le chip est aussi rendu en ligne, dans une rangée, où un `<h5>` serait faux) —
c'est de la structure, pas du style, et un des trois sites n'est pas à moi.
J'ai en revanche aligné le **cran typographique** des deux branches pour que la
hiérarchie visuelle soit juste.

### 5.4 Besoins de kit (pour l'orchestrateur)

1. **`Card` : le padding n'est pas surchargeable.** `padded` rend `p-4` ; passer
   `className="p-3"` ne gagne pas de façon fiable — deux utilitaires de padding
   de même spécificité, c'est **l'ordre de génération de Tailwind** qui tranche,
   pas l'ordre dans l'attribut. J'ai donc dû écrire `padded={false}` + padding
   explicite pour les états vides denses… ce qui ajoute `overflow-hidden`, et
   `overflow-hidden` **rogne l'anneau de focus** (`outline-offset: 3px` du
   plancher de qualité). Un `padding` explicite, ou un `padded={false}` sans
   `overflow-hidden`, éviterait le compromis.
2. **`Button` n'a pas de cran entre `sm` (`px-2.5 py-0.5`) et `md`
   (`px-4 py-2`).** Les rangées d'actions d'une ligne de plan (4 boutons, 11
   lignes) sont à l'étroit en `sm` et énormes en `md`. J'ai pris `sm`.
3. **Un `<label>` qui enveloppe un `<input type="file">` ne peut pas devenir un
   `<Button>`** sans casser la liaison. Il y en a deux dans mon lot
   (`PlanImportPage`, `DoctrineStartDialog`) ; j'ai recopié le vocabulaire du
   bouton secondaire à la main. Un `ButtonLabel` dans le kit fermerait la copie.
4. **`Field` du kit associe par `htmlFor`/`id`.** Dans `CommitmentEditor`, dont
   **plusieurs instances sont rendues en même temps** (une par ligne ouverte),
   il faudrait 25 identifiants uniques *par instance* : deux `id` identiques dans
   le document et le clic sur l'étiquette de l'une donne le focus au contrôle de
   l'autre. J'ai donc gardé le petit `Field` local (qui enveloppe, association
   **implicite**, incassable) et n'ai importé du kit que ce qui devait en venir :
   `inputClass` et le cran `text-label`. C'est documenté sur place.

### 5.5 Rouge qui ne vient pas de moi

`npx tsc -b` (donc `tsconfig.app.json`) : **aucune erreur dans mes huit
fichiers**, vérifié après chaque lot. Il y en a ailleurs, toutes d'écritures
concurrentes en cours :

- **`keel/pages/SetupPage.tsx` — erreurs de SYNTAXE JSX** (1170, 1190, 1328-1330 :
  `Card` sans balise fermante). Famille A, en vol. C'est bloquant pour un build.
- `components/UserProfile.tsx` : 6 erreurs (`sectionTitle` et `card` absents de
  l'objet de styles ; `Bell`, `Mail`, `ChevronRight` non définis). Famille G.
- `keel/components/CoachSeatCard.tsx:122` : `SectionLabel` non importé. Famille E.
- `keel/components/DeviationDialog.tsx:82` : TS1355 (`as const` sur une
  expression non littérale). Famille B.

`npx vitest run` : **3 échecs, aucun dans mon périmètre.**
`src/edge/coverage-guard.int.test.ts` (2 : listes connues des fonctions edge et
des triggers — je n'ai touché aucun fichier backend) et
`src/keel/copy/planRefusals.int.test.ts` (1 : les motifs de refus de foyer, donc
`HouseholdPage.tsx`, famille D). **813 tests passent.**

### 5.6 Le reste, en vrac

- **`/coach/import` a son corps en anglais par une fonction edge** — c'est voulu,
  je ne l'ai pas « réparé ». **Aucune chaîne ajoutée, aucune retirée, aucun
  namespace déclaré**, sur aucun des huit fichiers. Le sous-titre de la modale de
  doctrine change de place (il passe en tête du corps, `Modal` ne prend pas de
  sous-titre) mais **c'est la même clé**.
- **`Queue.tone` a été retirée du type**, pas laissée morte : une prop qui ne
  fait rien se remplit à nouveau au premier lecteur pressé. Les 3 sites d'appel
  sont corrigés dans le même fichier.
- **La sélection prend la marque, partout où elle est un CHOIX** : pastilles de
  groupe alimentaire, de jour, d'objectif, de portée, de position de débat,
  cartes-radio, et l'anneau de la ligne au clavier
  (`ring-gray-900/15` → `ring-fig-600`). `bg-gray-900 text-white` disait déjà
  « celui-ci est actif » ; il le dit maintenant avec un jeton, et la charte
  réserve la navigation à la figue. Chaque interrupteur a gagné son
  `aria-pressed` au passage — il en manquait sur trois.
- **`CoachProtocolPage` : l'emphase d'un panneau passe de la couleur à la place
  et au poids.** Le cadre « Remplir depuis ma méthode » était un gris 900, plus
  fort que n'importe quelle carte de l'écran. La charte n'a pas de neutre aussi
  sombre, et emprunter la marque pour un **cadre** la ferait sortir de son rôle.
  Le panneau est déjà premier et son titre déjà le seul en gras : c'est ça qui
  dit « d'abord ».
- **Ce que je n'ai pas pu rendre plus beau sans toucher à la logique** : le rang
  n'a été observé qu'en `core` au rendu — l'extracteur et `blankCommitment`
  produisent tous deux `core`/`secondary`, et aucune donnée locale ne porte
  `optional`. `PriorityMark` est une fonction pure de `rank` et les trois cas
  sont dans le même `map`, mais **les trois n'ont pas été vus côte à côte à
  l'écran.** Fabriquer la donnée aurait demandé d'écrire en base.
