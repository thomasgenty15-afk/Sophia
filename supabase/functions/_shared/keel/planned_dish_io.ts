/**
 * LA COQUILLE D'I/O DU RAPPROCHEMENT — charger de quoi comparer.
 *
 * Séparée de `planned_dish_match.ts` pour la même raison que partout ailleurs
 * dans `_shared/keel/`: la décision est pure et testable, la lecture ne l'est
 * pas.
 *
 * ── CE QU'ELLE LIT, ET DANS QUEL ORDRE ────────────────────────────────────
 *   1. `food_items` — le catalogue terme → groupe. Sans lui, aucun ingrédient
 *      ne se résout et le rapprochement est muet (pas faux: muet).
 *   2. `student_generated_meals` — la DERNIÈRE composition de cet élève, puis
 *      les plats dont la date résolue est celle du repas. Le fenêtrage
 *      appartient à `meal_stretch.ts`, pas à une requête SQL: un plat ne nomme
 *      qu'un jour de semaine — et depuis le 2026-08-07 la table porte sa
 *      FENÊTRE (`starts_on`, `duration_days`), donc le jeton a enfin une date.
 *
 * ── CE QU'ELLE NE FAIT JAMAIS ─────────────────────────────────────────────
 * Aucune écriture. Aucune décision. Une lecture en panne rend un contexte VIDE
 * plutôt que de jeter: ne pas pouvoir proposer un plat n'est pas une raison de
 * perdre la photo d'un élève. Le silence est le repli correct ici — c'est la
 * même asymétrie que `doctrine_loader`, et elle penche du même côté.
 */

import { addDays } from "./local_date.ts";
import { dishesForDate } from "./meal_stretch.ts";
import {
  type FoodCatalogueItem,
  type PlannedDish,
  type PlannedPreparation,
  dishDedicatedTo,
  dishIsForMouth,
} from "./planned_dish_match.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

export interface PlannedDishContext {
  /** L'identité de la composition — elle entre dans la clé de coche. */
  mealId: string | null;
  /** Les plats du jour, avec leur INDEX d'origine (la clé de coche en dépend). */
  dishes: Array<{ dish: PlannedDish; dishIndex: number }>;
  /** Les préparations de la composition, citées par `dish.uses`. */
  preparations: PlannedPreparation[];
  catalogue: FoodCatalogueItem[];
  /** Pourquoi le contexte est vide, quand il l'est. Tracé, jamais deviné. */
  reason:
    | "loaded"
    | "no_composition"
    | "no_dish_today"
    /** La composition ne couvre pas ce jour: trop vieille, ou pas encore commencée. */
    | "composition_out_of_window"
    | "load_failed";
}

const EMPTY = (reason: PlannedDishContext["reason"]): PlannedDishContext => ({
  mealId: null,
  dishes: [],
  preparations: [],
  catalogue: [],
  reason,
});

// ---------------------------------------------------------------------------
// LE PÉRIMÈTRE DE PLAN D'UNE PERSONNE — le sien, ou celui de son foyer (A8.0)
// ---------------------------------------------------------------------------

/**
 * Quels plans une personne a le droit de voir comme LES SIENS, ce jour-là.
 *
 * ── LE DÉFAUT QUE CE RÉSOLVEUR FERME (chantier P8, 2026-09-03) ────────────
 * Un profil RÉCLAMÉ (`household_members.role = 'member'`, `user_id` posé) ne
 * compose jamais: le plan qu'il mange est le plan `household` de son foyer,
 * écrit sous le `user_id` du MAÎTRE. Tout lecteur qui ne filtrait que sur
 * `.eq("user_id", moi)` rendait donc « aucune composition » pour lui — pas de
 * bande du soir, pas de rapprochement photo, pas de dénominateur du soir. Le
 * membre n'existait pas pour le produit.
 *
 * ── CE QU'ON NE FAIT PAS, ET C'EST MESURÉ (run adversarial H2) ────────────
 * On ne RETIRE PAS le `.eq("user_id")`. Ces lecteurs tournent sous
 * `service_role` (la RLS ne s'applique pas) et un `mealId` vient parfois de la
 * charge d'un bouton, c'est-à-dire d'une chaîne que le client contrôle. Sans
 * filtre, une charge forgée citant le plan d'un AUTRE foyer faisait écrire chez
 * l'attaquant une coche portant le titre du plat de la victime. La garde
 * équivalente pour un membre est `.eq("plan_kind","household")` ET
 * `.eq("household_id", SON foyer)` — les deux, jamais l'un sans l'autre:
 * `household_id` seul rendrait aussi le plan PERSONNEL d'un co-membre qui a
 * pris la main (`household_plan_kind_readers_test.ts`, mesuré deux fois).
 *
 * ── L'ORDRE: LE SIEN D'ABORD, LE FOYER ENSUITE ────────────────────────────
 * Un membre qui a PRIS LA MAIN (L3) porte une ligne `personal` à son nom: c'est
 * lui qui l'a composée, elle passe avant. Le plan du foyer n'est lu que quand
 * aucune ligne à son nom ne possède le jour. Le maître, lui, ne passe jamais
 * par la seconde branche: le plan du foyer est DÉJÀ sous son `user_id`.
 *
 * FAIL-CLOSED VERS « LE SIEN SEULEMENT »: une lecture de foyer en panne rend
 * `own`. Le pire cas est le silence d'avant ce chantier pour un membre ce
 * soir-là; le pire cas de l'inverse serait de lire un foyer qu'on n'a pas su
 * vérifier.
 */
export type PlanScope =
  | { kind: "own" }
  | { kind: "household_member"; householdId: string };

export async function resolvePlanScope(db: Db, userId: string): Promise<PlanScope> {
  const id = String(userId ?? "").trim();
  if (!id) return { kind: "own" };
  try {
    const { data, error } = await db
      .from("household_members")
      .select("role, household_id")
      .eq("user_id", id)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as { role?: unknown; household_id?: unknown } | null;
    const role = String(row?.role ?? "").trim();
    const householdId = String(row?.household_id ?? "").trim();
    if (role === "member" && householdId) {
      return { kind: "household_member", householdId };
    }
    return { kind: "own" };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "keel.planned_dish.scope_unreadable",
      user_id: id,
      error: error instanceof Error ? error.message : String(error),
      effect: "fail-closed: seuls les plans a SON nom sont lus",
    }));
    return { kind: "own" };
  }
}

/** Le premier candidat dont la fenêtre contient encore `localDate`. */
function ownerOfDay(
  candidates: Array<Record<string, unknown>>,
  localDate: string,
): Record<string, unknown> | null {
  return candidates.find((c) => {
    const startsOn = String(c.starts_on ?? "");
    const days = Number(c.duration_days);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !Number.isFinite(days)) return false;
    return localDate <= addDays(startsOn, Math.max(1, days) - 1);
  }) ?? null;
}

/**
 * Le catalogue, en entier. 127 lignes aujourd'hui — assez petit pour être lu
 * d'un coup, et le lire par morceaux introduirait une pagination qui n'a aucune
 * chance d'être testée.
 */
export async function loadFoodCatalogue(db: Db): Promise<FoodCatalogueItem[]> {
  const { data, error } = await db
    .from("food_items")
    .select("slug, label, food_group_ref");
  if (error) throw error;
  return ((data ?? []) as FoodCatalogueItem[]).filter((i) =>
    String(i?.slug ?? "").trim() && String(i?.food_group_ref ?? "").trim()
  );
}

/**
 * Ce à quoi l'assiette d'un élève peut être comparée, ce jour-là.
 *
 * @param localDate la date LOCALE du repas — celle que la ligne
 *   `protocol_events` porte déjà. On ne la recalcule pas ici: le fait sait
 *   quand il a eu lieu, et deux résolutions du même jour finiraient par
 *   diverger une nuit de changement d'heure.
 */
/**
 * MA BOUCHE dans mon foyer, ou `null`.
 *
 * ⚠️ FAIL-CLOSED, ET LE SENS COMPTE. Une lecture en panne, une personne sans
 * foyer, une ligne sans `member_id`: tout rend `null`, et `null` ferme les
 * plats DÉDIÉS (voir `dishIsForMouth`). Le pire cas est une case qui manque un
 * soir; le pire cas de l'autre sens est un fait de consommation fabriqué sur le
 * plat de quelqu'un d'autre, et un fait faux écrit est indélébile.
 */
async function mouthOf(db: Db, userId: string): Promise<string | null> {
  try {
    const { data, error } = await db
      .from("household_members")
      .select("member_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? null) as { member_id?: unknown } | null;
    return String(row?.member_id ?? "").trim() || null;
  } catch (error) {
    console.warn("[keel/planned_dish] mouth unreadable", error);
    return null;
  }
}

export async function loadPlannedDishContext(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<PlannedDishContext> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return EMPTY("no_composition");

  let catalogue: FoodCatalogueItem[] = [];
  try {
    catalogue = await loadFoodCatalogue(db);
  } catch (error) {
    console.warn("[keel/planned_dish] catalogue unreadable", error);
    return EMPTY("load_failed");
  }
  if (catalogue.length === 0) return EMPTY("load_failed");

  let row: Record<string, unknown> | null = null;
  let candidateCount = 0;
  try {
    // ── LE PLAN QUI POSSÈDE CE JOUR-LÀ, pas « le dernier écrit » ──────────
    //
    // C'était `order by created_at desc limit 1`, et le défaut est documenté:
    // « un seul clic générer un repas rend tout le plan de la semaine invisible
    // au matching » (`docs/keel/QA-CHAT-2026-08-05-RESULTS.md`, A3). Depuis que
    // deux plans peuvent coexister, c'était devenu pire qu'un défaut de
    // fraîcheur: un plan PRÉPARÉ pour la semaine prochaine aurait servi de
    // référence à la photo d'aujourd'hui, et la coche automatique aurait écrit
    // un fait FABRIQUÉ — append-only, indélébile, dans la table que le coach
    // lit.
    //
    // Le prédicat est en SQL et il est EXACT: `starts_on` et son terme
    // encadrent la date demandée. La borne d'âge de sept jours qui suivait
    // disparaît — elle devinait ce que la fenêtre affirme maintenant.
    //
    // `retired_at is null` n'est pas cosmétique: sans lui, un plan explicitement
    // remplacé pourrait encore faire écrire une coche automatique.
    const { data, error } = await db
      .from("student_generated_meals")
      .select("id, dishes, preparations, starts_on, duration_days, created_at")
      .eq("user_id", userId)
      .is("retired_at", null)
      .lte("starts_on", args.localDate)
      .order("starts_on", { ascending: false })
      .limit(4);
    if (error) throw error;
    // Plusieurs candidats démarrent avant cette date; c'est le PREMIER dont la
    // fenêtre la contient encore qui la possède. On lit quatre lignes plutôt
    // qu'une pour que la donnée antérieure à la contrainte d'exclusion (des
    // fenêtres qui se chevauchaient) ne fasse pas rendre `null` à tort.
    const candidates = (data ?? []) as Array<Record<string, unknown>>;
    row = ownerOfDay(candidates, args.localDate);
    candidateCount = candidates.length;

    // ── A8.0 · LE PLAN DU FOYER, POUR UN PROFIL RÉCLAMÉ ─────────────────
    //
    // Aucune ligne à SON nom ne possède le jour: si cette personne est un
    // membre réclamé, le plan qu'elle mange est celui de son foyer. Voir
    // `resolvePlanScope` — et le `.eq("plan_kind","household")` ET le
    // `.eq("household_id")` sont tous les deux la garde, pas l'un des deux.
    if (!row) {
      const scope = await resolvePlanScope(db, userId);
      if (scope.kind === "household_member") {
        const shared = await db
          .from("student_generated_meals")
          .select("id, dishes, preparations, starts_on, duration_days, created_at")
          .eq("plan_kind", "household")
          .eq("household_id", scope.householdId)
          .is("retired_at", null)
          .lte("starts_on", args.localDate)
          .order("starts_on", { ascending: false })
          .limit(4);
        if (shared.error) throw shared.error;
        const sharedCandidates = (shared.data ?? []) as Array<Record<string, unknown>>;
        row = ownerOfDay(sharedCandidates, args.localDate);
        candidateCount += sharedCandidates.length;
      }
    }
  } catch (error) {
    console.warn("[keel/planned_dish] composition unreadable", error);
    return EMPTY("load_failed");
  }
  // DEUX SILENCES DIFFÉRENTS, et ils ne veulent pas dire la même chose: « cet
  // élève n'a jamais rien composé » n'est pas « il a un plan, mais pas pour ce
  // jour-là ». Le second est le cas nominal d'un plan de quatre jours qu'on
  // interroge le cinquième.
  if (!row) {
    return candidateCount > 0
      ? { ...EMPTY("composition_out_of_window"), catalogue }
      : EMPTY("no_composition");
  }

  const dishes = Array.isArray(row.dishes) ? (row.dishes as PlannedDish[]) : [];
  if (dishes.length === 0) return EMPTY("no_composition");

  // LA FENÊTRE VIENT DE LA LIGNE. Elle était DÉDUITE de `created_at`, avec sa
  // propre mise en garde (« le décalage possible est d'un jour sur une
  // composition faite après minuit UTC »). Ce décalage n'existe plus: la date
  // est écrite, dans le calendrier local de l'élève, par celui qui a résolu son
  // fuseau.
  const startDate = String(row.starts_on ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return EMPTY("load_failed");

  const today = dishesForDate({
    dishes,
    startDate,
    durationDays: Number(row.duration_days) || undefined,
    onDate: args.localDate,
    // Voir `dishesForDate`: un plat sans jour ne prouve rien sur AUJOURD'HUI.
    includeUndated: false,
  });
  if (today.length === 0) {
    return { ...EMPTY("no_dish_today"), catalogue };
  }

  // ══════════════════════════════════════════════════════════════════════
  // A8.3 — SES PLATS SEULEMENT. La règle de l'écran, appliquée ici aussi.
  // ══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LE DÉFAUT QUE ÇA FERME, ET IL A ÉTÉ VU TOURNER. Le mandat A8.1 disait
  // « sa bande ③ du soir est construite depuis le plan du foyer, SES PLATS
  // SEULEMENT ». La moitié « ses plats seulement » n'était livrée que côté
  // ÉCRAN. Run réel du 2026-09-03: la bande du soir de Bo, profil réclamé,
  // portait « Compote pour Cy » — le plat composé pour l'enfant — avec sa
  // case. La cocher aurait écrit sous SON compte un « j'ai mangé » sur le plat
  // d'un autre: un fait daté, append-only, que rien ne signale comme faux.
  //
  // C'est le FRÈRE JUMEAU du défaut que le LOT C avait fermé dans
  // `buildPersonWeek` puis `HouseholdPlanCard`: fermé à un endroit, resté
  // ouvert à l'autre. La règle n'est pas réécrite ici — c'est `dishIsForMouth`,
  // le jumeau serveur de `dishIsFor`, appelé.
  //
  // ⚠️ LA LECTURE N'A LIEU QUE SI UN PLAT EST DÉDIÉ. Un plan personnel n'en
  // porte aucun, et ce chargeur tourne pour chaque élève à chaque tick du
  // soir: une requête de bouche inconditionnelle en ajouterait une par
  // personne pour un filtre qui ne retire jamais rien.
  const dedicated = today.some((d) => dishDedicatedTo(d.dish) !== null);
  // ⚠️ LA BOUCHE EST RÉSOLUE UNE FOIS, HORS DU FILTRE. Un `await` dans le
  // prédicat de `.filter()` ne s'attend pas — il rendrait une Promise, donc
  // TOUJOURS vraie, et le filtre ne filtrerait plus rien tout en ayant l'air
  // écrit. Le compilateur l'a refusé; on le note pour que personne ne le
  // « répare » en remettant l'appel dedans.
  const myMouth = dedicated ? await mouthOf(db, userId) : null;
  const mine = dedicated
    ? today.filter((d) => dishIsForMouth(d.dish, myMouth))
    : today;
  if (mine.length === 0) {
    // Un plan qui ne porterait QUE des plats dédiés à d'autres n'a rien à dire
    // à cette personne — et « rien pour toi » n'est pas « rien du tout »: le
    // motif reste `no_dish_today`, celui que les appelants savent déjà lire.
    return { ...EMPTY("no_dish_today"), catalogue };
  }

  const preparations = Array.isArray(row.preparations)
    ? (row.preparations as PlannedPreparation[])
    : [];

  return {
    mealId: String(row.id ?? "").trim() || null,
    dishes: mine.map((d) => ({ dish: d.dish, dishIndex: d.dishIndex })),
    // Sans elles, le rapprochement ne voit que ce que le plat AJOUTE et rate le
    // poulet qui vit dans la préparation — voir `PlannedDish.uses`.
    preparations,
    catalogue,
    reason: "loaded",
  };
}
