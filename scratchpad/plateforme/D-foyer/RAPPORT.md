# FAMILLE D — LE FOYER · rapport

> `/app/household` — la surface du pivot foyer, et le premier écran qu'un
> deuxième membre de la maison ouvre. Quatre fichiers, 2 654 lignes reçues.
> Vérifié **au rendu**, persona `ff060_house` (Nora, 4 bouches, une allergie
> posée, un plan composé), à **1280×900 et 320×900**.

---

## 0. Le résultat en une ligne

**Zéro classe grise rendue sur tout l'écran, deux valeurs de rayon dans le
document entier, et une seule action figue dans chacun des quatre états de la
page.** Mesuré dans le DOM, pas relu dans le TSX.

```js
// à 1280×900, /app/household rendu, persona ff060_house — dernière mesure
{ grayClassesInDOM: 0,
  saturatedClassesInDOM: 1,   // la pastille « peanut », Badge tone="critical" du kit
  radii: ["12px", "1.67772e+07px"],  // rounded-card + rounded-full, rien d'autre
  figueButtons: ["Household" /* lien actif du shell */, "Compose for the household"],
  eq: 10,                     // inchangé — aucune équerre ajoutée
  h1s: 1,
  docW: 1280, docH: 3044, overflow: 0 }
// fiche d'un membre OUVERTE: 3 saturées — la pastille critique, le bouton
// `danger` du kit, et l'avertissement ambre « pas de corps saisi ». Trois FAITS.
// à 320×900 : docW 320, overflow 0, les 16 contrôles calculent 16px
```

---

## 1. Avant / après, mesuré par fichier

Mesure reproductible (`scratchpad`-only script) : **commentaires retirés**, sinon
les explications que j'ajoute comptent comme des couleurs.

| fichier | `gray/slate/neutral` | saturées | rayons |
|---|---|---|---|
| `HouseholdPage.tsx` | **44 → 0** | **21 → 14** | `rounded`×7 · `md`×3 · `lg`×1 → **`card`×5** |
| `HouseholdMergeCard.tsx` | **13 → 0** | 3 → 3 | — |
| `MealPickerGrid.tsx` | **13 → 0** | 0 → 0 | — |
| `HouseholdPlanCard.tsx` | **6 → 0** | 0 → 0 | — |
| **total** | **76 → 0** | **24 → 17** | **11 valeurs sur 3 familles → 5 sur 1** |

Les 17 saturées restantes sont **toutes** des états : `bg-red-50 text-red-700`
d'un refus (×2 bandeaux, ×3 lignes d'échec), `bg-amber-50 text-amber-800` d'un
plafond atteint, `text-amber-800` de quatre avertissements réels,
`text-emerald-700` de deux enregistrements confirmés, `text-red-700` d'un
libellé d'allergie. Aucune n'est un rang, une catégorie ni une frontière.

⚠️ **Le fichier que j'ai reçu n'était pas celui de l'audit.** `HouseholdPage`
portait déjà `+248/−2` lignes non committées d'une autre session, et le kit y
était **déjà importé** (`Badge`, `Button`, `Card`, `SectionLabel`, `Field`,
`inputClass`). Baseline `HEAD` du même script, pour la traçabilité :
`HouseholdPage` 34 gris / 17 saturées / 7 rayons ; les trois composants
identiques à ce que j'ai mesuré. Toutes mes écritures sont des `Edit` courts ;
aucun `Write` de fichier entier, aucun `git stash`.

---

## 2. Les pastilles maison → `Badge` : **quel fait chacune portait**

Deux pastilles se dessinaient à la main dans `MemberRow`, avec un rayon
(`rounded` nu) qui n'était ni celui d'une carte ni celui d'une pastille.

| pastille maison | ton du kit | **le fait qu'elle porte** |
|---|---|---|
| `rounded bg-red-50 px-2 py-0.5 text-red-800` — une **allergie** | **`critical`** | Un refus dur : l'allergie rejoint l'union de sécurité du générateur, **gouverne toute la casserole**, et rien ne se compose si on ne peut pas la lire. Rouge = échec dans tout le produit. |
| `rounded bg-neutral-100 px-2 py-0.5 text-neutral-600` — une **règle de maison** | **`neutral`** | **Aucun.** C'est une décision domestique, elle n'est l'état de rien dans le système. Lui donner une surface d'état la ferait ressembler à un verdict de santé — précisément le mensonge que `PIVOT-FOYER §8.5` interdit à cet écran. Une étiquette, et c'est tout. |

**`MemberBadges` — le composant que le brief désignait comme « le plus
suspect » — était déjà propre**, et je l'ai laissé tel quel après vérification :
ses trois pastilles (`owner`, `child`, l'objectif) passent par `<Badge>` sans
ton, donc `neutral`. C'est **le bon ton** : « qui tient la maison », « enfant »
et « prise de masse » sont des **libellés**, pas des états — et l'un d'eux est
une donnée sur un enfant qu'un ton coloré transformerait en verdict. Rien à
faire, et c'est un résultat, pas une omission.

Un troisième cas, dans `HouseholdMergeCard` : le sur-titre « NOT BEING
SUGGESTED » se tenait à la main en `text-xs uppercase tracking-wide
text-gray-400` (**2,84:1 — sous le seuil du texte**). Il passe à
`text-label font-semibold uppercase text-ink-soft`, le cran d'étiquette de la
charte. ⚠️ **Pas `SectionLabel`** : il pose une équerre, et l'écran en rend déjà
dix.

---

## 3. Les primitives locales passées au kit

Les treize `*Card` de `HouseholdPage` n'étaient **pas** des redéfinitions de
primitives : elles utilisaient déjà `Card`, `SectionLabel`, `Field` et
`inputClass`. Les redéfinitions réelles étaient **plus bas**, dans les feuilles.

| ce qui se tenait à la main | remplacé par | pourquoi ce n'est pas cosmétique |
|---|---|---|
| `ReferenceMemberCard` — `<select className="w-full rounded border border-gray-300 px-2 py-1 text-sm">` | **`inputClass`** | `text-sm` = 14 px, donc **Safari iOS zoomait à l'ouverture du menu et ne dézoomait pas**. La règle des 16 px d'`index.css` vit dans `@layer base` et un utilitaire la bat : la protection était contournée sans avoir été retirée. |
| `BodyFields` — **3** `<label className="flex flex-col text-xs">` enveloppant un champ `rounded border-gray-300 text-sm` | **3 × `Field` + `inputClass`** | Trois défauts d'un coup : 14 px (même zoom iOS), `border-gray-300` à **1,73:1** là où WCAG 1.4.11 exige 3:1 d'une bordure de contrôle, et une étiquette liée au champ par la seule enveloppe, à un cran qui n'existait nulle part ailleurs. |
| `MealPickerGrid` — `<button className="text-xs text-gray-500 underline hover:text-gray-900">` (Annuler) | **`Button variant="ghost" size="sm"`** | Une sixième façon de dessiner un bouton dans un produit qui en a cinq **nommées**. `ghost` est littéralement « le geste qu'on peut ignorer ». |
| `PausedCard` — `<Button className="border-amber-300 text-amber-900 hover:bg-amber-100">` | **`Button` par défaut (`secondary`)** | Une **variante de bouton maison**, née de l'idée qu'un bouton posé sur de l'ambre doit être ambre. Le `secondary` du kit se détache mieux sur `amber-50`, et c'est le même bouton que partout ailleurs. |

**Mesuré après** : les 16 contrôles de l'écran calculent `16px` à 320 et `14px`
à 1280 (`text-base lg:text-sm`), bordure `rgb(142,120,134)` = `#8E7886` =
`line-strong` (3,84:1). Zéro exception.

---

## 4. L'ambre de `PausedCard` : l'état reste, le décor part

Le brief le posait comme le cas à trancher. **« En pause » est un état, donc il
reste — porté par la SURFACE de la carte** (`Card tone="warning"` =
`border-amber-200 bg-amber-50`, le bandeau d'état de l'arbitrage AUDIT §5.2).

Ce qui part, ce sont les **sept classes ambre répandues à l'intérieur** :
quatre paragraphes en `text-amber-900` et les trois du bouton. Elles ne
portaient **aucun fait de plus que la surface sous elles**, et elles avaient un
coût mesurable : le seul vrai message d'échec de la carte (le refus de Stripe
quand les prix n'existent pas encore) était **ambre lui aussi**, donc
indiscernable des trois phrases rassurantes autour.

- les paragraphes → **`text-ink`**, soit **16,46:1 sur `amber-50`** (calcul WCAG
  2.1, relative luminance) contre 6,2:1 avant ;
- l'échec de paiement → **`text-red-700`** (**6,24:1 sur `amber-50`**), le même
  rouge que l'échec de composition dix lignes plus bas dans le même fichier.

Deux autres bandeaux d'état passent au vocabulaire sans changer de famille :
le plafond de bouches (`rounded-md` → `rounded-card`, `amber-900` →
**`amber-800`**, la valeur qu'emploie `Badge tone="caution"` — un état se
reconnaît d'un écran à l'autre à sa **valeur**, pas seulement à sa famille) et
le bandeau d'erreur de tête (`rounded-md` → `rounded-card`, rouge inchangé).

**Une saturée AJOUTÉE, et c'est un état qui manquait** : le refus d'invitation
sortait en gris. Il annonce que **l'invitation n'est pas partie** et se lisait
comme une précision. Il passe au `red-700` de l'échec de composition — deux
couleurs pour un seul état, dans un seul fichier, ça ne tenait pas.

---

## 5. Une seule action figue par vue — et le comptage qui l'a imposé

**Mesuré au navigateur avant tout changement** : `/app/household` rendait
**trois** aplats `bg-fig-700` en même temps — le lien actif du shell, le
« Save » de la fiche du maître, et le « Add them » de la carte d'ajout. Et
`HouseholdMergeCard` en ajoutait **un par proposition**.

```js
// avant : ["Household", "Save", "Add them"]
// après : ["Household", "Compose for the household"]
```

La promotion suit désormais **le même fait que le ton de la carte** :

| état de l'écran | figue | pourquoi |
|---|---|---|
| maître **sans** ligne `student_goals` | `MeCard` → « Save » | Le seul geste qui débloque la composition, et la carte est déjà en `tone="warning"` pour le dire. `ComposeCard` n'est pas monté. |
| maître **avec** la ligne, non gelé | `ComposeCard` → « Compose » | Composer est la **production** : tout le reste décrit qui mange ici, ce bouton fabrique. `MeCard` repasse en `secondary` — le même booléen gouverne les deux, donc **elles ne peuvent pas se croiser par construction**. |
| foyer **gelé** | aucune, ou `MeCard` | `ComposeCard` n'est pas monté ; la reprise est un `secondary` sur la surface ambre. |
| profil réclamé (non maître) | aucune | `ComposeCard` et `AddMouthCard` rendent `null`. |

Trois démotions, chacune avec sa raison écrite dans le fichier :
- **`AddMouthCard`** : le geste se **répète** — la carte existe pour ajouter
  trois personnes d'affilée sans quitter le flux. Un aplat de marque qu'on
  actionne cinq fois de suite n'est plus une action principale.
- **`NoticeRow`** (`HouseholdMergeCard`) : **un figue par proposition**. Trois
  bouches à fusionner faisaient trois actions principales dans une carte.
  ⚠️ Fusionner et défusionner se ressemblent maintenant, **et c'est vérifié** :
  les deux sorties arrivent parfois ensemble (`exits: ["unmerge","merge",
  "dismiss"]`, `household_merge_notice_test.ts:489`) et ce sont les deux sens
  d'un même geste — leur donner deux poids dirait que l'un est le bon. Le
  libellé les distingue ; « refuser » reste `ghost`.
- **`MealPickerGrid`** garde son figue : **une fenêtre modale est sa propre
  vue**, elle couvre la page et son « Save » est sa seule action. Vérifié à
  l'écran : la page derrière est sous `bg-ink/40`.

---

## 6. Les distinctions que la couleur portait, et par quelle forme je les remplace

Trois endroits opposaient `gray-600` à `gray-500` — deux gris à un cran d'écart,
donc une hiérarchie qu'on ne voyait pas. Les aplatir tous en `ink-soft` aurait
**perdu** l'information. Chaque fois, la distinction passe au couple
`ink` (16,18:1) / `ink-soft` (6,11:1), qui est un écart qu'on voit :

| où | ce qui monte à `ink` | ce qui reste `ink-soft` |
|---|---|---|
| `HouseholdPlanCard` | la **phrase de divergence** — « ce n'est pas le système qui est nul, c'est la recherche de compromis » : elle est dite **avant** d'être illustrée, le fichier le dit en commentaire | la liste des noms qui l'illustre |
| `TableCard` | l'**instruction de service** — la phrase qu'on lit à voix haute à table | la liste des préparations |
| `HouseholdPlanCard` | « ce plan ne cuisine plus pour toi » — un fait qui me concerne | l'état vide, le préfixe jour · moment |

Deux autres remplacements de couleur par une **forme** ou un **jeton** :
- `MealPickerGrid` — la date sous le jour était en `gray-400` (**2,84:1**). Elle
  passe à `ink-soft` et se distingue du jour **par la graisse** (`font-normal`
  contre `font-medium`), pas par un gris de plus.
- `MealPickerGrid` — la colonne collée était en `bg-gray-50`, **un aplat visible
  sur du blanc** : le défaut se lisait au premier défilement horizontal. Elle
  passe à **`bg-paper`**, le fond de la fenêtre, donc les cases passent
  réellement **dessous**. (Et pas `paper-2`, qui la ferait re-apparaître.)
- `MemberRow` — la fiche ouverte était `rounded-lg bg-gray-50`. Elle passe à
  `rounded-card bg-paper-2` et **pas `bg-paper`** : `paper` est le fond de la
  carte qui la contient, la fiche ouverte aurait disparu. `paper-2` est le jeton
  du « fond de section alterné », `ink` dessus = 15,02:1.

**Un lien passe à la figue, un autre reste gris — les deux exprès.**
« Modifier / Fermer » est **l'action de la ligne** et prend `text-fig-700`
(charte §2 : la figue marque la navigation et l'action) ; il reste un texte
souligné et non un bouton plein, parce que huit lignes feraient huit actions
principales. « Ne plus me proposer de fusionner son plan » **reste
`ink-soft`** : L8 le décrit comme « assumé comme un peu brutal, donc caché »,
et le promouvoir ferait du geste brutal le geste le plus visible.

**Une case à cocher prend la marque** : `accent-gray-900` → `accent-fig-700`.
`accent-*` compte comme une couleur, et une case à cocher est un **contrôle** —
la figue y est chez elle, et elle n'entre pas dans une pastille pour autant.

---

## 7. Mise en page : deux défauts trouvés à la mesure, pas à l'œil

1. **Deux champs empilés pour 2 px.** À 320 px, la fiche ouverte ne laisse que
   **198 px** sur la ligne du corps (carte `p-4` + panneau `p-3`) ; deux champs
   de 96 px et leur gouttière de 8 en font **200**, donc « taille » et « poids »
   se retrouvaient l'un sous l'autre avec 100 px de vide à droite.
   `w-24` → **`w-20`** : 80 + 80 + 8 = 168, et 80 px tiennent « 180 » à 16 px.
   Mesuré après : les deux champs à `top:2213`, le sélecteur de sexe seul en
   dessous.
2. **Un champ d'adresse à 192 px dans une carte de 606.** Une adresse de
   courrier n'y tient pas, et 400 px restaient vides à côté.
   `sm:flex-1 min-w-0` sur le `Field` → **432 px** mesurés à 1280.
   ⚠️ **`sm:flex-1` et pas `flex-1`** : sous 640 px le conteneur est en
   `flex-col`, et `flex-1` s'y appliquerait à la **hauteur**. `min-w-0` va avec,
   sans quoi l'enfant refuse de descendre sous son contenu.
3. **`items-end` → `items-start`** sur la ligne du corps : un `<select>` fait
   41 px là où un `<input>` en fait 42 (mesuré), donc aligner par le bas
   décalait le **haut** des trois boîtes de 2 px et l'étiquette « sexe »
   d'autant.

**À 320 comme à 1280 : `document.scrollWidth` égal à la fenêtre, zéro élément
débordant.** Le seul `flex-1` du lot porte déjà `min-w-0`.

---

## 8. Ce que je SIGNALE et n'ai pas réparé

### 8.1 ⚠️ Le formulaire figé au montage : la garde de **premier chargement**
existe, la **resynchronisation** n'existe pas

Le brief demandait de confirmer le motif. **Vérifié, et la réponse est plus
précise que « oui » ou « non ».**

Le **premier** chargement est correctement gardé : rien ne rend avant
`phase === "ready"`, et `setPhase("ready")` vient **après** les huit lectures de
`refresh()` — y compris `setEnvyLine`. Le commentaire d'`EnvyCard` qui l'affirme
est donc **exact** ; je l'ai relu ligne par ligne pour ne pas le contredire à
tort.

Ce qui manque est **l'étage d'après**. Quatre formulaires sèment leur `useState`
depuis leurs props **au montage** et restent montés pour toute la vie de la
page — `MeCard`, `MouthFields` via `MemberRow`, `BodyFields`, `EnvyCard`. Or
`refresh()` est rappelé après **chaque** action (`run()`). Une valeur qui bouge
côté serveur entre deux rendus est donc **invisible au formulaire**, et le
prochain « Save » réécrit l'ancienne. C'est la même classe de défaut que
`mount-snapshot-forms-need-a-loading-gate`, à un cran plus loin : ce n'est pas
du vide non lu, c'est du **périmé non relu**.

**Le correctif existe déjà, dans un fichier voisin de mon lot** :
`MealPickerGrid` est le seul des cinq à le faire — `savedPrint` /
`syncedFrom` resynchronise l'état quand l'empreinte des données change, et son
commentaire dit précisément pourquoi (« rouvrir après une sauvegarde afficherait
l'état d'avant »). C'est de la logique : **je ne l'ai pas propagé.**

### 8.2 Deux tests rouges, aucun des deux à moi — prouvés antérieurs

`npx vitest run` : **3 échecs sur 836**, dans 2 fichiers, tous deux
**antérieurs à mon lot et démontrables comme tels** :

- `src/keel/copy/planRefusals.int.test.ts` — « ne perd aucun motif au passage de
  `HouseholdPage` au module partagé ». Le nom désigne mon écran ; le test ne le
  lit pas. Il compare `en.ts` à `HOUSEHOLD_REFUSAL_KEYS`. **Sept clés
  `household.error.*` sont écrites sans être atteignables** :
  `body_incomplete`, `bad_height`, `bad_weight`, `bad_gender`,
  `minor_cannot_be_reference`, `age_unknown_cannot_be_reference`,
  `not_your_household`. **Preuve d'antériorité** : les sept sont dans
  `git show HEAD:…/en.ts` et absentes de `git show HEAD:…/planRefusals.ts`.
  Conséquence réelle : ces sept refus s'affichent **en jeton brut** à
  l'utilisateur. `planRefusals.ts` n'est pas à moi.
- `src/edge/coverage-guard.int.test.ts` — deux inventaires non acquittés :
  les fonctions edge `household-merge-notices-v1` et
  `keel-daily-recommendation-v1`, et le trigger `household_member_bodies_touch`.
  Hors lot frontend.

### 8.3 `npx tsc -b` : rouge chez les voisins, vert chez moi

`tsc -b` ne passe pas — mais **aucune erreur ne vient de mes quatre fichiers**.
Vus pendant la fenêtre : `SetupPage.tsx` (famille A) en syntaxe cassée à
mi-écriture, puis réparé ; `TemplatesPage.tsx` (famille F) `Expected
corresponding JSX closing tag for <Card>` (:896) et `Cannot find name
'priorityLabel'` (:122) ; `DeviationDialog.tsx:82` (famille B) `const`
assertion illégale. Type-check isolé de mes fichiers, sur une config de
scratchpad qui exclut le fichier cassé du voisin : **zéro erreur**.

### 8.4 Aucun besoin de kit, aucune chaîne en dur

- **Rien à changer dans `keel/components/ui/`.** Les huit primitives ont couvert
  tous les cas de cet écran, y compris les trois qui semblaient demander une
  exception (le sélecteur étroit → `Field className`, le bouton d'annulation →
  `ghost`, le bandeau d'état → `Card tone="warning"`).
- **Zéro chaîne en dur** dans les quatre fichiers : tout passe par `t()`,
  `mealCopy()` ou `plural()`. Aucune chaîne ajoutée, aucun namespace déclaré,
  `fr.ts` et `en.ts` jamais ouverts.
- **Aucun commentaire périmé du type « KEEL est volontairement gris »** dans mon
  périmètre. Les commentaires que j'ai réécrits l'ont été là où ma modification
  rendait l'ancien texte faux (`gray-50` de la colonne collée, `accent-gray-900`,
  `variant="primary"` de `NoticeRow`), jamais en passant.

### 8.5 Sur l'environnement, pour qui vérifiera après moi

- Le profil navigateur est partagé, et **une autre session réécrit
  `sb-127-auth-token` toutes les une à deux minutes** : mon persona a été
  remplacé quatre fois en pleine mesure (l'écran devient « This space is for
  students » ou redirige sur `/app/setup`). Il faut réinjecter le jeton **et
  mesurer dans le même appel** ; `location.href = "/app/household"` juste après
  le `setItem` est ce qui a fini par tenir. Je n'ai vidé aucun `localStorage`,
  fermé aucun onglet d'autrui, déconnecté personne.
- `preview_start` refuse `frontend-alt4` (**plafond de 5 serveurs par dossier,
  4 appartiennent à d'autres chats**). J'ai utilisé le serveur déjà ouvert de
  ma session, `frontend-a21` sur **5191**.
- Le recouvrement d'erreur de Vite (`<vite-error-overlay>`) masque tout l'écran
  dès qu'un voisin casse un fichier ; le retirer du DOM suffit à mesurer, la
  page dessous est intacte.

---

## 9. Ce que je n'ai pas touché, exprès

- **`MemberBadges`** — déjà au kit, et ses trois tons `neutral` sont les bons
  (§2). Le « corriger » aurait été le casser.
- Les **10 équerres** : aucune ajoutée, aucune retirée. Compté au DOM avant
  (`10`) et après (`10`). Aucun `px-*` posé sur un nœud `.eq`.
- Le `h1` : un seul, celui de `KeelAppShell`. La page n'en pose pas de second.
- Aucun changement de requête, de garde, de route, d'appel d'API ni de valeur
  par défaut. Les seules props modifiées sont `variant` et `className`.
- Aucun fichier hors de mes quatre. Aucun commit, aucun `git add`, aucun
  `git stash`, aucune commande `supabase`.
