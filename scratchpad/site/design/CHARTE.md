# CHARTE — Sophia, site public

> **Date** 2026-08-12 · **Branche** `ff-001-quotidien-du-coach`
> **Entrée** `scratchpad/site/AUDIT-SITE.md` · **Livrables** ce dossier
>
> Ce document est fait pour être appliqué **sans me parler**. Un constructeur
> qui l'a lu doit pouvoir produire une page et une figure conformes.
> Tout ce qui est chiffré ici a été **calculé ou mesuré**, jamais estimé.

---

## 0. Ce que j'ai mesuré et qui corrige le brief

Quatre faits établis en cours de route. Ils changent des consignes.

**① Le kit Badge a QUATRE tons saturés, pas trois.** Le brief nomme émeraude,
ambre et rouge. `ui/Badge.tsx:10-16` en porte un quatrième : `info` occupe le
**bleu** (`bg-blue-50 text-blue-700`). La zone brûlée est donc plus large que
prévu. Teintes calculées :

| famille | rôle | hex | teinte |
|---|---|---|---|
| `critical` | échec | `#b91c1c` | **0°** |
| `caution` | attention | `#f59e0b` | **38°** |
| `positive` | succès | `#047857` | **163°** |
| `info` | en attente | `#1d4ed8` | **224°** |

**② Les cinq jetons `@theme` hérités sont morts.** `--color-primary` (violet
`#7c3aed`), `--color-secondary`, `--color-accent`, `--color-success`,
`--color-background` : **zéro consommateur** dans tout `frontend/src/`. Aucune
classe utilitaire ne les référence, et `CommitmentLine.tsx:31` documente que les
noms de classe construits par gabarit sont interdits ici — il n'y a donc pas
d'échappatoire dynamique. Les remplacer ne casse aucune surface.
⚠ Ne pas confondre avec `variant="primary"`, qui est une variante de
`ui/Button.tsx` et n'a aucun rapport.

**③ Le site n'a aucune webfont.** Zéro `.woff2`, zéro `@font-face`, zéro
`@fontsource`. « Inter » dans `--font-sans` n'est qu'un repli système fantôme.
La typographie actuelle n'est pas une décision, c'est un défaut. Page blanche.

**④ Deux caractères manquent, et l'un d'eux est dans une chaîne produit.**
Vérifié dans les tables `cmap` des fichiers **complets** des deux familles
retenues :
- **U+202F** (espace fine insécable) : aucun glyphe. Déclarée dans
  l'`unicode-range`, vide. Absente aussi des 24 autres familles testées.
  ⇒ **En français, sur ce site : U+00A0. Jamais U+202F.**
- **U+2192 « → »** : absent de Young Serif (567 glyphes) **et** de Public Sans
  (565). Ce n'est pas un effet du sous-ensemble — aucun subsetting ne le
  récupère. Or `CoachWeeklyPage.tsx:216` rend « Week of … **→** … ».
  ⇒ **Dans une figure, la flèche se dessine** (voir `etalon-maquette.svg`).
  En texte courant, ne pas l'employer.

---

## 1. Les trois directions, et pourquoi une seule tient

Le brief demande une marque qui couvre **deux mondes** sans changer d'identité :
une maison qui compose ses repas, et un coach qui prête sa méthode à une IA.
Ce qui relie réellement les deux, dans le code : **une règle écrite d'avance
gouverne ce qui se passe ensuite, et une machine l'applique sans improviser.**
La maison écrit une ligne d'envie, le générateur compose avec. Le coach écrit
ses convictions et ses lignes rouges, et ce que Sophia écrit est relu contre
elles. L'allergie d'une bouche gouverne toute la casserole, *fail-closed*.

### A — « La fiche » ← **retenue**

En cuisine professionnelle, la **fiche technique** est la carte qui fixe les
grammages, les allergènes et l'ordre des gestes : le document qui permet à une
brigade de refaire le même plat sans le chef dans la pièce. C'est littéralement
ce qu'est Sophia des deux côtés — la semaine d'une maison est une fiche, la
doctrine d'un coach est une fiche pour une méthode.

Traduction visuelle : des **champs** (une étiquette, une valeur, de l'air), des
**figures annotées** plutôt que des images, des angles fermés, des rayons
généreux, et une seule marque répétée — l'**équerre**, qui ouvre le coin
supérieur gauche de tout ce qui est *spécifié*.

### B — « La cadence » (écartée)

L'unité du plan est la **session de cuisine**, et le rythme du coach est déjà
inscrit dans le dépôt (`LandingPage.tsx` : les eyebrows sont *une fois / chaque
jour / chaque lundi*, « parce que l'asymétrie EST l'argument »). D'où l'idée
d'un rail horizontal du temps : la semaine en blocs, les courses en vagues qui
la traversent.
**Elle perd parce que c'est une grammaire de graphique.** Elle fait ressembler
à un tableau de bord un produit dont l'écran central refuse explicitement d'en
être un — *« un coach qui ouvre ça et voit un classement se mettra à coacher le
classement »* (`CoachWeeklyPage.tsx`). Et un rail ne sait pas tenir une
casserole.

### C — « La table commune » (écartée)

Tout vu de dessus, papier chaud, courbes généreuses, trait vivant. Très juste
pour `/families`.
**Elle perd parce qu'elle ne traverse pas.** Un coach qui achète un logiciel
pour 34 élèves ne veut pas d'une assiette dessinée à la main ; il faudrait une
seconde identité pour `/coaches`, ce que le brief interdit. Et en la
réchauffant, elle glisse en trois pas vers le défaut n°1 (crème + serif à fort
contraste + terre cuite).

### Ce que la recherche a confirmé

Un relevé du voisinage (planification de repas, cuisine éditoriale, coaching,
SaaS sérieux) donne un constat transversal qui décide :

> Personne, dans ce voisinage, **n'illustre un système**. Ils illustrent un
> objet (le plat, la bague, le corps) ou l'écran. Le trou est de dessiner **la
> relation** — la casserole qui se divise en parts, la vague de courses, la
> doctrine qui contraint une sortie.

Et : le **fond clair** est devenu le signal du produit sérieux (Vanta, Oura,
Future, Trainerize) ; le fond sombre est devenu le signal de l'outil de dev.
Le brief demandait le clair d'abord. Le marché est d'accord.

**Clichés recensés, et donc interdits ici** : le vert « healthy » ; la photo de
plat en plongée sur bois ou marbre ; le *Corporate Memphis* (personnages à
membres en nouille) ; le violet-indigo SaaS ; le héros sombre à capture d'UI
flottante et glow ; la 3D isométrique pastel ; la mascotte gentille posée sur un
sujet sérieux ; la capture d'écran **à la place** d'un point de vue.

---

## 2. La couleur

### 2.1 La contrainte la plus piégeuse, et comment elle est tenue

L'en-tête de `LandingPage.tsx` porte la règle que ce chantier renverse (S7) :

> *« No accent hue is introduced: every saturated colour on this page is a
> STATE (…), and a brand accent would make decoration indistinguishable from
> meaning on a page whose whole argument is that it reports rather than
> decorates. »*

L'auteur avait raison sur le **danger**, pas sur la seule parade possible. Une
teinte de marque est tenable si la confusion est rendue **structurellement
impossible**, et pas seulement improbable à l'œil. Trois verrous, dans cet
ordre d'importance :

**Verrou 1 — la FORME. C'est le vrai.**
Un état, dans ce produit, est **une pastille** : un fond teinté clair, un texte
plus foncé, `rounded-full` (`ui/Badge.tsx`). C'est la seule forme qu'il prenne.
⇒ **La figue n'entre jamais dans une pastille.** Elle est de l'encre, un filet,
un bouton plein sombre, une équerre, une pièce de figure. Aucun de ces objets ne
ressemble à un Badge, quelle que soit la teinte.

**Verrou 2 — la LUMINOSITÉ.**
Les états vivent en **fond clair + texte moyen**. La figue vit **sombre** :
`fig-700` est à L 28 %, `fig-950` à L 10 %. Un aplat sombre saturé n'est jamais
un état dans ce produit.

**Verrou 3 — la TEINTE.** Le moins important des trois, et il passe quand même.
Figue = **325°**.

| distance à… | teinte | écart |
|---|---|---|
| rouge `critical` | 0° | **35°** |
| ambre `caution` | 38° | **73°** |
| bleu `info` | 224° | **101°** |
| émeraude `positive` | 163° | **165°** |
| violet SaaS (Stripe `#635BFF`) | 243° | **82°** |
| aubergine Slack (`#4A154B`) | 299° | **26°** |

**Pourquoi 325° et pas 299°.** La recherche recommandait le prune ~299° — et
documente dans la même page que **Slack Aubergine est à 298,9°**. Prendre 299°
dans un produit qui a une face B2B, c'est porter la couleur la plus
reconnaissable du logiciel d'équipe. 325° s'en écarte de 26° et, surtout,
descend en saturation (38 % contre 54 %) : ce n'est pas un violet, c'est une
figue — un rouge-brun sombre, du côté chaud.

**Pourquoi pas les autres plages libres.** L'olive 60-90° est libre mais le vert
en alimentaire est le cliché n°1 du secteur. Le pétrole 185-210° n'a que ~22°
entre l'émeraude et le bleu. L'ocre 50-60° est à 14° de l'ambre — collision
garantie en petit format. La terre cuite 5-20° est à la fois trop près du rouge
et c'est le défaut IA n°1.

**Conséquence obligatoire** (mémoire *« une contrainte documentée survit à sa
cause »*) : en intégrant, **réécrire** le commentaire de `LandingPage.tsx`
l. 68-72 et l'en-tête de `Marketing.tsx`. Sans ça, le prochain lecteur
« réparera » la couleur en la retirant.

### 2.2 La palette, et ses ratios calculés

Les neutres ne sont pas neutres : ils portent la teinte de marque à 8-27 % de
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
| `fig-700` | `#632C4C` | 325 / 38 / 28 | accent, lien, bouton, équerre |
| `fig-800` | `#4A2039` | 324 / 40 / 21 | survol du bouton |
| `fig-950` | `#24101E` | 318 / 38 / 10 | le bloc sombre |

**Contraste — les 17 couples du site, calculés (WCAG 2.1). Aucun échec.**

| rôle | couple | ratio | seuil | verdict |
|---|---|---|---|---|
| texte courant | `#23191F` / `#FBF8FA` | **16,18:1** | 4,5 | AAA |
| texte courant sur fond 2 | `#23191F` / `#F4EFF2` | **15,02:1** | 4,5 | AAA |
| texte courant sur lavis | `#23191F` / `#EFE0E9` | **13,42:1** | 4,5 | AAA |
| texte secondaire | `#6A5A64` / `#FBF8FA` | **6,11:1** | 4,5 | AA |
| texte secondaire / fond 2 | `#6A5A64` / `#F4EFF2` | **5,67:1** | 4,5 | AA |
| texte secondaire / lavis | `#6A5A64` / `#EFE0E9` | **5,07:1** | 4,5 | AA |
| lien et accent | `#632C4C` / `#FBF8FA` | **9,98:1** | 4,5 | AAA |
| accent sur fond 2 | `#632C4C` / `#F4EFF2` | **9,26:1** | 4,5 | AAA |
| accent sur lavis | `#632C4C` / `#EFE0E9` | **8,27:1** | 4,5 | AAA |
| libellé du bouton plein | `#FBF8FA` / `#632C4C` | **9,98:1** | 4,5 | AAA |
| bouton plein, survol | `#FBF8FA` / `#4A2039` | **12,79:1** | 4,5 | AAA |
| texte du bloc sombre | `#FBF8FA` / `#24101E` | **17,05:1** | 4,5 | AAA |
| secondaire du bloc sombre | `#C9A3B8` / `#24101E` | **8,06:1** | 4,5 | AAA |
| équerre sur bloc sombre | `#C9A3B8` / `#24101E` | **8,06:1** | 3 | AAA |
| bordure de contrôle | `#8E7886` / `#FBF8FA` | **3,84:1** | 3 | ✓ non-texte |
| anneau de focus | `#7E3C61` / `#FBF8FA` | **7,36:1** | 3 | AAA |
| équerre sur clair | `#632C4C` / `#FBF8FA` | **9,98:1** | 3 | AAA |

**Deux pièges de la palette, à connaître.**
- `line` (`#E3DAE0`) est à **1,30:1** sur le papier. C'est voulu : c'est un
  séparateur **décoratif**. Il ne doit **jamais** border un champ, une case ni
  un bouton — WCAG 1.4.11 exige 3:1 pour un composant d'interface. Pour ça,
  `line-strong`.
- `fig-300` est à **2,11:1** sur le papier. **Fond sombre uniquement.**

---

## 3. La typographie

Deux familles. **OFL 1.1** toutes les deux, licence lue à la source
(`ofl/<famille>/OFL.txt` dans `github.com/google/fonts`). Servies **localement**
depuis le dépôt, aucun CDN.

| rôle | famille | auteur | licence | fichier | poids mesuré |
|---|---|---|---|---|---|
| display | **Young Serif** | Bastien Sozeau | OFL 1.1 | `youngserif-latin.woff2` | **18 520 o = 18,1 Ko** |
| texte | **Public Sans** | USWDS (fork de Libre Franklin) | OFL 1.1 | `publicsans-latin.woff2` | **26 636 o = 26,0 Ko** |
| | | | | **total** | **45 156 o = 44,1 Ko** |

Young Serif est statique (une graisse, 400). Public Sans est **variable**
(100-900) : un seul fichier couvre toutes les graisses employées.

### Pourquoi ces deux-là

La recherche établit que la tendance actuelle est **le néo-grotesque** en
remplacement du géométrique, **plus** les serifs éditoriaux à fort contraste.
Suivre l'une ou l'autre, c'est suivre la tendance. Et le défaut IA n°1 est
précisément *serif à fort contraste*.

- **Young Serif** est une display à **contraste faible**, à empattements en
  coin, massive et sculptée : l'exact opposé de la serif à fort contraste.
- **Public Sans** est la gothique institutionnelle du design system du
  gouvernement américain — littéralement la police des documents de
  spécification. C'est le registre de la fiche technique, et personne dans ce
  voisinage ne l'emploie parce qu'elle passe pour « ennuyeuse ».
- Le contraste entre les deux est **structurel** (masse sculptée contre
  monolinéaire institutionnel), pas décoratif — ce n'est pas « une serif et une
  sans ».
- **La graisse unique de Young Serif est un atout** : on ne peut pas fabriquer
  de hiérarchie au gras, il faut la faire à la taille et à l'espace. C'est la
  discipline que la direction demande.

Écartées : Fraunces (recommandée par la recherche, mais c'est LA serif variable
du moment, et sa bizarrerie est désactivée par défaut — il faut l'instancier
soi-même) ; Instrument Serif (« commence à sentir le défaut ») ; Geist (devient
le défaut « produit dev »). Éliminées d'office : Inter, Playfair, Poppins,
Montserrat, Roboto, Open Sans, Space Grotesk, Lora, DM Serif, Cormorant.
**Fontshare (General Sans, Switzer) est hors-jeu** : licence lue, ce n'est pas
de l'open source et l'auto-hébergement y est interdit.

### L'échelle

| cran | taille | interligne | approche | usage |
|---|---|---|---|---|
| `text-hero` | `clamp(2.05rem, 1.35rem + 3.9vw, 4.15rem)` | 0,99 | −0,021em | le `h1`, display |
| `text-title` | `clamp(1.7rem, 1.2rem + 2.1vw, 2.7rem)` | 1,06 | −0,016em | le `h2`, display |
| `text-sub` | `1.2rem` | 1,25 | −0,01em | le `h3`, display |
| `text-lede` | `1.125rem` | 1,62 | — | le chapô |
| corps | `1rem` (`0.9375rem` sous 640) | 1,6 | — | texte |
| `text-label` | `0.6875rem` | 1,2 | **+0,1em**, capitales | l'étiquette de champ |

**Young Serif ne descend jamais sous 20 px.** En dessous, c'est Public Sans.
Mesure de lecture : **62 caractères** au plus (`max-width: 62ch`).

### Composition française — non négociable

- Apostrophe **typographique `’`** (U+2019), jamais `'`. Les deux familles l'ont.
- Espace **insécable U+00A0** avant `:` `;` `!` `?` `»` `€` `%`, et après `«`.
  **Jamais U+202F** : mesuré sans glyphe dans 26 familles, y compris les deux
  retenues. Un seul caractère en repli système au milieu d'un mot se voit.
- Pas de `→` en texte courant (§0 ④).

---

## 4. L'espace

Base **4 px**, échelle à crans **fermés**. Un agent ne choisit pas une valeur,
il choisit un cran : `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128`.

| usage | valeur |
|---|---|
| padding de page | `32px` (`20px` sous 640) |
| largeur maximale du contenu | `1200px` |
| padding vertical de section | `84px` haut / `76px` bas (`44/40` sous 640) |
| gouttière d'une grille à 2 colonnes | `64px` (`44px` sous 900) |
| padding d'une carte | `16px` (aligné sur `Card.tsx`, `p-4`) |
| écart d'un bloc de texte à son titre | `20px` |
| interligne des blocs d'une liste | `40px` (`28px` sous 900) |

⚠ **Le piège mesuré, à ne pas refaire.** Un élément qui porte à la fois la
classe de conteneur de page *et* une classe de section ne doit **jamais**
redéclarer `padding` en **raccourci** : `padding: 84px 0 76px` remet le padding
**horizontal** à zéro. Constaté à 320 px sur cette maquette — l'en-tête et le
titre sortaient des deux côtés de l'écran. Employer `padding-block`.

---

## 5. La signature

### L'équerre

Un **coin ouvert** en haut à gauche : 2 px, rayon 5 (HTML) / 8 (SVG), bras
courts. Elle marque l'origine de tout ce qui est **spécifié** — une section,
une fiche, une figure, le nom de la marque.

- Elle **n'encadre jamais**. Elle ouvre.
- Elle ne flotte **jamais seule** : il y a toujours un mot à sa droite. Une
  équerre sans libellé est un défaut, pas un ornement.
- Le **logotype** est l'équerre + « Sophia » en Young Serif. C'est tout.
- Elle remplace le `Kicker` de `ui/Marketing.tsx` (aujourd'hui capitales
  espacées `text-gray-500`).
- Elle est l'idiome de l'app **promu** : `CoachWeeklyPage.tsx:243` borde déjà
  chaque élève signalé d'un `border-l-2`. Ce n'est pas une invention, c'est une
  reconnaissance.

### Ce dont on se souviendra

Pas l'équerre seule — elle est le liant. C'est **la figure annotée à
l'équerre** : sur ce site, un argument n'arrive jamais en photo ni en capture,
il arrive **dessiné et annoté**, et chaque dessin porte la même marque d'origine.

---

## 6. Le style d'illustration — les règles

> Écrites pour être appliquées sans discussion. Un agent qui produit une figure
> vérifie **F1 → F14** avant de la livrer. Les étalons `etalon-concept.svg` et
> `etalon-maquette.svg` sont la référence : on **part d'une copie**, on ne
> repart pas de zéro.

### Les deux familles

| | **illustration de concept** | **maquette de produit stylisée** |
|---|---|---|
| montre | une relation, un mécanisme | un écran que le produit a vraiment |
| point de vue | **de dessus** (la matière) | **de face** (l'écrit) |
| cadre | **aucun** | la surface de l'app, `rx 16`, filet de 1 |
| grille | `0 0 480 240` | `0 0 480 380` |
| texte | des mots de la page | **des chaînes produit, mot pour mot** |

### F1 — La grille

`viewBox="0 0 W H"`, W et H **multiples de 4**. Standards : **480×240** pour un
concept, **480×380** pour une maquette. On ne change pas la largeur : 480 est ce
qui rend les figures comparables entre pages.

### F2 — Deux épaisseurs, jamais trois

`stroke-width="2"` = le contour d'une **chose réelle**.
`stroke-width="1"` = une **annotation** ou un détail interne.
Rien d'autre n'existe. `stroke-linecap="round"`, `stroke-linejoin="round"`.

### F3 — Le point de vue est décidé par la nature de l'objet, pas par le goût

La **matière** (casserole, assiettes, courses, légumes) est vue **de dessus**,
strictement orthogonale. L'**écrit** (écran, carte, doctrine, rapport) est vu
**de face**, strictement plat.
**Jamais d'isométrie, jamais de 3/4, jamais d'ombre portée** : rien sur ce site
n'a de source de lumière. C'est la règle qui empêche six agents de diverger —
une casserole en 3/4 est fausse **par règle**, pas par goût.

### F4 — Angles fermés

Tout trait oblique et toute rotation valent **15, 30, 45, 60, 75 ou 90°**.
*(Reprise d'IBM Design Language, style « line » : « 15°, 30°, 45°, 60°, 75° and
90° are preferred ».)* Une courbe de Bézier à main levée est le premier endroit
où six agents divergent sans s'en apercevoir. Ratios entiers utiles :
15° → `75/20` · 30° → `52/30` · 45° → `50/50` · 60° → `30/52`.

### F5 — Coordonnées entières

Aucune décimale dans `x`, `y`, `width`, `height`, `r`, `rx`, `cx`, `cy`.
*(Reprise d'IBM Carbon : « Icons should be at whole pixels. No decimals are
allowed in x and y coordinates or width and height fields. »)* Les `rotate()`
en produisent au rendu — pas à l'écriture, et c'est l'écriture qui se relit.

### F6 — Rayons

`rx` vaut **4** (petite pièce), **12** (carte), **16** (surface entière).
**Jamais 0** — l'angle vif appartient au journal, pas à la fiche.
Un cercle n'est employé que pour une chose réellement ronde.

### F7 — Cinq jetons, pas un de plus

`--ill-ink` · `--ill-ink-soft` · `--ill-paper` · `--ill-wash` · `--ill-fig`.
Toujours écrits **avec leur repli** : `stroke="var(--ill-ink, #23191F)"` — le
fichier reste lisible seul, et hérite de la page une fois inséré.
**Aucun dégradé, aucun filtre, aucune ombre, aucun `opacity`.** Si une sixième
couleur semble nécessaire, c'est la figure qui est fausse.
*(La règle vient du design system de l'ONS, le seul à écrire une règle de
nombre de couleurs : une teinte, deux tons, pas de palette d'illustration.)*

### F8 — Une seule pièce chaude

`--ill-fig` porte **l'équerre** (la marque) et **un seul objet du dessin** (le
sujet). Deux occurrences, pas trois.
**Contrôle** : `grep -coE '(stroke|fill)="var\(--ill-fig' <fichier>` doit rendre **2**.
Si une figure a besoin de deux pièces chaudes, ce sont deux figures.

### F9 — Aucune proportion que le produit ne calcule pas pour l'écran

C'est la règle la plus importante, et la plus facile à violer sans y penser.
**Une taille dessinée est une affirmation de mesure.**
Dans l'étalon, les deux assiettes ne sont pas « dessinées pareil » : elles sont
le **même élément**, appelé deux fois par `<use href="#part">`. La promesse
« c'est le même plat » est tenue par la **structure du fichier**, pas par la
vigilance du relecteur. Des secteurs de tailles différentes auraient affirmé par
la géométrie une mesure qui n'atteint jamais l'écran (AUDIT §5.3 : ce qui sort
est une **phrase**, les grammes n'ont aucun écran, et rien ne vérifie que le
modèle a différencié).
**Si un chiffre n'est pas dans le tableau des faits de l'audit, il n'est pas une
taille de forme.** C'est S8, en géométrie.

### F10 — Les pastilles d'état se dessinent en contour sourd

Sur l'écran réel, `slipping` est ambre parce qu'un état est vrai **à cet
instant**. Sur une page de vente, il n'y a pas d'instant : une pastille colorée
y serait de la décoration portant le costume du sens — exactement ce que
l'en-tête de `LandingPage.tsx` protégeait.
⇒ Contour `--ill-ink-soft` de 1, `rx 8`, et **le mot réel dedans**. Le mot porte
l'état ; la couleur ne le porte pas.
**Une figure n'emploie jamais émeraude, ambre, rouge ni bleu.**

### F11 — Le texte d'une figure

Deux origines admises, et deux seulement : (a) une **chaîne produit mot pour
mot**, (b) un mot de la copie de la page. Tailles : **13** (valeur), **11**
(titre de figure), **9-10** (étiquette). Rien d'autre. Les étiquettes sont en
capitales, `letter-spacing` 1 à 1,2 ; les valeurs, non.
⚠ **En page, ces textes sont des props alimentées par les clés i18n.** Le site
est fr **et** en : une chaîne en dur dans un SVG casse la moitié du site.
⚠ Un signe absent des deux familles se **dessine** (§0 ④).

### F12 — Une maquette est une surface, jamais un appareil

Pas de chrome de navigateur, pas de cadre de téléphone. **Il n'existe aucune
application mobile** (AUDIT C17) : en dessiner un cadre serait la promesse la
plus facile à croire de tout le site.
Et : **une maquette ne se pose jamais sur un fond sombre.** Le produit est en
clair uniquement ; un écran sombre montrerait un produit qui n'existe pas.
*(Constaté sur capture : sur le bloc sombre, la surface de l'app devenait
l'objet le plus saturé de la page.)*

### F13 — Accessibilité

`role="img"` + `<title>` et `<desc>` référencés par `aria-labelledby`. **Toute**
figure porte du sens, donc **aucune** n'est `aria-hidden`. Le `<title>` dit ce
qu'on voit ; le `<desc>` dit ce que ça démontre.

### F14 — Ce qu'on ne dessine jamais

- **Aucune photographie**, nulle part sur le site (voir §8).
- **Aucun visage, aucun corps.** Le produit lui-même s'interdit le vocabulaire
  du corps dans ses consignes de service (`sanitizePortionNote`).
- **Aucune calorie, jamais** — `docs/keel/LEGAL.md` §6.4 est une règle marketing
  non négociable.
- **Aucun tableau de bord, aucune bande de risque, aucune tuile « on track »**
  (S9).
- Aucun trait tremblé « fait main ».

### Le squelette — on part de là

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 240"
     role="img" aria-labelledby="fig-XXX-t fig-XXX-d">
  <title id="fig-XXX-t">Ce qu'on voit</title>
  <desc id="fig-XXX-d">Ce que la figure démontre.</desc>

  <!-- L'équerre : même géométrie partout, et toujours un libellé à sa droite -->
  <path d="M 8 32 L 8 16 A 8 8 0 0 1 16 8 L 32 8"
        fill="none" stroke="var(--ill-fig, #632C4C)"
        stroke-width="2" stroke-linecap="round"/>
  <text x="44" y="26"
        font-family="var(--font-text, ui-sans-serif, system-ui, sans-serif)"
        font-size="11" font-weight="600" letter-spacing="1.2"
        fill="var(--ill-ink-soft, #6A5A64)">LE TITRE DE LA FIGURE</text>

  <!-- le dessin -->
</svg>
```

### La liste de contrôle avant de livrer une figure

1. `grep -o '"var(--ill-fig' fichier | wc -l` → **2**
2. `grep -nE '(x|y|width|height|rx|cx|cy|r)="[0-9]+\.[0-9]+"' fichier` → **rien**
3. `grep -n ' C \| S \| Q ' fichier` → **rien** (aucune Bézier)
4. `grep -nE 'opacity|filter|gradient|shadow' fichier` → **rien**
5. `grep -nE 'emerald|amber|#dc2626|#10b981|#f59e0b|blue-' fichier` → **rien**
6. Les épaisseurs employées sont exactement `1` et `2`
7. `<title>` **et** `<desc>` présents et référencés
8. Chaque chaîne est soit une chaîne produit citée, soit un mot de la page
9. Aucune taille de forme n'affirme une mesure absente de l'audit

---

## 7. Ce que chaque monde a le droit de faire varier

**Ne varie jamais** : le logotype, la palette (les 13 jetons), les deux
familles typographiques, l'échelle, l'équerre, les primitives (`Button`,
`Card`, `Badge`, `PriceCard`), les règles F1-F14.

**Varie** — c'est la « température », et elle est **de proportion, pas de
nature** :

| | `/families`, `/couples`, `/meal-prep` | `/coaches`, `/gyms`, `/communities` |
|---|---|---|
| famille de figure dominante | **le concept vu de dessus** — la matière | **la maquette vue de face** — le document |
| emploi du lavis | de **grands aplats** (casserole, assiettes) | des **filets et de petites zones** |
| registre de la copie | la maison, la table, le soir | la cohorte, la méthode, le lundi |
| ce que porte le bloc sombre | ce qu'on ne promet pas au foyer | ce qu'on ne mesure pas |

Le vocabulaire reste celui de l'audit : *élèves / cohorte / votre méthode /
votre voix* — jamais « votre client », jamais « suivi personnalisé » (S2).

---

## 8. Le risque assumé

**Ce site ne montre aucune photographie. Jamais. Y compris de nourriture.**

Dans un produit alimentaire, où tout le voisinage ouvre sur un bol qui brille,
c'est un vrai risque commercial. Il se défend pour une raison qui n'est pas
esthétique :

> Le produit ne fabrique aucune image. Une photo de plat sur ce site serait une
> assiette que personne n'a cuisinée, choisie par un directeur artistique pour
> ressembler à ce que le produit pourrait donner.

C'est exactement la faute que l'audit passe trois cents lignes à traquer
ailleurs : `LandingPage.tsx:545-548` — *« on ne montre pas un écran qu'on n'a
pas »*. Le site l'étend d'un cran : **on ne montre pas une assiette qu'on n'a
pas cuisinée.** Une figure dessinée ne peut pas mentir sur l'appétit, elle ne
peut que décrire un mécanisme — et le mécanisme, lui, est vrai.

Bénéfice second, mesurable : la refonte passe de **zéro SVG sur 3 027 lignes** à
une figure par section, sans un octet d'image bitmap, et le poids total de la
marque tient en **44,1 Ko de polices**.

Le risque est borné par une contrepartie : les figures doivent être **bonnes**.
Une page sans photo et avec des figures faibles est une page pauvre. D'où
l'investissement dans F1-F14 et dans les deux étalons — le style est fait pour
que la sixième figure du sixième agent tienne le niveau de la première.

---

## 9. Les fichiers, et comment on les intègre

| fichier | quoi en faire |
|---|---|
| `tokens.css` | copier en `frontend/src/tokens.css` ; ajouter `@import "./tokens.css";` juste après `@import "tailwindcss";` dans `index.css` |
| `fonts/youngserif-latin.woff2` | copier en `frontend/src/assets/fonts/` |
| `fonts/publicsans-latin.woff2` | copier en `frontend/src/assets/fonts/` |
| `etalon-concept.svg` | référence des figures de concept — on en part |
| `etalon-maquette.svg` | référence des maquettes de produit — on en part |
| `hero.html` | maquette de jugement, **ne va pas au dépôt** |
| `hero.src.html` + `build-hero.py` | source et fabrication de la maquette |

Les trois éditions à faire dans `index.css`, et rien d'autre :
1. ajouter la ligne d'import ;
2. remplacer le bloc `@theme` (les cinq jetons morts, §0 ②) ;
3. remplacer `@apply bg-gray-50 text-gray-900` par `@apply bg-paper text-ink`.

**Ne pas toucher** à la règle `font-size: 16px` sur les champs sous `lg` : elle
empêche Safari iOS de zoomer au focus sans jamais dézoomer.

Puis, hors `index.css` : réécrire les commentaires de `LandingPage.tsx`
l. 68-72 et l'en-tête de `Marketing.tsx`, qui interdisent encore la teinte de
marque (§2.1).
