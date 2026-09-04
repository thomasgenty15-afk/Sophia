/**
 * DENSIFIER DANS LA BOÎTE — quand le volume est plein et que le besoin ne l'est pas.
 *
 * ── LE PROBLÈME, MESURÉ (2026-09-04, foyer `qa-mois-20260904`) ─────────────
 * Léa, 12 ans, 36 kg, `trains_hard`. L'ancre borne sa boîte à ce que porte son
 * besoin à la densité d'un plat ordinaire (`mealMassCapGrams`, ~520 g), et
 * `unmetDemand` dit ensuite `factor_clamped`, `gte_200` sur 4 journées: à la
 * densité RÉELLE de ses plats (tofu, couscous, légumes rôtis ≈ 1,0–1,2 kcal/g),
 * son besoin ne tient pas dans ce volume. Le plafond a raison de ne pas servir
 * plus de masse; mais personne ne faisait l'autre geste.
 *
 * ── CE QUE FAIT CE MODULE, ET POURQUOI C'EST L'ALGO ET PAS LE MODÈLE ────────
 * L'ancre applique UN facteur par boîte: elle monte ou descend la boîte entière
 * et ne change jamais les PROPORTIONS. Ici, à masse constante, des grammes
 * passent des items les MOINS denses vers les PLUS denses de la même boîte —
 * moins de légumes à l'eau, plus de tofu, de riz, de couscous — jusqu'à ce que
 * l'écart soit fermé ou qu'une garde arrête. Le moteur connaît la densité de
 * chaque item par le référentiel, le besoin de la bouche, et le plafond: rien
 * ici n'a besoin d'un appel modèle, et une correction par relance a déjà été
 * mesurée sur l'enveloppe des plans — levée 7 fois sur 7, adoptée 1 fois sur 7.
 * Déterministe, testable, sans latence ni variance.
 *
 * ── LES GARDES, ET CE QU'ELLES PROTÈGENT ───────────────────────────────────
 *   · PLANCHER DE LÉGUMES: un item des groupes légumes ne descend jamais sous
 *     70 % de ce que le modèle avait écrit. Sinon « densifier » viderait
 *     l'assiette de ses légumes, ce qui est le contraire du produit.
 *   · PLAFOND DE PROTÉINE: un item d'un groupe protéique ne monte jamais
 *     au-dessus de 150 %. Le plafond de protéine par bouche existe ailleurs
 *     (`protein_reference_weight.ts`); ici c'est la version « par boîte », en
 *     rapport, pour ne pas doubler une portion de viande au nom des kcal.
 *   · JAMAIS VERS UN ITEM NON RÉSOLU OU NON PESÉ: un item dont le référentiel ne
 *     dit pas la densité n'est ni source ni cible. Ce dépôt a mesuré 82 lignes
 *     d'huile sans quantité — une énergie invisible ferait sur-densifier ce qui
 *     est déjà dense, dans la direction qui ne se voit pas.
 *   · UN ITEM NE FAIT JAMAIS PLUS DE `MAX_ITEM_G`, quelle que soit sa densité.
 *   · MASSE CONSERVÉE, à l'octet: la boîte pèse après ce qu'elle pesait avant.
 *     C'est la propriété testée en premier, parce qu'elle dit que ce module ne
 *     contourne pas le plafond qu'il complète.
 *
 * ⛔ CE QUE CE MODULE NE FAIT PAS: il n'AJOUTE rien (pas de pain, pas d'huile
 * que la personne n'a pas déclarés), il ne change pas les ingrédients, il ne
 * touche pas aux boîtes partagées (une boîte à plusieurs n'a pas de besoin
 * unique). Quand la boîte n'a aucun item plus dense vers lequel déplacer, il
 * s'arrête et le DIT (`no_dense_target`): c'est là, et seulement là, qu'une
 * relance du modèle ou un extra déclaré ont un sens.
 */
import type { CompositionIndex, CompositionRef } from "./food_composition.ts";
import { resolveIngredient, YIELD_FACTORS } from "./food_composition.ts";
import type { FoodGroupRef } from "./tokens.ts";
import { dishEnergy } from "./plan_energy.ts";
import { preparationReadyGrams } from "./meal_generation.ts";
import type { DishIngredient } from "./meal_generation.ts";

export const VEG_FLOOR_RATIO = 0.7;
export const DEFAULT_FLOOR_RATIO = 0.5;
export const PROTEIN_CEILING_RATIO = 1.5;
export const DEFAULT_CEILING_RATIO = 2.0;
/** Un item de boîte ne dépasse jamais ça, quelle que soit sa densité. */
export const MAX_ITEM_G = 400;
/** En dessous, on ne déplace pas: un gramme ne change pas un repas. */
export const MIN_MOVE_G = 5;
/** Fermé quand il reste moins que ça — l'arrondi au gramme fait le reste. */
const CLOSED_BELOW_KCAL = 1;

export const VEG_GROUPS: ReadonlySet<string> = new Set<FoodGroupRef>([
  "cruciferous_veg",
  "leafy_greens",
  "non_starchy_veg",
]);
export const PROTEIN_GROUPS: ReadonlySet<string> = new Set<FoodGroupRef>([
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
  "poultry",
  "red_meat",
  "eggs",
  "tofu_tempeh",
]);

export interface DensifyItem {
  readonly term: string;
  readonly grams: number;
  readonly preparationId: string | null;
}
export interface DensifyBox {
  readonly boxId: string;
  readonly memberId: string;
  readonly day: string | null;
  readonly slot: string | null;
  readonly items: readonly DensifyItem[];
}
export interface ItemDensity {
  /** kcal par gramme SERVI. `null` quand le référentiel ne sait pas. */
  readonly kcalPerGram: number | null;
  readonly group: FoodGroupRef | null;
  readonly reason: "resolved" | "unresolved" | "prep_incomplete";
}
export type DensityOf = (item: DensifyItem) => ItemDensity;

export interface DensifyDeficit {
  readonly memberId: string;
  readonly day: string | null;
  readonly unmetKcal: number;
}

export const DENSIFY_STOPS = Object.freeze(
  ["closed", "floor", "ceiling", "no_dense_target", "no_box", "no_density"] as const,
);
export type DensifyStop = (typeof DENSIFY_STOPS)[number];

export interface DensifyMove {
  readonly boxId: string;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly grams: number;
  readonly kcalGained: number;
}
export interface DensifyResult {
  readonly moves: readonly DensifyMove[];
  /** Grammes par item et par boîte APRÈS déplacement — la boîte pèse pareil. */
  readonly grams: ReadonlyMap<string, readonly number[]>;
  readonly remaining: readonly DensifyDeficit[];
  readonly counts: {
    readonly mouth_days: number;
    readonly boxes_touched: number;
    readonly moved_g: number;
    readonly closed_kcal: number;
    readonly stopped: Record<DensifyStop, number>;
  };
}

function floorOf(original: number, group: FoodGroupRef | null): number {
  return Math.ceil(original * (group !== null && VEG_GROUPS.has(group) ? VEG_FLOOR_RATIO : DEFAULT_FLOOR_RATIO));
}
function ceilingOf(original: number, group: FoodGroupRef | null): number {
  const ratio = group !== null && PROTEIN_GROUPS.has(group) ? PROTEIN_CEILING_RATIO : DEFAULT_CEILING_RATIO;
  return Math.min(MAX_ITEM_G, Math.floor(original * ratio));
}

/**
 * Déplace des grammes dans les boîtes À UNE BOUCHE dont le jour a un écart
 * `factor_clamped`. Pur: rend les nouveaux grammes, ne touche à rien.
 */
export function densifyBoxes(args: {
  boxes: readonly DensifyBox[];
  deficits: readonly DensifyDeficit[];
  densityOf: DensityOf;
}): DensifyResult {
  const moves: DensifyMove[] = [];
  const gramsOut = new Map<string, number[]>();
  const remaining: DensifyDeficit[] = [];
  const stopped = Object.fromEntries(DENSIFY_STOPS.map((s) => [s, 0])) as Record<DensifyStop, number>;
  let boxesTouched = 0;
  let movedG = 0;
  let closedKcal = 0;
  let mouthDays = 0;

  for (const deficit of args.deficits) {
    if (!(deficit.unmetKcal > 0)) continue;
    mouthDays++;
    const own = args.boxes.filter((b) => b.memberId === deficit.memberId && (b.day ?? "") === (deficit.day ?? ""));
    if (own.length === 0) {
      stopped.no_box++;
      remaining.push(deficit);
      continue;
    }
    // ── LA PART DE CHAQUE BOÎTE DANS L'ÉCART DU JOUR: au prorata de ses kcal ──
    const prepared = own.map((box) => {
      const dens = box.items.map((it) => args.densityOf(it));
      const grams = box.items.map((it) => Math.max(0, Math.round(Number(it.grams) || 0)));
      let kcal = 0;
      for (const [i, d] of dens.entries()) if (d.kcalPerGram !== null) kcal += grams[i] * d.kcalPerGram;
      return { box, dens, grams, kcal };
    });
    const kcalTotal = prepared.reduce((n, p) => n + p.kcal, 0);
    if (!(kcalTotal > 0)) {
      stopped.no_density++;
      remaining.push(deficit);
      continue;
    }
    let dayLeft = deficit.unmetKcal;
    let dayStop: DensifyStop = "closed";
    for (const p of prepared) {
      const original = [...p.grams];
      let left = deficit.unmetKcal * (p.kcal / kcalTotal);
      let touched = false;
      let stop: DensifyStop = "closed";
      // ── LA BOUCLE: la MEILLEURE paire (gain le plus grand) tant que l'écart tient ──
      // Une paire = une source au-dessus de son plancher, une cible sous son
      // plafond, plus dense que la source. Quand il n'y en a plus, la garde qui
      // a fermé la dernière paire possible est NOMMÉE: le plancher d'abord (c'est
      // la protection du produit), le plafond ensuite, sinon « rien de plus dense ».
      for (let guard = 0; guard < 64 && left >= CLOSED_BELOW_KCAL; guard++) {
        let best: { src: number; dst: number; gain: number; room: number } | null = null;
        let floorBlocked = false;
        let ceilingBlocked = false;
        for (const [src, ds] of p.dens.entries()) {
          if (ds.kcalPerGram === null) continue;
          const srcRoom = p.grams[src] - floorOf(original[src], ds.group);
          for (const [dst, dd] of p.dens.entries()) {
            if (dst === src || dd.kcalPerGram === null || dd.kcalPerGram <= ds.kcalPerGram) continue;
            const dstRoom = ceilingOf(original[dst], dd.group) - p.grams[dst];
            if (srcRoom <= 0) { floorBlocked = true; continue; }
            if (dstRoom <= 0) { ceilingBlocked = true; continue; }
            const gain = dd.kcalPerGram - ds.kcalPerGram;
            if (best === null || gain > best.gain) best = { src, dst, gain, room: Math.min(srcRoom, dstRoom) };
          }
        }
        if (best === null) {
          stop = floorBlocked ? "floor" : ceilingBlocked ? "ceiling" : "no_dense_target";
          break;
        }
        const g = Math.min(Math.ceil(left / best.gain), best.room);
        if (g < MIN_MOVE_G) {
          // Trop peu pour changer un repas: fermé si l'écart est dérisoire,
          // sinon c'est la marge (plancher ou plafond) qui a manqué.
          const srcRoom = p.grams[best.src] - floorOf(original[best.src], p.dens[best.src].group);
          stop = left < MIN_MOVE_G * best.gain ? "closed" : (srcRoom <= best.room ? "floor" : "ceiling");
          break;
        }
        p.grams[best.src] -= g;
        p.grams[best.dst] += g;
        left -= g * best.gain;
        movedG += g;
        closedKcal += g * best.gain;
        touched = true;
        moves.push({ boxId: p.box.boxId, fromIndex: best.src, toIndex: best.dst, grams: g, kcalGained: Math.round(g * best.gain) });
      }
      if (touched) {
        boxesTouched++;
        gramsOut.set(p.box.boxId, p.grams);
      }
      dayLeft -= (deficit.unmetKcal * (p.kcal / kcalTotal)) - Math.max(0, left);
      if (stop !== "closed") dayStop = stop;
    }
    stopped[dayLeft < CLOSED_BELOW_KCAL ? "closed" : dayStop]++;
    if (dayLeft >= CLOSED_BELOW_KCAL) {
      remaining.push({ memberId: deficit.memberId, day: deficit.day, unmetKcal: Math.round(dayLeft) });
    }
  }
  return {
    moves,
    grams: gramsOut,
    remaining,
    counts: {
      mouth_days: mouthDays,
      boxes_touched: boxesTouched,
      moved_g: movedG,
      closed_kcal: Math.round(closedKcal),
      stopped,
    },
  };
}

/** kcal par gramme SERVI d'une fiche du référentiel — l'énergie est donnée par 100 g CRUS. */
export function servedDensityOf(ref: CompositionRef): number {
  return (ref.energyKcal * ref.atwaterDiscount / 100) / YIELD_FACTORS[ref.yieldClass];
}

/**
 * La densité d'un item de boîte, par le référentiel — jamais par un texte.
 *   · un item qui cite une préparation vaut ce que pèse cette préparation:
 *     ses kcal (`dishEnergy`) sur ses grammes prêts (`preparationReadyGrams`);
 *     son groupe est celui de l'ingrédient majoritaire en masse crue;
 *   · un item sans préparation est résolu par son terme.
 * Un item que le référentiel ne résout pas vaut `null`: ni source, ni cible.
 */
export function densityFromComposition(
  index: CompositionIndex,
  preparations: readonly { id: string; method: string; ingredients: readonly DishIngredient[] }[],
): DensityOf {
  const byPrep = new Map<string, ItemDensity>();
  for (const prep of preparations) {
    const energy = dishEnergy(index, { method: prep.method, ingredients: prep.ingredients });
    const ready = preparationReadyGrams(prep.ingredients, index);
    if (!energy.complete || energy.kcal === null || ready === null || !(ready > 0)) {
      byPrep.set(prep.id, { kcalPerGram: null, group: null, reason: "prep_incomplete" });
      continue;
    }
    let bestGroup: FoodGroupRef | null = null;
    let bestGrams = -1;
    for (const ing of prep.ingredients) {
      const ref = resolveIngredient(index, ing.term);
      const g = Number(ing.gramsRaw ?? 0);
      if (!ref || !(g > bestGrams)) continue;
      bestGrams = g;
      bestGroup = ref.foodGroupRef;
    }
    byPrep.set(prep.id, { kcalPerGram: energy.kcal / ready, group: bestGroup, reason: "resolved" });
  }
  return (item) => {
    if (item.preparationId !== null) {
      return byPrep.get(item.preparationId) ?? { kcalPerGram: null, group: null, reason: "unresolved" };
    }
    const ref = resolveIngredient(index, item.term);
    if (!ref) return { kcalPerGram: null, group: null, reason: "unresolved" };
    return { kcalPerGram: servedDensityOf(ref), group: ref.foodGroupRef, reason: "resolved" };
  };
}
