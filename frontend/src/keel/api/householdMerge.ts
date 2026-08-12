// KEEL — L8 · LA FUSION VUE DE L'ÉCRAN (D8, D9, D10, D11, D17).
//
// Autorité produit: docs/keel/CHANTIER-PLANS-INDIVIDUELS-ET-FUSION.md.
//
// ── CE MODULE NE DÉCIDE RIEN ─────────────────────────────────────────────────
// Il LIT. Toute l'arithmétique de la fusion vit côté serveur et n'a qu'un seul
// exemplaire: `bestMergePair` choisit la paire et la fenêtre, `mergeCarriers`
// choisit le plan du foyer qui porte la reprise, `proposalSentence` écrit la
// phrase de D16, `keel_household_merge_quota_state` compte le plafond de D11.
// Recalculer l'un d'eux ici produirait un second nombre plausible — et le
// registre a mesuré exactement ce défaut deux fois (`bestMergePair` avant L5,
// « la première entrée trouvée » avant la contre-épreuve).
//
// D'où la règle de ce fichier: on NORMALISE des formes, on ne dérive aucun
// fait. La seule décision prise ici est de ne RIEN promettre — voir `exitsOf`.
//
// ── CE QU'IL NE MONTRE JAMAIS ───────────────────────────────────────────────
// Aucun objectif, aucun poids, aucune calorie, aucun « pourquoi » de plat. Le
// plan du foyer est lu à voix haute par tout le foyer, et les gardes de
// non-divulgation du serveur (`household_voices.ts`, `household_portions.ts`)
// seraient annulées par un écran qui les contredit.

import { supabase } from "../../lib/supabase";
import { namedEdgeRefusal } from "./household";

export interface PlanSpanView {
  startsOn: string;
  durationDays: number;
}

/**
 * LES SORTIES DE D8, VOCABULAIRE FERMÉ.
 *
 * ⚠️ `exits` EST LA LISTE DES BOUTONS À AFFICHER, et le serveur en retire déjà
 * ce qu'il refuserait: `merge` disparaît quand le plafond de D11 est atteint,
 * `unmerge` quand le plan porteur n'a plus de queue à recomposer. Afficher un
 * bouton absent de cette liste, c'est promettre un geste qui rendra 409 ou 429
 * — et c'est le défaut exact que L5 a mesuré (le bouton `unmerge` offert
 * pendant que le geste répondait `unmerge_window_all_past`).
 */
export const MERGE_EXITS = ["merge", "unmerge", "dismiss"] as const;
export type MergeExit = (typeof MERGE_EXITS)[number];

export const NOTICE_MERGE_AVAILABLE = "merge_available";
export const NOTICE_MERGED_PLAN_REVALIDATED = "merged_plan_revalidated";
export type MergeNoticeKind =
  | typeof NOTICE_MERGE_AVAILABLE
  | typeof NOTICE_MERGED_PLAN_REVALIDATED;

export interface MergeableView {
  /** Ce qu'une fusion prendrait vraiment: l'intersection coupée au pivot. */
  window: PlanSpanView;
  /** Ce que les deux plans partagent, avant la coupe de D16. */
  intersection: PlanSpanView;
  /** Le premier jour non encore consommé. */
  pivot: string;
  daysAlreadyPast: number;
  intoPlanId: string;
}

export interface MergedView {
  planId: string;
  validatedAt: string | null;
  householdPlanId: string;
  /** Ce que la défusion recomposerait. `null` ⇒ le geste refuserait. */
  unmergeWindow: PlanSpanView | null;
}

export interface MergeNoticeView {
  kind: MergeNoticeKind;
  memberId: string;
  userId: string | null;
  displayName: string;
  /**
   * LA PHRASE, CALCULÉE SERVEUR (`proposalSentence`). Elle porte les trois
   * nombres de D16 — « son plan couvre 5 jours, dont 2 déjà passés — je peux
   * fusionner les 3 restants » — et l'écran la rend telle quelle. La
   * recomposer côté navigateur ferait un second avis sur des jours.
   */
  sentence: string;
  planId: string;
  plan: PlanSpanView;
  validatedAt: string | null;
  /**
   * ⚠️ CE QUE `keel_household_dismiss_merge_notice` EXIGE, ET CE N'EST PAS
   * `validatedAt`. Le registre nomme ce piège: envoyer la date du plan montré
   * fait refuser `notice_moved_on` en boucle, sans que rien ne l'explique.
   */
  dismissValidatedAt: string | null;
  mergeable: MergeableView | null;
  mergeableRefusal: string | null;
  merged: MergedView | null;
  exits: MergeExit[];
}

export interface MergeSkipView {
  memberId: string;
  displayName: string;
  reason: string;
}

export interface HeldMergeView {
  memberId: string;
  planId: string;
  /** La PORTÉE de la reprise: hors de cette fenêtre, elle ne colle pas. */
  window: PlanSpanView;
}

export interface MergeQuotaView {
  used: number;
  limit: number;
  remaining: number;
  exhausted: boolean;
  weekStart: string;
  resetsOn: string;
}

export interface MergeNoticesView {
  householdId: string;
  /** D13 — le gel se DIT, il ne refuse pas la lecture. */
  frozen: boolean;
  /** `null` = le plafond n'a pas pu être lu (voir `issues`), pas « pas de plafond ». */
  quota: MergeQuotaView | null;
  notices: MergeNoticeView[];
  skipped: MergeSkipView[];
  held: HeldMergeView[];
  issues: string[];
}

/**
 * Ce que l'écran reçoit — et il reçoit TOUJOURS quelque chose.
 *
 * ⚠️ PAS DE `throw`. Ce dépôt a mesuré qu'un écran qui se vide est son pire
 * échec (`loadHouseholdMeal`, 2026-08-12): « personne n'a pris la main » et
 * « la lecture a échoué » doivent être deux phrases, jamais le même blanc.
 */
export type MergeNoticesOutcome =
  | { ok: true; view: MergeNoticesView }
  | { ok: false; reason: string };

function span(raw: unknown): PlanSpanView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const startsOn = String(r.starts_on ?? "").trim();
  const durationDays = Number(r.duration_days);
  if (!startsOn || !Number.isFinite(durationDays) || durationDays <= 0) return null;
  return { startsOn, durationDays: Math.round(durationDays) };
}

/**
 * LES SORTIES OFFERTES, FILTRÉES SUR LE VOCABULAIRE FERMÉ.
 *
 * Une sortie que ce navigateur ne connaît pas ne rend AUCUN bouton: un bouton
 * dont on ne sait pas ce qu'il déclenche est pire qu'un bouton absent. C'est la
 * direction sûre — le serveur reste l'autorité sur ce qui est offert, l'écran
 * ne fait que refuser d'inventer.
 */
export function exitsOf(raw: unknown): MergeExit[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MergeExit[] = [];
  for (const entry of raw) {
    const value = String(entry ?? "").trim();
    if (seen.has(value)) continue;
    seen.add(value);
    if ((MERGE_EXITS as readonly string[]).includes(value)) out.push(value as MergeExit);
  }
  return out;
}

/** Une notice, telle que la fonction edge la rend. Défensif dans un seul sens. */
export function readNotice(raw: unknown): MergeNoticeView | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  const memberId = String(n.member_id ?? "").trim();
  const kind = String(n.kind ?? "").trim();
  if (!memberId) return null;
  if (kind !== NOTICE_MERGE_AVAILABLE && kind !== NOTICE_MERGED_PLAN_REVALIDATED) {
    // Un `kind` inconnu ne se rend pas en « proposition »: les deux natures
    // n'offrent pas les mêmes sorties, et deviner ferait promettre un geste.
    return null;
  }
  const plan = (n.plan ?? {}) as Record<string, unknown>;
  const mergeableRaw = n.mergeable as Record<string, unknown> | null;
  const mergedRaw = n.merged as Record<string, unknown> | null;
  const mergeableWindow = span(mergeableRaw?.window);
  const mergeableIntersection = span(mergeableRaw?.intersection);
  return {
    kind: kind as MergeNoticeKind,
    memberId,
    userId: typeof n.user_id === "string" && n.user_id ? n.user_id : null,
    displayName: String(n.display_name ?? "").trim() || "—",
    sentence: String(n.sentence ?? "").trim(),
    planId: String(plan.id ?? "").trim(),
    plan: span(plan) ?? { startsOn: "", durationDays: 0 },
    validatedAt: typeof plan.validated_at === "string" ? plan.validated_at : null,
    dismissValidatedAt: typeof n.dismiss_validated_at === "string"
      ? n.dismiss_validated_at
      : null,
    mergeable: mergeableWindow && mergeableIntersection
      ? {
        window: mergeableWindow,
        intersection: mergeableIntersection,
        pivot: String(mergeableRaw?.pivot ?? ""),
        daysAlreadyPast: Number(mergeableRaw?.days_already_past) || 0,
        intoPlanId: String(mergeableRaw?.into_plan_id ?? ""),
      }
      : null,
    mergeableRefusal: typeof n.mergeable_refusal === "string"
      ? n.mergeable_refusal
      : null,
    merged: mergedRaw
      ? {
        planId: String(mergedRaw.plan_id ?? ""),
        validatedAt: typeof mergedRaw.validated_at === "string"
          ? mergedRaw.validated_at
          : null,
        householdPlanId: String(mergedRaw.household_plan_id ?? ""),
        unmergeWindow: span(mergedRaw.unmerge_window),
      }
      : null,
    exits: exitsOf(n.exits),
  };
}

export function readMergeQuota(raw: unknown): MergeQuotaView | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const used = Number(q.used);
  const limit = Number(q.limit);
  const remaining = Number(q.remaining);
  if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;
  return {
    used,
    limit,
    // ⚠️ ON NE RECALCULE PAS `limit - used`. D11 est compté EN BASE
    // (`keel_household_merge_quota_state`), et un test de source refuse déjà
    // que le moindre fichier TypeScript connaisse le `N + 3`. Une soustraction
    // ici serait la première ligne d'un second plafond.
    remaining: Number.isFinite(remaining) ? remaining : 0,
    exhausted: q.exhausted === true,
    weekStart: String(q.week_start ?? ""),
    resetsOn: String(q.resets_on ?? ""),
  };
}

/** La vue complète, normalisée depuis le corps de la fonction edge. */
export function readNoticesPayload(raw: unknown): MergeNoticesView {
  const body = (raw ?? {}) as Record<string, unknown>;
  const household = (body.household ?? {}) as Record<string, unknown>;
  return {
    householdId: String(household.id ?? ""),
    frozen: household.frozen === true,
    quota: readMergeQuota(body.merge_quota),
    notices: (Array.isArray(body.notices) ? body.notices : [])
      .map(readNotice)
      .filter((n): n is MergeNoticeView => n !== null),
    skipped: (Array.isArray(body.skipped) ? body.skipped : []).map((entry) => {
      const s = (entry ?? {}) as Record<string, unknown>;
      return {
        memberId: String(s.member_id ?? ""),
        displayName: String(s.display_name ?? "").trim() || "—",
        reason: String(s.reason ?? ""),
      };
    }).filter((s) => s.memberId && s.reason),
    held: (Array.isArray(body.held) ? body.held : []).map((entry) => {
      const h = (entry ?? {}) as Record<string, unknown>;
      const window = span(h.window);
      return window === null ? null : {
        memberId: String(h.member_id ?? ""),
        planId: String(h.plan_id ?? ""),
        window,
      };
    }).filter((h): h is HeldMergeView => h !== null && h.memberId !== ""),
    issues: Array.isArray(body.issues) ? body.issues.map(String) : [],
  };
}

/**
 * CE QUE LE MAÎTRE DOIT VOIR (D10, D8).
 *
 * ⚠️ RÉSERVÉ AU COMPTE MAÎTRE, ET LA GARDE EST AU SERVEUR (`not_owner`, 403).
 * L'écran ne l'appelle pas pour un secondaire — non par politesse, mais parce
 * qu'une proposition rend visible le fait qu'un tiers a pris la main, et qu'un
 * secondaire n'a de toute façon aucun geste à faire (D10: la fusion est
 * déclenchée par le maître).
 */
export async function loadMergeNotices(): Promise<MergeNoticesOutcome> {
  const { data, error } = await supabase.functions.invoke(
    "household-merge-notices-v1",
    { body: {} },
  );
  if (error) {
    return { ok: false, reason: await namedEdgeRefusal(error) ?? error.message };
  }
  return { ok: true, view: readNoticesPayload(data) };
}

export interface MergeGestureResult {
  ok: boolean;
  /** Le jeton NOMMÉ du serveur, ou `null` quand tout s'est bien passé. */
  reason: string | null;
  mealId: string | null;
}

/**
 * ── LES DEUX GESTES QUI COMPOSENT ─────────────────────────────────────────
 *
 * ⚠️ NI FENÊTRE NI INTENTION. La fusion opère sur l'INTERSECTION des deux plans
 * coupée au premier jour non consommé (D15/D16), et la défusion sur la QUEUE du
 * plan de base: les deux se DÉDUISENT côté serveur. Un client qui pourrait les
 * choisir pourrait refusionner hier.
 *
 * Les deux paramètres portent des noms DIFFÉRENTS (`merge_member_id` /
 * `unmerge_member_id`) et c'est le serveur qui l'exige: un `member_id` unique
 * rendrait « je fusionne Zoé » et « je sors Zoé » indiscernables dans un
 * journal ou un rejeu.
 */
async function runHouseholdOperation(
  body: Record<string, unknown>,
): Promise<MergeGestureResult> {
  const { data, error } = await supabase.functions.invoke(
    "generate-household-meal-v1",
    { body },
  );
  if (error) {
    // Le corps d'une réponse non-2xx n'arrive PAS par `error.message` (il vaut
    // « Edge Function returned a non-2xx status code »). Les onze refus de L4,
    // les six de L5, le 402 du gel et le 429 du plafond seraient tous la même
    // panne générique sans cette lecture.
    return {
      ok: false,
      reason: await namedEdgeRefusal(error) ?? error.message,
      mealId: null,
    };
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    ok: row.ok === true,
    reason: null,
    mealId: ((row.meal ?? null) as Record<string, unknown> | null)?.id as string ?? null,
  };
}

/** D10 — fusionner (ou REFUSIONNER: c'est le même geste, sur un plan plus récent). */
export function mergeMemberPlan(memberId: string): Promise<MergeGestureResult> {
  return runHouseholdOperation({ operation: "merge", merge_member_id: memberId });
}

/** D8 — refaire le plan du foyer SANS cette personne. Elle garde le sien. */
export function unmergeMemberPlan(memberId: string): Promise<MergeGestureResult> {
  return runHouseholdOperation({ operation: "unmerge", unmerge_member_id: memberId });
}

interface RpcResult {
  ok: boolean;
  reason: string;
}

function asResult(data: unknown): RpcResult {
  const row = (data ?? {}) as Record<string, unknown>;
  return { ok: row.ok === true, reason: String(row.reason ?? "") };
}

/**
 * D8 — « REFUSER », la troisième sortie. Elle écarte CETTE VALIDATION-LÀ.
 *
 * ⚠️ `validatedAt` DOIT ÊTRE `notice.dismissValidatedAt`, JAMAIS
 * `notice.plan.validatedAt`. Les deux dates existent, les deux sont plausibles,
 * et elles ne portent pas sur la même chose: la première est l'ÉTAT des plans
 * de cette personne (ce que la base compare), la seconde le plan précis qu'une
 * fusion prendrait. Les confondre fait refuser `notice_moved_on` en boucle sans
 * que rien ne l'explique — c'est nommé au registre comme le piège du lot.
 *
 * La base ne prend pas la date sur parole: elle la compare à la milliseconde à
 * celle du roster. Un client qui écrirait l'an 3000 obtiendrait D17 sans
 * l'avoir choisi.
 */
export async function dismissMergeNotice(
  memberId: string,
  validatedAt: string,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("keel_household_dismiss_merge_notice", {
    p_member: memberId,
    p_validated_at: validatedAt,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}

/**
 * QUI EST MASQUÉ, AUJOURD'HUI (D17).
 *
 * Le réglage doit être LISIBLE là où il se pose, sinon la case à cocher ne
 * saurait pas dire dans quel état elle est — et un interrupteur qui affiche
 * toujours « éteint » finit par être basculé deux fois.
 *
 * ⚠️ RLS EST LA GARDE, ET ELLE EST SERRÉE: `authenticated` n'a que `SELECT` sur
 * cette table, et la policy exige le rôle `owner`. Vérifié en base, en
 * transaction annulée: le maître lit sa ligne, un étranger zéro, **un
 * secondaire du même foyer zéro**. Un secondaire ne lit pas le réglage qui le
 * vise. On ne rajoute donc pas de filtre ici — il n'y a rien à filtrer, la
 * lecture d'un non-maître rend simplement une liste vide.
 *
 * Une lecture en panne rend `null` (« on ne sait pas »), jamais un ensemble
 * vide qui se lirait « personne n'est masqué »: l'écran tait alors la case
 * plutôt que d'en afficher une qui ment.
 */
export async function loadMutedMembers(): Promise<Set<string> | null> {
  const { data, error } = await supabase
    .from("household_merge_settings")
    .select("member_id, proposals_muted");
  if (error) return null;
  const muted = new Set<string>();
  for (const entry of (data ?? []) as Record<string, unknown>[]) {
    if (entry.proposals_muted === true) muted.add(String(entry.member_id));
  }
  return muted;
}

/**
 * D17 — LE RÉGLAGE DISCRET: ne plus se voir proposer la fusion pour quelqu'un.
 *
 * ⚠️ IL NE BLOQUE PAS LE GESTE, et l'écran ne doit pas le présenter comme tel:
 * `operation: "merge"` ne lit pas ce réglage (un test de source le tient), et
 * le maître qui demande explicitement une fusion pour quelqu'un qu'il a masqué
 * l'obtient. Il ne coupe pas non plus l'avertissement de D8, qui parle du plan
 * du maître et pas de celui d'un autre.
 *
 * Assumé « un peu brutal », donc RANGÉ: il ne vit pas sur la carte de
 * proposition mais dans la fiche de la personne.
 */
export async function muteMergeProposals(
  memberId: string,
  muted: boolean,
): Promise<RpcResult> {
  const { data, error } = await supabase.rpc("keel_household_mute_merge_proposals", {
    p_member: memberId,
    p_muted: muted,
  });
  if (error) throw new Error(error.message);
  return asResult(data);
}
