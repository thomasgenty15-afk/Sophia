# RAPPORT — `/meal-prep`, le solo qui fait du meal prep

> Agent 1 · namespace `mealprep` · 2026-08-12 · branche `ff-001-quotidien-du-coach`
>
> **Livrables** `frontend/src/keel/pages/MealPrepPage.tsx` (490 lignes) ·
> `keys.en.ts` · `keys.fr.ts` (53 clés chacun) · `controle-figures.html`
> (planche de jugement, **ne va pas au dépôt applicatif**).

---

## 1. La recherche, en 5 lignes

1. **La douleur qu'il nomme n'est pas le temps, c'est la décision** — le registre
   spontané est « je suis épuisé de décider », pas « je n'ai pas le temps », et le
   leader du créneau (Eat This Much) vend déjà littéralement *« take the anxiety
   out of picking what to eat »*. D'où le `h1`, qui attaque là.
2. **La douleur la plus spécifiquement SOLO est le gâchis** : tout le commerce
   alimentaire suppose un foyer, une personne seule jette plus par tête, et le
   frais est le premier poste. C'est le seul terrain où le produit peut être plus
   précis que la concurrence sans mentir — et `MAX_FRIDGE_DAYS = 3` tombe dessus.
3. **L'objection n°1 documentée est « ça se répète dès la semaine 3 »**, contre
   Eat This Much *et* Mealime. C'est le point où tout le marché casse — et **rien
   dans le dépôt ne prouve le contraire**, donc la page s'en tait (§4, trou T1).
4. **« Pas de comptage » est un repoussoir** pour qui a un objectif de poids : il
   sait que le déficit existe, et l'absence de mesure sonne wellness flou. Ce qui
   se vend, c'est le **fardeau** retiré, pas les chiffres retirés.
5. **« IA » et « personnalisé » sont morts d'usure** (65 % des consommateurs
   rejettent l'argument IA creux ; « personnalisé » est déjà chez PlateJoy et
   Mealime, et leurs avis disent que ça finit générique). Aucun des deux mots
   n'apparaît sur la page — vérifié par grep.

*(Réserve de méthode : Reddit bloque le crawler, donc aucun verbatim de première
main de `r/MealPrepSunday` ni `r/loseit` ; les douleurs ci-dessus viennent
d'articles, de forums accessibles et d'avis App Store. Les chiffres de rétention
trouvés en chemin venaient de blogs d'éditeurs concurrents : **aucun n'entre sur
la page**, S8 s'applique aux chiffres du marché comme à ceux du produit.)*

## 2. Le message, en 12 phrases

1. Tu cuisines déjà une fois pour plusieurs jours.
2. Ce qui use, ce n'est pas de cuisiner : c'est de décider quoi.
3. Sophia compose ta semaine dans ton unité à toi — la session de cuisine, pas une
   liste de plats.
4. Tu poses ton objectif à l'entrée, et le plan compose avec.
5. Ce n'est pas un compteur : les chiffres sont éteints par défaut, et une chaîne
   de gardes décide si on peut les allumer.
6. Rien ne te note — pas de score, pas de série, pas de bande de couleur.
7. Les courses ne tombent pas en un seul chariot : elles arrivent en vagues.
8. Une vague ne demande jamais au frais de dormir plus de trois jours au frigo.
9. Et si la semaine tient en une seule vague, tu n'en vois qu'une : le produit n'en
   invente pas une deuxième.
10. Quand un soir tombe à l'eau, il y a trois gestes — décaler un plat, décaler la
    session, ou dire que tu ne cuisines pas ce soir.
11. Aucun plat n'est choisi à ta place, et la semaine n'est pas réécrite.
12. 12,99 € par mois, et seul tu as tout : prénom, date de naissance, objectif,
    allergies, et Sophia compose la première semaine.

## 3. La liste des claims, avec leur ancre

| # | Ce que la page affirme | Où | Ancre |
|---|---|---|---|
| 1 | Le produit est entier pour une personne seule | kicker du hero, section prix | **PIVOT-FOYER §5 + C1** |
| 2 | La semaine est faite de **sessions de cuisine**, pas de plats | lede, figure 1, bloc sombre | **C3** — `meal_generation.ts:518`, `CookingSessions.tsx:48` |
| 3 | L'objectif est posé par le lecteur à l'entrée | lede, fiche de clôture | **C14** — `onboarding.ts:650-662` |
| 4 | Les chiffres sont **éteints par défaut**, des gardes décident de les allumer | bloc sombre | **C15** — `20260812230000:60`, `energy_gate.ts:228-249` |
| 5 | Rien ne note la semaine, aucune bande de couleur | bloc sombre | **S9** — évaluateur déprogrammé en 1:N (`20260803200000`) |
| 6 | Les courses arrivent en **vagues**, le frais n'attend pas plus de 3 jours | section courses, figure 2 | **C5** — `grocery_waves.ts:211`, `MAX_FRIDGE_DAYS = 3` |
| 7 | Une seule vague reste une seule vague (réserve écrite) | légende de la figure 2 | **C5, réserve** — `ShoppingListPanel.tsx:137-149` |
| 8 | Trois gestes : décaler un plat, décaler la session, ne pas cuisiner ce soir | section imprévu, figure 3 | **C7** — `accident.ts:995-1004`, `deterministic_buttons.ts` |
| 9 | Aucun plat n'est choisi à ta place, la semaine n'est pas réécrite | légende de la figure 3 | **§5.1 / C7** — `accident.ts:52-55` |
| 10 | 12,99 €/mois, le foyer, entier à une personne | note du hero, prix | **C1** — `20260810260000:235-250` |
| 11 | D'autres bouches peuvent s'ajouter plus tard | section prix | **C1** (plafond 8, maître jamais compté) |
| 12 | On demande prénom, date de naissance, objectif, allergies | fiche de clôture | **C14** — `onboarding.ts:650-662` |
| 13 | `/start` est la porte | les deux CTA | **C13 + §10** — `onboarding.ts:84` (branche `solo`) |

**Ce que la page ne dit PAS, et pourquoi** (contrôlé par grep sur les 106 valeurs
i18n, EN et FR) : aucune calorie ni « jamais de chiffres » (§8 n°2) ; aucun essai,
aucune durée, aucun geste d'achat (§8 n°1) ; aucun échange de plat (§5.1) ; aucun
suivi de poids ni courbe (C16, S6) ; aucune app mobile (C17) ; aucun « rien à
installer » (S4) ; aucune durée chiffrée (D5) ; aucun vocabulaire de coach (S2).

## 4. Les décisions, et les trous assumés

**D-1 — Le bloc sombre est en position 2, pas avant le prix.** Ce lecteur arrive
avec une objection avant d'avoir une question : il a déjà désinstallé un compteur.
La lever en bas de page, c'est la lever après qu'il soit parti.

**D-2 — Le nombre de gardes n'est pas écrit.** Le brief dit « quatre verrous »,
l'audit C15 dit « une chaîne de 5 gardes ». Deux sources, deux nombres : S8
tranche, la page écrit « une chaîne de gardes » sans chiffre. **À arbitrer avant
que les autres pages n'écrivent « quatre ».**

**D-3 — « Éteints par défaut, ce qui n'est pas la même chose qu'absents ».** La
recherche est nette : retirer toute mesure à quelqu'un qui a un objectif de poids
le fait fuir. La formulation dit que la mesure existe et qu'elle n'est pas jetée
dans ses yeux — elle reste strictement dans C15, et elle passe la garde TCA.

**D-4 — `audience="student"` sur `PublicHeader`.** L'en-tête `coach` porte les
trois portes B2B **et** le bouton d'essai coach : deux offres de plus sur une page
qui en vend une seule. À revoir quand l'interrupteur des deux mondes arrivera.

**D-5 — Les libellés de figure sont en CAPITALES dans la donnée i18n.**
`text-transform` sur un `<text>` SVG n'est pas garanti par tous les moteurs, et la
casse d'une étiquette de figure est une décision de charte (F11) : elle est donc
dans la valeur, pas dans le CSS.

**T1 — Le trou assumé : la répétition.** L'objection n°1 du marché (« il me
redonne les mêmes plats dès la semaine 3 ») est **la meilleure occasion
commerciale de ce segment**, et la page n'y répond pas : rien dans l'audit ne
prouve que le générateur varie. Si quelqu'un peut ancrer une garde de variété, ça
vaut une section entière.

**T2 — Le silence sur le poids coûte quelque chose ici.** Le lecteur vient AVEC un
objectif de poids ; la page le lui fait poser puis n'en reparle jamais (C16, S6).
C'est honnête et c'est un trou de conversion : il n'est pas comblable avant que
les chemins d'écriture et de lecture du poids soient d'accord.

## 5. Pour l'orchestrateur — ce que l'intégration doit savoir

1. **53 clés, `mealprep`**, EN et FR livrés ensemble, **zéro trou d'interpolation
   des deux côtés**. Le namespace va dans `PUBLIC_NAMESPACES` et **surtout pas**
   dans `PUBLIC_NAMESPACES_PENDING_TRANSLATION` : le français est écrit.
2. **Les insécables du FR sont échappées ` `**, jamais collées en clair, et
   **jamais U+202F**. Une passe de normalisation automatique a mangé les
   caractères littéraux pendant ce lot — l'échappement est ce qui l'empêche.
   Contrôlé : 0 insécable littérale, 0 U+202F, 0 apostrophe droite dans les
   valeurs, ponctuation double toujours précédée d'une insécable.
3. **Découverte qui concerne LES SIX PAGES : il manque un PLAFOND aux figures.**
   `tokens.css` donne à `.fig-scroll > svg` un plancher de 380 px et rien
   au-dessus. Mesuré sur maquette : dans une planche de 1200 px, le SVG s'étire à
   **1070 px** et le libellé de figure passe à **25 px** — plus gros que le chapô.
   J'ai borné mes trois figures à `max-w-[560px]` (texte de figure ≈ 13 px). **Si
   les cinq autres agents ne l'ont pas fait, leurs figures sont des affiches** :
   la vraie correction est une ligne dans `tokens.css`
   (`.fig-scroll > svg { max-width: 560px; margin-inline: auto }`).
4. **`ui/Button.tsx` est resté en `bg-gray-900`** : le CTA plein n'est donc pas en
   `fig-700`. Je ne l'ai pas surchargé — c'est une primitive partagée par les huit
   pages, et une surcharge locale de couleur est exactement la dérive que
   `Marketing.tsx` documente. À re-styler une fois, pour tout le monde.
5. **F8 se vérifie figure par figure sur ce fichier, pas par fichier.** L'équerre
   est factorisée dans `FigureHead` (même géométrie pour les trois figures), donc
   le grep de contrôle de la charte rend **4** ici au lieu de 2. Chaque figure a
   bien son équerre partagée et **une** pièce chaude : la casserole, le panier, le
   plat. C'est écrit en tête du fichier pour qu'un relecteur ne « répare » pas.
6. **Restent à faire hors de mon périmètre** : la route `/meal-prep` dans
   `App.tsx`, l'entrée de `sitemap.xml`, et la porte vers cette page dans
   `PublicHeader` / `PublicFooter`.

## 6. Ce qui a été vérifié, et comment

- **Syntaxe** : `esbuild --jsx=automatic` passe sur la page (le typecheck complet
  ne peut pas passer tant que les clés ne sont pas fusionnées — c'est attendu).
- **Parité** : 53 clés EN, 53 FR, 53 utilisées dans le TSX ; aucune orpheline,
  aucune non définie, aucune définie non utilisée.
- **Charte F1-F14** : contrôlé par script — coordonnées entières, aucune Bézier
  (seulement `M`, `L` et l'arc `A`), deux épaisseurs (1 et 2), aucun
  dégradé/filtre/ombre/opacité, aucune couleur d'état, `<title>`+`<desc>`
  référencés sur les trois figures, grille 480×240, aucun `rx="0"`, aucune chaîne
  en dur dans un `<text>`.
- **À l'œil, sur rendu réel** (`controle-figures.html`) : c'est ce qui a fait
  refaire la figure 3 — sa première version montrait une flèche qui pointait hors
  de la carte, vers rien. Elle a maintenant deux soirs, donc une destination.
- **320 px** : `scrollWidth === clientWidth === 320` — la page ne défile jamais en
  largeur ; seules les figures débordent, à l'intérieur de leur `fig-scroll`.
- **Les 12 interdits** : contrôlés par expressions régulières sur les 106 valeurs
  i18n. Tous passent.
