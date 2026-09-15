// KEEL — le SIÈGE d'un élève, vu par son coach: décisions pures d'un côté,
// appels de l'autre.
//
// Même partage que `freeSignup.ts`: ce qui se décide sans réseau se décide ici
// et se teste ici. Et la décision qui compte tient en une fonction —
// `seatDisplayState` —, parce que c'est la seule chose de ce chantier qu'un
// test peut attraper avant un coach.
//
// POURQUOI ELLE MÉRITE UN TEST: un siège programmé pour la fin du mois est
// ENCORE `status='active'` en base. Rendre l'état à partir du seul `status`
// afficherait donc « actif » à un coach qui vient de cliquer « Désactiver », et
// lui laisserait croire que son clic n'a rien fait — il recliquerait. L'état
// visible est une fonction de TROIS entrées (statut, date programmée, main-
// tenant), et aucune des trois n'est facultative.

import { formatDateLong } from "../i18n/format";
import { supabase } from "../../lib/supabase";

/** Les états de `coach_clients.status` que la base autorise. */
export type CoachClientStatus = "invited" | "active" | "paused" | "ended";

/**
 * L'état tel que le coach doit le LIRE — qui n'est pas `status`.
 *
 *   active  — siège vivant et facturé, rien de programmé
 *   ending  — vivant et facturé, mais s'éteint à la date rendue
 *   paused  — éteint; l'élève n'a plus accès, le siège n'est plus facturé
 *   other   — invité ou terminé: aucun bouton n'a de sens ici
 */
export type SeatDisplayState = "active" | "ending" | "paused" | "other";

/** Sur quel article Stripe ce siège est compté (migration 20260806190000). */
export type SeatInterval = "month" | "year";

export interface SeatRow {
  status: CoachClientStatus;
  scheduled_end_at: string | null;
  billing_interval: SeatInterval | null;
}

/**
 * PURE. Tout ce qui n'est pas explicitement `'year'` est mensuel — y compris
 * `null` et une valeur inconnue. Même défaut que `countSeats` côté serveur, et
 * pour la même raison: le mensuel est le tarif le plus cher et le moins
 * engageant, donc l'erreur de ce côté-là n'enferme personne douze mois.
 */
export function seatInterval(row: SeatRow | null): SeatInterval {
  return row?.billing_interval === "year" ? "year" : "month";
}

/**
 * PURE, et SANS HORLOGE — délibérément.
 *
 * ⚠️ UNE DATE PROGRAMMÉE DÉJÀ ÉCHUE NE REND PAS `paused`. Le balayeur horaire
 * n'est pas encore passé, donc la base dit toujours `active` et Stripe facture
 * toujours: afficher « éteint » ici mentirait sur la facture. L'état visible
 * suit ce qui est VRAI en base, jamais ce qui devrait l'être.
 *
 * C'est pour ça que cette fonction ne prend pas `now`: comparer la date à
 * l'heure courante ne changerait aucune sortie. Un paramètre qui ne décide rien
 * fait croire à une garde qui n'existe pas.
 */
export function seatDisplayState(row: SeatRow | null): SeatDisplayState {
  if (!row) return "other";
  if (row.status === "paused") return "paused";
  if (row.status !== "active") return "other";
  return row.scheduled_end_at ? "ending" : "active";
}

/**
 * La date d'extinction, formatée pour le coach, ou `null` s'il n'y en a pas.
 * La locale vient de `i18n/format.ts`, pas d'un `en-GB` écrit ici (R3).
 */
export function formatSeatEndDate(value: string | null): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  // La borne est le PREMIER instant du mois suivant. Le coach doit lire le
  // DERNIER jour couvert, pas le premier jour découvert: sinon « désactivé le
  // 1er septembre » se lit comme « il a encore septembre ».
  const lastCovered = new Date(at.getTime() - 24 * 60 * 60 * 1000);
  return formatDateLong(lastCovered);
}

export interface SeatActionResult {
  ok: boolean;
  reason: string;
  effective_at?: string;
}

async function callSeatRpc(
  fn: string,
  studentId: string,
): Promise<SeatActionResult> {
  const { data, error } = await supabase.rpc(fn, {
    p_student_user_id: studentId,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Partial<SeatActionResult>;
  return {
    ok: Boolean(row.ok),
    reason: String(row.reason ?? "unknown"),
    effective_at: typeof row.effective_at === "string" ? row.effective_at : undefined,
  };
}

/** Lit le siège de cet élève sous le JWT du coach (policy `coach_clients_coach_select`). */
export async function loadSeat(studentId: string): Promise<SeatRow | null> {
  const { data, error } = await supabase
    .from("coach_clients")
    .select("status, scheduled_end_at, billing_interval")
    .eq("student_user_id", studentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SeatRow | null) ?? null;
}

/**
 * Bascule le siège entre mensuel et annuel.
 *
 * ⚠️ NE FACTURE NI NE REMBOURSE RIEN SUR LE MOMENT. Ça dit sur quel article le
 * siège sera compté à la prochaine réconciliation — `stripe-reconcile-seats`
 * tourne en `proration_behavior=none`. Le coach décide de son offre; nous
 * comptons.
 */
export async function setSeatInterval(
  studentId: string,
  interval: SeatInterval,
): Promise<SeatActionResult> {
  const { data, error } = await supabase.rpc("keel_coach_set_seat_interval", {
    p_student_user_id: studentId,
    p_interval: interval,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Partial<SeatActionResult>;
  return { ok: Boolean(row.ok), reason: String(row.reason ?? "unknown") };
}

export function scheduleSeatEnd(studentId: string): Promise<SeatActionResult> {
  return callSeatRpc("keel_coach_schedule_client_end", studentId);
}

export function cancelSeatEnd(studentId: string): Promise<SeatActionResult> {
  return callSeatRpc("keel_coach_cancel_client_end", studentId);
}

export function reactivateSeat(studentId: string): Promise<SeatActionResult> {
  return callSeatRpc("keel_coach_reactivate_client", studentId);
}
