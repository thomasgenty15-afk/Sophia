# Lot 0 — inventaire de parité solo → moteur commun

Mesuré le 2026-09-10, par extraction des clés réellement passées à
`buildMealPrompt` (le tronc partagé) depuis chaque lane, et des champs
réellement lus dans le corps de requête.

**Le tronc est déjà commun.** Les deux lanes passent 39 des mêmes clés à
`buildMealPrompt`. Le solo en passe **deux** de plus. Le foyer n'en passe aucune
que le solo n'ait.

## ① Les quatre champs de requête que le foyer CODE EN DUR

| Fonctionnalité | Entrée | Lecteur solo | Foyer aujourd'hui | À faire |
|---|---|---|---|---|
| garde-manger / courses | `body.mode` (`from_pantry` \| `to_shop`) | `generate-meal-v1:672`, garde `:922` | `mode: "to_shop"` en dur | accepter le champ, garder la garde « `from_pantry` sans garde-manger = refus » |
| contenu du garde-manger | `body.pantry` | `readPantry` `:920`, plafond 60 items | `pantry: []` en dur | accepter le champ |
| repas isolé | `body.meal_slot` | `:879` → `slot` | `slot: null` en dur | accepter le champ |
| portions demandées | `body.servings` | `:885`, borné 1–12 | dérivé de `presence.servings` | accepter le champ **quand il est fourni**, sinon garder la présence |

⚠️ Ces quatre-là ne demandent **aucun** travail de prompt : le tronc les reçoit
déjà, le foyer lui donne simplement des valeurs constantes.

## ② Les deux champs que le solo passe et pas le foyer

| Champ | Source | Solo | Foyer |
|---|---|---|---|
| `kitchenEquipment` | `student_goals.practical_constraints` | lu `:1979`, passé au prompt | **lu `:3589`, JAMAIS passé** |
| `aspiration` | `student_goals.aspiration` | lu `:959`, passé `:2501` | **ni lu, ni passé** |

`kitchenEquipment` est un branchement d'une ligne. `aspiration` demande d'ajouter
la colonne au `select` du foyer, puis de la passer.

## ③ Ce qui n'a pas d'équivalent solo — rien à porter

`operation` (`compose` / `edit_cells` / `merge` / `unmerge`), `cells`,
`draft_id`, `merge_member_id`, `unmerge_member_id`, `cooking_shape`, et les
champs de simulation de corps (`ageBand`, `gender`, `heightCm`, `latestWeight`,
`declaredWeightKg`, `restrictionFlag`).

## ④ Ce qui est déjà commun — vérifié, aucune action

`window` · `intent` · `context` · `preferences` · `replaces` ·
`one_cooking_session` · `cook_the_day_before` · `draft_note` · `adopting_draft` ·
`ts` — et côté prompt : `awayDays`, `beliefKeys`, `body`, `coachNoteBlock`,
`contentLocale`, `cookOnlyDay`, `country`, `dayProperties`, `daysToFill`,
`dietBlock`, `doctrineBlock`, `eatingRhythm`, `firstDayCookable`, `fixedIntakes`,
`focusAxis`, `foodPreferences`, `goal`, `groceryCadence`, `hasFreezer`, `memo`,
`merge`, `oneCookingSession`, `protocolBlock`, `safetyConstraintTable`,
`safetyConstraints`, `scope`, `situation`, `soloBoxes`, `standardRecipe`,
`today`, `todayToken`, `windowStartsOn`, `writtenInstructions`.

## ⑤ Ce que ça veut dire pour le chantier

⛔ **La parité n'est pas le gros du travail.** Six champs, dont quatre sont des
constantes à remplacer par une lecture. Le vrai travail est ailleurs : le
provisionnement du foyer (lot 1), l'autorisation (lot 2), la double lecture
corporelle (lot 3) et la boucle de réparation (lot 6).

⚠️ **Et un champ ne disparaît pas au motif que le foyer ne le lit pas.** Les
quatre constantes ci-dessus sont exactement la forme que prendrait la perte : un
plan `from_pantry` deviendrait un plan de courses sans que personne ne le voie.
