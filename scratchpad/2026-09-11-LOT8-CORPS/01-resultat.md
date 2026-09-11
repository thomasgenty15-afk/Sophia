# Lot 8 · « Corps/énergie » — résultat

`deno test --allow-all supabase/functions/_shared/keel/lot8_corps_energie_test.ts`
→ **14 passed | 0 failed** (27 ms).

Contrôle anti-« test paramétré par sa propre constante »: cinq nombres dérivés à
la main ont été mutés d'une unité dans le fichier de test
(`CLAIRE_ENTRETIEN` 1980→1981, bande 1480→1481, 3747→3748, 1885→1886,
1881→1882) puis relancés: **5 tests rouges**, sur les cinq familles attendues.
Fichier restauré par `cp` depuis une copie (jamais `git checkout`), relancé vert.

Voisinage qui lit la SOURCE du dossier — rien de cassé par l'arrivée du fichier:
`energy_gate_mouth_test.ts`, `constant_pins_test.ts`,
`constant_pinning_gate_test.ts`, `disarmed_families_wiring_test.ts`
→ **125 passed | 0 failed**.

## Les quatre défauts épinglés

1. `read_failed` et « cette bouche n'a jamais rien saisi » rendent le MÊME
   `{factor: 1, reason: "no_body"}`. La distinction meurt au résolveur.
2. Contradiction de dates (compte mineur / fiche adulte): la protection passe,
   mais sous `no_body` et `pace_unavailable_missing_body` — deux motifs qui
   nomment le corps alors que le corps est complet.
3. `envelopeDirectionFor` n'a aucun paramètre de condition. La garde de
   grossesse vit chez l'appelant.
4. `executedPaceFor` + `weeksToTarget` ignorent les conditions: la fiche de
   bouche annonce « Environ 16 semaines à ce rythme » quand le moteur vient de
   refuser tout écart.
