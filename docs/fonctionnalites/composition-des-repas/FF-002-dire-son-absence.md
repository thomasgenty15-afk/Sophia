# FF-002 · Dire qu'on ne sera pas là

| | |
|---|---|
| **Identifiant** | `FF-002-dire-son-absence` |
| **Statut** | 🟡 Spécifiée — non construite |
| **Date** | 2026-08-07 |
| **Autorité produit** | [MODEL.md](../../keel/MODEL.md) (1:N, l'élève compose sa semaine) · [PIVOT-FOYER.md](../../keel/PIVOT-FOYER.md) |
| **Dépend de** | `student_goals.practical_constraints` · `CookingCapacityCard` · `meal_plan_window.ts` |
| **Effort estimé** | 1 à 2 jours |

---

## 1. Le problème

Un élève dit « je ne suis pas là ce week-end ». Le plan lui compose quand même
un déjeuner samedi et un dîner dimanche. Il n'a rien fait de mal : **il n'existe
aucun endroit dans le produit pour dire une absence.**

La carte de capacité de cuisine porte `cook_days`, et ça veut dire « les jours
où je **cuisine** » — pas « les jours où je suis **là** ». Décocher samedi
signifie « je ne cuisinerai pas samedi », ce qui n'interdit pas de prévoir un
repas samedi, cuisiné à l'avance. Le générateur a raison ; c'est la question
qu'on ne pose pas.

Le schéma annonce pourtant une clé `no_cook_days[]` dans le commentaire de
`practical_constraints`. Vérifié le 2026-08-07 : **elle n'a ni lecteur ni
écrivain dans le code.** Elle n'apparaît que dans ce commentaire et dans deux
fixtures QA. Une clé documentée que personne n'implémente est pire qu'une clé
absente : elle fait croire le trou bouché.

**Ce que ça coûte.** Deux à quatre repas composés dans le vide par week-end
d'absence, plus les courses qui vont avec — donc du gâchis réel, dans un produit
dont l'argument est justement de ne rien acheter pour rien. Et l'élève apprend
que le plan ne l'écoute pas, ce qui est le début de l'abandon.

## 2. Job stories

> **Quand** je pars chez mes parents du vendredi soir au dimanche soir, **je
> veux** que ma semaine s'arrête vendredi midi et reprenne lundi, **pour que**
> je n'achète pas de quoi cuisiner trois repas que personne ne mangera.

> **Quand** je mange au restaurant tous les jeudis midi, **je veux** le dire une
> fois, **pour que** ça ne revienne pas dans chaque plan.

> **Quand** je pars trois jours sans savoir encore lesquels, **je veux** pouvoir
> ne rien déclarer, **pour que** le plan reste celui d'une semaine ordinaire au
> lieu de me forcer une précision que je n'ai pas.

## 3. Périmètre

### Dans le périmètre
- **Une clé `away_days[]`** dans `practical_constraints`, ou l'équivalent
  ponctuel sur la fenêtre du plan — l'arbitrage est en §11.
- L'expression d'une absence **récurrente** (« tous les jeudis midi dehors ») et
  d'une absence **ponctuelle** (« ce week-end »), qui ne sont pas la même donnée
  et ne vivent pas au même endroit.
- La **granularité au repas**, pas au jour : partir vendredi soir n'annule pas
  le déjeuner de vendredi.
- Le retrait de `no_cook_days` du commentaire de colonne, ou son implémentation.
  Les deux sont acceptables ; le laisser tel quel ne l'est pas.

### Hors périmètre — engageant
- ❌ **On ne réutilise pas `cook_days` pour dire l'absence.** Les deux questions
  sont distinctes et le resteront : « je cuisine ce jour-là » et « je suis là ce
  jour-là » ont des réponses différentes pour la même personne. Les confondre
  rendrait impossible le cas le plus fréquent — cuisiner dimanche pour manger
  lundi.
- ❌ **Aucune détection automatique d'absence.** Ni depuis le calendrier, ni
  depuis la géolocalisation, ni déduite d'une baisse de coches. Une absence
  devinée qui se trompe supprime des repas que quelqu'un attendait.
- ❌ **Pas de replanification rétroactive.** Un plan déjà généré ne se réécrit
  pas parce qu'une absence est déclarée après coup — ça relève de
  [FF-006](FF-006-cycle-de-vie-du-plan.md).

## 4. Le circuit

```
        ┌─ RÉCURRENT ────────────────────────────────────┐
        │  CookingCapacityCard (ou carte voisine)        │
        │  « les moments où je ne mange pas chez moi »   │
        │        ↓                                       │
        │  student_goals.practical_constraints.away_days │
        │  (durable, survit aux semaines)                │
        └────────────────────┬───────────────────────────┘
                             │
        ┌─ PONCTUEL ─────────┴───────────────────────────┐
        │  MealBuilder, champ prose                      │
        │  « Anything going on this week »               │
        │        ↓                                       │
        │  FF-003 · intake structuré → away[] de la      │
        │  fenêtre (vit sur la ligne du plan, pas sur    │
        │  student_goals)                                │
        └────────────────────┬───────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │   L'UNION DES   │  ← l'endroit où ça casse :
                    │   DEUX SOURCES  │    deux origines, une décision
                    └────────┬────────┘
                             ↓
              buildMealPrompt : les jours et moments
              à NE PAS composer, nommés un par un
                             ↓
              parseGeneratedMeal : un plat sur un
              moment déclaré absent est REJETÉ
```

Le point de jonction — l'union des deux sources — est l'endroit à tester en
premier. C'est là que « tous les jeudis midi dehors » et « ce jeudi je suis là
finalement » se rencontrent, et la ponctuelle doit gagner.

## 5. Modèle de données

| Champ | Où | Origine | Note |
|---|---|---|---|
| `away_days` | `student_goals.practical_constraints` (jsonb) | **saisi** | Récurrent. Forme `[{"day":"thu","slots":["lunch"]}]` — `slots` absent vaut « toute la journée ». |
| `away` | ligne `student_generated_meals`, à côté de `context` | **dérivé** — classifié par l'intake ([FF-003](FF-003-intake-structure.md)) | Ponctuel, borné à la fenêtre du plan. Forme `[{"date":"2026-08-08","slots":[...]}]`, dates absolues. |

Rien de neuf en table : `practical_constraints` est un jsonb libre prévu pour
ça, et la ligne du plan porte déjà `context` et `preferences`.

**Dates absolues et pas jetons de jour** pour le ponctuel : une fenêtre de plan
peut couvrir deux samedis, et `"sat"` ne dit pas lequel.

## 6. Règles et garanties

| # | Règle | Pourquoi |
|---|---|---|
| R1 | Une absence ne supprime **jamais** un moment du rythme déclaré ailleurs dans la semaine | `eating_rhythm` dit une vie, l'absence dit une semaine. Confondre les deux ferait qu'un week-end dehors efface le petit-déjeuner du lundi suivant. |
| R2 | Le ponctuel l'emporte sur le récurrent, dans les deux sens | « je suis là ce jeudi » doit pouvoir annuler « tous les jeudis dehors », sinon la règle durable devient une prison. |
| R3 | Un moment déclaré absent est **absent de la consigne ET rejeté au parseur** | Une consigne seule n'est pas une garantie : le modèle recompose ce qu'on lui a dit d'éviter. La règle vit aux deux bouts, comme le plafond de plats. |
| R4 | Zéro absence déclarée ⇒ comportement identique à aujourd'hui, au plat près | C'est ce qui rend le chantier additif. Un élève qui ne remplit rien reçoit la semaine d'avant. |
| R5 | Une absence ne retire **jamais** un jour de `cook_days` | On cuisine le dimanche pour le lundi. Retirer le jour de cuisson parce qu'on ne mange pas dimanche casse la préparation à l'avance, qui est le cœur du produit. |
| R6 | Une semaine entièrement déclarée absente est **refusée avec un nom**, pas composée vide | Un plan de zéro plat est un écran cassé. Le refus dit ce qu'il faut faire. |

## 7. Modes de défaillance

| Situation | Comportement attendu |
|---|---|
| L'intake ne comprend pas l'absence écrite en prose | Le plan est composé **sans** l'absence, et l'écran le dit : « On n'a pas retenu d'absence pour cette semaine. » Jamais un silence — c'est le mode qui a produit le bug d'origine. |
| L'absence déclarée couvre toute la fenêtre | Refus nommé `window_fully_away`, avec la sortie : raccourcir la fenêtre ou retirer l'absence. |
| `away_days` porte un jeton de jour inconnu | L'entrée est écartée, les autres sont gardées. Même posture que `parseEatingRhythm` : écarter, jamais deviner. |
| Absence ponctuelle hors de la fenêtre du plan | Ignorée en silence côté moteur, **mais** l'écran le signale : c'est presque toujours une erreur de date de l'élève. |
| Le récurrent et le ponctuel se contredisent | R2 tranche. Aucun avertissement : c'est le cas nominal, pas une anomalie. |

## 8. Critères d'acceptation

```gherkin
Étant donné un élève dont le rythme est petit-déjeuner / déjeuner / dîner
Et qui déclare une absence du vendredi 19h au dimanche 19h
Quand il génère une semaine du lundi au dimanche
Alors le plan contient le déjeuner de vendredi
Et ne contient ni dîner de vendredi, ni aucun repas samedi
Et contient le dîner de dimanche
```

```gherkin
Étant donné un élève qui déclare « tous les jeudis midi je mange dehors »
Et qui écrit « ce jeudi je suis à la maison » dans le champ de la semaine
Quand il génère cette semaine-là
Alors le plan contient un déjeuner ce jeudi-là
Et les jeudis des semaines suivantes n'en contiennent pas
```

```gherkin
Étant donné un élève qui cuisine le dimanche
Et qui déclare être absent le dimanche
Quand il génère sa semaine
Alors dimanche reste un jour de cuisson
Et aucun repas n'est composé pour dimanche
```

```gherkin
Étant donné un élève qui ne déclare aucune absence
Quand il génère sa semaine
Alors le plan est identique, plat pour plat, à celui d'avant ce chantier
```

## 9. Rabbit holes

- **La granularité au repas double la surface de saisie.** Six moments × sept
  jours, c'est une grille de 42 cases si on la rend visuelle. La sortie est de
  ne proposer que « journée entière » à la main, et de laisser la précision au
  repas venir **uniquement** de la prose via [FF-003](FF-003-intake-structure.md).
- **Le fuseau horaire des absences.** « Je pars vendredi soir » n'a pas de sens
  sans savoir ce qu'est un soir pour cet élève. Le dépôt a déjà payé ça —
  voir les incidents de résolution de « demain » de nuit. Ne pas inventer une
  heure : une absence est déclarée au **moment de repas**, jamais à l'heure.
- **`no_cook_days` est un piège de nommage.** Quelqu'un finira par
  l'implémenter en croyant que c'est cette fiche. Ce n'est pas la même chose :
  `no_cook_days` dit « je ne cuisine pas », `away_days` dit « je ne mange pas
  ici ». Trancher son sort dans ce chantier, explicitement.
- **Le foyer.** Une absence est individuelle, une cuisson est collective. Si le
  père n'est pas là samedi, la session de cuisson du foyer ne disparaît pas —
  seules ses portions changent. Ne pas câbler l'absence sur la session.

  ✅ **Construit le 2026-08-12 (arbitrage D14, lot L2).** `household_members
  .away_days` porte la marque du maître, dans **cette même forme** et lue par
  **ce même parseur** ; l'absence effective d'une bouche qui a un compte est
  l'**union** de sa déclaration et de cette marque — un objectif est une
  opinion, une absence est un fait. La cuisson ne disparaît que sur un moment
  où **personne** n'est là, et une fenêtre entièrement désertée rend
  `window_fully_away` (§7).

  ⚠️ **« Seules ses portions changent » a deux moitiés, et la seconde a failli
  partir sans être faite.** Mesuré en run réel le 2026-08-12 : la casserole
  descendait bien (`servings` passait de 4 à 1), mais le plan portait toujours
  **quatre** `member_portions` — l'écran promettait « une portion adulte
  pleine » à trois personnes absentes à chaque moment de la fenêtre. Pire, la
  réconciliation **réattribuait** une portion standard à toute bouche que le
  modèle avait eu la bonne idée d'omettre. Une bouche absente sur **tous** les
  moments de la fenêtre n'entre donc plus ni dans la liste d'ids du prompt ni
  dans la réconciliation (`member_away_all_window:<id>` le trace). Qui manque
  **un seul** repas garde son assiette : il mange les autres jours.

  **Reste ouvert :** ce refus n'existe **pas** sur la lane individuelle
  (`generate-meal-v1`), qui composerait encore une semaine vide.

## 10. Ce qu'on mesure

- **La mesure :** part des plans générés qui portent au moins une absence, et
  part des repas composés qui sont ensuite cochés. L'hypothèse est que le second
  chiffre monte quand le premier existe.
- **La contre-mesure :** part des plans refusés pour `window_fully_away`, et
  part des élèves qui déclarent une absence **puis la retirent** dans la même
  session. Si l'un des deux dépasse quelques pour cent, la saisie fait dire aux
  gens autre chose que ce qu'ils veulent, et la fonctionnalité coûte plus
  qu'elle ne rapporte.

## 11. Questions ouvertes

1. **Une clé, ou deux ?** Le récurrent dans `practical_constraints` et le
   ponctuel sur la ligne du plan, c'est ce que la §5 propose. L'alternative —
   tout sur la ligne du plan — est plus simple mais fait retaper « jeudi midi
   dehors » à chaque génération, ce qui est exactement la friction que la carte
   du rythme existe pour éviter.
2. **Le ponctuel passe-t-il par une case à cocher, ou seulement par la prose ?**
   La prose seule dépend entièrement de [FF-003](FF-003-intake-structure.md), donc
   d'un appel modèle. Une grille de cases est vérifiable sans modèle, mais
   alourdit l'écran que l'élève vient voir pour composer.
3. **Que devient `no_cook_days` ?** Implémentée comme synonyme, ou retirée du
   commentaire de colonne. Ne pas laisser en l'état.
