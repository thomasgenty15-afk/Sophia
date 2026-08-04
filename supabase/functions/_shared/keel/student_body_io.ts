/**
 * KEEL — LE CORPS DE L'ÉLÈVE, LU DEPUIS LA BASE.
 *
 * La moitié I/O de `student_age.ts` et du contrat de mesures. Même partage que
 * partout ici: tout ce qui peut être FAUX (SQL, jsonb, unités, lignes en
 * double) vit dans ce fichier; tout ce qui DÉCIDE reste pur et testable sans
 * base.
 *
 * ── CE QUE CE MODULE REFUSE DE FAIRE ───────────────────────────────────────
 * Aucun besoin énergétique, aucune cible de poids, aucun IMC. Le contrat
 * d'affichage (§3.3 du chantier) tient sur une frontière nette: on rend à
 * l'élève ce qu'il a DÉCLARÉ de son corps, on ne calcule rien à partir de sa
 * nourriture, et on ne recatégorise pas ce qu'il a déclaré en jugement. Un IMC
 * n'est pas une mesure de l'élève, c'est un verdict sur lui.
 *
 * ── NOTHING HERE IS BEST-EFFORT ────────────────────────────────────────────
 * Un chargeur qui avale son erreur et rend « pas de mesure » raconte qu'un
 * élève n'a rien saisi alors qu'on a échoué à le lire. Les erreurs remontent.
 */

import { assessBirthDate, type BirthDateVerdict } from "./student_age.ts";
import type { DatedMeasure } from "./student_body.ts";

// deno-lint-ignore no-explicit-any
type Db = { from(table: string): any };

export type { DatedMeasure };

export interface StudentBodySnapshot {
  verdict: BirthDateVerdict;
  timezone: string | null;
  /** Du plus ancien au plus récent. Vide = l'élève n'a jamais saisi de mesure. */
  weights: DatedMeasure[];
  waists: DatedMeasure[];
}

/** Bornes de plausibilité, alignées sur celles du formulaire hebdo. */
const WEIGHT_KG_MIN = 25;
const WEIGHT_KG_MAX = 350;
const WAIST_CM_MIN = 40;
const WAIST_CM_MAX = 200;

/**
 * Lit une mesure d'un `biofeedback`, avec repli documenté.
 *
 * Le repli sur `outcomes.weight_7d_avg` est repris tel quel de
 * `frontend/src/keel/pages/studentProgressWeight.ts`: le chemin 1:1 alimente
 * cette clé-là, le point du dimanche alimente `biofeedback.weight_kg`, et les
 * deux modèles coexistent dans la même table. Lire une seule des deux est
 * exactement le bug écrivain/lecteur qui a laissé la carte poids vide.
 */
function readMeasure(
  row: { biofeedback: unknown; outcomes: unknown },
  key: string,
  fallbackKey: string | null,
  min: number,
  max: number,
): number | null {
  const bio = (row.biofeedback ?? {}) as Record<string, unknown>;
  const primary = Number(bio[key]);
  if (Number.isFinite(primary) && primary >= min && primary <= max) return primary;
  if (fallbackKey) {
    const out = (row.outcomes ?? {}) as Record<string, unknown>;
    const secondary = Number(out[fallbackKey]);
    if (Number.isFinite(secondary) && secondary >= min && secondary <= max) {
      return secondary;
    }
  }
  return null;
}

/**
 * Combien de semaines de bilans on relit pour la tendance.
 *
 * Huit: assez pour qu'une tendance existe, assez peu pour qu'une mesure de
 * février ne soit pas présentée en août comme « la dernière ».
 */
export const BODY_HISTORY_WEEKS = 8;

/**
 * Charge ce qu'on sait du corps de cet élève.
 *
 * @param todayLocalIso la date locale de l'élève. Passée par l'appelant plutôt
 *   que calculée ici, pour que la fonction reste rejouable: deux appels le même
 *   jour doivent rendre le même verdict d'âge, y compris à cheval sur minuit
 *   UTC.
 */
export async function loadStudentBody(
  db: Db,
  userId: string,
  todayLocalIso: string,
): Promise<StudentBodySnapshot> {
  const profileRes = await db
    .from("profiles")
    .select("birth_date, timezone")
    .eq("id", userId)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;
  const profile = (profileRes.data ?? {}) as Record<string, unknown>;

  const reviewsRes = await db
    .from("weekly_reviews")
    .select("week_start_date, biofeedback, outcomes")
    .eq("user_id", userId)
    .order("week_start_date", { ascending: false })
    .limit(BODY_HISTORY_WEEKS);
  if (reviewsRes.error) throw reviewsRes.error;

  const rows = ((reviewsRes.data ?? []) as Array<Record<string, unknown>>)
    // Rendu du plus ancien au plus récent: une tendance se lit dans le sens du
    // temps, et l'appelant ne devrait pas avoir à s'en souvenir.
    .slice()
    .reverse();

  const weights: DatedMeasure[] = [];
  const waists: DatedMeasure[] = [];
  for (const row of rows) {
    const weekStart = String(row.week_start_date ?? "").trim();
    if (!weekStart) continue;
    const typed = { biofeedback: row.biofeedback, outcomes: row.outcomes };
    const w = readMeasure(typed, "weight_kg", "weight_7d_avg", WEIGHT_KG_MIN, WEIGHT_KG_MAX);
    if (w !== null) weights.push({ weekStart, value: w });
    // Pas de repli pour le tour de taille: aucun autre écrivain n'existe, et
    // inventer une clé de repli créerait un lecteur sans écrivain — le défaut
    // exact que le repli du poids documente.
    const c = readMeasure(typed, "waist_cm", null, WAIST_CM_MIN, WAIST_CM_MAX);
    if (c !== null) waists.push({ weekStart, value: c });
  }

  return {
    verdict: assessBirthDate(profile.birth_date, todayLocalIso),
    timezone: String(profile.timezone ?? "").trim() || null,
    weights,
    waists,
  };
}

/** La dernière mesure d'une série, ou `null`. */
export function latest(measures: readonly DatedMeasure[]): DatedMeasure | null {
  return measures.length > 0 ? measures[measures.length - 1] : null;
}

// ---------------------------------------------------------------------------
// L'escalade « mineur » — le coach l'apprend, il n'a pas à la déduire
// ---------------------------------------------------------------------------

export interface MinorEscalation {
  escalated: boolean;
  reason: "raised" | "already_open";
  contractChangeRequestId: string | null;
}

/**
 * Écrit la ligne `contract_change_requests` qu'un mineur détecté doit au coach.
 *
 * Idempotent PAR LIGNE OUVERTE, pas par jour: l'élève va réessayer de générer
 * sa semaine, et trente alertes identiques pour un seul fait ne sont pas trente
 * fois plus d'information — c'est une boîte de réception que le coach cesse de
 * lire. Repris mot pour mot de `escalateRestrictionSignal`, qui a déjà arbitré
 * ça.
 *
 * `raised_by: 'system'`: ni l'élève ni Sophia n'ont demandé cette alerte, c'est
 * une règle du produit qui l'a levée.
 */
export async function escalateMinorStudent(
  db: Db,
  params: { userId: string; age: number },
): Promise<MinorEscalation> {
  const { data: existing, error: existingErr } = await db
    .from("contract_change_requests")
    .select("id")
    .eq("user_id", params.userId)
    .eq("reason_code", "minor_student")
    .eq("status", "open")
    .limit(1);
  if (existingErr) throw existingErr;
  const openRow = ((existing ?? []) as Array<Record<string, unknown>>)[0];
  if (openRow) {
    return {
      escalated: false,
      reason: "already_open",
      contractChangeRequestId: String(openRow.id ?? "") || null,
    };
  }

  const { data, error } = await db
    .from("contract_change_requests")
    .insert({
      user_id: params.userId,
      reason_code: "minor_student",
      raised_by: "system",
      urgency: "immediate",
      status: "open",
      // L'âge, pas la date: le coach a besoin de savoir qu'il accompagne un
      // mineur et de combien, pas de sa date de naissance.
      student_words:
        `This student is ${params.age} — under 18. Plan generation is held ` +
        `until you decide: nutrition coaching for a minor sits inside your ` +
        `professional framework, not ours.`,
    })
    // Vérité d'exécution: la ligne est RELUE, donc l'appelant ne journalise
    // jamais « escaladé » sur un insert qu'il n'a pas vu atterrir.
    .select("id")
    .single();
  if (error) throw error;
  return {
    escalated: true,
    reason: "raised",
    contractChangeRequestId: String((data as Record<string, unknown>)?.id ?? "") || null,
  };
}
