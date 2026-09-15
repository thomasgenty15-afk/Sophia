/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 1 — UNE DEMANDE A TOUJOURS UNE ISSUE (audit 2026-09-14, R1 et R2)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Deux défauts mesurés le 2026-09-14, tous deux VERTS sous les 7 330 tests de
 * l'époque — c'est très exactement pourquoi ce fichier existe:
 *
 *  R1. La lecture d'état rendait `in_flight` sur un bail de 17 h. Les deux
 *      verrous en cause appartenaient au 546 de la campagne et au 502 du
 *      pilote: ni l'un ni l'autre n'exécute son `catch`, donc rien ne libère.
 *      L'écran disait « la composition continue » à une personne dont plus
 *      aucun worker ne composait.
 *
 *  R2. `keel_adopt_meal_draft` rend le même `meal_id` sur un brouillon déjà
 *      adopté — mais `adoptability` refusait 409 AVANT de l'atteindre, et le
 *      client cherchait son résultat par un `request_id` tiré à neuf à chaque
 *      tap. Une réponse perdue après une adoption RÉUSSIE s'affichait donc en
 *      échec pendant que le plan existait.
 *
 * ── LA FORME DU MOCK EST LA MOITIÉ DU TEST ────────────────────────────────
 *
 * Le faux PostgREST n'expose que les méthodes que ces modules ont le droit
 * d'employer, et il ENREGISTRE les colonnes lues et les filtres posés: un mock
 * permissif rendrait le même vert à une lecture qui aurait perdu `created_at`
 * — c'est-à-dire à la version d'avant ce lot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PLAN_LEASE_DEADLINE_MS,
  PLAN_RECOVERY_WAIT_MS,
} from "./mealGeneration";
import { planFailureKey } from "../copy/planRefusals";
import { fr } from "../i18n/fr";
import { en } from "../i18n/en";

const ROOT = resolve(__dirname, "../../../..");

interface Recorded {
  table: string;
  columns: string | null;
  filters: Array<{ op: string; column: string; value: unknown }>;
}

let calls: Recorded[] = [];
/** Réponse du faux PostgREST, par table. */
let rows: Record<string, unknown> = {};
let rpcReply: { data: unknown; error: unknown } = { data: null, error: null };
let invokeReply: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("../../lib/supabase", () => {
  const build = (record: Recorded) => {
    const reply = () =>
      Promise.resolve({ data: rows[record.table] ?? null, error: null });
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
      rpc: () => Promise.resolve(rpcReply),
      functions: { invoke: () => Promise.resolve(invokeReply) },
    },
  };
});

const { recoverLatestDraft, waitForDraft, writeFromDraft } = await import(
  "./planDraft"
);

const DRAFT = "11111111-2222-3333-4444-555555555555";
const MEAL = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  calls = [];
  rows = {};
  rpcReply = { data: null, error: null };
  invokeReply = { data: null, error: null };
});

describe("l'échéance est UNE valeur, sur les trois sites", () => {
  /**
   * ⛔ UN TEST PARAMÉTRÉ PAR SA PROPRE CONSTANTE NE TESTE RIEN. On ne compare
   * pas `PLAN_LEASE_DEADLINE_MS` à lui-même: on relit les DEUX AUTRES copies
   * sur le disque — le SQL de la base et le budget du handler — et on refuse
   * la divergence. Porter l'une des trois à 60 s rend ce test rouge.
   */
  it("vaut 440 s dans le navigateur, dans la base et dans le worker", () => {
    expect(PLAN_LEASE_DEADLINE_MS).toBe(440_000);

    const sql = readFileSync(
      resolve(ROOT, "supabase/migrations/20260915100000_l_echeance_est_lue.sql"),
      "utf8",
    );
    expect(sql).toContain("select interval '440 seconds'");

    const worker = readFileSync(
      resolve(ROOT, "supabase/functions/_shared/keel/generation_model.ts"),
      "utf8",
    );
    const budget = /PLAN_REQUEST_BUDGET_MS = ([\d_]+)/.exec(worker)?.[1];
    const margin = /GENERATION_LOCK_MARGIN_MS = ([\d_]+)/.exec(worker)?.[1];
    expect(budget, "PLAN_REQUEST_BUDGET_MS introuvable").toBeTruthy();
    expect(margin, "GENERATION_LOCK_MARGIN_MS introuvable").toBeTruthy();
    expect(
      Number(budget!.replaceAll("_", "")) + Number(margin!.replaceAll("_", "")),
    ).toBe(PLAN_LEASE_DEADLINE_MS);
  });

  it("n'est PAS le temps d'attente: la LIGNE décide de la fin, l'horloge locale couvre deux baux", () => {
    // ⟳ 2026-09-15 · LOT E — l'assertion inverse (« on attend moins longtemps
    // qu'on ne périme ») ÉPINGLAIT LE BUG : 145 + 235 = 380 s, soixante secondes
    // avant le bail, donc `plan_expired` était inatteignable et un worker mort
    // se lisait « ça continue ». La relecture s'arrête désormais sur la ligne
    // (`done`, `failed`, âge > bail) ; l'échéance locale n'est qu'un garde-fou,
    // au-delà de la mère, d'un tick de relance et de la fille.
    expect(PLAN_RECOVERY_WAIT_MS).toBeGreaterThanOrEqual(2 * PLAN_LEASE_DEADLINE_MS);
  });
});

describe("R1 — un travail mort ne se lit plus « en cours »", () => {
  it("un rechargement ne rouvre AUCUNE attente sur un brouillon périmé", async () => {
    rows["student_meal_drafts"] = {
      id: DRAFT,
      status: "running",
      response: null,
      error_code: null,
      expires_at: ago(-3_600_000),
      created_at: ago(PLAN_LEASE_DEADLINE_MS + 60_000),
    };
    expect(await recoverLatestDraft()).toBeNull();

    const read = calls.find((c) => c.table === "student_meal_drafts");
    expect(read?.columns, "sans `created_at`, l'âge est illisible").toContain(
      "created_at",
    );
  });

  it("un brouillon FRAIS reste en vol: l'écran a toujours quelque chose à attendre", async () => {
    rows["student_meal_drafts"] = {
      id: DRAFT,
      status: "running",
      response: null,
      error_code: null,
      expires_at: ago(-3_600_000),
      created_at: ago(30_000),
    };
    expect(await recoverLatestDraft()).toEqual({
      state: "in_flight",
      draftId: DRAFT,
    });
  });

  it("l'attente s'arrête TOUT DE SUITE sur une ligne périmée, et dit `plan_expired`", async () => {
    rows["student_meal_drafts"] = {
      id: DRAFT,
      status: "pending",
      response: null,
      error_code: null,
      expires_at: ago(-3_600_000),
      created_at: ago(PLAN_LEASE_DEADLINE_MS + 1_000),
    };
    // ⚠️ Sans le refus, cette boucle tournerait 235 s pour finir sur la phrase
    // exactement fausse. Le test lui-même mesure qu'elle rend la main.
    const t0 = Date.now();
    await expect(waitForDraft(DRAFT)).rejects.toThrow("plan_expired");
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it("une date de création ILLISIBLE ne périme rien — c'est un défaut de lecture", async () => {
    rows["student_meal_drafts"] = {
      id: DRAFT,
      status: "running",
      response: null,
      error_code: null,
      expires_at: ago(-3_600_000),
      created_at: "pas une date",
    };
    expect(await recoverLatestDraft()).toEqual({
      state: "in_flight",
      draftId: DRAFT,
    });
  });
});

describe("R2 — une réponse perdue après adoption rend le plan, pas un échec", () => {
  it("retrouve le plan par le `draft_id`, l'identité stable des deux côtés", async () => {
    // Le transport tombe APRÈS que la transaction a commis.
    invokeReply = { data: null, error: new Error("Failed to send a request") };
    rows["student_generated_meals"] = null;
    rows["student_meal_drafts"] = { adopted_meal_id: MEAL };

    const out = await writeFromDraft(
      {
        window: { kind: "days", count: 3 },
        cookingShape: null,
        oneCookingSession: false,
        context: null,
        preferences: null,
      } as never,
      DRAFT,
      "prepare_next",
      null,
    );
    expect(out).toEqual({ ok: true, mealId: MEAL });

    // ⛔ LA LECTURE QUI COMPTE: par `id`, pas par un `request_id` tiré à neuf.
    const byDraft = calls.find(
      (c) => c.table === "student_meal_drafts" && c.columns === "adopted_meal_id",
    );
    expect(byDraft, "le plan doit être cherché par le brouillon").toBeTruthy();
    expect(byDraft!.filters).toContainEqual({
      op: "eq",
      column: "id",
      value: DRAFT,
    });
  });

  it("sans plan écrit, l'erreur d'origine remonte — on n'invente pas un succès", async () => {
    invokeReply = { data: null, error: new Error("Failed to send a request") };
    rows["student_generated_meals"] = null;
    rows["student_meal_drafts"] = { adopted_meal_id: null };

    await expect(
      writeFromDraft(
        {
          window: { kind: "days", count: 3 },
          cookingShape: null,
          oneCookingSession: false,
          context: null,
          preferences: null,
        } as never,
        DRAFT,
        "prepare_next",
        null,
      ),
    ).rejects.toThrow();
  });
});

describe("la phrase de `plan_expired` dit la vérité", () => {
  it("existe dans les deux langues et n'annonce PAS un travail en cours", () => {
    const key = planFailureKey("plan_expired");
    expect(key).toBe("plan.refusal.plan_expired");

    const phrase = (fr as Record<string, string>)[key as string];
    expect(phrase).toBeTruthy();
    // Elle dit que rien n'a été écrit, et que le plan actuel est intact.
    expect(phrase).toContain("Rien n’a été écrit");
    expect(phrase).toContain("n’a pas bougé");
    // ⛔ ET SURTOUT PAS « ça continue »: c'est la phrase de l'autre issue.
    expect(phrase).not.toContain("continue");

    expect((en as Record<string, string>)[key as string]).toBeTruthy();
  });
});
