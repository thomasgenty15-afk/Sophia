# RAPPORT — `/couples`, le couple à objectifs divergents

> **Agent 2** · branche `ff-001-quotidien-du-coach` · namespace `couples`
> **Livrables** `frontend/src/keel/pages/CouplesPage.tsx` (455 lignes) ·
> `keys.en.ts` · `keys.fr.ts` (66 clés chacun, parité vérifiée) ·
> `fig-plates.svg` · `fig-who.svg` · `fig-chat.svg` · les deux bancs de mesure.

---

## 1. La recherche, en cinq lignes

1. **Leur mot est « portion », jamais « calorie ».** Ils disent *« one household,
   two diets »*, *« he's bulking, I'm cutting »*, *« I'm not a short-order cook »*.
2. **Objection n°1 : « on va devoir cuisiner deux fois »** — et son corollaire non
   dit, plus violent : la double charge retombe sur un seul des deux, qui finit
   par en vouloir à l'autre.
3. **Objection n°2 : « mon partenaire ne s'en servira pas »** — tous les outils du
   voisinage supposent **deux comptes actifs** alors qu'un seul des deux est motivé.
4. **Le trou du marché est net.** Eat This Much traite le cas frontalement… pour
   dire qu'il ne le fait pas (*« This won't automatically handle multiple people's
   different nutrition targets »*) ; son contournement est manuel. MyFitnessPal,
   PlateJoy, Mealime mettent à l'échelle une **quantité** pour N personnes.
   **Personne ne réconcilie deux cibles opposées sortant de la même casserole.**
5. **À éviter absolument :** « régime », « compter », « peser », « macros »,
   « discipline » — et tout ce qui désigne le partenaire moins motivé
   (« motiver ton partenaire », « il faut qu'il s'y mette »). Le champ lexical de
   la *food police* est ce qui fait fuir ce segment.

**Un chiffre a été écarté.** L'essai LEAP (le conjoint non traité perd du poids
par ricochet) est le seul fait chiffré et sourçable trouvé. Il **n'est pas dans
`AUDIT-SITE.md`**, donc il n'entre pas dans la page — la règle du socle ne fait
pas d'exception pour un chiffre qui arrange. Son **idée** survit sans son
chiffre : l'unité n'est pas la personne, c'est la cuisine.

---

## 2. Le message, en douze phrases

1. Vous avez deux objectifs qui ne vont pas dans le même sens, et une seule cuisine.
2. Aujourd'hui ça se règle en cuisinant deux fois, et c'est ce qui fait arrêter.
3. Sophia compose la semaine du foyer en **sessions de cuisine** : un plat pour vous deux.
4. Ce qui diffère n'est pas cuisiné à part, c'est **écrit** : chacun reçoit sa ligne de service.
5. « Plus de féculents dans cette part. » « Plus de légumes dans cette part. »
6. En mots — aucun écran ne vous rend un gramme.
7. Six objectifs, six directions de service ; la vôtre décide du sens de votre part.
8. L'autre est dans le plan **avec ou sans compte** : un seul de vous deux a besoin de s'en occuper.
9. Pour son propre accès, le profil réclamé coûte 2 € par mois ; le compte qui ouvre le foyer n'est jamais compté.
10. Quand la soirée tombe, quatre réponses — et rien ne choisit un nouveau plat à votre place.
11. Il n'y a pas de courbe de poids, pas de balance à ouvrir le matin.
12. 12,99 € par mois pour le foyer. On commence ici.

---

## 3. Les décisions, et pourquoi

**D1 — La figure centrale annote en MOTS, et les deux assiettes sont le même
élément.** `<use href="#cpl-part">` appelé deux fois : la promesse « c'est le même
plat » est tenue par la **structure du fichier**, pas par la vigilance du
relecteur. Des secteurs de tailles différentes auraient affirmé par la géométrie
une mesure qui n'atteint jamais l'écran (§5.3).

**D2 — L'exemple de la figure n'est pas inventé : c'est le moteur.** En
relisant `household_portions.ts:125-151` pour ne pas sur-promettre, j'ai trouvé
que mes deux annotations correspondent aux consignes réelles —
`muscle_gain` = *« larger protein and starch share »* → « plus de féculents » ;
`fat_loss` = *« generous vegetables »* → « plus de légumes ». Et les six objectifs
portent bien **six chaînes distinctes** : « six directions » est exact, pas une
bijection supposée (`health` a cessé de rendre la chaîne de `maintenance` le
2026-08-11, exprès).

**D3 — Aucune maquette d'écran produit sur cette page.** Tentant, puisque la
phrase de service atterrit sur `/app/household`. Mais `household` n'est **pas**
dans `PUBLIC_NAMESPACES` : l'écran réel affiche « At the table » **en anglais
même à un visiteur français**. Une maquette honnête aurait posé une chaîne
anglaise au milieu d'une page de vente française ; une maquette traduite aurait
montré un écran qui n'existe pas (S10). Les trois figures sont donc des concepts
et des fiches — ce que la charte §7 donne de toute façon comme famille dominante
pour les pages foyer.

**D4 — L'ordre des sections est le trajet d'un doute, pas un sommaire.**
Objection 1 dans le hero, objection 2 en section 2, « on tiendra quinze jours »
en section 3. Et **l'honnêteté avant le prix** : qui a lu ce qu'on ne fait pas et
lit le prix ensuite achète en sachant.

**D5 — Aucun pronom personnel pour désigner le partenaire.** Le français n'a pas
de « they » singulier ; un « il » par défaut fige exactement le rôle de genre que
le brief interdit. Toutes les phrases sont écrites sans pronom (« l'autre »,
« son objectif », « le compte qui ouvre le foyer »), et la figure étiquette les
assiettes par l'**objectif**, jamais par la personne.

**D6 — Le CTA est local, et c'est temporaire.** `ui/Button.tsx` porte encore
`bg-gray-900` pour `variant="primary"`, d'avant la charte. Plutôt que de livrer un
CTA gris sur une page figue, ou de parier sur l'ordre des utilitaires Tailwind
entre `bg-gray-900` et `bg-fig-700`, `StartLink` reprend la forme exacte de
`buttonClass` avec la couleur de la charte. **Il se supprime le jour où la
primitive passe à `fig-700`** — c'est écrit dans le fichier.

---

## 4. Ce que la vérification a trouvé, et qu'aucune relecture n'aurait vu

J'ai bâti deux bancs plutôt que de me relire. `CouplesPage.tsx` ne peut pas être
rendue par le serveur de dev (pas de route, et `t()` lèverait sur des clés qui
n'entrent dans `en.ts` qu'à l'intégration) — donc les bancs **extraient les
figures depuis le TSX** au lieu de les recopier : une figure écrite deux fois est
une figure qui diverge à la première correction.

| # | Trouvé | Correction |
|---|---|---|
| 1 | **2 débordements de la grille de 480**, invisibles à l'œil : « une part plus généreuse » sortait de **12 unités** (FR) et « a more generous share » de **3,6** (EN). | Les deux annotations réécrites sur un cadre parallèle — même phrase, un seul mot qui change : « plus de féculents / dans cette part » et « plus de légumes / dans cette part ». Plus court, plus lisible, et le contraste est porté par le seul mot qui diffère. |
| 2 | **La légende de la figure atterrissait sous la colonne de gauche**, à ~600 px de ce qu'elle annote, où elle se lit comme une ligne de corps de plus. | Déplacée dans la colonne de la figure, et **hors** du `fig-scroll` — dedans, elle aurait hérité du plancher de 380 px et défilé avec la figure. |
| 3 | **`PriceCard` rend « 12,99 € » en « 1 2,99 € »** : `tabular-nums` + Young Serif = 139,9 px contre 128,2 px sans, soit 11,7 px de trou après le « 1 ». La justification écrite (« deux cartes côte à côte alignent leurs virgules ») est morte : la même primitive interdit une seconde carte. | **Hors de mon périmètre** (primitive partagée, toutes les pages). Signalé à l'orchestrateur, et une tâche a été ouverte. |

**Mesures finales :** 52 textes de figure mesurés dans les deux langues avec les
vraies polices → **0 débordement**, boutons compris. À **320 px** : la page ne
défile pas en largeur, **0 élément hors cadre** en dehors des `fig-scroll` (qui
débordent exprès, c'est le plancher de lisibilité), le `h1` tient dans les 280 px
utiles.

**Liste F1-F14 de la charte :** aucune décimale, aucune Bézier, aucun
`opacity`/`filter`/dégradé/ombre, aucune couleur d'état, épaisseurs `1` et `2`
seulement, `<title>` **et** `<desc>` sur les trois figures, un seul `<h1>`.
⚠️ Le contrôle F8 rend **4** sur le fichier et non 2 : `FigCorner` est l'équerre
**partagée** par les trois figures. Chaque figure **rendue** en porte bien deux —
son équerre et son unique objet chaud. C'est noté dans l'en-tête du fichier.

---

## 5. Mes claims, et leur identifiant d'audit

| Claim sur la page | Audit | Ancre citée en JSX |
|---|---|---|
| La semaine du foyer est faite de **sessions de cuisine** | **C3** | `meal_generation.ts:518` · `CookingSessions.tsx:48` · `KitchenToday.tsx:281` |
| Un plat, et **pour chacun la part qui va avec son objectif** | **C4** | `household_portions.ts:125,480` · `household_composition.ts:418` |
| **Six objectifs, six directions** de service | **C4** | `household_portions.ts:125-151` — six chaînes distinctes |
| La ligne de service **apparaît sur l'écran du foyer**, en mots | **C4** | `HouseholdPage.tsx:1838-1855` |
| **Aucun écran ne vous rend un gramme** | **C4**, trou nommé | FF-043 §11 n°1 — `member_deltas` n'a aucun écran |
| L'autre est dans le plan **avec ou sans compte** | **C8** | `20260810260000:179-190` (`user_id = null`) · `household_portions.ts:63-72` |
| **2 €/mois** le profil réclamé ; **12,99 €** le foyer ; maître **jamais compté** ; **huit bouches** | **C1** | `20260810260000:235-250` et `:101-105` |
| Ce qu'on demande pour ajouter l'autre : prénom, date de naissance, objectif, allergies | **C14** | `onboarding.ts:650-662` — **sans durée**, C14 n'est pas prouvé |
| **Quatre réponses** quand la soirée tombe ; rien ne choisit un plat à votre place | **C7** | `accident.ts:995-1004` · `:52-55` · `deterministic_buttons.ts` |
| **Pas de courbe de poids**, pas de balance | **C16** | `20260812220000:118` — une ligne écrasée, aucune courbe |
| Les chiffres **éteints par défaut**, **quatre verrous** pour les allumer | **C15** | `20260812230000:60` · `energy_gate.ts:228-249` |
| À l'inscription vous dites combien vous êtes ; **le parcours à deux existe** | **C13** | `onboarding.ts:84` `FunnelBranch` · `App.tsx:220` |
| L'inscription **ouvre quand le programme du coach maison est publié** | **§10** | `keel_free_signup_available` |

### Ce que la page ne dit pas, exprès

**Aucun gramme** (§5.3) · **aucun « garanti »** — `reconcilePortions` accepte
quatre consignes identiques sans lever d'`issue` · **aucune durée d'essai, aucun
bouton d'achat** (§8 n°1) · **aucun « échangez un plat »** (§5.1, C6 = FAUX) ·
**aucun « jamais de calories »** (§8 n°2) · **aucun « rien à ouvrir / rien à
installer »** sous quelque forme (S4) · **aucun chiffre sans source dans le
dépôt** (S8) · **aucun rôle de genre figé**.

---

## 6. Pour l'orchestrateur

1. **`couples` va dans `PUBLIC_NAMESPACES`** (`i18n/catalog.ts`), pas dans
   `PUBLIC_NAMESPACES_PENDING_TRANSLATION` : le FR est livré.
2. Les 66 clés sont à fusionner dans `en.ts` **et** `fr.public.ts`. Aucun trou
   d'interpolation des deux côtés — la parité est triviale à tenir.
3. **`StartLink` est à supprimer** au profit de `ButtonLink variant="primary"` dès
   que `ui/Button.tsx` passe à la charte (voir D6).
4. **`PriceCard` a un défaut visible** : voir §4 ligne 3. Il touche toutes les
   pages, pas seulement celle-ci.
5. Les bancs (`build-figs.py`, `build-page.py`, `verify-*.html`) restent dans le
   scratchpad. Ils **relisent le TSX** : ils redeviennent justes après une édition
   de la page, il suffit de les relancer.
