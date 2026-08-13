# KIT — les huit primitives passent à la charte

> Phase 1 du chantier « la plateforme passe à la charte ». Huit fichiers de
> `frontend/src/keel/components/ui/`, rendus par seize écrans et vingt-deux
> composants partagés.
>
> **La planche est `PLANCHE.html`** — autonome, les deux polices embarquées en
> `data:` URI, zéro ressource externe (vérifié : aucun `http`, aucun chemin
> absolu). `PLANCHE.src.html` est son gabarit, avec `__FONT_SANS__` /
> `__FONT_SERIF__` à la place des polices : c'est **lui** qu'on édite, puis on
> régénère. **Ne pas ouvrir le `.src` pour juger** — il rend sans police.

**Résultat mesuré, code seul (commentaires retirés) :**

| | avant (audit §0) | après |
|---|---:|---:|
| `gray-*` / `slate-*` dans le kit | **33** | **0** |
| saturées **hors** `Badge` | **21** | **6** |
| saturées de `Badge` (le vocabulaire) | 8 | **8** — intactes |
| valeurs de rayon dans le kit | 5 (`xl` `2xl` `lg` `md` `full`) | **4 jetons** |

Les six saturées qui restent sont **toutes des états** : `Card tone="warning"`
(`border-amber-200 bg-amber-50`), `Button variant="danger"` (`border-red-200`,
`text-red-700`, `hover:bg-red-50`), `Field` error (`text-red-700`).

---

## 1. Le vocabulaire de rayon — quatre valeurs, et ce sont les jetons

**Sept familles d'agents vont s'y conformer, donc c'est explicite :**

| classe | valeur | ce que ça habille |
|---|---|---|
| `rounded-part` | **4 px** (`--radius-part`) | une petite pièce : la pastille de fermeture d'une fenêtre, un coin d'annotation |
| `rounded-card` | **12 px** (`--radius-card`) | une carte, **un contrôle de saisie**, un bloc à l'intérieur d'une carte |
| `rounded-fiche` | **16 px** (`--radius-fiche`) | une surface entière : une fenêtre, une section de réglage, une fiche |
| `rounded-full` | pastille | **boutons et pastilles d'état, et rien d'autre** |

**Retirés du kit :** `rounded` nu, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`.

**Pourquoi ces quatre-là et pas un jeu neuf.** Je n'ai rien choisi : les trois
premiers sont dans `tokens.css` depuis la vitrine, et les **huit pages publiques
livrées n'emploient déjà que trois valeurs** — `rounded-full` ×8,
`rounded-fiche` ×8, `rounded-card` ×7, zéro autre (vérifié par grep sur les onze
fichiers publics). Le kit **nomme ce qui est déjà là** plutôt que d'ouvrir un
troisième vocabulaire. `rounded-part` complète le bas de l'échelle, déjà déclaré
et jusqu'ici sans consommateur.

**Et presque rien ne bouge au rendu :** `rounded-xl` valait 12 px et
`rounded-card` vaut 12 px ; `rounded-2xl` valait 16 px et `rounded-fiche` vaut
16 px. Le seul changement réel de géométrie est `Field` : **8 px → 12 px**, pour
s'aligner sur le `controlClass` de `/start` et `/auth`, déjà livrés.

`rounded-t-fiche` (la fenêtre en feuille montante sous `sm`) **est bien généré
par Tailwind 4** — vérifié dans le CSS construit :
`.rounded-t-fiche{border-top-left-radius:var(--radius-fiche);border-top-right-radius:var(--radius-fiche)}`.

---

## 2. `primary` devient figue — et ce que ça fait à `brand`

```
primary: "bg-fig-700 text-paper hover:bg-fig-800 disabled:hover:bg-fig-700"
```

**Pourquoi.** La règle du §2 du master : *la teinte de marque marque la
NAVIGATION et l'ACTION, les couleurs d'état marquent les FAITS, elles ne se
croisent jamais.* Une action principale est une action, pas un fait. C'est le
seul endroit du produit connecté où un aplat de couleur est légitime, et la
garde de forme tient : **la figue n'entre dans aucune pastille `Badge`**, dans
aucun chiffre, dans aucun verdict.

`text-paper` et non `text-white` : c'est le couple que la charte §2 calcule
(`#FBF8FA / #632C4C`). Le blanc pur donnait 10,53:1, `paper` donne 9,98:1 — les
deux passent, mais `paper` est la valeur nommée, et le blanc est justement le
neutre sans température que la charte refuse.

### ⚠️ `brand` et `primary` rendent désormais la même chose

**C'est la conséquence de l'arbitrage, pas un oubli.** La charte §8 justifiait
`brand` ainsi : *« `variant="brand"` a été ajoutée plutôt que `primary`
re-teintée »*, parce que l'app était **hors périmètre** et qu'une reteinte y
aurait fait entrer la charte par effet de bord. C'était un **confinement**, pas
une règle de style — et le chantier actuel est précisément celui que ce §8
annonçait.

**Ce que j'ai fait :** gardé les deux variantes, **réécrit le commentaire de
`brand`** pour dire qu'elle est désormais un alias intentionnel dont le seul
rôle restant est de **nommer l'intention au site d'appel** (`brand` = le geste
commercial d'une page de vente ; `primary` = l'action principale d'un écran de
travail).

**Ce que je n'ai pas fait, et pourquoi :** supprimer `brand`. **21 appels** la
portent, tous sur des surfaces **livrées** : les huit pages de vente (11),
`pages/Auth.tsx` (5), `StartPage` (3), `PublicHeader` (2). Un lot visuel n'a pas
le droit de renommer une API à travers elles. La fusion est un lot à part.
**Consigne maintenue pour les phases 2 et 3 : n'écrivez pas `brand` dans `/app`
ni `/coach`** — `primary` y dit la même chose et le dit juste.

### Les quatre autres variantes

| variante | avant | après | pourquoi |
|---|---|---|---|
| `secondary` | `border-gray-300 bg-white text-gray-800 hover:bg-gray-50` | `border-line-strong bg-paper text-ink hover:bg-fig-50` | `gray-300` était à **1,47:1** — sous le seuil 3:1 de WCAG 1.4.11 pour un contour de composant. `line-strong` est à 3,84:1 |
| `ghost` | `text-gray-600 hover:bg-gray-100` | `text-ink-soft hover:bg-fig-50` | **reste neutre exprès.** C'est le geste qu'on peut ignorer — les 7 appels sont tous « Annuler / Ne plus afficher / Fermer ». Si les trois premiers gestes d'un écran portent la marque, aucun ne la porte plus |
| `danger` | `border-red-200 bg-white text-red-700 hover:bg-red-50` | `border-red-200 bg-paper text-red-700 hover:bg-red-50` | **les trois valeurs rouges n'ont pas bougé** : rouge = échec dans tout le produit. Seul le fond neutre a suivi la charte |
| `brand` | inchangé au rendu | `text-white` → `text-paper` | le couple nommé par la charte ; écart de ratio 10,53 → 9,98, imperceptible |

Tailles (`md`, `sm`), rayon (`rounded-full`), `disabled:opacity-50` : **inchangés**
— les toucher déplacerait la mise en page sur des centaines d'appels.

---

## 3. `SetupSection` — la frontière passe de la couleur à la forme

**Fait :**

1. **`accent` et `SetupAccent` retirés** du composant et de `SetupSectionProps`.
   Quinze classes saturées parties (`rose` `violet` `sky` `teal` `orange`,
   chacune une barre + un fond de puce + une couleur de texte).
2. La frontière est portée par **le fronton de la fiche** : `rounded-fiche`
   (16 px), un trait de contrôle `border-line-strong` qui la ferme, et une barre
   de titre `bg-paper-2` séparée du corps par `border-b border-line`, portant
   **l'équerre collée au titre** — jamais posée seule, toujours un mot à sa
   droite. C'est l'idiome de `/auth` et `/start`, où quatre fiches empilées se
   distinguent déjà **sans une seule teinte**.
3. **Commentaire de tête entièrement réécrit.** L'ancien justifiait la couleur
   par « le reste de KEEL est volontairement gris » — prémisse tombée. Le
   nouveau explique la prémisse morte, pourquoi le moyen était interdit *même
   quand elle tenait* (`sky` collidait avec `Badge tone="info"`, `rose` avec
   `critical`, `violet` était la marque du produit supprimé), pourquoi la forme
   est **meilleure** et pas seulement conforme (elle survit au daltonisme et à
   l'impression, elle ne consomme aucune teinte d'état, et c'est la **même**
   frontière que sur les huit pages publiques), et les trois options rejetées
   pour qu'on ne les rejoue pas.

**Ce que le fichier avait raison de dire, et que j'ai gardé :** cinq formulaires
identiques empilés dans une fenêtre se lisent comme un seul formulaire très
long. Et : *« un fond teinté sous des champs de saisie abîme le contraste du
texte tapé »* — c'est pour ça que le fronton porte `paper-2` et que le corps du
formulaire reste `paper`.

**Détail de mise en page :** la marge haute de `{children}` est devenue
conditionnelle (`props.intro ? "mt-4" : ""`). Sans intro, le corps a déjà son
`py-4` et le `mt-4` faisait un double espace sous le fronton.

**⚠️ Sur les cinq sites d'appel.** Le brief m'annonçait cinq erreurs `tsc`
attendues aux lignes 1747/1770/1938/1957/1975 de `StudentWeekPlanPage.tsx`.
**Elles n'existent plus** : pendant mon run, une autre session a déjà retiré les
cinq `accent=` (226 insertions / 164 suppressions sur ce fichier). Vérifié : les
cinq `<SetupSection>` ne passent plus que `title`, `intro`, `summary`. Je n'ai
pas touché ce fichier.

---

## 4. `Card` — la décision qui mérite un second regard

`default: "border-gray-200 bg-white"` → **`"border-line-strong bg-paper"`**

**Le raisonnement, parce qu'il est contre-intuitif.** Avant, une carte se lisait
parce qu'elle était **plus claire que la page** : `bg-white` sur `bg-gray-50`.
Ce levier n'existe plus — la page est `paper` (L 98 %) et la charte ne nomme
**aucun neutre plus clair**. Et une carte doit tenir sur **deux grounds** :

| combinaison | sur `paper` | sur `paper-2` | verdict |
|---|---:|---:|---|
| remplissage `paper-2` + `border-line` | 1,08:1 / 1,30:1 | **1,00:1** / 1,20:1 | la carte **disparaît** sur les sections alternées |
| remplissage `paper` + `border-line` | **1,00:1** / 1,30:1 | 1,08:1 / 1,20:1 | la carte **disparaît** sur les seize écrans |
| remplissage `paper` + `border-line-strong` | 1,00:1 / **3,84:1** | 1,08:1 / **3,57:1** | **tient sur les deux** |

Les deux grounds sont réels : `CouplesPage` pose son `PriceCard` dans
`<section className="bg-paper-2">`, `GymsLandingPage` alterne. Et
`Marketing.tsx > PriceCard` utilise `Card`, donc une carte invisible sur
`paper-2` serait une **régression sur une page livrée**.

Vérifié au navigateur sur `/couples` rendu : `bg: rgb(251,248,250)`,
`border: rgb(142,120,134)`, `radius: 12px` — la carte **lève** sur la section
alternée au lieu de s'y fondre. C'est meilleur qu'avant, pas seulement conforme.

**Et le trait n'est pas lourd :** 1 px à 3,84:1 en mauve-gris se lit comme une
case tracée, pas comme un wireframe. C'est la direction « la fiche technique »
— *des champs, des angles fermés*. Voir la planche §Card.

⚠️ **Le commentaire du fichier interdit explicitement de remettre
`border-line`** et donne l'idiome d'imbrication : un bloc **dans** une carte ne
prend pas un second remplissage (il n'y en a plus de disponible), il prend une
**division** `border-line`. C'est ce que `Auth.tsx:1401` fait déjà.

`tone="warning"` (`border-amber-200 bg-amber-50`) : **intact**, c'est un fait.
`tone="dashed"` : `border-dashed border-line-strong bg-paper` — le vide se
distingue du plein par la **forme**, jamais par une teinte.

### `SectionLabel` prend l'équerre — 74 appels

`text-sm font-semibold uppercase tracking-wide text-gray-500` →
**`eq text-label font-semibold uppercase text-ink-soft`**

C'est le `Kicker` de `Marketing.tsx` sous un autre nom : même rôle (un sur-titre
en capitales qui ouvre un groupe de cartes ou une liste), donc même forme.
L'équerre « marque l'origine de ce qui est spécifié » (charte §4), et une
section en est une. **C'est la décision la plus visible du kit** et c'est ce qui
fait qu'un visiteur qui s'inscrit reconnaît l'endroit où il arrive.

**Le risque, nommé :** 74 équerres sur seize écrans (~5 par écran ; `WeekView`
en porte 7 à lui seul). C'est comparable à une page de vente, et un bilan
hebdomadaire à sept sur-titres équerrés se lit comme une fiche technique — ce
qui est la direction. Mais si l'orchestrateur juge que la signature se dilue,
**c'est une seule classe à retirer** (`eq` dans `Card.tsx`), sans autre effet.

Vérifié au navigateur sur `/app/setup` rendu : label à **11 px**, approche
**1,1 px**, équerre en **`rgb(99,44,76)`** = `fig-700`.

⚠️ Le commentaire prévient de ne pas passer de `px-*` via `className` : `.eq`
pose `padding-left: 1.125rem` **hors de toute couche CSS** et bat un utilitaire
de même spécificité. Vérifié : les 11 appels qui passent un `className` ne
passent qu'un `mb-*`.

---

## 5. `Field` — le défaut des 16 px, corrigé à la source

```
"block w-full min-w-0 rounded-card border border-line-strong bg-paper px-3 py-2.5 " +
"text-base text-ink placeholder-ink-soft transition-colors " +
"focus:border-fig-600 focus:outline-none focus:ring-2 focus:ring-fig-600 " +
"disabled:bg-paper-2 disabled:text-ink-soft disabled:opacity-60 lg:text-sm"
```

**`text-base … lg:text-sm`** — `inputClass` portait `text-sm` (14 px) à toutes
les tailles, sur **cent appels**. `index.css` pose `font-size: 16px` sous `lg`
pour empêcher Safari iOS de zoomer au focus et de ne jamais dézoomer, mais cette
règle vit dans `@layer base` et un utilitaire la bat : la protection était
contournée sans avoir été retirée.

**Mesuré au rendu**, pas déduit : à 320 px le contrôle rend **16 px**, à 1024 px
il rend **14 px**. Et il n'y a aucun conflit de spécificité possible — sous `lg`
la variante `lg:` ne s'applique pas du tout, donc les deux règles disent 16 px ;
à partir de 1024 px la règle de base ne s'applique plus (`max-width: 1023px`).

**`min-w-0`** — un enfant de flex a `min-width: auto` et refuse d'être plus
étroit que son contenu : un champ en `flex-1` ne rétrécissait pas et poussait la
ligne. Vérifié à 320 px sur la planche : la paire de droite tient, celle de
gauche déborde de son cadre (la planche montre le défaut côte à côte).

**Étiquette et lignes de service** — `text-sm font-medium text-gray-700` →
`text-label font-semibold uppercase text-ink-soft` (l'étiquette de la charte
§3) ; hint et error passent de `text-xs` à `text-sm leading-6`, l'idiome livré.

**Deux échecs WCAG réparés en passant :**

| couple | avant | après | seuil |
|---|---:|---:|---|
| bordure de champ (`gray-300` / blanc) | **1,47:1** ✕ | 3,84:1 | 3 · 1.4.11 |
| texte indicatif (`gray-400` / blanc) | **2,54:1** ✕ | 6,11:1 | 4,5 |
| ligne d'aide (`gray-500` / `gray-50`) | 4,63:1 | 6,11:1 | 4,5 |

---

## 6. `Badge`, `Modal`, `Page`, `Marketing`

**`Badge`** — un seul ton changé : `neutral: bg-gray-100 text-gray-600` →
**`bg-line text-ink-soft`**. Les quatre familles d'état : **aucune valeur
touchée**, et je les ai mesurées pour vérifier qu'aucune n'en avait besoin
(`emerald-50/700` 5,21:1 · `blue-50/700` 6,16:1 · `amber-50/800` 6,84:1 ·
`red-50/700` 5,92:1). **Géométrie inchangée exprès** : la pastille est la
*forme* qui porte la garde « la figue n'entre jamais dans une pastille » ; la
déformer affaiblirait la seule règle vérifiable de la palette.

⚠️ `bg-line text-ink-soft` est à **4,72:1**, le couple le plus serré du kit
(seuil 4,5 pour du texte). Je n'ai pas pu faire mieux sans casser autre chose :
un fond `-50` d'état ferait de `neutral` un faux état, `fig-50` est exclu par la
garde, et `paper-2` (1,08:1 sur le papier) ne se lirait pas comme une pastille.
`text-ink` monterait à 12,49:1 mais rendrait le ton *neutre* plus lourd que les
quatre états — l'inverse de sa fonction.

**`Modal`** — voile `bg-gray-900/40` → `bg-ink/40` (même opacité) ; la fenêtre
est le **ground** de ce qu'elle contient, donc `bg-paper` comme la page, pour
que les cartes posées dedans gardent exactement le contraste qu'elles ont sur un
écran ; fronton `bg-paper-2 border-b border-line` ; `rounded-2xl` →
`rounded-fiche` (même 16 px) ; bouton Fermer en `rounded-part`.
**Pas d'équerre sur un titre de dialogue** : la signature ouvre une section,
elle ne redouble pas un titre. **Aucun de ses contrats n'a été touché** — Échap,
verrou de défilement avec restauration de la valeur précédente, focus entrant,
`role`/`aria-modal`, le test de cible sur le fond, le portail, le non-démontage
des enfants : intacts.

**`Page`** — `PageHeader` seul change : `h1` `text-2xl font-semibold text-gray-900`
→ **`font-display text-title text-ink`**, `text-balance`, **sans graisse**
(Young Serif n'en a qu'une ; le navigateur la simulerait en épaississant les
contours). `text-title` va de 27,2 px à 320 px jusqu'à 43,2 px — toujours
au-dessus du plancher de 20 px. Le chapô passe au corps de la charte (1 rem) et
à la mesure de lecture de 62 caractères. `min-w-0` ajouté sur l'enveloppe du
titre : sans lui, un titre long pousse la rangée `flex-wrap` à 320 px.
Le composant `Page` lui-même : **aucune couleur, non touché.**

**`Marketing`** — déjà à la charte, **zéro `gray`, zéro saturée**. Un seul
défaut trouvé et corrigé : son commentaire écrivait *« Autorité :
`scratchpad/site/design/CHARTE.md` »*, c'est-à-dire **le brouillon**. La charte
telle que construite dit elle-même que quand les deux divergent c'est elle qui a
raison, et son §9 liste cinq écarts nés de la mesure — dont **deux touchent ce
fichier** (`tabular-nums` retiré de `PriceCard`, variante `brand`). Un lecteur
envoyé au brouillon les manque tous les cinq. Pointeur corrigé vers
`docs/keel/CHARTE-VITRINE.md` §2, avec l'explication de la différence entre les
deux documents. **Aucun changement visuel.**

---

## 7. Les contrastes calculés — couple, ratio, seuil

Calculés sur les hex (WCAG 2.2, luminance relative), pas estimés. Le tableau
complet est dans `PLANCHE.html` §« Les contrastes, couple par couple ».

| où | couple | ratio | seuil |
|---|---|---:|---:|
| `primary` libellé | `#FBF8FA` / `#632C4C` | **9,98:1** | 4,5 |
| `primary` survol | `#FBF8FA` / `#4A2039` | **12,79:1** | 4,5 |
| `secondary` libellé | `#23191F` / `#FBF8FA` | **16,18:1** | 4,5 |
| `secondary` survol | `#23191F` / `#F9F1F5` | **15,38:1** | 4,5 |
| bordure de contrôle | `#8E7886` / `#FBF8FA` | **3,84:1** | 3 (1.4.11) |
| bordure de contrôle sur fond 2 | `#8E7886` / `#F4EFF2` | **3,57:1** | 3 (1.4.11) |
| `ghost` libellé | `#6A5A64` / `#FBF8FA` | **6,11:1** | 4,5 |
| `ghost` survol | `#6A5A64` / `#F9F1F5` | **5,81:1** | 4,5 |
| `danger` libellé | `#B91C1C` / `#FBF8FA` | **6,13:1** | 4,5 |
| **`Badge neutral`** | `#6A5A64` / `#E3DAE0` | **4,72:1** | 4,5 |
| `SectionLabel` | `#6A5A64` / `#FBF8FA` | **6,11:1** | 4,5 |
| `Field` texte saisi | `#23191F` / `#FBF8FA` | **16,18:1** | 4,5 |
| `Field` anneau de focus | `#7E3C61` / `#FBF8FA` | **7,36:1** | 3 |
| `Field` étiquette, aide, indication | `#6A5A64` / `#FBF8FA` | **6,11:1** | 4,5 |
| `Field` erreur | `#B91C1C` / `#FBF8FA` | **6,13:1** | 4,5 |
| `Field` désactivé | `#6A5A64` / `#F4EFF2` | **5,67:1** | 4,5 |
| fronton : titre | `#23191F` / `#F4EFF2` | **15,02:1** | 4,5 |
| fronton : résumé, bouton Fermer | `#6A5A64` / `#F4EFF2` | **5,67:1** | 4,5 |
| `PageHeader` titre | `#23191F` / `#FBF8FA` | **16,18:1** | 4,5 |
| équerre sur clair | `#632C4C` / `#FBF8FA` | **9,98:1** | 3 |
| équerre sur sombre | `#C9A3B8` / `#24101E` | **8,06:1** | 3 |
| `Badge positive` (non touché) | `#047857` / `#ECFDF5` | 5,21:1 | 4,5 |
| `Badge info` (non touché) | `#1D4ED8` / `#EFF6FF` | 6,16:1 | 4,5 |
| `Badge caution` (non touché) | `#92400E` / `#FFFBEB` | 6,84:1 | 4,5 |
| `Badge critical` (non touché) | `#B91C1C` / `#FEF2F2` | 5,92:1 | 4,5 |

**Aucun échec, avec une exception nommée :** la bordure de `Button
variant="danger"` (`#FECACA` / `#FBF8FA`) est à **1,37:1**, sous le seuil 3:1.
Elle l'était déjà (1,42:1 sur blanc) et je l'ai laissée :

- le bouton est identifié par **son libellé**, `red-700` à 6,13:1 — 1.4.11
  demande que le composant soit identifiable, pas qu'il ait un contour ;
- **le rouge est un état.** Le remonter à `red-500` pour gagner un ratio dont on
  n'a pas besoin changerait la valeur que le produit emploie pour dire « échec »
  sur seize écrans ;
- pour **un seul appel** : `variant="danger"` est rendu **une fois** dans tout
  `frontend/src` (`keel/pages/HouseholdPage.tsx:1317`). Les deux réparations du
  §5 portaient sur cent champs.

---

## 8. Laissé en l'état, avec la raison

| ce que j'ai laissé | pourquoi |
|---|---|
| les 8 saturées de `Badge` | le vocabulaire du produit : un lecteur apprend une fois ce que dit une pastille ambre et le sait sur seize écrans |
| `Card tone="warning"`, `Field` error, `Button danger` | des faits. Audit §5.2 : une saturée peut être une **surface**, la garde opérante est « la figue n'entre jamais dans une pastille » |
| la géométrie de `Badge` (rayon, graisse, marges) | la pastille est la forme qui porte la garde ; le brief autorisait à l'ajuster, je m'en abstiens exprès |
| les tailles de `Button` (`md` `px-4 py-2`, `sm` `px-2.5 py-0.5`) | des centaines d'appels ; les changer déplace la mise en page partout. ⚠️ **Signalé** : `md` fait ~36 px de haut, sous les 44 px recommandés pour une cible tactile. C'est un lot d'ergonomie, pas de charte |
| `buttonClass` exportée | **zéro appelant réel** (vérifié hors commentaires — le commentaire qui en annonçait quatre était périmé, il est réécrit). La retirer est un geste de purge sans rapport avec la charte, et c'est une API publique |
| `variant="brand"` et ses 21 appels | huit pages de vente + `/auth` + `/start` + la barre publique, toutes livrées ; un lot visuel ne renomme pas une API à travers elles |
| `PriceCard` en `text-4xl` (36 px) | hors des cinq crans de l'échelle, mais c'est une valeur **mesurée** sur une page livrée (le commentaire discute sa largeur). Signalé, pas touché |
| `Page` (le composant) | zéro couleur, rien à convertir |
| `role="alert"` sur l'erreur de `Field` | ce serait un **changement de comportement** : le message apparaît après un clic et n'est pas annoncé, mais plusieurs des 77 appels enveloppent déjà le champ dans une région annoncée, et deux `alert` imbriqués lisent le message deux fois. **À auditer dans un lot à part** — le commentaire du fichier le dit |

---

## 9. Signalé à l'orchestrateur — hors de `ui/`

1. **`keel/components/PublicHeader.tsx` porte encore des `gray-*` sur une page
   livrée.** Relevé au navigateur sur `/couples` : l'interrupteur de langue rend
   `rounded-full border border-gray-200`, `bg-gray-900`, `text-gray-…`. C'est la
   **chrome des huit pages publiques**, donc hors des seize écrans du chantier
   *et* hors du périmètre « déjà fait ». Il survivra au chantier si personne ne
   le nomme.
2. **`StudentWeekPlanPage.tsx:1843`** porte `accent-gray-900` — un utilitaire
   `accent-color`, invisible au grep `-gray-` naïf du §7 de l'audit. La barre de
   qualité « zéro `gray-*` » doit couvrir `accent-*`, `caret-*` et `divide-*`.
3. **`Field` error sans `role="alert"`** — voir §8.
4. **Cible tactile de `Button size="md"`** à ~36 px — voir §8.

---

## 10. Vérification

**`npx tsc -b` depuis `frontend/`** — **568 erreurs, toutes `TS2783`
(« specified more than once »), toutes dans `src/keel/i18n/en.ts` et
`src/keel/i18n/fr.ts`. Zéro erreur ailleurs.**

```
$ npx tsc -b 2>&1 | sed -E 's/\(.*//' | sort | uniq -c
 284 src/keel/i18n/en.ts
 284 src/keel/i18n/fr.ts
$ npx tsc -b 2>&1 | grep -v 'src/keel/i18n/'
(rien)
```

Ce rouge appartient au **chantier de traduction qui écrit en parallèle** (les
deux fichiers sont `M` dans `git status`, et le nom d'un de leurs tests a changé
entre deux de mes exécutions). Master §0.4 : *« si le rouge vient d'un fichier
d'une autre session, ne le répare pas — consigne-le »*. **Non réparé, consigné.**

Les cinq erreurs `accent` annoncées par le brief **n'apparaissent plus** : une
autre session a retiré les cinq props pendant mon run (voir §3).

**`npx vitest --config vitest.config.ts run`** — `4 failed | 812 passed | 20 skipped`.
Les quatre échecs :

| test | pourquoi ce n'est pas moi |
|---|---|
| `edge/coverage-guard.int.test.ts` (×2) | liste des fonctions edge et des triggers ; `supabase/functions/*` est en cours d'édition par une autre session |
| `keel/copy/planRefusals.int.test.ts` | `keel/copy/*` est `M` par une autre session |
| `keel/i18n/parity.int.test.ts` | le pack `fr.ts`, la même session que le rouge `tsc` |

**Preuve que mon lot est orthogonal à la suite :** *aucun* fichier de test du
dépôt ne référence `components/ui` ni aucune des huit primitives (vérifié sur
`src/**/*.test.ts*` et `e2e/`). Les huit fichiers ne peuvent pas avoir causé ces
quatre échecs.

**Au navigateur.** Planche à **320 px** : `pageOverflow: 0`, zéro élément hors
cadre en dehors des conteneurs `overflow-x: auto` (les tables). À **1024 px** :
`pageOverflow: 0`, contrôle à 14 px. À **1280 px** : rendu complet vérifié
section par section (le panneau ne repeint qu'à scroll 0 — j'ai décalé le corps
plutôt que scrollé).

**Sur l'app rendue** (serveur de session, port 5191) :

- `/couples` (vitrine livrée) — `PriceCard` : `bg rgb(251,248,250)`,
  `border rgb(142,120,134)`, `radius 12px` ; bouton `brand` :
  `bg rgb(99,44,76)`, `color rgb(251,248,250)`. `pageOverflow: 0` à 1280 px.
  **Aucune régression** : la carte lève sur la section `paper-2` au lieu de s'y
  fondre.
- `/app/setup` (écran connecté réel) — `Card` : `bg rgb(251,248,250)`,
  `border rgb(142,120,134)`, `radius 12px` ; `SectionLabel` : 11 px, approche
  1,1 px, équerre `rgb(99,44,76)`. `pageOverflow: 0`.
  Les 23 `gray-*` restants sur cet écran sont les classes **locales** de
  `SetupPage` — le travail de la phase 3.
- `/app/plan` (les cinq `SetupSection` dans une fenêtre) : **non atteint** — le
  garde de route renvoie ce compte vers `/app/setup` (pas d'objectifs), et
  changer l'état du compte sur un profil navigateur partagé sort de mon lot.
  `SetupSection` est vérifié sur la planche, dans sa configuration réelle : cinq
  sections empilées avec `space-y-4`.

**Classes générées.** Toutes vérifiées dans le CSS construit par Vite, pas
supposées : `rounded-t-fiche` `rounded-fiche` `rounded-card` `rounded-part`
`bg-line` `text-ink-soft` `placeholder-ink-soft` `bg-ink/40` `bg-fig-700`
`text-paper` `border-line-strong` `hover:bg-fig-50` `disabled:bg-paper-2`
`text-label` `lg:text-sm` `text-title` `font-display` `max-w-[62ch]`.

**Périmètre du diff.** Les huit fichiers de `ui/`, et rien d'autre :

```
 M frontend/src/keel/components/ui/Badge.tsx
 M frontend/src/keel/components/ui/Button.tsx
 M frontend/src/keel/components/ui/Card.tsx
 M frontend/src/keel/components/ui/Field.tsx
 M frontend/src/keel/components/ui/Marketing.tsx
 M frontend/src/keel/components/ui/Modal.tsx
 M frontend/src/keel/components/ui/Page.tsx
 M frontend/src/keel/components/ui/SetupSection.tsx
?? scratchpad/plateforme/kit/
```

Aucun commit, aucun `git add`, aucun `git stash`. Pas de `tailwind.config.*`.
Aucune commande `supabase`.

⚠️ **Deux relevés de dépôt à connaître avant de commiter.**

1. **Mes huit fichiers sont déjà dans l'INDEX, et ce n'est pas moi.**
   `git status --porcelain` les rend `M ` (staged), pas ` M`. Je n'ai lancé
   aucune commande `git` d'écriture — une autre session les a indexés. Le
   contenu est intact (index == worktree), mais **un commit lancé sans chemins
   explicites les emportera**. Le diff se relit avec `git diff --cached --
   frontend/src/keel/components/ui`.
2. **`HEAD` ne portait que QUATRE accents, pas cinq.** La version committée de
   `SetupSection.tsx` déclare `SetupAccent = "violet" | "sky" | "teal" |
   "orange"` ; le `rose` que l'audit §2.1 et mon brief décrivent n'existait que
   dans l'arbre de travail, non committé. Sans effet sur le geste — le type et
   la table `ACCENT` partent en entier, dans les deux états — mais si quelqu'un
   compare mon diff à `HEAD` et compte quatre suppressions au lieu de cinq,
   c'est ça et pas une omission.
