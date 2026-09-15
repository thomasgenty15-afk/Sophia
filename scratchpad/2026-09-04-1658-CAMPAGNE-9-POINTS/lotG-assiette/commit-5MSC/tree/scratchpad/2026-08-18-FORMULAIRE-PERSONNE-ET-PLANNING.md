# Structure — le formulaire d'une bouche, et le planning de la semaine

**Date** 2026-08-18 · Conception, rien n'est implémenté.
**Décisions produit de l'utilisateur** des 2026-08-17 et 2026-08-18.
**Révision 4** — R2 : corrige le mythe de la cuisson unique (§0.1), ajoute le
poids visé et le conseil calorique du repas dehors. R3 : l'invitation ne vise
que les autres bouches, la grille du plan prime (§2.2 bis), les noms de plats
(§4). R4 : audit de conformité — les deux bornes du slider (§Bloc 2),
apport du shaker (§Bloc 4), impact sur l'étape 4 (§2.3). R5 : **renversement —
un mineur a un objectif comme les autres** (§1).

---

## 0. Le principe qui range tout

Le parcours a **quatre étapes**, et elles existent déjà en code
(`onboarding.ts:805` — `STEP_ORDER`) :

```
situate  →  people  →  table  →  request
 (1)         (2)        (3)       (4)
   où j'en    QUI        COMMENT    ce dont
   suis       mange      la semaine j'ai envie
                         se passe
```

> **`people` décrit une PERSONNE — ce qui reste vrai quand la semaine change.
> `table` décrit une SEMAINE — ce qui change quand la vie change.**

Le vocabulaire `wrong` / `better` existe déjà dans le catalogue de questions
(`FUNNEL_QUESTIONS`) : **`wrong` bloque la génération**, **`better` l'améliore**
et n'est jamais rendu dans le tunnel. On s'en sert pour décider ce qui est
obligatoire dans le pop-up et ce qui attend.

### 0.1 ⚠️ LE MYTHE À NE PLUS PROPAGER — « un foyer, une seule cuisson »

**C'est faux, et le code le dit depuis le 2026-08-15.** Le mode de cuisson est
un **choix**, il est **exposé à l'écran**, et il a trois valeurs :

```
COOKING_SHAPES = ["one_dish", "one_session", "separate_sessions"]
                  household_portions.ts:465
```

| Valeur | Ce que ça veut dire |
|---|---|
| `one_dish` | un plat, des **parts** qui divergent |
| `one_session` | **deux plats**, sortis de la **même** session au fourneau |
| `separate_sessions` | **deux sessions** distinctes |

Le champ est `frontend/src/keel/components/CookingShapeField.tsx`, monté dans
`MealBuilder.tsx:1184`, et il part dans le corps de la requête de composition.
**« Une cuisson » est donc un DÉFAUT, pas une contrainte du modèle** — c'est le
niveau de personnalisation demandé qui décide.

**La nuance qui reste vraie, et qu'il faut connaître** : aujourd'hui ce choix
est un **plafond**, jamais un ordre (`capCookingShape`). Il peut *restreindre*
(« un seul plat » sur une table qui diverge), il ne *fabrique* jamais un second
plat quand personne ne diverge — sinon on cuisinerait deux casseroles pour rien.
Si on veut que « chacun le sien » **ouvre** vraiment une seconde cuisson, c'est
ce plafond-là qu'il faut transformer en réglage à deux sens, et c'est un lot
identifié.

---

## 1. LE POP-UP « UNE BOUCHE » — étape `people`, **maître compris**

Il s'ouvre à chaque ajout de personne, **et pour le compte maître lui-même** :
sans quoi celui qui tient la maison serait le seul dont on ne sait rien.

Six blocs. Les trois premiers sont **obligatoires**, les trois derniers
**sautables** — un pop-up qu'on ne peut pas fermer fait abandonner l'ajout de la
deuxième personne, et le foyer meurt là.

> ### ⚠️ RENVERSEMENT DU 2026-08-18 — un mineur a un objectif comme les autres
>
> **Les six blocs sont les mêmes pour tout le monde**, enfant compris. Un
> objectif renseigné sur un mineur **s'applique**, exactement comme sur un
> adulte.
>
> **Ce que ça change dans le code** — un seul endroit décide aujourd'hui :
>
> ```ts
> // household_portions.ts:392  — servingDirectionFor()
> if (member.ageState === "minor") return CHILD_DIRECTION;   // ← la ligne à retirer
> return goalApplies(member) && member.goal
>   ? SERVING_DIRECTION[member.goal]
>   : NEUTRAL_DIRECTION;
> ```
>
> `CHILD_DIRECTION` (« child-size share of the same dish ») devient le **repli
> d'un mineur SANS objectif**, au lieu d'écraser celui qui en a un. La doc
> produit qui porte l'ancienne règle
> (`docs/fonctionnalites/le-foyer/README.md:154`) est mise à jour **par le lot
> qui fait le changement**, jamais avant : une doc qui annonce un comportement
> que le code n'a pas encore est pire qu'une doc périmée.
>
> **Ce qui NE change PAS, et qui est une autre règle** : le corps d'un enfant
> n'est jamais **énoncé** — ni dans le prompt, ni à table. On calcule avec, on
> ne le dit pas. C'est déjà vrai pour tout le monde depuis le 17/08 (on émet
> des grammes d'aliment, jamais un chiffre de corps) ; pour un mineur, poser
> « 152 cm, 41 kg » à côté d'un prénom devant toute la famille rendrait sa
> direction **dérivable** par n'importe qui à table. La collecte est ouverte,
> l'énonciation reste fermée.
>
> ⚠️ **Le plancher, lui, s'adapte au lieu de disparaître.** Un déficit chez
> quelqu'un en croissance ne se borne pas comme chez un adulte. Le plancher
> d'énergie et le plafond du slider (§Bloc 2) restent armés pour un mineur, et
> **calculés sur son âge** — c'est ce qui permet d'ouvrir l'objectif sans
> ouvrir le régime.

### Bloc 1 — Qui c'est · OBLIGATOIRE

| Champ | État |
|---|---|
| Prénom | ✅ existe (`household_members.first_name`) |
| Date de naissance | ✅ existe (`household_members.birth_date`) |

> ⛔ **On ne demande JAMAIS « adulte ou enfant ».** La date de naissance le dit,
> et le moteur la résout déjà en trois états — mineur, majeur, **inconnu** —
> où `unknown` n'applique aucune direction. Poser la question en plus, c'est
> ouvrir la porte à deux réponses qui se contredisent.
>
> ⚠️ Le prénom est **la clé de tout l'affichage** : une part au prénom vide est
> filtrée en silence (règle F5). Il n'est jamais facultatif.

### Bloc 2 — La direction · OBLIGATOIRE · **CHANGE**

Trois choix au lieu de six :

```
   ○ Perdre du poids        ○ Maintenir        ○ Prendre du poids
        │                                            │
        └──────── ça DÉPLIE deux champs ─────────────┘
                  ① le poids VISÉ
                  ② le rythme : combien par semaine (slider)
```

**Pourquoi trois.** Le code le dit déjà de lui-même (`tokens.ts:591-596`) :
l'axe qui fait réellement bifurquer un plan est **la direction de la balance**.
Les six valeurs actuelles sont le « ni l'un ni l'autre » découpé en quatre
nuances qui rendent des consignes voisines. Et trois directions, c'est
**exactement** ce qu'un calcul calorique sait traduire.

**① Le poids visé.** Avec le rythme, il donne une **date d'arrivée** calculable
(« à 0,5 kg/semaine, tu y es vers le 12 novembre »). C'est ce qui rend
l'objectif réel au lieu d'abstrait.
⚠️ Deux gardes, parce que ce champ est le plus sensible du formulaire : il est
**borné par le plancher de sécurité** que `restriction_guard` protège déjà (un
poids visé sous ce plancher n'est pas accepté, et le refus est nommé, pas
silencieux) ; et il **n'existe pas pour un mineur**.

**② Le slider, et sa borne.** Le plafond ne peut pas être « 1 kg » pour tout le
monde :

```
1 kg de masse grasse ≈ 7 700 kcal   ⇒   1 kg/semaine ≈ 1 100 kcal/jour d'écart
```

Sur une personne de 60 kg dont l'entretien tourne autour de 1 700 kcal, ça pose
une cible à **600 kcal/jour**. Aucun produit ne doit écrire ce nombre.

**La borne du slider est le plus petit de trois nombres :**

```
max = MIN( 1 kg/semaine          ← le plafond absolu
         , un % du poids/semaine ← ce que CE corps supporte
         , ce qui garde la cible au-dessus du plancher d'énergie )
```

Autrement dit : **le maximum s'adapte à la personne, et il ne dépasse jamais
1 kg.**

> ⚠️ **Les deux bornes sont des décisions prises, pas un compromis.** Le
> plafond de 1 kg et l'adaptation au corps ont été validés ensemble par
> l'utilisateur le 2026-08-18. Ne pas lire l'une comme une entorse à l'autre :
> retirer l'adaptation pour « restaurer » le kilo poserait une cible à
> 600 kcal/jour sur une personne de 60 kg, et retirer le kilo laisserait un
> slider qui promet n'importe quoi à un grand gabarit. Côté prise, au-delà d'environ **0,5 kg/semaine**
le surplus part surtout en gras : le slider le **dit**, il ne l'interdit pas.

> Un slider dont le maximum s'adapte à la personne est **plus crédible** qu'un
> slider qui promet la même chose à tout le monde.

### Bloc 3 — Le corps · OBLIGATOIRE · **UN CHAMP NEUF**

| Champ | État |
|---|---|
| Taille · Poids · Sexe | ✅ existe (cran 2, ouvert le 2026-08-12, sans compte) |
| **Niveau d'activité** | 🆕 **le trou n°1 du produit** |

> **Pourquoi c'est le champ le plus important de ce document.**
> `energy_target.ts` sert une fourchette de **28 à 33 kcal/kg**, et son en-tête
> explique pourquoi : *« rien ne collecte le niveau d'activité »*, donc
> multiplier un métabolisme de base par une constante devinée « produit une
> cible fausse avec l'aplomb d'un tableau ».
> **Sans ce champ, aucune cible calorique n'est sérieuse.**

Quatre crans lisibles, jamais un nombre :

```
○ Assis toute la journée, peu de marche
○ Debout ou en mouvement une bonne partie du jour
○ Sport 2 à 3 fois par semaine
○ Sport 4 fois ou plus, ou métier physique
```

### Bloc 4 — Ce qu'elle mange déjà · sautable

- **« Y a-t-il quelque chose qu'elle mange presque tous les jours ? »**
  → `household_habits` (existe depuis le 2026-08-14, ouvert après qu'un plan
  réel ait servi des œufs brouillés **sept matins d'affilée** à une femme qui
  mange une pomme : personne ne lui avait demandé).
- **Le shaker / la collation chiffrée** → `fixed_intakes` (FF-051, livré).
  Il n'entre là **que si la quantité est connue** (« 30 g de whey »), et on
  demande **ce qu'il apporte** : *combien de protéines, combien de calories*.
  C'est ce qui lui permet de **compter dans l'enveloppe** au lieu d'être
  contourné — un shaker ignoré, c'est 380 kcal invisibles par jour.
  Ces deux nombres se lisent **sur l'étiquette du pot** : c'est un fait du
  produit, pas un verdict sur la personne — la frontière du §3 tient.
  ⚠️ **Mis en avant pour qui PREND du poids** (le cas où il est presque
  systématique), proposé sans insistance aux autres : quelqu'un qui perd du
  poids peut très bien en prendre un, et ne pas le demander le rendrait
  invisible au calcul.

> ⚠️ Frontière déjà écrite, à ne pas brouiller : une **habitude** est une
> tendance que la composition contourne ; un **apport fixe** est une quantité
> qui remplace un repas. Inventer une quantité pour une habitude écrirait un
> fait que personne n'a pesé.

### Bloc 5 — Allergies · sautable mais **fail-closed**

✅ Existe (FF-046). Liste fermée + champ libre. Si la lecture échoue, le produit
**cesse de nommer des aliments** plutôt que de composer à l'aveugle.

### Bloc 6 — Ce qu'elle n'aime pas, et son régime · sautable

- Aliments refusés (dégoût, pas allergie) · Régime (FF-042, existe).

> ⚠️ **Piège à ne pas reproduire.** `food_preferences` est indexé sur `user_id`
> — donc **inatteignable pour une bouche sans compte**, c'est-à-dire pour un
> enfant, le cas nominal du foyer. Ce bloc doit vivre sur **la ligne membre**,
> comme les allergies et les habitudes.

---

## 2. L'ÉTAPE `table` — l'équipement d'abord, puis les gens

Ordre imposé : **les moyens de cuisson AVANT les disponibilités**. On demande
avec quoi on cuisine avant de demander quand — sinon on planifie des cuissons
impossibles.

### 2.1 Les moyens de cuisson · **N'EXISTE NULLE PART** · niveau FOYER

Vérifié : aucune occurrence de four, micro-ondes ou congélateur dans le moteur.
Le plan propose des cuissons **sans savoir si elles sont possibles**.

Une cuisine est partagée : la question se pose **une fois pour le foyer**.

```
☑ Four        ☑ Plaques      ☐ Micro-ondes    ☐ Congélateur
☐ Air fryer   ☐ Autocuiseur  ☐ Blender/robot
```

**Trois cases changent vraiment le plan :**

| Case | Ce qu'elle décide |
|---|---|
| **Congélateur** | La stratégie « une seule course, je congèle » (FF-005) est **impossible** sans lui, et la conservation au-delà de 3 jours n'a aucune autre issue. |
| **Micro-ondes** | Le geste `reheat_only` livré hier suppose un moyen de réchauffer. Sans lui, « réchauffer » veut dire poêle ou four — **et le temps du jour J change**. |
| **Four** | L'essentiel du batch cooking en dépend (10 min de mains pour 50 min de cuisson est *la* raison d'être des grosses cuissons). |

### 2.2 Le déjeuner dehors · par PERSONNE · **majeurs uniquement**

La question ne se pose **que pour les plus de 18 ans**, et l'âge est **déduit de
la date de naissance** — jamais redemandé.

> **La vraie question n'est pas « où tu manges » mais :
> le plan PRODUIT-il ce repas ? et sinon, quelqu'un le COMPTE-t-il ?**

Le formulaire **se déplie au fur et à mesure** :

```
« La semaine, est-ce qu'il/elle mange au bureau ? »
   │
   ├─ NON ─────────────────────────► le plan compose tous les repas
   │
   └─ OUI ──► « Il/elle emporte une gamelle, ou mange dehors ? »
                │
                ├─ GAMELLE ──► « Y a-t-il un micro-ondes au bureau ? »
                │                   OUI → repas réchauffable
                │                   NON → ⚠️ le repas doit être BON FROID
                │                          (contrainte de composition)
                │
                └─ DEHORS ──► le plan ne compose pas ce repas,
                              MAIS il en fait la PLACE (voir ci-dessous)
```

**ⓐ La gamelle.** Le repas est composé, avec deux contraintes neuves :
transportable, et **bon froid** s'il n'y a pas de micro-ondes. C'est le seul
endroit où l'équipement appartient à **la personne** et non au foyer.

**ⓑ Dehors — et le plan fait de la place.** Même sans part composée, le plan
**dit combien viser** : *« au déjeuner, vise autour de 700 kcal »*. Le repas
sort du plan, il ne sort pas du calcul — sinon la cible de la journée serait
fausse par construction, et fausse dans le sens qui décourage.

> ### ⚠️ Le point fin — ce que le chiffre du jour a le droit de dire
>
> Si un repas sur trois est inconnu, afficher « ta journée : 1 400 · ta
> fourchette : 1 900–2 200 » est **faux** : la personne lit un déficit alors
> qu'elle a peut-être mangé un burger.
>
> **Le chiffre change de sujet, pas de valeur.** Il ne parle plus de la journée
> mais de ce que le plan a produit, et il le dit : *« sur les 2 repas que j'ai
> composés »*. Le conseil du midi (« vise 700 ») reste, lui, une **consigne**,
> jamais un solde — et jamais un reste (« il te reste 680 kcal » est la phrase
> d'un tracker, et elle n'existe nulle part).

**ⓒ Le levier d'invitation — et il ne vise QUE les autres bouches.**

> ⚠️ **Le maître n'est jamais concerné par ce levier.** Il a déjà la
> conversation : il déclare lui-même ce qu'il a mangé dehors, sans rien
> réclamer. Le manque n'existe que pour **quelqu'un d'autre du foyer** — une
> bouche sans compte n'a aucun canal pour dire ce qu'elle a mangé au
> restaurant, et personne ne peut le faire à sa place.

Quand cette personne-là a un objectif de perte ou de prise **et** mange dehors,
il faut bien que quelqu'un déclare ce repas. C'est exactement là qu'on dit :

> *« Pour que ses déjeuners dehors comptent, invite-la : elle pourra les
> déclarer elle-même les jours où elle mange à l'extérieur. »*

Ce n'est pas une invitation de politesse, c'est une invitation **motivée par un
manque que la personne vient de constater elle-même**. Et le test n°1 du
business est précisément l'invitation : combien de membres d'un foyer réel
entrent **sans relance humaine**.

⚠️ Le suivi déclaratif reste **choisi**, jamais un défaut : il passe par les
gardes existantes (`energy_gate` — plancher TCA → mineur → position du coach →
interrupteur de la personne) et **reste éteignable**. Un chiffre qu'on ne peut
pas faire taire est un tracker.

### 2.2 bis — « Mange au bureau » est un DÉFAUT, pas une règle

> ### La grille du plan gagne toujours sur la réponse hebdomadaire.

La question de §2.2 décrit **une semaine ordinaire**. Elle ne décide pas de
chaque midi. Si, dans le détail du plan — la grille où l'on coche les jours —
la personne est marquée **présente à table un midi**, alors elle est présente
ce midi-là : le plan compose sa part, point.

**Le sens de lecture, et il n'est pas négociable :**

```
réponse hebdo  ──PRÉ-REMPLIT──►  la grille du plan  ──DÉCIDE──►  la composition
« au bureau                       (par jour ET par                 (part, ou
  du lundi au vendredi »           créneau)                         conseil)
```

Une réponse hebdomadaire qui ne se laisserait pas contredire ferait disparaître
un repas que quelqu'un vient de déclarer à la main — le défaut le plus
frustrant qui soit, parce qu'on a fait le geste et qu'il n'a rien changé.

**Ce que ça impose au modèle de données.** La grille a aujourd'hui deux états
(`away_days`, par jour **et par créneau**, avec union entre ce que la personne
déclare et ce que le maître marque). Il lui en faut **trois** :

| État | Le plan compose ? | Le plan dit un nombre ? |
|---|---|---|
| **À table** | oui — une part | — |
| **Dehors** | non | **oui** : « vise autour de 700 » |
| **Absent** | non | non — la personne n'est pas dans sa semaine |

« Dehors » et « absent » se ressemblent (aucune part dans les deux cas) et ne
sont pas la même chose : **ce qui les sépare est ce que le produit DIT**. Les
confondre ferait taire le conseil du midi, ou le ferait apparaître pendant des
vacances.

⚠️ La règle d'union existante reste : une absence est un **fait** que deux
personnes peuvent connaître, donc la déclaration de l'intéressé et la marque du
maître s'additionnent au lieu de s'écraser.

### 2.3 Ce que le déjeuner dehors change à l'étape 4

Il ne reste pas dans son coin : il **pré-remplit** ce que l'étape suivante
propose, et il change ce que le plan produit.

| Ce qui est renseigné à l'étape 3 | Ce qu'on retrouve à l'étape 4 |
|---|---|
| « au bureau, gamelle, lundi→vendredi » | ces cinq midis sont **déjà cochés « dehors »** dans la grille, et le plan compose cinq repas **transportables** (froids si pas de micro-ondes) |
| « au bureau, mange dehors » | ces midis sont **déjà cochés « dehors »**, sans part composée, avec le **conseil chiffré** (« vise ~700 ») |
| rien de renseigné | la grille reste « à table » partout, comme aujourd'hui |

⚠️ **Pré-remplir n'est pas décider** : tout se corrige à la main dans la grille,
et c'est la grille qui gagne (§2.2 bis). Le pré-remplissage sert à ce que le
cas nominal ne demande **aucun** clic, pas à imposer une semaine type.

### 2.4 Ce qui existe déjà à cette étape

Rythme et moments de repas, absences, budget, temps de cuisine, propriétés de
jour, mode de cuisson (§0.1) : déjà collectés, rangés dans
`student_goals.practical_constraints`.

---

## 3. Ce que la cible calorique contraint — tranché

> **La cible contraint les GRAMMAGES, pas le choix des plats.**

Les plats restent choisis librement ; ce qui s'ajuste par personne, c'est la
**quantité pesée** — c'est-à-dire les **boîtes** livrées le 17/08 (« Boîte Theo
560 g · Zoe 520 g · Lou 280 g », mesuré sur un run réel).

**Le raisonnement, corrigé** : ce n'est pas « parce qu'il n'y a qu'une cuisson »
— c'est faux (§0.1). C'est parce que **le grammage est le bon niveau de
précision** : « une poignée », « une grosse portion » ne veulent rien dire, et
peser à chaque repas est intenable. On pèse **une fois**, à la session, dans des
boîtes nommées ; le jour J, on cite la boîte. Quand le foyer demande plus de
personnalisation, le mode de cuisson ouvre en plus des plats distincts — les
deux leviers se composent, ils ne se remplacent pas.

**Ce que ça implique, et qui doit être écrit avant la première ligne de code :**

1. **C'est un renversement, il faut le nommer.** `energy_target.ts` dit
   aujourd'hui : *« Elle n'entre pas dans le générateur. Un plan qui vise un
   chiffre est un régime chiffré, et ce n'est pas ce produit. »* Le renverser
   est légitime — ça a déjà été fait le 12/08 pour l'affichage — mais si on ne
   l'écrit pas, quelqu'un le « réparera » dans six mois.
2. **La garde TCA est l'étape zéro**, déclarée bloquante par
   `CALORIE_REVERSAL.md` §0. Trois réponses à écrire : la garde **supprime**-t-elle
   le chiffre ou **empêche**-t-elle de le produire ; **où s'écrit l'état** qui
   porte ça (un paramètre de garde optionnel est une garde désarmée) ; la
   personne peut-elle **l'éteindre**.
3. **Migration des six objectifs vers trois** : 54 fichiers lisent ces jetons.
   Lot à part, avec la règle du dépôt — aucune valeur d'énumération sans branche
   nommée, et les mappings échouent bruyamment.
4. **Le plafond de cuisson devient un réglage à deux sens** si « chacun le
   sien » doit vraiment ouvrir une seconde cuisson (§0.1).

---

## 4. Les noms de plats — et pourquoi ça ne se fait pas en écrasant le titre

**La demande** : des plats qui portent des noms qui donnent envie, au lieu de
« Chicken, courgette and pepper rice bowls ».

**Ce qu'il ne faut pas faire** : rendre `dishes[].title` plus joli. Ce champ est
lu **à table, à voix haute**, il remplit les cases étroites de la grille de la
semaine, et il est ce à quoi on reconnaît son plat au moment de le préparer.
Un titre qui devient « Le Soleil de Marrakech » ne dit plus **ce qu'il y a dans
l'assiette** — et personne ne peut cuisiner un nom.

**La forme qui marche : deux champs, pas un champ transformé.**

```
name   🆕  « Bowls dorés au poulet rôti »   ← le nom d'usage, court, appétissant
title  ✅  « Poulet, courgettes, poivrons   ← ce que c'est, inchangé
            et riz »
```

| Point | Décision |
|---|---|
| **Qui décide** | déclaré par le modèle, **facultatif** — et compté (`name_counts`), comme tout champ déclaré |
| **Si absent** | on affiche le `title`. Dégradation gracieuse : un plan sans noms reste exactement le plan d'aujourd'hui |
| **Où c'est rendu** | le **nom** en tête de carte et dans la grille (les cases sont étroites, un nom court y gagne) ; le **titre** juste dessous dans la carte, pour qu'on sache toujours ce qu'on mange |
| **Traduction** | `dishes[].name` rejoint `MEAL_TRANSLATABLE_FIELDS` (le titre y est déjà) — un nom d'usage anglais dans un plan français serait pire que pas de nom |
| **Ce qui ne bouge pas** | **aucune garde ne s'accroche au nom.** L'attribution passe par `member_id`, jamais par le texte — la cicatrice des matchers de titre reste fermée |
| **Coût** | une ligne de schéma, une de prompt. ⚠️ La lane foyer **expire déjà à 4 min** : à grouper avec un autre changement de prompt plutôt qu'à bumper pour lui seul |

### Les images — plus tard, et voici ce qu'il faudra regarder

Trois contraintes à mesurer avant de s'y mettre, aucune bloquante :

1. **La latence.** La génération du plan frôle déjà l'expiration ; les images se
   feront donc **après** le plan, en tâche de fond, jamais dans le même appel.
2. **Le coût et le stockage** — une image par plat, quinze plats par semaine,
   par foyer.
3. **⚠️ Le risque produit, le seul vraiment sérieux** : une image générée est
   toujours plus belle que l'assiette réelle. Elle crée une attente que la
   cuisine ne tiendra pas, et un plan qui déçoit visuellement est un plan qu'on
   arrête de suivre. Une piste : un traitement graphique assumé (illustration,
   pas photoréalisme) qui donne envie **sans** promettre une assiette.

