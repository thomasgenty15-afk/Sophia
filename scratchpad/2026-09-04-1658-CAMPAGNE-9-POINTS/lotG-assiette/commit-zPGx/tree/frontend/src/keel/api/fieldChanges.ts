// LE CHAMP QUE LA PERSONNE VOIT, CÔTÉ NAVIGATEUR — lot M5.
//
// L'autorité est `supabase/functions/_shared/keel/field_change.ts` (Deno, pur,
// hors du graphe Vite). Ce fichier en est le PORT: mêmes règles, même liste
// fermée, même refus. La recopie est le prix de deux runtimes, et son égalité
// est PROUVÉE par `retainedItems.int.test.ts` — jamais supposée.
//
// ── CE QUE CE FICHIER SERT, ET POURQUOI IL EXISTE ──────────────────────────
// Depuis M5, le bilan de fin de plan ne range plus `cooking_time_min` dans un
// magasin à part: il CHANGE le champ que la personne voit dans ses réglages.
// Avant, il n'écrivait rien et les générateurs posaient la valeur en mémoire au
// moment de composer — la personne lisait 45 min et son plan était fait sur 30.
//
// ⛔ ET C'EST LA CONTREPARTIE QUI JUSTIFIE L'ÉCRITURE. On ne change un champ
// que quelqu'un a rempli qu'à trois conditions, et les trois sont ici:
//   ① ça se VOIT — le champ, et le fil « ce qui vient de changer »;
//   ② ça se JUSTIFIE — la citation, les mots de la personne;
//   ③ ça se DÉFAIT — `previous`, la valeur d'avant, en un clic.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Miroir de `FIELD_CHANGES_KEY`. */
export const FIELD_CHANGES_KEY = "field_changes";

/** Miroir de `WRITABLE_FIELDS` — la liste FERMÉE, et le SQL la porte aussi. */
export const WRITABLE_FIELDS = [
  // ⚠️ L'ORDRE EST CELUI DE `LOGISTICS_FIELDS` (socle Deno), et il est vérifié.
  // Une liste identique dans un autre ordre passerait un test d'ensemble et
  // raterait celui d'égalité — c'est le second qu'on veut, parce que l'ordre
  // est ce qui rend la comparaison lisible quand elle rougit.
  "cook_days",
  "cooking_time_min",
  "recipe_difficulty",
  "variety",
  "budget_amount",
  "eating_rhythm",
] as const;
export type WritableField = (typeof WRITABLE_FIELDS)[number];

/** Miroir de `FIELD_CHANGES_MAX`. */
export const FIELD_CHANGES_MAX = 20;

export interface FieldChange {
  readonly field: WritableField;
  /** La valeur d'AVANT. `null` = le champ n'était pas renseigné. */
  readonly previous: unknown;
  readonly next: unknown;
  readonly at: string;
  readonly source: "questionnaire" | "draft_note" | "conversation";
  /** ⛔ Les mots de la personne. Sans eux, « Défaire » est un pari. */
  readonly quote: string;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseWritableField(value: unknown): WritableField | null {
  const slug = String(value ?? "").trim();
  return (WRITABLE_FIELDS as readonly string[]).includes(slug)
    ? slug as WritableField
    : null;
}

/**
 * Lit une entrée. `null` à la première chose illisible — jamais un repli.
 *
 * ⛔ UNE ENTRÉE QUI NE SAIT PAS DÉFAIRE EST PIRE QU'ABSENTE: elle affiche un
 * bouton qui ment. D'où le refus sur `previous` manquant, sur une citation
 * vide, et sur `written` (la personne ne se notifie pas elle-même — et une
 * entrée `written` serait la signature d'un producteur serveur déguisé).
 */
export function parseFieldChange(value: unknown): FieldChange | null {
  const row = asRecord(value);
  if (!row) return null;

  const field = parseWritableField(row.field);
  if (!field) return null;

  const at = String(row.at ?? "").trim();
  if (!DAY_RE.test(at)) return null;

  const source = String(row.source ?? "").trim();
  if (
    source !== "questionnaire" && source !== "draft_note" &&
    source !== "conversation"
  ) return null;

  const quote = typeof row.quote === "string" ? row.quote.trim() : "";
  if (!quote) return null;

  if (!("previous" in row)) return null;
  if (!("next" in row)) return null;

  return {
    field,
    previous: row.previous ?? null,
    next: row.next ?? null,
    at,
    source,
    quote,
  };
}

/** Une entrée difforme TOMBE SEULE et laisse ses voisines. */
export function parseFieldChanges(value: unknown): FieldChange[] {
  if (!Array.isArray(value)) return [];
  const out: FieldChange[] = [];
  for (const entry of value) {
    const change = parseFieldChange(entry);
    if (change) out.push(change);
  }
  return out;
}

export function fieldChangesFrom(
  pc: Record<string, unknown> | null | undefined,
): FieldChange[] {
  return parseFieldChanges((pc ?? {})[FIELD_CHANGES_KEY]);
}

export function fieldChangeToJson(
  change: FieldChange,
): Record<string, unknown> {
  return {
    field: change.field,
    previous: change.previous,
    next: change.next,
    at: change.at,
    source: change.source,
    quote: change.quote,
  };
}

/**
 * DÉFAIRE — miroir exact de `undoFieldChange`.
 *
 * ⚠️ `previous === null` RETIRE LA CLÉ au lieu d'écrire `null`: une clé absente
 * veut dire « jamais renseigné », un `null` veut dire « renseigné à rien », et
 * plusieurs lecteurs de cette colonne les distinguent.
 *
 * ⛔ L'ENTRÉE EST DÉSIGNÉE PAR SA POSITION, jamais par sa valeur: deux
 * changements du même champ le même jour sont indiscernables autrement, et
 * défaire le mauvais remettrait un nombre que la personne n'a jamais eu.
 */
export function undoFieldChange(
  pc: Record<string, unknown> | null | undefined,
  index: number,
): Record<string, unknown> | null {
  const kept = fieldChangesFrom(pc);
  if (!Number.isInteger(index) || index < 0 || index >= kept.length) return null;
  const target = kept[index];
  const base = { ...(pc ?? {}) };
  if (target.previous === null) delete base[target.field];
  else base[target.field] = target.previous;
  base[FIELD_CHANGES_KEY] = kept
    .filter((_, i) => i !== index)
    .map(fieldChangeToJson);
  return base;
}

/**
 * ÉCRIT LA COLONNE APRÈS UN « DÉFAIRE ».
 *
 * ⚠️ `.eq("user_id", …)` EN PLUS DE RLS, et ce n'est pas une ceinture de trop:
 * cicatrice nommée du dépôt — *« RLS ne remplace pas un `.eq(user_id)` »*, une
 * ligne d'élève rendue au coach, et un `update` à 0 ligne qui rend `204` sans
 * rien dire.
 *
 * ⛔ PAS DE RPC ICI, ET C'EST DÉLIBÉRÉ. Le port serveur
 * (`keel_write_field_changes_for`) prend l'identité en PARAMÈTRE et n'est
 * accordé qu'à `service_role`. Le geste de la personne, lui, passe par sa
 * propre session: l'identité vient du jeton, RLS est la frontière, et il n'y a
 * aucune raison de lui prêter un port qui sait écrire chez les autres.
 */
export async function saveUndoneFieldChanges(args: {
  supabase: SupabaseClient;
  userId: string;
  practicalConstraints: Record<string, unknown>;
}): Promise<void> {
  const { error } = await args.supabase
    .from("student_goals")
    .update({ practical_constraints: args.practicalConstraints })
    .eq("user_id", args.userId);
  if (error) throw new Error(error.message);
}
