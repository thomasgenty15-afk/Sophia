/**
 * ══════════════════════════════════════════════════════════════════════════
 * KEEL — LA GARDE FINALE DU PLAN. Une seule passe, sur ce qui est ÉCRIT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE MODULE FERME, MESURÉ SUR LES PLANS DE PRODUCTION ─────
 * Le générateur de foyer REFUSE (422) ~2 500 lignes AVANT d'écrire le plan.
 * Tout ce qui se passe APRÈS cette garde — pliage des boîtes, ceinture des
 * exclusions, densification, rattrapage des bouches, vagues de courses —
 * MUTE le plan et ne repasse par aucune vérification. Le plan persisté n'est
 * donc pas celui qui a été validé, et quatre défauts l'ont prouvé :
 *
 *   ① une préparation cuisinée JEUDI, mangée MERCREDI ;
 *   ② une ligne de courses de poisson achetée LUNDI, cuisinée JEUDI, sans
 *     aucun drapeau de congélation — trois jours de chair crue au frigo ;
 *   ③ une exclusion de TABLE servie quand même, la violation n'étant listée
 *     que dans `issues` — un tableau que personne ne relit ;
 *   ④ un plan écrit avec ZÉRO boîte là où huit étaient attendues.
 *
 * Aucun des quatre n'était un mensonge du modèle : le modèle avait rendu un
 * plan cohérent, et c'est la chaîne d'APRÈS qui l'a défait.
 *
 * ── CE QUE CE MODULE EST, ET CE QU'IL N'EST PAS ──────────────────────────
 * Il est UNE passe PURE sur le payload EXACTEMENT tel qu'il part en base
 * (snake_case, pas la forme mémoire `GeneratedMeal`), appelable DEUX fois :
 *
 *   · à la composition, juste avant l'écriture ;
 *   · à l'ADOPTION, plus tard, quand aucun appel modèle n'a lieu — c'est le
 *     chemin qui n'a JAMAIS eu de garde, et c'est pour lui que ce module est
 *     typé sur la forme persistée plutôt que sur la forme mémoire.
 *
 * Il ne compose rien, ne relance rien, n'écrit rien. Il RÉPOND, et il PROPOSE
 * des réparations que l'appelant applique s'il le veut.
 *
 * ── LES DÉNOMINATEURS SONT LA MOITIÉ DU RÉSULTAT ─────────────────────────
 * ⛔ UNE CAUSE À ZÉRO DONT LE DÉNOMINATEUR EST À ZÉRO NE VEUT PAS DIRE
 * « PROPRE » : elle veut dire « JAMAIS ÉVALUÉE ». C'est la cicatrice n° 1 de
 * ce dépôt — « un lot désarmé ressemble trait pour trait à un lot qui
 * marche ». `counters.checked` porte les douze dénominateurs pour que la
 * différence se LISE, et le premier test de ce module est la CASE QUI PASSE :
 * zéro refus ET douze dénominateurs strictement positifs. Une garde qui refuse
 * tout ressemble aussi à une garde qui marche.
 *
 * ── L'ÉNERGIE SERVIE : ON MESURE, ON NE MORD PAS ─────────────────────────
 * Le moteur a CESSÉ de redimensionner les portions : l'ancre des bouches, la
 * densification des boîtes et les deux passes de croissance des casseroles
 * sont devenues des MESURES, et les grammes servis sont exactement ceux que le
 * modèle a composés — on arrête de rattraper après coup une composition
 * fausse, on fait en sorte que la composition tombe juste. Le prix de cette
 * décision est connu et CHIFFRÉ : un plan ne nourrit que 65 à 72 % de sa
 * propre enveloppe énergétique, même dans le cas SANS contrainte, et c'est le
 * redimensionnement d'après-coup qui cachait ce trou. Le retirer rend l'écart
 * réel — et un écart réel que personne ne mesure, c'est un faux chiffre
 * remplacé par du silence.
 *
 * `mouth_energy_short` dit cet écart, et rien de plus. ⛔ CE MODULE NE
 * RECALCULE PAS LES KILOCALORIES : elles demandent l'index de composition, qui
 * n'est PAS dans le payload persisté. L'appelant MESURE (`ctx.energy`), la
 * garde COMPARE et RAPPORTE. Et elle COMPTE au lieu de refuser dans les TROIS
 * politiques : sous-nourrir est une question de QUALITÉ DE COMPOSITION, pas une
 * incohérence du plan, et refuser un plan pour ça priverait des gens de dîner
 * sur un seuil que personne n'a encore calibré.
 *
 * ── LA SÉVÉRITÉ N'EST PAS DANS LE MODULE, ELLE EST DANS LA POLITIQUE ─────
 * Trois politiques livrées (`LOT_1` compte tout, `LOT_2` refuse le noyau,
 * `LOT_3` y ajoute les courses). Le déploiement se fait en changeant la
 * politique, jamais le code de la garde — c'est ce qui permet de MESURER un
 * lot avant de le laisser mordre.
 *
 * ── LE RISQUE DE PRÉCISION, ÉCRIT ICI ────────────────────────────────────
 * `title_promises_missing_preparation` est la seule règle qui lit de la PROSE.
 * On ne peut pas savoir quelle préparation a été retirée, donc on ne peut pas
 * comparer un titre à une absence : la règle se réduit à un VOCABULAIRE FERMÉ
 * de promesses de cuisine par lots (« une portion du batch », « préparé
 * dimanche »…) sur un plat qui ne CITE aucune préparation. Elle est étroite
 * exprès : un faux positif y coûte une phrase effacée, jamais une assiette.
 * Toutes les autres règles lisent des `term` DÉCLARÉS
 * (`dishBitesExclusion(..., surface: "ingredients")`), jamais la prose —
 * un faux positif sur la prose coûterait un plan entier.
 *
 * PURE MODULE: no I/O, no clock, no randomness, and it NEVER mutates its
 * input (épinglé par `structuredClone` côté test).
 */

import {
  cookedWindowVerdict,
  type KeptWhere,
  keptWindowDays,
  preparationHoldsRice,
} from "./fridge_window.ts";
import {
  type DeliveredDish,
  type DeliveredMouth,
  mealsDelivered,
} from "./meals_delivered.ts";
import { dishBitesExclusion } from "./food_exclusion_belt.ts";
import type { ForbiddenTerm } from "./forbidden_matcher.ts";
import {
  type DeclaredFood,
  type DietaryRegime,
  scanDietaryRegime,
} from "./dietary_regime.ts";
import { applyHouseRuleLock } from "./household_restriction_lock.ts";
import { PERISHABLE_AISLES } from "./grocery_waves.ts";
import { keepingOf } from "./food_keeping.ts";
// ⟳ 2026-09-24 (lot 2d-1) — importé du module du garde-manger, et non plus de
// tout `meal_generation.ts`.
import { normalizePantryTerm } from "./meal_pantry.ts";
import { addDays } from "./meal_plan_window.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// ⟳ 2026-09-24 · LOT 2a DU DÉCOUPAGE — TROIS BLOCS SONT SORTIS DE CE FICHIER
// ---------------------------------------------------------------------------
//
// Déplacés tels quels, sans changer une ligne de logique :
//   · ① ② ③ les types, les causes et les deux seuils → `final_plan_gate_types.ts`
//   · ④ les quatre politiques                          → `final_plan_gate_policy.ts`
//   · ④ bis/ter la livraison, les contrôles essentiels  → `final_plan_gate_delivery.ts`
// Tout est ré-exporté ici : aucun appelant ne change d'import. Les tests qui
// lisent le TEXTE de ce fichier lisent la famille entière
// (`scripts/source-families.json`).

import {
  ENERGY_SHORT_RATIO,
  FINAL_GATE_CAUSES,
  type FinalGateCause,
  type FinalGateCounters,
  type FinalGateOutcome,
  type GateBox,
  type GateBoxItem,
  type GateContext,
  type GateDish,
  type GateIngredient,
  type GatePlan,
  type GatePreparation,
  type GateRefusal,
  type GateRepair,
  type GateRepairKind,
  type GateSession,
  type GateSeverity,
  type GateShoppingLine,
  PROTEIN_CEILING_TOLERANCE,
} from "./final_plan_gate_types.ts";

export {
  ENERGY_SHORT_RATIO,
  FINAL_GATE_CAUSES,
  PROTEIN_CEILING_TOLERANCE,
} from "./final_plan_gate_types.ts";
export type {
  CellNutritionRow,
  DayNutritionRow,
  FinalGateCause,
  FinalGateChecked,
  FinalGateCounters,
  FinalGateOutcome,
  GateBox,
  GateBoxItem,
  GateContext,
  GateDish,
  GateIngredient,
  GatePlan,
  GatePreparation,
  GateRefusal,
  GateRepair,
  GateRepairAt,
  GateRepairKind,
  GateSession,
  GateSeverity,
  GateShoppingLine,
  GateSideCourse,
  GateUse,
  ShoppingCoverRow,
} from "./final_plan_gate_types.ts";
export {
  FINAL_GATE_POLICY_LOT_1,
  FINAL_GATE_POLICY_LOT_2,
  FINAL_GATE_POLICY_LOT_3,
  FINAL_GATE_POLICY_LOT_4,
} from "./final_plan_gate_policy.ts";
export {
  DELIVERY_STATES,
  ESSENTIAL_CONTROLS,
  finalGateDelivery,
  HOUSEHOLD_BETA_ESSENTIALS,
} from "./final_plan_gate_delivery.ts";
export type {
  DeliveryState,
  EssentialControl,
  FinalGateDelivery,
} from "./final_plan_gate_delivery.ts";

// ---------------------------------------------------------------------------
// ⑤ OUTILS PURS — normalisation, promesses de lots
// ---------------------------------------------------------------------------

/** Minuscules, sans diacritiques. Local et sans dépendance : voir l'en-tête. */
function flatten(text: unknown): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const FR_DAY_WORDS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

const EN_DAY_WORDS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/**
 * LE VOCABULAIRE FERMÉ DES PROMESSES DE CUISINE PAR LOTS.
 *
 * ⚠️ ÉTROIT EXPRÈS. On ne peut PAS comparer un titre à une préparation
 * disparue — on ne sait pas ce qui a été retiré. On ne cherche donc que les
 * tournures qui ANNONCENT un lot, sur un plat qui n'en cite aucun. Tout ce qui
 * n'est pas dans cette liste ne mord pas, et c'est le bon sens de l'erreur :
 * un faux négatif laisse passer une phrase, un faux positif efface une phrase
 * que quelqu'un a écrite.
 */
export const BATCH_PROMISE_MARKERS: readonly string[] = [
  "de la preparation",
  "des preparations",
  "de la casserole",
  "du batch",
  "from the batch",
  "portion of",
  ...FR_DAY_WORDS.flatMap((d) => [
    `prepare ${d}`,
    `preparee ${d}`,
    `prepares ${d}`,
    `preparees ${d}`,
    `cuisine ${d}`,
    `cuisinee ${d}`,
  ]),
  ...EN_DAY_WORDS.map((d) => `cooked on ${d}`),
];

/**
 * LA PHRASE QUI PROMET, dans un texte. `null` quand rien ne promet.
 *
 * On rend la PHRASE, pas le marqueur : c'est elle que la réparation retire, et
 * retirer le seul marqueur laisserait « Réchauffez la portion du . », c'est-à-
 * dire pire que rien (même arbitrage que `applyHouseRuleLock`, qui EFFACE le
 * `why` au lieu de le bricoler).
 */
function batchPromiseSentence(text: unknown): string | null {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  for (const sentence of raw.split(/(?<=[.!?])\s+/)) {
    const flat = flatten(sentence);
    if (BATCH_PROMISE_MARKERS.some((m) => flat.includes(m))) {
      const trimmed = sentence.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

// ⟳ 2026-09-11 · LOT E — `covers()` A ÉTÉ RETIRÉE, ET SA PLACE EST GARDÉE ICI
// POUR QUE PERSONNE NE LA RÉÉCRIVE.
//
// Elle répondait « ce terme de courses couvre-t-il cet ingrédient ? » par une
// inclusion de chaîne tolérante dans UN SEUL SENS: la ligne de courses devait
// être une sous-chaîne de l'ingrédient. « tomates » couvrait bien « tomates
// cerises »; « citrons » ne couvrait PAS « citron », et c'est ce sens-là que
// le modèle écrit le plus souvent. Mesuré sur la campagne du 2026-09-11:
// **8 alertes fausses sur 9**, toutes des singuliers/pluriels.
//
// ⛔ NE PAS LA « RÉPARER » EN RENDANT L'INCLUSION SYMÉTRIQUE: « lait » est une
// sous-chaîne de « laitue », et ce dépôt a déjà mesuré 12 faux positifs sur 12
// avec un matcher artisanal (`never-hand-roll-a-matcher-here`). La décision est
// portée par l'identité du référentiel — `final_plan_audit.ts::foodIdentityOf`.

/**
 * `1620` → `1 620`. ESPACE ASCII ORDINAIRE, et une implémentation locale :
 * `toLocaleString` dépend de l'ICU du runtime, donc du poste — ce module est
 * PUR et déterministe, un `detail` ne doit pas changer selon la machine.
 */
function spacedInt(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  const digits = String(Math.abs(rounded));
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return sign + out;
}

function asFoodGroup(value: unknown): FoodGroupRef | null {
  const slug = String(value ?? "").trim();
  return (FOOD_GROUP_REFS as readonly string[]).includes(slug)
    ? slug as FoodGroupRef
    : null;
}

function asKept(value: unknown): KeptWhere {
  return String(value ?? "") === "freezer" ? "freezer" : "fridge";
}

function declaredFoods(
  ingredients: readonly GateIngredient[],
): DeclaredFood[] {
  return (ingredients ?? [])
    .map((i) => ({ term: String(i?.term ?? ""), group: asFoodGroup(i?.group) }))
    .filter((i) => i.term.trim().length > 0);
}

// ---------------------------------------------------------------------------
// ⑥ LA GARDE
// ---------------------------------------------------------------------------

export function finalPlanGate(
  plan: GatePlan,
  ctx: GateContext,
): FinalGateOutcome {
  const dishes = plan.dishes ?? [];
  const preparations = plan.preparations ?? [];
  const sessions = plan.cooking_sessions ?? [];
  const shopping = plan.shopping_list ?? [];

  const refusals: GateRefusal[] = [];
  const repairs: GateRepair[] = [];
  const byCause = {} as Record<FinalGateCause, number>;
  for (const cause of FINAL_GATE_CAUSES) byCause[cause] = 0;
  const byKind: Record<GateRepairKind, number> = {
    drop_dangling_use: 0,
    drop_dangling_box_item: 0,
    drop_dangling_session_id: 0,
    strip_title_promise: 0,
    drop_house_rule_side_course: 0,
  };

  const severityOf = (cause: FinalGateCause): GateSeverity =>
    ctx.policy?.[cause] ?? "count";

  const refuse = (
    cause: FinalGateCause,
    fields: Partial<Omit<GateRefusal, "cause" | "severity" | "detail">> & {
      detail: string;
    },
  ): void => {
    byCause[cause]++;
    refusals.push({
      cause,
      severity: severityOf(cause),
      day: fields.day ?? null,
      slot: fields.slot ?? null,
      dish: fields.dish ?? null,
      preparation_id: fields.preparation_id ?? null,
      member_id: fields.member_id ?? null,
      term: fields.term ?? null,
      detail: fields.detail,
    });
  };

  const repair = (r: GateRepair): void => {
    byKind[r.kind]++;
    repairs.push(r);
  };

  const prepById = new Map<string, GatePreparation>();
  for (const p of preparations) {
    const id = String(p?.id ?? "").trim();
    if (id) prepById.set(id, p);
  }

  const rankOf = (day: unknown): number => {
    const token = String(day ?? "").trim();
    if (!token) return -1;
    return ctx.windowDays.indexOf(token);
  };

  let usesChecked = 0;
  let boxItemsChecked = 0;
  let sessionIdsChecked = 0;
  let cookedPairs = 0;
  let ricePairsChecked = 0;
  let ricePairs = 0;
  let ricePairsUnevaluated = 0;
  let tableDishes = 0;
  let boxedDishes = 0;

  // ═══════════════════════════════════════════════════════════════════════
  // ① LES RÉFÉRENCES PENDANTES — trois surfaces, trois causes, trois retraits
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Une seule cause pour les trois aurait rendu impossible la lecture qui
  // compte : un `uses` pendant est une mutation de composition, un item de
  // boîte pendant est une mutation de ceinture, un id de session pendant est
  // une mutation de plan de cuisine. Trois chaînes, trois responsables.
  dishes.forEach((dish, dishIndex) => {
    const title = String(dish?.title ?? "") || `dish[${dishIndex}]`;
    (dish?.uses ?? []).forEach((use, useIndex) => {
      usesChecked++;
      const id = String(use?.preparation_id ?? "").trim();
      if (prepById.has(id)) return;
      refuse("uses_dangling", {
        day: dish?.day ?? null,
        slot: dish?.slot ?? null,
        dish: title,
        preparation_id: id || null,
        detail:
          `le plat puise dans « ${id} », qui n'est pas dans les préparations`,
      });
      repair({
        kind: "drop_dangling_use",
        at: { dish: dishIndex, use: useIndex },
        from: id,
        to: null,
      });
    });

    (dish?.boxes ?? []).forEach((box, boxIndex) => {
      (box?.items ?? []).forEach((item, itemIndex) => {
        boxItemsChecked++;
        const id = String(item?.preparation_id ?? "").trim();
        // Un item SANS préparation est un aliment posé directement dans la
        // boîte : légitime, et ce n'est pas une référence pendante.
        if (!id || prepById.has(id)) return;
        refuse("box_item_dangling", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          term: String(item?.term ?? "") || null,
          detail: `la boîte « ${
            box?.id ?? boxIndex
          } » cite « ${id} », absent des préparations`,
        });
        repair({
          kind: "drop_dangling_box_item",
          at: { dish: dishIndex, box: boxIndex, item: itemIndex },
          from: id,
          to: null,
        });
      });
    });

    if ((dish?.boxes ?? []).length === 0) tableDishes++;
    else boxedDishes++;
  });

  sessions.forEach((session, sessionIndex) => {
    (session?.preparation_ids ?? []).forEach((rawId, idIndex) => {
      sessionIdsChecked++;
      const id = String(rawId ?? "").trim();
      if (prepById.has(id)) return;
      refuse("session_cites_unknown", {
        day: session?.day ?? null,
        preparation_id: id || null,
        detail: `la session du ${
          session?.day ?? "?"
        } cite « ${id} », absent des préparations`,
      });
      repair({
        kind: "drop_dangling_session_id",
        at: { session: sessionIndex, item: idIndex },
        from: id,
        to: null,
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // ② LA FENÊTRE CUITE — le défaut ① : cuisiné jeudi, mangé mercredi
  // ═══════════════════════════════════════════════════════════════════════
  //
  // On réutilise `cookedWindowVerdict` et `keptWindowDays`, sans les
  // réécrire : « deux copies d'un même nombre divergent, et c'est celle qu'on
  // regarde le moins qui garde l'ancienne ».
  //
  // ⟳ 2026-09-25 — ET LE RIZ, COMPTÉ À PART (`rice_eaten_too_late`). La
  // fenêtre générale décide d'abord (`holdsCookedRice: false`, le verdict
  // d'avant, inchangé); un couple qu'elle laisse passer et dont la casserole
  // porte du riz repasse avec `holdsCookedRice: true`. `Array.isArray` et pas
  // `!== null`: un contexte construit sans le champ ne doit pas se lire
  // « aucun riz au référentiel ».
  const riceSet = Array.isArray(ctx.riceRefs) ? new Set<string>(ctx.riceRefs) : null;
  for (const dish of dishes) {
    const title = String(dish?.title ?? "");
    const eatAt = rankOf(dish?.day);
    for (const use of dish?.uses ?? []) {
      const id = String(use?.preparation_id ?? "").trim();
      const prep = prepById.get(id);
      if (!prep) continue; // déjà compté en `uses_dangling`
      cookedPairs++;
      const cookAt = rankOf(prep.cook_on);
      if (cookAt < 0) {
        refuse("cook_day_unplaced", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `« ${
            prep.cook_on ?? "(aucun jour)"
          } » n'est pas dans la fenêtre du plan`,
        });
        continue;
      }
      if (eatAt < 0) {
        // Le plat n'est pas situable : le couple n'est pas gardé. On le DIT
        // plutôt que de l'écarter en silence — un couple non évalué est un
        // couple non gardé (`fridge_window.ts`, `not_evaluated`).
        refuse("cook_day_unplaced", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail: `le jour du plat « ${
            dish?.day ?? "(aucun)"
          } » est hors de la fenêtre`,
        });
        continue;
      }
      const window = keptWindowDays({
        kept: asKept(use?.kept),
        hasFreezer: ctx.hasFreezer === true,
        maxFridgeDays: ctx.maxFridgeDays,
        holdsCookedRice: false,
      });
      const verdict = cookedWindowVerdict(cookAt, eatAt, window);
      const holdsRice = riceSet !== null &&
        preparationHoldsRice(prep.ingredients ?? [], riceSet);
      if (riceSet === null) ricePairsUnevaluated++;
      else {
        ricePairsChecked++;
        if (holdsRice) ricePairs++;
      }
      if (verdict === "before_cooking") {
        refuse("eaten_before_cooked", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail:
            `cuisiné ${prep.cook_on}, mangé ${dish?.day} — avant sa cuisson`,
        });
      } else if (verdict === "too_late") {
        refuse("eaten_too_late", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          preparation_id: id,
          detail:
            `cuisiné ${prep.cook_on}, mangé ${dish?.day} — au-delà de ${window} jour(s) de conservation`,
        });
      } else if (holdsRice) {
        const riceWindow = keptWindowDays({
          kept: asKept(use?.kept),
          hasFreezer: ctx.hasFreezer === true,
          maxFridgeDays: ctx.maxFridgeDays,
          holdsCookedRice: true,
        });
        if (cookedWindowVerdict(cookAt, eatAt, riceWindow) === "too_late") {
          refuse("rice_eaten_too_late", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            preparation_id: id,
            detail:
              `riz cuit ${prep.cook_on}, mangé ${dish?.day} — au-delà du lendemain de sa cuisson`,
          });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ③ LES SESSIONS — une casserole citée que personne ne cuisine
  // ═══════════════════════════════════════════════════════════════════════
  const citedByDishes = new Set<string>();
  for (const dish of dishes) {
    for (const use of dish?.uses ?? []) {
      const id = String(use?.preparation_id ?? "").trim();
      if (id && prepById.has(id)) citedByDishes.add(id);
    }
  }
  const sessionDayOf = new Map<string, string[]>();
  for (const session of sessions) {
    for (const rawId of session?.preparation_ids ?? []) {
      const id = String(rawId ?? "").trim();
      if (!id) continue;
      const days = sessionDayOf.get(id) ?? [];
      days.push(String(session?.day ?? ""));
      sessionDayOf.set(id, days);
    }
  }
  for (const prep of preparations) {
    const id = String(prep?.id ?? "").trim();
    if (!id || !citedByDishes.has(id)) continue;
    const days = sessionDayOf.get(id);
    if (!days || days.length === 0) {
      refuse("preparation_without_session", {
        day: prep.cook_on ?? null,
        preparation_id: id,
        detail: `« ${
          prep.title ?? id
        } » est puisée par un plat mais aucune session ne la cuisine`,
      });
      continue;
    }
    for (const day of days) {
      if (day === String(prep.cook_on ?? "")) continue;
      refuse("session_day_mismatch", {
        day,
        preparation_id: id,
        detail: `session du ${
          day || "(aucun jour)"
        } pour une préparation datée ${prep.cook_on ?? "(aucun)"}`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ④ LES INTERDITS — exclusions, régimes, règle de la maison
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ `surface: "ingredients"`, JAMAIS `"all"`. Sur la prose, un faux positif
  // coûterait ici un PLAN ENTIER (la sévérité de `table_exclusion_served` est
  // `refuse` dès le lot 2), alors que chez l'appelant qui relance il ne coûte
  // qu'un appel modèle. La distinction est celle du module de ceinture.
  const exclusionPrepById = new Map(
    preparations.map((p) => [
      String(p?.id ?? ""),
      {
        id: String(p?.id ?? ""),
        title: String(p?.title ?? ""),
        method: String(p?.method ?? ""),
        ingredients: (p?.ingredients ?? []).map((i) => ({
          term: String(i?.term ?? ""),
        })),
      },
    ]),
  );
  const termsOfMember = new Map<string, readonly ForbiddenTerm[]>(
    (ctx.exclusions?.byMember ?? []).map((m) => [m.memberId, m.terms ?? []]),
  );
  const tableTerms = ctx.exclusions?.table ?? [];

  /** La surface d'un plat de table : ses propres ingrédients + ses casseroles. */
  const dishSurface = (dish: GateDish) => ({
    dish: {
      title: String(dish?.title ?? ""),
      method: String(dish?.method ?? ""),
      ingredients: (dish?.ingredients ?? []).map((i) => ({
        term: String(i?.term ?? ""),
      })),
    },
    uses: (dish?.uses ?? []).map((u) => ({
      preparationId: String(u?.preparation_id ?? ""),
    })),
  });

  /** La surface d'une boîte : ses items, et les casseroles qu'ils citent. */
  const boxSurface = (dish: GateDish, box: GateBox) => ({
    dish: {
      title: String(dish?.title ?? ""),
      method: "",
      ingredients: (box?.items ?? []).map((i) => ({
        term: String(i?.term ?? ""),
      })),
    },
    uses: (box?.items ?? [])
      .map((i) => String(i?.preparation_id ?? ""))
      .filter(Boolean)
      .map((preparationId) => ({ preparationId })),
  });

  // Les morsures recalculées ICI, pour `mealsDelivered` : voir ⑤.
  const openDishExclusionBites = new Map<GateDish, string[]>();
  const openDishRegimeBites = new Map<GateDish, string[]>();

  dishes.forEach((dish, dishIndex) => {
    const title = String(dish?.title ?? "");
    const boxes = dish?.boxes ?? [];
    const open = boxes.length === 0;

    // ── ④.a L'EXCLUSION DE LA TABLE ────────────────────────────────────
    if (open) {
      const bite = dishBitesExclusion({
        ...dishSurface(dish),
        preparationById: exclusionPrepById,
        terms: tableTerms,
        surface: "ingredients",
        // ⟳ 2026-09-21 — LA GARDE FINALE JUGE CASE PAR CASE, donc elle sait
        // le moment. Une exclusion écrite pour le matin ne doit pas refuser un
        // plan entier à cause d'un dîner.
        slot: dish?.slot ?? null,
      });
      if (bite.matched) {
        refuse("table_exclusion_served", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          term: bite.matched,
          preparation_id: bite.preparationIds[0] ?? null,
          detail: `plat de table : « ${bite.matched} » (${
            bite.because ?? "exclusion de la table"
          })`,
        });
      }
    } else {
      for (const box of boxes) {
        const bite = dishBitesExclusion({
          ...boxSurface(dish, box),
          preparationById: exclusionPrepById,
          terms: tableTerms,
          surface: "ingredients",
          slot: dish?.slot ?? null,
        });
        if (bite.matched) {
          refuse("table_exclusion_served", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            term: bite.matched,
            preparation_id: bite.preparationIds[0] ?? null,
            detail: `boîte « ${box.id} » : « ${bite.matched} » (${
              bite.because ?? "exclusion de la table"
            })`,
          });
        }
      }
    }

    // ── ④.b L'EXCLUSION D'UNE BOUCHE NOMMÉE SUR UN COUVERCLE ────────────
    for (const box of boxes) {
      for (const memberId of box?.member_ids ?? []) {
        const terms = termsOfMember.get(memberId) ?? [];
        if (terms.length === 0) continue;
        const bite = dishBitesExclusion({
          ...boxSurface(dish, box),
          preparationById: exclusionPrepById,
          terms,
          surface: "ingredients",
          slot: dish?.slot ?? null,
        });
        if (!bite.matched) continue;
        refuse("member_exclusion_served", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          member_id: memberId,
          term: bite.matched,
          preparation_id: bite.preparationIds[0] ?? null,
          detail:
            `boîte « ${box.id} » nommée pour cette bouche : « ${bite.matched} »`,
        });
      }
    }

    // ── ④.c LES MORSURES D'UN PLAT OUVERT, pour l'invariant des bouches ──
    if (open) {
      const bitten: string[] = [];
      if (tableTerms.length > 0) {
        const tableBite = dishBitesExclusion({
          ...dishSurface(dish),
          preparationById: exclusionPrepById,
          terms: tableTerms,
          surface: "ingredients",
          slot: dish?.slot ?? null,
        });
        // Une exclusion de TABLE mord toutes les bouches à la fois.
        if (tableBite.matched) {
          bitten.push(...ctx.mouths.map((m) => m.memberId));
        }
      }
      for (const m of ctx.mouths) {
        if (bitten.includes(m.memberId)) continue;
        const terms = termsOfMember.get(m.memberId) ?? [];
        if (terms.length === 0) continue;
        const bite = dishBitesExclusion({
          ...dishSurface(dish),
          preparationById: exclusionPrepById,
          terms,
          surface: "ingredients",
          slot: dish?.slot ?? null,
        });
        if (bite.matched) bitten.push(m.memberId);
      }
      if (bitten.length > 0) openDishExclusionBites.set(dish, bitten);
    }

    // ── ④.d LE RÉGIME ───────────────────────────────────────────────────
    //
    // Plat de table ⇒ le régime le plus strict de la maison. Plat en boîtes ⇒
    // la ligne de CHAQUE bouche nommée, sur la surface de SA boîte : le
    // grammage est par bouche, l'interdit aussi.
    const foldedFoods = (
      uses: readonly { preparationId: string }[],
    ): DeclaredFood[] => {
      const out: DeclaredFood[] = [];
      const seen = new Set<string>();
      for (const u of uses) {
        if (seen.has(u.preparationId)) continue;
        seen.add(u.preparationId);
        const prep = prepById.get(u.preparationId);
        if (prep) out.push(...declaredFoods(prep.ingredients));
      }
      return out;
    };

    if (open) {
      const regimesHere = new Set<DietaryRegime>();
      if (ctx.strictestRegime) regimesHere.add(ctx.strictestRegime);
      for (const m of ctx.mouths) if (m.regime) regimesHere.add(m.regime);
      const foods = [
        ...declaredFoods(dish?.ingredients ?? []),
        ...foldedFoods(dishSurface(dish).uses),
      ];
      const bitten: string[] = [];
      for (const regime of regimesHere) {
        const scan = scanDietaryRegime(regime, { items: foods });
        if (scan.breaches.length === 0) continue;
        bitten.push(regime);
        if (regime !== ctx.strictestRegime) continue;
        refuse("regime_forbidden_component", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          term: scan.breaches[0].matchedText || scan.breaches[0].token,
          detail: `plat de table contre le régime « ${regime} » : ${
            scan.breaches[0].token
          }`,
        });
      }
      if (bitten.length > 0) openDishRegimeBites.set(dish, bitten);
    } else {
      for (const box of boxes) {
        for (const memberId of box?.member_ids ?? []) {
          const regime = ctx.mouths.find((m) =>
            m.memberId === memberId
          )?.regime ?? null;
          if (!regime) continue;
          // ⚠️ LES TERMES DE LA BOÎTE COMPTENT, et c'est le seul endroit où
          // ils portent un aliment que ni le plat ni la casserole ne nomment :
          // la ceinture pose parfois une part directement sur un couvercle
          // (« poulet rôti », 150 g) sans qu'aucune ligne d'ingrédient ne
          // bouge. Les ignorer rendait ce plat végétarien aux yeux du régime.
          const foods = [
            ...declaredFoods(dish?.ingredients ?? []),
            ...declaredFoods(
              (box?.items ?? []).map((i) => ({ term: String(i?.term ?? "") })),
            ),
            ...foldedFoods(boxSurface(dish, box).uses),
          ];
          const scan = scanDietaryRegime(regime, { items: foods });
          if (scan.breaches.length === 0) continue;
          refuse("regime_forbidden_component", {
            day: dish?.day ?? null,
            slot: dish?.slot ?? null,
            dish: title,
            member_id: memberId,
            term: scan.breaches[0].matchedText || scan.breaches[0].token,
            detail: `boîte « ${box.id} » contre le régime « ${regime} » : ${
              scan.breaches[0].token
            }`,
          });
        }
      }
    }

    // ── ④.e LA PROMESSE DE LOT SANS LOT ─────────────────────────────────
    if ((dish?.uses ?? []).length === 0) {
      const sentence = batchPromiseSentence(dish?.method) ??
        batchPromiseSentence(dish?.title);
      if (sentence) {
        refuse("title_promises_missing_preparation", {
          day: dish?.day ?? null,
          slot: dish?.slot ?? null,
          dish: title,
          detail: `promet un lot sans citer de préparation : « ${sentence} »`,
        });
        repair({
          kind: "strip_title_promise",
          at: { dish: dishIndex },
          from: sentence,
          to: null,
        });
      }
    }
  });

  // ── ④.f LA RÈGLE DE LA MAISON ────────────────────────────────────────
  //
  // ⛔ REJOUÉE ICI, et ce n'est pas une redite : le chemin d'ADOPTION ne passe
  // JAMAIS par le verrou du générateur. Sans ce rappel, un plan adopté peut
  // servir ce que le foyer a exclu, et rien ne le dit.
  if ((ctx.houseRuleLabels ?? []).length > 0) {
    // ⟳ 2026-09-23 — LES À-CÔTÉS PASSENT AU VERROU AUSSI (note 7 du flux G).
    // Sans eux, un dessert au nutella adopté passait la garde: le verrou du
    // générateur les lit, celui-ci ne les recevait pas.
    const lockInput = dishes.map((d) => ({
      title: d?.title ?? "",
      why: d?.why ?? null,
      method: d?.method ?? "",
      ingredients: (d?.ingredients ?? []).map((i) => ({
        term: i?.term ?? "",
      })),
      side_courses: Array.isArray(d?.side_courses) ? [...d.side_courses] : [],
    }));
    const lock = applyHouseRuleLock(lockInput, ctx.houseRuleLabels);
    // ⛔ UN À-CÔTÉ MORDU EST RETIRÉ ET COMPTÉ, JAMAIS REFUSÉ — le même geste que
    // le générateur. Le verrou garde les entrées PAR IDENTITÉ: celles qui
    // manquent dans sa sortie sont celles qu'il a fait tomber. Aucun second
    // jugement ici: c'est le verrou qui décide, la garde ne fait que l'écrire
    // en réparation (`applyFinalGateRepairs`).
    lock.dishes.forEach((locked, dishIndex) => {
      const before = lockInput[dishIndex].side_courses;
      const after = Array.isArray(locked.side_courses) ? locked.side_courses : before;
      if (after.length === before.length) return;
      before.forEach((entry, item) => {
        if (after.includes(entry)) return;
        repair({
          kind: "drop_house_rule_side_course",
          at: { dish: dishIndex, item },
          from: String(entry?.term ?? ""),
          to: null,
        });
      });
    });
    for (const violation of lock.violations) {
      const cut = violation.lastIndexOf(":");
      const dishTitle = cut > 0 ? violation.slice(0, cut) : violation;
      const token = cut > 0 ? violation.slice(cut + 1) : null;
      const found = dishes.find((d) => String(d?.title ?? "") === dishTitle);
      refuse("house_rule_served", {
        day: found?.day ?? null,
        slot: found?.slot ?? null,
        dish: dishTitle,
        term: token,
        detail: `la maison a exclu « ${token} », et ce plat le sert`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑤ LES CASES ET LES BOUCHES — le défaut ④, et « personne sans repas »
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⚠️ `heldOff` EST VIDE, ET C'EST UN CHOIX DOCUMENTÉ. La forme persistée ne
  // porte NI `heldOff`, NI `regimeBites`, NI `exclusionBites` : ce sont des
  // sous-produits de la ceinture, jamais écrits en base. Le chemin d'adoption
  // ne les aura donc jamais. On RECALCULE les deux morsures ci-dessus (④.c et
  // ④.d) et on passe `heldOff: []` — conséquence assumée : `mealsDelivered`
  // ne peut plus attribuer la cause `held_off_*` à un retrait de boîte, elle
  // rendra `not_named`. La cause exacte vit de toute façon dans les causes
  // `*_exclusion_served` / `regime_forbidden_component` de CE module.
  const deliveredDishes: DeliveredDish[] = dishes.map((d) => ({
    title: String(d?.title ?? ""),
    day: d?.day ?? null,
    slot: d?.slot ?? null,
    memberId: d?.member_id ?? null,
    boxes: (d?.boxes ?? []).map((b) => ({
      id: String(b?.id ?? ""),
      memberIds: (b?.member_ids ?? []).map(String),
    })),
    heldOff: [],
    regimeBites: openDishRegimeBites.get(d) ?? [],
    exclusionBites: openDishExclusionBites.get(d) ?? [],
  }));
  const deliveredMouths: DeliveredMouth[] = ctx.mouths.map((m) => ({
    memberId: m.memberId,
    cells: m.cells,
    regime: m.regime,
  }));

  const expectedCells = new Set<string>();
  let mouthCells = 0;
  /** ⟳ 2026-09-14 · BÊTA 1A — le témoin: combien de plats à part sont dus. */
  let dedicatedObligations = 0;
  for (const m of ctx.mouths) {
    for (const c of m.cells ?? []) {
      const day = String(c?.day ?? "").trim();
      const slot = String(c?.slot ?? "").trim();
      if (!day || !slot) continue;
      mouthCells++;
      expectedCells.add(`${day}/${slot}`);
    }
  }

  const filledCells = new Set<string>();
  const boxedCells = new Set<string>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    if (!day || !slot) continue;
    filledCells.add(`${day}/${slot}`);
    if (!d?.member_id && (d?.boxes ?? []).length > 0) {
      boxedCells.add(`${day}/${slot}`);
    }
  }

  // `cell_without_dish` est compté UNE FOIS PAR CASE, jamais par bouche : le
  // trou est celui du PLAN. Le compter par bouche le gonflerait du nombre de
  // bouches et ferait accuser l'invariant d'un défaut qui a déjà son nom.
  for (const key of [...expectedCells].sort()) {
    if (filledCells.has(key)) continue;
    const [day, slot] = key.split("/");
    refuse("cell_without_dish", {
      day,
      slot,
      detail: "aucun plat n'est posé sur cette case",
    });
  }

  const delivered = mealsDelivered(deliveredDishes, deliveredMouths);
  const boxContract = ctx.boxContract;
  for (const mouth of delivered.mouths) {
    for (const row of mouth.missing) {
      // ⛔ PARTITION, JAMAIS DOUBLE COMPTE. Les manques de `mealsDelivered` se
      // répartissent en TROIS causes de ce module, et une ligne n'en produit
      // qu'une :
      //   · `no_dish`                       → déjà dit par `cell_without_dish`
      //   · `not_named` sur une case en BOÎTES, sous contrat → `box_missing`
      //   · tout le reste                   → `mouth_unfed`
      if (row.cause === "no_dish") continue;
      const key = `${row.day}/${row.slot}`;
      if (
        boxContract !== null && row.cause === "not_named" && boxedCells.has(key)
      ) {
        refuse("box_missing", {
          day: row.day,
          slot: row.slot,
          dish: row.dish,
          member_id: row.memberId,
          detail: "ce repas est mis en boîtes, et aucun couvercle ne la nomme",
        });
        continue;
      }
      refuse("mouth_unfed", {
        day: row.day,
        slot: row.slot,
        dish: row.dish,
        member_id: row.memberId,
        preparation_id: row.preparationId,
        term: row.matched,
        detail: `unfed:${row.cause}`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A — CE QUE LA GRILLE DOIT, SERVI OU NON
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA QUESTION EST « CETTE BOUCHE A-T-ELLE UN PLAT À ELLE SUR CETTE CASE »,
  // et la réponse se lit sur `member_id`, le champ que le parseur vient de
  // valider. Un plat de la table ne compte pas: c'est précisément celui dont
  // la grille a dit qu'il ne peut pas la nourrir.
  const dedicatedAt = new Set<string>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    const owner = String(d?.member_id ?? "").trim();
    if (!day || !slot || !owner) continue;
    // ⛔ UN COMPLÉMENT NE REMPLACE RIEN, voir `GateDish.complements_shared`.
    // Le compter ici ferait lire « elle a son plat » d'une personne qui mange
    // toujours la casserole interdite, avec une petite assiette en plus.
    if (d?.complements_shared === true) continue;
    dedicatedAt.add(`${day}/${slot}/${owner}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⟳ 2026-09-14 · BÊTA 1A — LE SECOND CANAL: UN COMPOSANT SERVI **PAR BOÎTE**
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ LA PREMIÈRE ÉCRITURE DE CE CONTRÔLE NE LISAIT QUE `member_id`, ET ELLE
  // A REFUSÉ UNE RÉFÉRENCE QUI NOURRIT CORRECTEMENT. Mesuré le 2026-09-14 en
  // rejouant `ref2.json` (foyer végane + omnivore) à travers le vrai handler:
  // **6 refus `dedicated_dish_missing`** sur un plan dont la clôture avait
  // mesuré « jambon 150 g / 37,1 g de protéines chez l'omnivore, tofu 150 g /
  // 29,6 g chez la végane, zéro jambon dans sa boîte ». La divergence était
  // servie — par le canal des BOÎTES, pas par un plat à part.
  //
  // ⛔ LES DEUX CANAUX EXISTENT DANS LE PRODUIT, ET LE CONTRÔLE DOIT LIRE LES
  // DEUX. N'en lire qu'un refuserait des plans qui servent la bonne assiette,
  // ce qui est exactement l'inverse du but: « ne pas livrer un résultat
  // incorrect comme utilisable » ne veut pas dire « refuser ce qui est
  // correct ».
  //
  // ── CE QUE « SERVI PAR BOÎTE » VEUT DIRE ICI, ET C'EST MESURABLE ────────
  // Cette bouche a, sur cette case, un contenant À SON SEUL NOM qui porte un
  // composant qu'AUCUN contenant d'une autre bouche ne porte. C'est la
  // définition du partage par boîte telle que le bloc de régime la commande:
  // « one box for the people that line binds … one box for everyone else with
  // the original ».
  //
  // ⚠️ UN CONTENANT IDENTIQUE À CELUI DES AUTRES NE COMPTE PAS. Deux boîtes
  // qui puisent la même casserole dans les mêmes proportions sont un PARTAGE,
  // pas une variante — et la bouche qui diverge y mange ce que sa ligne
  // refuse.
  //
  // ⚠️ LA CLÉ D'UN COMPOSANT EST SA CASSEROLE, sinon son terme normalisé. Deux
  // termes différents pour une même casserole restent LE MÊME composant.
  const itemKey = (it: GateBoxItem): string =>
    String(it?.preparation_id ?? "").trim() !== ""
      ? `p:${String(it.preparation_id).trim()}`
      : `t:${flatten(it?.term)}`;
  /** `jour/moment/bouche` → les composants que SEULE cette bouche reçoit. */
  const exclusiveAt = new Map<string, Set<string>>();
  {
    const boxesByCell = new Map<
      string,
      { mouths: readonly string[]; keys: string[] }[]
    >();
    for (const d of dishes) {
      const day = String(d?.day ?? "").trim();
      const slot = String(d?.slot ?? "").trim();
      if (!day || !slot) continue;
      const key = `${day}/${slot}`;
      const list = boxesByCell.get(key) ?? [];
      for (const b of d?.boxes ?? []) {
        list.push({
          mouths: (b?.member_ids ?? []).map((m) => String(m ?? "").trim()),
          keys: (b?.items ?? []).map(itemKey),
        });
      }
      boxesByCell.set(key, list);
    }
    for (const [cell, boxes] of boxesByCell) {
      const mouths = new Set(boxes.flatMap((b) => b.mouths).filter(Boolean));
      for (const mouth of mouths) {
        // ⛔ « CHEZ LES AUTRES » EST LU SUR LES CONTENANTS QUI NE NOMMENT PAS
        // CETTE BOUCHE. Un bac partagé qui la nomme AVEC d'autres n'est pas un
        // contenant « des autres »: il est le sien aussi.
        const ailleurs = new Set(
          boxes.filter((b) => !b.mouths.includes(mouth)).flatMap((b) => b.keys),
        );
        const sien = new Set(
          boxes
            .filter((b) => b.mouths.length === 1 && b.mouths[0] === mouth)
            .flatMap((b) => b.keys),
        );
        const propres = [...sien].filter((k) => !ailleurs.has(k));
        if (propres.length > 0) {
          exclusiveAt.set(`${cell}/${mouth}`, new Set(propres));
        }
      }
    }
  }
  const obligations = ctx.dedicated ?? [];
  for (const o of obligations) {
    const day = String(o?.day ?? "").trim();
    const slot = String(o?.slot ?? "").trim();
    const memberId = String(o?.memberId ?? "").trim();
    if (!day || !slot || !memberId) continue;
    dedicatedObligations++;
    const adresse = `${day}/${slot}/${memberId}`;
    // ⛔ LES DEUX CANAUX, ET UN SEUL SUFFIT. Voir le pavé de `exclusiveAt`.
    if (dedicatedAt.has(adresse) || exclusiveAt.has(adresse)) continue;
    // ⛔ SEULE L'IMPOSSIBILITÉ REFUSE. Voir le pavé de `dedicated_dish_missing`
    // et celui de `dietBaseEdible`: « elle ne peut RIEN manger ici » et « elle
    // mangerait mieux autre chose » ne se réparent pas au même endroit.
    if (o.reason === "regime" && o.baseEdible !== true) {
      refuse("dedicated_dish_missing", {
        day,
        slot,
        member_id: memberId,
        detail:
          "la base partagée de cette case ne peut pas nourrir cette bouche, et " +
          "aucun plat ne lui est attribué ici",
      });
      continue;
    }
    refuse("own_meal_dish_missing", {
      day,
      slot,
      member_id: memberId,
      detail: o.reason === "regime"
        ? "la variante réclamée pour cette bouche n'est pas servie ici -- elle " +
          "mange la base commune, qui lui convient sans lui donner ce qu'elle demande"
        : "cette bouche a déclaré son propre repas ici, et n'a pas de plat à elle",
    });
  }

  // ── LA CARDINALITÉ: UN REPAS LOGIQUE PAR CASE ──────────────────────────
  //
  // ⚠️ ON COMPTE LES PLATS SANS ADRESSE, et eux seuls. Un plat dédié et un
  // complément portent un `member_id`: deux contenants sur une case sont
  // normaux, deux REPAS concurrents ne le sont pas.
  const tableDishesAt = new Map<string, number>();
  for (const d of dishes) {
    const day = String(d?.day ?? "").trim();
    const slot = String(d?.slot ?? "").trim();
    if (!day || !slot) continue;
    if (String(d?.member_id ?? "").trim() !== "") continue;
    const key = `${day}/${slot}`;
    tableDishesAt.set(key, (tableDishesAt.get(key) ?? 0) + 1);
  }
  for (const key of [...tableDishesAt.keys()].sort()) {
    const n = tableDishesAt.get(key) ?? 0;
    if (n < 2) continue;
    const [day, slot] = key.split("/");
    refuse("cell_two_table_dishes", {
      day,
      slot,
      detail:
        `${n} plats de table sur cette case: chaque bouche y est servie ${n} fois`,
    });
  }

  if (boxContract !== null && boxContract.expected > 0) {
    const boxesInPlan = dishes.reduce((n, d) => n + (d?.boxes ?? []).length, 0);
    if (boxesInPlan === 0) {
      refuse("boxes_none_delivered", {
        detail:
          `${boxContract.expected} boîte(s) attendue(s), le plan n'en porte aucune`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑥ LES COURSES — le défaut ② : le poisson acheté trois jours trop tôt
  // ═══════════════════════════════════════════════════════════════════════
  // ⚠️ LE COMPTE DES TERMES D'INGRÉDIENT SURVIT À LA COMPARAISON QUI LES
  // UTILISAIT. `checked.ingredient_terms` reste le nombre de termes DISTINCTS
  // que les recettes citent: c'est ce qui permet de voir qu'un plan n'a pas
  // d'ingrédient du tout, indépendamment de l'audit par identité.
  const usedTerms = new Map<string, string>(); // normalisé → tel qu'écrit
  for (const dish of dishes) {
    for (const ing of dish?.ingredients ?? []) {
      const key = normalizePantryTerm(String(ing?.term ?? ""));
      if (key && !usedTerms.has(key)) usedTerms.set(key, String(ing?.term ?? ""));
    }
  }
  for (const prep of preparations) {
    for (const ing of prep?.ingredients ?? []) {
      const key = normalizePantryTerm(String(ing?.term ?? ""));
      if (key && !usedTerms.has(key)) usedTerms.set(key, String(ing?.term ?? ""));
    }
  }

  // Le besoin par terme : le RANG le plus tôt où quelqu'un en a besoin.
  //
  // ⛔ ON NE RÉUTILISE PAS `earliestCook` : elle ne connaît que les
  // préparations, et un plat qui cuisine le jour même a ses ingrédients à lui.
  // ⚠️ GAP CONNU, ÉCRIT ICI : on ne prend le jour d'un plat que lorsqu'il ne
  // puise dans AUCUNE préparation. Un plat qui réchauffe un lot ET ajoute des
  // herbes fraîches le jour même verra ses herbes datées par le lot, donc
  // potentiellement trop tôt. Élargir ferait des besoins plus précoces, donc
  // des refus que rien n'a mesuré ; le lot suivant tranchera avec un chiffre.
  const earliestRankByTerm = new Map<string, number>();
  const noteNeed = (term: unknown, rank: number): void => {
    const key = normalizePantryTerm(String(term ?? ""));
    if (!key || rank < 0) return;
    const known = earliestRankByTerm.get(key);
    if (known === undefined || rank < known) earliestRankByTerm.set(key, rank);
  };
  for (const prep of preparations) {
    const rank = rankOf(prep?.cook_on);
    for (const ing of prep?.ingredients ?? []) noteNeed(ing?.term, rank);
  }
  for (const dish of dishes) {
    if ((dish?.uses ?? []).length > 0) continue;
    const rank = rankOf(dish?.day);
    for (const ing of dish?.ingredients ?? []) noteNeed(ing?.term, rank);
  }

  // ── ⑥.a L'INGRÉDIENT QUE PERSONNE N'ACHÈTE, ET CELUI DONT ON N'A PAS ────
  //        ACHETÉ ASSEZ — ⟳ 2026-09-11 · LOT E, PAR IDENTITÉ ALIMENTAIRE
  //
  // ⛔ CE QUI A ÉTÉ RETIRÉ, ET POURQUOI ON NE L'A PAS « AMÉLIORÉ ». Ce bloc
  // comparait deux libellés normalisés avec `covers`, une inclusion de chaîne
  // ASYMÉTRIQUE: la ligne de courses devait être une SOUS-CHAÎNE de
  // l'ingrédient. « citrons » ne couvrait donc pas « citron », et les 9 alertes
  // de la campagne du 2026-09-11 en comptaient **8 fausses** — `citron`,
  // `tomate` (PERTE) et `carotte`, `citron`, `oignon`, `pita complète`,
  // `pomme de terre`, `tomate` (GAIN). Une garde fausse 8 fois sur 9 ne se
  // corrige pas par une seconde règle de chaînes: le plan demande l'identité
  // nutritionnelle commune, et c'est `final_plan_audit.ts` qui la résout.
  //
  // ⛔ ET AUCUN REPLI PAR LIBELLÉ N'EST GARDÉ. `ctx.shopping === null` veut
  // dire « pas contrôlé », et `checked.shopping_identities` le DIT. Garder
  // l'ancienne comparaison « au cas où » remettrait les 8 faux positifs dans
  // le produit en les appelant un filet de sécurité.
  const shoppingRows = ctx.shopping ?? null;
  let shoppingIdentities = 0;
  let shoppingQuantified = 0;
  let shoppingUnverified = 0;
  let shoppingNotPurchasable = 0;
  if (shoppingRows !== null) {
    for (const row of [...shoppingRows].sort((a, b) => a.identity < b.identity ? -1 : 1)) {
      shoppingIdentities++;
      // ⟳ 2026-09-12 · C3 — L'EAU DU ROBINET SORT DES QUATRE CAUSES D'ACHAT.
      // ⛔ ET ELLE NE TOMBE PAS DANS `shopping_unverified` : « non applicable »
      // n'est pas « non contrôlé » (faute de mesure n° 4 du lot 0). Elle a son
      // propre compteur, et elle reste dans le dénominateur des identités —
      // sinon un plan qui n'aurait que de l'eau se lirait « rien à regarder ».
      if (row.state === "not_purchasable") {
        shoppingNotPurchasable++;
        continue;
      }
      // ⟳ 2026-09-15 · BÊTA 2C — LA LIGNE QUE PERSONNE NE CUISINE. Elle reste
      // dans le dénominateur des identités (on l'a bien regardée), comme l'eau
      // du robinet juste au-dessus, et elle n'entre pas dans `quantified`: il
      // n'y a pas de besoin à comparer.
      if (row.state === "bought_unused") {
        refuse("ingredient_bought_unused", {
          term: row.displayTerm,
          detail: `« ${row.displayTerm} » : ${row.reason}`,
        });
        continue;
      }
      if (row.state === "covered_measured" || row.state === "short") shoppingQuantified++;
      if (row.state === "covered_measured") continue;
      if (row.state === "not_bought") {
        refuse("ingredient_not_bought", {
          term: row.displayTerm,
          detail:
            `« ${row.displayTerm} » n'est ni sur la liste de courses ni au garde-manger (${row.reason})`,
        });
        continue;
      }
      if (row.state === "short") {
        refuse("ingredient_short_bought", {
          term: row.displayTerm,
          detail: `« ${row.displayTerm} » : ${row.reason}`,
        });
        continue;
      }
      // ⛔ PAS DE REFUS ICI, ET C'EST DÉLIBÉRÉ. « On ne sait pas si la quantité
      // suffit » n'accuse ni le modèle ni le plan : il accuse ce qu'on n'a pas
      // pu lire. Le compter comme un écart ferait passer un contrôle incomplet
      // pour un défaut, c'est-à-dire exactement la faute n° 4 du lot 0 (« non
      // applicable n'est pas non contrôlé »), à l'envers.
      shoppingUnverified++;
    }
  }

  // ── ⑥.b LES LIGNES DE COURSES ────────────────────────────────────────
  let perishableLines = 0;
  /**
   * ⟳ 2026-09-12 · FERMETURE LOT 2 — LES LIGNES DONT LA CONSERVATION EST
   * INCONNUE. ⛔ À ZÉRO, la lecture a couvert toute la liste ; sans ce nombre,
   * une liste dont aucune ligne ne porte d'identité rendrait exactement le même
   * verdict qu'une liste parfaitement résolue.
   */
  let keepingUnknown = 0;
  for (const line of shopping) {
    const term = String(line?.term ?? "");
    const aisle = String(line?.aisle ?? "");
    const perishable = PERISHABLE_AISLES.has(aisle);
    if (perishable) perishableLines++;

    const buyOn = String(line?.buy_on ?? "").trim();
    if (!buyOn) {
      refuse("shopping_undated", {
        term,
        detail: `« ${term} » n'a pas de jour d'achat`,
      });
      continue;
    }

    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-12 · FERMETURE LOT 2 — LA MÊME LECTURE QUE LA DATATION
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ CE BLOC LISAIT LE GROUPE, ET LA DATATION LISAIT LE RAYON. Deux
    // lectures d'un même fait, qui ont divergé : le thon EN CONSERVE partait
    // au rayon `pantry` (donc daté comme du stable) et gardait le groupe
    // `white_fish` (donc refusé ici avec la fenêtre du poisson frais, un jour).
    // Le plan de fermeture l'exige : « faire utiliser cette lecture par le
    // calcul des dates ET par `finalPlanGate` ».
    //
    // ⛔ ET LE GESTE DU CONGÉLATEUR EST DANS LA LECTURE, plus dans un `continue`
    // posé après. Il décrit la même chose — ce que cet achat peut attendre.
    const keeping = keepingOf({
      ref: line?.ref ?? null,
      group: line?.food_group ?? null,
      frozen: line?.freeze_on_purchase === true,
    });
    if (keeping.kind === "unknown") {
      // ⛔ NON VÉRIFIÉ N'EST PAS SANS CONTRAINTE. On ne peut pas dire de cette
      // ligne qu'elle se garde ; on dit qu'on ne sait pas, et ça se compte.
      keepingUnknown++;
      if (perishable) {
        refuse("unclassified_perishable", {
          term,
          detail:
            `« ${term} » est au rayon « ${aisle} » sans groupe d'aliment — sa fenêtre crue est inconnue`,
        });
      }
      continue;
    }
    const window = keeping.rawWindowDays;
    // ⚠️ `stable` ET `frozen` N'ONT PAS DE FENÊTRE, ET C'EST UNE RÉPONSE, pas
    // une abstention : rien ne les fait attendre.
    if (window === null) continue;

    const needRank = earliestRankByTerm.get(normalizePantryTerm(term));
    if (needRank === undefined) continue; // rien ne l'utilise : pas de besoin à dater
    const needBy = addDays(ctx.startsOn, needRank);
    const lastGoodDay = addDays(buyOn, window);
    if (lastGoodDay >= needBy) continue;
    refuse("perishable_bought_too_early", {
      term,
      day: ctx.windowDays[needRank] ?? null,
      detail:
        `« ${term} » acheté le ${buyOn}, tenu ${window} jour(s), attendu cuisiné le ${needBy} — sans congélation`,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑦ L'ÉNERGIE SERVIE — l'écart que le redimensionnement cachait
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ ON NE RECALCULE RIEN. Les kilocalories demandent l'index de composition,
  // qui n'est pas dans le payload persisté : le chemin d'ADOPTION ne l'aura
  // jamais. L'appelant MESURE, ce bloc COMPARE. Quand il n'a pas pu mesurer
  // (`ctx.energy === null`), on ne rend PAS un zéro rassurant : on compte les
  // bouches en `energy_unmeasured`, et le dénominateur reste à zéro.
  let energyMouths = 0;
  let energyUnmeasured = 0;
  const energyRows = ctx.energy ?? null;
  if (energyRows === null) {
    energyUnmeasured = (ctx.mouths ?? []).length;
  } else {
    for (const row of energyRows) {
      const envelope = Number(row?.envelopeKcal);
      const delivered = Number(row?.deliveredKcal);
      // Une enveloppe absente, nulle, négative ou non finie ne se DIVISE pas —
      // et une ligne qu'on ne peut pas comparer n'est pas une ligne propre :
      // elle n'entre pas au dénominateur, elle entre au témoin.
      if (
        !Number.isFinite(envelope) || envelope <= 0 ||
        !Number.isFinite(delivered)
      ) {
        energyUnmeasured++;
        continue;
      }
      energyMouths++;
      if (delivered >= envelope * ENERGY_SHORT_RATIO) continue;
      const percent = Math.round((delivered / envelope) * 100);
      refuse("mouth_energy_short", {
        member_id: String(row?.memberId ?? "") || null,
        detail: `${String(row?.memberId ?? "(bouche sans nom)")}: ${
          spacedInt(delivered)
        } kcal servies pour ${spacedInt(envelope)} attendues (${percent} %)`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ⑧ ⟳ 2026-09-11 · LOT E — LA PORTION, SA CASE, SA JOURNÉE, SA PROTÉINE
  // ═══════════════════════════════════════════════════════════════════════
  //
  // ⛔ MÊME DISCIPLINE QUE ⑦ : ON NE RECALCULE RIEN. `final_plan_audit.ts` a
  // mesuré, ce bloc compare et nomme. Ce qui change par rapport à ⑦, c'est la
  // CLÉ : personne + DATE + créneau. Les agrégats par bouche laissaient un
  // dimanche à +30 % et un samedi à −30 % rendre une somme parfaite.
  //
  // ⚠️ LA CASE SANS PLAT EST DÉJÀ DITE PAR `cell_without_dish`, ET ON NE LA
  // REDIT PAS. `cell_without_portion` ne parle que des cases où un plat EST
  // posé : c'est exactement le trou du 2026-09-11, et le compter deux fois
  // ferait accuser l'invariant d'un défaut qui a déjà son nom.
  let portionCells = 0;
  let measuredCells = 0;
  // ⟳ 2026-09-13 · LOT 1 — les cases dont le contrat s'est abstenu.
  let cellEnergyNoTarget = 0;
  let measuredDays = 0;
  let proteinDays = 0;
  let proteinProtected = 0;
  let proteinUnmeasured = 0;
  let proteinWithinRounding = 0;
  const nutrition = ctx.nutrition ?? null;
  if (nutrition !== null) {
    for (const cell of nutrition.cells) {
      // ⛔ LE DÉNOMINATEUR NE COMPTE QUE LES CASES OÙ UNE PORTION EST ATTENDUE.
      // Y mettre les plats de table gonflerait `portion_cells` d'un nombre que
      // `cell_without_portion` ne peut pas atteindre — et un dénominateur plus
      // grand que la surface de sa règle fait lire « presque tout va bien » là
      // où la règle n'a simplement pas d'objet.
      if (!cell.portionExpected) continue;
      portionCells++;
      // ══════════════════════════════════════════════════════════════════
      // ⟳ 2026-09-13 · LOT 1 — UNE CASE SANS CIBLE N'EST NI JUSTE NI FAUSSE
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ ELLE ÉTAIT COMPTÉE COMME UNE RÉUSSITE, ET C'EST UN FAUX VERT.
      // `cellStateOf` rend `no_target` quand une portion EXISTE et que le
      // contrat s'est abstenu (âge inconnu, corps absent, ceinture illisible).
      // Son `servedKcal` est lisible, donc elle entrait dans `measured_cells`
      // — le dénominateur de `cell_energy_off` — sans pouvoir jamais en sortir
      // un refus. Mesuré le 2026-09-13 sur `perte-l1age`: six cases d'une
      // bouche d'âge inconnu se lisaient « 24 contrôles d'énergie réussis ».
      //
      // ⛔ ET ELLE NE PART PAS DANS `incomplete` NON PLUS. « Le contrôle a
      // tourné et n'a pas conclu » et « le contrôle n'a pas d'objet » sont deux
      // phrases différentes: la première demande une réparation, la seconde
      // décrit une protection qui fonctionne. C'est la quatrième liste de
      // `plan_validation.ts` (`not_applicable`) qui la reçoit.
      if (cell.state === "no_target") {
        cellEnergyNoTarget++;
        continue;
      }
      if (cell.servedKcal !== null) measuredCells++;
      if (cell.state === "no_portion") {
        if (!cell.hasDish) continue; // dit par `cell_without_dish`
        refuse("cell_without_portion", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail:
            `un plat est posé le ${cell.date} au ${cell.slot} et aucune portion n'est calculée pour cette bouche`,
        });
        continue;
      }
      if (cell.state === "unmeasurable") {
        refuse("cell_energy_unmeasurable", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail: `portion présente le ${cell.date} au ${cell.slot}, énergie illisible (${
            cell.gap ?? "motif inconnu"
          })`,
        });
        continue;
      }
      // ══════════════════════════════════════════════════════════════════
      // ⟳ 2026-09-12 · LOT 2 — DEUX ÉTATS, DEUX CAUSES, DEUX PHRASES
      // ══════════════════════════════════════════════════════════════════
      //
      // ⛔ AVANT, LES DEUX RENDAIENT `cell_energy_off`, ET SI `deltaPct`
      // EXISTAIT LE TEXTE NE DÉCRIVAIT QUE L'ÉCART CALORIQUE. Un
      // `bounds_off` a par construction un `deltaPct` DANS la tolérance — il
      // ne franchit ses bornes qu'après avoir passé le test d'énergie. Le
      // texte disait donc « 0 % contre 728 kcal visées » d'une case dont les
      // calories étaient justes, et demandait de réparer les calories.
      if (cell.state === "energy_off") {
        refuse("cell_energy_off", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail: `${cell.date} ${cell.slot} : ${
            cell.deltaPct === null
              ? "écart calorique illisible"
              : `${cell.deltaPct > 0 ? "+" : ""}${Math.round(cell.deltaPct)} % contre ${
                spacedInt(cell.targetKcal ?? 0)
              } kcal visées`
          }`,
        });
      } else if (cell.state === "bounds_off") {
        // ⚠️ ON NOMME CE QUI EST MESURÉ, ET ON NE DEVINE PAS LA BORNE. La
        // ligne ne porte pas le contrat; `plan_defect_pass.ts` le reçoit et
        // écrit la phrase chiffrée qui part au modèle.
        const mesures =
          cell.grams === undefined || cell.grams === null ||
            cell.densityPer100G === undefined || cell.densityPer100G === null
            ? "masse et densité non transmises"
            : `${spacedInt(cell.grams)} g cuits, ${
              spacedInt(cell.densityPer100G)
            } kcal/100 g` + (
              cell.densityRoundingPer100G === undefined ||
                cell.densityRoundingPer100G === null
                ? ""
                : `, borne d'arrondi ${
                  Math.round(cell.densityRoundingPer100G * 100) / 100
                } kcal/100 g`
            );
        refuse("cell_bounds_off", {
          day: cell.day,
          slot: cell.slot,
          member_id: cell.memberId,
          detail:
            `${cell.date} ${cell.slot} : calories dans la tolérance, mais hors bornes de masse ` +
            `ou du couloir de densité (${mesures})`,
        });
      }
    }
    for (const day of nutrition.days) {
      if (day.state !== "unmeasurable") measuredDays++;
      if (day.state === "energy_off") {
        refuse("day_energy_off", {
          // ══════════════════════════════════════════════════════════════
          // ⟳ 2026-09-12 · ÉTAPE C4 — LA DATE ENTRE DANS L'IDENTITÉ DU REFUS
          // ══════════════════════════════════════════════════════════════
          //
          // ⛔ SANS ELLE, DEUX JOURNÉES DE LA MÊME BOUCHE ONT LA MÊME CLÉ.
          // `violationKey` (`plan_repair_loop.ts`) joint cause/jour/moment/
          // plat/préparation/bouche/terme: à `day: null`, les deux journées du
          // tir n° 1 (−42 % et −43 %) rendaient UNE seule identité — leurs
          // ampleurs s'écrasaient, et une réparation qui corrigeait l'une
          // pouvait casser l'autre sans que `compareSafety` ni
          // `magnitudeComparison` le voient.
          //
          // ⚠️ C'EST UNE DATE, PAS UN JETON DE JOUR, et c'est la seule clé que
          // `DayNutritionRow` porte. Les causes de CASE (`cell_energy_off`)
          // continuent de porter le jeton, qui est ce que leur ligne porte.
          // Les deux se lisent dans le `detail`, qui écrit la date en toutes
          // lettres depuis le lot E.
          day: day.date,
          member_id: day.memberId,
          detail: `${day.date} : ${spacedInt(day.servedKcal ?? 0)} kcal servies pour ${
            spacedInt(day.coveredBudgetKcal ?? 0)
          } couvertes (${
            day.deltaPct === null ? "?" : `${day.deltaPct > 0 ? "+" : ""}${Math.round(day.deltaPct)}`
          } %)`,
        });
      }
      // ── LE PLANCHER PROTÉIQUE, ET LES TROIS ÉTATS QUI NE SE CONFONDENT PAS ─
      //
      // ⛔ « UN GROUPE D'INGRÉDIENTS CONTENANT DES PROTÉINES NE PROUVE PAS QUE
      // LE PLANCHER EN GRAMMES EST ATTEINT. » On compare des GRAMMES à des
      // GRAMMES, jamais une présence d'ancre protéique.
      if (day.protein.reason === "protected") {
        proteinProtected++;
        continue;
      }
      const floor = day.protein.coveredFloorG;
      if (floor === null || !(floor > 0) || day.proteinG === null) {
        proteinUnmeasured++;
        continue;
      }
      proteinDays++;
      // ⟳ 2026-09-21 — LE PLAFOND, SUR LA MÊME JOURNÉE ET LE MÊME
      // DÉNOMINATEUR. La borne est le plafond couvert × (1 + tolérance).
      const ceiling = day.protein.coveredCeilingG;
      if (
        ceiling !== null && ceiling > 0 &&
        day.proteinG > ceiling * (1 + PROTEIN_CEILING_TOLERANCE)
      ) {
        refuse("protein_ceiling_over", {
          day: day.date,
          member_id: day.memberId,
          detail: `${day.date} : ${
            Math.round(day.proteinG * 10) / 10
          } g de protéine pour un plafond couvert de ${
            Math.round(ceiling * 10) / 10
          } g (+${
            Math.round(((day.proteinG - ceiling) / ceiling) * 100)
          } %, tolérance ${Math.round(PROTEIN_CEILING_TOLERANCE * 100)} %)`,
        });
      }
      if (day.proteinG >= floor) continue;
      // ⟳ 2026-09-15 · BÊTA — LA BORNE D'ARRONDI, CALCULÉE PAR L'AUDIT. Une
      // journée sous le plancher de moins que ce que l'écriture en grammes
      // entiers peut déplacer est tenue — et comptée à part. Au-delà, c'est la
      // recette qui manque de protéine, et la phrase dit ce que la borne vaut.
      const rounding = day.proteinRoundingG ?? 0;
      if (day.proteinG + rounding >= floor) {
        proteinWithinRounding++;
        continue;
      }
      const percent = Math.round((day.proteinG / floor) * 100);
      refuse("protein_floor_short", {
        // ⟳ 2026-09-12 · ÉTAPE C4 — même raison qu'au-dessus: c'est cette clé
        // qui permet à `nutritionMagnitudes` de dire DE COMBIEN il manque, et
        // à la réparation de nommer la journée qu'elle doit recomposer.
        day: day.date,
        member_id: day.memberId,
        detail: `${day.date} : ${
          Math.round(day.proteinG * 10) / 10
        } g de protéine pour un plancher couvert de ${
          Math.round(floor * 10) / 10
        } g (${percent} %, ${day.protein.reason}, borne d'arrondi ${
          Math.round(rounding * 10) / 10
        } g)`,
      });
    }
  }

  const counters: FinalGateCounters = {
    checked: {
      uses: usesChecked,
      box_items: boxItemsChecked,
      session_ids: sessionIdsChecked,
      cooked_pairs: cookedPairs,
      rice_pairs_checked: ricePairsChecked,
      rice_pairs: ricePairs,
      rice_unevaluated: ricePairsUnevaluated,
      cells: expectedCells.size,
      // ⚠️ `mouthCells` ET PAS LE COMPTE DES OBLIGATIONS: voir le pavé du
      // champ. La question a été posée à chaque couple (bouche, case) dès lors
      // que la grille a tourné.
      dedicated_cells_checked: ctx.dedicated === null ? 0 : mouthCells,
      dedicated_obligations: dedicatedObligations,
      mouth_cells: mouthCells,
      shopping_lines: shopping.length,
      perishable_lines: perishableLines,
      keeping_unknown_lines: keepingUnknown,
      ingredient_terms: usedTerms.size,
      table_dishes: tableDishes,
      boxed_dishes: boxedDishes,
      energy_mouths: energyMouths,
      energy_unmeasured: energyUnmeasured,
      shopping_identities: shoppingIdentities,
      shopping_quantified: shoppingQuantified,
      shopping_unverified: shoppingUnverified,
      shopping_not_purchasable: shoppingNotPurchasable,
      portion_cells: portionCells,
      measured_cells: measuredCells,
      cell_energy_no_target: cellEnergyNoTarget,
      measured_days: measuredDays,
      protein_days: proteinDays,
      protein_protected: proteinProtected,
      protein_unmeasured: proteinUnmeasured,
      protein_within_rounding: proteinWithinRounding,
    },
    refusals_by_cause: byCause,
    repairs_by_kind: byKind,
  };

  return {
    ok: !refusals.some((r) => r.severity === "refuse"),
    refusals,
    repairs,
    counters,
  };
}

// ---------------------------------------------------------------------------
// ⑦ LES RÉPARATIONS — pures, un NOUVEAU plan
// ---------------------------------------------------------------------------

/**
 * APPLIQUE LES RETRAITS PROPOSÉS, SANS TOUCHER À L'ENTRÉE.
 *
 * ⚠️ LES INDEX SONT CEUX DU PLAN PASSÉ À `finalPlanGate`. On retire donc EN
 * BLOC, par ensembles d'index, jamais par `splice` successifs : un retrait
 * décale les suivants, et c'est le mode de corruption silencieuse le plus
 * facile à écrire dans ce genre de fonction.
 *
 * ⚠️ CETTE FONCTION N'APPLIQUE QUE CE QU'ON LUI DONNE. Elle ne filtre pas par
 * sévérité : c'est l'APPELANT qui décide s'il répare (et il le décide avec la
 * politique), parce que lui seul sait s'il a le droit de modifier ce plan-là.
 */
export function applyFinalGateRepairs(
  plan: GatePlan,
  repairs: readonly GateRepair[],
): GatePlan {
  const dropUses = new Map<number, Set<number>>();
  const dropBoxItems = new Map<string, Set<number>>();
  const dropSessionIds = new Map<number, Set<number>>();
  const stripSentences = new Map<number, string[]>();
  const dropSideCourses = new Map<number, Set<number>>();

  for (const r of repairs ?? []) {
    if (r.kind === "drop_dangling_use") {
      const d = r.at?.dish;
      const u = r.at?.use;
      if (typeof d !== "number" || typeof u !== "number") continue;
      const set = dropUses.get(d) ?? new Set<number>();
      set.add(u);
      dropUses.set(d, set);
    } else if (r.kind === "drop_dangling_box_item") {
      const d = r.at?.dish;
      const b = r.at?.box;
      const i = r.at?.item;
      if (
        typeof d !== "number" || typeof b !== "number" || typeof i !== "number"
      ) continue;
      const key = `${d}/${b}`;
      const set = dropBoxItems.get(key) ?? new Set<number>();
      set.add(i);
      dropBoxItems.set(key, set);
    } else if (r.kind === "drop_dangling_session_id") {
      const s = r.at?.session;
      const i = r.at?.item;
      if (typeof s !== "number" || typeof i !== "number") continue;
      const set = dropSessionIds.get(s) ?? new Set<number>();
      set.add(i);
      dropSessionIds.set(s, set);
    } else if (r.kind === "strip_title_promise") {
      const d = r.at?.dish;
      if (typeof d !== "number" || !r.from) continue;
      const list = stripSentences.get(d) ?? [];
      list.push(r.from);
      stripSentences.set(d, list);
    } else if (r.kind === "drop_house_rule_side_course") {
      const d = r.at?.dish;
      const i = r.at?.item;
      if (typeof d !== "number" || typeof i !== "number") continue;
      const set = dropSideCourses.get(d) ?? new Set<number>();
      set.add(i);
      dropSideCourses.set(d, set);
    }
  }

  const stripFrom = (text: unknown, sentences: readonly string[]): string => {
    let out = String(text ?? "");
    for (const sentence of sentences) {
      if (!sentence) continue;
      out = out.split(sentence).join("");
    }
    return out.replace(/\s{2,}/g, " ").trim();
  };

  const dishes = (plan.dishes ?? []).map((dish, dishIndex) => {
    const droppedUses = dropUses.get(dishIndex);
    const sentences = stripSentences.get(dishIndex);
    const boxes = (dish.boxes ?? []).map((box, boxIndex) => {
      const dropped = dropBoxItems.get(`${dishIndex}/${boxIndex}`);
      if (!dropped) return box;
      return {
        ...box,
        items: (box.items ?? []).filter((_, i) => !dropped.has(i)),
      };
    });
    const droppedSides = dropSideCourses.get(dishIndex);
    const next: GateDish = {
      ...dish,
      uses: droppedUses
        ? (dish.uses ?? []).filter((_, i) => !droppedUses.has(i))
        : (dish.uses ?? []),
      boxes,
      // La clé n'est posée que si un à-côté tombe: un plat d'avant le
      // 2026-09-23 ressort sans `side_courses`, comme il est entré.
      ...(droppedSides && Array.isArray(dish.side_courses)
        ? { side_courses: dish.side_courses.filter((_, i) => !droppedSides.has(i)) }
        : {}),
    };
    if (!sentences || sentences.length === 0) return next;
    return {
      ...next,
      title: stripFrom(next.title, sentences),
      method: stripFrom(next.method, sentences),
    };
  });

  const cooking_sessions = (plan.cooking_sessions ?? []).map(
    (session, index) => {
      const dropped = dropSessionIds.get(index);
      if (!dropped) return session;
      return {
        ...session,
        preparation_ids: (session.preparation_ids ?? []).filter((_, i) =>
          !dropped.has(i)
        ),
      };
    },
  );

  return {
    dishes,
    preparations: (plan.preparations ?? []).map((p) => p),
    cooking_sessions,
    shopping_list: (plan.shopping_list ?? []).map((l) => l),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-10 · LOT 6 — L'ADAPTATEUR VIT ICI, À CÔTÉ DU TYPE QU'IL PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ POURQUOI IL DÉMÉNAGE. Il était privé dans `draft_adopt.ts`, donc la seule
// façon d'atteindre cette garde était de passer par l'adoption — et l'adoption
// n'a AUCUN appelant vivant (mesuré le 2026-09-10). Résultat: `finalPlanGate`,
// ses 22 causes et ses 900 lignes n'ont **jamais tourné sur un plan réel**.
// C'est le mode d'échec « ceinture armée sur coffre vide », et il coûtait ici
// la totalité du dernier contrôle de sécurité du produit.
//
// ⚠️ IL NE VALIDE RIEN, ET C'EST VOULU. Il met une charge JSON à la forme que
// la garde lit; c'est la garde qui juge. Un adaptateur qui filtrerait au
// passage ferait un second avis, invisible, sur ce qui mérite d'être contrôlé.
export function asGatePlan(value: unknown): GatePlan {
  const src = value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const arr = (v: unknown): readonly unknown[] => Array.isArray(v) ? v : [];
  return {
    dishes: arr(src.dishes) as readonly GateDish[],
    preparations: arr(src.preparations) as readonly GatePreparation[],
    cooking_sessions: arr(src.cooking_sessions) as readonly GateSession[],
    shopping_list: arr(src.shopping_list) as readonly GateShoppingLine[],
  };
}
