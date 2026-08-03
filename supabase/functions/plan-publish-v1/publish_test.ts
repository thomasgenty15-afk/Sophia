/**
 * KEEL W6.2 — publication tests.
 *
 * Like the W4.2 re-seed tests, these are ORDERING tests. The failure modes this
 * lot exists to prevent are:
 *   - hitting `plan_versions_one_published_per_student_idx` instead of
 *     sequencing around it;
 *   - leaving a student with a superseded plan and nothing published when the
 *     second write fails;
 *   - publishing without calling `reseedOnPublish`, which is the phantom-commit
 *     class (a withdrawn line still reminded and still graded);
 *   - a paraphrased `student_instruction`.
 * None of those are arithmetic. All of them are visible in a call log.
 */
import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import type { DbRow, PublishPorts } from "./ports.ts";
import {
  APPROVAL_SURFACE_PREFIX,
  publishPlan,
  PublishValidationError,
  PUBLISH_SURFACE,
  type PublishRequest,
} from "./publish.ts";
import { applyDiff, buildCommitmentRow } from "./commitments.ts";

const COACH = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_COACH = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const STUDENT = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OLD_VERSION = "11111111-1111-1111-1111-111111111111";
const NEW_VERSION = "22222222-2222-2222-2222-222222222222";

const NOW = new Date("2026-07-27T09:00:00.000Z");

function approval(section = "supplements"): { section: string; approved_at: string } {
  return { section, approved_at: "2026-07-27T08:59:00.000Z" };
}

function commitmentInput(overrides: Record<string, unknown> = {}) {
  return {
    template_commitment_key: "vitamin_d3",
    title: "Vitamin D3 5000 IU",
    student_instruction: "Take it WITH your fattiest meal — don't skip it. 🙂",
    polarity: "do",
    activity_class: "supplement",
    anchor_kind: "slot",
    slot_key: "breakfast",
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    substance_ref: "vitamin_d3",
    evidence_kind: "self_report",
    evaluation_grain: "occasion",
    slot_kind: "nominal",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    priority: "core",
    ...overrides,
  };
}

function request(overrides: Partial<PublishRequest> = {}): PublishRequest {
  return {
    coachId: COACH,
    studentId: STUDENT,
    plan: {
      title: "Epigenetics protocol — week 1",
      content_locale: "en-US",
      timezone: "Europe/Paris",
    },
    commitments: [commitmentInput()],
    approvals: [approval()],
    ...overrides,
  };
}

interface Fake {
  ports: PublishPorts;
  calls: string[];
  inserted: DbRow[];
  commitments: DbRow[];
  auditRows: DbRow[];
  reseeded: string[];
}

function fakePorts(opts: {
  currentPublished?: DbRow | null;
  maxVersion?: number;
  template?: DbRow | null;
  failMarkPublished?: boolean;
  failRestore?: boolean;
  failReseedTimes?: number;
  markSupersededReturns?: number;
} = {}): Fake {
  const calls: string[] = [];
  const inserted: DbRow[] = [];
  const commitments: DbRow[] = [];
  const auditRows: DbRow[] = [];
  const reseeded: string[] = [];
  let reseedFailuresLeft = opts.failReseedTimes ?? 0;

  const ports: PublishPorts = {
    loadTemplate() {
      calls.push("loadTemplate");
      return Promise.resolve(opts.template ?? null);
    },
    loadCurrentPublished() {
      calls.push("loadCurrentPublished");
      return Promise.resolve(
        opts.currentPublished === undefined
          ? { id: OLD_VERSION, version: 3, status: "published" }
          : opts.currentPublished,
      );
    },
    loadMaxVersion() {
      calls.push("loadMaxVersion");
      return Promise.resolve(opts.maxVersion ?? 3);
    },
    insertDraftVersion(row) {
      calls.push("insertDraftVersion");
      inserted.push(row);
      return Promise.resolve({ ...row, id: NEW_VERSION });
    },
    insertCommitments(rows) {
      calls.push("insertCommitments");
      for (const r of rows) commitments.push(r);
      return Promise.resolve(rows.map((r, i) => ({ ...r, id: `commitment-${i}` })));
    },
    markSuperseded() {
      calls.push("markSuperseded");
      return Promise.resolve(opts.markSupersededReturns ?? 1);
    },
    markPublished({ planVersionId, publishedBy, publishedAtIso }) {
      calls.push("markPublished");
      if (opts.failMarkPublished) {
        return Promise.reject(
          new Error('duplicate key value violates unique constraint "plan_versions_one_published_per_student_idx"'),
        );
      }
      return Promise.resolve({
        id: planVersionId,
        status: "published",
        published_by: publishedBy,
        published_at: publishedAtIso,
      });
    },
    restorePublished() {
      calls.push("restorePublished");
      return Promise.resolve(opts.failRestore ? 0 : 1);
    },
    deleteDraftVersion() {
      calls.push("deleteDraftVersion");
      return Promise.resolve();
    },
    insertAccessEvents(rows) {
      calls.push("insertAccessEvents");
      for (const r of rows) auditRows.push(r);
      return Promise.resolve(rows.length);
    },
    reseed({ planVersionId }) {
      calls.push("reseed");
      if (reseedFailuresLeft > 0) {
        reseedFailuresLeft -= 1;
        return Promise.reject(new Error("reseed exploded"));
      }
      reseeded.push(planVersionId);
      return Promise.resolve({
        planVersionId,
        studentId: STUDENT,
        localDate: "2026-07-27",
        evaluationsInvalidated: 6,
        checkinsCancelled: 2,
        seed: { requested: 4, validated: 4, inserted: 4, conflicted: 0, rejected: 0 },
        sameDaySeedSkippedReason: null,
        skippedByReason: {},
      });
    },
  };

  return { ports, calls, inserted, commitments, auditRows, reseeded };
}

// ---------------------------------------------------------------------------
// 1. THE SUPERSEDE ORDER
// ---------------------------------------------------------------------------

Deno.test("supersede happens BEFORE the new version is published", async () => {
  const fake = fakePorts();
  const result = await publishPlan({ ports: fake.ports, request: request(), now: NOW });

  const supersedeAt = fake.calls.indexOf("markSuperseded");
  const publishAt = fake.calls.indexOf("markPublished");
  const draftAt = fake.calls.indexOf("insertDraftVersion");
  const commitsAt = fake.calls.indexOf("insertCommitments");

  assert(draftAt >= 0 && commitsAt > draftAt, "commitments land under the draft");
  assert(supersedeAt > commitsAt, "the seat opens only once the new plan is fully written");
  assert(publishAt > supersedeAt, "the unique index is sequenced around, not bumped into");
  assertEquals(result.supersededVersionId, OLD_VERSION);
});

Deno.test("the draft records supersedes_version_id and bumps version", async () => {
  const fake = fakePorts({ maxVersion: 3 });
  await publishPlan({ ports: fake.ports, request: request(), now: NOW });
  assertEquals(fake.inserted[0].supersedes_version_id, OLD_VERSION);
  assertEquals(fake.inserted[0].version, 4);
  assertEquals(fake.inserted[0].status, "draft");
});

Deno.test("first publish for a student: no supersede call at all", async () => {
  const fake = fakePorts({ currentPublished: null, maxVersion: 0 });
  const result = await publishPlan({ ports: fake.ports, request: request(), now: NOW });
  assertEquals(fake.calls.includes("markSuperseded"), false);
  assertEquals(result.supersededVersionId, null);
  assertEquals(fake.inserted[0].version, 1);
  assertEquals(fake.inserted[0].supersedes_version_id, null);
});

Deno.test("a concurrent publish that already moved the row is refused, not overwritten", async () => {
  const fake = fakePorts({ markSupersededReturns: 0 });
  const err = await assertRejects(
    () => publishPlan({ ports: fake.ports, request: request(), now: NOW }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "concurrent publish detected");
  // And the half-written draft is cleaned up rather than left as an orphan.
  assert(fake.calls.includes("deleteDraftVersion"));
  assertEquals(fake.calls.includes("markPublished"), false);
});

// ---------------------------------------------------------------------------
// 2. COMPENSATION — the student is never left with nothing published
// ---------------------------------------------------------------------------

Deno.test("a failed publish restores the superseded version to published", async () => {
  const fake = fakePorts({ failMarkPublished: true });
  await assertRejects(
    () => publishPlan({ ports: fake.ports, request: request(), now: NOW }),
    Error,
  );
  const order = fake.calls.join(">");
  assertStringIncludes(order, "markSuperseded>markPublished>restorePublished");
  assert(fake.calls.includes("deleteDraftVersion"), "the dead draft is removed");
});

Deno.test("a failed publish AND a failed restore throws a loud, named error", async () => {
  const fake = fakePorts({ failMarkPublished: true, failRestore: true });
  const err = await assertRejects(
    () => publishPlan({ ports: fake.ports, request: request(), now: NOW }),
    Error,
  );
  assertStringIncludes(err.message, "compensation failed");
  assertStringIncludes(err.message, STUDENT);
  assertStringIncludes(err.message, OLD_VERSION);
});

// ---------------------------------------------------------------------------
// 3. RESEED — the whole point of W6.2 calling W4.2
// ---------------------------------------------------------------------------

Deno.test("reseedOnPublish is called, and only after the version is published", async () => {
  const fake = fakePorts();
  const result = await publishPlan({ ports: fake.ports, request: request(), now: NOW });
  assertEquals(fake.reseeded, [NEW_VERSION]);
  assert(
    fake.calls.indexOf("reseed") > fake.calls.indexOf("markPublished"),
    "re-seeding a version that is not published yet would seed from a draft",
  );
  assertEquals(result.reseed.evaluationsInvalidated, 6);
  assertEquals(result.reseed.checkinsCancelled, 2);
  assertEquals(result.reseed.rowsSeeded, 4);
});

Deno.test("a transient reseed failure is retried once (every step is idempotent)", async () => {
  const fake = fakePorts({ failReseedTimes: 1 });
  const result = await publishPlan({ ports: fake.ports, request: request(), now: NOW });
  assertEquals(fake.calls.filter((c) => c === "reseed").length, 2);
  assertEquals(result.reseed.rowsSeeded, 4);
});

Deno.test("a persistent reseed failure reports the plan as PUBLISHED, not as failed", async () => {
  const fake = fakePorts({ failReseedTimes: 5 });
  const err = await assertRejects(
    () => publishPlan({ ports: fake.ports, request: request(), now: NOW }),
    Error,
  );
  assertEquals(err.name, "PostPublishError");
  assertStringIncludes(err.message, "IS published");
  assertStringIncludes(err.message, "reseed");
});

Deno.test("no publish, no reseed: a refused publish never touches the runtime", async () => {
  const fake = fakePorts();
  await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({ commitments: [commitmentInput({ slot_key: "petit_dejeuner" })] }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertEquals(fake.calls.includes("reseed"), false);
  assertEquals(fake.calls.includes("markSuperseded"), false);
});

// ---------------------------------------------------------------------------
// 4. VERBATIM
// ---------------------------------------------------------------------------

Deno.test("student_instruction survives the clone character for character", async () => {
  const verbatim =
    "  Prends-le AVEC le repas le plus gras.   Ne saute pas ce créneau — jamais. 🙂  ";
  const fake = fakePorts();
  await publishPlan({
    ports: fake.ports,
    request: request({
      commitments: [commitmentInput({ student_instruction: verbatim })],
    }),
    now: NOW,
  });
  assertEquals(fake.commitments[0].student_instruction, verbatim);
});

Deno.test("title is verbatim too (leading/trailing space preserved)", async () => {
  const fake = fakePorts();
  await publishPlan({
    ports: fake.ports,
    request: request({
      commitments: [commitmentInput({ title: "  Vitamine D3 5000 UI  " })],
    }),
    now: NOW,
  });
  assertEquals(fake.commitments[0].title, "  Vitamine D3 5000 UI  ");
});

Deno.test("a commitment without student_instruction stores null, never an empty string", async () => {
  const fake = fakePorts();
  await publishPlan({
    ports: fake.ports,
    request: request({
      commitments: [commitmentInput({ student_instruction: undefined })],
    }),
    now: NOW,
  });
  assertEquals(fake.commitments[0].student_instruction, null);
});

// ---------------------------------------------------------------------------
// 5. R7 AT THE PUBLISH BOUNDARY
// ---------------------------------------------------------------------------

Deno.test("French weekdays are CANONICALIZED, never persisted as French", async () => {
  // The "dimanche" bug class: French day names are a declared INPUT alias, so
  // they are accepted — and normalized. What must never happen is a French
  // token reaching the `scheduled_days` column, where the CHECK would reject
  // it and, worse, where the fail-loud parser would throw at render time.
  const fake = fakePorts();
  await publishPlan({
    ports: fake.ports,
    request: request({
      commitments: [commitmentInput({ scheduled_days: ["lundi", "dimanche"] })],
    }),
    now: NOW,
  });
  assertEquals(fake.commitments[0].scheduled_days, ["mon", "sun"]);
});

Deno.test("an unknown day token refuses the whole publish", async () => {
  const fake = fakePorts();
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({
          commitments: [commitmentInput({ scheduled_days: ["mon", "someday"] })],
        }),
        now: NOW,
      }),
    PublishValidationError,
  );
  // One bad token is enough: the plan is what the student gets graded against.
  assertStringIncludes(err.issues.join(" "), "commitments[0]");
  assertStringIncludes(err.issues.join(" "), "someday");
  assertEquals(fake.calls.includes("markPublished"), false);
});

Deno.test("measure='dose' without substance_ref refuses the publish (R7 corollary)", async () => {
  const fake = fakePorts();
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({
          commitments: [commitmentInput({ substance_ref: null })],
        }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "substance_ref");
});

Deno.test("every bad line is reported at once, not one round-trip at a time", async () => {
  const fake = fakePorts();
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({
          commitments: [
            commitmentInput({ measure: "vibes" }),
            commitmentInput({ template_commitment_key: "b", target_op: "≥" }),
            commitmentInput({ template_commitment_key: "c", polarity: "maybe" }),
          ],
        }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertEquals(err.issues.length, 3);
});

// ---------------------------------------------------------------------------
// 6. THE REGULATORY TRACE
// ---------------------------------------------------------------------------

Deno.test("one coach_access_events row per approved section, plus the publish itself", async () => {
  const fake = fakePorts();
  const result = await publishPlan({
    ports: fake.ports,
    request: request({
      approvals: [approval("supplements"), approval("nutrition"), approval("movement")],
    }),
    now: NOW,
  });
  assertEquals(result.approvalsRecorded, 4);
  const surfaces = fake.auditRows.map((r) => String(r.surface));
  assertEquals(surfaces, [
    `${APPROVAL_SURFACE_PREFIX}supplements`,
    `${APPROVAL_SURFACE_PREFIX}nutrition`,
    `${APPROVAL_SURFACE_PREFIX}movement`,
    PUBLISH_SURFACE,
  ]);
  // The trace carries the CLICK time, not the write time.
  assertEquals(fake.auditRows[0].occurred_at, "2026-07-27T08:59:00.000Z");
  assertEquals(fake.auditRows[3].occurred_at, NOW.toISOString());
  for (const row of fake.auditRows) {
    assertEquals(row.coach_id, COACH);
    assertEquals(row.student_user_id, STUDENT);
  }
});

Deno.test("the trace is written AFTER the publish, never before", async () => {
  const fake = fakePorts();
  await publishPlan({ ports: fake.ports, request: request(), now: NOW });
  assert(fake.calls.indexOf("insertAccessEvents") > fake.calls.indexOf("markPublished"));
});

Deno.test("publishing with zero approvals is refused", async () => {
  const fake = fakePorts();
  const err = await assertRejects(
    () => publishPlan({ ports: fake.ports, request: request({ approvals: [] }), now: NOW }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "at least one section approval");
});

Deno.test("a non-ASCII section token is refused (R1)", async () => {
  const fake = fakePorts();
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({
          approvals: [{ section: "complements", approved_at: approval().approved_at },
                      { section: "compléments", approved_at: approval().approved_at }],
        }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "snake_case");
});

Deno.test("a stale approval timestamp is refused", async () => {
  const fake = fakePorts();
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({
          approvals: [{ section: "supplements", approved_at: "2026-07-01T08:00:00.000Z" }],
        }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "older than 24h");
});

// ---------------------------------------------------------------------------
// 7. TEMPLATE -> CLONE + DIFF
// ---------------------------------------------------------------------------

function templateRow(): DbRow {
  return {
    id: "tmpl-1",
    coach_id: COACH,
    title: "Functional nutrition base",
    content_locale: "en-US",
    default_swap_policy: { allow: "class_equivalent" },
    default_autonomy: "swap_within_policy",
    default_flex_allowance: 2,
    default_adherence_target_pct: 85,
    commitments: [
      commitmentInput(),
      commitmentInput({
        template_commitment_key: "berries",
        title: "Berries, 1 serving a day",
        student_instruction: "A handful. Frozen counts.",
        activity_class: "nutrition",
        anchor_kind: "free",
        measure: "serving",
        unit: "serving",
        target_op: ">=",
        target_min: 1,
        substance_ref: null,
        food_group_ref: "berries",
        evaluation_grain: "day",
        slot_kind: null,
        slot_key: null,
        priority: "optional",
      }),
    ],
    status: "active",
  };
}

Deno.test("template clone: the skeleton becomes the student's rows, defaults applied", async () => {
  const fake = fakePorts({ template: templateRow() });
  await publishPlan({
    ports: fake.ports,
    request: request({ commitments: undefined, templateId: "tmpl-1" }),
    now: NOW,
  });
  assertEquals(fake.commitments.length, 2);
  // default_autonomy is applied where the line is silent...
  assertEquals(fake.commitments[0].autonomy, "swap_within_policy");
  // ...and default_swap_policy lands in `content` (R5: display material).
  assertEquals(
    (fake.commitments[0].content as Record<string, unknown>).swap_policy,
    { allow: "class_equivalent" },
  );
  // Template defaults also drive the version header.
  assertEquals(fake.inserted[0].adherence_target_pct, 85);
  assertEquals(fake.inserted[0].flex_allowance_per_week, 2);
  assertEquals(fake.inserted[0].template_id, "tmpl-1");
});

Deno.test("a per-student diff modifies, removes and adds", async () => {
  const fake = fakePorts({ template: templateRow() });
  await publishPlan({
    ports: fake.ports,
    request: request({
      commitments: undefined,
      templateId: "tmpl-1",
      diff: {
        modify: { vitamin_d3: { target_min: 2000, student_instruction: "Half dose for you." } },
        remove: ["berries"],
        add: [commitmentInput({ template_commitment_key: "magnesium", title: "Magnesium glycinate 400 mg", substance_ref: "magnesium_glycinate", unit: "mg", target_min: 400, slot_key: "before_bed" })],
      },
    }),
    now: NOW,
  });
  const keys = fake.commitments.map((c) => c.template_commitment_key);
  assertEquals(keys, ["vitamin_d3", "magnesium"]);
  assertEquals(fake.commitments[0].target_min, 2000);
  assertEquals(fake.commitments[0].student_instruction, "Half dose for you.");
});

Deno.test("a diff addressing an unknown template key fails loudly (R7)", async () => {
  const fake = fakePorts({ template: templateRow() });
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({
          commitments: undefined,
          templateId: "tmpl-1",
          diff: { remove: ["the_8pm_line"] },
        }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "the_8pm_line");
});

Deno.test("a template of another coach is not found (no existence oracle)", async () => {
  // The port is coach-scoped, so it returns null for someone else's template.
  const fake = fakePorts({ template: null });
  const err = await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({ coachId: OTHER_COACH, commitments: undefined, templateId: "tmpl-1" }),
        now: NOW,
      }),
    PublishValidationError,
  );
  assertStringIncludes(err.issues.join(" "), "not found for this coach");
});

Deno.test("template_id and commitments are mutually exclusive", async () => {
  const fake = fakePorts({ template: templateRow() });
  await assertRejects(
    () =>
      publishPlan({
        ports: fake.ports,
        request: request({ templateId: "tmpl-1" }),
        now: NOW,
      }),
    PublishValidationError,
  );
});

// ---------------------------------------------------------------------------
// 8. THE PURE PIECES
// ---------------------------------------------------------------------------

Deno.test("applyDiff refuses a template line with no addressable key", () => {
  let threw = false;
  try {
    applyDiff([{ title: "unnamed" }], null);
  } catch (err) {
    threw = true;
    assertStringIncludes(String(err), "template_commitment_key");
  }
  assertEquals(threw, true);
});

Deno.test("buildCommitmentRow mirrors the target CHECK per line", () => {
  const ctx = {
    planVersionId: NEW_VERSION,
    studentId: STUDENT,
    coachId: COACH,
    planContentLocale: "en-US",
    defaultAutonomy: null,
    defaultSwapPolicy: null,
  };
  let message = "";
  try {
    buildCommitmentRow(commitmentInput({ target_op: "<=", target_min: 5000 }), ctx);
  } catch (err) {
    message = String(err);
  }
  assertStringIncludes(message, "target_op='<=' requires target_max");
});

Deno.test("a 'free' anchor at occasion grain is rejected by the DB CHECK, so we do not invent one", () => {
  const ctx = {
    planVersionId: NEW_VERSION,
    studentId: STUDENT,
    coachId: COACH,
    planContentLocale: "en-US",
    defaultAutonomy: null,
    defaultSwapPolicy: null,
  };
  const row = buildCommitmentRow(
    commitmentInput({ anchor_kind: "free", slot_key: null, evaluation_grain: "day", slot_kind: null }),
    ctx,
  );
  // We pass the anchor through untouched; no silent default fills slot_key.
  assertEquals(row.anchor_kind, "free");
  assertEquals(row.slot_key, null);
});

Deno.test("content_locale falls back to the plan's locale, never to a guess", () => {
  const ctx = {
    planVersionId: NEW_VERSION,
    studentId: STUDENT,
    coachId: COACH,
    planContentLocale: "fr-FR",
    defaultAutonomy: null,
    defaultSwapPolicy: null,
  };
  assertEquals(buildCommitmentRow(commitmentInput(), ctx).content_locale, "fr-FR");
  assertEquals(
    buildCommitmentRow(commitmentInput({ content_locale: "en-GB" }), ctx).content_locale,
    "en-GB",
  );
});
