/**
 * PIVOT C4 — la couche IO du point hebdomadaire.
 *
 * Séparée du module pur (`weekly_flow.ts`) pour la même raison que partout
 * ailleurs ici: toute la décision est testable sans base, et ce fichier ne
 * contient que ce qui touche vraiment Postgres.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type MeasureOrigin,
  parseWeeklyFlowResponse,
  weeklyBiofeedbackPayload,
  type WeeklyFlowReply,
} from "./weekly_flow.ts";
import {
  type BodyMeasureWrite,
  insertBodyMeasures,
  resolveMeasureLocalDate,
} from "./body_measure_io.ts";

/** Le lundi de la semaine qui contient `localDate`. */
export function weekStartOf(localDate: string): string {
  const d = new Date(`${localDate}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface WeeklyFlowWriteResult {
  weekStart: string;
  reply: WeeklyFlowReply;
  /** True quand la ligne existait déjà et a été mise à jour. */
  updated: boolean;
  /**
   * FF-031 — combien de mesures datées ont été écrites dans
   * `student_body_measures`, et le motif quand il y en a moins que prévu.
   *
   * RENDU, jamais avalé: c'est la seule chose qui distingue « cet élève n'a
   * rien saisi » de « on a échoué à ranger ce qu'il a saisi », et la seconde
   * est ce qui désarme le plancher TCA sans bruit.
   */
  bodyMeasuresWritten: number;
  bodyMeasuresIssue: string | null;
}

/**
 * Écrit la réponse du Flow sur `weekly_reviews`.
 *
 * ── UNE SEULE LIGNE PAR (ÉLÈVE, SEMAINE), ET POURQUOI CE N'EST PAS UN UPSERT
 * L'élève peut rouvrir le Flow et renvoyer le formulaire. Deux lignes
 * donneraient deux poids pour un même dimanche sur `/app/progress`, impossibles
 * à départager après coup.
 *
 * Ce code faisait donc `upsert(..., { onConflict: "user_id,week_start_date" })`.
 * IL ÉCHOUAIT À CHAQUE APPEL, en 42P10 — « there is no unique or exclusion
 * constraint matching the ON CONFLICT specification » — et le webhook avalait
 * l'erreur: aucune ligne écrite, aucun accusé envoyé, les deux minutes de
 * l'élève perdues. Reproduit en local le 2026-08-03.
 *
 * La raison est structurelle. L'index qui dédoublonne ici est PARTIEL
 * (`... where plan_version_id is null`), parce que l'index natif porte sur
 * `(user_id, plan_version_id, week_start_date)` et que Postgres tient deux NULL
 * pour distincts. Or `ON CONFLICT (a, b)` ne peut PAS choisir un index partiel:
 * il faudrait répéter le prédicat (`ON CONFLICT (a, b) WHERE ...`), et le
 * paramètre `on_conflict` de PostgREST n'émet jamais de WHERE. L'index était
 * donc bien posé, la garde de migration bien verte, et le seul écrivain
 * incapable de s'en servir.
 *
 * D'où un SELECT puis UPDATE-par-id ou INSERT — la lecture existait déjà pour
 * la fusion. L'index partiel reste la ceinture: sur une double soumission
 * simultanée, l'INSERT perdant lève 23505 et on repasse en UPDATE au lieu de
 * créer la deuxième ligne.
 */
export async function writeWeeklyFlowReply(
  admin: SupabaseClient,
  args: {
    userId: string;
    weekStart: string;
    responseJson: unknown;
    contentLocale?: string;
    /**
     * REQUIS. Deux écrans écrivent cette colonne — le point du dimanche et la
     * carte des mesures de `/app/plan` — et ils ne demandent pas la même
     * chose. Le rendre obligatoire force chaque appelant à DIRE ce qu'il est,
     * plutôt que de laisser un défaut décider à sa place.
     */
    origin: MeasureOrigin;
    /**
     * L'instant du geste. REQUIS, pas `new Date()` par défaut: la date locale
     * de la mesure en dépend, et une horloge implicite est une horloge qu'un
     * test ne peut pas tenir.
     */
    now: Date;
  },
): Promise<WeeklyFlowWriteResult> {
  const reply = parseWeeklyFlowResponse(args.responseJson, args.origin);

  async function readExisting() {
    const res = await admin
      .from("weekly_reviews")
      .select("id, biofeedback")
      .eq("user_id", args.userId)
      .eq("week_start_date", args.weekStart)
      .is("plan_version_id", null)
      .maybeSingle();
    if (res.error) throw res.error;
    return res.data as { id: string; biofeedback: unknown } | null;
  }

  // On FUSIONNE plutôt que d'écraser: une ligne peut déjà porter des données
  // venues d'ailleurs (le récap du soir en écrit), et un formulaire qui ne
  // remplit que six champs ne doit pas effacer ce qu'il ne connaît pas.
  function mergedWith(row: { biofeedback: unknown } | null): Record<string, unknown> {
    const previous = (row?.biofeedback ?? {}) as Record<string, unknown>;
    return { ...previous, ...weeklyBiofeedbackPayload(reply, args.origin) };
  }

  async function updateRow(id: string, merged: Record<string, unknown>) {
    const res = await admin
      .from("weekly_reviews")
      .update({ biofeedback: merged })
      .eq("id", id);
    if (res.error) throw res.error;
  }

  const existing = await readExisting();
  if (existing) {
    await updateRow(existing.id, mergedWith(existing));
  } else {
    const res = await admin
      .from("weekly_reviews")
      .insert({
        user_id: args.userId,
        week_start_date: args.weekStart,
        plan_version_id: null,
        biofeedback: mergedWith(null),
        content_locale: args.contentLocale ?? "en-GB",
      });
    if (res.error) {
      // 23505 = l'index partiel a mordu: une soumission concurrente a créé la
      // ligne entre notre SELECT et notre INSERT. C'est exactement ce que la
      // ceinture doit faire — on relit et on fusionne dedans.
      if (String((res.error as { code?: string }).code ?? "") !== "23505") throw res.error;
      const raced = await readExisting();
      if (!raced) throw res.error;
      await updateRow(raced.id, mergedWith(raced));
      const raceMeasures = await writeDatedMeasures(admin, args, reply);
      return {
        weekStart: args.weekStart,
        reply,
        updated: true,
        ...raceMeasures,
      };
    }
  }

  const measures = await writeDatedMeasures(admin, args, reply);

  if (reply.issues.length > 0) {
    // Bruyant par construction: une valeur écartée signale soit une faute de
    // frappe de l'élève, soit un formulaire publié chez Meta qui a divergé de
    // `weeklyFlowJson()`. Le second cas est invisible autrement.
    console.warn("keel.weekly_flow.issues", {
      user_id: args.userId,
      week_start: args.weekStart,
      issues: reply.issues,
    });
  }

  return {
    weekStart: args.weekStart,
    reply,
    updated: Boolean(existing),
    ...measures,
  };
}

/**
 * FF-031 — LA MOITIÉ DATÉE DE LA MÊME ÉCRITURE.
 *
 * Le formulaire porte une SEMAINE dans son jeton, pas un jour. Le jour est
 * donc résolu ici, depuis le fuseau de l'élève, et `resolveMeasureLocalDate`
 * garantit qu'il tombe dans la semaine que le jeton nomme — sans quoi la même
 * pesée atterrirait dans deux semaines dérivées différentes selon qu'on la lit
 * par la table ou par le miroir.
 *
 * ── ELLE N'EMPORTE PAS L'ÉCRITURE MIROIR AVEC ELLE (FF-031 R9) ────────────
 * Tant que la double écriture dure, `weekly_reviews.biofeedback` reste le
 * chemin qui marche aujourd'hui. Une panne ici le laisserait intact et l'élève
 * garderait sa mesure. Le motif est RENDU à l'appelant, pas seulement
 * journalisé: un échec qu'on ne peut lire que dans les logs d'un cron est un
 * échec qu'on découvre le jour où la ceinture n'a pas mordu.
 */
async function writeDatedMeasures(
  admin: SupabaseClient,
  args: { userId: string; weekStart: string; origin: MeasureOrigin; now: Date },
  reply: WeeklyFlowReply,
): Promise<{ bodyMeasuresWritten: number; bodyMeasuresIssue: string | null }> {
  if (reply.weightKg === null && reply.waistCm === null) {
    return { bodyMeasuresWritten: 0, bodyMeasuresIssue: null };
  }
  try {
    // Le fuseau seul: `resolveMeasureLocalDate` sait déjà quoi faire de son
    // absence, et une lecture de profil qui échoue ne doit pas coûter la
    // mesure.
    let timezone: string | null = null;
    try {
      const res = await admin
        .from("profiles")
        .select("timezone")
        .eq("id", args.userId)
        .maybeSingle();
      if (!res.error) {
        timezone = String((res.data as { timezone?: unknown } | null)?.timezone ?? "")
          .trim() || null;
      }
    } catch {
      timezone = null;
    }

    const localDate = resolveMeasureLocalDate({
      weekStart: args.weekStart,
      timezone,
      now: args.now,
    });
    const source = args.origin === "measures_card" ? "plan_card" : "sunday_flow";
    const rows: BodyMeasureWrite[] = [];
    if (reply.weightKg !== null) {
      rows.push({
        userId: args.userId,
        kind: "weight",
        valueSi: reply.weightKg,
        source,
        measuredAt: args.now.toISOString(),
        localDate,
      });
    }
    if (reply.waistCm !== null) {
      rows.push({
        userId: args.userId,
        kind: "waist",
        valueSi: reply.waistCm,
        source,
        measuredAt: args.now.toISOString(),
        localDate,
      });
    }
    const written = await insertBodyMeasures(admin, rows);
    return { bodyMeasuresWritten: written.written, bodyMeasuresIssue: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn("keel.body_measures.write_failed", {
      user_id: args.userId,
      week_start: args.weekStart,
      origin: args.origin,
      detail,
    });
    return { bodyMeasuresWritten: 0, bodyMeasuresIssue: detail };
  }
}

/** Le `purpose` sous lequel le point hebdo part, et sous lequel on le relit. */
export const WEEKLY_FLOW_PURPOSE = "keel_weekly_flow";
/** La clé de semaine posée sur l'envoi, pour que la relecture soit EXACTE. */
export const WEEKLY_FLOW_WEEK_META_KEY = "keel_week_start";

/**
 * A-t-on déjà POSÉ la question cette semaine ?
 *
 * ── LA SOURCE DE VÉRITÉ EST LE REGISTRE D'ENVOI, PAS UN COMPTEUR ─────────
 * `whatsapp_outbound_messages` est déjà « authoritative for retry/status » pour
 * tout le reste du produit. Un compteur à part serait un second endroit pour
 * une même vérité, et ce dépôt sait où ça mène.
 *
 * On corrèle par `metadata->>keel_week_start`, PAS par une fenêtre de dates:
 * la semaine est celle de l'élève dans SON fuseau, et la recalculer ici à
 * partir de `created_at` UTC ferait diverger la garde de ce qui a été envoyé.
 *
 * ── LA CONDITION DE DÉSARMEMENT ──────────────────────────────────────────
 * Seuls les envois qui ont réellement ABOUTI comptent. Un `failed` ou un
 * `cancelled` n'est pas une question posée: le faire compter transformerait un
 * incident de transport en semaine de silence, ce qui est exactement l'inverse
 * du but. `queued` compte — le message est parti dans le tuyau, et redemander
 * pendant qu'il y est produirait le doublon qu'on veut éviter.
 */
export async function hasAskedWeek(
  admin: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("outbound_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("metadata->>purpose", WEEKLY_FLOW_PURPOSE)
    .eq(`metadata->>${WEEKLY_FLOW_WEEK_META_KEY}`, weekStart)
    .in("status", ["queued", "sent", "delivered", "read"])
    .limit(1);
  if (error) throw error;
  return ((data ?? []) as unknown[]).length > 0;
}

/** A-t-il déjà répondu pour cette semaine ? */
export async function hasAnsweredWeek(
  admin: SupabaseClient,
  userId: string,
  weekStart: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("weekly_reviews")
    .select("biofeedback")
    .eq("user_id", userId)
    .eq("week_start_date", weekStart)
    .is("plan_version_id", null)
    .maybeSingle();
  if (error) throw error;
  const bio = (data?.biofeedback ?? null) as Record<string, unknown> | null;
  // Une LIGNE ne suffit pas: le récap du soir en crée une sans jamais toucher
  // au biofeedback. Ce qui compte est que le formulaire ait été rempli.
  return Boolean(bio && bio.source === "whatsapp_flow");
}
