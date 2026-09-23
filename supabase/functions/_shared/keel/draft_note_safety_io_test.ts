/**
 * ⑩ LA PORTE D'ÉCRITURE DE LA SÉCURITÉ DITE DANS UNE NOTE.
 *
 * Deux destinations, parce que la table de sécurité est clée sur `user_id`:
 * la personne qui écrit → `student_safety_constraints`; une autre bouche →
 * les RPC serveur `_for`, avec `p_user`. Un refus `{ok:false}` n'est jamais
 * une réussite, et il revient dans `notWritten` pour être DIT.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  MEMBER_ALLERGY_RPC,
  MEMBER_DIET_RPC,
  persistDraftNoteSafety,
} from "./draft_note_safety_io.ts";
import type { DraftNoteSafetyDeclaration } from "./draft_note_safety.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const ME = "aaaaaaaa-0000-4000-8000-00000000000a";
const ZOE = "aaaaaaaa-0000-4000-8000-000000000001";

type Call = { op: string; table?: string; row?: Record<string, unknown>; filters?: [string, unknown][]; name?: string; params?: Record<string, unknown> };

function fakeAdmin(opts: { rpcData?: unknown; insertError?: { code?: string; message: string } | null } = {}) {
  const calls: Call[] = [];
  const admin = {
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        calls.push({ op: "insert", table, row });
        return Promise.resolve({ data: null, error: opts.insertError ?? null });
      },
      update: (row: Record<string, unknown>) => {
        const call: Call = { op: "update", table, row, filters: [] };
        calls.push(call);
        const chain = {
          eq: (col: string, v: unknown) => {
            call.filters!.push([col, v]);
            return chain;
          },
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
        };
        return chain;
      },
    }),
    rpc: (name: string, params: Record<string, unknown>) => {
      calls.push({ op: "rpc", name, params });
      return Promise.resolve({ data: opts.rpcData ?? { ok: true }, error: null });
    },
  };
  return { admin, calls };
}

const allergy = (memberId: string, text: string): DraftNoteSafetyDeclaration => ({
  kind: "allergy", memberId, text, diet: null, because: `allergique ${text}`,
});
const diet = (memberId: string, d: DraftNoteSafetyDeclaration["diet"]): DraftNoteSafetyDeclaration => ({
  kind: "diet", memberId, text: null, diet: d, because: "végétarien",
});

Deno.test("la personne qui écrit — son allergie va sur SA ligne, slug normalisé, sévérité médicale", async () => {
  const { admin, calls } = fakeAdmin();
  const out = await persistDraftNoteSafety({
    admin, userId: USER, declarations: [allergy(ME, "arachides")], writerMemberId: ME, contentLocale: "fr-FR",
  });
  assertEquals(out.written.length, 1);
  assertEquals(out.notWritten, []);
  const ins = calls.filter((c) => c.op === "insert");
  assertEquals(ins.length, 1);
  assertEquals(ins[0].table, "student_safety_constraints");
  assertEquals(ins[0].row?.user_id, USER);
  assertEquals(ins[0].row?.kind, "allergy");
  assertEquals(ins[0].row?.severity, "medical");
  assertEquals(ins[0].row?.declared_by, "student");
  assert(typeof ins[0].row?.allergen_ref === "string" && (ins[0].row?.allergen_ref as string).length > 0);
  assertEquals(ins[0].row?.source_message_id, null, "l'index (user_id, source_message_id) est unique: deux allergies d'une note");
  assertEquals(calls.filter((c) => c.op === "rpc"), [], "jamais la RPC d'une bouche pour la personne qui écrit");
});

Deno.test("la personne qui écrit — un régime REMPLACE: on retire les actifs, puis on écrit; `omnivore` ne fait que retirer", async () => {
  const a = fakeAdmin();
  await persistDraftNoteSafety({ admin: a.admin, userId: USER, declarations: [diet(ME, "vegan")], writerMemberId: ME, contentLocale: "fr-FR" });
  assertEquals(a.calls.map((c) => c.op), ["update", "insert"], "retirer AVANT d'écrire");
  assertEquals(a.calls[0].row?.status, "retracted");
  assertEquals(a.calls[0].filters, [["user_id", USER], ["kind", "diet"], ["status", "active"]]);
  assertEquals(a.calls[1].row?.kind, "diet");
  assertEquals(a.calls[1].row?.severity, "strict");
  assertEquals(a.calls[1].row?.diet_ref, "vegan");

  const b = fakeAdmin();
  const out = await persistDraftNoteSafety({ admin: b.admin, userId: USER, declarations: [diet(ME, "omnivore")], writerMemberId: ME, contentLocale: "fr-FR" });
  assertEquals(b.calls.map((c) => c.op), ["update"]);
  assertEquals(out.written.length, 1);
});

Deno.test("une autre bouche — les RPC `_for`, avec `p_user`; jamais les RPC d'écran", async () => {
  assert(MEMBER_ALLERGY_RPC.endsWith("_for") && MEMBER_DIET_RPC.endsWith("_for"));
  const { admin, calls } = fakeAdmin();
  await persistDraftNoteSafety({
    admin, userId: USER, declarations: [allergy(ZOE, "arachides"), diet(ZOE, "vegetarian")], writerMemberId: ME, contentLocale: "fr-FR",
  });
  assertEquals(calls.map((c) => [c.op, c.name]), [["rpc", MEMBER_ALLERGY_RPC], ["rpc", MEMBER_DIET_RPC]]);
  assertEquals(calls[0].params, { p_user: USER, p_member: ZOE, p_label: "arachides" });
  assertEquals(calls[1].params, { p_user: USER, p_member: ZOE, p_diet: "vegetarian" });
  assertEquals(calls.filter((c) => c.op === "insert"), [], "jamais sur la ligne de la personne qui écrit");
});

Deno.test("⛔ `{ok:false}` N'EST PAS UNE RÉUSSITE — le refus revient avec son motif", async () => {
  const { admin } = fakeAdmin({ rpcData: { ok: false, reason: "has_account" } });
  const out = await persistDraftNoteSafety({
    admin, userId: USER, declarations: [diet(ZOE, "vegan")], writerMemberId: ME, contentLocale: "fr-FR",
  });
  assertEquals(out.written, []);
  assertEquals(out.notWritten.length, 1);
  assertEquals(out.notWritten[0].reason, "has_account");
});

Deno.test("un doublon sur sa propre ligne n'est pas un échec — le fait est déjà protégé", async () => {
  const dup = fakeAdmin({ insertError: { code: "23505", message: "duplicate" } });
  const ok = await persistDraftNoteSafety({ admin: dup.admin, userId: USER, declarations: [allergy(ME, "arachides")], writerMemberId: ME, contentLocale: "fr-FR" });
  assertEquals(ok.written.length, 1);
  const bad = fakeAdmin({ insertError: { code: "42501", message: "denied" } });
  const ko = await persistDraftNoteSafety({ admin: bad.admin, userId: USER, declarations: [allergy(ME, "arachides")], writerMemberId: ME, contentLocale: "fr-FR" });
  assertEquals(ko.written, []);
  assert(ko.notWritten[0].reason.includes("denied"));
});

Deno.test("sans personne qui écrit au rôle, tout passe par les RPC d'une bouche — jamais une ligne à soi devinée", async () => {
  const { admin, calls } = fakeAdmin();
  await persistDraftNoteSafety({ admin, userId: USER, declarations: [allergy(ME, "arachides")], writerMemberId: null, contentLocale: "fr-FR" });
  assertEquals(calls.map((c) => c.op), ["rpc"]);
});
