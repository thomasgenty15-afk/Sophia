# `/couples` — rapport du constructeur 2

> Refonte « par la douleur » du 2026-08-13. Branche `ff-001-quotidien-du-coach`.
> **Rien n'est commité.**

---

## 1. Le poids

| | avant | après |
|---|---|---|
| **mots rendus** (valeurs EN du catalogue) | **682** | **547** |
| clés | 65 | 70 |
| figures SVG | 3 | 1 (+ la marque de casserole de la démonstration) |
| lignes de `CouplesPage.tsx` | 468 | 752 (dont ~250 de commentaire d'ancrage) |

Commande de comptage : celle du §9 du socle, sur `drafts/couples.en.ts`.
**−135 mots (−19,8 %)**, alors que la page **gagne une bande entière** (douleur 02,
qui n'existait pas) et **six chaînes de vocabulaire produit** (`couples.dir.*`,
42 mots à elles seules, non compressibles puisque verbatim).

## 2. Les fichiers livrés

- `frontend/src/keel/pages/CouplesPage.tsx` — réorganisée en quatre bandes.
- `frontend/src/keel/i18n/drafts/couples.en.ts` — **70 clés**, namespace entier.
- `frontend/src/keel/i18n/drafts/couples.fr.ts` — **70 clés**, parité vérifiée.

Contrôles automatiques passés : parité EN/FR = 70/70, **zéro clé utilisée par la
page absente du brouillon**, **zéro clé du brouillon jamais utilisée**, zéro
U+202F, zéro apostrophe droite dans le pack FR, `npx tsc -p tsconfig.app.json`
**sans une seule erreur sur mes deux fichiers ni sur la page** (les 568 erreurs
du dépôt sont des `TS2783` de clés en double dans `en.ts`/`fr.ts`, normales tant
que l'ancien bloc `couples.` et les brouillons des sept autres coexistent).

---

## 3. La forme : quatre bandes, une par ligne de la grille

| bande | fond | douleur | ce qui la porte |
|---|---|---|---|
| 1 · `Hero` | `paper` | 01 — deux objectifs = deux casseroles = abandon | **la démonstration** |
| 2 · `Bodies` | **`fig-950`** | 02 — « il mange deux fois plus que moi » | la fiche « ce qui entre / ce qui sort » |
| 3 · `OtherProfile` | `paper` | 03 — un seul des deux planifie | `FigWho` |
| 4 · `Price` | `paper-2` | le prix et la clôture | `PriceCard` |

**Le bloc sombre se dépense sur la bande 2**, et c'est le seul arbitrage de
composition que j'ai eu à prendre. Raison : c'est la seule bande où le produit
annonce qu'il connaît un corps ; le même bloc doit donc porter, sans changer de
fond ni de ton, ce qu'il n'en fera jamais. La réserve n'y est pas une note de
bas de page, c'est la moitié de l'argument.

**Conséquence acceptée : la bande 2 n'a pas de figure SVG.** `.on-dark`
(`tokens.css:199-202`) ne remonte que `--ill-fig` et `--ill-ink-soft` ; `--ill-ink`,
qui porte le contour de 2 d'une chose réelle, y resterait à `#23191F`, invisible.
Une figure sur ce fond est une figure amputée de son trait principal. La fiche
de la bande 2 est donc en **HTML** — quatre champs, un filet, une phrase — et
pas par commodité.

---

## 4. Ce que j'ai coupé, nommément

### `WeekHolds` — la section entière, **et sa phrase de réserve**
« La semaine encaisse sans être refaite » (C7, `REALIGNMENT_ACTIONS`) est la
**douleur 03 de `/meal-prep`**. La grille ne me l'a pas donnée. Le prompt
m'autorisait **une phrase** de réserve ; **je ne l'ai pas prise**. Deux raisons :

1. La douleur 01 dit « au bout de quinze jours l'un lâche ». On peut croire que
   le décalage de plat y répond — mais la réponse que la grille écrit est
   *« une casserole, deux parts décrites »*, et c'est elle qui est spécifique au
   couple. Le décalage de plat vaut aussi bien pour quelqu'un qui vit seul.
2. Le hero portait déjà trois lignes de petit texte (prix, réserve d'entrée,
   réserve « pas de garanti »). Une quatrième aurait fait de la colonne de gauche
   une note de bas de page à trois étages.

`FigChat` (les quatre boutons de réalignement) part avec la section : plus aucune
clé `couples.fig.chat.*` ni `couples.week.*` n'existe.

### `NotThis` — meurt **comme bande**, survit **comme réserves**
L'ancien bloc sombre « ce que nous ne faisons pas » se replie en deux endroits :

- le **« rien ne vérifie »** sous la démonstration (`couples.demo.reserve`) ;
- l'**absence de courbe + les chiffres éteints** sous la bande 2
  (`couples.bodies.reserve`), qui reprend intégralement l'ancien
  `couples.dark.say` + `couples.dark.note`.

Rien de l'honnêteté d'origine n'est perdu ; elle est simplement collée à la
section qu'elle concerne au lieu d'être une bande à part.

### La bande de trois faits sous le hero (`couples.facts.*`)
« Six objectifs, six directions » et « une phrase, pas un chiffre » étaient
**racontés**. La démonstration les **montre** : six puces cliquables, six phrases
distinctes, zéro chiffre. Un fait montré **et** redit est un fait qu'on n'a pas
cru montrer. Le troisième fait (« la session de cuisine », C3) est la douleur 02
de `/meal-prep` : il sort du périmètre de cette page.

### `FigPlates` (l'ancienne figure du hero)
Remplacée par la démonstration, qui fait le même travail en le laissant vérifier.
Sa garde structurelle — « les deux assiettes sont le **même** élément, appelé
deux fois par `<use>` » — n'est plus nécessaire : ce qui diffère est désormais
**écrit**, ligne par ligne, et rien n'est dessiné qui affirmerait une taille.

---

## 5. ⭐ La démonstration — les deux assiettes

Le lecteur choisit **deux objectifs**, un par personne, et voit **les deux parts
se recomposer** autour du même plat.

### Les six valeurs sont verbatim, et c'est vérifié
Les six `couples.dir.*` sont les six valeurs de `SERVING_DIRECTION`
(`_shared/keel/household_portions.ts:125-151`) **mot pour mot**. Vérifié par
script contre le module Deno lu comme du texte : **6/6 OK**.

### Les axes se lisent, ils ne se recopient pas
`CouplesPage.tsx` porte un **lecteur de 18 lignes** (`readServingDemands`) qui
applique la grammaire fermée du module — 7 qualificatifs (`QUALIFIERS`), 4 noms
d'axes (`AXIS_WORDS`), le raccourci `component`, et la règle « un qualificatif
gouverne les axes qui le suivent ». **Aucune table de résultats n'est recopiée.**

Mesuré au navigateur, les six objectifs, un par un :

| objectif | protéine | féculent | légumes |
|---|---|---|---|
| `fat_loss` | entière | plus petite | plus grande |
| `muscle_gain` | plus grande | plus grande | équilibrée |
| `recomposition` | entière | modérée | plus grande |
| `performance` | entière | plus grande | **rien de demandé** |
| `health` | équilibrée | équilibrée | plus grande |
| `maintenance` | équilibrée | équilibrée | équilibrée |

`performance` est le seul à laisser un axe `null` : sa chaîne ne nomme pas les
légumes, donc elle n'en demande rien — et l'écran le dit plutôt que de deviner.
Et **`health` ne rend plus l'assiette de `maintenance`** : c'est exactement le
défaut que le module a payé pendant des semaines, et il est maintenant **visible
sur une page de vente**.

### ⚠️ L'anglais est lu, le français est affiché
La grammaire du module est **anglaise**. Donner au lecteur d'axes la traduction
française rendrait `unreadable` sur les trois axes — c'est-à-dire un écran de
vente vide en français que personne n'aurait vu en anglais.

D'où : `EN_DIRECTION` importe **le seed `en`** (`import { en } from "../i18n/en"`),
pas `t()`. Les six clés y sont écrites **en toutes lettres**. Le rendu, lui,
passe par `t()` comme tout le reste. C'est le seul endroit de la page qui lit le
catalogue autrement que par `t()`, et le commentaire dit pourquoi.

### Le plancher technique, vérifié un par un
- **Juste sans un geste** : `muscle_gain` / `fat_loss` par défaut — les deux
  directions qui divergent le plus (protéine et féculent en sens contraire).
  Deux directions et six axes sont lisibles avant tout clic, avant tout JS.
- **Vrais `<input type="radio">`**, `<fieldset>` + `<legend>` (vérifié dans le
  DOM : `FIELDSET` > `LEGEND` en premier enfant), `<label>` enveloppant.
  **Navigation clavier mesurée** : focus sur `fat_loss`, deux `ArrowDown`
  ⇒ `activeElement=recomposition`, `input:checked=recomposition`, et le panneau
  a recomposé. Aucune touche n'est gérée à la main.
- **Focus visible** : le champ est `sr-only`, donc l'anneau est porté par
  `peer-focus-visible:outline-2 / outline-offset-[3px] / outline-fig-600` — la
  règle de `tokens.css` ne cible que `a, button, [tabindex]` et **n'aurait pas
  couvert un `<input>`**. Vu à l'écran (capture 1280 FR).
- **État annoncé, pas seulement coloré** : la radio annonce sa coche
  nativement ; le panneau de sortie est `aria-live="polite"`, donc la
  conséquence est annoncée aussi.
- **`prefers-reduced-motion`** : mes seules transitions sont des
  `transition-colors`, neutralisées par la règle globale de `tokens.css:291-297`.
- **320 px** : les deux sélecteurs **se superposent** (`grid-cols-1 sm:grid-cols-2`)
  — c'est là que ça casse, et c'est ce que j'ai vérifié en premier. Les puces
  s'enroulent en 5 rangées en FR, 4 en EN. `scrollWidth = 320 = innerWidth`.
- **Zéro dépendance ajoutée.** React + CSS.
- **Ce n'est pas une capture** : ni barre d'app, ni cadre d'appareil, ni bouton
  du produit. C'est une fiche.

### Une correction de mise en page mesurée
Les deux consignes ne font pas le même nombre de lignes (une pour `maintenance`,
quatre pour `performance` en FR), donc **les deux tableaux d'axes démarraient à
30 px l'un de l'autre** — or c'est ligne par ligne qu'on les compare, et c'est
tout l'objet de la fiche. Réparé par `grow` + `mt-auto` sur la liste d'axes : les
deux cartes ayant déjà la même hauteur (`stretch` de la grille), les tableaux
s'alignent **par le bas** quel que soit le couple d'objectifs choisi. Vérifié sur
le pire cas (`performance` / `maintenance`) : rangées à 730 / 762 / 795 des deux
côtés, identiques.

Un `min-height` calculé sur le pire cas avait été essayé d'abord : il laissait un
trou de trois lignes sous « part équilibrée de chaque composant ».

---

## 6. Les claims, avec leur ancre

| # | Claim | Ancre | Où |
|---|---|---|---|
| C4 | un plat, deux instructions de service divergentes | `household_portions.ts:125-151` `SERVING_DIRECTION` (6 chaînes distinctes) | hero + démo |
| C4 | « le plat est le même » | `household_portions.ts:339` `COOKING_SHAPE_LINES.one_dish` — « Cook ONE set of preparations for everyone. Do NOT propose separate dishes. » | légende de la casserole |
| C4 | ce qu'une direction demande, axe par axe | `household_portions.ts:264-283` `readServingDemands` + `SERVING_AXES` `:203` + `SERVING_DEMANDS` `:211` | les 3 rangées de chaque colonne |
| C4 | taille, poids, âge et sexe dimensionnent la part | `20260812220000:118` `household_member_bodies` · `keel_household_bodies_for` `:420-455` (l'âge dérivé de la date) · `generate-household-meal-v1/index.ts:1234-1273` (`body` par membre) · `meal_envelope.ts:448-461` `maintenanceEnvelopeFromBody` (lit poids, taille, bande d'âge, sexe) | bande 2 |
| C4 | « et rien d'autre n'en sort » | `household_portions.ts:529-538` `BODY_FACTS_CAVEAT` — « there for ONE thing: the SIZE of a portion […] no daily energy need, no calorie figure, no BMI, no category, no target » | bande 2 |
| C4 | ce qui sort est **une phrase** | `household_portions.ts:99-109` `MemberPortion.portionNote` · trou FF-043 §11 n°1 : `member_deltas` (les grammes) n'a **aucun écran** | bande 2, « ce qui sort » |
| — | pas de « garanti » | `household_portions.ts:877-930` `reconcilePortions` accepte N consignes identiques **sans lever une seule `issue`** | réserve sous la démo |
| C16 | pas de courbe, pas de suivi de poids | `20260812220000:118` — **une ligne écrasée**, ni date ni série | réserve bande 2 |
| C15 / C15b | chiffres éteints par défaut, **quatre** verrous | `20260812230000:60` `energy_display_enabled` default false · `energy_gate.ts:232-250` (plancher TCA, mineur, méthode du coach, interrupteur élève) | réserve bande 2 |
| C8 | l'autre est dans le plan **avec ou sans compte** | FF-044 🟢 · `20260810260000:179-190` (`user_id = null`) · `household_portions.ts:63-72` (la part est clée sur `memberId`) | bande 3 + `FigWho` |
| C1 | 12,99 €/mois le foyer · 2 €/profil réclamé · maître jamais compté · plafond 8 | `20260810260000:235-250` et `:101-105` | hero, `FigWho`, bande 4 |
| C14 | ce qu'on demande pour ajouter quelqu'un | `onboarding.ts:650-662` — **sans durée** (S8, D5) | bande 3 |
| C13 | la branche `pair` du parcours existe | `onboarding.ts:84` `FunnelBranch` · `App.tsx:220` | bande 4 |
| §10 | l'inscription n'est pas promise immédiate | `/start` interroge `keel_free_signup_available` d'abord | réserve, hero **et** bande 4 |

---

## 7. Ce que j'ai vu au navigateur

Serveur : **`npx vite --port 5176`** lancé à la main. `preview_start
{name:"frontend-alt2"}` refuse de démarrer — **le dossier est à son plafond de
5 serveurs** (5178, 5179, 5186, 5190, 5191 tenus par les autres constructeurs).
Le panneau a été ouvert par `preview_start {url}` sur ce serveur-là, ce qui évite
aussi de partager l'origine (donc le `localStorage`, donc la langue) avec les
sessions voisines. **Le serveur est arrêté à la fin de ce rapport.**

Quatre passes, plus les mesures :

| passe | ce qui a été vérifié |
|---|---|
| **320 px FR** | `documentElement.scrollWidth = 320 = innerWidth`. Un `h1`, trois `h2`, sans saut. 12 radios, 2 cochées par défaut. Puces sur 5 rangées, cible 31 px de haut. `FigWho` défile **dans** sa `.fig-scroll` (420 de contenu pour 320 de piste) sans emporter la page. |
| **320 px EN** | idem, `scrollWidth = 320`. **Aucun élément de `main` plus large que la fenêtre hors `.fig-scroll`** (contrôle programmatique, liste vide). Puces sur 4 rangées. |
| **1280 px FR** | `scrollWidth = 1280`. Colonne de démo à 563 px, deux cartes de 254 px, puces sur 4 rangées. `FigWho` à 549 px, sous le plafond de 560. Les deux tableaux d'axes alignés. |
| **1280 px EN** | idem. Le libellé « The serving direction » tient sur une ligne. Bande sombre, bande 3 et bande 4 relues en entier. |

⚠️ Le panneau ne repeint qu'à scroll 0 : chaque bande a été amenée en haut par
`document.body.style.marginTop` négatif, jamais par un scroll.

**Console : aucune erreur, aucun avertissement.** `t()` lève en dev sur une clé
inconnue — une page qui se rend est une page dont les 70 clés existent des deux
côtés.

Langue basculée par **l'interrupteur de la page** (`LocaleSwitch`), jamais en
vidant le `localStorage`.

---

## 8. Ce que j'ai refusé d'écrire

1. **Un gramme, une calorie, une courbe.** La bande 2 est la bande la plus
   exposée : elle annonce qu'on connaît une taille et un poids. Elle ne rend
   **aucun nombre**, et la réserve dit dans la même bande qu'il n'y a ni courbe
   ni balance. `household_member_bodies` est une ligne écrasée (C16).
2. **« Garanti ».** `reconcilePortions` accepte quatre consignes identiques sans
   lever d'`issue`. La réserve l'écrit : *« deux directions partent, et rien ne
   vérifie que ce qui revient fait bien deux parts différentes »*.
3. **« La direction envoyée en cuisine »** — écrit d'abord, puis retiré. Deux
   défauts : le mot « cuisine » se lit comme une brigade de restaurant sur une
   page qui parle de la casserole de quelqu'un, et le libellé laissait croire que
   la chaîne montrée est ce que l'écran rend. C'est faux : `SERVING_DIRECTION`
   **instruit le modèle**, qui rédige ensuite la consigne dans la langue de
   l'élève (`household_portions.ts:111-124`). Remplacé par « la direction de
   service », et la légende dit ce que l'écran rend à la place.
4. **La durée d'essai et le bouton d'achat** (§8 n°1). Le prix se dit — c'est la
   décision produit FF-049 — la date et le geste, non.
5. **« Jamais de calories »** (§8 n°2, faux depuis FF-059). La seule formulation
   tenable est celle de C15b, et c'est elle qui est écrite.
6. **Une entrée immédiate** (§10). La réserve `couples.hero.reserve` est rendue
   **deux fois** : sous le CTA du hero et sous celui de la clôture. Un CTA sans
   sa réserve est une promesse.
7. **Un rôle de genre.** Les deux colonnes s'appellent « l'un de vous » et
   « l'autre ». Aucun pronom personnel, aucun objectif attribué à un sexe.
8. **Une application mobile** (C17), **« rien à installer »** (S4),
   **« échanger un plat »** (§5.1, C6) : aucun des trois n'apparaît.

---

## 9. Ce que je signale à l'orchestrateur

1. **Aucune clé `public.*` neuve n'est nécessaire** pour rendre ma page.
2. ⚠️ **Mais la navigation contredit la grille.** L'en-tête et le pied rendent
   « Batch cooking · En couple · En famille » (FR) et « Meal prep · Couples ·
   Families » (EN). La grille tranche : *« on nomme la **situation**, pas le
   segment : personne ne se dit "je suis un solo" »*, et propose **Pour moi
   seul · À deux · En famille**. Ce sont des clés `public.*` (`PublicHeader.tsx`,
   `PublicFooter`) que je n'ai pas le droit de toucher. Le kicker de ma page dit
   déjà « À deux » ; il jure avec l'onglet « En couple » juste au-dessus.
3. **`couples.week.*`, `couples.dark.*`, `couples.facts.*`,
   `couples.fig.plates.*`, `couples.fig.chat.*` sont morts.** Ils sont encore
   dans `en.ts`/`fr.ts` et n'ont plus aucun lecteur. Le remplacement du bloc
   `couples.` par mon brouillon les emporte — c'est le comportement attendu.
4. **`CouplesPage.tsx` portait un commentaire faux** que j'ai réparé : il
   annonçait `audience="student"` sur le `PublicHeader` alors que le code rend le
   défaut `audience="coach"`. Le code avait raison (`PublicHeader.tsx:128-147` :
   `"coach"` veut dire « page de vente », pas « page de coach »), le commentaire
   décrivait précisément le défaut que ce fichier-là documente comme déjà payé.
5. **Le contrôle F8 de la charte** (`grep -coE '(stroke|fill)="var\(--ill-fig'`)
   rend désormais **3** sur ce fichier, pas 4 : `FigCorner` (partagée), le filet
   de `FigWho`, et la casserole de la démonstration. Une figure rendue, une pièce
   chaude — la casserole n'a pas d'équerre SVG parce que son équerre est celle du
   `Kicker`, en HTML, juste au-dessus.
6. **Le test `frontend/src/keel/i18n/servingDirections.int.test.ts`** (écrit par
   le constructeur 1) est **VERT** : `3 passed`, dont
   *« sont rendues MOT POUR MOT par `/couples` »*. Il était rouge par
   construction tant que mon brouillon n'existait pas — son en-tête le dit. Je
   l'ai lu et exécuté ; **je ne l'ai pas édité**.

   ```
   npx vitest run src/keel/i18n/servingDirections.int.test.ts
   ✓ src/keel/i18n/servingDirections.int.test.ts (3 tests) 2ms
   ```

   ⚠️ Lancé avec `env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u
   SUPABASE_SERVICE_ROLE_KEY` : la mémoire du dépôt (« l'env QA empoisonne la
   suite ») compte 114 faux rouges quand ces variables traînent dans le shell.
