# FF-043 · La résolution foyer — une cuisson, des assiettes qui divergent

| | |
|---|---|
| **Identifiant** | `FF-043-la-resolution-foyer` |
| **Statut** | 🟠 En cours — moteur livré, surfaces d'écran à faire (§11 n°1) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) · [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§4, arbitrage A3) |
| **Dépend de** | [FF-039](FF-039-enveloppes-et-verdicts-en-observation.md) (l'enveloppe) · [FF-040](FF-040-la-boucle-de-correction.md) · [FF-041](FF-041-la-methode-du-coach-executable.md) · `household_portions.ts` (`sanitizePortionNote`, `FORBIDDEN_PORTION_TERMS`) · `household_meal_generation.ts` · `restriction_runtime.ts` |
| **Effort estimé** | 3 jours |

---

## 1. Le problème

La lane foyer compose **une cuisson pour plusieurs personnes**. Depuis le lot
« corps par membre », elle sait qui est à table, avec quel objectif et quel
corps. Elle ne sait pas **dimensionner**.

Et c'est la lane où se dimensionner mal est le plus grave, pour une raison qui
n'a rien à voir avec la nutrition : **une assiette qui diverge est lisible par
tout le monde autour de la table.** Un adulte en déficit, un adolescent en
croissance et une personne sous plancher TCA mangent le même plat ; si le tronc
commun est dimensionné sur l'enveloppe du premier, la troisième mange la
restriction d'un autre sans l'avoir demandée — et si les différences se voient,
l'objectif de chacun devient public au dîner.

**Ce que ça coûte de ne rien faire.** Le foyer reste servi par des directions de
service qualitatives, ce qui est **acceptable** — c'est le produit d'aujourd'hui
et il ne blesse personne. Ce que ça coûte est l'inverse : c'est le risque de le
faire vite, et de livrer une divergence lisible à table.

## 2. Job stories

> **Quand** je cuisine pour ma famille, **je veux** une seule casserole,
> **pour que** le repas reste un repas et pas trois régimes côte à côte.

> **Quand** quelqu'un à ma table est protégé par un plancher, **je veux** que le
> plat commun ne soit dimensionné sur l'objectif de personne, **pour que** sa
> protection ne dépende pas de ce que les autres visent.

> **Quand** mon assiette diffère de celle de mon frère, **je ne veux pas** que
> la raison soit lisible, **pour que** personne à table ne sache qui « fait
> attention ».

## 3. Périmètre

### Dans le périmètre

1. **Verrou de lane sous flag, en premier** : un seul membre sous
   `restriction_flag` ⇒ **toute** la lane passe en `per_portion`.
2. **Membre de référence DÉCLARÉ** à la configuration du foyer ; défaut : **le
   membre qui compose la session**.
3. **Sécurité du tronc** : union des contraintes médicales de tous + union des
   `forbidden` de toutes les doctrines gouvernantes. **Pas les `discouraged`**
   d'une doctrine non-référente.
4. **Le tronc dimensionné dans le MOTEUR** (jamais dans le prompt) sur le **MIN
   des enveloppes adultes calculables**.
5. **Deltas additifs**, catalogue fermé `{ food_ref, grams, moment }`, **sans
   slot de dressage** (A3).
6. **L'instrumentation de l'écart résiduel** par membre — c'est elle qui armera
   ou non la 2e itération.
7. **Vérification par membre** : le verrou de sortie tourne sur tronc+deltas(M)
   dans le contexte doctrinal de M.

### Hors périmètre — engageant

- ❌ **Le slot de personnalisation au dressage** (A3). Pas de « filet d'huile,
  copeaux de fromage » la première saison. Son armement est **une mesure**, pas
  une intuition — d'où le point 6.
- ❌ **Aucune enveloppe par membre quand un membre est flaggé.** Toute la lane
  dégrade. Le tronc qu'une personne flaggée mange ne peut pas être dimensionné
  sur les enveloppes de déficit de ses co-membres.
- ❌ **Aucun référent dérivé d'une métrique ou d'un ordre d'objectifs.** Combiné
  à la citation de la doctrine du référent, ça rendrait l'objectif d'un membre
  inférable par tout le foyer. Un mineur n'est **jamais** référent.
- ❌ **Aucun plat séparé.** Le delta enrichit le plat commun. Un plat séparé est
  la divergence rendue visible.
- ❌ **Aucun comparatif entre assiettes**, sur aucune surface. La divergence
  n'est ni affichée ni interrogeable.
- ❌ **Aucun canal nominatif vers un coach.** Une fréquence insatisfaisable
  d'une doctrine non-référente devient un **compteur de cohorte**, jamais un nom.
- ❌ **Aucune enveloppe pour un mineur**, aucun delta dérivé d'un objectif.
  `goal: null` par construction, `student_goals` jamais lu.

## 4. Le circuit

```
  1. VERROU DE LANE — EN PREMIER, avant tout calcul
     un membre sous restriction_flag ?
        oui ──→ TOUTE la lane en per_portion
                aucune enveloppe, aucun delta dimensionné,
                directions de service qualitatives existantes seulement
                → et le résultat est INDISCERNABLE d'un foyer
                  sans aucune enveloppe calculable
        non ↓
  2. MEMBRE DE RÉFÉRENCE
     colonne déclarée à la config du foyer
        absente ──→ le membre qui COMPOSE la session
                    (composer est un geste visible de tous:
                     aucune information cachée ne fuit)
     jamais un mineur · jamais dérivé d'une métrique
        ↓
  3. SÉCURITÉ DU TRONC
     union des contraintes médicales de TOUS
   + union des `forbidden` de TOUTES les doctrines gouvernantes
     (les `discouraged` d'une doctrine non-référente ne gouvernent PAS
      le tronc: des opinions n'ont pas prise sur l'assiette commune
      d'élèves d'autres coachs — elles gouvernent leurs add-ons)
     tronc incomposable ──→ household_trunk_unsatisfiable
                            message qui nomme des ALIMENTS,
                            jamais des membres, coachs ni objectifs
        ↓
  4. LE TRONC, dimensionné DANS LE MOTEUR (body reste null au prompt)
     sur le MIN des enveloppes adultes CALCULABLES
     un adulte sans enveloppe = « portion standard », jamais réduite
     zéro enveloppe calculable = cas NOMINAL (structure seulement)
     sentinelles vérifiées AU NIVEAU DU TRONC (couvertes là = couvertes pour tous)
        ↓
  5. DELTAS ADDITIFS — catalogue fermé, ordre dicté par le STIGMATE
     (a) plus du même (part protéique élargie, féculent doublé)   ← neutre
     (b) accompagnement usuel servi à part (pain, riz)            ← neutre
     (c) slot de dressage                                          ← HORS PÉRIMÈTRE (A3)
     chaque add-on = { food_ref, grams, moment } — des grammes
     d'ALIMENT, structurés, SANS PROSE À ASSAINIR
        ↓ + écart résiduel par membre ÉCRIT (l'instrumentation d'A3)
  6. VÉRIFICATION PAR MEMBRE
     applyKeelOutputLocks sur tronc+deltas(M) dans le contexte doctrinal de M
     l'add-on d'un membre ne peut pas contenir un aliment que SON coach interdit
```

## 5. Modèle de données

| quoi | où | note |
|---|---|---|
| membre de référence | colonne sur la table foyer | **déclarée**, jamais dérivée. `null` ⇒ le compositeur de la session |
| deltas | payload du repas | `{ food_ref, grams, moment: "cooking"\|"plating" }` — structuré, pas de prose |
| écart résiduel par membre | `meal_composition_verdicts` (FF-039) | **c'est la condition d'armement d'A3**. Sans lui, la 2e itération se déciderait à l'aveugle |

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Le verrou de lane s'évalue **avant tout autre calcul** | C'est la seule position sûre. Évalué après, il faudrait défaire des enveloppes déjà dimensionnées — et un défaisage se rate. |
| R2 | Un foyer sous verrou est **indiscernable** d'un foyer sans aucune enveloppe calculable | Testé par égalité de chaînes. Sinon le verrou devient un signal : « pourquoi notre foyer n'a-t-il plus de portions ? ». |
| R3 | Le référent est **déclaré**, jamais dérivé d'une métrique ni d'un ordre d'objectifs | Un ordre déterministe + la doctrine du référent citée = l'objectif le plus bas du foyer devient lisible par tous à table. Le plan lui-même serait le canal de divulgation. |
| R4 | Défaut : **le membre qui compose la session** | Composer est un geste visible de tous. Aucune information cachée ne fuit. |
| R5 | Un mineur n'est **jamais** référent, n'a **jamais** d'enveloppe, et `student_goals` n'est **jamais** lu pour lui | Satter, structurel : l'adulte décide quoi/quand/où, l'enfant décide combien. |
| R6 | Union des **`forbidden`**, jamais des `discouraged` non-référents | Un interdit est global par construction ; une opinion n'a pas prise sur l'assiette commune d'élèves d'autres coachs. Elle gouverne leurs add-ons. |
| R7 | Le tronc se dimensionne sur le **MIN** des enveloppes adultes calculables | La seule arithmétique compatible avec « on ajoute, on ne retire jamais ». Un adulte sans enveloppe compte « standard », **jamais réduit**. |
| R8 | Zéro enveloppe calculable est le cas **NOMINAL**, pas une dégradation | Gorin 2018 : composer le foyer autour d'une structure saine bénéficie à tous sans cible. C'est aussi l'état de la majorité des foyers. |
| R9 | `household_trunk_unsatisfiable` nomme des **ALIMENTS**, jamais des membres, coachs ni objectifs | Généralisée à tout message d'échec de cette lane. Un message qui nomme un membre transforme une contrainte en accusation. |
| R10 | Les add-ons sont **structurés**, sans prose | Des grammes d'aliment. `sanitizePortionNote` reste la ceinture sur toute prose de portion qui subsiste — mode audit, mise à `null`, jamais de réécriture. |
| R11 | **A3** : pas de slot de dressage. Son armement est conditionné à la **mesure** de l'écart résiduel | La condition d'armement est un chiffre, pas une intuition — d'où l'instrumentation obligatoire dès cette étape. |
| R12 | Ne sortent **jamais** : la raison d'un delta, l'objectif d'un membre, un différentiel lisible, toute mention de corps ou de flag | Aucun comparatif entre assiettes, nulle part. |
| R13 | Une fréquence insatisfaisable d'une doctrine non-référente ⇒ compteur **agrégé** dans la synthèse de son coach | Jamais nominatif. C'est le début du chemin « le coach voit du personnel » que MODEL.md ferme. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| Un membre sous flag | Toute la lane en `per_portion`. Personne n'est prévenu, aucune surface ne le montre. |
| Aucun référent déclaré | Le compositeur de la session. |
| Le compositeur est un mineur | Impossible : un mineur n'a pas de session à composer. Si la donnée le prétend, **aucun référent** et le tronc se compose en structure seulement. |
| Union des interdits incomposable | `household_trunk_unsatisfiable`, message en aliments. |
| Un seul adulte a une enveloppe | Le MIN est cette enveloppe ; les autres comptent « standard ». |
| Aucun adulte n'a d'enveloppe | Cas nominal, tronc composé comme aujourd'hui. |
| Un add-on contient un aliment interdit par le coach du membre | Rejeté à la vérification par membre. |
| Un mineur est à table | Les add-ons énergétiques sont rendus en **service familial** (plat au centre, chacun se sert). |
| **Le silencieux** : un delta dont la raison fuit dans une note | `sanitizePortionNote` en mode audit met la note à `null`. Elle ne réécrit jamais — une note réécrite est une note qu'on croit sûre. |

## 8. Critères d'acceptation

```gherkin
Étant donné un foyer dont un membre est sous plancher de restriction
Quand un repas de foyer est composé
Alors aucune enveloppe n'est dimensionnée
Et la sortie est indiscernable, caractère pour caractère, de celle d'un foyer
  dont aucun membre n'a d'enveloppe calculable
```

```gherkin
Étant donné un foyer de trois adultes dont un seul a une enveloppe calculable
Quand le tronc est dimensionné
Alors les deux autres comptent pour une portion standard
Et aucun d'eux ne compte pour une portion réduite
```

```gherkin
Étant donné un membre dont le coach DÉCONSEILLE l'huile de tournesol
Et qui n'est pas le membre de référence
Quand le tronc est composé
Alors l'huile de tournesol n'est pas exclue du tronc
Et elle est exclue de l'add-on de ce membre
```

```gherkin
Étant donné une union d'interdits qui rend le tronc incomposable
Quand la composition échoue
Alors le message nomme des aliments
Et il ne contient ni prénom, ni nom de coach, ni objectif
```

```gherkin
Étant donné un mineur à table
Quand les add-ons énergétiques sont rendus
Alors ils sont présentés en service familial
Et aucun chemin de code n'a lu student_goals pour lui
```

```gherkin
Étant donné un repas de foyer composé
Quand les verdicts sont écrits
Alors l'écart entre enveloppe cible et enveloppe atteinte est enregistré par membre
```

## 9. Rabbit holes

- **Dimensionner le tronc sur le référent.** C'est la solution évidente et c'est
  la mauvaise : le référent impose son déficit à tous. Le MIN est la seule
  arithmétique qui n'enlève rien à personne.
- **Traiter le verrou de lane comme un cas limite.** C'est le PREMIER pas de
  l'algorithme, pas un `if` de fin. Évalué après le dimensionnement, il oblige à
  défaire — et un défaisage se rate en silence.
- **Croire que « personne ne remarquera ».** Une assiette qui diverge est lue par
  tout le monde à table, et la question « pourquoi tu as moins ? » se pose au
  premier repas. C'est pour ça que l'ordre des canaux de delta est dicté par le
  stigmate et pas par la commodité.
- **Livrer le slot de dressage « puisque c'est plus fin ».** A3 dit non, et sa
  condition de réouverture est une mesure. Le point 6 du périmètre existe pour
  que cette mesure existe.
- **Ajouter un canal nominatif vers le coach « juste pour cette info-là ».**
  C'est le défaut fatal relevé par la revue TCA, et il commence toujours par une
  exception raisonnable.

## 10. Ce qu'on mesure

- **La mesure principale, et c'est la condition d'armement d'A3 :** l'écart
  résiduel entre enveloppe cible et enveloppe atteinte, **par membre**. Si les
  canaux (a) et (b) le comblent, le slot de dressage n'a pas de raison d'exister.
- **La mesure secondaire :** part de foyers où le verrou de lane s'arme. Si elle
  est élevée, la lane foyer est essentiellement qualitative et le dimensionnement
  sert peu.
- **La contre-mesure :** part de `household_trunk_unsatisfiable`. Une union
  d'interdits qui bloque souvent est un produit qui refuse de cuisiner.
- **La seconde contre-mesure :** toute question d'élève du type « pourquoi mon
  assiette est différente ». Une seule suffit à rouvrir R12.

## 11. Questions ouvertes

0. ~~**Le code n'est pas écrit.**~~ Écrit le 2026-08-11, une fois la lane foyer
   rendue par le chantier qui l'occupait (elle avait été touchée pour la
   dernière fois cinq heures plus tôt). Le moteur est complet :
   `household_composition.ts`, la colonne `reference_member_id`, et le
   branchement dans `generate-household-meal-v1`.

   **Un défaut trouvé par le test au premier passage, et il valait le
   détour :** `HouseholdLaneMode` distinguait `per_kg` (aucune enveloppe
   calculable) de `per_portion` (quelqu'un est protégé) — donc **l'enum
   lui-même désignait quelqu'un**, à qui lirait la ligne aujourd'hui ou
   l'agrégerait dans six mois. Corrigé : le mode rend `per_portion` dans les
   deux cas, exactement comme `envelope_mode` (FF-039 R14) mélange ses deux
   populations. Il ne coûte rien à l'appelant, puisque sans enveloppe
   calculable il n'y avait ni tronc dimensionné ni delta.
1. **Le référent et les deltas n'ont pas d'écran.** La colonne est déclarée
   « à la configuration du foyer » et le moteur la lit ; où le coach ou le
   compte maître la renseigne n'est pas tranché, et c'est une question de
   produit. Les add-ons sont écrits dans le payload (`member_deltas`) et aucune
   surface ne les rend encore — ce qui est le bon ordre : le rendu d'une
   divergence à table est la partie qui demande le plus de soin.
2. **Les sentinelles au niveau du tronc bénéficient à tous « gratuitement »** —
   vrai tant que tout le monde mange le tronc. Un membre qui saute le repas n'est
   pas couvert, et rien ne le sait. À instruire avec le bilan hebdo.
3. **Le service familial pour les mineurs change le rendu, pas le calcul.** Ce
   qui n'est pas tranché : comment le plan écrit « chacun se sert » sans que ça
   ressemble à un renoncement du produit.
