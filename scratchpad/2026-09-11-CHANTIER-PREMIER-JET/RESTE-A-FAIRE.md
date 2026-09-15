# Ce que ce chantier laisse ouvert — liste tenue à jour

## ⛔ Demandé par le propriétaire le 2026-09-11 au matin

### R0 · Découper `generate-household-meal-v1/index.ts`

**15 714 lignes dans un seul fichier.** C'est le plus gros frein du dépôt, et il se paie à
chaque lot :

- le lot E ne peut pas tourner **en même temps** que les autres — un seul agent peut écrire
  dans ce fichier, donc tout ce qui le touche se met en file ;
- `plan_repair_loop.ts` est écrit, éprouvé, et **n'est branché qu'à moitié** ; son propre
  commentaire de tête dit pourquoi : « une refonte du corps du générateur, pas un
  rebranchement » ;
- la pesée a dû être « remontée au-dessus des rattrapages » par un déplacement de ~1 700 lignes
  (2026-09-11, lot 6) — un ordre d'exécution dans un fichier tenait lieu d'architecture ;
- `PLAN_REPAIR_RESERVED_AFTER` accordait des slots de rattrapage « dans l'ordre d'exécution du
  fichier » : déplacer un bloc rendait la table fausse **en silence**.

Ce n'est donc pas une question de goût : la taille du fichier **produit** des défauts mesurés.

**À faire dans un lot à part, après ce chantier**, et surtout pas pendant — découper pendant
qu'on change le comportement rendrait impossible de dire lequel des deux a cassé quoi.

Pistes de découpe, à valider : admission et contexte · construction du brief · appel modèle et
repli · parsing et gardes de sécurité · pesée et dimensionnement · boucle de réparation ·
application, boîtes et courses · écriture et réponse HTTP.

**Mesuré le 2026-09-11 06:18, et c'est pire que « un gros fichier » :** le fichier ne contient
que 14 déclarations de premier niveau. Les ~730 premières lignes sont des imports et des
constantes, une poignée d'aides suivent, puis **une seule fonction** :

```
1207:Deno.serve(async (req) => {
```

… qui va jusqu'à la fin. **Le corps de ce handler fait à lui seul ~14 500 lignes.** Il n'y a
donc rien à « ranger » : il faut extraire des fonctions d'un bloc unique, ce qui veut dire
nommer ses états intermédiaires — c'est le vrai travail, et c'est pour ça qu'il mérite son
propre lot.

## R1 · Le banc d'intégration à réponses contrôlées n'existe pas encore

Le §4 du chantier demande : « réponses fournisseur contrôlées passant par les vrais handlers
jusqu'au payload persisté ».

**Ce qui existe** (`_shared/gemini.ts:421-436`) : `MEGA_TEST_MODE=1` — actif **implicitement**
dès que la pile est locale — rend un texte bidon `MEGA_TEST_STUB: <200 premiers caractères de
la demande>`. C'est un stub de disponibilité, pas une réponse **contrôlée** : le parseur le
rejette, donc rien n'atteint le payload persisté.

**Ce qui manque** : pouvoir donner une réponse JSON précise (par exemple les six réponses déjà
archivées) à la place de l'appel fournisseur, par `source` et dans l'ordre — pour scripter
« génération, puis réparation 1, puis réparation 2 » sans payer un jeton.

**Contrainte** : l'isolat edge tourne dans Docker ; il ne lit que sous l'arbre des fonctions. La
réponse en conserve devrait donc vivre sous `supabase/functions/**`, et **être écrite avant** le
départ du run (écrire pendant tue le run — mémoire
`editing-functions-tree-kills-inflight-edge-runs`).

**Garde obligatoire si on le construit** : la branche ne doit exister QUE sous `MEGA_TEST_MODE`
déjà actif, et refuser tout runtime qui n'est pas la pile locale. Un chemin capable de servir
une réponse en conserve en production serait pire que l'absence de banc.

Tant que ce banc n'existe pas, « jusqu'au payload persisté » se prouve **soit** par un vrai
appel payant, **soit** par le rejeu hors ligne de `scratchpad/2026-09-11-ENQUETE-DEUX-DIRECTIONS/`
— qui s'arrête avant la fusion, les gardes de sécurité et l'écriture HTTP, et le dit.

## ✅ FERMÉE — la déduction du garde-manger contre l'audit des achats (2026-09-12)

**Fermée le 2026-09-12 par la fermeture du lot 2.**
`rebuildShoppingQuantities` rend désormais `pantryCoveredG` — les grammes crus
que le stock a couverts, par identité — et `shoppingIdentityAudit` le **retranche
de `neededRawG`** avant de juger. Les deux modules lisent le même besoin net.
`ShoppingAudit.pantryNetted` compte les identités nettoyées : à zéro, les deux
lisaient déjà la même chose (le cas nominal tant qu'aucun écran n'envoie de
garde-manger). Deux cas dans `shopping_c3_test.ts`, dont un qui prouve que le
défaut se reproduisait sans la carte.

⚠️ Le paramètre est **requis**, `Map` vide pour « rien de déduit » : un `?`
aurait fait de l'oubli la réponse silencieuse de tous les appelants, et ce
défaut-là n'a aucun symptôme visible tant qu'aucun écran n'envoie de
garde-manger — c'est-à-dire jusqu'au jour où il en envoie un.

Ce qui suit est le texte d'origine, gardé parce qu'il dit ce que la mine était.

<details>
<summary>La mine, telle qu'elle était écrite</summary>


`rebuildShoppingQuantities` déduit désormais le stock **de quantité connue**
déclaré au garde-manger : une ligne d'achat peut donc porter MOINS que le besoin
de la recette, légitimement.

`shoppingIdentityAudit` (`final_plan_audit.ts`) compare, lui, les grammes
achetés au besoin **entier** et rend `ingredient_short_bought`. Une déduction de
stock devient donc un défaut d'achat — c'est-à-dire le défaut que le lot 1 ferme,
déplacé d'une porte.

**Inatteignable aujourd'hui, et c'est la seule raison pour laquelle ce n'est pas
un bug ouvert :** `planDraft.ts` n'envoie pas `pantry` (retiré de
`ComposeDraftInput` le 2026-09-10), aucun écran ne le remplit, `askedPantry`
vaut `[]`. `pantry_lines: 0` dans le journal le dit.

**À faire AVANT d'ouvrir un écran de garde-manger :** `shoppingIdentityAudit`
doit recevoir les quantités de stock (pas `pantryTerms`) et retrancher le même
stock de `neededRawG`. Deux lecteurs qui ne retranchent pas la même chose, c'est
exactement le couple `demandByTerm` / classe de ligne que C3 a dû démonter.

</details>

## ⚠️ LE RÉFÉRENTIEL NE DIT PAS LA CONSERVATION (2026-09-12, lot 3)

> ⟳ **2026-09-12, fermeture du lot 2 — la DIVERGENCE est fermée, la LACUNE
> reste.** La datation et la garde finale lisent maintenant la **même**
> conservation (`keepingOf`, `_shared/keel/food_keeping.ts`) : une conserve n'a
> plus de fenêtre des deux côtés, et le refus `perishable_bought_too_early` est
> réarmé en `refuse`. Ce qui reste vrai, et qui suit, c'est que le référentiel
> ne porte toujours pas la conservation : `SHELF_STABLE_SLUGS` est une
> énumération, et un aliment de conserve ajouté demain repart au frais tant que
> personne ne l'y inscrit.


`food_composition_refs` n'a **aucune colonne de conservation**. `tuna_fresh` et
`tuna_tinned` y portent le même `food_group_ref = white_fish`.

Depuis que le modèle n'écrit plus la liste de courses (lot 1), le **rayon** de
chaque ligne est dérivé du groupe — et le rayon décide de la **date d'achat**
(`PERISHABLE_AISLES`, `grocery_waves.ts`). Conséquence mesurée sur le tir 3 réel
du 2026-09-12 : le thon en conserve est parti au rayon `protein`, a été déclaré
périssable, et la garde a **refusé le plan** avec une phrase fausse.

**Rustine en place :** `SHELF_STABLE_SLUGS` (`shopping_identity.ts`), une
énumération de deux slugs — les deux seuls que le référentiel local marque
explicitement (`tuna_tinned`, `chickpeas_tinned`). `shopping_shelf_stable_test.ts`
la tient.

**Le vrai correctif :** une colonne de conservation dans `food_composition_refs`
(`shelf_stable boolean`, ou une durée). Tant qu'elle n'existe pas, tout aliment
de conserve ajouté au référentiel repart au frais **en silence** — la liste ne
peut pas deviner un slug qu'elle ne connaît pas, et un motif sur le slug serait
un matcher maison (12 faux positifs sur 12 mesurés dans ce dépôt).

**Contrôle à relancer après toute croissance du référentiel :**

```sql
select slug, food_group_ref from food_composition_refs
where slug ~ '(_tinned|_canned|_jarred|_in_brine|_in_oil|_dried)$'
order by food_group_ref, slug;
```

Au 2026-09-12 il rend exactement deux lignes, toutes deux dans la liste.

---

## ⟳ 2026-09-13 — CE QUE LA FERMETURE DES RÉPARATIONS DE FOYER LAISSE OUVERT

Le chantier est rendu dans
[`docs/keel/RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md`](../../docs/keel/RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md).
Quatre choses restent, et aucune n'est un oubli.

### ① ✅ FERMÉ — le modèle écrit le patch, et la session

Cinq appels de réparation réellement facturés le 2026-09-13. Le modèle rend la
racine `{"repair":…}` et rien d'autre, échoue `base_version`, remplit les champs
nommés, et **emploie l'opération `sessions` de lui-même**. Une réparation a été
**adoptée** (N=1 : 6 défauts → 4, `safety_added: 0`, plan écrit). Le mode payant
du banc existe (`--reparation-reelle=<n>`, plafond tenu dans le transport).

**Ce qui reste ouvert là-dessous :** à deux et à quatre bouches, la réparation
du modèle est rejetée — il réécrit tout le périmètre et retire un repas à
quelqu'un (`mouth_unfed: 2` à N=2 ; 40 → 74 défauts à N=4). La garde fait son
travail ; c'est la compétence du modèle sur un périmètre large qui manque, et
aucune ligne de code de ce dépôt ne la répare.

### ② Il n'existe pas de réponse en conserve écrite pour quatre bouches

La fixture du banc est un plan réel composé pour UNE personne. Jugée contre une
table de deux ou quatre, elle porte des écarts de densité et de plancher
protéique résiduels : les tirs N=2 et N=4 dépensent donc leurs deux
réparations, et « premier jet valide, zéro réparation » n'est pas mesurable à
ces tailles. Les plans partent quand même (200, `deliverable_with_gaps`).

### ③ ✅ FERMÉ — l'instrument lit bien les sorties du banc

Il fallait passer par `scratchpad/2026-09-11-CLOTURE/figer-demande.ts`, qui
convertit une sortie de banc en demande figée. Les mesures par
personne-date-créneau sont publiées dans le rapport § 3.6. La remarque ajoutée
le 2026-09-13 dans `docs/keel/mesure.md` disait le contraire : elle est
corrigée.

### ④ La couverture française du matcher d'allergène — toujours ouverte

`allergen_ref='peanut'` ne mord pas sur « beurre de cacahuète » ; elle mord sur
« peanut butter ». Les tirs de sécurité emploient donc le terme anglais
(`--allergene-terme=`). Ce n'est pas un défaut de ce chantier — c'est le
lexique de `allergen_surface_forms.ts`, et il est nommé depuis le 2026-09-12.


### ⑤ ⟳ 2026-09-13 (second passage) — LE § 3.1 DU PLAN N'EST PAS EXÉCUTÉ

Les trois foyers de référence demandés (N=1 avec apport fixe et repas léger ;
N=2 avec plat partagé ET plat dédié ; N=4 avec lot commun sur plusieurs
créneaux et plat dédié — 6 / 12 / 24 portions) **n'existent pas**. Les rosters
existent ; le PREMIER JET correspondant, non : la réponse en conserve du banc
est un plan composé pour une seule bouche.

Conséquence : « premier jet valide, zéro réparation » n'est atteint à aucune
taille, et cinq cas nommés du § 3.2 restent non mesurés (validation en panne,
variante d'isolement, adoption d'une unité créée à N=4, double comptage d'un
complément, écart résiduel visible par bouche).

**Ce qu'il faudrait, et ce qu'il ne faut pas faire :** trois premiers jets
composés PAR LE MODÈLE pour ces trois tables, figés une fois et réutilisés.
⛔ Pas trois plans écrits à la main : ce serait écrire nous-mêmes la réponse
qu'on prétend mesurer. Le tableau d'état du rapport
(`docs/keel/RAPPORT-FERMETURE-REPARATIONS-FOYER-2026-09-13.md` § 6) marque
chaque ligne.
