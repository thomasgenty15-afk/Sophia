// LE MAGASIN DES BROUILLONS — ce que ces tests empêchent de revenir.
//
//   1. QUE L'APERÇU ET LA LIGNE ÉCRITE SOIENT DEUX PLANS. Mesuré: aperçu
//      6 boîtes, base 0 boîte, HTTP 200. L'empreinte de demande est ce qui
//      permet de rendre le MÊME brouillon au second tap au lieu de relancer un
//      appel modèle — donc de composer deux fois.
//   2. QUE LA CLÉ CHANGE POUR RIEN. `launch`, `adopting_draft` et `replaces`
//      décrivent le GESTE; s'ils entraient dans l'empreinte, adopter ferait une
//      clé neuve, donc une seconde composition — le défaut d'origine.
//   3. QU'UNE LECTURE OUBLIE SON PROPRIÉTAIRE. Le client est en `service_role`:
//      RLS ne le contraint pas (cicatrice `rls-is-not-a-substitute-for-eq-user-id`).
//   4. QU'UN REFUS D'ADOPTION SOIT MUET OU MAL NOMMÉ. Cinq motifs, fermés, et
//      LE CAS QUI PASSE — une garde qui bloque tout ressemble à une garde qui
//      marche.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";

import {
  adoptability,
  completeDraft,
  DRAFT_STORE_VERSION,
  draftIdempotencyKey,
  failDraft,
  loadDraftForAdoption,
  markAdopted,
  markRunning,
  openDraft,
  sourceVersionOf,
  STUDENT_MEAL_DRAFTS_TABLE,
} from "./draft_store.ts";

const USER = "44cb7e24-6f82-4ae1-8611-2783f65d889a";
const OTHER = "9b2a1c50-2f5f-4a8a-9c3a-b1b0f6a2d111";
const DRAFT = "0f9d5f4e-7a1b-4c2d-8e3f-1a2b3c4d5e6f";
const MEAL = "5c1e2a3b-4d5e-4f60-9a8b-7c6d5e4f3a2b";

// ===========================================================================
// LE FAUX CLIENT — il enregistre TOUT, y compris les filtres
// ===========================================================================

interface Scripted {
  readonly data: unknown;
  readonly error: unknown;
}

interface RecordedCall {
  table: string;
  op: "insert" | "update" | "select";
  payload: Record<string, unknown> | null;
  columns: string | null;
  single: boolean;
  filters: { fn: string; column: string; value: unknown }[];
}

interface Script {
  insert?: Scripted[];
  update?: Scripted[];
  select?: Scripted[];
}

function fakeAdmin(script: Script = {}) {
  const calls: RecordedCall[] = [];
  const queue: Record<"insert" | "update" | "select", Scripted[]> = {
    insert: [...(script.insert ?? [])],
    update: [...(script.update ?? [])],
    select: [...(script.select ?? [])],
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

  const open = (table: string, op: RecordedCall["op"], payload: Record<string, unknown> | null) => {
    const call: RecordedCall = { table, op, payload, columns: null, single: false, filters: [] };
    calls.push(call);
    return build(call);
  };

  const admin = {
    from(table: string) {
      return {
        insert: (row: Record<string, unknown>) => open(table, "insert", row),
        update: (patch: Record<string, unknown>) => open(table, "update", patch),
        select: (columns: string) => {
          const query = open(table, "select", null);
          return query.select(columns);
        },
      };
    },
  };

  // `as never`: le paramètre est un vrai `SupabaseClient` (voir la note du
  // module — un type structurel maison rend `TS2589` au point d'appel réel).
  return { admin: admin as never, calls };
}

const hasEq = (call: RecordedCall, column: string, value?: unknown): boolean =>
  call.filters.some((f) =>
    f.fn === "eq" && f.column === column && (value === undefined || f.value === value)
  );

// ===========================================================================
// 1. L'EMPREINTE DE LA DEMANDE
// ===========================================================================

Deno.test("l'empreinte ne bouge NI sur l'ordre des clés NI sur les espaces", async () => {
  const a = JSON.parse('{"days":3,"context":"mariage mardi","members":[{"id":"a","n":1}]}');
  const b = JSON.parse(
    '{\n  "members" : [ { "n" : 1 , "id" : "a" } ] ,\n  "context":"mariage mardi",\n  "days":3\n}',
  );
  assertEquals(await draftIdempotencyKey(USER, a), await draftIdempotencyKey(USER, b));
});

Deno.test("⛔ LES TROIS CLÉS DU GESTE NE COMPTENT PAS — sinon adopter recompose", async () => {
  const plain = { days: 3, context: "mariage mardi" };
  const withGesture = {
    days: 3,
    context: "mariage mardi",
    launch: "async",
    adopting_draft: true,
    replaces: "8f1c2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
  };
  assertEquals(
    await draftIdempotencyKey(USER, plain),
    await draftIdempotencyKey(USER, withGesture),
    "adopter ferait une clé neuve, donc un SECOND appel modèle",
  );
});

Deno.test("les clés du geste sont ignorées À TOUTE PROFONDEUR", async () => {
  const flat = { request: { days: 3 } };
  const nested = { request: { days: 3, adopting_draft: true, launch: "sync" } };
  assertEquals(await draftIdempotencyKey(USER, flat), await draftIdempotencyKey(USER, nested));
});

Deno.test("une note différente est une demande différente", async () => {
  const one = { days: 3, context: "mariage mardi" };
  const two = { days: 3, context: "mariage mercredi" };
  assertNotEquals(await draftIdempotencyKey(USER, one), await draftIdempotencyKey(USER, two));
});

Deno.test("deux personnes ne partagent pas une clé sur la même demande", async () => {
  const body = { days: 3 };
  assertNotEquals(await draftIdempotencyKey(USER, body), await draftIdempotencyKey(OTHER, body));
});

Deno.test("l'empreinte est un sha256 hexadécimal", async () => {
  const key = await draftIdempotencyKey(USER, { days: 1 });
  assertEquals(key.length, 64);
  assert(/^[0-9a-f]{64}$/.test(key), key);
});

// ===========================================================================
// 2. LE MILLÉSIME
// ===========================================================================

Deno.test("`sourceVersionOf` porte les DEUX versions", () => {
  assertEquals(sourceVersionOf("v31"), `v31|${DRAFT_STORE_VERSION}`);
  // Une version vide ne se tait pas: elle se NOMME.
  assertEquals(sourceVersionOf("  "), `unknown|${DRAFT_STORE_VERSION}`);
});

// ===========================================================================
// 3. `adoptability` — LES CINQ REFUS ET LE CAS QUI PASSE
// ===========================================================================

const NOW = "2026-09-06T12:00:00.000Z";
const LATER = "2026-09-07T12:00:00.000Z";
const done = (over: Record<string, unknown> = {}) => ({
  id: DRAFT,
  status: "done",
  expires_at: LATER,
  write_payload: { dishes: [{ title: "probe" }] },
  response: { dishes: [{ title: "probe" }] },
  ...over,
});

Deno.test("LE CAS QUI PASSE: un brouillon prêt et frais s'adopte", () => {
  assertEquals(adoptability(done(), NOW), { ok: true });
});

Deno.test("aucune ligne: `draft_not_found`", () => {
  assertEquals(adoptability(null, NOW), { ok: false, refusal: "draft_not_found" });
  assertEquals(adoptability(undefined, NOW), { ok: false, refusal: "draft_not_found" });
});

Deno.test("une composition en vol: `draft_not_ready`", () => {
  for (const status of ["pending", "running"]) {
    assertEquals(adoptability(done({ status }), NOW), {
      ok: false,
      refusal: "draft_not_ready",
    });
  }
});

Deno.test("une composition ratée: `draft_failed`", () => {
  assertEquals(adoptability(done({ status: "failed" }), NOW), {
    ok: false,
    refusal: "draft_failed",
  });
});

Deno.test("un aperçu périmé: `draft_expired`", () => {
  assertEquals(adoptability(done({ expires_at: "2026-09-06T11:59:59.000Z" }), NOW), {
    ok: false,
    refusal: "draft_expired",
  });
});

Deno.test("⛔ DÉJÀ ADOPTÉ GAGNE SUR PÉRIMÉ — les deux réparations sont opposées", () => {
  // « trop tard » s'ouvre; « expiré » se recompose. Dire le second enverrait la
  // personne payer un appel modèle pour un plan qu'elle a déjà.
  assertEquals(
    adoptability(done({ status: "adopted", expires_at: "2026-01-01T00:00:00.000Z" }), NOW),
    { ok: false, refusal: "draft_already_adopted" },
  );
});

Deno.test("un `done` sans payload n'a RIEN à écrire: `draft_not_ready`", () => {
  assertEquals(adoptability(done({ write_payload: null }), NOW), {
    ok: false,
    refusal: "draft_not_ready",
  });
});

Deno.test("une date illisible ne périme pas — c'est un défaut de lecture", () => {
  assertEquals(adoptability(done({ expires_at: "pas une date" }), NOW), { ok: true });
});

// ===========================================================================
// 4. `openDraft`
// ===========================================================================

const openArgs = {
  userId: USER,
  householdId: "6d5c4b3a-2f1e-4a09-8b7c-6d5e4f3a2b1c",
  lane: "household_meal" as const,
  planKind: "household" as const,
  requestId: "req-1",
  body: { days: 3, context: "mariage mardi" },
  mode: "sync" as const,
  promptVersion: "v31",
  now: new Date("2026-09-06T12:00:00.000Z"),
};

Deno.test("une demande neuve ouvre une ligne `pending` qui porte la clé", async () => {
  const { admin, calls } = fakeAdmin({ insert: [{ data: { id: DRAFT }, error: null }] });
  const out = await openDraft(admin, openArgs);
  assertEquals(out, { id: DRAFT, reused: false });

  const insert = calls.find((c) => c.op === "insert")!;
  assertEquals(insert.table, STUDENT_MEAL_DRAFTS_TABLE);
  assertEquals(insert.payload!.user_id, USER);
  assertEquals(insert.payload!.status, "pending");
  assertEquals(insert.payload!.lane, "household_meal");
  assertEquals(insert.payload!.plan_kind, "household");
  assertEquals(insert.payload!.mode, "sync");
  assertEquals(insert.payload!.source_version, `v31|${DRAFT_STORE_VERSION}`);
  assertEquals(
    insert.payload!.idempotency_key,
    await draftIdempotencyKey(USER, openArgs.body),
  );
});

Deno.test("⛔ LE BALAYAGE PRÉCÈDE L'INSERTION, et il est SCOPÉ à la personne", async () => {
  // Sans lui, une composition tuée par un runtime edge éteint garde la place de
  // l'index unique et la personne ne peut PLUS RIEN composer.
  const { admin, calls } = fakeAdmin({ insert: [{ data: { id: DRAFT }, error: null }] });
  await openDraft(admin, openArgs);

  const sweep = calls[0];
  assertEquals(sweep.op, "update");
  assertEquals(sweep.payload!.status, "failed");
  assertEquals(sweep.payload!.error_code, "timed_out");
  assert(hasEq(sweep, "user_id", USER), "le balayage a touché les lignes d'autres personnes");
  const statuses = sweep.filters.find((f) => f.fn === "in" && f.column === "status");
  assertEquals(statuses?.value, ["pending", "running"]);
  const cutoff = sweep.filters.find((f) => f.fn === "lt" && f.column === "created_at");
  assertEquals(cutoff?.value, "2026-09-06T11:53:00.000Z");
});

Deno.test("MÊME demande déjà en vol: on RÉUTILISE, on ne relance rien", async () => {
  const key = await draftIdempotencyKey(USER, openArgs.body);
  const { admin, calls } = fakeAdmin({
    insert: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
    select: [{ data: { id: DRAFT, idempotency_key: key, status: "running" }, error: null }],
  });
  const out = await openDraft(admin, openArgs);
  assertEquals(out, { id: DRAFT, reused: true });

  const read = calls.find((c) => c.op === "select")!;
  assert(hasEq(read, "user_id", USER), "la relecture a lu la ligne en vol d'un autre");
});

Deno.test("une AUTRE demande en vol est un conflit — jamais un remplacement muet", async () => {
  const { admin } = fakeAdmin({
    insert: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
    select: [{ data: { id: DRAFT, idempotency_key: "une-autre-cle", status: "running" }, error: null }],
  });
  assertEquals(await openDraft(admin, openArgs), { conflict: { draftId: DRAFT } });
});

Deno.test("⛔ UNE PANNE D'INSERTION LÈVE — elle ne rend pas une lane sans magasin", async () => {
  const { admin } = fakeAdmin({
    insert: [{ data: null, error: { code: "XX000", message: "boom" } }],
  });
  let raised = false;
  try {
    await openDraft(admin, openArgs);
  } catch (err) {
    raised = true;
    assert(String(err).includes("boom"));
  }
  assert(raised, "la composition serait partie sans que l'aperçu soit jamais persisté");
});

Deno.test("une insertion sans identifiant rendu lève aussi", async () => {
  const { admin } = fakeAdmin({ insert: [{ data: null, error: null }] });
  let raised = false;
  try {
    await openDraft(admin, openArgs);
  } catch {
    raised = true;
  }
  assert(raised);
});

// ===========================================================================
// 5. LES TRANSITIONS
// ===========================================================================

Deno.test("`markRunning` pose `started_at` — c'est ce que la balayeuse regarde", async () => {
  const { admin, calls } = fakeAdmin();
  const out = await markRunning(admin, DRAFT, new Date("2026-09-06T12:00:00.000Z"));
  assertEquals(out.ok, true);
  assertEquals(calls[0].payload!.status, "running");
  assertEquals(calls[0].payload!.started_at, "2026-09-06T12:00:00.000Z");
  assert(hasEq(calls[0], "id", DRAFT));
});

Deno.test("`completeDraft` écrit l'APERÇU ET le payload exact, avec le contexte de garde", async () => {
  const { admin, calls } = fakeAdmin();
  const out = await completeDraft(admin, DRAFT, {
    response: { dishes: [{ title: "probe" }] },
    writePayload: { plan_kind: "household", dishes: [{ title: "probe" }] },
    adoptionContext: { lane: "household", windowDays: ["mon", "tue"] },
    safetyFingerprint: "deadbeef",
    startsOn: "2026-09-07",
    durationDays: 3,
    leadDays: 1,
    wallMs: 42000,
    now: new Date("2026-09-06T12:03:00.000Z"),
  });
  assertEquals(out.ok, true);
  const patch = calls[0].payload!;
  assertEquals(patch.status, "done");
  assertEquals(patch.write_payload, { plan_kind: "household", dishes: [{ title: "probe" }] });
  assertEquals(patch.response, { dishes: [{ title: "probe" }] });
  assertEquals(patch.adoption_context, { lane: "household", windowDays: ["mon", "tue"] });
  assertEquals(patch.safety_fingerprint, "deadbeef");
  assertEquals(patch.starts_on, "2026-09-07");
  assertEquals(patch.duration_days, 3);
  assertEquals(patch.lead_days, 1);
  assertEquals(patch.wall_ms, 42000);
  assertEquals(patch.finished_at, "2026-09-06T12:03:00.000Z");
});

Deno.test("⛔ UN ÉCHEC DE PERSISTANCE NE LÈVE PAS, ET NE SE LIT PAS « ÉCRIT »", async () => {
  // L'aperçu doit partir à l'écran; ce qui se perd est l'ADOPTION, et
  // `adoptability` le dira. Un `ok:true` ici ferait croire à un brouillon
  // adoptable qui n'existe pas.
  const { admin } = fakeAdmin({ update: [{ data: null, error: { message: "boom" } }] });
  const out = await completeDraft(admin, DRAFT, { response: {}, writePayload: {} });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "boom");
});

Deno.test("`failDraft` NOMME le motif", async () => {
  const { admin, calls } = fakeAdmin();
  await failDraft(admin, DRAFT, { errorCode: "model_timeout", error: "4 min", wallMs: 240000 });
  assertEquals(calls[0].payload!.status, "failed");
  assertEquals(calls[0].payload!.error_code, "model_timeout");
  assertEquals(calls[0].payload!.error, "4 min");
});

Deno.test("`markAdopted` relie le brouillon à la ligne écrite", async () => {
  const { admin, calls } = fakeAdmin();
  await markAdopted(admin, DRAFT, MEAL, new Date("2026-09-06T12:10:00.000Z"));
  assertEquals(calls[0].payload!.status, "adopted");
  assertEquals(calls[0].payload!.adopted_meal_id, MEAL);
  assertEquals(calls[0].payload!.adopted_at, "2026-09-06T12:10:00.000Z");
});

// ===========================================================================
// 6. ⛔ LA CICATRICE: AUCUNE LECTURE SANS SON PROPRIÉTAIRE
// ===========================================================================

Deno.test("`loadDraftForAdoption` charge par identifiant ET par propriétaire", async () => {
  const { admin, calls } = fakeAdmin({ select: [{ data: done(), error: null }] });
  const row = await loadDraftForAdoption(admin, { draftId: DRAFT, userId: USER });
  assert(row);
  const read = calls[0];
  assert(hasEq(read, "id", DRAFT));
  assert(hasEq(read, "user_id", USER), "le brouillon d'un autre aurait été adopté");
  assertEquals(read.single, true);
});

Deno.test("sans propriétaire, on ne lit RIEN — pas même une requête", async () => {
  const { admin, calls } = fakeAdmin({ select: [{ data: done(), error: null }] });
  assertEquals(await loadDraftForAdoption(admin, { draftId: DRAFT, userId: "  " }), null);
  assertEquals(calls.length, 0);
});

Deno.test("une lecture en panne rend `null`, et `adoptability` dira `draft_not_found`", async () => {
  const { admin } = fakeAdmin({ select: [{ data: null, error: { message: "boom" } }] });
  const row = await loadDraftForAdoption(admin, { draftId: DRAFT, userId: USER });
  assertEquals(row, null);
  assertEquals(adoptability(row, NOW), { ok: false, refusal: "draft_not_found" });
});

Deno.test("⛔ TOUTE LECTURE DU MODULE PORTE `user_id` — le balayage aussi", async () => {
  const key = await draftIdempotencyKey(USER, openArgs.body);
  const { admin, calls } = fakeAdmin({
    insert: [{ data: null, error: { code: "23505", message: "duplicate key" } }],
    select: [{ data: { id: DRAFT, idempotency_key: key, status: "running" }, error: null }],
  });
  await openDraft(admin, openArgs);
  await loadDraftForAdoption(admin, { draftId: DRAFT, userId: USER });

  const scoped = calls.filter((c) => c.op === "select" || c.payload?.error_code === "timed_out");
  assert(scoped.length >= 3, `attendu au moins 3 accès scopés, vu ${scoped.length}`);
  for (const call of scoped) {
    assert(
      hasEq(call, "user_id", USER),
      `un accès sans propriétaire: ${call.op} ${JSON.stringify(call.filters)}`,
    );
  }
});
