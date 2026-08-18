# EN FONCTION DE QUOI ON COMPOSE — design final de synthèse

*Base : design A (« le moteur d'abord »), le mieux noté en agrégat des quatre lentilles (29/40, contre 27,5 pour B et 24 pour C). Greffes : la doctrine maison et l'appariement `beliefKey` de B, l'invariant d'indiscernabilité et l'hygiène de données de C, plus les correctifs exigés par les défauts fatals des quatre revues — chacun traité nommément dans le corps du document.*

---

## 1. La décision en une page

On ne compose ni « aux calories », ni « aux protéines », ni « aux nutriments » : on compose selon une **hiérarchie fermée de grandeurs calculées en interne**, dont chaque étage a un statut — **plancher** (non négociable, produit), **pilotage** (décidé par LA doctrine qui gouverne la génération), ou **signal** (départage). Les nombres vivent dans une boucle déterministe (composer → vérifier → corriger) ; le prompt ne reçoit et n'émet que des **mots**. `NUMERIC_TARGET_PATTERNS` reste le filet, il cesse d'être le seul mécanisme.

**Ce tableau n'est pas une architecture universelle.** Les rangs 0-1 sont des planchers produit, valables pour tous. Les rangs 2-6 sont le CONTENU de la doctrine maison — la philosophie de Sophia, qui ne gouverne que les élèves sans coach. Un élève coaché est gouverné par la méthode de son coach, exprimée dans SA doctrine (§3) ; le coach ne voit ni ne manipule jamais ces rangs.

| Rang | Grandeur | Statut | Fondement |
|---|---|---|---|
| 0 | Sécurité (allergènes, interdits, plancher TCA, règles mineur) | **Plancher** — verrous existants, intouchés | — |
| 1 | Structure (rythme réel, préférences, déclarations de l'élève) | **Plancher d'adhérence** | Dansinger 2005, Sacks 2009 (POUNDS LOST), DIETFITS 2018 : l'adhérence est le seul prédicteur à 12 mois |
| 2 | Protéine (plancher quotidien ; ancre par repas) | **Pilotage — la doctrine gouvernante la place ; aucune doctrine ne peut l'éteindre** | Morton 2018, Helms 2014, Moore 2015 |
| 3 | Énergie **en bande** par dynamique | Pilotage | Murphy 2022, Garthe 2011, Helms 2023 |
| 4 | Densité énergétique (kcal/g) | Pilotage | Méta 38 RCT (−223 kcal/occasion), Hall 2019 |
| 5 | Couverture sentinelle micro (présence/absence hebdo) | Pilotage (durcit en plancher sous ~1550 kcal) | ANSES/NNR ; Nutrients 2018, Maillot/Darmon |
| 6 | Régularité, diversité végétale | **Signal** | Preuves faibles (Farshchi ; American Gut n=41 vs 44) |

**Quatre principes structurels :**

1. **Le noyau est un moteur de calcul déterministe** (design A) : un référentiel de composition (Ciqual, embarqué, versionné), un résolveur d'ingrédients en prose libre (jamais de vocabulaire fermé imposé au générateur), des quantités structurées demandées au modèle et **recalculées** par le parseur, des enveloppes par dynamique, des verdicts en bande avec abstention avant erreur, une boucle de correction à jetons fermés sans aucun chiffre.
2. **Une génération = une doctrine** (design B) : la philosophie de Sophia n'est pas un chemin de code parallèle. Le coach maison existe déjà (`doctrine_delegation.ts`, `DOCTRINE_SOURCES = ["own","house"]` ; l'inscrit libre est déjà l'élève ordinaire d'un coach ordinaire à doctrine publiée). Le pilotage de Sophia vit dans la doctrine maison, au même format que celui de n'importe quel coach — un seul chemin de code, une philosophie versionnée, mesurable par version de doctrine dans `generated_from`. Quand un coach existe, sa doctrine **remplace** intégralement, jamais ne fusionne.
3. **`off` retire l'arbitre, jamais l'instrument, jamais un plancher** (convergence des trois designs) : un coach éteint des verdicts, pas le calcul interne ni les planchers. Les planchers ne sont pas des grandeurs, donc pas dans la liste fermée, donc structurellement non désactivables.
4. **Le flag TCA écrête, ne reroute jamais, et est illisible en sortie** (A + B + C) : mode `per_portion` dont le type ne porte structurellement aucun champ par-kg **ni plafond de densité**, atteint par une **branche unique** partagée avec le cas corps-inconnu, prouvée par égalité de chaînes — le statut ne peut se lire dans aucune sortie.

---

## 2. La philosophie Sophia seule

### 2.1 Le noyau de calcul

**Référentiel** : table `food_composition_refs` (slug réutilisant `food_items` là où ils existent, FK vers les **30 groupes `FOOD_GROup_REFS` existants** — jamais une seconde taxonomie, défaut fatal de B), valeurs pour 100 g **crus** (énergie, protéines, glucides, lipides, fibres), drapeaux sentinelles **booléens** (`omega3_marine`, `iron_source`, `calcium_source`, `iodine_source`, `zinc_source`, `b12_source`, `folate_source` — jamais des mg : variance sol/saison/cuisson ±30-50 %), `yield_class` (rendement cru→cuit), `atwater_discount` (~0,72 pour fruits à coque entiers, Novotny 2012). Source Ciqual (ANSES, Etalab), extraite et versionnée en migration. La vitamine D **sort du moteur** : non couvrable par l'aliment, drapeau côté coach.

**Résolveur** : prose libre du générateur + appariement déterministe (`normalizeForMatch` du `forbidden_matcher` — jamais une seconde normalisation), égalité exacte + table d'alias fermée et curée. Terme non résolu = **écarté et compté** (`unresolved_terms`), jamais deviné. Le **cliquet** : chaque terme non résolu en production est une ligne de worklist d'alias — coût de curation permanent, **payé par une passe ops hebdomadaire pilotée sur `resolution_coverage`** (le design A l'admettait sans nommer le payeur ; c'est nommé ici).

**Quantités structurées** : le contrat du générateur gagne `amount` / `unit` (liste fermée : g, ml, unit, tbsp, tsp) / `state` (raw/cooked) à côté de `quantity` prose (inchangée, `ENERGY_UNIT_RE` intact). Le parseur **recalcule** les grammes lui-même (conversions via `typical_amount`/`count_axis` existants, cuit→cru via `yield_class`) — l'arithmétique du modèle n'est jamais une preuve (précédent `in_pantry`). Champ non convertible ⇒ `null` **compté**, jamais défaut-é. Un ingrédient inconnu propage **de l'inconnu, pas du zéro**.

**Biais corrigés, bruit accepté** : poids crus, imputation d'huile de friture (12 % du poids cuit, lexique fermé de méthodes), décote Atwater. Aucune décision du moteur ne dépend d'un écart sous sa bande d'erreur.

### 2.2 Les enveloppes par dynamique (internes, jamais affichées, jamais dans un prompt)

Module pur `meal_envelope.ts`, deux formes qui ne se mélangent pas :

```ts
type Envelope =
  | { mode: "per_kg";
      energy: { low: number; high: number } | null;
      proteinFloorG: number;
      proteinPerMealG: number | null;   // non-null ssi 60_plus, muscle_gain ou recomposition
      densityCeiling: number | null; }
  | { mode: "per_portion";
      // AUCUN champ par kg, AUCUN densityCeiling : l'état illégal est irreprésentable
      proteinPortionPerMeal: true; };
```

`envelopeFor(goal, body, ageBand, steering, restrictionFlag)` — **tous les paramètres requis**, fail-closed. Sous flag OU corps absent ⇒ `per_portion`, par **une seule branche**, testée par égalité de chaînes (invariant de C) : la consigne d'un élève flaggé et celle d'un élève au corps inconnu sont identiques caractère pour caractère. `envelope_mode` est stocké dans `generated_from` **sans la raison** — le statut restriction est dérivé à la lecture (`restriction_runtime`), jamais écrit.

**Correctif du défaut fatal partagé (TCA)** : le mode `per_portion` ne porte **pas** de plafond de densité. Sous flag, toute pression de minimisation dérivée de l'objectif (densité, direction d'énergie) est structurellement absente — « rien ne compte à rebours » vaut aussi pour la version sans compteur. Ce qui survit en `per_portion` : ancre protéique (présence), fréquences sentinelles, structure, préférences — tout ce qui vit côté aliment sans viser.

| Dynamique | Énergie (vs maintenance M) | Protéine (g/kg/j) | Spécifique |
|---|---|---|---|
| `fat_loss` | [M−25 %, M−15 %], **plafond 500 kcal/j** (Murphy 2022 ; Garthe 2011 : lent > rapide pour la masse maigre) | 2,0–2,7 (IC Morton 2018 ; borne haute rationale Helms 2014) | plans >8 sem : semaines à maintenance insérées, présentées soutenabilité, jamais « relance métabolique » (MATADOR non répliqué) — **débrayable par le coach** (§3) |
| `muscle_gain` | [M+5 %, M+10 %] (Helms 2023 : au-delà, des plis cutanés, pas du muscle) | 1,6–2,2 (Morton 2018) | ancres protéiques réparties sur 3-4 prises déclarées (placement, pas contenu) |
| `recomposition` | [M−5 %, M+5 %] | ≥2,0–2,2 (Barakat 2020) | même placement que muscle_gain |
| `performance` | [M, M+10 %] | 1,6–2,2 | **seule** dynamique avec `carb_timing` (Impey 2018), inerte sans jours d'entraînement déclarés |
| `health` | [M−5 %, M+5 %] | 1,6 | sentinelles promues rang 2 |
| `maintenance` | [M−5 %, M+5 %] | 1,6 | contraintes minimales |

Le tableau est cohérent (correctif du défaut fatal science de A) : la distribution par repas change une branche dans **trois cas exactement** — `60_plus` (≥1,2 g/kg/j **et** ancre ~0,4 g/kg sur ≥2-3 repas, Moore 2015, PROT-AGE), `muscle_gain` et `recomposition` (placement). Partout ailleurs, un paramètre de distribution serait décoratif (Schoenfeld 2013 : nul hors seniors) — il n'existe pas, et aucun cadran coach ne le crée (le `meal_protein_distribution` de C est écarté, §8).

**La branche « élève maigre » n'existe pas** (défaut fatal de B et C) : détecter la maigreur exige une composition corporelle ou un IMC que la donnée n'a pas et que `meal_body.ts` interdit. Branche non mesurable = branche non écrite.

### 2.3 Maintenance estimée : deux régimes de verdict (correctif du défaut fatal science de A)

Mifflin-St Jeor × 1,5 est une estimation à **±20 %** quand l'activité est inconnue — empilée sur ±10-15 % table+cuisson, elle est plus large que la bande muscle_gain (5 points). En conséquence :

- **Régime « direction »** (dès le premier jour) : le verdict énergie ne dit que le sens grossier (`above` / `below` / `within`) au-delà du bord de bande **× 1,10, bande gonflée de l'incertitude initiale**. Pour les dynamiques à bande étroite (muscle_gain, recomposition), seul « au-dessus / au-dessous de la maintenance estimée » est arbitré.
- **Régime « bande »** (fin) : armé pour un élève seulement après **ré-ancrage sur l'observé** — `trendOf` (existant, seuils de bruit 1 kg / 2 cm), tendance contraire ≥3 semaines ⇒ décalage du centre de 5 %, cumul plafonné à 10 % (≈ la thermogenèse adaptative de 100-300 kcal/j, Rosenbaum & Leibel), jamais sous le plancher de couverture.

Le ré-ancrage n'est plus « invisible » (défaut fatal coach de A) : il est un champ nommé du pilotage (`recalibration: "observed_trend" | "static"`, défaut `observed_trend`), débrayable par doctrine, et son effet apparaît en agrégé dans la synthèse coach.

### 2.4 Verdicts : sincérité et non-blocage

```ts
interface CompositionVerdict {
  resolution: { resolved: number; total: number; unresolvedEnergyDense: boolean };
  energy:   "within" | "above" | "below" | "not_computable";
  protein:  "met" | "under" | "not_computable";   // en GRAMMES calculés via le référentiel
  density:  "within" | "above" | "not_computable";
  sentinels: { missing: FoodGroupRef[] };           // échelle semaine
}
```

- **Abstention avant erreur** (A) : résolution <80 % en nombre d'ingrédients, OU un seul ingrédient non résolu de classe dense (matières grasses, fruits à coque, sucres) ⇒ `not_computable`. **Densité** : abstention supplémentaire quand la méthode appartient au lexique fermé des préparations aqueuses (soupes, bouillons, mijotés) — l'eau de cuisson n'est pas un ingrédient grammé, le kcal/g calculé y serait du bruit (correctif science). Les plafonds de densité (~1,3 fat_loss / ~1,8 ailleurs) sont des **constantes opérationnelles avouées**, calibrées pendant la phase observe-only, pas des seuils prétendus issus de la littérature (la méta 38 RCT prouve la direction, pas le seuil).
- **La protéine est mesurée en grammes** (correctif du défaut fatal science de B) : le référentiel rend le contenu protéique calculable ; « eggs » à 6 g ne passe plus une vérification de simple présence. La consigne, elle, reste qualitative (« a full protein food as its anchor ») — jamais « 30-40 g de protéines » (le gramme de nutriment de B est écarté : mauvais côté de la frontière aliment/personne). En `per_portion`, le seuil est une constante **côté plat** (protéine du repas calculée depuis la recette), jamais dérivée du corps. Cela résout aussi le défaut de l'ancre de C : 200 g de légumineuses cuites qui ne portent pas la protéine sont détectées par le calcul, pas masquées par la présence du mot.
- **Verdict ≠ blocage** : seul le verrou binaire de sécurité vide un repas. Un plan hors bande **part** après la boucle de correction — un plan imparfait bat un plan absent. Aucun refus visible à l'élève n'est déclenché par un calcul calorique (l'oracle `energy_floor_uncoverable` de C est écarté) : le plan sort, le drapeau `coverage_unsatisfiable` va au coach au niveau **doctrine/dynamique**, jamais nominatif.
- **Préséance adhérence, exécutable** (règle de B, salvage science) : aucune grandeur de pilotage ne rejette ni ne fait recorriger une composition pour un écart **dans sa bande d'erreur** quand la corriger sacrifierait une déclaration de l'élève (préférence, rythme, contrainte pratique). Un interdit gagne sur une envie ; une optimisation ne gagne jamais sur une déclaration.

### 2.5 La boucle de correction — les nombres dans la boucle, les mots dans le prompt

Verdict hors bande ⇒ **un** retry (pattern `doctrineRetryInstruction`) avec un jeton d'une liste fermée, chaque jeton portant sa phrase anglaise **sans aucun nombre et sans registre de régime** :

```
raise_protein_component: "give each main meal a full protein food as its anchor"
lower_added_fat:         "cook with less added fat; move richness to whole foods"
lower_density:           "add a voluminous vegetable component to each main meal"
raise_energy:            "make portions more generous, especially starch and added fats"
lower_energy:            "keep portions moderate; vegetables carry the volume"
place_missing_sentinel:  "include <group label> once this week"
```

**Ceinture lexicale nouvelle** (correctif du défaut fatal TCA de B) : un lexique fermé `DIET_REGISTER_LEXICON` (deficit, surplus, cut, restriction, calories…, EN+FR) est testé contre **toutes les constantes de prose** du chantier (jetons, accents, blocs de consigne). Le « modest, livable deficit » de B est exactement ce que ce test refuse : `findNumericTarget` mord sur les chiffres, pas sur le mot « déficit », et l'accent est ce que le modèle échoe dans les `why` visibles. La direction d'énergie s'exprime en générosité/modération de portions, jamais dans la langue du régime.

La sortie du retry repasse par **tous** les verrous et le même vérificateur. Chaque jeton a sa branche nommée (un verdict sans jeton mappé ne compile pas — patron `dishCapFor`). Les sentinelles : zéro occurrence d'un groupe sur la semaine = trou = **recette placée** (« poisson gras mardi »), jamais un mg.

### 2.6 Le plancher de couverture (~1550 kcal)

Si l'énergie **du plan** (calculée depuis les recettes — côté plan, pas côté personne : le plancher reste donc armé même en `per_portion`) passe sous ~1500-1600 kcal/j, les fréquences sentinelles deviennent contraintes dures (Nutrients 2018 ; Maillot/Darmon). Non satisfaisable après correction ⇒ le plan sort quand même, drapeau coach niveau doctrine/dynamique. Fail-closed sur la prétention : `coverage_unverified` quand non calculable, jamais un vert par défaut. Le plancher ne fait qu'**ajouter** de la couverture — sa direction est protectrice, jamais restrictive.

---

## 3. La méthode du coach, rendue exécutable

### 3.0 Le sens de l'autorité — la surface coach est sa doctrine, jamais les axes du moteur

Le coach ne « règle » pas le moteur de Sophia et n'en voit jamais la hiérarchie. Son interface reste ce qu'elle est : sa doctrine et ses recommandations alimentaires — déjà injectées dans la génération (FF-030). Ce qui s'ajoute est une **question de doctrine**, posée dans son éditeur comme les débats du point de départ (`STARTER_FORKS`, `doctrine_starter.ts`) : « sur quoi pilotes-tu une assiette ? qu'est-ce que tu refuses de compter ? ». Sa réponse est une conviction dans sa voix ; la forme compilée ci-dessous (§3.1) en est **dérivée à la publication**, comme `compileDoctrineBlock` dérive le bloc chat des beliefs. Le coach écrit sa méthode ; le compilateur en tire les jetons — jamais l'inverse. Ses `FrequencyRule` existantes sont déjà exactement ce mouvement : « saumon 2×/semaine » est écrit dans son langage et exécuté par le moteur sans qu'il ait jamais vu un axe.

### 3.1 Modèle de données : une colonne de doctrine, pas une table à part

**Ce bloc est la forme COMPILÉE des réponses du coach, jamais un formulaire qui lui est montré.**

Colonne `coach_doctrines.composition_steering jsonb NOT NULL DEFAULT '[]'`, parsée strictement dans `parseCoachDoctrine` (entrée malformée écartée **et comptée**). Le choix contre les tables SQL de C est assumé : la méthode de composition du coach doit vivre **sur l'objet doctrine** versionné/publié/rollbackable (précédent `dailyPractices`, doctrine.ts:307-320 — un rollback la ramène avec le reste, la version part dans `generated_from`, publication atomique). Le DDL de C était par ailleurs invalide (PK sur expression). Les CHECKs de C sont remplacés par la validation de publication à erreur bruyante.

```ts
const STEERING_AXES = ["protein", "energy", "proportions", "satiety_density",
                       "micro_coverage", "carb_timing", "plant_diversity"] as const;

interface SteeringEntry {
  goal_scope: GoalToken | null;            // parseGoalScope existant
  priorities: SteeringAxis[];              // ordre imposé, dédupliqué
  off: SteeringAxis[];                     // "protein" y est ILLÉGAL (validation bruyante)
  belief_key: string | null;               // la posture citable (§3.2)
  proportions: { protein_share: "standard"|"high";
                 carb_share: "low"|"standard"|"high";
                 fat_share: "low"|"standard"|"high"; } | null;  // ssi "proportions" prioritaire
  protein_range: "standard" | "high" | "very_high";     // tokens → enveloppes fermées du moteur
  surplus_style: "lean" | "standard" | "aggressive";    // muscle_gain seulement
  deficit_style: "gentle" | "standard";                 // PAS de token aggressive — exprès
  maintenance_weeks: "auto" | "off";                    // la périodisation est une OPINION débrayable
  recalibration: "observed_trend" | "static";
  carb_timing: "off" | "around_sessions";               // rejeté hors performance, compté, dit à l'écran
}
```

Correctifs incorporés :

- **La protéine est réordonnable, jamais éteignable** (défaut fatal science de A : la grandeur à la preuve la plus forte du corpus était extinguible pendant que `plant_diversity` restait exposée). `"protein" ∈ off` ⇒ erreur de publication bruyante.
- **L'asymétrie du schéma encode l'asymétrie de la preuve** (salvage C) : `surplus_style: "aggressive"` existe — c'est le véhicule explicite qu'exigeait Helms 2023 et que B promettait sans champ (défaut fatal coach de B) ; `deficit_style` n'a délibérément aucun token agressif (**arbitrage A1**, §7 — le token est absent du type, pas rejeté par un `if`).
- **Le gabarit de proportions est déclaré** (salvage A → comble le trou de B) : le coach « proportions » dit **lesquelles**, en jetons fermés.
- **Les opinions de Sophia deviennent débrayables** (défaut fatal coach de A) : semaines à maintenance et ré-ancrage sont des champs nommés du steering, pas des planchers déguisés.
- **Le coach voit ce que sa réponse produit** (défaut fatal coach de A) : l'écran doctrine affiche l'effet de chaque position en langage plan/aliment (« avec cette réponse, la protéine porte au moins un quart de l'énergie du plan ; tes élèves ne verront jamais ce chiffre »). La règle zéro-chiffre est un plancher **face à l'élève**, pas une raison d'aveugler l'auteur d'une méthode.
- **Une seule grandeur primaire par objectif**, validée à la publication (B). Entrées rejetées au parse : comptées, nommées, **montrées à l'écran coach** (A) — pas de repli silencieux.

### 3.2 Posture citable ↔ jeton exécutable (greffe B, unanimement saluée)

Quand le coach règle une grandeur, il peut écrire sa phrase (« les calories c'est du vent — on pilote aux proportions »). La publication écrit **deux choses** : une `DoctrineBelief` ordinaire (citable, elle entre dans `compileDoctrineBlock`, la lane chat la sert) et l'entrée de steering qui pointe vers elle par `belief_key`. Le moteur ne lit que le jeton ; le chat ne lit que la conviction. **Aucun parseur de prose, nulle part.** `belief_key: null` ⇒ le moteur exécute, le chat n'invente rien (« SILENCE IS NOT A POSITION »).

### 3.3 Où ça vit — hash de cache intact

`composition_steering` suit `dailyPractices` : porté par `CoachDoctrine`, **exclu de `compileDoctrineBlock`** ⇒ hash du bloc chat inchangé pour toute la base, zéro refragmentation. Le seul toucher de consigne passe par `steeredFocus(goal, steering)` qui **enveloppe** `focusFor` (patron `weekEmphasis`) — condition de désarmement testée par égalité de chaînes. Les lignes de pilotage vivent dans les couches per-cohorte/per-student de l'assemblage, en aval du bloc cacheable ; l'ordre d'`assembleTurnPrompt` est le contrat, la DEMANDE reste en dernier (récence).

**Le test de désarmement, défini sans contradiction** (défaut fatal coach de B) : le référentiel est la **version courante du produit**, pas les octets d'avant le chantier. Un changement de consigne produit (ex. l'ancre protéique de l'étape 1) est versionné par `MEAL_PROMPT_VERSION` et s'applique à tous — c'est le produit qui avance. Le test dit : coach sans steering ⇒ consigne identique au caractère près à la baseline sans-steering **de la même version** ; élève dont on ne sait rien ⇒ zéro ligne nouvelle.

**Coach muet** : le défaut mécanique est l'**ordre** de Sophia (quels axes arbitrent, dans quel ordre), anonyme, jamais une conviction maison citée. Le **contenu** maison (la table complète de cadences ANSES : noix 4×/sem, etc.) ne gouverne pas une cohorte coachée — seule la **détection sentinelle** (zéro occurrence d'un groupe = trou = recette placée) s'applique, parce qu'elle est un mécanisme produit (arbitrage n°2), pas une opinion. C'est la ligne qui corrige le « contenu Sophia sous un coach » de B (**arbitrage A2**, §7 — la frontière mécanisme/contenu doit être lisible dans le code, deux structures distinctes).

### 3.4 Les fréquences du coach : zéro schéma nouveau

L'axe `micro_coverage` consomme les `FrequencyRule` **déjà écrites** sur `coach_food_items` (gabarits fermés existants, indexés sur les 30 `FOOD_GROUP_REFS`). La clause qui le sanctionne vit dans `food_items.ts` (l.36 : une règle par aliment « gouverne ce que Sophia construit ») — attribution corrigée, ce n'est pas `food_packs.ts`. Le vérificateur compte les occurrences par semaine dans le plan : « saumon ≥2/semaine » devient exécutable sans un octet de schéma coach nouveau.

### 3.5 Les trois coachs types

- **« Les calories c'est du vent »** : `off: ["energy"]`, `priorities: ["micro_coverage","protein","satiety_density"]`. Plus aucun verdict énergie ne corrige sa cohorte ; l'accent ne parle plus de générosité/modération. Le moteur **continue de calculer** (mesure ≠ pilotage) : plancher de couverture et plafond de déficit restent armés. Sa synthèse montre les métriques de **sa** grandeur — l'énergie de sa cohorte n'y figure plus (contrat d'affichage scopé par le steering, salvage B).
- **« On pilote aux proportions »** : `priorities: ["proportions","protein"]` + gabarit rempli. Le vérificateur calcule les parts d'énergie du plan par macro (calculables grâce au référentiel — des chiffres sur le PLAN, jamais affichés), jeton de correction dédié (« build plates around protein and vegetables; starch as a side »).
- **« Nutriments d'abord »** : `priorities: ["micro_coverage",...]` + ses `FrequencyRule`. `place_missing_sentinel` devient le premier jeton servi.

### 3.6 Hiérarchie de préséance (fixe, testée)

1. **Contraintes médicales structurées** — `safetyConstraintsPromptBlock`, en tête, verrou binaire intact.
2. **Plancher TCA** — `restrictionFlag` requis fail-closed. Sous flag, le steering est **écrêté, jamais rerouté** (correctif du défaut C : Sophia ne choisit pas la grandeur de remplacement du coach) : les axes `energy` et `proportions` n'ont structurellement rien à piloter (le type `per_portion` ne porte pas les champs), `satiety_density` est désarmée (§2.2), le reste survit tel quel. La dégradation vit **dans la fonction pure** (`applyPiloting`, patron B), jamais chez l'appelant. Le verdict énergie **n'existe pas** pour cet élève — pas émis, donc ne peut fuir vers aucun écran, log ou agrégat (patron B « non-existence plutôt que suppression »).
3. **Ceintures produit** (hors liste des grandeurs, donc non désactivables) : plancher de couverture, plafond de déficit 500 kcal/j (**arbitrage A1**), règles mineur, filtres numériques.
4. **Interdits de la doctrine gouvernante** — globaux, jamais bornés par objectif (existant).
5. **Déclarations de l'élève** — préséance adhérence (§2.4).
6. **Steering de la doctrine gouvernante** — réordonne et éteint (sauf protéine) à l'intérieur de tout ce qui précède.

---

## 4. La résolution foyer

### 4.1 L'algorithme

1. **Verrou de lane d'abord** (position A, la seule sûre) : si **un** membre du foyer est sous `restriction_flag`, la lane foyer **entière** passe en `per_portion` — aucune enveloppe, aucun delta dimensionné, directions de service qualitatives existantes seulement. Le tronc qu'une personne flaggée mange ne peut pas être dimensionné sur les enveloppes de déficit de ses co-membres (le défaut fatal partagé de B et C). Ce choix est fondé sur l'arbitrage n°5 lui-même — la citation de `household_restriction_lock` par le design A était fausse (c'est le verrou de texte des règles de maison) et n'est pas reprise : le comportement tient sans elle.
2. **Doctrine du tronc** : le membre de référence est **déclaré** à la configuration du foyer (colonne — R5, le code branche dessus ; salvage B), jamais dérivé d'une métrique ni d'un ordre d'objectifs. **Défaut quand non déclaré : le membre qui compose la session** (A) — composer est un geste visible de tous, aucune information cachée ne fuit. L'ordre déterministe par objectifs de B est écarté : combiné à la citation de la doctrine du référent, il rendait l'objectif d'un membre inférable par tout le foyer (défaut fatal TCA n°1). Un mineur n'est jamais référent. Le coach d'un membre non-référent est **prévenu dans sa synthèse** que sa méthode n'atteint que la couche add-on de son élève (B).
3. **Sécurité du tronc** : union des contraintes médicales de tous + union des **`forbidden`** de toutes les doctrines gouvernantes (un interdit est global par construction). Les **`discouraged` d'une doctrine non-référente ne gouvernent pas le tronc** (correctif du veto doux de B) : des opinions n'ont pas prise sur l'assiette commune d'élèves d'autres coachs ; elles gouvernent les add-ons de leur propre membre. `findDoctrineViolations` tourne N fois sur le tronc (une par doctrine distincte), une fois par add-on. Union d'interdits rendant le tronc incomposable ⇒ refus nommé `household_trunk_unsatisfiable`, message qui **nomme des aliments, jamais des membres, des coachs ni des objectifs** (règle d'écriture de C, généralisée à tout message d'échec).
4. **Le tronc** : dimensionné dans le **moteur** (jamais dans le prompt — le corps reste `null` dans la lane foyer, contrainte existante) sur le **MIN des enveloppes adultes calculables** — la seule arithmétique compatible avec « on ajoute, on ne retire jamais ». Un adulte sans enveloppe compte pour « portion standard », jamais pour une portion réduite. Zéro enveloppe calculable = cas **nominal** (Gorin 2018 : composer le foyer autour d'une structure saine bénéficie à tous sans cible) : le tronc se compose comme aujourd'hui, structure seulement. Sentinelles vérifiées **au niveau du tronc** : couvertes là, elles couvrent tout le foyer gratuitement (C).
5. **Deltas additifs** : catalogue fermé, ordre de préférence dicté par la frontière du stigmate (une quantité différente du même aliment est neutre ; un aliment différent se voit) : (a) **plus du même** (part protéique élargie, féculent doublé) ; (b) **accompagnement usuel servi à part** (pain, riz) ; (c) slot de personnalisation au dressage — **hors périmètre de la première livraison** (arbitrage A3). C'est une extension du contrat du générateur, pas un acquis : l'affirmation contraire du design A est vérifiée fausse, `GeneratedDish` n'a que title/slot/day/ingredients. Il ne s'arme qu'en 2e itération, et seulement sur mesure de l'écart résiduel — qui doit donc être instrumenté dès l'étape 7. Les canaux (a) et (b) portent seuls la divergence la première saison. Chaque add-on est un `{ food_ref, grams, moment: "cooking"|"plating" }` — des grammes d'ALIMENT, structurés, **sans prose à assainir** (la vertu notée par la revue TCA). Précédent chiffré : fortification alimentaire gériatrique, +250-450 kcal/j par enrichissement invisible du plat commun. Jamais un plat séparé.
6. **Vérification par membre** : `applyKeelOutputLocks` tourne sur tronc+deltas(M) dans le contexte doctrinal de M — l'add-on d'un membre ne peut pas contenir un aliment que SON coach interdit. Fréquence d'une doctrine non-référente insatisfiable via les add-ons de son membre ⇒ issue **agrégée** dans la synthèse de son coach (compteur de cohorte, jamais nominatif — le canal `group_frequency_unmet_for_member` de B est écarté, défaut fatal TCA n°8).

### 4.2 Mineur (Satter, structurel — la version de C)

`goal: null` par construction, `student_goals` jamais lu, `CHILD_DIRECTION` une taille jamais une direction, aucune enveloppe, aucun delta dérivé d'un objectif. Les add-ons énergétiques (féculents) sont rendus en **service familial** (plat au centre, chacun se sert) quand un mineur est à table : l'adulte décide quoi/quand/où, l'enfant décide combien. Personne à table ne peut lire qui « fait attention » : même nourriture, quantités auto-servies ou dressées en cuisine.

### 4.3 Rendu et confidentialité

Les deltas sont des instructions de dressage au chef (« assiette de X : +80 g de riz, poids cuit »). Ne sortent **jamais** : la raison, l'objectif, un différentiel lisible, toute mention de corps ou de flag. `sanitizePortionNote` (mode audit, mise à `null`, jamais de réécriture, même `forbidden_matcher`) reste la ceinture sur toute prose. La divergence n'est **ni affichée ni interrogeable** : aucune surface foyer ne rend de comparatif entre assiettes.

---

## 5. Le contrat d'affichage

| Surface | Calculé (invisible) | Montré | Jamais |
|---|---|---|---|
| Élève — plan, Today, PDF, chat | enveloppes, verdicts, densité, parts, sentinelles | recettes grammées (« 400 g de cuisses de poulet »), méthode citant la doctrine, fréquences en aliments (« du poisson deux fois cette semaine »), suggestions food-based | tout chiffre d'énergie/macro sur la personne, toute enveloppe, tout verdict, tout score/adhérence — `findNumericTarget` + `ENERGY_UNIT_RE` inchangés, chacun son périmètre |
| Élève — bilan hebdo | recalibrage sur la trajectoire observée | questions sur les **écarts d'exécution** (plats sautés, substitutions — chantier week-review inchangé) | « qu'as-tu mangé », tout chiffre, le recalibrage lui-même |
| Coach — écran doctrine | — | son steering **avec le sens de chaque token** en langage plan/aliment, ses fréquences, les entrées rejetées au parse (comptées, nommées), drapeau `coverage_unsatisfiable` niveau doctrine/dynamique | tout nominatif |
| Coach — synthèse | verdicts agrégés cohorte | compteurs par nom, **scopés par son steering** (l'énergie absente si `energy: off` — sa grandeur remplace), effet du ré-ancrage en agrégé, flag vitamine D, `rejected_numeric` | tout agrégat sous **k=5 élèves** (plancher d'anonymat, arbitrage A4 — correctif du défaut fatal TCA de A : l'inférence par soustraction ; s'applique à TOUT agrégat dérivé de verdicts, y compris les compteurs d'apparence inoffensive), tout compte brut permettant N−1 ; les élèves sous flag sont absents des agrégats dérivés d'enveloppes **sans trou étiqueté** |
| Foyer — chef | enveloppes/deltas | tronc + add-ons en grammes d'aliment par assiette | raisons, objectifs, différentiels, flags |
| Foyer — table | — | note de portion assainie ou `null` | tout ce que `FORBIDDEN_PORTION_TERMS` matche ; tout comparatif |
| Interne | tout : `envelope_mode` (sans raison), verdicts, `resolution_coverage`, `unresolved_terms`, jetons servis, versions doctrine + `MEAL_PROMPT_VERSION` | — | — |

Toute table interne nouvelle (`food_composition_refs`, alias, audit) naît avec **REVOKE `authenticated`/`anon` immédiat, lecture service-role, et réclamation par le lifecycle RGPD dès la migration** (hygiène de C — les deux mémoires du repo : privilèges par défaut, lifecycle qui ne réclame pas les tables neuves).

---

## 6. Le chemin d'implémentation

Chaque étape livrable seule, condition de désarmement testée par égalité de chaînes, bump `MEAL_PROMPT_VERSION` si et seulement si la consigne change, `rejected_numeric` surveillé après chaque bump. Bar des 3 mois (défaut fatal faisabilité de A) : le périmètre engagé est **étapes 1-4** ; 5-8 s'arment sur preuve.

1. **L'ancre protéique de bout en bout** (la tranche de B, la plus livrable des trois designs — sans moteur de calcul). `PROTEIN_SOURCES` = sous-ensemble des 30 `FOOD_GROUP_REFS`, lexique EN+FR sur `forbidden_matcher`, ligne de consigne + vérif de présence + verdict `protein_source_missing` + un retry + pass-with-issue, dans `parseGeneratedMeal` et `parseWeekPlan`. Bump version. Livrable : chaque repas principal porte sa protéine, mesuré avant/après.
2. **Le référentiel, en ombre**. `food_composition_refs` + alias (seed Ciqual ~300 entrées, REVOKE+RGPD), `food_composition.ts` (résolveur, conversions, rendements, décote), rejeu sur les `student_generated_meals` existants ⇒ chiffre de couverture. La mesure décide de la taille de la table d'alias ; la worklist ops démarre. Zéro assiette changée.
3. **Quantités structurées**. `amount/unit/state` au contrat (prompt ET parseur, bump), `gramsRaw` recalculé côté parseur, non-convertible ⇒ `null` compté. Les deux appelants listés par le compilateur (paramètres requis).
4. **Enveloppes + verdicts en observation**. `meal_envelope.ts` (deux types, branche dégradée unique testée par égalité de chaînes) + `meal_verdict.ts` (abstention, deux régimes énergie, protéine en grammes). Verdicts **écrits, pas actionnés**. Hash de prompt inchangé pour tous. Gate d'armement : sous 80 % de couverture médiane, on n'arme pas la suite.
5. **La boucle de correction**. Jetons fermés + test `DIET_REGISTER_LEXICON` sur toutes les constantes de prose + retry unique, sortie repassée par tous les verrous. Bump. Mesure de la distribution des verdicts avant/après.
6. **Steering coach + pilotage maison**. Colonne `composition_steering`, parse strict, validations de publication (protein jamais off, une primaire par objectif, carb_timing hors performance rejeté et dit), `applyPiloting` pur (goal et restrictionFlag requis), `steeredFocus` wrapper, appariement `belief_key`, écran coach avec sens des tokens, branchement `micro_coverage` sur les `FrequencyRule` existantes. Le pilotage de Sophia est publié dans la **doctrine maison** (ligne `coach_doctrines` du coach maison existant) — même format, un seul chemin de code, version dans `generated_from`. Tests : bloc chat octet-identique, `doctrineCacheFootprint` inchangé.
7. **Foyer**. Colonne membre de référence (déclarée, défaut = compositeur de session), verrou de lane sous flag, MIN des enveloppes adultes, union des `forbidden` (pas des `discouraged`), catalogue d'add-ons structurés **sans le slot de dressage** (arbitrage A3), instrumentation de l'écart enveloppe-cible/enveloppe-atteinte par membre (c'est elle qui armera ou non la 2e itération), vérification par membre, `sanitizePortionNote` sur toute note, synthèses non-référent informées.
8. **Sentinelles + plancher de couverture + ré-ancrage**. Détection présence/absence hebdo, durcissement sous ~1550 kcal, drapeau coach doctrine/dynamique, recalage borné sur `trendOf`, plancher k=5 sur les agrégats. Ferme la boucle avec le bilan hebdo existant.

---

## 7. Les arbitrages — rendus par le propriétaire le 2026-08-10

Les quatre forks du design de synthèse ont été tranchés, tous dans le sens de la recommandation. Ils ne sont plus ouverts : ce qui suit est du contrat, et chaque décision porte la contrainte qu'elle impose au code.

**A1 — Le plafond de déficit (500 kcal/j) est un plancher produit, non débrayable.**
Aucun token `deficit_style: "aggressive"` n'existe, et l'asymétrie avec `surplus_style` (qui, lui, a son `"aggressive"`) est la forme que prend la décision dans le schéma. Deux fondements indépendants du muscle : au-delà de ~500 kcal/j l'énergie du plan passe sous le seuil où la couverture micro devient mathématiquement improbable (Nutrients 2018, Maillot/Darmon) ; et un moteur qui **exécute** de la restriction rapide est exactement le produit que le plancher TCA existe pour ne pas être.
*Ce que ça coûte, et qui est accepté :* un coach « sèche agressive » ne peut pas exprimer sa méthode. Il gardera sa conviction citable dans le chat ; le moteur ne l'exécutera pas.
*Contrainte de code :* le token absent du type — pas un `if` qui le rejette. Une validation de publication bruyante sur toute doctrine qui tenterait de le poser.

**A2 — Sous un coach muet sur les fréquences, seules les sentinelles s'appliquent.**
Zéro occurrence d'un groupe sentinelle sur la semaine = trou = recette placée, parce que c'est un **mécanisme produit**. La table de cadences complète de la maison (noix 4×/sem, etc.) est du **contenu doctrinal** et ne gouverne que les élèves sans coach.
*Ce que ça coûte, et qui est accepté :* les élèves d'un coach muet ont une couverture moins fine que les élèves libres.
*Contrainte de code :* la frontière mécanisme/contenu doit être lisible dans le code, pas seulement dans ce document — deux structures distinctes, jamais un drapeau sur une même table.

**A3 — Le foyer se livre sans le slot de dressage.**
Étape 7 : « plus du même » + accompagnement usuel servi à part, zéro extension du contrat du générateur. Le slot de personnalisation au dressage n'arrive qu'en 2e itération, et **seulement si la mesure montre** des écarts d'enveloppe que ces deux canaux ne comblent pas.
*Ce que ça coûte, et qui est accepté :* pas de « filet d'huile, copeaux de fromage » au dressage la première saison ; deltas plus grossiers.
*Contrainte de code :* la condition d'armement est une mesure, pas une intuition — l'écart résiduel entre enveloppe cible et enveloppe atteinte par membre doit être instrumenté dès l'étape 7, sinon la 2e itération se décidera à l'aveugle.

**A4 — k = 5 pour le plancher d'anonymat des agrégats coach.**
Usuel en divulgation statistique. À revoir quand la distribution réelle des tailles de cohortes sera connue — la révision est attendue, pas une dérogation.
*Ce que ça coûte, et qui est accepté :* la synthèse est muette pour les coachs à cohorte naissante (3-4 élèves), c'est-à-dire la majorité au début.
*Contrainte de code :* le plancher s'applique à **tout** agrégat dérivé de verdicts, y compris les compteurs qui semblent inoffensifs — l'inférence par soustraction était le défaut fatal relevé par la revue TCA.

---

## 8. Ce qu'on a écarté et pourquoi

- **Le vocabulaire fermé imposé au générateur** (alternative au résolveur) : quatre coûts mesurés par A — 1-3k tokens sur chaque génération et couplage prompt↔table de données, recettes de kit contre la cuisine réelle de l'élève, fabrication d'un problème de locale, et asymétrie des échecs (aliment absent = imprescriptible en silence, vs non compté et visible).
- **Les tables SQL de politique coach de C** (`coach_composition_policies`) : DDL invalide (PK sur expression), et surtout fork du lifecycle doctrine — deux cycles de vie de configuration coach, pas de version de politique dans `generated_from`, pas de publication atomique. Le précédent `dailyPractices` documente exactement pourquoi tout vit sur la doctrine.
- **La thèse « N=1 = foyer d'un adulte » de C** : jamais implémentée par ses propres étapes, et contradictoire avec les deux lanes que le repo impose (`body: null` côté foyer vs `MealBodyContext` côté individuel). Les deux lanes restent.
- **La taxonomie parallèle de ~12 groupes de B** : `FOOD_GROUP_REFS` existe (30 groupes, FK, seed, token-lint) ; le repo a déjà payé une duplication de vocabulaire. Tout est indexé sur les 30.
- **Le référent foyer par ordre d'objectifs de B** : déterministe et documenté + doctrine du référent citée = l'objectif le plus bas du foyer devient lisible par tous à la table. Le plan lui-même serait le canal de divulgation.
- **« Modest, livable deficit » et tout registre de régime dans les accents** (B) : aucun filtre numérique ne l'attrape et le modèle l'échoe dans la prose visible. Remplacé par la prose de portions + le test lexical.
- **L'ancre « ~30-40 g » sous flag** (B) : c'est un gramme de nutriment, le mauvais côté de la frontière. La vérification protéique se fait en grammes calculés côté plat, la consigne reste qualitative.
- **Les enveloppes foyer par-membre avec un flaggé à table** (B et C) : la personne flaggée mangerait un tronc dimensionné par la restriction d'autrui. Toute la lane dégrade.
- **Le refus `energy_floor_uncoverable` visible à l'élève** (C) : un oracle calorique binaire sondable par régénérations. Le plan sort, le coach est drapeauté au niveau doctrine.
- **La branche « élève maigre »** (B et C) : exige une composition corporelle que la donnée n'a pas et que la plateforme interdit. Non mesurable = non écrite.
- **Le cadran `meal_protein_distribution: even` étendu aux six dynamiques** (C) : construit sur une variable que Schoenfeld 2013 classe comme bruit hors seniors — et que le texte de C déclarait lui-même inexistante.
- **Le reroutage du steering sous flag** (C, `energy_band` → `food_groups`) : le flag écrête, il ne choisit pas la grandeur de substitution d'un coach qui ne l'a pas demandée.
- **L'union des `discouraged` sur le tronc foyer** (B) : des opinions d'un coach n'ont pas prise sur l'assiette commune d'élèves d'autres coachs.
- **Le canal de verdict nominatif vers le coach** (B, `group_frequency_unmet_for_member`) : le début du chemin « le coach voit du personnel » que MODEL.md ferme. Agrégats k-planchérisés seulement.
- **Les mg de micronutriments et la vitamine D dans le moteur** (convergence des trois) : variance ±30-50 %, rétentions de cuisson — le booléen « source de » est la seule granularité honnête ; la vitamine D est un drapeau coach.
- **La régularité des horaires comme contrainte dure** : preuve faible (Farshchi), déjà portée par `eating_rhythm` — signal de départage, rien de plus.
- **La citation `household_restriction_lock` du design A** : vérifiée fausse (verrou de texte des règles de maison). Le verrou de lane foyer sous flag est gardé pour ses propres raisons (arbitrage n°5), pas pour ce faux précédent.

---

*Fichiers d'ancrage : `supabase/functions/_shared/keel/meal_generation.ts` (DishIngredient l.355, dishCapFor l.608, buildMealPrompt l.907, parseGeneratedMeal l.1430, MEAL_PROMPT_VERSION l.493), `doctrine.ts` (CoachDoctrine l.296, dailyPractices l.307-320, compileDoctrineBlock l.650), `doctrine_delegation.ts` (coach maison, DOCTRINE_SOURCES l.30), `tokens.ts` (FOOD_GROUP_REFS l.480), `food_items.ts` (FrequencyRule l.97, clause d'usage l.36), `week_plan_generation.ts` (focusFor l.231), `household_portions.ts`, `meal_body.ts`, `student_body.ts` (trendOf, weekEmphasis), `student_age.ts`, `restriction_runtime.ts`, `forbidden_matcher.ts`, `nutrition_lexicon.ts`, `docs/fonctionnalites/composition-des-repas/FF-030-le-contexte-de-composition.md`.*