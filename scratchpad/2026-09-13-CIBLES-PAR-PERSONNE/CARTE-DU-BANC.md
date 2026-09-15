# Carte du banc — ce qu'il sait faire, pour le lot 2

Relevé le 2026-09-13, par lecture seule. Chemins relatifs à la racine du dépôt.

## Le pipeline, dans l'ordre

```
scratchpad/2026-09-11-FIABILITE-RECETTES/banc-lot-F.ts <cas> [options]
    → scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/<cas>[-<compte>]-<ISO>.json
scratchpad/2026-09-11-CLOTURE/figer-demande.ts <cette sortie>
    → scratchpad/2026-09-11-CLOTURE/fixtures/<nom>-c0.json
scratchpad/2026-09-11-FIABILITE-RECETTES/analyse-lot-F.ts <...-c0.json>
    → la grille de mesure, par personne-date-créneau (sortie écran)
```

⛔ `analyse-lot-F.ts` lancé sur la sortie BRUTE du banc rend « 0 bouche(s) » et
« TOTAL 0/0 ». Ce n'est pas « aucune conformité », c'est **aucune mesure**.

## Ce qui décide de la grille

- Le banc demande toujours `{ kind: "days", count: 3 }` et les trois repas de
  la maison (`breakfast`, `lunch`, `dinner`). Aucun rythme déclaré.
- Le premier jour tombe si `withoutSpentFirstDay` mord : coupure de courses à
  **18 h** (`SHOPPING_CUTOFF_HOUR`, `plan_hours.ts:54`), ou tous les moments
  déjà passés (breakfast 10 h, lunch 14 h, dinner 21 h).
- Donc : une horloge posée **après 18 h heure de Paris** rend **2 jours × 3
  créneaux = 6 cases par bouche**. C'est exactement le dénominateur du plan
  (6 / 12 / 24 pour N=1 / 2 / 4).
- `--horloge=<ISO>` doit être posée AVANT l'import du handler — le banc le fait
  déjà (l. 170-177). `MAX_WINDOW_DAYS = 7` (`meal_plan_window.ts:63`).

## Les leviers utiles au lot 2

| besoin | option du banc |
|---|---|
| taille du foyer | `--bouches=1..4` (`--duo` = 2). Bouches fixes : Lea, Nils, Iris |
| premier jet contrôlé | `--reponse=<fichier>` — soit `etapes.premier_jet` d'une sortie de campagne, soit **un JSON de plan nu** |
| apport fixe explicite | `--apport-fixe` (titulaire, 200 g yaourt grec au petit-déjeuner) · `--apport-fixe-duo` (2ᵉ bouche, 150 g yaourt nature) |
| repas léger | `--leger=<slot>` |
| contrainte individuelle | `--exclusion=medicale` (arachide, `student_safety_constraints`) ou `=preference` |
| portion obligatoire retirée | `--sans-portion=<jour>/<slot>` |
| patch réel | `--reparation-reelle=<0..2>` — **le seul mode payant**, exige une vraie clé `sk-` |
| patch cassé | `--patch-casse=<tour>` (opération `null` dans `repair.units`) |
| session seule | `--patch-session-seul` · `--allergene-deroule` · `--deroule-persiste` |
| voir les prompts | `--prompts` → `<sortie>.prompts.txt` |

## Vocabulaires fermés de la base (un mot hors liste = refus)

- genre : `male` `female` `other`
- activité : `sedentary` `on_feet` `trains_some` `trains_hard`
- journée : `seated` `on_feet` `physical_job`
- sport : `none` `1_2` `3_4` `5_plus`
- appétit : `small` `average` `large`
- objectif : `fat_loss` `maintenance` `muscle_gain`
- âge : `unknown` `minor` `adult` — `unknown` n'est PAS « adulte »
- moments : `breakfast` `snack_am` `lunch` `snack_pm` `dinner` `before_bed`

Source : `supabase/migrations/20260820170000_l_appetit_trois_crans_transitoires.sql`
(corps), `20260818100000_three_directions_and_a_collected_activity.sql` (objectif),
`20260812180000_household_age_from_profile.sql` (âge).

## Le refus « validation indisponible »

Deux chemins, tous deux 422 et tous deux AVANT l'écriture du plan :

1. `generate-household-meal-v1/index.ts:18135-18184` — le relevé des surfaces
   finales jette → `output_lock_unavailable` → corps `plan_validation_unavailable`.
2. `index.ts:18208-18232` — la porte finale a jeté plus haut
   (`final_gate_unavailable`), donc `candidateStateOf(null)` vaut
   `validation_unavailable` et `chooseReplacement` rend `keep_previous`.

⚠️ **Aucun crochet d'injection n'existe dans le handler**, et c'est voulu :
`finalPlanGate`, `collectOutputSurfaces`, `localizeOutputLockBites` et
`applyKeelOutputLocks` ne portent aucun `throw`. Le banc ne peut donc pas
provoquer ce refus par une option, et en ajouter une dans le code de production
est explicitement interdit par le plan.

⚠️ `scratchpad/2026-09-11-FIABILITE-RECETTES/NON-BRANCHE.md` § ⑩ décrit encore
ce chemin comme laissant passer le plan. **La note est en retard sur le code** :
`index.ts:18208` refuse.

## Les fixtures de plan

- Banc : `scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures/` — `echanges.json`
  (les réponses en conserve), `plans.json`, `contextes.json`, `journaux.json`,
  `empreintes.json` (⛔ `chargerFixtures()` refuse de mesurer si un sha bouge).
- Front : `frontend/src/keel/lib/__fixtures__/lot-f-plans.json` — cinq clés
  `archive` `duo` `gain` `perte` `quatuor`. Trois d'entre elles ont été écrites
  par le vrai handler le 2026-09-12, par des demandes réellement payées :
  **ce sont des preuves, elles ne s'éditent pas à la main.**
- Demandes figées : `scratchpad/2026-09-11-CLOTURE/fixtures/*-c0.json` (44).

## Le transport

`scratchpad/2026-09-11-FIABILITE-RECETTES/transport-lot-F.ts` capture
`Deno.serve` et remplace `globalThis.fetch`. Hôtes ouverts : Supabase local,
`api.openai.com`, `generativelanguage.googleapis.com`. **Tout autre hôte jette.**
`realTurns` / `realCap` tiennent le plafond payant DANS le transport ;
`realCalls` garde `{turn, status, ms, bytes, body}` — la réponse brute.

⚠️ Une exception levée par le crochet `compositionPatch` est **rattrapée par la
chaîne de repli du fournisseur**, qui sert alors la réponse du REMPLISSAGE
(`{"items":[]}`) à une réparation. Mesuré le 2026-09-13.

## La grille, MESURÉE (2026-09-13, sur les fonctions de production)

`slotsUnservableToday` + `withoutSpentFirstDay`, demande `{days, 3}` partant du
jour même, trois repas déclarés, aucune heure personnalisée :

```
h= 7  passés=[]                         retenus=[breakfast]  coupure=non  → 3 jours · 9 cases/bouche
h=11  passés=[breakfast]                retenus=[lunch]      coupure=non  → 3 jours · 9 cases/bouche
h=15  passés=[breakfast,lunch]          retenus=[]           coupure=non  → 3 jours · 9 cases/bouche
h=17  passés=[breakfast,lunch]          retenus=[]           coupure=non  → 3 jours · 9 cases/bouche
h=18  passés=[breakfast,lunch]          retenus=[dinner]     coupure=OUI  → 2 jours · 6 cases/bouche  (shopping_cutoff)
h=19  passés=[breakfast,lunch]          retenus=[dinner]     coupure=OUI  → 2 jours · 6 cases/bouche  (shopping_cutoff)
h=22  passés=[breakfast,lunch,dinner]   retenus=[]           coupure=OUI  → 2 jours · 6 cases/bouche  (slots_passed)
```

⛔ **Une horloge posée à 18 h ou plus tard, heure de Paris, donne exactement
6 cases par bouche** — donc 6 / 12 / 24 pour N = 1 / 2 / 4, les dénominateurs
que le plan demande. Avant 18 h on obtient 9 / 18 / 36 et les tables ne
correspondent plus.

⚠️ La cause n'est pas la même à 18 h (`shopping_cutoff`) et à 22 h
(`slots_passed`). Les deux rendent 2 jours ; seule la seconde vide aussi le
dîner du jour même sans passer par la coupure.
