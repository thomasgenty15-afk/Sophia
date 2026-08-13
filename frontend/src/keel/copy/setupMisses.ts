// KEEL — FF-060: ce qui manque encore, dit à quelqu'un plutôt qu'à un log.
//
// Même patron que `planRefusals.ts`, et pour la même raison: un motif brut
// affiché à l'écran (`adult_without_birth_date`) n'apprend rien à personne, et
// chacun appelle un geste différent. La table vit ici plutôt que dans le JSX
// pour qu'un test puisse affirmer les DEUX sens — pas de motif sans phrase, et
// pas de phrase pour un motif que le module ne produit plus.
//
// ⚠️ LA SECONDE MOITIÉ EST CELLE QUI COMPTE. Une étiquette pour un motif qui
// n'existe plus est du texte écrit, relu, traduit — et inatteignable. C'est ce
// qui avait laissé `restriction_flag` vivre des mois à côté du vrai
// `restriction_signal`.

import type { FunnelMissId } from "../api/onboarding";
import type { MessageKey } from "../i18n/t";

/**
 * UN MOTIF, UNE PHRASE. `Record` COMPLET et pas partiel: le compilateur exige
 * une entrée par membre de `FunnelMissId`, donc ajouter un motif sans écrire sa
 * phrase ne compile pas. C'est la seule garde qui tienne quand quelqu'un ajoute
 * une question six mois plus tard.
 */
export const SETUP_MISS_KEYS: Record<FunnelMissId, MessageKey> = {
  household_size: "setup.missing.household_size",

  own_first_name: "setup.missing.own_first_name",
  own_birth_date: "setup.missing.own_birth_date",
  own_height_cm: "setup.missing.own_height_cm",
  own_gender: "setup.missing.own_gender",
  own_weight_kg: "setup.missing.own_weight_kg",
  own_goal: "setup.missing.own_goal",
  own_diet: "setup.missing.own_diet",
  own_allergies: "setup.missing.own_allergies",

  member_first_name: "setup.missing.member_first_name",
  member_birth_date: "setup.missing.member_birth_date",
  member_height_cm: "setup.missing.member_body",
  member_weight_kg: "setup.missing.member_body",
  member_gender: "setup.missing.member_body",
  member_goal: "setup.missing.member_goal",
  member_allergies: "setup.missing.member_allergies",

  eating_rhythm: "setup.missing.eating_rhythm",
  cook_days: "setup.missing.cook_days",
  cooking_time_min: "setup.missing.cooking_time_min",
  budget_band: "setup.missing.budget_band",

  // ── LE DÉFAUT D1, ET SA PHRASE EST LA PLUS IMPORTANTE DE LA TABLE ───────
  // Elle ne dit pas « il manque une date ». Elle dit ce que l'absence COÛTE:
  // une part standard servie à quelqu'un qui a déclaré une direction, sans que
  // rien ne le signale. C'est exactement le silence que ce chantier ferme.
  adult_without_birth_date: "setup.missing.adult_without_birth_date",
  missing_mouths: "setup.missing.missing_mouths",
  too_many_mouths: "setup.missing.too_many_mouths",

  // ── LES `better`: DÉCLARÉES, JAMAIS RENDUES ─────────────────────────────
  // `FunnelMissId` contient tout `FunnelQuestionId`, y compris les questions
  // qui ne sont PAS dans l'entonnoir. `canGenerate` ne les émet jamais — elles
  // ne bloquent rien par construction —, mais le `Record` complet les réclame.
  // Elles pointent sur la phrase de leur étape la plus proche plutôt que sur
  // une phrase inventée: une copie inatteignable est une copie qui ment.
  food_preferences: "setup.missing.own_goal",
  away_days: "setup.missing.member_birth_date",
  situation: "setup.missing.own_goal",
  target_weight_kg: "setup.missing.own_goal",
  recipe_difficulty: "setup.missing.cooking_time_min",
  variety: "setup.missing.cooking_time_min",
  house_rules: "setup.missing.member_allergies",
  medical_constraints: "setup.missing.own_allergies",
};

export function setupMissKey(miss: FunnelMissId): MessageKey {
  return SETUP_MISS_KEYS[miss];
}
