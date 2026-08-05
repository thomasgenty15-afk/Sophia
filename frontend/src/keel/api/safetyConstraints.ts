// KEEL — les contraintes de sécurité de l'élève, côté navigateur.
//
// CE QUE CETTE TABLE PORTE, ET POURQUOI C'EST LA PLUS SENSIBLE DU PRODUIT
// -----------------------------------------------------------------------
// `student_safety_constraints` alimente quatre choses: la génération de repas
// (`generate-meal-v1`), la génération de semaine (`generate-week-plan-v1`), le
// résolveur de substitution de `plan_question`, et surtout le VERROU DE SORTIE
// (`keel_output_locks.ts`) qui remplace tout message où Sophia suggérerait un
// allergène médical. Une ligne écrite ici change ce que l'élève lit au tour
// suivant.
//
// RLS EST LE CONTRÔLE D'ACCÈS, PAS CE FICHIER. La lecture, l'insertion et la
// rétractation passent par PostgREST sous le JWT de l'élève. Ce qu'un élève
// peut modifier est décidé par la policy `owner_retract` ET par le trigger
// `student_safety_constraints_retraction_only` (migration 20260804190000): on ne
// peut QUE retirer, jamais réécrire un allergène ni changer l'auteur d'une
// déclaration. Une contrainte ne s'édite pas, elle se remplace.
//
// WRITE-THROUGH, TOUJOURS. Les deux écritures ci-dessous font `.select()` et
// rendent la ligne RELUE. Rien dans cet écran n'annonce un effet qu'il n'a pas
// relu — c'est la règle de `keelClient.ts`, et elle compte doublement ici: dire
// « c'est enregistré » sur une allergie qui n'est pas en base est le mensonge le
// plus cher que ce produit puisse faire.

import { supabase } from "../../lib/supabase";

const TABLE = "student_safety_constraints";

/**
 * R7 à la frontière réseau: une erreur PostgREST est levée, jamais avalée.
 *
 * Le client navigateur est créé sans générique `Database` (`lib/supabase.ts`),
 * donc PostgREST type chaque `.select("a, b, c")` sur une table KEEL en
 * `GenericStringError`. Même convention que `keelClient.ts :: unwrap`: la forme
 * opaque est traversée ICI, une seule fois, et les appelants énoncent le type
 * qu'ils attendent. Élargir à chaque site d'appel disperserait les
 * `as unknown as` dans toute l'app.
 */
function unwrap(
  result: { data: unknown; error: { message: string } | null },
  what: string,
): unknown {
  if (result.error) {
    throw new Error(`[keel/safetyConstraints] ${what} failed: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    // Écriture sans ligne relue: on n'annonce rien. Même règle que le
    // write-through des faits — pas de ligne, pas d'accusé. Dire « c'est
    // enregistré » sur une allergie absente de la base est le mensonge le plus
    // cher que ce produit puisse faire.
    throw new Error(`[keel/safetyConstraints] ${what} returned no row (write-through violated)`);
  }
  return result.data;
}

const COLUMNS =
  "id, user_id, kind, allergen_ref, substance_ref, medication_class, severity, " +
  "declared_by, notes, status, content_locale, created_at, retracted_at";

/** `student_safety_constraints_kind_check` — liste fermée du schéma. */
export const CONSTRAINT_KINDS = [
  "allergy",
  "intolerance",
  "medical",
  "religious",
  "dislike",
] as const;
export type ConstraintKind = (typeof CONSTRAINT_KINDS)[number];

/**
 * `severity` — et `medical` n'est pas une nuance de gravité, c'est un
 * INTERRUPTEUR. Elle seule arme le verrou qui remplace un message entier
 * (`findMedicalConstraintViolations` ne regarde que `severity === 'medical'`).
 * L'écran doit donc l'expliquer, jamais la présenter comme « plus grave ».
 */
export const CONSTRAINT_SEVERITIES = ["medical", "strict", "preference"] as const;
export type ConstraintSeverity = (typeof CONSTRAINT_SEVERITIES)[number];

export interface SafetyConstraintRow {
  id: string;
  user_id: string;
  kind: string;
  allergen_ref: string | null;
  substance_ref: string | null;
  medication_class: string | null;
  severity: string;
  declared_by: string;
  notes: string | null;
  status: string;
  content_locale: string;
  created_at: string;
  retracted_at: string | null;
}

/**
 * Le token que porte cette contrainte, quel que soit le champ qui le porte.
 *
 * Le schéma impose qu'au moins un des trois soit renseigné
 * (`student_safety_constraints_ref_check`), donc cette fonction ne rend `null`
 * que sur une ligne impossible — et le dire vaut mieux que rendre "".
 */
export function constraintRef(row: SafetyConstraintRow): string | null {
  return row.allergen_ref ?? row.substance_ref ?? row.medication_class ?? null;
}

/** Les contraintes ACTIVES de l'élève connecté, la plus récente d'abord. */
export async function loadActiveConstraints(
  userId: string,
): Promise<SafetyConstraintRow[]> {
  const result = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (result.error) {
    throw new Error(`[keel/safetyConstraints] load failed: ${result.error.message}`);
  }
  return (result.data ?? []) as unknown as SafetyConstraintRow[];
}

/**
 * Ce danger est déjà déclaré et actif. Une classe d'erreur à part, parce que
 * l'écran doit en dire quelque chose d'utile — et surtout ne PAS l'afficher
 * comme un échec d'enregistrement, qui pousserait l'élève à réessayer.
 */
export class DuplicateConstraintError extends Error {
  constructor() {
    super("duplicate_active_constraint");
    this.name = "DuplicateConstraintError";
  }
}

export interface DeclareConstraintInput {
  userId: string;
  kind: ConstraintKind;
  severity: ConstraintSeverity;
  /** Slug déjà normalisé par l'appelant (`normalizeAllergenRef`). */
  ref: string;
  /** Le champ qui portera le slug. */
  refField: "allergen_ref" | "substance_ref" | "medication_class";
  notes: string | null;
  contentLocale: string;
}

/**
 * Déclare une contrainte, et rend la ligne RELUE.
 *
 * `declared_by: 'student'` est posé ici et le trigger le rend ensuite
 * immuable: un élève ne peut pas fabriquer une contrainte attribuée à son
 * coach. C'est la falsification d'autorité que la migration ferme.
 *
 * Pas de `source_message_id`: son index d'unicité sert la déduplication du
 * chemin conversationnel (un message = une contrainte). Un formulaire n'a pas
 * de message; lui en inventer un ferait échouer la deuxième déclaration de la
 * journée sur une contrainte d'idempotence qui ne parle pas de lui.
 */
export async function declareConstraint(
  input: DeclareConstraintInput,
): Promise<SafetyConstraintRow> {
  const row: Record<string, unknown> = {
    user_id: input.userId,
    kind: input.kind,
    severity: input.severity,
    declared_by: "student",
    notes: input.notes,
    content_locale: input.contentLocale,
    allergen_ref: null,
    substance_ref: null,
    medication_class: null,
  };
  row[input.refField] = input.ref;

  const result = await supabase.from(TABLE).insert(row).select(COLUMNS).single();
  // 23505 = l'index partiel `student_safety_constraints_active_unique_idx`: ce
  // danger est DÉJÀ actif pour cet élève. Ce n'est pas une panne, c'est un
  // double clic — et le lui dire en langage PostgREST sur la déclaration de son
  // allergie serait la pire façon possible de ne rien casser.
  if (result.error && (result.error as { code?: string }).code === "23505") {
    throw new DuplicateConstraintError();
  }
  return unwrap(result, "declare") as SafetyConstraintRow;
}

/**
 * Retire une contrainte. Ce n'est PAS une suppression.
 *
 * La ligne survit avec `status='retracted'` et son horodatage: le coach garde
 * la trace de ce qui a été déclaré puis retiré, et le RGPD garde une histoire
 * cohérente. `retracted_at` est posé par le trigger si on l'oublie — une
 * rétractation refusée pour une raison de plomberie laisserait l'élève enfermé
 * dans une contrainte périmée.
 */
export async function retractConstraint(args: {
  id: string;
  userId: string;
  reason: string | null;
}): Promise<SafetyConstraintRow> {
  return unwrap(
    await supabase
      .from(TABLE)
      .update({
        status: "retracted",
        retracted_reason: args.reason,
        retracted_at: new Date().toISOString(),
      })
      // `user_id` en plus de `id`: RLS le garantit déjà, mais un filtre
      // explicite rend impossible qu'un id fuité touche la ligne d'un autre
      // élève si la policy changeait un jour.
      .eq("id", args.id)
      .eq("user_id", args.userId)
      .select(COLUMNS)
      .single(),
    "retract",
  ) as SafetyConstraintRow;
}
