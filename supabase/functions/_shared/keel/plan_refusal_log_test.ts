// LOT R — le journal des refus : ce qu'il écrit, ce qu'il refuse d'écrire, et
// le fait qu'il ne lève jamais.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  isPlanRefusal,
  KEEL_PLAN_REFUSALS_TABLE,
  readRefusalBody,
  recordPlanRefusal,
} from "./plan_refusal_log.ts";

function fakeAdmin(reply: { error: { message: string } | null } = { error: null }) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
  const admin = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return Promise.resolve(reply);
      },
    }),
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, inserts };
}

const WHO = { userId: "u-1", householdId: "h-1", intent: "draft", attempt: 1 };

Deno.test("isPlanRefusal — 422 et 502 toujours ; le reste seulement après l'acceptation", () => {
  assertEquals(isPlanRefusal(422, false), true);
  assertEquals(isPlanRefusal(502, false), true);
  assertEquals(isPlanRefusal(409, false), false, "un 409 d'admission n'est pas un refus de plan");
  assertEquals(isPlanRefusal(402, false), false);
  assertEquals(isPlanRefusal(409, true), true, "après le 202, tout ce qui échoue est la composition");
  assertEquals(isPlanRefusal(200, true), false);
});

Deno.test("readRefusalBody — lit sans confiance, et nomme `compose_failed` un corps muet", () => {
  assertEquals(readRefusalBody(null).token, "compose_failed");
  const read = readRefusalBody({
    error: " plan_not_deliverable ",
    detail: ["output_lock:2"],
    refusals: [{ cause: "unfed_member" }],
    unevaluated: "pas une liste",
  });
  assertEquals(read.token, "plan_not_deliverable");
  assertEquals(read.detail, '["output_lock:2"]');
  assertEquals(read.refusals.length, 1);
  assertEquals(read.unevaluated, []);
});

Deno.test("recordPlanRefusal — le contexte interne prime sur le corps public", async () => {
  const { admin, inserts } = fakeAdmin();
  const ok = await recordPlanRefusal(admin, {
    who: WHO,
    requestId: "req-1",
    draftId: "d-1",
    mode: "async",
    status: 422,
    body: { error: "plan_not_deliverable", refusals: [{ cause: "energy_floor", detail: null }] },
    context: {
      token: null,
      startsOn: "2026-09-21",
      durationDays: 5,
      refusals: [{ cause: "energy_floor", detail: "1 240 kcal < 1 500" }],
      unevaluated: [],
      incomplete: [],
      verdict: { state: "refused" },
      plan: { dishes: [{ title: "x" }], preparations: [], cooking_sessions: [] },
      rounds: 3,
      callsMade: 3,
      promptVersion: "v33",
      generationModel: "gpt-6-luna",
    },
    wallMs: 209_000,
    attempt: 1,
  });
  assertEquals(ok, true);
  assertEquals(inserts.length, 1);
  assertEquals(inserts[0].table, KEEL_PLAN_REFUSALS_TABLE);
  const row = inserts[0].row;
  assertEquals(row.user_id, "u-1");
  assertEquals(row.token, "plan_not_deliverable");
  // Le détail masqué à l'écran est GARDÉ ici.
  assertEquals((row.refusals as Array<{ detail: unknown }>)[0].detail, "1 240 kcal < 1 500");
  assertEquals(row.rounds, 3);
  assertEquals(row.starts_on, "2026-09-21");
  assert(row.plan !== null, "le candidat refusé est consigné");
});

Deno.test("recordPlanRefusal — sans contexte, le corps public suffit à nommer le refus", async () => {
  const { admin, inserts } = fakeAdmin();
  await recordPlanRefusal(admin, {
    who: WHO,
    requestId: "req-2",
    draftId: null,
    mode: "sync",
    status: 422,
    body: { error: "house_rule_violated", detail: "porc pour une bouche halal" },
    context: null,
    wallMs: 80_000,
    attempt: null,
  });
  assertEquals(inserts[0].row.token, "house_rule_violated");
  assertEquals(inserts[0].row.detail, "porc pour une bouche halal");
  assertEquals(inserts[0].row.plan, null);
});

Deno.test("recordPlanRefusal — sans propriétaire, rien n'est écrit (ni exporté, ni purgé)", async () => {
  const { admin, inserts } = fakeAdmin();
  const ok = await recordPlanRefusal(admin, {
    who: null,
    requestId: "req-3",
    draftId: null,
    mode: "sync",
    status: 422,
    body: { error: "empty_meal" },
    context: null,
    wallMs: null,
    attempt: null,
  });
  assertEquals(ok, false);
  assertEquals(inserts.length, 0);
});

Deno.test("recordPlanRefusal — une insertion qui échoue ne lève pas", async () => {
  const { admin } = fakeAdmin({ error: { message: "relation does not exist" } });
  const ok = await recordPlanRefusal(admin, {
    who: WHO,
    requestId: "req-4",
    draftId: null,
    mode: "sync",
    status: 502,
    body: { error: "meal_unparseable" },
    context: null,
    wallMs: null,
    attempt: null,
  });
  assertEquals(ok, false);
});

Deno.test("recordPlanRefusal — un plan LIVRÉ avec écarts est journalisé sous son propre jeton, HTTP 200", async () => {
  const { admin, inserts } = fakeAdmin();
  await recordPlanRefusal(admin, {
    who: WHO,
    requestId: "req-5",
    draftId: "d-5",
    mode: "async",
    status: 200,
    body: { ok: true, draft: true },
    context: {
      token: "deliverable_with_gaps",
      startsOn: "2026-09-16",
      durationDays: 6,
      refusals: [{ cause: "cell_energy_off", day: "wed", slot: "snack_pm", detail: "+62 % contre 455 kcal visées" }],
      unevaluated: [],
      incomplete: [],
      verdict: { state: "livrable_avec_ecarts" },
      plan: { dishes: [], preparations: [], cooking_sessions: [] },
      rounds: 2,
      callsMade: 1,
      promptVersion: "v33",
      generationModel: "gpt-6-luna",
    },
    wallMs: 128_400,
    attempt: 1,
  });
  assertEquals(inserts[0].row.token, "deliverable_with_gaps");
  assertEquals(inserts[0].row.http_status, 200);
  assertEquals((inserts[0].row.refusals as Array<{ detail: string }>)[0].detail, "+62 % contre 455 kcal visées");
});
