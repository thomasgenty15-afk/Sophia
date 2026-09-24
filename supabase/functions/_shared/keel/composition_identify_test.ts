/**
 * ⟳ 2026-09-24 — RETROUVER UN ALIMENT MAL NOMMÉ : le cas `377e91ad`, et les
 * gardes qui empêchent l'appel de devenir un rapprochement de chaînes.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  applyIdentifications,
  COMPOSITION_IDENTIFY_SYSTEM_PROMPT,
  forgetModelRefs,
  type IdentifiableLine,
  identifyCandidateLines,
  identifyRequestsFor,
  type IdentifyVerdict,
  parseIdentifyAnswers,
} from "./composition_identify.ts";
import { identifyPlanFoods } from "./composition_identify_io.ts";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { isComposable } from "./food_reference_manifest.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 20,
    proteinG: 1,
    carbsG: null,
    fatG: null,
    fiberG: null,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

const INDEX = buildCompositionIndex(
  [
    ref({ slug: "courgette", label: "Courgette" }),
    ref({ slug: "aubergine", label: "Aubergine" }),
    ref({ slug: "tomato", label: "Tomato" }),
    ref({ slug: "prune", label: "Plum, dried", foodGroupRef: "other_fruit", energyKcal: 229 }),
    ref({ slug: "plum", label: "Plum", foodGroupRef: "other_fruit", energyKcal: 46 }),
    // Une fiche du sas : présente dans l'index, jamais composable.
    ref({ slug: "dragon_fruit", label: "dragon fruit", source: "model" }),
  ],
  [
    { alias: "courgette", slug: "courgette" },
    { alias: "tomate", slug: "tomato" },
  ],
);

const line = (term: string, ref: string | null = null, refRefused = false): IdentifiableLine => ({
  term,
  ref,
  refRefused,
  state: "raw",
});

Deno.test("① seuls les noms que la base ne lit pas partent à l'appel, dédoublonnés", () => {
  const { requests, overCap } = identifyRequestsFor(INDEX, [
    line("courgette", null, true), // code refusé (« zucchini » au parseur)
    line("melanzane"), // nom inconnu (l'aubergine en italien)
    line("melanzane"),
    line("tomate"), // le nom mène à `tomato`
    line("courgette", "courgette"), // code accepté
  ]);
  // ⟳ 2026-09-24 — « courgette » au code refusé est un nom connu mot pour
  // mot : il se lit par son nom, sans appel.
  assertEquals(requests.map((r) => [r.term, r.occurrences]), [
    ["melanzane", 2],
  ]);
  assertEquals(overCap, []);
});

Deno.test("② la table envoyée ne porte que le composable, avec son libellé", () => {
  const lines = identifyCandidateLines(INDEX, isComposable);
  assert(lines.includes("prune | Plum, dried"), "le libellé qui dit « sec » doit partir");
  assert(lines.includes("courgette | Courgette"));
  assert(!lines.some((l) => l.startsWith("dragon_fruit")), "une fiche du sas n'est pas un choix");
  assert(lines.includes("# other_fruit"));
});

Deno.test("③ la réponse : slug accepté, null = absent, slug inventé ou non composable jeté et compté", () => {
  const requests = ["courgette", "fruit du dragon", "melanzane", "kumquat", "pitaya"]
    .map((term) => ({ term, state: null, occurrences: 1 }));
  const raw = JSON.stringify({
    items: [
      { term: "courgette", slug: "courgette" },
      { term: "fruit du dragon", slug: null },
      { term: "melanzane", slug: "eggplant" },
      { term: "kumquat", slug: "null" },
      { term: "pitaya", slug: "dragon_fruit" },
      { term: "pas demande", slug: "tomato" },
    ],
  });
  const { answers, invented, notComposable } = parseIdentifyAnswers(raw, requests, INDEX, isComposable);
  assertEquals(answers.get("courgette"), { kind: "slug", slug: "courgette" });
  assertEquals(answers.get("fruit du dragon"), { kind: "absent" });
  assertEquals(answers.get("kumquat"), { kind: "absent" });
  // ⛔ UN SLUG INVENTÉ N'EST PAS « ABSENT » : pas de décision du tout.
  assertEquals(answers.has("melanzane"), false);
  assertEquals(invented, 1);
  assertEquals(answers.has("pitaya"), false);
  assertEquals(notComposable, 1);
  assertEquals(answers.has("pas demande"), false);
});

Deno.test("③ bis — une sortie illisible ne décide rien, et ne lève pas", () => {
  const requests = [{ term: "courgette", state: null, occurrences: 1 }];
  assertEquals(parseIdentifyAnswers("pas du json", requests, INDEX, isComposable).answers.size, 0);
  assertEquals(parseIdentifyAnswers(null, requests, INDEX, isComposable).answers.size, 0);
  assertEquals(parseIdentifyAnswers('{"items":7}', requests, INDEX, isComposable).answers.size, 0);
});

Deno.test("④ les décisions s'écrivent sur les lignes — le cas `377e91ad`", () => {
  const lines = [
    line("courgette", null, true),
    line("tomate"),
    line("fruit du dragon"),
    line("melanzane"),
    line("plum", "plum"),
    line("zucchini grillée"),
  ];
  const decisions = new Map<string, IdentifyVerdict>([
    ["zucchini grillee", { kind: "slug", slug: "courgette" }],
    ["fruit du dragon", { kind: "absent" }],
  ]);
  const counts = applyIdentifications({
    index: INDEX,
    isComposable,
    lines,
    decisions,
    fallbackRefs: new Map(),
  });
  // Le code refusé devient l'aliment de son nom, connu mot pour mot.
  assertEquals([lines[0].ref, lines[0].refRefused], ["courgette", false]);
  // Le nom connu mot pour mot devient son code.
  assertEquals(lines[1].ref, "tomato");
  // Un nom inconnu mot pour mot prend la décision de l'appel.
  assertEquals(lines[5].ref, "courgette");
  // Absent : la ligne reste un nom, pour le sas.
  assertEquals([lines[2].ref, lines[2].refRefused], [null, false]);
  // Sans décision : rien ne bouge.
  assertEquals(lines[3].ref, null);
  // Un code accepté n'est jamais réécrit.
  assertEquals(lines[4].ref, "plum");
  assertEquals(counts, {
    lines_by_name: 2,
    lines_by_model: 1,
    lines_absent: 1,
    lines_unanswered: 1,
    lines_model_ref_fallback: 0,
    groups_corrected: 0,
    absent_but_term_resolves: 0,
  });
});

Deno.test("④ bis — « absent » sur un code refusé : la ligne ne passe au sas que si son nom ne mène à rien", () => {
  const inconnu = line("fruit du dragon", null, true);
  const connu = line("tomate", null, true);
  applyIdentifications({
    index: INDEX,
    isComposable,
    lines: [inconnu, connu],
    decisions: new Map<string, IdentifyVerdict>([
      ["fruit du dragon", { kind: "absent" }],
      ["tomate", { kind: "absent" }],
    ]),
    fallbackRefs: new Map(),
  });
  assertEquals([inconnu.ref, inconnu.refRefused], [null, false]);
  // ⟳ 2026-09-24 — « tomate » est connu mot pour mot : le nom décide, avant
  // toute décision de l'appel.
  assertEquals([connu.ref, connu.refRefused], ["tomato", false]);
});

Deno.test("④ ter — une fiche du sas trouvée par le nom ne devient jamais un code", () => {
  const index = buildCompositionIndex(
    [ref({ slug: "dragon_fruit", label: "dragon fruit", source: "model" })],
    [{ alias: "pitaya", slug: "dragon_fruit" }],
  );
  const pitaya = line("pitaya");
  const counts = applyIdentifications({
    index,
    isComposable,
    lines: [pitaya],
    decisions: new Map(),
    fallbackRefs: new Map(),
  });
  assertEquals(pitaya.ref, null);
  assertEquals(counts.lines_by_name, 0);
});

Deno.test("⑤ la consigne dit la forme, le « même aliment » et l'échappatoire, ensemble", () => {
  assert(COMPOSITION_IDENTIFY_SYSTEM_PROMPT.includes("json"));
  assert(COMPOSITION_IDENTIFY_SYSTEM_PROMPT.includes('"slug"'));
  assert(COMPOSITION_IDENTIFY_SYSTEM_PROMPT.includes("null"));
  assert(COMPOSITION_IDENTIFY_SYSTEM_PROMPT.includes("Plum, dried"));
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LE GESTE COMPLET — table des noms retenus, appel, écriture
// ═══════════════════════════════════════════════════════════════════════════

function fakeDb(rows: { form: string; slug: string | null; status: string }[]) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    db: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return Promise.resolve({ error: null });
      },
      from: (_table: string) => ({
        select: (_columns: string) => ({
          in: (_column: string, values: readonly string[]) =>
            Promise.resolve({ data: rows.filter((r) => values.includes(r.form)), error: null }),
        }),
      }),
    },
  };
}

const META = { source: "test", requestId: "r", userId: "u" };

Deno.test("⑥ un nom retenu est relu sans appel ; le reste part en un seul appel, puis est retenu", async () => {
  const { db, calls } = fakeDb([
    { form: "courgette", slug: "courgette", status: "active" },
    { form: "melanzane", slug: "tomato", status: "conflict" },
  ]);
  const lines = [line("courgette", null, true), line("melanzane"), line("fruit du dragon")];
  const asked: string[][] = [];
  const { counts } = await identifyPlanFoods({
    db,
    index: INDEX,
    isComposable,
    lines,
    forgetModelRefs: false,
    meta: META,
    ask: (requests) => {
      asked.push(requests.map((r) => r.term));
      return Promise.resolve(JSON.stringify({
        items: [
          { term: "melanzane", slug: "aubergine" },
          { term: "fruit du dragon", slug: null },
        ],
      }));
    },
  });
  // Le nom en conflit repart à l'appel ; « courgette » se lit par son nom.
  assertEquals(asked, [["fruit du dragon", "melanzane"]]);
  assertEquals(lines.map((l) => l.ref), ["courgette", "aubergine", null]);
  assertEquals(counts.reused, 0);
  assertEquals(counts.lines_by_name, 1);
  assertEquals(counts.lines_by_model, 1);
  assertEquals(counts.lines_absent, 1);
  // ⚠️ SEUL CE QUE LE MODÈLE A DIT SUR CE PLAN EST RETENU.
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "record_food_composition_identifications");
  assertEquals(calls[0].args.p_rows, [
    { form: "melanzane", slug: "aubergine" },
    { form: "fruit du dragon", slug: null },
  ]);
});

Deno.test("⑥ bis — aucun appel quand tout se lit déjà, et l'étape par le nom tourne quand même", async () => {
  const { db, calls } = fakeDb([]);
  const lines = [line("tomate"), line("plum", "plum")];
  let asked = 0;
  const { counts } = await identifyPlanFoods({
    db,
    index: INDEX,
    isComposable,
    lines,
    forgetModelRefs: false,
    meta: META,
    ask: () => {
      asked++;
      return Promise.resolve(null);
    },
  });
  assertEquals(asked, 0);
  assertEquals(calls.length, 0);
  assertEquals(lines[0].ref, "tomato");
  assertEquals(counts.lines_by_name, 1);
});

Deno.test("⑥ ter — un appel en échec ne change rien et se compte", async () => {
  const { db } = fakeDb([]);
  const lines = [line("melanzane", null, true)];
  const { counts } = await identifyPlanFoods({
    db,
    index: INDEX,
    isComposable,
    lines,
    forgetModelRefs: false,
    meta: META,
    ask: () => Promise.resolve(null),
  });
  assertEquals([lines[0].ref, lines[0].refRefused], [null, true]);
  assertEquals(counts.call_failed, 1);
  assertEquals(counts.lines_unanswered, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LE MODÈLE NOMME, ON IDENTIFIE — ses identifiants oubliés, gardés en repli
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⑦ l'identifiant du voisin est oublié : le nom décide", async () => {
  // « pâtes complètes · ref white_pasta » — le voisin du catalogue.
  const index = buildCompositionIndex(
    [
      ref({ slug: "white_pasta", label: "Pasta", foodGroupRef: "refined_grain" }),
      ref({ slug: "wholewheat_pasta", label: "Wholewheat pasta", foodGroupRef: "whole_grain" }),
    ],
    [{ alias: "pates completes", slug: "wholewheat_pasta" }],
  );
  const { db } = fakeDb([]);
  const pates: IdentifiableLine = {
    term: "pâtes complètes",
    ref: "white_pasta",
    refRefused: false,
    state: "raw",
    group: "refined_grain",
  };
  const { counts } = await identifyPlanFoods({
    db,
    index,
    isComposable,
    lines: [pates],
    forgetModelRefs: true,
    meta: META,
    ask: () => Promise.resolve(null),
  });
  assertEquals(pates.ref, "wholewheat_pasta");
  // ⛔ LA FAMILLE SUIT L'ALIMENT RETROUVÉ : c'est elle que lit la ceinture des régimes.
  assertEquals(pates.group, "whole_grain");
  assertEquals(counts.model_refs_forgotten, 1);
  assertEquals(counts.groups_corrected, 1);
});

Deno.test("⑦ bis — rien n'a répondu : l'identifiant du modèle sert de repli, et se compte", async () => {
  const { db } = fakeDb([]);
  const melanzane: IdentifiableLine = { term: "melanzane", ref: "aubergine", refRefused: false };
  const inventee: IdentifiableLine = { term: "kumquat", ref: null, refRefused: true };
  const { counts } = await identifyPlanFoods({
    db,
    index: INDEX,
    isComposable,
    lines: [melanzane, inventee],
    forgetModelRefs: true,
    meta: META,
    ask: () => Promise.resolve(null),
  });
  assertEquals(melanzane.ref, "aubergine");
  assertEquals(counts.lines_model_ref_fallback, 1);
  // Un identifiant REFUSÉ au parseur n'est pas un repli.
  assertEquals([inventee.ref, inventee.refRefused], [null, false]);
  assertEquals(counts.call_failed, 1);
});

Deno.test("⑦ ter — « absent » ne reprend jamais l'identifiant du modèle", () => {
  const ligne: IdentifiableLine = { term: "fruit du dragon", ref: "plum", refRefused: false };
  const gardes = forgetModelRefs([ligne]);
  assertEquals(gardes.get(ligne), "plum");
  assertEquals(ligne.ref, null);
  const counts = applyIdentifications({
    index: INDEX,
    isComposable,
    lines: [ligne],
    decisions: new Map<string, IdentifyVerdict>([["fruit du dragon", { kind: "absent" }]]),
    fallbackRefs: gardes,
  });
  assertEquals(ligne.ref, null, "la base n'a pas cet aliment : le sas le crée, pas le voisin");
  assertEquals(counts.lines_model_ref_fallback, 0);
});

Deno.test("⑧ ⟳ 2026-09-24 — un nom qui ne se trouve qu'en le RÉDUISANT n'est pas connu : il part à l'appel", async () => {
  // Brouillon `97567be2` : « steak haché de bœuf cuit » réduit en « steak de
  // bœuf » par le résolveur de terme, rattaché à un steak entier. Le nom
  // exact n'est pas connu : l'appel tranche, et choisit le haché.
  const index = buildCompositionIndex(
    [
      ref({ slug: "beef_steak", label: "Beef steak", foodGroupRef: "red_meat", yieldClass: "meat_shrinks" }),
      ref({ slug: "beef_mince", label: "Beef mince (5%)", foodGroupRef: "red_meat", yieldClass: "meat_shrinks" }),
    ],
    [{ alias: "steak de boeuf", slug: "beef_steak" }],
  );
  const { db } = fakeDb([]);
  const steak: IdentifiableLine = { term: "steak haché de bœuf", ref: null, refRefused: false };
  const asked: string[][] = [];
  await identifyPlanFoods({
    db,
    index,
    isComposable,
    lines: [steak],
    forgetModelRefs: true,
    meta: META,
    ask: (requests) => {
      asked.push(requests.map((r) => r.term));
      return Promise.resolve(JSON.stringify({ items: [{ term: "steak hache de boeuf", slug: "beef_mince" }] }));
    },
  });
  assertEquals(asked, [["steak hache de boeuf"]]);
  assertEquals(steak.ref, "beef_mince");
});
