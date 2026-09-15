# FAMILLE C — LA SEMAINE ET LE SUIVI

> Sept fichiers, 5 558 lignes. `/app/plan`, `/app/progress`, `/app/health` et les
> quatre composants que la semaine monte. Les écrans les plus chargés en
> **chiffres, mesures et verdicts** du produit — donc ceux où la règle de couleur
> mord le plus fort.

---

## 1. La décision qui gouverne tout le lot : où la marque a le droit d'entrer

La question n'était pas « comment teindre ces écrans ». C'était **où la teinte a
le droit de se poser sur un écran qui n'est presque QUE des faits.** Un écran de
progrès est une suite de nombres ; si la marque touche l'un d'eux, elle devient
un jugement sur ce nombre.

**Réponse tenue sur les sept fichiers : la figue ne se pose que sur trois
choses, et chacune est un GESTE, jamais un fait.**

| ce qui porte la figue | où | combien |
|---|---|---:|
| un **lien** (bouton-texte souligné) — `text-fig-700` / `hover:text-fig-800` | « Change », « Add », « Edit », « Remove », « Cancel », « Drop », « Choose meals » | **11** |
| un **lavis de survol ou de sélection** — `bg-fig-50` | ligne cochée, fiche radio choisie, survol d'une pastille de choix | **6** |
| **un** aplat de marque — `bg-fig-700 text-paper` | le sélecteur `7 jours / 30 jours` de `/app/progress`, et lui seul | **1** |

**Rien d'autre.** Vérifié par grep sur les sept fichiers, commentaires exclus :
aucune classe `fig-*` sur un nombre, une unité, une bande de portion, un écart de
poids, une cellule de grille, un point de graphique, une pastille `Badge`, un
bandeau d'état.

### Le seul aplat de marque de `/app/progress`, et pourquoi il est légitime

`StudentProgressPage:453-475` — le sélecteur de fenêtre était
`bg-gray-900 text-white` / `bg-white ring-gray-200`, en `rounded-lg`.

Il est devenu la **forme exacte des onglets du shell** : `rounded-full`,
`bg-fig-700 text-paper` sur l'actif, `text-ink-soft hover:bg-fig-50 hover:text-ink`
sur l'inactif (`KeelAppShell.tsx:573-576`).

**Parce que ces deux boutons ne mesurent rien : ils choisissent QUELLE VUE on
regarde.** C'est de la navigation, et la navigation appartient à la marque
(charte §2). Ils sont à trois centimètres sous la barre d'onglets, dans le même
axe ; leur donner la même pastille les fait lire comme la suite de la
navigation, et non comme un verdict posé sur la semaine. `aria-pressed` a été
ajouté : l'état ne repose pas sur la couleur seule.

`/app/progress` ne compte **aucun** `variant="primary"`. Ce sélecteur est donc la
seule pièce chaude de l'écran, et il n'entre en concurrence avec rien.

### Les chiffres : ce qu'on leur a fait, et ce qu'on leur a refusé

**Ce qu'ils ont reçu.** `text-gray-900` → **`text-ink`** (16,18:1). L'unité et le
suffixe qui les qualifient passent de `text-gray-400` — **2,85:1, un échec de
contraste sur le mot qui donne son sens au nombre** — à **`text-ink-soft`**
(6,11:1). Les tirets d'absence (`—`), en `gray-300`/`gray-400`, montent au même
`ink-soft` : un vide se lit ou il ne dit rien.

**Ce qui a été refusé, et il fallait le trancher explicitement :**

- ⛔ **Young Serif sur les grands nombres.** `0 / 7 days` et `78,4 kg` sont en
  `text-3xl` — au-dessus du plancher de 20 px, donc techniquement éligibles, et
  une fiche technique en display aurait été tentante. **La charte §3 attribue les
  chiffres à Public Sans** (« texte, chiffres, libellés »), et son écart n°3 le
  mesure : Young Serif rend « 12,99 € » en « 1 2,99 € », la virgule prenant la
  chasse d'un chiffre. Les nombres restent donc en Public Sans. La hiérarchie est
  déjà portée par la taille.
- ⛔ **Toute couleur sur l'écart de poids.** `StudentWeekPlanPage` porte
  déjà — et gardait — un commentaire qui l'interdit : « du vert sur −0,4 kg et du
  rouge sur +0,4 serait une NOTE ». La colonne « change » du tableau
  d'historique reste en `ink-soft`, le signe suffit.

### La grille du rythme : un graphique, donc deux neutres et rien d'autre

`StudentProgressPage:772-780` — les cases étaient `bg-gray-100`, les points
`bg-gray-900`.

C'est **un graphique**, et un graphique ne passe pas à la figue. Il ne porte
aucun état non plus : la **bande de portion est dite par la TAILLE du point**
(`BAND_FILL`), exprès, pour que « grande portion » ne devienne pas un verdict
rouge. Donc : case en **`bg-line`**, point en **`bg-ink`**, et le rayon de la
case passe à **`rounded-part`** (4 px) — le cran que le kit réserve à « une
petite pièce dans une figure », ce qu'une case de grille est exactement.

> Le point garde `rounded-full`. Ce n'est pas un rayon de châssis mais **une
> forme** : un point est un cercle par définition, et `rounded-part` en ferait un
> carré arrondi de 8 px.

---

## 2. Les saturées : ce qui est parti, et par quelle FORME

Le compte de saturées de ces fichiers était déjà bas (0 sur les deux plus
grosses pages) : **la faute ici n'était pas la couleur, c'était le gris.** Ce que
la couleur portait, elle le portait dans un `bg-gray-900` — c'est-à-dire une
distinction correcte, mais rendue par le seul levier que la charte a supprimé (un
neutre plus clair ou plus sombre que la page).

| distinction portée par… | avant | remplacée par la forme |
|---|---|---|
| **jour de cuisine retenu** (×7, `CookingCapacityCard`) | `border-gray-900 bg-gray-900 text-white` vs `border-gray-300` | **encre pleine** `border-ink bg-ink text-paper` (16,18:1) contre un **trait de contrôle** `line-strong` (3,84:1) — plus `aria-pressed` |
| **taille de repas active** (×3 par créneau, `EatingRhythmCard`) | idem | idem, même vocabulaire — deux composants voisins ne se répondaient pas |
| **créneau coché** (×6, `EatingRhythmCard`) | `border-gray-900 bg-gray-50` vs `border-gray-200` | **`border-ink` + lavis `bg-fig-50`** contre `border-line` |
| **dynamique choisie** (×6 fiches radio, `StudentWeekPlanPage`) | `border-gray-900 bg-gray-50 ring-gray-900` / `border-gray-300 bg-white` | **`border-ink bg-fig-50 ring-1 ring-ink`** contre `border-line-strong bg-paper` |
| **bloc « rien de coché »** (`EatingRhythmCard`) | `bg-gray-50` | **`bg-paper-2` + `border-line`** — l'idiome du fronton de `SetupSection` |
| **proposition en attente** (`FoodPreferencesCard`) | `bg-gray-50` | idem |
| **libellé de sous-groupe** (×4 : `suggested`, `yours`, jour du journal, dates de fenêtre) | `text-xs uppercase tracking-wide text-gray-400` — **2,85:1** | **`text-label` + `ink-soft`** (11 px, +0,1em, 6,11:1) : le cran d'étiquette de la charte |
| **étiquette de cellule / de champ local** (×9) | `text-xs font-medium text-gray-700` | **`text-label` uppercase `ink-soft`** — c'est ce qui donne aux cinq cellules de `PersonalNumbers` leur allure de fiche |

**`bg-white` est parti des quatre endroits qui le portaient** (4 → 0) : le blanc
pur est le neutre sans température que la charte refuse, et sur un fond `paper` à
L 98 % il ne se distinguait plus de rien.

### Les saturées qui RESTENT, parce qu'elles portent un fait

`bg-amber-50 text-amber-900` des trois bandeaux d'avertissement · `text-amber-700`
du brouillon non enregistré et de la re-vérification · `text-emerald-700` des
quatre confirmations d'écriture · `Card tone="warning"` des cinq états d'erreur ·
les quatre familles de `Badge` de `/app/health`. Aucune n'a bougé de teinte.

**Un seul cran a bougé : `text-red-600` → `text-red-700`** sur les six messages
d'erreur, pour rejoindre la valeur de `Field.tsx` (6,13:1 sur `paper` ; `red-600`
était en dessous). Le rouge reste le rouge.

### ⚠️ Le compte de saturées MONTE de 3, et c'est voulu — déclaré ici

`MealBuilder` 7 → 9, `EatingRhythmCard` 7 → 8. Ce sont **trois
`border-amber-200`** ajoutées aux trois bandeaux ambre fabriqués à la main, pour
qu'ils portent la forme de `Card tone="warning"` du kit (`border-amber-200
bg-amber-50`) au lieu d'un aplat sans arête. Ce sont des **états**, et le
critère de l'audit §5.2 est « une saturée doit porter un fait » — pas « le
compte doit baisser ». Si l'orchestrateur préfère l'ancien compte, retirer ces
trois `border-amber-200` est un geste isolé et sans autre effet.

---

## 3. Les primitives locales et les recopies supprimées

| geste | où | remplacé par |
|---|---|---|
| **champ recopié à la main** — `rounded-lg border border-gray-300 px-2 py-1 text-sm` | `FoodPreferencesCard:348` (édition d'une préférence) | **`inputClass` du kit** (`ui/Field.tsx`), + `flex-1` |
| **rayons locaux** — `rounded-lg` ×11, `rounded-md` ×1 | les 7 fichiers | `rounded-card` (×8), `rounded-part` (×1), `inputClass` (×1) |
| **`accent-gray-900`** et une case à cocher **sans `accent` du tout** | `StudentWeekPlanPage:1843`, `EatingRhythmCard:253` | **`accent-ink`** |
| **2e action principale de la vue** | `CookingCapacityCard` `variant="primary"` | **`variant="secondary"`** |

Deux de ces gestes méritent d'être lus, parce qu'ils réparent un défaut et pas
un style :

**Le champ recopié portait `text-sm` nu — 14 px sur téléphone.** C'est le défaut
que `Field.tsx` documente : Safari iOS zoome sur un champ sous 16 px au focus et
**ne dézoome pas**. `inputClass` est `text-base … lg:text-sm`. Mesuré après
correction, à 320 px : **les 24 contrôles de `/app/plan` et les 4 de
`/app/health` calculent tous `16px`**, bordure `rgb(142,120,134)` = `#8E7886` =
`line-strong`, rayon `12px`.
⚠️ `flex-1` et non `w-full` : dans une ligne flex c'est `flex-basis: 0%` qui
l'emporte sur la largeur, et `min-w-0` est déjà dans `inputClass`.

**La case à cocher sans `accent` n'était pas neutre : elle était BLEUE.** Un
contrôle natif sans `accent-color` est rendu dans la couleur d'accent du système
— bleue sur les réglages par défaut de macOS et de Windows. C'est-à-dire une
saturée que personne n'a choisie, **dans la teinte que `Badge tone="info"`
occupe**, six fois par écran. Invisible à tout grep : la faute était une absence.

**La démotion du `primary`.** `/app/plan` rendait **deux** boutons figue :
« Build my week » (`MealBuilder`) et « Save » (`CookingCapacityCard`, une des
quatre sections de la même fenêtre, dont les trois autres enregistrent en
`secondary`). Après : **un seul**, et c'est le geste pour lequel on vient sur cet
écran. `/app/health` garde son unique `primary` (conforme au relevé du kit §2).

---

## 4. L'avant / après mesuré, par fichier

Comptes **hors commentaires** (`git show HEAD:` → arbre courant). `neutres` couvre
`gray|slate|zinc|neutral|stone`.

| fichier | lignes | neutres | saturées | `bg/text-white` | rayons |
|---|---:|---|---|---|---|
| `StudentWeekPlanPage.tsx` | 2 040 | **69 → 0** | 0 → 0 | 1 → 0 | `lg×1` → `card×1` |
| `StudentProgressPage.tsx` | 910 | **46 → 0** | 0 → 0 | 2 → 0 | `full×1 lg×2 md×1` → `card×1 full×2 part×1` |
| `StudentHealthPage.tsx` | 404 | **5 → 0** | 2 → 2 | 0 → 0 | — |
| `MealBuilder.tsx` | 1 054 | **11 → 0** | 7 → 9 ⚠️ | 0 → 0 | `lg×2` → `card×2` |
| `FoodPreferencesCard.tsx` | 448 | **19 → 0** | 2 → 2 | 0 → 0 | `lg×2` → `card×1` |
| `EatingRhythmCard.tsx` | 406 | **14 → 0** | 7 → 8 ⚠️ | 0 → 0 | `lg×4` → `card×3 full×1` |
| `CookingCapacityCard.tsx` | 296 | **9 → 0** | 3 → 3 | 1 → 0 | `full×1` → `full×1` |
| **total** | **5 558** | **173 → 0** | 21 → 24 ⚠️ | **4 → 0** | **7 valeurs → 4 du kit** |

⚠️ = les trois `border-amber-200` déclarées au §2. Le `rounded-full` restant sur
`CookingCapacityCard` et `EatingRhythmCard` est sur des `<button>`, et celui de
`StudentProgressPage` sur un bouton + un point de graphique : conformes au kit §1.

**Les 5 occurrences de `gray-*` qui subsistent au grep brut sont dans des
commentaires que j'ai écrits** — ils expliquent pourquoi `bg-gray-50` et
`bg-white` ne pouvaient plus rien dire sur un fond `paper`. C'est délibéré : sans
la raison écrite, le prochain lecteur les remet.

---

## 5. Vérifié au navigateur (persona `ff060_house`, port 5191)

**`/app/plan` à 1280 px et 320 px, fenêtre de réglages ouverte, ses 4 sections
parcourues.** Les cinq frontons `SetupSection` portent l'équerre et le `paper-2`,
**sans un seul accent** — les cinq `accent="…"` retirés par l'orchestrateur n'ont
pas été réintroduits, et aucune équerre n'a été ajoutée nulle part.

**Mesures, pas impressions :**

| mesure | résultat |
|---|---|
| débordement horizontal à 320 px, `/app/plan` **fenêtre ouverte** | `scrollWidth = clientWidth = 320` — **aucun élément hors cadre** |
| débordement horizontal à 320 px, `/app/health` | `320 / 320`, **aucun** |
| débordement horizontal à 320 px, `/app/progress` | `320 / 320`, **aucun** |
| taille de police des 24 contrôles de `/app/plan` à 320 px | **`16px`** partout |
| bordure de ces contrôles | `rgb(142,120,134)` = `line-strong` (3,84:1) |
| rayon de ces contrôles | `12px` = `--radius-card` |
| pastille active du sélecteur de fenêtre | `bg rgb(99,44,76)` = `fig-700`, texte `paper`, rayon plein |
| texte rendu en `fig-*` sur `/app/progress` | **aucun nœud** — zéro chiffre teinté |

**Les classes que j'emploie existent bien dans le CSS généré** (Tailwind 4 ne
génère que ce qu'il voit ; une classe absente rend un nœud nu). Vérifié dans la
feuille servie : `.rounded-part { border-radius: var(--radius-part) }`,
`.accent-ink { accent-color: var(--color-ink) }`,
`.hover\:text-fig-800 { … color: var(--color-fig-800) }`, `bg-line`, `bg-paper-2`,
`text-label` (11 px, 1,1 px d'approche).

### Ce que je n'ai PAS pu rendre, et il faut le savoir

1. **La grille du rythme avec des données.** `ff060_house` n'a aucun repas
   journalisé : les cases `bg-line` et les points `bg-ink` sont vérifiés en CSS
   généré, pas à l'œil sur de vraies données.
2. **`/app/progress` à 320 px avec du contenu** (il rend, mais vide).

**La cause est le profil navigateur partagé, et elle est mesurée.** La clé
`sb-127-auth-token` a été réécrite par des sessions voisines **trois fois pendant
ma fenêtre**, avec trois `sub` différents (`38a50625` → `0a3594f1` → `ee4bab75`) :
chaque rechargement risquait d'atterrir sur la garde « This space is for
students » d'un autre persona. J'ai reposé mon jeton par le script sanctionné,
jamais vidé `localStorage`, jamais fermé un onglet d'autrui, et j'ai ouvert mon
propre onglet (`tab-7`).

> Piège confirmé pour la suite : **le panneau garde une peinture périmée**. À un
> instant, le DOM disait `h1 = « What you cannot eat »` avec 4 champs à 16 px
> pendant que la capture montrait encore l'écran de garde. **La mesure JavaScript
> est l'autorité, la capture ne l'est pas.**

---

## 6. Signalé, pas réparé

### 6.1 ⛔ `keel/components/plan/` — 4 fichiers, 612 lignes, attribués à PERSONNE

**C'est le trou le plus important que je rapporte.** L'audit §4 attribue 22
composants partagés à sept familles. Il **oublie tout le dossier `plan/`** — qui
est le corps visible de `/app/plan` : la grille de la semaine, les blocs de
cuisine, les plats, la lecture d'énergie.

| fichier | lignes | neutres | saturées | monté par |
|---|---:|---:|---:|---|
| `plan/PlanResult.tsx` | 209 | 3 | 1 | `MealBuilder` (**C**) |
| `plan/PlanGrid.tsx` | 146 | 11 | 2 | `PlanResult` |
| `plan/EnergyReadout.tsx` | 175 | 9 | 1 | `MealBuilder` (**C**), `DishCard` (**B**), `TodayPage` (**B**) |
| `plan/KitchenBlock.tsx` | 82 | 4 | 0 | `PlanResult` |
| **total** | **612** | **27** | **4** | |

Je ne l'ai pas ouvert : il n'est pas dans ma liste, et `EnergyReadout` est monté
par la famille B autant que par moi. **Conséquence visible tout de suite** : sur
`/app/plan` rendu, « Your week at a glance » affiche le jour courant **en vert
émeraude** (`PlanGrid.tsx:66`, `PlanResult.tsx:162`) — une saturée qui marque un
**JOUR**, pas un état du système, exactement le critère de l'audit §2. Et son
tableau porte `text-gray-500` / `text-gray-400`, donc l'écran le mieux converti du
lot garde son cœur en gris. À attribuer.

### 6.2 Traduction : le constat de l'audit est PÉRIMÉ, et dans le bon sens

L'audit §6.1 et le master §2 écrivent que `/app/plan` (2 030 lignes) et
`/app/progress` (888) sont « sans un seul `t()` ». **Ce n'est plus vrai** : la
session de traduction les a finis pendant ma fenêtre. Recherche de chaînes en
dur (`>Texte<`, `placeholder=`, `aria-label=`, `alt=`) sur mes sept fichiers :
**zéro**. Tout passe par `t()` ou `mealCopy()`.

**Je n'ai traduit ni déclaré aucun namespace, et ajouté aucune chaîne** — toutes
les distinctions que j'ai reprises passent par une forme (encre, trait, lavis,
cran d'étiquette), jamais par un mot neuf. Les seuls attributs ajoutés sont
`aria-pressed` (×2 groupes) et `role="group"`, qui ne portent pas de texte.

### 6.3 L'équerre s'empile sur `/app/progress`

L'arbitrage dit « 3 équerres visibles par écran au pire, c'est tenable ».
Mesuré : `/app/progress` porte **7 `SectionLabel`**, et à 1280 px sur un compte
sans données **six** sont visibles en même temps, alignées dans la même gouttière
gauche — ce qui les fait lire comme un motif répété plus que comme une signature.
Je n'en ai pas ajouté une seule et je n'en ai retiré aucune : c'est une décision
de kit (`Card.tsx` la pose dans `SectionLabel`), donc à l'orchestrateur.

### 6.4 Rouge d'une autre session : `npx tsc -b` et `vitest`

- **`npx tsc -b` : rouge, et pas une ligne à moi.** Deux foyers observés, l'un
  après l'autre, au fil des sauvegardes des familles voisines :
  - `keel/components/ui/Marketing.tsx` — 4 erreurs `TS1005: ')' expected`
    (ligne 130), fichier **partagé**, en cours d'édition ;
  - `keel/components/DeviationDialog.tsx:82` — `TS1355: A 'const' assertions can
    only be applied to references to enum members…`, fichier de la **famille B**.

  **Zéro erreur sur mes sept fichiers**, vérifié en filtrant le rouge d'autrui.
- **`vitest` : 2 fichiers rouges, 3 tests**, aucun n'important mes fichiers :
  `src/edge/coverage-guard.int.test.ts` (2 nouvelles fonctions edge et 2 nouveaux
  triggers hors liste connue) et `src/keel/copy/planRefusals.int.test.ts` (7 clés
  `household.error.*` écrites mais injoignables — chantier foyer/traduction).
  **813 tests passent.**
- Pendant ma fenêtre, `ui/Marketing.tsx`, `keel/pages/SetupPage.tsx` et
  `pages/UpgradePlan.tsx` ont chacun été **syntaxiquement cassés** par leur
  famille, ce qui met **tout** le serveur de dev en 500 (l'app entière devient
  irrendable, pas seulement la page en cause). Si une review doit juger au
  rendu : vérifier d'abord que le graphe transforme.

### 6.5 Aucun besoin de kit

Rien à ajouter ni à changer dans `ui/`. Les huit primitives ont couvert le lot ;
tout ce que j'ai écrit en local est ce que le kit ne peut pas deviner (pastilles
de choix, cases natives, grille de graphique, mise en page à 320 px).

### 6.6 Aucun changement de logique

Aucune requête, garde, route, valeur par défaut ni appel d'API touché. Les seuls
ajouts non visuels sont `aria-pressed` et `role="group"` — l'état de sélection
cessait d'être annoncé dès qu'on lui retirait sa couleur, ce qui aurait fait de
la conversion une régression d'accessibilité.
