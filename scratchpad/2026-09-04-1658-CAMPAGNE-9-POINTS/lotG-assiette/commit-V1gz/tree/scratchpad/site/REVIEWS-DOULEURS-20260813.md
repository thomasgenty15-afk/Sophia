# Phase 3 — les trois lentilles

> Écrit pendant que les huit constructeurs tournent, pour être tiré dès que
> l'intégration est verte. **Des agents frais** : aucun ne juge ce qu'il a
> construit.

---

## Lentille 1 — le test des cinq secondes (un agent par page, 8 en parallèle)

**La question, et il n'y en a qu'une :** un inconnu qui voit **le premier écran
seul** — pas la page, l'écran — sait-il, en cinq secondes, **qui c'est** et
**s'il s'y reconnaît** ?

Protocole :
- `preview_start`, largeur **375 px** puis **1280 px**, EN puis FR.
- **Capture du premier écran seul** (le panneau ne repeint qu'à scroll 0 : c'est
  précisément ce qu'on veut ici, donc ne défile pas).
- Réponds à quatre questions, sans lire le reste de la page :
  1. **Qui** est le lecteur visé ? (le dire dans ses mots, pas dans les nôtres)
  2. **Se reconnaît-il** — la première section est-elle bien la douleur 01 de la
     grille, celle qui fait dire « c'est moi » ?
  3. Quel **geste** unique lui est demandé ?
  4. Qu'est-ce qui, sur cet écran, **pourrait être lu comme une promesse** que le
     produit ne tient pas ?
- Puis, et alors seulement, lis la page entière et dis si les **titres et les
  figures SEULS** suffisent à comprendre l'offre.

Verdict attendu : ✅ / ⚠️ / ❌ par page, avec **la phrase exacte** à changer.

---

## Lentille 2 — l'honnêteté (1 agent, sur les huit pages)

Pour **chaque** claim des huit pages : rouvre son ancre, lis **le code
d'aujourd'hui**, tranche VRAI / PARTIEL / FAUX.

Points de contrôle imposés :
- **Zéro claim sans ancre.** Un claim sans `{/* fact: … */}` est un défaut, même
  s'il est vrai.
- **Une ancre périmée est un défaut** : l'audit lui-même en porte une
  (`keel_output_locks.ts` pour B9 — ce fichier n'existe plus, le module est
  `_shared/keel/doctrine.ts`). Vérifie que **chaque** chemin cité existe.
- ⚠️ **Les démonstrations interactives comptent comme des claims.** Trois pages
  en ont une (`/meal-prep`, `/couples`, `/coaches`). Pour chacune : **d'où vient
  chaque valeur affichée ?** Ouvre la constante. Une valeur recopiée à la main
  qui devrait être **lue** est un défaut, même si elle est juste aujourd'hui.
- Les **12 interdits** (AUDIT §8) et les **12 silences** (§9), un par un, sur
  les huit pages. En particulier : ⛔ « échanger un plat » · ⛔ le conseil de
  famille · ⛔ « jamais de calories » · ⛔ « 6 € quand votre membre a payé son
  année » · ⛔ « votre nom sur les messages » · ⛔ « chaque message est vérifié »
  · ⛔ suivi de poids · ⛔ application mobile · ⛔ durée d'essai ou bouton
  d'achat côté foyer · ⛔ « votre équipe » sur `/gyms`.
- **Le vocabulaire** : « élèves » sur `/coaches` **seulement** ; « clients »
  sur `/pro` et `/gyms` ; ⛔ « suivi personnalisé » nulle part.
- **Le registre** : `/`, `/pro`, `/couples`, `/families`, `/gyms`,
  `/communities` **vouvoient** ; `/meal-prep` et `/coaches` **tutoient**.

---

## Lentille 3 — la cohérence et l'accessibilité (1 agent, les huit côte à côte)

**Est-ce un seul produit ?** Ouvre les huit, l'une après l'autre, et cherche ce
qui **diverge sans raison** : la géométrie des figures, le rythme des bandes, la
formulation du même fait sur deux pages, le poids du CTA, la place du prix.

Puis le plancher mesurable, **mesuré et pas supposé** :
- **Débordement horizontal à 320 px** sur les huit :
  `document.documentElement.scrollWidth <= window.innerWidth`. C'est le défaut
  n°1 de ce dépôt (`.fig-scroll` et son enveloppe, `min-width: auto`).
- **Contrastes réels** relevés au rendu, pas lus dans la charte.
- **Un seul `<h1>` par page**, ordre des titres **sans saut**.
- **Clavier** : toute la page atteignable, focus **visible** partout, et les
  trois démonstrations pilotables sans souris, avec l'état courant **annoncé**.
- **`prefers-reduced-motion`** respecté par les trois démonstrations.
- **Chaque figure** porte `<title>`/`<desc>` ou `aria-label`.
- **Les libellés de figure dans les DEUX langues** : le français est la langue
  longue, et une étiquette qui tient en anglais sort de la grille en français.
- ⛔ Aucune couleur d'état (émeraude, ambre, rouge, bleu) en décor ; la figue
  n'entre **jamais** dans une pastille.
