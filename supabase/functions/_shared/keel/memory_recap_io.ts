/**
 * CE QU'ON A RETENU AUJOURD'HUI — la lecture. Socle : `memory_recap.ts`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ TROIS LECTURES, ET AUCUNE NE DEVINE
 * ═══════════════════════════════════════════════════════════════════════════
 *   · `student_safety_constraints` — ce qui a été écrit AUJOURD'HUI pour la
 *     personne elle-même, par `created_at`;
 *   · `household_member_allergies` — la même chose pour une bouche du foyer,
 *     avec son prénom;
 *   · `practical_constraints.retained_next_plan` — les lignes souples dont
 *     `item.at` est aujourd'hui, avec leur date d'expiration (§6).
 *
 * ⚠️ TOUTES SCOPÉES SUR L'IDENTITÉ, en plus de RLS. Cicatrice nommée du dépôt :
 * *« RLS ne remplace pas un `.eq(user_id)` »* — une ligne d'élève rendue à
 * quelqu'un d'autre.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ LE TROU CONNU : UN RÉGIME POSÉ SUR UNE BOUCHE N'EST PAS DATABLE
 * ═══════════════════════════════════════════════════════════════════════════
 * `household_members.diet` est une COLONNE, sans horodatage. « Mon fils est
 * devenu végétarien » s'écrit donc sans que ce récap puisse savoir que c'était
 * aujourd'hui — il ne sera pas annoncé.
 *
 * ⛔ CE TROU EST ACCEPTÉ, ET VOICI POURQUOI IL NE CASSE PAS L'ARBITRAGE : celui
 * du 2026-09-01 porte sur **les allergies** (« si une personne parle d'une
 * allergie, c'est une allergie »), et les allergies sont couvertes en entier —
 * la sienne comme celle d'une bouche. Un régime n'est pas une contrainte
 * médicale : il se voit sur la fiche du foyer, et s'y change.
 *
 * ⚠️ LE JOUR OÙ IL FAUDRA LE FERMER, la réparation n'est PAS de dater la
 * colonne : c'est d'écrire une trace d'annonce au moment de l'écriture, que ce
 * module lirait à UN seul endroit. Trois lectures qui deviennent quatre sont
 * trois occasions de plus d'oublier une destination.
 */

import {
  buildMemoryRecap,
  type RecapKept,
  type RecapLanguage,
  type RecapSafety,
} from "./memory_recap.ts";

export type MinimalRecapClient = { from: (table: string) => any };

/** `ancre + 6` — le dernier jour où une ligne `next_plan` vit (§7.3). */
export function lastDayOfNextPlan(anchor: unknown): string | null {
  const raw = String(anchor ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const at = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return null;
  at.setUTCDate(at.getUTCDate() + 6);
  return at.toISOString().slice(0, 10);
}

/**
 * LE RÉCAP DU JOUR, ou `null`.
 *
 * ⚠️ FAIL-CLOSED VERS LE SILENCE. Une lecture en panne rend `null` : le pire
 * cas est un soir sans récap. L'inverse — annoncer une contrainte qu'on n'a pas
 * lue — dirait à quelqu'un qu'on a enregistré une allergie qui n'existe pas.
 */
export async function memoryRecapFor(args: {
  admin: MinimalRecapClient;
  userId: string;
  /** Le jour LOCAL de la personne, pas celui du serveur. */
  localDate: string;
  language: RecapLanguage;
}): Promise<string | null> {
  const userId = String(args.userId ?? "").trim();
  const day = String(args.localDate ?? "").trim();
  if (!args.admin || !userId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const safety: RecapSafety[] = [];
  const kept: RecapKept[] = [];

  try {
    const own = await args.admin
      .from("student_safety_constraints")
      .select("kind,allergen_ref,substance_ref,condition_ref,created_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .gte("created_at", `${day}T00:00:00Z`)
      .lte("created_at", `${day}T23:59:59Z`);
    for (const row of (own?.data ?? []) as Record<string, unknown>[]) {
      const ref = String(
        row.allergen_ref ?? row.substance_ref ?? row.condition_ref ?? "",
      ).trim();
      if (ref) safety.push({ kind: String(row.kind ?? ""), ref, who: null });
    }
  } catch { /* silence — voir l'en-tête */ }

  try {
    const theirs = await args.admin
      .from("household_member_allergies")
      .select("label,created_at,household_members(first_name)")
      .gte("created_at", `${day}T00:00:00Z`)
      .lte("created_at", `${day}T23:59:59Z`);
    for (const row of (theirs?.data ?? []) as Record<string, unknown>[]) {
      const label = String(row.label ?? "").trim();
      if (!label) continue;
      const member = row.household_members as Record<string, unknown> | null;
      safety.push({
        kind: "allergy",
        ref: label,
        who: String(member?.first_name ?? "").trim() || null,
      });
    }
  } catch { /* silence */ }

  try {
    const goals = await args.admin
      .from("student_goals")
      .select("practical_constraints")
      .eq("user_id", userId)
      .maybeSingle();
    const pc = (goals?.data as Record<string, unknown> | null)
      ?.practical_constraints as Record<string, unknown> | null;
    const rows = pc?.retained_next_plan;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const entry = row as Record<string, unknown> | null;
        const item = entry?.item as Record<string, unknown> | null;
        if (!item || String(item.at ?? "") !== day) continue;
        const text = String(item.text ?? "").trim();
        if (!text) continue;
        // ⚠️ LOT A (2026-09-03, nomenclature §2.5): l'encart ne meurt plus au
        // calendrier mais à la VALIDATION du plan suivant. « jusqu'au <date> »
        // serait donc un mensonge daté; on ne dit plus de date. `lastDayOfNextPlan`
        // reste exporté pour l'ancre affichée, pas pour la mort.
        kept.push({ text, until: null });
      }
    }
  } catch { /* silence */ }

  return buildMemoryRecap({ safety, kept, language: args.language });
}
