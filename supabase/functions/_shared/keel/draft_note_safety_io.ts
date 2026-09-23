/**
 * LA PORTE D'ÉCRITURE DE LA SÉCURITÉ DITE DANS UNE NOTE.
 *
 * ⟳ 2026-09-23 — rouverte sur décision du propriétaire (voir
 * `draft_note_safety.ts`). Elle écrit ce que la relecture a gardé — une
 * allergie, une intolérance, un régime, chacun avec sa preuve dans la note —
 * aux MÊMES endroits que le formulaire :
 *
 *   la personne qui écrit (`writes: true`)  → `student_safety_constraints`,
 *       comme `saveOwnAllergies` / `saveOwnDiet` (sévérité `medical` pour une
 *       allergie ou une intolérance, `strict` pour un régime) ;
 *   une autre bouche                          → les variantes serveur
 *       `keel_household_add_allergy_for` / `keel_household_set_member_diet_for`
 *       (migration 20260905180000), jamais les RPC d'écran gatées sur
 *       `auth.uid()`, NULL sous `service_role`.
 *
 * ⛔ DEUX DESTINATIONS PARCE QUE LA TABLE DE SÉCURITÉ EST CLÉE SUR `user_id`.
 * Router l'allergie d'un enfant sur la ligne de sa mère écrirait un fait faux
 * sur de la santé.
 *
 * ⚠️ UN RÉGIME DE LA PERSONNE QUI ÉCRIT SE REMPLACE, IL NE S'AJOUTE PAS. La
 * table est en rétractation seule (trigger) : on RETIRE les lignes `diet`
 * actives, puis on écrit la nouvelle — sinon deux régimes vivraient ensemble,
 * et le moteur prendrait le premier qu'il trouve. `omnivore` ne fait que
 * retirer.
 *
 * ⚠️ UNE ÉCRITURE RATÉE NE FAIT PAS ÉCHOUER LES AUTRES, ET ELLE EST RENDUE
 * (`notWritten`) pour être DITE sous le champ : un `failed` que personne ne lit
 * a déjà fait croire, du 1er au 5 septembre, à des allergies d'enfant
 * enregistrées qui ne l'étaient pas.
 *
 * ⛔ AUCUN ALLERGÈNE NI AUCUN TEXTE DANS LE JOURNAL.
 */
import { normalizeAllergenRef } from "./allergen_catalog.ts";
import type { DraftNoteSafetyDeclaration } from "./draft_note_safety.ts";

/** Le strict minimum de client dont cette porte a besoin. */
export type MinimalSafetyClient = {
  // deno-lint-ignore no-explicit-any
  from: (table: string) => any;
  // deno-lint-ignore no-explicit-any
  rpc: (name: string, params: Record<string, unknown>) => any;
};

/** Les RPC serveur. ⛔ Suffixe `_for` et `p_user` OBLIGATOIRES — un test le fige. */
export const MEMBER_ALLERGY_RPC = "keel_household_add_allergy_for";
export const MEMBER_DIET_RPC = "keel_household_set_member_diet_for";

export interface DraftNoteSafetyWriteOutcome {
  readonly written: readonly DraftNoteSafetyDeclaration[];
  readonly notWritten: readonly { readonly declaration: DraftNoteSafetyDeclaration; readonly reason: string }[];
}

export async function persistDraftNoteSafety(args: {
  admin: MinimalSafetyClient;
  userId: string;
  declarations: readonly DraftNoteSafetyDeclaration[];
  /** L'uuid de la ligne `writes: true` — la personne qui écrit. `null` = aucune. */
  writerMemberId: string | null;
  contentLocale: string;
}): Promise<DraftNoteSafetyWriteOutcome> {
  const written: DraftNoteSafetyDeclaration[] = [];
  const notWritten: { declaration: DraftNoteSafetyDeclaration; reason: string }[] = [];
  const writer = String(args.writerMemberId ?? "").trim().toLowerCase();
  for (const d of args.declarations) {
    try {
      if (writer !== "" && d.memberId === writer) {
        await writeOwn(args, d);
      } else {
        await writeMember(args, d);
      }
      written.push(d);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      notWritten.push({ declaration: d, reason });
      console.error(JSON.stringify({
        tag: "keel/draft_note_safety",
        event: "write_failed",
        user_id: args.userId,
        kind: d.kind,
        own: writer !== "" && d.memberId === writer,
        reason,
      }));
    }
  }
  return { written, notWritten };
}

/** Une ligne à soi, dans `student_safety_constraints`. */
async function writeOwn(
  args: { admin: MinimalSafetyClient; userId: string; contentLocale: string },
  d: DraftNoteSafetyDeclaration,
): Promise<void> {
  const base = {
    user_id: args.userId,
    declared_by: "student",
    notes: null,
    content_locale: args.contentLocale || "en-GB",
    allergen_ref: null,
    substance_ref: null,
    medication_class: null,
    condition_ref: null,
    diet_ref: null,
    // ⚠️ `null` et pas l'id de la requête: l'index `(user_id,
    // source_message_id)` est unique, et une note peut porter deux allergies.
    source_message_id: null,
  };
  if (d.kind === "diet") {
    // ── REMPLACER: retirer les régimes actifs, puis écrire le nouveau ───────
    const retract = await args.admin
      .from("student_safety_constraints")
      .update({ status: "retracted", retracted_reason: "replaced_by_note" })
      .eq("user_id", args.userId)
      .eq("kind", "diet")
      .eq("status", "active");
    if (retract?.error) throw new Error(`retract: ${String(retract.error.message ?? retract.error)}`);
    if (d.diet === null || d.diet === "omnivore") return;
    const insert = await args.admin
      .from("student_safety_constraints")
      .insert({ ...base, kind: "diet", severity: "strict", diet_ref: d.diet });
    if (insert?.error && String(insert.error.code ?? "") !== "23505") {
      throw new Error(`insert_diet: ${String(insert.error.message ?? insert.error)}`);
    }
    return;
  }
  // ⛔ LE MÊME NORMALISEUR QUE LE FORMULAIRE ET LA CONVERSATION: le même
  // allergène doit donner le même slug, sinon la base porte deux lignes pour
  // un seul fait et la ceinture n'en lit qu'une.
  const ref = normalizeAllergenRef(d.text);
  if (!ref) throw new Error("bad_ref");
  const insert = await args.admin
    .from("student_safety_constraints")
    .insert({ ...base, kind: d.kind, severity: "medical", allergen_ref: ref });
  // ⛔ UN DOUBLON N'EST PAS UN ÉCHEC: le fait est déjà protégé.
  if (insert?.error && String(insert.error.code ?? "") !== "23505") {
    throw new Error(`insert: ${String(insert.error.message ?? insert.error)}`);
  }
}

/** La ligne d'une autre bouche, par les RPC serveur `_for`. */
async function writeMember(
  args: { admin: MinimalSafetyClient; userId: string },
  d: DraftNoteSafetyDeclaration,
): Promise<void> {
  // Une intolérance d'une bouche rejoint sa liste d'allergies: c'est la seule
  // liste de sécurité qu'une bouche porte (`household_member_allergies`), et
  // le formulaire y range les deux.
  const rpc = d.kind === "diet"
    ? await args.admin.rpc(MEMBER_DIET_RPC, { p_user: args.userId, p_member: d.memberId, p_diet: d.diet })
    : await args.admin.rpc(MEMBER_ALLERGY_RPC, { p_user: args.userId, p_member: d.memberId, p_label: d.text });
  if (rpc?.error) throw new Error(String(rpc.error.message ?? rpc.error));
  // ⛔ `{ok:false}` N'EST PAS UNE RÉUSSITE: ces RPC rendent un motif, elles ne lèvent pas.
  const body = rpc?.data as Record<string, unknown> | null;
  if (body && typeof body === "object" && body.ok === false) {
    throw new Error(String(body.reason ?? "refused"));
  }
}
