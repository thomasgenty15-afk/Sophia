# Fermer les défauts restants — 2026-09-14

> ⛔ **Correctifs vérifiés hors ligne.** Aucun appel fournisseur n'a été payé dans
> ce chantier : **0 sur une trentaine de tirs**. Un rejeu de réponse réelle
> prouve le traitement **de cette réponse** ; une réponse synthétique prouve
> **un chemin technique** ; ni l'un ni l'autre ne prouve que le nouveau prompt
> améliore les futurs premiers jets.

Plan appliqué : « Fermer les défauts restants ». Base :
[`RAPPORT-RESTE-A-FERMER-FOYER-2026-09-13.md`](RAPPORT-RESTE-A-FERMER-FOYER-2026-09-13.md)
§ 4 et § 6 — dont le § 9, qui corrige ce rapport-là.

---

## 0. La correction qui ouvre tout le reste

Le rapport précédent affirmait que le modèle avait « élargi son intervention
au-delà du défaut ». **C'était faux, et c'est notre propre message qui le dit :**

```
⛔ "units" carries ONLY these unit_ids, the ones to change: U1, U6.
⛔ And these unit_ids, which do not exist yet and must be written from
   nothing: U2, U3, U7, U8.
```

| | à changer | à CRÉER (ordonné) | « add ONE … side dish » |
|---|---|---|---|
| N=2 | U1, U6 | **U2, U3, U7, U8** | **4 fois** |
| N=4 | U4, U10 | **U5, U11** | **2 fois** |

Le modèle a obéi. **Les deux échecs de réparation payés le 2026-09-13 sont
entièrement les nôtres.**

---

## 1. Lot 1 — attribuer, puis corriger

### 1.1 Le premier calcul fautif

`generate-household-meal-v1/index.ts` (ligne d'origine 12068) :

```ts
const dejaDemande = outOfBoundsN.some((x) => x.i === i);
if ((!freshOk && !potsOk) || dejaDemande) { repairs.residual_stuck++; … }
```

**Preuve** : `stuck_dishes: 0` et `fresh_frozen: 0` sur les deux tirs — donc
`freshOk` était **vrai** et la première branche fausse — et pourtant
`residual_stuck == residual_eaters` (4 à N=2, 2 à N=4). Seul `dejaDemande`
pouvait l'expliquer.

Il était vrai **toujours** : depuis la fermeture C4 du 2026-09-12, ce site ne
rappelle plus le modèle, `runDensityRepair` rend `merged` sans jamais le poser à
`true`, et `measured` n'est pas remesuré entre `outOfBoundsN` et cette ligne —
**c'est le même objet**. Tout plat hors bornes était déclaré irréparable **avant
qu'on ait rien demandé**, et le seul geste restant offert était le complément.

L'intersection des couloirs de densité était pourtant **non vide** :
Max [104–250] ∩ Lea [112–172] = **[112–172]**, et la consigne visait 156
elle-même.

⚠️ Le second suspect — `repairabilityOf`, `dissenting === 0 ⇒ frozen` — est
**écarté par la mesure** : `fresh_frozen: 0` sur les deux tirs. Sa sévérité reste
une question ouverte, **pas** la cause de ces échecs.

### 1.2 Trois faits de comptage

- **« 6 » et « 9 » ne sont pas des repas.** Chaque bouche-case est comptée deux
  fois (source `gate` + source `upstream`). Distinctes : **3** et **4**.
- **N=2** — nos compléments perdaient leur `for_member_id` au parseur
  (`meal_generation.ts:8027`, « is not a mouth that gets its own dish, dropped »),
  devenaient des plats **de table**, d'où deux couvercles par bouche à la même
  case ⇒ `unfed:double`. ⛔ Et ce `for_member_id` **venait de nous** :
  `plan_repair_patch.ts:1018` l'efface et le repose depuis la table des unités.
  Le parseur relisait **notre propre adresse** comme une déclaration du modèle.
- **N=4** — les deux cases perdues **n'ont jamais été touchées par le patch** ;
  le modèle n'avait écrit que `mon/lunch` et `tue/lunch`. La perte est dans notre
  fusion : `complementsShared` se posait par **adresse** et tombait sur les plats
  réparés ; le retrait se faisait **par TITRE** (la référence porte le même titre
  deux jours de suite) ; et `rows` restait figé, si bien que les contenants du
  plat *k* étaient écrits sur le plat *k+1*.

### 1.3 `safety_added` ne désignait aucun allergène

`refusals_by_cause` est à **zéro** sur `table_exclusion_served`,
`member_exclusion_served`, `regime_forbidden_component` et `house_rule_served`.
C'étaient des `mouth_unfed` — des repas rendus absents **par nos écritures**,
classés « sécurité » parce que cette cause est en `severity: refuse`.

### 1.4 ⛔ Et le « rejeu gratuit » du rapport précédent ne rejouait pas le modèle

Le crochet `compositionPatch` du banc fabriquait un patch et écrasait la réponse
archivée (`transport-lot-F.ts:511`) ; et passé ce point, elle se faisait refuser
`base_version_stale`. Corrigé : le crochet s'abstient sur le tour visé, **seule**
`base_version` est réécrite, et c'est imprimé. La conclusion qu'en tirait le
rapport précédent n'était **pas fondée**.

### 1.5 Corrigé, et mesuré

| Geste | Effet mesuré |
|---|---|
| `dejaDemande` **retiré** ; un complément n'est réservé que si plus rien n'est réécrivable **ou** si les couloirs n'ont **aucune intersection** (`mergeCorridors`, fonction du moteur) | N=2 : `must be written from nothing` **0** (était 1), `add ONE` **0** (était 4), périmètre « U1, U4 » |
| l'adresse du serveur **reposée** après le parseur | les compléments ne deviennent plus des plats de table |
| `complementsShared` par **identité d'objet** | ne tombe plus sur un plat réparé |
| `unsolvable_titles` → `unsolvable_cells` | un titre ne désigne pas un plat |
| `rows` **rafraîchi** après retrait et remesure | les contenants ne se décalent plus |

N=4 après correctif : candidate **adoptée**, défauts **4 → 0**, porte finale
`conforme`, **24/24 bouches-cases nourries**. La création reste possible :
`--sans-portion=mon/lunch` ⇒ `reserved: 2`, `created: [U3, U4]`.

**Six mutations adversariales**, une par geste, chacune rendant exactement un
test rouge.

---

## 2. Lot 2 — les défauts fonctionnels

### 2.1 Personne seule sans cible — ✅

`portion_sizing.ts:1824` : `applySizing` gardait
`if (!row || !row.sized) return { ...d }` — le chemin d'**une seule bouche**. Les
deux silences sont désormais séparés : recette illisible ⇒ **refus conservé** ;
pas de cible ⇒ **part de recette**, comptée (`recipe_shares_by`).

Chemin nominal identique **au gramme** : `fresh_scaled 18 · pots_scaled 2 ·
regrammed 23`, avant comme après. Sept épreuves, dont l'affichage protégé
(`gate.single: 1 · emitted: 0 · refused: {age_unknown: 1}`).

⚠️ **Pas de tir réel pour un titulaire sans date de naissance** : le banc ne
l'offre qu'aux rangs ≥ 2 et aucun `UPDATE` n'était autorisé.

### 2.2 Variante de régime — voir § 5

### 2.3 Même contrat protéique dans le banc et le produit — ✅

| | banc AVANT | banc APRÈS | produit (prompt archivé) |
|---|---|---|---|
| poids | 58 kg, `latestWeight` **fabriqué** | 58 kg par `declaredWeightKg`, `latestWeight: null` | idem |
| objectif | `fat_loss` **appliqué** | `fat_loss` **inerte** | inerte |
| branche | `envelopeFor(fat_loss)` | `maintenanceEnvelopeFromBody` | idem |
| cible | **116 g/jour** | **93 g/jour** | **93** |
| distribution | 29 / 46 / 41 | **23 / 37 / 33** | « at least 23 g … 37 g … 33 g » |

La colonne « produit » est **lue dans le prompt archivé**, pas affirmée. Aucun
barème n'a bougé : les 1,6 et 2,0 g/kg viennent de `PROTEIN_FLOOR_G_PER_KG`.

⚠️ Une mutation adversariale est d'abord revenue **verte** — la garde n'était pas
armée, la bouche du test n'ayant ni âge ni date de naissance (deux causes
d'absence à la fois). Test durci avec une bouche datée dont un seul champ change.

### 2.4 Les bornes portent sur le repas ENTIER — ✅

`fitPortionsToBounds` et `finalPortionCheck` regroupent les contenants d'une
bouche à un (jour, moment) et jugent **leur somme**, remesurée **après arrondi**.

| | avant | après |
|---|---|---|
| `portion_boundary` | `raised: 2, grams_raised: 14` | **`raised: 0`**, `multi_box_meals: 2` |
| assiette de Lea, mon+tue dinner | 234 g · 563,6 kcal | **227 g · 547,4 kcal** |
| écart à la cible 542,85 kcal | **+3,82 %** | **+0,83 %** |

⛔ **Et le nombre honnête est plus bas.** Lea passe de `complète 6/6` à **4/6**,
motif « densité hors couloir » : sa conformité d'avant était **achetée en servant
4 % de trop**.

⚠️ Reliquat nommé, non corrigé : l'arrondi par item pose 218 g là où le partage
décide 216, d'où une densité de 241,1 pour un plafond **entier** de 241 transmis
au modèle (couloir exact 241,27).

---

## 3. Lot 3 — la matrice, sans une dépense

**15 tirs, 0 appel facturé.** Horloge commune, fenêtre 2 jours × 3 repas.
Journaux : `scratchpad/2026-09-13-LOT3-CLOTURE/journaux/`.

| Cas | Source | Défauts av.→ap. | Créées | Verdict | Livré | Publication |
|---|---|---|---|---|---|---|
| **A1/A2/A4** références sans défaut | synthétique | 0 → 0 | 0 | `conforme` | 200 | plan écrit |
| **B2** réponse **réelle** N=2 | **réelle** | 10 → 10 | 0 | patch **rejeté en entier** (`unknown_unit` U7, U8) | 200 `deliverable_with_gaps` | écrit **avec ses écarts visibles** |
| **B4** réponse réelle N=4 + patch synthétique | mixte | 4 → 0 | 0 | `conforme` — ⚠️ **la fusion vient du patch SYNTHÉTIQUE** | 200 | écrit |
| **B4b** contrôle : réponse réelle **seule** | **réelle** | 4 → **4** | 0 | **0 unité fusionnée** ; patch cassé rejeté en entier | 200 `deliverable_with_gaps` | écrit |
| **C** N=2 trop dense, candidat commun | synthétique | 10 → 0 | **0 créée, 0 complément** | adoptée en **1 appel sur 2** | 200 `conforme` | écrit |
| **D** N=4 isolation d'un lot | synthétique | 4 → 0 | 1 casserole neuve, rattachée à `S1(mon)` | adoptée | 200 `conforme` | écrit |
| **F** bouche sans âge connu | synthétique | 0 → 0 | 0 | `conforme` · **24 contenants**, Iris par `recipe_shares: 6` | 200 | écrit |
| **G** complément | synthétique | 6 → 4 | **2 réservées, 2 créées**, ni plus ni moins | adopté | 200 `deliverable_with_gaps` | écrit |
| **H1** **panne de validation** | synthétique | n/a | 0 | `plan_validation_unavailable` | **422** | **plans avant 3 · après 3 — zéro écriture** |
| **H2** **panne de journalisation** | synthétique | 0 → 0 | 0 | contrôle **tourné**, trace tombée ⇒ **ne refuse pas** | **200** | **plans avant 3 · après 4** |
| **I1** candidat dangereux | synthétique | 4 → 0 | 0 | patch porteur d'arachide **refusé** ; **0 occurrence dans le plan écrit** | 200 `conforme` | écrit |
| **I2** déroulé dangereux persistant | synthétique | — | 0 | `output_lock:1` après 2 réparations | **422** | **0 écriture**, ancien plan intact |

**La panne de validation et la panne de trace sont mesurées côte à côte** et se
distinguent. Le point d'injection est le paramètre requis `validate` de
`plan_publication.ts` — **aucun fichier de production n'a été touché**, une carte
d'import fournit une autre fonction.

**Le complément additionne bien ses composantes**, lu par `boxNutrition` sur le
plan écrit :

```
mon/dinner — 2 contenant(s)
   part commune  218 g · 545,4 kcal
   COMPLÉMENT      9 g ·   2,0 kcal
   = 547,4 kcal servies · assiette 227 g      (cible 542,85 → +0,83 %)
✅ AUCUN DOUBLE COMPTE
```

---

## 4. Ce qui n'a pas pu être monté

1. **Le chemin SOLO sans cible** (`portion_sizing.ts:1750`) — le banc ne sait pas
   poser un titulaire sans date de naissance ; il faudrait un `UPDATE` direct sur
   un profil, interdit par `AGENTS.md`.
2. **`restriction_unknown` en sortie de handler** — toute bouche sans compte rend
   `no_account` ; seule la fonction isolée l'atteint.
3. **Premier jet réel et réparation réelle** — interdits par ce chantier.

---

## 5. § 2.2 — la variante de régime arrive dans l'assiette — ✅

### 5.1 Une seule décision, une seule maison

> Le plat partagé d'une case suit **la ligne de la table** (`strictestRegimeAt`,
> R4 — exactement ce que le prompt déclare sous `WHAT THE SHARED BASE MUST
> RESPECT`). Une bouche reçoit un plat à elle **seulement si cette base ne peut
> pas la nourrir** (`dietDiverges`) ou si elle a déclaré son propre repas.

La règle vit dans la grille (`household_cells.ts`). `dishBearingMembers` en est
désormais la **projection** ; `promptDishBearers` est écrit **une fois** et lu
par les quatre bouts (le champ `dishBearers`, `divergingNames`,
`dedicatedSectionSent`, le compteur). `v34DishBearers` et `compositionEaterCells`
ont disparu ; les deux budgets sont fusionnés.

⛔ **Pourquoi ce sens et pas l'autre**, lu sur le message N=4 réellement
transmis le 2026-09-13 : `A DISH OF THEIR OWN` commandait un plat à **Lea, la
végane**, sur une page qui déclarait la base **végane** (« This is the line of:
Lea »), nommait **Nils et Iris** comme celles qui mangent le leur, puis excluait
Lea de ces plats-là. La grille commandait un plat à la seule personne que la
base servait déjà.

### 5.2 Avant / après, sur les prompts réellement assemblés

| | `diverging` | `dish_bearing` | `taught` | servi |
|---|---|---|---|---|
| **N=2 avant** | `[Max]` | `[Max]` | **`[]`** | rien — `for_member_id` **0**, `A DISH OF THEIR OWN` **0** ⇒ toute la table mange végane |
| **N=2 après** | `[Max]` | `[Max]` | **`[Max]`** | `for_member_id` **4**, `A DISH OF THEIR OWN` **3**, `dedicated_cells 9`, `promised_not_taught` **0** |
| **N=4 avant** | `[Nils, Iris]` | `[Nils, Iris]` | **`[Lea]`** | section pour Lea, phrase pour Nils/Iris — **deux personnes différentes** |
| **N=4 après** | ⛔ **`[Nils, Iris]`** — voir ci-dessous | idem | idem | la section les nomme ; `dedicated_mouths` honore la présence case par case ; Lea **jamais** |

⛔ **CORRECTION.** Le § 2.2 annonçait `[Max, Nils, Iris]` à N=4. **Ce chiffre ne
se reproduit pas** : re-mesuré sur **deux foyers indépendants**, la liste vaut
`[Nils, Iris]`. La cause est le contrat, pas la liste : `fat_loss` ne sort pas de
la casserole végane, `muscle_gain` si. J'avais publié le chiffre de l'agent sans
le re-mesurer.

### 5.3 Végane + omnivore : ce qui finit dans l'assiette

Mesuré sur les ingrédients **après parseur**, pas sur le texte du modèle :

| | plat servi | protéines |
|---|---|---|
| **Max** (omnivore, prise de masse) | jambon 150 g + riz 80 g + huile | **37,1 g** |
| **Lea** (végane) | tofu 150 g + riz 80 g + huile | **29,6 g** |

Chaque plat dédié ne nourrit que son porteur (`excluded: 4`), un contenant par
bouche, **zéro jambon dans la boîte de Lea**. Et la casserole commune retombe de
**300 g à 150 g** de tofu : on n'achète plus la part de qui n'y mange pas.

### 5.4 Les quatre maillons

**Décidé · enseigné · parsé · servi** — les quatre, sur un banc de 14 épreuves
qui suit la chaîne entière, **le cas qui passe écrit en premier** : une végane et
un omnivore *sans exigence* ⇒ **aucun** second plat, la recette commune suffit.
Contre-cas qui mordent : table entièrement végane ⇒ 0 plat ; foyer sans régime
⇒ 0 plat ; `for_member_id` hors liste refusé sans jeter le plat.

Six mutations adversariales, de 2 à 16 échecs chacune ; les trois fichiers de
production sont revenus **octet pour octet**.

### 5.5 ❌ Ce qui n'est PAS fermé, et c'est mesuré

**Le partage PAR BOÎTE d'un plat partagé reste inutilisable sous `portion_v1`.**
C'est l'autre canal du bloc de régime (« The one component that line refuses is
served PER BOX »). Il a exactement deux issues, **les deux fausses** :

- le composant animal **seulement dans `boxes[].items`** ⇒
  `portion_sizing.ts:1699` réécrit les contenants depuis les ingrédients du plat
  et il disparaît (mesuré : 8 items sur 8 jetés) ;
- le composant animal **aussi dans `dish.ingredients`** ⇒ le moteur le met dans
  **toutes** les boîtes :

```
m-lea → riz 208 g · tofu 120 g · jambon 100 g
m-max → riz 208 g · tofu 120 g · jambon 100 g
```

⚠️ La ceinture de sortie l'attrape (`regime_forbidden_component`) : le préjudice
est un plan **refusé en 422**, **pas une assiette fausse servie**. Mais pour un
foyer végane + omnivores **sans** exigence protéique, ce canal serait le seul à
donner de la protéine animale aux non-liés, et il ne fonctionne pas. Le réparer
demande de rendre `applySizingForEaters` conscient du régime **et** de découpler
la mise à l'échelle du frais par ingrédient — ce qui touche la liste de courses,
l'énergie et la couverture. Non fait, et non fait à moitié.

---

## 6. Deux validations réelles, PRÉPARÉES et NON LANCÉES

Elles demandent une autorisation distincte. Rien n'est lancé.

| | Objet | Appels | Durée mesurée comparable | Entrée / sortie |
|---|---|---:|---|---|
| **V1 — N=2** | le prompt corrigé demande-t-il la bonne chose, et le modèle rend-il un patch **adoptable** sur un défaut de densité partagé par deux bouches ? | **1** | 36–53 s sur les réparations récentes | ~35 ko / ~90 ko |
| **V2 — N=4** | même question sur une casserole partagée par quatre, avec dépendances | **1** | 40–90 s | ~40 ko / ~130 ko |

- **Plafond explicite : 2 appels au total**, un par parcours, séquentiels, avec
  `--reparation-reelle=1`. Le plafond vit **dans le transport**, pas seulement
  dans le handler.
- **Réutiliser les plans existants** : les références `ref2` et `ref4-lot3a` sont
  figées et validées (12/12 et 24/24 avant injection). Aucune génération
  initiale n'est nécessaire pour tester la réparation.
- ⛔ **Évaluer le premier jet est une preuve séparée** et un budget séparé :
  116–137 s par génération, et Kong coupe à 150 s par la voie normale.
- Avant de payer : vérifier que le routage des replis fournisseur est à jour
  (`compositionFallbackModels`), sans quoi un appel en échec est facturé et ne
  mesure rien.

---

## 7. Vérifications

| Commande | Résultat |
|---|---|
| `deno test --allow-all supabase/functions/_shared/keel/` | **7 245 passés · 0 échoué · 2 ignorés** (7 204 au départ du chantier) |
| `deno test --allow-all scripts/2026-09-11-mesure-grille_test.ts` | **50 passés · 0 échoué** (48 au départ) |
| `deno check supabase/functions/generate-household-meal-v1/index.ts` | passe |
| `scripts/agent-gate.sh` | **pass** |

**Échecs préexistants, comptés à part — aucune liste tolérée n'a été modifiée :**

- vitest : 2 611 tests, **2 rouges**, tous deux dans `scripts/.vitest-red-baseline`,
  **0 hors liste** — `src/keel/i18n/energyBasis.int.test.ts` et
  `src/keel/api/mouthProfileReaders.int.test.ts`, lane `chantier-0903` lot A7 ;
- typecheck des tests : 165 fichiers, **67 erreurs pour une liste de 68**. Le gate
  signale que `householdHabits.int.test.ts` est redescendu à 0 et que sa ligne
  devrait être abaissée — **je n'y ai pas touché** ;
- eslint : 1 avertissement préexistant (`ChatPage.tsx:888`, `forcedPhotoSlot`).

**Les six fixtures figées ne bougent pas** : `lot3b-reference` 12/12 · 12/12 ·
`lot2-ref4-c0` et `lot3a-reference` 24/24 · 24/24 · `lot3-reel-n1` 6/6 ·
`lot1-age-inconnu` 18/18 + SANS OBJET 10 · `lot2-complement` 24/24.

**Coût du chantier : zéro appel fournisseur.** Une trentaine de tirs, tous sur
transport contrôlé, tous avec `appels fournisseur RÉELS (facturés) : 0`.

---

## 8. Défauts nommés et NON corrigés

1. **Le partage par boîte sous `portion_v1`** — § 5.5.
2. **Le chemin SOLO sans cible** (`portion_sizing.ts:1750`) — le banc ne sait pas
   poser un titulaire sans date de naissance.
3. **L'arrondi par item** pose 218 g là où le partage décide 216 : densité 241,1
   pour un plafond **entier** de 241 transmis au modèle (couloir exact 241,27).
4. **`goalApplies` n'a aucun appelant** dans le handler, alors que deux
   commentaires de production affirment qu'il neutralise l'objectif d'une bouche
   d'âge inconnu. Une bouche **avec compte** et `age_state: unknown` reçoit donc
   bien une enveloppe d'objectif.
5. **`output_lock_journal_failed`** arrive dans le corps HTTP mais **pas** dans
   `generated_from.issues` de la ligne écrite : la copie est faite ~1 850 lignes
   avant la décision de publication. Le refus, lui, n'est pas affecté.
6. **`repairabilityOf`** : un seul dissident gèle un composant. Écarté comme
   cause des deux échecs payés, **non tranché** comme règle.

---

## 9. ⟳ 2026-09-14 — trois manques du chantier lui-même, fermés

### 9.1 Le titulaire sans date de naissance : ce n'était pas impossible

La session précédente avait conclu « pas de tir réel possible ». **Faux** :
`--sans-naissance` du banc acceptait déjà le rang 1
(`filter(n => n >= 1)`) mais ne le **consultait** que pour les bouches
secondaires (`rangRoster = rangSecondaire + 2`). Passer `--sans-naissance=1` ne
faisait donc **rien, en silence** — un drapeau accepté qui n'arme rien, la
cicatrice `optional-gate-params-are-disarmed-gates` du dépôt.

Aucun `UPDATE` : la date n'est pas effacée, elle n'est **jamais écrite** — ni
dans l'upsert `profiles`, ni par `keel_household_set_member_birth_date`. Il faut
les deux : une ligne membre datée rendrait `adult` malgré un profil vide.

Tir `sna1`, **200**, plan `8c1478ac`, **0 appel facturé** :

| | témoin (âge connu) | titulaire sans date |
|---|---|---|
| `bounds_source` | `age_known: 6` | **`age_unknown: 6`** |
| `apply.boxes_authored` | 6 | **6** |
| `recipe_shares_by` | — | **`{age_unknown: 6}`** |
| `meals_delivered` | `fed 6/6` | **`fed 6/6`** |
| instrument | 6/6 · 6/6 | **0/0 jugeables · SANS OBJET 10** |

**Aucune cible inventée** : `target {anchored: 0, no_target: 1}`, réponse
`not_applicable: [{cell_energy_no_target, 6}]`, prompt `protein_brief named: 0`,
`portion_note` `null` partout.

**Sa part entre dans la cuisine et les courses** : `prep_poulet` 610 → **760 g**,
`prep_saumon` 645 → **780 g**, et les lignes d'achat suivent.

**Les deux contre-cas mordent** : recette illisible ⇒ `cell_without_portion`,
**422 sans écriture** ; arachide ⇒ `output_lock:3`, dont **`box_item`** — le
verrou mord sur la boîte que la part de recette vient d'autorer.

⚠️ **Une garde qui n'en était pas une.** La mutation qui désarme le refus
(`row.recipeShare ?? "age_unknown"`) laisse le plan **toujours refusé**, par une
seconde ceinture (`items.length === 0`). Le test `share === null` est donc un
**compteur honnête**, pas la garde.

### 9.2 ⛔ Un défaut trouvé en vérifiant le compte rendu de l'agent

L'agent a écrit « `pot_attribution.ratio = 1` ». **Le journal dit 0,85.**

```
T0  âge connu     drawn 1464 / attributed 1467 · ratio 1
T1  âge inconnu   drawn 1516 / attributed 1793 · ratio 0,85
portion_boundary  shaved 4 · grams_shaved 276
```

La part de recette part à facteur 1, la casserole et les courses sont
dimensionnées dessus, **puis** le plafond de masse rabote 276 g — et personne ne
redimensionne la casserole. `pot_shrink` tourne et ne rétrécit rien. **277 g
achetés et cuisinés, non servis.**

⚠️ **Ce n'est pas propre au cas sans cible.** C'est général, simplement
invisible quand le facteur ramène déjà l'assiette sous le plafond. Nommé, chiffré,
**non corrigé** : le réparer touche la liste de courses et l'énergie.

### 9.3 L'ordre des lots a été cassé, et la matrice en a payé le prix

La matrice du lot 3 a été construite **avant** la livraison du § 2.2. Sa ligne
« variante de régime » disait « non fait », et ses lignes N=2 et N=4 mesuraient
l'ancienne décision de qui reçoit quel plat. Elle a été **rejouée** — voir la
section suivante.
