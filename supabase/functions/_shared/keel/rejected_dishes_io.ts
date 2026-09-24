/**
 * LA LISTE DES PLATS REFUSÉS — l'écriture en base (2026-09-24).
 *
 * Un seul appel: `keel_append_rejected_dishes_for` (migration
 * `20260924120000`), qui FUSIONNE en SQL dans un `update` atomique. Jamais de
 * lire-puis-écrire ici: une réécriture depuis une copie lue plus tôt a déjà
 * effacé des écritures dans `practical_constraints`.
 *
 * ⚠️ `p_user` ET PAS `auth.uid()`: appelé depuis `keel-read-note-v1` en
 * `service_role`, où `auth.uid()` est NULL. L'appelant passe l'identifiant
 * qu'il a VÉRIFIÉ sur le jeton.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

export interface RejectedDishesWrite {
  ok: boolean;
  /** `null` quand c'est écrit; sinon le motif rendu par la fonction, ou `rpc_error`. */
  reason: string | null;
  /** Les entrées de la liste APRÈS la fusion (plafonnée à 200). */
  count: number | null;
}

export async function appendRejectedDishes(args: {
  admin: SupabaseClient;
  userId: string;
  entries: readonly Record<string, unknown>[];
}): Promise<RejectedDishesWrite> {
  if (args.entries.length === 0) return { ok: true, reason: null, count: null };
  const { data, error } = await args.admin.rpc("keel_append_rejected_dishes_for", {
    p_user: args.userId,
    p_entries: args.entries,
  });
  if (error) return { ok: false, reason: "rpc_error", count: null };
  const out = (data ?? {}) as Record<string, unknown>;
  if (out.ok !== true) {
    return { ok: false, reason: String(out.reason ?? "unknown"), count: null };
  }
  const count = Number(out.count);
  return { ok: true, reason: null, count: Number.isFinite(count) ? count : null };
}
