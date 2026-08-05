/**
 * LE MAPPING ALIMENTAIRE DU COACH, chargé pour UN élève et SON objectif.
 *
 * La coquille d'I/O de `protocol_compiler.ts`, séparée pour la même raison que
 * partout ailleurs dans `_shared/keel/`: la décision est pure et testable, la
 * lecture ne l'est pas.
 *
 * ── LE TROU QUE CE FICHIER FERME ─────────────────────────────────────────
 * `coach_food_rules` et `coach_timing_rules` existaient, avec leur écran, leurs
 * gardes de schéma et un compilateur couvert par trente tests — et **aucun
 * consommateur au runtime**. Un coach cochait ses trente pastilles, et Sophia
 * composait ses plats sans rien en savoir. Sa méthode ne gouvernait que l'écran
 * sur lequel il l'avait écrite.
 *
 * ── POURQUOI ON COMPILE À LA LECTURE ─────────────────────────────────────
 * Le lot voisin prévoit à terme d'écrire les lignes compilées dans
 * `plan_commitments` à la publication. Cette écriture n'existe pas encore, et
 * l'attendre laisserait le mapping muet jusque-là.
 *
 * Compiler à la lecture est possible parce que le compilateur est PUR et sans
 * I/O: c'est exactement ce que fait `doctrine_loader.ts` avec la doctrine
 * depuis le début. Quand la publication arrivera, ce chargeur pourra lire les
 * lignes publiées au lieu de les dériver — le bloc rendu, lui, ne changera pas,
 * parce qu'il vient du même compilateur dans les deux cas.
 *
 * ── L'ARBITRAGE DE PANNE ─────────────────────────────────────────────────
 * Identique à celui de la doctrine, et pour la même raison: une lecture qui
 * échoue ne doit ni casser le produit pour l'élève, ni rendre l'agent générique.
 * Ici la dégradation est plus simple que pour la doctrine — pas de mapping =
 * pas de bloc. Le générateur garde la doctrine, les contraintes de sécurité et
 * le protocole de l'élève; il perd seulement l'orientation par groupe.
 *
 * ⚠️ RIEN ICI N'EST UN VERROU DE SÉCURITÉ. Un `excluded` de coach est une
 * sévérité de MÉTHODE. Les allergies vivent dans `student_safety_constraints`,
 * arrivent par leur propre bloc et sont vérifiées par un filtre déterministe
 * qu'aucune ligne de ce fichier ne touche.
 */

import {
  type CoachFoodRule,
  type CoachTerm,
  type CoachTimingRule,
  type CompiledCommitment,
  compileProtocol,
  protocolFoodBlock,
} from "./protocol_compiler.ts";
import type { FoodGroupRef, GoalToken, SlotKey } from "./tokens.ts";

export const PROTOCOL_LOAD_REASONS = [
  "loaded",
  "no_coach",
  "no_published_protocol",
  "empty_protocol",
  "load_failed",
] as const;
export type ProtocolLoadReason = (typeof PROTOCOL_LOAD_REASONS)[number];

export interface LoadedProtocol {
  compiled: readonly CompiledCommitment[];
  coachId: string | null;
  protocolId: string | null;
  reason: ProtocolLoadReason;
  /** LA VARIANTE SERVIE — la même que celle de la doctrine, par construction. */
  goal: GoalToken | null;
}

export interface ProtocolLoadOptions {
  /** Le mode test du coach, exactement comme pour la doctrine. */
  goalOverride?: GoalToken | null;
}

/**
 * Résout le coach vivant de l'élève, son protocole PUBLIÉ, et compile le
 * mapping pour l'objectif de cet élève.
 *
 * L'objectif est lu ICI et pas passé par l'appelant, pour la raison qui a déjà
 * coûté cher à ce dépôt: un argument est un argument qu'un consommateur
 * oubliera, et il servirait alors le mapping d'un autre objectif sans que rien
 * n'échoue. `goalOverride` existe pour le mode test, et son omission donne le
 * comportement CORRECT.
 */
export async function loadPublishedProtocol(
  db: unknown,
  studentUserId: string,
  options: ProtocolLoadOptions = {},
): Promise<LoadedProtocol> {
  let goal: GoalToken | null = null;
  const empty = (
    reason: ProtocolLoadReason,
    coachId: string | null = null,
    protocolId: string | null = null,
  ): LoadedProtocol => ({ compiled: [], coachId, protocolId, reason, goal });

  const id = String(studentUserId ?? "").trim();
  if (!id) return empty("no_coach");

  // deno-lint-ignore no-explicit-any
  const client = db as any;

  try {
    const { data, error } = await client
      .from("student_goals")
      .select("goal")
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw error;
    const raw = String((data as Record<string, unknown> | null)?.goal ?? "").trim();
    if (raw) goal = raw as GoalToken;
  } catch (error) {
    // Direction sûre: sans objectif lisible on ne retient que les règles
    // GLOBALES. On perd l'orientation ciblée; on n'en applique jamais une qui
    // ne vise pas cet élève.
    console.warn("[keel/protocol] student goal unreadable, global rules only", error);
  }
  if (options.goalOverride !== undefined) goal = options.goalOverride;

  let coachId: string | null = null;
  try {
    const { data, error } = await client
      .from("coach_clients")
      .select("coach_id")
      .eq("student_user_id", id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    coachId = String((data as Record<string, unknown> | null)?.coach_id ?? "").trim() || null;
  } catch (error) {
    console.warn("[keel/protocol] coach lookup failed", error);
    return empty("load_failed");
  }
  if (!coachId) return empty("no_coach");

  let protocolId: string | null = null;
  let contentLocale = "en";
  try {
    const { data, error } = await client
      .from("coach_protocols")
      .select("id, content_locale")
      .eq("coach_id", coachId)
      .eq("status", "published")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as Record<string, unknown> | null;
    protocolId = String(row?.id ?? "").trim() || null;
    contentLocale = String(row?.content_locale ?? "").trim() || "en";
  } catch (error) {
    console.warn("[keel/protocol] protocol load failed", error);
    return empty("load_failed", coachId);
  }
  if (!protocolId) return empty("no_published_protocol", coachId);

  let foodRules: CoachFoodRule[] = [];
  let timingRules: CoachTimingRule[] = [];
  let terms: CoachTerm[] = [];
  try {
    const [food, timing, coachTerms] = await Promise.all([
      client
        .from("coach_food_rules")
        .select("food_group_ref, stance, goal_scope, rationale")
        .eq("protocol_id", protocolId),
      client
        .from("coach_timing_rules")
        .select(
          "template, food_group_ref, direction, portions, period, cutoff_local, slot_key, goal_scope, rationale",
        )
        .eq("protocol_id", protocolId),
      client
        .from("coach_terms")
        .select("term, food_group_ref")
        .eq("coach_id", coachId),
    ]);
    for (const res of [food, timing, coachTerms]) {
      if (res.error) throw res.error;
    }
    foodRules = ((food.data ?? []) as Record<string, unknown>[]).map((r) => ({
      food_group_ref: String(r.food_group_ref) as FoodGroupRef,
      stance: String(r.stance) as CoachFoodRule["stance"],
      goal_scope: (Array.isArray(r.goal_scope) ? r.goal_scope : []).map(String) as GoalToken[],
      rationale: r.rationale == null ? null : String(r.rationale),
    }));
    timingRules = ((timing.data ?? []) as Record<string, unknown>[]).map((r) => ({
      template: String(r.template),
      food_group_ref: String(r.food_group_ref) as FoodGroupRef,
      direction: r.direction == null ? undefined : String(r.direction),
      portions: r.portions == null ? undefined : Number(r.portions),
      period: r.period == null ? undefined : String(r.period),
      // `time` de Postgres arrive en "20:00:00"; le gabarit veut l'heure telle
      // que le coach l'a posée, et une seconde de plus dans le prompt est du
      // bruit que le modèle recopie.
      cutoff_local: r.cutoff_local == null ? undefined : String(r.cutoff_local).slice(0, 5),
      slot_key: r.slot_key == null ? undefined : String(r.slot_key) as SlotKey,
      goal_scope: (Array.isArray(r.goal_scope) ? r.goal_scope : []).map(String) as GoalToken[],
      rationale: r.rationale == null ? null : String(r.rationale),
    })) as CoachTimingRule[];
    terms = ((coachTerms.data ?? []) as Record<string, unknown>[]).map((r) => ({
      term: String(r.term ?? ""),
      food_group_ref: String(r.food_group_ref) as FoodGroupRef,
    }));
  } catch (error) {
    console.warn("[keel/protocol] rules load failed", error);
    return empty("load_failed", coachId, protocolId);
  }

  const compiled = compileProtocol(
    { coachId, contentLocale, foodRules, timingRules, terms },
    goal,
  );

  // §3.2.2 appliqué au mapping: la sélection se lit dans les logs. « Sophia a
  // proposé un plat avec ça » se débogue en sachant quelles règles ont servi.
  console.info("keel.protocol.mapping", {
    coach_id: coachId,
    protocol_id: protocolId,
    variant: goal ?? "default",
    rules_total: foodRules.length + timingRules.length,
    rules_kept: compiled.length,
  });

  return {
    compiled,
    coachId,
    protocolId,
    // Un protocole publié sans aucune règle applicable à cet objectif est un
    // état réel, et il ne se dit pas « chargé »: l'appelant n'a rien à injecter.
    reason: compiled.length === 0 ? "empty_protocol" : "loaded",
    goal,
  };
}

/**
 * Le bloc à injecter, quel que soit le résultat de la lecture.
 *
 * Rend `""` quand il n'y a rien — et contrairement à la doctrine, il n'y a pas
 * de bloc de prudence de repli. La raison est que l'absence de mapping ne rend
 * pas l'agent générique: la doctrine, elle, gouverne toujours la voix et les
 * interdits. Un coach peut parfaitement n'avoir jamais ouvert `/coach/protocol`
 * et avoir une méthode complète.
 */
export function protocolBlockFor(
  loaded: LoadedProtocol,
  coachDisplayName?: string | null,
): string {
  if (loaded.reason !== "loaded") return "";
  return protocolFoodBlock(loaded.compiled, coachDisplayName);
}
