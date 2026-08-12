/**
 * LES DEUX LECTURES QUE LA PROPOSITION ET LA FUSION PARTAGENT. Lot L5.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D8, D10,
 * D17. La moitié qui DÉCIDE est dans `household_merge_notice.ts`, pure et
 * mutable; celle-ci ne fait que ramener des lignes.
 *
 * ── POURQUOI CE FICHIER EXISTE PLUTÔT QUE DEUX REQUÊTES ─────────────────
 * Le générateur (pour fusionner, défusionner, et re-reprendre à la composition)
 * et le lecteur de propositions ont besoin EXACTEMENT du même plan du foyer, lu
 * avec exactement le même prédicat. Deux `select` écrits séparément auraient
 * divergé au premier ajustement — et ce dépôt a déjà mesuré, deux fois le
 * 2026-08-12, ce que coûte un lecteur du plan du foyer qui ne filtre pas comme
 * les autres (`household_plan_kind_readers_test.ts`).
 *
 * ⚠️ `plan_kind = 'household'` EST OBLIGATOIRE, ET CE N'EST PAS UNE PRÉCAUTION.
 * Un plan PERSONNEL porte aussi `household_id` — `generate-meal-v1` l'estampe
 * exprès, pour que la fusion le retrouve. `household_id is not null` ne veut
 * donc PAS dire « plan du foyer »; seul `plan_kind` le dit.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";
import type { MergeSettingRow } from "./household_merge_notice.ts";

/** Un plan du foyer vivant, avec tout ce que la fusion et la défusion en lisent. */
export interface LiveHouseholdPlan {
  id: string;
  startsOn: string;
  durationDays: number;
  validatedAt: string | null;
  /** Jetons `mon`..`sun` des sessions de cuisine, sans doublon. */
  cookingDays: string[];
  /** Jour · créneau · titre. Jamais le `why` d'un plat — voir `household_merge.ts`. */
  dishes: { day: string | null; slot: string | null; title: string }[];
  /** La provenance brute. `readMergedFrom` en tire les reprises.  */
  generatedFrom: unknown;
}

/** Les jours de cuisson d'un `cooking_sessions` stocké. */
export function storedCookingDays(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const day = String((entry as Record<string, unknown>).day ?? "").trim();
    if (day && !out.includes(day)) out.push(day);
  }
  return out;
}

/**
 * LES PLATS D'UN PLAN STOCKÉ — TROIS CHAMPS, ET PAS UN DE PLUS.
 *
 * ⚠️ `why` N'EST PAS LU, ET C'EST UNE DÉCISION. C'est la seule prose d'un plan
 * qui parle de la PERSONNE (« pourquoi CE plat pour CET élève »), et ce qu'on
 * assemble ici part dans un prompt dont la sortie est lue à table par tout le
 * foyer. Les titres, eux, sont déjà lisibles par chaque membre
 * (`student_generated_meals_household_read`): les passer ne divulgue rien de
 * neuf. `ingredients` non plus: ils ne serviraient qu'à faire recopier une
 * recette que le modèle doit pouvoir refuser.
 */
export function storedDishes(
  raw: unknown,
): { day: string | null; slot: string | null; title: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { day: string | null; slot: string | null; title: string }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const title = String(row.title ?? "").trim();
    if (!title) continue;
    out.push({
      day: String(row.day ?? "").trim() || null,
      slot: String(row.slot ?? "").trim() || null,
      title,
    });
  }
  return out;
}

/**
 * LES PLANS DU FOYER VIVANTS, DU PLUS ANCIEN AU PLUS RÉCENT.
 *
 * Au plus deux à la fois: la contrainte d'exclusion de
 * `student_generated_meals` garantit qu'un compte porte le plan COURANT et,
 * éventuellement, le SUIVANT.
 *
 * ⚠️ `household_id` EST FILTRÉ EN PLUS DU PROPRIÉTAIRE (L5). Sans lui, un
 * maître qui a changé de foyer verrait le plan vivant de l'ANCIEN foyer
 * proposé à la fusion du nouveau — et la fusion aurait écrit dans une cuisine
 * où plus personne ne mange. La direction du resserrement est sûre: au pire il
 * rend `merge_no_household_plan`, refus déjà nommé, plutôt qu'un plan étranger.
 */
export async function loadLiveHouseholdPlans(
  admin: SupabaseClient,
  args: { ownerUserId: string; householdId: string },
): Promise<LiveHouseholdPlan[]> {
  const res = await admin
    .from("student_generated_meals")
    .select(
      "id, starts_on, duration_days, validated_at, cooking_sessions, dishes, generated_from",
    )
    .eq("user_id", args.ownerUserId)
    .eq("household_id", args.householdId)
    .eq("plan_kind", "household")
    .is("retired_at", null)
    .order("starts_on", { ascending: true });
  if (res.error) throw res.error;
  return ((res.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    startsOn: String(row.starts_on ?? ""),
    durationDays: Number(row.duration_days ?? 0),
    validatedAt: row.validated_at == null ? null : String(row.validated_at),
    cookingDays: storedCookingDays(row.cooking_sessions),
    dishes: storedDishes(row.dishes),
    generatedFrom: row.generated_from ?? null,
  }));
}

/**
 * LE RÉGLAGE DISCRET (D17) ET LES REFUS (D8, 3e sortie), PAR BOUCHE.
 *
 * FAIL-OPEN NOMMÉ: une lecture en panne rend une liste VIDE, c'est-à-dire un
 * foyer sans réglage — donc toutes les propositions visibles. C'est le bon sens
 * de l'échec pour un FILTRE d'affichage: se tromper dans l'autre sens masquerait
 * silencieusement des propositions que le maître attend. L'appelant journalise.
 */
export async function loadMergeSettings(
  admin: SupabaseClient,
  householdId: string,
): Promise<MergeSettingRow[]> {
  const res = await admin
    .from("household_merge_settings")
    .select("member_id, proposals_muted, dismissed_validated_at")
    .eq("household_id", householdId);
  if (res.error) throw res.error;
  return ((res.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    memberId: String(row.member_id),
    proposalsMuted: row.proposals_muted === true,
    dismissedValidatedAt: row.dismissed_validated_at == null
      ? null
      : String(row.dismissed_validated_at),
  }));
}
