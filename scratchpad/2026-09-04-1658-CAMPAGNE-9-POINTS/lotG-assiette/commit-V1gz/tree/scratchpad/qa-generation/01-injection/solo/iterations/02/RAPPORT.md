# ITÉRATION 02 — quatre correctifs, un run réel, quatre cases de plus

**2026-08-18 · agent 1A · run réel `dc1326d5-a813-4c9e-9a17-266a99b35c30`**

| | |
|---|---|
| prompt | système 14 382 car., utilisateur **10 820** car. (+1 029 vs itération 01) |
| garde d'instrument | ligne présente en base, `chars == written_chars == compteur indépendant`, `truncated: false` des deux côtés — vérifié à la main comme demandé |
| modèle | `gpt-5.6-sol`, 200 en 2 min 24 (pas de repli) |
| fenêtre | 2026-08-19 → 21, **volontairement demain** pour ne pas mélanger la coupure « journée entamée » avec une absence déclarée |
| runtime | `docker restart supabase_edge_runtime_Sophia_2` **avant** le run, `Serving functions on …` relu dans les logs (cicatrice `_shared` périmés) |

## Ce qui a été corrigé entre les deux runs

### ① Les moyens de cuisson parlent enfin (R1)

- `_shared/keel/kitchen_equipment.ts` — nouvelle `kitchenEquipmentPromptLines()`. Elle passe par
  `missingKitchenTools()`, donc `null` (« jamais demandé ») rend `[]` : **aucune ligne**, prompt
  d'avant au caractère près pour tous les comptes qui n'ont pas vu la question.
  On n'énonce **que des absences** : lister ce qu'il a inviterait à composer autour d'un inventaire.
- `_shared/keel/meal_generation.ts` — paramètre `kitchenEquipment?`, rendu dans
  `-- WHAT THEY CAN COOK --`, **sous les jours de cuisine et au-dessus du temps** : c'est le bloc où
  le modèle décide de sa session.
- `generate-meal-v1/index.ts` — lecture **hissée au-dessus** de `buildMealPrompt`.
- Le pavé « ⛔ CE MODULE NE PARLE PAS AU MODÈLE » du haut de fichier a été **réécrit**, pas laissé :
  une contrainte documentée survit à sa cause, et celle-là a coûté le plan de l'itération 01.
- ⚠️ La lane FOYER n'est **pas** touchée : elle a déjà son propre `kitchenBlock` (enveloppe v16).

### ② Le cran d'activité entre dans la consigne (R2)

`meal_body.ts` gagne `activityLevel` + `MEAL_ACTIVITY_PROSE` (jamais le slug), rendu en dernière
ligne de `-- WHO THEY ARE --`, donc **couvert par les deux phrases de cadrage** (« pour la TAILLE
d'une portion, et rien d'autre / ne dérive ni énergie ni calorie ni IMC »). Le chiffre
(`ACTIVITY_FACTORS`) reste du côté déterministe. **Pas coupé par le plancher TCA** : on ne restreint
pas pour changer combien on bouge.

### ③ L'aspiration atteint la lane repas (R5)

`generate-meal-v1` sélectionne enfin la colonne, et `buildMealPrompt` l'écrit **avant** la situation.
La phrase est reprise **mot pour mot** de la lane semaine : deux formulations pour un même champ
divergent, et c'est la moins relue qui garde l'ancienne.

### ④ La collision d'en-tête est levée (R12)

Le garde-manger devient `-- WHAT IS ALREADY IN THEIR CUPBOARDS --`. Le mot qui distingue est le
LIEU, pas la possession. Un test monte désormais **les deux sections ensemble** et compte l'en-tête
des apports fixes : c'est le cas que l'ancien test ne pouvait pas voir.

`MEAL_PROMPT_VERSION` : `v12_a_dish_has_a_name` → **`v13_what_they_can_actually_do`**, avec le
raisonnement « quelle population voit une consigne différente » écrit axe par axe.

## Ce que le run a mesuré

Le prompt porte maintenant, vérifié caractère par caractère (`dump/prompt-user.txt`) :

```
- how their days go: training four times a week or more, or a physical job
- waist: 79 cm, measured week of 2026-08-17
what they are actually after, in their words: Carry my own kayak down to the water by spring…
what their kitchen does NOT have -- never compose a dish, a batch or a session that needs one of these:
- no oven: …   - no freezer: …   - no air fryer.   - no pressure cooker: …
-- WHAT IS ALREADY IN THEIR CUPBOARDS --
```

**Et la sortie obéit** — c'est la moitié qui compte :

| | itération 01 | itération 02 |
|---|---|---|
| `oven` dans la sortie | **1** (« Heat the oven ») | **0** |
| `roast` | 10, dont un four | 10, **tous « pan-roast »** |
| `freez` / `air fry` / `pressure` | 0 | 0 |
| session du jeudi | — | « Fit this session in before the late meetings rather than leaving it for the chaotic evening » |

La dernière ligne est le contexte du moment (F6) **exploité**, pas seulement présent.

## Contrôles

- `deno test supabase/functions/_shared/keel/` → **3 678 passés, 0 échec**
  (dont 9 neufs `kitchen_equipment_solo_lane_test.ts`, 9 neufs `solo_lane_injection_test.ts`,
  1 neuf sur la collision d'en-tête, 1 neuf sur le régime de semaine).
- `deno check` sur les deux `index.ts` + `student_body_io.ts` + `household_bodies.ts` → vert.
- `npx tsc -b --force tsconfig.app.json` → vert.
- `npx vitest run` (front) → 1 631 passés. **4 rouges pré-existants**, aucun lié à ce lot :
  `coverage-guard` (55 fonctions edge listées contre 52 — d'autres sessions en ont ajouté) et
  `household.int.test.ts#awayFrom` (`presenceMarks.ts` est modifié dans l'arbre par une autre lane).
