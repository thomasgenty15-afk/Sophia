# FF-039 · Les enveloppes et les verdicts, en observation

| | |
|---|---|
| **Identifiant** | `FF-039-enveloppes-et-verdicts-en-observation` |
| **Statut** | 🟠 En cours |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · [LEGAL.md](../../keel/LEGAL.md) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§2.2, §2.3, §2.4, §6 étape 4, arbitrages A1 et A4) |
| **Dépend de** | [FF-038](FF-038-le-referentiel-de-composition.md) (le référentiel et les quantités) · [FF-037](FF-037-l-ancre-proteique.md) · `meal_body.ts` (`MealBodyContext`) · `student_age.ts` (`AgeBand`) · `restriction_runtime.ts` (`evaluateRestrictionForStudent`) · `tokens.ts` (`GOAL_TOKENS`, `FOOD_GROUP_REFS`) |
| **Effort estimé** | 3 jours |

> **Cette fiche livre un instrument de mesure, pas un comportement.** Les
> verdicts sont **écrits et jamais actionnés** : aucun retry, aucun changement
> de consigne, hash de prompt inchangé pour tous les élèves. Elle porte aussi la
> **gate** du chantier : sous 80 % de couverture de résolution médiane, les
> étages suivants (boucle de correction, steering coach, foyer) ne démarrent
> pas.

---

## 1. Le problème

Avec [FF-038](FF-038-le-referentiel-de-composition.md), le produit sait
calculer l'énergie et les macros d'un plat. Il ne sait toujours pas dire si ce
plat est **juste pour cette personne-là**.

Et la façon naturelle de répondre est un piège, dont ce produit connaît chaque
bord :

- **Un chiffre sur la personne est interdit**, partout, toujours
  ([CONTRACT.md](../../keel/CONTRACT.md)). « Ton objectif : 1 800 kcal » ne
  sortira jamais d'ici.
- **Une estimation de maintenance est large.** Mifflin-St Jeor × 1,5 avec une
  activité inconnue, c'est ±20 %, empilé sur ±10-15 % de table et de cuisson.
  C'est **plus large que la bande** de `muscle_gain` (5 points). Un verdict
  « au-dessus de la bande » construit là-dessus serait une décision prise sur
  du bruit, présentée avec l'autorité d'un calcul.
- **Le plancher TCA rend certaines questions illégitimes.** Pour un élève sous
  `restriction_flag`, « ce plat est-il au-dessus de sa cible ? » ne doit pas
  seulement être tu : il ne doit **pas exister**. Un verdict qui existe finit
  par fuir dans un log, un agrégat, ou un écran.

**Ce que ça coûte de ne rien faire.** Sans forme typée pour l'enveloppe et sans
verdicts écrits, la question « le produit compose-t-il bien ? » n'a aucune
réponse mesurable — et le chantier suivant (la boucle de correction) devrait
armer une correction sans jamais avoir observé ce qu'elle corrige. C'est
exactement la classe de défaut que ce dépôt a payée le plus souvent : une
ceinture armée sur un coffre vide.

## 2. Job stories

> **Quand** mon plancher de restriction alimentaire est levé, **je veux** que
> rien dans ce que le produit calcule ou stocke ne permette de le deviner,
> **pour que** ma protection ne soit pas une étiquette qui me suit.

> **Quand** le produit ne sait pas calculer mon plat, **je veux** qu'il le dise
> plutôt que de rendre un verdict, **pour que** ce qui sera corrigé demain le
> soit sur des faits.

> **Quand** je compose ma semaine, **je veux** que rien ne change tant que le
> produit n'a pas prouvé qu'il mesure juste, **pour que** je ne sois pas le
> terrain d'essai d'un calcul non vérifié.

## 3. Périmètre

### Dans le périmètre

- **`meal_envelope.ts`** — module pur. Une union à **deux formes** :
  `per_kg` et `per_portion`. Le second ne porte structurellement **aucun** champ
  par-kg **ni plafond de densité** : l'état illégal est irreprésentable.
- **`envelopeFor(goal, body, ageBand, restrictionFlag)`** — tous les paramètres
  requis, fail-closed.
- Les **bandes par dynamique** du design §2.2, chaque valeur en constante
  nommée portant sa référence en commentaire.
- **Le régime « direction » seulement.** Le verdict énergie dit `above` /
  `below` / `within` au-delà du bord de bande × 1,10.
- **`meal_verdict.ts`** — l'abstention avant l'erreur, la protéine en
  **grammes calculés**, la densité avec son abstention aqueuse, les sentinelles
  à l'échelle de la semaine.
- **La table `meal_composition_verdicts`** — interne, service-role,
  `revoke` immédiat, **réclamée par le lifecycle RGPD**.
- **L'écriture des verdicts** dans `generate-meal-v1`, après le parse, dans un
  `try/catch` qui ne fait jamais échouer une génération.
- **La gate des 80 %** et son protocole de rattrapage.

### Hors périmètre — engageant

- ❌ **Aucun verdict actionné.** Pas de retry, pas de jeton de correction, pas
  une ligne de consigne changée. La sortie de `parseGeneratedMeal` est
  **identique** avec et sans le calcul de verdict, et un test le prouve par
  égalité profonde.
- ❌ **Aucun bump de `MEAL_PROMPT_VERSION`.** La consigne ne change pas : le
  hash de prompt reste identique pour toute la base.
- ❌ **Aucun chiffre exporté.** Le verdict protéine est `met` / `under` /
  `not_computable` — jamais un nombre de grammes, même en interne lisible.
- ❌ **Aucun régime « bande » fin, aucun ré-ancrage.** Le recalage sur
  l'observé est l'étape 8 du chantier. Ici, la maintenance estimée ne sert qu'à
  une direction grossière.
- ❌ **Aucun paramètre de steering.** `envelopeFor` n'a pas de `steering` dans
  sa signature. L'étape 6 l'ajoutera **requis** — et la casse de compilation qui
  s'ensuivra est le mécanisme qui recensera les appelants. Le pré-câbler ici le
  désarmerait.
- ❌ **Aucune branche « élève maigre », aucun IMC, aucune catégorie de corps.**
  Détecter la maigreur exige une composition corporelle que la donnée n'a pas et
  que `meal_body.ts` interdit. Non mesurable = non écrit.
- ❌ **Aucun `proteinPerMealG` hors des trois cas.** `60_plus`, `muscle_gain`,
  `recomposition`, et nulle part ailleurs. Un paramètre de distribution ailleurs
  serait décoratif (Schoenfeld 2013 : nul hors seniors), et aucun cadran ne le
  crée.
- ❌ **Aucun milligramme.** Les sentinelles restent des booléens (FF-038).

## 4. Le circuit

```
  student_goals.goal      MealBodyContext        AgeBand      restrictionFlag
      (6 jetons)      (taille/poids/… ou null)               (dérivé, jamais stocké)
         │                     │                    │               │
         └─────────────────────┴────────────────────┴───────────────┘
                                     ↓
                    envelopeFor(goal, body, ageBand, restrictionFlag)
                                     │
              ┌──────────────────────┴────────────────────────┐
              │  UNE SEULE BRANCHE DÉGRADÉE, PARTAGÉE          │
              │  restrictionFlag === true  OU  body absent     │
              └──────────────────────┬────────────────────────┘
                       ↓ oui                        ↓ non
        { mode: "per_portion",              { mode: "per_kg",
          proteinPortionPerMeal: true }       energy: {low, high} | null,
                                              proteinFloorG,
        AUCUN champ énergie                   proteinPerMealG: … | null,
        AUCUN densityCeiling                  densityCeiling }
        → l'état illégal ne compile pas
                       │                                │
                       └────────────────┬───────────────┘
                                        ↓
                        verdictFor(meal, envelope, refs)
                                        │
          resolution < 80 %  OU  1 dense non résolu  ──→  not_computable
                                        │  (abstention AVANT l'erreur)
                                        ↓
         energy   within|above|below|not_computable   (bord × 1,10)
         protein  met|under|not_computable            (GRAMMES calculés)
         density  within|above|not_computable         (abstention aqueuse)
         sentinels.missing: FoodGroupRef[]            (échelle SEMAINE)
                                        │
                                        ↓
                        meal_composition_verdicts      ← ÉCRIT
                        user_id · meal_id · verdict jsonb
                        envelope_mode (SANS la raison)
                        resolution_coverage · unresolved_terms
                        prompt_version · doctrine_version
                                        │
                                        ✗ AUCUN RETOUR VERS LA GÉNÉRATION
```

**`envelope_mode` est stocké sans sa raison.** La ligne dit `per_portion` ; elle
ne dit jamais *pourquoi*. Le statut de restriction est dérivé à la lecture par
`evaluateRestrictionForStudent`, comme partout ailleurs dans le produit, et
n'est **jamais écrit**. Un élève sous plancher et un élève dont on ne connaît
pas le corps produisent la même ligne, au caractère près.

## 5. Modèle de données

### `meal_composition_verdicts` — interne, jamais rendue à personne

| colonne | type | note |
|---|---|---|
| `id` | `uuid` PK | |
| `user_id` | `uuid` FK `auth.users` **on delete cascade** | c'est ce qui la fait réclamer par la suppression RGPD |
| `meal_id` | `uuid` FK `student_generated_meals` on delete cascade | |
| `verdict` | `jsonb` | la forme `CompositionVerdict` |
| `envelope_mode` | `text` check `('per_kg','per_portion')` | **sans la raison** |
| `resolution_coverage` | `numeric` | part d'ingrédients résolus |
| `unresolved_terms` | `text[]` | la worklist, par repas |
| `prompt_version` | `text` | `MEAL_PROMPT_VERSION` au moment de l'écriture |
| `doctrine_version` | `int` | la version de doctrine gouvernante |
| `created_at` | `timestamptz` | |

**Hygiène, dans la migration elle-même :** `revoke all … from anon`,
`revoke … from authenticated` (les privilèges par défaut Supabase donnent tout à
`authenticated`, TRUNCATE compris, et TRUNCATE échappe à RLS), RLS activée sans
aucune politique — la table est service-role et rien d'autre. Et
**réclamation par le lifecycle RGPD** : la suppression par cascade sur
`auth.users`, l'export par ajout explicite dans `account-export-v1`.

### `Envelope` — la forme qui porte la garantie

```ts
type Envelope =
  | { mode: "per_kg";
      energy: { low: number; high: number } | null;
      proteinFloorG: number;
      proteinPerMealG: number | null;   // non-null SSI 60_plus, muscle_gain, recomposition
      densityCeiling: number | null; }
  | { mode: "per_portion";
      // AUCUN champ par-kg, AUCUN densityCeiling
      proteinPortionPerMeal: true; };
```

Ce n'est pas une commodité de typage : c'est **le** mécanisme de sécurité de
cette fiche. Sous plancher, il n'y a pas « un champ énergie qu'on prend soin de
ne pas lire » — il n'y a **pas de champ**. Un test de compilation
(`@ts-expect-error`) prouve qu'une construction illégale ne compile pas.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Le mode `per_portion` ne porte **structurellement** ni énergie ni plafond de densité | « Rien ne compte à rebours » vaut aussi pour la version sans compteur. Sous flag, toute pression de minimisation dérivée de l'objectif est **absente**, pas neutralisée. Une union typée rend l'état illégal irreprésentable ; un booléen qu'on vérifie serait une garde qu'on oublie. |
| R2 | Le mode dégradé est atteint par **une seule branche**, partagée entre « sous flag » et « corps inconnu » | Deux chemins qui se ressemblent divergent. Et une branche distincte rendrait le statut de restriction **observable** dans la sortie — c'est le défaut que le design ferme (§1 principe 4). |
| R3 | **Indiscernabilité**, testée par égalité de chaînes | Tout ce qui est dérivable de l'enveloppe pour un élève flaggé est identique, caractère pour caractère, à ce qui l'est pour un élève au corps inconnu. Un test qui vérifierait « il n'y a pas de ligne d'énergie » laisserait passer un en-tête vide ou un mot ajouté six mois plus tard. |
| R4 | Le plafond de déficit de 500 kcal/j est une **constante produit**. Aucun paramètre ne le débraye | **Arbitrage A1.** Deux fondements indépendants : au-delà, l'énergie du plan passe sous le seuil où la couverture micro devient mathématiquement improbable ; et un moteur qui exécute de la restriction rapide est exactement le produit que le plancher TCA existe pour ne pas être. |
| R5 | `proteinPerMealG` est non-`null` **uniquement** pour `60_plus`, `muscle_gain` et `recomposition` | La distribution par repas change une branche dans trois cas exactement (Moore 2015 / PROT-AGE pour les seniors, placement pour les deux autres). Partout ailleurs elle serait décorative, et un champ décoratif finit par être piloté. |
| R6 | **Abstention avant erreur** : résolution < 80 %, ou un seul ingrédient dense non résolu ⇒ `not_computable` | Une matière grasse manquante déplace l'énergie d'un plat de plusieurs dizaines de pour cent. Un verdict rendu sur 95 % des ingrédients mais sans l'huile est plus dangereux qu'une abstention, parce qu'il a l'air d'un résultat. |
| R7 | La densité **s'abstient** en plus quand la méthode est une préparation aqueuse (soupes, bouillons, mijotés), sur un lexique fermé EN+FR | L'eau de cuisson n'est pas un ingrédient grammé. Le kcal/g calculé sur une soupe est du bruit, et il pointe toujours dans le même sens. |
| R8 | Les plafonds de densité (~1,3 / ~1,8) sont des constantes **avouées comme opérationnelles** | La méta-analyse prouve la **direction**, pas le seuil. Le commentaire le dit : calibrées en observation, pas issues de la littérature. Prétendre l'inverse ferait défendre un chiffre indéfendable. |
| R9 | La protéine se vérifie en **grammes calculés**, mais le verdict reste `met`/`under`/`not_computable` | Le calcul est ce qui distingue « eggs » à 6 g d'une vraie ancre — le trou que la simple présence de FF-037 laisse ouvert. Le **chiffre**, lui, ne sort jamais : c'est la frontière aliment/personne. |
| R10 | Le verdict énergie **n'existe pas** pour un élève en `per_portion` | Non-existence plutôt que suppression. Un verdict qui existe et qu'on filtre à l'affichage finit par fuir dans un agrégat que personne n'a relu. |
| R11 | Le verdict n'est **jamais actionné**. La sortie de `parseGeneratedMeal` est identique avec et sans son calcul | Testé par égalité profonde. C'est la définition de « en observation », et la seule chose qui rend cette fiche livrable sans mesure préalable. |
| R12 | L'écriture du verdict ne peut **jamais** faire échouer une génération | `try/catch` chez l'appelant, journalisé. L'observation ne casse pas le produit : un élève ne perd pas son dîner parce qu'une table d'instrumentation était indisponible. |
| R13 | **Anonymat k = 5** sur tout agrégat coach dérivé de verdicts, y compris les compteurs d'apparence inoffensive | **Arbitrage A4.** L'inférence par soustraction : deux agrégats dont la différence isole un élève. Aucun agrégat n'est livré par cette fiche — la règle est écrite ici parce que c'est ici que les verdicts naissent, et que le premier lecteur qui en fera une synthèse la lira. |
| R14 | `envelope_mode` est écrit **sans sa raison** | Le statut de restriction se dérive, ne se stocke pas. Une colonne `envelope_reason` serait une étiquette permanente sur un élève, exactement ce que le produit refuse. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Le corps de l'élève est inconnu | `per_portion`. **Cas nominal**, pas une dégradation : c'est l'état de la majorité des élèves. |
| `evaluateRestrictionForStudent` échoue | `restrictionFlag = true`, fail-closed, comme partout ailleurs (FF-030 R6). Le coût du faux positif est nul ici. |
| La résolution du repas est à 79 % | `not_computable` sur tout ce qui en dépend. Pas de verdict partiel : un verdict partiel est un verdict qu'on croira complet. |
| Un seul ingrédient dense non résolu, résolution à 95 % | `not_computable` quand même (R6). |
| L'écriture en base échoue | La génération **réussit**, l'échec est journalisé nommément. Sans le nom, une table indisponible en boucle ressemblerait à des élèves sans verdicts. |
| Le repas n'a aucun ingrédient exploitable | `not_computable` partout, `resolution_coverage = 0`. Écrit quand même : une ligne qui dit « je n'ai rien su calculer » est une donnée, une ligne absente est un trou. |
| **Le silencieux, et le plus grave** : quelqu'un branche un lecteur sur `envelope_mode` et en déduit le statut TCA | La colonne ne porte pas la raison (R14), et les deux populations y sont mélangées par construction (R2). C'est la seule parade qui tienne : rendre la déduction fausse plutôt que l'interdire. |
| Un futur appelant oublie `restrictionFlag` | Ne compile pas. Le paramètre est **requis**, jamais optionnel — cicatrice « paramètre de garde optionnel = garde désarmée ». |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève sous plancher de restriction alimentaire
Quand son enveloppe est calculée
Alors elle est en mode per_portion
Et le type ne porte ni bande d'énergie ni plafond de densité
```

```gherkin
Étant donné un élève sous plancher, et un élève dont le corps est inconnu
Quand leurs enveloppes sont calculées
Alors tout ce qui en est dérivable est identique, caractère pour caractère
```

```gherkin
Étant donné un élève en fat_loss de très grand gabarit
Quand son enveloppe est calculée
Alors l'écart entre la maintenance estimée et le bas de bande
  ne dépasse pas 500 kcal par jour
```

```gherkin
Étant donné un élève en fat_loss, health, performance ou maintenance
Quand son enveloppe est calculée
Alors proteinPerMealG vaut null
```

```gherkin
Étant donné un repas dont 79 % des ingrédients sont résolus
Quand son verdict est calculé
Alors l'énergie, la protéine et la densité valent toutes not_computable
```

```gherkin
Étant donné un repas résolu à 95 % dont le seul terme inconnu est une huile
Quand son verdict est calculé
Alors le verdict vaut not_computable
```

```gherkin
Étant donné un plat dont la méthode est une soupe
Quand son verdict est calculé
Alors la densité vaut not_computable
Et les autres grandeurs restent calculées
```

```gherkin
Étant donné un plat qui contient des œufs en quantité de garniture
Quand son verdict protéine est calculé
Alors il vaut under
Et aucun nombre de grammes n'apparaît dans le verdict
```

```gherkin
Étant donné un repas quelconque
Quand on le parse avec et sans le calcul de verdict
Alors les deux sorties sont profondément égales
```

```gherkin
Étant donné la table des verdicts
Quand on interroge les privilèges de anon et de authenticated dessus
Alors ils n'en ont aucun
```

## 9. Rabbit holes

- **Vouloir un verdict fin tout de suite.** L'estimation de maintenance est
  plus large que la bande de `muscle_gain`. Rendre un verdict « au-dessus de la
  bande » avant le ré-ancrage sur l'observé serait une décision prise sur du
  bruit, et l'autorité du calcul la rendrait indiscutable. Le régime
  « direction » est la seule chose honnête au premier jour.
- **Croire que filtrer suffit.** La tentation est de calculer le verdict énergie
  pour tout le monde et de ne pas l'afficher sous flag. Non : il ne doit **pas
  exister**. Un champ calculé finit dans un log, un agrégat, un export, ou dans
  la tête de celui qui écrira le prochain écran.
- **Le zéro qui ressemble à une mesure.** Un ingrédient non résolu qui propage
  `0` fait passer un plat non calculable pour un plat léger. Le type
  `Nutrients | "unknown"` de FF-038 existe pour ça, et le verdict doit le
  respecter jusqu'au bout — y compris quand ça donne beaucoup de
  `not_computable` au début. Beaucoup d'abstentions est le bon résultat d'un
  référentiel jeune.
- **Pré-câbler le steering.** `envelopeFor` n'a **pas** de paramètre `steering`.
  L'ajouter maintenant « pour plus tard » créerait un champ mort que l'étape 6
  trouverait déjà là — et personne ne serait forcé de recenser les appelants.
  La casse de compilation est le mécanisme, pas un accident à éviter.
- **Passer la gate à la main.** Ajouter des alias jusqu'à ce que le chiffre
  passe 80 % est exactement l'inverse de ce que la gate protège. Un alias
  s'ajoute quand on sait à quel aliment le terme correspond ; sinon il reste non
  résolu, et la gate reste rouge. C'est son travail.

## 10. Ce qu'on mesure

- **La gate, et c'est la mesure qui décide de tout le reste :** la couverture de
  résolution **médiane** sur les repas réellement générés (rejeu FF-038 +
  générations nouvelles). Sous 80 %, on cure les 50 alias les plus fréquents et
  on remesure ; **deux passes au plus** (~150 alias) ; toujours sous 80 % après
  ça ⇒ les étages suivants ne démarrent pas, et le rapport dit pourquoi.
- **La distribution des verdicts**, en observation : part de `not_computable`
  par grandeur. Une part écrasante d'abstention est une mesure utile — elle dit
  que le référentiel est jeune, pas que le produit compose mal.
- **La part de repas dont l'énergie serait calculable** : c'est ce que la boucle
  de correction pourra effectivement corriger.
- **La contre-mesure :** temps de génération et taux d'échec de
  `generate-meal-v1` avant/après. Le calcul de verdict est pur et local, mais
  l'écriture est un aller-retour de base de plus. S'il coûte quoi que ce soit à
  la génération, il passe en asynchrone — il n'est pas assez important pour
  ralentir un dîner.
- **La seconde contre-mesure :** part de générations dont la sortie change après
  ce lot. Attendue : **zéro**. Toute valeur non nulle est un bug, pas une
  amélioration.

## 11. Questions ouvertes

1. **Les sentinelles sont à l'échelle de la SEMAINE, et un repas ne l'est pas.**
   Le verdict est calculé par génération ; une génération couvre entre un jour
   et sept. `sentinels.missing` est donc lu sur la fenêtre du plan, ce qui est
   la bonne maille quand la fenêtre fait sept jours et une maille trop courte
   quand elle en fait deux. Le durcissement de l'étape 8 devra lire la semaine
   **civile**, pas la fenêtre. Noté ici pour ne pas le découvrir là-bas.
2. **La part d'une préparation qui atterrit dans un plat.** `servings /
   servingsMade` est l'arithmétique évidente, et elle suppose que le modèle ait
   rempli les deux nombres honnêtement. On l'applique, et on **compte** les
   plats dont la somme des `servings` prélevés dépasse le `servingsMade` de la
   préparation — c'est le signal qu'on ne peut pas se fier à la division. À
   instruire si le compteur n'est pas marginal.
3. **La maintenance estimée n'a pas d'activité déclarée.** Le ×1,5 est un
   facteur unique pour tout le monde. Le produit collecte des jours
   d'entraînement pour `performance` ; les brancher ici réduirait l'incertitude
   là où la bande est la plus étroite. C'est un arbitrage à part : demander une
   activité pour affiner un calcul invisible est une question posée à l'élève
   dont il ne verra jamais le bénéfice.
4. **k = 5 est écrit et n'a aucun lecteur.** Aucun agrégat coach n'est livré ici.
   La règle est posée à la source pour que le premier qui en écrira un la
   trouve — mais une règle sans lecteur est une règle qui peut être oubliée. La
   parade réelle viendra avec la synthèse coach de l'étape 8.
