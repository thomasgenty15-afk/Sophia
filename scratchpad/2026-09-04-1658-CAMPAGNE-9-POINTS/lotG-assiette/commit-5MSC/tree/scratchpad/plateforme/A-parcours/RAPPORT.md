# FAMILLE A — LE PARCOURS D'ENTRÉE — rapport

> Écrans : `/app/setup` (`keel/pages/SetupPage.tsx`) et le sélecteur de langue
> qu'il monte (`keel/components/LocaleSwitch.tsx`).
> Vérifié au rendu sur `http://localhost:5191/app/setup`, personas
> `ff060_gate` (entonnoir vierge), `ff060_house` (foyer de 4 bouches) et
> `ff060_solo`, à **320 px et 1280 px**.
> `npx tsc -b` : **0 erreur dans mes deux fichiers**. `eslint` : propre.

---

## 1. Les chiffres, mesurés

Comptés **hors commentaires** (un `grep` naïf compte les commentaires qui
*décrivent* la classe retirée, et gonfle l'après). Avant = `git show HEAD:`.

| fichier | | `gray/slate/*` | saturées | rayons (sites / valeurs) | `bg-white` | `fig-*` |
|---|---|---:|---:|---|---:|---:|
| `keel/pages/SetupPage.tsx` | avant | **41** | 0 | 4 / **3** (`rounded` nu, `-lg`, `-xl`) | 3 | 0 |
| | après | **0** | 0 | 3 / **1** (`rounded-card`) | **0** | 5 |
| `keel/components/LocaleSwitch.tsx` | avant | **5** | 0 | 2 / 1 (`rounded-full`) | 0 | 0 |
| | après | **0** | 0 | 2 / 1 (`rounded-full`) | 0 | 2 |

Le 4ᵉ site de rayon disparaît avec la classe morte de la case à cocher (§4.4).

**Valeurs relevées au navigateur après conversion** (1280 px, persona `house`) :

| rôle | mesuré | attendu |
|---|---|---|
| fond de la coque | `rgb(251,248,250)` | `paper` `#FBF8FA` |
| `h1` | Young Serif, **43,2 px**, graisse **400** | `font-display text-title`, une seule graisse |
| `h1` à 320 px | **27,2 px** | ≥ 20 px, le plancher de Young Serif |
| mot-symbole | Young Serif **20 px**, `#23191F` | plancher exact |
| équerre du mot-symbole (`::before`) | 10 × 14 px, `rgb(99,44,76)` | `.eq`, `fig-700` |
| trait sous le bloc de tête | `rgb(227,218,224)` | `line` |
| compte d'étapes | 11 px, 600, capitales, **approche 1,1 px** | `text-label` (+0,1em) |
| tuile non choisie | fond `#FBF8FA`, trait `rgb(142,120,134)` | `paper` + `line-strong` 3,84:1 |
| tuile choisie | fond `rgb(239,224,233)`, trait `rgb(99,44,76)` | `fig-100` + `fig-700` 9,98:1 |
| rayon des tuiles | **12 px** | `--radius-card` |
| champ | **16 px** sous `lg`, 14 px au-dessus ; trait `line-strong` ; rayon 12 px | `inputClass` du kit |
| pastille `An adult` | fond `rgb(227,218,224)`, texte `rgb(106,90,100)` | `Badge` neutre, 4,72:1 |
| EN retenu | `#FBF8FA` sur `rgb(99,44,76)` | 9,98:1 |
| EN non retenu | `rgb(106,90,100)` sur `paper` | 6,11:1 (seuil 4,5) |
| cerne du groupe de langue | `rgb(142,120,134)` | `line-strong`, WCAG 1.4.11 |
| débordement horizontal à 320 px | `scrollWidth` = **320** | aucun |

---

## 2. Primitives locales : ce qui est parti, et par quoi

Les **7 primitives locales** de l'audit sont les *steps* de l'entonnoir. Sa
structure reste : `FunnelShell`, `SituateStep`, `SelfStep`, `MouthsStep`,
`MouthRow`, `PlanStep`, `AllergyPicker` existent toujours. Ce qui est parti,
c'est ce qu'elles **redéfinissaient du kit**.

| primitive locale | ce qu'elle redéfinissait | remplacé par |
|---|---|---|
| `FunnelShell` | sa propre coque (`bg-white`) et sa propre tête de page (`text-2xl font-semibold text-gray-900` + un chapô `text-sm`) | le fond `paper` et **le `h1` de `ui/Page.tsx#PageHeader` mot pour mot** : `font-display text-title text-ink`, chapô `text-base max-w-[62ch] text-ink-soft` |
| `SituateStep` | ses trois tuiles maison : `rounded-xl border-gray-200 bg-white`, choisi `border-gray-900 bg-gray-50` | `rounded-card` + le geste secondaire du kit (`line-strong` sur `paper`) ; choisi = `border-fig-700 bg-fig-100` |
| `MouthRow` | son étiquette de nature en `text-xs text-gray-500` | **`<Badge>`** (ton `neutral`) |
| `MouthRow` | son panneau d'invitation `rounded-lg bg-gray-50` et son bloc de lien `rounded bg-white` | `rounded-card border-line bg-paper-2` (l'idiome du fronton de `ui/SetupSection.tsx`) et `rounded-card border-line bg-paper` |
| `MouthsStep` | ses séparateurs `divide-gray-100` / `border-gray-100` | `divide-line` / `border-line` |
| `AllergyPicker` | sa case à cocher `rounded border-gray-300 text-gray-900 focus:ring-gray-900` | `accent-fig-700` + anneau `fig-600` — **et les trois classes retirées étaient mortes**, voir §4.4 |

**Ce que je n'ai pas touché, exprès :** `FunnelShell` reste sans navigation
(c'est la garde du couloir), aucun `<Button>`/`<Card>`/`<Field>` n'a été
re-stylé (le kit les rend déjà), et les champs passent tous par `inputClass`
(c'était déjà le cas — 0 champ recopié dans ce fichier).

## 3. La direction, et l'unique geste de dessin

Le brief le dit : **c'est la première impression du produit**. Avant, elle était
un formulaire blanc, titre en sans-serif gras, boîtes grises — l'écran de
n'importe quel SaaS. Le seul geste de dessin que je me suis autorisé est donc
celui qui remet ce couloir dans la maison, et il est unique :

> **La tête de l'entonnoir devient la tête d'une fiche technique.**
> Équerre sur le mot-symbole en Young Serif à 20 px (l'équerre « marque
> l'origine de ce qui est spécifié », charte §4, et un nom de marque en est une),
> `h1` en Young Serif, puis **un trait `line` qui ferme le bloc d'identité**, et
> sous ce trait le compte d'étapes au cran `text-label` — la référence du
> document. Une fiche a une tête, un trait, puis ses champs.

C'est aussi le seul endroit où la numérotation est *méritée* : les trois étapes
**sont** une séquence contrainte (le commentaire de `SetupPage:694` explique que
la direction du maître doit être écrite avant qu'une bouche puisse l'être).

Tout le reste est de la discipline : les neutres, le vocabulaire de rayon, les
pastilles du kit, la mise en page aux deux largeurs. Rien d'autre n'a été ajouté.

## 4. Défauts trouvés **et réparés** (visuels / mise en page)

### 4.1 Le fond était `bg-white` : le rapport carte/page était inversé
`FunnelShell` posait `bg-white`. Les cartes du kit sont en `paper` (`#FBF8FA`).
Mesuré au navigateur : **l'intérieur des cartes était plus chaud que la page qui
les portait** — chaque carte se lisait comme un creux, pas comme une pièce
posée. Le blanc pur est justement le seul neutre que la charte refuse.

### 4.2 Le champ e-mail d'invitation tombait à **84 px** à 320 px
La rangée était `flex flex-wrap items-center gap-2`, champ en `flex-1`.
`flex-wrap` ne sauve rien : le champ, étant élastique, se laisse comprimer
plutôt que de pousser le bouton à la ligne. Mesuré : **84 px** de champ à côté
de « Create the invitation ». Après (`flex flex-col items-start gap-2
sm:flex-row sm:items-center`, `sm:flex-1`) : **228 px** en colonne à 320 px,
**532 px + 136 px sur une ligne** à 1280 px (676 = la largeur du conteneur).
`items-start` est nécessaire : sans lui `align-items: stretch` étirerait le
bouton sur toute la largeur.

### 4.3 « Give them their own access? » ne ressemblait pas à un bouton
Il était en `variant="ghost"`, donc du texte `ink-soft` sans contour — au milieu
de **trois phrases d'aide elles aussi en `ink-soft`**. Vu au navigateur : il ne
se distinguait pas d'une ligne de prose, sur la seule ligne de la liste qui
*ouvre* quelque chose. Passé en `secondary size="sm"` : le geste reste
facultatif, il redevient reconnaissable comme geste.

### 4.4 Trois classes mortes sur la case à cocher des allergies
Elle portait `border-gray-300 text-gray-900 focus:ring-gray-900`. **Ce dépôt n'a
pas `@tailwindcss/forms`** (vérifié dans `frontend/package.json`) : sur une case
native, `border-*` et `text-*` ne rendent rien. La coche restait au bleu du
système, et le gris n'était même pas appliqué — la garde n'était pas seulement
froide, elle était désarmée. Remplacé par `accent-fig-700`, l'idiome déjà en
place sur `/start` (`StartPage.tsx:669`) et `/auth` (`Auth.tsx:1312`), les deux
portes qui précèdent cet écran. Anneau de focus explicite (`fig-600`) parce que
la règle `:focus-visible` de `tokens.css` ne couvre que `a`, `button` et
`[tabindex]`.

### 4.5 Les lignes de bouches se lisaient comme un seul formulaire
Nom en `text-sm`, nature en `text-xs text-gray-500` au bout de la ligne,
séparateur `divide-gray-100` quasi invisible : impossible de dire où Alex
finissait et où Theo commençait (vu au navigateur, persona `house`, 4 bouches).
La nature passe en `Badge` neutre — le kit a un ton pour « tout ce qui n'est
qu'une étiquette », et « adulte / enfant » en est une —, ce qui donne à chaque
ligne une ancre à droite. Le séparateur passe en `divide-line`, l'emploi
**légitime** de `line` d'après `ui/Card.tsx` : une règle horizontale *à
l'intérieur* d'une carte.

### 4.6 Le choix courant de l'étape 1 ne passait que par la couleur
`aria-pressed={chosen}` ajouté sur les trois tuiles. Sans lui, « laquelle des
trois est la mienne » était invisible à un lecteur d'écran et portée par la
seule couleur (WCAG 1.4.1). Aucun test ne rend cet écran (vérifié :
`postLogin.int.test.ts`, `pageSeams`, `pageFrontier` ne le citent que par son
chemin), donc l'ajout est sans risque de régression.

### 4.7 Un `text-[0.6875rem]` hors échelle
Sur le `<code>` du lien d'invitation. Passé à `text-xs`. Le cran de la charte à
cette taille est `text-label`, mais il met en capitales et ouvre l'approche à
+0,1em : un jeton à recopier n'y survit pas. 12 px sur l'échelle valent mieux
que 11 px hors d'elle.

---

## 5. La contrainte « une seule action figue par vue rendue » — vérifiée au navigateur

**Le relevé du contrat portait sur les 2 `variant="primary"` explicites** :
`Next` (étape *people*) et `Compose` (étape *plan*). Mesuré : **ils ne
co-rendent jamais** — `funnelSteps` place toujours *plan* après *people*, et un
seul *step* s'affiche à la fois. Rien à démoter.

**Ce qui co-rend en revanche**, mesuré sur la vue *people* d'un foyer
(`getComputedStyle(...).backgroundColor === 'rgb(99,44,76)'`) :

| aplat figue | y | taille | nature |
|---|---:|---|---|
| `EN` | 19 | 12 px | contrôle de **navigation** du bandeau — la figue lui est explicitement accordée par le brief |
| `An adult` | 3 058 | 12 px | **pastille de choix** d'un contrôle segmenté |
| `Continue` | 4 089 | **14 px** | l'action de l'étape |

**Je les ai laissés, et voici l'autorité.** `keel/pages/MealPrepPage.tsx:325` —
une page publique **construite à la charte** — rend une pastille choisie en
`peer-checked:border-fig-700 peer-checked:bg-fig-700 peer-checked:text-paper`,
avec son raisonnement écrit à côté : *« la figue ne descend jamais dans une
pastille d'ÉTAT — ici elle est sur un CONTRÔLE, pas sur un fait »*. Et la même
page porte un `ButtonLink variant="brand"` (rendu identique à `primary`).
`CouplesPage.tsx:366` fait pareil. **La maison a donc déjà tranché que la
pastille choisie et l'action de marque coexistent.** Inventer ici un troisième
traitement forkerait le vocabulaire — exactement ce que le kit existe pour
éviter.

Le mal que la règle nomme — *« deux boutons figue côte à côte, c'est zéro
hiérarchie »* — n'est pas réalisé : les trois aplats sont à plus de 1 000 px
l'un de l'autre, et l'action porte le cran `md` (14 px) quand les pastilles
portent `sm` (12 px).

⚠️ **Ce que ça coûte quand même, et c'est un besoin de kit — voir §7.1 :** sur
l'étape *plan*, `PlanStep` rend **quatre rangées** de pastilles (rythme, jours,
durée, budget) et chaque valeur retenue est un aplat figue. Compté depuis le
code : **jusqu'à 12 aplats** autour du bouton `Compose`. Je n'ai pas pu le
constater au rendu (voir §6.3), mais le code est sans ambiguïté.

---

## 6. Signalé, **pas réparé** — c'est de la logique

### 6.1 ⛔ Le plus grave : la question des allergies affiche une réponse **fausse** à la reprise
`SetupPage` seed son brouillon avec **`allergies: []` en dur** et
`allergiesNone: read.state.self.allergiesReviewed` (le chargeur, ~l.261-262).
Or `AllergyPicker` est **toujours rendu** dans `SelfStep`. Conséquence : à toute
reprise, quelqu'un qui a déclaré une allergie voit **« Nothing to declare »
cochée et zéro allergène retenu** — l'écran affirme le contraire de ce qui est
en base, sur une question de **sécurité**. (Constaté au rendu, persona `house` :
la case est cochée.)

**Ce n'est pas une perte de données** — j'ai lu `saveOwnAllergies`
(`keel/api/onboarding.ts`) : elle est purement **additive** (elle déclare chaque
libellé, fusionne le drapeau, ne supprime jamais). C'est un défaut d'**affichage
d'un fait de sécurité**. Le bloc équivalent de `MouthRow` est sain : il ne se
rend que `if (!m.allergiesReviewed)`.

### 6.2 ✅ Le « formulaire figé au montage » : `SetupPage` est **innocenté**
L'audit §6.6 la donnait candidate. Vérifié, elle ne l'est pas, pour **deux**
raisons indépendantes :
1. **La porte de montage existe** (`state.kind === "loading"` → aucun formulaire
   avant la fin de la lecture), et elle est documentée comme telle en tête de
   fichier (règle 2).
2. **Chaque écriture est gatée sur une valeur non vide** : `saveOwnProfile` si
   `gender && Number.isFinite(height)`, `saveOwnWeight` si `> 0`,
   `setOwnBirthDate` si `draft.birthDate`, `saveOwnGoal` si `draft.goal`,
   `saveMouthBody` si les trois. **Aucun champ vide ne peut écraser une valeur
   en base.**

Le seul reliquat du motif est §6.1, et il n'écrase rien — il **affiche** faux.

### 6.3 Le poids du maître est vide alors que la ligne existe
Persona `house` : `WEIGHT (KG)` se rend vide et `nextIncomplete` renvoie donc
l'étape *people*. Conséquence pour le chantier : **aucun des trois personas QA
n'atteint l'étape 3 sans écrire en base**, donc `PlanStep` n'est pas
observable au rendu sans contaminer un persona partagé. Je ne l'ai pas fait.
Une fixture « prête à composer » manque au harnais.

### 6.4 `<option value="">—</option>` reste sélectionnable sur « sexe » et « objectif »
Le commentaire de `PlanStep` (l.1611) nomme ce défaut et le dit corrigé pour le
budget (« il laissait « — » sélectionnable : une option qui ne veut rien dire et
que la garde refuse ensuite »). Les deux `<select>` de `SelfStep` le gardent.
C'est de la logique de formulaire, hors lot.

### 6.5 Young Serif **sous son plancher** dans deux fichiers partagés
Hors de mes deux fichiers, donc signalé et pas touché :
`keel/components/PublicHeader.tsx:182` rend le mot-symbole en `font-display
text-lg` (**18 px**) et `PublicFooter` (`:370`) en `font-display text-sm`
(**14 px**). La charte §3 dit « jamais sous 20 px ». J'ai posé le mien à
`text-xl` (20 px, mesuré) plutôt que d'aligner sur ces deux-là.

### 6.6 Chaînes en dur : **aucune**
Balayé : pas un libellé d'interface hors `t()`, pas de `→` (U+2192), pas de
U+202F, dans ni l'un ni l'autre fichier. Les seuls caractères littéraux sont des
cadratins `—` en valeur vide de `<select>` (voir §6.4) et le repli `"—"` d'un
prénom absent.

### 6.7 Commentaire périmé **réécrit** (obligation du socle §5)
`LocaleSwitch.tsx` affirmait que *« l'app authentifiée est encore anglaise
(frontière déclarée) »* et que proposer « FR » au-delà des surfaces publiques
*« promettrait une traduction qui n'existe pas encore »*. C'est périmé depuis le
2026-08-13. Réécrit sur place, avec la raison : laissée en place, la phrase
aurait fait **retirer** ce bouton de l'app par le prochain lecteur zélé.

### 6.8 Rouge dans le harnais, hors de mes fichiers
- `npx tsc -b` : erreurs dans `components/UserProfile.tsx` (famille G),
  `keel/components/CoachSeatCard.tsx` (E), `keel/components/DeviationDialog.tsx`
  (B), `keel/pages/TemplatesPage.tsx` (F) — sessions en cours d'écriture.
  **0 dans les miens.**
- `vitest` : 3 échecs — `src/edge/coverage-guard.int.test.ts` (×2, registre des
  fonctions edge et des triggers) et `src/keel/copy/planRefusals.int.test.ts`
  (liste fermée des refus de foyer, chantier `HouseholdPage`). Vérifié :
  **aucun des deux fichiers de test ne lit `SetupPage` ni `LocaleSwitch`.**
  813 tests passent.
- Une superposition d'erreur Vite venue de `pages/UpgradePlan.tsx` (famille G) a
  masqué la page pendant la vérification ; retirée du DOM pour continuer.

### 6.9 Le profil navigateur est partagé, et ça a mordu
Le jeton `sb-127-auth-token` a été réécrit **trois fois** par d'autres sessions
pendant ma vérification (persona coach, puis `house`), ce qui vide `/app/setup`.
J'ai reposé mon persona à chaque fois et je laisse `ff060_gate` en place. Rien
n'a été vidé ni déconnecté. **Aucune écriture en base** : les seuls clics
possibles sans écrire sont « Just me » (le solo ne crée pas de foyer),
« Three or more » quand le foyer existe déjà, et `Back`.

---

## 7. Besoins de kit (pour l'orchestrateur)

### 7.1 `Button` n'a pas d'état « retenu »
C'est le trou qui produit §5. Quatre écrans au moins rendent un contrôle
segmenté par `variant={chosen ? "primary" : "secondary"}` — dont mes
`PlanStep`, `AllergyPicker` et `MouthsStep`. Résultat : **une pastille retenue
et l'action principale sont le même aplat**, et la règle « une seule action
figue par vue » devient invérifiable par `grep`. Une variante `selected` (ou une
prop `pressed`) rendrait la distinction explicite — l'aplat pour l'action, une
forme plus légère pour le choix retenu — et permettrait au kit de poser
`aria-pressed` lui-même.
⚠️ **Ce n'est pas réparable au site d'appel** : surcharger `bg-*`/`text-*` via
le `className` d'un `Button` dépend de l'ordre de génération de Tailwind, pas de
l'ordre des classes (le piège déjà noté pour `hidden` contre `inline-flex`).
Ça se décide dans `ui/Button.tsx`.

### 7.2 Il n'y a pas de cran de 11-12 px **sans** capitales
`text-label` est le seul cran à cette taille et il impose capitales + approche.
Pour un jeton, une URL, un code, il n'existe rien : d'où les
`text-[0.6875rem]` qu'on trouve dans le dépôt (§4.7). Un cran `text-mono-xs`
ou l'autorisation explicite de `text-xs` pour ce rôle éviterait la valeur
arbitraire.

### 7.3 Le grand contrôle « tuile » n'existe pas dans le kit
Trois écrans au moins rendent une carte-bouton (les 3 tuiles de `SituateStep`,
la commande de `Auth.tsx:1340`, les portes de `HomePage`). J'ai aligné les
miennes sur `/auth` à la main. Un `Tile` (ou `Card` cliquable avec un état
retenu) éviterait que chaque famille redécide du couple fill/border.
