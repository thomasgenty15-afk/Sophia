/**
 * ══════════════════════════════════════════════════════════════════════════
 * ÉTAPE C5 — LA POLITIQUE ARMÉE, ET LE RÉSULTAT DE VALIDATION PERSISTÉ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le plan de clôture (§ C5) les nomme : « refus sans écriture ; version avec
 * écart visible à réception puis après vraie relecture API ; version conforme
 * sans faux avertissement ; plusieurs personnes ; absence de fuite de chiffres
 * protégés ; état serveur perdu à la sérialisation détecté par le test. »
 *
 * Ce fichier tient la moitié PURE de cette liste — le verdict, la forme
 * persistée, la porte des chiffres. Le parcours HTTP complet (422 → relecture de
 * la base) est tenu par le transport contrôlé, et le câblage du handler par
 * `plan_validation_wiring_test.ts`.
 *
 * ⛔ CHAQUE GARDE A UN CAS QUI PASSE. Une garde éprouvée seulement sur ce
 * qu'elle refuse est indiscernable d'une garde cassée (cicatrice
 * `guards-need-a-passing-case`).
 */
import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
  PAUL,
} from "./final_plan_gate_fixtures.ts";
import {
  DELIVERY_STATES,
  FINAL_GATE_CAUSES,
  FINAL_GATE_POLICY_LOT_1,
  FINAL_GATE_POLICY_LOT_4,
  type FinalGateCause,
  type FinalGateOutcome,
  finalGateDelivery,
  finalPlanGate,
  type GateRefusal,
} from "./final_plan_gate.ts";
import {
  CALORIE_PROTECTED_CAUSES,
  isCalorieProtectedCause,
  PLAN_VALIDATION_STATES,
  PLAN_VALIDATION_VERSION,
  planValidationRecord,
  publicRefusals,
  validationStateOf,
} from "./plan_validation.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA POLITIQUE — CE QUI EST ARMÉ, ET CE QUI NE PEUT PAS L'ÊTRE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① le lot 4 arme HUIT causes, nommément — et pas une de plus", () => {
  const armees = FINAL_GATE_CAUSES.filter((c) =>
    FINAL_GATE_POLICY_LOT_4[c] === "refuse"
  );
  // ⛔ LA LISTE EST ÉCRITE, PAS COMPTÉE. Un test qui n'épinglerait que le
  // NOMBRE resterait vert si on échangeait une cause contre une autre — et
  // c'est exactement « ne pas changer simplement son numéro ».
  //
  // ⟳ 2026-09-12 · LOT 2 — ELLES ÉTAIENT DOUZE. `ingredient_not_bought` et
  // `ingredient_short_bought` passent en `count`, sur l'arbitrage de livraison
  // déjà tranché: « après deux réparations infructueuses, livrer la meilleure
  // version sûre et complète avec ses écarts signalés; une portion obligatoire
  // absente ou dangereuse empêche l'activation ». Ce qui bloque est donc la
  // SÉCURITÉ et `cell_without_portion`. Les deux causes d'achat restent
  // COMPTÉES — voir le cas juste en dessous, qui l'épingle: la revue C6 § 5
  // interdit de « choisir entre tout refuser et masquer le manque ».
  //
  // ⟳ 2026-09-12 · LOT 3 — `perishable_bought_too_early` était passée en
  // `count`, pour une raison qui lui était propre : `buy_on` n'est pas écrit
  // par le modèle, il est CALCULÉ par `buyDatesByIndex`. Elle accusait donc
  // notre propre ordonnancement des courses, et un plan entier était refusé
  // pour une date que nous avions choisie — mesuré sur le tir 3 réel du
  // 2026-09-12, avec en prime une phrase fausse sur du thon en boîte.
  //
  // ⟳ 2026-09-12 · FERMETURE LOT 2 — ELLE EST RÉARMÉE, 9 → 10. La revue le
  // demande en toutes lettres : « la date a été calculée par nous » justifie de
  // la CORRIGER, pas de servir le résultat. Ce qui a changé depuis est la CAUSE
  // du faux positif, pas la sévérité : la datation et la garde lisent désormais
  // la même conservation (`keepingOf`), donc une conserve n'a plus de fenêtre
  // des deux côtés, et une fenêtre qui mord ici est une incompatibilité RÉELLE.
  //
  // ⟳ 2026-09-14 · BÊTA 1A — 10 → 12. `dedicated_dish_missing` (la casserole
  // commune ne peut PAS nourrir cette bouche, et rien ne lui est attribué) et
  // `cell_two_table_dishes` (deux repas concurrents sur une même case). Les
  // deux sont de la même famille que les dix autres — sécurité et livraison,
  // jamais qualité: la première pose devant quelqu'un une assiette que sa ligne
  // lui interdit, la seconde le sert deux fois. ⚠️ La seconde ne refuse AUCUN
  // plan qui passait hier: le même plan tombait déjà par `mouth_unfed/double`,
  // sous un nom qui décrivait la conséquence au lieu de la cause.
  // ⟳ 2026-09-19 — 12 → 8. `cell_without_dish`, `mouth_unfed`,
  // `cell_without_portion` et `cell_two_table_dishes` passent en `count` : la
  // complétude d'une case se RÉPARE (elle reste chassée, voir
  // `plan_repair_blocking_test.ts`), puis se LIVRE nommée. Décision produit,
  // mesurée avant : 3 plans sur 5 refusés pour cette seule famille sur un foyer
  // à 42 cases. Ce qui reste armé est la sécurité, une bouche que la casserole
  // ne peut pas nourrir, et les impossibilités de calendrier.
  assertEquals([...armees].sort(), [
    "boxes_none_delivered",
    "dedicated_dish_missing",
    "eaten_before_cooked",
    "eaten_too_late",
    "house_rule_served",
    "perishable_bought_too_early",
    "regime_forbidden_component",
    "table_exclusion_served",
  ]);
  // ⛔ ET LES NEUF QUI RESTENT SONT TOUTES DE LA SÉCURITÉ OU DE LA LIVRAISON.
  // C'est l'arbitrage de l'utilisateur, mot pour mot : « une portion
  // obligatoire absente ou dangereuse empêche l'activation ». Aucune cause de
  // QUALITÉ (énergie, densité, protéine, achat, date de courses) n'est armée.
  // ⚠️ `perishable_bought_too_early` A QUITTÉ CETTE LISTE le 2026-09-12: ce
  // n'est pas une cause de QUALITÉ, c'est une incompatibilité de conservation —
  // servir un poisson acheté trois jours trop tôt n'est pas un écart chiffré,
  // c'est un plan qu'on ne doit pas activer.
  // ⟳ 2026-09-14 · BÊTA 1A — `own_meal_dish_missing` REJOINT CETTE LISTE, et
  // c'est la moitié qui rend la précédente lisible: « mon petit-déjeuner à
  // moi » est une habitude, pas une impossibilité. Elle s'annonce, elle ne
  // refuse pas.
  // ⟳ 2026-09-19 — et les quatre causes de COMPLÉTUDE d'une case.
  for (const c of ["cell_energy_off", "cell_bounds_off", "day_energy_off",
    "protein_floor_short", "ingredient_not_bought", "ingredient_short_bought",
    "mouth_energy_short", "own_meal_dish_missing", "cell_without_dish",
    "mouth_unfed", "cell_without_portion", "cell_two_table_dishes"] as const) {
    assertEquals(FINAL_GATE_POLICY_LOT_4[c], "count", `${c} ne doit pas bloquer`);
  }
});

Deno.test("① les deux causes d'achat ne bloquent plus — et elles sont TOUJOURS comptées", () => {
  // ⛔ LE PIÈGE QUE CE CAS FERME. Passer une cause en `count` et la laisser
  // disparaître de la mesure serait « masquer le manque », l'autre moitié de
  // ce que la revue interdit. Ces deux-là doivent continuer de sortir dans
  // `refusals[]`, donc dans `gaps`, donc dans le résultat de validation — on
  // mesure toujours l'omission INITIALE du modèle.
  for (const cause of ["ingredient_not_bought", "ingredient_short_bought"] as const) {
    assertEquals(FINAL_GATE_POLICY_LOT_4[cause], "count", cause);
  }
  const refusal: GateRefusal = {
    cause: "ingredient_not_bought",
    severity: "count",
    day: null,
    slot: null,
    dish: null,
    preparation_id: null,
    member_id: null,
    term: "feta",
    detail: "« feta » n'est ni sur la liste de courses ni au garde-manger",
  };
  const vide = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const outcome = { ...vide, refusals: [refusal] };
  const delivery = finalGateDelivery(outcome, []);
  assertEquals(delivery.blocking.length, 0, "elle n'empêche plus l'activation");
  assertEquals(delivery.state, "deliverable_with_gaps");
  const record = planValidationRecord({ outcome, delivery });
  assertEquals(record.defects[0].cause, "ingredient_not_bought");
  assertEquals(record.counts.gaps, 1, "⛔ elle reste COMPTÉE");
});

Deno.test("① AUCUNE cause armée ne porte un chiffre protégé", () => {
  // ⛔ C'EST CE QUI REND LE `detail` DU CORPS 422 SÛR AUJOURD'HUI. La porte de
  // `publicRefusals` existe quand même (test ⑤) — mais tant que cet invariant
  // tient, elle n'a rien à retirer, et ce test le DIT au lieu de l'espérer.
  for (const cause of FINAL_GATE_CAUSES) {
    if (FINAL_GATE_POLICY_LOT_4[cause] !== "refuse") continue;
    assert(
      !isCalorieProtectedCause(cause),
      `${cause} est armée ET porte un chiffre protégé: le corps 422 fuirait`,
    );
  }
});

Deno.test("① les cinq causes de la famille calorique restent en `count`", () => {
  // ⛔ L'ARBITRAGE DU LOT 2, APPLIQUÉ AUX CINQ: « sous-nourrir est une question
  // de QUALITÉ DE COMPOSITION, et refuser là-dessus priverait des gens de
  // dîner ». Elles font basculer la LIVRAISON, jamais l'écriture.
  for (const cause of CALORIE_PROTECTED_CAUSES) {
    assertEquals(
      FINAL_GATE_POLICY_LOT_4[cause],
      "count",
      `${cause} ne doit pas refuser un plan`,
    );
  }
});

Deno.test("① le cas qui PASSE — le foyer propre n'est pas refusé par le lot 4", () => {
  // ⛔ SANS CE CAS, « la garde refuse » serait indiscernable de « la garde
  // refuse TOUT ». Le plan l'écrit: « ne pas déclarer la campagne réussie parce
  // que le système sait désormais refuser tous les plans. »
  const sous1 = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_1,
  });
  const sous4 = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  assertEquals(sous1.ok, true);
  assertEquals(sous4.ok, true, "le foyer propre reste livrable sous le lot 4");
  assertEquals(finalGateDelivery(sous4, []).blocking.length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② UN DÉFAUT DE SÉCURITÉ ET UNE PORTION OBLIGATOIRE ABSENTE EMPÊCHENT TOUT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le plan propre, avec un ingrédient que la table exclut, servi à un plat.
 *
 * ⚠️ SUR LE PLAT DE TABLE (index 1, le dahl), ET PAS SUR UN PLAT EN BOÎTES.
 * La garde lit la surface d'un plat en boîtes sur SES CONTENANTS, jamais sur
 * ses `ingredients` — un interdit posé sur le petit-déjeuner en boîtes n'aurait
 * rien mordu, et le test serait passé pour une raison fausse.
 */
function planAvecInterdit() {
  const plan = structuredClone(CLEAN_HOUSEHOLD_PLAN) as unknown as {
    dishes: { ingredients?: { term: string; group: string | null }[] }[];
  };
  plan.dishes[1].ingredients = [
    ...(plan.dishes[1].ingredients ?? []),
    { term: "arachide", group: null },
  ];
  return plan as unknown as typeof CLEAN_HOUSEHOLD_PLAN;
}

Deno.test("② un défaut de SÉCURITÉ empêche l'activation", () => {
  const ctx = {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    exclusions: {
      table: [{ ruleId: "Pas d'arachide à la maison", token: "arachide" }],
      byMember: [],
    },
    policy: FINAL_GATE_POLICY_LOT_4,
  };
  const morde = finalPlanGate(planAvecInterdit(), ctx);
  assertEquals(morde.counters.refusals_by_cause.table_exclusion_served, 1);
  assertEquals(morde.ok, false);
  assertEquals(finalGateDelivery(morde, []).state, "not_deliverable");
  assertEquals(
    planValidationRecord({
      outcome: morde,
      delivery: finalGateDelivery(morde, []),
    }).state,
    "non_livrable",
  );
  // ── LE CAS QUI PASSE: la MÊME table sans l'ingrédient interdit ───────────
  const propre = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, ctx);
  assertEquals(propre.counters.refusals_by_cause.table_exclusion_served, 0);
  assertEquals(propre.ok, true);
});

/** Une case attendue où un plat est posé et personne n'a de portion. */
function nutritionSansPortion() {
  const base = CLEAN_HOUSEHOLD_CONTEXT.nutrition;
  assert(base !== null && base !== undefined, "la fixture porte une nutrition");
  const cells = base.cells.map((c) =>
    c.memberId === PAUL && c.day === "mon"
      ? {
        ...c,
        hasDish: true,
        hasPortion: false,
        portionExpected: true,
        servedKcal: null,
        proteinG: null,
        deltaPct: null,
        state: "no_portion" as const,
      }
      : c
  );
  return { cells, days: base.days };
}

Deno.test("② une PORTION absente est LIVRÉE NOMMÉE — elle n'empêche plus l'activation (2026-09-19)", () => {
  // ⛔ C'EST LE CAS DU TIR N° 2, ET SA FORME EXACTE: un plat est posé, il a un
  // titre, une méthode — et zéro contenant pour cette bouche.
  //
  // ⟳ 2026-09-19 — CE TEST DISAIT « empêche l'activation ». La décision produit
  // a renversé la sévérité (voir `FINAL_GATE_POLICY_LOT_4`) : la case est
  // toujours MESURÉE, toujours NOMMÉE (repas et personne), mais le plan part.
  // Ce qui est épinglé ici est exactement ce que la revue C6 § 5 exige : on ne
  // masque pas le manque.
  const morde = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: nutritionSansPortion(),
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  assertEquals(morde.counters.refusals_by_cause.cell_without_portion, 1, "toujours mesurée");
  const record = planValidationRecord({
    outcome: morde,
    delivery: finalGateDelivery(morde, []),
  });
  assertEquals(record.state, "livrable_avec_ecarts");
  assertEquals(record.counts.blocking, 0, "elle n'empêche plus l'activation");
  assert(record.counts.gaps >= 1, "⛔ elle reste COMPTÉE");
  // ⛔ ET LE SITE EST NOMMÉ: le repas ET la personne. « Il manque une portion »
  // sans dire OÙ n'aide personne à corriger quoi que ce soit.
  const ecart = record.defects.find((d) => d.cause === "cell_without_portion");
  assertEquals(ecart?.blocking, false);
  assertEquals(ecart?.member_id, PAUL);
  assertEquals(ecart?.slot, "dinner");
  assertEquals(ecart?.day, "mon");
  // ── LE CAS QUI PASSE: la MÊME politique sur la nutrition d'origine ───────
  const propre = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  assertEquals(propre.counters.refusals_by_cause.cell_without_portion, 0);
  assertEquals(propre.ok, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE RÉSULTAT PERSISTÉ — QUATRE LISTES QUI NE SE FONDENT JAMAIS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ les trois états couvrent les trois livraisons, sans trou", () => {
  assertEquals(PLAN_VALIDATION_STATES.length, DELIVERY_STATES.length);
  assertEquals(
    DELIVERY_STATES.map(validationStateOf),
    ["conforme", "livrable_avec_ecarts", "non_livrable"],
  );
});

Deno.test("③ le plan propre rend `conforme`, et AUCUN faux avertissement", () => {
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const delivery = finalGateDelivery(outcome, []);
  const record = planValidationRecord({ outcome, delivery });
  assertEquals(record.version, PLAN_VALIDATION_VERSION);
  assertEquals(record.state, "conforme");
  assertEquals(record.defects, []);
  assertEquals(record.counts.blocking, 0);
  assertEquals(record.counts.gaps, 0);
});

Deno.test("③ défauts, incomplets, non applicables et non tournés sont SÉPARÉS", () => {
  // ⛔ LE PIÈGE QUE CE TEST FERME: additionner ces listes. « Non applicable »
  // n'est pas « non contrôlé », et « on n'a pas pu conclure » n'accuse pas le
  // plan. Trois nombres, trois phrases — c'est la faute de mesure n° 4 du lot 0.
  const base = CLEAN_HOUSEHOLD_CONTEXT.nutrition;
  assert(base !== null && base !== undefined);
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: {
      cells: base.cells,
      // Une journée dont le plancher s'abstient POUR UNE RAISON PROTÉGÉE.
      days: base.days.map((d) =>
        d.memberId === PAUL && d.date === "2026-09-07"
          ? { ...d, protein: { coveredFloorG: null, coveredCeilingG: null, reason: "protected" as const } }
          : d
      ),
    },
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const delivery = finalGateDelivery(outcome, []);
  const record = planValidationRecord({ outcome, delivery });
  const nonApplicables = record.not_applicable.map((c) => c.control);
  assert(
    nonApplicables.includes("protein_floor_protected"),
    `l'abstention protégée doit être NOMMÉE: ${JSON.stringify(record.not_applicable)}`,
  );
  // ⛔ ET ELLE N'EST PAS DANS `incomplete`: une protection n'est pas un trou.
  assert(!record.incomplete.some((c) => c.control === "protein_floor_protected"));
  // ⛔ NI DANS `not_run`, qui ne parle que de dénominateurs à zéro.
  assert(!record.not_run.includes("protein_floor_protected" as FinalGateCause));
  // Le témoin: `not_run` liste bien des CAUSES, pas des contrôles.
  for (const cause of record.not_run) {
    assert(
      (FINAL_GATE_CAUSES as readonly string[]).includes(cause),
      `${cause} n'est pas une cause de la garde`,
    );
  }
});

Deno.test("③ la trace de réparation est STRUCTURÉE, plus une phrase d'`issues`", () => {
  // ⛔ C'EST LA VERSION DURABLE DE `plan_defects_at_delivery:3 (nutrition:3)`.
  // Le plan: « les `issues[]` textuelles seules ne suffisent pas pour la
  // relecture durable ».
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const record = planValidationRecord({
    outcome,
    delivery: finalGateDelivery(outcome, []),
    repair: {
      rounds: 3,
      calls_made: 2,
      defects_at_delivery: 1,
      by_kind: { nutrition: 1 },
      by_source: { gate: 1, output_contract: 0, quantities: 0 },
    },
  });
  assertEquals(record.repair?.calls_made, 2);
  assertEquals(record.repair?.by_source.gate, 1);
  // ── LE CAS QUI PASSE: sans trace de réparation, la clé vaut `null`, jamais
  // un objet de zéros qui se lirait « la boucle a tourné et n'a rien trouvé ».
  const sans = planValidationRecord({
    outcome,
    delivery: finalGateDelivery(outcome, []),
  });
  assertEquals(sans.repair, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ L'ÉTAT SERVEUR SURVIT À LA SÉRIALISATION
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ le résultat traverse JSON sans rien perdre", () => {
  // ⛔ LE PLAN LE DEMANDE NOMMÉMENT: « état serveur perdu à la sérialisation
  // détecté par le test ». L'objet part dans une colonne `jsonb`: un `Set`, une
  // `Map` ou un `undefined` glissé dans une liste disparaîtrait en silence, et
  // l'écran lirait « aucun écart » sur un plan qui en a.
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: nutritionSansPortion(),
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const record = planValidationRecord({
    outcome,
    delivery: finalGateDelivery(outcome, []),
    repair: {
      rounds: 1,
      calls_made: 0,
      defects_at_delivery: 1,
      by_kind: { portion: 1 },
      by_source: { gate: 1 },
    },
  });
  const relu = JSON.parse(JSON.stringify(record));
  assertEquals(relu, record);
  assertEquals(relu.defects.length, record.defects.length);
  // ⟳ 2026-09-19 — la case sans portion est comptée : l'état qui traverse
  // JSON est « livrable avec écarts », et c'est lui que l'écran doit relire.
  assertEquals(relu.state, "livrable_avec_ecarts");
  // ⛔ ET AUCUNE CLÉ NE DEVIENT `undefined` EN CHEMIN: `JSON.stringify` les
  // supprime, donc un champ perdu ne se verrait pas dans une comparaison
  // d'objets faite dans l'autre sens.
  for (const d of relu.defects) {
    for (
      const k of [
        "cause",
        "severity",
        "blocking",
        "day",
        "slot",
        "member_id",
        "dish",
        "term",
        "number_protected",
      ]
    ) {
      assert(k in d, `le champ ${k} a disparu à la sérialisation`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ AUCUN CHIFFRE PROTÉGÉ NE SORT
// ═══════════════════════════════════════════════════════════════════════════

/** Une sortie fabriquée où une cause protégée est armée en `refuse`. */
function sortieAvecChiffreProtege(): {
  outcome: FinalGateOutcome;
  refusal: GateRefusal;
} {
  const refusal: GateRefusal = {
    cause: "day_energy_off",
    severity: "refuse",
    day: "2026-09-07",
    slot: null,
    dish: null,
    preparation_id: null,
    member_id: PAUL,
    term: null,
    detail: "2026-09-07 : 2 455 kcal servies pour 2 916 couvertes (-16 %)",
  };
  const vide = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  return {
    outcome: { ...vide, ok: false, refusals: [refusal] },
    refusal,
  };
}

Deno.test("⑤ le résultat persisté ne porte AUCUN chiffre de la garde", () => {
  const { outcome } = sortieAvecChiffreProtege();
  const record = planValidationRecord({
    outcome,
    delivery: finalGateDelivery(outcome, []),
  });
  const texte = JSON.stringify(record);
  // ⛔ LA MORSURE: le `detail` porte « 2 455 kcal » et « 2 916 ». Aucun des deux
  // ne doit se retrouver dans ce qui part en base — un plancher TCA masque ces
  // nombres à l'écran, et un statut de plan qui les réécrit est la fuite.
  assert(!texte.includes("2 455"), texte);
  assert(!texte.includes("2 916"), texte);
  assert(!texte.includes("kcal"), texte);
  // ⛔ MAIS LE FAIT RESTE: la cause et son site sont là. Cacher le motif serait
  // l'autre faute — la personne ne saurait plus quoi corriger.
  assertEquals(record.defects[0].cause, "day_energy_off");
  assertEquals(record.defects[0].member_id, PAUL);
  assertEquals(record.defects[0].number_protected, true);
});

Deno.test("⑤ `publicRefusals` retire le détail protégé — et GARDE l'autre", () => {
  const { refusal } = sortieAvecChiffreProtege();
  const nonProtege: GateRefusal = {
    cause: "ingredient_not_bought",
    severity: "refuse",
    day: null,
    slot: null,
    dish: null,
    preparation_id: null,
    member_id: null,
    term: "feta",
    detail: "« feta » n'est ni sur la liste de courses ni au garde-manger",
  };
  const sortie = publicRefusals([refusal, nonProtege]);
  // LA MORSURE.
  assertEquals(sortie[0].cause, "day_energy_off");
  assertEquals(sortie[0].detail, null);
  // LE CAS QUI PASSE — des grammes d'ACHAT ne protègent personne, et les
  // cacher priverait la personne du seul fait qui lui dit quoi faire.
  assertEquals(sortie[1].cause, "ingredient_not_bought");
  assert(sortie[1].detail?.includes("feta"));
});

Deno.test("⑤ plusieurs personnes: chaque écart garde SA bouche", () => {
  // ⛔ LE PIÈGE MESURÉ À L'ÉTAPE C4: deux journées de la même bouche portaient
  // la même identité de violation. Ici, la question voisine — deux BOUCHES ne
  // doivent pas se confondre dans un seul écart.
  const base = CLEAN_HOUSEHOLD_CONTEXT.nutrition;
  assert(base !== null && base !== undefined);
  const cells = base.cells.map((c) =>
    c.day === "mon" && (c.memberId === PAUL || c.memberId === "m-claire")
      ? {
        ...c,
        hasDish: true,
        hasPortion: false,
        portionExpected: true,
        servedKcal: null,
        proteinG: null,
        deltaPct: null,
        state: "no_portion" as const,
      }
      : c
  );
  const outcome = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, {
    ...CLEAN_HOUSEHOLD_CONTEXT,
    nutrition: { cells, days: base.days },
    policy: FINAL_GATE_POLICY_LOT_4,
  });
  const record = planValidationRecord({
    outcome,
    delivery: finalGateDelivery(outcome, []),
  });
  const bouches = record.defects
    .filter((d) => d.cause === "cell_without_portion")
    .map((d) => d.member_id)
    .sort();
  assertEquals(bouches, ["m-claire", PAUL].sort());
  // ⟳ 2026-09-19 — deux écarts COMPTÉS, chacun avec sa bouche ; aucun ne
  // bloque. Le point de l'épreuve — deux bouches, deux lignes — est intact.
  assertEquals(record.counts.blocking, 0);
  assertEquals(
    record.defects.filter((d) => d.cause === "cell_without_portion").length,
    2,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 1 — UNE CASE SANS CIBLE EST « NON APPLICABLE »
// ═══════════════════════════════════════════════════════════════════════════
//
// LA MUTATION QUE CETTE ÉPREUVE DOIT FAIRE ROUGIR
//   R5 — `cell_energy_no_target` retourne dans `measured_cells` ou dans
//        `incomplete`: une case que personne n'a jamais pu juger se relit
//        « contrôle d'énergie réussi », ou « on n'a pas pu vérifier ». ROUGE.

/**
 * UNE SORTIE DE GARDE RÉELLE, DONT ON NE DÉPLACE QUE TROIS COMPTEURS.
 *
 * ⛔ ON NE FABRIQUE PAS UN `FinalGateOutcome` À LA MAIN. Le cas propre du foyer
 * est celui que la garde produit vraiment; en repartir garantit que toutes les
 * autres clés sont celles de la production, et que ce test ne mesure que la
 * bascule qu'il prétend mesurer.
 */
function gateOutcome(over: {
  checked: {
    portion_cells: number;
    measured_cells: number;
    cell_energy_no_target: number;
  };
}): FinalGateOutcome {
  const base = finalPlanGate(CLEAN_HOUSEHOLD_PLAN, CLEAN_HOUSEHOLD_CONTEXT);
  return {
    ...base,
    counters: {
      ...base.counters,
      checked: { ...base.counters.checked, ...over.checked },
    },
  };
}

Deno.test("LOT 1 — la case d'une bouche sans cible sort en `not_applicable`", () => {
  const outcome = gateOutcome({
    checked: { portion_cells: 24, measured_cells: 18, cell_energy_no_target: 6 },
  });
  const delivery = finalGateDelivery(outcome, []);
  const record = planValidationRecord({ outcome, delivery });

  // ⛔ NI UN ÉCHEC: aucune cause n'est levée sur ces six cases.
  assertEquals(record.defects.length, 0);
  // ⛔ NI UN TROU: `incomplete` ne les réclame pas. 24 − 18 − 6 = 0.
  assertEquals(
    record.incomplete.find((i) => i.control === "cell_energy"),
    undefined,
  );
  // ⛔ ET NI UN SUCCÈS MUET: elles sont NOMMÉES, avec leur compte.
  assertEquals(
    record.not_applicable.find((i) => i.control === "cell_energy_no_target"),
    { control: "cell_energy_no_target", count: 6 },
  );
  assertEquals(record.counts.not_applicable, 6);
});

Deno.test("LOT 1 — un vrai trou de mesure reste `incomplete`, pas `not_applicable`", () => {
  // ⛔ LA CONTRE-ÉPREUVE. Sans elle, ce lot pourrait faire disparaître TOUS les
  // trous de `cell_energy` sous le nom d'une protection.
  const outcome = gateOutcome({
    checked: { portion_cells: 24, measured_cells: 18, cell_energy_no_target: 0 },
  });
  const delivery = finalGateDelivery(outcome, []);
  const record = planValidationRecord({ outcome, delivery });
  assertEquals(
    record.incomplete.find((i) => i.control === "cell_energy"),
    { control: "cell_energy", count: 6 },
  );
  assertEquals(
    record.not_applicable.find((i) => i.control === "cell_energy_no_target"),
    undefined,
  );
});
