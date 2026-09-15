// ADOPTER SANS MODÈLE — ce que ces tests empêchent de revenir.
//
//   1. QUE LE PLAN ÉCRIT NE SOIT PAS LE PLAN RELU. Mesuré: aperçu 6 boîtes,
//      base 0 boîte, HTTP 200 — parce qu'adopter relançait une composition
//      complète. Le test nominal compare `p_payload` au `write_payload` STOCKÉ
//      par une ÉGALITÉ PROFONDE sur l'objet entier: c'est la propriété que tout
//      ce lot existe pour tenir, et une clé perdue en chemin doit rougir.
//   2. QU'UN SECOND APPEL MODÈLE REVIENNE. Deux appels dans une requête
//      passaient le plafond de la passerelle: 504 mesuré à 150 008 ms. Un test
//      RELIT le module et refuse les trois symboles d'appel modèle du dépôt.
//   3. QU'UN REFUS ÉCRIVE QUAND MÊME. Chaque motif vérifie AUSSI que
//      `write_student_meal_plan` n'a jamais été appelée.
//   4. QU'UNE GARDE SAUTÉE RESSEMBLE À UNE GARDE PASSÉE. Sans contexte gelé,
//      la sortie dit `context_unavailable` — jamais `ok`.
//   5. QUE LA DÉCISION DÉPENDE DE L'HORLOGE. Deux appels identiques rendent le
//      MÊME objet.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  adoptDraft,
  type AdoptOutcome,
  type AdoptRefusalBody,
} from "./draft_adopt.ts";
import {
  DRAFT_CONTRACT_VERSION,
  sourceVersionOf,
} from "./draft_store.ts";
import {
  FINAL_GATE_POLICY_LOT_4,
  finalPlanGate,
  type GateContext,
  type GatePlan,
} from "./final_plan_gate.ts";
import {
  CLEAN_HOUSEHOLD_CONTEXT,
  CLEAN_HOUSEHOLD_PLAN,
} from "./final_plan_gate_fixtures.ts";
import {
  type SafetyFingerprintInput,
  safetyFingerprintOf,
} from "./safety_fingerprint.ts";

const USER = "44cb7e24-6f82-4ae1-8611-2783f65d889a";
const DRAFT = "0f9d5f4e-7a1b-4c2d-8e3f-1a2b3c4d5e6f";
const MEAL = "5c1e2a3b-4d5e-4f60-9a8b-7c6d5e4f3a2b";
const REQUEST = "req-adopt-1";
const NOW = "2026-09-07T09:00:00.000Z";
const PROMPT_VERSION = "v31";

// ===========================================================================
// LE FAUX CLIENT — il enregistre TOUT, la RPC comprise
// ===========================================================================

interface Scripted {
  readonly data: unknown;
  readonly error: unknown;
}

interface RecordedCall {
  table: string;
  op: "update" | "select" | "rpc";
  payload: Record<string, unknown> | null;
  columns: string | null;
  single: boolean;
  filters: { fn: string; column: string; value: unknown }[];
}

interface Script {
  select?: Scripted[];
  update?: Scripted[];
  rpc?: Scripted[];
}

function fakeAdmin(script: Script = {}) {
  const calls: RecordedCall[] = [];
  const queue: Record<"select" | "update" | "rpc", Scripted[]> = {
    select: [...(script.select ?? [])],
    update: [...(script.update ?? [])],
    rpc: [...(script.rpc ?? [])],
  };

  const build = (call: RecordedCall) => {
    const result = (): Scripted => queue[call.op].shift() ?? { data: null, error: null };
    const builder = {
      select(columns: string) {
        call.columns = columns;
        return builder;
      },
      eq(column: string, value: unknown) {
        call.filters.push({ fn: "eq", column, value });
        return builder;
      },
      in(column: string, values: readonly unknown[]) {
        call.filters.push({ fn: "in", column, value: values });
        return builder;
      },
      lt(column: string, value: unknown) {
        call.filters.push({ fn: "lt", column, value });
        return builder;
      },
      maybeSingle() {
        call.single = true;
        return Promise.resolve(result());
      },
      then<A, B>(
        onfulfilled?: ((value: Scripted) => A | PromiseLike<A>) | null,
        onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
      ) {
        return Promise.resolve(result()).then(onfulfilled, onrejected);
      },
    };
    return builder;
  };

  const open = (
    table: string,
    op: RecordedCall["op"],
    payload: Record<string, unknown> | null,
  ) => {
    const call: RecordedCall = {
      table,
      op,
      payload,
      columns: null,
      single: false,
      filters: [],
    };
    calls.push(call);
    return build(call);
  };

  const admin = {
    from(table: string) {
      return {
        update: (patch: Record<string, unknown>) => open(table, "update", patch),
        select: (columns: string) => open(table, "select", null).select(columns),
      };
    },
    rpc(name: string, params: Record<string, unknown>) {
      const call = open(name, "rpc", params);
      return call.then((r: Scripted) => r);
    },
  };

  // `as never`: le paramètre est un vrai `SupabaseClient` (un type structurel
  // maison rend `TS2589` au point d'appel réel — note de `draft_store.ts`).
  return { admin: admin as never, calls };
}

const adoptCalls = (calls: readonly RecordedCall[]) =>
  calls.filter((c) => c.op === "rpc" && c.table === "keel_adopt_meal_draft");

/** Une horloge INJECTÉE: le temps mur du journal cesse de varier. */
function fixedClock(): () => number {
  let t = 1_000;
  return () => (t += 7);
}

function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...parts: unknown[]) => {
    lines.push(parts.map((p) => String(p)).join(" "));
  };
  return { lines, restore: () => (console.log = original) };
}


/**
 * LE CORPS D'UN REFUS, AVEC LA PREUVE QUE C'EN EST UN.
 *
 * ⚠️ Un `as AdoptRefusalBody` aurait suffi au compilateur et aurait DÉSARMÉ le
 * test: sur une sortie 200, `body.error` serait `undefined` et la comparaison
 * au motif attendu échouerait par hasard, ou pire, passerait un jour. Le
 * `throw` est ce qui distingue « ce refus porte le mauvais motif » de
 * « l'adoption a écrit ».
 */
function refusal(out: AdoptOutcome): AdoptRefusalBody {
  if (out.ok) throw new Error("un refus etait attendu, l'adoption a reussi");
  return out.body;
}

// ===========================================================================
// LA FIXTURE — un plan dont tous les contrôles essentiels ont conclu
// ===========================================================================

/**
 * ⚠️ L'OBJET EST FIGÉ EN PROFONDEUR. Si `adoptDraft` mutait le payload avant de
 * le passer à la RPC, la mutation lèverait au lieu de passer inaperçue.
 */
const WRITE_PAYLOAD = Object.freeze(CLEAN_HOUSEHOLD_PLAN);
const GATE_CONTEXT = Object.freeze(CLEAN_HOUSEHOLD_CONTEXT);

const POST_WRITE = {
  draftNote: { text: "moins de riz" },
  members: [{ memberId: "m1", label: "Lea" }],
  contentLocale: "fr-FR",
  timezone: "Europe/Paris",
  measured: { verdict: "ok" },
  targetWeek: "2026-09-07",
};

const LIVE_SAFETY: SafetyFingerprintInput = {
  lane: "solo",
  members: [],
  houseRules: [],
  ownerConstraints: [
    { kind: "allergy", ref: "tree_nut", label: "fruits à coque", severity: "medical" },
  ],
};

async function doneRow(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return {
    id: DRAFT,
    user_id: USER,
    status: "done",
    expires_at: "2026-09-08T09:00:00.000Z",
    starts_on: "2026-09-07",
    duration_days: 1,
    write_payload: WRITE_PAYLOAD,
    response: { dishes: [] },
    adoption_context: { gate: GATE_CONTEXT, postWrite: POST_WRITE },
    safety_fingerprint: await safetyFingerprintOf(LIVE_SAFETY),
    source_version: sourceVersionOf(PROMPT_VERSION),
    ...overrides,
  };
}

function run(
  admin: never,
  overrides: Partial<Parameters<typeof adoptDraft>[0]> = {},
): Promise<AdoptOutcome> {
  return adoptDraft({
    admin,
    userId: USER,
    lane: "meal",
    draftId: DRAFT,
    intent: "replace_current",
    replaces: null,
    requestId: REQUEST,
    nowIso: NOW,
    liveSafety: LIVE_SAFETY,
    promptVersion: PROMPT_VERSION,
    clockMs: fixedClock(),
    ...overrides,
  });
}

async function adoptOnce(
  row: Record<string, unknown> | null,
  script: Omit<Script, "select"> = {},
  overrides: Partial<Parameters<typeof adoptDraft>[0]> = {},
) {
  const { admin, calls } = fakeAdmin({
    select: [{ data: row, error: null }],
    rpc: script.rpc ?? [{
      data: { ok: true, meal_id: MEAL, retired_plan_id: null, replayed: false },
      error: null,
    }],
    update: script.update ?? [{ data: null, error: null }],
  });
  const capture = captureLogs();
  try {
    const out = await run(admin, overrides);
    return { out, calls, logs: capture.lines };
  } finally {
    capture.restore();
  }
}

// ===========================================================================
// 1. LE CAS QUI PASSE — d'abord, et c'est la règle du dépôt
// ===========================================================================

Deno.test("LE CAS QUI PASSE: une RPC atomique adopte exactement le brouillon relu", async () => {
  const { out, calls } = await adoptOnce(await doneRow());

  assertEquals(out.status, 200);
  assert(out.ok, "l'adoption doit réussir");
  assertEquals(out.body, {
    ok: true,
    meal: { id: MEAL },
    window: { starts_on: "2026-09-07", duration_days: 1 },
    draft_id: DRAFT,
    request_id: REQUEST,
    already_written: false,
    diagnostics: { gate: "ok", gate_refusals: 0 },
  });

  const adopted = adoptCalls(calls);
  assertEquals(adopted.length, 1, "une seule transaction d'adoption");
  assertEquals(adopted[0].payload, {
    p_draft: DRAFT,
    p_user: USER,
    p_intent: "replace_current",
    p_replaces: null,
    p_live_fingerprint: await safetyFingerprintOf(LIVE_SAFETY),
    p_contract_version: DRAFT_CONTRACT_VERSION,
  });
  assertEquals(
    calls.filter((c) => c.op === "update").length,
    0,
    "aucun marquage séparé ne peut diverger de l'écriture",
  );

  assertEquals(out.postWrite, {
    available: true,
    draftNote: { text: "moins de riz" },
    members: [{ memberId: "m1", label: "Lea" }],
    contentLocale: "fr-FR",
    timezone: "Europe/Paris",
    measured: { verdict: "ok" },
    targetWeek: "2026-09-07",
  });
});

Deno.test("la transaction SQL passe `write_payload` tel quel à l'écriture du plan", async () => {
  const sql = await Deno.readTextFile(new URL(
    "../../../migrations/20260914143000_adoption_de_brouillon_atomique.sql",
    import.meta.url,
  ));
  assert(sql.includes("p_payload => v_draft.write_payload"));
  assert(sql.includes("for update"));
  assert(sql.includes("status = 'adopted'"));
});

Deno.test("la lecture du brouillon porte SON PROPRIÉTAIRE (service_role ignore RLS)", async () => {
  const { calls } = await adoptOnce(await doneRow());
  const read = calls.find((c) => c.op === "select");
  assert(read, "le brouillon doit être relu");
  assert(read.filters.some((f) => f.column === "id" && f.value === DRAFT));
  assert(read.filters.some((f) => f.column === "user_id" && f.value === USER));
});

// ===========================================================================
// 1bis. LE SECOND TAP — le plan existe, on l'ouvre (audit 2026-09-14, R2)
// ===========================================================================

Deno.test(
  "LE SECOND TAP: brouillon déjà adopté et NOMMÉ — 200, le même plan, RIEN d'écrit",
  async () => {
    const { out, calls } = await adoptOnce(
      await doneRow({ status: "adopted", adopted_meal_id: MEAL }),
    );

    assertEquals(out.status, 200);
    assert(out.ok, "un plan déjà écrit n'est pas un échec");
    assertEquals(out.body, {
      ok: true,
      meal: { id: MEAL },
      window: { starts_on: "2026-09-07", duration_days: 1 },
      draft_id: DRAFT,
      request_id: REQUEST,
      already_written: true,
      diagnostics: { gate: "already_written", gate_refusals: 0 },
    });

    // ⛔ LA PROPRIÉTÉ DU LOT: deux taps, un seul plan, une seule écriture.
    assertEquals(
      adoptCalls(calls).length,
      0,
      "le plan existe: aucune transaction d'adoption ne doit repartir",
    );
    assertEquals(
      calls.filter((c) => c.op === "update").length,
      0,
      "rien à remarquer: le brouillon est déjà `adopted`",
    );
    assertEquals(calls.filter((c) => c.op === "rpc").length, 0);
  },
);

Deno.test(
  "LE SECOND TAP d'un aperçu PÉRIMÉ rend quand même le plan — il est écrit",
  async () => {
    // « expiré » se recompose, « déjà écrit » s'ouvre. Un plan actif ne
    // redevient pas introuvable parce que son brouillon a vieilli.
    const { out } = await adoptOnce(
      await doneRow({
        status: "adopted",
        adopted_meal_id: MEAL,
        expires_at: "2026-01-01T00:00:00.000Z",
      }),
    );
    assert(out.ok);
    assertEquals(out.mealId, MEAL);
    assertEquals(out.gate, "already_written");
  },
);

Deno.test(
  "la garde d'aujourd'hui ne rejuge PAS un plan écrit hier",
  async () => {
    // Une allergie déclarée APRÈS l'adoption ferait `draft_stale` sur un
    // brouillon `done`. Sur un plan déjà écrit, la refuser ne le retirerait
    // pas: elle rendrait seulement le plan actif impossible à rouvrir.
    const { out, calls } = await adoptOnce(
      await doneRow({
        status: "adopted",
        adopted_meal_id: MEAL,
        safety_fingerprint: "0".repeat(64),
      }),
    );
    assert(out.ok, "un plan écrit reste ouvrable");
    assertEquals(out.mealId, MEAL);
    assertEquals(adoptCalls(calls).length, 0);
  },
);

// ===========================================================================
// 2. LES SIX REFUS QUI N'ÉCRIVENT JAMAIS
// ===========================================================================

interface RefusalCase {
  readonly name: string;
  readonly token: string;
  readonly status: number;
  readonly row: () => Promise<Record<string, unknown> | null>;
  readonly overrides?: Partial<Parameters<typeof adoptDraft>[0]>;
}

const REFUSALS: readonly RefusalCase[] = [
  {
    name: "aucune ligne (ou pas la sienne)",
    token: "draft_not_found",
    status: 404,
    row: () => Promise.resolve(null),
  },
  {
    name: "la composition n'a pas fini",
    token: "draft_not_ready",
    status: 409,
    row: () => doneRow({ status: "running" }),
  },
  {
    name: "la composition a échoué",
    token: "draft_failed",
    status: 409,
    row: () => doneRow({ status: "failed" }),
  },
  {
    // ⚠️ SANS `adopted_meal_id`. Avec l'identifiant, ce n'est plus un refus:
    // voir « LE SECOND TAP » plus bas. Ici il n'y a rien à ouvrir.
    name: "adopté, mais aucun plan nommé: rien à ouvrir",
    token: "draft_already_adopted",
    status: 409,
    row: () => doneRow({ status: "adopted" }),
  },
  {
    name: "l'aperçu décrit une semaine qu'elle n'a plus",
    token: "draft_expired",
    status: 410,
    row: () => doneRow({ expires_at: "2026-09-06T09:00:00.000Z" }),
  },
  {
    name: "les protections du foyer ont bougé",
    token: "draft_stale",
    status: 409,
    row: () => doneRow({ safety_fingerprint: "0".repeat(64) }),
  },
];

for (const c of REFUSALS) {
  Deno.test(`REFUS ${c.token}: ${c.name} — et RIEN n'est écrit`, async () => {
    const { out, calls } = await adoptOnce(await c.row(), {}, c.overrides ?? {});
    assertEquals(out.ok, false);
    assertEquals(out.status, c.status);
    assertEquals(refusal(out).error, c.token);
    assertEquals(refusal(out).request_id, REQUEST);
    assertEquals(
      adoptCalls(calls).length,
      0,
      `${c.token} ne doit JAMAIS atteindre keel_adopt_meal_draft`,
    );
    assertEquals(calls.filter((call) => call.op === "update").length, 0);
  });
}

Deno.test("un `done` sans payload est `draft_not_ready`, pas une écriture de rien", async () => {
  const { out, calls } = await adoptOnce(await doneRow({ write_payload: null }));
  assertEquals(out.ok, false);
  assertEquals(refusal(out).error, "draft_not_ready");
  assertEquals(adoptCalls(calls).length, 0);
});

// ===========================================================================
// 3. LES DEUX PÉREMPTIONS SE DISTINGUENT — deux réparations différentes
// ===========================================================================

Deno.test("empreinte de sécurité différente ⇒ draft_stale, raison « safety »", async () => {
  const { out } = await adoptOnce(await doneRow({ safety_fingerprint: "deadbeef" }));
  assertEquals(out.ok, false);
  assertEquals(out.status, 409);
  assertEquals(refusal(out).error, "draft_stale");
  const detail = refusal(out).detail as Record<string, unknown>;
  assertEquals(detail.reason, "safety");
});

Deno.test("une allergie déclarée entre-temps périme le brouillon", async () => {
  // Le foyer d'aujourd'hui porte une contrainte de plus que celui d'hier.
  const stale = await safetyFingerprintOf({ lane: "solo", ownerConstraints: [] });
  const { out, calls } = await adoptOnce(await doneRow({ safety_fingerprint: stale }));
  assertEquals(out.ok, false);
  assertEquals((refusal(out).detail as Record<string, unknown>).reason, "safety");
  assertEquals(adoptCalls(calls).length, 0, "le payload d'hier ne s'écrit pas");
});

// ── LA PROVENANCE NE PÉRIME RIEN, LE CONTRAT OUI ──────────────────────────
//
// Mesuré le 2026-09-07: `HOUSEHOLD_PROMPT_VERSION` est passée de v31 à v32 en
// une soirée. Une péremption calée sur la version de PROMPT aurait rendu
// `draft_stale` tout aperçu composé avant le déploiement — la personne relit
// son plan, clique « adopter », et se fait refuser pour une raison qui ne
// parle pas de son plan. Pendant une itération de prompt, ce serait le cas
// nominal. Un plan composé est un objet FINI.

Deno.test("UN BUMP DE PROMPT NE PÉRIME PAS UN BROUILLON: il s'adopte", async () => {
  const { out, calls } = await adoptOnce(
    await doneRow({ source_version: sourceVersionOf("v30") }),
  );
  assertEquals(out.ok, true, "un plan déjà composé reste valide");
  assertEquals(adoptCalls(calls).length, 1, "et il s'écrit tel quel");
});

Deno.test("contrat de rangement différent ⇒ draft_stale, raison « source »", async () => {
  // Ce qui périme, c'est la FORME du payload rangé et ce que ses lecteurs
  // savent en faire — pas ce qui l'a composé.
  const { out, calls } = await adoptOnce(
    await doneRow({ source_version: "v31|draft_store.v0" }),
  );
  assertEquals(out.ok, false);
  assertEquals(refusal(out).error, "draft_stale");
  const detail = refusal(out).detail as Record<string, unknown>;
  assertEquals(detail.reason, "source");
  assertEquals(detail.stored, "draft_store.v0");
  assertEquals(detail.live, DRAFT_CONTRACT_VERSION);
  assertEquals(adoptCalls(calls).length, 0);
});

Deno.test("une `source_version` illisible REFUSE, elle ne passe pas", async () => {
  // Le repli sûr est de refuser une ligne qu'on ne sait pas lire.
  const { out, calls } = await adoptOnce(await doneRow({ source_version: "" }));
  assertEquals(out.ok, false);
  assertEquals(refusal(out).error, "draft_stale");
  assertEquals(adoptCalls(calls).length, 0);
});

Deno.test("LA SÉCURITÉ SE MESURE AVANT LA SOURCE: les deux périmées disent « safety »", async () => {
  // Sinon on enverrait recomposer « parce que le code a changé » quelqu'un dont
  // l'enfant vient d'être déclaré allergique — le motif le moins grave gagnerait.
  const { out } = await adoptOnce(
    await doneRow({ safety_fingerprint: "deadbeef", source_version: "v31|draft_store.v0" }),
  );
  assertEquals((refusal(out).detail as Record<string, unknown>).reason, "safety");
});

// ===========================================================================
// 4. LA GARDE — fermée: absence, incomplétude ou refus n'écrivent rien
// ===========================================================================

Deno.test("contexte gelé absent ⇒ plan_gate_refused et zéro écriture", async () => {
  const { out, calls, logs } = await adoptOnce(await doneRow({ adoption_context: null }));
  assertEquals(out.ok, false);
  assertEquals(out.status, 409);
  assertEquals(refusal(out).error, "plan_gate_refused");
  assertEquals(out.gate, "context_unavailable");
  assertEquals(adoptCalls(calls).length, 0);
  assert(logs.some((l) => l.includes('"reason":"context_unavailable"')));
});

Deno.test("⛔ une garde SAUTÉE refuse toutes les formes incomplètes", async () => {
  for (const context of [null, undefined, 42, "oups", {}, { gate: { lane: "solo" } }]) {
    const { out, calls } = await adoptOnce(await doneRow({ adoption_context: context }));
    assertEquals(out.ok, false, `contexte accepté: ${JSON.stringify(context)}`);
    assertEquals(refusal(out).error, "plan_gate_refused");
    assertEquals(out.gate, "context_unavailable");
    assertEquals(adoptCalls(calls).length, 0);
  }
});

Deno.test("un contexte gelé COMPLET fait tourner la garde: le verdict est `ok`, pas `context_unavailable`", async () => {
  // LE CAS QUI PASSE de la lecture défensive: sans lui, `context_unavailable`
  // partout ressemblerait à une lecture qui marche.
  const { out, logs } = await adoptOnce(await doneRow());
  assert(out.ok);
  assertEquals(out.gate, "ok");
  assertEquals(out.gateRefusals, 0);
  assert(logs.some((l) => l.includes('"gate":"ok"')));
});

Deno.test("⛔ LES DÉNOMINATEURS DE LA FIXTURE SONT POSITIFS: zéro refus ≠ rien évalué", () => {
  // La cicatrice n° 1 du dépôt: une cause à zéro dont le dénominateur est à
  // zéro ne veut pas dire « propre », elle veut dire « jamais évaluée ». Sans
  // ce test, le cas nominal pourrait passer sur un plan que la garde traverse
  // sans rien regarder, et `gate: "ok"` ne prouverait rien.
  const gate = finalPlanGate(
    WRITE_PAYLOAD as unknown as GatePlan,
    { ...(GATE_CONTEXT as unknown as GateContext), policy: FINAL_GATE_POLICY_LOT_4 },
  );
  assertEquals(gate.refusals.length, 0, "la fixture ne doit produire aucun refus");
  assert(gate.counters.checked.cells > 0, "des cases ont été regardées");
  assert(gate.counters.checked.mouth_cells > 0, "des couples (bouche, case) aussi");
  assert(gate.counters.checked.ingredient_terms > 0, "des ingrédients aussi");
  assert(gate.counters.checked.shopping_lines > 0, "des lignes de courses aussi");
  assert(gate.counters.checked.table_dishes > 0, "des plats de table aussi");
});

Deno.test("la garde tourne aussi quand le contexte est écrit À LA RACINE (forme de la sonde SQL)", async () => {
  const { out } = await adoptOnce(
    await doneRow({ adoption_context: { ...GATE_CONTEXT, postWrite: POST_WRITE } }),
  );
  assert(out.ok);
  assertEquals(out.gate, "ok");
  assertEquals(out.postWrite.available, true);
});

Deno.test("sans bloc postWrite, la couture le DIT (`available:false`) au lieu de se taire", async () => {
  const { out } = await adoptOnce(
    await doneRow({ adoption_context: { gate: GATE_CONTEXT } }),
  );
  assert(out.ok);
  assertEquals(out.postWrite.available, false);
  assertEquals(out.postWrite.draftNote, null);
});

Deno.test("LOT_4: un plan fautif est refusé avant la transaction d'adoption", async () => {
  const broken = {
    dishes: [{
      title: "Rien",
      day: "tue",
      slot: "lunch",
      ingredients: [{ term: "cabillaud", group: null }],
      uses: [{ preparation_id: "p-inconnue" }],
      boxes: [],
    }],
    preparations: [],
    cooking_sessions: [{ day: "mon", preparation_ids: ["p-fantome"] }],
    shopping_list: [],
  };
  const { out, calls } = await adoptOnce(
    await doneRow({ write_payload: broken }),
  );
  assertEquals(out.ok, false);
  assertEquals(refusal(out).error, "plan_gate_refused");
  assertEquals(out.gate, "refused");
  assert(out.gateRefusals > 0);
  assertEquals(adoptCalls(calls).length, 0);
});

// ===========================================================================
// 5. LA BASE REFUSE L'ÉCRITURE
// ===========================================================================

Deno.test("REFUS plan_not_written: l'erreur de la RPC passe telle quelle, rien n'est adopté", async () => {
  const { out, calls } = await adoptOnce(await doneRow(), {
    rpc: [{ data: null, error: { message: "window_overlaps_live_plan" } }],
  });
  assertEquals(out.ok, false);
  assertEquals(out.status, 409);
  assertEquals(refusal(out).error, "plan_not_written");
  assertEquals(refusal(out).detail, "window_overlaps_live_plan");
  assertEquals(adoptCalls(calls).length, 1, "la RPC atomique a bien été tentée");
  assertEquals(calls.filter((call) => call.op === "update").length, 0);
});

Deno.test("une RPC qui ne nomme aucun plan refuse au lieu de marquer un brouillon sans ligne", async () => {
  const { out, calls } = await adoptOnce(await doneRow(), {
    rpc: [{ data: [], error: null }],
  });
  assertEquals(out.ok, false);
  assertEquals(refusal(out).error, "plan_not_written");
  assertEquals(adoptCalls(calls).length, 1);
});

Deno.test("la RPC atomique peut rejouer la même adoption sans seconde écriture", async () => {
  const { out, calls, logs } = await adoptOnce(await doneRow(), {
    rpc: [{
      data: { ok: true, meal_id: MEAL, retired_plan_id: null, replayed: true },
      error: null,
    }],
  });
  assert(out.ok);
  assertEquals(out.mealId, MEAL);
  assertEquals(adoptCalls(calls).length, 1);
  assert(logs.some((l) => l.includes('"atomic":true')));
});

// ===========================================================================
// 6. AUCUN APPEL MODÈLE — l'épingle qui empêche la seconde génération
// ===========================================================================

Deno.test("⛔ AUCUN APPEL AU MODÈLE dans ce module (le 504 à 150 008 ms venait de là)", async () => {
  const src = await Deno.readTextFile(new URL("./draft_adopt.ts", import.meta.url));
  for (const symbol of ["generateWithGemini", "keelGenerationModel", "callModel"]) {
    assert(
      !src.includes(symbol),
      `« ${symbol} » réintroduirait la seconde génération: aperçu 6 boîtes / base ` +
        `0 boîte, et deux appels dans une requête dépassent le plafond de 150 s`,
    );
  }
  // LE CAS QUI PASSE de cette épingle: sans lui, un chemin de fichier faux
  // rendrait une chaîne vide, et « aucun symbole trouvé » serait vrai de rien.
  assert(src.includes("export async function adoptDraft"), "c'est bien le module lu");
});

Deno.test("le module n'importe aucun générateur ni aucune porte de modèle", async () => {
  const src = await Deno.readTextFile(new URL("./draft_adopt.ts", import.meta.url));
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  assert(imports.length > 0, "le module importe quelque chose");
  for (const spec of imports) {
    assert(
      !/model|gemini|generate-/i.test(spec),
      `import suspect: ${spec}`,
    );
  }
});

// ===========================================================================
// 7. LE CHEMIN DE DÉCISION EST DÉTERMINISTE
// ===========================================================================

Deno.test("mêmes entrées deux fois ⇒ MÊME objet de sortie (aucune horloge dans la décision)", async () => {
  const row = await doneRow();
  const first = await adoptOnce(row);
  const second = await adoptOnce(row);
  assertEquals(first.out, second.out);
});

Deno.test("un refus est déterministe lui aussi", async () => {
  const row = await doneRow({ status: "failed" });
  const first = await adoptOnce(row);
  const second = await adoptOnce(row);
  assertEquals(first.out, second.out);
});

Deno.test("le temps mur ne quitte JAMAIS le journal pour la sortie", async () => {
  const { out, logs } = await adoptOnce(await doneRow());
  assert(logs.some((l) => l.includes('"wall_ms"')), "il est journalisé");
  assert(
    !JSON.stringify(out).includes("wall_ms"),
    "et il n'entre pas dans la sortie — sinon deux appels identiques différeraient",
  );
});

Deno.test("un nowIso illisible LÈVE au lieu d'inventer une horloge", async () => {
  const { admin } = fakeAdmin({ select: [{ data: null, error: null }] });
  let threw = false;
  try {
    await run(admin, { nowIso: "pas une date" });
  } catch (error) {
    threw = true;
    assert(String(error).includes("nowIso"), "l'erreur nomme le paramètre");
  }
  assert(threw, "retomber sur new Date() remettrait une horloge dans un module rejouable");
});

Deno.test("la ligne de journal porte la lane, et elle est nommée par la lane appelante", async () => {
  const { logs } = await adoptOnce(await doneRow(), {}, { lane: "household_meal" });
  assert(
    logs.some((l) => l.includes('"tag":"keel.household_meal.adopt"')),
    "keel.<lane>.adopt",
  );
});
