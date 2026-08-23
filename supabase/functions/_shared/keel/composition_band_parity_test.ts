/**
 * LOT 18 — LA MÊME BANDE DES DEUX CÔTÉS, OU RIEN.
 *
 * ── POURQUOI CE TEST EXISTE ───────────────────────────────────────────────
 * La bande p05/p95 d'un groupe est écrite DEUX FOIS: en SQL
 * (`food_composition_group_bands`, qui décide des promotions) et en TypeScript
 * (`groupBandsFrom`, qui décide du repli par bornes au moment du calcul). Le
 * module TS est PUR — il ne peut pas interroger la base — donc la duplication
 * est structurelle et ne peut pas être supprimée.
 *
 * Ce qu'on peut faire, c'est refuser qu'elles DIVERGENT. Deux écritures d'une
 * même formule s'écartent au premier ajustement, et c'est celle qu'on relit le
 * moins qui garde l'ancienne. Ici, la divergence est ROUGE.
 *
 * ⚠️ SANS PILE VIVANTE, CE CAS SAUTE — il n'échoue pas. Un filet en permanence
 * rouge n'est plus lu (`qa-env-exports-poison-the-suite`).
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
 *     deno test --allow-net --allow-env supabase/functions/_shared/keel/composition_band_parity_test.ts
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { loadCompositionIndex } from "./food_composition_io.ts";
import { GROUP_BAND_MIN_REFS, groupBandsFrom } from "./composition_fill.ts";
import type { FoodGroupRef } from "./tokens.ts";

const URL = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
const SKIP = !URL || !KEY;
if (SKIP) {
  console.log(
    "[skip] composition_band_parity_test.ts: needs a live Supabase stack " +
      "(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)",
  );
}

/** 0,05 kcal/100 g. Au-delà, ce n'est plus un arrondi, c'est une formule. */
const TOLERANCE = 0.05;

Deno.test({
  name: "⛔ la bande TS et la bande SQL ne divergent sur AUCUN groupe",
  ignore: SKIP,
  fn: async () => {
    const admin = createClient(URL, KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const index = await loadCompositionIndex(admin as never);
    const ts = groupBandsFrom(index);

    const { data, error } = await admin.from("food_composition_group_bands")
      .select("food_group_ref, refs, energy_low, energy_high");
    assertEquals(error, null);
    const sql: Map<string, { refs: number; low: number; high: number }> = new Map(
      (data ?? []).map((r: Record<string, unknown>) => [
        String(r.food_group_ref),
        {
          refs: Number(r.refs),
          low: Number(r.energy_low),
          high: Number(r.energy_high),
        },
      ] as [string, { refs: number; low: number; high: number }]),
    );

    assert(ts.size > 0, "aucune bande calculée côté TS — le décor est faux");
    const drift: string[] = [];
    for (const [group, band] of ts) {
      const other = sql.get(group);
      if (!other) {
        drift.push(`${group}: absent de la vue SQL`);
        continue;
      }
      if (band.refs !== other.refs) {
        drift.push(`${group}: refs ${band.refs} (TS) vs ${other.refs} (SQL)`);
      }
      if (Math.abs(band.energyLow - other.low) > TOLERANCE) {
        drift.push(`${group}: low ${band.energyLow} vs ${other.low}`);
      }
      if (Math.abs(band.energyHigh - other.high) > TOLERANCE) {
        drift.push(`${group}: high ${band.energyHigh} vs ${other.high}`);
      }
    }
    // ⚠️ L'INVERSE AUSSI: un groupe que le SQL borne et que le TS ignore ferait
    // promouvoir des lignes que le calcul n'aurait jamais bornées.
    for (const [group, other] of sql) {
      if (!ts.has(group as FoodGroupRef) && other.refs >= GROUP_BAND_MIN_REFS) {
        drift.push(`${group}: borné en SQL (${other.refs} lignes), absent côté TS`);
      }
    }
    assertEquals(drift, [], `bandes divergentes:\n  ${drift.join("\n  ")}`);
  },
});
