# La charte de la vitrine — « la fiche »

> **Ce document décrit ce qui est DANS LE CODE**, pas ce qui a été dessiné.
> Chaque valeur ci-dessous est celle de `frontend/src/tokens.css` au 2026-08-13.
>
> Le raisonnement complet — les trois directions explorées, celles qui perdent et
> pourquoi, les quatorze règles de figure, la recherche concurrentielle — vit dans
> [`scratchpad/site/design/CHARTE.md`](../../scratchpad/site/design/CHARTE.md).
> Quand les deux divergent, **c'est celui-ci qui a raison** : §9 liste les écarts
> apparus à l'intégration.
>
> **Périmètre : les huit pages publiques.** L'app authentifiée (`/app/*`,
> `/coach/*`) n'est PAS concernée — elle y entrera par un chantier à elle, avec
> ses propres arbitrages. Voir §8.

---

## 1. La direction

En cuisine professionnelle, la **fiche technique** fixe grammages, allergènes et
ordre des gestes : c'est le document qui permet à une brigade de refaire le même
plat **sans le chef dans la pièce**. C'est exactement ce qu'est le produit des
deux côtés — la semaine d'une maison est une fiche, la doctrine d'un pro est une
fiche pour une méthode.

D'où : des champs, des figures annotées à la place des images, des angles fermés,
et une seule marque répétée — **l'équerre**.

**Le risque assumé : aucune photographie sur ce site, jamais, y compris de
nourriture.** Le produit ne fabrique aucune image ; une photo de plat serait une
assiette que personne n'a cuisinée, choisie pour ressembler à ce que le produit
*pourrait* donner. C'est l'extension d'un cran de la règle du dépôt — *« on ne
montre pas un écran qu'on n'a pas »*. La contrepartie est que les figures doivent
être bonnes.

---

## 2. La couleur

Les neutres **ne sont pas neutres** : ils portent la teinte de marque à 8-27 % de
saturation. Aucun ne se lit comme une couleur ; la page a une température sans
avoir un ton. C'est ce qui la sépare d'un `gray-50` de plus.

| jeton | hex | H / S / L | rôle |
|---|---|---|---|
| `paper` | `#FBF8FA` | 320 / 27 / 98 | fond de page |
| `paper-2` | `#F4EFF2` | 324 / 19 / 95 | fond de section alterné |
| `ink` | `#23191F` | 324 / 17 / 12 | texte courant |
| `ink-soft` | `#6A5A64` | 323 / 8 / 38 | texte secondaire |
| `line` | `#E3DAE0` | 320 / 14 / 87 | séparateur **décoratif seulement** |
| `line-strong` | `#8E7886` | 322 / 9 / 51 | bordure de **contrôle** |
| `fig-50` | `#F9F1F5` | 330 / 40 / 96 | fond de survol léger |
| `fig-100` | `#EFE0E9` | 324 / 32 / 91 | **le lavis** des figures |
| `fig-300` | `#C9A3B8` | 327 / 26 / 71 | **fond sombre uniquement** |
| `fig-600` | `#7E3C61` | 326 / 35 / 36 | anneau de focus |
| `fig-700` | `#632C4C` | 325 / 38 / 28 | accent, lien, bouton plein, équerre |
| `fig-800` | `#4A2039` | 324 / 40 / 21 | survol du bouton plein |
| `fig-950` | `#24101E` | 318 / 38 / 10 | le bloc sombre — **un seul par page** |

### ⛔ La contrainte la plus piégeuse

**Dans l'app, la couleur saturée appartient au SENS** : émeraude = ok, ambre =
attention, rouge = échec, **bleu = info**. Ce sont **quatre** familles, pas trois
— `info` occupe le bleu dans `ui/Badge.tsx`, et le brief d'origine l'avait oublié.

La figue ne s'y confond pas pour **deux** raisons, et il faut les deux :

1. **La distance de teinte** — 35° du rouge, 73° de l'ambre, 101° du bleu, 165°
   de l'émeraude. Et 82° du violet SaaS (Stripe `#635BFF`).
2. **La forme, qui est la vraie garde** — un état est **toujours une pastille**.
   **La figue n'entre jamais dans une pastille.** Elle vit dans le texte, les
   traits et les boutons pleins.

> ⚠️ **Cette charte RENVERSE une règle écrite du dépôt.** `LandingPage.tsx` (page
> supprimée) et `ui/Marketing.tsx` interdisaient toute teinte d'accent : *« toute
> couleur saturée est un ÉTAT »*. C'était juste tant que la vitrine était un
> rapport en noir et blanc. Les deux commentaires ont été **réécrits sur place**
> plutôt que la couleur ajoutée en silence — sans ça, le prochain lecteur
> « répare » la page en retirant la teinte.

### Les contrastes — 17 couples calculés, aucun échec

| rôle | couple | ratio | seuil |
|---|---|---|---|
| texte courant | `#23191F` / `#FBF8FA` | **16,18:1** | 4,5 |
| texte courant / fond 2 | `#23191F` / `#F4EFF2` | **15,02:1** | 4,5 |
| texte courant / lavis | `#23191F` / `#EFE0E9` | **13,42:1** | 4,5 |
| texte secondaire | `#6A5A64` / `#FBF8FA` | **6,11:1** | 4,5 |
| texte secondaire / fond 2 | `#6A5A64` / `#F4EFF2` | **5,67:1** | 4,5 |
| texte secondaire / lavis | `#6A5A64` / `#EFE0E9` | **5,07:1** | 4,5 |
| lien et accent | `#632C4C` / `#FBF8FA` | **9,98:1** | 4,5 |
| accent / fond 2 | `#632C4C` / `#F4EFF2` | **9,26:1** | 4,5 |
| accent / lavis | `#632C4C` / `#EFE0E9` | **8,27:1** | 4,5 |
| libellé du bouton plein | `#FBF8FA` / `#632C4C` | **9,98:1** | 4,5 |
| bouton plein, survol | `#FBF8FA` / `#4A2039` | **12,79:1** | 4,5 |
| texte du bloc sombre | `#FBF8FA` / `#24101E` | **17,05:1** | 4,5 |
| secondaire du bloc sombre | `#C9A3B8` / `#24101E` | **8,06:1** | 4,5 |
| bordure de contrôle | `#8E7886` / `#FBF8FA` | **3,84:1** | 3 (non-texte) |
| anneau de focus | `#7E3C61` / `#FBF8FA` | **7,36:1** | 3 |
| équerre sur clair | `#632C4C` / `#FBF8FA` | **9,98:1** | 3 |
| équerre sur sombre | `#C9A3B8` / `#24101E` | **8,06:1** | 3 |

**Les deux pièges de la palette :**

- **`line` est à 1,30:1 sur le papier, et c'est voulu.** C'est un séparateur
  **décoratif**. Il ne doit **jamais** border un champ, une case ni un bouton :
  WCAG 1.4.11 exige 3:1 pour un composant d'interface. Pour ça, `line-strong`.
- **`fig-300` est à 2,11:1 sur le papier.** Fond sombre **uniquement**.

---

## 3. La typographie

**Deux familles, OFL 1.1, servies localement depuis le dépôt.** 44,1 Ko au total.

| famille | fichier | poids | usage |
|---|---|---|---|
| **Young Serif** | `assets/fonts/youngserif-latin.woff2` | 18,1 Ko | display **uniquement** |
| **Public Sans** | `assets/fonts/publicsans-latin.woff2` | 26,0 Ko | texte, chiffres, libellés |

> Avant ce chantier, le dépôt n'avait **aucune webfont** : `--font-sans` nommait
> `Inter` sans qu'un seul fichier existe. La typo n'était pas une décision, c'était
> un repli système.

**Young Serif n'a qu'une graisse.** La hiérarchie se fait à la **taille** et à
l'**espace**, jamais au gras : ajouter `font-bold` ferait épaissir les contours par
simulation du navigateur.

**Young Serif ne descend jamais sous 20 px.** En dessous, c'est Public Sans.

### L'échelle

| cran | taille | interligne | approche | usage |
|---|---|---|---|---|
| `text-hero` | `clamp(2.05rem, 1.35rem + 3.9vw, 4.15rem)` | 0,99 | −0,021em | le `h1` |
| `text-title` | `clamp(1.7rem, 1.2rem + 2.1vw, 2.7rem)` | 1,06 | −0,016em | le `h2` |
| `text-sub` | `1.2rem` | 1,25 | −0,01em | le `h3` |
| `text-lede` | `1.125rem` | 1,62 | — | le chapô |
| corps | `1rem` | 1,6 | — | texte |
| `text-label` | `0.6875rem` | 1,2 | **+0,1em**, capitales | l'étiquette de champ |

Mesure de lecture : **62 caractères au plus** (`max-width: 62ch`).

### Composition française — non négociable

- Apostrophe **typographique `’`** (U+2019), jamais `'`.
- Espace **insécable U+00A0** avant `:` `;` `!` `?` `»` `€` `%`, et après `«`.
- ⛔ **Jamais U+202F** (espace fine insécable) : mesurée **sans glyphe** dans les
  deux familles et dans 24 autres. Un seul caractère en repli système au milieu
  d'un mot se voit.
- ⛔ **Pas de `→` (U+2192) en texte courant** : il n'existe dans aucune des deux
  familles, fichiers complets compris. Dans une figure, **la flèche se dessine**.

### Les polices ne sont pas chargées deux fois

`index.html` précharge **la seule police de texte** :

```html
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="/src/assets/fonts/publicsans-latin.woff2">
```

`crossorigin` est **obligatoire même en même origine** — une police est récupérée
en mode CORS, et sans lui le fichier est téléchargé **deux fois**. Young Serif
n'est pas préchargée : elle ne sert qu'aux titres.

---

## 4. La signature — l'équerre

Un **coin ouvert** en haut à gauche, 10 × 14 px, trait de 2 px, rayon 5 px au
coin. Classe `.eq`.

Elle marque **l'origine de ce qui est spécifié** : une section, une fiche, une
figure, le nom de la marque. **Elle n'encadre jamais, elle ouvre.**

> ⚠️ **Elle ne flotte jamais seule : il y a toujours un mot à sa droite.** Une
> équerre sans libellé est un défaut, pas une décoration. C'est pourquoi elle vit
> dans le composant `Kicker`, collée au texte, et non comme un composant à part
> qu'on pourrait poser dans le vide.

Sur fond sombre, `.eq-on-dark` la remonte à `fig-300` : `fig-700` y tombe à 2,4:1
et le trait disparaît.

---

## 5. Les figures

**Grille de 480 unités**, deux épaisseurs de trait (2 pour le contour d'une chose
réelle, 1 pour l'annotation), coordonnées entières, angles fermés.

**Cinq jetons d'illustration, pas un de plus.** Ils vivent **hors** de `@theme`
à dessein — ils ne doivent générer aucune classe utilitaire :

| jeton | valeur | rôle |
|---|---|---|
| `--ill-ink` | `ink` | contour d'une chose réelle, épaisseur 2 |
| `--ill-ink-soft` | `ink-soft` | annotation et détail interne, épaisseur 1 |
| `--ill-paper` | `paper` | un remplissage qui doit se lire **vide** |
| `--ill-wash` | `fig-100` | un remplissage qui doit se lire **plein** |
| `--ill-fig` | `fig-700` | **LA pièce chaude — une seule par figure** |

Si une figure a besoin d'une sixième couleur, **c'est la figure qui est fausse**,
pas la palette qui est trop courte.

### Le plancher et le plafond de lisibilité

Une figure porte du texte à 9-13 unités sur 480. Sans garde, ce texte tombe à
5-7 px sur un téléphone, et la figure est là sans se lire.

```css
.fig-scroll > svg { min-width: 380px; max-width: 560px; }
```

⚠️ **Le plafond a été ajouté après coup, et il manquait.** Mesuré sur une planche
de 1200 px : le SVG montait à 1070 px, ce qui porte le libellé de figure à 25 px
— **plus gros que le chapô de la section**, c'est-à-dire une figure qui crie plus
fort que la phrase qu'elle illustre.

### ⛔ Le piège du débordement — deux règles, pas une

```css
.fig-scroll                  { min-width: 0; }
:where(:has(> .fig-scroll))  { min-width: 0; }
```

Un enfant de grille ou de flex a `min-width: auto` par défaut : il refuse d'être
plus étroit que son contenu. **Le plancher de 380 px remonte alors à la piste de
grille et fait défiler la PAGE** — mesuré à 320 px : 420 px de contenu, soit
100 px de débordement horizontal, exactement ce que le plancher existait pour
éviter.

La seconde règle vise **l'enveloppe** : quand `.fig-scroll` est emballé dans un
`<figure>` ou un `<div>` qui est lui l'enfant de grille, c'est son `min-width` à
elle qui remonte le plancher. Mesuré : les deux coupables étaient un
`<div class="max-w-[62ch]">` et un `<figure>`, pas la figure elle-même.

C'est le même piège que `flex-1` sur un champ de saisie.

### Ce qu'on ne dessine jamais

- Une **proportion que le produit ne calcule pas pour l'écran** — dessiner
  l'assiette d'un enfant plus petite affirmerait une mesure qu'aucun écran ne rend.
- Une **couleur d'état en décor** — une fausse photo d'assiette peinte en
  `emerald-300` / `amber-200` a été trouvée et retirée sur `/gyms`.
- Un **appareil** : une maquette est une surface, jamais un téléphone dessiné.

---

## 6. Les primitives

| primitive | fichier | note |
|---|---|---|
| `Kicker` | `keel/components/ui/Marketing.tsx` | porte l'équerre. `onDark` pour le bloc sombre |
| `SectionTitle` | idem | `font-display text-title`, **pas de `font-bold`** |
| `PriceCard` | idem | ⚠️ **pas de `tabular-nums`** — voir §9 |
| `ButtonLink variant="brand"` | `keel/components/ui/Button.tsx` | ⚠️ **réservé aux 8 pages publiques** — voir §8 |
| `.eq` · `.fig-scroll` | `frontend/src/tokens.css` | hors `@theme`, donc pas d'utilitaires |

**Rien de spécifique à une page n'entre dans `Marketing.tsx`.** Les maquettes
restent locales à leur page : une maquette partagée change de sens sur deux pages
quand on en édite une.

---

## 7. Le plancher de qualité

```css
:where(a, button, [tabindex]):focus-visible {
  outline: 2px solid var(--color-fig-600);   /* 7,36:1 sur papier */
  outline-offset: 3px;
}
@media (prefers-reduced-motion: reduce) { /* animations neutralisées */ }
```

**⛔ Ne jamais toucher à la règle des 16 px** dans `index.css` :

```css
@media (max-width: 1023px) {
  input:not([type="checkbox"]):not([type="radio"]), select, textarea { font-size: 16px; }
}
```

Safari iOS **zoome** sur un champ dont le texte fait moins de 16 px au focus, et
**ne dézoome pas** en sortant. La réponse n'est *pas* `maximum-scale=1`, qui règle
le symptôme en interdisant aussi le zoom volontaire.

> Un contournement a déjà été trouvé : `inputClass` de `ui/Field.tsx` portait
> `text-sm`, donc les champs de `/start` étaient à 14 px sur téléphone. Corrigé.

---

## 8. Ce que la charte n'a PAS le droit de faire

**L'app authentifiée est hors périmètre.** Elle y entrera par un chantier à elle,
et le premier arbitrage y sera que la couleur saturée appartient au sens : un
bouton de marque partout rendrait un état indistinguable d'une action.

C'est pour ça que **`variant="brand"` a été ajoutée plutôt que `primary`
re-teintée**. `primary` est rendue par des centaines d'appels dans `/app` et
`/coach` : la reteindre aurait fait entrer la charte par effet de bord.

> **Si tu vois `variant="brand"` ailleurs que sur les huit pages publiques, c'est
> une fuite, pas une décision.**

Ce qui peut varier entre les deux mondes : la **température** (imagerie, ton).
Ce qui ne varie **jamais** : logo, palette, typo, primitives.

---

## 9. Les écarts entre la charte dessinée et le code

Cinq corrections sont nées de la mesure, pas du dessin. Elles sont **dans le
code** et **pas** dans `scratchpad/site/design/CHARTE.md`.

| # | Écart | Pourquoi |
|---|---|---|
| 1 | **Plafond de 560 px** sur les figures | Le plancher seul laissait un SVG monter à 1070 px et son libellé passer devant le chapô |
| 2 | **`min-width: 0` sur `.fig-scroll` ET son enveloppe** | `min-width: auto` remontait le plancher à la piste de grille : la page défilait de 100 px à 320 |
| 3 | **`tabular-nums` retiré de `PriceCard`** | Young Serif rendait « 12,99 € » en « 1 2,99 € » — la virgule prend la chasse d'un chiffre, 139,9 px contre 128,2. Et la justification (« aligner deux cartes ») était morte : la primitive interdit une seconde carte |
| 4 | **Variante `brand` ajoutée à `Button.tsx`** | Voir §8. `hidden` perd d'ailleurs contre le `inline-flex` de `buttonClass` — même spécificité, l'ordre de génération tranche : pour masquer un bouton, **envelopper**, pas ajouter une classe |
| 5 | **`theme-color` et la description par défaut d'`index.html`** | Le premier pointait l'ancien violet mort ; la seconde promettait « on WhatsApp », un canal supprimé du produit |

---

## 10. Les fichiers

| fichier | rôle |
|---|---|
| `frontend/src/tokens.css` | **la source unique** — `@font-face`, `@theme`, jetons d'illustration, `.eq`, `.fig-scroll`, plancher de qualité |
| `frontend/src/index.css` | importe `tokens.css` juste après Tailwind, et applique `bg-paper text-ink` au corps |
| `frontend/src/assets/fonts/*.woff2` | les deux familles |
| `frontend/index.html` | le préchargement, `theme-color` |
| `scratchpad/site/design/CHARTE.md` | le raisonnement complet, les directions écartées, les règles F1-F14 |
| `scratchpad/site/design/etalon-*.svg` | les deux figures étalons |

Les deux `@import` doivent rester **en tête** de `index.css` : le CSS refuse un
`@import` placé après une règle. Tailwind 4 lit les `@theme` du graphe d'import ;
**il n'y a pas de `tailwind.config.*` dans ce dépôt et il ne faut pas en créer un.**
