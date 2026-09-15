/**
 * LOT 1.1 — L'ÉCHÉANCE EST UNE SEULE VALEUR, DES DEUX CÔTÉS.
 *
 * `keel_household_claim_generation` reçoit `p_stale_after` du handler (440 s) ;
 * `keel_household_request_status` lit la sienne dans
 * `keel_generation_stale_after()`. Si l'un bouge sans l'autre, la lecture
 * dira « en vol » sur un bail que la prise balaie déjà — ou l'inverse. Ce
 * test épingle les trois sites sur le fichier de migration.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  GENERATION_LOCK_MARGIN_MS,
  PLAN_REQUEST_BUDGET_MS,
} from "./generation_model.ts";

const ROOT = new URL("../../../", import.meta.url);
const SQL = await Deno.readTextFile(
  new URL("migrations/20260915100000_l_echeance_est_lue.sql", ROOT),
);
const HANDLER = await Deno.readTextFile(
  new URL("functions/generate-household-meal-v1/index.ts", ROOT),
);

Deno.test("épinglage — l'échéance SQL vaut budget + marge, soit 440 s", () => {
  assertEquals(PLAN_REQUEST_BUDGET_MS + GENERATION_LOCK_MARGIN_MS, 440_000);
  assert(SQL.includes("select interval '440 seconds'"));
});

Deno.test("la prise passe la MÊME échéance que la lecture", () => {
  assert(
    HANDLER.includes(
      "const lockTtlMs = PLAN_REQUEST_BUDGET_MS + GENERATION_LOCK_MARGIN_MS;",
    ),
  );
  assert(HANDLER.includes("p_stale_after: `${Math.round(lockTtlMs / 1000)} seconds`,"));
});

Deno.test("la lecture de statut lit l'âge du verrou ET du brouillon en vol", () => {
  assert(SQL.includes("v_stale interval := public.keel_generation_stale_after();"));
  assert(SQL.includes("v_lock.started_at < now() - v_stale"));
  assert(SQL.includes("v_draft.created_at < now() - v_stale"));
  assertEquals(
    (SQL.match(/'kind', 'expired'/g) ?? []).length,
    2,
    "deux sorties `expired` : le brouillon en vol, puis le verrou",
  );
  // La lecture ne balaie rien : c'est la prise qui le fait.
  assertEquals(SQL.includes("delete from"), false);
});
