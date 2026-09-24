import { assert, assertEquals } from "jsr:@std/assert@1";
import { sourceFamily } from "./source_family.ts";

const ROOT = new URL("../../../", import.meta.url);
const SQL = await Deno.readTextFile(
  new URL("migrations/20260914150000_generation_lease_fence.sql", ROOT),
);
const HANDLER = await sourceFamily(
  new URL("generate-household-meal-v1/index.ts", new URL("../../", import.meta.url)),
);

Deno.test("un bail unique est rendu à la seule insertion gagnante", () => {
  assert(SQL.includes("lease_token uuid"));
  assert(SQL.includes("'lease_token', v_lease"));
  assert(SQL.includes("on conflict (household_id) do nothing"));
  assertEquals(SQL.includes("'reclaimed', true"), false);
});

Deno.test("le même request_id en vol n'acquiert jamais un second bail", () => {
  const occupied = SQL.slice(SQL.indexOf("select * into v_existing"));
  assert(occupied.includes("'reason', 'in_flight'"));
  assertEquals(occupied.includes("v_existing.request_id = p_request"), false);
});

Deno.test("libération, brouillon et plan exigent tous request_id + lease_token", () => {
  for (const name of [
    "keel_household_release_generation",
    "keel_household_complete_draft_generation",
    "keel_household_publish_generation",
  ]) {
    const start = SQL.indexOf(`function public.${name}(`);
    assert(start > 0, `${name} absente`);
    const signature = SQL.slice(start, SQL.indexOf(")", start));
    assert(signature.includes("p_request uuid"), `${name}: request_id absent`);
    assert(signature.includes("p_lease uuid"), `${name}: lease absent`);
  }
  assertEquals(
    SQL.match(/v_lock\.request_id <> p_request or v_lock\.lease_token <> p_lease/g)?.length,
    2,
  );
});

Deno.test("les deux publications et le finally consomment le bail du handler", () => {
  assert(HANDLER.includes("La demande durable."));
  assert(HANDLER.includes("leaseToken: string;"));
  assert(HANDLER.includes("p_lease: held.leaseToken"));
  assert(HANDLER.includes('"keel_household_complete_draft_generation"'));
  assert(HANDLER.includes('"keel_household_publish_generation"'));
  assert(HANDLER.includes('await releaseGenerationLock("request_end")'));
});

Deno.test("une panne de prise refuse avant tout appel modèle", () => {
  const claim = HANDLER.indexOf('admin.rpc("keel_household_claim_generation"');
  const refused = HANDLER.indexOf('error: "generation_lock_unavailable"', claim);
  const model = HANDLER.indexOf('await appelModele("composition"', claim);
  assert(claim > 0 && refused > claim && model > refused);
});

Deno.test("la lecture authentifiée d'une demande relit le verrou, le brouillon et le plan", () => {
  const sql = Deno.readTextFileSync(
    new URL("migrations/20260914160000_generation_request_status.sql", ROOT),
  );
  assert(sql.includes("function public.keel_household_request_status("));
  assert(sql.includes("generated_from ->> 'request_id'"));
  assert(sql.includes("from public.household_generation_lock"));
  assert(sql.includes("grant execute on function public.keel_household_request_status(uuid)"));
});
