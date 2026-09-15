# Fermer le reste du parcours foyer — 2026-09-13

> ⛔ **Quatre questions, quatre réponses distinctes.** Elles ne s'additionnent
> pas, et une ligne verte sur l'une ne dit rien des trois autres.
> `⚠️` et `❌` ne se lisent pas `✅`.

Plan appliqué : « Fermer le reste du parcours foyer ». Base :
[`RAPPORT-CIBLES-ET-VALIDATION-FOYER-2026-09-13.md`](RAPPORT-CIBLES-ET-VALIDATION-FOYER-2026-09-13.md),
§ 3.5, § 4.2-4.5 et § 6.

## Les quatre conclusions, d'abord

| Question | Réponse |
|---|---|
| Le code nourrit-il le foyer avec un âge inconnu, en respectant les protections ? | ✅ **Oui.** N=4, 200, 24 contenants pour 24 cases, aucune cible inventée, aucun chiffre interdit à l'écran. |
| Isolation, complément et panne de validation fonctionnent-ils ? | ✅ **Oui**, les trois, jusqu'à l'adoption ou au refus sans publication. |
| Le brief et les contrôles protéiques sont-ils cohérents ? | ❌ **Non**, et la cause n'était pas le modèle : **une bouche végane à une table omnivore n'avait aucun canal qui fonctionne**. Partiellement corrigé, le reste est un arbitrage produit, désormais compté. |
| Le modèle sait-il réparer utilement à plusieurs ? | ❌ **NON VALIDÉ** — et ⛔ **la cause n'est pas attribuée**. Deux patches bien formés, deux candidates dégradées, correctement rejetées. Le prompt ORDONNAIT les créations que j'avais d'abord reprochées au modèle (voir § 4.3) ; l'étape où les repas disparaissent reste à localiser. |

---

## 1. Lot 1 — nourrir chaque personne sans contourner les protections

### 1.1 Le maillon, et il était pire qu'une part manquante

`supabase/functions/_shared/keel/portion_sizing.ts:1568` :

```ts
const rows = (byDish.get(i) ?? []).filter((r) => r.sized);
```

Une bouche sans cible n'entrait dans aucun contenant. **Mais le plat était déjà
multiplié pour elle** : `dishSum` compte une ligne non dimensionnée avec
`UNMEASURABLE_PORTION_FACTOR = 1`. La nourriture était achetée, cuisinée, et
rendue à personne — puis le foyer **entier** était refusé.

La voie qualitative existait depuis le lot 10, écrite dans le code : « un
mangeur sans cible ne bloque pas la table, il reçoit la recette telle quelle ».
Elle n'était **pas raccordée au couvercle**.

Avant : `own_expected 24`, `own_authored 18`, `mouth_unfed ×6`, **422 sans
écriture**. Après : `own_authored 24`, `fed 24/24`, porte `ok=true`, **200**.

### 1.2 Les trois décisions, séparées

Le lot a séparé ce qui était confondu : **est-elle attendue ?** — **peut-on
calculer sa cible ?** — **quels chiffres peut-on lui montrer ?** L'abstention à
la deuxième ne veut plus dire « cette personne ne mange pas ».

- `RecipeShareReason` est **dérivé** de `ANCHOR_REASONS` moins
  `anchored`/`clamped`, jamais recopié ; `recipeShare` est **requis et
  nullable** ; `apply.recipe_shares_by` publie le motif.
- `final_plan_gate.ts` + `plan_validation.ts` : une case `no_target` était
  comptée dans `measured_cells`, donc lue comme **un contrôle d'énergie
  RÉUSSI**. Elle en sort, et devient `not_applicable: cell_energy_no_target`.

### 1.3 Les six cas

| Cas | Résultat |
|---|---|
| N=4, âge inconnu sur un secondaire | **200** · `recipe_shares_by {age_unknown: 6}` · `own_authored 24 = own_expected 24` · `fed 24/24` |
| N=4, membre en maintien | **200** · `recipe_shares 0` (elle a une cible) · `mouths.no_direction: 1` — aucun passage forcé en perte/prise |
| Mineur connu | **200** · bande d'assiette pédiatrique `[150–450]`, plancher protéique `protected`. ⚠️ La pose de l'objectif a d'abord été **refusée par le produit** (`goal_not_for_minor`) |
| Autre protection (`no_body`) | **200** · 5 bouches · `recipe_shares_by {no_body: 6}` · `fed 30/30` |
| Présences par créneau | **200** · **22 contenants pour 22 cases**, dénominateur 6+6+6+4 |
| Part absente / recette dangereuse | **422** · `cell_without_portion ×4` et `output_lock:1` · `plans 0→0` |

**Quantités** (`measurePreparation` + `weighedReadyGrams`, fonctions de
production) : `fresh_scaled` vaut 44 dans les trois runs — **la quantité
cuisinée n'a pas bougé d'un gramme**. `pot_attribution` passe de **0,66** à
**0,98**. Aucun double comptage.

### 1.4 Ce que le lot 1 laisse ouvert

- **Le chemin SOLO a le même trou** (`portion_sizing.ts:1750`) : un titulaire
  sans date de naissance perdrait sa seule assiette. Non corrigé — le banc ne
  sait pas le poser, et le reproduire demandait un `UPDATE` direct sur un
  profil, interdit par `AGENTS.md`.
- `restriction_unknown` n'a pas été atteint en **sortie de handler** (toute
  bouche sans compte rend `no_account`) : prouvé au niveau des fonctions.

---

## 2. L'instrument : une quatrième famille, et trois faux rouges de moins

Le lot 1 a créé un rouge fabriqué. Iris, parfaitement servie, était comptée
`complète 0/6` avec `22 contrôles incomplets`, à côté d'un `calorique 0/0` qui,
lui, disait juste.

Une case dont le **contrat ne porte pas de cible** sort des trois familles
numériques et entre dans **`SANS OBJET`**. La **présence reste jugée** : un plat
ou une portion absents restent un défaut, cible ou pas.

```
Iris   calorique 0/0 · complète 0/0 · incomplets 0 · SANS OBJET 10
TOTAL  18/18 · 18/18 · incomplets 0 · SANS OBJET 10
```

⛔ La condition est « **aucune** cible nulle part », pas « cette case-ci » : une
bouche qui a des cibles caloriques et **pas** de plancher protéique reste un
contrôle INCOMPLET. Sans cette précision, le défaut ⓑ du § 3 serait devenu
invisible.

**Et un quatrième faux rouge, du même genre.** L'instrument indexait **un seul**
contenant par personne-date-créneau. Sur une case complétée — part commune plus
petit plat — il ne lisait que le complément (9 g, 2 kcal) et déclarait la case
non conforme. Les contenants d'une personne s'additionnent désormais, avec la
règle du moteur : **un seul contenant non mesurable éteint la case**. Le tir du
complément passe de faussement rouge à **24/24 · 24/24** ; les tirs connus ne
bougent pas.

Contre-épreuves : désarmer « sans objet » ⇒ 2 rouges ; remettre l'écrasement du
dernier contenant ⇒ 1 rouge.

---

## 3. Lot 2 — les parcours locaux

### 3.1 Isolation d'un lot partagé — **ADOPTÉE**

Fixture déclarée et validée par le moteur **avant** injection (porte `ok=true`,
**24/24 · 24/24**, 0 réparation), puis figée.

| bouche | avant | après | bornes |
|---|---:|---:|---|
| Lea (plat dédié) | **220 g · `under_min`** | **346 g · in_bounds** | [225–558] |
| Paul | 406 g | 412 g | [250–700] |
| Nils | 679 g | 688 g | [275–700] |
| Iris | 453 g | 459 g | [250–700] |

Verdict **`adopt`**, 6 défauts → 0, 1 réparation sur 2. **Relecture du plan
écrit en base** : le lot neuf a sa session (`cook_on=mon`, S1), l'ancien reste
pour ses quatre autres consommateurs, production = prélèvements (reste 0,00), et
les 12 identités ont **besoin = acheté** au gramme. `✅ AUCUNE INCOHÉRENCE`.

### 3.2 Complément — **ADOPTÉ**, sans double portion

```
part commune 225 g · 561,6 kcal  +  complément 9 g · 2,0 kcal  =  563,6 kcal / 234 g
prélèvement du lot commun : 5 456 g pris pour 5 463 g produits → AUCUN DOUBLE COMPTE
```

Les trois autres gardent leurs portions **au gramme** (382 → 382, 343 → 343,
573 → 573).

⚠️ **Écart nommé, non corrigé** : le partage avait décidé 216 + 9 = 225 g (son
plancher). `portion_boundary` **relève ensuite** la part rabotée
(`raised: 2, grams_raised: 14`) : l'assiette écrite fait 234 g, soit **+3,8 %**
au-dessus de la cible. C'est un demi-doublement, mesuré.

### 3.3 Panne de validation — **RÉELLEMENT EXÉCUTÉE**

Nouveau module `supabase/functions/_shared/keel/plan_publication.ts` :
`runValidation` et `decidePlanPublication`, qui reçoivent leur fonction de
validation **en paramètre requis**. La production lui passe toujours le vrai
validateur. ⛔ Aucun drapeau, aucune variable d'environnement, aucun en-tête —
épinglé par un test qui refuse `Deno.env`, `process.env` et `req.headers` dans
le module.

L'exception est levée par les **vraies fonctions de production**, avec un champ
manquant : `finalPlanGate(…, {mouths: null})` → `TypeError`,
`collectOutputSurfaces({dishes: undefined})` → `TypeError`.

| Cas | Preuve |
|---|---|
| Génération, aucun plan | `appels === []`, `ecritures === []`, `relire("plan-neuf") === null`, empreinte du magasin inchangée |
| Sans plan précédent | `fail_explicit`, 0 écriture |
| Brouillon / aperçu | `rangerBrouillon` jamais appelé |
| Avant réparation | le bloc **ne reçoit ni budget, ni tour, ni fonction de réparation** ; `askRepair` est **avant** la décision (épinglé) |
| Après une candidate | `source: "output_lock"`, la candidate n'est nulle part |
| Ancien plan actif | **relu** : `JSON.stringify(après) === JSON.stringify(avant)`, `active === true` |

**Le cas qui passe** : validateur normal + `conforme` → `publish` appelé une
fois, `ecritures === ["plan:plan-neuf"]`.

**Journal ≠ validateur.** Le `console.log` vivait dans le **même `try`** que
`finalPlanGate` : un cycle dans `JSON.stringify` refusait un plan que la garde
venait de juger propre. Les deux motifs sont désormais distincts, et une panne
de journal ne refuse plus le plan — **c'est un changement de comportement
assumé**.

### 3.4 Protéines — la cause n'était pas le modèle

**ⓐ Le prompt ordonnait un partage par boîtes qu'il n'apprenait jamais à
écrire.** Lu sur le prompt **réellement transmis** du tir réel N=2 :

```
"see A DISH OF THEIR OWN"   → 1 occurrence   (le bloc de régime y renvoie)
"A DISH OF THEIR OWN"       → 1 occurrence   (c'est LA MÊME : la section n'existe pas)
"for_member_id"             → 0 occurrence   (la clé n'est jamais enseignée)
"served PER BOX"            → 1 occurrence   (l'ordre de mise en boîte, lui, part)
```

Et le lecteur d'items n'acceptait que `grams`, une clé que seul le bloc de
schéma des boîtes nomme — bloc retiré sous ce chemin
(`household_meal_generation.ts:2458`). Résultat mesuré :

```
boxes: {"expected":8,"delivery":"none_delivered","items":0,"items_refused":8}
dishes[2].boxes["max_box"]: item "ham" has no usable grams, dropped
dishes[2].boxes["lea_box"]: item "tofu" has no usable grams, dropped
```

Le modèle avait composé **exactement** le partage demandé — jambon pour Max,
tofu pour Lea, sur quatre repas — avec la forme d'ingrédient qu'on lui enseigne
partout ailleurs. Tout a été jeté en silence, avec l'ancre protéique de ces
quatre repas.

⇒ **Une bouche végane à une table omnivore n'avait aucun canal qui fonctionne.**
Attribuer ce manque de protéine au modèle aurait été faux.

**Corrigé** : le lecteur accepte la forme d'ingrédient (`amount`/`unit` → grammes
par le **référentiel**, jamais une conversion maison), avec deux compteurs
disjoints (`items_in_grams`, `items_from_ingredient`) ; le bloc de régime nomme
la clé **à côté de son ordre** ; et le renvoi mort est fermé
(`dedicatedSectionSent`, **requis**).

⚠️ **Le correctif du lecteur ne récupère pas un gramme sur ce chemin**, et le
rejeu gratuit le mesure : sous `portion_v1`, `portion_sizing.ts:1699` fait que
**les boîtes du moteur écrasent celles du modèle**, sans condition.

**La cause profonde est un désaccord de listes**, pas une omission :
`divergingNames` (le bloc de régime) vient de `dishBearingMembers` — la règle
R4/R5 — pendant que `dishBearers`, qui décide de l'**émission** de la section,
vient de `v34DishBearers` — la grille. Ouvrir un plat dédié à qui la grille n'en
donne pas rouvrirait le budget du second plat : **décision produit**. Elle est
désormais **comptée** :

```
dish_bearing                       ["756033af…"]   ← la règle lui promet un plat
dish_bearers_taught                []             ← on ne lui enseigne rien
dish_bearing_promised_not_taught   1
```

**ⓑ Une bouche sans compte n'avait aucune enveloppe, donc aucun plancher.**
`household_bodies.ts:350` pose délibérément `latestWeight: null` pour une fiche
(« une fiche n'est pas une série »), et `meal_envelope.ts:1324` ne lit que
`latestWeight?.value`. Lea, 58 kg parfaitement lisibles, n'avait **aucun
plancher protéique nulle part** ; il valait 93 g/jour.

Corrigé **chez l'appelant** : une bouche sans `userId` ne produit aucune
enveloppe de compte, et `mouthEnvelope` fait son travail. `meal_envelope.ts` est
partagé avec la lane solo et n'a pas bougé. La fiche n'achète toujours aucun
objectif : **93 g, jamais 116**.

⚠️ Ce correctif change ce que le produit **dit** — Lea est enfin comptée, et
refusée — **pas encore ce qu'il sert** : la protéine servie est identique avant
et après, parce que le canal du § ⓐ reste fermé.

---

## 4. Lot 3 — les deux derniers appels réels

### 4.1 Ce qui a été vérifié AVANT de payer

Routage des replis fournisseur en place (`compositionFallbackModels:
["gpt-5.6-sol"]`), plafond payant tenu **dans le transport**, réserve de
finalisation présente. Le banc importe le handler directement : pas de coupure
Kong, et le code courant.

### 4.2 Parcours A — N=4, défaut local sur une casserole partagée

Référence rebâtie pour le compte, validée **indépendamment** et figée avant
injection : **24/24 · 24/24, 0 réparation, conforme**.

**Appel réel n° 1** (36,3 s) : patch **rejeté**, `payload_dropped /
ambiguous_address`.

⛔ **Et ce refus était le nôtre.** Le périmètre nommait au modèle **deux
`unit_id` à la même case pour la même bouche** — c'est écrit dans la projection
qu'il reçoit :

```
· U5 mon/lunch (efbb3deb…) — an extra dish for efbb3deb…
· U4 mon/lunch (efbb3deb…) "Tofu doré du lot commun…"
```

U5 est une unité de **complément** (réservée), U4 le plat dédié qui existe. La
clé d'adresse `jour|moment|propriétaire` les confondait. Le modèle a rendu un
patch **bien formé**, avec la **bonne `base_version`**, sur les deux unités
qu'on venait de lui nommer — et on a jeté la seconde.

**Corrigé** : la clé porte aussi « plat ou complément ». Ce que la garde
protégeait reste protégé — deux plats **servis** au même créneau se refusent
toujours (test ⑤ quater).

**Rejeu gratuit du même patch réel** (drapeau `--rejouer-tour` ajouté au banc,
qui resert une réponse archivée sans repayer) — ⛔ **AVERTISSEMENT AJOUTÉ LE
2026-09-13 AU SOIR : ce rejeu-là ne rejouait PAS le modèle.** Le crochet
`compositionPatch` du banc fabriquait un patch depuis la consigne et écrasait la
réponse archivée (`transport-lot-F.ts:511`) ; et même passé ce point, la réponse
réelle se faisait refuser `base_version_stale`. Les chiffres ci-dessous sont donc
ceux d'un patch **fabriqué par le banc**, pas de la réponse payée. Corrigé
depuis ; la conclusion qui suivait (« c'est la recette du modèle qui dégrade le
plan ») **n'était pas fondée** — voir le § 9.


```
MERGE  units [U4,U10,U5,U11] · created [U5,U11] · dishes_replaced 2 · dishes_added 2 · dropped_payloads []
JUGÉ   safety_regression · défauts 6 → 36 · missing_meal 9 · sizing 27 · safety_added 5
```

Le patch est parsé, adressé, fusionné et appliqué **sans rien perdre**. C'est la
recette du modèle qui dégrade le plan. Rejet, meilleure version restaurée,
**200** livré.

### 4.3 Parcours B — N=2, défaut partagé par les deux bouches

Référence validée et figée : **12/12 · 12/12, 0 réparation, conforme**. Défaut
injecté : 120 g d'huile d'olive sur les deux petits-déjeuners ⇒
`cell_bounds_off: 4` — deux cases × **deux bouches**, 14 défauts.

**Appel réel n° 2** (53,4 s) :

```
MERGE  units [U1,U6,U2,U3,U7,U8] · created [U2,U3,U7,U8] · dropped_payloads []
JUGÉ   safety_regression · défauts 14 → 20 · missing_meal 6 · safety_added 3
```

⛔ **CORRECTION DU 2026-09-13 (soir) — j'avais écrit ici que le modèle avait
« créé quatre unités réservées au lieu de corriger les deux petits-déjeuners ».
C'est FAUX, et c'est notre prompt qui le dit :**

```
⛔ "units" carries ONLY these unit_ids, the ones to change: U1, U6.
⛔ And these unit_ids, which do not exist yet and must be written from
   nothing: U2, U3, U7, U8.
```

Le message ordonnait la création de U2, U3, U7 et U8 — `must be written from
nothing` — et réclamait quatre accompagnements (`add ONE … side dish`, quatre
fois, sous « ONE PERSON CANNOT BE SERVED FROM THE SHARED POTS ALONE »). Le
modèle a fait **les deux** : il a corrigé U1 et U6 **et** créé les quatre unités
qu'on lui commandait. Il n'a rien élargi.

La question n'est donc plus « pourquoi le modèle a-t-il débordé » mais
**« quel calcul transforme une recette trop dense en obligation de créer quatre
compléments »**. Rejet, meilleure version restaurée, **200**.

Plan effectivement livré et relu : **12/12 calorique · 8/12 complète**,
`deliverable_with_gaps` — les quatre cases hors bornes de l'injection
subsistent, aucune autre n'a été perdue.

### 4.4 Verdict — **réparation réelle utile à plusieurs : NON VALIDÉE**

Deux appels, deux patches syntaxiquement valides et correctement adressés, deux
dégradations. Le protocole a fait exactement son travail à chaque fois :
application atomique, mesure de tous les consommateurs, rejet, meilleure version
sûre restaurée, 200 avec ses écarts annoncés.

⛔ Un patch bien formé, un HTTP 200 et le retour à l'ancien plan **ne
démontrent pas** une réparation utile. Le plan l'écrit, et ce rapport s'y tient.

**Stade exact d'échec — ⛔ AMENDÉ le 2026-09-13 au soir.** J'avais écrit que le
modèle « avait élargi son intervention au-delà du défaut ». **C'est faux** : les
deux prompts ORDONNENT les créations (`must be written from nothing` : U2, U3,
U7, U8 à N=2 ; U5, U11 à N=4) et réclament les accompagnements (quatre fois,
puis deux fois). Le modèle a obéi.

Ce qui est établi, et rien de plus : les deux candidates dégradent le plan
(5 puis 3 refus de sécurité ajoutés, 9 puis 6 repas manquants) et sont
correctement rejetées. **À quelle étape ces repas disparaissent — la
composition, le parseur, la fusion, le dimensionnement ou le contrôle — n'est
pas établi**, et l'attribuer au modèle avant de l'avoir localisé serait la faute
que ce chantier existe pour éviter.

---

## 5. Tableau d'état, exigence par exigence

| Exigence | État | Preuve |
|---|---|---|
| § 1.1 reproduire le blocage sur la bonne variante | ✅ | `avant-echec.log` : 422, `mouth_unfed ×6`, `plans 0→0` |
| § 1.1 distinguer âge inconnu / mineur / autre protection | ✅ | trois tirs distincts, trois branches |
| § 1.2 séparer les trois décisions | ✅ | `recipeShare` requis+nullable, `targetReason`, `dishMeasurable` |
| § 1.3 réutiliser la voie de portion de recette | ✅ | `recipe_shares_by`, aucun gramme inventé |
| § 1.3 contrôle non applicable ≠ succès ni échec | ✅ | `not_applicable: cell_energy_no_target` + famille `SANS OBJET` |
| § 1.3 la part participe aux quantités et aux achats | ✅ | `pot_attribution` 0,66 → 0,98 ; `fresh_scaled` inchangé |
| § 1.4 les six cas | ✅ | § 1.3 ci-dessus |
| § 2.1 isolation jusqu'à l'adoption | ✅ | verdict `adopt`, plan relu en base |
| § 2.2 complément sans double portion | ✅ | égalités numériques du § 3.2 |
| § 2.3 vraie panne de validation | ✅ | exception réelle, écritures capturées |
| § 2.4 auditer avant de changer le prompt | ✅ | `AUDIT-PROTEINES.md`, trois maillons nommés |
| § 2.4 corriger le premier maillon fautif | ⚠️ | deux corrigés ; le canal des boîtes sous `portion_v1` reste fermé, la décision produit est comptée |
| § 2.5 quantité `null` ≠ quantité mesurée | ✅ | **existait déjà** (`plan_energy_test.ts:182`) |
| § 2.5 pas de portion mesurée sur un sous-ensemble | ✅ | **existait déjà** (« un seul inbornable éteint le plat ») |
| § 2.5 `units` avec une chaîne = rejet atomique | ✅ | conservé, mesuré deux fois sur appels réels |
| § 2.5 repli fournisseur correctement routé | ✅ | `compositionFallbackModels`, avertissement bruyant |
| § 3.1 deux parcours hybrides, un appel chacun | ✅ | 2 appels, 2 sur 2 du budget |
| § 3.2 inspecter le premier avant de payer le second | ✅ | `ambiguous_address` trouvé, corrigé hors ligne, rejoué gratuitement |
| § 3.3 réparation réelle utile à plusieurs | ❌ | **NON VALIDÉE** — § 4.4 |

---

## 6. Ce que ce rapport NE prouve pas

**6.1 — Le chemin solo garde le trou du lot 1.** `portion_sizing.ts:1750` :
un titulaire sans date de naissance perdrait sa seule assiette. Le banc ne sait
pas le poser, et le reproduire demandait un `UPDATE` direct sur un profil.

**6.2 — Le partage de régime sous `portion_v1` reste sans canal.** Les boîtes du
moteur sont aveugles au régime, et le plat dédié n'est pas enseigné à qui la
règle le promet. Le mensonge du prompt est fermé et l'écart est compté ; le
canal, lui, n'existe toujours pas.

**6.3 — `portion_boundary` relève la part rabotée d'un complément.** +3,8 %
au-dessus de la cible sur le cas mesuré. Nommé, non corrigé.

**6.4 — La panne de validation n'a pas été exercée sur le handler entier.** Le
bloc d'orchestration est réellement traversé, exception comprise ; que la
production lui passe bien le vrai relevé reste une épingle de **source**.

**6.5 — Deux appels ne sont pas un taux, et la cause n'est PAS localisée.** Deux
patches réels, deux candidates dégradées. Ce n'est pas « le modèle ne sait pas
réparer » : c'est « sur ces deux essais, avec ce prompt, la candidate était
pire ». ⛔ Et le prompt commandait lui-même les créations que je lui avais
d'abord reprochées : la première apparition de chaque repas manquant dans la
chaîne reste à trouver.

**6.6 — L'instrument et le produit divergent encore sur un point.**
`2026-09-11-mesure-grille.ts` passe `latestWeight: {value: weightKg}`, ce que la
production ne fait pas : il annonce 116 g/jour de protéine pour Lea là où le
produit en dit 93.

---

## 7. Vérifications

| Commande | Résultat |
|---|---|
| `deno test --allow-all supabase/functions/_shared/keel/` | **7 204 passés · 0 échoué · 2 ignorés** (7 137 au départ du chantier) |
| `deno test --allow-all scripts/2026-09-11-mesure-grille_test.ts` | **48 passés · 0 échoué** (42 au départ) |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | passe |
| `scripts/agent-gate.sh` | **pass** — vitest 2 611 tests, 2 rouges **tolérés**, 0 hors liste ; typecheck 67 contre 68 ; `deno check` 4/4 ; eslint 0 erreur |

Aucune tolérance élargie, aucune liste de rouges tolérés modifiée.

**Vérifications adversariales** — chaque garde ajoutée a été mutée, montrée
rouge, restaurée par `cp`, et l'identité vérifiée par `sha256` :

| Mutation | Rouges |
|---|---|
| le filtre des lignes redevient `(r) => r.sized` | 3 |
| `eaters_unsized` redevient aveugle | 1 |
| `cell_energy_no_target` quitte `not_applicable` | 1 |
| « sans objet » désarmé dans l'instrument | 2 |
| le dernier contenant écrase les précédents | 1 |
| le renvoi à `A DISH OF THEIR OWN` redevient inconditionnel | 1 |
| l'adresse de patch reconfond complément et plat | 2 |
| la branche de refus technique supprimée | 5 |
| journal tombé requalifié en validateur tombé | 2 |
| une écriture placée avant la décision de publication | 2 |
| l'unité créée redevient remplaçable par adresse | 1 |
| `new_preparation_unscheduled` désarmé | 1 |

**Coût réel de ce chantier** : **2 appels de réparation facturés**, sur les 2 qui
restaient. Aucune génération initiale payante. Tous les autres tirs — une
trentaine — ont tourné sur transport contrôlé, à zéro dépense.

## 8. État du dépôt

Figé avant et après, dans `scratchpad/2026-09-13-RESTE-A-FERMER/` :
`head-AVANT.txt` (`a14c6be1`), `etat-depot-AVANT.txt` (383 fichiers déjà
modifiés par d'autres sessions), `empreintes-AVANT.txt` (1 082 fichiers),
`JOURNAL.md` et `AUDIT-PROTEINES.md`.

---

## 9. ⟳ 2026-09-13, soir — la cause est attribuée, et elle est ENTIÈREMENT la nôtre

Ce paragraphe corrige les § 4.2, § 4.3 et § 4.4 ci-dessus.

### 9.1 Le premier calcul fautif

`generate-household-meal-v1/index.ts` (ligne d'origine 12068) :

```ts
const dejaDemande = outOfBoundsN.some((x) => x.i === i);
if ((!freshOk && !potsOk) || dejaDemande) { repairs.residual_stuck++; … }
```

**Preuve, lue dans les deux tirs archivés** : `stuck_dishes: 0` et
`fresh_frozen: 0` sur les deux — donc `freshOk` était **vrai** pour chaque plat,
et la branche `(!freshOk && !potsOk)` fausse. Pourtant
`residual_stuck == residual_eaters` (4 à N=2, 2 à N=4). Seul `dejaDemande`
pouvait l'expliquer.

Et il était vrai **toujours** : depuis la fermeture C4 du 2026-09-12, ce site ne
rappelle plus le modèle, `runDensityRepair` rend `merged` sans jamais le poser à
`true`, et `measured` n'est pas remesuré entre `outOfBoundsN` et cette ligne —
**c'est le même objet**. Tout plat hors bornes était donc déclaré irréparable
**avant qu'on ait rien demandé**, et le seul geste restant offert était le
complément.

Ce que le prompt N=2 contenait alors, pour un plat **sans aucune casserole** :
« réécris la recette, vise 156 kcal/100 g » **et** quatre fois « ONE PERSON
CANNOT BE SERVED FROM THE SHARED POTS ALONE … add ONE side dish ». L'intersection
des couloirs de densité était pourtant **non vide** : Max [104–250] ∩ Lea
[112–172] = **[112–172]**, et la consigne visait 156 elle-même.

⚠️ Le second suspect (`repairabilityOf`, `dissenting === 0 ⇒ frozen`) est
**écarté par la mesure** : `fresh_frozen: 0` dans les deux tirs, il n'a rien gelé
ici. Sa sévérité reste une question ouverte, pas la cause de ces deux échecs.

### 9.2 « 6 » et « 9 » ne sont pas des repas

Chaque bouche-case est comptée **deux fois** (source `gate` + source
`upstream`). Distinctes : **3** à N=2, **4** à N=4.

**N=2 — 3 bouches-cases, toutes par le même chemin.** Le prompt ordonne quatre
créations ; le modèle obéit ; puis `meal_generation.ts:8027` **jette leur
`for_member_id`** (`is not a mouth that gets its own dish, dropped`) ; les
compléments deviennent des plats **de table** ; deux couvercles par bouche à la
même case ⇒ `unfed:double`.

⛔ Et ce `for_member_id` **n'était pas du modèle** : `plan_repair_patch.ts:1018`
l'efface et le repose depuis la table des unités. Le parseur relisait **notre
propre adresse** comme une déclaration du modèle, et la validait contre des
faits calculés pour le **premier jet**.

**N=4 — 4 bouches-cases, et le patch ne les a jamais touchées.** Le modèle n'a
écrit que `mon/lunch` et `tue/lunch`. La perte est entièrement dans notre
fusion : `complementsShared` se posait par **adresse** et tombait sur U4/U10 —
les plats que le modèle venait de réparer ; `splitPlateWithComplement` les
jugeait insolubles ; le retrait se faisait **par TITRE** (la référence porte le
même titre deux jours de suite) ; et `rows` restait figé sur la mesure d'avant,
si bien que les contenants du plat *k* étaient écrits sur le plat *k+1*.

### 9.3 `safety_added` ne désignait aucun allergène

`refusals_by_cause` est à **zéro** sur `table_exclusion_served`,
`member_exclusion_served`, `regime_forbidden_component` et `house_rule_served`.

- N=2, 3 refus : `mouth_unfed` / `unfed:double` — la bouche nommée sur deux
  couvercles à la même case.
- N=4, 5 refus : 4 × `mouth_unfed` / `unfed:not_named` + 1 ×
  `cell_without_portion`.

Des repas rendus absents **par nos écritures**, classés « sécurité » parce que
`mouth_unfed` est en `severity: refuse`.

### 9.4 Ce qui a été corrigé

| Geste | Effet |
|---|---|
| `dejaDemande` **retiré** ; un complément n'est réservé que si plus rien n'est réécrivable **ou** si les couloirs de densité n'ont **aucune intersection** (`mergeCorridors`, la fonction du moteur) | N=2 : `must be written from nothing` **0** (était 1), `add ONE` **0** (était 4), périmètre « U1, U4 » — les deux plats à corriger, et rien d'autre |
| l'adresse du serveur est **reposée** après le parseur quand l'unité a un porteur | les compléments ne deviennent plus des plats de table ; `patch_owner_restored` le compte |
| `complementsShared` se pose **par identité d'objet**, plus par adresse | ne tombe plus sur un plat réparé |
| `unsolvable_titles` → `unsolvable_cells` (`jour\|moment\|porteur`) | un titre ne désigne pas un plat |
| `rows` **rafraîchi** après le retrait et la remesure | les contenants ne se décalent plus d'un plat |

**Mesuré après correctif** — N=4 : candidate **adoptée**, défauts **4 → 0**,
porte finale `ok: true · refusals 0 · conforme`, **24/24 bouches-cases
nourries**, `pot_attribution ratio 1`. N=2 : `reserved: 0`, `complements: 0`,
`residual_recomposable: 4`, statut **200**.

**La création reste possible** : `--sans-portion=mon/lunch` ⇒ `reserved: 2`,
`created: [U3, U4]`, `dishes_added: 2`, identique avant et après le correctif.

**Six mutations adversariales**, une par geste, chacune rendant exactement un
test rouge, restaurées par `cp` avec identité `sha256`.

### 9.5 Ce que ce paragraphe NE prouve pas

- **La réponse réelle n'est plus applicable** après correctif : elle adresse des
  unités qui n'existent plus (U7/U8, U11) et est **rejetée atomiquement**
  (`payload_dropped / unknown_unit`), meilleure version intacte, 200 livré. On ne
  peut donc pas montrer « la même réponse du modèle réussit maintenant ». Les
  adoptions mesurées viennent d'un patch **fabriqué par le banc** sur le nouveau
  périmètre.
- `sizing 27` et `cell_energy_off ×15` à N=4 sont reliés au décalage des
  contenants, pas vérifiés un par un.
- `repairabilityOf` (un dissident gèle le composant) : **non tranché**. Une
  baisse de densité à calories constantes pourrait servir tout le monde — c'est
  un arbitrage produit.
