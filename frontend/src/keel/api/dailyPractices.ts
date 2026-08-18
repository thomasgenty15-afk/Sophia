// FF-001 — les pratiques quotidiennes, vues par le coach: décisions pures d'un
// côté, appels de l'autre.
//
// Même partage que `coachSeat.ts`, et pour la même raison: ce qui se décide sans
// réseau se décide ici et se teste ici. La décision qui compte tient dans
// `practiceReach`, parce que c'est la seule chose de cet écran qu'un test peut
// attraper avant un coach.
//
// POURQUOI ELLE MÉRITE UN TEST: une pratique porte une portée ET un statut, et
// les deux sont vrais en même temps. Une pratique restreinte à `fat_loss` qui
// est ALORS en `needs_review` n'atteint personne — mais rendre la portée toute
// seule afficherait « Losing fat », c'est-à-dire une promesse de livraison sur
// une pratique qui ne part pas. Le coach conclurait que ses élèves l'ont reçue.

import {
  type DailyPractice,
  MAX_DAILY_PRACTICES,
  type PracticeBlockingSurface,
  type PracticeStatus,
} from "../../../../supabase/functions/_shared/keel/daily_practices.ts";
import {
  dailyPracticeToRow,
} from "../../../../supabase/functions/_shared/keel/daily_practices_classify.ts";
import { callDoctrine, scopeSentence } from "./coachDoctrine";
import { t } from "../i18n/t";

export type { DailyPractice, PracticeBlockingSurface, PracticeStatus };
export { MAX_DAILY_PRACTICES };

/** La forme jsonb, celle que le brouillon de l'éditeur transporte. */
export interface PracticeRow {
  label?: string;
  kind?: string;
  quantified?: boolean;
  target?: number | null;
  unit?: string | null;
  goal_scope?: string[];
  cadence?: string;
  askable?: boolean;
  minor_safe?: boolean;
  brief?: string;
  status?: string;
  collides_with?: string | null;
}

// ---------------------------------------------------------------------------
// LES DÉCISIONS PURES
// ---------------------------------------------------------------------------

/**
 * QUI REÇOIT CETTE PRATIQUE — en une phrase, et jamais une phrase qui ment.
 *
 * Trois choses la déterminent, et aucune n'est facultative:
 *
 *   le STATUT  — `needs_review` et `blocked` n'atteignent PERSONNE, quelle que
 *                soit la portée. Il passe donc en premier: une pratique bloquée
 *                qui afficherait « Everyone » dirait au coach que sa cohorte l'a
 *                reçue, ce qui est faux et indétectable de son côté.
 *   la PORTÉE  — vide = tout le monde, et c'est une VALEUR, pas un vide. Le
 *                coach ne doit pas croire qu'il a laissé son travail inachevé.
 *                Elle est calculée par `scopeSentence`, qui est LA phrase de
 *                portée de l'écran doctrine: cette fonction en recopiait le
 *                corps ligne pour ligne, donc « Everyone » et la liste des
 *                objectifs existaient en double.
 *   `minorSafe` — il ne change pas QUI, il change qui EN PLUS est exclu. Il
 *                s'ajoute donc à la phrase au lieu de la remplacer.
 *
 * ⚠️ LA SOUSTRACTION DES MINEURS PASSE PAR UNE CLÉ À TROU, jamais par une
 * concaténation. `${who}, adults only` impose l'ordre anglais à toutes les
 * langues; « {who}, adults only » laisse la traduction replacer le complément
 * où sa grammaire le veut.
 */
export function practiceReach(practice: PracticeRow): string {
  const status = String(practice.status ?? "");
  if (status === "blocked") return t("coach.practice.reach.blocked");
  if (status === "needs_review") return t("coach.practice.reach.needs_review");

  const who = scopeSentence(practice.goal_scope);
  // Le mineur n'est pas une portée: c'est une soustraction. Le dire à part est
  // ce qui empêche de lire « Everyone » comme « y compris les mineurs ».
  return practice.minor_safe === true ? who : t("coach.practice.reach.adults_only", { who });
}

/**
 * POURQUOI ELLE EST BLOQUÉE — et R9 exige que la ceinture soit NOMMÉE.
 *
 * « On bloque uniquement en collision avec une ceinture existante, ET ON LA
 * NOMME. Ce n'est pas un avis, c'est une incohérence interne — et le coach doit
 * lire laquelle. » Un blocage muet se vit comme de l'arbitraire, et un coach
 * qui vit un refus comme arbitraire arrête d'écrire.
 */
export function blockedSentence(collidesWith: string | null | undefined): string | null {
  switch (String(collidesWith ?? "")) {
    case "weight_readout":
      return t("coach.practice.blocked.weight_readout");
    case "calorie_readout":
      return t("coach.practice.blocked.calorie_readout");
    case "streak_display":
      return t("coach.practice.blocked.streak_display");
    case "adherence_score":
      return t("coach.practice.blocked.adherence_score");
    default:
      return null;
  }
}

/**
 * Reste-t-il de la place ? (R2)
 *
 * Le plafond de 7 vit AUSSI côté serveur (`parseDailyPractices` lâche et
 * compte). Celui-ci n'est donc pas la garde: c'est le fait de ne pas laisser un
 * coach taper une huitième pratique, la faire classer, la relire, puis
 * découvrir qu'elle n'est jamais partie.
 */
export function canAddPractice(practices: readonly PracticeRow[] | undefined): boolean {
  return (practices ?? []).length < MAX_DAILY_PRACTICES;
}

/**
 * COMBIEN DE SOIRS AVANT QU'UNE PRATIQUE REVIENNE — la question que le coach se
 * pose vraiment quand il en ajoute une septième.
 *
 * C'est la longueur du cycle, `constant` comptant double, et rien d'autre. Elle
 * ne compte QUE ce qui part réellement: une pratique en relecture n'occupe aucun
 * créneau, et l'inclure ferait annoncer une rotation plus lente que la vraie.
 */
export function rotationLengthDays(practices: readonly PracticeRow[] | undefined): number {
  return (practices ?? [])
    .filter((p) => p.status === "active" || p.status === "remind_only")
    .reduce((n, p) => n + (p.cadence === "constant" ? 2 : 1), 0);
}

// ---------------------------------------------------------------------------
// L'APPEL
// ---------------------------------------------------------------------------

export interface ClassifyPracticeResult {
  practice: PracticeRow;
  issues: string[];
  /** `false` = l'appel a échoué et la pratique revient en relecture (§7). */
  classified: boolean;
}

/**
 * Classe UNE pratique. N'écrit rien: le coach relit le verdict, puis enregistre.
 *
 * ⚠️ NE LÈVE PAS QUAND LA CLASSIFICATION RATE. Le serveur rend la pratique en
 * `needs_review` avec son motif, parce que le moment où on répondrait « erreur »
 * à un coach qui vient de taper une phrase est exactement celui où il ferme
 * l'onglet. Un vrai échec de transport (réseau, 401) lève, lui — l'écran doit
 * pouvoir dire « on n'a pas pu joindre le serveur », qui est une autre phrase.
 */
export async function classifyPractice(args: {
  label: string;
  contentLocale: string;
  existingLabels: readonly string[];
}): Promise<ClassifyPracticeResult> {
  const json = await callDoctrine<{
    practice?: PracticeRow;
    issues?: string[];
    classified?: boolean;
  }>({
    action: "classify_practice",
    label: args.label,
    content_locale: args.contentLocale,
    existing_labels: [...args.existingLabels],
  });
  return {
    practice: json.practice ?? {},
    issues: json.issues ?? [],
    classified: json.classified === true,
  };
}

/**
 * La pratique du module Deno → la ligne du brouillon.
 *
 * Passe par `dailyPracticeToRow`, jamais par une conversion maison: c'est la
 * fonction que le serveur utilise pour écrire, donc l'écran et la base ne
 * peuvent pas diverger sur la forme. C'est la même discipline que
 * `draftToDoctrine` juste à côté.
 */
export function practiceToRow(practice: DailyPractice): PracticeRow {
  return dailyPracticeToRow(practice) as PracticeRow;
}
