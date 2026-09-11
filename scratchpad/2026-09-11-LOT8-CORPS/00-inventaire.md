# Lot 8 · famille « Corps/énergie » — inventaire AVANT d'écrire

Les dix cas du tableau, et où ils vivent déjà.

| Cas du chantier | État | Où |
|---|---|---|
| pesée récente | DÉJÀ COUVERT | `resolved_mouth_test.ts` ① |
| série vide avec fiche | DÉJÀ COUVERT | `resolved_mouth_test.ts` ② |
| champ absent | DÉJÀ COUVERT | `resolved_mouth_test.ts` ③ |
| lecture échouée | couvert AU RÉSOLVEUR | `resolved_mouth_test.ts` ④ — aval non couvert |
| date contradictoire | couvert AU RÉSOLVEUR | `resolved_mouth_test.ts` ⑤ — aval non couvert |
| mineur | largement couvert | `weight_pace_test.ts` (borne, équation), `meal_envelope_test.ts` 403/423/1300, `target_grams_test.ts` 275/298 |
| âge inconnu | couvert | `resolved_mouth_test.ts` ⑥, `household_body_share_test.ts` 422, `target_grams_test.ts` C9.a |
| protections TCA | couvert PAR MORCEAUX | `meal_envelope_test.ts` 103/383/986, `household_bodies_test.ts` 193 (prompt), `household_body_share_test.ts` 213/268/308 |
| conditions annulant l'écart | couvert SUR LE FACTEUR | `condition_energy_gate_test.ts`, `condition_energy_gate_portions_test.ts` |
| absence de taille nommée | DÉJÀ COUVERT | `pace_unavailable_test.ts` (7 cas) |

## Ce qui manque réellement — les JOINTURES, pas les morceaux

1. **lecture échouée → aval.** `read_failed` meurt au résolveur: en aval le corps
   vide rend `no_body`, exactement comme « cette bouche n'a jamais rien saisi ».
2. **date contradictoire → aval.** `resolveMouth` arbitre `ageYears` (le plus
   jeune gagne) ; `isMinor` ne vient PAS de là — il vient de
   `keel_household_member_age(member_id)`, c'est-à-dire de `household_members.
   birth_date`, la FICHE. Les deux sources peuvent se contredire et rien ne les
   réconcilie.
3. **TCA → aval mesuré.** Personne ne vérifie EN UN SEUL TEST que le même corps,
   sous plancher, perd sa bande, son plafond de densité, son facteur et ses faits
   de prompt — et les retrouve tous les quatre quand le plancher est `clear`.
4. **condition → enveloppe.** `envelopeDirectionFor` ne lit AUCUN `condition_ref`.
   La garde est chez l'appelant (`generate-household-meal-v1`, via
   `goalUnderConditionGate`). Le contre-exemple n'est écrit nulle part.
5. **condition → rythme affiché.** `executedPaceFor` et `weeksToTarget` ne
   connaissent aucune condition. L'assiette refuse le déficit, l'horizon continue
   de le promettre.

## Nombres dérivés à la main (fixture « Claire »)

femme · 68 kg · 165 cm · 31 ans (`30_44`, midAge 37) · `sedentary` · axes non
répondus · appétit `null`.

    base   = 10×68 + 6,25×165 − 5×37 = 680 + 1031,25 − 185 = 1526,25
    bmr    = 1526,25 − 161                                  = 1365,25
    PAL    = ACTIVITY_FACTORS.sedentary                      = 1,45
    entretien = round(1365,25 × 1,45) = round(1979,6125)     = 1980

Perte, cran 0,5 kg/sem :

    voulu     = 0,5 × 7700 / 7                    = 550 kcal/j
    marge au plancher = 1980 − 1200 (female)      = 780 > 500 ⇒ A1 gagne
    exécuté   = 500, clampedBy = deficit_cap
    facteur   = (1980 − 500) / 1980               = 0,747474…

Bande `fat_loss` (sans garde de condition) :

    cible  = 1980 − 500 = 1480
    demi-largeur = 1980 × (0,85 − 0,75) / 2 = 99
    brut   = 1381 – 1579 ; plancher = max(1480, 1200) = 1480
    bande  = 1480 – 1579

Bande `maintenance` (goal coercé par la garde) :

    cible  = 1980 (aucune direction)
    demi-largeur = 1980 × (1,05 − 0,95) / 2 = 99
    bande  = 1881 – 2079

Fixture mineure « Lise » : 12 ans · 40 kg · femme · rien de déclaré.

    bmr  = 13,384×40 + 692,6 = 535,36 + 692,6 = 1227,96
    PAL  = CHILD_ACTIVITY_FACTOR = 1,6 (source `assumed`)
    croissance = ×1,01
    entretien = round(1227,96 × 1,6 × 1,01) = round(1984,38336) = 1984
    bande enfant = round(1984×0,95) – round(1984×1,05) = 1885 – 2083
    plancher protéique = 40 g
