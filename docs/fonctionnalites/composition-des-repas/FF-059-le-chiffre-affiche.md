# FF-059 · Le chiffre affiché

| | |
|---|---|
| **Identifiant** | `FF-059-le-chiffre-affiche` |
| **Statut** | 🟢 Lots 1-4 construits. Lot 4 (2026-09-01) : la direction ouvre le chiffre, et la fourchette la suit |
| **Date** | 2026-08-12 |
| **Autorité produit** | Décision humaine du 2026-08-12 · [CALORIE_REVERSAL.md](../../keel/CALORIE_REVERSAL.md) (le cadre) · [CONTRACT.md](../../keel/CONTRACT.md) amendement non-input #4 |
| **Dépend de** | `_shared/keel/student_body_io.ts` (poids, taille, sexe, âge) · `doctrine_starter.ts` axe `counting` · `restriction_guard.ts` (le plancher) · `meal_generation.ts` (les quantités du plan) |
| **Effort estimé** | 4 à 5 jours, en trois lots |

---

## 1. Le problème

**Décision du 2026-08-12 : les calories s'affichent. L'exception est le coach
qui dit qu'on ne compte pas.**

C'est un renversement, et il faut le nommer comme tel. Trois décisions écrites
disaient l'inverse :

- le prompt du générateur : *« No calories. No macro grams. No percentages of
  anything nutritional. Not as a target, not as a range, not "roughly". »*
- `coachStartingNumbers` : *« l'élève ne voit JAMAIS ces nombres : un chiffre
  affiché à l'élève devient un objectif »*
- `calorie_readout` dans `SUPPRESSED_STUDENT_SURFACES`

**Ce qui a changé.** Le refus était fondé sur une mesure de **la photo** :
−26,6 % de biais, systématique, dans le sens flatteur. Mais un **plan composé**
n'est pas une photo : les quantités ne sont pas devinées, **elles sont écrites
par le produit**. Le banc le mesure — condition grammages fournis : **MAPE
2,3 %**, un cas à 662 kcal contre 661,8 de vérité terrain. C'est un **calcul**,
pas une estimation, et c'est plus précis que n'importe quelle app de comptage.

**Ce que ça coûte de ne rien faire.** La personne en prise de masse — un
segment cible — demande « est-ce que je mange assez » et n'obtient qu'une
réponse structurelle. Le produit connaît la réponse exacte et se tait.

**Ce que ça coûte de mal le faire.** Levinson 2017 : **73 % des patients TCA
déclarent qu'un tracker de calories a contribué à leur trouble.** C'est la
raison de l'interdiction d'origine, elle n'est pas périmée, et elle impose que
ce chantier soit une **chaîne de gardes**, pas un affichage.

## 2. Job stories

> **Quand** je suis en prise de masse, **je veux** savoir si mon plan me nourrit
> assez, **pour que** je n'aie pas à recalculer moi-même dans une autre app.

> **Quand** mon coach dit qu'on ne compte pas ici, **je ne veux voir aucun
> chiffre**, **pour que** l'app ne contredise pas sa méthode.

> **Quand** les chiffres me font du mal, **je veux** pouvoir les éteindre,
> **pour que** l'app ne devienne pas le tracker que j'essaie de quitter.

## 3. Périmètre

### La chaîne de gardes — l'ordre fait la fiche

Un chiffre ne s'affiche que si **les quatre portes** sont ouvertes, dans cet
ordre :

| # | Porte | Qui décide | Si fermée |
|---|---|---|---|
| **1** | **Plancher TCA** — `restriction_flag` levé | **personne.** Ni le coach, ni l'élève, ni un réglage | aucun chiffre, nulle part, sans exception |
| **2** | **Mineur**, et **2bis l'âge inconnu** (⟳ S3) | personne | aucun chiffre |
| **3** | **La doctrine du coach** — axe `counting` | le coach | `no_counting` → aucun chiffre |
| **4** | **L'interrupteur de l'élève** — ⟳ **tri-état** | l'élève | il éteint, ça se tait |

⟳ **LOT 4 (2026-09-01) — LA PORTE 4 S'OUVRE TOUTE SEULE QUAND LA DIRECTION EST
DÉCLARÉE.** Décision humaine : *« dès qu'une personne dit qu'elle veut gagner ou
perdre du poids, elle doit être en capacité de voir ces chiffres. Comme ça c'est
pas compliqué et ça se fait automatiquement. »*

`profiles.energy_display_enabled` et `energy_target_enabled` sont des **tri-états** :
`null` = personne n'a choisi ⇒ `fat_loss` et `muscle_gain` ouvrent, `maintenance`
et l'absence ferment ; `true`/`false` = choix explicite, et **`false` gagne pour
toujours** (R7). La dérivation s'écrit **une seule fois**, dans `energySwitchFrom`
(`_shared/keel/energy_gate.ts`), et elle entre en **quatrième position** : elle ne
desserre ni 1, ni 2, ni 3. On ne pose la question à personne — on lit une réponse
déjà donnée, celle que `canGenerate` exige de tout adulte à l'entonnoir.

⚠️ **Ce que ça n'ouvre pas :** la porte 2bis reste fermée sans date de naissance,
et le bouton reste alors invisible (`switch_offerable: false`) — délibérément :
« donne ta date, reçois des calories » serait un marchandage.

⚠️ **La porte 1 n'est pas l'exception dont parle la décision.** Le coach décide
de la porte 3 ; **il ne peut pas ouvrir la porte 1**. Un coach qui compte et un
élève sous plancher TCA : **le plancher gagne**. C'est le point le plus
important de cette fiche.

**La porte 3 existe déjà.** `doctrine_starter.ts` porte l'axe `counting`
(« Whether numbers are part of your method ») avec trois positions :
`no_counting` (jeton interdit `count_calories`, six formes de surface, et son
`instead`), `count_briefly` (« compte deux semaines, c'est une leçon, pas un
mode de vie »), et `NO_RULE_POSITION`. **Aucune mécanique nouvelle à
inventer** — il faut la lire, pas la construire.

### Les trois niveaux de chiffre, et ils ne sont pas équivalents

| Niveau | Exemple | Nature | Base |
|---|---|---|---|
| **A — par plat** | « ce plat : ~550 kcal » | un **fait** sur l'aliment | quantités écrites par le produit — CALCUL, 2,3 % |
| **B — par jour** | « la journée : ~1 950 kcal » | la somme de A | même base |
| **C — contre une cible** | « 1 420 / 2 100 aujourd'hui » | un **jugement** sur la personne | A + B + une cible estimée |

⟳ **LOT 4 — LE NIVEAU C SUIT DÉSORMAIS LA DIRECTION.** La fourchette était une
MAINTENANCE nue : quelqu'un qui visait une perte lisait, sous le total de sa
journée, ce que son corps dépense — et devait faire la soustraction lui-même.
Pendant ce temps le moteur, lui, dimensionnait déjà ses grammages sur une cible
EN DÉFICIT (`mouthTargetKcal`). Deux nombres, sur le même écran, en désaccord
sur ce que cette personne cherche.

`directedRange` (`_shared/keel/energy_target.ts`) décale la fourchette de
**l'écart que le moteur EXÉCUTE** (`executedPaceFor().dailyDeltaKcal`), et de
rien d'autre. Ce qui ne change pas, et ne changera pas :

- **la largeur** — les deux bornes bougent du même nombre, arrondi aux 50 AVANT
  le décalage. Une fourchette qui se resserre se lit comme une cible ;
- **la base** — elle reste le POIDS. `directedRange` n'appelle ni
  `estimatedMaintenanceFor`, ni Mifflin-St Jeor, et un test lit sa source pour
  le refuser ;
- **le plancher** — si le décalage passait sous `ENERGY_FLOOR_KCAL`, on rend la
  MAINTENANCE avec `below_energy_floor`. **On ne rabote pas** : une borne rabotée
  serait à la fois une fourchette rétrécie et un nombre que le moteur n'exécute
  pas ;
- **la grossesse** — `condition_energy_gate.ts` annule l'écart (`pregnancy`,
  `breastfeeding`), sur la fourchette **et** sur le conseil du midi, qui ne le
  consultait pas.

**A et B sont des propriétés de la nourriture. C est un tracker.** La distinction
n'est pas rhétorique : elle décide du traitement. `count_briefly` peut
raisonnablement autoriser A et B sans C ; le plancher TCA ferme les trois.

### Dans le périmètre

- **A et B** : le chiffre par plat et par jour, calculé depuis les quantités du
  plan, affiché sur l'écran du plan et sur Today.
- **Par personne dans un foyer** : les portions bifurquent déjà, donc le chiffre
  aussi. C'est ce qui rend la bifurcation **enfin visible**.
- **C** : la cible quotidienne, et son écran de suivi — **le lot 3**, celui qui
  demande le plus de soin.
- La chaîne de gardes, testée porte par porte.

### Hors périmètre — engageant

- ❌ **Le chemin photo.** `energy_estimate` avec sa base `photo_estimate`
  (−26,6 %) est le sujet de `CALORIE_REVERSAL.md`. **Il ne bloque pas cette
  fiche et cette fiche ne le débloque pas** : le plan a une base exacte, la
  photo n'en a pas. Deux chantiers, deux bases, deux calendriers.
- ❌ **Le chiffre en prose libre.** Un `rationale` qui dit « environ 600 kcal »
  reste **rédigé**. C'est la seule forme sous laquelle un nombre voyage sans sa
  base, donc la seule qui ne doit jamais survivre.
- ❌ **Les macros.** La décision porte sur **l'énergie**. LEGAL.md §6.4 continue
  d'interdire le suivi des macros par photo, et rien ici ne l'ouvre.
- ❌ **Aucun score, aucun pourcentage d'adhérence.** Un chiffre d'énergie n'est
  pas un score de conformité, et il ne doit en produire aucun.
- ❌ **Aucune recomposition du plan pour « atteindre » la cible.** La cible
  informe, elle ne pilote pas le générateur. Sinon le plan devient un régime
  chiffré, et ce n'est pas ce produit.

## 4. Le circuit

```
   LE PLAN COMPOSÉ — les quantités sont ÉCRITES par le produit
   (150 g poulet, 80 g riz cru, 10 g huile)
                    │
                    ▼
   ┌────────────────────────────────────────────────┐
   │ CALCUL — table nutritionnelle × quantités      │
   │ basis = plan_quantities   (le cas le plus fort)│
   │ mesuré : MAPE 2,3 %                            │
   └────────────────────────────────────────────────┘
                    │
                    ▼
   ┌────────────────────────────────────────────────┐
   │ LA CHAÎNE DE GARDES, dans cet ordre            │
   │  ① restriction_flag levé  → RIEN (personne     │
   │     ne peut rouvrir cette porte)               │
   │  ② mineur                 → RIEN               │
   │  ③ doctrine `counting`    → no_counting: RIEN  │
   │  ④ interrupteur élève     → éteint: RIEN       │
   └────────────────────────────────────────────────┘
                    │ les quatre ouvertes
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      A: plat    B: jour    C: contre la cible
      un fait    un fait    UN JUGEMENT
                            (lot 3, le plus délicat)
```

## 5. Modèle de données

**Le chiffre ne se stocke pas, il se calcule.** Comme la divergence de FF-056 :
un chiffre stocké diverge de la ligne qui l'a produit dès que le plan change.

| Donnée | Origine | Statut |
|---|---|---|
| kcal par plat / par jour | **dérivé** des quantités du plan × table | 🔴 à construire |
| `basis: "plan_quantities"` | constante du chemin | 🔴 à construire |
| l'interrupteur élève | un booléen sur le profil | 🔴 à construire |
| poids, **taille**, **sexe**, âge | `loadStudentBody` — **existent déjà**, une seule requête | ✅ |
| niveau d'activité | **rien ne le collecte** | 🔴 lot 3 |
| la position `counting` du coach | doctrine publiée | ✅ |

**Correction d'une croyance répandue dans ce dépôt** : `weekInFood.ts` affirme
*« sans taille, âge, sexe ni niveau d'activité (on ne les collecte pas) »*.
**C'est faux depuis le 2026-08-08** : `profiles.height_cm` existe avec son
écran et ses bornes, `profiles.gender` est une liste fermée, l'âge se dérive de
`birth_date`, et `loadStudentBody` rend les trois **dans la même requête**.
Seul le **niveau d'activité** manque réellement.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| **R1** | Les quatre portes, **dans l'ordre**, et la porte 1 n'est ouvrable par personne | Levinson 2017 : 73 %. Un plancher qu'un réglage peut rouvrir n'est pas un plancher |
| **R2** | Le coach décide de la porte 3, **jamais** de la porte 1 | c'est la différence entre une méthode et une ceinture de sécurité |
| **R3** | Un chiffre vit dans un champ typé qui **porte sa base**, ou il n'existe pas | la règle de `CALORIE_REVERSAL`, inchangée. Ici la base est `plan_quantities` |
| **R4** | Le chiffre en **prose libre** reste interdit et supprimé | seule forme où un nombre voyage sans sa base |
| **R5** | Le chiffre se **calcule**, ne se stocke pas | un chiffre stocké survit au plan qui l'a produit et ment |
| **R6** | ~~La cible (C) est **informative**, jamais pilotante~~ **RENVERSÉ le 2026-08-18** : elle contraint les GRAMMAGES (lot L8). ⟳ Depuis le lot 4 la fourchette AFFICHÉE le dit — la copie qui promettait l'inverse est partie | un chiffre affiché qui contredit la casserole est pire que pas de chiffre |
| **R7** | L'élève peut éteindre, et ça se tait partout | « un chiffre qu'on ne peut pas faire taire est un tracker » |
| **R8** | Aucun chiffre chez un mineur | garde existante, deux langues |
| **R9** | Le test de propriété se **retourne**, il ne se supprime pas | de « aucun chiffre n'atteint l'élève » à « aucun chiffre **sans base** n'atteint l'élève » |
| **R10** | Aucun `%` d'adhérence dérivé du chiffre | l'énergie n'est pas une conformité |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| `restriction_flag` levé, coach qui compte, élève qui veut voir | **rien**. Le plancher gagne contre les trois autres |
| Le coach n'a pas de position `counting` (`NO_RULE`) | le chiffre s'affiche — c'est le nouveau défaut |
| Pas de coach (méthode maison) | le chiffre s'affiche |
| Un ingrédient hors table nutritionnelle | le plat affiche son chiffre avec la mention de l'inconnu, ou **pas de chiffre** — jamais un total qui fait semblant d'être complet |
| Quantité absente sur une ligne | la base n'est plus `plan_quantities` pour ce plat → **pas de chiffre** sur ce plat |
| Le plan change après affichage | le chiffre est recalculé ; il n'y a rien de périmé à invalider (R5) |
| Taille ou sexe manquants (lot 3) | pas de cible calculée. **Fourchette par kg** en repli, ou rien — jamais une cible inventée |
| L'élève éteint puis rallume | l'état est le sien, il se respecte des deux côtés |

## 8. Critères d'acceptation

```gherkin
Étant donné un plan composé avec des quantités
Quand l'écran du plan s'affiche
Alors chaque plat porte son chiffre, et la journée porte sa somme

Étant donné un foyer où les portions bifurquent
Quand le plan s'affiche
Alors le chiffre de chaque personne correspond À SA portion

Étant donné un élève sous restriction_flag
Et un coach dont la doctrine dit de compter
Et un élève qui a laissé l'affichage allumé
Quand n'importe quel écran s'affiche
Alors AUCUN chiffre n'apparaît nulle part

Étant donné un coach dont la doctrine porte `no_counting`
Quand le plan s'affiche
Alors aucun chiffre n'apparaît
Et le verrou déterministe mord toujours sur « count calories » dans le texte

Étant donné un coach sans position sur `counting`
Quand le plan s'affiche
Alors le chiffre apparaît

Étant donné un élève mineur
Quand le plan s'affiche
Alors aucun chiffre n'apparaît

Étant donné un élève qui éteint l'affichage
Quand il revient sur n'importe quel écran
Alors plus aucun chiffre n'apparaît

Étant donné un plat dont une quantité manque
Quand l'écran s'affiche
Alors ce plat n'affiche pas de chiffre
Et le total du jour dit qu'il est incomplet

Étant donné une réponse en prose de l'agent
Quand elle contient « environ 600 kcal »
Alors le passage est rédigé — un chiffre sans base ne voyage pas
```

## 9. Rabbit holes

- **Confondre la porte 1 et la porte 3.** C'est l'erreur qui rendrait ce
  chantier dangereux. Le coach règle sa méthode ; il ne règle pas la sécurité.
  Un paramètre unique qui mélangerait les deux est la version cassée de cette
  fiche.
- **La cible qui devient un objectif.** `coachStartingNumbers` refuse depuis le
  début : *« un chiffre affiché à l'élève devient un objectif »*. Le lot 3 le
  franchit **en connaissance de cause** — donc il porte le plus de gardes, et
  il vient en dernier.
- **Le total qui fait semblant.** Un plat sans quantité, un ingrédient hors
  table : le total du jour doit **dire** qu'il est incomplet. Un chiffre qui
  paraît exhaustif et ne l'est pas est pire que pas de chiffre.
- **Le facteur d'activité inventé.** Sans lui, Mifflin-St Jeor donne un
  métabolisme de base, pas un besoin. Le multiplier par une valeur devinée
  produit une cible fausse avec l'aplomb d'un tableau.
- **La contamination du générateur.** Le prompt interdit les calories ; il doit
  continuer à les interdire **dans ce qu'il écrit**. Le chiffre est calculé
  **après**, à partir des quantités. Ouvrir le prompt rouvrirait le chiffre
  halluciné.

## 10. Ce qu'on mesure

- Écart entre le chiffre affiché et un calcul de référence sur les mêmes
  quantités : **il doit être nul** (c'est une table, pas un modèle)
- Part des plats sans chiffre (quantité ou table manquante) — s'il est élevé,
  le générateur produit des quantités inexploitables
- Utilisation de l'interrupteur d'extinction — **s'il est très utilisé, le
  chiffre dérange plus qu'il n'aide**
- Répartition des positions `counting` chez les coachs

**Contre-mesure.** Le comportement des gens à qui le chiffre s'affiche : si la
part de plans **cuisinés** baisse quand les chiffres apparaissent, le produit
est passé d'un service à un jugement — et c'est exactement le basculement que
l'interdiction d'origine voulait éviter.

## 11. Questions ouvertes — **à trancher avant le lot 3**

1. **Le niveau d'activité** : une question à l'inscription, ou un défaut
   sédentaire ajustable ? Sans lui, pas de cible honnête.
2. **`count_briefly`** autorise-t-il A et B seulement, ou aussi C ? La position
   du coach dit « deux semaines, c'est une leçon » — un **temps** est peut-être
   à respecter, pas seulement un booléen.
3. ~~**L'interrupteur** est-il par défaut allumé ou éteint ?~~ **TRANCHÉ le
   2026-09-01 (lot 4) : ni l'un ni l'autre — un TRI-ÉTAT.** Éteint par défaut
   avait un coût mesurable : sur la base locale, **0 compte sur 38 ayant un plan
   n'avait jamais allumé**, et la seule porte d'entrée était un bouton en bas de
   l'écran du plan, invisible tant qu'aucun plan n'existe. Allumé pour tout le
   monde aurait appliqué le renversement à des gens qui ne visent rien. Le
   tri-état lit la direction déjà déclarée. Voir §3.
4. **Le foyer** : les chiffres des autres bouches sont-ils visibles du maître ?
   La règle existante dit *ce qui touche le corps est à soi* — un chiffre par
   portion est-il « le corps » ou « le repas » ?
5. **Le B2B** : le coach voit-il les chiffres de ses élèves ? `coachStartingNumbers`
   existe déjà pour lui, mais c'est une fourchette de départ, pas un suivi.
