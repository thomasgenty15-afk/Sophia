/**
 * 2026-09-20 — LE BOUTON REPREND LA MAIN.
 *
 * Mesuré en local : un clic sur « Construire mon plan » pendant qu'une
 * composition tourne rendait 409 `generation_in_flight` et laissait la
 * personne sans aucun geste jusqu'à la péremption (440 s). Trois sites, un
 * seul contrat : `composeDraft` passe `takeover: true`, le handler ne le
 * transmet que sur un appel JWT, la RPC ferme le brouillon en vol et lève le
 * verrou. Ce test épingle les trois — et ce qui NE doit PAS prendre la main.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";

const ROOT = new URL("../../../", import.meta.url);
const REPO = new URL("../../../../", import.meta.url);
const SQL = await Deno.readTextFile(
  new URL("migrations/20260920190000_le_bouton_reprend_la_main.sql", ROOT),
);
const RELAUNCH_SQL = await Deno.readTextFile(
  new URL("migrations/20260915183000_une_relance_et_une_seule.sql", ROOT),
);
const HANDLER = await Deno.readTextFile(
  new URL("functions/generate-household-meal-v1/index.ts", ROOT),
);
const FRONT = await Deno.readTextFile(
  new URL("frontend/src/keel/api/planDraft.ts", REPO),
);

const codeOf = (sql: string) =>
  sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

Deno.test("la RPC a un sixième argument, et l'ancienne signature est supprimée", () => {
  const code = codeOf(SQL);
  assert(code.includes("p_takeover boolean default false"));
  assert(
    code.includes(
      "drop function if exists public.keel_household_claim_generation(uuid, uuid, text, uuid, interval);",
    ),
    "deux surcharges rendraient l'appel PostgREST ambigu",
  );
  assert(code.includes("'superseded_request_id', v_superseded"));
});

Deno.test("la reprise ferme le brouillon en vol avec la phrase qui existe déjà", () => {
  const code = codeOf(SQL);
  const start = code.indexOf("if coalesce(p_takeover, false) then");
  const takeover = code.slice(start, code.indexOf("insert into public.household_generation_lock", start));
  assert(takeover.includes("error_code = 'generation_lease_lost'"));
  assert(takeover.includes("where status in ('pending', 'running')"));
  assert(takeover.includes("(household_id = p_household or user_id = p_actor)"));
  assertEquals(
    takeover.includes("error_code = 'timed_out'"),
    false,
    "un brouillon fermé par la reprise ne doit pas ressembler à un timed_out",
  );
});

Deno.test("la relance automatique ne réclame jamais une ligne fermée par la reprise", () => {
  const code = codeOf(RELAUNCH_SQL);
  assert(code.includes("(d.status = 'failed' and d.error_code = 'timed_out')"));
  assertEquals(code.includes("generation_lease_lost"), false);
});

Deno.test("le handler ne transmet la reprise que sur un appel JWT", () => {
  assert(
    HANDLER.includes(
      "const takeoverAsked = (body as Record<string, unknown>).takeover === true &&\n      relaunchOf === null;",
    ),
  );
  assert(HANDLER.includes("p_takeover: takeoverAsked,"));
  const claim = HANDLER.indexOf('admin.rpc("keel_household_claim_generation"');
  const flag = HANDLER.indexOf("const takeoverAsked =");
  assert(flag > 0 && flag < claim, "le drapeau est lu après la prise");
  assert(HANDLER.includes('tag: "keel.household_meal.generation_taken_over"'));
});

Deno.test("seul composeDraft prend la main ; la reprise locale et l'adoption jamais", () => {
  const compose = FRONT.slice(
    FRONT.indexOf("export async function composeDraft("),
    FRONT.indexOf("export async function editCells("),
  );
  assert(compose.includes("{ takeover: true }"));
  const rest = FRONT.slice(FRONT.indexOf("export async function editCells("));
  assertEquals(rest.includes("takeover"), false);
});
