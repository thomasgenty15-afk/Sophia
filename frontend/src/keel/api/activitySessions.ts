/**
 * KEEL — LES SÉANCES D'ACTIVITÉ DE L'ÉLÈVE : les lire, en écrire une, la retirer.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LE CONSOMMATEUR VIVANT DE `student_activity_sessions`, ET POURQUOI C'EST ICI
 * ═══════════════════════════════════════════════════════════════════════════
 * Le lot L2 a posé la table (migration `20260818180000`) et a branché son seul
 * lecteur sur le BILAN HEBDOMADAIRE (`_shared/keel/week_review_io.ts`). C'était
 * une erreur de PLAN, pas d'implémentation:
 *
 *   · `docs/keel/RETRAIT-POINT-DU-DIMANCHE.md`, décision produit du 2026-08-10:
 *     « le point du dimanche est supprimé », et dans ses arbitrages du même jour
 *     (§3.c) « le bilan hebdo part aussi ». La décision est prise; le code ne
 *     l'a pas encore suivie (document en état 🔵, bloqué par FF-031).
 *   · Le cron `keel-weekly-flow`, SEUL appelant de `computeAndStoreWeekReview`,
 *     comptait 270 exécutions et 270 échecs. Il est désactivé en local depuis le
 *     2026-08-18.
 *
 * La séance était donc câblée dans une table condamnée, derrière un déclencheur
 * qui n'a jamais tiré. Décision du propriétaire du 2026-08-18: **le consommateur
 * vivant est `/app/progress`** — le domaine `suivi-quotidien`, là où vivent déjà
 * les observations datées qu'une personne fait d'elle-même (FF-031,
 * `student_body_measures`). Une séance est le même genre d'objet.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ AUCUNE ÉNERGIE SUR CE CHEMIN, ET LA RAISON EST CHIFFRÉE
 * ═══════════════════════════════════════════════════════════════════════════
 * On affiche LE FAIT (« 3 séances »), jamais son dérivé. Le déficit visé est de
 * 400-500 kcal/jour; l'erreur d'une dépense d'exercice DÉCLARÉE est de ±30-50 %,
 * soit 150-250 kcal sur une séance annoncée à 500. La soustraire AUGMENTE donc
 * l'incertitude de la journée. Le raisonnement complet est en tête de
 * `20260818180000_a_session_is_a_fact_not_an_energy.sql` et de
 * `_shared/keel/activity_session.ts`; il n'est pas recopié ici, il est APPLIQUÉ:
 * ce module ne rend aucun nombre qui ne soit un compte de séances, de jours ou
 * de minutes déclarées.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LES DEUX CEINTURES DE CE FICHIER, ET ELLES SONT DES CICATRICES DU DÉPÔT
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. **RLS NE REMPLACE PAS UN `.eq("user_id", …)`.** Les policies de la table
 *    sont propriétaire-seul, et le lecteur porte QUAND MÊME son filtre. Ce dépôt
 *    a déjà rendu la ligne d'un élève à un coach par cet oubli.
 * 2. **TOUTE ÉCRITURE FAIT `.select(...)` ET JETTE SUR ZÉRO LIGNE.** PostgREST
 *    rend 204 sur une écriture qui ne touche rien, et l'écran dirait
 *    « enregistré ». Les deux modèles copiés sont `saveOwnProfile`
 *    (`onboarding.ts`) et `untickMeal` (`mealTicks.ts`).
 *
 * ⚠️ IL N'Y A PAS D'`update` ICI, ET C'EST LA BASE QUI LE DIT: la migration
 * n'accorde à `authenticated` que `select, insert, delete`. Une séance mal
 * saisie se RETIRE et se re-logue — c'est écrit dans la migration, et c'est
 * pour ça que `deleteActivitySession` existe plutôt qu'un formulaire d'édition.
 */

import { supabase } from "../../lib/supabase";
import {
  ACTIVITY_SESSION_MAX_MINUTES,
  ACTIVITY_SESSION_MIN_MINUTES,
  type ActivityIntensity,
  type ActivitySessionInput,
  type ActivitySessionKind,
  parseActivityIntensity,
  parseActivitySessionKind,
} from "../../../../supabase/functions/_shared/keel/activity_session.ts";

const TABLE = "student_activity_sessions";

/** Les colonnes que l'écran lit. `source` et `created_at` ne servent rien ici. */
const COLUMNS = "id, local_date, kind, duration_min, intensity";

/** Une ligne de `student_activity_sessions`, telle que PostgREST la rend. */
export interface ActivitySessionRow {
  id: string;
  local_date: string;
  /** Jeton brut de la base. Traversé par `parseActivitySessionKind` avant tout usage. */
  kind: string;
  duration_min: number | null;
  intensity: string | null;
}

/**
 * LES SÉANCES DE CET ÉLÈVE SUR LA FENÊTRE AFFICHÉE.
 *
 * ⚠️ `.eq("user_id", …)` EST OBLIGATOIRE ET IL N'EST PAS REDONDANT AVEC RLS.
 * Voir l'en-tête. Les deux bornes sont fermées: un `.gte` seul laisserait entrer
 * une ligne datée dans le futur, qui compterait sans pouvoir s'afficher — le
 * défaut exact que `/app/progress` a payé le 2026-08-05 sur ses autres requêtes.
 */
export async function loadActivitySessions(args: {
  userId: string;
  since: string;
  until: string;
}): Promise<ActivitySessionRow[]> {
  const res = await supabase
    .from(TABLE)
    .select(COLUMNS)
    .eq("user_id", args.userId)
    .gte("local_date", args.since)
    .lte("local_date", args.until)
    .order("local_date", { ascending: true });
  if (res.error) {
    throw new Error(`[keel/activitySessions] load failed: ${res.error.message}`);
  }
  // `as unknown as`: le client navigateur n'a pas de générique `Database`, donc
  // PostgREST type ce `.select(...)` en `GenericStringError[]`. Même traversée
  // que partout ailleurs dans ce dossier.
  return (res.data ?? []) as unknown as ActivitySessionRow[];
}

/**
 * Les lignes, réduites à ce que `summarizeWeekActivity` regarde.
 *
 * ⚠️ LES JETONS PASSENT PAR LES PARSEURS DU MODULE PARTAGÉ, jamais par un `as`.
 * « Un `as` sur un type étranger désarme le typecheck »: `kind` et `intensity`
 * arrivent de la base en `string`, et un jeton inconnu (migration qui aurait
 * élargi la liste sans élargir le module) doit être ÉCARTÉ, pas compté de
 * travers. Les parseurs rendent `null` exprès et ne jettent pas — la raison est
 * écrite chez eux.
 */
export function toSummaryInputs(
  rows: readonly ActivitySessionRow[],
): ActivitySessionInput[] {
  return rows.map((row) => ({
    localDate: String(row.local_date ?? ""),
    kind: parseActivitySessionKind(row.kind),
    durationMin: row.duration_min === null || row.duration_min === undefined
      ? null
      : Number(row.duration_min),
    intensity: parseActivityIntensity(row.intensity),
  }));
}

/**
 * ENREGISTRE UNE SÉANCE. `duration_min` et `intensity` sont FACULTATIFS.
 *
 * ── POURQUOI FACULTATIFS, ET PAS « ON METTRA UNE VALEUR PAR DÉFAUT » ───────
 * Ils sont nullables en base pour cette raison exacte: déclarés, jamais devinés.
 * Une durée inventée entre ensuite dans une somme avec l'autorité d'une mesure,
 * et `WeekActivitySummary.minutesFrom` existe précisément pour dire sur combien
 * de séances la somme a été faite. Écrire `0` ou une valeur « raisonnable » à la
 * place d'une absence détruirait ce dénominateur.
 *
 * ── LES BORNES SONT CELLES DE LA BASE, PAS DES BORNES D'ÉCRAN ─────────────
 * `ACTIVITY_SESSION_MIN/MAX_MINUTES` sont les deux nombres du CHECK SQL
 * (`duration_min >= 1 and duration_min <= 600`). Un écran qui accepterait ce que
 * la base refuse ferait saisir dans le vide, et l'erreur remontée serait un
 * `23514` que personne ne sait lire. Le refus est donc rendu ICI, en clair.
 */
export async function logActivitySession(args: {
  userId: string;
  localDate: string;
  kind: ActivitySessionKind;
  durationMin: number | null;
  intensity: ActivityIntensity | null;
}): Promise<string> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) throw new Error("[keel/activitySessions] missing user id");
  const localDate = String(args.localDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error(`[keel/activitySessions] bad local date "${args.localDate}"`);
  }
  // ⚠️ LE JETON EST RE-TRAVERSÉ, MÊME S'IL EST TYPÉ. Le type ne survit pas à un
  // appelant qui reçoit une valeur d'un `<select>`; le CHECK SQL, lui, refusera
  // — et un refus de contrainte est illisible à l'écran.
  const kind = parseActivitySessionKind(args.kind);
  if (kind === null) {
    throw new Error(`[keel/activitySessions] unknown kind "${args.kind}"`);
  }
  const intensity = args.intensity === null
    ? null
    : parseActivityIntensity(args.intensity);
  if (args.intensity !== null && intensity === null) {
    throw new Error(`[keel/activitySessions] unknown intensity "${args.intensity}"`);
  }
  const durationMin = args.durationMin;
  if (durationMin !== null) {
    if (
      !Number.isInteger(durationMin) ||
      durationMin < ACTIVITY_SESSION_MIN_MINUTES ||
      durationMin > ACTIVITY_SESSION_MAX_MINUTES
    ) {
      throw new Error(
        `[keel/activitySessions] duration ${durationMin} outside ` +
          `${ACTIVITY_SESSION_MIN_MINUTES}-${ACTIVITY_SESSION_MAX_MINUTES} min`,
      );
    }
  }

  const res = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      local_date: localDate,
      kind,
      // `null` PART DANS LE PAYLOAD, exprès et à l'inverse de `saveOwnProfile`:
      // là-bas la colonne portait une réponse antérieure qu'un `null` aurait
      // écrasée; ici la ligne est NEUVE, il n'y a rien à écraser, et omettre la
      // clé donnerait exactement la même chose en moins lisible.
      duration_min: durationMin,
      intensity,
      // D'OÙ VIENT LE GESTE. `app` = cet écran; `chat` est réservé à la
      // conversation. Les deux gestes doivent rester comparables — c'est écrit
      // sur la colonne en base.
      source: "app",
    })
    // ⚠️ LA CEINTURE. Sans `.select(...)`, PostgREST rend 204 et l'écran dirait
    // « enregistré » sur une écriture partie nulle part. Modèles: `saveOwnProfile`
    // (`onboarding.ts`) et `untickMeal` (`mealTicks.ts`).
    .select("id");
  if (res.error) {
    throw new Error(`[keel/activitySessions] log failed: ${res.error.message}`);
  }
  const rows = (res.data ?? []) as unknown as Array<{ id?: unknown }>;
  if (rows.length === 0) {
    throw new Error("[keel/activitySessions] log failed: nothing was saved");
  }
  return String(rows[0]?.id ?? "");
}

/**
 * RETIRE UNE SÉANCE. Une vraie suppression, et c'est le bon geste ici.
 *
 * `protocol_events` est append-only et se DISQUALIFIE parce qu'un fait alimentaire
 * y nourrit la couverture du coach. Une séance n'a pas ce lecteur: la table
 * n'accorde pas `update`, il n'existe aucune colonne de motif, et une ligne fausse
 * qui resterait comptée serait pire qu'une ligne absente. La migration le dit
 * mot pour mot: « une séance mal saisie se retire et se re-logue ».
 *
 * ⚠️ MÊME COUPLE DE CEINTURES: le `.eq("user_id", …)` (RLS ne le remplace pas) et
 * le compte de lignes (un delete qui ne touche rien rend 204).
 */
export async function deleteActivitySession(args: {
  userId: string;
  id: string;
}): Promise<void> {
  const id = String(args.id ?? "").trim();
  if (!id) throw new Error("[keel/activitySessions] missing session id");
  const res = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", args.userId)
    .eq("id", id)
    .select("id");
  if (res.error) {
    throw new Error(`[keel/activitySessions] delete failed: ${res.error.message}`);
  }
  if (((res.data ?? []) as unknown as unknown[]).length === 0) {
    throw new Error("[keel/activitySessions] delete touched 0 rows");
  }
}
