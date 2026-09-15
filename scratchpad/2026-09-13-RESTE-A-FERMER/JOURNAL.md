# Journal — « fermer le reste du parcours foyer », 2026-09-13

## État figé avant le chantier

- `head-AVANT.txt` — `a14c6be1807e5454a57929b28f87eb4cff872a1b`
- `etat-depot-AVANT.txt` — 383 fichiers déjà modifiés par d'autres sessions
- `empreintes-AVANT.txt` — sha256 de 1 082 fichiers `.ts`/`.tsx` du périmètre

Point de départ vérifié : `deno test supabase/functions/_shared/keel/` rend
**7 137 passés / 0 échoué / 2 ignorés**, `agent-gate: pass`.

## Ce qui était DÉJÀ vrai avant de commencer — vérifié, pas à refaire

### § 2.5 — « une quantité perdue ne doit pas produire une portion mesurée sur un sous-ensemble »

**Déjà garanti, et déjà testé.** `plan_energy.ts` ≈ 526 :

```ts
// ⛔ UN SEUL INBORNABLE ÉTEINT LE PLAT. Ignorer celui-là et borner les
// autres rendrait une somme amputée qui a l'air d'un résultat.
if (b === null) return emptyDish("unknown_ingredient", …);
…
if (r.unweighedTerms.length > 0) {
  return emptyDish("missing_quantity", [...r.unweighedTerms].sort());
}
```

### § 2.5 — « champ présent avec `null` ne compte pas comme une quantité mesurée »

**Déjà garanti, et déjà testé.** `plan_energy_test.ts:182` : de l'huile d'olive
avec `amount: null, unit: null` à côté d'un blanc de poulet pesé rend
`kcal: null` et `gaps: ["missing_quantity"]`. Le test du `state` absent sur du
riz (facteur 2,6) et son **contre-cas qui passe** (une huile, rendement 1,0)
existent aussi.

⇒ Reste à éprouver sur ce point : **l'exception des condiments**, c'est-à-dire
que sel, poivre et herbes peuvent rester une pincée sans éteindre le plat, et
que cette exception ne s'étend pas aux aliments énergétiques.

## § 2.4 — l'audit protéique a trouvé DEUX défauts de production, vérifiés

### ⓐ Le prompt ordonne un partage par boîtes qu'il n'apprend jamais à écrire

Chaîne complète, chaque maillon relu :

1. `household_diet.ts:471` dit au modèle, **sans condition** :
   « The one component that line refuses is served PER BOX: a second entry in
   that dish's "boxes", with its own "items" — never a portion_note, never a
   dish of its own. »
2. `household_meal_generation.ts:2458` retire le bloc de schéma des boîtes
   quand `sizingPath === "portion_v1"` — et **c'est le seul endroit du prompt
   qui nomme la clé `grams`**.
3. Le modèle écrit donc la seule forme d'item qu'on lui enseigne, celle d'un
   ingrédient :
   ```json
   {"term":"ham","quantity":"6 unités de jambon","amount":6,"unit":"unit",
    "state":"raw","part":"main","ref":"ham","group":"red_meat"}
   ```
4. `meal_generation.ts:8626` n'accepte que `it.grams` :
   `if (!Number.isFinite(rawGrams) || rawGrams <= 0) { boxItemsRefused++; … }`

**Mesuré sur le tir réel N=2 du 2026-09-13** (`gain-lot3r2-…`), journal du
moteur :

```
sizing_path: portion_v1 · reason: one_mouth
boxes: {"meals":4,"expected":8,"delivery":"none_delivered","items":0,"items_refused":8}
dishes[2].boxes["max_box"]: item "ham" has no usable grams, dropped
dishes[2].boxes["lea_box"]: item "tofu" has no usable grams, dropped
…  (8 sur 8)
```

Le modèle a composé exactement le partage demandé — jambon pour Max, tofu pour
Lea, sur les quatre repas — et **tout a été jeté en silence**, avec l'ancre
protéique de ces quatre repas.

⛔ Ce n'est pas une faute du modèle. C'est un contrat qui demande une chose et
en lit une autre.

### ⓑ Une bouche SANS COMPTE n'a pas d'enveloppe, donc pas de plancher

- `household_bodies.ts:350` pose délibérément `latestWeight: null` pour une
  fiche de foyer — « une fiche n'est pas une série. Le poids part par
  `declaredWeightKg` ».
- `meal_envelope.ts:1324` ne lit que `body?.latestWeight?.value ?? null`.
- Pour une bouche sans compte c'est donc **toujours** `null` ⇒ branche dégradée
  `protected`, et `mouthEnvelope` n'atteint jamais
  `maintenanceEnvelopeFromBody`.

Conséquence mesurée : Lea (58 kg, déclarés et lisibles) n'a **aucun plancher
protéique nulle part**. L'enveloppe attendue valait 93 g/jour.

⚠️ `meal_envelope.ts` est partagé avec la lane solo : un titulaire avec de
vraies pesées ne doit rien voir changer. Et « pas de pesée datée » n'est pas
« pas de poids ».

### Ce que l'audit a aussi établi, et qu'il ne faut PAS chasser

- Les deux tours de réparation de ce tir **ne sont pas des mesures** : le banc
  n'a payé que le tour 0 ; les tours 1 et 2 ont reçu la conserve. Les deux
  `base_version_missing` et le `calls_exhausted` sont des artefacts du banc.
- N=1 réel et N=2 déterministe passent parce qu'ils **n'atteignent pas ce
  chemin** : la seule différence est deux régimes opposés à la même table, le
  seul cas où la protéine quitte `dishes[].ingredients` pour les boîtes.

## Lot 1 — clos

Le maillon exact : `portion_sizing.ts:1568`, `const rows = (byDish.get(i) ?? []).filter((r) => r.sized)`.
Une bouche sans cible n'était dans aucun contenant — **alors que le plat était
déjà multiplié pour elle** (`dishSum` compte une ligne non dimensionnée à
`UNMEASURABLE_PORTION_FACTOR = 1`). La nourriture était achetée, cuisinée, et
rendue à personne.

La voie qualitative existait depuis le lot 10 (« un mangeur sans cible ne bloque
pas la table, il reçoit la recette telle quelle ») ; elle n'était **pas
raccordée au couvercle**.

Avant : `own_expected 24`, `own_authored 18`, `mouth_unfed ×6`, **422 sans
écriture**. Après : `own_authored 24`, `fed 24/24`, porte `ok=true`, **200**.

⚠️ Trois choses que le lot 1 laisse ouvertes, dites telles quelles :
- **le chemin SOLO a le même trou** (`portion_sizing.ts:1750`) et n'a pas été
  corrigé : le banc ne peut pas poser un titulaire sans date de naissance, et le
  reproduire aurait demandé un `UPDATE` direct sur un profil, interdit par
  `AGENTS.md` ;
- `restriction_unknown` n'a pas été atteint en sortie de handler (toute bouche
  sans compte rend `no_account`), seulement au niveau des fonctions ;
- `preparer-ref4.sh` a réécrit `references/ref4.json` du chantier précédent —
  copie conservée dans `scratchpad/2026-09-13-LOT1-NOURRIR-CHACUN/ref4-l1ctl.json`.

## L'instrument : une quatrième famille, « SANS OBJET »

Le lot 1 a créé un rouge fabriqué : Iris, parfaitement servie, était comptée
`complète 0/6` avec `22 contrôles incomplets` à côté d'un `calorique 0/0` qui,
lui, disait juste.

Une case dont le **contrat ne porte pas de cible** sort désormais des trois
familles numériques et entre dans `SANS OBJET`. La **présence reste jugée** : un
plat ou une portion absents restent un défaut, cible ou pas.

```
Iris   calorique 0/0 · complète 0/0 · incomplets 0 · SANS OBJET 10
TOTAL  18/18 · 18/18 · incomplets 0 · SANS OBJET 10
```

⛔ Et la condition est « AUCUNE cible nulle part », pas « cette case-ci » : une
bouche qui a des cibles caloriques et **pas** de plancher protéique reste un
contrôle INCOMPLET. Sans cette précision, le défaut ⓑ ci-dessus (l'enveloppe
dégradée d'une bouche sans compte) serait devenu invisible.

Contre-épreuve : désarmer « sans objet » ⇒ 2 tests rouges ; restauré ⇒ 45 verts.

## § 2.4 — le troisième maillon, et c'est celui qui comptait

Le correctif du lecteur d'items (ⓐ) est juste, mais **il ne récupère pas un
gramme sur ce chemin**, et le rejeu gratuit le mesure : sous `portion_v1`,
`portion_sizing.ts:1699` rend `{ ...d, ingredients: sc.out, boxes }` — **les
boîtes du moteur écrasent celles du modèle, sans condition**. Le jambon et le
tofu n'étaient QUE dans `boxes[].items`, jamais dans les ingrédients ni les
casseroles.

L'autre canal, le plat dédié, n'était pas servi non plus. Lu sur le prompt
réellement transmis (`gain-lot3r2-…prompts.txt`) :

```
"see A DISH OF THEIR OWN"   → 1 occurrence   (le bloc de régime y renvoie)
"A DISH OF THEIR OWN"       → 1 occurrence   (c'est LA MÊME : la section n'existe pas)
"for_member_id"             → 0 occurrence   (la clé n'est jamais enseignée)
"served PER BOX"            → 1 occurrence   (l'ordre de mise en boîte, lui, part)
```

⇒ **Une bouche végane à une table omnivore n'avait aucun canal qui fonctionne.**
Les deux consignes partaient, aucune des deux n'était utilisable. Attribuer le
manque de protéine au modèle aurait été faux.

### La cause, et ce que j'ai corrigé

`divergingNames` (le bloc de régime) vient de `dishBearingMembers` — la règle
R4/R5 — pendant que `dishBearers`, qui décide de l'**émission** de la section,
vient de `v34DishBearers` — la grille — sous v34. Le commentaire de leur propre
site d'appel dit pourtant : « LA MÊME LISTE […] et pas un troisième calcul ».

⛔ Ouvrir un plat dédié à qui la grille n'en donne pas rouvrirait le budget du
second plat : c'est une **décision produit**, pas un correctif. J'ai donc fermé
seulement le mensonge, et rendu la question mesurable :

- `household_diet.ts` reçoit `dedicatedSectionSent` (**requis**, jamais `?`) et
  ne renvoie plus à une section absente. Ce qui reste vrai est conservé — ces
  bouches ne sont pas liées par la ligne du dessus — et le canal réel est nommé.
- deux compteurs au journal : `dish_bearers_taught` et
  `dish_bearing_promised_not_taught`.

Vérifié sur le prompt réassemblé : `A DISH OF THEIR OWN` → **0**, et
`dish_bearing_promised_not_taught: 1`.

Contre-épreuve : rendre le renvoi inconditionnel ⇒ 1 test rouge ; restauré ⇒
17 verts.

### Ce qui reste ouvert, nommé

- **Les boîtes du moteur sont aveugles au régime** sous `portion_v1` (`itemsAt`
  ne filtre pas) : un plat qui porte du jambon le met dans la boîte de tout le
  monde.
- Le désaccord `dishBearers` / `divergingNames` n'est pas tranché — il est
  désormais **compté**.
- L'instrument annonce 116 g/jour de protéine pour Lea là où le produit dit 93 :
  `2026-09-11-mesure-grille.ts` passe `latestWeight: {value: weightKg}`, ce que
  la production ne fait pas.

---

# CHANTIER SUIVANT — « fermer les défauts restants », 2026-09-13 (soir)

## Lot 1 — la cause des deux réparations ratées est ENTIÈREMENT la nôtre

⛔ **Ce que j'avais écrit était faux.** « Le modèle a élargi son intervention » :
notre propre prompt ordonnait les créations.

```
⛔ "units" carries ONLY these unit_ids, the ones to change: U1, U6.
⛔ And these unit_ids, which do not exist yet and must be written from
   nothing: U2, U3, U7, U8.
```
N=2 : 4 créations ordonnées + 4 × « add ONE … side dish ».
N=4 : 2 créations ordonnées + 2 × « add ONE … side dish ».

### Le premier calcul fautif

`index.ts:12068` (origine) : `const dejaDemande = outOfBoundsN.some((x) => x.i === i);`

Preuve : `stuck_dishes: 0` et `fresh_frozen: 0` sur les deux tirs — donc `freshOk`
était **vrai**, la branche `(!freshOk && !potsOk)` fausse — et pourtant
`residual_stuck == residual_eaters`. Seul `dejaDemande` pouvait l'expliquer.

Et il était vrai **toujours** : depuis la fermeture C4, ce site ne rappelle plus
le modèle, `runDensityRepair` rend `merged` sans jamais le poser à `true`, et
`measured` n'est pas remesuré entre `outOfBoundsN` et cette ligne — **c'est le
même objet**. Tout plat hors bornes était irréparable **avant qu'on ait rien
demandé**. L'intersection des couloirs était pourtant non vide : Max [104-250] ∩
Lea [112-172] = [112-172], et la consigne visait 156 elle-même.

### Trois faits de comptage

- « 6 » et « 9 » ne sont **pas des repas** : chaque bouche-case est comptée deux
  fois (`gate` + `upstream`). Distinctes : **3** et **4**.
- **N=2** : nos compléments perdaient leur `for_member_id` au parseur
  (`meal_generation.ts:8027`) — et ce `for_member_id` **venait de nous**
  (`plan_repair_patch.ts:1018` le repose depuis la table des unités). Le parseur
  relisait notre propre adresse comme une déclaration du modèle.
- **N=4** : les deux cases perdues **n'ont jamais été touchées par le patch**.
  `complementsShared` se posait par adresse et tombait sur les plats réparés ;
  le retrait se faisait **par titre** (même titre deux jours de suite) ; `rows`
  restait figé ⇒ contenants du plat k écrits sur le plat k+1.

### `safety_added` ne désignait AUCUN allergène

Zéro sur `table_exclusion_served`, `member_exclusion_served`,
`regime_forbidden_component`, `house_rule_served`. C'étaient des `mouth_unfed`
(`unfed:double` puis `unfed:not_named`) — des repas rendus absents **par nos
écritures**, classés « sécurité » parce que cette cause est en `severity: refuse`.

### ⛔ Et mon « rejeu gratuit » ne rejouait pas le modèle

Le crochet `compositionPatch` fabriquait un patch et écrasait la réponse
archivée (`transport-lot-F.ts:511`) ; passé ce point, elle se faisait refuser
`base_version_stale`. Corrigé. La conclusion que j'en avais tirée — « c'est la
recette du modèle » — **n'était pas fondée**.

### Mesuré après correctif

N=2 : `must be written from nothing` **0** (était 1), `add ONE` **0** (était 4),
périmètre « U1, U4 ». N=4 : candidate **adoptée**, défauts **4 → 0**, porte
finale conforme, **24/24 bouches-cases nourries**. La création reste possible
(`--sans-portion` ⇒ `reserved: 2`, `created: [U3, U4]`).

## Lot 2.1 — la lane d'UNE bouche sert enfin la part de recette

`portion_sizing.ts:1824`, `applySizing` gardait `if (!row || !row.sized) return`.
Les deux silences sont désormais séparés : recette illisible ⇒ **refus
conservé** ; pas de cible ⇒ part de recette. Chemin nominal identique au gramme
(`fresh_scaled 18 · pots_scaled 2 · regrammed 23`, avant comme après).

⚠️ Pas de tir réel pour un titulaire sans date de naissance : le banc ne l'offre
qu'aux rangs ≥ 2 et aucun `UPDATE` n'était autorisé. Tenu par des lignes
contrôlées et des épingles de câblage.

## Lot 2.3 — le banc et le produit disent le même plancher

Lea (58 kg, sans compte) : **116 → 93 g/jour**, par la branche « fiche —
ENTRETIEN » (`maintenanceEnvelopeFromBody`). Recoupé sur le prompt archivé :
« at least 23 g … 33 g » = 93, pas 116. Les cinq fixtures connues ne bougent
pas.

⚠️ Trouvaille hors périmètre, non corrigée : deux commentaires de production
affirment que `goalApplies` neutralise l'objectif d'une bouche d'âge inconnu —
**cette fonction n'a aucun appelant dans le handler**.

## Lot 2.4 — les bornes portent sur le repas ENTIER

`fitPortionsToBounds` et `finalPortionCheck` regroupent les contenants d'une
bouche à un (jour, moment) et jugent **leur somme**, remesurée **après arrondi**.

Lea, mon+tue dinner : **234 g / 563,6 kcal → 227 g / 547,4 kcal**, écart à la
cible **+3,82 % → +0,83 %**. `raised: 2, grams_raised: 14` → **0 / 0**.

⛔ **Et le nombre honnête est plus bas.** Lea passe de `complète 6/6` à `4/6`,
motif « densité hors couloir » : sa conformité d'avant était **achetée en
servant 4 % de trop**.

⚠️ Reliquat nommé, non corrigé : l'arrondi par item pose 218 g là où le partage
décide 216, d'où une densité de 241,1 pour un plafond **entier** de 241 transmis
au modèle (couloir exact 241,27).

## ❌ Ce qui reste ouvert du lot 2

**§ 2.2 — la variante de régime qui arrive réellement dans l'assiette.** Non
fait. Les boîtes du moteur restent aveugles au régime sous `portion_v1` et
écrasent celles du modèle ; le plat dédié n'est pas enseigné à qui la règle le
promet ; l'écart est compté (`dish_bearing_promised_not_taught`) mais le canal
n'existe toujours pas.
