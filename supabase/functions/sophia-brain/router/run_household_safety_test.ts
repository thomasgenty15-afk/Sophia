/**
 * CHANTIER 5 — LES ALLERGIES DU FOYER, AU SEUIL DU RUNTIME.
 *
 * `household_safety_test.ts` prouve que la lane MARCHE. Celui-ci prouve qu'elle
 * est ATTEINTE par les deux fonctions que tout tour de conversation traverse —
 * le composeur de contexte et la dernière ceinture de rendu. C'est la même
 * raison d'être que `run_output_locks_test.ts`: le défaut de famille de ce
 * dépôt n'est pas un validateur cassé, c'est un validateur correct câblé sur un
 * chemin sur N pendant que le contrat énonce la garantie globalement.
 *
 * Il porte aussi les preuves 3 et 4 du lot: un utilisateur SANS FOYER ne subit
 * aucun changement, et le plafond du bloc du foyer ne peut pas couper une
 * allergie.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  finalVisibleText,
  type KeelTurnContext,
  loadKeelTurnContext,
  withKeelDoctrineBlock,
} from "./run.ts";
import {
  householdAllergyConstraints,
  type HouseholdTurnSafety,
  NO_HOUSEHOLD_SAFETY,
} from "../../_shared/keel/household_safety.ts";
import {
  HOUSEHOLD_BLOCK_MAX_CHARS,
  householdContextBlock,
  type HouseholdTurnContext,
} from "../../_shared/keel/household_turn_context.ts";
import { MEDICAL_BLOCK_FALLBACK_EN } from "../skills/_shared/keel_output_locks.ts";

/** Léa a huit ans et n'a pas de compte: son allergie n'existe que sous son
 * `member_id`. C'est le cas nominal du produit, pas un cas limite. */
const LEA_MEMBER = "33333333-3333-4333-8333-333333333333";

/** L'union du foyer telle que le chargeur la rend, sans passer par l'I/O. */
function householdSafety(labels: string[]): HouseholdTurnSafety {
  return {
    constraints: householdAllergyConstraints(
      labels.map((label, i) => ({
        id: `a${i}`,
        memberId: LEA_MEMBER,
        label,
      })),
      "fr-FR",
    ),
    unreadableReason: null,
  };
}

function keel(over: Partial<KeelTurnContext> = {}): KeelTurnContext {
  return {
    role: "student",
    is_student: true,
    country: "FR",
    content_locale: "fr-FR",
    local_date: "2026-08-05",
    plan_context: null,
    plan_version_id: null,
    plan_block: null,
    plan_context_reason_code: "keel_student_plan_context",
    restriction: null,
    restriction_unavailable_reason: null,
    declared_medical_condition: null,
    // LE LOCUTEUR N'A AUCUNE CONTRAINTE À LUI. C'est le décor du lot: le parent
    // n'est allergique à rien, c'est son enfant qui l'est.
    safety_constraints: [],
    safety_constraints_unavailable_reason: null,
    household_safety: NO_HOUSEHOLD_SAFETY,
    doctrine: null,
    protocol: null,
    coach_note: null,
    week_review: null,
    ...over,
  } as KeelTurnContext;
}

// ---------------------------------------------------------------------------
// 0. LE FIL, AU SEUL ENDROIT OÙ IL EST BRANCHÉ — preuve n°1
//
// C'est ici que « le générateur la connaît, la conversation non » se répare, et
// c'est donc ici que ça se prouve. Les tests de bloc et de ceinture plus bas
// partent d'un contexte de tour DÉJÀ construit: ils ne diraient rien si
// personne ne le construisait.
// ---------------------------------------------------------------------------

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOUSE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/**
 * Un PostgREST en mémoire qui applique VRAIMENT ses `eq`. Un faux qui les
 * ignorerait prouverait une chaîne qui n'existe pas — et rendrait vert un
 * chargeur qui lirait les allergies de TOUS les foyers.
 */
function stubSupabase(
  tables: Record<string, Array<Record<string, unknown>>>,
  opts: { failOn?: string } = {},
) {
  const seen: string[] = [];
  function builder(table: string) {
    seen.push(table);
    const filters: Array<[string, string, unknown]> = [];
    const rows = () =>
      (tables[table] ?? []).filter((row) =>
        filters.every(([op, column, value]) =>
          op === "eq"
            ? String(row[column] ?? "") === String(value ?? "")
            : op === "is"
            ? (value === null ? row[column] == null : row[column] === value)
            : true
        )
      );
    const result = () =>
      opts.failOn === table
        ? { data: null, error: { message: "boom" } }
        : { data: rows(), error: null };
    // deno-lint-ignore no-explicit-any
    const api: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () =>
            Promise.resolve(
              opts.failOn === table
                ? { data: null, error: { message: "boom" } }
                : { data: rows()[0] ?? null, error: null },
            );
        }
        if (prop === "eq" || prop === "is") {
          return (column: string, value: unknown) => {
            filters.push([prop, column, value]);
            return api;
          };
        }
        return () => api;
      },
    });
    return api;
  }
  return {
    client: {
      from: builder,
      rpc: () => Promise.resolve({ data: [], error: null }),
    },
    seen,
  };
}

/**
 * ⚠️ LE DÉCOR NE MENT PAS SUR LA FORME DE LA DONNÉE. L'allergie de Léa est
 * clée sur son `member_id`; nulle part on ne trouve son compte, PARCE QU'ELLE
 * N'EN A PAS. Un décor qui rangerait un `user_id` là rendrait vert un chargeur
 * qui joint encore sur les comptes, c'est-à-dire exactement le trou fermé ici.
 */
function householdTables(over: Record<string, Array<Record<string, unknown>>> = {}) {
  return {
    profiles: [{
      id: PARENT,
      keel_role: "student",
      country: "FR",
      locale: "fr-FR",
      display_unit_system: "metric",
      birth_date: null,
    }],
    household_members: [{ user_id: PARENT, household_id: HOUSE }],
    household_member_allergies: [{
      id: "allergy-1",
      household_id: HOUSE,
      member_id: LEA_MEMBER,
      label: "arachide",
    }],
    ...over,
  };
}

Deno.test("loadKeelTurnContext — l'allergie de l'enfant SANS COMPTE entre dans le tour du parent", async () => {
  const { client, seen } = stubSupabase(householdTables());
  const ctx = await loadKeelTurnContext({
    // deno-lint-ignore no-explicit-any
    supabase: client as any,
    userId: PARENT,
    userMessage: "je cuisine quoi ce soir ?",
    // ⚠️ SANS DATE LOCALE, EXPRÈS. Le CONTEXTE du foyer est gaté dessus (un
    // plat sans date est un plat d'hier servi ce soir); la SÉCURITÉ non. Une
    // allergie derrière une garde de calendrier est une allergie désarmée un
    // tour sur N.
    userLocalDatetime: null,
    legacyPlanSnapshot: null,
  });
  assertEquals(ctx.household_safety.unreadableReason, null);
  assertEquals(
    ctx.household_safety.constraints.map((c) => c.allergenRef),
    ["peanut", "arachide"],
  );
  assertEquals(ctx.household, null, "pas de date locale ⇒ pas de bloc plats");
  assert(seen.includes("household_member_allergies"), seen.join(","));
  // Et le tour qui en sort porte le bloc, et la ceinture mord.
  assertStringIncludes(
    withKeelDoctrineBlock("=== PLAN ===", ctx),
    "AVOID: peanut, arachide",
  );
  assertEquals(
    finalVisibleText(
      "Une cuillère de beurre de cacahuète. 🌸",
      null,
      null,
      "je cuisine quoi ?",
      [],
      ctx,
    ),
    MEDICAL_BLOCK_FALLBACK_EN,
  );
});

Deno.test("loadKeelTurnContext — SANS FOYER: aucune lecture d'allergies de foyer", async () => {
  // PREUVE N°3, au niveau où elle se décide. `household_members` est lue UNE
  // fois — elle l'était déjà avant ce lot, comme premier pas du contexte du
  // foyer — et la table des allergies n'est JAMAIS touchée.
  const { client, seen } = stubSupabase(
    householdTables({ household_members: [] }),
  );
  const ctx = await loadKeelTurnContext({
    // deno-lint-ignore no-explicit-any
    supabase: client as any,
    userId: PARENT,
    userMessage: "j'ai faim",
    userLocalDatetime: "2026-08-05T19:00:00",
    legacyPlanSnapshot: null,
  });
  assertEquals(ctx.household_safety.constraints, []);
  assertEquals(ctx.household_safety.unreadableReason, null);
  assertEquals(ctx.household, null);
  assertEquals(
    seen.filter((t) => t === "household_member_allergies").length,
    0,
    "une lecture d'allergies de foyer est partie chez quelqu'un qui n'a pas de foyer",
  );
  assertEquals(
    seen.filter((t) => t === "household_members").length,
    1,
    "la résolution du foyer doit rester UNE seule requête par tour",
  );
});

Deno.test("loadKeelTurnContext — la table illisible NOMME la panne, elle ne rend pas « rien »", async () => {
  const { client } = stubSupabase(householdTables(), {
    failOn: "household_member_allergies",
  });
  const ctx = await loadKeelTurnContext({
    // deno-lint-ignore no-explicit-any
    supabase: client as any,
    userId: PARENT,
    userMessage: "on mange quoi ?",
    userLocalDatetime: "2026-08-05T19:00:00",
    legacyPlanSnapshot: null,
  });
  assertEquals(ctx.household_safety.constraints, []);
  assert(ctx.household_safety.unreadableReason, "la panne doit se nommer");
  assertStringIncludes(
    withKeelDoctrineBlock("=== PLAN ===", ctx),
    "COULD NOT BE READ ON THIS TURN",
  );
});

// ---------------------------------------------------------------------------
// 1. LE CONTEXTE DU TOUR PORTE L'ALLERGIE — preuve n°1
// ---------------------------------------------------------------------------

Deno.test("le bloc du foyer atteint le composeur, et il nomme les DEUX identifiants", () => {
  const ctx = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({ household_safety: householdSafety(["arachide"]) }),
  );
  assertStringIncludes(ctx, "THIS HOUSEHOLD'S MEDICAL ALLERGIES");
  assertStringIncludes(ctx, "AVOID: peanut, arachide");
  // ET IL EST EN TÊTE: le budget de prompt tronque par la QUEUE, donc le rang
  // EST la garantie. Un bloc d'allergène derrière le plan disparaît sur les
  // tours les plus riches — ceux où l'agent a le plus de matière pour proposer
  // à manger, donc ceux où l'allergène risque le plus de sortir.
  assert(
    ctx.indexOf("THIS HOUSEHOLD'S MEDICAL ALLERGIES") < ctx.indexOf("=== PLAN ==="),
    "l'allergie du foyer doit précéder le plan, ou la troncature la mange",
  );
});

Deno.test("il ne dit JAMAIS au parent qu'il est allergique", () => {
  // Le bloc de l'élève titre « THIS STUDENT'S HARD CONSTRAINTS (source:
  // student_safety_constraints) ». Y verser l'allergie d'un enfant rendrait les
  // deux moitiés de cette phrase fausses — et affirmer à quelqu'un qu'il porte
  // une allergie qu'il n'a pas est un fait faux sur une personne.
  const ctx = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({ household_safety: householdSafety(["arachide"]) }),
  );
  assertEquals(ctx.includes("THIS STUDENT'S HARD CONSTRAINTS"), false);
  assertStringIncludes(ctx, "never tell the person you are talking to that");
});

// ---------------------------------------------------------------------------
// 2. LA CEINTURE DE SORTIE, DANS LES DEUX LANGUES — preuve n°2
// ---------------------------------------------------------------------------

Deno.test("la ceinture mord sur l'allergène du FOYER, EN et FR", () => {
  const ctx = keel({ household_safety: householdSafety(["arachide"]) });
  for (
    const text of [
      "Add a spoon of peanut butter to the oats. 🌸",
      "the nut butter option is the stronger bag snack 🌸",
      "Une cuillère de beurre de cacahuète dans les flocons. 🌸",
      "Mets de la sauce satay sur le poulet. 🌸",
    ]
  ) {
    const out = finalVisibleText(text, null, null, "on mange quoi ?", [], ctx);
    assertEquals(
      out,
      MEDICAL_BLOCK_FALLBACK_EN,
      `la ceinture n'a pas mordu sur: ${text}`,
    );
  }
});

Deno.test("la lecture INDIVIDUELLE en panne ne désarme pas celle du foyer", () => {
  // `safety_constraints: null` est le fail-open nommé de la lane individuelle.
  // Il ne doit pas emporter la lane du foyer avec lui: ce sont deux lectures,
  // deux tables, deux pannes.
  const out = finalVisibleText(
    "Add a spoon of peanut butter. 🌸",
    null,
    null,
    "on mange quoi ?",
    [],
    keel({
      safety_constraints: null,
      safety_constraints_unavailable_reason: "boom",
      household_safety: householdSafety(["arachide"]),
    }),
  );
  assertEquals(out, MEDICAL_BLOCK_FALLBACK_EN);
});

Deno.test("une RÉTRACTATION du locuteur ne désarme pas l'allergie d'une autre bouche", () => {
  // Le désarmement n°5 de la ceinture existe pour qu'on puisse dire « tu n'es
  // plus allergique aux arachides » à quelqu'un qui vient de le déclarer. Il
  // n'écrit que dans `student_safety_constraints`: la ligne du foyer SURVIT, et
  // l'honorer ferait taire l'allergie d'un enfant parce qu'un adulte a dit que
  // la sienne avait disparu. On la retire sur l'écran du foyer.
  const frame = {
    direct_effects: [{
      effect_type: "declare_safety_constraint",
      payload_hint: { intent: "retract", allergen_ref: "peanut" },
    }],
  } as never;
  const out = finalVisibleText(
    "Tu peux remettre du beurre de cacahuète. 🌸",
    null,
    frame,
    "je ne suis plus allergique aux arachides",
    [],
    keel({ household_safety: householdSafety(["arachide"]) }),
  );
  assertEquals(out, MEDICAL_BLOCK_FALLBACK_EN);
});

// ---------------------------------------------------------------------------
// 3. SANS FOYER, RIEN NE CHANGE — preuve n°3
// ---------------------------------------------------------------------------

Deno.test("un tour SANS FOYER ne porte aucun bloc et ne subit aucune ceinture neuve", () => {
  // La preuve « aucune requête » est dans `household_safety_test.ts`, au niveau
  // où elle se décide. Ici: aucun bloc, aucun comportement.
  const solo = keel();
  const ctx = withKeelDoctrineBlock("=== PLAN ===", solo);
  assertEquals(ctx.includes("HOUSEHOLD'S MEDICAL ALLERGIES"), false);
  assertEquals(ctx.includes("COULD NOT BE READ"), false);
  const text = "Add a spoon of peanut butter to the oats. 🌸";
  assertEquals(finalVisibleText(text, null, null, "quoi manger ?", [], solo), text);
});

Deno.test("un foyer SANS allergie déclarée ne pousse rien non plus", () => {
  // « Aucune allergie » est une réponse, pas un bloc. Un en-tête vide dans un
  // prompt est du bruit qui coûte du cache — et le modèle finit par le lire à
  // voix haute (cicatrice `NO_COACH_METHOD_BLOCK`).
  const ctx = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({ household_safety: { constraints: [], unreadableReason: null } }),
  );
  assertEquals(ctx.includes("HOUSEHOLD'S MEDICAL ALLERGIES"), false);
});

// ---------------------------------------------------------------------------
// 4. LE PLAFOND DU BLOC NE PEUT PAS COUPER UNE ALLERGIE — preuve n°4
// ---------------------------------------------------------------------------

/** Un foyer de HUIT, sept jours de préparations, et un générateur bavard. */
function crowdedHousehold(): HouseholdTurnContext {
  const names = ["Ana", "Marc", "Léa", "Tom", "Nour", "Yann", "Zoé", "Sam"];
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return {
    householdId: "hh",
    viewerId: "m-0",
    roster: names.map((firstName, i) => ({
      memberId: `m-${i}`,
      userId: i === 0 ? "u-0" : null,
      firstName,
      ageState: i > 4 ? "minor" : "adult",
      role: i === 0 ? "owner" : "member",
    })),
    hasPlanToday: true,
    todayDishes: [
      { title: "Slow-roasted chicken thighs with charred lemon", slot: "dinner", day: "wed" },
      { title: "Warm lentil and roasted squash salad", slot: "lunch", day: "wed" },
      { title: "Oat porridge with stewed plums", slot: "breakfast", day: "wed" },
      { title: "Toasted rye with soft cheese", slot: "snack", day: "wed" },
    ],
    preparations: days.map((day, i) => ({
      title: `Soak, drain and slow-cook the beans for the ${day} tray bake`,
      cookOn: day,
      cookDate: `2026-08-0${3 + i}`,
      isToday: day === "wed",
    })),
    portions: names.map((firstName, i) => ({
      firstName,
      note: "a slightly larger share of the protein and a smaller one of the starch",
      isMe: i === 0,
    })),
    myRestrictions: [
      { label: "pâte à tartiner", chosenBy: "Ana" },
      { label: "céréales sucrées du petit-déjeuner", chosenBy: "Ana" },
    ],
    shopping: Array.from({ length: 12 }, (_, i) => ({
      term: `free-range chicken thighs, bone in, batch ${i}`,
      quantity: "1.2 kg",
    })),
    shoppingTruncated: true,
  };
}

Deno.test("le plafond du bloc du foyer MORD, et l'allergie n'est pas dedans", () => {
  const crowded = crowdedHousehold();
  const block = householdContextBlock(crowded);
  // 1. LE PLAFOND A VRAIMENT MORDU. Sans cette assertion le test serait vert
  // pour la mauvaise raison — un bloc qui tient sous le plafond ne prouve rien
  // de ce qui survit à une coupe.
  assert(
    block.includes("NOT IN THIS BLOCK"),
    "le décor ne déclenche pas le plafond: il ne prouve rien",
  );
  // Il a jeté la liste de courses ENTIÈRE — premier de l'ordre de coupe — et le
  // dit plutôt que de la présenter amputée.
  assertStringIncludes(block, "A SHOPPING LIST exists for this window but it is not in this block");
  // ⚠️ ET IL RESTE AU-DESSUS DE 3 000, mesuré 3 125: ce décor atteint le
  // PLANCHER documenté du plafond — l'état où il ne reste plus que de la
  // matière que la fiche INTERDIT de couper (plats du jour, cuissons du jour,
  // ma part, mes restrictions, la ceinture mineur). C'est le pire cas possible
  // pour ce lot, et c'est exactement pourquoi une allergie n'a rien à faire
  // dans ce bloc: le seul rang sûr dans une file qui déborde est de ne pas y
  // être. 3000 est écrit EN DUR — un test paramétré par sa propre constante
  // reste vert quand on change la constante.
  assertEquals(HOUSEHOLD_BLOCK_MAX_CHARS, 3000);
  assert(block.length > 3000, `bloc de ${block.length} caractères`);

  // 2. ET L'ALLERGIE EST INTACTE, parce qu'elle n'est pas dans ce bloc du tout.
  // Ce n'est pas « en haut de l'ordre de coupe », c'est hors de la file.
  const ctx = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({
      household: crowded,
      household_safety: householdSafety(["arachide", "lait de vache"]),
    }),
  );
  assertStringIncludes(ctx, "AVOID: peanut, arachide, lactose, dairy, milk, casein, lait_de_vache");
  assertStringIncludes(ctx, "WHAT THIS HOUSEHOLD IS EATING");
  // Et l'ordre tient: l'allergène précède le bloc « ce que le foyer mange »,
  // qui précède le plan. Le budget tronque par la queue.
  assert(
    ctx.indexOf("AVOID: peanut") < ctx.indexOf("WHAT THIS HOUSEHOLD IS EATING"),
  );
  assert(
    ctx.indexOf("WHAT THIS HOUSEHOLD IS EATING") < ctx.indexOf("=== PLAN ==="),
  );
});

// ---------------------------------------------------------------------------
// 5. LA DÉGRADATION QUAND ON NE SAIT PAS — preuve n°5 (l'arbitrage, dans le code)
// ---------------------------------------------------------------------------

Deno.test("lecture impossible ⇒ on coupe le VERBE, pas la conversation", () => {
  const ctx = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({
      household: crowdedHousehold(),
      household_safety: { constraints: [], unreadableReason: "boom" },
    }),
  );
  assertStringIncludes(ctx, "COULD NOT BE READ ON THIS TURN");
  assertStringIncludes(ctx, "do NOT propose");
  assertStringIncludes(ctx, "Everything else in this conversation is unaffected");
  // ⚠️ LE BLOC DES PLATS DÉJÀ COMPOSÉS RESTE. Ils sortent d'un générateur qui,
  // lui, refuse de composer sans la ceinture (503 `safety_constraints_unreadable`);
  // les relire n'est pas proposer à manger, et les taire priverait le foyer du
  // dîner qu'il a déjà validé.
  assertStringIncludes(ctx, "WHAT THIS HOUSEHOLD IS EATING");
  // Et le tour n'est pas refusé: le contexte est rendu, le plan est là.
  assertStringIncludes(ctx, "=== PLAN ===");
});

Deno.test("« je n'ai pas pu lire » ne se confond jamais avec « aucune allergie »", () => {
  const unread = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({ household_safety: { constraints: [], unreadableReason: "boom" } }),
  );
  const none = withKeelDoctrineBlock(
    "=== PLAN ===",
    keel({ household_safety: { constraints: [], unreadableReason: null } }),
  );
  assert(unread !== none, "les deux états doivent produire deux prompts");
  assertEquals(none.includes("COULD NOT BE READ"), false);
});
