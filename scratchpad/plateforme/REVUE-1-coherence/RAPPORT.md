# REVUE 1 — LA COHÉRENCE

> Tout nombre de ce document est **mesuré au rendu** sur `http://revue1.localhost:5191`
> (origine privée, `localStorage` à moi seul — Vite écoute sur `::1`, `*.localhost`
> résout dessus, et le plafond de 5 serveurs n'a donc pas été touché).
> Deux largeurs : **1280 × 900** et **320 × 800**. Personas : `ff060_house@example.com`
> (élève avec objectif + foyer) et `qa-coach-1785895486817569e40@test.dev`
> (coach actif, **3 élèves**, choisi exprès : le persona rendu par `qa-session.sh coach`
> a zéro élève et ne rend que des états vides).
> Rien n'a été modifié dans `frontend/`. Aucun commit, aucun `stash`, aucun `supabase`.
> Les équerres et les aplats figue sont comptés par **fenêtre glissante** sur les
> coordonnées document — pas en scrollant, parce que le panneau ne repeint qu'à scroll 0.

---

## LE VERDICT EN UNE PHRASE

**Le châssis est un produit ; le produit ne l'est pas encore** — quatorze écrans sur
seize sont indiscutablement la même maison (même papier, quatre rayons et pas un
cinquième, un seul cran d'étiquette, un seul `h1` en Young Serif, zéro débordement à
320 px, et une barre alignée au pixel sur la vitrine), mais **`/upgrade` parle
français quand l'app parle anglais**, **`/account` n'a ni `h1` ni une seule lettre de
display**, et **l'équerre est dosée par une primitive au lieu d'une règle** : elle
s'empile à **huit dans un même viewport** sur `/coach/clients/<id>` et manque à
**66 étiquettes sur 77**.

---

## 1. LE TABLEAU DES SEIZE ÉCRANS

`champ` = couleur réellement peinte, relevée par échantillonnage de 9 points
(`elementFromPoint` + remontée jusqu'au premier fond opaque).
`rayons` = valeurs de `border-radius` calculées, dédupliquées.
`éq. vis.` = maximum d'équerres **simultanément dans un viewport** (1280 / 320).
`figue vis.` = maximum d'aplats `fig-700`/`fig-800` simultanément dans un viewport.
`ovf` = `scrollWidth − clientWidth` à 320 px.

| # | écran | champ | rayons rendus | hors-vocab. | densité (`padding-top│left` × n) | typo | éq. tot. | **éq. vis.** | **figue vis.** | ovf 320 |
|---|---|---|---|---|---|---|---:|---:|---:|---:|
| 1 | `/app/setup` | `paper` | 12px, full | **0** | `10│12`×11, `16│16`×2 | h1 Young 43,2/27,2 · label 11px | 3 | 2 / 2 | **2** / 1 | 0 |
| 2 | `/app/today` | `paper` | 12px, full | **0** | `12│12`×3, `12│16`×1 | idem | 2 | 2 / 2 | 1 / 1 | 0 |
| 3 | `/app/chat` | `paper` | 12px, full | **0** | `8│12`, `16│16`, `10│12` | idem | 1 | 1 / 1 | **2** / **2** | 0 |
| 4 | `/app/plan` | `paper` | 12px, full | **0** | `16│16`×18, `8│12`×6 | idem | 3 | 3 / 3 | 1 / 1 | 0 |
| 5 | `/app/progress` | `paper` | 12px, full | **0** | `16│16`×7 | idem | 8 | **7 / 6** | **2** / **2** | 0 |
| 6 | `/app/health` | `paper` | 12px, full | **0** | `10│12`×4, `16│16`×2 | idem | 3 | 3 / 3 | **2** / 1 | 0 |
| 7 | `/app/household` | `paper` | 12px, full | **0** | `16│16`×9, `10│12`×9 | idem · **8 textes #000** | 10 | **5 / 4** | 1 / 1 | 0 |
| 8 | `/coach` | `paper` | 12px, full | **0** | `16│16`×3, `10│12`, `0│0` | idem | 3 | 3 / 3 | **2** / 1 | 0 |
| 9 | `/coach/doctrine` ⚠️ | `paper` + amber | 12px, full | **0** | `16│16`×1 | idem | 1 | 1 / 1 | 1 / 0 | 0 |
| 10 | `/coach/weekly` ⚠️ | `paper` | 12px, full | **0** | `16│16`×1 | idem | 1 | 1 / 1 | 1 / 0 | 0 |
| 11 | `/coach/protocol` | `paper` + `paper-2` | 12px, full | **0** | **`0│0`×9, `12│12`×5, `16│16`×3, `10│12`×1** | idem · **9 textes + 1 filet #000** | 4 | 3 / 2 | 1 / 1 | 0 |
| 12 | `/coach/meals` | `paper` | 12px, full | **0** | `10│12`×3, `16│16`, **`32│32`** | idem | 3 | 2 / 2 | 1 / 1 | 0 |
| 13 | `/coach/billing` ⚠️ | `paper` + amber | 12px, full | **0** | `16│16`×1 | idem | 1 | 1 / 1 | 0 / 0 | 0 |
| 14 | `/coach/templates` ⚠️ | `paper` + red-50 | 12px, full | **0** | **`8│8`×2, `24│24`×2** | idem | 1 | 1 / 1 | 0 / 0 | 0 |
| 15 | `/coach/import` | `paper` + red-50 | 12px, full | **0** | **`8│8`, `10│12`, `24│24`** | idem | 3 | 3 / 3 | 1 / 1 | 0 |
| 16 | `/coach/clients/<id>` | `paper` + `paper-2` | 12px, full, **4px**×1 | **0** | **`16│16`×5, `8│12`×2, `12│12`×2, `24│24`, `10│12`** | idem | 13 | **8 / 6** | 1 / 1 | 0 |
| + | `/account` ×3 onglets | `paper` sur voile `ink/40` | 12px, full | **0** | `16│16`×2, `10│12`×2, `12│12` | **`h1` = 0 · Young Serif = 0** | 1–2 | 1–2 | **2** / **2** | 0 |
| + | `/upgrade` | `paper` + `fig-950` | 12px, full | **0** | **`32│32`** / `24│24` à 320 | h1 43,2 · Young 20/36/48 · **label = 0** | 1 | 1 / 1 | **0** / 0 | 0 |

⚠️ = **état vide ou état d'erreur seulement** — `document.scrollHeight` égal à la hauteur
du viewport et une seule carte rendue. Voir §5.

### Ce que le tableau dit tout de suite

- **Palette : uniforme, sans exception.** Les 9 points d'échantillonnage donnent `paper`
  (`#FBF8FA`) sur **les seize écrans**. Aucun écran plus froid ni plus chaud que ses
  voisins ; aucun `bg-white`, aucun `gray-50` en champ. `paper-2` n'apparaît qu'en
  fronton de section (`/coach/protocol`, `/coach/clients`) et `fig-950` qu'une fois
  (`/upgrade`), conformément au « un seul bloc sombre par page ».
- **Rayons : le contrat est tenu à 100 %.** `badRadii` est vide sur **les seize écrans,
  aux deux largeurs**. Les seules valeurs rendues sont `12px`, `16px`, `full` et un
  unique `4px`. Les sept valeurs concurrentes de l'audit ont réellement disparu du
  rendu — c'est le résultat le plus net du chantier.
- **`text-label` : un seul cran, partout.** `11px / letter-spacing 1.1px / ink-soft`,
  identique sur les quinze écrans où il apparaît. Zéro variante.
- **320 px : zéro débordement, seize sur seize, deux personas.** C'est la chose la plus
  facile à rater et elle est propre.
- **L'équerre a toujours un mot** : `eqNoWord = 0` sur tous les écrans mesurés.
- **Aucune figue dans une pastille**, nulle part. Les saturées trouvées au rendu portent
  toutes un fait (danger `red-700`/`red-200`, `Badge` `critical`/`positive`/`caution`,
  pastilles de jour `WeekView`).

---

## 2. LES INCOHÉRENCES, CLASSÉES

### 🔴 BLOQUEURS — ça se voit et ça casse l'unité

#### B1. `/upgrade` est en français quand tout le reste est en anglais

`pages/UpgradePlan.tsx` n'importe **ni `useTranslation` ni `react-i18next`** ; les
chaînes sont écrites en dur.

```
mesuré : localStorage['sophia.ui_locale'] = "en"   ·   document.documentElement.lang = "en"
rendu  : "Retour" · "Passe à la vitesse supérieure" · "Choisis le plan qui correspond
          à tes ambitions." · "Mensuel" / "Annuel" · "Le plus populaire" ·
          "Choisir Le Système" / "Choisir L'Alliance" / "Choisir L'Architecte"
voisins : "Set up your kitchen" · "My week's plan" · "Your household" ·
          "What you cannot eat" · "Your students"
```

`pages/UpgradePlan.tsx:269` `Retour` · `:290` `Passe à la vitesse supérieure` ·
`:308` `Mensuel` · `:328` `Annuel` · `:421` `Choisir Le Système` ·
`:492` `Le plus populaire` · `:545` `Choisir L'Alliance` · `:634` `Choisir L'Architecte`.

Une langue différente n'est pas un écart de charte, c'est une autre société. C'est le
seul défaut du lot qu'un visiteur nomme sans qu'on le lui montre.

**Corollaire mesuré, même fichier :** 12 apostrophes droites `'` rendues
(`L'Alliance`, `qu'il`, `l'outil`…). Charte §3 : apostrophe typographique `’`
(U+2019), *non négociable*.

#### B2. `/account` n'a ni `h1` ni une seule lettre de Young Serif

C'est **la seule surface des seize** dans ce cas, aux trois onglets et aux deux largeurs.

```
mesuré /account, /account?tab=settings :  h1 = []        Young Serif = 0 nœud
mesuré /account?tab=subscription       :  h1 = []        Young Serif = 1 (H3 24px)
mesuré les 15 autres                   :  h1 = 1, Young Serif, 43,2px @1280 / 27,2px @320
```

Le titre de l'écran est `H2 16px Public Sans "Nora"`. La raison structurelle :
`/account` n'est pas une page mais un **tiroir** —
`<div class="fixed inset-0 z-50 flex justify-end bg-ink/40 backdrop-blur-sm">` — donc
il n'a jamais reçu le châssis (`ui/Page.tsx#PageHeader`) d'où vient le titre display
des quinze autres. Il porte la palette de la maison mais pas sa voix.
Fichier : `frontend/src/components/UserProfile.tsx`.

#### B3. L'équerre est dosée par une primitive, pas par une règle — le chiffre du dossier est faux par 2,7×

**La décision au dossier dit « 3 visibles simultanément au pire sur `/app/household` ».
La famille qui a signalé 6 sur `/app/progress` avait raison — et sous-comptait encore.**
Mesuré par fenêtre glissante sur les coordonnées document :

| écran | équerres sur la page | **max simultané @1280×900** | **@320×800** |
|---|---:|---:|---:|
| **`/coach/clients/<id>`** | **13** | **8** | 6 |
| **`/app/progress`** | 8 | **7** | **6** |
| `/app/household` | 10 | **5** | 4 |
| `/coach/protocol` | 4 | 3 | 2 |
| `/app/plan` · `/app/health` · `/coach/import` · `/coach` | 3 | 3 | 3 |
| les 9 autres | 1–3 | 1–2 | 1–2 |

Sur `/app/progress` les sept équerres sont à y = 19, 228, 375, 478, 581, 685, 788 —
**espacées de ~103 px, toutes rigoureusement identiques** (`H2.eq.text-label.uppercase.text-ink-soft`).
Sur `/coach/clients/<id>`, huit d'affilée : *Week summary · Day by day · What held, what
slipped · Adherence · Line by line · Declared in advance · What was logged · What they
cannot eat*.

**La cause est une seule ligne :**

```
frontend/src/keel/components/ui/Card.tsx:111
  className={`eq mb-3 text-label font-semibold uppercase text-ink-soft ${className}`}
```

`SectionLabel` **émet toujours une équerre**, et il est importé par **31 fichiers**.
Le dosage n'est donc pas un choix d'écran : il est proportionnel au nombre de cartes.
Un écran à 7 cartes rend 7 équerres, un écran à 13 en rend 13.

**Et le symétrique, mesuré sur tout le dépôt :**

```
text-label AVEC   .eq :  11
text-label SANS   .eq :  66      → 14 % des étiquettes portent la marque
```

Sur `/app/today`, trois étiquettes du même cran, du même rôle, dans le même écran :
`"Days logged this week"` (sans), `"Today, area by area"` (sans),
`"What I record"` (**avec**). Charte §4 : l'équerre « marque l'origine de ce qui est
spécifié ». Une marque qui tombe sur 7 sections voisines ne marque plus rien ; une
marque absente de 66 étiquettes sur 77 ne se lit pas comme une règle.

---

### 🟠 DÉFAUTS — ça se voit

#### D1. Deux aplats figue dans un même viewport sur 8 surfaces

Compté **au rendu**, pas dans le TSX. `primary` est en figue, et **l'état actif de la
navigation l'est aussi** — la pastille de nav et l'action principale sont le même aplat.

| surface | figue simultanés | qui |
|---|---:|---|
| `/auth` | **4** | pastille `EN` + `Sign in` (w422) + `Create a free account` + `Create a coach account` |
| `/` | **3** | pastille `EN` + `Get started` (barre, w106) + `Get started` (héros, w133) |
| `/account` ×3 | **2** | onglet actif `Account` + `Save` — **à 320 px les deux font 287 px de large, empilés** |
| `/app/setup` | **2** | tuile choisie `An adult` + `Continue` (les deux `<Button>` `rounded-full bg-fig-700`) |
| `/app/progress` | **2** | nav `Progress` + segment choisi `7 days` |
| `/app/chat` | **2** @320 | onglet bas `Chat` + `Send`, 106 px d'écart |
| `/app/health` · `/coach` | **2** @1280 | nav active + `Add` / `Invite a student` |

Le cas `/account` est le plus net parce que les deux figues sont des **pilules de même
forme et de même taille** : rien ne dit laquelle est l'action. Le cas `/app/setup` est
le plus contradictoire — `SetupPage.tsx:935` explique en commentaire pourquoi une tuile
de 200 px ne prend *pas* l'aplat de marque, et la tuile `An adult` (67 px) le prend.

#### D2. La densité n'est pas un système — et le coach n'a pas celui de l'élève

Paddings de carte rendus (largeur > 240 px) :

- côté élève : `16│16`, `12│12`, `10│12`, `8│12`, `12│16`
- côté coach : **plus `8│8`** (`/coach/templates`, `/coach/import`) et **`24│24`**
  (`/coach/templates`, `/coach/import`, `/coach/clients`), et **`32│32`** (`/coach/meals`)
- `/upgrade` : **`32│32`** à 1280, `24│24` à 320 — la seule surface à 32 px chez l'élève

Deux écrans du même rôle respirent différemment :
`/coach/templates` (`8│8`×2 + `24│24`×2) contre `/coach/meals` (`10│12`×3 + `16│16` + `32│32`),
alors que ce sont deux bibliothèques du coach. Et `/coach/clients/<id>` empile
**cinq échelles** dans un seul écran : `16│16`×5, `8│12`×2, `12│12`×2, `24│24`, `10│12`.

`8px` et `24px` n'existent nulle part côté élève. Le kit a fixé les rayons et pas les
marges intérieures ; c'est là que ça se voit.

#### D3. Le mot-symbole casse sur les deux écrans du parcours d'inscription

Cinq sites, **trois tailles**, et l'écart tombe exactement sur la couture :

| fichier:ligne | classe | rendu | surface |
|---|---|---|---|
| `keel/components/PublicHeader.tsx:182` | `font-display text-lg` | **18 px** | la vitrine |
| `keel/components/KeelAppShell.tsx:248` | `font-display text-lg` | **18 px** | les 14 écrans d'app |
| `pages/Auth.tsx:254` | `font-display text-lg` | **18 px** | `/auth` |
| **`keel/pages/SetupPage.tsx:843`** | `font-display text-xl` | **20 px** | `/app/setup` |
| **`pages/UpgradePlan.tsx:275`** | `font-display text-xl` | **20 px** | `/upgrade` |
| `keel/components/PublicHeader.tsx:376` | `font-display text-sm` | **14 px** | le pied de vitrine |

Les deux écarts sont **documentés en commentaire, et ils se contredisent** :
`KeelAppShell.tsx:239-247` écrit « `text-lg` = 18 px, SOUS le plancher — écart **assumé**,
aligner l'app sur la vitrine vaut mieux que gagner 2 px de pureté » ;
`SetupPage.tsx:841-843` écrit « `text-xl` = 20 px, **le PLANCHER** — `PublicHeader` la
pose à 18 px et `PublicFooter` à 14 px : les deux sont sous le plancher, **signalé** ».
Deux familles ont répondu à la même question dans les deux sens et chacune a écrit
pourquoi. C'est exactement le genre d'écart qu'une revue de cohérence existe pour
trancher — et il tombe sur `/app/setup`, le **premier** écran d'un nouvel inscrit.

> **Note qui désamorce le débat de fond :** le plancher de 20 px est déjà enfreint par
> **le cran `text-sub` de la charte elle-même**. Mesuré sur `/` : `--text-sub = 1.2rem`
> = **19,2 px**, rendu en `font-display` **dix fois** sur la seule page d'accueil
> (`font-display text-sub` ×7 en `H2`, ×3 en `SPAN`). La charte §3 pose le plancher et
> sa propre échelle §3 le franchit. Le débat 18/20 porte sur 2 px dans un système qui
> livre déjà du display à 19,2 px par construction.

#### D4. Neuf textes et un filet à `#000000` — le noir pur n'est pas dans la palette

`frontend/src/App.tsx:87` enveloppe **toute** l'application :

```tsx
<div className="min-h-screen bg-white text-black font-sans">
```

`bg-white` est masqué partout (`KeelAppShell` repose son `bg-paper` par-dessus —
`KeelAppShell.tsx:511` commente d'ailleurs « `bg-paper` et PAS `bg-white`: le blanc pur
n'est pas dans la palette »). **`text-black` ne l'est pas.** Tout texte dont aucun
ancêtre ne pose de couleur tombe à `#000000` au lieu d'`ink` `#23191F`. Rendu, mesuré :

- `/app/household` : **8** `<span className="font-medium">` — les prénoms du foyer
  (Nora, Alex, Theo, Mia, dans deux listes).
  `keel/pages/HouseholdPage.tsx:1160`, `:1228`, `:1955`, `:913`, `:1495`
- `/coach/protocol` : **9** `<span className="font-medium">` — les noms de groupes
  alimentaires (Protein, Vegetables, Fruit, Grains, Legumes, Dairy, Fats, Drinks,
  Treats & extras). `keel/pages/CoachProtocolPage.tsx:1310`
- `/coach/protocol` : **1 filet noir** —
  `keel/pages/CoachProtocolPage.tsx:1209` `<div className="mt-4 border-t pt-4">`.
  Aucune classe de couleur : Tailwind 4 rend `currentColor`, donc `text-black`, donc un
  trait `#000` là où la charte veut `line` `#E3DAE0` (1,30:1 → un filet noir à 16:1 est
  20 fois plus fort que prévu, et c'est le plus visible des trois symptômes).

23 `className="font-medium"` sans couleur existent dans le dépôt ; seuls ceux dont la
chaîne d'ancêtres est muette rendent noir, d'où 17 occurrences visibles et pas 23.
J'ai vérifié les 4 autres `border` nus du périmètre —
`ui/Card.tsx:66`, `SetupPage.tsx:935`, `WeekView.tsx:260`, `CoachMealsPage.tsx:345` —
**ils reçoivent tous leur couleur d'une conditionnelle appended juste après : ce sont
des faux positifs, à ne pas « réparer ».**

---

### 🔵 DÉTAILS — il faut chercher

- **D5 — Le rayon des cartes change en franchissant la porte.** `/` ne rend que
  `16px` + `full` ; les seize écrans d'app rendent `12px` + `full`. `/auth` fait la
  transition en rendant les deux (`16px`×3 pour ses cartes, `12px`×2 pour ses champs).
  Les deux valeurs sont au vocabulaire, donc rien n'est « faux » — mais une carte est
  mesurablement moins ronde dans l'app que sur la vitrine.
- **D6 — Deux couleurs d'étiquette pour un seul cran.**
  `ui/Card.tsx:111` (`SectionLabel`) pose `text-ink-soft` ; `ui/SetupSection.tsx:93`
  pose `text-ink`. Un seul des deux a été observé au rendu (`ink-soft` partout), donc
  l'écart est latent, pas visible — mais il est dans le kit.
- **D7 — `/upgrade` n'utilise pas le cran `text-label`.** `labels = []` : c'est la seule
  surface des seize sans une seule étiquette au cran de la maison.
- **D8 — `/upgrade` rend trois cartes de prix** là où `Marketing.tsx#PriceCard`
  « interdit une seconde carte » (charte §9 #3). Elles sont réécrites localement, pas
  via la primitive. À décharge : `font-variant-numeric` mesuré = `normal`, donc le
  piège du `tabular-nums` de Young Serif (« 1 2,99 € ») **n'a pas été réintroduit**, et
  les deux pastilles (`-20 %`, `Le plus populaire`) sont bien des
  `<Badge tone="neutral">` — `bg-line text-ink-soft` mesuré, **aucune figue en pastille**.
- **D9 — `/coach/clients/<id>` : un `rounded-part` (4px) hors figure.** KIT-CONTRAT §1
  réserve `4px` à « une petite pièce **dans une figure** ». L'élément est
  `<span class="h-0.5 w-3 rounded-part bg-line-strong">` — un tiret de 2 × 12 px dans la
  légende de `WeekView`. Défendable comme pièce de figure ; signalé pour mémoire.
- **D10 — `/coach/clients/<id>` : une bordure `emerald-500` sur 4 côtés**
  (`<span class="h-3 w-3 rounded-full border-2 border-emerald-500">`) et trois pastilles
  saturées pleines (`bg-emerald-500`, `bg-amber-400`, `bg-red-500`),
  `keel/components/WeekView.tsx:590-592`. Elles portent un fait (jour tenu / partiel /
  manqué), donc elles passent le critère de l'arbitrage §5.2 — mais ce sont les seules
  saturées **pleine intensité** du produit, les `Badge` étant tous en `-50`/`-700`.
- **D11 — `components/shared/ProfessionalSupportCard.tsx` porte 4 pastilles ambre
  faites main** (`bg-amber-50/70`, `bg-amber-100/80`, `text-amber-900` — aucun n'est un
  ton de `Badge`). **Zéro importeur** : le composant n'est rendu par aucun des seize
  écrans. Rien à réparer, mais c'est un pistolet chargé pour le prochain qui le
  rebranche.
- **D12 — `/auth` fabrique deux pastilles à la main** (`Auth.tsx:1042`
  `bg-blue-50 text-blue-700`, `:1123` `border-amber-200 bg-amber-50 text-amber-800`) là
  où `<Badge tone="info">` et `tone="caution"` rendent exactement ça. Non observées au
  rendu sur le chemin nominal (états d'erreur/confirmation).

---

## 3. LA COUTURE : `/` → `/auth` → `/app/setup` → `/app/today`

Enchaînée dans cet ordre, à 1280 px, quatre chargements réels.

| | `/` | `/auth` | `/app/setup` | `/app/today` |
|---|---|---|---|---|
| hauteur de barre | 95 px (rangée haute **56**) | **57** | **63** | **57** |
| conteneur intérieur | **1152** (`max-w-6xl`) | **512** (`max-w-lg`) | **768** (`max-w-3xl`) | **1152** |
| `padding-left` intérieur | 16 (`px-4`) | **20** (`px-5`) | 16 | 16 |
| fond de barre | `paper/0.95` | **transparent** | **transparent** | `paper/0.95` |
| `position` | `sticky` | **`static`** | **`static`** | `sticky` |
| `backdrop-filter` | `blur(8px)` | **`none`** | **`none`** | `blur(8px)` |
| bordure basse | `1px line` | `1px line` | `1px line` | `1px line` |
| mot-symbole | Young Serif **18 px** w400 `ink` | **18 px** | **20 px** | **18 px** |
| **x du mot-symbole** | **80** | **404** | **272** | **80** |
| centre-y du mot-symbole | **28** | **28** | **31** | **28** |
| équerre `::before` | 10×14 · trait 2px · r5 · `fig-700` | *identique* | *identique* | *identique* |
| langue | EN | EN | EN | EN |

### Le jugement

**Oui, c'est la même société — et la preuve la plus forte est que la promesse la plus
ambitieuse du chantier est tenue.** `KeelAppShell.tsx:227-232` affirme que la barre de
l'app est celle de `PublicHeader` « au pixel ». **Vérifié, et c'est exact** :
`/app/today` et la rangée haute de `/` sont identiques sur les dix propriétés mesurées —
57 px de haut, `paper/0.95`, `1px line`, `sticky`, `blur(8px)`, conteneur 1152, `px-4`,
mot-symbole Young Serif 18 px en x = 80 / centre-y = 28, équerre 10×14/2px/r5/`fig-700`.
Le mot-symbole **ne bouge pas d'un pixel** entre la page d'accueil et le premier écran
connecté. C'est la partie du chantier qui compte le plus, et elle est propre.

**Mais le visiteur ne va pas de `/` à `/app/today`. Il passe par les deux écrans du
milieu, et ce sont exactement les deux qui cassent.** Le mot-symbole fait
**80 → 404 → 272 → 80** en quatre écrans consécutifs, et **18 → 18 → 20 → 18 px**. Il
part collé à gauche, se retrouve centré, revient à mi-chemin en ayant grossi, puis
retrouve sa place. Aucune de ces positions n'est laide ; c'est la **suite** qui se lit
comme quatre gabarits empruntés, et elle se lit précisément au moment que le chantier
existait pour effacer. La barre perd aussi son `sticky` et son `backdrop-blur` au
milieu, donc son comportement au défilement change deux fois sur le chemin.

**Ce qui traverse la couture intact**, et ce n'est pas rien : le champ `paper`, l'équerre
au pixel identique, le cran `text-label` en 11px/1.1px/`ink-soft` (`FOR WHOEVER COOKS
FOR A HOME` sur `/`, `SIGN IN` sur `/auth`, `YOU` sur `/app/setup`, `WHAT I RECORD` sur
`/app/today` — même objet), les champs à `border-line-strong` et rayon 12px, le `h1`
Young Serif sans graisse, et la figue réservée au texte, aux traits et aux boutons
pleins.

**Ce qui ne la traverse pas** : le rayon des cartes (16 px avant la porte, 12 px après),
et le nombre d'actions figue par vue — `/` en montre 3 et `/auth` en montre **4**, donc
un visiteur apprend sur la vitrine que la figue ne veut *pas* dire « l'action », puis
doit désapprendre dans l'app.

*Captures : `/` (3 figues, équerre + kicker), `/auth` (mot-symbole centré, 4 figues),
`/app/setup` (mot-symbole 20 px à x = 272), `/app/today` (barre identique à `/`),
`/account` (deux pilules figue, zéro display), `/upgrade` (français, trois cartes de
prix) — prises à 1280 × 900 pendant la session.*

---

## 4. CE QUI VA BIEN, ET QU'IL FAUT PROTÉGER

Une revue qui ne liste que des défauts fait « réparer » ce qui marche. Les quatre
résultats à ne pas défaire :

1. **Zéro rayon hors vocabulaire, seize écrans, deux largeurs.** L'audit comptait sept
   valeurs concurrentes. Il en reste quatre, et les quatre sont les bonnes.
2. **Zéro débordement horizontal à 320 px, seize écrans, deux personas.**
3. **Un seul champ, `paper`, sur les seize écrans** — vérifié par pixel, pas par grep.
4. **Aucune figue dans une pastille, nulle part**, et les quatre familles d'état de
   `Badge` intactes. La garde de forme du chantier tient.

---

## 5. CE QUE JE N'AI PAS PU VÉRIFIER, ET POURQUOI

1. **Quatre écrans coach n'ont rendu qu'un état vide ou d'erreur** :
   `/coach/doctrine` (bandeau ambre), `/coach/weekly` (« No weekly read yet »),
   `/coach/billing` (bandeau ambre), `/coach/templates` (bandeau rouge d'échec de
   chargement). `scrollHeight` = hauteur de viewport, une seule carte. **Leur densité,
   leur compte d'équerres et leur compte d'aplats figue ne sont donc pas mesurés au
   contenu.** C'est le trou le plus important de cette revue : `/coach/doctrine` est
   l'écran d'écriture principal du coach et pèse 15 saturées au comptage disque
   (`MESURE-APRES.txt`) — je n'ai vu aucune des quinze. Il faudrait un coach avec une
   doctrine publiée et un point hebdo calculé.
2. **`/coach/import` et `/coach/templates` rendent une bordure d'erreur rouge** plutôt
   que leur contenu nominal ; ce que j'ai mesuré est leur chemin d'échec.
3. **`/app/chat` n'a pas d'historique** (`scrollHeight` = 800, aucune bulle rendue),
   ce qui est un défaut connu du dépôt et non de ce chantier. **La palette des bulles de
   conversation n'est donc pas vérifiée** — c'est la deuxième lacune sérieuse, parce
   qu'une bulle est une surface colorée par définition.
4. **La couche modale n'est pas testée** : `DeviationDialog`, `WeeklyCheckInDialog`,
   `InviteDialog`, `DoctrineStartDialog`, `HouseholdMergeCard` exigent une interaction.
   Seul le voile de `/account` (`bg-ink/40 backdrop-blur-sm`) a été mesuré.
5. **Je n'ai pas recalculé les 17 couples de contraste.** J'ai vérifié que les jetons
   *rendus* sont bien les hex de la charte (`paper` `251,248,250`, `ink` `35,25,31`,
   `ink-soft` `106,90,100`, `line` `227,218,224`, `line-strong` `142,120,134`,
   `fig-700` `99,44,76`, `fig-950` `36,16,30`) et j'ai pris les ratios de KIT-CONTRAT §8
   pour acquis. Les seules paires *non* couvertes par ce document sont celles introduites
   par les défauts D4 (`#000` sur `paper`) et D5.
6. **`keel/pages/ProgressPage.tsx`** (mort, zéro importeur) et
   **`keel/pages/mealPlan/StudentMealPlanPage.tsx`** (refactor d'autrui) sont hors
   périmètre par les arbitrages AUDIT §5.3 / §5.4 ; je ne les ai pas rendus.
7. **`/coach/clients/<id>` a été mesuré sur un coach que `qa-session.sh coach` ne
   choisit pas.** Le persona du script (`qa-coach-1786570652512b2d4f6@test.dev`) a zéro
   élève ; sur lui, `/coach/clients/<id>` rend « This space is not yours to read ». J'ai
   basculé sur `qa-coach-1785895486817569e40@test.dev` (3 élèves) — **le script gagnerait
   à préférer un coach avec des élèves**, sinon la moitié du côté pro est invisible aux
   revues suivantes.

---

## 6. SI JE NE DEVAIS FAIRE RÉPARER QUE TROIS CHOSES

1. **Traduire `/upgrade`** (B1) — c'est le seul défaut qu'un utilisateur nomme seul.
2. **Trancher le dosage de l'équerre** (B3), en une décision et pas en sept :
   `Card.tsx:111` la pose sur les 31 importeurs de `SectionLabel`, ce qui produit 8
   équerres empilées sur `/coach/clients/<id>` et 7 sur `/app/progress`, alors que 66
   étiquettes du même cran n'en ont aucune. Le chiffre « 3 au pire » du dossier est à
   corriger avant toute autre chose : il a servi à valider la décision.
3. **Retirer `text-black` d'`App.tsx:87`** (D4) — une ligne, et les 17 textes noirs plus
   le filet noir de `CoachProtocolPage.tsx:1209` rentrent dans la palette d'un coup.
   Le `bg-white` de la même ligne est déjà masqué partout, mais il devrait partir avec.
