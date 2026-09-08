/**
 * LE RÔLE DU FOYER, RÉDUIT À CE QUE LE CLASSIFIEUR DE NOTES LIT — 2026-09-08.
 *
 * ⛔ UNE SEULE LECTURE, POUR DEUX APPELANTS. `keel-plan-feedback-v1` (la case
 * libre du bilan) et `keel-read-note-v1` (la note sur un brouillon) donnent au
 * modèle le MÊME rôle: `memberId` à recopier, prénom à reconnaître, âge et sexe
 * pour résoudre « mon fils » / « ma femme ». Deux copies de cette lecture
 * auraient divergé au premier champ ajouté — et c'est celle qu'on regarde le
 * moins qui aurait attribué une phrase au foyer entier.
 *
 * ⚠️ LES DEUX RPC NE PRENNENT PAS LE MÊME ARGUMENT, et c'est mesuré:
 * `keel_household_roster_for(p_user)` mais `keel_household_bodies_for(p_household)`.
 * Passer `p_user` à la seconde rend « Could not find the function … in the
 * schema cache » — un refus de PostgREST qui ressemble à une panne de base.
 *
 * ⚠️ AUCUNE PANNE NE LÈVE. Un rôle illisible rend `[]`: le modèle s'abstient
 * d'attribuer (`member_id: null` refusé partout où une personne est requise),
 * et l'appelant journalise. Lever ferait tomber la note entière pour un sexe
 * manquant.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type { DraftNoteMember } from "./draft_note_classify.ts";

export async function draftNoteMembersOf(
  admin: SupabaseClient,
  userId: string,
  /** Le tag de journal de l'appelant — pour que le warn se lise chez lui. */
  tag: string,
): Promise<DraftNoteMember[]> {
  try {
    const roster = await admin.rpc("keel_household_roster_for", { p_user: userId });
    if (roster.error) throw new Error(roster.error.message);
    const rows = (roster.data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) return [];

    // Le sexe vient de la fiche de corps, et son absence n'est pas une panne.
    const sexOf = new Map<string, string>();
    try {
      const hh = await admin.rpc("keel_household_of", { p_user: userId });
      if (hh.error) throw new Error(hh.error.message);
      const householdId = String(hh.data ?? "").trim();
      if (!householdId) throw new Error("aucun foyer");
      const bodies = await admin.rpc("keel_household_bodies_for", {
        p_household: householdId,
      });
      if (bodies.error) throw new Error(bodies.error.message);
      for (const row of (bodies.data ?? []) as Record<string, unknown>[]) {
        const id = String(row.member_id ?? "").trim();
        const sex = String(row.gender ?? "").trim();
        if (id && sex) sexOf.set(id, sex);
      }
    } catch (error) {
      console.warn(JSON.stringify({
        tag,
        event: "bodies_unreadable",
        user_id: userId,
        error: error instanceof Error ? error.message : String(error),
        effect: "sexe inconnu, le modèle s'abstient sur un mot de parenté",
      }));
    }

    return rows.map((row): DraftNoteMember => {
      const memberId = String(row.member_id ?? "");
      const age = String(row.age_state ?? "").trim();
      const sex = sexOf.get(memberId) ?? "";
      return {
        memberId,
        label: String(row.first_name ?? ""),
        ageState: age === "adult" ? "adult" : age === "minor" ? "minor" : null,
        sex: sex === "male" || sex === "female" || sex === "other" ? sex : null,
      };
    }).filter((m) => m.memberId);
  } catch (error) {
    console.warn(JSON.stringify({
      tag,
      event: "roster_unreadable",
      user_id: userId,
      error: error instanceof Error ? error.message : String(error),
      effect: "le modèle s'abstient d'attribuer",
    }));
    return [];
  }
}
