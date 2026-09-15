# FF-043 · La résolution foyer — une cuisson, des assiettes qui divergent

| | |
|---|---|
| **Identifiant** | `FF-043-la-resolution-foyer` |
| **Statut** | 🟠 En cours — moteur livré, surfaces d'écran à faire (§11 n°1) |
| **Date** | 2026-08-10 |
| **Autorité produit** | [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) · [MODEL.md](../../keel/MODEL.md) · [CONTRACT.md](../../keel/CONTRACT.md) · design d'origine : `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` (§4, arbitrage A3) |
| **Dépend de** | [FF-039](../composition-des-repas/FF-039-enveloppes-et-verdicts-en-observation.md) (l'enveloppe) · [FF-040](../composition-des-repas/FF-040-la-boucle-de-correction.md) · [FF-041](../composition-des-repas/FF-041-la-methode-du-coach-executable.md) · `household_portions.ts` (`sanitizePortionNote`, `FORBIDDEN_PORTION_TERMS`) · `household_meal_generation.ts` · `restriction_runtime.ts` |
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
- ~~❌ **Aucune enveloppe pour un mineur**, aucun delta dérivé d'un objectif.~~
  **RENVERSÉ le 2026-08-12** — voir juste en dessous. `student_goals` n'est
  toujours **jamais** lu pour un mineur, et aucun delta ne dérive d'un objectif.

### ⚠️ Le renversement du 2026-08-12 — chaque bouche a un corps

> **Par qui** : l'utilisateur, en connaissance de cause, après que la contrainte
> et sa raison lui ont été exposées.
> **Contre quoi** : le point ci-dessus (« aucune enveloppe pour un mineur »),
> **R5**, et — côté FF-047 — « aucun fait corporel pour un mineur » ainsi que le
> **cran 2** du [README](README.md) (« le corps : compte requis »).

Mot pour mot :

> « les deltas n'ont pas d'objectif donc ils ont juste un objectif normal de
> manger selon leur poids, âge, taille c'est tout »
>
> « il faut la taille le poids et l'âge et le gender **obligatoirement** (même
> quand ils ont pas de compte secondaire !) »

**Le défaut que ça répare, mesuré.** `trunkSizing` prenait le MIN sur les
enveloppes des seuls **adultes**, et la boucle des deltas s'ouvrait sur
`if (m.ageState !== "adult") continue;`. Dans le foyer « une mère en `fat_loss`
+ deux enfants », elle est la seule adulte : **la casserole ÉTAIT une casserole
de déficit, et les enfants la mangeaient sans aucun add-on.** C'est le préjudice
que le §1 nomme — « la troisième mange la restriction d'un autre sans l'avoir
demandée » — et il n'était fermé que pour les adultes.

**Ce qui reste interdit, et qui n'a pas bougé d'un pouce :**

- ⛔ **un mineur n'a JAMAIS d'objectif.** Son enveloppe est la **maintenance**,
  toujours, quoi qu'il y ait dans `household_members.goal`. Ce n'est pas un `if`
  qu'on pourrait retirer : `childEnvelopeFromBody` **n'accepte aucun paramètre
  d'objectif**. Un `fat_loss` posé par le maître sur la fiche d'un enfant est
  **inerte**, et le test le prouve par égalité d'empreinte d'enveloppe ;
- ⛔ **ni plafond de densité, ni déficit, ni direction dérivée** pour un mineur.
  Ce qu'on calcule est un **besoin**, pas une cible à réduire ;
- ⛔ **aucun fait corporel de mineur n'entre dans le prompt**, ne sort à l'écran
  ni dans un log nominatif. `householdBodyFacts` rend `[]` hors adulte, et la
  suppression de `meal_body.ts:247-248` **reste en place**. Vérifié sur la chaîne
  du run réel : aucun des six chiffres corporels des deux enfants n'apparaît dans
  le brief de portions.

**La ligne de partage : collecter et calculer, jamais énoncer.**

### Ce que le corps de la FICHE achète, et ce qu'il n'achète pas

Une bouche a **deux** sources possibles d'enveloppe, et l'ordre entre elles est
la garde la plus chère du lot (`mouthEnvelope`, `household_composition.ts`) :

| Source | Ce qu'elle porte | Ce qu'elle achète |
|---|---|---|
| **le COMPTE** (`envelopeFor`) | série de pesées datées, plancher TCA, objectif | tout — **et elle gagne TOUJOURS**, y compris dégradée |
| **la FICHE** (`household_member_bodies`) | taille, poids, sexe saisis une fois par le maître | une **MAINTENANCE**, jamais un objectif |

Une enveloppe `per_portion` rendue par le compte est **la décision du plancher
TCA**, pas une absence : retomber sur la fiche derrière elle contournerait le
plancher par la porte de service. D'où « elle gagne toujours ».

Et la fiche n'achète qu'une maintenance parce que, **sans série de pesées, il
n'y a pas de plancher TCA derrière** : rien n'arrêterait une restriction si on
en exécutait une. Une maintenance, elle, ne peut ni creuser un déficit ni poser
un plafond de densité — elle ne peut que faire **descendre** le tronc
(protecteur) ou **ouvrir** un add-on (additif).

**Corollaire, et c'est la réponse à « le delta d'un adulte sans objectif » :**
un adulte sans objectif applicable — comme un mineur, comme une bouche d'âge
inconnu — mange **normal**, c'est-à-dire sa maintenance calculée sur son corps.
Un adulte **sans compte** et **avec** un objectif reçoit lui aussi la
maintenance : son objectif ne peut pas être exécuté sans plancher.

Une bouche d'âge **inconnu** n'a **aucune** enveloppe, même avec un corps
complet : ni l'équation d'adulte ni l'équation d'enfant, parce qu'elles donnent
des résultats très différents sur le même poids et que deviner serait choisir.

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
        écrite par LE COMPTE MAÎTRE SEUL, dans l'écran du foyer
        (keel_household_set_reference_member, 20260812220000)
        absente ──→ le membre qui COMPOSE la session
                    (composer est un geste visible de tous:
                     aucune information cachée ne fuit)
     jamais un mineur · jamais dérivé d'une métrique
        ↓
  2 bis. L'ENVELOPPE DE CHAQUE BOUCHE — mouthEnvelope()
     le COMPTE d'abord (série de pesées + plancher TCA + objectif),
       et il gagne TOUJOURS, y compris dégradé;
     à défaut la FICHE (household_member_bodies), qui n'achète
       qu'une MAINTENANCE:
         mineur      ──→ Schofield / FAO-WHO-UNU, par tranche et par sexe
         adulte      ──→ Mifflin-St Jeor, bande de maintenance
         âge inconnu ──→ AUCUNE enveloppe (part standard)
     ⛔ Mifflin n'est JAMAIS appliquée à un enfant: mesuré 20 % sous
        son besoin réel à 8 ans comme à 12 ans.
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
     sur le MIN des enveloppes de TOUTES LES BOUCHES calculables
       (« adultes » jusqu'au 2026-08-12 — c'était le trou)
     une bouche sans enveloppe = « portion standard », jamais réduite
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
| R5 | Un mineur n'est **jamais** référent, ~~n'a jamais d'enveloppe~~, ~~n'a **jamais d'objectif**~~, et `student_goals` n'est **jamais** lu pour lui | Satter, structurel : l'adulte décide quoi/quand/où, l'enfant décide combien. ⚠️ **Amendée le 2026-08-12** : il a désormais une enveloppe, et elle est **toujours** la maintenance pédiatrique — parce qu'un corps ne donne pas un objectif. Sans elle, il mangeait le tronc d'un adulte en déficit. ⚠️ **Amendée une seconde fois le 2026-08-13** : il a désormais une DIRECTION s'il en veut une — mais jamais `fat_loss` ni `recomposition` (`goal_not_for_minor`). §8.4 interdit le registre correctif sur le corps d'un enfant, pas la direction elle-même. |
| R14 | Le **corps de la fiche** n'achète qu'une **maintenance**, jamais un objectif ; **l'enveloppe du compte gagne toujours**, y compris dégradée | Sans série de pesées il n'y a pas de plancher TCA derrière : rien n'arrêterait une restriction. Et retomber sur la fiche derrière une enveloppe dégradée contournerait le plancher par la porte de service. |
| R15 | Le référent est écrit par le **compte maître seul**, dans l'écran du foyer — jamais par le coach | MODEL.md : il n'existe aucun canal 1:1 coach → élève. |
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
1. ~~**Le référent et les deltas n'ont pas d'écran.**~~ **Le référent en a un
   depuis le 2026-08-12** (`ReferenceMemberCard`, `HouseholdPage.tsx` ;
   `keel_household_set_reference_member`, migration `20260812220000`). Tranché :
   **le compte maître seul**, dans l'écran du foyer. Les deux alternatives sont
   écartées et le restent — le coach (aucun canal 1:1, MODEL.md) et un référent
   **dérivé** (déjà hors périmètre §3).

   ⚠️ **La carte ne s'affiche qu'à partir de DEUX adultes à table.** En dessous,
   la cascade `déclaré → composeur → null` donne déjà la bonne réponse et
   l'écran n'apprendrait rien : ce serait un réglage à une seule valeur,
   c'est-à-dire une inquiétude offerte sans contrepartie. Le foyer nominal —
   un parent et ses enfants — ne voit donc jamais cette carte.

   **Les deltas, eux, n'ont toujours aucune surface.** Ils sont écrits dans
   `member_deltas` et le run réel les produit (60 g et 180 g de riz pour deux
   enfants) ; aucun écran ne les rend. C'est le bon ordre : le rendu d'une
   divergence à table est la partie qui demande le plus de soin.
4. **Un tout-petit tire le tronc vers le bas, et personne n'a mesuré ce que ça
   coûte.** Le MIN sur toutes les bouches est l'arithmétique voulue — elle
   garantit que le tronc ne dépasse le besoin de personne — mais plus la plus
   petite bouche est petite, plus la casserole commune rétrécit et plus les
   adultes mangent en add-on. À la limite, « une cuisson » devient « une petite
   cuisson et beaucoup de riz à côté ». `residualGaps` l'instrumente ; aucun
   plancher n'a été posé, parce qu'un plancher inventé serait pire qu'un chiffre
   mesuré.
5. **Un titulaire avec un objectif et SANS pesée dégrade TOUTE la lane** —
   trouvé par le run réel du 2026-08-12, et **pas** introduit par ce lot.
   `envelopeFor` rend `per_portion` pour trois causes indiscernables (plancher
   TCA, corps absent, poids inconnu), et `householdLaneMode` traite n'importe
   quel `per_portion` comme le verrou. Un adulte qui a un compte, a choisi un
   objectif et n'a jamais renseigné son poids fait donc perdre tout
   dimensionnement au foyer entier, en silence. L'indiscernabilité est voulue
   (R2) ; sa **conséquence sur le foyer** n'a jamais été décidée.
6. **La résolution de date D18 s'arrête au roster** — même run.
   `keel_household_member_age` résout `profiles.birth_date` puis la fiche du
   maître ; `student_body_io.ts:162` ne lit que `profiles.birth_date`. Un adulte
   daté par son maître est donc `adult` au roster (son objectif s'applique, sa
   direction de service est écrite) et porte `ageBand: null` dans son corps —
   donc **aucune bande d'énergie**, donc il ne pèse jamais dans le MIN et ne
   reçoit jamais d'add-on. Mesuré sur la bouche « Nina » du run.
2. **Les sentinelles au niveau du tronc bénéficient à tous « gratuitement »** —
   vrai tant que tout le monde mange le tronc. Un membre qui saute le repas n'est
   pas couvert, et rien ne le sait. À instruire avec le bilan hebdo.
3. **Le service familial pour les mineurs change le rendu, pas le calcul.** Ce
   qui n'est pas tranché : comment le plan écrit « chacun se sert » sans que ça
   ressemble à un renoncement du produit.
