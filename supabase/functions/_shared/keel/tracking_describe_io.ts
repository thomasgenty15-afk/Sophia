// « DÉCRIRE » UN CRÉNEAU LOUPÉ — le chemin TEXTE de la page de suivi (D7.7).
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ CE CHEMIN CONTOURNE `meal_precision.ts`, ET C'EST DÉLIBÉRÉ
// ══════════════════════════════════════════════════════════════════════════
//
// `meal_precision.ts` refuse qu'une question de précision porte une mesure:
// « une question de précision ne demande JAMAIS une quantité », ses gabarits
// sont FERMÉS et un test les passe au crible d'un lexique de quantité dans les
// deux langues. La règle est juste, et elle vaut pour les QUESTIONS.
//
// Ici, on ne pose aucune question. La page ouvre un champ libre sur un créneau
// que la personne a déclaré et que rien n'a rempli. Si elle y écrit « 150 g de
// riz », c'est ELLE qui a mesuré — le produit n'a rien demandé, et refuser de
// lire ce qu'elle écrit serait de la pudeur, pas de la sécurité. D7.7 nomme le
// contournement pour qu'il ne se lise pas comme un oubli.
//
// ══════════════════════════════════════════════════════════════════════════
// CE QUE CE LOT ÉCRIT, ET CE QU'IL N'ÉCRIT PAS
// ══════════════════════════════════════════════════════════════════════════
//
// ÉCRIT: un fait `slot_meal:<date>:<slot>` avec les MOTS de la personne
// (`student_note`) et le groupe alimentaire que le plancher déterministe a
// reconnu. Le créneau cesse d'être « loupé »: la page ne le lui redemande plus.
//
// N'ÉCRIT PAS: un chiffre d'énergie. Le produire demanderait le chemin modèle
// de `analyze-meal-photo-v1`, et **un chiffre d'énergie ne se stocke jamais**
// (FF-059 R5) — il se recalcule. Tant que ce chemin n'existe pas, le repère de
// répartition (`slot_estimate`) tient sa place, et il DIT que c'en est un.
//
// ⚠️ ET C'EST POUR ÇA QUE LE REPÈRE SURVIT À LA DÉCLARATION. Si décrire son
// repas faisait disparaître le repère, le total du jour BAISSERAIT quand on
// déclare — le produit apprendrait à ses utilisateurs à se taire. Voir
// `TrackingMissedSlot.declared` dans `tracking_window.ts`.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { loadEnergyGate } from "./energy_gate_io.ts";
import { detectDeclaredMeal } from "./meal_declaration_floor.ts";
import { slotMealFactKey } from "./slot_meal_io.ts";
import { EATING_OCCASIONS, type EatingOccasion } from "./meal_generation.ts";

type Db = SupabaseClient;

/** La longueur au-delà de laquelle ce n'est plus une description mais un collage. */
export const DESCRIBE_MAX_CHARS = 600;

/**
 * Jusqu'où on peut remonter pour décrire. Au-delà, la personne ne se souvient
 * plus de ce qu'elle a mangé, et un fait daté d'il y a un mois pèse dans la
 * couverture que son coach lit comme s'il était frais.
 */
export const DESCRIBE_MAX_BACKFILL_DAYS = 14;

/** Les refus NOMMÉS. Un jeton, jamais une phrase — la phrase vit dans le pack. */
export const DESCRIBE_REFUSALS = [
  "bad_slot",
  "bad_date",
  "future_date",
  "too_old",
  "empty_text",
  "text_too_long",
  "not_a_meal",
  "already_declared",
] as const;
export type DescribeRefusal = (typeof DESCRIBE_REFUSALS)[number];

export interface DescribeOutcome {
  ok: boolean;
  reason: DescribeRefusal | null;
  /**
   * ⛔ TOUJOURS `null` DANS CE LOT, et le champ existe quand même: le contrat
   * avec l'écran est qu'un chiffre, s'il arrive un jour, arrivera AVEC sa base.
   * Un champ ajouté plus tard aurait laissé le premier appelant écrire un
   * nombre nu.
   */
  energy: { kcal: number; basis: string } | null;
}

function refuse(reason: DescribeRefusal): DescribeOutcome {
  return { ok: false, reason, energy: null };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000;
}

/**
 * ⚠️ `admin` est un client `service_role`, et `userId` vient du JWT. Toutes les
 * écritures portent leur `user_id` en clair: RLS ne s'applique pas ici, et une
 * écriture sans propriétaire explicite est le même défaut qu'une lecture sans
 * `.eq("user_id")`, vu de l'autre côté.
 */
export async function describeMissedSlot(
  admin: Db,
  args: { userId: string; localDate: string; slot: string; text: string },
): Promise<DescribeOutcome> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return refuse("bad_date");

  const slot = String(args.slot ?? "").trim();
  if (!(EATING_OCCASIONS as readonly string[]).includes(slot)) {
    return refuse("bad_slot");
  }

  const localDate = String(args.localDate ?? "").trim();
  if (!ISO_DATE.test(localDate)) return refuse("bad_date");

  const text = String(args.text ?? "").trim();
  if (!text) return refuse("empty_text");
  if (text.length > DESCRIBE_MAX_CHARS) return refuse("text_too_long");

  // ══ LA PORTE, AVANT L'ÉCRITURE ══════════════════════════════════════════
  // ⚠️ ELLE N'EST PAS LÀ POUR GARDER UN CHIFFRE — ce chemin n'en écrit aucun.
  // Elle est là pour le FUSEAU: `loadEnergyGate` résout « aujourd'hui » chez la
  // personne, et sans lui les deux bornes ci-dessous seraient celles du
  // serveur. Un élève à Auckland pourrait décrire son dîner « dans le futur ».
  // Et elle jette quand elle est illisible, ce qui est le bon comportement:
  // écrire un fait daté d'un jour qu'on n'a pas su résoudre est pire que
  // refuser.
  const loaded = await loadEnergyGate(admin, { userId, localDate });
  const today = loaded.today;

  // ⛔ PAS DE FAIT DANS LE FUTUR. « J'ai mangé » daté de vendredi, tapé lundi,
  // est une preuve fabriquée dans la table qui nourrit la couverture du coach.
  // C'est la règle d'`isReportable`, tenue ici aussi.
  if (localDate > today) return refuse("future_date");
  if (daysBetween(localDate, today) > DESCRIBE_MAX_BACKFILL_DAYS) {
    return refuse("too_old");
  }

  // ══ LE PLANCHER DÉTERMINISTE ════════════════════════════════════════════
  // ⛔ AUCUN MATCHER MAISON. `detectDeclaredMeal` est le plancher du dépôt, avec
  // ses portes, ses désarmements et ses ligatures dépliées (« des œufs » ⇒
  // `oeufs`, pas `ufs`). Le créneau lui est NOMMÉ: la page sait de quel repas
  // elle parle, et le lui dire ouvre la porte « groupe nominal + créneau » sans
  // exiger un verbe au passé — « une salade et du pain » est une réponse
  // complète à « décris ton déjeuner ».
  const hit = detectDeclaredMeal(text, slot);
  if (!hit) return refuse("not_a_meal");

  // ══ L'ÉCRITURE ══════════════════════════════════════════════════════════
  // ⚠️ LA MÊME CLÉ QUE LE CANAL C1 (`slotMealFactKey`), et une seule définition.
  // L'index unique partiel `(user_id, source_message_id)` fait le reste: si la
  // conversation a déjà posé ce créneau ce jour-là, l'insertion rend 23505 et
  // on répond `already_declared` — on n'écrase pas ce que la personne a dit
  // ailleurs.
  const key = slotMealFactKey(localDate, slot);
  const inserted = await admin
    .from("protocol_events")
    .insert({
      user_id: userId,
      occurred_at: new Date().toISOString(),
      local_date: localDate,
      // ⛔ FORCÉ, comme le canal C1: la page sait de quel créneau elle parle, et
      // le laisser NULL rendrait ce fait invisible au lecteur qui compte les
      // créneaux couverts — c'est-à-dire à la page qui vient de l'écrire.
      slot_key: slot as EatingOccasion,
      // Le geste est une saisie de TEXTE, pas une tape ni une photo.
      source: "text",
      // SCHEMA.md: une tape vaut 0,4. Une déclaration écrite ne vaut pas plus —
      // elle dit qu'un repas a eu lieu, jamais combien.
      evidence_weight: 0.4,
      // ⛔ JAMAIS `as_planned`. Le plancher ne produit que `off_plan` ou `null`,
      // et déduire « prévu » d'un silence fabriquerait de l'adhérence
      // (FF-009 R5). On transmet ce que le plancher a lu, sans le compléter.
      plan_relation: hit.planRelation,
      // Les mots de la personne, tels quels. C'est ce qu'elle a écrit, et le
      // coach doit pouvoir le lire sans passer par une interprétation.
      student_note: hit.studentNote,
      food_group_ref: hit.components[0]?.food_group_ref ?? null,
      content_locale: String(loaded.goalsRow?.content_locale ?? "") ||
        // Le repli n'invente pas une langue: `profiles.locale` est la source, et
        // `loadEnergyGate` ne la rend pas. `en-US` serait un choix; `und` dit
        // qu'on ne sait pas, ce qui est vrai.
        "und",
      source_message_id: key,
    } as never)
    .select("id")
    .maybeSingle();

  if (inserted.error) {
    if ((inserted.error as { code?: string }).code === "23505") {
      return refuse("already_declared");
    }
    throw inserted.error;
  }

  return { ok: true, reason: null, energy: null };
}
