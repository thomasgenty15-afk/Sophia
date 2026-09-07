/**
 * FF-010 — la lecture du foyer.
 *
 * ── LA MÉTRIQUE DONT LA CIBLE EST ZÉRO, ET QUI SE TESTE ────────────────────
 * §10 de la fiche: « Fuites de visibilité en `shared` — la seule métrique dont
 * la cible est zéro, et qui se TESTE, pas qui s'observe. » D'où le test
 * central de ce fichier: en mode `shared`, la portion d'un autre membre n'est
 * pas seulement absente de la réponse, elle est absente DU CONTEXTE. Le filtre
 * s'applique au chargement; ce qui n'entre pas dans le prompt ne peut pas en
 * sortir.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  householdContextBlock,
  type HouseholdTurnContext,
  loadHouseholdTurnContext,
  resolveHouseholdIdFor,
} from "./household_turn_context.ts";

const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHILD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const HOUSE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

/**
 * ⚠️ LES IDENTIFIANTS DE MEMBRE SONT DIFFÉRENTS DES IDENTIFIANTS DE COMPTE, ET
 * C'EST TOUT L'INTÉRÊT DU DÉCOR.
 *
 * Les réutiliser ferait passer un chargeur qui apparie encore les portions sur
 * `user_id` — c'est-à-dire exactement le défaut que le re-clavetage du
 * 2026-08-10 doit rendre impossible. Ce dépôt a déjà payé une fixture qui
 * mentait sur la forme de la donnée (`cookOn` ≠ `cook_on`): elle rendait la
 * fonctionnalité verte sans qu'elle marche.
 *
 * Et LÉO N'A PAS DE COMPTE (`user_id: null`). C'est le cas NOMINAL du produit
 * depuis ce lot, pas un cas limite: un enfant de huit ans n'a pas d'adresse
 * e-mail.
 */
const ME_MEMBER = "11111111-1111-4111-8111-111111111111";
const OTHER_MEMBER = "22222222-2222-4222-8222-222222222222";
const CHILD_MEMBER = "33333333-3333-4333-8333-333333333333";

const TODAY = "2026-08-05"; // un mercredi → jeton `wed`

type Tables = Record<string, Array<Record<string, unknown>>>;

/**
 * Un PostgREST en mémoire qui applique VRAIMENT ses filtres. Un faux qui les
 * ignorerait prouverait une chaîne qui n'existe pas.
 */
function stubDb(tables: Tables, roster: Array<Record<string, unknown>>, opts: {
  failOn?: string;
} = {}) {
  function builder(table: string) {
    const filters: Array<[string, string, unknown]> = [];
    const rows = tables[table] ?? [];
    const selected = () =>
      rows.filter((row) =>
        filters.every(([op, column, value]) => {
          const actual = row[column];
          if (op === "eq") return String(actual ?? "") === String(value ?? "");
          if (op === "is") return value === null ? actual == null : actual === value;
          if (op === "lte") return String(actual ?? "") <= String(value ?? "");
          if (op === "gte") return String(actual ?? "") >= String(value ?? "");
          // ⟳ `lt` AJOUTÉ LE 2026-09-08 avec la seconde passe du chargeur (le
          // dernier plan CLOS). Un stub qui ne connaît pas un opérateur ne rend
          // pas un mauvais résultat: il JETTE, et le test rougit franchement —
          // c'est la bonne défaillance, et c'est comme ça qu'on l'a vu.
          if (op === "lt") return String(actual ?? "") < String(value ?? "");
          return true;
        })
      );
    // deno-lint-ignore no-explicit-any
    const api: any = {
      select: () => api,
      order: () => api,
      limit: () => api,
      eq(c: string, v: unknown) {
        filters.push(["eq", c, v]);
        return api;
      },
      is(c: string, v: unknown) {
        filters.push(["is", c, v]);
        return api;
      },
      lte(c: string, v: unknown) {
        filters.push(["lte", c, v]);
        return api;
      },
      gte(c: string, v: unknown) {
        filters.push(["gte", c, v]);
        return api;
      },
      lt(c: string, v: unknown) {
        filters.push(["lt", c, v]);
        return api;
      },
      maybeSingle: () =>
        opts.failOn === table
          ? Promise.resolve({ data: null, error: { message: "boom" } })
          : Promise.resolve({ data: selected()[0] ?? null, error: null }),
      // deno-lint-ignore no-explicit-any
      then(resolve: (v: any) => unknown) {
        if (opts.failOn === table) {
          return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
        }
        return Promise.resolve({ data: selected(), error: null }).then(resolve);
      },
    };
    return api;
  }
  return {
    from: builder,
    rpc: (_name: string, _args: unknown) =>
      opts.failOn === "rpc"
        ? Promise.resolve({ data: null, error: { message: "boom" } })
        : Promise.resolve({ data: roster, error: null }),
  };
}

function rosterRow(
  memberId: string,
  firstName: string,
  over: Record<string, unknown> = {},
) {
  return {
    member_id: memberId,
    // Le compte par défaut: celui qui parle. Les autres lignes le surchargent,
    // et une bouche sans compte porte `user_id: null`.
    user_id: memberId === ME_MEMBER ? ME : null,
    first_name: firstName,
    age_state: "adult",
    role: "member",
    goal: null,
    ...over,
  };
}

function tables(over: Partial<Tables> = {}): Tables {
  return {
    household_members: [{ user_id: ME, household_id: HOUSE }],
    student_generated_meals: [{
      id: "plan-1",
      household_id: HOUSE,
      // ⚠️ EXIGÉ PAR LE CHARGEUR DEPUIS L3, ET ABSENT DU DÉCOR JUSQU'AU
      // 2026-08-12: sept tests de ce fichier étaient ROUGES au HEAD. Le
      // chargeur filtre `plan_kind = 'household'` (un plan PERSONNEL porte
      // aussi `household_id`), et une ligne de décor sans la colonne était
      // écartée — donc « aucun plan », donc `hasPlanToday: false`.
      //
      // C'est la cicatrice du dépôt en miroir: un décor qui ment sur la FORME
      // de la donnée cache le défaut qu'il devrait montrer. Ici il le
      // FABRIQUAIT.
      plan_kind: "household",
      retired_at: null,
      starts_on: "2026-08-03",
      ends_on: "2026-08-09",
      dishes: [
        { title: "Roast chicken bowl", slot: "dinner", day: "wed" },
        { title: "Lentil soup", slot: "dinner", day: "thu" },
      ],
      // ⚠️ LA FORME DE LA PRODUCTION, ET C'EST LE SUJET. `mealPreparationsPayload`
      // écrit `cook_on`; `memberPortionsPayload` écrit `member_id` /
      // `display_name` / `portion_note`. La première version de ce fichier
      // écrivait du camelCase, et c'est exactement ce qui a caché, jusqu'au run
      // réel, que le chargeur ne lisait PAS le jour de cuisson des vraies
      // lignes. Un décor qui ment sur la forme de la donnée cache le défaut
      // qu'il devrait montrer.
      preparations: [
        { title: "Lentils", cook_on: "thu" },
        { title: "Roast chicken thighs", cook_on: "wed" },
      ],
      member_portions: [
        {
          member_id: ME_MEMBER,
          display_name: "Ana",
          portion_note: "larger protein share",
        },
        {
          member_id: OTHER_MEMBER,
          display_name: "Marc",
          portion_note: "smaller starch share",
        },
      ],
      shopping_list: [
        { term: "chicken thighs", quantity: "1 kg", aisle: "butcher" },
      ],
    }],
    household_food_restrictions: [],
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LE CAS NOMINAL
// ---------------------------------------------------------------------------

Deno.test("le plat DU JOUR et la portion À MON NOM sont chargés", async () => {
  const db = stubDb(tables(), [
    rosterRow(ME_MEMBER, "Ana"),
    rosterRow(OTHER_MEMBER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.hasPlanToday, true);
  // LE JOUR COURANT SEULEMENT: le plat de jeudi n'entre pas.
  assertEquals(ctx.todayDishes.map((d) => d.title), ["Roast chicken bowl"]);
  const mine = ctx.portions.find((p) => p.isMe);
  assertEquals(mine?.firstName, "Ana");
  assertEquals(mine?.note, "larger protein share");
});

Deno.test("LE JOUR DE CUISSON EST LU — `cook_on`, la clé de la production", async () => {
  // Le chargeur ne lisait que `cookOn`. Sur une vraie ligne, le jour valait
  // donc `null` PARTOUT, et la borne de trois prenait les trois premières du
  // tableau — l'ordre de composition, pas le calendrier. Mesuré en run réel:
  // « What do I need to cook today? » rendait deux préparations de demain et
  // d'après-demain, 3 passes sur 3.
  const db = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")]);
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assert(ctx);
  // JOUR COURANT D'ABORD, même si le tableau le met en second.
  assertEquals(ctx.preparations.map((p) => p.title), [
    "Roast chicken thighs",
    "Lentils",
  ]);
  assertEquals(ctx.preparations[0].cookOn, "wed");
  assertEquals(ctx.preparations[0].cookDate, TODAY);
  assertEquals(ctx.preparations[0].isToday, true);
  assertEquals(ctx.preparations[1].isToday, false);
  assertEquals(ctx.preparations[1].cookDate, "2026-08-06");

  const block = householdContextBlock(ctx);
  assertStringIncludes(block, "Roast chicken thighs — TODAY");
  assertStringIncludes(block, "Lentils — cook on 2026-08-06 (thu), NOT today");
});

Deno.test("UNE PRÉPARATION D'UN JOUR PASSÉ ne remonte pas", async () => {
  const db = stubDb(
    tables({
      student_generated_meals: [{
        id: "plan-1",
        household_id: HOUSE,
        plan_kind: "household",
        retired_at: null,
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: [{ title: "Roast chicken bowl", slot: "dinner", day: "wed" }],
        preparations: [
          { title: "Soak the beans", cook_on: "mon" }, // 2026-08-03, DERRIÈRE
          { title: "Roast chicken thighs", cook_on: "wed" },
        ],
        member_portions: [],
        shopping_list: [],
      }],
    }),
    [rosterRow(ME_MEMBER, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assertEquals(ctx?.preparations.map((p) => p.title), ["Roast chicken thighs"]);
});

Deno.test("LA LISTE DE COURSES est lue, et son absence est DITE", async () => {
  // Sans elle, mesuré: l'agent fabriquait la liste depuis les titres de plats,
  // en y mêlant ceux des autres jours. Une liste inventée se fait acheter.
  const withList = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")]);
  const ctx = await loadHouseholdTurnContext(withList, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assertEquals(ctx?.shopping, [{ term: "chicken thighs", quantity: "1 kg" }]);
  assertEquals(ctx?.shoppingTruncated, false);
  assertStringIncludes(householdContextBlock(ctx!), "SHOPPING LIST for this window:");

  const without = stubDb(
    tables({
      student_generated_meals: [{
        id: "plan-1",
        household_id: HOUSE,
        plan_kind: "household",
        retired_at: null,
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: [{ title: "Roast chicken bowl", slot: "dinner", day: "wed" }],
        preparations: [],
        member_portions: [],
        shopping_list: [],
      }],
    }),
    [rosterRow(ME_MEMBER, "Ana")],
  );
  const bare = await loadHouseholdTurnContext(without, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assertEquals(bare?.shopping, []);
  assertStringIncludes(
    householdContextBlock(bare!),
    "NEVER build a shopping list out of the dish names",
  );
});

Deno.test("les portions de TOUT LE FOYER sont chargées, la mienne marquée", async () => {
  // Le repas est partagé: `member_portions` EST ce qu'on lit à table. La
  // distinction qui existait ici — « en colocation, uniquement la mienne » —
  // est partie avec la colocation (lot 2, 2026-08-10). Ce qui reste hors du
  // bloc, c'est le CORPS: aucune mesure, aucun objectif, aucune raison.
  const db = stubDb(tables(), [
    rosterRow(ME_MEMBER, "Ana"),
    rosterRow(OTHER_MEMBER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.portions.map((p) => p.firstName).sort(), ["Ana", "Marc"]);
  assertEquals(ctx.portions.filter((p) => p.isMe).map((p) => p.firstName), ["Ana"]);
});

Deno.test("⚠️ MA PART est appariée sur ma LIGNE MEMBRE, pas sur mon compte", async () => {
  // LA GARDE DU RE-CLAVETAGE. `member_portions` est clé sur `member_id`, et le
  // décor donne à chacun un identifiant de membre DIFFÉRENT de son compte: un
  // chargeur qui apparierait encore sur `user_id` ne trouverait plus personne,
  // et `isMe` serait faux partout — donc « c'est quoi ma part ? », le cœur de
  // la fiche, tomberait en silence.
  const db = stubDb(tables(), [
    rosterRow(ME_MEMBER, "Ana"),
    rosterRow(OTHER_MEMBER, "Marc"),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.viewerId, ME_MEMBER);
  const mine = ctx.portions.find((p) => p.isMe);
  assertEquals(mine?.note, "larger protein share");
});

// ---------------------------------------------------------------------------
// LES MODES DE DÉFAILLANCE DE §7
// ---------------------------------------------------------------------------

Deno.test("SANS FOYER, on lit le plan PERSONNEL — et jamais un mot de foyer (R8)", async () => {
  // ⟳ CE TEST A CHANGÉ DE CONCLUSION LE 2026-09-08.
  //
  // Il affirmait « sans foyer, aucun contexte ». C'était le défaut, pas la
  // règle: un solo n'a aucune ligne `household_members`, donc AUCUN bloc de
  // plan ne partait dans le prompt, et le modèle bottait en touche ou inventait
  // un plat. R8 n'a jamais dit « pas de contexte » — R8 dit « pas un mot de
  // foyer à quelqu'un qui vit seul ». C'est cette moitié-là qu'on garde, et
  // elle est maintenant vérifiable SUR un bloc rendu plutôt que sur son
  // absence.
  const db = stubDb(
    {
      household_members: [],
      households: [],
      student_generated_meals: [{
        id: "plan-solo",
        user_id: ME,
        plan_kind: "personal",
        retired_at: null,
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: [{ title: "Solo cod bowl", slot: "dinner", day: "wed" }],
        preparations: [],
        member_portions: [],
      }],
    },
    [],
  );
  assertEquals(await resolveHouseholdIdFor(db, ME), null);

  const ctx = await loadHouseholdTurnContext(db, {
    householdId: null,
    userId: ME,
    localDate: TODAY,
  });
  assert(ctx);
  assertEquals(ctx.scope, "personal");
  assertEquals(ctx.householdId, null);
  assertEquals(ctx.roster, []);
  assertEquals(ctx.todayDishes.length, 1);

  const block = householdContextBlock(ctx);
  assertStringIncludes(block, "Solo cod bowl");
  assertStringIncludes(block, "WHAT THIS STUDENT PLANNED FOR THEMSELVES");
  // ⛔ R8, LA MOITIÉ QUI COMPTE: pas un mot de foyer, sous aucune forme.
  assertEquals(/household/i.test(block), false);
});

Deno.test("UN HOUSEHOLD ID VIDE est lu comme « pas de foyer », pas comme une panne", async () => {
  const db = stubDb({ household_members: [], households: [] }, []);
  const ctx = await loadHouseholdTurnContext(db, {
    householdId: "",
    userId: ME,
    localDate: TODAY,
  });
  assertEquals(ctx?.scope, "personal");
});

Deno.test("SANS JOUR LOCAL, aucun contexte — la fenêtre est indécidable", async () => {
  const db = stubDb({ household_members: [], households: [] }, []);
  assertEquals(
    await loadHouseholdTurnContext(db, {
      householdId: "",
      userId: ME,
      localDate: "",
    }),
    null,
  );
});

Deno.test("la résolution du foyer LÈVE — « pas de foyer » ≠ « je n'ai pas pu savoir »", async () => {
  // C'est la seule différence qui compte pour l'appelant: `loadHouseholdTurnContext`
  // avale ses pannes exprès, mais une panne d'appartenance ne doit pas passer
  // pour « cette personne vit seule » là où on décide d'armer une allergie.
  const db = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")], {
    failOn: "household_members",
  });
  let threw = false;
  try {
    await resolveHouseholdIdFor(db, ME);
  } catch {
    threw = true;
  }
  assert(threw, "une panne d'appartenance doit LEVER, pas rendre null");
  // Le foyer nominal, lui, se résout.
  assertEquals(
    await resolveHouseholdIdFor(
      stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")]),
      ME,
    ),
    HOUSE,
  );
});

// ⟳ CE TEST A ÉTÉ RENVERSÉ LE 2026-09-08, ET LA DÉCISION EST ÉCRITE.
//
// Il affirmait « un plan périmé hier est traité comme ABSENT ». Le motif était
// juste — un plat d'hier servi ce soir est une erreur silencieuse — mais la
// conclusion ne l'était pas: le bilan de fin de plan part à 22 h le DERNIER
// jour, donc le plan disparaissait du contexte à l'instant précis où les
// questions arrivent, et le modèle bottait en touche ou inventait.
//
// Ce qui répare le risque n'est pas de CACHER le plan, c'est de NOMMER sa
// fenêtre. Les deux tests ci-dessous tiennent les deux moitiés: il est lu, et
// il est annoncé comme clos.
const endedPlan = (endsOn: string) => ({
  id: "plan-old",
  household_id: HOUSE,
  // ⚠️ SANS CETTE LIGNE, LE DÉCOR MENT — et il l'a fait: la première rédaction
  // de ces deux tests l'omettait, le chargeur écartait la ligne sur
  // `plan_kind`, et « le plan clos n'est pas lu » aurait été vert pour une
  // raison qui n'a rien à voir avec la fenêtre. C'est la cicatrice déjà écrite
  // dans `tables()`, vingt lignes plus haut, repayée.
  plan_kind: "household",
  retired_at: null,
  starts_on: "2026-07-27",
  ends_on: endsOn,
  dishes: [{ title: "Yesterday's stew", slot: "dinner", day: "tue" }],
  preparations: [],
  member_portions: [],
});

Deno.test("UN PLAN PÉRIMÉ HIER est LU, et son bloc dit qu'il est CLOS", async () => {
  const db = stubDb(
    tables({ student_generated_meals: [endedPlan("2026-08-04")] }),
    [rosterRow(ME_MEMBER, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, {
    householdId: HOUSE,
    userId: ME,
    localDate: TODAY,
  });
  assert(ctx);
  assertEquals(ctx.window, { state: "ended", endedOn: "2026-08-04" });
  assertEquals(ctx.todayDishes.length, 1);

  const block = householdContextBlock(ctx);
  assertStringIncludes(block, "THIS PLAN IS OVER");
  assertStringIncludes(block, "2026-08-04");
  // ⛔ LA MOITIÉ QUI EMPÊCHE LE DÉFAUT D'ORIGINE. Le plat est là, mais rien ne
  // le présente comme celui de ce soir: pas de section « TODAY'S DISHES », et
  // chaque plat porte son jour.
  assertEquals(block.includes("TODAY'S DISHES"), false);
  assertStringIncludes(block, "[tue] Yesterday's stew");
  assertStringIncludes(block, "past tense");
});

Deno.test("AU-DELÀ DE SEPT JOURS, le plan clos redevient ABSENT", async () => {
  // Le plafond est ce qui empêche un bloc daté de traîner jusqu'à se relire
  // comme le plan courant. TODAY = 2026-08-05, donc un plan fini le 2026-07-28
  // est à huit jours: hors de portée.
  const db = stubDb(
    tables({ student_generated_meals: [endedPlan("2026-07-28")] }),
    [rosterRow(ME_MEMBER, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, {
    householdId: HOUSE,
    userId: ME,
    localDate: TODAY,
  });
  assert(ctx);
  assertEquals(ctx.window, { state: "current" });
  assertEquals(ctx.hasPlanToday, false);
  assertEquals(ctx.todayDishes, []);
});

Deno.test("UN PLAN RETIRÉ n'est pas lu", async () => {
  const db = stubDb(
    tables({
      student_generated_meals: [{
        id: "plan-retired",
        household_id: HOUSE,
        // Même raison que dans `endedPlan`: sans `plan_kind`, ce test serait
        // vert parce que la ligne est écartée sur la MAUVAISE colonne, et il ne
        // prouverait rien de `retired_at`.
        plan_kind: "household",
        retired_at: "2026-08-04T10:00:00Z",
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: [{ title: "Replaced dish", slot: "dinner", day: "wed" }],
        preparations: [],
        member_portions: [],
      }],
    }),
    [rosterRow(ME_MEMBER, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assertEquals(ctx?.hasPlanToday, false);
});

Deno.test("SANS PLAT COMPOSÉ, le bloc porte vers la composition — JAMAIS vers un tiers", async () => {
  // MODEL.md: « ton coach prépare ton plan » est FAUX, il n'existe aucun canal
  // 1:1 coach → élève. C'est la copie la plus souvent violée du produit.
  const db = stubDb(
    tables({ student_generated_meals: [] }),
    [rosterRow(ME_MEMBER, "Ana")],
  );
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "NOTHING IS COMPOSED FOR TODAY");
  assertStringIncludes(block, "they compose it themselves");
  assertStringIncludes(block, "NEVER say their coach is preparing");
  assertEquals(/wait for (your|their) coach/i.test(block), false);
});

Deno.test("UNE LECTURE EN PANNE rend null et journalise — jamais « rien de prévu »", async () => {
  // ⚠️ `households` N'EST PLUS DANS CETTE LISTE, et ce n'est pas un oubli: le
  // chargeur ne la lit plus depuis que `kind` a disparu (lot 2). L'y laisser
  // ferait un cas qui passe pour une raison FAUSSE — la panne ne se produirait
  // sur rien. `household_food_restrictions` la remplace: c'est une lecture
  // réelle, et son échec doit rendre `null` comme les autres.
  //
  // ⚠️ `household_members` N'Y EST PLUS NON PLUS: ce chargeur ne la lit plus
  // depuis que la résolution du foyer est remontée chez l'appelant (chantier
  // 5). Sa panne se teste au-dessus, sur `resolveHouseholdIdFor`, et elle
  // LÈVE — parce que là-haut la différence entre « pas de foyer » et « je ne
  // sais pas » décide si une allergie est armée.
  for (
    const failOn of [
      "rpc",
      "student_generated_meals",
      "household_food_restrictions",
    ]
  ) {
    const db = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")], { failOn });
    assertEquals(
      await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY }),
      null,
      `panne sur ${failOn}`,
    );
  }
});

Deno.test("sans date locale, on ne va rien chercher", async () => {
  const db = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")]);
  assertEquals(await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: "" }), null);
});

// ---------------------------------------------------------------------------
// LES RESTRICTIONS — attribuées, jamais justifiées
// ---------------------------------------------------------------------------

Deno.test("une restriction qui ME vise est ATTRIBUÉE et NON JUSTIFIÉE", async () => {
  const db = stubDb(
    tables({
      household_food_restrictions: [
        { label: "Nutella", member_id: ME_MEMBER, created_by: OTHER, household_id: HOUSE },
      ],
    }),
    // Marc porte son `user_id`: `created_by` est un identifiant de COMPTE, et
    // seul quelqu'un qui en a un peut poser une règle de maison. C'est ce qui
    // permet à l'écran d'attribuer la décision à un humain plutôt que de la
    // rendre impersonnelle — donc de la faire passer pour un avis du produit.
    [
      rosterRow(ME_MEMBER, "Ana"),
      rosterRow(OTHER_MEMBER, "Marc", { role: "owner", user_id: OTHER }),
    ],
  );
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assertEquals(ctx?.myRestrictions, [{ label: "Nutella", chosenBy: "Marc" }]);

  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "chosen by Marc");
  assertStringIncludes(block, "ATTRIBUTED and UNJUSTIFIED");
  assertStringIncludes(block, "Never give a health reason");
});

Deno.test("une restriction qui vise QUELQU'UN D'AUTRE n'est pas chargée", async () => {
  const db = stubDb(
    tables({
      household_food_restrictions: [
        { label: "Nutella", member_id: OTHER_MEMBER, created_by: ME, household_id: HOUSE },
      ],
    }),
    [rosterRow(ME_MEMBER, "Ana"), rosterRow(OTHER_MEMBER, "Marc")],
  );
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assertEquals(ctx?.myRestrictions, []);
});

// ---------------------------------------------------------------------------
// LE MINEUR
// ---------------------------------------------------------------------------

Deno.test("un mineur est un MANGEUR, jamais une cible", async () => {
  const db = stubDb(tables(), [
    rosterRow(ME_MEMBER, "Ana"),
    rosterRow(CHILD_MEMBER, "Léo", { age_state: "minor" }),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  const block = householdContextBlock(ctx!);
  assertStringIncludes(block, "is an EATER, never a target");
  assertStringIncludes(block, "No nutritional goal");
});

// ---------------------------------------------------------------------------
// LES NO-GO STRUCTURELS
// ---------------------------------------------------------------------------

Deno.test("DEUX BLOCS DE PLAN NE SE CONFONDENT PAS", async () => {
  // `keel_plan_context.ts`: « two plan blocks in one prompt is how a model gets
  // to pick the more flattering one ». Le titre de celui-ci ne dit jamais
  // « plan », et sa première phrase interdit la fusion.
  const db = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")]);
  const block = householdContextBlock(
    (await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY }))!,
  );
  assertStringIncludes(block, "WHAT THIS HOUSEHOLD IS EATING");
  assertStringIncludes(block, "This is NOT the coach's plan");
  assertStringIncludes(block, "Never merge the two");
});

Deno.test("LECTURE SEULE, et le bloc le dit", async () => {
  const db = stubDb(tables(), [rosterRow(ME_MEMBER, "Ana")]);
  const block = householdContextBlock(
    (await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY }))!,
  );
  assertStringIncludes(block, "READ-ONLY");
  assertStringIncludes(block, "Never invent a dish");
  // Aucune coche inférée d'un plat prévu.
  assertStringIncludes(block, "A dish being planned is NOT a dish being eaten");
});

Deno.test("LE BLOC EST BORNÉ — le budget tronque par la queue", async () => {
  // Un foyer de six avec sept jours de préparations dépasserait le prompt. On
  // borne au jour courant, et on pinne la taille.
  const db = stubDb(
    tables({
      student_generated_meals: [{
        id: "plan-big",
        household_id: HOUSE,
        plan_kind: "household",
        retired_at: null,
        starts_on: "2026-08-03",
        ends_on: "2026-08-09",
        dishes: Array.from({ length: 20 }, (_, i) => ({
          title: `Dish ${i}`,
          slot: "dinner",
          day: "wed",
        })),
        preparations: Array.from({ length: 20 }, (_, i) => ({
          title: `Prep ${i}`,
          cook_on: "wed",
        })),
        member_portions: Array.from({ length: 20 }, (_, i) => ({
          user_id: `u-${i}`,
          display_name: `M${i}`,
          portion_note: "standard",
        })),
        shopping_list: Array.from({ length: 40 }, (_, i) => ({
          term: `item ${i}`,
          quantity: "1 unit",
        })),
      }],
    }),
    Array.from({ length: 20 }, (_, i) => rosterRow(`u-${i}`, `M${i}`)).concat([
      rosterRow(ME_MEMBER, "Ana"),
    ]),
  );
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.todayDishes.length, 4);
  assertEquals(ctx.preparations.length, 3);
  assert(ctx.portions.length <= 6);
  assertEquals(ctx.shopping.length, 12);
  assertEquals(ctx.shoppingTruncated, true);
  const block = householdContextBlock(ctx);
  // La liste tronquée le DIT: une liste coupée présentée comme complète est un
  // panier faux.
  assertStringIncludes(block, "there are more");
  assert(
    block.length < 3200,
    `le bloc fait ${block.length} caractères — il doit rester sous 3 200`,
  );
});

Deno.test("UNE BOUCHE SANS COMPTE est au roster, nommée, et arme la ceinture", async () => {
  // LE CAS NOMINAL DU PRODUIT depuis le lot 1: Léo a huit ans, donc pas
  // d'adresse e-mail, donc `user_id: null`. Avant le re-clavetage il ne pouvait
  // pas exister — il fallait un compte pour être une bouche.
  const db = stubDb(tables(), [
    rosterRow(ME_MEMBER, "Ana"),
    rosterRow(CHILD_MEMBER, "Léo", { age_state: "minor", user_id: null }),
  ]);
  const ctx = await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY });
  assert(ctx);
  assertEquals(ctx.roster.find((r) => r.memberId === CHILD_MEMBER)?.userId, null);

  const block = householdContextBlock(ctx);
  assertStringIncludes(block, "Léo (child)");
  assertStringIncludes(block, "is an EATER, never a target");
});

Deno.test("⚠️ UN ÂGE INCONNU ne porte AUCUNE étiquette", async () => {
  // Écrire « (adult) » par défaut affirmerait un fait qu'on n'a pas, et le
  // modèle s'en servirait pour dimensionner. C'est l'inversion du lot 2 rendue
  // visible dans le texte: une bouche sans date est un prénom, rien de plus.
  const db = stubDb(tables(), [
    rosterRow(ME_MEMBER, "Ana"),
    rosterRow(OTHER_MEMBER, "Sam", { age_state: "unknown", user_id: null }),
  ]);
  const block = householdContextBlock(
    (await loadHouseholdTurnContext(db, { householdId: HOUSE, userId: ME, localDate: TODAY }))!,
  );
  assertStringIncludes(block, "Sam");
  assertEquals(block.includes("Sam ("), false);
  // Et la ceinture mineur NE s'arme pas: personne n'est déclaré mineur ici.
  assertEquals(block.includes("is an EATER, never a target"), false);
});
