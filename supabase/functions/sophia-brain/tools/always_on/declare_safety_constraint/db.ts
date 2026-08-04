/**
 * `declare_safety_constraint` — l'écriture physique.
 *
 * Le seul fichier du dossier qui sache que Supabase existe. Deux chemins,
 * et tous deux finissent sur une ligne SORTIE de la base:
 *
 *   declare -> insert + `.select().single()`; sur violation d'unicité
 *              (23505 sur `student_safety_constraints_source_message_idx`),
 *              SELECT explicite de la ligne préexistante. L'idempotence vit
 *              dans l'index partiel, pas dans un « est-ce que j'ai déjà vu ce
 *              message ? » côté client qui court contre lui-même.
 *   retract -> UPDATE ciblé + relecture. Aucune suppression: voir la migration
 *              20260803160000 pour les trois raisons.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  RequestedSafetyConstraintEffect,
  SafetyConstraintRow,
  SafetyConstraintWrite,
  SafetyConstraintWriteResult,
} from "./contract.ts";

const READ_BACK_COLUMNS =
  "id,user_id,kind,allergen_ref,substance_ref,medication_class,severity,status," +
  "declared_by,content_locale";

const UNIQUE_VIOLATION = "23505";

function asRow(value: unknown): SafetyConstraintRow | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  const text = (key: string): string | null =>
    row[key] === null || row[key] === undefined ? null : String(row[key]);
  return {
    id,
    user_id: String(row.user_id ?? ""),
    kind: String(row.kind ?? ""),
    allergen_ref: text("allergen_ref"),
    substance_ref: text("substance_ref"),
    medication_class: text("medication_class"),
    severity: String(row.severity ?? ""),
    status: String(row.status ?? ""),
    declared_by: String(row.declared_by ?? ""),
    content_locale: String(row.content_locale ?? ""),
  };
}

/** Les identifiants portés par la demande, pour cibler une rétractation. */
function refsOf(input: RequestedSafetyConstraintEffect): string[] {
  return [input.allergen_ref, input.substance_ref, input.medication_class]
    .filter((r): r is string => Boolean(r));
}

export function createSafetyConstraintWrite(args: {
  supabase: SupabaseClient;
}): SafetyConstraintWrite {
  return async (input): Promise<SafetyConstraintWriteResult> => {
    if (input.intent === "retract") {
      // On ne retire QUE ce qui existe et qui est actif. `nothing_to_retract`
      // est un résultat, pas une erreur: l'élève peut corriger une contrainte
      // que le système n'a jamais eue (c'est exactement ce qui arrivait avant
      // qu'un écrivain existe), et le renderer doit pouvoir le dire au lieu
      // d'accuser une suppression fantôme.
      const refs = refsOf(input);
      if (refs.length === 0) return { outcome: "nothing_to_retract" };

      const targets = await args.supabase
        .from("student_safety_constraints")
        .select("id,allergen_ref,substance_ref,medication_class")
        .eq("user_id", input.user_id)
        .eq("status", "active");
      if (targets.error) {
        throw new Error(
          `student_safety_constraints retract lookup failed: ${targets.error.message}`,
        );
      }
      const rows = (targets.data ?? []) as Array<Record<string, unknown>>;
      const match = rows.find((row) => {
        const r = row;
        return refs.some((ref) =>
          [r.allergen_ref, r.substance_ref, r.medication_class]
            .some((v) => String(v ?? "").toLowerCase() === ref)
        );
      }) as Record<string, unknown> | undefined;
      if (!match) return { outcome: "nothing_to_retract" };

      // L'écriture passe par la fonction SECURITY DEFINER, pas par un UPDATE
      // direct: la table n'a AUCUNE policy UPDATE, et lui en ajouter une
      // laisserait l'élève réécrire `severity` (voir la migration
      // 20260803160000 pour le raisonnement complet). Un UPDATE direct touchait
      // zéro ligne — le mode d'échec exact rencontré en run réel.
      const rpc = await args.supabase.rpc(
        "retract_student_safety_constraint",
        { p_constraint_id: String(match.id), p_reason: input.notes },
      );
      if (rpc.error) {
        throw new Error(
          `student_safety_constraints retract failed: ${rpc.error.message}`,
        );
      }
      if (!rpc.data) {
        // La fonction n'a rien rendu: la ligne n'était plus active (course avec
        // un autre tour). Ce n'est pas une panne, c'est « il n'y avait plus
        // rien à retirer » — et le renderer le dira ainsi.
        return { outcome: "nothing_to_retract" };
      }

      // RELECTURE, comme partout ailleurs: l'accusé ne cite que ce que la base
      // rend APRÈS l'écriture, jamais ce que la fonction a promis.
      const readBack = await args.supabase
        .from("student_safety_constraints")
        .select(READ_BACK_COLUMNS)
        .eq("id", String(match.id))
        .maybeSingle();
      if (readBack.error) {
        throw new Error(
          `student_safety_constraints retract read-back failed: ${readBack.error.message}`,
        );
      }
      const row = asRow(readBack.data);
      if (!row || row.status !== "retracted") {
        throw new Error(
          "student_safety_constraints retract returned no retracted row (write-through violated)",
        );
      }
      return { outcome: "retracted", row };
    }

    const inserted = await args.supabase
      .from("student_safety_constraints")
      .insert({
        user_id: input.user_id,
        kind: input.kind,
        allergen_ref: input.allergen_ref,
        substance_ref: input.substance_ref,
        medication_class: input.medication_class,
        severity: input.severity,
        // Le chat, c'est l'élève qui parle. `coach` est réservé au canal coach,
        // qui n'existe pas encore: une autorisation qu'une couche
        // probabiliste peut affirmer n'est pas une autorisation.
        declared_by: "student",
        notes: input.notes,
        content_locale: input.content_locale,
        source_message_id: input.source_message_id,
      })
      .select(READ_BACK_COLUMNS)
      .single();

    if (!inserted.error) {
      const row = asRow(inserted.data);
      if (!row) {
        throw new Error(
          "student_safety_constraints insert returned no readable row (write-through violated)",
        );
      }
      return { outcome: "inserted", row };
    }

    if (inserted.error.code !== UNIQUE_VIOLATION) {
      throw new Error(
        `student_safety_constraints insert failed: ${inserted.error.message}`,
      );
    }

    const existing = await args.supabase
      .from("student_safety_constraints")
      .select(READ_BACK_COLUMNS)
      .eq("user_id", input.user_id)
      .eq("source_message_id", input.source_message_id)
      .maybeSingle();
    if (existing.error) {
      throw new Error(
        `student_safety_constraints read-back failed: ${existing.error.message}`,
      );
    }
    const row = asRow(existing.data);
    if (!row) {
      // Violation d'unicité sans ligne lisible: on ne fabrique jamais un
      // commit à partir d'un conflit.
      throw new Error(
        "student_safety_constraints unique violation with no readable existing row",
      );
    }
    return { outcome: "already_recorded", row };
  };
}
