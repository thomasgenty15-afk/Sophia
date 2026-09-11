# LOT 8 · famille « Mesure/service » — inventaire avant écriture

Ligne du chantier (`docs/keel/PLAN-MOTEUR-UNIQUE-ET-PORTIONS.md`, § Lot 8) :

> riz cru/cuit, eau, préparation tirée plusieurs fois, recette très dense/peu dense,
> complément, arrondi, contenants partagés, modification finale réévaluée ;
> N = 1, 2, 4 et limite supportée.

`PORTION_SIZING_MAX_MOUTHS` **= 12** (`portion_sizing.ts:119`), et il est épinglé égal à
`HOUSEHOLD_MAX_MOUTHS` (même fichier, l. 877) par `portion_sizing_test.ts:166`.
⚠️ `frontend/src/keel/api/onboarding.ts:966` déclare un `HOUSEHOLD_MAX_MOUTHS` **= 8** :
c'est le plafond de l'ENTONNOIR, pas celui de la lane. Deux nombres, deux questions.

## Ce qui existe déjà (à ne pas dupliquer)

| Point | Déjà couvert par |
|---|---|
| riz cru → masse cuite | `portion_sizing_test.ts` « 100 g de riz CRU pèsent 260 g cuits » |
| `gramsRawOf` cuit → cru | `yield_factor_parity_test.ts` lecteurs ①③④⑤ |
| eau dans une casserole (masse) | `box_densify_test.ts` « l'eau listée à côté d'un riz est déjà dans le ×2,6 » |
| eau dans une casserole (énergie) | `preparation_energy_test.ts` (5 cas) |
| part standard ÷ tirages | `portion_sizing_test.ts` « LE FRAIS + LA CASSEROLE ÷ SES TIRAGES » |
| `potFactorOf` = moyenne | `portion_sizing_test.ts` « LE FACTEUR D'UNE CASSEROLE EST LA MOYENNE » |
| bornes hautes/basses, prix négatif | `portion_sizing_test.ts` « hors bornes », « sous le plancher » |
| complément (5 cas, invariant d'énergie) | `portion_sizing_test.ts` bloc ⑬ |
| bac = Σ, bac d'un = boîte | `portion_sizing_test.ts` LOT 10 / LOT 12 |
| remesure finale **câblée** après regrammage | `generation_context_wiring_test.ts` « LOT 5 — LE PLAN EST REMESURÉ » |
| garde N ≤ 12 / > 12 | `portion_sizing_test.ts`, `portion_sizing_lane_identity_test.ts` |

## Ce qui manquait — et qui est écrit dans `lot8_mesure_service_test.ts`

1. cru ≡ cuit **sur la part standard** (pas seulement sur `gramsRawOf`), + l'abstention sans état
2. l'eau **dans la part standard**, et le VERDICT qu'elle ferait basculer si on la comptait
3. l'eau d'une soupe (sans grain absorbant) **compte** — la règle ne déborde pas
4. **conservation** : ce que tous les plats tirent = la casserole, à N inégaux entre plats
5. un plat qui tire **deux fois** la même casserole
6. très peu dense / très dense **par la mesure réelle**, et le prix en kcal
7. le **bac de quatre à 1 040 g** avec des parts individuelles dans les bornes
8. N = 1, 2, 4, 12 sur la même recette
9. l'arrondi : grammes entiers, somme = masse remesurée
10. ⛔ **défaut épinglé** : un item de FRAIS arrondi à 0 g sort de la boîte **sans compteur**,
    là où le même arrondi sur une CASSEROLE incrémente `items_unresolved`
11. l'arrondi du complément retombe exactement sur la borne (206 cibles balayées, de 640 à 2 080 kcal)
12. la boucle mesurer → appliquer → remesurer se ferme
13. ⛔ la mutation NON proportionnelle d'après l'application rend le verdict d'avant faux
    (880 annoncés, 790 réels) — ce que `generated_from.portion_sizing.final` existe pour dire

## Nombres, dérivés à la main

- riz `grain_absorbs` ×2,6 ; 100 g crus → 260 g servis, 350 kcal, 134,6 kcal/100 g servis
- 260 g déclarés `cooked` → 260 ÷ 2,6 = 100 g crus → mêmes 350 kcal, mêmes 260 g
- lu comme du cru, ces 260 g feraient 676 g et 910 kcal (le défaut des 130 lignes cuites)
- soupe courgette 300 g (`veg_shrinks` ×0,9) + eau 500 g → 270 + 500 = 770 g, 60 kcal, 7,8/100 g
- bornes adulte dîner à 700 kcal : bmax = 700/1,0 → 700 ; bmin = min(700/1,35 ; 250) = 250
- soupe à 700 kcal : facteur 700/60 = 11,667 ; 8 983 g ; raboté à 700 g ⇒ facteur 0,909,
  prix = (11,667 − 0,909) × 60 = 645 kcal non servis
- huile 100 g = 900 kcal/100 g ; facteur 700/900 = 0,778 → 78 g, sous 250 ⇒ facteur 2,5,
  prix = (0,778 − 2,5) × 900 = −1 550 kcal (on SERT 2 250 pour une cible de 700)
- casserole 400 g de riz + 800 g d'eau, tirée par 2 plats (1 et 3 mangeurs) :
  prêt 1 040 g, par tirage 520 g ; boîtes 520 + 1 560 = 2 080 ; facteur = (1+3)/2 = 2 ⇒ 2 080. ✔
  avec Σ au lieu de la moyenne : 4 ⇒ 4 160 g, deux fois ce que la table mange

## Résultat

`deno test --allow-read --allow-env supabase/functions/_shared/keel/lot8_mesure_service_test.ts`
⇒ **16 passed | 0 failed**. Les suites voisines (`portion_sizing_test`,
`preparation_energy_test`, `box_densify_test`, `yield_factor_parity_test`) restent à
155/155.

## Le défaut épinglé

`portion_sizing.ts`, DEUX fois — `applySizingForEaters` l. 1322-1329 et `applySizing`
l. 1473-1480 :

```ts
// branche CASSEROLE
const grams = Math.round(perDraw * f);
if (grams <= 0) { counts.items_unresolved++; continue; }
// branche FRAIS
const grams = Math.round(ready * f);
if (grams <= 0) continue;              // ← aucun compteur
```

Un ingrédient frais dont la masse servie tombe sous 0,5 g est retiré du contenant
**sans qu'aucun compteur ne le dise**, alors que `fresh_scaled` l'a compté comme
multiplié et que la recette le garde. Le même arrondi sur une casserole incrémente
`items_unresolved`. Non corrigé (hors périmètre) ; épinglé par le cas ⑥.

## Ce que je n'ai PAS fait, et pourquoi

Aucun test de mutation sur un fichier de production : la frontière du lot interdit
d'écrire ailleurs que dans ce dossier et dans `lot8_mesure_service_test.ts`. La morsure
est donc établie par dérivation à la main (chaque nombre est calculé au-dessus de son
assertion) et par contre-épreuve dans le même cas (676 g / 910 kcal pour le riz cuit,
facteur 4 au lieu de 2 pour la casserole, 920 g au lieu de 520 pour l'eau), pas par
mutation du code mesuré.
