# FAMILLE B — LE QUOTIDIEN — rapport

> Six fichiers : `/app/today`, `/app/chat`, et les quatre composants qu'ils montent.
> Tout ce qui est chiffré ici est reproductible par les greps de §7 de l'audit,
> **commentaires retirés** des deux côtés (voir §6 : la méthode compte).

---

## 1. Le résultat en une ligne

**Le violet a disparu du produit connecté côté élève** — 40 classes `violet-*` sur
mes deux écrans, dont un panneau entier — et **les 15 `sky-*` décoratives avec**.
Sur les 85 saturées de départ, **29 restent, et les 29 portent un fait**.

| Fichier | lignes | `gray+slate` av.→ap. | saturées av.→ap. | rayons hors charte av.→ap. |
|---|---:|---:|---:|---:|
| `keel/pages/TodayPage.tsx` | 1 421 → 1 541 | **48 → 0** | **47 → 20** | **18 → 0** |
| `keel/pages/ChatPage.tsx` | 871 → 949 | **21 → 0** | 5 → 5 | **7 → 0** |
| `keel/components/DeviationDialog.tsx` | 180 → 225 | 0 → 0 | **32 → 2** | **5 → 0** |
| `keel/components/DishCard.tsx` | 189 → 199 | **15 → 0** | 0 → 0 | **3 → 0** |
| `keel/components/KitchenToday.tsx` | 289 → 289 | **11 → 0** | 1 → 1 | 0 → 0 |
| `keel/components/WeeklyCheckInDialog.tsx` | 228 → 264 | **12 → 0** | 1 → 1 | **4 → 0** |
| **total** | | **107 → 0** | **86 → 29** | **37 → 0** |

`violet-*` : **40 → 0** · `sky-*` : **15 → 0** · `rose-*` : **8 → 0** (repliées
sur `red`, voir §3.4).

Les 29 saturées restantes, une par une : émeraude ×13 (enregistrement confirmé),
rouge ×13 (échec), ambre ×3 (avertissement). **Aucune ne dit une catégorie, un
rang, une frontière ni une marque.**

---

## 2. Les saturées retirées, et par quelle FORME la distinction est remplacée

### 2.1 ⛔ `DeviationDialog` — 30 `violet-*`, le panneau entier

C'était le reliquat le plus voyant du chantier : fond, bordure, quatre légendes,
deux bordures de champ et **huit boutons**, tous violets, zéro autre couleur.
Le violet est la marque du produit grand public supprimé (`--color-primary:
#7c3aed`), donc la teinte la plus visible de `/app/today` ne disait **rien** — ni
un état (déclarer n'est ni ok, ni attention, ni échec, ni info), ni la marque
actuelle.

**La forme qui remplace la teinte : le panneau devient une fiche.**
- un **fronton** `bg-paper-2` fermé par un trait `line`, et **l'équerre `.eq`
  collée au titre** — l'idiome exact que `ui/SetupSection.tsx` (§5 du contrat) et
  `ui/Modal.tsx` emploient déjà pour « séparer une section de la page » ;
- le corps en `paper`, le cadre en `line-strong` ;
- ⚠️ l'équerre est légitime ici parce que le panneau est rendu **en ligne dans la
  page** : c'est une section de `/app/today`. `Modal.tsx` la refuse pour son
  propre titre, et il a raison — elle ne redoublerait un titre de dialogue que
  dans une fenêtre.
- ⚠️ `px-4` posé sur le fronton et **pas** sur le nœud `.eq` : la classe pose
  `padding-left: 1.125rem` hors de toute couche CSS et bat un utilitaire de même
  spécificité. Mesuré au rendu : `paddingLeft: 18px` sur les deux `.eq`.

**Les huit boutons maison → `ui/Button.tsx`.** `variant={selected ? "primary" :
"secondary"}`, `size="sm"`. C'est le geste sélectionné à la figue demandé par le
brief. Et `aria-pressed` **double la couleur par une forme annonçable** : avant,
le choix en cours n'existait que pour l'œil.

**Les deux champs → `inputClass`.** Voir §3.1 : ce n'était pas cosmétique.

### 2.2 ⛔ `TodayPage` — 10 `violet-*` sur trois sites

| site | avant | après, et la forme qui porte la distinction |
|---|---|---|
| le déclencheur (1340) | `border-violet-300 bg-violet-50 text-violet-900` | valeurs de `Button variant="secondary"` (`line-strong` / `paper` / survol `fig-50`). Ce qui tient son rang de « first class » n'était pas la teinte : c'est **la largeur entière**, la place au-dessus du plan, et deux lignes là où le reste de l'écran n'en porte qu'une. |
| l'accusé (1349) | `bg-violet-100 text-violet-900` | **`bg-emerald-50 text-emerald-900`** — voir §5.1, c'est mon seul ajout de saturée et il est à relire. |
| les bandeaux (1360) | `border-violet-200 bg-violet-50 text-violet-900` | `bg-paper-2` + trait `line` : une note au dossier de la journée. Pas de bleu — voir §5.2. |

### 2.3 ⛔ `TodayPage` — 15 `sky-*` : le cas le plus insidieux

`PhotoComposer` était une surface `sky-50` bordée `sky-200`, cinq libellés
`sky-800/900`, un bouton `sky-600`, et le déclencheur photo un pointillé
`sky-300`. **Le bleu est pris** : `info` l'occupe dans `ui/Badge.tsx`. Une surface
bleue décorative rend muette la pastille bleue, qui elle porte un fait.

**Les formes qui remplacent :**
- le composeur ouvert : remplissage `paper-2` fermé par un trait `line-strong` —
  « un panneau qui s'ouvre », le fronton de fenêtre en plus petit ;
- le déclencheur : **le pointillé** `border-dashed border-line-strong`, qui dit
  « il y a une place ici, elle est libre » exactement comme `Card tone="dashed"`
  partout ailleurs ;
- le bouton du sélecteur de fichier : `file:rounded-full file:border
  file:border-line-strong` — un bouton prend la forme d'un bouton.

### 2.4 ⛔ `TodayPage` — lime / orange / amber sur `DayPart` : trois teintes → une

`food` en lime, `actions` en orange, `unsorted` en ambre. `orange` et `amber` sont
à **30° l'un de l'autre** : l'échelle ne se lisait même pas.

- **`food` et `actions` perdent leur teinte** : « ce que je mange » et « ce que je
  fais » sont des **catégories**, et une catégorie n'est aucun état du système.
- ⛔ **`unsorted` GARDE son ambre**, et ce n'est pas une exception de complaisance.
  `api/planStructure.ts` l'écrit : *« a line whose family we could not place is a
  thing the coach must FIX »*. C'est un **avertissement sur la prescription**, donc
  un fait. Repris aux **valeurs exactes de `Card tone="warning"`**
  (`border-amber-200 bg-amber-50`) plutôt qu'au demi-fond `/50` inventé sur place.
  Devenue **la seule partie teintée de l'écran, elle se voit enfin.**

**Les formes qui distinguent les parties maintenant :** l'équerre `.eq` collée au
titre, la taille du titre (`text-base` contre `text-label`), et **le pointillé des
observations** — « suivi, pas noté », le même signe que le vide en attente.

### 2.5 Les pastilles maison → `Badge`

`TodayPage:1299` fabriquait `<span class="rounded bg-gray-200 … text-gray-700">`
pour « Insufficient data ». → **`<Badge>`** (ton `neutral`, `bg-line
text-ink-soft`, 4,72:1, mesuré au rendu). Le ton est tranché **par la copie** :
« adherence stays hidden … *that is the rule, not a punishment* ». Ce n'est donc
ni une attention ni un échec : c'est un libellé sur la couverture.

---

## 3. Les primitives locales remplacées par le kit — et deux défauts réels qui tombent

### 3.1 ⛔ `inputClass` : le zoom Safari iOS était vivant sur cinq champs

Les cinq champs de mes fichiers portaient `text-sm`, **14 px**. Safari iOS zoome
sur un champ sous 16 px au focus et **ne dézoome pas** en sortant. La règle
`font-size: 16px` d'`index.css` vit dans `@layer base` et **un utilitaire la bat** :
la protection était contournée sans avoir été retirée.

| champ | avant | mesuré après, à 320 px |
|---|---|---|
| `DeviationDialog` `<select>` | `text-sm` | **16 px**, bordure `rgb(142,120,134)` = `line-strong`, rayon 12 px |
| `DeviationDialog` `<textarea>` | `text-sm` | **16 px**, idem |
| `ChatPage` composeur | `text-sm` | **16 px** |
| `WeeklyCheckInDialog` poids / tour de taille | `text-sm` | non vérifié au rendu, voir §7 |

**Et un second défaut, sur le champ le plus tapé du produit** : le composeur de la
conversation portait `focus:outline-none` **sans anneau de remplacement** — le
focus clavier était donc invisible. `inputClass` pose `focus:ring-2
ring-fig-600` (7,36:1), nécessaire parce que la règle `:focus-visible` de
`tokens.css` ne couvre que `a`, `button` et `[tabindex]`.

Les deux champs du point hebdo n'avaient **ni** bordure de contrôle
(`border-gray-300` → `line-strong`, 1,30:1 → 3,84:1) **ni** anneau de focus.

### 3.2 Les boutons recopiés → `Button` / `buttonClass`

- `DeviationDialog` : **8 boutons maison → `Button`** (§2.1) + le submit en
  `variant="primary"`.
- `PhotoComposer` : « Envoyer » et « Annuler » maison → `Button size="sm"`
  (`secondary`) et `Button variant="ghost"`.
- `ChatPage:816` : le `<label>` qui enveloppe le champ de fichier → **`buttonClass
  ("secondary","md","shrink-0 cursor-pointer")`**. C'est l'emploi documenté de
  cette fonction — l'apparence d'un bouton sur un élément qui n'en est pas un —
  et elle avait **zéro appelant** avant ce lot.

### 3.3 Le budget d'une action figue par vue rendue est tenu

`/app/today` en état `ready` rendait **zéro** `variant="primary"` (le seul du
fichier est dans `NoPlanYet`, une autre branche). Le budget est donc dépensé sur
un seul geste : **le « Déclarer » du panneau de déviation**.

**Mesuré au rendu, panneau ouvert** — les surfaces `rgb(99,44,76)` = `fig-700` :
le pion « Today » de la nav (shell), les **deux chips sélectionnés** (22 px de
haut, 12 px de texte) et le **bouton « Declare it »** (36 px, 14 px). La
hiérarchie tient : l'action est deux fois plus haute que les chips.

C'est pour ça que **« Envoyer » du composeur photo est en `secondary`** : rien
n'empêche les deux panneaux d'être ouverts en même temps, et deux aplats de marque
côte à côte c'est zéro hiérarchie. Le contour de contrôle contre le `ghost`
d'« Annuler » dit déjà lequel est le geste.

### 3.4 `rose-*` → `red-*` : un vocabulaire de moins

Huit classes `rose-*` disaient l'échec (`TodayPage` ×6, `DeviationDialog` ×2)
alors que le produit le dit en `red` (`ui/Badge.tsx`, `ui/Field.tsx`,
`ui/Button.tsx`). Deux rouges pour un rouge. Repliées sur `bg-red-50` /
`text-red-700`. De même `text-red-600` → `text-red-700` (4,83:1 → **6,13:1**, la
valeur du kit).

### 3.5 Les rayons : 37 → 0 hors charte

`rounded` nu, `md`, `lg`, `xl`, `2xl`, `3xl` → `rounded-card` (12 px).
`rounded-full` gardé **uniquement** sur les boutons, les pastilles et
l'interrupteur (`role="switch"` sur un `<button>`). Les deux barres de la maquette
`NoPlanYet` passent de `full` à **`rounded-part`** : ce bloc est `aria-hidden`,
c'est une figure, et ses pièces prennent le rayon des pièces — à 10 px de haut
c'est le même dessin.

---

## 4. Ce que j'ai décidé, et pourquoi

### 4.1 L'interrupteur de `ChatPage` reste neutre

`bg-gray-900`/`bg-gray-300` → **`bg-ink`/`bg-line-strong`**, et pas la figue.
Un interrupteur n'est ni une navigation ni une action : c'est **la valeur d'un
réglage**. Ce qui porte son état est déjà une forme — la position du bouton —
doublée d'`aria-checked`. `line-strong` et non `line` parce que la piste éteinte
est une surface de **contrôle** (1,30:1 serait invisible).
**Mesuré :** allumé `rgb(35,25,31)` = `ink`, éteint `rgb(142,120,134)` =
`line-strong`, bouton `rgb(251,248,250)` = `paper`.

### 4.2 Le cran choisi du point hebdo reste `ink`, celui de la déviation est figue

**Ce n'est pas une incohérence, c'est le nombre.** Le point hebdo note **six axes
en même temps** : six pastilles pleines côte à côte dès que l'élève a répondu.
Six aplats de marque dans un panneau qui porte déjà l'action figue
(« Envoyer »), c'est exactement ce que le plafond existe pour éviter. Le panneau
de déviation, lui, n'a **qu'un** choix sélectionné par groupe.
`border-ink bg-ink text-paper` = 16,18:1, et `aria-pressed` porte l'état sans la
couleur.

### 4.3 Les bulles de la conversation restent neutres

`bg-gray-900 text-white` → `bg-ink text-paper` (16,18:1) pour l'élève ;
`bg-gray-100 text-gray-900` → `bg-line text-ink` (≈ 12,4:1) pour Sophia.
Peindre la bulle de l'élève à la figue mettrait la marque **sur chaque phrase de
la surface la plus vue du produit**, et elle ne voudrait plus rien dire à trois
centimètres de là, sur le bouton « Envoyer ». Ce qui distingue les deux voix est
déjà une forme : le côté de l'écran.

### 4.4 `bg-gray-50` ne devient PAS `bg-paper` : deux surfaces prennent le cadre de `Card`

La bande de couverture de `TodayPage` et le fil de `ChatPage` étaient lisibles
parce qu'ils étaient **plus clairs (ou plus foncés) que la page**. Ce levier
n'existe plus : la page **est** `paper`, et la charte ne nomme aucun neutre plus
clair. Les deux prennent donc le cadre de `ui/Card.tsx` — **même remplissage que
le sol, et un trait de contrôle**. C'est la direction du site : une fiche
technique a des cases tracées, pas des aplats.
Ce ne sont pas des `<Card>` : la bande est une `<section>` sémantique, le fil a
besoin d'un `ref` et d'un `data-testid`.

### 4.5 `bg-gray-50` imbriqué dans une `Card` → `paper-2` + trait `line`

`DishCard` posait `bg-gray-50` **à l'intérieur** d'une carte, dont le
remplissage est déjà `paper`. `Card.tsx` prévient qu'il n'y a « plus de second
remplissage disponible » et conseille une division. J'ai pris **les deux** :
`bg-paper-2` (1,08:1, le second fond nommé par la charte, celui du fronton de
`Modal`) **plus** un trait `line` qui garantit l'arête même là où le remplissage
ne se voit pas. **Mesuré au rendu sur `/app/plan`** : `rgb(244,239,242)` =
`paper-2`, `rgb(227,218,224)` = `line`, rayon 12 px, et le bloc se lit.

### 4.6 Deux corrections de mise en page nées de la mesure, pas du dessin

1. **`text-right` était faux sous `sm`** (`TodayPage`, bande de couverture). La
   rangée passe en `flex-wrap`, la colonne de droite descend et se dimensionne
   sur son contenu : la pastille « Insufficient data » se retrouvait alignée à
   droite d'une **boîte étroite**, c'est-à-dire indentée au hasard au milieu de
   l'écran. Mesuré à 320 px : `left: 120px`. → `text-left sm:text-right`,
   remesuré : **`left: 29px`**, aligné sur le bord de la carte.
2. **La mesure de lecture s'applique aussi à une bulle** (charte §3, 62ch).
   Mesuré à 1280 : la bulle montait à **744 px**, ~105 caractères par ligne.
   `max-w-[85%]` → **`max-w-[min(85%,62ch)]`** : remesuré **597 px**, et
   **rien ne change à 320 px** (85 % y valent 218 px, donc ils restent la
   contrainte serrée). `62ch` est la valeur littérale de la charte, la même que
   `ui/Page.tsx` emploie.

### 4.7 Contrastes réparés en passant

`text-gray-400` et `text-gray-300` servaient de **texte** à sept endroits
(`NoPlanYet` ×2, `FamilyTallyStrip`, `DayPart`, `DaySubsection`, `weekBlock`,
l'heure du créneau, la note de pied, `chat-thinking`). Sur `paper` c'est 2,85:1 et
**1,57:1** — sous le seuil. Tous en `ink-soft` : **6,11:1**.
`text-[11px] uppercase tracking-wide` et `text-[0.6875rem] uppercase
tracking-wide` sont devenus **`text-label`** : la valeur était déjà celle de la
charte, elle n'était pas nommée. **Mesuré :** `fontSize: 11px`,
`letterSpacing: 1.1px` (= +0,1em).

---

## 5. Les deux arbitrages à relire par l'orchestrateur

### 5.1 ⚠️ L'accusé de déclaration passe à l'ÉMERAUDE — j'ajoute une saturée

C'est le seul endroit où j'**introduis** une couleur d'état. Le raisonnement :
- le code appelle ce texte « **grounded acknowledgement: built from the row we
  just read back** » — c'est un **enregistrement confirmé**, le cas que le socle
  nomme explicitement comme un fait qui reste (« `text-emerald-700` d'un
  enregistrement confirmé ») ;
- ce n'est pas importer une couleur d'ailleurs : **`PhotoOutcomePanel`, dans le
  même fichier**, dit déjà « la photo est enregistrée » en `emerald-50` ;
- le violet, lui, ne disait rien.

**Si tu préfères le neutre**, un seul remplacement suffit :
`bg-emerald-50 … text-emerald-900` → `border border-line bg-paper-2 text-ink`
(`TodayPage`, le bloc `{flash && …}`).

### 5.2 Les bandeaux de déviation restent neutres plutôt que `info`

Une déviation déclarée est un fait, mais elle n'est ni ok, ni attention, ni
échec. Le bleu de `info` serait le seul candidat — et le dépenser sur une **liste
de bandeaux** rendrait muette la pastille bleue là où elle compte, c'est-à-dire
exactement le défaut que §2.3 vient de corriger. La pièce se lit par la forme :
`paper-2` fermé par un trait `line`. **Aucune chaîne ajoutée** (une `Badge
tone="info"` + libellé en aurait demandé une).

---

## 6. Comment ces chiffres sont mesurés

Les greps de l'audit §7 **comptent les commentaires**. Mes fichiers en ont gagné
beaucoup (l'essentiel des +120 lignes de `TodayPage` et +78 de `ChatPage`), et
plusieurs *citent* les classes retirées pour que le prochain lecteur ne les
remette pas. Un comptage naïf rendrait donc `TodayPage` à `gray=2` et
`ChatPage` à `sat=4` **par les commentaires seuls**.

Les colonnes de §1 sont donc mesurées **commentaires retirés**, des deux côtés
(`avant` pris sur `git show HEAD:<chemin>`, jamais `git stash`) :

```bash
strip(){ perl -0777 -pe 's{/\*.*?\*/}{}gs; s{^\s*//.*$}{}mg; s{\{/\*.*?\*/\}}{}gs' "$1"; }
strip <fichier> | grep -oE '\-(gray|slate|zinc|neutral|stone)-[0-9]{2,3}' | wc -l
strip <fichier> | grep -oPE '\brounded(-(none|sm|md|lg|xl|2xl|3xl))?(?![-a-z])' | wc -l
```

⚠️ **Le piège du grep de rayons de l'audit** : `\brounded(-(...))?\b` **compte
`rounded-card` comme un `rounded` nu** (`-` est une frontière de mot). Il faut
`(?![-a-z])` en PCRE, sinon une conversion réussie se relit comme un échec.

---

## 7. Ce qui est vérifié au rendu, et ce qui ne l'est pas

Vérifié sur `ff060_house` **et** `ff060_solo`, à **320 px et 1280 px** :

- ✅ `/app/today` état `ready`, panneau de déviation **fermé et ouvert**
- ✅ `/app/chat`, réglages **repliés et ouverts**
- ✅ `DishCard` ×6 sur `/app/plan` (`MealBuilder` le monte)
- ✅ **`violet` et `sky` absents du DOM rendu** (`/(violet|sky-)/` sur `innerHTML`)
- ✅ **aucun débordement horizontal** : à 320 px, `scrollWidth === innerWidth ===
  320`, et zéro élément dépassant `innerWidth` (balayage de tous les nœuds)
- ✅ **le contrat `fill` de `ChatPage` est intact** : `document.scrollHeight ===
  innerHeight` (la page ne défile pas) et `log.scrollHeight > log.clientHeight`
  (le fil défile). Le composeur reste à 664 px sur 760.

**NON vérifié au rendu, et il faut le savoir :**

1. ⚠️ **`WeeklyCheckInDialog`** — il n'apparaît qu'après un clic sur un bouton
   dont le payload matche `^KEEL_WEEKLY_\d{4}-\d{2}-\d{2}$`, et aucun n'existait
   dans le fil des deux personas (j'ai parcouru l'arbre de fibres React : zéro
   payload hebdo). En fabriquer un est une écriture en base, hors périmètre.
   Toutes les classes qu'il emploie sont mesurées ailleurs (`inputClass` sur la
   déviation, `ink`/`line-strong`/`paper` sur l'interrupteur).
2. ⚠️ **`OwnDay`, `OwnWeekLine` et `KitchenToday`** — l'état `own_week` demande un
   élève **sans** `plan_versions` publié mais **avec** des plats composés. Les
   trois personas QA (`house`, `solo`, `gate`) ont tous un plan publié, donc
   `/app/today` part en `ready` chez tous les trois. `DishCard` est en revanche
   vérifié via `/app/plan`.
3. ⚠️ **`PhotoComposer` / `PhotoOutcomePanel`** — le créneau photo ne se rend que
   sous une sous-section `food`, absente du plan de ces personas (seule
   `observations` est peuplée). Non ouverts au rendu.

---

## 8. Signalé, pas réparé

### 8.1 ⛔ `Button size="sm"` fait 22 px de haut — sous le seuil WCAG 2.5.8

**Mesuré au rendu**, panneau de déviation ouvert : les chips `size="sm"` font
**22 px**. WCAG 2.2 AA (2.5.8, *Target Size (Minimum)*) demande **24 × 24**.
Ça concerne mes 8 chips de déviation, mais aussi **les deux boutons de
`KitchenToday`, les boutons de message de `ChatPage`, « Charger plus », et tout
`size="sm"` du produit**. `px-2.5 py-0.5 text-xs` ne peut pas y arriver.
**C'est un défaut de kit** (`ui/Button.tsx`, fichier partagé) : je ne l'ai pas
touché. Le correctif minimal serait `py-1` sur `SIZE.sm` (→ ~26 px).

### 8.2 ⛔ Aucune classe de la charte n'atteint une case à cocher

**Mesuré sur `/app/plan`**, sur les 6 cases de `DishCard` : les classes sont bien
dans le markup (`rounded-part border-line-strong text-ink`) mais le calculé rend
`appearance: auto`, `borderWidth: 0px`, `borderRadius: 0px`. **`@tailwindcss/forms`
n'est pas installé**, donc sur une case native `border-*`, `rounded-*` et `text-*`
sont **inertes** : le système peint le contrôle. Ce n'était pas mieux avant
(`border-gray-300 text-gray-900` était tout aussi mort), donc **ce n'est pas une
régression** — mais toutes les coches du produit sont en apparence OS, hors
charte. `focus:ring-fig-600` fonctionne (un `ring` est un `box-shadow`), donc
l'anneau de focus, lui, est un vrai gain.
Le vrai correctif est `appearance-none` + une case dessinée, ou le plugin :
**deux changements de fichier partagé.**

### 8.3 Défauts fonctionnels croisés — non touchés

1. **`TodayPage:1033` : `contentLocale: "en-US"` en dur** sur chaque déviation
   déclarée, avec le commentaire « the pilot writes English ». **L'app est
   bilingue depuis le 2026-08-13** : la note d'un élève francophone est donc
   étiquetée anglaise en base. C'est de la logique, et un défaut de données.
2. **`onOpenPhoto` ne ferme pas le panneau de déviation** (et l'inverse) : les
   deux peuvent être ouverts en même temps. C'est ce qui m'a fait garder
   « Envoyer » en `secondary` (§3.3). Un `setDialogOpen(false)` dans
   `onOpenPhoto` serait un changement de logique.
3. **`ui/Field.tsx` le signale déjà et c'est toujours vrai** : le paragraphe
   d'erreur n'a pas de `role="alert"`, donc il n'est pas annoncé. Mes bandeaux
   d'erreur (`DeviationDialog`, `PhotoComposer`, `ChatPage`) ont le même trou.

### 8.4 Chaînes en dur — aucune trouvée dans mes six fichiers

Tout passe par `t()`, `mealCopy()` ou un `*Label()` de `api/labels.ts`.
**Je n'ai ajouté aucune chaîne** : chaque distinction retirée à la couleur est
revenue par une forme (équerre, fronton, pointillé, `Badge` sur une clé qui
existait déjà).

### 8.5 Commentaires périmés réécrits

- `DayPart` affirmait « this component chooses **a colour** and nothing else » →
  « chooses **a frame** ».
- `DeviationDialog`, `PhotoComposer`, `Badge`-isation, bulles, interrupteur :
  chaque teinte retirée est **nommée dans un commentaire avec la raison**, parce
  qu'une contrainte documentée survit à sa cause et que le prochain lecteur
  « répare » sinon en la remettant. Le dépôt l'a déjà payé deux fois.

---

## 9. Vérification, et le rouge qui n'est pas à moi

```
npx tsc -b                → 0 erreur dans mes six fichiers
npx vitest … run          → 52 fichiers verts, 813 tests verts
```

**3 échecs, tous hors de mon périmètre** (vérifié : aucun ne référence mes
fichiers) :
- `src/edge/coverage-guard.int.test.ts` ×2 — fonctions edge et triggers DB absents
  de la liste connue ;
- `src/keel/copy/planRefusals.int.test.ts` ×1 — 7 clés `household.error.*`
  inatteignables (famille D).

**`tsc` a été rouge trois fois pendant ce lot, à chaque fois sur un fichier
d'une autre session en cours d'écriture** — `TemplatesPage.tsx` (F),
`UpgradePlan.tsx` (G), `CoachBroadcastCard.tsx` (E). Non réparés, conformément à
la consigne. Le bundle Vite tombe en entier quand ça arrive, donc **la
vérification au navigateur demande d'attendre un état syntaxiquement propre** ;
c'est ce que j'ai fait (sondage sur `tsc --noEmit`).

## 10. Note d'environnement, pour la prochaine session

Le plafond de **5 serveurs de dev par dossier était atteint** (4 à d'autres
sessions) : `preview_start` refuse `frontend-alt2` **et** `frontend-a12`.
Et `localhost:5191` portait déjà la session d'une autre famille (persona coach),
qui a changé sous mes yeux en cours de route — la contamination de profil
partagé, exactement.

**La sortie, et elle est propre :** Vite écoute sur `::1`, donc
**`http://[::1]:5191` sert la même app sur une ORIGINE DIFFÉRENTE**, avec son
`localStorage` à elle. J'y ai posé mes personas sans jamais écrire dans le stockage
de `localhost` — vérifié après coup : cette origine porte toujours la session
coach de l'autre famille, intacte. `http://127.0.0.1:5191` ne répond pas (Vite
n'est pas lié en IPv4).

## 11. Ce que je n'ai pas ouvert

`keel/components/CommitmentLine.tsx` — famille F. Vérifié au rendu que
`/app/today` reste correct avec sa version convertie : `ActivityChip` et la
pastille « Not logged yet » s'accordent avec les cadres neutres, et le
`FamilyTallyStrip` qui l'enveloppe garde volontairement un cadre discret
(`paper-2` + `line`) pour ne pas doubler la teinte de famille que la puce porte
déjà.
