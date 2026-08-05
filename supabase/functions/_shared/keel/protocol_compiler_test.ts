import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import { validateDraftCommitment } from "../../plan-template-v1/commitment_rules.ts";

import {
  type CoachFoodRule,
  type CoachTerm,
  type CoachTimingRule,
  type CompiledCommitment,
  commitmentKey,
  compileFoodRule,
  compileProtocol,
  compileTimingRule,
  diffCompiled,
  labelForGroup,
  type ProtocolInput,
  ruleAppliesTo,
} from "./protocol_compiler.ts";

/**
 * LE COMPILATEUR DE PROTOCOLE — tests.
 *
 * Le lot entier tient sur une phrase: « ce que le coach coche est exactement ce
 * que Sophia vérifie ». Un compilateur qui produit des lignes plausibles mais
 * refusées à l'écriture, ou acceptées mais jamais lues, rendrait tout l'écran
 * décoratif. D'où l'ordre des tests ici:
 *
 *   1. LE CONTRAT D'ABORD — chaque ligne produite passe le VRAI validateur
 *      (`validateDraftCommitment`, celui de plan-template-v1), pas une
 *      paraphrase locale de ses règles. Si le contrat bouge, ces tests cassent,
 *      et c'est exactement ce qu'on veut.
 *   2. CHAQUE CHAMP DÉRIVÉ, nommément — quel `stance` produit quel `autonomy`,
 *      quel gabarit produit quel `target_op`/`evaluation_grain`.
 *   3. LES CAS QUI FONT TOMBER LES ÉCRANS — protocole vide, objectif absent,
 *      terme ambigu, recompilation.
 */

const ctx = { coachId: "c-1", contentLocale: "fr-FR", terms: [] as CoachTerm[] };

function food(
  over: Partial<CoachFoodRule> & Pick<CoachFoodRule, "stance">,
): CoachFoodRule {
  return {
    food_group_ref: "leafy_greens",
    goal_scope: [],
    rationale: null,
    ...over,
  };
}

// ===========================================================================
// 1. LE CONTRAT — le vrai validateur, sur tout ce que le compilateur sait faire
// ===========================================================================

/**
 * Un échantillon qui touche CHAQUE branche du compilateur. Si une branche neuve
 * apparaît sans entrer ici, le test de couverture juste en dessous le dit.
 */
const EVERY_BRANCH: readonly CompiledCommitment[] = [
  compileFoodRule(food({ stance: "encouraged" }), ctx),
  compileFoodRule(food({ stance: "discouraged", food_group_ref: "sugar_sweets" }), ctx),
  compileFoodRule(food({ stance: "excluded", food_group_ref: "other_added_fat" }), ctx),
  compileTimingRule({
    template: "portions_per_period",
    direction: "at_least",
    portions: 2,
    period: "day",
    food_group_ref: "non_starchy_veg",
    goal_scope: [],
    rationale: null,
  }, ctx),
  compileTimingRule({
    template: "portions_per_period",
    direction: "at_most",
    portions: 3,
    period: "week",
    food_group_ref: "alcohol",
    goal_scope: [],
    rationale: null,
  }, ctx),
  compileTimingRule({
    template: "group_every_meal",
    food_group_ref: "lean_protein",
    goal_scope: [],
    rationale: null,
  }, ctx),
  compileTimingRule({
    template: "no_group_after",
    cutoff_local: "21:00",
    food_group_ref: "coffee_tea",
    goal_scope: [],
    rationale: null,
  }, ctx),
  compileTimingRule({
    template: "group_at_slot",
    slot_key: "breakfast",
    food_group_ref: "eggs",
    goal_scope: [],
    rationale: null,
  }, ctx),
];

Deno.test("contrat: chaque ligne compilee passe le VRAI validateur", () => {
  for (const line of EVERY_BRANCH) {
    const issues = validateDraftCommitment(line);
    assertEquals(
      issues,
      [],
      `${line.template_commitment_key} refuse par le validateur: ${issues.join(" | ")}`,
    );
  }
});

Deno.test("contrat: l'echantillon couvre bien les 3 postures et les 4 gabarits", () => {
  // Le test au-dessus ne vaut que si l'echantillon est complet. Ce garde-fou
  // casse le jour ou quelqu'un ajoute un gabarit sans l'y mettre.
  const keys = EVERY_BRANCH.map((c) => c.template_commitment_key);
  assertEquals(keys.filter((k) => k.startsWith("protocol:food:")).length, 3);
  for (
    const t of [
      "portions_per_period",
      "group_every_meal",
      "no_group_after",
      "group_at_slot",
    ]
  ) {
    assert(
      keys.some((k) => k.includes(`:${t}:`) || k.endsWith(`:${t}`) || k.includes(`${t}:`)),
      `gabarit ${t} absent de l'echantillon de contrat`,
    );
  }
});

Deno.test("contrat: target_op et ses bornes, dans les deux sens", () => {
  // '>=' exige target_min et INTERDIT target_max; '<=' l'inverse; 'any' interdit
  // les deux. C'est la CHECK qui casse une publication, pas un detail de style.
  for (const line of EVERY_BRANCH) {
    if (line.target_op === ">=") {
      assert(line.target_min !== null, `${line.template_commitment_key}: '>=' sans target_min`);
      assertEquals(line.target_max, null, `${line.template_commitment_key}: '>=' avec target_max`);
    }
    if (line.target_op === "<=") {
      assert(line.target_max !== null, `${line.template_commitment_key}: '<=' sans target_max`);
      assertEquals(line.target_min, null, `${line.template_commitment_key}: '<=' avec target_min`);
    }
    if (line.target_op === "any") {
      assertEquals(line.target_min, null);
      assertEquals(line.target_max, null);
    }
  }
});

Deno.test("contrat: un evitement ne s'evalue jamais par occasion", () => {
  // plan_commitments_avoid_grain_check. Un defaut inverse n'a pas de sens par
  // occasion: une photo d'un repas ne prouve pas l'abstinence d'une journee.
  for (const line of EVERY_BRANCH.filter((c) => c.polarity === "avoid")) {
    assert(
      line.evaluation_grain === "day" || line.evaluation_grain === "week",
      `${line.template_commitment_key}: evitement au grain ${line.evaluation_grain}`,
    );
  }
});

Deno.test("contrat: le grain occasion porte toujours une ancre qui resout une occasion", () => {
  // plan_commitments_occasion_anchor_check: jamais 'free'.
  for (const line of EVERY_BRANCH.filter((c) => c.evaluation_grain === "occasion")) {
    assert(
      line.anchor_kind !== "free",
      `${line.template_commitment_key}: grain occasion sur ancre 'free'`,
    );
  }
});

Deno.test("contrat: slot_kind='nominal' n'atterrit jamais sur any_meal", () => {
  // plan_commitments_nominal_slot_check. C'est le piege du gabarit
  // "a chaque repas": il vise any_meal, donc il DOIT etre opportunistic.
  for (const line of EVERY_BRANCH) {
    if (line.slot_kind === "nominal") {
      assert(
        line.slot_key !== "any_meal",
        `${line.template_commitment_key}: nominal sur any_meal`,
      );
    }
  }
  const everyMeal = EVERY_BRANCH.find((c) =>
    c.template_commitment_key.includes("group_every_meal")
  )!;
  assertEquals(everyMeal.slot_key, "any_meal");
  assertEquals(everyMeal.slot_kind, "opportunistic");
});

Deno.test("contrat: coherence d'ancre — free n'a aucune colonne d'ancre", () => {
  for (const line of EVERY_BRANCH) {
    if (line.anchor_kind === "free") {
      assertEquals(line.slot_key, null);
      assertEquals(line.clock_local, null);
      assertEquals(line.tolerance_minutes, null);
      assertEquals(line.window_start_local, null);
      assertEquals(line.window_end_local, null);
    }
    if (line.anchor_kind === "slot") {
      assert(line.slot_key !== null);
      assertEquals(line.clock_local, null);
      assertEquals(line.tolerance_minutes, null);
    }
    if (line.anchor_kind === "window") {
      assert(line.window_start_local !== null && line.window_end_local !== null);
      assertEquals(line.slot_key, null);
      assertEquals(line.clock_local, null);
    }
  }
});

Deno.test("contrat: aucune ligne n'est structurellement inobservable", () => {
  // evaluator.ts: une ligne dont la `measure` est une mesure macro SANS
  // substance_ref ni food_group_ref ne peut etre atteinte par aucune branche de
  // matchEvent — elle rendrait `missed` a chaque cloture, a vie, pour un eleve
  // parfait. Toute ligne d'ici porte un food_group_ref: c'est ce qui l'en
  // protege, et ce test est ce qui l'empeche de se perdre.
  for (const line of EVERY_BRANCH) {
    assert(
      line.food_group_ref !== null && String(line.food_group_ref).length > 0,
      `${line.template_commitment_key}: aucune reference structuree`,
    );
  }
});

// ===========================================================================
// 2. CHAQUE CHAMP DÉRIVÉ, NOMMÉMENT
// ===========================================================================

Deno.test("posture encouraged: '>= 1 portion par jour', souple", () => {
  const c = compileFoodRule(food({ stance: "encouraged" }), ctx);
  assertEquals(c.polarity, "do");
  assertEquals(c.measure, "portion");
  assertEquals(c.unit, "portion");
  assertEquals(c.target_op, ">=");
  assertEquals(c.target_min, 1);
  assertEquals(c.target_max, null);
  assertEquals(c.evaluation_grain, "day");
  assertEquals(c.required_days_per_week, 7);
  // 'flexible' et non 'strict': « je pousse les legumes » est une direction, pas
  // une prescription au gramme. Strict ferait rater sa journee a un eleve qui a
  // mange des epinards au lieu du brocoli attendu.
  assertEquals(c.autonomy, "flexible");
  assertEquals(c.priority, "secondary");
  assertEquals(c.flex_eligible, true);
  assertEquals(c.preview, { kind: "encourage", group: "leafy_greens", perDay: 1 });
});

Deno.test("posture discouraged: evitement souple, ecart dependable", () => {
  const c = compileFoodRule(food({ stance: "discouraged" }), ctx);
  assertEquals(c.polarity, "avoid");
  assertEquals(c.target_op, "any");
  assertEquals(c.evaluation_grain, "day");
  assertEquals(c.autonomy, "swap_within_policy");
  assertEquals(c.priority, "secondary");
  assertEquals(c.flex_eligible, true);
});

Deno.test("posture excluded: evitement strict, ecart NON dependable", () => {
  const c = compileFoodRule(food({ stance: "excluded" }), ctx);
  assertEquals(c.polarity, "avoid");
  assertEquals(c.target_op, "any");
  assertEquals(c.autonomy, "strict");
  assertEquals(c.priority, "core");
  assertEquals(c.flex_eligible, false);
});

Deno.test("discouraged vs excluded: la difference tient en TROIS champs, tous de methode", () => {
  // Ce test est la doctrine du lot en code. Si un jour quelqu'un ajoute un
  // quatrieme champ de difference — surtout un champ de securite — il casse.
  const d = compileFoodRule(food({ stance: "discouraged" }), ctx);
  const e = compileFoodRule(food({ stance: "excluded" }), ctx);
  const differing = (Object.keys(d) as (keyof CompiledCommitment)[]).filter(
    (k) => k !== "preview" && JSON.stringify(d[k]) !== JSON.stringify(e[k]),
  );
  assertEquals(differing.sort(), ["autonomy", "flex_eligible", "priority"]);
});

Deno.test("gabarit portions_per_period: at_least -> do/'>=', at_most -> avoid/'<='", () => {
  const floor = compileTimingRule({
    template: "portions_per_period",
    direction: "at_least",
    portions: 2,
    period: "day",
    food_group_ref: "non_starchy_veg",
    goal_scope: [],
    rationale: null,
  }, ctx);
  assertEquals(floor.polarity, "do");
  assertEquals(floor.target_op, ">=");
  assertEquals(floor.target_min, 2);
  assertEquals(floor.target_max, null);
  assertEquals(floor.evaluation_grain, "day");
  assertEquals(floor.required_days_per_week, 7);

  const ceiling = compileTimingRule({
    template: "portions_per_period",
    direction: "at_most",
    portions: 3,
    period: "week",
    food_group_ref: "alcohol",
    goal_scope: [],
    rationale: null,
  }, ctx);
  assertEquals(ceiling.polarity, "avoid");
  assertEquals(ceiling.target_op, "<=");
  assertEquals(ceiling.target_max, 3);
  assertEquals(ceiling.target_min, null);
  assertEquals(ceiling.evaluation_grain, "week");
  // Le DENOMINATEUR n'a pas de sens au grain semaine: une regle hebdomadaire se
  // juge sur la semaine entiere, pas sur un compte de jours.
  assertEquals(ceiling.required_days_per_week, null);
});

Deno.test("gabarit group_every_meal: occasion, any_meal, opportunistic, 3 occasions", () => {
  const c = compileTimingRule({
    template: "group_every_meal",
    food_group_ref: "lean_protein",
    goal_scope: [],
    rationale: null,
  }, ctx);
  assertEquals(c.polarity, "do");
  assertEquals(c.anchor_kind, "slot");
  assertEquals(c.slot_key, "any_meal");
  assertEquals(c.evaluation_grain, "occasion");
  assertEquals(c.slot_kind, "opportunistic");
  assertEquals(c.expected_occasions_per_day, 3);
});

Deno.test("gabarit no_group_after: fenetre coupure->23:59, grain jour, strict", () => {
  const c = compileTimingRule({
    template: "no_group_after",
    cutoff_local: "21:00",
    food_group_ref: "coffee_tea",
    goal_scope: [],
    rationale: null,
  }, ctx);
  assertEquals(c.polarity, "avoid");
  assertEquals(c.anchor_kind, "window");
  assertEquals(c.window_start_local, "21:00");
  // On ne franchit PAS minuit: ce serait inventer une frontiere de journee que
  // le coach n'a pas ecrite.
  assertEquals(c.window_end_local, "23:59");
  assertEquals(c.evaluation_grain, "day");
  assertEquals(c.autonomy, "strict");
  assertEquals(c.flex_eligible, false);
});

Deno.test("gabarit group_at_slot: creneau nomme, occasion, nominal", () => {
  const c = compileTimingRule({
    template: "group_at_slot",
    slot_key: "breakfast",
    food_group_ref: "eggs",
    goal_scope: [],
    rationale: null,
  }, ctx);
  assertEquals(c.anchor_kind, "slot");
  assertEquals(c.slot_key, "breakfast");
  assertEquals(c.evaluation_grain, "occasion");
  assertEquals(c.slot_kind, "nominal");
  assertEquals(c.expected_occasions_per_day, 1);
});

Deno.test("le rationale du coach devient l'instruction citable de l'eleve", () => {
  // C'est ce qui donne a Sophia de quoi EXPLIQUER au lieu d'assener.
  const c = compileFoodRule(
    food({ stance: "excluded", rationale: "ca te coupe la faim pour rien" }),
    ctx,
  );
  assertEquals(c.student_instruction, "ca te coupe la faim pour rien");
});

// ===========================================================================
// 3. LA PORTÉE PAR OBJECTIF
// ===========================================================================

Deno.test("portee: vide = global", () => {
  assertEquals(ruleAppliesTo([], "fat_loss"), true);
  assertEquals(ruleAppliesTo([], null), true);
});

Deno.test("portee: non vide = seulement les objectifs nommes", () => {
  assertEquals(ruleAppliesTo(["recomposition"], "recomposition"), true);
  assertEquals(ruleAppliesTo(["recomposition"], "fat_loss"), false);
  assertEquals(ruleAppliesTo(["recomposition", "performance"], "performance"), true);
});

Deno.test("portee: un eleve SANS objectif ne recoit que le global", () => {
  // Lui appliquer une regle ecrite pour `fat_loss` serait lui preter un but
  // qu'il n'a pas enonce.
  assertEquals(ruleAppliesTo(["fat_loss"], null), false);
  assertEquals(ruleAppliesTo([], null), true);
});

Deno.test("un eleve dont l'objectif n'est vise par AUCUNE regle recoit une liste vide, pas une erreur", () => {
  const input: ProtocolInput = {
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [food({ stance: "encouraged", goal_scope: ["fat_loss"] })],
    timingRules: [],
    terms: [],
  };
  assertEquals(compileProtocol(input, "performance").length, 0);
});

// ===========================================================================
// 4. LE VOCABULAIRE DU COACH
// ===========================================================================

Deno.test("un terme de coach porte le titre, sans jamais toucher a la jointure", () => {
  const terms: CoachTerm[] = [
    { term: "huiles de graines", food_group_ref: "other_added_fat" },
  ];
  const c = compileFoodRule(
    food({ stance: "excluded", food_group_ref: "other_added_fat" }),
    { ...ctx, terms },
  );
  assertEquals(c.title, "huiles de graines");
  // LE POINT: le pipeline continue de travailler sur le groupe de base. Aucun
  // slug prive n'existe, donc la vision sait toujours detecter, et la FK tient.
  assertEquals(c.food_group_ref, "other_added_fat");
});

Deno.test("sans terme de coach, le titre porte le slug — jamais une traduction", () => {
  // Le compilateur est SANS LOCALE (R2): il pose le slug, le front rend
  // `food_group.<slug>` via l'i18n.
  const c = compileFoodRule(food({ stance: "encouraged" }), ctx);
  assertEquals(c.title, "leafy_greens");
  assertEquals(labelForGroup("leafy_greens", []).fromCoachTerm, false);
});

Deno.test("deux termes sur le meme groupe: choix DETERMINISTE, pas l'ordre de la base", () => {
  // Sans tri, le titre bougerait entre deux compilations identiques selon un
  // ORDER BY absent, et le diff de publication montrerait un mouvement fantome.
  const terms: CoachTerm[] = [
    { term: "Zeste", food_group_ref: "citrus" },
    { term: "agrumes", food_group_ref: "citrus" },
  ];
  assertEquals(labelForGroup("citrus", terms).label, "agrumes");
  assertEquals(labelForGroup("citrus", [...terms].reverse()).label, "agrumes");
});

// ===========================================================================
// 5. LES CAS QUI FONT TOMBER LES ÉCRANS
// ===========================================================================

Deno.test("protocole VIDE: zero ligne, aucune erreur", () => {
  // Un coach qui decouvre l'ecran n'a rien ecrit. Ce n'est pas une panne.
  const empty: ProtocolInput = {
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [],
    timingRules: [],
    terms: [],
  };
  assertEquals(compileProtocol(empty, "health"), []);
  assertEquals(compileProtocol(empty, null), []);
});

Deno.test("les 30 groupes tous marques: 30 lignes, toutes valides", () => {
  const ALL_GROUPS = [
    "lean_protein", "fatty_fish", "white_fish", "shellfish", "poultry",
    "red_meat", "eggs", "legumes", "tofu_tempeh", "dairy_yogurt",
    "dairy_cheese", "whole_grain", "refined_grain", "starchy_veg",
    "cruciferous_veg", "leafy_greens", "non_starchy_veg", "berries", "citrus",
    "other_fruit", "nuts_seeds", "olive_oil", "other_added_fat",
    "sauce_dressing", "sugar_sweets", "fried_food", "alcohol",
    "sweetened_beverage", "water", "coffee_tea",
  ] as const;
  const stances = ["encouraged", "discouraged", "excluded"] as const;
  const input: ProtocolInput = {
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: ALL_GROUPS.map((g, i) => ({
      food_group_ref: g,
      stance: stances[i % 3],
      goal_scope: [],
      rationale: null,
    })),
    timingRules: [],
    terms: [],
  };
  const out = compileProtocol(input, "health");
  assertEquals(out.length, 30);
  for (const line of out) assertEquals(validateDraftCommitment(line), []);
});

Deno.test("recompiler le meme protocole rend la MEME liste, dans le meme ordre", () => {
  // L'idempotence est ce qui empeche une republication d'empiler des copies
  // chez l'eleve, et ce qui empeche le diff de clignoter sans raison.
  const input: ProtocolInput = {
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [
      food({ stance: "excluded", food_group_ref: "sugar_sweets" }),
      food({ stance: "encouraged", food_group_ref: "leafy_greens" }),
    ],
    timingRules: [{
      template: "group_every_meal",
      food_group_ref: "lean_protein",
      goal_scope: [],
      rationale: null,
    }],
    terms: [],
  };
  const a = compileProtocol(input, "health");
  const b = compileProtocol(
    { ...input, foodRules: [...input.foodRules].reverse() },
    "health",
  );
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("la cle de jointure distingue ce qui doit l'etre, et confond ce qui doit l'etre", () => {
  const g = { food_group_ref: "coffee_tea", goal_scope: [], rationale: null } as const;
  // Deux heures de coupure differentes = deux lignes.
  assert(
    commitmentKey({ ...g, template: "no_group_after", cutoff_local: "21:00" }) !==
      commitmentKey({ ...g, template: "no_group_after", cutoff_local: "22:00" }),
  );
  // Le meme gabarit sur le meme groupe = la meme ligne, quel que soit le
  // rationale (changer le pourquoi ne cree pas une seconde ligne chez l'eleve).
  assertEquals(
    commitmentKey({ ...g, template: "group_every_meal" }),
    commitmentKey({ ...g, template: "group_every_meal", rationale: "parce que" }),
  );
});

// ===========================================================================
// 6. LE DIFF DE PUBLICATION
// ===========================================================================

Deno.test("diff: ajout, retrait, et changement de severite", () => {
  const before = compileProtocol({
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [
      food({ stance: "discouraged", food_group_ref: "sugar_sweets" }),
      food({ stance: "encouraged", food_group_ref: "berries" }),
    ],
    timingRules: [],
    terms: [],
  }, null);

  const after = compileProtocol({
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [
      // sugar_sweets passe de 'discouraged' a 'excluded' — ca durcit ce que
      // Sophia verifie, et le coach doit le voir AVANT de publier.
      food({ stance: "excluded", food_group_ref: "sugar_sweets" }),
      // berries disparait, alcohol arrive.
      food({ stance: "excluded", food_group_ref: "alcohol" }),
    ],
    timingRules: [],
    terms: [],
  }, null);

  const d = diffCompiled(before, after);
  assertEquals(d.added.map((c) => c.food_group_ref), ["alcohol"]);
  assertEquals(d.removed, ["protocol:food:berries"]);
  assertEquals(d.changed.length, 1);
  assertEquals(d.changed[0].key, "protocol:food:sugar_sweets");
  assertEquals([...d.changed[0].fields].sort(), ["autonomy", "flex_eligible", "priority"]);
});

Deno.test("diff: un protocole inchange ne montre AUCUN mouvement", () => {
  // Un diff qui clignote sur un enregistrement sans changement entrainerait le
  // coach a publier sans lire — exactement ce que l'ecran doit empecher.
  const input: ProtocolInput = {
    coachId: "c-1",
    contentLocale: "fr-FR",
    foodRules: [food({ stance: "encouraged" })],
    timingRules: [],
    terms: [],
  };
  const d = diffCompiled(compileProtocol(input, null), compileProtocol(input, null));
  assertEquals(d.added, []);
  assertEquals(d.removed, []);
  assertEquals(d.changed, []);
});
