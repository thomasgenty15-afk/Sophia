# REVUE 3 — L'ACCESSIBILITÉ

> Écrans **rendus**, mesurés au DOM à **320 px** et à **1280 px** (plus **1024 px** là
> où le défaut y est pire), les 2026-08-13. Je n'ai rien construit de ce que je juge et
> je n'ai rien réparé : **aucun fichier de `frontend/` n'a été touché.**
>
> Chaque nombre de ce rapport vient d'un relevé `getComputedStyle` /
> `getBoundingClientRect` sur l'écran rendu, pas de la charte. Les couples sont
> calculés **composés** : encre effective (alpha et opacité héritée aplaties) contre
> fond effectif (remontée des ancêtres jusqu'au premier fond opaque).
> Formule WCAG 2.1, vérifiée contre les cinq valeurs de la charte
> (16,18 / 6,11 / 9,98 / 3,84 / 7,36 et `line` à 1,30).

---

## 0. LE VERDICT

> ### Contraste : **NON. Aucun échec de contraste sur un composant ACTIF, sur aucun des 16 écrans.**
> 22 relevés d'écran, deux largeurs. **15 couples** tombent sous leur seuil ; **les 15
> sont sur des boutons `[disabled]`** (`disabled:opacity-50`), donc exemptés par
> l'exception « composant d'interface inactif » de 1.4.3 et de 1.4.11. Vérifié
> élément par élément : `el.closest('[disabled],[aria-disabled=true]')` est vrai pour
> chacun. Le couple actif le plus serré rendu est **4,72:1** — `ink-soft` sur `line`,
> la pastille `Badge tone="neutral"` — au-dessus du seuil 4,5.

> ### Mais il reste **trois bloqueurs d'accessibilité qui ne sont pas des contrastes**, et ils sont tous mesurés :
> 1. **8 contrôles de saisie sans nom accessible sur `/app/household`** (niveau A).
> 2. **Le shell élève en FRANÇAIS, à ≥ 1024 px : deux à quatre libellés de navigation
>    imprimés l'un sur l'autre.** Silencieux — la page ne défile pas.
> 3. **La barre d'onglets élève à 320 px en français : le 5e onglet est coupé**, 32 px
>    hors écran, sans ellipse et sans défilement (1.4.10 Reflow).

Les deux derniers **n'existent pas en anglais**. C'est le motif que ce dépôt a déjà
payé : « [garde testée dans une seule langue](../../../.claude) ». Les huit familles ont
composé et vérifié en anglais ; le pack français est plus long de 10 à 25 % sur chaque
libellé de navigation, et c'est là que la mise en page casse.

---

## 1. LE TABLEAU DES COUPLES COMPOSÉS

### 1.1 Ceux qui échouent — tous sur un contrôle inactif

`o` = opacité cumulée mesurée sur l'élément. Le couple est l'encre **après**
aplatissement de cette opacité sur le fond réel : c'est ce que l'œil reçoit.

| écran | élément | couple composé | px / graisse | ratio | seuil | verdict |
|---|---|---|---|---:|---:|---|
| `/app/chat` | `Envoyer` — primary `[disabled]`, o=0,5 | `#AF92A3` / `#632C4C` | 14 / 500 | **3,74** | 4,5 | exempté (1.4.3 inactif) |
| `/coach/meals` | `Ajouter à la bibliothèque` `[disabled]` | `#AF92A3` / `#632C4C` | 14 / 500 | **3,74** | 4,5 | exempté |
| `/coach/import` | `Decompose the plan` `[disabled]` | `#AF92A3` / `#632C4C` | 14 / 500 | **3,74** | 4,5 | exempté |
| `/coach/clients/:id` | `Save` `[disabled]` | `#AF92A3` / `#632C4C` | 12 / 500 | **3,74** | 4,5 | exempté |
| `/app/household` | `L'ajouter`, `Enregistrer`, `Créer l'invitation` `[disabled]` ×3 | `#8F898D` / `#FBF8FA` | 14 / 500 | **3,26** | 4,5 | exempté |
| `/app/setup` | `Ajouter` ×2, `Enregistrer` ×3 `[disabled]` | `#8F898D` / `#FBF8FA` | 12 / 500 | **3,26** | 4,5 | exempté |
| `/coach/doctrine` | `Save as draft`, `Add` `[disabled]` | `#8F898D` / `#FBF8FA` | 14 / 500 | **3,26** | 4,5 | exempté |
| `/coach` | `Envoyer à tout le monde` `[disabled]` | `#8F898D` / `#FBF8FA` | 12 / 500 | **3,26** | 4,5 | exempté |
| `/coach/clients/:id` | `>` (semaine suivante) `[disabled]` | `#8F898D` / `#FBF8FA` | 14 / 500 | **3,26** | 4,5 | exempté |

Non-texte (WCAG 1.4.11), même population :

| écran | élément | couple | ratio | seuil | verdict |
|---|---|---|---:|---:|---|
| `/app/setup`, `/app/household`, `/coach`, `/coach/doctrine` | bordure d'un `secondary [disabled]` | `#C5B8C0` / `#FBF8FA` | **1,81** | 3 | exempté (composant inactif) |
| `/coach/clients/:id` | bordure d'un `secondary [disabled]` sur `paper-2` | `#C1B4BC` / `#F4EFF2` | **1,76** | 3 | exempté |
| `/app/chat`, `/coach/import` | **remplissage** d'un `primary [disabled]` | `#AF92A3` / `#FBF8FA` | **2,67** | 3 | exempté |

⚠️ **Ce n'est pas rien pour autant.** Un bouton désactivé à 3,26:1 est *lisible mais
faible* ; l'exemption WCAG dit seulement qu'on n'a pas le droit de le compter comme un
échec. Comme `disabled:opacity-50` est posé une seule fois dans `ui/Button.tsx`, monter
ce plancher est une ligne — mais c'est un arbitrage de charte, pas un bloqueur, et ce
n'est pas mon lot.

### 1.2 Les couples ACTIFS les plus serrés, écran par écran

Aucun ne descend sous son seuil. C'est la preuve par le bas, pas un échantillon choisi :
j'ai trié tous les couples de chaque écran et je donne les plus faibles.

| couple composé | px / graisse | ratio | seuil | où il apparaît |
|---|---|---:|---:|---|
| `#6A5A64` / `#E3DAE0` (`ink-soft`/`line`) | 12 / 500 | **4,72** | 4,5 | `Badge tone="neutral"` — `/app/today` ×2, `/app/plan` ×15, `/app/household` ×5, `/app/setup` ×3, `/coach` ×1 |
| `#6A5A64` / `#EFE0E9` (`ink-soft`/`fig-100`) | — | 5,07 | 4,5 | non rencontré au rendu |
| `#6A5A64` / `#F4EFF2` (`ink-soft`/`paper-2`) | 11 / 400 · 12 / 400 | **5,67** | 4,5 | `/app/today` (fronton `Ce que je note`), `/coach/protocol`, `/account` (bandeau e-mail) |
| `#6A5A64` / `#FBF8FA` (`ink-soft`/`paper`) | 11 / 500-600 · 12 · 14 · 16 | **6,11** | 4,5 | partout — le couple le plus fréquent du produit |
| `#8E7886` / `#F4EFF2` (bordure sur `paper-2`) | non-texte | **3,57** | 3 | `/coach/protocol` (`Fill from my method`) |
| `#8E7886` / `#FBF8FA` (bordure de contrôle) | non-texte | **3,84** | 3 | **tous** les champs, selects, textareas, `secondary`, la case de `/app/plan`, l'interrupteur `Roaming` |
| `#C9A3B8` / `#24101E` (`fig-300`/`fig-950`) | 14 / 400 | **8,06** | 4,5 | `/account?tab=subscription`, bloc sombre |
| `#632C4C` / `#EFE0E9` (`fig-700`/`fig-100`) | 16 / 600 | **8,27** | 4,5 | `/account`, l'initiale dans la pastille d'avatar |
| `#FBF8FA` / `#632C4C` (`paper`/`fig-700`) | 11-14 / 500 | **9,98** | 4,5 | onglet actif, `Button primary`, `Options` |
| `#23191F` / `#F4EFF2` | 16 / 600 | 15,02 | 4,5 | `/account`, nom du compte |
| `#23191F` / `#FBF8FA` | 14-18 | 16,18 | 4,5 | texte courant, `h1`, mot-marque |
| `#FBF8FA` / `#24101E` | 24 / 400 | 17,05 | 3 | `/account?tab=subscription`, titre du bloc sombre |

**Les deux pièges nommés dans mon brief sont tenus, au calcul, sur les écrans rendus :**

- **`line` (1,30:1) ne borde aucun contrôle.** J'ai relevé la bordure de **chaque**
  `input`/`select`/`textarea`/`button`/`[role=switch]` visible des 16 écrans : la
  couleur mesurée est `rgb(142, 120, 134)` = `#8E7886` = `line-strong`, **sans une
  exception**. Le seul `#E3DAE0` mesuré est un fond de pastille et des `border-t` de
  séparation — décoratif, ce qui est son rôle.
- **`fig-300` (2,11:1 sur papier) n'apparaît jamais sur le papier.** Son unique
  occurrence rendue est `#C9A3B8` sur `#24101E` = **8,06:1**, dans le bloc sombre de
  `/account?tab=subscription`. Le remappage `.on-dark` fait ce qu'il annonce.

### 1.3 Le cas non-texte qu'on aurait pu manquer : l'interrupteur

`/account?tab=settings`, bouton `Roaming` (`aria-pressed`), état **éteint** — un
interrupteur sans bordure : c'est son **remplissage** qui doit tenir 3:1.

| élément | remplissage / fond autour | ratio | seuil | verdict |
|---|---|---:|---:|---|
| piste de l'interrupteur, éteint | `#8E7886` / `#FBF8FA` | **3,84** | 3 | ✅ |
| curseur (pastille) sur la piste | `#FBF8FA` / `#8E7886` | **3,84** | 3 | ✅ |

C'est `bg-line-strong` et non `bg-line` : à 1,30:1 l'interrupteur aurait été invisible.
Mesuré, pas supposé — la classe est tronquée à la lecture (`bg-line…`), seule la valeur
calculée tranche.

---

## 2. LE RELEVÉ DES CHAMPS — 320 px, au calcul

⛔ **Le seuil des 16 px est tenu partout.** Zéro exception sur les 9 écrans qui portent
un champ. Bordure mesurée `rgb(142, 120, 134)` = `line-strong` sur les 44 champs.

| écran | champs visibles | `font-size` à **320 px** | `border-top-color` | verdict |
|---|---:|---|---|---|
| `/app/setup` | **23** (4 text, 2 date, 10 number, 7 select) | `16px` — les 23 | `rgb(142, 120, 134)` | ✅ |
| `/app/household` | **9** (2 text, 2 date, 3 select, 1 email, 1 textarea) | `16px` — les 9 | `rgb(142, 120, 134)` | ✅ |
| `/app/health` | 4 | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/app/chat` | 1 | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/account` (général) | 2 | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/account?tab=settings` | 2 select | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/coach` | 1 textarea | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/coach/doctrine` | 1 | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/coach/protocol` | 1 (`search`) | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/coach/import` | 1 textarea | `16px` | `rgb(142, 120, 134)` | ✅ |
| `/app/today`, `/app/plan`, `/app/progress`, `/app/meals`, `/coach/weekly`, `/coach/templates`, `/coach/billing`, `/upgrade` | 0 | — | — | sans objet |

À **1280 px** les mêmes champs calculent `14px` : c'est `lg:text-sm`, et c'est le
comportement voulu — au-dessus de `lg` il n'y a pas de Safari iOS à protéger.
**Aucun champ ne porte un `text-sm` nu** : les 44 champs mesurés portent la même
chaîne `inputClass` (vérifié sur la `className` complète), donc les ~40 champs
recopiés à la main ont bien été rebranchés.

**Hauteurs mesurées** : `input` 46 px, `select` 42,5 px, `textarea` 80-288 px à 320 px.
Toutes au-dessus de 44 px pour les `input` ; les `select` à 42,5 px sont à 1,5 px de la
cible confortable de 2.5.5 (AAA), donc dans la même famille que `Button size="md"`.

---

## 3. L'ORDRE DES TITRES, ÉCRAN PAR ÉCRAN

Relevé `document.querySelectorAll('h1,h2,h3,h4,h5,h6')`, éléments visibles, dans
l'ordre du DOM.

| écran | relevé | verdict |
|---|---|---|
| `/app/setup` | `h1` Installe ta cuisine → `h2` Toi → `h2` Qui mange ici, à part toi | ✅ |
| `/app/today` | `h1` KEEL discovery program → `h2` Ce que je note | ✅ |
| `/app/chat` | `h1` Sophia | ✅ |
| `/app/plan` | `h1` Le plan de ma semaine → `h2` À propos de toi → `h2` Tes repas → `h3` ×7 (aperçu, cuisine, 5 jours) | ✅ |
| `/app/progress` | `h1` Mes progrès → `h2` ×7 | ✅ |
| `/app/health` | `h1` Ce que tu ne peux pas manger → `h2` En vigueur → `h2` En ajouter un | ✅ |
| `/app/household` | `h1` Ton foyer → `h2` ×9 | ✅ |
| `/app/meals` | `h1` Idées de repas → `h2` De ton coach | ✅ |
| `/coach` | `h1` Tes élèves → `h2` Un mot à tout le monde → `h2` Élèves | ✅ |
| `/coach/doctrine` | `h1` Doctrine → `h2` ×5 | ✅ |
| `/coach/weekly` | `h1` This week → `h2` ×3 | ✅ |
| `/coach/protocol` | `h1` Recommended food → `h2` ×3 | ✅ |
| `/coach/meals` | `h1` Recettes → `h2` ×3 | ✅ |
| `/coach/templates` | `h1` Tes modèles de plan | ✅ |
| `/coach/billing` | `h1` Facturation | ✅ |
| `/coach/clients/:id` | `h1` Student A13-1 → `h2` ×12 | ✅ |
| `/coach/import` | `h1` Import a plan → `h2` Your document → `h2` Extracted commitments | ✅ |
| `/upgrade` | `h1` Passe à la vitesse supérieure → `h2` ×3 | ✅ |
| **`/account`** (3 onglets) | `h2` Nora → `h2` Personal details · `h2` Preferences → `h2` My data · `h2` Plan & access → `h3` Read-only → `h2` Choose a plan | ⛔ **aucun `h1`** |

**Un seul défaut : `/account` n'a pas de `h1` du tout** — vérifié
`document.querySelectorAll('h1').length === 0`, y compris les éléments cachés (ce n'est
pas un `h1` en `sr-only`). Et la page n'a **aucun repère** : ni `<main>`, ni `<header>`
de bannière, ni `role="dialog"`. C'est `UserProfile.tsx` monté en pleine page par
`Account.tsx` — un panneau de modale servi comme un écran, avec la structure d'une
modale et pas celle d'une page.

Aucun niveau sauté nulle part ailleurs.

---

## 4. LE PARCOURS CLAVIER DU SHELL, PAS À PAS

### 4.1 À 320 px (le shell téléphone)

Relevé par écouteur `focusin` sur des frappes **Tab réelles**, puis anneaux relus à
l'état stabilisé.

| # | arrêt | rect | anneau mesuré | ratio |
|---:|---|---|---|---:|
| 1 | `button` **Menu** (`aria-expanded`, `aria-controls="shell-menu"`) | 242,11 62×34 | `solid 2px #7E3C61` off 3px | **7,36** |
| 2 | `a` Aujourd'hui — barre d'onglets | 0,812 79×49 | `solid 2px #7E3C61` off 3px | **7,36** |
| 3 | `a` Conversation | 79,812 88×49 | idem | 7,36 |
| 4 | `a` Plan | 166,812 43×49 | idem | 7,36 |
| 5 | `a` Repas | 209,812 52×49 | idem | 7,36 |
| 6 | `a` Progression | 261,812 82×49 | idem | 7,36 |
| 7 | `button` Déclarer un écart — **contenu de la page** | 16,484 288×128 | idem | 7,36 |
| 8 | `button` C'est fait | 206,726 72×24 | idem | 7,36 |
| → | boucle sur **Menu** | | | |

- ✅ **La barre d'onglets élève est atteignable au clavier** : les 5 onglets, chacun
  avec l'anneau `fig-600` à 7,36:1, chacun à 49 px de haut (au-dessus de 44).
- ⚠️ **La barre du bas reçoit le focus AVANT le contenu de la page** (arrêts 2-6 avant
  7-8), parce que `KeelShellBar` — qui la contient — est rendu avant `<Page>` dans
  `KeelAppShell.tsx:543`. Visuellement elle est en bas de l'écran. Ordre du focus ≠
  ordre visuel.
- Le focus est **visible partout** : `outline: solid 2px #7E3C61 off 3px` sur tous les
  `a` et `button`, y compris **le bouton `primary`** — l'anneau est posé 3 px *hors* du
  bouton, donc il tombe sur le papier (7,36:1) et non sur le `fig-700` du bouton (où il
  ne ferait que 1,36:1). Le décalage de 3 px n'est pas cosmétique, c'est ce qui sauve
  l'anneau.

### 4.2 Les contrôles que `tokens.css` ne couvre pas — vérifiés un par un

La règle `:where(a, button, [tabindex]):focus-visible` ne couvre pas les champs. Mesuré
à l'état stabilisé, `focus-visible` armé (`el.matches(':focus-visible') === true`) :

| contrôle | anneau | couleur | vs fond | ratio | verdict |
|---|---|---|---|---:|---|
| `input[text]`, `input[date]`, `input[number]`, `input[email]`, `select`, `textarea` (`inputClass`) | `box-shadow` (`focus:ring-2`) | `#7E3C61` | `#FBF8FA` | **7,36** | ✅ porte son anneau lui-même |
| `input[checkbox]` de `/app/setup` (`accent-fig-700 focus:outline-none focus:ring-2 focus:ring-fig-600`) | `box-shadow` | `#7E3C61` | `#FBF8FA` | **7,36** | ✅ |
| **`input[checkbox]` de `/app/plan`** (`focus:ring-fig-600`, **sans `ring-2`**) | **aucun `box-shadow`** (`none` mesuré) | — | — | — | ⚠️ retombe sur l'anneau **par défaut de Chrome** (`outline: auto 1px`) |

Le troisième cas est un **défaut de classe morte** : `focus:ring-fig-600` seul ne pose
que `--tw-ring-color`, jamais une largeur. L'anneau du navigateur prend le relais et
reste visible (le `outline-color` calculé, `#E59700`, n'est **pas** ce qui est peint :
`outline-style: auto` fait dessiner à Chrome son anneau bicolore, précisément pour
tenir sur n'importe quel fond). Donc **pas un échec WCAG** — mais l'anneau de la marque
n'y est pas, et la classe qui devait le poser ne fait rien.

### 4.3 Le menu du téléphone

| question | mesure | verdict |
|---|---|---|
| s'ouvre-t-il ? | `#shell-menu` apparaît, **10 entrées** (7 nav + Compte + Mentions légales + Se déconnecter) | ✅ |
| l'état est-il exposé ? | `aria-expanded` passe de `"false"` à `"true"` ; `aria-controls="shell-menu"` pointe sur un `id` qui existe | ✅ |
| le focus y entre-t-il ? | les entrées sont **juste après** le bouton dans l'ordre du DOM : Tab depuis le bouton donne `Fermer` → `Aujourd'hui [dans le menu]` → `Conversation [dans le menu]` → … | ✅ (motif « disclosure », pas de piège de focus — correct pour un menu non modal) |
| l'anneau y est-il ? | 1re entrée focalisée : `outline solid 2px rgb(126,60,97)`, `:focus-visible` armé | ✅ **7,36** |
| Échap referme-t-il ? | `#shell-menu` disparaît, `aria-expanded` revient à `"false"` | ✅ |
| et le focus après Échap ? | **`document.activeElement === document.body`** | ⚠️ **le focus est perdu**, il ne revient pas au bouton |

### 4.4 À 1280 px

Le bouton Menu et la barre d'onglets passent en `lg:hidden`. L'ordre devient : les
**10 liens de la nav de bureau**, puis le contenu. Anneau `fig-600` à 7,36:1 sur les
10. Aucun piège, mais **10 arrêts répétés avant le contenu à chaque écran** — et il
n'existe **ni `<main>`, ni lien d'évitement, ni repère ARIA** dans tout le shell
(vérifié : `KeelAppShell.tsx` ne contient aucun `<main>`, aucun `role="main"`, aucun
`sr-only` d'évitement ; le seul `<header>` du kit est `ui/Page.tsx:63`, c'est l'en-tête
de titre *dans* le contenu, pas une bannière). 2.4.1 reste tenu par la technique H69
(les titres de section), sauf sur `/account` qui n'a pas de `h1`.

---

## 5. LES BLOQUEURS, EN DÉTAIL

### 5.1 ⛔ `/app/household` — 8 contrôles sans nom accessible (WCAG 1.3.1 + 4.1.2, niveau **A**)

Les 8 `<label>` visibles de l'écran n'ont **ni `for`, ni contrôle enveloppé**. Les 8
contrôles correspondants n'ont **ni `aria-label`, ni `aria-labelledby`, ni
`placeholder`, ni `title`**. Un lecteur d'écran annonce « zone d'édition, vide ».

| contrôle | libellé affiché juste au-dessus | `label[for]` |
|---|---|---|
| `input[text]` | Prénom | — |
| `input[date]` | Date de naissance | — |
| `select` | Ta direction | — |
| `input[text]` | Prénom | — |
| `input[date]` | Date de naissance | — |
| `select` | Sa direction | — |
| `select` | C'est pour qui ? | — |
| `input[email]` | Son e-mail | — |

Reproduit aux deux largeurs, et sur l'origine **autorisée** (`http://localhost:5191`) —
ce n'est pas un artefact de mon poste.

**Cause exacte, et elle est du genre « garde optionnelle = garde désarmée » :**
`ui/Field.tsx` rend `<label htmlFor={htmlFor}>` avec `htmlFor?: string`. Quand
l'appelant l'omet, le `<label>` est rendu **sans `for`** et le contrôle enfant n'a
pas d'`id` : l'étiquette est là, elle est jolie, et elle ne nomme rien.
**35 des 102 appels `<Field>` du dépôt n'ont pas de `htmlFor`** :

| fichier | appels `<Field>` | sans `htmlFor` | rendu ? |
|---|---:|---:|---|
| `keel/pages/HouseholdPage.tsx` | 10 | **10** | oui → **les 8 contrôles ci-dessus** |
| `keel/components/CommitmentEditor.tsx` | 8 | **8** | non atteint dans l'état mesuré |
| `keel/pages/SetupPage.tsx` | 19 | **8** | oui, mais les contrôles portent un `aria-label` ⇒ défaut, pas bloqueur |
| `keel/pages/HomePage.tsx` | 7 | **7** | page publique, hors des 16 |
| `keel/components/CookingCapacityCard.tsx` | 5 | 1 | non atteint |
| `keel/pages/CoachMealsPage.tsx` | 4 | 1 | oui, `aria-label` présent ⇒ défaut |

Sur `/app/setup` (7 étiquettes orphelines : « Tu es allergique à quelque chose »,
« Taille, poids et sexe » ×4, « C'est un adulte ou un enfant ? », « Il est allergique
à quelque chose ») et sur `/coach/meals` (1 : « Ce qu'il met dans l'assiette »), les
étiquettes orphelines chapeautent **un groupe** de contrôles qui, eux, ont bien un nom.
Ce sont des **`<legend>` déguisés en `<label>`** : c'est un défaut de structure
(1.3.1), pas une perte de nom. `unlab` mesuré = 0 sur ces deux écrans.

### 5.2 ⛔ Shell élève en français, ≥ 1024 px — des libellés de navigation imprimés l'un sur l'autre

Deux `<nav lg:flex>` frères dans un conteneur `div.flex.min-w-0.items-center.gap-4`.
La nav de gauche est un **enfant flex à `min-width: auto`** : elle refuse de descendre
sous sa taille min-content, déborde de sa boîte, et **peint par-dessus** le groupe de
droite. `overflow` est `visible`, donc rien ne défile et rien n'alerte.

| largeur | langue | débordement du groupe gauche | collisions mesurées |
|---:|---|---:|---|
| 1280 px | **fr** | **+76 px** (783 alloués / 859 nécessaires) | `Foyer` (x 878–939) ⨯ `Compte` (x 879–954) |
| **1024 px** | **fr** | **+172 px** (695 / 867) | `Progression`⨯`Compte`, `Santé`⨯`Compte`, `Santé`⨯`Mentions légales`, `Foyer`⨯`Mentions légales` |
| 1280 px | en | 0 (720 / 720) | aucune |
| 1024 px | en | 0 | aucune |

Le document ne défile pas horizontalement (`scrollWidth − clientWidth = 0`) : le défaut
est **silencieux** pour tout contrôle automatique qui cherche un débordement de page.
C'est une capture d'écran qui l'a montré la première fois — « Ĝoyupte » — puis la
mesure l'a confirmé.

Le conteneur porte déjà `min-w-0` ; c'est **la `<nav>` elle-même** qui en a besoin (et
un `truncate`, ou un repli sous `xl`). Même famille que les deux pièges déjà consignés
du dépôt (`flex-1` sur un champ, `.fig-scroll` sous une piste de grille).

**Le shell coach y échappe de justesse** : à 1024 px en français, 11 px de débordement,
et il reste 5 px entre `Cette semaine` (fin 658) et `Compte` (début 663) au lieu des
16 px de `gap-4`. Aucune collision — mais la marge est de 5 px, et `Aliments
recommandés` fait déjà 177 px à lui seul.

### 5.3 ⛔ Barre d'onglets élève à 320 px en français — le 5e onglet est coupé (WCAG 1.4.10)

| mesure | valeur |
|---|---|
| `nav.fixed` `scrollWidth` / `clientWidth` | **352 / 320** |
| onglets (x → x2) | Aujourd'hui 0→81 · Conversation 81→172 · Plan 172→215 · Repas 215→268 · **Progression 268→352** |
| le libellé est-il tronqué proprement ? | **non** — `span.scrollWidth === span.clientWidth` (77, 87, 39, 49, 80) : aucune ellipse |
| la page défile-t-elle pour aller le chercher ? | **non** — `document.scrollWidth − clientWidth = 0` |

Donc « Progression » perd **32 px sur 84**, sans ellipse et sans moyen d'atteindre la
partie coupée : c'est une perte d'information à 320 px. La cible reste tapable (52 px
visibles) et **atteignable au clavier** (arrêt 6 du §4.1), donc c'est de l'information
perdue, pas une fonction perdue.

Le `truncate` posé sur le `<span>` ne s'arme jamais parce que les cinq `<a
class="flex flex-1 …">` n'ont **pas `min-w-0`** : à `min-width: auto` ils refusent de
rétrécir, donc rien n'est jamais serré, donc rien n'est jamais tronqué. Le commentaire
de `KeelAppShell.tsx:366` a raison sur `env(safe-area-inset-bottom)` ; c'est la largeur
qui manque.

---

## 6. LES CIBLES TACTILES — les deux défauts connus, vérifiés et chiffrés

### 6.1 `Button size="sm"` : le plancher de 24 px **est armé**

| écran | `Button size="sm"` mesurés | hauteur |
|---|---:|---|
| `/app/setup` | 37 | **24,0 px** — les 37 |
| `/coach/doctrine` | 11 | **24,0 px** |
| `/coach/protocol` | 9 | **24,0 px** |
| `/app/chat` | 8 | **24,0 px** |
| `/app/plan` | 2 | **24,0 px** |
| `/app/today`, `/coach` | 1 chacun | **24,0 px** |

`min-h-6` fait exactement ce qu'il annonce : **24,0 px, jamais 22**. WCAG 2.5.8
(niveau AA) est tenu. Les variantes bordées (`secondary`, chips) mesurent 26 px.

### 6.2 `Button size="md"` : sous 44 px, comme consigné — voici l'ampleur

Hauteurs mesurées : **36 px** (`primary`, `ghost`) et **38 px** (`secondary`,
`danger` — +1 px de bordure de chaque côté). SIGNALE §3 disait « ~36 px » : c'est juste.

Cibles sous 44 px par écran (toutes causes : `md`, liens de nav, `select`, puces) :

| écran | cibles < 44 px / total | écran | cibles < 44 px / total |
|---|---:|---|---:|
| `/app/setup` | **50 / 66** | `/app/household` | 13 / 24 |
| `/coach/meals` | **33 / 35** | `/account?tab=settings` | 12 / 12 |
| `/coach/protocol` | 16 / 26 | `/app/plan` | 11 / 16 |
| `/app/chat` | 9 / 16 | `/app/today` | 9 / 12 |
| `/coach/clients/:id` | 8 / 9 | `/account` | 9 / 9 |
| `/upgrade` | 5 / 5 | `/app/health` | 5 / 11 |

C'est **niveau AAA (2.5.5)**, non corrigé exprès, et le chiffre justifie la décision :
la corriger déplace la mise en page de tous les écrans d'un coup.

### 6.3 Les cibles sous **24 px** : toutes couvertes par une exception de 2.5.8

Chaque cible sous 24 px a été mesurée avec la distance à sa **voisine la plus proche**,
parce que l'exception d'espacement de 2.5.8 en dépend.

| écran | cible | taille | voisine la plus proche | verdict |
|---|---|---|---:|---|
| `/app/plan` | 6 cases à cocher | 16×16 | **346 à 412 px** | ✅ exception d'espacement |
| `/app/household` | 4 boutons `Modifier` (`text-fig-700 underline`) | 54,5×20 / 26×20 | **25 px** | ✅ exception d'espacement |
| `/account` | `Change my email` (bouton-lien souligné) | 112×20 | **8 px** | ✅ (le cercle de 24 px dépasse de 2 px ; la voisine est à 8) + exception « inline » |
| `/account?tab=settings` | interrupteur `Roaming` | 40×20 | **54 px** | ✅ |
| `/account` (3 onglets) | `a` Legal & privacy | 99,8×16,5 | 62,9 à 467,9 px | ✅ + exception « inline » |
| `/upgrade` | `Retour` | 67,7×20 | 264 px | ✅ |
| `/coach/clients/:id` | `a` Retour | 43,7×16,5 | 95,8 px | ✅ + « inline » |

**Aucune violation de 2.5.8.** Mais la liste dit quelque chose : sept endroits du
produit fabriquent un bouton en le déguisant en lien souligné, hors du kit, à 16-20 px
de haut. C'est du ressort de la revue « kit », pas de la mienne.

---

## 7. LES CASES À COCHER NATIVES — le bleu système qui reste

`@tailwindcss/forms` n'est pas installé (vérifié : absent de `package.json` et aucun
`@plugin` dans `index.css`). Donc sur une case native, `border-*`, `rounded-*` et
`text-*` sont **inertes** : seul `accent-*` agit.

| écran | cases | `accent-color` calculé | rendu |
|---|---:|---|---|
| **`/app/plan`** | **6** | **`auto`** | ⚠️ **bleu système** — la teinte que `Badge tone="info"` occupe |
| `/app/setup` | 2 | `rgb(99, 44, 76)` = `fig-700` | ✅ |

Source de l'unique cas rendu : **`keel/components/DishCard.tsx:126`**

```
className="h-4 w-4 rounded-part border-line-strong text-ink focus:ring-fig-600 disabled:opacity-50"
```

⚠️ **Le commentaire au-dessus de cette ligne affirme deux choses que le DOM démentit**,
et c'est le vrai danger : le prochain lecteur croira que c'est réglé.

> « Une case est un CONTRÔLE : sa bordure doit tenir le seuil 3:1 de WCAG 1.4.11, donc
> `line-strong` (3,84:1) […] L'anneau de focus est celui de la charte, `fig-600`
> (7,36:1) »

- `border-line-strong` sur une case native : **inerte**. Le carré est peint par le
  navigateur ; c'est `accent-color` qui le gouverne, et il vaut `auto`.
- `focus:ring-fig-600` **sans `ring-2`** : mesuré `box-shadow: none`. Aucun anneau de
  marque. L'indicateur réel est celui de Chrome (`outline: auto 1px`, bicolore, donc
  conforme — mais ce n'est pas la charte).

Le motif correct existe déjà dans le dépôt, deux fichiers plus loin :
`SetupPage.tsx:1845` fait `accent-fig-700 focus:outline-none focus:ring-2
focus:ring-fig-600` et mesure `rgb(99,44,76)` + un anneau à 7,36:1.

**Quatre autres sites sans `accent-*` dans les 16 écrans**, non atteints par l'état de
mes fixtures et donc **non mesurés** : `keel/pages/CoachDoctrinePage.tsx:1594, 1828,
1840, 1852`. Hors des 16 : `JoinHouseholdPage.tsx:578` et quatre pages publiques.

---

## 8. LES ERREURS NON ANNONCÉES — le chiffre exact

⛔ **Zéro région live dans les 16 écrans.** Mesuré sur les 22 relevés :
`document.querySelectorAll('[role=alert],[aria-live],[role=status]')` renvoie **`[]`**
sur chacun. Au code, les seules régions live du dépôt sont sur les **pages publiques**
(`StartPage` `role="alert"`, `MealPrepPage`, `CoachesPage`, `CouplesPage`
`role="status" aria-live="polite"`) et dans `YinYangLoader.tsx`, qui est mort.

### 8.1 Le paragraphe d'erreur de `Field` : **1 seul site d'appel dans tout le produit**

`<Field error={…}>` n'est utilisé **qu'une fois** : `keel/pages/TodayPage.tsx:1279`
(`error={photoError}`). Donc, à la question « combien d'écrans affichent une erreur non
annoncée par `Field` » : **1 sur 16** (`/app/today`, et seulement quand l'envoi d'une
photo échoue — état que je n'ai pas pu produire, voir §11).

Ça renverse un peu l'arbitrage consigné : la crainte des « 77 sites d'appel » et de la
double annonce porte sur les 102 appels de `<Field>`, mais **un seul** passe `error`.
Ajouter `role="alert"` au paragraphe d'erreur ne peut donc produire au plus **qu'une**
annonce, sur un seul écran. Le risque de double annonce imbriquée est nul aujourd'hui,
puisqu'il n'existe aucune région annoncée dans `/app` ni `/coach`.

### 8.2 Les erreurs qui, elles, s'affichent vraiment — et ne sont pas annoncées

Ce sont des `<p className="… text-red-700">` maison, hors de `Field`. Relevés au rendu :

| écran | texte mesuré | `role` | `aria-live` | dans une région ? |
|---|---|---|---|---|
| `/coach/templates` | « Les vocabulaires n'ont pas pu être chargés. » | `null` | `null` | non |
| `/coach/templates` | « Ta bibliothèque n'a pas pu être chargée. » | `null` | `null` | non |
| `/coach/import` | « The vocabularies could not be loaded, so… » | `null` | `null` | non |
| `/app/household` | « Les propositions n'ont pas pu être lues. » | `null` | `null` | non |

⚠️ Les quatre ci-dessus sont apparues parce que **mon** origine de mesure était refusée
par le CORS des fonctions edge (voir §11) — le texte est réel, la cause était la
mienne. Ils prouvent quand même le point : **quand une erreur s'affiche, elle n'est
jamais annoncée.** Au code, la surface connectée porte **46 blocs `text-red-6/7/800`**
dans un `<p>`, `<div>` ou `<span>`, et **aucun** n'est dans une région live.

---

## 9. LES FIGURES ET LES IMAGES

**Aucun `<img>` n'est rendu dans les 16 écrans avec mes fixtures** (`imgs: []` sur les
22 relevés) : aucune photo de repas, aucune vignette de journal, aucune recette
illustrée. Le jugement ci-dessous est donc **au code**, pas au DOM — c'est la limite la
plus nette de cette revue.

| site | `alt` | jugement |
|---|---|---|
| `keel/pages/TodayPage.tsx:533` | `t("photo.preview_alt")` = « La photo que tu t'apprêtes à envoyer » | ✅ il dit quelque chose |
| `keel/pages/ChatPage.tsx:846` | `alt=""` — vignette de la photo en attente, à côté d'un `<p>` qui nomme le fichier | ✅ décoratif à juste titre |
| **`keel/pages/ChatPage.tsx:739`** | `alt=""` — **la photo de repas que l'élève a envoyée**, dans sa bulle | ⚠️ défaut : c'est du **contenu**, pas du décor ; `alt=""` le supprime pour un lecteur d'écran |
| **`keel/pages/StudentProgressPage.tsx:670`** | `alt=""` — vignette du journal, dont le commentaire dit « c'est la preuve que la photo a servi à quelque chose » | ⚠️ défaut : même raison |
| `keel/pages/CoachMealsPage.tsx:442` | `alt="Photo de {titre}"` alors que le titre de la recette est affiché dans la même carte | détail : l'`alt` **répète le texte à côté** |

**Les SVG sont propres** : `svgUnlab = 0` sur les 22 relevés — aucun SVG visible sans
`aria-hidden="true"`, sans `aria-label` et sans `<title>`. 17 SVG sur `/upgrade`, 10 sur
`/coach/doctrine`, 5 sur `/account`, 3 sur `/app/today` : tous masqués ou nommés.
Et **aucun contrôle sans nom accessible** hors du cas §5.1 : la liste des `button`/`a`
sans texte, sans `aria-label`, sans `title` et sans `<label>` associé est vide sur les
16 écrans.

---

## 10. CE QUE LA COULEUR SEULE PORTE — je n'ai rien trouvé

C'est le point où le chantier a le mieux travaillé, et c'est mesurable.

| état | porteur non chromatique mesuré |
|---|---|
| onglet / page courante | `aria-current="page"` + **remplissage** `bg-fig-700 text-paper` (pas une teinte de texte) |
| menu ouvert/fermé | `aria-expanded` sur le bouton, `aria-controls` sur un `id` réel, **et le libellé change** (`Menu` ⇄ `Fermer`) |
| bascule de langue | `aria-pressed="true"` / `"false"` sur les deux boutons de `LocaleSwitch` |
| plage de progrès 7 j / 30 j | `aria-pressed` + **remplissage** `bg-fig-700 text-paper` vs texte nu |
| 30 puces de groupes alimentaires (`/coach/meals`) | `aria-pressed` + **remplissage** `border-fig-700 bg-fig-700 text-paper` vs `bg-paper` bordé |
| 9 groupes dépliables (`/coach/protocol`) | `aria-expanded` + un `+` dans le libellé |
| notifications (`/app/chat`) | `aria-expanded` |
| interrupteur `Roaming` | `aria-pressed` + position du curseur |
| siège actif (`/coach/clients/:id`) | `aria-current="true"` |
| sévérité d'un engagement (`/app/today`) | **glyphes** `▮▮▮ Essentiel` — une échelle en formes, doublée du mot |
| allergène (`/app/household`) | `peanut` en `red-700`, **suivi du mot « allergie »** en `ink-soft` |
| statut d'élève (`/coach`) | `Silent` en `red-700` — **le mot lui-même** porte l'état |

Aucun état rencontré ne repose sur la seule teinte. Et le garde-fou de la charte tient
au rendu : **aucune classe `fig-*` dans une pastille** sur les 22 relevés ; les seules
pastilles mesurées sont `line`/`ink-soft` (neutre, 4,72:1) et les familles d'état.

---

## 11. CE QUE JE N'AI PAS PU VÉRIFIER, ET POURQUOI

1. **Les images au rendu.** Aucune fixture ne porte de photo : `imgs: []` sur les
   22 relevés. Les cinq `alt` du §9 sont jugés au code. Un `alt` ne se juge vraiment
   qu'à côté de ce qu'il remplace.
2. **L'état d'erreur de `Field`.** Un seul site d'appel (`TodayPage:1279`,
   `photoError`), et il demande un échec d'envoi de photo. Je n'ai pas produit cet
   échec, donc je n'ai pas vu le paragraphe. Son absence de `role="alert"` est lue au
   code, la portée (1 écran sur 16) est comptée au code.
3. **Quatre cases sans `accent-*` de `/coach/doctrine`** (lignes 1594/1828/1840/1852) :
   la branche qui les rend n'est pas atteinte par la doctrine de mes fixtures.
   Le défaut est probable par symétrie avec `/app/plan`, il n'est **pas mesuré**.
4. **Les états riches de quatre écrans coach.** `/coach/weekly` (aucune synthèse),
   `/coach/templates` (aucun gabarit), `/coach/billing` (aucune période),
   `/coach/doctrine` (une seule doctrine, sans entrée par portée) rendent des états
   vides ou quasi vides : 5 à 12 couples de couleurs seulement. Ce que ces écrans
   composent quand ils sont pleins n'est pas mesuré.
5. ⚠️ **Le CORS des fonctions edge refuse les origines de revue, et ça fausse les
   mesures.** `supabase/functions/_shared/cors.ts` (`isLocalOrigin`) n'accepte que les
   noms d'hôte `localhost` et `127.0.0.1`. Or `http://[::1]:5191` — l'origine que mon
   brief propose — **n'en est pas**, et `http://revue1.localhost:5191`, où travaille une
   autre revue, non plus. Depuis `[::1]`, `/coach/doctrine` rend « We could not read
   your doctrine. CORS origin not allowed », `/coach/templates` et `/coach/import`
   rendent leurs erreurs de chargement, et `/app/household` perd ses propositions.
   **J'ai refait tous ces écrans depuis `http://localhost:5191`** et les mesures du
   présent rapport sont celles-là. **Les autres revues devraient vérifier leur origine
   avant de conclure quoi que ce soit sur un écran qui dépend d'une fonction edge.**
6. **La frappe clavier réelle est instable dans ce panneau.** Le focus retombe sur
   `<body>` entre deux appels d'outil, et une autre session redimensionne le viewport
   partagé pendant les mesures (j'ai vu 320 devenir 1280 en cours de série ; chaque
   relevé de ce rapport porte donc son `innerWidth` mesuré). J'ai relevé l'ordre du
   focus et les anneaux par frappes Tab réelles là où c'était possible (§4.1), puis les
   anneaux par `.focus()` **suivi d'une attente de 200 ms**, et le menu par `.click()`
   plus un `KeyboardEvent('keydown', {key:'Escape'})` — le gestionnaire d'Échap est un
   `document.addEventListener` natif (`KeelAppShell.tsx:194`), c'est donc bien lui qui
   est exercé.
7. ⚠️ **Le piège de mesure qui m'a presque fait écrire un faux bloqueur.** Lire
   `getComputedStyle(el).outlineColor` dans le **même tick** que `el.focus()` renvoie
   `currentColor`, pas `fig-600` : `transition-colors` transitionne `outline-color`, et
   on lit le début de la transition. Sur un bouton `secondary` ça donne `#23191F`
   (ink) ; **sur un bouton `primary` ça donne `#FBF8FA` (paper), soit 1,00:1 contre le
   papier** — un anneau de focus parfaitement invisible, et un bloqueur AA tout prêt.
   Il est faux. À l'état stabilisé la valeur est `#7E3C61` = 7,36:1. Toute revue future
   qui mesure un anneau doit **attendre la fin de la transition**.
8. **Safari iOS lui-même.** La mesure des 16 px est un `font-size` calculé dans
   Chromium. C'est la condition qui déclenche (ou non) le zoom de Safari, mais je n'ai
   pas d'iPhone dans la boucle.
9. **Le lecteur d'écran.** Je mesure les noms accessibles, les rôles et les états dans
   le DOM ; je n'ai pas fait passer VoiceOver ou NVDA sur un écran.

---

## 12. LE CLASSEMENT

### ⛔ Bloqueurs — échec WCAG niveau A ou AA sur un chemin normal

| # | défaut | critère | où |
|---:|---|---|---|
| B1 | **8 contrôles de saisie sans nom accessible** ; 8 `<label>` orphelins | **1.3.1 (A)**, **4.1.2 (A)**, 3.3.2 (AA) | `/app/household` — cause : `<Field>` sans `htmlFor` ×10 dans `HouseholdPage.tsx` |
| B2 | **2 à 4 libellés de navigation imprimés l'un sur l'autre** en français à ≥ 1024 px ; débordement mesuré +76 px (1280) et +172 px (1024) ; silencieux | perte de contenu / 1.4.4 à 200 % ; illisibilité pure | les 8 écrans élève, shell `KeelAppShell` |
| B3 | **5e onglet coupé de 32 px à 320 px** en français, sans ellipse, sans défilement | **1.4.10 Reflow (AA)** | barre d'onglets élève, les 8 écrans élève |

### ⚠️ Défauts — AAA, ou AA sur un chemin rare, ou charte non tenue

| # | défaut | où |
|---:|---|---|
| D1 | **6 cases à cocher en bleu système** (`accent-color: auto`) + `focus:ring-fig-600` **sans largeur** ⇒ aucun anneau de marque + **un commentaire qui affirme le contraire** | `/app/plan` — `DishCard.tsx:126` |
| D2 | **Aucune région live dans les 16 écrans** ; 46 blocs `text-red-*` dont aucun annoncé ; `<Field error>` n'a **qu'un** site d'appel (`TodayPage:1279`) | tout `/app` et `/coach` |
| D3 | **Aucun `h1`, aucun repère** (`<main>`, bannière, `role=dialog`) | `/account` (3 onglets) — `UserProfile.tsx` monté en pleine page |
| D4 | **Échap referme le menu mais le focus retombe sur `<body>`** au lieu de revenir au bouton | shell téléphone, les 16 écrans |
| D5 | **La barre d'onglets du bas prend le focus avant le contenu** (ordre du DOM ≠ ordre visuel) | shell téléphone, les 8 écrans élève |
| D6 | `Button size="md"` mesuré **36 px** / **38 px** ; 5 à 50 cibles sous 44 px par écran | **2.5.5 (AAA)** — connu, non corrigé exprès |
| D7 | `alt=""` sur **du contenu** : la photo de repas de l'élève, la vignette du journal | `ChatPage.tsx:739`, `StudentProgressPage.tsx:670` |
| D8 | **7 étiquettes orphelines** qui sont des `<legend>` déguisés en `<label>` (les contrôles ont bien un nom) | `/app/setup` ×7, `/coach/meals` ×1 |
| D9 | **Ni `<main>` ni lien d'évitement** dans le shell ; 10 arrêts de nav répétés avant le contenu à 1280 px (2.4.1 tenu par H69, sauf sur `/account`) | les 16 écrans |
| D10 | Boutons désactivés à **3,26:1** et bordures à **1,81:1** — exemptés, mais c'est un `disabled:opacity-50` unique dans `ui/Button.tsx`, donc une ligne à remonter | 6 écrans |

### · Détails

| # | détail | où |
|---:|---|---|
| T1 | `alt="Photo de {titre}"` répète le titre affiché à côté | `CoachMealsPage.tsx:442` |
| T2 | `h1` = « KEEL discovery program », nom interne dans une copie élève | `/app/today` — déjà SIGNALE §8 |
| T3 | `/account` rendu en anglais quand le reste de l'app est en français | `UserProfile.tsx` |
| T4 | 7 boutons déguisés en liens soulignés, 16,5 à 20 px de haut, hors du kit | `/app/household` ×4, `/account` ×2, `/upgrade`, `/coach/clients/:id` |
| T5 | `select` mesurés à **42,5 px** — 1,5 px sous les 44 px de 2.5.5 | tous les écrans à champs |
| T6 | `components/account/DataPrivacySection.tsx` porte encore **24 `gray-*`, 23 saturées, 13 rayons** au disque (cf. `MESURE-APRES.txt`). Rendu sous `/account?tab=settings` : **aucun échec de contraste mesuré**, donc ce n'est pas mon lot — mais c'est le seul fichier que le balayage a laissé derrière lui | `/account?tab=settings` |

---

## 13. LA MÉTHODE, POUR QUE ÇA SE REFASSE

- **Origine de mesure** : `http://localhost:5191` (les autres origines locales sont
  refusées par le CORS des fonctions edge, §11.5). Personas : `ff060_house@example.com`
  (élève avec objectif + foyer), `qa0805.a13.coach@keeltest.dev` (coach actif,
  3 élèves, 1 doctrine — trouvé par `select count(*) from coach_clients group by
  coach_id`, le persona `coach` de `qa-session.sh` n'a **aucun** élève et rend des
  écrans vides).
- **Langue** : `localStorage['sophia.ui_locale']`. B2 et B3 **n'existent qu'en `fr`** —
  toute revue de mise en page qui ne mesure qu'en anglais les rate. Le paramètre
  `?lang=fr` de l'URL n'a **pas** pris chez moi ; seule l'écriture directe de la clé
  puis un rechargement l'a appliqué.
- **Courtoisie de poste partagé** : j'ai sauvegardé le jeton et la locale de la session
  qui occupait l'origine `localhost:5191` sous mes propres clés, puis **je les ai
  restaurés** ; mes clés de travail (`__r3`, `__r3z`, `__r3_saved_*`) sont retirées.
  Aucun `localStorage.clear()`, aucun onglet fermé, aucun fichier de `frontend/`
  modifié.
- **Ce que j'ai mesuré, et pas regardé** : contraste composé (encre et opacité aplaties
  sur le fond effectif remonté jusqu'au premier ancêtre opaque), `font-size` calculé,
  `border-*-color` calculé, rects pour les cibles **et la distance à la voisine la plus
  proche** (l'exception d'espacement de 2.5.8 en dépend), `accentColor` calculé,
  `outline`/`box-shadow` relus **après stabilisation de la transition**, association
  `label[for]` ↔ `id` réelle, et recherche de recouvrement de rects entre libellés de
  navigation. Le panneau ne repeignant qu'à scroll 0, **une seule** capture a servi —
  celle qui a fait apparaître « Ĝoyupte » et lancé la mesure de B2.
