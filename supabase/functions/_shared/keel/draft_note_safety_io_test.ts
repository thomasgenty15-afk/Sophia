// LA PORTE D'ÉCRITURE DES DÉCLARATIONS DE SÉCURITÉ.
//
//   1. QU'ELLE ÉCRIVE SUR LA MAUVAISE LIGNE. La table de sécurité est clavetée
//      sur `user_id`: une allergie de Tom qui y atterrirait serait écrite sur sa
//      mère.
//   2. QUE LA DUPLICATION DE L'`insert` DIVERGE de la lane de conversation. Une
//      colonne ajoutée d'un côté écrirait deux formes du même fait, et la
//      ceinture de sortie n'en lirait qu'une.
//   3. QU'UN REFUS DE LA BASE SE LISE « ENREGISTRÉ ». Les `keel_household_*` ne
//      lèvent pas: elles rendent `{ok:false, reason}`.
//   4. QU'ON ÉCRIVE SANS AVOIR DE QUOI LE DIRE. L'arbitrage remplace le
//      consentement par « on l'écrit, on le DIT, et ça se défait ».

import { assert, assertEquals } from "jsr:@std/assert@1";

import { persistSafetyDeclarations } from "./draft_note_safety_io.ts";

const USER = "44cb7e24-6f82-4ae1-8611-2783f65d889a";
const TOM = "7b17ae2c-dd85-4d27-b8f2-4c52dbfc0828";

function fakeAdmin(over: { insertError?: unknown; rpcBody?: unknown } = {}) {
  const trace = { inserts: [] as Record<string, unknown>[], rpcs: [] as { name: string; params: Record<string, unknown> }[] };
  const admin = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          trace.inserts.push({ table, ...row });
          return Promise.resolve({ error: over.insertError ?? null });
        },
      };
    },
    rpc(name: string, params: Record<string, unknown>) {
      trace.rpcs.push({ name, params });
      return Promise.resolve({ data: over.rpcBody ?? null, error: null });
    },
  };
  return { admin, trace };
}

function run(raw: unknown, over: Parameters<typeof fakeAdmin>[0] = {}, memberIds = [TOM]) {
  const { admin, trace } = fakeAdmin(over);
  return persistSafetyDeclarations({
    admin: admin as never,
    userId: USER,
    raw,
    memberIds,
    contentLocale: "fr-FR",
    sourceMessageId: "msg-1",
  }).then((out) => ({ out, trace }));
}

// ===========================================================================
// 1. LES DEUX DESTINATIONS
// ===========================================================================

Deno.test("sans bouche nommée: la ligne de la personne qui écrit", async () => {
  const { out, trace } = await run([{ kind: "allergy", ref: "peanut", text: "allergique aux arachides" }]);
  assertEquals(out.written.length, 1);
  assertEquals(trace.inserts.length, 1);
  assertEquals(trace.inserts[0].table, "student_safety_constraints");
  assertEquals(trace.inserts[0].user_id, USER);
  assertEquals(trace.inserts[0].allergen_ref, "peanut");
  // ⛔ LA PLUS HAUTE SÉVÉRITÉ COMPATIBLE: `medical` est la seule que la
  // ceinture de sortie regarde.
  assertEquals(trace.inserts[0].severity, "medical");
  assertEquals(trace.inserts[0].declared_by, "student");
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("⛔ UNE BOUCHE NOMMÉE NE VA JAMAIS DANS LA TABLE DE L'ÉLÈVE", async () => {
  const { out, trace } = await run([{ kind: "allergy", ref: "peanut", member_id: TOM }]);
  assertEquals(out.written.length, 1);
  assertEquals(trace.inserts.length, 0, "l'allergie d'un enfant a été écrite sur sa mère");
  assertEquals(trace.rpcs[0].name, "keel_household_add_allergy_for");
  assertEquals(trace.rpcs[0].params.p_member, TOM);
  assertEquals(trace.rpcs[0].params.p_user, USER);
});

Deno.test("un RÉGIME sur une bouche passe par la porte des régimes", async () => {
  const { trace } = await run([{ kind: "diet", ref: "vegetarian", member_id: TOM }]);
  assertEquals(trace.rpcs[0].name, "keel_household_set_member_diet_for");
  assertEquals(trace.rpcs[0].params.p_diet, "vegetarian");
  assertEquals(trace.rpcs[0].params.p_user, USER);
});

Deno.test("⛔ JAMAIS LA RPC D'ÉCRAN — `auth.uid()` est NULL sous `service_role`", async () => {
  // ══ ⟳ 2026-09-05 — LE DÉFAUT QUE CE TEST FIGE ══════════════════════════
  // `keel_household_set_member_diet` et `keel_household_add_allergy` rendent
  // `not_authenticated` à CHAQUE appel depuis ce module (client service_role):
  // le régime ou l'allergie d'une bouche dit dans une note n'a JAMAIS été
  // écrit, du 2026-09-01 au 2026-09-05. Les variantes `_for` prennent `p_user`.
  // Si quelqu'un « simplifie » en revenant aux RPC d'écran, ce test rougit.
  for (const raw of [
    [{ kind: "diet", ref: "vegetarian", member_id: TOM }],
    [{ kind: "religious", ref: "halal", member_id: TOM }],
    [{ kind: "allergy", ref: "peanut", member_id: TOM }],
    [{ kind: "intolerance", ref: "lactose", member_id: TOM }],
    [{ kind: "medical", ref: "diabetes", member_id: TOM }],
  ]) {
    const { trace } = await run(raw);
    assertEquals(trace.rpcs.length, 1);
    assert(trace.rpcs[0].name.endsWith("_for"), `${trace.rpcs[0].name}: RPC d'écran, morte sous service_role`);
    assertEquals(trace.rpcs[0].params.p_user, USER, "sans `p_user`, la variante _for rend `no_user`");
  }
});

// ===========================================================================
// 2. ⛔ CE QUI NE SE LIT PAS « ENREGISTRÉ »
// ===========================================================================

Deno.test("⛔ UN `{ok:false}` DE LA BASE EST UN ÉCHEC, PAS UNE RÉUSSITE", async () => {
  const { out } = await run(
    [{ kind: "allergy", ref: "peanut", member_id: TOM }],
    { rpcBody: { ok: false, reason: "not_owner" } },
  );
  assertEquals(out.written.length, 0);
  assertEquals(out.failed, 1);
});

Deno.test("un DOUBLON n'est pas un échec — le fait est déjà protégé", async () => {
  const { out } = await run(
    [{ kind: "allergy", ref: "peanut" }],
    { insertError: { code: "23505", message: "duplicate" } },
  );
  assertEquals(out.failed, 0);
  assertEquals(out.written.length, 1);
});

Deno.test("une écriture ratée n'emporte pas ses voisines, et elle est COMPTÉE", async () => {
  const { out } = await run(
    [{ kind: "allergy", ref: "peanut" }, { kind: "allergy", ref: "gluten" }],
    { insertError: { code: "XX000", message: "boom" } },
  );
  assertEquals(out.written.length, 0);
  assertEquals(out.failed, 2);
});

// ===========================================================================
// 3. ⛔ LA DUPLICATION DE L'`insert`, FIGÉE
// ===========================================================================

Deno.test("⛔ LES MÊMES COLONNES QUE LA LANE DE CONVERSATION", async () => {
  // Une colonne ajoutée d'un côté et pas de l'autre écrirait deux formes du
  // même fait, et la ceinture de sortie n'en lirait qu'une.
  const mine = await Deno.readTextFile(new URL("./draft_note_safety_io.ts", import.meta.url));
  const theirs = await Deno.readTextFile(
    new URL("../../sophia-brain/tools/always_on/declare_safety_constraint/db.ts", import.meta.url),
  );
  const cols = (src: string) => {
    const at = src.indexOf('.from("student_safety_constraints")\n      .insert({');
    const start = src.indexOf(".insert({", at);
    const end = src.indexOf("})", start);
    return new Set(
      src.slice(start, end).split("\n")
        .map((l) => (l.match(/^\s*([a-z_]+):/) ?? [])[1])
        .filter(Boolean),
    );
  };
  const a = cols(mine), b = cols(theirs);
  assert(a.size > 5, "les colonnes de CE fichier ne se lisent plus");
  assert(b.size > 5, "les colonnes de la lane de conversation ne se lisent plus");
  assertEquals(
    [...a].sort().join(","),
    [...b].sort().join(","),
    "les deux `insert` ont divergé: même fait, deux formes",
  );
});

// ===========================================================================
// 4. ⛔ ON N'ÉCRIT JAMAIS SANS AVOIR DE QUOI LE DIRE
// ===========================================================================

Deno.test("⛔ CE QUI EST ÉCRIT RESSORT — sinon l'appelant ne peut pas prévenir", async () => {
  // L'arbitrage du 2026-09-01 remplace le consentement synchrone par « on
  // l'écrit, on le DIT, et ça se défait ». Un `written` vide sur une écriture
  // réussie rendrait la seconde moitié impossible à livrer.
  const { out } = await run([{ kind: "allergy", ref: "peanut", text: "allergique aux arachides" }]);
  assertEquals(out.written[0].text, "allergique aux arachides");
  assertEquals(out.written[0].ref, "peanut");
});

Deno.test("rien à écrire ne touche à rien", async () => {
  const { out, trace } = await run([]);
  assertEquals(out.written.length, 0);
  assertEquals(trace.inserts.length + trace.rpcs.length, 0);
});


Deno.test("⟳ 2026-09-05 — CE QUI N'A PAS ÉTÉ ÉCRIT EST NOMMÉ, avec le motif de la base", async () => {
  // `failed` comptait; il ne disait pas QUOI. L'appelant doit pouvoir dire à
  // la personne « je n'ai pas pu enregistrer l'allergie de Tom » — un chiffre
  // dans un journal ne prévient personne.
  const { out } = await run(
    [{ kind: "allergy", ref: "peanut", member_id: TOM }, { kind: "diet", ref: "vegetarian" }],
    { rpcBody: { ok: false, reason: "not_a_member" } },
  );
  assertEquals(out.failed, 1);
  assertEquals(out.notWritten.length, 1);
  assertEquals(out.notWritten[0].declaration.memberId, TOM);
  assertEquals(out.notWritten[0].declaration.ref, "peanut");
  assert(/not_a_member/.test(out.notWritten[0].reason));
  assertEquals(out.written.length, 1);
});
