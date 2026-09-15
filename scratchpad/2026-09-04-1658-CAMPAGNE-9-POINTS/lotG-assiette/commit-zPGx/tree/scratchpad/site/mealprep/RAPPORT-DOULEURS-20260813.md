# `/meal-prep` — rapport de refonte « par la douleur »

> Constructeur 1 · 2026-08-13 · branche `ff-001-quotidien-du-coach`
> Fichiers livrés : `frontend/src/keel/pages/MealPrepPage.tsx` ·
> `frontend/src/keel/i18n/drafts/mealprep.en.ts` ·
> `frontend/src/keel/i18n/drafts/mealprep.fr.ts` ·
> `frontend/src/keel/i18n/servingDirections.int.test.ts`
> **Rien n'est commité.**

---

## 1. Le poids

| | avant | après | delta |
|---|---|---|---|
| clés | 52 | **72** | +20 |
| **mots rendus (EN)** | **544** | **496** | **−48 (−8,8 %)** |
| mots rendus (FR) | — | 551 | le français est la langue longue ; le budget est sur l'anglais |
| figures | 3 | 3 | inchangées |
| démonstration interactive | 0 | **1** | le sélecteur d'objectif |
| lignes de page | 491 | 736 | +245, dont ~120 de commentaire d'ancrage et la démonstration |

Le compte est celui du script du socle §9, sur `drafts/mealprep.en.ts`.

**La page dit plus avec moins :** une section entière est apparue (la douleur 01,
qui manquait), la démonstration a coûté ~120 mots de vocabulaire (six consignes,
six objectifs, cinq crans d'échelle, trois axes), et la prose a quand même
reculé de 48 mots.

---

## 2. La forme livrée — quatre bandes, pas cinq

| bande | douleur | ce qu'elle porte |
|---|---|---|
| **1** `Goal` | 01 — « mon objectif n'a aucune traduction dans mon assiette » | le seul `h1`, le CTA, **la démonstration**, la réserve « ni écran ni grammes », **le bloc sombre** |
| **2** `Week` | 02 — « décider coûte plus cher que cuisiner » | un seul argument, **deux figures** (session + vagues) côte à côte à `lg` |
| **3** `Moves` | 03 — « un imprévu, et toute la semaine tombe » | `MovesFigure` gardée telle quelle |
| **4** `Start` | le prix et la clôture | `PriceCard` unique, fiche vierge de ce qu'on demande, CTA répété |

Le **bloc sombre** (`bg-fig-950`, un seul par page) est dépensé **sur** la
bande 1, au pied, pas comme une bande de plus.

---

## 3. Ce que j'ai coupé, section par section

| ce qui est mort | pourquoi |
|---|---|
| **La bande `Quiet` en tant que bande** (7 clés : `numbers_label/value`, `ranking_label/value`, `left_label/value`, `title`) | Elle ne servait aucune des trois douleurs. Son contenu est replié en réserve dans la bande 1 — **3 clés** (`quiet.kicker`, `quiet.numbers`, `quiet.ranking`), ~37 mots au lieu de ~90. |
| `mealprep.quiet.left_value` (« ce qui reste : ce que tu cuisines, quand, et les courses ») | Redite exacte des bandes 2 et 3. Une réserve qui répète la page n'est pas une réserve. |
| `mealprep.quiet.title` (« Pas de score. Pas de série. ») | Devenue une phrase de `quiet.ranking` : un `h2` pour deux phrases était une bande déguisée. |
| L'ancien `hero.title` « Cuisiner n'est pas le plus dur. Décider, si. » | Excellent, mais c'est la **douleur 02**. Il devient le `h2` de la bande 2, à sa place. |
| La section `Waves` comme section autonome | Fusionnée dans la bande 2 : sessions et vagues sont **un** argument (« on décide moins »), pas deux. Les deux figures survivent intactes, elles portent chacune une moitié. |
| ~40 mots dans les trois `fig.*.desc` | Ce sont des `<desc>` d'accessibilité, pas de la vente. Elles décrivent, elles n'argumentent plus. |
| « pas une version réduite » (`hero.price_note`), « D'autres bouches pourront s'y ajouter » (`start.body`) | Deux réserves qui répondaient à une objection que la page ne soulève plus. |

**Ce que j'ai gardé exprès :** les trois figures (aucune n'a bougé d'un pixel),
`waves.reserve` (le masquage à une seule vague), `moves.note` (aucun plat choisi
à ta place), la fiche vierge de `/start`, `PriceCard` seule.

---

## 4. La démonstration — six objectifs, six façons de servir

**La chaîne complète, de la constante à l'écran :**

1. `SERVING_DIRECTION` (`supabase/functions/_shared/keel/household_portions.ts:125`)
   → les six valeurs **anglaises** de `mealprep.dir.*`, **mot pour mot**.
2. `servingDirections.int.test.ts` **épingle** ces six valeurs sur le module,
   lu **comme du texte** (aucun import Deno depuis le front), pour
   `mealprep.dir.*` **et** `couples.dir.*`.
3. La page **LIT** la chaîne avec la grammaire du module — `readServingDemands`,
   15 lignes, mêmes `QUALIFIERS`, mêmes `AXIS_WORDS`, même raccourci
   `component` — et en dérive les trois axes sur l'échelle
   `smaller · moderate · balanced · full · larger`.

**Aucune table `Record<objectif, {protein: …}>` n'existe dans la page.** C'est le
point : le module écrit lui-même que `health` a rendu la chaîne de `maintenance`
pendant des semaines sans que rien n'échoue, parce que personne ne relisait la
source.

### La décision qui mérite d'être discutée : le lecteur lit l'ANGLAIS

La grammaire du module est un vocabulaire **anglais** fermé de dix mots. Un
second lexique français dans la page aurait été, très exactement, la seconde
définition que le module refuse — et une qui dérive à la première retouche de
traduction.

Donc : la page **lit** `en["mealprep.dir.*"]` (la chaîne que le moteur lit
lui-même) et **affiche** `t("mealprep.dir.*")` (la langue du visiteur). Le
français est une traduction fidèle ; il n'a pas à être analysable.

Conséquence assumée : `import { en } from "../i18n/en"` dans une page. Vérifié :
`pageSeams.int.test.ts` ignore `i18n/(en|fr|catalog).ts` dans son parcours
(l. 155), donc ça ne crée **aucune couture** — le test passe. Et l'import
survit à la phase 2, puisque les clés retournent dans `en.ts`.

### Mutation prouvée, pas supposée

`mealprep.dir.health` remplacé par la chaîne de `maintenance` (le défaut
historique, à l'identique) ⇒ le test **rougit** avec le bon message, et
`/couples` reste vert. Valeur restaurée.

### Résultat lu au navigateur, les six objectifs

| objectif | protéine | féculent | légumes |
|---|---|---|---|
| fat_loss | full | smaller | larger |
| muscle_gain | larger | larger | balanced |
| recomposition | full | moderate | larger |
| **performance** | full | larger | **rien de demandé** |
| health | balanced | balanced | larger |
| maintenance | balanced | balanced | balanced |

`performance` ne nomme pas les légumes : la lecture rend **« rien de demandé »**,
jamais une valeur devinée. C'est le cas qui prouve que la fiche lit.

### Le plancher technique

- **État initial déjà juste et déjà lisible** : `fat_loss` est choisi au premier
  rendu, sa consigne et ses trois axes sont là sans un geste.
- **De vrais `<input type="radio">`** dans un `<fieldset>`/`<legend>` : le
  clavier (flèches), l'état coché et son annonce sont ceux du navigateur.
  **Vérifié au navigateur** : `ArrowRight` déplace la sélection ET met la fiche
  à jour.
- **Focus visible mesuré** : `solid 2px rgb(126,60,97)` (= `fig-600`, 7,36:1)
  à `offset: 3px`, sur le contrôle visible et non sur l'input masqué.
- **L'état courant n'est jamais porté par la seule couleur** : la fiche en
  dessous **nomme** l'objectif courant, et le bloc de lecture est
  `aria-live="polite"`.
- **`prefers-reduced-motion`** : la seule transition est sous `motion-safe:`.
  Aucune autre animation sur la page.
- **Zéro dépendance ajoutée.** React + CSS.
- **320 px** : les six pastilles s'enroulent, la règle est `shrink-0` à 84 px,
  aucun débordement.

### Ce que la démonstration n'est pas

Pas une capture d'écran (S10, §8 n°12) : pas de barre d'app, pas de cadre
d'appareil, pas de chrome produit — c'est une **fiche**, cadre `line-strong`,
étiquettes `text-label`. Et la réserve le dit en toutes lettres :
*« it is not a screen »*.
⛔ **Aucun gramme** (FF-043 §11 n°1) : l'échelle est en **mots**, jamais en
quantités, et la réserve le nomme.

### La règle (`Ladder`), et pourquoi ce n'est pas une barre

Cinq crans, **un point posé dessus**. Une barre remplie se lit comme un score, et
cette page dépense sa réserve à dire qu'il n'y en a pas. Elle est **monochrome**
(`--ill-ink-soft` / `--ill-ink`) : la seule pièce chaude de la fiche est
l'objectif choisi, et il n'y en a qu'un.

---

## 5. Mes claims, et leur ancre

| claim | ancre |
|---|---|
| Six objectifs, six façons de servir le même plat | **C4** — `household_portions.ts:125` `SERVING_DIRECTION` ; grammaire `:264` `readServingDemands` |
| Les trois axes (protéine / féculent / légumes) et l'échelle | `household_portions.ts:203` `SERVING_AXES` · `:211` `SERVING_DEMANDS` |
| L'objectif est posé à l'entrée | **C14** — `onboarding.ts:650-662` |
| La consigne est en mots, jamais en grammes | **FF-043 §11 n°1** (grammes calculés, aucun écran) |
| Les chiffres sont éteints par défaut, une chaîne de gardes décide | **C15** — `plan/EnergyReadout.tsx:42-45` · `20260812230000:60` (défaut `false`) · `energy_gate.ts:228-249`. **Le nombre de verrous n'est pas écrit** (C15b : quatre pour l'affichage, un cinquième pour la cible — S8) |
| Rien ne note la semaine, pas de bande de couleur | **S9** — évaluateur d'adhérence déprogrammé en 1:N (`20260803200000`) |
| La semaine arrive en sessions de cuisine | **C3** — `meal_generation.ts:518` `interface CookingSession` · `CookingSessions.tsx:48` |
| Rien de frais n'attend plus de trois jours | **C5** — `meal_generation.ts:693` · `grocery_waves.ts:211` (`MAX_FRIDGE_DAYS = 3`) |
| Réserve : une seule vague ⇒ tu en vois une | **C5** — `ShoppingListPanel.tsx:137-149` (masquage) |
| Décaler un plat / la session / ne pas cuisiner ce soir, en boutons | **C7** — `accident.ts:995-1004` `REALIGNMENT_ACTIONS` · `_shared/chat/deterministic_buttons.ts` |
| Aucun plat n'est choisi à ta place | **§5.1** — `accident.ts:52-55` |
| 12,99 €/mois, un foyer d'une personne est un foyer complet | **C1** — `20260810260000_household_billable_profiles.sql:235-250` |
| Ce qu'on demande à l'entrée (prénom, date de naissance, objectif, allergies) | **C14** — `onboarding.ts:650-662` |
| Le CTA mène à `/start`, sans promesse d'immédiateté | **§10** — `/start` interroge `keel_free_signup_available` |
| Branche `solo` | **C13** — `onboarding.ts:84` `FunnelBranch` |

---

## 6. Ce que j'ai refusé d'écrire

- **« Échanger un plat »** (§8 n°7 / grille ⛔). Jamais écrit, dans aucune des
  deux langues. `REALIGNMENT_ACTIONS` n'a pas de `replace`.
- **« Jamais de calories »** (C15, §8 n°2). Faux depuis FF-059. La réserve dit
  *éteints par défaut* + *une chaîne de gardes*, **sans chiffrer les verrous**
  (le brief en annonce quatre, l'audit cinq — S8).
- **Un nombre de verrous.** Voir ci-dessus.
- **Une durée d'entrée** (« 90 secondes », C14/D5) et **une durée d'essai ou un
  bouton d'achat** (§8 n°1). Le prix se dit ; le geste d'achat, non.
- **Un suivi de poids, une courbe, une tendance** (C16, S6) — alors même que la
  bande 1 demande un objectif de poids. Il est posé à l'entrée, la page
  s'arrête là.
- **Une application, un cadre de téléphone** (C17) — et **aucun « rien à
  installer »** pour compenser (S4).
- **Des grammes** dans la démonstration (FF-043 §11 n°1). L'échelle est
  lexicale : `part réduite … part plus grande`.
- **Une garantie que le modèle a différencié** — `reconcilePortions` accepte
  quatre consignes identiques sans lever d'`issue`. La page décrit la
  **consigne**, jamais le résultat.
- **Un `<Offer>` dans les données structurées** — déclarer une offre à un moteur,
  c'est promettre un achat qui rend 500.

---

## 7. Vu au navigateur — quatre passes

Serveur : `frontend-alt` (5175) était **indisponible** (plafond de cinq serveurs
par dossier, trois appartenant à d'autres sessions). Vérifié sur un serveur
Vite déjà en vie sur le même arbre de sources (`localhost:5178`) — même code,
même HMR. **Aucun serveur d'une autre session n'a été arrêté.**

| passe | résultat |
|---|---|
| **FR 320 px** | `documentElement.scrollWidth` = 320 = `innerWidth` ✅. Six pastilles enroulées sur quatre lignes, les trois règles + libellés tiennent, la réserve sombre est lisible. |
| **FR 1280 px** | Pas de débordement. Les six pastilles tiennent **sur une ligne** malgré « Recomposition corporelle » et « Performance sportive ». Les deux planches de la bande 2 côte à côte. |
| **EN 320 px** | Pas de débordement. |
| **EN 1280 px** | Pas de débordement. |

Autres mesures :

- **Un seul `<h1>`**, trois `<h2>`, aucun saut de niveau.
- **Console** : `read_console_messages(onlyErrors)` ⇒ **aucune erreur**. `t()`
  lève en dev sur une clé inconnue : aucune ne manque.
- Les seuls nœuds plus larges que la fenêtre à 320 px sont **les trois SVG à
  l'intérieur de `.fig-scroll`** — c'est le dispositif voulu (plancher 380 px,
  la figure défile, pas la page).
- **Défaut trouvé et corrigé au navigateur** : à 1280 px, `PriceCard` porte
  `h-full` et s'étirait à la hauteur de la colonne voisine — **500 px de cadre
  pour trois lignes**. Corrigé par une enveloppe `self-start` **locale à la
  page** (la primitive n'est pas touchée) : 143 px mesurés après.

---

## 8. Typecheck, lints, tests

- `npx tsc -b` : **568 erreurs, toutes `TS2783`** — « clé spécifiée deux fois ».
  C'est **le dispositif des brouillons lui-même** : chaque clé existe encore dans
  `en.ts`/`fr.ts` et à nouveau dans `drafts/`, et le spread gagne. **Aucune
  erreur d'aucune autre classe, sur aucun fichier.** Zéro erreur m'appartenant.
  ⚠️ Pour l'orchestrateur : ces 568 erreurs disparaissent au repli de phase 2,
  quand les anciens blocs sont supprimés d'`en.ts`/`fr.ts`.
- `eslint` sur mes quatre fichiers : **propre**.
- `scripts/ci/i18n-lint.mjs` : **zéro violation sur mes fichiers** (les 7
  violations restantes sont sur `ProPage.tsx`, un autre constructeur).
- `servingDirections.int.test.ts` : **3/3 vert** — `couples.dir.*` a été livré
  entre-temps par le constructeur 2, les six chaînes concordent des deux côtés.
- `pageSeams` ✅ · `pageFrontier` ✅ · `parity` : 5/6, l'échec est
  `ne recopie pas l'anglais` et **aucune clé `mealprep.*` n'y figure**. Les dix
  clés listées appartiennent à `couples`, `families`, `coaches`, `gyms`.

---

## 9. Ce que l'orchestrateur doit savoir

1. **Aucune clé `public.*` n'est réclamée.** L'en-tête et le pied de page sont
   pris tels quels.
2. **`parity.int.test.ts` va devoir être révisé en phase 2.** Sa liste
   `legitimatelyIdentical` cite des clés (`coaches.fig.*`, `gyms.fig.*`,
   `families.fig_*`) que la refonte supprime. Une seule clé du namespace
   `mealprep` y est encore utile et existe déjà :
   `mealprep.start.ask_allergies` (« Allergies » s'écrit pareil).
   **Aucune autre de mes 72 clés n'est identique EN/FR** — les six noms
   d'objectif reprennent volontairement les libellés du produit
   (`household.goal.*`), ce qui écarte « Recomposition » et « Performance ».
3. **Les six `mealprep.dir.*` sont du code, pas de la copie.** Une relecture
   éditoriale qui les « améliore » casse la CI, et c'est le comportement voulu.
   Les deux fichiers de brouillon le disent en en-tête.
4. **`servingDirections.int.test.ts` doit survivre à la phase 2 tel quel** : il
   lit le catalogue anglais (`en.ts`), pas les brouillons, donc le repli ne le
   touche pas. Il lit le module Deno **comme du texte** — c'est délibéré,
   l'importer ferait entrer `supabase/functions/` dans le graphe de vitest.
5. **`MealPrepPage.tsx` importe `en`** pour lire la constante anglaise. Vérifié
   sans couture (`pageSeams` ignore `i18n/en.ts`). Le commentaire de la page
   explique pourquoi ; le retirer casserait la lecture des axes.
