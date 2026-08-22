/**
 * L'ARME DU LOT `L37`.
 *
 * ⛔ CE QU'ELLE GARDE, EN UNE PHRASE: **la bande de surplus peut monter
 * JUSQU'À la ligne d'avertissement, jamais au-delà** — et le plafond qu'on
 * peut DEMANDER ne doit jamais redescendre à la ligne ou en dessous, sans quoi
 * l'avertissement devient inatteignable, c'est-à-dire mort.
 *
 * ── ⚠️ DEUX MOITIÉS, ET ELLES NE SE REMPLACENT PAS ────────────────────────
 * ① La MÉCANIQUE, sur des entrées synthétiques: chaque jeton du vocabulaire y
 *    a un cas qui le rend, **et le cas sain en fait partie**. Une garde sans
 *    cas qui passe bloque tout et ressemble à une garde qui marche.
 * ② LES CONSTANTES RÉELLES du dépôt, comparées à des LITTÉRAUX. Un test qui
 *    recalcule son attendu avec la constante qu'il garde reste vert quand on
 *    la change — c'est la cicatrice `constant_pins_test.ts`, et elle est
 *    mesurée.
 *
 * ── ⛔ LE TROU QUE CETTE MOITIÉ ② FERME, ET QU'IL FAUT NOMMER ─────────────
 * `constant_pinning_gate_test.ts` (lot `X2′`) ne voit **PAS**
 * `MAX_SURPLUS_FRACTION`: son scanner ne retient que
 * `export const NOM = <littéral numérique>;`, et cette constante-ci est
 * **DÉRIVÉE** (`Math.round((ENERGY_BANDS.muscle_gain.high - 1) * 1000) / 1000`).
 * Elle n'est donc ni épinglée, ni inscrite à la dette: **elle est invisible**.
 * Passer `ENERGY_BANDS.muscle_gain.high` de 1,10 à 1,20 ne fait rougir aucun
 * épinglage. Mesuré le 2026-08-22 par le lot `L37`. C'est ce fichier-ci, plus
 * la ligne ajoutée à `constant_pins_test.ts`, qui referment le trou.
 *
 * PURE: no I/O, no clock, no randomness.
 */

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  bandKgPerWeek,
  fractionReaching,
  maintenanceCrossingWarning,
  SURPLUS_BAND_VERDICTS,
  type SurplusBandInputs,
  verdictOn,
  widestAdmissibleFraction,
} from "./surplus_band_bounds.ts";
import { MAX_SURPLUS_FRACTION } from "./meal_envelope.ts";
import {
  KCAL_PER_KG_BODY_MASS,
  MAX_KG_PER_WEEK,
  MAX_WEEKLY_BODY_FRACTION,
  PACE_WARN_UP_KG_PER_WEEK,
} from "./weight_pace.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA MÉCANIQUE — entrées synthétiques, chaque jeton a son cas
// ═══════════════════════════════════════════════════════════════════════════

/** Un jeu neutre, volontairement rond, sur lequel les mutations s'appliquent. */
const SAIN: SurplusBandInputs = {
  surplusFraction: 0.10,
  warnKgPerWeek: 0.5,
  requestableCeilingKgPerWeek: 1.0,
  kcalPerKgBodyMass: 7700,
  maintenanceRangeKcal: { lowestKcal: 1500, highestKcal: 5000 },
};

Deno.test("mécanique — le cas SAIN passe: on informe sans interdire", () => {
  assertEquals(verdictOn(SAIN), "informs_without_forbidding");
});

Deno.test("mécanique — une bande élargie franchit la ligne", () => {
  // 5 000 × 0,16 × 7 / 7 700 = 0,727 kg/sem > 0,5.
  assertEquals(
    verdictOn({ ...SAIN, surplusFraction: 0.16 }),
    "band_crosses_warning",
  );
});

Deno.test("mécanique — un plafond demandable rabaissé refuse sous la ligne", () => {
  assertEquals(
    verdictOn({ ...SAIN, requestableCeilingKgPerWeek: 0.45 }),
    "refuses_below_warning",
  );
});

Deno.test("mécanique — un plafond demandable ÉGAL à la ligne refuse aussi", () => {
  // `paceWarning` FRANCHIT (`> warn`), il n'ATTEINT pas: à égalité,
  // l'avertissement ne peut plus jamais se déclencher.
  assertEquals(
    verdictOn({ ...SAIN, requestableCeilingKgPerWeek: 0.5 }),
    "refuses_below_warning",
  );
});

Deno.test("mécanique — une bande qui ATTEINT la ligne sans la franchir passe", () => {
  // C'est la lecture exécutable de « le plafond monte À la ligne »: À, pas
  // AU-DELÀ. 5 000 × 0,11 × 7 / 7 700 = 0,5 exactement.
  assertEquals(
    verdictOn({ ...SAIN, surplusFraction: 0.11 }),
    "informs_without_forbidding",
  );
});

Deno.test("mécanique — un avertissement retiré rend le verdict inmesurable", () => {
  // ⛔ Le geste interdit du lot: supprimer la ligne au lieu de convertir un
  // refus. Sans ligne, il n'y a plus rien à comparer, et le module le DIT.
  assertEquals(verdictOn({ ...SAIN, warnKgPerWeek: 0 }), "unmeasurable");
  assertEquals(
    verdictOn({ ...SAIN, warnKgPerWeek: Number.POSITIVE_INFINITY }),
    "unmeasurable",
  );
});

Deno.test("mécanique — une plage inversée ou vide est inmesurable, jamais verte", () => {
  assertEquals(
    verdictOn({
      ...SAIN,
      maintenanceRangeKcal: { lowestKcal: 5000, highestKcal: 1500 },
    }),
    "unmeasurable",
  );
  assertEquals(
    verdictOn({
      ...SAIN,
      maintenanceRangeKcal: { lowestKcal: 0, highestKcal: 5000 },
    }),
    "unmeasurable",
  );
});

Deno.test("mécanique — les quatre jetons du vocabulaire sont tous atteignables", () => {
  const rendus = new Set([
    verdictOn(SAIN),
    verdictOn({ ...SAIN, surplusFraction: 0.16 }),
    verdictOn({ ...SAIN, requestableCeilingKgPerWeek: 0.45 }),
    verdictOn({ ...SAIN, warnKgPerWeek: 0 }),
  ]);
  assertEquals(rendus.size, SURPLUS_BAND_VERDICTS.length);
  for (const jeton of SURPLUS_BAND_VERDICTS) assert(rendus.has(jeton));
});

Deno.test("mécanique — l'arithmétique rend `null` plutôt qu'un nombre deviné", () => {
  assertEquals(bandKgPerWeek(0, 0.1, 7700), null);
  assertEquals(bandKgPerWeek(2500, -0.1, 7700), null);
  assertEquals(bandKgPerWeek(2500, 0.1, Number.NaN), null);
  assertEquals(maintenanceCrossingWarning(0.5, 0, 7700), null);
  assertEquals(fractionReaching(0.35, 0, 7700), null);
  assertEquals(widestAdmissibleFraction(0.5, 0, 7700), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES CONSTANTES RÉELLES — comparées à des LITTÉRAUX
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ LE PLAFOND DEMANDABLE LE PLUS HAUT DU PRODUIT, ET C'EST UN MIROIR À DEUX
 * FACES. `MAX_KG_PER_WEEK` (curseur) et le CHECK de la base
 * `household_members_target_pace_range_check` (`target_pace_kg_per_week <= 1`,
 * `supabase/migrations/20260818100000_three_directions_and_a_collected_activity.sql:510-511`)
 * portent **le même nombre**, plus son miroir applicatif `p_pace > 1` dans
 * `keel_household_set_member_target`. Le lot `S4` a écrit noir sur blanc que
 * `L37` doit changer LES DEUX s'il change la borne. Ce littéral-ci est la face
 * BASE; l'assertion en dessous rougit le jour où les deux divergent.
 */
const CHECK_BASE_MAX_KG_PER_WEEK = 1.0;

/**
 * LA PLAGE D'ENTRETIEN ADULTE ORDINAIRE, MESURÉE — 2026-08-22 18:37:52 CEST.
 * Balayage de 600 corps: 40→160 kg × 150→190 cm × 3 genres × 5 crans
 * d'activité, adultes, direction PRISE. `estimatedMaintenanceKcal` du dépôt.
 */
const ADULTE_ORDINAIRE = { lowestKcal: 1438, highestKcal: 5215 } as const;

/**
 * LA PLAGE DES BORNES DE PLAUSIBILITÉ DU DÉPÔT — 2026-08-22 18:40:19 CEST.
 * `weight_bounds.ts`: 25→400 kg. Elle contient des gabarits que personne ne
 * sert, et elle est ici pour une seule raison: **elle dit la vérité que la
 * plage ordinaire cache**.
 */
const PLAUSIBILITE_DEPOT = { lowestKcal: 1130, highestKcal: 10265 } as const;

Deno.test("réel — le plafond DEMANDABLE est AU-DESSUS de la ligne, pas en dessous", () => {
  // ⛔ C'EST LA RÉFUTATION DU `pourquoi` DE LA FICHE `L37`. Elle affirmait que
  // « le produit interdit 42 % en dessous de sa propre ligne de danger ».
  // Le plus haut plafond demandable vaut 1,0 kg/sem, la ligne 0,5.
  assertEquals(MAX_KG_PER_WEEK, CHECK_BASE_MAX_KG_PER_WEEK);
  assertEquals(PACE_WARN_UP_KG_PER_WEEK, 0.5);
  assert(
    MAX_KG_PER_WEEK > PACE_WARN_UP_KG_PER_WEEK,
    `curseur ${MAX_KG_PER_WEEK} vs ligne ${PACE_WARN_UP_KG_PER_WEEK}`,
  );
  assertEquals(
    verdictOn({
      surplusFraction: MAX_SURPLUS_FRACTION,
      warnKgPerWeek: PACE_WARN_UP_KG_PER_WEEK,
      requestableCeilingKgPerWeek: Math.min(
        MAX_KG_PER_WEEK,
        CHECK_BASE_MAX_KG_PER_WEEK,
      ),
      kcalPerKgBodyMass: KCAL_PER_KG_BODY_MASS,
      maintenanceRangeKcal: ADULTE_ORDINAIRE,
    }),
    "informs_without_forbidding",
  );
});

Deno.test("réel — un PETIT corps, lui, est bien borné SOUS la ligne — par son gabarit", () => {
  // ⚠️ LE RÉSIDU VRAI DE LA PLAINTE DE LA FICHE, ET IL N'A PAS LA CAUSE
  // QU'ELLE NOMMAIT. 60 corps sur 600 ont un plafond de curseur sous 0,5 —
  // tous ≤ 45 kg — et la borne qui décide est `body_fraction` (1 % du poids),
  // pas `MAX_SURPLUS_FRACTION`. Une borne indexée sur le corps, pas une
  // décision de produit: c'est ce qui la sépare d'un refus arbitraire.
  assertEquals(MAX_WEEKLY_BODY_FRACTION, 0.01);
  const plafond40kg = Math.min(MAX_KG_PER_WEEK, 40 * MAX_WEEKLY_BODY_FRACTION);
  assertEquals(plafond40kg, 0.4);
  assertEquals(
    verdictOn({
      surplusFraction: MAX_SURPLUS_FRACTION,
      warnKgPerWeek: PACE_WARN_UP_KG_PER_WEEK,
      requestableCeilingKgPerWeek: plafond40kg,
      kcalPerKgBodyMass: KCAL_PER_KG_BODY_MASS,
      maintenanceRangeKcal: ADULTE_ORDINAIRE,
    }),
    "refuses_below_warning",
  );
});

Deno.test("réel — la bande d'aujourd'hui franchit DÉJÀ la ligne sur les gabarits extrêmes", () => {
  // ⛔ MESURÉ, PAS SUPPOSÉ: `165 kg / 210 cm / male / trains_hard`, entretien
  // 5 565 kcal/j, exécute 0,506 kg/sem. Aucun élargissement n'est nécessaire
  // pour cela — c'est l'état d'aujourd'hui, et il était invisible.
  assertEquals(
    verdictOn({
      surplusFraction: MAX_SURPLUS_FRACTION,
      warnKgPerWeek: PACE_WARN_UP_KG_PER_WEEK,
      requestableCeilingKgPerWeek: MAX_KG_PER_WEEK,
      kcalPerKgBodyMass: KCAL_PER_KG_BODY_MASS,
      maintenanceRangeKcal: PLAUSIBILITE_DEPOT,
    }),
    "band_crosses_warning",
  );
});

Deno.test("réel — l'entretien où la bande franchit la ligne vaut 5 500 kcal/j", () => {
  assertEquals(
    maintenanceCrossingWarning(
      PACE_WARN_UP_KG_PER_WEEK,
      MAX_SURPLUS_FRACTION,
      KCAL_PER_KG_BODY_MASS,
    ),
    5500,
  );
});

Deno.test("⛔ réel — LA BANDE NE PEUT PLUS S'ÉLARGIR SANS FRANCHIR LA LIGNE", () => {
  // ⛔ C'EST LA GARDE DU LOT, ET SON CHIFFRE EST LA RÉPONSE À `L37`.
  // La plus large fraction admissible sur la plage adulte ordinaire vaut
  // 550 / 5 215 = 0,1055. La bande vaut 0,10. **Il reste 5,5 % de marge.**
  // Atteindre 0,35 kg/sem demanderait 0,154 (à 2 500 kcal) à 0,214 (à 1 800):
  // entre 46 % et 103 % AU-DESSUS de ce que cette ligne autorise.
  const plusLarge = widestAdmissibleFraction(
    PACE_WARN_UP_KG_PER_WEEK,
    ADULTE_ORDINAIRE.highestKcal,
    KCAL_PER_KG_BODY_MASS,
  );
  assert(plusLarge !== null);
  assertEquals(Math.round(plusLarge * 10000) / 10000, 0.1055);
  assert(
    MAX_SURPLUS_FRACTION <= plusLarge,
    `MAX_SURPLUS_FRACTION=${MAX_SURPLUS_FRACTION} dépasse ${plusLarge}: ` +
      "la bande exécute désormais au-delà de la ligne d'avertissement sur un " +
      "corps adulte ordinaire. C'est la PORTE du lot L37, pas un réglage.",
  );
});

Deno.test("réel — « 0,29 kg/sem » n'est le plafond de personne d'autre", () => {
  // ⛔ LE CHIFFRE DE LA FICHE, REPRODUIT — ET MONTRÉ POUR CE QU'IL EST: la
  // valeur de la bande pour UN corps, celui dont l'entretien vaut 3 187.
  assertEquals(MAX_SURPLUS_FRACTION, 0.1);
  const arrondi = (n: number | null) =>
    n === null ? null : Math.round(n * 1000) / 1000;
  assertEquals(arrondi(bandKgPerWeek(3187, MAX_SURPLUS_FRACTION, KCAL_PER_KG_BODY_MASS)), 0.29);
  assertEquals(arrondi(bandKgPerWeek(1500, MAX_SURPLUS_FRACTION, KCAL_PER_KG_BODY_MASS)), 0.136);
  assertEquals(arrondi(bandKgPerWeek(4500, MAX_SURPLUS_FRACTION, KCAL_PER_KG_BODY_MASS)), 0.409);
});

Deno.test("réel — « monter le plafond à 0,35 » n'a pas UNE réponse", () => {
  // ⛔ LA DÉMONSTRATION QUE LE GESTE DEMANDÉ N'EST PAS EXÉCUTABLE TEL QUEL.
  const arrondi = (n: number | null) =>
    n === null ? null : Math.round(n * 10000) / 10000;
  assertEquals(arrondi(fractionReaching(0.35, 2500, KCAL_PER_KG_BODY_MASS)), 0.154);
  assertEquals(arrondi(fractionReaching(0.35, 1800, KCAL_PER_KG_BODY_MASS)), 0.2139);
  const petit = fractionReaching(0.35, 1800, KCAL_PER_KG_BODY_MASS)!;
  const grand = fractionReaching(0.35, 3850, KCAL_PER_KG_BODY_MASS)!;
  assert(petit / grand > 2, `${petit} / ${grand}`);
});

Deno.test("⛔ réel — RETIRER L'AVERTISSEMENT SE VOIT", () => {
  // Le geste explicitement interdit au lot: « là où le produit AVERTIT, il
  // cesse de REFUSER — il ne cesse pas d'avertir ». Une ligne poussée hors de
  // portée n'est plus une ligne, et le verdict le dit.
  assertEquals(
    verdictOn({
      surplusFraction: MAX_SURPLUS_FRACTION,
      warnKgPerWeek: MAX_KG_PER_WEEK, // la ligne remontée AU plafond demandable
      requestableCeilingKgPerWeek: MAX_KG_PER_WEEK,
      kcalPerKgBodyMass: KCAL_PER_KG_BODY_MASS,
      maintenanceRangeKcal: ADULTE_ORDINAIRE,
    }),
    "refuses_below_warning",
  );
});
