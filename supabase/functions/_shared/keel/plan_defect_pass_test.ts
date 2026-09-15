/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C4 — LES TESTS CONTRÔLÉS QUE LE PLAN DE CLÔTURE NOMME
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan (§ C4) les liste : « déficit protéique du tir 1 corrigé sans dépasser
 * calories/grammes ; première réparation insuffisante puis seconde suffisante ;
 * deux réparations insuffisantes ; candidat améliorant les calories mais
 * introduisant un allergène ; amélioration d'une bouche dégradant l'autre ;
 * portion sans référence détectée avant livraison. **Compter les appels
 * réellement effectués**, pas seulement le nombre demandé à la fonction de
 * budget. »
 *
 * ⛔ CHAQUE CAS A SON JUMEAU QUI PASSE. Une garde éprouvée seulement sur ce
 * qu'elle refuse est indiscernable d'une garde cassée — c'est la cicatrice
 * `guards-need-a-passing-case` de ce dépôt.
 *
 * ⚠️ CE FICHIER N'APPELLE AUCUN MODÈLE ET NE TOUCHE AUCUNE BASE. Il conduit les
 * VRAIES fonctions de décision (`collectPlanDefects`, `judgeCandidate`,
 * `planRepairPass`, `createPlanBudget`, `planRepairRequest`) dans l'ordre où le
 * handler les appelle.
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  collectPlanDefects,
  defectsFromQuantities,
  nutritionMagnitudes,
  planRepairRequest,
} from "./plan_defect_pass.ts";
import type { PlanControlFindings } from "./plan_defect_pass.ts";
import { judgeCandidate, planRepairPass } from "./plan_repair_loop.ts";
import type { RepairDefect } from "./plan_repair_loop.ts";
import { createPlanBudget } from "./plan_budget.ts";
import type { GateRefusal } from "./final_plan_gate.ts";
import type {
  CellNutritionRow,
  DayNutritionRow,
  ProteinFloorAllocation,
} from "./final_plan_audit.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LE DÉCOR — les nombres du TIR 1 de la campagne du 2026-09-11
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE NE SONT PAS DES NOMBRES RONDS INVENTÉS. Le tir n° 1 (PERTE, Paul,
// 88 kg) sort à **124 g de protéine pour un plancher couvert de 176 g** sur sa
// journée du dimanche — mesuré au banc du transport contrôlé le 2026-09-12,
// plan `21c9938a`. C'est le défaut n° 1 de la campagne : quatre plans sur six.

const PLANCHER = (
  coveredFloorG: number | null,
): ProteinFloorAllocation => ({
  dayFloorG: 176,
  coveredFloorG,
  perMealFloorG: null,
  fixedProteinG: null,
  reason: coveredFloorG === null ? "no_body" : "applied_full_day",
});

function jour(o: Partial<DayNutritionRow> = {}): DayNutritionRow {
  return {
    memberId: "paul",
    date: "2026-09-13",
    cellsExpected: 3,
    cellsMeasured: 3,
    coveredBudgetKcal: 2454,
    servedKcal: 2463,
    deltaPct: 0.4,
    proteinG: 124,
    proteinRoundingG: null,
    protein: PLANCHER(176),
    state: "conforme",
    ...o,
  };
}

function caseNut(o: Partial<CellNutritionRow> = {}): CellNutritionRow {
  return {
    memberId: "paul",
    day: "sun",
    date: "2026-09-13",
    slot: "dinner",
    targetKcal: 860,
    hasDish: true,
    hasPortion: true,
    servedKcal: 860,
    grams: 343,
    densityPer100G: 250,
    proteinG: 52,
    proteinRoundingG: null,
    densityRoundingPer100G: null,
    gap: null,
    deltaPct: 0,
    sharedWith: 1,
    portionExpected: true,
    state: "conforme",
    ...o,
  };
}

function refus(o: Partial<GateRefusal> = {}): GateRefusal {
  return {
    cause: "protein_floor_short",
    severity: "count",
    day: "2026-09-13",
    slot: null,
    dish: null,
    preparation_id: null,
    member_id: "paul",
    term: null,
    detail: "2026-09-13 : 124 g de protéine pour un plancher couvert de 176 g",
    ...o,
  };
}

function constats(o: Partial<PlanControlFindings> = {}): PlanControlFindings {
  return {
    refusals: [],
    outputContract: null,
    nutrition: null,
    roundedToZero: [],
    potsOverdrawn: 0,
    potsOverdrawnWorstPerMille: 0,
    outOfBounds: [],
    ...o,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE DÉFICIT PROTÉIQUE DU TIR 1 ATTEINT LE BUDGET, ET IL EST CHIFFRÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ① — le déficit protéique du tir 1 devient un défaut RÉPARABLE, chiffré", () => {
  const findings = constats({
    refusals: [refus()],
    nutrition: { cells: [caseNut()], days: [jour()] },
  });
  const pass = collectPlanDefects(findings);
  assertEquals(pass.defects.length, 1);
  const d = pass.defects[0];
  assertEquals(d.kind, "protein");
  assertEquals(d.repairable, true, "un plancher protéique se répare par une recette");
  // ⛔ 52 g, PAS « un défaut ». Sans l'ampleur, `judgeCandidate` ne peut pas
  // adopter une candidate qui ferme les trois quarts de l'écart sans fermer le
  // défaut — le cas mesuré du lot E.
  assertEquals(d.magnitude, 176 - 124);
  assertEquals(pass.bySource, {
    gate: 1,
    output_contract: 0,
    quantities: 0,
    // ⟳ 2026-09-12 · FERMETURE LOT 1 — la quatrième source: les sept sites
    // d'amont, qui n'appellent plus le modèle et déposent leur constat ici.
    upstream: 0,
  });
});

Deno.test("C4 ① bis — LE CAS QUI PASSE: un plancher atteint ne produit aucun défaut", () => {
  // ⛔ SANS CE JUMEAU, une passe qui rendrait un défaut sur TOUT plan aurait
  // l'air de marcher. C'est la garde de la garde.
  const pass = collectPlanDefects(constats({
    refusals: [],
    nutrition: { cells: [caseNut()], days: [jour({ proteinG: 180 })] },
  }));
  assertEquals(pass.defects.length, 0);
  assertEquals(pass.repairable.length, 0);
});

Deno.test("C4 ① ter — l'ampleur S'ABSTIENT quand la journée n'est pas lisible", () => {
  // ⚠️ `magnitude: null` EST UN AVEU, PAS UN ZÉRO. Un zéro dirait « il ne manque
  // rien », et `magnitudeComparison` comparerait des grandeurs inventées.
  const m = nutritionMagnitudes([refus()], {
    cells: [],
    days: [jour({ proteinG: null })],
  });
  assertEquals(m.size, 0);
  const pass = collectPlanDefects(constats({
    refusals: [refus()],
    nutrition: { cells: [], days: [jour({ proteinG: null })] },
  }));
  assertEquals(pass.defects[0].magnitude, null);
});

Deno.test("C4 ① quater — deux journées de la MÊME bouche ne partagent pas une ampleur", () => {
  // ⛔ C'EST LA RAISON D'ÊTRE DE `day: day.date` SUR LE REFUS. À `day: null`,
  // les deux journées du tir n° 1 (−42 % et −43 %) rendaient UNE identité de
  // violation et leurs ampleurs s'écrasaient.
  const m = nutritionMagnitudes(
    [
      refus({ day: "2026-09-13" }),
      refus({ day: "2026-09-14", detail: "autre journée" }),
    ],
    {
      cells: [],
      days: [
        jour({ date: "2026-09-13", proteinG: 124 }),
        jour({ date: "2026-09-14", proteinG: 150 }),
      ],
    },
  );
  assertEquals(m.size, 2, "deux identités distinctes");
  assertEquals([...m.values()].sort((a, b) => a - b), [26, 52]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② UNE PREMIÈRE RÉPARATION INSUFFISANTE, PUIS UNE SECONDE SUFFISANTE
// ═══════════════════════════════════════════════════════════════════════════

/** Les défauts d'un plan dont la journée porte `proteinG`. */
function defautsPour(proteinG: number): readonly RepairDefect[] {
  return collectPlanDefects(constats({
    refusals: proteinG >= 176 ? [] : [refus()],
    nutrition: { cells: [caseNut()], days: [jour({ proteinG })] },
  })).defects;
}

Deno.test("C4 ② — première réparation INSUFFISANTE puis seconde SUFFISANTE, deux appels", () => {
  const budget = createPlanBudget({
    now: () => 0,
    startedAtMs: 0,
    totalMs: 380_000,
    reserveMs: 30_000,
    repairs: 2,
  });
  /** ⛔ LES APPELS RÉELLEMENT PARTIS, pas ceux demandés au budget. */
  let appels = 0;
  let courant = defautsPour(124);

  // ── TOUR 0: 52 g manquent, la passe demande un appel ─────────────────────
  let passe = planRepairPass({
    defects: courant,
    attemptsUsed: budget.snapshot().repairs_used,
    maxAttempts: budget.snapshot().repairs_allowed,
    remainingMs: budget.usableMs(),
  });
  assertEquals(passe.call, true);
  assert(budget.askRepair("final_repair", 40_000, 300_000, new Set()).granted);
  appels++;

  // ── TOUR 1: la candidate monte à 160 g. Insuffisante, mais ADOPTÉE ───────
  const apres1 = defautsPour(160);
  const verdict1 = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: courant,
    afterDefects: apres1,
  });
  assertEquals(
    verdict1.verdict,
    "adopt",
    "52 g → 16 g ferme 69 % de l'écart: au-dessus du seuil de 10 %",
  );
  assertEquals(verdict1.magnitude.before, 52);
  assertEquals(verdict1.magnitude.after, 16);
  courant = apres1;

  // ⛔ ET LE DÉFAUT RESTE UN DÉFAUT. « Adoptée » ne veut pas dire « réparée ».
  assertEquals(courant.length, 1);

  passe = planRepairPass({
    defects: courant,
    attemptsUsed: budget.snapshot().repairs_used,
    maxAttempts: budget.snapshot().repairs_allowed,
    remainingMs: budget.usableMs(),
  });
  assertEquals(passe.call, true, "il reste un essai");
  assert(budget.askRepair("final_repair", 40_000, 300_000, new Set()).granted);
  appels++;

  // ── TOUR 2: la candidate atteint 180 g. Le défaut DISPARAÎT ──────────────
  const apres2 = defautsPour(180);
  assertEquals(apres2.length, 0);
  const verdict2 = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: courant,
    afterDefects: apres2,
  });
  assertEquals(verdict2.verdict, "adopt");

  // ── ET LE BUDGET EST CLOS ────────────────────────────────────────────────
  const fin = planRepairPass({
    defects: apres2,
    attemptsUsed: budget.snapshot().repairs_used,
    maxAttempts: budget.snapshot().repairs_allowed,
    remainingMs: budget.usableMs(),
  });
  assertEquals(fin.call, false);
  assertEquals(fin.call === false ? fin.reason : "", "no_defects");
  assertEquals(appels, 2, "deux appels PARTIS");
  assertEquals(budget.snapshot().repairs_used, 2);
  assertEquals(budget.snapshot().charged, ["final_repair", "final_repair"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ DEUX RÉPARATIONS INSUFFISANTES — ET AUCUN TROISIÈME RAPPEL
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ③ — deux réparations insuffisantes: le TROISIÈME appel est refusé", () => {
  const budget = createPlanBudget({
    now: () => 0,
    startedAtMs: 0,
    totalMs: 380_000,
    reserveMs: 30_000,
    repairs: 2,
  });
  let appels = 0;
  let courant = defautsPour(100);
  for (const apres of [defautsPour(130), defautsPour(155)]) {
    const passe = planRepairPass({
      defects: courant,
      attemptsUsed: budget.snapshot().repairs_used,
      maxAttempts: budget.snapshot().repairs_allowed,
      remainingMs: budget.usableMs(),
    });
    assertEquals(passe.call, true);
    assert(budget.askRepair("final_repair", 40_000, 300_000, new Set()).granted);
    appels++;
    const v = judgeCandidate({
      beforeRefusals: [],
      afterRefusals: [],
      beforeDefects: courant,
      afterDefects: apres,
    });
    assertEquals(v.verdict, "adopt");
    courant = apres;
  }
  // ⛔ LE DÉFAUT EST TOUJOURS LÀ, ET ON NE RAPPELLE PLUS.
  assertEquals(courant.length, 1);
  const troisieme = planRepairPass({
    defects: courant,
    attemptsUsed: budget.snapshot().repairs_used,
    maxAttempts: budget.snapshot().repairs_allowed,
    remainingMs: budget.usableMs(),
  });
  assertEquals(troisieme.call, false);
  assertEquals(
    troisieme.call === false ? troisieme.reason : "",
    "attempts_exhausted",
  );
  assertEquals(appels, 2, "aucun troisième appel n'est parti");
  // ⛔ ET SI QUELQU'UN LE DEMANDAIT QUAND MÊME, LE BUDGET REFUSE. La passe et
  // le budget sont deux gardes, pas une garde et son commentaire.
  const force = budget.askRepair("final_repair", 40_000, 300_000, new Set());
  assertEquals(force.granted, false);
  assertEquals(force.refusal, "repair_budget_exhausted");
  assertEquals(budget.snapshot().repairs_used, 2);
});

Deno.test("C4 ③ bis — LE CAS QUI PASSE: sans défaut, aucun appel n'est demandé", () => {
  const budget = createPlanBudget({
    now: () => 0,
    startedAtMs: 0,
    totalMs: 380_000,
    reserveMs: 30_000,
    repairs: 2,
  });
  const passe = planRepairPass({
    defects: defautsPour(180),
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: budget.usableMs(),
  });
  assertEquals(passe.call, false);
  assertEquals(passe.call === false ? passe.reason : "", "no_defects");
  assertEquals(budget.snapshot().repairs_used, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ UNE CANDIDATE QUI AMÉLIORE LES CALORIES ET INTRODUIT UN ALLERGÈNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ④ — les calories s'améliorent, un allergène entre: REJETÉE", () => {
  // ⛔ LE PIÈGE EST LE COMPTE. La candidate ferme DEUX défauts d'énergie et en
  // ouvre UN de sécurité: 3 → 2, donc « moins de défauts ». Sans la garde de
  // sécurité, `judgeCandidate` l'adopterait.
  const avantRefus: GateRefusal[] = [];
  const apresRefus: GateRefusal[] = [
    refus({
      cause: "member_exclusion_served",
      severity: "refuse",
      day: "sun",
      slot: "dinner",
      dish: "Bœuf à l'oignon",
      term: "arachide",
      detail: "arachide servie à quelqu'un qui l'exclut",
    }),
  ];
  const avant = collectPlanDefects(constats({
    refusals: [
      refus({ cause: "cell_energy_off", day: "sun", slot: "lunch" }),
      refus({ cause: "cell_energy_off", day: "sun", slot: "dinner" }),
      refus(),
    ],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  const apres = collectPlanDefects(constats({
    refusals: [...apresRefus, refus()],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  assert(apres.length < avant.length, "le nombre de défauts BAISSE");
  const v = judgeCandidate({
    beforeRefusals: avantRefus,
    afterRefusals: apresRefus,
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(v.verdict, "safety_regression");
  assertEquals(v.safety.added.length, 1);
});

Deno.test("C4 ④ bis — LE CAS QUI PASSE: les mêmes calories améliorées, sans allergène", () => {
  const avant = collectPlanDefects(constats({
    refusals: [
      refus({ cause: "cell_energy_off", day: "sun", slot: "lunch" }),
      refus({ cause: "cell_energy_off", day: "sun", slot: "dinner" }),
      refus(),
    ],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  const apres = collectPlanDefects(constats({
    refusals: [refus()],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(v.verdict, "adopt");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UNE BOUCHE AMÉLIORÉE, L'AUTRE DÉGRADÉE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ⑤ — améliorer une bouche en dégradant l'autre ne compte pas comme un gain", () => {
  // ⛔ À NOMBRE DE DÉFAUTS ÉGAL, C'EST L'AMPLEUR QUI TRANCHE — et elle
  // s'apparie PAR BOUCHE. Paul gagne 30 g, Léa en perd 30: le total ne bouge
  // pas, et une candidate qui déplace un manque d'une assiette à l'autre n'a
  // rien réparé.
  const deuxBouches = (paul: number, lea: number) =>
    collectPlanDefects(constats({
      refusals: [
        refus({ member_id: "paul" }),
        refus({ member_id: "lea", detail: "Léa sous son plancher" }),
      ],
      nutrition: {
        cells: [],
        days: [
          jour({ memberId: "paul", proteinG: paul }),
          jour({ memberId: "lea", proteinG: lea, protein: PLANCHER(120) }),
        ],
      },
    })).defects;
  const avant = deuxBouches(124, 110);
  const apres = deuxBouches(154, 80);
  assertEquals(avant.length, apres.length);
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(v.verdict, "no_improvement");
  // Paul: 52 → 22 (−30). Léa: 10 → 40 (+30). Le total est identique.
  assertEquals(v.magnitude.before, 62);
  assertEquals(v.magnitude.after, 62);
  assertEquals(v.magnitude.gain, 0);
});

Deno.test("C4 ⑤ bis — LE CAS QUI PASSE: les deux bouches s'améliorent ensemble", () => {
  const deuxBouches = (paul: number, lea: number) =>
    collectPlanDefects(constats({
      refusals: [
        refus({ member_id: "paul" }),
        refus({ member_id: "lea", detail: "Léa sous son plancher" }),
      ],
      nutrition: {
        cells: [],
        days: [
          jour({ memberId: "paul", proteinG: paul }),
          jour({ memberId: "lea", proteinG: lea, protein: PLANCHER(120) }),
        ],
      },
    })).defects;
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: deuxBouches(124, 110),
    afterDefects: deuxBouches(160, 115),
  });
  assertEquals(v.verdict, "adopt");
  assertEquals(v.magnitude.before, 62);
  assertEquals(v.magnitude.after, 21);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ UNE PORTION SANS RÉFÉRENCE, DÉTECTÉE AVANT LA LIVRAISON
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ⑥ — une ligne pesée sans identifiant atteint le budget de réparation", () => {
  // ⛔ C'EST LE TIR N° 2 DU 2026-09-11: 6 plats, 31 lignes, ZÉRO `ref`, et
  // `sun/dinner` parti SANS PORTION avec un verdict publié à « 5 / 5 ».
  // L'étape C1 a produit le constat; celle-ci le fait ARRIVER au budget.
  const pass = collectPlanDefects(constats({
    outputContract: {
      lines: 31,
      counters: {
        ok: 30,
        convention: 0,
        ref_missing: 1,
        ref_refused: 0,
        quantity_missing: 0,
        dash_unreferenced: 0,
      },
      findings: [{
        site: {
          day: "sun",
          slot: "dinner",
          dish: "Pita complète",
          preparationId: null,
        },
        term: "pita complète",
        verdict: "ref_missing",
      }],
    },
  }));
  assertEquals(pass.defects.length, 1);
  assertEquals(pass.defects[0].repairable, true);
  assertEquals(pass.bySource.output_contract, 1);
  const passe = planRepairPass({
    defects: pass.defects,
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(passe.call, true, "le défaut d'identité DÉCLENCHE un appel");
  const instruction = planRepairRequest({ defects: pass.defects, days: [], index: null });
  assert(instruction !== null);
  assert(
    instruction.includes("pita complète"),
    "la consigne NOMME la ligne sans identifiant",
  );
});

Deno.test("C4 ⑥ bis — LE CAS QUI PASSE: un contrat de sortie propre ne demande rien", () => {
  const pass = collectPlanDefects(constats({
    outputContract: {
      lines: 31,
      counters: {
        ok: 31,
        convention: 0,
        ref_missing: 0,
        ref_refused: 0,
        quantity_missing: 0,
        dash_unreferenced: 0,
      },
      findings: [],
    },
  }));
  assertEquals(pass.defects.length, 0);
  assertEquals(planRepairRequest({ defects: pass.defects, days: [], index: null }), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LES DÉFAUTS DE QUANTITÉ DE L'ÉTAPE C2 ATTEIGNENT LE MÊME BUDGET
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ⑦ — arrondi à zéro et assiette hors bornes deviennent des défauts", () => {
  const out = defectsFromQuantities({
    roundedToZero: [{ term: "cumin", day: null, slot: null, dish: null }],
    potsOverdrawn: 2,
    potsOverdrawnWorstPerMille: 34,
    outOfBounds: [{ day: "sun", slot: "lunch", grams: 701, limit: 700, bound: "max" }],
  });
  assertEquals(out.length, 3);
  const parNature = out.map((d) => `${d.kind}:${d.repairable}`);
  assertEquals(parNature, ["sizing:true", "sizing:false", "sizing:true"]);
  // ⛔ `rounding_pot_overdrawn` N'EST PAS RÉPARABLE PAR UN APPEL, et c'est
  // mesuré: les deux dépassements du plan GAIN (pire cas 3,4 ‰) sont
  // PRÉÉXISTANTS et viennent d'une division qui ne tombe pas juste.
  assertEquals(out[1].repairable, false);
  // L'assiette de 701 g pour un plafond de 700 manque de 1 g — le défaut
  // `final_sizing.out_of_bounds` que l'étape C2 a laissé ouvert.
  assertEquals(out[2].magnitude, 1);
});

Deno.test("C4 ⑦ bis — LE CAS QUI PASSE: des quantités saines ne produisent rien", () => {
  assertEquals(
    defectsFromQuantities({
      roundedToZero: [],
      potsOverdrawn: 0,
      potsOverdrawnWorstPerMille: 0,
      outOfBounds: [],
    }).length,
    0,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LA CONSIGNE — IDENTIFIANTS STABLES, MESURES, CONTRATS, ÉCHAPPATOIRES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ⑧ — la demande de correction porte les trois nombres et ferme les deux sorties", () => {
  const defects = collectPlanDefects(constats({
    refusals: [refus()],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  const texte = planRepairRequest({
    defects,
    index: null,
    days: [{
      memberId: "paul",
      date: "2026-09-13",
      dayToken: "sun",
      proteinNowG: 124,
      proteinFloorG: 176,
      kcalNow: 2463,
      kcalBudget: 2454,
      dishes: [{
        slot: "dinner",
        title: "Bœuf à l'oignon",
        proteinG: 52,
        servedKcal: 860,
        grams: 343,
      }],
    }],
  });
  assert(texte !== null);
  // ① LES MESURES ACTUELLES ET LE CONTRAT ATTENDU
  assert(texte.includes("124 g of protein"), texte);
  assert(texte.includes("at least 176 g"), texte);
  assert(texte.includes("2454 kcal"), texte);
  // ② L'IDENTIFIANT STABLE DU PLAT
  assert(texte.includes('"Bœuf à l\'oignon" at dinner'), texte);
  // ③ LES DEUX ÉCHAPPATOIRES, LITTÉRALEMENT NOMMÉES — le plan l'exige:
  // « recomposer à calories et masse compatibles ; ne pas ajouter
  // mécaniquement de la viande ou augmenter tout le plat ».
  assert(texte.includes("Do NOT simply add meat on top"), texte);
  assert(texte.includes("do NOT scale the whole dish up"), texte);
  assert(texte.includes("RECOMPOSING"), texte);
});

Deno.test("C4 ⑧ bis — sans contexte de journée, la consigne rend quand même les deux grammages", () => {
  // ⚠️ UN CONTEXTE MANQUANT NE DOIT PAS FAIRE DISPARAÎTRE LE DÉFAUT.
  //
  // ⟳ 2026-09-12 · LOT 2 — CE CAS ÉPINGLAIT LA PHRASE **FRANÇAISE** DE LA
  // GARDE (« plancher couvert de 176 g ») AU MILIEU D'UNE INSTRUCTION
  // ANGLAISE, et c'est ce que ce lot corrige exprès: le `detail` de la garde
  // est écrit pour le journal et l'écran, la consigne part au modèle en
  // anglais. Mesuré sur le tir n° 1 archivé, qui portait « "champignons de
  // Paris" n'est ni sur la liste de courses ni au garde-manger » dans un bloc
  // anglais. Ce qui est épinglé reste le FAIT: les deux grammages voyagent.
  const defects = collectPlanDefects(constats({
    refusals: [refus()],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  const texte = planRepairRequest({ defects, days: [], index: null });
  assert(texte !== null);
  assert(texte.includes("124 g of protein"), texte);
  assert(texte.includes("at least 176 g"), texte);
  // ⛔ ET AUCUNE CONSIGNE DE MAXIMISATION. Revue C6 § 7: 276–292 g servis pour
  // un plancher de 176 g — « cette marge n'est pas un critère de meilleure
  // recette ».
  assert(texte.includes("going far above it is not better"), texte);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ L'ORDRE DES SECTIONS EST LE CONTRAT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("C4 ⑨ — la sécurité est dite AVANT la protéine dans la même instruction", () => {
  // ⛔ « Une instruction qui commence par "et ajoute des lentilles" avant de dire
  // "ce plat contient l'allergène de quelqu'un" fait lire le second comme un
  // détail. » (`plan_repair_loop.ts`)
  const defects = collectPlanDefects(constats({
    refusals: [
      refus(),
      refus({
        cause: "member_exclusion_served",
        severity: "refuse",
        day: "sun",
        slot: "lunch",
        term: "arachide",
        detail: "arachide servie",
      }),
    ],
    nutrition: { cells: [caseNut()], days: [jour()] },
  })).defects;
  const texte = planRepairRequest({ defects, days: [], index: null })!;
  const securite = texte.indexOf("SOMEONE IS SERVED WHAT THEY MUST NOT EAT");
  const proteine = texte.indexOf("THESE DAYS DO NOT CARRY ENOUGH PROTEIN");
  assert(securite >= 0 && proteine >= 0, texte);
  assert(securite < proteine, "la sécurité passe en tête");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑫ ⟳ 2026-09-12 · FERMETURE LOT 1 — LES TROIS NATURES DANS **UNE** DÉCISION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑫ densité + référence absente + déficit protéique: UN constat, UN appel", () => {
  // ⛔ LE CAS QUE LA TABLE DU CHANTIER EXIGE, ET C'EST TOUT L'OBJET DU LOT 1 :
  // « constat commun avant premier rappel ; pas de budget vidé par un site
  // amont ». Avant, ces trois défauts partaient par TROIS chemins différents
  // (`density_repair`, le contrat de sortie, `protein_anchor_retry`), chacun
  // demandant son propre appel, et les deux premiers pouvaient épuiser le
  // budget avant que le troisième existe.
  const pass = collectPlanDefects(constats({
    // ① la protéine, depuis la garde finale
    refusals: [refus()],
    nutrition: { cells: [caseNut()], days: [jour()] },
    // ② la densité / les bornes, depuis la mesure finale des quantités
    outOfBounds: [{
      day: "sun",
      slot: "dinner",
      grams: 760,
      limit: 700,
      bound: "max",
    }],
    // ③ l'identité absente, depuis le contrat de sortie
    outputContract: {
      lines: 31,
      counters: {
        ok: 30,
        convention: 0,
        ref_missing: 1,
        ref_refused: 0,
        quantity_missing: 0,
        dash_unreferenced: 0,
      },
      findings: [{
        site: {
          day: "sun",
          slot: "dinner",
          dish: "Pita complète",
          preparationId: null,
        },
        term: "pita complète",
        verdict: "ref_missing",
      }],
    },
  }));

  // ⛔ LES TROIS SONT LÀ, DANS LA MÊME PASSE, AVEC LEUR SOURCE NOMMÉE.
  assertEquals(pass.defects.length, 3);
  assertEquals(pass.bySource, {
    gate: 1,
    output_contract: 1,
    quantities: 1,
    upstream: 0,
  });
  assertEquals(pass.byKind, { sizing: 2, protein: 1 });

  // ⛔ ET L'ORDRE EST CELUI DU CHANTIER: le grammage avant la protéine. Une
  // instruction qui commence par la protéine fait lire la densité comme un
  // détail.
  assertEquals(pass.defects.map((d) => d.kind), ["sizing", "sizing", "protein"]);

  // ⛔ UN SEUL APPEL LES PORTE TOUS LES TROIS. C'est la propriété que le lot 1
  // ajoute: « deux défauts présents en même temps partaient en DEUX appels au
  // lieu d'une instruction ».
  const passe = planRepairPass({
    defects: pass.defects,
    attemptsUsed: 0,
    maxAttempts: 2,
    remainingMs: 300_000,
  });
  assertEquals(passe.call, true);
  assert(passe.call && passe.defects.length === 3, "les trois partent ensemble");

  // ⛔ ET LA CONSIGNE NOMME LES TROIS, dans le même texte.
  const instruction = planRepairRequest({ defects: pass.defects, days: [], index: null });
  assert(instruction !== null);
  assert(instruction.includes("pita complète"), instruction);
  assert(instruction.includes("760 g"), instruction);
  assert(instruction.includes("protein"), instruction);
});

Deno.test("⑫ bis — le budget n'est consulté QU'UNE fois, et il en reste un", () => {
  // ⛔ LA CONTRE-ÉPREUVE DU COMPTEUR. Trois défauts de trois natures ne doivent
  // pas coûter trois tentatives: sans ça, le plancher protéique — le défaut
  // n° 1 de la campagne du 2026-09-11 — repartait sur un budget déjà vide.
  const budget = createPlanBudget({
    now: () => 0,
    startedAtMs: 0,
    totalMs: 380_000,
    reserveMs: 30_000,
    repairs: 2,
  });
  const un = budget.askRepair("final_repair", 40_000, 300_000, new Set<string>());
  assertEquals(un.granted, true);
  assertEquals(budget.snapshot().repairs_used, 1);
  assertEquals(budget.snapshot().repairs_allowed, 2);
  // Il en reste EXACTEMENT un, et c'est le second appel du plafond du lot.
  const deux = budget.askRepair("final_repair", 40_000, 300_000, new Set<string>());
  assertEquals(deux.granted, true);
  const trois = budget.askRepair("final_repair", 40_000, 300_000, new Set<string>());
  assertEquals(trois.granted, false, "un TROISIÈME rappel est passé");
});
