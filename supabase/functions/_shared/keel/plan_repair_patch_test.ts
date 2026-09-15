/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PATCH — CE QU'ON APPLIQUE, ET CE QU'ON REJETTE EN ENTIER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT ② DE LA REVUE DU 2026-09-12, REPRODUIT AVEC LES FONCTIONS DE
 * PRODUCTION: « deux plats partagent `p1`, un seul doit changer, la candidate
 * le relie à `p2`. Le prompt autorise ce geste, la fusion rend `uses_changed`,
 * aucune case appliquée. » Le cas ③ ci-dessous est celui-là, et il passe
 * maintenant — avec, juste à côté, les quatre cas qui doivent continuer d'être
 * REFUSÉS, pour qu'« accepter une nouvelle casserole » ne se lise jamais
 * « accepter n'importe quoi ».
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  applyRepairPatch,
  fusedSourceText,
  parseRepairPatch,
  patchDishPayloads,
  patchPreparationPayloads,
  preparationStubsFor,
  REPAIR_PATCH_SCHEMA_LINES,
  repairPatchContractLines,
} from "./plan_repair_patch.ts";
import { repairScopeOf } from "./plan_repair_context.ts";
import type {
  RepairPlanDish,
  RepairPlanPreparation,
  RepairPlanShape,
} from "./plan_repair_context.ts";
import { buildRepairSessions, buildRepairUnits } from "./plan_repair_unit.ts";
import type { RepairUnit, RepairUnitDish } from "./plan_repair_unit.ts";
import {
  PLAN_REPAIR_MAX_CALLS,
  planRepairDecision,
} from "./plan_repair_loop.ts";
import type { RepairDefect } from "./plan_repair_loop.ts";

type Plat = RepairPlanDish & RepairUnitDish;

function plat(
  day: string,
  slot: string,
  title: string,
  o: {
    owner?: string | null;
    eaters?: readonly string[];
    uses?: readonly string[];
    term?: string;
  } = {},
): Plat {
  return {
    day,
    slot,
    title,
    memberId: o.owner ?? null,
    boxes: (o.eaters ?? []).map((m, i) => ({ id: `${title}_${i}`, memberIds: [m] })),
    uses: (o.uses ?? []).map((preparationId) => ({ preparationId, servings: 1 })),
    ingredients: [{ term: o.term ?? "tomate", amount: 100, unit: "g", ref: "tomato" }],
  };
}

/**
 * ⟳ 2026-09-13 · §2.1 — UNE CASSEROLE PORTE SON JOUR DE CUISSON.
 *
 * ⛔ CE N'EST PAS UN DÉTAIL DE DÉCOR. Depuis l'isolement, un lot NEUF doit
 * entrer dans la session de son jour, sinon la garde finale rend
 * `preparation_without_session` — une cause que rien ne répare. Les casseroles
 * de ce décor sont donc cuisinées le dimanche, comme sa seule session.
 */
function pot(
  id: string,
  title: string,
  term = "courgette",
  cookOn: string | null = "sun",
): RepairPlanPreparation {
  return {
    id,
    title,
    servingsMade: 2,
    cookOn,
    ingredients: [{ term, amount: 300, unit: "g", ref: "zucchini" }],
  };
}

// ── LE DÉCOR: DEUX PLATS DÉDIÉS, UNE SEULE CASSEROLE PARTAGÉE ─────────────
const DISHES: readonly Plat[] = [
  plat("sun", "dinner", "Poisson de Zoé", {
    owner: "zoe",
    eaters: ["zoe"],
    uses: ["p1"],
  }),
  plat("sun", "dinner", "Poulet de Paul", {
    owner: "paul",
    eaters: ["paul"],
    uses: ["p1"],
  }),
  plat("mon", "lunch", "Salade de la maison", { eaters: ["zoe", "paul"] }),
];
const PLAN: RepairPlanShape = {
  dishes: DISHES,
  preparations: [pot("p1", "Légumes rôtis")],
  // ⟳ 2026-09-13 · LOT 2 — REQUIS. Les cas de déroulé en déclarent de vraies.
  cooking_sessions: [{
    day: "sun",
    preparationIds: ["p1"],
    runThrough: "Four à 200, les légumes 35 minutes, puis en boîtes.",
  }],
};
/** La table des sessions du MÊME plan — `S1` désigne `cooking_sessions[0]`. */
const SESSIONS = buildRepairSessions({ sessions: PLAN.cooking_sessions });
const INDEX = buildRepairUnits({
  dishes: DISHES,
  expected: [
    { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    { memberId: "zoe", dayToken: "mon", slot: "lunch", date: "2026-09-14" },
    { memberId: "paul", dayToken: "mon", slot: "lunch", date: "2026-09-14" },
  ],
});
const U_ZOE = INDEX.units.find((u) => u.ownerId === "zoe" && u.slot === "dinner")!;
const U_PAUL = INDEX.units.find((u) => u.ownerId === "paul" && u.slot === "dinner")!;
const U_MAISON = INDEX.units.find((u) => u.slot === "lunch")!;

function defaut(o: Partial<RepairDefect> & { kind: RepairDefect["kind"] }): RepairDefect {
  return {
    cause: null,
    date: null,
    preparationId: null,
    sessionIndex: null,
    source: "gate",
    day: null,
    slot: null,
    dish: null,
    memberId: null,
    detail: "",
    repairable: true,
    magnitude: null,
    measure: null,
    ...o,
  };
}

/** Le périmètre nominal: seule l'assiette de Zoé est en défaut. */
const SCOPE = repairScopeOf({
  plan: PLAN,
  index: INDEX,
  sessions: SESSIONS,
  defects: [
    defaut({
      kind: "sizing",
      cause: "cell_energy_off",
      day: "sun",
      slot: "dinner",
      memberId: "zoe",
    }),
  ],
});

const clone = (p: RepairPlanShape): RepairPlanShape =>
  JSON.parse(JSON.stringify(p)) as RepairPlanShape;

/** Applique un patch décrit en brut, comme le modèle le rendrait. */
function applique(
  brut: unknown,
  o: {
    scope?: typeof SCOPE;
    baseVersion?: string | null;
    plan?: RepairPlanShape;
    index?: typeof INDEX;
    sessions?: typeof SESSIONS;
    dropped?: readonly { readonly unitId: string; readonly why: string }[];
  } = {},
) {
  const envelope = parseRepairPatch(brut);
  const index = o.index ?? INDEX;
  const plan = o.plan ?? PLAN;
  // ⚠️ LE MOTEUR DU PLAN EST SIMULÉ ICI PAR UNE LECTURE DIRECTE: ces cas
  // éprouvent l'APPLICATION, pas la lecture d'une recette. Le parseur réel est
  // épinglé par `plan_repair_patch_wiring_test.ts`.
  const pont = patchDishPayloads({ envelope, index });
  const dishes = new Map<string, RepairPlanDish>();
  for (const { unitId, payload: charge } of pont.payloads) {
    const unite = index.byId.get(unitId);
    if (unite === undefined) continue;
    dishes.set(unitId, {
      day: unite.dayToken,
      slot: unite.slot,
      title: String(charge.title ?? ""),
      memberId: unite.ownerId,
      ingredients: [],
      uses: (Array.isArray(charge.uses) ? charge.uses : []).map((
        x: unknown,
      ) => ({
        preparationId: String((x as Record<string, unknown>)?.preparation_id ?? ""),
      })),
    });
  }
  // ⛔ LE JOUR DE CUISSON TRAVERSE LE PARSEUR SIMULÉ. Le vrai
  // `parseGeneratedMeal` rend `cookOn` ; l'écraser ici par une constante
  // rendrait le refus `new_preparation_unscheduled` inatteignable par un test.
  const preparations = new Map<string, RepairPlanPreparation>(
    envelope.preparations.map((p) => {
      const brut = p as Record<string, unknown>;
      const jour = brut.cook_on === undefined && brut.cookOn === undefined
        ? "sun"
        : String(brut.cook_on ?? brut.cookOn ?? "");
      return [
        String(p.id ?? ""),
        pot(
          String(p.id ?? ""),
          String(p.title ?? ""),
          "courgette",
          jour === "" ? null : jour,
        ),
      ];
    }),
  );
  return {
    envelope,
    result: applyRepairPatch({
      best: plan,
      index,
      sessions: o.sessions ?? SESSIONS,
      dropped: o.dropped ?? [],
      scope: o.scope ?? SCOPE,
      baseVersion: o.baseVersion === undefined ? "req#r0" : o.baseVersion,
      envelope,
      dishes,
      preparations,
      clone,
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① UNE RÉPONSE PARTIELLE EST LE CONTRAT — PLUS DE `shorter_plan`
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① un patch d'UNE unité sur un plan de TROIS est appliqué", () => {
  // ⛔ LE GARDE-FOU RETIRÉ: `parsed.dishes.length < meal.dishes.length` rejetait
  // exactement ce cas-là — une réparation locale valide, jetée parce qu'elle
  // était courte.
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: U_ZOE.unitId, title: "Poisson revu", uses: [{ preparation_id: "p1" }] }],
    },
  });
  assertEquals(result.applied, true);
  assertEquals(result.units, [U_ZOE.unitId]);
  assertEquals(result.plan.dishes.length, 3, "aucun plat n'a disparu");
  assertEquals(result.plan.dishes[0].title, "Poisson revu");
  // ⛔ LES DEUX AUTRES SONT CELLES DU MEILLEUR PLAN, À L'IDENTIQUE.
  assertEquals(result.plan.dishes[1].title, "Poulet de Paul");
  assertEquals(result.plan.dishes[2].title, "Salade de la maison");
  // ⛔ ET L'ENTRÉE N'EST JAMAIS MUTÉE.
  assertEquals(PLAN.dishes[0].title, "Poisson de Zoé");
});

Deno.test("① bis — une unité du périmètre que le modèle n'a pas rendue reste EN L'ÉTAT", () => {
  const scopeDeux = repairScopeOf({
    plan: PLAN,
    index: INDEX,
    sessions: SESSIONS,
    defects: [
      defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: "zoe" }),
      defaut({ kind: "sizing", day: "mon", slot: "lunch", memberId: "zoe" }),
    ],
  });
  const { result } = applique({
    repair: { base_version: "req#r0", units: [{ unit_id: U_ZOE.unitId, title: "Poisson revu", uses: [{ preparation_id: "p1" }] }] },
  }, { scope: scopeDeux });
  assertEquals(result.applied, true);
  // ⚠️ CE N'EST PAS UN REJET — mais sans ce compte, « il a tout réparé » et
  // « il en a réparé une sur deux » se relisent pareil.
  assertEquals(result.untouched, [U_MAISON.unitId]);
  assertEquals(result.plan.dishes[2].title, "Salade de la maison");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② L'ATOMICITÉ — UNE OPÉRATION INVALIDE JETTE TOUT LE PATCH
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② une unité HORS PÉRIMÈTRE rejette le patch entier, pas seulement elle", () => {
  // ⛔ « PAS DE DEMI-PATCH LAISSÉ EN PLACE. » Un demi-patch est la seule façon
  // d'obtenir un plan que personne n'a mesuré.
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [
        { unit_id: U_ZOE.unitId, title: "Poisson revu", uses: [{ preparation_id: "p1" }] },
        { unit_id: U_PAUL.unitId, title: "Poulet emporté", uses: [{ preparation_id: "p1" }] },
      ],
    },
  });
  assertEquals(result.applied, false);
  assertEquals(result.units, []);
  assertEquals(result.rejections[0].why, "out_of_scope_unit");
  assertEquals(result.rejections[0].at, U_PAUL.unitId);
  // ⛔ MÊME LA MOITIÉ VALIDE N'EST PAS POSÉE.
  assertEquals(result.plan.dishes[0].title, "Poisson de Zoé");
});

Deno.test("② bis — un `unit_id` inconnu, un doublon, une version périmée: trois rejets nommés", () => {
  assertEquals(
    applique({ repair: { base_version: "req#r0", units: [{ unit_id: "U404", title: "X" }] } }).result
      .rejections[0].why,
    "unknown_unit",
  );
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        units: [
          { unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] },
          { unit_id: U_ZOE.unitId, title: "B", uses: [{ preparation_id: "p1" }] },
        ],
      },
    }).result.rejections[0].why,
    "duplicate_unit",
  );
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }],
      },
    }, { baseVersion: "req#r1" }).result.rejections[0].why,
    "base_version_stale",
  );
});

Deno.test("② ter — une version NON CITÉE et une version PÉRIMÉE ont deux motifs", () => {
  // ⟳ 2026-09-13 · LOT 2 — CE CAS A CHANGÉ DE SENS, ET C'EST LE LOT.
  //
  // ⛔ AVANT: un écho absent était ACCEPTÉ. La revue du 2026-09-12 le nomme —
  // « un `base_version` absent est accepté même si le serveur en attend un ;
  // seule une version présente mais différente est rejetée » — et demande de
  // ne plus présenter un contrôle CONDITIONNEL comme une vérification.
  //
  // ⛔ MAINTENANT: quand le serveur annonce une version, l'écho est EXIGÉ. Et
  // les deux manques restent DEUX faits: « il a lu une autre version » et « on
  // ne sait pas ce qu'il a lu » n'appellent pas la même lecture d'un journal.
  const absente = applique({
    repair: { units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }] },
  }, { baseVersion: "req#r1" });
  assertEquals(absente.result.applied, false);
  assertEquals(absente.result.rejections[0].why, "base_version_missing");

  const perimee = applique({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }],
    },
  }, { baseVersion: "req#r1" });
  assertEquals(perimee.result.applied, false);
  assertEquals(perimee.result.rejections[0].why, "base_version_stale");
  assertEquals(perimee.result.rejections[0].at, "req#r0");
});

Deno.test("② quater — LE CAS QUI PASSE: sans version annoncée, l'écho n'est pas exigé", () => {
  // ⛔ UNE GARDE QUI REFUSE AUSSI LE NOMINAL EST UNE GARDE CASSÉE. Les appelants
  // qui ne versionnent pas leur demande (`baseVersion: null`) gardent le
  // comportement d'avant, et c'est la seule porte laissée ouverte.
  const { result } = applique({
    repair: { units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }] },
  }, { baseVersion: null });
  assertEquals(result.applied, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LA CASSEROLE ISOLÉE — LE GESTE QUE LE PROMPT PROPOSAIT ET QUE LA FUSION
//    REFUSAIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ une NOUVELLE casserole déclarée dans le patch est acceptée, et le lot de l'autre reste", () => {
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_ZOE.unitId,
        title: "Poisson de Zoé, légumes à part",
        uses: [{ preparation_id: "p2" }],
      }],
      preparations: [{ id: "p2", title: "Légumes rôtis sans sel" }],
    },
  });
  assertEquals(result.applied, true);
  assertEquals(result.preparationsCreated, ["p2"]);
  assertEquals(result.preparationsReplaced, []);
  // ⛔ LE LOT DES AUTRES CONVIVES SURVIT: Paul tire toujours `p1`.
  assertEquals(result.plan.dishes[1].uses.map((x) => x.preparationId), ["p1"]);
  assert(result.plan.preparations.some((p) => p.id === "p1"));
  assert(result.plan.preparations.some((p) => p.id === "p2"));
  assertEquals(result.preparationsDropped, []);
  // ⛔ ⟳ 2026-09-13 · §2.1 — LE LOT NEUF EST CUISINÉ. Sans ce rattachement,
  // `final_plan_gate` rendrait `preparation_without_session` et la candidate
  // tomberait sur une cause que rien ne répare.
  assertEquals(result.preparationsScheduled, [{
    preparationId: "p2",
    sessionId: "S1",
  }]);
  assertEquals(result.sessionsRetooled, ["S1"]);
  assertEquals(result.plan.cooking_sessions[0].preparationIds, ["p1", "p2"]);
  // ⛔ ET RIEN D'AUTRE DE LA SESSION N'A BOUGÉ.
  assertEquals(result.plan.cooking_sessions[0].day, "sun");
  assertEquals(
    result.plan.cooking_sessions[0].runThrough,
    PLAN.cooking_sessions[0].runThrough,
  );
});

Deno.test("③ quater — un cook_on hors session se rattache au jour du plat, sans inventer de session", () => {
  // ⛔ CAMPAGNE 2026-09-14 tir1-s3 : le modèle a créé le lundi soir manquant
  // avec `cook_on: sun`, alors que les sessions étaient lun/mar. Refuser
  // jetait le patch entier. On NE crée pas de session mercredi ; on accroche
  // le lot à la session du plat (ici dimanche).
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_ZOE.unitId,
        title: "Poisson de Zoé, légumes à part",
        uses: [{ preparation_id: "p2" }],
      }],
      preparations: [{ id: "p2", title: "Légumes du mercredi", cook_on: "wed" }],
    },
  });
  assertEquals(result.applied, true);
  assertEquals(result.preparationsCreated, ["p2"]);
  assertEquals(result.preparationsScheduled, [{
    preparationId: "p2",
    sessionId: "S1",
  }]);
  assertEquals(result.plan.cooking_sessions[0].preparationIds, ["p1", "p2"]);
  assertEquals(result.plan.cooking_sessions[0].day, "sun");
});

Deno.test("③ quinquies — un lot NEUF SANS jour de cuisson se rattache au jour du plat", () => {
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_ZOE.unitId,
        title: "Poisson de Zoé, légumes à part",
        uses: [{ preparation_id: "p2" }],
      }],
      preparations: [{ id: "p2", title: "Légumes sans jour", cook_on: "" }],
    },
  });
  assertEquals(result.applied, true);
  assertEquals(result.preparationsScheduled, [{
    preparationId: "p2",
    sessionId: "S1",
  }]);
});

Deno.test("③ bis — la casserole devenue SANS CONSOMMATEUR est retirée, celle encore tirée reste", () => {
  // Zoé est la SEULE à tirer `p1` dans ce décor-ci: quand elle part sur `p2`,
  // `p1` n'a plus personne.
  const soloDishes: readonly Plat[] = [
    plat("sun", "dinner", "Poisson de Zoé", { owner: "zoe", eaters: ["zoe"], uses: ["p1"] }),
  ];
  const soloPlan: RepairPlanShape = {
    dishes: soloDishes,
    // ⟳ 2026-09-13 · §2.1 — LA SESSION EST NÉCESSAIRE POUR CRÉER UN LOT : un
    // lot neuf entre dans la session de son jour, et le lot retiré en sort.
    preparations: [pot("p1", "Légumes rôtis")],
    cooking_sessions: [{
      day: "sun",
      preparationIds: ["p1"],
      runThrough: "Les légumes au four, puis en boîtes.",
    }],
  };
  const soloSessions = buildRepairSessions({
    sessions: soloPlan.cooking_sessions,
  });
  const soloIndex = buildRepairUnits({
    dishes: soloDishes,
    expected: [{ memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" }],
  });
  const soloScope = repairScopeOf({
    plan: soloPlan,
    index: soloIndex,
    sessions: soloSessions,
    defects: [defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: "zoe" })],
  });
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: soloIndex.units[0].unitId,
        title: "Poisson revu",
        uses: [{ preparation_id: "p2" }],
      }],
      preparations: [{ id: "p2", title: "Autres légumes", cook_on: "sun" }],
    },
  }, {
    plan: soloPlan,
    index: soloIndex,
    scope: soloScope,
    sessions: soloSessions,
  });
  assertEquals(result.applied, true);
  assertEquals(result.preparationsDropped, ["p1"]);
  assertEquals(result.plan.preparations.map((p) => p.id), ["p2"]);
  // ⛔ ET LA SESSION SUIT LES DEUX MOUVEMENTS : `p1` n'y est plus (sinon
  // `session_cites_unknown`), `p2` y est (sinon `preparation_without_session`).
  assertEquals(
    result.plan.cooking_sessions[0].preparationIds,
    ["p2"],
    "la session cite exactement la casserole qui reste",
  );
  assertEquals(result.sessionsRetooled, ["S1"]);
  assertEquals(result.preparationsScheduled, [{
    preparationId: "p2",
    sessionId: "S1",
  }]);
});

Deno.test("③ ter — pointer sur une casserole INCONNUE ou HORS PÉRIMÈTRE est refusé", () => {
  // ⛔ LA CICATRICE `uses_mismatch`: une recette recollée sur la casserole de
  // quelqu'un d'autre. Le rejet en bloc a disparu; la VALIDATION DU GRAPHE le
  // remplace, et elle mord toujours ici.
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p9" }] }],
      },
    }).result.rejections[0].why,
    "uses_unknown_preparation",
  );
  // Une casserole qui EXISTE mais qu'aucun défaut n'a ouverte, et que cette
  // unité ne tirait pas.
  const autreDishes: readonly Plat[] = [
    plat("sun", "dinner", "Poisson de Zoé", { owner: "zoe", eaters: ["zoe"], uses: ["p1"] }),
    plat("mon", "lunch", "Salade", { eaters: ["zoe"], uses: ["p3"] }),
  ];
  const autrePlan: RepairPlanShape = {
    dishes: autreDishes,
    preparations: [pot("p1", "Légumes"), pot("p3", "Riz")],
    cooking_sessions: [],
  };
  const autreIndex = buildRepairUnits({
    dishes: autreDishes,
    expected: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
      { memberId: "zoe", dayToken: "mon", slot: "lunch", date: "2026-09-14" },
    ],
  });
  const autreScope = repairScopeOf({
    plan: autrePlan,
    index: autreIndex,
    sessions: SESSIONS,
    defects: [defaut({ kind: "sizing", day: "sun", slot: "dinner", memberId: "zoe" })],
  });
  const zoeUnit = autreIndex.units.find((x) => x.slot === "dinner")!;
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        units: [{ unit_id: zoeUnit.unitId, title: "A", uses: [{ preparation_id: "p3" }] }],
      },
    }, { plan: autrePlan, index: autreIndex, scope: autreScope }).result
      .rejections[0].why,
    "uses_out_of_scope",
  );
});

Deno.test("③ quater — un identifiant neuf DÉJÀ PRIS, et une casserole neuve que personne ne tire", () => {
  // ⛔ UNE COLLISION ÉCRASERAIT SILENCIEUSEMENT LE LOT DE QUELQU'UN D'AUTRE. Ici
  // `p1` existe: le redéclarer hors périmètre est un remplacement refusé.
  const horsPerimetre = repairScopeOf({
    plan: PLAN,
    index: INDEX,
    sessions: SESSIONS,
    defects: [defaut({ kind: "sizing", day: "mon", slot: "lunch", memberId: "zoe" })],
  });
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        units: [{ unit_id: U_MAISON.unitId, title: "Salade revue" }],
        preparations: [{ id: "p1", title: "Autre chose" }],
      },
    }, { scope: horsPerimetre }).result.rejections[0].why,
    "preparation_out_of_scope",
  );
  // ⛔ ET UNE CASSEROLE NEUVE ORPHELINE FERAIT CUISINER POUR RIEN.
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }],
        preparations: [{ id: "p7", title: "Jamais tirée" }],
      },
    }).result.rejections[0].why,
    "new_preparation_unused",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ L'UNITÉ RÉSERVÉE — ON LA REMPLIT, OU ON DIT QU'ELLE EST RESTÉE VIDE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ une unité RÉSERVÉE revenue vide rejette le patch, elle ne se perd pas", () => {
  const partielDishes = DISHES.slice(0, 1);
  const partielPlan: RepairPlanShape = {
    dishes: partielDishes,
    preparations: [pot("p1", "Légumes rôtis")],
    cooking_sessions: [],
  };
  const partielIndex = buildRepairUnits({
    dishes: partielDishes,
    expected: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
      { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
  });
  const partielScope = repairScopeOf({
    plan: partielPlan,
    index: partielIndex,
    sessions: SESSIONS,
    defects: [
      defaut({
        kind: "missing_meal",
        cause: "mouth_unfed",
        day: "sun",
        slot: "dinner",
        memberId: "paul",
      }),
    ],
  });
  const reservee = partielIndex.reserved[0];
  // Le modèle cite l'unité mais ne rend rien d'exploitable: le moteur du plan
  // n'aura pas de plat à donner. On ne laisse PAS la case vide en silence.
  const envelope = parseRepairPatch({
    repair: { base_version: "req#r0", units: [{ unit_id: reservee.unitId }] },
  });
  const vide = applyRepairPatch({
    best: partielPlan,
    index: partielIndex,
    sessions: SESSIONS,
    dropped: [],
    scope: partielScope,
    baseVersion: null,
    envelope,
    dishes: new Map(),
    preparations: new Map(),
    clone,
  });
  assertEquals(vide.applied, false);
  assertEquals(vide.rejections[0].why, "unit_without_content");

  // ⛔ LE CAS QUI PASSE, JUSTE À CÔTÉ: rempli, elle est AJOUTÉE au plan.
  const rempli = applique({
    repair: { base_version: "req#r0", units: [{ unit_id: reservee.unitId, title: "Assiette de Paul" }] },
  }, { plan: partielPlan, index: partielIndex, scope: partielScope });
  assertEquals(rempli.result.applied, true);
  assertEquals(rempli.result.created, [reservee.unitId]);
  assertEquals(rempli.result.plan.dishes.length, 2);
  assertEquals(rempli.result.plan.dishes[1].title, "Assiette de Paul");
  // ⛔ ET ELLE ATTERRIT AU BON ENDROIT, avec le propriétaire de l'unité.
  assertEquals(rempli.result.plan.dishes[1].slot, "dinner");
  assertEquals(
    (rempli.result.plan.dishes[1] as RepairPlanDish).memberId,
    "paul",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ L'IDENTITÉ EST INJECTÉE — UN PATCH NE DÉPLACE PAS UN REPAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑤ le jour, le moment et le propriétaire écrits par le modèle sont ÉCRASÉS", () => {
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_ZOE.unitId,
        title: "Poisson revu",
        // ⛔ LE MODÈLE ESSAIE DE DÉPLACER LE REPAS ET DE CHANGER SA BOUCHE.
        day: "fri",
        slot: "breakfast",
        for_member_id: "paul",
      }],
    },
  });
  const pont = patchDishPayloads({ envelope, index: INDEX });
  assertEquals(pont.payloads[0].payload.day, "sun");
  assertEquals(pont.payloads[0].payload.slot, "dinner");
  assertEquals(pont.payloads[0].payload.for_member_id, "zoe");
  assertEquals(pont.payloads[0].payload.unit_id, undefined);
  // ⛔ ET LA CHARGE PORTE SON `unit_id` À CÔTÉ, pas dedans: l'appelant parse
  // chaque unité SÉPARÉMENT (le plafond de plats du parseur amputait un patch
  // de huit unités), et il doit savoir laquelle il vient de lire.
  assertEquals(pont.payloads[0].unitId, U_ZOE.unitId);
  // ⛔ ET L'ADRESSE DE RETOUR EST UNIQUE: deux unités ne peuvent pas rendre la
  // même clé sans qu'on le voie.
  // ⟳ 2026-09-13 — LA CLÉ PORTE AUSSI « PLAT OU COMPLÉMENT ». Un complément et
  // un plat dédié au MÊME créneau pour la MÊME bouche sont deux unités que le
  // périmètre nomme séparément ; les confondre rejetait un patch légitime,
  // mesuré sur un appel réel.
  assertEquals(pont.addressToUnit.get("sun|dinner|zoe|plate"), U_ZOE.unitId);
  assertEquals(pont.dropped, []);
});

Deno.test("⑤ bis — un plat de la MAISON ne reçoit pas de propriétaire", () => {
  const envelope = parseRepairPatch({
    repair: { base_version: "req#r0", units: [{ unit_id: U_MAISON.unitId, title: "Salade revue", for_member_id: "zoe" }] },
  });
  const pont = patchDishPayloads({ envelope, index: INDEX });
  // ⛔ LUI EN DONNER UN LE TRANSFORMERAIT EN PLAT DÉDIÉ — donc retirerait sa
  // part à tous les autres convives.
  assertEquals(pont.payloads[0].payload.for_member_id, undefined);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LES TALONS DE CASSEROLE — POUR QUE LES `uses` RÉSOLVENT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑥ les casseroles non redéclarées partent en talons, les redéclarées non", () => {
  const talons = preparationStubsFor({
    preparations: [pot("p1", "Légumes"), pot("p3", "Riz")],
    declaredIds: ["p3"],
  });
  assertEquals(talons.map((t) => t.id), ["p1"]);
  // ⛔ AU MOINS UNE PART: le moteur jette une casserole dont `servings_made` est
  // illisible, et le talon disparaîtrait avec — puis le `uses` avec lui.
  assertEquals(talons[0].servings_made, 2);
  const sansParts = preparationStubsFor({
    preparations: [{ id: "p5", title: "X", servingsMade: null, ingredients: [] }],
    declaredIds: [],
  });
  assertEquals(sansParts[0].servings_made, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE TEXTE SOURCE FUSIONNÉ — UNE SEULE VERSION POUR TOUS SES LECTEURS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ le texte source suit la FUSION, pas la candidate", () => {
  // ⛔ LE DÉFAUT FERMÉ: `mealSourceText` devenait la réponse brute du patch —
  // deux plats. `extractMemberPortions`, `extractExplanation` et
  // `countWhyRuleAttributions` relisaient donc un plan amputé de sept plats.
  const bestText = JSON.stringify({
    dishes: [
      { day: "sun", slot: "dinner", for_member_id: "zoe", title: "Poisson de Zoé", why: "A" },
      { day: "sun", slot: "dinner", for_member_id: "paul", title: "Poulet de Paul", why: "B" },
      { day: "mon", slot: "lunch", title: "Salade de la maison", why: "C" },
    ],
    preparations: [{ id: "p1", title: "Légumes rôtis" }],
    member_portions: [
      { member_id: "zoe", portion_note: "230 g de poisson" },
      { member_id: "paul", portion_note: "260 g de poulet" },
    ],
    explanation: "la semaine tient sur deux cuissons",
  });
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_ZOE.unitId,
        title: "Poisson revu",
        why: "A2",
        uses: [{ preparation_id: "p2" }],
      }],
      preparations: [{ id: "p2", title: "Légumes rôtis sans sel" }],
    },
  });
  const fusion = fusedSourceText({
    bestText,
    envelope,
    index: INDEX,
    sessions: SESSIONS,
    rewrittenSessionIds: [],
    appliedUnitIds: [U_ZOE.unitId],
    appliedPreparationIds: ["p2"],
    droppedPreparationIds: [],
    scheduledPreparations: [],
  });
  const relu = JSON.parse(fusion.text) as Record<string, unknown>;
  const dishes = relu.dishes as Record<string, unknown>[];
  assertEquals(dishes.length, 3, "les trois plats sont là");
  assertEquals(dishes[0].title, "Poisson revu");
  assertEquals(dishes[0].why, "A2");
  assertEquals(dishes[0].day, "sun");
  assertEquals(dishes[0].for_member_id, "zoe");
  // ⛔ LES DEUX AUTRES SONT INTACTS.
  assertEquals(dishes[1].title, "Poulet de Paul");
  assertEquals(dishes[2].why, "C");
  // ⛔ LA NOUVELLE CASSEROLE EST ÉCRITE, L'ANCIENNE RESTE.
  assertEquals((relu.preparations as Record<string, unknown>[]).length, 2);
  // ⛔ LA PART DE ZOÉ TOMBE — elle décrivait une assiette qui n'existe plus.
  //    Celle de Paul reste: son plat n'a pas bougé.
  assertEquals(
    (relu.member_portions as Record<string, unknown>[]).map((p) => p.member_id),
    ["paul"],
  );
  assertEquals(fusion.counts.portions_dropped, 1);
  assertEquals(fusion.counts.dishes_replaced, 1);
  assertEquals(fusion.counts.unreadable, false);
  // ⚠️ L'`explanation` DU PLAN RESTE, ET C'EST UNE DÉCISION: le `why` de chaque
  // plat voyage avec le patch; faire réécrire la logique de la semaine pour une
  // correction locale ferait réécrire le plan entier.
  assertEquals(relu.explanation, "la semaine tient sur deux cuissons");
});

Deno.test("⑦ bis — un texte de départ illisible est rendu TEL QUEL, et ça se dit", () => {
  const fusion = fusedSourceText({
    bestText: "pas du json",
    envelope: parseRepairPatch({ repair: { base_version: "req#r0", units: [] } }),
    index: INDEX,
    sessions: SESSIONS,
    rewrittenSessionIds: [],
    appliedUnitIds: [],
    appliedPreparationIds: [],
    droppedPreparationIds: [],
    scheduledPreparations: [],
  });
  assertEquals(fusion.text, "pas du json");
  assertEquals(fusion.counts.unreadable, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LE CONTRAT ÉCRIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑧ la consigne nomme les unités autorisées, et l'échappatoire", () => {
  const lignes = repairPatchContractLines({
    baseVersion: "req#r0",
    scope: SCOPE,
  }).join("\n");
  assert(lignes.includes(U_ZOE.unitId), lignes);
  assert(!lignes.includes(U_PAUL.unitId), lignes);
  assert(lignes.includes("never means empty"), lignes);
  assert(lignes.includes("does not move a meal"), lignes);
  assert(lignes.includes("Do not send a shopping list"), lignes);
});

Deno.test("⑧ bis — VIDE et ILLISIBLE sont deux faits, pas un seul", () => {
  // ⟳ 2026-09-13 · LOT 2 — `empty_patch` A QUITTÉ `errors`, ET C'EST LE POINT.
  //
  // ⛔ Depuis ce lot, une erreur de lecture rejette le patch ENTIER. Laisser
  // « le modèle n'a rien déclaré » dans la même liste ferait alors rendre
  // `unreadable` à une réponse parfaitement lisible qui ne change rien — deux
  // faits différents sous un seul motif, et c'est ce que la revue reprochait à
  // l'ancien code dans l'autre sens.
  assertEquals(parseRepairPatch("nope").errors, ["not_an_object"]);
  assertEquals(parseRepairPatch("nope").empty, true);

  const rien = parseRepairPatch({ repair: {} });
  assertEquals(rien.errors, []);
  assertEquals(rien.empty, true);

  // ⛔ UNE ENTRÉE PRÉSENTE ET INVALIDE EST UNE ERREUR, elle.
  const sansId = parseRepairPatch({ units: [{ title: "sans id" }] });
  assertEquals(sansId.errors, ["unit_without_id"]);
  assertEquals(sansId.empty, true);

  // ⛔ ET LES TROIS FAMILLES SONT LUES PAREIL.
  assertEquals(
    parseRepairPatch({ preparations: [{ title: "sans id" }] }).errors,
    ["preparation_without_id"],
  );
  assertEquals(
    parseRepairPatch({ sessions: [{ run_through: "x" }] }).errors,
    ["session_without_id"],
  );
  assertEquals(
    parseRepairPatch({ sessions: [{ session_id: "S1", run_through: "  " }] })
      .errors,
    ["session_without_text"],
  );

  // ⚠️ L'OBJET NU EST ACCEPTÉ: un modèle qui rend `{ "units": … }` sans la clé
  // d'enveloppe a fait ce qu'on lui demandait.
  assertEquals(
    parseRepairPatch({ units: [{ unit_id: "U1", title: "A" }] }).units.length,
    1,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ ⟳ 2026-09-13 · LOT 2 — LE DÉROULÉ D'UNE SESSION, CORRIGÉ SANS TOUCHER AUX
//    RECETTES
// ═══════════════════════════════════════════════════════════════════════════

/** Le périmètre d'une session SEULE en défaut — aucune unité, aucune casserole. */
const SCOPE_SESSION = repairScopeOf({
  plan: PLAN,
  index: INDEX,
  sessions: SESSIONS,
  defects: [
    defaut({
      kind: "safety",
      cause: "member_exclusion_served",
      sessionIndex: 0,
      detail: "the run-through names a food somebody must not eat",
    }),
  ],
});

Deno.test("⑨ une session SEULE en défaut ouvre un périmètre, et rien d'autre", () => {
  // ⛔ LE DÉFAUT FERMÉ: la garde d'amont ne lisait que `unitIds` et
  // `preparationIds`. Une consigne de cuisine dangereuse, seule en défaut,
  // rendait « périmètre vide » — donc aucune réparation ne partait jamais.
  assertEquals(SCOPE_SESSION.sessionIds, ["S1"]);
  assertEquals(SCOPE_SESSION.counts.sessions, 1);
  // ⛔ ET LES RECETTES NE SONT PAS OUVERTES. Un texte se corrige sur sa phrase;
  // ouvrir les casseroles ferait recomposer des assiettes saines.
  assertEquals(SCOPE_SESSION.unitIds, []);
  assertEquals(SCOPE_SESSION.preparationIds, []);
});

Deno.test("⑨ bis — le patch remplace le TEXTE, et laisse tout le reste intact", () => {
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      sessions: [{
        session_id: "S1",
        run_through: "Four à 200, les légumes 35 minutes, puis en boîtes propres.",
      }],
    },
  }, { scope: SCOPE_SESSION });
  assertEquals(result.applied, true);
  assertEquals(result.sessionsRewritten, ["S1"]);
  assertEquals(
    result.plan.cooking_sessions[0].runThrough,
    "Four à 200, les légumes 35 minutes, puis en boîtes propres.",
  );
  // ⛔ LE JOUR ET LES CASSEROLES NE BOUGENT PAS: un patch de texte ne déplace
  // pas une cuisson et ne change pas ce qu'on y fait.
  assertEquals(result.plan.cooking_sessions[0].day, "sun");
  assertEquals(result.plan.cooking_sessions[0].preparationIds, ["p1"]);
  // ⛔ ET AUCUNE RECETTE N'EST TOUCHÉE.
  assertEquals(result.units, []);
  assertEquals(result.plan.dishes[0].title, "Poisson de Zoé");
  assertEquals(result.plan.preparations[0].title, "Légumes rôtis");
  // ⛔ L'ENTRÉE N'EST JAMAIS MUTÉE.
  assertEquals(
    PLAN.cooking_sessions[0].runThrough,
    "Four à 200, les légumes 35 minutes, puis en boîtes.",
  );
});

Deno.test("⑨ ter — une session INCONNUE, HORS PÉRIMÈTRE ou EN DOUBLE est refusée", () => {
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        sessions: [{ session_id: "S9", run_through: "x" }],
      },
    }, { scope: SCOPE_SESSION }).result.rejections[0].why,
    "unknown_session",
  );
  // ⛔ HORS PÉRIMÈTRE: la session existe, mais ce n'est pas celle en défaut.
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        sessions: [{ session_id: "S1", run_through: "x" }],
      },
    }, { scope: SCOPE }).result.rejections[0].why,
    "out_of_scope_session",
  );
  assertEquals(
    applique({
      repair: {
        base_version: "req#r0",
        sessions: [
          { session_id: "S1", run_through: "a" },
          { session_id: "S1", run_through: "b" },
        ],
      },
    }, { scope: SCOPE_SESSION }).result.rejections[0].why,
    "duplicate_session",
  );
});

Deno.test("⑨ quater — un déroulé VIDE est une opération invalide, pas une omission", () => {
  // ⛔ L'ORDRE DES GESTES EST LA SEULE CHOSE QUI RENDE UN DIMANCHE EXÉCUTABLE.
  // Une entrée présente et vide effacerait la session; la consigne dit qu'un
  // tableau OMIS vaut inchangé, donc l'omission est le geste gratuit.
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      sessions: [{ session_id: "S1", run_through: "   " }],
    },
  }, { scope: SCOPE_SESSION });
  assertEquals(result.applied, false);
  assertEquals(result.rejections[0].why, "unreadable");
  assertEquals(result.rejections[0].at, "session_without_text");
});

Deno.test("⑨ quinquies — le déroulé corrigé se retrouve dans le TEXTE SOURCE", () => {
  // ⛔ SANS CE CHEMIN, LA CORRECTION NE SURVIT PAS À LA FUSION. Le plan
  // structuré porterait le nouveau texte, `mealSourceText` l'ancien — et c'est
  // lui que relisent les parts, l'explication et la ceinture finale.
  const bestText = JSON.stringify({
    dishes: [{ day: "sun", slot: "dinner", for_member_id: "zoe", title: "Poisson de Zoé" }],
    preparations: [{ id: "p1", title: "Légumes rôtis" }],
    cooking_sessions: [{
      day: "sun",
      preparation_ids: ["p1"],
      run_through: "Four à 200, les légumes 35 minutes, puis en boîtes.",
    }],
  });
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      sessions: [{ session_id: "S1", run_through: "Déroulé corrigé." }],
    },
  });
  const fusion = fusedSourceText({
    bestText,
    envelope,
    index: INDEX,
    sessions: SESSIONS,
    rewrittenSessionIds: ["S1"],
    appliedUnitIds: [],
    appliedPreparationIds: [],
    droppedPreparationIds: [],
    scheduledPreparations: [],
  });
  const relu = JSON.parse(fusion.text);
  assertEquals(relu.cooking_sessions[0].run_through, "Déroulé corrigé.");
  // ⛔ ET LE RESTE DE LA LIGNE SURVIT: le jour et les casseroles ne sont pas
  // réécrits par ce geste.
  assertEquals(relu.cooking_sessions[0].day, "sun");
  assertEquals(relu.cooking_sessions[0].preparation_ids, ["p1"]);
  assertEquals(fusion.counts.sessions_rewritten, 1);
});

Deno.test("⑨ sexies — le lot NEUF entre dans la session de son jour DANS LE TEXTE SOURCE", () => {
  // ⛔ SANS CE CHEMIN, LA FUSION REND DEUX DIMANCHES. Le plan structuré
  // cuisinerait `p2`, la source canonique — que relisent les parts, la prose et
  // l'aperçu — ne la cuisinerait pas, et l'écran montrerait une casserole que
  // personne ne prépare.
  const bestText = JSON.stringify({
    dishes: [{ day: "sun", slot: "dinner", for_member_id: "zoe", title: "Poisson de Zoé" }],
    preparations: [{ id: "p1", title: "Légumes rôtis" }],
    cooking_sessions: [{
      day: "sun",
      preparation_ids: ["p1"],
      run_through: "Four à 200, les légumes 35 minutes, puis en boîtes.",
    }],
  });
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_ZOE.unitId,
        title: "Poisson de Zoé, légumes à part",
        uses: [{ preparation_id: "p2" }],
      }],
      preparations: [{ id: "p2", title: "Légumes sans sel", cook_on: "sun" }],
    },
  });
  const fusion = fusedSourceText({
    bestText,
    envelope,
    index: INDEX,
    sessions: SESSIONS,
    rewrittenSessionIds: [],
    appliedUnitIds: [U_ZOE.unitId],
    appliedPreparationIds: ["p2"],
    droppedPreparationIds: [],
    scheduledPreparations: [{ preparationId: "p2", sessionId: "S1" }],
  });
  const relu = JSON.parse(fusion.text);
  assertEquals(relu.cooking_sessions[0].preparation_ids, ["p1", "p2"]);
  assertEquals(fusion.counts.sessions_retooled, 1);
  // ⛔ ET LE DÉROULÉ N'A PAS BOUGÉ : on n'a touché qu'à la LISTE.
  assertEquals(
    relu.cooking_sessions[0].run_through,
    "Four à 200, les légumes 35 minutes, puis en boîtes.",
  );
  assertEquals(fusion.counts.sessions_rewritten, 0);
});

Deno.test("⑨ septies — un lot RETIRÉ sort des sessions du TEXTE SOURCE", () => {
  // ⛔ SINON `session_cites_unknown`, une cause que rien ne répare : la session
  // citerait une casserole que la fusion vient de supprimer.
  const bestText = JSON.stringify({
    dishes: [{ day: "sun", slot: "dinner", for_member_id: "zoe", title: "Poisson de Zoé" }],
    preparations: [{ id: "p1", title: "Légumes rôtis" }],
    cooking_sessions: [{ day: "sun", preparation_ids: ["p1"], run_through: "Au four." }],
  });
  const fusion = fusedSourceText({
    bestText,
    envelope: parseRepairPatch({ repair: { base_version: "req#r0", units: [] } }),
    index: INDEX,
    sessions: SESSIONS,
    rewrittenSessionIds: [],
    appliedUnitIds: [],
    appliedPreparationIds: [],
    droppedPreparationIds: ["p1"],
    scheduledPreparations: [],
  });
  const relu = JSON.parse(fusion.text);
  assertEquals(relu.cooking_sessions[0].preparation_ids, []);
  assertEquals(fusion.counts.sessions_retooled, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ octies — ⟳ 2026-09-13 · §2.2 : UN COMPLÉMENT S'AJOUTE, IL NE REMPLACE PAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑨ octies — une unité CRÉÉE à l'adresse d'un plat existant s'AJOUTE", () => {
  // ⛔ LE DÉFAUT FERMÉ, REPRODUIT DE BOUT EN BOUT (tir `iso7`, 2026-09-13). Un
  // COMPLÉMENT porte la MÊME adresse que l'assiette qu'il complète — même
  // bouche, même jour, même moment : c'est sa définition. La recherche par
  // adresse trouvait donc l'assiette existante et la REMPLAÇAIT.
  //
  // ⛔ ET LES DEUX MOITIÉS DE LA FUSION SE CONTREDISAIENT : `applyRepairPatch`
  // POUSSE une unité créée, `fusedSourceText` la REMPLAÇAIT. Plan structuré à
  // deux plats, source canonique à un seul — et c'est la source que relisent
  // les parts, la prose et l'aperçu. Mesuré : la bouche perdait son déjeuner,
  // 38 défauts pour 6, `safety_regression`.
  const complementCell = {
    memberId: "zoe",
    dayToken: "sun",
    slot: "dinner",
    date: "2026-09-13",
  };
  const indexAvecComplement = buildRepairUnits({
    dishes: DISHES,
    expected: [
      { memberId: "zoe", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
      { memberId: "paul", dayToken: "sun", slot: "dinner", date: "2026-09-13" },
    ],
    complements: [complementCell],
  });
  const uComplement = indexAvecComplement.units.find((u) => u.isComplement)!;
  assertEquals(uComplement.dishIndex, null, "un complément est une unité RÉSERVÉE");
  assertEquals(uComplement.ownerId, "zoe");
  const bestText = JSON.stringify({
    dishes: [
      { day: "sun", slot: "dinner", for_member_id: "zoe", title: "Poisson de Zoé" },
      { day: "sun", slot: "dinner", for_member_id: "paul", title: "Poulet de Paul" },
    ],
    preparations: [{ id: "p1", title: "Légumes rôtis" }],
    cooking_sessions: [{ day: "sun", preparation_ids: ["p1"], run_through: "Au four." }],
  });
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: uComplement.unitId, title: "Petite assiette en plus" }],
    },
  });
  const fusion = fusedSourceText({
    bestText,
    envelope,
    index: indexAvecComplement,
    sessions: SESSIONS,
    rewrittenSessionIds: [],
    appliedUnitIds: [uComplement.unitId],
    appliedPreparationIds: [],
    droppedPreparationIds: [],
    scheduledPreparations: [],
  });
  assertEquals(fusion.counts.dishes_added, 1, "le complément s'AJOUTE");
  assertEquals(fusion.counts.dishes_replaced, 0, "il ne remplace RIEN");
  const relu = JSON.parse(fusion.text) as { dishes: Record<string, unknown>[] };
  assertEquals(relu.dishes.length, 3, "les deux assiettes d'origine sont là, plus le complément");
  assertEquals(relu.dishes[0].title, "Poisson de Zoé", "l'assiette complétée est INTACTE");
  assertEquals(relu.dishes[2].title, "Petite assiette en plus");
  assertEquals(relu.dishes[2].for_member_id, "zoe");
});

Deno.test("⑨ nonies — LE CAS QUI PASSE: une unité PRÉSENTE est toujours remplacée en place", () => {
  // ⛔ UNE GARDE A BESOIN D'UN CAS QUI PASSE. Sans lui, « on ajoute toujours »
  // serait indiscernable de la règle voulue — et le plan porterait deux fois
  // le même repas à chaque réparation.
  const bestText = JSON.stringify({
    dishes: [{ day: "sun", slot: "dinner", for_member_id: "zoe", title: "Poisson de Zoé" }],
    preparations: [{ id: "p1", title: "Légumes rôtis" }],
    cooking_sessions: [{ day: "sun", preparation_ids: ["p1"], run_through: "Au four." }],
  });
  const fusion = fusedSourceText({
    bestText,
    envelope: parseRepairPatch({
      repair: {
        base_version: "req#r0",
        units: [{ unit_id: U_ZOE.unitId, title: "Poisson revu" }],
      },
    }),
    index: INDEX,
    sessions: SESSIONS,
    rewrittenSessionIds: [],
    appliedUnitIds: [U_ZOE.unitId],
    appliedPreparationIds: [],
    droppedPreparationIds: [],
    scheduledPreparations: [],
  });
  assertEquals(fusion.counts.dishes_replaced, 1);
  assertEquals(fusion.counts.dishes_added, 0);
  const relu = JSON.parse(fusion.text) as { dishes: Record<string, unknown>[] };
  assertEquals(relu.dishes.length, 1, "aucun doublon");
  assertEquals(relu.dishes[0].title, "Poisson revu");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ ⟳ 2026-09-13 · LOT 2 — L'ATOMICITÉ, SUR LES TROIS FAMILLES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑩ une bonne unité + une opération `null`: le patch entier est jeté", () => {
  // ⛔ LA SONDE DE LA REVUE, REJOUÉE (P2 §4). Elle rendait
  // `parseErrors: ["unit_not_an_object"]`, `applied: true`, `rejections: []`,
  // et `title: "Changed"` — un demi-patch appliqué.
  const { envelope, result } = applique({
    repair: {
      base_version: "req#r0",
      units: [
        { unit_id: U_ZOE.unitId, title: "Changed", uses: [{ preparation_id: "p1" }] },
        null,
      ],
    },
  });
  assertEquals(envelope.errors, ["unit_not_an_object"]);
  assertEquals(result.applied, false);
  assertEquals(result.rejections[0].why, "unreadable");
  assertEquals(result.plan.dishes[0].title, "Poisson de Zoé");
});

Deno.test("⑩ bis — une PRÉPARATION explicitement rendue et non parsée rejette tout", () => {
  // ⛔ ELLE ÉTAIT SAUTÉE À L'APPLICATION: le patch se disait appliqué et
  // l'ancienne recette restait. « Le modèle a réparé » et « rien n'a changé »
  // rendaient la même trace.
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }],
      preparations: [{ id: "p1", title: "Légumes revus" }],
    },
  });
  const result = applyRepairPatch({
    best: PLAN,
    index: INDEX,
    sessions: SESSIONS,
    dropped: [],
    scope: SCOPE,
    baseVersion: "req#r0",
    envelope,
    dishes: new Map([[U_ZOE.unitId, {
      day: "sun",
      slot: "dinner",
      title: "A",
      memberId: "zoe",
      ingredients: [],
      uses: [{ preparationId: "p1" }],
    }]]),
    // ⛔ LA CARTE DES PRÉPARATIONS EST VIDE: le moteur n'a pas su lire `p1`.
    preparations: new Map(),
    clone,
  });
  assertEquals(result.applied, false);
  assertEquals(result.rejections[0].why, "preparation_not_parsed");
  assertEquals(result.rejections[0].at, "p1");
});

Deno.test("⑩ ter — une charge ÉCARTÉE avant le parseur rejette le patch", () => {
  // ⛔ `patchDishPayloads` jette une unité inconnue ou une adresse ambiguë, et
  // personne ne relayait ce fait: le patch s'appliquait amputé, en silence.
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: U_ZOE.unitId, title: "A", uses: [{ preparation_id: "p1" }] }],
    },
  }, { dropped: [{ unitId: "U9", why: "ambiguous_address" }] });
  assertEquals(result.applied, false);
  assertEquals(result.rejections[0].why, "payload_dropped");
  assertEquals(result.rejections[0].at, "ambiguous_address");
});

Deno.test("⑩ quater — LE CAS QUI PASSE: un tableau OMIS ne rejette rien", () => {
  // ⛔ UNE GARDE QUI REFUSE AUSSI LE NOMINAL EST UNE GARDE CASSÉE. Omettre
  // `preparations` et `sessions` est le contrat: seules les opérations
  // PRÉSENTES sont appliquées.
  const { envelope, result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: U_ZOE.unitId, title: "Revu", uses: [{ preparation_id: "p1" }] }],
    },
  });
  assertEquals(envelope.errors, []);
  assertEquals(envelope.empty, false);
  assertEquals(result.applied, true);
  assertEquals(result.sessionsRewritten, []);
  assertEquals(result.preparationsReplaced, []);
  assertEquals(result.plan.preparations[0].title, "Légumes rôtis");
  assertEquals(
    result.plan.cooking_sessions[0].runThrough,
    "Four à 200, les légumes 35 minutes, puis en boîtes.",
  );
});

Deno.test("⑩ quinquies — un patch entièrement VIDE n'est pas une réparation", () => {
  const { result } = applique({ repair: { base_version: "req#r0" } });
  assertEquals(result.applied, false);
  assertEquals(result.rejections[0].why, "nothing_applied");
});

Deno.test("⑪ deux plats DÉDIÉS au même créneau: la bonne unité change, l'autre non", () => {
  // ⛔ LE DÉFAUT ② DE LA REVUE DU 2026-09-12, GARDÉ SOUS ÉPINGLE.
  // `cellAddress(day, slot)` ignorait le propriétaire : la fusion gardait le
  // premier plat trouvé, et une portion se transférait d'une bouche à l'autre.
  const scopePaul = repairScopeOf({
    plan: PLAN,
    index: INDEX,
    sessions: SESSIONS,
    defects: [
      defaut({
        kind: "sizing",
        cause: "cell_energy_off",
        day: "sun",
        slot: "dinner",
        memberId: "paul",
      }),
    ],
  });
  assertEquals(scopePaul.unitIds, [U_PAUL.unitId]);
  const { result } = applique({
    repair: {
      base_version: "req#r0",
      units: [{
        unit_id: U_PAUL.unitId,
        title: "Poulet de Paul, revu",
        uses: [{ preparation_id: "p1" }],
      }],
    },
  }, { scope: scopePaul });
  assertEquals(result.applied, true);
  assertEquals(result.units, [U_PAUL.unitId]);
  // ⛔ ET L'ASSIETTE DE ZOÉ, AU MÊME JOUR ET AU MÊME MOMENT, NE BOUGE PAS.
  assertEquals(result.plan.dishes[0].title, "Poisson de Zoé");
  assertEquals(result.plan.dishes[1].title, "Poulet de Paul, revu");
  assertEquals(result.plan.dishes.length, 3, "aucune portion n'a disparu");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑫ ⟳ 2026-09-13 · LOT 3 §3.3 — LE JOUR DE CUISSON NE SE DEMANDE PAS, IL SE
//    REMET
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ MESURÉ SUR LE PREMIER PARCOURS HYBRIDE PAYANT. Le modèle a rendu un patch
// parfaitement conforme — racine `{"repair":…}`, `base_version` échoé, sept
// unités complètes — et une préparation SANS `cook_on`, parce que le schéma ne
// le nommait pas. La casserole a perdu sa session : `cook_day_unplaced: 6`,
// `session_day_mismatch: 3`, `cell_without_portion: 6`, candidate rejetée.

Deno.test("⑫ une casserole existante rendue SANS jour récupère celui du plan", () => {
  const plan: RepairPlanShape = {
    dishes: [],
    preparations: [{
      id: "p1",
      title: "Légumes rôtis",
      servingsMade: 2,
      cookOn: "sat",
      ingredients: [],
    }],
    cooking_sessions: [],
  };
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      preparations: [{ id: "p1", title: "Légumes revus", servings_made: 2 }],
    },
  });
  const pont = patchPreparationPayloads({
    envelope,
    preparations: plan.preparations,
  });
  assertEquals(pont.payloads.length, 1);
  assertEquals(pont.payloads[0].cook_on, "sat");
  assertEquals(pont.counts.cook_on_restored, 1);
  // ⛔ ET LE MANQUE SE COMPTE. Sans ce nombre, « le modèle l'écrit » et « on le
  // remet pour lui » rendent la même trace, et personne ne saurait quand la
  // consigne a cessé de suffire.
  assertEquals(pont.counts.cook_on_missing, 1);
});

Deno.test("⑫ bis — un jour rendu par le modèle est ÉCRASÉ par celui du plan", () => {
  // ⛔ UN PATCH NE DÉPLACE PAS UNE CUISSON. C'est la même règle que pour le
  // jour, le moment et le propriétaire d'une unité, et elle tient par
  // construction plutôt que par consigne.
  const plan: RepairPlanShape = {
    dishes: [],
    preparations: [{ id: "p1", title: "Légumes", servingsMade: 2, cookOn: "sat", ingredients: [] }],
    cooking_sessions: [],
  };
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      preparations: [{ id: "p1", title: "Légumes", servings_made: 2, cook_on: "wed" }],
    },
  });
  const pont = patchPreparationPayloads({ envelope, preparations: plan.preparations });
  assertEquals(pont.payloads[0].cook_on, "sat");
  assertEquals(pont.counts.cook_on_missing, 0);
  assertEquals(pont.counts.cook_on_restored, 1);
});

Deno.test("⑫ ter — une casserole NEUVE garde le sien: il n'y a rien à remettre", () => {
  const plan: RepairPlanShape = {
    dishes: [],
    preparations: [{ id: "p1", title: "Légumes", servingsMade: 2, cookOn: "sat", ingredients: [] }],
    cooking_sessions: [],
  };
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      preparations: [{ id: "p2", title: "Riz", servings_made: 2, cook_on: "sun" }],
    },
  });
  const pont = patchPreparationPayloads({ envelope, preparations: plan.preparations });
  assertEquals(pont.payloads[0].cook_on, "sun");
  assertEquals(pont.counts.created, 1);
  assertEquals(pont.counts.cook_on_restored, 0);
});

Deno.test("⑫ quater — le contrat NOMME `cook_on`, il ne compte pas dessus seul", () => {
  // ⚠️ LES DEUX MOITIÉS. Le schéma le demande (pour une casserole neuve, que
  // le serveur ne peut pas deviner) ET le serveur le remet (pour une casserole
  // existante, qu'il connaît). Épingler une seule des deux laisserait l'autre
  // se perdre au premier lot.
  const lignes = REPAIR_PATCH_SCHEMA_LINES.join("\n");
  assert(lignes.includes('"cook_on"'), "le schéma ne nomme pas le jour de cuisson");
  assert(
    lignes.includes("the day it is cooked"),
    "la règle qui dit que le jour ne bouge pas a disparu",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 2 § 2.3 ③ — PATCH MAL FORMÉ, PUIS PATCH VALIDE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE CE CAS AJOUTE AU § ⑩. Le § ⑩ éprouve l'atomicité sur UN titre
// (`plan.dishes[0].title` n'a pas bougé) ; un rejet qui perdrait une casserole
// ou réécrirait un déroulé de session passerait sous cette assertion-là. Ici le
// plan rendu est comparé ENTIER à celui d'entrée, et la suite est jouée
// jusqu'au bout : le patch jeté coûte un appel, le suivant s'applique sur le
// MEILLEUR plan, et le troisième appel n'existe pas.

/** Le seul défaut du décor: l'assiette de Zoé, celle que `SCOPE` ouvre. */
const DEFAUT_ZOE = defaut({
  kind: "sizing",
  cause: "cell_energy_off",
  day: "sun",
  slot: "dinner",
  memberId: "zoe",
});

function decide(callsMade: number, lastVerdict: "no_improvement" | null) {
  return planRepairDecision({
    defects: [DEFAUT_ZOE],
    // ⟳ 2026-09-15 — cette épreuve teste la MÉCANIQUE du patch, pas la
    // politique : on déclare le défaut bloquant pour que l'appel parte.
    blocking: 1,
    callsMade,
    maxCalls: PLAN_REPAIR_MAX_CALLS,
    attemptsUsed: 0,
    maxAttempts: 9,
    remainingMs: 300_000,
    lastVerdict,
  });
}

Deno.test("§ 2.3 ③ — un patch mal formé puis un valide: rejet ENTIER, application sur la MEILLEURE version, deux appels", () => {
  const intact = JSON.stringify(PLAN);
  let appels = 0;

  // ── TOUR 1 : une bonne opération, et une opération invalide à côté ────────
  const t1 = decide(appels, null);
  assertEquals(t1.call, true);
  appels += 1;
  const { result: premier } = applique({
    repair: {
      base_version: "req#r0",
      units: [
        {
          unit_id: U_ZOE.unitId,
          title: "Poisson de Zoé, plus dense",
          uses: [{ preparation_id: "p1" }],
        },
        null,
      ],
    },
  });
  assertEquals(premier.applied, false);
  assertEquals(premier.rejections[0].why, "unreadable");
  // ⛔ LE PLAN RENDU EST LE MEILLEUR, ENTIER. Recettes et déroulés de session
  // compris: une atomicité mesurée sur un seul titre laisserait passer un rejet
  // qui a quand même retiré une casserole.
  assertEquals(JSON.stringify(premier.plan), intact);
  assertEquals(premier.units, []);
  assertEquals(premier.created, []);
  assertEquals(premier.preparationsReplaced, []);
  assertEquals(premier.preparationsCreated, []);
  assertEquals(premier.preparationsDropped, []);
  assertEquals(premier.sessionsRewritten, []);

  // ── TOUR 2 : la seconde réponse, valide ───────────────────────────────────
  // ⛔ L'APPEL JETÉ A ÉTÉ PAYÉ: la décision le sait, et il reste UN appel.
  const t2 = decide(appels, "no_improvement");
  assertEquals(t2.call, true);
  appels += 1;
  const { result: second } = applique({
    repair: {
      base_version: "req#r0",
      units: [
        {
          unit_id: U_ZOE.unitId,
          title: "Poisson de Zoé, plus dense",
          uses: [{ preparation_id: "p1" }],
        },
      ],
    },
  });
  assertEquals(second.applied, true);
  assertEquals(second.units, [U_ZOE.unitId]);
  // ⛔ ELLE S'APPLIQUE SUR `PLAN`, PAS SUR LA CANDIDATE JETÉE. `best` est le
  // meilleur plan mesuré, et c'est le contrat du module.
  assertEquals(second.plan.dishes[0].title, "Poisson de Zoé, plus dense");
  assertEquals(second.plan.dishes[1].title, "Poulet de Paul");
  assertEquals(second.plan.dishes[2].title, "Salade de la maison");
  assertEquals(second.plan.preparations[0].title, "Légumes rôtis");
  assertEquals(
    second.plan.cooking_sessions[0].runThrough,
    "Four à 200, les légumes 35 minutes, puis en boîtes.",
  );

  // ── LE PLAFOND ────────────────────────────────────────────────────────────
  assertEquals(appels, 2);
  const t3 = decide(appels, "no_improvement");
  assertEquals(t3.call, false);
  if (!t3.call) assertEquals(t3.reason, "calls_exhausted");
});

/**
 * Le périmètre qui ouvre LES DEUX objets: l'assiette de Zoé et la session du
 * dimanche. ⛔ Sans lui, une opération de session serait refusée pour
 * `out_of_scope_session` — un motif juste, mais pas celui qu'on éprouve.
 */
const SCOPE_MIXTE = repairScopeOf({
  plan: PLAN,
  index: INDEX,
  sessions: SESSIONS,
  defects: [
    defaut({
      kind: "sizing",
      cause: "cell_energy_off",
      day: "sun",
      slot: "dinner",
      memberId: "zoe",
    }),
    defaut({
      kind: "safety",
      cause: "member_exclusion_served",
      sessionIndex: 0,
      detail: "the run-through names a food somebody must not eat",
    }),
  ],
});

Deno.test("§ 2.3 ③ bis — les quatre motifs nommés par le plan rejettent tous le patch ENTIER", () => {
  const intact = JSON.stringify(PLAN);
  const bonne = {
    unit_id: U_ZOE.unitId,
    title: "Poisson de Zoé, plus dense",
    uses: [{ preparation_id: "p1" }],
  };
  // ⛔ CHAQUE LIGNE PORTE UNE BONNE OPÉRATION ET UNE MAUVAISE. Sans la bonne,
  // « le patch entier est jeté » et « il n'y avait rien à appliquer » se
  // relisent pareil.
  const cas: readonly {
    readonly nom: string;
    readonly brut: unknown;
    readonly scope: typeof SCOPE;
  }[] = [
    {
      nom: "base_version_missing",
      brut: { repair: { units: [bonne] } },
      scope: SCOPE,
    },
    {
      nom: "duplicate_preparation",
      brut: {
        repair: {
          base_version: "req#r0",
          units: [bonne],
          preparations: [
            { id: "p1", title: "Légumes revus" },
            { id: "p1", title: "Légumes revus deux fois" },
          ],
        },
      },
      scope: SCOPE,
    },
    {
      nom: "unknown_session",
      brut: {
        repair: {
          base_version: "req#r0",
          units: [bonne],
          sessions: [{ session_id: "S9", run_through: "Rien de connu." }],
        },
      },
      scope: SCOPE_MIXTE,
    },
    {
      nom: "duplicate_session",
      brut: {
        repair: {
          base_version: "req#r0",
          units: [bonne],
          sessions: [
            { session_id: "S1", run_through: "Une fois." },
            { session_id: "S1", run_through: "Deux fois." },
          ],
        },
      },
      scope: SCOPE_MIXTE,
    },
  ];
  for (const { nom, brut, scope } of cas) {
    const { result } = applique(brut, { baseVersion: "req#r0", scope });
    assertEquals(result.applied, false, `\`${nom}\` a laissé passer le patch`);
    assertEquals(result.rejections[0].why, nom);
    // ⛔ ET LA BONNE OPÉRATION N'EST PAS GARDÉE: le plan rendu est intact.
    assertEquals(JSON.stringify(result.plan), intact, nom);
    assertEquals(result.units, [], nom);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 3 — LE SCHÉMA DE PATCH DIT LA FORME D'UN INGRÉDIENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT, PAYÉ EN VRAI. Le schéma écrivait `"ingredients":[…]` et rien de
// plus. Sa seule règle sur une ligne était « tout ingrédient qui porte un poids
// porte son ref » : elle dit quoi faire SI il y a un poids, jamais qu'il en
// faut un. Le second patch réel d'un foyer de quatre est revenu avec 8 recettes
// sur 12 SANS QUANTITÉ — `missing_quantity: 8`, 16 portions sur 24 devenues non
// mesurables, candidate rejetée. Le modèle n'a pas désobéi : on ne lui avait
// rien demandé.
//
// ⚠️ CE TEST NE PROUVE PAS QUE LE MODÈLE OBÉIT. Il prouve que la DEMANDE est
// écrite. « Une consigne de prompt régresse, un verrou se vérifie » — le verrou
// d'en face est `missing_quantity`, qui refuse déjà la recette sans nombre.

Deno.test("⑬ le schéma NOMME `amount` et `unit`, et les dit obligatoires", () => {
  const texte = REPAIR_PATCH_SCHEMA_LINES.join("\n");
  // La forme de la ligne, champ par champ.
  for (const champ of ['"term"', '"quantity"', '"amount"', '"unit"', '"state"', '"ref"', '"part"']) {
    assert(texte.includes(champ), `${champ} absent du schéma :\n${texte}`);
  }
  // ⛔ ET L'OBLIGATION, EN TOUTES LETTRES. Nommer le champ ne suffit pas: le
  // schéma d'avant nommait déjà `ref` sans jamais exiger de poids.
  assert(
    /EVERY INGREDIENT ALWAYS CARRIES "amount" AND "unit"/.test(texte),
    `l'obligation n'est pas écrite :\n${texte}`,
  );
  // Le vocabulaire des unités est FERMÉ, et c'est celui du brief initial.
  for (const u of ['"g"', '"ml"', '"unit"', '"tbsp"', '"tsp"']) {
    assert(texte.includes(u), `unité ${u} absente :\n${texte}`);
  }
});

Deno.test("⑬ bis — le schéma reste le SEUL, et ne redemande pas un plan entier", () => {
  const texte = REPAIR_PATCH_SCHEMA_LINES.join("\n");
  // ⛔ LA MOITIÉ QUI COMPTE. Détailler l'ingrédient ne doit pas rouvrir la
  // porte que le lot 1 vient de fermer: aucun ordre de plan complet.
  for (const interdit of [
    "Return the full plan JSON",
    "Keep every dish, day and slot",
    "Do not touch any other dish",
  ]) {
    assert(!texte.includes(interdit), `${interdit} réintroduit :\n${texte}`);
  }
  // Et il dit toujours qu'il est le seul schéma de la tâche.
  assert(texte.includes("There is no other schema in"), texte);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 — UN COMPLÉMENT ET UN PLAT DÉDIÉ COHABITENT SUR UNE CASE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT, PAYÉ SUR UN APPEL RÉEL. La projection nommait au modèle DEUX
// unit_id à la même case pour la même bouche :
//
//     · U5 mon/lunch (efbb3deb…) — an extra dish for efbb3deb…
//     · U4 mon/lunch (efbb3deb…) "Tofu doré du lot commun…"
//
// Il a rendu un patch bien formé, avec la bonne `base_version`, sur les deux
// unités qu'on venait de lui nommer — et la seconde a été jetée en
// `ambiguous_address`. Le contrat était le nôtre.

Deno.test("⑤ ter — un COMPLÉMENT et un PLAT à la même case: les DEUX passent", () => {
  const plat: RepairUnit = {
    unitId: "U4", date: "2026-09-14", dayToken: "mon", slot: "lunch",
    ownerId: "lea", eaters: ["lea"], dishIndex: 3, title: "Tofu doré",
    preparationIds: ["prep_tofu"], boxIds: [], isComplement: false,
  };
  const extra: RepairUnit = {
    unitId: "U5", date: "2026-09-14", dayToken: "mon", slot: "lunch",
    ownerId: "lea", eaters: ["lea"], dishIndex: null, title: null,
    preparationIds: [], boxIds: [], isComplement: true,
  };
  const index = {
    units: [plat, extra],
    byId: new Map([["U4", plat], ["U5", extra]]),
    present: [plat], reserved: [extra],
    counts: {
      expected_cells: 1, present: 1, reserved: 1, complements: 1,
      unaddressed_dishes: 0,
    },
  };
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [
        { unit_id: "U4", title: "Tofu doré revu" },
        { unit_id: "U5", title: "Graines de courge" },
      ],
    },
  });
  const pont = patchDishPayloads({ envelope, index });
  // ⛔ LE POINT DU TEST.
  assertEquals(pont.dropped, []);
  assertEquals(pont.payloads.map((p) => p.unitId), ["U4", "U5"]);
  // Et les deux gardent leur propriétaire, réinjecté par le serveur.
  for (const p of pont.payloads) assertEquals(p.payload.for_member_id, "lea");
});

Deno.test("⑤ quater — LE CAS QUI MORD: deux plats SERVIS à la même case restent refusés", () => {
  // ⚠️ Une garde qui ne refuse plus rien n'est pas une garde. Le défaut ② de la
  // revue du 2026-09-12 — deux plats dédiés au même créneau fusionnés en un —
  // se refuse toujours.
  const a: RepairUnit = {
    unitId: "U4", date: "2026-09-14", dayToken: "mon", slot: "lunch",
    ownerId: "lea", eaters: ["lea"], dishIndex: 3, title: "Tofu doré",
    preparationIds: [], boxIds: [], isComplement: false,
  };
  const b: RepairUnit = { ...a, unitId: "U7", dishIndex: 5, title: "Salade" };
  const index = {
    units: [a, b], byId: new Map([["U4", a], ["U7", b]]),
    present: [a, b], reserved: [],
    counts: {
      expected_cells: 1, present: 2, reserved: 0, complements: 0,
      unaddressed_dishes: 0,
    },
  };
  const envelope = parseRepairPatch({
    repair: {
      base_version: "req#r0",
      units: [{ unit_id: "U4", title: "A" }, { unit_id: "U7", title: "B" }],
    },
  });
  const pont = patchDishPayloads({ envelope, index });
  assertEquals(pont.payloads.map((p) => p.unitId), ["U4"]);
  assertEquals(pont.dropped, [{ unitId: "U7", why: "ambiguous_address" }]);
});
