/**
 * A8.0 (2026-09-03) — L'AUDIENCE DU MESSAGE DU SOIR: les élèves, PUIS les
 * profils réclamés.
 *
 * ── LE DÉFAUT QUE CE MODULE FERME ─────────────────────────────────────────
 * `keel-daily-pulse-v1` balayait `profiles where keel_role = 'student'`. Un
 * profil RÉCLAMÉ de foyer (FF-048) porte `keel_role = NULL` — exprès, R14: ce
 * rôle décrit une relation avec un coach qui n'existe pas. Conséquence: le
 * membre n'était JAMAIS dans l'audience. La bifurcation maître/membre de la
 * bande du soir (`respondsForHousehold`, `masterOnly`) était armée, testée, et
 * jamais atteinte — un lecteur sans écrivain, la cicatrice n°1 du dépôt.
 *
 * ── CE QU'ON NE FAIT PAS ──────────────────────────────────────────────────
 *   · On n'écrit PAS `keel_role = 'student'` sur un membre (FF-048 R14,
 *     `KeelHouseholdRoute.tsx`). L'audience s'élargit, le rôle ne ment pas.
 *   · On ne filtre JAMAIS la seconde audience sur `keel_role`: sa définition
 *     est `household_members.role = 'member' and user_id is not null`, et
 *     rien d'autre. Un `.eq("keel_role", …)` ici referait le défaut.
 *
 * ── L'ORDRE EST LE PRODUIT (FF-061 §11) ───────────────────────────────────
 * Les maîtres passent AVANT les membres dans le même tick: la cuisson ratée
 * que le maître déclare à 20h05 doit amputer la bande ③ du conjoint servie à
 * 20h06 (`loadSkippedDishIndexes` lit les états sous le compte qui a écrit le
 * plan). Le tick est horaire et la fenêtre fait deux heures: l'ordre ne
 * garantit pas que le maître a RÉPONDU, il garantit qu'on l'a interrogé en
 * premier.
 *
 * ── LE CURSEUR PORTE SA PHASE ─────────────────────────────────────────────
 * `after_user_id` seul ne suffit plus: un identifiant ne dit pas dans quelle
 * audience on s'est arrêté. Le compte-rendu rend `next_audience` avec
 * `next_after_user_id`, et l'appelant repasse les deux.
 */

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

export type PulseAudience = "students" | "members";

/** L'ordre de service d'un tick complet. Les maîtres d'abord. */
export const PULSE_AUDIENCES: readonly PulseAudience[] = ["students", "members"];

export function parsePulseAudience(value: unknown): PulseAudience {
  return String(value ?? "").trim() === "members" ? "members" : "students";
}

/** Les phases qu'il reste à servir à partir de celle où l'on reprend. */
export function audiencesFrom(start: PulseAudience): readonly PulseAudience[] {
  const at = PULSE_AUDIENCES.indexOf(start);
  return PULSE_AUDIENCES.slice(at < 0 ? 0 : at);
}

/** Les colonnes que la boucle du soir lit sur un profil. Une seule liste. */
export const AUDIENCE_PROFILE_COLUMNS =
  "id, timezone, proactive_muted_at, full_name, locale, birth_date";

export interface AudienceProfile {
  id: string;
  timezone: unknown;
  proactive_muted_at: unknown;
  full_name: unknown;
  locale: unknown;
  birth_date: unknown;
}

export interface AudiencePage {
  /** Les profils à servir, triés par `id`. */
  rows: AudienceProfile[];
  /**
   * Le dernier identifiant PARCOURU sur cette page — pas le dernier servi. Sur
   * l'audience des membres, une ligne peut être parcourue puis écartée (elle
   * est aussi un élève, déjà servi en première phase); le curseur doit quand
   * même avancer, sinon la page se relit à l'infini. `null` = plus rien dans
   * cette audience.
   */
  cursorEnd: string | null;
  /**
   * Membres écartés parce que leur profil porte AUSSI `keel_role = 'student'`:
   * ils ont été servis en première phase, et `wasPulseSentToday` les aurait
   * de toute façon arrêtés. Compté, parce qu'un 0 permanent sur une base où
   * un élève rejoint un foyer serait un branchement qu'on ne regarde pas.
   */
  skippedAlreadyStudent: number;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Une page d'audience, dans l'ordre des identifiants.
 *
 * `students`: le balayage d'origine, inchangé — `profiles` filtré sur le rôle.
 * `members`: `household_members` d'abord (le fait d'appartenance), puis les
 * profils de ces comptes pour lire fuseau, langue et date de naissance. Deux
 * lectures et pas une jointure: la première est celle qui DÉFINIT l'audience,
 * la seconde ne fait que l'habiller.
 */
export async function loadAudiencePage(
  db: Db,
  args: { audience: PulseAudience; afterUserId: string; page: number },
): Promise<AudiencePage> {
  const after = str(args.afterUserId);
  const page = Math.max(1, Math.floor(args.page));

  if (args.audience === "students") {
    let q = db
      .from("profiles")
      .select(AUDIENCE_PROFILE_COLUMNS)
      .eq("keel_role", "student")
      .order("id", { ascending: true })
      .limit(page);
    if (after) q = q.gt("id", after);
    const { data, error } = await q;
    if (error) throw error;
    const rows = ((data ?? []) as AudienceProfile[]).filter((r) => str(r?.id));
    return {
      rows,
      cursorEnd: rows.length > 0 ? str(rows[rows.length - 1].id) : null,
      skippedAlreadyStudent: 0,
    };
  }

  // ── LES PROFILS RÉCLAMÉS ─────────────────────────────────────────────────
  // `user_id is not null` EST la définition de « réclamé » (FF-048 R1: la ligne
  // existe avant le compte). `role = 'member'` écarte le maître, qui a
  // `keel_role = 'student'` par ses propres portes et a été servi en première
  // phase.
  let members = db
    .from("household_members")
    .select("user_id")
    .eq("role", "member")
    .not("user_id", "is", null)
    .order("user_id", { ascending: true })
    .limit(page);
  if (after) members = members.gt("user_id", after);
  const membership = await members;
  if (membership.error) throw membership.error;
  const ids = ((membership.data ?? []) as Array<{ user_id?: unknown }>)
    .map((r) => str(r?.user_id))
    .filter(Boolean);
  if (ids.length === 0) return { rows: [], cursorEnd: null, skippedAlreadyStudent: 0 };

  // ⛔ AUCUN `.eq("keel_role", …)` ICI. On lit le rôle pour ÉCARTER ceux qui
  // sont aussi élèves (déjà servis), jamais pour définir l'audience.
  const { data, error } = await db
    .from("profiles")
    .select(`${AUDIENCE_PROFILE_COLUMNS}, keel_role`)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map<string, AudienceProfile & { keel_role?: unknown }>();
  for (const row of (data ?? []) as Array<AudienceProfile & { keel_role?: unknown }>) {
    const id = str(row?.id);
    if (id) byId.set(id, row);
  }
  const rows: AudienceProfile[] = [];
  let skippedAlreadyStudent = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    if (str(row.keel_role) === "student") {
      skippedAlreadyStudent++;
      continue;
    }
    const { keel_role: _role, ...profile } = row;
    rows.push(profile);
  }
  return { rows, cursorEnd: ids[ids.length - 1], skippedAlreadyStudent };
}
