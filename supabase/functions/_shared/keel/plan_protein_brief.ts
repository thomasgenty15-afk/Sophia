/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLANCHER PROTÉIQUE, DIT AU MODÈLE **AVANT** LA PREMIÈRE GÉNÉRATION
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, ET IL EST MESURÉ SUR LA CAMPAGNE DU
 * 2026-09-11 (`docs/keel/CAMPAGNE-SIX-TIRS-2026-09-11.md`). **Quatre tirs sur
 * six** sortent sous le plancher protéique de leur bouche :
 *
 *   · tir 1 — −42 % et −43 % (deux journées) ;
 *   · tir 3 — −24 % et −18 % ;
 *   · tir 5 — −39 % et −30 % ;
 *   · tir 6 — −32 % sur le premier jour.
 *
 * La garde finale les COMPTE (`protein_floor_short`, `final_plan_gate.ts`) et
 * la livraison reste `deliverable_with_gaps`. Le nombre existait donc, et il
 * n'atteignait le modèle **à aucun moment** : ni avant qu'il compose, ni après.
 * Le prompt ne portait qu'une DENSITÉ par moment — une grandeur d'énergie, qui
 * ne dit rien de la protéine — et la ligne « a starch, a protein, a fat » du
 * bloc de recette, qui est exactement la « phrase vague » que le plan de
 * clôture interdit d'employer « comme substitut à la cible numérique
 * disponible » (§ C4, point 2).
 *
 * ── ⛔ AUCUN NOUVEAU BARÈME ───────────────────────────────────────────────
 * Rien n'est inventé ici. Les deux entrées viennent telles quelles de
 * `meal_envelope.ts::envelopeFor` (`proteinFloorG`, `proteinPerMealG`) et la
 * part couverte de `final_plan_audit.ts::proteinFloorAllocation` — **la même
 * fonction que la garde finale**, pour que la consigne et le contrôle ne
 * puissent pas diverger. Le seul calcul propre à ce fichier est une RÈGLE DE
 * TROIS : répartir le plancher de la journée couverte sur les cases couvertes
 * **au prorata de leur `composeKcal`**, c'est-à-dire exactement la clé que le
 * contrat utilise déjà pour l'énergie (`slot_nutrition_contract.ts`). Une
 * seconde clé de répartition serait un second barème ; celle-ci n'en est pas un.
 *
 * ── ⛔ ET LES PROTECTIONS INDIVIDUELLES NE BOUGENT PAS ────────────────────
 * Une enveloppe `per_portion` (plancher TCA, mineur protégé) rend
 * `dayFloorG: null` : `proteinFloorAllocation` répond `protected`, et ce module
 * **ne produit aucune ligne**. Aucun chiffre protéique ne paraît en face du nom
 * d'une bouche protégée — la même règle que `RequiredDensity.floorOnly`, pour
 * la même raison.
 *
 * ⚠️ CE MODULE NE PARLE À PERSONNE. PURE: no I/O, no clock, no randomness.
 */

import { proteinFloorAllocation } from "./final_plan_audit.ts";
import type { ProteinFloorReason } from "./final_plan_audit.ts";

/**
 * POURQUOI UNE BOUCHE N'A PAS DE LIGNE PROTÉIQUE. ⛔ VOCABULAIRE FERMÉ, et
 * chaque motif est COMPTÉ : « une valeur absente reste inconnue, jamais zéro »,
 * et une abstention muette est indiscernable d'un plancher atteint.
 */
export const PROTEIN_BRIEF_SILENCES = [
  /** L'enveloppe protège cette bouche : aucun chiffre en face de son nom. */
  "protected",
  /** Pas de corps lisible : on ne sait pas ce que cette bouche doit. */
  "no_body",
  /** Le contrat ne sait pas quelle part de la journée le plan couvre. */
  "coverage_unknown",
  /** Aucune case couverte à qui donner la part. */
  "no_covered_slot",
  /**
   * ⛔ LA PART EST CONNUE, SA RÉPARTITION NON. Au moins une case couverte n'a
   * pas de `composeKcal` : répartir au prorata d'un dénominateur troué
   * donnerait à l'autre case la protéine de celle qu'on ne sait pas peser.
   */
  "spread_unknown",
] as const;
export type ProteinBriefSilence = (typeof PROTEIN_BRIEF_SILENCES)[number];

/** Ce qu'une case couverte doit porter, en grammes de protéine, pour UNE part. */
export interface ProteinSlotAsk {
  readonly slot: string;
  /** Les jetons de jour que cette ligne couvre. Jamais vide. */
  readonly days: readonly string[];
  /** Grammes de protéine dans UNE part servie ici. Entier. */
  readonly gramsPerServing: number;
}

export interface ProteinMouthBrief {
  readonly memberId: string;
  /** Les cases, groupées par moment quand leur nombre est identique. */
  readonly slots: readonly ProteinSlotAsk[];
  /**
   * Le minimum par repas principal quand l'enveloppe en porte un
   * (`envelope.proteinPerMealG` — senior, entraînement). `null` sinon.
   */
  readonly perMealFloorG: number | null;
  /** Renseigné ⇔ `slots` est vide. Dit POURQUOI on s'est tu. */
  readonly silence: ProteinBriefSilence | null;
  /** Ce que la part couverte a répondu, par date. Pour le journal. */
  readonly byDate: readonly {
    readonly date: string;
    readonly dayToken: string;
    readonly coveredFloorG: number | null;
    readonly reason: ProteinFloorReason;
  }[];
}

/** Une journée couverte, telle que le contrat de créneau la connaît déjà. */
export interface ProteinBriefDay {
  readonly date: string;
  readonly dayToken: string;
  readonly dayTargetKcal: number | null;
  /** ⛔ LE BRUT, comme la garde finale. Voir `proteinFloorAllocation`. */
  readonly coveredBudgetGrossKcal: number | null;
  /** Les protéines des apports fixes de cette journée. `null` = inconnu. */
  readonly fixedProteinG: number | null;
  /** Par case couverte : ce qu'il reste à composer. `null` = illisible. */
  readonly slots: readonly { readonly slot: string; readonly composeKcal: number | null }[];
}

/**
 * LE PLANCHER PROTÉIQUE D'UNE BOUCHE, RÉPARTI SUR SES CASES COUVERTES.
 *
 * ⛔ LA RÉPARTITION EST CELLE DE L'ÉNERGIE, PAS UNE MOYENNE. Un petit-déjeuner
 * à 350 kcal et un dîner à 900 ne portent pas la même protéine ; couper le
 * plancher en parts égales mettrait 44 g dans un bol de flocons — c'est-à-dire
 * poserait une consigne intenable, et une consigne intenable apprend au modèle
 * que ces nombres-là sont décoratifs (cicatrice mesurée de ce dépôt : 389
 * demandés au dîner, 126,7 rendus).
 *
 * ⚠️ LES JOURNÉES SE FONDENT QUAND LEUR NOMBRE EST LE MÊME. Deux dîners à 55 g
 * font une ligne ; deux dîners à 55 et 71 g en font deux, chacune avec ses
 * jours — la règle exacte de `densityFragment` pour les couloirs, parce qu'un
 * brief qui répète cesse d'être lu et que « les cases concernées restent
 * identifiables » est une phrase du chantier.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function proteinBriefFor(args: {
  memberId: string;
  /** `envelope.proteinFloorG`. `null` = enveloppe `per_portion` ou sans corps. */
  dayFloorG: number | null;
  /** `envelope.proteinPerMealG`. `null` hors des cas qui le portent. */
  perMealFloorG: number | null;
  /** L'abstention de l'enveloppe, telle que la garde finale la nomme. */
  abstention: "none" | "protected" | "no_body";
  days: readonly ProteinBriefDay[];
}): ProteinMouthBrief {
  const byDate: {
    date: string;
    dayToken: string;
    coveredFloorG: number | null;
    reason: ProteinFloorReason;
  }[] = [];
  /** `slot` → grammes, par journée. Rempli seulement si TOUT est lisible. */
  const perDaySlots: { dayToken: string; slot: string; grams: number }[] = [];
  let silence: ProteinBriefSilence | null = null;

  for (const day of args.days) {
    const allocation = proteinFloorAllocation({
      dayFloorG: args.dayFloorG,
      perMealFloorG: args.perMealFloorG,
      abstention: args.abstention,
      coveredBudgetGrossKcal: day.coveredBudgetGrossKcal,
      dayTargetKcal: day.dayTargetKcal,
      fixedProteinG: day.fixedProteinG,
    });
    byDate.push({
      date: day.date,
      dayToken: day.dayToken,
      coveredFloorG: allocation.coveredFloorG,
      reason: allocation.reason,
    });
    const floor = allocation.coveredFloorG;
    if (floor === null || !(floor > 0)) {
      // ⛔ LE MOTIF DE LA GARDE FINALE EST REPRIS TEL QUEL. Le traduire ici
      // ferait deux vocabulaires pour un seul fait, et c'est celui qu'on relit
      // le moins qui finirait par décider.
      silence ??= allocation.reason === "protected"
        ? "protected"
        : allocation.reason === "coverage_unknown"
        ? "coverage_unknown"
        : "no_body";
      continue;
    }
    if (day.slots.length === 0) {
      silence ??= "no_covered_slot";
      continue;
    }
    // ⛔ UN SEUL TROU SUFFIT À FAIRE TAIRE LA JOURNÉE ENTIÈRE. Répartir sur les
    // cases lisibles seulement donnerait à celles-là la protéine de celle qu'on
    // ne sait pas peser — c'est-à-dire inventerait une exigence.
    let total = 0;
    let readable = true;
    for (const s of day.slots) {
      if (s.composeKcal === null || !Number.isFinite(s.composeKcal) || s.composeKcal < 0) {
        readable = false;
        break;
      }
      total += s.composeKcal;
    }
    if (!readable || !(total > 0)) {
      silence ??= "spread_unknown";
      continue;
    }
    for (const s of day.slots) {
      const share = (s.composeKcal as number) / total;
      const grams = Math.round(floor * share);
      // ⚠️ UNE CASE À ZÉRO GRAMME NE SE DIT PAS. Elle est déjà couverte par un
      // apport fixe (`composeKcal` à 0) : lui demander « au moins 0 g » est du
      // bruit, et le bruit dévalue les lignes qui l'entourent.
      if (grams <= 0) continue;
      perDaySlots.push({ dayToken: day.dayToken, slot: s.slot, grams });
    }
  }

  // ── LES GRAPPES: MÊME MOMENT, MÊME NOMBRE ⇒ UNE SEULE LIGNE ──────────────
  const clusters = new Map<string, { slot: string; grams: number; days: string[] }>();
  for (const row of perDaySlots) {
    const key = `${row.slot}|${row.grams}`;
    const seen = clusters.get(key);
    if (seen === undefined) {
      clusters.set(key, { slot: row.slot, grams: row.grams, days: [row.dayToken] });
    } else if (!seen.days.includes(row.dayToken)) {
      seen.days.push(row.dayToken);
    }
  }
  const slots: ProteinSlotAsk[] = [...clusters.values()]
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot) || a.grams - b.grams)
    .map((c) => ({ slot: c.slot, days: c.days, gramsPerServing: c.grams }));

  return {
    memberId: args.memberId,
    slots,
    // ⚠️ LE MINIMUM PAR REPAS NE SORT QUE S'IL Y A UNE LIGNE. Sans elle, la
    // bouche est protégée ou illisible — et un « jamais moins de 30 g » servi
    // seul serait un chiffre en face d'un nom qu'on venait de taire.
    perMealFloorG: slots.length === 0
      ? null
      : (args.perMealFloorG !== null && args.perMealFloorG > 0
        ? Math.round(args.perMealFloorG)
        : null),
    silence: slots.length === 0 ? (silence ?? "no_covered_slot") : null,
    byDate,
  };
}

/** L'ordre de la journée, le même que `densityFragment`. */
const SLOT_RANK: Readonly<Record<string, number>> = Object.freeze({
  breakfast: 0,
  morning_snack: 1,
  lunch: 2,
  afternoon_snack: 3,
  dinner: 4,
  evening_snack: 5,
});
function slotRank(slot: string): number {
  const v = SLOT_RANK[slot];
  return v === undefined ? 99 : v;
}

/**
 * LA LIGNE QUI PART SUR LA CARTE D'UNE BOUCHE.
 *
 * ⛔ « UNE PART SERVIE », PAS « CETTE PERSONNE ». La forme est celle que
 * `densityFragment` a fixée et qu'un test du prompt garde : on décrit ce que le
 * PLAT servi là doit porter, jamais un corps. v33 a retiré les corps du prompt
 * exprès ; une protéine par part est une propriété de l'assiette, au même titre
 * qu'une densité.
 *
 * ⛔ ET ON DIT COMMENT L'ATTEINDRE, PARCE QUE LE CONTRAIRE A ÉTÉ MESURÉ. « Une
 * contrainte qu'on énonce sans dire ce qu'elle INTERDIT est une contrainte
 * décorative » (`household_portions.ts`, trois fois). La phrase d'interdit vit
 * dans `PROTEIN_CONSEQUENCE`, servie une fois pour toute la table.
 *
 * Vide quand le brief est muet : rien à dire, on ne dit rien.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function proteinFragment(brief: ProteinMouthBrief | null): string {
  if (brief === null || brief.slots.length === 0) return "";
  const lignesParMoment = new Map<string, number>();
  for (const s of brief.slots) {
    lignesParMoment.set(s.slot, (lignesParMoment.get(s.slot) ?? 0) + 1);
  }
  const parts = brief.slots.map((s, i) => {
    const unit = i === 0 ? " g of protein" : " g";
    const jours = (lignesParMoment.get(s.slot) ?? 1) >= 2 && s.days.length > 0
      ? ` on ${[...s.days].join("/")}`
      : "";
    return `${s.gramsPerServing}${unit} in the ${s.slot} dish${jours}`;
  });
  const perMeal = brief.perMealFloorG === null
    ? ""
    : `, and no main dish under ${brief.perMealFloorG} g`;
  return ` — one serving here carries at least ${parts.join(", ")}${perMeal}`;
}

/**
 * CE QUE LA LIGNE PROTÉIQUE INTERDIT — servie UNE fois, et seulement si au
 * moins une bouche en porte une.
 *
 * ⛔ LES DEUX ÉCHAPPATOIRES SONT NOMMÉES LITTÉRALEMENT, parce que ce dépôt a
 * mesuré qu'une consigne dont l'échappatoire n'est pas nommée se fait satisfaire
 * par elle : « écris une recette standard » a rendu « une portion standard pour
 * Alex ». Ici les deux sorties faciles sont (a) servir une assiette plus grosse
 * et (b) empiler de la viande jusqu'au compte — et le plan de clôture interdit
 * la seconde en toutes lettres (« ne pas ajouter mécaniquement de la viande »).
 */
export const PROTEIN_CONSEQUENCE: readonly string[] = Object.freeze([
  "The protein figure is a property of the DISH, in grams, for one serving as",
  "served. Reach it by what the dish is MADE OF — meat, fish, eggs, dairy,",
  "legumes, or a denser mix of them — inside the same calories and the same",
  "cooked weight. Do NOT reach it by serving a bigger plate: the app decides how",
  "much each person is served, and a bigger plate breaks the energy target.",
  "Do NOT reach it by piling on meat either: swap or rebalance the components so",
  "the plate stays a plate.",
]);
