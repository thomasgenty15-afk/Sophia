# `/families` — rapport de refonte « par la douleur »

> Constructeur 3 · 2026-08-13 · branche `ff-001-quotidien-du-coach`
> Livrables : `frontend/src/keel/pages/FamiliesPage.tsx`,
> `frontend/src/keel/i18n/drafts/families.en.ts`,
> `frontend/src/keel/i18n/drafts/families.fr.ts`.
> **Rien n'est commité.**

---

## 1. Le poids — avant / après

| mesure | avant (`en.ts` à HEAD) | après (`drafts/families.en.ts`) | delta |
|---|---|---|---|
| **mots rendus (EN)** | **1043** | **560** | **−46,3 %** |
| mots rendus (FR) | — | 624 | — |
| clés | 97 | 67 | −31 % |
| sections de page | **8** | **4 bandes** | −50 % |
| figures | 6 | **4** (une par bande) | — |
| lignes de `FamiliesPage.tsx` | 490 | 518 | +28 |

Le fichier de page **grossit de 28 lignes alors que la page maigrit de 483
mots** : le commentaire d'en-tête a été réécrit et allongé (il porte
maintenant l'arbitrage d'ordre, la carte des quatre bandes et le pourquoi de
la figure monochrome), et chaque claim porte son ancre en commentaire JSX.

Commande de comptage : celle du §9 du socle, exécutée sur
`drafts/families.en.ts` et sur `git show HEAD:frontend/src/keel/i18n/en.ts`.

### ⚠️ Un écart avec le socle, signalé et non corrigé

Le tableau du socle §3 annonce **« 1 figure »** pour `/families`. Le code à
HEAD en portait **six** (`PotFigure`, `GateFigure`, `SheetFigure`,
`AgeFigure`, `EnvyFigure`, `PriceFigure`). Conformément au §11 (« si la grille
et le code se contredisent, le code gagne »), la consigne « passer de 1 à au
moins 3 » a été lue comme **« une figure par bande, et qu'elle porte
l'argument »** : la page passe de six figures dispersées à **quatre figures
qui portent chacune une douleur**. Deux figures ont donc **fusionné** plutôt
que d'être ajoutées.

---

## 2. La forme livrée

```
BANDE 1  bg-paper     « On mange quoi ce soir ? »       + fig_table
BANDE 2  bg-fig-950   La charge (le SEUL bloc sombre)   + fig_union
BANDE 3  bg-paper     Les enfants                       + fig_age
BANDE 4  bg-paper-2   Le prix, et la sortie             + fig_price
```

Un seul `<h1>`, trois `<h2>`, pas de saut de niveau. Un seul bloc sombre. Un
seul CTA (`/start`), répété deux fois, même libellé.

### L'arbitrage central : l'allergie descend en position 2, en conséquence

La page ouvrait sur **« L'allergie d'une seule bouche gouverne toute la
casserole »** avec une section n°2 titrée **« Le refus »**. Les deux ont
disparu comme manchette. La bande 1 ouvre désormais sur la question du soir ;
la garde d'allergie arrive dans la **bande 2**, en **troisième phrase**, comme
la conséquence de « vous ne l'écrivez qu'une fois » :

> *« Ce qu'une seule bouche ne peut pas manger gouverne alors toute la
> casserole. Et quand cet ensemble ne peut pas être lu, rien n'est composé :
> Sophia s'arrête plutôt que de deviner. »*

Le refus n'est pas perdu — il devient **la preuve** que « écrit une fois » veut
dire quelque chose, au lieu d'être le moteur d'achat. C'est ce que la grille
demandait (⚠️ « ceinture de sécurité, pas moteur d'achat ; ouvrir dessus vend
par la peur à une minorité »).

---

## 3. Ce que j'ai coupé, section par section, et pourquoi

| section d'origine | sort | pourquoi |
|---|---|---|
| **`Hero`** (l'allergie en manchette) | **réécrit** → `hero.*` de la bande 1 | La douleur 01 de la grille n'est pas l'allergie, c'est la question du soir. Titre, chapô et figure entièrement neufs. |
| **`Refusal`** (7 clés, dont un `body` de 62 mots) | **fusionné dans la bande 2** ; `refusal.title`, `refusal.body`, `refusal.line`, `refusal.kicker` **supprimés** | Le mécanisme est désormais **dessiné** (`fig_union`) et résumé en une phrase (`load.consequence`). Le paragraphe qui expliquait « ce que veut dire fail-closed » était la figure ratée. La ligne d'aphorisme (« Un plan qui manque se redemande… ») était belle mais c'est de la rhétorique, pas un fait : coupée. |
| **`Mouths`** (`mouths.title` + `body` de 55 mots) | **fusionné dans la bande 2** → `load.body` (23 mots) | Même claim (C8/C14), un tiers des mots. Les quatre champs sont désormais une énumération, pas une explication. |
| **`Portions`** | **conservé** comme bande 3, réécrit plus court | `portions.body` faisait 58 mots ; `age.body` en fait 26. La partie coupée (« pas d'écran, pas de réglage, pas de chemin pour la contourner ») est **dessinée** par la barre de la figure. |
| **`Envy`** (4 clés + figure de 6 clés) | **réduit à UNE ligne** (`hero.note`) et **replié dans la figure de la bande 1** | Consigne : l'envie n'a pas de bande à elle. `EnvyFigure` (une ligne qui s'ouvre sur 7 jours) est devenue le **haut** de `fig_table`. |
| **`Pricing`** | **conservé** comme bande 4, `price.body` de 51 → 21 mots | « Ajouter une bouche ne change pas le prix » disait déjà ce que le titre dit ; « le produit ne vous fait pas payer d'être une famille » est de la posture. |
| **`NotPromised`** (bloc sombre, 8 clés, 6 items) | **SUPPRIMÉ comme bande**, replié en **3 réserves** | Voir §4. |
| **`Closing`** (4 clés) | **fusionné dans la bande 4** | Le CTA et les quatre champs y étaient répétés une troisième fois. La bande 4 porte le prix, la réserve, et le geste. |

**Clés supprimées sans remplacement (les 30) :** tout `families.refusal.*`,
`families.mouths.*`, `families.envy.*`, `families.closing.*`,
`families.limits.*`, `families.fig_gate.*`, `families.fig_sheet.*`,
`families.fig_envy.*`, et `families.fig_pot.*` (absorbé par `fig_union`).

---

## 4. L'honnêteté n'a pas été perdue — où sont passés les six « limits »

| ancien item | verdict | destination |
|---|---|---|
| `limits.i1` — la garde ne couvre pas le chat | **conservé** | `load.reserve`, sous la figure de la bande 2 |
| `limits.i2` — aucune courbe de poids | **conservé** | `age.reserve` (fusionné avec i3) |
| `limits.i3` — chiffres éteints par défaut | **conservé** | `age.reserve` |
| `limits.i4` — « il n'y a pas de conseil de famille » | ⛔ **SUPPRIMÉ** | voir §6 |
| `limits.i5` — aucune application mobile | **conservé** | `price.reserve` |
| `limits.i6` — aucune promesse médicale | **conservé** | fin de `load.reserve`, collé au sujet allergie |

Le mot **« partout »** n'est écrit nulle part, et la page le **dit** :
*« …et c'est pour ça que le mot « partout » n'est nulle part ici. »*

---

## 5. Mes claims et leurs ancres

| # | claim rendu | ancre d'audit | ancre de code (en commentaire JSX) |
|---|---|---|---|
| 1 | un plat, une cuisson, la part de chacun | **C4** (PARTIEL) | `household_portions.ts:125,480` · `household_composition.ts:418` |
| 2 | l'unité est la session de cuisine | **C3** | `meal_generation.ts:518` |
| 3 | une ligne d'envie, écrite par le maître, lue par le générateur | **C12** | `keel_household_submit_envy` · `generate-household-meal-v1:1579-1589` |
| 4 | les parts se disent en mots, jamais en grammes | **C4 réserve** | FF-043 §11 n°1 |
| 5 | 12,99 €/mois le foyer ; le vôtre jamais compté | **C1** | `20260810260000_household_billable_profiles.sql:235-250` |
| 6 | plafond 8 bouches | **C1** | `20260810260000…:101-105` |
| 7 | profil réclamé à 2 €/mois, seul supplément | **C1** / FF-048 | idem `:235-250` |
| 8 | quatre champs par bouche | **C14** | `onboarding.ts:650-662` |
| 9 | les enfants sont dans le plan sans compte ni écran | **C8** | FF-044 · `20260810260000…:179-190` (`user_id = null`) · `household_portions.ts:63-72` |
| 10 | l'union est fail-closed : illisible ⇒ rien n'est composé | **C9** | `generate-household-meal-v1:1643-1648,1674-1680` (503) · `household_safety.ts:201` |
| 11 | `safety_constraints_unreadable` (cité dans la figure) | **C9** | idem |
| 12 | la garde ne couvre pas la réponse du chat | **C9 trou** | `run.ts:2211` · FF-046 §7 trou n°8 |
| 13 | un mineur n'est jamais une cible ; refus **à la fabrication** | **C10** | `student_age.ts:199-202` · `generate-week-plan-v1:435-457` (409) · `household.ts:115-121` |
| 14 | `minor_student` (cité dans la figure) | **C10** | `generate-week-plan-v1:435-457` |
| 15 | aucune courbe de poids dans le foyer | **C16 / S6** | `household_member_bodies`, `20260812220000:118` |
| 16 | chiffres éteints par défaut, chaîne de gardes, « mineur » en fait partie | **C15 / C15b** | `20260812230000:60` · `energy_gate.ts:228-249`, verrou `:239` |
| 17 | aucune application mobile | **C17** | absence confirmée (ni `capacitor.config`, ni `app.json`, ni `android/`) |
| 18 | le CTA est `/start`, branche `family` | **C13 / §10** | `onboarding.ts:84` `FunnelBranch` |
| 19 | Sophia ne remplace ni une étiquette ni un médecin | non-claim délibéré | — |

**Aucun claim sans ancre. Aucune ancre sans claim.**

---

## 6. Ce que j'ai refusé d'écrire

1. **Le conseil de famille — et même son démenti.** L'ancien `limits.i4`
   écrivait *« il n'y a pas de conseil de famille : personne ne vote, et le
   plan ne vous rend pas compte de ce qu'il a fait de votre ligne »*. Mon
   prompt dit : *« Ne l'écris sous aucune forme. »* **Démentir un mécanisme
   que le lecteur n'a jamais réclamé, c'est le lui suggérer** — et la page ne
   le promet nulle part, donc le démenti n'avait plus de cible. Supprimé.
   (C11 · FF-050 §3 · `index.ts:3088-3092` ne rend pas `envy_line_used`.)
2. **« Partout » / « dans chaque réponse ».** Interdit par C9 et la grille.
   La page l'écrit explicitement dans sa réserve.
3. **Toute durée.** Ni « 90 secondes », ni durée d'essai, ni « en 2 minutes »
   (C14, D5, §8 n°1, §10). Le CTA dit « Créer votre foyer », rien de plus.
4. **Tout bouton d'achat / toute date d'essai** (§8 n°1). Le prix est dit ;
   aucun `Offer` dans les données structurées.
5. **« Jamais de calories »** (§8 n°2, C15). La réserve dit « éteints par
   défaut, derrière une chaîne de gardes » et **ne chiffre pas** les gardes :
   l'audit lui-même hésite entre quatre et cinq (C15b), et un chiffre sans
   source unique ne rentre pas (S8).
6. **« Rien à installer ».** L'absence d'application est **nommée**
   (`price.reserve`), jamais transformée en argument — silence S4.
7. **Une proportion dessinée.** Les quatre parts de `fig_table` et les deux
   assiettes de `fig_age` sont le **même élément SVG** appelé par `<use>` :
   aucune ne peut prendre une taille qui affirmerait un ratio. Ce que le
   produit dit d'un mineur est un **mot** — `CHILD_DIRECTION` =
   « child-size share of the same dish » (`household_portions.ts:166`) —, pas
   un rapport de tailles.
8. **« Sûr », « sans risque », « safe ».** Aucun des trois, dans aucune langue.
9. **Aucune démonstration interactive** : ce n'est pas ma page (socle §8).

---

## 7. Un défaut du catalogue anglais réparé au passage

`prices.ts` documente exactement ce défaut : *« `families.price.amount` (en) =
« 12,99 € » ← virgule décimale »*, la convention **française** servie à un
lecteur anglophone. Le pack anglais de `families` le portait encore dans trois
phrases de vente (`seo_description`, `hero.price_note`, `price.body`). Le
brouillon anglais écrit maintenant **« €12.99 »** et **« €2 »**, comme
`mealprep` et `couples`. Le pack français garde **« 12,99 € »** et **« 2 € »**
avec l'insécable.

---

## 8. Les figures — ce qu'elles portent, et les deux pièges rencontrés

| figure | bande | ce qu'elle prouve | pièce chaude |
|---|---|---|---|
| `fig_table` 480×264 | 1 | une ligne écrite par vous → une seule cuisson → quatre parts du même plat | la casserole |
| `fig_union` 480×300 | 2 | quatre bouches écrites une fois → un ensemble → deux sorties, dont « rien n'est composé » + le code | le nœud « l'ensemble » |
| `fig_age` 480×240 | 3 | l'objectif atteint l'adulte et **s'arrête** devant le mineur | la barre d'arrêt |
| `fig_price` 480×240 | 4 | huit places, un seul prix, la première jamais comptée | la case « vous » |

**Piège 1 — la figure du bloc sombre.** `.on-dark` (tokens.css) remonte
`--ill-fig` et `--ill-ink-soft` à `fig-300` (8,06:1) **mais laisse
`--ill-ink` à `#23191F`**, qui disparaît sur `fig-950`. `fig_union` n'utilise
donc **ni l'encre ni un aplat clair** : elle est monochrome, en deux
épaisseurs, et sa hiérarchie se fait à la taille. C'est écrit dans l'en-tête
de la page pour que le prochain lecteur ne la « répare » pas en y remettant
de l'encre.

**Piège 2 — mesuré au navigateur, pas supposé.** La première version de
`fig_union` posait la fourche des deux sorties à `y=166`, c'est-à-dire **au
travers de la quatrième rangée de bouches**. Invisible à la lecture du code,
évident à la capture. Rangées remontées à `y=50..174`, fourche descendue à
`y=190`.

---

## 9. Ce que j'ai vu au navigateur

⚠️ **Je n'ai pas pu démarrer `frontend-alt3` (5177)** : « Maximum 5 dev servers
per folder reached ». Les quatre passes ont été faites sur **`localhost:5178`**
(`frontend-alt4`), qui sert le même arbre de sources — le serveur d'un autre
constructeur, utilisé en lecture seule, dans un **onglet neuf** (`tab-4`) pour
ne pas déplacer sa vue. `localStorage` n'a pas été vidé ; la bascule de langue
s'est faite par l'interrupteur de la page.

| passe | résultat |
|---|---|
| **320 px · FR** | `scrollWidth 320 ≤ innerWidth 320` — **aucun débordement de page**. Les quatre figures débordent **dans leur `.fig-scroll`**, comme prévu (plancher 380 px). |
| **320 px · EN** | idem, `scrollWidth 320`. |
| **1280 px · FR** | idem. Bandes 1 à 4 relues à la capture. |
| **1280 px · EN** | idem. |
| `read_console_messages` | **aucune erreur** dans les deux langues — donc aucune clé manquante (`t()` lève en dev). |
| figures, les deux langues, les deux largeurs | **0 collision** de `<text>` (test par `getBBox()` croisé), **0 texte hors du `viewBox`**. Le français, langue longue, tient : le plus large est « L'OBJECTIF S'ARRÊTE AUX ADULTES » à 239/480 unités et « aucun objectif ne le vise » qui finit à 435/480. |
| structure | 1 `<h1>`, 3 `<h2>`, ordre sans saut ; 4 `svg[role=img]` avec chacun son `<title>` **et** son `<desc>` ; 1 seul `.bg-fig-950` ; 2 CTA `/start` au libellé identique. |
| `npx tsc -p tsconfig.app.json` | **aucune erreur sur `FamiliesPage.tsx` ni sur mes deux brouillons.** Les seuls `families.*` qui sortent sont des `TS2783` (« specified more than once ») dans `en.ts`/`fr.ts` : c'est le **mécanisme voulu** du dispositif de brouillons (le spread des drafts gagne), et ces deux fichiers ne m'appartiennent pas. |
| `eslint` | propre sur les trois fichiers. |
| garde-fous relus par grep | 0 `→` (U+2192) · 0 U+202F · 0 apostrophe ASCII dans les valeurs FR · insécable présent avant `: ; ! ? » €` et après `«` (17 occurrences) · aucune couleur d'état · aucune chaîne en dur dans le JSX · aucune clé construite par gabarit · 67 clés utilisées = 67 clés déclarées, **zéro orpheline des deux côtés**. |

---

## 10. Clés `public.*` dont j'ai besoin

**Aucune.** L'en-tête, le pied de page et la navigation sont inchangés ; la
page ne consomme que `families.*`, `PRICES.household` et `formatPrice`.

---

## 11. Deux points pour l'orchestrateur

1. **Le tableau de baseline du socle (§3) est faux sur la colonne « figures »
   pour `/families`** : il annonce 1, le code à HEAD en portait 6. À vérifier
   sur les sept autres pages avant de conclure quoi que ce soit de cette
   colonne.
2. **La correction de convention de prix du §7 vaut probablement pour
   `/home`** : `drafts/home.en.ts` écrit encore « 12,99 € a month » et
   « adds 2 € » dans le pack anglais.
