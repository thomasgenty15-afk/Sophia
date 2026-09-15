/**
 * D11 — LE PLAFOND DE FUSIONS, CÔTÉ PRODUIT. PUR.
 *
 * Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md, D11,
 * lot L7. Autorité TECHNIQUE: la migration `20260812170000_household_merge_quota`.
 *
 * ── CE MODULE NE COMPTE RIEN, ET C'EST TOUTE SA DÉFINITION ───────────────
 * Il ne connaît ni le `N` (les comptes actifs du foyer), ni le `+ 3`, ni le
 * lundi de la semaine. Ces trois nombres vivent en base
 * (`keel_household_active_accounts`, `keel_household_merge_quota_slack`,
 * `keel_iso_week_start`), et pour une raison qui n'est pas de la discipline:
 * un plafond que le client calcule est un plafond qu'on contourne en changeant
 * une ligne de JSON. Ce fichier RELIT ce que la base a décidé, et il en fait
 * une phrase.
 *
 * ⚠️ SI VOUS VENEZ ICI POUR AJOUTER `MERGE_QUOTA_SLACK = 3`, ARRÊTEZ-VOUS.
 * La constante n'existe pas en TypeScript exprès, et un test le tient. Le jour
 * où elle existe, il y a deux plafonds: celui qui mord et celui qui s'affiche.
 *
 * ── POURQUOI UN MODULE PLUTÔT QUE TROIS LIGNES DANS LE GÉNÉRATEUR ────────
 * Trois appelants doivent dire le MÊME mot: le générateur (qui refuse), le
 * lecteur de propositions (qui ne propose pas un bouton que le quota refusera)
 * et le module de propositions (qui nomme le `skipped`). Le mot est
 * `merge_quota_exhausted`, et il est écrit une fois.
 */

/**
 * LE MOTIF, MOT POUR MOT DU REGISTRE (D11). C'est le nom du refus HTTP du
 * générateur ET la raison `skipped` du lecteur: les deux parlent du même fait,
 * et deux orthographes en feraient deux faits pour qui lit des journaux.
 */
export const MERGE_QUOTA_EXHAUSTED = "merge_quota_exhausted";

/**
 * L'état du plafond pour un foyer, une semaine ISO — tel que la base le rend.
 *
 * `remaining` N'EST PAS RECALCULÉ ICI (`limit - used` serait une seconde
 * arithmétique pour un nombre que la base a déjà donné). Il est relu.
 */
export interface MergeQuotaState {
  /** Le lundi ISO, `YYYY-MM-DD`, dans le JOUR LOCAL du maître. */
  weekStart: string;
  /** Les fusions déjà réclamées cette semaine-là. */
  used: number;
  /** `N + 3`, N = comptes actifs du foyer. */
  limit: number;
  remaining: number;
  /** Le lundi suivant: quand la semaine repart. */
  resetsOn: string;
  exhausted: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asCount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asDate(value: unknown): string | null {
  const s = String(value ?? "").trim();
  return DATE.test(s) ? s : null;
}

/**
 * Relire ce que `keel_household_merge_quota_state` a rendu.
 *
 * ⚠️ REND `null` PLUTÔT QU'UN ÉTAT PAR DÉFAUT, et c'est la moitié du travail.
 * Un repli sur `{used: 0, exhausted: false}` serait un plafond désarmé qui
 * ressemble trait pour trait à un plafond qui ne mord pas encore. `null` dit
 * « je ne sais pas », et l'appelant décide — le générateur laisse passer (la
 * VRAIE garde est le prédicat de la réclamation, pas cette lecture), le lecteur
 * propose et le dit dans ses `issues`.
 *
 * Un état AMPUTÉ est illisible, pas réparé: il manque `limit` ⇒ `null`. Deviner
 * un plafond serait inventer le nombre que ce lot existe pour ne pas inventer.
 */
export function parseMergeQuota(raw: unknown): MergeQuotaState | null {
  const r = asRecord(raw);
  if (!r) return null;
  if (r.ok !== true) return null;
  const weekStart = asDate(r.week_start);
  const resetsOn = asDate(r.resets_on);
  const used = asCount(r.used);
  const limit = asCount(r.limit);
  const remaining = asCount(r.remaining);
  if (
    weekStart === null || resetsOn === null || used === null ||
    limit === null || remaining === null
  ) {
    return null;
  }
  return {
    weekStart,
    used,
    limit,
    remaining,
    resetsOn,
    // LU, PAS DÉDUIT, quand la base l'a dit. `keel_household_merge_quota_state`
    // rend `exhausted`; la réclamation, elle, ne rend que son refus — d'où le
    // repli sur `used >= limit`, qui est la même règle et pas une seconde.
    exhausted: typeof r.exhausted === "boolean" ? r.exhausted : used >= limit,
  };
}

/**
 * LA PHRASE DU REFUS — sur le patron EXACT de `household_frozen` (L1).
 *
 * Trois choses, et aucune n'est décorative:
 *   · ce qui a été consommé, en toutes lettres, sinon « trop de fusions » ne se
 *     distingue pas d'une panne;
 *   · RIEN N'EST EFFACÉ. Un plafond touché ressemble à une perte de données à
 *     qui vient de cliquer, et le plan du foyer comme les plans personnels sont
 *     intacts — la fusion n'a même pas commencé;
 *   · QUAND ÇA REPART. Une limite sans date de sortie est une limite dont on
 *     ouvre un ticket.
 *
 * ⚠️ EN ANGLAIS, comme tout ce qui sort du serveur ici. La traduction est une
 * affaire d'écran (`frontend/src/keel/i18n`).
 */
export function mergeQuotaRefusalDetail(state: MergeQuotaState | null): string {
  const head = state === null
    ? "This household has used all its merges for the week."
    : `This household has used its ${state.used} merges for this week ` +
      `(limit ${state.limit}).`;
  const tail = state === null
    ? "Merging resumes on Monday."
    : `Merging resumes on ${state.resetsOn}.`;
  return `${head} Nothing has been deleted - every plan stays exactly as it ` +
    `is, and no merge was started. ${tail}`;
}
