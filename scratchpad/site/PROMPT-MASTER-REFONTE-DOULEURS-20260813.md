# MASTER — Les huit pages repartent de la douleur

> **Mission en une phrase.** Les huit pages publiques existent, elles sont
> bilingues, illustrées et honnêtes — mais elles sont organisées **par
> fonctionnalité**. Ce chantier les réorganise **par douleur** : une section
> = une douleur, dans l'ordre qui convertit, avec **moins de texte** et des
> figures qui font le travail à sa place.

Tu es l'agent **orchestrateur**. Tu ne réécris pas les huit pages toi-même.

---

## 0. Règles opératoires — non négociables

1. **Branche `ff-001-quotidien-du-coach`.** Pas de push, pas de merge.
2. **`git add -A` interdit.** D'autres sessions écrivent dans ce dépôt. Chaque
   commit liste ses chemins. Un commit par phase.
3. **Commandes à risque : jamais seul.** Ce chantier est 100 % frontend.
4. **Vérification** : `npx tsc -b` (c'est `tsconfig.app.json` qui vérifie) et
   `npx vitest --config vitest.config.ts run`. Si le rouge vient d'une autre
   session, **ne le répare pas** — consigne, commite tes chemins.
5. **Collisions.** Les constructeurs tournent en parallèle et n'écrivent
   **jamais** dans un fichier partagé (`en.ts`, `fr.ts`, `App.tsx`,
   `catalog.ts`, `Marketing.tsx`, `PublicHeader.tsx`, `tokens.css`).
   Chacun écrit **sa** page + ses fragments sous `scratchpad/site/<segment>/`.
   **Toi seul** intègres, en série.
   ⚠️ **`fr.ts` est activement réécrit par un autre chantier** (l'app entière
   devient bilingue). Vérifie l'état avant chaque fusion de clés.
6. **Navigateur** : `preview_start`. Le panneau **ne repeint qu'à scroll 0**.
   Teste à **320 px et 1280 px**, **EN et FR**. Ne vide pas `localStorage` :
   le profil est partagé avec d'autres sessions.
7. **Une décision bloquante se prend, elle ne s'attend pas.**

---

## 1. Les trois documents qui font autorité

| Document | Ce qu'il porte |
|---|---|
| **`scratchpad/site/GRILLE-DOULEURS.md`** | **Le contenu.** Les trois douleurs de chaque page, dans l'ordre, avec le besoin, la réponse et son ancre. C'est la commande. |
| **`docs/keel/CHARTE-VITRINE.md`** | **La forme.** La charte telle que construite — palette, typo, figures, gardes. Quand elle contredit `scratchpad/site/design/CHARTE.md`, elle gagne. |
| **`scratchpad/site/AUDIT-SITE.md`** | **Les faits.** Le tableau des claims vérifiés (C1-C17, B1-B33), les 12 interdits, les 12 silences. |

**Un fait absent de ces trois documents n'entre pas dans une page.**

---

## 2. Ce qui change, et ce qui ne change pas

### Ce qui change

- **L'organisation.** Les pages sont ordonnées par fonctionnalité ; elles
  passent à **une section = une douleur**, dans l'ordre de la grille.
- **La quantité de texte.** C'est une demande explicite du propriétaire :
  **moins de texte**. Une section porte une douleur, une figure, et le minimum
  de phrases pour que la figure soit comprise.
- **La nature des figures.** Les SVG statiques restent, mais **ils ne sont plus
  la seule réponse** — voir §3.
- **Le vocabulaire pro** : « clients » sur `/pro` et `/gyms`, « élèves » sur
  `/coaches` seulement.
- **La navigation** : Pour moi seul · À deux · En famille.

### Ce qui ne change pas

- **La charte.** Palette, typo, équerre, style de figure : appliqués tels quels.
- **L'honnêteté.** Chaque claim garde son ancre en commentaire JSX. Les 12
  interdits et les 12 silences de l'audit restent en vigueur, sans exception.
- **Les CTA** : `/start` côté foyer, `/auth?role=coach` côté pro. Un seul par
  page, répété.
- **Le bilinguisme** : EN et FR livrés ensemble, mêmes trous d'interpolation.

---

## 3. ⭐ L'INVENTIVITÉ EST DEMANDÉE — et voici sa seule limite

Le propriétaire demande explicitement d'être **inventif**, et d'aller au-delà du
schéma statique **quand ça sert le lecteur**. Une figure qui se manipule fait
comprendre en trois secondes ce qu'un paragraphe explique en dix lignes.

**Des pistes, pas une liste fermée :**

- **Un sélecteur d'objectif** sur `/meal-prep` : le lecteur choisit parmi les six
  objectifs et voit **la consigne de service changer**. Il comprend en un geste
  ce que « six objectifs, six façons de servir » veut dire.
- **Les deux assiettes de `/couples`** qui se recomposent quand on choisit deux
  objectifs différents.
- **Une semaine qui se replie** sur `/meal-prep` : sept jours de plats → trois
  sessions de cuisine. Le passage de l'un à l'autre EST l'argument.
- **Sur `/coaches` ou `/pro`** : une ligne rouge qu'on voit **mordre** — le
  message part, il est retenu, et ce qui sort à la place porte les mots du pro.
- Un survol qui annote, un révélateur au défilement, un compteur qui se compose.

### ⛔ LA LIMITE, ET ELLE EST ABSOLUE

> **Une démonstration ne peut montrer que des valeurs que le produit produit
> RÉELLEMENT.**

Les six consignes de service **existent** dans `SERVING_DIRECTION`
(`_shared/keel/household_portions.ts`) : un sélecteur qui les affiche est
**honnête**, parce qu'il montre la vraie sortie du vrai moteur. Un sélecteur qui
inventerait des grammes, un menu, ou une phrase que le produit ne dit jamais
serait **la faute que tout ce chantier existe pour éviter** — c'est la règle du
dépôt : *« on ne montre pas un écran qu'on n'a pas »*.

Donc, avant d'écrire une démonstration : **va lire la constante ou la fonction
qui produit ces valeurs, et copie-les.** Si tu ne trouves pas la source, la
démonstration n'a pas le droit d'exister.

### Le plancher technique d'une démonstration

- **Elle fonctionne sans elle.** Le lecteur qui a JavaScript désactivé, ou qui
  n'interagit pas, doit comprendre la section : l'état initial est déjà lisible
  et déjà juste.
- **Elle est accessible** : atteignable au clavier, focus visible, `aria` correct,
  et l'état courant annoncé — pas seulement coloré.
- **Elle respecte `prefers-reduced-motion`.**
- **Elle est bilingue** comme le reste : aucune chaîne en dur.
- **Elle ne pèse rien** : pas de bibliothèque, pas de dépendance ajoutée. React
  et le CSS suffisent.
- **Elle tient à 320 px.**

⚠️ **Une seule démonstration par page, deux au maximum.** Trois font une page de
gadgets, et la page ne vend plus rien. Dépense l'interactivité là où elle porte
l'argument le plus difficile à expliquer par écrit.

---

## 4. Les phases

```
Phase 0        Phase 1                Phase 2          Phase 3
CADRAGE   →    8 CONSTRUCTEURS   →    INTÉGRATION →    REVIEWS
(toi)          (parallèle)            (toi)            + PREUVES
```

### Phase 0 — Le cadrage (toi)

1. **Mesure la baseline** : lignes par page, nombre de sections, nombre de mots
   rendus, nombre de figures. « Moins de texte » doit se prouver, pas s'affirmer.
2. **Relis les huit pages** et note, pour chacune, ce qui existe déjà et qui
   correspond à une ligne de la grille : une bonne partie du travail est de
   **réordonner et couper**, pas de réécrire.
3. **Décide où va l'interactivité.** Pas plus d'une page sur deux : si les huit
   pages ont toutes leur démonstration, la marque devient un jouet. Choisis les
   trois ou quatre arguments les plus durs à écrire.

### Phase 1 — Les huit constructeurs (parallèle)

Un agent par page. **Le socle commun**, à copier dans chaque prompt :

> **Invoque le skill `frontend-design:frontend-design` avant d'écrire.** Il porte
> la discipline de composition et l'exigence que la page ne ressemble pas à un
> gabarit. La charte fixe déjà la palette et la typo ; lui apporte le reste.
>
> **Tes trois lectures, dans cet ordre :**
> 1. `scratchpad/site/GRILLE-DOULEURS.md` — **ta commande**. Trouve ta page :
>    tu as trois douleurs, dans l'ordre. **Une section = une ligne.**
> 2. `docs/keel/CHARTE-VITRINE.md` — la forme. Les jetons sont déjà dans
>    `frontend/src/tokens.css` : `bg-paper`, `text-ink`, `text-ink-soft`,
>    `text-fig-700`, `border-line`, `font-display`, `text-hero`, `text-title`,
>    `text-lede`, `text-label`, `rounded-fiche`, `eq`, `fig-scroll`, et la
>    variante de bouton `variant="brand"`.
> 3. `scratchpad/site/AUDIT-SITE.md` §8 et §9 — les 12 interdits et les 12
>    silences. Ils te concernent tous, même ceux qui semblent appartenir à
>    l'autre monde.
>
> **Ta page existe déjà.** Ton travail est de la **réorganiser autour des trois
> douleurs**, de **couper** ce qui ne sert aucune d'elles, et de faire porter
> l'argument par la figure plutôt que par le paragraphe. Ce n'est pas une page
> neuve : ce qui est déjà juste et ancré se garde.
>
> **La discipline de longueur, et elle est mesurée :** ta page rend **moins de
> mots** qu'avant. Compte-les, dis le chiffre dans ton rapport. Une section qui
> a besoin de plus de trois phrases après sa figure est une section dont la
> figure est ratée.
>
> **Le test qui décide :** un lecteur qui ne lit **que** les titres et les
> figures doit comprendre l'offre entière, et surtout **se reconnaître** dans la
> première section en cinq secondes.
>
> **Contraintes dures :**
> - **Chaque claim porte son ancre en commentaire JSX** — `{/* fact: C3 —
>   meal_generation.ts:518 */}`. Un claim sans ancre sera supprimé en review.
> - **Aucune chaîne en dur.** Toutes les clés dans ton namespace, **EN et FR
>   livrés ensemble**, mêmes trous d'interpolation. Le FR est une réécriture qui
>   sonne juste, pas un calque. Espace insécable **U+00A0**, jamais U+202F, et
>   **pas de `→`** — il n'existe dans aucune des deux polices ; dans une figure,
>   la flèche se dessine.
> - **Tu n'écris QUE** ta page + `scratchpad/site/<segment>/`. Pas `en.ts`, pas
>   `fr.ts`, pas `App.tsx`, pas `catalog.ts`, pas `Marketing.tsx`, pas
>   `PublicHeader.tsx`, pas `tokens.css`. **Ta page ne compilera pas seule tant
>   que les clés ne sont pas fusionnées — c'est normal.**
> - **Mobile d'abord**, composé à 320 px. `flex-1` ne rétrécit pas un champ.
>   Une figure vit dans `.fig-scroll`, et **son enveloppe a besoin de `min-w-0`**
>   sinon c'est la PAGE qui défile en largeur.
> - Un seul `<h1>`, `aria-label` sur chaque figure, focus visible.
>
> **Si l'orchestrateur t'a confié une démonstration interactive**, lis le §3 du
> master : sa limite est absolue — **elle ne montre que des valeurs que le
> produit produit réellement**, et tu vas lire la constante qui les produit
> avant de l'écrire.
>
> **Vérifie au navigateur**, aux deux largeurs et dans les deux langues. Les
> défauts de ce chantier ne se voient qu'au rendu.
>
> **Livre** : ta page, `keys.en.ts`, `keys.fr.ts`, tes SVG, et `RAPPORT.md` —
> le nombre de mots avant/après, ce que tu as coupé et pourquoi, la liste de tes
> claims avec leur identifiant d'audit.

### Les huit briefs

| Agent | Page | Namespace | Note |
|---|---|---|---|
| 1 | `/meal-prep` | `mealprep` | ⭐ Candidate n°1 pour le sélecteur d'objectif |
| 2 | `/couples` | `couples` | ⭐ Candidate n°1 pour les deux assiettes |
| 3 | `/families` | `families` | ⚠️ L'allergie descend en section 02, **jamais en ouverture** |
| 4 | `/coaches` | `coaches` | ⚠️ Garde « élèves ». Les silences S1-S12 sont dans son en-tête : **ils restent** |
| 5 | `/gyms` | `gyms` | ⚠️ **Segment recadré** : ses clients n'ont pas de coach. Et la doctrine se **délègue** |
| 6 | `/communities` | `communities` | ⚠️ Ne pas réintroduire le bloc « no calories » |
| 7 | `/` (hall foyer) | `home` | 7 fonctionnalités, deux cellules par ligne |
| 8 | `/pro` (hall pro) | `pro` | 6 fonctionnalités. ⚠️ Sa ligne 01 porte **deux** entrées : votre méthode, ou la nôtre |

### Phase 2 — L'intégration (toi, en série)

Fusion des clés dans `en.ts` et `fr.ts` (⚠️ vérifie l'état de `fr.ts` : un autre
chantier l'écrit), mise à jour des libellés de navigation, `sitemap.xml`, SEO.
Puis `tsc` + vitest + parcours des huit pages × 2 largeurs × 2 langues.

### Phase 3 — Les reviews

Trois lentilles, par des agents frais qui n'ont pas construit ce qu'ils jugent :

1. **Le test des cinq secondes** (un agent par page) — capture du premier écran
   seul. Qui est-ce ? Se reconnaît-il ? Quel geste ? Et : **la première section
   est-elle bien celle qui fait dire « c'est moi » ?**
2. **L'honnêteté** (1 agent) — chaque claim, son ancre rouverte, vérifiée contre
   le code d'aujourd'hui. ⚠️ **Les démonstrations interactives comptent comme des
   claims** : leurs valeurs viennent-elles vraiment du produit ?
3. **La cohérence et l'a11y** (1 agent) — les huit côte à côte : est-ce un seul
   produit ? Puis contrastes réels, ordre des titres, clavier, `reduced-motion`.

---

## 5. La barre de qualité

1. **Une section = une douleur**, dans l'ordre de la grille, sur les huit pages.
2. **Moins de mots qu'avant**, mesuré et chiffré page par page.
3. Le test titres + figures passe, et la **première** section fait se reconnaître.
4. **Zéro claim sans ancre**, zéro claim faux survivant à la review d'honnêteté.
5. **Chaque démonstration interactive n'affiche que des valeurs du produit**, et
   la section reste comprise sans y toucher.
6. 320 px et 1280 px propres, EN et FR, sur les huit.
7. tsc + vitest verts, un commit par phase, rapport final avec l'avant/après.
