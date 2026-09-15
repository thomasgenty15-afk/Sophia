import { supabase } from "../../lib/supabase";
import { EATING_OCCASIONS, type EatingOccasion } from "./mealGeneration";

/**
 * COMBIEN DE MOMENTS CETTE JOURNÉE DOIT PORTER — lu au serveur, jamais calculé
 * ici.
 *
 * Autorité produit: `docs/fonctionnalites/composition-des-repas/FF-060-...md`
 *
 * ── ⛔ AUCUNE FORMULE D'ÉNERGIE DANS CE FICHIER, NI AILLEURS DANS LE FRONT ─
 * Le jour où l'écran calculerait sa propre maintenance, l'écran et le plan
 * diraient deux choses différentes au premier arbitrage changé — et le
 * désaccord serait INVISIBLE, parce que chacun aurait raison chez lui. Le même
 * module pur (`_shared/keel/eating_structure.ts`) sert le générateur et cette
 * réponse. C'est la garantie, pas une commodité.
 *
 * ── ET AUCUN KCAL NE TRAVERSE ────────────────────────────────────────────
 * La réponse porte des jetons de moment et un compte. Un nombre de repas est
 * une STRUCTURE, pas une mesure de quelqu'un: il ne passe donc par aucune des
 * quatre portes de l'énergie, et n'entre pas dans l'inventaire clos des clés
 * qui écrivent un kcal.
 */

export const SHAKE_STATES = ["compose", "declared", "not_applicable"] as const;
export type ShakeState = (typeof SHAKE_STATES)[number];

export const STRUCTURE_REASONS = [
  "derived",
  "capped",
  "no_target",
  "no_body",
  /** Le serveur n'a pas répondu. **Fermé = aucun verrou**, jamais un verrou deviné. */
  "unavailable",
] as const;
export type StructureReason = (typeof STRUCTURE_REASONS)[number];

export interface EatingStructure {
  requiredCount: number | null;
  slots: EatingOccasion[];
  /** Ce que la dérivation a AJOUTÉ. C'est exactement ce qui se verrouille. */
  opened: EatingOccasion[];
  shake: ShakeState;
  reason: StructureReason;
}

/**
 * LE SUJET — une fiche en cours de saisie, ou une ligne existante.
 *
 * ⚠️ LE BROUILLON EST LE CAS PRINCIPAL. Au moment où quelqu'un remplit sa
 * fiche, rien n'est en base: n'accepter qu'un `memberId` rendrait le verrou
 * visible seulement au RETOUR sur la fiche, donc trop tard pour expliquer ce
 * qui vient d'être décidé.
 */
export type StructureSubject =
  | {
    kind: "draft";
    weightKg: number | null;
    heightCm: number | null;
    gender: string | null;
    ageYears: number | null;
    activityLevel: string | null;
    dayActivity: string | null;
    sportFrequency: string | null;
    goal: string | null;
    paceKgPerWeek: number | null;
    declaredSlots: readonly string[];
    hasFixedIntake: boolean;
  }
  | { kind: "member"; memberId: string };

/**
 * FERMÉ — et « fermé » veut dire AUCUN VERROU, jamais un verrou supposé.
 *
 * ⚠️ LA DIRECTION D'ÉCHEC EST CHOISIE. Une panne ne doit pas cocher-désactiver
 * une case: quelqu'un se retrouverait avec un moment qu'il ne peut pas retirer
 * et dont personne ne peut expliquer la présence. On perd l'explication, jamais
 * la main.
 */
function closed(reason: StructureReason = "unavailable"): EatingStructure {
  return {
    requiredCount: null,
    slots: [],
    opened: [],
    shake: "not_applicable",
    reason,
  };
}

function readSlots(raw: unknown): EatingOccasion[] {
  if (!Array.isArray(raw)) return [];
  const known = EATING_OCCASIONS as readonly string[];
  return raw
    .map((s) => String(s ?? ""))
    .filter((s): s is EatingOccasion => known.includes(s));
}

export async function loadEatingStructure(
  subject: StructureSubject,
): Promise<EatingStructure> {
  const body = subject.kind === "member"
    ? { member_id: subject.memberId }
    : {
      body: {
        weight_kg: subject.weightKg,
        height_cm: subject.heightCm,
        gender: subject.gender,
        age_years: subject.ageYears,
        activity_level: subject.activityLevel,
        day_activity: subject.dayActivity,
        sport_frequency: subject.sportFrequency,
      },
      goal: subject.goal,
      pace_kg_per_week: subject.paceKgPerWeek,
      declared_slots: subject.declaredSlots,
      has_fixed_intake: subject.hasFixedIntake,
    };

  const { data, error } = await supabase.functions.invoke(
    "eating-structure-v1",
    { body },
  );
  if (error) return closed();

  const row = (data ?? {}) as Record<string, unknown>;
  const reason = String(row.reason ?? "");
  const known = (STRUCTURE_REASONS as readonly string[]).includes(reason)
    ? (reason as StructureReason)
    : "unavailable";
  if (known === "unavailable") return closed();

  const count = Number(row.required_count);
  const shake = String(row.shake ?? "");
  return {
    requiredCount: Number.isFinite(count) && count > 0 ? count : null,
    slots: readSlots(row.slots),
    opened: readSlots(row.opened),
    shake: (SHAKE_STATES as readonly string[]).includes(shake)
      ? (shake as ShakeState)
      : "not_applicable",
    reason: known,
  };
}
