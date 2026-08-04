/**
 * `declare_safety_constraint` — du `payload_hint` du frame à un effet demandé.
 *
 * R7 partout: un token inconnu est REFUSÉ, jamais rapproché du plus proche. Une
 * allergie écrite sous un slug approximatif est une allergie que la ceinture ne
 * matchera pas — le silence serait pire que le refus, parce qu'il ressemble à
 * un succès.
 */

import {
  SAFETY_CONSTRAINT_KINDS,
  SAFETY_CONSTRAINT_SEVERITIES,
  type SafetyConstraintKind,
  type SafetyConstraintSeverity,
} from "../../../../_shared/keel/safety_constraints.ts";
import {
  type BlockedSafetyConstraintEffect,
  type RequestedSafetyConstraintEffect,
  SAFETY_CONSTRAINT_INTENTS,
  type SafetyConstraintIntent,
} from "./contract.ts";

/**
 * Slug ASCII snake_case (R1). On NORMALISE la casse et les séparateurs — « Tree
 * Nut », « tree-nut » et « tree_nut » sont le même allergène — mais on
 * n'invente rien: ce qui n'est pas un slug plausible est rejeté.
 */
function normalizeRef(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const slug = raw.replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
  return slug || null;
}

function optionalText(value: unknown, max: number): string | null {
  const raw = String(value ?? "").trim();
  return raw ? raw.slice(0, max) : null;
}

export type SafetyConstraintIntakeResult =
  | { ok: true; effect: RequestedSafetyConstraintEffect }
  | { ok: false; blocked: BlockedSafetyConstraintEffect };

export function intakeSafetyConstraintEffect(input: {
  payload_hint: unknown;
  user_id: string;
  content_locale: string | null;
  source_message_id: string;
}): SafetyConstraintIntakeResult {
  const payload = (input.payload_hint ?? {}) as Record<string, unknown>;

  // R2/R3: la prose stockée porte SA langue, et on refuse de la deviner. Même
  // posture que les deux autres effets durables (`missing_content_locale`).
  const contentLocale = String(input.content_locale ?? "").trim();
  if (!contentLocale) {
    return {
      ok: false,
      blocked: { type: "declare_safety_constraint", reason_code: "missing_content_locale" },
    };
  }

  const rawIntent = String(payload.intent ?? "declare").trim().toLowerCase();
  const intent: SafetyConstraintIntent =
    (SAFETY_CONSTRAINT_INTENTS as readonly string[]).includes(rawIntent)
      ? rawIntent as SafetyConstraintIntent
      : "declare";

  const allergenRef = normalizeRef(payload.allergen_ref);
  const substanceRef = normalizeRef(payload.substance_ref);
  const medicationClass = normalizeRef(payload.medication_class);
  if (!allergenRef && !substanceRef && !medicationClass) {
    // Le CHECK `student_safety_constraints_ref_check` refuserait la ligne de
    // toute façon; on le dit ICI pour que le refus porte un motif nommé plutôt
    // qu'une erreur Postgres remontée en `write_failed`.
    return {
      ok: false,
      blocked: { type: "declare_safety_constraint", reason_code: "missing_identifier" },
    };
  }

  const rawKind = String(payload.kind ?? "allergy").trim().toLowerCase();
  if (!(SAFETY_CONSTRAINT_KINDS as readonly string[]).includes(rawKind)) {
    return {
      ok: false,
      blocked: { type: "declare_safety_constraint", reason_code: "unknown_kind" },
    };
  }
  const kind = rawKind as SafetyConstraintKind;

  // LA SÉVÉRITÉ PAR DÉFAUT EST LA PLUS HAUTE COMPATIBLE AVEC LE `kind`, et ce
  // n'est pas de la prudence décorative: `severity` décide si la ceinture de
  // sortie mord (`medical` seulement). Un défaut trop bas produirait une
  // contrainte enregistrée, visible en base, et INERTE — la pire des trois
  // issues, parce qu'elle a l'air d'avoir marché.
  //
  // 'dislike' est le seul kind qui ne peut pas être médical: c'est un goût.
  const defaultSeverity: SafetyConstraintSeverity = kind === "dislike"
    ? "preference"
    : kind === "religious"
    ? "strict"
    : "medical";
  const rawSeverity = String(payload.severity ?? defaultSeverity).trim().toLowerCase();
  if (!(SAFETY_CONSTRAINT_SEVERITIES as readonly string[]).includes(rawSeverity)) {
    return {
      ok: false,
      blocked: { type: "declare_safety_constraint", reason_code: "unknown_severity" },
    };
  }

  return {
    ok: true,
    effect: {
      type: "declare_safety_constraint",
      intent,
      user_id: input.user_id,
      kind,
      allergen_ref: allergenRef,
      substance_ref: substanceRef,
      medication_class: medicationClass,
      severity: rawSeverity as SafetyConstraintSeverity,
      notes: optionalText(payload.notes, 500),
      content_locale: contentLocale,
      source_message_id: input.source_message_id,
    },
  };
}
