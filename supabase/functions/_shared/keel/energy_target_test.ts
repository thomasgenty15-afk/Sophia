// FF-059 LOT 3 — LA CIBLE. Ce que ces tests protègent, dans l'ordre de ce que
// ça coûte quand ça casse:
//
//   * LE POINT À LA PLACE DE LA FOURCHETTE — c'est la forme qui décide si un
//     chiffre devient un objectif. Personne ne « rate » un intervalle de 400
//     kcal; tout le monde rate un nombre;
//   * LE DÉFICIT DÉRIVÉ — cette fourchette est une MAINTENANCE. En tirer une
//     cible d'amaigrissement serait prescrire un régime chiffré à quelqu'un que
//     personne n'a examiné;
//   * LE FACTEUR D'ACTIVITÉ INVENTÉ — le rabbit hole nommé par la fiche. Un
//     test lit la source et refuse `estimatedMaintenanceKcal` ici;
//   * LES DEUX COPIES DES CONSTANTES — le front sert la même fourchette au
//     coach depuis toujours. Un test LIT son fichier et refuse le désaccord.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  ENERGY_TARGET_BASIS,
  MAINTENANCE_KCAL_PER_KG_HIGH,
  MAINTENANCE_KCAL_PER_KG_LOW,
  maintenanceRange,
  TARGET_GAPS,
  TARGET_WEIGHT_KG_MAX,
  TARGET_WEIGHT_KG_MIN,
} from "./energy_target.ts";
import { canShowEnergy, canShowTarget } from "./energy_gate.ts";
import { assessBirthDate } from "./student_age.ts";

const TODAY = "2026-08-12";

// ---------------------------------------------------------------------------
// L'ARITHMÉTIQUE
// ---------------------------------------------------------------------------

Deno.test("FF-059 lot 3 — la fourchette, calculée à la main", () => {
  // 75 kg → 28 × 75 = 2100 · 33 × 75 = 2475 → arrondi aux 50 → 2100 – 2500.
  const t = maintenanceRange({ weightKg: 75, weightWeekStart: "2026-08-10" });
  assertEquals(t.range, { low: 2100, high: 2500 });
  assertEquals(t.basis, ENERGY_TARGET_BASIS);
  assertEquals(t.gap, null);
  assertEquals(t.weightKg, 75);
  assertEquals(t.weightWeekStart, "2026-08-10");
});

Deno.test("FF-059 lot 3 — c'est TOUJOURS une fourchette, jamais un point", () => {
  // La propriété qui décide si ce chiffre devient un objectif. Sur toute la
  // plage plausible, le haut est strictement au-dessus du bas — il n'existe
  // aucun poids où les deux se rejoignent et où la cible deviendrait un nombre.
  for (let w = TARGET_WEIGHT_KG_MIN; w <= TARGET_WEIGHT_KG_MAX; w += 1) {
    const t = maintenanceRange({ weightKg: w, weightWeekStart: null });
    assert(t.range !== null, `${w} kg n'a pas de fourchette`);
    assert(
      t.range.high > t.range.low,
      `${w} kg rend un POINT: ${t.range.low}–${t.range.high}`,
    );
  }
});

Deno.test("FF-059 lot 3 — arrondie aux 50, parce que la précision serait fausse", () => {
  const t = maintenanceRange({ weightKg: 68.4, weightWeekStart: null });
  // 28 × 68,4 = 1915,2 → 1900 ; 33 × 68,4 = 2257,2 → 2250.
  assertEquals(t.range, { low: 1900, high: 2250 });
  assertEquals(t.range!.low % 50, 0);
  assertEquals(t.range!.high % 50, 0);
});

// ---------------------------------------------------------------------------
// LES ABSTENTIONS
// ---------------------------------------------------------------------------

Deno.test("FF-059 lot 3 — sans pesée, pas de cible, et le motif le dit", () => {
  for (const weightKg of [null, 0, -5, Number.NaN]) {
    const t = maintenanceRange({ weightKg, weightWeekStart: null });
    assertEquals(t.range, null, String(weightKg));
    assertEquals(t.gap, "no_weight", String(weightKg));
    // ⚠️ Même sans cible, la base est là: un champ qui ne porterait sa base que
    // quand il porte un chiffre laisserait une forme sans base dans le produit.
    assertEquals(t.basis, ENERGY_TARGET_BASIS);
  }
});

Deno.test("FF-059 lot 3 — une pesée ABERRANTE se distingue d'une pesée absente", () => {
  // Les deux se réparent ailleurs: l'une demande une saisie, l'autre une
  // CORRECTION. Un motif unique ferait redemander son poids à quelqu'un qui
  // vient de taper 500.
  for (const weightKg of [TARGET_WEIGHT_KG_MIN - 1, TARGET_WEIGHT_KG_MAX + 1, 500]) {
    const t = maintenanceRange({ weightKg, weightWeekStart: null });
    assertEquals(t.range, null);
    assertEquals(t.gap, "implausible_weight");
  }
  // Prémisse fausse: les bornes elles-mêmes PASSENT.
  for (const weightKg of [TARGET_WEIGHT_KG_MIN, TARGET_WEIGHT_KG_MAX]) {
    assert(maintenanceRange({ weightKg, weightWeekStart: null }).range !== null);
  }
});

Deno.test("FF-059 lot 3 — les deux motifs sont atteignables, et il n'y en a que deux", () => {
  const seen = new Set<string>();
  for (const weightKg of [null, 500]) {
    seen.add(maintenanceRange({ weightKg, weightWeekStart: null }).gap!);
  }
  assertEquals([...seen].sort(), [...TARGET_GAPS].sort());
});

// ---------------------------------------------------------------------------
// LA CINQUIÈME PORTE
// ---------------------------------------------------------------------------

const ADULT = assessBirthDate("1990-01-01", TODAY);

function abGate(over: Partial<Parameters<typeof canShowEnergy>[0]> = {}) {
  return canShowEnergy({
    restrictionFlag: false,
    ageVerdict: ADULT,
    coachCounting: "no_position",
    studentSwitch: true,
    ...over,
  });
}

Deno.test("FF-059 lot 3 — la cible exige la chaîne A/B ENTIÈRE", () => {
  // Chaque porte de la chaîne A/B ferme AUSSI la cible, et son motif SURVIT.
  // C'est ce qui garantit que le plancher TCA ferme les trois niveaux — pas une
  // discipline d'appelant, mais le fait qu'il n'y a pas d'autre porte d'entrée.
  const cases: Array<[Partial<Parameters<typeof canShowEnergy>[0]>, string]> = [
    [{ restrictionFlag: true }, "restriction_floor"],
    [{ ageVerdict: assessBirthDate("2015-01-01", TODAY) }, "minor"],
    [{ coachCounting: "no_counting" }, "doctrine_no_counting"],
    [{ studentSwitch: false }, "student_off"],
  ];
  for (const [over, reason] of cases) {
    assertEquals(
      canShowTarget({ energy: abGate(over), targetSwitch: true }),
      { show: false, reason },
      JSON.stringify(over),
    );
  }
});

Deno.test("FF-059 lot 3 — l'interrupteur de la cible est le SIEN, et il est en dernier", () => {
  assertEquals(
    canShowTarget({ energy: abGate(), targetSwitch: false }),
    { show: false, reason: "target_off" },
  );
  assertEquals(
    canShowTarget({ energy: abGate(), targetSwitch: true }),
    { show: true, reason: "open" },
  );
});

Deno.test("FF-059 lot 3 — allumer la CIBLE n'ouvre rien de la chaîne A/B", () => {
  // L'angle adversarial de ce lot: une cinquième porte allumée ne doit pas
  // devenir un contournement des quatre premières.
  assertEquals(
    canShowTarget({ energy: abGate({ restrictionFlag: true }), targetSwitch: true }),
    { show: false, reason: "restriction_floor" },
  );
});

Deno.test("FF-059 lot 3 — une entrée incomplète ou mal typée LÈVE", () => {
  const bad: unknown[] = [
    {},
    { energy: abGate() },
    { targetSwitch: true },
    { energy: abGate(), targetSwitch: undefined },
    { energy: undefined, targetSwitch: true },
    { energy: abGate(), targetSwitch: 1 },
    { energy: { show: true }, targetSwitch: true },
    { energy: { show: true, reason: "target_off" }, targetSwitch: true },
    { energy: true, targetSwitch: true },
  ];
  for (const input of bad) {
    let threw = false;
    try {
      canShowTarget(input as Parameters<typeof canShowTarget>[0]);
    } catch {
      threw = true;
    }
    assert(threw, `${JSON.stringify(input)} aurait dû lever`);
  }
});

// ---------------------------------------------------------------------------
// LES GARDES LUES SUR LA SOURCE
// ---------------------------------------------------------------------------

const SOURCE = Deno.readTextFileSync(
  fromFileUrl(new URL("./energy_target.ts", import.meta.url)),
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

Deno.test("FF-059 lot 3 — AUCUN facteur d'activité, et aucune soustraction", () => {
  // Le rabbit hole de la fiche, tenu sur le code. `estimatedMaintenanceKcal`
  // multiplie un métabolisme de base par une constante de 1,5 qu'aucune donnée
  // de cet élève ne justifie: rien ne collecte le niveau d'activité.
  for (const banned of ["estimatedMaintenanceKcal", "ACTIVITY_FACTOR", "MAX_DAILY_DEFICIT"]) {
    assert(!SOURCE.includes(banned), `« ${banned} » dans energy_target.ts`);
  }
  // ET AUCUN RESTE. « Il te reste 680 kcal » est LA phrase d'un tracker; ce
  // module ne soustrait rien, donc personne en aval ne peut la construire à
  // partir de ce qu'il rend.
  for (const banned of ["remaining", "deficit", "surplus", "consumed", " - "]) {
    assert(!SOURCE.includes(banned), `soustraction ou reste dans energy_target.ts: « ${banned} »`);
  }
});

Deno.test("FF-059 lot 3 — AUCUN objectif n'entre dans la fourchette", () => {
  // La maintenance est ce que ce corps DÉPENSE. Y faire entrer `fat_loss`
  // reviendrait à prescrire un déficit chiffré à quelqu'un que personne n'a
  // examiné — et le plafond de 500 kcal/j de `meal_envelope` existe justement
  // parce que ce calcul-là est dangereux.
  for (const banned of ["fat_loss", "muscle_gain", "GoalToken", "goal"]) {
    assert(!SOURCE.includes(banned), `« ${banned} » dans energy_target.ts`);
  }
});

Deno.test("FF-059 lot 3 — les constantes sont CELLES du front, et le test les lie", () => {
  // Deux copies d'un même nombre divergent, et c'est celle qu'on regarde le
  // moins qui garde l'ancienne. `coachStartingNumbers` sert la MÊME fourchette
  // au coach depuis toujours; sans ce test, l'un des deux pourrait bouger et
  // le coach et son élève liraient deux maintenances pour le même corps.
  const front = Deno.readTextFileSync(
    fromFileUrl(
      new URL("../../../../frontend/src/keel/lib/weekInFood.ts", import.meta.url),
    ),
  );
  assert(
    front.includes(`round50(${MAINTENANCE_KCAL_PER_KG_LOW} * w)`),
    `weekInFood.ts n'utilise plus ${MAINTENANCE_KCAL_PER_KG_LOW} kcal/kg en bas de fourchette`,
  );
  assert(
    front.includes(`round50(${MAINTENANCE_KCAL_PER_KG_HIGH} * w)`),
    `weekInFood.ts n'utilise plus ${MAINTENANCE_KCAL_PER_KG_HIGH} kcal/kg en haut de fourchette`,
  );
  // Et les bornes de plausibilité, qui décident QUI n'a pas de cible.
  assert(front.includes(`w < ${TARGET_WEIGHT_KG_MIN} || w > ${TARGET_WEIGHT_KG_MAX}`));
});
