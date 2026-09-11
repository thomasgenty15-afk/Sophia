# Fiabiliser la composition dès le premier jet — ce qui a été fait la nuit du 11 septembre 2026

> **Rien n'est commité, rien n'est déployé.** Tout vit dans l'arbre de travail. La migration du
> lot A est appliquée **en local seulement**.

Le chantier : `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/CHANTIER.md`.
Les preuves de départ : `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md`.
Le socle donné aux cinq agents : `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/SOCLE-COMMUN.md`.

---

## 0 · Le bilan de livraison

| Contrôle | Avant | Après |
|---|---|---|
| `deno test _shared/keel/` | 6 409 verts · **3 rouges** | **6 550 verts · 3 rouges** |
| `deno check` des 4 entrypoints edge | vert | **vert** |
| `tsc -b --force` (front) | exit 0 | **exit 0** |
| vitest (front, node 22) | 2 533 verts · 2 rouges | **2 533 verts · 2 rouges** |
| `eslint` (front) | 30 erreurs · 3 avertissements | **30 · 3, les mêmes fichiers** |
| `deno lint` (`_shared/keel/`) | 417 problèmes sur 602 fichiers | **417 sur 602** |

**+141 tests. Les cinq rouges sont les mêmes qu'avant et appartiennent à d'autres sessions** :
`cooking_style_brief_test.ts:70`, `household_freeze_test.ts:286`,
`household_merge_quota_test.ts:190` côté Deno ; `mouthProfileReaders.int.test.ts:154`
(×2, cherche un `<ActivitySessionsCard>` pas encore posé) côté front.

⛔ **Aucun appel modèle n'a été fait.** Aucune génération réelle. Tout ce qui suit est prouvé
par des tests déterministes, des rejeux hors ligne et des lectures de base — jamais par une
intention.

---

## 1 · Ce que chaque lot ferme, et par quelle preuve

### Lot A — l'identité alimentaire

**Le faux ami n'était pas une curiosité.** Sur toute la base, en `fr-FR` : `prunes` 78 ·
`raisin` 65 · `raisins` 40 · `prune` 12 = **195 occurrences** lues comme du fruit **sec**,
contre **1** en `en-GB`. Plus `poire` 63 + `poires` 33 = **96 occurrences** calculées avec les
valeurs du **poireau** (`pear` portait le code CIQUAL 20039, « Poireau, cru »).

Les quatre contrefactuels de l'enquête sont **reproduits à l'unité** — 614→**388**, 613→**356**,
728→**427**, 728→**475** — par une méthode différente (l'enquête remplaçait les *termes* du
plan, le lot change la *résolution*). **Et un cinquième que l'enquête ne pouvait pas voir** :
GAIN vendredi 728→**773**, la poire, qui bouge dans l'autre sens.

### Lot B — la mesure unifiée

**Le cas 811/901 g est fermé, et son test a d'abord été rouge.** La fixture vient de la vraie
case ; le test rejoue d'abord **l'arithmétique d'avant** et retrouve les cinq nombres du § 4 de
l'enquête à l'unité — 20 · 548,5 · 332,5 · **901** · **811** — puis tient le comportement neuf.

Un seul lecteur pour tout le monde ; prélèvements réels (390 g et 130 g de la même casserole
donnent **525 et 175 kcal**, pas 350/350) ; `finalPortionCheck` **sans exception de
population** (un foyer d'une bouche attrape 1 040 g contre 700).

### Lot C — le contrat de composition

Catalogue compact d'ingrédients **vérifiés** : **121 lignes sur 943, 4 717 caractères**.
Identifiants exigés dans la réponse et vérifiés par le parseur. Couloirs par case avec les
consommateurs des casseroles partagées. Consignes concurrentes retirées.

⚠️ **Aucun effet de prompt n'est prouvé** — aucun appel modèle. Ce qui est prouvé : la consigne
contient ce qu'elle doit contenir, ne contient plus ce qu'elle ne doit plus contenir, est
déterministe, et coûte N caractères.

### Lot D — l'ajusteur déterministe

| Cas réel de l'enquête | Avant | Après | Minimum | |
|---|---:|---:|---:|---|
| PERTE poulet/quinoa + yaourt | 105,4 | **123,1** | 123 | **fermé** |
| PERTE + feta/roquette | 119,9 | **146,1** | 141 | **fermé** |
| PERTE + tomate/pain | 125,5 | **145,9** | 141 | **fermé** |
| GAIN lentilles + pain/feta | 92,2 | 129,7 | 146 | **pas fermé** |

70 déplacements, 339 g déplacés, **médiane 4,2 ms**. À comparer aux **65 à 114 s** d'un
rattrapage modèle qui, sur le premier cas, ne fermait pas le défaut (105,4 → 118,4).
**Zéro portion conforme dégradée** ; 354 candidats refusés précisément parce qu'ils en auraient
dégradé une.

### Lot E — le branchement et la réparation transactionnelle

Tout ce qui précède est **appelé** : l'ajusteur sur les deux chemins (une bouche et la table),
le contrôle final, la langue du référentiel, le catalogue.

**Le défaut d'identité de l'enquête est fermé, et ça se voit sur les données réelles.** Le rejeu
des six réponses archivées après le chantier :

| | avant | après |
|---|---|---|
| `gain sat/lunch` | titre **« Saumon avec couscous… »**, casseroles lentilles + couscous | titre **« Lentilles, couscous, feta… »**, mêmes casseroles |
| `gain sat/dinner` | titre **« Lentilles, couscous… »**, casseroles saumon + couscous + légumes | titre **« Saumon, couscous, légumes rôtis… »**, mêmes casseroles |

C'est exactement le « titre saumon sans aucun saumon » de l'enquête. Sur les 18 parts, **7 sont
identiques, 9 bougent de −1 à 0 kcal** (le biais de la pincée corrigé par le lot B), et **2 sont
ces deux plats qui ont retrouvé leur identité**.

---

## 2 · Tous les arbitrages, et qui les a pris

### Les trois que j'ai posés avant de lancer les agents

**① Le manifeste de validation ne réduit pas le référentiel à 192 lignes.** Mesuré : 881
références disent `source = 'ciqual'` mais **689 n'ont aucun `ciqual_code`**. Exiger un code
pour être « vérifié » supprimerait les trois quarts du catalogue. Règle : vérifié par défaut,
sauf estimation modèle (`sas`), exceptions nommées, et code CIQUAL porté par deux slugs.

**② La porte est à la composition, pas à la mesure.** Refuser une référence non vérifiée au
niveau du résolveur rendrait les plans historiques immesurables. Le refus sans échappatoire
porte sur le catalogue montré au modèle et sur le parseur d'une génération neuve.

**③ `Dpréf` ne revient pas à `100 × cible / grammage préféré`** — contre la lettre du point C.4
du chantier. Ce dépôt a tranché l'inverse **avec des mesures**, sous le nom **A15** : cette
formule rend 236 kcal/100 g sur un déjeuner de 1 120 kcal quand les plats réels vivent entre 113
et 156, et on a mesuré **389 demandés / 126,7 rendus**. Ce qu'on retient de la demande, c'est le
mot « **silencieusement** » : le couloir porte désormais **les deux nombres**.

### Celui que j'ai pris en branchant le témoin

**④ L'explication des deux nombres se dit une fois, pas à chaque moment.** En branchant, j'ai
mesuré que la divergence **n'est pas un cas rare** : elle vaut ~`(Gmax / Gpréf) / 1,10`, donc
~1,34 partout — la clause est sortie sur **4 moments sur 4**, avec la même phrase répétée quatre
fois. Sur une table de quatre bouches, 16 fois le même membre de phrase. Le **nombre** reste sur
son moment (`aim 204, not 274`) ; l'**explication** part en queue de phrase, une seule fois.

### Ceux du lot A

| Question | Décision | Raison |
|---|---|---|
| Liste nominative de faux amis **ou** priorité conditionnée à la locale ? | **Les deux** : liste fermée, chaque ligne portant sa langue | `raisins` = frais en français, sec en anglais. Et l'inversion générale est un no-op mesuré (191 alias capturés, **0 contradictoire**) qui deviendrait dangereux au premier alias contradictoire |
| Langue par défaut | **`fr`** | 195 occurrences contre 1 |
| 3ᵉ argument optionnel à `resolveIngredient` ? | **Non** | Cicatrice `optional-gate-params-are-disarmed-gates`. La langue entre au **chargement de l'index** |
| Validation : table ou colonnes ? | **Colonnes** | Une exception ne peut ni survivre à sa ligne ni pointer un slug disparu |
| Faux amis : colonne ou table ? | **Table à part** | « cette forme passe devant le slug nu, dans cette langue » n'est pas un alias |
| `CompositionRef.validation` requis ? | **Facultatif** — contre mon socle | Requis, il casse le typecheck de ~25 fichiers appartenant à quatre autres lots |
| La poire | Valeurs **citées** d'une ligne voisine déjà en base (53,1), code du poireau **retiré**, ligne `a_verifier` | La ligne ANSES générique n'est établissable depuis aucune source du dépôt. Citer une ligne voisine n'est pas inventer ; garder le poireau était certainement faux |
| `raisin` / `prune` | **`rejete`** / **`a_verifier`** | `raisin` est un doublon de fait sans code ; `prune` a la bonne valeur mais le **nom** ment |
| Inscrire les 18 lignes `sas` une par une ? | **Non** | Elles sont `a_verifier` par la RÈGLE ; les inscrire ferait croire que la règle ne les couvre pas |

### Ceux du lot B

| Question | Décision | Raison |
|---|---|---|
| Le biais de la pincée | **Corrigé** | 3 parts de couscous réclamaient **997,5 g** d'un pot qui en produit **986,5** |
| `discarded` déduit de la prose ? | **Non, aucun mot lu** | La vraie méthode dit « **égrener** avec l'huile » — un matcher artisanal y aurait vu un égouttage |
| `legume_absorbs` traité comme `grain_absorbs` ? | **Non** | Voir § 3 : c'est la question ouverte n°1 |
| Tolérance des 5 % | **Par assiette** | Juger le frais seul rendait 188–342 g/jour illisibles |
| Méthode de friture | **Celle de la casserole** | La liste aplatie faisait porter la méthode du plat à toutes les casseroles |
| Un bac collectif jugé par le contrôle final ? | **Non, et c'est compté** | Les grammes d'un contenant à plusieurs noms sont une quantité de récipient |
| **Correction de mon brief** | **Ne pas retirer `single_mouth` de `shadowSizing`** | À une bouche, l'ombre ferait de l'ombre à un chemin qui pose réellement. C'est le contrôle **final** qui devait cesser de s'abstenir |

### Ceux du lot C

| Question | Décision | Raison |
|---|---|---|
| Classement dans un groupe | **Par nombre d'alias** | « Le slug le plus court » classe `duck_meat`, `capon_meat`, `goose_meat` devant `chicken_meat` : un catalogue de volaille **sans poulet** |
| Un `ref` valide hors catalogue | **Accepté** | Le plafond est une contrainte de **budget**, pas une règle alimentaire |
| « Refuser » un `ref` faux | **La ligne survit, la pesée s'abstient**, comptée | Perdre un dîner parce qu'un slug est mal recopié échangerait le repas contre le confort du parseur. **Aucun repli sur le terme** |
| Plans déjà écrits | **`ref` absent ⇒ pesée par le terme**, aucune migration | Un test strict a fait rougir 8 tests en cessant de peser tout l'historique |
| Retirer « 600 to 750 g » | **Parce qu'elle est FAUSSE** | Les bornes moteur sont 250-700 adulte et **150-450 enfant** : la consigne annonçait 600 g minimum pour une portion bornée à 450 |
| Ce qu'on garde de la phrase | **La forme en parts d'assiette, sans aucun nombre** | Le défaut mesuré (3 192 kcal servis pour 8 571) est un défaut de forme |
| Couloir par case | **À 2 mangeurs et plus** (ou conflit) | À un seul mangeur, l'intersection **est** son couloir : 20 répétitions pour zéro information |

### Ceux du lot D

| Question | Décision | Raison |
|---|---|---|
| Un déplacement conserve-t-il la masse ? | **Non — appariés ET unilatéraux** | ⚠️ **S'écarte du mot « transferts » du chantier.** Une boîte a un volume servi, une recette n'en a pas. **Mesuré** : avec les seuls appariés, PERTE plafonne à **120,6 pour 123 demandés** |
| « Les légumes » (plancher 70 %) | `cruciferous_veg`, `leafy_greens`, `non_starchy_veg` — **`starchy_veg` exclu** | Une pomme de terre est la CIBLE d'une densification |
| « Protéique » (plafond 150 %) | Les **dix** de `PROTEIN_SOURCES` | Un plafond ne fait que restreindre ; élargir ne rend jamais l'ajusteur plus agressif |
| Fromage et fruits à coque | **200 %**, à la lettre du chantier | ⚠️ **Ouverture connue, § 3** |
| « Condiment » | **Une ligne**, pas un groupe | Geler `sauce_dressing` figerait une vinaigrette pesée de 60 g |
| Arrondi | Dixième de gramme, **vers le départ** pour la source, **au plus proche** pour le receveur | Arrondir les deux bouts vers le départ biaise : **−2,383 g** de dérive sur 2 139 g contre **+0,784 g** |

### Ceux du lot E

| Question | Décision | Raison |
|---|---|---|
| La part d'une casserole pour l'ajusteur | **`1 / tirages`**, pas `uses.servings / servingsMade` — contre mon brief | La densité que le moteur **juge** est celle de `measurePlate`, qui divise par `draws`. Fermer un couloir calculé sur une autre part fermerait un défaut que le dimensionnement ne voit pas |
| Le groupe alimentaire d'un ingrédient | **Du référentiel**, pas de `DishIngredient.group` | Ce champ n'est demandé au modèle que si un régime est déclaré : sur la population sans régime il vaut `null`, et le plafond 125 % sur l'huile serait **désarmé sur la majorité des plans** |
| Où vit la traduction unités/consommateurs ? | **Un module neuf**, hors des 4 fichiers du périmètre | Sinon ~200 lignes intestables dans un `Deno.serve` de 14 500 lignes |
| `uses_mismatch` refuse quoi ? | **Le frais, pas les casseroles** | Une casserole est appariée par son `id`, stable. Et l'enquête mesure qu'une casserole partagée réécrite **améliore** des assiettes dont la réécriture directe a été refusée |
| Séparateur décimal des quantités réécrites | **Suit la ligne d'origine, point par défaut** | « 2 cuillères » → « 2.4 cuillères » en français. Le réparer demanderait un détecteur de langue maison. **Limite nommée** |

---

## 3 · Ce qui reste ouvert — à trancher, pas à oublier

### ⚠️ ① L'eau des lentilles : deux lots, deux réponses, 20 % d'écart

Le lot D a mesuré que GAIN lentilles/pain/feta **se ferme** si l'eau des lentilles est absorbée,
et reste ouvert à 129,7 pour un minimum de 146 si elle est conservée. Le lot B a décidé qu'elle
est **conservée**.

| `prep_lentil_ratatouille` | masse prête | densité |
|---|---:|---:|
| eau **conservée** (le code d'aujourd'hui) | **887 g** | **140,0** |
| eau **absorbée** | 741 g | **167,6** |

**Et sur ce cas précis, le code d'aujourd'hui a tort.** La casserole déclare 240 g de lentilles
sèches et 180 ml d'eau, mais le rendement fait déjà passer ces lentilles de 194 à ~479 g : elles
ont **déjà absorbé ~285 g d'eau dans le facteur**. Compter les 146 g déclarés en plus
double-compte 16 % de la masse. Et ces 180 ml ne peuvent pas rester au fond — 240 g de lentilles
sèches en réclament 480 à 600 pour devenir tendres.

**La règle que ça suggère** : un absorbant peut prendre `gramsCru × (rendement − 1)` grammes
d'eau ; l'eau déclarée **jusqu'à** cette capacité est déjà portée par le rendement, l'eau **au-
delà** est du bouillon et pèse. Déterministe, sans matcher de prose, sans champ à faire déclarer.
⛔ **Mais elle change aussi `prep_quinoa` (450 g d'eau) et `prep_couscous` (286 g)**, et je n'ai
pas pu valider cette bascule. **Non posée. Premier travail du matin, avec ses tests.**

### ⚠️ ② Le fromage à ×2

Fromage et fruits à coque tombent sous le plafond générique de **200 %**, à la lettre du
chantier. Conséquence **observée** : la feta finit à ×2,0 sur les deux plans, le pain aussi sur
GAIN. Doubler le fromage densifie **sans passer par la garde de l'huile** (bornée 75–125 %).
Le resserrer maintenant invaliderait les trois fermetures du lot D sans les re-mesurer.
**Décision produit à prendre.**

### ⚠️ ③ Le coût du prompt : +27,6 % sur le message utilisateur

Mesuré par le lot E, hors ligne, sur les consignes archivées :

| | avant | après | écart |
|---|---:|---:|---:|
| message utilisateur, 1ʳᵉ génération | 17 069 | 21 786 | **+27,6 %** |
| prompt entier | 35 068 | 39 785 | **+13,5 %** |

L'estimation du lot C (« +19 % ») était fausse **dans les deux sens** : le bloc est plus petit
que prévu, mais son dénominateur était le prompt entier. Vu que la durée de génération a déjà
atteint 144 s pour un plafond de passerelle à 150 s, **c'est le compteur
`keel.household_meal.prompt_cost` qu'il faut regarder au premier run réel.**

### ④ Ce qui n'a pas été fait

- **La boucle unique de réparation (P2) : non commencée.** Retirer les sept relances demande de
  construire les défauts depuis sept sites, d'unifier sept instructions, sept parseurs et sept
  règles d'acceptation, dans un handler de 14 500 lignes **sans banc d'intégration à réponses
  contrôlées**. Un demi-démontage de sept gardes est pire que zéro. **Les sept sites sont
  intacts.**
- **Le banc d'intégration à réponses contrôlées n'existe pas** (§ 4 du chantier). Ce qui existe
  rend un texte bidon que le parseur rejette. Détail et garde obligatoire dans
  `scratchpad/2026-09-11-CHANTIER-PREMIER-JET/RESTE-A-FAIRE.md` (R1).
- **La consigne de réparation demande encore le plan JSON complet** — la phrase vit dans
  `repairInstruction` (`portion_sizing.ts`), hors du périmètre du lot E.
- **Le catalogue ne connaît pas les exclusions douces** (`food.exclude`) : elles sont construites
  après le premier appel. Sécurité et règles de maison couvertes ; préférences non.
- **Trois autres appelants de `loadCompositionIndex`** restent au défaut `fr` :
  `meal-energy-v1:790`, `tracking_window_io:536`, `tracking_v2_io:241`.
- **`pate`** n'est pas départageable : `normalizeTerm` retire les accents, « pâte » et « pâté »
  deviennent la même chaîne. Seul un renommage de slug répare.
- **Aucune génération réelle.** Voir § 5 : le conteneur edge a démarré **avant** les
  modifications, et `docker restart` est interdit sous `functions serve`.

---

## 4 · Ce que l'humain doit lancer

```bash
supabase db push
```

La migration `20260911040000` (identité du référentiel, faux amis, validation) est appliquée
**en local seulement**. Le `db push` distant est le premier vrai run de ses blocs `check`.

---

## 5 · La recette du matin, dans l'ordre

**① Redémarrer le serveur de fonctions** — obligatoire, et c'est la seule façon correcte.
Le conteneur edge a démarré à **05:42** ; les modules ont été modifiés jusqu'à **07:42**. Le
runtime local sert une version périmée d'un `_shared` **modifié**, et `docker restart` sur ce
conteneur est **interdit** tant que `functions serve` tourne (le superviseur le fait boucler
create→start→kill toutes les 5 s, et les 502 ressemblent à des pannes de fonction).

Dans le terminal qui porte `supabase functions serve` : `Ctrl-C`, puis

```bash
./scripts/local_serve_functions.sh
```

(ce script relève Kong à 600 s **puis** lance `functions serve` — Kong y est déjà à 600 000 ms,
mais il retombe à 150 000 à chaque redémarrage du conteneur.)

**② Trancher la règle de l'eau** (§ 3 ①) avant toute campagne : c'est une règle de **mesure**,
et une campagne lancée avant fabriquerait des chiffres qu'il faudrait refaire.

**③ Alors seulement, la campagne** : six générations séquentielles de trois jours, deux
directions, N = 1 et N > 1, appétit et repas léger. Publier séparément le succès brut du modèle,
après ajustement sans rattrapage, après un et après deux. **Ce petit échantillon n'est pas une
estimation du taux de réussite en production** — le chantier le dit, et il a raison.

Les deux compteurs à regarder au premier run : **`keel.household_meal.prompt_cost`** (le prompt
a grossi de 27,6 % côté message) et **`reverted_after_measure`** de l'ajusteur (s'il monte, sa
prédiction de densité diverge de la vraie mesure — il n'a jamais été exercé contre elle).


---

## 6 · Le lot suivant, demandé par le propriétaire : découper le générateur

`supabase/functions/generate-household-meal-v1/index.ts` fait **15 714 lignes**, et c'est pire
que « un gros fichier » : il ne porte que **14 déclarations de premier niveau**. Après ~730
lignes d'imports et de constantes, tout le reste est le corps d'**une seule fonction** —

```
1207:Deno.serve(async (req) => {
```

— soit **~14 500 lignes dans un seul bloc**. Il n'y a donc rien à « ranger » : il faut extraire
des étapes d'un bloc unique, donc **nommer ses états intermédiaires**. C'est le vrai travail.

**Ce que sa taille a coûté cette nuit, mesurable :**

- le lot E n'a **pas pu** tourner en parallèle des quatre autres — un seul agent peut écrire
  dans ce fichier, donc tout ce qui le touche se met en file ;
- **P2 n'a pas pu être ouvert** : unifier sept relances dans un bloc de 14 500 lignes sans banc
  d'intégration à réponses contrôlées ne tient pas en une nuit, et un demi-démontage de sept
  gardes est pire que zéro ;
- `plan_repair_loop.ts` est écrit et éprouvé depuis des jours, et **à moitié branché** ; son
  propre commentaire de tête dit pourquoi : « une refonte du corps du générateur, pas un
  rebranchement » ;
- la pesée a dû être « remontée au-dessus des rattrapages » par un déplacement de ~1 700 lignes,
  parce qu'un **ordre d'exécution dans un fichier** tenait lieu d'architecture ;
- `PLAN_REPAIR_RESERVED_AFTER` accordait ses créneaux « dans l'ordre d'exécution du fichier » :
  déplacer un bloc rendait la table fausse **en silence**.

**⛔ À faire dans un lot à part, et surtout pas pendant qu'on change le comportement** — sinon
on ne saura plus lequel des deux a cassé quoi.

**Pistes de découpe, à valider** : admission et contexte · construction du brief · appel modèle
et repli · parsing et gardes de sécurité · pesée et dimensionnement · ajustement déterministe ·
boucle de réparation · application, boîtes et courses · écriture et réponse HTTP.

**Préalable utile** : le banc d'intégration à réponses contrôlées (R1 dans
`scratchpad/2026-09-11-CHANTIER-PREMIER-JET/RESTE-A-FAIRE.md`). Sans lui, une découpe de ce
fichier ne peut être prouvée que par des appels modèle payants.
