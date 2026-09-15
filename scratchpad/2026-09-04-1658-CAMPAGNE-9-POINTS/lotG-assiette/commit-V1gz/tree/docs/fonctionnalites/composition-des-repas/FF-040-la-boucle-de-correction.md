# FF-040 · La boucle de correction — les nombres dedans, les mots dehors

| | |
|---|---|
| **Identifiant** | `FF-040-la-boucle-de-correction` |
| **Statut** | 🟢 **Livrée et câblée en production** — vérifié le 2026-09-01 : `_shared/keel/meal_correction.ts` (527 l., 23 tests) est montée dans `generate-meal-v1/index.ts` **depuis le 2026-08-23** (l. 274). C'est elle qui périme le « aucun verdict actionné » de [FF-039](FF-039-enveloppes-et-verdicts-en-observation.md) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§2.5, §2.6, §6 étapes 5 et 8) |
| **Dépend de** | [FF-039](FF-039-enveloppes-et-verdicts-en-observation.md) (le verdict) · [FF-038](FF-038-le-referentiel-de-composition.md) · `doctrine.ts` (patron `doctrineRetryInstruction`) · `nutrition_lexicon.ts` · `student_body.ts` (`trendOf`) |
| **Effort estimé** | 2 à 3 jours |

> **Cette fiche ARME ce que FF-039 observait.** Elle ne démarre que parce que la
> gate des 80 % est passée (96,2 % mesuré le 2026-08-10, rapport de phase I).
> Elle porte aussi l'étape 8 du chantier — sentinelles à la semaine, plancher de
> couverture, ré-ancrage — parce que ces trois-là ne sont pas des mécanismes à
> part : ce sont les **contenus** que la boucle sert.

---

## 1. Le problème

FF-039 sait dire qu'une génération est hors bande. **Rien n'en fait rien.**

Et la façon naturelle de corriger est un piège que ce produit a déjà nommé :
dire au modèle ce qui cloche, en chiffres. « Tu es 400 kcal au-dessus » est un
chiffre sur la personne, il fuit dans les `why` visibles, et il transforme un
générateur de plats en compteur de calories.

Le piège moins évident, et celui que la revue TCA a désigné comme fatal : **le
registre**. « A modest, livable deficit » ne contient aucun chiffre — donc
`findNumericTarget` ne mord pas — et c'est exactement la phrase que le modèle
échoe dans la prose que l'élève lit. Le filtre numérique protège des chiffres ;
il ne protège pas du **vocabulaire du régime**.

Trois autres trous restent ouverts après la phase I :

- **Les sentinelles n'ont pas de maille.** FF-039 les calcule sur la fenêtre du
  plan, qui fait entre un et sept jours. « Zéro poisson gras » sur deux jours
  n'est pas un trou.
- **Le plancher de couverture n'existe pas.** Sous ~1550 kcal/jour, la
  couverture micro devient mathématiquement improbable — et rien ne le vérifie.
- **La maintenance estimée ne se recale jamais.** Elle est à ±20 %, et
  l'observé (`trendOf`) existe depuis des mois sans lecteur ici.

**Ce que ça coûte de ne rien faire.** Le produit a un instrument de mesure
complet et aucune main dessus : il sait qu'un plan est trop dense et le sert
quand même. Et le premier qui voudra corriger sans ces gardes écrira « déficit »
dans un prompt.

## 2. Job stories

> **Quand** ma semaine sort trop grasse pour ce que je vise, **je veux** que le
> produit la reprenne avant de me la donner, **pour que** je n'aie pas à juger
> moi-même une chose que je lui ai demandée de composer.

> **Quand** le produit corrige mon plan, **je ne veux jamais** lire le
> vocabulaire du régime dans ce qu'il m'écrit, **pour que** composer ne
> redevienne pas compter.

> **Quand** j'ai dit que je ne mange pas de poisson, **je ne veux pas** qu'une
> optimisation passe outre, **pour que** ce que j'ai déclaré compte plus que ce
> que le moteur préfère.

## 3. Périmètre

### Dans le périmètre

- **`meal_correction.ts`** — module pur. La liste FERMÉE des jetons du design
  §2.5, chacun portant sa phrase anglaise **sans chiffre et sans registre de
  régime**.
- **Le mapping verdict → jeton, exhaustif à la compilation** (`switch` sans
  `default`, patron `dishCapFor`).
- **`DIET_REGISTER_LEXICON`** dans `nutrition_lexicon.ts`, et un test qui le
  passe sur **toutes les constantes de prose du chantier**.
- **Un seul retry**, patron `doctrineRetryInstruction`, sortie repassée par
  **tous** les verrous.
- **La préséance adhérence, exécutable** : un jeton qui contredirait une
  déclaration de l'élève n'est pas servi, et c'est compté.
- **Étape 8** : sentinelles à la **semaine civile**, plancher de couverture
  ~1550 kcal, `coverage_unsatisfiable` / `coverage_unverified`, ré-ancrage borné
  sur `trendOf`, plancher d'anonymat **k=5** sur tout agrégat.

### Hors périmètre — engageant

- ❌ **Aucun chiffre dans un jeton.** Ni « 500 kcal », ni « 30 g », ni « 20 % ».
  Un jeton est une phrase qualitative ; le test le vérifie sur la table, pas à
  la main.
- ❌ **Aucun mot du registre du régime**, nulle part dans la prose du chantier :
  deficit/déficit, surplus, cut/sèche, restriction, calorie(s), macro(s). Le
  test mord sur la table des constantes.
- ❌ **Deux retries.** Un seul. Le plan sort de toute façon.
- ❌ **Aucun refus visible à l'élève déclenché par un calcul.** Le plan sort ;
  le drapeau va au coach au niveau **doctrine/dynamique**, jamais nominatif.
- ❌ **Aucun agrégat coach sans k=5.** Y compris les compteurs d'apparence
  inoffensive — l'inférence par soustraction est le défaut visé.
- ❌ **Aucun ré-ancrage visible à l'élève.** Il apparaît en agrégé dans la
  synthèse coach, jamais dans un plan ni dans un bilan.

## 4. Le circuit

```
  parseGeneratedMeal ──→ verdictFor()  (FF-039)
                              │
                    ┌─────────┴──────────┐
                    │ dans la bande ?    │
                    └─────────┬──────────┘
                    oui ──→ le plan sort, RIEN ne se passe
                              │ non
                              ↓
              correctionTokensFor(verdict, envelope)
              switch EXHAUSTIF — un verdict sans jeton NE COMPILE PAS
                              │
                    raise_protein_component
                    lower_added_fat · lower_density
                    raise_energy · lower_energy
                    place_missing_sentinel
                              │
                    ┌─────────┴──────────────────────────┐
                    │ PRÉSÉANCE ADHÉRENCE                │
                    │ le jeton contredit-il une          │
                    │ déclaration de l'élève ?           │
                    └─────────┬──────────────────────────┘
                    oui ──→ jeton NON SERVI + issue nommée
                              │ non
                              ↓
                  UNE relance (doctrineRetryInstruction)
                              ↓
                  parseGeneratedMeal EN ENTIER
                  (verrous, filtres, plafonds, ancre)
                              ↓
                  adoptée SSI elle améliore le verdict
                  et ne perd aucun plat
```

**Le plancher de couverture est un DURCISSEMENT, pas une contrainte de plus.**
Sous ~1550 kcal/jour calculées **côté plan**, les fréquences sentinelles
deviennent dures — donc `place_missing_sentinel` passe devant les autres jetons.
Sa direction est **protectrice** : il n'ajoute que de la couverture, il ne
retire jamais d'énergie.

## 5. Modèle de données

**Une seule table neuve**, pour le ré-ancrage :

| colonne | rôle |
|---|---|
| `user_id` | FK `auth.users` **on delete cascade** → réclamée par le lifecycle |
| `shift_pct` | le décalage cumulé du centre de bande, **borné à ±10 %** |
| `weeks_against` | combien de semaines consécutives la tendance contredit la direction attendue |
| `computed_at` | quand |

Le reste s'écrit dans `meal_composition_verdicts` (FF-039), qui gagne deux
colonnes : `tokens_served text[]` et `coverage_flag text` (`ok` /
`unsatisfiable` / `unverified`).

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Le mapping verdict → jeton est **exhaustif à la compilation** | Un verdict nouveau sans jeton ne compile pas. Patron `dishCapFor` : un `switch` sans `default` rend le R6 vrai par construction, là où un `if/else` donnerait silencieusement le comportement du voisin. |
| R2 | Aucun jeton ne contient de **chiffre** | Testé sur la TABLE, pas à la main. Un chiffre dans un jeton ressort dans un `why` visible. |
| R3 | Aucune constante de prose du chantier ne contient un mot de **`DIET_REGISTER_LEXICON`** | C'est le correctif du défaut fatal TCA : `findNumericTarget` mord sur les chiffres, pas sur « déficit », et l'accent est ce que le modèle échoe. Le test passe le lexique sur toutes les constantes, et **muter une constante doit le faire tomber**. |
| R4 | **Un seul** retry, et sa sortie repasse par `parseGeneratedMeal` en entier | Une sortie de relance acceptée sur bonne mine est une sortie non vérifiée. Et la relance n'est adoptée que si elle améliore : elle ne peut pas coûter un plat. |
| R5 | Aucune correction pour un écart **dans la bande d'erreur** | La maintenance estimée est à ±20 %. Corriger dedans, c'est corriger du bruit avec l'autorité d'un calcul. |
| R6 | **Préséance adhérence** : un jeton qui contredit une déclaration de l'élève n'est pas servi, et c'est **compté** | Un interdit gagne sur une envie ; une optimisation ne gagne **jamais** sur une déclaration. L'adhérence est le seul prédicteur à 12 mois du corpus. |
| R7 | Les sentinelles se jugent sur la **semaine civile**, pas sur la fenêtre du plan | Question ouverte n°1 de FF-039, réglée ici : « zéro poisson gras » sur une fenêtre de deux jours n'est pas un trou. |
| R8 | Le plancher de couverture ne fait qu'**ajouter** de la couverture | Sa direction est protectrice. Un plancher qui retirerait de l'énergie serait le produit que le plancher TCA existe pour ne pas être. |
| R9 | Non satisfaisable ⇒ **le plan sort quand même**, drapeau `coverage_unsatisfiable` au niveau doctrine/dynamique | Un plan imparfait bat un plan absent, et un refus calorique visible à l'élève est un oracle sondable par régénérations. |
| R10 | Fail-closed sur la prétention : `coverage_unverified` quand non calculable, **jamais un vert par défaut** | Un vert par défaut est la pire des trois réponses : il affirme ce que personne n'a vérifié. |
| R11 | Le ré-ancrage est **borné** : 5 % par palier, cumul ≤ 10 %, jamais sous le plancher de couverture | ≈ la thermogenèse adaptative documentée (100-300 kcal/j, Rosenbaum & Leibel). Au-delà, on ne recale plus une estimation : on poursuit une balance. |
| R12 | **k = 5** sur TOUT agrégat coach dérivé de verdicts | Arbitrage A4. Y compris les compteurs inoffensifs : deux agrégats dont la différence isole un élève sont une divulgation. Les élèves sous flag sont absents des agrégats dérivés d'enveloppes **sans trou étiqueté**. |
| R13 | Condition de désarmement : une génération **dans la bande** produit une sortie identique, octet pour octet, à celle d'avant ce lot | Zéro jeton, zéro relance, zéro ligne de plus. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Verdict `not_computable` | **Aucune correction.** On ne corrige pas ce qu'on n'a pas su mesurer — c'est toute la raison d'être de la gate. |
| La relance rend un plan appauvri | La **première** sortie est gardée. Une amélioration qui coûte un plat n'est pas une amélioration. |
| La relance échoue (modèle en erreur) | Première sortie gardée, échec journalisé nommément. |
| Le jeton contredit une préférence déclarée | Non servi, issue nommée. Si tous les jetons tombent, aucune relance. |
| Le plan est sous 1550 kcal et insatisfaisable | Plan **servi**, `coverage_unsatisfiable` au coach, niveau doctrine/dynamique. Aucun nom. |
| L'énergie du plan n'est pas calculable | `coverage_unverified`. Jamais `ok`. |
| `trendOf` rend `unknown` | **Aucun recalage.** Une tendance inconnue n'est pas une tendance stable. |
| La cohorte fait 4 élèves | La synthèse est **muette** (k=5). Coût accepté et écrit : c'est la majorité des coachs au début. |
| **Le silencieux** : un jeton ajouté sans passer au test lexical | Le test tourne sur la TABLE des jetons, pas sur une liste tenue à la main — un jeton ajouté y entre automatiquement. |

## 8. Critères d'acceptation

```gherkin
Étant donné un verdict énergie "above" hors bande d'erreur
Quand les jetons de correction sont dérivés
Alors le jeton "lower_energy" est servi
Et sa phrase ne contient ni chiffre ni mot du registre du régime
```

```gherkin
Étant donné toutes les constantes de prose du chantier
Quand on les passe au lexique du registre du régime
Alors aucune ne mord
```

```gherkin
Étant donné une constante de prose à laquelle on ajoute le mot "deficit"
Quand le test lexical tourne
Alors il échoue
```

```gherkin
Étant donné un élève qui a déclaré ne pas manger de poisson
Et un trou de sentinelle sur les poissons gras
Quand les jetons sont dérivés
Alors "place_missing_sentinel" n'est pas servi pour ce groupe
Et une issue nommée le dit
```

```gherkin
Étant donné un verdict dans la bande
Quand la génération se termine
Alors la sortie est identique, octet pour octet, à celle d'avant ce lot
Et aucune relance n'a eu lieu
```

```gherkin
Étant donné un plan dont l'énergie calculée est de 1400 kcal par jour
Quand la couverture est évaluée
Alors les fréquences sentinelles sont des contraintes dures
Et si elles restent insatisfaisables, le plan sort avec coverage_unsatisfiable
```

```gherkin
Étant donné trois semaines de tendance contraire à la direction attendue
Quand le ré-ancrage est calculé
Alors le centre de bande se décale de 5 %
Et six semaines contraires n'en donnent pas plus de 10
```

```gherkin
Étant donné un coach dont la cohorte compte 4 élèves
Quand un agrégat dérivé de verdicts est demandé
Alors il ne sort pas
```

## 9. Rabbit holes

- **Croire que le filtre numérique suffit.** Il ne mord pas sur « déficit ». Le
  test lexical n'est pas une ceinture de plus : c'est la seule qui couvre le
  registre, et le design le désigne nommément comme le défaut fatal d'un des
  candidats.
- **Corriger ce qu'on n'a pas mesuré.** `not_computable` doit rester inerte.
  La tentation est de « corriger un peu quand même » ; c'est exactement ce que
  la gate protège.
- **Faire du plancher de couverture une contrainte d'énergie.** Il durcit des
  FRÉQUENCES, il ne touche pas à l'énergie. Un plancher qui ferait manger moins
  aurait inversé son propre sens.
- **Le ré-ancrage qui poursuit la balance.** Sans borne, il transforme une
  estimation en asservissement sur le poids — et c'est un compteur de calories
  avec une boucle de rétroaction. Les deux bornes (5 % par palier, 10 % cumulé)
  ne sont pas du confort.
- **k=5 « sauf pour les compteurs simples ».** C'est l'inférence par
  soustraction, et c'est exactement ce que la revue TCA a relevé. La règle vaut
  pour tout agrégat, sans exception raisonnable.

## 10. Ce qu'on mesure

- **La mesure principale :** distribution des verdicts avant / après. Si la part
  de `above` sur la densité ne baisse pas, la boucle ne sert à rien.
- **La mesure secondaire :** part de relances **adoptées** (elles améliorent le
  verdict sans perdre de plat). Une relance rarement adoptée est une relance à
  retirer — elle coûte une génération à chaque fois.
- **La contre-mesure, et c'est la plus importante :** `rejected_numeric` et la
  part de plans vides. Si l'une ou l'autre monte, la correction a poussé le
  modèle vers le chiffre ou vers l'infraction.
- **La seconde contre-mesure :** part de jetons **non servis** pour préséance
  adhérence. Si elle est élevée, le moteur veut systématiquement contredire ce
  que les élèves déclarent — ce qui est une information sur le moteur, pas sur
  les élèves.

## 11. Questions ouvertes

1. **`fried_food` reste un porteur de sentinelle** (FF-039 §11 n°4). Tant que
   `place_missing_sentinel` peut le nommer, il peut recommander de la friture
   pour combler un trou en fer. **Traité ici par une garde d'exécution** : le
   jeton ne sert que des groupes que le produit prescrit. La liste de ce que le
   produit ne prescrit pas reste à dériver proprement — aujourd'hui elle est
   une constante nommée, ce qui est mieux qu'implicite et moins bien que dérivé.
2. **Le seuil de 1550 kcal est côté PLAN, pas côté personne** — donc armé même
   en `per_portion`. Ce qui n'est pas tranché : ce que devient ce seuil pour un
   plan qui ne couvre que deux jours. Aujourd'hui il se lit par jour couvert, ce
   qui est la lecture la plus prudente.
3. **Le ré-ancrage n'a pas d'écran.** Son effet apparaît en agrégé dans la
   synthèse coach, et nulle part ailleurs. Un élève ne peut donc pas savoir que
   sa bande a bougé — ce qui est voulu, et qui restera à réexaminer le jour où
   quelqu'un demandera « pourquoi mes portions ont changé ? ».
