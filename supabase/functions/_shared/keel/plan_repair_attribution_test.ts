/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 1 — À QUI APPARTIENT UN OBJECTIF, ET CE QU'ON DEMANDE EN RETOUR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LES DEUX DÉFAUTS REPRODUITS ICI VIENNENT D'UNE REQUÊTE RÉELLEMENT ENVOYÉE
 * AU FOURNISSEUR, archivée le 2026-09-11 :
 * `scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/perte-h4n4-…prompts.txt`
 *
 *   ① LES OBJECTIFS PERDENT LEUR PROPRIÉTAIRE. Le message utilisateur porte,
 *      pour la MÊME date, trois cibles différentes et aucune identité :
 *
 *        - 2026-09-12: … they must carry 1826 kcal, within 5%.
 *        - 2026-09-12: … they must carry 3824 kcal, within 5%.
 *        - 2026-09-12: … they must carry 2459 kcal, within 5%.
 *
 *      Trois personnes, trois contrats, rien pour les distinguer. Le modèle ne
 *      peut que moyenner ou choisir au hasard.
 *
 *   ② L'ORDRE DE RENDRE UN PLAN COMPLET REVIENT PAR LES COMPLÉMENTS. Le même
 *      message porte « Return the full plan JSON with only these dishes
 *      added. » — hérité de `dedicatedDishInstruction` — pendant que le message
 *      SYSTÈME et le bloc de périmètre demandent un PATCH.
 *
 * ⚠️ CE FICHIER ASSEMBLE LES MESSAGES FINAUX, pas des morceaux. Système par
 * `repairSystemPrompt`, utilisateur par `planRepairMessage` : c'est la seule
 * paire que le transport envoie. Un test qui lirait `repairDefectLines` seul
 * resterait vert le jour où une consigne contradictoire rentre par le message
 * système, et inversement.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  planRepairMessage,
  planRepairRequest,
  REPAIR_MAX_BLOCKS,
  repairMeasureFields,
} from "./plan_defect_pass.ts";
import { repairSystemPrompt } from "./plan_repair_prompt.ts";
import {
  PLAN_PROJECTION_HARD_CHARS,
  repairScopeOf,
} from "./plan_repair_context.ts";
import type {
  RepairNutritionTables,
  RepairPlanShape,
} from "./plan_repair_context.ts";
import { buildRepairSessions, buildRepairUnits } from "./plan_repair_unit.ts";
import type { RepairExpectedCell, RepairUnitDish } from "./plan_repair_unit.ts";
import type { RepairDefect } from "./plan_repair_loop.ts";
import {
  DEDICATED_DISH_HEAD,
  dedicatedDishInstruction,
  dedicatedDishLine,
  repairDishInstructionLines,
} from "./portion_sizing.ts";
import { proteinAnchorRetryInstruction } from "./protein_anchor.ts";
import { exclusionRetryInstruction } from "./food_exclusion_belt.ts";
import { unfedRetryInstruction } from "./meals_delivered.ts";
import { preferenceSplitRetryInstruction } from "./preference_split_retry.ts";
import { swapRetryInstruction } from "./swap_presence.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LA TABLE D'ESSAI — N bouches, deux jours, trois moments, une casserole
// ═══════════════════════════════════════════════════════════════════════════

type Plat = {
  readonly day: string;
  readonly slot: string;
  readonly title: string;
  readonly memberId: string | null;
  readonly ingredients: readonly {
    readonly term: string;
    readonly ref: string;
    readonly amount: number;
    readonly unit: string;
    readonly state: string;
  }[];
  readonly uses: readonly {
    readonly preparationId: string;
    readonly servings: number;
  }[];
  readonly boxes: readonly {
    readonly id: string;
    readonly memberIds: readonly string[];
  }[];
};

const DATE_OF: Readonly<Record<string, string>> = {
  fri: "2026-09-11",
  sat: "2026-09-12",
  sun: "2026-09-13",
};

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 2 — LES DEUX TABLES DES CASES DE LA FIXTURE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CHAQUE BOUCHE A DES NOMBRES QUI N'APPARTIENNENT QU'À ELLE, et c'est la
 * seule façon de prouver qu'aucune valeur n'est recopiée d'une personne sur une
 * autre. Deux bouches qui partageraient le même servi rendraient le test vert
 * même si le code écrivait quatre fois la ligne du maître de maison.
 *
 * ⚠️ LES BORNES DE DENSITÉ NE SONT DONNÉES QU'À UNE BOUCHE SUR DEUX : « les
 * bornes quand elles s'appliquent » n'est vérifiable que si, chez quelqu'un,
 * elles ne s'appliquent pas.
 */
function chiffresDe(rang: number) {
  return {
    servedKcal: 888 + rang * 41,
    grams: 505 + rang * 31,
    densityPer100G: 176 + rang * 11,
    targetKcal: 1005 + rang * 137,
    gramsMin: 210 + rang * 45,
    gramsMax: 690 + rang * 53,
    densityMin: rang % 2 === 1 ? 118 + rang * 9 : null,
    densityMax: rang % 2 === 1 ? 265 + rang : null,
  };
}

function foyer(
  bouches: readonly string[],
  complements?: readonly RepairExpectedCell[],
  joursDemandes?: readonly string[],
) {
  const jours = joursDemandes ?? ["sat", "sun"];
  const moments = ["breakfast", "lunch", "dinner"];
  const dishes: Plat[] = [];
  for (const day of jours) {
    for (const slot of moments) {
      dishes.push({
        day,
        slot,
        title: `Assiette ${day}/${slot}`,
        memberId: null,
        ingredients: [{
          term: "riz complet",
          ref: "brown_rice",
          amount: 80,
          unit: "g",
          state: "raw",
        }],
        uses: [{ preparationId: "prep_commun", servings: bouches.length }],
        boxes: [{ id: `box_${day}_${slot}`, memberIds: [...bouches] }],
      });
    }
  }
  const plan: RepairPlanShape = {
    dishes: dishes as RepairPlanShape["dishes"],
    preparations: [{
      id: "prep_commun",
      title: "Poulet rôti",
      servingsMade: bouches.length * 2,
      ingredients: [{
        term: "cuisses de poulet",
        ref: "chicken_thigh",
        amount: 900,
        unit: "g",
        state: "raw",
      }],
    }],
    cooking_sessions: [{
      day: "sat",
      preparationIds: ["prep_commun"],
      runThrough: "Four à 200, le poulet 40 minutes, puis en boîtes.",
    }],
  };
  const expected: RepairExpectedCell[] = [];
  // ⟳ 2026-09-13 · LOT 2 — LA MÊME GRILLE PORTE LE SERVI ET LE CONTRAT. Les
  // deux tables de la production (`auditCellRows`, `auditCells`) sont bâties
  // sur cette même liste de cases : les séparer ici ferait deux grilles qui
  // divergent, et le test ne mesurerait plus le code de production.
  const cells: RepairNutritionTables["cells"][number][] = [];
  const contracts: RepairNutritionTables["contracts"][number][] = [];
  bouches.forEach((memberId, rang) => {
    const n = chiffresDe(rang);
    for (const day of jours) {
      for (const slot of moments) {
        expected.push({ memberId, date: DATE_OF[day], dayToken: day, slot });
        cells.push({
          memberId,
          day,
          date: DATE_OF[day],
          slot,
          servedKcal: n.servedKcal,
          grams: n.grams,
          densityPer100G: n.densityPer100G,
        });
        contracts.push({
          memberId,
          day,
          date: DATE_OF[day],
          slot,
          targetKcal: n.targetKcal,
          gramsMin: n.gramsMin,
          gramsMax: n.gramsMax,
          densityMin: n.densityMin,
          densityMax: n.densityMax,
        });
      }
    }
  });
  const index = buildRepairUnits({
    dishes: dishes as unknown as readonly RepairUnitDish[],
    expected,
    complements,
  });
  const sessions = buildRepairSessions({ sessions: plan.cooking_sessions });
  return { plan, index, sessions, nutrition: { cells, contracts } };
}

function defaut(
  o: Partial<RepairDefect> & { kind: RepairDefect["kind"] },
): RepairDefect {
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

/** Les DEUX messages, exactement comme le handler les compose. */
function messages(args: {
  readonly bouches: readonly string[];
  readonly defects: readonly RepairDefect[];
  readonly days?: Parameters<typeof planRepairMessage>[0]["days"];
  readonly complements?: readonly RepairExpectedCell[];
  readonly jours?: readonly string[];
  /**
   * ⟳ 2026-09-13 · LOT 2 — `true` = LA LANE N'A PAS DE TABLE DE NUTRITION.
   * C'est le chemin d'adoption, et c'est une réponse, pas un oubli.
   */
  readonly sansNutrition?: boolean;
  /** ⟳ LOT 2 — pour éprouver le plafond DUR sur une projection qui déborde. */
  readonly hardMaxChars?: number;
}) {
  const { plan, index, sessions, nutrition } = foyer(
    args.bouches,
    args.complements,
    args.jours,
  );
  const scope = repairScopeOf({
    plan,
    index,
    sessions,
    defects: [...args.defects],
  });
  const user = planRepairMessage({
    defects: [...args.defects],
    days: args.days ?? [],
    plan,
    index,
    sessions,
    scope,
    nutrition: args.sansNutrition === true ? null : nutrition,
    baseVersion: "req#r0",
    afterVerdict: null,
    hardMaxChars: args.hardMaxChars,
  });
  assert(user !== null, "aucun message composé");
  const system = repairSystemPrompt({
    safetyBlock: `- ${args.bouches[0]}: peanut — allergy, severity=medical`,
    houseRuleBlock: null,
  });
  return {
    system: system.text,
    user: user.text,
    message: user,
    scope,
    index,
    ensemble: `${system.text}\n${user.text}`,
  };
}

/** Les lignes du message qui nomment cette personne. */
function lignesDe(texte: string, memberId: string): string[] {
  return consignesDe(texte).split("\n").filter((l) =>
    l.includes(`member_id=${memberId}`)
  );
}

/**
 * ⟳ 2026-09-13 · LOT 2 — LA PARTIE « CONSIGNES » DU MESSAGE, SANS LA PROJECTION.
 *
 * ⛔ POURQUOI CETTE COUPURE EXISTE. Depuis que le bloc d'un lot commun porte le
 * contrat de CHAQUE bouche, `member_id=` apparaît des deux côtés : dans les
 * consignes (« corrige cette case ») et dans la relecture du plan (« voilà ce
 * que chaque portion doit »). Les deux disent des choses différentes, et un
 * test qui compte « les lignes de m_d » sans les séparer confondrait « m_d n'a
 * aucune consigne » avec « m_d n'existe pas ». Les tests d'attribution parlent
 * des CONSIGNES : c'est cette moitié-là qu'ils lisent.
 */
function consignesDe(texte: string): string {
  const at = texte.indexOf("== THE PLAN AS THE APP READS");
  return at < 0 ? texte : texte.slice(0, at);
}

/** La relecture du plan — l'autre moitié, celle qui porte les contrats du lot. */
function projectionDe(texte: string): string {
  const at = texte.indexOf("== THE PLAN AS THE APP READS");
  return at < 0 ? "" : texte.slice(at);
}

// ═══════════════════════════════════════════════════════════════════════════
// ① DÉFAUT A — TROIS CIBLES, TROIS PERSONNES, UNE SEULE DATE
// ═══════════════════════════════════════════════════════════════════════════

/** Les trois journées du tir archivé h4n4, à l'identique. */
const TROIS_JOURNEES: readonly { member: string; target: number }[] = [
  { member: "m_a", target: 1826 },
  { member: "m_b", target: 3824 },
  { member: "m_c", target: 2459 },
];

function defautsJournee(): RepairDefect[] {
  return TROIS_JOURNEES.map((x) =>
    defaut({
      kind: "sizing",
      cause: "day_energy_off",
      day: "2026-09-12",
      date: "2026-09-12",
      memberId: x.member,
      detail:
        `across that day the plates carry 2702 kcal and they must carry ${x.target} ` +
        `kcal, within 5%.`,
      measure: {
        of: "energy",
        servedKcal: 2702,
        targetKcal: x.target,
        deltaPct: null,
        tolerancePct: 5,
      },
      magnitude: Math.abs(2702 - x.target),
    })
  );
}

Deno.test("① A — trois cibles le même jour: chaque ligne NOMME son propriétaire", () => {
  const { user } = messages({
    bouches: ["m_a", "m_b", "m_c", "m_d"],
    defects: defautsJournee(),
  });
  for (const x of TROIS_JOURNEES) {
    const lignes = lignesDe(user, x.member);
    assert(
      lignes.length > 0,
      `aucune ligne ne porte member_id=${x.member} :\n${user}`,
    );
    assert(
      lignes.some((l) => l.includes(`target_kcal=${x.target}`)),
      `la cible ${x.target} n'est pas attachée à ${x.member} :\n${lignes.join("\n")}`,
    );
  }
  // ⛔ ET AUCUNE DES TROIS CIBLES NE SE RETROUVE SUR LA LIGNE D'UN AUTRE.
  for (const x of TROIS_JOURNEES) {
    for (const autre of TROIS_JOURNEES) {
      if (autre.member === x.member) continue;
      assert(
        !lignesDe(user, autre.member).some((l) =>
          l.includes(`target_kcal=${x.target}`)
        ),
        `la cible de ${x.member} est écrite sur la ligne de ${autre.member}`,
      );
    }
  }
});

Deno.test("① A bis — la date, le créneau et les unités voyagent avec la personne", () => {
  const { user, scope } = messages({
    bouches: ["m_a", "m_b", "m_c", "m_d"],
    defects: defautsJournee(),
  });
  assert(scope.unitIds.length > 0, "le périmètre est vide");
  for (const x of TROIS_JOURNEES) {
    const ligne = lignesDe(user, x.member)[0] ?? "";
    assert(ligne.includes("date=2026-09-12"), ligne);
    assert(ligne.includes("scope=day"), ligne);
    assert(/units=U\d/.test(ligne), `aucune unité citée : ${ligne}`);
  }
});

Deno.test("① A ter — DEUX PRÉNOMS IDENTIQUES restent deux personnes", () => {
  // ⛔ LE PRÉNOM N'EST JAMAIS UNE CLÉ DE JOINTURE. Deux « Léa » au même repas
  // ont deux contrats ; les apparier par le nom en fusionnerait un des deux.
  const { user } = messages({
    bouches: ["lea_1", "lea_2", "m_c", "m_d"],
    defects: [
      defaut({
        kind: "sizing",
        cause: "cell_energy_off",
        day: "sat",
        slot: "dinner",
        memberId: "lea_1",
        detail: "the dinner dish carries 947 kcal in one serving.",
        measure: {
          of: "energy",
          servedKcal: 947,
          targetKcal: 639,
          deltaPct: null,
          tolerancePct: 10,
        },
      }),
      defaut({
        kind: "sizing",
        cause: "cell_energy_off",
        day: "sat",
        slot: "dinner",
        memberId: "lea_2",
        detail: "the dinner dish carries 947 kcal in one serving.",
        measure: {
          of: "energy",
          servedKcal: 947,
          targetKcal: 1338,
          deltaPct: null,
          tolerancePct: 10,
        },
      }),
    ],
  });
  assert(
    lignesDe(user, "lea_1").some((l) => l.includes("target_kcal=639")),
    user,
  );
  assert(
    lignesDe(user, "lea_2").some((l) => l.includes("target_kcal=1338")),
    user,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② DÉFAUT B — « RENDS LE PLAN COMPLET » REVIENT PAR LES COMPLÉMENTS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② B — un complément ne réintroduit AUCUN ordre de plan complet", () => {
  // ⚠️ LE `detail` EST CELUI DE LA PRODUCTION, mot pour mot: c'est
  // `dedicatedDishInstruction` qui alimente `c4DedicatedAsk.text`, et c'est ce
  // texte-là qu'on a retrouvé dans la requête archivée.
  const texte = dedicatedDishInstruction([{
    memberId: "m_a",
    day: "sat",
    slot: "breakfast",
    direction: "densify",
    aimPer100G: 239,
    floorPer100G: null,
  }]);
  assert(texte !== null);
  const { ensemble } = messages({
    bouches: ["m_a", "m_b", "m_c", "m_d"],
    complements: [{
      memberId: "m_a",
      date: "2026-09-12",
      dayToken: "sat",
      slot: "breakfast",
    }],
    defects: [
      defaut({
        kind: "sizing",
        cause: "dedicated_complement_needed",
        day: "sat",
        slot: "breakfast",
        memberId: "m_a",
        detail: texte,
      }),
    ],
  });
  for (
    const interdit of [
      "Return the full plan JSON",
      "== OUTPUT JSON SCHEMA ==",
    ]
  ) {
    assert(
      !ensemble.includes(interdit),
      `ordre de plan complet présent : ${interdit}`,
    );
  }
  // ⛔ ET UN SEUL SCHÉMA DE SORTIE DANS LA PAIRE.
  assertEquals(ensemble.split('{"repair":{').length - 1, 1);
});

Deno.test("② B bis — aucune interdiction GLOBALE quand le périmètre ouvre d'autres unités", () => {
  // ⛔ « Do not touch any other dish » ET « Keep every dish, day and slot »
  // contredisent un périmètre qui ouvre sept repas et quatre créations. Les
  // laisser fait choisir au modèle laquelle des deux consignes il applique.
  const texte = dedicatedDishInstruction([{
    memberId: "m_a",
    day: "sat",
    slot: "breakfast",
    direction: "densify",
    aimPer100G: 239,
    floorPer100G: null,
  }]);
  assert(texte !== null);
  const { ensemble } = messages({
    bouches: ["m_a", "m_b", "m_c", "m_d"],
    complements: [{
      memberId: "m_a",
      date: "2026-09-12",
      dayToken: "sat",
      slot: "breakfast",
    }],
    defects: [
      ...defautsJournee(),
      defaut({
        kind: "sizing",
        cause: "dedicated_complement_needed",
        day: "sat",
        slot: "breakfast",
        memberId: "m_a",
        detail: texte,
      }),
    ],
  });
  for (
    const interdit of [
      "Do not touch any other dish",
      "Keep every dish, day and slot",
      "do not touch any other dish",
    ]
  ) {
    assert(
      !ensemble.includes(interdit),
      `interdiction globale contradictoire : ${interdit}`,
    );
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE CAS QUI PASSE — un défaut COLLECTIF reste collectif
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ un déroulé de session n'est attribué à PERSONNE", () => {
  const { user } = messages({
    bouches: ["m_a", "m_b"],
    defects: [
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        sessionIndex: 0,
        detail: "⛔ This plan names a food somebody at this table must not eat.",
      }),
    ],
  });
  const ligne = user.split("\n").find((l) =>
    l.includes("must not eat") || l.includes("scope=session")
  ) ?? "";
  assert(ligne !== "", user);
  assert(
    !/member_id=\S/.test(ligne),
    `un défaut de session s'est vu attribuer une bouche : ${ligne}`,
  );
});


Deno.test("③ bis — planRepairRequest reçoit la table des unités, et `null` est une réponse", () => {
  // ⛔ REQUIS ET NULLABLE, JAMAIS `?`. `null` = « pas de table d'unités » : on
  // rend quand même la personne, la date et le créneau — on ne rend pas
  // silencieusement un texte anonyme, et on n'invente aucun jeton d'unité.
  const sans = planRepairRequest({
    defects: defautsJournee(),
    days: [],
    index: null,
  });
  assert(sans !== null);
  for (const x of TROIS_JOURNEES) {
    assert(sans.includes(`member_id=${x.member}`), sans);
    assert(sans.includes(`target_kcal=${x.target}`), sans);
  }
  assert(!sans.includes("units="), "sans table d'unités, aucune unité inventée");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ DEUX PUIS QUATRE OBJECTIFS, MÊME DATE **ET** MÊME CRÉNEAU
// ═══════════════════════════════════════════════════════════════════════════

function cibleDeCase(member: string, target: number): RepairDefect {
  return defaut({
    kind: "sizing",
    cause: "cell_energy_off",
    day: "sat",
    slot: "dinner",
    memberId: member,
    detail:
      `the dinner dish carries 947 kcal in one serving and it must carry ${target} ` +
      `kcal, within 10%.`,
    measure: {
      of: "energy",
      servedKcal: 947,
      targetKcal: target,
      deltaPct: null,
      tolerancePct: 10,
    },
  });
}

for (const n of [2, 4]) {
  Deno.test(`④ ${n} objectifs au MÊME repas: chacun reste attribuable`, () => {
    const bouches = ["m_a", "m_b", "m_c", "m_d"].slice(0, n);
    const cibles = [639, 1338, 861, 2110].slice(0, n);
    const { user } = messages({
      bouches,
      defects: bouches.map((b, i) => cibleDeCase(b, cibles[i])),
    });
    bouches.forEach((b, i) => {
      const lignes = lignesDe(user, b);
      assert(lignes.length > 0, `${b} n'est nommé nulle part :\n${user}`);
      assert(
        lignes.some((l) =>
          l.includes(`target_kcal=${cibles[i]}`) && l.includes("slot=dinner")
        ),
        `la cible de ${b} n'est pas sur sa ligne :\n${lignes.join("\n")}`,
      );
    });
    // ⛔ ET AUCUNE MOYENNE N'EST PROPOSÉE. Deux contrats opposés sur une recette
    // unique ont deux échappatoires: la moyenne, et l'élargissement de la
    // tolérance. Les deux sont nommées, donc fermées.
    assert(user.includes("Do not average them"), user);
    assert(user.includes("do not widen any"), user);
  });
}

Deno.test("④ bis — une présence VARIABLE ne fait disparaître personne", () => {
  // ⚠️ TROIS BOUCHES AU DÎNER, DEUX AU PETIT-DÉJEUNER. Un regroupement par
  // journée ne doit pas faire croire que tout le monde mange à tous les repas.
  const { user } = messages({
    bouches: ["m_a", "m_b", "m_c", "m_d"],
    defects: [
      cibleDeCase("m_a", 639),
      cibleDeCase("m_b", 1338),
      cibleDeCase("m_c", 861),
      defaut({
        kind: "sizing",
        cause: "cell_energy_off",
        day: "sat",
        slot: "breakfast",
        memberId: "m_a",
        detail: "the breakfast dish carries 676 kcal in one serving.",
        measure: {
          of: "energy",
          servedKcal: 676,
          targetKcal: 457,
          deltaPct: null,
          tolerancePct: 10,
        },
      }),
      defaut({
        kind: "sizing",
        cause: "cell_energy_off",
        day: "sat",
        slot: "breakfast",
        memberId: "m_d",
        detail: "the breakfast dish carries 676 kcal in one serving.",
        measure: {
          of: "energy",
          servedKcal: 676,
          targetKcal: 956,
          deltaPct: null,
          tolerancePct: 10,
        },
      }),
    ],
  });
  const dinerDe = (m: string) =>
    lignesDe(user, m).filter((l) => l.includes("slot=dinner"));
  const petitDejDe = (m: string) =>
    lignesDe(user, m).filter((l) => l.includes("slot=breakfast"));
  assertEquals(dinerDe("m_a").length, 1);
  assertEquals(dinerDe("m_d").length, 0, "m_d n'a pas de contrat au dîner");
  assertEquals(petitDejDe("m_d").length, 1);
  assertEquals(petitDejDe("m_b").length, 0, "m_b n'a pas de contrat au matin");
  // ⛔ ET LES DEUX CRÉNEAUX D'UNE MÊME BOUCHE NE FUSIONNENT PAS.
  assert(dinerDe("m_a")[0].includes("target_kcal=639"), dinerDe("m_a")[0]);
  assert(petitDejDe("m_a")[0].includes("target_kcal=457"), petitDejDe("m_a")[0]);
});

Deno.test("④ ter — la PROTÉINE porte elle aussi son propriétaire et ses deux grammages", () => {
  const { user } = messages({
    bouches: ["m_a", "m_b", "m_c", "m_d"],
    defects: [
      defaut({
        kind: "protein",
        cause: "protein_floor_short",
        day: "2026-09-12",
        date: "2026-09-12",
        memberId: "m_a",
        detail:
          "that day's plates carry 124 g of protein and they must carry at least 176 g.",
        measure: { of: "protein", servedG: 124, floorG: 176 },
      }),
      defaut({
        kind: "protein",
        cause: "protein_floor_short",
        day: "2026-09-12",
        date: "2026-09-12",
        memberId: "m_b",
        detail:
          "that day's plates carry 124 g of protein and they must carry at least 210 g.",
        measure: { of: "protein", servedG: 124, floorG: 210 },
      }),
    ],
    days: [{
      memberId: "m_a",
      date: "2026-09-12",
      dayToken: "sat",
      proteinNowG: 124,
      proteinFloorG: 176,
      kcalNow: 2463,
      kcalBudget: 2454,
      dishes: [{
        slot: "dinner",
        title: "Assiette sat/dinner",
        proteinG: 52,
        servedKcal: 860,
        grams: 343,
      }],
    }],
  });
  assert(
    lignesDe(user, "m_a").some((l) => l.includes("protein_floor_g=176")),
    user,
  );
  assert(
    lignesDe(user, "m_b").some((l) => l.includes("protein_floor_g=210")),
    user,
  );
  // ⛔ ET LES DEUX ÉCHAPPATOIRES RESTENT NOMMÉES.
  assert(user.includes("Do NOT simply add meat on top"), user);
  assert(user.includes("do NOT scale the whole dish up"), user);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LA VERSION ASSEMBLÉE, N=4 SUR TROIS JOURS — PERSONNE NE DISPARAÎT
// ═══════════════════════════════════════════════════════════════════════════

const N4_BOUCHES = ["m_a", "m_b", "m_c", "m_d"];
const N4_JOURS: readonly (readonly [string, string])[] = [
  ["fri", "2026-09-11"],
  ["sat", "2026-09-12"],
  ["sun", "2026-09-13"],
];
const N4_MOMENTS = ["breakfast", "lunch", "dinner"];

/**
 * LA FORME DU TIR ARCHIVÉ `perte-h4n4` : sécurité (assiette ET déroulé),
 * journées, cases, bornes, densité d'amont, complément, protéines — sur trois
 * jours et quatre bouches. 55 défauts réparables.
 */
function defautsH4N4(): RepairDefect[] {
  const out: RepairDefect[] = [];
  out.push(defaut({
    kind: "safety",
    cause: "member_exclusion_served",
    day: "sat",
    slot: "dinner",
    memberId: "m_b",
    detail:
      "⛔ This plan names a food that somebody at this table must not eat, for a " +
      "MEDICAL reason. Replace that food with something else of the same role.",
  }));
  out.push(defaut({
    kind: "safety",
    cause: "member_exclusion_served",
    sessionIndex: 0,
    detail: "The cooking run-through names it too: rewrite that text only.",
  }));
  for (const [, date] of N4_JOURS) {
    for (let i = 0; i < 3; i++) {
      out.push(defaut({
        kind: "sizing",
        cause: "day_energy_off",
        day: date,
        date,
        memberId: N4_BOUCHES[i],
        detail:
          `across that day the plates carry 2702 kcal and they must carry ${
            1800 + i * 900
          } kcal, within 5%.`,
        measure: {
          of: "energy",
          servedKcal: 2702,
          targetKcal: 1800 + i * 900,
          deltaPct: null,
          tolerancePct: 5,
        },
      }));
    }
  }
  for (const [day] of N4_JOURS) {
    for (const slot of N4_MOMENTS) {
      for (let i = 0; i < 2; i++) {
        out.push(defaut({
          kind: "sizing",
          cause: "cell_energy_off",
          day,
          slot,
          memberId: N4_BOUCHES[i],
          detail:
            `the ${slot} dish carries 947 kcal in one serving and it must carry ${
              600 + i * 700
            } kcal, within 10%.`,
          measure: {
            of: "energy",
            servedKcal: 947,
            targetKcal: 600 + i * 700,
            deltaPct: null,
            tolerancePct: 10,
          },
        }));
      }
    }
    for (let i = 0; i < 2; i++) {
      out.push(defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        day,
        slot: "dinner",
        memberId: N4_BOUCHES[i],
        detail:
          "its calories are already right; the plate weighs 715 g cooked and a " +
          "plate here must be 250 to 700 g.",
        measure: { of: "mass", grams: 715, minG: 250, maxG: 700 },
      }));
    }
  }
  // La densité d'amont : un constat par plat, avec sa recette.
  N4_JOURS.forEach(([day], i) => {
    for (const slot of N4_MOMENTS) {
      if ((i + slot.length) % 2 === 0) continue;
      out.push(defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        source: "upstream",
        day,
        slot,
        dish: `Assiette ${day}/${slot}`,
        detail: repairDishInstructionLines({
          title: `Assiette ${day}/${slot}`,
          ask: {
            direction: "densify",
            currentPer100G: 253,
            floorPer100G: 123,
            ceilingPer100G: 250,
            aimPer100G: 180,
          },
          fresh: [{ term: "riz complet", quantity: "80 g" }],
          freshRepairability: "reworkable",
          pots: [{
            id: "prep_commun",
            title: "Poulet rôti",
            ingredients: [{ term: "poulet", quantity: "1900 g" }],
            repairability: "frozen",
          }],
        }).join("\n"),
      }));
    }
  });
  out.push(defaut({
    kind: "sizing",
    cause: "dedicated_complement_needed",
    source: "upstream",
    day: "sat",
    slot: "breakfast",
    memberId: "m_a",
    detail: [
      ...DEDICATED_DISH_HEAD,
      dedicatedDishLine({
        memberId: "m_a",
        day: "sat",
        slot: "breakfast",
        direction: "densify",
        aimPer100G: 239,
        floorPer100G: null,
      }),
    ].join("\n"),
  }));
  for (const [, date] of N4_JOURS) {
    for (const m of N4_BOUCHES) {
      out.push(defaut({
        kind: "protein",
        cause: "protein_floor_short",
        day: date,
        date,
        memberId: m,
        detail:
          "that day's plates carry 124 g of protein and they must carry at least 176 g.",
        measure: { of: "protein", servedG: 124, floorG: 176 },
      }));
    }
  }
  return out;
}

function messagesH4N4() {
  return messages({
    bouches: N4_BOUCHES,
    jours: N4_JOURS.map(([d]) => d),
    complements: [{
      memberId: "m_a",
      date: "2026-09-12",
      dayToken: "sat",
      slot: "breakfast",
    }],
    defects: defautsH4N4(),
  });
}

Deno.test("⑤ N=4 sur trois jours: les 55 défauts tiennent, et personne n'est coupé", () => {
  const { user, message } = messagesH4N4();
  assertEquals(message.defectCounts.dropped, 0);
  assertEquals(message.defectCounts.ownerless, 0);
  assertEquals(message.contextIncomplete, false);
  assertEquals(message.tooLarge, false);
  // ⛔ LA TRONCATURE ARCHIVÉE N'EXISTE PLUS. « … and 41 more of the same kind. »
  // remplaçait deux bouches sur quatre par un compte.
  assert(!/more of the same kind/.test(user), user.slice(0, 2000));
  // ⛔ ET LES QUATRE BOUCHES SONT NOMMÉES DANS LES CONSIGNES, pas seulement dans
  // la projection du plan.
  const consignes = user.slice(0, user.indexOf("== THE PLAN AS THE APP READS"));
  for (const m of N4_BOUCHES) {
    assert(
      consignes.includes(`member_id=${m}`),
      `${m} n'a aucune consigne à son nom`,
    );
  }
  // ⛔ ET LES TROIS JOURNÉES AUSSI.
  for (const [, date] of N4_JOURS) {
    assert(consignes.includes(`date=${date}`), `${date} a disparu`);
  }
  // ⛔ LA SÉCURITÉ PASSE EN TÊTE — une consigne qui commence par la densité fait
  // lire l'allergène comme un détail.
  const securite = consignes.indexOf("SOMEONE IS SERVED WHAT THEY MUST NOT EAT");
  const proteine = consignes.indexOf("DO NOT CARRY ENOUGH PROTEIN");
  assert(securite >= 0 && proteine > securite, consignes.slice(0, 600));
});

Deno.test("⑤ bis — au-delà du plafond, un grammage de trop n'empêche pas de partir si le repas manquant tient", () => {
  // ⚠️ LE CAS QUI FAIT MORDRE. Un bloc par journée et par cause: on fabrique
  // plus de journées distinctes que `REPAIR_MAX_BLOCKS`.
  const trop: RepairDefect[] = [];
  for (let j = 0; j < REPAIR_MAX_BLOCKS + 5; j++) {
    const date = `2026-10-${String(j + 1).padStart(2, "0")}`;
    trop.push(defaut({
      kind: "sizing",
      cause: "day_energy_off",
      day: date,
      date,
      memberId: "m_a",
      detail: "across that day the plates carry 2702 kcal.",
      measure: {
        of: "energy",
        servedKcal: 2702,
        targetKcal: 1826,
        deltaPct: null,
        tolerancePct: 5,
      },
    }));
  }
  // ⚠️ ET UN DÉFAUT ADRESSABLE, sans quoi le périmètre serait vide et le message
  // ne serait pas composé du tout — on testerait autre chose.
  trop.push(defaut({
    kind: "missing_meal",
    cause: "mouth_unfed",
    day: "mon",
    slot: "dinner",
    memberId: "m_a",
    detail: "unfed:no_dish",
  }));
  trop.push(cibleDeCase("m_a", 639));
  const { message, user } = messages({ bouches: N4_BOUCHES, defects: trop });
  assertEquals(message.contextIncomplete, false);
  assert(message.defectCounts.dropped > 0);
  assert(!/more of the same kind/.test(user), "la troncature muette est revenue");
  assert(user.includes("A MEAL IS MISSING:"), user.slice(0, 400));
});

Deno.test("⑤ bis ter — une BOUCHE dont tous les blocs tombent hors plafond arrête l'appel", () => {
  // ⛔ C'EST LE DÉFAUT h4n4 : deux personnes disparaissaient derrière un
  // compte. Un grammage de trop de la MÊME bouche ne suffit plus (⑤ bis) ; une
  // bouche dont RIEN n'entre dans les 40 blocs, si.
  const trop: RepairDefect[] = [];
  for (let j = 0; j < REPAIR_MAX_BLOCKS; j++) {
    const date = `2026-10-${String(j + 1).padStart(2, "0")}`;
    trop.push(defaut({
      kind: "sizing",
      cause: "day_energy_off",
      day: date,
      date,
      memberId: "m_a",
      detail: "across that day the plates carry 2702 kcal.",
      measure: {
        of: "energy",
        servedKcal: 2702,
        targetKcal: 1826,
        deltaPct: null,
        tolerancePct: 5,
      },
    }));
  }
  trop.push(defaut({
    kind: "sizing",
    cause: "day_energy_off",
    day: "2026-11-01",
    date: "2026-11-01",
    memberId: "m_d",
    detail: "across that day the plates carry 900 kcal.",
    measure: {
      of: "energy",
      servedKcal: 900,
      targetKcal: 1826,
      deltaPct: null,
      tolerancePct: 5,
    },
  }));
  const { message } = messages({ bouches: N4_BOUCHES, defects: trop });
  assertEquals(message.contextIncomplete, true);
  assert(message.defectCounts.dropped > 0);
});

Deno.test("⑤ ter — un objectif individuel SANS propriétaire arrête l'appel", () => {
  // ⛔ « CONTEXTE INCOMPLET », PAS « PARS ANONYME ». Un `day_energy_off` est le
  // contrat d'UNE bouche: sans elle, le modèle composerait pour personne.
  const { message } = messages({
    bouches: N4_BOUCHES,
    defects: [
      cibleDeCase("m_a", 639),
      defaut({
        kind: "sizing",
        cause: "day_energy_off",
        day: "2026-09-12",
        date: "2026-09-12",
        memberId: null,
        detail: "across that day the plates carry 2702 kcal.",
      }),
    ],
  });
  assertEquals(message.contextIncomplete, true);
  assertEquals(message.defectCounts.ownerless, 1);
  assertEquals(message.ownerless, ["day_energy_off@2026-09-12/?"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE PROMPT « COMPLÉMENT + DENSITÉ + LOT PARTAGÉ + SESSION »
// ═══════════════════════════════════════════════════════════════════════════

/** Les quatre natures ensemble, comme la décision commune les envoie. */
function messagesQuatreNatures() {
  return messages({
    bouches: N4_BOUCHES,
    complements: [{
      memberId: "m_a",
      date: "2026-09-12",
      dayToken: "sat",
      slot: "breakfast",
    }],
    defects: [
      // ① le déroulé de la session — collectif
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        sessionIndex: 0,
        detail: "The cooking run-through names it too: rewrite that text only.",
      }),
      // ② la densité d'un plat qui tire le lot commun
      defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        source: "upstream",
        day: "sat",
        slot: "dinner",
        dish: "Assiette sat/dinner",
        detail: repairDishInstructionLines({
          title: "Assiette sat/dinner",
          ask: {
            direction: "densify",
            currentPer100G: 253,
            floorPer100G: 123,
            ceilingPer100G: 250,
            aimPer100G: 180,
          },
          fresh: [{ term: "riz complet", quantity: "80 g" }],
          freshRepairability: "reworkable",
          pots: [{
            id: "prep_commun",
            title: "Poulet rôti",
            ingredients: [{ term: "poulet", quantity: "1900 g" }],
            repairability: "frozen",
          }],
        }).join("\n"),
      }),
      // ③ deux contrats caloriques opposés sur ce même repas
      cibleDeCase("m_a", 639),
      cibleDeCase("m_b", 1338),
      // ④ le complément de dernier recours
      defaut({
        kind: "sizing",
        cause: "dedicated_complement_needed",
        source: "upstream",
        day: "sat",
        slot: "breakfast",
        memberId: "m_a",
        detail: [
          ...DEDICATED_DISH_HEAD,
          dedicatedDishLine({
            memberId: "m_a",
            day: "sat",
            slot: "breakfast",
            direction: "densify",
            aimPer100G: 239,
            floorPer100G: null,
          }),
        ].join("\n"),
      }),
    ],
  });
}

Deno.test("⑥ les quatre natures ensemble: UN seul schéma, et c'est le patch", () => {
  const { ensemble } = messagesQuatreNatures();
  assertEquals(ensemble.split('{"repair":{').length - 1, 1);
  for (
    const interdit of [
      "Return the full plan JSON",
      "== OUTPUT JSON SCHEMA ==",
      '"shopping_list": [',
      "RETURN ONLY THE MEALS NAMED ABOVE",
      "COVER THE WHOLE STRETCH",
    ]
  ) {
    assert(!ensemble.includes(interdit), `second schéma présent : ${interdit}`);
  }
});

Deno.test("⑥ bis — aucune interdiction globale, et les données utiles sont là", () => {
  const { ensemble, user } = messagesQuatreNatures();
  for (
    const interdit of [
      "Do not touch any other dish",
      "Keep every dish, day and slot",
      "leave every other dish exactly as it is",
      "shorten the plan",
    ]
  ) {
    assert(!ensemble.includes(interdit), `ordre global incompatible : ${interdit}`);
  }
  // ⛔ ET CE QUI DOIT VOYAGER VOYAGE.
  //   · la bande de densité du plat,
  assert(user.includes("between 123 and 250 kcal per 100 g"), user);
  //   · le lot GELÉ et ses consommateurs,
  assert(user.includes('Preparation prep_commun "Poulet rôti", FROZEN'), user);
  assert(user.includes("⛔ SHARED:"), user);
  //   · la densité du complément,
  assert(user.includes("at least 239 kcal per 100 g"), user);
  //   · les deux contrats caloriques, chacun sur sa ligne,
  assert(lignesDe(user, "m_a").some((l) => l.includes("target_kcal=639")), user);
  assert(lignesDe(user, "m_b").some((l) => l.includes("target_kcal=1338")), user);
  //   · et le déroulé d'aujourd'hui.
  assert(user.includes("Four à 200, le poulet 40 minutes"), user);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ UNE SESSION SEULE EN DÉFAUT N'OUVRE AUCUNE RECETTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ session seule: son texte et son périmètre, rien d'autre", () => {
  const { user, scope } = messages({
    bouches: N4_BOUCHES,
    defects: [
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        sessionIndex: 0,
        detail: "The cooking run-through names a forbidden food: rewrite it.",
      }),
    ],
  });
  assertEquals(scope.unitIds, []);
  assertEquals(scope.preparationIds, []);
  assertEquals(scope.sessionIds, ["S1"]);
  // ⛔ LE BLOC D'AUTORISATION LE DIT AU MODÈLE, pas seulement au journal.
  assert(user.includes('There is no meal to change in this answer'), user);
  assert(user.includes('"sessions" carries ONLY these session_ids: S1.'), user);
  // ⛔ ET AUCUNE RECETTE SAINE N'EST OUVERTE.
  assert(!user.includes("THE MEALS TO CHANGE"), user);
  assert(!user.includes("THE PREPARATIONS THOSE MEALS DRAW ON"), user);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ LE LOT COMMUN — LES CONTRATS DES CONSOMMATEURS SAINS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑧ un lot partagé rend les contrats de TOUS ses consommateurs", () => {
  const { user, scope } = messages({
    bouches: N4_BOUCHES,
    defects: [cibleDeCase("m_a", 639)],
  });
  assertEquals(scope.sharedPreparations.length, 1);
  const partage = scope.sharedPreparations[0];
  assert(partage.untouchedUnitIds.length > 0, "aucun consommateur sain");
  // ⛔ CHAQUE CONSOMMATEUR SAIN EST NOMMÉ, AVEC SA QUANTITÉ MESURÉE — jamais
  // celle de l'unité en défaut recopiée.
  for (const uid of partage.untouchedUnitIds) {
    const ligne = user.split("\n").find((l) =>
      l.includes(`· ${uid} `) && l.includes("of prep_commun")
    );
    assert(ligne !== undefined, `${uid} n'a pas de contrat lisible :\n${user}`);
    assert(/takes \d+ serving\(s\)/.test(ligne), ligne);
    assert(ligne.includes("is already right"), ligne);
  }
  // ⛔ ET L'ÉCHELLE EST DITE: un lot entier n'est pas une assiette.
  assert(user.includes("the amounts under a preparation are the WHOLE BATCH"), user);
});

Deno.test("⑧ bis — deux causes au MÊME jour et MÊME créneau ne fusionnent pas", () => {
  // ⛔ « AUCUN DÉFAUT INDIVIDUEL FUSIONNÉ PAR SIMPLE JOUR/CRÉNEAU ». Les calories
  // et les bornes de masse sont deux contrats différents ; les fondre ferait
  // demander une correction calorique sur une densité — le tir n° 4 archivé.
  const { user } = messages({
    bouches: N4_BOUCHES,
    defects: [
      cibleDeCase("m_a", 639),
      defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        day: "sat",
        slot: "dinner",
        memberId: "m_a",
        detail:
          "its calories are already right; the plate weighs 715 g cooked and a " +
          "plate here must be 250 to 700 g.",
        measure: { of: "mass", grams: 715, minG: 250, maxG: 700 },
      }),
    ],
  });
  const mes = lignesDe(user, "m_a");
  assert(
    mes.some((l) => l.includes("measure=energy(kcal)") && l.includes("target_kcal=639")),
    user,
  );
  assert(
    mes.some((l) => l.includes("measure=mass(g)") && l.includes("max_g=700")),
    user,
  );
  // ⛔ ET LES DEUX CAUSES ONT LEUR PROPRE EN-TÊTE.
  assert(user.includes("cause=cell_energy_off"), user);
  assert(user.includes("cause=cell_bounds_off"), user);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ TOUT PRODUCTEUR DE CONSIGNE PASSE PAR LE MESSAGE FINAL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ LES ORDRES QU'UN MESSAGE DE RÉPARATION NE DOIT PLUS PORTER.
 *
 * Deux familles, et elles ont chacune été mesurées dans la requête archivée :
 * un SECOND SCHÉMA DE SORTIE (on demande un patch, la phrase demande un plan),
 * et une INTERDICTION GLOBALE (le périmètre ouvre plusieurs unités, la phrase
 * dit de n'en toucher aucune autre).
 */
const ORDRES_INTERDITS: readonly string[] = [
  "Return the full plan JSON",
  "== OUTPUT JSON SCHEMA ==",
  "RETURN ONLY THE MEALS NAMED ABOVE",
  '"shopping_list": [',
  "Do not touch any other dish",
  "do not touch any other dish",
  "Keep every dish, day and slot",
  "leave every other dish exactly as it is",
  "shorten the plan",
  "COVER THE WHOLE STRETCH",
];

/**
 * LES SEPT PRODUCTEURS DE CONSIGNE QUE LA LANE DU FOYER APPELLE, CHACUN RENDU
 * POUR DE VRAI — pas une chaîne recopiée dans le test.
 *
 * ⛔ C'EST UN TEST DE MESSAGE FINAL, PAS UNE RECHERCHE TEXTUELLE. Chaque texte
 * entre comme `detail` d'un défaut, le message part par `planRepairMessage` et
 * `repairSystemPrompt`, et c'est la PAIRE qu'on lit. Un producteur qui
 * réintroduirait « Return the full plan JSON » fait rougir ici, même si son
 * propre test reste vert.
 */
const PRODUCTEURS: readonly { readonly nom: string; readonly texte: string }[] =
  [
    {
      nom: "proteinAnchorRetryInstruction",
      texte: proteinAnchorRetryInstruction(["Assiette sat/dinner"]),
    },
    {
      nom: "exclusionRetryInstruction",
      texte: exclusionRetryInstruction([{
        dish: "Assiette sat/dinner",
        matched: "poulet",
        because: "Je n'aime pas le poulet",
      }]) ?? "",
    },
    {
      nom: "unfedRetryInstruction",
      texte: unfedRetryInstruction([{
        name: "Léa",
        memberId: "m_a",
        day: "sat",
        slot: "dinner",
        cause: "held_off_regime",
        dish: "Assiette sat/dinner",
      }], { wording: "standard_recipe", partial: false }) ?? "",
    },
    {
      nom: "preferenceSplitRetryInstruction",
      texte: preferenceSplitRetryInstruction(
        [{ term: "asperges", wanter: "Paul", refusers: ["Claire"] }],
        6,
        "standard_recipe",
      ) ?? "",
    },
    {
      nom: "swapRetryInstruction",
      texte: swapRetryInstruction({
        strictest: "vegetarian",
        freeNames: ["Paul"],
        boundNames: ["Claire"],
        cellsChecked: 6,
      }) ?? "",
    },
    {
      nom: "repairDishInstructionLines",
      texte: repairDishInstructionLines({
        title: "Assiette sat/dinner",
        ask: {
          direction: "densify",
          currentPer100G: 253,
          floorPer100G: 123,
          ceilingPer100G: 250,
          aimPer100G: 180,
        },
        fresh: [{ term: "riz complet", quantity: "80 g" }],
        freshRepairability: "reworkable",
        pots: [{
          id: "prep_commun",
          title: "Poulet rôti",
          ingredients: [{ term: "poulet", quantity: "1900 g" }],
          repairability: "frozen",
        }],
      }).join("\n"),
    },
    {
      nom: "dedicatedDishLine",
      texte: [
        ...DEDICATED_DISH_HEAD,
        dedicatedDishLine({
          memberId: "m_a",
          day: "sat",
          slot: "dinner",
          direction: "densify",
          aimPer100G: 239,
          floorPer100G: null,
        }),
      ].join("\n"),
    },
  ];

for (const producteur of PRODUCTEURS) {
  Deno.test(`⑨ ${producteur.nom} — son texte atteint le message final SANS ordre incompatible`, () => {
    assert(producteur.texte.trim() !== "", "le producteur n'a rien rendu");
    const { ensemble } = messages({
      bouches: N4_BOUCHES,
      defects: [
        defaut({
          kind: "sizing",
          cause: "cell_bounds_off",
          source: "upstream",
          day: "sat",
          slot: "dinner",
          memberId: "m_a",
          detail: producteur.texte,
        }),
      ],
    });
    for (const interdit of ORDRES_INTERDITS) {
      assert(
        !ensemble.includes(interdit),
        `${producteur.nom} réintroduit « ${interdit} » dans le message final`,
      );
    }
    assertEquals(ensemble.split('{"repair":{').length - 1, 1);
  });
}

/**
 * LES CONSIGNES DE LA LANE QUI N'ATTEIGNENT PAS `final_repair`, AVEC LA RAISON.
 *
 * ⛔ « ELLE N'EST PAS DANS LA LISTE » N'EST PAS UNE DÉCISION, C'EST UN OUBLI.
 * Chaque absence est écrite ici, comme `REPAIR_PROMPT_DROPPED_SECTIONS` le fait
 * pour les sections du prompt : une fonction ajoutée demain doit être rangée
 * d'un côté ou de l'autre, sinon ce test rougit.
 */
const HORS_REPARATION: readonly { readonly nom: string; readonly pourquoi: string }[] = [
  {
    nom: "draftNoteInstruction",
    pourquoi:
      "elle s'ajoute au brief de COMPOSITION (la note libre de la personne), " +
      "pas au message de réparation",
  },
  {
    nom: "emptySlotsLine",
    pourquoi: "elle écrit une ligne de JOURNAL (`issues`), jamais un prompt",
  },
  {
    nom: "cellEditInstruction",
    pourquoi:
      "c'est la chirurgie locale d'une case demandée par la personne — un autre " +
      "appel, avec son propre schéma de sortie",
  },
  {
    nom: "resolveCompositionLine",
    pourquoi:
      "elle résout une ligne du RÉFÉRENTIEL alimentaire ; elle ne rend aucun " +
      "texte envoyé au modèle",
  },
];

Deno.test("⑨ bis — la lane du foyer n'appelle AUCUN producteur non couvert ici", () => {
  // ⚠️ CE TEST-CI EST UNE RECHERCHE TEXTUELLE, ET IL NE REMPLACE PAS LES SEPT
  // AU-DESSUS : il dit seulement que la LISTE est complète. Sans lui, ajouter
  // un huitième producteur au générateur passerait sans qu'aucun test final ne
  // le voie ; sans les sept, ce test-ci ne dirait rien de ce qui est envoyé.
  const src = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const couverts = new Set(PRODUCTEURS.map((p) => p.nom));
  const appeles = new Set<string>();
  for (const m of src.matchAll(/\b([A-Za-z][A-Za-z0-9]*(?:Instruction|InstructionLines|Line))\s*\(/g)) {
    appeles.add(m[1]);
  }
  const manquants = [...appeles].filter((nom) =>
    !couverts.has(nom) && !HORS_REPARATION.some((x) => x.nom === nom)
  );
  assertEquals(
    manquants,
    [],
    `producteurs appelés par la lane et non éprouvés sur le message final : ${
      manquants.join(", ")
    }`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LES DEUX ARCHIVES, REJOUÉES SUR LE CONSTRUCTEUR D'AUJOURD'HUI
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑩ h4n4 — les identités sont visibles, les consignes contradictoires absentes", () => {
  const { ensemble, user, message } = messagesH4N4();
  for (const interdit of ORDRES_INTERDITS) {
    assert(!ensemble.includes(interdit), `h4n4 porte encore : ${interdit}`);
  }
  assertEquals(message.contextIncomplete, false);
  // ⛔ LES TROIS CIBLES DU 2026-09-12 SONT ATTRIBUÉES, une par personne.
  for (const [m, cible] of [["m_a", 1800], ["m_b", 2700], ["m_c", 3600]]) {
    assert(
      lignesDe(user, String(m)).some((l) =>
        l.includes(`target_kcal=${cible}`) && l.includes("date=2026-09-12")
      ),
      `la cible ${cible} du 2026-09-12 n'est pas attribuée à ${m}`,
    );
  }
});

Deno.test("⑩ bis h2n2 — deux couloirs de densité sur la MÊME case, deux propriétaires", () => {
  // ⚠️ LA FORME EXACTE DE L'ARCHIVE : deux `cell_bounds_off` sur `fri/dinner`,
  // « 123 to 250 » et « 112 to 250 », sans la moindre identité.
  const { ensemble, user } = messages({
    bouches: ["m_a", "m_b"],
    jours: ["fri", "sat", "sun"],
    complements: [{
      memberId: "m_b",
      date: "2026-09-13",
      dayToken: "sun",
      slot: "breakfast",
    }],
    defects: [
      defaut({
        kind: "safety",
        cause: "member_exclusion_served",
        day: "fri",
        memberId: "m_a",
        detail:
          "⛔ This plan names a food that somebody at this table must not eat, " +
          "for a MEDICAL reason.",
      }),
      defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        day: "fri",
        slot: "dinner",
        memberId: "m_a",
        detail:
          "its calories are already right; the dish carries 253 kcal per 100 g " +
          "and it must be 123 to 250 kcal/100 g.",
        measure: {
          of: "density",
          per100G: 253,
          minPer100G: 123,
          maxPer100G: 250,
        },
      }),
      defaut({
        kind: "sizing",
        cause: "cell_bounds_off",
        day: "fri",
        slot: "dinner",
        memberId: "m_b",
        detail:
          "its calories are already right; the dish carries 253 kcal per 100 g " +
          "and it must be 112 to 250 kcal/100 g.",
        measure: {
          of: "density",
          per100G: 253,
          minPer100G: 112,
          maxPer100G: 250,
        },
      }),
      defaut({
        kind: "sizing",
        cause: "dedicated_complement_needed",
        source: "upstream",
        day: "sun",
        slot: "breakfast",
        memberId: "m_b",
        detail: [
          ...DEDICATED_DISH_HEAD,
          dedicatedDishLine({
            memberId: "m_b",
            day: "sun",
            slot: "breakfast",
            direction: "densify",
            aimPer100G: 241,
            floorPer100G: null,
          }),
        ].join("\n"),
      }),
    ],
  });
  for (const interdit of ORDRES_INTERDITS) {
    assert(!ensemble.includes(interdit), `h2n2 porte encore : ${interdit}`);
  }
  assert(
    lignesDe(user, "m_a").some((l) =>
      l.includes("min_per_100g=123") && l.includes("slot=dinner")
    ),
    user,
  );
  assert(
    lignesDe(user, "m_b").some((l) =>
      l.includes("min_per_100g=112") && l.includes("slot=dinner")
    ),
    user,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ LE CÂBLAGE — LA PRODUCTION PASSE LA VRAIE TABLE, ET ELLE S'ARRÊTE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑪ la lane passe l'index RÉEL, celui du périmètre et de la projection", () => {
  // ⛔ CE QUE CE TEST EMPÊCHE. `index` est requis et nullable : une lane qui
  // passerait `null` composerait un message sans un seul jeton d'unité, et
  // aucun test de forme ne le verrait — l'adresse serait juste plus pauvre.
  // On épingle donc que la MÊME table sert les trois : la table des unités, le
  // périmètre et le message.
  const src = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const at = src.indexOf("const c4Units = buildRepairUnits({");
  assert(at > 0, "la table des unités n'est plus construite");
  const bloc = src.slice(at, at + 4000);
  assert(bloc.includes("index: c4Units,"), "le périmètre ne lit plus la table");
  const appel = src.indexOf(": planRepairMessage({");
  assert(appel > at, "le message de réparation n'est plus composé après la table");
  const args = src.slice(appel, appel + 800);
  assert(args.includes("index: c4Units,"), "le message reçoit une AUTRE table\n" + args);
  assert(args.includes("sessions: c4Sessions,"), args);
  assert(args.includes("scope: c4Scope,"), args);
});

Deno.test("⑪ bis — un contexte incomplet ARRÊTE la lane avant de consommer le budget", () => {
  const src = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const garde = src.indexOf("} else if (c4Composed.contextIncomplete) {");
  assert(garde > 0, "l'état « contexte incomplet » n'arrête plus rien");
  const apres = src.slice(garde, garde + 1400);
  assert(apres.includes("c4Stop = true;"), apres);
  assert(
    apres.includes("plan_repair_context_ownerless:") &&
      apres.includes("plan_repair_context_truncated:"),
    "les deux causes ne sont plus distinguées au journal\n" + apres,
  );
  // ⛔ ET IL EST LU AVANT LE BUDGET. Un appel refusé pour contexte ne doit pas
  // brûler une tentative.
  const budget = src.indexOf("planBudget.askRepair(", garde);
  assert(budget > garde, "le budget est consulté avant la garde de contexte");
  // ⛔ ET LES NOMBRES PARTENT AU JOURNAL, sans quoi un contexte amputé se relit
  // comme un contexte complet.
  assert(src.includes("defects_rendered: c4Composed?.defectCounts ?? null,"), src.length + "");
  assert(src.includes("context_incomplete: c4Composed?.contextIncomplete ?? null,"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑫ ⟳ 2026-09-13 · LOT 2 — LE LOT COMMUN REND LE CONTRAT DE **CHAQUE** BOUCHE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE TROU QUE CETTE SECTION FERME, ET C'EST UN CRITÈRE DE SORTIE (§ 1.6) :
// « pour un lot commun, les contrats des consommateurs sains sont présents et
// mesurables après réparation ». Le message disait QUI mange dans la casserole
// et COMBIEN DE PARTS chacun y tire — jamais la CIBLE ni les BORNES de ceux qui
// sont déjà dans leurs clous. Le modèle pouvait donc recomposer le lot pour la
// personne en défaut et casser les trois autres sans savoir qu'il les cassait.

/** L'en-tête du bloc, telle qu'elle sort. Sa présence EST le déclenchement. */
const TETE_DU_LOT = "WHAT EACH PORTION OUT OF";

/**
 * Les lignes de contrat d'un lot commun — une bouche, un repas.
 *
 * ⚠️ ON LES PREND DANS LA PROJECTION, ET LA FORME EST LA CLÉ : `· U3 date=…`.
 * Une consigne de défaut porte elle aussi `energy_served_kcal=` ; les mélanger
 * ferait compter une instruction comme un contrat de bouche saine.
 */
function lignesDuLot(texte: string): string[] {
  return projectionDe(texte).split("\n").filter((l) =>
    /^\s+· U\d+ date=/.test(l) && l.includes("energy_served_kcal=")
  );
}

/** Ce qu'une ligne de contrat porte comme nombre, par champ. */
function champsDe(ligne: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const bout of ligne.split(" | ")) {
    const m = /^([a-z_0-9]+)=([^\s]+)/.exec(bout.trim().replace(/^· \S+ /, ""));
    if (m !== null) out[m[1]] = m[2];
  }
  return out;
}

Deno.test("⑫ UNE seule bouche en défaut: les TROIS autres contrats voyagent", () => {
  const { user, message } = messages({
    bouches: N4_BOUCHES,
    defects: [cibleDeCase("m_a", 639)],
  });
  assert(user.includes(TETE_DU_LOT), user);
  const lignes = lignesDuLot(user);
  assert(lignes.length > 0, "aucun contrat de lot commun\n" + user);
  // ⛔ CHAQUE BOUCHE A SES PROPRES NOMBRES, ET SEULEMENT LES SIENS. C'est
  // l'exigence littérale : « les quantités réellement mesurées de chacun, pas
  // les quantités du maître recopiées sur les autres. »
  N4_BOUCHES.forEach((m, rang) => {
    const n = chiffresDe(rang);
    const miennes = lignes.filter((l) => l.includes(`member_id=${m}`));
    assert(miennes.length > 0, `${m} n'a aucun contrat de lot\n${user}`);
    for (const l of miennes) {
      const c = champsDe(l);
      assertEquals(c.energy_served_kcal, String(n.servedKcal), l);
      assertEquals(c.target_kcal, String(n.targetKcal), l);
      assertEquals(c.min_g, String(n.gramsMin), l);
      assertEquals(c.max_g, String(n.gramsMax), l);
    }
  });
  // ⛔ ET AUCUNE VALEUR D'UNE AUTRE PERSONNE NE FIGURE SUR LA LIGNE DE
  // QUELQU'UN. Une recopie du maître de maison rendrait le test précédent vert
  // si, par malheur, les deux avaient la même cible ; ici on l'interdit par
  // construction.
  const ciblesAutres = N4_BOUCHES.slice(1).map((_, i) =>
    String(chiffresDe(i + 1).targetKcal)
  );
  for (const l of lignes.filter((x) => x.includes("member_id=m_a"))) {
    for (const t of ciblesAutres) {
      assert(!l.includes(`target_kcal=${t}`), `cible recopiée : ${l}`);
    }
  }
  // ⛔ LES TROIS SAINES SONT ANNONCÉES COMME TELLES, ET LA PHRASE DÉSIGNE LA
  // PORTION — pas le plan.
  for (const m of N4_BOUCHES.slice(1)) {
    const miennes = lignes.filter((l) => l.includes(`member_id=${m}`));
    assert(
      miennes.every((l) => l.includes("ALREADY RIGHT")),
      `${m} n'est pas annoncée déjà juste\n${miennes.join("\n")}`,
    );
  }
  // ⛔ ET LA PORTION QU'ON DEMANDE DE CORRIGER N'EST PAS ANNONCÉE « DÉJÀ
  // JUSTE ». Ce dépôt a déjà payé les faits faux indémentables : le message se
  // contredirait dans son propre texte.
  const enDefaut = lignes.filter((l) =>
    l.includes("member_id=m_a") && l.includes("slot=dinner") &&
    l.includes("date=2026-09-12")
  );
  assertEquals(enDefaut.length, 1, enDefaut.join("\n"));
  assert(!enDefaut[0].includes("ALREADY RIGHT"), enDefaut[0]);
  assert(enDefaut[0].includes("asked for above"), enDefaut[0]);
  // ⛔ L'ÉCHELLE EST DITE UNE SEULE FOIS, ET C'EST CELLE DE LA PROJECTION.
  assertEquals(
    user.split("the amounts under a preparation are the WHOLE BATCH").length - 1,
    1,
    "l'échelle est écrite deux fois",
  );
  assertEquals(message.projection.counters.pots_with_consumers, 1);
  assertEquals(message.projection.counters.pot_consumers_unnumbered, 0);
  assertEquals(
    message.projection.counters.pot_consumers_listed,
    lignes.length,
  );
});

Deno.test("⑫ bis — DEUX PRÉNOMS IDENTIQUES autour du même lot restent deux contrats", () => {
  // ⛔ LE PRÉNOM N'EST JAMAIS UNE CLÉ DE JOINTURE. Deux « Léa » qui puisent la
  // même casserole ont deux cibles ; les apparier par le nom en perdrait une,
  // et c'est celle-là qu'on casserait sans le savoir.
  const bouches = ["lea_1", "lea_2", "m_c", "m_d"];
  const { user } = messages({
    bouches,
    defects: [cibleDeCase("lea_1", 639)],
  });
  const lignes = lignesDuLot(user);
  const pour = (m: string) => lignes.filter((l) => l.includes(`member_id=${m}`));
  assert(pour("lea_1").length > 0 && pour("lea_2").length > 0, user);
  assertEquals(pour("lea_1").length, pour("lea_2").length);
  assertEquals(
    champsDe(pour("lea_1")[0]).target_kcal,
    String(chiffresDe(0).targetKcal),
  );
  assertEquals(
    champsDe(pour("lea_2")[0]).target_kcal,
    String(chiffresDe(1).targetKcal),
  );
  // ⛔ ET LES DEUX NE PARTAGENT AUCUN NOMBRE.
  assert(
    champsDe(pour("lea_1")[0]).energy_served_kcal !==
      champsDe(pour("lea_2")[0]).energy_served_kcal,
    pour("lea_1")[0] + "\n" + pour("lea_2")[0],
  );
});

Deno.test("⑫ ter — un lot qui nourrit PLUSIEURS JOURS nomme chaque date", () => {
  // ⚠️ UNE SEULE BOUCHE, DEUX JOURS : le déclencheur n'est pas le nombre de
  // personnes, c'est « plusieurs personnes OU plusieurs jours ». Une casserole
  // cuisinée samedi et mangée dimanche a deux contrats à respecter.
  const { user } = messages({
    bouches: ["m_a"],
    jours: ["sat", "sun"],
    defects: [cibleDeCase("m_a", 639)],
  });
  assert(user.includes(TETE_DU_LOT), user);
  const lignes = lignesDuLot(user);
  for (const date of ["2026-09-12", "2026-09-13"]) {
    assert(
      lignes.some((l) => l.includes(`date=${date}`)),
      `${date} n'a aucun contrat\n${lignes.join("\n")}`,
    );
  }
  // ⛔ ET CHAQUE LIGNE PORTE SON CRÉNEAU : une date sans moment ne désigne pas
  // une case.
  for (const l of lignes) assert(/slot=[a-z_]+/.test(l), l);
});

Deno.test("⑫ LE CAS QUI PASSE — un lot à UN seul consommateur n'écrit pas ce bloc", () => {
  // ⛔ UNE GARDE ÉPROUVÉE SEULEMENT SUR CE QU'ELLE OUVRE EST INDISCERNABLE
  // D'UNE GARDE QUI OUVRE TOUT. Une bouche, un jour: il n'y a aucun second
  // contrat à respecter, et écrire le bloc serait du bruit — c'est le bruit qui
  // fait sauter le plafond.
  const { user, scope, message } = messages({
    bouches: ["m_a"],
    jours: ["sat"],
    defects: [cibleDeCase("m_a", 639)],
  });
  assert(scope.preparationIds.includes("prep_commun"), "le lot n'est pas ouvert");
  assert(user.includes("THE PREPARATIONS THOSE MEALS DRAW ON"), user);
  assert(!user.includes(TETE_DU_LOT), user);
  assertEquals(message.projection.counters.pots_with_consumers, 0);
  assertEquals(message.projection.counters.pot_consumers_listed, 0);
});

Deno.test("⑫ SANS TABLE DE NUTRITION — aucun bloc, et le compteur le DIT", () => {
  // ⛔ `null` EST UNE RÉPONSE, ET SON TÉMOIN EST OBLIGATOIRE. Sans ces deux
  // compteurs, une lane qui ne passe pas les tables rend exactement la même
  // projection qu'une lane complète : un lot désarmé ressemble à un lot qui
  // marche.
  const { user, message } = messages({
    bouches: N4_BOUCHES,
    defects: [cibleDeCase("m_a", 639)],
    sansNutrition: true,
  });
  assert(!user.includes(TETE_DU_LOT), user);
  assertEquals(message.projection.counters.pots_with_consumers, 0);
  assertEquals(message.projection.counters.pot_consumers_listed, 0);
  // ⚠️ ET LE RESTE DU BLOC DES CASSEROLES EST TOUJOURS LÀ : l'absence de tables
  // retire les contrats, pas la casserole.
  assert(user.includes("⛔ SHARED:"), user);
});

Deno.test("⑫ CONTRE-CAS ADVERSE — aucune interdiction GLOBALE n'est réintroduite", () => {
  // ⛔ LE LOT 1 VIENT DE RETIRER QUATRE INTERDICTIONS DE CE TYPE. « Ne change
  // rien d'autre » et « rends le plan complet » sont exactement ce qu'une
  // phrase de protection des portions saines ramènerait par la fenêtre.
  const { ensemble, user } = messages({
    bouches: N4_BOUCHES,
    defects: [cibleDeCase("m_a", 639)],
  });
  for (const interdit of ORDRES_INTERDITS) {
    assert(!ensemble.includes(interdit), `le bloc du lot porte : ${interdit}`);
  }
  for (
    const interdit of [
      "do not change anything else",
      "Do not change anything else",
      "leave everything else",
      "Leave everything else",
      "keep the rest of the plan",
      "Keep the rest of the plan",
      "do not modify any other",
    ]
  ) {
    assert(!ensemble.includes(interdit), `interdiction globale : ${interdit}`);
  }
  // ⛔ ET LES DEUX ÉCHAPPATOIRES D'UNE RECETTE À PLUSIEURS CONTRATS SONT
  // NOMMÉES — la moyenne et l'élargissement.
  assert(user.includes("Do not average these targets"), user);
  assert(user.includes("do not widen"), user);
  // ⛔ ON NE DEMANDE JAMAIS DEUX ÉNERGIES À UNE MÊME PORTION STANDARD : c'est
  // le moteur qui répartit, et la phrase le dit.
  assert(
    user.includes("one standard portion does") &&
      user.includes("not carry two different energies"),
    user,
  );
});

Deno.test("⑫ N=4 sur trois jours — la taille tient, et un débordement se DIT", () => {
  // ⛔ LA MESURE, PAS LE CONFORT. Les contrats des bouches saines gonflent le
  // message : sur la forme du tir `perte-h4n4` (4 bouches, 3 jours, 55 défauts)
  // la projection passe de 2 460 à ~11 000 caractères, pour 36 contrats de lot.
  // C'est sous le plafond DUR (24 000), et l'appel part.
  const { message } = messagesH4N4();
  assertEquals(message.tooLarge, false);
  assertEquals(message.contextIncomplete, false);
  assertEquals(message.defectCounts.dropped, 0);
  assertEquals(message.projection.counters.pot_consumers_listed, 36);
  assertEquals(message.projection.counters.pot_consumers_unnumbered, 0);
  assert(
    message.projection.counters.chars < PLAN_PROJECTION_HARD_CHARS,
    `la projection déborde : ${message.projection.counters.chars}`,
  );
  // ⛔ ET SI ELLE DÉBORDAIT, ON LE DIRAIT AU LIEU DE COUPER. Le bloc des
  // contrats est OBLIGATOIRE : il ne se sacrifie pas en silence, il fait rendre
  // `tooLarge`, et la lane s'arrête sur `plan_repair_context_too_large`.
  const serre = messages({
    bouches: N4_BOUCHES,
    jours: N4_JOURS.map(([d]) => d),
    defects: [cibleDeCase("m_a", 639)],
    hardMaxChars: 1_500,
  });
  assertEquals(serre.message.tooLarge, true);
  assert(serre.user.includes(TETE_DU_LOT), "le bloc a été coupé en silence");
});

Deno.test("⑫ les NOMS de champs sont ceux des mesures, pas une seconde grammaire", () => {
  // ⛔ DEUX FORMULATIONS DE LA MÊME GRANDEUR, C'EST LA SECONDE QU'ON RELIT LE
  // MOINS. Les contrats d'un lot commun et les mesures d'un défaut nomment les
  // mêmes choses : ce test épingle qu'ils les nomment PAREIL.
  const champsMesure = repairMeasureFields({
    of: "energy",
    servedKcal: 1,
    targetKcal: 2,
    deltaPct: null,
    tolerancePct: 3,
  });
  for (const nom of ["energy_served_kcal", "target_kcal"]) {
    assert(champsMesure.includes(`${nom}=`), champsMesure);
  }
  const masse = repairMeasureFields({ of: "mass", grams: 1, minG: 2, maxG: 3 });
  for (const nom of ["mass_served_g", "min_g", "max_g"]) {
    assert(masse.includes(`${nom}=`), masse);
  }
  const densite = repairMeasureFields({
    of: "density",
    per100G: 1,
    minPer100G: 2,
    maxPer100G: 3,
  });
  for (const nom of ["density_served_per_100g", "min_per_100g", "max_per_100g"]) {
    assert(densite.includes(`${nom}=`), densite);
  }
  const { user } = messages({
    bouches: N4_BOUCHES,
    defects: [cibleDeCase("m_a", 639)],
  });
  const ligne = lignesDuLot(user)[0] ?? "";
  for (
    const nom of [
      "energy_served_kcal",
      "target_kcal",
      "mass_served_g",
      "min_g",
      "max_g",
    ]
  ) {
    assert(ligne.includes(`${nom}=`), ligne);
  }
});

Deno.test("⑫ les BORNES ne sortent que quand elles s'appliquent", () => {
  // ⛔ `min_per_100g=?` FERAIT LIRE « une borne existe et je l'ai perdue » là où
  // le contrat s'est simplement abstenu. La fixture ne donne un couloir de
  // densité qu'à une bouche sur deux, et c'est la seule façon de le prouver.
  const { user } = messages({
    bouches: N4_BOUCHES,
    defects: [cibleDeCase("m_a", 639)],
  });
  const lignes = lignesDuLot(user);
  const avec = lignes.filter((l) => l.includes("member_id=m_b"));
  const sans = lignes.filter((l) => l.includes("member_id=m_a"));
  assert(avec.length > 0 && sans.length > 0, user);
  for (const l of avec) {
    assertEquals(champsDe(l).min_per_100g, String(chiffresDe(1).densityMin), l);
    assertEquals(
      champsDe(l).density_served_per_100g,
      String(chiffresDe(1).densityPer100G),
      l,
    );
  }
  for (const l of sans) assert(!l.includes("per_100g"), l);
  // ⛔ ET AUCUN `?` NE TRAÎNE quand les deux tables sont complètes.
  for (const l of lignes) assert(!l.includes("=?"), l);
});

Deno.test("⑫ câblage — la lane passe les DEUX tables, et jamais `null` quand elle mesure", () => {
  // ⛔ CE QUE CE TEST EMPÊCHE. `nutrition` est requis ET nullable : une lane qui
  // passerait `null` en permanence composerait un message sans un seul contrat
  // de bouche saine, et aucun test de forme ne le verrait — le bloc se
  // tairait, exactement comme avant le lot.
  const src = Deno.readTextFileSync(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const appel = src.indexOf(": planRepairMessage({");
  assert(appel > 0, "le message de réparation n'est plus composé");
  const args = src.slice(appel, appel + 2400);
  assert(args.includes("nutrition: composition === null"), args);
  // ⛔ LES DEUX TABLES SONT CELLES DE LA PASSE DE DÉFAUTS, pas un second calcul.
  assert(
    args.includes("{ cells: auditCellRows, contracts: auditCells }"),
    "la lane ne passe pas les tables de la passe de défauts\n" + args,
  );
  const passe = src.indexOf("const c4Pass = collectPlanDefects({");
  assert(passe > 0 && passe < appel, "la passe de défauts a bougé");
  const bloc = src.slice(passe, appel);
  assert(bloc.includes("cells: auditCellRows"), bloc.slice(0, 400));
  assert(bloc.includes("contracts: composition === null ? [] : auditCells"), bloc.slice(0, 1200));
  // ⛔ ET LES COMPTEURS PARTENT AU JOURNAL, sans quoi un bloc muet se relit
  // comme un bloc absent de raison.
  assert(src.includes("...(c4Composed?.projection.counters ?? {}),"), "les compteurs ne partent plus");
});

Deno.test("⑫ un défaut de JOURNÉE couvre tous les repas de cette bouche-là", () => {
  // ⛔ `day_energy_off` ET `protein_floor_short` N'ONT PAS DE CRÉNEAU. Marquer
  // « déjà juste » les six repas d'une bouche dont la journée est en défaut
  // ferait dire au message le contraire de la consigne d'à côté — un fait faux,
  // dans son propre texte.
  const { user } = messages({
    bouches: N4_BOUCHES,
    defects: [
      cibleDeCase("m_a", 639),
      defaut({
        kind: "sizing",
        cause: "day_energy_off",
        day: "2026-09-12",
        date: "2026-09-12",
        memberId: "m_c",
        detail: "across that day the plates carry 2702 kcal.",
        measure: {
          of: "energy",
          servedKcal: 2702,
          targetKcal: 2459,
          deltaPct: null,
          tolerancePct: 5,
        },
      }),
    ],
  });
  const lignes = lignesDuLot(user);
  const ceJour = (m: string) =>
    lignes.filter((l) =>
      l.includes(`member_id=${m}`) && l.includes("date=2026-09-12")
    );
  assert(ceJour("m_c").length > 0, user);
  for (const l of ceJour("m_c")) assert(!l.includes("ALREADY RIGHT"), l);
  // ⚠️ ET SON LENDEMAIN, LUI, EST BIEN DÉJÀ JUSTE : la journée en défaut ne
  // contamine pas les autres.
  const demain = lignes.filter((l) =>
    l.includes("member_id=m_c") && l.includes("date=2026-09-13")
  );
  assert(demain.length > 0, user);
  for (const l of demain) assert(l.includes("ALREADY RIGHT"), l);
  // ⚠️ ET UNE BOUCHE SANS AUCUN DÉFAUT RESTE DÉJÀ JUSTE PARTOUT.
  for (const l of lignes.filter((x) => x.includes("member_id=m_d"))) {
    assert(l.includes("ALREADY RIGHT"), l);
  }
});
