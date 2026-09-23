/**
 * ⟳ 2026-09-15 · LOT C — LA RELECTURE SUIT LA RELANCE.
 *
 * Une mère `async` morte (bail dépassé, ou `timed_out` posé par une balayeuse)
 * a droit à UNE fille, ouverte par `keel-relaunch-meal-drafts` dans la minute.
 * Le navigateur ne dit donc pas « c'est fini » tout de suite : il cherche la
 * fille, la suit, et sinon laisse passer un tick (`PLAN_RELAUNCH_GRACE_MS`).
 *
 * ⛔ ET IL NE LE FAIT QUE POUR CE QUE LE RELANCEUR RELANCE : une ligne `sync`,
 * une reprise locale (`edit_cells`), une `attempt = 2` meurent tout de suite.
 * Sans ces cas, l'écran attendrait 90 s pour rien — et une garde qui attend
 * toujours ressemble à une garde qui marche.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PLAN_LEASE_DEADLINE_MS, PLAN_RELAUNCH_GRACE_MS } from "./mealGeneration";

interface Recorded {
  table: string;
  columns: string | null;
  filters: Array<{ op: string; column: string; value: unknown }>;
}

let calls: Recorded[] = [];
/** Les lignes par identifiant ; la fille est trouvée par `relaunch_of`. */
let rowsById: Record<string, Record<string, unknown>> = {};
let childrenOf: Record<string, string> = {};

vi.mock("../../lib/supabase", () => {
  const build = (record: Recorded) => {
    const reply = () => {
      const byId = record.filters.find((f) => f.op === "eq" && f.column === "id");
      if (byId) return Promise.resolve({ data: rowsById[String(byId.value)] ?? null, error: null });
      const byMother = record.filters.find((f) => f.op === "eq" && f.column === "relaunch_of");
      if (byMother) {
        const child = childrenOf[String(byMother.value)];
        return Promise.resolve({ data: child ? { id: child } : null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    const chain = {
      eq: (column: string, value: unknown) => {
        record.filters.push({ op: "eq", column, value });
        return chain;
      },
      in: (column: string, value: unknown) => {
        record.filters.push({ op: "in", column, value });
        return chain;
      },
      gt: (column: string, value: unknown) => {
        record.filters.push({ op: "gt", column, value });
        return chain;
      },
      filter: (column: string, op: string, value: unknown) => {
        record.filters.push({ op, column, value });
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: reply,
    };
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => ({
        select: (columns: string) => {
          const record: Recorded = { table, columns, filters: [] };
          calls.push(record);
          return build(record);
        },
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    },
  };
});

const { waitForDraft, recoverLatestDraft } = await import("./planDraft");

const MOTHER = "11111111-2222-3333-4444-555555555555";
const CHILD = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const RESPONSE = { ok: true, draft: true, draft_id: CHILD, dishes: [] };

const deadMother = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: MOTHER,
  status: "running",
  response: null,
  error_code: null,
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  created_at: ago(PLAN_LEASE_DEADLINE_MS + 5_000),
  stage: "composing",
  mode: "async",
  attempt: 1,
  relaunched_at: null,
  finished_at: null,
  operation: "compose",
  ...extra,
});

beforeEach(() => {
  calls = [];
  rowsById = {};
  childrenOf = {};
  // La boucle dort 2 s entre deux lectures : ici, un tour de boucle suffit.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((cb: () => void) => {
    queueMicrotask(cb);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout);
});

describe("une mère morte dont la relance peut venir", () => {
  it("suit la fille dès qu'elle existe, et rapporte `attempt: 2`", async () => {
    rowsById[MOTHER] = deadMother();
    childrenOf[MOTHER] = CHILD;
    rowsById[CHILD] = {
      id: CHILD,
      status: "done",
      response: RESPONSE,
      error_code: null,
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      created_at: ago(30_000),
      stage: "writing",
      mode: "async",
      attempt: 2,
      relaunch_of: MOTHER,
      operation: "compose",
    };
    const attempts: number[] = [];
    const draft = await waitForDraft(MOTHER, { onProgress: (p) => attempts.push(p.attempt) });
    expect(draft.envelope.draftId).toBe(CHILD);
    expect(attempts).toContain(1);
    expect(attempts).toContain(2);
    const followed = calls.filter((c) => c.filters.some((f) => f.column === "id" && f.value === CHILD));
    expect(followed.length, "la fille a bien été relue par son propre id").toBeGreaterThan(0);
  });

  it("une mère `failed/timed_out` sans fille, hors grâce : `plan_expired` — et pas tout de suite avant", async () => {
    rowsById[MOTHER] = deadMother({
      status: "failed",
      error_code: "timed_out",
      finished_at: ago(PLAN_RELAUNCH_GRACE_MS + 1_000),
      relaunched_at: ago(PLAN_RELAUNCH_GRACE_MS + 1_000),
    });
    await expect(waitForDraft(MOTHER)).rejects.toThrow("plan_expired");
  });

  it("au rechargement, une mère morte dans sa grâce est encore « en vol »", async () => {
    const row = deadMother({ created_at: ago(PLAN_LEASE_DEADLINE_MS + 5_000) });
    // `recoverLatestDraft` lit sans `id` : on répond la mère à cette lecture-là.
    rowsById[MOTHER] = row;
    const { supabase } = await import("../../lib/supabase");
    const orig = supabase.from;
    (supabase as { from: unknown }).from = (table: string) => ({
      select: (columns: string) => {
        const record: Recorded = { table, columns, filters: [] };
        calls.push(record);
        const chain = {
          eq: () => chain,
          in: () => chain,
          gt: () => chain,
          filter: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () => Promise.resolve({ data: row, error: null }),
        };
        return chain;
      },
    });
    try {
      expect(await recoverLatestDraft()).toEqual({ state: "in_flight", draftId: MOTHER, origin: null, replaces: null, input: null });
    } finally {
      (supabase as { from: unknown }).from = orig;
    }
  });
});

describe("ce que le relanceur ne relance pas meurt tout de suite", () => {
  it("une ligne `sync` hors bail : `plan_expired` sans attendre", async () => {
    rowsById[MOTHER] = deadMother({ mode: "sync" });
    const t0 = Date.now();
    await expect(waitForDraft(MOTHER)).rejects.toThrow("plan_expired");
    expect(Date.now() - t0).toBeLessThan(500);
    expect(calls.some((c) => c.filters.some((f) => f.column === "relaunch_of")), "aucune fille cherchée").toBe(false);
  });

  it("une reprise locale (`edit_cells`) morte : `plan_expired` sans chercher de fille", async () => {
    rowsById[MOTHER] = deadMother({ status: "failed", error_code: "timed_out", operation: "edit_cells", finished_at: ago(1_000) });
    await expect(waitForDraft(MOTHER)).rejects.toThrow("plan_expired");
    expect(calls.some((c) => c.filters.some((f) => f.column === "relaunch_of"))).toBe(false);
  });

  it("une fille (`attempt = 2`) morte : `plan_expired`, jamais une troisième", async () => {
    rowsById[MOTHER] = deadMother({ attempt: 2, relaunch_of: "00000000-0000-4000-8000-000000000000" });
    await expect(waitForDraft(MOTHER)).rejects.toThrow("plan_expired");
    expect(calls.some((c) => c.filters.some((f) => f.column === "relaunch_of"))).toBe(false);
  });

  it("un `compose_failed` se dit `composition_unavailable` — un jeton qui a une phrase", async () => {
    rowsById[MOTHER] = deadMother({ status: "failed", error_code: "compose_failed", finished_at: ago(1_000) });
    await expect(waitForDraft(MOTHER)).rejects.toThrow("composition_unavailable");
  });
});
