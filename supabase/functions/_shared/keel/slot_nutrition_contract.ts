/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONTRAT D'UNE CASE — une personne, une DATE, un moment
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'IL FERME, MESURÉ LE 2026-09-11 (lot 0, § 4 et § 7 du rapport).
 * La même case recevait DEUX budgets, et le facteur est **2,86** :
 *
 *   · `PERTE / 2026-09-11 / dinner` — **858,90 kcal** pour le dimensionnement
 *     (`measureDish`, `wholeSlots` = le rythme entier) contre **2 454,00** pour
 *     le couloir envoyé au modèle (`requiredDensityFor`, `wholeSlots` = les
 *     seuls moments de ce jour-là) ;
 *   · `GAIN / 2026-09-11 / dinner` — **1 019,20** contre **2 912,00**.
 *
 * ⛔ ET LE VENDREDI PARTIEL IMPOSAIT SON COULOIR AUX AUTRES JOURS. Les couloirs
 * étaient repliés dans une `Map<slot, …>` sans clé de date : le dîner d'un jour
 * à une seule case écrasait les dîners des jours complets. Mesuré : les dîners
 * de samedi et dimanche méritaient **[123–250] visée 135** (PERTE) et
 * **[146–250] visée 160** (GAIN) ; ils ont reçu **[250–250] `above_askable_cap`**,
 * c'est-à-dire un couloir déclaré impossible. Les densités servies — 244, 241,
 * 247, 228 — sont collées au plafond de ce couloir-là.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE, ET ELLE TIENT EN UNE PHRASE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *     Le RYTHME ALIMENTAIRE fait le dénominateur ; la FENÊTRE DEMANDÉE fait
 *     la somme. Ce sont deux listes, et elles ne se confondent jamais.
 *
 * ⛔ UN REPAS DÉJÀ PASSÉ OU MANGÉ AILLEURS NE TRANSFÈRE PAS SON ÉNERGIE au
 * dîner qu'on compose. C'est la décision de périmètre n° 4 du chantier :
 * « le statut *journée partielle* ne signifie pas *manger toute la journée sur
 * les créneaux restants* ». `anchorFactorFor` (`mouth_anchor.ts`) énonçait
 * déjà cette règle et son repli — « sans ce repli, une bouche qui n'a rien
 * déclaré et dont le plan ne compose QUE le dîner voit sa journée entière
 * ramenée sur ce seul dîner : on demande 3 900 kcal à une assiette ». Ce
 * module la rend vraie pour le couloir de densité aussi.
 *
 * ⚠️ ET UN VRAI RYTHME À UN SEUL REPAS GARDE SA JOURNÉE ENTIÈRE. C'est la
 * moitié qui distingue les deux cas : quelqu'un qui a DÉCLARÉ ne manger que le
 * soir reçoit `rhythmSlots = ["dinner"]`, donc la journée entière — et
 * quelqu'un dont on ne compose que le soir reçoit `rhythmSlots` = son rythme,
 * donc sa part de dîner.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * UN SEUL OBJET, TROIS LECTEURS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le contrat est construit **avant le prompt**, puis lu par le **prompt**
 * (`requiredDensityFromContracts` → `densityFragment`), par le
 * **dimensionnement** (`composeKcal`, `bounds`) et par les **contrôles**. Trois
 * lectures d'un seul objet ne peuvent pas diverger ; trois arithmétiques
 * divergent au premier lot.
 *
 * ⛔ RIEN N'EST RECALCULÉ ICI. `dayTargetFor`, `slotPlanTargets`,
 * `plateBoundsFor`, `densityCorridorFor` et `relaxDayForCorridors` sont
 * appelées entières, une fois par journée ou par case. Une seconde écriture de
 * la part d'un moment est exactement ce que ce module existe pour supprimer.
 *
 * PURE: no I/O, no clock, no randomness.
 */
import {
  type DensityCorridor,
  type DensityIncompatibility,
  densityCorridorFor,
  type DayTargetGapClosed,
  dayTargetFor,
  MAX_ASKABLE_DENSITY_PER_100G,
  mergeCorridors,
  type PlateBounds,
  plateBoundsFor,
  relaxDayForCorridors,
  type RequiredDensity,
  type SlotDensity,
  slotOrderOf,
} from "./portion_sizing.ts";
import {
  type AnchorMouth,
  type AnchorReason,
  HOUSE_DEFAULT_SLOTS,
  slotPlanTargets,
  wholeDaySlots,
} from "./mouth_anchor.ts";
import type { CountingStance } from "./energy_gate.ts";

/**
 * POURQUOI UNE CASE N'A PAS DE NOMBRE. ⛔ Chaque motif est une ABSTENTION
 * NOMMÉE, jamais un zéro : « une valeur absente reste inconnue, jamais zéro ».
 *
 *   `computed`        le cas nominal ;
 *   `fixed_covered`   l'apport fixe déclaré couvre déjà toute la part de cette
 *                     case. ⚠️ CE N'EST PAS UNE CASE OUBLIÉE : elle a zéro
 *                     énergie à composer, et c'est un fait écrit par quelqu'un ;
 *   `no_day_target`   aucune cible de journée (voir `reason` de l'ancre) ;
 *   `no_slot_share`   le moment n'a aucun poids dans le rythme — jeton hors de
 *                     la liste fermée ;
 *   `no_plate_bounds` aucune borne d'assiette lisible pour ce corps.
 */
export const SLOT_CONTRACT_STATUSES = [
  "computed",
  "fixed_covered",
  "no_day_target",
  "no_slot_share",
  "no_plate_bounds",
] as const;
export type SlotContractStatus = (typeof SLOT_CONTRACT_STATUSES)[number];

/**
 * CE QU'UNE JOURNÉE DEMANDE AU PLAN, POUR UNE BOUCHE.
 *
 * ⛔ `rhythmSlots` N'EST PAS `coveredSlots`, ET C'EST TOUT LE LOT. Le premier
 * est le rythme alimentaire de la personne ce jour-là — ce qu'elle mange,
 * qu'on le compose ou non. Le second est ce que le plan couvre. Les confondre
 * donne la journée entière au dernier repas restant.
 */
export interface ContractDay {
  /** Le jeton de jour du moteur (`mon`, `tue`, …). */
  dayToken: string;
  /** La date LOCALE (`2026-09-11`). ⛔ C'est elle qui fait la clé du contrat. */
  date: string;
  /** Les cases que le plan couvre ce jour-là. */
  coveredSlots: readonly string[];
  /**
   * Les moments que rien ne peut déplacer : repas dehors, case gelée.
   * ⚠️ Les moments qu'un apport fixe couvre entièrement sont ajoutés d'office —
   * un shaker avalé ne se déplace pas.
   */
  lockedSlots: readonly string[];
  /** Moment → kcal déjà avalées ce jour-là (`slot_fixed_kcal.ts`). */
  fixedKcalBySlot: ReadonlyMap<string, number> | null;
}

/**
 * LE CONTRAT D'UNE CASE. ⛔ Sa clé est `memberId + date locale + slot`, et les
 * trois sont portés en clair : une clé reconstruite à la lecture est une clé
 * qui se reconstruit différemment chez le deuxième lecteur.
 */
export interface SlotNutritionContract {
  memberId: string;
  /** La date locale. Clé. */
  date: string;
  /** Le jeton de jour du moteur, pour les lecteurs qui parlent cette langue. */
  dayToken: string;
  slot: string;

  // ── LE RYTHME ─────────────────────────────────────────────────────────
  /** Le rythme alimentaire COMPLET de cette journée. Fait le DÉNOMINATEUR. */
  rhythmSlots: readonly string[];
  /** Les cases que le plan couvre ce jour-là. Fait la SOMME. */
  coveredSlots: readonly string[];
  /** Les cases que la redistribution n'a pas le droit de toucher. */
  lockedSlots: readonly string[];

  // ── L'ÉNERGIE ─────────────────────────────────────────────────────────
  /** La cible de la journée entière (`dayTargetFor`). */
  dayTargetKcal: number | null;
  /**
   * La somme des cases COUVERTES, avant arrondi. ⛔ C'est à elle qu'on compare
   * une journée partielle, jamais à `dayTargetKcal` : un plan partiel ne doit
   * pas la journée entière.
   */
  coveredBudgetKcal: number | null;
  /** Ce que les apports fixes retranchent de CETTE case. Jamais négatif. */
  fixedKcal: number;
  /** La part de la journée qui tombe sur ce moment, AVANT retrait des apports fixes. */
  mealTargetKcal: number | null;
  /** Ce qu'il reste À COMPOSER dans cette case. `0` = déjà couvert. */
  composeKcal: number | null;
  /**
   * ⟳ 2026-09-11 · LOT B — CE QUE LA REDISTRIBUTION A DÉPLACÉ SUR CETTE CASE,
   * signé, en kcal. `0` = la part n'a pas bougé.
   *
   * ⛔ ELLE RESTE DANS LA MÊME PERSONNE ET LA MÊME JOURNÉE, et **seulement
   * entre les cases couvertes** : déplacer de l'énergie vers un moment qu'on ne
   * compose pas la perdrait, et en prendre à un moment déjà mangé serait très
   * exactement le transfert que ce module interdit.
   */
  redistributedKcal: number;

  // ── LA MASSE ET LA DENSITÉ ────────────────────────────────────────────
  /** Grammes min / préférés / max, et la source des bornes. `null` = abstention. */
  bounds: PlateBounds | null;
  /** Densité min / préférée / max, l'incompatibilité et son motif. */
  corridor: DensityCorridor | null;

  // ── L'ÉTAT ────────────────────────────────────────────────────────────
  status: SlotContractStatus;
  /** Le motif de l'ancre quand `status === "no_day_target"`. Sinon `null`. */
  abstainReason: AnchorReason | null;
  /** Le moment est marqué « léger » par cette personne. */
  light: boolean;
}

export interface SlotContractCounters {
  /** Les cases examinées, tous jours confondus. */
  slots: number;
  /** Celles dont la part est entièrement couverte par un apport fixe. */
  fixed_covered: number;
  /** Celles dont le besoin a été raboté par `MAX_ASKABLE_DENSITY_PER_100G`. */
  capped: number;
  /** Les journées dont l'énergie a été déplacée pour rendre un couloir tenable. */
  relaxed_days: number;
  /** Pourquoi une journée n'a pas pu être relâchée. */
  relax_refused: Record<string, number>;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ CE QUE CE MODULE NE FAIT PAS : REBASER APRÈS LE MODÈLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le contrat est capturé AVANT le modèle, sur la grille. Si le modèle compose
 * un moment que la grille ne portait pas, le rythme de cette journée grandit —
 * donc le dénominateur, donc TOUTES ses cases. Deux sorties étaient possibles :
 * refaire la journée (et le contrat envoyé au prompt cesse d'être celui que le
 * dimensionnement consomme), ou garder le contrat et NOMMER la case orpheline.
 *
 * ⛔ ON GARDE LE CONTRAT. « Le contrat capturé avant le modèle est égal à celui
 * consommé par le dimensionnement et par le verdict » est un test de sortie du
 * chantier ; un rebasement le rendrait faux sur toute journée où le modèle
 * déborde. La case sans contrat est dimensionnée par la MÊME règle de rythme
 * (`wholeDaySlots`) et comptée dans `contract_missing`
 * (`generate-household-meal-v1`, journal `portion_sizing`). Elle doit rester à
 * zéro : au-dessus, c'est le prompt qu'il faut resserrer, pas le contrat qu'il
 * faut refaire.
 */

export interface SlotContractSet {
  memberId: string;
  contracts: readonly SlotNutritionContract[];
  /** `memberId|date|slot` → le contrat. La seule clé, et elle est datée. */
  byKey: ReadonlyMap<string, SlotNutritionContract>;
  dayTargetKcal: number | null;
  reason: AnchorReason;
  gapClosed: DayTargetGapClosed;
  counters: SlotContractCounters;
}

/** ⛔ LA CLÉ S'ÉCRIT ICI ET NULLE PART AILLEURS. */
export function contractKey(
  memberId: string,
  date: string,
  slot: string,
): string {
  return `${memberId}|${date}|${slot}`;
}

function emptyCounters(): SlotContractCounters {
  return {
    slots: 0,
    fixed_covered: 0,
    capped: 0,
    relaxed_days: 0,
    relax_refused: {},
  };
}

/**
 * LE RYTHME COMPLET D'UNE JOURNÉE — le dénominateur, et rien d'autre.
 *
 * ⛔ LE REPLI EST CELUI DE `dayCoverageOf` ET D'`anchorFactorFor`, PAS UN
 * TROISIÈME : rien de déclaré vaut les trois repas de la maison. Le déduire de
 * la grille est exactement le défaut du lot B.
 *
 * ⚠️ ET UN MOMENT COUVERT QU'ELLE N'A PAS DÉCLARÉ ENTRE DANS LE DÉNOMINATEUR.
 * Le plan le lui sert, donc il la nourrit ; l'ignorer gonflerait la part de
 * tous les autres.
 */
export function rhythmOfDay(
  rhythmSlots: readonly string[],
  coveredSlots: readonly string[],
): readonly string[] {
  return wholeDaySlots(rhythmSlots, coveredSlots);
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE CONSTRUCTEUR — une journée à la fois, les fonctions de production entières
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ DEUX APPELS DE `slotPlanTargets` PAR JOURNÉE, ET PAS UN DE PLUS. Le
 * premier retranche les apports fixes (c'est `composeKcal`), le second ne les
 * retranche pas (c'est `mealTargetKcal`). Les soustraire à la main ferait une
 * TROISIÈME arithmétique de la part d'un moment — celle qu'on relit le moins,
 * donc celle qui garderait l'ancienne règle.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function slotContractsFor(args: {
  mouth: AnchorMouth;
  coachCounting: CountingStance;
  /**
   * ⟳ 2026-09-11 · LOT B — LE RYTHME ALIMENTAIRE COMPLET DE CETTE BOUCHE.
   *
   * ⛔ REQUIS, jamais `?`, et c'est le paramètre du lot. Un défaut à « la
   * grille » aurait laissé le défaut en place sous un autre nom : c'est
   * exactement ce que `requiredDensityFor` faisait, et ça a coûté un facteur
   * 2,86 sur la case `PERTE / 2026-09-11 / dinner`. `[]` = rien de déclaré, et
   * vaut les trois repas de la maison (`HOUSE_DEFAULT_SLOTS`).
   */
  rhythmSlots: readonly string[];
  days: readonly ContractDay[];
  lightSlots: readonly string[];
  ageYears: number | null;
}): SlotContractSet {
  const day = dayTargetFor(args.mouth, args.coachCounting);
  const light = new Set(args.lightSlots);
  const counters = emptyCounters();
  const contracts: SlotNutritionContract[] = [];

  for (const d of args.days) {
    const covered = [...new Set(d.coveredSlots)];
    if (covered.length === 0) continue;
    const rhythm = rhythmOfDay(args.rhythmSlots, covered);

    // ── L'ABSTENTION DE JOURNÉE, NOMMÉE PAR CASE ────────────────────────
    if (day.kcal === null || !(day.kcal > 0)) {
      for (const slot of covered) {
        // ⚠️ `counters.slots` NE COMPTE PAS CES CASES-LÀ, et c'est la règle
        // d'avant ce lot: il compte les moments EXAMINÉS, c'est-à-dire ceux
        // pour lesquels il y avait quelque chose à examiner. Sans cible de
        // journée, tous les compteurs restent à zéro et seul le MOTIF sort.
        contracts.push({
          memberId: args.mouth.memberId,
          date: d.date,
          dayToken: d.dayToken,
          slot,
          rhythmSlots: rhythm,
          coveredSlots: covered,
          lockedSlots: [...d.lockedSlots],
          dayTargetKcal: null,
          coveredBudgetKcal: null,
          fixedKcal: 0,
          mealTargetKcal: null,
          composeKcal: null,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "no_day_target",
          abstainReason: day.reason,
          light: light.has(slot),
        });
      }
      continue;
    }

    // ── ① LA JOURNÉE, EN UN APPEL ───────────────────────────────────────
    // ⚠️ `coveredSlots: rhythm` — on demande la part de TOUS les moments du
    // rythme pour pouvoir nommer le budget couvert ET connaître les cases
    // laissées de côté. `wholeSlots` reste le dénominateur.
    const withFixed = slotPlanTargets({
      targetKcal: day.kcal,
      coveredSlots: rhythm,
      wholeSlots: rhythm,
      lightSlots: args.lightSlots,
      slotFixedKcal: d.fixedKcalBySlot,
    });
    const withoutFixed = slotPlanTargets({
      targetKcal: day.kcal,
      coveredSlots: rhythm,
      wholeSlots: rhythm,
      lightSlots: args.lightSlots,
      slotFixedKcal: null,
    });

    // ── ② CE QUE LA FENÊTRE COUVRE, AVANT TOUT ARRONDI ──────────────────
    let coveredBudget = 0;
    for (const slot of covered) coveredBudget += withFixed.bySlot.get(slot) ?? 0;

    // ── ③ LES BORNES, PUIS LE COULOIR ───────────────────────────────────
    const targets = new Map<string, number>();
    const maxGrams = new Map<string, number>();
    const locked = new Set(d.lockedSlots);
    for (const slot of covered) {
      // ⛔ UNE CASE QUE L'APPORT FIXE COUVRE EST FIGÉE : le shaker est avalé,
      // il ne se déplace pas. Même règle que `redistributeDayBudget`.
      if (withFixed.fixedCovered.has(slot)) {
        locked.add(slot);
        continue;
      }
      const t = withFixed.bySlot.get(slot) ?? null;
      if (t === null || !(t > 0)) continue;
      targets.set(slot, t);
      const b = plateBoundsFor({
        ageYears: args.ageYears,
        slot,
        slotTargetKcal: t,
        light: light.has(slot),
        appetite: args.mouth.body?.appetite ?? null,
      });
      if (b.physicalMax > 0) maxGrams.set(slot, b.max);
    }

    // ── ④ LA RELÂCHE, ET ELLE NE SORT PAS DE LA FENÊTRE ─────────────────
    //
    // ⛔ SEULEMENT ENTRE LES CASES COUVERTES. `redistributeDayBudget` conserve
    // la somme qu'on lui donne : lui donner le rythme entier ferait déplacer de
    // l'énergie vers un moment qu'on ne compose pas (perdue) ou en prendre à un
    // moment déjà mangé (le transfert interdit). On lui donne donc la fenêtre,
    // et la somme conservée est `coveredBudgetKcal`.
    const intenable = [...targets].some(([slot, t]) => {
      if (!maxGrams.has(slot)) return false;
      const c = densityCorridorFor({
        targetKcal: t,
        bounds: plateBoundsFor({
          ageYears: args.ageYears,
          slot,
          slotTargetKcal: t,
          light: light.has(slot),
          appetite: args.mouth.body?.appetite ?? null,
        }),
      });
      return c !== null && c.incompatible === "above_askable_cap";
    });
    let relaxed: ReadonlyMap<string, number> | null = null;
    if (intenable && maxGrams.size > 0) {
      const out = relaxDayForCorridors({
        targets,
        maxGramsBySlot: maxGrams,
        lockedSlots: [...locked],
        lightSlots: args.lightSlots,
      });
      if (out.moved > 0) {
        relaxed = out.targets;
        counters.relaxed_days++;
      } else {
        const why = out.refusal ?? "unknown";
        counters.relax_refused[why] = (counters.relax_refused[why] ?? 0) + 1;
      }
    }

    // ── ⑤ LE CONTRAT, CASE PAR CASE ─────────────────────────────────────
    for (const slot of covered) {
      counters.slots++;
      const base = {
        memberId: args.mouth.memberId,
        date: d.date,
        dayToken: d.dayToken,
        slot,
        rhythmSlots: rhythm,
        coveredSlots: covered,
        lockedSlots: [...locked],
        dayTargetKcal: day.kcal,
        coveredBudgetKcal: coveredBudget,
        fixedKcal: Math.max(0, d.fixedKcalBySlot?.get(slot) ?? 0),
        mealTargetKcal: withoutFixed.bySlot.get(slot) ?? null,
        abstainReason: null,
        light: light.has(slot),
      };
      if (withFixed.fixedCovered.has(slot)) {
        counters.fixed_covered++;
        contracts.push({
          ...base,
          composeKcal: 0,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "fixed_covered",
        });
        continue;
      }
      const planned = withFixed.bySlot.get(slot) ?? null;
      if (planned === null || !(planned > 0)) {
        contracts.push({
          ...base,
          composeKcal: null,
          redistributedKcal: 0,
          bounds: null,
          corridor: null,
          status: "no_slot_share",
        });
        continue;
      }
      const target = relaxed?.get(slot) ?? planned;
      const bounds = plateBoundsFor({
        ageYears: args.ageYears,
        slot,
        slotTargetKcal: target,
        light: light.has(slot),
        appetite: args.mouth.body?.appetite ?? null,
      });
      if (!(bounds.physicalMax > 0)) {
        contracts.push({
          ...base,
          composeKcal: target,
          redistributedKcal: target - planned,
          bounds: null,
          corridor: null,
          status: "no_plate_bounds",
        });
        continue;
      }
      const corridor = densityCorridorFor({ targetKcal: target, bounds });
      if (corridor !== null && corridor.minPer100G === MAX_ASKABLE_DENSITY_PER_100G) {
        counters.capped++;
      }
      contracts.push({
        ...base,
        composeKcal: target,
        redistributedKcal: target - planned,
        bounds,
        corridor,
        status: corridor === null ? "no_plate_bounds" : "computed",
      });
    }
  }

  const byKey = new Map<string, SlotNutritionContract>();
  for (const c of contracts) byKey.set(contractKey(c.memberId, c.date, c.slot), c);
  return {
    memberId: args.mouth.memberId,
    contracts,
    byKey,
    dayTargetKcal: day.kcal,
    reason: day.reason,
    gapClosed: day.gapClosed,
    counters,
  };
}

/**
 * RECOLLER PLUSIEURS JEUX DE CONTRATS D'UNE MÊME BOUCHE.
 *
 * ⛔ ELLE EXISTE POUR UNE SEULE RAISON, ET ELLE EST NOMMÉE : l'instrument de
 * mesure (`scripts/2026-09-11-mesure-grille.ts`) doit pouvoir REFAIRE ce que le
 * moteur a envoyé le 2026-09-11 — c'est-à-dire un rythme lu dans la grille,
 * jour par jour — pour comparer sa phrase, CARACTÈRE POUR CARACTÈRE, à celle du
 * prompt archivé. Sans cette reconstruction, l'instrument perdrait la seule
 * épreuve qui prouve que ses entrées figées sont les bonnes.
 *
 * ⚠️ ELLE NE RECALCULE RIEN et ne mélange jamais deux bouches : les contrats
 * sont concaténés, les compteurs additionnés, et un jeu vide rend un jeu vide.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function mergeSlotContractSets(
  sets: readonly SlotContractSet[],
): SlotContractSet {
  const first = sets[0];
  if (first === undefined) {
    return {
      memberId: "",
      contracts: [],
      byKey: new Map(),
      dayTargetKcal: null,
      reason: "no_body",
      gapClosed: "none",
      counters: emptyCounters(),
    };
  }
  const counters = emptyCounters();
  const contracts: SlotNutritionContract[] = [];
  for (const set of sets) {
    if (set.memberId !== first.memberId) {
      throw new Error("mergeSlotContractSets: deux bouches différentes");
    }
    contracts.push(...set.contracts);
    counters.slots += set.counters.slots;
    counters.fixed_covered += set.counters.fixed_covered;
    counters.capped += set.counters.capped;
    counters.relaxed_days += set.counters.relaxed_days;
    for (const [why, n] of Object.entries(set.counters.relax_refused)) {
      counters.relax_refused[why] = (counters.relax_refused[why] ?? 0) + n;
    }
  }
  const byKey = new Map<string, SlotNutritionContract>();
  for (const c of contracts) byKey.set(contractKey(c.memberId, c.date, c.slot), c);
  return {
    memberId: first.memberId,
    contracts,
    byKey,
    dayTargetKcal: first.dayTargetKcal,
    reason: first.reason,
    gapClosed: first.gapClosed,
    counters,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE PLI VERS LE PROMPT — compatibles ensemble, incompatibles séparés
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ ON NE FUSIONNE PAS TOUS LES DÎNERS PAR LEUR VALEUR MAXIMALE, et c'est la
 * règle explicite du chantier : « une consigne commune n'est possible que si
 * les contrats sont EFFECTIVEMENT COMPATIBLES et les cases concernées restent
 * IDENTIFIABLES. »
 *
 * Deux occurrences d'un même moment se rangent donc en GRAPPES :
 *   · leurs couloirs se croisent  ⇒ une seule ligne, `max(Dmin)` / `min(Dmax)`,
 *     et elle porte LES JOURS qu'elle couvre ;
 *   · leurs couloirs sont disjoints ⇒ DEUX lignes, chacune avec ses jours.
 *
 * ⛔ CE QUI CHANGE PAR RAPPORT AU 2026-09-10. Une intersection vide rendait une
 * ligne unique, rabattue sur son plancher (`min === max`), avec le motif
 * `empty_intersection` et la phrase « these days need different recipes ». Le
 * modèle recevait donc un point au lieu d'une bande, pour DEUX jours, et
 * n'avait aucun moyen de savoir lequel demandait quoi. Il reçoit maintenant les
 * deux bandes, datées. Le compteur `empty_intersection` garde son sens exact —
 * « combien de moments ont dû être SÉPARÉS » — et le commentaire qui dit
 * « s'il grimpe, la sortie est une recette séparée » devient la description de
 * ce que le code fait.
 *
 * PURE: no I/O, no clock, no randomness.
 */
function clustersOf(
  rows: readonly { days: string[]; corridor: DensityCorridor }[],
): { days: string[]; corridor: DensityCorridor }[] {
  const out: { days: string[]; corridor: DensityCorridor }[] = [];
  for (const row of rows) {
    let placed = false;
    for (const cluster of out) {
      // ⛔ LA COMPATIBILITÉ SE LIT SUR LES BORNES, JAMAIS SUR LE JETON.
      // `mergeCorridors` donne la PRIORITÉ à `above_askable_cap` quand un des
      // deux côtés le porte — donc un couloir [250, 250] plafonné fondu avec un
      // [100, 134] rendait « above_askable_cap » et l'intersection vide
      // disparaissait. Mesuré en écrivant ce module : la grappe se formait
      // quand même, et les deux jours repartaient avec 250.
      const bas = Math.max(cluster.corridor.minPer100G, row.corridor.minPer100G);
      const haut = Math.min(cluster.corridor.maxPer100G, row.corridor.maxPer100G);
      if (bas > haut) continue;
      const merged = mergeCorridors(cluster.corridor, row.corridor);
      cluster.corridor = merged;
      cluster.days = [...cluster.days, ...row.days];
      placed = true;
      break;
    }
    if (!placed) out.push({ days: [...row.days], corridor: row.corridor });
  }
  return out;
}

/**
 * LE CONTRAT VU PAR LE PROMPT — `RequiredDensity`, la forme que les cartes et
 * le calendrier lisent déjà.
 *
 * ⛔ SOUS PLANCHER TCA (`gapClosed: "restriction_floor"`), TOUT PART DANS
 * `floorOnly` : le nombre continue d'atteindre le modèle par le plancher
 * COMMUN du bloc, il cesse d'être attaché à quelqu'un. Règle inchangée.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function requiredDensityFromContracts(
  set: SlotContractSet,
  floors: { normal: number; light: number },
): RequiredDensity {
  const bySlot = new Map<
    string,
    { days: string[]; corridor: DensityCorridor; light: boolean }[]
  >();
  const distinctMins = new Map<string, Set<number>>();
  for (const c of set.contracts) {
    if (c.corridor === null) continue;
    const list = bySlot.get(c.slot) ?? [];
    list.push({ days: [c.dayToken], corridor: c.corridor, light: c.light });
    bySlot.set(c.slot, list);
    const seen = distinctMins.get(c.slot) ?? new Set<number>();
    seen.add(c.corridor.minPer100G);
    distinctMins.set(c.slot, seen);
  }

  const kept: SlotDensity[] = [];
  let split = 0;
  for (const [slot, rows] of bySlot) {
    const isLight = rows.some((r) => r.light);
    const floor = isLight ? floors.light : floors.normal;
    const clusters = clustersOf(rows);
    if (clusters.length > 1) split++;
    for (const cluster of clusters) {
      const c = cluster.corridor;
      kept.push({
        slot,
        // ⟳ 2026-09-11 · LOT B — LES JOURS QUE CETTE LIGNE COUVRE.
        // ⛔ SANS EUX, DEUX LIGNES DU MÊME MOMENT SONT INDISCERNABLES, et le
        // chantier demande que « les cases concernées restent identifiables ».
        days: [...new Set(cluster.days)],
        kcalPer100G: c.minPer100G,
        minPer100G: c.minPer100G,
        maxPer100G: c.maxPer100G,
        preferredPer100G: c.preferredPer100G,
        neededMinPer100G: c.neededMinPer100G,
        incompatible: c.incompatible,
        redundantMin: !(c.minPer100G > floor),
        occurrences: cluster.days.length,
        light: isLight,
        targetAnchoredPer100G: c.targetAnchoredPer100G,
      });
    }
  }
  // ⛔ L'ORDRE EST CELUI DE LA JOURNÉE, PAS CELUI DE LA `Map`. Une ligne qui
  // dirait « 159 au dîner, 182 au déjeuner » se lit comme deux faits sans
  // rapport ; dans l'ordre, elle se lit comme une journée. À moment égal, les
  // grappes gardent l'ordre de leurs jours.
  kept.sort((a, b) => slotOrderOf(a.slot) - slotOrderOf(b.slot));

  let daysVaried = 0;
  for (const [, values] of distinctMins) if (values.size > 1) daysVaried++;

  const counters = {
    slots: set.counters.slots,
    above_floor: kept.filter((d) => !d.redundantMin).length,
    days_varied: daysVaried,
    capped: kept.filter((d) => d.kcalPer100G === MAX_ASKABLE_DENSITY_PER_100G)
      .length,
    fixed_covered: set.counters.fixed_covered,
    floor_min_kept: kept.filter((d) => d.redundantMin).length,
    // ⚠️ SON SENS SE PRÉCISE ET NE CHANGE PAS : « combien de moments n'ont
    // aucune densité commune sur tous leurs jours ». Avant le lot B il comptait
    // les LIGNES rabattues sur leur plancher ; il compte maintenant les moments
    // qu'on a dû SÉPARER — ce que son commentaire d'origine annonçait déjà.
    empty_intersection: split,
    relaxed_days: set.counters.relaxed_days,
    relax_refused: set.counters.relax_refused,
  };
  return set.gapClosed === "restriction_floor"
    ? {
      named: [],
      floorOnly: kept,
      reason: set.reason,
      gapClosed: set.gapClosed,
      counters,
    }
    : {
      named: kept,
      floorOnly: [],
      reason: set.reason,
      gapClosed: set.gapClosed,
      counters,
    };
}

/**
 * L'ANCIENNE PORTE D'ENTRÉE, REBRANCHÉE SUR LE CONTRAT.
 *
 * ⛔ `rhythmSlots` EST LE PARAMÈTRE AJOUTÉ, ET IL EST REQUIS. Sans lui, cette
 * fonction déduisait le dénominateur de la GRILLE — c'est-à-dire donnait la
 * journée entière au dernier repas restant. Mesuré : `PERTE / 2026-09-11 /
 * dinner` à 2 454 kcal au lieu de 858,90, et le couloir [250–250] de ce
 * vendredi imposé aux dîners du samedi et du dimanche.
 *
 * ⚠️ ELLE NE PORTE PLUS D'ARITHMÉTIQUE. Elle construit le contrat et le plie ;
 * c'est le contrat qui fait autorité, et c'est lui que le dimensionnement lit.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function requiredDensityFor(args: {
  mouth: AnchorMouth;
  coachCounting: CountingStance;
  /** Jour → les moments que le PLAN couvre ce jour-là (la grille). */
  slotsByDay: ReadonlyMap<string, readonly string[]>;
  /**
   * ⟳ 2026-09-11 · LOT B — LE RYTHME ALIMENTAIRE COMPLET. `[]` = les trois
   * repas de la maison. ⛔ REQUIS : voir le pavé de `slotContractsFor`.
   */
  rhythmSlots: readonly string[];
  lightSlots: readonly string[];
  slotFixedKcalByDay: ReadonlyMap<string, ReadonlyMap<string, number>>;
  ageYears: number | null;
  floors: { normal: number; light: number };
}): RequiredDensity {
  const set = slotContractsFor({
    mouth: args.mouth,
    coachCounting: args.coachCounting,
    rhythmSlots: args.rhythmSlots,
    days: [...args.slotsByDay].map(([dayToken, slots]) => ({
      dayToken,
      // ⚠️ SANS CALENDRIER, LE JETON DE JOUR TIENT LIEU DE DATE. Cet appelant-ci
      // n'en a pas ; ceux qui en ont un passent par `slotContractsFor`.
      date: dayToken,
      coveredSlots: slots,
      lockedSlots: [],
      fixedKcalBySlot: args.slotFixedKcalByDay.get(dayToken) ?? null,
    })),
    lightSlots: args.lightSlots,
    ageYears: args.ageYears,
  });
  return requiredDensityFromContracts(set, args.floors);
}

export { HOUSE_DEFAULT_SLOTS };
export type { DensityIncompatibility };
